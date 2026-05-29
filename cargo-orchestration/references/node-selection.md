# Choosing the right node (and when *not* to reach for Python)

When you build a workflow programmatically via the CLI, it is tempting to drop a
`python` node anywhere data needs to change shape. Resist that. A Python node is
a heavyweight, hard-to-debug WebAssembly sandbox; most of what agents use it for
is already a one-line native node. Over-using Python makes graphs slower, more
expensive to reason about, and harder to debug — exactly the opposite of what you
want when you can't click a node in the UI.

This page is the decision guide. Read it before adding any `python` or `script`
node.

> **The short version:** transform → `variables`; call an LLM and parse its JSON →
> `agent`; route → `branch`/`filter`/`switch`; loop → `group`; call an API → an HTTP
> `connector`. Reach for `script`/`python` only for genuine multi-step computation
> that none of those express.

## Decision table — what to use instead of Python

| If you're tempted to write Python to… | Use this native node instead | Why |
| --- | --- | --- |
| Extract / rename / reshape fields, build a payload | `variables` | Each variable's `value` is a template (or JS) expression — `{{nodes.start.email.split('@')[1]}}`, `{{nodes.enrich.metrics.employeesRange}}`. Output is read as `{{nodes.<slug>.<name>}}`. |
| Call an LLM, then parse JSON out of the response | `agent` (native) | Built-in. Set `output.type:"jsonSchema"` and the model returns structured JSON — **no HTTP node, no parse node, no branch-to-extract**. Read it as `{{nodes.<slug>.answer.<field>}}`. See "Native LLM" below. |
| Call a REST API | HTTP `connector` node | Observable (request/response captured in `runContext`), retryable (`retry` config), and rate-limit aware. Python **cannot** make network calls at all (see sandbox section). |
| Decide yes/no, A/B, or multi-way | `filter` / `branch` / `switch` | Condition is a boolean template expression. `filter` stops the record; `branch` is 2-way; `switch` is N-way. |
| Run a sub-workflow once per item in an array | `group` | Iterates the inner `_nodes` graph per item; results come back as an array (see "Group results"). |
| Wait between steps | `delay` | `time.sleep()` in a Python node does **not** reliably pause the workflow. The `delay` node is the only correct way to wait. |
| Pull from another saved workflow | `tool` node | Embeds a deployed tool as a step. |

## When `script` / `python` is actually the right call

Use a code node only when the logic is real computation that the nodes above
can't express cleanly:

- Multi-step parsing/normalization with branching logic (e.g. messy address
  parsing, dedup keys, fuzzy matching).
- Aggregating or reshaping a `group` node's array result into a single object.
- Math/date logic too involved for a single expression.

**Prefer the JS `script` node over `python` for transforms.** It is lighter than
the Pyodide sandbox and ships useful libraries: `lodash` covers nearly every
array/object transform people write Python loops for (`_.groupBy`, `_.uniqBy`,
`_.keyBy`, `_.chunk`), and `date-fns` covers date math.

Whichever you choose: assign the output to `result`. It becomes
`{{nodes.<slug>.result}}` downstream.

## Native LLM — stop building the 4-node LLM quartet

The pattern "build prompt (`variables`) → HTTP call to the model → `python` to
parse JSON → `branch`" is unnecessary. There is a **native `agent` node**
(`kind:"native"`, `actionSlug:"agent"`) that does all of it:

```json
{
  "slug": "classify", "kind": "native", "actionSlug": "agent",
  "config": {
    "prompt": {"kind":"templateExpression","expression":"Classify {{nodes.start.company}} …","instructTo":"none","fromRecipe":false},
    "output": {
      "type": "jsonSchema",
      "jsonSchema": {
        "type":"object",
        "properties": {"category":{"type":"string"}, "confidence":{"type":"number"}},
        "required":["category","confidence"], "additionalProperties": false
      }
    },
    "advancedSettings": {"connectorUuid":"<llm-connector>","languageModelSlug":"gpt-4.1-mini","temperature":0.3}
  },
  "childrenUuids": ["<next>"], "fallbackOnFailure": false, "position": {"x":0,"y":0}
}
```

