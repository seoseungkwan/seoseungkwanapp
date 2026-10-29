'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ui } from '@/components/ui/classes'
import { submitSignup } from '@/lib/auth/hospital'
import { validateSignup, type SignupErrors, type SignupInput } from '@/lib/auth/signup'
import { SignOutButton } from './SignOutButton'

// 칸 id(목업과 같은 이름). 틀린 칸 문구는 `${id}-error`로 칸에 이어 둔다(aria-describedby)
const IDS: Record<keyof SignupInput, string> = {
  name: 'su-clinic',
  applicantName: 'su-name',
  phone: 'su-phone',
  agreed: 'su-agree',
}
// 틀린 칸이 여럿이면 화면 순서로 첫 칸에 초점을 둔다
const ORDER: (keyof SignupInput)[] = ['name', 'applicantName', 'phone', 'agreed']
const EMPTY: SignupInput = { name: '', applicantName: '', phone: '', agreed: false }

// 단계 하나: 앞 단계와 1px 선(before)으로 잇는다. 첫 단계는 선 없음
const STEP = 'flex items-center gap-1.5 before:h-px before:w-6 before:bg-line first:before:hidden'
// 칸 이름 + 필수·선택 표시(caption muted)
const LABEL = `${ui.label} flex items-center gap-1.5`
const MARK = 'text-caption text-muted'

// 칸이 가리킬 설명 id들(틀린 문구 먼저, 그다음 안내). 없으면 속성을 달지 않는다
const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined

