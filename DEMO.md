# Live demo

The live demo (issue #112) runs from the `demo` branch with `DEMO_MODE` on. This file holds the demo's operating notes.

## Seeding the Demo template

Start demo copies the **Demo template** into each new Demo account: 15 Recipes, 8 Categories, 4 Favorites and 21 Photos (a cover on every recipe, and 6 step Photos). The content is in `apps/api/src/demo/template/`; the Photos there are already re-encoded to WebP by the API's own photo path (ADR 0002).

`pnpm --filter @recipe/api db:seed:demo` writes the template to the database in `DATABASE_URL` and uploads its Photos to the storage in `AWS_ENDPOINT_URL_S3`. Both must name the same Neon branch.

- It needs the full API configuration, as the API does. It reads `apps/api/.env`; values in the process environment take precedence.
- It is idempotent. A second run leaves one template with every Photo stored, and replaces any other template content, such as the small template the tests seed.
- It refuses, before any upload or write, when the template owner (`demo-template`) has another email or a Sign-in method, or when another account owns one of the template's recipe ids. Nothing changes in that case.
- It uploads the Photos first, under fixed keys (`recipes/demo-template-<recipe>/cover.webp` and `step.webp`), then replaces the rows in one transaction, then deletes the Photos of content it replaced. If it stops before the transaction commits, run it again.
- If a replaced Photo cannot be deleted, the command says how many and exits with an error. The template is already written; the leftover object only takes storage space, and a rerun does not find it again.
- A run takes a few seconds and uploads about 4.3 MB. A Start demo that runs while the transaction commits can fail and ask the visitor to try again, so reseed the live demo when it is quiet.

To seed the Neon `demo` branch, from a checkout of `demo`:

```
pnpm install
pnpm --filter @recipe/api build
pnpm --filter @recipe/api db:migrate
pnpm --filter @recipe/api db:seed:demo
```

Give the commands the `demo` branch's `DATABASE_URL` and `AWS_ENDPOINT_URL_S3` in the process environment. Do not write them to a file in the repository. Read the storage endpoint with `pnpm exec neon --no-analytics env pull --project-id round-term-82774312 --branch demo --file <scratch file outside the repo> -e AWS_ENDPOINT_URL_S3`.

Run the seed again after changing the template content. Demo accounts that already exist keep the copy they started with.
