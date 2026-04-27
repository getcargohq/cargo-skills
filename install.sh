#!/usr/bin/env sh
#
# Cargo bootstrap installer.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/getcargohq/cargo-skills/main/install.sh | sh
#
# What it does (in order):
#   1. Installs @cargo-ai/cli globally via npm (or via npx fallback if npm install -g fails).
#   2. Authenticates: prefers an existing session (cargo-ai whoami); otherwise prompts for an API token.
#   3. Installs Cargo agent skills via `npx skills add` for codex / claude-code / cursor.
#   4. Optionally writes Bash(cargo-ai *) into ~/.claude/settings.json so Claude does not prompt.
#   5. Optionally launches `claude '/cargo-quickstart <goal>'` with a starter goal.
#
# Honors:
#   CARGO_API_TOKEN   — non-interactive auth (skips token prompt).
#   CARGO_INSTALL_NO_CLAUDE_PERMS=1 — skip the Claude permissions prompt.
#   CARGO_INSTALL_NO_LAUNCH=1       — skip launching `claude` at the end.
#   CARGO_QUICKSTART_GOAL           — override the default starter goal.

set -e

# ─────────────────────────────────────────────────────────────────────
# Output helpers
# ─────────────────────────────────────────────────────────────────────
if [ -t 1 ]; then
  RESET="\033[0m"
  GREEN="\033[32m"
  CYAN="\033[36m"
  YELLOW="\033[33m"
  RED="\033[31m"
  GREY="\033[90m"
else
  RESET=""; GREEN=""; CYAN=""; YELLOW=""; RED=""; GREY=""
fi

say()  { printf "%b\n" "$*"; }
warn() { printf "%b\n" "${YELLOW}$*${RESET}" >&2; }
fail() { printf "%b\n" "${RED}$*${RESET}" >&2; exit 1; }

print_logo() {
  if [ -t 1 ]; then
    say "${CYAN}"
    say "██████    ████    █████    ██████   ██████"
    say "██    ░  ██  ██░  ██  ██   ██    ░  ██  ██░"
    say "██       ██████░  █████ ░  ██ ███   ██  ██░"
    say "██       ██  ██░  ██ ██    ██  ██░  ██  ██░"
    say "██████   ██  ██░  ██  ██   ██████░  ██████░"
    say "${RESET}"
  fi
}

# ─────────────────────────────────────────────────────────────────────
# Step 1 — install @cargo-ai/cli
# ─────────────────────────────────────────────────────────────────────
ensure_node() {
  command -v node >/dev/null 2>&1 || fail "Node.js is required. Install from https://nodejs.org/ and re-run."
  command -v npm  >/dev/null 2>&1 || fail "npm is required (ships with Node.js). Re-install Node from https://nodejs.org/."
}

install_cli() {
  if command -v cargo-ai >/dev/null 2>&1; then
    say "${GREY}  cargo-ai already on PATH — skipping install.${RESET}"
    return 0
  fi
  say "${GREY}  Installing @cargo-ai/cli globally...${RESET}"
  if npm install -g @cargo-ai/cli >/dev/null 2>&1; then
    say "${GREEN}✓ Cargo CLI installed.${RESET}"
    return 0
  fi
  warn "  npm install -g failed (likely a permissions issue)."
  warn "  Falling back to npx — every \`cargo-ai\` call will resolve via \`npx @cargo-ai/cli\`."
  if ! command -v npx >/dev/null 2>&1; then
    fail "npx not found and npm install -g failed. Fix npm permissions or install Node.js with a writable global prefix."
  fi
  CARGO_BIN="npx @cargo-ai/cli"
}

CARGO_BIN="cargo-ai"

# ─────────────────────────────────────────────────────────────────────
# Step 2 — authenticate
# ─────────────────────────────────────────────────────────────────────
authenticate() {
  if $CARGO_BIN whoami >/dev/null 2>&1; then
    WHO=$($CARGO_BIN whoami 2>/dev/null || true)
    say "${GREEN}✓ Already authenticated.${RESET}"
    return 0
  fi

  TOKEN="${CARGO_API_TOKEN:-}"
  if [ -z "$TOKEN" ]; then
    say ""
    say "${CYAN}Cargo API token required.${RESET}"
    say "  Get one at: ${CYAN}https://app.getcargo.io${RESET} → Settings → API"
    say "  (token values are shown only once — copy it now)"
    say ""
    if [ ! -t 0 ] && [ ! -r /dev/tty ]; then
      fail "No TTY available for token entry. Re-run with CARGO_API_TOKEN=<token> set."
    fi
    printf "${CYAN}Paste API token:${RESET} "
    if [ -r /dev/tty ]; then
      stty -echo </dev/tty 2>/dev/null || true
      IFS= read -r TOKEN </dev/tty || true
      stty echo </dev/tty 2>/dev/null || true
    else
      stty -echo 2>/dev/null || true
      IFS= read -r TOKEN || true
      stty echo 2>/dev/null || true
    fi
    printf "\n"
  fi

  [ -n "$TOKEN" ] || fail "No token entered. Aborting."

  if ! $CARGO_BIN login --token "$TOKEN" >/dev/null 2>&1; then
    fail "cargo-ai login failed. Verify the token at https://app.getcargo.io → Settings → API."
  fi
  $CARGO_BIN whoami >/dev/null 2>&1 || fail "Login appeared to succeed but whoami fails. Check network and re-run."
  say "${GREEN}✓ Authenticated.${RESET}"
}

