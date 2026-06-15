# Changelog

All notable changes to the skills in this repository are tracked here. Each skill is versioned independently via the `version:` field in its `SKILL.md` frontmatter. ClawHub publish skips skills whose published version is unchanged, so bumping the field is what ships a new release.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/):

- **MAJOR** — breaking changes to the commands, flags, or response shapes documented in the skill (the agent has to relearn something).
- **MINOR** — new commands, new sections, new recipes/examples, or non-breaking restructures.
- **PATCH** — copy edits, link fixes, clarifications, and other no-behavior changes.

## [Unreleased]

### Repository-wide

- **Session lifecycle moved to the installer.** The Claude Code `SessionStart`/`SessionEnd` hooks that keep `@cargo-ai/cli` + the skills bundle current and log each session to `workspace_management.sessions` are now scaffolded by the Cargo bootstrap installer (`curl -fsSL https://api.getcargo.io/install.sh | sh`, interactive prompt, opt out with `CARGO_INSTALL_NO_HOOKS=1`). Removed the hand-rolled hook-scaffolding recipes from `cargo/SKILL.md`, `README.md`, and `cargo-workspace-management/references/examples/sessions.md`; those docs now point at the installer. The agent's three-session-jobs guidance stays as the manual fallback, and reporting (job 2) is unchanged — it can't be automated.
- **Shared prerequisites reference.** Extracted the duplicated install / login / output-conventions block from every capability skill into [`cargo/references/prerequisites.md`](cargo/references/prerequisites.md). Each capability skill now links to it instead of redefining ~16 lines of boilerplate. No behavior change for agents — the canonical setup is the same — but a single place to keep it correct.
- **CHANGELOG.** This file. Per-skill version bumps are now recorded here so consumers can see what changed between two pinned versions.
- **CI skill-lint.** Added [`.github/workflows/skills-lint.yml`](.github/workflows/skills-lint.yml) and [`.github/scripts/skills-lint.mjs`](.github/scripts/skills-lint.mjs). Runs on every push and PR; validates SKILL.md frontmatter shape, JSON snippets inside fenced code blocks, internal markdown links, and that bash examples reference real `cargo-ai` domains. Catches drift before it reaches users.
- **Skill-lint domain list refreshed.** Added the CLI domains that shipped since the lint was written — `content`, `expression`, `hosting`, `revenue-organization`, `system-of-record`, `user-management`, plus `init`/`version` — so valid examples no longer warn.
- **New capability skill: `cargo-content`.** The `content` CLI domain (files + libraries) is now its own skill rather than living inside `cargo-ai`, matching the repo's one-skill-per-CLI-domain convention. File/library command docs, the `examples/files.md` walkthrough, response shapes, and troubleshooting moved into `cargo-content/`; `cargo-ai` keeps the attach-to-agent wiring and cross-links to `cargo-content`.
- **New capability skill: `cargo-hosting`.** The `hosting` CLI domain (apps, workers, deployments) graduates from the router's "CLI domains without a dedicated skill yet" table into its own capability skill. `SKILL.md` documents the `init → create → deploy → promote` lifecycle for Vite SPA apps (served on `*.cargo.app`) and edge workers, with `examples/{apps,workers,deployments}.md`, `response-shapes.md`, and `troubleshooting.md`. The router (`cargo`) and `README.md` register it: skill counts bumped (router 10→11 skills, README 11→12), capability-table row + recap added, and `hosting` removed from the no-skill-yet table.

### `cargo-hosting` → 1.0.0

- Initial release. Covers `hosting app`, `hosting worker`, and `hosting deployment` (CLI 1.0.22): scaffolding from templates, creating app/worker slots, building+uploading deployments, and promoting to the live URL.

### `cargo` → 1.5.0

- **Register the `cargo-hosting` skill.** Bumped the skill count to 11 (one outcome + ten capability), added the `cargo-hosting` capability-table row and a full recap, and added it to the one-per-CLI-domain list. Removed `hosting` from the "CLI domains without a dedicated skill yet" table now that it has a dedicated skill. Synced the frontmatter description count (was stale at nine/eight).
- **Glossary entries for hosting.** Added `app (Cargo Hosting)`, `appUuid`, `deployment (Cargo Hosting)`, `deploymentUuid`, `hosting`, `worker (Cargo Hosting)`, and `workerUuid` to `references/glossary.md`, and corrected the `capability skill` entry's domain list (was missing `content` and `hosting`).

### `cargo` → 1.4.0

- Removed the "Claude Code: scaffold a hook pair to automate the lifecycle" section. The installer now owns hook scaffolding, so the router no longer instructs the agent to offer it.
- The "Every Cargo session has three jobs" section gains a callout: jobs 1 (refresh + register) and 3 (finalize) run automatically when the installer's `SessionStart`/`SessionEnd` hooks are present; do them by hand only when the hooks aren't installed. Job 2 (reporting) is unchanged and stays the agent's responsibility.

### `cargo` → 1.3.0

