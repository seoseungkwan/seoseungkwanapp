import { ui } from '@/components/ui/classes'

// 대시보드 빈 자리 (REQ-009, design.md '대시보드 범위'). 제목 + 빈 안내 상자 하나만.
// 숫자 카드·패널·표·단추는 두지 않는다 — 대시보드 내용은 별도 명세에서 정한다. 앱 틀은 (app)/layout의 AppShell이 준다
const EMPTY_TITLE_ID = 'dashboard-empty-title'

// title = koreanDateTitle(…) ('2026년 10월 29일 (목)'). 제목은 "오늘" + 10px + 날짜(title 600, 폰 title-sm).
// h1은 flex가 아닌 글 줄이다 → 사이 빈칸이 진짜로 그려져 화면 읽기·복사도 "오늘 2026년 …"이다.
// 10px = 빈칸(25px 글자에서 약 6px) + "오늘" 오른쪽 4px
export function DashboardEmpty({ title }: { title: string }) {
  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <h1 className="text-title font-semibold text-ink max-md:text-title-sm">
        <span className="mr-1">오늘</span> <span>{title}</span>
      </h1>
      {/* 빈 안내 상자(ui.card): 상자 제목 panel 600 + 회색 안내 한 줄(UI_GUIDE '빈 상태': table muted) */}
      <section aria-labelledby={EMPTY_TITLE_ID} className={`${ui.card} flex flex-col gap-1`}>
        <h2 id={EMPTY_TITLE_ID} className={ui.panelTitle}>
          대시보드는 준비 중입니다
        </h2>
        <p className="text-table text-muted">어떤 숫자와 칸을 둘지는 따로 정한 뒤 만듭니다.</p>
      </section>
    </div>
  )
}
