import { ForbiddenException, Injectable } from '@nestjs/common';

import { SubscriptionsService } from './subscriptions.service';

export interface EffectivePlanLimits {
  maxWebsites: number;
  maxPagesPerWebsite: number;
  maxProductsPerWebsite: number;
  maxStaffPerWebsite: number;
  customDomainAllowed: boolean;
}

const FREE_PLAN_LIMITS: EffectivePlanLimits = {
  maxWebsites: 1,
  maxPagesPerWebsite: 5,
  maxProductsPerWebsite: 10,
  maxStaffPerWebsite: 1,
  customDomainAllowed: false,
};

@Injectable()
export class PlanLimitService {
  constructor(private readonly subscriptionsService: SubscriptionsService) {}

  async getEffectivePlanLimits(userId: string): Promise<EffectivePlanLimits> {
    try {
      const mine = (await this.subscriptionsService.findMy(userId)) as Array<{
        status?: string;
        planId?: string;
      }>;

      const BLOCKING_STATUSES = new Set([
        'ACTIVE',
        'PAST_DUE',
        'TRIALING',
        'active',
        'past_due',
        'trialing',
      ]);
      const active = mine.find((s) => BLOCKING_STATUSES.has(s.status || ''));

      if (!active) {
        return FREE_PLAN_LIMITS;
      }

      try {
        const plans = (await this.subscriptionsService.listActivePlans()) as Array<
          {
            id?: string;
            metadata?: Record<string, unknown>;
            code?: string;
            price?: number;
          }
        >;
        const plan = plans.find((p) => p.id === active.planId);
        if (plan?.metadata && typeof plan.metadata === 'object') {
          const meta = plan.metadata as Record<string, unknown>;
          return {
            maxWebsites:
              typeof meta.maxWebsites === 'number'
                ? meta.maxWebsites
                : typeof meta.websites === 'number'
                  ? meta.websites
                  : FREE_PLAN_LIMITS.maxWebsites,
            maxPagesPerWebsite:
              typeof meta.maxPagesPerWebsite === 'number'
                ? meta.maxPagesPerWebsite
                : typeof meta.pages === 'number'
                  ? meta.pages
                  : FREE_PLAN_LIMITS.maxPagesPerWebsite,
            maxProductsPerWebsite:
              typeof meta.maxProductsPerWebsite === 'number'
                ? meta.maxProductsPerWebsite
                : typeof meta.products === 'number'
                  ? meta.products
                  : FREE_PLAN_LIMITS.maxProductsPerWebsite,
            maxStaffPerWebsite:
              typeof meta.maxStaffPerWebsite === 'number'
                ? meta.maxStaffPerWebsite
                : typeof meta.staff === 'number'
                  ? meta.staff
                  : FREE_PLAN_LIMITS.maxStaffPerWebsite,
            customDomainAllowed:
              typeof meta.customDomainAllowed === 'boolean'
                ? meta.customDomainAllowed
                : typeof meta.customDomain === 'boolean'
                  ? meta.customDomain
                  : FREE_PLAN_LIMITS.customDomainAllowed,
          };
        }
      } catch {
        // Fallback kalau metadata tidak terbaca / gagal load plans
      }

      return FREE_PLAN_LIMITS;
    } catch {
      // Network error? Default ke free limits untuk safety.
      return FREE_PLAN_LIMITS;
    }
  }

  async checkCanCreateWebsite(
    userId: string,
    currentCount: number,
  ): Promise<void> {
    const limits = await this.getEffectivePlanLimits(userId);
    if (currentCount >= limits.maxWebsites) {
      throw new ForbiddenException(
        `Batas website di plan Anda tercapai (${currentCount}/${limits.maxWebsites}). Silakan upgrade plan.`,
      );
    }
  }

  async checkCanAddPage(
    userId: string,
    currentPagesPerWebsite: number,
  ): Promise<void> {
    const limits = await this.getEffectivePlanLimits(userId);
    if (currentPagesPerWebsite >= limits.maxPagesPerWebsite) {
      throw new ForbiddenException(
        `Batas halaman per website di plan Anda tercapai (${currentPagesPerWebsite}/${limits.maxPagesPerWebsite}). Silakan upgrade plan.`,
      );
    }
  }

  async checkCanAddProduct(
    userId: string,
    currentProductsPerWebsite: number,
  ): Promise<void> {
    const limits = await this.getEffectivePlanLimits(userId);
    if (currentProductsPerWebsite >= limits.maxProductsPerWebsite) {
      throw new ForbiddenException(
        `Batas produk per website di plan Anda tercapai (${currentProductsPerWebsite}/${limits.maxProductsPerWebsite}). Silakan upgrade plan.`,
      );
    }
  }

  async checkCanAddStaff(
    userId: string,
    currentStaffPerWebsite: number,
  ): Promise<void> {
    const limits = await this.getEffectivePlanLimits(userId);
    if (currentStaffPerWebsite >= limits.maxStaffPerWebsite) {
      throw new ForbiddenException(
        `Batas staff per website di plan Anda tercapai (${currentStaffPerWebsite}/${limits.maxStaffPerWebsite}). Silakan upgrade plan.`,
      );
    }
  }
}
