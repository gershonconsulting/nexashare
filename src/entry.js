// Worker entry (wrangler.toml `main`). Adds the read-only Client Platform Matrix feed
// (POST /api/matrix-stats, see src/matrix-stats.js) in front of the existing worker, so
// src/worker.js and its tests stay untouched. Everything else is passed straight through.
import worker, { CURRENT_EXTENSION_VERSION } from './worker.js';
import { MATRIX_STATS_PATH, handleMatrixStats } from './matrix-stats.js';

export default {
  fetch(request, env, ctx) {
    const path = new URL(request.url).pathname;
    if ((request.method === 'GET' || request.method === 'HEAD') &&
        (path === '/nexashare-extension.zip' || path === `/nexashare-extension-${CURRENT_EXTENSION_VERSION}.zip`)) {
      return new Response(null, { status: 302, headers: {
        Location: `https://github.com/gershonconsulting/nexashare/releases/download/extension-v${CURRENT_EXTENSION_VERSION}/nexashare-extension-${CURRENT_EXTENSION_VERSION}.zip`,
        'Cache-Control': 'no-store'
      } });
    }
    if (new URL(request.url).pathname === MATRIX_STATS_PATH) return handleMatrixStats(request, env);
    return worker.fetch(request, env, ctx);
  },
  scheduled(event, env, ctx) {
    return worker.scheduled(event, env, ctx);
  }
};
