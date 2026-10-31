import { Icon } from '@/components/common/Icon'

// 연결 순서 5단계 (tab-frame AC-306.3, design.md '대시보드 짜임' 연결 순서, 메모 §3 '연결 순서'·§5). 연결 전 브리핑 오른쪽 칸.
// 대시보드는 연결 상태를 판정하지 않는다 → 단계 칩·지금 단계 강조 없이 번호 상자와 이름만(design.md '대시보드는 연결 상태를 판정하지 않는다').
// 이름 다섯은 components/claim/setup/steps.ts의 단계 이름과 같은 글자다. 브리핑은 claim을 불러오지 않고, 통합 시험(AC-307.7)이 setupSteps()의 title과 견준다.
// 768px 이상은 펼친 목록, 768px 미만은 같은 목록을 넣은 접는 칸(처음 접힘). 두 벌 중 하나는 늘 display: none이라 화면 읽기는 하나만 읽는다
const STEPS = ['크롬 확장 프로그램 설치', '도우미 설치', '연결', '비트 자료 읽기', '요양기관기호 확인'] as const
const STEPS_TITLE_ID = 'dashboard-connect-steps-title'

// 줄 하나: 번호 상자(20×20, 1px line-strong, caption 600 muted) · 이름(body ink-2), 사이 12, 44px 이상
function StepRows({ rowClass }: { rowClass: string }) {
  return STEPS.map((name, i) => (
    <li key={name} className={rowClass}>
      <span className="grid size-5 shrink-0 place-items-center rounded-control border border-line-strong text-caption font-semibold text-muted">
        {i + 1}
      </span>
      <span className="text-body text-ink-2">{name}</span>
    </li>
  ))
}

export function ConnectSteps() {
  return (
    <>
      {/* 768px 이상: 머리(연결 순서 · 단계 수, 아래 8 + 1px line-strong) → 목록 → 아래 줄 */}
      <div className="max-md:hidden">
        <div className="flex items-center justify-between gap-2 border-b border-line-strong pb-2">
          <h2 id={STEPS_TITLE_ID} className="text-small font-semibold text-ink">
            연결 순서
          </h2>
          <span className="text-small font-medium text-muted">{STEPS.length}단계</span>
        </div>
        <ol aria-labelledby={STEPS_TITLE_ID} className="list-none">
          <StepRows rowClass="flex min-h-11 items-center gap-3 border-b border-line" />
        </ol>
        <p className="mt-3 text-caption text-muted">설정의 비트 PC 연결 화면이 한 단계씩 안내해요.</p>
      </div>
      {/* 768px 미만: 접는 칸. 위 1px line-strong · 아래 1px line, 요약 줄 56px 이상. 꺾쇠만 150ms 돌고 내용은 바로 펼친다 */}
      <details className="group border-t border-b border-t-line-strong border-b-line md:hidden">
        <summary className="grid min-h-14 cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-2 py-1.5 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent [&::-webkit-details-marker]:hidden">
          <span className="text-body font-semibold text-ink">연결 순서 {STEPS.length}단계</span>
          <span className="col-start-1 text-caption text-muted">처음은 {STEPS[0]}</span>
          <Icon name="chev" size={16} className="col-start-2 row-span-2 row-start-1 text-muted transition group-open:rotate-180" />
        </summary>
        <ol className="list-none border-t border-line">
          <StepRows rowClass="flex min-h-11 items-center gap-3 border-b border-line last:border-b-0" />
        </ol>
        <p className="pt-1 pb-3 text-caption text-muted">연결은 비트 PC의 크롬에서 해요. 설정의 비트 PC 연결 화면이 한 단계씩 안내해요.</p>
      </details>
    </>
  )
}
