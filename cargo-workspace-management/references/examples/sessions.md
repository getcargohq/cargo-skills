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

Two hooks let Claude Code track every session automatically: SessionStart creates the row with placeholders, SessionEnd reads the transcript, asks `claude -p` to summarize, and writes the real title + summary along with `--finished`.

`.claude/hooks/session-start.sh`:

```bash
#!/bin/bash
set -u

INPUT="$(cat)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"

cargo-ai workspaceManagement session upsert \
  --session-id "$SESSION_ID" \
  --title "Claude Code session ${SESSION_ID}" \
  --summary "Session in progress." >/dev/null 2>&1 || true

exit 0
```

`.claude/hooks/session-end.sh`:

```bash
#!/bin/bash
set -u

INPUT="$(cat)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"
TRANSCRIPT_PATH="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")"

TITLE="Claude Code session ${SESSION_ID}"
SUMMARY="Session ended."

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ] && command -v claude >/dev/null 2>&1; then
  TAIL="$(tail -c 60000 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
  if [ -n "$TAIL" ]; then
    PROMPT='Read the Claude Code transcript on stdin and reply with a single JSON object: {"title":"<5-8 word title>","summary":"<1-2 sentence summary>"}. JSON only.'
    RESPONSE="$(printf '%s' "$TAIL" | claude -p "$PROMPT" 2>/dev/null || true)"
    CLEAN="$(printf '%s' "$RESPONSE" | sed -n '/{/,/}/p')"
    PARSED_TITLE="$(printf '%s' "$CLEAN" | jq -r '.title // empty' 2>/dev/null || true)"
    PARSED_SUMMARY="$(printf '%s' "$CLEAN" | jq -r '.summary // empty' 2>/dev/null || true)"
    [ -n "$PARSED_TITLE" ] && TITLE="$PARSED_TITLE"
    [ -n "$PARSED_SUMMARY" ] && SUMMARY="$PARSED_SUMMARY"
  fi
fi

cargo-ai workspaceManagement session upsert \
  --session-id "$SESSION_ID" \
  --title "$TITLE" \
  --summary "$SUMMARY" \
  --finished >/dev/null 2>&1 || true

exit 0
```

Merge into `.claude/settings.json`:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-start.sh" }
        ]
      }
    ],
    "SessionEnd": [
      {
        "hooks": [
          { "type": "command", "command": "$CLAUDE_PROJECT_DIR/.claude/hooks/session-end.sh" }
        ]
      }
    ]
  }
}
```

`chmod +x .claude/hooks/session-{start,end}.sh` to finish. Both hooks swallow errors (`|| true`) so a missing `cargo-ai` or `claude` binary never blocks a session — at worst, the row just doesn't get written.
