# Company Repost Failure Investigation

**Date:** 2026-10-17  
**Repository reviewed:** gershonconsulting/nexashare, default branch main  
**Purpose:** Record what the weekly repost report and follow-up screenshots establish, trace the failure stage in the extension, and document the limits of the attempted manual test.

## Executive summary

The report shows that reposting from personal LinkedIn sources is being confirmed, while the company sources shown are failing. The failure is reported as:

> LinkedIn loaded, but its post-card layout was not recognized. NexaShare stopped the batch to avoid repeated failures and scheduled a controlled retry.

This points to company-source post discovery, before NexaShare reaches LinkedIn’s repost menu. The user supplied a screenshot showing LinkedIn’s “Repost instantly” action on a MAbSilico post. The action is plainly available to a person, and the extension’s English-language click logic recognizes that label. However, the screenshot is from LinkedIn’s mobile search-results view, while the extension opens the company Posts feed in a separate Chrome window. The screenshots therefore do not establish that the extension’s company-feed parser sees the same card or controls.

A manual repost was attempted in the connected browser at the user’s request. LinkedIn redirected that browser to its sign-up/auth wall. No repost was made.

## Evidence from the report

The supplied report screenshot shows three personal-source rows marked confirmed. LinkedIn said it confirmed each repost and supplied a View repost link.

At least four company-source rows visible in the screenshot are marked failed: Gershon Consulting, The Transatlantic Lawyer®, the wave momentum, and MAbSilico. Each visible company failure carries the same post-card-layout error. The screenshot is cropped and does not establish whether more company rows follow.

The visible confirmation-rate row shows 12.5% compared with 9.7%, a displayed increase of 2.8 percentage points. The crop does not show the full metric heading or reporting period, so those should not be inferred.

## LinkedIn screenshot supplied for MAbSilico

The screenshot shows a MAbSilico post in LinkedIn’s search results: the top search field contains “MAbSilico,” with “Posts” and “Past week” filters. The post action menu is open and visibly offers “Repost with thoughts” and “Repost instantly.”

This confirms that LinkedIn exposes an instant-repost option on that post in the user’s mobile search-results view. It does not show the page DOM or route used by the Chrome extension.

## Code path reviewed

The current main branch manifest declares extension version 1.2.27. The report screenshot does not show which installed extension version generated the report, so version parity between the report and main cannot be confirmed from the supplied image.

In chrome-extension/sync-core.js:

- Personal sources navigate to the member activity route, /in/{vanity}/recent-activity/all/.
- Company sources navigate to /company/{vanity}/posts/?feedView=all&viewAsMember=true.
- The extension first waits for LinkedIn page readiness, then runs extractCompanyPageFromDOM to discover posts.
- The extractor looks for known post-card structures and activity IDs in data attributes or linked URLs. It also has a text-hash/in-place fallback when it can associate repost controls with a post’s text.
- If extraction yields no posts after the page was considered ready, scrapeCompanyPostsOnce returns linkedin_layout_unrecognized. That path occurs before repostContent and before clickAndConfirmRepost are called.
- Once it has a post to act on, clickAndConfirmRepost includes “Repost instantly” in its English direct-repost matching logic.

This explains why a menu can look obvious on screen while the report still records a card-layout error: the observed failure is earlier in the automation than selecting that menu item. The evidence points to source-page/card discovery as the primary issue; it does not prove the precise DOM element or selector that failed.

The extraction code includes localized repost-control text for several languages. The supplied report is more consistent with a company-page/layout difference than a general language issue, but the report alone cannot rule out a locale-specific DOM difference.

## Report wording versus current loop behavior

The report’s failure detail says NexaShare “stopped the batch.” In the current main-branch sync loop, a failed source is caught and logged per source, and a code comment says one LinkedIn layout problem must not abort the remaining sources. The same code schedules a retry when discovery failures occur. The email detail string may therefore overstate the effect of one company failure. The actual run log should be checked to determine whether later sources were processed in this run.

## Diagnostic capture and remaining evidence gap

The extension’s captureDiagnostic function records the page URL, title, a sample of visible text, visible controls, source metadata, detectors, and a layout fingerprint, then posts that data to /api/extension/diagnostics. The matching route in src/index.js stores the diagnostic in the extension_diagnostics table.

In the inspected src/index.js route, diagnostics are accepted and written, but no corresponding read route was found. The raw failure payload therefore still needs to be retrieved through an authorized database or administrative path. That payload is the evidence needed to name the exact company-feed markup NexaShare missed.

## Manual test attempt

At the user’s request, the connected browser was navigated to MAbSilico’s company Posts page. LinkedIn redirected it to a Sign Up/auth-wall page. The browser had no usable signed-in LinkedIn session. No post menu was opened and no repost was submitted.

This was a blocked test, not a successful repost and not a test of the extension parser. The user-provided mobile screenshot is not a substitute for an authenticated desktop Chrome session.

## Findings and next verification steps

1. Retrieve the most recent discovery_failed diagnostic for MAbSilico and compare its URL, title, visible text, controls, detector names, and layout fingerprint with the company-page extraction code.
2. Confirm the extension version recorded for the report run. Compare it with the current main manifest version, 1.2.27, before attributing the failure to a particular shipped build.
3. Verify from the run logs whether processing continued after each failed company source, since the report wording and current loop comment do not align.
4. Update company-feed extraction only after the captured page state identifies the actual mismatch. Add a regression fixture or focused test for the observed company-card markup.
5. Run a live, signed-in test against a company source and a personal source. Confirm the extension identifies the intended latest post, opens the correct card’s action menu, selects “Repost instantly,” and records LinkedIn’s confirmation.
6. Report the tested extension version and release date with the result. Do not claim the company repost path is fixed until the live test is confirmed.

## Status

**Root-cause category:** Company-source post discovery/layout recognition, before repost-menu selection.  
**Exact markup mismatch:** Not yet identified; requires the stored discovery diagnostic.  
**Manual live repost test:** Blocked by LinkedIn sign-up/auth wall; no repost was made.  
**Code or extension changes:** None made as part of this investigation report.
