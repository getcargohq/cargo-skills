# Recipe — LinkedIn URL lookup with strict identity validation

**Use when**: the user has a name and company (or email) and needs the correct LinkedIn profile URL.

**Trigger phrases**: "Find the LinkedIn for John Smith at Acme.", "Get LinkedIn URLs for all the contacts in this list.", "Find LinkedIn profiles from these personal emails."

**Holding an email instead of a name + company?** The default is Cargo's native **Find LinkedIn URL from email** tool, a maintained waterfall built for exactly this ([`../SKILL.md`](../SKILL.md#contact-data-cargos-native-tools-first-mandatory-default)). It takes a personal email (gmail and the like) and returns `linkedin_url`; first and last name improve the match. 1 to 3 credits per hit, about 0 per miss.

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"find_linkedin_url_from_personal_email"}' \
  --records '[{"email":"jane.doe@gmail.com","firstName":"Jane","lastName":"Doe"}, ...]' \
  --limit 20 --wait-until-finished
# rows: cargo-ai orchestration batch download --uuid <batch-uuid>; URL in cargo_linkedin_url
```

Then run steps 2 and 3 below on the URLs it returns: validation is just as mandatory here. `FullEnrich.reverseEmailLookup` (1) is the exception-only fallback (the user named it, asked for the cheapest path, or the tool is missing). The rest of this recipe is the name + company path.

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

`execute-batch --wait-until-finished` prints the batch object, not rows. Rows come from `batch download`: a signed CSV of each input record's columns plus every output key as `cargo_<key>`. This helper turns it into JSON for jq:

```bash
batch_rows() {
  curl -fsSL "$(cargo-ai orchestration batch download --uuid "$1" | jq -r .url)" \
    | python3 -c 'import csv,json,sys; json.dump(list(csv.DictReader(sys.stdin)), sys.stdout)'
}

B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"findProfileUrl"}' \
  --records '[
    {"fullName":"John Smith","companyName":"Acme"},
    ...
  ]' \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/candidates.json   # URL in cargo_linkedin_profile_url
```

### Step 2 — Validate by enriching the candidate profile

Run `linkedin.enrichProfile` (0.25 cred) on the candidate URL. Compare the returned company against the input company.

```bash
# fullName and companyName ride along so the gate can compare against them
B=$(cargo-ai orchestration action execute-batch \
  --action '{"kind":"connector","integrationSlug":"linkedin","actionSlug":"enrichProfile"}' \
  --records "$(jq -c '[.[] | select((.cargo_linkedin_profile_url // "") != "")
                       | {linkedinUrl: .cargo_linkedin_profile_url, fullName, companyName}]' /tmp/candidates.json)" \
  --wait-until-finished | jq -r '.batch.uuid')
batch_rows "$B" > /tmp/enriched.json
```

### Step 3 — Apply the validation gate

A candidate is **valid** only if **all** of these hold:

1. The enriched profile's current `company` or `company_domain` (CSV `cargo_company`, `cargo_company_domain`) matches the input company (case-insensitive, allow common variations like "Inc", "GmbH", "Ltd" stripped).
2. The enriched profile's `full_name` matches the input first+last name (case-insensitive; allow accents normalized).
3. The profile's `current_company_join_year` is more recent than 1990 (sanity check that the profile is real and active).

If any check fails, **reject the candidate** rather than guess.

### Step 4 — Fallback for rejected candidates

For rejected candidates, escalate via an email lookup (only useful if you have an email). The default is the native Find LinkedIn URL from email tool:

```bash
cargo-ai orchestration action execute-batch \
  --action '{"kind":"tool","templateSlug":"find_linkedin_url_from_personal_email"}' \
  --records '[{"email":"john.smith@acme.com","firstName":"John","lastName":"Smith"}, ...]' \
  --wait-until-finished > /tmp/reverse.json
```

It returns `linkedin_url` (column `cargo_linkedin_url`) and no company, so run the candidate through step 2's `linkedin.enrichProfile` and apply the step 3 gate. Under an exception (named provider, cheapest path, tool missing), `FullEnrich.reverseEmailLookup` (1) returns the URL as `profile.linkedin_url` plus the company as `profile.position.company`.

If that also fails: mark the row as "unresolved" and surface to the user. Do **not** return a low-confidence URL.

### Step 5 — Output the validated set

Only the rows that passed the validation gate get written back. Mark unresolved rows explicitly so the user can decide whether to research manually.

## Credit budget

| Per validated contact | Cost |
|---|---|
| `linkedin.findProfileUrl` | 0.25 |
| `linkedin.enrichProfile` (validation) | 0.25 |
| Find LinkedIn URL from email tool (fallback, ~30% of cases, + 0.25 validation) | (1 to 3 + 0.25) × 0.3 = ~0.4 to 1 |
| **Effective: ~0.9 to 1.5 cred per resolved contact** (with ~80% resolution rate) |

## Common pitfalls

- **Don't skip step 3.** A first-pass `findProfileUrl` hit rate is ~70%; an unvalidated rate is ~50% (false positives bring it down). Validation gate is mandatory.
- **Don't normalize the company name aggressively.** "Acme Corp" matching "Acme Inc" is fine; "Acme Software" matching "Acme Pharmaceuticals" is not — keep the suffix awareness loose, the noun-phrase strict.
- **Don't accept candidates with an empty `company`.** That usually means the person is between jobs; the LinkedIn profile may be stale or the resolver's match was wrong.

## Action shape rules

`{"kind":"connector","integrationSlug":"linkedin","actionSlug":"findProfileUrl"}`. **No `connectorUuid` in config.** Per-record data: `fullName` (required), `companyName` (optional — improves matching). If the source data has separate first/last columns, concatenate them into `fullName` first (see [`../provider-playbooks/linkedin.md`](../provider-playbooks/linkedin.md)).
