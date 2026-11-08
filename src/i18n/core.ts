import messages from './messages.json'
import content from './content.json'

export const locales = ['zh', 'en', 'ja'] as const
export type Locale = typeof locales[number]
export const languageNames: Record<Locale, string> = { zh: '中文', en: 'English', ja: '日本語' }
export const LOCALE_STORAGE_KEY = 'user-locale'
type Dictionary = Record<string, { en: string; ja: string }>

/** The website uses jp; accept it on shared links and normalize to BCP 47 ja. */
export function normalizeLocale(value: unknown): Locale | null {
  if (typeof value !== 'string') return null
  const language = value.trim().toLowerCase().split(/[-_]/)[0]
  return language === 'jp' || language === 'ja' ? 'ja' : language === 'en' ? 'en' : language === 'zh' ? 'zh' : null
}

export function translate(text: string | null | undefined, locale: Locale = 'zh', values: Record<string, string | number> = {}): string {
  if (!text) return ''
  const template = locale === 'zh' ? text : (messages as Dictionary)[text]?.[locale] || (content as Dictionary)[text]?.[locale] || text
  return template.replace(/\{(\w+)\}/g, (match, key: string) => Object.prototype.hasOwnProperty.call(values, key) ? String(values[key]) : match)
}

/** Apply only explicitly translated presentation fields; never IDs, prices or customer text. */
export function localizedField(record: Record<string, unknown>, field: string, locale: Locale): unknown {
  const source = record[field]
  if (locale === 'zh') return source
  const translations = record.translations as Record<string, Record<string, unknown>> | undefined
  const override = (translations?.[locale] || (locale === 'ja' ? translations?.jp : undefined))?.[field]
  if (typeof source === 'string') return typeof override === 'string' && override.trim() ? override : translate(source, locale)
  if (Array.isArray(source)) return Array.isArray(override) && override.every(value => typeof value === 'string') && override.length === source.length
    ? [...override] : source.map(value => typeof value === 'string' ? translate(value, locale) : value)
  return source
}

export function localizeRecord<T extends object>(record: T, locale: Locale, fields: readonly string[]): T {
  if (locale === 'zh') return record
  const result = { ...record } as Record<string, unknown>
  for (const field of fields) if (field in record) result[field] = localizedField(record as Record<string, unknown>, field, locale)
  return result as T
}

/** Kept separate from Taro so locale persistence and notifications can be tested without a device. */
export function createLocaleStore(storage: { get: () => unknown; set: (locale: Locale) => void }) {
  let current: Locale = 'zh', initialized = false
  const listeners = new Set<() => void>()
  const get = () => {
    if (!initialized) { initialized = true; try { current = normalizeLocale(storage.get()) || 'zh' } catch { /* Browsing still works when storage is unavailable. */ } }
    return current
  }
  return {
    get,
    set(value: unknown) {
      const locale = normalizeLocale(value)
      if (!locale) return false
      const previous = get()
      current = locale
      try { storage.set(locale) } catch { /* Keep the selection for this session. */ }
      if (previous !== current) for (const listener of listeners) listener()
      return true
    },
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener) } },
  }
}
