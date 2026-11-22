'use client'

// 지금 의원 체외충격파 값(개원 준비 맨 위, 시안 ?s=plan · 글은 requirements '화면 글 기본값' › 개원 준비).
// location_settings.home_eswt(원 정수, 비우면 없음)를 받아 칸을 떠날 때 바뀐 값만 onSave로 넘긴다. 모든 후보에 같이 쓴다.
// 원 칸 읽기·글자는 비용 칸과 같은 범위(0~9,999,999,999원)라 costs.ts의 원 칸(perPatient) 규칙을 그대로 쓴다
import { useId, useState } from 'react'
import { costFieldText, parseCostInput } from '@/lib/location/costs'
import { look } from './look'
import { PLAN_TEXT as T, UNIT_ERROR, UNIT_TEXT } from './text'

export type HomeEswtProps = {
  /** 지금 의원 체외충격파 1회 값(원). 안 적었으면 null */
  value: number | null
  /** 바뀐 값(원 정수, 비우면 null) — 칸을 떠날 때 한 번 */
  onSave: (won: number | null) => void
}

const parse = (text: string) => parseCostInput('perPatient', text)
const textOf = (won: number | null) => costFieldText('perPatient', won ?? undefined)

export function HomeEswt({ value, onSave }: HomeEswtProps) {
  const uid = useId()
  const headId = `${uid}-head`
  const inputId = `${uid}-input`
  const unitId = `${uid}-unit`
  const helpId = `${uid}-help`
  const errorId = `${uid}-error`
  // seen = 마지막으로 받은 값, sent = 마지막으로 넘긴(또는 받은) 값. 넘긴 값이 되돌아오면 칸을 그대로 둔다
  const [state, setState] = useState(() => ({ seen: value, sent: value, text: textOf(value), shown: false }))
  if (value !== state.seen) {
    setState(value === state.sent ? { ...state, seen: value } : { seen: value, sent: value, text: textOf(value), shown: false })
  }
  const parsed = parse(state.text)
  const bad = !parsed.ok && state.shown

  const onBlur = () => {
    if (!parsed.ok) {
      setState({ ...state, shown: true })
      return
    }
    const next = parsed.value
    setState({ ...state, text: textOf(next), sent: next, shown: false })
    if (next !== state.sent) onSave(next)
  }

  return (
    <section aria-labelledby={headId}>
      <div className={look.head}>
        <h2 id={headId} className={look.h2}>
          {T.eswtTitle}
        </h2>
        <span className={look.aside}>{T.eswtAside}</span>
      </div>
      <div className={look.inline}>
        <div className={`${look.field} w-55`}>
          <label htmlFor={inputId} className={look.label}>
            {T.eswtLabel}
          </label>
          <div className={look.suffixWrap}>
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              autoComplete="off"
              className={look.number}
              value={state.text}
              aria-invalid={bad || undefined}
              aria-describedby={[unitId, helpId, bad ? errorId : null].filter(Boolean).join(' ')}
              onFocus={() => {
                if (state.shown) setState({ ...state, shown: false })
              }}
              onChange={(e) => setState({ ...state, text: e.target.value })}
              onBlur={onBlur}
            />
            <span id={unitId} className={look.unit}>
              {UNIT_TEXT.won}
            </span>
          </div>
          {bad && (
            <p id={errorId} className={look.error}>
              {UNIT_ERROR.won}
            </p>
          )}
        </div>
        <p id={helpId} className={`${look.help} self-center`}>
          {T.eswtHelp}
        </p>
      </div>
    </section>
  )
}
