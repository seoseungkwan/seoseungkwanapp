import { Fragment } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { compareYmd } from '@/lib/analytics/dates'
import type { FollowupRow, UndecidedRow } from '@/types/patients'
import { dayLabel } from '../periods'

// F/U 환자 줄(AC-611.5, 목업 fuTool 표·휴대폰 줄, UI_GUIDE '표'). 이름·전화·근거 문구는 여기서만 그린다. 줄은 props로만 받고 밖으로 내보내지 않는다.
// PC 표와 휴대폰 줄은 칸 차례가 달라 따로 그리고 폭으로 하나만 보인다(연결된 PC의 창이 좁을 때). 표시는 Worker 값 그대로다(눌러도 답이 오기 전에는 체크가 바뀌지 않는다)

const HEADS = ['연락함', '이름', '전화', '마지막 진료', '다음 날짜', '구분', '근거 문구']
const UNDECIDED_HEADS = ['이름', '전화', '마지막 진료', '근거 문구']
const MARK_FAILED = '연락함을 저장하지 못했어요. 다시 눌러 주세요.'

// 표 칸 묶음(ds.table)에 없는 두 칸. 체크 칸은 글자('저장 중')가 옆에 놓여 ds.table.check보다 넓다(목업 .chk 96px)
const CHECK_CELL = 'h-11 w-24 whitespace-nowrap border-b border-line pr-1 pl-5'
const EVIDENCE_CELL = `${ds.table.tdSub} max-w-80 overflow-hidden text-ellipsis`
const ERROR_CELL = 'border-b border-line px-3 py-2 first:pl-5 last:pr-5'
const TABLE_WRAP = `${ds.table.wrap} mt-3 max-md:hidden`
const PHONE_LIST = 'mt-3 border-t border-line md:hidden'
const PHONE_ITEM = 'border-b border-line py-3'
const PHONE_LINE = 'mt-0.5 text-small text-ink-2'
const PHONE_NOTE = 'mt-0.5 text-small text-muted'
const MARK_WORD = 'whitespace-nowrap text-small text-ink-2'

/** 글 + 오류 번호 한 줄(목업 errLine). [다시 불러오기]는 onReload를 줄 때만 있다 */
export function ErrorLine({ text, code, onReload }: { text: string; code: string; onReload?(): void }) {
  return (
    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2">
      <Icon name="stop" size={14} className="shrink-0 text-negative" />
      <span>{text}</span>
      <span className="text-caption text-ink-2">오류 번호 {code}</span>
      {onReload && (
        <button
          type="button"
          className={`inline-flex cursor-pointer items-center rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing} max-md:min-h-11`}
          onClick={() => onReload()}
        >
          다시 불러오기
        </button>
      )}
    </p>
  )
}

/** 체크 상자의 체크 그림(ds.checkbox 바로 뒤에 둔다, 목업 CHECK) */
export function CheckMark() {
  return (
    <svg aria-hidden="true" className={ds.checkboxMark} width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m4 8.25 2.6 2.6 5.4-5.85" />
    </svg>
  )
}

const Phone = ({ phone }: { phone: string }) => (phone ? <>{phone}</> : <span className="text-muted">번호 없음</span>)

function NextChips({ row, today }: { row: FollowupRow; today: string }) {
  return (
    <>
      {compareYmd(row.next, today) < 0 && <span className={ds.chip.warning}>지남</span>}
      {row.plan === '조건부' && <span className={ds.chip.neutral}>조건부</span>}
    </>
  )
}

type MarkProps = { row: FollowupRow; busy: boolean; blocked: boolean; onMark(key: string, on: boolean): void }

function MarkInput({ row, busy, blocked, onMark }: MarkProps) {
  return (
    <span className={ds.checkboxWrap}>
      <input
        type="checkbox"
        className={ds.checkbox}
        aria-label={`${row.name} 연락함`}
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

export function FollowupRows({
  rows,
  today,
  onMark,
  busyKeys,
  markErrors,
  marksBlocked,
  emptyText,
}: {
  rows: readonly FollowupRow[]
  today: string
  onMark(key: string, on: boolean): void
  /** 저장 답을 기다리는 줄. 여러 줄을 잇따라 누를 수 있다(AC-604.4) */
  busyKeys: ReadonlySet<string>
  /** 줄 열쇠 → 받은 오류 번호 */
  markErrors: ReadonlyMap<string, string>
  /** 연락 표시를 못 불러왔다(AC-604.8) */
  marksBlocked: boolean
  emptyText: string
}) {
  const markProps = (row: FollowupRow): MarkProps => ({ row, busy: busyKeys.has(row.key), blocked: marksBlocked, onMark })
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
                    <td className={ds.table.td}>{row.name}</td>
                    <td className={ds.table.tdSub}>
                      <Phone phone={row.phone} />
                    </td>
                    <td className={ds.table.tdSub}>{dayLabel(row.lastVisit)}</td>
                    <td className={ds.table.td}>
                      <span className="inline-flex items-center gap-1.5">
                        {dayLabel(row.next)}
                        <NextChips row={row} today={today} />
                      </span>
                    </td>
                    <td className={ds.table.tdSub}>{row.visitKind}</td>
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
            <li key={row.key} className={PHONE_ITEM}>
              <div className="-mt-2 -mb-1 flex min-h-11 items-center justify-between gap-2">
                <span className="font-semibold text-ink">{row.name}</span>
                <PhoneMark {...markProps(row)} />
              </div>
              <p className={PHONE_LINE}>
                <span className="inline-flex items-center gap-1.5">
                  {dayLabel(row.next)} · {row.visitKind}
                  <NextChips row={row} today={today} />
                </span>
              </p>
              <p className={PHONE_LINE}>
                <Phone phone={row.phone} /> · 마지막 진료 {dayLabel(row.lastVisit)}
              </p>
              <p className={PHONE_NOTE}>{row.evidence}</p>
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

/** 날짜 미정 명단(목업 .und). 연락함 칸이 없다 */
export function UndecidedRows({ rows }: { rows: readonly UndecidedRow[] }) {
  return (
    <section aria-labelledby="followup-undecided-title" className="mt-8">
      <h3 id="followup-undecided-title" className="text-subtitle font-semibold text-ink">
        날짜 미정 {rows.length}명
      </h3>
      <p className="mt-0.5 max-w-170 text-small text-muted">다시 오라고 적었지만 날짜가 없는 분이에요. 전화로 날짜를 잡아 주세요.</p>
      <div className={TABLE_WRAP}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              {UNDECIDED_HEADS.map((head) => (
                <th key={head} scope="col" className={ds.table.th}>
                  {head}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key} className={ds.table.row}>
                <td className={ds.table.td}>{row.name}</td>
                <td className={ds.table.tdSub}>
                  <Phone phone={row.phone} />
                </td>
                <td className={ds.table.tdSub}>{dayLabel(row.lastVisit)}</td>
                <td className={EVIDENCE_CELL} title={row.evidence}>
                  {row.evidence}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className={PHONE_LIST}>
        {rows.map((row) => (
          <li key={row.key} className={PHONE_ITEM}>
            <p className="font-semibold text-ink">{row.name}</p>
            <p className={PHONE_LINE}>
              <Phone phone={row.phone} /> · 마지막 진료 {dayLabel(row.lastVisit)}
            </p>
            <p className={PHONE_NOTE}>{row.evidence}</p>
          </li>
        ))}
      </ul>
    </section>
  )
}
