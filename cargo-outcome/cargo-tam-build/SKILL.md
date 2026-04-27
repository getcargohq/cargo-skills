---
name: cargo-tam-build
description: "Build a Total Addressable Market (TAM) list at scale. Source companies (and optionally contacts) matching ICP criteria — industry, size, geography, tech stack, funding stage, hiring intent — write the result to a Companies / Contacts model. Anchored in the priority provider stack (salesNavigator, cargo, theirStack, peopleDataLabs). Use when the user wants a sourcing-heavy list build, typically 100–10,000 companies."
license: MIT
compatibility: Requires @cargo-ai/cli (npm) and a Cargo API token, with priority-stack connectors authenticated
metadata:
  author: getcargo
  version: "1.0"
---

# Cargo TAM Build — sourcing at scale

Use this skill when the user wants a **list of companies (and optionally contacts)** matching ICP criteria, at sourcing-heavy volumes (100–10,000 companies).

**Trigger phrases:**
- *"Build me a TAM of fintech companies in the US, 50–500 employees."*
- *"Source 1,000 SaaS companies hiring data engineers."*
- *"Find every Series A-B startup running Snowflake."*
- *"Give me all the e-commerce brands in the EU under 100 people."*

For find-then-engage flows (find few + enrich + verify + sequence), use [`../cargo-prospecting/SKILL.md`](../cargo-prospecting/SKILL.md). For stage-by-stage routing across the GTM funnel, see [`../cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md).

## Recipe

The canonical TAM-build recipe lives at [`../cargo-gtm/recipes/build-tam.md`](../cargo-gtm/recipes/build-tam.md). Follow it step-by-step; this top-level SKILL.md is the discovery surface, the recipe has the runnable bash.

**High-level pipeline:**

```
1. SOURCE      → salesNavigator.searchAccounts (0.05/company)
                 OR peopleDataLabs.searchCompanies (3, cargo filter shape) / queryCompanies (3, PDL SQL)
                 OR theirStack.searchCompanies (0.5) when intent is the primary filter
2. DEDUPE      → cargo.matchBusiness (0.5/company)
3. ENRICH      → cargo.enrichBusinessFirmographics (0.5)
                 + cargo.enrichBusinessTechnographics (1) if tech matters
                 + cargo.enrichBusinessFundingAndAcquisitions (0.5) if funding matters
4. CONTACTS    → (optional) salesNavigator.searchLeads (0.02/lead) per company
5. EMAIL+VERIFY → (optional) FullEnrich.findEmail (1) → waterfall.verifyEmail (0.1)
6. WRITE-BACK  → segment write to Companies / Contacts model
```

## Sourcing decision tree

The right step-1 provider depends on which filter is primary:

| Primary filter | Provider | Cost | Notes |
|---|---|---|---|
| Industry / size / geo | salesNavigator.searchAccounts | 0.05 | LinkedIn-anchored. Default at-scale. |
| Funding stage / investor / round size | peopleDataLabs.queryCompanies | 3 | PDL **SQL** string (`SELECT * FROM company WHERE …`). Required for array-membership filters like `summary.investors LIKE %X%`. |
| Tech stack | theirStack.searchCompanies (with techFields) | 0.5 | Tech-stack-driven sourcing. |
| Hiring for role X | theirStack.searchJobs | 0.5 | Hiring-intent signal. |
| Local SMBs / storefronts | serper.searchPlaces | 1 | Google Maps-style. |
| Already have a domain list | (skip sourcing) | — | Go straight to step 2 (dedup + enrich). |

For combined filters (e.g. fintech in US AND running Snowflake AND hiring data engineers), do parallel queries and intersect the results client-side.

## Discovery sequence

```bash
cargo-ai whoami

# Confirm priority connectors are authenticated
for slug in salesNavigator cargo theirStack peopleDataLabs FullEnrich waterfall; do
  cargo-ai connection connector list --integration-slug "$slug" \
    | jq -e '.connectors | length > 0' > /dev/null \
    && echo "✓ $slug" || echo "✗ $slug"
done

# Find the target Companies model for write-back
cargo-ai storage model list
```

## Volume / cost guidance

| Target volume | Recommended sourcing path | Estimated credits (sourcing only) |
|---|---|---|
| 100 companies | salesNavigator.searchAccounts | ~5 |
| 500 companies | salesNavigator.searchAccounts | ~25 |
| 1,000 companies | salesNavigator.searchAccounts | ~50 |
| 5,000 companies | salesNavigator.searchAccounts (paginate) | ~250 |
| 10,000 companies | peopleDataLabs.queryCompanies (high-quality, structured) | ~30,000 (3/company) |

For 5,000+ companies, **always sample 50 first** to validate the data quality before paying for the full volume. Cancel the run if the sample is off-ICP.

For full-pipeline costs (sourcing + enrichment + contacts + emails + verify), see the credit-budget section in [`../cargo-gtm/recipes/build-tam.md`](../cargo-gtm/recipes/build-tam.md).

## Output retrieval

After the pipeline finishes, retrieve the enriched TAM with `cargo-ai orchestration run download-outputs --workflow-uuid <uuid> --output-node-slug <slug>`. See [`../cargo-gtm/references/output-retrieval.md`](../cargo-gtm/references/output-retrieval.md).

## Action shape rules

`{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}` — no `connectorUuid` in `config`. See [`../../cargo-infra/cargo-orchestration/references/actions.md`](../../cargo-infra/cargo-orchestration/references/actions.md).

## When stuck — file a workspace report

Sourcing failures are usually filter-mismatch issues. If salesNavigator + peopleDataLabs both miss the niche, escalate via `cargo-ai workspace report create` — see [`../../cargo-infra/cargo-workspace-management/SKILL.md`](../../cargo-infra/cargo-workspace-management/SKILL.md).
