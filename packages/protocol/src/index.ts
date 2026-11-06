/** Temporary narrow health contract; gameplay schemas are reserved for T07. */
export interface HealthResponse { readonly ok: true }
export function isHealthResponse(value: unknown): value is HealthResponse {
  return typeof value === 'object' && value !== null && 'ok' in value && value.ok === true;
}
