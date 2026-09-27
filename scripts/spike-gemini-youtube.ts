/**
 * Throwaway feasibility spike for spec 0001: can Gemini read a public YouTube
 * URL directly and return a structured recipe?
 *
 * Run all five videos:  pnpm spike:gemini-youtube
 * Run one on its own:   pnpm spike:gemini-youtube -- 3
 *                       pnpm spike:gemini-youtube -- "food vlog"
 * Needs GEMINI_API_KEY and GEMINI_MODEL in .env.local, on a billing enabled key.
 *
 * Record the printed table in docs/specs/0001-stack-architecture/rationale.md
 * under "Evidence: Gemini YouTube spike". This script is deleted once the
 * evidence is recorded.
 */
import { GoogleGenAI, MediaResolution } from "@google/genai";

const VIDEOS: { label: string; url: string; expected: Outcome }[] = [
  {
    label: "long cooking video, recipe spoken",
    url: "https://www.youtube.com/watch?v=pEQUtFB8MEw",
    expected: "recipe",
  },
  {
    label: "Short, recipe spoken or on screen",
    url: "https://youtube.com/shorts/SyNr_a5ljBE?si=2QfeDrb-_06IGDaP",
    expected: "recipe",
  },
  {
    // Run 1 returned recipe 3/3 here, naming the dish, its ingredients and the
    // sequence, from a cooking demonstration with no spoken or written recipe.
    // That is the capability we want, so the old insufficient label was the
    // thing that was wrong, not the model. Kept as a recipe case because visual
    // only reconstruction is the most demo relevant finding so far.
    label: "cooking demonstration, no spoken or written recipe",
    url: "https://youtube.com/shorts/md2MW3_qb6k?si=holzoC_XS24j--cm",
    expected: "recipe",
  },
  {
    // Food content that genuinely cannot be cooked from: a tasting vlog, not a
    // demonstration. This is the real insufficient probe.
    label: "food vlog, nothing to cook from",
    url: "https://youtube.com/shorts/TWMJKeWo5Bc?si=ao0cmmHbI_4T7zRM",
    expected: "insufficient",
  },
  {
    label: "non food video",
    url: "https://youtu.be/3DMO6rmDEsw?si=sn1g2rmJQ-mfTWUl",
    expected: "not_a_recipe",
  },
];

const RUNS_PER_VIDEO = 3;
const STEP_BUDGET_MS = 55_000;
const RETRY_DELAY_MS = 3_000;
/** Spec 0001: a video short of 3 completed runs is rerun, at most twice, then inconclusive. */
const MAX_RERUNS = 2;
const MEDIA_RESOLUTION = MediaResolution.MEDIA_RESOLUTION_LOW;
const THINKING_BUDGET = 0;

type Outcome = "recipe" | "not_a_recipe" | "insufficient";

/**
 * The outcome lines are an ordered decision, because run 2 showed the model
 * answering not_a_recipe for a food vlog while its own reason described food
 * content without enough to cook from, which is the definition of
 * insufficient. Asking "is it about food" first, and only then "is there
 * enough to cook from", removes the overlap the old wording left open.
 */
const PROMPT = [
  "You are watching a video and deciding what recipe content, if any, it contains.",
  "Use only information explicitly stated, spoken, or visibly shown in the video.",
  "Never invent ingredients, quantities, units, or cooking steps.",
  "Decide in two steps.",
  "Step one: is the video about food or cooking in any way?",
  "If it is not about food or cooking at all, answer not_a_recipe and stop.",
  "Step two: the video is about food, so decide whether it shows enough to cook the dish.",
  "Answer recipe when you can list at least 2 ingredients and at least 1 cooking step taken from the video.",
  "Answer insufficient when it is food or cooking content but does not show enough to cook the dish, for example a tasting video, a review, or a montage with no method.",
  "Never answer not_a_recipe for food or cooking content; if it is food related, the answer is recipe or insufficient.",
  "Watching someone cook counts as a source, even with no narration and no on screen text: describe what they use and what they do.",
  "Leave quantity and unit empty unless the video states the amount out loud or shows it in writing.",
  "An empty amount is a correct answer. A plausible amount the video never gave is a failure.",
  "When the outcome is not recipe, give a short reason.",
].join(" ");

// Kept deliberately flat: Gemini accepts a subset of JSON Schema (objects,
// arrays, strings, integers, enums, required, description; no $ref, no unions,
// no formats or patterns, at most 3 levels deep).
const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    outcome: { type: "string", enum: ["recipe", "not_a_recipe", "insufficient"] },
    reason: { type: "string", description: "Why, when the outcome is not recipe." },
    title: { type: "string" },
    ingredients: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "string", description: "Empty when the video does not state it." },
          unit: { type: "string", description: "Empty when the video does not state it." },
        },
        required: ["name"],
      },
    },
    steps: { type: "array", items: { type: "string" } },
  },
  required: ["outcome"],
};

