# Credits cost table

Every credits-based action Cargo can run — 197 of the 534 actions exposed by 124 of the catalog's 138 integrations, plus Cargo's own native actions — sorted by cost. The other 337 actions (CRM writes, sequencer pushes, Slack sends, …) cost no credits; list them with `cargo-ai connection integration get <slug>`.

Rows whose provider is `native` are Cargo's own platform actions, run as `{"kind":"native","actionSlug":"<action>"}` with no integration; every other row runs as `{"kind":"connector","integrationSlug":"<provider>","actionSlug":"<action>"}`.

**Auto-generated. Do not edit by hand** — regenerate with `cargo-ai orchestration action cost-table --raw > cargo-gtm/references/credits-cost-table.md`.

Generated: 2026-08-28

| Cost | Provider | Category | Action | Description |
|---|---|---|---|---|
| 0 | `aiArk` | enrichment | `countCompanies` | Count how many companies match company filters or lookalike domains, without retrieving them |
| 0 | `aiArk` | enrichment | `countPeople` | Count how many people match person and company filters, without retrieving them |
| 0 | `builtwith` | enrichment | `getDomainSummary` | Get summary technology-group counts for a domain (Free API) |
| 0 / item | `sillage` | sales | `searchLeads` | Search the leads Sillage collected on the monitored accounts of a listen signals model |
| 0 / item | `snitcher` | enrichment | `searchSessions` | Search and retrieve website visitor sessions with filtering options for date ranges, URLs, and referrers |
| 0–1 / person | `apolloio` | enrichment | `searchPeople` | Search Apollo's people database by person, company, technology, and hiring filters |
| 0–3 | `contactOut` | enrichment | `enrich` | Find data from an email. It returns data person / company information as the response |
| 0.006–0.5 / 1k token + base | `openAi` | freeform | `instruct` | Instruct prompt |
| 0.01 | `aiArk` | enrichment | `enrichCompany` | Retrieve firmographics for a single company from its domain or LinkedIn URL |
| 0.01 / item | `aiArk` | enrichment | `searchCompanies` | Search for companies matching company filters or lookalike domains |
| 0.01 / organization | `apolloio` | enrichment | `searchOrganizations` | Search Apollo's company database by firmographic, funding, technology, and hiring filters |
| 0.01 | `icypeas` | enrichment | `verifyEmail` | Verify a person's email status |
| 0.01 | `piloterr` | enrichment | `getG2ProductInfo` | Retrieve detailed information about a product from G2 including reviews, ratings, pricing plans, and product specificati… |
| 0.01–0.25 / 1k token + base | `gemini` | freeform | `instruct` | Instruct prompt |
| 0.02 / 100 item | `icypeas` | enrichment | `findCompanies` | Search the Icypeas lead database for companies matching the given criteria. Returns a paginated list of matching compani… |
| 0.02 / 100 item | `icypeas` | enrichment | `findPeople` | Search the Icypeas lead database for people matching the given criteria. Returns a paginated list of matching profiles. |
| 0.02 / 1k token | `native` | platform | `fileSearch` | Search files |
| 0.02 / item | `salesNavigator` | enrichment | `extractLeadSearch` | Retrieve leads from Sales Navigator |
| 0.02 / item | `salesNavigator` | enrichment | `searchLeads` | Search and retrieve contact profiles from Sales Navigator based on various filters including company, role, location, an… |
| 0.02 | `x` | enrichment | `getFollowers` | Get the followers of an X account |
| 0.02 | `x` | enrichment | `getFollowing` | Get the accounts an X account is following |
| 0.02 | `x` | enrichment | `getPostComments` | Get the replies (comments) on an X post |
| 0.02 | `x` | enrichment | `getPostDetails` | Get a single X post (tweet) with its engagement metrics |
| 0.02 | `x` | enrichment | `getPostLikers` | Get the X accounts that liked a post |
| 0.02 | `x` | enrichment | `getQuoteTweets` | Get the posts that quote-tweeted an X post |
| 0.02 | `x` | enrichment | `getRetweeters` | Get the X accounts that reposted (retweeted) a post |
| 0.02 | `x` | enrichment | `getUserLikes` | Get the posts recently liked by an X account |
| 0.02 | `x` | enrichment | `getUserMedia` | Get the recent media posts (photos/videos) of an X account |
| 0.02 | `x` | enrichment | `getUserPosts` | Get the recent posts (tweets) published by an X account |
| 0.02 | `x` | enrichment | `getUserProfile` | Get the profile of an X account (bio, followers, links, …) |
| 0.02 | `x` | enrichment | `getUserReplies` | Get the recent replies posted by an X account |
| 0.02 | `x` | enrichment | `searchPeople` | Search X accounts (people) by keyword |
| 0.02 | `x` | enrichment | `searchPosts` | Search X posts (tweets) by keyword or advanced query |
| 0.025 / url | `parallel` | enrichment | `extract` | Extract relevant content from specific web URLs using Parallel AI |
| 0.05 | `aiArk` | enrichment | `analyzePersonality` | Analyze a LinkedIn profile to get personality insights (OCEAN, DISC) and tailored selling and hiring guidance |
| 0.05 | `aiArk` | enrichment | `reverseLookup` | Find a person's full profile from an email address or a phone number |
| 0.05 / item | `aiArk` | enrichment | `searchPeople` | Search for people matching person and company filters |
| 0.05 / item | `firecrawl` | enrichment | `crawl` | Recursively search through a urls subdomains, and gather the content |
| 0.05 / item | `firecrawl` | enrichment | `scrape` | Turn any url into clean data |
| 0.05 / item | `firecrawl` | enrichment | `search` | Search the web using Firecrawl |
| 0.05 | `kitt` | sales | `verifyEmail` | Verify an email address |
| 0.05 / item | `linkedin` | enrichment | `extractCompanyViewers` | Extract the list of people who viewed a LinkedIn company page you administrate over the past year. |
| 0.05 / item | `linkedin` | enrichment | `extractEventAttendees` | Extract the attendees of a LinkedIn event. |
| 0.05 / item | `linkedin` | enrichment | `extractFollowers` | Extract the list of people who follow the connected LinkedIn profile. |
| 0.05 / item | `linkedin` | enrichment | `extractPageFollowers` | Extract the list of people who follow a LinkedIn company page you administrate, with the date each one followed. |
| 0.05 / item | `linkedin` | enrichment | `extractProfileCommentActivity` | Extract the comment activity history of a LinkedIn profile, showing posts they have commented on |
| 0.05 / item | `linkedin` | enrichment | `extractProfilePostActivity` | Extract the post activity history of a LinkedIn profile, showing content they have published |
| 0.05 / item | `linkedin` | enrichment | `extractProfileReactionActivity` | Extract the reaction activity history of a LinkedIn profile, showing posts they have liked or reacted to |
| 0.05 / item | `linkedin` | enrichment | `extractProfileViewers` | Extract the list of people who have viewed your LinkedIn profile recently. |
| 0.05 / item | `linkedin` | enrichment | `searchPostComments` | Search for post comments |
| 0.05 / item | `linkedin` | enrichment | `searchPostReactions` | Search for post reactions |
| 0.05 / item | `salesNavigator` | enrichment | `extractAccountSearch` | Retrieve accounts from Sales Navigator |
| 0.05 / item | `salesNavigator` | enrichment | `searchAccounts` | Search and retrieve company accounts from Sales Navigator based on various filters including headcount, location, indust… |
| 0.05 | `serper` | enrichment | `search` | Retrieve Google searches |
| 0.05 | `serper` | enrichment | `searchPlaces` | Retrieve Google places |
| 0.05–4 / 1k token + base | `anthropic` | freeform | `instruct` | Instruct prompt |
| 0.1 | `aiArk` | enrichment | `enrichPerson` | Enrich a person's full profile and find their verified email from a LinkedIn URL or an AI-Ark person ID |
| 0.1 | `brightData` | enrichment | `scrapeFacebookPagePosts` | Scrape Facebook page posts by URL including content, engagement metrics, and attachments |
| 0.1 | `brightData` | enrichment | `scrapeFacebookProfile` | Scrape Facebook page or profile data by URL including name, followers, contact info, and business details |
| 0.1 | `brightData` | enrichment | `scrapeInstagramProfile` | Scrape Instagram profile data by URL including follower count, posts, bio, and engagement metrics |
| 0.1 | `brightData` | enrichment | `scrapeTikTokProfile` | Scrape TikTok profile data by URL including follower count, likes, videos, and engagement metrics |
| 0.1 | `brightData` | enrichment | `scrapeTwitterProfile` | Scrape X (Twitter) profile data by URL including follower count, posts, bio, and engagement metrics |
| 0.1 | `brightData` | enrichment | `scrapeYouTubeChannel` | Scrape YouTube channel data by URL including subscriber count, videos, views, and top videos |
| 0.1 | `enrichley` | enrichment | `verify` | Verify email |
| 0.1 | `enrowio` | enrichment | `verifyEmail` | Verify a person's email |
| 0.1 | `icypeas` | enrichment | `findEmail` | Find an email address from a firstname, a lastname and a company domain name. |
| 0.1 | `icypeas` | enrichment | `scanDomain` | A special route in order to completely scan a domain. Scanning a domain allows you to discover all role-based email addr… |
| 0.1 | `native` | platform | `sendEmail` | Send an email from one of your mailboxes |
| 0.1 | `waterfall` | enrichment | `verifyEmail` | Verify a person's email |
| 0.1 | `zeroBounce` | enrichment | `verifyEmail` | Verify a person's email status. |
| 0.125–60 | `parallel` | enrichment | `createTask` | Execute a web research task using Parallel AI. Supports complex queries that require deep research, analysis, and struct… |
| 0.125 + 0.025 / item | `parallel` | enrichment | `search` | Search the web with Parallel AI and return ranked results with relevant excerpts |
| 0.025 / item + base | `exa` | enrichment | `search` | Search the web with Exa and return ranked results |
| 0.2 | `neverBounce` | enrichment | `verifyEmail` | Verify an email address |
| 0.25 | `companyEnrich` | enrichment | `enrichByDomain` | Retrieve company information by domain name |
| 0.25 | `companyEnrich` | enrichment | `getWorkforce` | Returns workforce insights including historical headcount by department. Useful for tracking department-level growth and… |
| 0.25 | `companyEnrich` | enrichment | `lookupPerson` | Looks up a person by email address. Resolves the company from the email domain first, then matches the person by email l… |
| 0.25 | `findyMail` | enrichment | `verifyEmail` | Verify email for potential bounce |
| 0.25 | `linkedin` | enrichment | `commentPost` | Comment LinkedIn posts |
| 0.25 | `linkedin` | enrichment | `commentPostComment` | Comment LinkedIn post comments |
| 0.25 | `linkedin` | enrichment | `connectProfile` | Connect to LinkedIn profiles |
| 0.25 | `linkedin` | enrichment | `enrichCompany` | Retrieve information about a company |
| 0.25 | `linkedin` | enrichment | `enrichJob` | Retrieve information about a job |
| 0.25 | `linkedin` | enrichment | `enrichPost` | Retrieve information about a LinkedIn post including content, author, engagement metrics, and media |
| 0.25 | `linkedin` | enrichment | `enrichProfile` | Retrieve information about a profile |
| 0.25 | `linkedin` | enrichment | `extractCompanyEmployeesInsights` | Extract employee insights and analytics from a LinkedIn company page, including headcount by function, location, and sen… |
| 0.25 | `linkedin` | enrichment | `extractSimilarCompanies` | Extract a list of companies similar to a given LinkedIn company page, based on LinkedIn's recommendations |
| 0.25 | `linkedin` | enrichment | `findProfileUrl` | Find a LinkedIn profile URL from a name |
| 0.25 | `linkedin` | enrichment | `followProfile` | Follow LinkedIn profiles |
| 0.25 | `linkedin` | enrichment | `likePost` | Like LinkedIn posts |
| 0.25 | `linkedin` | enrichment | `messageProfile` | Send a direct message to a LinkedIn connection |
| 0.25 | `linkedin` | enrichment | `searchPosts` | Search for posts |
| 0.25 | `linkedin` | enrichment | `visitProfile` | Visit LinkedIn profiles |
| 0.25 | `salesNavigator` | enrichment | `findCompanyInsights` | Retrieve insights about a company from Sales Navigator |
| 0.25 | `salesNavigator` | enrichment | `findCompanyMetrics` | Retrieve metrics about a company from Sales Navigator |
| 0.25 | `salesNavigator` | enrichment | `findEmployeesCount` | Retrieve employees count from Sales Navigator |
| 0.25 | `salesNavigator` | enrichment | `findEmployeesDistribution` | Retrieve employees distribution from Sales Navigator |
| 0.25 | `salesNavigator` | enrichment | `searchCompanyMetrics` | Get total result count metrics for a Sales Navigator company search URL |
| 0.25 | `salesNavigator` | enrichment | `searchPersonMetrics` | Get metrics and statistics for a Sales Navigator person search, including total results count |
| 0.3 | `bouncer` | enrichment | `verifyEmail` | Verify an email address |
| 0.3–1 / 1k token | `perplexity` | freeform | `instruct` | Instruct prompt |
| 0.5 | `aiArk` | enrichment | `findMobilePhone` | Find a person's mobile phone number from a LinkedIn URL, or from a company domain and a full name |
| 0.5 | `cargo` | enrichment | `enrichBusinessFinancialMetrics` | Enrich business financial metrics |
| 0.5 | `cargo` | enrichment | `enrichBusinessFirmographics` | Enrich business firmographics |
| 0.5 | `cargo` | enrichment | `enrichBusinessFundingAndAcquisitions` | Enrich business funding and acquisitions |
| 0.5 | `cargo` | enrichment | `enrichBusinessWebsiteKeywords` | Enrich business website keywords |
| 0.5 / item | `cargo` | enrichment | `fetchBusinesses` | Fetch businesses |
| 0.5 | `cargo` | enrichment | `fetchBusinessEvents` | Fetch business events |
| 0.5 | `cargo` | enrichment | `fetchProspectEvents` | Fetch prospect events |
| 0.5 / item | `cargo` | enrichment | `fetchProspects` | Fetch prospects |
| 0.5 | `findyMail` | enrichment | `findEmail` | Retrieve email given a name and domain |
| 0.5 | `hunter` | enrichment | `findEmail` | Find a person's email |
| 0.5 | `leadMagic` | enrichment | `findEmail` | Find email given a name and domain |
| 0.5 | `linkedin` | enrichment | `enrichCompanyFromDomain` | Retrieve information about a company from domain |
| 0.5 | `linkedin` | enrichment | `enrichProfileFromName` | Retrieve information about a profile from name |
| 0.5 | `linkedin` | enrichment | `findCustomHeadcount` | Find the number of people in a company |
| 0.5 | `linkedin` | enrichment | `searchJobs` | Search for jobs |
| 0.5 | `native` | platform | `modelAsk` | Query your model with a question |
| 0.5 | `prospeo` | enrichment | `enrichCompany` | Enrich a company with B2B firmographics data |
| 0.5 | `prospeo` | enrichment | `enrichLinkedin` | Retrieve information about a person's Linkedin profile |
| 0.5 | `prospeo` | enrichment | `findEmail` | Find a person's email address using their name and company domain |
| 0.5 / item | `theirStack` | enrichment | `searchCompanies` | Search for companies |
| 0.5 / item | `theirStack` | enrichment | `searchJobs` | Search for jobs |
| 0.5 | `theirStack` | enrichment | `searchTechnologies` | Search for technologies |
| 0.5–2 | `linkup` | enrichment | `search` | Search for results using Linkup |
| 1 | `apolloio` | enrichment | `enrichOrganization` | Enrich an organization |
| 1 | `builtwith` | enrichment | `enrichDomain` | Look up the full technology stack and metadata for a domain |
| 1 | `cargo` | enrichment | `enrichBusinessBomboraIntent` | Enrich business with Bombora intent topics to reveal which topics companies are actively researching online |
| 1 | `cargo` | enrichment | `enrichBusinessChallenges` | Enrich business challenges |
| 1 | `cargo` | enrichment | `enrichBusinessCompetitiveLandscape` | Enrich business competitive landscape |
| 1 | `cargo` | enrichment | `enrichBusinessRatingsByEmployees` | Enrich business ratings by employees |
| 1 | `cargo` | enrichment | `enrichBusinessStrategicInsights` | Enrich business strategic insights |
| 1 | `cargo` | enrichment | `enrichBusinessTechnographics` | Enrich business technographics |
| 1 | `cargo` | enrichment | `enrichBusinessWebsiteChanges` | Enrich business website changes |
| 1 | `cargo` | enrichment | `enrichBusinessWorkforceTrends` | Enrich business workforce trends |
| 1 | `cargo` | enrichment | `fetchBusinessStatistics` | Fetch business statistics |
| 1 / item | `companyEnrich` | enrichment | `findSimilarCompanies` | Find similar companies |
| 1 | `datagma` | enrichment | `findEmail` | Retrieve a person's email |
| 1 | `dropcontact` | enrichment | `findEmail` | Find a person's email using their first and last name |
| 1 | `enrichCrm` | enrichment | `enrichCompany` | Enrich company given domain |
| 1 | `enrichCrm` | enrichment | `enrichPerson` | Enrich person given email or full name + domain or first name + last name + domain |
| 1 | `enrichCrm` | enrichment | `findEmail` | Find email using first name, last name, full name, company, LinkedIn, country |
| 1 | `enrichCrm` | enrichment | `getFunding` | Get company financial and funding data given a domain |
| 1 | `enrowio` | enrichment | `findEmail` | Find a person's email |
| 1 | `FullEnrich` | enrichment | `findEmail` | Find a person's email address using their first name, last name, company name, domain name, or LinkedIn URL |
| 1 | `g2` | enrichment | `enrichProduct` | Retrieve detailed information about a product from G2 including reviews, ratings, and product specifications |
| 1 | `hunter` | enrichment | `enrichPerson` | Enrich a person's information |
| 1 | `hunter` | enrichment | `searchDomain` | Search for people in a domain |
| 1 | `hunter` | enrichment | `verifyEmail` | Verify a person's email status |
| 1 | `linkup` | enrichment | `instruct` | Get structured or sourced answers using Linkup |
| 1 | `oceanio` | enrichment | `enrichCompany` | Retrieve company data |
| 1 | `oceanio` | enrichment | `enrichPerson` | Retrieve person data |
| 1 / item | `oceanio` | enrichment | `searchCompanies` | Search for companies |
| 1 | `oceanio` | enrichment | `searchPeople` | Search for people |
| 1 | `proxycurl` | enrichment | `enrich` | Retrieve information about a person/organization |
| 1 / item | `proxycurl` | enrichment | `search` | Retrieve object records |
| 1 | `reverseContact` | enrichment | `enrichCompanyFromLinkedin` | Retrieve information about a company from Linkedin |
| 1 | `rocketreach` | enrichment | `lookupPerson` | Lookup person and company |
| 1 | `waterfall` | enrichment | `enrichCompany` | Retrieve company data |
| 1–3 / item | `contactOut` | enrichment | `search` | Search person / company data from linkedin URL |
| 1–9 | `apolloio` | enrichment | `enrichPerson` | Enrich a person |
| 2 | `cargo` | enrichment | `enrichBusinessLinkedinPosts` | Enrich business linkedin posts |
| 2 | `cargo` | enrichment | `enrichProspectDetails` | Enrich prospect details |
| 2 | `cargo` | enrichment | `enrichProspectLinkedinPosts` | Enrich prospect linkedin posts |
| 2 | `cargo` | enrichment | `enrichProspectLinkedinProfile` | Enrich prospect linkedin profile |
| 2 | `datagma` | enrichment | `enrichPersonFromPersonalEmail` | Retrieve a person's profile from a personal email address (outside of the EU) |
| 2 | `forager` | enrichment | `findPersonalEmail` | Find a person's personal email |
| 2 | `forager` | enrichment | `findWorkEmail` | Find a person's work email |
| 2 | `FullEnrich` | enrichment | `reverseEmailLookup` | Find a person's LinkedIn profile and company information from their email address |
| 2 | `theSwarm` | enrichment | `searchWarmIntrosToCompany` | Search for warm intros to a company, filtering for target company employees with the desired job function and seniority. |
| 2 | `theSwarm` | enrichment | `searchWarmIntrosToPerson` | Search for warm introductions to a specific person using their LinkedIn profile. |
| 2 | `waterfall` | enrichment | `enrichContact` | Retrieve a contact |
| 3 | `leadMagic` | enrichment | `enrichProfile` | Enrich profile data |
| 3 | `peopleDataLabs` | enrichment | `enrichCompany` | Retrieve information about a company |
| 3 | `peopleDataLabs` | enrichment | `enrichPerson` | Retrieve information about a person |
| 3 / item | `peopleDataLabs` | enrichment | `queryCompanies` | Query companies |
| 3 / item | `peopleDataLabs` | enrichment | `queryPeople` | Query people |
| 3 / item | `peopleDataLabs` | enrichment | `searchCompanies` | Search for companies |
| 3 / item | `peopleDataLabs` | enrichment | `searchPeople` | Search for people |
| 3 | `prospeo` | enrichment | `findPhone` | Find a person's phone number using linkedin url |
| 3 | `waterfall` | enrichment | `detectJobChange` | Detect if a contact has changed jobs. Returns the job change status (MOVED, LEFT, NO_CHANGE, UNKNOWN) and updated person… |
| 3 / item | `waterfall` | enrichment | `searchProspects` | Search contacts and their companies |
| 4 | `mixrank` | enrichment | `findCompany` | Retrieve a person or company information |
| 4 | `mixrank` | enrichment | `findPerson` | Find a person using various identifiers like email, phone, name, or company details |
| 4 | `societeInfo` | enrichment | `enrich` | Retrieve information about a contact/company |
| 4 / item | `societeInfo` | enrichment | `search` | Search for a company or contact |
| 5 | `findyMail` | enrichment | `findPhone` | Retrieve phone number given a linkedin URL |
| 5 | `forager` | enrichment | `findPhone` | Find a person's phone number |
| 6 | `FullEnrich` | enrichment | `findPhone` | Find a person's phone number using their first name, last name, company name, domain name, or LinkedIn URL |
| 6 | `salesNavigator` | enrichment | `searchLeadsLegacy` | Retrieve leads from Sales Navigator |
| 7 | `FullEnrich` | enrichment | `findPhoneAndEmail` | Find a person's email and phone number using their first name, last name, company name, domain name, or LinkedIn URL |
| 7 | `waterfall` | enrichment | `findPhone` | Retrieve a person's phone number |
| 8 | `datagma` | enrichment | `enrichPerson` | Enrich a person from their LinkedIn profile URL or professional email |
| 8 | `datagma` | enrichment | `findPhone` | Retrieve a person's phone number |
| 8 | `datagma` | enrichment | `findPhoneAndEmail` | Retrieve both phone number and email address for a person |
| 15 | `cleon1` | enrichment | `findPhone` | Find a person's phone number using their first and last name, optionally refined with company information |
| 15 | `cleon1` | enrichment | `findPhoneFromLinkedin` | Find a person's phone number using their Linkedin URL |

