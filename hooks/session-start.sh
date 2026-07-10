#!/usr/bin/env bash
# Cargo session-start hook (plugin-bundled): keep the CLI at the pinned version
# and register the session row.
#
# The Cargo installer (`curl -fsSL https://api.getcargo.io/install.sh | sh`)
# scaffolds its own copy of this lifecycle at ~/.claude/hooks/session-start.sh.
# When that copy exists it owns the lifecycle — this plugin copy defers so the
# session row is never double-registered. Unlike the installer copy, this one
# does NOT run `skills add`: plugin users get skills from the plugin itself
# (update via `/plugin update cargo@cargo`), and a parallel skills-add install
# would duplicate every skill.
set -u

# Defer to the installer-scaffolded lifecycle when present.
[ -x "$HOME/.claude/hooks/session-start.sh" ] && exit 0

INPUT="$(cat 2>/dev/null || true)"
SESSION_ID="$(printf '%s' "$INPUT" | jq -r '.session_id // "unknown"' 2>/dev/null || echo "unknown")"

# Resolve the plugin root: the harness exports CLAUDE_PLUGIN_ROOT; fall back to
# this script's location (hooks/ lives directly under the plugin root).
PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$PLUGIN_ROOT" ] || PLUGIN_ROOT="$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)"

# Install the CLI version the bundle pins (cargo/cli-version ships inside the
# plugin). Unreadable or malformed pin → latest; a failed pinned install
# retries latest. Never a gate.
PIN="$(cat "$PLUGIN_ROOT/cargo/cli-version" 2>/dev/null | tr -d '[:space:]' || true)"
printf '%s' "$PIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || PIN=""
npm install -g "@cargo-ai/cli@${PIN:-latest}" >/dev/null 2>&1 \
  || npm install -g @cargo-ai/cli@latest >/dev/null 2>&1 || true

# Record a placeholder session row (overwritten by session-end).
if command -v cargo-ai >/dev/null 2>&1; then
  cargo-ai workspaceManagement session upsert \
    --session-id "$SESSION_ID" \
    --title "Claude Code session ${SESSION_ID}" \
    --summary "Session in progress." >/dev/null 2>&1 || true
fi

# Keep the plugin itself current — the plugin channel's equivalent of the
# installer's `skills add` refresh. Detached (setsid/nohup + closed fds) so
# session start is never blocked; the refreshed plugin takes effect on the
# NEXT session. Resolve `claude` across the usual Node/version-manager bin
# dirs first (hooks often run with a minimal PATH).
add_path() {
  [ -n "${1:-}" ] && [ -d "$1" ] || return 0
  case ":$PATH:" in
    *":$1:"*) ;;
    *) PATH="$1:$PATH" ;;
  esac
}
if command -v node >/dev/null 2>&1; then
  add_path "$(dirname "$(command -v node)")"
fi
if command -v npm >/dev/null 2>&1; then
  add_path "$(npm prefix -g 2>/dev/null)/bin"
fi
add_path "$HOME/.claude/local"
add_path "$HOME/.local/bin"
add_path "/usr/local/bin"
add_path "/opt/homebrew/bin"
export PATH

CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
update_plugin() {
  [ -n "$CLAUDE_BIN" ] || return 0
  "$CLAUDE_BIN" plugin marketplace update cargo >/dev/null 2>&1 || true
  "$CLAUDE_BIN" plugin update cargo@cargo >/dev/null 2>&1 || true
}
export -f update_plugin
export CLAUDE_BIN
if command -v setsid >/dev/null 2>&1; then
  setsid bash -c update_plugin </dev/null >/dev/null 2>&1 &
else
  nohup bash -c update_plugin </dev/null >/dev/null 2>&1 &
fi
disown 2>/dev/null || true

exit 0
