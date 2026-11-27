# Enriching and researching

How to enrich companies and contacts on Cargo. Covers the native contact tools, waterfall enrichment, fallback chains, signal extraction, and output retrieval.

## Contact data: the native tools first

Emails, phones and LinkedIn-from-email lookups run on the workspace's preset tools by default, as [`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default) rules. They are Cargo-maintained waterfalls: several providers in a tuned order, verification built in, and extended as new sources prove out, so their coverage is well above any single provider's. Address each by template slug; the action resolves to the workspace's own copy.

```bash
# Work email from name + domain, or from a LinkedIn URL (Find email, 1.1 to 4 per hit)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"email_waterfall"}' \
  --records '[{"firstName":"Jane","lastName":"Doe","companyDomain":"acme.com"},{"linkedinUrl":"https://www.linkedin.com/in/janedoe"}]' \
  --limit 20 --wait-until-finished

# LinkedIn profile from a personal email (Find LinkedIn URL from email, 1 to 3)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"find_linkedin_url_from_personal_email"}' \
  --records '[{"email":"jane.doe@gmail.com","firstName":"Jane","lastName":"Doe"}]' \
  --limit 20 --wait-until-finished

# Phone, only when the user asked for phones (Find phone, 3 to 7; needs a LinkedIn URL)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"phone_waterfall"}' \
  --records '[{"linkedinUrl":"https://www.linkedin.com/in/janedoe"}]' \
  --limit 20 --wait-until-finished
```

Fetch rows with `cargo-ai orchestration batch download --uuid <batch-uuid>`: the outputs land as `cargo_email`, `cargo_linkedin_url`, `cargo_phone`, empty where nothing was found. The other presets follow the same shape: `work_email_from_personal` (`email` in, `workEmail` and `linkedinUrl` out, 1 to 8.25), `work_email_from_linkedin` (`linkedinUrl` in, `email` out, 0.5 to 3) and `email_validator` (Verify email: `email` in, `status` and `is_safe` out, 0.2).

Inputs are camelCase and a misspelled one (`linkedin_url`, `first_name`) is refused or dropped, so copy the names above. Find email returns only addresses that passed zeroBounce as valid (catch-alls excluded unless `returns_catchalls: true`), so its output needs no second verification. Phone needs a LinkedIn URL: resolve it first ([`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)).

**Leaving the default.** A single provider (`aiArk`, `FullEnrich`, `prospeo`, `hunter`, ...) runs only when the user names one, explicitly asks for the cheapest path, the tool is missing from the workspace (`cargo-ai orchestration action get-output-schema --action '{"kind":"tool","templateSlug":"<slug>"}'` errors; it is free), or the row lacks the tool's input and cannot get it. Say which exception applies. The provider ladders below are for those cases.

## Default chain by enrichment goal

```
Goal → which provider chain?

Firmographics on a known company (industry, size, geo, revenue, …)?
  ├─ aiArk.enrichCompany (0.01) — domain or LinkedIn URL, cheapest in catalog
  ├─ Thin result: companyEnrich.enrichByDomain (0.25) — fuller field set
  ├─ Fallback: waterfall.enrichCompany (1) / apolloio.enrichOrganization (1)
  └─ Heavy backfill: peopleDataLabs.enrichCompany (3)

Contact details on a known person (title, location, social, …)?
  ├─ LinkedIn URL in hand: aiArk.enrichPerson (0.1) — full profile (its email is not the email of record)
  ├─ No URL: waterfall.enrichContact (2) — keys on email or name + domain
  ├─ Niche coverage (investor-backed, portfolio): apolloio.enrichPerson (1)
  └─ Heavy backfill: peopleDataLabs.enrichPerson (3)

Find an email (name + domain, or a LinkedIn URL)?
  ├─ Find email tool, templateSlug email_waterfall (1.1–4)   ← default, always
  └─ Exception only (user named a provider / asked for cheapest / tool missing):
       aiArk.enrichPerson (0.1, LinkedIn URL) → FullEnrich.findEmail (1)
       → hunter.findEmail (0.5) / icypeas.findEmail (0.1) on the residue

Work email from a personal email?
  └─ Find work email from personal email tool, work_email_from_personal (1–8.25)   ← default

Verify an email you brought in (Find email output is already verified)?
  ├─ Verify email tool, templateSlug email_validator (0.2)   ← default
  └─ Exception only: waterfall.verifyEmail (0.1) / icypeas.verifyEmail (0.01) on a large list
     when the user asked for the cheapest path

Find a phone number (explicit request only)?
  ├─ Find phone tool, templateSlug phone_waterfall (3–7, LinkedIn URL in)   ← default
  └─ Exception only: aiArk.findMobilePhone (0.5, mobile) → prospeo.findPhone (3)
       → FullEnrich.findPhone (6); FullEnrich.findPhone also takes name + domain
       for rows with no LinkedIn URL

Resolve a LinkedIn URL from a personal email?
  ├─ Find LinkedIn URL from email tool, find_linkedin_url_from_personal_email (1–3)   ← default
  └─ Exception only: aiArk.reverseLookup (0.05) / FullEnrich.reverseEmailLookup (1)

Resolve a LinkedIn URL from name + company?
  └─ linkedin.findProfileUrl (0.25) → linkedin.enrichProfile (0.25) for validation
     See `../recipes/linkedin-url-lookup.md` for the strict-validation pattern.

Funding / acquisition signals?
  └─ enrichCrm.getFunding (1) — only credits-based funding action in the catalog

Tech stack / hiring intent?
  ├─ builtwith.getDomainSummary (0) — free, always run first on a known domain
  ├─ theirStack.searchTechnologies (0.5) for catalog-style lookup
  ├─ builtwith.enrichDomain (1) on the rows the free summary didn't settle
  └─ theirStack.searchJobs (0.5) for hiring-intent

Job change detection?
  └─ waterfall.detectJobChange (3) — only credits-based action of this kind in catalog

Reverse-email lookup (work email → person + company profile)?
  ├─ aiArk.reverseLookup (0.05) — email *or* phone → full profile
  └─ For a personal email → LinkedIn URL, use the Find LinkedIn URL from email tool above
```

## Waterfall enrichment pattern

When one provider misses, escalate to the next. Run each step only on the rows where the prior step came up empty.

```bash
# Step 1 — try aiArk first (0.01, cheapest company enrich in the catalog)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records '[{"domain":"acme.com"}, ... ]' \
  --wait-until-finished > /tmp/step1.json

# Step 2 — extract rows where step 1 returned no firmographics, retry with waterfall
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"waterfall","actionSlug":"enrichCompany"}' \
  --records '<rows from step 1 where firmographics empty>' \
  --wait-until-finished > /tmp/step2.json

# Step 3 — last-resort backfill with peopleDataLabs (3 credits flat)
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"peopleDataLabs","actionSlug":"enrichCompany"}' \
  --records '<rows still empty after step 2>' \
  --wait-until-finished > /tmp/step3.json

