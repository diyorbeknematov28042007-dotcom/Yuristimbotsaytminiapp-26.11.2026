# API v1

The API Worker owns all account changes. JSON is validated with Zod and limited to 8 KiB. Browser state changing requests require the configured frontend `Origin`; authenticated state changes also require `x-csrf-token` matching the session. The frontend Worker proxies requests on the same origin.

| Method and path                         | Purpose                                                                       |
| --------------------------------------- | ----------------------------------------------------------------------------- |
| `GET /health`                           | Health response                                                               |
| `POST /api/v1/auth/register`            | Create a web or bot initiated account                                         |
| `POST /api/v1/auth/login`               | Username/password login                                                       |
| `POST /api/v1/auth/logout`              | Revoke the current session                                                    |
| `POST /api/v1/auth/special/start`       | Start bot approved special login                                              |
| `GET /api/v1/auth/special/status/:id`   | Poll and redeem one approved challenge                                        |
| `POST /api/v1/auth/telegram/verify`     | Verify Telegram Mini App `initData` and create a session for a linked account |
| `POST /api/v1/auth/bot-onboarding`      | Read a short lived bot registration token                                     |
| `GET /api/v1/users/me`                  | Current account                                                               |
| `PATCH /api/v1/users/me/profile`        | Change display name                                                           |
| `PATCH /api/v1/users/me/settings`       | Change language preference                                                    |
| `POST /api/v1/users/me/tutorial`        | Mark one tutorial complete                                                    |
| `POST /api/v1/users/me/telegram-link`   | Issue one time Telegram linking token                                         |
| `GET /api/v1/users/me/special`          | Linking and identifier status                                                 |
| `POST /api/v1/users/me/telegram-unlink` | Unlink after password reauthentication                                        |
| `GET /api/v1/conversations`             | Real conversation list, initially empty                                       |

The `/api/v1/bot/*` routes are protected by `BOT_INTERNAL_SECRET`; they handle webhook claim/release, onboarding, linking, code rotation, and challenge decisions. They are called by the bot Worker, not by the frontend.

The message composer deliberately does not submit to a chat API in Phase 1. It shows that AI service is inactive. No legal advice or provider calls are generated.
