# Phase 1 test report

Run date: 26 November 2026. Tests used local Workers development mode and local D1 data. No remote staging or production tests have run.

| Check                                                   | Result                                     | Evidence                                                                                                                      |
| ------------------------------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| Unit tests                                              | Passed                                     | `npm test`: 3 files, 4 tests; password hash, Telegram initData HMAC/freshness, validation, SQL constraints                    |
| TypeScript                                              | Passed                                     | `npm run typecheck`                                                                                                           |
| Staging packages                                        | Passed                                     | `npm run build` for frontend, API, bot                                                                                        |
| Deploy packaging                                        | Passed locally                             | `cf deploy --dry-run --mode staging --no-provision` for all three apps; no upload                                             |
| Local API integration                                   | Passed                                     | `python3 tests/smoke-local.py http://localhost:5173`                                                                          |
| Registration and duplicate username                     | Passed locally                             | 201 and 409; unique SQL constraint                                                                                            |
| Correct/wrong password                                  | Passed locally                             | 200 and 401                                                                                                                   |
| CSRF and forged bot request                             | Passed locally                             | 403 responses                                                                                                                 |
| Bot onboarding persistence and token use                | Passed locally                             | API bot steps in D1, one time registration token, linked account                                                              |
| Linking, duplicate linking, reauthentication, unlinking | Passed locally                             | One time link, 404 replay, wrong password 403, unlink success                                                                 |
| Special approval, denial, expiry, replay                | Passed locally with simulated notification | D1 pending state restored by local test admin after unavailable Telegram delivery; bot decision and browser redemption tested |
| Session expiry and logout                               | Passed locally                             | Expiry forced in local D1; `/me` returns 401 after expiry or logout                                                           |
| Profile, language, tutorial persistence                 | Passed locally                             | API smoke and manual browser interaction                                                                                      |
| Main UI, menu, profile, Chat/Work                       | Visually checked locally                   | Chrome captures in `docs/screenshots`                                                                                         |
| Sticker variants                                        | Passed                                     | 72 PNG/WebP variants checked for 256/512/1024 dimensions and alpha                                                            |
| Forged Telegram webhook                                 | Passed locally                             | Bot Worker `/webhook` returned 403 for wrong secret                                                                           |

## Not yet verified

- Real Telegram `/start`, password form opening from bot, webhook delivery, Mini App `initData` in Telegram WebView, notification buttons, and full three platform account sharing. The test bot token is absent.
- Remote Cloudflare D1 migration, Worker deployment, production domain, HTTPS cookie behavior, live asset headers, and Free Plan CPU usage. The connected Cloudflare write call failed authentication.
- Parallel special login requests against remote D1, distributed brute force behavior, animation timing at 60 FPS, reduced motion in a browser, slow network behavior, and responsive narrow viewport/keyboard/safe area testing.
- External security audit, live dependency review, and all mandatory end-to-end cases on staging.
- Full UI translation for the selected Russian and English language preferences.

The locally simulated special login test exercises state transitions but does not prove Telegram delivery. A dry run does not prove deployment or remote bindings. Phase 1 acceptance is not met.
