'use client'

import { usePathname } from 'next/navigation'

// 없는 주소 화면의 "열려던 주소" 자리 (ui-90 AC-410.3, UI_GUIDE '오류 카드·확인 창' 없는 주소 화면, 시안 entry/screens.mjs `.addr .num`).
// usePathname()의 경로만 보인다(쿼리·해시 없음). 글자로만 넣는다 → 꺾쇠가 있어도 태그가 되지 않는다.
// 모양: body ink · canvas 바탕 · 4px 모서리 · 위아래 2 좌우 6 · 고정폭 숫자. 긴 경로는 아무 글자에서나 줄을 바꾼다(break-all)
export function RequestedPath() {
  const path = usePathname()
  return <span className="min-w-0 break-all rounded-control bg-canvas px-1.5 py-0.5 text-body text-ink tabular-nums">{path}</span>
}
