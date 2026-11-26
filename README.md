# Yuristim

Phase 1 foundation for a shared web and Telegram Mini App UI, a Cloudflare Workers API, and a Telegram webhook bot. The AI chat service is not enabled; the interface says so instead of producing legal advice.

## Development

Requires Node.js 22+. Run `npm install`, then `npm run dev:frontend`. API and bot Workers require D1 bindings and secrets described in [deployment](docs/DEPLOYMENT.md). Run `npm test` and `npm run build` before deployment.

The repository contains no credentials. Copy `.env.example` to a local ignored env file and supply values through Cloudflare secrets in remote environments.

## Structure

- `apps/frontend`: React, Vite, Tailwind, Motion UI for web and Mini App.
- `apps/api`: Hono REST API and D1 access.
- `apps/bot`: grammY webhook adapter.
- `packages/shared`: common validation and types.
- `migrations`: versioned D1 SQL.
- `assets/stickers`: supplied official sticker pack.
- `docs`: architecture, security, deployment and test status.

Phase 1 status and known blockers are in [the report](docs/PHASE-1-REPORT.md).
