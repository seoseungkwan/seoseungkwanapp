import { useEffect, useRef } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import type { LeftReason, TargetRow } from '@/types/precheck'
import { dayLabel } from '../dateList'

// 왼쪽 환자 목록(memo-split REQ-3101, 승인 시안 4의 .listpane). 묶음·차례·보기 거르기는 화면(memoSplit)이 정하고 여기는 props로만 그린다.
// 줄에는 환자 정보만(번호·이름·진료일·차트번호·상태 표) 있다. 차트 원문·처방·메모 글은 오른쪽 상세(MemoDetail)에만 있다(AC-3101.3).
// 번호는 보이는 차례로 세지 않고 줄이 가진 거르기 전 차례(no)를 쓴다: [미완료]·[완료]로 걸러도 오른쪽 머리의 {i}와 같다
// 상태 표는 색만으로 알리지 않고 늘 글자를 같이 쓴다. 완료·복사 실패의 기호는 청구 화면 규칙대로 공용 Icon(check·x)이다(ui-90 AC-408.2)

export type Show = 'all' | 'todo' | 'done'
/** 목록 줄 하나. no는 입력할 사람 묶음의 거르기 전 차례(1부터, 상세 머리의 {i}와 같다). 다른 묶음에는 없다(AC-3101.3) */
export type ListRow = TargetRow & { no?: number }
/** 목록 묶음 하나. rows는 보기로 거른 뒤의 사람, total은 거르기 전 그 묶음의 사람 수(머리의 'n / 전체명') */
export type ListGroup = { id: 'batch' | LeftReason; name: string; rows: ListRow[]; total: number }

const SHOWS: readonly (readonly [Show, string])[] = [
  ['all', '전체'],
  ['todo', '미완료'],
  ['done', '완료'],
]

/**
 * 목록 줄과 상세 머리에 같이 쓰는 상태 표(AC-3101.3·AC-3105.1). 차례: 복사 못 함 → 완료 → (확인 필요 | 메모 바꿈 | 새 메모 가운데 하나).
 * 메모 바꿈·새 메모는 입력할 사람 묶음에만 붙는다
 */
export function RowTags({ row, group, failed }: { row: TargetRow; group: ListGroup['id']; failed: boolean }) {
  const batch = group === 'batch'
  return (
    <>
      {failed && (
        <span className={ds.chip.negative}>
          <Icon name="x" size={12} />
          복사 못 함
        </span>
      )}
      {row.done && (
        <span className={ds.chip.positive}>
          <Icon name="check" size={12} />
          완료
        </span>
      )}
      {row.unfinished ? (
        <span className={ds.chip.warning}>! 확인 필요</span>
      ) : batch && row.chip === '메모 바꿈' ? (
        <span className={ds.chip.warning}>! 메모 바꿈</span>
      ) : batch && row.chip === '새 메모' ? (
        <span className={ds.chip.neutral}>새 메모</span>
      ) : null}
    </>
  )
}

// 줄 하나: 단추 전체가 한 줄. 왼쪽 3px 선은 늘 있고(안 고른 줄은 투명) 고르면 글자가 밀리지 않는다
const rowButton =
  'flex min-h-11 w-full cursor-pointer items-center gap-2 border-b border-l-3 border-b-line py-1.5 pr-3 pl-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'
const rowOn = 'border-l-accent-strong bg-accent-soft'
const rowOff = 'border-l-transparent hover:bg-canvas'

export function MemoList(props: {
  groups: ListGroup[]
  counts: Record<Show, number>
  show: Show
  selectedKey: string | null
  failed: ReadonlySet<string>
  /** 보일 사람이 없을 때의 까닭 글(AC-3101.7). 어느 글인지는 화면이 정한다 */
  empty: string
  /** 두 칸에 맞춘 높이(useFitHeight, 예: '622px'). 맞추기 전·좁은 창이면 없다 */
  fitHeight?: string
  onShow(show: Show): void
  onPick(key: string): void
}) {
  const { counts, show, selectedKey, failed, empty, fitHeight, onShow, onPick } = props
  const groups = props.groups.filter((group) => group.rows.length > 0)
  const selected = useRef<HTMLButtonElement>(null)

  // 고른 사람이 바뀔 때와 두 칸 높이가 맞춰지거나 바뀔 때만 그 줄이 보이게 목록을 움직인다(AC-3101.4).
  // 처음 열 때(점검 결과에서 온 사람 등) 높이는 이 움직임 뒤에 맞춰져 목록이 줄어든다: 줄어든 높이로 한 번 더 움직여야 아래쪽 줄이 숨지 않는다.
  // 메모 보기를 다시 받아도(같은 사람·같은 높이) 목록 스크롤은 그대로다(AC-3101.8). nearest라 이미 보이는 줄이면 움직이지 않는다
  useEffect(() => {
    selected.current?.scrollIntoView?.({ block: 'nearest' })
  }, [selectedKey, fitHeight])

  return (
    <section aria-label="환자 목록" className="flex min-h-0 min-w-0 flex-col">
      <div className="flex shrink-0 items-center gap-2 border-b border-line px-3 py-2 text-caption text-muted">
        보기
        <div role="group" aria-label="완료로 골라 보기" className={`${ds.segment.group} max-md:grid-cols-3`}>
          {SHOWS.map(([value, label]) => (
            <button key={value} type="button" aria-pressed={show === value} className={`${ds.segment.button} lg:px-2 ${show === value ? ds.segment.on : ds.segment.off}`} onClick={() => onShow(value)}>
              {label} {counts[value]}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
        {groups.length === 0 ? (
          <p className="px-4 py-5 text-small text-muted">{empty}</p>
        ) : (
          groups.map((group) => (
            <div key={group.id} role="group" aria-label={group.name}>
              <h3 className="sticky top-0 z-10 flex items-center justify-between gap-2 border-b border-line bg-canvas py-1 pr-3 pl-4 text-caption font-semibold text-ink-2">
                {group.name}
                <span className="font-normal text-muted">{group.rows.length === group.total ? `${group.total}명` : `${group.rows.length} / ${group.total}명`}</span>
              </h3>
              <ol className="flex list-none flex-col">
                {group.rows.map((row) => {
                  const on = row.key === selectedKey
                  const small = on ? 'text-ink-2' : 'text-muted'
                  return (
                    <li key={row.key}>
                      <button type="button" ref={on ? selected : undefined} aria-current={on ? 'true' : 'false'} className={`${rowButton} ${on ? rowOn : rowOff}`} onClick={() => onPick(row.key)}>
                        <span className={`w-5 shrink-0 text-right text-caption tabular-nums ${small}`}>{group.id === 'batch' ? row.no : null}</span>
                        <span className="flex min-w-0 flex-1 flex-wrap items-baseline gap-x-2 lg:flex-none">
                          <span className={`whitespace-nowrap text-body text-ink ${on ? 'font-semibold' : 'font-medium'}`}>{row.name}</span>
                          <span className={`whitespace-nowrap text-caption ${small}`}>{dayLabel(row.date)}</span>
                          <span className={`whitespace-nowrap text-caption ${small}`}>{row.chart}</span>
                        </span>
                        <span className="flex shrink-0 flex-wrap justify-end gap-1 lg:justify-start">
                          <RowTags row={row} group={group.id} failed={failed.has(row.key)} />
                        </span>
                      </button>
                    </li>
                  )
                })}
              </ol>
            </div>
          ))
        )}
      </div>
    </section>
  )
}
