# Session tracking examples

`cargo-ai workspaceManagement session upsert` creates or updates a Claude Code session row in `workspace_management.sessions`. One row per `(workspaceUuid, sessionId)`. Use it to keep a queryable log of every Claude Code session — what was worked on, when it started, and a short AI-generated summary of what happened.

## CLI surface

```bash
cargo-ai workspaceManagement session upsert \
  --session-id <claude-session-id> \
  --title "<short title>" \
  --summary "<one-or-two-sentence summary>" \
  [--finished | --finished-at <iso-timestamp>]
```

- `--session-id`, `--title`, `--summary` are required on every call (`title` and `summary` are `NOT NULL` in the schema).
- `--finished` stamps `finished_at = now`. Use `--finished-at <iso>` to set an explicit timestamp.
- Calling `upsert` twice with the same `--session-id` updates the same row — `title`, `summary`, and `finished_at` are overwritten.

The command returns the upserted session as JSON.

## Schema

```text
workspace_management.sessions
├── uuid              (pk)
├── session_id        (string, UNIQUE with workspace_uuid)
├── user_uuid
├── workspace_uuid
├── title             (NOT NULL)
├── summary           (NOT NULL)
├── created_at        (default now)
└── finished_at       (nullable, stamped by --finished)
```

## Manual upsert

```bash
# Record a session start with placeholder text
cargo-ai workspaceManagement session upsert \
  --session-id abc-123 \
  --title "Claude Code session abc-123" \
  --summary "Session in progress."

# Later, overwrite with the real title + summary and mark finished
cargo-ai workspaceManagement session upsert \
  --session-id abc-123 \
  --title "Wire up workspace_management.sessions" \
  --summary "Added the sessions resource end-to-end across migration, repository, service, HTTP, and CLI; updated cargo-skills docs to suggest the hook recipe." \
  --finished
```

## Automate with Claude Code hooks (recommended)

Don't hand-roll the hooks — install the **Cargo plugin** and it ships them:

```
/plugin marketplace add getcargohq/cargo-skills
/plugin install cargo@cargo
```

The plugin's bundled hooks do the whole job, with nothing written into `~/.claude` on your behalf:

- **`SessionStart`** converges `@cargo-ai/cli` to the bundle's pinned version, refreshes the plugin itself for the next session, and creates the session row with placeholders (`"Session in progress."`). It does **not** run `skills add` — the plugin owns the skills.
- **`Stop`** (runs at the end of each assistant turn) checkpoints the row — it derives a lightweight title/summary from the transcript with `jq` (latest user request + timestamp, **no** LLM call) and upserts **without** `--finished`, throttled to one update per `CARGO_CHECKPOINT_INTERVAL` seconds (default 45). This keeps a session that never reaches `SessionEnd` (crash, timeout, reclaimed container) from being stuck on the bare placeholder.
- **`SessionEnd`** reads the transcript, asks `claude -p` to summarize, and writes the real title + summary with `--finished`.

All hooks swallow errors (`|| true`), so a missing `cargo-ai`/`claude`/`jq` binary never blocks a session — at worst, the row just keeps its last checkpoint. The `SessionEnd` hook logs each step to `$CARGO_SESSION_LOG` (default `~/.claude/cargo-session.log`), so a row stuck on `"Session ended."` can be diagnosed there.

The hooks are thin wrappers around the `session upsert` command documented above; the scripts live in [`hooks/`](../../../hooks/) in this repo if you want to read or customize them.

> **The `curl … install.sh | sh` installer that used to scaffold these is retired.** It installs nothing now — it prints a notice and exits non-zero. Machines it already set up keep working: the plugin's hooks defer to the standalone copies under `~/.claude/hooks/` when those exist, so a session is never logged twice. On an agent with no lifecycle hooks at all, do jobs 1 and 3 by hand as the router describes.
