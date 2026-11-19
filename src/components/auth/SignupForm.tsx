'use client'

import { useRouter } from 'next/navigation'
import { useRef, useState, type FormEvent } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { submitSignup } from '@/lib/auth/hospital'
import { validateSignup, type SignupErrors, type SignupInput } from '@/lib/auth/signup'
import { EMR_LABEL } from '@/lib/clinic/emrText'
import { EMR_KINDS, type EmrKind } from '@/types/clinicProfile'
import { SignOutButton } from './SignOutButton'
import { Stepper } from './Stepper'

// 칸 id(목업과 같은 이름). 틀린 칸 문구는 `${id}-error`로 칸에 이어 둔다(aria-describedby).
// 쓰는 EMR(su-emr)은 첫 단추('비트')의 id다 — 틀렸을 때 초점 자리. 묶음 div에는 id를 두지 않는다(emr-signup design.md 3절)
const IDS: Record<keyof SignupInput, string> = {
  name: 'su-clinic',
  emr: 'su-emr',
  applicantName: 'su-name',
  phone: 'su-phone',
  agreed: 'su-agree',
}
// 틀린 칸이 여럿이면 화면 순서로 첫 칸에 초점을 둔다
const ORDER: (keyof SignupInput)[] = ['name', 'emr', 'applicantName', 'phone', 'agreed']
// 쓰는 EMR은 처음에 아무것도 고르지 않는다(비트로 미리 골라 두면 다른 병원이 그냥 넘어가기 쉽다, emr-signup design.md 5절)
const EMPTY: SignupInput = { name: '', applicantName: '', phone: '', agreed: false, emr: null }
// 쓰는 EMR 묶음: ds.segment를 넓은 화면은 한 줄 넷·44px, 폰은 두 줄 둘씩으로 접두사만 덮는다(폰 grid·전체 폭·44px는 ds.segment에 이미 있다).
// 오류면 묶음에 data-invalid를 달아 테두리를 입력란 오류와 같은 border-negative로 바꾼다
const EMR_GROUP = `${ds.segment.group} md:grid md:w-full md:grid-cols-4 max-md:grid-cols-2 data-invalid:border-negative`
const EMR_BUTTON = `${ds.segment.button} md:h-11`

// 칸이 가리킬 설명 id들(틀린 문구 먼저, 그다음 안내). 없으면 속성을 달지 않는다
const describedBy = (...ids: (string | false)[]) => ids.filter(Boolean).join(' ') || undefined

