# Authentication

## Username and password

Usernames are separate from Telegram usernames, lowercased, and unique. Passwords are at least 12 characters. Workers Web Crypto PBKDF2-SHA-256 with a random salt and 600,000 iterations stores only salt, hash, and iteration count. Invalid usernames use a dummy verification to reduce timing differences. Login attempts have D1 backed rate limits and generic credential errors. This KDF is not weakened to fit a Free Plan CPU budget; see the deployment blocker below.

Sessions use 256 bit random opaque tokens. D1 stores a peppered SHA-256 token hash. The browser gets a Secure, HttpOnly, SameSite=Strict, host only cookie and a separate readable CSRF cookie. Session expiry is 14 days. Logout revokes the D1 row and clears both cookies. The frontend proxy ensures this works from the site origin. Mini App `initData` is verified on the API with Telegram's two stage HMAC and a one hour freshness limit; `initDataUnsafe` is never used for login.

## Bot registration and linking

The bot asks for username, display name, and language in a private chat and stores progress in `bot_states`. It never asks for a password in chat. A 15 minute registration link opens a web password form. Account creation links the verified Telegram user ID and issues a hashed special identifier. Existing Telegram IDs cannot create duplicate linked accounts. A signed in account can issue a 10 minute linking token bound to its active D1 session. Reuse, expiry, logged out sessions, and already linked identities are rejected.

## Special login

The 6 digit value identifies an account but cannot authenticate it. The API rate limits attempts, returns a generic challenge, stores a hash of a browser nonce, and asks the bot to send approve/deny buttons. Only a matching Telegram user ID can decide. The 5 minute challenge is bound to the initiating browser cookie and can be redeemed once through an atomic state transition. A unique index prevents parallel pending challenges for one account. Denial is not disclosed to the browser until timeout to reduce code enumeration; the bot immediately shows the decision. Expired and used challenges cannot create sessions.

Linked users can request a new special identifier from the bot with `/code`. Unlinking requires a correct password, so the only login method is retained. Identifier codes are never stored in plaintext.
