---
provider: snitcher
category: enrichment
last-reviewed: 2026-07-09
---

# snitcher (Snitcher)

Website-visitor identification (catalog subcategory: `websiteVisit`) — a **signal source**, not an enrichment rung. It de-anonymizes companies visiting your site via a tracking script and a Snitcher account, then exposes them to cargo two ways: one free credits-based action (`searchSessions`, 0) and two **extractors** that auto-sync visitor data into workspace models. It's the only visitor-identification surface in the catalog ([`../references/alternatives.md`](../references/alternatives.md): "Always for visitor ID — free credits-tier"). Requires your own Snitcher `apiKey` connector and their tracking setup on your site.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchSessions` | 0 | `workspaceUuid, organisationUuid` (required), `dateFrom, dateTo, url, referrer, limit` | Ad-hoc: pull one identified company's sessions (pages, referrers, dates) — free. |

## Extractors (auto-fetch feeds, not actions)

| Extractor | Cost | Feeds | Use for |
|---|---|---|---|
| `fetchOrganisations` | **3 per item** | Account-unified model (dedupes on domain/website) | The identified visiting companies themselves — name, website, size, industry, first/last seen. |
| `fetchSessions` | 0 per item | Account-event model (keyed to domain) | Session activity per visitor — started/ended, referrer, device, page views. |

Both run incrementally with `autoFetch` at a minimum 30-minute interval once configured.

## What it's for

- ✅ **Visitor-intent signal** — companies browsing your pricing page are the warmest cold segment there is; feed the identified-visitor segment into [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) or [`../recipes/re-engagement.md`](../recipes/re-engagement.md).
- ✅ **Free session context** — `searchSessions` and the `fetchSessions` extractor cost nothing, so page-level context (which URLs, how often, from where) is free personalization fuel.
- ❌ **Company enrichment** — visitor records carry basic firmographics only; run identified domains through the normal ENRICH chain (`cargo` 0.5, or `companyEnrich` 0.25) for real coverage.
- ❌ **Workspaces without a Snitcher account** — there's no cargo-managed data here; no tracking script, no signal.

## Patterns

### Pattern A — Sessions for one identified organisation

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"snitcher","actionSlug":"searchSessions","config":{}}' \
  --record '{"workspaceUuid":"<snitcher-workspace-uuid>","organisationUuid":"<snitcher-organisation-uuid>","dateFrom":"2026-06-01","dateTo":"2026-07-09","limit":50}' \
  --wait-until-finished
```

Both UUIDs are **Snitcher's** identifiers (workspace = the tracked site; organisation = the identified visitor company from `fetchOrganisations` data) — not cargo workspace or record UUIDs.

### Pattern B — Visitor signal → activation

1. Extractors sync visiting companies (account model) + sessions (events) into storage.
2. Segment on the signal (e.g. `last_seen` this week + high-value pages in `views`).
3. Enrich + find contacts through the normal chain, verify, activate — the standard signal-to-outreach path.

## Common pitfalls

- **`fetchOrganisations` is 3 credits per identified company, recurring.** With `autoFetch` polling every ≥30 minutes, a high-traffic site quietly compounds spend — the "free provider" reputation only covers sessions. Size the tracked site's traffic before enabling it.
- **`workspaceUuid` naming collision** — the required config field is Snitcher's workspace, resolved from their account (the UI backs it with a workspace picker). Passing a cargo workspace UUID returns nothing.
- **`searchSessions` needs an `organisationUuid`** — it's a per-company drill-down, not a firehose; the firehose is the `fetchSessions` extractor.
- **No caching** — the connector is not caching-compatible; repeated identical calls re-hit the API (rate limit is a generous 6000/min).

## Anti-patterns

- **Treating identified visitors as leads.** A visit identifies a **company**, not a person — contacts still come from the CONTACT stage (sourcing + find-email + verify) on the visiting account.
- **Enabling `fetchOrganisations` "just to see"** on a high-traffic site. Pilot expectations against traffic volume first; every identified company bills 3, every sync.

## Position in the waterfall

- **SIGNAL stage** — visitor identification sits beside job-change, funding, and tech-intent as a trigger source ([`../references/stage-action-map.md`](../references/stage-action-map.md)); identified accounts then enter the normal ENRICH → CONTACT → VERIFY → activation spine.

## Action shape

`{"kind":"connector","integrationSlug":"snitcher","actionSlug":"searchSessions","config":{}}`. **No `connectorUuid` in `config`.**
