# AET AI

AET AI is the Politeknik Caltex Riau (AET PCR) web platform and multi-mode AI workspace. It pairs a **static-exportable Next.js App Router frontend** with a **separate Fastify + Prisma/PostgreSQL backend** handling authentication, CMS content, image uploads, document extraction, dynamic AI configuration, and Sumopod orchestration.

## Workspace structure

```text
apps/web/              Next.js App Router frontend (static export to apps/web/out/)
apps/api/              Fastify API, Prisma/PostgreSQL repository, auth, CMS, static deploy, AI
packages/contracts/    Shared Zod schemas and TypeScript DTOs (@aet/contracts)
data/                  Seed data (legacy-content.json) and route manifest (routes.json)
scripts/               Env wrapper, dev runner, DB migrations, seed, route/export checks, deploy CLI
```

Core stack:
- **Runtime**: Node.js `>=24.0.0` (`npm` workspaces)
- **Frontend (`@aet/web`)**: Next.js `16.4.2` (`--webpack`), React / React DOM `19.3.1`, Tailwind CSS `4.3.3`, Lucide React `1.60.0`
- **Backend (`@aet/api`)**: Fastify `5.6.2`, Prisma `6.19.0` with `@prisma/adapter-pg` + `pg`, `@vercel/blob` `^2.0.0`, `sharp` `^0.34.5`, Zod `4.6.7`, TypeScript `5.9.3`

## Environment variables

Copy `.env.example` to `.env` and fill in the required values. `scripts/with-env.mjs` loads `<repo>/.env` before running project commands and automatically strips backend-only secrets whenever running `--workspace=@aet/web`.

### Core credentials and integrations

| Variable | Description |
| --- | --- |
| `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/aet_ai`) |
| `SESSION_SECRET` | Random session-signing secret of at least 32 characters (must not contain `replace-with`, `example`, or `changeme`) |
| `SUMOPOD_API_KEY` | Backend Sumopod API key for live AI completions and model reloads (optional in dev; live generation returns unavailable without it) |
| `TAVILY_API_KEY` | Optional backend API key for the web search tool |
| `BLOB_READ_WRITE_TOKEN` | Optional Vercel Blob token enabling admin image uploads (`POST /v1/uploads`); without it, uploads return `503` and admins can paste direct HTTPS image URLs |

### Runtime, origin, and deployment configuration

| Variable | Default / Behavior |
| --- | --- |
| `NODE_ENV` | Set to `production` in production (`NODE_ENV=production` disables dev fallbacks and enables `__Host-aet_session` cookies and auto static rebuilds) |
| `PORT` | API HTTP port; defaults to `4000` in [apps/api/src/env.ts](apps/api/src/env.ts) |
| `APP_ORIGIN` | Allowed frontend origin(s), comma-separated HTTP(S) URLs; defaults to `http://localhost:3000` |
| `NEXT_PUBLIC_API_BASE_URL` | Browser API base URL used by [apps/web/lib/api.ts](apps/web/lib/api.ts) and [scripts/sync-routes.ts](scripts/sync-routes.ts); defaults to `http://localhost:4000` |
| `COOKIE_SAME_SITE` | `lax` (default), `strict`, or `none` (requires `NODE_ENV=production`) |
| `STATIC_DEPLOY_DIR` | Optional absolute path to the served static web directory (e.g. OpenResty `.../sites/<domain>/index`). Used by `npm run deploy:web` and by automatic production rebuilds in [apps/api/src/static-deploy.ts](apps/api/src/static-deploy.ts) |
| `STATIC_REBUILD_HOOK_URL` | Optional HTTPS webhook triggered after public detail route changes in production |
| `DEV_ADMIN_USERNAME` | Non-production-only username (3-100 chars, `[A-Za-z0-9._-]`) used when PostgreSQL falls back to memory in dev |
| `DEV_ADMIN_PASSWORD` | Non-production-only password (12-256 chars) paired with `DEV_ADMIN_USERNAME` (ignored when `NODE_ENV=production`) |

## Local development

1. Install dependencies from the repository root:
   ```sh
   npm ci
   ```
2. Copy `.env.example` to `.env` and configure your environment variables.
3. Generate the Prisma Client:
   ```sh
   npm run db:generate
   ```
