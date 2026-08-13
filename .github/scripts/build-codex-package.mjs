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
// Rules the OpenAI validator enforces that no other channel does, normalised
// here so the repo keeps serving the channels that want the fuller form:
//
//   - Skill `description` capped at 1024 characters. Two of ours run longer
//     because they enumerate every integration and provider — genuinely useful
//     for routing elsewhere, too long here. See SHORT_DESCRIPTIONS: deliberate
//     rewrites, not truncations, so no list is cut off mid-name.
//   - No `metadata` in SKILL.md frontmatter. Ours carries OpenClaw install
//     directives, which mean nothing to OpenAI, so the block is dropped from
//     the packaged copy only.
//   - `interface` needs displayName, shortDescription, and two square icons.
//
// The rest of the checks below exist because there is no submission API — the
// portal is the only path, every version is human-reviewed, and a rejection
// costs a whole review cycle. So every documented rule is asserted at build
// time instead. Note LIMITS targets the stricter of the two published tiers.

import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

// Two tiers of validation exist and they disagree. The uploader enforces the
// looser "package" limits; the final directory submission enforces much tighter
// ones on the same fields. Building to the package limits gets you an accepted
// archive that is rejected later, so everything here targets the STRICTER tier.
// https://developers.openai.com/plugins/deploy/submission-errors
const LIMITS = {
  pluginName: 64,
  pluginDescription: 1024,
  authorName: 120,
  displayName: 30, // package allows 80
  shortDescription: 30, // package allows 240
  skillDescription: 1024,
  skillIdentity: 64, // "plugin-name:skill-name"
  archiveEntries: 5000,
  archiveBytes: 100 * 1024 * 1024,
  iconMinPx: 48,
  iconMaxPx: 4096,
  iconBytes: 5 * 1024 * 1024,
  pathSegments: 20,
};

const SKILL_DESCRIPTION_LIMIT = LIMITS.skillDescription;

// Rewrites for skills whose repo description exceeds OpenAI's limit. Every
// trigger phrase is kept — those are what routing actually matches on — and the
// exhaustive integration/provider rosters are cut to a representative sample
// plus a count. Anything over the limit without an entry here fails the build
// rather than getting silently truncated into a rejected upload.
const SHORT_DESCRIPTIONS = {
  "cargo-connection":
    'Connect Cargo to an external system and find out what it can do — authenticate connectors, browse the integration catalog, and resolve the `connectorUuid` and `actionSlug` a workflow node needs. Triggers: "connect my HubSpot", "is Salesforce connected", "what integrations do you support", "can Cargo talk to <tool>", "what actions does <provider> have", "I need the connector UUID", "set up the API key for", "it is asking for credentials again", "why is this connector failing auth", "list my connectors". 138 integrations including HubSpot, Salesforce, Attio, Pipedrive, Outreach, Salesloft, Slack, Snowflake, BigQuery, Postgres, Stripe, and Google/LinkedIn ad audiences. Skip when: choosing between enrichment providers for a GTM job — use cargo-gtm and its provider playbooks.',
  "cargo-gtm":
    'Do business-to-business go-to-market work on Cargo — research accounts and buying committees, enrich and verify B2B contact records from licensed data providers, score and qualify leads, draft permission-based outreach for the user\'s own sequencer, sync to CRM, and monitor buying signals. Consent basis, suppression, and volume limits gate every step touching a person; bulk unsolicited messaging, purchased or scraped lists, and consumer targeting are refused. Triggers: "build me a list of", "find 50 <title> at <segment>", "who works at", "find work emails for these accounts", "enrich this CSV", "verify these emails", "build a TAM", "who fits our ICP", "score these leads", "write a first-touch email", "push these to my CRM", "who changed jobs", "who just raised funding", "companies using <tech>", "who is hiring <role>", "find the buying committee", "upload this audience to Google/LinkedIn ads". 50 licensed data providers. Skip when: a run already happened and misbehaved — use cargo-diagnostics.',
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

// interface.composerIcon and interface.logo are required and must both point at
// a square image. assets/icon.png is the Cargo product mark at 512x512.
const iconSource = join(repoRoot, "assets/icon.png");
if (existsSync(iconSource) === false) {
  die("assets/icon.png is missing — the manifest requires a square icon");
}
mkdirSync(join(stageDir, "assets"), { recursive: true });
cpSync(iconSource, join(stageDir, "assets/icon.png"));

// `name` is kebab-case and stable — it is the directory identity and cannot be
// changed after first publish. `cargo` alone collides with Rust's package
// manager in a catalog shared with ChatGPT, hence `cargo-skills`.
const manifest = {
  name: "cargo-skills",
  version,
  description:
    "GTM engineering for coding agents — 17 skills over the Cargo CLI: research accounts, enrich and verify B2B contact records from licensed data providers, score and qualify leads, sync to your CRM, monitor buying signals, and manage a whole workspace as code. Consent and suppression gates apply to every step that touches a person; the pack sends no messages itself.",
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
    "b2b-data",
    "crm",
    "revops",
    "data-enrichment",
    "outbound",
  ],
  skills: "./skills/",
  interface: {
    displayName: "Cargo Skills",
    // 30 chars in the directory, not the 240 the uploader accepts.
    shortDescription: "GTM engineering for agents",
    composerIcon: "./assets/icon.png",
    logo: "./assets/icon.png",
    capabilities: ["Read", "Write"],
  },
};

const manifestErrors = [];
const check = (ok, message) => {
  if (ok === false) manifestErrors.push(message);
};

