#!/usr/bin/env node
// build-codex-package.mjs — build the uploadable plugin archive for the
// OpenAI Plugins Directory (ChatGPT + Codex).
//
// Why this exists: every other channel tracks the repo on its own. skills.sh
// and the Gemini gallery crawl it, ClawHub publishes on push to main, and the
// Claude community catalog pins a SHA that CI bumps. The OpenAI directory does
// not — its docs are explicit that "published plugins do not update those
// skills live". It is a submission-time snapshot, and every change needs a new
// version, a fresh review, and a manual publish.
//
// So the archive has to be reproducible rather than hand-assembled, or the one
// listing that cannot self-update becomes the one nobody can rebuild.
//
//   node .github/scripts/build-codex-package.mjs           # -> dist/cargo-skills-codex.zip
//   node .github/scripts/build-codex-package.mjs --out DIR
//
// The archive layout follows OpenAI's documented convention, which differs
// from this repo's on two points:
//
//   - Skills live under `skills/`, not at the package root, so the manifest
//     says `"skills": "./skills/"` rather than the repo's `"./"`.
//   - `skills/` here holds real directories. In the repo they are symlinks
//     (added for the Gemini CLI extension); symlinks do not survive a zip
//     round-trip reliably, so they are resolved on the way in.
//
// Skills-only on purpose: the upload dialog asks for a skills-only plugin, and
// `hooks/codex-hooks.json` invokes `${CLAUDE_PLUGIN_ROOT}` — a Claude Code
// variable — so bundling hooks here would ship an unverified path into review.
//
// Three rules the OpenAI validator enforces that no other channel does. All are
// normalised here, so the repo keeps serving the channels that want the fuller
// form:
//
//   - `interface.shortDescription` on the plugin, 240 characters max.
//   - Skill `description` capped at 1024 characters. Two of ours run longer
//     because they enumerate every integration and provider — genuinely useful
//     for routing elsewhere, too long here. See SHORT_DESCRIPTIONS: deliberate
//     rewrites, not truncations, so no list is cut off mid-name.
//   - No `metadata` in SKILL.md frontmatter. Ours carries OpenClaw install
//     directives, which mean nothing to OpenAI, so the block is dropped from
//     the packaged copy only.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

const SKILL_DESCRIPTION_LIMIT = 1024;
const SHORT_DESCRIPTION_LIMIT = 240;

// Rewrites for skills whose repo description exceeds OpenAI's limit. Every
// trigger phrase is kept — those are what routing actually matches on — and the
// exhaustive integration/provider rosters are cut to a representative sample
// plus a count. Anything over the limit without an entry here fails the build
// rather than getting silently truncated into a rejected upload.
const SHORT_DESCRIPTIONS = {
  "cargo-connection":
    'Connect Cargo to an external system and find out what it can do — authenticate connectors, browse the integration catalog, and resolve the `connectorUuid` and `actionSlug` a workflow node needs. Triggers: "connect my HubSpot", "is Salesforce connected", "what integrations do you support", "can Cargo talk to <tool>", "what actions does <provider> have", "I need the connector UUID", "set up the API key for", "it is asking for credentials again", "why is this connector failing auth", "list my connectors". 138 integrations including HubSpot, Salesforce, Attio, Pipedrive, Outreach, Salesloft, Slack, Snowflake, BigQuery, Postgres, Stripe, and Google/LinkedIn ad audiences. Skip when: choosing between enrichment providers for a GTM job — use cargo-gtm and its provider playbooks.',
  "cargo-gtm":
    'Do go-to-market work on Cargo — find companies and people, enrich and verify contacts, find emails, phones and LinkedIn URLs, score and qualify leads, write outreach, sync to CRM, and monitor buying signals. Triggers: "build me a list of", "find 50 <title> at <segment>", "who works at", "find emails for these", "enrich this CSV", "verify these emails", "build a TAM", "who fits our ICP", "who actually buys from us", "score these leads", "write cold emails", "push these to my CRM", "who changed jobs", "who just raised funding", "companies using <tech>", "who is hiring <role>", "find the buying committee", "portfolio companies of <investor>", "upload this audience to Google/Meta/LinkedIn ads". 50 data providers including salesNavigator, aiArk, waterfall, FullEnrich, apolloio, peopleDataLabs, theirStack, hunter and dropcontact. Reads phase guides, recipes, and per-provider playbooks before any paid call. Skip when: a run already happened and misbehaved — use cargo-diagnostics.',
};

