'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { isInAppBrowser } from '@/lib/auth/inAppBrowser'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { ErrorCode } from '@/types/errors'
import styles from './LoginCard.module.css'

const CHIPS = [
  { label: '환자 통계', tone: styles.teal },
  { label: 'AI 리포트', tone: styles.violet },
  { label: '급여·인센티브', tone: styles.amber },
  { label: '일일마감·보고', tone: styles.pink },
]

const noSubscribe = () => () => {}

// 서버에서 그릴 때는 브라우저를 모른다(null) → 구글 단추·앱 안 안내는 브라우저에서만 그린다(서버 HTML과 어긋나지 않게)
function useUserAgent(): string | null {
  return useSyncExternalStore(
    noSubscribe,
    () => navigator.userAgent,
    () => null,
  )
}

// 로그인 화면 본문(목업 로그인·로그인 실패): 왼쪽 소개 + 오른쪽 로그인 카드. 파일럿 LoginCard 이식.
// failed = 구글에서 돌아왔는데 세션을 못 만듦(/login?error=1 → E-AUTH-CALLBACK). 로그인 시작이 실패하면 같은 자리에 E-AUTH-START
export function LoginCard({ failed }: { failed: boolean }) {
  const userAgent = useUserAgent()
  const [busy, setBusy] = useState(false)
  const [startFailed, setStartFailed] = useState(false)

  // 구글 화면에서 [뒤로]로 돌아오면(뒤로 가기 캐시) 막아 둔 단추를 다시 푼다
  useEffect(() => {
    const release = (event: PageTransitionEvent) => {
      if (event.persisted) setBusy(false)
    }
    window.addEventListener('pageshow', release)
    return () => window.removeEventListener('pageshow', release)
  }, [])

  async function signIn() {
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
    setStartFailed(true)
    setBusy(false)
  }

  const code: ErrorCode | null = startFailed ? 'E-AUTH-START' : failed ? 'E-AUTH-CALLBACK' : null

  return (
    <div className={styles.layout}>
      <section className={styles.intro}>
        <p className={styles.eyebrow}>SIGN IN</p>
        <h1 className={styles.title}>
          통증 의원 관리자를 위한
          <br />
          AI 업무 도구
        </h1>
        <p className={styles.lead}>로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다.</p>
        <div className={styles.chips}>
          {CHIPS.map((chip) => (
            <span key={chip.label} className={`${styles.chip} ${chip.tone}`}>
              {chip.label}
            </span>
          ))}
        </div>
      </section>

      <section aria-labelledby="login-title" className={styles.side}>
        <div className={styles.card}>
          <div className={styles.head}>
            <h2 id="login-title" className={styles.cardTitle}>
              로그인
            </h2>
            <p className={styles.cardLead}>구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다.</p>
          </div>
          {code !== null && <ErrorCard code={code} />}
          {userAgent === null ? (
            <div aria-hidden="true" className={styles.placeholder} />
          ) : isInAppBrowser(userAgent) ? (
            <OpenInBrowser />
          ) : (
            <button type="button" className={styles.primary} disabled={busy} onClick={() => void signIn()}>
              <span aria-hidden="true" className={styles.googleMark}>
                <GoogleMark />
              </span>
              <span>{code === null ? '구글로 시작하기' : '다시 구글로 시작하기'}</span>
            </button>
          )}
          <div className={styles.privacy}>
            <svg
              aria-hidden="true"
              className={styles.privacyIcon}
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6l7-3z" />
              <path d="M9 12l2 2 4-4" />
            </svg>
            <div className={styles.privacyBody}>
              <p className={styles.privacyTitle}>환자 개인정보는 병원 PC 밖으로 나가지 않습니다</p>
              <p className={styles.privacyText}>환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장합니다.</p>
            </div>
          </div>
        </div>
        <p className={styles.note}>처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다.</p>
      </section>
    </div>
  )
}

// 앱 안 브라우저(카카오톡 등): 구글 단추 대신 크롬·엣지로 열라는 안내 + [주소 복사](AC-003.2). 복사가 막혀도 주소는 보인다
function OpenInBrowser() {
  const address = `${window.location.origin}/login`
  const [copied, setCopied] = useState<'done' | 'failed' | null>(null)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied('done')
    } catch {
      setCopied('failed')
    }
  }

  return (
    <div className={styles.inApp}>
      <div className={styles.inAppText}>
        <p className={styles.inAppTitle}>크롬·엣지에서 열어 주세요</p>
        <p className={styles.inAppBody}>
          구글은 앱 안에서 여는 로그인을 막아요. 주소를 복사해 크롬·엣지 주소창에 붙여 넣어 주세요.
        </p>
      </div>
      <p className={styles.address}>{address}</p>
      <button type="button" className={styles.primary} onClick={() => void copy()}>
        주소 복사
      </button>
      <p role="status" className={styles.copyStatus}>
        {copied === 'done' && <span className={styles.copied}>복사했어요.</span>}
        {copied === 'failed' && '복사하지 못했어요. 위 주소를 길게 눌러 복사해 주세요.'}
      </p>
    </div>
  )
}

// 구글 로고(목업과 같은 그림). 구글 상표 색이라 변수가 아니다
function GoogleMark() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}
