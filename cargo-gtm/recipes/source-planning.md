# Recipe — Source planning (before you spend)

Use this recipe when the user asks a research or list-building question whose **answer source is not obvious**, and the wrong first guess is expensive. Typical asks: "can we even find this?", "what's the cheapest way to get X for 2,000 companies?", "which provider has the best coverage for European SMBs?", "what would this cost before I commit?", "is there a signal for Y?".

Every other recipe in this skill assumes the source is already decided. This one decides it. Run it when the question is unusual, the volume is large, or the user is cost-sensitive — and skip it when a recipe already matches (`build-tam.md`, `prospecting.md`, `tech-intent.md` each encode a settled source plan).

## The failure this prevents

The expensive mistake is not picking a slightly worse provider. It is **fanning out over the full list before learning that the field is only available for 30% of it.** You pay for 2,000 lookups, get 600 answers, and discover the coverage ceiling was a property of the data, not of your query. Source planning buys that knowledge for a few credits.

## Step 1 — Restate the question as a field on a row

Vague research questions cannot be costed. Convert to: **for each `<entity>`, what is `<field>`?**

- "Find companies that care about compliance" → *for each company, does it have a SOC 2 badge / a compliance job posting / a trust page?*
- "Who are the decision makers?" → *for each company, which people hold `<title list>`?*
- "Are they growing?" → *for each company, what is headcount now vs 12 months ago?*

If the question cannot survive this rewrite, it is a strategy question, not a data question — say so rather than shopping for a provider.

**Then name the anchor** — the identifier already on the row. Everything downstream depends on it:

| You already have | Cheapest anchors into |
|---|---|
| Domain | Company firmographics, technographics, funding |
| LinkedIn profile URL | Person profile + verified email at the bottom of the catalog |
| LinkedIn company URL | Company details, headcount, industry |
| Name + company | Nothing directly — resolution step first ([`linkedin-url-lookup.md`](linkedin-url-lookup.md)) |
| Email | Reverse lookup to person/company |
| Nothing (criteria only) | A search action, billed per returned row |

A weak anchor is the single biggest cost multiplier: name+company costs a resolution step *and* an enrich step, and compounds error at both.

## Step 2 — Enumerate candidate sources, cheapest first

Three tiers. Exhaust each before moving down.

**Tier 0 — free and already in the workspace.** Check before buying anything:

```bash
cargo-ai storage model list                                  # is the field already a column?
cargo-ai storage query execute "SELECT count(*) FROM default.companies WHERE <field> IS NOT NULL"
cargo-ai connection connector list                           # is the CRM connected? it may already hold this
```

Surprisingly often the answer is a `SELECT` away, or one CRM sync. Say so and stop.

**Tier 1 — the catalog, by input type.** [`../references/stage-action-map.md`](../references/stage-action-map.md) maps input type → cheapest credits-based action per stage; [`../references/credits-cost-table.md`](../references/credits-cost-table.md) has the per-action cost for all 145. Pull 2–3 candidates, not one.

**Tier 2 — general web.** When no structured provider carries the field: `serper` (SERP), `firecrawl` (scrape a known page), `linkup` (sourced answers), or an LLM with search grounding. Cheap per call, unbounded per question, and the answer quality depends entirely on the prompt — read [`../references/prompt-library/index.md`](../references/prompt-library/index.md) before writing one.

## Step 3 — Probe coverage on 5–10 rows, per candidate

This is the step that pays for the whole recipe. Take a deliberately **representative** sample — not the first 10 rows, which are usually the largest and best-covered companies — and run each candidate against it.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>"}' \
  --data '{"domain":"example.com"}' --wait-until-finished
```

Record four numbers per candidate, and nothing else:

| Metric | How to read it |
|---|---|
| **Hit rate** | Non-empty answers ÷ rows attempted. The coverage ceiling. |
| **Cost per hit** | Cost per row ÷ hit rate — *not* cost per row. A 0.5-credit action at 20% coverage costs 2.5 credits per answer, worse than a 2-credit action at 90%. |
| **Correctness** | Spot-check 3 answers against a source you trust. Wrong beats missing in cost, because it propagates. |
| **Freshness** | How old is the value? A 2019 funding round answers the query and fails the job. |

Read the candidate's playbook (`../provider-playbooks/<slug>.md`) before the probe — it usually predicts the hit rate and names the input quirk you are about to trip over.

## Step 4 — Present the plan, then wait

Do not proceed on your own judgment. Present the costed comparison and stop:

> **Question:** for each of 2,000 companies, do they run a bug-bounty program?
> **Anchor:** domain (present on 1,940 of 2,000).
>
> | Source | Probe hit rate | Cost/row | Cost/hit | Note |
> |---|---|---|---|---|
> | `theirStack.searchTechnologies` | 3/10 | 0.5 | 1.7 | Only detects platform vendors |
> | `firecrawl` on `/security` | 7/10 | 0.5 | 0.7 | Needs an LLM extract step (+0.01) |
> | `serper` + LLM judge | 8/10 | ~0.3 | 0.4 | Noisiest; 1 of 3 spot-checks wrong |
>
> **Recommendation:** firecrawl on `/security`, ~1,360 answers for ~1,020 credits. Balance is 4,200.
> **Alternative if budget matters more than coverage:** serper + judge, ~40% cheaper, with a manual spot-check on the positives.
> **What I'd drop:** theirStack — it answers a different question than the one asked.

Three shaped options, a default, and the reconciled balance — the standard approval shape from [`../references/cost-discipline.md`](../references/cost-discipline.md). Stay in AWAIT_APPROVAL until the user picks.

## Step 5 — Record the plan so the next person doesn't re-probe

Coverage findings are durable knowledge about the market, and they are usually lost the moment the run ends. Write the result — the question, the sources tried, the hit rates, and the choice — to the workspace's context repo: [`../../cargo-context/SKILL.md`](../../cargo-context/SKILL.md).

Six weeks later, "we tested three sources for bug-bounty detection and firecrawl on /security won at 70%" is worth more than the list it produced.

## Step 6 — Hand off

With the source chosen, the job becomes an ordinary one. Route to the recipe that matches: [`build-tam.md`](build-tam.md) for company lists, [`prospecting.md`](prospecting.md) for contacts, [`tech-intent.md`](tech-intent.md) for stack and hiring signals, or [`save-as-play.md`](save-as-play.md) if the answer needs refreshing on a schedule.

Carry the probe's hit rate into the sizing: at 70% coverage, over-provision the input list rather than adding a second provider to chase the missing 30% — coverage is a property of the company, not of your effort. See [`../references/waterfall-strategy.md`](../references/waterfall-strategy.md) for when a second rung genuinely helps.

## Related

- [`../references/stage-action-map.md`](../references/stage-action-map.md) — input type → cheapest action, across the whole catalog.
- [`../references/alternatives.md`](../references/alternatives.md) — swap-ins when the priority stack can't serve.
- [`../references/credits-cost-table.md`](../references/credits-cost-table.md) — per-action costs.
- [`icp-discovery.md`](icp-discovery.md) — when the question is "which signal matters", not "where do I get this one".
