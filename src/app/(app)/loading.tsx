// 앱 화면을 여는 동안 본문 (ui-90 AC-405.1). 시안에는 없다 → 화면 읽기 글자 하나만 둔다.
// 보이는 기다림은 탭 줄의 누른 탭·불러오기 줄이 맡는다(UI_GUIDE '누른 탭 먼저 + 불러오기 줄')
export default function Loading() {
  return (
    <div role="status">
      <span className="sr-only">화면을 여는 중이에요</span>
    </div>
  )
}
