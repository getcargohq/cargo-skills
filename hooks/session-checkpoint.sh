#!/usr/bin/env bash
# Cargo session checkpoint hook (plugin-bundled, Stop event): keep the session
# row fresh mid-session.
#
# Defers to the installer-scaffolded copy at ~/.claude/hooks/session-checkpoint.sh
# when present, so the row is never double-checkpointed. Otherwise: derives a
# lightweight title/summary from the transcript WITHOUT an LLM call (latest user
# prompt + timestamp) and upserts the row WITHOUT --finished, so a session that
# never reaches SessionEnd (crash, timeout, reclaimed container) still shows
# recent context instead of being stuck on "Session in progress." Throttled to
# at most one update per CARGO_CHECKPOINT_INTERVAL seconds (default 45) so it
# never adds a network call to every turn.
set -u

# Defer to the installer-scaffolded lifecycle when present.
[ -x "$HOME/.claude/hooks/session-checkpoint.sh" ] && exit 0

LOG="${CARGO_SESSION_LOG:-$HOME/.claude/cargo-session.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { printf '[%s] checkpoint(plugin): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >>"$LOG" 2>/dev/null || true; }

INPUT="$(cat 2>/dev/null || true)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"
TRANSCRIPT_PATH="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")"

command -v cargo-ai >/dev/null 2>&1 || exit 0

# Throttle: skip if this session was checkpointed within the last INTERVAL secs.
INTERVAL="${CARGO_CHECKPOINT_INTERVAL:-45}"
STAMP="${TMPDIR:-/tmp}/cargo-checkpoint-${SESSION_ID}.ts"
NOW="$(date +%s)"
if [ -f "$STAMP" ]; then
  LAST="$(cat "$STAMP" 2>/dev/null || echo 0)"
  case "$LAST" in (*[!0-9]*|"") LAST=0 ;; esac
  if [ $((NOW - LAST)) -lt "$INTERVAL" ]; then
    exit 0
  fi
fi

TITLE="Claude Code session ${SESSION_ID}"
SUMMARY="Session in progress."

if [ -n "$TRANSCRIPT_PATH" ] && [ -f "$TRANSCRIPT_PATH" ]; then
  # tail by lines (not bytes) so we never feed jq a half-written JSON line.
  TAIL="$(tail -n 600 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
  if [ -n "$TAIL" ]; then
    # Latest real user prompt (string or text blocks; tool_result entries skipped).
    LAST_USER="$(printf '%s\n' "$TAIL" | jq -rR '
      fromjson? | select(.type=="user") | .message.content
      | if type=="string" then .
        elif type=="array" then (map(select(.type=="text").text) | join(" "))
        else empty end
      | select(. != "")' 2>/dev/null | tail -n 1)"
    if [ -n "$LAST_USER" ]; then
      SNIP="$(printf '%s' "$LAST_USER" | tr '\n\t' '  ' | cut -c1-80)"
      TITLE="$SNIP"
      SUMMARY="In progress. Latest request: \"${SNIP}\". Updated $(date -u +%Y-%m-%dT%H:%M:%SZ)."
    fi
  fi
fi

if cargo-ai workspaceManagement session upsert \
  --session-id "$SESSION_ID" \
  --title "$TITLE" \
  --summary "$SUMMARY" >>"$LOG" 2>&1; then
  printf '%s' "$NOW" > "$STAMP" 2>/dev/null || true
  log "checkpointed $SESSION_ID"
else
  log "checkpoint upsert failed for $SESSION_ID"
fi

exit 0