4. Initialize PostgreSQL (recommended for persistence and `/admin/`):
   ```sh
   npm run db:migrate
   npm run seed
   npm run admin:create
   ```
   - `npm run db:migrate` applies SQL migrations under `apps/api/prisma/migrations` with a PostgreSQL advisory lock and SHA-256 checksum tracking in `_aet_migrations`.
   - `npm run seed` (`npm run import:legacy-content`) upserts baseline records from `data/legacy-content.json`.
   - `npm run admin:create` interactively creates an administrator account.

   > **Development fallback without PostgreSQL**: When `NODE_ENV` is not `production`, [apps/api/src/server.ts](apps/api/src/server.ts) checks `repository.ping()` at startup. If PostgreSQL is unavailable locally, it closes the unused Prisma client and falls back to `createDevFallbackRepository()` ([apps/api/src/dev-repository.ts](apps/api/src/dev-repository.ts)), serving seeded records from `data/legacy-content.json` in memory and seeding a disposable admin only if `DEV_ADMIN_USERNAME` and `DEV_ADMIN_PASSWORD` are set. Production mode (`NODE_ENV=production`) strictly requires PostgreSQL.

5. Start both web (`http://localhost:3000`) and API (`http://localhost:4000`) servers:
   ```sh
   npm run dev
   ```
   Or run each workspace separately with `npm run dev:web` and `npm run dev:api`.

## Features, routes, and architecture

- **Public routes**: `/`, `/news/`, `/news/[slug]/`, `/events/`, `/events/[id]/`, `/team/`, `/login/`
- **Protected admin routes**: `/admin/`, `/admin/news/`, `/admin/events/`, `/admin/team/`, `/admin/ai/`
- **AI Workspaces (`/`)**:
  - Three modes: **Smart Companion** (`daily`), **Academic Writer** (`report`), and **Coding Expert** (`coding`), paired with **Fast**, **Normal**, and **Think** effort modes.
  - Lazy-loaded via `next/dynamic` with a matching skeleton state (`ChatWorkspaceLoading`), mode-specific assistant styling, Markdown/KaTeX/Mermaid/syntax highlighting (`RichContent`), SSE streaming (`POST /v1/chat`), and document/image attachment extraction (`POST /v1/attachments/extract`).
  - Conversation history is stored locally in browser storage (incomplete/aborted replies are excluded from upstream model context, and base64 image payloads are not persisted in history).
  - Server-side model catalog, adaptive routing, quality evaluation, tools, and Sumopod orchestration live under `apps/api/src/ai/`.
- **Admin CMS & Media Uploads (`/admin/news/`, `/admin/events/`, `/admin/team/`)**:
  - CRUD editors in [apps/web/components/admin/ContentManager.tsx](apps/web/components/admin/ContentManager.tsx) with WIB (`Asia/Jakarta`) date conversion, draft/published flags, and live Markdown preview.
  - Direct image upload (`POST /v1/uploads`) validates PNG/JPEG/WebP up to 5 MB using magic-byte inspection and full `sharp` pixel decoding before storing via `@vercel/blob`. The upload control provides an inline loading spinner (`Mengunggah gambar…`), 45-second `AbortController` timeout, and inline success/error feedback.
- **Admin AI Settings & Model Testing (`/admin/ai/`)**:
  - Persisted AI configuration (`GET` / `PATCH` / `DELETE /v1/admin/ai/settings` backed by Prisma `AiSetting` in [apps/api/prisma/schema.prisma](apps/api/prisma/schema.prisma)) covering effort models (`fast`, `normal`, `think`), persona overrides (`daily`, `report`, `coding`), `visionModelId`, `classifierModelId`, and pipeline feature toggles (`routerV2`, `semanticClassifier`, `promptPreparation`, `multiModelOrchestration`, `qualityEvaluation`, `visionEnabled`).
  - Manual Sumopod model catalog reload (`POST /v1/admin/ai/models/reload`) cached client-side in `localStorage` (`aet-ai:admin:sumopod-models:v1`) and isolated model testing (`POST /v1/admin/ai/model-test`).
- **Public collections & static export routes**:
  - News, events, and team collections fetch live data from `/v1/news`, `/v1/events`, and `/v1/team` and surface API/network failures cleanly instead of fabricating fallback items.
  - `npm run sync:routes` queries published news slugs and event IDs from the live API and writes `data/routes.json` (use `npm run sync:routes -- --from-seed` for an explicit offline seed manifest). Detail HTML shells embed no article body; published content is fetched at runtime.
  - Canonical public document lives at `apps/web/public/AETPCR.docx` (exported to `/AETPCR.docx` and validated by `npm run verify:export`).