# ─────────────────────────────────────────────────────────────────────
# Step 3 — install agent skills
# ─────────────────────────────────────────────────────────────────────
install_skills() {
  if ! command -v npx >/dev/null 2>&1; then
    warn "  npx not found — skipping skill install."
    warn "  Run later: npx skills add getcargohq/cargo-skills --agents claude-code cursor codex --global --yes"
    return 0
  fi
  say "${GREY}  Installing Cargo skills for claude-code, cursor, codex...${RESET}"
  if npx --yes skills add getcargohq/cargo-skills \
       --agents claude-code cursor codex \
       --global --yes --skill '*' --full-depth >/dev/null 2>&1; then
    say "${GREEN}✓ Cargo skills installed.${RESET}"
  else
    warn "  Skill install failed. Run manually:"
    warn "    npx skills add getcargohq/cargo-skills --agents claude-code cursor codex --global --yes"
  fi
}

# ─────────────────────────────────────────────────────────────────────
# Step 4 — Claude permissions allowlist
# ─────────────────────────────────────────────────────────────────────
install_claude_permissions() {
  [ "${CARGO_INSTALL_NO_CLAUDE_PERMS:-0}" = "1" ] && return 0
  if ! command -v python3 >/dev/null 2>&1 && ! command -v python >/dev/null 2>&1; then
    return 0
  fi
  PYTHON_BIN=$(command -v python3 || command -v python)

  if [ -t 0 ] || [ -r /dev/tty ]; then
    say ""
    say "${CYAN}Allow Claude Code to run \`cargo-ai *\` without prompting?${RESET}"
    say "  (only updates ~/.claude/settings.json — you can revert any time)"
    printf "  [y/N]: "
    REPLY=""
    if [ -r /dev/tty ]; then
      IFS= read -r REPLY </dev/tty || true
    else
      IFS= read -r REPLY || true
    fi
    case "$REPLY" in
      y|Y|yes|YES) ;;
      *) say "${GREY}  Keeping existing Claude settings.${RESET}"; return 0 ;;
    esac
  else
    return 0
  fi

  SETTINGS="$HOME/.claude/settings.json"
  "$PYTHON_BIN" - "$SETTINGS" <<'PY'
import json, os, pathlib, sys
p = pathlib.Path(sys.argv[1])
allow_entries = ["Bash(cargo-ai *)", "Bash(npx @cargo-ai/cli *)"]
data = {}
try:
    if p.exists():
        parsed = json.loads(p.read_text(encoding="utf-8"))
        if isinstance(parsed, dict):
            data = parsed
except Exception:
    data = {}
perms = data.get("permissions") if isinstance(data.get("permissions"), dict) else {}
allow = perms.get("allow") if isinstance(perms.get("allow"), list) else []
seen, out = set(), []
for item in allow:
    if isinstance(item, str) and item not in seen:
        seen.add(item); out.append(item)
for item in allow_entries:
    if item not in seen:
        seen.add(item); out.append(item)
perms["allow"] = out
data["permissions"] = perms
p.parent.mkdir(parents=True, exist_ok=True)
p.write_text(json.dumps(data, indent=2) + os.linesep, encoding="utf-8")
PY
  say "${GREEN}✓ Claude settings updated (~/.claude/settings.json).${RESET}"
}

# ─────────────────────────────────────────────────────────────────────
# Step 5 — launch Claude with a starter quickstart
# ─────────────────────────────────────────────────────────────────────
launch_claude() {
  [ "${CARGO_INSTALL_NO_LAUNCH:-0}" = "1" ] && return 0
  if ! command -v claude >/dev/null 2>&1; then
    say ""
    say "${YELLOW}Claude Code not found.${RESET} Install: ${CYAN}https://code.claude.com/docs/en/overview${RESET}"
    say "Then run: ${CYAN}claude '/cargo-quickstart Find 5 CTOs in NYC and get their verified work emails.'${RESET}"
    return 0
  fi
  GOAL="${CARGO_QUICKSTART_GOAL:-Find 5 CTOs in NYC and get their verified work emails.}"
  say ""
  say "${GREEN}Launching Claude with /cargo-quickstart...${RESET}"
  exec claude "/cargo-quickstart $GOAL"
}

# ─────────────────────────────────────────────────────────────────────
# Main
# ─────────────────────────────────────────────────────────────────────
print_logo
ensure_node
install_cli
authenticate
install_skills
install_claude_permissions
launch_claude
