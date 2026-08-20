---
provider: proxycurl
category: enrichment (LinkedIn-derived, deep filters)
last-reviewed: 2026-08-20
---

# proxycurl (ProxyCurl)

Two actions over LinkedIn-derived data: `enrich` (**1 credit fixed**) and `search` (**1 credit per item returned**). Both are expensive for what they do — `salesNavigator.searchLeads` sources at 0.02/record and `aiArk.enrichPerson` returns a profile *plus a verified email* at 0.1.

So the whole playbook is one question: **does this need a filter no cheaper rung can express?** Usually it doesn't — `aiArk.searchPeople` (0.05/record) already filters on education, degree, school, skills, tenure in role, total experience, and the employer's funding. Check there first; the list of things only proxycurl can do is short.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrich` | 1 fixed | `objectType` (`person` \| `company` \| `role` \| `job`) + `filters[]`, or `url` for `job` | Resolve one entity from attribute filters rather than a URL. |
| `search` | **1 / item** | `objectType` (`person` \| `company`) + `filters[]` + `limit` | Search on LinkedIn attributes the other providers don't filter on. |

`enrich` is filter-based, not URL-based — that's what separates it from `linkedin.enrichProfile` (0.25) and `aiArk.enrichPerson` (0.1), which both need the profile URL you may not have. Its `objectType: "role"` variant (`role` + `company_name`) answers "who holds this title at this company" without a URL at all.

Rate limited to 300 calls per minute.

## What only this provider filters on

`search --object-type person` takes a long filter list, and **most of it is available cheaper elsewhere**. What is genuinely unique here:

- **Free-text profile matching** — `headline`, `summary`, `current_job_description`, `past_job_description`. Nothing else in the catalog searches the prose of a profile.
- **LinkedIn-native affinities** — `linkedin_groups`, `interests`, `languages`.
- **Exact list membership** — `public_identifier_in_list` / `public_identifier_not_in_list`. The exclusion side is the one that pays for itself: it stops you buying people you already own.
- **Absolute date bounds on role start** — `current_role_before` / `current_role_after` ("started this role after 2026-05-01"), where `aiArk` expresses tenure as a *duration* (`min/max_current_job_years`). Use proxycurl when the boundary is a date, aiArk when it is a length.
- **Seat resolution without a URL** — `enrich --object-type role` (`role` + `company_name`) answers "who holds this title here" from nothing but the seat.

Everything else has a cheaper home. **Education** (`education`, `school_id_or`, `degree_or`), **skills**, **tenure length**, **total experience**, and the **employer's funding** are all `aiArk.searchPeople` filters at **0.05/record** — 20x cheaper. Title, company, seniority, geography and headcount are `salesNavigator.searchLeads` at **0.02** — 50x cheaper.

## Cost math before you run anything

`search` bills **per item returned**, and `limit` is the bill:

| `limit` | Cost |
|---|---|
| 10 | 10 |
| 25 | 25 |
| 100 | 100 |

100 records here is 100 credits; the same 100 from `salesNavigator.searchLeads` is 2. Set `limit` to what you will act on, quote it to the user before running, and treat any `search` over ~25 as needing explicit approval — [`../references/cost-discipline.md`](../references/cost-discipline.md) §1.

## Patterns

### Pattern A — Match on what a profile actually says

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"search","config":{}}' \
  --data '{
    "objectType": "person",
    "filters": [
      {"name": "current_role_title", "value": "VP Engineering"},
      {"name": "current_job_description", "value": "platform migration"},
      {"name": "public_identifier_not_in_list", "values": ["janedoe", "johnsmith"]}
    ],
    "limit": 10
  }' \
  --wait-until-finished
```

10 credits for 10 records. The job-description match is the part nothing else does; `public_identifier_not_in_list` keeps you from re-buying people already in the model. For an **alumni** query, go to `aiArk.searchPeople` (`school_id_or` / `degree_or`) at 0.05 instead — 20x cheaper for the same cut.

### Pattern B — New-in-role, tenure-bounded

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"search","config":{}}' \
  --data '{
    "objectType": "person",
    "filters": [
      {"name": "current_role_title", "value": "Head of RevOps"},
      {"name": "current_role_after", "value": "2026-05-01"},
      {"name": "current_company_employee_count_min", "value": "200"}
    ],
    "limit": 15
  }' \
  --wait-until-finished
