#!/usr/bin/env node
// Skill bundle linter.
//
// Validates the repository invariants that consumers of these skills rely on:
//   - Every SKILL.md has the required frontmatter fields and parses cleanly.
//   - Every internal markdown link (`(./...)`, `(../...)`, `(referenced/path.md)`)
//     resolves to a file that actually exists in the repo.
//   - Every fenced JSON code block parses as valid JSON.
//   - Every `cargo-ai` bash example references one of the known top-level domains.
//   - Versions follow MAJOR.MINOR.PATCH and are non-empty.
//
// The script reads every file under the repo root that is either named SKILL.md
// or lives under a `references/`, `recipes/`, `guides/`, `provider-playbooks/`,
// or `agents/` directory beside a SKILL.md. Findings are printed grouped by file.
// Exit code is 1 on any error finding, 0 otherwise. Warnings do not fail the run.

import { readFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { join, relative, resolve, dirname, basename } from "node:path";

const repoRoot = resolve(process.argv[2] || ".");

const SKILL_DIRS = [
  "cargo",
  "cargo-quickstart",
  "cargo-gtm",
  "cargo-orchestration",
  "cargo-storage",
  "cargo-connection",
  "cargo-ai",
  "cargo-content",
  "cargo-context",
  "cargo-analytics",
  "cargo-billing",
  "cargo-hosting",
  "cargo-workspace-management",
];

const REQUIRED_FRONTMATTER_FIELDS = [
  "name",
  "description",
  "version",
  "compatibility",
];

// Top-level cargo-ai command domains. Update if a new domain ships.
const KNOWN_CLI_DOMAINS = new Set([
  "ai",
  "billing",
  "connection",
  "content",
  "context",
  "expression",
  "hosting",
  "init",
  "orchestration",
  "revenue-organization",
  "segmentation",
  "storage",
  "system-of-record",
  "user-management",
  "version",
  "whoami",
  "login",
  "logout",
  "workspaceManagement",
  "--help",
  "--version",
]);

const findings = []; // { file, line, severity: "error"|"warn", message }

function err(file, line, message) {
  findings.push({ file, line, severity: "error", message });
}
function warn(file, line, message) {
  findings.push({ file, line, severity: "warn", message });
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    if (entry.startsWith(".") || entry === "node_modules") continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else if (entry.endsWith(".md") || entry.endsWith(".mdx")) yield p;
  }
}

function parseFrontmatter(content, file) {
  if (!content.startsWith("---\n")) {
    return null;
  }
  const end = content.indexOf("\n---", 4);
  if (end < 0) {
    err(file, 1, "Frontmatter block is not terminated by `---`.");
    return null;
  }
  const body = content.slice(4, end);
  // Permissive line-based parse — sufficient for the flat key:value frontmatter
  // we use. We do not need full YAML semantics, just to confirm presence.
  const fields = {};
  let i = 0;
  for (const rawLine of body.split("\n")) {
    i++;
    if (!rawLine.trim() || rawLine.trimStart().startsWith("#")) continue;
    // top-level keys are unindented `key: value` lines
    if (/^[A-Za-z][A-Za-z0-9_-]*:/.test(rawLine)) {
      const colon = rawLine.indexOf(":");
      const key = rawLine.slice(0, colon).trim();
      const value = rawLine.slice(colon + 1).trim();
      fields[key] = value;
    }
  }
  return { fields, bodyStart: end + 4 };
}

function validateFrontmatter(file, content) {
  const result = parseFrontmatter(content, file);
  if (!result) {
    if (basename(file) === "SKILL.md") {
      err(file, 1, "SKILL.md is missing required `---` frontmatter block.");
    }
    return;
  }
  if (basename(file) !== "SKILL.md") return;

  for (const field of REQUIRED_FRONTMATTER_FIELDS) {
    if (!(field in result.fields)) {
      err(file, 1, `Frontmatter is missing required field \`${field}\`.`);
    }
  }
  const version = (result.fields.version || "").replace(/^"|"$/g, "");
  if (version && !/^\d+\.\d+\.\d+$/.test(version)) {
    err(file, 1, `Frontmatter \`version\` must be MAJOR.MINOR.PATCH (got "${version}").`);
  }
  const name = (result.fields.name || "").replace(/^"|"$/g, "");
  const expectedName = file.split("/").slice(-2, -1)[0];
  if (name && name !== expectedName) {
    err(
      file,
      1,
      `Frontmatter \`name: ${name}\` does not match its directory \`${expectedName}\`.`
    );
  }
}