## Actions whose price depends on config

These bill differently depending on how the node is configured, so the range above is not a quote. Pick the row that matches the config you are about to run.

### `apolloio.searchPeople` — varies by `shouldEnrich`

| Config | Cost |
|---|---|
| shouldEnrich=true | 1 / person |
| shouldEnrich=false | 0 / person |

### `contactOut.enrich` — varies by `objectType`, `includePhone`, `emailType`

| Config | Cost |
|---|---|
| objectType=company | 0 |
| objectType=contact, includePhone=false, emailType empty | 1 |
| objectType=contact, includePhone=false, emailType set | 2 |
| objectType=contact, includePhone=true | 3 |

### `openAi.instruct` — varies by `model`, `advancedSettings.withWebSearch`

| Config | Cost |
|---|---|
| model=gpt-5.6-sol, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.6-terra, advancedSettings.withWebSearch=true | 0.4 + 0.03 / 1k token |
| model=gpt-5.6-luna, advancedSettings.withWebSearch=true | 0.4 + 0.006 / 1k token |
| model=gpt-5-nano, advancedSettings.withWebSearch=true | 0.4 + 0.006 / 1k token |
| model=gpt-5-mini, advancedSettings.withWebSearch=true | 0.4 + 0.03 / 1k token |
| model=gpt-5, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.5, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.4, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.4-mini, advancedSettings.withWebSearch=true | 0.4 + 0.03 / 1k token |
| model=gpt-5.4-nano, advancedSettings.withWebSearch=true | 0.4 + 0.006 / 1k token |
| model=gpt-5.3, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.3-mini, advancedSettings.withWebSearch=true | 0.4 + 0.03 / 1k token |
| model=gpt-5.3-nano, advancedSettings.withWebSearch=true | 0.4 + 0.006 / 1k token |
| model=gpt-5.2, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-5.1, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gpt-4.1-nano, advancedSettings.withWebSearch=true | 0.4 + 0.01 / 1k token |
| model=gpt-4.1-mini, advancedSettings.withWebSearch=true | 0.4 + 0.05 / 1k token |
| model=gpt-4.1, advancedSettings.withWebSearch=true | 0.4 + 0.3 / 1k token |
| model=gpt-4o-mini, advancedSettings.withWebSearch=true | 0.4 + 0.02 / 1k token |
| model=gpt-4o, advancedSettings.withWebSearch=true | 0.4 + 0.5 / 1k token |
| model=gpt-3.5-turbo, advancedSettings.withWebSearch=true | 0.4 + 0.5 / 1k token |
| model=gpt-5.6-sol, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.6-terra, advancedSettings.withWebSearch=false | 0.03 / 1k token |
| model=gpt-5.6-luna, advancedSettings.withWebSearch=false | 0.006 / 1k token |
| model=gpt-5-nano, advancedSettings.withWebSearch=false | 0.006 / 1k token |
| model=gpt-5-mini, advancedSettings.withWebSearch=false | 0.03 / 1k token |
| model=gpt-5, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.5, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.4, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.4-mini, advancedSettings.withWebSearch=false | 0.03 / 1k token |
| model=gpt-5.4-nano, advancedSettings.withWebSearch=false | 0.006 / 1k token |
| model=gpt-5.3, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.3-mini, advancedSettings.withWebSearch=false | 0.03 / 1k token |
| model=gpt-5.3-nano, advancedSettings.withWebSearch=false | 0.006 / 1k token |
| model=gpt-5.2, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-5.1, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gpt-4.1-nano, advancedSettings.withWebSearch=false | 0.01 / 1k token |
| model=gpt-4.1-mini, advancedSettings.withWebSearch=false | 0.05 / 1k token |
| model=gpt-4.1, advancedSettings.withWebSearch=false | 0.3 / 1k token |
| model=gpt-4o-mini, advancedSettings.withWebSearch=false | 0.02 / 1k token |
| model=gpt-4o, advancedSettings.withWebSearch=false | 0.5 / 1k token |
| model=gpt-3.5-turbo, advancedSettings.withWebSearch=false | 0.5 / 1k token |

