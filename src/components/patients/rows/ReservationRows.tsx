import { Fragment } from 'react'
import { ds } from '@/components/ui/classes'
import { shortDay } from '@/lib/patients/reservations'
import type { MissedRow, ReservationRow } from '@/types/patients'
import { dayLabel } from '../periods'
import { CheckMark, ErrorLine } from './FollowupRows'

// 예약 문자 명단 환자 줄(AC-2803.1·2803.4·2803.5·2803.8·2803.9, 시안 toolReservations·pastSection, UI_GUIDE '표'). 이름·전화는 여기서만 그린다.
// 줄은 props로만 받고 밖으로 내보내지 않는다. 차트번호는 줄 열쇠(key) 안에만 있고 화면 글자로 그리지 않는다(AC-2802.7).
// PC 표와 휴대폰 줄은 칸 차례가 달라 따로 그리고 폭으로 하나만 보인다. 보냄 체크는 F/U 연락함과 같은 모양이고 Worker 값 그대로다(답이 오기 전에는 바뀌지 않는다)

const HEADS = ['보냄', '예약 시각', '이름', '전화']
const MISSED_HEADS = ['예약한 때', '이름', '전화', '비트 표시', '그 뒤']
const MARK_FAILED = '보냄 표시를 저장하지 못했어요. 다시 눌러 주세요.'
// 지난 예약 칸은 처음에 10건까지 보인다(AC-2803.5)
const SHOWN = 10

// 표 칸 묶음(ds.table)에 없는 두 칸. 체크 칸은 글자('저장 중')가 옆에 놓여 ds.table.check보다 넓다(시안 .mkc 96px)
const CHECK_CELL = 'h-11 w-24 whitespace-nowrap border-b border-line pr-1 pl-5'
const ERROR_CELL = 'border-b border-line px-3 py-2 first:pl-5 last:pr-5'
// 예약 표는 칸이 넷이라 폭을 720px로 둔다(시안 .tbw.narrow)
const TABLE_WRAP = `${ds.table.wrap} mt-3 max-w-180 max-md:hidden`
const MISSED_WRAP = `${ds.table.wrap} mt-3 max-md:hidden`
// 앱 초기화(.app-ui)에 목록 점·글자 크기가 없어 여기서 준다(시안 .pl)
const PHONE_LIST = 'mt-3 list-none border-t border-line text-body md:hidden'
const PHONE_ITEM = 'border-b border-line py-3'
const PHONE_EMPTY = 'border-b border-line py-4 text-muted'
const PHONE_LINE = 'mt-0.5 text-small text-ink-2'
const PHONE_NOTE = 'mt-0.5 text-small text-muted'
const MARK_WORD = 'whitespace-nowrap text-small text-ink-2'

const Phone = ({ phone }: { phone: string }) => (phone ? <>{phone}</> : <span className="text-muted">번호 없음</span>)
// 차트번호 없이 잡은 예약(처음 오시는 분)은 이름을 못 찾을 수 있다(design.md 위험)
const Name = ({ name }: { name: string }) => (name ? <>{name}</> : <span className="text-muted">이름 없음</span>)

type MarkProps = { row: ReservationRow; busy: boolean; blocked: boolean; onMark(key: string, on: boolean): void }

function MarkInput({ row, busy, blocked, onMark }: MarkProps) {
  return (
    <span className={ds.checkboxWrap}>
      <input
        type="checkbox"
        className={ds.checkbox}
        aria-label={`${row.name || '이름 없음'} 보냄`}
        aria-busy={busy ? true : undefined}
        checked={row.sent}
        disabled={blocked}
        onChange={() => onMark(row.key, !row.sent)}
      />
      <CheckMark />
    </span>
  )
}

// 표: 상자 + 글자(저장 중·보냄, 안 된 줄은 글자 없음)
function TableMark(props: MarkProps) {
  const word = props.busy ? '저장 중' : props.row.sent ? '보냄' : ''
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
      <span className={MARK_WORD}>{props.busy ? '저장 중' : '보냄'}</span>
      <MarkInput {...props} />
    </label>
  )
}