// Frontmatter here is a flat map of top-level keys, some with indented blocks.
// Rather than take a YAML dependency for two edits, walk it line by line: a
// top-level key starts at column 0, and everything indented under it belongs to
// that key. Returns the rebuilt document.
const rewriteFrontmatter = (source, { drop = [], replace = {} }) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) return null;

  const lines = match[1].split("\n");
  const blocks = [];
  for (const line of lines) {
    const key = /^([A-Za-z_-]+):/.exec(line);
    if (key === null && blocks.length > 0) {
      blocks[blocks.length - 1].lines.push(line);
    } else if (key !== null) {
      blocks.push({ key: key[1], lines: [line] });
    }
  }

  const kept = [];
  for (const block of blocks) {
    if (drop.includes(block.key)) continue;
    if (Object.hasOwn(replace, block.key)) {
      kept.push(`${block.key}: ${JSON.stringify(replace[block.key])}`);
      continue;
    }
    kept.push(...block.lines);
  }

  return `---\n${kept.join("\n")}\n---\n${source.slice(match[0].length)}`;
};

// The value as the validator counts it, with YAML quoting removed.
const frontmatterDescription = (source) => {
  const match = /^---\n([\s\S]*?)\n---\n/.exec(source);
  if (match === null) return null;
  const found = /^description:\s*([\s\S]*?)(?=\n[A-Za-z_-]+:|$)/m.exec(match[1]);
  if (found === null) return null;
  const raw = found[1].trim();
  if (raw.startsWith('"')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw.slice(1, -1);
    }
  }
  return raw;
};

const outFlag = process.argv.indexOf("--out");
const outDir = resolve(
  repoRoot,
  outFlag === -1 ? "dist" : process.argv[outFlag + 1],
);

const stageDir = join(outDir, ".codex-package");
const zipPath = join(outDir, "cargo-skills-codex.zip");

const die = (message) => {
  console.error(`error: ${message}`);
  process.exit(1);
};

// The repo's Claude manifest is the single source of truth for the bundle
// version, so the uploaded package can never claim a version the repo doesn't.
const pluginJson = JSON.parse(
  readFileSync(join(repoRoot, ".claude-plugin/plugin.json"), "utf8"),
);
const { version } = pluginJson;
if (typeof version !== "string" || /^\d+\.\d+\.\d+$/.test(version) === false) {
  die(`.claude-plugin/plugin.json has no usable semver version (got ${version})`);
}