```

`current_role_after` takes an **absolute date**, which is what makes this one worth paying for: `aiArk.searchPeople` can say "under 1 year in role" (`max_current_job_years`) but not "since the quarter started". For *monitoring* job changes on people you already track, `waterfall.detectJobChange` (3/contact) is the right instrument — see [`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md). This is the net-new side.

### Pattern C — Resolve a role without a URL

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"enrich","config":{}}' \
  --data '{
    "objectType": "role",
    "filters": [
      {"name": "role", "value": "Chief Financial Officer"},
      {"name": "company_name", "value": "Acme Corp"}
    ]
  }' \
  --wait-until-finished
```

1 credit, flat. Compare against `linkedin.findProfileUrl` (0.25) when you already have a person's name — that is 4x cheaper and the better first rung. `enrich --object-type role` is for when you have the *seat*, not the person.

## Common pitfalls

- **`value` where the filter wants `autocompleteValue`.** Location, country, industry, and company-type filters take `autocompleteValue`, not `value` — the schema is an `anyOf` and the wrong key is a validation failure, not a silent miss. Resolve the accepted values first:
  ```bash
  cargo-ai connection connector autocomplete \
    --connector-uuid <uuid> --slug listFilterValues \
    --params '{"filterName":"current_company_industry"}' --value "software"
  ```
- **Leaving `limit` unset or large.** Per-item billing turns an exploratory query into a three-figure charge. Always set it.
- **Using `search` to count.** It bills for what it returns. `aiArk.countPeople` / `aiArk.countCompanies` are **free** — size the audience there first, then decide whether to pay for records.
- **Paying here for a filter aiArk has.** Education, degree, school, skills, tenure length, total experience, employer funding: all `aiArk.searchPeople` at 0.05. Check its filter list before opening this one.
- **Not deduping.** `public_identifier_not_in_list` exists so you don't pay 1 credit each for people already in the model. Pass the identifiers you hold.

## Anti-patterns

- **proxycurl as the default sourcing rung.** 1/record against `salesNavigator.searchLeads` at 0.02 and `icypeas.findPeople` at 0.02/100. A 500-lead pull is 500 credits here and 10 there.
- **Per-row `enrich` across a segment.** 1 credit a row where `aiArk.enrichPerson` is 0.1 and also returns a verified email. Only defensible where the row has no LinkedIn URL and no email — and even then, price `waterfall.enrichContact` (2, multi-source) against it.
- **Emailing straight off a `search`.** These are attribute matches, not a qualified audience. The basis/suppression/relevance checks in [`../references/acceptable-use.md`](../references/acceptable-use.md) §3 still gate the outreach step — an alumni filter is not a lawful basis.

## Position in the waterfall

- **People search:** last rung on price — behind `salesNavigator.searchLeads` (0.02), `icypeas.findPeople` (0.02/100), `aiArk.searchPeople` (0.05), `contactOut.search` (1–3), and level with `apolloio.searchPeople` (1 enriched). It moves to **first** only for profile free-text, LinkedIn groups/interests/languages, an absolute role-start date, or list-membership exclusion.
- **Person enrich:** behind `aiArk.enrichPerson` (0.1), `linkedin.enrichProfile` (0.25), `waterfall.enrichContact` (2 multi-source); ahead of `peopleDataLabs.enrichPerson` (3) and `leadMagic.enrichProfile` (3) on price. Its edge is filter-based resolution when there is no URL.

## Action shape

`{"kind":"connector","integrationSlug":"proxycurl","actionSlug":"search","config":{}}`. **No `connectorUuid` in `config`.** `objectType`, `filters`, and `limit` go in `--data`.

Needs a ProxyCurl API key on the connector. Caching is supported — a repeated identical query inside the window doesn't re-bill.

## Pairs with

- [`../recipes/source-planning.md`](../recipes/source-planning.md) — the free `aiArk.count*` probe that tells you whether a 1/record source is worth opening.
- [`../recipes/account-expansion.md`](../recipes/account-expansion.md) — `public_identifier_not_in_list` against the Contacts model is the dedupe this recipe asks for.
- [`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md) — the cheaper instrument when the people are already yours.

## Recurring use

- **Per-item billing on a schedule compounds.** A weekly `search` at `limit: 25` is 25 credits a week, ~1,300 a year — and mostly the same people, re-billed.
- **Make each run pay only for what is new.** Move `current_role_after` forward with the schedule, and pass `public_identifier_not_in_list` with everyone already in the model. Without both, a recurring search is a standing order for duplicates.
- **In-play gate:** cap `limit` in the node itself, never from an upstream variable that can grow.
