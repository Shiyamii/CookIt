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
- Web unit tests cover the pure `model/` logic of `apps/web` (`*.test.ts` next to the code, no DOM). They are type-checked by `apps/web/tsconfig.test.json` (Bun types stay out of the app's tsconfig); `bun test` resolves `@/` from the root thanks to the second `paths` entry in `apps/web/tsconfig.json` (Bun resolves paths from its working directory).
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

## Architecture (mandatory)

Both apps are split **by domain** (`system`, `preferences`, `users`, `invites`, `recipes`, `tags`, `units`, `cooking`, `push`…), and inside a domain **by layer**. ESLint (`@typescript-eslint/no-restricted-imports`, see `eslint.config.js`) rejects imports that cross layers the wrong way; type-only imports are allowed.

### Frontend: MVVM (`apps/web/src/features/<domain>/`)

```
model/        plain TypeScript: domain types, API calls (through src/lib/api.ts), pure logic, stores. No React.
viewmodels/   use<Name>ViewModel() hooks: TanStack Query, local state, derived values, commands
              (selectX, save…). Return plain data and functions, never JSX.
views/        React components (pages and their parts): render what their ViewModel returns
              and call its commands. No useQuery, no fetch, no localStorage, no business logic.
```

- A view calls **one** ViewModel hook (its own) or receives props from a parent view. `useTranslation` for `t()` is fine in views (presentation).
- Pure logic shared with the server goes to `packages/shared`, not to `model/`.
- `src/app/` holds the shell: providers, router (`App.tsx`), layout. `src/components/ui/` is shadcn; generic presentational components go to `src/components/`.

### Backend: controller / service / repository (`apps/server/src/modules/<domain>/`)

```
<domain>.controller.ts   Hono routes: validate input with shared Zod schemas, call the service,
                         map results/errors to HTTP. No Drizzle, no repository.
<domain>.service.ts      Business rules and authorization. No Hono, no Drizzle: data through repositories.
<domain>.repository.ts   Drizzle queries only. No business rules.
<domain>.schema.ts       Drizzle tables of the domain, re-exported by src/db/schema.ts.
```

- Each layer is a factory taking its dependencies (`createRecipeService({ recipes, tags })`), wired by hand in the composition root `src/app.ts`. No DI container, no classes required.
- Services are unit-tested with `bun test` and in-memory fake repositories (`<domain>.service.test.ts`); repositories and controllers are covered by Playwright against the real image.
- A service may call another domain's service, never another domain's repository.

## Frontend conventions (`apps/web`)

- Path alias `@/` → `apps/web/src`.
- UI components: add them with `bunx shadcn@latest add <component>` (run in `apps/web`). Files in `src/components/ui/` are generated: do not hand-edit them, wrap or compose instead.
- Theme: CSS variables in `src/index.css` (from tweakcn). Use the theme tokens (`bg-background`, `text-primary`, `text-muted-foreground`…), never hard-coded colors.
- Every user-visible string goes through `react-i18next` (`t('…')`). Add keys to `src/locales/en.ts` (reference type) and `src/locales/fr.ts`.
- Server state through TanStack Query (in ViewModels), API calls through `src/lib/api.ts` (from `model/`). Pages are views in `src/features/<domain>/views/`, routes in `src/app/App.tsx`.
- Mobile first: design for ~390px wide first, large touch targets, respect safe-area insets.
- All web packages are `devDependencies` (everything is bundled by Vite).

## Data model essentials

- Better Auth tables (`user`, `session`, `account`, `verification`, `twoFactor`, `passkey`) are generated by the Better Auth CLI and then integrated into **Drizzle migrations** (never use Better Auth's own `migrate`). Extra user fields: `username` (unique), `role` (`admin`|`user`), `locale` (`fr`|`en`), `disabled_at`.
- Other tables: `invites`, `recipes`, `recipe_translations`, `tag_categories`, `tags`, `recipe_tags`, `cook_sessions`, `timers`, `push_subscriptions` (see spec §3).
- Recipe "part 1" (title, description, servings, source) is stored in **real columns** (source of truth); parts 2 and 3 (ingredients, steps) in `body_markdown`. The full markdown document is composed on the fly only for export, the markdown editor and AI prompts.
- Tag/category labels are a JSONB `{ lang: label }` object validated by a shared Zod schema. No translation tables.
- **Units are data, not code**: table `units` (slug, rounding `decimal`|`fraction`, `labels` and `aliases` as JSONB keyed by language), editable by the admin, seeded from the default catalog in `packages/shared`. The parser receives the catalog as a parameter. Adding a language never needs a migration.
- **Never store a decreasing remaining time.** A timer is an absolute `ends_at`; remaining time is computed at display (with server/client clock skew correction).

## Markdown recipe format

Three parts separated by a line of dashes only (3+), **with a blank line before and after**: (1) presentation, (2) ingredients, (3) steps. No YAML frontmatter.

- Parts are identified by **position**, not heading. A leading `## ...` heading is tolerated and ignored.
- Part 1: `# Title` (required), quote/paragraphs = description, then `key: value` lines: `portions`/`servings` (required int), `source`, `format`, `tags` (exchange only). FR and EN keys accepted; unknown keys preserved in `extra_meta`.
- Parts 2/3: optional `### Group` headings; parts 2 and 3 may be empty (warning only).
- Timer: `[10 min](timer:10m "label")` — durations `10m`, `1h30m`, `45s`. Timer durations are **never scaled**.
- Inline scaled quantity: `[2 tbsp](q:)`.
- Ingredient line: quantity (integer, decimal, `1/2`, `½`, `1 ½`, range `2-3`), optional unit, name. A unit is recognized through its aliases in **any** language (`c. à soupe`, `cuillère à soupe`, `CaS`, `tbsp`…), matched ignoring case, accents, dots and spaces, longest alias first; an unknown word stays part of the name. The text is kept as written: scaling only changes the number.
- Rounding follows the unit: `decimal` (metric: half below 10, integer up to 100, nearest 5 above), `fraction` (cooking units and no unit: ½ ⅓ ⅔ ¼ ¾ ⅛, otherwise one decimal).
- Rounding: `decimal` rounds to 0.1 below 1 as well; fractions are used within 0.04 of ½ ⅓ ⅔ ¼ ¾ ⅛ (≥ 10: nearest ½). Ranges scale both bounds and keep their separator (`2 à 3`). Factor 1 leaves the text untouched.
- Unparsable lines are kept as raw text / free blocks — **never lose content**. An invalid `timer:` / `q:` link stays text with a warning.
- A canonical serializer must make `parse → serialize → parse` stable (tested on many examples).

### Parser module (`packages/shared/src/recipe/`)

`parseRecipe(markdown, { units })` → `{ ok, document?, diagnostics }` (diagnostics are codes + params, translated by the UI; errors reject the document, warnings don't). Pieces: `split.ts` (3 parts), `presentation.ts` (part 1), `body.ts` (parts 2/3), `ingredient.ts` + `quantity.ts` + `units/` (quantity, unit, name), `inline.ts` (timers and `q:` through remark), `scale.ts` (`scaleIngredient`, `scaleSegment`, `formatAmount`), `serialize.ts` (`serializeRecipe`, `serializePresentation`, `serializeBody` = `body_markdown`), `translation.ts` (`checkTranslationStructure`). Pass the unit catalog from the database (`units` option); `DEFAULT_UNITS` is the seed. Serializer invariants: continuation lines indented 4 spaces, a dash-only text line never has blank lines on both sides, the canonical form always writes `format:`. Inline parsing only reads links (other markdown constructs are disabled for speed on hostile input) and skips steps longer than `MAX_INLINE_LENGTH`.

When recipes are stored (phase 4): Zod schemas for the columns must refuse line breaks in single-line fields (title, source, group names, tags, `extraMeta` keys and values) and `extraMeta` keys that are known fields (`portions`, `tags`, `format`…); the unit catalog must be passed as a **new array** after each admin edit (the unit index is cached per array).

## Recipes (phase 4)

- Tables `recipes` (owner, slug unique per owner, `base_lang`, servings, visibility, `share_token`, `source_url`, `copied_from_id`) and `recipe_translations` (title, description, `extra_meta`, `body_markdown`, `search_text` + generated `search` tsvector). Module `modules/recipes`; shared API schemas and `composeRecipeMarkdown` in `packages/shared/src/recipes.ts`.
- Every save is checked by **parsing** the composed document on the server (`invalid_recipe` 422 with diagnostics); the stored columns and body are the parser's canonical output. `baseVersion` (the `updatedAt` the editor started from) makes a stale save a `conflict` (409). Timestamps are written from JS (millisecond precision) so the comparison is exact.
- **Access**: a private recipe is seen only by its owner (admins included: 404, never 403); public by anyone (no account); unlisted by its owner and with its share link (`/shared#token=…`, POST `/api/v1/shared`). Only the owner changes, deletes or shares; "add to my library" copies a readable recipe (public, or unlisted with the token) as a new private one.
- Search: title, description and ingredients, accents removed (`fold`) in `search_text`, French or English stemming per translation, every word as a prefix (`searchQuery`).
- Web (`features/recipes`): the visual editor and the markdown editor (CodeMirror 6, own line highlighter, no language package) work on the **same text**: a row is the raw text of an ingredient or step, the canonical serializer writes the markdown (`model/editor.ts`), edits are a pure reducer (`model/editor-actions.ts`). Markdown → visual is refused while the text has errors. Local draft (`model/draft.ts`, cleared at sign-out), leave guard (`useBlocker`), preview. The editor route is lazy-loaded.
- Untrusted markdown (descriptions, steps) is rendered by `components/Markdown.tsx` from its syntax tree: no HTML string, http(s)/mailto links only, images as text. Recipe `source` is a link only for http(s) URLs.

- `tags:` line appears only in export/import, **never in the markdown editor**. Tags are list values (never free text), always go through a "Validate tags" step on import, and are never created by an import.
- Translations of a recipe must share the same structure (groups, ingredient/step counts, timer durations); the server warns on mismatch.

## Categories, tags and units (phase 4b)

- Tables `tag_categories`, `tags` (slug unique across categories, `on delete restrict` from its category), `recipe_tags` (recipes domain, written in the recipe save transaction), `units`. Modules `modules/tags` and `modules/units`; shared schemas in `packages/shared/src/tags.ts` and `units/unit.ts` (`unitInputSchema`, `UnitEntry`).
- **Starting data** (`DEFAULT_UNITS`, `DEFAULT_TAG_CATEGORIES`) is inserted once at startup by `src/db/seed.ts` and recorded in the `seeds` table: a restart never brings back what the admin deleted. A new seed gets a new name (`units-v2`…).
- The units and tags services cache their catalog and replace it (a **new array**) after every change; the recipes service parses with `units.catalog()` and checks tag selections with the tags service (unknown tag, or two tags of a single-choice category → `invalid_tags`). Tags are saved by both editors (`tagIds` in every save body; omitted = unchanged) and copied by "add to my library".
- `GET /api/v1/units` and `GET /api/v1/tags` are public (needed to read and scale public recipes); admin routes under `/api/v1/admin/units`, `/admin/tags`, `/admin/tag-categories`. Deleting a used tag needs `{ confirm: true }` or `{ mergeInto }` (409 `tag_in_use` with `recipeCount` otherwise); a category must be empty to be deleted; a duplicate normalized alias is a 409 `alias_conflict`.
- Lists filter by tag slugs (`?tags=a,b`, all required). Labels are shown with `labelFor` (interface language, then the others, then the slug); the front reads the interface language with `i18n.resolvedLanguage` (`i18n.language` can be `en-US`).

## Creation, import and export (phase 5)

- "Add a recipe" (`/recipes/new`): quick creation (title + servings, body `---`, then the editor), the wizard (`/recipes/new/wizard`, `model/wizard.ts`), import (`/recipes/import`), the blank editor (`/recipes/new/editor`). Wizard and import pages are lazy-loaded.
- Pure, deterministic helpers in `packages/shared/src/import/`: `splitIngredients` / `splitSteps` (pasted text), `detectDurations` (FR/EN; a range proposes its high value and keeps `lowSeconds`), `extractJsonLd` / `findRecipe` / `recipeFromJsonLd` (schema.org → document; missing servings are left out, never invented). `reviewTags` in `tags.ts` is the "Validate tags" step (by slug, then by label in any language; ambiguous; ignored).
- Every import goes through a preview and the tag step, then `POST /api/v1/recipes/markdown` with `tagIds` (one recipe at a time). Files are read in the browser with limits checked before reading/inflating (`IMPORT_LIMITS`, fflate `unzipSync` filter on declared sizes).
- Export: one `.md` built in the browser (`composeRecipeMarkdown` with `includeTags`: slugs, `format:`), all recipes as a zip built by the server (`GET /api/v1/recipes/export`, fflate).
- **Import by URL** (`POST /api/v1/import/url`, signed in, rate limited): `lib/safe-fetch.ts` is the only way the server fetches a user-given URL: http(s) on standard ports, no credentials, every resolved address checked against `BlockList` (private, loopback, link-local, reserved, IPv6 local, IPv4-mapped), connection pinned to the checked address (`lookup`), redirects re-checked (max 3), 10 s, 2 MB, `Accept-Encoding: identity`, HTML only. Unit-tested with a fake resolver and transport; e2e only covers refusals (no internet in tests).
- `recipes.has_steps` (computed on every save) gives `incomplete` ("to complete") in lists and details.
- Zod, `zod-config.ts` and `packages/shared` are forced into one chunk (`vite.config.ts`, `advancedChunks`): split across chunks, shared schemas were created before `jitless` was set and Zod's eval probe broke the CSP. The e2e CSP test visits every page, lazy ones included.

## AI prompts and translations (phase 5b)

- Prompts are generated in `packages/shared/src/prompts/` (`importPrompt`, `translationPrompt`), FR/EN after the interface language, never written in the UI. The import prompt lists the units (first alias in the output language) and the tag slugs of the database, and includes `promptExample(lang)`: `EXAMPLE_RECIPES` in canonical form (current `format:`), tested to parse without any diagnostic. `extractMarkdownBlock` reads an AI answer (its longest code block, else the whole text).
- "Import with an AI" is the AI tab of the import page (`/recipes/import/ai`): the answer goes through the same preview and "Validate tags" step as any import; the recipe language select is the output language.
- Translations: `PUT` / `DELETE /api/v1/recipes/:id/translations/:lang` (owner, never the base language: 400 `base_language`). A translation is the full document; servings, source and tags stay the recipe's (a `tags:` line is ignored). Structure differences (`checkTranslationStructure`) are warnings returned with the save, never a refusal. Saving a translation does not change `recipes.updated_at` (no editor conflict).
- `GET /api/v1/recipes/:id?lang=` and `POST /shared { lang }` return that translation if it exists, else the base language; `RecipeDetail` has `lang` (shown), `baseLang` and `languages`. The editors always load the base language (no `lang`). The recipe page reads `?lang=` once, then the interface language; switching is local state (the share link keeps its token in the fragment). "Add to my library" copies the translations. Lists, search and exports stay in the base language.
- `/recipes/:id/translate/:lang` (lazy): prompt, pasted answer previewed live with parser and structure diagnostics (`model/translation.ts`), an existing translation preloaded for hand corrections, delete with confirmation.

## Cooking mode (phase 6)

- Tables `cook_sessions` (one active per user: partial unique index on `user_id` where `ended_at` is null; `state` JSONB, `version` +1 per save) and `timers` (mirror of the state's timers for the phase 8 scheduler; primary key `(cook_session_id, id)` because timer ids come from the client; a changed `ends_at` resets `notified_at`). Module `modules/cooking`; shared schemas in `packages/shared/src/cooking.ts` (`cookStateSchema`: items `{ recipeId, lang, servings, currentStep, checkedIngredients, color }`, timers `{ id, recipeId, recipeTitle, label, durationSeconds, endsAt, step, slot }`).
- API: `GET` / `PUT` / `DELETE /api/v1/cook/session` (signed in). Every event sends the **whole state**; the last save wins. Every answer has `serverNow` (clock offset). The server refuses an `endsAt` more than a day in the past or beyond the longest timer (`invalid_timer`). The state only holds the user's own choices: recipes are read through the recipes API.
- Web (`features/cooking`, route `/cook`, lazy): `model/sync.ts` (`createCookSync`: local copy applied at once, sent after; a `dirty` change survives network cuts and reloads and is sent first; without pending change the server's state wins; a 400/422 drops the change), `model/store.ts` (one sync per user, cleared at sign-out with the local copies), `model/session.ts` (pure updates: `startRecipe`, `goToStep`, `toggleIngredient`, `startTimer`, `extendTimer`, `removeTimer`…), `model/steps.ts` (global step and ingredient indexes), `model/clock.ts` (offset, countdown), `model/alarm.ts` (Web Audio beeps + vibration, unlocked when a timer starts), `model/wake-lock.ts`.
- Started from a recipe page (`/cook?recipe=…&servings=…&lang=`): phase 6 has one recipe per session; another recipe asks to replace it. A recipe without steps cannot be cooked; an unlisted recipe of someone else is cooked from the reader's library. Changing language while cooking is only offered when `checkTranslationStructure` finds nothing.
- Ending a session deletes its row (and timers). Timer names come from recipe texts: cleaned with `cookText` (shared). Phase 8: notify with `timers.recipe_title` / `label`, never a title looked up through `recipe_id` (not checked against access), and skip disabled users.
- Timers: a step's timer button starts it once (`step` + `slot`), `+1 min` from the end (or from now once finished), cancel, finished ones ring once while the page is open and stay until dismissed. Remaining time is always computed from `endsAt` and the corrected clock.

## Accounts (phase 3)

- **Better Auth** (`apps/server/src/modules/auth/auth.ts`) handles sessions, sign-in (email or username), sign-out and password changes, mounted at `/api/v1/auth`. Only an **allowlist** of its routes is reachable (`auth.controller.ts`); `update-user` only accepts `name` / `locale` (`updateProfileInputSchema`). Its own sign-up is disabled.
- **Accounts are created only from an invite** (`POST /api/v1/register`): one transaction locks the invite row, creates the user and its credential account, marks the invite used, then the user is signed in through Better Auth. The first-admin setup link is an admin invite without creator, created at startup while no enabled admin exists.
- Link tokens (invite, setup, password reset): 256-bit, stored as SHA-256 hashes, carried in the URL **fragment** (`#token=…`, never in server logs) and checked with `POST` routes.
- No email: password reset links are created by an admin (Users page) or the rescue CLI (`node dist/cli.js admin:reset-link <username>`, `setup-link`, `rate-limits:clear`). A new link, a used link or a password change invalidates the user's other links.
- Disabled accounts: sessions deleted, sign-in refused with the generic invalid-credentials error, `c.var.user` is null even if a session survived. The last enabled admin cannot be disabled or deleted (checked in the same transaction, under an advisory lock).
- Rate limiting: our own DB-backed fixed windows (`modules/rate-limit`), per IP and per account on sign-in, per IP on register / reset / link checks. Better Auth POST routes only accept JSON (the per-account limiter reads it).
- Every `/api` answer is `Cache-Control: no-store`. The SPA resets its query cache on sign-in, sign-up and sign-out. Zod runs `jitless` in the browser (`src/zod-config.ts`, imported first): its eval probe would break the CSP. Client IP from `X-Forwarded-For` only with `TRUST_PROXY=true` (one proxy).
- **2FA and passkeys (phase 3b)**: Better Auth plugins `twoFactor` (TOTP + 10 backup codes, password required to turn on/off) and `@better-auth/passkey` (rpID = hostname of `ORIGIN`, user verification required, discoverable credentials). Every Better Auth POST route taking input has a strict shared body schema (`BODY_SCHEMAS` in `auth.controller.ts`). Adding a passkey (`POST …/passkey/generate-register-options`, our wrapper of Better Auth's GET) and deleting one require the password; `freshAge` is 0. `GET /api/v1/me/security` (module `account-security`) lists the 2FA status and passkeys. A password reset link also turns 2FA off and deletes passkeys. Front: `features/account` (Security page: 2FA, passkeys, password), login with a code step, a passkey button and passkey autofill (`@simplewebauthn/browser`). E2E: `totpCode(secret)` and `addVirtualAuthenticator(page)` in `e2e/support.ts`.
- Environment: `ORIGIN` (required; also the CSRF origin), `BETTER_AUTH_SECRET` (≥ 32 chars, the dev example is refused with an https origin), `ADMIN_EMAIL`, `TRUST_PROXY`, `RATE_LIMIT_FACTOR` (tests only).

## Security checklist

argon2id; httpOnly/secure/sameSite cookies; Hono `csrf` middleware + `Origin` check on state-changing requests; DB-backed rate limiting on login/signup/reset; tokens ≥128 bits, invites & resets stored hashed; server-side authorization on every route; sanitized markdown output, no `javascript:` links (recipe `source` rendered as a link only for `http(s):` URLs, otherwise as text); **SSRF protection** on URL import (block localhost, RFC1918, local IPv6, redirects; check after DNS resolution; timeout; size limit); strict CSP compatible with the service worker; no sensitive data in logs. Validate **every** API input with a shared Zod schema. Bound untrusted input: Hono `bodyLimit` from the first route that accepts a body, `max()` on every string (markdown fields included), per-file and total limits on zip imports, `File.size` checked before reading uploads in the browser; parser output (diagnostics) is bounded too; documents are capped by `MAX_RECIPE_MARKDOWN_LENGTH` (shared, also used in the API schemas). Rendering recipe content (all parsed fields are untrusted): no raw HTML (`rehype-raw` / `allowDangerousHtml` forbidden), URL scheme allowlist (`http`, `https`, `mailto`, relative) applied to links, reference definitions and autolinks; `timer:` / `q:` links become components, never an `<a href>`; images in recipe markdown disabled or limited to `'self'` by the CSP; title, group names and `extraMeta` rendered as text.

## Phases

1. **Foundation** — monorepo, Hono + Drizzle + Postgres, React + Vite SPA, `docker-compose.dev.yml`, single-image Dockerfile, `/healthz`, i18n, mobile-first layout, Prettier + ESLint + Husky pre-commit hook. _`docker compose up` serves API + SPA with migrations applied._
   Order: Drizzle → front stack (Tailwind, shadcn/ui, Router, TanStack Query, i18n, layout) → Playwright smoke test → **v0.1 release**: image `shiyamii/cookit` (amd64) pushed to Docker Hub only from a version tag or a release branch, with automated versioning including release candidates (semantic-release, see "Releases" below).
2. **Markdown parser + scaling** (pure module, no UI) with canonical serializer and round-trip tests. Units come from a catalog passed as a parameter (default catalog in `packages/shared`, FR + EN).
3. **Accounts & invitations** — Better Auth, admin bootstrap, invites, admin pages, rate limiting.
   3b. **2FA & passkeys.**
4. **Recipes** — first set up **web unit tests** (`bun test` on the pure logic of `apps/web/src/features/*/model/`, resolving the `@/` alias), then CRUD, visual + markdown editors (lossless switch), visibilities, public gallery, "add to my library", search.
   4b. **Categories, tags & units** (admin pages; `units` table seeded from the shared catalog).
5. **Creation & import/export** — quick create, wizard, markdown import, `.md`/zip export, URL import (JSON-LD) with SSRF protection.
   5b. **AI prompts** — import and translation prompts generated from code.
6. **Single-recipe cooking mode.**
7. **Multi-recipe sessions.**
8. **Web Push** — service worker, subscriptions, server scheduler (`FOR UPDATE SKIP LOCKED`), dead subscription cleanup, iOS help page.
9. **PWA & polish.**
10. **Deployment & docs** — Coolify README, Playwright critical path, security review.
11. **Optional** — SSE sync, backward planning, parallel tracks, Cooklang import, Capacitor Android, optional email (SMTP: send invites, self-service password reset; never required), built-in AI.

## Commands

Keep this section in sync with the root `package.json` scripts.

```sh
bun install                                        # install all workspaces (+ Husky hook)
docker compose -f docker-compose.dev.yml up -d db  # Postgres only, for local dev
bun run dev                                        # server (tsx watch, :3000) + web (Vite, proxies /api)
docker compose -f docker-compose.dev.yml up --build  # full stack from the production image
bun test                                           # unit tests (pure logic, shared + server services + web models)
bun run typecheck                                  # tsc in every workspace
bun run lint                                       # ESLint
bun run format                                     # Prettier (write); format:check to verify
bun run build                                      # build web, then bundle server for Node
bun run start                                      # run the built server under Node
bun run parse <file.md> [--servings N] [--lang fr|en] [--json | --canonical]  # what the recipe parser reads
node apps/server/dist/cli.js admin:reset-link <username>  # rescue CLI (in the container: node dist/cli.js …)
```

Example recipes live in `packages/shared/src/recipe/fixtures/` (excluded from Prettier, kept exactly as written) and are parsed by `fixtures.test.ts`.

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

The global setup (`e2e/global-setup.ts`) gets the test admin `e2e_admin` in through the rescue CLI run in the app container (`docker exec $E2E_CONTAINER node dist/cli.js …`, default container `cookit-app-1`, `cookit` in CI) and saves its session to `e2e/.auth/admin.json` (`test.use({ storageState: ADMIN_STATE })`). Tests must be rerunnable on the same database: unique usernames (`uniqueName`), never sign out, disable or delete `e2e_admin`. The dev compose and CI set `RATE_LIMIT_FACTOR=50` so that the suite (one IP) does not hit the rate limits; never set it in production.

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
