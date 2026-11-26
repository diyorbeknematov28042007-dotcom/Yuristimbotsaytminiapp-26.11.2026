# Design system and reference inventory

The attached `korinish.zip` contained 13 unlabeled PNG mockups. The supplied `Yuristim-Sticker-Pack.zip` contained 12 stickers in PNG/WebP sizes 256, 512, and 1024 plus the original logo JPEG and README. The Markdown attachment documents 12 animations. There was no separate Animation Pack ZIP.

| PNG prefix | Screen interpreted from the mockup | Implementation                                           |
| ---------- | ---------------------------------- | -------------------------------------------------------- |
| `4F4A2C8D` | Welcome                            | Implemented                                              |
| `F7D7D251` | Login method selection             | Implemented                                              |
| `0B595F27` | Create account                     | Implemented with Yuristim username wording               |
| `DCC84581` | Profile setup                      | Implemented without avatar upload                        |
| `1D1143E9` | Special login and keypad           | Implemented with bot approval                            |
| `D6007446` | Alternate code entry               | Combined into special login                              |
| `9DF59892` | Bot confirmation instructions      | Implemented                                              |
| `98A74510` | Account ready                      | Omitted: request says go directly to chat                |
| `AB00D766` | Main chat                          | Implemented with inactive AI notice                      |
| `DD232566` | Single tutorial                    | Implemented as one overlay                               |
| `4D0ABA76` | Left menu                          | Implemented with real empty state                        |
| `CD607BE9` | Latest profile                     | Implemented                                              |
| `DBDB263D` | Separate loading screen            | Omitted: request explicitly requires loading inside chat |

The mockup's registration input says Telegram username. The request says the username belongs to Yuristim and need not equal Telegram's; implementation follows the request. The mockup menu shows sample chat history. The request prohibits fake conversations; implementation shows an empty state. The mockup's chat art resembles a cropped scales logo, while the official sticker pack provides the original circled logo; implementation uses the official asset without modifying it.

Colors: primary `#00865F`, secondary `#005C40`, accent `#DDF5E9`, white background. The UI is responsive and uses safe area padding. Motion applies to screen changes, button presses, segmented model selection, menu and banner; reduced motion removes duration. Static stickers are supplied WebP with PNG fallback. No extra header controls or bottom navigation are present.

## Visual comparison

These compare the supplied mockup on the left with a local browser capture on the right. The local capture has no simulated iPhone status bar and uses a test account where applicable. Typography was tuned after the captures; remote mobile WebView comparison is still pending.

- [Welcome comparison](screenshots/compare-welcome.jpg)
- [Chat comparison](screenshots/compare-chat.jpg)
- [Menu comparison](screenshots/compare-menu.jpg)
- [Profile comparison](screenshots/compare-profile.jpg)

The current UI should be reviewed on an actual narrow viewport and Telegram WebView before design acceptance. The reference images and implementation differ in logo framing, status bar chrome, and font scale.
