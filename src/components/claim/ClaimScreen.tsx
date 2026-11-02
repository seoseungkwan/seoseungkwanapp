'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ds } from '@/components/ui/classes'
import { addDays, todayInKorea } from '@/lib/analytics/dates'
import { BridgeError } from '@/lib/bridge/protocol'
import { settingsChanged, type SettingsBundle } from '@/lib/precheck/settingsChanged'
import { readDayCounts, type ClaimDayCount } from '@/lib/storage/claimCounts'
import { readHospitalSettings, readRuleSettings } from '@/lib/storage/claimSettings'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { DateRange } from '@/types/dates'
import type { CheckSettings } from '@/types/precheck'
import { ClaimError, ExcelError, SetupLink } from './ClaimError'
import { runClaimCheck, runClaimExcel, runClaimLoad, type CheckedClaim, type ClaimChannel, type ClaimOwner } from './claimLoad'
import { buildDateList, dayLabel, defaultPeriod, listRange } from './dateList'
import { DateStep, type DatesState, type LoadingStep } from './DateStep'
import { ResultStep } from './ResultStep'
import { SettingsChangedBanner } from './SettingsChangedBanner'
import { checkedAtText } from './setup/checkedAt'
import type { UseBridge } from './useBridge'

// 청구 화면(REQ-013, 목업 화면 2·3): 날짜 고르기 → 자료 불러오기 → 점검 결과. 차례와 번호는 claimLoad.ts, 계산은 Worker, 환자 줄은 rows/가 맡는다.
// 환자 글자는 Worker가 보낸 보기 모양(ClaimView)으로만 이 탭 메모리에 있다. 저장소·주소·제목·로그·오류 카드에 두지 않는다.
// 다른 탭에 다녀와도 결과가 남는다(AC-013.6): 결과가 있으면 떠날 때 달을 버리지 않고 결과·기간·단계를 ClaimChannel에 맡긴다(types/precheck.ts 약속 1). 돌아오면 같은 사람·같은 의원인지 본 뒤에만 그린다.
// 결과 없이 떠나면(불러오는 중 포함) Worker의 달을 버린다. 로그아웃은 전체 페이지 이동이라 메모리와 Worker가 함께 사라진다.
// TASK-18이 잇는 곳: 메모 칸과 [비트에 입력]은 Flow의 3~5단계와 결과 화면 아래에 더한다. settingsStale이 참이면 [비트에 입력]을 막는다(design.md 6-5),
// 진료의 메모는 view.visits[].memo에, 메모를 못 만든 까닭은 view.memoBlocked에 이미 있고, 다시 불러오기 번호(run)는 claimLoad.ts에 더한다

const NO_TEMPLATES: SettingsBundle['templates'] = [] // 문자 문구는 TASK-25가 잇는다
const bundle = (settings: CheckSettings): SettingsBundle => ({ ...settings, templates: NO_TEMPLATES })

/** 서버 설정. 읽지 못하면 null이다: Worker가 도우미 사본으로 점검한다(AC-013.9). 원래 오류는 버린다 */
async function readServerSettings(): Promise<CheckSettings | null> {
  try {
    const sb = supabaseBrowser()
    const [rules, hospital] = await Promise.all([readRuleSettings(sb), readHospitalSettings(sb)])
    return { rules, phrases: hospital?.phrases ?? null, dxLinks: hospital?.dxLinks ?? [] }
  } catch {
    return null
  }
}

/** 지금 누구인가: 로그인한 사람과 도우미에 등록한 기관기호(도우미는 병원 이름을 주지 않는다). 하나라도 모르면 null이다. 기관기호는 등록 파일 값이라 비트가 다른 의원이어도 오므로 단계가 하나라도 안 됐으면 모르는 것이다(AC-005.7) */
async function readOwner(call: UseBridge['call']): Promise<ClaimOwner | null> {
  try {
    const [{ data }, check] = await Promise.all([supabaseBrowser().auth.getSession(), call('bit.check', {})])
    const user = data.session?.user.id
    return user && check.institutionCode && check.steps.every((step) => step.ok) ? { user, institution: check.institutionCode } : null
  } catch {
    return null
  }
}

