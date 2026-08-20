/**
 * Cloudflare Web Analytics (privacy-first, cookie-free).
 *
 * Enable by setting `VITE_CF_BEACON` to the site token from:
 *   Cloudflare dashboard → Analytics & logs → Web Analytics → Add a site
 *     → “Use JavaScript snippet” → copy the token from data-cf-beacon
 *
 * For GitHub Pages, add the same value as a repo secret named `VITE_CF_BEACON`
 * (Settings → Secrets and variables → Actions). The deploy workflow injects it
 * at build time. Local `npm run dev` stays beacon-free unless you put the
 * token in a local `.env`.
 */
const token = import.meta.env.VITE_CF_BEACON;

if (typeof token === 'string' && token.length > 0) {
  const script = document.createElement('script');
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token }));
  document.head.append(script);
}
