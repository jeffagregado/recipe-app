# Deploying

This guide records how production runs and how to set it up from nothing. The live settings are as of 2026-10-15.

## What runs where

| Part | Host | Name | URL |
| --- | --- | --- | --- |
| Web (`apps/web`, Next.js) | Vercel | project `recipe-app`, Node 24.x, region `sin1` | https://recapp.site |
| API (`apps/api`, NestJS) | Render | web service `recapp-api` (`srv-db7kvo2d0e5s73e8gh9g`), free plan, region `singapore` | https://api.recapp.site |
| Postgres and object storage | Neon | project `recipe-app-v2` (`round-term-82774312`), branch `production` (`br-sweet-hall-b3d1oqg9`) | |
| Mail | Resend | sending domain `mail.recapp.site` | |

The web app's old address, https://recapp-recipe-app.vercel.app, still serves it and stays in `AUTH_TRUSTED_ORIGINS` for now.

The API's address is a Render custom domain: in Cloudflare, a CNAME `api` points to `recapp-api-9984.onrender.com` and is set to DNS only. Do not proxy it: proxying through Cloudflare is untested and out of scope (#127). The `onrender.com` address still answers.

The browser talks to the web app only. The web server calls the API server-to-server.

The API runs on Render. Every request now fits Vercel's 4.5 MB request body limit: each photo is shrunk in the browser and uploaded on its own, and a recipe save is JSON that names its photos (ADR 0005). [Moving the API to Vercel](#moving-the-api-to-vercel) describes the move, which is under way (#127).

## First deployment

Do these steps in order.

