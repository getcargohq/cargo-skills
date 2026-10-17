# Knowledge-graph queries

`cargo-ai context graph get` returns the typed knowledge graph derived from every markdown/MDX/YAML file in the context repo. Pipe it through `jq` to slice it.

> Shape: `{"graph": {"nodes": [{id, title, summary, cluster}], "edges": [{source, target, origin}], "broken": [{source, target, origin}], "computedAt"}}`. Node `id` is the repo-relative file path **with** its extension (`persona/vp-sales-mid-market.md`), and edge `source`/`target` are node ids. Only frontmatter `references:`, wikilinks, and Markdown links produce edges; a bare `domain/slug` in prose does not. See `../response-shapes.md`.

## List every node

```bash
cargo-ai context graph get | jq -r '.graph.nodes[].id' | sort
```

## Count entries per domain

```bash
cargo-ai context graph get \
  | jq -r '.graph.nodes[].cluster' \
  | sort | uniq -c | sort -rn
```

## Find every persona

```bash
cargo-ai context graph get \
  | jq '.graph.nodes[] | select(.cluster == "persona") | {id, title}'
```

## Find personas that link to a specific play

```bash
cargo-ai context graph get \
  | jq -r --arg target "play/funding-triggered-outbound.md" '
      .graph.edges[]
      | select(.target == $target and (.source | startswith("persona/")))
      | .source'
```

## Find dangling cross-references

Links whose target doesn't exist in the repo:

```bash
cargo-ai context graph get | jq '.graph.broken[] | {from: .source, missing: .target, origin}'
```

## Find plays with no proof attached

```bash
cargo-ai context graph get | jq -r '
  .graph as $g
  | $g.nodes[]
  | select(.cluster == "play")
  | .id as $id
  | select([$g.edges[] | select(.source == $id and (.target | startswith("proof/")))] | length == 0)
  | $id
'
```

## Find objections with no proof point

Same pattern as plays, scoped to objections:

```bash
cargo-ai context graph get | jq '
  .graph as $g
  | $g.nodes[]
  | select(.cluster == "objection")
  | .id as $id
  | select([$g.edges[] | select(.source == $id and (.target | startswith("proof/")))] | length == 0)
  | {id, title}
'
```

## Show inbound references to a node

Which files link to `proof/14-day-time-to-first-workflow.md`?

```bash
cargo-ai context graph get | jq -r --arg target "proof/14-day-time-to-first-workflow.md" '
  .graph.edges[]
  | select(.target == $target)
  | .source
'
```

## Audit frontmatter completeness

The graph does not return raw frontmatter: `title` falls back to the filename and `summary` falls back to `description`, then the first paragraph. Nodes whose `title` equals the bare filename, or that have no `summary`, are the ones likely missing frontmatter:

```bash
cargo-ai context graph get | jq -r '
  .graph.nodes[]
  | select(.title == (.id | split("/") | last | sub("\\.(md|mdx|ya?ml)$"; "")) or (.summary // "") == "")
  | .id
'
```

## Snapshot the graph to disk

Useful before a bulk edit so you can diff before/after:

```bash
cargo-ai context graph get > /tmp/graph.before.json
# ...make edits via context runtime write/edit...
cargo-ai context graph get > /tmp/graph.after.json
diff <(jq -r '.graph.nodes[].id' /tmp/graph.before.json | sort) \
     <(jq -r '.graph.nodes[].id' /tmp/graph.after.json | sort)
```
