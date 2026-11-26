// G6 Security: links to the Keycloak account console, where MFA methods, passkeys, recovery codes, the
// password and sessions are managed (there is no IAM API for them). The links open in a new tab, built from
// configuration (`idpOrigin` and my realm) and never from user input. Until the Keycloak version's deep-link
// paths are confirmed (LLD §15 #13) every card opens the console's root.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import type { AccountSection } from '../../application/ports/navigation'
import { APP_ID } from '../../shared/constants/app'
import { btnOutline, card } from '../components/styles'
import { useMeServices } from '../features/services'

const CARDS: readonly { section: AccountSection; title: string; body: string; link: string }[] = [
  { section: 'signin', title: 'security.signin.title', body: 'security.signin.body', link: 'security.signin.link' },
  { section: 'devices', title: 'security.devices.title', body: 'security.devices.body', link: 'security.devices.link' },
]

export default function SecurityPage() {
  const t = useT(APP_ID)
  const { navigation } = useMeServices()
  const shared = navigation.isSharedConsole()
  return (
    <section className="flex flex-col gap-4">
      <h1 className="text-xl font-semibold">{t('nav.security')}</h1>
      <p className="text-sm text-aura-muted">{t('security.intro')}</p>
      <ul className="grid gap-4 md:grid-cols-2">
        {CARDS.map((c) => {
          const url = navigation.accountConsoleUrl(c.section)
          return (
            <li key={c.section} className={`${card} flex flex-col gap-3 p-5`}>
              <h2 className="text-lg font-semibold">{t(c.title)}</h2>
              <p className="text-sm">{t(c.body)}</p>
              {url ? (
                <a className={`${btnOutline} self-start`} href={url} target="_blank" rel="noopener noreferrer">
                  {t(c.link)}
                  <span className="sr-only"> {t('security.newTab')}</span>
                </a>
              ) : (
                <p role="status" className="text-sm text-aura-muted">
                  {t('security.unavailable')}
                </p>
              )}
            </li>
          )
        })}
      </ul>
      <ul className="list-disc ps-5 text-sm text-aura-muted">
        <li>{t('security.rule.mfaRequired')}</li>
        <li>{t('security.rule.removing')}</li>
        <li>{t('security.rule.upgrade')}</li>
        {shared && <li>{t('security.rule.trial')}</li>}
      </ul>
    </section>
  )
}
