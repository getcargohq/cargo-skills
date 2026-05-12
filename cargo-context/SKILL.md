---
name: cargo-context
description: Inspect and edit the workspace's git-backed context repository (the GTM knowledge base of markdown/MDX files) and its runtime sandbox using the Cargo CLI. Use when the user wants to browse/read/write/edit context files, run a command in the sandbox, or inspect the context knowledge graph.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Context

The **context** is a git-backed repository of typed markdown/MDX files that captures a workspace's GTM knowledge (company narrative, ICPs, personas, plays, proof, objections, etc.) and is read/written by both humans and agents. The `cargo-ai context` domain has two subdomains you'll use:

- **runtime** — browse, read, write, edit, and execute against the workspace's runtime sandbox (a checked-out copy of the context repo). `write`/`edit` are pushed to the default branch; `execute` runs are **not** pushed.
- **graph** — build/load the knowledge graph derived from every markdown/MDX file in the context repo.

> The canonical example of a context repository is [`getcargohq/cargo-workspaces`](https://github.com/getcargohq/cargo-workspaces). Read its `README.md` to understand the domain layout and file conventions before writing new entries.
> For uploading runtime-independent files (CSVs, PDFs) used in batch runs, use [`cargo-workspace-management`](../cargo-workspace-management/SKILL.md) (`cargo-ai workspaceManagement file upload`) instead.
> For RAG file attachments to agents, use [`cargo-ai`](../cargo-ai/SKILL.md) (`cargo-ai ai file upload`).

> See `references/conventions.md` for the full context repo structure and per-domain templates.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/authoring.md` for end-to-end add / edit / delete recipes.
> See `references/examples/bootstrap-and-update.md` for the bootstrap-from-public-sources + refresh-from-calls playbook.
> See `references/examples/graph-queries.md` for inspecting the knowledge graph.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --oauth                                  # browser sign-in (recommended)
# or: cargo-ai login --token <your-api-token>           # workspace-scoped API token (non-interactive)
# Pin a default workspace at login (with --oauth)
cargo-ai login --oauth --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

## Discover the context first

Before editing anything, see what's in the context repo:

```bash
cargo-ai context runtime browse                 # list entries at the runtime sandbox root
cargo-ai context graph get                      # full knowledge graph derived from the repo's md/mdx files
```

## Quick reference

```bash
# Runtime sandbox (checked-out copy of the context repo)
cargo-ai context runtime browse [--path <path>]
cargo-ai context runtime read --path <path> [--start-line <n>] [--end-line <n>]
cargo-ai context runtime write --path <path> --content <content> [--commit-message <message>]
cargo-ai context runtime edit --path <path> --old-string <old> --new-string <new> [--commit-message <message>]
cargo-ai context runtime execute --command <command> [--args <json>]

# Knowledge graph
cargo-ai context graph get
```

## Runtime sandbox

The **runtime sandbox** is a checked-out, executable copy of the context repository. It's the surface you use to read and modify context files, and to run commands against them.

Two important behaviors to remember:

- **`write` and `edit` push to the default branch** of the context repo. They are not local-only.
- **`execute` does *not* push.** Changes made to files by a shell command run via `execute` stay in the sandbox and are discarded — use `execute` for builds, tests, or inspection, not for committing edits.

Because writes push immediately, **confirm the target workspace before the first `write`/`edit`**:

```bash
cargo-ai whoami   # → workspace.uuid, workspace.name
```

Read the workspace name back to the user. If the session is for a specific client, make sure `workspace.name` matches before authoring anything — there is no dry-run mode. If `workspace.name` is generic or ambiguous (e.g. "Main", "Test", a person's name, an internal codename), don't guess — ask the user for the company name and canonical domain (`example.com`) and confirm both before the first write. If you logged in without pinning a workspace, re-run `cargo-ai login --oauth --workspace-uuid <uuid>` (or `--token <workspace-scoped-token>` for non-interactive use).

Edits derived from sales-call analysis should be applied **one at a time with human review**, not batched. Looping an agent over many calls tends to overweight the loudest signal and miss nuance — see `references/examples/bootstrap-and-update.md` for the call-refresh playbook.

### Browse and read

```bash
# List entries at the root of the runtime sandbox
cargo-ai context runtime browse

# List entries under a subpath (e.g. a domain folder like persona/ or play/)
cargo-ai context runtime browse --path persona

# Read a full file
cargo-ai context runtime read --path persona/vp-sales-mid-market.md

# Read only a line range (1-indexed, inclusive on both ends)
cargo-ai context runtime read --path play/inbound-trial-to-paid.md --start-line 1 --end-line 40
```

### Write a new file

`write` creates (or overwrites) a file and pushes a commit to the default branch.

```bash
cargo-ai context runtime write \
  --path persona/vp-sales-mid-market.md \
  --content "$(cat <<'EOF'
---
title: VP of Sales, mid-market
description: Owns pipeline, quota, and rep productivity at a 200–2,000-person company.
---

## Role
- Title: VP of Sales
- Seniority: Executive
- Function: Revenue
- Reports to: CRO or CEO

## KPIs
- New ARR, win rate, pipeline coverage, rep ramp time

## Pains
- Pipeline gaps, slow ramp, low rep activity, forecasting drift

## Motivations
- Hit the number, build a repeatable motion, get visibility

## Day-to-day
Forecast calls, deal reviews, pipeline reviews, 1:1s with frontline managers.

## Preferred channels
- medium/linkedin-outbound
- medium/exec-warm-intro

## Common objections
- objection/we-already-have-an-ai-sdr

## How we land
Lead with pipeline-coverage math, not features.
EOF
)" \
  --commit-message "Add VP of Sales mid-market persona"
