import { BadGatewayException, BadRequestException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DataSource, EntityManager, In } from 'typeorm';

import { GatheringOccurrence } from '../../entities/gathering-occurrence.entity';
import { WebsiteEventGroup } from '../../entities/website-event-group.entity';
import { WebsiteEventRegistration } from '../../entities/website-event-registration.entity';
import { WebsiteOrder } from '../../entities/website-order.entity';
import { WebsiteTransaction } from '../../entities/website-transaction.entity';
import { EscrowClientService } from '../escrow/escrow-client.service';
import { normalizeEscrowStatus } from '../escrow/escrow-status.util';

/**
 * Pencairan dana seat gathering ke seller (plan event-registration §4/§5, model C, 22 Okt 2026):
 * - `DEPOSIT`: saat initiator confirm event, DP per seat dirilis otomatis.
 * - `FINAL`: saat admin tenant menandai event selesai, sisa harga seat dirilis.
 * Target dihitung per transaksi per plan, jadi transaksi yang memuat seat beberapa plan
 * tetap terpisah. Alokasi yang sudah dirilis disimpan di
 * `transaction.metadata.gathering_deposit.plans[].released_amount`.
 */
export type GatheringReleaseStage = 'DEPOSIT' | 'FINAL';

export interface GatheringReleaseItem {
  transaction_id: string;
  seat_count: number;
  amount: number;
  status: 'RELEASED' | 'NOTHING_TO_RELEASE' | 'FAILED';
  error?: string;
}

export interface GatheringReleaseOutcome {
  stage: GatheringReleaseStage;
  released_total: number;
  failed_count: number;
  items: GatheringReleaseItem[];
}

export interface GatheringSettlementTransaction {
  transaction_id: string;
  transaction_status: string;
  seat_count: number;
  registration_ids: string[];
  seat_total: number;
  deposit_target: number;
  released_amount: number;
}

export interface GatheringSettlementSummary {
  stage: 'HOLD' | GatheringReleaseStage;
  seat_total: number;
  deposit_target_total: number;
  released_total: number;
  outstanding_total: number;
  transactions: GatheringSettlementTransaction[];
}

interface GatheringDepositPlanMeta {
  group_id: string;
  deposit_amount_per_seat?: number;
  deposit_amount_total?: number;
  released_amount?: number;
  releases?: { stage: GatheringReleaseStage; amount: number; reference: string; released_at: string }[];
}

interface SeatTransactionGroup {
  transaction: WebsiteTransaction;
  registrationIds: string[];
  seatTotal: number;
}

const roundMoney = (value: number) => Math.round(value * 100) / 100;

function readPlanMeta(transaction: WebsiteTransaction, groupId: string): GatheringDepositPlanMeta | null {
  const deposit = transaction.metadata?.['gathering_deposit'] as { plans?: GatheringDepositPlanMeta[] } | undefined;
  return deposit?.plans?.find((plan) => plan.group_id === groupId) ?? null;
}

function releasedFor(transaction: WebsiteTransaction, groupId: string): number {
  return Number(readPlanMeta(transaction, groupId)?.released_amount ?? 0);
}

function stageForStatus(status: string): GatheringSettlementSummary['stage'] {
  if (status === 'CONFIRMED' || status === 'IN_PROGRESS') return 'DEPOSIT';
  if (status === 'COMPLETED') return 'FINAL';
  return 'HOLD';
}

@Injectable()
export class GatheringSettlementService {
  constructor(
    private readonly dataSource: DataSource,
    @Optional() private readonly escrowClient?: EscrowClientService,
  ) {}

  async getSettlement(group: WebsiteEventGroup, occurrence: GatheringOccurrence): Promise<GatheringSettlementSummary> {
    const seatGroups = await this.loadSeatTransactions(this.dataSource.manager, group, occurrence);
    const stage = stageForStatus(group.status);
    const depositPerSeat = Number(occurrence.deposit_amount_per_seat ?? 0);
    const transactions = seatGroups.map(({ transaction, registrationIds, seatTotal }) => ({
      transaction_id: transaction.id,
      transaction_status: transaction.status,
      seat_count: registrationIds.length,
      registration_ids: registrationIds,
      seat_total: seatTotal,
      deposit_target: roundMoney(Math.min(seatTotal, depositPerSeat * registrationIds.length)),
      released_amount: releasedFor(transaction, group.id),
    }));
    const targetFor = (row: GatheringSettlementTransaction) =>
      stage === 'FINAL' ? row.seat_total : stage === 'DEPOSIT' ? row.deposit_target : 0;
    return {
      stage,
      seat_total: roundMoney(transactions.reduce((sum, row) => sum + row.seat_total, 0)),
      deposit_target_total: roundMoney(transactions.reduce((sum, row) => sum + row.deposit_target, 0)),
      released_total: roundMoney(transactions.reduce((sum, row) => sum + row.released_amount, 0)),
      outstanding_total: roundMoney(transactions.reduce((sum, row) => sum + Math.max(0, targetFor(row) - row.released_amount), 0)),
      transactions,
    };
  }

