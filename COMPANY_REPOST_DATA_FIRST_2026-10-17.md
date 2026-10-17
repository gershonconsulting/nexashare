# Company reposts: a data-first method (live test, 2026-10-17)

Follow-up to `COMPANY_REPOST_INVESTIGATION_2026-10-17.md`. This time the test ran in Olivier's
signed-in Chrome session (LinkedIn identity confirmed as Olivier Attia), against **MAbSilico**.

## What the live test proved

| Check | Result |
|---|---|
| `/company/mabsilico/posts/?feedView=all&viewAsMember=true` loads signed in | ✅ no auth wall, no admin redirect |
| The extension's own `extractCompanyPageFromDOM()` run in a **visible** tab | ✅ 2 posts at top of page, **19 posts** after the extension's 5 scrolls — all with real activity ids |
| LinkedIn injects an ad card into the feed (`urn:li:inAppPromotion:…`, "Feed post number 2") | ⚠️ harmless today (no activity id, skipped) |
| Feed order is chronological | ❌ **No.** Order was 5d, 2w, 1w, 4mo, 4mo, 4mo, 4mo, 2mo… "first card" is not "latest post" |
| Single-post permalink markup | Changed again: now the **new** hashed markup (0 `.feed-shared-update-v2`), Repost control has `aria-label="Repost"` |
| Latest MAbSilico post | `urn:li:activity:7515313026304987136`, 2026-10-12 07:30 UTC (Festival of Biologics, Basel) |

**Conclusion:** the company parser is not broken. It works whenever LinkedIn actually renders the
feed. The report's `linkedin_layout_unrecognized` failures come from the *environment* the
extension reads in: `withBackgroundTab()` opens an **unfocused** 1280×900 window and immediately
hands focus back to Olivier's window. On Windows, Chrome's occlusion tracking treats a window
hidden behind another as not visible, and LinkedIn then renders only the shell (header/nav
buttons are enough to pass `inspectLinkedInPage` as "ready", but there are no post cards).
Personal sources survive because `/recent-activity/` server-renders more of its content.

That also explains why every fix since September has been temporary: each one chased the markup,
but the real dependency is "LinkedIn must paint the page", which NexaShare does not control.

## The new method: discover from data, act on the post itself

Stop scraping the company feed. Split the job in two.

### 1. Discover — read LinkedIn's own feed data, no rendering needed

The company Posts page loads its posts from one GraphQL query:

    GET /voyager/api/graphql?queryId=voyagerFeedDashOrganizationalPageUpdates.<hash>
        &variables=(count:10,start:0,moduleKey:ORGANIZATION_MEMBER_FEED_DESKTOP,
                    organizationalPageUrn:urn:li:fsd_organizationalPage:<pageId>)

Verified live: replaying it from the LinkedIn tab with the session's `csrf-token` (the
`JSESSIONID` cookie value) returns **HTTP 200** and the activity URNs — `start:0` gave 10 posts,
newest first after sorting.

- **Latest = largest activity id.** Activity ids are snowflakes: `ms = BigInt(id) >> 22n`.
  `7515313026304987136 → 2026-10-12T07:30Z`. Exact, locale-proof, ignores pinned posts and
  LinkedIn's relevance ordering. Use this for "only repost posts newer than X" too.
- `queryId` hash rotates with LinkedIn deploys. Do not hard-code it: read it at runtime from
  `performance.getEntriesByType('resource')` after the company page has started loading (the
  page fires the query even before it paints), or keep the last good one and refresh on 400.
- `pageId` comes from the same request's `variables`, or from `voyagerOrganizationDashCompanies`.
  Cache it per source.
- Runs in a content script on any linkedin.com tab — the window can stay minimised/occluded,
  because nothing has to be painted.

### 2. Act — open the single post and use LinkedIn's real Repost control

For each new id: open `/feed/update/urn:li:activity:<id>/` (one post, small page, no feed
virtualisation, no ad cards), then click the control with `aria-label="Repost"` → choose the
instant option (`Repost` / "Repost instantly" / localized). Keep the human-like UI click for the
write; only the *read* moves to data. Confirm via LinkedIn's "View repost" toast as today.

Make this window visible for the few seconds of the click (focused, or at least not occluded),
then restore Olivier's focus — a single post is fast, unlike scrolling a whole feed.

### 3. Fallbacks, in order

1. Data discovery (above).
2. Current DOM parser on the company page, but in a window that is actually visible.
3. LinkedIn search → *Posts* → "From: <company>" → *Latest* — Olivier's screenshot showed
   "Repost instantly" available there.

Each source logs which path succeeded, so the weekly report can show it.

## Code changes this implies (not yet made)

- `chrome-extension/sync-core.js`
  - new `discoverCompanyPostsViaData(source)`: runtime `queryId` + `pageId` lookup, fetch with
    csrf, return `{ id, url, postedAt }[]` sorted by id desc.
  - `scrapeCompanyPostsOnce` calls it first; DOM parser becomes fallback 2.
  - `inspectLinkedInPage`: do not count header/nav buttons as "ready" — require at least one
    element with an activity id, otherwise report `linkedin_not_rendered` (new, honest reason).
  - `withBackgroundTab`: for the repost step only, keep the window visible until confirmation.
- `discoveryFailureDetail`: stop saying "stopped the batch" — the loop continues per source.
- Tests: fixture of the GraphQL response (ids only) + snowflake-date unit test.

## Not done in this session

- **No repost was made.** Clicking Repost publishes on Olivier's LinkedIn and needs his explicit
  go-ahead in chat for that specific post.
