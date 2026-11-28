'use client'

import { usePathname } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { currentMenuLabel } from './menu'
import { answerOpenTabs, askOpenTabs } from './openTabs'

// '어느 창'(claim-learn AC-9313.5, 시안 notes '어느 창'): 비트 연결을 다른 창이 쓰는 중이라는 안내(E-BRIDGE-BUSY)에 붙는 한 줄과, 앱 틀이 켜 두는 답하는 쪽.
// 묻고 받는 길은 openTabs.ts다. 메뉴 이름만 오간다

/** 안내가 열릴 때 한 번 묻고 0.3초 안 답한 다른 창의 메뉴 이름을 한 줄로 그린다. 답이 없으면 아무것도 그리지 않는다(지금 글 그대로) */
export function OtherTabsLine({ className = 'text-body text-ink' }: { className?: string }) {
  const [labels, setLabels] = useState<string[]>([])
  useEffect(() => askOpenTabs(setLabels), [])
  if (labels.length === 0) return null
  return <p className={className}>지금 열린 다른 창: {labels.map((label) => `‘${label}’`).join(' · ')}</p>
}

/** 답하는 쪽(AppShell이 어느 화면이든 그린다, 아무것도 그리지 않는다): 다른 창이 물으면 지금 화면의 메뉴 이름으로 답한다 */
export function OpenTabsAnswer(): null {
  const pathname = usePathname()
  const now = useRef(pathname)
  now.current = pathname
  useEffect(() => answerOpenTabs(() => currentMenuLabel(now.current)), [])
  return null
}
