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
- **Empty custom `0000_init` migration**: validates the whole migration pipeline without inventing tables before their phase.
- **Migrations on startup with the `drizzle-orm` migrator** (not drizzle-kit, which is a dev dependency): dedicated single connection, process exits on failure so the container is restarted instead of serving without a schema.
- **`drizzle.config.ts` loads `.env` with `process.loadEnvFile`** (Node built-in): no dotenv dependency.
- **`apps/server/drizzle/` excluded from Prettier**: generated files, reformatting them would break the hook after each `db:generate`.
