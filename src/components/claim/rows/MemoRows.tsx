import type { ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { isBlankMemo } from '@/lib/precheck/memoCompare'
import type { InputTargets, LeftReason, TargetRow } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 입력할 사람·빠지는 사람(AC-018.26, 입력 쪽 승인 목업). 목록은 Worker의 inputTargets가 정하고 여기는 props로만 그린다.
// 사람마다 넣고 빼는 체크는 없다. [이 메모로 바꾸기]·[바꾸지 않기]는 AC-018.14, 줄 열기는 AC-018.27.
// 우리 메모 글이 있는 줄마다 [메모 고치기]가 있다(AC-2203.1): 완료한 사람을 고치면 Worker가 완료를 푼다(AC-2202.1)

/** 빠지는 사람 묶음의 이름과 까닭(AC-018.26). 쓰다 멈춘 사람 줄(StuckBand)도 같은 글을 쓴다(AC-018.16) */
export const LEFT_GROUPS: Record<LeftReason, { name: string; why: string }> = {
  done: { name: '이미 입력됨', why: '비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.' },
  nomemo: { name: '메모 없음', why: '이 진료에는 넣을 메모가 없어요.' },
  mark: { name: '확인 필요', why: '메모에 확인 표시가 남아 있어요. 고치면 들어가요. 묻지 않기가 켜져 있어도 넣지 않아요.' },
  manual: { name: '직접 입력', why: '같은 사람의 같은 날 진료가 여럿이라 어느 진료에 넣을지 알 수 없어요. 비트에서 직접 넣어 주세요.' },
  diff: { name: '다른 메모 있음', why: '비트에 우리 메모와 다른 메모가 있어요. [바꾸지 않기]를 눌렀거나 직접 확인한 사람이에요. [이 메모로 바꾸기]를 누르면 들어가요.' },
  unread: { name: '비트 메모를 읽지 못함', why: '비어 있다고 보고 넣으면 두 번 들어갈 수 있어 뺐어요. 자료를 다시 불러와 주세요.' },
  held: { name: '지난번 건너뜀', why: '지난 입력에서 건너뛴 뒤 메모가 그대로예요. 메모를 고치거나 [다시 하기]를 눌러 주세요.' },
}

const memoBox = 'flex min-w-0 flex-col gap-0.5 rounded-control border border-line bg-canvas px-2 py-1.5 text-caption text-ink-2'
const boxName = 'font-medium not-italic text-muted'
const sub = 'text-caption text-muted'
const rowLine = 'flex flex-col gap-1.5 border-t border-line py-2'

export type MemoRowsProps = {
  targets: InputTargets
  locked: boolean
  reading: boolean
  /** 입력을 시작하는 단추를 막는다(저장 막힘·비트 메모 읽는 중, AC-018.17·AC-018.24) */
  startBlocked?: boolean
  open: ReadonlySet<string>
  editing: string | null
  /** 열린 줄의 비트 메모 카드 */
  card(row: TargetRow): ReactNode
  onToggle(key: string): void
  onApprove(key: string, approved: boolean): void
  onEdit(key: string): void
  onEditDone(key: string, text: string): void
  onHeldRetry(): void
}

function Head({ row, no, open, onToggle, children }: { row: TargetRow; no?: number; open: boolean; onToggle(key: string): void; children?: ReactNode }) {
  return (
    <button type="button" aria-expanded={open} className={`flex w-full min-w-0 cursor-pointer items-start justify-between gap-2 rounded-control text-left ${ds.focusRing}`} onClick={() => onToggle(row.key)}>
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
          {no !== undefined && <span className={ds.chip.neutral}>{no}</span>}
          <span className="whitespace-nowrap text-small text-ink-2">{dayLabel(row.date)}</span>
          <span className="whitespace-nowrap text-small font-semibold text-ink">{row.name}</span>
          {children}
        </span>
        <span className={sub}>
          차트 {row.chart}
          {row.rxNames.length > 0 && ` · 처방 ${row.rxNames.join(', ')}`}
        </span>
      </span>
      <span className="shrink-0 text-caption font-medium text-accent">{open ? '접기' : '메모 보기'}</span>
    </button>
  )
}

/** 비트에 있는 메모와 우리 메모를 줄을 누르지 않아도 나란히(AC-018.14) */
function SideMemos({ row }: { row: TargetRow }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className={memoBox}>
        <i className={boxName}>비트에 있는 메모</i>
        <span className="whitespace-pre-wrap break-words">{row.inBit}</span>
      </div>
      <div className={memoBox}>
        <i className={boxName}>우리 메모</i>
        <span className="whitespace-pre-wrap break-words">{row.text}</span>
      </div>
    </div>
  )
}

