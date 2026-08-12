#!/usr/bin/env bash
# Cargo session checkpoint hook (Stop event): keep the session row fresh
# mid-session.
#
# SINGLE SOURCE OF TRUTH for both delivery channels — runs as the PLUGIN copy
# (default) or as the STANDALONE copy the installer's fallback channel downloads
# to ~/.claude/hooks/. Behavior is identical in both; only deference differs:
# the plugin copy exits when a standalone copy exists, so the row is never
# double-checkpointed. Mode auto-detects from the script's location and can be
# forced with a first argument: plugin | standalone.
#
# Derives a lightweight title/summary from the transcript WITHOUT an LLM call
# (latest user prompt + timestamp) and upserts the row WITHOUT --finished, so a
# session that never reaches SessionEnd (crash, timeout, reclaimed container)
# still shows recent context instead of being stuck on "Session in progress."
# Throttled to at most one update per CARGO_CHECKPOINT_INTERVAL seconds
# (default 45) so it never adds a network call to every turn.
set -u

# Exit inside the SessionEnd summarizer child — it would checkpoint a phantom
# session row on every turn of a process that exists only to write a title.
# See the recursion note in hooks/session-end.sh.
if [ "${CARGO_SESSION_SUMMARIZER:-}" = "1" ]; then
  exit 0
fi

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
MODE="${1:-}"
if [ -z "$MODE" ]; then
  if [ "$SCRIPT_DIR" = "$HOME/.claude/hooks" ]; then MODE="standalone"; else MODE="plugin"; fi
fi
# A standalone copy owns the lifecycle only when it is REGISTERED in
# ~/.claude/settings.json — a leftover file nothing invokes must not suppress
# the plugin copy. When registration cannot be verified (no jq, or no
# settings.json), default to NOT owned: the plugin copy runs. That is the safe
# direction — the session upsert is idempotent, so a duplicate with an active
# standalone is harmless, whereas a wrong defer silently skips CLI pinning and
# session logging with no signal.
standalone_owns() {
  s="$HOME/.claude/hooks/$1"
  [ -x "$s" ] || return 1
  command -v jq >/dev/null 2>&1 || return 1
  [ -f "$HOME/.claude/settings.json" ] || return 1
  jq -e --arg cmd "$s" \
    '[.hooks[]?[]? | .hooks[]? | select(.command | contains($cmd))] | length > 0' \
    "$HOME/.claude/settings.json" >/dev/null 2>&1
}
if [ "$MODE" = "plugin" ] && standalone_owns "session-checkpoint.sh"; then
  exit 0
fi

LOG="${CARGO_SESSION_LOG:-$HOME/.claude/cargo-session.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { printf '[%s] checkpoint(%s): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "$*" >>"$LOG" 2>/dev/null || true; }

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
      # Prompt-derived text is DATA end-to-end: shell assignments and quoted
      # expansions never evaluate $(…)/backticks inside a variable's VALUE,
      # and the upsert below passes --title/--summary as single quoted argv
      # words — so there is no execution path. Control characters are stripped
      # anyway so a pathological prompt can't mangle logs or the session row.
      SNIP="$(printf '%s' "$LAST_USER" | tr '\n\t' '  ' | tr -d '\000-\037\177' | cut -c1-80)"
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
