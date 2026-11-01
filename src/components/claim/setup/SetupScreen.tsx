'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { MENU } from '@/components/shell/menu'
import { ds } from '@/components/ui/classes'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ResultOf } from '@/types/bridge'
import { maskInstitution } from '../maskInstitution'
import { useBridge } from '../useBridge'
import { checkedAtText } from './checkedAt'
import { EXTENSION_STORE_URL, HELPER_RELEASES_URL } from './links'
import { BusyCard, SetupAlert } from './SetupAlert'
import { ProblemActions, StepGuide } from './StepGuide'
import { isRealProblem, setupSteps, type StepView } from './steps'

// 비트 PC 연결 (precheck REQ-006 · ui-90 REQ-412, 시안 docs/mockups/ui-90/app/gen.py setup_body). 설정 탭 안 [비트 PC 연결] → 제목 '설정'과 안쪽 메뉴.
// 열면 hello로 버전을 맞추고, 붙으면(ready) bit.check를 불러 5단계를 칩으로 보인다(칩 표는 steps.ts). 빨강은 진짜 문제(버전 안 맞음·의원 다름)에만:
// 그때만 안쪽 메뉴 아래 오류 상자 하나에 문구·오류 번호·단추를 모은다. 처음 상태와 다시 확인으로 풀리는 실패·등록 없음은 그 단계 줄의 "할 차례" 안내다.
// 등록이 없으면 [처음 등록], 의원이 다르면 [다시 등록] → bit.register(PC 확인 창) 뒤 다시 확인한다. 누르는 동안 단추를 막는다.
// 오류 문구는 errors.ts에서만, 원래 오류 내용은 그리지 않는다(AC-006.6).
// 기관기호는 뒤 4자리를 가리고, 옆 의원 이름은 사이트가 가진 로그인한 의원 이름(clinicName)이다(도우미는 의원 이름을 주지 않는다, AC-006.4).
// 연결 상태·결과는 화면 메모리에만 둔다(브라우저 저장소 없음)

type Checked = { result: ResultOf<'bit.check'> | null; error: string | null; at: Date | null }
const NOT_CHECKED: Checked = { result: null, error: null, at: null }

const codeOf = (e: unknown) => (e instanceof BridgeError ? e.code : 'E-BRIDGE-REJECTED')

// 안쪽 메뉴: b2b 관리자 화면 안 탭(AdminApplications)과 같은 모양(AC-034.2). 40px(폰 44px)·좌우 12px·body, 줄 아래 1px line.
// 첫 항목은 왼쪽 12px을 당겨 글자를 제목 끝에 맞춘다. 키보드 초점은 안쪽 2px accent 고리.
// 페이지 이동 링크라 tablist가 아니고 aria-current를 쓴다. 링크(a)는 손 모양이 기본이라 cursor-pointer를 넣지 않는다
const subBase =
  'relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-control px-3 text-body no-underline first:-ml-3 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
// 기본: ink-2 500, 올림 ink
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
// 지금: ink 600 + 아래 2px accent 밑줄(글자 폭, 줄 선 위에 겹침)
const subCurrent = `${subBase} font-semibold text-ink after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:bg-accent`
// 아직 없는 화면: 기본 모양 그대로, 올림 변화 없음(링크가 아니다)
const subNotReady = `${subBase} font-medium text-ink-2`
// [청구·연락]은 설정 탭이 가리키는 화면(menu.ts). 아직 없으면(null) 링크가 아니고 '준비 중'
const SETTINGS_HREF = MENU.find((m) => m.label === '설정')?.href ?? null

// 한 줄 상자(목업 '.okline'): surface·1px 선·4px(rounded-control)·안쪽 12px 16px
const line = 'flex flex-wrap items-center gap-2 rounded-control border border-line bg-surface px-4 py-3'