/** 열린 줄: 우리 메모와 비트 메모 카드(AC-018.25·AC-018.27) */
function Opened({ row, card }: { row: TargetRow; card: MemoRowsProps['card'] }) {
  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className={memoBox}>
        <i className={boxName}>우리 메모</i>
        {row.text.trim() ? <span className="whitespace-pre-wrap break-words">{row.text}</span> : <span className="text-muted">우리 메모가 없어요.</span>}
      </div>
      {card(row)}
    </div>
  )
}

/** 고치는 칸. 입력 중(locked)에는 읽기 전용이고 칸 밖을 눌러도 알리지 않는다: 열린 채 입력이 시작되는 틈에도 입력 중에 글이 바뀌지 않는다(AC-2203.3) */
function Editor({ row, locked, onDone }: { row: TargetRow; locked: boolean; onDone(text: string): void }) {
  return (
    <div className={ds.field}>
      <label className={ds.label}>
        {row.name} 메모 고치기
        <textarea
          aria-label={`${row.name} 메모 고치기`}
          autoFocus
          defaultValue={row.text}
          rows={3}
          maxLength={32000}
          readOnly={locked}
          className={`${locked ? ds.readonly : ds.input} h-auto py-2`}
          onBlur={(event) => {
            if (!locked) onDone(event.target.value)
          }}
        />
      </label>
      <span className={ds.help}>확인 표시를 지우거나 글을 고친 뒤 칸 밖을 누르면 목록에 바로 반영돼요.</span>
    </div>
  )
}

/** 우리 메모 글이 있는 줄인가: '메모 없음'과 같은 판단(inputPlan, AC-2203.1) */
const editable = (row: TargetRow) => row.hasMemo && !isBlankMemo(row.text)

/**
 * 줄 아래 단추 줄: 있던 단추(children) 오른쪽에 [메모 고치기](AC-2203.4). 입력 중에만 막는다(AC-2203.3).
 * 고치는 줄은 [메모 고치기] 자리에 칸이 열리고 있던 단추는 그대로다(AC-2203.2)
 */
function Actions({ row, editing, locked, onEdit, onEditDone, children }: { row: TargetRow; editing: string | null; locked: boolean; onEdit(key: string): void; onEditDone(key: string, text: string): void; children?: ReactNode }) {
  const canEdit = editable(row)
  const open = canEdit && editing === row.key
  const button = canEdit && !open
  return (
    <>
      {(children || button) && (
        <div className="flex flex-wrap items-center gap-2">
          {children}
          {button && (
            <button type="button" className={ds.button.secondarySmall} disabled={locked} onClick={() => onEdit(row.key)}>
              메모 고치기
            </button>
          )}
        </div>
      )}
      {open && <Editor row={row} locked={locked} onDone={(text) => onEditDone(row.key, text)} />}
    </>
  )
}