// 가입 신청 본문(b2b-redesign REQ-215 AC-215.1, ui-90 AC-419.3). 짜임은 승인 시안 docs/mockups/b2b-redesign/screens.mjs의 signupBody,
// 문구는 ui-90 시안 docs/mockups/ui-90/entry/screens.mjs의 signupBody 글자 그대로다(첫 칸 이름 "의원 이름").
// AuthFrame 480 칸 안에 카드 상자 없이 단계(Stepper) → h1 → 안내 → 폼 → [다른 계정으로 로그인](폼 밖 아래, 왼쪽 정렬 글자 단추).
// 모양은 공통 묶음 ds.*: 칸 이름 줄(label + labelHint)·입력란·읽기 전용 칸·도움말·체크 상자·주 큰 단추·글자 단추
// 이메일은 로그인한 구글 계정(서버 guard의 Me) — 보이기만 하고 보내지 않는다(DB가 토큰에서 넣는다)
export function SignupForm({ email }: { email: string }) {
  const router = useRouter()
  const [values, setValues] = useState<SignupInput>(EMPTY)
  const [errors, setErrors] = useState<SignupErrors>({})
  // 보내는 동안: [가입 신청]은 막힘(disabled)이 아니라 기다림(aria-busy + "보내는 중…")이다(UI_GUIDE '단추' 기다림)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  // 다시 그리기 전에 연달아 들어온 submit도 한 번만 보낸다. 성공하면 넘어가는 동안 풀지 않는다
  const sending = useRef(false)

  const set = <K extends keyof SignupInput>(key: K, value: SignupInput[K]) =>
    setValues((prev) => ({ ...prev, [key]: value }))
  // 쓰는 EMR을 고르면 그 칸 오류 글만 지운다(AC-7303.2). 다른 칸 오류는 다시 보낼 때까지 그대로다
  const pickEmr = (emr: EmrKind) => {
    set('emr', emr)
    setErrors((prev) => (prev.emr === undefined ? prev : { ...prev, emr: undefined }))
  }

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
      <p id={`${IDS[key]}-error`} className={ds.fieldError}>
        {errors[key]}
      </p>
    )
  const invalid = (key: keyof SignupInput) => (errors[key] !== undefined ? true : undefined)

  return (
    <div className="flex min-w-0 flex-col">
      <Stepper current={2} />

      <h1 className="mt-6 text-heading-m font-semibold text-ink md:text-heading">가입 신청</h1>
      <p className="mt-2 text-body text-ink-2">처음 로그인하셨어요. 아래 내용을 보내 주시면 관리자가 확인한 뒤 승인해요.</p>

      <form className="mt-6 flex flex-col gap-5" noValidate onSubmit={(event) => void onSubmit(event)}>
        <div className={ds.field}>
          <label htmlFor="su-email" className={ds.label}>
            구글 계정
          </label>
          <div className={ds.readonly}>
            <Icon name="lock" size={14} className="shrink-0" />
            {/* 입력란은 한 줄이라 긴 주소를 자른다 → 화면에는 줄을 바꾸는 글자로 보이고(화면 읽기는 건너뜀),
                입력란은 숨겨 두고 라벨·설명·키보드 초점만 맡는다(초점은 칸 테두리 focus-within으로 보인다) */}
            <input id="su-email" type="email" value={email} readOnly aria-describedby="su-email-help" className="sr-only" />
            <span aria-hidden="true" className="min-w-0 flex-1 wrap-anywhere">
              {email}
            </span>
          </div>
          <p id="su-email-help" className={ds.help}>
            로그인한 계정이라 바꿀 수 없어요.
          </p>
        </div>

        <div className={ds.field}>
          <label htmlFor={IDS.name} className={ds.label}>
            의원 이름 <span className={ds.labelHint}>필수</span>
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
            className={ds.input}
          />
          {fieldError('name')}
        </div>

        {/* 쓰는 EMR(emr-signup REQ-7303, 시안 docs/mockups/emr-signup/index.html ①). 칸 이름은 단추 넷을 묶는 이름이라 label이 아닌 span이고,
            묶음(role="group")이 그 이름과 '오류 도움말' 차례 설명을 가리킨다(연락처 칸과 같은 차례) */}
        <div className={ds.field}>
          <span id="su-emr-label" className={ds.label}>
            쓰는 EMR <span className={ds.labelHint}>필수</span>
          </span>
          <div
            role="group"
            aria-labelledby="su-emr-label"
            aria-describedby={describedBy(errorId('emr'), 'su-emr-help')}
            data-invalid={invalid('emr')}
            className={EMR_GROUP}
          >
            {EMR_KINDS.map((kind, index) => (
              <button
                key={kind}
                id={index === 0 ? IDS.emr : undefined}
                type="button"
                aria-pressed={values.emr === kind}
                onClick={() => pickEmr(kind)}
                className={`${EMR_BUTTON} ${values.emr === kind ? ds.segment.on : ds.segment.off}`}
              >
                {EMR_LABEL[kind]}
              </button>
            ))}
          </div>
          {fieldError('emr')}
          <p id="su-emr-help" className={ds.help}>
            진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 승인 뒤 설정 → 병원 정보에서 바꿀 수 있어요.
          </p>
        </div>

        <div className={ds.field}>
          <label htmlFor={IDS.applicantName} className={ds.label}>
            신청자 이름 <span className={ds.labelHint}>필수</span>
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
            className={ds.input}
          />
          {fieldError('applicantName')}
        </div>

        <div className={ds.field}>
          <label htmlFor={IDS.phone} className={ds.label}>
            연락처 <span className={ds.labelHint}>선택</span>
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
            className={ds.input}
          />
          {fieldError('phone')}
          <p id="su-phone-help" className={ds.help}>
            승인 관련해 연락이 필요할 때만 써요.
          </p>
        </div>

        <div className={ds.field}>
          <label className="flex cursor-pointer items-start gap-2 text-body text-ink max-md:min-h-11">
            {/* 체크 상자(16px)를 글자 첫 줄(22px) 가운데에 둔다 */}
            <span className="flex h-5.5 shrink-0 items-center">
              <span className={ds.checkboxWrap}>
                <input
                  id={IDS.agreed}
                  type="checkbox"
                  required
                  checked={values.agreed}
                  onChange={(event) => set('agreed', event.target.checked)}
                  aria-invalid={invalid('agreed')}
                  aria-describedby={describedBy(errorId('agreed'))}
                  className={ds.checkbox}
                />
                <svg
                  aria-hidden="true"
                  className={ds.checkboxMark}
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
            </span>
            <span>
              가입 확인을 위해 이메일·이름·연락처를 저장하는 데 동의해요. <span className={ds.labelHint}>필수</span>
            </span>
          </label>
          {fieldError('agreed')}
        </div>

        {failed && <ErrorCard code="E-SIGNUP-FAILED" />}

        <button type="submit" className={`${ds.button.primaryLarge} w-full`} aria-busy={busy || undefined}>
          {busy ? '보내는 중…' : '가입 신청'}
        </button>
      </form>

      <SignOutButton className={`${ds.textButton} mt-4 self-start`}>다른 계정으로 로그인</SignOutButton>
    </div>
  )
}
