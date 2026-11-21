import type { ReactNode } from 'react'
import { PlusIcon } from './icons'
import { look } from './look'

// 머리 줄(spec contacts AC-6505.1·AC-6505.8, 시안 toolbarHtml): h1 '주소록' · 옆 '업체 {n}곳'(0곳이면 없음) · 오른쪽 단추 자리.
// 단추([엑셀 올리기]·[양식 받기]는 TASK-5 import/, [+ 업체 더하기]는 아래 AddCompanyButton)는 화면이 actions로 넣는다. 빈 주소록은 actions 없이 그린다

export function ContactsHeader({ count, actions }: { count: number; actions?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-baseline gap-2">
        <h1 className="text-title font-semibold text-ink">주소록</h1>
        {count > 0 && <span className="text-small whitespace-nowrap text-muted">{`업체 ${count}곳`}</span>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  )
}

/** [+ 업체 더하기](도구 줄·빈 주소록): 주 단추 */
export function AddCompanyButton({ onClick }: { onClick(): void }) {
  return (
    <button type="button" onClick={onClick} className={look.primary}>
      <PlusIcon />
      업체 더하기
    </button>
  )
}
