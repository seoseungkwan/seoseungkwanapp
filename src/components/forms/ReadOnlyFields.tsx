'use client'

import type { ReactNode } from 'react'
import { useReadOnly } from '@/components/shell/viewing'

// 보는 중(admin-view AC-8011.1, 관리자가 다른 의원을 읽기만) 서식 '만들기' 칸의 입력·고르기를 모두 막는 틀.
// 읽기만이면 children을 <fieldset disabled>로 감싸 안의 글 칸·날짜·고르기·밀대·체크·색·묶음 단추가 한꺼번에 막힌다(값은 칸 안 글자로 보인다).
// fieldset의 기본 테두리·여백·최소 폭은 지워 틀 모양이 그대로다. 읽기만이 아니면 children 그대로(감싸는 요소 없음 — 지금 화면·시험 그대로).
// 쓰기·AI 단추는 각 부품이 WriteOnly로 따로 숨긴다

export function ReadOnlyFields({ children }: { children: ReactNode }) {
  if (!useReadOnly()) return children
  return (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  )
}
