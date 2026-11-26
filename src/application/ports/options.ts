// The values the environment decides, read once from runtime configuration (the implementation is
// infrastructure/configuration/options.ts, LLD §12). Missing values come back empty, and each screen
// says what is unavailable rather than guessing.
export interface MeOptions {
  /** The AI models a member may pick (LLD §15 #9, interim runtime flag `me.ai.models`). */
  readonly allowedModels: readonly string[]
  /** The notification event types (LLD §15 #10, interim flag `me.notifications.eventTypes`). */
  readonly notificationEventTypes: readonly string[]
  /** The languages the shell offers (`ENABLED_LOCALES`). */
  readonly enabledLocales: readonly string[]
  /** The exact https origins an upload URL may point at (flag `me.signature.uploadOrigins`, §15 #3). */
  readonly uploadOrigins: readonly string[]
  /** The browser's IANA zone names, as data for the domain rules. */
  readonly timeZones: readonly string[]
}
