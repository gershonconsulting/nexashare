# NexaShare - STATUS

Last updated: 2026-11-18 (release on Olivier's OK)

## Current state
- Production extension: 1.2.34 (live since 2026-11-18 12:46 UTC, release extension-v1.2.34). Worker + site deploy from `main` via `.github/workflows/deploy.yml`
  (push to main = D1 migrations + Worker deploy + extension GitHub release + release-notice e-mail).
- ✅ PR #50 (1.2.34) merged on Olivier's OK ("All 10"); deploy ran, nexashare.com/api/health = 1.2.34.
- ✅ PR #33 (comment knowledge base + YES/NO/EDIT approval e-mails) merged with main; migration
  0023 is additive (CREATE TABLE/INDEX IF NOT EXISTS only). No extension change, stays 1.2.34.

## Done
- ✅ German direct repost "Sofort / Jetzt / Direkt teilen" recognised; "Mit Kommentar teilen" never chosen
  (Markus Bernasconi, user 10: 0 confirmed / 34 failed ever before this fix).
- ✅ Source redirecting to linkedin.com/company/unavailable/ reported as `source_unavailable`
  (Tunahan Cakir, user 9, source phitechbio: 90 failures since 11-10 mislabelled "layout not recognized").
- ✅ Admin report shows readable labels for discovery reasons.
- ✅ All deploy.yml validation scripts pass locally (Node 22).
- Note: 5 files were normalized CRLF->LF by the API push (whitespace-only).

## Open
- ❌ Tunahan's phitechbio source needs replacing/removing (data change, not done).
- ❌ #33: end-to-end approval e-mail + YES/NO/EDIT flow not yet tested on production.
- ❌ German fix verified on fixtures only; watch Markus's first runs on 1.2.34.

## Deploy route
PR -> "Validate Worker and extension" check -> merge to main (Ariel) -> automatic deploy.
Details per night: HANDOFF.txt.
