import { BadGatewayException, BadRequestException, ConflictException, HttpException, HttpStatus, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { createHash, createHmac, randomInt, randomUUID, timingSafeEqual } from 'crypto';
import { DataSource, In, MoreThan, Not } from 'typeorm';

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
import { EscrowClientService } from '../escrow/escrow-client.service';

import { assertUniformGatheringOptionConfig } from '../products/gathering-product-options.validation';
import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import { CreateGatheringInvitationDto } from './dto/create-gathering-invitation.dto';
import { SubmitGatheringRsvpDto } from './dto/submit-gathering-rsvp.dto';
import type { GatheringOrderMeta } from './gathering-order.util';
import { VerifyGatheringRsvpOtpDto } from './dto/verify-gathering-rsvp-otp.dto';
import { RejectGatheringRegistrationsDto } from './dto/reject-gathering-registrations.dto';

/** Plan yang sudah selesai/batal tidak lagi tampil di cart initiator. */
const CLOSED_PLAN_STATUSES = ['CANCELLED', 'COMPLETED'];

@Injectable()
export class GatheringOccurrenceService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly messagingService?: MessagingService,
    @Optional() private readonly escrowClient?: EscrowClientService,
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

      return { ...group, occurrence };
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
    return { ...group, occurrence };
  }

  async listPlansForInitiator(websiteId: string, initiatorUserId: string) {
    const groups = await this.dataSource.getRepository(WebsiteEventGroup).find({
      where: { website_id: websiteId, initiator_user_id: initiatorUserId, status: Not(In(CLOSED_PLAN_STATUSES)) },
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
      if (dto.event_at !== undefined) occurrence.final_schedule = eventAt?.toISOString() ?? null;

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
    let failedEmails = 0;

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
      const website = await this.dataSource.getRepository(Website).findOne({ where: { id: websiteId } });
      for (const invitation of pendingInvitations) {
        if (!invitation.email || invitation.email_delivery_status === 'SENT') continue;
        if (!this.messagingService) {
          invitation.email_delivery_status = 'FAILED';
          invitation.delivery_error = 'Messaging service is unavailable';
          failedEmails += 1;
          await invitations.save(invitation);
          continue;
        }
        const link = this.invitationLink(website, invitation.id, true);
        const sent = await this.messagingService.sendEmail({
          to: invitation.email,
          template: this.messagingService.gatheringInvitationTemplate,
          context: {
            'invitee-name': invitation.invitee_name ?? 'Peserta',
            'website-name': website?.name ?? 'Website',
            'gathering-title': group.title,
            'invite-link': link,
            'expires-at': invitation.expires_at.toLocaleDateString('id-ID'),
          },
        });
        invitation.email_delivery_status = sent ? 'SENT' : 'FAILED';
        invitation.email_sent_at = sent ? new Date() : null;
        invitation.delivery_error = sent ? null : 'Messaging service failed to send this invitation';
        if (!sent) failedEmails += 1;
        await invitations.save(invitation);
      }
    }

    if (failedEmails > 0) {
      return {
        submitted: false,
        failed_emails: failedEmails,
        message: 'Sebagian email gagal dikirim. Perbaiki atau coba submit lagi; undangan WhatsApp tetap dibagikan manual.',
        public_invitation: publicInvitation ? this.toPublicInvitation(publicInvitation) : null,
      };
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

  private invitationBaseUrl(website?: Website | null) {
    if (website?.domain && website.domain_verified_at) return `https://${website.domain}`;
    const platformHost = (process.env.PLATFORM_HOST || 'sites.bagdja.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (process.env.NODE_ENV !== 'production') return process.env.SITE_APP_URL || 'http://localhost:5005';
    return `https://${website?.slug ?? ''}.${platformHost}`;
  }

  private invitationLink(website: Website | null | undefined, invitationId: string, isPrivate = false) {
    const base = this.invitationBaseUrl(website).replace(/\/$/, '');
    const isPathRouted = process.env.NODE_ENV !== 'production' && /localhost|127\.0\.0\.1/.test(base);
    const tenantPath = isPathRouted && website?.slug ? `/${website.slug}` : '';
    const privatePath = isPrivate ? '/id' : '';
    return `${base}${tenantPath}/gathering/invite${privatePath}/${encodeURIComponent(invitationId)}`;
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
    const { token_hash: _tokenHash, ...safeInvitation } = saved;
    return safeInvitation;
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

  async getPrivateInvitationStatus(invitationId: string, authUser: AuthUser) {
    const invitation = await this.dataSource.getRepository(WebsiteEventInvitation).findOne({
      where: { id: invitationId, email: authUser.email?.trim().toLowerCase() },
    });
    if (!invitation) throw new NotFoundException('Invitation not found for this account');
    const registration = await this.dataSource.getRepository(WebsiteEventRegistration).findOne({
      where: { invitation_id: invitation.id, email: authUser.email?.trim().toLowerCase(), registration_status: 'RSVP_CONFIRMED' },
    });
    if (!registration) return { registration: null };
    const receipt = await this.getRegistrationReceipt(registration.id, authUser);
    return {
      registration: {
        id: registration.id,
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
    const sent = await this.messagingService?.sendEmail({
      to: reservation.challenge.email,
      template: this.messagingService.gatheringRsvpOtpTemplate,
      context: {
        'invitee-name': reservation.challenge.reservation_data.attendee_name,
        'website-name': website?.name ?? 'Gathering',
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

  async submitRsvp(token: string, dto: SubmitGatheringRsvpDto, authUser?: AuthUser) {
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

      const normalizedEmail = dto.email.trim().toLowerCase();
      const invitedEmail = invitation.email?.trim().toLowerCase();
      const normalizedWhatsapp = dto.whatsapp?.replace(/[\s().-]/g, '') || null;
      if (group.invite_policy === 'INVITE_ONLY') {
        if (!authUser?.email) throw new BadRequestException('Sign in with the invited account to confirm this private invitation');
        if (invitedEmail && (invitedEmail !== normalizedEmail || authUser.email.trim().toLowerCase() !== invitedEmail)) {
          throw new BadRequestException('Sign in with the email address this invitation was sent to');
        }
        if (!invitedEmail && invitation.whatsapp) {
          if (authUser.email.trim().toLowerCase() !== normalizedEmail) {
            throw new BadRequestException('Use the email address of your signed-in account for this RSVP');
          }
          if (invitation.whatsapp.replace(/[^0-9+]/g, '') !== normalizedWhatsapp) {
            throw new BadRequestException('RSVP WhatsApp must match the invited number');
          }
        }
      }
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
        attendee_name: dto.attendee_name.trim(),
        email: normalizedEmail,
        whatsapp: normalizedWhatsapp,
        selected_options: dto.selected_options,
        buyer_user_id: authUser?.userId ?? null,
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
      const paymentStatus = transaction?.status === 'REFUNDED'
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
      return { ...registration, payment_status: paymentStatus, selected_option_details: selectedOptionDetails };
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
      return { selected, groupTitle: group.title, websiteName: website?.name ?? 'Gathering' };
    });

    const failedEmails: string[] = [];
    for (const registration of rejected.selected) {
      const sent = await this.messagingService?.sendEmail({
        to: registration.email,
        template: this.messagingService.gatheringRsvpRejectedTemplate,
        context: {
          'attendee-name': registration.attendee_name,
          'gathering-title': rejected.groupTitle,
          'website-name': rejected.websiteName,
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
      if (!registration || registration.email.trim().toLowerCase() !== authUser.email?.trim().toLowerCase()) {
        throw new NotFoundException('Registration not found for this account');
      }
      if (registration.buyer_user_id && registration.buyer_user_id !== authUser.userId) {
        throw new NotFoundException('Registration not found for this account');
      }
      if (registration.registration_status !== 'RSVP_CONFIRMED') {
        throw new BadRequestException('This RSVP is no longer active');
      }
      if (registration.order_id) return manager.getRepository(WebsiteOrder).findOne({ where: { id: registration.order_id } });

      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: registration.group_id, website_id: registration.website_id } });
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

      const price = Number(occurrence.price_per_seat);
      const meta: GatheringOrderMeta = { role: 'participant', group_id: group.id, occurrence_id: occurrence.id };
      const orderRepo = manager.getRepository(WebsiteOrder);
      const order = await orderRepo.save(orderRepo.create({
        website_id: registration.website_id,
        product_id: product.id,
        location_id: null,
        buyer_user_id: authUser.userId,
        buyer_identifier: authUser.email ?? authUser.username ?? null,
        quantity: 1,
        unit_price: price,
        total_amount: price,
        currency: occurrence.currency,
        payment_mode: resolvePaymentMode(product),
        status: 'PENDING',
        parent_order_id: group.order_id,
        metadata: { source: 'gathering_seat', gathering: meta, registration_id: registration.id },
      }));
      registration.buyer_user_id = authUser.userId;
      registration.order_id = order.id;
      registration.payment_status = 'UNPAID';
      await registrations.save(registration);
      return order;
    });
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
        if (transaction?.status === 'REFUNDED') paymentStatus = 'REFUNDED';
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

  private async syncGatheringTransaction(transaction: WebsiteTransaction) {
    if (!this.escrowClient) return;
    try {
      if (transaction.payment_mode === 'ESCROW' && transaction.escrow_id && ['PENDING_PAYMENT', 'HELD', 'DISPUTED'].includes(transaction.status)) {
        const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
        if (escrow.status !== transaction.status) {
          transaction.status = escrow.status;
          await this.dataSource.getRepository(WebsiteTransaction).save(transaction);
        }
      } else if (transaction.payment_mode === 'ADD_TO_CART' && transaction.payment_request_id && transaction.status === 'PENDING_PAYMENT') {
        const payment = await this.escrowClient.getDirectPaymentStatus(transaction.payment_request_id);
        if (payment.status === 'PAID') {
          transaction.status = 'COMPLETED';
          await this.dataSource.getRepository(WebsiteTransaction).save(transaction);
        }
      }
    } catch {
      // Preserve the last known local state if the payment service is temporarily unavailable.
    }
  }

  async confirmReservations(groupId: string, websiteId: string, initiatorUserId: string) {
    return this.dataSource.transaction(async (manager) => {
      const groups = manager.getRepository(WebsiteEventGroup);
      const group = await groups.findOne({ where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId } });
      if (!group) throw new NotFoundException('Gathering plan not found');
      if (group.workflow_step !== 'INVITATION_CONFIRMATION') throw new BadRequestException('Gathering is not ready for reservation confirmation');
      const occurrenceRepo = manager.getRepository(GatheringOccurrence);
      const occurrence = await occurrenceRepo.findOne({ where: { parent_order_id: group.id, website_id: websiteId } });
      if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
      if (!occurrence.final_schedule || !occurrence.payment_deadline) {
        throw new BadRequestException('Event date and payment deadline must be set before opening participant payments');
      }
      const registrationCount = await manager.getRepository(WebsiteEventRegistration).count({
        where: { group_id: group.id, website_id: websiteId, registration_status: 'RSVP_CONFIRMED' },
      });
      if (registrationCount === 0) {
        throw new BadRequestException('At least one confirmed RSVP is required before opening participant payments');
      }
      group.workflow_step = 'PAYMENT_CONFIRMATION';
      group.status = 'PAYMENT_OPEN';
      occurrence.status = 'PAYMENT_OPEN';
      await groups.save(group);
      await occurrenceRepo.save(occurrence);
      return { ...group, occurrence, registration_count: registrationCount };
    });
  }

  async confirmGathering(groupId: string, websiteId: string, initiatorUserId: string) {
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

    const registrations = await this.listRegistrations(groupId, websiteId, initiatorUserId);
    const paidRegistrations = registrations.filter((registration) => registration.payment_status === 'PAID');
    if (paidRegistrations.length < occurrence.min_attendees) {
      throw new BadRequestException(`Minimum paid seats not reached (${paidRegistrations.length}/${occurrence.min_attendees})`);
    }
    if (paidRegistrations.length > occurrence.max_attendees) {
      throw new BadRequestException('Paid seats exceed the gathering capacity');
    }

    const paidOrders = paidRegistrations.flatMap((registration) => registration.order_id ? [registration.order_id] : []);
    const orders = await this.dataSource.getRepository(WebsiteOrder).find({ where: { id: In(paidOrders) } });
    const transactionIds = orders.flatMap((order) => order.transaction_id ? [order.transaction_id] : []);
    const transactions = transactionIds.length
      ? await this.dataSource.getRepository(WebsiteTransaction).find({ where: { id: In(transactionIds) } })
      : [];
    for (const transaction of transactions) {
      if (transaction.payment_mode !== 'ESCROW' || !transaction.escrow_id) continue;
      if (!this.escrowClient) throw new BadRequestException('Escrow payment service is unavailable');
      const escrow = await this.escrowClient.getEscrow(transaction.escrow_id);
      if (escrow.status === 'HELD') {
        await this.escrowClient.release(
          transaction.escrow_id,
          undefined,
          `gathering-confirm:${occurrence.id}`,
        );
      } else if (escrow.status !== 'COMPLETED') {
        throw new BadRequestException(`Paid seat escrow ${transaction.escrow_id} cannot be released from ${escrow.status}`);
      }
    }

    return this.dataSource.transaction(async (manager) => {
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
      lockedGroup.status = 'CONFIRMED';
      lockedOccurrence.status = 'CONFIRMED';
      await groups.save(lockedGroup);
      await manager.getRepository(GatheringOccurrence).save(lockedOccurrence);
      return { ...lockedGroup, occurrence: lockedOccurrence, paid_seat_count: paidRegistrations.length };
    });
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

    const openedIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
    const votingResults = await this.getVotingResults(
      occurrence,
      this.dataSource.getRepository(WebsiteEventRegistration),
    );
    return {
      invitation: { invitee_name: invitation.invitee_name, expires_at: invitation.expires_at },
      group: { id: group.id, title: group.title, invite_policy: group.invite_policy, workflow_step: group.workflow_step },
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
