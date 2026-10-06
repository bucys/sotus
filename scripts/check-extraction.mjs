// Table driven check for the pure extraction modules (spec 0006 verify.md). Run with:
//   node --experimental-strip-types scripts/check-extraction.mjs
import { readdirSync, readFileSync } from "node:fs";

import { parse } from "node-html-parser";

import {
  classifyGeminiError,
  classifyGeminiResponse,
} from "../src/lib/ai/gemini-errors.ts";
import { acceptModelResponse } from "../src/lib/extraction/contract.ts";
import { ground, tokensOf } from "../src/lib/extraction/grounding.ts";
import { checkHop } from "../src/lib/extraction/hop-check.ts";
import { isYouTubeHost } from "../src/lib/extraction/hosts.ts";
import { htmlStringToLines } from "../src/lib/extraction/html-to-lines.ts";
import { readPageText } from "../src/lib/extraction/page-text.ts";
import { parseHtml } from "../src/lib/extraction/parse-html.ts";
import { parseIngredientLine } from "../src/lib/extraction/parse-ingredient-line.ts";
import { readJsonLd } from "../src/lib/extraction/read-jsonld.ts";
import {
  linkInputSchema,
  providerResponseJsonSchema,
} from "../src/lib/extraction/schemas.ts";
import {
  chooseTitle,
  pageTitleFallback,
  readPageTitle,
  toSourceTitle,
} from "../src/lib/extraction/titles.ts";
import {
  creatorLinks,
  sharesTitleWord,
} from "../src/lib/extraction/youtube/creator-links.ts";
import {
  descriptionLines,
  finalLadderReason,
  hasDescriptionText,
} from "../src/lib/extraction/youtube/ladder.ts";
import { parseYouTubeUrl } from "../src/lib/extraction/youtube/parse-youtube-url.ts";
import {
  durationSeconds,
  toVideoDetails,
  videosListSchema,
} from "../src/lib/extraction/youtube/video-details.ts";

let failures = 0;
let checks = 0;
function expect(label, actual, expected) {
  checks += 1;
  if (JSON.stringify(actual) === JSON.stringify(expected)) return;
  failures += 1;
  console.error(
    `FAIL ${label}: got ${JSON.stringify(actual)}, want ${JSON.stringify(expected)}`,
  );
}

// Link input (AC-1)
for (const [input, ok] of [
  ["https://example.com/recipe", true],
  ["  https://example.com/x  ", true],
  ["", false],
  ["   ", false],
  ["example.com", false],
  ["ftp://example.com/", false],
  [`https://example.com/${"a".repeat(2030)}`, false],
  [`https://example.com/${"é".repeat(1020)}`, false],
]) {
  expect(
    `link ${input.slice(0, 40)}`,
    linkInputSchema.safeParse(input).success,
    ok,
  );
}

// Host rules
for (const [input, want] of [
  ["https://youtube.com/watch?v=x", true],
  ["https://WWW.YouTube.com./shorts/x", true],
  ["https://music.youtube.com/watch?v=x", true],
  ["https://youtu.be/x", true],
  ["https://notyoutube.com/", false],
  ["https://youtube.com.evil.example/", false],
  ["htp:/broken", false],
  ["", false],
  ["youtube", false],
]) {
  expect(`isYouTubeHost(${input})`, isYouTubeHost(input), want);
}

