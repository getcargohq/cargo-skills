# Recipe — Find the buying committee at a target account

**Use when**: the user names one account, or a handful, and wants every stakeholder there who matches a set of titles, seniorities and departments.

**Trigger phrases**: "Find the buying committee at Acme.", "Who are the decision makers at this company?", "Find stakeholders at northwind.example.", "Multi-thread this account.", "Who else should I be talking to at this account?"

**Not this recipe**: sourcing across many companies rather than going deep on a few is [`prospecting.md`](prospecting.md). Finding net-new buyers across the customer base, deduped against the CRM and handed to outreach, is [`account-expansion.md`](account-expansion.md). A list of companies rather than people is [`build-tam.md`](build-tam.md).

## Why this recipe is its own thing

A buying committee is defined by function and level, not by one title: the CRO, the VP Marketing, the Director of RevOps and the VP Finance at the same account. `aiArk.searchPeople` takes a company domain plus closed seniority and department enums in one call, returns everyone who matches with title, seniority and department, and bills 0.05 per returned record. That makes going deep on one account cheap, where [`account-expansion.md`](account-expansion.md) fans a title search out across many customer accounts through `salesNavigator.searchLeads` (which keys on LinkedIn company IDs, not domains; see [`../provider-playbooks/salesNavigator.md`](../provider-playbooks/salesNavigator.md)).

Read [`../provider-playbooks/aiArk.md`](../provider-playbooks/aiArk.md) first, for the filter shape in particular. The output is named people, so [`../references/acceptable-use.md`](../references/acceptable-use.md) applies to what the list is for: its basis, suppression and relevance checks gate any outreach step that follows.

## Recipe

### Step 1 — Define the committee

Agree with the user on three things before any call:

- **The account**, as a domain (`acme.com`). Domains go in `companyInfo.domain_or`. Do not put a domain in `currentAndPastCompany.current_company_id_or`; that field wants AI Ark's own company IDs.
- **Seniority**, from the closed lowercase enum: `founder`, `owner`, `partner`, `c_suite`, `vp`, `director`, `head`, `manager`, `senior`, `mid-level`, `entry`, `intern`.
- **Departments**, as snake_case functions: `sales`, `marketing`, `operations`, `finance`, `sales_operations`, `information_technology`, and the rest. `cargo-ai connection integration get aiArk` lists them all (the `listSeniorities` and `listDepartmentsAndFunctions` autocompletes resolve the same enums).

A value outside either enum fails the run, so check spelling against the list rather than guessing (`VP`, `C-Suite` and `Sales Ops` all fail).

Title, tenure, past company and firmographics narrow the committee further (`jobRole.title_or`, `experience`, `currentAndPastCompany`, and the company groups in the playbook). Filters must sit inside their group. A flat `{"title": "CTO"}` is not a key: `action execute` refuses it (`Unknown field: title`), and inside a workflow node it is dropped silently, so the search runs unfiltered.

### Step 2 — Size it for free

`aiArk.countPeople` takes the same filter groups, no `limit`, and returns `{"count": N}` at no cost. Run it first, so `limit` in step 3 is set from a real number rather than a guess.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"countPeople"}' \
  --data '{
    "companyInfo": {"domain_or": ["acme.com"]},
    "jobRole": {
      "seniority_or": ["c_suite", "vp", "director"],
      "department_or": ["sales", "marketing", "operations", "finance"]
    }
  }' \
  --wait-until-finished
```

A count far above what a committee should be (hundreds at a mid-size account) means the filters are too loose: tighten seniority or add titles before paying for rows.

### Step 3 — Pull the committee at one account

Inputs go in `--data`; the action carries no `config`.

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchPeople"}' \
  --data '{
    "companyInfo": {"domain_or": ["acme.com"]},
    "jobRole": {
      "seniority_or": ["c_suite", "vp", "director"],
      "department_or": ["sales", "marketing", "operations", "finance"]
    },
    "limit": 25
  }' \
  --wait-until-finished
```

Every matching stakeholder at the account comes back with title, seniority and department; a direct run's output is at `.runContext.action`. Billing is per returned record, so `limit` is the budget cap (default 10, max 2,000).

Operations are asynchronous. `--wait-until-finished` blocks until done; without it you get a run UUID to poll with `cargo-ai orchestration run get <uuid>` (2s interval).

### Step 4 — Several accounts: pilot, then approve

