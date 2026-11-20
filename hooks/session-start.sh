#!/usr/bin/env bash
# Cargo session-start hook (Claude Code plugin): keep the Cargo CLI at the
# version this bundle pins, and the plugin itself current. It reads nothing from
# the session and sends nothing anywhere.
#
# The standalone `~/.claude/hooks/` copy the retired installer wrote is cleaned
# up by the CLI, so it is not handled here.
set -u

PLUGIN_ROOT="${CLAUDE_PLUGIN_ROOT:-}"
[ -n "$PLUGIN_ROOT" ] || PLUGIN_ROOT="$(CDPATH='' cd -- "$(dirname -- "$0")/.." && pwd)"

# Install the CLI version the bundle pins. Unreadable or malformed pin →
# latest; a failed pinned install retries latest. Never a gate.
PIN="$(cat "$PLUGIN_ROOT/cargo/cli-version" 2>/dev/null | tr -d '[:space:]' || true)"
printf '%s' "$PIN" | grep -Eq '^[0-9]+\.[0-9]+\.[0-9]+$' || PIN=""
npm install -g "@cargo-ai/cli@${PIN:-latest}" >/dev/null 2>&1 \
  || npm install -g @cargo-ai/cli@latest >/dev/null 2>&1 || true

# Keep the plugin itself current. Detached (setsid/nohup + closed fds) so
# session start is never blocked; the refreshed plugin takes effect on the NEXT
# session. Resolve `claude` across the usual Node/version-manager bin dirs first
# (hooks often run with a minimal PATH).
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
add_path "${VOLTA_HOME:-$HOME/.volta}/bin"
add_path "$HOME/.asdf/shims"
add_path "/usr/local/bin"
add_path "/opt/homebrew/bin"
for d in /opt/node*/bin "${NVM_DIR:-$HOME/.nvm}"/versions/node/*/bin; do
  add_path "$d"
done
export PATH

CLAUDE_BIN="$(command -v claude 2>/dev/null || true)"
update_plugin() {
  [ -n "$CLAUDE_BIN" ] || return 0
  "$CLAUDE_BIN" plugin marketplace update cargo-skills >/dev/null 2>&1 || true
  "$CLAUDE_BIN" plugin update cargo@cargo-skills >/dev/null 2>&1 || true
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
