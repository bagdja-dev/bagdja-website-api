import type { Website } from '../../entities/website.entity';

/**
 * Base URL renderer tenant — sama dengan `GatheringOccurrenceService.tenantBaseUrl`:
 * domain custom terverifikasi → subdomain platform; saat dev lokal memakai path slug.
 */
export function tenantBaseUrl(website?: Website | null): string {
  const platformHost = (process.env.PLATFORM_HOST || 'sites.bagdja.com').replace(/^https?:\/\//, '').replace(/\/$/, '');
  const websiteDomain = website?.domain?.replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (websiteDomain && website?.domain_verified_at && websiteDomain.toLowerCase() !== platformHost.toLowerCase()) {
    return `https://${websiteDomain}`;
  }
  const siteAppUrl = (process.env.SITE_APP_URL || 'http://localhost:5005').replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production' && /localhost|127\.0\.0\.1/.test(siteAppUrl)) {
    return website?.slug ? `${siteAppUrl}/${website.slug}` : siteAppUrl;
  }
  return `https://${website?.slug ?? ''}.${platformHost}`;
}

/** Origin renderer untuk route `/api/*` (route API tidak memakai prefix slug saat dev lokal). */
function tenantApiOrigin(website?: Website | null): string {
  const siteAppUrl = (process.env.SITE_APP_URL || 'http://localhost:5005').replace(/\/$/, '');
  if (process.env.NODE_ENV !== 'production' && /localhost|127\.0\.0\.1/.test(siteAppUrl)) return siteAppUrl;
  return tenantBaseUrl(website);
}

/** Halaman tiket di renderer; URL ini juga isi QR sehingga kamera ponsel biasa membuka tiket. */
export function gatheringTicketLink(website: Website | null | undefined, token: string): string {
  return `${tenantBaseUrl(website)}/gathering/ticket/${encodeURIComponent(token)}`;
}

/** Gambar PNG QR (dirender oleh renderer) untuk disematkan di email tiket. */
export function gatheringTicketQrImageLink(website: Website | null | undefined, token: string): string {
  return `${tenantApiOrigin(website)}/api/public/gathering-tickets/${encodeURIComponent(token)}/qr`;
}

/** Ambil token dari isi QR: URL tiket renderer (domain apa pun) atau token mentah. */
export function parseTicketToken(qr: string): string {
  const value = qr.trim();
  const match = value.match(/\/gathering\/ticket\/([^/?#]+)/);
  if (match) {
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return match[1];
    }
  }
  return value;
}
