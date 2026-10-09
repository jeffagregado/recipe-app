This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

This Turborepo runs Next.js in `apps/web` and NestJS in `apps/api`. From the repository root, install with `pnpm install`, copy `apps/web/.env.example` to `apps/web/.env.local`, then run `pnpm dev`. Turbo builds the shared contracts before starting either app and watches them during development.

The recipe list reads NestJS `GET /recipes` on the server. `RECIPE_API_URL` is the API base URL reachable from the Next.js server, defaults to `http://localhost:3001` in the example, and must be set to the deployed API URL in production. NestJS uses `PORT` (default `3001`); update the URL if that port changes. Fetch failures appear with a manual Retry button; there is no local-data substitute.

Session and recipe reads are private, session-gated and fetched with `cache: 'no-store'`; no recipe data enters a shared server cache. Server reads forward only the session cookie to NestJS. Browser pagination uses the narrow same-origin `/backend/recipes` GET transport, with owner-specific query keys; logout and session expiry clear private query state. Failed reads show an explicit error and Retry.

Use `pnpm build` for production builds and `pnpm typecheck` / `pnpm lint` for checks. A running API is not required during the web build; it is required when visiting `/recipes`. For an individual app build, run `pnpm exec turbo build --filter=@recipe/api` or `--filter=@recipe/web` so contracts are built first.

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