// safeFetch hop checks (before DNS)
for (const [input, want] of [
  ["https://example.com/recipe", "ok"],
  ["http://127.0.0.1/", "blocked_url"],
  ["http://2130706433/", "blocked_url"],
  ["http://0x7f.1/", "blocked_url"],
  ["http://[::1]/", "blocked_url"],
  ["http://[::ffff:127.0.0.1]/", "blocked_url"],
  ["http://[::ffff:8.8.8.8]/", "ok"],
  ["http://[2606:4700:4700::1111]/", "ok"],
  ["http://[fe80::1]/", "blocked_url"],
  ["http://[fd00::1]/", "blocked_url"],
  ["http://169.254.169.254/latest/meta-data/", "blocked_url"],
  ["http://10.0.0.1/", "blocked_url"],
  ["http://100.64.0.1/", "blocked_url"],
  ["http://172.16.5.4/", "blocked_url"],
  ["http://192.168.1.1/", "blocked_url"],
  ["http://8.8.8.8/", "ok"],
  ["http://localhost/", "blocked_url"],
  ["http://a.localhost/", "blocked_url"],
  ["https://example.com:8443/", "blocked_url"],
  ["https://example.com:443/", "ok"],
  ["https://user:pw@example.com/", "blocked_url"],
  ["ftp://example.com/", "blocked_url"],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "blocked_url"],
]) {
  expect(`checkHop(${input})`, checkHop(new URL(input)), want);
}

// Titles
const titled = (html) => readPageTitle(parse(html));
expect(
  "suffix removed",
  chooseTitle([undefined, pageTitleFallback("Fluffy Pancakes | Serious Eats")]),
  "Fluffy Pancakes",
);
expect(
  "source title keeps suffix",
  toSourceTitle(titled("<title>Fluffy Pancakes | Serious Eats</title>")),
  "Fluffy Pancakes | Serious Eats",
);
expect("last separator", pageTitleFallback("Salt - Fat - Acid"), "Salt - Fat");
expect("nothing left keeps", pageTitleFallback("| Site"), "| Site");
expect(
  "og:title wins",
  titled('<meta property="og:title" content="OG"><title>T</title>'),
  "OG",
);
const spaced = `${"word ".repeat(26)}`.trim(); // 129 code points
const cutSpaced = chooseTitle([spaced]);
expect(
  "cut at space",
  [cutSpaced.length <= 120, cutSpaced.endsWith("word")],
  [true, true],
);
expect("hard cut", Array.from(chooseTitle(["x".repeat(130)])).length, 120);
expect(
  "emoji is one code point",
  Array.from(chooseTitle(["🍕".repeat(130)])).length,
  120,
);
expect(
  "source title cut",
  Array.from(toSourceTitle("y".repeat(400))).length,
  300,
);
expect("all blank", chooseTitle(["  ", undefined, ""]), undefined);

// Ingredient parser
for (const [line, quantity, unit, name] of [
  ["2 cups flour, sifted", "2", "cups", "flour, sifted"],
  ["8 fl oz milk", "8", "fl oz", "milk"],
  ["200g flour", "200", "g", "flour"],
  ["1½ tsp salt", "1 1/2", "tsp", "salt"],
  ["3 Tbsp. butter", "3", "Tbsp", "butter"],
  ["2-3 cloves garlic", "2-3", "cloves", "garlic"],
  ["2 to 3 tbsp olive oil", "2 to 3", "tbsp", "olive oil"],
  ["0,5 l water", "0,5", "l", "water"],
  ["1 cup of sugar", "1", "cup", "sugar"],
  ["2 eggs", "2", undefined, "eggs"],
  ["Salt to taste", undefined, undefined, "Salt to taste"],
  ["1 (14 oz) can tomatoes", "1", undefined, "(14 oz) can tomatoes"],
  ["2 cups", undefined, undefined, "2 cups"],
  [
    `${"1".repeat(41)} g flour`,
    undefined,
    undefined,
    `${"1".repeat(41)} g flour`,
  ],
]) {
  const parsed = parseIngredientLine(line);
  expect(
    `parse(${line.slice(0, 30)})`,
    [parsed.quantity, parsed.unit, parsed.name],
    [quantity, unit, name],
  );
}

// JSON-LD reader
const page = (...scripts) =>
  parse(
    `<html><head><title>Page | Site</title>${scripts
      .map((body) => `<script type="application/ld+json">${body}</script>`)
      .join("")}</head><body></body></html>`,
  );
