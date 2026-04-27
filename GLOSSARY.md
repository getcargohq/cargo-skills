# Glossary

Key terms used across the Cargo CLI skills.

---

## A

**action**
A discrete operation that an AI agent or workflow can perform. Actions come in four kinds: `tool` (orchestration tool), `connector` (third-party integration action), `agent` (AI agent), and `native` (built-in platform action). Actions replace the previous "tools" terminology in AI releases and messages. Execute a single action with `orchestration action execute`, or a single action across multiple records with `orchestration action execute-batch`. To chain multiple actions, use `run create` with `--nodes` or `batch create`.

**actionSlug**
A string identifier for a specific action on a workflow node. Present on both `kind: "native"` and `kind: "connector"` nodes.

- **Native nodes** — built-in Cargo actions discovered via `cargo-ai connection native-integration get` (keys of the `actions` object): `start`, `end`, `branch`, `filter`, `variables`, `agent`, `python`, `script`, etc. These are generic platform actions, not third-party service actions.
- **Connector nodes** — third-party service-specific actions discovered via `cargo-ai connection integration get <slug>` (e.g. `integration get hubspot`). Examples: `company_enrich`, `create_contact`, `send_message`. **Do not use `native-integration get` for these** — it will not return HubSpot, Salesforce, or other connector-specific actions.

**agent**
An AI resource with configured instructions, a language model, and optional actions. Created and configured via `cargo-ai`. Used in workflows as a `kind: "agent"` node, or messaged directly via `cargo-orchestration`.

**autocomplete**
A mechanism to fetch the list of allowed values for an action config field at runtime. When an action's `uiSchema` marks a field with `"ui:widget": "IntegrationAutocompleteWidget"`, its valid values must be retrieved via `cargo-ai connection connector autocomplete --connector-uuid <uuid> --slug <slug> --params '<json>'`. The autocomplete slug and params come from the field's `ui:options` in the `uiSchema`. Returns `{ "results": [{ "label": "...", "value": "..." }] }` — use the `value` in node configs.

---

## B

**batch**
A bulk execution of a workflow across multiple records. Created with `orchestration batch create`. Returns a `batchUuid` which is polled until `status` reaches `success`, `error`, or `cancelled`. Batches can be scoped to a segment, a list of record IDs, a file, or a filter.

**batchUuid**
The UUID returned by `batch create`. Used to poll batch status (`batch get`), download results (`batch download`), and filter run metrics.

---

## C

**capability skill**
A skill that documents one CLI domain (orchestration, storage, connection, AI, analytics, billing, workspace management). Capability skills are the "standard library" — the agent loads them when it needs the syntax for a specific CLI command. They sit at the repo root alongside the outcome skill (`cargo-gtm`). Capability skills never reference outcome skills (one-way dependency: outcome → capability).

**chat**
A conversation session between a user and an agent. Created with `ai chat create --agent-uuid <uuid>`. Messages are sent to a chat via `ai message create --chat-uuid <uuid>`.

**conjonction**
The intentional French spelling used as the key name in Cargo filter JSON objects. Always `"conjonction"`, never `"conjunction"`. A typo here silently returns no records — no error is thrown.

**column**
A typed field on a Cargo model. Each column has a `slug`, `type` (see **column type** below), `label`, and `kind` (see **column kind** below). Columns have no `uuid` — they are identified by `slug` within the model. Managed via `cargo-storage` (`storage column list|create|update|remove|reorder`). Column `slug` values are used in filter conditions and in system-of-record SQL queries.

**column type**
The data type of a model column. Stored as the `type` field on the column object. Set on `column create --type <value>` and returned as `type` in `column list` and `model list` responses.

When building a filter condition, the condition's `kind` field must match the target column's `type`. A mismatch silently returns no records.

