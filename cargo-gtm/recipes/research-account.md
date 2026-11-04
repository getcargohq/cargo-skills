# Recipe — Research one account before a meeting

**Use when**: the user has one company (a domain) and a meeting coming up, and wants a one-page briefing: what the company does, what it publicly says is hard right now, who it names as competition, and what it is hiring for, with every line traceable to where it came from.

**Trigger phrases**: "Research this company.", "Brief me on this account.", "Prep me for this meeting.", "What should I know about them?", "Write me a one-pager on Acme.", "What are they struggling with?", "Who do they compete with?"

**Not this recipe**: many companies filtered rather than one understood is [`build-tam.md`](build-tam.md), or [`tech-intent.md`](tech-intent.md) when the filter is what they use or hire for. The people to contact at the account is [`find-stakeholders.md`](find-stakeholders.md), or [`account-expansion.md`](account-expansion.md) when the account is already a customer. A research column added to a whole list (firmographics, two-liners, a structured research field per row) is [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md) with the prompts in [`../references/prompt-library/company-research.md`](../references/prompt-library/company-research.md).

## Why this recipe is its own thing

The provider playbooks each describe one action. A briefing is four of them in a fixed order, each chosen because it returns something with a source attached, plus a writing rule that the playbooks do not carry: **every line is either sourced or marked as a guess, and the two never blend.** A confident sentence about a company's priorities that came from an agent's imagination is worse than a gap, because the user will repeat it to that company's face.

Read [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md), [`../provider-playbooks/parallel.md`](../provider-playbooks/parallel.md) and [`../provider-playbooks/theirStack.md`](../provider-playbooks/theirStack.md) before the first paid call. Everything here is company-level and reads public material; nothing in this recipe looks up or contacts a person.

## Recipe

### Step 1 — Ask what the briefing is for

Two sentences from the user change what is worth pulling, so ask before spending anything: **what is the meeting, and what are you selling them?**

A discovery call and a renewal need different pages. Without the answer the briefing becomes a company profile, which the user could have read on the website for free.

Ask for the **domain**, not the company name. Every call below keys off it.

### Step 2 — Pull it, from sources you can name

Four calls. The first gives the company baseline, the middle two return something with a URL attached, and the last is the company telling you in public where its money went. One account means one record, so each is an `action execute` with its inputs in `--data`; the action object carries no `config`.

```bash
# 1. The baseline: what they are, how big, what they say they do
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"enrichCompanyFromDomain"}' \
  --data '{"domain":"acme.com"}' \
  --wait-until-finished

# 2. Their own words, read from their own pages
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"parallel","actionSlug":"extract"}' \
  --data '{"urls":["https://acme.com","https://acme.com/careers"],"objective":"What the company says it does, and which teams it is growing"}' \
  --wait-until-finished

# 3. The research question, structured, with its sources
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"parallel","actionSlug":"createTask"}' \
  --data '{"input":"What has Acme publicly said about its priorities and challenges in the last 12 months, and who does it name as competitors?","processor":"lite","outputSchema":"{\"type\":\"object\",\"properties\":{\"priorities\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"competitors\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}},\"sources\":{\"type\":\"array\",\"items\":{\"type\":\"string\"}}}}"}' \
  --wait-until-finished

# 4. What they are hiring for, which is what they are spending on
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchJobs"}' \
  --data '{
    "companyFields": {"company_domain_or": ["acme.com"]},
    "fields": {"posted_at_max_age_days": 90},
    "limit": 25
  }' \
  --wait-until-finished
```

**Two settings must not be dropped.** `processor: "lite"` pins the cheapest rung of a ladder that runs to 60 credits a record. Leave it out and the task runs on the default, `core`, at 0.625 credits: five times the price, with no error to tell you. And the `sources` array in `outputSchema` is what makes call 3 checkable: without it the task returns confident prose with nothing behind it, which reads exactly like the verified kind. `outputSchema` is that JSON schema **as a string**; pass it as an object and it fails validation (in a batch, every record fails while the batch itself reports success).

Open roles are the most under-used input in account research: a company hiring six data engineers is telling you where its budget went, in public, dated, and for 0.5 credits a posting.

Operations are asynchronous. `--wait-until-finished` blocks until done; without it you get a run UUID to poll with `cargo-ai orchestration run get <uuid>` (2s interval). The provider's output is under `runContext.action`.

**More than one account?** Swap each call to `action execute-batch` with one object per account in `--records` (it has no `--data` flag). Before fanning out over more than ~20 accounts, run 10–20 first, report the observed cost and how many came back with usable sources, then get the user to approve the full run, quoting the account count and the credit estimate — see [`../references/cost-discipline.md`](../references/cost-discipline.md). Lower `limit` on `searchJobs` for a list; it is the term that scales.

### Step 3 — Write the briefing, and mark what is inferred

Keep it to one page. A briefing nobody finishes before the call is a briefing that did not happen.

Every line is one of three kinds:

