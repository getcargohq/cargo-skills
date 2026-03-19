---
name: cargo-cli-workspace
description: Manage workspace users, API tokens, folders, and roles using the Cargo CLI. Use when the user wants to invite or manage workspace members, create or rotate API tokens, organize resources into folders, or inspect workspace roles and permissions.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Workspace

Workspace administration: managing users, API tokens, folders, roles, and workspace-level files.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/users.md` for user invite and management examples.
> See `references/examples/tokens.md` for API token creation and rotation examples.
> See `references/examples/folders.md` for organizing resources into folders.

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
cargo-ai workspace token create --from-user
cargo-ai workspace token remove <token-uuid>
cargo-ai workspace folder list
cargo-ai workspace folder create --name <name> --emoji-slug <slug> --kind <kind>
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

```bash
# List all API tokens
cargo-ai workspace token list

# Create a new token (scoped to your user)
cargo-ai workspace token create --from-user
# → Returns the token value — store it securely, it won't be shown again

# Remove a token
cargo-ai workspace token remove <token-uuid>
```

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

The `s3-filename` is returned when uploading a file via `cargo-ai workspace file upload`. See the `cargo-cli-orchestration` skill's `references/tools.md` for the full file upload and batch run workflow.

## Help

Every command supports `--help`:

```bash
cargo-ai workspace user create --help
cargo-ai workspace token create --help
cargo-ai workspace folder create --help
```
