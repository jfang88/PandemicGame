# Set up Firebase and Cloudflare for PandemicGame

Start with preview. You can create the accounts, Firebase project, and identity-provider registrations now. The first real Cloudflare deployment and provider checks use the reviewed T17 workflow. Set up production separately before the owner-controlled release.

| Resource | Preview example | Production example |
| --- | --- | --- |
| Firebase project and Web app | `pandemic-preview-<unique-suffix>` | `pandemic-production-<unique-suffix>` |
| Microsoft Entra app registration | PandemicGame Preview | PandemicGame Production |
| Cloudflare Worker name | `pandemicgame-preview` | `pandemicgame-production` |
| GitHub deployment environment | `preview` | `production` |

Project IDs and hostnames in this guide are examples. Save your actual non-secret IDs as you go. Keep the Microsoft client secret in Firebase Authentication and the Cloudflare deployment token in the appropriate GitHub environment secret. [Repository credential boundaries](AGENT_ACCESS.md)

## 1. Set up the Cloudflare account and choose the preview hostname

1. Create or sign in to an owner-controlled Cloudflare account. Verify the email address and enable MFA. From the account overview, copy its **Account ID**. You will use it as `CLOUDFLARE_ACCOUNT_ID`. [Cloudflare sign-up](https://dash.cloudflare.com/sign-up) · [Find the account ID](https://developers.cloudflare.com/fundamentals/account/find-account-and-zone-ids/)
2. Open **Workers & Pages** under the intended account. Use **Workers Free** for the initial setup. The application runs as a Worker with static assets and SQLite-backed Durable Objects. Workers Free supports this SQLite backend. [Workers dashboard setup](https://developers.cloudflare.com/workers/get-started/dashboard/) · [Durable Objects plans and limits](https://developers.cloudflare.com/durable-objects/platform/pricing/)
3. Choose or record the account's `workers.dev` subdomain if the dashboard offers it. Plan on a URL such as `https://pandemicgame-preview.<account-subdomain>.workers.dev`. If Cloudflare asks you to finish this during Worker creation, return to this step at T17. Copy the exact URL from the Worker dashboard after the first deployment. Use a stable preview hostname so invite links and Firebase authorization keep working across builds. [Cloudflare workers.dev routes](https://developers.cloudflare.com/workers/configuration/routing/workers-dev/)
4. Leave the game Worker and its `GAME_ROOMS` binding to the first reviewed T17 deployment. Wrangler registers the `GameRoom` SQLite class using `new_sqlite_classes`. Cloudflare creates an individual room's storage when the app uses it. Preview and production get separate Workers and Durable Object namespaces. [Repository Wrangler template](../config/wrangler.example.jsonc) · [Durable Object class migrations](https://developers.cloudflare.com/durable-objects/reference/durable-objects-migrations/)

## 2. Create the Firebase project and enable Google

1. Open **Firebase Console → Create a project**. Choose a globally unique preview project ID and keep the project on **Spark**. Google Analytics is optional. This project uses Firebase Authentication for identity. Room and game data live in Cloudflare. [Firebase Console](https://console.firebase.google.com/) · [Firebase plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans)
2. In **Project overview**, choose the Web icon `</>` or **Add app → Web**. Give it a nickname such as **PandemicGame Preview Web**, then register the app. Copy `apiKey`, `authDomain`, `projectId`, and `appId` from the SDK configuration. These are public browser configuration. Keep Firebase's `authDomain`, usually `<project-id>.firebaseapp.com`. [Register a Firebase Web app](https://firebase.google.com/docs/web/setup)
3. Open **Authentication → Get started → Sign-in method**. Select **Google**, enable it, choose the required project support email, and save. If your Google consent configuration limits access to test users, add the intended preview testers there. [Enable Google sign-in](https://firebase.google.com/docs/auth/web/google-signin)
4. Open **Authentication → Settings → Authorized domains → Add domain**. Add the exact Cloudflare hostname for this Firebase project, with no scheme, port, or path. For preview-only local OAuth testing, also add `localhost` explicitly. New Firebase projects may start without it. Use only the production hostname in the production project's authorized domains for this app. [Firebase authorized domains](https://firebase.google.com/docs/auth/faq-and-troubleshooting#limit_your_authorized_authentication_domains)

## 3. Enable Microsoft sign-in for personal Hotmail and Outlook accounts

1. In the Firebase project's **Authentication → Sign-in method**, open **Microsoft**. Find the OAuth callback URL shown in the provider panel. With the default Firebase auth domain, it has this shape:

   ```text
   https://<actual-preview-project-id>.firebaseapp.com/__/auth/handler
   ```

   Use the exact URL Firebase shows. This is the Firebase OAuth handler. The Cloudflare hostname belongs in Firebase's authorized domains. [Firebase Microsoft provider setup](https://firebase.google.com/docs/auth/web/microsoft-oauth)
2. In the **Microsoft Entra admin center**, select the tenant where you have permission to register applications. Open **App registrations → New registration**. Give it an environment-specific name. For supported account types, choose the option that includes both organizational directories and **personal Microsoft accounts**. Select **Web** for the redirect URI and paste the Firebase callback. If you already registered the app, add the Web redirect under **Authentication**. [Register an Entra app](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app) · [Microsoft redirect URI rules](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)
3. From the registration's **Overview**, copy the **Application (client) ID**. In **Certificates & secrets → Client secrets → New client secret**, give the credential an expiry and add it. Copy the **Value** shown immediately after creation. Track the expiry in your password manager or reminders. [Manage Entra credentials](https://learn.microsoft.com/en-us/entra/identity-platform/how-to-add-credentials)
4. Back in Firebase's Microsoft provider panel, enter the Application (client) ID and the client secret Value, enable the provider, and save. Repeat with a separate app registration and callback when setting up production. The application uses the Firebase SDK's Microsoft popup without requesting mail or contact scopes. [Firebase Microsoft sign-in](https://firebase.google.com/docs/auth/web/microsoft-oauth)
5. Before the secret expires, create a replacement in the same Entra app, update Firebase, and verify the popup with a personal Microsoft account. Retire the previous secret after the replacement works. If you cannot create the registration, ask the Entra tenant admin for permission to register applications in that tenant. [Entra app registration prerequisites](https://learn.microsoft.com/en-us/entra/identity-platform/quickstart-register-app)

## 4. Put each value in the right place

| Name | Value | Where it goes |
| --- | --- | --- |
| `VITE_FIREBASE_API_KEY` | Firebase Web app `apiKey` | Web build environment |
| `VITE_FIREBASE_AUTH_DOMAIN` | Firebase Web app `authDomain` | Web build environment |
| `VITE_FIREBASE_PROJECT_ID` | Firebase Web app `projectId` | Web build environment |
| `VITE_FIREBASE_APP_ID` | Firebase Web app `appId` | Web build environment |
| `FIREBASE_PROJECT_ID` | Same project ID as the corresponding Web build | Worker runtime variable |
| `APP_ORIGINS` | Exact game origin, such as `https://pandemicgame-preview.<account-subdomain>.workers.dev`, without a trailing slash | Worker runtime variable for socket tickets and upgrades |
| `CLOUDFLARE_ACCOUNT_ID` | Cloudflare account ID | Deployment environment variable |
| `CLOUDFLARE_API_TOKEN` | Environment-specific Cloudflare deployment token | GitHub deployment environment secret |
| Microsoft client secret **Value** | From the corresponding Entra registration | Firebase Microsoft provider settings |

The same game address appears in two formats. Firebase **Authorized domains** takes the bare hostname. The Worker's `APP_ORIGINS` takes the full origin with scheme and any port. The browser's Firebase `authDomain` is the Firebase helper host. A Firebase project ID mismatch between the browser and Worker leads to a successful popup followed by API authentication failure. [Public Web config template](../config/firebase.env.example) · [Repository protocol](PROTOCOL.md)

### Optional local sign-in check

1. Copy [the public Firebase template](../config/firebase.env.example) to the ignored `apps/web/.env.local` file and fill it with the preview Web app's four values.
2. Add these two public local overrides to the ignored `apps/worker/.dev.vars` beside `wrangler.local.jsonc`:

   ```dotenv
   FIREBASE_PROJECT_ID=your-actual-preview-project-id
   APP_ORIGINS=http://localhost:5173
   ```

3. From the repository root, run `npm ci` and `npm run dev`. Open `http://localhost:5173/login` in Chromium. Use the same hostname in the browser, Firebase authorized domains, and `APP_ORIGINS`. Check Google and Microsoft in separate browser profiles or sign out between tests. Use the regular local dev entry for real Firebase authentication. [Local development](LOCAL_DEV.md) · [Wrangler local variables](https://developers.cloudflare.com/workers/configuration/secrets/#local-development-with-secrets)

## 5. Prepare deployment access when T17 is ready

1. Follow the reviewed T17 runbook for the first preview deployment. Creating a new Worker requires product-level **Workers Admin** or equivalent owner access. Use owner-controlled access for this one-time bootstrap. For subsequent deployments, Cloudflare supports **Editor** scoped to the existing preview Worker. A legacy account-level **Workers Scripts Edit** grant is broader than a per-Worker role. [Cloudflare Workers roles](https://developers.cloudflare.com/workers/authorization/workers/#wrangler)
2. In Cloudflare **Manage Account → API Tokens → Create Token**, create an account-owned token for preview. Choose the narrowest role and resource scope shown in the summary and set an expiry. Keep the preview token scoped to the preview Worker when the account supports it. For the initial `workers.dev` deployment, omit custom route or DNS privileges. Keep a separate production token for the later release. [Cloudflare API token setup](https://developers.cloudflare.com/fundamentals/api/get-started/create-token/)
3. In GitHub, open **PandemicGame → Settings → Environments**. Create `preview` and, when needed, `production` if the repository's plan and visibility support them. Restrict deployment to reviewed `main` and configure available protections. Under each environment, store the Cloudflare token as an **environment secret** and record the matching non-secret values as **environment variables**. The reviewed workflow must pass the four `VITE_` variables to the build and the two runtime variables to Wrangler. [GitHub environment setup](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments) · [Cloudflare GitHub Actions deployment](https://developers.cloudflare.com/workers/ci-cd/external-cicd/github-actions/)
4. If the repository cannot use environment secrets or approval gates, keep the deployment credential with the owner and perform that deployment using the reviewed manual procedure. PR checks run without cloud credentials. The production release requires its own explicit owner action. [Owner and agent permissions](AGENT_ACCESS.md)

## 6. Verify preview before moving to production

- Open `https://<preview-worker-host>/api/health` and check that it returns JSON with `ok`, `buildSha`, and `protocolVersion`. A missing route under `/api/` should return a JSON 404. [Cloudflare runbook](CLOUDFLARE.md)
- In isolated browser profiles, sign in with Google and with a personal Hotmail or Outlook account. Create a room, join through an invite, refresh, and verify the same seat reconnects. Repeat on the actual preview origin with desktop Chromium and tablet Safari/WebKit. Record sanitized results in the staging evidence sheet. [T17 provider evidence sheet](evidence/T11.md#real-provider-staging-evidence-for-t17)
- If Firebase reports an unauthorized domain, compare the exact browser hostname with the Firebase project's authorized domains. If Microsoft reports `AADSTS50011`, compare the full callback URL in Firebase with the Entra registration's **Web** redirect URI. If room requests return 401 after login, check the browser and Worker project IDs. If the lobby loads but realtime fails, check the full browser origin against `APP_ORIGINS`. [Firebase troubleshooting](https://firebase.google.com/docs/auth/faq-and-troubleshooting) · [Microsoft redirect troubleshooting](https://learn.microsoft.com/en-us/entra/identity-platform/reply-url)

For the handoff, record the preview Firebase project ID, Worker name and hostname, Cloudflare account ID, and whether the GitHub preview environment is ready. These identifiers are enough to connect the reviewed workflow to the resources. Keep token and client secret values in their designated stores.
