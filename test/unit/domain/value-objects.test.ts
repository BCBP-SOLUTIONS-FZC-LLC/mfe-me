import { describe, expect, it } from '@rstest/core'
import { parseCursor } from '../../../src/domain/value-objects/Cursor'
import { parsePhone } from '../../../src/domain/value-objects/E164Phone'
import { parseTimeZone } from '../../../src/domain/value-objects/IanaTimeZone'
import {
  DAY_MS,
  addDays,
  daysBetween,
  instantFromMillis,
  instantToWallClock,
  parseInstant,
  toMillis,
  wallClockToInstant,
  type OffsetAt,
} from '../../../src/domain/value-objects/Instant'
import { languageOf, parseLocale } from '../../../src/domain/value-objects/LocaleTag'
import { recordVersion, tryRecordVersion } from '../../../src/domain/value-objects/RecordVersion'

describe('RecordVersion', () => {
  it('accepts a non-negative integer and refuses anything else', () => {
    expect(recordVersion(0)).toBe(0)
    expect(recordVersion(7)).toBe(7)
    for (const bad of [-1, 1.5, '3', null, undefined, NaN]) expect(() => recordVersion(bad)).toThrow(TypeError)
  })
  it('tryRecordVersion answers undefined instead of throwing', () => {
    expect(tryRecordVersion(2)).toBe(2)
    expect(tryRecordVersion('2')).toBeUndefined()
    expect(tryRecordVersion(-1)).toBeUndefined()
  })
})

describe('Cursor', () => {
  it('is the next page cursor, or undefined for none or blank', () => {
    expect(parseCursor('abc')).toBe('abc')
    expect(parseCursor('  ')).toBeUndefined()
    expect(parseCursor(undefined)).toBeUndefined()
    expect(parseCursor(5)).toBeUndefined()
  })
})

describe('E164Phone', () => {
  it.each([['+12125551234', '+12125551234'], ['  +442071838750 ', '+442071838750'], ['', ''], ['   ', '']])('%j → %j', (input, out) => {
    expect(parsePhone(input)).toBe(out)
  })
  it.each(['12125551234', '+1', '+1234567890123456', '+1 212 555 1234', 'abc', '+0'])('refuses %j', (input) => {
    expect(parsePhone(input)).toBeUndefined()
  })
  it('refuses a non-string', () => {
    expect(parsePhone(5)).toBeUndefined()
  })
})

describe('IanaTimeZone', () => {
  const zones = ['Europe/London', 'Asia/Dubai']
  it('accepts a listed zone and UTC, trimmed', () => {
    expect(parseTimeZone(' Asia/Dubai ', zones)).toBe('Asia/Dubai')
    expect(parseTimeZone('UTC', zones)).toBe('UTC')
  })
  it('refuses an unlisted, empty, over-long or non-string value', () => {
    expect(parseTimeZone('Mars/Base', zones)).toBeUndefined()
    expect(parseTimeZone('  ', zones)).toBeUndefined()
    expect(parseTimeZone('x'.repeat(65), [`${'x'.repeat(65)}`])).toBeUndefined()
    expect(parseTimeZone(3, zones)).toBeUndefined()
  })
})

describe('LocaleTag', () => {
  it.each([['en', 'en'], ['EN-gb', 'en-GB'], ['zh-hant-tw', 'zh-Hant-TW'], ['es-419', 'es-419'], ['de-DE-1996', 'de-DE-1996']])('%s → %s', (input, out) => {
    expect(parseLocale(input)).toBe(out)
  })
  it.each(['e', 'english', 'en_GB', 'en-', '', 'en-GB-x', `en-${'a'.repeat(30)}`])('refuses %j', (input) => {
    expect(parseLocale(input)).toBeUndefined()
  })
  it('refuses a non-string and names the language', () => {
    expect(parseLocale(undefined)).toBeUndefined()
    expect(languageOf(parseLocale('fr-CA')!)).toBe('fr')
  })
})

describe('Instant', () => {
  it('parses RFC 3339 with Z or an offset to UTC, and refuses anything else', () => {
    expect(parseInstant('2026-07-01T00:00:00Z')).toBe('2026-07-01T00:00:00.000Z')
    expect(parseInstant('2026-07-01T05:30:00+05:30')).toBe('2026-07-01T00:00:00.000Z')
    expect(parseInstant('2026-07-01T00:00Z')).toBe('2026-07-01T00:00:00.000Z')
    for (const bad of ['2026-07-01', '2026-07-01T00:00:00', 'soon', '2026-13-01T00:00:00Z', 5, null]) expect(parseInstant(bad), String(bad)).toBeUndefined()
  })
  it('does arithmetic in UTC', () => {
    const a = parseInstant('2026-11-26T10:00:00Z')!
    expect(addDays(a, 3)).toBe('2026-11-29T10:00:00.000Z')
    expect(toMillis(addDays(a, 1)) - toMillis(a)).toBe(DAY_MS)
    expect(daysBetween(a, addDays(a, 3))).toBe(3)
    expect(daysBetween(a, instantFromMillis(toMillis(a) + DAY_MS + 1))).toBe(2)
    expect(daysBetween(a, a)).toBe(0)
    expect(daysBetween(addDays(a, 2), a)).toBe(-2)
  })
  it('refuses a non-finite time', () => {
    expect(() => instantFromMillis(NaN)).toThrow(TypeError)
  })
})

describe('wall-clock text ⇄ instant in a zone', () => {
  const fixed = (minutes: number): OffsetAt => () => minutes
  // New York in 2026: UTC-5 until 8 March 07:00Z, UTC-4 after; back to UTC-5 from 1 November 06:00Z.
  const newYork: OffsetAt = (ms) => (ms >= Date.UTC(2026, 2, 8, 7) && ms < Date.UTC(2026, 10, 1, 6) ? -240 : -300)

  it('applies a fixed offset in both directions', () => {
    const dubai = fixed(240)
    const instant = wallClockToInstant('2026-07-01T09:00', dubai)!
    expect(instant).toBe('2026-07-01T05:00:00.000Z')
    expect(instantToWallClock(instant, dubai)).toBe('2026-07-01T09:00')
  })

  it('reads the offset at the right side of a daylight-saving change', () => {
    expect(wallClockToInstant('2026-07-01T09:00', newYork)).toBe('2026-07-01T13:00:00.000Z')
    expect(wallClockToInstant('2026-12-01T09:00', newYork)).toBe('2026-12-01T14:00:00.000Z')
    // 8 March 01:30 is still standard time (UTC-5), 03:30 is daylight time (UTC-4).
    expect(wallClockToInstant('2026-03-08T01:30', newYork)).toBe('2026-03-08T06:30:00.000Z')
    expect(wallClockToInstant('2026-03-08T03:30', newYork)).toBe('2026-03-08T07:30:00.000Z')
    // The hour that does not exist (02:30 on 8 March) moves forward, never throws.
    expect(wallClockToInstant('2026-03-08T02:30', newYork)).toBeDefined()
  })

  it('refuses text that is not a real calendar time', () => {
    for (const bad of ['', 'tomorrow', '2026-07-01', '2026-02-30T09:00', '2026-07-01T25:00', '2026-07-01T09:00:00']) expect(wallClockToInstant(bad, fixed(0)), bad).toBeUndefined()
  })

  it('round-trips a minute either side of the autumn change', () => {
    for (const wall of ['2026-10-31T23:59', '2026-11-01T00:30', '2026-11-01T03:00']) {
      expect(instantToWallClock(wallClockToInstant(wall, newYork)!, newYork)).toBe(wall)
    }
  })
})
