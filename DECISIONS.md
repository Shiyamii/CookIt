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
- **Production compose in `deploy/`** (not `docker-compose.yml` at the root): a bare `docker compose up` in the repo must not start the production image instead of the dev stack. Postgres is not published on the host, `POSTGRES_PASSWORD` is required (compose refuses to start without it).
- **Released version read from `@semantic-release/exec`** (`publishCmd` writes `version=…` to `$GITHUB_OUTPUT`): guessing it from the tags on `HEAD` picked `v0.1.0-rc.1` over `v0.1.0` (`sort -V`) when the RC commit was promoted, so `0.1.0` was never pushed.
- **Manual `workflow_dispatch` on the Release workflow**: republishes the image of an existing tag (checks out `vX.Y.Z`, already tested when it was released) without creating a new version.
- **Frontend MVVM by domain** (`features/<domain>/{model,viewmodels,views}`), **backend controller / service / repository by domain** (`modules/<domain>/`): required by the project owner. Layer boundaries enforced by `@typescript-eslint/no-restricted-imports` (type-only imports allowed), so the rule holds without review.
- **Hand-written factories + composition root in `src/app.ts`** (no DI container, no classes): dependencies stay explicit and services are unit-testable with in-memory fake repositories.
- **Theme store split**: the model (`features/preferences/model/theme.ts`) exposes `getTheme` / `subscribeTheme` / `setTheme` without React; the ViewModel wraps it with `useSyncExternalStore`.
- **Units in the database** (`units`, aliases JSONB per language), seeded from a default catalog in `packages/shared`: writings vary (`c. à soupe`, `CaS`, `tbsp`…) and languages will be added, so the admin edits them without a release. The parser stays pure and takes the catalog as a parameter.
- **Markdown parser: block structure parsed line by line, inline content (links `timer:` / `q:`) with remark (`mdast-util-from-markdown`)**: a standard markdown parser reads `text\n---` as a setext heading and drops layout, while the format needs its own separator rules and must never lose a line.
- **Parser input normalized to Unicode NFC** (with CRLF/CR → LF and the BOM removed): text pasted from macOS writes `é` as `e` + combining accent, which would otherwise not match `étiquettes:`.
- **Parser regexes anchored, without lazy groups before `$`; trimming done in code**: `(.*?)[ \t]*$` backtracked quadratically (seconds on one line of 50k spaces), blocking the single Node process. A test enforces a time budget on 200k-space lines.
- **Diagnostics capped at 50 per code** (then one `diagnostics_truncated` with the count) and echoed values truncated to 80 characters: a hostile document cannot produce an unbounded error list.
- **Part 1 metadata: a block is metadata only if every line is `key: value` outside code blocks**; unknown keys are compared case-insensitively but accents matter (`côte` ≠ `cote`); `extraMeta` has no prototype (keys like `toString` stay plain entries). A leading `## …` heading before the title is ignored, as in parts 2 and 3.
- **`MAX_RECIPE_MARKDOWN_LENGTH` = 200 000 characters**, checked first in `splitParts` (`document_too_large`), before NFC normalization: bounds parsing time and output size on the single Node process. The API schemas reuse the constant.
- **Parts 2 and 3 parsed by one list parser**: `-`, `*`, `+`, `1.`, `1)` items (the numbers written are ignored, steps get a global index), a line directly under an item continues it (trimmed), headings close an item, anything else is kept as a text item. An explicit empty `###` is a group named `''`, distinct from the leading group without heading (`undefined`), so the serializer can write it back.
- **Unit matching**: longest alias over up to 5 words after the quantity, whole words only; a regular plural (final `s`) matches without being listed; a unit word with nothing after it (`3 gousses`) is the ingredient itself, not a unit. The parser takes the catalog as a parameter (`unitIndex` cached per catalog array: the server must pass a new array after an admin edit).
- **Quantities**: `1.5` and `1,5`, `1/2`, vulgar fractions, mixed numbers, ranges with `-`, `–`, `à`, `to` (the separator text is kept when scaling). Numbers written in words (`une pincée`) are never scaled, as the spec says.
- **Inline links parsed with `mdast-util-from-markdown`** (remark's parser, no `unified` pipeline needed): code spans and escapes are respected, text segments stay exact slices of the source. Bundled into the server build (it is a dependency of `packages/shared`, not of the server). Tree walks are iterative (deep nesting cannot overflow the stack).
- **A final newline ends the last line** (`toLines('a\n')` is `['a']`): otherwise every canonical export (which ends with a newline) added an empty line, which matters inside an unclosed code block.
- **Canonical serializer**: description always written as a quote (so it can never be read as metadata or a separator), keys in the recipe language (`portions` / `servings`), `format:` always written, `tags:` only on request (exports). Parts that would start with a `##` or dash text line get an ignored `## Ingrédients` / `## Étapes` heading first. Checked by a 500-document round-trip test (plus a one-off 20 000-document stress run, 0 failure).
- **Translation structure check** compares servings, group counts, items per group and timer durations per step (text items and names ignored); warnings only, as the spec says.
- **Inline parsing restricted to links** (micromark constructs `attention`, `autolink`, `blockQuote`, `list`, `labelStartImage`, headings, HTML… disabled), **skipped when a step has no `](`**, and **capped at `MAX_INLINE_LENGTH` = 5 000 characters per step** (longer: text + `step_too_long` warning). Measured under Node: one 200 KB step of `a* a* …` took 45 s with full CommonMark (emphasis resolution is quadratic), nested `![` 11 s for 40 steps; now every hostile case of a maximum-size document stays under ~0.6 s. Consequence: markup inside a `q:` link text (`[**2** tbsp](q:)`) is an invalid quantity; `![x](timer:1m)` stays text.
- **`timer:` / `q:` schemes are case-insensitive; `q:` followed by anything is reported** (`invalid_quantity`) rather than silently left as a link.
- **Inverted or equal ranges (`3-2`, `2-2`) are not quantities**: scaling one bound only would print nonsense; the line stays as written. `a` (without accent) and `—` are range separators too.
- **A unit at the end of the line (`250 g`, `3 gousses`) is kept** for its rounding (`decimal` for grams), and also used as the name.
- **The serializer flattens line breaks in single-line fields** (title, source, tags, extra metadata, group names, text lines): they come from database columns too, and a line break must never add a separator or a metadata line to an export. The API schemas must still refuse them (phase 4).
- **`scaleFactor` returns 1 for anything but whole servings from 1 to 1000**, and number formatting falls back to French for an unknown locale (one cached `Intl.NumberFormat` per locale).
- **Translation check ignores a leading text-only group** (a note before the first `###`).
- **better-auth pinned to 1.7.7 exactly** (not the latest 1.7.12, published the day phase 3 started): it fixes the critical advisories of September 2026 and has been out for 3 weeks. Telemetry explicitly disabled (off by default). Bump deliberately, reading the advisories.
- **Better Auth tables written by hand in Drizzle** (`modules/auth/auth.schema.ts`), checked field by field against `getAuthTables()` of the installed version (core + `username` plugin + our fields `role`, `locale`, `disabledAt`), instead of the Better Auth CLI (`@better-auth/cli` lags behind at 1.4). Columns in snake_case, CHECK constraints on `role` and `locale`.
- **Ids are UUIDs generated in code** (`advanced.database.generateId: () => crypto.randomUUID()`): Better Auth's `'uuid'` mode leaves the id to a database default, which our text columns do not have, and our own services insert users too.
- **Registration is our own route**, not Better Auth's sign-up with a hook: the invite must be consumed in the same transaction as the account creation (row lock), which Better Auth's adapter cannot share. The password is hashed with the same argon2id function Better Auth is configured with; the user is then signed in through `auth.api.signInUsername`.
- **Better Auth behind an allowlist** (`auth.controller.ts`): only the routes we use are reachable; `update-user` restricted to `name` / `locale` (a `displayUsername` or `username` change would let a user impersonate another). Better Auth's own rate limiter is disabled in favour of ours (database-backed, shared by every auth route, no concurrency advisory).
- **No email sending**: invites and password resets are links handed over by the admin; the rescue CLI covers a locked-out admin. Reset links last 3 days, the first-admin link 24 hours (plan), invites 7 days by default (1-90).
- **Link tokens in the URL fragment** (`#token=…`) and checked with POST: proxies log paths and query strings, never fragments.
- **The first-admin setup link exists while no _enabled_ admin exists**: if every admin ended up disabled, restarting the app gives a way back in. Disabling/deleting the last enabled admin is refused, atomically (advisory lock).
- **A disabled account gets the same sign-in error as a wrong password**: a distinct message would confirm that a leaked password is right.
- **Known trade-offs**: an invited person can learn whether a username or email is taken (needed to sign up, invitees are trusted); the per-account sign-in limit (10 per 15 min) lets someone lock a known username out for a while.
- **`RATE_LIMIT_FACTOR`** (default 1) multiplies every limit: the end-to-end suite runs from one IP; only the dev compose and CI set it (50).
- **CSRF**: our own check (`http/security.ts`): a state-changing `/api` request needs `Origin` = `ORIGIN` (or `Sec-Fetch-Site: same-origin` without Origin), whatever the content type; Better Auth also checks its trusted origins.
- **Strict CSP from now on** (`default-src 'self'`, inline styles allowed for Radix positioning, `data:` fonts for Vite-inlined subsets).
- **E2E admin through the rescue CLI** (`docker exec … node dist/cli.js setup-link | admin:reset-link e2e_admin`): no test-only backdoor in the app; the suite reruns on the same database.
- **Better Auth POST routes accept JSON only** (415 otherwise): Better Auth also takes form bodies, which our per-account sign-in limiter (reading JSON) would not count.
- **`Cache-Control: no-store` on every API answer**, and the SPA resets its query cache on sign-in / sign-up / sign-out: no private data of a previous user from a cache.
- **Link token removed from the address bar once read** (`useLinkToken`): an opened but unused link does not stay in the browser history.
- **Zod `jitless` in the browser**, configured in the very first imported module: Zod's `new Function()` probe would violate the CSP on every page load.
- **`rate-limits:clear` rescue command**: unlocks someone locked out by the per-account limit; the e2e global setup also uses it, so reruns from one IP never hit stale counters.

## Phase 3b: 2FA and passkeys

- **Better Auth plugins `twoFactor` (core) and `@better-auth/passkey` 1.7.7** (pinned like better-auth; passkeys moved to their own package in 1.4). Front: `@simplewebauthn/browser` (WebAuthn ceremonies, what Better Auth's client uses) and **`uqr`** (zero-dependency QR encoder, drawn as one SVG path: no `innerHTML`, CSP-safe). No Better Auth client: the SPA calls the routes through `src/lib/api.ts` like the others.
- **Passkey user verification required** (PIN, biometrics), checked server-side in the plugin's `afterVerification` hooks: Better Auth accepts possession only, but a passkey replaces the password here. Discoverable credentials required (sign-in without a username, browser autofill).
- **`rpID` and expected origin derived from `ORIGIN`** instead of the `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` variables of the plan: one less setting that could disagree with `ORIGIN`; the RP name is `CookIt`.
- **Passkey sign-in skips the TOTP step**: a user-verified passkey is already two factors (device + PIN/biometrics), as the plan's criterion "passkey seule" says.
- **No "trust this device" option** for 2FA (`trustDevice` refused by the strict body schema): every password sign-in asks for a code.
- **Strict body schemas** for every Better Auth POST route that takes input (`BODY_SCHEMAS` in `auth.controller.ts`): unknown fields (`issuer`, `method`, `trustDevice`, `disableSession`…) never reach Better Auth. Better Auth's `list-user-passkeys` is not exposed: `GET /api/v1/me/security` returns the 2FA status and passkeys without key material.
- **A password reset link turns 2FA off and deletes passkeys** (same transaction as the new password): it is the recovery path when the phone and the backup codes are lost (plan §5.1 bis). The reset page says so before the user confirms.
- **"An account keeps a sign-in method"**: every account has a password (created at sign-up, never removable), so deleting passkeys is always allowed; the server still refuses to delete the last passkey of an account without a password (`last_sign_in_method`).
- **Adding or deleting a passkey asks for the password** (security review): a passkey skips the 2FA step and survives "sign out everywhere", so a stolen session alone must not plant one (or remove the owner's). Better Auth's `generate-register-options` is a GET without body: we expose it as a POST that checks the password, then calls Better Auth; its challenge is the only one `verify-registration` accepts. Better Auth's "fresh session" rule is turned off (`freshAge: 0`): the password replaces it.
- **2FA lockout: 5 wrong codes lock 2FA for an hour** (Better Auth default: 10 per 15 minutes, which resets after each lock): someone holding the password gets about 120 guesses a day whatever their IP.
- **Rate limits**: 2FA code checks 20 per 15 minutes per IP (on top of the lockout and Better Auth's 5 tries per sign-in challenge); passkey sign-in 60 per 10 minutes per IP; routes that check the password (change password, 2FA on/off, new backup codes, add/delete a passkey) share 10 per 15 minutes per IP.
- **The anonymous `generate-authenticate-options` GET refuses `Sec-Fetch-Site` other than `same-origin`**: it writes a challenge, and `sameOrigin` only covers state-changing methods. Expired Better Auth `verification` rows (2FA and passkey challenges) are deleted hourly with the rate-limit counters.
- **Turning 2FA on signs out the other devices** (the SPA calls `revoke-other-sessions` after the first code): 2FA often follows a doubt about the password.
- **WebAuthn answers have a strict shared schema** (shape and sizes; the cryptographic checks stay in @simplewebauthn), so a malformed `id` never reaches the database.
- **Changing `BETTER_AUTH_SECRET` breaks 2FA**: TOTP secrets and backup codes are encrypted with it; users would need a password reset link.
- **Known limit**: a TOTP code can be reused while it is accepted (about 90 seconds: Better Auth allows one 30-second step of clock drift each way and keeps no used-code list); the password is still required with it.
- **The security page includes the password change** (the route existed since phase 3, without UI).

## Phase 4: recipes

- **Web unit tests** on `model/` only (no DOM library): `apps/web/tsconfig.test.json` adds Bun's types for test files only; `bun test` from the root resolves `@/` through a second `paths` entry (`./apps/web/src/*`), since Bun resolves paths from its working directory (`baseUrl` is deprecated in TypeScript 6, a preload plugin's `onResolve` was not applied).
- **Both editors edit the same text**: the visual editor keeps each ingredient or step as written (`raw`) and only shows derived fields (quantity, unit, rest; timer chips), so switching is the canonical serializer and nothing else. Ingredient fields keep what is typed locally and rebuild the line (otherwise text would jump between fields while typing).
- **Timers in the visual editor**: a text field per step with the timers and adjustable quantities as chips under it (edit, remove), "Add a timer" inserted at the cursor, "Adjustable quantity" on the selection. No rich text editor (plan: "une interface structurée suffit"). The timer form is an inline panel (no modal: better on phones).
- **dnd-kit** (`@dnd-kit/core` + `sortable`) for drag and drop of groups and rows (a row can go to another group), with "move up / down" menu items as the keyboard and screen-reader alternative.
- **CodeMirror without `@codemirror/lang-markdown`**: it pulls the HTML, CSS and JavaScript languages; a 40-line line highlighter covers the format (separators, headings, timer and quantity links, lines with errors). Versions pinned at least two weeks old. The editor page is lazy-loaded (CodeMirror + dnd-kit: ~110 kB gzip, only for editing).
- **Markdown rendering from the syntax tree** (`mdast-util-from-markdown`, already used by the parser) instead of react-markdown: no HTML string, link scheme allowlist, images as text, iterative text extraction (deeply nested hostile input).
- **Share links in the URL fragment** (`/shared#token=…`) like invites, but the token stays in the address (a share link is reopened and bookmarked). It only works while the recipe is unlisted; leaving "unlisted" deletes it, so going back gives a new link (security review: a leaked link can always be cut off). Stored in plain text: the owner must be able to copy it again.
- **`copied_from_id`** on recipes (not in the plan): "add to my library" remembers the original (no foreign key: the copy outlives it).
- **Search**: `search_text` = title + description + ingredients with accents removed in code (Postgres `unaccent` is not immutable, so not usable in a generated column), indexed by a generated `tsvector` (French, English or Hungarian stemming per translation); each searched word is a prefix, all required.
- **Optimistic concurrency** with `baseVersion` (the recipe's `updatedAt`): a save from a stale editor (another tab, another device) is a 409 with a "load the latest version" action, instead of silently overwriting.
- **No cover image yet** (decided with the user: later phase, images need storage in Postgres and resizing). No tags (phase 4b) and only the base language (translations came in phase 5b).
- **Deleting a user deletes their recipes** (cascade) for now; the plan's "choice of what happens to their recipes" comes with the admin pages of a later phase.
- **Known limit**: CodeMirror on Android handles Enter through the real keyboard's input events, which Playwright's mobile emulation does not produce; the markdown editor is tested on desktop for typing.

## Phase 4b: categories, tags and units

- **Starting data inserted at startup, once** (`seeds` table) rather than in a SQL migration: the catalogs stay defined once, in `packages/shared` (also used by the parser tests); a restart never recreates what the admin deleted. Advisory lock against two instances starting together.
- **Starting categories**: dish type (one tag per recipe), diet and cuisine (several). The admin changes this with the "multiple" option.
- **`recipe_tags` in the recipes domain**: tags are written in the same transaction as the recipe save; the tags service only checks the selection. A save without `tagIds` leaves the tags as they are.
- **A category must be empty to be deleted** (`on delete restrict`): its tags are moved (edit → category) or deleted first, each with its own confirmation. Deleting a used tag needs a confirmation or a merge into another tag (its recipes get that tag; merging into a single-choice category is not re-checked).
- **Units and tags catalogs are public read-only routes**: public recipes are read and scaled without an account. Cached by the services (one process) and by the front (5 minutes, refreshed after admin edits).
- **Admin ordering with up/down buttons** (no drag and drop on admin pages): short lists, and it keeps dnd-kit in the editor chunk only.
- **Tag pickers as toggle buttons** (`aria-pressed`) for single and multiple categories; a single-choice category replaces the previous tag. A filter on an unknown tag slug matches nothing.

## Phase 5: creation, import and export

- **fflate** (zero dependency, ~8 kB used) for zips: built by the server for "export all", read in the browser for imports (lazy-loaded). Zip limits are checked from the declared sizes before inflating (no zip bomb).
- **Imports are parsed and previewed in the browser**, then saved one recipe at a time through the existing `POST /recipes/markdown` (with the validated `tagIds`): no bulk import route to secure, the server still parses and checks everything.
- **Import by URL fetched with Node's `http`/`https` and a pinned `lookup`** (no new dependency): the address checked after DNS resolution is the one connected to, so DNS rebinding cannot switch it to an internal one. Standard ports only, no compression accepted. The fetch function takes an injectable resolver and transport for unit tests; e2e tests only check refusals (no internet).
- **The recipe language of an import is chosen on the import page** (default: the interface language): files do not carry it.
- **Missing servings in a web page are not invented**: the document has no `portions:` line, the preview shows the error and the user fills it in.
- **"To complete"** is a stored flag (`recipes.has_steps`, computed on every save; existing recipes filled by the migration from their body).
- **Single export built in the browser** (the page already has the recipe and the tag catalog); "export all" on the server (one request, no N fetches).
- **An empty part gets one empty line in the visual editor** (quick creation: something to type into); empty lines are never saved.
- **Zod and shared code in one chunk** (Vite `advancedChunks`): with code splitting, the shared schemas were created before `jitless` was set, and Zod's `new Function` probe was reported by the CSP on every page.
- **Untrusted page content is processed in linear time** (security review): a web page given to the import reaches shared code on the server, so group headings are detected with string checks (no backtracking regex: a line of 100 000 spaces took hours), JSON-LD blocks are found with an `indexOf` scan, and every text is bounded before any regex. Hostile inputs of that size now take a few milliseconds.
- **SSRF hardening**: every IPv6 address whose first 64 bits are zero is refused (all forms embedding an IPv4 address), zones (`%eth0`) are stripped before checking, DNS resolution counts in the 10 s limit, refused responses are destroyed (not drained), and only our own error codes reach the client. Bun's `BlockList` panics on some overlapping IPv6 subnets: the zero-prefix rule is plain code.

## Phase 5b: AI prompts and translations

- **The prompt example is a real recipe parsed and re-serialized** (`promptExample`): the AI always sees the canonical form of the current format version, and a test parses the example taken out of each generated prompt. Its tags are taken from the database list (suitable ones if present), so the AI is never shown a tag that does not exist.
- **The prompt is in the interface language; the recipe language is chosen separately** (the import page's language select): someone using the app in French can ask for an English recipe.
- **AI answers are read from their longest code block**, or the whole text without one: assistants often add a sentence before or after.
- **Translations are saved even when their structure differs**, with the warnings shown again after saving (plan §4); the cooking mode will decide on switching languages.
- **A translation is the full document**, edited in the translation screen (a text area preloaded with the saved translation), not in the visual/markdown editors, which keep editing the base language. Servings, source and tags are the recipe's.
- **Saving a translation does not touch the recipe's `updated_at`**: an editor open on the base language would otherwise get a false conflict. No `baseVersion` on translations (a replacement is explicit and rare).
- **Lists, search and "export all" stay in the base language** for now; a single `.md` export is in the language shown. Importing files creates base-language recipes only.
- **The chosen reading language is local state, not a URL change**: `/shared#token=…` keeps its token in the fragment, which a search-parameter navigation would drop. `?lang=` is only read when the page opens (links after saving a translation).

## Phase 6: cooking mode (one recipe)

- **The whole state is sent at every event** (`PUT /cook/session`), not a list of operations: simple, idempotent, and "the last change wins" is just the last save. The server increments `version`.
- **Timers live in the state and are mirrored into `timers`** at every save (deleted when removed from the state): one sync mechanism for the client, and the table the phase 8 scheduler needs. Timer ids are generated by the client (timers can be started offline), so the primary key includes the session.
- **Timers started offline use the device clock** corrected by the last known offset; the server only refuses impossible end times (more than a day in the past, beyond the longest timer).
- **A finished timer stays until dismissed** ("OK"); a cancelled or dismissed one leaves the state. No `status` in the state: finished is computed from `endsAt`.
- **Local copy in `localStorage`** (per user, cleared at sign-out): a pending change is sent first on load, on `online` and when the page becomes visible again; otherwise the server's state is taken (another device). A change the server refuses as invalid is dropped; a 401 or a network error keeps it.
- **One recipe per session in phase 6**: starting another recipe asks whether to replace the current one (phase 7 will add instead).
- **Alarm sound generated with Web Audio** (no file to cache or serve), unlocked by the tap that starts a timer; vibration where supported.
- **Cooking requires reading the recipe by id** (owner, public, or added by link): an unlisted recipe of someone else is cooked once added to the reader's recipes, so the share token never has to be stored in the session.
- **Ending a session deletes it** (timers included, by cascade) instead of setting `ended_at`: nothing reads ended sessions, and a loop of start/stop would make the table grow (security review). `ended_at` stays in the schema, as in the plan, for a possible history.
- **Timer names are cleaned, not refused** (`cookText`): they come from recipe texts written by anyone; control, bidi and line separator characters become spaces, and the text is cut by code points (a cut emoji would be refused by Postgres).
- **For phase 8**: the scheduler must use `timers.recipe_title` / `label` (the user's own copy), never look a title up through `recipe_id` (it is not checked against recipe access); disabled users' timers must not be notified.
- **shadcn `sheet` and `checkbox` added** (ingredients drawer; same Radix package as the other components).

## Phase 7: multi-recipe sessions

- **Up to 5 recipes at once** (`MAX_COOK_ITEMS` = the 5 theme chart colors): each recipe keeps a color of its own, so timers stay told apart by color as well as by name. A sixth recipe is refused with a message rather than reusing a color.
- **The shown recipe is a choice of the device**, kept in localStorage (`cookit:cook:active:<user>`, cleared at sign-out), not in the server state: switching tabs is not an event of the session (plan §5.3 lists the events to save), and two devices can each follow a different recipe.
- **A new color is the first one not used** by the session, so removing a recipe frees its color.
- **"Finish" on the last step takes that recipe out** of the session (with its timers); with a single recipe it ends the session as before. "Stop cooking" always ends the whole session.

## Phase 8: Web Push

- **Push endpoints limited to the browsers' push services** (FCM, Mozilla, Apple, Windows), https on the default port: a subscription is a URL the server will POST to, so any other host would be an SSRF. A browser with another push service would be refused (`unsupported_push_service`).
- **`web-push` builds the request, our `fetch` sends it** (`generateRequestDetails`): timeout, no redirects, and the plain-http test sink of the e2e tests works (the library's transport is https only).
- **Claim, commit, then send** (deviation from the plan's "lock, send, mark" in one transaction, after the security review): holding row locks during network sends blocked cooking saves on the same timers and, with the extra pool connections the sends needed, could freeze the server. Timers get a `claimed_at` lease (2 min): a crash before `markNotified` lets a later run send again (resent rather than lost). Sends have a 10 s timeout, batches are 50 timers, at most 10 per user and run.
- **Rate limits per account** on cooking saves (600 / 10 min), subscriptions (30 / 10 min) and test notifications: a user re-arming timers cannot make the server flood the push services (which would throttle the instance for everyone).
- **Timers that ended before the server knew them are not sent** (`ends_at <= created_at`: started and finished offline, the device rang itself). Timers of disabled users are marked without sending.
- **VAPID keys are optional**: without them notifications are off and the app works; both keys or neither, the dev pair refused for an https origin. Subject defaults to `mailto:ADMIN_EMAIL`, else the https `ORIGIN`.
- **TTL of 10 minutes**: a timer notification that could not reach the device by then is no longer useful.
- **Hand-written service worker** (`public/sw.js`) and a minimal manifest in phase 8: notifications need a service worker, and iOS only allows them in an app added to the home screen (`display: standalone`). Phase 9 (PWA, `vite-plugin-pwa`) will take them over with caching and icons.
- **The permission is read through the Permissions API** (`Notification.permission` as fallback): headless Chromium reports `denied` there even when granted.
- **Sign-out unsubscribes this browser** (server then browser) before signing out, so the next person on the browser never gets the previous account's notifications; a subscription re-sent by another account changes hands only with the same keys (the same browser): knowing someone's endpoint is not enough to take their notifications away. `PUSH_TEST_ENDPOINT_ORIGIN` is refused with an https `ORIGIN`.
- **E2E push sink + `PUSH_TEST_ENDPOINT_ORIGIN`** (tests only, like `RATE_LIMIT_FACTOR`): the real chain (scheduler, VAPID, encryption, HTTP) is checked by decrypting what the app sent; the restart criterion runs in a separate Playwright project after the others, since it stops the container.
- **`web-push` added** to the server (imposed by the plan; it brings `http_ece`, `jws`, `asn1.js`).
- **README configuration table**: the `WEBAUTHN_RP_ID` / `WEBAUTHN_RP_NAME` rows of the plan were removed: passkeys take their domain from `ORIGIN` (phase 3b), these variables do not exist.

## Phase 9: PWA and polish

- **`injectManifest` with our own service worker** (`src/sw/sw.ts`): the push handlers of phase 8 live with Workbox's precaching and routing in one file, typed. Registered by the app (no generated registration script) with `skipWaiting` + `clientsClaim`: a new version takes over at once; a page whose lazy chunk vanished after a deployment reloads once (`vite:preloadError`).
- **API reads cached for offline use, by allowlist** (`isOfflineApi`), network first: only what opening a recipe and cooking needs. The answers are private (the API says `no-store` to every other cache), so the `cookit-api` cache is deleted at sign-out, sign-in and sign-up, and by the service worker itself as soon as the session is gone (401, or `/me` with no user: expired, disabled account, password reset) — security review. A clear counter in the service worker drops answers of requests still in flight at sign-out. Kept 14 days at most. The cooking session is never cached by the service worker: a stale copy would be taken for the server's state; it has its own local copy (phase 6).
- **Icons drawn from the lucide CookingPot glyph** (ISC) on the theme's primary color, rendered by a tooling script with Playwright's Chromium: no image dependency, reproducible.
- **Workbox packages and `vite-plugin-pwa` are web dev dependencies** (bundled into `sw.js`), nothing added to the server image.
- **Static caching headers**: hashed `/assets/*` immutable for a year; `index.html`, `sw.js`, the manifest and icons `no-cache`, so updates are seen at once.
- **`robots.txt` disallows everything**: a self-hosted family instance is not meant to be indexed (public recipes are shared by link and the gallery).
- **Theme contrast fixes** (WCAG AA, Lighthouse): light `--muted-foreground` darker, dark `--destructive` lighter, `text-primary` no longer used for text (the tweakcn primary is a light sage).
- **Cooking mode on a phone**: "Remove from cooking" and "Stop cooking" moved to a menu ("⋯") next to the recipe title, the recipe cards use the full width; the notification notice puts its buttons under the text.
- **Lighthouse is run by hand** (`npx lighthouse`), not added to the repository: version 12 no longer has a PWA category; installability and offline use are covered by `e2e/pwa.e2e.ts`.

## Phase 9b: Hungarian

- **Added after phase 9, before deployment, at the user's request** (with images, a home page and later a shopping list: phases 9b–9e).
- **Informal "te" form** in the Hungarian UI, as most Hungarian apps; Hungarian quotation marks („…”).
- **Two new starting units**, common in Hungarian recipes: `dkg` (dekagramm, metric rounding) and `tete` (`fej`/`tête`/`head`, fraction rounding). `kk` (kávéskanál) is an alias of the teaspoon: scaling only needs the rounding, and Hungarian recipes use both words for the same spoon.
- **Canonical keys stay `source`, `format`, `tags`** in Hungarian (accepted as `forrás`, `formátum`, `címkék`); only servings has its own word (`adag`), like `portions` in French.
- **`hungarian-v1` seed** for existing instances (labels and aliases added where missing, new units and the `hongroise` tag created once), rather than editing `units-v1`/`tags-v1`, which already ran.
- **The migration drops and re-adds the generated `search` column** (drizzle-kit's way to change its expression), so it re-creates its GIN index by hand: the generated file lacked it.
- **Brave**: its push service is off by default and `subscribe` fails with a generic error; the app detects Brave (`navigator.brave`) and names the setting to turn on, and the help page has a Brave section. The browser's own error is logged to the console.

## Phase 9c: Images

- **Pictures in Postgres (`bytea`)**, chosen by the user over files or S3: one image + Postgres stays the whole deployment and the database backup covers them. Sizes are kept small by resizing in the browser (≤ 1600 px, ≤ 700 kB; thumbnail ≤ 480 px; avatar ≤ 256 px), so rows stay reasonable.
- **No image library on the server** (sharp is a heavy native dependency): the browser resizes and re-encodes, the server only reads the header (type, dimensions) to refuse non-pictures, SVG and pixel bombs. The browser makes the thumbnail too (one multipart upload).
- **Served outside `/api`** at stable URLs (a new picture gets a new id) so the browser and the service worker can keep them: what the user asked for ("like static files", no base64 in JSON).
- **Unlisted recipes' photos are readable by anyone with their URL**: an `<img>` cannot carry the share token (it stays in the fragment); the random UUID is only given with the recipe, so it acts like the share link. A new share link gives the photos new ids, so revoking a leaked link also cuts off its photo URLs.
- **Caching**: only pictures anyone may see are cached for a year (`private`: never in shared caches); session-dependent ones are revalidated (`no-cache` + ETag). The service worker reads pictures network first (a revoked photo disappears as soon as there is network) and its picture cache is cleared at sign-out like the API cache; the browser's own HTTP cache is not (it only holds pictures that browser was allowed to see).
- **Cover = first photo** (no separate column): one ordered list, "make cover" moves a photo first.
- **Photos are not exported** in `.md`/zip (the format is text; the export stays importable anywhere).
- **Storage cap of 500 MB of photos per user** (about 600 photos) and a rate limit on "add to my library" (it duplicates the photos): one account cannot fill the database. A copy over the cap is made without its photos.
- **Pictures are served with a sandboxed CSP allowing nothing**: only their header is checked, so whatever follows it can never run if opened as a document.
- **Avatars are public** (shown next to the author's name, which public recipes already show).

## Phase 9d: Home page

- **Idea of the day chosen by the server with `md5(id || seed)`** (seed = user, local day, try number): stable all day without storing anything, different for each user, and only among recipes the user may read (theirs and public ones) that can be cooked. The day is the browser's local date, so it changes at the user's midnight.
- **"Another idea" excludes the one shown** (else a small library would often give the same one again); `n` is capped at 1000.
- **Recent recipes = recently changed** (the list order): there is no "last cooked" date yet.
- **The cooking summary reads the cooking mode's own sync store**, so the home page shows the same state as `/cook` (local copy included, offline too).

## Phase 9e: Shopping list

- **One list per user, saved whole, last change wins** (like the cooking session, same sync code, now generic in `lib/state-sync.ts`): one person shops at a time; a list shared by a household would need members and access rules.
- **Entries are copies of the ingredient lines** (scaled text + parsed quantity), not references: the list works offline, survives recipe edits or lost access, and the server checks nothing but its shape.
- **One line per ingredient name, whatever the unit, showing each recipe's quantity** (`Farine (250 g · 1 tasse)`; a total only when every amount has the same unit): no unit conversion and no guessed synonyms, a wrong sum in the shop is worse than two numbers. Plural `s`/`x`, case, accents and `œ` are ignored in names.
- **Lines are stored (ids, order, names they take), not recomputed**: the user's order, hand-made groups and their names need an identity. A hand-made group is remembered by the line itself (its `keys`), not in a per-user synonym table: simpler, and it goes away with the line.
- **Free items are never joined automatically** (typed text, no parsed quantity), but can be grouped by hand. No aisle grouping (would need a store-section table and a mapping per ingredient).
- **Moving is always available, only from the handle** (or the arrows): a touch on the line checks it off, a swipe scrolls, nothing moves by mistake. Grouping has its own mode (the same tap selects instead of checking off). Checked lines go to "In the basket" and get their place back when unchecked.
- **A stored list in the shape before lines is read as no list** (not converted): the change came before any release.
- **Limits** (300 ingredients, 50 recipes, 200 characters per text, 20 names per line and 600 in all) keep a full list well under the 1 MB API body limit; an amount above 1,000,000 stays in the name, not added up.

## Optional email (from phase 11, done before phase 10)

- **SMTP settings in environment variables, not in an admin page**: the SMTP password never goes in the database, like the VAPID keys; a test email checks them from the admin page.
- **nodemailer** sends (pure JavaScript, maintained, TLS/STARTTLS, encoding): writing an SMTP client would be a security risk. `starttls` requires TLS by default; `none` exists for local relays and tests.
- **MJML compiled at build time** (`bun run emails`, `mjml` as a dev dependency) into committed HTML templates, with the web theme's colors read from `index.css` (oklch → hex): MJML and its dependencies stay out of the image and nothing is compiled per email. Values are HTML-escaped when filled in; a unit test checks the compiled file matches the sources. No web font is loaded (privacy, client support): the theme font first, then system fonts.
- **Emailed reset links keep 2FA and passkeys** (an admin link still removes them, as before): access to the mailbox alone must not get past the second factor. One hour instead of three days, and they never cancel an admin's link.
- **"Forgot your password?" never tells** whether an account exists: same answer, sent before the work is done, a per-account limit (on the account id, 3 an hour and 6 a day) that silently drops extra requests.
- **Reset links only go to verified addresses**: an address is verified when the account was created from an invite emailed to it (the person received it). An address typed at sign-up was never proven and could be someone else's (a typo, a placeholder): emailing it a reset link would hand the account over. Accounts created before email, or from a link handed over by hand, keep asking an admin.
- **The invite email is in a language the admin picks** (the admin's by default): the invitee has no account language yet; the sign-up page opens in it.
- **Mailpit for development and end-to-end tests** (a CI service; in development, the one already running on the host, not started by the dev compose; never in the production files): a real SMTP server to test against, and a web UI to look at the emails.

## Alarm (before phase 10)

- **Synthesized sounds** (Web Audio tones, no sound file): nothing to download or license, works offline; five presets cover loud and gentle.
- **Account settings on the server, device settings in the browser**: a kitchen tablet and a phone want different sounds, but most people set it once; the account's apply wherever a device has none.
- **The alarm lives in the layout**, not the cooking page: a timer finishing while browsing recipes rings too. It loops for 5 min, then every 30 s until 15 min, then gives up (nobody is there; the banner stays).
- **Push reminders instead of a continuous sound** with the app closed (a web page cannot ring in the background): every 30 s, 10 times at most, only when the account's "ring until stopped" is on; stopping is dismissing the timer (app, banner, or the notification's Stop action where the system has actions). The notification sound is the system's: the web cannot choose it. A real alarm clock (loud, locked screen, silent mode) stays for the native app (phase 11).

## Notes, summary and translated lists

- **The summary is a markdown key** (`résumé:` / `summary:` / `összefoglaló:`), not a column of its own outside the format: it travels with exports and imports, the AI prompts fill it in, and each translation has its own. Over 160 characters it is an error (refused, never cut): content is never lost silently. Such keys used as free "other information" lines before are moved by migration 0014: into the summary when they fit, else to the end of the description (nothing lost, no stored key the parser now reads differently).
- **Lists show the reader's language when the recipe has it** (one left join on the translation asked for); the search matches the base language or that translation, ranked by the better of the two.
- **The author's note is plain text outside the markdown**: one public word per recipe, not translated, not copied (the copier is not the author), and saving it is not an edit of the recipe (no editor conflict).
- **Private notes are per reader and per recipe**, on any recipe the reader may read (an unlisted one with its link); they are never shown to anyone else, never copied, and go away with the recipe or the account. Plain text, not markdown.

## Test coverage

- **Codecov (free Developer plan) for the badge**: the CI sends the unit tests' `lcov` report (`bun test --coverage`); the check is informational and comments are off, so coverage never blocks a merge or a release. Only unit tests are counted (the server and the pages are covered by Playwright, which measures no coverage of the image). Skipped when there is no token (release workflow, forks). `bun test --coverage` crashes on Windows with Bun 1.3.10 (assertion failure while writing the report): run it in CI or under Linux.
- **Codecov Test Analytics** (not Bundle Analysis): unit (`bun test --reporter=junit`) and end-to-end (Playwright `junit` reporter, CI only) results are sent as JUnit files, flagged `unit` / `e2e`, even when tests fail, to spot flaky and slow tests. Bundle Analysis would need a Vite plugin and a token at build time; Vite's own chunk sizes are enough for now.
- **The Playwright report is uploaded on every run**, not only on failure (7 days).

## Links and copies

- **"Add to my recipes" keeps a link, not a copy**: a copy made while the author is still working on the recipe would freeze an unfinished version. The copy stays, as a separate action explained before it is made, and says whose recipe it came from.
- **A link to an unlisted recipe stores the share token it was added with**, compared with the recipe's on every read: revoking or renewing the link cuts off those who added it too, as it does for those who only have the link. Stored as is (like `recipes.share_token`, which the owner can show again).
- **The copy remembers the original's author** (`copied_from_owner_id`, set null when the account goes) so the badge names them even when the original is gone. Only the copy's owner and readers who may open the original see where it comes from (a copy made public must not reveal who shared a private or unlisted recipe with its owner). Making a copy removes the reader's link (one entry per recipe in their list).

## Members and site settings

- **The gallery is for members by default**, opened to visitors by an admin (a setting in the database, not an environment variable: it changes without a redeploy, from the app). Instances are private by nature (invite-only); "public" means shared with every member. Share links keep working without an account: they are an explicit share of one recipe.
- **The members list is opt-in** (`user.listed`, false by default) and shows only a name, username, picture and public recipe count. A member's page opens when they are listed or have a public recipe (reached from their recipes, whose author is already shown); otherwise it is a 404 for others, so trying usernames reveals nothing about someone who did not opt in. Usernames are never given to visitors without an account: they are sign-in names.
- **One settings row cached in the process**: read on every anonymous recipe request; one process (no worker), so replacing it on save is enough.

## Demo (GitHub Pages)

- **The demo runs the server's own controllers and services in the page** (Hono works in a browser), on in-memory repositories saved in IndexedDB: the same validation, access rules and parser as production, instead of a hand-written fake API that would drift. Two Node-only modules are swapped by a Vite plugin in demo mode, the server code is not changed.
- **Demo code lives in `main`, behind a build mode**, not on a long-lived branch: a separate branch would fall behind every feature. The normal build leaves it out.
- **"Not in the demo" is said before the click** (`NotInDemo`), not only by the 501 answer after it; the zip export, which is a plain link in the app, is made in the page instead of being refused.
- **Published with each stable release** (`.github/workflows/pages.yml`, push to `release`, or by hand), so the demo shows the released version, not work in progress; its Playwright tests also run in CI on every pull request, so a broken demo is seen before it is published.
- **No service worker in the demo**: nothing to cache from or notify with, and a cache on a shared `github.io` origin could outlive the demo.
