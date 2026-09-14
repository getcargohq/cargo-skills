// skill-redirects.mjs — recognise redirect stubs left at a renamed skill's old
// directory.
//
// `npx skills add` never deletes an installed skill that disappeared upstream,
// and `skills update` only offers to, interactively. A plain rename therefore
// leaves every existing install with a frozen copy under the old name, routing
// next to the new one forever. Keeping the old name as a skill whose body is a
// pointer is the only way the next refresh overwrites that copy.
//
// A redirect is not part of the pack: the skill count, routing evals, llms.txt
// and the Codex package all skip it. It declares its target in frontmatter:
//
//   metadata:
//     redirect: cargo-project

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** The skill a SKILL.md redirects to, or null when it is a real skill. */
export function redirectTarget(skillMdText) {
  if (!skillMdText.startsWith("---")) return null;
  const end = skillMdText.indexOf("\n---", 3);
  if (end === -1) return null;
  return /^\s+redirect:\s*"?([a-z0-9-]+)"?\s*$/m.exec(skillMdText.slice(0, end))?.[1] ?? null;
}

/** True when `skillDir` holds a SKILL.md that is a redirect stub. */
export function isRedirectSkill(skillDir) {
  const skillMd = join(skillDir, "SKILL.md");
  return existsSync(skillMd) && redirectTarget(readFileSync(skillMd, "utf8")) !== null;
}
