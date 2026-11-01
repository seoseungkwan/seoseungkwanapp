'use client'

import { useLayoutEffect, useRef, useState } from 'react'
import { visitsText, wonAutoText, worklogTotals } from '@/lib/worklog/calc'
import { cellKindOf, cellShownText, excludedSumKeys, readDayNumbers } from '@/lib/worklog/cellText'
import { sheetDateText } from '@/lib/worklog/days'
import {
  CELL_MAX,
  MEMO_MAX,
  NAME_MAX,
  NOTE_MAX,
  WORKLOG_DEFAULT_NAMES,
  WORKLOG_LABELS,
  WORKLOG_NAME_OF,
  type WorklogCellKey,
  type WorklogDay,
  type WorklogNoteKey,
  type WorklogNumberKey,
  type WorklogWonKey,
} from '@/types/worklog'
import s from './sheet.module.css'

// 업무일지 엑셀 양식 칸 (specs/worklog REQ-008, design.md 2·11-1절). 값은 props로 받아 그리기만 하고, 바뀜은 콜백으로만 알린다.
// 표는 승인 시안 docs/mockups/worklog/text-cells.html을 칸·글자·빈칸 수까지 그대로 옮겼다. 칸 읽기·합계는 lib/worklog만 부른다

export type WorklogSheetProps = {
  ymd: string
  day: WorklogDay
  readOnly: boolean
  blockedCells: readonly WorklogCellKey[]
  onCell(key: WorklogCellKey, value: string): void
  onFocusCell(key: WorklogCellKey | null): void
}

type Sheet = Omit<WorklogSheetProps, 'ymd'> & { excluded: readonly WorklogCellKey[] }
type Place = { sheet: Sheet; className?: string; colSpan?: number; rowSpan?: number }

const COLUMN_WIDTHS = ['14.5%', '10.6%', '10.6%', '10.6%', '8.4%', '5.8%', '12%', '11.8%', '15.7%']
const FLAG_TEXT = '합계에서 빠졌어요'
const MEMO_HINT = '환자 이름·차트번호는 적지 않아요'

const classes = (...names: Array<string | false | undefined>) => names.filter(Boolean).join(' ')
// 마우스 올리기 글자. 칸보다 긴 글자와 줄여 보인 표시를 함께 보인다(시안 그대로)
const hoverText = (...parts: string[]) => parts.filter(Boolean).join(' · ') || undefined

type InputCellProps = Place & {
  cell: WorklogCellKey
  maxLength: number
  shown(focused: boolean): string // 아직 치지 않았을 때 칸 글자
  flagged?: boolean
  shortFlag?: boolean // 좁은 칸: 눈에는 "빠졌어요"만 보여 온전한 글자를 마우스 올리기에 둔다
}

// 숫자·항목 이름·비고 칸. 초점 중 친 글자만 들고 있다. 치기 전 글자는 값에서 내므로 값이 바뀌면 함께 바뀐다(AC-008.11)
function InputCell({ sheet, className, colSpan, rowSpan, cell, maxLength, shown, flagged = false, shortFlag = false }: InputCellProps) {
  const { readOnly, blockedCells, onCell, onFocusCell } = sheet
  const [focused, setFocused] = useState(false)
  const [typed, setTyped] = useState<string | null>(null)
  const [overflowing, setOverflowing] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  const selectAgain = useRef(false)

  // 탭으로 들어오면 브라우저가 칸 글자를 통째로 골라 둔다. 초점 글자로 바뀌면 풀리므로 다시 고른다(시안 그대로)
  useLayoutEffect(() => {
    if (selectAgain.current) input.current?.select()
    selectAgain.current = false
  }, [focused])

  const text = focused ? (typed ?? shown(true)) : shown(false)
  const blocked = blockedCells.includes(cell)
  const flagId = `worklog-flag-${cell}`
  const title = hoverText(overflowing ? text : '', flagged && shortFlag ? FLAG_TEXT : '')

  return (
    <td colSpan={colSpan} rowSpan={rowSpan} className={classes(s.in, className, blocked && s.blocked, flagged && s.flagged)}>
      <input
        ref={input}
        value={text}
        aria-label={WORKLOG_LABELS[cell]}
        aria-invalid={blocked || undefined}
        aria-describedby={flagged ? flagId : undefined}
        title={title}
        maxLength={maxLength}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => {
          setTyped(event.target.value)
          onCell(cell, event.target.value)
        }}
        onFocus={(event) => {
          const el = event.currentTarget
          selectAgain.current = el.value !== '' && el.selectionStart === 0 && el.selectionEnd === el.value.length
          setFocused(true)
          onFocusCell(cell)
        }}
        onBlur={() => {
          setFocused(false)
          setTyped(null)
          onFocusCell(null)
        }}
        onMouseEnter={(event) => setOverflowing(event.currentTarget.scrollWidth > event.currentTarget.clientWidth + 1)}
      />
      {flagged && (
        <span id={flagId} className={s.flag}>
          <span className={s.flagHead}>합계에서</span> 빠졌어요
        </span>
      )}
    </td>
  )
}

