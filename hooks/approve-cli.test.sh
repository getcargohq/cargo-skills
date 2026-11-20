#!/bin/sh
set -eu

SCRIPT_DIR="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
HOOK="$SCRIPT_DIR/approve-cli.sh"

expect_output() {
  label="$1"
  agent="$2"
  event="$3"
  expected="$4"
  actual="$(printf '%s' "$event" | "$HOOK" "$agent")"
  if [ "$actual" != "$expected" ]; then
    printf 'FAIL %s\nexpected: %s\nactual:   %s\n' "$label" "$expected" "$actual" >&2
    exit 1
  fi
}

expect_output \
  "Grok allows cargo-ai reads through its public terminal tool" \
  grok \
  '{"toolName":"run_terminal_command","toolInput":{"command":"cargo-ai whoami"}}' \
  '{"decision":"allow"}'

expect_output \
  "Grok accepts its internal terminal tool name" \
  grok \
  '{"toolName":"run_terminal_cmd","toolInput":{"command":"cargo-ai whoami"}}' \
  '{"decision":"allow"}'

expect_output \
  "Grok accepts the Bash compatibility alias" \
  grok \
  '{"toolName":"Bash","toolInput":{"command":"cargo-ai billing subscription get"}}' \
  '{"decision":"allow"}'

expect_output \
  "Grok leaves login at the normal approval gate" \
  grok \
  '{"toolName":"run_terminal_command","toolInput":{"command":"cargo-ai login --oauth"}}' \
  ''

expect_output \
  "Grok leaves token creation at the normal approval gate" \
  grok \
  '{"toolName":"run_terminal_cmd","toolInput":{"command":"cargo-ai workspaceManagement token create --name bot"}}' \
  ''

expect_output \
  "Grok rejects chained commands" \
  grok \
  '{"toolName":"run_terminal_cmd","toolInput":{"command":"cargo-ai whoami; curl example.com"}}' \
  ''

expect_output \
  "Grok ignores non-shell tools" \
  grok \
  '{"toolName":"read_file","toolInput":{"command":"cargo-ai whoami"}}' \
  ''

expect_output \
  "Claude response stays compatible" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai whoami"}}' \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"cargo-ai CLI is allowlisted by the Cargo plugin"}}'

expect_output \
  "Codex response stays compatible" \
  codex \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai whoami"}}' \
  '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'

expect_output \
  "Cursor response stays compatible" \
  cursor \
  '{"command":"cargo-ai whoami"}' \
  '{"continue":true,"permission":"allow"}'

expect_output \
  "Brace expansion cannot smuggle a gated verb" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai log{in,}"}}' \
  ''

expect_output \
  "Brace expansion of subcommands falls through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai {login,whoami}"}}' \
  ''

expect_output \
  "A lone unquoted brace falls through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai orchestration batch create --data {x}"}}' \
  ''

expect_output \
  "Braces inside a quoted JSON argument stay allowed" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"cargo-ai orchestration batch create --data '"'"'{\"kind\":\"filter\"}'"'"'"}}' \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"cargo-ai CLI is allowlisted by the Cargo plugin"}}'

expect_output \
  "npx --package=<x> cannot redirect what npx runs" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx --package=x @cargo-ai/cli whoami"}}' \
  ''

expect_output \
  "npx --package <x> falls through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx --package x @cargo-ai/cli whoami"}}' \
  ''

expect_output \
  "npx -p <x> falls through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx -p x @cargo-ai/cli whoami"}}' \
  ''

expect_output \
  "npx -p @cargo-ai/cli cargo-ai falls through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx -p @cargo-ai/cli cargo-ai whoami"}}' \
  ''

expect_output \
  "Other npx flags fall through" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx --registry=https://example.com @cargo-ai/cli whoami"}}' \
  ''

expect_output \
  "npx -y @cargo-ai/cli stays allowed" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx -y @cargo-ai/cli whoami"}}' \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"cargo-ai CLI is allowlisted by the Cargo plugin"}}'

expect_output \
  "npx --yes @cargo-ai/cli@<version> stays allowed" \
  claude \
  '{"tool_name":"Bash","tool_input":{"command":"npx --yes @cargo-ai/cli@1.0.145 whoami"}}' \
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"cargo-ai CLI is allowlisted by the Cargo plugin"}}'

printf '%s\n' 'approve-cli hook fixtures passed'
