# Versioning

This repository is a **deployed micro-frontend remote**, not an npm library. `package.json` is `"private": true`; its `name` (`mfe-me`) identifies the repository. The versioned artifacts are the container image `ghcr.io/bcbp-solutions-fzc-llc/mfe-me` and the release `dist` tarball. SemVer applies to the **runtime contract** with web-shell and the platform (LLD §4).

| Change | Version |
|---|---|
| Renaming the container (`me`) or its global (`__platform_mfe_me`); removing `./App` or adding a required prop; a route removed or renamed; `ownerDomain` changed; a metric renamed or removed (`docs/observability/metrics.md`) | **MAJOR** |
| A new route, screen, permission key the shell must grant, shared SDK subpath, or metric label value | **MINOR** |
| Fixes and changes inside a screen with no contract effect | **PATCH** |

The contract, in full, is `docs/lld/mfe-me-lld.md` §4:

- **Container:** name `me`, `remoteEntry.js`, `var __platform_mfe_me` defined synchronously, `exposes['./App']`.
- **Routes:** `/t/<slug>/me` (index), `/t/<slug>/me/{availability,delegations,ai,notifications,security}`; standalone `/me/*`.
- **Platform packages:** `webpack-preset`, `eslint-plugin` and `frontend-sdk` are equal, and never newer than web-shell's.
- **Release assets:** `mfe-me_vX.Y.Z_dist.tar.gz`, `mfe-me_vX.Y.Z_remote-manifest-entry.json` (`entry`, `version`, `ownerDomain` `iam`, sha384 `integrity`), `checksums.txt`, `provenance.slsa.json`, `sbom.cyclonedx.json`.
- **Metrics:** names, labels and label values in `docs/observability/metrics.md`.

## Compatibility

| mfe-me | Container / manifest key | Platform packages | Needs web-shell |
|---|---|---|---|
| *next* (`main`) | `me` | `1.0.0-alpha.10` | on alpha.10 (web-shell `0.5.0`), with the `/me/*` route |

See [CHANGELOG.md](CHANGELOG.md) for what each release changed.