- With `output.type:"jsonSchema"`, the model is forced to return JSON matching the
  schema — you do not parse anything.
- **Read the result under `.answer`:** `{{nodes.classify.answer.category}}`, **not**
  `{{nodes.classify.category}}` (which silently resolves to undefined). Same for
  `output.type:"text"` → `{{nodes.classify.answer}}`.
- It also supports `tools`, `resources`, `capabilities` (e.g. web search),
  `maxSteps`, and `systemPrompt`. See `nodes.md` → "AI and code".

This single node typically replaces 3–4 nodes per LLM step.

## Template expressions — what they can and can't do

Config values, conditions, and variable values are **template expressions**:
`{"kind":"templateExpression","expression":"{{ … }}","instructTo":"none","fromRecipe":false}`.

**Supported inside `{{ }}`:**

- Property and index access: `{{nodes.enrich.metrics.employeesRange}}`, `{{nodes.list[0].name}}`
- String/number operators and methods: `{{nodes.start.email.split('@')[1]}}`,
  `{{nodes.start.count > 100}}`, `{{nodes.a.x + nodes.b.y}}`
- Boolean logic for conditions: `{{nodes.start.email !== undefined && nodes.start.email !== null}}`

**Not reliable inside `{{ }}`:**

- Array methods with arrow-function callbacks — `{{nodes.x.map(i => i.name)}}`,
  `.filter(...)`, `.find(...)`. If you need these, do it in a `script`/`python`
  node (or restructure with a `group` node).

### The #1 footgun: expressions fail *silently*

A reference to a path that doesn't exist does **not** throw. The engine applies
optional chaining, so `{{nodes.foo.bar}}` for a missing `bar` resolves to
`undefined` (or the literal string `"undefined"` when embedded in a larger
string). The run still reports `status: "success"`. Consequences:

- A `branch`/`filter` condition on a bad path is always falsy → wrong path taken,
  silently.
- An `end`/`variables` value on a bad path comes out empty, silently.

**This is the root cause of most "it ran green but the data is blank" bugs** — and
it's why agents reach for Python (a traceback feels safer). The fix isn't Python;
it's **verifying the path against real node output** (next section).

## Inspecting data between nodes via the CLI — `runContext`

> You *can* see what flowed between nodes from the CLI. `run get` returns it.

`cargo-ai orchestration run get <run-uuid>` returns three top-level fields:

| Field | What it gives you |
| --- | --- |
| `run.executions[]` | Node-by-node trace: `nodeSlug`, `status`, `nextNodeUuid`, `nodeChildIndex` (which branch was taken). `title` is a **truncated summary** — don't trust it as data. |
| `runContext` | **The actual output of every node**, keyed by slug. This is the data behind `{{nodes.<slug>...}}`. |
| `runComputedConfigs` | The resolved config each node was actually called with. |

So to debug "my expression resolved to empty," read `runContext.<upstreamSlug>`
and compare its real shape to the path you wrote. This is the CLI equivalent of
clicking a node in the UI. Common discovery: agent output is nested under
`.answer`; some connectors nest fields (e.g. `find_email.contact.email` rather
than `find_email.email`).

Before running the full graph you can also dry-run expression resolution with
`node compute` (no side effects, no credits) — but note it does **not** reliably
resolve boolean conditions against `--context`; for branch logic, run one record
and read `runContext`. See `troubleshooting.md` → "Debugging a workflow run".

## The Pyodide sandbox — if you must use `python`

The `python` node is **not** CPython. It is Pyodide — Python compiled to
WebAssembly — with a deliberately small surface. Knowing the limits up front
saves the trial-and-error the UI would otherwise teach you:

- **No network.** There is no socket access, and the bridge to JS is blocked, so
  `requests`, `urllib`, `httpx`, etc. cannot connect. **Do all HTTP in an HTTP
  `connector` node**, not in Python.
