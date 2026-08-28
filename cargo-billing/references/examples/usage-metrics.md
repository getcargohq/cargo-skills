# Usage metrics examples

## Get overall usage for a time range

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31
```

Response:

```json
{
  "metrics": [
    {
      "date": "2026-07-25T00:00:00.000Z",
      "items": [
        { "slug": "integration.peopleDataLabs.action.queryPeople", "count": 174, "groupBy": null },
        { "slug": "native.modelAsk", "count": 0.5, "groupBy": null },
        { "slug": "success", "count": 1043, "groupBy": null },
        { "slug": "error", "count": 32, "groupBy": null },
        { "slug": "insert", "count": 24, "groupBy": null }
      ]
    }
  ]
}
```

Each item has a `slug` (usage type) and `count`. When `--group-by` is used, `groupBy` contains the resource UUID/slug.

**`count` is not always credits.** Unqualified, the array interleaves all three usage units: `integration.*` / `native.*` slugs are credits, `success` / `error` are **node executions** (credits = count / 100), `insert` is records written. Isolate one with `--unit billing.credits`, `--unit orchestration.executions`, or `--unit storage.records` — the only three accepted values.

## Isolate the execution charge

Every node execution bills 0.01 credits, and it is attributed to no node — this is the only place it surfaces.

```bash
cargo-ai billing usage get-metrics \
  --from 2026-07-25 --to 2026-07-25 --unit orchestration.executions
# → [{"slug":"error","count":32},{"slug":"success","count":1043}]
# → 1,075 executions = 10.75 credits
```

Same day, provider spend for comparison:

```bash
cargo-ai billing usage get-metrics \
  --from 2026-07-25 --to 2026-07-25 --unit billing.credits
# → sum of items[].count = ~276 credits
```

Here orchestration is ~4% because the day was action-heavy. On an action-light sweep the ratio inverts and executions become the largest line item. See [`../../SKILL.md`](../../SKILL.md) → "The execution charge".

## Group by workflow

See which workflows consume the most credits.

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by workflow_uuid
# → Each item has groupBy = workflow UUID
# → Cross-reference with: cargo-ai orchestration workflow list
```

## Group by connector

See which connectors (e.g. Salesforce, HubSpot) are used most.

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by connector_uuid
# → Cross-reference with: cargo-ai connection connector list
```

## Group by integration

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by integration_slug
```

## Group by model

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by model_uuid
# → Cross-reference with: cargo-ai storage model list
```

## Group by agent

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by agent_uuid
# → Cross-reference with: cargo-ai ai agent list
```

## Filter usage to a specific workflow

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --workflow-uuid <uuid>
```

## Filter usage to a specific agent

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --agent-uuid <uuid>
```

## Filter usage to a specific connector

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --connector-uuid <uuid>
```

## Filter usage to a specific integration

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --integration-slug <slug>
```

## Specify unit (credits)

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --unit credits
```

## Combine group-by with filter

Usage for a specific workflow, grouped by connector.

```bash
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --workflow-uuid <uuid> \
  --group-by connector_uuid
```

## Check subscription and remaining credits

```bash
cargo-ai billing subscription get
```

Response:

```json
{
  "subscription": {
    "plan": "self-serve",
    "subscriptionStatus": "active",
    "subscriptionAvailableCreditsCount": 10000,
    "subscriptionCreditsUsedCount": 3200,
    "startAt": "2025-01-01T00:00:00Z",
    "resetAt": "2025-02-01T00:00:00Z"
  }
}
```

Remaining credits = `subscriptionAvailableCreditsCount - subscriptionCreditsUsedCount`.

```bash
# Invoice history (amounts in cents — divide by 100 for dollars)
cargo-ai billing subscription get-invoices

# Card on file
cargo-ai billing subscription get-credit-card

# Open Stripe portal for self-service billing
cargo-ai billing subscription create-portal-session
```

## Compare usage across two periods

```bash
# This month
cargo-ai billing usage get-metrics \
  --from 2025-02-01 --to 2025-02-28

# Last month
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31

# → Compare metrics[].items[].count values to spot trends
```

## Monthly usage report (full flow)

```bash
# 1. Overall usage
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31

# 2. Break down by workflow
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by workflow_uuid

# 3. Break down by connector
cargo-ai billing usage get-metrics \
  --from 2025-01-01 --to 2025-01-31 \
  --group-by connector_uuid

# 4. Check remaining credits
cargo-ai billing subscription get
```
