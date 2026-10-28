# Firebase Authentication — Microsoft/Hotmail and Google

## Selected design

Use Firebase Authentication on the no-cost Spark plan, exclusively for identity. Keep website, API, realtime rooms and SQLite saves on Cloudflare. Start without a Firebase billing account. No Firestore, Realtime Database, Cloud Functions, Firebase game hosting, phone/SMS or enterprise SSO is required. Configure built-in Google and Microsoft social providers, not generic paid SAML/OIDC connections.

This replaces the previous identity design before coding starts: no user migration, dual-provider backend or compatibility shim is needed. The SDK's Firebase auth helper domain may be used for sign-in; this does not move game hosting off Cloudflare.

## Owner setup

1. Create separate Firebase projects for preview and production on Spark, register a Web app in each, and record the Web SDK config: apiKey, authDomain, projectId, appId. These identifiers are public configuration, not server credentials. Do not enable unrelated paid products.
2. Enable Authentication and the Google provider; supply the required project support email. Configure consent/test users as applicable. Add the exact app hosts to Authentication Authorized domains. Add localhost explicitly for local real-provider testing; newer projects may not include it by default. Use stable preview and production Worker/custom-domain hosts, not wildcards.
3. Register a Microsoft Entra Web OAuth application supporting organizational AND personal Microsoft accounts, so Outlook.com/Hotmail users can sign in. A single-organization registration is insufficient. Enable Firebase's Microsoft provider with its client ID and client secret VALUE. Use the exact callback shown by Firebase, normally `https://<project-id>.firebaseapp.com/__/auth/handler`. Store the secret only in the Firebase provider configuration and track/rotate its expiry.
4. Use `new GoogleAuthProvider()` and `new OAuthProvider('microsoft.com')` in the Firebase Web SDK. Leave Microsoft tenant at the provider's tenant-independent common default for the chosen registration; do not restrict to one organization. Use minimal sign-in scopes, not mail/contact access.
5. Test Google and a personal Microsoft/Hotmail account against preview and production independently. Record sanitized outcomes, not tokens or email addresses. Check provider consent/cancellation and expired Microsoft client-secret recovery instructions.

## Browser flow: popup by default

Use `signInWithPopup` from a direct user click. Wait for Firebase auth initialization (`onAuthStateChanged` or equivalent supported SDK facility) before deciding whether to show the login UI. Use supported Firebase persistence; do not write a custom refresh-token store. Obtain `user.getIdToken()` and send it as the API Bearer credential. Handle refresh through SDK; on authentication expiry, force-refresh once if appropriate and retry the identical game command ID. Avoid an infinite refresh loop.

On Cloudflare hosting, popup login avoids the cross-origin storage issues documented for signInWithRedirect. Do not implement a homemade PKCE/code-exchange callback. The OAuth handler is Firebase's `/__/auth/handler`, not a Cloudflare `/auth/callback`. The app may have a `/login` page; after login, resume only a validated local room path.

Popup blocked/closed, account-exists-with-different-credential and provider failures need clear retry/recovery UI. Preserve invite fragments temporarily in sessionStorage and clear them after join/cancel; never send invites to the OAuth provider. For collision errors, ask users to sign in with the original provider; do not auto-link identities by matching email. Account-linking UI is out of scope.

Test desktop and tablet Safari/WebKit, not only Chromium. If popup behavior is insufficient, a redirect fallback is a deliberate follow-up design using Firebase's documented non-Firebase-hosting options (including an appropriately implemented auth-helper reverse proxy). Do not silently enable redirect fallback or route `/__/auth/*` to SPA HTML.

## Worker verification contract

Accept only Firebase ID tokens, not custom tokens, Google/Microsoft access tokens or raw client identity fields. Use a maintained Web Crypto-compatible JWT library verified to work in Cloudflare Workers. No Firebase Admin Node SDK or service-account private key is needed for this verification path.

Google's documented signing certificate endpoint is:
`https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`

It returns a map of kid to PEM X.509 certificate, NOT a JWKS document. Choose/import the certificate with a Workers-compatible library (for example a verified compatible importX509 implementation); do not pass the response blindly to a remote-JWKS helper. Pin this endpoint; ignore token-provided jku/x5u URLs. Cache certificates and imported keys using the endpoint's Cache-Control max-age; deduplicate fetches, bound timeouts and refresh once for unknown kid. Fail closed if no valid key is available; never persist an indefinite trust cache.

Mandatory validation:

| Claim/header | Required check |
| --- | --- |
| alg | Exactly RS256; reject unsigned/HS tokens |
| kid | Matches a trusted current Secure Token certificate |
| signature | Verified before any identity is trusted |
| aud | Exactly configured FIREBASE_PROJECT_ID |
| iss | Exactly `https://securetoken.google.com/<FIREBASE_PROJECT_ID>` |
| sub | Nonempty opaque string, at most 128 characters; canonical userId, NOT a UUID |
| exp | In future |
| iat | In past; reject unreasonable future values |
| auth_time | In past |
| nbf | If present, not in future |

Allow at most 60 seconds documented clock tolerance for clock claims. Do not accept missing mandatory claims, arbitrary Firebase projects or issuer/audience claims merely decoded without signature validation. Recheck room membership per request. Sanitize and bound display names; never authorize by email/name. A small independently tested verifier wrapper should expose a trusted userId, sanitized optional displayName and token expiry only.

## Sessions, sockets and revocation

Firebase ID tokens normally last about one hour; let SDK refresh them. Bind each WebSocket ticket to verified token expiry and close idle expired sockets via the room alarm. Reconnect with refreshed identity and a new ticket. Logout clears the client session and closes local sockets. Signature/claim verification does not check server-side token revocation or instant account disabling: an issued ID token may remain usable until expiry. This is the explicit MVP revocation boundary, not a claim of immediate logout revocation. If instant revocation becomes required, design/test that separately rather than adding service-account credentials casually.

## Local and automated tests

Use a separate loopback-only test entry point with deterministic signed test identities and mock certificate fetches. Firebase Auth Emulator is optional for SDK tests only; its unsigned tokens must never be accepted by preview/production. Never put FIREBASE_AUTH_EMULATOR_HOST, test keys, emulator adapters or local bypass imports into the deployed bundle. Test tokens use Firebase-shaped claims and opaque non-UUID UIDs. Test malformed/expired tokens, wrong project, missing/future iat/auth_time, unexpected algorithms, unknown kid, cache expiry, rotation, key-fetch failures and nonmember room access.

Real-provider staging checks remain mandatory at T17. Local tests are not proof that OAuth settings or third-party browser behavior work. No production credentials are needed for T11 automated tests.

## Cost and availability

Spark is the selected free plan; two occasional players are well within normal social-login allowances. Firebase Authentication's published product/pricing documentation does not state a weekly inactivity pause; no uptime SLA or perpetual free guarantee is assumed. Check current quotas before release, especially if Identity Platform is enabled. Do not enable Blaze or phone authentication to solve an unrelated configuration error. Provider downtime never permits unverified access.
