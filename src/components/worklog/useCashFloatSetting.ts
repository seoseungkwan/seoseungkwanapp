'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCashFloatSetting } from '@/lib/storage/worklogSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'

// 업무일지 화면의 병원 시재 금액 (specs/worklog-cash-float design.md '화면 잇기', AC-1609.2).
// 안 센 날 첫 장수를 적을 때 그날 시재로 붙일 금액이다. 화면을 열 때 한 번 읽고, 실패하면 [시재 금액 다시 불러오기](reload)로만 다시 읽는다.
// 효과에서만 읽는다(서버 그리기에서 부르지 않는다). enabled가 거짓(터치 기기·보기만)이면 읽지 않는다: 휴대폰은 그날 시재만 쓴다(AC-1607.1).
// 요청 번호로 늦게 온 옛 답(StrictMode 두 번 실행·내려감·다시 읽기)을 버린다

type Read = { status: 'loading' | 'error'; won: null } | { status: 'ready'; won: number }
export type CashFloatSetting = Read & { reload(): void }

// async로 감싼다: 클라이언트를 만들다 바로 던져도 읽기 실패로 다루려고
async function loadSetting(): Promise<number> {
  return loadCashFloatSetting(supabaseBrowser())
}

export function useCashFloatSetting(enabled: boolean): CashFloatSetting {
  const [read, setRead] = useState<Read>({ status: 'loading', won: null })
  const request = useRef(0)

  // 읽기 하나를 보내고 답이 이 요청의 것일 때만 둔다
  const fetchSetting = useCallback(() => {
    const mine = ++request.current
    loadSetting().then(
      (won) => {
        if (mine === request.current) setRead({ status: 'ready', won })
      },
      () => {
        if (mine === request.current) setRead({ status: 'error', won: null })
      },
    )
  }, [])

  useEffect(() => {
    if (!enabled) return
    fetchSetting()
    return () => {
      request.current += 1
    }
  }, [enabled, fetchSetting])

  // 불러오는 중으로 되돌린 뒤 다시 읽는다(안 센 날 장수 칸은 다 읽을 때까지 잠겨 있다)
  const reload = useCallback(() => {
    if (!enabled) return
    setRead({ status: 'loading', won: null })
    fetchSetting()
  }, [enabled, fetchSetting])

  return { ...read, reload }
}
