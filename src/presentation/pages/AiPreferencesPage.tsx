// G4 AI preferences: the model, the writing tone, my prompt templates and the context snippets that go with
// every draft. The model list comes from configuration until a service publishes it (LLD §15 #9); a saved model
// that is no longer offered is shown as such and must be changed before saving. The drafting mode (auto or
// assisted) lives on the tender, not here.
import { useT } from '@bcbp-solutions-fzc-llc/frontend-sdk/react'
import { useId, useState } from 'react'
import type { LlmPreferences } from '../../domain/entities/preferences'
import { LIMITS, planAiPreferences, type AiPreferencesFailure } from '../../domain/rules/me-rules'
import { WRITING_TONES, type WritingTone } from '../../domain/vocabulary'
import { APP_ID } from '../../shared/constants/app'
import ConflictDialog from '../components/ConflictDialog'
import Field from '../components/Field'
import ListEditor from '../components/ListEditor'
import LoadFailed from '../components/LoadFailed'
import ProblemDetails from '../components/ProblemDetails'
import ReadOnlyNotice from '../components/ReadOnlyNotice'
import SavedNotice from '../components/SavedNotice'
import { btnPrimary, card, cardHeader, cardTitle, input } from '../components/styles'
import { useMeAccess } from '../features/access/useMeAccess'
import { useAiPreferences, useSaveAiPreferences } from '../features/ai/useAiPreferences'
import { useMeServices } from '../features/services'
import { useProblemText } from '../features/useProblemText'

const TONE_KEYS = {
  formal: 'ai.tone.formal',
  technical: 'ai.tone.technical',
  concise: 'ai.tone.concise',
  persuasive: 'ai.tone.persuasive',
  neutral: 'ai.tone.neutral',
} as const satisfies Record<WritingTone, string>

const FAILURE_KEYS = {
  'model-required': 'ai.err.modelRequired',
  'model-too-long': 'ai.err.modelTooLong',
  'model-not-allowed': 'ai.err.modelNotAllowed',
  'tone-invalid': 'ai.err.toneInvalid',
  'too-many-templates': 'ai.err.tooManyTemplates',
  'template-empty': 'ai.err.templateEmpty',
  'template-too-long': 'ai.err.templateTooLong',
  'too-many-snippets': 'ai.err.tooManySnippets',
  'snippet-too-long': 'ai.err.snippetTooLong',
  'no-change': 'ai.err.noChange',
} as const satisfies Record<AiPreferencesFailure, string>

export default function AiPreferencesPage() {
  const t = useT(APP_ID)
  const query = useAiPreferences()
  const [generation, setGeneration] = useState(0)
  return (
    <section className="flex flex-col gap-4" aria-busy={query.isPending || undefined}>
      <h1 className="text-xl font-semibold">{t('nav.ai')}</h1>
      <ReadOnlyNotice />
      {query.isError && <LoadFailed message={t('ai.failed')} error={query.error} onRetry={() => void query.refetch()} />}
      {query.isPending && <p>{t('common.loading')}</p>}
      {query.data && (
        <AiForm
          key={generation}
          saved={query.data.saved}
          onReload={async () => {
            await query.refetch()
            setGeneration((g) => g + 1)
          }}
        />
      )}
    </section>
  )
}

