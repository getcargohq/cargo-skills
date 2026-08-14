# Recipe — Custom datapoints and live signals

Use this recipe when the user asks **which fields they should be collecting**, not how to fill a field they have already named. It designs an account schema — a shortlist of custom attributes and live signals specific to what they sell — then wires the survivors into columns, scoring, segments, and a refresh cadence.

**Trigger phrases:**

- *"What custom data points should we be collecting on our accounts?"*
- *"What buying signals should we watch for?"*
- *"Our scoring is industry + headcount and every competitor has the same list."*
- *"Design the enrichment schema for our ICP."*
- *"Given ten companies that all look the same, what would tell us which one to work first?"*

Adjacent recipes answer different questions: [`icp-discovery.md`](icp-discovery.md) derives fit from the user's own Won/Lost history (needs closed deals); [`source-planning.md`](source-planning.md) sources **one** field the user already named. This one runs when there are no closed deals to mine and no field named yet — the blank-page case.

## The failure this prevents

Any competent model will produce ten plausible attributes for any domain in one pass. The standard output of that exercise is a document where four attributes have no obtainable source, three cost more per account than the account is worth, and two were already columns in the workspace. It reads well and changes nothing.

The work is not generating candidates. It is **killing the ones that cannot be filled** — and the only honest way to do that is to name the action slug, the cost per account, and a probed hit rate before the list reaches the user.

## Step 0 — Whose accounts are we describing?

The domain in the ask is almost always the **seller**: the company whose GTM team wants better segmentation. The attributes you design describe **their target accounts**, not the seller.

Confirm in one line before researching anything — "so: attributes about the companies *you sell to*, designed from what *you* sell?" Read it backwards and you produce a competitor teardown instead of an enrichment schema, having spent the research budget on the wrong company.

If the user is a Cargo-side operator designing this *for* a prospect, the same rule holds one level out: research the prospect, design attributes about the prospect's customers.

## Step 1 — Read what the workspace already knows (free)

Three lookups, no credits. Any of them can end the recipe early.

```bash
cargo-ai context runtime browse                      # ICP / persona / proof docs already written?
cargo-ai storage model list                          # which model holds accounts
cargo-ai storage model get-ddl <companies-model-uuid> # which columns already exist, and their types
cargo-ai segmentation segment list                   # what the team already slices on
```

If the context repo already carries an ICP doc, this recipe **extends** it rather than restating it — and the output goes back to the same place (Step 8). If a proposed attribute is already a populated column, it is not a proposal, it is a reporting gap; say so and move on.

## Step 2 — Research the seller from public sources, not from memory

Model recall about a company is stale, thin for anything under ~1,000 employees, and confidently wrong about pricing and positioning. Fetch the pages.

```bash
# Crawl the seller's own site — homepage, product, pricing, docs, customers, careers
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"firecrawl","actionSlug":"crawl","config":{}}' \
  --data '{"url":"https://<seller-domain>","limit":25}' --wait-until-finished

# Sourced answers for anything the site does not state (funding, category, named competitors)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkup","actionSlug":"instruct","config":{}}' \
  --data '{"q":"Who does <seller> sell to, and who do they compete with?","depth":"standard","outputType":"sourcedAnswer"}' \
  --wait-until-finished
```

`instruct` takes `q` (a natural-language question) and a required `depth` — there is no implicit default, and `prompt` is not a field it accepts. See [`../provider-playbooks/linkup.md`](../provider-playbooks/linkup.md).

Read for the four things that actually generate attribute candidates — the homepage generates none of them:

| Page | What it tells you | Attribute it generates |
|---|---|---|
| **Pricing** | What a deal is worth, and what it scales on (seats, volume, entities, stores) | The unit the product is priced in is almost always the highest-value attribute — it *is* deal size |
| **Customer stories** | Who actually wins, in their own words | The shared conditions across logos; the "before" state each story describes is the pain to detect |
| **Docs / integrations** | Technical prerequisites | Compatibility attributes — what must already be in the stack for the product to install at all |
| **Careers** | What the seller is building next | Where the ICP is about to move; a role they are hiring for is a segment they intend to serve |

Cost: ~1–3 credits total. This is the cheapest step and it determines the quality of everything after it.

## Step 3 — Draft candidates against the discriminator test

For each candidate, ask the only question that matters: *given ten companies that already pass the standard firmographic filter, does this field tell me which one to work first?* If two companies with different values get the same treatment, cut it.

Split the candidates cleanly — the two feed different machinery downstream:

| | Attribute (state) | Signal (change) |
|---|---|---|
| Answers | What is true about this account? | Why is this account more relevant now than six months ago? |
| Example | 400 engineers; 12 countries; uses Salesforce | Engineering headcount +30% in 6 months; entered 3 new markets; migrating off HubSpot |
| Feeds | Scoring, tiering, territory design | Timing, triggers, sequence entry |
| Goes stale | Slowly — refresh on a cadence | Fast — has an expiry date |

