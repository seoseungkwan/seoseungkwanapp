'use client'

import Link from 'next/link'
import { useCallback, useEffect, useId, useState, type ReactNode } from 'react'
import { MENU } from '@/components/shell/menu'
import { ui } from '@/components/ui/classes'
import { BridgeError } from '@/lib/bridge/protocol'
import type { ResultOf } from '@/types/bridge'
import { maskInstitution } from '../maskInstitution'
import { useBridge } from '../useBridge'
import { checkedAtText } from './checkedAt'
import { EXTENSION_STORE_URL, HELPER_RELEASES_URL } from './links'
import { BusyCard, SetupAlert } from './SetupAlert'
import { StepGuide } from './StepGuide'
import { setupSteps, type StepView } from './steps'

// 설치·연결 확인 (REQ-006, 목업 화면 1 '설치·연결 확인'). 목업은 이 화면을 설정 탭 안 [비트 연결]에 그렸다 → 제목 '설정'과 안쪽 메뉴.
// 열면 hello로 버전을 맞추고, 붙으면(ready) bit.check를 불러 5단계를 ✓/✗·오류 번호로 보인다. 등록이 없으면 [처음 등록], 병원이 다르면 [다시 등록]
// → bit.register(PC 확인 창) 뒤 다시 확인한다. 누르는 동안 단추를 막는다. 오류 문구는 errors.ts에서만, 원래 오류 내용은 그리지 않는다(AC-006.6).
// 기관기호는 뒤 4자리를 가리고, 옆 병원 이름은 사이트가 가진 로그인한 병원 이름(clinicName)이다(도우미는 병원 이름을 주지 않는다, AC-006.4).
// 연결 상태·결과는 화면 메모리에만 둔다(브라우저 저장소 없음)

type Checked = { result: ResultOf<'bit.check'> | null; error: string | null; at: Date | null }
const NOT_CHECKED: Checked = { result: null, error: null, at: null }

const codeOf = (e: unknown) => (e instanceof BridgeError ? e.code : 'E-BRIDGE-REJECTED')

// 안쪽 메뉴(관리자 화면 안 탭과 같은 밑줄 모양: 40px·body, 지금은 accent 700 + 3px 밑줄)
const subBase =
  'relative inline-flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-chip px-3 text-body no-underline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11'
const subIdle = `${subBase} font-medium text-ink-2 hover:text-ink`
const subCurrent = `${subBase} font-bold text-accent after:absolute after:inset-x-2.5 after:bottom-0 after:h-0.75 after:rounded-t-xs after:bg-accent`
// 아직 없는 화면: 기본 모양 그대로, 올림 변화 없음(링크가 아니다)
const subNotReady = `${subBase} font-medium text-ink-2`
// [청구·연락]은 설정 탭이 가리키는 화면(menu.ts). 아직 없으면(null) 링크가 아니고 '준비 중'
const SETTINGS_HREF = MENU.find((m) => m.label === '설정')?.href ?? null

// 한 줄 상자(목업 '.okline'): surface·1px 선·6px·안쪽 12px 16px
const line = 'flex flex-wrap items-center gap-2.5 rounded-card border border-line bg-surface px-4 py-3'

/** 값 없음: "—"(muted), 화면 읽기는 "값 없음" */
const Empty = () => (
  <>
    <span aria-hidden="true" className="text-muted">
      —
    </span>
    <span className="sr-only">값 없음</span>
  </>
)

function SettingsSubnav() {
  return (
    <nav aria-label="설정 안 메뉴" className="flex gap-1 border-b border-line">
      {SETTINGS_HREF ? (
        <Link href={SETTINGS_HREF} className={subIdle}>
          청구·연락
        </Link>
      ) : (
        <span aria-disabled="true" className={subNotReady}>
          청구·연락
          <span className={ui.chip.waiting}>준비 중</span>
        </span>
      )}
      <Link href="/claim/setup" aria-current="page" className={subCurrent}>
        비트 연결
      </Link>
    </nav>
  )
}