const codeOf = (error: unknown) => (error instanceof BridgeError ? error.code : 'E-BRIDGE-REJECTED')

/** Worker가 만든 엑셀 바이트를 그 PC에 파일로 내려받는다(AC-013.4). 서버로 가지 않는다 */
function saveFile(bytes: ArrayBuffer, name: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1_000)
}

type Run = { kind: 'idle' } | { kind: 'loading'; step: LoadingStep } | { kind: 'failed'; code: string; visible: DateRange; stuckMonth?: true }

function Flow({ page, hasResult, onPage }: { page: 'dates' | 'result'; hasResult: boolean; onPage(next: 'dates' | 'result'): void }) {
  const step = (name: 'dates' | 'result', no: number, label: string, enabled: boolean) => (
    <li>
      <button
        type="button"
        disabled={!enabled}
        aria-current={page === name ? 'step' : undefined}
        className={`inline-flex cursor-pointer items-center gap-1.5 rounded-control text-small text-muted aria-[current=step]:font-semibold aria-[current=step]:text-ink disabled:cursor-not-allowed ${ds.focusRing} max-md:min-h-11`}
        onClick={() => onPage(name)}
      >
        <span aria-hidden="true" className="inline-flex size-5 items-center justify-center rounded-control border border-line text-caption">
          {no}
        </span>
        {label}
      </button>
    </li>
  )
  return (
    <ol className="flex list-none flex-wrap items-center gap-3">
      {step('dates', 1, '날짜 고르기', true)}
      {step('result', 2, '점검 결과', hasResult)}
    </ol>
  )
}

