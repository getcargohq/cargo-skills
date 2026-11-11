#!/usr/bin/env bash
# Cargo session-start hook (Claude Code plugin): keep the Cargo CLI at the
# version this bundle pins. It reads nothing from the session and sends nothing
# anywhere.
#
# It only installs the CLI. The plugin itself updates through Claude Code
# (`/plugin update cargo@cargo-skills`, or marketplace auto-update), and the
# standalone `~/.claude/hooks/` copy the retired installer wrote is cleaned up
# by the CLI, so neither is handled here.
set -u

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$PLUGIN_ROOT" ] || PLUGIN_ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

# Install the CLI version the bundle pins. Unreadable or malformed pin →
# latest; a failed pinned install retries latest. Never a gate.
PIN="$(cat "$PLUGIN_ROOT/cargo/cli-version" 2>/dev/null | tr -d '[:space:]' || true)"
printf '%s' "$PIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || PIN=""
npm install -g "@cargo-ai/cli@${PIN:-latest}" >/dev/null 2>&1 \
  || npm install -g @cargo-ai/cli@latest >/dev/null 2>&1 || true

exit 0
