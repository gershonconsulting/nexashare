# Automatic Repost with your thoughts — 1.2.33

Authorized by the user on November 2, 2026. This pilot is enabled only for the
existing `olivier@attia.com` account. Other users keep plain reposting. Activity
contains an account-only on/off switch and the latest 30 exact-text outcomes.

The updated extension obtains its account mode at the start of each run. After
acquiring the existing cross-device reservation, it requests a short contextual
message (2–7 words, source language, known author only, no hashtags/emoji/pitch).
The generated text is cached per user and canonical post identity. Missing text
or generation failure stops the attempt; it never silently falls back to plain
reposting for the pilot.

The extension selects the matching post, opens LinkedIn's Repost with your
thoughts option, fills the composer, verifies the exact text, obtains a one-time
server submit authorization, and presses the native Post button once. Success
requires a new visible LinkedIn publication confirmation and a closed composer.
An absent confirmation or interrupted submission is held as unknown, not retried.
Existing manual drafts are preserved; existing plain reposts are not republished.
The feature adds accompanying thoughts, not a comment below the original post.

Migration `0021_automatic_repost_thoughts.sql` stores account settings, generated
text, submit intent, confirmed publication, failure/unknown state, original URL
and repost URL when exposed by LinkedIn. The weekly report lists automatic
thoughts separately from the older manual comment-draft pilot. A copied draft
is never counted as a confirmed publication.

Pilot collectors older than 1.2.33 are denied before obtaining a new reservation
while automatic mode is on. They must be updated/reloaded in the same unpacked
folder to preserve their local connection/history. No new permissions are added.

Tests cover the account boundary, origin/authentication, old-client gate,
canonical URL aliases, format validation, single-submit authorization, unknown
holds, per-post text reuse, weekly history and five-language synthetic composer
fixtures. Synthetic tests do not establish that a live LinkedIn repost occurred;
installation, generation and first publication must be reported separately.
