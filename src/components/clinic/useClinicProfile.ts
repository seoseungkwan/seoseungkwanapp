'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useViewing } from '@/components/shell/viewing'
import { todayInKorea } from '@/lib/analytics/dates'
import { defaultProfile, downloadLogo, loadClinicProfile, loadSignup, loadSignupEmr, readViewedEmr, type Signup } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { DEFAULT_EMR, type ClinicProfile, type EmrKind } from '@/types/clinicProfile'

// 병원 정보 공용 훅(spec clinic-profile design.md 2절). 서식·문자·통계·대시보드·설정 칸이 쓴다(예약은 useCalendarData가 loadClinicProfile을 바로 부른다).
// 한 번 읽어 React 상태에만 둔다(저장소에 두지 않는다). 읽기 실패는 failed이고 profile은 기본값·saved 거짓이라,
// 쓰는 쪽은 실패를 '줄 없음'처럼 다뤄 지금처럼 돈다(SQL을 넣기 전 배포에도, design.md '위험'). [다시 불러오기]는 reload.
// 로고는 { logo: true }일 때만 받는다(1MB까지라 필요한 화면만). 그때는 로고까지 받은 뒤에 ready다(받는 중에는 인쇄·그림 파일을 막는다, AC-6604.2)
// 병원 정보 줄이 없을 때(ready, saved 거짓)만 쓰는 EMR은 가입 신청 때 고른 EMR이다(spec emr-signup AC-7302.3). 줄이 있으면 줄 값, 읽는 중·실패·가입 EMR 없음은 'bit'
// 관리자가 다른 의원을 보는 중(useViewing, admin-view AC-8006.6)이면 이름은 늘 보는 의원 이름이다 — 병원 정보 줄은 RLS가 보는 의원 것을 주지만
// 가입 줄(loadSignup)은 내 것이라, 가입 이름·전화로 돌아가지 않는다(가입 이름 = 보는 의원 이름, 가입 전화 없음). 읽기는 그대로다.
// 보는 중이면 병원 정보 줄이 없을 때의 EMR도 내 가입 EMR(my_signup_emr — 부른 관리자 자기 병원)이 아니라 보는 의원 EMR(readViewedEmr)이고, 못 읽으면 'bit'다
// (specs/uisarang-upload AC-8808.8 · 대시보드·통계 탭·AI 리포트 화면이 같이 쓴다)

export type ClinicProfileState = 'loading' | 'ready' | 'failed'

export type ClinicProfileView = {
  state: ClinicProfileState
  /** 저장한 값. 줄이 없거나 읽는 중·실패면 기본값(defaultProfile, 줄 없음이면 emr만 가입 때 고른 EMR) */
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

type Read = { profile: ClinicProfile | null | 'failed'; signup: Signup | null; signupEmr: EmrKind | null; logo: string | null }
type Held = { key: string; value: Read }

const FAILED: Read = { profile: 'failed', signup: null, signupEmr: null, logo: null }

// 클라이언트를 만들다 던져도(설정 없는 환경) 거절로 받는다. 로고 받기가 던지면 로고만 없다.
// 가입 EMR은 줄이 있어도 함께 부른다(줄을 기다렸다 부르면 줄 없는 병원의 화면이 늦어진다). 보는 중이면 그 자리에 보는 의원 EMR을 부른다
const read = (withLogo: boolean, viewedId: string | null): Promise<Read> =>
  Promise.resolve().then(async () => {
    const client = supabaseBrowser()
    const [profile, signup, signupEmr] = await Promise.all([
      loadClinicProfile(client),
      loadSignup(client).catch(() => null),
      (viewedId !== null ? readViewedEmr(client, viewedId, todayInKorea()) : loadSignupEmr(client)).catch(() => null),
    ])
    const path = profile !== null && profile !== 'failed' ? profile.logoPath : null
    const logo = withLogo && path !== null ? await downloadLogo(client, path).catch(() => null) : null
    return { profile, signup, signupEmr, logo }
  })

export function useClinicProfile(options: { logo?: boolean } = {}): ClinicProfileView {
  const withLogo = options.logo === true
  const viewing = useViewing()
  const [attempt, setAttempt] = useState(0)
  // 보는 의원이 바뀌면 다시 읽는다(EMR이 그 의원 것이어야 한다)
  const viewedId = viewing?.hospitalId ?? null
  const key = `${attempt}|${withLogo}|${viewedId ?? ''}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    read(withLogo, viewedId).then(
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
  }, [key, withLogo, viewedId])

  const reload = useCallback(() => setAttempt((n) => n + 1), [])
  const shown = held !== null && held.key === key ? held.value : null
  // 같은 읽기 결과면 같은 값을 준다(쓰는 쪽 effect가 그릴 때마다 돌지 않게)
  return useMemo((): ClinicProfileView => {
    const stored = shown === null || shown.profile === 'failed' ? null : shown.profile
    const profile = shown !== null && shown.profile === null ? { ...defaultProfile(), emr: shown.signupEmr ?? DEFAULT_EMR } : (stored ?? defaultProfile())
    const signupName = viewing ? viewing.name : (shown?.signup?.name ?? '')
    return {
      state: shown === null ? 'loading' : shown.profile === 'failed' ? 'failed' : 'ready',
      profile,
      saved: stored !== null,
      signupName,
      signupPhone: viewing ? null : (shown?.signup?.phone ?? null),
      name: viewing ? viewing.name : (profile.displayName ?? signupName),
      logoDataUrl: shown?.logo ?? null,
      reload,
    }
  }, [shown, reload, viewing])
}