const recipe = (extra = {}) => ({
  "@type": "Recipe",
  name: "Pancakes",
  recipeIngredient: ["2 cups flour", "1 egg"],
  recipeInstructions: [{ "@type": "HowToStep", text: "Mix." }],
  ...extra,
});
const read = (root) => readJsonLd(root, readPageTitle(root));
const usable = (result) => result.found && !result.multiple && result.usable;

expect(
  "@graph with type array",
  usable(
    read(
      page(
        JSON.stringify({
          "@graph": [
            { "@type": "WebSite" },
            recipe({ "@type": ["Recipe", "NewsArticle"] }),
          ],
        }),
      ),
    ),
  ),
  true,
);
expect(
  "WebPage.mainEntity",
  usable(
    read(page(JSON.stringify({ "@type": "WebPage", mainEntity: recipe() }))),
  ),
  true,
);
const stringSteps = read(
  page(
    JSON.stringify(
      recipe({ recipeInstructions: "Mix the flour.<br>Add egg.<p>Bake.</p>" }),
    ),
  ),
);
expect("string instructions split", stringSteps.recipe?.steps, [
  "Mix the flour.",
  "Add egg.",
  "Bake.",
]);
expect(
  "single HowToStep object",
  read(
    page(
      JSON.stringify(
        recipe({
          recipeInstructions: { "@type": "HowToStep", text: "Only step." },
        }),
      ),
    ),
  ).recipe?.steps,
  ["Only step."],
);
expect(
  "HowToSection single object",
  read(
    page(
      JSON.stringify(
        recipe({
          recipeInstructions: [
            {
              "@type": "HowToSection",
              name: "Batter",
              itemListElement: { "@type": "HowToStep", text: "Whisk." },
            },
          ],
        }),
      ),
    ),
  ).recipe?.steps,
  ["Whisk."],
);
const singleIngredient = read(
  page(JSON.stringify(recipe({ recipeIngredient: "2 cups flour" }))),
);
expect(
  "single ingredient string is unusable",
  [singleIngredient.found, singleIngredient.usable],
  [true, false],
);
expect(
  "blank entries dropped",
  read(
    page(
      JSON.stringify(
        recipe({
          recipeIngredient: ["2 cups flour", " ", "1 egg"],
          recipeInstructions: ["", "1. Mix."],
        }),
      ),
    ),
  ).recipe,
  {
    title: "Pancakes",
    ingredients: [
      { name: "flour", quantity: "2", unit: "cups" },
      { name: "egg", quantity: "1" },
    ],
    steps: ["Mix."],
  },
);
expect(
  "duplicate recipe collapses",
  usable(read(page(JSON.stringify(recipe()), JSON.stringify(recipe())))),
  true,
);
expect(
  "two distinct recipes",
  read(page(JSON.stringify([recipe(), recipe({ name: "Waffles" })]))),
  { found: true, multiple: true },
);
expect(
  "raw newline, comment and CDATA wrappers",
  [
    usable(read(page(JSON.stringify(recipe()).replace("Mix.", "Mix\nwell.")))),
    usable(read(page(`<!--${JSON.stringify(recipe())}-->`))),
    usable(read(page(`<![CDATA[${JSON.stringify(recipe())}]]>`))),
  ],
  [true, true, true],
);
expect(
  "invalid script skipped",
  usable(read(page("{not json", JSON.stringify(recipe())))),
  true,
);
const longStep = read(
  page(JSON.stringify(recipe({ recipeInstructions: ["x".repeat(1001)] }))),
);
expect(
  "step over 1000 is unusable",
  [longStep.found, longStep.usable],
  [true, false],
);
const entities = read(
  page(
    JSON.stringify(
      recipe({
        name: "Mac &amp; Cheese&#8217;s",
        recipeInstructions: ['Stir <a href="/x">well</a>.'],
      }),
    ),
  ),
);
expect(
  "entities and tags",
  [entities.recipe?.title, entities.recipe?.steps],
  ["Mac & Cheese’s", ["Stir well."]],
);
expect("no JSON-LD", read(page()), { found: false });
expect(
  "blank name falls back to page title",
  read(page(JSON.stringify(recipe({ name: "" })))).recipe?.title,
  "Page",
);

