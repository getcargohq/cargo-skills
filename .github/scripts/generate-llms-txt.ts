/**
 * Generates the repo-root llms.txt from the actual skill tree, so the index
 * can never drift from the skills that really ship (a stale hand-written
 * llms.txt advertises skills that no longer exist).
 *
 *   node .github/scripts/generate-llms-txt.ts          # write llms.txt
 *   node .github/scripts/generate-llms-txt.ts --check  # CI: fail if stale
 *
 * Requires Node >= 22.18 (run as .ts via native type-stripping, like the QA
 * scripts in cargo-gtm/scripts/).
 */

import { readdirSync, readFileSync, writeFileSync, existsSync, statSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const outPath = join(repoRoot, "llms.txt");
const repoUrl = "https://github.com/getcargohq/cargo-skills";
/** Standalone single-job slices of this pack, for people who want one thing. */
const gtmSkillsUrl = "https://github.com/getcargohq/gtm-skills";

interface Skill {
  name: string;
  description: string;
  dir: string;
}

function parseFrontmatter(skillMdPath: string): Skill {
  const lines = readFileSync(skillMdPath, "utf8").split("\n");
  if (lines[0]?.trim() !== "---") {
    throw new Error(`${skillMdPath}: no frontmatter block`);
  }
  let name = "";
  let description = "";
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim() === "---") break;
    const match = /^(name|description):\s*(.+)$/.exec(line);
    if (!match) continue;
    let value = match[2].trim();
    if (value.startsWith('"') && value.endsWith('"')) value = value.slice(1, -1);
    if (match[1] === "name") name = value;
    else description = value;
  }
  if (!name || !description) {
    throw new Error(`${skillMdPath}: missing name or description in frontmatter`);
  }
  return { name, description, dir: dirname(skillMdPath) };
}

function collectSkills(): Skill[] {
  const skills: Skill[] = [];
  for (const entry of readdirSync(repoRoot)) {
    const skillMd = join(repoRoot, entry, "SKILL.md");
    if (statSync(join(repoRoot, entry), { throwIfNoEntry: false })?.isDirectory() && existsSync(skillMd)) {
      skills.push(parseFrontmatter(skillMd));
    }
  }
  // Router first, then onboarding, then the outcome skill, then the rest A→Z —
  // same priority order the router itself teaches.
  const pinned = ["cargo", "cargo-quickstart", "cargo-gtm"];
  skills.sort((a, b) => {
    const pa = pinned.indexOf(a.name);
    const pb = pinned.indexOf(b.name);
    if (pa !== -1 || pb !== -1) {
      return (pa === -1 ? pinned.length : pa) - (pb === -1 ? pinned.length : pb);
    }
    return a.name.localeCompare(b.name);
  });
  return skills;
}

/**
 * Recipes and provider playbooks are the job-named, addressable layer under the
 * skills — "build-tam", "job-change-monitoring", "linkedin-url-lookup". Skill
 * names alone are the wrong granularity for anyone (human or crawler) searching
 * by the job they want done, so the index lists them too, with the one-line
 * summary each file carries.
 */
interface Doc {
  slug: string;
  path: string;
  summary: string;
}

