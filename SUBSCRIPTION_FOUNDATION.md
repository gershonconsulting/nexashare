# NexaShare subscription foundation

The member area presents an informational 30-day trial derived from the user's
account creation date and links to this existing Stripe-hosted checkout:

`https://buy.stripe.com/5kQdRb1rc6mvfcZ8yvcfK00`

If the first 30 calendar days end without a LinkedIn-confirmed repost, the
informational free-access state continues until the first confirmed repost.
Failed, skipped, already-reposted, and otherwise unverified outcomes do not end
this extension. Once a confirmed repost exists after the initial period, the UI
shows that the free period is complete, but does not enforce payment by itself.

This is a UI and API foundation only. It does not currently verify checkout,
activate a subscription, restrict product access, cancel access, or reconcile
Stripe state.

## Required before live enforcement

1. Decide which Stripe Product/Price the hosted checkout represents. Do not
   invent or display a price until this is confirmed.
2. Decide whether the 30-day trial is managed by Stripe, NexaShare, or both.
   Avoid creating two independent trial clocks.
3. Configure Stripe Checkout to identify the NexaShare user/team using a
   non-secret stable reference such as `client_reference_id` or approved
   metadata. The current fixed hosted link does not prove that mapping.
4. Add a Worker webhook endpoint and configure a Stripe webhook signing secret.
   Store it only as a Cloudflare Worker secret.
5. At minimum handle and idempotently persist:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_failed`
6. Add subscription/customer/price/status/period fields to D1 with a migration.
7. Verify webhook signatures from the raw request body, deduplicate event IDs,
   and record processing failures for retry.
8. Define entitlement rules for trial, active, past due, canceled, and expired
   states before blocking any feature.
9. Define whether subscriptions are per user or per team.
10. Test Stripe test mode end to end before enabling enforcement.

Until these decisions and integrations exist, the UI must continue to say that
checkout completion and activation are unverified.
