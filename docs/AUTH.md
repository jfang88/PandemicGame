# Microsoft/Hotmail and Google authentication

## Decision

Use Supabase Auth as an external identity provider. All game hosting/storage remains on Cloudflare. Do not implement passwords, a custom OAuth token server, or direct Microsoft/Google JWT acceptance by the game. Browser authenticates through Supabase; API accepts only this application's Supabase access JWTs.

## Owner setup checklist

1. Create a Supabase project (separate preview/production preferred). Record its URL and publishable key. Choose asymmetric JWT signing keys for JWKS verification.
2. Set Site URL to the correct app origin and allow exact local/preview/production callback URLs as appropriate. Use `http://localhost` for local Microsoft flow, not 127.0.0.1. Configure `/auth/callback` in the SPA.
3. Microsoft Entra: register an OAuth app supporting personal Microsoft accounts. For personal-only, configure Supabase Azure provider tenant URL `https://login.microsoftonline.com/consumers`. For personal plus organizational accounts, select a matching supported account type and common tenant. A single-organization-only app will not satisfy Hotmail login.
4. Microsoft provider redirect URI is `https://<project-ref>.supabase.co/auth/v1/callback` (the identity provider callback, distinct from the SPA callback). Put client ID and secret VALUE in Supabase's Azure provider. Record secret expiry and rotate before it expires. Follow current Supabase guidance for verified-email claims.
5. Google: create OAuth web client, configure consent screen/test users or production status as applicable, and register the same Supabase callback form. Store client ID/secret in Supabase. Use minimal identity scopes; no Gmail/contacts access.
6. Frontend invokes provider `azure` with `email` scope or `google`, using PKCE and a fixed allowlisted SPA callback. Exchange code, restore intended local room path safely, and remove transient code/invite data. Reject external next/returnTo destinations.
7. Test sign-in with an actual personal Hotmail/Outlook account and an actual Google account. Record pass/fail and environment without storing tokens or email addresses in the repository.

## Backend contract

Use a maintained JWT verifier compatible with Workers, reading a fixed project's JWKS. Validate cryptographic signature, allowed algorithm, issuer, audience, expiry and not-before. Cache keys, handle rotation, and bound failed refresh retries. Derive userId from `sub`; do not authorize by email, name, provider ID or client headers. Recheck membership every API request. Sanitize/length-limit display names and render as text.

Do not auto-link game identities just because email strings match. Let Supabase's supported verified identity-linking flow handle any future account linking; it is out of scope for MVP. A game may see two separate accounts as two users.

## Sessions and realtime

Refresh access tokens through Supabase client before retrying unauthorized requests. Do not replay game actions with new command IDs after token refresh. WebSocket tickets expire in 60 seconds and are bounded by JWT expiry; sockets lose room access when authentication expires, even if no game actions arrive. Refresh and reconnect. Logout clears client state and closes sockets; local JWT verification cannot instantly revoke an already issued access token. Keep access-token lifetime bounded and document it.

## Local tests

Separate loopback-only local test entry point supplies deterministic signed test identities. Production/preview code uses a different verifier and must reject test keys, actor headers and bypass flags. Test expired, wrong issuer/audience/signature/algorithm and rotated keys. Never embed test keys in the production bundle. CI uses local mocks for repeatability; staging OAuth smoke tests remain mandatory and cannot be reported as automated-provider coverage.

## External dependency

Supabase Free may pause after inactivity. An owner may reactivate it or choose Pro. Do not conceal that dependency in the Cloudflare runbook or add an unsafe auth fallback when it is unavailable.
