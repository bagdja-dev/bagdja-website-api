import { Controller, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ApiBadRequestResponse, ApiBearerAuth, ApiNotFoundResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { In, Repository } from 'typeorm';

import { JwtAuthGuard, Roles, RolesGuard, TenantStaffGuard } from '../../common/auth';
import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { GatheringCompleteResponseDto, GatheringReleaseOutcomeResponseDto } from './dto/gathering-settlement-response.dto';
import { GatheringSettlementService } from './gathering-settlement.service';

@ApiTags('Tenant Gathering Calendar')
@Controller('api/websites/:websiteId/gatherings/calendar')
@UseGuards(JwtAuthGuard, TenantStaffGuard, RolesGuard)
@ApiBearerAuth()
export class TenantGatheringCalendarController {
  constructor(
    @InjectRepository(WebsiteEventGroup)
    private readonly groupRepo: Repository<WebsiteEventGroup>,
    @InjectRepository(GatheringOccurrence)
    private readonly occurrenceRepo: Repository<GatheringOccurrence>,
    @InjectRepository(WebsiteEventRegistration)
    private readonly registrationRepo: Repository<WebsiteEventRegistration>,
    private readonly settlementService: GatheringSettlementService,
  ) {}

  @Get()
  @Roles('viewer')
  @ApiOperation({ summary: 'List gathering plans and event schedules for the active tenant calendar' })
  async list(@Param('websiteId') websiteId: string) {
    const groups = await this.groupRepo.find({
      where: { website_id: websiteId },
      order: { created_at: 'DESC' },
    });
    if (!groups.length) return [];

    const groupIds = groups.map((group) => group.id);
    const [occurrences, registrations] = await Promise.all([
      this.occurrenceRepo.find({ where: { website_id: websiteId, parent_order_id: In(groupIds) } }),
      this.registrationRepo.find({
        where: { website_id: websiteId, group_id: In(groupIds) },
        select: { id: true, group_id: true, registration_status: true, payment_status: true },
      }),
    ]);
    const occurrenceByGroupId = new Map(occurrences.map((occurrence) => [occurrence.parent_order_id, occurrence]));
    const registrationsByGroupId = new Map<string, WebsiteEventRegistration[]>();
    for (const registration of registrations) {
      registrationsByGroupId.set(registration.group_id, [...(registrationsByGroupId.get(registration.group_id) ?? []), registration]);
    }

    return groups.flatMap((group) => {
      const occurrence = occurrenceByGroupId.get(group.id);
      if (!occurrence) return [];
      const attendees = registrationsByGroupId.get(group.id) ?? [];
      return [{
        id: group.id,
        title: group.title,
        status: group.status,
        workflow_step: group.workflow_step,
        occurrence: {
          id: occurrence.id,
          status: occurrence.status,
          final_schedule: occurrence.final_schedule,
          final_location: occurrence.final_location,
          payment_deadline: occurrence.payment_deadline,
          min_attendees: occurrence.min_attendees,
          max_attendees: occurrence.max_attendees,
          deposit_amount_per_seat: Number(occurrence.deposit_amount_per_seat ?? 0),
        },
        attendee_count: attendees.filter((row) => row.registration_status === 'RSVP_CONFIRMED').length,
        paid_seat_count: attendees.filter((row) => row.registration_status === 'RSVP_CONFIRMED' && row.payment_status === 'PAID').length,
      }];
    });
  }

  @Get(':groupId')
  @Roles('viewer')
  @ApiOperation({ summary: 'Get tenant-scoped gathering details for the calendar' })
  async detail(
    @Param('websiteId') websiteId: string,
    @Param('groupId') groupId: string,
  ) {
    const group = await this.groupRepo.findOne({ where: { id: groupId, website_id: websiteId } });
    if (!group) throw new NotFoundException('Gathering not found');

    const occurrence = await this.occurrenceRepo.findOne({
      where: { parent_order_id: group.id, website_id: websiteId },
    });
    if (!occurrence) throw new NotFoundException('Gathering occurrence not found');

    const registrations = await this.registrationRepo.find({
      where: { group_id: group.id, occurrence_id: occurrence.id, website_id: websiteId },
      order: { created_at: 'ASC' },
      select: {
        id: true,
        attendee_name: true,
        selected_options: true,
        registration_status: true,
        payment_status: true,
        created_at: true,
      },
    });
    const openedIds = new Set(occurrence.opened_option_ids_snapshot ?? []);
    const openedOptions = occurrence.option_groups_snapshot.filter((option) =>
      openedIds.has(String(option.product_option_id)),
    );
    const confirmedRegistrations = registrations.filter((registration) =>
      registration.registration_status === 'RSVP_CONFIRMED',
    );
    const votingResults: Record<string, { total_votes: number; options: Record<string, { votes: number; percentage: number }> }> = {};
    for (const optionGroupKey of new Set(openedOptions.map((option) => String(option.option_group_key)))) {
      const selections = confirmedRegistrations
        .map((registration) => registration.selected_options?.[optionGroupKey])
        .filter((optionId): optionId is string => Boolean(optionId));
      const options: Record<string, { votes: number; percentage: number }> = {};
      for (const option of openedOptions.filter((entry) => String(entry.option_group_key) === optionGroupKey)) {
        const optionId = String(option.product_option_id);
        const votes = selections.filter((selection) => selection === optionId).length;
        options[optionId] = {
          votes,
          percentage: selections.length ? Math.round((votes / selections.length) * 100) : 0,
        };
      }
      votingResults[optionGroupKey] = { total_votes: selections.length, options };
    }
    const settlement = await this.settlementService.getSettlement(group, occurrence);
    const settlementByRegistrationId = new Map(settlement.transactions.flatMap((transaction) =>
      transaction.registration_ids.map((registrationId) => [registrationId, transaction] as const)));

    return {
      id: group.id,
      title: group.title,
      status: group.status,
      workflow_step: group.workflow_step,
      invite_policy: group.invite_policy,
      occurrence: {
        id: occurrence.id,
        status: occurrence.status,
        rsvp_open_at: occurrence.rsvp_open_at,
        rsvp_close_at: occurrence.rsvp_close_at,
        payment_deadline: occurrence.payment_deadline,
        final_schedule: occurrence.final_schedule,
        final_location: occurrence.final_location,
        price_per_seat: Number(occurrence.price_per_seat),
        deposit_amount_per_seat: Number(occurrence.deposit_amount_per_seat ?? 0),
        currency: occurrence.currency,
        min_attendees: occurrence.min_attendees,
        max_attendees: occurrence.max_attendees,
        cancellation_policy: occurrence.cancellation_policy_snapshot,
        option_groups: openedOptions,
        opened_option_ids: occurrence.opened_option_ids_snapshot,
        voting_results: votingResults,
      },
      attendee_count: confirmedRegistrations.length,
      paid_seat_count: confirmedRegistrations.filter((registration) => registration.payment_status === 'PAID').length,
      settlement,
      registrations: registrations.map((registration) => ({
        id: registration.id,
        attendee_name: registration.attendee_name,
        selected_options: registration.selected_options,
        registration_status: registration.registration_status,
        payment_status: registration.payment_status,
        transaction_id: settlementByRegistrationId.get(registration.id)?.transaction_id ?? null,
        transaction_status: settlementByRegistrationId.get(registration.id)?.transaction_status ?? null,
        created_at: registration.created_at,
      })),
    };
  }

  @Post(':groupId/complete')
  @HttpCode(200)
  @Roles('admin')
  @ApiOperation({ summary: 'Mark a confirmed gathering as completed and release the remaining seat funds to the seller' })
  @ApiOkResponse({ type: GatheringCompleteResponseDto, description: 'Gathering COMPLETED; release.items lists per-transaction results, failed items can be retried via POST :groupId/release.' })
  @ApiBadRequestResponse({ description: 'Gathering is not CONFIRMED or the event date has not arrived yet.' })
  @ApiNotFoundResponse({ description: 'Gathering not found in this website.' })
  complete(@Param('websiteId') websiteId: string, @Param('groupId') groupId: string) {
    return this.settlementService.completeGathering(groupId, websiteId);
  }

  @Post(':groupId/release')
  @HttpCode(200)
  @Roles('admin')
  @ApiOperation({ summary: 'Retry releasing seat funds for the current stage (DEPOSIT when CONFIRMED, FINAL when COMPLETED)' })
  @ApiOkResponse({ type: GatheringReleaseOutcomeResponseDto, description: 'Idempotent: transactions already at target return NOTHING_TO_RELEASE.' })
  @ApiBadRequestResponse({ description: 'Gathering is not CONFIRMED or COMPLETED.' })
  @ApiNotFoundResponse({ description: 'Gathering not found in this website.' })
  release(@Param('websiteId') websiteId: string, @Param('groupId') groupId: string) {
    return this.settlementService.retryRelease(groupId, websiteId);
  }
}