```

### Edit an existing file

`edit` replaces a single exact substring. `--old-string` must occur **exactly once** in the file; pass an empty `--new-string` to delete the match.

```bash
# Replace one specific sentence
cargo-ai context runtime edit \
  --path global/positioning.md \
  --old-string "We help RevOps automate workflows." \
  --new-string "We help RevOps run AI-native GTM motions." \
  --commit-message "Refresh positioning one-liner"

# Delete a line (pass empty --new-string)
cargo-ai context runtime edit \
  --path persona/vp-sales-mid-market.md \
  --old-string "\n- Outdated stat: 4.2x pipeline\n" \
  --new-string ""
```

For larger restructures, prefer `write` (full-file overwrite) over many sequential `edit` calls.

### Execute a command in the sandbox

`execute` runs a shell command in the sandbox. Useful for inspecting structure or running checks; **changes are not pushed**.

```bash
# Find every file that cross-references a specific slug
cargo-ai context runtime execute \
  --command grep \
  --args '["-r","-l","persona/vp-sales-mid-market","."]'

# Count entries per domain
cargo-ai context runtime execute --command ls --args '["-1","persona"]'

# Run a one-shot script (no quotes/escaping needed inside --command beyond JSON for args)
cargo-ai context runtime execute --command pwd
```

`--args` is a JSON array of string arguments. Omit it for a no-arg command.

## Context repository structure and conventions

The Cargo context repo is a typed knowledge base. The canonical example — and the source of the conventions below — is [`getcargohq/cargo-workspaces`](https://github.com/getcargohq/cargo-workspaces); read its `README.md` and `_template.md` files in each domain before writing new entries. For the full domain reference, see `references/conventions.md`.

### Domains

| Domain | Purpose |
|---|---|
| `global/` | Company-level context: mission, voice, positioning, narrative, pricing |
| `icp/` | Ideal Customer Profile segments |
| `persona/` | Buyer personas (roles inside an ICP) |
| `jtbd/` | Jobs-to-be-done framings |
| `alternative/` | Competitors, substitutes, status quo |
| `client/` | Customer profiles, case studies, reference accounts |
| `insight/` | Market insights and observations |
| `medium/` | Channel playbooks (email, LinkedIn, cold call, etc.) |
| `objection/` | Objections + responses + proof |
| `play/` | GTM plays (signal → audience → channel → sequence → outcome) |
| `proof/` | Atomic proof points (metrics, quotes, case data) |
| `signal/` | Buying signals and intent triggers |

### File conventions

- **Filename:** `kebab-case.md` (e.g. `vp-sales-mid-market.md`).
- **Frontmatter:** YAML with `title` and `description`, both required on every file.
- **Cross-references:** use the `domain/slug` form, **no `.md` extension** (e.g. `persona/vp-sales-mid-market`).
- **Templates:** each domain ships an `_template.md`. Read it (`cargo-ai context runtime read --path persona/_template.md`) before authoring a new entry.

### Workflow: add a new entry

1. Confirm the target domain and copy its template:
   ```bash
   cargo-ai context runtime read --path persona/_template.md
   ```
2. `write` a new file at `<domain>/<slug>.md` with `title` + `description` and the body sections filled in.
3. Add cross-refs (`domain/slug`) where useful — keep them bidirectional when it makes sense.
4. Rebuild the knowledge graph to verify the new entry and its links:
   ```bash
   cargo-ai context graph get
   ```

For full per-domain templates and worked examples, see `references/conventions.md` and `references/examples/authoring.md`.

### Workflow: bootstrap and refresh

To stand up a new workspace's context repo from scratch, or to refresh an existing one on a cadence, follow the two-phase playbook in `references/examples/bootstrap-and-update.md`:

1. **Bootstrap (one-time):** scrape public sources in parallel → seed `global/`, `persona/`, `client/`, `proof/`, `objection/`, `signal/` from those digests → open a fresh agent session against the seeded repo.
2. **Refresh (every 2–4 weeks):** pull the last ~3 months of sales-call transcripts → analyze one at a time, human-in-the-loop → apply a repetition threshold before promoting any claim to context → validate by generating sequence permutations → diff the graph before/after and retire stale entries.

The repetition threshold (how many calls a claim must appear in before it lands in context) is documented in `references/conventions.md`.

## Knowledge graph

`context graph get` builds (or loads from cache) the knowledge graph over every markdown/MDX file in the context repo. Use it to:

- Audit cross-references between domains (e.g. find personas that link to plays with no proof attached).
- Discover what already exists before writing a new entry (avoid duplicates).
- Power downstream agents that need the typed structure of the workspace's context.

```bash
cargo-ai context graph get
```

The response includes the parsed frontmatter and outbound `domain/slug` references for each node — pipe it through `jq` to slice it. See `references/examples/graph-queries.md` for ready-to-run queries.

## Help

Every command supports `--help`:

```bash
cargo-ai context --help
cargo-ai context runtime browse --help
cargo-ai context runtime read --help
cargo-ai context runtime write --help
cargo-ai context runtime edit --help
cargo-ai context runtime execute --help
cargo-ai context graph get --help
```
