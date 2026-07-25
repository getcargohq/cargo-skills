# Changelog

All notable changes to the skills in this repository are tracked here. Each skill is versioned independently via the `version:` field in its `SKILL.md` frontmatter. ClawHub publish skips skills whose published version is unchanged, so bumping the field is what ships a new release.

The format is loosely based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/). Versions follow [SemVer](https://semver.org/):

- **MAJOR** — breaking changes to the commands, flags, or response shapes documented in the skill (the agent has to relearn something).
- **MINOR** — new commands, new sections, new recipes/examples, or non-breaking restructures.
- **PATCH** — copy edits, link fixes, clarifications, and other no-behavior changes.

## [Unreleased]

### `cargo-connection` → 1.2.0

- New **"Reading an action's input schema — and where the inputs go"** section: an action's inputs live at `actions.<slug>.config.schema`; for top-level `action execute`/`execute-batch` the values go in `--data`, **not** the action `config` (documents the `A top-level action does not use action.config` error); and identity-driven actions (`connectProfile`, `visitProfile`, `extractEventAttendees`) need `identityIds` from the `listIdentityIds` autocomplete (a `must match format "uuid"` error means it's missing).

### `cargo-gtm` → 1.8.0

- **Surface the "already have identifiers" path.** The priority stack is sourcing-first, which hid the cheapest URL-anchored enrich. Added a callout after the provider table and a `linkedin.enrichProfile`-first branch to the ENRICH step of the recipe spine: LinkedIn URL → `linkedin.enrichProfile`/`enrichCompany` (0.25), event URL → `linkedin.extractEventAttendees`, email → `leadMagic`/`contactOut` — before the pricier `waterfall.enrichContact` (which keys on email or name+company, not a URL).
- **Removed the `proxycurl` provider playbook.** The Proxycurl API has been sunset (live calls return `API_SUNSET`); dropped the playbook, its `credits-cost-table` rows, and its `skill-metadata` entry. Use `linkedin.enrichProfile`/`enrichCompany` (0.25, URL-anchored) or `peopleDataLabs` instead.

### `cargo` → 1.15.0 (router)

- Priority-provider-stack line now points agents holding LinkedIn/event URLs straight to `linkedin` (cheapest URL-anchored enrich) rather than the sourcing-first stack — the miss that prompted these edits.

### `cargo-gtm` → 1.6.1

