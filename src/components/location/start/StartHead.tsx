import { ds } from '@/components/ui/classes'

// 처음·열쇠 없음 화면 머리(시안 .ltop .tl): 제목 `입지 분석` + `관리자만 보여요`.
// 시안처럼 이 두 화면은 안쪽 탭·[후보 더하기] 없이 머리와 본문만 그린다

export function StartHead() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-2">
        <h1 className="text-title font-semibold text-ink">입지 분석</h1>
        <span className={ds.chip.neutral}>관리자만 보여요</span>
      </div>
    </div>
  )
}
