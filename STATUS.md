# NexaShare - STATUS

Last updated: 2026-11-18 (nightly)

## Current state
- Production extension: 1.2.33. Worker + site deploy from `main` via `.github/workflows/deploy.yml`
  (push to main = D1 migrations + Worker deploy + extension GitHub release + release-notice e-mail).
- Branch `nightly/2026-11-18-nexashare-de-repost` prepares extension 1.2.34 (PR HELD).

## Done
- ✅ German direct repost "Sofort / Jetzt / Direkt teilen" recognised; "Mit Kommentar teilen" never chosen
  (Markus Bernasconi, user 10: 0 confirmed / 34 failed ever before this fix).
- ✅ Source redirecting to linkedin.com/company/unavailable/ reported as `source_unavailable`
  (Tunahan Cakir, user 9, source phitechbio: 90 failures since 11-10 mislabelled "layout not recognized").
- ✅ Admin report shows readable labels for discovery reasons.
- ✅ All deploy.yml validation scripts pass locally (Node 22).
- Note: 5 files were normalized CRLF->LF by the API push (whitespace-only).

## Open
- ❌ awaiting Olivier's OK to release (emails every client) - merge only after OK.
- ❌ Tunahan's phitechbio source needs replacing/removing (data change, not done).
- ❌ German fix verified on fixtures only; watch Markus's first runs on 1.2.34.

## Deploy route
PR -> "Validate Worker and extension" check -> merge to main (Ariel) -> automatic deploy.
Details per night: HANDOFF.txt.
