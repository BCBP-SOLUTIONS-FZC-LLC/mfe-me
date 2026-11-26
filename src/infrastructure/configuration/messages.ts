// This remote's message namespace for the SDK's i18n (`useT(APP_ID)`). English is the only catalogue
// so far; t() falls back to it, then to the key, for any other locale the shell negotiates.
// Chrome is in locales/en.json; each screen adds locales/en/<screen>.json with keys prefixed by the screen.
import { registerNamespace } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { APP_ID } from '../../shared/constants/app'
import chrome from './locales/en.json'
import access from './locales/en/access.json'
import ai from './locales/en/ai.json'
import availability from './locales/en/availability.json'
import delegations from './locales/en/delegations.json'
import identity from './locales/en/identity.json'
import notifications from './locales/en/notifications.json'
import signature from './locales/en/signature.json'
import security from './locales/en/security.json'
import profile from './locales/en/profile.json'

/** The English catalogue: chrome, then each screen's keys. */
const en: Record<string, string> = { ...chrome, ...identity, ...access, ...profile, ...availability, ...delegations, ...ai, ...notifications, ...security, ...signature }

/** Registers the catalogue with the SDK runtime (once per runtime; tests start a fresh one each). */
export function registerMessages(): void {
  registerNamespace(APP_ID, async (locale) => (locale.split('-')[0] === 'en' ? en : {}))
}

registerMessages()
