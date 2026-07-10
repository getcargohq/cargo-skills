---
name: cargo-gtm
description: "Front door for any GTM task on Cargo — sourcing, waterfall enrichment, email/phone/LinkedIn lookup, email verification, scoring, qualification, sequencing, CRM sync, and signal monitoring (job changes, funding, tech-stack/hiring intent). Use when the user states a real-world goal involving prospects, leads, accounts, contacts, ICP lists, or campaign activation. Routes to phase guides (Level 2), recipes (Level 2.5), and per-provider playbooks (Level 3) before any action call."
version: "1.7.0"
compatibility: Requires @cargo-ai/cli (npm) and a Cargo account (browser sign-in via --oauth, or an API token)
homepage: https://github.com/getcargohq/cargo-skills
metadata:
  author: getcargo
  openclaw:
    requires:
      bins:
        - cargo-ai
    install:
      - kind: node
        package: "@cargo-ai/cli@latest"
        bins:
          - cargo-ai
    homepage: https://github.com/getcargohq/cargo-skills
---

# Cargo GTM — Meta Skill

Use this skill for prospecting, account research, contact enrichment, verification, lead scoring, personalization, signal monitoring, and campaign activation.

## 1) What this skill governs

- Route GTM decisions, safety gates, and provider/quality defaults **before** execution.
- Keep long command chains and tooling nuance in sub-docs; provider-specific implementation detail in `provider-playbooks/*.md`.
- Anchor recipes in **credits-based actions** (the high-value action calls). Free CRUD (createLead, getLead, deleteRecords) doesn't need this skill — agents can compose those ad hoc.

### Process / goal

The user is generally trying to go from "I have an ICP" to "Here's a list of prospects with verified emails and personalized signals." They may be anywhere in this process — guide them along.

**Discovery order: companies first, then people.** When the task requires finding contacts at companies matching criteria (portfolio, ICP, hiring signal), discover the company set first, then find people at each company. Don't start with broad people-search queries.

### Documentation hierarchy

- **Level 1** — `SKILL.md` (this file): decision model, guardrails, routing table, links to sub-docs.
- **Level 2** — Phase docs: [`guides/finding-companies-and-contacts.md`](guides/finding-companies-and-contacts.md), [`guides/enriching-and-researching.md`](guides/enriching-and-researching.md), [`guides/writing-outreach.md`](guides/writing-outreach.md).
- **Level 2.5** — Recipes: [`recipes/*.md`](recipes/) — step-by-step playbooks for specific scenarios.
- **Level 3** — Provider playbooks: [`provider-playbooks/<slug>.md`](provider-playbooks/) — provider-specific quirks, costs, and fallback behavior.

## 2) Read behavior — MANDATORY before any execution

**STOP. Do not call any provider, run any `cargo-ai orchestration action execute` command, or write any search query until you have opened the correct sub-doc for your task.**

These docs encode what works, what fails, and why. They contain validated parameter schemas, cheapest-provider mappings, parallel execution patterns, sample payloads, and known pitfalls. Reading the right doc for 10 seconds saves 10 failed action calls, wasted credits, and garbage output.

### Routing rules — match your task to a doc and READ IT

| When the task involves… | You MUST read this doc first | What it gives you |
|---|---|---|
| **Finding companies, finding people, building lead lists, prospecting, portfolio/VC sourcing, contact finding at known companies** | [`guides/finding-companies-and-contacts.md`](guides/finding-companies-and-contacts.md) | Provider filter schemas, cheapest-source decision tree, parallel patterns, role-based search rules, portfolio/VC shortcuts, contact-finding patterns. |
| **Enriching companies or contacts, finding emails/phones/LinkedIn, waterfall enrichment, signal lookup (job change, funding, tech stack), coalescing data** | [`guides/enriching-and-researching.md`](guides/enriching-and-researching.md) | Waterfall patterns with fallback chains, when to use cargo-native vs waterfall vs FullEnrich vs peopleDataLabs, email/phone/LinkedIn fallback orders, signal segments, output retrieval via `run download-outputs`. |
| **Writing cold emails, personalizing outreach, lead scoring, qualification, sequence design, campaign copy** | [`guides/writing-outreach.md`](guides/writing-outreach.md) | LLM provider routing (openAi/anthropic/perplexity/gemini), prompt templates, scoring rubrics, email length/tone rules, personalization patterns. |
| **Building or modifying a recurring workflow** (cron / webhook / scheduled tool / play), designing step sequences, triggers, deploy/verify cycles | [`../cargo-orchestration/SKILL.md`](../cargo-orchestration/SKILL.md) (capability) + apply-patterns from this skill's recipes | Schema for tool/play workflows, node graph syntax, polling strategies, output retrieval. |

