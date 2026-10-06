# Review, feat/recipe-from-web-page-link (YouTube work only), 2026-10-06

**Reviewed by**: Sonnet 5.5 (author on Sonnet 5.5)
**Scope**: 21 files, commits 071e936 and 94b90f9 plus working tree vs eaac547
**Verdict**: Approve with nits

## Summary
The change adds the YouTube path to the shared add link action: it parses the video id, rebuilds the canonical URL, reads metadata from the Data API, tries the creator's recipe page, then reads the description with Gemini. Typecheck passes. The core rules hold: quota is reserved before any fetch or model call, the pasted YouTube URL never leaves the parser, every outcome is a typed result, and one deadline signal bounds every step. The only real issues are a missing key behaviour that spends the user's attempt and does not follow the spec's "throw when absent" rule, plus a few small items.

## Minor
### 🟡 Missing YOUTUBE_API_KEY spends an attempt and shows a misleading message, `src/lib/extraction/youtube/youtube-metadata.ts:26`
**Problem**: When the key is absent the code logs and returns `available: "error"`. This happens after `reserveAttempt` has already run. The user sees "We couldn't reach YouTube just now. Try again in a minute." and the attempt is counted.
**Why it matters**: AGENTS.md and spec 0002 say env vars are validated where read and throw when absent. A misconfigured deploy silently burns every user's daily quota and tells them to retry, which can never work. The author did this on purpose in 94b90f9 so web links do not break, which is a fair goal, but the failure should not cost quota.
**Suggested fix**: Read and validate the key in a small server only reader that throws, and call it lazily on the YouTube route before `reserveAttempt` (or at least before the metadata call, with a result that does not claim a retry will help). Spec step 1 is still unchecked, so this may be planned.

### 🟡 Unreadable duration is labelled video_too_long, `src/lib/extraction/youtube/video-details.ts:77`
**Problem**: `seconds === undefined` returns `"video_too_long"`.
**Why it matters**: Not user visible in slice 1, since watchability is only logged. When slice 2 reads it, a video with a missing or odd duration will show the "too long" message, which is wrong.
**Suggested fix**: Return `video_not_watchable` for an unreadable duration, or add its own state.

## Nits
- ⚪ `src/lib/extraction/youtube/youtube-metadata.ts:42`, the request URL carries the key; `next dev` fetch logging can print full URLs, so keep `logging.fetches` off or confirm it in verify.
- ⚪ `src/lib/extraction/add-recipe-from-link.ts:121`, `youtube-nocookie.com` is not matched by `isYouTubeHost`, so it takes the web path. `safeFetch` still fetches it as an ordinary host. Harmless, but not the YouTube door.
- ⚪ `src/lib/extraction/youtube/extract-from-youtube.ts:190`, the video title is added to the grounding lines, so a title word can ground an ingredient name. Matches the web path (page title plus text), so this is a choice to confirm, not a bug.

## Strengths
- Clean one door handling: `parseYouTubeUrl` rebuilds the canonical URL, host and id are strictly validated, and creator links go only through `safeFetch`, whose hop check also blocks YouTube hosts on redirect.
- Deadline handling is careful: `fitsBudget` before each step, per step signals, a retry that is skipped when it no longer fits, and worst case time well under the 75 s deadline.
- Good separation: pure parsing, ladder and link logic is easy to check from `scripts/check-extraction.mjs`, and the shared action keeps one `redirect` rethrow and one failure finish path.
- Provenance and thumbnail are derived from stored ids, never from API response URLs; `i.ytimg.com` is allow listed in `next.config.ts`.

## Test coverage
None by design (typecheck plus `/check verify`). New pure logic (URL forms, duration, watchability, creator links, ladder, grounding on timestamps) is already exercised in `scripts/check-extraction.mjs`. `/check verify` should cover the missing key path and a real deleted, a live and a creator page video, since typecheck cannot see those.
