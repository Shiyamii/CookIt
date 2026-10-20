# CLAUDE.md

Guidance for Claude Code working in this repository. The full functional spec (in French) is `plan-site-recettes.md`. It is the source of truth; this file summarizes the structure, tooling and working rules.

## Project

**CookIt** is a self-hosted recipe web app (deployed on Coolify): invite-only accounts, private/unlisted/public recipes, markdown import/export with a custom syntax for timers and quantities, serving scaling, a multi-recipe cooking mode with server-scheduled Web Push timers, installable PWA, French/English UI.

## Working rules

- Work **phase by phase** (see "Phases" below), **one commit per phase**, with the tests listed for that phase passing. Do not anticipate later phases.
- **Ask before deviating** from the plan: changing the stack, the data model, or the markdown syntax.
- **Ask before adding a heavy dependency or an extra service.** The goal is a simple deployment: one image + Postgres.
- Record any decision not covered by the plan (library choice, design trade-off) in `DECISIONS.md`, with a one-line justification.
- Keep the README short and up to date at the end of each phase.

## Stack (imposed)

| Area             | Tool                                                                                                                                                                                                                                               |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Tooling          | **Bun**: package manager, workspaces, scripts, build, unit tests (`bun test`). **Not the production runtime.**                                                                                                                                     |
| Runtime          | **Node.js LTS**                                                                                                                                                                                                                                    |
| Frontend         | React + TypeScript **SPA**, Vite, React Router, TanStack Query                                                                                                                                                                                     |
| UI               | shadcn/ui (Radix) + Tailwind CSS, `lucide-react` icons, mobile first                                                                                                                                                                               |
| Backend          | **Hono** on Node (`@hono/node-server`), TypeScript, **Zod** for input validation                                                                                                                                                                   |
| Database         | **PostgreSQL** (separate Coolify container). No SQLite, no state in files.                                                                                                                                                                         |
| ORM / migrations | **Drizzle ORM** + drizzle-kit (Postgres driver `postgres` or `pg`)                                                                                                                                                                                 |
| Auth             | **Better Auth** (Drizzle adapter, Hono integration), plugins `twoFactor` (TOTP + backup codes) and `passkey` (WebAuthn); cookie sessions (httpOnly, secure, sameSite=lax); argon2id via `@node-rs/argon2` (fallback: Better Auth's default scrypt) |
| Push             | `web-push` + VAPID keys, service worker                                                                                                                                                                                                            |
| PWA              | `vite-plugin-pwa` (Workbox)                                                                                                                                                                                                                        |
| Markdown         | `unified` / `remark` with custom parsing, **raw HTML forbidden**                                                                                                                                                                                   |
| i18n             | `react-i18next`, languages `fr` and `en`                                                                                                                                                                                                           |
| Editor           | CodeMirror 6 (markdown editor)                                                                                                                                                                                                                     |
| Tests            | `bun test` for pure logic; **Playwright** end-to-end against the built image running under Node                                                                                                                                                    |
| Code quality     | **Prettier** (formatting), **ESLint** (flat config, TypeScript + React rules), **Husky** pre-commit hook running Prettier, ESLint and the unit tests                                                                                               |
| Container        | Single multi-stage Dockerfile: build with `oven/bun`, final image `node:<LTS>-slim` (Debian/glibc, **not Alpine**)                                                                                                                                 |

### Bun vs Node — critical

- **Never use `Bun.*` APIs** in application code (`apps/server`, `apps/web`, `packages/shared`). All shipped code must run under Node. `Bun.*` is only allowed in tooling scripts that are not shipped in the image.
- Unit tests stay on pure, runtime-independent logic. Anything touching the server, DB or notifications is covered by Playwright against the real image.
- `bun.lock` is the single lockfile and is committed. The Dockerfile uses `bun install --frozen-lockfile`.
- Verify early that `drizzle-kit generate/migrate`, `vite build` and running the server build with `tsx`/Node all work from a Bun workspace. Note workarounds in `DECISIONS.md`.

### Code quality

- Prettier and ESLint are configured once at the repo root and apply to all workspaces.
- A **Husky pre-commit hook** runs Prettier (check), ESLint and `bun test`. A commit must not go through with formatting errors, lint errors or failing unit tests. Never bypass it with `--no-verify`.
- Husky is installed through the root `prepare` script, so `bun install` sets up the hook.

## Repository structure

Plain **Bun workspaces monorepo, no Turborepo**:

```
/apps/web          React SPA (Vite)
/apps/server       Hono API + notification scheduler + Drizzle migrations
/packages/shared   Types, shared Zod schemas, markdown parser / serializer / scaling,
                   paste-splitting & duration detection, AI prompt generators
```

- `packages/shared` is used by **both** front (preview, cooking mode, scaling) and back (import, validation).
- Same origin for SPA and API (Hono serves both): **no CORS**. REST JSON API under `/api/v1`. Hono serves `/api/*`, then static files, with `index.html` fallback for SPA routes.
- `/healthz` checks DB access. Drizzle migrations run automatically on startup, before listening.
- The notification scheduler lives in `apps/server` and starts with Hono: **one process, no separate worker**.

## Frontend conventions (`apps/web`)

- Path alias `@/` → `apps/web/src`.
- UI components: add them with `bunx shadcn@latest add <component>` (run in `apps/web`). Files in `src/components/ui/` are generated: do not hand-edit them, wrap or compose instead.
- Theme: CSS variables in `src/index.css` (from tweakcn). Use the theme tokens (`bg-background`, `text-primary`, `text-muted-foreground`…), never hard-coded colors.
- Every user-visible string goes through `react-i18next` (`t('…')`). Add keys to `src/locales/en.ts` (reference type) and `src/locales/fr.ts`.
- Server state through TanStack Query, API calls through `src/lib/api.ts`. Pages in `src/pages/`, routes in `src/App.tsx`.
- Mobile first: design for ~390px wide first, large touch targets, respect safe-area insets.
- All web packages are `devDependencies` (everything is bundled by Vite).

## Data model essentials

- Better Auth tables (`user`, `session`, `account`, `verification`, `twoFactor`, `passkey`) are generated by the Better Auth CLI and then integrated into **Drizzle migrations** (never use Better Auth's own `migrate`). Extra user fields: `username` (unique), `role` (`admin`|`user`), `locale` (`fr`|`en`), `disabled_at`.
- Other tables: `invites`, `recipes`, `recipe_translations`, `tag_categories`, `tags`, `recipe_tags`, `cook_sessions`, `timers`, `push_subscriptions` (see spec §3).
- Recipe "part 1" (title, description, servings, source) is stored in **real columns** (source of truth); parts 2 and 3 (ingredients, steps) in `body_markdown`. The full markdown document is composed on the fly only for export, the markdown editor and AI prompts.
- Tag/category labels are a JSONB `{ lang: label }` object validated by a shared Zod schema. No translation tables.
- **Never store a decreasing remaining time.** A timer is an absolute `ends_at`; remaining time is computed at display (with server/client clock skew correction).

## Markdown recipe format

Three parts separated by a line of dashes only (3+), **with a blank line before and after**: (1) presentation, (2) ingredients, (3) steps. No YAML frontmatter.

- Parts are identified by **position**, not heading. A leading `## ...` heading is tolerated and ignored.
- Part 1: `# Title` (required), quote/paragraphs = description, then `key: value` lines: `portions`/`servings` (required int), `source`, `format`, `tags` (exchange only). FR and EN keys accepted; unknown keys preserved in `extra_meta`.
- Parts 2/3: optional `### Group` headings; parts 2 and 3 may be empty (warning only).
- Timer: `[10 min](timer:10m "label")` — durations `10m`, `1h30m`, `45s`. Timer durations are **never scaled**.
- Inline scaled quantity: `[2 tbsp](q:)`.
- Unparsable lines are kept as raw text / free blocks — **never lose content**.
- A canonical serializer must make `parse → serialize → parse` stable (tested on many examples).
- `tags:` line appears only in export/import, **never in the markdown editor**. Tags are list values (never free text), always go through a "Validate tags" step on import, and are never created by an import.
- Translations of a recipe must share the same structure (groups, ingredient/step counts, timer durations); the server warns on mismatch.

## Security checklist

argon2id; httpOnly/secure/sameSite cookies; Hono `csrf` middleware + `Origin` check on state-changing requests; DB-backed rate limiting on login/signup/reset; tokens ≥128 bits, invites & resets stored hashed; server-side authorization on every route; sanitized markdown output, no `javascript:` links; **SSRF protection** on URL import (block localhost, RFC1918, local IPv6, redirects; check after DNS resolution; timeout; size limit); strict CSP compatible with the service worker; no sensitive data in logs. Validate **every** API input with a shared Zod schema.

## Phases

1. **Foundation** — monorepo, Hono + Drizzle + Postgres, React + Vite SPA, `docker-compose.dev.yml`, single-image Dockerfile, `/healthz`, i18n, mobile-first layout, Prettier + ESLint + Husky pre-commit hook. _`docker compose up` serves API + SPA with migrations applied._
   Order: Drizzle → front stack (Tailwind, shadcn/ui, Router, TanStack Query, i18n, layout) → Playwright smoke test → **v0.1 release**: image `shiyamii/cookit` (amd64) pushed to Docker Hub only from a version tag or a release branch, with automated versioning including release candidates (semantic-release, see "Releases" below).
2. **Markdown parser + scaling** (pure module, no UI) with canonical serializer and round-trip tests.
3. **Accounts & invitations** — Better Auth, admin bootstrap, invites, admin pages, rate limiting.
   3b. **2FA & passkeys.**
4. **Recipes** — CRUD, visual + markdown editors (lossless switch), visibilities, public gallery, "add to my library", search.
   4b. **Categories & tags.**
5. **Creation & import/export** — quick create, wizard, markdown import, `.md`/zip export, URL import (JSON-LD) with SSRF protection.
   5b. **AI prompts** — import and translation prompts generated from code.
6. **Single-recipe cooking mode.**
7. **Multi-recipe sessions.**
8. **Web Push** — service worker, subscriptions, server scheduler (`FOR UPDATE SKIP LOCKED`), dead subscription cleanup, iOS help page.
9. **PWA & polish.**
10. **Deployment & docs** — Coolify README, Playwright critical path, security review.
11. **Optional** — SSE sync, backward planning, parallel tracks, Cooklang import, Capacitor Android, built-in AI.

## Commands

Keep this section in sync with the root `package.json` scripts.

```sh
bun install                                        # install all workspaces (+ Husky hook)
docker compose -f docker-compose.dev.yml up -d db  # Postgres only, for local dev
bun run dev                                        # server (tsx watch, :3000) + web (Vite, proxies /api)
docker compose -f docker-compose.dev.yml up --build  # full stack from the production image
bun test                                           # unit tests (pure logic)
bun run typecheck                                  # tsc in every workspace
bun run lint                                       # ESLint
bun run format                                     # Prettier (write); format:check to verify
bun run build                                      # build web, then bundle server for Node
bun run start                                      # run the built server under Node
```

```sh
bun run db:generate   # after editing apps/server/src/db/schema.ts: create a migration in apps/server/drizzle/
bun run db:migrate    # apply migrations manually (the server also applies them on startup)
```

Migrations live in `apps/server/drizzle/` (committed, generated: never edit an applied migration, never format it). The server applies pending migrations at startup before listening and exits if that fails.

```sh
docker compose -f docker-compose.dev.yml up -d --build  # e2e tests need the real image running
bun run test:e2e                                        # Playwright (Chromium, mobile + desktop)
```

End-to-end tests live in `e2e/` and are named `*.e2e.ts` (so `bun test` ignores them). They target `E2E_BASE_URL` (default `http://localhost:3000`), i.e. the production image, never the Vite dev server. Prefer role-based locators (`getByRole`) and `data-testid` only when there is no accessible name. They are not run by the pre-commit hook (too slow); CI runs them.

CI (`.github/workflows/ci.yml`) runs format check, lint, typecheck, unit tests and build, then builds the Docker image, starts it against Postgres, checks migrations were applied and runs the Playwright suite against it.

## Releases

- Versions come from **semantic-release** (`.releaserc.json`, run with a pinned `npx` in CI only) reading Conventional Commits: `feat:` → minor, `fix:`/`perf:` → patch, `BREAKING CHANGE:` → major; `chore:`, `docs:`, `test:`, `ci:`, `refactor:` don't release. **Always write commit messages in this format.**
- `main`: development, CI only, never publishes.
- `next`: push → release candidate `vX.Y.Z-rc.N` → image `shiyamii/cookit:X.Y.Z-rc.N`.
- `release`: push → stable `vX.Y.Z` → images `X.Y.Z`, `X.Y`, `latest` (amd64).
- `.github/workflows/release.yml`: reuses `ci.yml` (checks + image + Playwright), then semantic-release creates the tag and GitHub release, then the image is built with `APP_VERSION` and pushed to Docker Hub. Nothing is tagged or published if CI fails.
- The released version comes from semantic-release itself (`@semantic-release/exec` writes it to `$GITHUB_OUTPUT`), never from guessing tags: an RC promoted to `release` carries two tags on the same commit.
- If a publish fails after the tag was created: Actions → Release → **Run workflow** with the existing version (e.g. `0.1.0`) rebuilds and pushes that tag's image.
- The running version is exposed by `GET /api/v1/meta` (`version`, `dev` for local builds).
- Never create version tags by hand; `v0.0.0` on the first commit is the baseline so the first release is `0.1.0`.
- The `release` branch must always exist on GitHub, even before the first stable release: semantic-release refuses to run (`ERELEASEBRANCHES`) without at least one stable release branch. It was created at the `v0.0.0` commit.
- `package.json` versions stay `0.0.0-development`: the Git tag is the only source of truth, no release commit is pushed back (so `next` / `release` never diverge from `main`).

## Deployment files

- `docker-compose.dev.yml` (root): local development, builds the image from source.
- `deploy/docker-compose.yml` + `deploy/.env.example`: production, runs the published image `shiyamii/cookit:${COOKIT_VERSION}` with PostgreSQL. When a phase adds a required environment variable (e.g. `ORIGIN`, `BETTER_AUTH_SECRET`), add it to both files and to the README.

Decisions taken outside the plan are logged in `DECISIONS.md`.
