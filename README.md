# CookIt

A self-hosted recipe app built for actually cooking: step-by-step cooking mode, several dishes at once, and timers that notify you even when the page is closed.

> **Status:** early development. The project is built in phases (see `plan-site-recettes.md`, in French). Commands below describe the target setup and will be kept up to date as each phase lands.

## Features

- **Invite-only accounts**: admins create one-click invitation links and manage users. Optional **2FA (TOTP)** and **passkeys**.
- **Recipe visibility**: private, unlisted (secret link) or public (public gallery, no account needed). Copy any shared recipe into your own library.
- **Markdown import/export** with a simple, human-readable format and special syntax for timers and scalable quantities.
- **Two editors**: a structured visual editor (mobile friendly) and a markdown editor, switchable without losing anything.
- **Serving scaling** with readable rounding and clean fractions (½, ¼, ⅓).
- **Cooking mode**: one step at a time, large buttons, ingredient checklist, screen kept awake, one-tap timers.
- **Multi-recipe sessions**: cook several dishes in parallel, with a shared timer bar where each timer is labeled with its dish.
- **Web Push notifications** when a timer ends, scheduled by the server.
- **Many ways to add a recipe**: quick create, step-by-step wizard (paste ingredients/steps, automatic duration detection), markdown paste or file/zip upload, URL import (schema.org JSON-LD), or a ready-to-copy prompt for the AI assistant of your choice.
- **Translations**: each recipe can have a French and an English version; the UI is in French and English.
- **Tags** organized in categories, managed by the admin.
- **Installable PWA**, mobile first, works offline for recipes already opened.

## Recipe format

A recipe is a markdown file in three parts separated by a line of dashes (with a blank line around it): presentation, ingredients, steps.

```markdown
# Spaghetti carbonara

> The real one, no cream. Mix the eggs off the heat.

servings: 4
tags: main-course, italian
source: https://example.com/recipe
format: 1

---

### For the pasta

- 400 g spaghetti
- 1 pinch of salt

### For the sauce

- 150 g lardons
- 4 eggs
- 50 g pecorino

---

### Pasta

1. Bring the water to a boil.
2. Cook the pasta [10 min](timer:10m 'pasta').

### Sauce

1. Brown the lardons [5 min](timer:5m 'lardons') with [2 tbsp](q:) of oil.
2. Off the heat, mix with the beaten eggs and pecorino.
```

- `[label](timer:10m "name")` creates a timer (`10m`, `1h30m`, `45s`). Timer durations are never scaled.
- `[2 tbsp](q:)` marks an inline quantity that follows serving scaling.
- Ingredient lines (`400 g spaghetti`) are scaled automatically; unparsable lines are kept as-is.

## Tech stack

- **Frontend**: React + TypeScript SPA (Vite), React Router, TanStack Query, shadcn/ui + Tailwind CSS, react-i18next, CodeMirror 6, vite-plugin-pwa
- **Backend**: Hono on Node.js, Zod, Drizzle ORM, Better Auth, web-push
- **Database**: PostgreSQL
- **Tooling**: Bun (package manager, workspaces, build, unit tests). Production runs on **Node.js**.
- **Tests**: `bun test` (unit), Playwright (end-to-end against the built image)
- **Code quality**: Prettier, ESLint, Husky pre-commit hook (Prettier + ESLint + unit tests)

## Repository layout

```
apps/web          React SPA
apps/server       Hono API, notification scheduler, database migrations
packages/shared   Shared types and Zod schemas, markdown parser/serializer, scaling, AI prompt generators
```

The server serves both the API (`/api/v1/*`) and the SPA from a single origin and a single Docker image.

## Getting started (development)

### Prerequisites

