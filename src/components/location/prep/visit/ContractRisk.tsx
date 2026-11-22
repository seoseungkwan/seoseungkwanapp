import { useEffect, useId, useRef, useState } from 'react'
import { RISK_CHECKS, checkOf, type CleanChecks } from '@/lib/location/checklist'
import { IROS_URL, NEW_TAB } from '@/lib/location/links'
import { look } from './look'
import { CheckRow, ExternalIcon, SectionHead } from './parts'
import { EMPTY_VALUE, NEGO_HEAD, REGI_STEPS, RISK_TEXT as T, cutText } from './text'

// 계약 전 위험(시안 ?s=plan 계약 전 위험, AC-7913.3·AC-7913.5): 왼쪽 등기부 확인 다섯 줄 + [인터넷등기소 바로 가기](첫 화면 · 새 창),
// 오른쪽 임대 조건 메모(terms.memo 300자, 칸을 떠날 때·화면이 닫힐 때 저장) + 협상표 앞 세 줄 요약 + 계약서에 꼭 넣을 것 5줄(체크 칸).
// 메모는 받은 terms에 memo만 바꿔 넘긴다(협상표 칸은 매물 화면이 고치는 그대로)

export const MEMO_MAX = 300

export type ContractRiskProps = {
  terms: Record<string, unknown>
  checks: CleanChecks
  onToggle: (id: string, on: boolean) => void
  onTerms: (terms: Record<string, unknown>) => void
  onOpenLaw?: (id: string) => void
}

const textOf = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** 협상표 한 줄의 보일 값: 바라는 것 → 지금 제안 → – */
function negoValue(terms: Record<string, unknown>, key: string): string {
  const row = terms[key]
  if (!isRecord(row)) return EMPTY_VALUE
  return textOf(row.want) || textOf(row.now) || EMPTY_VALUE
}

export function memoOf(terms: Record<string, unknown>): string {
  return typeof terms.memo === 'string' ? cutText(terms.memo, MEMO_MAX) : ''
}

type Latest = { memo: string; terms: Record<string, unknown>; onTerms: (terms: Record<string, unknown>) => void }

/** 고친 메모가 있으면 받은 terms에 memo만 바꿔 넘긴다 */
function flushMemo(dirty: { current: boolean }, latest: { current: Latest }) {
  if (!dirty.current) return
  dirty.current = false
  const { memo, terms, onTerms } = latest.current
  onTerms({ ...terms, memo })
}

export function ContractRisk({ terms, checks, onToggle, onTerms, onOpenLaw }: ContractRiskProps) {
  const titleId = useId()
  const memoId = useId()
  const [memo, setMemo] = useState(() => memoOf(terms))
  const dirty = useRef(false)
  const latest = useRef<Latest>({ memo, terms, onTerms })
  useEffect(() => {
    latest.current = { memo, terms, onTerms }
  })
  // 화면이 닫힐 때 적던 메모를 저장한다(칸을 떠나지 않고 닫는 길)
  useEffect(() => () => flushMemo(dirty, latest), [])
  const save = () => flushMemo(dirty, latest)

  return (
    <section aria-labelledby={titleId} className="min-w-0">
      <SectionHead id={titleId} title={T.title} />
      <div className="mt-3 grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="text-body font-semibold text-ink">{T.regiTitle}</p>
          <ol className="mt-3 list-none border-t border-line [counter-reset:regi]">
            {REGI_STEPS.map(([strong, rest]) => (
              <li
                key={strong + rest}
                className="grid grid-cols-[24px_minmax(0,1fr)] gap-2 border-b border-line py-2.5 text-small text-ink-2 before:font-semibold before:text-accent-strong before:tabular-nums before:content-[counter(regi)] before:[counter-increment:regi]"
              >
                <span>
                  {strong && <b className="font-semibold text-ink">{strong}</b>}
                  {rest}
                </span>
              </li>
            ))}
          </ol>
          <p className="mt-3">
            <a href={IROS_URL} {...NEW_TAB} className={look.button}>
              {T.iros}
              <ExternalIcon />
            </a>
          </p>
          <p className={`mt-1.5 ${look.help}`}>{T.irosHelp}</p>
        </div>
        <div className="min-w-0">
          <div className={look.field}>
            <label htmlFor={memoId} className={look.label}>
              {T.memoLabel}
            </label>
            <textarea
              id={memoId}
              className={look.textarea}
              maxLength={MEMO_MAX}
              placeholder={T.memoPlaceholder}
              value={memo}
              onChange={(e) => {
                dirty.current = true
                setMemo(cutText(e.currentTarget.value, MEMO_MAX))
              }}
              onBlur={save}
            />
            <p className={look.help}>{T.nego(NEGO_HEAD.map(([key, name]) => `${name} ${negoValue(terms, key)}`))}</p>
          </div>
          <p className={`mt-4 ${look.smallStrong}`}>{T.clausesTitle}</p>
          <div className={`mt-1.5 ${look.checkList1}`}>
            {RISK_CHECKS.map((item) => (
              <CheckRow key={item.id} item={item} value={checkOf(checks, item.id)} onToggle={onToggle} onOpenLaw={onOpenLaw} />
            ))}
          </div>
        </div>
      </div>
    </section>
  )
}