export function MemoRows(props: MemoRowsProps) {
  const { targets, locked, reading, startBlocked = false, open, editing, card, onToggle, onApprove, onEdit, onEditDone, onHeldRetry } = props
  const { batch, left, problem } = targets
  const leftCount = left.reduce((sum, group) => sum + group.rows.length, 0)
  const empty = batch.length === 0 && leftCount === 0

  return (
    <section aria-label="입력할 사람과 빠지는 사람" className={`${ds.panel} flex min-w-0 flex-col gap-2 p-4`}>
      {empty ? (
        <>
          <h3 className={ds.panelTitle}>입력할 사람</h3>
          <p className="text-small text-muted">{problem ? '위 안내대로 고르면 여기에 입력할 사람이 날짜 순서로 보여요.' : '이 조건에 맞는 진료가 없어요.'}</p>
        </>
      ) : (
        <>
          <p className="flex flex-wrap items-baseline gap-x-2 text-small text-ink-2">
            <b className="text-title font-semibold text-ink">{batch.length}명</b> 입력해요 <span className="text-muted">· 빠지는 사람 {leftCount}명</span>
          </p>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className={ds.panelTitle}>입력할 사람</h3>
            <span className={ds.count}>날짜 순서</span>
          </div>
          {batch.length === 0 ? (
            <p className="text-small text-muted">지금 입력할 사람이 없어요.</p>
          ) : (
            <ol className="flex list-none flex-col">
              {batch.map((row, index) => {
                const isOpen = open.has(row.key)
                const changing = row.compare === '다름'
                return (
                  <li key={row.key} className={rowLine}>
                    <Head row={row} no={index + 1} open={isOpen} onToggle={onToggle}>
                      <span className={changing ? ds.chip.warning : ds.chip.neutral}>{row.chip}</span>
                      {row.warned && <span className={ds.chip.neutral}>점검 경고 있음 · 입력은 돼요</span>}
                    </Head>
                    {isOpen ? <Opened row={row} card={card} /> : changing && <SideMemos row={row} />}
                    <Actions row={row} editing={editing} locked={locked} onEdit={onEdit} onEditDone={onEditDone}>
                      {row.chip === '메모 바꿈' && (
                        <button type="button" className={ds.button.secondarySmall} disabled={locked} onClick={() => onApprove(row.key, false)}>
                          바꾸지 않기
                        </button>
                      )}
                    </Actions>
                  </li>
                )
              })}
            </ol>
          )}
          {leftCount > 0 && (
            <div className="flex items-baseline justify-between gap-2 pt-2">
              <h3 className={ds.panelTitle}>빠지는 사람</h3>
              <span className={ds.count}>{leftCount}명</span>
            </div>
          )}
          {left.map(({ reason, rows }) => {
            const { name, why } = LEFT_GROUPS[reason]
            return (
              <div key={reason} role="group" aria-label={name} className="flex flex-col gap-0.5 pt-2">
                <div className="flex flex-wrap items-center gap-2 text-small font-semibold text-ink">
                  {name} <span className={ds.chip.neutral}>{rows.length}명</span>
                </div>
                <p className={sub}>{why}</p>
                {reason === 'held' && (
                  <div className="pt-1">
                    <button type="button" className={ds.button.secondarySmall} disabled={locked || startBlocked} onClick={onHeldRetry}>
                      다시 하기 ({rows.length}명)
                    </button>
                  </div>
                )}
                <ul className="flex list-none flex-col">
                  {rows.map((row) => {
                    const isOpen = open.has(row.key)
                    return (
                      <li key={row.key} className={rowLine}>
                        <Head row={row} open={isOpen} onToggle={onToggle} />
                        {isOpen ? (
                          <Opened row={row} card={card} />
                        ) : reason === 'diff' ? (
                          <SideMemos row={row} />
                        ) : reason === 'mark' ? (
                          <div className={memoBox}>
                            <i className={boxName}>우리 메모</i>
                            <span className="whitespace-pre-wrap break-words">{row.text}</span>
                          </div>
                        ) : null}
                        {reason === 'manual' && <p className={sub}>{row.foundByPc ? '지난 입력 때 PC가 찾아냈어요.' : `같은 날 진료 ${row.sameDay}건`}</p>}
                        <Actions row={row} editing={editing} locked={locked} onEdit={onEdit} onEditDone={onEditDone}>
                          {reason === 'diff' && (
                            <button type="button" className={ds.button.secondarySmall} disabled={locked || reading} onClick={() => onApprove(row.key, true)}>
                              이 메모로 바꾸기
                            </button>
                          )}
                        </Actions>
                      </li>
                    )
                  })}
                </ul>
              </div>
            )
          })}
        </>
      )}
    </section>
  )
}
