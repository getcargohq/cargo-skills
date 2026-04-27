---
name: cargo-prospecting
description: "Find people matching a description, enrich them, verify their emails, and sync to CRM. Cargo's flagship end-to-end prospecting pipeline. Use this skill when the user states a sourcing goal — finding leads, building a prospect list, enriching contacts with email/phone/LinkedIn, scoring fit, or pushing the result to a sequencer or CRM. Anchored in the priority provider stack: salesNavigator (sourcing), cargo (firmographic + signal intelligence), waterfall (enrichment + verification + job-change signal), FullEnrich (premium contact lookup), theirStack (tech-stack + hiring intent), peopleDataLabs (heavyweight backfill)."
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token, with priority-6 connectors authenticated
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo Prospecting — flagship find→enrich→verify→sync pipeline

Use this skill when the user states a real-world sourcing goal:

- *"Find me 5 fintech CTOs in NYC and verify their emails."*
- *"Build me a list of seed-stage SaaS founders in the US."*
- *"Source 200 RevOps leaders at companies hiring data engineers."*
- *"Enrich these 100 domains and find a contact at each."*

For broader GTM tasks (writing outreach, deep research, monitoring signals), defer to [`cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md). For ad-hoc CLI work, defer to the relevant capability skill in [`../../cargo-infra/`](../../cargo-infra/).

## What this skill does

Runs the **priority-stack pipeline spine**:

```
1. SOURCE   → salesNavigator.searchLeads / searchAccounts            (0.02–0.05/record)
2. DEDUPE   → cargo.matchProspect / cargo.matchBusiness              (0.5/record)
3. ENRICH   → cargo.enrichProspectDetails + …Firmographics
              + waterfall.enrichContact / enrichCompany              (0.5–2/record)
4. SIGNAL   → cargo.enrichBusinessFundingAndAcquisitions
              + theirStack.searchJobs                                (0.5/record)
5. CONTACT  → FullEnrich.findEmail (fallback peopleDataLabs)         (1–3/record)
6. VERIFY   → waterfall.verifyEmail                                  (0.1/record)
7. WRITEBACK → segment write / CRM upsert / CSV export               (free)
```

Adapt by phase: drop steps not relevant to the user's goal. Pure sourcing → step 1. "Enrich list I already have" → steps 2–6.

## Recipes

Three paste-and-tweak recipes, all using the priority stack:

- **P1 — Mini-pipeline (10 prospects)**: end-to-end demo. Each stage shown individually. See [`references/recipes.md#p1`](references/recipes.md).
- **P2 — Full GTM run (50–500 prospects)**: P1 with fan-out via `action execute-batch` and segment write-back. See [`references/recipes.md#p2`](references/recipes.md).
- **P3 — Backfill mode (existing segment)**: enrich/verify rows missing email; escalate to `peopleDataLabs.enrichPerson` only on misses. See [`references/recipes.md#p3`](references/recipes.md).

Alternative provider chains (for when the priority stack misses) live in [`references/alternatives.md`](references/alternatives.md).

## Discovery sequence (run before any pipeline)

```bash
# 1. Confirm authentication
cargo-ai whoami

# 2. Confirm priority providers are connected
for slug in salesNavigator FullEnrich waterfall theirStack cargo peopleDataLabs; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" \
    || echo "✗ $slug (NOT CONNECTED — recipe will fall back)"
done

# 3. Find the target model (Companies / Contacts) for write-back
cargo-ai storage model list

# 4. (optional) Find an existing segment to enrich, instead of fresh sourcing
cargo-ai segmentation segment list
```

## Action shape rules

Every action JSON in this skill follows the canonical shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — see [`../../cargo-infra/cargo-orchestration/references/actions.md`](../../cargo-infra/cargo-orchestration/references/actions.md).

Variable interpolation across nodes: `{{nodes.<slug>.<field>}}`. Agent node outputs wrap under `.answer`.

## Output retrieval

After any batch finishes, retrieve enriched data with **`cargo-ai orchestration run download-outputs`** (not `run download`). See [`../cargo-gtm/references/output-retrieval.md`](../cargo-gtm/references/output-retrieval.md) for full reference.

## Polling

Recipes use `--wait-until-finished` for runs ≤ 50 records. For larger runs, switch to async + polling per [`../../cargo-infra/cargo-orchestration/references/polling.md`](../../cargo-infra/cargo-orchestration/references/polling.md).

## Credits accounting

After every recipe run, surface the cost:

```bash
cargo-ai billing usage get-metrics \
  --from <run-date> --to <today> \
  --group-by integration_slug
```

Confirms which providers consumed credits and validates the recipe didn't drift to non-priority providers unexpectedly.

## When stuck — file a workspace report

If a recipe fails twice and the cause isn't obvious, escalate via `cargo-ai workspace report create`. See [`../../cargo-infra/cargo-workspace-management/SKILL.md`](../../cargo-infra/cargo-workspace-management/SKILL.md) (Reports section).
