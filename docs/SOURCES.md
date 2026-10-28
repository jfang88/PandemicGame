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
| Supabase pricing | https://supabase.com/pricing | OAuth/MAU allowance and inactive-project pause |
| Microsoft login | https://supabase.com/docs/guides/auth/social-login/auth-azure | Personal accounts, consumers tenant, callback, email scope |

Additional implementation entry points to verify during their tasks: Supabase Google social login and JWT/JWKS guides; Workers Vitest integration compatibility; Wrangler secret/environment configuration; GitHub Actions environment protection; Playwright browser contexts. The selected game rules are our project defaults and are not sourced from a commercial rulebook.
