---
name: cargo-quickstart
description: "Guided first-run demo for Cargo — one persona question to the accounts that match it, with a free pool count and a cost receipt, in under two minutes, ending by saving the pull as a recurring play. Triggers: \"show me what Cargo can do\", \"give me a demo\", \"take me on a tour\", \"quickstart\", \"getting started with Cargo\", \"I just installed Cargo\", \"my workspace is empty\", \"does this actually work\". Skip when: the user has a real job to run (build an account list, enrich a CSV) — use cargo-gtm; when they want CLI reference or routing — use the cargo router skill."
version: "1.0.3"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo Quickstart — first value in two minutes

One guided demo: size the user's addressable market for free, pull 25 of those accounts, show the cost receipt, then save the pull as a recurring play. The point is not the list — it's that in minute 3 the user owns a running system, not a one-off result.

**A new account starts with 100 free credits — no card.** This demo spends about **0.25** of them. Say that out loud before the first paid call ("this costs a quarter of a credit of your 100 free ones"): it converts the moment from *a purchase decision* into *a look around*, which is the whole job of a quickstart. Never let a new user think the demo is why they'd run out.

## Bootstrap

Already signed in (`cargo-ai whoami` returns a workspace)? Skip to the next section.

```bash
npm install -g @cargo-ai/cli            # no global install? prefix every command with `npx @cargo-ai/cli`
cargo-ai login --email you@company.com  # emailed code, no browser; creates the account on first use
                                        # alternatives: --oauth (browser) · --token <api-token> (CI)
cargo-ai whoami                         # confirm the active workspace before any write
```

Every command prints JSON to stdout; failures exit non-zero with `{"errorMessage": "..."}`. Anything that creates a run or a batch is async — pass `--wait-until-finished` or poll the matching `get`. When the full skill bundle is installed, [`../cargo/references/prerequisites.md`](../cargo/references/prerequisites.md) adds the CLI version pin, token scopes, and the admin-only surface.

## The one question

Ask exactly **one** question before doing anything:

> **"Who do you sell to?"** (a persona in a few words — e.g. "Heads of RevOps at mid-market SaaS")

Everything else — provider, filters, limits — you decide. Don't ask about output format, volume, or providers; defaults below.

## Speed budget — HARD RULES

The demo has a two-minute budget from answer to deliverable. On the fast path:

- **No discovery detours.** Do not run `cargo-ai --version`, `cargo-ai whoami`, `connection connector list`, or any exploratory command first. Auth problems will surface as errors on the first real call — handle them then.
- **One command block per step**, no narration between commands.
- **Paid work is capped at ~1 credit total.** The demo uses the cheapest account search in the catalog (`aiArk.searchCompanies`, 0.01/record → 25 records = 0.25 credits) on **cargo's managed connection**, so it works on a workspace with nothing wired up yet. Nothing else paid runs without asking.
- **Never dead-end.** Every step has a fallback (ladder below). If a rung fails, drop one rung silently and keep moving.

## Fast path

Translate the persona into two things: the **title its buyer holds** (`employeeRole.employee_title_or` — companies that employ that role) and the **company shape** around it (`employeeSize`, and `industry` when the persona names one). Then count for free before paying for anything.

```bash
# Both steps retrieve the same way: execute returns a run object, the DATA comes
# from a signed URL, and that file holds every run of the workflow — so filter on
# the run's own _uuid. One helper, used twice.
fetch_output() {  # $1 = the run json written by execute → prints that run's .output
  local run_uuid workflow_uuid url
  run_uuid=$(jq -r '.run.uuid' "$1")
  workflow_uuid=$(jq -r '.run.workflowUuid' "$1")
  url=$(cargo-ai orchestration run download-outputs \
    --workflow-uuid "$workflow_uuid" --output-node-slug action --format json | jq -r '.url')
  curl -fsS "$url" | jq --arg u "$run_uuid" '[.[] | select(._uuid==$u)][0].output'
}

FILTER='{"employeeRole": {"employee_title_or": ["<buyer title>", "<buyer title variant>"]},
         "employeeSize": {"min_employee_count": 50, "max_employee_count": 1000},
         "industry": {"industry_or": ["<industry>"]}}'

# 1. Count the pool — FREE (countCompanies is fixed-cost 0). This is the demo's
#    first beat: the user's whole addressable market, before a credit is spent.
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"countCompanies"}' \
  --data "$FILTER" --wait-until-finished > /tmp/quickstart-count.json

POOL=$(fetch_output /tmp/quickstart-count.json | jq -r '.count')   # e.g. 1904

# 2. Pull 25 of them — 0.01/record, so this is 0.25 credits.
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchCompanies"}' \
  --data "$(jq -c '. + {limit: 25}' <<<"$FILTER")" \
  --wait-until-finished > /tmp/quickstart-run.json

# 3. Fetch the rows and show the table (fields are snake_case)
fetch_output /tmp/quickstart-run.json > /tmp/quickstart-companies.json
jq -r '.[] | [.name, .industry, (.employee_count|tostring),
              ([.city,.country]|map(select(.!=null and .!=""))|join(", ")), .domain] | @tsv' \
  /tmp/quickstart-companies.json | column -t -s $'\t'
```

