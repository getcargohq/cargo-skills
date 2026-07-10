#!/bin/sh
# Approval hook for the Cargo plugin across Claude Code, Cursor, and Codex.
# Each agent prompts before running shell commands; this auto-approves a
# `cargo-ai` CLI call (or its `npx @cargo-ai/cli` form, optionally piped through
# a small set of read-only helpers on either side) so the plugin stops asking on
# every invocation. The verdict shape differs per agent, selected by the first
# argument: claude | cursor | codex.
#
#   claude -> PreToolUse           (input .tool_input.command)
#   codex  -> PermissionRequest    (input .tool_input.command)
#   cursor -> beforeShellExecution (input .command)
#
# "allow" only skips the prompt; deny/ask rules (including managed deny lists)
# still take precedence, so this can't punch through an admin block. Conservative
# by design: any command that chains, redirects, or substitutes another program
# or expands the environment (`;`, `&`, `&&`, `||`, `>`, `<`, backticks, `$(…)`,
# any `$` parameter expansion like `$VAR`/`${VAR}`, or a backslash escape `\`)
# falls through to the normal prompt rather than being approved.

agent="${1:-claude}"

# Pipeline helpers allowed to follow `cargo-ai`. Read-only by intent; this is
# the security-relevant surface, kept in one place for review. `echo`/`printf`
# only emit their literal arguments (they never open a file or socket), so they
# are exempt from the path/file-flag guards below -- see the awk pass.
allowed_helpers="jq cat head tail wc grep sort uniq column tr echo printf"

# `cargo-ai` invocations that never auto-approve, so credentials, egress of
# session data, destruction, and deploys always reach the user:
#   - first words: credential/session commands
#   - pairs: token minting, report egress (consent stays explicit -- reports can
#     carry session traces), and CDK deploy/destroy
#   - tokens: destructive verbs anywhere in the invocation (`storage model
#     remove`, `hosting app remove`, ...)
gated_first="login logout"
gated_pairs="workspaceManagement token,workspaceManagement report,cdk deploy,cdk destroy"
gated_tokens="remove delete destroy"

# Harden: no globbing, and unset variables are errors so a typo can't silently
# widen approval.
set -fu

# Fail open to the normal prompt if we lack the tools we rely on to parse the
# event (jq) or to vet the command (awk). Without awk the structure/operand
# checks can't run, so we must not approve.
command -v jq > /dev/null 2>&1 || exit 0
command -v awk > /dev/null 2>&1 || exit 0

input="$(cat)"

case "$agent" in
  cursor)
    # Cursor's beforeShellExecution event is shell-specific; command is top-level.
    cmd="$(printf '%s' "$input" | jq -r '.command // empty' 2> /dev/null)"
    ;;
  *)
    # Claude PreToolUse / Codex PermissionRequest both gate the Bash tool. One
    # jq pass yields the command only for Bash; anything else comes back empty
    # and falls through to the normal prompt below.
    cmd="$(printf '%s' "$input" | jq -r 'if .tool_name == "Bash" then .tool_input.command // empty else empty end' 2> /dev/null)"
    ;;
esac

[ -n "$cmd" ] || exit 0

# Strip harmless redirections before the safety checks so they don't block
# otherwise-valid cargo-ai pipelines. Only two shapes are removed: redirects
# whose target is /dev/null (anchored to a word boundary so we never eat a
# prefix of a real path like /dev/nullX), and fd-to-fd duplications (2>&1,
# 1>&2). Any redirection to a real file is intentionally left intact so it
# still falls through to the prompt.
cmd_stripped="$(printf '%s' "$cmd" | sed -E '
  s#([0-9]*|&)>>?[[:space:]]*/dev/null([[:space:]]|$)#\2#g
  s/[0-9]*>&[0-9]+//g
')"

# Reject command chaining / redirection / substitution outright. Runs on the raw
# (quoted) string so even a quoted `;`/`>`/etc. is conservatively refused. The
# backslash is rejected too: the segment splitter below is not backslash-aware,
# so a `\"`/`\|` would let awk and the shell disagree on where segments start
# and end (a total allowlist bypass). Refusing any `\` closes that desync.
case "$cmd_stripped" in
  *';'* | *'&'* | *'<'* | *'>'* | *'`'* | *'$'* | *'\'*) exit 0 ;;
esac

# Reject multi-line commands (heredocs, embedded scripts).
[ "$(printf '%s' "$cmd_stripped" | wc -l | tr -d ' ')" = "0" ] || exit 0

