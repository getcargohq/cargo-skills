# Recipe — Watch target accounts for buying signals

**Use when**: the user has a list of target accounts and wants to know which of them are in market right now: hiring the role they sell into, saying something new in public, or turning up in a detection feed, each with a date and a link.

**Trigger phrases**: "Tell me when these accounts do something.", "What changed at my target accounts?", "Who is in market right now?", "Set up intent monitoring.", "Watch these companies for me.", "Any triggers on this list?"

**Not this recipe**: no account list yet is [`build-tam.md`](build-tam.md). Finding *new* companies by what they use or hire for, rather than watching a list you already have, is [`tech-intent.md`](tech-intent.md). Waking up stale contacts on a job change, funding or tech signal is [`re-engagement.md`](re-engagement.md). People moving jobs is [`job-change-monitoring.md`](job-change-monitoring.md), and funding rounds are [`funding-watch.md`](funding-watch.md). A verdict on fit rather than on timing is [`score-leads.md`](score-leads.md).

## Why this recipe is its own thing

Fit tells you who to talk to. Timing tells you when. This recipe answers only the second question, over a list the user already has, and reports one dated, linked row per account that fired. It runs a free rung across the whole list before any paid lookup, and it keeps timing out of the fit score.

Read [`../provider-playbooks/sillage.md`](../provider-playbooks/sillage.md), [`../provider-playbooks/theirStack.md`](../provider-playbooks/theirStack.md) and [`../provider-playbooks/x.md`](../provider-playbooks/x.md) first. For signals delivered into a model as they fire (hiring, fundraising, account watchlists), see [`../provider-playbooks/cargoSignals.md`](../provider-playbooks/cargoSignals.md). To turn a detected signal into a hypothesis or an outreach angle, use the prompts in [`../references/prompt-library/signal-analysis.md`](../references/prompt-library/signal-analysis.md) instead of writing new ones.

### A signal is not permission

A public event tells you a message might be *relevant*. It does not give you a *basis* for sending one. Those are different questions and only the first is answered here.

Before anything reaches a person, the basis has to stand on its own: an existing customer, someone who opted in, an event attendee, or a documented legitimate-interest case. **"They posted about it" is not a basis**, and neither is "they are hiring". If the basis is not there, the output of this recipe is research, and it stops here. The basis, suppression and relevance checks are in [`../references/acceptable-use.md`](../references/acceptable-use.md) §3.

## Recipe

### Step 1 — Ask what would actually change the conversation

**A signal only counts if it changes what you would say.** Ask, before running anything:

1. **What role do you sell into?** A company hiring that role is the strongest public trigger there is, and it is specific: "hiring a Head of RevOps" is a trigger, "hiring" is noise.
2. **What would they be saying publicly if they had the problem?** This becomes the phrase to watch.
3. **How fresh does it have to be?** A ninety-day-old job post is not a trigger. Get a number.

A watchlist built without these answers returns everything and means nothing, which is how signal monitoring gets switched off two weeks after it is set up.

### Step 2 — Free rung first

**Run the free detection read across the whole list before spending anything.** It costs nothing, so there is no list size at which checking first is the wrong move, and the rows it already covers never need a paid lookup.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"sillage","actionSlug":"searchLeads"}' \
  --data '{"modelUuid":"<the model receiving detections>","companyDomains":["acme.com","globex.com"],"limit":100}' \
  --wait-until-finished
```

`modelUuid` is required and must be a Sillage `listenSignals` model (resolve it with `cargo-ai storage model list`). Any other model fails with "is not a Sillage listen signals model", and one that has never run fails with "run the model once first". `limit` defaults to 25, max 100.

An empty result means nothing has been delivered for those accounts. That is not the same as "no signal exists", and only the second justifies the paid steps below. Say which one you got.

### Step 3 — The paid rungs, on the residue only

Run these only on the accounts step 2 did not cover, and pilot them first (Step 4).

```bash
# Hiring the role you sell into: the strongest public trigger, dated
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{
    "companyFields": {"company_domain_or": ["acme.com","globex.com"]},
    "fields": {"job_title_or": ["Head of RevOps","Revenue Operations"], "posted_at_max_age_days": 30},
    "limit": 50
  }' \
  --wait-until-finished

# What the company said in public
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"x","actionSlug":"getUserPosts"}' \
  --records '[{"handle":"acme","limit":20}]' \
  --wait-until-finished