Show the table (company · industry · headcount · location · domain), not the raw JSON. **Lead with `$POOL`** — "1,904 companies match that description; here are 25 of them, for a quarter of a credit" is the demo's headline, because it reframes the 25 rows as a sample of a market rather than a list. Companies only; the demo names no individuals.

Filter notes worth knowing before you improvise:

- `industry_or` is enum-backed, and the members are LinkedIn-style lowercase names — `"software development"`, `"financial services"` — the same strings each row returns in its own `industry` field, so a value copied off a result always matches. Resolve anything less obvious through the `listIndustries` autocomplete instead of guessing: a non-member empties the pool rather than narrowing it. Drop the group entirely when the persona names no industry; adding it roughly halved the pool in testing.
- Every group is nested (`_or` includes, `_not` excludes) and headcounts are numbers, not strings. Other useful groups on the same action: `technologies`, `funding`, `companyLocation`, `headcountGrowth`.
- Rows also carry `linkedin_url`, `revenue`, `founded_year`, and `technologies` if a richer table suits the persona better.

### Fallback ladder (on auth/error, drop a rung — don't stop)

1. `aiArk.searchCompanies` (0.01/record, managed connection) — primary.
2. `salesNavigator.searchAccounts` (0.05/record) — same idea by industry, headcount and geo. 25 rows ≈ 1.25 credits, just over the demo cap, so **say the number before running it**: "about a credit more than planned — still ~1.5 of your 100 free credits."
3. `theirStack.searchCompanies` (0.5/call, flat) — reframe as "companies hiring for your persona's role right now". Needs its own connector, so it is a rung, not the default.
4. Nothing connected at all → run the free path: `cargo-ai connection integration list | head`, show what *could* be wired, and offer to connect one (browser auth) — the demo resumes after.

## The receipt (mandatory, verbatim discipline)

The demo is itself the pilot from [`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md). Close it with a receipt:

- Credits spent + balance remaining (`cargo-ai billing subscription get` — remaining = `subscriptionAvailableCreditsCount − subscriptionCreditsUsedCount`). For a brand-new account, frame it against the **100 free starting credits** rather than as a bare number — "0.25 spent, 99.75 of your 100 free credits left" lands very differently from "99.75 credits remaining".
- Hit-rate: "25 of 25 returned" (or what actually came back, and which rows look off), against the free pool count from step 1.

## Minute 3 — save it as a play

Immediately offer to make the pull recurring — this is the step that shows what Cargo *is*:

> "Want this to run by itself? I can save this exact search as a play that runs weekly and writes new matches into a model — new `<persona>` accounts land without you asking."

On yes, follow [`../cargo-gtm/recipes/save-as-play.md`](../cargo-gtm/recipes/save-as-play.md) with the demo's action + filter as the workflow body and a weekly cron. `searchCompanies` bills per returned record on every run, so dedup against the workspace model (a free `storage query execute` on `domain`) before any paid downstream node.

## After the demo — route onward

Propose 2–3 next steps grounded in the rows just pulled, per the next-step spec in [`../cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md) (§4): e.g. "enrich these 25 with firmographics (~0.5 cr each)", "check which of them run your category's tooling", or something else entirely. From here, real GTM work belongs to [`cargo-gtm`](../cargo-gtm/SKILL.md) — read it before anything beyond the demo.
