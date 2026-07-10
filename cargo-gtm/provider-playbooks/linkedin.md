---
provider: linkedin
category: sourcing + enrichment
last-reviewed: 2026-07-09
---

# linkedin

LinkedIn page-level enrichment, URL resolution, and activity signals. **Cheapest LinkedIn-anchored enrichment in the catalog** — `enrichProfile` / `enrichCompany` at 0.25, and `findProfileUrl` (0.25) is the **default for the LinkedIn-URL lookup stage** ([`../references/stage-action-map.md`](../references/stage-action-map.md)). Where `salesNavigator` searches at scale, `linkedin` resolves and deepens **one known page at a time** — plus post/job/activity extraction for signals and a set of identity-driven engagement actions.

## Credits-based actions

### Enrichment & resolution

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `enrichProfile` | 0.25 | `linkedinUrl` | Profile URL → person details. Cheapest person enrich in the catalog; also the validation step after `findProfileUrl`. |
| `findProfileUrl` | 0.25 | `fullName` (required), `companyName` | Name → LinkedIn profile URL. **Default LinkedIn resolver** — see [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md). |
| `enrichProfileFromName` | 0.5 | `name`, `companyName` (both required) | Name+company → profile details in one call. |
| `enrichCompany` | 0.25 | `linkedinUrl` | Company page URL → firmographics. |
| `enrichCompanyFromDomain` | 0.5 | `domain` | Domain → LinkedIn-anchored company details. |
| `enrichJob` | 0.25 | `linkedinUrl` | Job posting URL → job details. |
| `extractCompanyEmployeesInsights` | 0.25 | `linkedinUrl`, `affiliates` | Headcount by function, location, and seniority for a company page. |
| `extractSimilarCompanies` | 0.25 | `linkedinUrl` | LinkedIn's "similar companies" recommendations — cheap lookalike seed. |
| `findCustomHeadcount` | 0.5 | `companyLinkedinUrl`, `keywords`, `includeSubsidiaries` (all required) | Count employees matching a keyword (e.g. "how many SDRs?"). |

### Posts, jobs & activity (signals)

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `searchPosts` | 0.25 | `searchKeywords, sortBy, datePosted, contentType, fromMemberUrns, fromCompanyIds, mentioningMemberUrns, mentioningCompanyIds, authorIndustry, authorKeyword` | Find posts by keyword / author / mention. |
| `searchPostComments` | 0.05/item | `urn`, `sortBy` (required) | Commenters on a post → engagement-based sourcing. |
| `searchPostReactions` | 0.05/item | `urn`, `type` (required) | Reactors on a post. |
| `extractProfilePostActivity` | 0.05/item | `linkedinProfileUrl` | Posts a person published — personalization fodder. |
| `extractProfileCommentActivity` | 0.05/item | `linkedinProfileUrl` | Posts a person commented on. |
| `extractProfileReactionActivity` | 0.05/item | `linkedinProfileUrl` | Posts a person reacted to. |
| `searchJobs` | 0.5 | `keywords, geoCodes, datePosted, experienceLevels, companyIds, titleIds, jobTypes, onsiteRemote, functions, industryCodes, sortBy, easyApply, under10Applicants` | Job-posting search — hiring-intent alternative to `theirStack.searchJobs` (0.5). |
| `extractEventAttendees` | 0.05/item | `linkedinEventUrl`, `identityIds` (required) | Attendees of a LinkedIn event → event-based sourcing. |
| `extractProfileViewers` | 0.05/item | `identityIds`, `limit` (required) | Who viewed **your** connected identity's profile recently. |

### Engagement (identity-driven — acts as a real LinkedIn user)

| Action | Cost | Inputs | Use for |
|---|---|---|---|
| `visitProfile` | 0.25 | `linkedinProfileUrl`, `identityIds` | Visit a profile (shows up in their notifications). |
| `followProfile` | 0.25 | `linkedinProfileUrl`, `unfollow`, `identityIds` | Follow / unfollow a profile. |
| `connectProfile` | 0.25 | `linkedinProfileUrl`, `message`, `identityIds` | Send a connection request. |
| `likePost` | 0.25 | `linkedinPostUrl`, `interactionType`, `identityIds` | React to a post. |
| `commentPost` | 0.25 | `linkedinPostUrl`, `comment`, `identityIds` | Comment on a post. |
| `commentPostComment` | 0.25 | `linkedinCommentUrl`, `comment`, `identityIds` | Reply to a comment. |

`identityIds` ("Linkedin Users") are the workspace's connected LinkedIn identities — discover them via the `listIdentityIds` autocomplete on `connection integration get linkedin`.

## What it's for

