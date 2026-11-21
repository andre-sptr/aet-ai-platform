# AET AI (`aet-ai-rebuilt`)

## Architecture & Runtime
- Monorepo with workspaces: `@aet/contracts`, `@aet/api`, `@aet/web`.
- API served via Docker container `aet-api` bound to `127.0.0.1:4000` (`https://api.aetpcr.site`), 1Panel Node runtime at `/opt/1panel/runtime/node/aet-api`.
- Static web served via OpenResty (`https://aetpcr.site`) from `/opt/1panel/apps/openresty/openresty/www/sites/aetpcr.site/index`.

## Verification Commands
- Typecheck: `npm run typecheck`
- Lint: `npm run lint`
- Test: `npm test`
- Build: `npm run build`

## Guardrails
- Never echo, log, or commit `.env` or secret values.
- Bind any internal APIs/services strictly to `127.0.0.1`.
- Respect 1Panel runtime paths (`/opt/1panel/runtime/node/aet-api`) and OpenResty site directories.
