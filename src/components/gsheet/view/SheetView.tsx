'use client'

import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { ds } from '@/components/ui/classes'
import { addDays, addMonths, todayInKorea } from '@/lib/analytics/dates'
import { josa } from '@/lib/calendar/josa'
import type { FillOutcome } from '@/lib/gsheet/runner'
import type { FillJob, FillMode } from '@/lib/gsheet/shapes'
import { fillStatus, type FillDone, type FillStatus } from '@/lib/gsheet/status'
import type { GsheetMonth, GsheetRun, GsheetSaved, GsheetSettings } from '@/types/gsheet'
import { reloadForFrame } from './frameReload'
import { WarnIcon } from './icons'
import { VIEW } from './labels'
import { MonthPicker, monthChoices } from './MonthPicker'
import { OVERWRITE_BACK_DAYS, OverwriteDialog, overwriteStart } from './OverwriteDialog'
import { ResultLine } from './ResultLine'
import { OldVersionNotice, OpenLink, SheetBand, StopNotice } from './SheetBand'
import { bandTitle, dayOfIso, fileLink, fileName, sheetLinks, stopReason, type SheetLinks } from './sheetParts'

// 수납일지 탭 [구글 시트] 보기(spec google-link REQ-8514·8515·8541, TASK-15, 시안 notes-sunap 상태 none·sheet·filling·done·done-warn·
// newmonth·pastmonth·nobit·err-google·err-frame·overwrite). 탭 머리·페이지 잇기는 TASK-23(SunapTab)이 하고, 이 부품은 필요한 것을 props로 받는다.
// - 연결 전(none): 설정이 없거나 넣는 PC 표시(secret_tag)·원본 시트 주소가 비면 안내 4단계 + [설정 열기][안내문 보기]
// - 연결됨: 띠(SheetBand) + 알림 줄들 + 틀. 틀은 이번 달 파일의 오늘 시트(지난 달을 고르면 그 달 1일 시트 — 고른 달은 저장하지 않음)
// - 틀을 그리기 전에 한 번 frameReload(다른 주소에서 연 문서면 새로 불러옴 — /sunap CSP). 20초 안에 load가 없으면 err-frame 판(design.md 2절 표 8)
// - 넣기는 받은 onFill(job)(TASK-23이 lib/gsheet/runner runFill을 잇는다)로만. 넣기 상태·결과 줄은 lib/gsheet/status(fillStatus)를 듣고,
//   받은 서버 기록(runs)으로 fillStatus를 채운다(seed — 지금 값보다 새 것만). 넣는 PC가 아니면 넣기·덮어쓰기·설정 단추가 없다
// - 새 달 알림(newmonth): 오늘 새 달 파일을 만든 기록(counts.created) 또는 이 화면에서 넣은 답(reply.created). [확인]은 그날만(이 브라우저 localStorage에 날짜 하나)
// 환자 값은 오지 않는다(숫자·시각·파일 id·gid뿐). 시트 주소는 파일 id·gid 모양을 본 뒤에만 만든다(sheetParts)

/** 틀이 열리기(load)를 기다리는 시간(design.md 2절 표 8) */
export const FRAME_WAIT_MS = 20_000
/** 새 달 알림 [확인]을 누른 한국 날짜(이 브라우저만 — 다음 날은 저절로 안 뜸) */
export const NEW_MONTH_OK_KEY = 'ssk-gsheet-newmonth-ok'

export type SheetViewProps = {
  /** 서버 수납 시트 설정 + 넣는 PC 표시(lib/storage/gsheet loadGsheetSettings) */
  saved: GsheetSaved
  /** 달 파일 목록(lib/storage/gsheet listGsheetMonths) */
  months: readonly GsheetMonth[]
  /** 최근 넣은 기록(lib/storage/gsheet listGsheetRuns — 오늘 것은 꼭 포함). 띠·멈춤·새 달 알림이 쓴다 */
  runs: readonly GsheetRun[]
  /** 파일 이름 {병원} 자리 — 설정 '병원 이름'이 비었을 때(앱의 병원 이름) */
  hospitalName: string
  /** 함께 쓸 직원 메일 수(넣는 PC 도우미 sheet.status의 shareWith 수). 모르면 null — 새 달 알림의 공유 글을 뺀다 */
  shareCount?: number | null
  /** 손 넣기([지금 넣기]·[다시 해 보기]·[덮어쓰기…] 창) — TASK-23이 runFill을 잇는다 */
  onFill: (job: FillJob) => Promise<FillOutcome>
  /** [설정]·[설정 열기] — 탭 안 설정 화면(TASK-16) */
  onOpenSettings: () => void
  /** [안내문 보기] — 안내문(TASK-16 SheetGuide) */
  onOpenGuide: () => void
  /** 지금 시각(시험용, 기본 new Date()) */
  now?: () => Date
}

