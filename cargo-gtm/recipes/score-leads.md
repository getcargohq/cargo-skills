# Recipe — Score and tier a list of companies against a stated ICP

**Use when**: the user has a list of companies and wants each one scored against their ideal customer profile, with a reason and a tier on every row, so the bottom of the list can be dropped before anyone spends time on it.

**Trigger phrases**: "Score these leads.", "Which of these fit our ICP?", "Rank this list.", "Prioritise these accounts.", "Who should we go after first?", "Disqualify the bad ones.", "Tier this list."

**Not this recipe**: no list yet is [`build-tam.md`](build-tam.md) (companies) or [`prospecting.md`](prospecting.md) (people). People inside an account rather than a verdict on the account is [`account-expansion.md`](account-expansion.md) or [`prospecting.md`](prospecting.md). Deriving the profile from Closed-Won vs Closed-Lost data instead of asking for it is [`icp-discovery.md`](icp-discovery.md), which is the better version of step 1 when the user has a CRM. Soft, judgment-heavy criteria that a rule cannot decide go to the LLM rubrics in [`../references/prompt-library/lead-scoring.md`](../references/prompt-library/lead-scoring.md).

## Why this recipe is its own thing

The only paid step is enrichment. The score itself is arithmetic over the user's own criteria, so it runs in the agent for free and can be re-run every time the criteria change. What makes the output usable is not the number but the three columns beside it: the reason, the tier, and which fields were missing when it was scored. The failure this recipe guards against is a score built on criteria the user never stated: a number that looks objective and is not, which is worse than no score at all.

Read [`../provider-playbooks/aiArk.md`](../provider-playbooks/aiArk.md) and [`../provider-playbooks/companyEnrich.md`](../provider-playbooks/companyEnrich.md) before step 2.

## Recipe

### Step 1 — Get the profile out of the user, before any data

**Do not invent the profile.** Ask for it, and ask in the shape a score can be computed from. Four questions; stop when the answers are concrete:

1. **Which firmographics matter, and which way?** Headcount, industry, geography, founding year. "Bigger is better" is a direction; "50 to 500 employees" is a criterion.
2. **What disqualifies outright?** A wrong geography or a competitor is a zero, not a low score, and collapsing the two hides it.
3. **How should the criteria weigh against each other?** Equal weights are a fine default and are worth saying out loud rather than assuming.
4. **What are the tier cut-offs?** Ask for two numbers. Without them "tier A" is whatever the agent felt like.

Write the answers back to the user before running anything. That confirmation is the artifact: it is what makes the ranking arguable later. If the workspace context already holds an ICP (`cargo-ai context` — see [`../../cargo-context/SKILL.md`](../../cargo-context/SKILL.md)), read it and confirm it with the user rather than asking from scratch.

### Step 2 — Enrich the facts the score needs

One call per company, keyed on the domain. Enrich only the fields the criteria actually use: every extra enrichment is a bill for a column nobody scores on.

Start on the cheapest company rung, `aiArk.enrichCompany` (0.01, `domain` or `linkedinUrl`). Inputs go in `--records`; the action carries no `config`.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"enrichCompany"}' \
  --records '[{"domain":"acme.com"},{"domain":"globex.com"}]' \
  --wait-until-finished
```

Promote to `companyEnrich.enrichByDomain` (0.25) only the rows where a field a stated criterion needs came back empty, per [`../references/alternatives.md`](../references/alternatives.md). Never run the two side by side on the same rows: that pays 0.01 + 0.25 for overlapping firmographics.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"companyEnrich","actionSlug":"enrichByDomain"}' \
  --records '[{"domain":"umbrella.example"}]' \
  --wait-until-finished
```

`enrichByDomain` returns industry, employee count, revenue band, technologies, funding, socials and NAICS codes, which covers the firmographic criteria a scoring pass is normally built from. `employees` and `revenue` come back as **strings** (range buckets), not numbers: map them to the user's range before comparing.

**Both take the domain directly, with no resolution step in front of it.** That matters for cost more than it looks: a chain that has to resolve a company to an internal id first pays that resolution on every row, including the rows it then fails to enrich. The domain is a bare `company.com`, not a URL.

Operations are asynchronous. `--wait-until-finished` blocks until done; without it you get a batch UUID to poll with `cargo-ai orchestration batch get <uuid>` (5s). Read the per-row output with `cargo-ai orchestration batch download` — see [`../../cargo-analytics/SKILL.md`](../../cargo-analytics/SKILL.md).