function SettingsSubnav() {
  return (
    <nav aria-label="설정 안 메뉴" className="flex border-b border-line">
      {SETTINGS_HREF ? (
        <Link href={SETTINGS_HREF} className={subIdle}>
          청구·연락
        </Link>
      ) : (
        <span aria-disabled="true" className={subNotReady}>
          청구·연락
          <span className={ds.chip.neutral}>준비 중</span>
        </span>
      )}
      <Link href="/claim/setup" aria-current="page" className={subCurrent}>
        비트 PC 연결
      </Link>
    </nav>
  )
}

/** 제목 '설정' → 안쪽 메뉴(사이 12px) */
function Head() {
  return (
    <div className="flex flex-col gap-3">
      <h1 className="text-title font-semibold text-ink">설정</h1>
      <SettingsSubnav />
    </div>
  )
}

/** 확장이 없을 때 맨 위 안내(시안 '.st-note'): accent-soft·4px·안쪽 12px 16px, Icon monitor(accent-strong) + 두 줄. 아래 제목까지 20px */
function PcNote() {
  return (
    <div className="mb-1 flex gap-2 rounded-control bg-accent-soft px-4 py-3 text-ink">
      <Icon name="monitor" className="mt-0.5 shrink-0 text-accent-strong" />
      <div className="min-w-0">
        <p className="text-body font-semibold">이 화면은 비트 PC의 크롬에서 열어요.</p>
        <p className="mt-0.5 text-small text-ink-2">비트 PC는 비트가 깔린 의원 PC예요. 집 PC나 휴대폰에서는 연결하지 않아도 돼요.</p>
      </div>
    </div>
  )
}

/**
 * 단계 줄(시안 '.step'): 768px 이상은 [번호 28 | 이름·설명 | 칩] 세 칸, 미만은 [번호 | 이름 → 칩 → 설명] 두 칸(칩이 이름 바로 아래).
 * 읽는 차례는 늘 이름 → 칩 → 설명이고, 칸 자리만 바꾼다. 설명은 body ink-2, 대기 단계 이름은 ink-2. 안내(guide)는 아래 넷째 줄(768px 이상 셋째 줄)
 */
function StepRow({ no, step, guide }: { no: number; step: StepView; guide: ReactNode }) {
  const { chip } = step
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3 border-b border-line py-4 last:border-b-0 last:pb-1 md:grid-cols-[28px_minmax(0,1fr)_auto]">
      <span
        aria-hidden="true"
        className="col-start-1 row-start-1 mt-px inline-grid size-5 place-items-center self-start rounded-control border border-line-strong text-caption font-semibold text-muted"
      >
        {no}
      </span>
      <h3 className={`col-start-2 row-start-1 text-body font-semibold ${step.status === 'wait' ? 'text-ink-2' : 'text-ink'}`}>
        {step.title}
      </h3>
      <div className="col-start-2 row-start-2 mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-small text-ink-2 md:col-start-3 md:row-span-2 md:row-start-1 md:mt-0 md:flex-col md:items-end md:text-right">
        <span className={ds.chip[chip.tone]}>
          {chip.icon && <Icon name={chip.icon} size={12} />}
          {chip.text}
        </span>
        {step.status === 'ok' && step.note && <span>{step.note}</span>}
      </div>
      <p className="col-start-2 row-start-3 mt-0.5 text-body text-ink-2 md:row-start-2">{step.desc}</p>
      {guide}
    </li>
  )
}

// '이 PC' 값(ui-90 design.md '이 PC 값'): 모름·없음 "아직 없어요", 됨 Icon check "맞아요"(positive 500), 문제 Icon x(negative 500)
const NONE = '아직 없어요'
const dd = 'flex min-w-0 flex-wrap items-center gap-1'
const Plain = ({ children }: { children: ReactNode }) => <dd className={`${dd} text-ink-2`}>{children}</dd>
const Good = ({ children }: { children: ReactNode }) => (
  <dd className={`${dd} font-medium text-positive`}>
    <Icon name="check" size={12} />
    {children}
  </dd>
)
const Bad = ({ children }: { children: ReactNode }) => (
  <dd className={`${dd} font-medium text-negative`}>
    <Icon name="x" size={12} />
    {children}
  </dd>
)
/** 확장·도우미 줄: 그 단계가 됐으면 맞아요, 버전이 안 맞으면 버전이 안 맞아요 */
function VersionValue({ step }: { step: StepView }) {
  if (step.status === 'ok') return <Good>맞아요</Good>
  if (isRealProblem(step)) return <Bad>버전이 안 맞아요</Bad>
  return <Plain>{NONE}</Plain>
}

