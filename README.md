# AET AI

AET AI is the Politeknik Caltex Riau (AET PCR) web platform and multi-mode AI workspace. It combines a **static-exportable Next.js frontend** with a **separate Fastify + Prisma/PostgreSQL backend** handling authentication, CMS content, uploads/document extraction, AI orchestration, and Sumopod requests.

## Workspace structure

```text
apps/web/              Next.js App Router frontend (static export to out/)
apps/api/              Fastify API, Prisma/PostgreSQL repository, auth, CMS, AI
packages/contracts/    Shared Zod schemas and TypeScript DTOs (@aet/contracts)
data/                  Seed data (legacy-content.json) and route manifest (routes.json)
scripts/               Env wrapper, concurrent dev runner, DB migrations, seed, route/export checks
```

Core stack:
- **Runtime**: Node.js `>=24.0.0` (`npm` workspaces)
- **Frontend (`@aet/web`)**: Next.js `16.4.2` (`--webpack`), React / React DOM `19.3.1`, Tailwind CSS `4.3.3`, Lucide React `1.60.0`
- **Backend (`@aet/api`)**: Fastify `5.6.2`, Prisma `6.19.0` with `@prisma/adapter-pg` + `pg`, Zod `4.6.7`, TypeScript `5.9.3`

## Local development

1. Install dependencies from the repository root:
   ```sh
   npm ci
   ```
2. Copy `.env.example` to `.env` and fill in your credentials.
   `.env.example` intentionally lists only core credentials & API keys:

   | Variable | Description |
   | --- | --- |
   | `DATABASE_URL` | PostgreSQL connection string (e.g. `postgresql://postgres:postgres@localhost:5432/aet_ai`) |
   | `SESSION_SECRET` | Random session-signing secret of at least 32 characters (must not contain `replace-with`, `example`, or `changeme`) |
   | `SUMOPOD_API_KEY` | Backend Sumopod API key for live AI completions (optional in dev; live generation returns unavailable without it) |
   | `TAVILY_API_KEY` | Optional backend API key for the web search tool |

   Common optional environment variables with built-in development defaults:
   - `NEXT_PUBLIC_API_BASE_URL` — defaults to `http://localhost:4000` in [apps/web/lib/api.ts](apps/web/lib/api.ts)
   - `APP_ORIGIN` — defaults to `http://localhost:3000` in [apps/api/src/env.ts](apps/api/src/env.ts) (comma-separated for multiple allowed origins)
   - `PORT` — API port, defaults to `4000`
   - `COOKIE_SAME_SITE` — `lax` (default), `strict`, or `none` (requires `NODE_ENV=production`)
   - `STATIC_REBUILD_HOOK_URL` — optional HTTPS webhook triggered after CMS mutations

3. Generate the Prisma Client before running the API:
   ```sh
   npm run db:generate
   ```
4. **Database setup** (recommended for persistence and `/admin/`):
   ```sh
   npm run db:migrate
   npm run seed
   npm run admin:create
   ```
   - `npm run db:migrate` runs SQL migrations with a PostgreSQL advisory lock and SHA-256 checksum tracking in `_aet_migrations`.
   - `npm run seed` (`npm run import:legacy-content`) upserts the baseline records from `data/legacy-content.json`.
   - `npm run admin:create` interactively creates an administrator account.

   > **Development fallback without PostgreSQL**: When `NODE_ENV` is not `production`, [apps/api/src/server.ts](apps/api/src/server.ts) checks `repository.ping()` at startup. If PostgreSQL is unavailable locally, it closes the unused Prisma client and automatically falls back to `createDevFallbackRepository()` ([apps/api/src/dev-repository.ts](apps/api/src/dev-repository.ts)), serving the seeded records from `data/legacy-content.json` in memory. Production mode (`NODE_ENV=production`) strictly requires PostgreSQL.

5. Start both web (`http://localhost:3000`) and API (`http://localhost:4000`) servers:
   ```sh
   npm run dev
   ```
   Or run them individually with `npm run dev:web` and `npm run dev:api`.

## Features and routes

- **Public routes**: `/`, `/news/`, `/news/[slug]/`, `/events/`, `/events/[id]/`, `/team/`, `/login/`
- **Protected admin routes**: `/admin/`, `/admin/news/`, `/admin/events/`, `/admin/team/`, `/admin/ai/`
- **AI Workspaces**:
  - Three modes on `/`: **Smart Companion** (`daily`), **Academic Writer** (`report`), and **Coding Expert** (`coding`), paired with **Fast**, **Normal**, and **Think** effort modes.
  - Lazy-loaded via `next/dynamic` with a matching `Soft Aurora Mist` skeleton transition (`ChatWorkspaceLoading`), mode-specific assistant icons, right-aligned user bubbles, collapsible sidebar, Markdown/KaTeX/Mermaid/syntax highlighting (`RichContent`), and attachment upload/extraction (`POST /v1/attachments/extract`).
  - Conversation history is stored locally in the browser (incomplete/aborted replies are excluded from model context, and raw image base64 payloads are not persisted in history).
  - Server-side model candidates (`gpt-4o-mini`, `gpt-4.1-mini`, `gpt-5-mini`), adaptive routing, and orchestration live under `apps/api/src/ai/`.
- **Public collections & static export routes**:
  - News, events, and team collections fetch live data from `/v1/news`, `/v1/events`, and `/v1/team` and display actionable API/network errors (`ApiError`) rather than masking failures.
  - `npm run sync:routes` reads published news slugs and event IDs from the API and writes `data/routes.json` (use `npm run sync:routes -- --from-seed` for an explicit seed-only offline manifest). No article body is baked into static detail HTML shells; detail pages fetch live published content at runtime.
  - Canonical public document lives at `apps/web/public/AETPCR.docx` (served at `/AETPCR.docx`).

## Scripts reference

```sh
npm run dev                 # Start @aet/api and @aet/web concurrently
npm run dev:api             # Start Fastify API (tsx watch src/server.ts)
npm run dev:web             # Start Next.js dev server (next dev --webpack)

npm run db:generate         # Generate Prisma Client into node_modules
npm run db:migrate          # Apply SQL migrations to PostgreSQL
npm run seed                # Upsert baseline content from data/legacy-content.json
npm run admin:create        # Create an admin user interactively

npm run sync:routes         # Sync data/routes.json from API public collections
npm run build:api           # Compile @aet/contracts and @aet/api
npm run build:web           # Build contracts, sync routes, static-export web, verify export
npm run build               # Build both API and web export
npm run verify:export       # Validate exported routes, assets, and boundaries in apps/web/out/

npm run typecheck           # Type-check contracts, api, web, and root tsconfig
npm run lint                # ESLint with --max-warnings=0
npm test                    # Run Node test suite across api, web, and scripts
npm run test:browser        # Run Playwright public/chat smoke checks (requires running web + api)
npm run test:browser:admin  # Run Playwright admin checks (requires disposable *_test DB)
```

## Production deployment overview

Deploy the static export output (`apps/web/out/`) to any static host with `NEXT_PUBLIC_API_BASE_URL` pointing to the deployed API, and deploy `apps/api` (`npm run build:api` → `npm start --workspace=@aet/api`) with `NODE_ENV=production`, a reachable PostgreSQL database (`DATABASE_URL`), a strong `SESSION_SECRET`, exact `APP_ORIGIN`, and any configured AI/tool/storage keys.