### `gemini.instruct` — varies by `model`, `advancedSettings.withWebSearch`

| Config | Cost |
|---|---|
| model=gemini-3.6-flash, advancedSettings.withWebSearch=true | 0.4 + 0.25 / 1k token |
| model=gemini-3.5-flash-lite, advancedSettings.withWebSearch=true | 0.4 + 0.08 / 1k token |
| model=gemini-3.1-pro-preview, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gemini-3-pro-preview, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=gemini-3-flash-preview, advancedSettings.withWebSearch=true | 0.4 + 0.05 / 1k token |
| model=gemini-2.5-pro, advancedSettings.withWebSearch=true | 0.4 + 0.15 / 1k token |
| model=gemini-2.5-flash, advancedSettings.withWebSearch=true | 0.4 + 0.03 / 1k token |
| model=gemini-1.5-pro, advancedSettings.withWebSearch=true | 0.4 + 0.1 / 1k token |
| model=gemini-1.5-flash, advancedSettings.withWebSearch=true | 0.4 + 0.01 / 1k token |
| model=gemini-2.0-flash, advancedSettings.withWebSearch=true | 0.4 + 0.01 / 1k token |
| model=gemini-3.6-flash, advancedSettings.withWebSearch=false | 0.25 / 1k token |
| model=gemini-3.5-flash-lite, advancedSettings.withWebSearch=false | 0.08 / 1k token |
| model=gemini-3.1-pro-preview, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gemini-3-pro-preview, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=gemini-3-flash-preview, advancedSettings.withWebSearch=false | 0.05 / 1k token |
| model=gemini-2.5-pro, advancedSettings.withWebSearch=false | 0.15 / 1k token |
| model=gemini-2.5-flash, advancedSettings.withWebSearch=false | 0.03 / 1k token |
| model=gemini-1.5-pro, advancedSettings.withWebSearch=false | 0.1 / 1k token |
| model=gemini-1.5-flash, advancedSettings.withWebSearch=false | 0.01 / 1k token |
| model=gemini-2.0-flash, advancedSettings.withWebSearch=false | 0.01 / 1k token |

