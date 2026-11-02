# Four-page workspace redesign

The four views share `/api/workspace-insights?days=7|30|90`, authenticated to the
current user. Outcome aggregates are scoped by user; configured company/person
sources are scoped by that user's team. No schema migration or extension release
is required.

- **Dashboard:** confirmed shares, change in shares, reliability, historical
  failed attempts, daily output, outcome definitions, and three evidence-backed
  actions. Account activity is distinct from this browser's extension state.
- **Reports:** completed-period comparison, weighted reliability and per-day
  attempt counts, top ten recorded failure reasons, version breakdown, daily
  evidence, CSV download and print layout. Recent-failure actions filter Activity;
  Activity still shows only its latest 100 outcomes.
- **Summary:** concise briefing, publishing concentration, active-day coverage,
  and all configured companies/people, including paused and quiet sources.
  Historical/unmatched sources are retained. Ambiguous names are not merged.
- **Intelligence:** deterministic prioritized findings with evidence, limitations
  and next actions; full-period text coverage; optional saved AI content review.
  The AI evidence now includes failure reasons. Empty captured text prevents
  content generation. Opening this page never generates a new AI report.

## Measurement rules

Totals include today (UTC). Growth compares equal completed-day windows: for a
7-day selection including today, six completed days are compared with the prior
six. Success is confirmed / (confirmed + failed); no attempts is N/A. Skips and
already-reposted outcomes are separate. Source rankings measure publishing output,
not audience response. Version comparisons are observational, not causal.

No activity is not proof of a missed schedule or failure. Historical failed
attempts are not an unresolved queue or a count of distinct lost posts. Reactions,
comments, impressions and follower growth remain unavailable; no audience growth
is inferred. AI samples at most 60 recent confirmed reposts, each truncated to
1,200 characters; cached snapshots display their generation timestamp explicitly.

## Verification

The existing regression suite and two new suites cover account isolation,
aggregate reconciliation beyond 100 outcomes, future/quiet/paused sources,
ambiguous source identity, empty periods, failure diagnostics, textless AI,
authentication, stale responses, safe rendering, CSV denominators and error states.
Browser QA uses explicitly labeled sample data. Desktop and 390-pixel layouts
were inspected for all four views; wide tables and navigation scroll locally.