type ParsedResult = {
  outcome?: Outcome;
  reason?: string;
  title?: string;
  ingredients?: { name: string; quantity?: string; unit?: string }[];
  steps?: string[];
};

type RunRecord =
  | {
      kind: "ok";
      parsed: ParsedResult;
      latencyMs: number;
      inputTokens: number;
      outputTokens: number;
      retried: boolean;
    }
  | { kind: "transient"; message: string }
  | { kind: "too_slow"; latencyMs: number }
  | { kind: "error"; message: string };

/**
 * The provider schema stays flat so Gemini accepts it, which means it cannot
 * express the count and non blank rules. They are checked here instead, and a
 * recipe that fails them is a failed run even when the outcome is the one we
 * expected.
 */
function isStructurallyValid(parsed: ParsedResult) {
  if (parsed.outcome !== "recipe") {
    return true;
  }
  const namedIngredients = (parsed.ingredients ?? []).filter((ingredient) => ingredient.name?.trim());
  const realSteps = (parsed.steps ?? []).filter((step) => step.trim());
  return Boolean(parsed.title?.trim()) && namedIngredients.length >= 2 && realSteps.length >= 1;
}

/**
 * Run 2 lost 5 of its 12 calls to 503, which makes the "2 of 3 runs" pass rule
 * unmeasurable. Spec 0001 already allows one retry on 429, 500 and 503, so the
 * spike takes it too, and reports a call that still fails as transient rather
 * than as a wrong answer.
 */
function isTransient(error: unknown) {
  const status = (error as { status?: number })?.status;
  if (status === 429 || status === 500 || status === 503) {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b(429|500|503)\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED/i.test(message);
}

/**
 * A call cut off at the 55 s step deadline is its own bucket in spec 0001: a
 * speed failure, never a wrong answer and never retried (spec 0001 retries only
 * 429, 500 and 503). Without this check an aborted call landed in `error`, where
 * a slow provider looked like a broken schema.
 */
function isTimeout(error: unknown) {
  const name = (error as { name?: string })?.name;
  if (name === "TimeoutError" || name === "AbortError") {
    return true;
  }
  const message = error instanceof Error ? error.message : String(error);
  return /\b(abort|aborted|timed? ?out|timeout)\b/i.test(message);
}

function videoIdOf(input: string) {
  const url = new URL(input);
  const id =
    url.hostname === "youtu.be"
      ? url.pathname.slice(1)
      : (url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop());
  if (!id || !/^[\w-]{11}$/.test(id)) {
    throw new Error(`No valid YouTube video id in ${input}`);
  }
  return id;
}

function canonicalYouTubeUrl(input: string) {
  return `https://www.youtube.com/watch?v=${videoIdOf(input)}`;
}

async function runOnce(ai: GoogleGenAI, model: string, videoUrl: string) {
  const startedAt = Date.now();
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [{ fileData: { fileUri: videoUrl } }, { text: PROMPT }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseJsonSchema: RESPONSE_SCHEMA,
      maxOutputTokens: 4096,
      mediaResolution: MEDIA_RESOLUTION,
      thinkingConfig: { thinkingBudget: THINKING_BUDGET },
      abortSignal: AbortSignal.timeout(STEP_BUDGET_MS),
    },
  });

  return {
    latencyMs: Date.now() - startedAt,
    inputTokens: response.usageMetadata?.promptTokenCount ?? 0,
    outputTokens: response.usageMetadata?.candidatesTokenCount ?? 0,
    parsed: JSON.parse(response.text ?? "{}") as ParsedResult,
  };
}

async function runWithOneRetry(ai: GoogleGenAI, model: string, videoUrl: string): Promise<RunRecord> {
  for (const attempt of [1, 2]) {
    const startedAt = Date.now();
    try {
      const result = await runOnce(ai, model, videoUrl);
      return { kind: "ok", ...result, retried: attempt === 2 };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (isTimeout(error)) {
        return { kind: "too_slow", latencyMs: Date.now() - startedAt };
      }
      if (!isTransient(error)) {
        return { kind: "error", message };
      }
      if (attempt === 2) {
        return { kind: "transient", message };
      }
      await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
    }
  }
  throw new Error("unreachable");
}

function amountOf(ingredient: { quantity?: string; unit?: string }) {
  return [ingredient.quantity?.trim(), ingredient.unit?.trim()].filter(Boolean).join(" ");
}

/**
 * The grounding question spec 0001 asks the spike to answer. Video cannot be
 * grounded against source text the way a web page can, so the only signal
 * available is disagreement between runs of the same video: an ingredient that
 * appears in some runs but not others, or an amount that changes, was not read
 * off the video. Run 1 saw exactly this on the Short.
 */
