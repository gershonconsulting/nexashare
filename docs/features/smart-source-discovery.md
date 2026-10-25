# Smart Source Discovery — Product and engineering specification

Status: Proposed / approved for documentation (not implemented)
Date: 2026-10-25
Priority: Next development release, without delaying repost reliability fixes.

## Goal
When a Nexashare user manually reposts a LinkedIn post from an author not already configured as a source, suggest adding that person or company to their repost sources. Never add a source or enable automated reposting without explicit user consent.

## MVP workflow
1. With opt-in consent, the Chrome extension observes a manual LinkedIn repost confirmation or other reliable, user-visible signal while the extension is active. Do not assume access to all historical reposts.
2. Resolve the **original post author**, distinguishing a person from a company. Record canonical LinkedIn author URL/ID, original post URL/ID, event time and confidence. Do not confuse the reposter with the original author.
3. Compare normalized source identity against the current user's configured sources, including aliases and canonical URLs.
4. If not present, create a deduplicated suggestion under **Intelligence > Source Discovery**. Show author/company, link, example post, why suggested, and actions: **Add source**, **View profile**, **Dismiss**.
5. On **Add source**, require explicit confirmation of source and repost settings. Reuse the existing source configuration and validation workflow. Do not automatically repost the triggering post.
6. Suppress repeated dismissed suggestions for a configurable period; allow user to revisit dismissals.

## AI
Use existing Cloudflare AI integration; no new API keys. AI can summarize topic relevance, hashtags and rationale, with optional 0–100 relevance score. Identity extraction, deduplication, permissions, and add-source actions must be deterministic and must not rely on AI guesses. Do not present scores as proven until calibrated.

## Data and safeguards
- Suggested data model: user_id, author_type, canonical_author_id/url, original_post_id/url, detection_method, detection_confidence, first_seen_at, last_seen_at, occurrence_count, relevance_score, status (pending/added/dismissed), consent timestamps.
- Unique constraint on (user_id, canonical_author_id); idempotent event processing keyed by user and original post.
- Respect per-user privacy and opt-in. Minimize stored content; offer disable and delete controls.
- Do not scrape in the background or claim unrestricted LinkedIn API access. Validate browser-extension permissions and LinkedIn policy constraints before implementation.
- Reuse the existing **duplicate-post prevention** checks so source discovery never causes a second repost.
- Keep source discovery separate from automatic repost execution.

## Reporting
Mobile-friendly weekly Intelligence report: newly discovered sources, pending suggestions, accepted/dismissed counts, and most relevant sources. Only count confirmed detections as detected reposts; separately report uncertain candidates.

## Acceptance criteria
- Manual repost of an unlisted person creates one accurate suggestion when detectable.
- Manual repost of an unlisted company creates one accurate company suggestion when detectable.
- Existing sources, repeat events, and URL variants do not create duplicate suggestions.
- Add requires approval and respects user-specific settings; dismiss prevents immediate resurfacing.
- No duplicate repost is initiated; existing repost reliability remains unaffected.
- Unsupported LinkedIn layouts or inaccessible history produce an honest 'not detected' outcome rather than invented activity.
- Works on supported LinkedIn language variants, with screenshots and structured diagnostics for failures; test person/company, success/failure, and multiple extension versions.
- Mobile report is readable without horizontal scrolling.

## Implementation notes
Start with a short technical spike: inspect existing extension repost detection, source identity model, deduplication, Cloudflare AI hooks, and reporting architecture. Add instrumented tests and screenshots before rollout. Feature-flag the MVP, pilot with test accounts, then expand. Do not compromise the ongoing target of >=90% repost success.
