# Dashboard and Reporting 2.0

The dashboard uses `/api/performance?days=7|30|90`, scoped to the signed-in user.
Totals and daily charts aggregate every recorded outcome, independently of the
100-row activity history. Summary ranks up to 100 recorded company/person source
names by confirmed publishing volume. It is not an engagement ranking.

Dates use UTC. Totals include today and mark it as partial. Growth compares the
completed days in the selected window with the immediately preceding equal number
of complete days: a seven-day selection including today compares six completed days
with the previous six. Both date ranges are displayed. A zero baseline produces
“New activity” or “No confirmed reposts”, never an infinite percentage. Publishing
success is confirmed / (confirmed + failed); no attempts is N/A. Skips are separate.

Reactions, comments, impressions, profile views, followers and engagement rate are
unavailable. No original-author engagement is attributed to the user's repost.
Intelligence continues to analyze confirmed content with its existing evidence and
AI limitations; deterministic next steps explain publishing failures.

Daily user reports compare the previous two complete UTC dates. Weekly user reports
compare consecutive seven-day windows ending yesterday. The administrator daily
report keeps its existing rolling 24-hour scope and adds per-user comparisons
(up to 1,000 users), publishing success and detected extension version. Weekly
administrator reports include each user's growth comparison. Reports disclose that
activity details are limited to 100 outcomes while totals are complete. No new
database migration or LinkedIn permissions are required.

Validation: run every `tests/*.mjs` script with Node 22 or newer. The new
`tests/performance.test.mjs` covers SQLite aggregation above 100 records, UTC date
boundaries, equal comparison periods, partial days, zero baselines, account
isolation, authentication, report content, stale browser responses and escaped
source names. GitHub Actions runs it before production deployment.

Production release uses the existing `.github/workflows/deploy.yml` workflow on
push to main. A commit is not proof of deployment: check the exact workflow SHA,
Cloudflare deployment job, and signed-in live Dashboard, Summary, Reports and
Activity after it completes. Email rendering tests do not establish inbox delivery.
