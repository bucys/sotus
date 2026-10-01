// Fails when a file in src/components or src/app brings back a class pattern that breaks
// the Sotus design system. The banned list mirrors "After shadcn add" in docs/design.md.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const roots = ["src/components", "src/app"];

const bannedPatterns = [
  {
    pattern:
      /focus-visible:(ring-|border-ring)|aria-invalid:ring-|outline-ring\//,
    why: "semi transparent focus ring, the global outline covers it",
  },
  { pattern: /(^|[\s"'`:])dark:/, why: "no dark theme yet" },
  {
    pattern:
      /\b(text-white|bg-black|bg-white)\b|\b(bg|text|border)-(red|green|blue|yellow|orange|amber|lime|emerald|teal|cyan|sky|indigo|violet|purple|fuchsia|pink|rose|slate|gray|zinc|neutral|stone)-\d/,
    why: "raw colour, use a semantic token",
  },
  { pattern: /\b(bg|text)-\[#/, why: "raw hex colour, use a semantic token" },
  {
    pattern: /\b(input|ring|destructive|foreground|muted-foreground)\/\d+/,
    why: "opacity on a token breaks the contrast table",
  },
  {
    pattern: /(^|[\s"'`:])(h-[6-9]|size-[6-9])(?=[\s"'`]|$)/,
    why: "below 44px on an interactive element, use min-h-11 or size-11",
  },
  {
    pattern: /active:translate-y-px/,
    why: "motion outside the allowed set, use motion-safe:active:scale-[0.98]",
  },
  {
    pattern: /(?<!motion-safe:)(?<![\w-])animate-(?!none)/,
    why: "unprefixed loop animation, use a motion-safe: variant",
  },
];

const listFiles = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? listFiles(path) : [path];
  });

const files =
  process.argv.length > 2
    ? process.argv
        .slice(2)
        .filter((file) => roots.some((root) => file.includes(root)))
    : roots.flatMap(listFiles).filter((file) => file.endsWith(".tsx"));

const problems = files.flatMap((file) =>
  readFileSync(file, "utf8")
    .split("\n")
    .flatMap((line, index) =>
      bannedPatterns
        .filter(({ pattern }) => pattern.test(line))
        .map(({ why }) => `${file}:${index + 1}  ${why}\n    ${line.trim()}`),
    ),
);

if (problems.length > 0) {
  console.error(`check:ui found ${problems.length} problem(s):\n`);
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`check:ui ok (${files.length} files)`);
