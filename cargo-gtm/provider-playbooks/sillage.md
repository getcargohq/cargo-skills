---
provider: sillage
category: signal (inbound detections)
last-reviewed: 2026-08-15
---

# sillage (Sillage)

Signal detections pushed into a Cargo model, read back with one action. **`searchLeads` costs 0**, which makes this the only free signal rung in the catalog.

The shape is different from every other provider here and that is the thing to understand before using it: sillage does not go and look something up. It **receives** detections into a model you nominate, and `searchLeads` reads what has already landed.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchLeads` | **0** | `modelUuid` (required), `companyDomains`, `companyLinkedinHandles`, `companyLinkedinUrls`, `limit` | Read detections already delivered into the nominated model, optionally filtered to accounts you care about. |

`modelUuid` is required and there is no default. If the detections are not being delivered into a model yet, this action has nothing to return and the answer is a setup step, not a retry.

## What it's for

- ✅ **Reading detections against a named account list** — pass `companyDomains` to filter the feed to the accounts in play rather than reading everything that arrived.
- ✅ **A free first check before any paid signal action.** It costs nothing, so on any signal question it runs first by definition.
- ❌ **Going out and finding a signal** — nothing here searches the world. For that, `theirStack.searchJobs` (0.5) is hiring intent, `cargo.enrichBusinessFundingAndAcquisitions` (0.5) is funding, `waterfall.detectJobChange` (3) is people moving.
- ❌ **Sourcing** — this reads a feed of accounts already detected, not a market.

## Patterns

### Pattern A — Detections for the accounts in play

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"sillage","actionSlug":"searchLeads","config":{}}' \
  --data '{
    "modelUuid": "<the model receiving detections>",
    "companyDomains": ["acme.com", "globex.com"],
    "limit": 100
  }' \
  --wait-until-finished
```

Free, so the only reason to keep `limit` sensible is the size of what comes back into context.

### Pattern B — The free rung in front of a paid one

Run `searchLeads` across the segment first. Rows that already carry a detection do not need a paid signal lookup at all, and the ones that do not are the only rows that should reach `theirStack` or the cargo signal actions.

## Common pitfalls

- **Calling it without `modelUuid`.** Required, no default. Resolve it with `cargo-ai storage model list` ([`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md)) rather than guessing.
- **Expecting it to find something.** An empty result means nothing has been delivered for those accounts, not that no signal exists in the world. Those are different answers and only the second justifies a paid lookup.
- **Reading the feed unfiltered.** Without `companyDomains` this returns everything that arrived, most of which is not in the segment being worked.

## Anti-patterns

- **Skipping it because it is free.** A free action in front of a paid one is a pure saving, and this is the only one in the catalog. A signal recipe that does not check it first is leaving credits on the table.
- **Treating a detection as a lawful basis.** It is a relevance input like any other signal. [`../references/acceptable-use.md`](../references/acceptable-use.md) is unchanged by how the signal arrived.

## Position in the waterfall

**First rung on any signal question, unconditionally**, because it is free. Everything paid (`theirStack.searchJobs` 0.5, `cargo.enrichBusinessFundingAndAcquisitions` 0.5, `waterfall.detectJobChange` 3) runs on the residue.

## Action shape

`{"kind":"connector","integrationSlug":"sillage","actionSlug":"searchLeads","config":{}}`. **No `connectorUuid` in `config`.** Filters go in `--data`.

## Pairs with

- [`../recipes/account-expansion.md`](../recipes/account-expansion.md) — detections against existing accounts.
- [`../recipes/re-engagement.md`](../recipes/re-engagement.md) — a detection on a dormant account is the cheapest reason to revisit it.

## Recurring use

- **The one provider where a frequent schedule costs nothing.** Re-reading the feed hourly is free, so cadence is a question of how fresh the downstream action needs to be rather than of budget.
- **In-play gate still applies downstream.** The read is free; whatever a detection triggers is not. Gate the paid follow-up on detections newer than the last run, or a nightly read re-fires the same paid action on the same rows.
