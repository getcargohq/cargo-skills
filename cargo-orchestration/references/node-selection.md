# Prefer built-in actions + expressions over code/HTTP nodes

When building a workflow, **use the actions Cargo already provides plus template
expressions. Avoid `python`, `script` (JavaScript), and raw HTTP nodes unless you
genuinely have no other option.**

Code and raw-HTTP nodes feel flexible, but they are the hardest part of a workflow
to build and debug from the CLI: they fail in ways the native nodes don't, and you
can't see inside them as easily. Most of what they get used for is already a
one-line native node or a template expression.

## Use this instead

| Instead of writing… | Use |
| --- | --- |
| `python` / `script` to reshape, rename, or extract fields | a `variables` node — each value is a template expression, e.g. `{{nodes.start.email.split('@')[1]}}` |
| `python` / `script` to call an LLM and parse its JSON | the native `agent` node with `output.type:"jsonSchema"` — it returns structured JSON, no parsing (read it as `{{nodes.<slug>.answer.<field>}}`) |
| a raw **HTTP** request | the integration's **dedicated connector action** (e.g. `clearbit.enrichCompanyFromDomain`) — discover them with `connection integration get-documentation <slug>` |
| `python` / `script` to decide a path | `filter` / `branch` / `switch` with a boolean expression |
| `python` / `script` to loop over a list | a `group` node |
| `time.sleep()` to wait | a `delay` node |

## Template expressions cover most "transforms"

Inside `{{ }}` you can do property/index access, string and number operations, and
boolean logic — so field extraction and conditions belong in a `variables` node or
a condition, not in code:

```
{{nodes.start.email.split('@')[1]}}
{{nodes.enrich.metrics.employeesRange}}
{{nodes.start.employee_count > 100}}
```

One caveat: a reference to a missing path resolves to empty **silently** (the run
still says `success`). When a value comes out blank, check the real shape with
`cargo-ai orchestration run get <run-uuid>` → `runContext.<slug>` (node outputs
*are* returned by the CLI) and fix the path.

## When a code or HTTP node is genuinely warranted

- Multi-step computation that no expression or native node expresses (messy
  parsing, dedup, aggregating a `group` node's array into one object).
- An API with no dedicated connector action.

If you do need code, prefer the JS `script` node for transforms (it ships `lodash`
for array/object work). Either way, both code nodes are sandboxed and have no
normal logging — return your output and inspect it via `runContext`.
