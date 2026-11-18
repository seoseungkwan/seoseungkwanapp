'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { defaultProfile, downloadLogo, loadClinicProfile, loadSignup, type Signup } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ClinicProfile } from '@/types/clinicProfile'

// 병원 정보 공용 훅(spec clinic-profile design.md 2절). 서식·문자·통계·대시보드·설정 칸이 쓴다(예약은 useCalendarData가 loadClinicProfile을 바로 부른다).
// 한 번 읽어 React 상태에만 둔다(저장소에 두지 않는다). 읽기 실패는 failed이고 profile은 기본값·saved 거짓이라,
// 쓰는 쪽은 실패를 '줄 없음'처럼 다뤄 지금처럼 돈다(SQL을 넣기 전 배포에도, design.md '위험'). [다시 불러오기]는 reload.
// 로고는 { logo: true }일 때만 받는다(1MB까지라 필요한 화면만). 그때는 로고까지 받은 뒤에 ready다(받는 중에는 인쇄·그림 파일을 막는다, AC-6604.2)

export type ClinicProfileState = 'loading' | 'ready' | 'failed'

export type ClinicProfileView = {
  state: ClinicProfileState
  /** 저장한 값. 줄이 없거나 읽는 중·실패면 기본값(defaultProfile) */
  profile: ClinicProfile
  /** 병원 정보 줄이 있음 */
  saved: boolean
  /** 가입 이름(데스크는 my_desk 이름). 못 읽으면 '' */
  signupName: string
  /** 가입 전화(숫자만). 데스크·못 읽음은 null */
  signupPhone: string | null
  /** 보이는 병원 이름 = profile.displayName ?? signupName */
  name: string
  /** 로고 data:image/png 글. 로고 없음·받기 실패·달라고 하지 않음은 null(이름 글자로 그린다) */
  logoDataUrl: string | null
  reload(): void
}

type Read = { profile: ClinicProfile | null | 'failed'; signup: Signup | null; logo: string | null }
type Held = { key: string; value: Read }

const FAILED: Read = { profile: 'failed', signup: null, logo: null }

// 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다. 로고 받기가 던지면 로고만 없다
const read = (withLogo: boolean): Promise<Read> =>
  Promise.resolve().then(async () => {
    const client = supabaseBrowser()
    const [profile, signup] = await Promise.all([loadClinicProfile(client), loadSignup(client).catch(() => null)])
    const path = profile !== null && profile !== 'failed' ? profile.logoPath : null
    const logo = withLogo && path !== null ? await downloadLogo(client, path).catch(() => null) : null
    return { profile, signup, logo }
  })

export function useClinicProfile(options: { logo?: boolean } = {}): ClinicProfileView {
  const withLogo = options.logo === true
  const [attempt, setAttempt] = useState(0)
  const key = `${attempt}|${withLogo}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    read(withLogo).then(
      (value) => {
        if (current) setHeld({ key, value })
      },
      () => {
        if (current) setHeld({ key, value: FAILED })
      },
    )
    return () => {
      current = false
    }
  }, [key, withLogo])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const shown = held !== null && held.key === key ? held.value : null
  // 같은 읽기 결과면 같은 값을 준다(쓰는 쪽 effect가 그릴 때마다 돌지 않게)
  return useMemo((): ClinicProfileView => {
    const stored = shown === null || shown.profile === 'failed' ? null : shown.profile
    const profile = stored ?? defaultProfile()
    const signupName = shown?.signup?.name ?? ''
    return {
      state: shown === null ? 'loading' : shown.profile === 'failed' ? 'failed' : 'ready',
      profile,
      saved: stored !== null,
      signupName,
      signupPhone: shown?.signup?.phone ?? null,
      name: profile.displayName ?? signupName,
      logoDataUrl: shown?.logo ?? null,
      reload,
    }
  }, [shown, reload])
}
