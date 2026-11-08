import { Fragment } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import type { LapsedRow } from '@/types/patients'
import { dayLabel } from '../periods'
import { CheckMark, ErrorLine } from './FollowupRows'

// 장기 미방문 환자 줄(AC-2804.3·2804.5·2804.6, 시안 toolLapsed, UI_GUIDE '표'). 이름·전화·처방 이름은 여기서만 그린다.
// 줄은 props로만 받고 밖으로 내보내지 않는다. 차트번호는 줄 열쇠(key) 안에만 있고 화면 글자로 그리지 않는다(AC-2802.7).
// PC 표와 휴대폰 줄은 칸 차례가 달라 따로 그리고 폭으로 하나만 보인다. 연락함 체크는 F/U 연락함과 같은 모양이고 Worker 값 그대로다

const HEADS = ['연락함', '이름', '전화', '마지막 내원', '마지막 진료', '내원 횟수', '비고']
const VISITS_COLUMN = 5
const MARK_FAILED = '연락함을 저장하지 못했어요. 다시 눌러 주세요.'
// 처음에 10명까지 보인다(AC-2804.3)
const SHOWN = 10

// 표 칸 묶음(ds.table)에 없는 칸. 체크 칸은 글자('저장 중')가 옆에 놓여 ds.table.check보다 넓다(시안 .mkc 96px). 내원 횟수 머리는 숫자 칸처럼 오른쪽(시안 th.num)
const CHECK_CELL = 'h-11 w-24 whitespace-nowrap border-b border-line pr-1 pl-5'
const ERROR_CELL = 'border-b border-line px-3 py-2 first:pl-5 last:pr-5'
const TH_NUM = 'h-10 whitespace-nowrap border-b border-line px-3 text-right font-medium text-muted first:pl-5 last:pr-5'
const TABLE_WRAP = `${ds.table.wrap} mt-3 max-md:hidden`
// 앱 초기화(.app-ui)에 목록 점·글자 크기가 없어 여기서 준다(시안 .pl)
const PHONE_LIST = 'mt-3 list-none border-t border-line text-body md:hidden'
const PHONE_ITEM = 'border-b border-line py-3'
const PHONE_LINE = 'mt-0.5 text-small text-ink-2'
const PHONE_NOTE = 'mt-0.5 text-small text-muted'
const MARK_WORD = 'whitespace-nowrap text-small text-ink-2'

const Phone = ({ phone }: { phone: string }) => (phone ? <>{phone}</> : <span className="text-muted">번호 없음</span>)
const Name = ({ name }: { name: string }) => (name ? <>{name}</> : <span className="text-muted">이름 없음</span>)
const Reserved = ({ row }: { row: LapsedRow }) => (row.reserved ? <span className={ds.chip.accent}>예약 있음</span> : null)
const DaysAgo = ({ row }: { row: LapsedRow }) => <span className="text-muted">{formatCount(row.daysAgo)}일 전</span>

// 마지막 진료(AC-2804.6): 처방 추세 묶음 이름(Worker가 묶음 차례로 준다)을 잇고, 묶음이 없으면 처방 이름을 흐리게
const LastRx = ({ row }: { row: LapsedRow }) => (row.groups.length ? <>{row.groups.join(' · ')}</> : <span className="text-muted">{row.rxNames.join(' · ')}</span>)

type MarkProps = { row: LapsedRow; busy: boolean; blocked: boolean; onMark(key: string, on: boolean): void }

function MarkInput({ row, busy, blocked, onMark }: MarkProps) {
  return (
    <span className={ds.checkboxWrap}>
      <input
        type="checkbox"
        className={ds.checkbox}
        aria-label={`${row.name || '이름 없음'} 연락함`}
        aria-busy={busy ? true : undefined}
        checked={row.contacted}
        disabled={blocked}
        onChange={() => onMark(row.key, !row.contacted)}
      />
      <CheckMark />
    </span>
  )
}

