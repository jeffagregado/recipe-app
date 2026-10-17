# Live demo

The live demo (issue #112) runs from the `demo` branch with `DEMO_MODE` on. This file holds the demo's operating notes.

## Seeding the Demo template

Start demo copies the **Demo template** into each new Demo account: 15 Recipes, 8 Categories, 4 Favorites and 21 Photos (a cover on every recipe, and 6 step Photos). The content is in `apps/api/src/demo/template/`; the Photos there are already re-encoded to WebP by the API's own photo path (ADR 0002).

`pnpm --filter @recipe/api db:seed:demo` writes the template to the database in `DATABASE_URL` and uploads its Photos to the storage in `AWS_ENDPOINT_URL_S3`. Both must name the same Neon branch.

- It needs the full API configuration, as the API does. It reads `apps/api/.env`; values in the process environment take precedence.
- It is idempotent. A second run leaves one template with every Photo stored, and replaces any other template content, such as the small template the tests seed.
- It refuses, before any upload or write, when the template owner (`demo-template`) has another email or a Sign-in method, or when another account owns one of the template's recipe ids. Nothing changes in that case.
- It uploads the Photos first, under fixed keys (`recipes/demo-template-<recipe>/cover.webp` and `step.webp`), then replaces the rows in one transaction, then deletes the Photos of content it replaced. If it stops before the transaction commits, run it again.
- If a replaced Photo cannot be deleted, the command prints each key it could not delete and exits with an error. The template is already written, and a rerun no longer knows those keys, so delete each listed key from the branch's storage bucket by hand (the Neon console, or any S3 client with the API's storage settings).
- If the command stops between the commit and the deletes, the replaced Photos stay in storage unlisted. This is accepted: they only take space and nothing refers to them.
- A run takes a few seconds and uploads about 4.3 MB. A Start demo that runs while the transaction commits can fail and ask the visitor to try again, so reseed the live demo when it is quiet.

To seed the Neon `demo` branch, from a checkout of `demo`:

```
pnpm install
pnpm --filter @recipe/api build
pnpm --filter @recipe/api db:migrate
pnpm --filter @recipe/api db:seed:demo
```

The Neon `demo` branch is a root branch (see `DEPLOY.md`, "Live demo"), so it has its own bucket and its own storage access key pair, and the `dev` key does not work on it. Give the commands these values in the process environment, and do not write them to a file in the repository:

| Variable | Value |
| --- | --- |
| `DATABASE_URL` | the `demo` branch's database URL, from the Neon console: Connect, branch `demo` |
| `AWS_ENDPOINT_URL_S3` | `https://br-floral-sky-b3ub6ga4.storage.c-4.ap-southeast-1.aws.neon.tech` |
| `S3_BUCKET` | `recipe-app-v2-demo` |
| `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` | the storage access key pair created on the `demo` branch |

The other values the API configuration needs, such as `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` and `AWS_REGION`, come from `apps/api/.env`, or from the process environment in a checkout without one. Leave `DEMO_MODE` unset for the seed.

Run the seed again after changing the template content. Demo accounts that already exist keep the copy they started with.
