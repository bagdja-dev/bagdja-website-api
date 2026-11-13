import { ConflictException, ForbiddenException, HttpException } from '@nestjs/common';
import { FindOperator, type DataSource, type Repository } from 'typeorm';

import type { AuthUser } from '../../common/auth/auth-user';
import { Website } from '../../entities/website.entity';
import { WebsitePlatformAuditLog } from '../../entities/website-platform-audit-log.entity';
import { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';
import { WebsiteTemplate } from '../../entities/website-template.entity';
import { WebsiteTemplateVersion } from '../../entities/website-template-version.entity';

import type { CreateTemplateSubmissionDto } from './dto/create-template-submission.dto';
import { TemplateServiceError, type TemplatePublicationClient } from './template-publication.client';
import { TemplateTrialService, templateTrialViewerRole } from './template-trial.service';
import { WebsitePlatformTemplateSubmissionService } from './website-platform-template-submission.service';

const designer: AuthUser = { userId: 'designer-user', email: 'designer@example.com' };
const otherDesigner: AuthUser = { userId: 'other-designer', email: 'other@example.com' };
const reviewer: AuthUser = { userId: 'reviewer-user', email: 'reviewer@example.com' };
const secondReviewer: AuthUser = { userId: 'second-reviewer', email: 'second@example.com' };

const DIGEST = 'a'.repeat(64);

const dto = (overrides: Partial<CreateTemplateSubmissionDto> = {}): CreateTemplateSubmissionDto => ({
  packageName: '@designer/storefront',
  packageVersion: '1.0.0',
  description: 'A complete storefront template for Bagdja Website Builder.',
  changelog: 'Initial release.',
  license: 'MIT',
  githubUrl: 'https://github.com/designer/storefront',
  ...overrides,
});

const packageManifest = (overrides: Record<string, unknown> = {}) => ({
  manifestVersion: 1,
  slug: 'storefront',
  name: 'Storefront',
  version: '1.0.0',
  rendererApiVersion: 1,
  businessProfiles: ['online_store'],
  capabilities: ['catalog', 'cart'],
  sections: ['hero', 'products_grid'],
  pageOverrides: ['order_detail'],
  entry: { server: 'dist/server.cjs' },
  defaultPages: [
    { slug: 'home', title: 'Beranda', isHome: true, sections: [{ type: 'hero', content: {} }] },
  ],
  ...overrides,
});

// ── In-memory TypeORM double ───────────────────────────────────────────────

type Row = Record<string, unknown> & { id: string };

function matches(row: Row, where: Record<string, unknown> | Record<string, unknown>[] | undefined): boolean {
  if (!where) return true;
  if (Array.isArray(where)) return where.some((branch) => matches(row, branch));
  return Object.entries(where).every(([key, expected]) => {
    const actual = row[key];
    if (expected instanceof FindOperator) {
      const operator = expected as FindOperator<unknown>;
      if (operator.type === 'in') return (operator.value as unknown as unknown[]).includes(actual);
      if (operator.type === 'not') {
        const inner = operator.value as unknown;
        if (inner instanceof FindOperator && inner.type === 'isNull') return actual !== null && actual !== undefined;
        return actual !== inner;
      }
      if (operator.type === 'isNull') return actual === null || actual === undefined;
      throw new Error(`Unsupported operator ${operator.type}`);
    }
    return actual === expected;
  });
}

function memoryRepo(name: string, rows: Row[]) {
  let sequence = 0;
  return {
    rows,
    create: (value: Partial<Row> = {}) => ({ ...value }),
    findOne: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.find((row) => matches(row, where)) ?? null),
    findOneOrFail: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) => {
      const row = rows.find((candidate) => matches(candidate, where));
      if (!row) throw new Error(`${name} not found`);
      return row;
    }),
    find: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.filter((row) => matches(row, where))),
    count: jest.fn(async ({ where }: { where?: Record<string, unknown> } = {}) =>
      rows.filter((row) => matches(row, where)).length),
    save: jest.fn(async (value: Partial<Row>) => {
      if (!value.id) {
        value.id = `${name}-${++sequence}`;
        (value as Row).created_at ??= new Date();
      }
      (value as Row).updated_at = new Date();
      const index = rows.findIndex((row) => row.id === value.id);
      if (index >= 0) rows[index] = value as Row;
      else rows.push(value as Row);
      return value;
    }),
    delete: jest.fn(async (criteria: Record<string, unknown>) => {
      const before = rows.length;
      for (let index = rows.length - 1; index >= 0; index -= 1) {
        if (matches(rows[index], criteria)) rows.splice(index, 1);
      }
      return { affected: before - rows.length };
    }),
    update: jest.fn(async (criteria: string | Record<string, unknown>, patch: Partial<Row>) => {
      const targets = typeof criteria === 'string'
        ? rows.filter((candidate) => candidate.id === criteria)
        : rows.filter((candidate) => matches(candidate, criteria));
      targets.forEach((row) => Object.assign(row, patch));
      return { affected: targets.length };
    }),
  };
}

