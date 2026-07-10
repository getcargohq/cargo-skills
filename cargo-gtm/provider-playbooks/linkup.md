---
provider: linkup
category: search (web research)
last-reviewed: 2026-07-09
---

# linkup (Linkup)

Natural-language web research with synthesized answers. Two actions: `search` (0.5 standard / **2 deep**) returns search results for a question, and `instruct` (flat 1) returns either a **sourced answer** or a **structured object matching a JSON schema you supply**. It sits above `firecrawl.search` (0.05, raw SERP + scrape) and alongside `serper.search` (1, Google results): pick linkup when you want an *answer* — especially a schema-shaped one you can write straight into a column — rather than pages to parse. See [`../references/stage-action-map.md`](../references/stage-action-map.md), Web research.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `search` | 0.5 (`depth: "standard"`) / 2 (`depth: "deep"`) | `q`, `depth` | Web search for a natural-language question; deep = agentic multi-step search. |
| `instruct` | 1 (flat, either depth) | `q`, `depth`, `outputType` (`sourcedAnswer` \| `structured`), `structuredOutputSchema` (required when structured) | Direct answer with source links, or a custom-schema JSON object. |

## What it's for

- ✅ **Structured per-record research** — `instruct` with `outputType: "structured"` turns "what's this company's pricing model?" into a typed object per row, no parsing step.
- ✅ **Sourced answers** — `outputType: "sourcedAnswer"` returns the answer plus source links for auditable enrichment.
- ✅ **Deep questions on a budget** — `instruct` costs a flat 1 even at `depth: "deep"`, *cheaper* than `search` deep (2). If you want a deep answer rather than deep results, `instruct` wins on price.
- ❌ **Plain SERP lookups** — `firecrawl.search` (0.05) is 10× cheaper when you just need result URLs to scrape.
- ❌ **Structured-data lookups a provider already covers** — firmographics, tech stack, emails: the dedicated providers are cheaper and more reliable than web research.

## Patterns

### Pattern A — Structured extraction per record

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkup","actionSlug":"instruct","config":{}}' \
  --data '{
    "q": "What pricing model does acme.com use for its main product?",
    "depth": "standard",
    "outputType": "structured",
    "structuredOutputSchema": {
      "type": "object",
      "properties": {
        "pricingModel": {"type": "string", "description": "e.g. per-seat, usage-based, flat"},
        "hasFreeTier": {"type": "boolean"}
      }
    }
  }' \
  --wait-until-finished
```

The schema root **must** be `type: "object"`. Keep it small — a few well-described fields extract far better than a sprawling one.

### Pattern B — Quick sourced answer

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkup","actionSlug":"search","config":{}}' \
  --data '{"q": "Who is the current CTO of Acme Corp?", "depth": "standard"}' \
  --wait-until-finished
```

Escalate to `depth: "deep"` only when standard came back empty or shallow — deep quadruples `search`'s cost (0.5 → 2).

## Common pitfalls

- **`depth` is required** on both actions — there's no implicit default in the call; pass `"standard"` explicitly and escalate deliberately.
- **`structuredOutputSchema` is required when `outputType` is `"structured"`** and its root must be an object — a bare string/array schema is rejected.
- **Deep-by-default burns credits.** Deep `search` is 4× standard. Pilot on standard; and if the question needs deep reasoning, `instruct` (flat 1) is the cheaper deep surface.
- **Questions, not keywords.** `q` is a natural-language question; keyword-stuffed queries degrade the synthesized answer.

## Position in the waterfall

**RESEARCH / fallback SOURCE.** Web research chain: `firecrawl` (0.05) for raw pages → **linkup** (0.5–2) for synthesized/structured answers → `serper` (1) for Google-shaped results. As a people/company source it's a fallback (0.5) when no structured provider has the data — see [`../references/stage-action-map.md`](../references/stage-action-map.md).

## Action shape

`{"kind":"connector","integrationSlug":"linkup","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — structured research feeds personalization fields before the sequencer handoff.
- [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md) — ad-hoc qualitative signals on Closed-Won accounts that no structured provider carries.
