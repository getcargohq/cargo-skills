# Troubleshooting

Common errors and recovery steps for `cargo-billing` commands.

## General

| Symptom | Cause | Fix |
|---------|-------|-----|
| `{"errorMessage": "..."}` with non-zero exit | Any CLI error | Read the `errorMessage` — it usually says exactly what's wrong |
| `command not found: cargo-ai` | CLI not installed or not in PATH | Run `npm install -g @cargo-ai/cli` or prefix with `npx @cargo-ai/cli` |
| `Unauthorized` or `Forbidden` | Bad or expired credentials | Re-run `cargo-ai login --oauth` (browser sign-in) or `cargo-ai login --token <token>`; verify with `cargo-ai whoami` |

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

## Adding a card

| Symptom | Cause | Fix |
|---------|-------|-----|
| `cardDeclined` with a `declineCode` | The issuer refused the zero-amount verification | Read `declineCode`. On a spend-limited virtual card this usually means the budget or merchant restrictions exclude us — ask the cardholder to raise the limit, then retry |
| `authenticationRequired` | The card requires 3-D Secure, which cannot be completed without the cardholder | Re-run `update-payment-method` with no arguments and give the user the hosted-form URL |
| `paymentMethodNotFound` | The details did not resolve to a card we can use | Re-check the number and expiry with the user |
| `Rate limit exceeded` on `update-payment-method` | More than 10 card updates in an hour for this workspace | Wait for `retryAfter`. Repeatedly retrying a declined card is what exhausts this — fix the decline cause first |
| Stripe rejects the card before Cargo sees it (`code`, `param` in the error) | The number, expiry, or CVC is malformed | The `param` field names the bad field; correct it with the user |
| `no Stripe publishable key configured` | The Cargo environment is missing `STRIPE_PUBLIC_KEY` | Environment misconfiguration, not a user error — report it; the hosted-form flow (no arguments) still works |
| Hosted form times out | Nobody completed the form in the window | Re-run with a longer `--timeout`, or confirm with `get-credit-card` — the card may have landed after the wait ended |
