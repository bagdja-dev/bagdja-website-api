import { BadRequestException, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { randomBytes } from 'crypto';
import type { Queue } from 'bullmq';
import { DataSource, IsNull } from 'typeorm';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { GatheringOperation } from '../../entities/gathering-operation.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { Website } from '../../entities/website.entity';
import { MessagingService } from '../messaging/messaging.service';
import {
  GATHERING_OPERATIONS_QUEUE,
  ISSUE_GATHERING_TICKETS_JOB,
  OPERATION_ENQUEUE_TIMEOUT_MS,
} from './gathering-operations.constants';
import { gatheringTicketLink, gatheringTicketQrImageLink } from './gathering-links.util';

/** Token acak di QR tiket (24 byte, base64url = 32 karakter). */
export function generateAttendanceToken(): string {
  return randomBytes(24).toString('base64url');
}

/** Mulai acara dibuka sejak H-1 (24 jam sebelum jadwal) agar panitia bisa bersiap. */
const START_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface GatheringCheckInResult {
  result: 'CHECKED_IN' | 'ALREADY_CHECKED_IN';
  registration: {
    id: string;
    attendee_name: string;
    checked_in_at: Date;
    check_in_method: 'SCAN' | 'MANUAL';
  };
}

export interface GatheringTicketOperationSummary {
  operation_id: string;
  status: GatheringOperation['status'];
  total_count: number;
}

/**
 * Operasional hari-H gathering (plan event-registration §5.5):
 * tiket QR per seat lunas → mulai acara → check-in oleh staff tenant.
 * Pencairan dana ditangani `GatheringSettlementService`.
 */
@Injectable()
export class GatheringAttendanceService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly messagingService?: MessagingService,
    @Optional() @Inject(`BullQueue_${GATHERING_OPERATIONS_QUEUE}`) private readonly operationsQueue?: Queue,
  ) {}

  /** Admin tenant memulai acara: CONFIRMED → IN_PROGRESS, check-in dibuka. */
  async startGathering(groupId: string, websiteId: string) {
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering not found');
      if (group.status === 'IN_PROGRESS') return { id: group.id, status: group.status, started_at: group.started_at };
      if (group.status !== 'CONFIRMED') {
        throw new BadRequestException(`Only confirmed gatherings can be started (current: ${group.status})`);
      }
      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
      if (!occurrence.final_schedule || new Date(occurrence.final_schedule).getTime() - START_WINDOW_MS > Date.now()) {
        throw new BadRequestException('The gathering can be started from 24 hours before the event schedule');
      }
      group.status = 'IN_PROGRESS';
      group.started_at = new Date();
      occurrence.status = 'IN_PROGRESS';
      await manager.getRepository(WebsiteEventGroup).save(group);
      await manager.getRepository(GatheringOccurrence).save(occurrence);
      return { id: group.id, status: group.status, started_at: group.started_at };
    });
  }

  /**
   * Terbitkan token tiket untuk seat lunas dan antrekan email tiket ke yang belum terkirim.
   * Dipanggil otomatis setelah confirm, dan manual dari admin ("Kirim tiket").
   */
  async issueTickets(groupId: string, websiteId: string): Promise<GatheringTicketOperationSummary> {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: groupId, website_id: websiteId } });
    if (!group) throw new NotFoundException('Gathering not found');
    if (!['CONFIRMED', 'IN_PROGRESS'].includes(group.status)) {
      throw new BadRequestException(`Tickets can only be sent for confirmed gatherings (current: ${group.status})`);
    }
    const registrations = await this.ensureTokens(group);
    const pending = registrations.filter((registration) => !registration.ticket_email_sent_at);

    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.save(operationRepo.create({
      website_id: websiteId,
      group_id: group.id,
      initiator_user_id: group.initiator_user_id,
      kind: 'TICKET_ISSUANCE',
      status: pending.length ? 'QUEUED' : 'COMPLETED',
      total_count: pending.length,
      processed_count: 0,
      success_count: 0,
      failed_count: 0,
      failed_items: [],
      error_message: null,
    }));
    if (pending.length) {
      try {
        await this.enqueue(operation.id);
      } catch (cause) {
        operation.status = 'FAILED';
        operation.error_message = cause instanceof Error ? cause.message : 'Ticket job enqueue failed';
        operation.failed_count = pending.length;
        operation.failed_items = pending.map((registration) => registration.email);
        await operationRepo.save(operation);
      }
    }
    return { operation_id: operation.id, status: operation.status, total_count: operation.total_count };
  }

  async processTicketIssuance(operationId: string) {
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.findOne({ where: { id: operationId } });
    if (!operation || operation.kind !== 'TICKET_ISSUANCE') throw new NotFoundException('Ticket operation not found');
    if (['COMPLETED', 'FAILED'].includes(operation.status)) return operation;
    operation.status = 'RUNNING';
    operation.error_message = null;
    await operationRepo.save(operation);

    const [group, occurrence, website] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: operation.group_id, website_id: operation.website_id } }),
      this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { parent_order_id: operation.group_id, website_id: operation.website_id } }),
      this.dataSource.getRepository(Website).findOne({ where: { id: operation.website_id } }),
    ]);
    if (!group || !occurrence) {
      operation.status = 'FAILED';
      operation.error_message = 'Gathering plan or occurrence not found';
      await operationRepo.save(operation);
      return operation;
    }

    const registrations = (await this.ensureTokens(group)).filter((registration) => !registration.ticket_email_sent_at);
    operation.total_count = registrations.length;
    operation.processed_count = 0;
    operation.success_count = 0;
    operation.failed_count = 0;
    operation.failed_items = [];
    await operationRepo.save(operation);

    const finalOptions = (occurrence.option_groups_snapshot ?? [])
      .filter((option) => option.is_final_selection)
      .map((option) => String(option.label ?? option.option_key ?? ''))
      .filter(Boolean);
    for (const registration of registrations) {
      let sent = false;
      try {
        sent = Boolean(await this.messagingService?.sendEmail({
          to: registration.email,
          template: this.messagingService.gatheringAttendanceTicketTemplate,
          context: {
            'attendee-name': registration.attendee_name,
            'website-name': website?.name ?? 'Gathering',
            'plan-number': group.plan_number,
            'gathering-title': group.title,
            'event-date': occurrence.final_schedule
              ? new Date(occurrence.final_schedule).toLocaleString('id-ID', { dateStyle: 'full', timeStyle: 'short', timeZone: 'Asia/Jakarta' })
              : 'Sesuai informasi penyelenggara',
            'event-location': occurrence.final_location || 'Sesuai informasi penyelenggara',
            'final-options': finalOptions.join(', ') || '-',
            'ticket-link': gatheringTicketLink(website, registration.attendance_token as string),
            'ticket-qr-image': gatheringTicketQrImageLink(website, registration.attendance_token as string),
          },
        }));
      } catch (error) {
        operation.error_message = error instanceof Error ? error.message : 'Ticket email delivery failed';
      }
      operation.processed_count += 1;
      if (sent) {
        registration.ticket_email_sent_at = new Date();
        await this.dataSource.getRepository(WebsiteEventRegistration).save(registration);
        operation.success_count += 1;
      } else {
        operation.failed_count += 1;
        operation.failed_items = [...operation.failed_items, registration.email];
        operation.error_message ??= 'Messaging service rejected one or more ticket emails. Check the GatheringAttendanceTicket template and delivery logs.';
      }
      await operationRepo.save(operation);
    }
    operation.status = operation.failed_count ? 'FAILED' : 'COMPLETED';
    await operationRepo.save(operation);
    return operation;
  }

  /** Data publik tiket untuk halaman renderer — tanpa email/WhatsApp peserta. */
  async getPublicTicket(token: string) {
    const registration = await this.findByToken(token);
    if (!registration) throw new NotFoundException('Ticket not found');
    const [group, occurrence, website] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: registration.group_id, website_id: registration.website_id } }),
      this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { id: registration.occurrence_id, website_id: registration.website_id } }),
      this.dataSource.getRepository(Website).findOne({ where: { id: registration.website_id } }),
    ]);
    if (!group || !occurrence) throw new NotFoundException('Ticket not found');
    const valid = registration.registration_status === 'RSVP_CONFIRMED'
      && registration.payment_status === 'PAID'
      && ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'].includes(group.status);
    return {
      attendee_name: registration.attendee_name,
      gathering_title: group.title,
      plan_number: group.plan_number,
      website_name: website?.name ?? null,
      event_date: occurrence.final_schedule ?? null,
      event_location: occurrence.final_location ?? null,
      gathering_status: group.status,
      ticket_status: !valid ? 'INVALID' : registration.checked_in_at ? 'CHECKED_IN' : 'VALID',
      checked_in_at: registration.checked_in_at,
      ticket_url: gatheringTicketLink(website, token),
    };
  }

  /**
   * Check-in lewat scan QR (`token`) atau manual (`registrationId`). Hanya saat acara
   * IN_PROGRESS dan untuk seat lunas di acara ini. Scan ulang tidak menimpa check-in pertama.
   */
  async checkIn(
    groupId: string,
    websiteId: string,
    staffUserId: string,
    input: { token?: string; registrationId?: string },
  ): Promise<GatheringCheckInResult> {
    const token = input.token?.trim();
    if (!token && !input.registrationId) throw new BadRequestException('Provide a ticket token or registration id');
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({ where: { id: groupId, website_id: websiteId } });
      if (!group) throw new NotFoundException('Gathering not found');
      if (group.status !== 'IN_PROGRESS') {
        throw new BadRequestException('Check-in is only open while the gathering is in progress');
      }
      const registration = await manager.getRepository(WebsiteEventRegistration).findOne({
        where: token
          ? { attendance_token: token, group_id: group.id, website_id: websiteId }
          : { id: input.registrationId, group_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registration) throw new NotFoundException('Ticket is not registered for this gathering');
      if (registration.registration_status !== 'RSVP_CONFIRMED' || registration.payment_status !== 'PAID') {
        throw new BadRequestException(`${registration.attendee_name} does not have a paid seat for this gathering`);
      }
      if (registration.checked_in_at) {
        return {
          result: 'ALREADY_CHECKED_IN',
          registration: {
            id: registration.id,
            attendee_name: registration.attendee_name,
            checked_in_at: registration.checked_in_at,
            check_in_method: registration.check_in_method ?? 'SCAN',
          },
        };
      }
      registration.checked_in_at = new Date();
      registration.checked_in_by_user_id = staffUserId;
      registration.check_in_method = token ? 'SCAN' : 'MANUAL';
      await manager.getRepository(WebsiteEventRegistration).save(registration);
      return {
        result: 'CHECKED_IN',
        registration: {
          id: registration.id,
          attendee_name: registration.attendee_name,
          checked_in_at: registration.checked_in_at,
          check_in_method: registration.check_in_method,
        },
      };
    });
  }

  private async findByToken(token: string) {
    if (!/^[A-Za-z0-9_-]{16,64}$/.test(token)) return null;
    return this.dataSource.getRepository(WebsiteEventRegistration).findOne({ where: { attendance_token: token } });
  }

  /** Seat lunas tanpa token mendapat token baru; mengembalikan semua seat lunas. */
  private async ensureTokens(group: WebsiteEventGroup) {
    const repo = this.dataSource.getRepository(WebsiteEventRegistration);
    const missing = await repo.find({
      where: {
        group_id: group.id,
        website_id: group.website_id,
        registration_status: 'RSVP_CONFIRMED',
        payment_status: 'PAID',
        attendance_token: IsNull(),
      },
    });
    for (const registration of missing) {
      registration.attendance_token = generateAttendanceToken();
      registration.ticket_issued_at = new Date();
    }
    if (missing.length) await repo.save(missing);
    return repo.find({
      where: { group_id: group.id, website_id: group.website_id, registration_status: 'RSVP_CONFIRMED', payment_status: 'PAID' },
      order: { created_at: 'ASC' },
    });
  }

  private async enqueue(operationId: string) {
    if (!this.operationsQueue) throw new Error('Gathering operations queue is unavailable');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        this.operationsQueue.add(ISSUE_GATHERING_TICKETS_JOB, { operationId }, {
          jobId: `gathering-tickets-${operationId}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        }),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out while queueing ticket emails')), OPERATION_ENQUEUE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
}
