---
provider: storeleads
category: enrichment (ecommerce stores)
last-reviewed: 2026-10-23
---

# storeleads (Store Leads)

Ecommerce-store data — the catalog's only provider indexed on **online stores** (~8M domains): platform (Shopify, WooCommerce, …), installed apps and technologies with install dates, estimated sales / visits / page views, product count and average price, category, country. One action and two extractors; on Cargo credits everything bills a flat **0.01 per domain**. Store Leads sells a subscription rather than per-lookup pricing, so the rate is nominal — but at TAM scale it is not zero.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichDomain` | 0.01 (0 when the domain doesn't resolve) | `domain` (required) | One store's full record: company details, platform, apps, technologies, traffic and sales estimates, contact channels. |

## Extractors (auto-fetch feeds, not actions)

| Extractor | Cost | Feeds | Use for |
|---|---|---|---|
| `fetchDomains` | **0.01 per item** | Account-unified model (dedupes on `domain`) | A store list built from search filters — the ecommerce TAM. `limit` defaults to **1,000**, up to **10,000,000**. |
| `listenList` | own key only | Event model (`domain`, `type` install / uninstall, `list`) | Install / uninstall events from a list saved in **your** Store Leads account, pushed by its webhook. Not available on a credits connector: the webhook lives in the customer's Store Leads account. |

`fetchDomains` filters: `platforms`, `apps` and `technologies` (each with an `and` / `or` / `not` operator and, for apps / technologies, an installed-at date range), `countryCodes`, `categories`, `statuses`, `tags`, and min / max bounds on employee count, estimated page views, sales and visits, product count and average product price. Values come from the `listPlatforms`, `listApps`, `listTechnologies`, `listCountryCodes`, `listCategories`, `listStatuses` and `listTags` autocompletes.

## What it's for

- ✅ **Ecommerce TAM** — "every Shopify Plus store in the US doing over $1M with Klaviyo installed" is one `fetchDomains` model, and the search pages to the end of the result set rather than sampling it.
- ✅ **App install / uninstall as a signal** — a store that just installed (or dropped) a tool in your category is a timing signal; `technologyInstalledAtMin` on the extractor, or `listenList` on your own key.
- ✅ **Cheap store enrichment** — `enrichDomain` at 0.01 on a list of store domains you already hold.
- ❌ **Non-ecommerce companies** — a SaaS company or agency has no store record; use `aiArk.enrichCompany` (0.01) for firmographics.
- ❌ **Contacts** — store records carry company channels, not people. Find buyers through the CONTACT stage.

## Patterns

### Pattern A — Size before you pull

Dry-run the extractor config with `storage model preview` before creating the model (see the `cargo-storage` skill): for `fetchDomains` it fetches one 10-store page, **bills nothing**, and reports the search's full match count in `count`. Then set `limit` to what you will use.

```bash
cargo-ai storage model preview \
  --dataset-uuid <the Store Leads connector's dataset uuid> \
  --slug fetchDomains \
  --config '{"platforms":["shopify"],"countryCodes":["US"],"estimatedSalesMin":1000000,"limit":5000}'
```

`--slug` is the **extractor** slug, and the dataset is the connector's own (`kind: "connector"`). Use `preview`, not `preview-count`: this extractor previews records, so `preview-count` answers `0`. `limit` is the bill — 5,000 domains = 50 credits; the 10,000,000 ceiling exists so a whole TAM *can* be fetched, not as a default.

### Pattern B — Enrich store domains you hold

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"storeleads","actionSlug":"enrichDomain"}' \
  --records '[{"domain":"allbirds.com"},{"domain":"gymshark.com"}]' \
  --wait-until-finished
```

## Common pitfalls

- **A raised `limit` re-bills on every sync.** `fetchDomains` is a non-incremental fetch: each run pulls the result set again at 0.01 per domain, up to `limit`. A 500,000-store model is 5,000 credits **per sync**.
- **The count the run shows is capped at `limit`.** The preview reports the true total; the run reports the smaller of the total and `limit` — a run that shows exactly your `limit` matched more.
- **Slow at scale.** The connector is limited to 2 requests a second and pages 500 domains at a time, so a seven-figure pull takes hours, not minutes.
- **`listenList` on a credits connector** fails by design — it needs your own Store Leads key and a list saved in that account.

## Anti-patterns

- **Enriching every row of a `fetchDomains` model with `enrichDomain`.** The extractor already wrote the full domain record; enriching it again pays twice for the same fields.
- **Scheduling a full-TAM resync to catch new stores.** Narrow the filters (an installed-at or created date bound) or keep `limit` at the slice you act on.

## Position in the waterfall

- **SOURCE (companies) for ecommerce**, upstream of the normal ENRICH → CONTACT → VERIFY spine — beside `aiArk.searchCompanies` (0.01/record) and `oceanio` lookalikes, for the one vertical neither indexes by store data.
- **SIGNAL** for app install / uninstall timing.

## Recurring use

- **The extractors are the recurring surface.** `fetchDomains` re-pulls on its sync schedule at 0.01 per domain every time (see pitfalls), so a recurring model wants a tight `limit` and filters that change the result set, not the whole catalog. `listenList` pushes events and bills nothing on Cargo.
- **In-play gate:** trigger plays off rows newly entering the model (or newly installing an app), and gate downstream paid enrichment on the account's enrichment fields being empty — a re-synced store must not re-bill the ENRICH chain.
- **Stable data:** platform and category barely move; traffic and sales estimates drift monthly at most. A daily resync buys nothing a weekly one doesn't.

## Action shape

`{"kind":"connector","integrationSlug":"storeleads","actionSlug":"enrichDomain"}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/build-tam.md`](../recipes/build-tam.md) — the ecommerce variant of a TAM build.
- [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — app and technology install dates as the intent signal.
