# Enriching and researching

How to enrich companies and contacts on Cargo. Covers waterfall enrichment, fallback chains, signal extraction, and output retrieval.

## Default chain by enrichment goal

```
Goal → which provider chain?

Firmographics on a known company (industry, size, geo, revenue, …)?
  ├─ cargo.matchBusiness (0.5) → cargo.enrichBusinessFirmographics (0.5)
  ├─ Fallback for unmatched: waterfall.enrichCompany (1)
  └─ Heavy backfill: peopleDataLabs.enrichCompany (3)

Contact details on a known person (title, location, social, …)?
  ├─ cargo.matchProspect (0.5) → cargo.enrichProspectDetails (2)
  ├─ Fallback: waterfall.enrichContact (2)
  └─ Heavy backfill: peopleDataLabs.enrichPerson (3)

Find an email from name + company?
  ├─ FullEnrich.findEmail (1)               ← default
  ├─ Cheap fallback: hunter.findEmail (0.5) / icypeas.findEmail (0.1)
  └─ Last resort: peopleDataLabs.enrichPerson (3, includes email)

Verify an email?
  ├─ waterfall.verifyEmail (0.1)            ← default (cheap, multi-source)
  └─ Alt: zeroBounce.verifyEmail (0.1) / icypeas.verifyEmail (0.01)

Find a phone number?
  ├─ FullEnrich.findPhone (6)               ← higher quality
  ├─ Cheap fallback: prospeo.findPhone (3)
  └─ Combined: FullEnrich.findPhoneAndEmail (7) when both are needed

Resolve a LinkedIn URL from name + company?
  └─ linkedin.findProfileUrl (0.25) → linkedin.enrichProfile (0.25) for validation
     See `../recipes/linkedin-url-lookup.md` for the strict-validation pattern.

Funding / acquisition signals?
  ├─ cargo.enrichBusinessFundingAndAcquisitions (0.5)
  └─ Alt: enrichCrm.getFunding (1)

Tech stack / hiring intent?
  ├─ cargo.enrichBusinessTechnographics (1)
  ├─ theirStack.searchTechnologies (0.5) for catalog-style lookup
  └─ theirStack.searchJobs (0.5) for hiring-intent

Job change detection?
  └─ waterfall.detectJobChange (3) — only credits-based action of this kind in catalog

Reverse-email lookup (email → person + company)?
  └─ FullEnrich.reverseEmailLookup (2)
```

## Waterfall enrichment pattern

When one provider misses, escalate to the next. Run each step only on the rows where the prior step came up empty.

```bash
# Step 1 — try cargo first (cheapest + best for known companies)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records '[{"domain":"acme.com"}, ... ]' \
  --wait-until-finished > /tmp/step1.json

# Step 2 — extract rows where step 1 returned no firmographics, retry with waterfall
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichCompany","config":{}}' \
  --records '<rows from step 1 where firmographics empty>' \
  --wait-until-finished > /tmp/step2.json

# Step 3 — last-resort backfill with peopleDataLabs (3 credits flat)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"enrichCompany","config":{}}' \
  --records '<rows still empty after step 2>' \
  --wait-until-finished > /tmp/step3.json

# Step 4 — coalesce all three into a single enriched dataset
```

Same shape applies for person enrichment (`cargo.enrichProspectDetails` → `waterfall.enrichContact` → `peopleDataLabs.enrichPerson`) and for email lookup (`FullEnrich.findEmail` → `hunter.findEmail` → `peopleDataLabs.enrichPerson`).

## Coalesce pattern (multi-pass enrichment)

When enriching the same record across multiple providers, merge results column-by-column. Prefer the higher-quality source per column:

| Column | Prefer |
|---|---|
| Firmographics (industry, size, hq) | cargo > peopleDataLabs > waterfall |
| Funding / financials | cargo.enrichBusinessFundingAndAcquisitions > enrichCrm.getFunding |
| Technographics | cargo.enrichBusinessTechnographics > theirStack > peopleDataLabs |
| Email | FullEnrich > hunter > peopleDataLabs |
| Phone | FullEnrich > prospeo > waterfall |
| LinkedIn URL | linkedin.findProfileUrl > FullEnrich.reverseEmailLookup |
| Job change signal | waterfall.detectJobChange (only source) |

## Output retrieval — `run download-outputs`

After a batch run, retrieve the actual enriched data with **`cargo-ai orchestration run download-outputs`**, NOT `run download` (which gives you full run records — useful for debugging but inefficient for output extraction).

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  --batch-uuid <uuid> \
  --format json \
  --is-finished
```

Returns `{"url": "..."}` — a signed URL to a CSV/JSON containing only the output node's data with input/output context per record. See [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md#downloading-run-results) for the full reference.

For ad-hoc `action execute` / `action execute-batch` runs (no saved tool), use `--wait-until-finished` and read the response directly. The response shape is documented in [`../../cargo-orchestration/references/response-shapes.md`](../../cargo-orchestration/references/response-shapes.md). Per-node output lives at `runContext.<nodeSlug>` for runs and per-record `output` fields for batches.

## Action shape rules

`kind: "connector"` action: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **`connectorUuid` is NOT in `config`.** The platform resolves the workspace's authenticated connector from `integrationSlug`. See [`../../cargo-orchestration/references/actions.md`](../../cargo-orchestration/references/actions.md).

## Polling guidance

Small runs (< 50 records): use `--wait-until-finished` for ergonomics.

Large runs (>= 100 records): poll. See [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) for retry strategy and rate-limit handling.

## When enrichment misses

Two failure modes:

1. **Coverage gap** — record exists but provider doesn't have data. Walk the waterfall.
2. **Quality issue** — provider returns data but it's wrong. Compare two sources; if they disagree, flag the record for manual review rather than picking one blindly.

Common quality pitfalls:
- Email finders return catch-all emails that look valid but bounce. Always verify with `waterfall.verifyEmail`.
- LinkedIn URL resolvers return profiles for the wrong person with the same name. Use the strict-validation pattern in [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md).
- Job-change signals can show stale data on small companies. Cross-check with the contact's current LinkedIn before acting on `waterfall.detectJobChange` results.
