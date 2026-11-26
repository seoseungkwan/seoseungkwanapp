'use client'

import { useEffect } from 'react'
import { borrowScreenCall, enterBackground } from '@/components/claim/bitLane'
import { useReadOnly } from '@/components/shell/viewing'
import { connectScreenBridge } from '@/lib/bridge/workerSink'
import { resetRunner } from '@/lib/gsheet/runner'
import { fillStatus } from '@/lib/gsheet/status'
import { addGsheetRun, lastGsheetRun, listGsheetRuns, loadGsheetSettings, upsertGsheetMonths } from '@/lib/storage/gsheet'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { readViewKey } from '@/lib/supabase/viewKey'
import type { ChromeRuntimeLike, SmallCommand } from '@/types/bridge'
import { startSheetAuto, type SheetAutoDeps, type SheetBridge, type SheetLocks } from './sheetAuto'

// 수납 저절로 넣기 자리(spec google-link REQ-8513 AC-8513.3·AC-8513.4, REQ-8540 AC-8540.1, design.md 11절). 앱 틀(AppShell)이 props 없이 늘 그린다.
// 아무것도 그리지 않는다. 한 차례 판단은 sheetAuto.ts(30초마다), 여기는 진짜 deps(브라우저 Supabase·bitLane·확장 통로·navigator.locks)만 잇는다.
// 보는 중(useReadOnly)이면 시작하지 않고, 앱 틀 뿌리라 ViewingProvider 밖이어도 차례마다 보기 쿠키를 본다(AutoUpload와 같음).
// 떠날 때(로그아웃) 멈추고, 넣기 상태(fillStatus)·그날 달 목록 표시(resetRunner)를 처음으로 돌린다(다른 계정에 남지 않게)

function chromeRuntime(): ChromeRuntimeLike | undefined {
  return (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
}

function browserDeps(): SheetAutoDeps {
  const client = supabaseBrowser()
  const locks = typeof navigator !== 'undefined' ? (navigator as Navigator & { locks?: SheetLocks }).locks : undefined
  return {
    viewing: () => readViewKey(document.cookie) !== null,
    loadSettings: () => loadGsheetSettings(client),
    lastRun: () => lastGsheetRun(client),
    listRuns: (fromIso) => listGsheetRuns(client, fromIso),
    store: {
      addRun: (run) => addGsheetRun(client, run),
      upsertMonths: (months) => upsertGsheetMonths(client, months),
    },
    borrow: borrowScreenCall,
    enterBackground,
    canConnect: () => chromeRuntime() !== undefined,
    connect: (): SheetBridge => {
      // 수납 명령은 숫자 답뿐이라 Worker 없이 연다(조각이 오면 통로 안에서 버린다)
      const bridge = connectScreenBridge({ runtime: chromeRuntime() })
      return {
        hello: bridge.hello,
        call: (cmd, args) => bridge.call(cmd as SmallCommand, args as never),
        close: bridge.close,
      }
    },
    locks: locks ?? null,
    now: () => new Date(),
  }
}

export function GoogleSheetAuto(): null {
  const readOnly = useReadOnly()
  useEffect(() => {
    if (readOnly) return
    const stop = startSheetAuto(browserDeps())
    return () => {
      stop()
      resetRunner()
      fillStatus.reset()
    }
  }, [readOnly])
  return null
}
