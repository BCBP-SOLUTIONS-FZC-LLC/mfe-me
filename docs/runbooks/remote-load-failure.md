# Runbook: the My account area does not load in web-shell

For the on-call engineer. The My account remote (`me`) is loaded by web-shell's `loadRemote` at `/t/<slug>/me/*`. Symptoms: "Something went wrong. Try again." where the My account page should be, or the shell logs `remote failed to load`.

## 1. Tell the cases apart

| What you see | Likely cause | Check |
|---|---|---|
| Browser console: `remote "me": not in the remote manifest` | The environment's `/remotes/manifest.json` has no `me` entry, or the shell dropped it | `curl -s <shell>/remotes/manifest.json`. A dropped entry is logged by the shell as `remote dropped from the manifest` with the reason: a cross-origin `entry` needs its origin in `/config/runtime.json` `remotes.allowedOrigins`; an `ownerDomain` outside the SDK's registry (`iam` is valid) |
| The `remoteEntry.js` script is blocked or refused (integrity) | The manifest's `integrity` is not the sha384 of the `remoteEntry.js` being served (a new build with the old entry) | `curl -s <remote>/remoteEntry.js \| openssl dgst -sha384 -binary \| openssl base64 -A` and compare with the manifest entry (`dist/remote-manifest-entry.json` of that build) |
| `remote "me": incompatible` / share-scope error | The remote was built on a newer SDK than the shell serves (`requires ^<sdk>`) | Compare the SDK in the shell's CHANGELOG with `package.json`'s `frontend-sdk`. Roll the remote back, or upgrade the shell first (`.claude/skills/sdk-upgrade`) |
| Chunk 404s or the wrong content type | The CDN or ingress serves `index.html` for a missing chunk, or `/remotes/me/<version>/` is not routed | `curl -I` a chunk named in `remoteEntry.js`: it must be `200` JavaScript, `Cache-Control: immutable`, `Access-Control-Allow-Origin: *` |
| The page loads but every list says "could not be loaded" | The remote is fine; IAM or the gateway is not | The message carries the trace ID ("Copy details"); search it in the gateway and service logs. `503 …_UNAVAILABLE` means nothing changed |
| "My account" is missing from the sidebar | Not a load failure: the shell lists it only when the manifest has a `me` entry (and the kill switch `remote.me.disabled` is off) | The environment manifest and `/config/runtime.json` `remotes.killSwitch` |

## 2. Roll back

The remote is immutable per version (`/remotes/me/<version>/`). Point the environment's manifest entry back to the previous version (`entry`, `version`, `integrity` together, from that release's `remote-manifest-entry.json`). No shell change is needed. A page that is already open keeps the old container until it reloads.

## 3. Kill switch

To switch the admin area off for an environment without a deploy: add `me` to `remotes.killSwitch` in `/config/runtime.json`, or set the flag `remote.admin.disabled`. The shell hides the Admin link, and the SDK refuses to load the remote (`RemoteDisabledError`), so a direct visit to the route shows the shell's error state for that remote (check the exact wording in web-shell's LLD before quoting it to users).

## 4. Verify after a fix

`SMOKE_BASE_URL=<remote origin> ENVIRONMENT=<env> npm run test:smoke` (`test/smoke/README.md`): it checks the container global, the integrity in the manifest entry, the cache and CORS headers, and `runtime.json`.

## Signals to alert on (proposals; the platform owns the alerting)

`web-error` and remote-load error counts for `mfe="admin"` from the SDK; `iam_admin_loads_total{outcome="error"}` rate and `iam_admin_actions_total{outcome="error"}` rate (docs/observability/metrics.md has the queries and thresholds). An owner for these is still open (LLD §15 #9).