// 가입 신청 본문(목업 docs/mockups/auth/Signup.dc.html): 단계 표시 · 제목 · 폼 카드 · [다른 계정으로 로그인].
// 모양은 UI_GUIDE '앱 화면'의 공통 모양(ui.*): 카드·입력란·읽기 전용 칸·체크 상자·주 단추·글자 단추
// 이메일은 로그인한 구글 계정(서버 guard의 Me) — 보이기만 하고 보내지 않는다(DB가 토큰에서 넣는다)
export function SignupForm({ email }: { email: string }) {
  const router = useRouter()
  const [values, setValues] = useState<SignupInput>(EMPTY)
  const [errors, setErrors] = useState<SignupErrors>({})
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // 단추가 막히기(다시 그리기) 전에 연달아 들어온 submit도 한 번만 보낸다. 성공하면 넘어가는 동안 풀지 않는다
  const sending = useRef(false)

  const set = <K extends keyof SignupInput>(key: K, value: SignupInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (sending.current) return
    setFailed(false)
    const result = validateSignup(values)
    if (!result.ok) {
      setErrors(result.errors)
      const first = ORDER.find((key) => result.errors[key] !== undefined)
      if (first !== undefined) document.getElementById(IDS[first])?.focus()
      return
    }
    setErrors({})
    sending.current = true
    setBusy(true)
    try {
      await submitSignup(result.value)
    } catch {
      // 오류 내용은 보이지 않는다. 적은 값은 state에 그대로 있다
      sending.current = false
      setBusy(false)
      setFailed(true)
      return
    }
    // 승인 대기로. guard가 상태를 다시 보고 맞는 곳(대기·대시보드)으로 보낸다
    router.replace('/pending')
  }

  const errorId = (key: keyof SignupInput) => errors[key] !== undefined && `${IDS[key]}-error`
  const fieldError = (key: keyof SignupInput) =>
    errors[key] !== undefined && (
      <p id={`${IDS[key]}-error`} className={ui.fieldError}>
        {errors[key]}
      </p>
    )
  const invalid = (key: keyof SignupInput) => (errors[key] !== undefined ? true : undefined)

  return (
    <div className="flex w-full max-w-140 flex-col gap-6">
      {/* 단계 표시: 끝난 단계 ok 체크 + ink-2 · 지금 단계 ink 600 · 다음 단계 muted, 사이 1px 선 */}
      <ol aria-label="가입 단계" className="flex list-none flex-wrap items-center gap-2 text-table">
        <li className={`${STEP} text-ink-2`}>
          <svg
            aria-hidden="true"
            className="shrink-0 text-ok"
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.6"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12.5l4.5 4.5L19 7.5" />
          </svg>
          구글 로그인
        </li>
        <li aria-current="step" className={`${STEP} font-semibold text-ink`}>
          <span>02</span>가입 신청
        </li>
        <li className={`${STEP} text-muted`}>
          <span>03</span>관리자 승인
        </li>
      </ol>

      <div className="flex flex-col gap-1.5">
        <h1 className="text-title font-semibold text-ink max-md:text-title-sm">가입 신청</h1>
        <p className="text-body text-ink-2">처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인합니다.</p>
      </div>

      <form className={`${ui.card} flex flex-col gap-5`} noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className={ui.field}>
          <label htmlFor="su-email" className={ui.label}>
            구글 계정
          </label>
          <div className={ui.readonly}>
            <svg
              aria-hidden="true"
              className="shrink-0 text-muted"
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="5" y="11" width="14" height="9" rx="2" />
              <path d="M8 11V8a4 4 0 0 1 8 0v3" />
            </svg>
            {/* 입력란은 한 줄이라 긴 주소를 자른다 → 화면에는 줄을 바꾸는 글자로 보이고(화면 읽기는 건너뜀),
                입력란은 숨겨 두고 라벨·설명·키보드 초점만 맡는다(초점은 칸 테두리 focus-within으로 보인다) */}
            <input id="su-email" type="email" value={email} readOnly aria-describedby="su-email-help" className="sr-only" />
            <span aria-hidden="true" className="min-w-0 flex-1 wrap-anywhere">
              {email}
            </span>
          </div>
          <p id="su-email-help" className={ui.help}>
            로그인한 계정이라 바꿀 수 없습니다.
          </p>
        </div>

        <div className={ui.field}>
          <label htmlFor={IDS.name} className={LABEL}>
            병원 이름 <span className={MARK}>필수</span>
          </label>
          <input
            id={IDS.name}
            type="text"
            required
            autoComplete="organization"
            placeholder="예: 가나 정형외과의원"
            value={values.name}
            onChange={(event) => set('name', event.target.value)}
            aria-invalid={invalid('name')}
            aria-describedby={describedBy(errorId('name'))}
            className={ui.input}
          />
          {fieldError('name')}
        </div>

        <div className={ui.field}>
          <label htmlFor={IDS.applicantName} className={LABEL}>
            신청자 이름 <span className={MARK}>필수</span>
          </label>
          <input
            id={IDS.applicantName}
            type="text"
            required
            autoComplete="name"
            placeholder="예: 홍길동"
            value={values.applicantName}
            onChange={(event) => set('applicantName', event.target.value)}
            aria-invalid={invalid('applicantName')}
            aria-describedby={describedBy(errorId('applicantName'))}
            className={ui.input}
          />
          {fieldError('applicantName')}
        </div>

        <div className={ui.field}>
          <label htmlFor={IDS.phone} className={LABEL}>
            연락처 <span className={MARK}>선택</span>
          </label>
          <input
            id={IDS.phone}
            type="tel"
            autoComplete="tel"
            placeholder="010-0000-0000"
            value={values.phone}
            onChange={(event) => set('phone', event.target.value)}
            aria-invalid={invalid('phone')}
            aria-describedby={describedBy(errorId('phone'), 'su-phone-help')}
            className={ui.input}
          />
          {fieldError('phone')}
          <p id="su-phone-help" className={ui.help}>
            승인 관련해 연락이 필요할 때만 씁니다.
          </p>
        </div>

        <div className={ui.field}>
          <label className="flex cursor-pointer items-start gap-2.5 text-body text-ink-2 max-md:min-h-11">
            <span className={`${ui.checkboxWrap} mt-0.75`}>
              <input
                id={IDS.agreed}
                type="checkbox"
                required
                checked={values.agreed}
                onChange={(event) => set('agreed', event.target.checked)}
                aria-invalid={invalid('agreed')}
                aria-describedby={describedBy(errorId('agreed'))}
                className={ui.checkbox}
              />
              <svg
                aria-hidden="true"
                className={ui.checkboxMark}
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M3.5 8.5l3 3 6-7" />
              </svg>
            </span>
            <span>
              가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의합니다.{' '}
              <span className={MARK}>필수</span>
            </span>
          </label>
          {fieldError('agreed')}
        </div>

        {failed && <ErrorCard code="E-SIGNUP-FAILED" />}

        <button type="submit" className={`${ui.button.primary} w-full`} disabled={busy}>
          가입 신청
        </button>
      </form>

      <SignOutButton className={`${ui.textButton} self-center`}>다른 계정으로 로그인</SignOutButton>
    </div>
  )
}
