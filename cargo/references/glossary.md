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

**app (Cargo Hosting)**
A hosted Vite single-page app served on `https://<slug>.cargo.app`, built on `@cargo-ai/app-sdk` (Vite + refine, with `getCargoEnv()` / `useCargoApi()` wired to the workspace). Scaffolded with `hosting app init`, registered as a slot with `hosting app create` (which sets the globally-unique `--slug`), shipped via a **deployment**. Managed in the **`cargo-hosting`** skill. Distinct from a **worker** (a UI-less edge HTTP handler).

**appUuid**
The UUID of a Cargo Hosting app, returned by `hosting app create`. Passed as `--app-uuid` to deployment commands (`deployment create|list|get-promoted`), mutually exclusive with `--worker-uuid`.

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
A skill that documents one CLI domain (orchestration, storage, connection, AI, content, context, analytics, billing, hosting, workspace management). Capability skills are the "standard library" — the agent loads them when it needs the syntax for a specific CLI command. They sit at the repo root alongside the outcome skill (`cargo-gtm`). Capability skills never reference outcome skills (one-way dependency: outcome → capability).

**chat**
A conversation session between a user and an agent. Created with `ai chat create --agent-uuid <uuid>`. Messages are sent to a chat via `ai message create --chat-uuid <uuid>`.

**conjonction**
The intentional French spelling used as the key name in Cargo filter JSON objects. Always `"conjonction"`, never `"conjunction"`. A typo here silently returns no records — no error is thrown.

**column**
A typed field on a Cargo model. Each column has a `slug`, `type` (see **column type** below), `label`, and `kind` (see **column kind** below). Columns have no `uuid` — they are identified by `slug` within the model. Managed via `cargo-storage` (`storage column list|create|update|remove|reorder`). Column `slug` values are used in filter conditions and in `storage query execute` SQL queries.

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

**context**
The workspace's git-backed knowledge base of typed markdown/MDX files capturing GTM truth: company narrative, ICPs, personas, JTBDs, plays, proof, objections, signals, mediums, alternatives, clients, insights. Read and written by both humans and agents. Managed via `cargo-context` (`cargo-ai context runtime ...` and `cargo-ai context graph ...`). Distinct from the **system of record** (Cargo storage queried with SQL) and from agent **memories** (per-agent mem0 entries).

**content domain**
The CLI domain (`cargo-ai content …`) for workspace **files** and **libraries** — the binary/grouped knowledge attached to agents for RAG. Files and libraries moved here from the `ai` domain in CLI ≥ 1.0.19 (the old `cargo-ai ai file …` commands no longer exist). Documented in the **`cargo-content`** skill; attaching them to an agent lives in `cargo-ai`. Distinct from **context** (git-backed markdown).

**context repository**
The GitHub repository that backs the workspace's context. Files in this repo follow strict conventions: `kebab-case.md` filenames, YAML frontmatter with required `title` and `description`, and `domain/slug` cross-refs without `.md`. The canonical example is [`getcargohq/cargo-workspaces`](https://github.com/getcargohq/cargo-workspaces). See `cargo-context/references/conventions.md` for the full domain list and per-domain templates.

**credit**
The unit of consumption on Cargo. Workflows consume credits when they execute nodes — particularly connector and agent nodes. Tracked via `cargo-billing`.

---

## D

**dataset**
A logical grouping of models in the Cargo workspace. Similar to a schema or folder. Models belong to datasets. Listed via `storage dataset list`.

**DDL**
Data Definition Language. In Cargo context, the result of `storage model get-ddl <uuid>` — contains the SQL table name, column definitions, and SQL dialect (`language`). Run when you need column types or the SQL dialect; `storage query execute` and `storage query download` reference tables by `<datasetSlug>.<modelSlug>` directly.

**deployment (Cargo Hosting)**
One build+upload of a local source directory to a hosting **app** or **worker**, created with `hosting deployment create --source <pkg-root>` (the backend runs `npm ci && vite build` for apps, or bundles the entrypoint for workers). A deployment is **not live until promoted** — `hosting deployment promote` points the subdomain at it, and `hosting deployment get-promoted` shows what's currently live. Managed in the **`cargo-hosting`** skill.

**deploymentUuid**
The UUID returned by `hosting deployment create`. Poll it with `hosting deployment get <uuid>` until the build status is terminal, then pass it to `hosting deployment promote --uuid`.

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

## H

**hosting**
The CLI domain (`cargo-ai hosting …`) for Cargo Hosting — **apps** (Vite SPAs on `*.cargo.app`), **workers** (serverless edge HTTP handlers), and the **deployments** that ship and promote them. The lifecycle is `init` (local scaffold) → `create` (slot + globally-unique slug) → `deployment create` (build+upload) → `deployment promote` (go live). Documented in the **`cargo-hosting`** skill.

---

## I

