---
name: cargo-quickstart
description: "Guided first-run demo for Cargo — one persona question to the companies hiring for that persona right now, with a cost receipt, in under two minutes, ending by saving the pull as a recurring play. Triggers: \"show me what Cargo can do\", \"give me a demo\", \"take me on a tour\", \"quickstart\", \"getting started with Cargo\", \"I just installed Cargo\", \"my workspace is empty\", \"does this actually work\". Skip when: the user has a real job to run (build an account list, enrich a CSV) — use cargo-gtm; when they want CLI reference or routing — use the cargo router skill."
version: "1.0.2"
compatibility: Requires @cargo-ai/cli (npm). Sign in or create an account with `cargo-ai login --email` (emailed code, no browser), `--oauth`, or an API token
homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo Quickstart — first value in two minutes

One guided demo: pull the companies hiring for a buyer persona the user picks, show the cost receipt, then save the pull as a recurring play. The point is not the list — it's that in minute 3 the user owns a running system, not a one-off result.

**A new account starts with 100 free credits — no card.** This demo spends about **0.5** of them. Say that out loud before the first paid call ("this costs about half a credit of your 100 free ones"): it converts the moment from *a purchase decision* into *a look around*, which is the whole job of a quickstart. Never let a new user think the demo is why they'd run out.

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
- **Paid work is capped at ~1 credit total.** The demo uses one flat-rate intent call (`theirStack.searchCompanies`, **0.5 credits per call regardless of `limit`**). Nothing else paid runs without asking.
- **Never dead-end.** Every step has a fallback (ladder below). If a rung fails, drop one rung silently and keep moving.

## Fast path

Translate the persona into the role that company would be hiring — a Head of RevOps buys where RevOps is being staffed — and run the combined hiring-intent search. Keep `posted_at_max_age_days` at 30 so every row is a live posting, which is what makes the result feel current rather than scraped from an archive.

```bash
# 1. Execute — returns a run object; note run.uuid and run.workflowUuid.
#    searchCompanies bills 0.5 for the call, not per row, so `limit` is free to set.
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"theirStack","actionSlug":"searchCompanies"}' \
  --data '{"jobFields": {"job_titles": ["<persona title phrase>"], "posted_at_max_age_days": 30}, "limit": 25}' \
  --wait-until-finished > /tmp/quickstart-run.json

# 2. Fetch the output data (NOT in the execute stdout) — signed URL, then filter to THIS run
RUN_UUID=$(jq -r '.run.uuid' /tmp/quickstart-run.json)
WF_UUID=$(jq -r '.run.workflowUuid' /tmp/quickstart-run.json)
curl -fsS "$(cargo-ai orchestration run download-outputs \
  --workflow-uuid "$WF_UUID" --output-node-slug action --format json | jq -r '.url')" \
  > /tmp/quickstart-outputs.json

# 3. Read the row shape once, then render — the file holds ALL of the workflow's
#    runs, so filter by _uuid; each row's .output is the company array directly.
jq -r --arg u "$RUN_UUID" \
  '[.[] | select(._uuid==$u)][0].output[0] | keys_unsorted | join(" · ")' \
  /tmp/quickstart-outputs.json
```

Render a table from those keys — **company · what they're hiring for · where · when it posted** — not the raw JSON. The freshest postings are the demo's headline: lead with them ("8 of these 25 posted in the last week — that's the window"). Companies, roles, and postings only; the demo names no individuals.

### Fallback ladder (on auth/error, drop a rung — don't stop)

1. `theirStack.searchCompanies` (0.5/call) — primary.
2. `salesNavigator.searchAccounts` (0.05/record) — reframe as "the accounts that match your persona's company profile" by industry, headcount, and geo. 25 rows ≈ 1.25 credits, just over the demo cap, so **say the number before running it**: "half a credit more than planned — still ~1.3 of your 100 free credits."
3. `cargo.enrichBusinessFirmographics` (0.5/record) — only when the user already has company names or domains to hand; run it on 3, not 25, and say so.
4. Nothing connected at all → run the free path: `cargo-ai connection integration list | head`, show what *could* be wired, and offer to connect one (browser auth) — the demo resumes after.

## The receipt (mandatory, verbatim discipline)

The demo is itself the pilot from [`../cargo-gtm/references/cost-discipline.md`](../cargo-gtm/references/cost-discipline.md). Close it with a receipt:

- Credits spent + balance remaining (`cargo-ai billing subscription get` — remaining = `subscriptionAvailableCreditsCount − subscriptionCreditsUsedCount`). For a brand-new account, frame it against the **100 free starting credits** rather than as a bare number — "0.5 spent, 99.5 of your 100 free credits left" lands very differently from "99.5 credits remaining".
- Hit-rate: "25 of 25 returned" (or what actually came back, and which rows look off).

## Minute 3 — save it as a play

Immediately offer to make the pull recurring — this is the step that shows what Cargo *is*:

> "Want this to run by itself? I can save this exact search as a play that runs weekly and writes new matches into a model — companies that start hiring `<persona>` land without you asking."

On yes, follow [`../cargo-gtm/recipes/save-as-play.md`](../cargo-gtm/recipes/save-as-play.md) with the demo's action + filter as the workflow body and a weekly cron. Match `posted_at_max_age_days` to the cadence (weekly → 7) so each run bills only postings that appeared since the last one, never the same window twice.

## After the demo — route onward

Propose 2–3 next steps grounded in the rows just pulled, per the next-step spec in [`../cargo-gtm/SKILL.md`](../cargo-gtm/SKILL.md) (§4): e.g. "enrich these 25 with firmographics (~0.5 cr each)", "check which of them already run your category's tooling (~0.5 cr)", or something else entirely. From here, real GTM work belongs to [`cargo-gtm`](../cargo-gtm/SKILL.md) — read it before anything beyond the demo.