"Uses AWS" is an attribute. "Started migrating to AWS" is a signal. A static fact dressed as a signal is the most common defect in this exercise, and it survives review because it reads urgent.

Two standing rules on the attribute side:

- **A generic firmographic earns its place only when it is unusually load-bearing** for this seller (founded-year for a remote-payroll product; entity count for a finance-automation product). Otherwise it is already in the CRM and gives no edge.
- **Aggregate, never dossier.** "Ratio of senior to junior engineers" as a company-level count is fine. The same question answered by profiling named individuals is not — see [`../references/acceptable-use.md`](../references/acceptable-use.md).

## Step 4 — The feasibility gate

Every surviving candidate gets an action slug and a price, or it gets cut. "Likely source: job postings" is not a source; `theirStack.searchJobs` at 0.5 credits is.

| What you want to know | Cheapest catalog path | Credits/account | Coverage to expect |
|---|---|---|---|
| Function headcount, seniority mix, SDR:AE ratio, eng-as-share-of-total | `salesNavigator.findEmployeesDistribution` | 0.25 | High where a LinkedIn company page exists |
| Headcount growth or decline | `salesNavigator.findCompanyMetrics` (0.25), or `cargo.enrichBusinessWorkforceTrends` (1) | 0.25–1 | Medium–High |
| Tech stack | `cargo.enrichBusinessTechnographics` (1) or `theirStack.searchTechnologies` (0.5) | 0.5–1 | Medium — detection favors client-side and vendor-declared tech; back-office tools are near-invisible |
| Hiring intent — which roles, how many, how recent | `theirStack.searchJobs` (0.5) or `linkedin.searchJobs` (0.5) | 0.5 | Medium–High |
| Funding, M&A | `cargo.enrichBusinessFundingAndAcquisitions` | 0.5 | High for VC-backed, structurally absent for bootstrapped |
| Business events — openings, launches, leadership moves | `cargo.fetchBusinessEvents` | 0.5 | Medium |
| Positioning or website change | `cargo.enrichBusinessWebsiteChanges` (1), `enrichBusinessWebsiteKeywords` (0.5) | 0.5–1 | Medium |
| Stated challenges, competitive landscape | `cargo.enrichBusinessChallenges` / `enrichBusinessCompetitiveLandscape` / `enrichBusinessStrategicInsights` | 1 each | Medium |
| **Anything stated on one specific page** — trust center, store locator, supported currencies, integration directory, entity list | `firecrawl.scrape` (0.05) → `anthropic.instruct` haiku (0.2) | ~0.25 | Entirely determined by whether that page exists — probe it |
| A question no structured provider carries | `linkup.instruct` (1, sourced) or `perplexity.instruct` (0.3–1) | 0.3–1 | Always answers; whether it answers *correctly* is what the probe measures |
| Review/category presence | `piloterr.getG2ProductInfo` (0.01), `g2.enrichProduct` (1) | 0.01–1 | Low–Medium, category-dependent |

The `firecrawl.scrape` → `anthropic.instruct` row is the workhorse of this recipe: it is how a company-specific attribute nobody sells — *does this company publish a SOC 2 badge? how many store locations does the locator list? which currencies does checkout accept?* — becomes a real column for about a quarter of a credit. Use [`../references/prompt-library/data-extraction.md`](../references/prompt-library/data-extraction.md) → `custom-attribute-extraction` for the extract step rather than writing the prompt fresh.

Two cost mechanics that change the arithmetic:

- Every `cargo.enrichBusiness*` action needs a `business_id` from `cargo.matchBusiness` (0.5) first. That is **once per account**, amortized across every cargo enrichment you run — so batch the cargo-native attributes together or the match cost lands on each one separately.
- Search-shaped actions (`theirStack.searchJobs`, `salesNavigator.*`) bill per returned row. Keep `limit` strict; see [`../references/cost-discipline.md`](../references/cost-discipline.md) §4.

Anything left with no row here is a research note, not a datapoint. Say that plainly in the deliverable — "valuable, no obtainable source" is a legitimate and useful line item, and it is the honest version of what the exercise usually pads with.

## Step 5 — Probe before you promise

Take 5–10 **representative** accounts (not the ten biggest — they are the best-covered and will flatter every candidate) and run each surviving candidate against them. Full mechanics in [`source-planning.md`](source-planning.md) §3.

Record only: hit rate, **cost per hit** (cost per row ÷ hit rate), correctness on 3 spot-checks, freshness. Kill any candidate whose cost-per-hit exceeds what the decision it drives is worth. A 0.25-credit attribute at 20% coverage costs 1.25 per answer and leaves 80% of the list `Unknown` — which is a worse input to a score than not having the column, because a null reads as a low value in every naive scoring model.

