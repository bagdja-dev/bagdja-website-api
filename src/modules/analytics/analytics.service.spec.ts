import { createHash } from 'node:crypto';

import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  it('limits rankings to the selected date range', async () => {
    const queryBuilders: Array<Record<string, jest.Mock>> = [];
    const eventRepo = {
      createQueryBuilder: jest.fn(() => {
        const builder: Record<string, jest.Mock> = {};
        for (const method of ['select', 'addSelect', 'where', 'andWhere', 'groupBy', 'orderBy', 'limit']) {
          builder[method] = jest.fn().mockReturnValue(builder);
        }
        builder.getRawOne = jest.fn().mockResolvedValue({
          page_views: '0',
          unique_visitors: '0',
          cta_clicks: '0',
        });
        builder.getRawMany = jest.fn().mockResolvedValue([]);
        queryBuilders.push(builder);
        return builder;
      }),
    };
    const service = new AnalyticsService({} as never, eventRepo as never);

    await service.getOverview('website-id', 30);

    expect(queryBuilders).toHaveLength(5);
    for (const builder of queryBuilders) {
      expect(builder.andWhere).toHaveBeenCalledWith(
        'event.created_at >= :start',
        expect.objectContaining({ start: expect.any(Date) }),
      );
    }
  });

  it('stores a hashed session ID and a query-free page path', async () => {
    const websiteRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'website-id', slug: 'shop', is_active: true }),
    };
    const eventRepo = {
      create: jest.fn((event) => event),
      save: jest.fn(async (event) => event),
      delete: jest.fn().mockResolvedValue({ affected: 0 }),
    };
    const service = new AnalyticsService(websiteRepo as never, eventRepo as never);

    await service.track('shop', {
      event_type: 'page_view',
      visitor_id: '98b9187a-90f4-4a60-a625-591272197b73',
      page_path: '/products/coffee?email=private@example.com',
      source: 'instagram',
    });

    expect(eventRepo.create).toHaveBeenCalledWith(expect.objectContaining({
      website_id: 'website-id',
      event_type: 'page_view',
      visitor_hash: createHash('sha256').update('98b9187a-90f4-4a60-a625-591272197b73').digest('hex'),
      page_path: '/products/coffee',
      source: 'instagram',
      label: null,
    }));
    expect(eventRepo.create).not.toHaveBeenCalledWith(expect.objectContaining({
      visitor_hash: '98b9187a-90f4-4a60-a625-591272197b73',
    }));
  });
});
