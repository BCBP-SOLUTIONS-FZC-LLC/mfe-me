// MeOptions from the runtime configuration (LLD §12): nothing environment-specific is a build argument.
// The flags are strings the SDK does not interpret: `me.ai.models`, `me.notifications.eventTypes` and
// `me.signature.uploadOrigins`, each a comma-separated list. A missing flag gives an empty list, and the
// screen says what is unavailable (G4 "Model choice isn't available yet", G5 shows stored rows only, G1
// hides Upload). Read at call time, not at import: the config loads after this module does.
import { tryGetConfig } from '@bcbp-solutions-fzc-llc/frontend-sdk/config'
import type { MeOptions } from '../../application/ports/options'
import { ENABLED_LOCALES } from '../../domain/vocabulary'

export const FLAGS = {
  models: 'me.ai.models',
  eventTypes: 'me.notifications.eventTypes',
  uploadOrigins: 'me.signature.uploadOrigins',
} as const

/** A comma-separated flag as a list: trimmed, blanks dropped, duplicates removed, order kept. */
export function listFlag(value: unknown): readonly string[] {
  if (typeof value !== 'string') return []
  return [...new Set(value.split(',').map((s) => s.trim()).filter((s) => s !== ''))]
}

/** An origin as the browser writes it (`https://bucket.example`), or undefined for anything that is not an exact https origin. */
function exactHttpsOrigin(value: string): string | undefined {
  try {
    const url = new URL(value)
    // A wildcard host parses as a URL but is not an origin anything can be served from.
    return url.protocol === 'https:' && url.origin === value && /^[A-Za-z0-9.-]+$/.test(url.hostname) ? url.origin : undefined
  } catch {
    return undefined
  }
}

/** The browser's IANA zone names; empty where the browser cannot list them (the profile then keeps its saved zone). */
export function browserTimeZones(): readonly string[] {
  try {
    return typeof Intl.supportedValuesOf === 'function' ? Intl.supportedValuesOf('timeZone') : []
  } catch {
    return []
  }
}

export function createMeOptions(timeZones: () => readonly string[] = browserTimeZones): MeOptions {
  const flags = () => tryGetConfig()?.flags ?? {}
  return {
    get allowedModels() {
      return listFlag(flags()[FLAGS.models])
    },
    get notificationEventTypes() {
      return listFlag(flags()[FLAGS.eventTypes])
    },
    enabledLocales: ENABLED_LOCALES,
    get uploadOrigins() {
      // Only exact https origins count; a path, a wildcard or http is ignored rather than trusted.
      return listFlag(flags()[FLAGS.uploadOrigins]).flatMap((o) => exactHttpsOrigin(o) ?? [])
    },
    get timeZones() {
      return timeZones()
    },
  }
}
