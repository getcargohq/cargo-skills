# API token examples

Every token has a human-readable `name` and a `permissions` field. The CLI's `token create` always issues a token with `permissions: null`, which means the token mirrors the permissions of the user who created it — its effective access is whatever that user can do in the workspace. Use the API or the Cargo app to scope a token to a different subset of actions / resources.

## List all tokens

```bash
cargo-ai workspaceManagement token list
# → Each entry includes `uuid`, `name`, `permissions`, `userUuid`, `workspaceUuid`, `createdAt`, `deletedAt`
# (the actual token value is not shown — it is only returned once, at creation)
```

## Create a new token

`--name` is required. Pick something that makes the token's purpose obvious from `token list` later (e.g. `"CI/CD pipeline"`, `"GitHub Actions — production"`, `"Local dev — alice"`).

```bash
cargo-ai workspaceManagement token create --name "CI/CD pipeline"
```

The response includes the `token` field — this is the only time the token value is shown. Store it immediately in a secrets manager.

> The new token inherits the permissions of the user running `token create`. If you need a token with broader or narrower access than your user, create it under the appropriate user account, or scope it explicitly via the API / Cargo app after creation.

## Rotate a token (replace an old one)

```bash
# 1. Create the new token first (give it a clear name)
cargo-ai workspaceManagement token create --name "CI/CD pipeline (rotated 2026-01)"
# → Save the new token value

# 2. Update all systems using the old token to use the new value

# 3. Remove the old token
cargo-ai workspaceManagement token remove <old-token-uuid>
```

## Remove a token

```bash
cargo-ai workspaceManagement token remove <token-uuid>
```

## Find which token is currently in use

```bash
cargo-ai whoami
# → The active token is the one used for authentication in the current session
# Run `workspaceManagement token list` to see all tokens and their names
```
