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
| `defineConnector(slug, spec)` | Data source or LLM provider | `integration`, `config` (typed per integration), `adopt?`, `rateLimit?`, `cacheTtlMilliseconds?` | — | `uuid`, `datasetUuid` (data connectors) |
| `defineModel(slug, spec)` | Table sourced from a connector's dataset | `dataset`, `extractSlug`, `config`, `schedule?`, `folder?` | `dataset` (connector/dataset), `folder` | `uuid` |
| `defineTool(slug, spec)` | Tool backed by a workflow | `workflow`, `description?`, `emojiSlug?`, `triggers?`, `folder?` | `folder` | `uuid` |
| `definePlay(slug, spec)` | Per-row automation over a model | `model`, `workflow`, `changeKinds`, `runCreationRule`, `schedule`, `folder?` | `model`, `folder` | `uuid` |
| `defineAgent(slug, spec)` | AI agent | `connector`, `languageModel`, `systemPrompt`, `models?`, `tools?`, `subAgents?`, `connectorActions?`, `capabilities?`, `maxSteps?`, `triggers?`, `evaluator?`, `color?`, `folder?` | `connector`, `models`, `tools`, `subAgents`, `folder` | `uuid` |
| `defineMcpServer(slug, spec)` | MCP endpoint bundling resources | `description?`, `tools?`, `agents?`, `models?`, `folder?` | `tools`, `agents`, `models`, `folder` | `uuid` |
| `defineFolder(slug, spec)` | Per-kind folder | `kind`, `name`, `parent?` | `parent` | `uuid` |
| `defineFile(slug, spec)` | Content file from a local path | `path`, `name`, `folder?` | `folder` | `uuid` |
| `defineContext(spec)` | Workspace context repo (singleton) | `dir?`, `files?` | — | `uuid` |
| `defineSegment(slug, spec)` | Saved view over a model | `model` (immutable), `filter` (required) | `model` | `uuid` |
| `defineCapacity(slug, spec)` | Revenue-org capacity | `model`, `color?`, `description?`, member capacity fields | `model`, members | `uuid` |
| `defineTerritory(slug, spec)` | Revenue-org territory | `model`, `members`, `color?`, `description?`, `fallbackMember?` | `model`, `members` | `uuid` |
| `defineWorker(slug, spec)` | Hosted worker (built bundle) | `path`, `description?`, `folder?` | `folder` | `uuid`, `url` |
| `defineApp(slug, spec)` | Hosted Vite SPA | `path`, `description?`, `folder?` | `folder` | `uuid`, `url` |

`defineWorkflow(slug, { input, output, uses? }, build)` is re-exported from
`@cargo-ai/cdk` for `defineTool`/`definePlay` bodies — see
[`../guides/authoring-resources.md`](../guides/authoring-resources.md).

## Ref helpers

From `@cargo-ai/cdk`: `connectorRef`, `datasetRef`, `modelRef`, `folderRef`,
`playRef`, `memberRef`. From the workflow SDK (re-exported): `toolRef`, `agentRef`.
Each takes a uuid string and returns a kind-branded handle:

```ts
import { defineModel, connectorRef, folderRef } from "@cargo-ai/cdk";

export const leads = defineModel("leads", {
  dataset: connectorRef("6f0c…"),   // existing connector, by uuid
  extractSlug: "fetchRecords",
  folder: folderRef("a1b2…"),
});
```

## Notes on specific fields

- **`defineConnector` `config`** is a per-integration shape — a discriminated union
  for auth (e.g. HubSpot `method: "privateApp" | "oauth"`). `secret()` is accepted
  only on credential/encryption fields. Run `cargo-ai cdk types` to type it (see
  [`../guides/typed-config.md`](../guides/typed-config.md)).
- **`adopt: true`** on `defineConnector` links an existing authenticated connector
  by slug instead of creating one — for OAuth/key connectors you can't declare.
- **`defineModel` `dataset`** takes the **connector** handle (its dataset uuid is
  injected) or a `datasetRef`/`connectorRef`.
- **`schedule`** shapes: `{ type: "cron", cron: "0 * * * *" }` or
  `{ type: "watch" }` (plays react to row changes).
- **`definePlay` `changeKinds`**: `["added", "updated", …]`; `runCreationRule`:
  e.g. `"always"`.
- **`defineFile` `path`** and **`defineWorker`/`defineApp` `path`** point at local
  files/dirs, typically via `new URL("./x", import.meta.url).pathname`. File content
  is hashed at define time, so edits show as drift. Worker `path` must be a **built**
  bundle dir (`index.js` + `manifest.json` + `package.json` + `package-lock.json`).
