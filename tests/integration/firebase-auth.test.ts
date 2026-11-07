import { env } from 'cloudflare:workers';
import { importPKCS8, SignJWT, type JWTPayload } from 'jose';
import { expect, it, vi } from 'vitest';
import { CERTIFICATE_URL, createFirebaseVerifier } from '../../apps/worker/src/firebase-auth';
import worker, { type Env } from '../../apps/worker/src/index';
import { firebaseTestKeys } from './fixtures/firebase-keys';

const projectId = 'pandemic-auth-test';
const uid = 'Firebase|Case:Opaque';
type TestKey = keyof typeof firebaseTestKeys;
const signingKeys = new Map<TestKey, Promise<CryptoKey>>();

function claims(now: number, extra: JWTPayload = {}): JWTPayload {
  const second = Math.floor(now / 1000);
  return { iss: 'https://securetoken.google.com/' + projectId, aud: projectId, sub: uid,
    iat: second - 10, auth_time: second - 20, exp: second + 3600, ...extra };
}

async function signed(payload: JWTPayload, options: { key?: TestKey; kid?: string; jku?: string; x5u?: string } = {}) {
  const key = options.key ?? 'alpha';
  let signer = signingKeys.get(key);
  if (!signer) {
    signer = importPKCS8(firebaseTestKeys[key].privateKey, 'RS256');
    signingKeys.set(key, signer);
  }
  const token = await new SignJWT(payload).setProtectedHeader({
    alg: 'RS256', kid: options.kid ?? key,
    ...(options.jku ? { jku: options.jku } : {}),
    ...(options.x5u ? { x5u: options.x5u } : {}),
  }).sign(await signer);
  return 'Bearer ' + token;
}

function certificates(keys: readonly TestKey[], cacheControl = 'public, max-age=120', age = '0') {
  return Response.json(Object.fromEntries(keys.map(key => [key, firebaseTestKeys[key].certificate])),
    { headers: { 'cache-control': cacheControl, age } });
}

it('verifies RS256 and exact Firebase claims while keeping UID opaque and display name sanitized', async () => {
  const now = Date.now();
  const fetchCertificates = vi.fn<typeof fetch>(async () => certificates(['alpha']));
  const verify = createFirebaseVerifier({ projectId, now: () => now, fetchCertificates });
  const payload = claims(now, { name: '  Player\u202e  ', email: 'private@example.com' });
  expect(await verify(await signed(payload, { jku: 'https://untrusted.example/key', x5u: 'https://untrusted.example/cert' })))
    .toEqual({ userId: uid, authExpiresAt: payload.exp! * 1000, displayName: 'Player' });
  expect(await verify(await signed({ ...payload, name: ' private@example.com ' })))
    .toEqual({ userId: uid, authExpiresAt: payload.exp! * 1000 });
  expect(fetchCertificates).toHaveBeenCalledTimes(1);
  expect(fetchCertificates).toHaveBeenCalledWith(CERTIFICATE_URL, expect.objectContaining({ redirect: 'error' }));
});

