'use client'

import type { ReactNode } from 'react'
import { useReadOnly } from '@/components/shell/viewing'

// 직원 탭 창·칸의 읽기만 (admin-view AC-8009.3, design.md '읽기만 바탕' — 입력 칸은 disabled).
// 관리자가 다른 의원을 보는 중이면 안의 칸·단추를 모두 막는 fieldset으로 감싼다(display: contents라 모양이 그대로다 — 값은 그대로 보인다).
// 읽기만이 아니면 children 그대로(감싸는 요소 없음). 닫기·돌아가기 단추는 이 밖에 둔다

export function ReadOnlyFields({ children }: { children: ReactNode }) {
  if (!useReadOnly()) return children
  return (
    <fieldset disabled className="contents">
      {children}
    </fieldset>
  )
}
