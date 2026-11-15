import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Tiket unggah video (HMAC-SHA256): browser Studio tidak memegang token login (cookie httpOnly di Studio),
 * jadi Studio meminta tiket lewat proxy-nya (JSON kecil) lalu browser mengirim file LANGSUNG ke website-api —
 * melewati batas body Vercel (±4,5 MB). Tiket terikat ke satu website & user, berlaku singkat.
 */
export const UPLOAD_TICKET_TTL_SECONDS = 10 * 60;

export interface UploadTicketClaims {
  /** website_id */
  w: string;
  /** user_id peminta */
  u: string;
  /** kedaluwarsa (detik epoch) */
  e: number;
}

function sign(payload: string, secret: string): string {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

export function createUploadTicket(claims: Omit<UploadTicketClaims, 'e'>, secret: string, now = Date.now()): {
  ticket: string;
  expiresAt: Date;
} {
  const e = Math.floor(now / 1000) + UPLOAD_TICKET_TTL_SECONDS;
  const payload = Buffer.from(JSON.stringify({ ...claims, e })).toString('base64url');
  return { ticket: `${payload}.${sign(payload, secret)}`, expiresAt: new Date(e * 1000) };
}

/** Klaim tiket bila tanda tangan sah & belum kedaluwarsa; selain itu null. */
export function verifyUploadTicket(ticket: string | undefined, secret: string, now = Date.now()): UploadTicketClaims | null {
  if (!ticket || ticket.length > 1024) return null;
  const [payload, signature, extra] = ticket.split('.');
  if (!payload || !signature || extra !== undefined) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as UploadTicketClaims;
    if (typeof claims.w !== 'string' || typeof claims.u !== 'string' || typeof claims.e !== 'number') return null;
    if (claims.e * 1000 < now) return null;
    return claims;
  } catch {
    return null;
  }
}

/** Rahasia tiket: UPLOAD_TICKET_SECRET, atau turunan CLIENT_APP_SECRET (tidak pernah keluar dari server). */
export function uploadTicketSecret(env: { UPLOAD_TICKET_SECRET?: string; CLIENT_APP_SECRET?: string }): string | null {
  const explicit = env.UPLOAD_TICKET_SECRET?.trim();
  if (explicit) return explicit;
  const base = env.CLIENT_APP_SECRET?.trim();
  return base ? createHmac('sha256', base).update('bagdja-website-api:upload-ticket:v1').digest('hex') : null;
}