1. **Neon.** Use the `production` branch of the Neon project. Note its database URL, its storage endpoint (`https://<branch id>.storage.c-4.ap-southeast-1.aws.neon.tech`), and a storage access key pair. The bucket is `recipe-app-v2-production`.
2. **Migrations.** Apply the schema to the production database, as described in [Production migrations](#production-migrations).
3. **API on Render.** In the Render dashboard, select **New > Blueprint** and connect this repository. Render reads [`render.yaml`](render.yaml) from the repository root and creates `recapp-api` with the settings in that file. It then asks for each secret, the variables marked `sync: false`. Enter the values from [Variables](#variables), but leave `RECIPE_WEB_PROXY_SECRET` empty for now. Then add the custom domain `api.recapp.site` to the service and create its DNS-only CNAME in Cloudflare, as described above.
4. **Web on Vercel.** Import the repository as a Next.js project for `apps/web`, with Node 24.x and the function region `sin1`. Set the variables from [Variables](#variables), except `RECIPE_WEB_PROXY_SECRET`.
5. **Google sign-in.** In the Google Cloud OAuth client, register the `GOOGLE_REDIRECT_URI` from `render.yaml` as a redirect URI. It is on the web origin, not the API's own address.
6. **Proxy secret.** Set `RECIPE_WEB_PROXY_SECRET` as described in [Proxy secret](#proxy-secret).
7. **Check.** Open `/api/auth/ok` on the API URL, which answers `{"ok":true}`. Then sign in at the web URL.

`render.yaml` fixes the production storage endpoint, the URLs and the sender. For another Neon branch, other URLs or another sender, edit `AWS_ENDPOINT_URL_S3`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `GOOGLE_REDIRECT_URI` and `MAIL_FROM` there before step 3, and set `RECIPE_API_URL` on Vercel to match.

### Render service settings

[`render.yaml`](render.yaml) holds the service settings, such as the build and start commands and the health check path. Keep the file and the dashboard the same.

Render prompts for `sync: false` variables only when it first creates the service from the Blueprint. Later syncs leave them alone, so change a secret in the dashboard.

## Variables

Each app's `.env.example` describes its variables: [`apps/api/.env.example`](apps/api/.env.example) and [`apps/web/.env.example`](apps/web/.env.example).

### Render (API)

These are the secrets to enter on Render. `render.yaml` sets every other API variable.

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | secret: the database URL of the Neon `production` branch |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | secret: the Neon storage access key pair |
| `BETTER_AUTH_SECRET` | secret: at least 32 characters. Generate it with the command in [Proxy secret](#proxy-secret) |
| `RESEND_API_KEY` | secret: the Resend API key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret: the Google OAuth client |
| `RECIPE_WEB_PROXY_SECRET` | secret: the same value as on Vercel |

### Vercel (web, Production environment)

| Variable | Value |
| --- | --- |
| `RECIPE_API_URL` | the API URL, the same value as `BETTER_AUTH_URL` in `render.yaml` |
| `RECIPE_STORAGE_HOST` | the bare host of the Neon `production` storage endpoint, without `https://` |
| `CONTACT_EMAIL` | `hello@recapp.site`, the address on the privacy and terms pages. Cloudflare Email Routing forwards it to the owner. Unset shows a placeholder that reaches nobody |
| `RECIPE_WEB_PROXY_SECRET` | secret: the same value as on Render. Never give it a `NEXT_PUBLIC_` name |
| `NEXT_PUBLIC_GA_ID` | the Google Analytics 4 measurement ID (`G-XXXXXXXXXX`). Production only: unset in Preview and locally, so no Google script loads there |

The build inlines `NEXT_PUBLIC_GA_ID`, and the build and the server both read `RECIPE_STORAGE_HOST`, so redeploy the web app after you change either.

### Client addresses

Rate limits key on the user's IP. The web app reads it from `X-Forwarded-For` on its own request, which Vercel overwrites with the one address that connected, and sends it to the API in `X-Recipe-Client-IP` next to `X-Recipe-Web-Secret` on every call. The API does not take the client IP from `X-Forwarded-For`: Vercel overwrites it in front of a function too, so it would name the web app, not the user.

The API trusts `X-Recipe-Client-IP` only on a request that carries the [proxy secret](#proxy-secret), and only when it holds one IP address. Any other request is keyed on the address that connected to the API. On Render that is Render's proxy, so every such caller shares one rate-limit bucket. Better Auth's own rate limit keys on the same address.

### Proxy secret

The API is publicly reachable, so only a request from the web server may name the user's IP. `RECIPE_WEB_PROXY_SECRET` proves where a request came from: the web server sends it in `X-Recipe-Web-Secret` on every API call. While the API has no secret, it ignores `X-Recipe-Client-IP` and keys every request on the connecting address, so all users share one rate-limit bucket.

To set it:

1. Generate one value of at least 32 characters with no whitespace, for example `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Set it on **Vercel** (Production) and redeploy the web app. While the API has no secret, it ignores the header.
3. Set the same value on **Render** and redeploy the API.

The reverse order would key every user on the connecting address until the web app is redeployed.

## Rotating secrets

Rotate a secret by setting the new value on the host, redeploying, and then revoking the old value at its source.

| Secret | Host | How |
| --- | --- | --- |
| `RECIPE_WEB_PROXY_SECRET` | Vercel and Render | Set it on Vercel first, then Render, as in [Proxy secret](#proxy-secret). Redeploy the API right after the web app. Until then the API expects the old value, so users share one rate-limit bucket on the connecting address |
| `DATABASE_URL` | Render | Reset the role's password on the Neon `production` branch, set the new URL, and redeploy |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Render | Create a new Neon storage access key, set both values, redeploy, then revoke the old key |
| `BETTER_AUTH_SECRET` | Render | Set a new value and redeploy. Every user is signed out |
| `RESEND_API_KEY` | Render | Create a new key in Resend, set it, redeploy, then delete the old key |
| `GOOGLE_CLIENT_SECRET` | Render | Add a new secret to the OAuth client in Google Cloud, set it, redeploy, then disable the old secret. `GOOGLE_CLIENT_ID` changes only with a new client |

## Moving the API to Vercel

The API moves to its own Vercel project, `recapp-api`, side by side with Render (#127, ADR 0005). Render keeps serving `api.recapp.site` until the cutover below.

### How the API runs on Vercel

- Vercel's NestJS support runs the whole API as one function, with Fluid compute. [`apps/api/vercel.json`](apps/api/vercel.json) holds the build settings, so the dashboard shows them as overridden:
  - install: `npx --yes pnpm@12.9.1 install --frozen-lockfile --prod=false`, from the repository root, for the whole workspace. pnpm runs through npx, as on Render, because Vercel uses its own pnpm when the install command is overridden, and that pnpm rejects `--prod=false`. `--prod=false` keeps the build tools, since `NODE_ENV` is `production` during the build.
  - build: `cd ../.. && npx --yes pnpm@12.9.1 exec turbo run build --filter=@recipe/api`, the same build as on Render.
  - output directory `dist`, so the function's entrypoint is the built `dist/main.js`.
  - region `sin1`.
  - Git deployments for `master` only. Every other branch, and so every pull request, gets no deployment.
- `dist/main.js` is the same bootstrap Render starts. On Vercel (`VERCEL=1`) it initialises the app and exports its request handler without listening; anywhere else it listens on `PORT`.
- sharp's Linux binary and libvips come from the Linux install on Vercel's build machine. sharp names libvips for Vercel's file tracer, so both ship in the function.
- Work that continues after a response runs under `waitUntil`, and the Postgres pool is registered with `attachDatabasePool`, so idle connections close before an instance pauses. Off Vercel both do nothing.
- Requests reach the app through Vercel's own local proxy, so the connecting address is not the user's. As on Render, only a request with the [proxy secret](#proxy-secret) is keyed on `X-Recipe-Client-IP`; every other caller shares one rate-limit bucket.

### Create the `recapp-api` project

In the Vercel dashboard, on the team that owns `recipe-app`:

1. **Add New > Project** and import `jeffagregado/recipe-app`.
2. **Project Name:** `recapp-api`.
3. **Root Directory:** `apps/api`. Keep **Include files outside the root directory in the Build Step** on: the install needs the root lockfile and `packages/contracts`.
4. **Framework Preset:** NestJS. Leave the build, install and output settings empty; `apps/api/vercel.json` sets them.
5. Add the variables from [Variables to copy](#variables-to-copy) to the **Production** environment before the first deploy, then **Deploy**.
6. **Settings > Build and Deployment > Node.js Version:** `24.x`. `.nvmrc` stays at 25 by decision (#127), so CI runs 25 and Vercel 24. Redeploy if the first build ran on another version.
7. **Settings > Functions:** confirm **Function Region** shows Singapore (`sin1`) and Fluid compute is on.
8. **Settings > Environments > Production:** branch tracking is `master`.
9. **Settings > Git:** previews need nothing more. `git.deploymentEnabled` in `vercel.json` already skips every branch except `master`.
10. **Settings > Environment Variables:** keep **Automatically expose System Environment Variables** on. The API reads `VERCEL` to know it runs on Vercel, and `attachDatabasePool` reads `VERCEL_URL` and `VERCEL_REGION`.
11. **Settings > Deployment Protection:** make sure the production URL answers without a Vercel login. Open `https://<production URL>/api/auth/ok`; it should answer `{"ok":true}`. If a Vercel login page appears, set Vercel Authentication to protect only preview deployments.

### Variables to copy

Copy each name from `render.yaml` and the Render dashboard to the `recapp-api` **Production** environment, with the same value. The owner enters the secret values; never paste them into the repository or a chat.

| Variable | From |
| --- | --- |
| `NODE_ENV` | `render.yaml` (`production`) |
| `AWS_REGION`, `S3_BUCKET`, `AWS_ENDPOINT_URL_S3` | `render.yaml` |
| `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `GOOGLE_REDIRECT_URI`, `MAIL_FROM` | `render.yaml` |
| `DATABASE_URL` | secret, Render dashboard |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | secret, Render dashboard |
| `BETTER_AUTH_SECRET` | secret, Render dashboard. The same value keeps every session valid across the move |
| `RESEND_API_KEY` | secret, Render dashboard |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | secret, Render dashboard |
| `RECIPE_WEB_PROXY_SECRET` | secret, Render dashboard. Must equal the web project's value |

Do not copy:

- `NODE_VERSION`: Render only. Vercel takes the Node version from the project setting.
- `PORT`: Vercel ignores it, and nothing listens there.
- `TRUST_PROXY_HOPS`: retired (#133). Delete it from the Render dashboard if it is still there.

The API reads these from the process environment; it needs no env file.

### Smoke checklist

Run it twice: on the production `*.vercel.app` URL (cutover step 1) and on `api.recapp.site` (step 2). The user journeys go through a web app whose `RECIPE_API_URL` names the address under test. Record each result in the pull request.

For the `*.vercel.app` run, only the production web origins are trusted and Google returns to `recapp.site`. A full run, Google included, therefore points the production web project's `RECIPE_API_URL` at the `*.vercel.app` URL and redeploys the web app. Users reach the new API until `RECIPE_API_URL` is set back to `https://api.recapp.site` and the web app is redeployed.

| Check | How | `*.vercel.app` | `api.recapp.site` |
| --- | --- | --- | --- |
| Deployment starts | The build log shows the install with `pnpm v12.9.1`, the Turborepo build and no sharp or libvips error; the first request's runtime log shows `Nest application successfully started` | | |
| Health | `GET /api/auth/ok` answers `{"ok":true}` | | |
| Password sign-in | Sign in with an existing Account and open the recipe list | | |
| Google sign-in | Sign in with Google | | |
| Sign-up mail | Sign up with a new address; the verification mail arrives and its link verifies the Account | | |
| Create a recipe with photos | Create a recipe with a cover and a step photo; both show after saving | | |
| Edit a recipe with photos | Replace one photo and remove another; the recipe shows the change | | |
| Upload and remove a Pending photo | Pick a photo in the form, then remove it before saving; no error | | |
| Rate limit keyed per user | From one network, request a password reset for an address with no Account 11 times; the 11th is refused as too many requests (the limit is 10 an hour per client address). From another network, such as a phone on mobile data, a reset request still goes through. If both are refused, every user shares one bucket: check `RECIPE_WEB_PROXY_SECRET` | | |
| Runtime errors | The project's Logs show no errors from the checks above | | |

### Cutover

Issue #135 carries this out.

1. **Smoke test on `*.vercel.app`.** Deploy `recapp-api` and run the [smoke checklist](#smoke-checklist) against production config while Render keeps serving `api.recapp.site`.
2. **Switch the domain.** Add `api.recapp.site` to `recapp-api` under **Settings > Domains**. In Cloudflare, point the `api` CNAME at the target the Vercel dashboard shows, still DNS only (not proxied). Run the smoke checklist again on `api.recapp.site`. `BETTER_AUTH_URL`, cookies, `AUTH_TRUSTED_ORIGINS` and the Google redirect need no change, because the address stays the same.
3. **Watch for a few days.** Check the project's runtime errors and logs, and the [CI watch items](docs/agents/ci.md#watch-items). Keep the Render service running.
4. **Retire Render.** Remove `render.yaml` from `master` and delete the Render service `recapp-api`. Then update this guide: the hosting table, the variables, the 4.5 MB note (point to ADR 0005), the Render cold-start limit, the client-address notes and this section.

The live demo API (`recapp-demo-api`) stays on Render until a later `master` → `demo` sync moves it.

### Rollback

During the watch period, point the Cloudflare `api` CNAME back at `recapp-api-9984.onrender.com` (DNS only). Render still runs the same `master`, so nothing else changes. Remove `api.recapp.site` from `recapp-api` once the record has switched back.

## Production migrations

Migrations do not run when the API starts. Run them yourself, before the API deploy that needs them. Merging to `master` deploys the API on Render, so migrate production before you merge.

From a checkout of the branch you are about to merge:

```
pnpm install
pnpm --filter @recipe/api db:migrate
```

Give the command the production database URL in `DATABASE_URL` in the process environment, which takes precedence over `apps/api/.env`. Do not write it to a file in the repository.

Write migrations that the running API can tolerate, because the old API still serves requests until the new deploy is live.

## Mail

Render's free plan blocks outbound SMTP, so mail goes through Resend's HTTP API. The sender is `MAIL_FROM` in `render.yaml`; its domain is verified in Resend.

## Known limits

- The free Render service sleeps after 15 minutes without requests, so the first request after that is slow.
- Preview deployments cannot sign in. Only the production web origins are in `AUTH_TRUSTED_ORIGINS`.
