# Contributing

Thanks for improving the Cargo agent skills. This repo is small and heavily linted, so most contributions are quick.

## What lives here

Seventeen skills at the repo root, each its own directory with a `SKILL.md`:

- **`cargo`** — the router. Explains the graph and routes to everything else.
- **`cargo-quickstart`** — the guided first-run demo.
- **`cargo-gtm`** — the outcome skill: recipes, phase guides, provider playbooks.
- **Fourteen capability skills** — one per CLI domain, plus the cross-domain `cargo-diagnostics`.

Supporting material sits beside each `SKILL.md` in `references/`, `recipes/`, `guides/`, `provider-playbooks/`, `agents/`, and `scripts/`.

## Setup

```bash
git clone https://github.com/getcargohq/cargo-skills
cd cargo-skills
npm install -g @cargo-ai/cli     # the CLI these skills document
cargo-ai login --email you@company.com
```

Node ≥ 22.18 — the scripts are TypeScript run through Node's native type-stripping, with no build step and no dependencies.

## Before you open a PR

Run everything CI runs:

```bash
node .github/scripts/skills-lint.mjs .              # frontmatter, links, JSON, bootstrap, counts, catalogs
node .github/scripts/skills-metadata.mjs --write .  # regenerate skill-metadata.json content hashes
node .github/scripts/generate-llms-txt.ts           # regenerate llms.txt
node .github/scripts/sync-trigger-slugs.ts          # refresh integration names inside descriptions
node .github/scripts/routing-eval.ts                # description routing regressions
for s in cargo-gtm/scripts/*.ts; do node "$s" --fixtures; done   # QA script fixtures
```

The linter is strict on purpose. It fails on a broken internal link, an unparseable JSON block, a `cargo-ai` example naming an unknown CLI domain, a stale `skill-metadata.json`, a recipe or provider playbook that exists on disk but is missing from its catalog table, a skill count that disagrees with the tree, and a `SKILL.md` with no self-contained bootstrap.

## The description is the product

An agent sees exactly one thing before deciding whether to load a skill: its `description`. Everything else in the repo is invisible until that decision is already made. Treat it as the highest-stakes text in the file.

Every `description` follows a four-part template:

```
<Job, in the words a user would actually say>.
Triggers: "<literal phrase>", "<literal phrase>", … .
<Proper nouns: integration slugs, CLI domain, key objects>.
Skip when: <the sibling skill that owns the adjacent case>.
```

Rules that come out of that:

1. **Lead with the job, not the CLI surface.** "Get data out of Cargo and measure what ran" beats "Manage analytics resources using the Cargo CLI." A user says the former; only the docs say the latter.
2. **Trigger phrases are literal and quoted.** Write what a person types — `"how many credits do I have left"`, `"why did this fail"`, `"alert me when"` — not a category name.
3. **Name proper nouns.** Integration and provider slugs are the highest-precision routing tokens available. They are generated into `cargo-gtm` and `cargo-connection` by `sync-trigger-slugs.ts` — refresh rather than hand-edit those lists.
4. **Always end with `Skip when:`.** Seventeen skills compete for every prompt; the negative case is what stops the wrong one loading. Point at the skill that should win instead.
5. **Keep it under ~900 characters** (the generated slug lists make `cargo-gtm` and `cargo-connection` the exceptions).

If you change any description, run `node .github/scripts/routing-eval.ts` and add a case to `evals/routing.jsonl` for the behavior you intended.

## Adding a skill

1. Create `cargo-<domain>/SKILL.md` with frontmatter: `name` (matching the directory), `description` (four-part template above), `version` (`MAJOR.MINOR.PATCH`), `compatibility`, `homepage`, and the `metadata.openclaw` install block copied from a sibling.
2. Give it a **self-contained Bootstrap section** — install, `login`, `whoami` in a fenced shell block. A skill installed on its own has no `../cargo/` sibling to link to, and the linter enforces this.
3. Add the directory to `SKILL_DIRS` in `.github/scripts/skills-lint.mjs`.
4. Route it from `cargo/SKILL.md` (a `../<dir>/SKILL.md` link is required) and add a `### <name>` block of critical rules.
5. Add a row to the README capability table and update the skill counts (the linter will tell you where).
6. Regenerate metadata and `llms.txt`.

## Adding a recipe or a provider playbook

Recipes live in `cargo-gtm/recipes/` (or `cargo-cdk/recipes/`), playbooks in `cargo-gtm/provider-playbooks/`. Both are discovered by filename, so:

- Every recipe must appear in the `cargo-gtm/SKILL.md` recipe table **and** the README recipe table.
- Every playbook must appear in the `cargo-gtm/SKILL.md` playbook catalog.
- Both are picked up automatically by `generate-llms-txt.ts` — the first prose line of the file becomes its public one-line summary, so make that line count.

A provider playbook must document: action slugs, config shape, credit cost per action, input requirements, known output quirks, and a **Recurring use** section (cadence default and re-billing gates) — a bad config in a scheduled play re-bills on every run.

## House rules

- **Verify against the live CLI.** Every documented flag, response field, and error should have been observed, not inferred. `cargo-ai <domain> <command> --help` first; run it if you can.
- **Scripts are TypeScript**, zero-dependency, with a `--fixtures` self-test that runs in CI.
- **Cost discipline is non-negotiable.** Anything that spends credits documents the cost and routes through the pilot → approval → receipt gate in `cargo-gtm/references/cost-discipline.md`.
- **Don't name competing products** in skill content, commit messages, branch names, or PR bodies.
- **One channel per install.** The plugin and `skills add` both register the skills; docs should never suggest running both.

## Reporting a problem

Found a CLI bug or a wrong instruction while using the skills? The fastest path is the in-product channel — every report is read by the Cargo team:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<commands run, errorMessage verbatim, expected vs actual, UUIDs>"
```

GitHub issues and PRs work too.

## License

By contributing you agree that your contributions are licensed under the repository's [MIT License](LICENSE).
