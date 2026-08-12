/**
 * Routing evals — regression tests for the only text that decides whether any
 * of this bundle ever gets read.
 *
 * An agent sees exactly one thing before loading a skill: its `description`.
 * Seventeen of them compete for every prompt. `skills-lint` proves the docs are
 * well-formed; nothing proved they *route*. This does.
 *
 *   node .github/scripts/routing-eval.ts            # structural + lexical (CI)
 *   node .github/scripts/routing-eval.ts --verbose  # per-case scores
 *   node .github/scripts/routing-eval.ts --llm      # + real model routing
 *                                                     (needs ANTHROPIC_API_KEY)
 *
 * Two tiers:
 *
 *  1. STRUCTURAL — every description obeys the four-part template documented in
 *     CONTRIBUTING.md (job → literal triggers → proper nouns → skip-when), and
 *     no two descriptions collide on their distinguishing vocabulary.
 *
 *  2. LEXICAL — each prompt in evals/routing.jsonl is scored against every
 *     description with a deterministic, offline ranker, and the expected skill
 *     must come first. This is a *proxy* for the model's own matcher, not a
 *     replica: it cannot prove a description routes correctly, but it reliably
 *     catches the regressions that matter — a description that loses its
 *     distinguishing vocabulary, two skills that drift into each other's
 *     territory, or a new skill that steals an existing one's prompts.
 *
 *  3. LLM (opt-in) — asks a real model to pick from the descriptions alone.
 *     Costs money and is non-deterministic, so it never gates CI.
 *
 * Requires Node >= 22.18 (run as .ts via native type-stripping).
 */

