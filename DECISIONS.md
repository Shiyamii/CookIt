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
- **All `apps/web` packages are `devDependencies`**: the SPA is fully bundled by Vite, so the production image (`bun install --production`) ships none of them (React, shadcn CLI, Tailwind…).
- **shadcn/ui, `radix-nova` style (Nova preset), theme from tweakcn**: colors, radius and shadows in `apps/web/src/index.css`; components in `src/components/ui/` stay as generated (lint rule `react-refresh/only-export-components` off there).
- **`cn` package** (by shadcn) instead of `clsx` + `tailwind-merge`: what the current shadcn CLI installs.
- **Self-hosted font** (`@fontsource-variable/plus-jakarta-sans`): no Google Fonts request, simpler CSP, works offline. Serif/mono fonts of the theme fall back to system fonts until needed.
- **Theme (light / dark / system) without a React provider**: small store in `src/lib/theme.ts` (`useSyncExternalStore`), saved in `localStorage`.
- **i18n resources as typed TS objects** (`src/locales/en.ts` is the reference type, `fr.ts` must match): missing keys are compile errors. Language detection: saved choice (`localStorage`), then browser language; saving to the user profile comes with accounts.
- **React Router in data mode** (`createBrowserRouter`), `RouterProvider` from `react-router/dom`.
- **Empty custom `0000_init` migration**: validates the whole migration pipeline without inventing tables before their phase.
- **Migrations on startup with the `drizzle-orm` migrator** (not drizzle-kit, which is a dev dependency): dedicated single connection, process exits on failure so the container is restarted instead of serving without a schema.
- **`drizzle.config.ts` loads `.env` with `process.loadEnvFile`** (Node built-in): no dotenv dependency.
- **`apps/server/drizzle/` excluded from Prettier**: generated files, reformatting them would break the hook after each `db:generate`.
- **Playwright at the repo root** (`playwright.config.ts`, tests in `e2e/`, root dev dependency): not a workspace, so the Dockerfile manifests stay unchanged; `e2e/tsconfig.json` is type-checked by `bun run typecheck`.
- **E2E files named `*.e2e.ts`**: `bun test` would otherwise pick up `*.spec.ts` files.
- **Chromium only, two projects (Pixel 7 mobile + desktop)**: mobile first without the cost of installing WebKit/Firefox; widen later if a browser-specific bug shows up.
- **E2E not in the pre-commit hook**: needs the Docker image running and takes seconds; CI runs them on every push.
- **semantic-release** (over release-please): tags and GitHub releases straight from branch pushes, native prerelease branches for `-rc.N`; uses the Conventional Commits already in use.
- **semantic-release run with a pinned `npx` in CI** (not a project dependency): keeps ~300 packages out of `bun.lock`; only GitHub release notes, no npm publish, no changelog commit back to the branch.
- **`v0.0.0` baseline tag on the first commit**: semantic-release would otherwise start at `1.0.0`.
- **Release = `next` / `release` branches, never `main`**: publishing is a deliberate merge, not a side effect of every push.
- **The release workflow reuses `ci.yml` (`workflow_call`)**: a version is only tagged after the same checks, image build and Playwright run as regular CI. The published image is rebuilt from the same commit (with `APP_VERSION`), using the GitHub Actions build cache.
- **`APP_VERSION` build arg exposed by `/api/v1/meta`**: shows which version is deployed.
- **`package.json` versions stay `0.0.0-development`** (no `@semantic-release/npm` + `@semantic-release/git` commit back): a release commit on `next` / `release` would make them diverge from `main` and break `git push origin main:next`; the version lives in the Git tag and the image (`APP_VERSION`).
- **`release` branch created at the `v0.0.0` commit**: semantic-release requires an existing stable branch even to publish release candidates from `next`.
