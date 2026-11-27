# Waterfall strategy — multi-provider fallback chains

A "waterfall" is a chain of provider calls where each step runs only on the rows where the prior step came up empty. It maximizes coverage while minimizing credit spend — cheap providers do the heavy lifting, premium providers fill gaps.

This doc defines the canonical waterfall chains by enrichment goal. Every recipe in this skill that talks about "fallback" or "escalation" follows one of these chains.

## The general pattern

```
1. Run cheapest credible provider on full input set.
2. Filter result: separate hits from misses.
3. Run next-tier provider only on the misses.
4. Repeat until the chain ends or hit-rate justifies stopping.
5. Coalesce: merge results column-by-column, preferring higher-quality sources.
```

Cargo doesn't have a built-in "waterfall" primitive — you implement this as N sequential `action execute-batch` calls with the records pruned between calls. Each step's rows come from `cargo-ai orchestration batch download --uuid <batch-uuid>` (a signed CSV URL: the input columns plus each top-level output key as `cargo_<key>`; failed runs keep only the input columns). `--wait-until-finished` prints the batch object, not the rows.

## Native waterfalls come first

For **email, phone and LinkedIn-from-email**, Cargo already ships the waterfall as a tool: Find email (`email_waterfall`), Find phone (`phone_waterfall`), Find LinkedIn URL from email (`find_linkedin_url_from_personal_email`), Find work email from personal email (`work_email_from_personal`) and Verify email (`email_validator`). Run those, addressed as `{"kind":"tool","templateSlug":"<slug>"}`; they are maintained and extended by Cargo and cover far more than a ladder an agent assembles. The hand-built chains below for those goals apply only when the user names a provider, explicitly asks for the cheapest path, the tool is missing, or a row lacks the tool's input. Say which. Rule: [`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default).

## Chain — Find email

Default: one call to the Find email tool (`email_waterfall`, 1.1–4 per hit), which already walks several providers and verifies each address. Its output needs no step 5.

The hand-built chain, **exception only**, for a verifiable email given name + company (or LinkedIn):

```
1. FullEnrich.findEmail (1 cred)              ← first rung when an exception applies
2. hunter.findEmail (0.5 cred)                ← different underlying source
3. peopleDataLabs.enrichPerson (3 cred)       ← heavyweight backfill (also returns email)
4. icypeas.findEmail (0.1 cred)               ← cheap last resort
```

Then **always**:

```
5. Verify email tool, email_validator (0.2)   ← verify every found email before use
   (waterfall.verifyEmail, 0.1, when the user asked for the cheapest path)
```

Don't skip step 5 on a hand-built chain — email finders return catch-all addresses that look valid but bounce.

**Verification hard rules:**

- A provider's own `verified` / `valid` flag is the provider grading its own homework. Always validate with an independent step (the Verify email tool) regardless of what the finder claimed.
- Ship a **catch-all** email only when a second, independent finder returned the exact same address. One source + catch-all = "unverified", flag it as such.

**Example hand-built flow (200 contacts, user asked to use FullEnrich):**

```bash
# Step 1 — try FullEnrich on all 200
... > /tmp/step1.json
# Hits: 140 found, 60 missed.

# Step 2 — hunter on the 60 missed
... > /tmp/step2.json
# Hits: 30 of 60 found.

# Step 3 — peopleDataLabs on the 30 still missed
... > /tmp/step3.json
# Hits: 18 of 30. Total: 188/200 = 94% hit rate.

# Stop the chain — running step 4 (icypeas) on 12 rows isn't worth credits
# (60% of those will probably miss too).

# Verify all 188 emails
... > /tmp/verified.json
```

## Chain — Enrich company firmographics

Goal: get firmographics (industry, size, geo, founded, …) for a company given domain.

```
1. aiArk.enrichCompany (0.01 cred)             ← default; domain or LinkedIn URL
2. companyEnrich.enrichByDomain (0.25 cred)    ← rows aiArk returned thin
3. waterfall.enrichCompany (1 cred)            ← still empty
4. peopleDataLabs.enrichCompany (3 cred)       ← last resort
```