Budget for this step: roughly 10–40 credits for a 6–10 candidate shortlist at 10 accounts each.

## Step 6 — Present the shortlist, then wait

The deliverable is a costed table, not an essay. Present it and stay in AWAIT_APPROVAL — the fan-out behind it is the expensive part.

> **Schema for `<seller>` — 6 attributes, 3 signals survived of 17 candidates**
>
> | # | Field | Type | Source | Cost/acct | Probe hit | Refresh | Decision it changes |
> |---|---|---|---|---:|---:|---|---|
> | 1 | `eng_headcount_est` | number | `salesNavigator.findEmployeesDistribution` | 0.25 | 9/10 | Monthly | Tier + seat-count estimate |
> | 2 | `has_platform_team` | boolean | same call, title parse | 0.00 | 9/10 | Monthly | Routes to the technical persona |
> | 3 | `soc2_status` | enum | `firecrawl.scrape` /security + extract | 0.25 | 6/10 | Quarterly | Kills or unlocks enterprise motion |
> | 4 | `ai_tool_state` | enum | `cargo.enrichBusinessTechnographics` | 1.00 | 4/10 | Quarterly | Displacement vs greenfield play |
> | … | | | | | | | |
>
> **Cut, with reason:** exact competitor spend (no source at any price) · contract renewal date (not public) · "is growing" (not discriminating) · industry (already a column).
>
> **Full-list arithmetic:** 6 attributes × 4,100 accounts = **~7,400 credits** at the probed rates. Balance is 12,000.
> **Cheaper cut:** drop #4 and #6 (the two 1-credit cargo enrichments) → ~3,200 credits, keeps 80% of the scoring signal.
> **Narrower cut:** run all 6 on the 900 accounts already in the Tier-1 segment → ~1,600 credits.

Three shaped options, a default, the reconciled balance — the standard approval shape from [`../references/cost-discipline.md`](../references/cost-discipline.md).

That arithmetic is the whole reason the feasibility gate exists. Designing ten attributes is free. Filling ten attributes across a TAM is a four-figure credit line, and the user should see it before agreeing rather than after.

## Step 7 — Operationalize: columns, batch, score

An attribute that lives in a chat reply is a research note. Give it a column.

```bash
# One column per approved attribute
cargo-ai storage column create --model-uuid <companies-model-uuid> \
  --column '{"slug":"eng_headcount_est","type":"number","label":"Est. Engineering Headcount","kind":"custom"}'

# Inferred attributes get a companion confidence column — never store an inference bare
cargo-ai storage column create --model-uuid <companies-model-uuid> \
  --column '{"slug":"eng_headcount_est_confidence","type":"string","label":"Est. Eng Headcount — Confidence","kind":"custom"}'
```

Add the confidence companion only for attributes that are **inferred or estimated**, not for ones read directly off a page — one extra column per uncertain field, not a doubling of the schema.

Then fill them: pilot on 10–20 accounts, present the receipt, get approval, fan out. Standard batch mechanics in [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md); retrieve with `run download-outputs`.

Scoring is where the schema earns out. Assign points per attribute band, and be explicit that `Unknown` scores **neutral, never zero** — a missing value is absence of evidence, and scoring it as a negative systematically buries every account with thin public presence, which correlates with size, not with fit.

## Step 8 — Refresh, or it dies

Stale custom data is worse than none: it looks authoritative and is wrong. Set the cadence from how fast the underlying thing can actually change.

| Attribute family | Cadence | Mechanism |
|---|---|---|
| Job postings, hiring volume | Weekly | Scheduled play |
| Executive / leadership changes | Weekly | Scheduled play |
| Headcount, function distribution | Monthly | Scheduled play |
| Tech stack, certifications, entity counts | Quarterly | Scheduled play |
| Funding, M&A, market entry | Event-driven | `cargo.fetchBusinessEvents` on a weekly sweep |

Turn each cadence into a play — [`save-as-play.md`](save-as-play.md). Before deploying, read the **Recurring use** section of the playbook for every paid node: a play re-bills its full node graph on every scheduled run, so a monthly refresh of 4,100 accounts at 1.75 credits is ~7,200 credits **per month**, not once.

**In Cargo, a live signal is a tracked column diff.** That is the mechanical link between Step 3's signal list and something that fires. Create the segment with the signal-bearing attributes as tracking columns, then read its delta feed:

```bash
cargo-ai segmentation segment create --name "ICP — signal watch" \
  --model-uuid <companies-model-uuid> \
  --filter '{"conjonction":"and","groups":[{"conjonction":"and","conditions":[
    {"kind":"string","columnSlug":"icp_tier","operator":"is","values":["tier-1","tier-2"]}
  ]}]}' \
  --tracking-column-slugs "eng_headcount_est,ai_tool_state,soc2_status"

cargo-ai segmentation change list --segment-uuid <segment-uuid>
cargo-ai segmentation change fetch --uuid <change-uuid> --kinds updated
```

