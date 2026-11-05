'use client'

import { useId, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import {
  cashReasonBlocked,
  cashVerdict,
  cellAmount,
  countedWon,
  expectedWon,
  guessCashDifference,
  parseFloatSetting,
  toCashCount,
  wonText,
  type CashGuess,
  type CashVerdict,
} from '@/lib/worklog/cashFloat'
import { readCell } from '@/lib/worklog/cellText'
import {
  CASH_COUNT_KEYS,
  CASH_COUNT_MAX,
  CASH_FLOAT_MAX,
  CASH_PIECES,
  CASH_REASON_MAX,
  type CashCountKey,
  type CashPiece,
  type WorklogCash,
  type WorklogDay,
} from '@/types/worklog'

// 업무일지 현금 시재 상자 (specs/worklog-cash-float REQ-1605·REQ-1606·REQ-1607, design.md '상자', 승인 시안 docs/mockups/worklog/cash-float.html).
// 받은 값을 그리기만 한다: 계산·추측은 lib/worklog/cashFloat, 저장은 onCash를 받은 화면(자동 저장)이 한다. 열고 닫는 [이 날만 고치기] 칸만 이 상자가 든다.
// 양식 밖이라 앱 규칙(ds·토큰·Pretendard)이고 인쇄에서 숨는다. 지금 화면 시험이 세는 role="status"·<output>·role="alert"를 쓰지 않는다
// (저장 상태 글은 날짜 줄의 것을 aria-hidden으로 한 번 더 보인다. 결과 글 자리만 aria-live)

export type CashGuessMode = { kind: 'bit'; bitCashIn: number | undefined } | { kind: 'other-pc' } | { kind: 'none' }
export type CashFloatBoxProps = {
  mode: 'edit' | 'locked' | 'view' // edit = PC 읽기 끝남, locked = PC 불러오는 중·실패, view = 터치 기기
  day: WorklogDay // 일지 칸(읽기만)
  cash: WorklogCash
  floatWon: number | null // cash.floatWon ?? 설정 금액, 모르면 null
  floatSetting: 'ready' | 'loading' | 'error'
  guess: CashGuessMode
  saveText: string // 날짜 줄 저장 상태와 같은 글
  onCash(next: WorklogCash): void
  onTakeBitCash(): void
  onReloadFloat(): void
}

const PIECE_NAME: Record<CashPiece, string> = {
  50000: '5만원권',
  10000: '1만원권',
  5000: '5천원권',
  1000: '1천원권',
  500: '500원',
  100: '100원',
  50: '50원',
  10: '10원',
}
const COMMAS = new Intl.NumberFormat('ko-KR')
const NO_AMOUNT = '—'
const FLOAT_INVALID = '금액을 숫자로 적어 주세요.'
const FLOAT_TOO_BIG = `시재 금액은 ${wonText(CASH_FLOAT_MAX)}까지 적을 수 있어요.`

const ROOT = 'flex min-w-0 flex-col gap-4 rounded-control border border-line bg-surface p-4 print:hidden max-md:p-3'
const CAPTION = 'pb-1.5 text-left text-small font-semibold text-ink-2'
// 세어 본 현금 표: 줄 36px, 머리 32px, 합계 위 2px ink 선
const TH_HEAD = 'h-8 border-b border-line px-2 text-caption font-medium text-muted'
const TH_ROW = 'h-9 border-b border-line px-2 text-left font-medium text-ink-2'
const TD = 'h-9 border-b border-line px-2 text-right text-ink'
const FOOT = 'h-9 border-t-2 border-ink px-2 font-semibold text-ink'
// 장수 칸: ds.input을 좁히고 오른쪽 맞춤. PC 32px, 768px 미만 44px(ds.input의 h-11·w-full·px-3보다 이겨야 해서 !)
const COUNT_INPUT = `${ds.input} h-8! w-16! px-2! text-right tabular-nums max-md:h-11! max-md:w-20!`
const FLOAT_INPUT = `${ds.input} h-8! w-32! px-2! text-right tabular-nums max-md:h-11!`
// 있어야 할 돈 줄
const ROW = 'flex min-h-9 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-line py-1'
const ROW_KEY = 'flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1 text-ink-2'
const ROW_SMALL = 'text-caption text-muted'
const ROW_VALUE = 'whitespace-nowrap text-ink'
const ROW_VALUE_OFF = 'whitespace-nowrap text-muted line-through' // 꺼진 확인란 줄은 흐리게
const ROW_TOTAL = 'flex min-h-9 items-center justify-between gap-3 border-t-2 border-ink py-1 font-semibold text-ink'
// 결과 상자: 맞음 positive, 다름 negative(soft 바탕), 안 셈 canvas
const RESULT_BASE = 'flex flex-col gap-3 rounded-control border px-4 py-3'
const RESULT_TONE: Record<'neutral' | 'positive' | 'negative', { box: string; verdict: string }> = {
  neutral: { box: `${RESULT_BASE} border-line bg-canvas`, verdict: 'text-body font-medium text-ink-2' },
  positive: { box: `${RESULT_BASE} border-transparent bg-positive-soft`, verdict: 'text-lead font-semibold text-positive' },
  negative: { box: `${RESULT_BASE} border-transparent bg-negative-soft`, verdict: 'text-lead font-semibold text-negative' },
}
const REASON_INPUT = `min-h-14 w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative aria-invalid:ring-1 aria-invalid:ring-negative disabled:cursor-not-allowed disabled:opacity-40 max-md:text-lead`
const SMALL_TEXT_BUTTON = `${ds.textButton} text-small!`

const pieceOf = (key: CashCountKey): CashPiece => CASH_PIECES[CASH_COUNT_KEYS.indexOf(key)]
const amountText = (won: number | null) => (won === null ? NO_AMOUNT : wonText(won))

// 거스름돈 추측·비트 다름 글 (AC-1606.1)
function guessText(guess: CashGuess): string {
  switch (guess.kind) {
    case 'bit-cash':
      return `일지 현금수납(${wonText(guess.typed)})이 비트(${wonText(guess.bit)})보다 ${wonText(Math.abs(guess.gap))} ${guess.gap > 0 ? '많아요.' : '적어요.'}`
    case 'change':
      return `${PIECE_NAME[guess.piece]} ${guess.count}장을 거스름돈으로 ${guess.direction === 'more' ? '더' : '덜'} 줬을 수 있어요.`
    case 'none':
      return '비트 기록으로는 이유를 찾지 못했어요. 영수증과 지출을 다시 봐 주세요.'
  }
}

function verdictText(verdict: CashVerdict): string {
  switch (verdict.kind) {
    case 'not-counted':
      return '장수를 적으면 맞는지 보여 드려요'
    case 'match':
      return '맞아요'
    case 'short':
      return `${wonText(verdict.won)} 모자라요`
    case 'over':
      return `${wonText(verdict.won)} 많아요`
    case 'no-float':
      return ''
  }
}

const toneOf = (verdict: CashVerdict) => (verdict.kind === 'match' ? 'positive' : verdict.kind === 'short' || verdict.kind === 'over' ? 'negative' : 'neutral')

// 적은 현금수납: 합계와 같은 규칙으로 숫자일 때만(비트 다름 추측, AC-1601.5)
function typedCashIn(day: WorklogDay): number | null {
  const read = readCell('won', day.cashIn)
  return read.kind === 'number' ? read.value : null
}

function Head({ titleId, saveText }: { titleId: string; saveText: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
      <h2 id={titleId} className="text-subtitle font-semibold text-ink">
        현금 시재
      </h2>
      <p aria-hidden="true" className="text-small text-muted">
        {saveText}
      </p>
    </div>
  )
}

/** 결과 상자: 결과 글(aria-live) + 다를 때만 추측·이유. 같은 요소를 두고 모양만 바꿔 읽어 주기가 끊기지 않게 한다 */
function Result({ verdict, counted, expected, children }: { verdict: CashVerdict; counted: number; expected: number | null; children?: ReactNode }) {
  if (verdict.kind === 'no-float') return null
  const tone = RESULT_TONE[toneOf(verdict)]
  return (
    <div className={tone.box}>
      <p aria-live="polite" className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={tone.verdict}>{verdictText(verdict)}</span>
        {verdict.kind !== 'not-counted' && expected !== null && (
          <span className="text-small text-ink-2 tabular-nums">{`세어 본 돈 ${wonText(counted)} · 있어야 할 돈 ${wonText(expected)}`}</span>
        )}
      </p>
      {children}
    </div>
  )
}

function CheckLabel({ label, checked, disabled, onChange }: { label: string; checked: boolean; disabled: boolean; onChange(checked: boolean): void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-1.5 text-small text-ink">
      <span className={ds.checkboxWrap}>
        <input
          type="checkbox"
          className={ds.checkbox}
          checked={checked}
          disabled={disabled}
          onChange={(event) => {
            if (!disabled) onChange(event.target.checked)
          }}
        />
        <Icon name="check" className={ds.checkboxMark} />
      </span>
      {label}
    </label>
  )
}

/** 휴대폰(터치 기기): 세어 본 돈·있어야 할 돈·결과·적어 둔 이유만. 안 센 날은 한 줄 (AC-1607.1·AC-1607.2) */
function ViewBox({ titleId, saveText, cash, counted, expected, verdict }: { titleId: string; saveText: string; cash: WorklogCash; counted: number; expected: number | null; verdict: CashVerdict }) {
  const differ = verdict.kind === 'short' || verdict.kind === 'over'
  return (
    <section aria-labelledby={titleId} className={ROOT}>
      <Head titleId={titleId} saveText={saveText} />
      {verdict.kind === 'not-counted' ? (
        <p className="text-body text-ink-2">아직 센 돈을 적지 않았어요</p>
      ) : (
        <>
          <div role="group" aria-label="현금 시재 결과" className="flex flex-col tabular-nums">
            <div className={ROW}>
              <span className={ROW_KEY}>세어 본 돈</span>
              <span className={ROW_VALUE}>{wonText(counted)}</span>
            </div>
            <div className={ROW}>
              <span className={ROW_KEY}>있어야 할 돈</span>
              <span className={ROW_VALUE}>{amountText(expected)}</span>
            </div>
          </div>
          <Result verdict={verdict} counted={counted} expected={expected}>
            {differ && cash.reason.trim() !== '' && (
              <div className="flex flex-col gap-1">
                <p className="text-small font-medium text-ink-2">차이 이유</p>
                <p className="whitespace-pre-wrap wrap-anywhere text-body text-ink">{cash.reason}</p>
              </div>
            )}
          </Result>
        </>
      )}
    </section>
  )
}

export function CashFloatBox({ mode, day, cash, floatWon, floatSetting, guess, saveText, onCash, onTakeBitCash, onReloadFloat }: CashFloatBoxProps) {
  const id = useId()
  const titleId = `${id}-title`
  const calcId = `${id}-calc`
  const guessId = `${id}-guess`
  const reasonId = `${id}-reason`
  const reasonHintId = `${id}-reason-hint`
  const floatErrorId = `${id}-float-error`
  // [이 날만 고치기] 칸: 열림·적는 글·안내만 이 상자가 든다(AC-1605.8)
  const [floatEditing, setFloatEditing] = useState(false)
  const [floatText, setFloatText] = useState('')
  const [floatError, setFloatError] = useState<string | null>(null)

  const counted = countedWon(cash)
  const expected = expectedWon(day, cash, floatWon)
  const verdict = cashVerdict(cash, expected)
  if (mode === 'view') return <ViewBox titleId={titleId} saveText={saveText} cash={cash} counted={counted} expected={expected} verdict={verdict} />

  // 안 센 날 설정을 모르면 틀린 시재를 그날에 저장하지 않으려고 잠근다(AC-1605.6). 그날 읽기가 끝나지 않았으면 모두 잠근다
  const floatUnknown = cash.floatWon === null && floatSetting !== 'ready'
  const locked = mode === 'locked' || floatUnknown
  const countedDay = cash.floatWon !== null
  const canFixFloat = mode === 'edit' && countedDay
  const fixingFloat = floatEditing && canFixFloat
  const differ = verdict.kind === 'short' || verdict.kind === 'over'
  const refundWon = cellAmount(day, 'spendRefund')
  const unpaidWon = cellAmount(day, 'unpaidPaid')
  const reasonBlocked = cashReasonBlocked(cash.reason)

  function change(next: WorklogCash) {
    if (!locked) onCash(next)
  }
  function changeCount(key: CashCountKey, text: string) {
    const count = toCashCount(text)
    if (count !== cash[key]) change({ ...cash, [key]: count })
  }
  function openFloat() {
    if (cash.floatWon === null) return
    setFloatText(COMMAS.format(cash.floatWon))
    setFloatError(null)
    setFloatEditing(true)
  }
  function closeFloat() {
    setFloatEditing(false)
    setFloatError(null)
  }
  function saveFloat() {
    const won = parseFloatSetting(floatText)
    if (won === 'invalid' || won === 'too-big') {
      setFloatError(won === 'invalid' ? FLOAT_INVALID : FLOAT_TOO_BIG)
      return
    }
    closeFloat()
    if (canFixFloat) onCash({ ...cash, floatWon: won })
  }
  function floatKey(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') saveFloat()
    if (event.key === 'Escape') closeFloat()
  }

  const amountRow = (label: string, won: number, check?: { label: string; checked: boolean; onChange(checked: boolean): void }) => {
    const shown = check !== undefined && won > 0
    return (
      <div className={ROW}>
        <span className={ROW_KEY}>
          {`${label} `}
          {shown ? <CheckLabel label={check.label} checked={check.checked} disabled={locked} onChange={check.onChange} /> : !check && <small className={ROW_SMALL}>일지</small>}
        </span>
        <span className={shown && !check.checked ? ROW_VALUE_OFF : ROW_VALUE}>{wonText(won)}</span>
      </div>
    )
  }

  return (
    <section aria-labelledby={titleId} className={ROOT}>
      <Head titleId={titleId} saveText={saveText} />

      {floatUnknown && (
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <p className="flex min-w-0 items-start gap-1.5 text-small text-ink-2">
            <Icon name="info" className="mt-0.5 shrink-0 text-muted" />
            <span>{floatSetting === 'loading' ? '시재 금액을 불러오는 중이에요' : '시재 금액을 불러오지 못했어요. 장수를 적으려면 다시 불러와 주세요.'}</span>
          </p>
          {floatSetting === 'error' && (
            <button type="button" className={ds.button.secondarySmall} onClick={onReloadFloat}>
              <Icon name="reload" />
              시재 금액 다시 불러오기
            </button>
          )}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <table className="w-full border-collapse text-body tabular-nums">
          <caption className={CAPTION}>세어 본 현금</caption>
          <thead>
            <tr>
              <th scope="col" className={`${TH_HEAD} text-left`}>
                종류
              </th>
              <th scope="col" className={`${TH_HEAD} text-right`}>
                장수
              </th>
              <th scope="col" className={`${TH_HEAD} text-right`}>
                금액
              </th>
            </tr>
          </thead>
          <tbody>
            {CASH_COUNT_KEYS.map((key) => {
              const name = PIECE_NAME[pieceOf(key)]
              const count = cash[key]
              return (
                <tr key={key}>
                  <th scope="row" className={TH_ROW}>
                    {name}
                  </th>
                  <td className={TD}>
                    <input
                      type="text"
                      inputMode="numeric"
                      autoComplete="off"
                      maxLength={String(CASH_COUNT_MAX).length}
                      aria-label={`${name} 장수`}
                      className={COUNT_INPUT}
                      value={count === 0 ? '' : String(count)}
                      disabled={locked}
                      onChange={(event) => changeCount(key, event.target.value)}
                    />
                  </td>
                  <td className={TD}>{count === 0 ? '' : wonText(count * pieceOf(key))}</td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" colSpan={2} className={`${FOOT} text-left`}>
                합계
              </th>
              <td className={`${FOOT} text-right`}>{wonText(counted)}</td>
            </tr>
          </tfoot>
        </table>

        <div role="group" aria-labelledby={calcId} className="flex min-w-0 flex-col text-body tabular-nums">
          <p id={calcId} className={CAPTION}>
            있어야 할 돈
          </p>
          <div className={ROW}>
            <span className={ROW_KEY}>
              {'시재 '}
              <small className={ROW_SMALL}>{countedDay ? '이 날 금액' : '설정 금액'}</small>
              {canFixFloat && !fixingFloat && (
                <button type="button" className={SMALL_TEXT_BUTTON} onClick={openFloat}>
                  이 날만 고치기
                </button>
              )}
            </span>
            {fixingFloat ? (
              <div className="flex flex-col items-end gap-1">
                <div className="flex flex-wrap items-center justify-end gap-2">
                  <input
                    type="text"
                    inputMode="numeric"
                    autoComplete="off"
                    autoFocus
                    aria-label="이 날 시재 금액"
                    aria-invalid={floatError !== null || undefined}
                    aria-describedby={floatError !== null ? floatErrorId : undefined}
                    className={FLOAT_INPUT}
                    value={floatText}
                    onChange={(event) => {
                      setFloatText(event.target.value)
                      setFloatError(null)
                    }}
                    onKeyDown={floatKey}
                  />
                  <span className="text-ink-2">원</span>
                  <button type="button" className={ds.button.primarySmall} onClick={saveFloat}>
                    저장
                  </button>
                  <button type="button" className={ds.button.secondarySmall} onClick={closeFloat}>
                    취소
                  </button>
                </div>
                {floatError !== null && (
                  <p id={floatErrorId} className={ds.fieldError}>
                    {floatError}
                  </p>
                )}
              </div>
            ) : (
              <span className={ROW_VALUE}>{amountText(floatWon)}</span>
            )}
          </div>
          {amountRow('+ 현금수납', cellAmount(day, 'cashIn'))}
          {amountRow('− 지출 현금', cellAmount(day, 'spendCash'))}
          {amountRow('− 환불', refundWon, {
            label: '현금으로 돌려줌',
            checked: cash.refundCash,
            onChange: (checked) => change({ ...cash, refundCash: checked }),
          })}
          {amountRow('+ 미수입금', unpaidWon, {
            label: '현금으로 받음',
            checked: cash.unpaidCash,
            onChange: (checked) => change({ ...cash, unpaidCash: checked }),
          })}
          <div className={ROW_TOTAL}>
            <span>있어야 할 돈</span>
            <span className="whitespace-nowrap">{amountText(expected)}</span>
          </div>
        </div>
      </div>

      <Result verdict={verdict} counted={counted} expected={expected}>
        {differ && guess.kind === 'bit' && (
          <div className="flex flex-col gap-1.5">
            <p id={guessId} className="text-small font-semibold text-ink">
              이렇게 생겼을 수 있어요
            </p>
            <ul aria-labelledby={guessId} className="flex list-disc flex-col gap-1 pl-5 text-small text-ink-2">
              {guessCashDifference(counted - (expected ?? 0), typedCashIn(day), guess.bitCashIn).map((item) => (
                <li key={item.kind}>
                  {guessText(item)}
                  {item.kind === 'bit-cash' && (
                    <button
                      type="button"
                      className={`${SMALL_TEXT_BUTTON} ml-1.5`}
                      disabled={locked}
                      onClick={() => {
                        if (!locked) onTakeBitCash()
                      }}
                    >
                      비트 숫자로 고치기
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
        {differ && guess.kind === 'other-pc' && <p className="text-small text-ink-2">비트 PC에서 열면 무엇이 틀렸을지 추측해 드려요</p>}
        {differ && (
          <div className="flex flex-col gap-1">
            <label htmlFor={reasonId} className="text-small font-medium text-ink-2">
              차이 이유 (선택)
            </label>
            <textarea
              id={reasonId}
              rows={2}
              maxLength={CASH_REASON_MAX}
              placeholder="예: 택배비 영수증을 지출에 안 적었어요"
              aria-invalid={reasonBlocked || undefined}
              aria-describedby={reasonHintId}
              className={REASON_INPUT}
              value={cash.reason}
              disabled={locked}
              onChange={(event) => change({ ...cash, reason: event.target.value })}
            />
            <p id={reasonHintId} className={reasonBlocked ? 'text-caption font-medium text-negative' : 'text-caption text-muted'}>
              환자 이름·차트번호는 적지 않아요
            </p>
          </div>
        )}
      </Result>
    </section>
  )
}
