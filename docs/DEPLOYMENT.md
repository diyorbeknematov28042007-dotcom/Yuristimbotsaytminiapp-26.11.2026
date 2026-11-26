# Deployment

## Current state

No Phase 1 Worker or D1 resource has been deployed or modified remotely. The connected Cloudflare account was inspected first. It already contains `yuristim-bot-staging`, `yuristim-v2-staging`, and three Yuristim D1 databases; their ownership and bindings are not established, so this project leaves them untouched. A write attempt for an isolated PBKDF2 benchmark Worker returned Cloudflare HTTP 503 / error 10001, `Unable to authenticate request`. The local `cf` CLI also reports no Cloudflare login or API token. The test bot token has not been supplied.

The repository builds in staging mode with `cf build --mode staging` for all three applications. Before remote deployment, a Cloudflare connection with Workers Scripts Write and D1 Edit access, a test bot token through a secure secret channel, and an accepted password hashing strategy that fits the actual Workers Free CPU budget are required.

## Intended staging order

1. Create a new D1 database named `yuristim-p1-db-staging` in the intended Cloudflare account. Do not reuse an existing database based on its name alone. Record its UUID in `apps/api/cloudflare.config.ts` with `bindings.d1({id, name})` to disable accidental provisioning.
2. Apply `migrations/0001_initial.sql` to that staging database using `cf d1 migrations apply <STAGING_DATABASE_UUID> --dir migrations`. Review migration status and table constraints. Run no production migration yet.
3. Set `SESSION_PEPPER`, `BOT_INTERNAL_SECRET`, and `TELEGRAM_BOT_TOKEN` as secrets on the API Worker. Set `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`, and `BOT_INTERNAL_SECRET` on the bot Worker. Use independent values for staging and production. Never place them in Git or CLI arguments.
4. Deploy `apps/api`, then `apps/bot`, then `apps/frontend` with `cf deploy --mode staging --no-provision` from each directory. The API calls the bot's HTTPS endpoint with the internal secret. The bot and frontend bind to the API Worker by service binding. Set `VITE_TELEGRAM_BOT_USERNAME` at frontend build time.
5. Check the bot's current Telegram webhook before changing it. Only if it is unused or assigned to this staging bot, set the webhook to the new bot Worker `/webhook` endpoint with `TELEGRAM_WEBHOOK_SECRET` as Telegram's `secret_token`. Do not disturb a webhook belonging to another service.
6. Exercise registration, login, bot linking, approval, rejection, Mini App, profile persistence, and screenshots on staging. Inspect Worker metrics for CPU, errors, D1 reads/writes, and Free Plan budget. Promote only after all required checks pass.

Production is selected only with `--mode production-deploy`. Production needs a separate `yuristim-db` UUID, fresh secrets, and explicit release approval after staging succeeds.

## Free Plan check, 26 November 2026

Cloudflare's [Workers limits](https://developers.cloudflare.com/workers/platform/limits/) list 100,000 requests per day, 10 ms CPU per HTTP request, 50 subrequests, 20,000 static files per Worker version, and a 25 MiB individual asset limit on Free. [D1 pricing](https://developers.cloudflare.com/d1/platform/pricing/) lists 5 million rows read/day, 100,000 rows written/day, 5 GB total storage, and 10 databases on Free. [D1 limits](https://developers.cloudflare.com/d1/platform/limits/) list 500 MB per Free database.

The repo has 12 sticker files per format at 256 px and a small built frontend, well under asset count and per file limits. The account has three existing D1 databases, leaving room under the listed 10 database cap if the account is on Free; its exact plan could not be read through the current connection.

Local Node Web Crypto PBKDF2 at 600,000 iterations used about 85–106 ms CPU on three trials. A local Workers development request took about 83 ms elapsed time for registration. Neither measurement establishes remote Workers billed CPU. A remote benchmark was attempted but the Cloudflare write request failed authentication. Because 10 ms may be exceeded, password endpoints are not approved for Free Plan deployment yet. Do not reduce iterations without a security review. An explicit paid Workers option, a vetted external authentication provider with a separate cost analysis, or a measured compliant KDF architecture are possible next decisions.
