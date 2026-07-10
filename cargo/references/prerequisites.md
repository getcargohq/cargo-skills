# Cargo CLI — prerequisites

The same install, login, and runtime conventions apply to every Cargo skill in this bundle. Each capability skill links here instead of duplicating the boilerplate. Load the [`cargo` router skill](../SKILL.md) first if you haven't already — it covers session refresh and skill routing.

## Install

```bash
npm install -g "@cargo-ai/cli@$(cat <path-to-the-cargo-skill-dir>/cli-version 2>/dev/null || echo latest)"
```

The skills bundle pins the CLI version it was written against in `cli-version`, which sits inside the `cargo` router skill directory — read it from wherever this bundle is installed (on Claude Code with `skills add`: `~/.claude/skills/cargo/`; plugin installs converge to the pin automatically via their SessionStart hook). Installing the pinned version avoids docs/CLI drift; `latest` is the fallback when the pin isn't readable. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

## Authenticate

```bash
cargo-ai login --oauth                                  # browser sign-in (recommended)
# or: cargo-ai login --token <your-api-token>           # workspace-scoped API token (non-interactive)
# Pin a default workspace at login (with --oauth)
cargo-ai login --oauth --workspace-uuid <uuid>
```

`--oauth` runs the OAuth 2.0 Device Authorization Flow — no client setup. For CI / scripts, use `--token` with a workspace-scoped API token from **Settings > API**. Token values are shown only once; store immediately in a secrets manager.

## Verify

```bash
cargo-ai whoami
# → { "user": { "uuid": ..., "email": ... }, "workspace": { "uuid": ..., "name": ... } }
```

Always confirm `workspace.name` before any write — there is no dry-run mode for destructive commands. If the active workspace is wrong, re-run `cargo-ai login --oauth --workspace-uuid <uuid>` (or `--token <workspace-scoped-token>` for non-interactive use).

## Output conventions

- All commands output **JSON to stdout**.
- Successful commands exit `0`.
- Failed commands exit non-zero and return `{"errorMessage": "..."}` — read this field for the cause.
- Async commands (`run create`, `batch create`, `message create`, `action execute`, `action execute-batch`) return a UUID and a status that starts as `pending` / `running`. Pass `--wait-until-finished` to block, or poll the matching `get` command. See [`cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) for intervals and retry guidance.

## Permission prompts

When the Cargo plugin (or the installer's hook scaffolding) is present, an approval hook — wired per agent as `PreToolUse` (Claude Code), `PermissionRequest` (Codex), or `beforeShellExecution` (Cursor) — auto-approves ordinary `cargo-ai` calls — reads, queries, run/batch operations, and pipelines through read-only helpers (`jq`, `grep`, `head`, …) — so they don't prompt. Four categories always still prompt, deliberately: credentials (`login`/`logout`), token minting (`workspaceManagement token …`), report egress (`workspaceManagement report …` — reports can carry session traces, so consent stays explicit), and destruction/deploys (`cdk deploy`/`destroy`, any `remove`/`delete`). The hook is allow-only: it can skip a prompt but never override a deny rule. Don't restructure commands to dodge a prompt — if one of these prompts appears, it's supposed to.

## Admin-only commands

Some domains require a token with **admin access** on the workspace:

- All of `cargo-billing` (usage metrics, subscription, invoices).
- Most of `cargo-workspace-management` (users, roles, tokens — folder and report writes work with non-admin tokens).

If a command returns `{"errorMessage":"forbidden"}` or `unauthorized`, the token likely lacks admin scope. Re-issue with an admin user, or ask a workspace admin to run the command.

## When the CLI fails

Whenever a CLI command misbehaves, a documented flag is missing, or you've retried the same command twice without progress, file a workspace management report:

```bash
cargo-ai workspaceManagement report create \
  --title "<one-line summary>" \
  --description "<command(s) tried, errorMessage, expected vs actual, relevant UUIDs>"
```

This is the official feedback channel — every report is reviewed by the Cargo team. See [`cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md) (Reports section) for the full template.
