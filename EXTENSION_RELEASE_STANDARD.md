# Chrome Extension Release Standard

Use this standard for every application we build that includes a private or public Chrome extension.

## Required user experience

1. The application must read the installed extension version from the Chrome bridge.
2. It must compare that version with the release version published by the application.
3. A prominent red, fixed update warning must appear whenever the extension is missing or behind the release version.
4. The warning must disappear only after Chrome confirms the expected version.
5. Setup and troubleshooting must explain the installed version, expected version, connection state, and next recovery step.
6. Every extension setup page must offer both:
   - a versioned download from the application's own domain; and
   - a local-project-folder option for private testing, with a copyable absolute folder path and Load unpacked / Reload instructions.
7. The local option must never claim that a website can access the user's files automatically. It must instruct the user to select the folder in chrome://extensions.
8. Releasing an extension must update the manifest version, website expected version, package filename, setup page, dashboard warning, and release checks together.

## Private-test default

Until an extension is in the Chrome Web Store, preserve the local-folder route so a tester can reload the same unpacked folder without repeatedly downloading a ZIP.

## Release notice to report@ (standing rule, set by Olivier 2026-10-17)

Every new release of any Gershon Chrome extension must email **report@gershonconsulting.com** saying a new extension is available and must be downloaded on all client computers.

- NexaShare does this itself: `src/extension-release-notice.js`, run by the Worker's half-hourly cron. Bumping `CURRENT_EXTENSION_VERSION` is enough; add a line to `RELEASE_NOTES` for the version so the email says what changed. It lists the clients still on an older version.
- The same cron watches the other platforms through their public latest-version signal: Social (`/api/extension/version`), Radar (`LATEST_EXT_VERSION` on its home page), Pulse (`/api/extension-version`), Linalysis (the public repo's `linalysis-extension/manifest.json`). A platform only needs to keep that signal current when it releases.
- A platform added later: give it a public latest-version URL and add it to `WATCHED_EXTENSIONS`.
