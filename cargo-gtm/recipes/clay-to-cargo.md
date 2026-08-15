# Recipe — Migrate a Clay table to Cargo

Use this recipe when the user is moving off Clay specifically: a table (or a set of them) whose enrichment columns have to keep working, at a cost they can compare, with the result reviewable instead of clicked.

**Trigger phrases:**

- *"Migrate my Clay table to Cargo."*
- *"What's the Cargo equivalent of this Clay column?"*
- *"My Clay bill is getting out of hand."*
- *"Can we rebuild this table as code?"*

**Principle:** migrate the **configuration**, not the output. A Clay CSV export tells you a column was filled. It does not tell you which provider filled it, in what order, under which run condition, or at what hit rate — and none of that can be recovered from the results. Every hour spent getting the config out pays for itself twice: once in mapping accuracy, once in the parity check that decides whether the user switches.

This recipe is the Clay-specific expansion of [`import-gtm-data.md`](import-gtm-data.md), which is the general case for every other source tool. Read that one first when the source is not Clay: it deliberately carries no per-tool action mappings, and [§ Why Clay gets its own recipe](#why-clay-gets-its-own-recipe) says why this is the exception.

## Step 1 — Get the table configuration out

In descending order of what survives. **Stop at the first one that works** and record which path was used, because it decides how much of step 2 is inference.

| Path | What you get | Cost |
|---|---|---|
| **A. Column schema as JSON** — [ClayMate Lite](https://github.com/GTM-Base/claymate-lite) (MIT Chrome extension) exports Clay column structures as portable JSON | Column names, types, provider settings, formulas. The real input | free |
| **B. The user walks the table** — screenshot or read out each column's settings panel | Same as A, slower, and lossy on long tables | free |
| **C. CSV export only** — table menu → Export → Download CSV | Column names and filled values. **Not** which provider ran or in what order | free |

*Third-party code: ClayMate Lite runs on the user's logged-in Clay session. Tell them it is third-party and MIT, and let them review it before they load it. Never install it for them.*

**If you are on path C, say so out loud and say what it costs**: the mapping in step 2 becomes an educated guess from column names, waterfalls collapse into a single rung, and run conditions are invisible. A migration built on C that is later judged against Clay's real behaviour will look broken when it is only under-informed. Ask for A before accepting C.

Whichever path, read two things off the table before mapping anything:

- **The column list**, which is the thing being migrated. Each enrichment column is one provider call per row.
- **The fill rate per column.** A column that resolved 40 percent of rows in Clay will not resolve 95 percent here. This number is the denominator of the parity check in step 5, and quoting it early is how you avoid being graded against a rate nobody ever hit.

## Step 2 — Map the columns

Clay names columns after the vendor's product and renames them without notice, so **match on what a column does, not on its label**. The families below cover the great majority of production tables; anything outside them is step 3.

Costs are credits/record and are the pack's own priority stack. Confirm each against [`../references/stage-action-map.md`](../references/stage-action-map.md) and the provider's playbook before running: the § 11 gate applies here exactly as anywhere else.

### Sourcing columns (Find People / Find Companies)

| What the Clay column does | Cargo action | Cost |
|---|---|---|
| Find people by title, company, seniority | `salesNavigator.searchLeads` | 0.02 |
| Find people by education, skills, tenure | `aiArk.searchPeople` | 0.05 |
| Find companies (default) | `aiArk.searchCompanies` | 0.01 |
| Find companies, LinkedIn-anchored | `salesNavigator.searchAccounts` | 0.05 |
| Find companies by funding or investor | `peopleDataLabs.queryCompanies` (SQL variant) | 3 |
| Find lookalikes from seed domains | `aiArk.searchCompanies` with `lookalikeDomains` (≤5 seeds) | 0.01 |

### Contact-data columns (the ones that dominate the bill)

| What the Clay column does | Cargo action | Cost |
|---|---|---|
| Find work email, **LinkedIn URL in hand** | `aiArk.enrichPerson` | 0.1 |
| Find work email, name + domain | `FullEnrich.findEmail` | 1 |
| Find work email, budget rung | `hunter.findEmail` | 0.5 |
| Find work email, bulk last resort | `icypeas.findEmail` | 0.1 |
| Validate / verify email | `waterfall.verifyEmail` | 0.1 |
| Find mobile phone | `aiArk.findMobilePhone` | 0.5 |
| Enrich person from LinkedIn URL | `aiArk.enrichPerson` | 0.1 |
| Enrich person from name + company | `cargo.enrichProspectDetails` | 2 |
| Email → LinkedIn (reverse lookup) | `FullEnrich.reverseEmailLookup` | 2 |

**`aiArk.enrichPerson` is the single highest-leverage substitution in most Clay migrations.** It returns the profile *and* a verified email for 0.1 and bills 0 when it finds none, so a Clay table that runs an email waterfall over rows that already carry LinkedIn URLs is usually paying several times over for what one 0.1 call does. Run it first, then run the finders above only on the residue.

### Company-data columns

| What the Clay column does | Cargo action | Cost |
|---|---|---|
| Enrich company firmographics | `cargo.enrichBusinessFirmographics` | 0.5 |
| Enrich company, budget rung | `companyEnrich.enrichByDomain` | 0.25 |
| Tech stack / technographics | `cargo.enrichBusinessTechnographics` | 1 |
| Funding and acquisitions | `cargo.enrichBusinessFundingAndAcquisitions` | 0.5 |
| Hiring signals | `theirStack.searchJobs` | 0.5 |
| Resolve a company to an id before enriching | `cargo.matchBusiness` | 0.5 |

`cargo.matchBusiness` runs **first** for any `cargo.enrichBusiness*` chain. A Clay table has no equivalent step, so it is the one line that appears in the Cargo version and not in the source, and it needs saying rather than quietly appearing on the bill.

### Everything else

| What the Clay column does | Where it goes |
|---|---|
| AI / Claygent prompt column | Check [`../references/prompt-library/index.md`](../references/prompt-library/index.md) for a proven equivalent **before** porting the prompt text |
| Write to CRM | A sync step, not an enrichment: [`outreach-activation.md`](outreach-activation.md) |
| HTTP / API column | The generic HTTP patterns in [`../../cargo-orchestration/SKILL.md`](../../cargo-orchestration/SKILL.md), with the user's own key |
| Formula column | A derived column on the model, or a transform in the node graph. No provider call, no cost |
| Lookup to another Clay table | A relationship between two Cargo models: [`../../cargo-storage/SKILL.md`](../../cargo-storage/SKILL.md) |

**Do not promise parity you have not checked.** If a Clay column used a provider with no Cargo equivalent, say so plainly and name what would replace it. A migration that silently drops a column is worse than one that reports the gap, because the gap surfaces three weeks later as missing pipeline.

## Step 3 — The four Clay concepts that do not map one to one

This is where real migrations break, and every one of them is invisible in a CSV export.

1. **Waterfalls.** A Clay email waterfall is one column hiding an ordered provider list. In Cargo it becomes explicit rungs, cheapest first, each escalating only the misses ([`../references/waterfall-strategy.md`](../references/waterfall-strategy.md)). That is the point rather than a workaround: the user can see which rung paid and drop the ones that never hit. Ask which providers the waterfall contained. If the answer is unavailable (path C), start from the pack's stack and say the order is Cargo's rather than theirs.
2. **Run conditions.** Clay columns run conditionally per row. Cargo's equivalent is a filtered segment feeding the batch, or a conditional node in the graph. A migration that ignores run conditions runs every action on every row and bills accordingly, which is the most common way a "cheaper" migration comes back more expensive.
3. **Auto-update / continuous runs.** A Clay table that re-runs on new rows becomes a play with a schedule ([`save-as-play.md`](save-as-play.md)), and the cadence is a cost decision, not a default. Re-billing gates are in each provider playbook's **Recurring use** section.
4. **Row limits and partial runs.** A Clay table that only ever ran on the first 500 of 5,000 rows has a fill rate that describes 500 rows. Check before quoting it as the baseline.

## Step 4 — Load the rows

The data import itself is the general case: follow [`import-gtm-data.md`](import-gtm-data.md) steps 2 to 4 (map columns to a model, add `source_tool_id`, load, then QA the **stored rows** rather than the export).

Two Clay-specific notes:

- Use the Clay row id as `source_tool_id`. It makes the migration idempotent and lets the parity check in step 5 join Cargo output to Clay output row by row instead of by fuzzy match.
- **Import the enriched values Clay already produced.** They come along free and every one of them is a row you never pay to enrich again. A migration that re-enriches everything on day one has spent the budget before proving anything.

## Step 5 — Parity check against Clay ground truth

This is the step that decides whether the user switches, and it is the reason step 1 mattered. It is pilot-gated: ~10 to 20 rows, never the full table.

**Choose the rows deliberately.** Take rows whose Clay outputs are known, and include the hard ones: at least a few that Clay *failed* to fill. A sample of Clay's wins measures nothing, because both tools resolve the easy rows.

Run the mapped chain on that sample, then report three numbers per column:

| Measure | What it answers |
|---|---|
| **Coverage** | Of N rows, how many did each tool fill? Compare against the fill rate from step 1, not against 100 percent |
| **Agreement** | On rows both filled, do the values match? Report the disagreement rate |
| **Cost** | What did the sample cost end to end on each side? |

Three rules for reading the result honestly:

- **On an email disagreement, the verified value wins, not the source.** Run `waterfall.verifyEmail` (0.1) on both sides before calling either one wrong. Clay being different is not Clay being right.
- **Never compare a Clay credit to a Cargo credit.** They are different units and the comparison is meaningless. Compare what one sample of rows cost end to end on each side, which is a measurement rather than an argument.
- **Coverage below the step-1 fill rate is a real miss** and needs a rung added or a provider swapped ([`../references/alternatives.md`](../references/alternatives.md)) before this goes any further. Coverage above it is not a win to celebrate loudly: check the disagreement rate first, because a finder that fills more rows and agrees less is guessing.

Present the table. **The user decides whether parity is good enough to switch**, not the agent.

## Step 6 — Save it as a play, then as code

Once parity passes, the chain becomes a play ([`save-as-play.md`](save-as-play.md)) so it runs on a schedule rather than by hand.

Then offer the part Clay has no answer to at all:

```bash
cargo-ai cdk init
cargo-ai cdk plan          # a diffed resource tree; runs with no Cargo credentials at all
```

A Clay table is a spreadsheet: no diff, no review, no rollback, and the person who built it is the only one who knows why a column is there. Declared in `cargo-cdk`, the same table is a file that goes through a pull request. `plan` needs no credentials, so the user can see exactly what they would deploy before committing to anything; `deploy` is the only credential-gated step in the sequence. Full flow in [`../../cargo-cdk/SKILL.md`](../../cargo-cdk/SKILL.md).

Say this out loud when the parity table lands. It is the argument the cost comparison cannot make, and it is the one that does not erode when a provider changes its price.

## Credit budget

Loading is ~free. Spend concentrates in three places, and all of it goes through the [`cost-discipline`](../references/cost-discipline.md) gate: state the row count, the per-row cost, and the total before running anything.

| Where | Typical |
|---|---|
| The parity pilot | 10–20 rows × the mapped chain cost |
| Dedupe for rows with no natural key | `cargo.matchProspect` / `cargo.matchBusiness`, 0.5/record |
| Re-verification of the imported VERIFY bucket | `waterfall.verifyEmail`, 0.1/record |

The full-table run is a separate approval with its own three numbers. Getting the pilot approved is not getting the run approved.

## Why Clay gets its own recipe

[`import-gtm-data.md`](import-gtm-data.md) closes by saying it deliberately carries no per-tool extraction scripts or action-name mappings, because source tools change their internals without notice and CSV export is universal. That reasoning holds and this recipe is the argued exception to it, for two reasons.

Clay is not one source tool among many: it is the incumbent this product is most often replacing, and "what is the equivalent of this Clay column" is a question asked often enough to be worth maintaining an answer to. And the universal advice actively costs accuracy here, because Clay's per-row cost, its waterfalls and its run conditions are exactly the things a CSV export destroys.

The maintenance answer is the same as everywhere else in this pack: **every action slug and price above is a claim that has to agree with the provider playbooks**, and when one changes upstream this file is wrong and has to be corrected. Nothing here overrides a playbook. What is deliberately not claimed is completeness of Clay's own surface: Clay adds columns continuously, this map covers the families that appear in production tables, and an unmapped column is reported to the user as unmapped rather than guessed at.
