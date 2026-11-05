import { Fragment } from 'react'
import { ds } from '@/components/ui/classes'
import type { RecallRow } from '@/types/patients'
import { dayLabel } from '../periods'
import { CheckMark, ErrorLine } from './FollowupRows'

// 정기 주사 환자 줄(AC-612.1, 목업 rcTool 표·휴대폰 줄, UI_GUIDE '표'). 이름·전화·근거 문구는 여기서만 그린다. 줄은 props로만 받고 밖으로 내보내지 않는다.
// PC 표와 휴대폰 줄은 칸 차례가 달라 따로 그리고 폭으로 하나만 보인다(FollowupRows와 같다). 표시는 Worker 값 그대로다(눌러도 답이 오기 전에는 체크가 바뀌지 않는다)

const HEADS = ['연락함', '종류', '이름', '전화', '마지막 주사', '다음 예정일', '상태', '근거 문구']
const MARK_FAILED = '연락함을 저장하지 못했어요. 다시 눌러 주세요.'

// 표 칸 묶음(ds.table)에 없는 두 칸. 체크 칸은 글자('저장 중')가 옆에 놓여 ds.table.check보다 넓다(목업 .chk 96px)
const CHECK_CELL = 'h-11 w-24 whitespace-nowrap border-b border-line pr-1 pl-5'
const EVIDENCE_CELL = `${ds.table.tdSub} max-w-80 overflow-clip text-ellipsis`
const ERROR_CELL = 'border-b border-line px-3 py-2 first:pl-5 last:pr-5'
// 앱 초기화(.app-ui)에 목록 점·글자 크기가 없어 여기서 준다(목업 .pl: 점 없음, 이름·빈 줄은 14/22를 물려받는다)
const PHONE_LIST = 'mt-3 list-none border-t border-line text-body md:hidden'
const PHONE_LINE = 'mt-0.5 text-small text-ink-2'
const MARK_WORD = 'whitespace-nowrap text-small text-ink-2'

const Phone = ({ phone }: { phone: string }) => (phone ? <>{phone}</> : <span className="text-muted">번호 없음</span>)

// 글자는 Worker가 만든 그대로다(recallStatus). 모양만 고르고 글자가 늘 있어 색만으로 나타내지 않는다
function Status({ status }: { status: string }) {
  if (status.startsWith('지남')) return <span className={ds.chip.warning}>{status}</span>
  if (status === '오늘') return <span className={ds.chip.accent}>{status}</span>
  return <span className="text-ink-2">{status}</span>
}

type MarkProps = { row: RecallRow; busy: boolean; onMark(key: string, on: boolean): void }

function MarkInput({ row, busy, onMark }: MarkProps) {
  return (
    <span className={ds.checkboxWrap}>
      <input
        type="checkbox"
        className={ds.checkbox}
        aria-label={`${row.name} 연락함`}
        aria-busy={busy ? true : undefined}
        checked={row.contacted}
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

export function RecallRows({
  rows,
  onMark,
  busyKeys,
  markErrors,
  emptyText,
}: {
  rows: readonly RecallRow[]
  onMark(key: string, on: boolean): void
  /** 저장 답을 기다리는 줄. 여러 줄을 잇따라 누를 수 있다(AC-604.4) */
  busyKeys: ReadonlySet<string>
  /** 줄 열쇠 → 받은 오류 번호 */
  markErrors: ReadonlyMap<string, string>
  emptyText: string
}) {
  const markProps = (row: RecallRow): MarkProps => ({ row, busy: busyKeys.has(row.key), onMark })
  return (
    <>
      <div className={`${ds.table.wrap} mt-3 max-md:hidden`}>
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
                    <td className={ds.table.td}>
                      {row.label} <span className="text-muted">{row.months}개월마다</span>
                    </td>
                    <td className={ds.table.td}>{row.name}</td>
                    <td className={ds.table.tdSub}>
                      <Phone phone={row.phone} />
                    </td>
                    <td className={ds.table.tdSub}>{dayLabel(row.last)}</td>
                    <td className={ds.table.td}>{dayLabel(row.due)}</td>
                    <td className={ds.table.td}>
                      <Status status={row.status} />
                    </td>
                    <td className={EVIDENCE_CELL} title={row.evidence}>
                      {row.evidence}
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
        {rows.map((row) => {
          const code = markErrors.get(row.key)
          return (
            <li key={row.key} className="border-b border-line py-3">
              <div className="-mt-2 -mb-1 flex min-h-11 items-center justify-between gap-2">
                <span className="font-semibold text-ink">{row.name}</span>
                <PhoneMark {...markProps(row)} />
              </div>
              <p className={PHONE_LINE}>
                <span className="inline-flex items-center gap-1.5">
                  {row.label} · 다음 {dayLabel(row.due)}
                  <Status status={row.status} />
                </span>
              </p>
              <p className={PHONE_LINE}>
                <Phone phone={row.phone} /> · 마지막 주사 {dayLabel(row.last)}
              </p>
              <p className="mt-0.5 text-small text-muted">{row.evidence}</p>
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
