---
name: cargo-cdk
description: "Define an entire Cargo workspace in code — connectors, models, plays, tools, agents, MCP servers, context, capacities, territories, segments, folders, files, workers, apps — and deploy it declaratively with `cargo-ai cdk` (init → types → plan → deploy), the way you'd manage cloud infra with Pulumi or the AWS CDK. Use when the user wants to manage Cargo resources as code: reproducibly, version-controlled, in git, from a template, or across environments. Routes to authoring/deploy/typing guides (Level 2), recipes (Level 2.5), and references. For one-off imperative operations (create one connector, read a model, run a workflow), use the matching capability skill instead."
version: "1.0.0"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo CDK — declarative workspace-as-code

Use this skill to define a Cargo workspace in TypeScript (`define*` builders from
`@cargo-ai/cdk`) and reconcile it to live infrastructure with `cargo-ai cdk deploy`.
It is the **declarative** counterpart to the imperative capability skills: instead
of running one CLI command per resource, you write the whole graph once and deploy
it repeatably, with a committed `cargo.state.json` linking your code to what Cargo
created.

## 1) What this skill governs

- **Authoring** every Cargo resource with a `define*` builder that returns a
  **handle**; wiring resources by passing handles to each other (the dependency
  graph is your variable graph).
- **Deploying** the graph: `plan` (offline diff) → `deploy` (create/update, write
  state) → `destroy` (tear down). Plus drift (`refresh`), adoption (`import`), and
  recovery (`rollback`).
- **Typing** the config against your workspace's real integration schemas
  (`cargo-ai cdk types`).

The CDK spans **every** resource kind — so it overlaps every imperative capability
skill (`cargo-connection`, `cargo-storage`, `cargo-ai`, `cargo-orchestration`,
`cargo-content`, `cargo-hosting`, …). Which to reach for is the first decision:

## 2) CDK or the CLI? — the routing decision

> **Declarative (this skill) vs imperative (a capability skill).**

Use the **CDK** when the user is **managing resources as an artifact**:

- "Set up / stand up / bootstrap a whole workspace (as code / from a template)."
- "Make this reproducible / version-controlled / in git / repeatable across
  environments (dev → prod)."
- "Deploy these connectors + models + agents together" (a multi-resource graph
  wired by dependency).
- Anything that should be re-runnable and diffable, where losing the definition
  would be a problem.

Use the matching **capability skill** (imperative `cargo-ai <domain>`) when the
user is doing a **one-off operation** or **exploring**:

- "Create one connector", "add a column to this model", "list connectors",
  "run this workflow", "query storage", "read this agent's memory."
- Any read, ad-hoc query, or single mutation that doesn't need to live in code.

When unsure, ask whether the result should be committed and re-deployable. If yes
→ CDK. If it's a quick action or a read → the capability skill (see the
[`cargo` router](../cargo/SKILL.md) to pick the right domain).

## 3) The lifecycle

```
cargo-ai cdk init <dir>     scaffold a project from a template (blank | full)
        │
cargo-ai cdk types          generate per-workspace types for typed config (optional)
        │
   (author define* files)   importing a .ts file IS registration — no manifest
        │
cargo-ai cdk plan           offline: compile the graph, diff against cargo.state.json
        │
cargo-ai cdk deploy         create/update resources in dependency order, write state
        │
cargo-ai cdk destroy        tear down resources recorded in state
```

Side branches: `cargo-ai cdk refresh` (read-only drift report) · `deploy --refresh`
(re-apply code over out-of-band edits) · `deploy --prune` (delete resources removed
from code) · `cargo-ai cdk import <id> <uuid>` (bind an existing live resource into
state) · `cargo-ai cdk rollback` (restore the pre-deploy state snapshot).

## 4) Documentation hierarchy

- **Level 1** — `SKILL.md` (this file): the decision model, lifecycle, critical
  rules, and routing.
- **Level 2** — Guides:
  [`guides/authoring-resources.md`](guides/authoring-resources.md),
  [`guides/deploy-and-state.md`](guides/deploy-and-state.md),
  [`guides/typed-config.md`](guides/typed-config.md).
- **Level 2.5** — Recipes: [`recipes/*.md`](recipes/) — step-by-step playbooks to
  follow as your execution plan.
- **References** — [`references/resources.md`](references/resources.md) (the full
  builder catalog), [`references/commands.md`](references/commands.md) (every
  `cargo-ai cdk` subcommand + flags),
  [`references/troubleshooting.md`](references/troubleshooting.md), and
  [`references/examples/full-workspace.md`](references/examples/full-workspace.md).

## 5) Read behavior — match the task to a doc and READ IT

