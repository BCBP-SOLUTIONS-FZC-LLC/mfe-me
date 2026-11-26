import { fireEvent, render, screen } from '@testing-library/react'
import { useState } from 'react'
import { describe, expect, it } from '@rstest/core'
import Dialog from '../../../src/presentation/components/Dialog'
import SectionPlaceholder from '../../../src/presentation/components/SectionPlaceholder'
import { startPlatform } from '../../fixtures/platform'

function Host({ subtitle }: { subtitle?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      {open && (
        <Dialog title="Edit" {...(subtitle ? { subtitle } : {})} onClose={() => setOpen(false)}>
          <button>first</button>
          <button>last</button>
        </Dialog>
      )}
    </>
  )
}

describe('Dialog focus handling', () => {
  it('focuses its first control, wraps Tab and Shift+Tab, closes on Escape and returns focus', () => {
    const platform = startPlatform()
    render(<Host subtitle="Sub" />, { wrapper: platform.Wrapper })
    const opener = screen.getByRole('button', { name: 'open' })
    opener.focus()
    fireEvent.click(opener)
    const first = screen.getByRole('button', { name: 'first' })
    const last = screen.getByRole('button', { name: 'last' })
    expect(screen.getByText('Sub')).toBeInTheDocument()
    expect(first).toHaveFocus()
    last.focus()
    fireEvent.keyDown(last, { key: 'Tab' })
    expect(first).toHaveFocus()
    fireEvent.keyDown(first, { key: 'Tab', shiftKey: true })
    expect(last).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(opener).toHaveFocus()
  })
})

describe('SectionPlaceholder', () => {
  it('names the section and says it is not built', async () => {
    const platform = startPlatform()
    render(<SectionPlaceholder title="Security" />, { wrapper: platform.Wrapper })
    expect(screen.getByRole('heading', { level: 1, name: 'Security' })).toBeInTheDocument()
    expect(await screen.findByRole('status')).toHaveTextContent('This section is not built yet.')
  })
})
