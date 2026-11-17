# NexaShare canonical branding

`public/branding/nexashare-source.png` is the unchanged 200 × 200 user upload
`image(3).png` from the “Fix Missing App Icon” chat. Its red circle and white
share arrow are the canonical mark. Do not substitute a letter or redraw it.

Run `scripts/build-brand-icons.ps1` on Windows to regenerate the assets with
System.Drawing. It produces website PNGs at 16, 32, 48, 180, 192 and 512 pixels,
a 512-pixel maskable PWA icon with a 64-pixel white margin, a multi-size favicon
(16/32/48), and Chrome extension PNGs at 16/32/48/128. The 512-pixel assets are
upscaled from the supplied original; they do not add source detail.

All seven public HTML pages use the shared mark, favicon, Apple touch icon,
theme metadata and web app manifest. Dashboard views inherit the sidebar mark.
The manifest supplies shortcut/install branding; offline support is not added.

The deployed extension is `chrome-extension/`, packaged by the existing
Cloudflare GitHub Actions workflow. Its manifest and popup use the generated
PNGs. The unused former SVG has been removed. Root `manifest.json` and
`popup.html` are legacy cookie-extractor files, not the distributed extension;
their icon references now point to the same canonical PNGs.

Extension releases update the website expected version, download links and
automatic release-notice notes together. Do not commit ZIPs: the deployment
workflow builds them from the extension folder. Existing unpacked installations
must reload their updated folder in Chrome. No Chrome Web Store submission is
part of this release.

## Gershon red theme (extension 1.2.32)

The visual reference is `https://linalysis.net/`, with tokens read directly
from its public `common.css` on November 2, 2026:

| Token | Value |
| --- | --- |
| Brand | `#FE1B04` |
| Brand hover/dark | `#d11200` |
| Brand light | `#fff5f5` |
| Text | `#1d1d1f` |
| Muted text | `#6e6e73` |
| Border | `#e5e7eb` |
| Background | `#fafafa` |
| Card | `#ffffff` |

`public/branding.css` supplies shared tokens and the member workspace structure:
240-pixel sidebar, 64-pixel topbar, 12-pixel cards, and responsive content.
`public/landing.css` supplies the public page layout: centered hero, clearly
labeled sample workspace, feature cards, three setup steps, red call to action,
and grouped footer links. NexaShare retains its own content and routes.

The same brand palette is used in sign-in/onboarding/setup/admin pages, report
headers and links, the PWA theme metadata, and the extension popup. Outcome
colors still distinguish success, warning and failure. The canonical uploaded
icon itself is unchanged. Extension 1.2.32 includes the preceding 1.2.31
reliability fixes and changes the popup colors only.
