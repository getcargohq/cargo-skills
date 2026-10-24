---
provider: explorium
category: enrichment (business + prospect data, events, intent)
last-reviewed: 2026-10-23
---

# explorium (Explorium)

Business and prospect data on **your own Explorium API key** — no action here bills Cargo credits, so the cost lives on your Explorium plan, not in the cost table. Twenty-three actions and four extractors: match a company or person to an Explorium id, enrich it across a dozen data families (firmographics, technographics, funding, workforce trends, employee ratings, website changes, Bombora intent), search businesses and prospects, and read business or prospect **events**. It carries the action slugs the retired first-party `cargo` enrichment provider used (`enrichBusinessFirmographics`, `matchBusiness`, …), so a workflow built on those before October 2026 points here now — on a connector you authenticate yourself.

## Own-API-key actions (no credits — require your Explorium account connector)

Every `enrich*` and `fetch*Events` action takes an Explorium **`business_id`** (or `prospect_id`), never a domain. Resolve it first with a `match*` action.

| Action | Inputs | Use for |
|---|---|---|
| `matchBusiness` | `name`, `domain`, `linkedin_url` (any; more is better) | Resolve a company to its `business_id`. Run once per row and store the id. |
| `matchProspect` | `email`, `phone_number`, `full_name` + `company_name`, `linkedin`, `business_id` (any) | Resolve a person to its `prospect_id`. |
| `enrichBusinessFirmographics` | `business_id` | Name, description, website, HQ address, NAICS/SIC, employee and revenue ranges, LinkedIn industry, location distribution. |
| `enrichBusinessTechnographics` / `…FundingAndAcquisitions` / `…FinancialMetrics` / `…WorkforceTrends` | `business_id` | One data family per call — tech stack, funding history, public-company financials, department headcount trends. |
| `enrichBusinessRatingsByEmployees` | `business_id` | Employee-review ratings — a culture / churn-risk input, not a buying signal. |
| `enrichBusinessWebsiteChanges` / `…WebsiteKeywords` / `…LinkedinPosts` | `business_id` | What the company changed on its site, what its site says, what its page posts. |
| `enrichBusinessChallenges` / `…CompetitiveLandscape` / `…StrategicInsights` | `business_id` | Explorium's derived research notes — personalization inputs. |
| `enrichBusinessBomboraIntent` | `business_id`, `topics[]` (`"category: topic"`), `min_score` (integer, **> 60**) | Bombora intent: which topics the company is researching. Explorium recommends 12+ topics for a meaningful read. |
| `enrichProspectDetails` / `…LinkedinProfile` / `…LinkedinPosts` | `prospect_id` | Person-level profile, role and activity. |
| `fetchBusinesses` / `fetchProspects` | filter set — size, revenue, age, geography, NAICS / LinkedIn / Google category, tech stack, website keywords; prospects add job title / level / department, tenure, `has_email` (`fetchProspects` `limit` default 25, max 100) | Search Explorium's index — sourcing on your own key. |
| `fetchBusinessStatistics` | same filters as `fetchBusinesses` | Size a search before pulling it. |
| `fetchBusinessEvents` | `business_id`, `event_types[]`, `timestamp_from` (ISO 8601) | Funding rounds, IPOs, new products / offices / partnerships, department growth or shrinkage, hiring by department. |
| `fetchProspectEvents` | `prospect_id`, `event_types[]`, `timestamp_from` | `prospect_changed_role`, `prospect_changed_company`, `prospect_job_start_anniversary`. |

Filter and topic values come from one autocomplete, `listFields`, with a `field` param (`company_size`, `naics_category`, `company_tech_stack_tech`, `business_intent_topics`, `business_event_types`, `prospect_event_types`, …): `cargo-ai connection connector autocomplete --connector-uuid <uuid> --slug listFields --params '{"field":"business_intent_topics"}'`.

## Extractors

| Extractor | Mode | Feeds | Use for |
|---|---|---|---|
| `fetchBusinesses` / `fetchProspects` | fetch | Account / contact model | A model populated from an Explorium search. |
| `listenBusinessEvents` | ingest (Cargo registers the webhook) | Event model: `event_name`, `event_time`, `business_id`, `domain`, `linkedin_company_url`, `data` | Enroll companies — from a model column of domains or LinkedIn company URLs (with optional `filter`, `sort`, `limit` default 1,000, max 10,000), or a manual `list` — and receive their events as they fire. |
| `listenProspectEvents` | ingest (Cargo registers the webhook) | Event model keyed to the prospect | The same, for role and company changes. |

