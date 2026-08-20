---
provider: brightData
category: social profile scraping (non-LinkedIn)
last-reviewed: 2026-08-20
---

# brightData (Bright Data)

Six actions, all shaped identically: hand one **profile URL**, get that account's public profile back. **0.1 fixed per call**, no per-item component, no search — you must already have the URL.

What it covers is the part of the social web the rest of the catalog doesn't: **Instagram, TikTok, Facebook, and YouTube**. The `linkedin` and `salesNavigator` providers own LinkedIn; the `x` provider owns X. Bright Data is the only way to read the other four.

## Credits-based actions

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `scrapeInstagramProfile` | 0.1 | `url` (required) | Follower count, posts, bio, engagement metrics for an Instagram account. |
| `scrapeTikTokProfile` | 0.1 | `url` (required) | Follower count, likes, videos, engagement metrics for a TikTok account. |
| `scrapeFacebookProfile` | 0.1 | `url` (required) | Name, followers, **contact info, business details** for a Facebook page or profile. |
| `scrapeFacebookPagePosts` | 0.1 | `url` (required) | A page's posts with content, engagement, attachments. |
| `scrapeTwitterProfile` | 0.1 | `url` (required) | X profile — **see the routing note below.** |
| `scrapeYouTubeChannel` | 0.1 | `url` (required) | Subscribers, videos, views, top videos for a channel. |

Rate limited to 100 calls per minute. Caching is supported, so a re-run over the same URLs inside the cache window doesn't re-bill — which matters more here than usual, because a follower count is exactly the field someone re-pulls out of habit.

**Route X to the `x` provider, not here.** `x.getUserProfile` is **0.02** against `scrapeTwitterProfile`'s 0.1 — the same field for a fifth of the price — and `x` also has fourteen actions this provider has no equivalent for (`getUserPosts`, `getFollowers`, `getPostLikers`, `searchPosts`, …). `scrapeTwitterProfile` is the fallback if an `x` call fails on a specific handle, not the default.

## Acceptable use — read before the first call

These are **consumer social platforms**, and [`../references/acceptable-use.md`](../references/acceptable-use.md) §2 refuses consumer and private-individual targeting outright. That rule does not soften because the data is public.

The legitimate use is **accounts that are themselves a business**: a brand's Instagram, a creator whose channel is the company, an agency's page, a marketplace seller. What you learn there is firmographic — scale, category, activity, contact route the business published for inbound.

- ✅ A brand/creator/agency account, read as a **company** record.
- ❌ A named prospect's personal Instagram or TikTok, read as a **person** record. That is personal-life data on a private individual, it is not a lawful basis for B2B outreach, and it does not become one by being enriched into a Contacts model.
- ❌ Fanning any of these across a contact segment. See Anti-patterns.

`scrapeFacebookProfile` returns "contact info" — treat an address harvested this way as **provenance-less** under §5. Business contact details a company published on its own page are usable; anything attached to a personal profile is not.

## What it's for

- ✅ **Creator- and social-commerce ICPs** — when the account *is* the business, follower count and posting cadence are the firmographics. Nothing in the LinkedIn stack sees them.
- ✅ **Qualifying a brand's actual scale** — a DTC company with 4k Instagram followers and one post a quarter is a different account than one with 400k and daily posts, and neither shows up in headcount.
- ✅ **Agency and media prospecting** — YouTube subscriber counts and TikTok engagement as the segmentation axis for accounts that sell attention.
- ❌ **B2B buyer research** — `aiArk.enrichPerson` (0.1, profile + verified email) and `linkedin.enrichProfile` (0.25) are the professional-identity rungs. A B2B buying committee does not live on Instagram.
- ❌ **Firmographics for a normal company** — `aiArk.enrichCompany` (0.01) or `companyEnrich.enrichByDomain` (0.25) return typed fields, 10x cheaper and actually structured.
- ❌ **Finding the URL** — there is no search action. Resolve the handle first (`serper.search` at 0.05, or the company's own site) or you have nothing to pass.

## Patterns

### Pattern A — Score a creator/DTC account list by real reach

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"brightData","actionSlug":"scrapeInstagramProfile","config":{}}' \
  --data '{"url": "https://www.instagram.com/acmebrand/"}' \
  --wait-until-finished
```

0.1 a row. Over a 200-account segment that's 20 credits — pilot 15 first, per [`../references/cost-discipline.md`](../references/cost-discipline.md) §1, because hit rate depends entirely on whether your URL column is canonical.

### Pattern B — Read a page's recent posts for a positioning line

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"brightData","actionSlug":"scrapeFacebookPagePosts","config":{}}' \
  --data '{"url": "https://www.facebook.com/acmebrand"}' \
  --wait-until-finished
```

One call returns the posts; the personalization step reads them. Don't pair it with a per-post enrichment fan-out — the content is already in this response.

## Common pitfalls

- **Non-canonical URLs.** A shortlink, a post URL, or a `?igsh=` tracking suffix is not a profile URL. The call bills and returns nothing useful. Normalize the column before enrolling a batch.
- **Assuming `scrapeTwitterProfile` is the X action.** It is 5x `x.getUserProfile` for less coverage.
- **Reading follower count as intent.** It's a size attribute, not a signal. A buying signal needs a change over time or an event — which means storing the number and re-reading on a cadence, and paying 0.1 each time.
- **Expecting a person.** These return accounts. The mapping from account to a named human with a role is not in the response.

## Anti-patterns

- **Fanning social scrapes across a contact segment.** 0.1 × a Contacts model is real money spent assembling personal-life profiles on private individuals — an acceptable-use refusal (§2), independent of the bill.
- **Using it as a cheaper web scraper.** For an arbitrary page, `parallel.extract` is 0.025/URL and `firecrawl.scrape` is 0.05. Bright Data's price buys platform-specific parsing; on a non-social URL you are paying 4x for nothing.
- **Six calls per account "to be thorough".** 0.6 a row for four platforms most accounts aren't active on. Pick the one platform the ICP actually lives on.

## Position in the waterfall

- **Only rung** for Instagram, TikTok, Facebook, and YouTube. There is no fallback in the catalog — if this fails, the field is unavailable.
- **Last rung for X**, behind the fourteen `x` actions at 0.02.
- **Not a rung at all for B2B person or company enrichment.** It sits beside that stack, for a different kind of account.

## Action shape

`{"kind":"connector","integrationSlug":"brightData","actionSlug":"scrapeInstagramProfile","config":{}}`. **No `connectorUuid` in `config`.** The URL goes in `--data`.

Needs a Bright Data API token on the connector (Settings → connector config; the token is at `https://brightdata.com/cp/setting/users`). It still bills cargo credits — a BYO key does not make the action free.

## Pairs with

- [`../recipes/custom-datapoints.md`](../recipes/custom-datapoints.md) — deciding whether reach metrics belong in the model at all before wiring a column that re-bills.
- [`../recipes/icp-discovery.md`](../recipes/icp-discovery.md) — when the won/lost diff points at social scale rather than headcount.

## Recurring use

- **Every scheduled run re-bills every row.** A follower count refreshed weekly on 200 accounts is 20 credits a week, ~1,000 a year, for a number that moves slowly. Monthly is almost always enough; quarterly usually is.
- **In-play gate:** filter to rows whose reach column is empty or older than the cadence, and to accounts still in an open stage. Refreshing metrics on closed-lost accounts is the most common waste here.
- **Cache window first.** Before scheduling, confirm what the connector's cache returns — a play that re-runs inside the window pays nothing new, and one just outside it pays in full.
