# Security review

## Implemented controls

- Parameterized D1 SQL, Zod validation, 8 KiB JSON body cap, no SQL string concatenation from user input.
- Salted PBKDF2-SHA-256 password hashes, opaque hashed session tokens, 14 day expiry, D1 revocation, Secure HttpOnly host only cookies, SameSite Strict and CSRF header checks.
- Exact Origin check for browser state changes, same origin API proxy, no permissive CORS, React escaping, restrictive CSP and no-referrer headers.
- Telegram Mini App `initData` HMAC and freshness verification; webhook secret header verification; backend bot route shared secret. Telegram identity uses numeric user ID, not username.
- Bot registration password set in browser, one time short lived linking tokens, active session check, unique Telegram IDs, password reauthentication for unlinking.
- Browser nonce bound, short lived, one use special login challenges, per IP rate limits, per account pending challenge uniqueness, generic code response, D1 audit events.
- Secret placeholders only in `.env.example`; local `.dev.vars*` ignored by Git. No AI keys or calls.

## Open risks and limits

1. PBKDF2 cost has not been measured on deployed Workers Free. The 10 ms CPU cap may reject registration and login. Production authentication must wait for a remote benchmark and a security preserving decision.
2. The connected Cloudflare credentials cannot write Workers resources, and the Telegram test token is absent. Live webhook, secrets, Mini App, and cross platform authentication have not been verified.
3. The bot's update claim/release avoids common duplicates, but an interruption after a Telegram side effect and before acknowledgment can still resend a message. Reconciliation or a durable outbox is needed before high volume use.
4. The 6 digit code has a small namespace. Rate limits and mandatory Telegram approval prevent code-only login, but a distributed abuse review and remote traffic testing remain.
5. Expired sessions, challenges, rate counters, and bot tokens are denied at read time but do not yet have scheduled cleanup. Add retention and deletion policy before scale.
6. Telegram messages are controlled by Telegram. The bot tells users to enter passwords only on the web form; users can still send secrets to a chat against those instructions.
7. External professional penetration testing, live header inspection, dependency audit, and Cloudflare metrics have not run.

No paid resource was created. No secret was committed. The code is a staging candidate, not a completed production security audit.
