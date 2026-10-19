# Decisions

Decisions not covered by `plan-site-recettes.md`, one line of justification each.

- **Node 24 LTS** (`node:24-slim`): current active LTS.
- **TypeScript pinned to 6.0**: typescript-eslint does not support TypeScript 7 yet (peer range `<6.1.0`).
- **Bun hoisted linker** (`bunfig.toml`): a single root `node_modules` that Node resolves the same way in dev and in the image.
- **Server bundled with `Bun.build --target=node`** (`apps/server/scripts/build.ts`): bundles `@cookit/*` workspace packages (shipped as TypeScript sources), keeps npm dependencies external; no extra build dependency.
- **Server dev with `tsx watch`**: dev runs on Node, like production.
- **Shared package exports TypeScript sources** (`./src/index.ts`): consumed directly by Vite, tsx and the server bundler, no separate build step.
- **ESLint `no-restricted-globals` / `no-restricted-imports` on `Bun`**: enforces "no Bun APIs in shipped code" (tests and `scripts/` excluded).
- **Docker image smoke test in CI** (build, run with Postgres, curl `/healthz`, API and SPA fallback): checks the real Node image, until Playwright tests exist.
- **Drizzle migrations deferred**: no tables yet; the migration-on-startup flow will be added with the first schema.
