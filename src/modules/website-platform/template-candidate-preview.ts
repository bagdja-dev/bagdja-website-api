import type { WebsitePlatformTemplateSubmission } from '../../entities/website-platform-template-submission.entity';
import { browserBundleOf, type TemplateBrowserBundle } from '../public/template-runtime-resolution';

import type { CandidateFixture, TemplatePublicationClient } from './template-publication.client';

export type CandidatePreviewMode = 'ssr' | 'client';

export interface CandidatePreview {
  submissionId: string;
  digest: string;
  fixture: CandidateFixture;
  /** `client` = Platform/Studio merender di iframe dari browser.js + props (tanpa container runtime). */
  mode: CandidatePreviewMode;
  /** HTML SSR; string kosong pada mode client. */
  html: string;
  clientScript: string | null;
  /** Props fixture standar (mode client); null pada mode SSR. */
  props: Record<string, unknown> | null;
  browserBundle: TemplateBrowserBundle | null;
}

/**
 * Pratinjau kandidat untuk Platform (review) & Studio (template-client-rendering-plan §8, D6).
 * Mode client hanya bila diminta pemanggil (`mode=client`, frontend yang sudah mendukung) DAN kandidat
 * punya browser.js; selain itu SSR lewat runtime seperti sebelumnya.
 */
export async function buildCandidatePreview(
  publication: TemplatePublicationClient,
  submission: WebsitePlatformTemplateSubmission,
  fixture: CandidateFixture,
  requestedMode: CandidatePreviewMode = 'ssr',
): Promise<CandidatePreview> {
  const browserBundle = browserBundleOf(submission) ?? null;
  const digest = submission.candidate_digest!;
  if (requestedMode === 'client' && browserBundle) {
    const { props } = await publication.fixtureProps(fixture);
    return {
      submissionId: submission.id,
      digest,
      fixture,
      mode: 'client',
      html: '',
      clientScript: null,
      props,
      browserBundle,
    };
  }
  const manifest = submission.manifest as { entry?: { client?: string } } | null;
  const [rendered, client] = await Promise.all([
    publication.renderCandidate(digest, fixture),
    manifest?.entry?.client ? publication.candidateFile(digest, 'client.js') : Promise.resolve(null),
  ]);
  return {
    submissionId: submission.id,
    digest: rendered.digest,
    fixture,
    mode: 'ssr',
    html: rendered.html,
    // Dijalankan platform di iframe opaque ber-CSP dengan data fixture (bukan data pembeli).
    clientScript: client?.content ?? null,
    props: null,
    browserBundle,
  };
}
