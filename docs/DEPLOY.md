# Deploy & analytics

## GitHub Pages

Pushing to `main` builds and publishes via `.github/workflows/deploy.yml`.

Enable Pages with **GitHub Actions** as the source. Pages is HTTPS, which tilt
steering needs.

```bash
npm run build   # static bundle in dist/
```

## Cloudflare Web Analytics (optional)

GitHub Pages has no built-in analytics. Privacy-first Cloudflare Web Analytics
is injected into `index.html` at build time (`vite.config.js`):

1. Cloudflare dashboard → **Analytics & logs** → **Web Analytics** → **Add a site**
2. Choose **Use JavaScript snippet** (no need to proxy DNS)
3. Copy the `token` from the snippet’s `data-cf-beacon`
4. Repo → **Settings** → **Secrets and variables** → **Actions** → add
   `VITE_CF_BEACON` = that token
5. Redeploy (`push` to `main` or re-run the workflow)

**Verify:** live site → View Source → `cloudflareinsights`, or DevTools →
Network → `beacon`. Ad blockers often hide the request.

Local builds stay beacon-free unless you set `VITE_CF_BEACON` in a `.env`
(see `.env.example`).

## Local HTTPS / tilt

The dev server is HTTPS on purpose. Device orientation only fires in a secure
context, so tilt steering does nothing over plain HTTP. Accept the self-signed
certificate warning on the phone when using `npm run dev:mobile`.