# Bound the input so the char-by-char awk pass below can't be forced to scan an
# unbounded string.
[ "${#cmd_stripped}" -le 10000 ] || exit 0

# Validate the pipeline in a single quote-aware pass. awk splits on unquoted
# pipes (so a `|` inside jq/grep args or a quoted cargo-ai arg is not a
# separator; the `\`-reject guard above keeps this splitter in sync with the
# shell), trims surrounding whitespace per segment, then:
#   - any segment that leads with a `VAR=value` env-var assignment is rejected
#     outright -- we never vet the variable, so a prefix like `LD_PRELOAD=` or
#     `CARGO_API_TOKEN=` must not ride in as a plain call;
#   - at least one segment must be a cargo CLI call -- `cargo-ai …` or
#     `npx [-y|--yes] @cargo-ai/cli[@<version>] …` (its own path/URL args are
#     left alone), so the pipeline stays anchored to a Cargo call wherever it
#     sits; an `npx` of any other package is refused;
#   - the cargo segment is gated POSITION-INDEPENDENTLY: a credential command
#     token (login, logout), a destructive verb token (remove, delete,
#     destroy), or a gated adjacent pair (workspaceManagement token,
#     workspaceManagement report, cdk deploy, cdk destroy) ANYWHERE in the
#     segment refuses it. Positional checks alone are bypassable -- valid
#     prefixes like `npx -p @cargo-ai/cli cargo-ai login` or a global flag
#     with a value shift the real subcommand out of the first argument slots,
#     so leading `cargo-ai` binary tokens are dropped and every token is
#     scanned. Ordinary read/write subcommands (whoami, storage,
#     orchestration, billing, ...) still auto-approve; the accepted cost is
#     that a gated word appearing as a literal inside a quoted argument (a SQL
#     string containing `login`) also falls through to the prompt;
#   - every other segment's command must be in the allowlist (membership is an
#     exact key lookup, so a token like `*` can't wildcard its way in); and
#   - every other segment must not reference a path (`/`, `~`) or a read/write
#     file flag (long `--output`/`--file` or short clusters containing `o`/`f`,
#     attached value or not) -- helpers must transform stdin, not open files.
#     These checks apply to helpers on both sides of the cargo call, so neither
#     `cat /etc/passwd | cargo-ai …` nor `cargo-ai … | cat /etc/passwd` slips
#     by, and `cargo-ai … | sort -oPWNED.txt` can't write a cwd file; quoted
#     text is scanned too. `echo` and `printf` are exempt from these path/flag
#     guards: they only print literal arguments and can't open a file, so a `/`
#     or `~` in their args is data (JSON, a URL) being fed to cargo-ai's stdin,
#     not a file read. The `$`-reject guard above is what makes those args
#     literal -- otherwise `printf "$SECRET"` would expand an env var into the
#     CLI's stdin under this exemption.
# Residual, knowingly accepted: bare cwd-relative names (e.g. `cat .env`) aren't
# caught; since no allowlisted helper can reach the network or redirect, such a
# read stays in the agent's context and still can't be exfiltrated without a
# separate, non-approved (prompted) command.
verdict="$(printf '%s' "$cmd_stripped" | awk -v helpers="$allowed_helpers" -v gated_first="$gated_first" -v gated_pairs="$gated_pairs" -v gated_tokens="$gated_tokens" '
  BEGIN {
    n = split(helpers, a, " ")
    for (i = 1; i <= n; i++) H[a[i]] = 1
    nd = split(gated_first, d, " ")
    for (i = 1; i <= nd; i++) D[d[i]] = 1
    np = split(gated_pairs, p, ",")
    for (i = 1; i <= np; i++) P[p[i]] = 1
    ng = split(gated_tokens, g, " ")
    for (i = 1; i <= ng; i++) G[g[i]] = 1
    sq = sprintf("%c", 39)
  }
  {
    inq = ""; nseg = 0; cur = ""
    for (i = 1; i <= length($0); i++) {
      c = substr($0, i, 1)
      if (inq != "") { cur = cur c; if (c == inq) inq = ""; continue }
      if (c == sq || c == "\"") { inq = c; cur = cur c; continue }
      if (c == "|") { seg[nseg++] = cur; cur = ""; continue }
      cur = cur c
    }
    seg[nseg++] = cur

    saw_cargo = 0
    for (s = 0; s < nseg; s++) {
      t = seg[s]
      sub(/^[ \t]+/, "", t)
      sub(/[ \t]+$/, "", t)
      if (t ~ /^[A-Za-z_][A-Za-z0-9_]*=/) exit
      tok = t
      sub(/[ \t].*$/, "", tok)

      # Resolve whether this segment is a cargo CLI call, and if so capture the
      # argument tail (everything after the binary/package token) in `rest`.
      is_cargo = 0
      rest = ""
      if (tok == "cargo-ai") {
        is_cargo = 1
        rest = t
        sub(/^cargo-ai([ \t]+|$)/, "", rest)
      } else if (tok == "npx") {
        # `npx [-y|--yes|other flags] @cargo-ai/cli[@<version>] …` -- resolve
        # the first non-flag word as the package and require it to be the
        # Cargo CLI; an npx of anything else must not auto-approve.
        body = t
        sub(/^npx([ \t]+|$)/, "", body)
        m = split(body, w, /[ \t]+/)
        pkg = ""; pidx = 0
        for (j = 1; j <= m; j++) {
          if (w[j] == "") continue
          if (substr(w[j], 1, 1) == "-") continue
          pkg = w[j]; pidx = j; break
        }
        gsub(/"/, "", pkg); gsub(sq, "", pkg)
        if (pkg ~ /[][*?]/) exit
        if (pkg == "@cargo-ai/cli" || index(pkg, "@cargo-ai/cli@") == 1) {
          is_cargo = 1
          rest = ""
          for (j = pidx + 1; j <= m; j++) rest = rest w[j] " "
        } else {
          exit
        }
      }

      if (is_cargo) {
        saw_cargo = 1
        # Gate credential/egress/destructive invocations. Normalize the token
        # stream once (strip quotes, drop empties), then check gated tokens
        # POSITION-INDEPENDENTLY: real subcommands can be shifted out of the
        # first argument positions by valid invocation prefixes — e.g.
        # `npx -p @cargo-ai/cli cargo-ai login` puts a literal `cargo-ai`
        # before `login`, and a global flag with a value would shift the
        # domain word too — so positional-only checks are bypassable. Refusing
        # a gated token anywhere in the segment over-gates rare literals in
        # quoted args (a SQL string containing the word `login` falls through
        # to the prompt); that is the safe direction for an allow-only hook.
        m2 = split(rest, v, /[ \t]+/)
        n2 = 0
        for (j = 1; j <= m2; j++) {
          tj = v[j]
          gsub(/"/, "", tj); gsub(sq, "", tj)
          if (tj == "") continue
          n2++; ct[n2] = tj
        }
        # Drop leading `cargo-ai` binary tokens (`npx -p @cargo-ai/cli
        # cargo-ai …` runs the same CLI; the extra token must not consume a
        # checked position).
        s2 = 1
        while (s2 <= n2 && ct[s2] == "cargo-ai") s2++
        # First two non-flag words: refuse globbable command tokens.
        w1 = ""; w2 = ""
        for (j = s2; j <= n2; j++) {
          if (substr(ct[j], 1, 1) == "-") continue
          if (w1 == "") { w1 = ct[j]; continue }
          w2 = ct[j]
          break
        }
        if (w1 ~ /[][*?]/ || w2 ~ /[][*?]/) exit
        # Gates, anywhere in the segment: credential first-words (login,
        # logout), destructive verbs (remove, delete, destroy), and gated
        # pairs as adjacent tokens (workspaceManagement token/report,
        # cdk deploy/destroy).
        for (j = s2; j <= n2; j++) {
          if (ct[j] in D) exit
          if (ct[j] in G) exit
          if (j < n2 && ((ct[j] " " ct[j + 1]) in P)) exit
        }
      } else {
        if (!(tok in H)) exit
        if (tok != "echo" && tok != "printf") {
          if (index(t, "/") > 0) exit
          if (index(t, "~") > 0) exit
          if (t ~ /(^|[ \t])--(output|file)([ \t]|=|$)/) exit
          if (t ~ /(^|[ \t])-[A-Za-z]*[of]/) exit
        }
      }
    }
    if (saw_cargo) print "allow"
  }
')"

[ "$verdict" = "allow" ] || exit 0

case "$agent" in
  cursor)
    printf '%s\n' '{"continue":true,"permission":"allow"}'
    ;;
  codex)
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PermissionRequest","decision":{"behavior":"allow"}}}'
    ;;
  claude | *)
    # claude (PreToolUse) is the default; an unknown agent also lands here, which
    # is safe because we only ever emit an allow after passing the checks above.
    printf '%s\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"allow","permissionDecisionReason":"cargo-ai CLI is allowlisted by the Cargo plugin"}}'
    ;;
esac
