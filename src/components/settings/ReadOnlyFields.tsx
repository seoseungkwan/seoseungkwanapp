'use client'

import type { ReactNode } from 'react'
import { useReadOnly } from '@/components/shell/viewing'

// 보는 중(admin-view AC-8011.3, 관리자가 다른 의원을 읽기만) 설정 칸의 입력·고르기를 모두 막는 틀(서식 components/forms/ReadOnlyFields와 같은 모양).
// 읽기만이면 children을 <fieldset disabled>로 감싸 안의 글 칸·날짜·고르기·체크·묶음 단추·색 단추가 한꺼번에 막힌다(값은 칸 안 글자로 보인다 —
// 칸을 글자로 바꾸면 시안에 없는 새 글 모양이 생긴다). fieldset의 기본 테두리·여백·최소 폭은 지워 칸 모양이 그대로다.
// 읽기만이 아니면 children 그대로(감싸는 요소 없음 — 지금 화면·시험 그대로). 쓰기 단추는 각 칸이 WriteOnly로 따로 숨긴다

export function ReadOnlyFields({ children }: { children: ReactNode }) {
  if (!useReadOnly()) return children
  return (
    <fieldset disabled className="m-0 min-w-0 border-0 p-0">
      {children}
    </fieldset>
  )
}