function setup() {
  const submissions = memoryRepo('submission', []);
  const templates = memoryRepo('template', [
    { id: 'builtin', slug: 'store-classic', source: 'builtin', package_name: null },
  ]);
  const versions = memoryRepo('version', []);
  const websites = memoryRepo('website', []);
  const audits = memoryRepo('audit', []);
  const members = memoryRepo('member', [
    { id: 'm-reviewer', user_id: reviewer.userId, role: 'reviewer', is_active: true },
    { id: 'm-second', user_id: secondReviewer.userId, role: 'reviewer', is_active: true },
  ]);
  const testers = memoryRepo('tester', []);

  const repoFor = (entity: unknown) => {
    if (entity === WebsitePlatformTemplateSubmission) return submissions;
    if (entity === WebsiteTemplate) return templates;
    if (entity === WebsiteTemplateVersion) return versions;
    if (entity === Website) return websites;
    if (entity === WebsitePlatformAuditLog) return audits;
    throw new Error('Unknown entity');
  };
  const dataSource = {
    transaction: jest.fn(async (callback: (manager: unknown) => unknown) =>
      callback({ getRepository: repoFor })),
  } as unknown as DataSource;

  const chat = {
    createDirectTopic: jest.fn().mockResolvedValue({ id: 'topic-id' }),
    createMessage: jest.fn().mockResolvedValue({ id: 'message-id', createdAt: new Date().toISOString() }),
    listMessages: jest.fn().mockResolvedValue({ items: [] }),
    markTopicRead: jest.fn().mockResolvedValue(undefined),
  };
  const notifications = { notifyWebsiteStaff: jest.fn().mockResolvedValue(undefined) };
  const publication = {
    intake: jest.fn(async (packageName: string, version: string) => ({
      packageName,
      version,
      tarballIntegrity: 'sha512-test',
      digest: DIGEST,
      manifest: packageManifest({ version }),
      serverBundleBytes: 1000,
      clientBundleBytes: 0,
    })),
    renderCandidate: jest.fn(async (digest: string, fixture: string) => ({
      digest,
      fixture,
      html: `<main>${fixture}</main>`,
      htmlBytes: 20,
      durationMs: 5,
    })),
    candidateFile: jest.fn(async (digest: string, file: string) => ({
      digest,
      file,
      content: 'console.log(1)',
      bytes: 14,
    })),
    release: jest.fn(async (slug: string, version: string, digest: string) => ({ slug, version, digest })),
    withdraw: jest.fn(async () => undefined),
  };

  const trials = new TemplateTrialService(
    submissions as unknown as Repository<WebsitePlatformTemplateSubmission>,
    websites as unknown as Repository<Website>,
    templates as unknown as Repository<WebsiteTemplate>,
    versions as unknown as Repository<WebsiteTemplateVersion>,
    publication as unknown as TemplatePublicationClient,
    notifications as never,
    members as never,
    testers as never,
  );
  const service = new WebsitePlatformTemplateSubmissionService(
    dataSource,
    submissions as unknown as Repository<WebsitePlatformTemplateSubmission>,
    templates as unknown as Repository<WebsiteTemplate>,
    versions as unknown as Repository<WebsiteTemplateVersion>,
    websites as unknown as Repository<Website>,
    chat as never,
    publication as unknown as TemplatePublicationClient,
    notifications as never,
    trials,
  );
  return { service, trials, members, testers, submissions, templates, versions, websites, audits, chat, publication, notifications };
}