export function SetupScreen({
  clinicName,
  extensionStoreUrl = EXTENSION_STORE_URL,
}: {
  /** 사이트에 등록한 로그인한 사용자의 의원 이름(me.hospital.name) */
  clinicName: string
  /** 확장 설치 주소(웹스토어 등록 전이면 null → 압축 풀린 확장 불러오기 안내) */
  extensionStoreUrl?: string | null
}) {
  const { state, hello, helloError, helperUpdateAvailable, call, retry } = useBridge()
  const [checked, setChecked] = useState<Checked>(NOT_CHECKED)
  const [working, setWorking] = useState<'check' | 'register' | null>(null)
  /** bit.register가 오류 번호로 끝났다(위 오류 상자에 보인다) */
  const [registerError, setRegisterError] = useState<string | null>(null)
  const stepsTitleId = useId()
  const pcTitleId = useId()
  const keepTitleId = useId()

  const runCheck = useCallback(async () => {
    setWorking('check')
    setRegisterError(null)
    try {
      const result = await call('bit.check', {})
      setChecked({ result, error: null, at: new Date() })
    } catch (e) {
      setChecked({ result: null, error: codeOf(e), at: new Date() })
    } finally {
      setWorking(null)
    }
  }, [call])

  // 버전을 맞춰 붙을 때마다(hello 답마다) 비트까지 한 번 확인한다
  useEffect(() => {
    if (state === 'ready' && hello) void runCheck()
  }, [state, hello, runCheck])

  const recheck = useCallback(() => {
    setRegisterError(null)
    retry()
  }, [retry])

  const register = useCallback(async () => {
    setWorking('register')
    setRegisterError(null)
    try {
      await call('bit.register', {})
    } catch (e) {
      setRegisterError(codeOf(e))
      setWorking(null)
      return
    }
    // 저장했든 확인 창에서 취소했든 다시 확인해 지금 상태를 보인다
    await runCheck()
  }, [call, runCheck])

  // 연결을 확인하는 동안은 막는다. hello가 오류 번호로 끝나 연결 중에 멈췄으면 [다시 확인]을 열어 둔다
  const disabled = working !== null || (state === 'connecting' && helloError === null)
  const steps = setupSteps({
    state,
    hello,
    helloError,
    check: checked.result,
    checkError: checked.error,
    checking: working === 'check',
  })
  const allOk = steps.every((s) => s.status === 'ok')
  const [extension, helper, , , hospital] = steps
  // 위 오류 상자: 진짜 문제 하나(그 단추를 상자로 옮긴다) 또는 방금 누른 등록이 실패한 오류.
  // 등록 오류는 5단계가 아직 등록을 기다릴 때만 보인다 — 그사이 연결이 끊기면(앞 단계가 할 차례) 그 단계 안내가 번호를 한 번만 보인다(빨강 아님)
  const problem = steps.find(isRealProblem)
  const awaitingRegister = hospital.guide === 'register' || hospital.guide === 'reregister'
  const alertCode = (awaitingRegister ? registerError : null) ?? problem?.code ?? null
  const actions = { storeUrl: extensionStoreUrl, disabled, onRetry: recheck, onRegister: () => void register() }
  const institution = state === 'ready' ? checked.result?.institutionCode : undefined

  // 다른 창에서 작업 중: 목업 화면 6처럼 가운데 카드 하나(이 창은 확장과 이야기할 수 없다)
  if (state === 'busy') {
    return (
      <div className="flex flex-col gap-4 max-md:gap-3">
        <Head />
        <BusyCard
          onRetry={recheck}
          disabled={disabled}
          outside={
            <Link href="/claim" className={`${ds.button.secondary} no-underline`}>
              건수만 보기
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      {state === 'no-extension' && <PcNote />}
      <Head />

      {alertCode && (
        <SetupAlert
          code={alertCode}
          actions={problem ? <ProblemActions kind={problem.guide} {...actions} /> : undefined}
        />
      )}

      {allOk && checked.at && (
        <div className={line}>
          <span className={ds.chip.positive}>준비됨</span>
          <span className="text-body text-ink">이 PC에서 청구 화면을 쓸 수 있어요.</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className={ds.count}>마지막 확인 {checkedAtText(checked.at)}</span>
            <Link href="/claim" className={`${ds.button.primarySmall} no-underline`}>
              청구로 가기
            </Link>
          </span>
        </div>
      )}

      {/* 새 도우미 안내 한 줄: 지금 도우미로도 그대로 쓸 수 있다 (AC-006.3, design.md 13절) */}
      {helperUpdateAvailable && (
        <div className={line}>
          <span className="text-body text-ink">새 도우미가 있어요.</span>
          <span className={ds.help}>지금 도우미로도 그대로 쓸 수 있어요.</span>
          <a
            href={HELPER_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ds.textButton} ml-auto no-underline`}
          >
            새 도우미 내려받기
          </a>
        </div>
      )}

      {/* 1024px 미만은 한 칸(minmax(0,1fr) — 줄바꿈 안 되는 칩이 칸을 밀어 넘치지 않게), 이상은 오른쪽 380px */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] max-md:gap-3">
        <section aria-labelledby={stepsTitleId} className={ds.panel}>
          <div className={ds.panelHead}>
            <h2 id={stepsTitleId} className={ds.panelTitle}>
              준비 순서
            </h2>
            <span className={ds.count}>5단계</span>
          </div>
          <div className={ds.panelBody}>
            <ol aria-labelledby={stepsTitleId} className="flex list-none flex-col">
              {steps.map((step, i) => (
                <StepRow
                  key={step.key}
                  no={i + 1}
                  step={step}
                  guide={
                    step.status === 'bad' && step.guide && !isRealProblem(step) ? (
                      <StepGuide kind={step.guide} code={step.code} {...actions} />
                    ) : null
                  }
                />
              ))}
            </ol>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          <section aria-labelledby={pcTitleId} className={ds.panel}>
            <div className={ds.panelHead}>
              <h2 id={pcTitleId} className={ds.panelTitle}>
                이 PC
              </h2>
            </div>
            <div className={ds.panelBody}>
              <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-2 text-small">
                <dt className="text-muted">크롬 확장 프로그램</dt>
                <VersionValue step={extension} />
                <dt className="text-muted">도우미</dt>
                <VersionValue step={helper} />
                <dt className="text-muted">요양기관기호</dt>
                {hospital.status === 'ok' && institution ? (
                  <Plain>{`${maskInstitution(institution)} · ${clinicName}`}</Plain>
                ) : isRealProblem(hospital) ? (
                  <Bad>등록한 번호와 달라요</Bad>
                ) : (
                  <Plain>{NONE}</Plain>
                )}
                <dt className="text-muted">마지막 확인</dt>
                <Plain>{checked.at ? checkedAtText(checked.at) : NONE}</Plain>
              </dl>
            </div>
          </section>
          <section aria-labelledby={keepTitleId} className={ds.panel}>
            <div className={ds.panelHead}>
              <h2 id={keepTitleId} className={ds.panelTitle}>
                이렇게 지켜요
              </h2>
            </div>
            <div className={ds.panelBody}>
              <ul className="grid list-disc gap-2 pl-5 text-body text-ink-2 marker:text-muted">
                <li>환자 자료는 이 PC 밖으로 나가지 않아요. 우리 사이트에는 건수와 설정만 가요.</li>
                <li>비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요.</li>
                <li>확장 프로그램과 도우미는 이 비트 PC 한 대에만 설치해요.</li>
              </ul>
            </div>
          </section>
        </div>
      </div>
    </div>
  )
}
