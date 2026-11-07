import { isUserId, sanitizeDisplayName } from '@pandemic/protocol';
import { decodeProtectedHeader, errors, importX509, jwtVerify } from 'jose';
import type { RequestIdentity } from './router';

export const CERTIFICATE_URL = 'https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com';
const MAX_TOKEN_LENGTH = 8192;
const MAX_CERTIFICATE_BODY = 64 * 1024;
const MAX_CACHE_SECONDS = 86_400;
const UNKNOWN_KID_COOLDOWN = 30_000;
const FETCH_FAILURE_COOLDOWN = 5_000;
const REQUIRED_CLAIMS = ['aud', 'iss', 'sub', 'exp', 'iat', 'auth_time'];

type CertificateCache = {
  expiresAt: number;
  certificates: Map<string, string>;
  keys: Map<string, Promise<CryptoKey | null>>;
};

type Verification = RequestIdentity | { readonly code: 'UNAUTHENTICATED' | 'TOKEN_EXPIRED' };
const invalid = { code: 'UNAUTHENTICATED' } as const;
const expired = { code: 'TOKEN_EXPIRED' } as const;

interface VerifierOptions {
  readonly projectId: string;
  readonly fetchCertificates?: typeof fetch;
  readonly now?: () => number;
  readonly timeoutMs?: number;
}

function seconds(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    && value <= Math.floor(Number.MAX_SAFE_INTEGER / 1000);
}

function cacheLifetime(response: Response): number {
  const directives = response.headers.get('cache-control')?.split(',') ?? [];
  if (directives.some(directive => /^\s*(?:no-store|no-cache)\s*$/i.test(directive))) return 0;
  const lifetimes = directives.flatMap(directive => {
    const match = /^\s*max-age\s*=\s*(\d+)\s*$/i.exec(directive);
    return match ? [Number(match[1])] : [];
  });
  if (lifetimes.length !== 1 || !seconds(lifetimes[0])) return 0;
  const age = Number(response.headers.get('age') ?? 0);
  if (!seconds(age)) return 0;
  return Math.max(0, Math.min(MAX_CACHE_SECONDS, lifetimes[0] - age)) * 1000;
}

export function createFirebaseVerifier({
  projectId, fetchCertificates = (input, init) => fetch(input, init), now = Date.now, timeoutMs = 3000,
}: VerifierOptions) {
  const issuer = 'https://securetoken.google.com/' + projectId;
  let cache: CertificateCache | null = null;
  let pending: Promise<CertificateCache | null> | null = null;
  let retryAfter = 0;
  let unknownKidAfter = 0;

  async function readCertificates(signal: AbortSignal): Promise<CertificateCache | null> {
    const response = await fetchCertificates(CERTIFICATE_URL, { signal, redirect: 'error' });
    if (!response.ok || response.redirected) return null;
    const lifetime = cacheLifetime(response);
    if (lifetime <= 0 || Number(response.headers.get('content-length') ?? 0) > MAX_CERTIFICATE_BODY) return null;
    const expiresAt = now() + lifetime;
    const text = await response.text();
    if (text.length > MAX_CERTIFICATE_BODY) return null;
    const raw: unknown = JSON.parse(text);
    if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
    const certificates = new Map<string, string>();
    for (const [kid, certificate] of Object.entries(raw)) {
      if (kid.length > 0 && kid.length <= 128 && typeof certificate === 'string' && certificate.length <= 8192
        && certificate.startsWith('-----BEGIN CERTIFICATE-----')) certificates.set(kid, certificate);
    }
    return certificates.size > 0 && certificates.size <= 32 ? { certificates, expiresAt, keys: new Map() } : null;
  }

  function refresh(): Promise<CertificateCache | null> {
    if (pending) return pending;
    if (now() < retryAfter) return Promise.resolve(null);
    const deadline = AbortSignal.timeout(timeoutMs);
    const timeout = new Promise<null>(resolve => deadline.addEventListener('abort', () => resolve(null), { once: true }));
    pending = Promise.race([readCertificates(deadline).catch(() => null), timeout])
      .then(result => {
        if (result && result.expiresAt > now()) cache = result;
        else retryAfter = now() + FETCH_FAILURE_COOLDOWN;
        return result;
      }).finally(() => { pending = null; });
    return pending;
  }

  async function keyFor(kid: string): Promise<{ key: CryptoKey; expiresAt: number } | null> {
    const existing = cache && cache.expiresAt > now() ? cache : null;
    let selected = existing ?? await refresh();
    if (!selected) return null;
    if (!selected.certificates.has(kid)) {
      if (pending) selected = await pending ?? selected;
      else if (existing && now() >= unknownKidAfter) {
        unknownKidAfter = now() + UNKNOWN_KID_COOLDOWN;
        selected = await refresh() ?? selected;
      } else if (!existing) {
        unknownKidAfter = Math.max(unknownKidAfter, now() + UNKNOWN_KID_COOLDOWN);
      }
    }
    const certificate = selected.certificates.get(kid);
    if (!certificate || selected.expiresAt <= now()) return null;
    let key = selected.keys.get(kid);
    if (!key) {
      key = importX509(certificate, 'RS256').catch(() => null);
      selected.keys.set(kid, key);
    }
    const imported = await key;
    return imported && selected.expiresAt > now() ? { key: imported, expiresAt: selected.expiresAt } : null;
  }

  return async function verify(authorization: string | null): Promise<Verification> {
    if (typeof projectId !== 'string' || !/^[a-z0-9][a-z0-9-]{0,127}$/.test(projectId)
      || !authorization || authorization.length > MAX_TOKEN_LENGTH) return invalid;
    const token = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/i.exec(authorization)?.[1];
    if (!token) return invalid;
    try {
      const { alg, kid } = decodeProtectedHeader(token);
      if (alg !== 'RS256' || typeof kid !== 'string' || kid.length === 0 || kid.length > 128) return invalid;
      const selected = await keyFor(kid);
      if (!selected) return invalid;
      const { payload } = await jwtVerify(token, selected.key, {
        algorithms: ['RS256'], issuer, audience: projectId, requiredClaims: REQUIRED_CLAIMS, currentDate: new Date(now()),
      });
      const timestamp = now();
      const { aud, sub, exp, iat, auth_time: authTime, nbf } = payload;
      if (selected.expiresAt <= timestamp || aud !== projectId || !isUserId(sub)
        || !seconds(exp) || !seconds(iat) || !seconds(authTime) || iat * 1000 > timestamp
        || authTime > iat || iat >= exp || (nbf !== undefined && (!seconds(nbf) || nbf * 1000 > timestamp))) return invalid;
      if (exp * 1000 <= timestamp) return expired;
      const displayName = typeof payload.name === 'string' ? sanitizeDisplayName(payload.name) : undefined;
      return { userId: sub, authExpiresAt: exp * 1000,
        ...(displayName && displayName !== payload.email && !/\S+@\S+\.\S+/u.test(displayName) ? { displayName } : {}) };
    } catch (error) {
      return error instanceof errors.JWTExpired ? expired : invalid;
    }
  };
}