For a list of accounts, use one batch rather than a loop of single calls: one record per account, each carrying its own `companyInfo.domain_or` and `limit`.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"aiArk","actionSlug":"searchPeople"}' \
  --records '[
    {"companyInfo":{"domain_or":["acme.com"]},"jobRole":{"seniority_or":["c_suite","vp","director"],"department_or":["sales","marketing","operations","finance"]},"limit":25},
    {"companyInfo":{"domain_or":["globex.com"]},"jobRole":{"seniority_or":["c_suite","vp","director"],"department_or":["sales","marketing","operations","finance"]},"limit":25}
  ]' \
  --wait-until-finished
```

Poll with `cargo-ai orchestration batch get <uuid>` (5s interval) if you leave off `--wait-until-finished`; read the rows from `cargo-ai orchestration batch download --uuid <batch-uuid>` (the batch object itself carries none).

**Never run this across a full list on the first attempt.** Sample 10–20 accounts, report the observed cost and hit-rate, then get the user to approve the full run, quoting the account count and the credit estimate (accounts × committee size × 0.05). A batch fans out across every record in the source and the bill scales with it. Rules: [`../references/cost-discipline.md`](../references/cost-discipline.md).

### Step 5 — Dedupe against contacts you already own

Before enriching anyone, drop the stakeholders the workspace already holds. Re-enriching a known contact is pure waste. Pull the Contacts model's rows at the same domains and compare on LinkedIn URL, the most reliable key; the commands are [`account-expansion.md`](account-expansion.md) steps 3 and 4. The dedupe is a free storage read.

### Step 6 — Enrich only the net-new

The survivors carry a LinkedIn URL, so the cheapest next rung is `aiArk.enrichPerson` (0.1, profile plus verified email, bills 0 when no email is found). Escalation and verification follow [`prospecting.md`](prospecting.md) from its ENRICH step; outreach on the result goes through the acceptable-use checks first.

## Example

> Who's on the buying committee at northwind.example — VP and above in Sales, Marketing, Ops and Finance?

Illustrative output, fictional records:

| full_name | title | linkedin_url |
|---|---|---|
| Priya Raman | Chief Revenue Officer | linkedin.com/in/priya-raman-example |
| Omar Haddad | VP Marketing | linkedin.com/in/omar-haddad-example |
| Grace Lin | Director of Revenue Operations | linkedin.com/in/grace-lin-example |
| Felix Brandt | VP Finance | linkedin.com/in/felix-brandt-example |

14 stakeholders returned for 0.7 credits (14 × 0.05); 3 are already in the CRM, so only the other 11 go on to enrichment.

## Cost

| Action | Credits |
|---|---|
| `aiArk.countPeople` | 0 |
| `aiArk.searchPeople` | 0.05 per returned record |
| `aiArk.enrichPerson` (step 6, net-new only) | 0.1, 0 when no email is found |

Every node execution also bills 0.01 credits, so a batch over N accounts adds N × 0.01 on top of the per-record price ([`../../cargo-billing/SKILL.md`](../../cargo-billing/SKILL.md), "The execution charge"). Prices: [`../references/credits-cost-table.md`](../references/credits-cost-table.md).

## Worth knowing

- **Filter-rich.** Title, seniority, department, tenure, past company and firmographics all narrow the committee.
- **`seniority_or` and `department_or` are closed lowercase enums**, and a value outside them fails the run. The full lists come from `cargo-ai connection integration get aiArk`.
- **Search bills per returned record, not per call.** A stray high `limit` pages through results (100 per page) and bills every row.
- **Rate limit: 240 calls per minute.** A large account batch stretches out; it does not fail.
- **Dedupe before enriching.** Re-enriching a contact you already own is pure waste.

## Related

- [`account-expansion.md`](account-expansion.md) — the same multi-threading idea across many customer accounts, sourced through `salesNavigator.searchLeads` and carried through to enrichment and an outreach signal. Use this recipe when the job is depth at a few named accounts.
- [`prospecting.md`](prospecting.md) — breadth: people across a whole market, then enrich, verify and sync.
- [`../provider-playbooks/aiArk.md`](../provider-playbooks/aiArk.md) — filter groups, enums, pitfalls.
- [`../provider-playbooks/salesNavigator.md`](../provider-playbooks/salesNavigator.md) — the alternative when LinkedIn-native filters (function codes, `recentUpdates`) matter more than price.
- [`outreach-activation.md`](outreach-activation.md) — turning the enriched committee into send-ready outreach.
