# Build from dedicated actions + expressions

**Build every step from dedicated actions + expressions, in this order:**

1. **A dedicated action.** Search first with `cargo-ai orchestration action list <keywords>`
   (free). It covers connector actions, native actions (`agent`, `modelUpsert`, `branch`,
   `group`…) and workspace tools, and returns a ready-to-paste `action` object.
2. **An expression** for the glue between actions. It's inline JavaScript in the field
   that needs the value, so it covers reshaping, payloads, conditions and arrays.
3. **HTTP**, only if step 1 found no action for that API. Its body is still an expression.
4. **A `script` node**, only if the logic can't fit in an expression.

HTTP + `script` is the last resort, not the default.

## Expressions are inline JavaScript

**A template expression is inline JavaScript.** Whatever you write inside `{{ }}` runs
in a full JavaScript engine, in the field that needs the value. So a small
transformation (trim a string, pick a field, build a JSON body, compute a date,
check a list, map over an array) goes **inline, in that field**. It never needs a
`script` or `python` node of its own.

A code node costs an extra node, an extra execution (every node execution bills), and
an extra hop to debug, and its output hides behind `.result`. Add one only when the
logic truly doesn't fit in an expression.

## Where the logic goes

1. **Used in one place:** write the expression in that field. That covers an action
   input, a mapping value, a branch condition, an HTTP `url` or `bodyJson`, or an `end`
   variable.
2. **Used by several nodes:** compute it once in a `variables` node, and read it as
   `{{nodes.<slug>.<name>}}`. Put that node **above** any `branch`, because branches
   don't merge back, and work placed after one gets copied onto every path.
3. **Genuinely multi-step:** a `script` node. See "When a code node is warranted" below.

Some examples of what fits inline:

```
{{nodes.start.email.trim().toLowerCase().split('@')[1]}}
{{["gmail.com", "yahoo.com"].includes(nodes.prep.domain) ? "free_mail" : ""}}
{{nodes.contacts.map(c => c.email).filter(Boolean).join(", ")}}
{{new Date().toISOString().slice(0, 10)}}
```

An HTTP body is a JSON template, so each value goes in with `JSON.stringify`:

```
"bodyJson": "{\"domain\": {{JSON.stringify(nodes.prep.domain)}}, \"source\": \"visit\"}"
```

A `script` node that only assembles a value for the next node is the pattern to avoid.
The next node's field can hold that expression directly.

## Common cases: the dedicated action to use

| Instead of… | Use |
| --- | --- |
| code to call an LLM and parse its JSON | the native `agent` node with `output.type:"jsonSchema"`, read as `{{nodes.<slug>.answer.<field>}}` |
| a raw HTTP request to a provider | the integration's connector action. Find it with `cargo-ai orchestration action list <keywords>` |
| an HTTP call to a Cargo model's `/records/ingest` webhook | the native `modelUpsert` / `modelInsert` action. See [`nodes.md`](nodes.md) → "Storage" |
| code to decide a path | `branch` / `filter` / `switch` with a boolean expression |
| code to loop over a list | a `group` node |
| code to wait | a `delay` node |

## When a code node is warranted

- Logic that runs to many statements: messy parsing, dedup, a small state machine.
  If it fits on a few lines, keep it inline. An expression can hold an arrow function
  or an IIFE (an immediately called `(() => { … })()`).
- Parsing an untyped response from an API that has no connector action.

Before deploying, check each `script`, `python`, and HTTP node: could it be an
expression in the field that uses it, or a native action? If so, replace it.

If you do need code, prefer the JS `script` node. Its `require()` allowlist is
`axios`, `cheerio`, `crypto-js`, `date-fns`, `jsonschema`, `lodash`, `url`, `uuid`,
and `zod`. Anything else throws, including `knex` (query over HTTP with `axios`
instead). Both code nodes are sandboxed and have no normal logging, so return your
output and inspect it via `runContext`.

## Expression traps

- **A missing path resolves to empty, silently.** The run still says `success`, so no
  `try/catch` or `|| {}` guard is needed. When a value comes out blank, check the real
  shape with `cargo-ai orchestration run get <run-uuid>` → `runContext.<slug>`.
- **ISO date strings arrive as `Date` objects.** `String(nodes.start.seen_at)` gives
  `"Tue Sep 01 2026 …"`, so a regex or `.slice(0, 10)` on it quietly misses. Normalize
  first: `v instanceof Date ? v.toISOString() : String(v || "")`.
- **Test before deploying.** It's free and runs nothing:
  `cargo-ai expression eval evaluate --expression '{"kind":"templateExpression","expression":"{{…}}","instructTo":"none","fromRecipe":false}' --variables '{"nodes":{…}}'`.