// Page text
const longStory = "Story line about my grandmother and her kitchen. ".repeat(
  10,
);
const pageText = readPageText(
  parse(
    `<body><nav>Menu</nav><header>Head</header><aside>Ad</aside><footer>Foot</footer>
     <script>var x</script><style>p{}</style><div hidden>Secret</div>
     <form><input> Join our newsletter</form>
     <article><h1>Soup</h1><p>${longStory}</p><ul><li>2 cups water</li></ul></article></body>`,
  ),
);
const joined = pageText.lines.join("\n");
expect(
  "stripped elements gone",
  ["Menu", "Head", "Ad", "Foot", "var x", "Secret", "newsletter"].some((word) =>
    joined.includes(word),
  ),
  false,
);
expect("article kept", pageText.lines.includes("2 cups water"), true);
const formPage = readPageText(
  parse(`<body><form><p>${longStory}</p><p>2 eggs</p></form></body>`),
);
expect("big form keeps content", formPage.lines.includes("2 eggs"), true);
const bigLines = Array.from(
  { length: 2000 },
  (_, index) => `<p>line ${index} ${"z".repeat(40)}</p>`,
).join("");
const bigText = readPageText(
  parse(`<body>${bigLines}<p>RECIPE CARD 2 cups flour</p></body>`),
);
expect(
  "long page keeps head and tail",
  [
    bigText.trimmed,
    bigText.lines[0]?.startsWith("line 0 "),
    bigText.lines.at(-1),
    bigText.chars <= 60_001,
  ],
  [true, true, "RECIPE CARD 2 cups flour", true],
);
expect(
  "short page under 300",
  readPageText(parse(`<body><p>${"a".repeat(250)}</p></body>`)).chars < 300,
  true,
);

// Hostile markup is refused before `parse` can block the event loop or a walker overflows
const timed = (fn) => {
  const start = performance.now();
  try {
    return { value: fn(), ms: performance.now() - start };
  } catch (error) {
    return { value: error.name, ms: performance.now() - start };
  }
};
const refusedOrRead = (html) => {
  const root = parseHtml(html);
  return root ? readPageText(root).chars : "refused";
};
const ordinaryPage = `<!doctype html><html><head><title>Lentil Soup | Blog</title>
  <script type="application/ld+json">${JSON.stringify({ "@graph": [{ "@type": "WebPage" }, recipe()] })}</script>
  </head><body><div class="wrap"><header><nav><ul><li><a href="/">Home</a><li>About</ul></nav></header>
  <main><article><h1>Lentil Soup</h1><p>${longStory}<p>Unclosed paragraph <span>and a stray span
  <ul><li>1 cup lentils<li>2 cups water</ul><img src="a.jpg" alt=""><br>
  <table><tr><td>Serves<td>4</table></article></main></div><footer>Foot</footer></body></html>`;
