// 대시보드 섹션 나눔·머리 줄·짧은 반응 클래스 (tab-frame design.md '대시보드 짜임', 메모 §3 '본문'·§7, UI_GUIDE '움직임').
// 갈래 라(dashboard/summary)는 같은 값을 자기 파일에 따로 둔다(서로 불러오지 않는다, design.md '브리핑(다)과 분석(라)을 나누는 자리')

// 덩어리 사이: 위 48 + 위 1px line-strong + 선 아래 20 (폰 32 + 선 + 16)
export const SECTION = 'mt-12 border-t border-line-strong pt-5 max-md:mt-8 max-md:pt-4'
// 섹션 머리 줄: 제목 옆에 보조 글, 사이 12, 넘치면 줄바꿈, 아래 16
export const SECTION_HEAD = 'mb-4 flex flex-wrap items-center gap-3'
// 섹션 제목(h2): title 600 모든 폭
export const SECTION_TITLE = 'text-title font-semibold text-ink'

// 짧은 반응(ds 뒤에 붙인다): 색 150ms + 누름 아래 1px / 단추 안 오른쪽 화살표는 올림에 오른쪽 2px(단추에 group)
export const PRESS = 'transition not-disabled:active:translate-y-px'
export const ARROW_MOVE = 'transition group-hover:translate-x-0.5'
