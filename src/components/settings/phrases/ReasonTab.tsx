'use client'

import { TemplateField } from './TemplateField'
import { errorOf, TextField, withTpl, type TabProps } from './fields'

// '사유 문장' 묶음(memo-settings AC-3007.1, 시안 #reason): 주사 간격·2부위 사유 문장({항목} 칸)과 주사 간격 일수

const REASON_TEXTS = [
  { key: 'itv', label: '주사 간격 사유' },
  { key: 'ia2', label: '2부위 시술 사유' },
] as const

export function ReasonTab({ draft, errors, onChange }: TabProps) {
  return (
    <div className="flex flex-col gap-4">
      {REASON_TEXTS.map(({ key, label }) => (
        <TemplateField key={key} rows={2} label={label} path={`TPL.${key}`} value={String(draft.TPL[key] ?? '')} draft={draft} error={errorOf(errors, `TPL.${key}`)} onChange={(value) => onChange(withTpl(draft, key, value))} />
      ))}
      <div className="max-w-50">
        <TextField
          label="주사 간격 일수"
          value={draft.TPL.intervalDays === undefined || Number.isNaN(draft.TPL.intervalDays) ? '' : String(draft.TPL.intervalDays)}
          error={errorOf(errors, 'TPL.intervalDays')}
          onChange={(value) => onChange(withTpl(draft, 'intervalDays', value.trim() === '' ? undefined : Number(value)))}
        />
      </div>
    </div>
  )
}
