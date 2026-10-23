import { BadGatewayException, BadRequestException, ConflictException, HttpException, HttpStatus, Inject, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, EntityManager, In, IsNull, MoreThan, Not } from 'typeorm';
import type { JobsOptions, Queue } from 'bullmq';

import type { AuthUser } from '../../common/auth';
import { MessagingService } from '../messaging/messaging.service';
import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventInvitation } from '../../entities/website-event-invitation.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { WebsiteEventRsvpChallenge } from '../../entities/website-event-rsvp-challenge.entity';
import { WebsiteEventProductOption } from '../../entities/website-event-product-option.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteTransaction } from '../../entities/website-transaction.entity';
import { WebsiteProduct } from '../../entities/website-product.entity';
import { Website } from '../../entities/website.entity';
import { User } from '../../entities/user.entity';
import { EscrowClientService } from '../escrow/escrow-client.service';
import { normalizeEscrowStatus } from '../escrow/escrow-status.util';

import { assertUniformGatheringOptionConfig } from '../products/gathering-product-options.validation';
import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import { CreateGatheringInvitationDto } from './dto/create-gathering-invitation.dto';
import { UpdateGatheringInvitationDto } from './dto/update-gathering-invitation.dto';
import { UpdateGatheringInvitationContentDto } from './dto/update-gathering-invitation-content.dto';
import { SubmitGatheringRsvpDto } from './dto/submit-gathering-rsvp.dto';
import { SubmitPrivateGatheringRsvpDto } from './dto/submit-private-gathering-rsvp.dto';
import type { GatheringOrderMeta } from './gathering-order.util';
import { VerifyGatheringRsvpOtpDto } from './dto/verify-gathering-rsvp-otp.dto';
import { RejectGatheringRegistrationsDto } from './dto/reject-gathering-registrations.dto';
import { GatheringOperation } from '../../entities/gathering-operation.entity';
import type { ConfirmGatheringEventDto } from './dto/confirm-gathering-event.dto';
import {
  DISPATCH_GATHERING_INVITATIONS_JOB,
  GATHERING_OPERATIONS_QUEUE,
  ISSUE_GATHERING_INVOICES_JOB,
  OPERATION_ENQUEUE_TIMEOUT_MS,
  QUEUED_OPERATION_STALE_MS,
  REVOKE_GATHERING_INVITATION_JOB,
  RUNNING_OPERATION_STALE_MS,
} from './gathering-operations.constants';
import { GatheringSettlementService } from './gathering-settlement.service';
import { GatheringAttendanceService } from './gathering-attendance.service';

/** Hasil penyelesaian checkout seat saat gathering dibatalkan. */
type SeatCancelSettlement = 'REFUNDED' | 'CHECKOUT_CANCELLED';