// A skill is any top-level directory holding a SKILL.md — the same rule
// skills-lint and skills-metadata use, so the three can never disagree.
const skillDirs = readdirSync(repoRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .filter((name) => existsSync(join(repoRoot, name, "SKILL.md")))
  .sort();

if (skillDirs.length === 0) {
  die("found no skill directories at the repo root");
}

rmSync(stageDir, { recursive: true, force: true });
mkdirSync(join(stageDir, ".codex-plugin"), { recursive: true });
mkdirSync(join(stageDir, "skills"), { recursive: true });

const descriptionErrors = [];

for (const name of skillDirs) {
  // dereference: true turns the repo's `skills/` symlinks into real files.
  cpSync(join(repoRoot, name), join(stageDir, "skills", name), {
    recursive: true,
    dereference: true,
  });

  const skillMdPath = join(stageDir, "skills", name, "SKILL.md");
  const source = readFileSync(skillMdPath, "utf8");
  const replace = {};

  const override = SHORT_DESCRIPTIONS[name];
  const current = frontmatterDescription(source);
  if (current === null) {
    die(`${name}/SKILL.md has no readable description in its frontmatter`);
  }

  if (override !== undefined) {
    if (override.length > SKILL_DESCRIPTION_LIMIT) {
      descriptionErrors.push(
        `SHORT_DESCRIPTIONS["${name}"] is ${override.length} chars, over the ${SKILL_DESCRIPTION_LIMIT} limit`,
      );
    }
    replace.description = override;
  } else if (current.length > SKILL_DESCRIPTION_LIMIT) {
    descriptionErrors.push(
      `${name}: description is ${current.length} chars, over OpenAI's ${SKILL_DESCRIPTION_LIMIT} limit. ` +
        `Add a rewrite to SHORT_DESCRIPTIONS in this script — do not shorten the repo copy, other channels use it.`,
    );
  }

  // OpenAI rejects any `metadata` in SKILL.md; ours is OpenClaw install config.
  const rewritten = rewriteFrontmatter(source, {
    drop: ["metadata"],
    replace,
  });
  if (rewritten === null) {
    die(`${name}/SKILL.md has no frontmatter block`);
  }
  writeFileSync(skillMdPath, rewritten, "utf8");
}

if (descriptionErrors.length > 0) {
  for (const e of descriptionErrors) console.error(`error: ${e}`);
  process.exit(1);
}

for (const file of ["README.md", "LICENSE"]) {
  if (existsSync(join(repoRoot, file))) {
    cpSync(join(repoRoot, file), join(stageDir, file));
  }
}

// `name` is kebab-case and stable — it is the directory identity and cannot be
// changed after first publish. `cargo` alone collides with Rust's package
// manager in a catalog shared with ChatGPT, hence `cargo-skills`.
const manifest = {
  name: "cargo-skills",
  version,
  description:
    "GTM engineering for coding agents — 17 skills over the Cargo CLI: build lead lists, find and verify emails and phone numbers, enrich companies and contacts, score leads, sync to your CRM, monitor buying signals, and manage a whole workspace as code.",
  author: { name: "getcargo" },
  homepage: "https://getcargo.ai",
  repository: "https://github.com/getcargohq/cargo-skills",
  license: "MIT",
  keywords: [
    "gtm",
    "go-to-market",
    "sales",
    "prospecting",
    "lead-enrichment",
    "email-finder",
    "crm",
    "revops",
    "data-enrichment",
    "outbound",
  ],
  skills: "./skills/",
  interface: {
    displayName: "Cargo Skills",
    shortDescription:
      "Seventeen skills for go-to-market engineering over the Cargo CLI: build lead lists, find and verify emails and phone numbers, enrich contacts, score leads, sync to your CRM, and monitor buying signals.",
    capabilities: ["Read", "Write"],
  },
};

if (manifest.interface.shortDescription.length > SHORT_DESCRIPTION_LIMIT) {
  die(
    `interface.shortDescription is ${manifest.interface.shortDescription.length} chars, over the ${SHORT_DESCRIPTION_LIMIT} limit`,
  );
}

writeFileSync(
  join(stageDir, ".codex-plugin/plugin.json"),
  `${JSON.stringify(manifest, null, 2)}\n`,
  "utf8",
);

rmSync(zipPath, { force: true });
execFileSync(
  "zip",
  ["-qr", zipPath, ".", "-x", "*.DS_Store", "__MACOSX*"],
  { cwd: stageDir },
);

// Verify the archive rather than the staging directory: what ships is what the
// zip contains, and a symlink or a missing SKILL.md only shows up post-zip.
const entries = execFileSync("unzip", ["-Z1", zipPath], { encoding: "utf8" })
  .split("\n")
  .filter(Boolean);

const problems = [];
if (entries.includes(".codex-plugin/plugin.json") === false) {
  problems.push("manifest is not at the archive root");
}
const packagedSkills = entries.filter((e) =>
  /^skills\/[^/]+\/SKILL\.md$/.test(e),
).length;
if (packagedSkills !== skillDirs.length) {
  problems.push(
    `archive has ${packagedSkills} SKILL.md files, repo has ${skillDirs.length}`,
  );
}
const symlinks = execFileSync("unzip", ["-l", zipPath], { encoding: "utf8" });
if (/ -> /.test(symlinks)) {
  problems.push("archive contains symlinks; they must be dereferenced");
}

// Re-read every packaged SKILL.md out of the archive and apply the validator's
// own rules. Checking the staging copy would miss anything the zip step changed,
// and a rejected upload costs a review cycle.
for (const entry of entries.filter((e) =>
  /^skills\/[^/]+\/SKILL\.md$/.test(e),
)) {
  const body = execFileSync("unzip", ["-p", zipPath, entry], {
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
  if (/^metadata:/m.test(body)) {
    problems.push(`${entry} still carries a metadata block`);
  }
  const description = frontmatterDescription(body);
  if (description === null) {
    problems.push(`${entry} lost its description`);
  } else if (description.length > SKILL_DESCRIPTION_LIMIT) {
    problems.push(
      `${entry} description is ${description.length} chars, over ${SKILL_DESCRIPTION_LIMIT}`,
    );
  }
}

rmSync(stageDir, { recursive: true, force: true });

if (problems.length > 0) {
  for (const p of problems) console.error(`error: ${p}`);
  process.exit(1);
}

console.log(`cargo-skills ${version} — ${skillDirs.length} skills`);
console.log(zipPath);
