# UUID flow between skills

Most `cargo-orchestration` operations require UUIDs from other skills. This table maps which skill produces each UUID and which commands consume it.

| UUID            | Produced by                                | Consumed by                                                             |
| --------------- | ------------------------------------------ | ----------------------------------------------------------------------- |
| `workflowUuid`  | `orchestration play list` / `tool list`    | `run create`, `batch create`, `run get-metrics`, `run download`         |
| `modelUuid`     | `storage model list`                       | `segment fetch`, `segment download`, `model get-ddl`. Note: `storage query execute` references models by slug, not UUID |
| `segmentUuid`   | `segmentation segment list`                | `batch create --data '{"kind":"segment",...}'`                          |
| `agentUuid`     | `ai agent list`                            | `ai chat create`, node graph (`kind: "agent"`)                          |
| `connectorUuid` | `connection connector list`                | Node graph (`kind: "connector"`), `billing usage --connector-uuid`      |
| `actionSlug`    | `connection integration get <slug>` (third-party) or `connection native-integration get` (built-in) | Node graph (`kind: "connector"` or `kind: "native"`) |
| `releaseUuid`   | `orchestration batch get` → `.releaseUuid` | `orchestration release get`, `batch download`                           |
| `batchUuid`     | `orchestration batch create`               | `batch get`, `batch download`, `run get-metrics --batch-uuid`           |
| `folderUuid`    | `workspaceManagement folder list`          | `play list --folder-uuid`, `tool list --folder-uuid`                    |
| `roleSlug`      | `workspaceManagement role list`            | `workspaceManagement user create --role-slug`                           |

## Standard discovery sequence

Before running a workflow:

```bash
# 1. Confirm identity
cargo-ai whoami

# 2. Find the tool or play to run
cargo-ai orchestration tool list
cargo-ai orchestration play list

# 3. Find the model (and dataset slug) for SoR queries
cargo-ai storage model list
cargo-ai storage dataset list
cargo-ai storage model get-ddl <model-uuid>   # optional — for column types and SQL dialect

# 4. Find connectors needed by the workflow nodes
cargo-ai connection connector list

# 5. Find agents used in workflow nodes
cargo-ai ai agent list

# 6. Find the segment to process (for plays / batch with segment data)
cargo-ai segmentation segment list
```

## Retrieve in the UI

Each resource has a dedicated page in the Cargo app. Use these URL patterns to cross-reference a UUID returned by the CLI with the UI, or to extract a UUID from a URL the user pastes.

| Resource | URL pattern                                                         |
| -------- | ------------------------------------------------------------------- |
| Play     | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/plays/<PLAY_UUID>`     |
| Tool     | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/tools/<TOOL_UUID>`     |
| Agent    | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/agents/<AGENT_UUID>`   |
| Model    | `app.getcargo.io/workspaces/<WORKSPACE_UUID>/models/<MODEL_UUID>`   |

The workspace UUID is returned by `cargo-ai whoami` under `workspace.uuid`.
