'use client'

import { useId } from 'react'
import { ds } from '@/components/ui/classes'
import { DEFAULT_INTERVAL_CODES, DEFAULT_TWO_SITE_RULES, type Phrases, type PhraseTemplates } from '@/lib/precheck/memo'
import { REASON_PRIORITY_OPTIONS } from './saveDiffRows'
import { TemplateField } from './TemplateField'
import { errorOf, SelectField, TextField, withTpl, type TabProps } from './fields'

// '사유 문장' 묶음(memo-settings AC-3007.1, 시안 #reason): 주사 간격·2부위 사유 문장({항목} 칸)과 주사 간격 일수.
// 그 아래 숨어 있던 칸(clinic-profile AC-6613.1): 주사 간격을 볼 처방코드·2부위로 보는 처방·두 사유가 겹칠 때. 이름표는 phrases.ts 이름표 그대로다

const REASON_TEXTS = [
  { key: 'itv', label: '주사 간격 사유' },
  { key: 'ia2', label: '2부위 시술 사유' },
] as const

/** 글 칸을 비우면 그 칸을 지운다: 엔진이 기본값(engineDefaults.ts)을 쓰고, 화면은 그 값을 흐린 글로 보인다 */
export const withTplOrDefault = (draft: Phrases, key: keyof PhraseTemplates, value: string): Phrases => {
  const TPL = { ...draft.TPL, [key]: value }
  if (value.trim() === '') delete TPL[key]
  return { ...draft, TPL }
}

/** 비어 있으면 엔진 기본값이 흐린 글(placeholder)로 보이는 칸. 안내 글은 이름표 밖(aria-describedby)이라 칸 이름이 이름표 그대로다 */
export function DefaultedField({ label, help, value, placeholder, error, rows, onChange }: { label: string; help: string; value: string; placeholder: string; error?: string; rows?: number; onChange(value: string): void }) {
  const id = useId()
  const props = {
    id,
    value,
    placeholder,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': `${id}-help`,
    onChange: (event: { target: { value: string } }) => onChange(event.target.value),
  }
  return (
    <div className={ds.field}>
      <label className={ds.label} htmlFor={id}>
        {label}
      </label>
      {rows ? <textarea {...props} rows={rows} className={`${ds.input} h-auto py-2`} /> : <input {...props} className={ds.input} autoComplete="off" />}
      <p id={`${id}-help`} className={ds.help}>
        {help}
      </p>
      {error && <p className={ds.fieldError}>{error}</p>}
    </div>
  )
}

export function ReasonTab({ draft, errors, onChange }: TabProps) {
  const priority = draft.TPL.reasonPriority === 'interval' || draft.TPL.reasonPriority === 'both' ? draft.TPL.reasonPriority : ''
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
      <DefaultedField
        label="주사 간격을 볼 처방코드"
        help="쉼표로 나눠 적어요. 비워 두면 흐린 글의 기본값을 써요."
        value={String(draft.TPL.intervalCodes ?? '')}
        placeholder={DEFAULT_INTERVAL_CODES}
        error={errorOf(errors, 'TPL.intervalCodes')}
        onChange={(value) => onChange(withTplOrDefault(draft, 'intervalCodes', value))}
      />
      <DefaultedField
        label="2부위로 보는 처방"
        help="줄마다 '코드' 또는 '코드 = 함께 있어도 되는 코드, …'로 적어요. 비워 두면 흐린 글의 기본값을 써요."
        rows={3}
        value={String(draft.TPL.twoSiteRules ?? '')}
        placeholder={DEFAULT_TWO_SITE_RULES}
        error={errorOf(errors, 'TPL.twoSiteRules')}
        onChange={(value) => onChange(withTplOrDefault(draft, 'twoSiteRules', value))}
      />
      <div className="max-w-80">
        <SelectField label="두 사유가 겹칠 때" value={priority} options={REASON_PRIORITY_OPTIONS} error={errorOf(errors, 'TPL.reasonPriority')} onChange={(value) => onChange(withTplOrDefault(draft, 'reasonPriority', value))} />
      </div>
    </div>
  )
}
