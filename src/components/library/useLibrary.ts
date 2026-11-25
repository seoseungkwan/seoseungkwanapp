'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { LibraryFile } from '@/lib/library/files'
import { listLibraryFiles } from '@/lib/storage/library'

// 자료실 목록 잇기(spec library design.md '화면' useLibrary, AC-8105.6·AC-8106.6·AC-8107.3).
// 화면을 열 때 listLibraryFiles 한 번(표 library_files, RLS 승인된 의원의 원장·데스크·관리자) → 읽는 중 / 읽음 / 못 읽음.
// reload(): 읽은 표가 있으면 그 표를 그대로 둔 채 다시 읽고(올리기·지우기 뒤), 못 읽은 상태면 읽는 중으로 돌아가 다시 읽는다([다시 읽기]).
// 다시 읽기가 실패하면 못 읽음이다. 읽기마다 번호를 세어 늦게 온 앞 읽기 답·떠난 뒤 답을 버린다. 실패 내용은 번호 하나로만 둔다

export type LibraryLoad = { status: 'loading' } | { status: 'ready'; files: LibraryFile[] } | { status: 'failed'; code: 'E-LIBRARY-READ-FAILED' }

export function useLibrary(): { load: LibraryLoad; reload(): Promise<boolean> } {
  const [load, setLoad] = useState<LibraryLoad>({ status: 'loading' })
  // 읽기마다 늘린다. 지금 번호가 아닌 답은 버린다(새로 읽기 시작함·화면을 떠남)
  const flow = useRef(0)

  /** 읽는다. 읽은 표를 쥐면 참, 못 읽었거나 더 새 읽기에 밀렸으면 거짓 */
  const read = useCallback(async (): Promise<boolean> => {
    const mine = ++flow.current
    try {
      const files = await listLibraryFiles()
      if (mine !== flow.current) return false
      setLoad({ status: 'ready', files })
      return true
    } catch {
      if (mine === flow.current) setLoad({ status: 'failed', code: 'E-LIBRARY-READ-FAILED' })
      return false
    }
  }, [])

  useEffect(() => {
    void read() // 처음 모양이 이미 읽는 중이다
    return () => {
      flow.current += 1 // 떠난 뒤 온 답은 쓰지 않는다
    }
  }, [read])

  const reload = useCallback(() => {
    setLoad((prev) => (prev.status === 'ready' ? prev : { status: 'loading' }))
    return read()
  }, [read])

  return { load, reload }
}
