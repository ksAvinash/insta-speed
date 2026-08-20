import { defineConfig, loadEnv } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

/**
 * Inject Cloudflare Web Analytics into index.html when VITE_CF_BEACON is set.
 * Putting the beacon in the HTML (not behind the game module) makes it show up
 * in View Source / Network immediately and matches Cloudflare's snippet.
 */
function cloudflareBeacon() {
  return {
    name: 'cloudflare-beacon',
    transformIndexHtml(html, ctx) {
      const env = loadEnv(ctx.server ? 'development' : 'production', process.cwd(), '');
      const token = env.VITE_CF_BEACON || process.env.VITE_CF_BEACON || '';
      if (!token) return html;
      const snippet = `<!-- Cloudflare Web Analytics -->
    <script defer src="https://static.cloudflareinsights.com/beacon.min.js" data-cf-beacon='{"token":"${token}"}'></script>
    <!-- End Cloudflare Web Analytics -->`;
      return html.replace('</head>', `    ${snippet}\n  </head>`);
    },
  };
}

// The gyroscope only fires in a secure context, so `npm run dev:mobile` must be
// served over HTTPS to be testable on a real phone across the LAN.
export default defineConfig({
  base: './',
  plugins: [basicSsl(), cloudflareBeacon()],
  server: { port: 5173 },
  // `base: './'` keeps asset URLs relative so the build works from the
  // /insta-speed/ project-page subpath on GitHub Pages.
  build: {
    target: 'es2022',
    // three.js alone is ~600 kB raw (~160 kB gzipped). Nothing to split further.
    chunkSizeWarningLimit: 800,
  },
});
