import { initializeI18n, setLocale, t } from '@bcbp-solutions-fzc-llc/frontend-sdk/i18n'
import { describe, expect, it } from '@rstest/core'
import { APP_ID } from '../../../src/shared/constants/app'
import { startPlatform } from '../../fixtures/platform'

describe('me messages', () => {
  it('answers from the English catalog', async () => {
    startPlatform()
    await new Promise((resolve) => setTimeout(resolve, 0)) // the catalog loader is async
    expect(t(APP_ID, 'nav.profile')).toBe('Profile')
  })

  it('falls back to English in a locale without a catalog', async () => {
    // As web-shell's bootstrap does, with a locale this remote has no catalog for.
    startPlatform()
    await initializeI18n({ defaultLocale: 'en', supported: ['en', 'ar'] })
    await setLocale('ar')
    expect(t(APP_ID, 'nav.profile')).toBe('Profile')
  })

  it('answers from the English catalog for a regional English locale', async () => {
    startPlatform()
    await initializeI18n({ defaultLocale: 'en', supported: ['en', 'en-GB'] })
    await setLocale('en-GB')
    expect(t(APP_ID, 'nav.profile')).toBe('Profile')
  })
})
