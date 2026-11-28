// G1: my profile. Display name, job title, phone, time zone, language and credentials; email is read-only
// ("from your sign-in"). A federated user's name and title say "From your company directory" until edited
// and then offer "Revert to directory value" (IAM-UX-11). Save runs `planProfileEdit` and sends only what
// changed, with the version being replaced; a lost race (409) opens the conflict dialog with the draft
// beside it, and a 422 puts the service's field errors on the form (LLD §7.2, §7.9).
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useState } from 'react'
import type { MyProfile } from '../../../domain/entities/profile'
import { planProfileEdit, planRevertToDirectory, profileDraftOf, type CredentialRow, type ProfileDraft, type ProfileEditFailure } from '../../../domain/rules/me-rules'
import { APP_ID } from '../../../shared/constants/app'
import ConflictDialog from '../../components/ConflictDialog'
import Field from '../../components/Field'
import ProblemDetails from '../../components/ProblemDetails'
import SavedNotice from '../../components/SavedNotice'
import { btnOutline, btnPrimary, card, cardHeader, cardTitle, input } from '../../components/styles'
import { useMeAccess } from '../../features/access/useMeAccess'
import { useUpdateProfile, useRevertDirectoryValue } from '../../features/profile/useProfileActions'
import { useMeServices } from '../../features/services'
import { useProblemText } from '../../features/useProblemText'
import CredentialsEditor from './CredentialsEditor'

type FieldName = 'displayName' | 'jobTitle' | 'phone' | 'timezone' | 'locale'

const FAILURE_KEYS = {
  'name-required': 'profile.err.nameRequired',
  'name-too-long': 'profile.err.nameTooLong',
  'name-control-chars': 'profile.err.nameControlChars',
  'title-too-long': 'profile.err.titleTooLong',
  'phone-invalid': 'profile.err.phoneInvalid',
  'timezone-invalid': 'profile.err.timezoneInvalid',
  'locale-invalid': 'profile.err.localeInvalid',
  'too-many-credentials': 'profile.err.tooManyCredentials',
  'credential-key-invalid': 'profile.err.credentialKeyInvalid',
  'credential-value-invalid': 'profile.err.credentialValueInvalid',
  'no-change': 'profile.err.noChange',
} as const satisfies Record<ProfileEditFailure, string>

const LANGUAGE_KEYS: Readonly<Record<string, string>> = { en: 'profile.language.en' }

