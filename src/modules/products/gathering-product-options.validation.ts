import { BadRequestException } from '@nestjs/common';

type CancellationPolicyInput = Record<string, unknown>;

export function assertValidGatheringProductConfig(
  type: string,
  price: number,
  metadata: Record<string, unknown>,
): void {
  if (type !== 'gathering') return;
  const minimum = Number(metadata.min_attendees);
  const maximum = Number(metadata.max_attendees);
  if (!Number.isFinite(price) || price < 0) {
    throw new BadRequestException('Gathering per-seat price must be non-negative');
  }
  if (!Number.isInteger(minimum) || minimum < 0 || !Number.isInteger(maximum) || maximum < 1 || minimum > maximum) {
    throw new BadRequestException('Gathering minimum/maximum attendee bounds are invalid');
  }
}

export function normalizeGatheringCancellationPolicy(
  input: CancellationPolicyInput | undefined,
  seatPrice: number,
): Record<string, unknown> {
  const policy = input ?? {};
  const cutoffDays = policy.cutoff_days_before_event ?? 0;
  const prepareDays = policy.prepare_days_before_event ?? cutoffDays;
  const penaltyType = policy.penalty_type ?? 'NONE';
  const penaltyValue = policy.penalty_value ?? 0;
  const summary = policy.summary;

  if (!Number.isInteger(cutoffDays) || Number(cutoffDays) < 0) {
    throw new BadRequestException('cutoff_days_before_event must be a non-negative integer');
  }
  if (!Number.isInteger(prepareDays) || Number(prepareDays) < Number(cutoffDays)) {
    throw new BadRequestException('prepare_days_before_event must be an integer greater than or equal to cutoff_days_before_event');
  }
  if (!['NONE', 'FIXED', 'PERCENTAGE'].includes(String(penaltyType))) {
    throw new BadRequestException('penalty_type must be NONE, FIXED, or PERCENTAGE');
  }
  if (typeof penaltyValue !== 'number' || !Number.isFinite(penaltyValue) || penaltyValue < 0) {
    throw new BadRequestException('penalty_value must be a non-negative number');
  }
  if (penaltyType === 'PERCENTAGE' && penaltyValue > 100) {
    throw new BadRequestException('percentage penalty cannot exceed 100');
  }
  if (penaltyType === 'NONE' && penaltyValue !== 0) {
    throw new BadRequestException('penalty_value must be zero when penalty_type is NONE');
  }
  if (penaltyType === 'FIXED' && penaltyValue > seatPrice) {
    throw new BadRequestException('fixed penalty cannot exceed the per-seat price');
  }
  if (summary !== undefined && typeof summary !== 'string') {
    throw new BadRequestException('cancellation policy summary must be a string');
  }

  return {
    version: 1,
    prepare_days_before_event: prepareDays,
    cutoff_days_before_event: cutoffDays,
    penalty_type: penaltyType,
    penalty_value: penaltyValue,
    currency: 'IDR',
    ...(typeof summary === 'string' && summary.trim() ? { summary: summary.trim() } : {}),
  };
}

export function assertUniformGatheringOptionConfig(
  options: Array<{
    price_per_seat: number;
    deposit_amount_per_seat?: number;
    currency?: string;
    min_attendees: number;
    max_attendees: number;
    cancellation_policy?: Record<string, unknown>;
  }>,
): void {
  const first = options[0];
  if (!first) return;
  const firstPolicy = JSON.stringify(first.cancellation_policy ?? {});

  for (const option of options) {
    const depositAmount = Number(option.deposit_amount_per_seat ?? 0);
    if (!Number.isFinite(depositAmount) || depositAmount < 0 || depositAmount > option.price_per_seat) {
      throw new BadRequestException('Per-seat deposit must be between zero and the seat price');
    }
    if ((option.currency ?? 'IDR').toUpperCase() !== 'IDR') {
      throw new BadRequestException('Gathering products currently support IDR only');
    }
    if (
      option.price_per_seat !== first.price_per_seat ||
      Number(option.deposit_amount_per_seat ?? 0) !== Number(first.deposit_amount_per_seat ?? 0) ||
      option.min_attendees !== first.min_attendees ||
      option.max_attendees !== first.max_attendees ||
      JSON.stringify(option.cancellation_policy ?? {}) !== firstPolicy
    ) {
      throw new BadRequestException('All choices in a gathering product must share price, deposit, attendee bounds, and cancellation policy');
    }
  }
}