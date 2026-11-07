export function day(offset = 0, now = Date.now()): string {
  return new Date(now + 8 * 3600000 + offset * 86400000).toISOString().slice(0, 10)
}
export function newId(): string {
  return `mini-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`
}
export function subscriptionIds(value?: string | string[]): string[] {
  return [...new Set((Array.isArray(value) ? value : [value]).filter((id): id is string => typeof id === 'string' && !!id.trim()).map(id => id.trim()))].slice(0, 3)
}
export function mergeMessages<T extends { id: string; seq: number }>(old: T[], incoming: T[]): T[] {
  return [...new Map([...old, ...incoming].map(m => [m.id, m])).values()].sort((a, b) => a.seq - b.seq)
}
// A new scope invalidates every pending request from the previous store/date.
export class RequestScope {
  private revision = 0
  next() { return ++this.revision }
  snapshot() { return this.revision }
  valid(revision: number) { return revision === this.revision }
  cancel() { this.revision++ }
}
export const message = (error: unknown) => error instanceof Error ? error.message : '操作未完成，请稍后重试。'
