# Cargo skills — agent guide

The router skill at [`cargo/SKILL.md`](cargo/SKILL.md) is the canonical entry point for working with this skillpack. It explains the seventeen skills (the `cargo` router + one onboarding skill `cargo-quickstart` + one outcome skill `cargo-gtm` + fourteen capability skills), the UUID flow between them, async polling, end-to-end use cases, and common gotchas.

The term reference lives in [`cargo/references/glossary.md`](cargo/references/glossary.md).

Both files are installed as part of the `cargo` skill via `npx skills add getcargohq/cargo-skills`, so the same content is available after install at `~/.claude/skills/cargo/`.

## Working in this repo

Before opening a PR, run the checks CI runs:

```bash
node .github/scripts/skills-lint.mjs .            # frontmatter, links, JSON blocks, bootstrap, counts
node .github/scripts/skills-metadata.mjs --write . # regenerate skill-metadata.json content hashes
node .github/scripts/generate-llms-txt.ts          # regenerate the machine-readable index
node .github/scripts/sync-trigger-slugs.ts --check  # integration/provider names in descriptions
node .github/scripts/routing-eval.ts               # description routing regressions
```

Contribution conventions — including the four-part description template every skill's `description` must follow — are in [`CONTRIBUTING.md`](CONTRIBUTING.md).