// 서버에서 그릴 때·처음 붙을 때의 넣기 상태(fillStatus 처음 값과 같다)
const SERVER_STATUS: FillStatus = {
  pc: 'unknown',
  oldHelper: false,
  oldExtension: false,
  filling: null,
  last: null,
  lastOk: null,
  stopped: null,
  result: null,
}
const serverStatus = () => SERVER_STATUS
const systemNow = () => new Date()

const FRAME_BOX = 'flex min-h-130 flex-1 flex-col overflow-clip rounded-control border border-line-strong'
const NOTICE = 'flex items-start gap-3 rounded-control px-4 py-2 text-small text-ink-2'

const isConnected = (saved: GsheetSaved) => saved.secretTag !== null && saved.settings.templateUrl.trim() !== ''

export function SheetView(props: SheetViewProps) {
  if (!isConnected(props.saved)) return <SheetNone onOpenSettings={props.onOpenSettings} onOpenGuide={props.onOpenGuide} />
  return <ConnectedView {...props} />
}

// ── 연결 전(none) ─────────────────────────────────────────

function SheetNone({ onOpenSettings, onOpenGuide }: Pick<SheetViewProps, 'onOpenSettings' | 'onOpenGuide'>) {
  return (
    <section className="grid max-w-220 gap-4 rounded-control border border-line bg-surface px-6 py-6">
      <h2 className="text-title font-semibold text-ink">{VIEW.noneHead}</h2>
      <p className="text-body text-ink-2">{VIEW.noneText}</p>
      <ol className="grid gap-2">
        {VIEW.noneSteps.map((step, i) => (
          <li key={step.title} className="grid grid-cols-[28px_minmax(0,1fr)] items-start gap-3 rounded-control border border-line bg-canvas px-4 py-3">
            <span className="grid size-7 place-items-center rounded-control bg-accent text-small font-semibold text-surface">{String(i + 1)}</span>
            <div>
              <b className="block font-semibold text-ink">{step.title}</b>
              <span className="text-small text-ink-2">{step.text}</span>
            </div>
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={onOpenSettings} className={ds.button.primary}>
          {VIEW.noneOpenSettings}
        </button>
        <button type="button" onClick={onOpenGuide} className={ds.button.secondary}>
          {VIEW.noneOpenGuide}
        </button>
      </div>
      <p className="text-caption text-muted">{VIEW.noneTip}</p>
    </section>
  )
}

// ── 새 달 알림 ─────────────────────────────────────────────

type MadeMonth = { at: string; day: string; cleaned: number; ratioFixed: number; shareFailed: number }

const countOf = (value: unknown) => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0)

/** 오늘 새 달 파일을 만든 마지막 넣기(서버 기록 또는 이 화면에서 넣은 답) */
function madeToday(runs: readonly GsheetRun[], status: FillStatus, today: string): MadeMonth | null {
  const found: MadeMonth[] = []
  for (const run of runs) {
    if (run.outcome === 'fail' || run.counts.created !== true || dayOfIso(run.at) !== today) continue
    found.push({ at: run.at, day: run.day, cleaned: countOf(run.counts.cleaned), ratioFixed: countOf(run.counts.ratioFixed), shareFailed: countOf(run.counts.shareFailed) })
  }
  for (const done of [status.last, status.lastOk, status.result] as (FillDone | null)[]) {
    const reply = done?.reply
    if (!done || !reply || done.outcome === 'fail' || !reply.created || dayOfIso(done.at) !== today) continue
    found.push({ at: done.at, day: done.day, cleaned: countOf(reply.cleaned), ratioFixed: countOf(reply.ratioFixed), shareFailed: countOf(reply.shareFailed) })
  }
  return found.reduce<MadeMonth | null>((best, one) => (best === null || Date.parse(one.at) > Date.parse(best.at) ? one : best), null)
}

function readOkDay(): string | null {
  try {
    return globalThis.localStorage?.getItem(NEW_MONTH_OK_KEY) ?? null
  } catch {
    return null
  }
}

function writeOkDay(day: string): void {
  try {
    globalThis.localStorage?.setItem(NEW_MONTH_OK_KEY, day)
  } catch {
    // 저장소가 막히면 이 화면에서만 닫는다
  }
}

type NewMonthProps = {
  made: MadeMonth
  settings: GsheetSettings
  hospital: string
  months: readonly GsheetMonth[]
  shareCount: number | null
  onOk: () => void
}

function NewMonthNotice({ made, settings, hospital, months, shareCount, onOk }: NewMonthProps) {
  const ym = made.day.slice(0, 7)
  const prevYm = addMonths(ym, -1)
  const month = Number(ym.slice(5, 7))
  const prevMonth = Number(prevYm.slice(5, 7))
  const name = fileName(settings.namePattern, hospital, ym)
  const parts = [
    ...(made.cleaned > 0 ? [VIEW.newCleaned(made.cleaned)] : []),
    ...(made.ratioFixed > 0 ? [VIEW.newRatio(made.ratioFixed)] : []),
    ...(made.shareFailed > 0 ? [VIEW.newShareFailed(made.shareFailed)] : shareCount !== null && shareCount > 0 ? [VIEW.newShared(shareCount)] : []),
  ]
  const body = [VIEW.newMade(name, josa(name, '을/를'), settings.folderUrl.trim() !== ''), ...(parts.length > 0 ? [`${parts.join(' · ')}.`] : []), VIEW.newKept(prevMonth)]
  const prevHref = fileLink(months.find((m) => m.ym === prevYm))
  return (
    <div data-testid="new-month" className={`${NOTICE} bg-accent-soft`}>
      <p className="min-w-0 flex-1">
        <b className="font-semibold text-ink">{VIEW.newHead(month)}</b> {body.join(' ')}
      </p>{' '}
      {prevHref !== null && <OpenLink href={prevHref}>{VIEW.newOpenPrev(prevMonth)}</OpenLink>}{' '}
      <button type="button" onClick={onOk} className={ds.button.secondarySmall}>
        {VIEW.newOk}
      </button>
    </div>
  )
}

// ── 틀 ────────────────────────────────────────────────────

type FrameProps = { links: SheetLinks | null; ready: boolean; month: string }

function SheetFrame({ links, ready, month }: FrameProps) {
  const [attempt, setAttempt] = useState(0)
  const [failed, setFailed] = useState(false)
  const loaded = useRef(false)
  const src = links?.frame ?? null

  useEffect(() => {
    if (!ready || src === null) return
    loaded.current = false
    const timer = setTimeout(() => {
      if (!loaded.current) setFailed(true)
    }, FRAME_WAIT_MS)
    return () => clearTimeout(timer)
  }, [ready, src, attempt])

  if (links === null) {
    return (
      <div className={`${FRAME_BOX} items-center justify-center bg-canvas`}>
        <p className="text-small text-muted">{VIEW.noFile(month)}</p>
      </div>
    )
  }

  if (failed) {
    const retry = () => {
      setFailed(false)
      setAttempt((n) => n + 1)
    }
    return (
      <div data-testid="frame-failed" className={`${FRAME_BOX} items-center justify-center bg-canvas p-4`}>
        <div className="grid w-140 max-w-full justify-items-start gap-3 rounded-float border border-line bg-surface p-6">
          <h2 className="flex items-center gap-2 text-lead font-semibold text-ink">
            <WarnIcon />
            {VIEW.frameFailHead}
          </h2>
          <p className="text-small text-ink-2">
            {VIEW.frameFailWhy} <b className="font-semibold">{VIEW.frameFailKeep}</b>
          </p>
          <ol className="list-decimal pl-5 text-small text-ink-2">
            {VIEW.frameFailSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          <div className="flex gap-2">
            <OpenLink href={links.open} primary>
              {VIEW.openNew}
            </OpenLink>{' '}
            <button type="button" onClick={retry} className={ds.button.secondarySmall}>
              {VIEW.frameRetry}
            </button>
          </div>
          <p className="text-caption text-muted">{VIEW.frameFailTip}</p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div className={`${FRAME_BOX} bg-surface`}>
        {ready && (
          <iframe
            key={attempt}
            title={VIEW.frameTitle}
            src={links.frame}
            referrerPolicy="no-referrer"
            allow="clipboard-read; clipboard-write"
            onLoad={() => {
              loaded.current = true
            }}
            className="w-full min-h-0 flex-1 border-0"
          />
        )}
      </div>
      <p className="shrink-0 text-caption text-muted">{VIEW.under}</p>
    </>
  )
}

// ── 연결됨 ─────────────────────────────────────────────────

type FillNote = { bold?: string; text: string }

function ConnectedView({ saved, months, runs, hospitalName, shareCount = null, onFill, onOpenSettings, now = systemNow }: SheetViewProps) {
  const { settings } = saved
  const status = useSyncExternalStore(fillStatus.subscribe, fillStatus.get, serverStatus)
  const today = todayInKorea(now())
  const thisMonth = today.slice(0, 7)
  // 고른 지난 달(null = 이번 달). 저장하지 않는다 — 탭을 다시 열면 이번 달
  const [picked, setPicked] = useState<string | null>(null)
  const viewMonth = picked ?? thisMonth
  const past = viewMonth !== thisMonth
  const day = past ? 1 : Number(today.slice(8, 10))
  const links = sheetLinks(
    months.find((m) => m.ym === viewMonth),
    day,
  )
  const hospital = settings.hospitalLabel.trim() || hospitalName
  const title = bandTitle(fileName(settings.namePattern, hospital, viewMonth), viewMonth)

  // 틀을 그리기 전에 한 번만 — 다른 주소에서 연 문서면 새로 불러오고 틀은 그리지 않는다
  const [ready, setReady] = useState(false)
  const asked = useRef(false)
  useEffect(() => {
    if (asked.current) return
    asked.current = true
    if (!reloadForFrame()) setReady(true)
  }, [])

  // 서버 기록으로 넣기 상태를 채운다(지금 값보다 새 것만 — 이 쪽에서 넣은 결과를 덮지 않음)
  useEffect(() => {
    fillStatus.seed(runs)
  }, [runs])

  // 새 달 알림 [확인]을 누른 날(처음 붙은 뒤 이 브라우저 저장소에서 읽음)
  const [okDay, setOkDay] = useState<string | null>(null)
  useEffect(() => {
    setOkDay(readOkDay())
  }, [])
  const made = madeToday(runs, status, today)
  const dismissNewMonth = () => {
    writeOkDay(today)
    setOkDay(today)
  }

  const [note, setNote] = useState<FillNote | null>(null)
  const [dialogStart, setDialogStart] = useState<string | null>(null)

  const fill = async (job: FillJob) => {
    setNote(null)
    let outcome: FillOutcome
    try {
      outcome = await onFill(job)
    } catch {
      return // runFill은 던지지 않는다. 그래도 던지면 상태는 fillStatus가 보인다
    }
    if (outcome.kind === 'busy') setNote({ text: VIEW.busy })
    else if (outcome.kind === 'unreachable') {
      const why = stopReason(outcome.code)
      setNote({ bold: why.band, text: why.fix })
    }
  }
  const fillToday = () => void fill({ day: today, mode: 'fillEmpty', via: 'hand', auto: false })
  const pickOverwrite = (pickedDay: string, mode: FillMode) => {
    setDialogStart(null)
    void fill({ day: pickedDay, mode, via: 'hand', auto: false })
  }

  const filler = status.pc === 'filler'
  const picker = (
    <MonthPicker
      choices={monthChoices(thisMonth, months)}
      current={viewMonth}
      thisMonth={thisMonth}
      onPick={(ym) => setPicked(ym === thisMonth ? null : ym)}
    />
  )

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <SheetBand
        title={title}
        picker={picker}
        day={day}
        status={status}
        autoOn={settings.autoOn}
        everyMin={settings.everyMin}
        today={today}
        openHref={links?.open ?? null}
        onFillNow={fillToday}
        onOverwrite={() => setDialogStart(overwriteStart(viewMonth, today))}
        onOpenSettings={onOpenSettings}
      />
      {!filler && <OldVersionNotice helper={status.oldHelper} extension={status.oldExtension} />}
      {note && (
        <p data-testid="fill-note" role="status" className="rounded-control bg-warning-soft px-4 py-2 text-small text-ink-2">
          {note.bold && <b className="font-semibold text-ink">{note.bold}</b>}
          {note.bold && ' '}
          {note.text}
        </p>
      )}
      {filler && status.stopped && !status.filling && <StopNotice stopped={status.stopped} lastOk={status.lastOk} today={today} />}
      {status.result && <ResultLine done={status.result} onClose={fillStatus.dismissResult} />}
      {past && (
        <div data-testid="past-month" className={`${NOTICE} items-center bg-warning-soft`}>
          <p className="min-w-0 flex-1">
            <b className="font-semibold text-ink">{VIEW.pastHead}</b>
            {VIEW.pastText(Number(viewMonth.slice(5, 7)))}
          </p>{' '}
          <button type="button" onClick={() => setPicked(null)} className={ds.button.primarySmall}>
            {VIEW.backToThisMonth}
          </button>
        </div>
      )}
      {made && okDay !== today && (
        <NewMonthNotice made={made} settings={settings} hospital={hospital} months={months} shareCount={shareCount} onOk={dismissNewMonth} />
      )}
      <SheetFrame key={links?.frame ?? viewMonth} links={links} ready={ready} month={viewMonth} />
      {dialogStart !== null && (
        <OverwriteDialog
          start={dialogStart}
          today={today}
          min={addDays(today, -OVERWRITE_BACK_DAYS)}
          onCancel={() => setDialogStart(null)}
          onPick={pickOverwrite}
        />
      )}
    </div>
  )
}