function NumberCell({ cell, ...place }: Place & { cell: WorklogNumberKey }) {
  const { day, excluded } = place.sheet
  const kind = cellKindOf(cell)
  return (
    <InputCell
      {...place}
      cell={cell}
      maxLength={CELL_MAX}
      flagged={excluded.includes(cell)}
      shortFlag={kind === 'count'}
      shown={(focused) => cellShownText(kind, day[cell], focused)}
    />
  )
}

function NameCell({ amount, ...place }: Place & { amount: WorklogWonKey }) {
  const cell = WORKLOG_NAME_OF[amount]
  const name = place.sheet.day[cell].trim() || WORKLOG_DEFAULT_NAMES[cell]
  return <InputCell {...place} cell={cell} maxLength={NAME_MAX} shown={() => name} />
}

function NoteCell({ cell, ...place }: Place & { cell: WorklogNoteKey }) {
  const note = place.sheet.day[cell]
  return <InputCell {...place} cell={cell} maxLength={NOTE_MAX} shown={() => note} />
}

function MemoCell({ sheet }: { sheet: Sheet }) {
  const { day, readOnly, blockedCells, onCell, onFocusCell } = sheet
  const blocked = blockedCells.includes('memo')
  return (
    <td colSpan={3} rowSpan={3} className={classes(s.memo, s.R, blocked && s.blocked)}>
      <textarea
        value={day.memo}
        aria-label={WORKLOG_LABELS.memo}
        aria-invalid={blocked || undefined}
        maxLength={MEMO_MAX}
        placeholder={readOnly ? undefined : MEMO_HINT}
        readOnly={readOnly}
        spellCheck={false}
        autoComplete="off"
        onChange={(event) => onCell('memo', event.target.value)}
        onFocus={() => onFocusCell('memo')}
        onBlur={(event) => {
          event.currentTarget.scrollTop = 0 // 긴 글은 나가면 맨 위부터 보인다(시안 그대로)
          onFocusCell(null)
        }}
      />
    </td>
  )
}

