import type { CommandEnvelope } from '@pandemic/protocol';

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']';
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
    return '{' + entries.map(([key, item]) => JSON.stringify(key) + ':' + canonicalJson(item)).join(',') + '}';
  }
  return JSON.stringify(value);
}

/** Hash validated JSON; payload object order is irrelevant but payment order is significant. */
export async function commandHash({ protocolVersion, expectedVersion, type, payload }: CommandEnvelope): Promise<string> {
  const input = new TextEncoder().encode(canonicalJson({ protocolVersion, expectedVersion, type, payload }));
  const digest = await crypto.subtle.digest('SHA-256', input);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
