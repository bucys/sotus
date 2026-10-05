// Table driven check for the pure sign in helpers (spec 0005). Run with:
//   node --experimental-strip-types scripts/check-auth-helpers.mjs
import {
  AuthApiError,
  AuthRetryableFetchError,
  AuthSessionMissingError,
} from "@supabase/supabase-js";

import { classifyAuthResult } from "../src/lib/auth/classify-auth-result.ts";
import { signInPath, validateActionOrigin } from "../src/lib/auth/origin.ts";
import { safeNextPath } from "../src/lib/auth/safe-next-path.ts";

let failures = 0;
function expect(label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  failures += 1;
  console.error(
    `FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  );
}

const nextCases = [
  ["/x/../sign-in", "/"],
  ["/%2e%2e/sign-in", "/"],
  ["/a/..//evil.example", "/"],
  ["//evil.example", "/"],
  ["https://evil.example", "/"],
  ["/\\evil.example", "/"],
  ["/a\\b", "/"],
  ["/\t/evil.com", "/"],
  ["/a\u0000b", "/"],
  ["/" + "a".repeat(2048), "/"],
  ["/SIGN-IN/", "/"],
  ["/auth/callback", "/"],
  ["/%61uth/callback", "/"],
  [undefined, "/"],
  [["/a"], "/"],
  ["/recipes/abc?x=1", "/recipes/abc?x=1"],
  ["/recipes/abc?x=1#top", "/recipes/abc?x=1#top"],
];
for (const [input, want] of nextCases)
  expect(`safeNextPath(${JSON.stringify(input)})`, safeNextPath(input), want);

const apiError = (status) => new AuthApiError("x", status, undefined);
const authCases = [
  ["user, no error", { user: {}, error: null }, "signed_in"],
  ["no user, no error", { user: null, error: null }, "signed_out"],
  [
    "session missing",
    { user: null, error: new AuthSessionMissingError() },
    "signed_out",
  ],
  ["401", { user: null, error: apiError(401) }, "signed_out"],
  ["403", { user: null, error: apiError(403) }, "signed_out"],
  ["429", { user: null, error: apiError(429) }, "unavailable"],
  ["500", { user: null, error: apiError(500) }, "unavailable"],
  [
    "retryable fetch",
    { user: null, error: new AuthRetryableFetchError("x", 0) },
    "unavailable",
  ],
  ["unrecognised", { user: null, error: new Error("boom") }, "unavailable"],
];
for (const [label, input, want] of authCases)
  expect(`classifyAuthResult(${label})`, classifyAuthResult(input), want);

expect(
  "origin match",
  validateActionOrigin("https://a.example", "a.example"),
  "https://a.example",
);
expect(
  "origin localhost",
  validateActionOrigin("http://localhost:3000", "localhost:3000"),
  "http://localhost:3000",
);
expect(
  "origin mismatch",
  validateActionOrigin("https://evil.example", "a.example"),
  undefined,
);
expect("origin missing", validateActionOrigin(null, "a.example"), undefined);
expect(
  "origin junk",
  validateActionOrigin("not a url", "a.example"),
  undefined,
);
expect(
  "origin scheme",
  validateActionOrigin("javascript://a.example", "a.example"),
  undefined,
);

expect("signInPath plain", signInPath(undefined, "/"), "/sign-in");
expect(
  "signInPath next",
  signInPath("failed", "/r/1?x=2"),
  "/sign-in?error=failed&next=%2Fr%2F1%3Fx%3D2",
);

if (failures > 0) {
  console.error(`${failures} check(s) failed`);
  process.exit(1);
}
console.log("auth helper checks passed");
