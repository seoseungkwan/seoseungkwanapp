'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { createStaffStore, defaultStaffSettings, type StaffStore } from '@/lib/storage/staff'
import { createStaffFileStore, type StaffFileClient, type StaffFileStore } from '@/lib/storage/staffFiles'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { StaffMember, StaffSettings, WeekPlan } from '@/types/staff'

// 직원 탭 공용 읽기 훅(spec staff design.md 6절 '공용', AC-7610.1). 명단·근무표·휴가·급여 네 화면이 함께 쓴다.
// 직원·설정·기본 근무 셋을 함께 읽고(하나라도 실패하면 failed — 화면은 E-STAFF-READ-FAILED와 [다시 불러오기]), 병원 정보는 useClinicProfile을 그대로 준다
// (병원 정보 실패는 clinic.state로 따로 — 기본값으로 돈다). 저장 층(store·files)도 함께 줘서 화면이 저장한 뒤 reload를 부른다.
// reload하는 동안은 앞서 읽은 값을 그대로 보이고(화면이 비지 않게) 새 답이 오면 바꾼다. 늦게 온 앞 읽기의 답은 버린다.
// 자료는 React 상태에만 둔다(브라우저 저장소에 쓰지 않는다)

export type StaffBaseState = 'loading' | 'ready' | 'failed'

export type StaffBase = {
  state: StaffBaseState
  /** 직원 모두(재직·퇴사), 입사일·이름 차례. 읽는 중·실패면 빈 목록 */
  members: StaffMember[]
  /** 연차 기준·못 쓴 연차·급여 항목. 읽는 중·실패면 기본값 */
  settings: StaffSettings
  /** 기본 근무 모두. 읽는 중·실패면 빈 목록 */
  plans: WeekPlan[]
  /** 병원 정보(진료시간·휴진일·예약 시행자 목록·이름) */
  clinic: ClinicProfileView
  /** 직원 저장 층(lib/storage/staff.ts) */
  store: StaffStore
  /** 서류·세무사 파일(lib/storage/staffFiles.ts) */
  files: StaffFileStore
  /** 직원·설정·기본 근무와 병원 정보를 다시 읽는다 */
  reload(): void
}

type Read = { members: StaffMember[]; settings: StaffSettings; plans: WeekPlan[] }
type Held = { attempt: number; value: Read | 'failed' }

const NO_MEMBERS: StaffMember[] = []
const NO_PLANS: WeekPlan[] = []
const DEFAULT_SETTINGS = defaultStaffSettings()

// 클라이언트를 만들다 던져도(설정 없는 환경) 저장 층은 만든다 — 부를 때마다 번호(E-STAFF-*)로만 거절한다
const unavailable = () => {
  throw new Error('supabase client unavailable')
}
const NO_CLIENT = { from: unavailable, rpc: unavailable, storage: { from: unavailable } } as unknown as StaffFileClient

function browserStores(): { store: StaffStore; files: StaffFileStore } {
  let client: StaffFileClient
  try {
    client = supabaseBrowser()
  } catch {
    client = NO_CLIENT
  }
  return { store: createStaffStore(client), files: createStaffFileStore(client) }
}

export function useStaffBase(): StaffBase {
  const clinic = useClinicProfile()
  const [{ store, files }] = useState(browserStores)
  const [attempt, setAttempt] = useState(0)
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    Promise.all([store.listMembers(), store.loadSettings(), store.listPlans()]).then(
      ([members, settings, plans]) => {
        if (current) setHeld({ attempt, value: { members, settings, plans } })
      },
      () => {
        if (current) setHeld({ attempt, value: 'failed' })
      },
    )
    return () => {
      current = false
    }
  }, [attempt, store])

  const reloadClinic = clinic.reload
  const reload = useCallback(() => {
    setAttempt((n) => n + 1)
    reloadClinic()
  }, [reloadClinic])

  // 같은 읽기 결과면 같은 값을 준다(쓰는 쪽 effect가 그릴 때마다 돌지 않게)
  return useMemo((): StaffBase => {
    const read = held !== null && held.value !== 'failed' ? held.value : null
    const settled = held !== null && held.attempt === attempt
    const state: StaffBaseState = read !== null ? 'ready' : settled ? 'failed' : 'loading'
    return {
      state,
      members: read?.members ?? NO_MEMBERS,
      settings: read?.settings ?? DEFAULT_SETTINGS,
      plans: read?.plans ?? NO_PLANS,
      clinic,
      store,
      files,
      reload,
    }
  }, [held, attempt, clinic, store, files, reload])
}
