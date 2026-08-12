#!/usr/bin/env bash
# Which Cargo skills did this session actually load?
#
# Routing — whether an agent picks the right skill for a request — is the thing
# the whole bundle turns on, and until now it was argued rather than measured.
# `evals/routing.jsonl` tests it against prompts we wrote ourselves, which
# stops catching regressions once it saturates. Real sessions are the only
# source of prompts nobody wrote to pass.
#
# This reads a Claude Code transcript and emits a one-line marker naming the
# skills and reference docs that were loaded, which the session hooks append to
# the row's summary.
#
# WHAT IT READS: tool-use records only. Skill invocations appear as
#   {"name":"Skill","input":{"skill":"cargo-gtm"}}
# and reference reads as file paths ending in SKILL.md, recipes/*.md, or
# provider-playbooks/*.md.
#
# WHAT IT NEVER EMITS: prompts, file contents, record data, arguments, or
# anything a user typed. Only names that already exist in this public repo.
#
# Usage:  skill-loads.sh <transcript-path>     # prints the marker, or nothing
#         skill-loads.sh --self-test           # fixture check, used by CI
set -u

MARKER_PREFIX="cargo-skills:"

emit_marker() {
  transcript="$1"
  [ -n "$transcript" ] && [ -f "$transcript" ] || return 0

  # Skills invoked through the Skill tool — both model-chosen and user-typed
  # (`/cargo-gtm`). Plugin installs namespace them as `cargo:cargo-gtm`, so
  # strip the prefix and dedupe, or the same skill counts twice by channel.
  #
  # IMPORTANT: preserve load order (first occurrence wins) so the first skill
  # in a multi-skill session is the misroute candidate. `awk '!seen[$0]++'`
  # dedupes while keeping order, unlike `sort -u`.
  skills="$(
    grep -o '"skill":"\(cargo:\)\?cargo[a-z-]*"' "$transcript" 2>/dev/null |
      sed 's/.*"skill":"//; s/"$//; s/^cargo://' |
      awk '!seen[$0]++' | paste -sd, - 2>/dev/null || true
  )"

  # Reference docs opened underneath a skill — the deeper signal, because it
  # says which recipe or playbook the routing actually landed on.
  #
  # This MUST be anchored to a `"file_path":` tool input. Matching the bare
  # path anywhere in the transcript looks equivalent and is not: a skill's own
  # catalog table lists every recipe and playbook by name, so loading cargo-gtm
  # once would report all 43 playbooks as "read" and the signal would be noise.
  docs_all="$(
    grep -oE '"file_path":"[^"]*/(recipes|provider-playbooks|guides)/[a-zA-Z0-9._-]+\.md"' "$transcript" 2>/dev/null |
      sed 's#.*/##; s#\.md"$##' |
      sort -u || true
  )"
  # `grep -c` exits 1 on no matches, so a `|| echo 0` fallback would append a
  # second count rather than replace it. Count non-empty lines directly.
  if [ -n "$docs_all" ]; then
    docs_count="$(printf '%s\n' "$docs_all" | wc -l | tr -d ' ')"
  else
    docs_count=0
  fi
  docs="$(printf '%s' "$docs_all" | head -12 | paste -sd, - 2>/dev/null || true)"
  # Never truncate silently — a capped list that looks complete is worse than
  # one that admits it was capped.
  [ "$docs_count" -gt 12 ] && docs="$docs,+$((docs_count - 12)) more"

  [ -n "$skills" ] || [ -n "$docs" ] || return 0

  # Each half is optional: a session can read a recipe without a Skill call
  # (following a link), or invoke a skill without opening a sub-doc.
  if [ -n "$skills" ] && [ -n "$docs" ]; then
    printf '[%s %s | docs: %s]' "$MARKER_PREFIX" "$skills" "$docs"
  elif [ -n "$skills" ]; then
    printf '[%s %s]' "$MARKER_PREFIX" "$skills"
  else
    printf '[%s docs: %s]' "$MARKER_PREFIX" "$docs"
  fi
}

