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

Extension 1.2.30 updates the website expected version, download links and
automatic release-notice notes together. Do not commit ZIPs: the deployment
workflow builds them from the extension folder. Existing unpacked installations
must reload their updated folder in Chrome. No Chrome Web Store submission is
part of this release.
