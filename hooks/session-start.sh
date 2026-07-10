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

exit 0
