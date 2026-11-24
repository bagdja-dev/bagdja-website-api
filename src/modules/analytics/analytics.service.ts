import { createHash } from 'node:crypto';

import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThan, Repository } from 'typeorm';

import { Website, WebsiteAnalyticsEvent } from '../../entities';

import { TrackAnalyticsEventDto } from './dto/track-analytics-event.dto';

interface DailyAnalyticsRow {
  date: string;
  page_views: string;
  unique_visitors: string;
  cta_clicks: string;
}

interface CountRow {
  label: string;
  count: string;
}

let lastRetentionCleanupAt = 0;
let retentionCleanup: Promise<void> | null = null;
const RETENTION_DAYS = 180;
const CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

@Injectable()
export class AnalyticsService {
  constructor(
    @InjectRepository(Website)
    private readonly websiteRepo: Repository<Website>,
    @InjectRepository(WebsiteAnalyticsEvent)
    private readonly eventRepo: Repository<WebsiteAnalyticsEvent>,
  ) {}

  async track(slug: string, input: TrackAnalyticsEventDto): Promise<{ recorded: true }> {
    const website = await this.websiteRepo.findOne({ where: { slug, is_active: true } });
    if (!website) throw new NotFoundException('Website not found');

    await this.cleanupExpiredEvents();
    const pagePath = new URL(input.page_path, 'https://analytics.invalid').pathname;
    await this.eventRepo.save(this.eventRepo.create({
      website_id: website.id,
      event_type: input.event_type,
      visitor_hash: createHash('sha256').update(input.visitor_id).digest('hex'),
      page_path: pagePath.slice(0, 500),
      source: input.source?.trim() || 'Langsung',
      label: input.event_type === 'cta_click' ? input.label?.trim() || 'CTA' : null,
    }));

    return { recorded: true };
  }

  async getOverview(websiteId: string, days: 7 | 30 | 90) {
    const start = new Date();
    start.setUTCHours(0, 0, 0, 0);
    start.setUTCDate(start.getUTCDate() - days + 1);

    const [summary, dailyRows, topPages, topSources, topCtas] = await Promise.all([
      this.eventRepo.createQueryBuilder('event')
        .select("COUNT(*) FILTER (WHERE event.event_type = 'page_view')", 'page_views')
        .addSelect("COUNT(DISTINCT event.visitor_hash) FILTER (WHERE event.event_type = 'page_view')", 'unique_visitors')
        .addSelect("COUNT(*) FILTER (WHERE event.event_type = 'cta_click')", 'cta_clicks')
        .where('event.website_id = :websiteId', { websiteId })
        .andWhere('event.created_at >= :start', { start })
        .getRawOne<{ page_views: string; unique_visitors: string; cta_clicks: string }>(),
      this.eventRepo.createQueryBuilder('event')
        .select("TO_CHAR(event.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')", 'date')
        .addSelect("COUNT(*) FILTER (WHERE event.event_type = 'page_view')", 'page_views')
        .addSelect("COUNT(DISTINCT event.visitor_hash) FILTER (WHERE event.event_type = 'page_view')", 'unique_visitors')
        .addSelect("COUNT(*) FILTER (WHERE event.event_type = 'cta_click')", 'cta_clicks')
        .where('event.website_id = :websiteId', { websiteId })
        .andWhere('event.created_at >= :start', { start })
        .groupBy("TO_CHAR(event.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')")
        .orderBy('date', 'ASC')
        .getRawMany<DailyAnalyticsRow>(),
      this.countBy(websiteId, start, 'page_path', 'page_view'),
      this.countBy(websiteId, start, 'source', 'page_view'),
      this.countBy(websiteId, start, 'label', 'cta_click'),
    ]);

    const dailyByDate = new Map(dailyRows.map((row) => [row.date, row]));
    const daily: Array<{ date: string; pageViews: number; uniqueVisitors: number; ctaClicks: number }> = [];
    for (let offset = 0; offset < days; offset += 1) {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + offset);
      const key = date.toISOString().slice(0, 10);
      const row = dailyByDate.get(key);
      daily.push({
        date: key,
        pageViews: Number(row?.page_views ?? 0),
        uniqueVisitors: Number(row?.unique_visitors ?? 0),
        ctaClicks: Number(row?.cta_clicks ?? 0),
      });
    }

    return {
      days,
      summary: {
        pageViews: Number(summary?.page_views ?? 0),
        uniqueVisitors: Number(summary?.unique_visitors ?? 0),
        ctaClicks: Number(summary?.cta_clicks ?? 0),
      },
      daily,
      topPages,
      topSources,
      topCtas,
    };
  }

  private async countBy(
    websiteId: string,
    start: Date,
    column: 'page_path' | 'source' | 'label',
    eventType: 'page_view' | 'cta_click',
  ): Promise<Array<{ label: string; count: number }>> {
    const rows = await this.eventRepo.createQueryBuilder('event')
      .select(`event.${column}`, 'label')
      .addSelect('COUNT(*)', 'count')
      .where('event.website_id = :websiteId', { websiteId })
      .andWhere('event.created_at >= :start', { start })
      .andWhere('event.event_type = :eventType', { eventType })
      .andWhere(`event.${column} IS NOT NULL`)
      .groupBy(`event.${column}`)
      .orderBy('count', 'DESC')
      .limit(10)
      .getRawMany<CountRow>();
    return rows.map((row) => ({ label: row.label, count: Number(row.count) }));
  }

  private async cleanupExpiredEvents(): Promise<void> {
    const now = Date.now();
    if (now - lastRetentionCleanupAt < CLEANUP_INTERVAL_MS) return;
    if (retentionCleanup) return retentionCleanup;
    const cutoff = new Date(now - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    retentionCleanup = this.eventRepo.delete({ created_at: LessThan(cutoff) })
      .then(() => {
        lastRetentionCleanupAt = Date.now();
      })
      .then(() => undefined)
      .finally(() => {
        retentionCleanup = null;
      });
    await retentionCleanup;
  }
}