The listen extractors need the connector's optional **`partnerId`** as well as the key — Explorium keys webhook registration by partner. Without it the extractor fails at setup.

## What it's for

- ✅ **Data families no credits-based provider sells** — Bombora intent topics, employee ratings, website-change history, and Explorium's derived challenges / strategic-insight notes.
- ✅ **Event monitoring on a named account list** — `listenBusinessEvents` turns a Companies model into a live feed of funding, product, office and hiring events, with no polling on your side.
- ✅ **Workspaces that already pay Explorium** — and anything built on the retired `cargo` enrichment slugs.
- ❌ **Cheapest firmographics** — on credits, `aiArk.enrichCompany` (0.01) and `companyEnrich.enrichByDomain` (0.25) key on the domain and need no match step.
- ❌ **Workspaces with no Explorium contract** — there is no credits connector to fall back on.

## Patterns

### Pattern A — Match once, then enrich by id

```bash
# 1) Resolve the id (store it on the row)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"explorium","actionSlug":"matchBusiness"}' \
  --data '{"name":"Acme","domain":"acme.com"}' \
  --wait-until-finished

# 2) Enrich by business_id
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"explorium","actionSlug":"enrichBusinessFirmographics"}' \
  --data '{"business_id":"<business_id from step 1>"}' \
  --wait-until-finished
```

In a workflow, wire the match node's `business_id` into each enrich node (`{{nodes.<match-slug>.business_id}}`) and branch on it being empty — a miss returns no id, and every downstream enrich would fail on it.

### Pattern B — Recent events for one account

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"explorium","actionSlug":"fetchBusinessEvents"}' \
  --data '{"business_id":"<id>","event_types":["new_funding_round","increase_in_sales_department"],"timestamp_from":"2026-07-01T00:00:00Z"}' \
  --wait-until-finished
```

Always set `timestamp_from`: without it the call returns the company's whole event history, and a "what changed" question gets answered with last year.

## Common pitfalls

- **Enrich actions take an id, not a domain.** Passing a domain as `business_id` returns no data. Match first.
- **`min_score` must be above 60.** The schema rejects 60 and below; omit it to take Explorium's default threshold.
- **A no-data enrich still runs.** Each `enrich*` returns empty output with an `❌ No …` title when Explorium has nothing; your Explorium plan may still count the call.
- **Listen extractors without `partnerId`.** The key alone authenticates the actions but cannot register a webhook.

## Anti-patterns

- **Calling every `enrich*` family on every row.** Each family is a separate call against your Explorium quota. Pick the two or three the play actually uses.
- **Polling `fetchBusinessEvents` on a schedule** for a list the listen extractor could watch — the extractor is the recurring surface.

## Position in the waterfall

- **ENRICH (company), own-key alternative** to the credits chain `aiArk.enrichCompany` (0.01) → `companyEnrich.enrichByDomain` (0.25) → `waterfall.enrichCompany` (1) — reach for it when the workspace has an Explorium contract or needs a family the chain lacks.
- **SIGNAL stage** for funding, hiring-by-department and intent: beside `enrichCrm.getFunding` (credits), `theirStack` (hiring intent) and `waterfall.detectJobChange` (job changes).

## Recurring use

- **The listen extractors are the recurring surface.** Enroll the account list once and events arrive as they fire — no cron. Re-enrolling the same model on a schedule just re-registers what is already watched.
- **In-play gate:** store `business_id` from the first match and gate every later match on it being empty — a play that re-matches on every evaluation spends your Explorium quota re-learning ids.
- **Event windows:** a scheduled `fetchBusinessEvents` must move `timestamp_from` forward to the last run, or every run re-reads the same history.

## Action shape

`{"kind":"connector","integrationSlug":"explorium","actionSlug":"<slug>"}`. With no credits connector possible, the run uses the workspace's own-key Explorium connector. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/funding-watch.md`](../recipes/funding-watch.md) — `listenBusinessEvents` on `new_funding_round` is an own-key alternative to the funding sources there.
- [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — Bombora topics as a research-intent signal beside tech-stack and hiring intent.
