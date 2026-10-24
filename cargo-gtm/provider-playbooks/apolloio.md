---
provider: apolloio
category: enrichment
last-reviewed: 2026-07-09
---

# apolloio (Apollo.io)

Apollo-anchored person and organization enrichment. **Four of its eleven actions are credits-based**: `enrichPerson` (1, or 9 with phone reveal), `enrichOrganization` (1), `searchPeople` (free, or 1 per person with `shouldEnrich: true`) and `searchOrganizations` (0.01 per organization); the rest (contact CRUD, contact search, sequences, email accounts) runs **only on your own Apollo API key** connector. The enrich pair is **in the priority stack** ([`../SKILL.md`](../SKILL.md) §5) as the **niche-coverage ENRICH rung** — promoted per-batch when a pilot shows Apollo hits where `aiArk` (0.1) and `waterfall` (2) miss, its investor coverage in [`../recipes/portfolio-prospecting.md`](../recipes/portfolio-prospecting.md) being the standing example. Stack membership is not a licence to route generic enrichment here first: `aiArk` → `waterfall` still leads the default chain, and Apollo runs on the residue.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichPerson` | 1 (**9** if `revealPhoneNumber: true`) | `parameters` object (`first_name, last_name, name, organization_name, email, domain, linkedin_url, id, email_md5, email_sha256`), `revealPersonalEmails`, `revealPhoneNumber` | Person enrichment when Apollo coverage beats the stack for the niche. |
| `enrichOrganization` | 1 | at least one of `domain`, `linkedin_url`, `name`, `website` | Company enrichment when the cheaper domain rungs miss and LinkedIn doesn't have it. |
| `searchPeople` | **0** (search only), **1 / person** with `shouldEnrich: true` | `filters` (required: `person_titles, include_similar_titles, person_seniorities, person_locations, organization_locations, organization_num_employees_ranges, q_organization_domains_list, organization_ids, revenue_range, currently_using_any_of_technology_uids, q_keywords, contact_email_status, prospected_by_current_team`, plus job-posting filters); `shouldEnrich`; `limit` (default 10, max 100) | Search Apollo's people database. Results are partial (obfuscated last name, `has_email` flags) unless `shouldEnrich` turns every match into a full profile. |
| `searchOrganizations` | **0.01 / returned organization** | `filters` (required: `q_organization_name, q_organization_domains_list, organization_ids, q_organization_keyword_tags, organization_locations, organization_not_locations, organization_num_employees_ranges, revenue_range, latest_funding_amount_range, total_funding_range, latest_funding_date_range, currently_using_any_of_technology_uids`, plus job-posting filters); `limit` (default 10, max 100) | Firmographic, funding and technology company search. |

## Own-API-key actions (no credits — require your Apollo account connector)

| Action | What it does |
|---|---|
| `searchContacts` | Search contacts saved in your Apollo account (`filters` required). |
| `createContact` / `updateContact` / `upsertContact` | Contact CRUD in your Apollo account (`email` required for create/upsert, `id` for update; field `mappings` + `customMappings`). |
| `addContactToSequence` | Add a contact to a sequence (`sequenceId`, `contactId`, `sendEmailFromEmailAccountId` required). |
| `removeContactFromSequence` | Remove a contact from a sequence (`sequenceId`, `contactId`, `mode` required). |
| `searchEmailAccounts` | List email accounts (needed to get `sendEmailFromEmailAccountId` for sequencing). |

These consume your Apollo plan's quota, not cargo credits — recipes stay on credits-based actions, so treat this block as an **activation surface for users who already run Apollo sequences** (sequencer handoff in [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md)).

## What it's for

- ✅ **Niche-coverage person enrichment** — 1 credit when a pilot shows Apollo hits where `aiArk.enrichPerson` (0.1) / `waterfall.enrichContact` (2) miss.
- ✅ **Domain → company fallback** — `enrichOrganization` (1) after `aiArk.enrichCompany` (0.01) and `linkedin.enrichCompanyFromDomain` (0.5) come back empty.
- ✅ **Sequencer handoff** — send verified leads into Apollo sequences via the own-key actions when the user's outbound already lives there.
- ✅ **Sourcing on credits** — `searchPeople` is free without `shouldEnrich` (partial records) and `searchOrganizations` bills 0.01 per organization; compare against `salesNavigator` (0.2) or `aiArk` (0.01–0.05) on a pilot.

## Patterns

### Pattern A — Person enrichment (fallback rung)

```bash
# Only on rows the priority stack missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"apolloio","actionSlug":"enrichPerson"}' \
  --records '[
    {"parameters":{"first_name":"Alice","last_name":"Smith","organization_name":"Acme"}},
    {"parameters":{"linkedin_url":"https://linkedin.com/in/bobjones","domain":"globex.com"}}
  ]' \
  --wait-until-finished
