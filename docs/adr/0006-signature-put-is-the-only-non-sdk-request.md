# ADR 0006: The signature PUT is the only request not made through the SDK `ApiClient`

## Status

Proposed (2026-11-26), for review with platform-reactcommon and platform deployment (LLD §15 #3). Implemented as proposed.

## Context

A signature (IAM-UX-13) is uploaded in three steps: User Profile issues a short-lived presigned URL, the browser PUTs the bytes straight to object storage, and User Profile confirms the key and the SHA-256. The PUT goes to **another origin**, must carry **no token, cookie, trace or session header**, and must not follow a redirect. The SDK `ApiClient` takes route templates only: it always prefixes `api.baseUrl`, adds the token and the correlation headers to same-origin calls, and cannot address an absolute URL.

## Decision

- One file, `src/infrastructure/api/signatureStorage.ts`, calls `fetch` directly: `PUT`, `credentials: 'omit'`, `redirect: 'error'`, `referrerPolicy: 'no-referrer'`, a 60 s deadline, and `Content-Type` exactly as presigned.
- Before it, the URL must be **https and an exact entry of `me.signature.uploadOrigins`** (and pass the SDK's `isAllowedOrigin`, which on its own also allows the page's origin). The upload URL is a bearer credential until it expires: it is never logged, shown, stored or put in an error or a metric label.
- `test/unit/sdk/dependency-rules.test.ts` allows `fetch` in that file only; `signature-storage.test.ts` pins the request; the e2e flow proves no `Authorization`, cookie or correlation header leaves.
- The image is decoded, cropped and **re-encoded as PNG** in the browser first, so no EXIF or embedded payload reaches storage; the server re-hashes and checks the key belongs to the caller.

## Consequences

- Platform deployment must add the bucket origin to the platform CSP's `connect-src` and a CORS rule for `PUT` with `Content-Type` from the app origin. The nginx image's own CSP (`connect-src 'self'`) is for the standalone page and does not include it. Until then Upload fails at the `upload` stage ("We couldn't upload your signature") and the rest of G1 works.
- If platform-reactcommon adds a `putToPresignedUrl` helper (allow-listed origin, no credentials, timeout, no redirects), `signatureStorage.ts` goes and this ADR is superseded.