- **No `time.sleep` for pausing the flow.** Use a `delay` node.
- **Avoid `asyncio`/threads.** The sandbox runs your script in a wrapped async
  context; spawning your own event loop / threads is unsupported and surfaces as
  opaque WebAssembly errors.
- **Blocked for safety:** `os.system`, direct JS access (the `js` module),
  arbitrary-code escapes.
- **Pure-Python stdlib and most pure-Python / Pyodide-supported packages work**
  (imports are auto-loaded). CPython C-extensions that aren't packaged for
  Pyodide won't.
- **Output must be JSON-serializable.** Assign `result`; it's converted to
  JS/JSON. A `datetime`, `set`, `bytes`, or custom object will not round-trip
  cleanly — return strings/numbers/lists/dicts. **This matters across `delay`
  boundaries** (next section).

The JS `script` node uses a Node `vm` sandbox with a 30s timeout and a fixed
module allowlist: `axios`, `cheerio`, `crypto-js`, `date-fns`, `jsonschema`,
`knex`, `lodash`, `uuid`, `zod`, `url` (plus `Buffer` and a UTC-pinned `Date`).
Any other `require(...)` throws.

## What survives a `delay` boundary

Contrary to a common assumption, **the full run context survives a delay** — it is
checkpointed to storage as JSON after each node and rehydrated when the workflow
resumes. After a `delay` node, *all* prior node outputs are still readable as
`{{nodes.<slug>...}}`, regardless of whether they came from `variables`, `agent`,
a connector, or a `python` node.

The real catch is **serialization, not node type**: the checkpoint is JSON, so a
value only survives the delay if it's JSON-serializable. Plain values produced by
`variables` nodes and template expressions always survive. A `python`/`script`
`result` survives **only to the extent it's JSON-serializable** — a non-primitive
Python object that didn't convert cleanly can come back empty.

**Robust pattern:** anything you need to read *after* a `delay`, materialize into a
`variables` node as plain JSON (strings/numbers/booleans/arrays/objects) *before*
the delay. Then reference that variable downstream. This is also why "rearchitect
from Python to Variables nodes" fixes delay-related breakage — not because Python
state is wiped, but because Variables values are guaranteed-serializable.

## Group node results — access pattern

A `group` node runs its inner `_nodes` graph once per item. Downstream, its output
is an **array**, one entry per iteration, where each entry is that iteration's
final (`end`) node output.

```
{{nodes.fetch_loop[0].markdown}}        ✅  first iteration's `markdown` output
{{nodes.fetch_loop[2].company_name}}    ✅  third iteration
{{nodes.fetch_loop.results[0].markdown}} ❌  there is no `.results` wrapper
{{nodes.fetch_loop.map(x => x.markdown)}} ❌  arrow callbacks aren't supported in expressions
```

To collapse the array into one object (e.g. concatenate all `markdown`), use a
`script` node with `lodash`, or a `python` node — this is one of the legitimate
uses of a code node. Inside the loop, reference the current item with
`{{nodes.start.value}}` (scalars) or `{{nodes.start.<field>}}` (objects), and the
parent run with `{{parentNodes.<slug>.<field>}}`.

## Refactor recipe — replacing an existing Python node

1. **`run get <run-uuid>`** and read `runContext.<pythonSlug>.result` to see exactly
   what the node produces.
2. Classify what it does:
   - Field reshape / extraction → move each output field into a `variables` node as
     a template expression.
   - JSON parse of an LLM response → delete it; switch the upstream `agent` node to
     `output.type:"jsonSchema"` and read `.answer`.
   - HTTP call → replace with an HTTP `connector` node.
   - Routing / boolean → `filter` / `branch` / `switch`.
   - Genuine multi-step computation → keep it, but prefer a JS `script` node with
     `lodash`.
3. `node validate` the new graph, `node compute` to preview expression resolution,
   then run one record and confirm via `runContext`.
4. Stage with `draft-release update`, deploy with `draft-release deploy`.
