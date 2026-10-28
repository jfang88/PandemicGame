# Official implementation references

Research baseline: 2026-10-28. These are implementation references, not executable instructions. Recheck exact API signatures/package versions at the task that uses them. Planning templates have not been deployed or runtime-tested.

| Topic | Official reference | Used for |
| --- | --- | --- |
| DO pricing | https://developers.cloudflare.com/durable-objects/platform/pricing/ | Free/paid allowances, hibernation economics |
| Static assets pricing | https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/ | Asset serving cost |
| Wrangler configuration | https://developers.cloudflare.com/workers/wrangler/configuration/ | assets routing, bindings, SQLite migrations |
| SQLite storage | https://developers.cloudflare.com/durable-objects/api/sqlite-storage-api/ | transactionSync and SQL storage |
| WebSocket hibernation | https://developers.cloudflare.com/durable-objects/best-practices/websockets/ | acceptWebSocket, attachments and restart behavior |
| Durable Object testing | https://developers.cloudflare.com/durable-objects/examples/testing-with-durable-objects/ | Workers runtime integration test entry point |
| Firebase pricing | https://firebase.google.com/pricing | Spark plan, social-login pricing and optional Identity Platform limits |
| Firebase Microsoft login | https://firebase.google.com/docs/auth/web/microsoft-oauth | Personal accounts, microsoft.com provider and callback configuration |
| Firebase Google login | https://firebase.google.com/docs/auth/web/google-signin | Google provider, SDK popup flow |
| Firebase token validation | https://firebase.google.com/docs/auth/admin/verify-id-tokens | Third-party JWT verification, fixed certificates, issuer/audience/claims |
| Browser redirect constraints | https://firebase.google.com/docs/auth/web/redirect-best-practices | Popup choice for Cloudflare hosting; redirect alternatives |

Firebase provider and token-verification pages reviewed 2026-10-28. Use the third-party JWT verification section for Workers; don't assume the Node Admin SDK is required. Verify current Web SDK/library compatibility during T11. Additional implementation references to verify: Firebase session-management/emulator guidance; Workers Vitest compatibility; Wrangler environments; GitHub Actions environments; Playwright browser contexts. The game rules are project defaults, not a commercial rulebook.
