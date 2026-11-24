'use client'

// 개원 비용 계산 + 합계 판 + 손익분기 (spec location AC-7913.1, design.md 11절, 시안 ?s=plan·?s=plan-filled, 글은 requirements '화면 글 기본값').
// 칸 열셋은 늘 빈칸에서 시작한다(기본 숫자 없음). 받은 costs(location_candidates.costs)는 checkCosts로 거르고,
// 칸 글은 parseCostInput으로 원 정수(만 원 칸 × 10,000, 이자 0.01% 단위)로 읽는다. 틀린 칸은 칸을 떠날 때 그 아래 글이 보이고 저장한 값을 그대로 둔다.
// 합계·손익분기는 calcCosts(design.md 식) 한 곳에서 센다 — 적는 동안 바로 바뀐다. 손익분기는 한 달 고정비와 직접 적는
// '환자 1명당 평균 수입'·'한 달 진료일'로만 세고 원장 몫은 들어 있지 않다(예상 환자 칸·견주는 글 없음).
// 매물의 보증금·권리금·월세·관리비는 칸 옆 참고 글로만 보이고 칸을 채우지 않는다.
// 금액 글(design.md 5절, AC-7905.7): 만 원 칸에서 온 값(참고 글·합계 판·6개월 고정비·한 달 고정비)은 manText(0 `없음`),
// 셈한 인테리어 합계(평 × 평당)·한 달 이자는 wonText. 셈은 원 정수 그대로(calcCosts)
// 부품은 props·콜백만 쓴다: 칸을 떠날 때 바뀐 비용이 있으면 onSave(아는 열쇠·칸 범위의 원 정수만)를 한 번 부른다.
// 밖에서 다른 비용이 오면(다른 후보) 그 값으로 다시 그리고, 넘긴 비용이 그대로 되돌아오면 고치던 칸을 그대로 둔다
import { useId, useState } from 'react'
import { useReadOnly } from '@/components/shell/viewing'
import { m2ToPyeong } from '@/lib/location/area'
import { COST_KEYS, calcCosts, checkCosts, costFieldText, parseCostInput, type CostKey, type Costs } from '@/lib/location/costs'
import { commaText, manText, wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'
import { look } from './look'
import { BREAK_EVEN_FIELDS, COST_FIELDS, EMPTY, PLAN_TEXT as T, UNIT_ERROR, UNIT_TEXT, type CostField } from './text'

/** 후보에 붙은 매물의 값(원) — 칸 옆 참고 글로만 쓴다 */
export type CostListing = Pick<Listing, 'deposit' | 'premium' | 'rent' | 'mgmt'>

export type OpenCostsProps = {
  /** 후보의 비용(location_candidates.costs, 읽은 그대로) */
  costs: Record<string, unknown>
  /** 인테리어 평수를 낼 넓이 ㎡(후보 넓이, 없으면 붙은 매물 넓이). 모르면 null */
  areaM2: number | null
  /** 후보에 붙은 매물. 없으면 null(참고 글 없음) */
  listing: CostListing | null
  /** 바뀐 비용(원 정수만, 빈칸은 열쇠 없음) — 칸을 떠날 때 */
  onSave: (costs: Costs) => void
}

type Texts = Record<CostKey, string>
type State = {
  /** 마지막으로 받은 costs의 열쇠 글자 */
  seen: string
  /** 마지막으로 넘긴(또는 받은) 비용 — 틀린 칸은 이 값을 쓴다 */
  base: Costs
  sent: string
  texts: Texts
  /** 칸을 떠난 뒤 틀린 글을 보일 칸 */
  shown: Partial<Record<CostKey, true>>
}

const keyOf = (c: Costs) => JSON.stringify(COST_KEYS.map((k) => c[k] ?? null))
const textsOf = (c: Costs) => Object.fromEntries(COST_KEYS.map((k) => [k, costFieldText(k, c[k])])) as Texts
const fresh = (saved: Costs): State => {
  const key = keyOf(saved)
  return { seen: key, base: saved, sent: key, texts: textsOf(saved), shown: {} }
}

/** 칸 글 → 비용(틀린 칸은 base 값) */
function draftOf(texts: Texts, base: Costs): Costs {
  const out: Costs = {}
  for (const k of COST_KEYS) {
    const p = parseCostInput(k, texts[k])
    const v = p.ok ? p.value : (base[k] ?? null)
    if (v !== null) out[k] = v
  }
  return out
}

/** 셈한 값(인테리어 합계·한 달 이자) */
const won = (n: number | null) => (n === null ? EMPTY : wonText(n))
const has = (v: number | undefined): v is number => v !== undefined
// 적은 칸만 더한다. 둘 다 비면 없음
const sum2 = (a: number | undefined, b: number | undefined) => (has(a) || has(b) ? (a ?? 0) + (b ?? 0) : null)
// 소수 첫째 자리까지(calcCosts가 이미 버린 값). 34.1 → '34.1' · 23 → '23'
function tenthsText(n: number): string {
  const tenths = Math.round(n * 10)
  const frac = tenths % 10
  return `${commaText(Math.floor(tenths / 10))}${frac === 0 ? '' : `.${frac}`}`
}
const validArea = (m2: number | null) => (m2 !== null && Number.isFinite(m2) && m2 > 0 ? m2 : null)

export function OpenCosts({ costs, areaM2, listing, onSave }: OpenCostsProps) {
  const uid = useId()
  // 다른 의원을 보는 중(읽기만, admin-view AC-8010.2)이면 칸은 읽기만(고치지 않으니 칸을 떠나도 저장하지 않는다)
  const readOnly = useReadOnly()
  const saved = checkCosts(costs)
  const savedKey = keyOf(saved)
  const [state, setState] = useState(() => fresh(saved))
  if (savedKey !== state.seen) {
    setState(savedKey === state.sent ? { ...state, seen: savedKey } : fresh(saved))
  }

  const area = validArea(areaM2)
  const draft = draftOf(state.texts, state.base)
  const sum = calcCosts(draft, area)

  const onChange = (key: CostKey, text: string) => setState({ ...state, texts: { ...state.texts, [key]: text } })
  const onFocus = (key: CostKey) => {
    if (state.shown[key]) setState({ ...state, shown: { ...state.shown, [key]: undefined } })
  }
  const onBlur = (key: CostKey) => {
    const p = parseCostInput(key, state.texts[key])
    if (!p.ok) {
      setState({ ...state, shown: { ...state.shown, [key]: true } })
      return
    }
    const nextKey = keyOf(draft)
    const texts = { ...state.texts, [key]: costFieldText(key, p.value ?? undefined) }
    setState({ ...state, texts, base: draft, sent: nextKey })
    if (nextKey !== state.sent) onSave(draft)
  }

  const refText = (field: CostField) => {
    if (!field.ref || listing === null) return null
    return T.listingRef(manText(listing[field.ref]))
  }

  const fieldRow = (field: CostField) => {
    const id = `${uid}-${field.key}`
    const unitId = `${id}-unit`
    const helpId = `${id}-help`
    const errorId = `${id}-error`
    const bad = state.shown[field.key] === true && !parseCostInput(field.key, state.texts[field.key]).ok
    const notes: string[] = []
    const ref = refText(field)
    if (ref !== null) notes.push(ref)
    if (field.extra === 'interior') notes.push(T.interiorTimes(area === null ? EMPTY : String(m2ToPyeong(area))))
    if (field.help) notes.push(field.help)
    return (
      <div key={field.key} className={look.row}>
        <label htmlFor={id} className={look.label}>
          {field.label}
        </label>
        <div className={look.suffixWrap}>
          <input
            id={id}
            type="text"
            inputMode={field.unit === 'rate' ? 'decimal' : 'numeric'}
            autoComplete="off"
            readOnly={readOnly}
            className={look.number}
            value={state.texts[field.key]}
            aria-invalid={bad || undefined}
            aria-describedby={[unitId, notes.length > 0 ? helpId : null, bad ? errorId : null].filter(Boolean).join(' ')}
            onFocus={() => onFocus(field.key)}
            onChange={(e) => onChange(field.key, e.target.value)}
            onBlur={() => onBlur(field.key)}
          />
          <span id={unitId} className={look.unit}>
            {UNIT_TEXT[field.unit]}
          </span>
        </div>
        <div className={look.rowNotes}>
          {notes.length > 0 && (
            <div id={helpId} className="grid gap-0.5">
              {notes.map((note) => (
                <p key={note} className={look.help}>
                  {note}
                </p>
              ))}
            </div>
          )}
          {field.extra === 'interior' && (
            <p className={look.extra}>
              {`${T.interiorTotal} `}
              <b className={look.extraNum}>{won(sum.interiorTotal)}</b>
            </p>
          )}
          {field.extra === 'interest' && (
            <p className={look.extra}>
              {`${T.interest} `}
              <b className={look.extraNum}>{won(sum.interest)}</b>
            </p>
          )}
          {bad && (
            <p id={errorId} className={look.error}>
              {UNIT_ERROR[field.unit]}
            </p>
          )}
        </div>
      </div>
    )
  }

  const headId = `${uid}-head`
  const subId = `${uid}-sub`
  const sumId = `${uid}-sum`
  const sumRow = (label: string, value: string) => (
    <div className={look.sumRow}>
      <span>{label}</span>
      <b className={look.sumNum}>{value}</b>
    </div>
  )

  return (
    <section aria-labelledby={headId}>
      <div className={look.head}>
        <h2 id={headId} className={look.h2}>
          {T.costTitle}
        </h2>
        <span className={look.aside}>{T.costAside}</span>
      </div>
      <div className={look.costGrid}>
        <form onSubmit={(e) => e.preventDefault()} noValidate>
          {COST_FIELDS.map(fieldRow)}
          <div className={look.autoRow}>
            <span className={look.label}>{T.sixMonths}</span>
            <span className={look.auto}>{manText(sum.sixMonths)}</span>
            <p className={look.help}>{T.sixMonthsHelp}</p>
          </div>
          <div className={look.subHead}>
            <h3 id={subId} className={look.h2}>
              {T.breakEvenFields}
            </h3>
          </div>
          {BREAK_EVEN_FIELDS.map(fieldRow)}
        </form>
        <aside aria-labelledby={sumId} aria-live="polite" className={look.sumBox}>
          <h3 id={sumId} className={look.sumTitle}>
            {T.sumTitle}
          </h3>
          {sumRow(T.sumDepositPremium, manText(sum2(draft.deposit, draft.premium)))}
          {sumRow(T.sumInterior, won(sum.interiorTotal))}
          {sumRow(T.sumEquipment, manText(sum2(draft.equipment, draft.otherStart)))}
          {sumRow(T.sixMonths, manText(sum.sixMonths))}
          <div className={look.sumTotal}>
            <span>{T.sumStart}</span>
            <b className={look.sumTotalNum}>{manText(sum.startTotal)}</b>
          </div>
          {sumRow(T.sumMine, sum.loanOver ? T.loanOver : manText(sum.mine))}
          <p className={look.help}>{sum.blanks === COST_KEYS.length ? T.allBlank : T.blanks(sum.blanks)}</p>
          <div className={look.breakEven}>
            <p className={look.breakEvenHead}>{T.breakEven}</p>
            {sumRow(T.monthlyFixed, manText(sum.monthlyFixed))}
            {sum.breakEven !== null ? (
              <>
                <p className={look.breakEvenNum}>
                  {T.perDay(tenthsText(sum.breakEven))}
                  <small className={look.breakEvenUnit}>{T.perDayUnit}</small>
                </p>
                <p className={look.small}>{T.breakEvenHelp}</p>
              </>
            ) : (
              <>
                <p className={look.breakEvenNone}>{EMPTY}</p>
                <p className={look.help}>{T.breakEvenMissing}</p>
              </>
            )}
            <p className={look.help}>{T.ownerShare}</p>
          </div>
        </aside>
      </div>
    </section>
  )
}
