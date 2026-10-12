import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, In, Not } from 'typeorm';

import type { AuthUser } from '../../common/auth';
import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventProductOption } from '../../entities/website-event-product-option.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteProduct } from '../../entities/website-product.entity';

import { assertUniformGatheringOptionConfig } from '../products/gathering-product-options.validation';
import { CreateGatheringPlanDto } from './dto/create-gathering-plan.dto';
import { UpdateGatheringPlanDto } from './dto/update-gathering-plan.dto';
import type { GatheringOrderMeta } from './gathering-order.util';

/** Plan yang sudah selesai/batal tidak lagi tampil di cart initiator. */
const CLOSED_PLAN_STATUSES = ['CANCELLED', 'COMPLETED'];

@Injectable()
export class GatheringOccurrenceService {
  constructor(
    private readonly dataSource: DataSource,
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
    const groups = this.dataSource.getRepository(WebsiteEventGroup);
    const group = await groups.findOne({
      where: { id: groupId, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!group) throw new NotFoundException('Gathering plan not found');
    if (group.status !== 'PREORDER') {
      throw new BadRequestException('Only PREORDER gathering plans can be edited');
    }

    if (dto.title !== undefined) {
      const title = dto.title.trim();
      if (title.length < 3) throw new BadRequestException('title must contain at least 3 non-space characters');
      group.title = title;
    }
    if (dto.invite_policy !== undefined) group.invite_policy = dto.invite_policy;
    await groups.save(group);

    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId, initiator_user_id: initiatorUserId },
    });
    if (!occurrence) throw new NotFoundException('Gathering plan not found');
    return { ...group, occurrence };
  }
}

/** Mode checkout produk (dipakai order seat nanti); default ESCROW seperti alur gathering di plan §4. */
function resolvePaymentMode(product: WebsiteProduct): 'ADD_TO_CART' | 'ESCROW' {
  const entry = (product.payment_meta ?? []).find(
    (meta) => meta.payment_mode === 'ESCROW' || meta.payment_mode === 'ADD_TO_CART',
  );
  return (entry?.payment_mode as 'ADD_TO_CART' | 'ESCROW' | undefined) ?? 'ESCROW';
}