async function checkedSubmission(env: ReturnType<typeof setup>, overrides: Partial<CreateTemplateSubmissionDto> = {}) {
  const draft = await env.service.createDraft(designer, dto(overrides));
  const checked = await env.service.check(designer, draft.id);
  expect(checked.status).toBe('checked');
  return checked;
}

async function publishedSubmission(env: ReturnType<typeof setup>, overrides: Partial<CreateTemplateSubmissionDto> = {}) {
  const checked = await checkedSubmission(env, overrides);
  await env.service.submit(designer, checked.id);
  return env.service.review(reviewer, checked.id, { status: 'approved' });
}

const actions = (env: ReturnType<typeof setup>) => env.audits.rows.map((row) => row.action);

// ── Tests ────────────────────────────────────────────────────────────────

describe('WebsitePlatformTemplateSubmissionService', () => {
  describe('step 1 — registering and checking a package', () => {
    it('creates a draft without name or slug; both come from manifest.json later', async () => {
      const env = setup();
      const draft = await env.service.createDraft(designer, dto());
      expect(draft).toMatchObject({ status: 'draft', name: null, slug: null, candidate_digest: null });
      expect(actions(env)).toEqual(['template_submission.created']);
    });

    it('rejects a duplicate exact npm package version', async () => {
      const env = setup();
      await env.service.createDraft(designer, dto());
      await expect(env.service.createDraft(otherDesigner, dto())).rejects.toBeInstanceOf(ConflictException);
    });

    it('checks the package: intake, manifest validation, and standard fixture renders', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);

      expect(env.publication.intake).toHaveBeenCalledWith('@designer/storefront', '1.0.0');
      expect(env.publication.renderCandidate.mock.calls.map(([, fixture]) => fixture)).toEqual([
        'home',
        'page',
        'empty',
        'order_detail',
      ]);
      expect(checked).toMatchObject({
        name: 'Storefront',
        slug: 'storefront',
        candidate_digest: DIGEST,
        tarball_integrity: 'sha512-test',
      });
      expect(checked.check_report?.renders.every((render) => render.ok)).toBe(true);
      expect(actions(env)).toEqual([
        'template_submission.created',
        'template_submission.check_started',
        'template_submission.checked',
      ]);
    });

    it('renders the standard fixture of every system page the manifest declares', async () => {
      const env = setup();
      env.publication.intake.mockImplementation(async (packageName: string, version: string) => ({
        packageName,
        version,
        tarballIntegrity: 'sha512-test',
        digest: DIGEST,
        manifest: packageManifest({ version, pageOverrides: ['header', 'cart', 'tagihan', 'calendar', 'gathering_plan'] }),
        serverBundleBytes: 1,
        clientBundleBytes: 0,
      }));
      await checkedSubmission(env);
      expect(env.publication.renderCandidate.mock.calls.map(([, fixture]) => fixture)).toEqual([
        'home',
        'page',
        'empty',
        'header_only',
        'cart',
        'tagihan',
        'calendar',
        'gathering_plan',
      ]);
    });

    it('reports manifest problems as check_failed instead of throwing', async () => {
      const env = setup();
      env.publication.intake.mockResolvedValueOnce({
        packageName: '@designer/storefront',
        version: '1.0.0',
        tarballIntegrity: 'sha512-test',
        digest: DIGEST,
        manifest: packageManifest({ capabilities: ['server_render'] }),
        serverBundleBytes: 1,
        clientBundleBytes: 0,
      });
      const draft = await env.service.createDraft(designer, dto());
      const result = await env.service.check(designer, draft.id);

      expect(result.status).toBe('check_failed');
      expect(result.candidate_digest).toBeNull();
      expect(result.check_report?.issues.map((issue) => issue.code)).toContain('capability_unknown');
      expect(env.publication.renderCandidate).not.toHaveBeenCalled();
    });

    it('reports npm/intake failures from the publisher in the check report', async () => {
      const env = setup();
      env.publication.intake.mockRejectedValueOnce(
        new TemplateServiceError(422, 'integrity_mismatch', 'Isi tarball tidak cocok dengan dist.integrity.'),
      );
      const draft = await env.service.createDraft(designer, dto());
      const result = await env.service.check(designer, draft.id);

      expect(result.status).toBe('check_failed');
      expect(result.check_report?.issues).toEqual([
        expect.objectContaining({ code: 'integrity_mismatch', level: 'error' }),
      ]);
    });

    it('fails the check when a fixture cannot be rendered', async () => {
      const env = setup();
      env.publication.renderCandidate.mockImplementation(async (digest: string, fixture: string) => {
        if (fixture === 'empty') throw new TemplateServiceError(502, 'render_failed', 'Template rendering failed.');
        return { digest, fixture, html: '<main/>', htmlBytes: 7, durationMs: 1 };
      });
      const draft = await env.service.createDraft(designer, dto());
      const result = await env.service.check(designer, draft.id);

      expect(result.status).toBe('check_failed');
      expect(result.check_report?.renders.find((render) => render.fixture === 'empty')).toMatchObject({ ok: false });
    });

    it('rejects built-in slugs and slugs owned by another package (D4)', async () => {
      const env = setup();
      env.publication.intake.mockImplementation(async (packageName: string, version: string) => ({
        packageName,
        version,
        tarballIntegrity: 'sha512-test',
        digest: DIGEST,
        manifest: packageManifest({ version, slug: 'store-classic' }),
        serverBundleBytes: 1,
        clientBundleBytes: 0,
      }));
      const reserved = await env.service.createDraft(designer, dto());
      expect((await env.service.check(designer, reserved.id)).check_report?.issues.map((i) => i.code))
        .toContain('slug_reserved');

      const owner = setup();
      await publishedSubmission(owner);
      const squatter = await owner.service.createDraft(otherDesigner, dto({ packageName: '@other/storefront' }));
      const result = await owner.service.check(otherDesigner, squatter.id);
      expect(result.status).toBe('check_failed');
      expect(result.check_report?.issues.map((issue) => issue.code)).toContain('slug_taken');
    });

    it('only lets the owner check, and resets the check when the npm version changes', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      await expect(env.service.check(otherDesigner, checked.id)).rejects.toBeInstanceOf(ForbiddenException);

      const updated = await env.service.updateDraft(designer, checked.id, dto({ packageVersion: '1.0.1' }));
      expect(updated).toMatchObject({ status: 'draft', candidate_digest: null, slug: null, check_report: null });
    });

    it('requires a passed check before submitting', async () => {
      const env = setup();
      const draft = await env.service.createDraft(designer, dto());
      await expect(env.service.submit(designer, draft.id)).rejects.toBeInstanceOf(ConflictException);
    });
  });

  describe('steps 2–3 — review and approve = publish', () => {
    it('publishes the exact reviewed artifact on approval and fills the catalogue', async () => {
      const env = setup();
      const published = await publishedSubmission(env);

      expect(env.publication.release).toHaveBeenCalledWith('storefront', '1.0.0', DIGEST);
      expect(published).toMatchObject({ status: 'published', artifact_digest: DIGEST });

      const template = env.templates.rows.find((row) => row.slug === 'storefront')!;
      expect(template).toMatchObject({
        source: 'package',
        package_name: '@designer/storefront',
        designer_user_id: designer.userId,
        is_active: true,
        business_profiles: ['online_store'],
      });
      expect(template.manifest).toMatchObject({ slug: 'storefront', version: '1.0.0', isBuiltin: false });
      expect(template.structure).toEqual({
        sections: [{ type: 'hero', defaults: {} }],
        extra_pages: [],
      });
      expect(env.versions.rows).toEqual([
        expect.objectContaining({ template_id: template.id, version: '1.0.0', artifact_digest: DIGEST, status: 'published' }),
      ]);
      expect(actions(env)).toEqual(expect.arrayContaining([
        'template_submission.submitted',
        'template_submission.approved',
        'template_submission.published',
      ]));
    });

    it('does not let a designer review or publish their own submission', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await expect(env.service.review(designer, checked.id, { status: 'approved' }))
        .rejects.toBeInstanceOf(ForbiddenException);
      expect(env.publication.release).not.toHaveBeenCalled();
    });

    it('marks publish_failed when release fails, keeps the approval, and can retry', async () => {
      const env = setup();
      env.publication.release.mockRejectedValueOnce(
        new TemplateServiceError(503, 'publisher_unavailable', 'Layanan template publisher tidak dapat dihubungi.'),
      );
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);

      await expect(env.service.review(reviewer, checked.id, { status: 'approved' }))
        .rejects.toBeInstanceOf(HttpException);
      const failed = env.submissions.rows.find((row) => row.id === checked.id)!;
      expect(failed).toMatchObject({ status: 'publish_failed', reviewer_user_id: reviewer.userId });
      expect(failed.publication_error).toContain('publisher');

      const retried = await env.service.retryPublish(reviewer, checked.id);
      expect(retried.status).toBe('published');
    });

    it('lets the same package publish a newer version and blocks older/equal versions', async () => {
      const env = setup();
      await publishedSubmission(env);

      const next = await publishedSubmission(env, { packageVersion: '1.1.0' });
      expect(next.status).toBe('published');
      const template = env.templates.rows.find((row) => row.slug === 'storefront')!;
      expect((template.manifest as { version: string }).version).toBe('1.1.0');
      expect(env.versions.rows.map((row) => row.version)).toEqual(['1.0.0', '1.1.0']);

      const older = await env.service.createDraft(designer, dto({ packageVersion: '1.0.5' }));
      const result = await env.service.check(designer, older.id);
      expect(result.check_report?.issues.map((issue) => issue.code)).toContain('version_not_newer');
    });

    it('opens a discussion when requesting changes and requires a new npm version to revise', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      const requested = await env.service.review(reviewer, checked.id, {
        status: 'changes_requested',
        reviewNote: 'Perbaiki kontras tombol.',
      });

      expect(requested).toMatchObject({ status: 'changes_requested', discussion_topic_id: 'topic-id' });
      expect(env.chat.createMessage).toHaveBeenCalledWith('topic-id', expect.objectContaining({
        body: 'Perbaiki kontras tombol.',
      }));
      await expect(env.service.updateDraft(designer, checked.id, dto()))
        .rejects.toBeInstanceOf(ConflictException);

      const revised = await env.service.updateDraft(designer, checked.id, dto({ packageVersion: '1.0.1' }));
      expect(revised).toMatchObject({ status: 'draft', discussion_topic_id: 'topic-id' });
    });

    it('does not let another reviewer take over an assigned review', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await env.service.review(reviewer, checked.id, { status: 'in_review' });
      await expect(env.service.review(secondReviewer, checked.id, { status: 'approved' }))
        .rejects.toBeInstanceOf(ConflictException);
      const superAdminApproval = await env.service.review(secondReviewer, checked.id, { status: 'approved' }, true);
      expect(superAdminApproval.status).toBe('published');
    });
  });

  describe('discussion in Inbox', () => {
    it('lets a reviewer open a discussion once a package is checked, reusing the same topic', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);

      const started = await env.service.startDiscussion(reviewer, checked.id);
      expect(started.discussion_topic_id).toBe('topic-id');
      await env.service.startDiscussion(reviewer, checked.id);
      expect(env.chat.createDirectTopic).toHaveBeenCalledTimes(1);
      expect(env.chat.createDirectTopic).toHaveBeenCalledWith(expect.objectContaining({
        participantUserIds: [designer.userId, reviewer.userId],
      }));
      await expect(env.service.startDiscussion(designer, checked.id)).rejects.toBeInstanceOf(ForbiddenException);
    });
  });

  describe('preview and client source', () => {
    it('renders the candidate with a fixture for the owner and reviewers only', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      env.publication.renderCandidate.mockClear();

      const preview = await env.service.preview(reviewer, 'reviewer', checked.id, 'order_detail');
      expect(preview).toEqual({
        submissionId: checked.id,
        digest: DIGEST,
        fixture: 'order_detail',
        html: '<main>order_detail</main>',
        clientScript: null,
      });
      await expect(env.service.preview(otherDesigner, 'designer', checked.id, 'home'))
        .rejects.toBeInstanceOf(ForbiddenException);

      const source = await env.service.clientSource(reviewer, 'reviewer', checked.id);
      expect(env.publication.candidateFile).toHaveBeenCalledWith(DIGEST, 'client.js');
      expect(source.content).toBe('console.log(1)');
    });
  });

  describe('preview with browser JavaScript', () => {
    it('sends the candidate client script along with the fixture render', async () => {
      const env = setup();
      env.publication.intake.mockImplementation(async (packageName: string, version: string) => ({
        packageName,
        version,
        tarballIntegrity: 'sha512-test',
        digest: DIGEST,
        manifest: packageManifest({ version, entry: { server: 'dist/server.cjs', client: 'dist/client.js' } }),
        serverBundleBytes: 1,
        clientBundleBytes: 14,
      }));
      const checked = await checkedSubmission(env);
      const preview = await env.service.preview(designer, 'designer', checked.id, 'home');
      expect(preview.clientScript).toBe('console.log(1)');
      expect(env.publication.candidateFile).toHaveBeenCalledWith(DIGEST, 'client.js');
    });
  });

  describe('after publication — deprecate and revoke', () => {
    it('deprecates a version: hidden from the catalogue, pinned websites keep rendering', async () => {
      const env = setup();
      const published = await publishedSubmission(env);
      const version = env.versions.rows[0];
      env.websites.rows.push({ id: 'site-1', template_version_id: version.id });

      const result = await env.service.deprecate(reviewer, published.id, 'Diganti 1.1.0');
      expect(result).toMatchObject({ submission: { status: 'deprecated' }, pinnedWebsites: 1 });
      expect(env.publication.withdraw).not.toHaveBeenCalled();
      expect(env.templates.rows.find((row) => row.slug === 'storefront')?.is_active).toBe(false);
    });

    it('revokes a version through the publisher and reports affected websites', async () => {
      const env = setup();
      const published = await publishedSubmission(env);
      env.websites.rows.push({ id: 'site-1', template_version_id: env.versions.rows[0].id });

      expect(await env.service.countPinnedWebsites(published.id)).toMatchObject({ pinnedWebsites: 1 });
      const result = await env.service.revoke(reviewer, published.id, 'Masalah keamanan');
      expect(env.publication.withdraw).toHaveBeenCalledWith('storefront', '1.0.0');
      expect(result).toMatchObject({ submission: { status: 'revoked' }, pinnedWebsites: 1 });
      expect(env.versions.rows[0]).toMatchObject({ status: 'revoked', status_note: 'Masalah keamanan' });
      expect(env.notifications.notifyWebsiteStaff).toHaveBeenCalledWith('site-1', expect.objectContaining({
        severity: 'error',
        title: 'Template website dicabut',
        actionUrl: '/studio/appearance',
      }));
    });

    it('keeps the catalogue on the newest remaining published version', async () => {
      const env = setup();
      await publishedSubmission(env);
      const newer = await publishedSubmission(env, { packageVersion: '1.1.0' });
      await env.service.revoke(reviewer, newer.id, 'Bug kritis');

      const template = env.templates.rows.find((row) => row.slug === 'storefront')!;
      expect(template.is_active).toBe(true);
      expect((template.manifest as { version: string }).version).toBe('1.0.0');
    });
  });

  describe('candidate trials before publication (template-candidate-trial-plan)', () => {
    it('lists published versions and the viewer candidates of one template for the Studio version picker', async () => {
      const env = setup();
      await publishedSubmission(env);
      const next = await checkedSubmission(env, { packageVersion: '1.1.0' });
      const options = await env.trials.listVersionOptions(designer, 'storefront');
      expect(options.published).toEqual([expect.objectContaining({ version: '1.0.0', latest: true })]);
      expect(options.candidates).toEqual([expect.objectContaining({ submissionId: next.id, version: '1.1.0', publishedVersion: '1.0.0' })]);
      expect((await env.trials.listVersionOptions(otherDesigner, 'storefront')).candidates).toEqual([]);
    });

    const website = (overrides: Partial<Row> = {}): Row => ({
      id: 'website-1', slug: 'toko-uji', is_active: true, business_profile: 'online_store',
      template_id: 'builtin', template_version_id: null, template_runtime_version: null, trial_submission_id: null,
      ...overrides,
    });

    it('limits visibility to the designer after submit and to the claiming reviewer only (T1, T4)', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      // Revisi T1: designer menguji sejak lolos Cek package, sebelum diajukan; reviewer belum melihat.
      expect(await env.trials.listCandidates(designer)).toEqual([
        expect.objectContaining({ submissionId: checked.id, viewerRole: 'designer', statusLabel: 'Belum diajukan' }),
      ]);
      expect(await env.trials.listCandidates(reviewer)).toEqual([]);

      await env.service.submit(designer, checked.id);
      expect((await env.trials.listCandidates(designer)).map((row) => row.viewerRole)).toEqual(['designer']);
      expect(await env.trials.listCandidates(reviewer)).toEqual([]);

      await env.service.review(reviewer, checked.id, { status: 'in_review' });
      const forReviewer = await env.trials.listCandidates(reviewer);
      expect(forReviewer).toEqual([expect.objectContaining({ submissionId: checked.id, viewerRole: 'reviewer', statusLabel: 'Sedang direview', publishedVersion: null })]);
      expect(await env.trials.listCandidates(secondReviewer)).toEqual([]);
      expect(await env.trials.listCandidates(otherDesigner)).toEqual([]);
      expect(templateTrialViewerRole({ ...env.submissions.rows[0], status: 'published' } as never, designer.userId)).toBeNull();
    });

    it('renders the candidate only for eligible viewers and never exposes it to others (T1)', async () => {
      const env = setup();
      env.websites.rows.push(website());
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);

      await expect(env.trials.startTrial(otherDesigner, 'website-1', checked.id)).rejects.toBeInstanceOf(ForbiddenException);
      const trial = await env.trials.startTrial(designer, 'website-1', checked.id);
      expect(trial.candidate).toMatchObject({ submissionId: checked.id, version: '1.0.0' });

      expect(await env.trials.resolveForViewer(designer, 'toko-uji')).toMatchObject({
        slug: 'storefront', version: '1.0.0', status: 'candidate', candidateDigest: DIGEST, pageOverrides: ['order_detail'],
      });
      // R1: semua reviewer melihat versi uji selama di antrean review (tanpa memulai uji sendiri).
      expect(await env.trials.resolveForViewer(reviewer, 'toko-uji')).toMatchObject({ viewerRole: 'reviewer_team' });
      expect(await env.trials.resolveForViewer(otherDesigner, 'toko-uji')).toBeNull();
      expect((await env.trials.getWebsiteTrial(reviewer, 'website-1')).hiddenFromYou).toBe(true);

      await env.service.review(reviewer, checked.id, { status: 'in_review' });
      expect(await env.trials.resolveForViewer(reviewer, 'toko-uji')).toMatchObject({ viewerRole: 'reviewer' });
      expect(await env.trials.resolveForViewer(secondReviewer, 'toko-uji')).toMatchObject({ viewerRole: 'reviewer_team' });

      await env.trials.stopTrial(designer, 'website-1');
      expect(await env.trials.resolveForViewer(designer, 'toko-uji')).toBeNull();
    });

    it('rejects candidates that do not support the website business profile', async () => {
      const env = setup();
      env.websites.rows.push(website({ business_profile: 'event_organizer' }));
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await expect(env.trials.startTrial(designer, 'website-1', checked.id)).rejects.toThrow(/jenis bisnis/);
    });

    it('ends trials and notifies staff when changes are requested (T2)', async () => {
      const env = setup();
      env.websites.rows.push(website());
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await env.trials.startTrial(designer, 'website-1', checked.id);
      await env.service.review(reviewer, checked.id, { status: 'in_review' });
      await env.service.review(reviewer, checked.id, { status: 'changes_requested', reviewNote: 'Perbaiki header mobile.' });

      expect(env.websites.rows[0].trial_submission_id).toBeNull();
      expect(env.notifications.notifyWebsiteStaff).toHaveBeenCalledWith('website-1', expect.objectContaining({ title: 'Uji template dihentikan' }));
    });

    it('moves trial websites to the published version on approval (T5)', async () => {
      const env = setup();
      env.websites.rows.push(website());
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await env.trials.startTrial(designer, 'website-1', checked.id);
      await env.service.review(reviewer, checked.id, { status: 'approved' });

      const template = env.templates.rows.find((row) => row.slug === 'storefront')!;
      const version = env.versions.rows[0];
      expect(env.websites.rows[0]).toMatchObject({
        template_id: template.id,
        template_version_id: version.id,
        template_runtime_version: '1.0.0',
        trial_submission_id: null,
      });
      expect(env.notifications.notifyWebsiteStaff).toHaveBeenCalledWith('website-1', expect.objectContaining({ title: 'Template yang diuji telah terbit' }));
    });

    it('offers a newer submitted version of a published template as a candidate (T3)', async () => {
      const env = setup();
      await publishedSubmission(env);
      const next = await checkedSubmission(env, { packageVersion: '1.1.0' });
      await env.service.submit(designer, next.id);
      expect(await env.trials.listCandidates(designer)).toEqual([
        expect.objectContaining({ version: '1.1.0', publishedVersion: '1.0.0' }),
      ]);
    });
  });

  describe('tester team & shared review (template-candidate-trial-plan §2.2)', () => {
    const tester: AuthUser = { userId: 'tester-user', email: 'Penguji@Contoh.com' };
    const website = { id: 'website-1', slug: 'toko-uji', is_active: true, business_profile: 'online_store', trial_submission_id: null } as Row;

    it('lets the designer manage up to 10 testers matched by lower-cased login email', async () => {
      const env = setup();
      await expect(env.trials.addTester(designer, designer.email!)).rejects.toThrow(/sendiri/);
      expect(await env.trials.addTester(designer, ' Penguji@Contoh.com ')).toEqual([
        expect.objectContaining({ email: 'penguji@contoh.com' }),
      ]);
      await expect(env.trials.addTester(designer, 'penguji@contoh.com')).rejects.toBeInstanceOf(ConflictException);
      for (let index = 1; index < 10; index += 1) await env.trials.addTester(designer, `p${index}@contoh.com`);
      await expect(env.trials.addTester(designer, 'p11@contoh.com')).rejects.toThrow(/maksimal 10/);
      const [first] = await env.trials.listTesters(designer);
      await expect(env.trials.removeTester(otherDesigner, first.id)).rejects.toThrow(/tidak ditemukan/);
      expect(await env.trials.removeTester(designer, first.id)).toHaveLength(9);
    });

    it('shows the trial to the designer testers (from checked) and to every reviewer while in review, but never lets them start one', async () => {
      const env = setup();
      env.websites.rows.push({ ...website });
      await env.trials.addTester(designer, 'penguji@contoh.com');
      const checked = await checkedSubmission(env);
      await env.trials.startTrial(designer, 'website-1', checked.id);

      expect(await env.trials.resolveForViewer(tester, 'toko-uji')).toMatchObject({ viewerRole: 'tester' });
      expect(await env.trials.resolveForViewer(secondReviewer, 'toko-uji')).toBeNull(); // belum diajukan
      await expect(env.trials.startTrial(tester, 'website-1', checked.id)).rejects.toBeInstanceOf(ForbiddenException);

      await env.service.submit(designer, checked.id);
      await env.service.review(reviewer, checked.id, { status: 'in_review' });
      expect(await env.trials.resolveForViewer(secondReviewer, 'toko-uji')).toMatchObject({ viewerRole: 'reviewer_team' });
      expect(await env.trials.resolveForViewer(reviewer, 'toko-uji')).toMatchObject({ viewerRole: 'reviewer' });
      expect(await env.trials.resolveForViewer(otherDesigner, 'toko-uji')).toBeNull();
      expect(await env.trials.listDesignerTrialWebsites(designer)).toEqual([
        expect.objectContaining({ websiteSlug: 'toko-uji', version: '1.0.0', statusLabel: 'Sedang direview' }),
      ]);
    });

    it('adds any reviewer to the shared discussion channel and labels every non-designer as reviewer', async () => {
      const env = setup();
      const checked = await checkedSubmission(env);
      await env.service.submit(designer, checked.id);
      await env.service.startDiscussion(reviewer, checked.id);
      (env.chat as Record<string, jest.Mock>).addDirectParticipant = jest.fn().mockResolvedValue(undefined);
      env.chat.listMessages.mockResolvedValue({ items: [{ senderUserId: secondReviewer.userId, body: 'Header mobile hilang' }] });

      const discussion = await env.service.getDiscussion(secondReviewer, 'reviewer', checked.id);
      expect((env.chat as Record<string, jest.Mock>).addDirectParticipant).toHaveBeenCalledWith('topic-id', secondReviewer.userId, secondReviewer.email);
      expect(discussion.messages[0].senderRole).toBe('reviewer');
      await env.service.sendDiscussionMessage(secondReviewer, 'reviewer', checked.id, 'Cek juga halaman chat.');
      expect(env.chat.createMessage).toHaveBeenLastCalledWith('topic-id', expect.objectContaining({ senderUserId: secondReviewer.userId }));
    });
  });
});