### `anthropic.instruct` — varies by `model`, `advancedSettings.withWebSearch`

| Config | Cost |
|---|---|
| model=claude-sonnet-5, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-fable-5, advancedSettings.withWebSearch=true | 0.4 + 4 / 1k token |
| model=claude-opus-4-8, advancedSettings.withWebSearch=true | 0.4 + 2 / 1k token |
| model=claude-opus-4-7, advancedSettings.withWebSearch=true | 0.4 + 2 / 1k token |
| model=claude-opus-4-6, advancedSettings.withWebSearch=true | 0.4 + 2 / 1k token |
| model=claude-opus-4-1-20250805, advancedSettings.withWebSearch=true | 0.4 + 2 / 1k token |
| model=claude-opus-4-20250514, advancedSettings.withWebSearch=true | 0.4 + 2 / 1k token |
| model=claude-sonnet-4-20250514, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-sonnet-4-6, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-sonnet-4-5-20250929, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-3-7-sonnet-latest, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-3-5-sonnet-latest, advancedSettings.withWebSearch=true | 0.4 + 0.2 / 1k token |
| model=claude-3-5-haiku-latest, advancedSettings.withWebSearch=true | 0.4 + 0.05 / 1k token |
| model=claude-sonnet-5, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-fable-5, advancedSettings.withWebSearch=false | 4 / 1k token |
| model=claude-opus-4-8, advancedSettings.withWebSearch=false | 2 / 1k token |
| model=claude-opus-4-7, advancedSettings.withWebSearch=false | 2 / 1k token |
| model=claude-opus-4-6, advancedSettings.withWebSearch=false | 2 / 1k token |
| model=claude-opus-4-1-20250805, advancedSettings.withWebSearch=false | 2 / 1k token |
| model=claude-opus-4-20250514, advancedSettings.withWebSearch=false | 2 / 1k token |
| model=claude-sonnet-4-20250514, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-sonnet-4-6, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-sonnet-4-5-20250929, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-3-7-sonnet-latest, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-3-5-sonnet-latest, advancedSettings.withWebSearch=false | 0.2 / 1k token |
| model=claude-3-5-haiku-latest, advancedSettings.withWebSearch=false | 0.05 / 1k token |

