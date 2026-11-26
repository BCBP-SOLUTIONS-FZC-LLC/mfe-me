import { fireEvent, render, screen } from '@testing-library/react'
import { ProblemError } from '@bcbp-solutions-fzc-llc/frontend-sdk/problem'
import { useState } from 'react'
import { describe, expect, it, rs } from '@rstest/core'
import ConfirmDialog from '../../../src/presentation/components/ConfirmDialog'
import ConflictDialog from '../../../src/presentation/components/ConflictDialog'
import DateTimeField from '../../../src/presentation/components/DateTimeField'
import ListEditor from '../../../src/presentation/components/ListEditor'
import LoadFailed from '../../../src/presentation/components/LoadFailed'
import ProblemDetails from '../../../src/presentation/components/ProblemDetails'
import { startPlatform } from '../../fixtures/platform'
import { fakeServices, servicesWrapper } from '../../fixtures/services'

const problem = (status: number, errorCode?: string) =>
  new ProblemError({ type: 'about:blank', title: 't', status, traceId: 'trace-1', ...(errorCode ? { errorCode } : {}), extensions: {} } as never)

function open(ui: React.ReactNode) {
  const platform = startPlatform()
  const Services = servicesWrapper(fakeServices().services)
  return render(ui, { wrapper: ({ children }) => (<platform.Wrapper><Services>{children}</Services></platform.Wrapper>) })
}

describe('ConfirmDialog', () => {
  it('is a labelled dialog that confirms and cancels (Escape too)', async () => {
    const onConfirm = rs.fn()
    const onCancel = rs.fn()
    open(<ConfirmDialog title="Remove signature" confirmLabel="Remove" onConfirm={onConfirm} onCancel={onCancel}>Approvals will need a new signature.</ConfirmDialog>)
    expect(await screen.findByRole('dialog', { name: 'Remove signature' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove' }))
    expect(onConfirm).toHaveBeenCalledOnce()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalledOnce()
  })

  it('shows a failure in place with this remote\'s sentence and disables Confirm while busy', async () => {
    open(<ConfirmDialog title="Cancel" confirmLabel="Yes" busy error={problem(409, 'VERSION_CONFLICT')} onConfirm={() => {}} onCancel={() => {}}>x</ConfirmDialog>)
    expect(await screen.findByRole('alert')).toHaveTextContent('Someone else changed this')
    expect(screen.getByRole('button', { name: 'Working…' })).toBeDisabled()
  })

  it('uses the danger style when asked', async () => {
    open(<ConfirmDialog title="T" confirmLabel="Go" danger onConfirm={() => {}} onCancel={() => {}}>x</ConfirmDialog>)
    expect(await screen.findByRole('button', { name: 'Go' })).toHaveClass('btn-error')
  })
})

describe('ConflictDialog', () => {
  it('offers Reload and Close and shows the draft it is given', async () => {
    const onReload = rs.fn()
    const onClose = rs.fn()
    open(<ConflictDialog onReload={onReload} onClose={onClose}><pre>my draft</pre></ConflictDialog>)
    expect(await screen.findByText('my draft')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Reload' }))
    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    expect(onReload).toHaveBeenCalledOnce()
    expect(onClose).toHaveBeenCalledOnce()
  })
})

describe('LoadFailed and ProblemDetails', () => {
  it('says what happened, never the server\'s detail, and retries', async () => {
    const onRetry = rs.fn()
    const error = new ProblemError({ type: 'about:blank', title: 't', status: 500, detail: 'SECRET stack', traceId: 'trace-1', extensions: {} } as never)
    open(<LoadFailed message="We couldn't load this." error={error} onRetry={onRetry} />)
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent("We couldn't load this.")
    expect(alert).not.toHaveTextContent('SECRET')
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }))
    expect(onRetry).toHaveBeenCalledOnce()
  })

  it('copies the trace ID and codes, and shows nothing for an error without one', async () => {
    const writeText = rs.fn(async () => {})
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    const first = open(<ProblemDetails error={problem(500, 'X')} />)
    fireEvent.click(await screen.findByRole('button', { name: 'Copy details' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('trace-1'))
    expect(await screen.findByRole('button', { name: 'Copied' })).toBeInTheDocument()
    first.unmount()
    const second = open(<ProblemDetails error={new Error('x')} />)
    expect(second.container).toBeEmptyDOMElement()
  })
})

describe('DateTimeField', () => {
  it('is a labelled control that reports the wall-clock text', async () => {
    const onChange = rs.fn()
    open(<DateTimeField label="Until" value="2026-12-01T09:00" onChange={onChange} min="2026-11-26T00:00" />)
    const field = await screen.findByLabelText('Until')
    expect(field).toHaveValue('2026-12-01T09:00')
    fireEvent.change(field, { target: { value: '2026-12-02T10:30' } })
    expect(onChange).toHaveBeenCalledWith('2026-12-02T10:30')
  })

  it('ties its message to the field', async () => {
    open(<DateTimeField label="From" value="" onChange={() => {}} error="The end must be after the start." />)
    const field = await screen.findByLabelText('From')
    expect(field).toHaveAttribute('aria-invalid', 'true')
    expect(field).toHaveAccessibleDescription('The end must be after the start.')
  })
})

describe('ListEditor', () => {
  function Harness({ initial = ['a'], maxItems = 2 }: { initial?: string[]; maxItems?: number }) {
    const [items, setItems] = useState(initial)
    return <ListEditor label="Templates" items={items} onChange={setItems} maxItems={maxItems} maxLength={3} />
  }

  it('adds, edits and removes rows, with a counter', async () => {
    open(<Harness />)
    expect(await screen.findByText('1 of 2')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    expect(screen.getByText('2 of 2')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Templates 2'), { target: { value: 'xyz' } })
    expect(screen.getByLabelText('Templates 2')).toHaveValue('xyz')
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove' })[0]!)
    expect(screen.getByText('1 of 2')).toBeInTheDocument()
    expect(screen.getByLabelText('Templates 1')).toHaveValue('xyz')
  })

  it('stops adding at the bound and flags a row over its length (without cutting it)', async () => {
    open(<Harness initial={['abcd', 'b']} />)
    expect(await screen.findByRole('button', { name: 'Add' })).toBeDisabled()
    expect(screen.getByLabelText('Templates 1')).toHaveAttribute('aria-invalid', 'true')
    expect(screen.getByLabelText('Templates 1')).toHaveValue('abcd')
    expect(screen.getByLabelText('Templates 2')).not.toHaveAttribute('aria-invalid')
  })

  it('is read-only as a whole when disabled', async () => {
    open(<ListEditor label="Snippets" items={['x']} onChange={() => {}} maxItems={5} maxLength={10} disabled multiline />)
    expect(await screen.findByLabelText('Snippets 1')).toBeDisabled()
  })
})

describe('ListEditor multiline', () => {
  it('edits a multi-line row', async () => {
    function H() {
      const [items, setItems] = useState(['one'])
      return <ListEditor label="Snippets" items={items} onChange={setItems} maxItems={3} maxLength={50} multiline />
    }
    open(<H />)
    fireEvent.change(await screen.findByLabelText('Snippets 1'), { target: { value: 'two' } })
    expect(screen.getByLabelText('Snippets 1')).toHaveValue('two')
  })
})
