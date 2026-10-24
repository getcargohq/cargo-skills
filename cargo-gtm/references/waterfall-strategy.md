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

**For email, phone and verification the waterfall already exists.** Every workspace is seeded with read-only preset tools that run the chain server-side, one row per record: see [Start here](#start-here-the-workspaces-preset-tools) below. Use them first. Build the chain by hand only for the other goals on this page, or when the preset does not fit (see [When to hand-roll instead](#when-to-hand-roll-instead)).

A hand-rolled chain is N sequential `action execute-batch` calls with the records pruned between calls. Each step's rows come from `cargo-ai orchestration batch download --uuid <batch-uuid>` (a signed CSV URL: the input columns plus each top-level output key as `cargo_<key>`; failed runs keep only the input columns). `--wait-until-finished` prints the batch object, not the rows.

## Start here: the workspace's preset tools

Every workspace carries a **Cargo Tools** folder of read-only tools that Cargo creates and keeps in sync. Three of them are the email and phone waterfalls this page used to tell you to build:

| Tool (exact name) | What runs inside, in order | Inputs (camelCase, exactly) | Output today | Declared credits per row |
|---|---|---|---|---|
| **Find email** | `apolloio.enrichPerson` → `FullEnrich.findEmail` → `findyMail.findEmail` → `peopleDataLabs.enrichPerson` → `waterfall.enrichContact`, each found address checked by `zeroBounce.verifyEmail` before the chain stops | `firstName` + `lastName` + `companyDomain`, **or** `linkedinUrl`; optional `returns_catchalls` (boolean) | `{email}` | 1.1 to 4 |
| **Find phone** | `FullEnrich.findPhone` → `findyMail.findPhone` → `waterfall.findPhone` → `peopleDataLabs.enrichPerson` | `linkedinUrl` (a `linkedin.com/in/` profile URL, required) | `{phone}` | 3 to 7 |
| **Verify email** | `neverBounce.verifyEmail` | `email` | `{status, is_safe}` (`is_safe` is `status == "valid"`) | 0.2 |

The same folder holds **Find work email from LinkedIn URL** (`linkedinUrl` in, `{email}` out, no verification step inside) and **Find work email from personal email**. **Enrich person** and **Enrich company** are there too, but each calls a single provider, so person and company enrichment still follow the chains further down this page.

### The first move

1. **Find the tool's `toolUuid`.** It differs per workspace, so look it up every time:

   ```bash
   cargo-ai orchestration action list "find email" --kind tool
   # several rows can match (copies, custom tools); take the read-only preset:
   cargo-ai orchestration tool list | jq -r '.tools[] | select(.isReadOnly and .name == "Find email") | .uuid'
   ```

   On the MCP server: `search_actions` with `{"query":"find email","kind":"tool"}`, and use the `action` object it returns. A signed-out session or the public MCP endpoint lists no tools, because tools belong to a workspace.

2. **Sample 10 to 20 rows**, the same gate as any paid batch ([`cost-discipline.md`](cost-discipline.md)):

   ```bash
   cargo-ai orchestration action execute-batch \
     --action '{"kind":"tool","toolUuid":"<toolUuid>"}' \
     --records '[{"firstName":"Ada","lastName":"Lovelace","companyDomain":"example.com"},{"linkedinUrl":"https://www.linkedin.com/in/ada"}]' \
     --limit 20 --wait-until-finished
   ```

   MCP: `execute_action_batch` with the same `{"kind":"tool","toolUuid":"<toolUuid>"}` and records.

3. **Read the results and the receipt.** `cargo-ai orchestration batch download --uuid <batch-uuid>` gives the CSV, with the address in `cargo_email` (`cargo_phone` for Find phone, `cargo_status` and `cargo_is_safe` for Verify email); MCP `get_batch` returns the same rows. Report the hit rate and the credits actually spent, then ask for approval of the full volume.

4. **Run the full batch** on the approved rows, minus any that already hold the field.

### What it returns, and what it costs

- **The address and nothing else.** Find email returns `{email}`: no verification status, no catch-all flag, no record of which provider found it. With `returns_catchalls` unset, every address it returns passed `zeroBounce` as `valid`, so there is no separate verify step to run on it. With `returns_catchalls: true` it may also return a catch-all address, and the output does not say which ones are; run **Verify email** on those if the status matters.
- **A miss is roughly free.** The tool stops at the first verified hit, a provider rung generally bills only when it finds something, and verification runs only on a found address. So a row nobody covers costs close to nothing, and a row the first rung settles costs about 1.1. Treat this as an estimate until the sample's receipt confirms it for your segment.
- **Rows with bad inputs exit empty and free.** The tool checks its inputs before calling anyone: a domain that does not parse, a first or last name under two characters, or a LinkedIn URL that is not a `/in/` profile ends the run with no email.
- **Input names are not checked.** A tool run drops a key it does not know without an error, so `linkedin_url` or `first_name` is silently ignored and the row exits empty. Use the camelCase names in the table.
- **Find phone does not verify** a number before returning it.

### When to hand-roll instead

- The preset is missing from the workspace, or someone deleted it.
- The user wants a different provider order or a provider the preset does not call, such as `aiArk`, `hunter`, `icypeas` or `prospeo`.
- The user needs per-row provenance or a verification status the preset does not return.

Then use the chains below, and keep the verification rules.

## Chain — Find email

Goal: get a verifiable email for a person given name + company (or LinkedIn). Start with the **Find email** preset tool above; build this chain only when it does not fit.

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

**Verification hard rules:**

- A provider's own `verified` / `valid` flag is the provider grading its own homework. Always validate with an independent step (`waterfall.verifyEmail`) regardless of what the finder claimed.
- Ship a **catch-all** email only when a second, independent finder returned the exact same address. One source + catch-all = "unverified", flag it as such.

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
1. aiArk.enrichPerson (0.1 cred)      ← default when a LinkedIn URL is in hand
2. waterfall.enrichContact (2 cred)   ← no URL, or aiArk came back empty
3. apolloio.enrichPerson (1 cred)     ← niche coverage on the residue
4. peopleDataLabs.enrichPerson (3 cred)
```

## Chain — LinkedIn URL resolution

Goal: get the correct LinkedIn URL for a person given name + company.

```
1. linkedin.findProfileUrl (0.25 cred)
2. linkedin.enrichProfile on candidate (0.25 cred)   ← validation step (mandatory)
3. FullEnrich.reverseEmailLookup (1 cred)            ← only if email available
```

See [`../recipes/linkedin-url-lookup.md`](../recipes/linkedin-url-lookup.md) for the strict-validation pattern. Don't skip step 2 — false positive rate is high without validation.

## Chain — Phone number

Goal: get a phone number for a person. Start with the **Find phone** preset tool above; build this chain only when it does not fit.

```
1. prospeo.findPhone (3 cred)               ← cheapest landline/DID (aiArk.findMobilePhone, 0.5, goes first when a LinkedIn URL is in hand)
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
