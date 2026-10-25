<p align="center">
  <img src="apps/web/public/favicon.svg" alt="" width="96" height="96" />
</p>

<h1 align="center">CookIt</h1>

<p align="center">
  <a href="https://github.com/Shiyamii/CookIt"><img src="https://img.shields.io/github/v/release/Shiyamii/CookIt?sort=semver&logo=github&label=GitHub" alt="GitHub release" /></a>
  <a href="https://hub.docker.com/r/shiyamii/cookit"><img src="https://img.shields.io/docker/v/shiyamii/cookit?sort=semver&logo=docker&logoColor=white&label=Docker%20Hub" alt="Docker Hub image" /></a>
  <a href="https://shiyamii.github.io/CookIt/"><img src="https://img.shields.io/badge/demo-try%20it-brightgreen" alt="Online demo" /></a>
  <a href="https://github.com/Shiyamii/CookIt/actions/workflows/ci.yml"><img src="https://github.com/Shiyamii/CookIt/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI" /></a>
  <a href="https://codecov.io/gh/Shiyamii/CookIt"><img src="https://codecov.io/gh/Shiyamii/CookIt/graph/badge.svg" alt="Coverage" /></a>
  <a href="LICENSE"><img src="https://img.shields.io/badge/license-MIT-blue" alt="MIT license" /></a>
</p>

**Your self-hosted recipe book.** CookIt keeps your recipes on your own server and helps you actually cook them: scale the servings, follow the steps one at a time, run several dishes at once, and get timers that ring even with the app closed.

