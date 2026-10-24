---
provider: cargoSignals
category: signals (intent feeds, credits only)
last-reviewed: 2026-10-23
---

# cargoSignals (Cargo Signals)

Intent signals delivered into a model as they fire — formerly the `rodz` integration (renamed October 2026; the `rodz` slug no longer exists). **No actions at all**: thirty-five `listen*` **extractors**, one per signal type, each feeding its own model. Runs on Cargo credits only (the connector has no config), and **bills per lead delivered** — every record the signal posts into the model is a charge, at a price set per signal type. A new model stays empty until the first signal fires.

## Extractors (auto-ingest feeds, not actions)

Cargo registers the webhook itself (`autoIngest`), so there is no URL to hand out. Prices are **credits per item delivered**:

| Signal family | Extractors (slug = `listen` + signal) | Cost / item |
|---|---|---|
| Job moves | `listenJobChanges` — market-wide, or a **watchlist** of people | 2 (watchlist: 1) |
| Hiring | `listenJobOffers` 2, `listenRecruitmentCampaign` 3, `listenRepublishedJobOffers` 3 | 2–3 |
| Company events | `listenFundraising`, `listenMergersAcquisitions`, `listenCompanyGrowth`, `listenDepartmentGrowth`, `listenEmployeeDeparture` | 2 |
| Forecasts | `listenForecastedFunding` / `…Acquisition` / `…Ipo` 4, `listenForecastedGrowth` 2 | 2–4 |
| Account lists | `listenAccountWatchlist` (every event type on your list) 3, `listenNewDecisionMakerWatchlist` 2 | 2–3 |
| Technology | `listenAiAdoption`, `listenTechAdoption`, `listenTechDisplacement` 12, `listenCompetitorCustomers` 5 | 5–12 |
| Network | `listenWarmIntros`, `listenPersonConnections` | **3, or 5 on the daily-only stream** |
| LinkedIn audiences | `listenCompanyFollowers` 1, `listenCompanyPageEngagement` 1, `listenSocialMentions` 1, `listenSocialReactions` 1, `listenInfluencerEngagement` 1, `listenCompetitorSocialReactions` 2, `listenCompetitorRelationships` / `…CustomerCare` 5, `listenDormantLinkedinPoster` 2 | 1–5 |
| Public sector & registries | `listenPublicTenders` 7, `listenPublicContractAward` 7 (France, BOAMP), `listenCompanyRegistration` 5 (France, SIRENE), `listenGmbListing` 1 | 1–7 |

The table groups the main ones. `cargo-ai orchestration action list` does not list extractors; every slug and schema is in `cargo-ai connection integration get cargoSignals`.

**Scope.** Paired signals take `scope.kind`: `market` (detect across the market, with filters) or `watchlist` (only the companies or people you name — from a model column or a manual list, `limit` default 1,000, **max 100,000**). Market-only and watchlist-only signals have no `scope`.

**Volume.** `advancedSettings.dailyLeadLimit` caps leads per day (default 100, max 1,000); `duplicateHandling` (`allow` default, `refuse`, `7d` / `14d` / `30d`) decides whether a lead that fires again is delivered — and billed — again.

## The cost traps — read before creating a model

- **Warm intros and person connections deliver a one-time extract first.** `filters.volume.oneTimeExtractCount` defaults to **500** (max 25,000) and is **not capped by the daily lead limit**. At 3 credits a lead, the default first delivery is up to **1,500 credits** — and 25,000 is up to 75,000. Set it deliberately, and set it to `0` with `dailyNewIntros` / `dailyNewConnections: true` to take only the new-relationship stream (priced at 5 a lead).
- **Company Followers in ICP mode starts itself.** With `filters.extractionMode: "icp"`, the extraction quote is accepted automatically whenever `maxFollowers` or fewer followers match (default **1,000**, max 10,000) — there is no approval step. At 1 credit a follower, the default can deliver up to **1,000 credits** the moment the model is created. Lower `maxFollowers` to the budget you would sign off on. `extractionMode: "count"` instead pulls `dailyExtractLimit` followers a day (default 100), unfiltered.
- **Technology signals are 12 a lead.** `listenTechAdoption` with loose filters and a 1,000/day lead limit is a 12,000-credit day.
- **Duplicates bill.** With `duplicateHandling: "allow"`, a company that keeps hiring re-delivers — and re-bills — each time it fires.

## What it's for

