---
provider: cargo
category: enrichment (native firmographic + signal intelligence)
last-reviewed: 2026-04-27
---

# cargo (native)

Cargo's proprietary enrichment layer. **22 credits-based actions covering firmographics, technographics, funding, ratings, financial metrics, intent signals, and prospect details.** Cheap (most actions 0.5–1 credit) and the canonical source for firmographic data on companies cargo's catalog already covers.

## When to reach for cargo (vs other providers)

- ✅ **Firmographics on a known company**: `enrichBusinessFirmographics` (0.5) — first stop, cheapest comprehensive firmographic action in catalog.
- ✅ **Dedup / canonical-id lookup**: `matchBusiness` / `matchProspect` (0.5) — get a stable `business_id` / `prospect_id` for downstream enrichment.
- ✅ **Multi-axis signals on the same company**: when you want firmographics + funding + technographics + ratings, batch them all against the same `business_id` — cheapest path.
- ✅ **Prospect catalog browsing**: `fetchProspects` / `fetchBusinesses` for "give me companies in country X with size band Y" without going through a third party.
- ❌ **Discovery outside cargo's catalog**: if `matchBusiness` returns no match, fall back to `waterfall.enrichCompany` (1 cred) or `peopleDataLabs.enrichCompany` (3 cred).

## Credits-based actions — Business

| Action | Cost | What it returns |
|---|---|---|
| `matchBusiness` | 0.5 | Resolve a company (by `name`, `domain`) to a cargo `business_id`. **Run this first for any business enrichment.** |
| `enrichBusinessFirmographics` | 0.5 | Industry, size, geo, founded year, headquarters, etc. |
| `enrichBusinessFinancialMetrics` | 0.5 | Revenue band, growth, financial health markers. |
| `enrichBusinessFundingAndAcquisitions` | 0.5 | Funding rounds, investors, M&A history. |
| `enrichBusinessTechnographics` | 1 | Tech stack: languages, frameworks, SaaS apps, infrastructure. |
| `enrichBusinessChallenges` | 1 | Stated business challenges scraped from public material. |
| `enrichBusinessCompetitiveLandscape` | 1 | Named competitors. |
| `enrichBusinessLinkedinPosts` | 2 | Recent LinkedIn posts from the company page. |
| `enrichBusinessRatingsByEmployees` | 1 | Glassdoor-style employee ratings. |
| `enrichBusinessStrategicInsights` | 1 | High-level strategic narrative. |
| `enrichBusinessWebsiteKeywords` | 0.5 | Keywords scraped from the company website. |
| `enrichBusinessWebsiteChanges` | 1 | Recent website / messaging changes. |
| `enrichBusinessWorkforceTrends` | 1 | Headcount trend over time. |
| `fetchBusinesses` | 0.5 | Catalog-style search by `country_code`, `region_country_code`, `company_size`, `company_revenue`, `google_category`, `naics_category`, `linkedin`. |
| `fetchBusinessEvents` | 0.5 | Events on a known business (`event_types`, `timestamp_from`). Useful for "what happened at this company recently?" signal queries. |
| `fetchBusinessStatistics` | 1 | Aggregated statistics across the catalog filter. |

## Credits-based actions — Prospect

| Action | Cost | What it returns |
|---|---|---|
| `matchProspect` | 0.5 | Resolve a person (by `email`, `phone_number`, `full_name + company_name`, `linkedin`) to a cargo `prospect_id`. **Run this first for any person enrichment.** |
| `enrichProspectDetails` | 2 | Title, role, location, contact details. |
| `enrichProspectLinkedinProfile` | 2 | Full LinkedIn profile snapshot (work history, education, skills). |
| `enrichProspectLinkedinPosts` | 2 | Recent LinkedIn posts authored by the prospect. |
| `fetchProspects` | 0.5 | Catalog-style search by `business_id`, `job_level`, `job_department`, `job_title`, geo. |
| `fetchProspectEvents` | 0.5 | Events on a known prospect (`event_types`, `timestamp_from`). Job changes, posts, role changes. |

## Patterns

### Pattern A — Firmographics on a domain list (cheapest)

```bash
# Step 1 — match domains to business_ids
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"matchBusiness","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished

# Step 2 — enrich firmographics on the matched IDs
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"enrichBusinessFirmographics","config":{}}' \
  --records '[{"business_id":"<uuid>"},{"business_id":"<uuid>"}]' \
  --wait-until-finished
```

### Pattern B — Multi-axis enrichment on a single company

Run several enrichBusiness* actions in parallel (each independent batch):

```bash
for slug in enrichBusinessFirmographics enrichBusinessFundingAndAcquisitions enrichBusinessTechnographics; do
  cargo-ai orchestration action execute \
    --action "$(jq -nc --arg s "$slug" '{kind:"connector",integrationSlug:"cargo",actionSlug:$s,config:{}}')" \
    --data '{"business_id":"<uuid>"}' \
    --wait-until-finished &
done
wait
```

### Pattern C — Prospect events monitoring

```bash
# Get the last 30 days of events (job changes, posts) for a prospect
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"cargo","actionSlug":"fetchProspectEvents","config":{}}' \
  --data '{
    "prospect_id":"<uuid>",
    "event_types":["job_change","linkedin_post"],
    "timestamp_from":"2026-03-27T00:00:00Z"
  }' \
  --wait-until-finished
```

## Common pitfalls

- **Always run `matchBusiness` / `matchProspect` first.** All other cargo enrichments take a `business_id` / `prospect_id`, not a domain or email. Skipping the match step → "missing required field" errors.
- **`matchBusiness` won't match every domain.** For generic names ("acme" without context), or very small / private companies, the match may return null. Use the fallback chain (waterfall → peopleDataLabs).
- **Don't run all 12 enrich actions per company.** Pick the 2–4 that map to your ICP signals. Running everything is 11 credits per company, mostly wasted.
- **Cost adds up at scale.** For 500 companies × 4 enrichments × 1 credit average = 2,000 credits. Sample on 10 first to validate the data is what you need before fanning out.

## Action shape

`{"kind":"connector","integrationSlug":"cargo","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`** — single workspace connector resolves automatically.
