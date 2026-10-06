# Verify: Recipe from a web page link · spec 0006 · drafted 2026-10-06
_Drafted by `/architect` with the spec, so the deterministic parser, fetch and helper cases are pinned before the build. `/check verify` runs these and records the evidence; `/test` locks the durable ones if the feature moves to Beta._

## Commands
- [x] `pnpm check:extraction` (a table driven script like 0005's `pnpm check:auth`, over the pure modules) → prints "extraction checks passed" with every case below green → AC-1, AC-4, AC-5, AC-7, AC-8, AC-9, AC-11, AC-15
- [x] `pnpm typecheck && pnpm lint && pnpm check:ui && pnpm build` → all green → AC-12, AC-14

## Host rules cases (`hosts.ts`)
| Input | `isYouTubeHost` |
|---|---|
| `https://youtube.com/watch?v=x` | true |
| `https://WWW.YouTube.com./shorts/x` | true (lowercase, trailing dot removed) |
| `https://music.youtube.com/watch?v=x` | true |
| `https://youtu.be/x` | true |
| `https://notyoutube.com/` | false |
| `https://youtube.com.evil.example/` | false |
| `htp:/broken`, `` (empty), `youtube` | false, no throw |

## safeFetch hop checks (pure `checkHop(url)`, before DNS)
| Input | Result |
|---|---|
| `https://example.com/recipe` | ok |
| `http://127.0.0.1/`, `http://2130706433/`, `http://0x7f.1/` | `blocked_url` (IPv4 literal, all forms) |
| `http://[::1]/`, `http://[::ffff:127.0.0.1]/` | `blocked_url` (IPv6 and IPv4 mapped) |
| `http://169.254.169.254/latest/meta-data/`, `http://10.0.0.1/`, `http://100.64.0.1/` | `blocked_url` |
| `http://localhost/`, `http://a.localhost/` | `blocked_url` |
| `https://example.com:8443/` | `blocked_url` (port) |
| `https://user:pw@example.com/` | `blocked_url` (user info) |
| `ftp://example.com/` | `blocked_url` (scheme) |
| `https://www.youtube.com/watch?v=dQw4w9WgXcQ` | `blocked_url` (YouTube host never enters `safeFetch`) |

## safeFetch live cases (real network, run locally)
- [x] `https://httpbin.org/status/403` → `site_blocked`; `/status/429` → `site_blocked`; `/status/404` → `page_not_found`; `/status/410` → `page_not_found`; `/status/500` → `fetch_failed` → AC-4
- [x] `https://httpbin.org/redirect/4` → `too_many_redirects`; `https://httpbin.org/redirect/3` → follows 3 hops, then `unsupported_content` (the end is JSON) → AC-4
- [x] `https://httpbin.org/redirect-to?url=http://127.0.0.1/` → `blocked_url` on the hop → AC-4
- [x] `https://httpbin.org/redirect-to?url=https://www.youtube.com/` → `blocked_url` on the hop → AC-4, AC-15
- [x] A redirect with status 300 or 304, or without `Location` (`https://httpbin.org/response-headers?status=302`) → `fetch_failed` → AC-4
- [x] A PDF link → `unsupported_content` before the body is read → AC-4
- [x] A response with no `Content-Type` → `unsupported_content` → AC-4
- [x] `https://httpbin.org/delay/10` → `timeout` at about 8 s → AC-4, AC-10
- [x] A page over 2 MB (or a gzip body that decodes past 2 MB) → `too_large`, stream aborted → AC-4
- [x] A Windows 1252 page with a `<meta charset>` and a UTF-8 page with a BOM both decode correctly (check an accented word) → AC-5

## Titles cases (`titles.ts`)
| Page title / name | Recipe title | `source_title` |
|---|---|---|
| `Fluffy Pancakes \| Serious Eats` (no JSON-LD name) | `Fluffy Pancakes` | `Fluffy Pancakes \| Serious Eats` |
| `Salt - Fat - Acid` (no JSON-LD name) | `Salt - Fat` | full text |
| `\| Site` | `\| Site` (nothing left after removing, so kept) | `\| Site` |
| A 130 code point name with spaces | cut at the last space at or before 120 | n/a |
| A 130 code point name with no spaces | hard cut at 120 | n/a |
| A name holding emoji | each emoji counts as one code point | n/a |
| A 400 code point `<title>` | n/a | cut to 300 |
| JSON-LD name, extracted title and page title all blank | `insufficient` / `missing_title` | n/a |

## JSON-LD cases (`read-jsonld.ts`, inline HTML fixtures)
- [x] Recipe inside `@graph`, `@type: ["Recipe", "NewsArticle"]` → found, usable → AC-5
- [x] Recipe under `WebPage.mainEntity` → found → AC-5
- [x] `recipeInstructions` as one string with `<br>` and `<p>` → one step per line, no step over 1000 → AC-5
- [x] `recipeInstructions` as a single `HowToStep` object → one step → AC-5
- [x] `HowToSection` whose `itemListElement` is a single object → its step is kept → AC-5
- [x] `recipeIngredient` as a single string → one ingredient line (then fewer than 2 → unusable, falls back) → AC-5, AC-6
- [x] Blank ingredient and step entries are dropped before counting → AC-5
- [x] The same Recipe emitted twice (same name, same ingredients) → treated as one → AC-5
- [x] Two distinct complete Recipes → `multiple`; the pipeline ends `multiple_recipes` with no Gemini call → AC-5
- [x] A script body with a raw newline inside a string, and one wrapped in `<!-- -->` or `<![CDATA[ ]]>` → parsed → AC-5
- [x] A script that is still invalid JSON → skipped, the next script is read → AC-5
- [x] A step over 1000 characters → unusable, falls back to page text → AC-5, AC-6
- [x] Entities `&amp;` and `&#8217;` in a name → decoded; `<a>` tags in a step → text only → AC-5

## Ingredient parser cases (`parse-ingredient-line.ts`)
| Line | Quantity | Unit | Name |
|---|---|---|---|
| `2 cups flour, sifted` | `2` | `cups` | `flour, sifted` |
| `8 fl oz milk` | `8` | `fl oz` | `milk` |
| `200g flour` | `200` | `g` | `flour` |
| `1½ tsp salt` | `1 1/2` | `tsp` | `salt` |
| `3 Tbsp. butter` | `3` | `Tbsp` | `butter` |
| `2-3 cloves garlic` | `2-3` | `cloves` | `garlic` |
| `2 to 3 tbsp olive oil` | `2 to 3` | `tbsp` | `olive oil` |
| `0,5 l water` | `0,5` | `l` | `water` |
| `1 cup of sugar` | `1` | `cup` | `sugar` |
| `2 eggs` | `2` | | `eggs` |
| `Salt to taste` | | | `Salt to taste` |
| `1 (14 oz) can tomatoes` | `1` | | `(14 oz) can tomatoes` |
| `2 cups` | | | `2 cups` (empty name rule) |
| a line whose quantity part is over 40 code points | | | the whole line |

## Page text cases (`page-text.ts`)
- [x] `nav`, `header`, `footer`, `aside`, `script`, `style` and a `hidden` element are gone from the output → AC-6
- [x] A small newsletter `<form>` is removed; a page wrapped in one `<form>` holding most of the text keeps its content → AC-6, AC-7
- [x] An `article` holding most of the text is chosen over `body` → AC-6
- [x] A 100,000 character page keeps its first 20,000 and last 40,000 characters, cut on whole lines; a recipe in the last 30,000 characters survives → AC-6
- [x] A page with 250 characters of text → `page_unreadable`, no Gemini call → AC-7

## Gemini cases (`gemini-errors.ts`, model output order)
- [x] Each row of the *Gemini failure mapping* table, from a fake error or response, gives its reason and retry decision → AC-9, AC-17
- [x] A model reply with one ingredient → `insufficient` / `missing_ingredients`, not `invalid_model_output` → AC-8
- [x] A model reply with an ingredient name over 120 → `invalid_model_output` → AC-8
- [x] Grounding: `oil` is not grounded by `boil`; `crème` stays one token → AC-8

## UI and end to end (real app, phone width)
- [x] Two JSON-LD blogs (one with `@graph` and `HowToSection`) → saved `web_jsonld`, attempt has 0 tokens, recipe page shows split amounts, tab title "<title> · Sotus", `noindex` in the head → AC-5, AC-11, AC-14
- [x] A page with no JSON-LD → saved `web_model`; the log line shows drop counts → AC-6, AC-8
- [x] A roundup page → "more than one recipe" message → AC-5
- [x] A news article → "does not contain a recipe" → AC-8
- [x] A site that returns 403 to Sotus → "doesn't let us read its pages"; note which sites did → AC-4
- [x] Paste the same link again → recipe page with the notice; no new attempt row → AC-2
- [ ] Two browsers paste the same new link at once → one recipe, in both collections → AC-13 (deferred for Alpha, 2026-10-06)
- [x] Development failure switch: 503 twice → busy message, `gemini_calls: 2`; first 503 after 26 s → retry skipped, `gemini_calls: 1`, total under 60 s; per day 429 → no retry → AC-9, AC-10
- [x] The slowest real page finishes under 60 s; a 2 MB page parses under 1 s (`parse_ms`) → AC-10
- [x] A pathological page (500 unclosed `<q>` via `https://httpbin.org/base64/…`) pasted while signed in → "We couldn't read this page", app stays responsive; log shows `page_unreadable`, `too_deep: true`, `parse_ms` 2, `total_ms` 1357; attempt row `ingestion_failed` / `page_unreadable`, 0 tokens → AC-7, AC-10 (verified 2026-10-06; before the `parseHtml` guard, 8,000 unclosed tags blocked the event loop for 27 s)
- [x] Submit twice fast → one request; after a failure the exact link is in the field and focused; an empty submit shows the app's field error, never the browser bubble → AC-12
- [x] A `youtu.be` and a `music.youtube.com` link → YouTube pipeline, no `safeFetch` log line → AC-15
- [ ] Signed out POST → signed out message with a sign in link, no row; signed out visit to `/recipes/<id>` → `/sign-in?next=%2Frecipes%2F<id>`; Supabase blocked → action shows the unavailable message, page renders `AuthUnavailable`; `/recipes/not-a-uuid` → 404 → AC-14, AC-16 · signed out, redirect and 404 parts passed; Supabase blocked part (deferred for Alpha, 2026-10-06)
- [ ] Database blocked after sign in → `service_unavailable`, no row; forced throw after reservation → row `internal_error`; forced finish failure → original message shown, `finish_failed` logged → AC-17 (deferred for Alpha, 2026-10-06)
- [x] Record the `GEMINI_MODEL` ID used, and confirm `temperature: 0` and `thinkingBudget: 0` are accepted by it → AC-6 (verified 2026-10-06: `gemini-2.5-flash`, both accepted)

## Added by /develop · 2026-10-06
_Value sourcing and build notes. Same format; `/check verify` runs these with the steps above._

### Value sourcing
- [x] Paste a link that redirects (for example an `http://` link that goes to `https://`) → the saved row's `source_url` is the trimmed pasted link, not the redirect target; the log line shows `redirects` ≥ 1 and `redirected` → AC-11
- [x] Paste a link with spaces around it → `source_url` and the duplicate lookup use the trimmed link; after a failure the field shows exactly what was typed, spaces included → AC-1, AC-11, AC-12
- [x] A page with both `og:title` and `<title>` → `source_title` is the `og:title`; a page with JSON-LD `name` → `title` is that name, not the page title → AC-11
- [x] A `www.` host → the recipe page shows "From example.com" (no `www.`) and the tab title is "<recipe title> · Sotus" → AC-14
- [x] An ingredient saved with no quantity and no unit → the recipe page shows the name, then "(amount not given)" in muted text → AC-14
- [x] A JSON-LD save → the attempt row has 0 input and 0 output tokens; a `web_model` save → tokens match the log line's `input_tokens` and `output_tokens` → AC-5, AC-6
- [x] A signed out attempt → the "Sign in" link points at `/sign-in` (0005's `signInPath` drops `next` when it is `/`) → AC-16

### Fixture and tooling notes
- [x] `https://httpbin.org/response-headers?status=302` really answers 200, so it gives `unsupported_content`, not the "302 without Location" case. Use a local stub or another host that sends a bare 302 → AC-4
- [x] The Gemini failure switch is `GEMINI_TEST_FAILURE` in `.env.local` (`503-twice`, `503-late`, `429-daily`). It only works under `pnpm dev` and is ignored in every other environment. Remove it after the run → AC-9, AC-10
- [x] The live `safeFetch` cases run against the real network with `node --conditions=react-server --experimental-strip-types` (the `react-server` condition lets the `server-only` import load outside Next.js) → AC-4
