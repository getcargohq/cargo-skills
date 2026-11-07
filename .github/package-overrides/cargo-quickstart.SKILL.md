---
name: cargo-quickstart
description: "Runs a two-minute guided Cargo demo for new users: one question with a fixed menu of three starter account searches (companies like yours, companies that employ your buyer, fast-growing lookalikes), 25 real companies with a cost receipt, then saves the search as a recurring play. Needs nothing connected and works on a fresh account (100 free credits, no card). Triggers: \"show me what Cargo can do\", \"give me a demo\", \"take me on a tour\", \"quickstart\", \"getting started with Cargo\", \"I just installed Cargo\", \"my workspace is empty\", \"does this actually work\". Skip when: the user has a real job to run (build an account list, enrich a CSV), use cargo-gtm; when they want CLI reference or routing, use the cargo router skill."
version: "1.2.0"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo Quickstart: first rows in two minutes

One question, one fixed command, 25 real companies from the user's own workspace with a cost receipt, then an offer to save the search as a play. **Done means the human has seen the rows.** A finished install or a `whoami` is not the deliverable. Companies only: this demo names no individuals.

**A new account gets 100 free credits, valid for 30 days, no card.** Every starter here costs **at most 0.25 credits** (AI Ark company search is 0.01 a row). Say it before the first paid call ("this costs at most a quarter of a credit of your 100 free ones"): it turns the moment from a purchase decision into a look around.

## Bootstrap

Already signed in (`cargo-ai whoami` returns a workspace)? Skip to the next section.

```bash
npm install -g @cargo-ai/cli            # no global install? prefix every command with `npx @cargo-ai/cli`
cargo-ai login --email you@company.com  # emailed code, no browser; creates the account on first use
                                        # alternatives: --oauth (browser) · --token <api-token> (CI)
cargo-ai whoami                         # confirm the active workspace; keep the email domain
```

**Not ready to sign up?** `--dry-run` on any starter below validates the inputs and prints sample rows in the real shape with the credit price, free and with no account. Offer it once if the user hesitates at the email step.

Every command prints JSON to stdout; failures exit non-zero with `{"error": ...}` on stderr. `--wait-until-finished` returns the finished run, and the rows are in `.runContext.action` (absent, not an empty array, when nothing matched). When the full bundle is installed, [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) covers the CLI pin and token scopes.

## Why these starters

Every new workspace is seeded with a Cargo-managed connector for each managed-compatible integration, AI Ark among them, billed in Cargo credits. So the starters need **nothing connected**, no API key and no Sales Navigator seat, and they never end in a question. Use them as the default path.

## The one question

Ask exactly this, then wait:

> **What would you like to do with Cargo?**
> 1. Companies like yours: 25 lookalikes of `<their domain>`
> 2. Companies that employ your buyer: 25 companies with a job title you pick on staff
> 3. Growing fast: 25 companies like yours whose headcount grew 20%+ in six months
> 4. Tell me what you want

`<their domain>` is the domain of the signed-in email. If it is personal (gmail, outlook, icloud), ask for the company website first. Option 4 leaves the demo: load [`cargo-gtm`](../cargo-gtm/SKILL.md).

## Speed rules

- **No discovery detours.** No `--version`, `connector list`, `action list` or pricing lookups first. The commands below are fixed; errors surface on the call.
- **Run the starter as written.** Only the placeholder changes. Do not add filters, raise `limit`, or switch provider.
- **One command block per step**, no narration between commands.
- **Demo cap: 0.25 credits a starter**, 5 only on the Sales Navigator fallback below. Anything else paid needs a credit estimate and an explicit yes first.

## Starter 1: companies like yours

At most 25 × 0.01 = **0.25 credits**.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchCompanies"}' \
  --data '{"lookalikeDomains":["<domain>"],"limit":25}' \
  --wait-until-finished > /tmp/cargo-starter.json
jq -r '(.runContext.action // [])[] | [.name, .domain, .industry, .employee_count, .country] | @tsv' /tmp/cargo-starter.json
```

## Starter 2: companies that employ your buyer

At most 25 × 0.01 = **0.25 credits**. Put one to three exact job titles in `employee_title_or` (for "RevOps leaders": `["Head of Revenue Operations","VP Revenue Operations"]`). If they named a company size, add `employeeSize` and nothing else: a band ("50 to 200") is `{"min_employee_count":50,"max_employee_count":200}`, a floor ("200+") is `{"min_employee_count":200}` with no max. If a sized search comes back empty, drop `employeeSize` before broadening titles.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchCompanies"}' \
  --data '{"employeeRole":{"employee_title_or":["<title>"]},"limit":25}' \
  --wait-until-finished > /tmp/cargo-starter.json
jq -r '(.runContext.action // [])[] | [.name, .domain, .industry, .employee_count, .country] | @tsv' /tmp/cargo-starter.json
```

## Starter 3: growing fast

At most 25 × 0.01 = **0.25 credits**. Headcount growth is the hiring signal: a company adding 20% in six months is buying.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchCompanies"}' \
  --data '{"lookalikeDomains":["<domain>"],"headcountGrowth":[{"min":20,"time_frame":"SIX"}],"limit":25}' \
  --wait-until-finished > /tmp/cargo-starter.json
jq -r '(.runContext.action // [])[] | [.name, .domain, .industry, .employee_count, .country] | @tsv' /tmp/cargo-starter.json
```

## When a starter comes back short

Zero rows cost nothing (AI Ark bills per row returned). Retry once, then report:

| Result | Retry once with |
| --- | --- |
| Starter 3, zero rows | `"min":10,"time_frame":"TWELVE"` |
| Starter 1 or 3, zero rows | a better-known lookalike: ask "which company is your best customer?" and use its domain |
| Starter 2, zero rows | without `employeeSize` if it was set, otherwise broader titles (drop seniority words, add the common variant) |
| AI Ark errors | `salesNavigator.searchAccounts`, also Cargo-managed, 0.2 a company, so **5 credits** for 25; say the price first. |

Never fall through to a pricier source on the demo. If the retry also fails, show the error verbatim and offer `cargo-ai workspaceManagement report create`.

## The receipt (mandatory)

```bash
cargo-ai billing subscription get | jq '.subscription | .subscriptionAvailableCreditsCount + .additionalAvailableCreditsCount - .subscriptionCreditsUsedCount'
```

Show the rows as a table, never raw JSON, then one line framed against the free credits: "25 companies, 0.25 credits spent, 99.75 of your 100 free credits left." Name the rows that look strongest and any that look off. This is the pilot step of [`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md).

## Save it as a play

Offer it immediately; this is the step that shows what Cargo is:

> "Want this to run by itself? I can save this search as a play that runs every week and writes new matches into your workspace."

On yes, follow [`../cargo-gtm/recipes/save-as-play.md`](../cargo-gtm/recipes/save-as-play.md) with the starter's action and data as the workflow body and a weekly cron. A play re-bills on every run, so quote it: at most 0.25 credits a week. Dedup against the workspace model (a free `storage query execute` on `domain`) before any paid downstream node.

## After the demo

Propose two or three next steps grounded in the rows, per the next-step spec in [`../cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md) (§4): for example "enrich the best 10 with firmographics" or "check which of them run your category's tooling". Real GTM work belongs to [`cargo-gtm`](../cargo-gtm/SKILL.md); read it before anything beyond the demo.
