import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, IsNull, MoreThan } from 'typeorm';

import type { AuthUser } from '../../common/auth';
import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { User } from '../../entities/user.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventInvitation } from '../../entities/website-event-invitation.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { Website } from '../../entities/website.entity';
import { generateAttendanceToken } from './gathering-attendance.service';
import { gatheringTicketLink } from './gathering-links.util';

export type MyInvitationAction =
  | 'RSVP'
  | 'WAITING_INVOICE'
  | 'PAY'
  | 'PAYMENT_PENDING'
  | 'WAITING_CONFIRMATION'
  | 'TICKET'
  | 'ATTENDED'
  | 'NONE';

export interface MyInvitationItem {
  /** registration id, atau invitation id untuk undangan yang belum dijawab. */
  id: string;
  kind: 'INVITATION' | 'REGISTRATION';
  group_id: string;
  gathering_title: string;
  plan_number: string;
  initiator_name: string;
  event_date: Date | null;
  event_location: string | null;
  gathering_status: string;
  attendee_name: string | null;
  registration_status: string | null;
  payment_status: string | null;
  checked_in_at: Date | null;
  /** true bila email seat = email login; hanya pemilik seat yang melihat QR tiket. */
  is_attendee: boolean;
  action: MyInvitationAction;
  /** Path relatif terhadap base renderer tenant: detail reservasi, atau halaman RSVP untuk undangan baru. */
  action_path: string | null;
}

export interface MyReservationDetail extends Omit<MyInvitationItem, 'kind' | 'action_path'> {
  final_options: string[];
  price_per_seat: number;
  currency: string;
  payment_deadline: Date | null;
  /** Path halaman tagihan bila tagihan sudah terbit. */
  invoice_path: string | null;
  /** Hanya untuk pemilik seat lunas pada acara yang sudah dikonfirmasi. `url` = isi QR. */
  ticket: { url: string; status: 'VALID' | 'CHECKED_IN' } | null;
}

const ACTIVE_EVENT_STATUSES = ['CONFIRMED', 'IN_PROGRESS', 'COMPLETED'];

/**
 * Tab "Undangan" di kalender renderer: undangan INVITE_ONLY yang belum dijawab + seat
 * yang terdaftar atas email login atau dibayar user ini. Diurutkan tanggal acara naik;
 * pengelompokan akan datang / belum dijadwalkan / sudah lewat dilakukan di renderer.
 */
@Injectable()
export class GatheringMyInvitationsService {
  constructor(private readonly dataSource: DataSource) {}

