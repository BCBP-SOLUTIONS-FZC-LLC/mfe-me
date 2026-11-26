import { screen } from '@testing-library/react'
import { describe, expect, it } from '@rstest/core'
import { offsetFor, offsetOf, parseOffsetText, useFormatDay, useFormatInstant } from '../../../src/presentation/features/time/zone'
import { createFakeIam } from '../../fixtures/fakeIam'
import { renderPage } from '../../fixtures/pages'
import { startPlatform } from '../../fixtures/platform'

describe('parseOffsetText', () => {
  it.each([
    ['GMT', 0],
    ['UTC', 0],
    ['GMT+05:30', 330],
    ['GMT-4', -240],
    ['GMT−03:30', -210],
    ['UTC+1', 60],
    ['GMT+0530', 330],
  ])('%s → %s minutes east of UTC', (text, minutes) => {
    expect(parseOffsetText(text)).toBe(minutes)
  })
  it('is undefined for text with no offset', () => {
    expect(parseOffsetText('noon')).toBeUndefined()
    expect(parseOffsetText('')).toBeUndefined()
  })
})

describe('offsetOf (from the SDK formatDate)', () => {
  const july = Date.UTC(2026, 6, 1, 12)
  const december = Date.UTC(2026, 11, 1, 12)
  it('reads a zone\'s offset at an instant, including daylight saving', () => {
    startPlatform()
    expect(offsetOf('Asia/Dubai', july)).toBe(240)
    expect(offsetOf('Asia/Kolkata', july)).toBe(330)
    expect(offsetOf('Europe/London', july)).toBe(60)
    expect(offsetOf('Europe/London', december)).toBe(0)
    expect(offsetOf('America/New_York', july)).toBe(-240)
    expect(offsetOf('America/New_York', december)).toBe(-300)
    expect(offsetOf('UTC', july)).toBe(0)
  })
  it('falls back to the browser\'s own offset for no zone or one it cannot read', () => {
    startPlatform()
    const local = -new Date(july).getTimezoneOffset()
    expect(offsetOf(undefined, july)).toBe(local)
    expect(offsetOf('Mars/Base', july)).toBe(local)
  })
  it('offsetFor binds the zone', () => {
    startPlatform()
    expect(offsetFor('Asia/Dubai')(july)).toBe(240)
  })
})

describe('a saved zone the browser does not know', () => {
  it('never breaks a page: dates still show, in the browser\'s own zone', async () => {
    const iam = createFakeIam()
    iam.state.profile = { ...iam.state.profile, timezone: 'Mars/Base' }
    function Probe() {
      const time = useFormatInstant()
      const day = useFormatDay()
      return <p>{`${time('2026-12-01T09:00:00Z')} | ${day('2026-12-01T09:00:00Z')} | ${time(undefined)}|`}</p>
    }
    renderPage(<Probe />, { iam })
    expect(await screen.findByText(/2026/)).toBeInTheDocument()
  })
})
