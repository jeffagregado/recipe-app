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

The API's address is a Render custom domain: in Cloudflare, a CNAME `api` points to `recapp-api-9984.onrender.com` and is set to DNS only. Do not proxy it. A proxied record adds a hop in front of the API and breaks `TRUST_PROXY_HOPS=2`. The `onrender.com` address still answers.

The browser talks to the web app only. The web server calls the API server-to-server.

The API runs on Render, not Vercel, because Vercel functions refuse request bodies over 4.5 MB, and recipe photo uploads are larger than that.

## First deployment

Do these steps in order.

1. **Neon.** Use the `production` branch of the Neon project. Note its database URL, its storage endpoint (`https://<branch id>.storage.c-4.ap-southeast-1.aws.neon.tech`), and a storage access key pair. The bucket is `recipe-app-v2-production`.
2. **Migrations.** Apply the schema to the production database, as described in [Production migrations](#production-migrations).
3. **API on Render.** In the Render dashboard, select **New > Blueprint** and connect this repository. Render reads [`render.yaml`](render.yaml) from the repository root and creates `recapp-api` with every setting below. It then asks for each secret, the variables marked `sync: false`. Enter the values from [Variables](#variables), but leave `RECIPE_WEB_PROXY_SECRET` empty for now. Then add the custom domain `api.recapp.site` to the service and create its DNS-only CNAME in Cloudflare, as described above.
4. **Web on Vercel.** Import the repository as a Next.js project for `apps/web`, with Node 24.x and the function region `sin1`. Set the variables from [Variables](#variables), except `RECIPE_WEB_PROXY_SECRET`.
5. **Google sign-in.** In the Google Cloud OAuth client, register the `GOOGLE_REDIRECT_URI` from `render.yaml` as a redirect URI. It is on the web origin, not the API's own address.
6. **Proxy secret.** Set `RECIPE_WEB_PROXY_SECRET` as described in [Proxy secret](#proxy-secret).
7. **Check.** Open the health check path from [Render service settings](#render-service-settings) on the API URL, which answers `{"ok":true}`. Then sign in at the web URL.

`render.yaml` fixes the production storage endpoint, the URLs and the sender. For another Neon branch, other URLs or another sender, edit `AWS_ENDPOINT_URL_S3`, `BETTER_AUTH_URL`, `AUTH_TRUSTED_ORIGINS`, `GOOGLE_REDIRECT_URI` and `MAIL_FROM` there before step 3, and set `RECIPE_API_URL` on Vercel to match.

### Render service settings

`render.yaml` holds these settings. Keep the file and the dashboard the same.

- Runtime `node`, no root directory, auto-deploy from `master` on each commit, pull request previews off.
- Build command:

  ```
  npx --yes pnpm@12.9.1 install --frozen-lockfile --prod=false && npx --yes pnpm@12.9.1 exec turbo build --filter=@recipe/api
  ```

  - Do not use `corepack enable`. It fails on Render with `EROFS` on `/usr/bin/pnpm`, because `/usr/bin` is read-only.
  - Keep `--prod=false`. `NODE_ENV=production` would otherwise skip the devDependencies that the build needs.
- Start command: `node apps/api/dist/main.js`
- Health check path: `/api/auth/ok`

Render prompts for `sync: false` variables only when it first creates the service from the Blueprint. Later syncs leave them alone, so change a secret in the dashboard.

## Variables

Each app's `.env.example` describes its variables: [`apps/api/.env.example`](apps/api/.env.example) and [`apps/web/.env.example`](apps/web/.env.example).

### Render (API)

| Variable | Value |
| --- | --- |
| `NODE_VERSION` | set in `render.yaml` |
| `NODE_ENV` | set in `render.yaml` |
| `AWS_REGION` | set in `render.yaml` |
| `S3_BUCKET` | set in `render.yaml` |
| `AWS_ENDPOINT_URL_S3` | set in `render.yaml` |
| `BETTER_AUTH_URL` | set in `render.yaml` |
| `AUTH_TRUSTED_ORIGINS` | set in `render.yaml` |
| `GOOGLE_REDIRECT_URI` | set in `render.yaml` |
| `MAIL_FROM` | set in `render.yaml` |
| `TRUST_PROXY_HOPS` | set in `render.yaml` |
| `DATABASE_URL` | secret: the database URL of the Neon `production` branch |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | secret: the Neon storage access key pair |
| `BETTER_AUTH_SECRET` | secret: at least 32 characters, for example `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
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

### Client addresses and `TRUST_PROXY_HOPS`

Rate limits key on the browser's address, which the web app forwards to the API in `X-Forwarded-For`. `TRUST_PROXY_HOPS` is the number of hops in front of the API that are yours: Render's proxy plus the web app, so `2`. The client is the address that many entries from the right of `X-Forwarded-For`, and an entry that a client prepends is ignored. Unset or `0` trusts loopback only, for local development. A count higher than the real hops would let a caller choose its own address.

### Proxy secret

The API is publicly reachable, so a caller can skip the web app and arrive with one hop fewer. `RECIPE_WEB_PROXY_SECRET` closes that gap. The web server sends it in the `X-Recipe-Web-Secret` header on every API call. The API gives the web app's hop only to requests that carry it, and keys any other request one hop nearer, on the address that Render's proxy saw. Unset on the API keeps every request on `TRUST_PROXY_HOPS`. Set it only with `TRUST_PROXY_HOPS` of 2 or more.

To set it:

1. Generate one value of at least 32 characters with no whitespace, for example `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`.
2. Set it on **Vercel** (Production) and redeploy the web app. While the API has no secret, it ignores the header.
3. Set the same value on **Render** and redeploy the API.

The reverse order would key every user on Vercel's address until the web app is redeployed.

## Rotating secrets

Rotate a secret by setting the new value on the host, redeploying, and then revoking the old value at its source.

| Secret | Host | How |
| --- | --- | --- |
| `RECIPE_WEB_PROXY_SECRET` | Vercel and Render | Change it on both hosts together, in the same order as the first setup: Vercel first, then Render. Between the two redeploys, the web app sends the new value and the API expects the old one, so users share Vercel's address for rate limits. Redeploy the API right after the web app |
| `DATABASE_URL` | Render | Reset the role's password on the Neon `production` branch, set the new URL, and redeploy |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | Render | Create a new Neon storage access key, set both values, redeploy, then revoke the old key |
| `BETTER_AUTH_SECRET` | Render | Set a new value and redeploy. Every user is signed out |
| `RESEND_API_KEY` | Render | Create a new key in Resend, set it, redeploy, then delete the old key |
| `GOOGLE_CLIENT_SECRET` | Render | Add a new secret to the OAuth client in Google Cloud, set it, redeploy, then disable the old secret. `GOOGLE_CLIENT_ID` changes only with a new client |

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
