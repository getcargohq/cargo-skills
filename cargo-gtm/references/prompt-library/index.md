# Prompt library — index

Curated, parameterized prompts for the LLM steps in GTM pipelines (`anthropic.instruct` calls and agent nodes). Reuse these instead of authoring from scratch — each has a tested output contract and a hallucination guard.

**Usage:**
1. Grep this index for the task; note the prompt name and shard file.
2. Open ONLY that shard file — never load all six.
3. Substitute every `{{variable}}` (mustache, snake_case) before sending; unfilled variables silently corrupt output.

Action shape: `{"kind":"connector","integrationSlug":"anthropic","actionSlug":"instruct","config":{"model":"claude-3-5-haiku-latest","advancedSettings":{"temperature":0.3,"maxTokens":1024}}}` with the substituted prompt in each record's `prompt` field (see [`../../recipes/outreach-activation.md`](../../recipes/outreach-activation.md) step 5). Models: `claude-3-5-haiku-latest` for cheap/bulk, `claude-sonnet-4-6` for judgment-heavy — each entry says which. **Sampling overrides apply to the bulk tier only** (extraction and classification want `temperature: 0`); some judgment-tier models reject non-default sampling parameters with a 400 — before setting `advancedSettings` on a non-bulk model, check [`../../provider-playbooks/anthropic.md`](../../provider-playbooks/anthropic.md) and omit the override when in doubt (the prompt's own output contract carries the determinism).

Shards: [company-research.md](company-research.md) · [lead-scoring.md](lead-scoring.md) · [personalization.md](personalization.md) · [qualification.md](qualification.md) · [signal-analysis.md](signal-analysis.md) · [data-extraction.md](data-extraction.md)

| Prompt | Shard | Purpose | Variables |
|---|---|---|---|
| company-two-liner | company-research.md | What the company does, in exactly 2 plain sentences | website_text |
| business-model-classification | company-research.md | B2B/B2C/marketplace/etc + confidence, from site text | website_text |
| competitive-positioning-summary | company-research.md | Category claimed, who they attack, differentiators — 3 bullets | scraped_pages |
| news-significance-filter | company-research.md | Keep only outreach-worthy news items, with acting window | news_items, relevance_criteria |
| org-maturity-estimate | company-research.md | GTM maturity stage from headcount distribution by function | headcount_distribution, total_employees |
| target-customer-inference | company-research.md | Who they sell to, from case studies/logos/pricing pages | website_text |
| icp-fit-score | lead-scoring.md | 1-10 ICP fit with explicit rubric + missing-data flags | icp_description, company_name, company_summary, industry, employee_count, country |
| tech-stack-fit-score | lead-scoring.md | Fit from detected stack; incumbents cap the score | detected_technologies, complementary_technologies, competing_technologies |
| hiring-intent-strength | lead-scoring.md | 1-10 intent from job postings, recency- and seniority-weighted | job_postings, relevant_functions |
| composite-priority-score | lead-scoring.md | Merge sub-scores into P1/P2/P3 tier with tie-breaks | icp_fit_score, signal_strength_score, engagement_score |
| disqualification-check | lead-scoring.md | Hard-disqualifier gate before paid enrichment: DISQUALIFY/PASS | disqualifiers, company_name, company_summary, industry, employee_count, country |
| persona-title-fit | lead-scoring.md | 1-10 title-vs-persona match with ambiguity flag | persona_description, title |
| cold-email-first-line | personalization.md | Signal-referencing cold-email opener (canonical, from outreach-activation) | first_name, last_name, title, company_name, signal_summary |
| job-change-follow-up-line | personalization.md | Follow-up line anchored on a new-role first-90-days priority | first_name, new_title, new_company, previous_company, relationship_context |
| funding-congrats-angle | personalization.md | Funding opener that bans the "congrats" template | company_name, round_type, round_amount, investors, stated_use_of_funds, your_value_prop |
| linkedin-connection-note | personalization.md | Connection note, ≤300 chars, no pitch | first_name, title, company_name, reason_for_connecting |
| subject-line-variants | personalization.md | 3 subject-line styles as a JSON array | first_line, signal_summary, company_name |
| reengagement-opener | personalization.md | Stale-contact opener where the fresh signal is the news | first_name, last_touch_summary, months_since_contact, fresh_signal |
| proof-point-bridge | personalization.md | One sentence tying a customer proof point to the prospect | prospect_situation, customer_name, proof_point |
| seniority-normalization | qualification.md | Any title → C-Level/VP/Director/Manager/IC/Other | title |
| buying-committee-role | qualification.md | Economic buyer/champion/user/blocker/influencer guess | title, department, product_category |
| decision-maker-likelihood | qualification.md | 0-100 can-they-approve estimate for a product + price band | title, employee_count, product_category, price_band |
| geo-territory-normalization | qualification.md | Raw location → parsed geo + one territory from a list | raw_location, territory_list |
| job-function-classification | qualification.md | Title → one of 15 fixed functions | title |
| title-red-flag-check | qualification.md | EXCLUDE students, job-seekers, agencies, joke titles | title, headline |
| job-posting-pain-hypothesis | signal-analysis.md | Job posting → business-pain hypothesis + product mapping | job_posting_text, your_product_summary |
| funding-budget-window | signal-analysis.md | Funding round → budget-timing verdict (act_now/1_3/3_9/too_late) | round_type, round_amount, announced_date, stated_use_of_funds, product_category |
| tech-change-displacement | signal-analysis.md | Stack change → open_door/fresh_incumbent/stack_shift/none | added_technologies, removed_technologies, your_product_summary, competing_technologies |
| job-change-angle | signal-analysis.md | Job change → classified re-engagement play + hook | contact_name, new_title, new_company, previous_company, prior_relationship, product_category |
| filing-priorities-extraction | signal-analysis.md | 10-K/10-Q/report text → top 5 priorities with verbatim quotes | filing_text |
| signal-triage | signal-analysis.md | All signals for one account → act_now/monitor/ignore | signals, icp_fit_score |
| scraped-page-to-company-json | data-extraction.md | Messy page → strict company JSON, nulls never guesses | page_text |
| person-name-normalization | data-extraction.md | Raw name string → structured parts, edge cases handled | raw_name |
| address-geo-parsing | data-extraction.md | Raw address → structured geo + precision level | raw_address |
| employee-count-banding | data-extraction.md | "~500"/"5k"/"200-500" → canonical headcount band | employee_count_raw |
| industry-taxonomy-slotting | data-extraction.md | Company → one verbatim slot of a supplied taxonomy | company_description, taxonomy_list |
| contact-details-extraction | data-extraction.md | Emails/phones/socials from footer or signature text, verbatim only | page_text |
| job-posting-fields-extraction | data-extraction.md | Job posting → title/seniority/location/salary/tech JSON | job_posting_text |

Conventions shared by every prompt: explicit output contract (parse-ready for downstream nodes), a hallucination guard ("if the text doesn't state X, output null — do not guess"), and ≤200 words. When a prompt underperforms, tune the variables before the prose — and if it's genuinely broken, file a `workspaceManagement report create` so the library gets fixed for everyone.
