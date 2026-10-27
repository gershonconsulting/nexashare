# NexaShare company reposts and AI comment feature review

**Reviewed:** October 23, 2026  
**Repository:** [gershonconsulting/nexashare](https://github.com/gershonconsulting/nexashare)  
**Branch reviewed:** `main` at `a0c9ef1e53d666c75582b18e558393063ab0f651`  
**GitHub access:** The connected account has admin, maintain, pull, and push permission on this repository.

## Summary

Company reposting is intermittent, not wholly broken. LinkedIn confirmed five company reposts in the October 23 report, while seven company-feed attempts failed before NexaShare could identify a post card. The failures point to company-post discovery, not to an unavailable or hard-to-find Repost button.

The repository already contains a data-first company-feed discovery fix in extension version 1.2.28. The report does not expose which extension version handled each outcome or whether that fix’s data lookup succeeded. Therefore, the current evidence cannot distinguish an outdated extension from a failed data lookup that fell back to DOM parsing.

LinkedIn’s current rules prohibit third-party software from submitting comments without a person clicking LinkedIn’s Comment button. The compatible feature is an AI-generated, post-specific comment draft that a person reviews and submits.

## What the latest report shows

The October 23 report covers the 24 hours before **2026-10-23 06:00:46 UTC**. It records 5 confirmed, 7 failed, and 2 skipped outcomes: a **41.7% confirmation rate** among confirmed and failed attempts (5 ÷ 12).

| Company source | Confirmed | Failed | Skipped | Reported pattern |
|---|---:|---:|---:|---|
| Flyingsecoya | 3 | 0 | 0 | Confirmed |
| Valos Srl | 1 | 0 | 0 | Confirmed |
| Meteorbiotech | 1 | 0 | 0 | Confirmed |
| Enzymicals AG | 0 | 5 | 0 | Post-card layout not recognized |
| Phitechbio | 0 | 1 | 0 | Post-card layout not recognized |
| Meteor Biotech | 0 | 1 | 0 | Post-card layout not recognized |
| MAbSilico | 0 | 0 | 1 | No new eligible posts found |
| Urban Factory Intl | 0 | 0 | 1 | No new eligible posts found |

This is evidence that company reposting can succeed and that the failures are source-specific. MAbSilico had no eligible post in this report, so this report does not test a MAbSilico repost attempt.

The report also says there were 10 connected installs and **zero installs connected during the prior 24 hours**. That is not a version inventory and cannot prove which extension build produced the listed outcomes.

## Why people reposts can work while company reposts fail

The two source types do not use the same LinkedIn page layout. NexaShare’s person-post discovery can identify the post card in a rendered member feed. Company discovery had relied on company-page post cards, which are often missing when an unfocused/background LinkedIn tab has not painted the feed.

That failure happens before the extension clicks the Repost control. Seeing an easy-to-find Repost option in the LinkedIn UI does not rule out this earlier discovery failure: NexaShare must first locate the correct company post and its activity URL before it can act.

## What changed in the repository

Extension **1.2.28** introduced data-first discovery for company posts in `chrome-extension/sync-core.js`:

1. Fetch the company Posts page and read its rotating LinkedIn GraphQL query ID and company page ID.
2. Request the company feed data and extract activity IDs without relying on the feed cards being painted.
3. Sort the results newest-first and skip posts older than 30 days.
4. Fall back to DOM discovery if the data request does not return posts.

The change and a regression test are recorded in commit `535bda563dfaeedd67043b082132ea73a1ff7575`. The commit message records live checks against MAbSilico, gershonconsulting, meteorbiotech, valos-srl, and apm-music.

The October 17 release notice reported that **0 of 7 connected clients** had installed 1.2.28 at that point. The October 23 report has no version-by-outcome field and no installs checked in during the preceding 24 hours. So the existing evidence does not tell us whether clients upgraded after the notice. Also, even on 1.2.28, a failed data lookup can fall back to DOM discovery and still produce the same generic “post-card layout not recognized” report.

## Root cause: what is known and unknown

**Known:** The reported failure is in company post discovery. It is not evidence that the Repost menu is hard to find or that all company reposts fail.

**Not yet proven:** Whether the seven failures came from old extension versions, or from 1.2.28+ clients whose data-first request failed and then fell back to DOM parsing.

**Data needed to settle it:** Add these fields to each source attempt and include them in the admin report/dashboard:

- extension version;
- discovery route: `data`, `dom`, or `none`;
- data fallback reason, using bounded reason codes such as `no_csrf`, `page_http_*`, `no_query_id`, `page_id_not_found`, `graphql_http_*`, `no_posts`, or `exception`;
- source type and stable company ID/vanity;
- LinkedIn page URL and retry number.

The extension already logs `company:discovered-via-data` and `company:data-discovery-fallback` locally. The server report currently collapses the result into a generic layout message, losing the key evidence needed to diagnose version adoption versus lookup failure.

## AI comment feature

### Requested behavior

Prepare a short, post-specific comment that connects the post to the user’s business and can help attract relevant prospects.

### Platform constraint and safe product behavior

LinkedIn’s [User Agreement](https://www.linkedin.com/legal/user-agreement) prohibits bots or other unauthorized automated methods from creating comments, likes, shares, or re-shares. LinkedIn’s [Automated activity help page](https://www.linkedin.com/help/linkedin/answer/a1340567/automated-activity-on-linkedin?lang=en) says third-party software and browser extensions may not automate activity on its site. LinkedIn’s [October 2026 guidance on authentic comments](https://news.linkedin.com/2026/authentic-content-and-conversations) says automated comments submitted without a person clicking the Comment button are not allowed, and may be filtered or lead to account restrictions.

The feature should therefore generate a **draft only**. The user should review/edit it and submit it through LinkedIn’s native UI with a deliberate click. Do not auto-fill and submit the comment, or run it in the background.

### Suggested flow

1. After a confirmed NexaShare repost, make an AI draft available beside that repost in the NexaShare dashboard.
2. Generate from the source post text and an explicit user-provided business description, with a concise, natural tone and a soft, relevant invitation to connect.
3. Never invent services, outcomes, client names, or expertise. If the post or business context is too thin, say so and produce no draft rather than a generic sales comment.
4. Provide copy and open-post actions. The user remains responsible for reviewing the wording and clicking Comment in LinkedIn.
5. Keep draft generation off by default until the user enters business context and enables it.

Cloudflare Workers AI is already configured for NexaShare’s Intelligence feature, but no comment-generation endpoint, draft storage, or comment UI was found in the current production source. Auto-comment posting must not be added.

## Recommended next engineering work

1. Ship extension version telemetry and company-discovery route/fallback reason into each outcome and the report.
2. Confirm which connected clients have installed 1.2.28 or newer using fresh check-ins, then compare outcomes by version and discovery route.
3. Add tests for every data-first fallback reason so the report identifies the failing stage rather than only “layout not recognized.”
4. Implement the AI comment-draft flow with an explicit business-context setting and human review; do not automatically submit comments to LinkedIn.