| `type`    | Use for                  | Filter condition operators (when used as `kind`)                                                            |
| --------- | ------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `string`  | Text, names, URLs, slugs | `is`, `isNot`, `contains`, `doesNotContain`, `startsWith`, `endsWith`, `isNull`, `isNotNull`, `isEmpty`, `isNotEmpty` |
| `number`  | Counts, amounts, scores  | `is`, `isNot`, `greaterThan`, `lowerThan`, `between`, `isNull`, `isNotNull`                                 |
| `boolean` | Flags, yes/no values     | `isTrue`, `isFalse`, `isNull`, `isNotNull`                                                                  |
| `date`    | Timestamps, dates        | `is`, `isNot`, `greaterThan`, `lowerThan`, `between`, `isNull`, `isNotNull`                                 |
| `object`  | Nested JSON objects      | `isNull`, `isNotNull`, `matchConditions`                                                                    |
| `array`   | Lists of values          | `isNull`, `isNotNull`, `matchConditions`                                                                    |
| `vector`  | Embedding vectors        | `isNull`, `isNotNull`                                                                                       |
| `any`     | Untyped / mixed values   | `isNull`, `isNotNull`                                                                                       |

See `cargo-orchestration/references/filter-syntax.md` for the full filter reference with examples for each kind.

**column kind**
How a column is sourced. Stored as the `kind` field on the column object. Determines whether the column is raw data or derived.

| `kind`     | Description                                                              |
| ---------- | ------------------------------------------------------------------------ |
| `original` | Comes directly from the data source (integration extractor or SoR sync)  |
| `custom`   | User-defined column added manually                                       |
| `computed` | Derived from an expression over other columns (e.g. concatenation, AI)   |
| `metric`   | Aggregated value from a related model (e.g. count, sum, avg)             |
| `lookup`   | Single field pulled from a related model via a join                       |

`type` and `kind` are independent: a `computed` column can have `type: "string"`, a `metric` column has `type: "number"`, etc.

**connector**
An authenticated instance of an integration. For example, a specific HubSpot account connected to your workspace. Referenced by `connectorUuid` in workflow node graphs. Listed via `connection connector list`.

**connectorUuid**
The UUID of a specific authenticated connector. Required for `kind: "connector"` nodes in workflow graphs and for filtering billing metrics.

**credit**
The unit of consumption on Cargo. Workflows consume credits when they execute nodes — particularly connector and agent nodes. Tracked via `cargo-billing`.

---

## D

**dataset**
A logical grouping of models in the Cargo workspace. Similar to a schema or folder. Models belong to datasets. Listed via `storage dataset list`.

**DDL**
Data Definition Language. In Cargo context, the result of `storage model get-ddl <uuid>` — contains the exact SQL table name and column definitions needed to query the system of record. Always run this before writing SQL.

---

## E

**enrollment filter**
A segment filter condition (`kind: "enrollment"`) that includes or excludes records based on their history with a workflow — whether they've entered it, how many times, or when they last left.

**expression**
A dynamic config value in a node graph. Either a `templateExpression` using `{{nodes.<slug>.<field>}}` syntax, or a `jsExpression` using raw JavaScript. Used to pass data between nodes at runtime.

---

## F

**filter**
A JSON object used to select records from a model or segment. Always has the structure `{"conjonction": "and"|"or", "groups": [...]}`. See `cargo-orchestration/references/filter-syntax.md` for the full reference.

**folder**
An organizational container for plays, tools, and agents in the Cargo app. Managed via `cargo-workspace-management`. Has no effect on workflow execution.

---

## G

**GTM (go-to-market)**
The set of activities for finding, qualifying, and engaging prospects: sourcing, enrichment, verification, scoring, sequencing, CRM sync, signal monitoring. The `cargo-gtm` outcome skill is cargo's front door for any GTM task.

---

## I

**ICP (Ideal Customer Profile)**
The target prospect description used to filter sourcing and qualification: industry, size band, geography, tech stack, role, funding stage, etc. Every prospecting recipe begins by translating the user's stated ICP into provider filters.

**ICP fit**
The degree to which a record matches the ICP. Often expressed as a 0–10 score from a scoring agent (`anthropic.instruct` or similar) over enriched record fields. See `cargo-gtm/guides/writing-outreach.md` for scoring patterns.

**intent signal**
An observable behavior suggesting a company is ready to buy: hiring for a relevant role, raising funding, adding/removing tech in their stack, posting recent LinkedIn updates, anonymous website visits, recent job changes among employees. Cargo surfaces intent signals via `cargo.enrichBusinessFunding…`, `theirStack.searchJobs`, `waterfall.detectJobChange`, `snitcher.searchSessions`, and others.

**integration**
The external service type — e.g. HubSpot, Clearbit, Salesforce. Defines what actions are available. A single integration can have multiple connectors (multiple authenticated accounts). Listed via `connection integration list`.

