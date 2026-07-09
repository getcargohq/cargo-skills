# Recipe: deploy from CI

**Use when** the user wants `cargo-ai cdk deploy` to run non-interactively — on
push, on merge, or on a schedule — so the workspace stays in sync with the repo.

## Prerequisites

- **A workspace-scoped API token** (not OAuth) from **Settings → API**. Store it as
  a CI secret (`CARGO_API_TOKEN`). Token values are shown once — capture at
  creation. See [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md)
  for `token create`.
- **`cargo.state.json` committed** in the repo — CI diffs against it. Without it,
  CI can't tell what already exists and may recreate resources.
- **Any `secret()` env vars** set as CI secrets too (e.g. `HUBSPOT_API_KEY`).

## The CI steps

```bash
# 1. Install the CLI (project already depends on @cargo-ai/cdk via package.json)
npm install -g @cargo-ai/cli@latest
npm ci

# 2. Authenticate non-interactively with the token (selects the token's workspace)
cargo-ai login --token "$CARGO_API_TOKEN"

# 3. Deploy — --yes is REQUIRED (no TTY to confirm at); --json for machine-readable output
cargo-ai cdk deploy --yes --json
```

## Critical CI rules

- **`--yes` is mandatory.** `deploy`/`destroy` prompt for confirmation and refuse
  to run non-interactively without it.
- **The workspace guard still applies.** `cargo.state.json` records the workspace it
  was deployed to; deploy refuses if the token's workspace ≠ the state's workspace.
  Use one state file per workspace (e.g. a branch or directory per environment).
- **Commit the updated state back** if CI is the source of truth. A deploy that
  creates resources writes new uuids into `cargo.state.json`; if CI doesn't commit
  them, the next run won't know they exist. Either commit the file from the CI job,
  or make deploys only ever run from a branch whose state is already current.
- **Preview safely** with `cargo-ai cdk plan --json` (offline, no API calls) on pull
  requests, and gate `deploy` to the protected branch.
- **Prune deliberately.** Add `--prune` only when you want CI to delete resources
  removed from code; leave it off to make deploys purely additive.

## A GitHub Actions sketch

```yaml
# .github/workflows/deploy.yml
- run: npm install -g @cargo-ai/cli@latest && npm ci
- run: cargo-ai login --token "$CARGO_API_TOKEN"
  env:
    CARGO_API_TOKEN: ${{ secrets.CARGO_API_TOKEN }}
- run: cargo-ai cdk deploy --yes --json
  env:
    HUBSPOT_API_KEY: ${{ secrets.HUBSPOT_API_KEY }}
```
