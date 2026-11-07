export * from './commands';
export * from './projection';

/** The foundation client only checks connectivity. */
export interface HealthResponse { readonly ok: true }
export function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true;
}