import { readdirSync, readFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const casesPath = join(repoRoot, "evals/routing.jsonl");
const verbose = process.argv.includes("--verbose");
const withLlm = process.argv.includes("--llm");
const strict = process.argv.includes("--strict");

interface Skill {
  name: string;
  description: string;
}

interface Case {
  prompt: string;
  expect: string;
  /** Why this case exists — shown on failure so the fix is obvious. */
  why?: string;
  /**
   * `core` (default) gates CI: the prompt shares real vocabulary with the
   * description, so the offline ranker can judge it fairly.
   * `hard` is a deep paraphrase with little shared vocabulary. A real model
   * handles these; a lexical proxy often cannot, so they are reported as a
   * coverage score rather than a pass/fail. Use `--strict` to gate on them,
   * and `--llm` to judge them properly.
   */
  tier?: "core" | "hard";
}

const STOPWORDS = new Set(
  ("a an and are as at be by can do does for from get give go had has have how i if in into is " +
    "it its just like me my need not of on or our out please should so that the their then there " +
    "these they this to up us use want was we what when where which who why will with you your " +
    "all any some more most only other than too very s t don now").split(" "),
);

/**
 * Deliberately crude stemming: drop a trailing plural/verb `s` on longer words
 * so "PDFs"/"PDF" and "credits"/"credit" are the same signal. Without it the
 * ranker reports failures that are artifacts of the tokenizer rather than gaps
 * in the description, which teaches contributors to distrust the harness.
 */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    // Hyphenated compounds count as their parts too ("version-controlled" →
    // "version" + "controlled"), so a user saying "version control" matches.
    .replace(/[^a-z0-9<>@._-]+/g, " ")
    .replace(/-/g, " ")
    .split(/\s+/)
    .map(stem)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function loadSkills(): Skill[] {
  const skills: Skill[] = [];
  for (const entry of readdirSync(repoRoot)) {
    const skillMd = join(repoRoot, entry, "SKILL.md");
    if (!statSync(join(repoRoot, entry), { throwIfNoEntry: false })?.isDirectory()) continue;
    if (!existsSync(skillMd)) continue;
    const lines = readFileSync(skillMd, "utf8").split("\n");
    let name = "";
    let description = "";
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === "---") break;
      const m = /^(name|description):\s*(.+)$/.exec(lines[i]);
      if (!m) continue;
      let value = m[2].trim();
      if (value.startsWith('"') && value.endsWith('"')) {
        value = JSON.parse(value);
      }
      if (m[1] === "name") name = value;
      else description = value;
    }
    if (name && description) skills.push({ name, description });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** The quoted `"…"` phrases inside a description's `Triggers:` clause. */
function triggerPhrases(description: string): string[] {
  return [...description.matchAll(/"([^"]{3,80})"/g)].map((m) => m[1].toLowerCase());
}

/**
 * Term → how many descriptions contain it. A term in one description is a
 * strong routing signal; a term in twelve is noise.
 */
function buildDocumentFrequency(skills: Skill[]): Map<string, number> {
  const df = new Map<string, number>();
  for (const s of skills) {
    for (const term of new Set(tokenize(s.description))) {
      df.set(term, (df.get(term) ?? 0) + 1);
    }
  }
  return df;
}

function score(prompt: string, skill: Skill, df: Map<string, number>): number {
  const lower = prompt.toLowerCase();
  let total = 0;

  // A literal trigger phrase appearing in the prompt is the strongest signal
  // the description can carry — that is the whole point of writing them.
  for (const phrase of triggerPhrases(skill.description)) {
    // `<title>`-style placeholders match loosely: compare the fixed words.
    const fixed = phrase.replace(/<[^>]+>/g, " ").trim();
    if (fixed.length < 4) continue;
    if (lower.includes(fixed)) {
      total += 10;
    } else {
      const words = tokenize(fixed);
      if (words.length > 1) {
        const hit = words.filter((w) => lower.includes(w)).length;
        if (hit === words.length) total += 6;
        else if (hit / words.length >= 0.6) total += 2;
      }
    }
  }

  const promptTerms = new Set(tokenize(prompt));
  const descTerms = new Set(tokenize(skill.description));
  for (const term of promptTerms) {
    if (!descTerms.has(term)) continue;
    const frequency = df.get(term) ?? 1;
    // Inverse document frequency, coarsely bucketed: unique > rare > common.
    if (frequency === 1) total += 4;
    else if (frequency <= 3) total += 2;
    else if (frequency <= 6) total += 0.5;
    else total += 0.1;
  }
  return total;
}

function loadCases(): Case[] {
  if (!existsSync(casesPath)) throw new Error(`missing ${casesPath}`);
  return readFileSync(casesPath, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith("//"))
    .map((l, i) => {
      try {
        return JSON.parse(l) as Case;
      } catch (e) {
        throw new Error(`evals/routing.jsonl line ${i + 1} is not valid JSON: ${(e as Error).message}`);
      }
    });
}

// ---------------------------------------------------------------- structural

function checkStructure(skills: Skill[]): string[] {
  const failures: string[] = [];
  for (const s of skills) {
    const d = s.description;
    if (!/\bTriggers:/.test(d)) {
      failures.push(`${s.name}: description has no \`Triggers:\` clause (see CONTRIBUTING.md).`);
    }
    if (!/\bSkip when:/.test(d)) {
      failures.push(`${s.name}: description has no \`Skip when:\` clause — the negative case is what stops the wrong skill loading.`);
    }
    const phrases = triggerPhrases(d);
    if (phrases.length < 4) {
      failures.push(`${s.name}: only ${phrases.length} quoted trigger phrase(s); write at least 4 literal things a user would type.`);
    }
    // Generated slug lists make these two long on purpose.
    const exempt = s.name === "cargo-gtm" || s.name === "cargo-connection";
    if (!exempt && d.length > 900) {
      failures.push(`${s.name}: description is ${d.length} chars (cap ~900).`);
    }
  }

  // Two skills whose top distinguishing terms overlap heavily will fight over
  // the same prompts no matter how good either one is on its own.
  const df = buildDocumentFrequency(skills);
  const unique = new Map<string, Set<string>>();
  for (const s of skills) {
    unique.set(s.name, new Set([...new Set(tokenize(s.description))].filter((t) => (df.get(t) ?? 0) === 1)));
  }
  for (const s of skills) {
    if ((unique.get(s.name)?.size ?? 0) < 5) {
      failures.push(
        `${s.name}: fewer than 5 terms unique to its description — it has no distinguishing vocabulary and will lose every ambiguous prompt.`,
      );
    }
  }
  return failures;
}

// ------------------------------------------------------------------- lexical

interface LexicalResult {
  failures: string[];
  core: { pass: number; total: number };
  hard: { pass: number; top3: number; total: number; misses: string[] };
}

function runLexical(skills: Skill[], cases: Case[]): LexicalResult {
  const df = buildDocumentFrequency(skills);
  const failures: string[] = [];
  const core = { pass: 0, total: 0 };
  const hard = { pass: 0, top3: 0, total: 0, misses: [] as string[] };

  for (const c of cases) {
    const ranked = skills
      .map((s) => ({ name: s.name, score: score(c.prompt, s, df) }))
      .sort((a, b) => b.score - a.score);
    const winner = ranked[0];
    const expectedRank = ranked.findIndex((r) => r.name === c.expect);
    const hit = winner.name === c.expect;
    const isHard = c.tier === "hard";

    if (isHard) {
      hard.total++;
      if (hit) hard.pass++;
      if (expectedRank < 3) hard.top3++;
      if (!hit) {
        hard.misses.push(
          `  ${c.prompt}\n      wanted ${c.expect} (#${expectedRank + 1}), ranker chose ${winner.name}`,
        );
      }
      continue;
    }

    core.total++;
    if (hit) {
      core.pass++;
      if (verbose) {
        console.log(
          `  ok    ${c.prompt}\n        → ${winner.name} (${winner.score.toFixed(1)}, next ${ranked[1].name} ${ranked[1].score.toFixed(1)})`,
        );
      }
      continue;
    }
    failures.push(
      `"${c.prompt}"\n      expected: ${c.expect} (ranked #${expectedRank + 1}, ${ranked[expectedRank]?.score.toFixed(1) ?? "0"})\n      got:      ${winner.name} (${winner.score.toFixed(1)})` +
        (c.why ? `\n      why this case exists: ${c.why}` : ""),
    );
  }
  return { failures, core, hard };
}

// ----------------------------------------------------------------- llm (opt)

async function runLlm(skills: Skill[], cases: Case[]): Promise<void> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    console.log("\n--llm: ANTHROPIC_API_KEY not set — skipping the model tier.");
    return;
  }
  const catalog = skills.map((s) => `<skill name="${s.name}">${s.description}</skill>`).join("\n");
  let correct = 0;
  const misses: string[] = [];

  for (const c of cases) {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 32,
        system:
          "You route a user request to exactly one agent skill, judging only by the skill descriptions given. Reply with the skill name and nothing else.",
        messages: [{ role: "user", content: `${catalog}\n\nUser request: ${c.prompt}\n\nSkill name:` }],
      }),
    });
    if (!res.ok) {
      console.error(`--llm: API error ${res.status} — aborting the model tier.`);
      return;
    }
    const body = (await res.json()) as { content: { text?: string }[] };
    const picked = (body.content?.[0]?.text ?? "").trim().split(/\s/)[0].replace(/[^a-z-]/g, "");
    if (picked === c.expect) correct++;
    else misses.push(`  ${c.prompt}\n    expected ${c.expect}, model picked ${picked || "(nothing)"}`);
  }
  console.log(`\nLLM tier: ${correct}/${cases.length} routed correctly (${((correct / cases.length) * 100).toFixed(0)}%).`);
  if (misses.length) console.log(misses.join("\n"));
}

