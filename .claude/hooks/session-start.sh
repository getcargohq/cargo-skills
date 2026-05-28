#!/bin/bash
set -euo pipefail

# Only run in Claude Code on the web (remote) sessions.
# Locally, users manage CLI/skill versions themselves.
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

echo "[cargo-skills] Updating @cargo-ai/cli to latest..."
npm install -g @cargo-ai/cli@latest

echo "[cargo-skills] Refreshing cargo-skills bundle to latest..."
# `skills add` clones the repo fresh, so re-running pulls the latest main.
# The --all flag installs every skill into every detected agent non-interactively.
npx -y skills add getcargohq/cargo-skills --all

echo "[cargo-skills] Done — CLI and skills are on latest."