### `parallel.createTask` — varies by `processor`

| Config | Cost |
|---|---|
| processor=lite | 0.125 |
| processor=base | 0.25 |
| processor=core | 0.625 |
| processor=core2x | 1.25 |
| processor=pro | 2.5 |
| processor=ultra | 7.5 |
| processor=ultra2x | 15 |
| processor=ultra4x | 30 |
| processor=ultra8x | 60 |
| any config | 0.625 |

### `exa.search` — varies by `searchType`

| Config | Cost |
|---|---|
| searchType=deep | 0.3 + 0.025 / item |
| any config | 0.175 + 0.025 / item |

### `perplexity.instruct` — varies by `model`, `searchContextSize`

| Config | Cost |
|---|---|
| model=sonar-deep-research | 0.5 / 1k token |
| model=sonar, searchContextSize=high | 0.5 / 1k token |
| model=sonar, searchContextSize=medium | 0.4 / 1k token |
| model=sonar, searchContextSize=low | 0.3 / 1k token |
| model=sonar-pro, searchContextSize=high | 1 / 1k token |
| model=sonar-pro, searchContextSize=medium | 0.8 / 1k token |
| model=sonar-pro, searchContextSize=low | 0.6 / 1k token |
| model=sonar-reasoning, searchContextSize=high | 0.6 / 1k token |
| model=sonar-reasoning, searchContextSize=medium | 0.5 / 1k token |
| model=sonar-reasoning, searchContextSize=low | 0.4 / 1k token |
| model=sonar-reasoning-pro, searchContextSize=high | 0.9 / 1k token |
| model=sonar-reasoning-pro, searchContextSize=medium | 0.7 / 1k token |
| model=sonar-reasoning-pro, searchContextSize=low | 0.5 / 1k token |

### `linkup.search` — varies by `depth`

| Config | Cost |
|---|---|
| depth=standard | 0.5 |
| depth=deep | 2 |

### `contactOut.search` — varies by `objectType`, `revealInfo`

| Config | Cost |
|---|---|
| objectType=people, revealInfo=false | 1 / item |
| objectType=people, revealInfo=true | 3 / item |

### `apolloio.enrichPerson` — varies by `revealPhoneNumber`

| Config | Cost |
|---|---|
| revealPhoneNumber=false | 1 |
| revealPhoneNumber=true | 9 |