function StepRow({ no, step, guide }: { no: number; step: StepView; guide: ReactNode }) {
  const wait = step.status === 'wait'
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)_auto] items-start gap-x-3.5 gap-y-1 border-b border-line py-3.5 last:border-b-0">
      <span
        aria-hidden="true"
        className="inline-grid size-6 place-items-center rounded-chip border border-line bg-canvas text-caption font-semibold text-ink-2"
      >
        {no}
      </span>
      <div className="min-w-0">
        <h3 className={`text-body font-semibold ${wait ? 'text-muted' : 'text-ink'}`}>{step.title}</h3>
        <p className={`text-table ${wait ? 'text-muted' : 'text-ink-2'}`}>{step.desc}</p>
      </div>
      <div className="flex flex-col items-end gap-1 text-right text-table text-ink-2">
        {step.status === 'ok' && (
          <>
            <span className={ui.chip.done}>
              <span aria-hidden="true">✓&nbsp;</span>완료
            </span>
            {step.note && <span>{step.note}</span>}
          </>
        )}
        {step.status === 'bad' && (
          <>
            <span className={ui.chip.rejected}>
              <span aria-hidden="true">✗&nbsp;</span>
              {step.chip}
            </span>
            {step.code && <span className="text-caption text-muted">오류 번호 {step.code}</span>}
          </>
        )}
        {step.status === 'wait' && (
          <>
            <span className={ui.chip.waiting}>대기</span>
            <span className={ui.help}>앞 단계를 먼저 해 주세요</span>
          </>
        )}
        {step.status === 'checking' && <span className={ui.chip.progress}>확인 중</span>}
      </div>
      {guide}
    </li>
  )
}