Three flag traps in those four lines, each of which fails quietly or with a bare 400:

- **Conditions live inside `groups`, never beside them.** `{"conjonction":"and","groups":[]}` is the match-everything filter, so a top-level `conditions` array is ignored and the segment silently becomes the whole model — with the tracking and refresh spend that implies.
- **The spelling is `conjonction`.** Misspelled, it matches nothing without erroring.
- **`change fetch` takes `--uuid`** — the *change* UUID from `change list`, not the segment UUID — plus a required `--kinds`. See [`../../cargo-segmentation/SKILL.md`](../../cargo-segmentation/SKILL.md).

And `updatedRecordsCount` stays `0` unless `--tracking-column-slugs` was set **at creation** — the single most common way this whole motion silently produces nothing.

For volume-level watching ("tell me when more than 5 accounts pick up the signal this week"), add a model-scoped alert with a filter — [`../../cargo-observability/SKILL.md`](../../cargo-observability/SKILL.md). Preview it before creating it.

## Evidence rules

These are not stylistic. Each one prevents a specific wrong answer that scores well.

**Technology usage is not a boolean.** One engineer's profile, one job posting, and a company-wide mandate are different facts. Store the state, not `true`:

`company_standard` · `approved_tool` · `team_usage` · `individual_usage` · `pilot_or_evaluation` · `historical` · `none_found` · `unknown`

A single job posting establishes `individual_usage` at best — and a tool listed under "nice to have" establishes nothing at all. Use [`../references/prompt-library/data-extraction.md`](../references/prompt-library/data-extraction.md) → `technology-adoption-state` to classify the evidence rather than eyeballing it.

**Confidence is a band, and `Unknown` is a valid answer.** Confirmed (explicit, current, authoritative source) · Inferred (several consistent indirect sources, no contradiction) · Estimated (calculated from partial public data — numeric fields only) · Unknown (insufficient or contradictory). The first three are all storable, tagged with the band that produced them; anything that reaches none of them returns `Unknown` rather than a value — an unsupported assertion in a scoring column is a decision made on noise, and it is invisible once the value is written. `Estimated` means arithmetic on figures you actually have, not a plausible-sounding number.

**Store the evidence with the value** for anything above trivial cost. A quoted phrase and its URL in the companion column is what makes the value auditable six months later, and it is the difference between a rep trusting the field and ignoring it.

**Known false positives to name in the deliverable:** duplicated or stale job postings inflating hiring counts; leadership changes that carry no budget; funding earmarked for something unrelated; technology mentions that are historical; repository activity from a two-person open-source side project.

## First-party datapoints: separate list, separate model

Product usage, activation, billing history, renewal risk, and website-visitor data (`snitcher.searchSessions`, 0 credits) are **unavailable for net-new accounts by definition** — a prospect has never logged in. Keep them out of the net-new schema entirely, and list them separately if they come up: they are excellent inputs to an *expansion* or *health* score over accounts that already exist ([`account-expansion.md`](account-expansion.md)), and mixing them into a prospecting score silently ranks customers above prospects.

## Deliverable

What the user gets at the end: the costed shortlist table from Step 6, the cut list with reasons, the refresh cadence per field, and — once approved and filled — the columns, the segment, and the play. Write the schema itself back to the context repo so the next person inherits the reasoning instead of re-deriving it:

```bash
cargo-ai context runtime write --path icp/account-attributes.md \
  --content '<the schema, its sources, probed hit rates, and the cut list>' \
  --commit-message "Add custom account attribute schema"
```

The cut list is the most valuable half of that document. "We tested competitor-spend detection and there is no source at any price" saves the next person the same two days.

## Related

- [`source-planning.md`](source-planning.md) — sourcing **one** named field; Step 5 here is its probe loop.
- [`icp-discovery.md`](icp-discovery.md) — the same goal from the other end: derive fit from Closed-Won vs Closed-Lost instead of from public research. Run both when there are closed deals; their answers should agree.
- [`tech-intent.md`](tech-intent.md), [`funding-watch.md`](funding-watch.md) — two signals already built end-to-end; use them as the implementation template.
- [`save-as-play.md`](save-as-play.md) — turning the refresh cadence into something that runs.
- [`../references/prompt-library/index.md`](../references/prompt-library/index.md) — `custom-attribute-extraction`, `technology-adoption-state`, `icp-fit-score`, `signal-triage`.
- [`../references/cost-discipline.md`](../references/cost-discipline.md) — the approval shape Step 6 uses.
