import type { ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { ChartLine, ChartLineKind, MemoTableRow, RxRow, TargetRow } from '@/types/precheck'
import { dayLabel } from '../dateList'
import { LEFT_GROUPS } from './leftGroups'
import { RowTags, type ListGroup } from './MemoList'

// 오른쪽 고른 환자 상세(memo-split REQ-3105, 승인 시안 4의 .detail). 머리 → 단추 줄(초록 복사·상태 줄) → 우리 메모 | 비트 메모 두 칸 → 증상·처방 표.
// 줄은 props로만 받는다. 어느 상태 줄인지(CopyStatus)·단추를 막을지는 화면(MemoPanel·memoSplit)이 정하고 여기는 그대로 그린다.
// 알림은 떠 사라지는 알림 대신 단추 줄 맨 아래 상태 줄 한 곳이다. 기호는 글자와 같이 쓰고, 완료·복사 실패의 기호는 공용 Icon(check·x)이다(ui-90 AC-408.2)

/** 상태 줄 하나(AC-3103.2~AC-3103.8·AC-3104.6). 고르는 차례는 memoSplit.copyStatus가 정한다 */
export type CopyStatus = 'editing' | 'failed' | 'failedAgain' | 'reopened' | 'mark' | 'none' | 'locked' | 'stuck' | 'copied' | 'done' | 'ready'

type Line = { tone: string; sign?: 'check' | 'x' | '!'; lead?: string; text: string; role?: 'alert' | 'status' }
/** 기본(ready)은 상태 줄이 없다(claim-memo-fit AC-4804.1). 다른 상태의 글·색·기호는 그대로(AC-4804.2) */
const STATUS: Record<Exclude<CopyStatus, 'ready'>, Line> = {
  editing: { tone: 'text-muted', text: '우리 메모를 고치는 중이에요. 칸 밖을 누르면 반영돼요.' },
  locked: { tone: 'text-muted', text: '입력 중에는 복사할 수 없어요.' },
  stuck: { tone: 'text-muted', text: '저장이 막혀 있는 동안에는 복사할 수 없어요.' },
  failed: { tone: 'text-negative', sign: 'x', lead: '복사하지 못했어요.', text: '완료로 바뀌지 않았어요. 다시 눌러 주세요.', role: 'alert' },
  failedAgain: { tone: 'text-negative', sign: 'x', lead: '다시 복사하지 못했어요.', text: '완료는 그대로예요. 다시 눌러 주세요.', role: 'alert' },
  reopened: { tone: 'text-warning', sign: '!', lead: '메모를 고쳐서 완료가 풀렸어요.', text: '고친 메모를 다시 복사(완료)해 주세요.' },
  mark: { tone: 'text-warning', sign: '!', lead: '확인 표시가 남아 있어 복사할 수 없어요.', text: '[메모 고치기]로 표시를 지운 뒤 눌러 주세요.' },
  none: { tone: 'text-muted', text: '우리 메모가 없어 복사할 게 없어요.' },
  copied: { tone: 'text-positive', sign: 'check', lead: '복사했고 완료했어요.', text: '비트 메모 칸에 붙여 넣으세요.', role: 'status' },
  done: { tone: 'text-positive', sign: 'check', lead: '완료한 환자예요.', text: '다시 복사해도 완료는 그대로예요.' },
}

/** 입력 기록의 마지막 상태(AC-3105.3, 메모 표 AC-018.1의 글 그대로). 완료는 머리의 상태 표가 말한다 */
const JOURNAL_TEXT: Record<string, string> = { check: '확인 필요', skipped: '건너뜀', skippedByHand: '직접 확인', writing: '쓰다 멈춤', writeUnconfirmed: '쓰다 멈춤' }
/** 증상 줄 이름표(메모 분석의 줄 종류, AC-2602.1)와 처방 종류 이름(AC-2602.2). 표에는 바탕색이 없다(AC-3105.5) */
const LINE_LABEL: Record<ChartLineKind, string> = { subj: '호소', exam: '검사', dx: '진단', img: '영상', proc: '시술', rx: '처치', plan: '계획' }
const RX_LABEL: Record<RxRow['kind'], string> = { proc: '시술', drug: '약제', other: '기타' }

const kbd = 'inline-block min-w-4.5 rounded-control border border-b-2 px-1 text-center font-sans text-caption font-semibold'
const kbdPlain = `${kbd} border-line-strong bg-surface text-ink-2`
const kbdOnGreen = `${kbd} border-surface/55 bg-surface/20 text-surface`
// 초록 복사 단추(시안 .btn.go): ds 단추와 같은 틀에 positive 바탕·흰 글자
const copyButton = `inline-flex h-9 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border border-positive bg-positive px-4 text-body font-semibold text-surface transition not-disabled:active:translate-y-px disabled:cursor-not-allowed disabled:opacity-40 max-md:h-11 ${ds.focusRing}`
// 단추 상자의 그 밖의 단추: lg 이상은 복사 단추 아래 줄에 나란히 나눠 선다(AC-4803.4)
const sideButton = `${ds.button.secondarySmall} lg:flex-1`
const secTitle = 'text-small font-semibold text-ink'
const secCount = 'text-caption font-normal text-muted'
// lg 이상은 표가 칸 안에서 따로 스크롤된다: 테두리는 감싸개가 갖고(표는 lg:border-0) 처방 표 머리는 위에 붙는다(AC-4803.5·AC-4803.6)
const table = 'w-full table-fixed border-collapse border border-line text-small lg:border-0'
const tableBox = 'lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain lg:border lg:border-line'
const th = 'whitespace-nowrap border-b border-line bg-canvas px-2 py-1 text-left text-caption font-medium text-muted lg:sticky lg:top-0 lg:z-1'
const td = 'border-t border-line px-2 py-1 align-top'
const kindCell = (proc: boolean) => `${td} whitespace-nowrap text-caption ${proc ? 'font-semibold text-ink' : 'text-muted'}`
const note = 'text-caption text-muted'

/** 단추 줄 맨 아래 상태 줄: 앞 기호(Icon x · ! · Icon check)와 첫 문장은 굵게(시안 .status) */
function StatusLine({ status }: { status: CopyStatus }) {
  if (status === 'ready') return null
  const { tone, sign, lead, text, role } = STATUS[status]
  return (
    <p role={role} className={`flex basis-full items-baseline gap-1.5 text-small ${tone}`}>
      {sign && <span className="inline-flex shrink-0 self-center font-semibold">{sign === '!' ? '!' : <Icon name={sign} size={14} />}</span>}
      {lead ? (
        <span>
          <b className="font-semibold">{lead}</b> {text}
        </span>
      ) : (
        text
      )}
    </p>
  )
}

/** 우리 메모를 그 자리에서 고치는 칸(AC-3105.4). 입력 중(locked)에는 읽기 전용이고 칸 밖을 눌러도 알리지 않는다(AC-2203.3 그대로) */
function Editor({ row, locked, onDone }: { row: TargetRow; locked: boolean; onDone(text: string): void }) {
  return (
    <textarea
      aria-label={`${row.name} 우리 메모 고치기`}
      autoFocus
      defaultValue={row.text}
      rows={3}
      maxLength={32000}
      readOnly={locked}
      className={`min-h-19 w-full min-w-0 resize-y rounded-control border px-2 py-1.5 text-body focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent ${locked ? 'border-line bg-canvas text-ink-2' : 'border-accent bg-surface text-ink'}`}
      onBlur={(event) => {
        if (!locked) onDone(event.target.value)
      }}
    />
  )
}

/** 증상 · 차트 원문 표: 이름표 | 원문. 시술 줄의 이름표는 굵다. 종류가 없는 줄은 글만(AC-3105.5) */
function ChartLines({ lines }: { lines: readonly ChartLine[] }) {
  return (
    <section aria-label="증상 · 차트 원문" className="flex min-w-0 flex-col gap-1.5 lg:min-h-0">
      <h4 className={secTitle}>
        증상 · 차트 원문 <span className={secCount}>{lines.length}줄</span>
      </h4>
      {lines.length > 0 && (
        <div className={tableBox}>
          <table className={table}>
            <colgroup>
              <col className="w-11" />
              <col />
            </colgroup>
            <tbody>
              {lines.map((line, index) => (
                <tr key={index}>
                  <td className={kindCell(line.kind === 'proc')}>{line.kind ? LINE_LABEL[line.kind] : ''}</td>
                  <td className={`${td} whitespace-pre-wrap break-words text-ink`}>{line.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** 처방내역 표: 종류 · 코드 · 처방명(짧은 이름) · 총투여량 ×n(못 읽으면 ×?) · 급여/비급여. 차례는 Worker가 정했다(시술 → 약제 → 기타) */
function RxRows({ rows }: { rows: readonly RxRow[] }) {
  const procs = rows.filter((row) => row.kind === 'proc').length
  return (
    <section aria-label="처방내역" className="flex min-w-0 flex-col gap-1.5 lg:min-h-0">
      <h4 className={secTitle}>
        처방내역{' '}
        <span className={secCount}>
          {rows.length}줄 · 시술 {procs}
        </span>
      </h4>
      {rows.length === 0 ? (
        <p className={note}>처방내역이 없어요.</p>
      ) : (
        <div className={tableBox}>
          {/* 좁은 lg(1024px 근처)는 처방 칸이 고정 칸 합(약 228px)보다 좁다: 표를 20rem 아래로 줄이지 않고 칸 안에서 옆으로 스크롤한다 */}
          <table className={`${table} lg:min-w-80`}>
            <colgroup>
              <col className="w-11" />
              <col className="w-16" />
              <col />
              <col className="w-16" />
              <col className="w-14" />
            </colgroup>
            <thead>
              <tr>
                <th className={th}>종류</th>
                <th className={th}>코드</th>
                <th className={th}>처방명</th>
                <th className={`${th} text-right`}>총투여량</th>
                <th className={`${th} text-center`}>급여</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                // 짧은 이름이 처방명과 같으면(앞뒤 빈칸 빼고) 한 번만 쓴다(AC-4805.1)
                const short = row.short.trim() !== '' && row.short.trim() !== row.name.trim() ? row.short : ''
                return (
                  <tr key={index}>
                    <td className={kindCell(row.kind === 'proc')}>{RX_LABEL[row.kind]}</td>
                    <td className={`${td} break-all font-semibold text-ink`}>{row.code}</td>
                    <td className={`${td} break-words text-ink lg:overflow-hidden`}>
                      {/* lg 이상은 처방명 한 줄, 길면 끝을 …로 자르고 title에 전체 이름. 짧은 이름은 잘리지 않는다(AC-4803.6) */}
                      <span className="lg:flex lg:min-w-0 lg:items-baseline lg:gap-1">
                        <span title={row.name} className="lg:min-w-0 lg:truncate">
                          {row.name}
                        </span>
                        {short && (
                          <>
                            {' '}
                            <span className="text-caption text-muted lg:shrink-0 lg:whitespace-nowrap">{short}</span>
                          </>
                        )}
                      </span>
                    </td>
                    <td className={`${td} whitespace-nowrap text-right tabular-nums ${row.qty === null ? 'text-warning' : 'text-ink-2'}`}>×{row.qty === null ? '?' : row.qty}</td>
                    <td className={`${td} whitespace-nowrap text-center text-ink-2`}>{row.benefit ? '급여' : '비급여'}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export function MemoDetail(props: {
  row: TargetRow
  group: ListGroup['id']
  groupName: string
  /** 보이는 목록에서 그 묶음 안의 자리. index는 1부터 */
  position: { index: number; total: number }
  tableRow: MemoTableRow | undefined
  canPrev: boolean
  canNext: boolean
  onPrev(): void
  onNext(): void
  status: CopyStatus
  copying: boolean
  failed: boolean
  /** 초록 단추를 막는다: 고치는 중·입력 중·저장 막힘·확인 표시·빈 메모·복사 중(화면이 정한다) */
  copyDisabled: boolean
  /** [완료 풀기]를 막는다: 입력 중·저장 막힘(화면이 정한다) */
  undoDisabled: boolean
  editing: boolean
  locked: boolean
  reading: boolean
  startBlocked: boolean
  showUnsaved: boolean
  heldCount: number
  /** 오른쪽 비트 메모 칸(BitMemoCard). 화면이 그려 넘긴다 */
  card: ReactNode
  onCopy(): void
  onUndone(): void
  onEdit(): void
  onEditDone(text: string): void
  onApprove(approved: boolean): void
  onHeldRetry(): void
}) {
  const { row, group, groupName, position, tableRow, canPrev, canNext, onPrev, onNext, status, copying, failed, copyDisabled, undoDisabled } = props
  const { editing, locked, reading, startBlocked, showUnsaved, heldCount, card, onCopy, onUndone, onEdit, onEditDone, onApprove, onHeldRetry } = props
  // 우리 메모가 있는 사람이면 고칠 수 있다. 글을 다 지워 '메모 없음'으로 간 사람도 다시 쓸 수 있다(AC-3105.2). 복사는 화면이 빈 글이면 막는다(canCopy)
  const editable = row.hasMemo
  const label = copying ? '복사 중…' : row.done ? '다시 복사' : '복사(완료)'
  const journal = !row.done && tableRow?.lastJournal !== undefined ? JOURNAL_TEXT[tableRow.lastJournal] : undefined
  const hasText = row.text.trim() !== ''

  // lg(1024px) 이상은 머리 한 줄 + 아래 세 칸(① 단추 상자·메모 ② 증상 ③ 처방, claim-memo-fit AC-4803.1~AC-4803.6).
  // DOM 차례는 그대로 두고 lg: class(contents·order·grid)로만 모양을 바꾼다. lg 미만은 지금 모양 그대로다
  return (
    <div className="flex min-w-0 flex-col gap-3 lg:min-h-0 lg:flex-1 lg:gap-2.5">
      <div className="flex items-start justify-between gap-3 lg:flex-wrap lg:items-center lg:justify-start lg:gap-x-2.5 lg:gap-y-1">
        <div className="flex min-w-0 flex-col gap-0.5 lg:contents">
          <p className="text-caption font-semibold text-accent-strong lg:order-2 lg:ml-auto">
            {groupName} {position.index} / {position.total}
          </p>
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <h3 className="text-title font-semibold text-ink">{row.name}</h3>
            <RowTags row={row} group={group} failed={failed} />
          </div>
          <p className="text-body text-ink-2">
            <span className="text-muted">진료일</span> {dayLabel(row.date)} <span className="text-line-strong">|</span> <span className="text-muted">차트</span> {row.chart}
          </p>
          {(group !== 'batch' || row.warned) && (
            <div className="flex flex-col gap-0.5 text-small text-ink-2 lg:flex-row lg:flex-wrap lg:gap-x-2">
              {group !== 'batch' && <p>{LEFT_GROUPS[group].why}</p>}
              {group === 'manual' && <p className="text-muted">{row.foundByPc ? '지난 입력 때 PC가 찾아냈어요.' : `같은 날 진료 ${row.sameDay}건`}</p>}
              {row.warned && <p className="text-muted">점검 경고 있음 · 입력은 돼요</p>}
            </div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1 lg:order-3 lg:flex-row lg:items-center">
          <div className="flex gap-1.5">
            <button type="button" className={ds.button.secondarySmall} disabled={!canPrev} onClick={onPrev}>
              ↑ 앞 사람
            </button>
            <button type="button" className={ds.button.secondarySmall} disabled={!canNext} onClick={onNext}>
              ↓ 다음 사람
            </button>
          </div>
          <span className="text-caption text-muted">
            키보드 <kbd className={kbdPlain}>↑</kbd> <kbd className={kbdPlain}>↓</kbd>
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-3 lg:grid lg:min-h-0 lg:flex-1 lg:grid-cols-[clamp(13.75rem,30%,18.75rem)_minmax(0,1fr)_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* ① 칸: 단추 상자 + 메모. lg 이상은 이 칸만 따로 스크롤된다 */}
        <div className="flex flex-col gap-3 lg:min-h-0 lg:overflow-y-auto lg:gap-2.5">
          <div className="flex flex-wrap items-center gap-2 rounded-control border border-line bg-canvas px-3 py-2 lg:gap-1.5">
            <button type="button" aria-label={copying ? label : `C ${label}`} className={`${copyButton} lg:basis-full`} disabled={copyDisabled} onClick={onCopy}>
              <kbd className={kbdOnGreen}>C</kbd>
              {label}
            </button>
            {/* 비트 메모와 같아서 완료인 사람은 풀어도 다시 완료라 [완료 풀기]가 없다(AC-3104.3) */}
            {row.done && row.compare !== '같음' && (
              <button type="button" className={sideButton} disabled={undoDisabled} onClick={onUndone}>
                완료 풀기
              </button>
            )}
            <span className="flex-1 lg:hidden" />
            {editable && !editing && (
              <button type="button" className={sideButton} disabled={locked} onClick={onEdit}>
                메모 고치기
              </button>
            )}
            {group === 'batch' && row.chip === '메모 바꿈' && (
              <button type="button" className={sideButton} disabled={locked} onClick={() => onApprove(false)}>
                바꾸지 않기
              </button>
            )}
            {group === 'diff' && (
              <button type="button" className={sideButton} disabled={locked || reading} onClick={() => onApprove(true)}>
                이 메모로 바꾸기
              </button>
            )}
            {group === 'held' && (
              <button type="button" className={sideButton} disabled={locked || startBlocked} onClick={onHeldRetry}>
                다시 하기 ({heldCount}명)
              </button>
            )}
            <StatusLine status={status} />
          </div>

          {/* 같은 크기 두 칸: 한 줄에 우리 메모 | 비트 메모 카드, 그 아래 줄에 우리 메모 칸의 알림 글(AC-3105.3).
              lg 이상은 세로로 우리 메모 → 알림 글 → 비트 메모 카드(order)이고 두 칸이 남은 높이를 반씩 쓴다(AC-4803.3) */}
          <div className="grid grid-cols-2 gap-x-3 gap-y-1 lg:flex lg:min-h-0 lg:flex-1 lg:flex-col lg:gap-2.5">
            <div role="group" aria-label="우리 메모" className="flex min-h-28 min-w-0 flex-col gap-1 rounded-control border border-line bg-canvas px-3 py-2 lg:-order-2 lg:min-h-24 lg:flex-1 lg:overflow-y-auto">
              <b className="text-small font-semibold text-ink">우리 메모</b>
              {editing ? (
                <Editor row={row} locked={locked} onDone={onEditDone} />
              ) : hasText ? (
                <p className="whitespace-pre-wrap break-words text-body text-ink">{row.text}</p>
              ) : (
                <p className="text-small text-muted">우리 메모가 없어요.</p>
              )}
            </div>
            {card}
            {tableRow !== undefined && (tableRow.missing.length > 0 || (tableRow.unsaved && showUnsaved) || journal) && (
              <div className="col-start-1 flex flex-col gap-0.5 lg:-order-1">
                {tableRow.missing.length > 0 && <p className={note}>빠진 문장: {tableRow.missing.join(' · ')}</p>}
                {tableRow.unsaved && showUnsaved && <p className="text-caption font-medium text-negative">저장 안 됨</p>}
                {journal && <p className={note}>지난 입력: {journal}</p>}
              </div>
            )}
          </div>
        </div>

        {/* lg 미만은 2 : 3 두 칸, lg 이상은 상자가 없어져(lg:contents) 증상 ②·처방 ③이 바깥 격자의 칸이 된다 */}
        <div className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 lg:contents">
          <ChartLines lines={row.chartLines} />
          <RxRows rows={row.rxRows} />
        </div>
      </div>
    </div>
  )
}
