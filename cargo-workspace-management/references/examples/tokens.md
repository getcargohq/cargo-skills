# API token examples

Every token has a human-readable `name` and a `permissions` field. The CLI's `token create` always issues a token with full workspace access (`permissions: null`); use the API or the Cargo app to scope a token to a subset of actions / resources.

## List all tokens

```bash
cargo-ai workspace token list
# → Each entry includes `uuid`, `name`, `permissions`, `userUuid`, `workspaceUuid`, `createdAt`, `deletedAt`
# (the actual token value is not shown — it is only returned once, at creation)
```

## Create a new token

`--name` is required. Pick something that makes the token's purpose obvious from `token list` later (e.g. `"CI/CD pipeline"`, `"GitHub Actions — production"`, `"Local dev — alice"`).

```bash
cargo-ai workspace token create --name "CI/CD pipeline"
```

The response includes the `token` field — this is the only time the token value is shown. Store it immediately in a secrets manager.

## Rotate a token (replace an old one)

```bash
# 1. Create the new token first (give it a clear name)
cargo-ai workspace token create --name "CI/CD pipeline (rotated 2026-01)"
# → Save the new token value

# 2. Update all systems using the old token to use the new value

# 3. Remove the old token
cargo-ai workspace token remove <old-token-uuid>
```

## Remove a token

```bash
cargo-ai workspace token remove <token-uuid>
```

## Find which token is currently in use

```bash
cargo-ai whoami
# → The active token is the one used for authentication in the current session
# Run `workspace token list` to see all tokens and their names
```
