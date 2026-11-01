'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { GoogleMark } from '@/components/common/GoogleMark'
import { Icon } from '@/components/common/Icon'
import { isInAppBrowser } from '@/lib/auth/inAppBrowser'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { ds } from '@/components/ui/classes'
import type { ErrorCode } from '@/types/errors'
import { CopyStatus, useCopy } from './CopyStatus'

const noSubscribe = () => () => {}

// 서버에서 그릴 때는 브라우저를 모른다(null) → 구글 단추·앱 안 안내는 브라우저에서만 그린다(서버 HTML과 어긋나지 않게)
function useUserAgent(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => navigator.userAgent,
    () => null,
  )
}

// 로그인 폼(목업 로그인·로그인 실패, b2b-redesign REQ-214 AC-214.1·AC-214.2, ui-90 AC-419.2). 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 loginForm,
// 문구는 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs의 loginForm 글자 그대로다.
// 상자(카드) 없이 h1 → 설명 → (오류 카드) → [구글로 시작하기] → 안내 줄 → 승인 안내를 <section aria-labelledby> 하나에 둔다.
// 소개 문장·미리보기는 LoginAside, 소개 줄은 AuthFrame 왼쪽 아래에 있다. 파일럿 LoginCard 이식.
// failed = 구글에서 돌아왔는데 세션을 못 만듦(/login?error=1 → E-AUTH-CALLBACK). 로그인 시작이 실패하면 같은 자리에 E-AUTH-START
export function LoginCard({ failed }: { failed: boolean }) {
  const userAgent = useUserAgent()
  // 구글로 넘어가는 동안: 단추는 막힘(disabled)이 아니라 기다림(aria-busy + "구글로 넘어가는 중…")이다(UI_GUIDE '단추' 기다림)
  const [busy, setBusy] = useState(false)
  // 다시 그리기 전에 같은 틱에 연달아 눌러도 한 번만 부른다. 구글로 넘어가면 풀지 않는다
  const starting = useRef(false)
  const [startFailed, setStartFailed] = useState(false)

  // 구글 화면에서 [뒤로]로 돌아오면(뒤로 가기 캐시) 기다림을 풀고 다시 누를 수 있게 한다
  useEffect(() => {
    const release = (event: PageTransitionEvent) => {
      if (!event.persisted) return
      starting.current = false
      setBusy(false)
    }
    window.addEventListener('pageshow', release)
    return () => window.removeEventListener('pageshow', release)
  }, [])

  async function signIn() {
    if (starting.current) return
    starting.current = true
    setBusy(true)
    setStartFailed(false) // 앞서 실패한 카드를 지운다 → 구글로 넘어가는 동안·뒤로 가기로 돌아와도 남지 않는다
    try {
      const { error } = await supabaseBrowser().auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `${window.location.origin}/auth/callback` },
      })
      if (!error) return // 구글로 넘어간다
    } catch {
      // 열쇠 없음 등. 오류 내용은 보이지 않고 E-AUTH-START로만 알린다
    }
    starting.current = false
    setStartFailed(true)
    setBusy(false)
  }

  const code: ErrorCode | null = startFailed ? 'E-AUTH-START' : failed ? 'E-AUTH-CALLBACK' : null
  const label = busy ? '구글로 넘어가는 중…' : code === null ? '구글로 시작하기' : '다시 구글로 시작하기'

  return (
    <section aria-labelledby="login-title" className="flex min-w-0 flex-col">
      <h1 id="login-title" className="text-heading-m font-semibold text-ink md:text-heading">
        로그인
      </h1>
      <p className="mt-2 text-body text-ink-2">구글 계정으로 로그인해요. 처음이면 가입 신청으로 이어져요.</p>
      {code !== null && (
        <div className="mt-6">
          <ErrorCard code={code} />
        </div>
      )}
      {userAgent === null ? (
        // 브라우저를 알기 전(서버에서 그릴 때) 단추 자리(44px). 화면이 뜰 때 아래가 밀리지 않게
        <div aria-hidden="true" className="mt-6 h-11" />
      ) : isInAppBrowser(userAgent) ? (
        <OpenInBrowser />
      ) : (
        <button
          type="button"
          className={`${ds.button.googleLarge} mt-6 w-full`}
          aria-busy={busy || undefined}
          onClick={() => void signIn()}
        >
          {/* 구글 G는 흰 사각형 없이 단추 안에 바로 둔다(상표 색은 GoogleMark에만). 기다리는 동안은 글자만 바뀐다 */}
          <GoogleMark size={18} />
          <span>{label}</span>
        </button>
      )}
      <div className="mt-6 flex items-start gap-3 border-t border-line pt-6">
        <Icon name="shield" size={16} className="mt-0.5 shrink-0 text-muted" />
        <div className="flex min-w-0 flex-col">
          <p className="text-small font-semibold text-ink">환자 개인정보는 병원 PC 밖으로 나가지 않아요</p>
          <p className="text-small text-muted">환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장해요.</p>
        </div>
      </div>
      {/* 승인 안내는 small(13px) muted(시안 t-small) */}
      <p className="mt-4 text-small text-muted">처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있어요.</p>
    </section>
  )
}

// 앱 안 브라우저(카카오톡 등): 구글 단추 대신 크롬·엣지로 열라는 안내 + [주소 복사](AC-003.2). 복사가 막혀도 주소는 보인다.
// 모양(AC-214.2): canvas 바탕·4px, 테두리 없음(안의 읽기 전용 주소 칸이 테두리를 가져서 상자 안 상자가 되지 않게) + 보조 단추
function OpenInBrowser() {
  const address = `${window.location.origin}/login`
  const [copied, copy] = useCopy(address)

  return (
    <div className="mt-6 flex flex-col gap-3 rounded-control bg-canvas p-4">
      <div className="flex flex-col gap-1">
        <p className="text-body font-semibold text-ink">크롬·엣지에서 열어 주세요</p>
        {/* "크롬·엣지"는 한 덩이로 줄을 바꾼다(가운뎃점 앞에서 끊기면 줄이 "·"로 시작한다) */}
        <p className="text-small text-ink-2">
          구글은 앱 안에서 여는 로그인을 막아요. 주소를 복사해 <span className="whitespace-nowrap">크롬·엣지</span> 주소창에 붙여
          넣어 주세요.
        </p>
      </div>
      {/* 읽기 전용 주소 칸. 누르면 주소 전체가 잡힌다(select-all은 -webkit-user-select도 낸다) */}
      <p className={`${ds.readonly} select-all wrap-anywhere`}>{address}</p>
      <button type="button" className={`${ds.button.secondary} w-full`} onClick={() => void copy()}>
        주소 복사
      </button>
      <CopyStatus result={copied} className="text-small text-ink-2" />
    </div>
  )
}
