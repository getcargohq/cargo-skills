---
provider: builtwith
category: technographics
last-reviewed: 2026-08-15
---

# builtwith (BuiltWith)

A domain's technology stack. Three actions, and the important thing about them is the price spread: **`getDomainSummary` is free, `enrichDomain` is 1 credit**, and they answer overlapping questions. Reaching for the paid one first is the mistake this playbook exists to prevent.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `getDomainSummary` | **0** | `domain` (required) | The stack summary for a domain. **Free — always run this first.** |
| `enrichDomain` | 1 | `domain` (required) | Full technology detail for a domain, when the summary is not enough. |
| `findWebsitesByTechnology` | not credits-priced | `technology` (required), `otherTechnologies`, `country`, `since`, `includeMeta`, `includeHistorical`, `spend` | Reverse lookup: the sites running a given technology. |

`getDomainSummary` returning 0 is not a rounding artifact. It is free, so there is no batch size at which running it first costs anything.

## What it's for

- ✅ **Qualifying a known domain's stack** — start at `getDomainSummary` (free) and escalate to `enrichDomain` (1) only for the rows where the summary did not answer the question.
- ✅ **Reverse technology sourcing** — `findWebsitesByTechnology` with `since` and `country` narrows to recent adopters in a geography, which is a much better trigger than "uses X" on its own.
- ❌ **At-scale tech-intent sourcing** — `theirStack.searchCompanies` (0.5) combines tech filters with hiring signals and returns structured company records. builtwith answers about a domain you already have.
- ❌ **Firmographics** — this is a stack lookup. `companyEnrich.enrichByDomain` (0.25) has the size and industry fields.

## Patterns

### Pattern A — Free first, paid on the residue

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"builtwith","actionSlug":"getDomainSummary","config":{}}' \
  --records '[{"domain":"acme.com"}]' \
  --wait-until-finished
```

Run this across the whole list. It costs nothing, and on most qualification questions ("do they run Salesforce?") the summary settles it. Only the unresolved rows go to `enrichDomain`.

### Pattern B — Recent adopters in a geography

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"builtwith","actionSlug":"findWebsitesByTechnology","config":{}}' \
  --data '{"technology":"Snowflake","country":"US","since":"2026-01-01","includeMeta":true}' \
  --wait-until-finished
```

`since` is what turns a technology list into a trigger. A company that adopted the tool last quarter is in a buying cycle; one that has run it for six years is not.

## Common pitfalls

- **Paying for `enrichDomain` across a list.** The summary is free and answers most qualification questions. One credit a row over 2,000 rows is 2,000 credits for detail nobody reads.
- **Treating a stack detection as certain.** Technology detection reads public page signals: a tag left behind after a migration still detects. Where the answer decides spend, confirm with a second source before acting.
- **Using `findWebsitesByTechnology` without `since`.** Unbounded, it returns the long tail of everyone who ever installed the tag, which is a list with no intent in it.

## Anti-patterns

- **builtwith as the sourcing rung for tech intent.** `theirStack` combines stack with hiring and returns records ready to enrich; builtwith's reverse lookup is a site list you still have to resolve to companies.
- **Skipping the free action because a paid one is in the recipe.** If a step in a play calls `enrichDomain` unconditionally, the free summary in front of it is a pure saving.

## Position in the waterfall

- `getDomainSummary` — **first rung for any technographic question about a known domain**, ahead of everything on price, since it is free.
- `enrichDomain` (1) — the escalation, behind `cargo.enrichBusinessTechnographics` (1) at the same price. Prefer cargo's when you are already in a `matchBusiness` chain; prefer builtwith's when the domain is all you have.
- `findWebsitesByTechnology` — a sourcing alternative behind `theirStack.searchCompanies` (0.5).

## Action shape

`{"kind":"connector","integrationSlug":"builtwith","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Per-row domains go in `--records`; the reverse-lookup filter goes in `--data`.

## Pairs with

- [`../recipes/tech-intent.md`](../recipes/tech-intent.md) — the sourcing side, where theirStack leads and builtwith confirms.
- [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md) — stack as an ICP criterion.

## Recurring use

- **Stacks change slowly.** A monthly re-run is generous; weekly re-bills rows that have not moved. The free summary is the exception, since re-running it costs nothing.
- **In-play gate:** filter to rows whose stack column is empty or older than the chosen interval, so segment re-evaluation does not re-bill `enrichDomain`.
- **`findWebsitesByTechnology` on a schedule:** move `since` forward with each run so every run returns new adopters rather than re-paying for the same back catalogue.