**integrationSlug**
The string identifier for an integration type (e.g. `hubspot`, `clearbit`, `salesforce`). Used in `kind: "connector"` node definitions alongside `actionSlug`.

---

## L

**languageModelSlug**
The identifier for an LLM used by an agent or inline agent node. Examples: `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`. Set on `agent create` or `agent update`.

---

## M

**MCP server**
A Model Context Protocol server that exposes additional actions to agents. Connected via `cargo-ai`. Once connected, agents can call MCP actions automatically during conversations or workflow runs.

**memory**
A piece of information an agent stores from a conversation for future reference. Listed via `ai memory list --agent-uuid <uuid>`. Can be cleared with `ai memory remove`.

**model**
A structured data table in the Cargo workspace — e.g. Companies, Contacts, Deals. Has columns, relationships, and an associated SQL table in the system of record. Not to be confused with a language model.

**modelUuid**
The UUID of a Cargo data model (table). Required for `segment fetch`, `segment download`, and as input to `model get-ddl` before SoR queries.

---

## N

**native integration**
A built-in Cargo integration type (distinct from third-party connector integrations). Native nodes (`kind: "native"`) include built-in workflow actions like `start`, `end`, `branch`, `filter`, `variables`, `agent`, `python`, `script`. They have no rate limits.

**node**
A single step in a workflow graph. Has a `kind` (`native`, `connector`, `tool`, or `agent`), a `slug`, a `config`, and `childrenUuids` pointing to downstream nodes.

**node graph**
A directed acyclic graph (DAG) of nodes defining a workflow's execution steps. Passed as a JSON array to `run create --nodes` or `batch create --nodes` to override a workflow's deployed release.

---

## O

**outcome skill**
A skill the agent loads when the user states a real-world goal (e.g. "build a TAM list", "find 5 fintech CTOs", "monitor job changes"). The repo ships one outcome skill, **`cargo-gtm`**, which routes across all GTM scenarios via internal recipes (`cargo-gtm/recipes/*.md`). It composes actions across multiple CLI domains and delegates to capability skills via relative paths (`../<name>/...`). The "application library" sitting on top of the capability "standard library".

**output node**
The terminal node of a workflow / tool / play whose output is the canonical result of a run. Identified by its `slug` (typically `output` or `end`) on the deployed release. Required input to `cargo-ai orchestration run download-outputs --output-node-slug <slug>` for retrieving action results.

---

## P

**play**
A segment-driven workflow that reacts automatically to data changes (records added, updated, or removed from a segment). Listed via `orchestration play list`. Triggered via `batch create` (not `run create`).

**polling**
The pattern of repeatedly calling `run get`, `batch get`, or `message get` until the operation reaches a terminal state. See `cargo-orchestration/references/polling.md` for intervals and shell snippets.

**persona**
A role / title shape that's part of the ICP. Example personas: "Head of RevOps at a B2B SaaS", "Founder at a seed-stage fintech". Used as filters for `salesNavigator.searchLeads`, `peopleDataLabs.searchPeople`, etc.

**priority stack**
The 6 default credits-based providers used as the spine of every recipe in `cargo-gtm/`: **salesNavigator** (sourcing), **cargo** native (firmographic + signal intelligence), **waterfall** (multi-source enrichment + verification + job-change signal), **FullEnrich** (premium contact lookup), **theirStack** (tech-stack + hiring intent), **peopleDataLabs** (heavyweight backfill). See `cargo-gtm/SKILL.md` for the full stack reference and per-provider playbooks.

**prospect**
A person being marketed or sold to — typically resolved to a `prospect_id` via `cargo.matchProspect`. Distinct from a "lead" (which usually implies an inbound or marketing-qualified context); cargo uses "prospect" generically.

**prospecting**
The activity of finding prospects matching an ICP, enriching them with contact details and signals, and preparing them for outreach. Cargo's prospecting recipe lives at `cargo-gtm/recipes/prospecting.md`.

---

## R

**RAG (Retrieval-Augmented Generation)**
A pattern where an agent references uploaded files (PDFs, CSVs, text) to ground its responses in specific knowledge. Files are uploaded via `ai file upload` and attached to agents.

**record**
A single row in a Cargo model (e.g. one company, one contact). Identified by a `recordId`. Processed individually by runs or in bulk by batches.

**recordId**
The identifier of a specific record in a model. Used in `batch create --data '{"kind":"recordIds","recordIds":["id1","id2"]}'` to target specific records for processing.

