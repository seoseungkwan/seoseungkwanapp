'use client'

import { useEffect, useState } from 'react'
import { listWarrantySoon } from '@/lib/storage/contacts'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { WarrantyItem } from '@/types/contacts'

// 대시보드 무상 수리 알림 읽기 (contacts REQ-6507, design.md '대시보드 알림').
// 대시보드를 열 때 한 번, 무상 수리가 오늘~오늘+30에 끝나는 장비와 그 업체 이름을 10초 한도로 읽는다(저장 함수 listWarrantySoon).
// 날짜가 바뀌거나 다시 그려져도 다시 읽지 않는다(다음에 대시보드를 열 때 새로 읽음). 끝난 장비를 빼는 일은 그리는 쪽(WarrantyNotice)이 받은 오늘로 한다.
// 알림은 대시보드의 본 일(숫자)을 가리지 않게 조용히 넘긴다: 한도·실패·클라이언트를 못 만듦(설정 없음)·from 없는 클라이언트·떠난 뒤 늦은 답은
// 모두 빈 목록이다. 오류를 밖으로 던지지 않고 글로 남기지도 않는다

export const WARRANTY_READ_TIMEOUT_MS = 10_000

const NONE: readonly WarrantyItem[] = []

/** from이 있는 클라이언트일 때만 읽는다. 다른 화면 시험처럼 { auth }만 있는 흉내는 읽지 않는다 */
const canRead = (client: unknown): boolean => typeof (client as { from?: unknown } | null)?.from === 'function'

/** 한 번 읽기. 한도가 먼저 오거나 무엇이든 실패하면 빈 목록이고, 한도 뒤 늦게 온 답은 버린다 */
function readSoon(today: string): Promise<readonly WarrantyItem[]> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(NONE), WARRANTY_READ_TIMEOUT_MS)
    const settle = (items: readonly WarrantyItem[]) => {
      clearTimeout(timer)
      resolve(items)
    }
    Promise.resolve()
      .then(() => {
        const client = supabaseBrowser()
        return canRead(client) ? listWarrantySoon(client, today) : NONE
      })
      .then(settle, () => settle(NONE))
  })
}

/** today: 대시보드를 연 날의 한국 날짜('YYYY-MM-DD'). 처음 받은 값으로 한 번만 읽는다 */
export function useWarrantySoon(today: string): readonly WarrantyItem[] {
  const [openedOn] = useState(today)
  const [items, setItems] = useState<readonly WarrantyItem[]>(NONE)

  useEffect(() => {
    let gone = false // 떠난 뒤에 온 답은 쓰지 않는다
    void readSoon(openedOn).then((found) => {
      if (!gone) setItems(found)
    })
    return () => {
      gone = true
    }
  }, [openedOn])

  return items
}
