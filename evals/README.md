# Routing evals — and where the next cases come from

An agent sees exactly one thing before deciding whether to load a skill: its `description`. Seventeen of them compete for every prompt. These evals are the regression test for that decision.

## Running them

```bash
node .github/scripts/routing-eval.ts             # structural + lexical (gates CI)
node .github/scripts/routing-eval.ts --verbose   # per-case scores
node .github/scripts/routing-eval.ts --llm       # real model (needs ANTHROPIC_API_KEY)
node .github/scripts/routing-eval.ts --strict    # gate on the hard tier too
```

The `--llm` tier runs in its own workflow (`.github/workflows/routing-evals-llm.yml`) on PRs touching a `SKILL.md`, weekly, and on demand. It reports to the run summary and fails below `--llm-min=93`.

## The case file

`routing.jsonl`, one JSON object per line:

```json
{"prompt": "…", "expect": "cargo-gtm", "why": "what this guards", "tier": "hard"}
```

- `expect` — the skill that should win.
- `why` — optional, printed on failure. Write one whenever the case is non-obvious.
- `tier` — `core` (default) gates CI; `hard` is a deep paraphrase reported but not gated, because the offline lexical ranker cannot judge those fairly. The `--llm` tier judges both.

**Add a case whenever you change a description.** That is the whole contract: the change is the hypothesis, the case is the test.

## The ceiling problem, and the fix

The suite currently scores 100% on the model tier. That is a **ceiling effect, not a victory** — every prompt in here was written by someone who could see the descriptions they were grading, and several were added specifically to pin behavior that had just been implemented. A suite that always passes has stopped discovering anything.

Prompts nobody wrote to pass have to come from real sessions. That is what `hooks/skill-loads.sh` is for.

### Harvesting real cases

The session hooks append a marker to each Cargo session's summary naming the skills and reference docs that session actually loaded:

```
[cargo-skills: cargo-gtm | docs: build-tam,waterfall]
```

Sessions live in `workspace_management.sessions`, so the marker is queryable:

```bash
# Which skills are actually loading, and how often?
cargo-ai storage query execute "
  SELECT title, summary
  FROM workspace_management.sessions
  WHERE summary LIKE '%cargo-skills:%'
  ORDER BY created_at DESC
  LIMIT 50"
```

Three questions worth asking of that data, each of which produces eval cases:

1. **Which skills never load?** A skill with real usage everywhere else and zero loads has a description problem, not a capability problem. Its absence is the finding.
2. **Which sessions loaded two or more skills before settling?** The first one loaded is a candidate misroute — the title tells you the prompt, and that pairing is a `hard` case with a known-correct answer.
3. **Which skills load without any doc read following?** Either the skill answered on its own, or the agent bounced. Compare against sessions where a recipe was opened.

Turn what you find into cases here, with a `why` that names the session it came from. Cases sourced from real transcripts are worth more than a dozen written from the descriptions, because they are the only ones that can surprise us.

## What the marker does not contain

Skill and document names only — all of them already public in this repository. Never a prompt, a file's contents, an argument, a record, or anything a user typed. See the header of `hooks/skill-loads.sh` for the exact matching rules.
