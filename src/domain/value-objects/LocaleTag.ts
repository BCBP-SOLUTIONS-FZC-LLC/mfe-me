// A BCP-47 language tag ('en', 'en-GB', 'zh-Hant-TW'), in canonical case: language lower, script
// title, region upper. User Profile allows 2 to 20 characters. Only the shape is checked here (language,
// optional script, region and variants); whether the shell offers the language is a separate rule
// (`ENABLED_LOCALES`).
declare const brand: unique symbol
export type LocaleTag = string & { readonly [brand]: 'LocaleTag' }

export const MAX_LOCALE_LENGTH = 20

const SHAPE = /^[A-Za-z]{2,3}(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-(?:[A-Za-z0-9]{5,8}|[0-9][A-Za-z0-9]{3}))*$/

export function parseLocale(value: unknown): LocaleTag | undefined {
  if (typeof value !== 'string') return undefined
  const tag = value.trim()
  if (tag.length < 2 || tag.length > MAX_LOCALE_LENGTH || !SHAPE.test(tag)) return undefined
  const [language, ...rest] = tag.split('-') as [string, ...string[]]
  const canonical = rest.map((part) => {
    if (part.length === 4 && /^[A-Za-z]{4}$/.test(part)) return part[0]!.toUpperCase() + part.slice(1).toLowerCase()
    if (part.length === 2 && /^[A-Za-z]{2}$/.test(part)) return part.toUpperCase()
    return part.toLowerCase()
  })
  return [language.toLowerCase(), ...canonical].join('-') as LocaleTag
}

/** The language part of a tag ('en-GB' → 'en'). */
export const languageOf = (tag: LocaleTag): string => tag.split('-')[0]!
