'use client'

import { useEffect } from 'react'
import { enterBackground } from '@/components/claim/bitLane'
import { useReadOnly } from '@/components/shell/viewing'
import { todayInKorea } from '@/lib/analytics/dates'
import { connectScreenBridge } from '@/lib/bridge/workerSink'
import { claimUpload, readMyUploadPlan, readSavedSalesDays, readStatsMarks, reportUpload } from '@/lib/storage/autoUpload'
import { deskClaimUpload, deskReportUpload, readDeskCoverage, readDeskSalesMarks, readDeskStatsMarks, readDeskUploadPlan } from '@/lib/storage/deskUpload'
import { createRevenueStore } from '@/lib/storage/revenue'
import { readCoverage, saveStats } from '@/lib/storage/stats'
import { listStatsRxGroups } from '@/lib/storage/statsRxGroups'
import { loadSunapSettings } from '@/lib/storage/sunap'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { readViewKey } from '@/lib/supabase/viewKey'
import type { ChromeRuntimeLike } from '@/types/bridge'
import { createStatsWorker } from '@/workers/statsClient'
import { pickAccess, runUpload, uploadGroupsOf, type UploadAccess, type UploadGroups } from './runUpload'

// 저절로 올리기 자리(spec admin-view REQ-8021 AC-8021.1·AC-8024.7, design.md '저절로 올리기 — 돌리기'). 앱 틀(AppShell)이 늘 그린다.
// 아무것도 그리지 않는다(올리는 중 표시·완료 알림·오류 모두 없음). 쪽을 연 뒤 15초(첫 화면·대시보드 비트 읽기가 먼저) 기다리고,
// 탭이 보이는 중이 아니면 보일 때까지 기다렸다가 runUpload를 한 번 부른다(탭 사이를 옮겨도 앱 틀이 남아 다시 부르지 않는다).
// 보는 중(useReadOnly·보기 쿠키)이거나 확장 통로가 없는 PC면 아무것도 하지 않는다. 원장 계획 → 데스크 계획 차례로 길을 고른다

export const START_DELAY_MS = 15_000

// 원장 길: TASK-17 함수 + 통계 탭과 같은 읽기·저장(RLS 내 병원)
const OWNER: UploadAccess = {
  readPlan: readMyUploadPlan,
  claim: claimUpload,
  report: reportUpload,
  readSalesMarks: readSavedSalesDays,
  readCoverage: (range) => readCoverage(range),
  readStatsMarks,
  saveRevenue: (range, result) => createRevenueStore(supabaseBrowser()).saveRange(range, result),
  saveStats: (input) => saveStats(input),
}

// 데스크 길: 정의자 함수만(데스크는 매출·통계 값을 읽지 못하고 표에 바로 쓰지 않는다, REQ-8024)
const DESK: UploadAccess = {
  readPlan: readDeskUploadPlan,
  claim: deskClaimUpload,
  report: deskReportUpload,
  readSalesMarks: readDeskSalesMarks,
  readCoverage: readDeskCoverage,
  readStatsMarks: readDeskStatsMarks,
  saveRevenue: (range, result) => createRevenueStore(supabaseBrowser(), { desk: true }).saveRange(range, result),
  saveStats: (input) => saveStats(input, { desk: true }),
}

// 처방 묶음(stats_rx_groups)과 수납일지 설정(sunap_settings)을 다 읽는다. 데스크도 이 두 표는 읽을 수 있다
const readGroups = (): Promise<UploadGroups> =>
  Promise.all([listStatsRxGroups(), loadSunapSettings(supabaseBrowser())]).then(([rows, settings]) => uploadGroupsOf(rows, settings))

async function startUpload(signal: AbortSignal): Promise<void> {
  if (readViewKey(document.cookie) !== null) return
  const runtime = (globalThis as { chrome?: { runtime?: ChromeRuntimeLike } }).chrome?.runtime
  if (runtime === undefined) return
  const picked = await pickAccess([OWNER, DESK])
  if (picked === null || signal.aborted) return
  await runUpload({
    access: picked.access,
    plan: picked.plan,
    readGroups,
    open: () => {
      const worker = createStatsWorker()
      return { worker, bridge: connectScreenBridge({ runtime, worker }) }
    },
    lane: { enterBackground },
    locks: typeof navigator !== 'undefined' ? navigator.locks : undefined,
    subtle: globalThis.crypto?.subtle,
    now: Date.now,
    today: todayInKorea(),
    tab: crypto.randomUUID(),
    page: document,
    signal,
  })
}

export function AutoUpload(): null {
  const readOnly = useReadOnly()
  useEffect(() => {
    if (readOnly) return
    const controller = new AbortController()
    const start = () => {
      startUpload(controller.signal).catch(() => undefined)
    }
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      document.removeEventListener('visibilitychange', onVisible)
      start()
    }
    const timer = setTimeout(() => {
      if (document.visibilityState === 'visible') start()
      else document.addEventListener('visibilitychange', onVisible)
    }, START_DELAY_MS)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisible)
      controller.abort()
    }
  }, [readOnly])
  return null
}
