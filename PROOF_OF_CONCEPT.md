# NexaShare proof-of-concept access
All authenticated accounts have free access with no trial expiry, paid feature gates, or subscription caps on sources, members, or reposts. Existing authentication, account isolation, user-controlled pauses, LinkedIn confirmation checks, retry controls, and technical resource protections remain in place.

The existing Stripe enrollment link stays available as optional paid enrollment for later use. Referral rewards remain stored. Neither a successful repost nor achieving 75% enables payment enforcement automatically.

Reporting shows a 75% target using confirmed / (confirmed + failed); skipped and already-reposted outcomes are excluded. Completed UTC reporting days determine target status; today is excluded. The comparison uses the unrounded ratio. The number of attempts and dates are visible, so a small sample is not represented as sustained proof.

Baseline from the report delivered October 7, 2026: 4 confirmed, 45 failed, 2 skipped, 8.2% success. Forty failures reported an unrecognized LinkedIn layout; five reported missing posts. This release changes access and measurement, not the LinkedIn parser. Live runs must demonstrate improvement before proof of concept is claimed.
