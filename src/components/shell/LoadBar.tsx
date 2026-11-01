// 불러오기 줄 (ui-90 AC-405.3, UI_GUIDE '누른 탭 먼저 + 불러오기 줄' · '움직임 › 불러오기 줄', 시안 docs/mockups/ui-90/app CSS .ldbar).
// 탭 줄(nav, relative) 맨 아래 2px accent 줄. 꾸밈이라 읽지 않는다(aria-hidden). 누름을 가로채지 않는다.
// 탭을 누른 뒤 경로가 아직 그대로인 동안(active) 왼쪽에서 80%까지 700ms 동안 감속하며 차오른다(scaleX).
// 0에서 차오르게 TabBar가 누를 때마다 key를 바꿔 새 줄을 그리고, 새 줄은 나타날 때 starting:scale-x-0에서 시작한다.
// 경로가 바뀌면(active false) 기본 transition 150ms에 흐려지며 끝까지 찬다(시안 .ldbar.done, delay 없음 — design.md '시안과 다른 점' 3).
// 이 파일의 duration-700·ease-out 두 클래스만 규칙 시험의 예외다(ui/classes.test.ts). 모션 줄이기 기기에서는 전역 규칙으로 움직이지 않는다
const BAR = 'pointer-events-none absolute inset-x-0 bottom-0 h-0.5 origin-left bg-accent transition'
const LOADING = `${BAR} scale-x-80 duration-700 ease-out starting:scale-x-0`
const IDLE = `${BAR} scale-x-100 opacity-0`

export function LoadBar({ active }: { active: boolean }) {
  return <span aria-hidden="true" className={active ? LOADING : IDLE} />
}
