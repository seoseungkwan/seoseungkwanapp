'use client'

// 매물 붙여 넣기 (spec location AC-7910.2·AC-7910.4, 시안 ?s=listings '매물 붙여 넣기').
// 칸을 읽어(form.ts readPaste) 틀린 칸은 그 칸 아래 글 · 맞으면 onSave(매물 몸통, 주소록 몸통 또는 null)를 부른다.
// 끝나면 칸을 비우고 알림 줄, 실패하면 오류 카드(E-LOC-SAVE-FAILED)이고 적은 값은 그대로 둔다
import { useId, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import type { AreaUnit } from '@/lib/location/area'
import type { BrokerBody } from './broker'
import { EMPTY_PASTE, PASTE_FIELDS, PASTE_LIMITS, readPaste, type ListingInput, type PasteDraft, type PasteErrors, type PasteField } from './form'
import { look } from './look'
import { Section } from './Section'

export type SaveListing = (fields: ListingInput, broker: BrokerBody | null) => Promise<void> | void

const UNITS: readonly [AreaUnit, string][] = [
  ['pyeong', '평'],
  ['m2', '㎡'],
]

/** 받침 있으면 '을', 없으면 '를'(한글이 아니면 '을(를)') */
function objectWord(word: string): string {
  const last = word.at(-1)
  const code = last === undefined ? -1 : last.charCodeAt(0) - 0xac00
  if (code < 0 || code > 11171) return '을(를)'
  return code % 28 === 0 ? '를' : '을'
}

function savedText(broker: BrokerBody | null): string {
  if (broker === null) return '매물을 저장했어요.'
  const name = broker.company.name
  return `매물을 저장했어요. 중개사 ${name}${objectWord(name)} 주소록(기타)에도 넣었어요.`
}

export function PasteForm({ onSave }: { onSave: SaveListing }) {
  const uid = useId()
  const idOf = (f: PasteField) => `${uid}-${f}`
  const [draft, setDraft] = useState<PasteDraft>(EMPTY_PASTE)
  const [errors, setErrors] = useState<PasteErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const [done, setDone] = useState('')

  const set = (f: PasteField, value: string) => {
    setDraft((d) => ({ ...d, [f]: value }))
    setDone('')
    setErrors((e) => {
      if (e[f] === undefined) return e
      const next = { ...e }
      delete next[f]
      return next
    })
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    const read = readPaste(draft)
    if (!read.ok) {
      setErrors(read.errors)
      setDone('')
      const first = PASTE_FIELDS.find((f) => read.errors[f] !== undefined)
      if (first) document.getElementById(idOf(first))?.focus()
      return
    }
    setErrors({})
    setFailed(false)
    setBusy(true)
    try {
      await onSave(read.fields, read.broker)
      setDraft((d) => ({ ...EMPTY_PASTE, areaUnit: d.areaUnit, book: d.book }))
      setDone(savedText(read.broker))
    } catch {
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  // 칸 하나: 이름(필수 표시) · 입력 · 틀린 글. extra는 이름 줄 오른쪽(넓이 단위)
  const field = (f: PasteField, label: string, input: ReactNode, opts: { req?: boolean; wide?: 2 | 4; extra?: ReactNode } = {}) => (
    <div className={`${look.field} ${opts.wide === 2 ? look.span2 : opts.wide === 4 ? look.spanAll : ''}`}>
      <div className={look.labelRow}>
        <label htmlFor={idOf(f)} className={look.label}>
          {label}
          {opts.req && <span className={look.req}>필수</span>}
        </label>
        {opts.extra}
      </div>
      {input}
      {errors[f] && (
        <p id={`${idOf(f)}-err`} className={look.error}>
          {errors[f]}
        </p>
      )}
    </div>
  )
  const common = (f: PasteField) => ({
    id: idOf(f),
    value: draft[f],
    onChange: (e: { target: { value: string } }) => set(f, e.target.value),
    'aria-invalid': errors[f] ? true : undefined,
    'aria-describedby': errors[f] ? `${idOf(f)}-err` : undefined,
  })
  const text = (f: PasteField, max: number, placeholder: string, extra: { type?: string; inputMode?: 'tel' } = {}) => (
    <input {...common(f)} type={extra.type ?? 'text'} inputMode={extra.inputMode} className={look.input} maxLength={max} placeholder={placeholder} autoComplete="off" />
  )
  const suffixed = (f: PasteField, suffix: string, placeholder: string, mode: 'numeric' | 'decimal', max: number) => (
    <div className={look.suffixWrap}>
      <input {...common(f)} type="text" inputMode={mode} className={look.inputSuffix} maxLength={max} placeholder={placeholder} autoComplete="off" />
      <span className={look.suffix} aria-hidden="true">
        {suffix}
      </span>
    </div>
  )
  const money = (f: PasteField, placeholder: string) => suffixed(f, '만 원', placeholder, 'numeric', PASTE_LIMITS.money + 2)
  const pyeong = draft.areaUnit === 'pyeong'
  const unitPicker = (
    <div role="group" aria-label="넓이 단위" className={look.seg}>
      {UNITS.map(([unit, name]) => (
        <button key={unit} type="button" className={look.segButton} aria-pressed={draft.areaUnit === unit} onClick={() => setDraft((d) => ({ ...d, areaUnit: unit }))}>
          {name}
        </button>
      ))}
    </div>
  )

  return (
    <Section title="매물 붙여 넣기" aside="링크를 붙이고 숫자는 보고 적어요 · 금액은 만 원">
      <form className={look.form} onSubmit={submit} noValidate>
        {field('url', '매물 링크', text('url', PASTE_LIMITS.url, '네이버 부동산 매물 화면 주소를 붙여 넣어요', { type: 'url' }), { wide: 2 })}
        {field('title', '건물 이름', text('title', PASTE_LIMITS.title, '예: 예시빌딩'), { req: true })}
        {field('floor', '층', text('floor', PASTE_LIMITS.floor, '예: 3층'))}
        {field('area', '전용 넓이', suffixed('area', pyeong ? '평' : '㎡', pyeong ? '52' : '171.9', 'decimal', PASTE_LIMITS.area), { req: true, extra: unitPicker })}
        {field('deposit', '보증금', money('deposit', '10,000'))}
        {field('rent', '월세', money('rent', '520'), { req: true })}
        {field('premium', '권리금', money('premium', '없으면 0'))}
        {field('mgmt', '관리비(한 달)', money('mgmt', '78'))}
        {field('office', '중개사 이름', text('office', PASTE_LIMITS.office, '예: 예시부동산'))}
        {field('person', '담당자', text('person', PASTE_LIMITS.person, '예: 김예시'))}
        {field('phone', '중개사 전화', text('phone', PASTE_LIMITS.phone, '010-0000-0000', { type: 'tel', inputMode: 'tel' }))}
        {field(
          'memo',
          '메모',
          <textarea {...common('memo')} className={look.textarea} maxLength={PASTE_LIMITS.memo} placeholder="중개사에게 들은 것, 직접 본 것" />,
          { wide: 4 },
        )}
        <div className={look.formFoot}>
          <div className={look.formFootLeft}>
            <label className={look.checkLabel}>
              <input type="checkbox" className={look.check} checked={draft.book} onChange={(e) => setDraft((d) => ({ ...d, book: e.target.checked }))} />
              중개사를 주소록(기타)에도 넣어요
            </label>
            <p role="status" className={look.status}>
              {done}
            </p>
          </div>
          <button type="submit" className={look.primary} aria-busy={busy || undefined}>
            매물 저장
          </button>
        </div>
        {failed && (
          <div className={look.spanAll}>
            <ErrorCard code="E-LOC-SAVE-FAILED" />
          </div>
        )}
      </form>
    </Section>
  )
}
