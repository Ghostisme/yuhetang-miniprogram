import type { ProductItem, ServiceItem, Site, StoreItem, Therapist } from '../types'
import { localizeRecord, translate, type Locale } from './core'
const fields = ['name', 'subtitle', 'category', 'duration', 'tag', 'description', 'steps'] as const
export const localizeService = (item: ServiceItem, locale: Locale) => localizeRecord(item, locale, fields)
export const localizeProduct = (item: ProductItem, locale: Locale) => localizeRecord(item, locale, fields)
export function localizeStore(item: StoreItem, locale: Locale): StoreItem {
  return { ...localizeRecord(item, locale, ['name', 'address', 'tag', 'description']), services: item.services?.map(value => localizeService(value, locale)) }
}
export function localizeTherapist(item: Therapist, locale: Locale): Therapist {
  const result = localizeRecord(item, locale, ['storeName', 'grade', 'specialty'])
  // Real names remain as entered. The sample marker must remain visible in every language.
  return locale === 'zh' ? result : { ...result, name: item.name.replace(/（示例）|\(示例\)/g, ` (${translate('示例', locale)})`) }
}
export function localizeSite(site: Site, locale: Locale): Site {
  if (locale === 'zh') return site
  return {
    ...localizeRecord(site, locale, ['brandName', 'tagline', 'brandStory']),
    hero: localizeRecord(site.hero, locale, ['eyebrow', 'title', 'subtitle', 'button']),
    contact: localizeRecord(site.contact, locale, ['message']),
    sections: site.sections.map(value => localizeRecord(value, locale, ['name'])),
    stores: site.stores.map(value => localizeStore(value, locale)),
    services: site.services.map(value => localizeService(value, locale)),
    products: site.products.map(value => localizeProduct(value, locale)),
    galleryGroups: site.galleryGroups.map(value => localizeRecord(value, locale, ['name'])),
  }
}
