# Smoke tests

The remote as a browser (and web-shell) meets it, modelled on web-shell's `test/smoke`:
- the standalone document (no inline script, same-origin scripts, stylesheets and fonts, immutable);
- the SPA rule: only extension-less paths get `index.html`; a missing script, style or image is a `404`;
- the container: `remoteEntry.js` defines `__platform_mfe_me`, exposes `./App`, takes the SDK from the shell, revalidates, answers CORS, and every chunk it loads is immutable;
- the manifest entry the build wrote (`remote-manifest-entry.json`) carries the integrity of the `remoteEntry.js` served;
- `/config/runtime.json` validated by the SDK, uncached;
- no source maps, no dotfiles, gzip, `/healthz`, and the baseline security headers.

GET only. The suite is not part of `npm test`.

**Against the image** (what CI's `smoke` job runs through `.github/scripts/smoke-tests.sh`):

```sh
docker build --secret id=npm_token,env=NODE_AUTH_TOKEN -t mfe-me:local .
docker run -d --rm -p 127.0.0.1:18080:8080 mfe-me:local
SMOKE_BASE_URL=http://127.0.0.1:18080 npm run test:smoke
```

This mode also checks what only nginx decides: exact `404`s, `/healthz`, CORS and cross-origin resource policy on `remoteEntry.js`, and that the image ships no environment and no sign-in page in `runtime.json`.

**Against a deployment** (behind CloudFront, or until then an ingress with the mounted CSP and HSTS):

```sh
SMOKE_BASE_URL=https://me.dev.bcbpsolutions.com ENVIRONMENT=dev npm run test:smoke
```

A non-localhost URL selects `SMOKE_MODE=live`; set `SMOKE_MODE` to override. Live mode also checks the platform's security headers (CSP without `unsafe-inline`/`unsafe-eval`, `frame-ancestors 'none'`, HSTS, nosniff), and **is the deploy check**: set `ENVIRONMENT` to the environment being deployed, and the suite fails unless that deployment's `runtime.json` names exactly that environment. The gateway answers `/api` there, so the suite only asserts it never returns `index.html`.