**release**
A snapshot of a workflow's node graph at a point in time. When a workflow is deployed, a release is created. Runs and batches execute against a specific release. Referenced by `releaseUuid`.

**releaseUuid**
The UUID of a specific workflow release. Returned by `batch get` → `.releaseUuid`. Used to fetch node slugs via `release get` (needed for `batch download --output-node-slug`).

**run**
A single execution of a tool workflow against one record. Created with `orchestration run create`. Returns a `runUuid` polled until `status` reaches `success`, `error`, or `cancelled`.

**runUuid**
The UUID of a single workflow run. Used to poll status (`run get`), inspect results, and filter analytics.

---

## S

**segment**
A filtered, live view of records in a model. Defined by a filter condition. Used as the trigger population for plays and as a data source for batch runs. Listed via `segmentation segment list`.

**segmentUuid**
The UUID of a segment. Used in `batch create --data '{"kind":"segment","segmentUuid":"..."}'`. Note: `segment fetch` and `segment download` require `--model-uuid`, not `--segment-uuid`.

**slug**
A human-readable string identifier used throughout the platform. Node slugs identify nodes within a graph (e.g. `enrich_company`). Integration slugs identify integration types (e.g. `clearbit`). Column slugs identify model columns. Slugs use only `[a-zA-Z0-9_]`.

**signal**
See **intent signal**. In cargo recipes, signals are the basis for segment construction (e.g. "all companies that just raised funding AND are hiring engineers") and outbound timing.

**sourcing**
The activity of finding companies or people matching ICP criteria. Cheapest at-scale options: `salesNavigator.searchLeads` (0.02 cred/record), `salesNavigator.searchAccounts` (0.05). For investor / funding / complex filters: `peopleDataLabs.queryCompanies` (3). For local SMBs: `serper.searchPlaces` (1).

**system of record (SoR)**
A connected data warehouse (BigQuery, Snowflake, etc.) that Cargo can query via SQL. Queried with `system-of-record client query`. Always requires a DDL lookup first to get the exact table name.

---

## T

**TAM (Total Addressable Market)**
The full universe of companies (and optionally contacts at those companies) matching an ICP. Cargo's TAM-build recipe lives at `cargo-gtm/recipes/build-tam.md`, typically producing 100–10,000 company lists.

**template**
A pre-built blueprint for a workflow node graph (`orchestration template list`) or an AI agent (`ai template list`). Used to bootstrap common patterns without building from scratch.

**temperature**
A float between `0.0` and `1.0` controlling how deterministic an agent's responses are. `0.0` = fully deterministic; `1.0` = highly creative. Set on `agent create` or `agent update`.

**tool**
An on-demand workflow triggered manually, via API, or on a cron schedule. Listed via `orchestration tool list`. Supports both `run create` (single record) and `batch create` (multiple records).

---

## U

**uiSchema**
A companion object to `jsonSchema` in action and extractor configs. While `jsonSchema` defines the types and structure of fields, `uiSchema` provides UI rendering hints. The most important hint for CLI usage is `"ui:widget": "IntegrationAutocompleteWidget"` — this signals that the field's allowed values must be fetched dynamically using `connector autocomplete` rather than set to a freeform value. The `ui:options.slug` identifies which autocomplete endpoint to call, and `ui:options.params` (if present) specifies dependencies on other fields. See `cargo-connection` for the full autocomplete workflow.

---

## W

**waterfall enrichment**
A pattern where multiple providers are run sequentially, each filling gaps the prior step missed. Cheap providers do the heavy lifting; premium providers fill the long tail. Implemented as N sequential `action execute-batch` calls with the records pruned between calls. See `cargo-gtm/references/waterfall-strategy.md` for canonical chains by enrichment goal.

**workflow**
A DAG of nodes that defines the execution logic for a play or tool. Workflows don't have a `name` field — find them by name via `play list` or `tool list`, then extract `workflowUuid`.

**workflowUuid**
The UUID of a workflow. The primary key for most orchestration, analytics, and billing commands. Get it from `play list` or `tool list` → `.workflowUuid`.

**workspace**
The top-level organizational unit in Cargo. All resources (models, agents, workflows, connectors) belong to a workspace. Identified by a `workspaceUuid`. Managed via `cargo-workspace-management`.