it('rejects forged, unsigned, algorithm-confused and type-confused tokens', async () => {
  const now = Date.now();
  const second = Math.floor(now / 1000);
  const verify = createFirebaseVerifier({ projectId, now: () => now, fetchCertificates: async () => certificates(['alpha']) });
  const invalid = { code: 'UNAUTHENTICATED' };
  const cases: JWTPayload[] = [
    { aud: 'other-project' }, { aud: [projectId] }, { iss: 'https://accounts.google.com' },
    { sub: '' }, { sub: 'x'.repeat(129) }, { sub: 123 as unknown as string },
    { iat: second + 1 }, { iat: 1.5 }, { auth_time: second + 1 }, { auth_time: '1' },
    { nbf: second + 1 }, { nbf: '1' as unknown as number }, { exp: Number.MAX_SAFE_INTEGER },
  ];
  for (const extra of cases) expect(await verify(await signed(claims(now, extra)))).toEqual(invalid);
  for (const required of ['aud', 'iss', 'sub', 'exp', 'iat', 'auth_time']) {
    const payload = claims(now);
    delete payload[required];
    expect(await verify(await signed(payload))).toEqual(invalid);
  }
  expect(await verify(await signed(claims(now, { exp: second })))).toEqual({ code: 'TOKEN_EXPIRED' });
  expect(await verify(await signed(claims(now), { key: 'beta', kid: 'alpha' }))).toEqual(invalid);
  expect(await verify(await signed(claims(now), { kid: '__proto__' }))).toEqual(invalid);
  const hs = await new SignJWT(claims(now)).setProtectedHeader({ alg: 'HS256', kid: 'alpha' })
    .sign(new Uint8Array(32).fill(1));
  expect(await verify('Bearer ' + hs)).toEqual(invalid);
  expect(await verify('Bearer eyJhbGciOiJub25lIn0.e30.')).toEqual(invalid);
  expect(await verify('Bearer google-provider-access-token')).toEqual(invalid);
  expect(await verify('Bearer ' + 'x'.repeat(9000))).toEqual(invalid);
});

it('coalesces certificate fetches, rotates keys, and limits refreshes from random key IDs', async () => {
  const now = Date.now();
  let keys: TestKey[] = ['alpha'];
  const fetchCertificates = vi.fn<typeof fetch>(async () => certificates(keys));
  const verify = createFirebaseVerifier({ projectId, now: () => now, fetchCertificates });
  const alpha = await signed(claims(now));
  const cold = await Promise.all(Array.from({ length: 8 }, () => verify(alpha)));
  expect(cold.every(result => 'userId' in result && result.userId === uid)).toBe(true);
  expect(fetchCertificates).toHaveBeenCalledTimes(1);
  keys = ['beta'];
  const beta = await signed(claims(now), { key: 'beta' });
  const rotated = await Promise.all(Array.from({ length: 6 }, () => verify(beta)));
  expect(rotated.every(result => 'userId' in result)).toBe(true);
  expect(fetchCertificates).toHaveBeenCalledTimes(2);
  const random = await Promise.all(['random-one', 'random-two', 'constructor'].map(kid => signed(claims(now), { kid })));
  expect(await Promise.all(random.map(token => verify(token)))).toEqual(Array(3).fill({ code: 'UNAUTHENTICATED' }));
  expect(await verify(alpha)).toEqual({ code: 'UNAUTHENTICATED' });
  expect(fetchCertificates).toHaveBeenCalledTimes(2);
});

it('keeps a known key through a refresh outage only until the original age-adjusted expiry', async () => {
  let now = Date.now();
  let unavailable = false;
  const fetchCertificates = vi.fn<typeof fetch>(async () => unavailable
    ? new Response('outage', { status: 503 }) : certificates(['alpha'], 'max-age=10', '2'));
  const verify = createFirebaseVerifier({ projectId, now: () => now, fetchCertificates });
  const alpha = await signed(claims(now));
  expect(await verify(alpha)).toMatchObject({ userId: uid });
  unavailable = true;
  expect(await verify(await signed(claims(now), { key: 'beta' }))).toEqual({ code: 'UNAUTHENTICATED' });
  now += 7999;
  expect(await verify(alpha)).toMatchObject({ userId: uid });
  now++;
  expect(await verify(alpha)).toEqual({ code: 'UNAUTHENTICATED' });
  expect(fetchCertificates).toHaveBeenCalledTimes(3);
});

