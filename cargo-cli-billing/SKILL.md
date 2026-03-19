---
name: cargo-cli-billing
description: Pull usage metrics, check subscription status, view invoices, and manage credits using the Cargo CLI. Use when the user wants billing analytics, usage reports, credit usage, cost analysis, subscription details, or invoice history for their Cargo workspace.
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo CLI — Billing

Billing and credit management: pulling usage metrics, checking subscription status, viewing invoices, and managing credits.

> See `references/response-shapes.md` for full JSON response structures.
> See `references/troubleshooting.md` for common errors and how to fix them.
> See `references/examples/usage-metrics.md` for usage metric and subscription examples.

## Prerequisites

```bash
npm install -g @cargo-ai/cli
cargo-ai login --token <your-api-token>
cargo-ai login --token <your-api-token> --workspace-uuid <uuid>
```

Verify with `cargo-ai whoami`. All commands output JSON to stdout. Without a global install, prefix every command with `npx @cargo-ai/cli` instead of `cargo-ai`.

Failed commands exit non-zero and return `{"errorMessage": "..."}`.

**Note:** Billing commands require a token with admin access to the workspace.

## Discover resources first

Usage metrics can be filtered and grouped by resource UUID. Discover them before querying.

```bash
cargo-ai orchestration play list            # all plays (name, workflowUuid)
cargo-ai orchestration tool list            # all tools (name, workflowUuid)
cargo-ai ai agent list                     # all agents (uuid, name)
cargo-ai connection connector list          # all connectors (uuid, name, integrationSlug)
cargo-ai storage model list                # all models (uuid, name, slug)
```

## Quick reference

```bash
cargo-ai billing usage get-metrics --from <YYYY-MM-DD> --to <YYYY-MM-DD>
cargo-ai billing usage get-metrics --from <YYYY-MM-DD> --to <YYYY-MM-DD> --group-by workflow_uuid
cargo-ai billing subscription get
cargo-ai billing subscription get-invoices
cargo-ai billing subscription create-portal-session
```

## Estimating cost before running a batch

Before triggering a large batch, estimate credit consumption to avoid unexpected charges.

**Step 1 — Check current credit balance:**

```bash
cargo-ai billing subscription get
# → subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount = remaining credits
```

**Step 2 — Estimate cost from a sample run:**

Run the workflow on a single record first and measure credits consumed:

```bash
# Run on one record
cargo-ai orchestration run create --workflow-uuid <uuid> --data '{...}'
# → poll to completion

# Check credits used for that run
cargo-ai billing usage get-metrics \
  --from <today> --to <today> \
  --workflow-uuid <uuid>
# → .totalUsage = credits consumed today for this workflow
```

**Step 3 — Project batch cost:**

```
estimated_cost = credits_per_record × number_of_records
```

Compare against `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` before proceeding.

**Step 4 — Monitor during the batch:**

```bash
# Check running costs mid-batch
cargo-ai billing usage get-metrics \
  --from <start-date> --to <today> \
  --workflow-uuid <uuid>
```

**Cost levers:**

| Action | Effect |
|---|---|
| Use a cheaper model (e.g. `gpt-4o-mini` vs `gpt-4o`) | Significant reduction for AI nodes |
| Add `filter` nodes early in the graph | Skip ineligible records before expensive connector calls |
| Set `fallbackOnFailure: false` | Stop the run early on failures instead of continuing to downstream nodes |
| Reduce `maxSteps` on agent nodes | Limit how many tool calls an agent can make per record |

## Usage metrics

Pull credit and usage data for any time range, optionally filtered and grouped.

```bash
# Basic usage for a period
cargo-ai billing usage get-metrics --from <start-date> --to <end-date>

# Group by dimension
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --group-by workflow_uuid
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --group-by connector_uuid
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --group-by integration_slug
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --group-by model_uuid
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --group-by agent_uuid

# Filter by specific resource
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --workflow-uuid <uuid>
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --agent-uuid <uuid>
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --connector-uuid <uuid>
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --integration-slug <slug>

# Specify unit
cargo-ai billing usage get-metrics --from <start-date> --to <end-date> --unit credits
```

`--group-by` values: `workflow_uuid`, `connector_uuid`, `model_uuid`, `integration_slug`, `agent_uuid`.

Available filters: `--workflow-uuid`, `--model-uuid`, `--connector-uuid`, `--integration-slug`, `--slug`, `--agent-uuid`. Combine with `--group-by` and `--unit`.

## Subscription and credits

```bash
cargo-ai billing subscription get                    # current plan, credits used/available, period dates
cargo-ai billing subscription get-invoices            # invoice history (amounts in cents)
cargo-ai billing subscription get-credit-card         # card on file
cargo-ai billing subscription create-portal-session   # Stripe portal URL for self-service billing
```

Remaining credits = `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount` from `subscription get`.

**Note:** Invoice amounts are returned in cents. Divide by 100 for the dollar value.

## Help

Every command supports `--help`:

```bash
cargo-ai billing usage get-metrics --help
cargo-ai billing subscription get --help
cargo-ai billing subscription get-invoices --help
```