function extractFencedBlocks(content) {
  const blocks = [];
  const lines = content.split("\n");
  let i = 0;
  while (i < lines.length) {
    const m = lines[i].match(/^```(\w+)?\s*$/);
    if (m) {
      const lang = (m[1] || "").toLowerCase();
      const startLine = i + 1;
      const buf = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        buf.push(lines[i]);
        i++;
      }
      blocks.push({ lang, startLine, content: buf.join("\n") });
      i++; // consume closing fence
      continue;
    }
    i++;
  }
  return blocks;
}

function validateJsonBlocks(file, content) {
  for (const block of extractFencedBlocks(content)) {
    if (block.lang !== "json") continue;
    const text = block.content.trim();
    if (!text) continue;
    // Documentation patterns we deliberately don't try to parse:
    //   - ellipsis placeholders (`...`, `…`) inside the block,
    //   - template / mustache expressions (`{{nodes.x.y}}`),
    //   - angle-bracket placeholders (`<uuid>`, `<slug>`),
    //   - inline `// comment` lines (multiple sibling examples).
    if (
      text.includes("...") ||
      text.includes("…") ||
      text.includes("{{") ||
      /<[a-zA-Z][^>\n]*>/.test(text) ||
      /^\s*\/\//m.test(text)
    ) {
      continue;
    }
    // Skip JSON fragments that show a single key:value pair without the
    // enclosing object (common when documenting one field of a larger shape).
    if (!/^\s*[{[]/.test(text)) {
      continue;
    }
    // Many reference docs enumerate multiple sibling JSON objects, one per
    // line, in a single fenced block. Try the block as a single document
    // first; on failure, try parsing each non-empty line independently.
    try {
      JSON.parse(text);
      continue;
    } catch (e) {
      const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
      if (lines.length > 1 && lines.every((l) => {
        try { JSON.parse(l); return true; } catch { return false; }
      })) {
        continue;
      }
      err(
        file,
        block.startLine,
        `Fenced \`\`\`json block does not parse: ${e.message}`
      );
    }
  }
}

function validateBashBlocks(file, content) {
  for (const block of extractFencedBlocks(content)) {
    if (block.lang !== "bash" && block.lang !== "sh" && block.lang !== "shell") continue;
    const lines = block.content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.startsWith("#")) continue;
      // Look at every `cargo-ai <token>` invocation. The next token must be
      // a known domain (or a flag like `--help`).
      const re = /(?:^|[\s|;`$(])cargo-ai\s+([A-Za-z][A-Za-z0-9_-]*)/g;
      let m;
      while ((m = re.exec(lines[i])) !== null) {
        const token = m[1];
        if (!KNOWN_CLI_DOMAINS.has(token)) {
          warn(
            file,
            block.startLine + i,
            `\`cargo-ai ${token}\` references an unknown top-level domain — update the linter or fix the example.`
          );
        }
      }
    }
  }
}

function validateInternalLinks(file, content) {
  // Match markdown links: [text](target). Skip URLs (http(s)://, mailto:),
  // pure anchors (#foo), and template placeholders.
  const re = /\[([^\]]*)\]\(([^)]+)\)/g;
  let m;
  const fileDir = dirname(file);
  while ((m = re.exec(content)) !== null) {
    const target = m[2].trim();
    if (!target) continue;
    if (/^[a-z]+:\/\//i.test(target)) continue;
    if (target.startsWith("mailto:")) continue;
    if (target.startsWith("#")) continue;
    // strip trailing anchor and query
    const cleaned = target.split("#")[0].split("?")[0];
    if (!cleaned) continue;
    // Resolve relative to the file's directory.
    const absTarget = resolve(fileDir, cleaned);
    if (!existsSync(absTarget)) {
      // Compute line number of the link
      const upto = content.slice(0, m.index);
      const line = upto.split("\n").length;
      err(file, line, `Broken internal link: \`${target}\` — no file at ${relative(repoRoot, absTarget)}`);
    }
  }
}

