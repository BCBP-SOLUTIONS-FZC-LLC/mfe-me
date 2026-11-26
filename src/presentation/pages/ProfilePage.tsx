// G1 Profile and signature: my profile card, my access, and (once the upload path is agreed, LLD §15 #3)
// my signature. A profile that does not exist yet (the 404 right after sign-up) shows the name and email
// from the sign-in with editing off, and tries again once.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import { APP_ID } from '../../shared/constants/app'
import LoadFailed from '../components/LoadFailed'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import { card } from '../components/styles'
import { useMyProfile } from '../features/profile/useMyProfile'
import { useSelf } from '../features/self/useSelf'
import MyAccessCard from './profile/MyAccessCard'
import ProfileCard from './profile/ProfileCard'
import SignatureCard from './profile/SignatureCard'

export default function ProfilePage() {
  const t = useT(APP_ID)
  const { name, email } = useSelf()
  const { profile, notReady, loading, error, reload } = useMyProfile({ retryNotReady: true })
  // A new generation starts the form again from the server's record (after Reload on a conflict). A save does not: the form already holds what was saved.
  const [generation, setGeneration] = useState(0)
  return (
    <section className="flex flex-col gap-4" aria-busy={loading || undefined}>
      <h1 className="text-xl font-semibold">{t('nav.profile')}</h1>
      <ReadOnlyNotice />
      {error !== undefined && <LoadFailed message={t('profile.failed')} error={error} onRetry={() => void reload()} />}
      {notReady && (
        <div role="status" className={`${card} flex flex-col gap-1 p-5`}>
          <p className="font-medium">{t('profile.settingUp')}</p>
          <p className="text-sm text-aura-muted">{[name, email].filter(Boolean).join(' · ')}</p>
        </div>
      )}
      {loading && !notReady && error === undefined && <p>{t('common.loading')}</p>}
      {profile && (
        <ProfileCard
          key={generation}
          profile={profile}
          onReload={async () => {
            await reload()
            setGeneration((g) => g + 1)
          }}
        />
      )}
      {profile && <SignatureCard />}
      {(profile || notReady) && <MyAccessCard />}
    </section>
  )
}
