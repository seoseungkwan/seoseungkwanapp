import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { listDate } from './formsState'

// 서식 화면 왼쪽: 저장한 안내문 목록 (spec forms AC-3507.2·AC-3507.3·AC-3507.5, 시안 screen.html '저장한 안내문').
// 휴진 안내와 환자 안내문이 같이 쓴다(spec forms-guide design.md 9절, AC-4507.2): 구역 이름·빈 목록 글·항목 제목은 부르는 쪽이 준다.
// 저장·지우는 동안(busy)은 다른 안내문으로 옮기지 못한다(늦게 온 저장 답이 다른 안내문에 붙지 않게)

const ITEM = `flex w-full cursor-pointer flex-col items-start rounded-control border px-3 py-2 text-left transition ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`
const ITEM_ON = 'border-accent bg-accent-soft'
const ITEM_OFF = 'border-transparent not-disabled:hover:bg-canvas'

// 목록 한 줄: 제목(휴진 안내는 noticeTitle, 환자 안내문은 guideTitle)과 고친 시각
export type ListItem = { id: string; title: string; updatedAt: string }
export type SavedList = { kind: 'loading' } | { kind: 'ok'; items: readonly ListItem[] } | { kind: 'failed' }

type Props = {
  label: string // 구역 이름·제목('저장한 안내문' · '저장한 환자 안내문')
  emptyText: string
  list: SavedList
  openId: string | null
  busy: boolean
  onNew: () => void
  onOpen: (id: string) => void
  onRetry: () => void
}

export function NoticeList({ label, emptyText, list, openId, busy, onNew, onOpen, onRetry }: Props) {
  return (
    <section aria-label={label} className={`${ds.panel} p-4`}>
      <h2 className="text-body font-semibold text-ink">{label}</h2>
      <button type="button" className={`${ds.button.secondarySmall} mt-3 w-full`} disabled={busy} onClick={onNew}>
        + 새로 만들기
      </button>
      {list.kind === 'loading' && <p className="mt-3 text-small text-muted">읽는 중…</p>}
      {list.kind === 'failed' && (
        <div className="mt-3 flex flex-col items-start gap-2">
          <ErrorCard code="E-FORMS-READ-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={onRetry}>
            다시 읽기
          </button>
        </div>
      )}
      {list.kind === 'ok' && list.items.length === 0 && <p className="mt-3 text-small text-muted">{emptyText}</p>}
      {list.kind === 'ok' && list.items.length > 0 && (
        <ul className="mt-3 flex list-none flex-col gap-1">
          {list.items.map((item) => {
            const on = item.id === openId
            return (
              <li key={item.id}>
                <button
                  type="button"
                  className={`${ITEM} ${on ? ITEM_ON : ITEM_OFF}`}
                  aria-current={on ? 'true' : undefined}
                  disabled={busy}
                  onClick={() => onOpen(item.id)}
                >
                  <span className="text-small font-semibold text-ink">{item.title}</span>{' '}
                  <span className="text-caption text-muted">{`${listDate(item.updatedAt)} 고침`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