export function SetupScreen({
  clinicName,
  extensionStoreUrl = EXTENSION_STORE_URL,
}: {
  /** 사이트에 등록한 로그인한 사용자의 병원 이름(me.hospital.name) */
  clinicName: string
  /** 확장 설치 주소(웹스토어 등록 전이면 null → 압축 풀린 확장 불러오기 안내) */
  extensionStoreUrl?: string | null
}) {
  const { state, hello, helloError, helperUpdateAvailable, call, retry } = useBridge()
  const [checked, setChecked] = useState<Checked>(NOT_CHECKED)
  const [working, setWorking] = useState<'check' | 'register' | null>(null)
  /** bit.register가 오류 번호로 끝났다(위 카드에 보인다) */
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
  const problem = registerError ?? steps.find((s) => s.status === 'bad')?.code ?? null
  const institution = state === 'ready' ? checked.result?.institutionCode : undefined

  const title = <h1 className="text-title font-semibold text-ink max-md:text-title-sm">설정</h1>

  // 다른 창에서 작업 중: 목업 화면 6처럼 가운데 카드 하나(이 창은 확장과 이야기할 수 없다)
  if (state === 'busy') {
    return (
      <div className="flex flex-col gap-4 max-md:gap-3">
        {title}
        <SettingsSubnav />
        <BusyCard
          onRetry={recheck}
          disabled={disabled}
          outside={
            <Link href="/claim" className={`${ui.button.secondary} no-underline`}>
              건수만 보기
            </Link>
          }
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      {title}
      <SettingsSubnav />

      {allOk && checked.at && (
        <div className={line}>
          <span className={ui.chip.done}>준비됨</span>
          <span className="text-body text-ink">이 PC에서 청구 화면을 쓸 수 있어요.</span>
          <span className="ml-auto flex flex-wrap items-center gap-2">
            <span className={ui.count}>마지막 확인 {checkedAtText(checked.at)}</span>
            <Link href="/claim" className={`${ui.button.primarySmall} no-underline`}>
              청구로 가기
            </Link>
          </span>
        </div>
      )}
      {!allOk && problem && <SetupAlert code={problem} onRetry={recheck} disabled={disabled} />}

      {/* 확장 없는 브라우저·휴대폰일 수 있다: 밖에서 보는 건수로 (AC-006.5) */}
      {state === 'no-extension' && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={ui.help}>이 화면은 비트 PC의 크롬에서 엽니다. 집 PC나 휴대폰이라면</span>
          <Link href="/claim" className={`${ui.textButton} no-underline`}>
            건수만 보기
          </Link>
        </div>
      )}

      {/* 새 도우미 안내 한 줄: 지금 도우미로도 그대로 쓸 수 있다 (AC-006.3, design.md 13절) */}
      {helperUpdateAvailable && (
        <div className={line}>
          <span className="text-body text-ink">새 도우미가 있어요.</span>
          <span className={ui.help}>지금 도우미로도 그대로 쓸 수 있어요.</span>
          <a
            href={HELPER_RELEASES_URL}
            target="_blank"
            rel="noopener noreferrer"
            className={`${ui.textButton} ml-auto no-underline`}
          >
            새 도우미 내려받기
          </a>
        </div>
      )}

      <div className="grid min-w-0 items-start gap-4 lg:grid-cols-[minmax(0,1fr)_380px] max-md:gap-3">
        <section aria-labelledby={stepsTitleId} className={ui.panel}>
          <div className={ui.panelHead}>
            <h2 id={stepsTitleId} className={ui.panelTitle}>
              준비 순서
            </h2>
            <span className={ui.count}>5단계</span>
          </div>
          <ol aria-labelledby={stepsTitleId} className="flex list-none flex-col">
            {steps.map((step, i) => (
              <StepRow
                key={step.key}
                no={i + 1}
                step={step}
                guide={
                  step.status === 'bad' && step.guide ? (
                    <StepGuide
                      kind={step.guide}
                      code={step.code}
                      hello={hello}
                      storeUrl={extensionStoreUrl}
                      disabled={disabled}
                      onRetry={recheck}
                      onRegister={() => void register()}
                    />
                  ) : null
                }
              />
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 pt-1">
            <button type="button" className={ui.button.primary} onClick={recheck} disabled={disabled}>
              연결 다시 확인
            </button>
            <span className={ui.help}>누르면 1번부터 5번까지 다시 확인해요.</span>
          </div>
        </section>

        <div className="flex min-w-0 flex-col gap-4 max-md:gap-3">
          <section aria-labelledby={pcTitleId} className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 id={pcTitleId} className={ui.panelTitle}>
                이 PC
              </h2>
            </div>
            <dl className="grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-1 text-table">
              <dt className="text-muted">크롬 확장</dt>
              <dd className="text-ink">{hello?.extensionVersion ?? <Empty />}</dd>
              <dt className="text-muted">도우미</dt>
              <dd className="flex flex-wrap items-center gap-2 text-ink">
                {hello?.helperVersion ?? <Empty />}
                {state === 'update-helper' && <span className={ui.chip.rejected}>업데이트 필요</span>}
              </dd>
              <dt className="text-muted">요양기관기호</dt>
              <dd className="text-ink">{institution ? `${maskInstitution(institution)} · ${clinicName}` : <Empty />}</dd>
              <dt className="text-muted">마지막 확인</dt>
              <dd className="text-ink">{checked.at ? checkedAtText(checked.at) : <Empty />}</dd>
            </dl>
          </section>
          <section aria-labelledby={keepTitleId} className={ui.panel}>
            <div className={ui.panelHead}>
              <h2 id={keepTitleId} className={ui.panelTitle}>
                이렇게 지켜요
              </h2>
            </div>
            <ul className="grid list-disc gap-1 pl-4.5 text-table text-ink-2">
              <li>환자 자료는 이 PC 밖으로 나가지 않아요. 서버에는 건수와 설정만 가요.</li>
              <li>비트는 읽기만 해요. 메모를 넣을 때만 이 PC에 확인 창이 뜨고, 거기서 [확인]을 눌러야 들어가요.</li>
              <li>확장과 도우미는 이 비트 PC 한 대에만 설치해요.</li>
            </ul>
          </section>
        </div>
      </div>
    </div>
  )
}