self_test() {
  tmp="$(mktemp -d)"
  trap 'rm -rf "$tmp"' EXIT
  fail=0

  check() {
    label="$1"; want="$2"; got="$3"
    if [ "$got" = "$want" ]; then
      printf 'ok    %s\n' "$label"
    else
      printf 'FAIL  %s\n        want: %s\n        got:  %s\n' "$label" "$want" "$got"
      fail=1
    fi
  }

  # 1. A plain skill invocation.
  printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}' >"$tmp/a.jsonl"
  check "single skill" "[cargo-skills: cargo-gtm]" "$(emit_marker "$tmp/a.jsonl")"

  # 2. Plugin namespacing must collapse onto the bare name, not double-count.
  {
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo:cargo-gtm"}}'
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}'
  } >"$tmp/b.jsonl"
  check "plugin namespace dedupes" "[cargo-skills: cargo-gtm]" "$(emit_marker "$tmp/b.jsonl")"

  # 3. Reference docs are reported alongside, sorted and deduped.
  {
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}'
    printf '%s\n' '{"file_path":"/x/cargo-gtm/recipes/build-tam.md"}'
    printf '%s\n' '{"file_path":"/x/cargo-gtm/provider-playbooks/waterfall.md"}'
    printf '%s\n' '{"file_path":"/x/cargo-gtm/recipes/build-tam.md"}'
  } >"$tmp/c.jsonl"
  check "skills + docs" "[cargo-skills: cargo-gtm | docs: build-tam,waterfall]" "$(emit_marker "$tmp/c.jsonl")"

  # 4. A session that never touched Cargo emits nothing at all — no marker,
  #    no empty brackets polluting the summary.
  printf '%s\n' '{"name":"Bash","input":{"command":"ls"}}' >"$tmp/d.jsonl"
  check "no cargo usage → empty" "" "$(emit_marker "$tmp/d.jsonl")"

  # 5. Non-cargo skills are not ours to report.
  printf '%s\n' '{"name":"Skill","input":{"skill":"code-review"}}' >"$tmp/e.jsonl"
  check "foreign skill ignored" "" "$(emit_marker "$tmp/e.jsonl")"

  # 6. A missing transcript must not error — hooks never block a session.
  check "missing file → empty" "" "$(emit_marker "$tmp/does-not-exist.jsonl")"

  # 7. THE ONE REAL DATA CAUGHT AND FIXTURES DID NOT. A skill's catalog table
  #    names every recipe and playbook in prose. Those mentions are not reads,
  #    and counting them reported all 43 playbooks for a single skill load.
  {
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}'
    printf '%s\n' '{"text":"| [recipes/build-tam.md](recipes/build-tam.md) | Building a TAM list |"}'
    printf '%s\n' '{"text":"see provider-playbooks/waterfall.md for the fallback chain"}'
  } >"$tmp/f.jsonl"
  check "prose mentions are not reads" "[cargo-skills: cargo-gtm]" "$(emit_marker "$tmp/f.jsonl")"

  # 8. Docs without a Skill call — following a link straight to a recipe —
  #    must not leave a dangling "cargo-skills:" with nothing after it.
  printf '%s\n' '{"file_path":"/x/cargo-gtm/recipes/build-tam.md"}' >"$tmp/g.jsonl"
  check "docs only, no dangling prefix" "[cargo-skills: docs: build-tam]" "$(emit_marker "$tmp/g.jsonl")"

  # 9. Over the cap, the marker says so rather than looking complete.
  : >"$tmp/h.jsonl"
  for i in 1 2 3 4 5 6 7 8 9 10 11 12 13 14; do
    printf '{"file_path":"/x/cargo-gtm/recipes/r%02d.md"}\n' "$i" >>"$tmp/h.jsonl"
  done
  check "cap is declared" \
    "[cargo-skills: docs: r01,r02,r03,r04,r05,r06,r07,r08,r09,r10,r11,r12,+2 more]" \
    "$(emit_marker "$tmp/h.jsonl")"

  # 10. Load order is preserved — the first skill is the misroute candidate.
  #     `cargo-enrich` comes before `cargo-gtm` alphabetically but after in
  #     transcript order; must stay in load order.
  {
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}'
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-enrich"}}'
    printf '%s\n' '{"name":"Skill","input":{"skill":"cargo-gtm"}}'
  } >"$tmp/i.jsonl"
  check "skills preserve load order" "[cargo-skills: cargo-gtm,cargo-enrich]" "$(emit_marker "$tmp/i.jsonl")"

  [ "$fail" -eq 0 ] && printf '\nskill-loads.sh: all checks passed\n'
  return "$fail"
}

case "${1:-}" in
  --self-test) self_test ;;
  "") exit 0 ;;
  *) emit_marker "$1" ;;
esac
