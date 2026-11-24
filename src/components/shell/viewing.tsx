'use client'

import { createContext, useContext, type ReactNode } from 'react'

// 읽기만 바탕 (admin-view REQ-8007 AC-8007.1·AC-8007.2, design.md '읽기만 바탕').
// 앱 틀이 관리자가 다른 의원을 보는 중이면 본문을 ViewingProvider로 감싼다(관리자 화면은 viewing={null}로 다시 감싸 읽기만이 아니다).
// 의원 비교는 보기와 상관없이 ReadOnlyArea로 읽기만 구역을 만든다. 화면은 useReadOnly()·<WriteOnly>로 쓰기 단추를 숨긴다.
// 화면 숨김일 뿐이다 — 쓰기는 DB·브라우저 거르기가 막는다(ADR-046). React 문맥뿐이라 환자 줄 구역(components/*/rows)에서도 import한다

/** 보는 의원 */
export type Viewing = { hospitalId: string; name: string }

const ViewingContext = createContext<Viewing | null>(null)
const ReadOnlyAreaContext = createContext(false)

export function ViewingProvider({ viewing, children }: { viewing: Viewing | null; children: ReactNode }) {
  return <ViewingContext.Provider value={viewing}>{children}</ViewingContext.Provider>
}

/** 보기와 상관없이 읽기만 구역(의원 비교) */
export function ReadOnlyArea({ children }: { children: ReactNode }) {
  return <ReadOnlyAreaContext.Provider value>{children}</ReadOnlyAreaContext.Provider>
}

/** 보는 의원. Provider 밖이거나 viewing={null}이면 null */
export function useViewing(): Viewing | null {
  return useContext(ViewingContext)
}

/** 읽기만인가: 보는 중이거나 ReadOnlyArea 안이면 참 */
export function useReadOnly(): boolean {
  const viewing = useContext(ViewingContext)
  const area = useContext(ReadOnlyAreaContext)
  return viewing !== null || area
}

/** 쓰기 단추 자리: 읽기만이면 아무것도, 아니면 children 그대로(감싸는 요소 없음) */
export function WriteOnly({ children }: { children: ReactNode }) {
  return useReadOnly() ? null : children
}
