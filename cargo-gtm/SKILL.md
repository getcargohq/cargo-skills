---
name: cargo-gtm
description: "Front door for any GTM task on Cargo — sourcing, waterfall enrichment, email/phone/LinkedIn lookup, email verification, scoring, qualification, sequencing, CRM sync, and signal monitoring (job changes, funding, tech-stack/hiring intent). Use when the user states a real-world goal involving prospects, leads, accounts, contacts, ICP lists, or campaign activation. Routes to phase guides (Level 2), recipes (Level 2.5), and per-provider playbooks (Level 3) before any action call."
version: "1.0.0"
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
        package: "@cargo-ai/cli"
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

If none match, scan the phase docs above for the closest pattern and adapt — or invoke [`agents/execution-plan-creator.md`](agents/execution-plan-creator.md) to compose a custom chain with provider/action slugs and cost estimates.

## 3) Priority provider stack (recipes lead with these 6)

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

## 4) Recipe spine (default chain)

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
```

Adapt by phase: drop steps that aren't relevant to the user's goal. For pure sourcing, run step 1 only. For "enrich a list I already have," run steps 2–7.

## 5) Output retrieval — use `run download-outputs`, not `run download`

When the agent needs the actual data produced by an action (enriched fields, found emails, search results), use:

```bash
cargo-ai orchestration run download-outputs \
  --workflow-uuid <uuid> \
  --output-node-slug <slug> \
  --format json \
  --is-finished
```

Returns `{"url": "..."}` — a signed URL to a CSV/JSON containing only the output node's data. Faster and cheaper than `run download` (which pulls full run records). See [`references/output-retrieval.md`](references/output-retrieval.md) and [`../cargo-analytics/SKILL.md`](../cargo-analytics/SKILL.md).

## 6) Action shape rules (every recipe)

Every action JSON in this skill follows the rules in [`../cargo-orchestration/references/actions.md`](../cargo-orchestration/references/actions.md):

- `kind: "connector"` action shape: `{"kind":"connector","integrationSlug":"<slug>","actionSlug":"<slug>","config":{}}`. **`connectorUuid` is NOT in `config`** — the platform resolves the workspace's authenticated connector from `integrationSlug` automatically.
- For multi-step node graphs: `connectorUuid` lives at the top level of the node, not in `config`. Cross-node interpolation uses `{{nodes.<slug>.<field>}}`. Agent node outputs wrap under `.answer` (read as `{{nodes.<slug>.answer.<field>}}`).

## 7) When stuck — file a workspace report

If a recipe fails repeatedly and the cause isn't obvious, escalate via `cargo-ai workspaceManagement report create`. See [`../cargo-workspace-management/SKILL.md`](../cargo-workspace-management/SKILL.md) (Reports section).

## 8) Provider playbooks

Per-provider deep dives for the priority stack. Long-tail providers don't have dedicated playbooks yet — fall back to [`references/alternatives.md`](references/alternatives.md) and [`references/stage-action-map.md`](references/stage-action-map.md).

**Priority stack:**
- [`provider-playbooks/salesNavigator.md`](provider-playbooks/salesNavigator.md) — cheapest sourcing in the catalog (0.02–0.05/record).
- [`provider-playbooks/cargo.md`](provider-playbooks/cargo.md) — 22 native enrichment + signal actions; the `match*` actions are key for dedup.
- [`provider-playbooks/waterfall.md`](provider-playbooks/waterfall.md) — swiss-army-knife: enrichment, verification, and the cargo-unique `detectJobChange` signal.
- [`provider-playbooks/FullEnrich.md`](provider-playbooks/FullEnrich.md) — premium contact lookup; `reverseEmailLookup` is unique.
- [`provider-playbooks/theirStack.md`](provider-playbooks/theirStack.md) — tech-stack + hiring-intent signals.
- [`provider-playbooks/peopleDataLabs.md`](provider-playbooks/peopleDataLabs.md) — heavyweight backfill at flat 3-credit tier.

## 9) References

- [`references/stage-action-map.md`](references/stage-action-map.md) — cheapest credits-based action per stage across the full 120-integration catalog.
- [`references/credits-cost-table.md`](references/credits-cost-table.md) — auto-generated cost table for all 141 credits-based actions.
- [`references/waterfall-strategy.md`](references/waterfall-strategy.md) — canonical waterfall chains by enrichment goal (every recipe's "fallback" follows these).
- [`references/alternatives.md`](references/alternatives.md) — provider swap-ins from the long tail when the priority stack can't serve.
- [`references/output-retrieval.md`](references/output-retrieval.md) — `run download-outputs` patterns for fetching action data.
