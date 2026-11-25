'use client'

import { useSyncExternalStore } from 'react'
import { InstallFilesError, latestInstallFiles, type InstallFile, type InstallKind } from '@/lib/storage/installFiles'
import type { ErrorCode } from '@/types/errors'

// 설치 파일 목록(자료실의 종류마다 가장 높은 판, specs/library AC-8109.3)을 화면 하나에서 한 번만 읽는다 (helper-download design.md '화면', REQ-5103).
// 한 화면의 받기 단추들(비트 PC 연결의 단계·위 상자 단추)이 같은 읽기 결과를 나눠 쓴다.
// 보는 곳이 하나도 없어지면(화면을 떠나면) 결과를 버린다 → 다음에 여는 화면은 새로 읽어 관리자가 막 올린 판을 본다.
// 결과는 화면 메모리에만 둔다(브라우저 저장소 없음). 실패는 번호만 갖고 원래 오류 글은 버린다

export type InstallFilesState =
  | { status: 'loading' }
  | { status: 'ready'; files: Record<InstallKind, InstallFile | null> }
  | { status: 'failed'; code: ErrorCode }

const LOADING: InstallFilesState = { status: 'loading' }

let current: InstallFilesState = LOADING
let reading = false
// 읽기 차례: 화면을 떠난 뒤 늦게 온 답이 다음 화면의 결과를 덮지 않게 한다
let round = 0
const listeners = new Set<() => void>()

function publish(next: InstallFilesState) {
  current = next
  for (const listener of listeners) listener()
}

function startRead() {
  reading = true
  const mine = ++round
  latestInstallFiles().then(
    (files) => {
      if (mine === round) publish({ status: 'ready', files })
    },
    (error: unknown) => {
      if (mine === round) publish({ status: 'failed', code: error instanceof InstallFilesError ? error.code : 'E-INSTALL-READ-FAILED' })
    },
  )
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!reading) startRead()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      reading = false
      round++
      current = LOADING
    }
  }
}

const snapshot = () => current
const serverSnapshot = () => LOADING

/** 지금 화면의 설치 파일 목록 상태. 처음 부르는 곳이 읽기를 시작하고, 같은 화면의 다른 곳은 그 결과를 같이 본다 */
export function useInstallFiles(): InstallFilesState {
  return useSyncExternalStore(subscribe, snapshot, serverSnapshot)
}