/** The wire field a service validation error names (`phone`, `credentials.cert`) → a form field or a credentials row. */
function fieldOf(path: string): FieldName | undefined {
  const name = path.split(/[.[]/)[0]
  return name === 'display_name' ? 'displayName' : name === 'job_title' ? 'jobTitle' : name === 'phone' || name === 'timezone' || name === 'locale' ? name : undefined
}

export default function ProfileCard({ profile, onReload }: { profile: MyProfile; onReload: () => Promise<void> }) {
  const t = useT(APP_ID)
  const id = useId()
  const { options, problems } = useMeServices()
  const { canWrite } = useMeAccess()
  const problemText = useProblemText()
  const update = useUpdateProfile()
  const revert = useRevertDirectoryValue()
  const [draft, setDraft] = useState<ProfileDraft>(() => profileDraftOf(profile))
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({})
  const [rowErrors, setRowErrors] = useState<Record<number, string>>({})
  const [failure, setFailure] = useState<unknown>()
  const [saved, setSaved] = useState(false)
  const [conflict, setConflict] = useState(false)

  const federated = profile.source === 'federated'
  const locales = options.enabledLocales.includes(profile.locale) || profile.locale === '' ? options.enabledLocales : [...options.enabledLocales, profile.locale]
  const edit = (patch: Partial<ProfileDraft>) => {
    setDraft((d) => ({ ...d, ...patch }))
    setSaved(false)
  }

  const showRefusal = (reason: ProfileEditFailure, at: string | undefined) => {
    const text = t(FAILURE_KEYS[reason])
    const row = /^credentials\[(\d+)]$/.exec(at ?? '')
    if (row) setRowErrors({ [Number(row[1])]: text })
    else if (at && at !== 'credentials') setErrors({ [at]: text })
    else setFailure(new Error(text))
  }

  const handleFailure = (error: unknown) => {
    if (problems.isConflict(error)) return setConflict(true)
    const fields = problems.fieldErrors(error)
    const next: Partial<Record<FieldName, string>> = {}
    for (const [path, messages] of Object.entries(fields)) {
      const name = fieldOf(path)
      if (name) next[name] = messages.join(' ')
    }
    if (Object.keys(next).length > 0) return setErrors(next)
    setFailure(error)
  }

  const save = async () => {
    setErrors({})
    setRowErrors({})
    setFailure(undefined)
    setSaved(false)
    const plan = planProfileEdit(draft, profile, { timeZones: options.timeZones, locales: options.enabledLocales })
    if (!plan.ok) return showRefusal(plan.failure, plan.at)
    try {
      setDraft(profileDraftOf(await update.mutateAsync(plan.value)))
      setSaved(true)
    } catch (error) {
      handleFailure(error)
    }
  }

  const revertField = async (field: 'displayName' | 'jobTitle') => {
    setFailure(undefined)
    const plan = planRevertToDirectory(field, profile)
    if (!plan.ok) return
    try {
      setDraft(profileDraftOf(await revert.mutateAsync(plan.value)))
      setSaved(true)
    } catch (error) {
      handleFailure(error)
    }
  }

  const origin = (field: 'displayName' | 'jobTitle', overridden: boolean) =>
    federated && (
      <p className="flex flex-wrap items-center gap-2 text-xs text-aura-muted">
        {overridden ? (
          <button type="button" className={btnOutline} disabled={!canWrite || revert.isPending} onClick={() => void revertField(field)}>
            {t('profile.revert')}
          </button>
        ) : (
          t('profile.fromDirectory')
        )}
      </p>
    )

  const busy = update.isPending || revert.isPending
  return (
    <section aria-labelledby={`${id}-title`} className={`${card} overflow-hidden`}>
      <div className={cardHeader}>
        <h2 id={`${id}-title`} className={cardTitle}>
        {t('profile.title')}
        </h2>
      </div>
      <div className="flex flex-col gap-4 p-5">
      <form
        className="flex flex-col gap-4"
        noValidate
        onSubmit={(event) => {
          event.preventDefault()
          void save()
        }}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1">
            <Field label={t('profile.displayName')} error={errors.displayName}>
              {(ids) => <input {...ids} className={input} value={draft.displayName} disabled={!canWrite} onChange={(e) => edit({ displayName: e.target.value })} />}
            </Field>
            {origin('displayName', profile.displayNameOverridden)}
          </div>
          <div className="flex flex-col gap-1">
            <Field label={t('profile.jobTitle')} error={errors.jobTitle}>
              {(ids) => <input {...ids} className={input} value={draft.jobTitle} disabled={!canWrite} onChange={(e) => edit({ jobTitle: e.target.value })} />}
            </Field>
            {origin('jobTitle', profile.jobTitleOverridden)}
          </div>
          <Field label={t('profile.email')} hint={t('profile.emailHint')}>
            {(ids) => <input {...ids} className={input} value={profile.email} readOnly />}
          </Field>
          <Field label={t('profile.phone')} hint={t('profile.phoneHint')} error={errors.phone}>
            {(ids) => <input {...ids} className={input} type="tel" inputMode="tel" autoComplete="tel" value={draft.phone} disabled={!canWrite} onChange={(e) => edit({ phone: e.target.value })} />}
          </Field>
          <Field label={t('profile.timezone')} error={errors.timezone}>
            {(ids) => (
              <>
                <input {...ids} className={input} list={`${id}-zones`} value={draft.timezone} disabled={!canWrite} onChange={(e) => edit({ timezone: e.target.value })} />
                <datalist id={`${id}-zones`}>
                  {options.timeZones.map((zone) => (
                    <option key={zone} value={zone} />
                  ))}
                </datalist>
              </>
            )}
          </Field>
          <Field label={t('profile.language')} error={errors.locale}>
            {(ids) => (
              <select {...ids} className={input} value={draft.locale} disabled={!canWrite} onChange={(e) => edit({ locale: e.target.value })}>
                {draft.locale === '' && <option value="" />}
                {locales.map((tag) => (
                  <option key={tag} value={tag}>
                    {LANGUAGE_KEYS[tag] ? t(LANGUAGE_KEYS[tag]!) : tag}
                  </option>
                ))}
              </select>
            )}
          </Field>
        </div>
        <CredentialsEditor rows={draft.credentials} onChange={(credentials: CredentialRow[]) => edit({ credentials })} errors={rowErrors} disabled={!canWrite} />
        {failure !== undefined && (
          <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
            <span>{failure instanceof Error && !('status' in failure) ? failure.message : problemText(failure)}</span>
            <ProblemDetails error={failure} />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button type="submit" className={btnPrimary} disabled={!canWrite || busy}>
            {busy ? t('common.working') : t('common.save')}
          </button>
          <SavedNotice show={saved} />
        </div>
      </form>
      {conflict && (
        <ConflictDialog
          onReload={() => {
            setConflict(false)
            void onReload()
          }}
          onClose={() => setConflict(false)}
        >
          <DraftSummary draft={draft} />
        </ConflictDialog>
      )}
      </div>
    </section>
  )
}

/** The user's unsaved values, shown beside the conflict message so they can copy them back after a reload. */
function DraftSummary({ draft }: { draft: ProfileDraft }) {
  const t = useT(APP_ID)
  return (
    <dl className="mb-4 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg border border-aura-border p-3 text-sm">
      <dt className="text-aura-muted">{t('profile.displayName')}</dt>
      <dd>{draft.displayName}</dd>
      <dt className="text-aura-muted">{t('profile.jobTitle')}</dt>
      <dd>{draft.jobTitle}</dd>
      <dt className="text-aura-muted">{t('profile.phone')}</dt>
      <dd>{draft.phone}</dd>
      <dt className="text-aura-muted">{t('profile.timezone')}</dt>
      <dd>{draft.timezone}</dd>
      <dt className="text-aura-muted">{t('profile.language')}</dt>
      <dd>{draft.locale}</dd>
    </dl>
  )
}
