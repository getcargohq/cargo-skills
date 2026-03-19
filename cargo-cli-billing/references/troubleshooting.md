# Troubleshooting

Common errors and recovery steps for `cargo-cli-billing` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli@^1.0.5` or prefix with `npx @cargo-ai/cli@^1.0.5` |
| `Unauthorized` or `Forbidden` | Bad or expired API token | Re-run `cargo-ai login --token <token>` and verify with `cargo-ai whoami` |

## Usage metrics

| Symptom | Cause | Fix |
|---------|-------|-----|
| Empty metrics (no items) | Date range has no activity, or wrong format | Verify dates are `YYYY-MM-DD`; try a wider range; confirm the workspace had activity in that period |
| `--group-by` returns items with null `groupBy` | Some usage isn't attributable to that dimension | This is expected — unattributed usage shows `groupBy: null` |
| Metrics don't match expectations | Filtering by wrong resource UUID | Re-discover UUIDs with `play list`, `tool list`, `connector list`, or `agent list` |

## Subscription and billing

| Symptom | Cause | Fix |
|---------|-------|-----|
| `subscription get` returns `Forbidden` | Token lacks billing permissions | Use a token with admin access; check workspace settings under **Settings > API** |
| Invoice amounts look wrong | Amounts are in cents, not dollars | Divide `amount` by 100 for the dollar value |
| `create-portal-session` returns an error | Subscription not active or no Stripe setup | Verify the workspace has an active paid subscription |