- ✅ **LinkedIn URL resolution** — `findProfileUrl` (0.25) then `enrichProfile` (0.25) as the mandatory validation gate ([`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)).
- ✅ **Cheap page-level enrichment** — 0.25 vs `cargo.enrichProspectDetails` (2) when LinkedIn-anchored details are sufficient and you already have the URL ([`../references/alternatives.md`](../references/alternatives.md)).
- ✅ **Engagement-based sourcing** — commenters/reactors on a competitor-topic post, event attendees: warm pools no search filter can express.
- ✅ **Personalization signal** — a lead's recent post/comment/reaction activity feeds openers (SIGNAL stage before outreach).
- ❌ **At-scale search** — no people/company search here; that's `salesNavigator.searchLeads` (0.02) / `searchAccounts` (0.05).

## Patterns

### Pattern A — Resolve + validate a LinkedIn URL

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"findProfileUrl","config":{}}' \
  --records '[{"fullName":"Alice Smith","companyName":"Acme"},{"fullName":"Bob Jones","companyName":"Globex"}]' \
  --wait-until-finished
```

Then run `enrichProfile` on each returned URL and cross-check name + company — the unvalidated hit rate is ~50%, validated ~70% ([`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md)). `fullName` is the only required field; always pass `companyName` when known — it improves matching.

### Pattern B — Post engagement → warm source pool

```bash
# 1. Find the post(s)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"searchPosts","config":{}}' \
  --data '{"searchKeywords":"revenue operations benchmarks","sortBy":"Latest","datePosted":"Past week"}' \
  --wait-until-finished
# 2. Pull who engaged (billed per item — cap the pull)
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"searchPostReactions","config":{}}' \
  --data '{"urn":"7181234567890123456","type":"ALL"}' \
  --wait-until-finished
```

`searchPosts` enums: `sortBy` = `Top match`/`Latest`; `datePosted` = `Past 24 hours`/`Past week`/`Past month`/`past-year`/`past-2y`/`past-3y`/`anytime`; `fromCompanyIds`/`mentioningCompanyIds` only accept company **IDs**, `fromMemberUrns`/`mentioningMemberUrns` take member URNs.

### Pattern C — Company deep-dive

```bash
cargo-ai orchestration action execute \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"extractCompanyEmployeesInsights","config":{}}' \
  --data '{"linkedinUrl":"https://linkedin.com/company/acme","affiliates":false}' \
  --wait-until-finished
```

Chain with `extractSimilarCompanies` (0.25) for a cheap lookalike seed list, or `findCustomHeadcount` (0.5) for "how many people matching *keyword* work there".

## Common pitfalls

- **Profile URL shape is enforced.** `linkedinProfileUrl` must start with `linkedin.com/in/`, `/pub/`, `/sales/people/`, or `/sales/lead/`. Company URLs are `/company/...`, jobs `/jobs/view/...`, events `/events/...` — pass the wrong shape and the call fails.
- **Per-item billing on activity pulls.** Comments, reactions, event attendees, profile activity, and viewers bill **0.05 per returned item** — a viral post can have thousands of reactions. Size first, then pull the approved scope ([`../references/cost-discipline.md`](../references/cost-discipline.md)).
- **`searchJobs` filter IDs are LinkedIn enums.** `geoCodes`, `titleIds`, `industryCodes`, `experienceLevels`, `functions`, `jobTypes`, `onsiteRemote` come from the integration's autocompletes (`listTitles`, `listIndustries`, `listExperienceLevels`, …) — not free-text strings.
- **Rate limit: 250 calls/minute** (spread) — relevant on large validation batches.

## Anti-patterns

- **`enrichProfileFromName` instead of the two-step.** Same 0.5 total as `findProfileUrl` + `enrichProfile`, but the two-step gives you the validation gate between resolution and enrichment — the recipe's mandatory pattern.
- **Engagement actions as a bulk channel.** `connectProfile` / `commentPost` act **as a real member identity** — batch-blasting them burns the identity. Gate to qualified, personalized touches only.
- **`extractProfileViewers` on a lead's URL.** It only works on your own connected identities (`identityIds` + `limit` required) — it is not a lead-enrichment action.

## Position in the waterfall

- `findProfileUrl` + `enrichProfile` — **default for the LinkedIn-URL lookup stage**; `FullEnrich.reverseEmailLookup` (2) only when all you have is an email.
- `enrichProfile` / `enrichCompany` — **first rung of ENRICH** when the input is a LinkedIn URL; escalate to `cargo` native, then `waterfall`, then `peopleDataLabs` for non-LinkedIn fields.
- Posts / jobs / activity extraction — **SIGNAL stage**: engagement pools and personalization inputs; `searchJobs` sits beside `theirStack.searchJobs` (both 0.5) for hiring intent.
- Engagement actions — post-VERIFY activation touches, outside the sourcing spine.

## Action shape

`{"kind":"connector","integrationSlug":"linkedin","actionSlug":"<slug>","config":{}}`. **No `connectorUuid` in `config`.**