export function ClaimScreen({ channel, call, stream }: { channel: ClaimChannel; call: UseBridge['call']; stream: UseBridge['stream'] }) {
  const [dates, setDates] = useState<DatesState>({ kind: 'loading' })
  const [period, setPeriod] = useState<DateRange>({ from: '', to: '' })
  const [page, setPage] = useState<'dates' | 'result'>('dates')
  const [run, setRun] = useState<Run>({ kind: 'idle' })
  const [result, setResult] = useState<CheckedClaim | null>(null)
  const [settingsStale, setSettingsStale] = useState(false)
  const [rechecking, setRechecking] = useState(false)
  const [excelBusy, setExcelBusy] = useState(false)
  const [excelError, setExcelError] = useState<string | null>(null)
  /** 맡긴 결과가 있어 누구 것인지 보는 중. 그동안 환자 글자를 그리지 않는다 */
  const [verifying, setVerifying] = useState(() => channel.kept() !== null)
  const onScreen = useRef(true)
  /** 돌아와서 되살린 결과에 쓴 설정. 앱 안에서 돌아오면 창 초점 사건이 없어 그때 한 번 읽어 견준다 */
  const restoredUsed = useRef<CheckSettings | null>(null)

  const loadDates = useCallback(async () => {
    const today = todayInKorea()
    let counts: ClaimDayCount[] = []
    let countsFailed = false
    try {
      counts = await readDayCounts(supabaseBrowser(), addDays(today, -399), today)
    } catch {
      countsFailed = true
    }
    try {
      const { days } = await call('claim.dates', listRange(today, counts))
      const rows = buildDateList(days, counts)
      setDates({ kind: 'ready', rows, countsFailed })
      setPeriod((now) => (now.from || now.to ? now : defaultPeriod(rows, today)))
    } catch (error) {
      setDates({ kind: 'failed', code: codeOf(error) })
    }
  }, [call])

  useEffect(() => {
    void loadDates()
  }, [loadDates])

  // 맡긴 결과가 없으면 떠날 때 Worker의 달을 버린다: 불러오는 중이면 멈춘다. 다시 와도 [자료 불러오기]로 새로 받는다(번호는 Worker 하나에 하나라 되풀이되지 않는다, AC-013.12)
  useEffect(() => {
    onScreen.current = true
    return () => {
      onScreen.current = false
      if (!channel.kept()) channel.drop()
    }
  }, [channel])

  /** 점검(AC-013.14). 설정은 그때 읽는다: 못 읽으면 null로 물어 Worker가 사본을 쓴다(AC-013.9). 실패하면 옛 결과를 보이지 않는다(AC-013.5). 떠나 있는 동안 답이 와도 맡긴 결과에 반영한다 */
  const runCheck = useCallback(
    async (load: number, visible: DateRange, owner: ClaimOwner | null) => {
      const settings = await readServerSettings()
      if (!onScreen.current) return // 떠난 뒤에는 새 번호를 받지 않는다. 맡긴 결과와 띠가 그대로라 돌아와 다시 누르면 된다
      const checked = await runClaimCheck(channel, load, visible, settings)
      if (checked.status === 'replaced') return
      if (checked.status === 'failed') {
        channel.keep(null)
        if (!onScreen.current) channel.drop()
        setResult(null)
        setSettingsStale(false)
        setPage('dates')
        setRun({ kind: 'failed', code: checked.code, visible })
        return
      }
      const next: CheckedClaim = { load, check: checked.check, visible, view: checked.view, at: new Date(), used: checked.usedCopy ?? settings, usedCopy: checked.usedCopy !== null, owner }
      if (owner) channel.keep({ result: next, period: channel.kept()?.period ?? visible, page: 'result', stale: false })
      setResult(next)
      setSettingsStale(false)
      setExcelError(null)
      setRun({ kind: 'idle' })
      setPage('result')
    },
    [channel],
  )

  /** [자료 불러오기]·[다시 불러오기](AC-013.2). 모두 끝나고 답을 확인한 뒤에만 점검한다 */
  async function load(visible: DateRange) {
    setResult(null)
    setSettingsStale(false)
    setExcelError(null)
    setPage('dates')
    setRun({ kind: 'loading', step: 'month' })
    const loaded = await runClaimLoad(channel, stream, visible, (step) => setRun({ kind: 'loading', step }))
    if (loaded.status === 'replaced') return
    if (loaded.status === 'failed') {
      setRun({ kind: 'failed', code: loaded.code, visible, stuckMonth: loaded.stuckMonth })
      return
    }
    setRun({ kind: 'loading', step: 'check' })
    await runCheck(loaded.load, visible, await readOwner(call))
  }

  /** [다시 점검](AC-013.6): 달은 그대로 두고 새 설정으로만 다시 점검한다 */
  const recheck = useCallback(
    async (target: CheckedClaim) => {
      setRechecking(true)
      await runCheck(target.load, target.visible, target.owner)
      setRechecking(false)
    },
    [runCheck],
  )

  /** [엑셀 내려받기](AC-013.4) */
  async function downloadExcel() {
    if (!result || excelBusy) return
    setExcelBusy(true)
    setExcelError(null)
    const answer = await runClaimExcel(channel, result.check)
    setExcelBusy(false)
    if (answer.ok) saveFile(answer.bytes, answer.fileName)
    else setExcelError(answer.code)
  }

  // 돌아왔을 때: 같은 사람·같은 의원이 아니면(모를 때도) 맡긴 결과를 보이지 않고 Worker의 달도 버린다. 달은 다시 읽지 않는다
  useEffect(() => {
    if (!channel.kept()) {
      setVerifying(false)
      return
    }
    let alive = true
    void readOwner(call).then((now) => {
      if (!alive) return
      const kept = channel.kept() // 확인하는 사이 떠나기 전의 [다시 점검] 답이 왔을 수 있다
      setVerifying(false)
      if (!kept) return
      if (!now || now.user !== kept.result.owner?.user || now.institution !== kept.result.owner.institution) {
        channel.drop()
        return
      }
      restoredUsed.current = kept.result.used
      setResult(kept.result)
      setPeriod(kept.period)
      setPage(kept.page)
      setSettingsStale(kept.stale)
      // 떠나기 전의 [다시 점검] 답을 아직 못 받았으면 이 화면에서 다시 물어 마지막 답을 받는다(엑셀은 마지막 번호로만 된다)
      if (channel.lastCheck() !== kept.result.check) {
        channel.nextCheck() // 옛 답을 지금 버린다. 옛 답이 실패여도 달을 버리지 않게
        void recheck(kept.result)
      }
    })
    return () => {
      alive = false
    }
  }, [channel, call, recheck])

  // 결과가 있는 동안 기간·단계·띠를 맡겨 둔다(AC-013.6). 누구 것인지 모르는 결과는 남기지 않는다
  useEffect(() => {
    if (result?.owner) channel.keep({ result, period, page, stale: settingsStale })
  }, [channel, result, period, page, settingsStale])

  // 창 초점이 돌아오면, 그리고 탭을 옮겼다 돌아오면 한 번, 서버 설정을 다시 읽어 점검에 쓴 설정과 견준다(AC-013.6, design.md 6-5). 읽지 못하면 그대로 둔다
  const used = result?.used ?? null
  useEffect(() => {
    if (!used) return
    let alive = true
    const compare = () => {
      void readServerSettings().then((fresh) => {
        if (alive && fresh) setSettingsStale(settingsChanged(bundle(used), bundle(fresh)))
      })
    }
    if (used === restoredUsed.current) compare()
    window.addEventListener('focus', compare)
    return () => {
      alive = false
      window.removeEventListener('focus', compare)
    }
  }, [used])

  const showResult = page === 'result' && result !== null
  const view = result?.view
  const hasFindings = (view?.groups.length ?? 0) > 0

  if (verifying) return <p className="text-small text-muted">지난 점검 결과를 확인하는 중이에요…</p>

  return (
    <div className="flex flex-col gap-4 max-md:gap-3">
      <Flow page={showResult ? 'result' : 'dates'} hasResult={result !== null} onPage={setPage} />

      {run.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ClaimError code={run.code} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.primarySmall} onClick={() => void load(run.visible)}>
              다시 불러오기
            </button>
            {!run.stuckMonth && <SetupLink code={run.code} />}
          </div>
        </div>
      )}

      {!showResult && (
        <DateStep
          dates={dates}
          period={period}
          onPeriod={setPeriod}
          loading={run.kind === 'loading' ? run.step : null}
          onLoad={() => void load(period)}
          onStop={() => {
            channel.drop()
            setRun({ kind: 'idle' })
          }}
          onRetryDates={() => {
            setDates({ kind: 'loading' })
            void loadDates()
          }}
        />
      )}

      {showResult && view && (
        <>
          {settingsStale && <SettingsChangedBanner onRecheck={() => void recheck(result)} busy={rechecking} />}
          {result.usedCopy && (
            <p role="status" className="rounded-control bg-canvas px-4 py-3 text-small text-ink-2">
              서버에 닿지 않아 마지막으로 받은 설정을 씁니다
            </p>
          )}
          {excelError && <ExcelError code={excelError} />}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-small text-ink-2">
              {dayLabel(view.period.from)} ~ {dayLabel(view.period.to)} · 환자 {view.visits.length}명 · {checkedAtText(result.at).slice(-5)}에 점검함 · 켜진 규칙 {view.enabledRules}개
            </p>
            <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} disabled={!hasFindings} aria-busy={excelBusy || undefined} onClick={() => void downloadExcel()}>
              {excelBusy ? '만드는 중…' : '엑셀 내려받기'}
            </button>
          </div>
          <ResultStep visits={view.visits} groups={view.groups} hasDx={view.hasDx} />
        </>
      )}
    </div>
  )
}