expect(
  "ordinary page parses exactly as before",
  parseHtml(ordinaryPage)?.toString(),
  parse(ordinaryPage).toString(),
);
expect(
  "ordinary page still reads",
  [
    usable(read(parseHtml(ordinaryPage))),
    readPageText(parseHtml(ordinaryPage)).lines.includes("1 cup lentils"),
  ],
  [true, true],
);
const unclosed = timed(() =>
  refusedOrRead(`<body>${"<div>".repeat(8_000)}2 cups flour</body>`),
);
expect(
  "8,000 unclosed tags refused fast",
  [unclosed.value, unclosed.ms < 1_000],
  ["refused", true],
);
const deepClosed = timed(() =>
  refusedOrRead(
    `<body>${"<div>".repeat(50_000)}x${"</div>".repeat(50_000)}</body>`,
  ),
);
expect(
  "deep closed nesting refused without overflow",
  [deepClosed.value, deepClosed.ms < 1_000],
  ["refused", true],
);
expect(
  "nesting at the limit still parses",
  parseHtml(`${"<div>".repeat(200)}x${"</div>".repeat(200)}`) !== undefined,
  true,
);
expect(
  "hostile JSON-LD nesting refused",
  [
    read(page(`${"[".repeat(100_000)}${"]".repeat(100_000)}`)),
    read(page(`${'{"@graph":['.repeat(50_000)}${"]}".repeat(50_000)}`)),
    read(
      page(
        JSON.stringify(recipe({ recipeInstructions: [] })).replace(
          '"recipeInstructions":[]',
          `"recipeInstructions":${"[".repeat(100_000)}"Mix."${"]".repeat(100_000)}`,
        ),
      ),
    ),
  ],
  [{ found: false }, { found: false }, { found: false }],
);
expect(
  "brackets inside JSON strings do not count",
  usable(
    read(page(JSON.stringify(recipe({ name: "[".repeat(500) + "Soup" })))),
  ),
  true,
);
expect(
  "deep markup in a JSON-LD field reads as empty",
  htmlStringToLines(`${"<b>".repeat(5_000)}Mix.`),
  [],
);
// Every parse of fetched or JSON-LD markup goes through parseHtml (web and creator page alike)
const sourceRoot = new URL("../src/", import.meta.url);
const rawParsers = readdirSync(sourceRoot, { recursive: true })
  .filter((file) => /\.tsx?$/.test(file))
  .filter((file) =>
    /import\s*\{[^}]*\bparse\b[^}]*\}\s*from\s*"node-html-parser"/.test(
      readFileSync(new URL(file, sourceRoot), "utf8"),
    ),
  );
expect("only parse-html imports parse", rawParsers, [
  "lib/extraction/parse-html.ts",
]);
for (const file of [
  "lib/extraction/extract-from-web.ts",
  "lib/extraction/youtube/creator-page.ts",
]) {
  expect(
    `${file} guards fetched html`,
    readFileSync(new URL(file, sourceRoot), "utf8").includes(
      "parseHtml(fetched.html)",
    ),
    true,
  );
}

// Grounding
expect("oil is not boil", tokensOf("boil").includes("oil"), false);
expect("crème stays one token", tokensOf("Crème fraîche"), [
  "crème",
  "fraîche",
]);
const source = [
  "Pancakes",
  "2 cups flour",
  "1 egg",
  "Mix and bake for 20 minutes.",
];
expect(
  "amount on another line is cleared",
  ground(
    {
      ingredients: [
        { name: "flour", quantity: "1", unit: "cup" },
        { name: "egg", quantity: "1" },
      ],
      steps: ["Mix."],
    },
    source,
  ),
  {
    grounded: true,
    ingredients: [{ name: "flour" }, { name: "egg", quantity: "1" }],
    steps: ["Mix."],
    droppedIngredients: 0,
    clearedAmounts: 1,
  },
);
expect(
  "unstated number in step",
  ground(
    {
      ingredients: [{ name: "flour" }, { name: "egg" }],
      steps: ["Bake 25 minutes."],
    },
    source,
  ).grounded,
  false,
);
expect(
  "dropped ingredient in step",
  ground(
    {
      ingredients: [{ name: "flour" }, { name: "egg" }, { name: "saffron" }],
      steps: ["Add saffron."],
    },
    source,
  ),
  {
    grounded: false,
    reason: "ungrounded_step",
    droppedIngredients: 1,
    clearedAmounts: 0,
  },
);
expect(
  "half equals 1/2",
  ground({ ingredients: [], steps: ["Use half."] }, ["1/2 cup"]).grounded,
  true,
);

// Model output order (AC-8)
const accept = (response) =>
  acceptModelResponse(response, {
    method: "web_model",
    sourceLines: source,
    titleAfter: "Pancakes",
  }).result;
