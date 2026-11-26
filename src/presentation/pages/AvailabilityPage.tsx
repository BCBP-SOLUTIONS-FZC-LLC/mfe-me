// G2 Availability: available, busy or out of office, with a window and a note. Setting a delegate is G3's job.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useState } from 'react'
import { APP_ID } from '../../shared/constants/app'
import LoadFailed from '../components/LoadFailed'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import { useAvailability } from '../features/availability/useAvailability'
import { useMyProfile } from '../features/profile/useMyProfile'
import AvailabilityForm from './availability/AvailabilityForm'

export default function AvailabilityPage() {
  const t = useT(APP_ID)
  const query = useAvailability()
  // The window is shown in my profile's zone, so the form starts once the zone is known.
  const profile = useMyProfile()
  const [generation, setGeneration] = useState(0)
  return (
    <section className="flex flex-col gap-4" aria-busy={query.isPending || undefined}>
      <h1 className="text-xl font-semibold">{t('nav.availability')}</h1>
      <ReadOnlyNotice />
      {query.isError && <LoadFailed message={t('availability.failed')} error={query.error} onRetry={() => void query.refetch()} />}
      {(query.isPending || (profile.loading && !profile.notReady && profile.error === undefined)) && !query.isError && <p>{t('common.loading')}</p>}
      {query.data && !(profile.loading && !profile.notReady && profile.error === undefined) && (
        <AvailabilityForm
          key={generation}
          current={query.data}
          onReload={async () => {
            await query.refetch()
            setGeneration((g) => g + 1)
          }}
        />
      )}
    </section>
  )
}