- Import recipe step 5 now points at schema-as-JSON exports as the mapping input for rebuilding source-tool logic, citing [ClayMate Lite](https://github.com/GTM-Base/claymate-lite) for Clay tables (third-party MIT extension, with a review-before-loading caution). Explicit exception to the no-competitor-names convention, approved 2026-07-10.

### `cargo-gtm` → 1.7.0

- **Provider playbooks: 20 → 43 — every credits-based provider covered.** Twenty-three more playbooks grounded in `connection integration get`: the LLM tier (`anthropic`, `openAi`, `gemini`, `perplexity` — per-model cost tiers and bulk-vs-judgment routing), verification/contact long tail (`bouncer`, `neverBounce`, `dropcontact`, `enrichley`, `enrowio`, `reverseContact`, `rocketreach`, `forager`, `cleon1`, `mixrank`, `kitt`), enrichment (`companyEnrich`, `enrichCrm`, `societeInfo`, `snitcher`), and sourcing/signal (`piloterr`, `g2`, `theSwarm`, `linkup`). The §11 read-first gate now covers the whole credits catalog; the "no playbook → alternatives.md" fallback remains only for own-key integrations.
- **Fixed by the grounding pass:** model ids not in the anthropic connector enum (`claude-haiku-4-5` → `claude-3-5-haiku-latest`, `claude-sonnet-5` → `claude-sonnet-4-6` across `outreach-activation`, the prompt library, and `writing-outreach`); `temperature` mis-nested in `instruct` config examples (belongs in `advancedSettings` with `maxTokens`); stale LLM costs (the 0.006 tier is `gpt-5-nano`, not `gpt-4o-mini`; `gpt-4o` is 0.5, not 0.03; anthropic Sonnet is 0.2, not 2; costs are per 1k-token package). Prompt-library sampling guidance now defers to the anthropic playbook for per-model rules.

### `cargo` → 1.14.0 (plugin bundle)

- **Native subagents (Claude Code plugin).** New root [`agents/`](agents/): `cargo-execution-planner` (costed stage-by-stage GTM plans, pilot-first, budget-reconciled — read-only) and `cargo-list-builder` (parallel sourcing fan-out; executes only the exact pre-approved action per slice, returns rows to a file). Both `model: haiku`, canonical role specs stay in `cargo-gtm/agents/` so every channel keeps them.
- **Opt-in statusline.** New [`hooks/cargo-statusline.mjs`](hooks/cargo-statusline.mjs) — `<model> | ⬢ cargo <workspace> · <credits> credits · CLI <pin-state>`. Render path never touches the network (cache + detached refresh, every failure degrades to showing less); statuslines are user-level config so the README documents the one-line `settings.json` wiring. `cargo-gtm` → 1.5.0 (list-builder agent + §2 fan-out routing).

### Repository-wide (WS3)

- **Machine-readable skill metadata.** Every skill now ships a generated `skill-metadata.json` — a typed catalog of its documents (`entrypoint`/`recipe`/`guide`/`reference`/`provider-playbook`/`prompt-library`/`agent`/`script`/`fixture`, with titles and per-playbook providers) plus a deterministic content hash for drift detection. Generated by the new [`.github/scripts/skills-metadata.mjs`](.github/scripts/skills-metadata.mjs) (`--write` to regenerate); `skills-lint.mjs` imports the checker, so stale or hand-edited metadata fails the existing lint gate — the catalog can't silently drift from the tree.

### `cargo-gtm` → 1.6.0

- **Import recipe.** New [`recipes/import-gtm-data.md`](cargo-gtm/recipes/import-gtm-data.md) — bring GTM data from any external tool into Cargo: CSV-first export, column mapping with a `source_tool_id` idempotency key, batch load, the free QA-script audit on arrival, selective rebuild of recurring logic as plays (stage-action-map + prompt-library reuse), and a 10-row pilot-gated parity check before any rebuilt play goes live. Deliberately tool-agnostic: no per-tool extractors or name mappings.

### `cargo-gtm` → 1.4.0

- **Prompt library.** New [`references/prompt-library/`](cargo-gtm/references/prompt-library/) — ~40 named, parameterized LLM prompts across six sharded files (personalization, lead-scoring, company-research, qualification, signal-analysis, data-extraction) with a grep-first `index.md`. Every entry carries a variables list, model guidance (haiku vs sonnet), and an explicit output contract so downstream nodes can parse. Router §12 instructs: search the index before authoring any prompt from scratch; load only the shard you need.

### `cargo-gtm` → 1.3.0

- **Provider playbooks: 6 → 20.** Fourteen new per-provider deep dives grounded in `connection integration get` output: sourcing/company-data (`linkedin`, `proxycurl`, `apolloio`, `oceanio`, `datagma`), email/contact specialists (`hunter`, `prospeo`, `icypeas`, `findyMail`, `leadMagic`, `contactOut`, `zeroBounce`), research/scraping (`firecrawl`, `serper`). Each carries the action table with credit costs, real config-shape examples, input quirks, cost traps, and its place in the recipe spine.
- **Read-first gate.** Router §11 now opens with a hard stop: no paid action against a covered provider until its playbook is open — one playbook read is cheaper than one failed paid call. Linter gains the matching drift guard: every playbook on disk must be catalogued in `cargo-gtm/SKILL.md`.
- **Fixed:** `recipes/linkedin-url-lookup.md` documented `findProfileUrl` inputs as `firstName`/`lastName`/`companyName`/`companyDomain` — the live schema takes `fullName` (required) + `companyName` only. Caught while grounding the playbooks in `connection integration get`; known-stale rows in `credits-cost-table.md`/`stage-action-map.md` (`prospeo.verifyEmail` no longer exists; `serper.*` now 0.05, not 1) are flagged for the next table regeneration.

### `cargo-gtm` → 1.2.0

- **Executable QA layer.** New [`cargo-gtm/scripts/`](cargo-gtm/scripts/) — four deterministic, fixture-tested TypeScript scripts (Node ≥ 22.18 native type-stripping, zero deps in file mode) that replace in-context row checking: `validate-emails.ts` (free syntax/risk/duplicate cull before paid `verifyEmail`), `select-current-role.ts` (current role from an experiences array; catches job changers), `validate-linkedin-names.ts` (name↔profile match; catches same-name decoys), and `contact-accuracy-audit.ts` (final per-row `SEND/VERIFY/REVIEW/REMOVE` stamp). Each supports `--input` files — CSV, JSON array, or raw `execute-batch` output (`{"results": [...]}` unwraps automatically) — or **API mode** (`--workflow-uuid`, fetching outputs via `@cargo-ai/api` with the CLI's stored login), plus a `--fixtures` self-test; `validate-emails.ts` and `contact-accuracy-audit.ts` also take `--json` to emit rows for `jq` chaining, and duplicates are `recommendation: skip` so they never reach paid verification. The recipes' verify chains build the paid batch from the culled output, merge statuses back onto **all** rows before the audit (never pre-filter to `valid`), and hand only `audit_action == "SEND"` rows downstream. Doctrine in [`references/contact-accuracy.md`](cargo-gtm/references/contact-accuracy.md): *run the script, don't re-derive its logic in-context*. Wired into the router (new §8, spine step 8) and the `prospecting` / `outreach-activation` recipes' verify steps.
- **CI fixture gate.** `skills-lint.yml` gains a `qa-script-fixtures` job (Node 22) running every `cargo-gtm/scripts/*.ts --fixtures` on push/PR — `validate-linkedin-names.ts` enforces precision ≥ 0.95 / recall ≥ 0.85; the others require exact-match on every case.

### Repository-wide

- **ClawHub publish loop caught up.** `clawhub-publish.yml` was missing three shipped skills — `cargo-quickstart`, `cargo-content`, and `cargo-hosting` were lint-covered but never published. All fifteen skills (including the new `cargo-diagnostics`) are now in the publish loop.
- **Stale counts fixed.** `AGENTS.md` still described "ten skills (one outcome + nine capability)"; the router frontmatter said thirteen and its body said 13 while `README.md` said fourteen. All three now use the same framing: fifteen skills = router + onboarding + outcome + twelve capability. `README.md`'s ClawHub prose also said `--owner getcargohq`; the workflow publishes under `cargo-ai`.
- **Interaction conventions.** New shared reference [`cargo/references/interaction.md`](cargo/references/interaction.md): the plan gate (design approval before building a node graph or deploying, complementing the cost gate's spend approval), real choices presented with a recommended default (never pick silently between providers/actions), and presenting defaults (narrate, summarize instead of dumping raw JSON, conclusion first, always surface the `app.getcargo.io` URL). Linked from the router, `cargo-gtm`, `cargo-orchestration`, and the new diagnostics runbooks.
- Note: `cargo` 1.7.0 shipped without a changelog entry (terminal-experience quick wins — quickstart routing, cost discipline, save-as-play, anti-drift); recorded here for the version trail.

- **Claude Code plugin channel.** The repo now doubles as a Claude Code plugin marketplace: [`.claude-plugin/marketplace.json`](.claude-plugin/marketplace.json) + [`.claude-plugin/plugin.json`](.claude-plugin/plugin.json) (repo root as the skills scan root — no restructuring; plugin version mirrors the router's, linter-enforced). Install with `/plugin marketplace add getcargohq/cargo-skills` → `/plugin install cargo@cargo` (Claude Code ≥ v2.1.154). README documents the **pick-one-channel** rule: plugin and `skills add` both register the skills, so use one.
- **Prompt-free safe CLI calls.** New [`hooks/approve-cli.sh`](hooks/approve-cli.sh) — an allow-only `PreToolUse` hook (wired by the plugin) that auto-approves `cargo-ai` / `npx @cargo-ai/cli` calls, including pipelines through read-only helpers, after a quote-aware structural pass that rejects chaining/redirection/substitution/env-assignment. Credentials (`login`/`logout`), token minting (`workspaceManagement token`), report egress (`workspaceManagement report`), `cdk deploy`/`destroy`, and any `remove`/`delete` never auto-approve. Allow-only: it can skip a prompt, never override a deny rule.

- **CLI version pinning.** New [`cargo/cli-version`](cargo/cli-version) — a single-line semver pin, the source of truth for which `@cargo-ai/cli` the skills were written against. It lives *inside* the router skill so it ships with `skills add` and the ClawHub bundle, letting session hooks read it locally (`~/.claude/skills/cargo/cli-version`) with zero extra network calls. Consumers (SessionStart hook, install.sh, the refresh snippets in these docs) install `@cargo-ai/cli@$(cat …cli-version || echo latest)` — the pin is a coherence optimization, never a gate: unreadable pin → `latest`. The CLI release pipeline PRs pin bumps to this repo; merging is the deliberate skills+CLI promotion. Linter now asserts the pin exists and is bare semver, and that every skill's `openclaw` install block stays `@cargo-ai/cli@latest` (frontmatter pinning would cost 14 bumps per CLI release; the session hook converges to the pin right after bootstrap).

- **Codex + Cursor plugin targets.** One plugin source now fans out to three coding agents: new [`.agents/plugins/marketplace.json`](.agents/plugins/marketplace.json) (Codex marketplace) and [`.cursor-plugin/marketplace.json`](.cursor-plugin/marketplace.json), with [`.codex-plugin/plugin.json`](.codex-plugin/plugin.json) / [`.cursor-plugin/plugin.json`](.cursor-plugin/plugin.json) manifests kept in version lockstep with the router (linter-enforced across all three). The approval hook is wired per target — `PreToolUse` (Claude Code) via plugin.json, `PermissionRequest` (Codex) via [`hooks/codex-hooks.json`](hooks/codex-hooks.json), `beforeShellExecution` (Cursor) via [`hooks/cursor-hooks.json`](hooks/cursor-hooks.json) — reusing `approve-cli.sh`'s existing per-agent verdict dispatch.
- **Plugin-bundled session-lifecycle hooks (Claude Code).** New [`hooks/session-start.sh`](hooks/session-start.sh), [`hooks/session-checkpoint.sh`](hooks/session-checkpoint.sh), [`hooks/session-end.sh`](hooks/session-end.sh) wired into the Claude plugin's `SessionStart`/`Stop`/`SessionEnd`, so plugin-channel users get pinned-CLI refresh and session logging without the installer. Each script defers (`exit 0`) when the installer's counterpart exists at `~/.claude/hooks/`, so installer + plugin never double-register a session; the plugin's `session-start` reads the pin from the plugin root and deliberately does **not** run `skills add` (the plugin owns the skills — a parallel `skills add` would duplicate them).

- **Plugin self-update.** The plugin's `session-start.sh` now also refreshes the plugin itself (`claude plugin marketplace update cargo` + `claude plugin update cargo@cargo`, detached so session start is never blocked; takes effect next session) — the plugin channel's equivalent of the installer's `skills add` refresh, with zero duplication by construction. Paired with the installer refactor (`install.sh` now installs the **plugin** on Claude Code instead of scaffolding standalone hooks, migrates legacy scaffolding away, and keeps `skills add` only as the no-plugin fallback), the plugin is the single source of truth for everything agent-facing; README's Claude Code section documents the new flow.
- **Agent-portable docs.** The pinned-install command in `cargo/SKILL.md` (session job 1) and `references/prerequisites.md` no longer hardcodes `~/.claude/skills/…` — the pin is read from the skill directory the agent loaded, whatever the agent (the hardcoded path silently degraded Codex/Cursor to `@latest`). Session-row examples in the manual path are agent-neutral ("Agent session"), job 1 now says to skip `skills add` when the skills came from a plugin, and the permission-prompts note covers all three agents' hook events.

- **Lifecycle scripts are single-sourced (dual-mode).** The three session-lifecycle scripts under `hooks/` are now the ONLY copies — the installer's fallback channel downloads them instead of embedding its own heredocs (which had already begun to drift). Each script auto-detects its channel from its location: a copy at `~/.claude/hooks/` runs in **standalone** mode (refreshes the skills bundle, reads the pin from the `skills add` install, no plugin self-update), any other location runs in **plugin** mode (pin from the plugin root, plugin self-update, no `skills add`); an explicit `plugin|standalone` first argument overrides. The plugin copy still defers when a standalone copy exists, so exactly one lifecycle ever runs. Log lines carry the mode (`session-end(standalone): …`) for diagnosability.

### `cargo` → 1.13.0

- Version bump carrying the dual-mode lifecycle scripts into the plugin bundle (no doc changes).

### `cargo` → 1.12.0

- Session job 1 and `references/prerequisites.md` made agent-portable (bundle-local pin path, neutral session titles, per-agent permission-hook events); the three-jobs callout now names the plugin's bundled hooks as the first automation source.

### `cargo` → 1.11.0

- Installation section now points at the agent-plugin channel (Claude Code, Codex, Cursor) with the pick-one-channel rule.

### `cargo` → 1.10.0

- Session job 1 reordered: `skills add` first, then `npm install -g "@cargo-ai/cli@$(cat ~/.claude/skills/cargo/cli-version …)"` — plus a "why the pin" note and how to move it. `references/prerequisites.md` install section now uses the pinned form.

### `cargo` → 1.9.0

- New "Permission prompts (Claude Code)" section in `references/prerequisites.md`: what auto-approves, the four categories that always prompt and why, and the rule that prompts are not to be dodged.

### `cargo` → 1.8.0

- **Register the `cargo-diagnostics` skill.** Counts bumped to 15 skills / twelve capability, capability-table row, full recap, and a dependency-rule bullet (when a run fails or "succeeds but looks wrong", load diagnostics). Frontmatter description updated to the fifteen-skill framing, now counting the router itself.
- **Interaction conventions registered.** New `references/interaction.md` + a pointer next to the glossary line.

### `cargo-diagnostics` → 1.0.0 (new)

- **New capability skill: after-the-fact forensics** over runs, batches, and credit spend — the interpretation layer on top of `run get`, `orchestration query execute`, and `billing usage get-metrics`. `SKILL.md` routes by symptom (one run vs many runs vs cost) across three runbooks:
  - `references/run-trace.md` — explain one run end-to-end: `executions[]` path, `runContext` as source of truth, branch routing via `nodeChildIndex`, per-node credits/timing, symptom table, and a conclusion-first presentation format.
  - `references/batch-error-sweep.md` — size the problem, find where failures concentrate (per-node spans SQL), distinguish concentrated defects from rate-limit spread and provider coverage, pick exemplar runs for the trace, and decide fix vs re-run vs report.
  - `references/play-optimize-credits.md` — attribute spend workflow → node → provider (SQL + billing metrics, billing wins on disagreement), quantify credits wasted on errored runs, then apply levers cheapest-first (filter earlier, provider swap, model/`maxSteps`, stop-early, waterfall reshape, phone off by default), proving savings through the pilot gate.
- Runbooks link the existing surfaces (`cargo-orchestration` queries/troubleshooting, `cargo-billing` cost levers, `cargo-gtm` cost discipline/credits table/alternatives/waterfall strategy) instead of duplicating them.
- CI wired: added to `skills-lint.mjs` `SKILL_DIRS` and the `clawhub-publish.yml` publish loop; routed from the `cargo` router (linter-enforced).

### `cargo-gtm` → 1.1.1

- Hand-off pointer to `cargo-diagnostics` when a run/batch misbehaves (sweep before re-running anything paid), and a pointer to the new shared interaction conventions.

### `cargo-orchestration` → 1.5.1

- References callout pointing at `cargo-diagnostics` for the ordered forensic runbooks built on `run get` / orchestration SQL.

### `cargo-billing` → 1.0.2

- Cost-levers table now points at the diagnostics attribution runbook (`play-optimize-credits.md`) for finding which node/provider dominates spend before picking a lever.

- **Session lifecycle moved to the installer.** The Claude Code `SessionStart`/`SessionEnd` hooks that keep `@cargo-ai/cli` + the skills bundle current and log each session to `workspace_management.sessions` are now scaffolded by the Cargo bootstrap installer (`curl -fsSL https://api.getcargo.io/install.sh | sh`, interactive prompt, opt out with `CARGO_INSTALL_HOOKS=0`). Removed the hand-rolled hook-scaffolding recipes from `cargo/SKILL.md`, `README.md`, and `cargo-workspace-management/references/examples/sessions.md`; those docs now point at the installer. The agent's three-session-jobs guidance stays as the manual fallback, and reporting (job 2) is unchanged — it can't be automated.
- **Per-turn session checkpoint hook.** Documented the new `Stop` hook the installer scaffolds alongside `SessionStart`/`SessionEnd`: it checkpoints the session row at the end of each assistant turn (latest user request + timestamp, derived with `jq`, **no** LLM call, no `--finished`, throttled via `CARGO_CHECKPOINT_INTERVAL`, default 45s), so a session that never reaches `SessionEnd` no longer stays stuck on `"Session in progress."`. The `SessionEnd` hook now also resolves the `claude` binary from Node/version-manager bin dirs and logs to `$CARGO_SESSION_LOG` (default `~/.claude/cargo-session.log`) so a placeholder summary is diagnosable. Updated `cargo/SKILL.md`, `README.md`, `cargo-workspace-management/SKILL.md`, and `sessions.md`; also corrected the opt-out env var to `CARGO_INSTALL_HOOKS=0` (was mis-documented as `CARGO_INSTALL_NO_HOOKS=1`).
- **Shared prerequisites reference.** Extracted the duplicated install / login / output-conventions block from every capability skill into [`cargo/references/prerequisites.md`](cargo/references/prerequisites.md). Each capability skill now links to it instead of redefining ~16 lines of boilerplate. No behavior change for agents — the canonical setup is the same — but a single place to keep it correct.
- **CHANGELOG.** This file. Per-skill version bumps are now recorded here so consumers can see what changed between two pinned versions.
- **CI skill-lint.** Added [`.github/workflows/skills-lint.yml`](.github/workflows/skills-lint.yml) and [`.github/scripts/skills-lint.mjs`](.github/scripts/skills-lint.mjs). Runs on every push and PR; validates SKILL.md frontmatter shape, JSON snippets inside fenced code blocks, internal markdown links, and that bash examples reference real `cargo-ai` domains. Catches drift before it reaches users.
- **Skill-lint domain list refreshed.** Added the CLI domains that shipped since the lint was written — `content`, `expression`, `hosting`, `revenue-organization`, `system-of-record`, `user-management`, plus `init`/`version` — so valid examples no longer warn.
- **New capability skill: `cargo-content`.** The `content` CLI domain (files + libraries) is now its own skill rather than living inside `cargo-ai`, matching the repo's one-skill-per-CLI-domain convention. File/library command docs, the `examples/files.md` walkthrough, response shapes, and troubleshooting moved into `cargo-content/`; `cargo-ai` keeps the attach-to-agent wiring and cross-links to `cargo-content`.
- **New capability skill: `cargo-hosting`.** The `hosting` CLI domain (apps, workers, deployments) graduates from the router's "CLI domains without a dedicated skill yet" table into its own capability skill. `SKILL.md` documents the `init → create → deploy → promote` lifecycle for Vite SPA apps (served on `*.cargo.app`) and edge workers, with `examples/{apps,workers,deployments}.md`, `response-shapes.md`, and `troubleshooting.md`. The router (`cargo`) and `README.md` register it: skill counts bumped (router 10→11 skills, README 11→12), capability-table row + recap added, and `hosting` removed from the no-skill-yet table.
- **New capability skill: `cargo-cdk` (declarative).** The `cdk` CLI domain — the Cargo CDK (`@cargo-ai/cdk`), a code-first IaC framework — gets its own skill, authored outcome-style with a Level 2/2.5/3 hierarchy because it spans every resource type. `SKILL.md` sets the declarative-vs-imperative decision model and the `init → types → plan → deploy → destroy` lifecycle; `guides/{authoring-resources,deploy-and-state,typed-config}.md` (L2), `recipes/{scaffold-a-workspace,add-connector-and-model,build-an-agent,migrate-existing-workspace,deploy-from-ci}.md` (L2.5), and `references/{resources,commands,troubleshooting}.md` + `references/examples/full-workspace.md`. The router (`cargo`) and `README.md` register it: skill counts bumped (router 11→12 skills, README 12→13), a "Declarative (CDK) vs imperative (CLI)" decision block + capability-table row + recap + a cross-cutting box in the dependency diagram. CI wired: `cargo-cdk` added to `skills-lint.mjs` `SKILL_DIRS` and the `clawhub-publish.yml` publish loop, and `cdk` added to the lint's `KNOWN_CLI_DOMAINS`.

### `cargo-hosting` → 1.0.0

- Initial release. Covers `hosting app`, `hosting worker`, and `hosting deployment` (CLI 1.0.22): scaffolding from templates, creating app/worker slots, building+uploading deployments, and promoting to the live URL.
- `references/response-shapes.md` pins the real `App` / `Worker` / `Deployment` shapes (incl. the `kind` app/worker discriminant, `promotedDeployment`, and `chargedUntil`) and the deployment `status` enum (`pending`/`building`/`success`/`error`/`cancelled`, terminal at the last three) from the backend types — no more "capture live" hedging. Polling and build-failure docs now reference the real `status`, `errorMessage`, and `buildLogS3Filename` fields, and a critical rule notes hosting bills credits monthly per resource.

### `cargo` → 1.6.0

- **Register the `cargo-cdk` skill.** Bumped the skill count to 12 (one outcome + eleven capability), added a "Declarative (CDK) vs imperative (CLI)" decision block under "Skills at a glance", the `cargo-cdk` capability-table row, a full recap, a cross-cutting box + dependency-rule bullet in "How the skills relate", and updated the frontmatter description count. `cargo-cdk` is framed as the one declarative capability skill (defines the whole workspace as code) vs the ten imperative ones.

### `cargo-cdk` → 1.0.0 (new)

- **New skill for the `cdk` CLI domain — the Cargo CDK, declarative workspace-as-code.** `SKILL.md` (L1) sets the decision model (declarative CDK vs imperative capability skills), the `init → types → plan → deploy → destroy` lifecycle, critical rules (commit `cargo.state.json`; wire by handle not `.uuid`; `secret()` at deploy time; `--yes` in CI; run `cdk types` after integration changes), and the routing/recipes tables.
- **Guides (L2):** `authoring-resources.md` (the `define*` builder catalog, the handle/ref model, secrets, and `defineWorkflow` bodies), `deploy-and-state.md` (plan/deploy/destroy, `cargo.state.json`, prune, drift via `refresh`/`--refresh`, `import`, `rollback`, async worker/app builds), `typed-config.md` (`cargo-ai cdk types` codegen + tsconfig wiring).
- **Recipes (L2.5):** scaffold a workspace, add a connector + model, build an agent, migrate an existing workspace via `import`, deploy from CI.
- **References:** `resources.md` (every builder → spec fields → refs → outputs), `commands.md` (every `cargo-ai cdk` subcommand + flags), `troubleshooting.md` (Invalid configuration / secret envelope, unresolved `${NAME}`, workspace guard, wrong-dir `.cargo-ai`, workflow-body parse errors, orphaned plays/agents), and `examples/full-workspace.md` (the `full` template end-to-end).

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
