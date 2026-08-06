import { defineConfig } from 'vite';
import basicSsl from '@vitejs/plugin-basic-ssl';

// The gyroscope only fires in a secure context, so `npm run dev:mobile` must be
// served over HTTPS to be testable on a real phone across the LAN.
export default defineConfig({
  base: './',
  plugins: [basicSsl()],
  server: { port: 5173 },
  // `base: './'` keeps asset URLs relative so the build works from the
  // /insta-speed/ project-page subpath on GitHub Pages.
  build: {
    target: 'es2022',
    // three.js alone is ~600 kB raw (~160 kB gzipped). Nothing to split further.
    chunkSizeWarningLimit: 800,
  },
});
