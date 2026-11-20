# Recipe — Extract a Sales Navigator search past the cap

**Use when**: the user has a Sales Navigator search (accounts or people) that counts more than one extraction can hold, and wants all of it.

**Trigger phrases**: "My Sales Nav search has 30,000 results.", "Extract more than 1,000 accounts from Sales Navigator.", "Get past the 2,500 lead limit.", "The extraction stopped at 1,000.", "Pull every company in this Sales Nav search."

**Not this recipe**: a search already under the cap goes straight to step 5. A list built from filters rather than a pasted search URL is [`build-tam.md`](build-tam.md) (companies) or [`prospecting.md`](prospecting.md) (people). A list that should stay current is the `tam-building` cookbook (`../../cargo-project/references/cookbooks.md`).

## Why this recipe is its own thing

A Sales Navigator search extracts at most **1,000 accounts** or **2,500 people** per search URL. Anything past the cap is silently dropped: the run succeeds, the rows stop. Getting the whole search means counting it, splitting it into searches that each fit under the cap, merging those back into the **fewest** searches that still fit, and loading them into a handful of models instead of hundreds.

Read [`../provider-playbooks/salesNavigator.md`](../provider-playbooks/salesNavigator.md) first. In people mode, [`../references/acceptable-use.md`](../references/acceptable-use.md) applies to what the list is for.

## The two modes

|                  | Accounts                                                     | People                                                                          |
| ---------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Search URL       | `https://www.linkedin.com/sales/search/company?query=…`      | `https://www.linkedin.com/sales/search/people?query=…`                          |
| Cap per search   | 1,000                                                        | 2,500                                                                           |
| Counter          | `searchCompanyMetrics` → `total_results`                     | `searchPersonMetrics` → `total_leads`                                           |
| Model extractor  | `fetchAccountSearch`, `limit` up to 1,000                    | `fetchLeadSearch`, `limit` up to 2,500                                          |
| Split levers     | industry → geography → headcount growth → followers          | geography → seniority → years in role → function → company size → job title     |
| Dedup key        | `sales_navigator_company_id`                                 | `linkedin_profile_id`                                                           |

A search that fits under the cap goes as is, even at 2,494 of 2,500: counts drift (~15% over a few days), but a model you refresh picks up the people who join later, so re-count right before you extract rather than splitting to a margin.

## Recipe

### Step 1 — Count the search

Paste the search URL from the Sales Navigator address bar, minus anything after `&` that is not `query` (`sessionId`, `recentSearchParam`, `viewAllFilters`). Inputs go in `--data`; the action carries no `config`.

```bash
# accounts
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchCompanyMetrics"}' \
  --data '{"url":"https://www.linkedin.com/sales/search/company?query=(filters%3AList(...))"}' \
  --wait-until-finished

# people
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"salesNavigator","actionSlug":"searchPersonMetrics"}' \
  --data '{"url":"https://www.linkedin.com/sales/search/people?query=(filters%3AList(...))"}' \
  --wait-until-finished
```

The count is `runContext.action.total_results` (accounts) or `runContext.action.total_leads` (people). Both are exact, even far above the cap. The other people counters (`new_leads`, `leads_posted_recently`, …) are rounded strings like `"28K+"`; ignore them. Under the cap? Skip to step 5 with the one URL.

### Step 2 — Split until every piece fits

Treat the search as a box of filters. When a box is over the cap, add **one** lever, cut it into values, and count each child. Recurse only into the children that are still over. Order the levers so the biggest, cleanest cut comes first:

- **Accounts:** industry groups, then geography (country → state or region → the rest), then 1-year headcount growth bands, then follower bands.
- **People:** geography, then seniority, then years in current position, then function, then company headcount and industry, then job title last.

Prefer levers whose values cover everyone. Measured on one people search, the pieces added back up to: years in current position 98%, years of experience 97%, years at company 96% (the gap is people with the field empty), seniority 127% (people carry overlapping levels; dedupe absorbs it). Bands that share an edge (growth `0..5` and `5..10`) count edge values twice, which is safe; a gap between bands loses them.

