# CookIt

A self-hosted recipe app built for actually cooking: step-by-step cooking mode, several dishes at once, and timers that notify you even when the page is closed.

> **Status:** early development. The project is built in phases (see `plan-site-recettes.md`, in French). Commands below describe the target setup and will be kept up to date as each phase lands.

## Features

- **Invite-only accounts**: admins create one-click invitation links and manage users. Optional **2FA (TOTP)** and **passkeys**.
- **Recipe visibility**: private, unlisted (secret link) or public (public gallery, no account needed). Copy any shared recipe into your own library.
- **Markdown import/export** with a simple, human-readable format and special syntax for timers and scalable quantities.
- **Two editors**: a structured visual editor (mobile friendly) and a markdown editor, switchable without losing anything.
- **Serving scaling** with readable rounding and clean fractions (½, ¼, ⅓).
- **Cooking mode**: one step at a time, large buttons, ingredient checklist, screen kept awake, one-tap timers, several recipes at once.
- **Multi-recipe sessions**: cook several dishes in parallel, with a shared timer bar where each timer is labeled with its dish.
- **Web Push notifications** when a timer ends, sent by the server even with every page closed.
- **Many ways to add a recipe**: quick create, step-by-step wizard (paste ingredients/steps, automatic duration detection), markdown paste or file/zip upload, URL import (schema.org JSON-LD), or a ready-to-copy prompt for the AI assistant of your choice.
- **Translations**: each recipe can have a French, an English and a Hungarian version; the UI is in French, English and Hungarian.
- **Photos**: a cover and a gallery for each recipe (resized in the browser), a display name and a profile picture for each user.
- **Tags** organized in categories, managed by the admin.
- **Home page**: resume the cooking in progress, an idea of the day, your recent recipes.
- **Shopping list**: add a recipe's ingredients (for the servings you want, minus what you have), one line per ingredient with each recipe's quantity, group lines by hand, order them (drag and drop or arrows), check them off in the shop, offline too.
- **Installable PWA**, mobile first, works offline for the pages and recipes already opened, cooking mode included.

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
- Ingredient lines (`400 g spaghetti`, `1 ½ c. à café de sel`, `2-3 cloves garlic`) are scaled automatically; units are recognized in any of their spellings (`c. à soupe`, `CaS`, `tbsp`…), from a catalog the admin can edit. Lines without a number and unparsable lines are kept as-is.

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

The tests sign in as `e2e_admin`, created through the rescue CLI on an empty database. If your local database already has another admin, start from a fresh one: `docker compose -f docker-compose.dev.yml down -v`.

A Husky pre-commit hook runs Prettier, ESLint and the unit tests; it is installed automatically by `bun install`.

To see how the recipe parser reads a markdown file (and try serving scaling):

```sh
bun run parse packages/shared/src/recipe/fixtures/boeuf-bourguignon.md --servings 4
bun run parse my-recipe.md --canonical   # canonical form, as exported
```

### Recipes

**My recipes** lists and searches your recipes; **New recipe** opens the editor: a visual editor (form, groups, drag and drop, timers inserted at the cursor, adjustable quantities) or a markdown editor, switchable at any time without losing anything, plus a preview. Each recipe is private, unlisted (readable with its share link) or public (listed in the **Gallery**, readable without an account). A recipe of someone else can be added to your library as an independent copy. Recipes get tags from a common list (by category: dish type, diet, cuisine…), used as filters in lists.

**Add a recipe** offers a quick creation (title and servings, completed later), a step-by-step wizard (paste the ingredients and the steps; durations like "10 min" or "1h30" become timers), the import of markdown (pasted, a `.md` file or a zip) or of a recipe web page (schema.org), and the full editor. Every import shows a preview and asks to validate the tags. Each recipe can be exported as a `.md` file, and all your recipes as a zip.

**Cooking mode**: "Cook" on a recipe opens one step at a time with large buttons, the ingredients to check in a drawer (quantities follow the servings), and timers started with a tap on the durations of a step (+1 min, cancel; a sound and a vibration when one ends while the page is open). The screen stays on. Progress is saved on the server at every action and kept in the browser during network cuts: reloading the page or opening it on another device finds the same step and timers. Several recipes can be cooked at once (up to 5): one card per recipe with its color, its step and its next timer, and one timer bar for all of them, in the order they end, each timer naming its dish.

**Notifications**: from the account menu (or the notice in the cooking mode), turn on notifications on each device: when a timer ends, the server sends a notification with the dish and the timer name, even with the page closed or the phone locked; a tap opens the cooking mode on that recipe. On iPhone and iPad (iOS 16.4+), add CookIt to the home screen first and turn them on from there; the Notifications page explains it for each system.

**Install and offline**: CookIt can be installed on the home screen (Android, iPhone, computer). The pages and recipes already opened stay available without network, so the cooking mode keeps working if the connection drops in the kitchen; changes are sent when it is back.

**AI prompts** (no AI built in): "Import with an AI" gives a prompt to copy into the assistant of your choice, generated from the recipe format (with your tag list and units); paste the answer back, check the preview, save. On a recipe, "Add a translation" does the same for another language: the prompt holds the recipe, the pasted translation is checked live against the original (same groups, ingredients, steps and timers). A recipe is read in your interface language when it has that translation, and its page lets you switch languages.

The admin manages **Categories and tags** and **Units** from the account menu. Units are data: their ways of writing (`c. à soupe`, `CaS`, `tbsp`…) are recognized in any language and decide how quantities are rounded; changing them never changes recipe texts.

