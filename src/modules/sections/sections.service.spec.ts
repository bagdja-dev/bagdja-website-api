import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';

import { WebsiteSection } from '../../entities';

import { SectionsService, isSameJson } from './sections.service';

describe('SectionsService seed marker (onboarding homeEdited)', () => {
  let service: SectionsService;
  let sectionRepo: { findOne: jest.Mock; save: jest.Mock; create: jest.Mock };

  const seedSection = (): WebsiteSection =>
    ({
      id: 's1',
      page_id: 'p1',
      type: 'hero',
      content: { title: 'Contoh', items: [{ a: 1, b: 2 }] },
      order: 0,
      is_seed: true,
    }) as unknown as WebsiteSection;

  beforeEach(() => {
    sectionRepo = {
      findOne: jest.fn(),
      save: jest.fn(async (s: WebsiteSection) => s),
      create: jest.fn((s: Partial<WebsiteSection>) => s),
    };
    service = new SectionsService(sectionRepo as unknown as Repository<WebsiteSection>);
  });

  it('clears is_seed when the content really changes', async () => {
    sectionRepo.findOne.mockResolvedValue(seedSection());
    const saved = await service.update('s1', { content: { title: 'Barbershop Jhon', items: [{ a: 1, b: 2 }] } });
    expect(saved.is_seed).toBe(false);
  });

  it('clears is_seed when the section type changes', async () => {
    sectionRepo.findOne.mockResolvedValue(seedSection());
    const saved = await service.update('s1', { type: 'gallery' });
    expect(saved.is_seed).toBe(false);
  });

  it('keeps is_seed when the same content is saved again (key order differs, as jsonb returns it)', async () => {
    sectionRepo.findOne.mockResolvedValue(seedSection());
    const saved = await service.update('s1', { type: 'hero', content: { items: [{ b: 2, a: 1 }], title: 'Contoh' } });
    expect(saved.is_seed).toBe(true);
  });

  it('keeps is_seed when only the order changes', async () => {
    sectionRepo.findOne.mockResolvedValue(seedSection());
    const saved = await service.update('s1', { order: 3 });
    expect(saved.is_seed).toBe(true);
  });

  it('never marks user-created sections as seed', async () => {
    await service.create('p1', { type: 'hero', content: {} });
    expect(sectionRepo.create.mock.calls[0][0]).not.toHaveProperty('is_seed');
  });

  it('sanitizes custom HTML when creating a section', async () => {
    await service.create('p1', {
      type: 'custom_html',
      content: { html: '<div onclick="toggle()">Invoice</div><script src="https://evil.example/x.js"></script><iframe src="x"></iframe>' },
    });

    expect(sectionRepo.create.mock.calls[0][0].content.html).toBe('<div onclick="toggle()">Invoice</div>');
  });

  it('sanitizes custom HTML when updating a section', async () => {
    sectionRepo.findOne.mockResolvedValue(seedSection());
    const saved = await service.update('s1', {
      type: 'custom_html',
      content: { html: '<p>Updated</p><link rel="stylesheet" href="https://evil.example/x.css">' },
    });

    expect(saved.content.html).toBe('<p>Updated</p>');
    expect(saved.is_seed).toBe(false);
  });
});

describe('SectionsService custom HTML size limit', () => {
  it('rejects oversized custom HTML with a 400', async () => {
    const repo = { create: jest.fn((value) => value), save: jest.fn(async (value) => value) };
    const service = new SectionsService(repo as never);
    await expect(service.create('p1', {
      type: 'custom_html',
      content: { html: `<p>${'x'.repeat(400 * 1024)}</p>` },
    })).rejects.toBeInstanceOf(BadRequestException);
    expect(repo.save).not.toHaveBeenCalled();
  });
});

describe('isSameJson', () => {
  it('compares deeply and ignores object key order', () => {
    expect(isSameJson({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
    expect(isSameJson({ a: 1 }, { a: 2 })).toBe(false);
    expect(isSameJson([1, 2], [2, 1])).toBe(false);
    expect(isSameJson({ a: [] }, { a: {} })).toBe(false);
    expect(isSameJson({ a: 1, b: undefined }, { a: 1 })).toBe(true);
    expect(isSameJson(null, {})).toBe(false);
  });
});
