# End-to-end use cases

Worked recipes showing which skills to load and the command sequence for common Cargo scenarios. Use these as a starting point — each links to the relevant skill docs for the full per-command reference.

## 1. Enrich a single company (simplest path)

**Skills needed:** `cargo-orchestration`

```
1. orchestration action execute            → run a connector action on one record
   --action '{"kind":"connector","integrationSlug":"clearbit","actionSlug":"company_enrich","config":{}}'
   --data '{"domain":"acme.com"}' --wait-until-finished
```

## 2. Enrich a list of companies and push to CRM

**Skills needed:** `cargo-storage`, `cargo-connection`, `cargo-orchestration`, `cargo-analytics`

```
1. storage model get-ddl                   → get exact table name
2. connection connector list               → get enrichment + CRM connector UUIDs
3. connection integration get <slug>       → discover third-party action slugs (e.g. HubSpot, Clearbit)
4. orchestration tool list                 → find the enrichment tool
5. orchestration batch create      → run on a segment of companies
6. orchestration batch get         → poll until status is terminal
7. analytics run download          → export results
```

## 3. Score leads with AI and update the model

**Skills needed:** `cargo-ai`, `cargo-orchestration`, `cargo-billing`

```
1. ai agent list                   → find or create the scoring agent
2. ai agent create                 → configure instructions, model, temperature 0.0
3. orchestration play list         → find the scoring play
4. orchestration batch create      → trigger on a segment of new leads
5. orchestration batch get         → poll until status is terminal
6. billing usage get-metrics       → check credit consumption
```

## 4. Build a custom enrichment workflow from scratch

**Skills needed:** `cargo-connection`, `cargo-orchestration`

```
1. connection connector list               → get connector UUID
2. connection integration get <slug>       → get actionSlug for the third-party service
3. orchestration node validate --nodes     → validate graph before running
4. orchestration run create --nodes        → run with custom node graph
5. orchestration run get                   → poll to terminal state
```

## 5. Monitor workflow health and alert on errors

**Skills needed:** `cargo-orchestration`, `cargo-analytics`

```
1. orchestration tool list / play list    → discover workflowUuid
2. analytics run count --statuses error   → count errors in period
3. analytics run get-metrics              → get success/error rate breakdown
4. analytics run download --statuses error → download failed runs for inspection
```

## 6. Bootstrap a fresh workspace

**Skills needed:** `cargo-workspace-management`, `cargo-storage`, `cargo-connection`, `cargo-ai`

```
1. workspaceManagement token create --name <label>   → create a dedicated, named API token
2. workspaceManagement role list             → discover available roles
3. workspaceManagement user create           → invite team members
4. storage model create            → create Companies and Contacts models
5. storage column create           → add columns (name, domain, employee_count, etc.)
6. storage relationship set        → link Contacts → Companies
7. connection connector create     → connect enrichment and CRM integrations
8. ai agent create                 → configure an AI agent for research or scoring
9. workspaceManagement folder create         → organize plays and tools into folders
```

## 7. Export and analyze segment data

**Skills needed:** `cargo-storage`, `cargo-analytics`

```
1. storage model list              → get modelUuid
2. analytics segment download      → export with filter and sort
   --filter '{"conjonction":"and","groups":[
     {"conjonction":"and","conditions":[
       {"kind":"string","columnSlug":"country","operator":"is","values":["US"]}
     ]}
   ]}'
   --sort '[{"columnSlug":"created_at","kind":"desc"}]'
```

## 8. Author and audit the workspace's GTM context repo

**Skills needed:** `cargo-context`

```
1. context runtime browse                          → see the domain layout
2. context runtime read --path persona/_template.md → grab the template for the target domain
3. context runtime write --path persona/<slug>.md  → add the entry (frontmatter + body, pushes to default branch)
4. context graph get | jq …                        → audit cross-refs, find plays missing proof, etc.
```

See `../../cargo-context/references/examples/authoring.md` and `../../cargo-context/references/examples/graph-queries.md` for full recipes.
