// 저장 숫자를 읽는 동안의 뼈대 (dashboard-ux REQ-2701 AC-2701.1, design.md §2, 시안 docs/mockups/dashboard-ux/index.html skeleton()).
// 연결 전 화면을 그리지 않는다(읽는 중일 뿐 연결 전이 아니다). 실제 배치와 같은 차례: 머리 줄 · 숫자 칸 6(first90 AC-4404.1, 물리치료 desk-feedback AC-6302.4) · AI 요약 자리 · 그래프 자리.
// 꾸밈은 모두 aria-hidden이고 글자가 없어 숫자를 지어내지 않는다. 화면 읽기는 role=status 글 하나만 읽는다.
// 움직임은 없다(새 CSS 애니메이션을 만들지 않는다). 색·모서리는 토큰(bg-line·bg-canvas·rounded-control·rounded-float)만 쓴다. 훅이 없어 서버 그림과 같다

/** 뼈대 한 토막 */
const BAR = 'block rounded-control bg-line'
const NUMBER_CELLS = [0, 1, 2, 3, 4, 5] as const
const AI_CARDS = [0, 1, 2] as const

export function DashboardSkeleton() {
  return (
    // 본문 여백은 DashboardHome과 같다(그려지면 자리가 밀리지 않게)
    <div className="pt-2 pb-4 max-md:pt-1 max-md:pb-0">
      <p role="status" className="sr-only">
        대시보드 숫자를 불러오고 있어요
      </p>
      <div aria-hidden="true">
        {/* 머리 줄: 제목 · 상태와 시각 */}
        <div data-part="header" className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line-strong pb-4">
          <span className={`${BAR} h-7 w-30`} />
          <span className={`${BAR} h-4 w-55 max-w-full`} />
        </div>
        {/* 일별 현황: 이름 · 숫자 칸 여섯 · 보고 문장 */}
        <span className={`${BAR} mt-8 h-5 w-35`} />
        <div data-part="numbers" className="mt-3 grid grid-cols-2 border-y border-line md:grid-cols-6">
          {NUMBER_CELLS.map((cell) => (
            <div key={cell} className="flex flex-col gap-3 py-4 pr-4">
              <span className={`${BAR} h-3.5 w-3/5`} />
              <span className={`${BAR} h-7.5 w-2/5`} />
            </div>
          ))}
        </div>
        <span className={`${BAR} mt-3 h-11`} />
        {/* AI 경영 리포트 요약 자리 */}
        <div data-part="ai" className="mt-8 rounded-float bg-canvas p-6 max-md:p-4">
          <span className={`${BAR} h-6 w-65 max-w-full`} />
          <span className={`${BAR} mt-4 h-5 w-2/3`} />
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            {AI_CARDS.map((card) => (
              <span key={card} className={`${BAR} h-20`} />
            ))}
          </div>
        </div>
        {/* 추이: 이름 · 그래프 둘 */}
        <div data-part="charts" className="mt-8">
          <span className={`${BAR} h-6 w-20`} />
          <div className="mt-3 grid gap-6 lg:grid-cols-12">
            <span className={`${BAR} h-60 lg:col-span-8`} />
            <span className={`${BAR} h-60 lg:col-span-4`} />
          </div>
        </div>
      </div>
    </div>
  )
}
