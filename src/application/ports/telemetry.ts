// The port the use cases and feature hooks record through. The adapter (infrastructure/telemetry)
// turns these into the Tier 3 iam_me_* metrics; presentation and application never import the SDK's metrics.
import type { ActionOutcome, LoadOutcome, LoadResource, MeAction, UploadStage } from '../../domain/events/me-events'

/** A started measurement: finish it once, with its outcome. A second call is ignored. */
export interface Measurement<O> {
  finish(outcome: O): void
}

export interface MeTelemetry {
  /** A data load starts; finish with `success` or `error`. Superseded loads are never finished. */
  loadStarted(resource: LoadResource): Measurement<LoadOutcome>
  /** A write starts; finish with `success`, `failure` (business rejection) or `error` (fault). */
  actionStarted(action: MeAction): Measurement<ActionOutcome>
  /** A signature upload failed at `stage`. */
  signatureUploadFailed(stage: UploadStage): void
}