expect(
  "one ingredient is insufficient",
  accept({
    outcome: "recipe",
    title: "Pancakes",
    ingredients: [{ name: "flour" }],
    steps: ["Mix."],
  }),
  { outcome: "insufficient", reason: "missing_ingredients" },
);
expect(
  "name over 120 is invalid output",
  accept({
    outcome: "recipe",
    ingredients: [{ name: "f".repeat(121) }, { name: "egg" }],
    steps: ["Mix."],
  }),
  { outcome: "ingestion_failed", reason: "invalid_model_output" },
);
expect(
  "ungrounded step",
  accept({
    outcome: "recipe",
    ingredients: [{ name: "flour" }, { name: "egg" }],
    steps: ["Bake 25 minutes."],
  }),
  { outcome: "insufficient", reason: "ungrounded_step" },
);
expect("not a recipe", accept({ outcome: "not_a_recipe" }), {
  outcome: "not_a_recipe",
  reason: "not_a_recipe",
});
expect(
  "insufficient keeps model reason",
  accept({ outcome: "insufficient", reason: "multiple_recipes" }),
  { outcome: "insufficient", reason: "multiple_recipes" },
);
expect(
  "insufficient derives reason",
  accept({
    outcome: "insufficient",
    reason: "other",
    ingredients: [{ name: "a" }, { name: "b" }],
  }),
  { outcome: "insufficient", reason: "missing_steps" },
);
expect(
  "grounded recipe accepted",
  accept({
    outcome: "recipe",
    ingredients: [
      { name: "flour", quantity: "2", unit: "cups" },
      { name: "egg" },
    ],
    steps: ["1. Mix and bake for 20 minutes."],
  }),
  {
    outcome: "recipe",
    recipe: {
      title: "Pancakes",
      ingredients: [
        { name: "flour", quantity: "2", unit: "cups" },
        { name: "egg" },
      ],
      steps: ["Mix and bake for 20 minutes."],
    },
    method: "web_model",
  },
);

// Gemini failure mapping (AC-9)
const apiError = (status, message = "x") =>
  Object.assign(new Error(message), { status });
const dailyQuota = JSON.stringify({
  error: {
    details: [
      {
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{ quotaId: "GenerateRequestsPerDayPerProjectPerModel" }],
      },
    ],
  },
});
const mapped = (error, aborted = false) => {
  const { reason, retry } = classifyGeminiError(error, aborted);
  return [reason, retry];
};
expect("429 per day", mapped(apiError(429, `got 429. ${dailyQuota}`)), [
  "provider_error",
  false,
]);
for (const status of [429, 500, 502, 503, 504]) {
  expect(`http ${status}`, mapped(apiError(status)), ["provider_error", true]);
}
expect(
  "network error",
  mapped(
    Object.assign(new TypeError("fetch failed"), {
      cause: { code: "ECONNRESET" },
    }),
  ),
  ["provider_error", true],
);
expect("abort", mapped(Object.assign(new Error("a"), { name: "AbortError" })), [
  "timeout",
  false,
]);
expect("aborted signal", mapped(apiError(503), true), ["timeout", false]);
for (const status of [400, 401, 403, 404]) {
  expect(`http ${status}`, mapped(apiError(status)), [
    "provider_rejected",
    false,
  ]);
}
expect("other status", mapped(apiError(418)), ["provider_error", false]);
const responseReason = (response) =>
  classifyGeminiResponse(response).reason ?? "ok";
expect(
  "prompt blocked",
  responseReason({ promptFeedback: { blockReason: "SAFETY" } }),
  "model_blocked",
);
for (const finishReason of [
  "SAFETY",
  "RECITATION",
  "BLOCKLIST",
  "PROHIBITED_CONTENT",
  "SPII",
]) {
  expect(
    `finish ${finishReason}`,
    responseReason({ candidates: [{ finishReason }], text: "{}" }),
    "model_blocked",
  );
}
expect(
  "max tokens",
  responseReason({ candidates: [{ finishReason: "MAX_TOKENS" }], text: "{" }),
  "invalid_model_output",
);
expect(
  "no candidates",
  responseReason({ candidates: [] }),
  "invalid_model_output",
);
expect(
  "empty text",
  responseReason({ candidates: [{ finishReason: "STOP" }], text: "" }),
  "invalid_model_output",
);
expect(
  "good response",
  responseReason({ candidates: [{ finishReason: "STOP" }], text: "{}" }),
  "ok",
);

