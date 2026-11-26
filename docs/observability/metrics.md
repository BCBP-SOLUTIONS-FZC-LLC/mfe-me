# Metrics

The `me` remote's metrics under the Enterprise Platform Observability Standard. **Status: implemented.** This page is the inventory the code must match: the metrics are defined in `src/infrastructure/telemetry/metrics.ts` and recorded through the platform SDK's `/metrics` (`getServiceMeter`), behind the `MeTelemetry` port. Structure and rules follow `mfe-admin`'s metrics page. `test/unit/metrics/metrics.test.tsx` fails when this page, the code and the SDK's rules disagree (§Rules).

## Tier

| Tier | Used here | Why |
|---|---|---|
| 1 `platform_*` | None of our own | The registry's platform metrics describe servers, messaging and databases. The browser's Core Web Vitals are recorded by web-shell's `startWebVitals()` for the whole page. The IAM services emit their own server-side metrics; this remote does not repeat them |
| 2 `iam_*` | None | Services must not invent shared metrics; a proposal goes to observability governance first. None of the registry's `iam_*` entries overlaps |
| 3 `iam_me_*` | All below | Behaviour only this remote has |

The SDK builds the scope: inside web-shell, `domain` is this remote's manifest `ownerDomain` (`iam`) and `service` is its name (`me`), hence the prefix `iam_me_`. It injects `domain`, `service` and `environment` on every point, so the code cannot omit or misspell them. The shell exports the points (`initializeMetrics`, OTLP to `/otel`, only with telemetry consent). The standalone page exports nothing. The remote must be in the environment manifest with `ownerDomain: iam`, or the SDK drops the points and logs `me metrics unavailable` once.

## Compliance with the Enterprise Platform Observability Standard

