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
- **Skill-lint domain list refreshed.** Added the CLI domains that shipped since the lint was written — `content`, `expression`, `hosting`, `revenue-organization`, `system-of-record`, `user-management`, plus `init`/`version` — so valid examples no longer warn.

### `cargo` → 1.2.0

- Add `references/prerequisites.md` — the canonical setup block linked from every capability skill.
- Skill graph table now deep-links each row to the target `SKILL.md` (in addition to the existing in-page recap anchor). Cuts one navigation hop for agents jumping from the router into a capability skill.
- Add a "prefer built-in actions + expressions" bullet to the `cargo-orchestration` recap, cross-linking the new `node-selection.md`.
- **Register the `content` domain.** Updated the `cargo-ai` recap and capability-table row to point at `content file` / `content library` for RAG knowledge, with the `ai file` → `content` breaking-change note. Added `content domain` and `library` glossary entries and refreshed the RAG entry.
- **New "CLI domains without a dedicated skill yet" table** — surfaces `segmentation`, `expression`, `system-of-record`, `revenue-organization`, `hosting`, and `user-management` so agents know they exist and to use `--help`.

### `cargo-orchestration` → 1.5.0

- **New reference: `references/node-selection.md`** — short guide on the core principle: prefer the built-in (native + connector) actions plus template expressions, and avoid `python`, `script` (JS), and raw HTTP nodes unless necessary. Includes the "use this instead" table, what template expressions cover, the silent-empty footgun (verify via `run get` → `runContext.<slug>`), and when a code/HTTP node is genuinely warranted.
- `SKILL.md` — add a "prefer built-in actions + expressions" composition callout near the top decision section and link the new reference.
- `references/nodes.md` — steer the `python`/`script` section toward native nodes, document that the group node's output is an array (`{{nodes.<groupSlug>[0].<field>}}`, no `.results` wrapper), and clarify that run context survives a `delay`.
- `references/examples/agents.md` — fixed the knowledge-file upload example to use `cargo-ai content file upload` (was the removed `ai file upload`).
- No command, flag, or response-shape changes — clarifications and a new reference only.

### `cargo-ai` → 2.0.0

- **BREAKING — files & libraries moved to the new `content` domain (CLI ≥ 1.0.19).** The old `cargo-ai ai file …` commands no longer exist; use `cargo-ai content file …` (list/get/upload/update/remove) and `cargo-ai content library …` (list/get/create/update/remove). Every `ai file` reference in `SKILL.md`, `references/examples/files.md`, `references/examples/templates.md`, `references/troubleshooting.md`, and `references/response-shapes.md` was migrated.
- **New: knowledge libraries.** Documented `content library` — `native` vs `connector`-backed collections that group files for RAG, created with `--extractor-slug` / `--connector-uuid`.
- **New: inline documents.** Documented `ai document` (list/get/create/reset) for hand-authored knowledge text attached to agents without a file upload.
- Renamed the "Files" section to "Knowledge files, libraries & documents"; added a command-surface-change callout near the top so agents on muscle memory don't reach for the removed `ai file`.
- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`.

### `cargo-analytics` → 1.4.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-billing` → 1.0.1

- Prerequisites section trimmed to a one-line pointer; admin-scope requirement is now stated directly under the new Prerequisites note instead of in a separate paragraph.

### `cargo-connection` → 1.1.0

- Moved the "Key concepts" section above Prerequisites so the integration-vs-connector distinction is in scope before the agent reaches the command list.
- Tightened the `integration get <slug>` vs `native-integration get` comparison table to use ✓/✗ markers for third-party vs built-in action scope, making it harder to mis-route a HubSpot/Salesforce lookup to `native-integration get`.
- Prerequisites section trimmed to a one-line pointer.

### `cargo-context` → 1.0.2

- Prerequisites section trimmed to a one-line pointer. Kept the inline reminder that `runtime write` and `runtime edit` push commits, so confirming `workspace.name` first is non-negotiable.
- Fixed the RAG cross-reference to `cargo-ai` to use `cargo-ai content file upload` (was the removed `ai file upload`).

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
