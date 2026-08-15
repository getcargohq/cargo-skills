---
provider: x
category: signal (public social)
last-reviewed: 2026-08-15
---

# x (X / Twitter)

Fourteen actions over public X data: profiles, posts, replies, followers, and search. **Every one costs 0.02**, which makes this the cheapest signal surface in the catalog and the easiest place to run up a bill without noticing, because the temptation is to pull all fourteen.

## Before anything here touches a person

X data is public, which is not the same as usable. [`../references/acceptable-use.md`](../references/acceptable-use.md) binds every action below:

- **A public post is not a lawful basis for outreach.** It can inform *relevance* (why this message, for this person, now), never *basis*. The basis test is unchanged: customers, opted-in contacts, event attendees, or a documented legitimate-interest case.
- **Follower and liker lists are not audiences.** `getFollowers`, `getPostLikers` and `getRetweeters` return people who engaged with content, not people who asked to hear from you. Building a send list from them is the undifferentiated fan-out this skill refuses.
- **Company handles are the safe default.** Reading `@acme`'s posts to understand a company is research. Reading an individual's likes to profile them is not something this skill does.

## Credits-based actions

All fourteen cost 0.02. Four of them are engagement lists and carry a warning rather than a use.

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `getUserPosts` | 0.02 | `handle`, `limit` | **The one worth reaching for.** Recent posts from a company handle: launches, funding, hiring. |
| `getUserProfile` | 0.02 | `handle` | Bio, follower count, links. Confirms a handle is who you think it is. |
| `searchPosts` | 0.02 | `query`, `limit`, `type` | Who is discussing a problem in public. |
| `getPostDetails` | 0.02 | `tweetId` | One post, when a signal pointed at it. |
| `getUserReplies` | 0.02 | `handle`, `limit` | What a company answers in public. |
| `getPostComments` | 0.02 | `tweetId`, `limit` | Reaction to an announcement. |
| `getQuoteTweets` | 0.02 | `tweetId`, `limit` | The same, one step out. |
| `getUserMedia` | 0.02 | `handle`, `limit` | Images and video from a handle. |
| `getFollowing` | 0.02 | `handle`, `limit` | Who a handle follows. |
| `searchPeople` | 0.02 | `query`, `limit` | X accounts by query. **Not a contact source.** |
| `getFollowers` | 0.02 | `handle`, `limit` | **See the anti-patterns.** |
| `getUserLikes` | 0.02 | `handle`, `limit` | **See the anti-patterns.** |
| `getRetweeters` | 0.02 | `tweetId`, `limit` | **See the anti-patterns.** |
| `getPostLikers` | 0.02 | `tweetId`, `limit` | **See the anti-patterns.** |

Everything except `getUserProfile` and `getPostDetails` also takes a required `limit`.

## What it's for

- ✅ **Company announcement monitoring** — `getUserPosts` on a company handle is a launch, funding or hiring signal at 0.02, dated and public.
- ✅ **A personalization line that is actually recent** — one `getUserPosts` call beats an LLM inventing what a company cares about.
- ✅ **Topic listening** — `searchPosts` for a problem statement, to find companies discussing it in public.
- ❌ **Finding contacts** — `searchPeople` returns X accounts, not B2B records. The contact stack is in [`../references/stage-action-map.md`](../references/stage-action-map.md).
- ❌ **Firmographics** — a bio is not a headcount.
- ❌ **Audience building** — see the gate above.

## Patterns

### Pattern A — Company signal at 0.02

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"x","actionSlug":"getUserPosts","config":{}}' \
  --records '[{"handle":"acme","limit":20}]' \
  --wait-until-finished
```

One call per account. Keep `limit` low: twenty recent posts is more than enough to spot an announcement, and nobody reads two hundred.

### Pattern B — Who is talking about the problem

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"x","actionSlug":"searchPosts","config":{}}' \
  --data '{"query":"\"data enrichment\" pricing frustrating","type":"Latest","limit":50}' \
  --wait-until-finished
```

Resolve the resulting accounts to companies and enrich from there. The search output is a starting point for research, not a list.

## Common pitfalls

- **Pulling all fourteen actions per account.** At 0.02 each that is 0.28 a row before any enrichment, and twelve of the fourteen answer questions nobody asked.
- **Large `limit` values by default.** `limit` is required on most actions precisely so the caller decides. A forgotten large default is where the cheap provider stops being cheap.
- **Reading engagement as intent.** Someone liking a competitor's post is not in-market. Treat it as a research prompt, not a score input.
- **Handles that are not the company.** Squatted and parody handles resolve fine and return confident nonsense. Confirm the handle from the company's own site before trusting a signal from it.

## Anti-patterns

- **Follower harvesting.** `getFollowers` with a large `limit` across competitor accounts is list-building from people who never opted in. Refused by [`../references/acceptable-use.md`](../references/acceptable-use.md), and the cheap per-call price is exactly what makes it tempting.
- **`getUserLikes` on an individual.** Profiling a person's likes is not GTM research and is not a use this skill supports.
- **Per-row social pulls across a whole segment.** 0.02 a row looks free until it is five actions across 5,000 rows (500 credits) for signals that move a handful of them.

## Position in the waterfall

- **A signal rung, not a data rung.** It sits alongside `theirStack.searchJobs` (0.5, hiring intent) and `cargo.enrichBusinessLinkedinPosts` (2, company posts) and undercuts both on price for the narrow question of what a company said publicly.
- Never in front of the sourcing or contact stacks. It informs a message; it does not build a list.

## Action shape

`{"kind":"connector","integrationSlug":"x","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.** Per-row handles go in `--records`, search filters in `--data`.

## Pairs with

- [`../recipes/outreach-activation.md`](../recipes/outreach-activation.md) — the personalization step, where a dated public post is the strongest relevance input available.
- [`../recipes/account-expansion.md`](../recipes/account-expansion.md) — announcement monitoring on existing accounts.

## Recurring use

- **Cap `limit` in the node, not in the prompt.** A recurring pull whose limit can drift has a bill that drifts with it.
- **Signal-triggered beats scheduled.** Re-pulling every account's posts nightly re-bills accounts that posted nothing. Gate on rows whose last-checked timestamp is older than the interval, and prefer a smaller set checked often over a large set checked rarely.
- **Never schedule a follower or liker pull.** There is no version of that on a cron that stays inside the acceptable-use gate.
