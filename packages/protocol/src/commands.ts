import { COLORS, ROLES, type ActionCommand, type Role } from '@pandemic/engine';

export const PROTOCOL_VERSION = 1;
export const MAX_JSON_BYTES = 16 * 1024;

type LobbyCommand =
  | { readonly type: 'SELECT_ROLE'; readonly payload: { readonly role: Role } }
  | { readonly type: 'SET_READY'; readonly payload: { readonly ready: boolean } }
  | { readonly type: 'LEAVE_LOBBY' | 'START_GAME'; readonly payload: Readonly<Record<string, never>> };

export type CommandEnvelope = (ActionCommand | LobbyCommand) & {
  readonly protocolVersion: typeof PROTOCOL_VERSION;
  readonly commandId: string;
  readonly expectedVersion: number;
};

const ERROR_STATUS = {
  BAD_REQUEST: 400, PROTOCOL_UNSUPPORTED: 400,
  UNAUTHENTICATED: 401, TOKEN_EXPIRED: 401, INVALID_TICKET: 401,
  NOT_MEMBER: 403, NOT_OWNER: 403, INVALID_INVITE: 403,
  ROOM_NOT_FOUND: 404, ROOM_EXPIRED: 410,
  STALE_VERSION: 409, COMMAND_ID_REUSED: 409, ROOM_FULL: 409, ROOM_STARTED: 409, ROLE_TAKEN: 409,
  NOT_READY: 409, ROOM_CONFLICT: 409,
  ILLEGAL_ACTION: 422, WRONG_TURN: 422, WRONG_PHASE: 422, GAME_FINISHED: 422,
  RATE_LIMITED: 429, INTERNAL_ERROR: 500, TEMPORARILY_UNAVAILABLE: 503, ROOM_INCOMPATIBLE: 503,
} as const;

export type ErrorCode = keyof typeof ERROR_STATUS;
export type ApiError = {
  readonly error: { readonly code: ErrorCode; readonly message: string; readonly retryable: boolean };
  readonly currentVersion?: number;
};

export function apiError(code: ErrorCode, message: string, retryable = false, currentVersion?: number) {
  const body: ApiError = { error: { code, message, retryable },
    ...(currentVersion === undefined ? {} : { currentVersion }) };
  return { status: ERROR_STATUS[code], body };
}

type ParseResult<T> = { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly code: 'BAD_REQUEST' | 'PROTOCOL_UNSUPPORTED' };
const badRequest = { ok: false, code: 'BAD_REQUEST' } as const;

function hasFields(value: unknown, fields: readonly string[]): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    && Object.keys(value).length === fields.length && fields.every(field => Object.hasOwn(value, field));
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i.test(value);
}

export function isUserId(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 128;
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

function isLocationId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-F]0[1-8]$/.test(value);
}

function isCardId(value: unknown): boolean {
  return typeof value === 'string' && value.startsWith('p:') && isLocationId(value.slice(2));
}

function isCardList(value: unknown): boolean {
  return Array.isArray(value) && value.length >= 1 && value.length <= 48 && Array.from(value).every(isCardId);
}

function validPayload(type: unknown, payload: unknown): boolean {
  switch (type) {
    case 'LEAVE_LOBBY': case 'START_GAME': case 'BUILD_CENTER': case 'PASS':
      return hasFields(payload, []);
    case 'SELECT_ROLE':
      return hasFields(payload, ['role']) && ROLES.some(role => role === payload.role);
    case 'SET_READY':
      return hasFields(payload, ['ready']) && typeof payload.ready === 'boolean';
    case 'MOVE': case 'DIRECT_FLIGHT': case 'CHARTER_FLIGHT': case 'SHUTTLE':
      return hasFields(payload, ['destination']) && isLocationId(payload.destination);
    case 'TREAT':
      return hasFields(payload, ['color']) && COLORS.some(color => color === payload.color);
    case 'GIVE_CARD':
      return hasFields(payload, ['recipientUserId', 'cardId'])
        && isUserId(payload.recipientUserId) && isCardId(payload.cardId);
    case 'DISCOVER_CURE':
      return hasFields(payload, ['color', 'cardIds']) && COLORS.some(color => color === payload.color)
        && isCardList(payload.cardIds);
    case 'DISCARD':
      return hasFields(payload, ['cardIds']) && isCardList(payload.cardIds);
    default: return false;
  }
}

export function parseCommandEnvelope(input: unknown): ParseResult<CommandEnvelope> {
  if (!hasFields(input, ['protocolVersion', 'commandId', 'expectedVersion', 'type', 'payload'])) return badRequest;
  if (input.protocolVersion !== PROTOCOL_VERSION) {
    return isVersion(input.protocolVersion) ? { ok: false, code: 'PROTOCOL_UNSUPPORTED' } : badRequest;
  }
  if (!isUuid(input.commandId) || !isVersion(input.expectedVersion) || !validPayload(input.type, input.payload)) {
    return badRequest;
  }
  return { ok: true, value: { ...input, commandId: input.commandId.toLowerCase() } as CommandEnvelope };
}

export function parseCreateRoom(input: unknown): ParseResult<{ readonly roomId: string }> {
  if (!hasFields(input, ['roomId']) || !isUuid(input.roomId)) return badRequest;
  return { ok: true, value: { roomId: input.roomId.toLowerCase() } };
}

export function parseRotateInvite(input: unknown): ParseResult<{ readonly commandId: string; readonly expectedVersion: number }> {
  if (!hasFields(input, ['commandId', 'expectedVersion']) || !isUuid(input.commandId) || !isVersion(input.expectedVersion)) {
    return badRequest;
  }
  return { ok: true, value: { commandId: input.commandId.toLowerCase(), expectedVersion: input.expectedVersion } };
}

export function parseJoinRoom(input: unknown): ParseResult<{ readonly commandId: string; readonly inviteSecret: string }> {
  if (!hasFields(input, ['commandId', 'inviteSecret']) || !isUuid(input.commandId)
    || typeof input.inviteSecret !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(input.inviteSecret)) return badRequest;
  return { ok: true, value: { commandId: input.commandId.toLowerCase(), inviteSecret: input.inviteSecret } };
}

export interface EventCursor {
  readonly afterRevision: number;
  readonly afterIndex: number;
}

/** Reads `?afterRevision=N&afterIndex=M`. Both or neither; no other parameters. Neither starts at the first event. */
export function parseEventCursor(params: URLSearchParams): ParseResult<EventCursor> {
  const keys = [...params.keys()];
  if (keys.length === 0) return { ok: true, value: { afterRevision: 0, afterIndex: 0 } };
  if (keys.length !== 2 || !params.has('afterRevision') || !params.has('afterIndex')) return badRequest;
  const [afterRevision, afterIndex] = [params.get('afterRevision')!, params.get('afterIndex')!].map(value =>
    /^(?:0|[1-9][0-9]{0,15})$/.test(value) ? Number(value) : Number.NaN);
  if (!isVersion(afterRevision) || !isVersion(afterIndex)) return badRequest;
  return { ok: true, value: { afterRevision, afterIndex } };
}