Every rung keys on the domain, so there is no id-resolution step and each escalation runs on the residue of the one above it.

For tech-stack signals, run `builtwith.getDomainSummary` (**free**) across the whole list first, then `builtwith.enrichDomain` (1) or `theirStack.searchTechnologies` (0.5) only on the rows the free summary left ambiguous.

## Chain — Enrich person details

Goal: get title, location, role, employment for a person given name + company (or email or LinkedIn).

```
1. aiArk.enrichPerson (0.1 cred)      ← default profile when a LinkedIn URL is in hand (email still comes from Find email)
2. waterfall.enrichContact (2 cred)   ← no URL, or aiArk came back empty
3. apolloio.enrichPerson (1 cred)     ← niche coverage on the residue
4. peopleDataLabs.enrichPerson (3 cred)
```

## Chain — LinkedIn URL resolution

Goal: get the correct LinkedIn URL for a person given name + company.

```
1. linkedin.findProfileUrl (0.25 cred)
2. linkedin.enrichProfile on candidate (0.25 cred)   ← validation step (mandatory)
```

Holding a personal email instead of name + company? Run the Find LinkedIn URL from email tool (`find_linkedin_url_from_personal_email`, 1–3) and validate its answer the same way; `FullEnrich.reverseEmailLookup` (1) is the exception-only fallback.

See [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md) for the strict-validation pattern. Don't skip step 2 — false positive rate is high without validation.

## Chain — Phone number

Goal: get a phone number for a person, on explicit request only.

Default: the Find phone tool (`phone_waterfall`, 3–7, `linkedinUrl` in). Resolve the LinkedIn URL first when a row lacks it.

The hand-built chain, **exception only** (named provider, cheapest path asked for, or no LinkedIn URL obtainable):

```
1. prospeo.findPhone (3 cred)               ← cheapest landline/DID (aiArk.findMobilePhone, 0.5, goes first on a cheapest-path request with a LinkedIn URL)
2. FullEnrich.findPhone (6 cred)            ← better hit rate
3. waterfall.findPhone (7 cred)             ← multi-source last resort
```

Phone lookup is expensive (3–7 credits/record). Run only on qualified leads, not on the full prospect list.

## Cost discipline

The mandatory spend rules (pilot → approval gate, per-run receipts, 1.4×N over-provision, count-first sizing) live in [`cost-discipline.md`](cost-discipline.md) — they apply to every chain here. Waterfall-specific rules on top:

1. **Filter aggressively between steps**: don't pass rows that already have the field populated.
2. **Stop early**: if hit rate after step 2 is > 90%, the marginal cost of step 3 may not be worth it — the remaining misses are mostly rows no provider covers (coverage is a property of the company).
3. **Demote dynamically**: if a provider misses on the first ~10 rows of a batch, move it later in the chain for the rest of that batch — its coverage doesn't match this segment.
4. **Track credit spend**: after each step, run `cargo-ai billing usage get-metrics` and fold the numbers into the run receipt.

## Coalesce — merge results from the chain

After running 2–3 steps of a chain, you have one `batch download` CSV per step with partial results. Carry a stable key (e.g. `id`) in every step's `--records` so the rows can be joined, convert each CSV to a JSON array of row objects, then merge by that key:

```bash
jq -s '
  # Combine three step files (arrays of rows), later files win per field
  flatten
  | group_by(.id)
  | map(reduce .[] as $r ({}; . * $r))
' /tmp/step1.json /tmp/step2.json /tmp/step3.json > /tmp/coalesced.json
```

This pattern (group → reduce with object-merge) takes the value from the last file that has the field, so a later step's empty CSV cell overwrites an earlier hit: drop empty cells (or order the files lowest-quality first) before merging. Adjust the source-priority order to match the per-column quality preferences in [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md).