- Add `references/prerequisites.md` — the canonical setup block linked from every capability skill.
- Skill graph table now deep-links each row to the target `SKILL.md` (in addition to the existing in-page recap anchor). Cuts one navigation hop for agents jumping from the router into a capability skill.
- Add a "prefer built-in actions + expressions" bullet to the `cargo-orchestration` recap, cross-linking the new `node-selection.md`.
- **Register the `cargo-content` skill.** Bumped the skill count to 10 (one outcome + nine capability), added the `cargo-content` capability-table row and a full recap, placed it in the dependency diagram (content feeds files/libraries to `cargo-ai`; files also surface under `.files/` in `cargo-context`), and added the dependency-rule bullet. Reframed the `cargo-ai` row/recap around documents + attach. Updated the `content domain` glossary entry to point at `cargo-content`.
- **New "CLI domains without a dedicated skill yet" table** — surfaces `segmentation`, `expression`, `system-of-record`, `revenue-organization`, `hosting`, and `user-management` so agents know they exist and to use `--help`.

### `cargo-orchestration` → 1.5.0

- **New reference: `references/node-selection.md`** — short guide on the core principle: prefer the built-in (native + connector) actions plus template expressions, and avoid `python`, `script` (JS), and raw HTTP nodes unless necessary. Includes the "use this instead" table, what template expressions cover, the silent-empty footgun (verify via `run get` → `runContext.<slug>`), and when a code/HTTP node is genuinely warranted.
- `SKILL.md` — add a "prefer built-in actions + expressions" composition callout near the top decision section and link the new reference.
- `references/nodes.md` — steer the `python`/`script` section toward native nodes, document that the group node's output is an array (`{{nodes.<groupSlug>[0].<field>}}`, no `.results` wrapper), and clarify that run context survives a `delay`.
- `references/examples/agents.md` — fixed the knowledge-file upload example to use `cargo-ai content file upload` (was the removed `ai file upload`).
- No command, flag, or response-shape changes — clarifications and a new reference only.

### `cargo-content` → 1.0.0 (new)

- **New capability skill for the `content` CLI domain.** Covers **files** (`content file` — list/get/upload/update/remove) and **libraries** (`content library` — list/get/create/update/remove; `native` vs `connector`-backed with `--extractor-slug` / `--connector-uuid`).
- Carries the moved `references/examples/files.md` walkthrough (upload → attach → deploy), a `references/response-shapes.md` (the `content file list` shape, matching the workspace `File` type — `libraryUuid`, `isIndexedInOpenAiVectorStore`, `kind` native/connector union, etc.; library shape left to live capture rather than guessed), and a `references/troubleshooting.md` (`fileNotFound`, `folderNotFound`, upload failures, the `unknown command` error on the old `ai file …` path).
- Documents that uploaded content files surface **read-only** under `.files/` in the `cargo-context` runtime sandbox, and that attaching a file/library to an agent lives in `cargo-ai`.

### `cargo-ai` → 2.1.0

- **BREAKING — files & libraries moved out (CLI ≥ 1.0.19), now in `cargo-content`.** The old `cargo-ai ai file …` commands no longer exist. File/library command docs, the `examples/files.md` walkthrough, and the file response-shape/troubleshooting blocks moved to the new `cargo-content` skill; `cargo-ai` cross-links to it.
- Reframed the knowledge section as "Knowledge for RAG (files & libraries)": where each lives (`cargo-content`) and the attach-via-`release resources` → `deploy-draft` wiring.
- Dropped the `ai document` (inline document) commands from the skill — low-value surface, not worth the agent's attention.
- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`.

### `cargo-analytics` → 1.4.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-billing` → 1.0.1

- Prerequisites section trimmed to a one-line pointer; admin-scope requirement is now stated directly under the new Prerequisites note instead of in a separate paragraph.

### `cargo-connection` → 1.1.0

- Moved the "Key concepts" section above Prerequisites so the integration-vs-connector distinction is in scope before the agent reaches the command list.
- Tightened the `integration get <slug>` vs `native-integration get` comparison table to use ✓/✗ markers for third-party vs built-in action scope, making it harder to mis-route a HubSpot/Salesforce lookup to `native-integration get`.
- Prerequisites section trimmed to a one-line pointer.

### `cargo-context` → 1.1.0

- **New: content files under `.files/`.** Documented in the Runtime sandbox section that the workspace's `content file` uploads are mounted **read-only** under `.files/`, readable by `runtime execute`/`read`/`browse` but outside the committed context tree (never pushed, not writable). Cross-links `cargo-content`.
- Prerequisites section trimmed to a one-line pointer. Kept the inline reminder that `runtime write` and `runtime edit` push commits, so confirming `workspace.name` first is non-negotiable.
- Fixed the RAG cross-reference to point at `cargo-content` for `content file` uploads (was the removed `ai file upload`).

### `cargo-orchestration` → 1.4.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-storage` → 1.1.1

- Prerequisites section trimmed to a one-line pointer at `cargo/references/prerequisites.md`. No command surface change.

### `cargo-workspace-management` → 1.0.2

- `references/examples/sessions.md` no longer hand-rolls the SessionStart/SessionEnd hook scripts — it points at the Cargo installer, which scaffolds them. The `session upsert` command docs (CLI surface, schema, manual upsert) are unchanged.
- Both in-SKILL pointers to `sessions.md` reworded to say the installer wires the hooks automatically.

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
