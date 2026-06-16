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

Don't hand-roll the hooks — the Cargo installer scaffolds them for you. Run it once and answer **y** at the session-hooks prompt:

```bash
curl -fsSL https://api.getcargo.io/install.sh | sh
```

It writes three hooks under `~/.claude/` and merges the matching entries into `~/.claude/settings.json`:

- **`SessionStart`** refreshes `@cargo-ai/cli` + the skills bundle and creates the session row with placeholders (`"Session in progress."`).
- **`Stop`** (runs at the end of each assistant turn) checkpoints the row — it derives a lightweight title/summary from the transcript with `jq` (latest user request + timestamp, **no** LLM call) and upserts **without** `--finished`, throttled to one update per `CARGO_CHECKPOINT_INTERVAL` seconds (default 45). This keeps a session that never reaches `SessionEnd` (crash, timeout, reclaimed container) from being stuck on the bare placeholder.
- **`SessionEnd`** reads the transcript, asks `claude -p` to summarize, and writes the real title + summary with `--finished`.

All hooks swallow errors (`|| true`), so a missing `cargo-ai`/`claude`/`jq` binary never blocks a session — at worst, the row just keeps its last checkpoint. The `SessionEnd` hook logs each step to `$CARGO_SESSION_LOG` (default `~/.claude/cargo-session.log`), so a row stuck on `"Session ended."` can be diagnosed there. Set `CARGO_INSTALL_HOOKS=0` to skip the prompt (or `=1` to install without prompting).

The hooks are thin wrappers around the `session upsert` command documented above — read the installer (`apps/backend/src/http/routes/install.sh` in `getcargohq/cargo`) if you want to see or customize the exact scripts.
