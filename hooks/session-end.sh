#!/usr/bin/env bash
# Cargo session-end hook: summarize the transcript and finalize the session row.
#
# SINGLE SOURCE OF TRUTH for both delivery channels — runs as the PLUGIN copy
# (default) or as the STANDALONE copy the installer's fallback channel downloads
# to ~/.claude/hooks/. Behavior is identical in both; only deference differs:
# the plugin copy exits when a standalone copy exists, so the row is never
# double-finalized. Mode auto-detects from the script's location and can be
# forced with a first argument: plugin | standalone.
#
# Failures never block a session and fall back to the "Session ended."
# placeholder, but every step logs to $CARGO_SESSION_LOG (default
# ~/.claude/cargo-session.log) so a stuck placeholder row can be diagnosed
# instead of failing silently.
set -u

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
if [ "$MODE" = "plugin" ] && standalone_owns "session-end.sh"; then
  exit 0
fi

LOG="${CARGO_SESSION_LOG:-$HOME/.claude/cargo-session.log}"
mkdir -p "$(dirname "$LOG")" 2>/dev/null || true
log() { printf '[%s] session-end(%s): %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$MODE" "$*" >>"$LOG" 2>/dev/null || true; }

INPUT="$(cat 2>/dev/null || true)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"
TRANSCRIPT_PATH="$(printf '%s' "$INPUT" | jq -r '.transcript_path // ""' 2>/dev/null || echo "")"

# Resolve the claude binary. Hooks frequently run with a minimal PATH, and
# `claude` is a Node script whose shebang also needs `node` on PATH — so a bare
# `command -v claude` misses it whenever the binary lives in a Node/version-
# manager bin dir (nvm, volta, asdf, /opt/node*, npm global prefix). Widen PATH
# to those dirs first, then resolve.
add_path() {
  [ -n "${1:-}" ] && [ -d "$1" ] || return 0
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}

# Node's own bin dir is where npm-global CLIs (including claude) usually land.
if command -v node >/dev/null 2>&1; then
  add_path "$(dirname "$(command -v node)")"
fi
if command -v npm >/dev/null 2>&1; then
  add_path "$(npm prefix -g 2>/dev/null)/bin"
fi
add_path "$HOME/.claude/local"
add_path "$HOME/.local/bin"
add_path "${VOLTA_HOME:-$HOME/.volta}/bin"
add_path "$HOME/.asdf/shims"
add_path "/usr/local/bin"
add_path "/opt/homebrew/bin"
for d in /opt/node*/bin "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin; do
  add_path "$d"
done
export PATH

CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"

# 1) Synchronous, fast finalize so the session row is always closed with
#    --finished even if the async refinement below never completes. The hook MUST
#    return quickly — a blocking `claude -p` here is aborted during session
#    teardown, which Claude Code reports as "Hook cancelled".
if command -v cargo-ai >/dev/null 2>&1; then
  if cargo-ai workspaceManagement session upsert \
    --session-id "$SESSION_ID" \
    --title "Claude Code session ${SESSION_ID}" \
    --summary "Session ended." \
    --finished >>"$LOG" 2>&1; then
    log "finalized $SESSION_ID with placeholder summary"
  else
    log "session upsert failed for $SESSION_ID"
  fi
else
  log "cargo-ai not found; cannot finalize $SESSION_ID"
fi

# 2) Async refinement: summarize the transcript with claude and re-upsert a
#    better title/summary. Fully detached (setsid/nohup + closed fds) so it
#    survives the parent session exiting and never blocks — or is cancelled
#    with — the hook.
refine() {
  command -v cargo-ai >/dev/null 2>&1 || return 0
  if [ -z "$CLAUDE_BIN" ]; then
    log "claude binary not found; keeping placeholder summary for $SESSION_ID"
    return 0
  fi
  if [ -z "$TRANSCRIPT_PATH" ] || [ ! -f "$TRANSCRIPT_PATH" ]; then
    log "transcript not available (path='$TRANSCRIPT_PATH'); keeping placeholder for $SESSION_ID"
    return 0
  fi

  TAIL="$(tail -c 60000 "$TRANSCRIPT_PATH" 2>/dev/null || true)"
  if [ -z "$TAIL" ]; then
    log "transcript at '$TRANSCRIPT_PATH' was empty; keeping placeholder for $SESSION_ID"
    return 0
  fi

  PROMPT='Read the Claude Code transcript on stdin and reply with a single JSON object: {"title":"<5-8 word title>","summary":"<1-2 sentence summary>"}. JSON only, no markdown fences.'
  # Guard against a hung summarizer when `timeout` is available.
  if command -v timeout >/dev/null 2>&1; then
    RESPONSE="$(printf '%s' "$TAIL" | timeout 120 "$CLAUDE_BIN" -p "$PROMPT" 2>>"$LOG" || true)"
  else
    RESPONSE="$(printf '%s' "$TAIL" | "$CLAUDE_BIN" -p "$PROMPT" 2>>"$LOG" || true)"
  fi
  if [ -z "$RESPONSE" ]; then
    log "claude -p produced no output for $SESSION_ID (see stderr above); keeping placeholder"
    return 0
  fi

  # Strip markdown code fences, then extract the JSON object.
  CLEAN="$(printf '%s' "$RESPONSE" | sed 's/```json//g; s/```//g' | sed -n '/{/,/}/p')"
  PARSED_TITLE="$(printf '%s' "$CLEAN" | jq -r '.title // empty' 2>/dev/null || true)"
  PARSED_SUMMARY="$(printf '%s' "$CLEAN" | jq -r '.summary // empty' 2>/dev/null || true)"
  if [ -z "$PARSED_TITLE" ] || [ -z "$PARSED_SUMMARY" ]; then
    log "could not parse title/summary from claude output for $SESSION_ID: $RESPONSE"
    return 0
  fi

  if cargo-ai workspaceManagement session upsert \
    --session-id "$SESSION_ID" \
    --title "$PARSED_TITLE" \
    --summary "$PARSED_SUMMARY" \
    --finished >>"$LOG" 2>&1; then
    log "refined $SESSION_ID with title: $PARSED_TITLE"
  else
    log "refine upsert failed for $SESSION_ID"
  fi
}

export -f refine log
export SESSION_ID TRANSCRIPT_PATH CLAUDE_BIN LOG MODE

# Detach: prefer setsid, fall back to nohup. Redirect all fds so nothing keeps
# the hook's stdio open and holds the session teardown.
if command -v setsid >/dev/null 2>&1; then
  setsid bash -c refine </dev/null >>"$LOG" 2>&1 &
else
  nohup bash -c refine </dev/null >>"$LOG" 2>&1 &
fi
disown 2>/dev/null || true

exit 0