  async listMyInvitations(authUser: AuthUser, websiteId: string): Promise<MyInvitationItem[]> {
    if (!websiteId) throw new BadRequestException('website_id is required');
    const email = authUser.email?.trim().toLowerCase() ?? null;

    const registrations = await this.dataSource.getRepository(WebsiteEventRegistration).find({
      where: [
        ...(email ? [{ website_id: websiteId, email }] : []),
        { website_id: websiteId, payer_user_id: authUser.userId },
        { website_id: websiteId, buyer_user_id: authUser.userId },
      ],
    });
    const uniqueRegistrations = [...new Map(registrations
      .filter((registration) => registration.registration_status !== 'REJECTED')
      .map((registration) => [registration.id, registration])).values()];

    const answeredInvitationIds = new Set(uniqueRegistrations.map((registration) => registration.invitation_id));
    const pendingInvitations = email
      ? (await this.dataSource.getRepository(WebsiteEventInvitation).find({
          where: { website_id: websiteId, email, status: 'PENDING', expires_at: MoreThan(new Date()) },
        })).filter((invitation) => !answeredInvitationIds.has(invitation.id))
      : [];

    const groupIds = [...new Set([
      ...uniqueRegistrations.map((registration) => registration.group_id),
      ...pendingInvitations.map((invitation) => invitation.group_id),
    ])];
    if (!groupIds.length) return [];

    const [groups, occurrences] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).find({ where: { id: In(groupIds), website_id: websiteId } }),
      this.dataSource.getRepository(GatheringOccurrence).find({ where: { parent_order_id: In(groupIds), website_id: websiteId } }),
    ]);
    const groupById = new Map(groups.map((group) => [group.id, group]));
    const occurrenceByGroupId = new Map(occurrences.map((occurrence) => [occurrence.parent_order_id, occurrence]));
    const initiatorNames = await this.initiatorNames([...new Set(groups.map((group) => group.initiator_user_id))]);

    const items: MyInvitationItem[] = [];
    for (const invitation of pendingInvitations) {
      const group = groupById.get(invitation.group_id);
      const occurrence = occurrenceByGroupId.get(invitation.group_id);
      // Hanya undangan personal (INVITE_ONLY) yang masih menerima RSVP.
      if (!group || !occurrence || group.invite_policy !== 'INVITE_ONLY' || group.status !== 'RSVP_OPEN') continue;
      items.push({
        ...this.eventFields(group, occurrence, initiatorNames),
        id: invitation.id,
        kind: 'INVITATION',
        attendee_name: invitation.invitee_name,
        registration_status: null,
        payment_status: null,
        checked_in_at: null,
        is_attendee: true,
        action: 'RSVP',
        action_path: `/gathering/invite/id/${encodeURIComponent(invitation.id)}`,
      });
    }

    for (const registration of uniqueRegistrations) {
      const group = groupById.get(registration.group_id);
      const occurrence = occurrenceByGroupId.get(registration.group_id);
      if (!group || !occurrence) continue;
      const isAttendee = Boolean(email && registration.email.trim().toLowerCase() === email);
      items.push({
        ...this.eventFields(group, occurrence, initiatorNames),
        id: registration.id,
        kind: 'REGISTRATION',
        attendee_name: registration.attendee_name,
        registration_status: registration.registration_status,
        payment_status: registration.payment_status,
        checked_in_at: registration.checked_in_at,
        is_attendee: isAttendee,
        action: this.resolveAction(group, registration, isAttendee),
        action_path: `/gathering/reservation/${encodeURIComponent(registration.id)}`,
      });
    }

    return items.sort((a, b) => {
      if (!a.event_date && !b.event_date) return a.gathering_title.localeCompare(b.gathering_title, 'id');
      if (!a.event_date) return 1;
      if (!b.event_date) return -1;
      return new Date(a.event_date).getTime() - new Date(b.event_date).getTime();
    });
  }

  /**
   * Detail reservasi (renderer `/gathering/reservation/{id}`): pemilik seat atau pembayarnya.
   * QR tiket hanya untuk pemilik seat, seat lunas, dan acara yang sudah dikonfirmasi.
   */
  async getReservation(authUser: AuthUser, registrationId: string, websiteId: string): Promise<MyReservationDetail> {
    if (!websiteId) throw new BadRequestException('website_id is required');
    const email = authUser.email?.trim().toLowerCase() ?? null;
    const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({
      where: { id: registrationId, website_id: websiteId },
    });
    const isAttendee = Boolean(registration && email && registration.email.trim().toLowerCase() === email);
    if (!registration || (!isAttendee && registration.payer_user_id !== authUser.userId && registration.buyer_user_id !== authUser.userId)) {
      throw new NotFoundException('Reservation not found');
    }
    const [group, occurrence, website] = await Promise.all([
      this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: registration.group_id, website_id: websiteId } }),
      this.dataSource.getRepository(GatheringOccurrence).findOne({ where: { id: registration.occurrence_id, website_id: websiteId } }),
      this.dataSource.getRepository(Website).findOne({ where: { id: websiteId } }),
    ]);
    if (!group || !occurrence) throw new NotFoundException('Reservation not found');
    if (isAttendee) await this.ensureTicketToken(group, registration);
    const initiatorNames = await this.initiatorNames([group.initiator_user_id]);

    const ticketEligible = isAttendee
      && registration.registration_status === 'RSVP_CONFIRMED'
      && registration.payment_status === 'PAID'
      && ACTIVE_EVENT_STATUSES.includes(group.status)
      && Boolean(registration.attendance_token);
    return {
      ...this.eventFields(group, occurrence, initiatorNames),
      id: registration.id,
      attendee_name: registration.attendee_name,
      registration_status: registration.registration_status,
      payment_status: registration.payment_status,
      checked_in_at: registration.checked_in_at,
      is_attendee: isAttendee,
      action: this.resolveAction(group, registration, isAttendee),
      final_options: (occurrence.option_groups_snapshot ?? [])
        .filter((option) => option.is_final_selection)
        .map((option) => String(option.label ?? option.option_key ?? ''))
        .filter(Boolean),
      price_per_seat: Number(occurrence.price_per_seat),
      currency: occurrence.currency,
      payment_deadline: occurrence.payment_deadline ?? null,
      invoice_path: registration.invoice_issued_at ? `/gathering/invoice/${encodeURIComponent(registration.id)}` : null,
      ticket: ticketEligible
        ? {
            url: gatheringTicketLink(website, registration.attendance_token as string),
            status: registration.checked_in_at ? 'CHECKED_IN' : 'VALID',
          }
        : null,
    };
  }

  private resolveAction(group: WebsiteEventGroup, registration: WebsiteEventRegistration, isAttendee: boolean): MyInvitationAction {
    if (registration.registration_status === 'CANCELLED' || group.status === 'CANCELLED') return 'NONE';
    if (registration.payment_status === 'PAID') {
      if (!ACTIVE_EVENT_STATUSES.includes(group.status)) return 'WAITING_CONFIRMATION';
      // Tiket hanya untuk pemilik seat; pembayar seat orang lain cukup melihat status lunas.
      if (!isAttendee) return 'NONE';
      return registration.checked_in_at ? 'ATTENDED' : 'TICKET';
    }
    if (registration.payment_status === 'REFUNDED') return 'NONE';
    if (!registration.invoice_issued_at) return 'WAITING_INVOICE';
    if (registration.payment_status === 'PENDING_PAYMENT') return 'PAYMENT_PENDING';
    return group.status === 'PAYMENT_OPEN' ? 'PAY' : 'NONE';
  }

  /**
   * Tiket tidak boleh bergantung pada hook confirm/antrean email: seat lunas milik user
   * yang belum punya token (mis. acara dikonfirmasi sebelum fitur tiket, atau antrean
   * gagal) mendapat token saat pemiliknya membuka detail reservasi.
   */
  private async ensureTicketToken(group: WebsiteEventGroup, registration: WebsiteEventRegistration) {
    if (
      registration.attendance_token
      || registration.registration_status !== 'RSVP_CONFIRMED'
      || registration.payment_status !== 'PAID'
      || !ACTIVE_EVENT_STATUSES.includes(group.status)
    ) return;
    const repo = this.dataSource.getRepository(WebsiteEventRegistration);
    const token = generateAttendanceToken();
    const issuedAt = new Date();
    // Kondisional supaya dua request bersamaan tidak saling menimpa token.
    const result = await repo.update(
      { id: registration.id, attendance_token: IsNull() },
      { attendance_token: token, ticket_issued_at: issuedAt },
    );
    if (result.affected) {
      registration.attendance_token = token;
      registration.ticket_issued_at = issuedAt;
      return;
    }
    const current = await repo.findOne({ where: { id: registration.id }, select: { id: true, attendance_token: true } });
    registration.attendance_token = current?.attendance_token ?? null;
  }

  private eventFields(group: WebsiteEventGroup, occurrence: GatheringOccurrence, initiatorNames: Map<string, string>) {
    return {
      group_id: group.id,
      gathering_title: group.title,
      plan_number: group.plan_number,
      initiator_name: initiatorNames.get(group.initiator_user_id) ?? 'Penyelenggara gathering',
      event_date: occurrence.final_schedule ?? null,
      event_location: occurrence.final_location ?? null,
      gathering_status: group.status,
    };
  }

  private async initiatorNames(userIds: string[]) {
    if (!userIds.length) return new Map<string, string>();
    const users = await this.dataSource.getRepository(User).find({
      where: { id: In(userIds) },
      select: { id: true, name: true, username: true },
    });
    return new Map(users.map((user) => [user.id, user.name?.trim() || user.username?.trim() || 'Penyelenggara gathering']));
  }
}
