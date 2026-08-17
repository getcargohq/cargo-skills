// Build (or check) .well-known/agent-skills/index.json.
//
// WHY THIS EXISTS
//
// getcargo.ai proxies /.well-known/agent-skills/* to this directory on raw
// GitHub, so `npx skills add getcargo.ai` resolves through RFC 8615 discovery
// and lands on the front-door skill here, which then installs the real bundle.
//
// The index carries a sha256 digest per entry, and the skills CLI VERIFIES it:
// providers/wellknown.ts rejects an entry whose bytes do not hash to the
// declared digest, and it does so by returning nothing rather than by raising.
// So an index that drifts from its skill.md does not fail loudly, it makes the
// install quietly find no skill. That is why this is generated and checked in
// CI rather than hand-maintained.
import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const DIR = join(ROOT, ".well-known", "agent-skills");
const INDEX = join(DIR, "index.json");
const SCHEMA = "https://schemas.agentskills.io/discovery/0.2.0/schema.json";

/** Frontmatter is a flat block here by construction; no YAML dependency. */
function frontmatterField(text, field) {
  if (!text.startsWith("---\n")) throw new Error("missing frontmatter");
  const block = text.slice(4, text.indexOf("\n---", 3));
  for (const line of block.split("\n")) {
    const match = line.match(new RegExp(`^${field}:\\s*(.+)$`));
    if (match) return match[1].trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(`missing \`${field}\` in frontmatter`);
}

function build() {
  const skills = readdirSync(DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(DIR, e.name, "skill.md")))
    .map((e) => e.name)
    .sort()
    .map((name) => {
      const bytes = readFileSync(join(DIR, name, "skill.md"));
      return {
        name,
        type: "skill-md",
        description: frontmatterField(bytes.toString("utf8"), "description"),
        // Relative, so it resolves against whichever host served the index.
        url: `${name}/skill.md`,
        digest: `sha256:${createHash("sha256").update(bytes).digest("hex")}`,
      };
    });
  if (skills.length === 0) throw new Error(`no skill.md found under ${DIR}`);
  return `${JSON.stringify({ $schema: SCHEMA, skills }, null, 2)}\n`;
}

const built = build();

if (process.argv.includes("--check")) {
  const current = existsSync(INDEX) ? readFileSync(INDEX, "utf8") : "";
  if (current !== built) {
    console.error(
      "error .well-known/agent-skills/index.json is stale.\n" +
        "      Run `node .github/scripts/build-well-known.mjs` and commit the result.\n" +
        "      Left as is, the digest will not match the skill and `skills add\n" +
        "      getcargo.ai` will install nothing at all, without an error.",
    );
    process.exit(1);
  }
  console.log(`well-known index: in sync (${JSON.parse(built).skills.length} skill(s))`);
} else {
  writeFileSync(INDEX, built);
  console.log(`well-known index: wrote ${JSON.parse(built).skills.length} skill(s)`);
}
