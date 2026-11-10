import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { noticeTitle } from '@/lib/forms/notice'
import type { SavedNotice } from '@/types/forms'
import { listDate, type ListState } from './formsState'

// 서식 화면 왼쪽: 저장한 안내문 목록 (spec forms AC-3507.2·AC-3507.3·AC-3507.5, 시안 screen.html '저장한 안내문').
// 저장·지우는 동안(busy)은 다른 안내문으로 옮기지 못한다(늦게 온 저장 답이 다른 안내문에 붙지 않게)

const ITEM = `flex w-full cursor-pointer flex-col items-start rounded-control border px-3 py-2 text-left transition ${ds.focusRing} disabled:cursor-not-allowed disabled:opacity-40`
const ITEM_ON = 'border-accent bg-accent-soft'
const ITEM_OFF = 'border-transparent not-disabled:hover:bg-canvas'

type Props = {
  list: ListState
  openId: string | null
  busy: boolean
  onNew: () => void
  onOpen: (notice: SavedNotice) => void
  onRetry: () => void
}

export function NoticeList({ list, openId, busy, onNew, onOpen, onRetry }: Props) {
  return (
    <section aria-label="저장한 안내문" className={`${ds.panel} p-4`}>
      <h2 className="text-body font-semibold text-ink">저장한 안내문</h2>
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
      {list.kind === 'ok' && list.items.length === 0 && <p className="mt-3 text-small text-muted">아직 저장한 안내문이 없어요</p>}
      {list.kind === 'ok' && list.items.length > 0 && (
        <ul className="mt-3 flex list-none flex-col gap-1">
          {list.items.map((notice) => {
            const on = notice.id === openId
            return (
              <li key={notice.id}>
                <button
                  type="button"
                  className={`${ITEM} ${on ? ITEM_ON : ITEM_OFF}`}
                  aria-current={on ? 'true' : undefined}
                  disabled={busy}
                  onClick={() => onOpen(notice)}
                >
                  <span className="text-small font-semibold text-ink">{noticeTitle(notice)}</span>{' '}
                  <span className="text-caption text-muted">{`${listDate(notice.updatedAt)} 고침`}</span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
