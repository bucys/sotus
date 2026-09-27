# Verify: Stack & architecture · spec 0001 · updated 2026-09-27
_Steps derived from the scope's "Done when" for feature #1 (spec 0001 is a decision spec, so it carries no numbered acceptance criteria). `/check verify` runs these; `/test` locks the durable ones._

## Commands
- [ ] `pnpm install` → finishes with no peer or engine errors on Node 24 → DW-1
- [ ] `pnpm typecheck` → no errors → DW-1
- [ ] `pnpm lint` → no errors → DW-1
- [ ] `pnpm build` → "Compiled successfully", route table lists `/` and `ƒ Proxy (Middleware)` → DW-1
- [ ] `pnpm dev`, then `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/` → `200` → DW-1

## UI / manual
- [ ] Open http://localhost:3000 at phone width (375px) → the Sotus heading and its two lines read without sideways scrolling → DW-1
- [ ] Watch the `next dev` log while loading `/` → the line shows a `proxy.ts` timing, proving session refresh runs on the request → DW-1
- [ ] Open the deployed Vercel production URL in a browser → the same page renders over HTTPS → DW-2
- [ ] In Vercel, open the production deployment → Functions region is `fra1` → DW-2
- [ ] In Vercel, open Settings → Environment Variables → `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL` are all present → DW-2
- [ ] Open a pull request against `main` → Vercel posts a preview URL and that URL renders the page → DW-2

## Value sourcing
- [ ] Temporarily blank `NEXT_PUBLIC_SUPABASE_URL` in `.env.local` and load `/` → a clear "Missing environment variable" error, not a silent undefined → DW-1
- [ ] `curl -s -o /dev/null -w "%{http_code}" -H "apikey: $NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" "$NEXT_PUBLIC_SUPABASE_URL/auth/v1/settings"` → `200`, confirming the key in `.env.local` belongs to the project the URL names → DW-1

## Done-when coverage
- DW-1 "the empty scaffold runs locally and builds clean" … covered by every Commands step, the two local UI steps and both Value sourcing steps.
- DW-2 "live at a shareable URL" … covered by the four deployed steps. Not yet satisfiable: deployment is pending.
- DW-3 "the stack is recorded in a spec" … already satisfied by spec 0001 itself.

## Not covered here
The Gemini YouTube spike gates feature #7, not this feature. Its pass rules live in spec 0001 under *Gemini YouTube feasibility spike*; record results in `rationale.md`.
