---
name: cargo-workspace-management
description: Manage workspace users, API tokens, folders, roles, and submit reports to workspace management using the Cargo CLI. Use when the user wants to invite or manage workspace members, create or rotate API tokens, organize resources into folders, inspect workspace roles and permissions, or submit a report to workspace management when the CLI fails or is misused.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Workspace

Workspace administration: managing users, API tokens, folders, roles, workspace-level files, and submitting reports to workspace management.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/users.md` for user invite and management examples.
> See `references/examples/tokens.md` for API token creation and rotation examples.
> See `references/examples/folders.md` for organizing resources into folders.
> See `references/examples/reports.md` for examples of submitting workspace management reports.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

**Note:** Most workspace management commands require a token with admin access.

## Discover resources first

```bash
cargo-ai whoami                        # current user and active workspace
cargo-ai workspace user list           # all workspace members
cargo-ai workspace role list           # available roles
cargo-ai workspace token list          # all API tokens
cargo-ai workspace folder list         # all folders
```

## Quick reference

```bash
cargo-ai whoami
cargo-ai workspace user list
cargo-ai workspace user create --user-email <email> --role-slug <slug>
cargo-ai workspace token list
cargo-ai workspace token create --name <name>
cargo-ai workspace token remove <token-uuid>
cargo-ai workspace folder list
cargo-ai workspace folder create --name <name> --emoji-slug <slug> --kind <kind>
cargo-ai workspace report create --title <title> --description <description>
```

## Current user and workspace

```bash
# Get your current user and workspace context
cargo-ai whoami
# → Returns your user UUID, email, and active workspace UUID
```

## Users

```bash
# List all workspace members
cargo-ai workspace user list

# Invite a new user (requires their email and a role)
cargo-ai workspace user create \
  --user-email user@example.com \
  --role-slug <role-slug>

# Update a user's role
cargo-ai workspace user update --user-uuid <uuid> --role-slug <new-role-slug>

# Remove a user from the workspace
cargo-ai workspace user remove --user-uuid <uuid>
```

## Roles

Roles define what users can do in the workspace.

```bash
# List available roles
cargo-ai workspace role list
```

Always check available roles before inviting users — use the `slug` from `role list` when creating or updating users.

## API tokens

Each token has a human-readable `name` and a `permissions` field. Tokens created via the CLI are issued with full workspace access (`permissions: null`); fine-grained permission scoping is configured via the API or the Cargo app.

```bash
# List all API tokens (includes name and permissions of each token)
cargo-ai workspace token list

# Create a new token — --name is required
cargo-ai workspace token create --name "CI/CD pipeline"
# → Returns the token value — store it securely, it won't be shown again

# Remove a token
cargo-ai workspace token remove <token-uuid>
```

**Naming:** Pick a `--name` that makes the token's purpose obvious in `token list` later (e.g. `"GitHub Actions — production"`, `"Local dev — alice"`, `"Zapier integration"`). The name is the only way to tell tokens apart in the listing.

**Security:** Token values are only shown once at creation. Store them in a secrets manager (e.g. GitHub Secrets, AWS Secrets Manager).

## Folders

Folders organize resources (plays, tools, agents) in the Cargo app.

```bash
# List all folders
cargo-ai workspace folder list

# Create a folder (kind: "tool", "play", "agent", or "file")
cargo-ai workspace folder create --name "Q1 Campaigns" --emoji-slug "rocket" --kind "play"

# Get a folder
cargo-ai workspace folder get <folder-uuid>

# Update a folder
cargo-ai workspace folder update --uuid <folder-uuid> --name "Q1 2025 Campaigns"

# Remove a folder
cargo-ai workspace folder remove <folder-uuid>
```

## Reports

Submit a report to workspace management. **Use this whenever the CLI is failing, behaving unexpectedly, lacks a capability you need, or whenever you (user or agent) are struggling to accomplish a task with the CLI.** This is the official feedback channel — every report is reviewed by the Cargo team and used to improve the CLI, its skills, and the underlying APIs.

```bash
# Submit a report to workspace management
cargo-ai workspace report create \
  --title "<short summary>" \
  --description "<detailed description, including the command(s) tried and the error(s) seen>"
```

**When to send a report (non-exhaustive):**

- A command exits non-zero with an `errorMessage` you cannot resolve from `--help` or `references/troubleshooting.md`.
- The CLI is being misused or the syntax is unclear (e.g. you can't figure out which flag to pass, or the JSON schema for `--filter` / `--nodes` / `--action` is ambiguous).
- A user or AI agent is repeatedly retrying the same command without progress (≥ 2 failed attempts on the same task).
- A documented command does not behave as the skill describes, or a response shape differs from what `references/response-shapes.md` documents.
- A capability appears to be missing entirely (no command exists for what you need to do).
- An async operation never reaches a terminal status, or returns inconsistent results across runs.

**What to put in the report:**

- `--title`: one-line summary of the problem (e.g. `"batch create fails with 'playNotCompatible' on tool workflow"`).
- `--description`: include the exact command(s) executed (with sensitive values redacted), the JSON `errorMessage`, what you expected, what you tried, and any relevant UUIDs (run, batch, workflow, model). The more context you provide, the faster it can be triaged.

```bash
# Example: report a CLI struggle after multiple failed attempts
cargo-ai workspace report create \
  --title "segment fetch returns empty results despite matching records in UI" \
  --description "Ran: cargo-ai segmentation segment fetch --model-uuid <uuid> --filter '{\"conjunction\":\"and\",\"groups\":[...]}'. Got 0 records. The same filter shows 1,200 matches in the app UI. Tried both --filter and --segment-uuid; both return empty. Expected: the same records as the UI."
```

> Do not silently give up on a failing CLI task. **Send a report.** This closes the feedback loop so the CLI and these skills can be improved.

## Workspace files

Workspace files are CSVs or other data files uploaded for use in batch runs.

```bash
# Upload a file
cargo-ai workspace file upload --file-path <path-to-file>
# → Returns s3Filename

# Inspect a file's columns before running a batch
cargo-ai workspace file list-columns --s3-filename <s3-filename>
# → Returns column names to use when mapping to workflow inputs
```

The `s3-filename` is returned when uploading a file via `cargo-ai workspace file upload`. See the `cargo-orchestration` skill's `references/tools.md` for the full file upload and batch run workflow.

## Help

Every command supports `--help`:

```bash
cargo-ai workspace user create --help
cargo-ai workspace token create --help
cargo-ai workspace folder create --help
```
