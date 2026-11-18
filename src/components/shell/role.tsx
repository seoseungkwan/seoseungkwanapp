'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 앱 안 화면이 "데스크 계정인가"를 읽는 자리 (desk-feedback REQ-6306, design.md '④ 데스크 화면').
// AppShell이 desk일 때만 본문을 RoleProvider desk로 감싼다. 감싸지 않으면 거짓 → 원장 화면과 지금 시험은 그대로다.
// 화면 숨김일 뿐이다 — 자료는 서버 RLS가 막는다(ADR-031)
const DeskContext = createContext(false)

export function RoleProvider({ desk, children }: { desk: boolean; children: ReactNode }) {
  return <DeskContext.Provider value={desk}>{children}</DeskContext.Provider>
}

/** 데스크 계정이면 참. RoleProvider 밖에서는 거짓 */
export const useDesk = (): boolean => useContext(DeskContext)
