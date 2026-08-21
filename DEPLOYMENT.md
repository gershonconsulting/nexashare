# NexaShare production deployment

NexaShare is one Cloudflare application:

- Cloudflare Worker: API, OAuth callback, and application routing
- Cloudflare D1: application data
- Worker static assets: dashboard, login, registration, landing page, and extension ZIP
- Canonical application origin: `https://nexashare.com`

Hostinger is not an application deployment target. The former FTP workflow has
been removed. Hostinger may remain the registrar and email provider.

## Required domain decision

Cloudflare Worker Custom Domains require `nexashare.com` to be an active
Cloudflare DNS zone. On the standard Cloudflare setup, the registrar can remain
Hostinger, but the authoritative nameservers must point to Cloudflare.

Before changing nameservers:

1. Copy every current Hostinger DNS record into the Cloudflare zone.
2. Pay special attention to all email records: MX, SPF TXT, DKIM TXT/CNAME,
   DMARC TXT, and any mail/autodiscover records.
3. Disable DNSSEC at the registrar before the nameserver move if it is enabled;
   re-enable it using Cloudflare's DS values after the zone is active.
4. Change only the authoritative nameservers at the registrar.
5. Verify inbound and outbound email before deploying the custom domain.

Do not delete or replace email records. The Worker custom-domain deployment
creates the web records for `nexashare.com` and `www.nexashare.com`.

Keeping Hostinger as authoritative DNS while using these Worker Custom Domains
requires an eligible Cloudflare partial/CNAME enterprise setup. A normal manual
CNAME to `workers.dev` is not an equivalent or supported apex deployment.

## Cloudflare configuration

The Cloudflare account must contain:

- Active zone: `nexashare.com`
- Worker: `nexashare`
- D1 database: `nexashare-db`
- D1 database ID in `wrangler.toml`:
  `a282afe3-af5f-44e3-9982-c49dd5bd641d`
- Worker secret: `LINKEDIN_CLIENT_SECRET`
- Worker secret: `RESEND_API_KEY`
- Worker secret: `REGISTRATION_NOTIFICATION_TO` (the email address that receives
  each new-user alert)

Set the notification recipient without committing the address:

```bash
npx wrangler secret put REGISTRATION_NOTIFICATION_TO
```

Registration alerts are sent from the verified Resend sender
`NexaShare <hello@nexashare.com>`. They are queued after a new user is stored,
and a Resend failure does not block the user's first login.

The LinkedIn developer application must allow this exact OAuth redirect:

`https://nexashare.com/api/auth/callback`

The OAuth scopes intentionally remain `openid profile email`. NexaShare does
not call a LinkedIn posting API.

## Private Chrome extension

The extension remains private and locally installed for testing. Do not
configure or submit it to the Chrome Web Store. Follow
`public/LOCAL_EXTENSION_TESTING.md`.

For safe updates, replace files in the same unpacked extension directory and
choose **Reload** on `chrome://extensions`. Avoid removing the extension,
because removal clears its local connection and deduplication history.

## GitHub configuration

Create a GitHub environment named `production`. Add required reviewers if the
repository plan supports them, then add these environment secrets:

- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`

The API token should be scoped to the NexaShare account/zone only, with the
minimum permissions needed to deploy Workers, edit Worker routes/custom
domains and their DNS records, read the zone, and migrate the bound D1
database. In Cloudflare's token builder these are:

- Account → Workers Scripts → Edit
- Account → D1 → Edit
- Zone → Workers Routes → Edit
- Zone → DNS → Edit
- Zone → Zone → Read

Limit the account resource to the owning account and the zone resource to
`nexashare.com`. Do not store the token in the repository.

The workflow is intentionally manual (`workflow_dispatch`) until DNS and
secrets are ready. It:

1. Runs the Worker and extension checks.
2. Applies pending remote D1 migrations.
3. Deploys the Worker and the entire `public/` asset directory together.

It never uploads application files to Hostinger.

## First production release

1. Confirm the Cloudflare zone is active and email DNS is intact.
2. Confirm the GitHub `production` environment and both secrets exist.
3. Confirm the Worker secrets `LINKEDIN_CLIENT_SECRET`, `RESEND_API_KEY`, and
   `REGISTRATION_NOTIFICATION_TO` exist.
4. Confirm the LinkedIn redirect URL is updated.
5. Immediately before the first custom-domain deployment, remove only the old
   web-host records that conflict at `nexashare.com` and `www.nexashare.com`
   (A, AAAA, or CNAME). Do not remove MX or mail-related records.
6. In GitHub, open **Actions → Deploy NexaShare to Cloudflare → Run workflow**.
7. Verify:
   - `https://nexashare.com/`
   - `https://nexashare.com/login.html`
   - LinkedIn login and callback
   - dashboard company creation
   - extension browser connection
   - one manual Sync now run and one scheduled-run readiness check
   - confirmed and failed outcome history

After the first release is verified, automatic deployment on pushes to `main`
may be enabled by adding a `push` trigger. Keeping production manual is safer
until then.