// YouTube link forms (0002 AC-1, AC-2)
const ID = "dQw4w9WgXcQ";
const CANONICAL = `https://www.youtube.com/watch?v=${ID}`;
for (const [input, want] of [
  [`https://www.youtube.com/watch?v=${ID}`, CANONICAL],
  [`https://youtube.com/watch?v=${ID}&t=30`, CANONICAL],
  [`https://m.youtube.com/watch?v=${ID}&t=30`, CANONICAL],
  [`http://www.youtube.com/watch?feature=share&v=${ID}`, CANONICAL],
  [`https://youtu.be/${ID}?si=abc123`, CANONICAL],
  [`https://www.youtube.com/shorts/${ID}`, CANONICAL],
  [`https://youtube.com/shorts/${ID}?si=xyz`, CANONICAL],
  [`https://YouTube.com./watch?v=${ID}`, CANONICAL],
  ["https://www.youtube.com/@channel", undefined],
  [`https://www.youtube.com/embed/${ID}`, undefined],
  [`https://www.youtube.com/live/${ID}`, undefined],
  ["https://www.youtube.com/playlist?list=PL123", undefined],
  ["https://www.youtube.com/watch?v=short", undefined],
  [`https://www.youtube.com/watch?v=${ID}x`, undefined],
  ["https://youtu.be/", undefined],
  [`https://music.youtube.com/watch?v=${ID}`, undefined],
  [`https://www.youtube.com/channel/${ID}`, undefined],
]) {
  expect(`youtube ${input}`, parseYouTubeUrl(input)?.canonicalUrl, want);
}

// Data API duration and watchability (0002 *Watchability*)
for (const [input, want] of [
  ["PT1H2M3S", 3723],
  ["PT45S", 45],
  ["PT20M", 1200],
  ["P1DT2H", 93600],
  ["P0D", 0],
  ["PT", undefined],
  ["", undefined],
  [undefined, undefined],
  ["1:20", undefined],
]) {
  expect(`duration ${input}`, durationSeconds(input), want);
}
const item = (overrides = {}) => ({
  snippet: {
    title: " Miso Soup ",
    description: "d",
    channelTitle: "Chef",
    liveBroadcastContent: "none",
    ...overrides.snippet,
  },
  contentDetails: { duration: "PT5M", ...overrides.contentDetails },
  status: { privacyStatus: "public", ...overrides.status },
});
const details = (items) => toVideoDetails(videosListSchema.parse({ items }));
expect("video empty", details([]).available, false);
expect(
  "video live",
  details([item({ snippet: { liveBroadcastContent: "live" } })]).available,
  false,
);
expect(
  "video upcoming",
  details([item({ snippet: { liveBroadcastContent: "upcoming" } })]).available,
  false,
);
expect("video title trimmed", details([item()]).video?.title, "Miso Soup");
for (const duration of [undefined, "", "1:20"]) {
  expect(
    `video duration unreadable ${duration}`,
    details([item({ contentDetails: { duration } })]).available,
    "error",
  );
}
for (const [label, overrides, want] of [
  ["public short", {}, "watchable"],
  [
    "unlisted",
    { status: { privacyStatus: "unlisted" } },
    "video_not_watchable",
  ],
  [
    "age restricted",
    { contentDetails: { contentRating: { ytRating: "ytAgeRestricted" } } },
    "video_not_watchable",
  ],
  [
    "region restricted",
    { contentDetails: { regionRestriction: { blocked: ["DE"] } } },
    "video_not_watchable",
  ],
  ["21 minutes", { contentDetails: { duration: "PT21M" } }, "video_too_long"],
  ["20 minutes", { contentDetails: { duration: "PT20M" } }, "watchable"],
]) {
  expect(
    `watchability ${label}`,
    details([item(overrides)]).video?.watchability,
    want,
  );
}