### First admin and accounts

There is no default account. On first start (and on every restart while no admin exists), the server prints a one-time link in its logs, valid 24 hours:

```
No admin account yet. Create it within 24 hours with this one-time link:
  https://cookit.example.com/setup#token=…
```

Open it to create the administrator account (`ADMIN_EMAIL`, if set, is pre-filled). Everyone else joins through an invitation link created on the **Invitations** admin page; there is no open sign-up and no email sending: the admin hands links over (chat, message…). From the **Users** page the admin can disable, delete a user or create a password reset link.

Rescue commands, from the container's terminal (`docker exec -it <container> sh`, or Coolify's terminal):

```sh
node dist/cli.js admin:reset-link <username>   # one-time password reset link (lost password)
node dist/cli.js setup-link                    # new first-admin link, only while no enabled admin exists
node dist/cli.js rate-limits:clear             # lift every rate limit (someone locked out)
```

Each user can turn on **two-step verification** (authenticator app + 10 single-use backup codes) and add **passkeys** from the **Security** page of the account menu. Lost phone and backup codes: a password reset link (admin Users page, or `admin:reset-link` for an admin) turns two-step verification off and removes the passkeys.

## Configuration

| Variable                                 | Description                                                                                                                                   |
| ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                           | PostgreSQL connection string                                                                                                                  |
| `ORIGIN`                                 | Public HTTPS URL of the app (CSRF checks, secure cookies; its domain is the passkeys' domain)                                                 |
| `BETTER_AUTH_SECRET`                     | Session signing secret: `openssl rand -base64 32`. Also encrypts 2FA secrets: changing it turns 2FA off in practice (users need a reset link) |
| `ADMIN_EMAIL`                            | Optional: email pre-filled on the first-admin page                                                                                            |
| `TRUST_PROXY`                            | `true` behind one reverse proxy (client IP from `X-Forwarded-For`)                                                                            |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Web Push keys for the timer notifications. Unset: no notifications. Keep them: new keys make every device turn notifications on again         |
| `VAPID_SUBJECT`                          | Contact for the push services: `mailto:you@example.com` or an https URL (default: `ADMIN_EMAIL`, else `ORIGIN`)                               |

Generate the VAPID keys once, with the image (or `npx web-push generate-vapid-keys`):

```sh
docker run --rm --entrypoint node shiyamii/cookit:latest -e "console.log(require('web-push').generateVAPIDKeys())"
```

In a running container, `node dist/cli.js push:vapid-keys` prints a new pair too.

## Releases

Images are published to Docker Hub as [`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit) (linux/amd64). Versions are computed automatically by [semantic-release](https://semantic-release.org) from [Conventional Commits](https://www.conventionalcommits.org):

| Branch    | Result                                                              |
| --------- | ------------------------------------------------------------------- |
| `main`    | development, CI only                                                |
| `next`    | release candidate, e.g. `v0.2.0-rc.1` → image tag `0.2.0-rc.1`      |
| `release` | stable release, e.g. `v0.2.0` → image tags `0.2.0`, `0.2`, `latest` |

To release: merge `main` into `next` to publish a release candidate, then into `release` for the stable version. The full CI (including end-to-end tests against the image) must pass before anything is tagged or published. To republish the image of an existing version, run the **Release** workflow manually with that version.

## Deployment

CookIt ships as a single image ([`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit)) plus PostgreSQL. Migrations are applied automatically on startup; no application volume is needed, all state lives in PostgreSQL.

### Docker Compose

```sh
cd deploy
cp .env.example .env   # set ORIGIN, BETTER_AUTH_SECRET, POSTGRES_PASSWORD (URL-safe, e.g. `openssl rand -hex 24`), COOKIT_VERSION
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d
```

`docker-compose.yml` publishes no host port (made for a reverse proxy routing to the `app` service on port 3000); `docker-compose.ports.yml` additionally publishes it on `COOKIT_PORT` (default 3000) and sets `TRUST_PROXY=false` (without a proxy, `X-Forwarded-For` could be forged to dodge rate limiting). Put it behind HTTPS. Then look for the first-admin link in the logs: `docker compose logs app`. To upgrade, change `COOKIT_VERSION` (or pull `latest`) and run `docker compose up -d` again.

### Coolify

Either:

- **Docker Compose resource** pointing to `deploy/docker-compose.yml`: set the variables in the UI, then give the `app` service a domain such as `https://cookit.example.com:3000` (`:3000` is the container port); or
- **Docker image** `shiyamii/cookit:<version>` plus a separate **PostgreSQL** resource, with `DATABASE_URL` set to that database, `ORIGIN`, `BETTER_AUTH_SECRET`, `TRUST_PROXY=true` and the VAPID keys.

Use `/healthz` as the healthcheck path (port 3000). HTTPS is handled by Coolify's proxy.

### Backups

Back up the PostgreSQL database, for example with Coolify's built-in backups. Users can also export all their recipes as a zip of `.md` files. A detailed restore procedure will be documented in the deployment phase.

### Notes

- Passkeys are bound to the domain of `ORIGIN`: moving CookIt to another domain makes existing passkeys unusable (users sign in with their password and add new ones).
- iOS only delivers Web Push notifications when the app is installed on the home screen (iOS 16.4+).
- Notifications use the system default sound; there is no repeating alarm.

## License

[MIT](LICENSE). Provided "as is", without warranty of any kind.