export function WorklogSheet({ ymd, day, readOnly, blockedCells, onCell, onFocusCell }: WorklogSheetProps) {
  const totals = worklogTotals(readDayNumbers(day))
  const sheet: Sheet = { day, readOnly, blockedCells, onCell, onFocusCell, excluded: excludedSumKeys(day) }

  return (
    // 1px line 테두리는 sheet.module.css의 허용 색(AC-007.4) 밖이라 Tailwind 클래스로 붙인다
    <div className={`${s.paper} border border-line`}>
      <table className={s.sheet} aria-label="업무일지">
        <colgroup>
          {COLUMN_WIDTHS.map((width, index) => (
            <col key={index} style={{ width }} />
          ))}
        </colgroup>
        <tbody>
          <tr className={s.r1}>
            <td colSpan={9} className={classes(s.title, s.L, s.R)}>
              업무일지
            </td>
          </tr>
          <tr className={s.r2}>
            <td colSpan={5} rowSpan={2} className={classes(s.lav, s.date, s.L)}>
              {sheetDateText(ymd)}
            </td>
            <td rowSpan={2} className={s.lav}>
              결<br />
              <br />재
            </td>
            <td className={s.lav}>담&nbsp;&nbsp;&nbsp;&nbsp;당</td>
            <td className={s.lav}>팀&nbsp;&nbsp;&nbsp;&nbsp;장</td>
            <td className={classes(s.lav, s.R)}>원&nbsp;&nbsp;&nbsp;&nbsp;장</td>
          </tr>
          <tr className={s.r3}>
            <td className={s.lav} />
            <td className={s.lav} />
            <td className={classes(s.lav, s.R)} />
          </tr>
          <tr className={s.r28}>
            <td rowSpan={3} className={s.L}>
              환 자<br />현 황
            </td>
            <td>외래</td>
            <td />
            <td />
            <td colSpan={2} rowSpan={3}>
              업무사항
            </td>
            <MemoCell sheet={sheet} />
          </tr>
          <tr className={s.r28}>
            <td>신 환</td>
            <NumberCell sheet={sheet} cell="newPatients" className={s.cnt} />
            <td className={s.lav}>합&nbsp;&nbsp;계</td>
          </tr>
          <tr className={s.r28}>
            <td>재 진</td>
            <NumberCell sheet={sheet} cell="returnPatients" className={s.cnt} />
            <td className={s.lav}>{visitsText(totals.visits)}</td>
          </tr>
          <tr>
            <td rowSpan={9} className={s.L}>
              수&nbsp;&nbsp;&nbsp;입
            </td>
            <NameCell sheet={sheet} amount="totalFee" colSpan={3} className={s.gray} />
            <NumberCell sheet={sheet} cell="totalFee" colSpan={5} className={classes(s.gray, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="claimAmount" colSpan={3} className={s.gray} />
            <NumberCell sheet={sheet} cell="claimAmount" colSpan={5} className={classes(s.gray, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="cashIn" colSpan={3} />
            <NumberCell sheet={sheet} cell="cashIn" colSpan={5} className={classes(s.wide, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="cardIn" colSpan={3} />
            <NumberCell sheet={sheet} cell="cardIn" colSpan={5} className={classes(s.wide, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="transferIn" colSpan={3} />
            <NumberCell sheet={sheet} cell="transferIn" colSpan={5} className={classes(s.wide, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="localCurrencyIn" colSpan={3} />
            <NumberCell sheet={sheet} cell="localCurrencyIn" colSpan={5} className={classes(s.wide, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="unpaidNew" colSpan={3} />
            <NumberCell sheet={sheet} cell="unpaidNew" colSpan={5} className={s.R} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="unpaidPaid" colSpan={3} />
            <NumberCell sheet={sheet} cell="unpaidPaid" colSpan={5} className={s.R} />
          </tr>
          <tr>
            <td colSpan={3} className={s.lav}>
              수납액
            </td>
            <td colSpan={5} className={classes(s.lav, s.R)}>
              {wonAutoText(totals.received)}
            </td>
          </tr>
          <tr>
            <td rowSpan={7} className={s.L}>
              지 출
            </td>
            <td colSpan={3}>&nbsp;항&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;목</td>
            <td colSpan={3}>금&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;액</td>
            <td colSpan={2} className={s.R}>
              비&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;고
            </td>
          </tr>
          <tr className={s.r20}>
            <NameCell sheet={sheet} amount="spendCash" colSpan={3} rowSpan={2} />
            <NumberCell sheet={sheet} cell="spendCash" colSpan={3} rowSpan={2} className={s.mid} />
            <NoteCell sheet={sheet} cell="noteCash" colSpan={2} rowSpan={2} className={classes(s.small, s.R)} />
          </tr>
          <tr className={s.r20} />
          <tr>
            <NameCell sheet={sheet} amount="spendCard" colSpan={3} />
            <NumberCell sheet={sheet} cell="spendCard" colSpan={3} className={s.mid} />
            <NoteCell sheet={sheet} cell="noteCard" colSpan={2} className={classes(s.small, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="spendRefund" colSpan={3} />
            <NumberCell sheet={sheet} cell="spendRefund" colSpan={3} className={s.mid} />
            <NoteCell sheet={sheet} cell="noteRefund" colSpan={2} className={classes(s.small, s.R)} />
          </tr>
          <tr>
            <NameCell sheet={sheet} amount="spendFree" colSpan={3} />
            <NumberCell sheet={sheet} cell="spendFree" colSpan={3} className={s.mid} />
            <NoteCell sheet={sheet} cell="noteFree" colSpan={2} className={classes(s.small, s.R)} />
          </tr>
          <tr>
            <td colSpan={3} className={s.gray}>
              총 지 불 액
            </td>
            <td colSpan={3} className={s.gray}>
              {wonAutoText(totals.spent)}
            </td>
            <NoteCell sheet={sheet} cell="noteTotal" colSpan={2} className={classes(s.gray, s.small, s.R)} />
          </tr>
          <tr>
            <td colSpan={4} className={classes(s.L, s.B)}>
              합&nbsp;&nbsp;&nbsp;계
            </td>
            <td colSpan={5} className={classes(s.lav, s.R, s.B)}>
              {wonAutoText(totals.net)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}
