---
provider: theSwarm
category: network (warm-intro mapping)
last-reviewed: 2026-07-09
---

# theSwarm (The Swarm)

Warm-intro path discovery — **two actions, both 2 credits**, scoring the relationships between *your* company and a target company or person. Unique in the catalog: no priority-stack action maps who-knows-whom ([`../references/alternatives.md`](../references/alternatives.md) lists it as the only warm-intro source). Per the provider, results improve over time as your team maps its network (e.g. via The Swarm's Chrome extension) — the output is only as good as the network your account has indexed.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchWarmIntrosToCompany` | 2 | `matchingCompanyDomain`*, `targetCompanyDomain`*, `jobFunctions`, `seniorities` | Warm-intro paths into a target account, filtered to employees with the desired function/seniority. |
| `searchWarmIntrosToPerson` | 2 | `matchingCompanyDomain`*, `targetLinkedinUrl`* | Warm-intro paths to one specific person. |

\* required. `matchingCompanyDomain` is **your own company's domain**; the target fields are the prospect side.

## What it's for

- ✅ **Route-in on high-value accounts** — before cold outreach on a strategic target, check for an intro path; a warm intro beats any sequence.
- ✅ **Champion-led plays** — find who at your company knows the buying committee, filtered by `jobFunctions` / `seniorities` so paths land on the right people.
- ✅ **Person-level check before a big ask** — `searchWarmIntrosToPerson` with the prospect's LinkedIn URL for exec-level outreach.
- ❌ **Pure prospecting** — theSwarm doesn't find new prospects; it maps relationships to ones you already have. Source with `salesNavigator` first.
- ❌ **Whole-TAM sweeps** — 2 credits/lookup across 5,000 accounts is 10,000 credits, mostly returning "no path". Reserve it for scored/tiered accounts.

## Patterns

### Pattern A — Warm paths into a target account

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theSwarm","actionSlug":"searchWarmIntrosToCompany","config":{}}' \
  --data '{
    "matchingCompanyDomain": "yourco.com",
    "targetCompanyDomain": "acme.com",
    "jobFunctions": ["engineering"],
    "seniorities": ["vp", "c_suite"]
  }' \
  --wait-until-finished
```

`jobFunctions` / `seniorities` values shown are **illustrative** — fetch the accepted values from the `listJobFunctions` and `listSeniorities` autocompletes on `connection integration get theSwarm` first. Both accept a single string or an array.

### Pattern B — Warm path to one person

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theSwarm","actionSlug":"searchWarmIntrosToPerson","config":{}}' \
  --data '{
    "matchingCompanyDomain": "yourco.com",
    "targetLinkedinUrl": "https://linkedin.com/in/janedoe"
  }' \
  --wait-until-finished
```

## Common pitfalls

- **Swapping the domains.** `matchingCompanyDomain` is *your* domain, `targetCompanyDomain` the prospect's. Reversed, the call runs and bills 2 credits — for paths into your own company.
- **Guessed enum values.** `jobFunctions` / `seniorities` are provider-defined strings; resolve them via the autocompletes or the filter silently narrows to nothing.
- **Fixed cost, path or no path.** 2 credits per lookup regardless of result — gate it on account tier, not on the whole list ([`../references/cost-discipline.md`](../references/cost-discipline.md)).
- **Network coverage drives hit rate.** A thin mapped network returns thin results; that's account state, not an API failure — don't burn retries on it.

## Position in the waterfall

**NETWORK / route-in — after SOURCE + SCORE, before outreach.** On tier-1 accounts, run theSwarm between qualification and sequencing: warm path found → intro motion; no path → the normal CONTACT → VERIFY → sequence spine. See [`../references/stage-action-map.md`](../references/stage-action-map.md), Warm intros.

## Action shape

`{"kind":"connector","integrationSlug":"theSwarm","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/account-expansion.md`](../recipes/account-expansion.md) — multi-threading a customer account through colleagues who already know the new buyers.
- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — branch send-ready records: warm path → intro request, otherwise → sequencer.
