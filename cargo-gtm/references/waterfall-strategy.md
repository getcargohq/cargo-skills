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

Cargo doesn't have a built-in "waterfall" primitive — you implement this as N sequential `action execute-batch` calls with the records pruned between calls.

## Chain — Find email

Goal: get a verifiable email for a person given name + company (or LinkedIn).

```
1. FullEnrich.findEmail (1 cred)              ← default; best hit rate
2. hunter.findEmail (0.5 cred)                ← different underlying source
3. peopleDataLabs.enrichPerson (3 cred)       ← heavyweight backfill (also returns email)
4. icypeas.findEmail (0.1 cred)               ← cheap last resort
```

Then **always**:

```
5. waterfall.verifyEmail (0.1 cred)           ← verify every found email before use
```

Don't skip step 5 — email finders return catch-all addresses that look valid but bounce.

**Example flow (200 contacts):**

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
1. cargo.matchBusiness → cargo.enrichBusinessFirmographics (0.5 + 0.5 cred)  ← default
2. waterfall.enrichCompany (1 cred)                                          ← unmatched cargo
3. peopleDataLabs.enrichCompany (3 cred)                                     ← still unmatched
```

For tech-stack signals, run `cargo.enrichBusinessTechnographics` (1) on matched companies; fall back to `theirStack.searchTechnologies` (0.5) for unmatched.

## Chain — Enrich person details

Goal: get title, location, role, employment for a person given name + company (or email or LinkedIn).

```
1. cargo.matchProspect → cargo.enrichProspectDetails (0.5 + 2 cred)  ← default
2. waterfall.enrichContact (2 cred)                                  ← unmatched cargo
3. peopleDataLabs.enrichPerson (3 cred)                              ← still unmatched
```

## Chain — LinkedIn URL resolution

Goal: get the correct LinkedIn URL for a person given name + company.

```
1. linkedin.findProfileUrl (0.25 cred)
2. linkedin.enrichProfile on candidate (0.25 cred)   ← validation step (mandatory)
3. FullEnrich.reverseEmailLookup (2 cred)            ← only if email available
```

See [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md) for the strict-validation pattern. Don't skip step 2 — false positive rate is high without validation.

## Chain — Phone number

Goal: get a phone number for a person.

```
1. prospeo.findPhone (3 cred)               ← cheapest
2. FullEnrich.findPhone (6 cred)            ← better hit rate
3. waterfall.findPhone (7 cred)             ← multi-source last resort
```

Phone lookup is expensive (3–7 credits/record). Run only on qualified leads, not on the full prospect list.

## Cost discipline

The point of a waterfall is to **not** run every provider on every record. Always:

1. **Sample first**: run step 1 on 10 records, validate the data is what you want.
2. **Filter aggressively between steps**: don't pass rows that already have the field populated.
3. **Stop early**: if hit rate after step 2 is > 90%, the marginal cost of step 3 may not be worth it.
4. **Track credit spend**: after each step, run `cargo-ai billing usage get-metrics` to confirm cost matches expectations.

## Coalesce — merge results from the chain

After running 2–3 steps of a chain, you have multiple files with partial results. Merge by record:

```bash
jq -s '
  # Combine three step files, preferring higher-quality sources
  [.[0].results, .[1].results, .[2].results]
  | flatten
  | group_by(.input.recordId)
  | map(reduce .[] as $r ({}; . * $r))
' /tmp/step1.json /tmp/step2.json /tmp/step3.json > /tmp/coalesced.json
```

This pattern (group → reduce with object-merge) takes the latest non-null value per field. Adjust the source-priority order to match the per-column quality preferences in [`../guides/enriching-and-researching.md`](../guides/enriching-and-researching.md).