/** 고른 날 예약 표(보냄 · 예약 시각 · 이름 · 전화). 받은 차례 그대로다(예약 시각 → 이름, Worker가 정한다) */
export function ReservationRows({
  rows,
  onMark,
  busyKeys,
  markErrors,
  marksBlocked,
  emptyText,
}: {
  rows: readonly ReservationRow[]
  onMark(key: string, on: boolean): void
  /** 저장 답을 기다리는 줄. 여러 줄을 잇따라 누를 수 있다 */
  busyKeys: ReadonlySet<string>
  /** 줄 열쇠 → 받은 오류 번호 */
  markErrors: ReadonlyMap<string, string>
  /** 보냄 표시를 못 불러왔다(AC-2803.8) */
  marksBlocked: boolean
  emptyText: string
}) {
  const markProps = (row: ReservationRow): MarkProps => ({ row, busy: busyKeys.has(row.key), blocked: marksBlocked, onMark })
  return (
    <>
      <div className={TABLE_WRAP}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              {HEADS.map((head) => (
                <th key={head} scope="col" className={ds.table.th}>
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
            {rows.map((row) => {
              const code = markErrors.get(row.key)
              return (
                <Fragment key={row.key}>
                  <tr className={ds.table.row}>
                    <td className={CHECK_CELL}>
                      <TableMark {...markProps(row)} />
                    </td>
                    <td className={ds.table.td}>{row.time}</td>
                    <td className={ds.table.td}>
                      <Name name={row.name} />
                    </td>
                    <td className={ds.table.tdSub}>
                      <Phone phone={row.phone} />
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
        {rows.length === 0 && <li className={PHONE_EMPTY}>{emptyText}</li>}
        {rows.map((row) => {
          const code = markErrors.get(row.key)
          return (
            <li key={row.key} className={PHONE_ITEM}>
              <div className="-mt-2 -mb-1 flex min-h-11 items-center justify-between gap-2">
                <span className="font-semibold text-ink">
                  <Name name={row.name} />
                </span>
                <PhoneMark {...markProps(row)} />
              </div>
              <p className={PHONE_LINE}>
                {row.time} · <Phone phone={row.phone} />
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

/** 번호 없는 분 주의 칸(AC-2803.9, 시안 .warnbox). 고른 날 줄 중 번호가 없는 분만 이름 · 예약 시각으로 적는다. 모두 번호가 있으면 없다 */
export function NoPhoneBox({ rows }: { rows: readonly ReservationRow[] }) {
  const missing = rows.filter((row) => !row.phone)
  if (!missing.length) return null
  return (
    <div role="note" className="mt-3 max-w-180 rounded-control bg-warning-soft px-4 py-3 text-small text-ink-2">
      <p>
        <b className="font-semibold text-warning">번호 없는 {missing.length}분은 문자가 안 가요. 전화로 알려 주세요.</b>
      </p>
      {missing.map((row) => (
        <p key={row.key} className="mt-0.5">
          {row.name || '이름 없음'} · {row.time}
        </p>
      ))}
    </div>
  )
}

// 비트 표시: 예약 취소(회색) · 예약 그대로(주황). 글자가 늘 있어 색만으로 나타내지 않는다
const MarkChip = ({ row }: { row: MissedRow }) => <span className={row.mark === '예약 취소' ? ds.chip.neutral : ds.chip.warning}>{row.mark}</span>

// 그 뒤: 처음 오신 날(초록) · 아직 안 오심(흐림)
const After = ({ row }: { row: MissedRow }) =>
  row.after ? <span className="font-medium text-positive">{shortDay(row.after)}에 오심</span> : <span className="text-muted">아직 안 오심</span>

/** 지난 예약 중 안 오신 분 표(AC-2803.5). 받은 차례 그대로(예약한 때가 늦은 차례)이고 expanded가 아니면 10건까지 */
export function MissedRows({ rows, expanded, emptyText }: { rows: readonly MissedRow[]; expanded: boolean; emptyText: string }) {
  const shown = expanded ? rows : rows.slice(0, SHOWN)
  return (
    <>
      <div className={MISSED_WRAP}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              {MISSED_HEADS.map((head) => (
                <th key={head} scope="col" className={ds.table.th}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={MISSED_HEADS.length} className={ds.table.emptyRow}>
                  {emptyText}
                </td>
              </tr>
            )}
            {shown.map((row) => (
              <tr key={row.key} className={ds.table.row}>
                <td className={ds.table.td}>
                  {dayLabel(row.day)} {row.time}
                </td>
                <td className={ds.table.td}>
                  <Name name={row.name} />
                </td>
                <td className={ds.table.tdSub}>
                  <Phone phone={row.phone} />
                </td>
                <td className={ds.table.td}>
                  <MarkChip row={row} />
                </td>
                <td className={ds.table.td}>
                  <After row={row} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className={PHONE_LIST}>
        {rows.length === 0 && <li className={PHONE_EMPTY}>{emptyText}</li>}
        {shown.map((row) => (
          <li key={row.key} className={PHONE_ITEM}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-ink">
                <Name name={row.name} />
              </span>
              <MarkChip row={row} />
            </div>
            <p className={PHONE_LINE}>
              {dayLabel(row.day)} {row.time} · <Phone phone={row.phone} />
            </p>
            <p className={PHONE_NOTE}>
              <After row={row} />
            </p>
          </li>
        ))}
      </ul>
    </>
  )
}