```

Identifiers nest under `parameters` and are **snake_case**. Any combination works — LinkedIn URL + domain gives the best match rate. Hashed-email inputs (`email_md5`, `email_sha256`) are accepted when you only hold a hash.

### Pattern B — Domain → organization

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"apolloio","actionSlug":"enrichOrganization"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

Any one of `domain`, `linkedin_url`, `name` or `website` is accepted (at least one is required); `domain` is the most reliable match.

## Common pitfalls

- **`revealPhoneNumber: true` multiplies the price by nine** (1 → 9). Gate it like any phone action — and the phone chain starts cheaper at `prospeo.findPhone` (3, [`../references/stage-action-map.md`](../references/stage-action-map.md)), so reveal only when you're enriching the person anyway. `revealPersonalEmails` does **not** change the cost.
- **Own-key actions fail without an Apollo connector.** The seven non-credits actions need a connector authenticated with your Apollo `apiKey` — they can't run on cargo's managed connection.
- **Rate limit: 400 calls/hour** (spread) on your own Apollo key — the tightest in this group; large batches stretch over hours, so prefer the stack for volume enrichment. On cargo's managed key the enrich actions share 1,000/minute and the two searches share 10,000/hour.
- **Sequencing needs three IDs** — `sequenceId`, `contactId` (create/upsert the contact first), and `sendEmailFromEmailAccountId` (from `searchEmailAccounts`).

## Anti-patterns

- **Top-level identifier fields on `enrichPerson`.** `first_name` etc. must sit inside `parameters` — other top-level keys (except the two reveal flags) are refused by `action execute` (`Unknown field: first_name`) and ignored inside a workflow node.
- **Reveal flags at scale "to be safe".** Found personal emails and phones still flow through VERIFY (`waterfall.verifyEmail`, 0.1) — revealing on unqualified rows is pure spend.

## Position in the waterfall

- `enrichPerson` — **ENRICH (person), fallback rung** beside the stack's `aiArk` → `waterfall` → `peopleDataLabs` chain; promote it for a batch only when the pilot shows better niche coverage.
- `enrichOrganization` — **ENRICH (company), fallback rung** after `aiArk.enrichCompany` (0.01), `companyEnrich` (0.25) and `linkedin` (0.25–0.5).
- Own-key sequence actions — post-VERIFY **activation**, outside the credits spine.

## Recurring use

- **Scheduled sourcing:** `searchPeople` / `searchOrganizations` can feed a scheduled sourcing tool (on credits, or on your Apollo plan's quota with an own key); dedup re-pulls against the workspace model (with an own key, the `prospected_by_current_team` filter also works), and keep `shouldEnrich` off until rows are deduped.
- **In-play gate:** `enrichPerson` only where the target contact field (`email`) is still empty; `enrichOrganization` only where firmographics are empty. Never leave `revealPhoneNumber: true` on a play node — every re-evaluated row bills 9 instead of 1.
- **Stable data, tight ceiling:** enrichment output doesn't decay, and the 400 calls/hour limit means an ungated recurring batch both re-bills and stalls the queue.

## Action shape

`{"kind":"connector","integrationSlug":"apolloio","actionSlug":"<slug>"}`. **No `connectorUuid` in `config`.**