- **Sourced**: it came back from a call above. Say which (`[linkedin]`, `[site]`, a dated source URL from `createTask`, `[jobs]`).
- **Inferred**: you reasoned it from what came back. Prefix it `Likely:` and say what it rests on.
- **Unknown**: say so. "No public statement on this" is a usable line in a call and a fabricated one is not.

Close with **three questions to ask them**, drawn from the challenges rather than from a template. That is the part a human keeps.

To turn the extracted page text into a two-liner or a positioning summary, the `company-two-liner` and `competitive-positioning-summary` prompts in [`../references/prompt-library/company-research.md`](../references/prompt-library/company-research.md) already follow the same rule: only claims present in the text, and `NULL` rather than a guess.

## Example

> I have a discovery call with Fabrikam tomorrow — we sell data-pipeline monitoring. Brief me.

Illustrative output, fictional records:

```text
Fabrikam (fabrikam.example) — Industrial IoT, ~1,100 staff, Munich    [linkedin]
What they do: sensor analytics for factory lines, sold to OEMs        [site]
Priorities, last 12 months:
  - Moving plant telemetry to a single cloud warehouse                [press, 2026-03]
  - "Fewer, better dashboards" for plant managers                     [CEO talk, 2026-06]
Hiring: 6 data engineers, 1 Head of Data Reliability (posted 9 days)  [jobs]
Likely: pipeline breakage is a live pain — rests on the reliability hire
Unknown: current monitoring vendor; no public statement
Ask them:
  1. What broke the last time a plant's data went missing?
  2. Who owns the warehouse migration, and when is it done?
  3. What will the Head of Data Reliability be measured on?
```

One briefing for 4.175 credits (0.5 + 2 × 0.025 + 0.125 + 7 jobs × 0.5): every line sourced, one marked `Likely:`, one marked unknown.

## Cost

| Action | Credits |
| --- | --- |
| `linkedin.enrichCompanyFromDomain` | 0.5 |
| `parallel.extract` | 0.025 per URL |
| `parallel.createTask` (`processor: "lite"`) | 0.125 (0.625 if `processor` is omitted) |
| `theirStack.searchJobs` | 0.5 per job returned |

One account is about 0.675 credits plus 0.5 for every job posting returned, so `limit` sets the ceiling: 25 postings is 12.5 credits on top. `parallel.extract` bills per URL, so two pages is 0.05 and ten is 0.25. Each run also carries the 0.01 per-execution charge ([`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md) → "The execution charge"). A single briefing is cheap and a hundred of them is a decision: say the total before running a list.

## Worth knowing

- **Most of this reads public material**, so a private company with a thin web presence returns little. That is a real answer: report the gap rather than padding the page.
- **`processor` on `createTask` defaults to `core` (0.625) and the ladder runs to 60 credits a record.** Pin `lite`. Escalate to `base` (0.25) on a specific hard target, never across a list. The full ladder is in [`../provider-playbooks/parallel.md`](../provider-playbooks/parallel.md).
- **`theirStack.searchJobs` takes the domain as `companyFields.company_domain_or`.** A wrong key (`company_domains`, a top-level `domain`) is refused on `action execute` (`invalidData`, `Unknown field: <key>`), but inside a workflow node an unknown key is still dropped silently, so the search runs unfiltered and bills 0.5 for every job in the page. Check the key before saving this as a play.
- **Inputs inside the `--action` object's `config` are stripped**, so they never arrive. Inputs go in `--data` (`execute`) or `--records` (`execute-batch`).
- **Do not pay `createTask` for firmographics.** Headcount, industry and location come from call 1; an agentic task inferring them costs more and is less reliable.
- **For a renewal, drop calls 2 and 3** and keep the baseline and the roles. The account team already knows the story; what they want is what changed.

## Related

- [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md) — the provider chains for enriching companies and contacts across a list; this recipe is the one-account, one-briefing case.
- [`../references/prompt-library/company-research.md`](../references/prompt-library/company-research.md) — prompts that turn scraped text and news into a two-liner, a business-model label, a positioning summary or a filtered news list.
- [`../provider-playbooks/parallel.md`](../provider-playbooks/parallel.md) — `extract`, `createTask` and the processor ladder.
- [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md) — `enrichCompanyFromDomain` and the other one-page-at-a-time LinkedIn enriches.
- [`../provider-playbooks/theirStack.md`](../provider-playbooks/theirStack.md) — `searchJobs` filters and per-job billing.
- [`tech-intent.md`](tech-intent.md) — the same hiring signal used to find many companies, rather than to read one.
- [`find-stakeholders.md`](find-stakeholders.md) and [`account-expansion.md`](account-expansion.md) — the people at the account, once the briefing says who matters; anything that touches a named person is gated by [`../references/acceptable-use.md`](../references/acceptable-use.md).
- [`funding-watch.md`](funding-watch.md) — signal monitoring that tells you when to research an account, rather than waiting for a meeting to be booked.
