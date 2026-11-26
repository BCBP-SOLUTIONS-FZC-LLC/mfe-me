# Alerts, recording rules and SLOs (proposed)

**Status: proposed.** Platform observability owns and deploys the dashboards, alert rules and SLOs (LLD §15 #17); these are the definitions this remote asks for, written against the metrics in [metrics.md](metrics.md). Every metric named here must exist there: `test/unit/metrics/alerts-doc.test.ts` fails if one does not. Histograms are queried through the standard `_bucket`, `_sum` and `_count` series. The series carry `domain="iam"`, `service="me"` and `environment`.

Telemetry is exported only with the member's consent and only from inside web-shell, so these describe consenting sessions, not all traffic. The browser's page-level health (Core Web Vitals) is web-shell's.

## Recording rules

```yaml
# Share of data loads that failed, by resource, over 5 minutes.
- record: iam_me:load_error_ratio:rate5m
  expr: |
    sum by (environment, resource) (rate(iam_me_loads_total{outcome="error"}[5m]))
    /
    sum by (environment, resource) (rate(iam_me_loads_total[5m]))

# Share of writes that ended in a fault (not a business rejection), by action.
- record: iam_me:action_error_ratio:rate5m
  expr: |
    sum by (environment, action) (rate(iam_me_actions_total{outcome="error"}[5m]))
    /
    sum by (environment, action) (rate(iam_me_actions_total[5m]))

# p95 time to load, by resource.
- record: iam_me:load_duration_seconds:p95_5m
  expr: histogram_quantile(0.95, sum by (environment, resource, le) (rate(iam_me_load_duration_seconds_bucket[5m])))
```

## Alerts

```yaml
- alert: MeLoadsFailing
  expr: iam_me:load_error_ratio:rate5m > 0.05
  for: 10m
  labels: { severity: warning }
  annotations:
    summary: "More than 5% of My account loads of {{ $labels.resource }} fail"
    runbook: docs/runbooks/remote-load-failure.md

- alert: MeWritesFaulting
  expr: iam_me:action_error_ratio:rate5m > 0.02
  for: 10m
  labels: { severity: warning }
  annotations:
    summary: "More than 2% of {{ $labels.action }} writes end in a fault (5xx, network, timeout)"

# A write that members keep failing at the upload step: the bucket CSP or CORS (ADR 0006) or storage itself.
- alert: MeSignatureUploadFailing
  expr: sum by (environment, stage) (increase(iam_me_signature_upload_failures_total{stage=~"upload|confirm"}[15m])) > 5
  labels: { severity: warning }
  annotations:
    summary: "Signature uploads fail at the {{ $labels.stage }} step"
    runbook: docs/adr/0006-signature-put-is-the-only-non-sdk-request.md

- alert: MeLoadsSlow
  expr: iam_me:load_duration_seconds:p95_5m > 3
  for: 15m
  labels: { severity: info }
  annotations:
    summary: "p95 load time of {{ $labels.resource }} is over 3 seconds"
```

Business rejections (`outcome="failure"`: a conflict, a rule the service refused) are expected behaviour and are not alerted on; a sudden rise in one `action` is a dashboard signal.

## SLOs (proposed targets)

| SLO | Indicator | Target |
|---|---|---|
| My account data loads | `1 - sum(rate(iam_me_loads_total{outcome="error"}[28d])) / sum(rate(iam_me_loads_total[28d]))` | 99.5% over 28 days |
| My account writes | `1 - sum(rate(iam_me_actions_total{outcome="error"}[28d])) / sum(rate(iam_me_actions_total[28d]))` | 99.5% over 28 days |
| Load latency | share of loads under 2 s, from `iam_me_load_duration_seconds_bucket` | 95% over 28 days |

## Dashboard panels

Loads and errors by `resource`; writes by `action` split by `outcome` (success, failure, error); p95 load and write time; signature upload failures by `stage`; each panel filtered by `environment`.