- [Bun](https://bun.sh)
- Node.js LTS
- Docker (for PostgreSQL / the full stack)

### Run

Development, with hot reload:

```sh
bun install
cp apps/server/.env.example apps/server/.env
docker compose -f docker-compose.dev.yml up -d db   # PostgreSQL
bun run dev                                         # API on :3000, web on Vite's dev server
```

Full stack from the production image (app + PostgreSQL), on http://localhost:3000:

```sh
docker compose -f docker-compose.dev.yml up --build
```

### Checks

```sh
bun test              # unit tests
bun run typecheck     # TypeScript
bun run lint          # ESLint
bun run format:check  # Prettier
bun run build         # production build
```

End-to-end tests (Playwright) run against the production image:

```sh
docker compose -f docker-compose.dev.yml up -d --build
bunx playwright install chromium   # first time only
bun run test:e2e
```

A Husky pre-commit hook runs Prettier, ESLint and the unit tests; it is installed automatically by `bun install`.

### First admin

There is no default account. Set `ADMIN_EMAIL`; on first start, a one-time setup link is printed in the server logs.

## Configuration

| Variable                                 | Description                                                               |
| ---------------------------------------- | ------------------------------------------------------------------------- |
| `DATABASE_URL`                           | PostgreSQL connection string                                              |
| `ORIGIN`                                 | Public HTTPS URL of the app (used for CSRF checks and secure cookies)     |
| `BETTER_AUTH_SECRET`                     | Secret used by Better Auth                                                |
| `ADMIN_EMAIL`                            | Email of the initial admin account                                        |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys                                                             |
| `VAPID_SUBJECT`                          | Contact for the push service (e.g. `mailto:you@example.com`)              |
| `WEBAUTHN_RP_ID`                         | Public domain, without scheme (changing it invalidates existing passkeys) |
| `WEBAUTHN_RP_NAME`                       | Display name shown when registering a passkey                             |

Generate VAPID keys with:

```sh
npx web-push generate-vapid-keys
```

## Releases

Images are published to Docker Hub as [`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit) (linux/amd64). Versions are computed automatically by [semantic-release](https://semantic-release.org) from [Conventional Commits](https://www.conventionalcommits.org):

| Branch    | Result                                                              |
| --------- | ------------------------------------------------------------------- |
| `main`    | development, CI only                                                |
| `next`    | release candidate, e.g. `v0.2.0-rc.1` → image tag `0.2.0-rc.1`      |
| `release` | stable release, e.g. `v0.2.0` → image tags `0.2.0`, `0.2`, `latest` |

To release: merge `main` into `next` to publish a release candidate, then into `release` for the stable version. The full CI (including end-to-end tests against the image) must pass before anything is tagged or published.

## Deployment

CookIt ships as a single image ([`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit)) plus PostgreSQL. Migrations are applied automatically on startup; no application volume is needed, all state lives in PostgreSQL.

### Docker Compose

```sh
cd deploy
cp .env.example .env   # set POSTGRES_PASSWORD (URL-safe, e.g. `openssl rand -hex 24`) and COOKIT_VERSION
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d
```

`docker-compose.yml` publishes no host port (made for a reverse proxy routing to the `app` service on port 3000); `docker-compose.ports.yml` additionally publishes it on `COOKIT_PORT` (default 3000). Put it behind HTTPS. To upgrade, change `COOKIT_VERSION` (or pull `latest`) and run `docker compose up -d` again.

### Coolify

Either:

- **Docker Compose resource** pointing to `deploy/docker-compose.yml`: set the variables in the UI, then give the `app` service a domain such as `https://cookit.example.com:3000` (`:3000` is the container port); or
- **Docker image** `shiyamii/cookit:<version>` plus a separate **PostgreSQL** resource, with `DATABASE_URL` set to that database.

Use `/healthz` as the healthcheck path (port 3000). HTTPS is handled by Coolify's proxy.

### Backups

Back up the PostgreSQL database, for example with Coolify's built-in backups. Users can also export all their recipes as a zip of `.md` files. A detailed restore procedure will be documented in the deployment phase.

### Notes

- iOS only delivers Web Push notifications when the app is installed on the home screen (iOS 16.4+).
- Notifications use the system default sound; there is no repeating alarm.

## License

[MIT](LICENSE). Provided "as is", without warranty of any kind.