function reportGroundingVariance(records: RunRecord[]) {
  const recipes = records
    .filter((record): record is Extract<RunRecord, { kind: "ok" }> => record.kind === "ok")
    .map((record) => record.parsed)
    .filter((parsed) => parsed.outcome === "recipe");

  if (recipes.length < 2) {
    console.log("    grounding: needs at least 2 recipe runs to compare");
    return;
  }

  const amountsByIngredient = new Map<string, string[]>();
  for (const parsed of recipes) {
    for (const ingredient of parsed.ingredients ?? []) {
      const name = ingredient.name?.trim().toLowerCase();
      if (!name) continue;
      amountsByIngredient.set(name, [...(amountsByIngredient.get(name) ?? []), amountOf(ingredient)]);
    }
  }

  const unstable = [...amountsByIngredient.entries()].filter(
    ([, amounts]) => amounts.length < recipes.length || new Set(amounts).size > 1,
  );

  if (unstable.length === 0) {
    console.log(`    grounding: stable across ${recipes.length} recipe runs`);
    return;
  }

  console.log(`    grounding: ${unstable.length} unstable of ${amountsByIngredient.size} ingredients`);
  for (const [name, amounts] of unstable) {
    const seen = amounts.map((amount) => (amount === "" ? "(none)" : amount));
    const absentIn = recipes.length - amounts.length;
    const absent = absentIn > 0 ? ` · absent in ${absentIn} run(s)` : "";
    console.log(`      ${name}: ${seen.join(" | ")}${absent}`);
  }
}

function reportVideoSummary(
  expected: Outcome,
  records: RunRecord[],
  reruns: number,
  inconclusive: boolean,
) {
  const completed = records.filter(
    (record): record is Extract<RunRecord, { kind: "ok" }> => record.kind === "ok",
  );
  const transient = records.filter((record) => record.kind === "transient").length;
  const tooSlow = records.filter((record) => record.kind === "too_slow").length;
  const errored = records.filter((record) => record.kind === "error").length;
  const matched = completed.filter((record) => record.parsed.outcome === expected).length;
  const valid = completed.filter((record) => isStructurallyValid(record.parsed)).length;

  console.log(
    [
      `    summary: completed=${completed.length}/${RUNS_PER_VIDEO}`,
      `transient=${transient}`,
      `too_slow=${tooSlow}`,
      `errors=${errored}`,
      `reruns=${reruns}/${MAX_RERUNS}`,
      `outcomeMatch=${matched}/${completed.length}`,
      `validRecipe=${valid}/${completed.length}`,
    ].join(" · "),
  );

  if (inconclusive) {
    console.log(
      `    INCONCLUSIVE: only ${completed.length} of ${RUNS_PER_VIDEO} runs completed after ${MAX_RERUNS} reruns` +
        (expected === "recipe" ? " · spec 0001 counts this as a fail for a recipe video" : ""),
    );
  }
  if (tooSlow > 0) {
    console.log(`    TOO_SLOW x${tooSlow}: spec 0001 fails the spike on any too_slow call`);
  }

  if (expected === "recipe") {
    reportGroundingVariance(records);
  }
}

function logRun(runNumber: number, expected: Outcome, record: RunRecord) {
  if (record.kind === "transient") {
    console.log(`  run ${runNumber} · TRANSIENT after 1 retry · ${record.message}`);
    return;
  }
  if (record.kind === "too_slow") {
    console.log(
      `  run ${runNumber} · TOO_SLOW · cut off at ${record.latencyMs}ms (step budget ${STEP_BUDGET_MS}ms)`,
    );
    return;
  }
  if (record.kind === "error") {
    console.log(`  run ${runNumber} · FAILED · ${record.message}`);
    return;
  }

  const { parsed } = record;
  console.log(
    [
      `  run ${runNumber}`,
      `outcome=${parsed.outcome}`,
      `outcomeMatch=${parsed.outcome === expected}`,
      `validRecipe=${isStructurallyValid(parsed)}`,
      `latency=${record.latencyMs}ms`,
      `in=${record.inputTokens}`,
      `out=${record.outputTokens}`,
      `retried=${record.retried}`,
    ].join(" · "),
  );

  if (parsed.outcome === "recipe") {
    console.log(`    title: ${parsed.title?.trim() || "(missing)"}`);
    for (const ingredient of parsed.ingredients ?? []) {
      const amount = amountOf(ingredient);
      console.log(`    - ${amount ? `${amount} ` : ""}${ingredient.name}`);
    }
    const steps = parsed.steps ?? [];
    console.log(`    steps: ${steps.length}`);
    steps.forEach((step, index) => console.log(`      ${index + 1}. ${step}`));
  } else if (parsed.reason?.trim()) {
    console.log(`    reason: ${parsed.reason.trim()}`);
  }
}

type Video = (typeof VIDEOS)[number];

