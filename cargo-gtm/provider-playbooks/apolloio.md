---
provider: apolloio
category: enrichment
last-reviewed: 2026-07-09
---

# apolloio (Apollo.io)

Apollo-anchored person and organization enrichment. Only **two of its eleven actions are credits-based** — `enrichPerson` (1, or 3 with phone reveal) and `enrichOrganization` (1); everything else (searches, contact CRUD, sequences) runs **only on your own Apollo API key** connector. Use the credits pair as an ENRICH alternative when Apollo's coverage is stronger for the niche ([`../references/alternatives.md`](../references/alternatives.md)) — e.g. its investor coverage in [`../recipes/portfolio-prospecting.md`](../recipes/portfolio-prospecting.md). Don't route generic enrichment here first: the priority stack (`cargo` native → `waterfall`) leads.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichPerson` | 1 (**3** if `revealPhoneNumber: true`) | `parameters` object (`first_name, last_name, organization_name, email, domain, linkedin_url, id, email_md5, email_sha256`), `revealPersonalEmails`, `revealPhoneNumber` | Person enrichment when Apollo coverage beats the stack for the niche. |
| `enrichOrganization` | 1 | `domain` (required) | Company enrichment when cargo's match misses and LinkedIn doesn't have it. |

## Own-API-key actions (no credits — require your Apollo account connector)

| Action | What it does |
|---|---|
| `searchPeople` | Search Apollo's people database (`filters` required: `person_titles, person_seniorities, person_locations, organization_locations, organization_num_employees_ranges, q_organization_domains_list, q_keywords, contact_email_status, prospected_by_current_team`; `shouldEnrich`, `limit` — default 10, max 100). |
| `searchOrganizations` | Search organizations (`filters` required: `q_organization_name, q_organization_keyword_tags, organization_locations, organization_not_locations, organization_num_employees_ranges, prospected_by_current_team`; `limit`). |
| `searchContacts` | Search contacts saved in your Apollo account (`filters` required). |
| `createContact` / `updateContact` / `upsertContact` | Contact CRUD in your Apollo account (`email` required for create/upsert, `id` for update; field `mappings` + `customMappings`). |
| `addContactToSequence` | Add a contact to a sequence (`sequenceId`, `contactId`, `sendEmailFromEmailAccountId` required). |
| `removeContactFromSequence` | Remove a contact from a sequence (`sequenceId`, `contactId`, `mode` required). |
| `searchEmailAccounts` | List email accounts (needed to get `sendEmailFromEmailAccountId` for sequencing). |

These consume your Apollo plan's quota, not cargo credits — recipes stay on credits-based actions, so treat this block as an **activation surface for users who already run Apollo sequences** (sequencer handoff in [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md)).

## What it's for

- ✅ **Niche-coverage person enrichment** — 1 credit when a pilot shows Apollo hits where `cargo.enrichProspectDetails` (2) / `waterfall.enrichContact` (2) miss.
- ✅ **Domain → company fallback** — `enrichOrganization` (1) after cargo's match misses and `linkedin.enrichCompanyFromDomain` (0.5) comes back empty.
- ✅ **Sequencer handoff** — send verified leads into Apollo sequences via the own-key actions when the user's outbound already lives there.
- ❌ **Sourcing on credits** — `searchPeople` / `searchOrganizations` are own-key only; credits-based sourcing is `salesNavigator` (0.02–0.05).

## Patterns

### Pattern A — Person enrichment (fallback rung)

```bash
# Only on rows the priority stack missed
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"apolloio","actionSlug":"enrichPerson","config":{}}' \
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
  --action '{"kind":"connector","integrationSlug":"apolloio","actionSlug":"enrichOrganization","config":{}}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

`domain` is the only accepted input — no name- or LinkedIn-based lookup on this action.

## Common pitfalls

- **`revealPhoneNumber: true` triples the price** (1 → 3). Gate it like any phone action — and the phone chain starts cheaper at `prospeo.findPhone` (3, [`../references/stage-action-map.md`](../references/stage-action-map.md)), so reveal only when you're enriching the person anyway. `revealPersonalEmails` does **not** change the cost.
- **Own-key actions fail without an Apollo connector.** The nine non-credits actions need a connector authenticated with your Apollo `apiKey` — they can't run on cargo's managed connection.
- **Rate limit: 400 calls/hour** (spread) — the tightest in this group; large batches stretch over hours, so prefer the stack for volume enrichment.
- **Sequencing needs three IDs** — `sequenceId`, `contactId` (create/upsert the contact first), and `sendEmailFromEmailAccountId` (from `searchEmailAccounts`).

## Anti-patterns

- **Top-level identifier fields on `enrichPerson`.** `first_name` etc. must sit inside `parameters` — top-level keys (except the two reveal flags) are ignored.
- **Reveal flags at scale "to be safe".** Found personal emails and phones still flow through VERIFY (`waterfall.verifyEmail`, 0.1) — revealing on unqualified rows is pure spend.

## Position in the waterfall

- `enrichPerson` — **ENRICH (person), fallback rung** beside the stack's `cargo` → `waterfall` → `peopleDataLabs` chain; promote it for a batch only when the pilot shows better niche coverage.
- `enrichOrganization` — **ENRICH (company), fallback rung** after `cargo.enrichBusinessFirmographics` (0.5) and `linkedin` (0.25–0.5).
- Own-key sequence actions — post-VERIFY **activation**, outside the credits spine.

## Action shape

`{"kind":"connector","integrationSlug":"apolloio","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
