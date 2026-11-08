import type { CSSProperties } from 'react'
import { request, media } from './api'
import type { Runtime, Site } from '../types'

function cached<T>(load: () => Promise<T>) {
  let data: T | undefined, loaded = 0, pending: Promise<T> | undefined
  return async (force = false): Promise<T> => {
    if (!force && data && Date.now() - loaded < 60000) return data
    if (pending) return pending
    pending = load().then(result => { data = result; loaded = Date.now(); return result })
    try { return await pending } finally { pending = undefined }
  }
}
export const loadSite = cached(() => request<Site>('/api/site').then(media))
export const loadRuntime = cached(() => request<Runtime>('/api/runtime'))
// A one-use destination set by a homepage shortcut; ordinary resumes keep page state.
export const catalogState = { tab: '' }
// Only public store context is retained while navigating; no login or chat is started.
export const contactState = { storeId: '' }
export function themeStyle(site?: Site | null): CSSProperties {
  const colors = { sage: ['#344a3b', '#435e4b', '#faf9f3', '#e9eddf'], sand: ['#5b4937', '#7a654c', '#fbf7f0', '#f0e8dc'], ink: ['#35434a', '#3e535c', '#f7f8f8', '#e7ecee'] }[site?.theme || 'sage']
  return { '--ink': colors[0], '--primary': colors[1], '--paper': colors[2], '--soft': colors[3] } as CSSProperties
}