| Standard | How this remote meets it |
|---|---|
| Decision tree (platform → domain → service) | Checked against the registry (`metric-registry.json`, schema in the SDK): the `platform_*` metrics describe servers, messaging and databases, and the `iam_*` ones are server-side auth, tenant, identity-sync and lifecycle events; none measures a browser screen's loads, writes or uploads. So these are **Tier 3**, `<domain>_<service>_<metric>` = `iam_me_*`. No `platform_*` or domain-shared metric is invented (rules 11 and 12); a proposal would go to observability governance first |
| Names | No service name inside a shared namespace; counters end in `_total`, histograms in `_seconds`; descriptive names (rules 1 to 6) |
| Central labels | `domain`, `service` and `environment` are injected by the SDK on every point, so the code cannot omit or misspell them (rule 8); the code declares none of them |
| Label governance | Every label has a closed value set in `domain/events/me-events.ts`; `outcome` uses the registry's vocabulary (`success`, `failure`, `error`); `resource`, `action` and `stage` are this service's own (Tier 3, no cross-service aggregation implied). No label is a registry-prohibited name or suffix (`user_id`, `email`, `tenant_id`, `path`, `url`, `*_id`, …), so nothing unbounded, and the presigned upload URL is never a label |
| CI validation | `test/unit/metrics/metrics.test.tsx` fails on a name outside `iam_me_*`, a registry or legacy name, a wrong suffix, a declared central or prohibited label, a value outside a registry vocabulary, a definition the SDK rejects, or an inventory that differs from the code |
| Backward compatibility | None needed: new service, no legacy metric to run in parallel or sunset |
| Dashboards, alerts, recording rules, SLOs, HPA | Proposed in [alerts-and-slos.md](alerts-and-slos.md); platform observability owns and deploys them (LLD §15 #17). No HPA: this remote has no pods of its own beyond a static nginx image |
| Runbooks, service documentation, inventory | [remote-load-failure](../runbooks/remote-load-failure.md), [ARCHITECTURE.md](../../ARCHITECTURE.md), and this page |

## Inventory

| Metric | Type | Labels (allowed values) | Meaning |
|---|---|---|---|
| `iam_me_loads_total` | counter | `resource` (`profile`, `availability`, `delegations`, `delegation_policy`, `members`, `user_profiles`, `departments`, `role_labels`, `ai_preferences`, `notification_preferences`), `outcome` (`success`, `error`) | Data loads that finished, by resource and outcome (`error` is an API, network or timeout fault). Loads superseded by a newer one are not counted |
| `iam_me_load_duration_seconds` | histogram | `resource` (`profile`, `availability`, `delegations`, `delegation_policy`, `members`, `user_profiles`, `departments`, `role_labels`, `ai_preferences`, `notification_preferences`), `outcome` (`success`, `error`) | Time from starting a load to its result. Superseded loads are not recorded |
| `iam_me_actions_total` | counter | `action` (`update_profile`, `revert_directory_value`, `upload_signature`, `remove_signature`, `set_availability`, `create_delegation`, `extend_delegation`, `reassign_delegation`, `cancel_delegation`, `save_ai_preferences`, `save_notification_preferences`), `outcome` (`success`, `failure`, `error`) | Writes that finished. `failure` is a business rejection (a rule refused it in the UI, or IAM answered a `4xx` such as `SELF_DELEGATION`, a `409` conflict); `error` is a fault (`5xx`, network, timeout, `503` service unavailable) |
| `iam_me_action_duration_seconds` | histogram | `action` (`update_profile`, `revert_directory_value`, `upload_signature`, `remove_signature`, `set_availability`, `create_delegation`, `extend_delegation`, `reassign_delegation`, `cancel_delegation`, `save_ai_preferences`, `save_notification_preferences`), `outcome` (`success`, `failure`, `error`) | Time from sending a write to its result |
| `iam_me_signature_upload_failures_total` | counter | `stage` (`prepare`, `presign`, `upload`, `confirm`) | Signature uploads that failed, by the stage they failed at: preparing the image, asking for the upload URL, the upload itself, or confirming it |

Plus `domain`, `service` and `environment` on every series (SDK).

**Labels never carry** a user, tenant, department or delegation ID, an email, a path, a URL or a free-text value (prohibited by the standard: `*_id`, `email`, `user`, `path`, …). `action`, `resource`, `outcome` and `stage` come from closed sets in `domain/events/me-events.ts` (`ME_ACTIONS`, `LOAD_RESOURCES`, `ACTION_OUTCOMES`, `LOAD_OUTCOMES`, `UPLOAD_STAGES`); a new value is added there and on this page in the same PR. The presigned upload URL is a credential and is never a label or a log field.

Cardinality per environment: at most 10 × 2 = 20 series for the load counter and 20 for its histogram; 11 × 3 = 33 for the action counter and 33 for its histogram; 4 for upload failures. Histogram buckets are the registry's `request_duration` preset. `outcome` uses the registry's vocabulary: `success`, `failure` (business rejections) and `error` (faults). A load has no business rejection, so it uses only `success` and `error`.

Not metrics, on purpose: page views and route changes (web-shell and the SDK name routes by template through `useRouteTemplate`), per-user activity (use the audit log, which IAM owns), and API latency by route (the SDK `/http` and the API's own `platform_http_request_duration_seconds` cover it).

## Where the code records them

The application layer defines the `MeTelemetry` port (`application/ports/telemetry.ts`); the closed value sets stay in `domain/events/me-events.ts`. `infrastructure/telemetry/metrics.ts` is the adapter and the only file that imports `/metrics`. Presentation and application never import it (enforced by arch-lint and `test/unit/architecture/layers.test.ts`). Instruments are made per call, not at module scope (the SDK binds an instrument to the runtime it was made in).

| Event | Port call | Metric |
|---|---|---|
| A query starts and finishes | `loadStarted(resource)` then `success` / `error` | `loads_total`, `load_duration_seconds` |
| A command is sent | `actionStarted(action)` then `success` / `failure` / `error` | `actions_total`, `action_duration_seconds` |
| A signature upload fails | `signatureUploadFailed(stage)` | `signature_upload_failures_total` |

The problem-to-outcome map in `infrastructure/api/problem.ts` (LLD §11) decides `failure` versus `error`, so the rule is in one place.

## Rules (checked in CI)

`npm test` runs `test/unit/metrics/metrics.test.tsx`. It checks:

| Rule | Check |
|---|---|
| Namespace | Every name starts with `iam_me_`; none is a `platform_*`, a registry metric (any tier) or a legacy name |
| Suffix | Counters end in `_total`, histograms in `_seconds` |
| Required labels | `domain`, `service`, `environment` are not declared (the SDK injects them) and appear on every recorded series with `iam` / `me` |
| Prohibited labels | No registry-prohibited name or suffix; at most 8 labels |
| Label vocabulary | Every label has a closed value set, enforced by `recordMetric`'s types; `outcome` values come from the registry's vocabulary |
| SDK compliance | With the remote in the manifest, the SDK accepts every definition |
| Inventory | This table matches `src/infrastructure/telemetry/metrics.ts` and `domain/events/me-events.ts` |
