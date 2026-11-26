# Architecture

The repository is an npm workspaces monorepo. `apps/frontend` is one React/Vite application for a browser and Telegram Mini App. Its Worker serves Static Assets and forwards `/api/*` to the API Worker through a service binding. This keeps browser session cookies on the frontend origin. `apps/api` owns validation, authentication, account state, and all D1 writes. `apps/bot` is a grammY webhook adapter; it calls the API through a service binding and holds the Telegram token. The API sends approval notifications to the bot's HTTPS Worker endpoint using a separate shared secret.

`packages/shared` contains schemas and account types. Other suggested packages were not created because their current code would be empty or duplicate a single application's implementation. File uploads, R2, AI providers, payments, and legal retrieval are outside Phase 1.

Staging and production names and D1 bindings are selected by `cf` mode in each `cloudflare.config.ts`. Only explicit `production-deploy` selects production; all other modes use staging. Deploy order is API, bot, frontend. The production D1 database should be created separately from staging, and no existing Yuristim resources should be repurposed without verifying their ownership.

## Data flow

1. Browser or Mini App requests the frontend Worker; static requests use Workers Static Assets.
2. `/api/*` is forwarded to the API Worker. The API validates with Zod, checks a D1 backed session, and uses prepared statements.
3. Telegram sends signed webhook requests to the bot Worker. The bot verifies the webhook secret, then calls API bot routes with an internal secret.
4. For special login, the API stores a short lived browser bound challenge. The bot sends approval buttons and posts the Telegram user ID and decision back to the API. The browser redeems an approved challenge once.

The bot's registration flow stores the username, display name, and language in D1. Password creation happens on the frontend with a one time bot registration token; a password is never requested in Telegram chat.
