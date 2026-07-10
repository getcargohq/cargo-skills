---
provider: contactOut
category: contact
last-reviewed: 2026-07-09
---

# contactOut (ContactOut)

LinkedIn-URL-anchored contact info — emails and phones from a profile URL, plus a filter-based people/company search. **Mid-tier fallback**: reach for it when the priority stack (cargo native → FullEnrich → waterfall) misses, or for its free company-domain lookup.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrich` (company) | **0** | `objectType:"company"`, `companyDomain` | Free company profile from a domain (size, industry, revenue, funding, …). |
| `enrich` (contact) | 1 / 2 / 3 | `objectType:"contact"`, `linkedinUrl`, `includePhone`, `emailType` | Contact from a LinkedIn URL. 1 = profile only; 2 = + emails (`emailType` set); 3 = `includePhone: true`. |
| `search` | 1 or 3 **per item** | `objectType:"people"|"company"`, `filters`, `dataTypes`, `revealInfo` | People/company search. People: 1/item; `revealInfo: true` (emails + phones in response) = 3/item. |

Cost is driven by the **config you request**, not the data returned: asking for phone (`includePhone: true`) prices the contact enrich at 3 even before you know a phone exists.

## What it's for

- ✅ **Emails/phone when you already hold the LinkedIn URL** — `enrich` is keyed on `linkedinUrl` only; no name/domain fallback inputs.
- ✅ **Free company lookup** — `enrich` with `objectType: "company"` costs 0 credits and returns firmographics (`size`, `industry`, `revenue`, `employees`, `funding`, …).
- ✅ **Phone at the prospeo price point** — contact enrich with `includePhone` is 3, the same as `prospeo.findPhone`, and returns emails in the same call.
- ❌ **Primary people sourcing** — `search` at 1/item (3/item revealed) vs `salesNavigator.searchLeads` at 0.02. Mid-tier when other sources miss (see [`../references/stage-action-map.md`](../references/stage-action-map.md)).
- ❌ **Enrichment without a LinkedIn URL** — resolve the URL first ([`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)) or use `waterfall.enrichContact` (2), which accepts name/domain/email.

## Patterns

### Pattern A — Contact enrich from a LinkedIn URL

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"contactOut","actionSlug":"enrich","config":{}}' \
  --data '{
    "objectType": "contact",
    "linkedinUrl": "https://linkedin.com/in/alicesmith",
    "includePhone": false,
    "emailType": ["work"]
  }' \
  --wait-until-finished
```

`emailType` takes `"work"` and/or `"personal"`. Always pass `includePhone` and `emailType` explicitly — the contact branch of the schema requires them, and each one you add moves the price tier (base 1 → +emails 2 → +phone 3).

### Pattern B — Free company profile

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"contactOut","actionSlug":"enrich","config":{}}' \
  --data '{"objectType":"company","companyDomain":"acme.com"}' \
  --wait-until-finished
```

Zero credits. Worth a probe before paying `waterfall.enrichCompany` (1) on unmatched-by-cargo companies.

### Pattern C — People search, reveal only the keepers

```bash
# Step 1 — search WITHOUT revealing (1/item): filter and shortlist first
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"contactOut","actionSlug":"search","config":{}}' \
  --data '{
    "objectType": "people",
    "filters": [
      {"name": "job_title", "values": ["VP Sales", "Head of Sales"]},
      {"name": "location", "values": ["Germany"]},
      {"name": "current_titles_only", "booleanValue": true}
    ],
    "dataTypes": ["work_email"]
  }' \
  --wait-until-finished
# Step 2 — enrich only the shortlist via Pattern A (or re-search with revealInfo: true)
```

The `filters` array is discriminated by `name`: list-type filters (`skills`, `education`, `location`, `company`, `domain`, `job_title`) take `values`; catalog filters (`industry`, `company_size`, `years_of_experience`, `years_in_current_role`) take `autocompleteValues`; toggles (`current_titles_only`, `current_company_only`, `include_related_job_titles`) take `booleanValue`; `name` (person name) takes `value`. `dataTypes` (`personal_email` / `work_email` / `phone`) filters to profiles that *have* that data without revealing it.

## Common pitfalls

- **`revealInfo: true` on a broad search.** Search is billed **per item returned** — 3/item revealed. Search unrevealed (1/item), shortlist, then reveal or enrich only the keepers.
- **Wrong value key for a filter.** Putting `values` where the filter wants `autocompleteValues` (or vice versa) fails validation — match the key to the filter name per the table above.
- **`includePhone: true` "just in case."** It triples the enrich price and deducts phone credits whether or not you need the number. Default `false`; escalate only for phone-first plays.

## Anti-patterns

- **contactOut for bulk sourcing.** At 1–3/item, a 1,000-row search costs 1,000–3,000 credits; `salesNavigator.searchLeads` covers the same B2B ground at 0.02. Use contactOut search only when LinkedIn-anchored and priority sources miss.
- **Skipping verification.** Returned emails still go through `waterfall.verifyEmail` (0.1) — or `zeroBounce.verifyEmail` (0.1) as a second opinion — before any send.

## Position in the waterfall

- Contact enrich — **mid rung** of the email/phone chain: after cargo native + FullEnrich, alongside `waterfall.enrichContact` (2); its `includePhone` tier (3) sits at the `prospeo.findPhone` price, below FullEnrich (6) and waterfall (7).
- `search` — coverage fallback when salesNavigator/icypeas miss the segment.

## Action shape

`{"kind":"connector","integrationSlug":"contactOut","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
