# Prompt library — data extraction

Prompts that turn messy input (scraped pages, raw name/address strings, job postings) into strict, parse-ready JSON. Every prompt carries its schema inline and instructs the model to emit ONLY the JSON object — pipe the response straight into `jq`. Run through `anthropic.instruct` with `temperature: 0` (bulk tier only — some judgment-tier models reject non-default sampling parameters with a 400; see [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt); extraction wants zero creativity.

### scraped-page-to-company-json

**Purpose:** Extract company facts from a scraped page into a fixed schema — nulls, never guesses. **Variables:** {{page_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON object matching the inline schema.

```
Extract company facts from this scraped page text into the exact schema below. Output ONLY the JSON object — no prose, no markdown fences.

Schema: {"company_name": string|null, "description": string|null (≤25 words), "industry": string|null, "headquarters_city": string|null, "headquarters_country": string|null, "employee_count_stated": number|null, "founded_year": number|null, "contact_email": string|null, "social_links": string[]}

Rules: every value must be supported by explicit text on the page — if the page does not state a field, output null (empty array for social_links); never fill gaps from outside knowledge. employee_count_stated only when the page states a single explicit figure; ranges and vague counts ("hundreds of employees") → null. founded_year must be a 4-digit year stated on the page. Page text: {{page_text}}
```

### person-name-normalization

**Purpose:** Split any raw name string into structured parts, handling "Last, First", particles, suffixes, and non-person strings. **Variables:** {{raw_name}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{first_name, last_name, middle, suffix, honorific, is_person}`.

```
Normalize this raw person-name string into structured parts. Output ONLY the JSON object.

Schema: {"first_name": string|null, "last_name": string|null, "middle": string|null, "suffix": string|null, "honorific": string|null, "is_person": boolean}

Rules: handle "Last, First" ordering; multi-word and particle surnames ("van der Berg", "De La Cruz") stay intact in last_name; suffixes (Jr, III, PhD, MBA, CPA) go to suffix and honorifics (Dr, Prof) to honorific — never leave either inside a name field; strip emojis, parenthesized pronouns, and credentials from name parts. Single-token names: token in first_name, last_name null. If the string is a company, team, or placeholder ("Sales Team", "info desk", "N/A"), set is_person false and every part null. Never invent a part that is not in the string. Raw name: {{raw_name}}
```

### address-geo-parsing

**Purpose:** Parse a raw address or location string into structured geography with an explicit precision level. **Variables:** {{raw_address}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{street, city, region, postal_code, country, country_code, precision}`.

```
Parse this raw address/location string into structured geography. Output ONLY the JSON object.

Schema: {"street": string|null, "city": string|null, "region": string|null, "postal_code": string|null, "country": string|null, "country_code": string|null (ISO 3166-1 alpha-2), "precision": "street|city|region|country|none"}

Rules: expand common abbreviations (NYC → New York; UK → United Kingdom); region = state/province/prefecture; keep street names in their original spelling — do not translate. Set precision to the finest level actually present in the string. Emit only parts stated or unambiguously implied ("Paris, TX" → US; a bare city name resolves its country only when there is no plausible ambiguity). Ambiguous, fictional, or empty input: all fields null, precision "none" — never pick between candidate interpretations. Raw address: {{raw_address}}
```

### employee-count-banding

**Purpose:** Convert any raw headcount expression ("~500", "5k", "200-500 employees") into a canonical band. **Variables:** {{employee_count_raw}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{band, count_parsed, source_kind}`.

```
Convert this raw employee-count value into a canonical band. Output ONLY the JSON object.

Bands: "1-10", "11-50", "51-200", "201-500", "501-1000", "1001-5000", "5001-10000", "10000+".

Schema: {"band": string|null, "count_parsed": number|null, "source_kind": "exact|range|approximate|none"}

Rules: parse formats like "1,234", "~500", "500+", "200-500 employees", "5k", "1.2k". Ranges: band by the midpoint. Open-ended values ("500+"): band by the stated floor. count_parsed = the single number you banded on. Text with no numeric employee information ("many", "growing team", empty) → band null, count_parsed null, source_kind "none". Never infer a count from company fame, revenue, or industry. Raw value: {{employee_count_raw}}
```

### industry-taxonomy-slotting

**Purpose:** Classify a company into exactly one slot of a caller-supplied fixed taxonomy — labels verbatim, no free text. **Variables:** {{company_description}}, {{taxonomy_list}}. **Model guidance:** claude-3-5-haiku-latest; claude-sonnet-4-6 for fine-grained taxonomies (>40 slots). **Output:** JSON `{industry, confidence, runner_up}`.

```
Classify this company into exactly one slot of a fixed taxonomy. Output ONLY the JSON object.

Taxonomy — choose from these values verbatim; never output a label that is not in this list: {{taxonomy_list}}

Company description: {{company_description}}

Schema: {"industry": "<taxonomy value or null>", "confidence": "high|medium|low", "runner_up": "<taxonomy value or null>"}

Rules: classify by the primary revenue activity described, not the technology used — a logistics company using AI is logistics, not AI. If the description fits two slots, pick the more specific one and put the other in runner_up. If the description is empty or fits nothing, use the taxonomy's own fallback slot ("Other" or similar) with confidence "low"; if the list has no fallback, output industry null. Do not classify from the company name alone.
```

### contact-details-extraction

**Purpose:** Pull emails, phones, and social URLs out of messy footer/contact-page/signature text — verbatim values only. **Variables:** {{page_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON `{emails, phones, linkedin_urls, other_socials, physical_address}`.

```
Extract contact details from this messy text (page footer, contact page, or email signature). Output ONLY the JSON object.

Schema: {"emails": string[], "phones": string[], "linkedin_urls": string[], "other_socials": string[], "physical_address": string|null}

Rules: emails must be syntactically valid and appear in the text — de-obfuscate only trivial patterns ("name [at] domain [dot] com"); drop placeholders and example.com addresses. Phones: keep original formatting, deduplicate. linkedin_urls: profile or company URLs only, normalized to https. physical_address: the full address string exactly as written, or null. Every value must exist in the text — output empty arrays or null for anything absent; never construct an email from a name + domain pattern. Text: {{page_text}}
```

### job-posting-fields-extraction

**Purpose:** Extract structured fields (title, seniority, location, remote policy, salary, technologies) from a job posting. **Variables:** {{job_posting_text}}. **Model guidance:** claude-3-5-haiku-latest. **Output:** JSON object matching the inline schema.

```
Extract structured fields from this job posting. Output ONLY the JSON object.

Schema: {"job_title": string|null, "seniority": "C-Level|VP|Director|Manager|IC"|null, "department": string|null, "location": string|null, "remote_policy": "remote|hybrid|onsite"|null, "salary_range": string|null, "technologies": string[], "posted_date": string|null (ISO 8601)}

Rules: technologies = named tools, languages, and platforms from the requirements, verbatim and deduplicated — not soft skills. salary_range only if the posting states figures; keep currency symbols as written. remote_policy only from explicit statements ("fully remote", "3 days in office") — never inferred from location alone. Any field the posting does not state = null (empty array for technologies); do not infer from the company or from title conventions. Posting text: {{job_posting_text}}
```
