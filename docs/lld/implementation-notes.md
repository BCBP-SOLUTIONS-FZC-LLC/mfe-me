# Implementation notes

Where the build departs from, or has to settle something the LLD (`mfe-me-lld.md`) leaves open. The Swagger
(`docs/IAM_swagger/`) wins for wire shapes; the LLD wins for behaviour. Newest step last.

## Step 2: plumbing

- **No session-context refresh on `DENY_ROLE_INSUFFICIENT`.** `mfe-admin`'s `useTrackedMutation` refreshes P-35; this remote does not (LLD §5, §15 #14). A role denial shows "You don't have permission to do this."
- **`ProblemReader` differs from `mfe-admin`'s:** no `resolutionRequired` / `isRoleDenied`; adds `isReadOnlyDenied` and `fieldErrors`.
- **`DateTimeField` is a plain `datetime-local` control.** The profile-timezone conversion is in the domain as `wallClockToInstant` / `instantToWallClock` (step 3); the zone's offsets come from the SDK's `formatDate` in a presentation hook (step 5), because `dependency-rules.test.ts` bans `new Intl.` in `src/`.
- **413 on signature confirm** is mapped by status (`STATUS_KEYS`), as it carries no error code in the Swagger.

## Step 3: domain

- **Credentials are `key → string`, not `key → string[]`.** The User Profile Swagger types `credentials` as `additionalProperties: string` in `PatchUserRequest` and `UserResponse`, and the charset rule applies to each value. The LLD §6.1 had a list per key. The editor is rows of key and value; `delete_credentials` lists removed keys. The 32-key, 64-character limits are the LLD's (the Swagger gives none; the service re-checks).
- **DLG-2 and DLG-5 use different field names for the note.** Create sends `ooo_note`; reassign sends `reason` (no `starts_at`: the new delegation starts now, so its window is measured from now). The domain types are `DelegationCreate.note` and `DelegationReassign.reason`.
- **Reassign cannot make a fixed-end delegation open-ended.** The Swagger has no way to say "no end"; a draft with no end against a fixed end is "unchanged" (LLD §15 #6).
- **Only changed fields are validated.** A stored value that no longer passes (an old title, a language the shell dropped, a phone not in E.164) never blocks an unrelated edit.
- **`planNotificationPreferences` takes a third argument, the stored list,** to decide `no-change` and which unknown event types are "stored, kept as is" (LLD §6.3 lists two).
- **`planAvailability` / `planDelegation` take `now` as an `Instant`.** The rules never read the clock.
- **Delegation scopes and statuses are assumed** (`all` / `department` / `tender`; `scheduled` / `active` / `ended`): the Swagger types both as free strings (LLD §15 #6). `tender` is read but not offered (`OFFERED_SCOPES`, §15 #7).
- **`SignatureStoragePort.put` takes `Uint8Array`, not `Blob`,** so the domain has no DOM type; the adapter builds the request body.
- **`UploadSignatureUseCase` throws `SignatureUploadError { stage, cause, refusal }`.** For `presign` and `confirm` the `cause` is the SDK's problem (the screen maps erasure pending, 413, 422, 429 from it); the origin check lives in the storage adapter (the application layer cannot import the SDK's `/security`), so an origin refusal surfaces as stage `upload`. An abort is not counted as a failure.
- **No `snippet-empty` rule.** The LLD lists `template-empty` only; a blank context snippet is allowed.
- **Not wired yet:** the repository ports and `createUseCases` are not in `MeServices`/`composition.ts`; they join with their adapters in step 4. `MeOptions`, `ImageProcessor`, `Hasher` and `IdempotencyKeys` are ports only.

## Step 4: adapters and contract tests

- **DLG-4 (extend) answers a different shape.** `DelegationExtendResponse` is `{ delegation_id, record_version, review_due_at, review_last_warned_bucket }`, not a `DelegationResponse`, so `DelegationPort.extend` returns `DelegationExtended` (the screen re-reads the list). DLG-3 (cancel) answers the ended delegation; `cancel` returns nothing and the screen re-reads too.
- **The presign answer has no content type.** `PresignedUpload.contentType` is the one the request named; the adapter fills it in.
- **A confirm status picks `created` or `replaced`** (`201` / `200`); the swagger names no field for it.
- **Unknown notification channels are left out on read.** The Swagger types `channels` as free strings; a channel this remote does not know is dropped (not shown raw), so a save sends the known ones only.
- **Unknown delegation scopes and statuses fail the read** (`MappingError`). The Swagger leaves both as free strings (LLD §15 #6); `pin.test.ts` has a tripwire for when IAM types them.
- **The upload origin check is stricter than `isAllowedOrigin`.** That SDK helper also allows the page's own origin; the storage adapter requires https and an exact entry of `me.signature.uploadOrigins` as well, and `createMeOptions` keeps only exact https origins (no path, no wildcard host, no http).
- **The upload error never holds the URL.** `SignatureStorageError` carries a reason and a status; a fetch failure's own error (which may echo the URL) is not kept as its cause. The caller's abort passes through untouched.
- **No `trim` in the image processor.** LLD §7.3 says "crop/trim"; only the crop is built (the cropper UI in step 5 may add an auto-trim of empty margins).
- **`Intl.supportedValuesOf` is read in `options.ts`** (not `new Intl.`, which the SDK rule bans); where the browser cannot list zones the list is empty and the profile keeps its saved zone.
- **`MeServices` now holds the ports and the browser tools**, and `useMeUseCases()` builds the use cases from them. `useMeKeys`/tracked hooks are unchanged.
- **Contract harness additions:** it captures request headers and checks a required header the Swagger declares (DLG-2's `Idempotency-Key`); it reads headers from the `fetch` init (the DOM test environment drops them when a `Request` is copied).
- **Contract tripwires** (`pin.test.ts`): #4 (no signature read), #5 (no ended reason or filter), #6 (free-string scope and status, note limit), #10 (no version on notification preferences), #21 (no avatar), credentials as `string → string`, P-4 without search, and the confirm's 413 and 422 answers.
- **Not covered by a contract test:** the presigned PUT to storage (it is not in the IAM Swagger; `signature-storage.test.ts` pins its request instead).

## Step 5: screens

- **Section tabs are drawn by this remote** (LLD §15 #1, proposed option): `MeLayout` has a `nav` of six links (Profile … Security), no header, user menu or sign-out. If web-shell adds an Account sub-menu later, drop the strip.
- **Credentials are rows of name and value** (see step 3), not lists. The profile form edits them with `CredentialsEditor`; removed rows go in `delete_credentials`.
- **Profile form keeps its draft across a save.** The form is keyed by a "generation" that changes only on Reload after a conflict, so "Saved" survives the save (keying by version would remount it). After a save or a revert the draft is set from the server's answer.
- **Conflict dialogs show the draft, then Reload re-reads and starts from the server's record.** The LLD's "keep the draft beside the reloaded values" is the draft list inside the dialog; after Reload it is gone.
- **The 404 "being set up" retry lives in `ProfilePage` only** (`useMyProfile({ retryNotReady: true })`); other readers of my profile (the zone, the formatters) do not retry, so there is one retry, not one per reader. The profile query has a 60 s stale time so several readers share one request. `profileRetry.delayMs` is mutable so a test can shorten the 10 s.
- **A read-only workspace is a banner plus disabled controls** (`ReadOnlyNotice`, `canWrite`). A `403 DENY_TENANT_READ_ONLY` after the fact shows `errors.readOnly` as the failure text; there is no separate mode switch (LLD §15 #15 is still open).
- **Dates are wall-clock text in my profile zone**, converted by the domain with an offset reader from the SDK's `formatDate` (`features/time/zone.ts`). A saved zone the browser does not know falls back to the browser's zone instead of throwing (found by a test: `formatDate` raises a `RangeError` for it).
- **G3 create dialog blocks an out-of-office delegate** (the service would answer `DELEGATE_UNAVAILABLE`); it opens prefilled from G2 through `?create=1&from=…&until=…`, once the profile's zone is known.
- **G3 create: "still saving" re-reads the list after 2 s and never resends with a new key**; the key is kept in a ref and made again only after a field changes.
- **Account console deep links are all the root** (LLD §15 #13): `ACCOUNT_PATHS` maps every section to `''`; `MeNavigation.accountConsoleUrl` and `isSharedConsole` (trial realm) are the only places that know.
- **The signature cropper is four sliders (percent), not a drag box,** with an outline preview; a drag cropper can replace it later. Auto-trim is not built. Where `me.signature.uploadOrigins` is empty, Upload is hidden and Remove stays.
- **"Signature saved {time}" uses the browser clock** (the card has no server time for it; `SignatureConfirmation.updatedAt` is not shown because it is a server time the screen cannot compare).
- **Notification form is not re-keyed** by the server's list: it holds its rows and shows the server's answer after a save by keeping them; Reset rebuilds them as defaults.
- **Test seams:** `test/fixtures/fakeIam.ts` is an in-memory IAM behind the ports (real optimistic locking, per-method queued failures); the fetch-level fake IAM is step 6.
- **a11y:** axe runs over every screen and dialog state with `region` off (pages render without the layout); contrast is for the browser suite (step 6).

## Step 6: hardening

- **The fake IAM at the network is held to the Swagger.** `test/fixtures/fakeIamServer.ts` answers the real adapters' requests (snake_case, problems with an `errorCode`, optimistic locking, idempotency, cursors, a presigned-URL storage), and runs every request and success answer through the contract harness; a mismatch is recorded and fails the e2e test. It reproduces what DLG-5 does on a failure: the old delegation is gone and the new one is not created.
- **Real bugs the hardening found, fixed with tests:** (1) the section tabs were linked relatively under a splat route, so a click from a nested page went to `/me/<page>/<tab>` (now `meBase(pathname)`); (2) a reassign sent an end date one second early when the service's end had seconds (now only a touched end is sent); (3) the active tab and every message colour failed WCAG AA contrast (new Aura message inks and `notice` classes).
- **The browser suite runs the anonymous standalone page.** With no shell there is no identity, so no screen has data there; contrast of the messages, notices, badges and controls is checked by rendering the same classes on the built stylesheet. A harness with a mock session (as `mfe-admin`'s `dev/harness.tsx`) was not built.
- **The image smoke suite passes** against `docker build` output (34 passed, 4 live-only skipped). The nginx image's CSP is `connect-src 'self'`: the signature bucket origin belongs to the platform CSP (ADR 0006).
- **`web-shell` integration (LLD §15 #16), done after approval:** `me` (port 5007, `ownerDomain: iam`) is in web-shell's `config/remotes.local.json` and `remotes.allowedOrigins`; its browser server can serve a real `mfe-me` build (`ME_DIST`, a generalised `builtRemote`), with `test/browser/me.spec.ts` (load, tabs, G6) and `test-contract` running it. It passes in Chromium; the shell's own browser spec still passes. Uncommitted in the web-shell repository.

## Reuse of the SDK (platform-reactcommon): what was removed as a duplicate

An audit of this remote's own helpers against the SDK's exports (`frontend-sdk` subpaths, source in `platform-reactcommon`) found three duplicates, now removed; the rest have no SDK counterpart.

| Was | Why it duplicated the SDK | Now |
|---|---|---|
| `isRetryableQueryError` and query retries in `queryClient.ts` (LLD §11, ADR 0001 as first written) | `ApiClient` already retries safe calls twice on network faults, timeouts, 429, 502, 503 and 504 with `Retry-After`; a second layer made up to nine attempts | TanStack retries nothing; the SDK retries |
| `lazyApiClient` around `createApiClient({ mfe })` | `useApiClient()` gives the client bound to the nearest MFE scope (`RemoteBoundary` in the shell, `MFEErrorBoundary` standalone) | `MeProviders` passes `useApiClient()` to `createMeServices({ client })`; the remote no longer imports `/http` directly |
| `crypto.randomUUID()` for idempotency keys | `newRequestId()` (`/core`) is the UUID the client makes for the same header | `uuidKeys = { next: newRequestId }`; the remote now takes `/core` from the shell (shared keys: auth, config, core, i18n, logging, metrics, nav, problem, react, security + react) |

Kept on purpose, with no SDK equivalent: `userBatcher` (200-ID chunking), the `errorCode` → catalogue map (the SDK covers the generic and gateway-deny sentences, `problemMessage`, which is the fallback), `useFocusTrap` and `Dialog`, `wallClockToInstant` with the offset read through `formatDate`, `useWorkspacePrefix` (builds a path from `slugFromPath`'s inputs), the closed-vocabulary metric wrapper around `getServiceMeter`, and the signature `fetch` (ADR 0006: `ApiClient` takes templates only).

## Production-readiness review (2026-11-26)

Found and fixed: (1) the signature preview used a `blob:` URL, which the platform CSP (`img-src 'self' data:`) blocks, so production would show a broken image (happy-dom has no CSP; now a `data:` URL, tested); (2) `AbortSignal.any` was assumed in the storage adapter (missing before Safari 17.4 and Firefox 124): now a fallback; (3) a file that cannot be read after it was picked rejected unhandled: now a message; (4) `playwright-report` and `test/browser/.build` were not git-ignored; (5) the LLD still described the pre-build design: now version 0.2 with the corrections.

## Files that were missing against mfe-admin, now added (2026-11-26)

- `dev/harness.tsx`, `dev/mock-iam/{core,server}.ts` and the scripts `dev:harness`, `dev:mock-iam` (the fake IAM from the e2e tests moved to `dev/mock-iam/core.ts`, free of test libraries; `test/fixtures/fakeIamServer.ts` wraps it with the Swagger check). `rsbuild.config.ts` adds the harness entry when `ME_HARNESS=1`.
- `test/browser/harness.spec.ts`: the real screens with data in Chromium, light and dark. It found one real defect: the primary button faded on hover (`hover:opacity-90`), dropping white-on-pink below AA; it now darkens (`hover:brightness-90`).
- `.claude/` (`CLAUDE.md` rewritten for this repo; `operations.md`, the `gate`, `sdk-upgrade` and `stack-sync` skills and the edit, lint and stop hooks carried over). Not carried over, because they encode `mfe-admin`'s screens: the reviewer agents, the `new-screen` skill, and `architecture.md` and `request-flows.md` (`ARCHITECTURE.md` covers this repo).
- `docs/lld` handoffs (`app-chrome`, `sdk-api-client`, `session-context-refresh`, `shared-components-and-navigation`, `web-shell-iam`) were not copied: they are `mfe-admin`'s and the LLD cites them by name only.