// 표: 상자 + 글자(저장 중·연락함, 안 된 줄은 글자 없음)
function TableMark(props: MarkProps) {
  const word = props.busy ? '저장 중' : props.row.contacted ? '연락함' : ''
  return (
    <span className="inline-flex items-center gap-2">
      <MarkInput {...props} />
      {word && <span className={MARK_WORD}>{word}</span>}
    </span>
  )
}

// 휴대폰: 글자 + 상자. 글자가 늘 있고 줄 전체가 눌린다(44px)
function PhoneMark(props: MarkProps) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 pl-2">
      <span className={MARK_WORD}>{props.busy ? '저장 중' : '연락함'}</span>
      <MarkInput {...props} />
    </label>
  )
}

/** 고른 묶음의 표. 받은 차례 그대로다(마지막 내원이 늦은 차례, Worker가 정한다). expanded가 아니면 10명까지 */
export function LapsedRows({
  rows,
  onMark,
  busyKeys,
  markErrors,
  marksBlocked,
  emptyText,
  expanded,
}: {
  rows: readonly LapsedRow[]
  onMark(key: string, on: boolean): void
  /** 저장 답을 기다리는 줄. 여러 줄을 잇따라 누를 수 있다 */
  busyKeys: ReadonlySet<string>
  /** 줄 열쇠 → 받은 오류 번호 */
  markErrors: ReadonlyMap<string, string>
  /** 연락 표시를 못 불러왔다(AC-2804.5) */
  marksBlocked: boolean
  emptyText: string
  expanded: boolean
}) {
  const shown = expanded ? rows : rows.slice(0, SHOWN)
  const markProps = (row: LapsedRow): MarkProps => ({ row, busy: busyKeys.has(row.key), blocked: marksBlocked, onMark })
  return (
    <>
      <div className={TABLE_WRAP}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              {HEADS.map((head, index) => (
                <th key={head} scope="col" className={index === VISITS_COLUMN ? TH_NUM : ds.table.th}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={HEADS.length} className={ds.table.emptyRow}>
                  {emptyText}
                </td>
              </tr>
            )}
            {shown.map((row) => {
              const code = markErrors.get(row.key)
              return (
                <Fragment key={row.key}>
                  <tr className={ds.table.row}>
                    <td className={CHECK_CELL}>
                      <TableMark {...markProps(row)} />
                    </td>
                    <td className={ds.table.td}>
                      <Name name={row.name} />
                    </td>
                    <td className={ds.table.tdSub}>
                      <Phone phone={row.phone} />
                    </td>
                    <td className={ds.table.td}>
                      {dayLabel(row.last)} · <DaysAgo row={row} />
                    </td>
                    <td className={ds.table.td}>
                      <LastRx row={row} />
                    </td>
                    <td className={ds.table.tdNum}>{row.visits}번</td>
                    <td className={ds.table.td}>
                      <Reserved row={row} />
                    </td>
                  </tr>
                  {code && (
                    <tr>
                      <td className={ERROR_CELL} />
                      <td className={ERROR_CELL} colSpan={HEADS.length - 1}>
                        <ErrorLine text={MARK_FAILED} code={code} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <ul className={PHONE_LIST}>
        {rows.length === 0 && <li className="border-b border-line py-4 text-muted">{emptyText}</li>}
        {shown.map((row) => {
          const code = markErrors.get(row.key)
          return (
            <li key={row.key} className={PHONE_ITEM}>
              <div className="-mt-2 -mb-1 flex min-h-11 items-center justify-between gap-2">
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <span className="font-semibold text-ink">
                    <Name name={row.name} />
                  </span>
                  <Reserved row={row} />
                </span>
                <PhoneMark {...markProps(row)} />
              </div>
              <p className={PHONE_LINE}>
                마지막 내원 {dayLabel(row.last)} · {formatCount(row.daysAgo)}일 전
              </p>
              <p className={PHONE_LINE}>
                마지막 진료 <LastRx row={row} />
              </p>
              <p className={PHONE_NOTE}>
                <Phone phone={row.phone} /> · {row.visits}번 오심
              </p>
              {code && (
                <div className="mt-2">
                  <ErrorLine text={MARK_FAILED} code={code} />
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </>
  )
}