  /** Jalankan ulang pencairan tahap yang sedang berlaku (DEPOSIT saat CONFIRMED/IN_PROGRESS, FINAL saat COMPLETED). */
  async retryRelease(groupId: string, websiteId: string): Promise<GatheringReleaseOutcome> {
    const { group, occurrence } = await this.findGathering(groupId, websiteId);
    const stage = stageForStatus(group.status);
    if (stage === 'HOLD') {
      throw new BadRequestException('Funds can only be released after the gathering is confirmed');
    }
    return this.releaseStage(group, occurrence, stage);
  }

  /** Admin tenant menandai acara yang sedang berjalan selesai lalu merilis sisa dana seat (tahap FINAL). */
  async completeGathering(groupId: string, websiteId: string) {
    const completed = await this.dataSource.transaction(async (manager) => {
      const group = await manager.getRepository(WebsiteEventGroup).findOne({
        where: { id: groupId, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!group) throw new NotFoundException('Gathering not found');
      if (group.status === 'COMPLETED') return null;
      if (group.status !== 'IN_PROGRESS') {
        throw new BadRequestException(`Only gatherings in progress can be completed (current: ${group.status})`);
      }
      const occurrence = await manager.getRepository(GatheringOccurrence).findOne({
        where: { parent_order_id: group.id, website_id: websiteId },
        lock: { mode: 'pessimistic_write' },
      });
      if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
      group.status = 'COMPLETED';
      group.completed_at = new Date();
      occurrence.status = 'COMPLETED';
      await manager.getRepository(WebsiteEventGroup).save(group);
      await manager.getRepository(GatheringOccurrence).save(occurrence);
      return { group, occurrence };
    });

    const { group, occurrence } = completed ?? (await this.findGathering(groupId, websiteId));
    const release = await this.releaseStage(group, occurrence, 'FINAL');
    return { id: group.id, status: group.status, occurrence_status: occurrence.status, release };
  }

  /**
   * Rilis target tahap per transaksi seat. Tiap transaksi diproses dalam DB transaction
   * sendiri dengan lock baris, jadi kegagalan satu escrow tidak menggagalkan yang lain dan
   * bisa diulang lewat `retryRelease`. Reference stabil per tahap membuat retry idempotent
   * di payment-service (nominal sama → hasil sebelumnya dikembalikan).
   */
  async releaseStage(
    group: WebsiteEventGroup,
    occurrence: GatheringOccurrence,
    stage: GatheringReleaseStage,
  ): Promise<GatheringReleaseOutcome> {
    const seatGroups = await this.loadSeatTransactions(this.dataSource.manager, group, occurrence);
    const depositPerSeat = Number(occurrence.deposit_amount_per_seat ?? 0);
    const items: GatheringReleaseItem[] = [];

    for (const seatGroup of seatGroups) {
      const seatCount = seatGroup.registrationIds.length;
      const target = stage === 'FINAL'
        ? seatGroup.seatTotal
        : roundMoney(Math.min(seatGroup.seatTotal, depositPerSeat * seatCount));
      try {
        const amount = await this.dataSource.transaction((manager) =>
          this.releaseTransaction(manager, seatGroup.transaction.id, group, occurrence, stage, target, seatCount));
        items.push({
          transaction_id: seatGroup.transaction.id,
          seat_count: seatCount,
          amount,
          status: amount > 0 ? 'RELEASED' : 'NOTHING_TO_RELEASE',
        });
      } catch (error) {
        items.push({
          transaction_id: seatGroup.transaction.id,
          seat_count: seatCount,
          amount: 0,
          status: 'FAILED',
          error: error instanceof Error ? error.message : 'Release failed',
        });
      }
    }

    return {
      stage,
      released_total: roundMoney(items.reduce((sum, item) => sum + item.amount, 0)),
      failed_count: items.filter((item) => item.status === 'FAILED').length,
      items,
    };
  }

  private async releaseTransaction(
    manager: EntityManager,
    transactionId: string,
    group: WebsiteEventGroup,
    occurrence: GatheringOccurrence,
    stage: GatheringReleaseStage,
    target: number,
    seatCount: number,
  ): Promise<number> {
    const transactionRepo = manager.getRepository(WebsiteTransaction);
    const transaction = await transactionRepo.findOne({ where: { id: transactionId }, lock: { mode: 'pessimistic_write' } });
    if (!transaction) throw new NotFoundException('Seat transaction not found');
    if (transaction.payment_mode !== 'ESCROW' || !transaction.escrow_id) {
      throw new BadRequestException('Seat transaction has no escrow to release');
    }
    const amount = roundMoney(target - releasedFor(transaction, group.id));
    if (amount <= 0.001) return 0;
    if (!this.escrowClient) throw new BadGatewayException('Escrow payment service is unavailable');

    const reference = `gathering:${occurrence.id}:${transaction.id}:${stage.toLowerCase()}`;
    const result = await this.escrowClient.release(transaction.escrow_id, amount, reference);

    const deposit = (transaction.metadata?.['gathering_deposit'] as { plans?: GatheringDepositPlanMeta[] } | undefined) ?? {};
    const plans = [...(deposit.plans ?? [])];
    const index = plans.findIndex((plan) => plan.group_id === group.id);
    const current: GatheringDepositPlanMeta = index >= 0
      ? plans[index]
      : {
          group_id: group.id,
          deposit_amount_per_seat: Number(occurrence.deposit_amount_per_seat ?? 0),
          deposit_amount_total: Number(occurrence.deposit_amount_per_seat ?? 0) * seatCount,
        };
    const next: GatheringDepositPlanMeta = {
      ...current,
      released_amount: roundMoney(Number(current.released_amount ?? 0) + amount),
      releases: [...(current.releases ?? []), { stage, amount, reference, released_at: new Date().toISOString() }],
    };
    if (index >= 0) plans[index] = next;
    else plans.push(next);
    transaction.metadata = { ...(transaction.metadata ?? {}), gathering_deposit: { ...deposit, plans } };
    // `release` mengembalikan `escrowStatus` (camelCase), bukan `status` — lihat ReleaseResult.
    if (result.escrowStatus) transaction.status = normalizeEscrowStatus(result.escrowStatus);
    await transactionRepo.save(transaction);
    return amount;
  }

  private async findGathering(groupId: string, websiteId: string) {
    const group = await this.dataSource.getRepository(WebsiteEventGroup).findOne({ where: { id: groupId, website_id: websiteId } });
    if (!group) throw new NotFoundException('Gathering not found');
    const occurrence = await this.dataSource.getRepository(GatheringOccurrence).findOne({
      where: { parent_order_id: group.id, website_id: websiteId },
    });
    if (!occurrence) throw new NotFoundException('Gathering occurrence not found');
    return { group, occurrence };
  }

  /** Seat lunas (RSVP_CONFIRMED + PAID) dikelompokkan per transaksi escrow pembayarnya. */
  private async loadSeatTransactions(
    manager: EntityManager,
    group: WebsiteEventGroup,
    occurrence: GatheringOccurrence,
  ): Promise<SeatTransactionGroup[]> {
    const registrations = await manager.getRepository(WebsiteEventRegistration).find({
      where: {
        group_id: group.id,
        occurrence_id: occurrence.id,
        website_id: group.website_id,
        registration_status: 'RSVP_CONFIRMED',
        payment_status: 'PAID',
      },
      select: { id: true, order_id: true },
    });
    const orderIds = registrations.flatMap((registration) => registration.order_id ? [registration.order_id] : []);
    if (!orderIds.length || !group.order_id) return [];

    const orders = await manager.getRepository(WebsiteOrder).find({
      where: { id: In(orderIds), website_id: group.website_id, parent_order_id: group.order_id },
    });
    const transactionIds = [...new Set(orders.flatMap((order) => order.transaction_id ? [order.transaction_id] : []))];
    if (!transactionIds.length) return [];
    const transactions = await manager.getRepository(WebsiteTransaction).find({
      where: { id: In(transactionIds), website_id: group.website_id },
    });
    const transactionById = new Map(transactions.map((transaction) => [transaction.id, transaction]));
    const orderById = new Map(orders.map((order) => [order.id, order]));

    const grouped = new Map<string, SeatTransactionGroup>();
    for (const registration of registrations) {
      const order = registration.order_id ? orderById.get(registration.order_id) : undefined;
      const transaction = order?.transaction_id ? transactionById.get(order.transaction_id) : undefined;
      if (!order || !transaction) continue;
      const entry = grouped.get(transaction.id) ?? { transaction, registrationIds: [], seatTotal: 0 };
      entry.registrationIds.push(registration.id);
      entry.seatTotal = roundMoney(entry.seatTotal + Number(order.total_amount));
      grouped.set(transaction.id, entry);
    }
    return [...grouped.values()];
  }
}