## Scripts reference

```sh
npm run dev                 # Start @aet/api and @aet/web concurrently
npm run dev:api             # Start Fastify API (tsx watch src/server.ts)
npm run dev:web             # Start Next.js dev server (next dev --webpack)

npm run db:generate         # Generate Prisma Client into node_modules
npm run db:migrate          # Apply SQL migrations to PostgreSQL
npm run seed                # Upsert baseline content from data/legacy-content.json
npm run import:legacy-content  # Alias for npm run seed
npm run admin:create        # Create an admin user interactively

npm run sync:routes         # Sync data/routes.json from API public collections
npm run build:api           # Compile @aet/contracts and @aet/api
npm run build:web           # Build contracts, sync routes, static-export web, verify export
npm run deploy:web          # Run build:web and sync apps/web/out/ to STATIC_DEPLOY_DIR
npm run build               # Build both API and web export
npm run verify:export       # Validate exported routes, assets, and boundaries in apps/web/out/

npm run typecheck           # Type-check contracts, api, web, and root tsconfig
npm run lint                # ESLint with --max-warnings=0
npm test                    # Run Node test suite across api, web, and scripts
npm run test:browser        # Run Playwright public/chat smoke checks (requires running web + api)
npm run test:browser:admin  # Run Playwright admin checks (requires disposable *_test DB)
```

To include the real PostgreSQL integration test in `npm test`, point `AET_TEST_DATABASE_URL` to a migrated disposable `*_test` database (without it, that single integration test is skipped).

## Production deployment

AET AI runs as two decoupled deployments sharing PostgreSQL:

1. **API (`@aet/api`)**:
   - Build with `npm run build:api` and start with `node --env-file=.env apps/api/dist/server.js` (or `npm start --workspace=@aet/api` with `.env` loaded by your runtime/container).
   - Required production settings: `NODE_ENV=production`, PostgreSQL `DATABASE_URL`, strong `SESSION_SECRET`, exact `APP_ORIGIN`, `PORT`, plus any configured `SUMOPOD_API_KEY`, `TAVILY_API_KEY`, and `BLOB_READ_WRITE_TOKEN`.
2. **Static Web (`@aet/web`)**:
   - Build with `NEXT_PUBLIC_API_BASE_URL` pointing to your public API origin and serve `apps/web/out/` from Nginx/OpenResty or any static host.
   - To build and sync directly into an on-host web root (such as OpenResty on a VPS), configure `STATIC_DEPLOY_DIR` in `.env` and run `npm run deploy:web` (`scripts/deploy-web.ts`). Protected server files (`.well-known`, `.htaccess`, `.user.ini`) in `STATIC_DEPLOY_DIR` are preserved.

### Selective automatic rebuilds & 1Panel / VPS notes

- When `NODE_ENV=production` and `STATIC_DEPLOY_DIR` is set in the API runtime environment, [apps/api/src/static-deploy.ts](apps/api/src/static-deploy.ts) debounces, serializes, and coalesces `npm run build:web` + directory sync whenever a CMS write adds, removes, or changes a **public detail route key** (publishing/unpublishing news or events, or changing a published news slug). Edits to existing published bodies, drafts, or team members do not trigger unnecessary static rebuilds because public content is fetched dynamically from the API.
- If deploying on a VPS with a containerized **1Panel Node.js Runtime** for `aet-api`:
  - Mount both the repository directory (e.g. `/opt/apps/aet-ai` to `/app`) and the OpenResty site directory (`STATIC_DEPLOY_DIR`, using the exact same absolute path inside the container so automatic rebuilds can sync straight to OpenResty).
  - Mount/provide `.env` and ensure `apps/api/dist` is built before starting `node --env-file=.env apps/api/dist/server.js`.
  - Because a container runtime usually writes build artifacts (`apps/web/.next`, `apps/web/out`, and synced subdirectories inside `STATIC_DEPLOY_DIR`) as `root`, run manual SSH frontend deployments with the current Node `PATH` preserved as root so permissions do not clash:
    ```sh
    sudo env "PATH=$PATH" npm run deploy:web
    ```
    (Omit `-E` so `npm` does not write root-owned cache files into your user home directory; `scripts/with-env.mjs` reads `.env` directly from the repository root.)
  - For backend code updates (`apps/api` or `packages/contracts`), rebuild with `sudo env "PATH=$PATH" npm run build:api` and restart the `aet-api` runtime container in 1Panel.
