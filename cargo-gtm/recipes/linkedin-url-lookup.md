# Recipe — LinkedIn URL lookup with strict identity validation

**Use when**: the user has a name and company (or email) and needs the correct LinkedIn profile URL.

**Trigger phrases**: "Find the LinkedIn for John Smith at Acme.", "Get LinkedIn URLs for all the contacts in this list."

## Why this recipe is its own thing

LinkedIn URL resolution is the single most error-prone enrichment task. Common ways naive flows fail:

- Same first+last name, different person, wrong company → false positive.
- Person changed jobs and the resolver returns the old company.
- Resolver returns a partial / contractor profile instead of the FTE.
- Provider has stale data and returns a profile that no longer exists.

The fix is **strict cross-validation**: never trust the first hit. Always verify identity by enriching the candidate URL and checking the company match.

## Recipe

### Step 1 — Resolve a candidate URL

Use `linkedin.findProfileUrl` (0.25 cred) — cheapest credible source.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"findProfileUrl","config":{}}' \
  --records '[
    {"firstName":"John","lastName":"Smith","companyName":"Acme","companyDomain":"acme.com"},
    ...
  ]' \
  --wait-until-finished > /tmp/candidates.json
```

### Step 2 — Validate by enriching the candidate profile

Run `linkedin.enrichProfile` (0.25 cred) on the candidate URL. Compare the returned company against the input company.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"enrichProfile","config":{}}' \
  --records "$(jq -c '[.results[] | {linkedinUrl: .url}]' /tmp/candidates.json)" \
  --wait-until-finished > /tmp/enriched.json
```

### Step 3 — Apply the validation gate

A candidate is **valid** only if **all** of these hold:

1. The enriched profile's `currentCompany.name` or `currentCompany.domain` matches the input company (case-insensitive, allow common variations like "Inc", "GmbH", "Ltd" stripped).
2. The enriched profile's name matches the input first+last name (case-insensitive; allow accents normalized).
3. The profile's `currentRole.startDate` is more recent than 1990 (sanity check that the profile is real and active).

If any check fails, **reject the candidate** rather than guess.

### Step 4 — Fallback for rejected candidates

For rejected candidates, escalate via reverse-email lookup (only useful if you have an email):

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"FullEnrich","actionSlug":"reverseEmailLookup","config":{}}' \
  --records '[{"email":"john.smith@acme.com"}, ...]' \
  --wait-until-finished > /tmp/reverse.json
```

`reverseEmailLookup` returns LinkedIn URL alongside a company match — apply the same validation gate from step 3.

If that also fails: mark the row as "unresolved" and surface to the user. Do **not** return a low-confidence URL.

### Step 5 — Output the validated set

Only the rows that passed the validation gate get written back. Mark unresolved rows explicitly so the user can decide whether to research manually.

## Credit budget

| Per validated contact | Cost |
|---|---|
| `linkedin.findProfileUrl` | 0.25 |
| `linkedin.enrichProfile` (validation) | 0.25 |
| `FullEnrich.reverseEmailLookup` (fallback, ~30% of cases) | 2 × 0.3 = 0.6 |
| **Effective: ~1.1 cred per resolved contact** (with ~80% resolution rate) |

## Common pitfalls

- **Don't skip step 3.** A first-pass `findProfileUrl` hit rate is ~70%; an unvalidated rate is ~50% (false positives bring it down). Validation gate is mandatory.
- **Don't normalize the company name aggressively.** "Acme Corp" matching "Acme Inc" is fine; "Acme Software" matching "Acme Pharmaceuticals" is not — keep the suffix awareness loose, the noun-phrase strict.
- **Don't accept candidates with `currentCompany == null`.** That usually means the person is between jobs; the LinkedIn profile may be stale or the resolver's match was wrong.

## Action shape rules

`{"kind":"connector","integrationSlug":"linkedin","actionSlug":"findProfileUrl","config":{}}`. **No `connectorUuid` in config.** Per-record data: `firstName`, `lastName`, `companyName`, `companyDomain` (any combination accepted).