function lintFile(file) {
  const content = readFileSync(file, "utf8");
  if (basename(file) === "SKILL.md") {
    validateFrontmatter(file, content);
  }
  validateJsonBlocks(file, content);
  validateBashBlocks(file, content);
  validateInternalLinks(file, content);
}

function main() {
  for (const dir of SKILL_DIRS) {
    const skillRoot = join(repoRoot, dir);
    if (!existsSync(skillRoot)) {
      err(`${dir}/`, 0, `Listed skill directory \`${dir}/\` does not exist in the repo.`);
      continue;
    }
    if (!existsSync(join(skillRoot, "SKILL.md"))) {
      err(`${dir}/`, 0, `\`${dir}/SKILL.md\` is missing.`);
    }
    for (const f of walk(skillRoot)) {
      lintFile(f);
    }
  }
  // Also lint top-level docs.
  for (const top of ["README.md", "AGENTS.md", "CHANGELOG.md", "CLAUDE.md"]) {
    const p = join(repoRoot, top);
    if (existsSync(p)) lintFile(p);
  }

  // Catalog consistency — hand-maintained catalogs must not drift from disk.
  // 1. Every skill directory on disk is listed in SKILL_DIRS (so it gets linted).
  // 2. Every skill (except the router itself) is routed from cargo/SKILL.md.
  // 3. Every cargo-gtm recipe on disk appears in the cargo-gtm/SKILL.md and
  //    README.md recipe tables.
  const diskSkillDirs = readdirSync(repoRoot).filter((d) => {
    if (d.startsWith(".") || d === "node_modules") return false;
    const p = join(repoRoot, d);
    return statSync(p).isDirectory() && existsSync(join(p, "SKILL.md"));
  });
  for (const dir of diskSkillDirs) {
    if (!SKILL_DIRS.includes(dir)) {
      err(
        join(repoRoot, dir, "SKILL.md"),
        0,
        `Skill directory \`${dir}/\` exists on disk but is not listed in the linter's SKILL_DIRS — add it so it gets linted.`
      );
    }
  }
  const routerPath = join(repoRoot, "cargo", "SKILL.md");
  if (existsSync(routerPath)) {
    const router = readFileSync(routerPath, "utf8");
    for (const dir of diskSkillDirs) {
      if (dir === "cargo") continue;
      if (!router.includes(`../${dir}/SKILL.md`)) {
        err(
          routerPath,
          0,
          `Router \`cargo/SKILL.md\` does not link \`../${dir}/SKILL.md\` — every skill must be routed from the router.`
        );
      }
    }
  }
  const recipesDir = join(repoRoot, "cargo-gtm", "recipes");
  if (existsSync(recipesDir)) {
    const gtmSkillPath = join(repoRoot, "cargo-gtm", "SKILL.md");
    const gtmSkill = existsSync(gtmSkillPath) ? readFileSync(gtmSkillPath, "utf8") : "";
    const readmePath = join(repoRoot, "README.md");
    const readme = existsSync(readmePath) ? readFileSync(readmePath, "utf8") : "";
    for (const f of readdirSync(recipesDir).filter((n) => n.endsWith(".md"))) {
      if (!gtmSkill.includes(`recipes/${f}`)) {
        err(
          gtmSkillPath,
          0,
          `Recipe \`recipes/${f}\` exists on disk but is not referenced in cargo-gtm/SKILL.md — add it to the recipe table.`
        );
      }
      if (!readme.includes(f)) {
        err(
          readmePath,
          0,
          `Recipe \`cargo-gtm/recipes/${f}\` is not mentioned in README.md — add it to the recipe table.`
        );
      }
    }
  }

  const errors = findings.filter((f) => f.severity === "error");
  const warnings = findings.filter((f) => f.severity === "warn");

  const byFile = new Map();
  for (const f of findings) {
    if (!byFile.has(f.file)) byFile.set(f.file, []);
    byFile.get(f.file).push(f);
  }
  for (const [file, items] of byFile) {
    process.stdout.write(`\n${relative(repoRoot, file)}\n`);
    for (const item of items) {
      const tag = item.severity === "error" ? "ERROR" : "warn ";
      process.stdout.write(`  ${tag} L${item.line}  ${item.message}\n`);
    }
  }

  process.stdout.write(
    `\nSummary: ${errors.length} error(s), ${warnings.length} warning(s).\n`
  );
  process.exit(errors.length > 0 ? 1 : 0);
}

main();
