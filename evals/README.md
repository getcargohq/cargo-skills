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

Prompts nobody wrote to pass have to come from real usage, and the only real usage these skills see is what users choose to send. Mine the reports filed through `cargo-ai workspaceManagement report create` — a report about a command that did not fit the request is often a misroute — and turn each into a case here, with a `why` that names the report it came from. The plugin collects no session telemetry, so there is no other source.