**Job titles split cleanly only as a chain.** `A`, then `B excluding A`, then `C excluding A and B`, so no one lands twice and no one falls between. Check the chain against its parent: on one search, `revenue operations` (7,473) + `sales operations, excluding revenue operations` (30,892) = 99% of the `revenue operations OR sales operations` parent (38,726).

Build the URL in the query format, never the legacy `?geoIncluded=` form, which has no growth, follower or title filters:

```text
(filters:List(
  (type:REGION,values:List((id:103644278,selectionType:INCLUDED))),
  (type:INDUSTRY,values:List((id:4,selectionType:INCLUDED))),
  (type:COMPANY_HEADCOUNT,values:List((id:D,selectionType:INCLUDED))),
  (type:COMPANY_HEADCOUNT_GROWTH,rangeValue:(min:0,max:10)),
  (type:NUM_OF_FOLLOWERS,values:List((id:NFR4,selectionType:INCLUDED))),
  (type:CURRENT_TITLE,values:List((text:revenue%20operations,selectionType:INCLUDED)))))
```

- **Encode the whole query**, colons and commas included, leaving only the parentheses. Title text is encoded once inside, then again with the rest (`revenue%2520operations`). Id-only searches tolerate sloppy encoding; a title filter returns **0** unless it is fully encoded.
- **Look up ids, do not guess them.** `cargo-ai connection connector autocomplete --connector-uuid <your salesNavigator connector> --slug <list> --params '{}'` with `listIndustries`, `listGeoCodes` (countries only), `listCompanyHeadcounts` (`A` self-employed … `I` 10,001+), `listSeniorityLevels`, `listFunctions` or `listYearsOfExperiences`. `YEARS_IN_CURRENT_POSITION` and `YEARS_AT_CURRENT_COMPANY` take the same 1–5 codes as `YEARS_OF_EXPERIENCE`. For a state, city or region id, set it once in the Sales Navigator UI and read it off the URL.
- Industries are a tree: including a parent includes its children, so carve a parent into groups with `selectionType:EXCLUDED` on the children you split out.
- In people mode, `REGION` is where the **person** lives. Company headquarters is a separate filter.

### Step 3 — Merge back to the fewest searches

Splitting leaves many small pieces (three searches of 250). Merge them: two pieces combine when they differ in exactly **one** lever whose values can sit together in one URL.

- **Always mergeable:** headcount bands, follower bands, seniority, functions, industry groups (the merged exclusions are every excluded id minus every included one, which only works if your groups carve the tree without overlap).
- **Geography:** only when neither piece carries its own exclusions. "United States, excluding ten states" stays on its own; ten separate states merge freely.
- **Growth ranges and title chains:** only neighbours (one `min..max` per URL; `A OR B` only if neither carries an exclusion).

A merged search can never count more than the sum of its parts, so pack by sum up to the cap (1,000 or 2,500), largest piece first, into the first search it fits. One account run went from 261 searches to 81.

### Step 4 — Count every merged search again

Counts drift, and a search that crosses the cap silently loses its overflow. Re-count each final URL with step 1; split back any that came out over. Also compare each merged count with the sum of its parts: well under 85% means an exclusion is removing more than you meant.

**Approval gate.** Steps 1–4 only count (0.25 a call). Before step 5, extract one small search (a few hundred rows) to confirm the URLs extract as counted, then present the number of searches, models and expected rows with the credit estimate, per [`../references/cost-discipline.md`](../references/cost-discipline.md), and wait for the go.

### Step 5 — Load them into a few models

One model holds many search URLs. Pack the final searches so each model carries roughly 10,000 rows: enough models to extract in parallel, few enough to manage. Balanced packing (largest search to the lightest model) beats filling one model at a time.

```bash
cargo-ai storage dataset list    # the salesNavigator dataset's uuid
cargo-ai storage model create --slug large_search_part_01 --name "Large search · part 01" \
  --dataset-uuid <salesNavigator dataset uuid> --extractor-slug fetchAccountSearch \
  --config '{"urls":["https://www.linkedin.com/sales/search/company?query=...","..."],"limit":1000}'
```

People: `--extractor-slug fetchLeadSearch` and `"limit":2500`.