### Recipes: step-by-step playbooks (check before executing)

Scan this list and read the recipe matching your task. **When a recipe matches: follow it step-by-step as your execution plan.**

| Recipe | Use when… |
|---|---|
| [`recipes/prospecting.md`](recipes/prospecting.md) | End-to-end find → enrich → verify → sync (P1/P2/P3 variants) |
| [`recipes/build-tam.md`](recipes/build-tam.md) | Building a Total Addressable Market list at scale (100–10,000 companies) |
| [`recipes/linkedin-url-lookup.md`](recipes/linkedin-url-lookup.md) | Resolving a person's LinkedIn profile URL from name + company with strict identity validation |
| [`recipes/portfolio-prospecting.md`](recipes/portfolio-prospecting.md) | Investor / accelerator → portfolio companies → contacts |
| [`recipes/job-change-monitoring.md`](recipes/job-change-monitoring.md) | `waterfall.detectJobChange` (cargo-unique) on a contact segment |
| [`recipes/funding-watch.md`](recipes/funding-watch.md) | Tracking companies that recently raised funding |
| [`recipes/tech-intent.md`](recipes/tech-intent.md) | Finding companies by tech-stack or hiring-intent signals |
| [`recipes/icp-discovery.md`](recipes/icp-discovery.md) | Diffing Closed-Won vs Closed-Lost segments to surface ICP signals |
| [`recipes/outreach-activation.md`](recipes/outreach-activation.md) | Turning a signal segment into send-ready outreach (enrich → verify → personalize → sequencer handoff) |
| [`recipes/re-engagement.md`](recipes/re-engagement.md) | Waking up stale contacts only when a fresh signal fires (job change, funding, tech intent) |
| [`recipes/lost-deal-revival.md`](recipes/lost-deal-revival.md) | Reviving Closed-Lost CRM deals by branching on `lost_reason` (champion left, budget, timing) |
| [`recipes/account-expansion.md`](recipes/account-expansion.md) | Multi-threading existing customer accounts — net-new buyers, deduped against the workspace's Contacts model |
| [`recipes/save-as-play.md`](recipes/save-as-play.md) | Converting a successful ad-hoc run into a durable scheduled play or cron tool — offer after any repeatable pull |
| [`recipes/import-gtm-data.md`](recipes/import-gtm-data.md) | Importing existing GTM data (CSV/CRM exports from any tool) into models, QA-auditing it, and selectively rebuilding recurring logic as plays with a parity check |

If none match, scan the phase docs above for the closest pattern and adapt — or invoke [`agents/execution-plan-creator.md`](agents/execution-plan-creator.md) to compose a custom chain with provider/action slugs and cost estimates. For wide sourcing sweeps that fan out (per-industry, per-geo), delegate approved slices to [`agents/list-builder.md`](agents/list-builder.md) — it executes exactly one pre-approved action per slice and returns rows to a file, keeping row data out of the main context. (On Claude Code with the plugin, both are installed as native subagents: `cargo-execution-planner` and `cargo-list-builder`.)

## 3) Cost discipline — MANDATORY gates

Full spec: [`references/cost-discipline.md`](references/cost-discipline.md). The short version every task must honor:

