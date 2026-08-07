# NexaShare private Chrome extension

Current testing version: **1.2.2**

This extension is private and intended only for local, unpacked testing. It is
not configured for browser-store publication.

## First installation

1. Download `nexashare-extension.zip` from the NexaShare dashboard.
2. Extract it into a dedicated folder such as `NexaShare-extension-1.2.2`.
3. Confirm `manifest.json` is directly inside the extracted folder.
4. Open `chrome://extensions` in Chrome.
5. Enable **Developer mode**.
6. Choose **Load unpacked** and select the extracted folder.
7. Refresh the NexaShare dashboard and choose **Connect this browser**.

The website cannot install or update a Chrome extension automatically.

## Safe update

1. Do not remove the loaded extension. Removal erases its local connection and
   deduplication history.
2. Download the newest ZIP.
3. Replace the files in the same unpacked extension folder.
4. Open `chrome://extensions` and choose **Reload** for NexaShare.
5. Confirm the popup and dashboard both show version **1.2.2**.
6. Refresh the dashboard and reconnect only if it reports disconnected.

## Automatic testing behavior

- Chrome must be running.
- A signed-in LinkedIn tab must remain open.
- The extension checks once daily and can also run with **Sync now**.
- Each run attempts at most one new eligible post per enabled company.
- Confirmed and already-reposted post IDs are remembered locally.
- Paused companies are ignored.
- Success is recorded only after LinkedIn's visible control confirms it.

Clearing extension storage, removing the extension, or loading it under a new
extension ID clears local deduplication history.
