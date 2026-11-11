import { translate } from '../../src/i18n/core'
export const i18nFixture = {
  getLocale: () => 'zh',
  t: (text: string, values?: Record<string, string | number>) => translate(text, 'zh', values),
  useI18n: () => ({ locale: 'zh' }),
  dialogLabels: (confirm = '确认') => ({ confirmText: confirm, cancelText: '取消' }),
}