1. **Pilot → approval → full run, in that order.** Run 1–3 rows of the exact input first; present the 4-section approval message (Assumptions · Pilot result verbatim · Credits/Scope/Cap reconciled against the actual balance · 3 shaped choices); stay in AWAIT_APPROVAL until the user picks. Never fan out on an unapproved or cost-unknown action.
2. **Receipt after every paid action**: credits spent + balance remaining + hit-rate ("found 34 emails of 40") + estimate-vs-actual with the why when they diverge. Prefer `billing usage get-metrics` over your own arithmetic.
3. **Over-provision 1.4×N, then filter** — coverage is a property of the company; drop incomplete rows instead of chasing them with more providers.
4. **Count first, pay second** — search is billed on returned rows; keep `limit` strict and size the pool with a 1-row probe before any full pull.
5. **Phone is the guarded lever** (3–7 credits, ~10× email) — explicit user request only, qualified leads only.

## 4) After every run — receipt, then grounded next steps

End every completed run with the receipt (above), then propose **2–3 next steps maximum, computed from the data just produced — never a generic menu**. Required shape:

1. **Continuity** — builds on this session's artifacts ("67 of these 70 companies have RevOps teams — find the leads?"), not a fresh generic idea.
2. **Budget-aware** — framed against the remaining balance ("with your ~9 credits left, ~5 verified emails fits").
3. **Cost-per-unit stated** — "email waterfalls run ~1.4 credits each."
4. **A default picking heuristic** so answering takes one word ("I'd default to: has funding data + RevOps ≥ 2 + posting is recent").
5. **An escape hatch** — always end with "or something else entirely."

When a run produced a durable, repeatable result, one of the suggestions should be **making it systematic** — see [`recipes/save-as-play.md`](recipes/save-as-play.md).

When a run or batch **misbehaved** — errors, missing downstream values, cost surprises — hand off to the `cargo-diagnostics` skill (`../cargo-diagnostics/SKILL.md`): sweep the batch for root causes before re-running anything paid. Interaction defaults for plan gates, shaped choices, and presenting results live in `../cargo/references/interaction.md`.

## 5) Priority provider stack (recipes lead with these 6)

These six credits-based providers cover the full prospecting → enrichment → verification → signal pipeline at the lowest credit cost in the catalog. Every recipe in this skill's `recipes/` leads with this stack:

| Provider | Role | Key actions (cost in credits) |
|---|---|---|
| **salesNavigator** | Sourcing | `searchLeads` (0.02), `searchAccounts` (0.05), `findCompanyInsights/Metrics/EmployeesCount/Distribution` (0.25 each) |
| **cargo** (native) | Firmographic + signal intelligence | `enrichBusinessFirmographics` (0.5), `…Technographics` (1), `…FundingAndAcquisitions` (0.5), `enrichProspectDetails/LinkedinProfile/LinkedinPosts` (2), `matchBusiness/matchProspect` (0.5), 13 more |
| **waterfall** | Multi-source enrichment + signal | `enrichContact` (2), `enrichCompany` (1), `verifyEmail` (0.1), `detectJobChange` (3), `searchProspects` (3), `findPhone` (7) |
| **FullEnrich** | Premium contact lookup | `findEmail` (1), `findPhone` (6), `findPhoneAndEmail` (7), `reverseEmailLookup` (2) |
| **theirStack** | Tech-stack + hiring intent | `searchTechnologies` (0.5), `searchJobs` (0.5), `searchCompanies` (0.5) |
| **peopleDataLabs** | Heavyweight backfill | `enrichPerson` (3), `enrichCompany` (3), `searchPeople` (3), `searchCompanies` (3), `queryPeople/Companies` (3) |

See [`provider-playbooks/`](provider-playbooks/) for per-provider deep dives. See [`references/stage-action-map.md`](references/stage-action-map.md) for the complete cheapest-action-per-stage table across the full 120-integration catalog.

## 6) Recipe spine (default chain)

