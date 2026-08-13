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

for (const name of skillDirs) {
  // dereference: true turns the repo's `skills/` symlinks into real files.
  cpSync(join(repoRoot, name), join(stageDir, "skills", name), {
    recursive: true,
    dereference: true,
  });
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
    capabilities: ["Read", "Write"],
  },
};

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

rmSync(stageDir, { recursive: true, force: true });

if (problems.length > 0) {
  for (const p of problems) console.error(`error: ${p}`);
  process.exit(1);
}

console.log(`cargo-skills ${version} — ${skillDirs.length} skills`);
console.log(zipPath);
