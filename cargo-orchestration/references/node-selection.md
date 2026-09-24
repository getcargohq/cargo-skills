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
| a `script` node that only builds a payload, string, or object for the **next** node | nothing — write the expression straight into that node's input (HTTP `bodyJson`, action inputs, `modelUpsert` mappings). See "Never add a node to prepare an input" below |
| an HTTP call to Cargo's own `/v1/models/<uuid>/records/ingest` to write a row | the native **`modelUpsert`** (or `modelInsert` / `modelUpdate`) action — no token, no HTTP node, no payload script. See "Write to a Cargo model natively" below |
| the same prep `script` copied onto every branch | one `variables` node **above** the `branch`; every branch reads `{{nodes.<slug>.<name>}}` |

## Hard rules

These are not preferences. A graph that breaks one gets rebuilt before it is deployed.

1. **Never add a node to prepare another node's input.** Every node input takes a
   template expression. A `script` whose output is read by exactly one downstream
   node, and does nothing but assemble values, is always removable.
2. **Writing to a Cargo model is `modelUpsert` / `modelInsert` / `modelUpdate`.** The
   `/records/ingest` webhook is for systems *outside* Cargo. Called from a workflow it
   costs an HTTP node, a payload script, and an API token pasted into a header.
3. **Compute shared values once, above the fork.** Branches do not merge back, so work
   placed after a `branch` gets copied onto every path. Put it in a `variables` node
   before the `branch`.
4. **Don't guard missing paths in code.** A missing path already resolves to empty,
   so `|| {}`, `try/catch`, and `String(x || "")` wrappers are not a reason to use a
   `script` node.
5. **Audit before deploying.** List every `script`, `python`, and HTTP node with a
   one-line reason it can't be a native action or an expression. If the reason is
   "build a payload", "reshape fields", "decide a path", or "write to a model", replace
   the node. The only reasons that survive are the ones under "When a code or HTTP
   node is genuinely warranted" below.

## Never add a node to prepare an input

The HTTP connector's `bodyJson` is a JSON **template string**: write the body inline
and interpolate each value. Wrap values in `JSON.stringify(...)` so quotes, newlines,
and `null` are escaped correctly:

```json
"config": {
  "method": "post",
  "url": "https://api.example.com/v1/events",
  "bodyFormat": "json",
  "bodyJson": "{\"domain\": {{JSON.stringify(nodes.prep.domain)}}, \"decision\": \"created\", \"linkedin_url\": {{JSON.stringify(nodes.parse_li.result.li_url)}}}"
}
```

Don't do this instead: a `script` node that returns `{payload: JSON.stringify({...})}`
followed by an HTTP node whose body is `{{nodes.<script>.result.payload}}`. That's two
nodes and two executions for something one node does. The same applies to connector
action inputs and `modelUpsert` mappings: each field is its own expression.

## Write to a Cargo model natively

Log a row, update a ledger, or record an outcome with `modelUpsert`. It matches on one
column, updates the record if it exists, and inserts it if it doesn't:

```json
{
  "uuid": "…", "slug": "log_outcome", "kind": "native", "actionSlug": "modelUpsert",
  "config": {
    "modelUuid": "<model-uuid>",
    "matchingColumnSlug": "ledger_key",
    "matchingValue": {"kind": "templateExpression", "expression": "visit:{{nodes.prep.domain}}", "instructTo": "none", "fromRecipe": false},
    "mappings": [
      {"columnSlug": "domain",   "value": {"kind": "templateExpression", "expression": "{{nodes.prep.domain}}", "instructTo": "none", "fromRecipe": false}},
      {"columnSlug": "decision", "value": {"kind": "templateExpression", "expression": "created", "instructTo": "none", "fromRecipe": false}}
    ]
  },
  "childrenUuids": ["…"], "fallbackOnFailure": false, "position": {"x": 0, "y": 0}
}
```

A null `matchingValue` fails the node without writing anything. Full config for the
whole family (`modelInsert`, `modelUpdate`, `modelRemove`, `modelSearch`) is in
[`nodes.md`](nodes.md) → "Storage".

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

A second silent trap: **ISO date strings arrive in expressions as `Date` objects.**
`String(nodes.start.seen_at)` gives `"Tue Sep 01 2026 10:00:00 GMT+0000 …"`, not
`"2026-09-01T10:00:00Z"`, so a regex or `.slice(0, 10)` on it quietly misses. Normalize
first: `v instanceof Date ? v.toISOString() : String(v || "")`. Test an expression
against sample data before deploying with `cargo-ai expression eval evaluate
--expression '{"kind":"templateExpression","expression":"{{…}}","instructTo":"none","fromRecipe":false}'
--variables '{"nodes":{…}}'` (free, runs nothing).

## When a code or HTTP node is genuinely warranted

- Multi-step computation that no expression or native node expresses (messy
  parsing, dedup, aggregating a `group` node's array into one object).
- An API with no dedicated connector action. Even then, the HTTP node's `bodyJson`
  takes expressions directly (see above), so it never needs a `script` node in front
  of it. A `script` *after* it, to parse an untyped response, can be warranted.

If you do need code, prefer the JS `script` node. Its `require()` allowlist is
`axios`, `cheerio`, `crypto-js`, `date-fns`, `jsonschema`, `lodash`, `url`,
`uuid`, and `zod`. Anything else throws — including `knex` (query over HTTP with
`axios` instead). Both code nodes are sandboxed and have no normal logging —
return your output and inspect it via `runContext`.