```
1. SOURCE   → salesNavigator.searchLeads / searchAccounts            (0.02–0.05/record)
2. DEDUPE   → cargo.matchProspect / cargo.matchBusiness              (0.5/record)
3. ENRICH   → cargo.enrichBusinessFirmographics / Technographics
              + waterfall.enrichContact / enrichCompany              (0.5–2/record)
4. SIGNAL   → cargo.enrichBusinessFundingAndAcquisitions
              + theirStack.searchJobs
              + waterfall.detectJobChange                            (0.5–3/record)
5. CONTACT  → FullEnrich.findEmail (fallback peopleDataLabs)         (1–3/record)
6. VERIFY   → waterfall.verifyEmail                                  (0.1/record)
7. BACKFILL → peopleDataLabs.enrichPerson (only if step 5 missed)    (3/record)
8. QA       → scripts/contact-accuracy-audit.ts                      (free, local)
```

Adapt by phase: drop steps that aren't relevant to the user's goal. For pure sourcing, run step 1 only. For "enrich a list I already have," run steps 2–7.

## 7) Output retrieval — use `run download-outputs`, not `run download`

When the agent needs the actual data produced by an action (enriched fields, found emails, search results), use:

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  --format json
```

(Don't pass `--is-finished` — the CLI help still lists it but the API currently rejects it with `unrecognized_keys`; reported.)

Returns `{"url": "..."}` — a signed URL to a CSV/JSON containing only the output node's data. Faster and cheaper than `run download` (which pulls full run records). See [`references/output-retrieval.md`](references/output-retrieval.md) and [`../cargo-analytics/SKILL.md`](../cargo-analytics/SKILL.md).

## 8) Contact accuracy — run the QA scripts, don't eyeball

Four deterministic TypeScript scripts in [`scripts/`](scripts/) (Node ≥ 22.18, zero deps, fixture-tested in CI) replace in-context row checking. **Run the script — never re-derive its logic by reasoning over rows.** Full doctrine, pipeline order, and the SEND/VERIFY/REVIEW/REMOVE verdict semantics: [`references/contact-accuracy.md`](references/contact-accuracy.md).

- `scripts/validate-emails.ts` — free syntax/risk/duplicate cull **before** paid `verifyEmail`.
- `scripts/select-current-role.ts` — pick the real current role from an experiences array (catches job changers).
- `scripts/validate-linkedin-names.ts` — name↔profile match (catches same-name decoys); pairs with [`recipes/linkedin-url-lookup.md`](recipes/linkedin-url-lookup.md).
- `scripts/contact-accuracy-audit.ts` — final per-row `audit_action` stamp on the merged output; cite its summary counts in the receipt. Reads files or a finished run directly (`--workflow-uuid`, via `@cargo-ai/api`).

## 9) Action shape rules (every recipe)

Every action JSON in this skill follows the rules in [`../cargo-orchestration/references/examples/actions.md`](../cargo-orchestration/references/examples/actions.md):

- `kind: "connector"` action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **`connectorUuid` is NOT in `config`** — the platform resolves the workspace's authenticated connector from `integrationSlug` automatically.
- For multi-step node graphs: `connectorUuid` lives at the top level of the node, not in `config`. Cross-node interpolation uses `{{nodes.<slug>.<field>}}`. Agent node outputs wrap under `.answer` (read as `{{nodes.<slug>.answer.<field>}}`).

## 10) When stuck — file a workspace report

If a recipe fails repeatedly and the cause isn't obvious, escalate via `cargo-ai workspaceManagement report create`. See [`../cargo-workspace-management/SKILL.md`](../cargo-workspace-management/SKILL.md) (Reports section).

## 11) Provider playbooks — read before you call

**STOP — do not execute any paid action against a provider below until you have opened its playbook.** Each playbook carries the exact action slugs, config shapes, input quirks, and cost traps; reading it for five seconds is cheaper than one failed paid call, and a failed batch is 100 failed paid calls. **Every credits-based provider in the catalog now has a playbook**; only own-key integrations fall back to [`references/alternatives.md`](references/alternatives.md) and [`references/stage-action-map.md`](references/stage-action-map.md).

**Priority stack (recipes lead with these):**
- [`provider-playbooks/salesNavigator.md`](provider-playbooks/salesNavigator.md) — cheapest sourcing in the catalog (0.02–0.05/record).
- [`provider-playbooks/cargo.md`](provider-playbooks/cargo.md) — 22 native enrichment + signal actions; the `match*` actions are key for dedup.
- [`provider-playbooks/waterfall.md`](provider-playbooks/waterfall.md) — swiss-army-knife: enrichment, verification, and the cargo-unique `detectJobChange` signal.
- [`provider-playbooks/FullEnrich.md`](provider-playbooks/FullEnrich.md) — premium contact lookup; `reverseEmailLookup` is unique.
- [`provider-playbooks/theirStack.md`](provider-playbooks/theirStack.md) — tech-stack + hiring-intent signals.
- [`provider-playbooks/peopleDataLabs.md`](provider-playbooks/peopleDataLabs.md) — heavyweight backfill at flat 3-credit tier.

**Sourcing & company-data specialists:**
- [`provider-playbooks/linkedin.md`](provider-playbooks/linkedin.md) — the native LinkedIn integration's action set (profiles, companies, posts, jobs).
- [`provider-playbooks/proxycurl.md`](provider-playbooks/proxycurl.md) — LinkedIn-data lookups by URL when the native integration misses.
- [`provider-playbooks/apolloio.md`](provider-playbooks/apolloio.md) — person/organization enrichment alternative; investor-niche coverage.
- [`provider-playbooks/oceanio.md`](provider-playbooks/oceanio.md) — lookalike-company discovery from seed domains.
- [`provider-playbooks/datagma.md`](provider-playbooks/datagma.md) — lightweight person/company enrichment alternative.
- [`provider-playbooks/companyEnrich.md`](provider-playbooks/companyEnrich.md) — cheapest company-by-domain (0.25) + per-item-billed lookalikes.
- [`provider-playbooks/enrichCrm.md`](provider-playbooks/enrichCrm.md) — CRM-record enrichment; `getFunding` is the funding-signal fallback.
- [`provider-playbooks/societeInfo.md`](provider-playbooks/societeInfo.md) — French-registry company/contact data (SIREN/SIRET).
- [`provider-playbooks/snitcher.md`](provider-playbooks/snitcher.md) — website-visitor identification; the recurring extractor is the cost trap.
- [`provider-playbooks/piloterr.md`](provider-playbooks/piloterr.md) — ultra-cheap bulk company extractor + G2 product info.
- [`provider-playbooks/g2.md`](provider-playbooks/g2.md) — software-review & category signal data.
- [`provider-playbooks/theSwarm.md`](provider-playbooks/theSwarm.md) — warm-intro network mapping to target companies/people.
- [`provider-playbooks/mixrank.md`](provider-playbooks/mixrank.md) — premium person/company backfill (4/lookup, phone-only reverse lookup).

**Email & contact specialists** (all feed the VERIFY step — see [`references/waterfall-strategy.md`](references/waterfall-strategy.md)):
- [`provider-playbooks/hunter.md`](provider-playbooks/hunter.md) — domain-search email finding + verification.
- [`provider-playbooks/prospeo.md`](provider-playbooks/prospeo.md) — email/phone lookup, LinkedIn-URL input path.
- [`provider-playbooks/icypeas.md`](provider-playbooks/icypeas.md) — budget email find/verify.
- [`provider-playbooks/findyMail.md`](provider-playbooks/findyMail.md) — email finding alternative.
- [`provider-playbooks/leadMagic.md`](provider-playbooks/leadMagic.md) — email + mobile lookup alternative.
- [`provider-playbooks/contactOut.md`](provider-playbooks/contactOut.md) — contact info from LinkedIn profiles.
- [`provider-playbooks/zeroBounce.md`](provider-playbooks/zeroBounce.md) — email-verification second opinion to `waterfall.verifyEmail`.
- [`provider-playbooks/bouncer.md`](provider-playbooks/bouncer.md) / [`neverBounce.md`](provider-playbooks/neverBounce.md) / [`kitt.md`](provider-playbooks/kitt.md) / [`enrichley.md`](provider-playbooks/enrichley.md) — verification long tail (0.3 / 0.2 / 0.05 / 0.1; enrichley's slug is `verify`, not `verifyEmail`).
- [`provider-playbooks/dropcontact.md`](provider-playbooks/dropcontact.md) — email finding with French/EU registry depth; `email` output is an array.
- [`provider-playbooks/enrowio.md`](provider-playbooks/enrowio.md) — email find (1) + verify (0.1); takes `fullName` only.
- [`provider-playbooks/reverseContact.md`](provider-playbooks/reverseContact.md) — company-from-LinkedIn (credits); profile lookups are own-key.
- [`provider-playbooks/rocketreach.md`](provider-playbooks/rocketreach.md) — person lookup (1); healthcare/NPI niche; beware the `currrentEmployer` schema key.
- [`provider-playbooks/forager.md`](provider-playbooks/forager.md) — personal-email + phone from a LinkedIn URL.
- [`provider-playbooks/cleon1.md`](provider-playbooks/cleon1.md) — terminal phone rung (15/lookup) — explicit user request only.

**Research & scraping:**
- [`provider-playbooks/firecrawl.md`](provider-playbooks/firecrawl.md) — web scraping for research/personalization stages.
- [`provider-playbooks/serper.md`](provider-playbooks/serper.md) — Google SERP queries for research and URL discovery.
- [`provider-playbooks/linkup.md`](provider-playbooks/linkup.md) — web search (0.5 standard / 2 deep) + sourced/structured answers.

**LLM providers** (all: one `instruct` action, cost per 1,000-token package, per-model tiers — prompts come from [`references/prompt-library/index.md`](references/prompt-library/index.md)):
- [`provider-playbooks/anthropic.md`](provider-playbooks/anthropic.md) — judgment-tier default (Haiku/Sonnet 0.2, Opus 2); temperature nests under `advancedSettings` with required `maxTokens`.
- [`provider-playbooks/openAi.md`](provider-playbooks/openAi.md) — cheapest bulk tier (`gpt-5-nano` 0.006) + native JSON-schema output.
- [`provider-playbooks/gemini.md`](provider-playbooks/gemini.md) — cheap high-throughput (Flash 0.01, 15,000/min) + search grounding.
- [`provider-playbooks/perplexity.md`](provider-playbooks/perplexity.md) — web-grounded research answers; default model is the expensive `sonar-deep-research` — always set `model` explicitly.

## 12) References

- [`references/cost-discipline.md`](references/cost-discipline.md) — the mandatory spend rules: pilot → approval gate, per-run receipts, 1.4×N over-provision, count-first sizing, provider-billing rules.
- [`references/contact-accuracy.md`](references/contact-accuracy.md) — the deterministic QA scripts (email cull, current-role, name match, final audit) and the SEND/VERIFY/REVIEW/REMOVE verdicts.
- [`references/prompt-library/index.md`](references/prompt-library/index.md) — ~40 named, parameterized LLM prompts (personalization, scoring, research, qualification, signal analysis, extraction). **Before authoring any enrichment/scoring prompt from scratch, grep this index** — reuse beats reinvention, and each entry carries a tested output contract. Load only the shard you need, never all of them.
- [`references/stage-action-map.md`](references/stage-action-map.md) — cheapest credits-based action per stage across the full 120-integration catalog.
- [`references/credits-cost-table.md`](references/credits-cost-table.md) — auto-generated cost table for all 141 credits-based actions.
- [`references/waterfall-strategy.md`](references/waterfall-strategy.md) — canonical waterfall chains by enrichment goal (every recipe's "fallback" follows these).
- [`references/alternatives.md`](references/alternatives.md) — provider swap-ins from the long tail when the priority stack can't serve.
- [`references/output-retrieval.md`](references/output-retrieval.md) — `run download-outputs` patterns for fetching action data.
