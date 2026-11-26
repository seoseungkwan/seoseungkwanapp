'use client'

import { useEffect } from 'react'
import { useReadOnly } from '@/components/shell/viewing'
import { gcalCall } from '@/lib/gcal/client'
import { makeGcalDeps } from '@/lib/gcal/deps'
import { startGcalLoop } from '@/lib/gcal/loop'
import { getGcalStatus, resetGcalStatus, subscribeGcalStatus } from '@/lib/gcal/status'
import { loadGcalView } from '@/lib/storage/gcal'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { readViewKey } from '@/lib/supabase/viewKey'
import { startGcalSync, type GcalSyncDeps } from './syncLoop'

// 예약 구글 맞춤 자리(spec google-link REQ-8525 AC-8525.1, REQ-8540 AC-8540.1, design.md 10-5). 앱 틀(AppShell)이 props 없이 늘 그린다.
// 아무것도 그리지 않는다. 언제 시작·멈추나는 syncLoop.ts, 여기는 진짜 deps만 잇는다:
// 병원 id = my_clinic_hospital_id()(원장·데스크 모두 같은 병원 — off 줄 일정 id가 같게), 잇기 = loadGcalView(비밀 글자는 읽지 않고 있는지만),
// 맞춤 = startGcalLoop(makeGcalDeps({client, hospitalId, call: gcalCall})). 띠·탭 줄은 lib/gcal/status를 바로 듣는다.
// 보는 중(useReadOnly)이면 시작하지 않고, 앱 틀 뿌리라 ViewingProvider 밖이어도 볼 때마다 보기 쿠키를 본다.
// 떠날 때(로그아웃) 맞춤을 멈추고 맞춤 상태를 처음으로 돌린다(다른 계정에 남지 않게)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function browserDeps(): GcalSyncDeps {
  const client = supabaseBrowser()
  return {
    viewing: () => readViewKey(document.cookie) !== null,
    hospitalId: async () => {
      const { data, error } = await client.rpc('my_clinic_hospital_id')
      return !error && typeof data === 'string' && UUID.test(data) ? data : null
    },
    linked: async () => {
      const view = await loadGcalView(client)
      return view !== null && view.calendarId !== null && view.linkedOn !== null && view.hasSecret
    },
    startLoop: (hospitalId) => startGcalLoop(makeGcalDeps({ client, hospitalId, call: gcalCall })),
    subscribe: subscribeGcalStatus,
    statusLinked: () => getGcalStatus().linked,
  }
}

export function GcalSync(): null {
  const readOnly = useReadOnly()
  useEffect(() => {
    if (readOnly) return
    const stop = startGcalSync(browserDeps())
    return () => {
      stop()
      resetGcalStatus()
    }
  }, [readOnly])
  return null
}
