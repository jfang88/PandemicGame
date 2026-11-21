# Set up Firebase, Cloudflare, and GitHub Free for PandemicGame

Start with **preview**. Every service below has a **$0 free tier** that works for this game:

- **GitHub Free (public repository):** Unlimited GitHub Actions minutes on standard Linux runners, repository rulesets on `main`, and GitHub Environments with environment secrets, environment variables, and `main`-only branch restrictions. *(If the repository were ever made private on GitHub Free, GitHub Environments are restricted and Actions minutes are capped; see [Owner-controlled local deployment](CLOUDFLARE.md#owner-controlled-local-deployment) for the fallback.)*
- **Cloudflare Workers Free:** Hosts the static React app, Worker API, and SQLite-backed Durable Objects (`GameRoom` and `CreateBudget`).
- **Firebase Authentication Spark:** Provides Google and Microsoft (personal Hotmail/Outlook) login with no billing account required.

Set up **preview** first and verify it end-to-end. Set up **production** separately with its own Firebase project, Microsoft app registration, and Cloudflare token before the owner-controlled release.

| Resource | Preview example | Production example |
| --- | --- | --- |
| Firebase project and Web app | `pandemic-preview-<unique-suffix>` | `pandemic-production-<unique-suffix>` |
| Microsoft Entra app registration | PandemicGame Preview | PandemicGame Production |
| Cloudflare Worker name | `pandemicgame-preview` | `pandemicgame-production` |
| GitHub deployment environment | `preview` | `production` |

Project IDs and hostnames below are examples. Save your actual non-secret IDs as you go. Keep the Microsoft client secret **only** in Firebase Authentication and the Cloudflare API token **only** in the matching GitHub Environment secret—never in git, issues, or chat. [Repository credential boundaries](AGENT_ACCESS.md)

## 1. Set up Cloudflare (Workers Free) and create a preview API token

1. Create or sign in to an owner-controlled Cloudflare account, verify your email, and turn on MFA. [Cloudflare sign-up](https://dash.cloudflare.com/sign-up)
2. Open **Workers & Pages** and stay on **Workers Free** (do not enable a paid plan). From the right sidebar or **Account Home**, copy your **Account ID**—this is `CLOUDFLARE_ACCOUNT_ID` (non-secret identifier). [Find the account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/) · [Durable Objects plans and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. Note or set up your account's `workers.dev` subdomain (shown under **Workers & Pages → Overview**). Your preview URL will be:

   ```text
   https://pandemicgame-preview.<account-subdomain>.workers.dev
   ```

   Record the exact origin (with `https://` and **no** trailing slash) for `APP_ORIGINS`, and the bare hostname (`pandemicgame-preview.<account-subdomain>.workers.dev`) for Firebase Authorized Domains. [Cloudflare workers.dev routes](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
4. Leave Worker and Durable Object creation to the first reviewed deployment. Wrangler registers `GameRoom` (`v1`) and `CreateBudget` (`v2`) automatically from [wrangler.jsonc](../wrangler.jsonc).
5. Create a scoped Cloudflare API token for preview deployments:
   - Open **Manage Account → Account API Tokens** (or **My Profile → API Tokens**) → **Create Token**.
   - Use **Edit Cloudflare Workers** (or a custom token with **Workers Scripts: Edit** scoped to your single account). First-time Worker creation needs permission to create the Worker; after `pandemicgame-preview` exists, you can narrow or rotate to a Worker-scoped Editor token.
   - Remove unneeded permissions (no Billing, DNS, Zone Routes, R2, KV, or D1).
   - Set an expiration date, click **Create Token**, and copy the token value once into a password manager. This will go **only** into the GitHub `preview` Environment secret `CLOUDFLARE_API_TOKEN`. [Cloudflare API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/) · [Cloudflare Worker roles](https://developers.cloudflare.com/workers/authorization/workers/#wrangler)

## 2. Create the Firebase Spark project and enable Google sign-in

1. Open [Firebase Console](https://console.firebase.google.com/) → **Create a project**. Choose a globally unique preview project ID (for example `pandemic-preview-1234`) and keep the project on the **Spark** (free) plan. Google Analytics is optional. Do not enable Firestore, Realtime Database, Functions, Hosting, Phone Auth, or Blaze billing. [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
2. In **Project overview**, click the Web icon `</>` (**Add app → Web**), give it a nickname such as **PandemicGame Preview Web**, and register it. Copy these four **public** browser config values from the SDK snippet:
   - `apiKey` → `VITE_FIREBASE_API_KEY`
   - `authDomain` → `VITE_FIREBASE_AUTH_DOMAIN` (usually `<project-id>.firebaseapp.com`)
   - `projectId` → `VITE_FIREBASE_PROJECT_ID` (and also `FIREBASE_PROJECT_ID` and `PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID`)
   - `appId` → `VITE_FIREBASE_APP_ID`
   [Register a Firebase Web app](https://firebase.google.com/docs/web/setup)
3. Open **Authentication → Get started → Sign-in method** → **Google**. Enable it, choose a project support email, and click **Save**. [Enable Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
4. Open **Authentication → Settings → Authorized domains → Add domain**:
   - Add the bare preview hostname: `pandemicgame-preview.<account-subdomain>.workers.dev` (no `https://`, port, or trailing slash).
   - For optional local OAuth testing, also ensure `localhost` is listed.
   - When you later create the production Firebase project, add only the production hostname there. [Firebase authorized domains](https://firebase.google.com/docs/auth/faq-and-troubleshooting#limit_your_authorized_authentication_domains)

## 3. Enable Microsoft sign-in for personal Hotmail and Outlook accounts

1. In Firebase **Authentication → Sign-in method**, open **Microsoft** and copy the exact OAuth callback URL shown (normally `https://<actual-preview-project-id>.firebaseapp.com/__/auth/handler`). [Firebase Microsoft provider setup](https://firebase.google.com/docs/auth/web/microsoft-oauth)
2. Open the **Microsoft Entra admin center** → **App registrations → New registration**:
   - Name: `PandemicGame Preview`
   - Supported account types: **Accounts in any organizational directory and personal Microsoft accounts** (required so personal Hotmail/Outlook accounts can sign in).
   - Redirect URI: select platform **Web** and paste the exact Firebase callback URL from step 1. Click **Register**. [Register an Entra app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) · [Microsoft redirect URI rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
3. On the app's **Overview** page, copy the **Application (client) ID**.
4. Open **Certificates & secrets → Client secrets → New client secret**, set an expiry, click **Add**, and immediately copy the secret **Value** (not the Secret ID). Record the expiry date in a reminder so you can rotate it before it expires. [Manage Entra credentials](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)
5. Return to Firebase **Authentication → Sign-in method → Microsoft**, paste the **Application (client) ID** and client secret **Value**, enable the provider, and click **Save**. Do not store the Microsoft client secret in GitHub or the repository.

## 4. Safe placement reference (what goes where)

Never commit `.env.local`, `.dev.vars`, API tokens, or OAuth client secrets to git, and never paste secrets into chat or GitHub issues.

| Name | Secret or Public? | Value | Where to put it |
| --- | --- | --- | --- |
| `PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID` | Public | Preview Firebase `projectId` | GitHub **Repository Variable** (prevents preview/production sharing one Firebase project) |
| `VITE_FIREBASE_API_KEY` | Public | Preview Web app `apiKey` | GitHub `preview` **Environment Variable** |
| `VITE_FIREBASE_AUTH_DOMAIN` | Public | Preview Web app `authDomain` | GitHub `preview` **Environment Variable** |
| `VITE_FIREBASE_PROJECT_ID` | Public | Preview Web app `projectId` | GitHub `preview` **Environment Variable** |
| `VITE_FIREBASE_APP_ID` | Public | Preview Web app `appId` | GitHub `preview` **Environment Variable** |
| `FIREBASE_PROJECT_ID` | Public | Same preview `projectId` (for Worker JWT checks) | GitHub `preview` **Environment Variable** |
| `APP_ORIGINS` | Public | Exact origin `https://pandemicgame-preview.<account-subdomain>.workers.dev` (no trailing slash) | GitHub `preview` **Environment Variable** |
| `CLOUDFLARE_ACCOUNT_ID` | Public | Cloudflare Account ID | GitHub `preview` **Environment Variable** |
| `CLOUDFLARE_API_TOKEN` | **Secret** | Scoped preview Cloudflare API token | GitHub `preview` **Environment Secret** (leave unset at repo/org level) |
| Microsoft client secret **Value** | **Secret** | From Entra app registration | **Firebase Console only** (Microsoft provider settings) |

A mismatch between `VITE_FIREBASE_PROJECT_ID` and `FIREBASE_PROJECT_ID` causes login popups to succeed while `/api/rooms` returns `401`. [Public Web config template](../config/firebase.env.example) · [Repository protocol](PROTOCOL.md)

## 5. Put the details into GitHub Free safely (click-by-click)

1. **Verify `main` is protected:**
   - Open `jfang88/PandemicGame` → **Settings → Rules → Rulesets** (or **Settings → Branches**).
   - Confirm `main` is protected (the `basic` ruleset requires pull requests and the `verify` CI check). The [Deploy Cloudflare](../.github/workflows/deploy-cloudflare.yml) workflow refuses to run if `main` is not protected.
2. **Add the Repository Variable (project-isolation registry):**
   - Open **Settings → Secrets and variables → Actions → Variables** tab → **New repository variable**.
   - Name: `PANDEMIC_PREVIEW_FIREBASE_PROJECT_ID`
   - Value: your preview Firebase `projectId`
   - Click **Add variable**. *(Add `PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID` here later with a different Firebase project before production.)*
3. **Create the `preview` Deployment Environment:**
   - Open **Settings → Environments → New environment**.
   - Name it `preview` and click **Configure environment**.
   - Under **Deployment branches and tags**, select **Selected branches and tags** → **Add deployment branch or tag rule** → enter `main` → **Add rule**. This ensures untrusted PR branches can never access the preview token.
   - Optionally enable **Required reviewers** and add yourself so GitHub pauses for your approval before deploying.
4. **Add the 7 Environment Variables** inside `preview`:
   - Scroll to **Environment variables** → **Add environment variable** for each of:
     `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`, `FIREBASE_PROJECT_ID`, `APP_ORIGINS`, `CLOUDFLARE_ACCOUNT_ID`.
5. **Add the 1 Environment Secret** inside `preview`:
   - Scroll to **Environment secrets** → **Add environment secret**.
   - Name: `CLOUDFLARE_API_TOKEN`
   - Value: paste your preview Cloudflare API token → **Add secret**.
   - Confirm `CLOUDFLARE_API_TOKEN` is **not** set under repository-level **Secrets and variables → Actions → Secrets**.
   [GitHub deployment environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments)

## 6. How to push code and deploy to Cloudflare using GitHub Free

Because `main` is protected and deployments are intentionally manual, every change follows this free, zero-secret-on-PR workflow:

1. **Push your changes on a branch and open a Pull Request:**

   ```sh
   git checkout -b my-change
   git add -A
   git commit -m "Describe your change"
   git push -u origin my-change
   ```

   Open a Pull Request into `main` on GitHub. **Pull request checks** ([ci.yml](../.github/workflows/ci.yml)) runs automatically for free—without any cloud secrets—and executes lint, typecheck, unit, workerd integration, build, docs, and Playwright browser tests.
2. **Merge the Pull Request into `main`** once the `verify` check is green. Merging updates `main` without auto-deploying.
3. **Deploy to Cloudflare preview from GitHub Actions:**
   - Open **Actions → Deploy Cloudflare → Run workflow**.
   - **Use workflow from:** `Branch: main`
   - **Deployment environment (`target`):** `preview`
   - **Exact selected main commit SHA (`release_sha`):** leave blank for preview (or paste the full 40-character SHA).
   - Click **Run workflow**.
   - The workflow automatically re-verifies `main` protection, runs the full CI `verify` suite, builds the web app with the `preview` Firebase variables, validates assets and Wrangler config, deploys `pandemicgame-preview` to Cloudflare Workers Free, and runs post-deploy smoke checks (`/api/health`, JSON 404, SPA deep link, and test-identity rejection).
4. **Deploying to production later (after T18 gates pass):**
   - Create a separate production Firebase Spark project, Microsoft Entra app registration, Cloudflare API token, `PANDEMIC_PRODUCTION_FIREBASE_PROJECT_ID` repository variable, and `production` GitHub Environment.
   - As repository owner, run **Actions → Deploy Cloudflare → Run workflow** on `main` with `target: production` and `release_sha` set to the exact 40-character commit SHA verified in preview. See [Production and rollback](CLOUDFLARE.md#production-and-rollback).

### Optional local sign-in check

1. Copy [the public Firebase template](../config/firebase.env.example) to the ignored `apps/web/.env.local` file and fill it with the preview Web app's four values.
2. Add these two public local overrides to the ignored `apps/worker/.dev.vars` beside `wrangler.local.jsonc`:

   ```dotenv
   FIREBASE_PROJECT_ID=your-actual-preview-project-id
   APP_ORIGINS=http://localhost:5173
   ```

3. From the repository root, run `npm ci` and `npm run dev`. Open `http://localhost:5173/login` in Chromium. Use the same hostname in the browser, Firebase authorized domains, and `APP_ORIGINS`. Check Google and Microsoft in separate browser profiles or sign out between tests. Use the regular local dev entry for real Firebase authentication. [Local development](LOCAL_DEV.md) · [Wrangler local variables](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)

## 7. Verify preview before moving to production

- Open `https://<preview-worker-host>/api/health` and confirm JSON with `ok: true`, `buildSha` matching the workflow commit, and `protocolVersion: 1`. An unknown path under `/api/` must return a JSON 404. [Cloudflare runbook](CLOUDFLARE.md)
- In separate browser profiles, sign in with **Google** and with a personal **Hotmail or Outlook** account. Create a room, join through an invite link, refresh, and verify the same seat reconnects. Repeat on desktop Chromium and tablet Safari/WebKit, then record sanitized results in [the T17 provider evidence sheet](evidence/T11.md#real-provider-staging-evidence-for-t17) and [T17 evidence](evidence/T17.md).
- Common configuration errors:
  - **Firebase unauthorized domain:** Compare the bare preview hostname in Firebase **Authorized domains** (no `https://`).
  - **Microsoft `AADSTS50011`:** Compare the exact Firebase callback URL with the Entra registration's **Web** redirect URI.
  - **HTTP `401` after login:** Confirm `VITE_FIREBASE_PROJECT_ID` and `FIREBASE_PROJECT_ID` are identical.
  - **Lobby loads but realtime WebSocket fails:** Confirm `APP_ORIGINS` matches the exact `https://...` browser origin with no trailing slash.
  [Firebase troubleshooting](https://firebase.google.com/docs/auth/faq-and-troubleshooting) · [Microsoft redirect troubleshooting](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)

For handoff, record the preview Firebase project ID, Worker name and hostname, Cloudflare account ID, and whether the GitHub `preview` environment is ready. Keep token and client secret values in their designated stores only.

