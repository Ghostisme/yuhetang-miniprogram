import { useEffect, useId, useState, type ReactNode } from 'react'
import Taro from '@tarojs/taro'
import { Button, ScrollView, Text, View } from '@tarojs/components'
import { t } from '../../i18n'
import './index.scss'

type Props = {
  title: string
  options: string[]
  value: number
  onChange: (index: number) => void
  disabled?: boolean
  className?: string
  triggerClassName?: string
  children?: ReactNode
}

// Native selector wheels have a fixed line height and clip translated branch/staff names.
// Keep date pickers native; text choices use a scrollable list with natural row heights.
export default function OptionSelect({ title, options, value, onChange, disabled = false, className = '', triggerClassName = '', children }: Props) {
  const [open, setOpen] = useState(false)
  const id = useId().replace(/:/g, '')
  useEffect(() => { if (disabled || !options.length) setOpen(false) }, [disabled, options.length])
  useEffect(() => {
    if (!open || process.env.TARO_ENV !== 'h5') return
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') setOpen(false) }
    document.addEventListener('keydown', close)
    return () => document.removeEventListener('keydown', close)
  }, [open])
  return <View className={`option-select ${className}`}>
    <Button className={`option-select-trigger ${triggerClassName}`} disabled={disabled || !options.length} aria-label={title} aria-expanded={open} onClick={() => setOpen(true)}>
      {children || <><Text className='option-select-value'>{options[value] || title}</Text><Text className='option-select-chevron'>⌄</Text></>}
    </Button>
    {open && <View className='option-select-overlay' catchMove>
      <View className='option-select-mask' onClick={() => setOpen(false)} />
      <View className='option-select-dialog' role='dialog' aria-modal aria-label={title}>
        <View className='option-select-header'><Text className='option-select-title'>{title}</Text><Button className='option-select-close' aria-label={t('关闭选项')} onClick={() => setOpen(false)}>×</Button></View>
        <ScrollView className='option-select-options' scrollY enhanced bounces={false} scrollIntoView={`option-${id}-${value}`} style={{ height: Taro.pxTransform(Math.min(options.length, 5) * 140) }}>
          {options.map((option, index) => <Button key={index} id={`option-${id}-${index}`} className={`option-select-option${index === value ? ' is-selected' : ''}`} aria-pressed={index === value} onClick={() => { onChange(index); setOpen(false) }}>
            <Text className='option-select-label'>{option}</Text><Text className='option-select-check'>{index === value ? '✓' : ''}</Text>
          </Button>)}
        </ScrollView>
        <View className='option-select-bottom' />
      </View>
    </View>}
  </View>
}
