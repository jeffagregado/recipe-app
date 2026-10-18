# Recipe app

Recipe app is a personal recipe collection. Save a recipe with a cover photo, a photo per step, and a link to the video you cooked along to. Scale the servings and every amount follows. Tick off ingredients on your phone while you cook. Tag recipes with your own categories, mark favorites, and search and sort the list.

It runs at https://recapp.site.

## How the code is laid out

The repository is a pnpm and Turborepo monorepo with three workspaces.

- `apps/web` is the Next.js app. Vercel hosts it.
- `apps/api` is the NestJS API. It uses Drizzle on Postgres, Better Auth for sessions, and an S3-compatible bucket for photos. Render hosts it.
- `packages/contracts` holds the types and Zod schemas that both apps share. Turbo builds it before either app starts.

The Playwright tests live in `e2e`.

## Run it locally

You need Node 25 (see `.nvmrc`), pnpm 12 (pinned in `package.json`), a Postgres database, and an S3-compatible bucket.

1. From the repository root, run `pnpm install`.
2. Copy `apps/api/.env.example` to `apps/api/.env` and fill in the values. [Variables in DEPLOY.md](DEPLOY.md#variables) describes each one.
3. Copy `apps/web/.env.example` to `apps/web/.env.local`. `RECIPE_API_URL` is the API address that the Next.js server calls. The example uses `http://localhost:3001`, the API's default `PORT`.
4. Apply the migrations with `pnpm --filter @recipe/api db:migrate`.
5. To load the sample recipes, run `pnpm --filter @recipe/api build` and then `pnpm --filter @recipe/api db:seed`.
6. Run `pnpm dev` and open http://localhost:3000.

`pnpm dev` starts the web app on port 3000 and the API on port 3001. It also rebuilds `packages/contracts` when you change it.

## Commands

Run these from the repository root.

| Command | What it does |
| --- | --- |
| `pnpm dev` | Starts both apps in watch mode. |
| `pnpm build` | Builds every workspace. |
| `pnpm exec turbo build --filter=@recipe/web` | Builds one app and the workspaces it depends on. Use `@recipe/api` for the API. |
| `pnpm lint` | Lints every workspace. |
| `pnpm typecheck` | Type-checks every workspace and the test files. |
| `pnpm test` | Runs the Vitest tests in every workspace. |
| `pnpm test:integration` | Runs the API integration tests. |
| `pnpm test:e2e` | Builds both apps and runs the Playwright tests. |

The integration and end-to-end tests run only against the maintainer's Neon dev branches. The harness refuses any other database. CI runs both suites on every pull request that is not a draft.

## How private data stays private

- Recipe and session reads belong to one account. The web server fetches them with `cache: 'no-store'` and forwards only the session cookie to the API, so no recipe data enters a shared cache.
- The browser reads through two same-origin paths, `/backend/recipes` and `/backend/auth/session`. `apps/web/proxy.ts` forwards them to the API.
- Logout and session expiry clear the browser's query cache.
- A failed read shows an error with a **Retry** button. The app has no offline copy.
- Login and sign-up live on `/auth/login`. The API accepts them only from the origins in `AUTH_TRUSTED_ORIGINS`, a comma-separated list. Production requires it. Elsewhere it falls back to `http://localhost:3000` and `http://127.0.0.1:3000`. When every listed origin uses HTTPS, the API always marks the session cookie Secure.

## Deploy

[DEPLOY.md](DEPLOY.md) covers the hosts, the variables, the rate-limit proxy settings, production migrations, and secret rotation.

## License

The code is under the MIT License. See [LICENSE](LICENSE), which also lists the photos it does not cover.