// Creator page links (0002 *Step 1*, AC-4)
expect(
  "creator links: deny list, dedup, path first",
  creatorLinks(
    [
      "Full recipe: https://www.example.com/ (home)",
      "Recipe → https://cook.example.org/recipes/miso-soup.",
      "Again https://cook.example.org/recipes/miso-soup",
      "https://www.instagram.com/chef https://youtu.be/abc https://www.pinterest.co.uk/x",
      "https://smile.amazon.de/dp/1 https://amzn.to/x https://bit.ly/y https://linktr.ee/z",
      "https://m.facebook.com/chef https://music.youtube.com/x",
      "Shop: https://shop.example.net/knife)",
    ].join("\n"),
  ),
  [
    "https://cook.example.org/recipes/miso-soup",
    "https://shop.example.net/knife",
    "https://www.example.com/",
  ],
);
expect("creator links none", creatorLinks("no links here"), []);
for (const [name, video, want] of [
  ["White Miso Soup", "Easy Miso Soup in 10 Minutes", true],
  ["Best Lasagna Ever", "Grandma's Sunday Special", false],
  ["The Easy Recipe", "The Best Easy Recipe Video", false],
  ["Roasted Tomatoes", "Roasted tomato salad", true],
  [undefined, "Miso Soup", false],
]) {
  expect(
    `title overlap ${name} / ${video}`,
    sharesTitleWord(name, video),
    want,
  );
}

// Ladder (0002 *Ladder rules*, AC-7)
expect(
  "description under 100 chars after links",
  hasDescriptionText(`${"x".repeat(60)} https://example.com/${"y".repeat(80)}`),
  false,
);
expect("description of 100 chars", hasDescriptionText("x".repeat(100)), true);
expect(
  "description cut to 60,000",
  descriptionLines("a".repeat(60_010)).join("").length,
  60_000,
);
expect("ladder nothing seen", finalLadderReason([]), "no_written_recipe");
expect(
  "ladder partial",
  finalLadderReason(["ungrounded_step", "missing_steps"]),
  "missing_steps",
);
expect(
  "ladder ignores other reasons",
  finalLadderReason(["multiple_recipes"]),
  "no_written_recipe",
);

// Grounding on a YouTube description with chapter timestamps (0002 AC-6)
const description = [
  "Miso Soup",
  "0:25 Bake",
  "2 tbsp white miso",
  "1 block tofu",
  "Water",
  "Stir the miso into the hot water.",
];
expect(
  "timestamp line does not ground a number",
  ground(
    {
      ingredients: [{ name: "white miso" }, { name: "tofu" }],
      steps: ["Bake 25 minutes."],
    },
    description,
  ).grounded,
  false,
);
expect(
  "amount on another line is cleared",
  ground(
    {
      ingredients: [
        { name: "tofu", quantity: "2", unit: "tbsp" },
        { name: "white miso", quantity: "2", unit: "tbsp" },
      ],
      steps: ["Stir the miso into the water."],
    },
    description,
  ),
  {
    grounded: true,
    ingredients: [
      { name: "tofu" },
      { name: "white miso", quantity: "2", unit: "tbsp" },
    ],
    steps: ["Stir the miso into the water."],
    droppedIngredients: 0,
    clearedAmounts: 1,
  },
);
expect(
  '"oil" is not grounded by "boil"',
  ground(
    {
      ingredients: [{ name: "oil" }, { name: "tofu" }],
      steps: ["Boil water."],
    },
    ["Boil the tofu"],
  ).ingredients,
  [{ name: "tofu" }],
);

// Provider schema stays inside Gemini's subset
const schemaText = JSON.stringify(providerResponseJsonSchema);
expect(
  "no $schema or additionalProperties",
  [schemaText.includes("$schema"), schemaText.includes("additionalProperties")],
  [false, false],
);

if (failures > 0) {
  console.error(`${failures} of ${checks} extraction checks failed`);
  process.exit(1);
}
console.log(`extraction checks passed (${checks})`);