**Always cookieless.** No LinkedIn account, cookie or seat: never add `identityIds` to a model, count or search. Running through a person's own LinkedIn account puts that account at risk of being restricted, and nothing in this recipe needs it.

The one exception is a search built on filters that only exist from someone's own account: saved lead or account lists, saved leads and accounts, connection degree (1st / 2nd / 3rd), connections of, TeamLink, past colleagues, people who follow your company or viewed your profile. Those return nothing useful cookieless. If the user's search uses one, tell them it needs their own Sales Navigator seat and let them decide; only on their explicit yes, add `"identityIds":["<their seat id>"]` (list seats with `cargo-ai connection connector autocomplete --connector-uuid <your salesNavigator connector> --slug listIdentityIds --params '{}'`).

**People models run three times.** Cookieless, each run returns a different 75–88% of the search, and a model keeps the rows from earlier runs, so two forced re-runs after creation close the gap:

```bash
cargo-ai storage run create --model-uuid <uuid> --is-force true   # after the first run finishes; twice
```

Measured: 154 → 198 → 203 on a 204-person search, and 3,149 → 4,082 → 4,388 unique people on a search counted at 4,052 (three overlapping searches). Creating the model starts the extraction; the first rows you see are a 25-row preview, the rest land when the run finishes.

### Step 6 — Check what landed, then dedupe

`cargo-ai storage run list --model-uuid <uuid>` until each run is `success`, then count rows per model with `cargo-ai storage query execute`. Sales Navigator returns fewer records than it counts, and the gap differs by mode:

- **Accounts:** ~95% of the count (54,146 extracted of 56,516 counted, across 81 searches).
- **People:** one run returns 75–88% of the count, a **different subset each run** (153, then 179, of the same 204); after the three runs of step 5, ~99–100% (203 of 204; 4,388 from a 4,052 count). Splitting smaller does not close the gap; re-running does. If a model holds well under the count, re-run it again before anything else.

Dedupe across models on the dedup key; band edges and overlapping seniority put some records in two searches.

## Example

> Extract every software company with 51–200 employees in the US from Sales Navigator.

Illustrative output, fictional records:

| Search after merging | Count |
| --- | --- |
| Software · 51–200 · California excl. San Francisco · growth -100..5 | 941 |
| Software · 51–200 · California excl. San Francisco · growth 5..1000 | 702 |
| Software · 51–200 · San Francisco | 873 |
| Software · 51–200 · Texas, Florida, Georgia | 948 |
| Software · 51–200 · New York, Massachusetts | 932 |
| Software · 51–200 · Washington, Illinois, Pennsylvania, Virginia | 811 |
| Software · 51–200 · rest of US · growth -100..0 | 908 |
| Software · 51–200 · rest of US · growth 0..1000 | 726 |

6,841 counted, 8 searches in one model, 6,567 rows extracted. 24 count calls (6 credits) and 1,313.4 credits of extraction (6,567 × 0.2).

## Cost

| Action | Credits |
| --- | --- |
| `salesNavigator.searchCompanyMetrics` | 0.25 |
| `salesNavigator.searchPersonMetrics` | 0.25 |
| Extraction through `fetchAccountSearch` or `fetchLeadSearch`, per row returned | 0.2 |

Counting is cheap; extraction is the bill. A 50,000-account market costs a few hundred count calls and ~10,000 credits of extraction. People models run three times, and each run bills the rows it returns, so budget up to three times the count for people until the pilot shows what a re-run actually bills.

## Worth knowing

- **Workspace limits are separate from the per-search cap.** A workspace has a rolling 24-hour allowance of Sales Navigator search requests, shared by counts and extraction pages (~25 rows a page). A model that hits it errors and keeps only its preview; a rerun starts over. Before a large run, estimate the requests (one per count, one per ~25 extracted rows, times three for people) and ask Cargo to confirm or raise the allowance (`cargo-ai workspaceManagement report create`).
- **An error saves nothing.** Extraction is all or nothing per model run, so smaller models lose less when something breaks.
- **`number_employees` on an extracted account is the page's own label**, not the headcount Sales Navigator filtered on. Re-measure size downstream if it matters.
- **A union never exceeds its parts.** That is what makes packing by sum safe without re-counting every candidate merge; step 4 re-counts the winners.