@Injectable()
export class GatheringOccurrenceService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly messagingService?: MessagingService,
    @Optional() private readonly escrowClient?: EscrowClientService,
    @Optional() @Inject(`BullQueue_${GATHERING_OPERATIONS_QUEUE}`) private readonly operationsQueue?: Queue,
    @Optional() private readonly settlementService?: GatheringSettlementService,
    @Optional() private readonly attendanceService?: GatheringAttendanceService,
  ) {}

  /**
   * "Rencanakan Gathering" — rencana masuk cart initiator sebagai order
   * rencana (`website_orders` PENDING, quantity 0, tanpa seat) dengan group +
   * occurrence PREORDER yang menempel ke order itu, dalam satu transaksi.
   * Order rencana tidak pernah di-checkout; seat peserta (termasuk initiator
   * bila ikut hadir) dibuat terpisah sebagai order anak lewat `parent_order_id`.
   */
  async createPlan(initiator: AuthUser, dto: CreateGatheringPlanDto) {
    const initiatorUserId = initiator.userId;
    return this.dataSource.transaction(async (manager) => {
      const product = await manager.getRepository(WebsiteProduct).findOne({
        where: { id: dto.product_id, website_id: dto.website_id },
      });
      if (!product) throw new NotFoundException('Gathering product not found');
      if (product.type !== 'gathering' || !product.is_active) {
        throw new BadRequestException('Gathering product is not available');
      }

      const options = await manager.getRepository(WebsiteEventProductOption).find({
        where: { website_id: dto.website_id, product_id: product.id, is_active: true },
        order: { option_group_key: 'ASC', sort_order: 'ASC', label: 'ASC' },
      });
      if (options.length === 0) throw new BadRequestException('Gathering product has no active options');

      assertUniformGatheringOptionConfig(options.map((option) => ({
        price_per_seat: Number(option.price_per_seat),
        deposit_amount_per_seat: Number(option.deposit_amount_per_seat ?? 0),
        currency: option.currency,
        min_attendees: option.min_attendees,
        max_attendees: option.max_attendees,
        cancellation_policy: option.cancellation_policy,
      })));
      const firstOption = options[0];
      if (Number(product.price) !== Number(firstOption.price_per_seat)) {
        throw new BadRequestException('Gathering product price does not match its active options');
      }

      const title = dto.title?.trim() || `Rencana ${product.name}`;
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.save(groups.create({
        website_id: dto.website_id,
        product_id: product.id,
        initiator_user_id: initiatorUserId,
        title,
        status: 'PREORDER',
        invite_policy: dto.invite_policy ?? 'OPEN',
        workflow_step: 'PLAN',
      }));

      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.save(occurrenceRepo.create({
        website_id: dto.website_id,
        product_id: product.id,
        parent_order_id: group.id,
        initiator_user_id: initiatorUserId,
        title,
        status: 'PREORDER',
        price_per_seat: Number(firstOption.price_per_seat),
        deposit_amount_per_seat: Number(firstOption.deposit_amount_per_seat ?? 0),
        currency: firstOption.currency,
        min_attendees: firstOption.min_attendees,
        max_attendees: firstOption.max_attendees,
        cancellation_policy_snapshot: { ...firstOption.cancellation_policy },
        option_groups_snapshot: options.map((option) => ({
          product_option_id: option.id,
          option_group_key: option.option_group_key,
          option_key: option.option_key,
          label: option.label,
          description: option.description,
          availability_window: option.availability_window,
          venue_location: option.venue_location,
          benefits: option.benefits,
        })),
        opened_option_ids_snapshot: options.map((option) => option.id),
      }));

      const orders = manager.getRepository(WebsiteOrder);
      const gatheringMeta: GatheringOrderMeta = { role: 'initiator', group_id: group.id, occurrence_id: occurrence.id };
      const planOrder = await orders.save(orders.create({
        website_id: dto.website_id,
        product_id: product.id,
        location_id: null,
        buyer_user_id: initiatorUserId,
        buyer_identifier: initiator.email ?? initiator.username ?? null,
        quantity: 0,
        unit_price: Number(firstOption.price_per_seat),
        total_amount: 0,
        currency: firstOption.currency,
        payment_mode: resolvePaymentMode(product),
        status: 'PENDING',
        parent_order_id: null,
        metadata: { source: 'gathering_plan', gathering: gatheringMeta },
      }));

      group.order_id = planOrder.id;
      await groups.save(group);

      const [planNumberRow] = await manager.query(
        'SELECT plan_number FROM website_event_groups WHERE id = $1',
        [group.id],
      );
      if (!planNumberRow?.plan_number) {
        throw new Error('Gathering plan number was not generated');
      }

      return { ...group, plan_number: planNumberRow.plan_number, occurrence };
    });
  }

  async findPlanForInitiator(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');

    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!occurrence) throw new NotFoundException('Gathering plan not found');
    const votingResults = await this.getVotingResults(
      occurrence,
      this.dataSource.getRepository(WebsiteEventRegistration),
    );
    return { ...group, occurrence: { ...occurrence, voting_results: votingResults } };
  }

  async listPlansForInitiator(websiteId: string, initiatorUserId: string) {
    const groups = await this.dataSource.getRepository(WebsiteEventGroup).find({
      where: { website_id: websiteId, initiator_user_id: initiatorUserId },
      order: { created_at: 'DESC' },
    });
    if (groups.length === 0) return [];

    const occurrences = await this.dataSource.getRepository(GatheringOccurrence).find({
      where: {
        website_id: websiteId,
        initiator_user_id: initiatorUserId,
        parent_order_id: In(groups.map((group) => group.id)),
      },
    });
    const occurrenceByGroupId = new Map(occurrences.map((occurrence) => [occurrence.parent_order_id, occurrence]));
    return groups.flatMap((group) => {
      const occurrence = occurrenceByGroupId.get(group.id);
      return occurrence ? [{ ...group, occurrence }] : [];
    });
  }

  async updatePlanForInitiator(
    groupId: string,
    websiteId: string,
    initiatorUserId: string,
    dto: UpdateGatheringPlanDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
      });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.workflow_step !== 'PLAN' && !dto.reopen_planning) {
        throw new BadRequestException('Plan settings are locked after stage 1 is submitted');
      }
      if (dto.reopen_planning && group.workflow_step !== 'INVITATIONS') {
        throw new BadRequestException('Planning can only be reopened before invitations are submitted');
      }

      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.findOne({
        where: { parent_order_id: group.id, website_id: websiteId, initiator_user_id: initiatorUserId },
      });
      if (!occurrence) throw new NotFoundException('Gathering plan not found');

      if (dto.title !== undefined) {
        const title = dto.title.trim();
        if (title.length < 3) throw new BadRequestException('title must contain at least 3 non-space characters');
        group.title = title;
        occurrence.title = title;
      }
      if (dto.invite_policy !== undefined) group.invite_policy = dto.invite_policy;
      if (dto.opened_option_ids !== undefined) {
        const availableOptionIds = new Set(
          occurrence.option_groups_snapshot.map((option) => String(option.product_option_id)),
        );
        const uniqueIds = new Set(dto.opened_option_ids);
        if (uniqueIds.size !== dto.opened_option_ids.length) {
          throw new BadRequestException('Opened gathering option IDs must be unique');
        }
        if (dto.opened_option_ids.some((id) => !availableOptionIds.has(id))) {
          throw new BadRequestException('Opened gathering options must belong to the product snapshot');
        }
        occurrence.opened_option_ids_snapshot = dto.opened_option_ids;
      }

      const reservationDeadline = dto.reservation_deadline
        ? new Date(dto.reservation_deadline)
        : occurrence.rsvp_close_at ?? null;
      const paymentDeadline = dto.payment_deadline
        ? new Date(dto.payment_deadline)
        : occurrence.payment_deadline ?? null;
      const eventAt = dto.event_at
        ? new Date(dto.event_at)
        : occurrence.final_schedule ? new Date(occurrence.final_schedule) : null;

      if (dto.reservation_deadline !== undefined) occurrence.rsvp_close_at = reservationDeadline ?? undefined;
      if (dto.payment_deadline !== undefined) occurrence.payment_deadline = paymentDeadline ?? undefined;
      if (dto.event_at !== undefined) occurrence.final_schedule = eventAt;

      if (dto.submit_plan) {
        if (group.workflow_step !== 'PLAN' && !dto.reopen_planning) {
          throw new BadRequestException('Plan settings have already been submitted');
        }
        if (!reservationDeadline || !paymentDeadline || !eventAt) {
          throw new BadRequestException('Reservation deadline, payment deadline, and event date are required before opening RSVP');
        }
        if (reservationDeadline <= new Date()) {
          throw new BadRequestException('Reservation deadline must be in the future');
        }
        if (paymentDeadline < reservationDeadline) {
          throw new BadRequestException('Payment deadline must be on or after reservation deadline');
        }
        if (eventAt < paymentDeadline) {
          throw new BadRequestException('Event date must be on or after payment deadline');
        }
        group.workflow_step = 'INVITATIONS';
      }
      if (dto.reopen_planning) group.workflow_step = 'PLAN';

      await groups.save(group);
      await occurrenceRepo.save(occurrence);
      return { ...group, occurrence };
    });
  }

  async createInvitation(
    groupId: string,
    websiteId: string,
    initiatorUserId: string,
    dto: CreateGatheringInvitationDto,
  ) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (!['PREORDER', 'RSVP_OPEN'].includes(group.status)) {
      throw new BadRequestException('Invitations can only be created during PREORDER or RSVP_OPEN');
    }
    if (group.workflow_step !== 'INVITATIONS') {
      throw new BadRequestException('Submit plan settings before managing invitations');
    }
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId },
    });
    if (!occurrence) throw new NotFoundException('Gathering plan not found');

    const email = dto.email?.trim().toLowerCase() || null;
    const whatsapp = dto.whatsapp?.replace(/[\s().-]/g, '') || null;
    if (!email && !whatsapp) {
      throw new BadRequestException('Provide an email address or WhatsApp number');
    }
    if (whatsapp && !/^\+?[0-9]{8,20}$/.test(whatsapp)) {
      throw new BadRequestException('WhatsApp number must contain 8 to 20 digits and an optional leading +');
    }

    const invitations = this.dataSource.getRepository(WebsiteEventInvitation);
    if (email || whatsapp) {
      const existingInvitations = await invitations.find({
        where: [
          ...(email ? [{ group_id: group.id, email, status: 'PENDING' as const }] : []),
          ...(whatsapp ? [{ group_id: group.id, whatsapp, status: 'PENDING' as const }] : []),
        ],
      });
      const now = new Date();
      if (existingInvitations.some((invitation) => invitation.expires_at > now)) {
        throw new ConflictException('An active invitation already exists for this contact');
      }
      const expiredInvitations = existingInvitations.filter((invitation) => invitation.expires_at <= now);
      for (const invitation of expiredInvitations) {
        invitation.status = 'EXPIRED';
      }
      if (expiredInvitations.length) await invitations.save(expiredInvitations);
    }

    const invitationId = randomUUID();
    const invitation = await invitations.save(invitations.create({
      id: invitationId,
      website_id: websiteId,
      group_id: group.id,
      invitee_name: dto.invitee_name?.trim() || null,
      email,
      whatsapp,
      token_hash: createHash('sha256').update(invitationId).digest('hex'),
      status: 'PENDING',
      email_delivery_status: email ? 'NOT_SENT' : 'MANUAL',
      max_uses: 1,
      use_count: 0,
      expires_at: occurrence.rsvp_close_at && occurrence.rsvp_close_at > new Date()
        ? occurrence.rsvp_close_at
        : new Date(Date.now() + (dto.expires_in_days ?? 7) * 24 * 60 * 60 * 1000),
      revoked_at: null,
    }));

    const { token_hash: _tokenHash, ...safeInvitation } = invitation;
    return safeInvitation;
  }

  async updateInvitation(
    groupId: string,
    invitationId: string,
    websiteId: string,
    initiatorUserId: string,
    dto: UpdateGatheringInvitationDto,
  ) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (group.workflow_step !== 'INVITATIONS' || !['PREORDER', 'RSVP_OPEN'].includes(group.status)) {
      throw new BadRequestException('Invitations can only be edited during the invitations stage');
    }

    const invitations = this.dataSource.getRepository(WebsiteEventInvitation);
    const invitation = await invitations.findOne({
      where: { id: invitationId, group_id: group.id, website_id: websiteId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING' || invitation.use_count > 0) {
      throw new BadRequestException('Only unused pending invitations can be edited');
    }

    const email = dto.email === undefined ? invitation.email : dto.email.trim().toLowerCase() || null;
    const whatsapp = dto.whatsapp === undefined ? invitation.whatsapp : dto.whatsapp.replace(/[\s().-]/g, '') || null;
    if (!email && !whatsapp) {
      throw new BadRequestException('Provide an email address or WhatsApp number');
    }
    if (whatsapp && !/^\+?[0-9]{8,20}$/.test(whatsapp)) {
      throw new BadRequestException('WhatsApp number must contain 8 to 20 digits and an optional leading +');
    }

    const existingInvitations = await invitations.find({
      where: [
        ...(email ? [{ group_id: group.id, email, status: 'PENDING' as const }] : []),
        ...(whatsapp ? [{ group_id: group.id, whatsapp, status: 'PENDING' as const }] : []),
      ],
    });
    const now = new Date();
    if (existingInvitations.some((item) => (
      item.id !== invitation.id && item.expires_at > now
    ))) {
      throw new ConflictException('An active invitation already exists for this contact');
    }

    const emailChanged = invitation.email !== email;
    if (dto.invitee_name !== undefined) invitation.invitee_name = dto.invitee_name.trim() || null;
    invitation.email = email;
    invitation.whatsapp = whatsapp;
    if (emailChanged) {
      invitation.email_delivery_status = email ? 'NOT_SENT' : 'MANUAL';
      invitation.email_sent_at = null;
      invitation.delivery_error = null;
    }

    const saved = await invitations.save(invitation);
    const { token_hash: _tokenHash, ...safeInvitation } = saved;
    return safeInvitation;
  }

  async updateInvitationContent(
    groupId: string,
    websiteId: string,
    initiatorUserId: string,
    dto: UpdateGatheringInvitationContentDto,
  ) {
    return this.dataSource.transaction(async (manager) => {
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.workflow_step !== 'INVITATIONS' || !['PREORDER', 'RSVP_OPEN'].includes(group.status)) {
        throw new BadRequestException('Invitation content can only be edited during the invitations stage');
      }

      if (dto.invitation_banner_url !== undefined) {
        group.invitation_banner_url = dto.invitation_banner_url?.trim() || null;
      }
      if (dto.invitation_description !== undefined) {
        group.invitation_description = dto.invitation_description?.trim() || null;
      }
      return groups.save(group);
    });
  }

  async assertCanUploadInvitationBanner(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (group.workflow_step !== 'INVITATIONS' || !['PREORDER', 'RSVP_OPEN'].includes(group.status)) {
      throw new BadRequestException('Invitation banner can only be uploaded during the invitations stage');
    }
  }

  async submitInvitationStage(groupId: string, websiteId: string, initiatorUserId: string) {
    const groups = this.dataSource.getRepository(WebsiteEventGroup);
    const group = await groups.findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (group.workflow_step !== 'INVITATIONS') {
      throw new BadRequestException('Gathering plan is not in the invitation stage');
    }

    const occurrenceRepo = this.dataSource.getRepository(GatheringOccurrence);
    const occurrence = await occurrenceRepo.findOne({ where: { parent_order_id: group.id, website_id: websiteId } });
    if (!occurrence) throw new NotFoundException('Gathering plan not found');
    const invitations = this.dataSource.getRepository(WebsiteEventInvitation);
    let publicInvitation: WebsiteEventInvitation | null = null;

    if (group.invite_policy === 'OPEN') {
      publicInvitation = await invitations.findOne({
        where: { group_id: group.id, website_id: websiteId, email: null, whatsapp: null, status: 'PENDING' },
      });
      if (!publicInvitation || publicInvitation.expires_at <= new Date()) {
        if (publicInvitation) {
          publicInvitation.status = 'EXPIRED';
          await invitations.save(publicInvitation);
        }
        const invitationId = randomUUID();
        publicInvitation = await invitations.save(invitations.create({
          id: invitationId,
          website_id: websiteId,
          group_id: group.id,
          invitee_name: null,
          email: null,
          whatsapp: null,
          token_hash: createHash('sha256').update(invitationId).digest('hex'),
          status: 'PENDING',
          email_delivery_status: 'MANUAL',
          max_uses: occurrence.max_attendees,
          use_count: 0,
          expires_at: occurrence.rsvp_close_at && occurrence.rsvp_close_at > new Date()
            ? occurrence.rsvp_close_at
            : new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          revoked_at: null,
          email_sent_at: null,
          delivery_error: null,
        }));
      }
    } else {
      const pendingInvitations = await invitations.find({
        where: { group_id: group.id, website_id: websiteId, status: 'PENDING' },
      });
      if (pendingInvitations.length === 0) {
        throw new BadRequestException('Tambahkan setidaknya satu penerima undangan sebelum submit');
      }
      const pendingEmails = pendingInvitations.filter((invitation) => (
        Boolean(invitation.email) && invitation.email_delivery_status !== 'SENT'
      ));
      if (pendingEmails.length > 0) {
        const operationRepo = this.dataSource.getRepository(GatheringOperation);
        const existingOperation = await operationRepo.findOne({
          where: {
            group_id: group.id,
            website_id: websiteId,
            initiator_user_id: initiatorUserId,
            kind: 'INVITATION_DISPATCH',
            status: In(['QUEUED', 'RUNNING']),
          },
        });
        // Operasi macet ditandai FAILED supaya submit ini membuat job baru,
        // bukan mengembalikan operasi yang tidak akan pernah selesai.
        const activeOperation = existingOperation ? await this.failStalledOperation(existingOperation) : null;
        if (activeOperation && ['QUEUED', 'RUNNING'].includes(activeOperation.status)) {
          return {
            submitted: true,
            workflow_step: group.workflow_step,
            operation_id: activeOperation.id,
            operation_status: activeOperation.status,
            total_count: activeOperation.total_count,
            processed_count: activeOperation.processed_count,
            success_count: activeOperation.success_count,
            failed_count: activeOperation.failed_count,
            failed_items: activeOperation.failed_items,
            error_message: activeOperation.error_message,
          };
        }

        const operation = await operationRepo.save(operationRepo.create({
          website_id: websiteId,
          group_id: group.id,
          initiator_user_id: initiatorUserId,
          kind: 'INVITATION_DISPATCH',
          status: 'QUEUED',
          total_count: pendingEmails.length,
          processed_count: 0,
          success_count: 0,
          failed_count: 0,
          failed_items: [],
          error_message: null,
        }));
        try {
          await this.enqueueOperationJob(DISPATCH_GATHERING_INVITATIONS_JOB, { operationId: operation.id }, {
            jobId: `gathering-invitations-${operation.id}`,
            attempts: 3,
            backoff: { type: 'exponential', delay: 3000 },
            removeOnComplete: 1000,
            removeOnFail: 5000,
          });
        } catch (cause) {
          operation.status = 'FAILED';
          operation.failed_count = pendingEmails.length;
          operation.failed_items = pendingEmails.map((invitation) => invitation.email as string);
          operation.error_message = cause instanceof Error ? cause.message : 'Invitation email job enqueue failed';
          await operationRepo.save(operation);
        }
        return {
          submitted: true,
          workflow_step: group.workflow_step,
          operation_id: operation.id,
          operation_status: operation.status,
          total_count: operation.total_count,
          processed_count: operation.processed_count,
          success_count: operation.success_count,
          failed_count: operation.failed_count,
          failed_items: operation.failed_items,
          error_message: operation.error_message,
        };
      }
    }

    group.workflow_step = 'INVITATION_CONFIRMATION';
    group.status = 'RSVP_OPEN';
    group.invitation_submitted_at = new Date();
    occurrence.status = 'RSVP_OPEN';
    await groups.save(group);
    await occurrenceRepo.save(occurrence);

    const result: Record<string, unknown> = { submitted: true, workflow_step: group.workflow_step };
    if (publicInvitation) result.public_invitation = this.toPublicInvitation(publicInvitation);
    return result;
  }

  /**
   * Base URL publik tenant, sudah termasuk segmen slug bila path-routed.
   * `SITE_APP_URL` hanya dipakai untuk dev lokal (`http://localhost:5005/{slug}`);
   * di luar itu selalu custom domain terverifikasi atau `{slug}.{PLATFORM_HOST}`,
   * konsisten dengan `resolveWebsiteAppUrl` di TransactionsService. Jangan
   * pakai `SITE_APP_URL` non-lokal sebagai base: `sites.bagdja.com/{slug}/...`
   * di-redirect middleware renderer ke subdomain dan link jadi rusak.
   */
  private tenantBaseUrl(website?: Website | null) {
    const platformHost = (process.env.PLATFORM_HOST || 'sites.bagdja.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    const websiteDomain = website?.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (websiteDomain && website?.domain_verified_at && websiteDomain.toLowerCase() !== platformHost.toLowerCase()) {
      return `https://${websiteDomain}`;
    }
    const siteAppUrl = (process.env.SITE_APP_URL || 'http://localhost:5005').replace(/\/$/, '');
    if (process.env.NODE_ENV !== 'production' && /localhost|127\.0\.0\.1/.test(siteAppUrl)) {
      return website?.slug ? `${siteAppUrl}/${website.slug}` : siteAppUrl;
    }
    return `https://${website?.slug ?? ''}.${platformHost}`;
  }

  private invitationLink(website: Website | null | undefined, invitationId: string, isPrivate = false) {
    const privatePath = isPrivate ? '/id' : '';
    return `${this.tenantBaseUrl(website)}/gathering/invite${privatePath}/${encodeURIComponent(invitationId)}`;
  }

  private async getInitiatorName(initiatorUserId: string) {
    const initiator = await this.dataSource.getRepository(User).findOne({
      where: { id: initiatorUserId },
      select: { name: true, username: true },
    });
    return initiator?.name?.trim() || initiator?.username?.trim() || 'Penyelenggara gathering';
  }

  private toPublicInvitation(invitation: WebsiteEventInvitation) {
    const { token_hash: _tokenHash, ...safeInvitation } = invitation;
    return safeInvitation;
  }

  async listInvitations(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    const invitations = await this.dataSource.getRepository(WebsiteEventInvitation).find({
      where: { group_id: group.id, website_id: websiteId },
      order: { created_at: 'DESC' },
    });
    return invitations.map(({ token_hash: _tokenHash, ...invitation }) => invitation);
  }

  async getActiveInvitationDispatch(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');

    const latestOperation = await this.dataSource.getRepository(GatheringOperation).findOne({
      where: {
        group_id: group.id,
        website_id: websiteId,
        initiator_user_id: initiatorUserId,
        kind: 'INVITATION_DISPATCH',
        status: In(['QUEUED', 'RUNNING']),
      },
      order: { created_at: 'DESC' },
    });
    const checkedOperation = latestOperation ? await this.failStalledOperation(latestOperation) : null;
    const operation = checkedOperation && ['QUEUED', 'RUNNING'].includes(checkedOperation.status) ? checkedOperation : null;
    return {
      operation: operation ? {
        id: operation.id,
        kind: operation.kind,
        status: operation.status,
        total_count: operation.total_count,
        processed_count: operation.processed_count,
        success_count: operation.success_count,
        failed_count: operation.failed_count,
        failed_items: operation.failed_items,
        error_message: operation.error_message,
      } : null,
    };
  }

  async revokeInvitation(
    groupId: string,
    invitationId: string,
    websiteId: string,
    initiatorUserId: string,
  ) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');

    const invitations = this.dataSource.getRepository(WebsiteEventInvitation);
    const invitation = await invitations.findOne({
      where: { id: invitationId, group_id: group.id, website_id: websiteId },
    });
    if (!invitation) throw new NotFoundException('Invitation not found');
    if (invitation.status !== 'PENDING') throw new BadRequestException('Only pending invitations can be revoked');
    invitation.status = 'REVOKED';
    invitation.revoked_at = new Date();
    const saved = await invitations.save(invitation);
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.save(operationRepo.create({
      website_id: websiteId,
      group_id: groupId,
      initiator_user_id: initiatorUserId,
      kind: 'INVITATION_REVOCATION',
      status: 'QUEUED',
      total_count: 1,
      processed_count: 0,
      success_count: 0,
      failed_count: 0,
      failed_items: [],
      error_message: null,
    }));
    try {
      await this.enqueueOperationJob(REVOKE_GATHERING_INVITATION_JOB, { operationId: operation.id, invitationId }, {
        jobId: `gathering-revoke-${operation.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 3000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (cause) {
      operation.status = 'FAILED';
      operation.failed_count = 1;
      operation.failed_items = [invitationId];
      operation.error_message = cause instanceof Error ? cause.message : 'Queue unavailable';
      await operationRepo.save(operation);
    }
    const { token_hash: _tokenHash, ...safeInvitation } = saved;
    return { invitation: safeInvitation, operation_id: operation.id, operation_status: operation.status };
  }

  async rotateInvitationLink(
    groupId: string,
    invitationId: string,
    websiteId: string,
    initiatorUserId: string,
  ) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (!['PREORDER', 'RSVP_OPEN'].includes(group.status)) {
      throw new BadRequestException('Invitation links can only be created during PREORDER or RSVP_OPEN');
    }

    const invitations = this.dataSource.getRepository(WebsiteEventInvitation);
    const invitation = await invitations.findOne({
      where: { id: invitationId, group_id: group.id, website_id: websiteId, status: 'PENDING' },
    });
    if (!invitation) throw new NotFoundException('Pending invitation not found');
    if (invitation.expires_at <= new Date()) {
      invitation.status = 'EXPIRED';
      await invitations.save(invitation);
      throw new BadRequestException('Invitation has expired');
    }

    const { token_hash: _tokenHash, ...safeInvitation } = invitation;
    return { ...safeInvitation, invitation_id: invitation.id };
  }

  async getInvitationPreview(token: string) {
    const invitationRepo = this.dataSource.getRepository(WebsiteEventInvitation);
    const invitation = await invitationRepo.findOne({ where: { id: token } })
      ?? await invitationRepo.findOne({ where: { token_hash: createHash('sha256').update(token).digest('hex') } });
    if (!invitation || invitation.status === 'REVOKED') {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    const existingRegistration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({ where: { invitation_id: invitation.id, registration_status: 'RSVP_CONFIRMED' } });
    const hasRegistration = Boolean(existingRegistration);
    if ((invitation.status === 'EXPIRED' || invitation.expires_at <= new Date() || invitation.use_count >= invitation.max_uses) && !hasRegistration) {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    if (invitation.use_count >= invitation.max_uses) {
      const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({ where: { invitation_id: invitation.id, registration_status: 'RSVP_CONFIRMED' } });
      if (!registration) throw new NotFoundException('Invitation is invalid or expired');
    }
    return this.getInvitationPreviewForRecord(invitation);
  }

  /**
   * Status undangan privat untuk akun yang sedang login. Email penerima lengkap
   * dan data registrasi hanya dikembalikan bila akun cocok dengan undangan;
   * bila tidak cocok, cukup email tersamar supaya user tahu harus ganti akun.
   */
  async getPrivateInvitationStatus(invitationId: string, authUser: AuthUser) {
    const invitationRepo = this.dataSource.getRepository(WebsiteEventInvitation);
    const invitation = await invitationRepo.findOne({ where: { id: invitationId } })
      ?? await invitationRepo.findOne({ where: { token_hash: createHash('sha256').update(invitationId).digest('hex') } });
    if (!invitation || invitation.status === 'REVOKED') throw new NotFoundException('Invitation is invalid or expired');

    const accountEmail = authUser.email?.trim().toLowerCase() ?? null;
    const invitedEmail = invitation.email?.trim().toLowerCase() || null;
    const accountMatches = Boolean(accountEmail) && (!invitedEmail || invitedEmail === accountEmail);
    const invitationSummary = {
      invitee_name: invitation.invitee_name,
      invitee_email: accountMatches ? invitedEmail ?? accountEmail : null,
      invitee_email_masked: maskEmail(invitedEmail),
      account_email: accountEmail,
      account_matches: accountMatches,
      requires_attendee_name: !invitation.invitee_name?.trim(),
      requires_whatsapp: !invitedEmail && Boolean(invitation.whatsapp),
    };
    if (!accountMatches) return { invitation: invitationSummary, registration: null };

    const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({
      where: { invitation_id: invitation.id, email: invitedEmail ?? accountEmail!, registration_status: 'RSVP_CONFIRMED' },
    });
    if (!registration) return { invitation: invitationSummary, registration: null };
    const receipt = await this.getRegistrationReceipt(registration.id, authUser);
    return {
      invitation: invitationSummary,
      registration: {
        id: registration.id,
        attendee_name: registration.attendee_name,
        registration_status: registration.registration_status,
        payment_status: receipt.payment_status,
        selected_options: registration.selected_options,
      },
    };
  }

  async startPublicRsvpVerification(token: string, dto: SubmitGatheringRsvpDto) {
    const now = new Date();
    const email = dto.email.trim().toLowerCase();
    const reservation = await this.dataSource.transaction(async (manager) => {
      const invitationRepo = manager.getRepository(WebsiteEventInvitation);
      const invitation = await invitationRepo.findOne({
        where: [{ id: token, status: 'PENDING' }, { token_hash: createHash('sha256').update(token).digest('hex'), status: 'PENDING' }],
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.expires_at <= now || invitation.use_count >= invitation.max_uses) {
        throw new NotFoundException('Invitation is invalid or expired');
      }
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: invitation.group_id, website_id: invitation.website_id } });
      if (!group || group.invite_policy !== 'OPEN' || group.workflow_step !== 'INVITATION_CONFIRMATION' || group.status !== 'RSVP_OPEN') {
        throw new BadRequestException('Open RSVP is not available for this invitation');
      }
      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.findOne({
        where: { parent_order_id: group.id, website_id: invitation.website_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence || occurrence.status !== 'RSVP_OPEN' || (occurrence.rsvp_close_at && occurrence.rsvp_close_at <= now)) {
        throw new BadRequestException('Reservation deadline has passed');
      }
      if (invitation.whatsapp && invitation.whatsapp.replace(/[^0-9+]/g, '') !== (dto.whatsapp?.replace(/[^0-9+]/g, '') ?? null)) {
        throw new BadRequestException('RSVP WhatsApp must match the invited number');
      }
      this.validateRsvpOptions(dto, occurrence);

      const registrations = manager.getRepository(WebsiteEventRegistration);
      if (await registrations.findOne({ where: { invitation_id: invitation.id, email, registration_status: 'RSVP_CONFIRMED' } })) {
        throw new ConflictException('This email has already reserved through this invitation');
      }
      const challenges = manager.getRepository(WebsiteEventRsvpChallenge);
      const pending = await challenges.findOne({
        where: { invitation_id: invitation.id, email, status: 'PENDING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (pending) {
        if (pending.expires_at > now && now.getTime() - pending.last_sent_at.getTime() < 60_000) {
          throw new HttpException('A verification code was just sent. Wait one minute before requesting another.', HttpStatus.TOO_MANY_REQUESTS);
        }
        pending.status = 'EXPIRED';
        await challenges.save(pending);
      }

      const confirmedCount = await registrations.count({ where: { occurrence_id: occurrence.id, registration_status: 'RSVP_CONFIRMED' } });
      const pendingCount = await challenges.count({
        where: { occurrence_id: occurrence.id, status: 'PENDING', expires_at: MoreThan(now) },
      });
      if (confirmedCount + pendingCount >= occurrence.max_attendees) {
        throw new ConflictException('Gathering capacity has been reserved');
      }

      const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
      const challengeRepo = manager.getRepository(WebsiteEventRsvpChallenge);
      const challengeId = randomUUID();
      const challenge = await challengeRepo.save(challengeRepo.create({
        id: challengeId,
        website_id: invitation.website_id,
        group_id: group.id,
        occurrence_id: occurrence.id,
        invitation_id: invitation.id,
        email,
        code_hash: this.hashRsvpOtp(challengeId, code),
        reservation_data: {
          attendee_name: dto.attendee_name.trim(),
          whatsapp: dto.whatsapp?.replace(/[\s().-]/g, '') || null,
          selected_options: dto.selected_options,
        },
        status: 'PENDING',
        attempts: 0,
        expires_at: new Date(now.getTime() + 10 * 60_000),
        last_sent_at: now,
      }));
      return { challenge, code, group, invitation };
    });

    const website = await this.dataSource.getRepository(Website).findOne({ where: { id: reservation.invitation.website_id } });
    const initiatorName = await this.getInitiatorName(reservation.group.initiator_user_id);
    const sent = await this.messagingService?.sendEmail({
      to: reservation.challenge.email,
      template: this.messagingService.gatheringRsvpOtpTemplate,
      context: {
        'invitee-name': reservation.challenge.reservation_data.attendee_name,
        'website-name': website?.name ?? 'Gathering',
        'initiator-name': initiatorName,
        'plan-number': reservation.group.plan_number,
        'gathering-title': reservation.group.title,
        'verification-code': reservation.code,
        'expires-in-minutes': '10',
      },
    });
    if (!sent) {
      await this.dataSource.getRepository(WebsiteEventRsvpChallenge).update(
        { id: reservation.challenge.id, status: 'PENDING' },
        { status: 'EXPIRED' },
      );
      throw new BadGatewayException('Could not send the email verification code');
    }
    return { reservation_id: reservation.challenge.id, expires_at: reservation.challenge.expires_at };
  }

  async verifyPublicRsvpOtp(token: string, dto: VerifyGatheringRsvpOtpDto) {
    const result = await this.dataSource.transaction(async (manager) => {
      const challenges = manager.getRepository(WebsiteEventRsvpChallenge);
      const challenge = await challenges.findOne({
        where: { id: dto.reservation_id, status: 'PENDING' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!challenge) throw new BadRequestException('Verification code is invalid or expired');
      if (challenge.expires_at <= new Date()) {
        challenge.status = 'EXPIRED';
        await challenges.save(challenge);
        return { error: 'expired' as const };
      }
      if (challenge.attempts >= 5) {
        challenge.status = 'EXPIRED';
        await challenges.save(challenge);
        return { error: 'attempts' as const };
      }
      const providedHash = this.hashRsvpOtp(challenge.id, dto.code);
      const validCode = timingSafeEqual(Buffer.from(challenge.code_hash), Buffer.from(providedHash));
      if (!validCode) {
        challenge.attempts += 1;
        if (challenge.attempts >= 5) challenge.status = 'EXPIRED';
        await challenges.save(challenge);
        return { error: challenge.attempts >= 5 ? 'attempts' as const : 'incorrect' as const };
      }

      const invitationRepo = manager.getRepository(WebsiteEventInvitation);
      const invitation = await invitationRepo.findOne({
        where: [{ id: token, status: 'PENDING' }, { token_hash: createHash('sha256').update(token).digest('hex'), status: 'PENDING' }],
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.id !== challenge.invitation_id || invitation.expires_at <= new Date()) {
        throw new NotFoundException('Invitation is invalid or expired');
      }
      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { id: challenge.occurrence_id, status: 'RSVP_OPEN' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence || (occurrence.rsvp_close_at && occurrence.rsvp_close_at <= new Date())) {
        throw new BadRequestException('Reservation deadline has passed');
      }
      const registrations = manager.getRepository(WebsiteEventRegistration);
      const duplicate = await registrations.findOne({ where: { invitation_id: invitation.id, email: challenge.email, registration_status: 'RSVP_CONFIRMED' } });
      if (duplicate) throw new ConflictException('This email has already reserved through this invitation');
      const confirmedCount = await registrations.count({ where: { occurrence_id: occurrence.id, registration_status: 'RSVP_CONFIRMED' } });
      if (confirmedCount >= occurrence.max_attendees) throw new ConflictException('Gathering capacity has been reached');

      const registration = await registrations.save(registrations.create({
        website_id: challenge.website_id,
        group_id: challenge.group_id,
        occurrence_id: challenge.occurrence_id,
        invitation_id: invitation.id,
        attendee_name: challenge.reservation_data.attendee_name,
        email: challenge.email,
        whatsapp: challenge.reservation_data.whatsapp,
        selected_options: challenge.reservation_data.selected_options,
        buyer_user_id: null,
        registration_status: 'RSVP_CONFIRMED',
        payment_status: 'UNPAID',
      }));
      challenge.status = 'VERIFIED';
      await challenges.save(challenge);
      invitation.use_count += 1;
      if (invitation.use_count >= invitation.max_uses) invitation.status = 'ACCEPTED';
      await invitationRepo.save(invitation);
      const votingResults = await this.getVotingResults(occurrence, registrations);
      return { registration: { ...registration, voting_results: votingResults } };
    });
    if ('error' in result) {
      if (result.error === 'attempts') throw new HttpException('Too many incorrect verification attempts', HttpStatus.TOO_MANY_REQUESTS);
      throw new BadRequestException(result.error === 'expired' ? 'Verification code is invalid or expired' : 'Verification code is incorrect');
    }
    return result.registration;
  }

  private hashRsvpOtp(challengeId: string, code: string) {
    const secret = process.env.RSVP_OTP_SECRET || process.env.CLIENT_APP_SECRET;
    if (!secret) throw new BadGatewayException('RSVP OTP signing secret is not configured');
    return createHmac('sha256', secret).update(`${challengeId}:${code}`).digest('hex');
  }

  private validateRsvpOptions(dto: SubmitGatheringRsvpDto, occurrence: GatheringOccurrence) {
    const openedOptionIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
    const openedOptions = occurrence.option_groups_snapshot.filter((option) => openedOptionIds.has(String(option.product_option_id)));
    const groupsWithOptions = new Set(openedOptions.map((option) => String(option.option_group_key)));
    for (const groupKey of groupsWithOptions) {
      const chosenId = dto.selected_options[groupKey];
      if (!chosenId || !openedOptionIds.has(chosenId)) throw new BadRequestException(`Choose one opened option for group "${groupKey}"`);
      const chosen = openedOptions.find((option) => String(option.product_option_id) === chosenId);
      if (String(chosen?.option_group_key) !== groupKey) throw new BadRequestException(`Selected option does not belong to group "${groupKey}"`);
    }
    for (const groupKey of Object.keys(dto.selected_options)) {
      if (!groupsWithOptions.has(groupKey)) throw new BadRequestException(`Option group "${groupKey}" is not open for RSVP`);
    }
  }

  private async getVotingResults(occurrence: GatheringOccurrence, registrationsRepo: any) {
    const registrations = await registrationsRepo.find({
      where: { occurrence_id: occurrence.id, registration_status: 'RSVP_CONFIRMED' },
      select: { selected_options: true },
    }) as Array<{ selected_options: Record<string, string> }>;
    const openedOptions = occurrence.option_groups_snapshot.filter((option) =>
      (occurrence.opened_option_ids_snapshot ?? []).includes(String(option.product_option_id)),
    );
    const groupKeys = new Set(openedOptions.map((option) => String(option.option_group_key)));
    const results: Record<string, { total_votes: number; options: Record<string, { votes: number; percentage: number }> }> = {};
    for (const groupKey of groupKeys) {
      const selectedOptionIds = registrations
        .map((registration) => registration.selected_options?.[groupKey])
        .filter((optionId): optionId is string => Boolean(optionId));
      const totalVotes = selectedOptionIds.length;
      const optionResults: Record<string, { votes: number; percentage: number }> = {};
      for (const option of openedOptions.filter((entry) => String(entry.option_group_key) === groupKey)) {
        const optionId = String(option.product_option_id);
        const votes = selectedOptionIds.filter((selectedId) => selectedId === optionId).length;
        optionResults[optionId] = { votes, percentage: totalVotes ? Math.round((votes / totalVotes) * 100) : 0 };
      }
      results[groupKey] = { total_votes: totalVotes, options: optionResults };
    }
    return results;
  }

  async submitRsvp(token: string, dto: SubmitPrivateGatheringRsvpDto, authUser?: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const invitations = manager.getRepository(WebsiteEventInvitation);
      const invitation = await invitations.findOne({
        where: [{ id: token, status: 'PENDING' }, { token_hash: createHash('sha256').update(token).digest('hex'), status: 'PENDING' }],
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.expires_at <= new Date() || invitation.use_count >= invitation.max_uses) {
        throw new NotFoundException('Invitation is invalid or expired');
      }
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: invitation.group_id, website_id: invitation.website_id } });
      if (!group || group.workflow_step !== 'INVITATION_CONFIRMATION' || group.status !== 'RSVP_OPEN') {
        throw new BadRequestException('RSVP is not open for this gathering');
      }
      if (group.invite_policy === 'OPEN') {
        throw new BadRequestException('Open RSVP requires email verification');
      }
      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.findOne({
        where: { parent_order_id: group.id, website_id: invitation.website_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence || occurrence.status !== 'RSVP_OPEN') throw new BadRequestException('RSVP is not open for this gathering');
      if (occurrence.rsvp_close_at && occurrence.rsvp_close_at <= new Date()) throw new BadRequestException('Reservation deadline has passed');

      // Identitas peserta undangan privat diambil dari undangan + akun login,
      // bukan dari body request, supaya daftar peserta sesuai daftar undangan.
      if (!authUser?.email) throw new BadRequestException('Sign in with the invited account to confirm this private invitation');
      const accountEmail = authUser.email.trim().toLowerCase();
      const invitedEmail = invitation.email?.trim().toLowerCase() || null;
      if (invitedEmail && accountEmail !== invitedEmail) {
        throw new BadRequestException('Sign in with the email address this invitation was sent to');
      }
      const normalizedWhatsapp = dto.whatsapp?.replace(/[\s().-]/g, '') || null;
      if (!invitedEmail && invitation.whatsapp && invitation.whatsapp.replace(/[^0-9+]/g, '') !== normalizedWhatsapp) {
        throw new BadRequestException('RSVP WhatsApp must match the invited number');
      }
      const normalizedEmail = invitedEmail ?? accountEmail;
      const attendeeName = invitation.invitee_name?.trim() || dto.attendee_name?.trim();
      if (!attendeeName) throw new BadRequestException('Attendee name is required for this invitation');
      const openedOptionIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
      const openedOptions = occurrence.option_groups_snapshot.filter((option) => openedOptionIds.has(String(option.product_option_id)));
      const groupsWithOptions = new Set(openedOptions.map((option) => String(option.option_group_key)));
      for (const groupKey of groupsWithOptions) {
        const chosenId = dto.selected_options[groupKey];
        if (!chosenId || !openedOptionIds.has(chosenId)) {
          throw new BadRequestException(`Choose one opened option for group "${groupKey}"`);
        }
        const chosen = openedOptions.find((option) => String(option.product_option_id) === chosenId);
        if (String(chosen?.option_group_key) !== groupKey) {
          throw new BadRequestException(`Selected option does not belong to group "${groupKey}"`);
        }
      }
      for (const groupKey of Object.keys(dto.selected_options)) {
        if (!groupsWithOptions.has(groupKey)) throw new BadRequestException(`Option group "${groupKey}" is not open for RSVP`);
      }

      const registrations = manager.getRepository(WebsiteEventRegistration);
      const duplicate = await registrations.findOne({ where: { invitation_id: invitation.id, email: normalizedEmail, registration_status: 'RSVP_CONFIRMED' } });
      if (duplicate) throw new ConflictException('This invitation has already been used for RSVP');
      const currentCount = await registrations.count({
        where: { group_id: group.id, registration_status: 'RSVP_CONFIRMED' },
      });
      if (currentCount >= occurrence.max_attendees) throw new ConflictException('Gathering capacity has been reached');

      const registration = await registrations.save(registrations.create({
        website_id: invitation.website_id,
        group_id: group.id,
        occurrence_id: occurrence.id,
        invitation_id: invitation.id,
        attendee_name: attendeeName,
        email: normalizedEmail,
        whatsapp: normalizedWhatsapp ?? invitation.whatsapp ?? null,
        selected_options: dto.selected_options,
        buyer_user_id: authUser.userId,
        registration_status: 'RSVP_CONFIRMED',
        payment_status: 'UNPAID',
      }));
      invitation.use_count += 1;
      if (invitation.use_count >= invitation.max_uses) invitation.status = 'ACCEPTED';
      await invitations.save(invitation);
      const votingResults = await this.getVotingResults(occurrence, registrations);
      return { ...registration, voting_results: votingResults };
    });
  }

  async listRegistrations(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    const registrations = await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: { group_id: group.id, website_id: websiteId },
      order: { created_at: 'ASC' },
    });
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId },
    });
    const optionsById = new Map((occurrence?.option_groups_snapshot ?? []).map((option) => [
      String(option.product_option_id),
      option,
    ]));
    const orderIds = registrations.flatMap((registration) => registration.order_id ? [registration.order_id] : []);
    const orders = orderIds.length
      ? await this.dataSource.getRepository(WebsiteOrder).find({ where: { id: In(orderIds) } })
      : [];
    const transactionIds = orders.flatMap((order) => order.transaction_id ? [order.transaction_id] : []);
    const transactions = transactionIds.length
      ? await this.dataSource.getRepository(WebsiteTransaction).find({ where: { id: In(transactionIds) } })
      : [];
    for (const transaction of transactions) await this.syncGatheringTransaction(transaction);
    const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const orderById = new Map(orders.map((order) => [order.id, order]));
    return registrations.map((registration) => {
      const order = registration.order_id ? orderById.get(registration.order_id) : null;
      const transaction = order?.transaction_id ? transactionById.get(order.transaction_id) : null;
      const paymentStatus = registration.payment_status === 'REFUNDED' || transaction?.status === 'REFUNDED'
          ? 'REFUNDED'
        : transaction && ['HELD', 'COMPLETED'].includes(transaction.status)
          ? 'PAID'
          : transaction || order?.transaction_id
            ? 'PENDING_PAYMENT'
            : registration.payment_status;
      const selectedOptionDetails = Object.entries(registration.selected_options ?? {}).flatMap(([groupKey, optionId]) => {
        const option = optionsById.get(String(optionId));
        return option ? [{
          option_group_key: String(option.option_group_key ?? groupKey),
          option_key: String(option.option_key ?? ''),
          label: String(option.label ?? option.option_key ?? optionId),
          description: option.description ? String(option.description) : null,
          venue_location: option.venue_location ? String(option.venue_location) : null,
        }] : [];
      });
      return { ...registration, invoice_amount: Number(occurrence?.price_per_seat ?? 0), payment_status: paymentStatus, selected_option_details: selectedOptionDetails };
    });
  }

  async cancelGathering(groupId: string, websiteId: string, initiatorUserId: string, reason?: string) {
    return this.dataSource.transaction(async (manager) => {
      const groupRepo = manager.getRepository(WebsiteEventGroup);
      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const registrationRepo = manager.getRepository(WebsiteEventRegistration);
      const invitationRepo = manager.getRepository(WebsiteEventInvitation);
      const orderRepo = manager.getRepository(WebsiteOrder);

      const group = await groupRepo.findOne({ where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId }, lock: { mode: 'pessimistic_write' } });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (['CANCELLED', 'COMPLETED'].includes(group.status)) return group;
      if (group.status === 'IN_PROGRESS') throw new BadRequestException('A gathering that has started cannot be cancelled');

      const occurrence = await occurrenceRepo.findOne({ where: { parent_order_id: group.id, website_id: websiteId }, lock: { mode: 'pessimistic_write' } });
      const registrations = await registrationRepo.find({ where: { group_id: group.id, website_id: websiteId }, lock: { mode: 'pessimistic_write' } });

      const settlementByOrderId = await this.settleSeatEscrowsForCancel(manager, group, occurrence, registrations, websiteId, reason);

      group.status = 'CANCELLED';
      group.workflow_step = 'LOCKED';
      if (occurrence) {
        occurrence.status = 'CANCELLED';
        await occurrenceRepo.save(occurrence);
      }
      for (const registration of registrations) {
        registration.registration_status = 'CANCELLED';
        const settlement = registration.order_id ? settlementByOrderId.get(registration.order_id) : undefined;
        if (settlement === 'REFUNDED') registration.payment_status = 'REFUNDED';
        else if (settlement === 'CHECKOUT_CANCELLED') registration.payment_status = 'UNPAID';
      }
      await registrationRepo.save(registrations);

      const invitationIds = [...new Set(registrations.map((registration) => registration.invitation_id))];
      const invitations = invitationIds.length
        ? await invitationRepo.find({ where: { id: In(invitationIds), group_id: group.id, website_id: websiteId }, lock: { mode: 'pessimistic_write' } })
        : [];
      for (const invitation of invitations) {
        invitation.status = 'REVOKED';
        invitation.revoked_at = new Date();
      }
      if (invitations.length) await invitationRepo.save(invitations);

      const orderIds = [...new Set([group.order_id, ...registrations.map((registration) => registration.order_id)].filter(Boolean) as string[])];
      if (orderIds.length) {
        const orders = await orderRepo.find({ where: { id: In(orderIds), website_id: websiteId }, lock: { mode: 'pessimistic_write' } });
        for (const order of orders) {
          order.status = 'CANCELLED';
          // transaction_id sengaja dipertahankan: jejak ke escrow/refund harus tetap bisa ditelusuri.
          order.metadata = { ...(order.metadata ?? {}), cancelled_at: new Date().toISOString(), cancelled_by: 'initiator', cancellation_reason: reason?.trim() || 'Dibatalkan oleh initiator' };
        }
        if (orders.length) await orderRepo.save(orders);
      }

      await groupRepo.save(group);
      return group;
    });
  }

  async rejectRegistrations(groupId: string, websiteId: string, initiatorUserId: string, dto: RejectGatheringRegistrationsDto) {
    const registrationIds = [...new Set(dto.registration_ids)];
    if (registrationIds.length !== dto.registration_ids.length) {
      throw new BadRequestException('Registration IDs must be unique');
    }

    const rejected = await this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.workflow_step !== 'INVITATION_CONFIRMATION' || group.status !== 'RSVP_OPEN') {
        throw new BadRequestException('Reservations can only be rejected while RSVP is open');
      }

      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: group.id, website_id: websiteId, status: 'RSVP_OPEN' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence || (occurrence.rsvp_close_at && occurrence.rsvp_close_at <= new Date())) {
        throw new BadRequestException('Reservation deadline has passed');
      }

      const registrations = manager.getRepository(WebsiteEventRegistration);
      const selected = await registrations.find({
        where: { id: In(registrationIds), group_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (selected.length !== registrationIds.length) {
        throw new BadRequestException('One or more selected reservations do not belong to this gathering');
      }
      if (selected.some((registration) => registration.registration_status !== 'RSVP_CONFIRMED' || registration.payment_status !== 'UNPAID' || registration.order_id)) {
        throw new BadRequestException('Only active, unpaid reservations without a seat order can be rejected');
      }

      const invitations = manager.getRepository(WebsiteEventInvitation);
      const invitationCounts = new Map<string, number>();
      for (const registration of selected) {
        registration.registration_status = 'REJECTED';
        registration.rejection_message = dto.message.trim();
        registration.rejected_at = new Date();
        invitationCounts.set(registration.invitation_id, (invitationCounts.get(registration.invitation_id) ?? 0) + 1);
      }
      await registrations.save(selected);

      for (const [invitationId, rejectedCount] of invitationCounts) {
        const invitation = await invitations.findOne({
          where: { id: invitationId, group_id: group.id },
          lock: { mode: 'pessimistic_write' },
        });
        if (!invitation) continue;
        invitation.use_count = Math.max(0, invitation.use_count - rejectedCount);
        if (invitation.status === 'ACCEPTED' && invitation.use_count < invitation.max_uses) invitation.status = 'PENDING';
        await invitations.save(invitation);
      }

      const website = await manager.getRepository(Website).findOne({ where: { id: websiteId } });
      return {
        selected,
        groupTitle: group.title,
        planNumber: group.plan_number,
        websiteName: website?.name ?? 'Gathering',
        initiatorUserId: group.initiator_user_id,
      };
    });

    const initiatorName = await this.getInitiatorName(rejected.initiatorUserId);
    const failedEmails: string[] = [];
    for (const registration of rejected.selected) {
      const sent = await this.messagingService?.sendEmail({
        to: registration.email,
        template: this.messagingService.gatheringRsvpRejectedTemplate,
        context: {
          'attendee-name': registration.attendee_name,
          'gathering-title': rejected.groupTitle,
          'website-name': rejected.websiteName,
          'initiator-name': initiatorName,
          'plan-number': rejected.planNumber,
          'rejection-message': dto.message.trim(),
        },
      });
      if (!sent) failedEmails.push(registration.email);
    }

    return {
      rejected_count: rejected.selected.length,
      email_failed_count: failedEmails.length,
      failed_emails: failedEmails,
    };
  }

  async createParticipantSeatOrder(registrationId: string, authUser: AuthUser) {
    return this.dataSource.transaction(async (manager) => {
      const registrations = manager.getRepository(WebsiteEventRegistration);
      const registration = await registrations.findOne({
        where: { id: registrationId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registration || registration.registration_status !== 'RSVP_CONFIRMED' || !registration.invoice_issued_at) {
        throw new NotFoundException('Invoice not found for this account');
      }
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: registration.group_id, website_id: registration.website_id } });
      const isAttendee = registration.email.trim().toLowerCase() === authUser.email?.trim().toLowerCase();
      const isInitiator = group?.initiator_user_id === authUser.userId;
      if (!group || (!isAttendee && !isInitiator) || (registration.buyer_user_id && registration.buyer_user_id !== authUser.userId)) {
        throw new NotFoundException('Invoice not found for this account');
      }
      if (registration.order_id) {
        const existingOrder = await manager.getRepository(WebsiteOrder).findOne({ where: { id: registration.order_id } });
        if (!existingOrder || existingOrder.buyer_user_id !== authUser.userId) throw new NotFoundException('Invoice not found for this account');
        if (!existingOrder.transaction_id) return existingOrder;
        const existingTransaction = await manager.getRepository(WebsiteTransaction).findOne({ where: { id: existingOrder.transaction_id } });
        return Object.assign(existingOrder, {
          checkout_url: existingTransaction?.checkout_url ?? null,
          transaction_status: existingTransaction?.status ?? null,
        });
      }
      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { id: registration.occurrence_id, website_id: registration.website_id },
      });
      if (!group || !occurrence || group.status !== 'PAYMENT_OPEN' || occurrence.status !== 'PAYMENT_OPEN') {
        throw new BadRequestException('Seat payment has not been opened for this gathering');
      }
      if (occurrence.payment_deadline && occurrence.payment_deadline <= new Date()) {
        throw new BadRequestException('The gathering payment deadline has passed');
      }
      const product = await manager.getRepository(WebsiteProduct).findOne({
        where: { id: occurrence.product_id, website_id: occurrence.website_id, is_active: true },
      });
      if (!product || !group.order_id) throw new NotFoundException('Gathering seat product is unavailable');

      const order = await this.createSeatOrder(manager, registration, group, occurrence, product, authUser);
      registration.buyer_user_id = authUser.userId;
      registration.payer_user_id = authUser.userId;
      registration.order_id = order.id;
      registration.payment_status = 'UNPAID';
      await registrations.save(registration);
      return order;
    });
  }

  /**
   * Selesaikan semua checkout seat di payment-service sebelum gathering
   * ditandai CANCELLED. Sumber kebenaran adalah status escrow aktual, bukan
   * `registration.payment_status` (bisa basi). Checkout yang belum dibayar
   * dibatalkan lebih dulu — kalau peserta sudah mulai bayar di provider,
   * pembatalan ditolak SEBELUM ada dana yang dipindah. Baru setelah itu dana
   * HELD direfund penuh ke wallet pembayar. Key deterministik → retry aman.
   */
  private async settleSeatEscrowsForCancel(
    manager: EntityManager,
    group: WebsiteEventGroup,
    occurrence: GatheringOccurrence | null,
    registrations: WebsiteEventRegistration[],
    websiteId: string,
    reason?: string,
  ): Promise<Map<string, SeatCancelSettlement>> {
    const settlementByOrderId = new Map<string, SeatCancelSettlement>();
    const orderIds = [...new Set(registrations.flatMap((registration) => registration.order_id ? [registration.order_id] : []))];
    if (!orderIds.length) return settlementByOrderId;

    const orders = await manager.getRepository(WebsiteOrder).find({
      where: { id: In(orderIds), website_id: websiteId, parent_order_id: group.order_id },
      lock: { mode: 'pessimistic_write' },
    });
    const transactionIds = [...new Set(orders.flatMap((order) => order.transaction_id ? [order.transaction_id] : []))];
    if (!transactionIds.length) return settlementByOrderId;

    const transactionRepo = manager.getRepository(WebsiteTransaction);
    const transactions = await transactionRepo.find({
      where: { id: In(transactionIds), website_id: websiteId },
      lock: { mode: 'pessimistic_write' },
    });
    if (transactions.length !== transactionIds.length) {
      throw new BadRequestException('A gathering seat checkout could not be found; cancellation was not processed');
    }

    const settlementByTransactionId = new Map<string, SeatCancelSettlement>();
    const toCancel: WebsiteTransaction[] = [];
    const toRefund: WebsiteTransaction[] = [];
    for (const transaction of transactions) {
      if (transaction.payment_mode !== 'ESCROW' || !transaction.escrow_id) {
        if (['CANCELLED', 'REFUNDED'].includes(transaction.status)) continue;
        throw new BadRequestException('A gathering seat checkout has no escrow; cancellation was not processed');
      }
      if (!this.escrowClient) {
        throw new BadGatewayException('Escrow payment service is unavailable; gathering cancellation was not processed');
      }
      const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
      if (escrow.status === 'PENDING') {
        toCancel.push(transaction);
      } else if (escrow.status === 'HELD' && Number(escrow.remaining_hold) > 0) {
        toRefund.push(transaction);
      } else if (escrow.status === 'REFUNDED') {
        transaction.status = 'REFUNDED';
        settlementByTransactionId.set(transaction.id, 'REFUNDED');
      } else if (escrow.status === 'CLOSED' && Number(escrow.amount_released) === 0) {
        // CLOSED tanpa dana dirilis = checkout yang sudah dibatalkan sebelum dibayar.
        const refunded = Number(escrow.amount_held) > 0 || transaction.status === 'REFUNDED';
        transaction.status = refunded ? 'REFUNDED' : 'CANCELLED';
        settlementByTransactionId.set(transaction.id, refunded ? 'REFUNDED' : 'CHECKOUT_CANCELLED');
      } else {
        throw new BadRequestException(
          `Gathering funds have already been released or are in dispute (escrow ${escrow.status}); cancellation was not processed`,
        );
      }
    }

    const cancelKey = (transaction: WebsiteTransaction) => `gathering-initiator-cancel:${occurrence?.id ?? group.id}:${transaction.id}`;
    for (const transaction of toCancel) {
      try {
        await this.escrowClient!.cancelPendingEscrowPayment(transaction.escrow_id as string, cancelKey(transaction));
      } catch (error) {
        throw new BadRequestException(
          `A participant has already started paying (${error instanceof Error ? error.message : 'payment in progress'}). Wait until the payment completes or expires, then cancel again.`,
        );
      }
      transaction.status = 'CANCELLED';
      transaction.checkout_url = null;
      settlementByTransactionId.set(transaction.id, 'CHECKOUT_CANCELLED');
    }
    for (const transaction of toRefund) {
      const refund = await this.escrowClient!.refund(
        transaction.escrow_id as string,
        cancelKey(transaction),
        undefined,
        `Gathering cancelled by initiator: ${reason?.trim() || 'Dibatalkan oleh initiator'}`,
      );
      transaction.status = normalizeEscrowStatus(refund.status);
      settlementByTransactionId.set(transaction.id, 'REFUNDED');
    }
    await transactionRepo.save(transactions);

    for (const order of orders) {
      const settlement = order.transaction_id ? settlementByTransactionId.get(order.transaction_id) : undefined;
      if (settlement) settlementByOrderId.set(order.id, settlement);
    }
    return settlementByOrderId;
  }

  async refundRegistration(groupId: string, websiteId: string, registrationId: string, initiatorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.status !== 'PAYMENT_OPEN') throw new BadRequestException('Seat refunds are only available before the gathering is confirmed');
      const registration = await manager.getRepository(WebsiteEventRegistration).findOne({
        where: { id: registrationId, group_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!registration || registration.registration_status !== 'RSVP_CONFIRMED' || !registration.order_id) {
        throw new NotFoundException('Paid participant seat not found');
      }
      const order = await manager.getRepository(WebsiteOrder).findOne({ where: { id: registration.order_id } });
      const transaction = order?.transaction_id
        ? await manager.getRepository(WebsiteTransaction).findOne({ where: { id: order.transaction_id }, lock: { mode: 'pessimistic_write' } })
        : null;
      if (!order || !transaction || transaction.payment_mode !== 'ESCROW' || !transaction.escrow_id) {
        throw new BadRequestException('This seat has no refundable escrow payment');
      }
      await this.syncGatheringTransaction(transaction);
      if (!['HELD', 'DISPUTED'].includes(transaction.status)) throw new BadRequestException('Seat refund is only available while funds remain held');
      if (!this.escrowClient) throw new BadGatewayException('Escrow payment service is unavailable');

      const amount = Number(order.total_amount);
      const escrow = await this.escrowClient.refund(
        transaction.escrow_id,
        `gathering-seat-refund:${registration.id}`,
        amount,
        `Gathering seat refund ${registration.id}`,
      );
      transaction.status = normalizeEscrowStatus(escrow.status);
      await manager.getRepository(WebsiteTransaction).save(transaction);
      registration.registration_status = 'CANCELLED';
      registration.payment_status = 'REFUNDED';
      await manager.getRepository(WebsiteEventRegistration).save(registration);
      return { registration_id: registration.id, refund_amount: amount, escrow_status: escrow.status, payer_user_id: registration.payer_user_id };
    });
  }

  async findCollectiveCheckoutToRetry(
    groupId: string,
    websiteId: string,
    authUser: AuthUser,
    registrationIds: string[],
  ): Promise<{ transaction_id: string; plan_order_id: string } | null> {
    const uniqueIds = [...new Set(registrationIds)];
    if (!uniqueIds.length || uniqueIds.length !== registrationIds.length) {
      throw new BadRequestException('Select one or more unique participant invoices');
    }
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: authUser.userId, status: 'PAYMENT_OPEN' },
    });
    if (!group) throw new NotFoundException('Gathering payment is not open');
    if (!group.order_id) throw new NotFoundException('Gathering plan order not found');

    const registrations = await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: { id: In(uniqueIds), group_id: groupId, website_id: websiteId },
    });
    if (registrations.length !== uniqueIds.length) {
      throw new BadRequestException('One or more invoices do not belong to this gathering');
    }
    // PENDING_PAYMENT = seat yang sedang berada di checkout (mis. checkout kolektif yang mau dilanjutkan).
    if (registrations.some((registration) => registration.registration_status !== 'RSVP_CONFIRMED' || !['UNPAID', 'PENDING_PAYMENT'].includes(registration.payment_status) || !registration.invoice_issued_at)) {
      throw new BadRequestException('Only issued, unpaid participant invoices can be paid collectively');
    }

    const orderIds = registrations.map((registration) => registration.order_id).filter(Boolean) as string[];
    const orders = orderIds.length
      ? await this.dataSource.getRepository(WebsiteOrder).find({ where: { id: In(orderIds) } })
      : [];
    // Order seat tanpa transaksi (belum pernah checkout, atau checkout peserta sudah dibatalkan initiator)
    // bukan checkout yang perlu dilanjutkan — createInitiatorSeatOrders akan memakai ulang order tersebut.
    const ordersInCheckout = orders.filter((order) => order.transaction_id);
    if (!ordersInCheckout.length) {
      if (registrations.some((registration) => registration.payment_status !== 'UNPAID')) {
        throw new ConflictException('Selected invoices are out of date. Reload the participant list and retry.');
      }
      return null;
    }
    if (ordersInCheckout.length !== registrations.length) {
      throw new ConflictException('Some selected invoices already belong to a checkout. Select the same invoices and retry.');
    }
    if (ordersInCheckout.some((order) => order.buyer_user_id !== authUser.userId)) {
      throw new ConflictException('Selected invoices are already attached to an incomplete checkout');
    }
    const transactionIds = [...new Set(ordersInCheckout.map((order) => order.transaction_id as string))];
    if (transactionIds.length !== 1) {
      throw new ConflictException('Selected invoices belong to different checkouts. Retry each checkout separately.');
    }

    const transaction = await this.dataSource.getRepository(WebsiteTransaction).findOne({
      where: { id: transactionIds[0], website_id: websiteId, buyer_user_id: authUser.userId },
    });
    if (!transaction || transaction.status !== 'PENDING_PAYMENT') {
      throw new ConflictException('The existing checkout is no longer awaiting payment');
    }
    return { transaction_id: transaction.id, plan_order_id: group.order_id };
  }

  async createInitiatorSeatOrders(groupId: string, websiteId: string, authUser: AuthUser, registrationIds: string[]) {
    const uniqueIds = [...new Set(registrationIds)];
    if (!uniqueIds.length || uniqueIds.length !== registrationIds.length) {
      throw new BadRequestException('Select one or more unique participant invoices');
    }
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: authUser.userId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering plan not found');
      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: group.id, website_id: websiteId, status: 'PAYMENT_OPEN' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence || group.status !== 'PAYMENT_OPEN') throw new BadRequestException('Gathering payment is not open');
      if (occurrence.payment_deadline && occurrence.payment_deadline <= new Date()) throw new BadRequestException('The gathering payment deadline has passed');

      const registrations = await manager.getRepository(WebsiteEventRegistration).find({
        where: { id: In(uniqueIds), group_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (registrations.length !== uniqueIds.length) throw new BadRequestException('One or more invoices do not belong to this gathering');
      if (registrations.some((registration) => registration.registration_status !== 'RSVP_CONFIRMED' || registration.payment_status !== 'UNPAID' || !registration.invoice_issued_at)) {
        throw new BadRequestException('Only issued, unpaid participant invoices can be paid collectively');
      }

      const product = await manager.getRepository(WebsiteProduct).findOne({ where: { id: occurrence.product_id, website_id: websiteId, is_active: true } });
      if (!product || !group.order_id) throw new NotFoundException('Gathering seat product is unavailable');
      const orderRepo = manager.getRepository(WebsiteOrder);
      const orders: WebsiteOrder[] = [];
      for (const registration of registrations) {
        let order = registration.order_id
          ? await orderRepo.findOne({ where: { id: registration.order_id }, lock: { mode: 'pessimistic_write' } })
          : null;
        if (order) {
          if (order.transaction_id) throw new ConflictException('A selected invoice already has a checkout in progress or is paid');
          if (order.buyer_user_id !== authUser.userId) {
            order.buyer_user_id = authUser.userId;
            order.buyer_identifier = authUser.email ?? authUser.username ?? null;
            order = await orderRepo.save(order);
          }
        } else {
          order = await this.createSeatOrder(manager, registration, group, occurrence, product, authUser);
          registration.order_id = order.id;
        }
        registration.buyer_user_id = authUser.userId;
        registration.payer_user_id = authUser.userId;
        await manager.getRepository(WebsiteEventRegistration).save(registration);
        orders.push(order);
      }
      return orders;
    });
  }

  async cancelParticipantCheckout(
    groupId: string,
    websiteId: string,
    initiator: AuthUser,
    registrationId: string,
  ) {
    if (!this.escrowClient) throw new BadGatewayException('Escrow payment service is unavailable');
    return this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId, initiator_user_id: initiator.userId, status: 'PAYMENT_OPEN' },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering payment is not open');

      const registrationRepo = manager.getRepository(WebsiteEventRegistration);
      const registration = await registrationRepo.findOne({
        where: { id: registrationId, group_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      // payment_status bisa masih UNPAID untuk checkout yang dibuat sebelum status ini dipersist —
      // sumber kebenaran "checkout sedang berjalan" adalah order.transaction_id + status transaksinya.
      if (!registration || registration.registration_status !== 'RSVP_CONFIRMED' || !['UNPAID', 'PENDING_PAYMENT'].includes(registration.payment_status) || !registration.invoice_issued_at || !registration.order_id) {
        throw new BadRequestException('Only a participant seat with an issued, pending checkout can be cancelled');
      }

      const orderRepo = manager.getRepository(WebsiteOrder);
      const order = await orderRepo.findOne({
        where: { id: registration.order_id, website_id: websiteId, parent_order_id: group.order_id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!order?.transaction_id) throw new BadRequestException('Participant checkout is no longer active');

      const transactionRepo = manager.getRepository(WebsiteTransaction);
      const transaction = await transactionRepo.findOne({
        where: { id: order.transaction_id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!transaction || !['PENDING', 'PENDING_PAYMENT'].includes(transaction.status) || transaction.payment_mode !== 'ESCROW' || !transaction.escrow_id) {
        throw new BadRequestException('Only an unpaid, pending escrow checkout can be cancelled');
      }

      await this.escrowClient.cancelPendingEscrowPayment(
        transaction.escrow_id,
        `gathering-checkout-takeover:${registration.id}:${transaction.id}`,
      );

      transaction.status = 'CANCELLED';
      transaction.checkout_url = null;
      await transactionRepo.save(transaction);
      // Seat diambil alih initiator: peserta tidak bisa checkout ulang order ini dan
      // bentrok dengan pembayaran kolektif yang sedang disiapkan initiator.
      order.transaction_id = null;
      order.status = 'PENDING';
      order.buyer_user_id = initiator.userId;
      order.buyer_identifier = initiator.email ?? initiator.username ?? null;
      await orderRepo.save(order);
      registration.payment_status = 'UNPAID';
      registration.buyer_user_id = initiator.userId;
      registration.payer_user_id = null;
      await registrationRepo.save(registration);

      return { registration_id: registration.id, cancelled_transaction_id: transaction.id, payment_status: registration.payment_status };
    });
  }

  private async createSeatOrder(manager: any, registration: WebsiteEventRegistration, group: WebsiteEventGroup, occurrence: GatheringOccurrence, product: WebsiteProduct, authUser: AuthUser) {
    if (!group.order_id) throw new NotFoundException('Gathering seat product is unavailable');
    const price = Number(occurrence.price_per_seat);
    const depositAmountPerSeat = Number(occurrence.deposit_amount_per_seat ?? 0);
    const meta: GatheringOrderMeta = {
      role: 'participant',
      group_id: group.id,
      occurrence_id: occurrence.id,
      deposit_amount_per_seat: depositAmountPerSeat,
    };
    const orderRepo = manager.getRepository(WebsiteOrder);
    return orderRepo.save(orderRepo.create({
      website_id: registration.website_id,
      product_id: product.id,
      location_id: null,
      buyer_user_id: authUser.userId,
      buyer_identifier: authUser.email ?? authUser.username ?? null,
      quantity: 1,
      unit_price: price,
      total_amount: price,
      currency: occurrence.currency,
      payment_mode: 'ESCROW',
      status: 'PENDING',
      parent_order_id: group.order_id,
      metadata: { source: 'gathering_seat', gathering: meta, registration_id: registration.id },
    }));
  }

  async getRegistrationReceipt(registrationId: string, authUser: AuthUser) {
    const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({ where: { id: registrationId } });
    if (!registration || (registration.buyer_user_id
      ? registration.buyer_user_id !== authUser.userId
      : registration.email.trim().toLowerCase() !== authUser.email?.trim().toLowerCase())) {
      throw new NotFoundException('Registration not found');
    }
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: registration.group_id, website_id: registration.website_id } });
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { id: registration.occurrence_id, website_id: registration.website_id } });
    if (!group || !occurrence) throw new NotFoundException('Registration not found');
    let paymentStatus = registration.payment_status;
    let checkoutUrl: string | null = null;
    if (registration.order_id) {
      const order = await this.dataSource.getRepository(WebsiteOrder).findOne({ where: { id: registration.order_id } });
      if (order?.transaction_id) {
        const transaction = await this.dataSource.getRepository(WebsiteTransaction).findOne({ where: { id: order.transaction_id } });
        if (transaction) await this.syncGatheringTransaction(transaction);
        checkoutUrl = transaction?.checkout_url ?? null;
        if (registration.payment_status === 'REFUNDED' || transaction?.status === 'REFUNDED') paymentStatus = 'REFUNDED';
        else if (transaction && ['HELD', 'COMPLETED'].includes(transaction.status)) paymentStatus = 'PAID';
        else if (transaction) paymentStatus = 'PENDING_PAYMENT';
      }
    }
    return {
      id: registration.id,
      attendee_name: registration.attendee_name,
      registration_status: registration.registration_status,
      payment_status: paymentStatus,
      order_id: registration.order_id,
      checkout_url: checkoutUrl,
      payment_open: group.status === 'PAYMENT_OPEN' && occurrence.status === 'PAYMENT_OPEN',
      payment_deadline: occurrence.payment_deadline,
    };
  }

  /**
   * Simpan status bayar seat dari status transaksinya. Tanpa ini `PAID` hanya
   * tersimpan saat invoice publik dibuka, sehingga pembatalan, konfirmasi,
   * dan kalender admin membaca nilai basi. Seat yang sudah REFUNDED tidak
   * pernah ditimpa; PAID tidak pernah diturunkan ke PENDING_PAYMENT.
   */
  private async persistRegistrationPaymentStatus(transaction: WebsiteTransaction) {
    const target = ['HELD', 'COMPLETED', 'DISPUTED'].includes(transaction.status)
      ? 'PAID'
      : transaction.status === 'REFUNDED'
        ? 'REFUNDED'
        : ['PENDING', 'PENDING_PAYMENT'].includes(transaction.status)
          ? 'PENDING_PAYMENT'
          : null;
    if (!target) return;
    const orders = await this.dataSource.getRepository(WebsiteOrder).find({
      where: { transaction_id: transaction.id },
      select: { id: true },
    });
    if (!orders.length) return;
    const from: WebsiteEventRegistration['payment_status'][] = target === 'PENDING_PAYMENT'
      ? ['UNPAID']
      : target === 'PAID'
        ? ['UNPAID', 'PENDING_PAYMENT']
        : ['UNPAID', 'PENDING_PAYMENT', 'PAID'];
    await this.dataSource.getRepository(WebsiteEventRegistration).update(
      { order_id: In(orders.map((order) => order.id)), payment_status: In(from) },
      { payment_status: target },
    );
  }

  private async syncGatheringTransaction(transaction: WebsiteTransaction) {
    if (!this.escrowClient) return;
    try {
      // 'PENDING' = baris lama yang sempat tersimpan dengan vocabulary escrow mentah; tetap di-sync supaya pulih.
      if (transaction.payment_mode === 'ESCROW' && transaction.escrow_id && ['PENDING', 'PENDING_PAYMENT', 'HELD', 'DISPUTED'].includes(transaction.status)) {
        const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
        const status = normalizeEscrowStatus(escrow.status);
        if (status !== transaction.status) {
          transaction.status = status;
          await this.dataSource.getRepository(WebsiteTransaction).save(transaction);
        }
      } else if (transaction.payment_mode === 'ADD_TO_CART' && transaction.payment_request_id && transaction.status === 'PENDING_PAYMENT') {
        const payment = await this.escrowClient.getDirectPaymentStatus(transaction.payment_request_id);
        if (payment.status === 'PAID') {
          transaction.status = 'COMPLETED';
          await this.dataSource.getRepository(WebsiteTransaction).save(transaction);
        }
      }
      await this.persistRegistrationPaymentStatus(transaction);
    } catch {
      // Preserve the last known local state if the payment service is temporarily unavailable.
    }
  }

  async confirmReservations(groupId: string, websiteId: string, initiatorUserId: string) {
    const confirmed = await this.dataSource.transaction(async (manager) => {
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId }, lock: { mode: 'pessimistic_write' } });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.workflow_step === 'PAYMENT_CONFIRMATION' && group.status === 'PAYMENT_OPEN') {
        return { group, alreadyConfirmed: true as const };
      }
      if (group.workflow_step !== 'INVITATION_CONFIRMATION' || group.status !== 'RSVP_OPEN') {
        throw new BadRequestException(
          `Gathering is not ready for reservation confirmation (current step: ${group.workflow_step}, status: ${group.status})`,
        );
      }
      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.findOne({ where: { parent_order_id: group.id, website_id: websiteId }, lock: { mode: 'pessimistic_write' } });
      if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
      if (!occurrence.final_schedule || !occurrence.payment_deadline) {
        throw new BadRequestException('Event date and payment deadline must be set before opening participant payments');
      }
      const registrations = await manager.getRepository(WebsiteEventRegistration).find({
        where: { group_id: group.id, website_id: websiteId, registration_status: 'RSVP_CONFIRMED' },
        lock: { mode: 'pessimistic_write' },
      });
      if (registrations.length < occurrence.min_attendees) {
        throw new BadRequestException(`Minimum confirmed RSVPs not reached (${registrations.length}/${occurrence.min_attendees})`);
      }
      if (registrations.length > occurrence.max_attendees) {
        throw new BadRequestException(`Confirmed RSVPs exceed the gathering capacity (${registrations.length}/${occurrence.max_attendees})`);
      }
      for (const registration of registrations) {
        registration.invoice_is_public = true;
        registration.invoice_issued_at ??= new Date();
      }
      await manager.getRepository(WebsiteEventRegistration).save(registrations);
      group.workflow_step = 'PAYMENT_CONFIRMATION';
      group.status = 'PAYMENT_OPEN';
      occurrence.status = 'PAYMENT_OPEN';
      await groups.save(group);
      await occurrenceRepo.save(occurrence);
      const website = await manager.getRepository(Website).findOne({ where: { id: websiteId } });
      return { group, occurrence, website, registrations, alreadyConfirmed: false as const };
    });

    if (confirmed.alreadyConfirmed) {
      const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: confirmed.group.id, website_id: websiteId },
      });
      const operation = await this.dataSource.getRepository(GatheringOperation).findOne({
        where: {
          group_id: groupId,
          website_id: websiteId,
          initiator_user_id: initiatorUserId,
          kind: 'INVOICE_ISSUANCE',
        },
        order: { created_at: 'DESC' },
      });
      return {
        ...confirmed.group,
        occurrence,
        already_confirmed: true,
        ...(operation ? {
          invoice_operation_id: operation.id,
          invoice_operation_status: operation.status,
          invoice_email_total: operation.total_count,
          invoice_email_success_count: operation.success_count,
          invoice_email_failed_count: operation.failed_count,
          failed_invoice_emails: operation.failed_items,
          invoice_email_error: operation.error_message,
        } : {}),
      };
    }

    const pendingEmails = confirmed.registrations.filter((registration) => !registration.invoice_email_sent_at);
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.save(operationRepo.create({
      website_id: websiteId,
      group_id: groupId,
      initiator_user_id: initiatorUserId,
      kind: 'INVOICE_ISSUANCE',
      status: pendingEmails.length ? 'QUEUED' : 'COMPLETED',
      total_count: pendingEmails.length,
      processed_count: 0,
      success_count: 0,
      failed_count: 0,
      failed_items: [],
      error_message: null,
    }));

    if (pendingEmails.length) {
      try {
        await this.enqueueOperationJob(ISSUE_GATHERING_INVOICES_JOB, { operationId: operation.id }, {
          jobId: `gathering-invoices-${operation.id}`,
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        });
      } catch (cause) {
        operation.status = 'FAILED';
        operation.error_message = cause instanceof Error ? cause.message : 'Invoice job enqueue failed';
        operation.failed_count = pendingEmails.length;
        operation.failed_items = pendingEmails.map((registration) => registration.email);
        await operationRepo.save(operation);
      }
    }

    return {
      ...confirmed.group,
      occurrence: confirmed.occurrence,
      registration_count: confirmed.registrations.length,
      invoice_operation_id: operation.id,
      invoice_operation_status: operation.status,
      invoice_email_total: operation.total_count,
      invoice_email_success_count: operation.success_count,
      invoice_email_failed_count: operation.failed_count,
      failed_invoice_emails: operation.failed_items,
      invoice_email_error: operation.error_message,
    };
  }

  private invoiceLink(website: Website | null, registrationId: string) {
    return `${this.tenantBaseUrl(website)}/gathering/invoice/${encodeURIComponent(registrationId)}`;
  }

  private orderDetailLink(website: Website | null, transactionId: string) {
    return `${this.tenantBaseUrl(website)}/order/${encodeURIComponent(transactionId)}`;
  }

  async getOperationForInitiator(groupId: string, operationId: string, websiteId: string, initiatorUserId: string) {
    const operation = await this.dataSource.getRepository(GatheringOperation).findOne({
      where: { id: operationId, group_id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!operation) throw new NotFoundException('Gathering operation not found');
    return this.failStalledOperation(operation);
  }

  /**
   * Enqueue job operasi dengan batas waktu. Koneksi BullMQ memakai
   * maxRetriesPerRequest: null, jadi saat Redis tidak terjangkau `queue.add()`
   * menunggu tanpa batas dan request HTTP ikut hang. Kalau job ternyata tetap
   * masuk setelah timeout, processor melewatinya karena operasi sudah FAILED.
   */
  private async enqueueOperationJob(name: string, data: Record<string, string>, opts: JobsOptions): Promise<void> {
    const queue = this.operationsQueue;
    if (!queue) throw new Error('Gathering operation queue is not configured');
    let timer: NodeJS.Timeout | undefined;
    try {
      await Promise.race([
        queue.add(name, data, opts),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Gathering operation queue is unavailable, please try again')), OPERATION_ENQUEUE_TIMEOUT_MS);
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Menandai operasi FAILED bila worker tidak mengambilnya (QUEUED) atau berhenti
   * tanpa progres (RUNNING) melewati batas waktu. Update bersyarat pada status dan
   * processed_count supaya tidak menimpa progres worker yang ternyata masih jalan.
   */
  private async failStalledOperation(operation: GatheringOperation): Promise<GatheringOperation> {
    if (!['QUEUED', 'RUNNING'].includes(operation.status) || !operation.updated_at) return operation;
    const staleAfterMs = operation.status === 'QUEUED' ? QUEUED_OPERATION_STALE_MS : RUNNING_OPERATION_STALE_MS;
    if (Date.now() - new Date(operation.updated_at).getTime() < staleAfterMs) return operation;

    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const unprocessedCount = Math.max(operation.total_count - operation.processed_count, 0);
    const failedCount = Math.max(operation.failed_count + unprocessedCount, 1);
    const errorMessage = operation.status === 'QUEUED'
      ? 'Background worker did not pick up this operation in time, please try again'
      : 'Background worker stopped responding during this operation, please try again';
    const result = await operationRepo.update(
      { id: operation.id, status: operation.status, processed_count: operation.processed_count },
      { status: 'FAILED', failed_count: failedCount, error_message: errorMessage },
    );
    if (!result.affected) {
      return (await operationRepo.findOne({ where: { id: operation.id } })) ?? operation;
    }
    return { ...operation, status: 'FAILED', failed_count: failedCount, error_message: errorMessage };
  }

  async processInvitationDispatch(operationId: string) {
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.findOne({
      where: { id: operationId, kind: 'INVITATION_DISPATCH' },
    });
    if (!operation) throw new NotFoundException('Invitation dispatch operation not found');
    if (['COMPLETED', 'FAILED'].includes(operation.status)) return operation;

    operation.status = 'RUNNING';
    operation.error_message = null;
    await operationRepo.save(operation);

    const [group, website] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).findOne({
        where: { id: operation.group_id, website_id: operation.website_id, initiator_user_id: operation.initiator_user_id },
      }),
      this.dataSource.getRepository(Website).findOne({ where: { id: operation.website_id } }),
    ]);
    if (!group || !website || group.workflow_step !== 'INVITATIONS') {
      operation.status = 'FAILED';
      operation.error_message = !group || !website
        ? 'Gathering plan or website was not found'
        : 'Gathering plan is no longer in the invitation stage';
      operation.failed_count = Math.max(operation.total_count, 1);
      await operationRepo.save(operation);
      return operation;
    }

    const [invitations, occurrence] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventInvitation).find({
        where: { group_id: group.id, website_id: operation.website_id, status: 'PENDING' },
        order: { created_at: 'ASC' },
      }),
      this.dataSource.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: group.id, website_id: operation.website_id },
      }),
    ]);
    if (!occurrence) {
      operation.status = 'FAILED';
      operation.error_message = 'Gathering occurrence was not found';
      operation.failed_count = Math.max(operation.total_count, 1);
      await operationRepo.save(operation);
      return operation;
    }
    const pendingEmails = invitations.filter((invitation) => (
      Boolean(invitation.email) && invitation.email_delivery_status !== 'SENT'
    ));
    const initiatorName = await this.getInitiatorName(group.initiator_user_id);

    for (const invitation of pendingEmails) {
      let sent = false;
      let deliveryError = 'Messaging service is unavailable';
      if (this.messagingService) {
        try {
          sent = await this.messagingService.sendEmail({
            to: invitation.email as string,
            template: this.messagingService.gatheringInvitationTemplate,
            context: {
              'invitee-name': invitation.invitee_name ?? 'Peserta',
              'website-name': website.name ?? 'Website',
              'initiator-name': initiatorName,
              'plan-number': group.plan_number,
              'gathering-title': group.title,
              'invite-link': this.invitationLink(website, invitation.id, true),
              'expires-at': invitation.expires_at.toLocaleDateString('id-ID'),
            },
          });
          deliveryError = 'Messaging service failed to send this invitation';
        } catch {
          deliveryError = 'Messaging service failed to send this invitation';
        }
      }

      invitation.email_delivery_status = sent ? 'SENT' : 'FAILED';
      invitation.email_sent_at = sent ? new Date() : null;
      invitation.delivery_error = sent ? null : deliveryError;
      await this.dataSource.getRepository(WebsiteEventInvitation).save(invitation);
      operation.processed_count += 1;
      if (sent) {
        operation.success_count += 1;
      } else {
        operation.failed_count += 1;
        operation.failed_items = [...operation.failed_items, invitation.email as string];
      }
      await operationRepo.save(operation);
    }

    if (operation.failed_count === 0) {
      group.workflow_step = 'INVITATION_CONFIRMATION';
      group.status = 'RSVP_OPEN';
      group.invitation_submitted_at = new Date();
      occurrence.status = 'RSVP_OPEN';
      await this.dataSource.getRepository(WebsiteEventGroup).save(group);
      await this.dataSource.getRepository(GatheringOccurrence).save(occurrence);
    }

    operation.status = operation.failed_count > 0 ? 'FAILED' : 'COMPLETED';
    await operationRepo.save(operation);
    return operation;
  }

  async processInvoiceIssuance(operationId: string) {
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.findOne({ where: { id: operationId } });
    if (!operation || operation.kind !== 'INVOICE_ISSUANCE') throw new NotFoundException('Invoice operation not found');
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
    const initiatorName = await this.getInitiatorName(group.initiator_user_id);

    const registrations = await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: { group_id: group.id, website_id: operation.website_id, registration_status: 'RSVP_CONFIRMED', invoice_issued_at: Not(IsNull()) },
      order: { created_at: 'ASC' },
    });
    operation.total_count = registrations.filter((registration) => !registration.invoice_email_sent_at).length;
    operation.processed_count = 0;
    operation.success_count = 0;
    operation.failed_count = 0;
    operation.failed_items = [];
    await operationRepo.save(operation);

    for (const registration of registrations) {
      if (registration.invoice_email_sent_at) continue;
      let sent = false;
      try {
        const order = registration.order_id
          ? await this.dataSource.getRepository(WebsiteOrder).findOne({
              where: { id: registration.order_id, website_id: operation.website_id },
            })
          : null;
        sent = Boolean(await this.messagingService?.sendEmail({
          to: registration.email,
          template: this.messagingService.gatheringInvoiceTemplate,
          context: {
            'attendee-name': registration.attendee_name,
            'website-name': website?.name ?? 'Gathering',
            'initiator-name': initiatorName,
            'plan-number': group.plan_number,
            'gathering-title': group.title,
            'invoice-link': this.invoiceLink(website, registration.id),
            'order-link': order?.transaction_id
              ? this.orderDetailLink(website, order.transaction_id)
              : this.invoiceLink(website, registration.id),
            'invoice-amount': new Intl.NumberFormat('id-ID', { style: 'currency', currency: occurrence.currency || 'IDR', maximumFractionDigits: 0 }).format(Number(occurrence.price_per_seat)),
            'payment-deadline': occurrence.payment_deadline?.toLocaleString('id-ID') ?? 'Sesuai informasi pada halaman tagihan',
          },
        }));
      } catch (error) {
        operation.error_message = error instanceof Error ? error.message : 'Invoice email delivery failed';
      }
      operation.processed_count += 1;
      if (sent) {
        registration.invoice_email_sent_at = new Date();
        await this.dataSource.getRepository(WebsiteEventRegistration).update(
          { id: registration.id },
          { invoice_email_sent_at: registration.invoice_email_sent_at },
        );
        operation.success_count += 1;
      } else {
        operation.failed_count += 1;
        operation.failed_items = [...operation.failed_items, registration.email];
        operation.error_message ??= 'Messaging service rejected one or more invoice emails. Check messaging service credentials, template configuration, and delivery logs.';
      }
      await operationRepo.save(operation);
    }
    operation.status = operation.failed_count ? 'FAILED' : 'COMPLETED';
    await operationRepo.save(operation);
    return operation;
  }

  async processInvitationRevocation(operationId: string, invitationId: string) {
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const operation = await operationRepo.findOne({ where: { id: operationId, kind: 'INVITATION_REVOCATION' } });
    if (!operation) throw new NotFoundException('Invitation operation not found');
    if (['COMPLETED', 'FAILED'].includes(operation.status)) return operation;
    operation.status = 'RUNNING';
    await operationRepo.save(operation);
    const invitation = await this.dataSource.getRepository(WebsiteEventInvitation).findOne({
      where: { id: invitationId, group_id: operation.group_id, website_id: operation.website_id, status: 'REVOKED' },
    });
    operation.processed_count = 1;
    operation.total_count = 1;
    operation.success_count = invitation ? 1 : 0;
    operation.failed_count = invitation ? 0 : 1;
    operation.failed_items = invitation ? [] : [invitationId];
    operation.status = invitation ? 'COMPLETED' : 'FAILED';
    operation.error_message = invitation ? null : 'Invitation revocation was not persisted';
    return operationRepo.save(operation);
  }

  async getPublicInvoice(registrationId: string, viewerUserId?: string) {
    const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({ where: { id: registrationId } });
    if (!registration || !registration.invoice_is_public || !registration.invoice_issued_at) {
      throw new NotFoundException('Invoice not found');
    }
    const [group, occurrence] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: registration.group_id, website_id: registration.website_id } }),
      this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { id: registration.occurrence_id, website_id: registration.website_id } }),
    ]);
    if (!group || !occurrence) throw new NotFoundException('Invoice not found');
    const initiatorName = await this.getInitiatorName(group.initiator_user_id);
    let transactionId: string | null = null;
    let transactionBuyerUserId: string | null = null;
    if (registration.order_id) {
      const order = await this.dataSource.getRepository(WebsiteOrder).findOne({ where: { id: registration.order_id } });
      if (order?.transaction_id) {
        const transaction = await this.dataSource.getRepository(WebsiteTransaction).findOne({ where: { id: order.transaction_id } });
        if (transaction) {
          transactionId = transaction.id;
          transactionBuyerUserId = transaction.buyer_user_id;
          await this.syncGatheringTransaction(transaction);
          const previousPaymentStatus = registration.payment_status;
          if (registration.payment_status !== 'REFUNDED') {
            if (transaction.status === 'REFUNDED') registration.payment_status = 'REFUNDED';
            else if (['HELD', 'COMPLETED'].includes(transaction.status)) registration.payment_status = 'PAID';
            else if (transaction.status === 'PENDING_PAYMENT') registration.payment_status = 'PENDING_PAYMENT';
          }
          // Jangan `.save(registration)`: entity dimuat sebelum sync escrow yang lambat, jadi
          // kolom lain (mis. attendance_token yang baru dibuat) akan ditimpa nilai basi.
          if (registration.payment_status !== previousPaymentStatus) {
            await this.dataSource.getRepository(WebsiteEventRegistration).update(
              { id: registration.id },
              { payment_status: registration.payment_status },
            );
          }
        }
      }
    }
    return {
      id: registration.id,
      invoice_id: `GTH-${registration.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
      gathering_title: group.title,
      plan_number: group.plan_number,
      initiator_name: initiatorName,
      attendee_name: registration.attendee_name,
      amount: Number(occurrence.price_per_seat),
      currency: occurrence.currency,
      payment_status: registration.payment_status,
      invoice_issued_at: registration.invoice_issued_at,
      payment_deadline: occurrence.payment_deadline,
      event_date: occurrence.final_schedule,
      payment_open: group.status === 'PAYMENT_OPEN' && occurrence.status === 'PAYMENT_OPEN',
      ...(viewerUserId && transactionId ? {
        transaction_id: transactionId,
        can_view_transaction: transactionBuyerUserId === viewerUserId,
      } : {}),
    };
  }

  async listInvoicesForUser(authUser: AuthUser, websiteId?: string) {
    const email = authUser.email?.trim().toLowerCase();
    const scope = websiteId ? { website_id: websiteId } : {};
    const registrations = await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: email
        ? [
            { ...scope, email, registration_status: 'RSVP_CONFIRMED' },
            { ...scope, payer_user_id: authUser.userId, registration_status: 'RSVP_CONFIRMED' },
          ]
        : { ...scope, payer_user_id: authUser.userId, registration_status: 'RSVP_CONFIRMED' },
      order: { created_at: 'DESC' },
    });
    const results = [];
    for (const registration of registrations) {
      try {
        const [group, occurrence] = await Promise.all([
          this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: registration.group_id, website_id: registration.website_id } }),
          this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { id: registration.occurrence_id, website_id: registration.website_id } }),
        ]);
        if (!group || !occurrence) continue;
        const canPay = Boolean(email && registration.email.trim().toLowerCase() === email)
          || registration.payer_user_id === authUser.userId;
        if (!registration.invoice_issued_at) {
          results.push({
            id: registration.id,
            invoice_id: `GTH-${registration.id.replace(/-/g, '').slice(0, 8).toUpperCase()}`,
            gathering_title: group.title,
            plan_number: group.plan_number,
            attendee_name: registration.attendee_name,
            amount: Number(occurrence.price_per_seat),
            currency: occurrence.currency,
            payment_status: 'NOT_ISSUED',
            invoice_status: 'SCHEDULED',
            invoice_issued_at: null,
            payment_deadline: occurrence.payment_deadline,
            event_date: occurrence.final_schedule,
            payment_open: false,
            can_pay: false,
            is_initiator: group.initiator_user_id === authUser.userId,
          });
          continue;
        }
        const invoice = await this.getPublicInvoice(registration.id, authUser.userId);
        results.push({ ...invoice, invoice_status: 'ISSUED', group_id: registration.group_id, can_pay: canPay, is_initiator: group.initiator_user_id === authUser.userId });
      } catch {
        // Ignore invoices that were withdrawn or whose gathering record was removed.
      }
    }
    return results;
  }

  async resendInvoiceEmails(groupId: string, websiteId: string, initiatorUserId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group || group.status !== 'PAYMENT_OPEN') throw new NotFoundException('Gathering payment invoices not found');
    const operationRepo = this.dataSource.getRepository(GatheringOperation);
    const activeOperation = await operationRepo.findOne({
      where: {
        group_id: group.id,
        website_id: websiteId,
        kind: 'INVOICE_ISSUANCE',
        status: In(['QUEUED', 'RUNNING']),
      },
    });
    if (activeOperation) throw new ConflictException('Invoice email delivery is already in progress');

    const registrations = (await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: { group_id: group.id, website_id: websiteId, registration_status: 'RSVP_CONFIRMED', invoice_issued_at: Not(IsNull()) },
      order: { created_at: 'ASC' },
    })).filter((registration) => !['PAID', 'REFUNDED'].includes(registration.payment_status));
    if (!registrations.length) {
      return { sent_count: 0, failed_count: 0, failed_emails: [], operation_status: 'COMPLETED' };
    }

    for (const registration of registrations) registration.invoice_email_sent_at = null;
    await this.dataSource.getRepository(WebsiteEventRegistration).update(
      { id: In(registrations.map((registration) => registration.id)) },
      { invoice_email_sent_at: null },
    );

    const operation = await operationRepo.save(operationRepo.create({
      website_id: websiteId,
      group_id: groupId,
      initiator_user_id: initiatorUserId,
      kind: 'INVOICE_ISSUANCE',
      status: 'QUEUED',
      total_count: registrations.length,
      processed_count: 0,
      success_count: 0,
      failed_count: 0,
      failed_items: [],
      error_message: null,
    }));

    try {
      await this.enqueueOperationJob(ISSUE_GATHERING_INVOICES_JOB, { operationId: operation.id }, {
        jobId: `gathering-invoices-${operation.id}`,
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: 1000,
        removeOnFail: 5000,
      });
    } catch (cause) {
      operation.status = 'FAILED';
      operation.error_message = cause instanceof Error ? cause.message : 'Invoice job enqueue failed';
      operation.failed_count = registrations.length;
      operation.failed_items = registrations.map((registration) => registration.email);
      await operationRepo.save(operation);
    }

    return {
      operation_id: operation.id,
      operation_status: operation.status,
      total_count: operation.total_count,
      processed_count: operation.processed_count,
      success_count: operation.success_count,
      failed_count: operation.failed_count,
      failed_items: operation.failed_items,
      error_message: operation.error_message,
    };
  }

  async confirmGathering(
    groupId: string,
    websiteId: string,
    initiatorUserId: string,
    dto: ConfirmGatheringEventDto,
  ) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (group.workflow_step !== 'PAYMENT_CONFIRMATION' || group.status !== 'PAYMENT_OPEN') {
      throw new BadRequestException('Gathering is not ready for final confirmation');
    }
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId },
    });
    if (!occurrence) throw new NotFoundException('Gathering occurrence not found');

    const openedOptionIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
    const openedOptions = occurrence.option_groups_snapshot.filter((option) =>
      openedOptionIds.has(String(option.product_option_id)));
    const optionGroupKeys = new Set(openedOptions.map((option) => String(option.option_group_key)));
    const selectedByGroup = new Map<string, string>();
    for (const selection of dto.final_selections ?? []) {
      if (!optionGroupKeys.has(selection.option_group_key) || selectedByGroup.has(selection.option_group_key)) {
        throw new BadRequestException('Pilih tepat satu opsi final untuk setiap kelompok voting');
      }
      const selectedOption = openedOptions.find((option) =>
        String(option.product_option_id) === selection.option_id
        && String(option.option_group_key) === selection.option_group_key);
      if (!selectedOption) throw new BadRequestException('Opsi final harus berasal dari pilihan voting yang dibuka');
      selectedByGroup.set(selection.option_group_key, selection.option_id);
    }
    if (selectedByGroup.size !== optionGroupKeys.size) {
      throw new BadRequestException('Pilih satu opsi final untuk setiap kelompok voting');
    }

    const registrations = await this.listRegistrations(groupId, websiteId, initiatorUserId);
    const paidRegistrations = registrations.filter((registration) => registration.registration_status === 'RSVP_CONFIRMED' && registration.payment_status === 'PAID');
    if (paidRegistrations.length < occurrence.min_attendees) {
      throw new BadRequestException(`Minimum paid seats not reached (${paidRegistrations.length}/${occurrence.min_attendees})`);
    }
    if (paidRegistrations.length > occurrence.max_attendees) {
      throw new BadRequestException('Paid seats exceed the gathering capacity');
    }

    const confirmed = await this.dataSource.transaction(async (manager) => {
      const groups = manager.getRepository(WebsiteEventGroup);
      const lockedGroup = await groups.findOne({
        where: { id: group.id, website_id: websiteId, initiator_user_id: initiatorUserId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedGroup || lockedGroup.status !== 'PAYMENT_OPEN') {
        throw new BadRequestException('Gathering status changed while confirming the event');
      }
      const lockedOccurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { id: occurrence.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!lockedOccurrence) throw new NotFoundException('Gathering occurrence not found');
      lockedOccurrence.option_groups_snapshot = lockedOccurrence.option_groups_snapshot.map((option) => {
        const selectedOptionId = selectedByGroup.get(String(option.option_group_key));
        return selectedOptionId
          ? { ...option, is_final_selection: String(option.product_option_id) === selectedOptionId }
          : option;
      });
      lockedGroup.status = 'CONFIRMED';
      lockedOccurrence.status = 'CONFIRMED';
      await groups.save(lockedGroup);
      await manager.getRepository(GatheringOccurrence).save(lockedOccurrence);
      return { group: lockedGroup, occurrence: lockedOccurrence };
    });

    // Model C: DP per seat dirilis otomatis setelah confirm; sisa dirilis saat admin
    // tenant menandai acara selesai. Kegagalan rilis tidak membatalkan confirm — admin
    // tenant bisa menjalankan ulang dari detail acara.
    const depositRelease = this.settlementService
      ? await this.settlementService.releaseStage(confirmed.group, confirmed.occurrence, 'DEPOSIT')
      : null;
    // Tiket QR dikirim saat confirm (keputusan 23 Okt 2026); gagal antre tidak membatalkan
    // confirm — admin tenant bisa "Kirim tiket" ulang dari detail acara.
    const ticketIssuance = this.attendanceService
      ? await this.attendanceService.issueTickets(confirmed.group.id, websiteId).catch(() => null)
      : null;

    return {
      ...confirmed.group,
      occurrence: confirmed.occurrence,
      paid_seat_count: paidRegistrations.length,
      released_deposit_total: depositRelease?.released_total ?? 0,
      deposit_release_failed_count: depositRelease?.failed_count ?? 0,
      ticket_operation_id: ticketIssuance?.operation_id ?? null,
      final_selections: [...selectedByGroup.entries()].map(([option_group_key, option_id]) => ({ option_group_key, option_id })),
    };
  }

  private async getInvitationPreviewForRecord(invitation: WebsiteEventInvitation) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({
      where: { id: invitation.group_id, website_id: invitation.website_id },
    });
    if (!group || !['PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'COMPLETED', 'CANCELLED'].includes(group.status)) {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: invitation.website_id },
    });
    if (!occurrence || !['PREORDER', 'RSVP_OPEN', 'PAYMENT_OPEN', 'CONFIRMED', 'COMPLETED', 'CANCELLED'].includes(occurrence.status)) {
      throw new NotFoundException('Invitation is invalid or expired');
    }
    const initiatorName = await this.getInitiatorName(group.initiator_user_id);

    const openedIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
    const votingResults = await this.getVotingResults(
      occurrence,
      this.dataSource.getRepository(WebsiteEventRegistration),
    );
    return {
      invitation: {
        invitee_name: invitation.invitee_name,
        invitee_email_masked: maskEmail(invitation.email),
        expires_at: invitation.expires_at,
      },
      group: {
        id: group.id,
        title: group.title,
        plan_number: group.plan_number,
        initiator_name: initiatorName,
        invite_policy: group.invite_policy,
        workflow_step: group.workflow_step,
        invitation_banner_url: group.invitation_banner_url,
        invitation_description: group.invitation_description,
      },
      occurrence: {
        status: occurrence.status,
        price_per_seat: occurrence.price_per_seat,
        currency: occurrence.currency,
        min_attendees: occurrence.min_attendees,
        max_attendees: occurrence.max_attendees,
        final_schedule: occurrence.final_schedule,
        rsvp_close_at: occurrence.rsvp_close_at,
        payment_deadline: occurrence.payment_deadline,
        options: occurrence.option_groups_snapshot.filter((option) => openedIds.has(String(option.product_option_id))),
        voting_results: votingResults,
      },
    };
  }
}

/** Mode checkout produk (dipakai order seat nanti); default ESCROW seperti alur gathering di plan §4. */
function resolvePaymentMode(product: WebsiteProduct): 'ADD_TO_CART' | 'ESCROW' {
  const entry = (product.payment_meta ?? []).find(
    (meta) => meta.payment_mode === 'ESCROW' || meta.payment_mode === 'ADD_TO_CART',
  );
  return (entry?.payment_mode as 'ADD_TO_CART' | 'ESCROW' | undefined) ?? 'ESCROW';
}

/** `permatasari@gmail.com` -> `pe•••••••@gmail.com`; null bila tidak ada email. */
export function maskEmail(email?: string | null): string | null {
  const value = email?.trim().toLowerCase();
  if (!value) return null;
  const [local, domain] = value.split('@');
  if (!domain) return null;
  const visible = local.slice(0, Math.min(2, Math.max(local.length - 1, 1)));
  return `${visible}${'•'.repeat(Math.max(local.length - visible.length, 3))}@${domain}`;
}