- ✅ **Signal-first prospecting** — the model *is* the trigger: a play on "rows added" runs when a signal fires, with no polling.
- ✅ **Watchlists on accounts you already own** — job changes on your customers' champions, funding or new decision-makers on your target accounts; cheaper than market-wide for job changes.
- ✅ **Warm paths** — `listenWarmIntros` (people in your ICP who worked alongside your team, clients or investors) and `listenPersonConnections` (people in the networks of up to 500 people you name).
- ❌ **On-demand lookups** — there is nothing to call. For a one-off check on one account, use an action: `waterfall.detectJobChange`, `enrichCrm.getFunding`, `theSwarm.searchWarmIntrosToCompany`.
- ❌ **Raw outreach lists** — a signal says *why now*, not *who may be contacted*. Every lead still passes the [`../references/acceptable-use.md`](../references/acceptable-use.md) §3 checks before any outreach step, and the engagement-audience signals name people for reacting to a post, which is a weak basis on its own.

## Patterns

### Pattern A — Job changes on a watchlist of champions

```bash
cargo-ai storage model create \
  --dataset-uuid <cargoSignals dataset uuid> \
  --slug champion_job_changes --name "Champion job changes" \
  --extractor-slug listenJobChanges \
  --config '{
    "scope": {"kind": "watchlist", "entities": {"source": "model", "modelUuid": "<contacts-model-uuid>", "columnSlug": "linkedin_url", "titleColumnSlug": "job_title", "companyColumnSlug": "company_name", "limit": 500}},
    "advancedSettings": {"dailyLeadLimit": 50, "duplicateHandling": "30d"}
  }'
```

Pass the current title and company columns: without them the first check only snapshots each person, so nobody "changes" until the second.

### Pattern B — Warm intros, new relationships only

Set `filters.volume` to `{"oneTimeExtractCount": 0, "dailyNewIntros": true}` and list introducers in `filters.introducers.sourceProfiles` (at most 500, or `sourceCompany` for your company page). That skips the 500-lead backfill and bills 5 per new introduction, up to the daily lead limit.

## Common pitfalls

- **An empty model is not a broken model.** Nothing arrives until a signal fires; don't recreate it or "test" it with a looser config.
- **The `rodz` slug is gone.** Workflows, projects or docs naming `rodz` need `cargoSignals`.
- **French-only signals.** `listenCompanyRegistration`, `listenPublicContractAward` and the BOAMP side of `listenPublicTenders` cover France; `listenPublicTenders` also reads TED for the EU.

## Anti-patterns

- **Creating several overlapping market-wide models** on the same filters — each delivers and bills the same lead separately.
- **Paying twice for contact data.** Most signals take an `enrichment` block (`getEmails`, `getPhones`, plus SIRENE, technology and homepage fields on company signals) that does not change the per-lead price; use it rather than re-running the CONTACT chain on every delivered lead. Leave `getPhones` off unless the user asked for phone ([`../references/cost-discipline.md`](../references/cost-discipline.md) §5).

## Position in the waterfall

**SIGNAL stage** — beside `waterfall.detectJobChange` (one-off job-change checks), `theirStack` (tech and hiring intent) and `theSwarm` (warm intros on demand). Delivered leads then enter the normal SCORE → CONTACT → VERIFY spine ([`../references/stage-action-map.md`](../references/stage-action-map.md)).

## Recurring use

- **The extractors are the recurring surface** — every model is a standing feed that bills as leads arrive. Its spend ceiling is `dailyLeadLimit` × price per lead, **plus** any one-time extract or ICP auto-start above; quote all of it to the user before creating the model.
- **In-play gate:** trigger plays on rows added to the signal model, and gate paid downstream steps on the contact's enrichment fields being empty — a lead re-delivered under `duplicateHandling: "allow"` must not re-bill the chain.
- **Stopping it:** `storage model remove` deletes the signal along with the model. There is no pause command; lowering `dailyLeadLimit` with `storage model update --config` is the way to slow one down.

## Action shape

None — this integration has no actions. Models are created with `storage model create --extractor-slug listen<Signal>` against the `cargoSignals` connector's dataset.

## Pairs with

- [`../recipes/job-change-monitoring.md`](../recipes/job-change-monitoring.md) — a watchlist feed instead of re-checking each contact on a schedule.
- [`../recipes/funding-watch.md`](../recipes/funding-watch.md) — `listenFundraising` / `listenForecastedFunding` as the feed.
- [`theSwarm.md`](theSwarm.md) — on-demand warm-intro checks on one account, where this is the standing feed.