check(
  /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(manifest.name) &&
    manifest.name.length <= LIMITS.pluginName,
  `name "${manifest.name}" must be ASCII alphanumeric/_/- , start alphanumeric, and be <= ${LIMITS.pluginName} chars`,
);
check(
  /^\d+\.\d+\.\d+$/.test(manifest.version),
  `version "${manifest.version}" must be semver`,
);
check(
  manifest.description.length > 0 &&
    manifest.description.length <= LIMITS.pluginDescription,
  `description is ${manifest.description.length} chars, limit ${LIMITS.pluginDescription}`,
);
check(
  manifest.author.name.length <= LIMITS.authorName,
  `author.name is ${manifest.author.name.length} chars, limit ${LIMITS.authorName}`,
);
for (const [field, limit] of [
  ["displayName", LIMITS.displayName],
  ["shortDescription", LIMITS.shortDescription],
]) {
  const value = manifest.interface[field];
  check(
    typeof value === "string" && value.length > 0 && value.length <= limit,
    `interface.${field} is ${value?.length ?? 0} chars, directory limit ${limit}`,
  );
  check(
    /[\n\r]/.test(value ?? "") === false,
    `interface.${field} must be a single line`,
  );
}
for (const url of [manifest.homepage, manifest.repository]) {
  check(url.startsWith("https://"), `${url} must be HTTPS`);
}
for (const name of skillDirs) {
  const identity = `${manifest.name}:${name}`;
  check(
    identity.length <= LIMITS.skillIdentity,
    `skill identity "${identity}" is ${identity.length} chars, limit ${LIMITS.skillIdentity}`,
  );
}

if (manifestErrors.length > 0) {
  for (const e of manifestErrors) console.error(`error: ${e}`);
  process.exit(1);
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
// No zip listing prints symlink targets — `unzip -l` gives length, date, and
// name, and the zipinfo formats do not print ` -> target` either. The file type
// survives only in zipinfo's Unix mode column, where a symlink reads
// `lrwxrwxrwx`. Every entry must yield a mode for this to mean anything, so an
// unparseable listing is itself a failure rather than a silent pass.
const modes = execFileSync("unzip", ["-Z", zipPath], { encoding: "utf8" })
  .split("\n")
  .map((line) => /^([-bcdlps])[-rwxsStT]{9}\s+\d+\.\d+\s+\S+\s/.exec(line))
  .filter((match) => match !== null);

if (modes.length !== entries.length) {
  problems.push(
    `zipinfo reported modes for ${modes.length} of ${entries.length} entries, so the archive cannot be shown symlink-free`,
  );
}
const symlinked = modes
  .filter((match) => match[1] === "l")
  .map((match) => /\d\d:\d\d\s+(.*)$/.exec(match.input)?.[1] ?? match.input);
if (symlinked.length > 0) {
  problems.push(
    `archive contains symlinks; they must be dereferenced: ${symlinked.join(", ")}`,
  );
}

// Every interface asset path must resolve inside the archive, and the images
// must be square — the validator rejects both a dangling path and a non-square
// image, and neither is visible from the manifest alone.
for (const field of ["composerIcon", "logo"]) {
  const ref = manifest.interface[field];
  const entry = ref.replace(/^\.\//, "");
  if (entries.includes(entry) === false) {
    problems.push(`interface.${field} points at ${ref}, absent from the archive`);
    continue;
  }
  const probe = join(outDir, `.probe-${field}.png`);
  writeFileSync(
    probe,
    execFileSync("unzip", ["-p", zipPath, entry], { maxBuffer: 32 * 1024 * 1024 }),
  );
  const dims = execFileSync(
    "sips",
    ["-g", "pixelWidth", "-g", "pixelHeight", probe],
    { encoding: "utf8" },
  );
  const width = Number(/pixelWidth:\s*(\d+)/.exec(dims)?.[1]);
  const height = Number(/pixelHeight:\s*(\d+)/.exec(dims)?.[1]);
  const bytes = statSync(probe).size;
  rmSync(probe, { force: true });
  if (!width || !height) {
    problems.push(`interface.${field} (${ref}) is not a readable image`);
    continue;
  }
  if (width !== height) {
    problems.push(`interface.${field} (${ref}) is ${width}x${height}, must be square`);
  }
  if (width < LIMITS.iconMinPx || width > LIMITS.iconMaxPx) {
    problems.push(
      `interface.${field} (${ref}) is ${width}px, must be ${LIMITS.iconMinPx}-${LIMITS.iconMaxPx}px`,
    );
  }
  if (bytes > LIMITS.iconBytes) {
    problems.push(`interface.${field} (${ref}) is ${bytes} bytes, limit ${LIMITS.iconBytes}`);
  }
}

// Archive shape. The uploader rejects the whole file for any of these, with no
// indication of which entry was at fault.
if (entries.length > LIMITS.archiveEntries) {
  problems.push(`archive has ${entries.length} entries, limit ${LIMITS.archiveEntries}`);
}
const archiveBytes = statSync(zipPath).size;
if (archiveBytes > LIMITS.archiveBytes) {
  problems.push(`archive is ${archiveBytes} bytes, limit ${LIMITS.archiveBytes}`);
}
for (const entry of entries) {
  if (entry.includes("\\")) {
    problems.push(`${entry} uses backslashes; paths must use /`);
  }
  if (entry.split("/").some((s) => s === ".." || s.trim() !== s)) {
    problems.push(`${entry} has a '..' or whitespace-padded segment`);
  }
  if (entry.split("/").filter(Boolean).length > LIMITS.pathSegments) {
    problems.push(`${entry} exceeds ${LIMITS.pathSegments} path segments`);
  }
}
// "Skill files directly under skills/ are ignored" — a skill must be a
// subdirectory, so a stray file there silently drops a skill from the listing.
for (const entry of entries) {
  if (/^skills\/[^/]+$/.test(entry) && entry.endsWith("/") === false) {
    problems.push(`${entry} sits directly under skills/ and would be ignored`);
  }
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