**ICP (Ideal Customer Profile)**
The target prospect description used to filter sourcing and qualification: industry, size band, geography, tech stack, role, funding stage, etc. Every prospecting recipe begins by translating the user's stated ICP into provider filters. Often captured as a `icp/<slug>.md` file in the context repo.

**ICP fit**
The degree to which a record matches the ICP. Often expressed as a 0–10 score from a scoring agent (`anthropic.instruct` or similar) over enriched record fields. See `cargo-gtm/guides/writing-outreach.md` for scoring patterns.

**intent signal**
An observable behavior suggesting a company is ready to buy: hiring for a relevant role, raising funding, adding/removing tech in their stack, posting recent LinkedIn updates, anonymous website visits, recent job changes among employees. Cargo surfaces intent signals via `cargo.enrichBusinessFunding…`, `theirStack.searchJobs`, `waterfall.detectJobChange`, `snitcher.searchSessions`, and others. Tracked as `signal/<slug>.md` files in the context repo.

**integration**
The external service type — e.g. HubSpot, Clearbit, Salesforce. Defines what actions are available. A single integration can have multiple connectors (multiple authenticated accounts). Listed via `connection integration list`.

**integrationSlug**
The string identifier for an integration type (e.g. `hubspot`, `clearbit`, `salesforce`). Used in `kind: "connector"` node definitions alongside `actionSlug`.

---

## K

**knowledge graph**
The typed graph of nodes and cross-references derived from every markdown/MDX file in the **context repository**. Built (or loaded from cache) via `cargo-ai context graph get`. Each node carries parsed frontmatter (`title`, `description`) and outbound `domain/slug` references. Used to audit cross-references, discover existing entries, and power downstream agents that need the typed structure of the workspace's context. See `cargo-context/references/examples/graph-queries.md` for ready-to-run queries.

---

## L

**languageModelSlug**
The identifier for an LLM used by an agent or inline agent node. Examples: `gpt-4o`, `gpt-4o-mini`, `claude-3-5-sonnet-20241022`, `claude-3-5-haiku-20241022`. Set on `agent create` or `agent update`.

**library**
A collection in the **content domain** (`cargo-ai content library …`) that groups files into one resource an agent can reference for RAG. `native` libraries are workspace-managed; `connector`-backed libraries sync documents from an external source through an unstructured-data extractor (`--extractor-slug`).

---

## M

**MCP server**
A Model Context Protocol server that exposes additional actions to agents. Connected via `cargo-ai`. Once connected, agents can call MCP actions automatically during conversations or workflow runs.

**memory**
A piece of information an agent stores from a conversation for future reference. Listed via `ai memory list --agent-uuid <uuid>`. Can be cleared with `ai memory remove`. Distinct from the **context repository** (workspace-wide, structured, git-backed) and from agent files / RAG resources.

**model**
A structured data table in the Cargo workspace — e.g. Companies, Contacts, Deals. Has columns, relationships, and an associated SQL table in the system of record. Not to be confused with a language model.

**modelUuid**
The UUID of a Cargo data model (table). Required for `segment fetch`, `segment download`, and as input to `model get-ddl`. Note: `storage query execute` references models by their **slug** (`<datasetSlug>.<modelSlug>`), not their UUID.

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
A segment-driven workflow that reacts automatically to data changes (records added, updated, or removed from a segment). Listed via `orchestration play list`. Triggered via `batch create` (not `run create`). The strategy behind a play is often captured as `play/<slug>.md` in the context repo (hypothesis, trigger, audience, channel, sequence, proof).

**polling**
The pattern of repeatedly calling `run get`, `batch get`, or `message get` until the operation reaches a terminal state. See `cargo-orchestration/references/polling.md` for intervals and shell snippets.

**persona**
A role / title shape that's part of the ICP. Example personas: "Head of RevOps at a B2B SaaS", "Founder at a seed-stage fintech". Used as filters for `salesNavigator.searchLeads`, `peopleDataLabs.searchPeople`, etc. Captured as `persona/<slug>.md` in the context repo with role, KPIs, pains, motivations, preferred channels, and common objections.

**priority stack**
The 6 default credits-based providers used as the spine of every recipe in `cargo-gtm/`: **salesNavigator** (sourcing), **cargo** native (firmographic + signal intelligence), **waterfall** (multi-source enrichment + verification + job-change signal), **FullEnrich** (premium contact lookup), **theirStack** (tech-stack + hiring intent), **peopleDataLabs** (heavyweight backfill). See `cargo-gtm/SKILL.md` for the full stack reference and per-provider playbooks.

**proof**
An atomic proof point — one metric, quote, case fact, or benchmark — stored as `proof/<slug>.md` in the context repo. Cross-referenced from plays, objections, and decks. Keep proof entries atomic (one fact per file) so they can be filtered in the knowledge graph.

