# Resource reference

Every builder is imported from `@cargo-ai/cdk`, takes `(slug, spec)` (except
`defineContext`, which takes only a spec — it's a workspace singleton), and returns
a **handle** carrying deferred output tokens (`uuid`, and for connectors
`datasetUuid`; for workers/apps `url`). Wire resources by passing a handle where a
reference is expected; use `xxRef("uuid")` for a resource not defined in code.

The tables below list the **commonly used** spec fields — the TypeScript types on
each builder are the source of truth for the complete set. Fields that take a
**ref** accept a handle or an `xxRef` (and `{ ref, …options }` when they carry
per-call options).

## Builders

| Builder | Purpose | Key spec fields | Ref fields | Outputs |
|---|---|---|---|---|
| `defineConnector(slug, spec)` | Data source or LLM provider | `integration`, `config` (typed per integration), `default?` (deprecated alias `adopt?`), `name?`, `rateLimit?`, `cacheTtlMilliseconds?` | — | `uuid`, `datasetUuid` (data connectors) |
| `defineModel(slug, spec)` | Table sourced from a connector's dataset | `connector`, `extractSlug`, `config`, `schedule?`, `folder?`, `unification?`, `additionalColumns?` (or `kind: "native"` with no connector) | `connector`, `folder` | `uuid` |
| `defineTool(slug, spec)` | Tool backed by a workflow | `workflow`, `description?`, `emojiSlug?`, `triggers?`, `folder?` | `folder` | `uuid` |
| `definePlay(slug, spec)` | Per-row automation over a model | `model`, `workflow?`, `changeKinds?`, `runCreationRule?`, `schedule?`, `isEnabled?`, `filter?`, `folder?` | `model`, `folder` | `uuid` |
| `defineAgent(slug, spec)` | AI agent | `connector`, `languageModel`, `systemPrompt`, `uses?` (tools, sub-agents, models, connector + native actions in one array), `capabilities?`, `files?` (`{ items, name?, description?, prompt?, readOnly? }[]`), `maxSteps?`, `triggers?`, `evaluator?`, `color?`, `folder?`, `harness?`, `repository?` | `connector`, everything in `uses`, `files[].items`, `folder` | `uuid` |
| `defineMcpServer(slug, spec)` | MCP endpoint bundling resources | `name?`, `description?`, `uses?` (tools, agents, models, connector + native actions in one array), `capabilities?`, `folder?` | everything in `uses`; `folder` | `uuid` |
| `defineFolder(slug, spec)` | Per-kind folder | `kind`, `name?`, `emojiSlug?`, `parent?` | `parent` | `uuid` |
| `defineFile(slug, spec)` | Content file from a local path | `path`, `name?`, `folder?`, `index?` (`vectorStore` default · `none`), `visibility?` (`private` default · `public`), `mirrorToContext?` (default `true`) | `folder` | `uuid` |
| `defineContext(spec)` | Workspace context repo (singleton) | `path?` (deprecated alias `dir?`), `files?` (`plan` fails on frontmatter that doesn't parse, or a `references:` / `[[wikilink]]` / relative `.md` link matching no declared file) | — | `uuid` |
| `defineSegment(slug, spec)` | Saved view over a model | `model` (immutable), `filter` (required) | `model` | `uuid` |
| `defineCapacity(slug, spec)` | Revenue-org capacity | `model?`, `idColumnSlug?`, `timeColumnSlug?`, `memberCapacity?`, `allocationExpirationPolicy?`, `filter?`, `color?`, `description?` | `model` | `uuid` |
| `defineTerritory(slug, spec)` | Revenue-org territory | `label?`, `members?` (`{ ref, weight? }[]`), `fallback?`, `color?`, `description?` | `members[].ref`, `fallback` | `uuid` |
| `defineWorker(slug, spec)` | Hosted worker (built server-side) | `path`, `description?`, `triggers?`, `env?`, `runAs?` (a service user), `folder?` | `runAs`, `folder` | `uuid`, `url` |
| `defineApp(slug, spec)` | Hosted static app (Vite by default; the app's own `build` script wins) | `path`, `name?`, `description?`, `env?` (no `secret()`), `domains?`, `folder?` | `folder` | `uuid`, `url`, `domainRecords` |
| `defineUser(slug, spec)` | **Service** user (non-human identity) | `kind: "service"` (only kind), `role`, `firstName?` (default: title-cased slug), `lastName?` | `role` | `uuid` |
| `defineRole(slug, spec)` | Workspace role | `adopt?` (bind an existing role — required for `admin`/`editor`/`viewer`/`extension`), `name?`, `color?`, `description?`, `permissions?` (required unless `adopt`) | — | `uuid` |
| `defineMember(email, spec?)` | Revenue-org member (**adopt-only**) | `meta?` (omit = leave live, `null` = clear, else replace), `mailboxes?` (omit = leave, `[]` = detach all) | `mailboxes` | `uuid` |
| `defineRelationship(slug, spec)` | Relationship between two models | `from: { model, column, property? }`, `to: { model, column, property? }`, `relation` (`oneToOne`/`oneToMany`/`manyToOne`) | `from.model`, `to.model` | `uuid` |
| `defineCustomIntegration(slug, spec)` | Custom integration served by a worker | `worker` (serves the `createCustomIntegration` contract from `@cargo-ai/worker-sdk`) | `worker` | `uuid` |
| `defineDomain(name, spec)` | Sending domain + its DNS zone | `adopt?`, `dnsRecords?` (records the deploy **manages**, merged into the live zone; dropping one deletes it next deploy; an app's `domainRecords` allowed), `redirectUrl?`, `dmarcEmail?` (`rua=`), `dmarcPolicy?` (`p=`: `none`/`quarantine`/`reject`) | — | `uuid` |
| `defineMailbox(slug, spec)` | Sending inbox on a domain (**monthly credit charge**) | `domain`, `type` (`google`/`shared`/`private` — no `outlook`), `username?` (defaults to slug), `firstName`, `lastName`, `signature?`, `dailySendLimit?` (0–40), `folder?`, `adopt?` | `domain`, `folder` | `uuid` |
| `defineAlert(slug, spec)` | Scheduled threshold alert (observability) | `schedule`, `scope`, `threshold`, `actions`, `name?`, `description?`, `enabled?`, `folder?` | scope: `workflow`/`connector`/`tool`/`agent`/`model`; each action's `ref`; `folder` | `uuid` |

**Executions** are not resources: `defineBatch(id, { workflow, data })` and
`defineRun(id, { workflow, data? })` run once on the next deploy and are remembered in
the state's ledger, never reconciled. They live under `outputs/`, not `infra/`. See
[`../guides/executions.md`](../guides/executions.md).

`defineWorkflow(slug, { input, output, uses? }, build)` is re-exported from
`@cargo-ai/cdk` for `defineTool`/`definePlay` bodies — see
[`../guides/authoring-resources.md`](../guides/authoring-resources.md).

## Capabilities

`capabilities` on `defineAgent` **and** on `defineMcpServer` (the latter since
`@cargo-ai/cdk` 1.0.70) takes either a bare slug or a `{ slug, config }` object —
`capabilities: ["webSearch"]` and `capabilities: [{ slug: "webSearch", config: {} }]`
are the same thing. The eleven slugs:

`sandbox` · `memory` · `context` · `app` · `document` · `webSearch` · `action` ·
`model` · `file` · `documentationSearch` · `suggestedActions`

On the CLI the same field is a JSON array:
`cargo-ai ai mcp-server create --capabilities '[{"slug":"webSearch","config":{}}]'`.

## Coding-agent agents (`harness`)

An agent with a `harness` is a **coding** agent: it clones a git repository into a
sandbox and works in it. `harness` takes `claudeCode`, `codex`, `openCode` or
`deepAgents`. (`harnessSlug` is the deprecated spelling; both normalize to the same
spec field, so renaming it is not a diff.)

**Omit `repository` to bind the project's own repo.** `plan`/`deploy` read the git
origin of the checkout they run in and fill `repository`, `defaultBranch` and
`rootDirectory`, taking `connector` from the project's GitHub `defineConnector`.
Declared fields always win, so a partial object is completed the same way — and the
resolved values are what the plan prints and what the content hash covers. Pass
`repository: null` for an unbound, empty sandbox scoped to the chat. `repository.runAs`
(a `defineUser` service user or `userRef`) gives the sandbox a temporary
`CARGO_API_TOKEN` for that user. The agent clones, pushes and comments as the **Cargo
GitHub app**, which must be installed on the repo — see
[`../../cargo-ai/SKILL.md`](../../cargo-ai/SKILL.md).

## Ref helpers

From `@cargo-ai/cdk`: `connectorRef`, `modelRef`, `folderRef`, `playRef`,
`segmentRef`, `relationshipRef`, `memberRef`, `userRef`, `roleRef`, `domainRef`,
`mailboxRef`, `workerRef`, `workflowRef`, `alertRef`. From the workflow SDK
(re-exported): `toolRef`, `agentRef`. Each takes a uuid string and returns a
kind-branded handle (`connectorActionRef(connector, actionSlug)` and
`nativeActionRef(slug)` reference actions for `uses`):

```ts
import { defineModel, connectorRef, folderRef } from "@cargo-ai/cdk";

export const leads = defineModel("leads", {
  connector: connectorRef("6f0c…"), // existing connector, by uuid
  extractSlug: "fetchRecords",
  folder: folderRef("a1b2…"),
});
```

## Notes on specific fields

- **`defineConnector` `config`** is a per-integration shape — a discriminated union
  for auth (e.g. HubSpot `method: "privateApp" | "oauth"`). `secret()` is accepted
  only on credential/encryption fields. Run `cargo-ai project types` to type it (see
  [`../guides/typed-config.md`](../guides/typed-config.md)).
- **`default: true`** (formerly `adopt: true`) on `defineConnector` links the
  integration's existing default connector (falling back to a slug match) instead of
  creating one — for OAuth/key connectors you can't declare.
- **`defineModel` `connector`** takes the **connector** handle (its dataset uuid is
  injected) or a `connectorRef`.
- **`schedule`** shapes: a model takes `{ type: "cron", cron: "0 * * * *" }` or
  `{ type: "dbt", jobId }`; a play also takes `{ type: "watch" }` (react to row
  changes), `{ type: "realtime" }` and `{ type: "dependency", play }`.
- **`definePlay` `changeKinds`**: `added` / `updated` / `removed` / `unchanged`
  (default `["added"]`); `runCreationRule`: `always` (default) / `once` /
  `noConcurrency`. Plays are created disabled: set `isEnabled: true` to enable on deploy.
- **`defineFile` `path`** and **`defineWorker`/`defineApp` `path`** point at local
  files/dirs, typically via `new URL("./x", import.meta.url).pathname`. File content
  is hashed at define time, so edits show as drift. Worker `path` is the bundle
  source dir (`manifest.json` + `package.json` + an entrypoint `src/index.ts`,
  `src/index.js`, `index.ts` or `index.js`), built server-side.
- **`defineFile` storage settings.** `index: "none"` stores the bytes without sending
  them to OpenAI — agents can read the file but not search or analyze it; use it for
  files a worker or play serves rather than an agent retrieves. `visibility: "public"`
  gives the file a stable **unauthenticated** link
  (`https://api.getcargo.io/files/public/<uuid>/<name>`). `mirrorToContext: false`
  keeps it out of the context repo (the default commits it under `.files/`). Changing
  `index` or `mirrorToContext` re-uploads the bytes in place, keeping the uuid;
  changing `visibility` is an in-place update. Each is sent only when declared, so a
  project that never sets them plans no change. Path model and links:
  [`../../cargo-content/references/objects.md`](../../cargo-content/references/objects.md).
- **`defineAgent` `files`** lists `defineFile` handles, `defineFolder` handles or
  `folderRef`s (or `{ uuid }` for a file the project doesn't define — what `pull`
  writes) the agent can list and read. `readOnly` defaults to `true`; `readOnly: false`
  on an entry also grants `capability_file_write` on the **folders** it lists — the
  agent saves text it produced (≤ 1,000,000 characters) under them, never elsewhere,
  always private, unindexed and unmirrored, and gets a 1-hour link back. On the wire it
  is a file resource with `isReadOnly: false`.

  ```ts
  defineAgent("researcher", {
    // …
    files: [
      { items: [playbook] },
      { items: [outputsFolder], readOnly: false, name: "Outputs", prompt: "Save each report here." },
    ],
  });
  ```
- **`defineUser` / `runAs`.** Only `kind: "service"` can be declared (anything else
  throws `only \`kind: "service"\` can be declared. Invite people from the Cargo UI.`).
  Names are set at creation only; `role` (a `defineRole` handle or `roleRef`) is
  reconciled every deploy. `defineWorker({ runAs })` and `defineAgent({ repository: {
  runAs } })` take a user handle or `userRef(uuid)`: Cargo then binds a temporary
  `CARGO_API_TOKEN` for that user. The **deploying** user's permissions must cover
  every permission the service user holds, or the deploy is refused
  (`runAsUserNotPermitted`; `runAsUserNotFound` for a non-service user). People are
  never declared — invite them; see
  [`../../cargo-workspace-management/SKILL.md`](../../cargo-workspace-management/SKILL.md).
- **`defineRole` `adopt: true`** binds an existing role and never falls back to
  creating one; `destroy` releases an adopted role rather than deleting it. The system
  roles can only be adopted, not edited.
- **`defineMember` never creates.** Members come from the system-of-record seat sync;
  `defineMember(email)` adopts the existing one so a `defineTerritory`'s `members` /
  `fallback` can name it by handle (portable across workspaces). `destroy` releases.
  Each mailbox belongs to at most one member.
- **`defineRelationship` merges.** It read-merges the dataset's live relationships, so
  unlike `cargo-ai storage relationship set` it does not wipe the others. Both models
  must be in the same dataset; identity is the state uuid (the slug is local).
- **`defineCustomIntegration`** — Cargo reads the worker's `GET /manifest` once the
  worker is promoted.
- **`defineApp` build and routing.** Only `package.json` is required at define time
  (`package-lock.json` is checked at upload). The app's own `build` script runs when
  `package.json` has one; otherwise the detected framework's default. An extension-less
  `/<page>` serves `<page>/index.html`, then `<page>.html`, then `404.html` (status
  404), then the root `index.html` as the SPA shell — so a multi-page static site works
  with no rewrites. **`domainRecords`** is the list of `{ type: "CNAME" | "TXT", name,
  value }` records the app's `domains` need (`_cargo-verify` ownership TXT, certificate
  and routing CNAMEs); pass it straight to `defineDomain({ dnsRecords })`. A domain
  serves only once its TXT resolves. Referencing `domainRecords` on an app with no
  `domains` fails `plan`; under `--draft` it is `null` and `defineDomain` leaves the zone
  alone. A hostname dropped from `domains` stays attached — detach it in the UI.
- **`model.config.<key>`** is a token for the model's **live** config, including the
  `_`-prefixed keys its extractor writes on create (a `_webhookId`, a `_searchId`, a
  tracking script). It resolves in the same deploy, decodes to the
  stored type, and works in another resource's spec and in worker, app and harness
  `env` (where a number or list arrives as JSON text). Keys are typed when the
  extractor declares a schema; any other key is still accepted.
- **`defineScript` vs `bundleScript`.** `defineScript((args, runtime) => …)`
  (re-exported from the workflow SDK) declares a workflow `script` node's body as the
  single top-level export of its own file: it can import, be unit-tested, and is called
  in a workflow body like a node (`deriveEvidence({ records, accountId })` → typed
  `Ref`). esbuild bundles it; the sandbox modules (axios, cheerio, crypto-js, date-fns,
  jsonschema, lodash, url, uuid, zod) stay external. `bundleScript(entry, { target? })`
  is different: it compiles a file whose `export default` is a script module into the
  `script` string of a **script-backed model** (`defineModel({ kind: "native",
  extractSlug: "defineScript", config: { columns, script, env } })`), which runs once per
  sync, returns rows with an `id`, and recomputes the whole table.
- **`defineAlert` `scope` + `threshold`** are a **matched pair** — TS narrows the
  threshold menu by `scope.kind`: `spans`/`runs`/`records` take the telemetry metrics
  (`errorRate`, `duration`+`aggregation`, `credits`+`aggregation`, `count`), `model`
  takes `recordsCount`/`recordsShare`/`freshness`/`syncDuration`, and
  `orchestrationQuery`/`storageQuery` take `{ operator, value }` (the query computes
  the value, so no metric). The scope wires the watched resource **by handle**
  (`workflow:` a `definePlay`/`defineTool` handle or `workflowRef`, plus `connector`/
  `tool`/`agent`/`model`), so the reconciler deploys the producer first and injects
  its uuid.
- **`defineAlert` `actions`** fire as runs on breach. Each is a `{ ref, config }`
  wrapper (`config` required — an alert fires unattended, so a missing input is a type
  error, not a silent `{}`). Prefer the typed helpers `alertConnectorAction({ ref:
  slack.actions.postMessage, config })` / `alertToolAction({ ref: enrich, config })` —
  `config` is checked against the action/tool input schema (connector schemas need
  `cargo-ai project types` to have run) — or a bare `{ ref: agent, config, release?,
  waitUntilFinished? }`. Every `config` leaf accepts a `{{ … }}` template
  (`{{event.value}}`, `{{alert.name}}`, `{{alert.url}}`, …) interpolated against the
  firing context. Like a play, an alert has **no author-set wire slug** — its identity
  on redeploy is the state uuid, so committing `cargo.state.json` is what keeps it
  addressable. Scope/threshold matrix, metric units, and firing semantics:
  [`../../cargo-observability/SKILL.md`](../../cargo-observability/SKILL.md).