**Approval gate.** Never run this across a full list on the first attempt. Run steps 2 and 3 on 10–20 rows, report the observed cost **and the score distribution**, then get the user to approve the full run, quoting the record count and the credit estimate, per [`../references/cost-discipline.md`](../references/cost-discipline.md). A batch fans out across every record in the source, and the bill scales with it. If every sample row lands in one tier, the criteria are not discriminating, and that is worth finding out at 20 rows rather than at 2,000.

### Step 3 — Score, and show the arithmetic

The scoring itself is arithmetic and belongs in the agent, not in a paid call. Do not spend a credit on a judgement a rule can make.

Every row carries four things, and dropping any one of them makes the list unusable:

| Column | Why it has to be there |
|---|---|
| `score` | the number |
| `reason` | which criteria it hit and missed, in words |
| `tier` | the cut-off it landed above |
| `missing` | which fields were absent when it was scored |

**A row scored on missing data is not a low-scoring row.** If firmographics came back empty, say `missing: headcount, industry` and leave it unranked rather than scoring it zero. Unresolved and unqualified look identical in a sorted list, and only one of them is worth a second attempt.

If a stated criterion genuinely needs judgment (a soft criterion that no field answers), use the `icp-fit-score` or `disqualification-check` prompt from [`../references/prompt-library/lead-scoring.md`](../references/prompt-library/lead-scoring.md) for that criterion only, at temperature 0, and keep the rest of the score as arithmetic. That prompt is a paid `anthropic.instruct` call per row, so it goes through the same pilot gate.

## Example

> Score the 20 companies in `webinar-accounts.csv` against our ICP: 50–500 employees, B2B software, US or UK, competitors out.

Illustrative output, fictional records:

| domain | score | tier | reason | missing |
|---|---|---|---|---|
| northwind.example | 92 | A | 240 staff, B2B software, US | |
| tailspin.example | 61 | B | B2B software, UK; 85 staff is small but inside range | |
| globex.example | 0 | — | disqualified: competitor | |
| umbrella.example | | unranked | | headcount, industry |

20 enriched with `enrichByDomain` for 5 credits (20 × 0.25): 4 tier A, 8 tier B, 5 tier C, 1 disqualified, 2 unranked for missing data. On the ladder in step 2, the same 20 cost 0.2 on `aiArk.enrichCompany` plus 0.25 for each row promoted.

## Cost

| Action | Credits |
|---|---|
| `aiArk.enrichCompany` | 0.01 |
| `companyEnrich.enrichByDomain` (rows the first rung left thin) | 0.25 |
| Scoring and tiering (in the agent) | 0 |

Every node execution also bills 0.01 credits (see [`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md), "The execution charge").

## Worth knowing

- **Both enrich actions need a domain, not a company name.** A list carrying only names has to be resolved first, and that is a different job: say so rather than sending names and reporting the misses as bad fits.
- **Scoring is deterministic and free.** Keep it that way: an LLM asked to "rate fit" produces a number nobody can reproduce or argue with.
- **Re-scoring after the criteria change costs nothing**, because the enrichment is already stored. Say so, because users assume otherwise and under-ask as a result. Firmographics do not decay fast; a scheduled re-enrich of a scored list re-bills unchanged data.
- **Richer firmographics exist at a higher tier** if a criterion genuinely needs them (`linkedin.enrichCompany` 0.25, `waterfall.enrichCompany` 1, `peopleDataLabs.enrichCompany` 3; see [`../references/credits-cost-table.md`](../references/credits-cost-table.md)). Reach for one only when a stated criterion cannot be answered from the fields above, never by default.
- **`companyEnrich` is rate-limited to 300 a minute**, so a five-figure list stretches over the better part of an hour.
- **Tiers on companies stay on companies.** If the next step is contacts at the tier-A accounts, the people step falls under [`../references/acceptable-use.md`](../references/acceptable-use.md).

## Related

- [`icp-discovery.md`](icp-discovery.md) — derives the criteria from won/lost deals; this recipe applies criteria the user states.
- [`../references/prompt-library/lead-scoring.md`](../references/prompt-library/lead-scoring.md) — LLM rubrics (ICP fit, tech-stack fit, composite P1/P2/P3 tier) for criteria arithmetic cannot decide.
- [`../references/prompt-library/qualification.md`](../references/prompt-library/qualification.md) — contact-level normalization and qualification (seniority, buying-committee role); this recipe scores accounts.
- [`review-and-iterate.md`](review-and-iterate.md) — when the user corrects tiers, turn the corrections into rules.
- [`save-as-play.md`](save-as-play.md) — score new rows as they arrive instead of once.
- [`../provider-playbooks/aiArk.md`](../provider-playbooks/aiArk.md), [`../provider-playbooks/companyEnrich.md`](../provider-playbooks/companyEnrich.md).