Install it from the Docker image [`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit) with PostgreSQL (see [Installation](#installation)); the source code is on [GitHub](https://github.com/Shiyamii/CookIt).

**Try it first in the [online demo](https://shiyamii.github.io/CookIt/)**: fictional recipes, switch between a member and an admin, nothing to install. It runs entirely in your browser (your changes stay there, "Start again" erases them); what needs a real server (accounts, security, pictures, notifications, import from a web page) says so.

## Why CookIt

Recipes end up scattered: bookmarks, screenshots, paper notes, sites full of ads. CookIt gathers them in one book that you host yourself (one Docker image and PostgreSQL), so they stay yours:

- **Private by default**, invite-only: you decide who joins (family, friends) and what each recipe shows (private, shared by link, or public in the gallery).
- **Made for the kitchen**: a phone-friendly cooking mode, timers with notifications, a shopping list built from the recipes you plan to cook.
- **Open format**: recipes are plain markdown with a small syntax for timers and quantities; import them from a website, a file or an AI assistant, and export them all at any time.
- **Multilingual**: French, English and Hungarian interface, and translations of each recipe.

> **Status:** 1.0 in preparation (release candidates on Docker Hub). The project was built in phases (see `plan-site-recettes.md`, in French).

## Features

### Recipes

- **Two editors on the same text**: a visual editor made for phones (fields, ingredient and step groups, drag and drop, timers inserted at the cursor, adjustable quantities) and a markdown editor with highlighting; switch at any time without losing anything, with a live preview.
- **Serving scaling** with readable rounding: metric amounts rounded sensibly (250 g, not 247.5 g), cooking units and counts as clean fractions (½, ⅓, ¼, ¾, ⅛), ranges kept (`2 to 3`). The text stays as you wrote it, only the numbers change; timer durations are never scaled.
- **Units recognized in every spelling** (`c. à soupe`, `CaS`, `tbsp`, `ek`…) and in every language, from a catalog the admin can edit.
- **A summary** (one line shown on the cards), a description, a source link, servings, and **up to 6 photos** per recipe (the first is the cover), resized in the browser before sending (location data removed).
- **Tags in categories** (dish type, diet, cuisine…), chosen from a list managed by the admin, used as filters in every list.
- **Search** in titles, descriptions and ingredients, accents ignored, every word as a prefix, with French, English and Hungarian word forms.
- **Notes**: a public word from the author under the recipe, and a private note of your own on any recipe you can read.
- **"To complete"** badge on recipes created without steps yet; local drafts and a warning before leaving unsaved changes; a stale save (edited elsewhere meanwhile) is detected instead of overwriting.

### Adding and exporting recipes

- **Quick creation**: a title and servings, completed later.
- **Step-by-step wizard**: paste the ingredients and the steps as plain text; numbered lists are split, and durations ("10 min", "1h30", "20 percig") become timers.
- **Markdown import**: pasted, a `.md` file, or a zip of many.
- **Import from a web page** that publishes its recipe as schema.org data (most recipe sites), fetched safely by the server.
- **Import with an AI**: CookIt writes a prompt (with the recipe format, your units and your tags) to copy into the assistant of your choice; paste the answer back. No AI is built in and nothing is sent anywhere.
- **Every import shows a preview** and a "Validate tags" step: tags are recognized by name in any language, never created by an import.
- **Export** one recipe as a `.md` file, or all your recipes as a zip, at any time.

### Sharing and members

- **Three visibilities**: private (only you), unlisted (anyone with the secret share link; a new link cuts off the old one), public (the gallery).
- **The gallery** of public recipes is for the members of your site; an admin can open it to visitors without an account.
- **"Add to my recipes"** keeps someone else's recipe in your list as a link, always in its author's latest version; **"Make a copy"** gives you an independent private copy (with its tags, translations and photos) that says whose recipe it came from.
- **Members page** (opt-in): the members who chose to appear there, with their public recipes; an author's name on a recipe opens their page.
- **Profile**: display name and profile picture.

### Translations

- Each recipe can have a **French, English and Hungarian version**; lists and pages show it in your language when it exists, and the recipe page switches languages.
- **"Add a translation"** writes an AI prompt holding the recipe; the pasted translation is checked live against the original (same groups, ingredients, steps and timers).
- The interface is in **French, English and Hungarian**, including the units, the duration detection and the prompts.

### Cooking mode

- **One step at a time**, large buttons, the screen kept awake, the ingredients to check off in a drawer (quantities for the servings you chose).
- **One-tap timers** on the durations of a step, `+1 min`, cancel.
- **Several dishes at once** (up to 5): one card per recipe with its color, its step and its next timer, and **one timer bar** for all of them, in the order they end, each timer naming its dish.
- **Saved on the server at every action**: reload the page, or pick up your phone or tablet, and find the same step and timers; network cuts are caught up when the connection is back.

### Timers that ring

- **Alarm in the app**: a finished timer rings on every page like an alarm clock until you stop it; five sounds, volume, vibration, "ring until stopped"; settings for the account and, if wanted, per device.
- **Notifications with the app closed** (Web Push, sent by the server): the dish and the timer name, even with the phone locked; sent again every 30 s (10 times at most) until stopped, with a "Stop" button on Android and computers; a tap opens the cooking mode on that dish. Help for each system (iPhone and iPad from the home screen, Android, computers, Brave).

### Shopping list

- **Add a recipe's ingredients** for the servings you want, unticking what you already have.
- **One line per ingredient** with each recipe's quantity, and a total when the units match (`Eggs (3 · 2 = 5)`); group lines by hand (`flour` and `flour T55`), split them again.
- **Order the lines** (drag and drop or arrows), check them off in the shop, free items of your own; a reminder on the home page.

### Home page and app

- **Home page**: resume the cooking in progress, an idea of the day (another one on demand), your recent recipes.
- **Installable** on the home screen (Android, iPhone, computer), mobile first, light and dark themes, accessible (Lighthouse 100).
- **Offline**: the pages and recipes already opened stay available, the cooking mode and the shopping list included; changes are sent when the network is back.

### Accounts and administration

- **Invite-only**: no open sign-up; an admin creates one-click invitation links (admin or member), sends them by email when SMTP is set, and revokes them.
- **Two-step verification** (authenticator app + 10 backup codes) and **passkeys**, optional for each user.
- **"Forgot your password?"** by email (when SMTP is set, for addresses that received their invitation by email); otherwise an admin creates a password reset link.
- **Users page**: disable, enable, delete an account (never the last admin), reset links, members list choice.
- **Categories and tags**, **units** (spellings per language, rounding) and **site settings** (open gallery or members only) managed from the account menu.
- **Rescue commands** in the container: password reset link, a new first-admin link, lifting rate limits.

### Security and privacy

- Passwords hashed with argon2id, httpOnly secure cookies, CSRF protection, rate limiting on sign-in, sign-up and resets, link tokens stored hashed and kept out of server logs.
- A strict Content Security Policy; recipe content is untrusted and never rendered as HTML (safe links only).
- Import from a web page protected against requests to your local network (SSRF).
- Pictures are re-encoded in the browser and checked by the server; every API input is validated.
- No tracking, no third-party service: everything stays in your PostgreSQL database.

## Recipe format

A recipe is a markdown file in three parts separated by a line of dashes (with a blank line around it): presentation, ingredients, steps.

```markdown
# Spaghetti carbonara

> The real one, no cream. Mix the eggs off the heat.

summary: Creamy without cream, ready in 20 minutes.
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
- Ingredient lines (`400 g spaghetti`, `1 ½ c. à café de sel`, `2-3 cloves garlic`) are scaled automatically. Lines without a number and unparsable lines are kept as-is: nothing is ever lost.
- Keys can be written in French, English or Hungarian (`portions`, `servings`, `adag`…); unknown keys are kept.

## Installation

CookIt is one Docker image, [`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit) (linux/amd64), plus a PostgreSQL database (version 17 is the one tested). Database migrations run automatically at startup; the container needs no volume, all the data lives in PostgreSQL. The app listens on port **3000** and has a healthcheck on `/healthz` (database included).

Put it behind **HTTPS** (a reverse proxy of your choice): notifications, passkeys and installing the app need it (browsers only allow them over HTTPS, or on `localhost`).

### 1. Get the files

With Docker Compose, the image and PostgreSQL are started together from [`deploy/`](deploy):

```sh
mkdir cookit && cd cookit
curl -O https://raw.githubusercontent.com/Shiyamii/CookIt/main/deploy/docker-compose.yml
curl -O https://raw.githubusercontent.com/Shiyamii/CookIt/main/deploy/docker-compose.ports.yml
curl -o .env https://raw.githubusercontent.com/Shiyamii/CookIt/main/deploy/.env.example
```

### 2. Set the environment

Edit `.env` (every line is commented). The required values:

```sh
ORIGIN=https://cookit.example.com          # the public URL, exactly as users type it (no trailing path)
BETTER_AUTH_SECRET=...                      # openssl rand -base64 32
POSTGRES_PASSWORD=...                       # openssl rand -hex 24 (URL-safe: it goes into DATABASE_URL)
COOKIT_VERSION=latest                       # or a fixed version: 1.0.0, a minor line: 1.0
```

- **`ORIGIN`** is used for the cookies, the CSRF checks, the links in emails and the passkeys (bound to its domain: changing the domain later makes existing passkeys unusable).
- **`BETTER_AUTH_SECRET`** signs the sessions and encrypts the two-step verification secrets: generate it once and **keep it** (a new one signs everybody out and turns two-step verification off in practice).
- **`TRUST_PROXY`**: `true` (the default of `docker-compose.yml`) when exactly one reverse proxy is in front, so the rate limits see the real client address; `docker-compose.ports.yml` sets it to `false` (port published directly: `X-Forwarded-For` could be forged). CookIt reads the **last** address of `X-Forwarded-For`: the proxy must append the client's address to that header (the default of Caddy and Traefik; `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for` with nginx), not pass the client's own header through.
- **`ADMIN_EMAIL`** (optional) is pre-filled on the first-admin page and used as the push contact.

**Notifications** (optional, recommended): generate a VAPID key pair once and keep it (new keys make every device turn notifications on again):

```sh
docker run --rm --entrypoint node shiyamii/cookit:latest -e "console.log(require('web-push').generateVAPIDKeys())"
```

```sh
VAPID_PUBLIC_KEY=...    # publicKey
VAPID_PRIVATE_KEY=...   # privateKey
VAPID_SUBJECT=mailto:you@example.com   # optional: default ADMIN_EMAIL, else ORIGIN
```

Without them, everything works except the notifications with the app closed (the alarm still rings in the open app).

**Email** (optional): invitations by email, "forgot your password?" and a test email. Without `SMTP_HOST`, links are copied by hand and the email features are hidden.

```sh
SMTP_HOST=smtp.example.com
SMTP_SECURITY=starttls                  # starttls (port 587, TLS required), tls (port 465), none (local relay only)
SMTP_PORT=                              # default from SMTP_SECURITY
SMTP_USER=cookit@example.com            # SMTP_USER and SMTP_PASSWORD: both or neither
SMTP_PASSWORD=...
SMTP_FROM=CookIt <cookit@example.com>   # required with SMTP_HOST
```

The app refuses to start with a clear message when a value is invalid (a secret too short, a development example with an HTTPS origin, half a key pair, a password sent without encryption…).

### 3. Start

Behind a reverse proxy (route your domain to the `app` service, port 3000; no host port is published):

```sh
docker compose up -d
```

Without a proxy (publishes the app on the host port `COOKIT_PORT`, 3000 by default):

```sh
docker compose -f docker-compose.yml -f docker-compose.ports.yml up -d
```

**With your own PostgreSQL** instead, run the image alone and give it the database URL:

```sh
docker run -d --name cookit --restart unless-stopped -p 3000:3000 \
  -e DATABASE_URL=postgres://cookit:<password>@<db-host>:5432/cookit \
  -e ORIGIN=https://cookit.example.com \
  -e BETTER_AUTH_SECRET=<openssl rand -base64 32, kept> \
  -e TRUST_PROXY=true \
  shiyamii/cookit:latest
```

Add the other variables of the [reference](#environment-variables) with more `-e` (or `--env-file`).

### 4. Create the first admin

There is no default account. On first start (and on every start while no admin exists), the server prints a one-time link in its logs, valid 24 hours:

```sh
docker compose logs app     # or: docker logs cookit
```

```
No admin account yet. Create it within 24 hours with this one-time link:
  https://cookit.example.com/setup#token=…
```

Open it to create the administrator account. Everyone else joins through an invitation link from the **Invitations** page of the account menu (with SMTP set, check it there with **Send me a test email**).

### Upgrade

Change `COOKIT_VERSION` (or keep `latest`), then `docker compose pull && docker compose up -d` (with `docker run`: pull the new tag and recreate the container). Migrations run at startup.

### Rescue commands

From the container (`docker compose exec app sh`, or `docker exec -it cookit sh`):

```sh
node dist/cli.js admin:reset-link <username>   # one-time password reset link (lost password, lost 2FA device)
node dist/cli.js setup-link                    # new first-admin link, only while no enabled admin exists
node dist/cli.js rate-limits:clear             # lift every rate limit (someone locked out)
node dist/cli.js push:vapid-keys               # print a new VAPID key pair
```

A password reset link created by an admin also turns two-step verification off and removes the passkeys of that account.

### Environment variables

| Variable                                              | Description                                                                                                          |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                                        | PostgreSQL connection string (set by `docker-compose.yml` from the `POSTGRES_*` values)                              |
| `ORIGIN`                                              | **Required.** Public URL of the app (cookies, CSRF checks, links; its domain is the passkeys' domain)                |
| `BETTER_AUTH_SECRET`                                  | **Required.** At least 32 characters: `openssl rand -base64 32`. Keep it                                             |
| `ADMIN_EMAIL`                                         | Optional: pre-filled on the first-admin page; default push contact                                                   |
| `TRUST_PROXY`                                         | `true` behind exactly one reverse proxy (client address from `X-Forwarded-For`), else `false` (default when unset)   |
| `PORT`                                                | Port inside the container (default `3000`)                                                                           |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`              | Web Push keys (both or neither). Unset: no notifications with the app closed. Keep them                              |
| `VAPID_SUBJECT`                                       | Contact for the push services: `mailto:you@example.com` or an https URL (default: `ADMIN_EMAIL`, else `ORIGIN`)      |
| `SMTP_HOST`                                           | Optional email server. Unset: no email                                                                               |
| `SMTP_SECURITY`                                       | `starttls` (default, TLS required), `tls`, or `none` (local relay only; refused with a password and an HTTPS origin) |
| `SMTP_PORT` / `SMTP_USER` / `SMTP_PASSWORD`           | Port (default 587, 465 or 25 from `SMTP_SECURITY`) and credentials (both or neither)                                 |
| `SMTP_FROM`                                           | Sender, e.g. `CookIt <cookit@example.com>` (required with `SMTP_HOST`)                                               |
| `COOKIT_VERSION`, `COOKIT_PORT`                       | Compose only: the image tag, and the host port with `docker-compose.ports.yml`                                       |
| `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` | Compose only: the database created by the `db` service (password required, URL-safe)                                 |

### Good to know

- iOS and iPadOS only deliver notifications to the app added to the home screen (iOS 16.4+); the Notifications page explains it for each system.
- With the app closed, notifications use the system's sound (a web app cannot choose it). With the app open, the alarm rings with the sound chosen in **Alarm**.
- `robots.txt` asks search engines not to index the instance.

## Development

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

Locally, `docker-compose.dev.yml` sends every email to a Mailpit running on your machine (ports 1025 and 8025, not started by the compose: `docker run -d -p 1025:1025 -p 8025:8025 axllent/mailpit`); read them at http://localhost:8025. The email templates are MJML (`apps/server/src/modules/mail/templates/`), compiled with the web theme's colors by `bun run emails`.

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

The tests sign in as `e2e_admin`, created through the rescue CLI on an empty database. If your local database already has another admin, start from a fresh one: `docker compose -f docker-compose.dev.yml down -v`. The coverage badge counts the unit tests (parser, scaling, services, page logic); the server routes, the database and the pages are tested end to end.

The online demo is a build mode of the web app: the API runs in the page on in-memory data saved in the browser (`apps/web/src/demo/`), no server or database:

```sh
bun run dev:demo     # the demo with hot reload
bun run test:demo    # build it for /CookIt/, then its Playwright tests (e2e/demo/)
```

A Husky pre-commit hook runs Prettier, ESLint and the unit tests; it is installed automatically by `bun install`.

To see how the recipe parser reads a markdown file (and try serving scaling):

```sh
bun run parse packages/shared/src/recipe/fixtures/boeuf-bourguignon.md --servings 4
bun run parse my-recipe.md --canonical   # canonical form, as exported
```

### Tech stack

- **Frontend**: React + TypeScript SPA (Vite), React Router, TanStack Query, shadcn/ui + Tailwind CSS, react-i18next, CodeMirror 6, vite-plugin-pwa
- **Backend**: Hono on Node.js, Zod, Drizzle ORM, Better Auth, web-push
- **Database**: PostgreSQL
- **Tooling**: Bun (package manager, workspaces, build, unit tests). Production runs on **Node.js**.
- **Tests**: `bun test` (unit), Playwright (end-to-end against the built image)
- **Code quality**: Prettier, ESLint, Husky pre-commit hook (Prettier + ESLint + unit tests)

### Repository layout

```
apps/web          React SPA
apps/server       Hono API, notification scheduler, database migrations
packages/shared   Shared types and Zod schemas, markdown parser/serializer, scaling, AI prompt generators
deploy/           Docker Compose files to run the published image with PostgreSQL
```

The server serves both the API (`/api/v1/*`) and the SPA from a single origin and a single Docker image.

## Releases

Images are published to Docker Hub as [`shiyamii/cookit`](https://hub.docker.com/r/shiyamii/cookit) (linux/amd64). Versions are computed automatically by [semantic-release](https://semantic-release.org) from [Conventional Commits](https://www.conventionalcommits.org):

| Branch    | Result                                                              |
| --------- | ------------------------------------------------------------------- |
| `main`    | development, CI only                                                |
| `next`    | release candidate, e.g. `v0.2.0-rc.1` → image tag `0.2.0-rc.1`      |
| `release` | stable release, e.g. `v0.2.0` → image tags `0.2.0`, `0.2`, `latest` |

To release: merge `main` into `next` to publish a release candidate, then into `release` for the stable version (which also publishes the [online demo](https://shiyamii.github.io/CookIt/) to GitHub Pages; the **Demo (GitHub Pages)** workflow can also be run by hand). The full CI (including end-to-end tests against the image) must pass before anything is tagged or published. To republish the image of an existing version, run the **Release** workflow manually with that version.

## License

[MIT](LICENSE). Provided "as is", without warranty of any kind.