**prospect**
A person being marketed or sold to — typically resolved to a `prospect_id` via `cargo.matchProspect`. Distinct from a "lead" (which usually implies an inbound or marketing-qualified context); cargo uses "prospect" generically.

**prospecting**
The activity of finding prospects matching an ICP, enriching them with contact details and signals, and preparing them for outreach. Cargo's prospecting recipe lives at `cargo-gtm/recipes/prospecting.md`.

---

## R

**RAG (Retrieval-Augmented Generation)**
A pattern where an agent references uploaded files (PDFs, CSVs, text) or libraries to ground its responses in specific knowledge. Files are uploaded via `cargo-ai content file upload` (libraries via `content library`) and attached to agents through the release's `resources`.

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

**runtime sandbox**
A checked-out, executable copy of the **context repository** that backs every `cargo-ai context runtime ...` command. `runtime write` and `runtime edit` commit and **push to the default branch**; `runtime execute` runs a shell command in the sandbox but **does not push** any file changes. Use `execute` for inspection (grep, ls, find); use `write`/`edit` for any change that should land in git.

---

## S

**segment**
A filtered, live view of records in a model. Defined by a filter condition. Used as the trigger population for plays and as a data source for batch runs. Listed via `segmentation segment list`.

**segmentUuid**
The UUID of a segment. Used in `batch create --data '{"kind":"segment","segmentUuid":"..."}'`. Note: `segment fetch` and `segment download` require `--model-uuid`, not `--segment-uuid`.

**slug**
A human-readable string identifier used throughout the platform. Node slugs identify nodes within a graph (e.g. `enrich_company`). Integration slugs identify integration types (e.g. `clearbit`). Column slugs identify model columns. Slugs use only `[a-zA-Z0-9_]`. In the **context repository**, slugs are kebab-case filenames without the `.md` extension and are referenced as `domain/slug`.

**signal**
See **intent signal**. In cargo recipes, signals are the basis for segment construction (e.g. "all companies that just raised funding AND are hiring engineers") and outbound timing. Captured as `signal/<slug>.md` files in the context repo.

**sourcing**
The activity of finding companies or people matching ICP criteria. Cheapest at-scale options: `salesNavigator.searchLeads` (0.02 cred/record), `salesNavigator.searchAccounts` (0.05). For investor / funding / complex filters: `peopleDataLabs.queryCompanies` (3). For local SMBs: `serper.searchPlaces` (1).

**system of record (SoR)**
Cargo's storage layer, backed by a customer-connected database (BigQuery, Snowflake, etc.) that Cargo queries via SQL. Queried with `cargo-ai storage query execute "<sql>"` (or `storage query download --query "<sql>"` for full exports), which references tables as `<datasetSlug>.<modelSlug>` (e.g. `default.companies`). Use `cargo-ai storage model get-ddl <model-uuid>` for column types and SQL dialect. Distinct from the **context repository** (markdown/MDX knowledge base, not relational data) and from the **orchestration query** surface (`cargo-ai orchestration query execute`, which targets the `runs`/`batches`/`spans`/`records` runtime tables).

---

## T

**TAM (Total Addressable Market)**
The full universe of companies (and optionally contacts at those companies) matching an ICP. Cargo's TAM-build recipe lives at `cargo-gtm/recipes/build-tam.md`, typically producing 100–10,000 company lists.

**template**
A pre-built blueprint for a workflow node graph (`orchestration template list`) or an AI agent (`ai template list`). Used to bootstrap common patterns without building from scratch. In the **context repository**, every domain also ships a `_template.md` documenting the expected sections (read it with `cargo-ai context runtime read --path <domain>/_template.md`).

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

**worker (Cargo Hosting)**
A hosted serverless HTTP handler that runs on the edge — a standard `fetch(request, env)` entrypoint built on `@cargo-ai/worker-sdk` (automatic OpenAPI 3.1 spec at `/openapi.json`, Swagger UI at `/docs`). Scaffolded with `hosting worker init`, registered with `hosting worker create`, shipped via a **deployment**. Has no `env` subcommand (unlike an **app**) — runtime config arrives via the `env` argument to `fetch`. Managed in the **`cargo-hosting`** skill.

**workerUuid**
The UUID of a Cargo Hosting worker, returned by `hosting worker create`. Passed as `--worker-uuid` to deployment commands, mutually exclusive with `--app-uuid`.

**workflow**
A DAG of nodes that defines the execution logic for a play or tool. Workflows don't have a `name` field — find them by name via `play list` or `tool list`, then extract `workflowUuid`.

**workflowUuid**
The UUID of a workflow. The primary key for most orchestration, analytics, and billing commands. Get it from `play list` or `tool list` → `.workflowUuid`.

**workspace**
The top-level organizational unit in Cargo. All resources (models, agents, workflows, connectors, the context repository) belong to a workspace. Identified by a `workspaceUuid`. Managed via `cargo-workspace-management`.