function AiForm({ saved, onReload }: { saved: LlmPreferences | undefined; onReload: () => Promise<void> }) {
  const t = useT(APP_ID)
  const id = useId()
  const { options, problems } = useMeServices()
  const { canWrite } = useMeAccess()
  const problemText = useProblemText()
  const save = useSaveAiPreferences()
  const [model, setModel] = useState(saved?.preferredModel ?? '')
  const [tone, setTone] = useState<string>(saved?.writingTone ?? 'neutral')
  const [templates, setTemplates] = useState<string[]>([...(saved?.templates ?? [])])
  const [snippets, setSnippets] = useState<string[]>([...(saved?.contextDocuments ?? [])])
  const [error, setError] = useState<{ field: 'model' | 'tone' | 'other'; text: string }>()
  const [failure, setFailure] = useState<unknown>()
  const [done, setDone] = useState(false)
  const [conflict, setConflict] = useState(false)

  const models = options.allowedModels
  const unavailable = models.length === 0
  const savedGone = saved !== undefined && !models.includes(saved.preferredModel) && model === saved.preferredModel
  const edit = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setDone(false)
    setError(undefined)
    setFailure(undefined)
  }

  const submit = async () => {
    setError(undefined)
    setFailure(undefined)
    setDone(false)
    const plan = planAiPreferences({ preferredModel: model, writingTone: tone, templates, contextDocuments: snippets }, saved, models)
    if (!plan.ok) {
      const field = plan.failure.startsWith('model') ? 'model' : plan.failure === 'tone-invalid' ? 'tone' : 'other'
      return setError({ field, text: t(FAILURE_KEYS[plan.failure]) })
    }
    try {
      await save.mutateAsync(plan.value)
      setDone(true)
    } catch (e) {
      if (problems.isConflict(e)) return setConflict(true)
      setFailure(e)
    }
  }

  return (
    <form
      className={`${card} overflow-hidden`}
      noValidate
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <div className={cardHeader}>
        <h2 id={`${id}-title`} className={cardTitle}>
          {t('ai.title')}
        </h2>
      </div>
      <div className="flex flex-col gap-5 p-5">
      {unavailable && <p role="status" className="notice notice-info">{t('ai.modelsUnavailable')}</p>}
      <Field label={t('ai.model')} error={error?.field === 'model' ? error.text : undefined} hint={savedGone ? t('ai.modelGone') : undefined}>
        {(ids) => (
          <select {...ids} className={input} value={model} disabled={!canWrite || unavailable} onChange={(e) => edit(setModel)(e.target.value)}>
            <option value="">{t('ai.modelEmpty')}</option>
            {saved && !models.includes(saved.preferredModel) && <option value={saved.preferredModel}>{t('ai.modelGoneOption', { model: saved.preferredModel })}</option>}
            {models.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        )}
      </Field>
      <Field label={t('ai.tone')} error={error?.field === 'tone' ? error.text : undefined}>
        {(ids) => (
          <select {...ids} className={input} value={tone} disabled={!canWrite} onChange={(e) => edit(setTone)(e.target.value)}>
            {WRITING_TONES.map((w) => (
              <option key={w} value={w}>
                {t(TONE_KEYS[w])}
              </option>
            ))}
          </select>
        )}
      </Field>
      <div className="flex flex-col gap-1">
        <ListEditor label={t('ai.templates')} items={templates} onChange={edit(setTemplates)} maxItems={LIMITS.templates} maxLength={LIMITS.template} disabled={!canWrite} multiline />
        <p className="text-xs text-aura-muted">{t('ai.templatesHint')}</p>
      </div>
      <div className="flex flex-col gap-1">
        <ListEditor label={t('ai.snippets')} items={snippets} onChange={edit(setSnippets)} maxItems={LIMITS.snippets} maxLength={LIMITS.snippet} disabled={!canWrite} multiline />
        <p className="text-xs text-aura-muted">{t('ai.snippetsHint')}</p>
      </div>
      <p className="text-sm text-status-warning">{t('ai.secretsWarning')}</p>
      <p className="text-xs text-aura-muted">{t('ai.draftingMode')}</p>
      {error?.field === 'other' && (
        <p role="alert" className="text-sm text-status-error">
          {error.text}
        </p>
      )}
      {failure !== undefined && (
        <div role="alert" className="flex flex-wrap items-center gap-2 text-status-error">
          <span>{problemText(failure)}</span>
          <ProblemDetails error={failure} />
        </div>
      )}
      <div className="flex items-center gap-3">
        <button type="submit" className={btnPrimary} disabled={!canWrite || save.isPending || unavailable}>
          {save.isPending ? t('common.working') : t('common.save')}
        </button>
        <SavedNotice show={done} />
      </div>
      {conflict && (
        <ConflictDialog
          onReload={() => {
            setConflict(false)
            void onReload()
          }}
          onClose={() => setConflict(false)}
        />
      )}
      </div>
    </form>
  )
}