it('fails closed on invalid cache responses and bounds an unresponsive certificate fetch', async () => {
  const token = await signed(claims(Date.now()));
  for (const reply of [
    () => certificates(['alpha'], 'max-age=0'),
    () => certificates(['alpha'], 'private'),
    () => certificates(['alpha'], 'max-age=120, no-store'),
    () => Response.redirect('https://untrusted.example/cert', 302),
    () => Response.json({ alpha: 'invalid' }, { headers: { 'cache-control': 'max-age=120' } }),
    () => new Response('bad json', { headers: { 'cache-control': 'max-age=120' } }),
  ]) {
    const verify = createFirebaseVerifier({ projectId, fetchCertificates: async () => reply() });
    expect(await verify(token)).toEqual({ code: 'UNAUTHENTICATED' });
  }
  const fetchCertificates = vi.fn<typeof fetch>(() => new Promise(() => undefined));
  const verify = createFirebaseVerifier({ projectId, fetchCertificates, timeoutMs: 25 });
  expect(await verify(token)).toEqual({ code: 'UNAUTHENTICATED' });
  expect(await verify(token)).toEqual({ code: 'UNAUTHENTICATED' });
  expect(fetchCertificates).toHaveBeenCalledTimes(1);
});

it('authorizes the normal Worker only by signed UID and binds the exact token expiry to tickets', async () => {
  const fetchCertificates = vi.fn<typeof fetch>(async () => certificates(['alpha']));
  vi.stubGlobal('fetch', fetchCertificates);
  try {
    const bindings = { ...(env as Env), FIREBASE_PROJECT_ID: projectId, FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' };
    const roomId = crypto.randomUUID();
    const origin = 'http://127.0.0.1:8787';
    const expires = Math.floor(Date.now() / 1000) + 25;
    const authorization = await signed(claims(Date.now(), { exp: expires, name: 'Owner', email: 'private@example.com' }));
    const missingProject = { ...bindings, FIREBASE_PROJECT_ID: undefined } as unknown as Env;
    expect((await worker.fetch(new Request(origin + '/api/rooms', {
      method: 'POST', headers: { authorization, 'content-type': 'application/json' }, body: JSON.stringify({ roomId }),
    }), missingProject)).status).toBe(401);
    function request(path: string, token?: string, body?: object, post = body !== undefined) {
      const headers = { origin, 'content-type': 'application/json', 'x-pandemic-test-uid': uid,
        'x-pandemic-test-auth-expires-at': String(Date.now() + 3_600_000), ...(token ? { authorization: token } : {}) };
      return worker.fetch(new Request(origin + path, { method: post ? 'POST' : 'GET', headers,
        ...(body ? { body: JSON.stringify(body) } : {}) }), bindings);
    }
    expect((await request('/api/rooms', undefined, { roomId })).status).toBe(401);
    expect((await request('/api/rooms', 'Bearer eyJhbGciOiJub25lIn0.e30.', { roomId })).status).toBe(401);
    expect(fetchCertificates).not.toHaveBeenCalled();
    expect((await request('/api/rooms', authorization, { roomId, userId: 'spoof' })).status).toBe(400);
    expect((await request('/api/rooms', authorization, { roomId })).status).toBe(200);
    const path = `/api/rooms/${roomId}`;
    const body = await (await request(path, authorization)).json();
    expect(body).toMatchObject({ ownerUserId: uid, members: [{ userId: uid, displayName: 'Owner' }] });
    expect(JSON.stringify(body)).not.toContain('private@example.com');
    const nonmember = await signed(claims(Date.now(), { sub: uid.toLowerCase(), email: 'private@example.com' }));
    expect((await request(path, nonmember)).status).toBe(403);
    expect((await request(path + '/ws-ticket', nonmember, undefined, true)).status).toBe(403);
    const ticket = await request(path + '/ws-ticket', authorization, undefined, true);
    expect(ticket.status).toBe(200);
    expect(await ticket.json()).toMatchObject({ expiresAt: new Date(expires * 1000).toISOString() });
    const old = await signed(claims(Date.now(), { exp: Math.floor(Date.now() / 1000) }));
    const expired = await request(path, old);
    expect(expired.status).toBe(401);
    expect(await expired.json()).toMatchObject({ error: { code: 'TOKEN_EXPIRED' } });
    expect(fetchCertificates).toHaveBeenCalledTimes(1);
  } finally {
    vi.unstubAllGlobals();
  }
});