```

`posted_at_max_age_days` is the freshness number from step 1. Without it the job search returns the back catalogue and every account looks like it is hiring. `searchJobs` bills 0.5 per job returned, so `limit: 50` can cost up to 25 credits; each job carries the company that posted it, so dedup on company.

Read company handles only. Reading `@acme`'s posts to understand a company is research; profiling an individual from their likes is not something this recipe does.

Operations are asynchronous. `--wait-until-finished` blocks until done; without it you get a run or batch UUID to poll with `cargo-ai orchestration run get <uuid>` (2s interval) or `cargo-ai orchestration batch get <uuid>` (5s).

### Step 4 — Pilot before the full list

**Never run the paid rungs across a full list on the first attempt.** Sample 10–20 accounts, report the observed cost and how many actually fired, then get the user to approve the full run, quoting the account count and the credit estimate. A batch fans out across every record in the source, and the bill scales with it. The gate is [`../references/cost-discipline.md`](../references/cost-discipline.md) §1.

The fire rate from the sample matters more than the cost. If two accounts in twenty fired, a weekly run over 500 accounts is worth it. If none did, the triggers from step 1 are wrong and running wider will not fix that.

### Step 5 — Report timing, not a score

One row per account that fired, and nothing for the accounts that did not. A watchlist that reports on every account teaches people to skim it.

| Column | Why |
|---|---|
| `signal` | what happened, in words |
| `date` | when. A signal with no date cannot be judged fresh |
| `source` | the link. A trigger nobody can open is a rumour |
| `so_what` | the one line about why it changes the conversation (the [`signal-analysis`](../references/prompt-library/signal-analysis.md) prompts write it) |

**Never merge this into a fit score.** Fit and timing answer different questions and averaging them produces a number that hides both: a perfect-fit account with no trigger and a poor-fit account hiring aggressively can land on the same value.

### Step 6 — Optional: keep it running

To keep the watchlist current rather than re-running it by hand, save it as a play ([`save-as-play.md`](save-as-play.md)). Read each provider playbook's **Recurring use** section first: match `posted_at_max_age_days` to the cadence (daily → 1–2 days) so each run bills only postings that appeared since the last one, and gate on accounts whose last check is older than the interval.

## Example

> Watch our 20 open-opportunity accounts and tell me which started hiring RevOps in the last 30 days.

Illustrative output, fictional records:

| account | signal | date | source | so_what |
|---|---|---|---|---|
| Northwind | Posted "Head of Revenue Operations" | 2026-09-21 | jobs.northwind.example/revops-head | The owner of our deal's process is about to change |
| Fabrikam | CEO post on consolidating GTM tools | 2026-09-15 | x.com/fabrikam_example/status/1 | Budget is being cut elsewhere; lead with consolidation |
| Tailspin | Posted "RevOps Analyst" | 2026-09-08 | jobs.tailspin.example/revops-analyst | A team is being built under our champion |

3 of 20 accounts fired and the other 17 are not listed; 2.1 credits (sillage free on all 20, 4 job posts × 0.5, 5 X lookups × 0.02).

## Cost

| Action | Credits |
|---|---|
| `sillage.searchLeads` | 0 (the `listenSignals` model it reads bills 0.5 per detection it receives, whatever the read cadence) |
| `theirStack.searchJobs` | 0.5 per job returned |
| `x.getUserPosts` | 0.02 per 100 posts returned (one package, so 0.02 an account at `limit` ≤ 100) |

Every node execution also bills 0.01, which the provider prices above leave out ([`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md)). Prices: [`../references/credits-cost-table.md`](../references/credits-cost-table.md).

## Worth knowing

- **The free rung is not optional.** `sillage.searchLeads` costs 0, so running it first is a pure saving. It needs a `modelUuid`, which is a setup step rather than a retry if detections are not being delivered yet.
- **`theirStack.searchJobs` key names.** Domains go in `companyFields.company_domain_or` and titles in `fields.job_title_or` (`job_title_pattern_or` for partial matches). A key outside its schema (`company_domains`, `job_titles`, a top-level `domain`) is refused by `action execute` / `execute-batch` (`Unknown field: …`), but inside a workflow node it is still dropped silently. In that case the search returns an unfiltered page and bills 0.5 for every job in it.
- **Confirm an X handle from the company's own site.** Squatted and parody handles resolve fine and return confident nonsense.
- **Engagement lists are not part of this recipe.** Followers, likers and retweeters engaged with a post; they did not ask to hear from you. Building a send list from them is the thing the basis test above exists to stop ([`../references/acceptable-use.md`](../references/acceptable-use.md) §2).
- **Re-running on a schedule is where the cost lives.** Gate on accounts whose last check is older than the interval, or every run re-bills accounts that did nothing.

## Related

- [`tech-intent.md`](tech-intent.md): sources new companies by tech stack or hiring intent. This recipe watches a list you already have.
- [`re-engagement.md`](re-engagement.md): the same signals, aimed at stale contacts and ending in re-engagement rather than a timing report.
- [`account-expansion.md`](account-expansion.md): a firing signal at a customer account is a reason to multi-thread it.
- [`outreach-activation.md`](outreach-activation.md): downstream, once the basis checks pass. `so_what` feeds its `signal_summary`.
- [`save-as-play.md`](save-as-play.md): turn the watchlist into a scheduled play.
- [`../references/prompt-library/signal-analysis.md`](../references/prompt-library/signal-analysis.md): prompts that turn a signal into a hypothesis, timing window or triage verdict.
- Provider playbooks: [`sillage`](../provider-playbooks/sillage.md), [`theirStack`](../provider-playbooks/theirStack.md), [`x`](../provider-playbooks/x.md), [`cargoSignals`](../provider-playbooks/cargoSignals.md).
