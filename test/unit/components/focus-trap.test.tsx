import { fireEvent, render, screen } from '@testing-library/react'
import { useRef } from 'react'
import { describe, expect, it } from '@rstest/core'
import { useFocusTrap } from '../../../src/shared/hooks/useFocusTrap'

function Trap({ open, empty = false }: { open: boolean; empty?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useFocusTrap(open, ref)
  return <div ref={ref}>{!empty && <><button>a</button><button>b</button></>}</div>
}

describe('useFocusTrap', () => {
  it('does nothing while closed', () => {
    render(<Trap open={false} />)
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(screen.getByRole('button', { name: 'a' })).not.toHaveFocus()
  })
  it('ignores other keys, a Tab in the middle, and a trap with nothing focusable', () => {
    const view = render(<Trap open />)
    const [a, b] = screen.getAllByRole('button')
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(a).toHaveFocus()
    fireEvent.keyDown(document, { key: 'Tab' })
    expect(a).toHaveFocus() // not the last: the browser moves on by itself
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true })
    expect(b).toHaveFocus()
    view.unmount()
    render(<Trap open empty />)
    expect(() => fireEvent.keyDown(document, { key: 'Tab' })).not.toThrow()
  })
})
