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

## Deployment (Coolify)

1. Create a **PostgreSQL** resource in your Coolify project.
2. Create an application from this Git repository using the **Dockerfile** build pack.
3. Set the environment variables above (`DATABASE_URL` pointing to the Coolify Postgres).
4. Use `/healthz` as the healthcheck path.
5. Deploy. Migrations are applied on startup; HTTPS is handled by Coolify's Traefik proxy.

No application volume is needed: all state lives in PostgreSQL.

### Backups

Back up the PostgreSQL database, for example with Coolify's built-in backups. Users can also export all their recipes as a zip of `.md` files. A detailed restore procedure will be documented in the deployment phase.

### Notes

- iOS only delivers Web Push notifications when the app is installed on the home screen (iOS 16.4+).
- Notifications use the system default sound; there is no repeating alarm.

## License

[MIT](LICENSE). Provided "as is", without warranty of any kind.