/** First meaningful prose line of a markdown file, trimmed to one sentence. */
function summarize(path: string, fallback: string): string {
  const lines = readFileSync(path, "utf8").split("\n");
  let inFrontmatter = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (i === 0 && line === "---") {
      inFrontmatter = true;
      continue;
    }
    if (inFrontmatter) {
      if (line === "---") inFrontmatter = false;
      continue;
    }
    if (!line) continue;
    if (line.startsWith("#")) continue;
    if (line.startsWith(">") || line.startsWith("|") || line.startsWith("```")) continue;
    // Strip markdown emphasis/links down to plain prose.
    const plain = line
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_`]/g, "")
      .trim();
    if (plain.length < 20) continue;
    const sentence = plain.split(/(?<=\.)\s/)[0];
    return sentence.length > 220 ? sentence.slice(0, 217).trimEnd() + "…" : sentence;
  }
  return fallback;
}

function collectDocs(skillDir: string, subdir: string, fallback: string): Doc[] {
  const dir = join(repoRoot, skillDir, subdir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase()))
    .map((f) => ({
      slug: f.replace(/\.md$/, ""),
      path: `${skillDir}/${subdir}/${f}`,
      summary: summarize(join(dir, f), fallback),
    }));
}

function render(skills: Skill[]): string {
  const skillLines = skills
    .map((s) => `- [${s.name}](${repoUrl}/blob/main/${s.name}/SKILL.md): ${s.description}`)
    .join("\n");

  const recipes = [
    ...collectDocs("cargo-gtm", "recipes", "A step-by-step GTM playbook."),
    ...collectDocs("cargo-cdk", "recipes", "A step-by-step workspace-as-code playbook."),
  ];
  const recipeLines = recipes
    .map((r) => `- [${r.slug}](${repoUrl}/blob/main/${r.path}): ${r.summary}`)
    .join("\n");

  const playbooks = collectDocs(
    "cargo-gtm",
    "provider-playbooks",
    "Action slugs, config shapes, costs, and cost traps for this provider.",
  );
  const playbookLines = playbooks
    .map((p) => `- [${p.slug}](${repoUrl}/blob/main/${p.path}): ${p.summary}`)
    .join("\n");

  return `# Cargo Agent Skills

> ${skills.length} agent skills that teach AI coding agents the Cargo CLI — sourcing, enrichment, verification, signal monitoring, workflow orchestration, workspace-as-code (CDK), diagnostics, and billing for GTM automation on [Cargo](https://getcargo.ai).

## Install

Paste into Claude Code, Codex, or Cursor:

\`\`\`
Install Cargo by following every step in https://api.getcargo.io/agent-install.txt
\`\`\`

Or manually:

\`\`\`bash
npx skills add getcargohq/cargo-skills
npm install -g @cargo-ai/cli
cargo-ai login --email you@company.com   # emailed code, no browser; creates the account on first use
\`\`\`

A new account starts with **100 free credits, no card** — roughly 5,000 leads sourced or 1,000 verified-email enrichments. The two-minute quickstart demo spends about 0.5 of them, so an agent can install, sign the user up, and return a real deliverable in one turn.

## Skills

${skillLines}

## Recipes

Step-by-step playbooks for a specific job. An agent loads the parent skill, then follows the matching recipe as its execution plan.

${recipeLines}

## Provider playbooks

Per-provider action slugs, config shapes, credit costs, cost traps, and recurring-use cadence. Read the playbook before calling a paid action from that provider.

${playbookLines}

## Single-job skills

Want one job rather than the whole bundle? [\`getcargohq/gtm-skills\`](${gtmSkillsUrl}) packages twelve of these outcomes as standalone skills, named after the job — \`find-work-email\`, \`find-b2b-leads\`, \`enrich-linkedin-profile\`, \`find-stakeholders\`, \`track-job-changes\`, \`verify-email-list\`, and more. Each installs on its own and runs inside the 100 free credits.

\`\`\`bash
npx skills add getcargohq/gtm-skills/<skill-name>
\`\`\`

Install those **or** this pack, not both: each standalone skill defers to \`cargo-gtm\` when the pack is present, so routing stays unambiguous.

## Documentation

- [Cargo](https://getcargo.ai)
- [Cargo API docs](https://docs.getcargo.ai/api-reference/introduction)
- [GitHub repository](${repoUrl})
- [Standalone GTM skills, run-once and worked CDK examples](${gtmSkillsUrl})

<!-- Generated by .github/scripts/generate-llms-txt.ts — do not edit by hand. -->
`;
}

const generated = render(collectSkills());

if (process.argv.includes("--check")) {
  const current = existsSync(outPath) ? readFileSync(outPath, "utf8") : "";
  if (current !== generated) {
    console.error(
      "llms.txt is stale. Regenerate with: node .github/scripts/generate-llms-txt.ts",
    );
    process.exit(1);
  }
  console.log("llms.txt is up to date.");
} else {
  writeFileSync(outPath, generated);
  console.log(`Wrote ${outPath}`);
}
