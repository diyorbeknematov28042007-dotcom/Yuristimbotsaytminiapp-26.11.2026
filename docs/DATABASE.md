# Database

`migrations/0001_initial.sql` defines the D1/SQLite schema. UTC text timestamps use SQLite `strftime`, while expiry checks use Unix seconds. D1 prepared statements bind all user supplied values. Registration and linking use D1 `batch()` for atomic groups of writes. Local SQLite and D1 migration checks passed; remote staging and production migrations have not been applied.

| Table                                                         | Purpose                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------- |
| `users`, `user_profiles`, `user_credentials`, `user_settings` | Account identity, display name, salted PBKDF2 credentials, language |
| `onboarding_states`                                           | Tutorial completion                                                 |
| `telegram_identities`, `special_login_identifiers`            | Telegram user ID and hashed 6 digit identifier                      |
| `login_challenges`, `telegram_link_tokens`, `sessions`        | Short lived approval and linking state, revocable sessions          |
| `bot_states`, `bot_registration_tokens`, `bot_updates`        | Durable bot onboarding and webhook idempotency                      |
| `conversations`, `messages`                                   | Empty future chat storage; no fake data                             |
| `security_events`, `rate_limits`                              | Audit trail and atomic rate counters                                |

`username` is case insensitive and unique. A partial unique index permits only one pending special login challenge per user. Telegram IDs and special code hashes are unique. Foreign keys cascade on account deletion. The bot registration token and linking token have expiry and use markers. Session expiry and revocation are checked on every authorized request. Expired records remain for a later retention cleanup job; they cannot be redeemed.

Development and production must use different D1 database IDs. The current Cloudflare account already has three D1 databases named `yuristim-v2-staging`, `yuristim-production`, and `yuristim-staging`; this project does not modify them. The new intended database names are `yuristim-p1-db-staging` and `yuristim-db`.