// ---------------------------------------------------------------------- main

const skills = loadSkills();
const cases = loadCases();

console.log(`Routing evals — ${cases.length} prompts against ${skills.length} skill descriptions.\n`);

const structural = checkStructure(skills);
if (structural.length) {
  console.error("Structural failures:");
  for (const f of structural) console.error(`  ✗ ${f}`);
} else {
  console.log(`Structure: ok (all ${skills.length} descriptions follow the four-part template).`);
}

const { failures, core, hard } = runLexical(skills, cases);
console.log(
  `Lexical:   ${core.pass}/${core.total} core prompts routed to the expected skill (${((core.pass / core.total) * 100).toFixed(0)}%).`,
);
if (hard.total) {
  console.log(
    `Hard tier: ${hard.pass}/${hard.total} exact, ${hard.top3}/${hard.total} in the top 3 — deep paraphrases the offline ranker cannot fairly judge. Not gating; run --llm for a real verdict.`,
  );
  if (verbose || strict) console.log(hard.misses.join("\n"));
}
if (failures.length) {
  console.error("\nRouting failures:");
  for (const f of failures) console.error(`  ✗ ${f}\n`);
}

if (withLlm) await runLlm(skills, cases);

const gatedFailures = failures.length + structural.length + (strict ? hard.total - hard.pass : 0);
if (gatedFailures) {
  console.error(
    `\n${gatedFailures} failure(s). Fix the description (CONTRIBUTING.md → "The description is the product") or, if the routing change is intended, update evals/routing.jsonl.`,
  );
  process.exit(1);
}
console.log("\nAll gating routing evals passed.");