# Step 4 — coalesce all three into a single enriched dataset
```

Same shape applies for person enrichment (`aiArk.enrichPerson` where a LinkedIn URL exists → `waterfall.enrichContact` → `apolloio.enrichPerson` → `peopleDataLabs.enrichPerson`). Email lookup does not need it: the Find email tool is this pattern already, maintained by Cargo. Build an email ladder by hand (`FullEnrich.findEmail` → `hunter.findEmail` → `peopleDataLabs.enrichPerson`) only under a stated exception.

## Coalesce pattern (multi-pass enrichment)

When enriching the same record across multiple providers, merge results column-by-column. Prefer the higher-quality source per column:

| Column | Prefer |
|---|---|
| Firmographics (industry, size, hq) | aiArk > companyEnrich > peopleDataLabs > waterfall > apolloio |
| Funding / financials | enrichCrm.getFunding (only source) |
| Technographics | builtwith.getDomainSummary (free) > theirStack > builtwith.enrichDomain > peopleDataLabs |
| Email | Find email tool (`email_waterfall`) > any single provider |
| Phone | Find phone tool (`phone_waterfall`) > any single provider |
| LinkedIn URL | linkedin.findProfileUrl (from name + company) / Find LinkedIn URL from email tool (from a personal email) |
| Job change signal | waterfall.detectJobChange (only source) |

## Output retrieval — `run download-outputs`

After a batch run, retrieve the actual enriched data with **`cargo-ai orchestration run download-outputs`**, NOT `run download` (which gives you full run records — useful for debugging but inefficient for output extraction).

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  --batch-uuid <uuid> \
  --format json
```

Returns `{"url": "..."}` — a signed URL to a CSV/JSON containing only the output node's data with input/output context per record. See [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md#downloading-run-results) for the full reference.

For ad-hoc `action execute` runs (no saved tool), use `--wait-until-finished` and read the run in the response; the shape is documented in [`../../cargo-orchestration/references/response-shapes.md`](../../cargo-orchestration/references/response-shapes.md). `action execute-batch --wait-until-finished` prints the batch object only, not rows: fetch them with `cargo-ai orchestration batch download --uuid <batch-uuid>`, which returns `{"url": "<signed CSV URL>"}`. The CSV keeps each input record's columns and adds every top-level output key as `cargo_<key>` (nested objects become dotted columns such as `cargo_person.company_name`; a search's result array lands in one `cargo` column); failed rows keep only the input columns.

## Action shape rules

`kind: "connector"` action: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}`. **`connectorUuid` is NOT in `config`.** The platform resolves the workspace's authenticated connector from `integrationSlug`. See [`../../cargo-orchestration/references/examples/actions.md`](../../cargo-orchestration/references/examples/actions.md).

## Polling guidance

Small runs (< 50 records): use `--wait-until-finished` for ergonomics.

Large runs (>= 100 records): poll. See [`../../cargo-orchestration/references/polling.md`](../../cargo-orchestration/references/polling.md) for retry strategy and rate-limit handling.

## When enrichment misses

Two failure modes:

1. **Coverage gap** — record exists but provider doesn't have data. Walk the waterfall.
2. **Quality issue** — provider returns data but it's wrong. Compare two sources; if they disagree, flag the record for manual review rather than picking one blindly.

Common quality pitfalls:
- Single-provider email finders return catch-all emails that look valid but bounce. Verify what they return with the Verify email tool (`email_validator`); Find email's own output already passed verification.
- LinkedIn URL resolvers return profiles for the wrong person with the same name. Use the strict-validation pattern in [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md).
- Job-change signals can show stale data on small companies. Cross-check with the contact's current LinkedIn before acting on `waterfall.detectJobChange` results.