/**
 * Spec 0001's rerun cap: take 3 runs, then top up the shortfall at most twice.
 * A run lost to provider load or to the step deadline is not a completed run, so
 * without the top up the "2 of 3 completed runs" pass rule has nothing to judge.
 */
async function runVideo(ai: GoogleGenAI, model: string, video: Video) {
  const canonical = canonicalYouTubeUrl(video.url);
  console.log(`\n=== ${video.label} (expected ${video.expected})\n    ${canonical}`);

  const records: RunRecord[] = [];
  const completedCount = () => records.filter((record) => record.kind === "ok").length;
  let runNumber = 0;

  const takeRuns = async (count: number) => {
    for (let run = 0; run < count; run += 1) {
      runNumber += 1;
      const record = await runWithOneRetry(ai, model, canonical);
      records.push(record);
      logRun(runNumber, video.expected, record);
    }
  };

  await takeRuns(RUNS_PER_VIDEO);

  let reruns = 0;
  while (completedCount() < RUNS_PER_VIDEO && reruns < MAX_RERUNS) {
    reruns += 1;
    const shortfall = RUNS_PER_VIDEO - completedCount();
    console.log(`  rerun ${reruns}/${MAX_RERUNS} · ${shortfall} more completed run(s) needed`);
    await takeRuns(shortfall);
  }

  const inconclusive = completedCount() < RUNS_PER_VIDEO;
  reportVideoSummary(video.expected, records, reruns, inconclusive);

  return { label: video.label, expected: video.expected, records, inconclusive };
}

/**
 * Lets a single video be rerun on its own (`pnpm spike:gemini-youtube -- 3`, or
 * a word from its label), so topping up one video does not pay for the other
 * four.
 */
function selectVideos(argv: string[]) {
  // pnpm forwards the `--` separator itself, and a loose URL substring match on
  // it hits any URL containing "--". Match on the number, the label, or the
  // exact 11 character video id only.
  const needles = argv
    .filter((arg) => arg !== "--")
    .map((arg) => arg.trim().toLowerCase())
    .filter((arg) => arg.length >= 2);

  if (needles.length === 0) {
    return VIDEOS;
  }

  const selected = VIDEOS.filter((video, index) =>
    needles.some(
      (needle) =>
        needle === String(index + 1) ||
        needle === videoIdOf(video.url).toLowerCase() ||
        video.label.toLowerCase().includes(needle),
    ),
  );

  if (selected.length === 0) {
    throw new Error(
      `No video matched "${needles.join(" ")}". Use a number 1 to ${VIDEOS.length}, a video id, or a word from a label:\n` +
        VIDEOS.map((video, index) => `  ${index + 1}. ${video.label}`).join("\n"),
    );
  }
  return selected;
}

async function main() {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL;
  if (!apiKey || !model) {
    throw new Error("Set GEMINI_API_KEY and GEMINI_MODEL in .env.local first.");
  }

  const missing = VIDEOS.filter((video) => !video.url);
  if (missing.length > 0) {
    throw new Error(
      `Fill in the video URLs at the top of this script. Still empty: ${missing
        .map((video) => video.label)
        .join(", ")}`,
    );
  }

  const videos = selectVideos(process.argv.slice(2));

  const ai = new GoogleGenAI({ apiKey });
  console.log(
    `model: ${model} · mediaResolution: ${MEDIA_RESOLUTION} · thinkingBudget: ${THINKING_BUDGET} · stepBudget: ${STEP_BUDGET_MS}ms · runsPerVideo: ${RUNS_PER_VIDEO} · maxReruns: ${MAX_RERUNS}`,
  );
  if (videos.length < VIDEOS.length) {
    console.log(`selected ${videos.length} of ${VIDEOS.length} videos`);
  }

  const results = [];
  for (const video of videos) {
    results.push(await runVideo(ai, model, video));
  }

  const inconclusive = results.filter((result) => result.inconclusive);
  const tooSlow = results.reduce(
    (total, result) => total + result.records.filter((record) => record.kind === "too_slow").length,
    0,
  );

  console.log("\nA run passes only when outcomeMatch and validRecipe are both true.");
  console.log("Then read the grounding lines: an unstable amount is an amount the model invented.");
  console.log("A stable amount can still be invented, so do the manual grounding check in spec 0001.");
  if (tooSlow > 0) {
    console.log(`too_slow calls: ${tooSlow} · spec 0001 fails the spike on any too_slow call.`);
  }
  if (inconclusive.length > 0) {
    console.log(
      `inconclusive videos (short of ${RUNS_PER_VIDEO} completed runs after ${MAX_RERUNS} reruns): ${inconclusive
        .map((result) => result.label)
        .join(", ")}`,
    );
    console.log("Rerun one on its own once the provider settles, e.g. pnpm spike:gemini-youtube -- 3");
  }
}

await main();