| When the task involves… | Read this first | What it gives you |
|---|---|---|
| Writing `define*` files, wiring resources, `secret()`/`env()`, `defineWorkflow` bodies (tool/play logic) | [`guides/authoring-resources.md`](guides/authoring-resources.md) | The builder catalog, the handle/ref model, secrets, and how workflow bodies compile. |
| `plan` / `deploy` / `destroy`, the state file, drift, adopting existing resources, CI | [`guides/deploy-and-state.md`](guides/deploy-and-state.md) | The deploy lifecycle, `cargo.state.json` semantics, drift/import/rollback, async builds. |
| Typed config, `cargo-ai cdk types`, tsconfig wiring, `integrations.*` in workflow bodies | [`guides/typed-config.md`](guides/typed-config.md) | What `cdk types` generates and how to wire it into your project. |
| A field/spec/output for a specific builder | [`references/resources.md`](references/resources.md) | Every builder → spec fields → which ref each takes → outputs. |
| Exact command flags | [`references/commands.md`](references/commands.md) | Every `cargo-ai cdk` subcommand and its flags. |
| A deploy error / footgun | [`references/troubleshooting.md`](references/troubleshooting.md) | The known failure modes and fixes. |

### Recipes — follow step-by-step when one matches

| Recipe | Use when… |
|---|---|
| [`recipes/scaffold-a-workspace.md`](recipes/scaffold-a-workspace.md) | Standing up a new workspace from scratch (`init --template full` → types → plan → deploy). |
| [`recipes/add-connector-and-model.md`](recipes/add-connector-and-model.md) | Adding a data source + a model sourced from it, wired by handle. |
| [`recipes/build-an-agent.md`](recipes/build-an-agent.md) | Composing a model + tool + agent (with `uses` / `models` / `tools`) and deploying. |
| [`recipes/migrate-existing-workspace.md`](recipes/migrate-existing-workspace.md) | Bringing an already-live workspace under CDK management via `cdk import`. |
| [`recipes/deploy-from-ci.md`](recipes/deploy-from-ci.md) | Deploying non-interactively from CI (token auth + committed state). |

## 6) Critical rules

- **Commit `cargo.state.json`.** It is the link from your code to the resources
  Cargo created — and the **only** handle on a deployed **play** or **agent**
  (they have no slug). Lose it and those resources orphan; recover a link with
  `cargo-ai cdk import`. It records only `{hash, uuid, outputs}` — never secret
  values. Git-ignore the working files (`cdk init` scaffolds this):
  ```gitignore
  .cargo-ai/
  cargo.state.lock
  cargo.state.bak.json
  cargo.state.audit.jsonl
  ```
- **Secrets:** wire credentials with `secret("ENV_VAR")` (often
  `secret("HUBSPOT_API_KEY")`). The value is read from the environment **at deploy
  time**, kept out of the content hash and out of state, so rotating a token
  doesn't read as drift. Export the env var before deploying — a missing one fails
  the deploy with an unresolved `${ENV_VAR}` placeholder.
- **Wire by handle, never by `.uuid`.** Pass a `define*` handle directly
  (`dataset: hubspot`, `tools: [enrich]`), or `xxRef("uuid")` for a resource you
  didn't define in code (`connectorRef`, `modelRef`, `folderRef`, `toolRef`,
  `agentRef`, …). Where a reference needs per-call options, wrap it as
  `{ ref, …options }` (e.g. `models: [{ ref: contacts, readOnly: true }]`).
- **Run `cargo-ai cdk types` after workspace integrations change** — it
  regenerates `.cargo-ai/` so `defineConnector`/`defineModel` config (and
  `integrations.*` in workflow bodies) type-check against the real schemas. Typing
  is a bonus, never a gate: deploy works without it.
- **Run `cdk` commands from the project root.** `npx`/`cargo-ai` resolve from the
  nearest `package.json`; run elsewhere and `.cargo-ai/` and `cargo.state.json`
  land in the wrong directory. Use `--dir <path>` to be explicit.
- **`--yes` in CI.** `deploy` and `destroy` prompt for confirmation; non-interactive
  runs must pass `--yes`.
- **Route CDK-managed resources into a clearly-labelled folder.** Set `folder:` on
  each builder so everything CDK owns lands in a dedicated folder whose name signals
  "owned by code — don't hand-edit" to anyone in the UI (manual UI edits read back as
  drift on the next `plan`). Folders are per-kind, so give each kind its own but share
  one short, recognizable prefix — recommended: **`🔒 CDK`** (e.g. `🔒 CDK Models`,
  `🔒 CDK Agents`). Keep names short (long labels truncate in the folder tree); the
  lock emoji is the "don't touch" cue. See
  [`guides/authoring-resources.md`](guides/authoring-resources.md).

## Prerequisites

Standard Cargo CLI setup (install, login, output conventions) is shared across all
skills — see [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md).

Two CDK-specific extras:

- **The project needs `@cargo-ai/cdk` as a dependency** (for the `define*`
  builders you import). `cargo-ai cdk init` scaffolds a `package.json` with it —
  then run `npm install`.
- **The `cargo-ai cdk` domain ships with the CLI.** Confirm with
  `cargo-ai cdk --help`; an `unknown command` means the CLI is too old —
  `npm install -g @cargo-ai/cli@latest`.

## Help

- `cargo-ai cdk --help` and `cargo-ai cdk <subcommand> --help` for the live flag
  surface.
- When a documented command/flag/response doesn't match what you observe, file a
  report: `cargo-ai workspaceManagement report create` (see
  [`../cargo-workspace-management/SKILL.md`](../cargo-workspace-management/SKILL.md)).
