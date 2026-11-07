# Owner onboarding and secure coding-agent deployment

For the console steps, environment values and first-preview checklist, start with [Owner cloud setup](OWNER_CLOUD_SETUP.md).

This is a step-by-step **owner setup** guide for the Cloudflare/Firebase architecture. It does not mean accounts, credentials, hosted services or GitHub deployment environments have already been created. Complete it before real-provider testing (T11/T17). T01–T10 can primarily be developed and tested locally with no cloud credentials.

## 1. Account sign-up and ownership

### Cloudflare (hosting and game-state storage)

1. Visit [Cloudflare sign up](https://dash.cloudflare.com/sign-up), make an owner-controlled account, verify your email, and turn on MFA. Keep a recovery path outside coding agents.
2. In the dashboard select **Workers & Pages / Workers** (navigation may change). Locate the account ID in the account overview or Workers account details; save the identifier as `CLOUDFLARE_ACCOUNT_ID`, not as a password.
3. Inspect the **Workers Free** plan and ensure Workers and SQLite-backed Durable Objects are offered for your account. Do **not** buy a domain or enable a paid plan as a coding-agent prerequisite. Verify the current limits in the dashboard.
4. Reserve distinguishable Worker names for **preview** and **production**. They must have separate Durable Object namespaces/configuration. The initial local T01 Wrangler file must never be deployed as a substitute for T17's reviewed environment configuration.
5. Leave deployments disabled until the T17 gate. Owner may use `npx wrangler login` interactively for manual development; noninteractive automation uses a narrower account-owned API token.

Documentation: [Cloudflare Workers start](https://developers.cloudflare.com/workers/get-started/guide/), [GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/), [Worker roles](https://developers.cloudflare.com/workers/authorization/workers/).

### Firebase (identity only)

1. Sign in with an owner-controlled Google account at [Firebase Console](https://console.firebase.google.com/). Create **two distinct projects** (e.g. `pandemic-preview` and `pandemic-production`), each on the **Spark** plan. Google Analytics is optional; skip unrelated services. Project IDs must be unique globally and are immutable.
2. In each Firebase project register a **Web app** (the `</>` icon). Copy the **public** Web SDK values `apiKey`, `authDomain`, `projectId`, `appId` to separate environment-specific settings. Map these to `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID`. These are public identifiers, **not** OAuth secrets; still restrict the API key where appropriate and never treat it as authorization.
3. Open **Authentication** → **Sign-in method**; enable **Google**, choose the required support email, save. Add each exact deployed app hostname in **Authentication → Settings → Authorized domains**, and explicitly add `localhost` for local provider testing as needed.
4. For Hotmail/Outlook, create a Microsoft Entra application registration under an owner-controlled identity/tenant that can support **accounts in any organizational directory and personal Microsoft accounts**. Select the **Web** platform for the Firebase OAuth helper redirect, **not** the Worker URL: `https://<FIREBASE_PROJECT_ID>.firebaseapp.com/__/auth/handler` (verify the exact callback shown in Firebase). Create a client secret with a recorded expiry; paste its **value** only in the Firebase Microsoft provider dashboard, alongside the Microsoft application/client ID. Repeat with separate preview and production app registrations where practical. Do not commit or send the secret to an agent.
5. In Firebase enable the **Microsoft** sign-in provider, enter client ID/secret; verify a Google and a **personal** Hotmail login manually in preview later. Do not request Microsoft Graph email permissions. Do not turn on Firestore, Realtime Database, phone auth, Functions, hosting, or Blaze billing just to get login working.
6. Record non-secret identifiers in an owner-held setup checklist, and the Microsoft client-secret expiry in a reminder; keep recovery codes and secret values in a password manager.

Documentation: [Firebase web setup](https://firebase.google.com/docs/web/setup), [Google sign-in](https://firebase.google.com/docs/auth/web/google-signin), [Microsoft sign-in](https://firebase.google.com/docs/auth/web/microsoft-oauth), [Microsoft app registration](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app).

## 2. Separate powers: coding, testing and deployment

| Principal | Allowed | Denied / requires owner |
| --- | --- | --- |
| ChatGPT/Claude coding agent via GitHub app or tightly scoped Git credential | Read repository, write task branch, run local checks, open PR | Cloudflare/Firebase console administration; release secrets; merge to main; production |
| PR GitHub Actions | `npm ci`, lint, typecheck, unit/integration/e2e when applicable, build, docs validation, artifact scans | Provider credentials, Cloudflare deployment, public hosting, production secrets |
| Preview deploy workflow (T17) | After gated trusted-main trigger, fetch preview-only environment secrets, deploy preview Worker, run preview smoke checks, publish redacted evidence | Production access; deployments from fork PR code; automatic paid-plan upgrade |
| Production release workflow (T18 and explicit owner command) | Approved reviewed commit only, production-only secrets, smoke/rollback evidence | Unreviewed PR, implicit deployment on push, automatic billing/config changes |
| Owner | Create accounts, enable providers, manage secrets, approve sensitive actions and production | Share raw credentials in chats, repo files, issues or logs |

**Preferred automation path:** ChatGPT/Claude → task branch + PR → secret-free GitHub CI → human merge → explicitly triggered preview workflow → smoke tests → separate owner-approved production release. An agent can request the workflow run or inspect its logs if connected and authorized; do not assume any chat or coding-agent session has direct browser access, runtime credentials, or automatic background execution.

## 3. Cloudflare API token for the deployment runner

Prefer an **account-owned API token** over a global API key or a token copied into an agent prompt.

1. In Cloudflare open **Manage Account → API Tokens** (or the account API token page) and create a token such as `pandemic-preview-github`. Follow current Worker role controls: a Worker **Editor** scoped to the **existing preview Worker** can deploy it; creating the Worker for the first time needs **Workers Admin** at the product scope. Have the owner bootstrap that one-time resource manually, then replace a bootstrap token with a narrower preview-only Editor token. For legacy permission UI, the **Edit Cloudflare Workers** template is a starting point, but inspect/remove unneeded permissions such as broad KV/R2/zone routing.
2. Scope to the **single intended account and preview Worker** where supported; avoid API Tokens Edit, Billing, Access, DNS and R2/D1/KV privileges unless a verified deployment operation strictly needs them. If changing custom routes/domains, grant the required zone Workers Routes permission only to those routes/zones.
3. Set an appropriate token expiry; document rotation and revocation. The secret is displayed once. Store it only as `CLOUDFLARE_API_TOKEN` in the GitHub **preview environment secret**. Store `CLOUDFLARE_ACCOUNT_ID` as a preview environment variable. Use a **different** token for production with its own scope and GitHub environment; the agent should never receive either token.
4. Runner example (after T17 adds reviewed deployment scripts):

```bash
# These names are injected by the protected GitHub environment, not committed.
# CLOUDFLARE_API_TOKEN / CLOUDFLARE_ACCOUNT_ID are consumed by Wrangler.
npm ci
npm run lint && npm run typecheck && npm run test:unit
npm run build
npm run deploy:preview
```

5. In a trusted CI job, record the deployment URL and commit, then test `GET /api/health`, JSON 404 on unknown `/api/*`, page load, and later identity/gameplay flows using **real** preview accounts. Never print tokens, raw requests, OAuth callbacks, invitation links or room state.

Verify the latest Cloudflare token UI and exact minimum role permissions before creation: [Roles](https://developers.cloudflare.com/workers/authorization/workers/), [Account API tokens](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/), [GitHub deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/).

## 4. GitHub permissions and secret placement

1. Open `jfang88/PandemicGame` → **Settings → Environments**. Set up `preview` and `production` **only if supported by the repository's current plan/visibility**. Review the GitHub documentation: protection rules/required reviewers vary with public/private repo and plan.
2. Put the respective Cloudflare token in each **environment secret**, not in repository variables or `.env` files. Put public Firebase Web config and account ID in **environment variables**. Keep preview and production projects, Worker/DO namespaces, Firebase app registrations and tokens strictly distinct.
3. Restrict deployment jobs to trusted protected main branch and manual `workflow_dispatch`. Never use `pull_request_target` to run untrusted code with secrets. Workflow permissions should normally be `contents: read` and no deployment secret access in PR jobs. Any `id-token: write` is for an explicitly justified OIDC integration, not standard Cloudflare API token deployment.
4. The **production** workflow should require a separate explicit owner action regardless of whether GitHub environment approval is available. Protect main with checks and review where repo settings permit. Do not describe approvals as configured until confirmed.
5. A connected GitHub app can let ChatGPT or Claude create branches/PRs without their own personal access token. If running a terminal agent outside the connector, prefer `gh auth login` interactively or a narrowly scoped, expiring fine-grained PAT limited to **this repository** for Contents and Pull Requests write. Store it in the agent runner's secret store, not in prompts or project files. Never use a classic `repo` PAT or unrestricted account token merely for convenience.
6. If using an autonomous hosted coding agent, assume any tools and shell commands the agent executes are exposed to the agent. **Do not mount preview/production deployment secrets into its execution container.** Use GitHub as the deployment boundary instead.

GitHub documentation: [Managing environments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments), [Review deployments](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/review-deployments).

## 5. Does Firebase need a service account or deployment token?

**No for the MVP application runtime.** Firebase's browser Web SDK uses public config; the Worker validates ID tokens with Google's public Secure Token certificates. The Microsoft OAuth **client secret lives in Firebase's provider configuration**, and the backend does not require Google service-account private keys or Firebase Admin SDK.

For initial Firebase project, Google/Microsoft provider and authorized-domain setup, **owner console setup is simplest and safest**. Agents can update application code and config examples without Firebase admin access.

If later automating **Firebase project administration** is actually needed, evaluate a **separate, narrowly authorized Google Cloud service account with GitHub Actions Workload Identity Federation (OIDC)** bound to this specific repo/environment/branch; this avoids long-lived JSON keys. Firebase CLI supports Application Default Credentials for CI. Confirm that the specific Firebase Authentication provider/domain operation is supported before granting privileges. This is **not required** for gameplay deployment, and no Firebase deploy workflow should be added for the current architecture. Avoid the legacy `firebase login:ci` `FIREBASE_TOKEN` refresh token; Firebase docs recommend ADC instead.

References: [Firebase CLI authentication](https://firebase.google.com/docs/cli/), [Google Cloud workload federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines).

## 6. Owner/agent handoff checklist

- [ ] Cloudflare owner account/MFA set; Free/DO availability confirmed; account ID recorded (not a credential).
- [ ] Separate preview and production Firebase Spark projects created, Web apps registered; public SDK config recorded per environment.
- [ ] Google provider enabled, localhost and exact preview/production authorized domains set.
- [ ] Microsoft applications configured for personal accounts; exact Firebase helper redirect and client secrets stored **only** in Firebase console; expiry tracked.
- [ ] Preview Worker bootstrapped by owner when needed; narrow preview token stored only in protected GitHub environment. Production token not issued until release planning if possible.
- [ ] GitHub environments and branch protections checked against plan/visibility; owner records actual protection state and any manual alternatives.
- [ ] T01 and prerequisite gates pass; T17 reviewed workflow uses preview secret only after merge; smoke tests run and evidence recorded.
- [ ] No billing upgrades, production deployment, credential changes or provider admin calls authorized by a generic coding prompt.
- [ ] Token rotation/revocation and incident response: revoke compromised token in Cloudflare, replace GitHub secret, inspect deployments; rotate Microsoft secret in Entra/Firebase and retest; remove exposed credentials from logs/PRs.

## 7. Suggested instruction for a coding agent

> Implement only the next dependency-ready task in `TASKS.md`. Read `AGENTS.md` and the scoped task spec. Use a task branch, run local tests, and open a PR. Do not ask me to paste tokens into chat. Do not create or modify cloud accounts, OAuth providers, billing, GitHub secrets, or production resources. Request deployment through the reviewed GitHub workflow only when T17 authorizes it. Report checks as passed only with command output and visible evidence; otherwise state the blocker. Never merge or deploy production without explicit owner approval.

**Important:** Cloudflare API tokens are **deployment credentials**, not game-login credentials. Firebase Web API keys are **public configuration**, not passwords. Microsoft OAuth client secrets are **provider credentials**, not deploy tokens. Keep these categories separate.
