# API token examples

## List all tokens

```bash
cargo-ai workspace token list
# → Shows token UUID and creation date (not the token value)
```

## Create a new token

```bash
cargo-ai workspace token create --from-user
```

Response includes the `token` field — this is the only time the token value is shown. Store it immediately in a secrets manager.

## Rotate a token (replace an old one)

```bash
# 1. Create the new token first
cargo-ai workspace token create --from-user
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
# Run `workspace token list` to see all tokens
```
