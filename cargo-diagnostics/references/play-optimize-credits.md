# Play cost profile — where credits go, and how to cut them

Use this when a play costs more than expected or the user asks to reduce spend. The procedure is: attribute (which workflow → which node → which provider), then apply levers in priority order. Never propose a lever before the attribution — "use a cheaper model" is noise if 90% of the spend is a phone-lookup connector.

Credit attribution needs an **admin** token (`billing` commands); the SQL steps work with any token.

## 1. Attribute spend to workflows

```bash
# Credit spend by workflow this month (SQL — fast, no admin needed)
cargo-ai orchestration query execute \
  "SELECT workflow_uuid, sum(credits_used_count) AS credits
   FROM batches
   WHERE created_at >= toStartOfMonth(now())
   GROUP BY workflow_uuid
   ORDER BY credits DESC"

# Billing source of truth, groupable by other dimensions too
cargo-ai billing usage get-metrics --from <YYYY-MM-DD> --to <YYYY-MM-DD> --group-by workflow_uuid
cargo-ai billing usage get-metrics --from <YYYY-MM-DD> --to <YYYY-MM-DD> --group-by integration_slug
```

Map UUIDs to names with `cargo-ai orchestration play list` / `tool list`. When SQL and billing disagree, billing wins.

## 2. Attribute spend to nodes inside the top workflow

Per-node cost lives on the run detail: each `run.executions[]` item carries `creditsUsedCount` (agent and connector nodes are non-zero, native nodes are zero — see [`troubleshooting.md`](../../cargo-orchestration/references/troubleshooting.md)). Pull 2–3 recent representative runs and average:

```bash
cargo-ai orchestration query execute \
  "SELECT uuid FROM runs
   WHERE workflow_uuid = '<workflow-uuid>' AND status = 'success'
   ORDER BY created_at DESC LIMIT 3"

cargo-ai orchestration run get <run-uuid>   # read executions[].creditsUsedCount per nodeSlug
```

Also check **waste**: credits spent on runs that errored anyway —

```bash
cargo-ai orchestration query execute \
  "SELECT status, sum(credits_used_count) AS credits, count() AS runs
   FROM runs
   WHERE workflow_uuid = '<workflow-uuid>' AND created_at > now() - INTERVAL 30 DAY
   GROUP BY status"
```

A meaningful `error`-row credit sum means expensive nodes run **before** the failure point — reordering is a free win.

## 3. Apply levers, cheapest-to-implement first

Work down this list; the first two usually dominate. The canonical lever table is in [`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) ("Cost levers"); provider prices are in [`../../cargo-gtm/references/credits-cost-table.md`](../../cargo-gtm/references/credits-cost-table.md).

| Lever | When it applies | Where documented |
| --- | --- | --- |
| **Filter earlier** — move `filter` nodes before expensive connector/agent nodes so ineligible records never reach them | Waste query (step 2) shows credits on errored/filtered-late runs | [`cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) |
| **Cheaper provider for the same stage** — swap the action, keep the graph | One integration dominates the `integration_slug` grouping | [`credits-cost-table.md`](../../cargo-gtm/references/credits-cost-table.md) + [`alternatives.md`](../../cargo-gtm/references/alternatives.md) — beware cheap-but-low-hit-rate providers; total spend is dominated by misses |
| **Cheaper model / lower `maxSteps` on agent nodes** | Agent nodes dominate per-node cost | [`cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) |
| **Stop early on failure** (`fallbackOnFailure: false`) | Downstream nodes run after an upstream miss | [`cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) |
| **Reshape waterfall chains** — reorder by hit-rate/price, add stop-early rules | Multi-provider enrichment stages | [`waterfall-strategy.md`](../../cargo-gtm/references/waterfall-strategy.md) |
| **Cut phone lookup from default chains** | Phone actions present without explicit user request (3–7 credits/record, ~10× email) | [`cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md) §5 |

## 4. Prove the saving

Changing the graph is a workflow edit + re-run: stage via draft release, pilot 1–3 records, present the before/after per-record cost, and only then fan out — the full gate is [`cost-discipline.md`](../../cargo-gtm/references/cost-discipline.md) §1, and the receipt format is §2. A cost optimization that skips the pilot is just a different way to spend credits blind.

## Presenting a cost profile

Per [`../../cargo/references/interaction.md`](../../cargo/references/interaction.md): lead with the attribution and the projected saving, then the lever plan as shaped choices. Example shape:

```
"Enrich EMEA leads" spent 412 credits this month; 71% is the find_phone
connector node, which runs on every record before qualification.

| change                                   | est. per-record | est. monthly |
|------------------------------------------|-----------------|--------------|
| move qualify filter before find_phone    | 4.1 → 1.9       | −55%         |
| also: drop phone to on-request only      | 1.9 → 0.6       | −85%         |

Pilot either variant on 3 records (~2 credits) to confirm before deploying?
```
