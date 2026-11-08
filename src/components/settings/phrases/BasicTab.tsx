'use client'

import type { PhraseTemplates } from '@/lib/precheck/memo'
import { CheckField, errorOf, SelectField, TextField, withTpl, type TabProps } from './fields'

// '기본' 묶음(memo-settings AC-3007.1, 시안 #basic): 메모 모양. 지난 화면의 '메모 모양' 칸 그대로다

type Key = keyof PhraseTemplates

const SHAPE_SELECTS: { key: Key; label: string; options: { value: string; label: string }[] }[] = [
  { key: 'sideStyle', label: '좌우 표기', options: [{ value: 'Rt', label: 'Rt·Lt·both' }, { value: 'upper', label: 'RT·LT·BOTH' }, { value: 'dot', label: 'Rt.·Lt.·Both' }, { value: 'bil', label: 'Rt·Lt·Bil' }, { value: 'ko', label: '우측·좌측·양측' }, { value: 'koShort', label: '우·좌·양' }] },
  { key: 'cartilageSideLang', label: '연골주사 좌우 표기', options: [{ value: 'ko', label: '한글' }, { value: 'en', label: '영어' }] },
  { key: 'levelSep', label: '레벨 이어 쓰기', options: [{ value: 'comma', label: '쉼표' }, { value: 'dash', label: '붙임표' }, { value: 'repeat', label: '글자 반복' }] },
  { key: 'lineJoin', label: '줄 나눔', options: [{ value: 'lines', label: '줄마다 나누기' }, { value: 'oneLine', label: '한 줄로 이어쓰기' }] },
  { key: 'drugWrap', label: '약 모양', options: [{ value: 'paren', label: '괄호' }, { value: 'plain', label: '괄호 없음' }] },
]

export function BasicTab({ draft, errors, onChange }: TabProps) {
  const set = (key: Key, value: unknown) => onChange(withTpl(draft, key, value))
  return (
    <div className="flex flex-col gap-3">
      <div className="max-w-80">
        <TextField label="줄 앞 기호" value={String(draft.TPL.mark ?? '')} error={errorOf(errors, 'TPL.mark')} onChange={(value) => set('mark', value)} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {SHAPE_SELECTS.map(({ key, label, options }) => (
          <SelectField key={key} label={label} value={String(draft.TPL[key] ?? options[0].value)} options={options} error={errorOf(errors, `TPL.${String(key)}`)} onChange={(value) => set(key, value)} />
        ))}
        <TextField label="약 양 단위" value={String(draft.TPL.drugUnit ?? '')} error={errorOf(errors, 'TPL.drugUnit')} onChange={(value) => set('drugUnit', value)} />
      </div>
      <CheckField label="양도 쓰기 (비트 처방의 투여량)" checked={draft.TPL.drugQty === true} error={errorOf(errors, 'TPL.drugQty')} onChange={(checked) => set('drugQty', checked)} />
    </div>
  )
}
