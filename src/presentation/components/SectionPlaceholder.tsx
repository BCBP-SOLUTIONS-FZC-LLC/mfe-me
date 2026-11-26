import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { APP_ID } from '../../shared/constants/app'

/** Stands in for a screen that is not built yet; replaced screen by screen (LLD §2.1). */
export default function SectionPlaceholder({ title }: { title: string }) {
  const t = useT(APP_ID)
  return (
    <section>
      <h1 className="text-xl font-semibold">{title}</h1>
      <p role="status">{t('section.notBuilt')}</p>
    </section>
  )
}
