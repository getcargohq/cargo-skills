# Changelog

All notable changes to the skills in this repository are tracked here. Each skill is versioned independently via the `version:` field in its `SKILL.md` frontmatter. ClawHub publish skips skills whose published version is unchanged, so bumping the field is what ships a new release.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/):

- **MAJOR** — breaking changes to the commands, flags, or response shapes documented in the skill (the agent has to relearn something).
- **MINOR** — new commands, new sections, new recipes/examples, or non-breaking restructures.
- **PATCH** — copy edits, link fixes, clarifications, and other no-behavior changes.

## [Unreleased]

### Repository-wide

- **Shared prerequisites reference.** Extracted the duplicated install / login / output-conventions block from every capability skill into [`cargo/references/prerequisites.md`](cargo/references/prerequisites.md). Each capability skill now links to it instead of redefining ~16 lines of boilerplate. No behavior change for agents — the canonical setup is the same — but a single place to keep it correct.
- **CHANGELOG.** This file. Per-skill version bumps are now recorded here so consumers can see what changed between two pinned versions.
- **CI skill-lint.** Added [`.github/workflows/skills-lint.yml`](.github/workflows/skills-lint.yml) and [`.github/scripts/skills-lint.mjs`](.github/scripts/skills-lint.mjs). Runs on every push and PR; validates SKILL.md frontmatter shape, JSON snippets inside fenced code blocks, internal markdown links, and that bash examples reference real `cargo-ai` domains. Catches drift before it reaches users.

### `cargo` → 1.1.0

- Add `references/prerequisites.md` — the canonical setup block linked from every capability skill.
- Skill graph table now deep-links each row to the target `SKILL.md` (in addition to the existing in-page recap anchor). Cuts one navigation hop for agents jumping from the router into a capability skill.
- Add five node-building gotchas to `references/gotchas.md` (don't default to `python` nodes; JS `script` node sandbox limits; template expressions fail silently; group results are an array; context survives a `delay`) and a "don't default to `python`" bullet to the `cargo-orchestration` recap. Cross-links the new `node-selection.md`.
- No command, flag, or response-shape changes.

### `cargo-orchestration` → 1.5.0

- **New reference: `references/node-selection.md`** — guidance for choosing the right node and avoiding unnecessary `python` *and* `script` (JS) nodes when building graphs via the CLI. Covers the transform/LLM/HTTP/routing → native-node decision table, the native `agent` LLM node (structured `output.type:"jsonSchema"`, read `.answer`), template-expression capabilities and the silent-`undefined` footgun, inspecting node-to-node data via `run get` → `runContext.<slug>`, the Pyodide sandbox limits (no network, no `time.sleep`, no `asyncio`, JSON-serializable output), a parallel JS `script` sandbox section (Node `vm` module allowlist, no `console`, UTC-pinned `Date`, no `process`/`fetch`, prefer the connector node over `axios`) with a python-vs-script comparison table, what actually survives a `delay` boundary, and group-result array access.
- `SKILL.md` — add a "don't default to `python` nodes" composition callout near the top decision section and link the new reference.
- `references/nodes.md` — steer the `python`/`script` section toward native nodes, document that the group node's output is an array (`{{nodes.<groupSlug>[0].<field>}}`, no `.results` wrapper), and clarify that run context survives a `delay`.
- No command, flag, or response-shape changes — clarifications and a new reference only.

### `cargo-ai` → 1.1.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-analytics` → 1.4.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-billing` → 1.0.1

- Prerequisites section trimmed to a one-line pointer; admin-scope requirement is now stated directly under the new Prerequisites note instead of in a separate paragraph.

### `cargo-connection` → 1.1.0

- Moved the "Key concepts" section above Prerequisites so the integration-vs-connector distinction is in scope before the agent reaches the command list.
- Tightened the `integration get <slug>` vs `native-integration get` comparison table to use ✓/✗ markers for third-party vs built-in action scope, making it harder to mis-route a HubSpot/Salesforce lookup to `native-integration get`.
- Prerequisites section trimmed to a one-line pointer.

### `cargo-context` → 1.0.1

- Prerequisites section trimmed to a one-line pointer. Kept the inline reminder that `runtime write` and `runtime edit` push commits, so confirming `workspace.name` first is non-negotiable.

### `cargo-orchestration` → 1.4.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-storage` → 1.1.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-workspace-management` → 1.0.1

- Prerequisites section trimmed to a one-line pointer; the admin-vs-non-admin split is now stated directly under the new Prerequisites note.

### `cargo-gtm` → 1.0.0 (unchanged)

- No changes in this cycle. `cargo-gtm` does not duplicate the install/login boilerplate (it delegates to capability skills), so the shared-prerequisites refactor doesn't touch it.

## Historical baseline (pre-CHANGELOG)

Versions present at the time this file was introduced, captured for posterity:

| Skill                        | Version |
| ---------------------------- | ------- |
| `cargo`                      | 1.0.0   |
| `cargo-gtm`                  | 1.0.0   |
| `cargo-orchestration`        | 1.4.0   |
| `cargo-storage`              | 1.1.0   |
| `cargo-connection`           | 1.0.0   |
| `cargo-ai`                   | 1.1.0   |
| `cargo-context`              | 1.0.0   |
| `cargo-analytics`            | 1.4.0   |
| `cargo-billing`              | 1.0.0   |
| `cargo-workspace-management` | 1.0.0   |

Pre-history changes can be reconstructed from `git log -- <dir>/SKILL.md`.
