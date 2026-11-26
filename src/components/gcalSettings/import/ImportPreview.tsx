'use client'

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { G_COLOR_NAME, type FixNeed } from '@/lib/calendar/gshapes'
import type { GcalDeps } from '@/lib/gcal/deps'
import {
  applyImport,
  importCounts,
  importRowState,
  readImport,
  type ImportPicks,
  type ImportPreview as Preview,
  type ImportResult,
  type ImportRow,
} from '@/lib/gcal/importRead'
import type { ErrorCode } from '@/types/errors'
import { GcalNotice, useGcalNotice } from '../frame/notice'
import { countText, mdwHmOf, parseStamp } from '../frame/time'
import { BAND, BAR, CARDS, DONE, FILTER, FILTERS, HEAD, PAST_NOTE, TABLE, TABLE_HINT, type ImportFilter, type Piece } from './labels'
import { withPick } from './picks'
import { ImportRows } from './rows/ImportRows'

// 설정 › 구글 캘린더 › 처음 가져오기 미리 보기 (처음 잇기 ③) (spec google-link REQ-8530 AC-8530.1~AC-8530.4, notes-calendar `import`,
// 시안 calendar.html ?s=import·import-past, design.md 2절 표 14·12-3).
// 이 부품은 카드부터 아래 띠까지만 그린다 — 설정 머리·안 메뉴·처음 잇기 차례(①②③)는 frame(TASK-17), 묶기·페이지는 GcalSettingsScreen(TASK-23).
// 열면 lib/gcal/importRead readImport(deps)로 고른 캘린더의 지난 1년 + 앞으로를 읽는다(웹앱·구글 모두 바꾸지 않음). 카드·안내 띠·거르기 숫자는
// importCounts, 줄 상태는 importRowState, [가져오기]는 applyImport(deps, 미리 보기, 고른 것). deps는 묶음이 makeGcalDeps로 만들어 넘긴다
// (부품은 처음 그릴 때와 [다시 시도] 때만 읽는다 — deps가 그릴 때마다 새로 만들어져도 다시 읽지 않는다).
// 거르기 숫자·안내 띠 숫자는 처음 읽은 그대로(고른 것과 상관없는 자료 숫자), 카드 셋(알아봄·고쳐야 함·가져오지 않음)과 아래 띠는 고른 것을 따라 바뀐다.
// '고쳐야 할 것' 거르기는 처음에 고쳐야 했던 줄을 모두 보인다(고르거나 가져오지 않기로 해도 그 자리에 남아 되돌릴 수 있게).
// 환자 이름을 그리는 표 줄은 rows/(울타리). 데스크·보는 중(관리자)은 보기만 — 고르기·[가져오기]가 막힌다. PC 화면만(폰 전용 모양 없음)

export type ImportDone = Extract<ImportResult, { ok: true }>

export type ImportPreviewProps = {
  /** 맞춤 엔진이 받는 것(lib/gcal/deps makeGcalDeps — 구글 부르기·저장·지금 시각·병원 id) */
  deps: GcalDeps
  /** [← 시행자·종류 고치기] */
  onBack(): void
  /**
   * 가져오기가 끝났을 때(이은 날·받아 온 끝이 적힌 뒤). notice = 가져온 뒤 알림 글(이 부품도 알림을 띄운다 —
   * 묶음이 바로 다른 칸으로 옮기면 그 칸에서 이 글을 띄운다)
   */
  onDone?(done: { result: ImportDone; notice: string }): void
}

type Load = { kind: 'loading' } | { kind: 'failed'; code: ErrorCode } | { kind: 'ready'; preview: Preview }

const SHOWS: Record<ImportFilter, (row: ImportRow) => boolean> = {
  future: (row) => !row.past,
  past: (row) => row.past,
  fix: (row) => !row.known && row.parsed.type === 'fix',
  allDay: (row) => row.allDay,
}

const startOf = (row: ImportRow) => (row.parsed.type === 'appt' ? row.parsed.appt.start : row.parsed.type === 'fix' ? row.parsed.fix.start : 0)
/** 날짜 → 하루 종일 먼저 → 시작 차례(같으면 읽은 차례 그대로) */
function byWhen(a: ImportRow, b: ImportRow): number {
  if (a.day !== b.day) return a.day < b.day ? -1 : 1
  if (a.allDay !== b.allDay) return a.allDay ? -1 : 1
  return startOf(a) - startOf(b)
}

// ── 모양 ────────────────────────────────────────────────────

const CARD = 'grid min-w-0 gap-4 rounded-float border border-line bg-surface px-6 py-5'
const NOTE_BOX = 'flex items-start gap-2 rounded-control bg-accent-soft px-3 py-2.5 text-small text-ink-2'
const filterButton = (on: boolean) =>
  `h-8 cursor-pointer rounded-full border px-3 text-small whitespace-nowrap ${ds.focusRing} ${on ? 'border-ink bg-ink font-semibold text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-canvas'}`
const TAG = 'mr-1 inline-block rounded-control px-1 align-[1px] text-caption leading-4 font-semibold whitespace-nowrap'

function Pieces({ of }: { of: readonly Piece[] }) {
  return of.map((p, i) =>
    typeof p === 'string' ? (
      <Fragment key={i}>{p}</Fragment>
    ) : (
      <b key={i} className="font-semibold text-ink">
        {p.b}
      </b>
    ),
  )
}

function Card({ name, n, lines, tone = '' }: { name: keyof typeof CARD_KEYS; n: string; lines: ReactNode[]; tone?: string }) {
  return (
    <div data-card={name} className={`grid content-start gap-0.5 rounded-float border px-4 py-3 ${tone || 'border-line bg-surface'}`}>
      <span className="text-caption font-semibold text-muted">{CARD_KEYS[name]}</span>
      <span className={`text-heading-m font-semibold tabular-nums ${name === 'known' ? 'text-positive' : name === 'fix' && tone ? 'text-warning' : 'text-ink'}`}>{n}</span>
      {lines.map((line, i) => (
        <span key={i} className="text-caption text-muted">
          {line}
        </span>
      ))}
    </div>
  )
}
const CARD_KEYS = { past: CARDS.past.k, future: CARDS.future.k, known: CARDS.known.k, fix: CARDS.fix.k, skip: CARDS.skip.k }

const TITLE_ID = 'gcal-import-title'

function Head({ hint }: { hint?: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
      <h2 id={TITLE_ID} className="text-subtitle font-semibold text-ink">
        {HEAD.title}
      </h2>
      {hint && <span className="text-caption text-muted">{hint}</span>}
    </div>
  )
}

// ── 화면 ────────────────────────────────────────────────────

export function ImportPreview({ deps, onBack, onDone }: ImportPreviewProps) {
  const desk = useDesk()
  const readOnly = useReadOnly()
  const locked = desk || readOnly
  const { notice, say } = useGcalNotice()

  // 읽기는 처음과 [다시 시도] 때만(그릴 때마다 deps가 새로 와도 다시 부르지 않는다)
  const depsRef = useRef(deps)
  useEffect(() => {
    depsRef.current = deps
  })
  const [load, setLoad] = useState<Load>({ kind: 'loading' })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    let live = true
    void readImport(depsRef.current).then((r) => {
      if (live) setLoad(r.ok ? { kind: 'ready', preview: r.preview } : { kind: 'failed', code: r.code ?? 'E-SETTINGS-FAILED' })
    })
    return () => {
      live = false
    }
  }, [tries])
  const retry = () => {
    setLoad({ kind: 'loading' })
    setTries((n) => n + 1)
  }

  const preview = load.kind === 'ready' ? load.preview : null
  const [tab, setTab] = useState<ImportFilter>('future')
  const [picks, setPicks] = useState<ImportPicks>({})
  const [busy, setBusy] = useState(false)
  const busyRef = useRef(false)
  const [done, setDone] = useState(false)
  const [runError, setRunError] = useState<ErrorCode | null>(null)

  const sorted = useMemo(() => (preview ? [...preview.rows].sort(byWhen) : []), [preview])
  const shown = useMemo(() => sorted.filter(SHOWS[tab]), [sorted, tab])
  // 자료 숫자(고른 것과 상관없음): 거르기 넷·안내 띠·지난 1년 파란 상자
  const first = useMemo(() => (preview ? importCounts(preview, {}) : null), [preview])
  // 고른 것을 따르는 숫자: 카드·아래 띠·알림
  const counts = useMemo(() => (preview ? importCounts(preview, picks) : null), [preview, picks])
  const stateOf = useCallback((row: ImportRow) => importRowState(row, picks), [picks])
  const onPick = useCallback((row: ImportRow, need: FixNeed, value: string) => setPicks((prev) => withPick(prev, row.key, need, value)), [])

  if (!preview || !first || !counts) {
    return (
      <section aria-labelledby={TITLE_ID} aria-busy={load.kind === 'loading' || undefined} className={CARD}>
        <Head />
        {load.kind === 'failed' ? (
          <div className="grid justify-items-start gap-3">
            <ErrorCard code={load.code} />
            <button type="button" className={ds.button.secondary} onClick={retry}>
              {HEAD.retry}
            </button>
          </div>
        ) : (
          <p className="text-small text-muted">{HEAD.loading}</p>
        )}
      </section>
    )
  }

  const { ctx } = preview
  const readAt = parseStamp(preview.readAt) ?? deps.now()
  const n = countText
  const top = first.noStaff.pastKinds[0]
  const noStaffKinds = ctx.look.noStaffKinds.flatMap((id) => ctx.kinds.filter((k) => k.id === id).map((k) => k.name)).join(', ') || BAND.none

  const run = async () => {
    if (busyRef.current || done || locked) return
    busyRef.current = true
    setBusy(true)
    setRunError(null)
    const at = counts
    const result = await applyImport(depsRef.current, preview, picks)
    busyRef.current = false
    setBusy(false)
    if (!result.ok) {
      setRunError(result.code ?? 'E-SETTINGS-FAILED')
      return
    }
    const text = DONE(n(at.known), at.fix ? n(at.fix) : null)
    setDone(true)
    say(text)
    onDone?.({ result, notice: text })
  }

  return (
    <div className="grid min-w-0 gap-4">
      <section aria-labelledby={TITLE_ID} className={CARD}>
        <Head hint={HEAD.readAt(preview.calendarName ?? '', mdwHmOf(readAt))} />
        <p data-import-lead="" className="text-small text-ink-2">
          <Pieces of={HEAD.lead(preview.from)} />
        </p>

        <div className="grid grid-cols-5 gap-3">
          <Card name="past" n={CARDS.n(n(counts.past.total))} lines={[CARDS.split(n(counts.past.appts), n(counts.past.allDay)), CARDS.past.s2]} />
          <Card name="future" n={CARDS.n(n(counts.future.total))} lines={[CARDS.split(n(counts.future.appts), n(counts.future.allDay)), CARDS.future.s2]} />
          <Card name="known" n={CARDS.n(n(counts.known))} lines={[CARDS.known.s1, CARDS.known.s2(n(counts.guessed))]} />
          <Card name="fix" n={CARDS.n(n(counts.fix))} lines={[CARDS.fix.s1, CARDS.fix.s2]} tone={counts.fix ? 'border-warning bg-warning-soft' : ''} />
          <Card name="skip" n={CARDS.n(n(counts.skip))} lines={[CARDS.skip.s1]} />
        </div>

        <div data-nostaff-band="" className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-control border border-chart-2 bg-accent-soft px-4 py-2.5 text-small text-ink-2">
          <Icon name="info" className="shrink-0 text-accent-strong" />
          <div data-band-text="" className="min-w-0 flex-[1_1_520px]">
            <p>
              <Pieces of={BAND.line(n(first.noStaff.past), top ? { name: top.name, n: n(top.n) } : null, n(first.noStaff.future), first.noStaff.futureKinds.join(', '))} />
            </p>
            <p className="text-caption text-muted">{BAND.kinds(noStaffKinds)}</p>
          </div>
          <button type="button" className={ds.button.secondarySmall} onClick={() => setTab('fix')}>
            {BAND.onlyFix}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div role="group" aria-label={FILTER.label} className="flex flex-wrap items-center gap-1.5">
            {FILTERS.map((f) => (
              <button key={f} type="button" aria-pressed={tab === f} className={filterButton(tab === f)} onClick={() => setTab(f)}>
                {`${FILTER.name[f]} ${n(first.filters[f])}`}
              </button>
            ))}
          </div>
          <span className="flex-1" />
          <span data-legend="" className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
            <b className="font-semibold text-ink-2">{FILTER.legend}</b>
            <span>{FILTER.byTitle}</span>
            <span>
              <span className={`${TAG} bg-accent-soft text-accent-strong`}>{TABLE.tagColor}</span>
              {FILTER.byColor}
            </span>
            <span>
              <span className={`${TAG} bg-canvas text-cat-4 ring-1 ring-line ring-inset`}>{TABLE.tagSetting}</span>
              {FILTER.bySetting}
            </span>
            <span>
              <span className={`${TAG} bg-positive-soft text-positive`}>{TABLE.tagPick}</span>
              {FILTER.byPick}
            </span>
          </span>
        </div>

        {tab === 'past' && (
          <div data-past-note="" className={NOTE_BOX}>
            <Icon name="info" className="mt-0.5 shrink-0 text-accent-strong" />
            <span>
              <Pieces of={PAST_NOTE(n(first.noStaff.past))} />
            </span>
          </div>
        )}

        <ImportRows key={tab} rows={shown} today={preview.today} ctx={ctx} picks={picks} stateOf={stateOf} locked={locked} onPick={onPick} />

        <p data-table-hint="" className="text-caption text-muted">
          {TABLE_HINT(G_COLOR_NAME[ctx.look.cancel], G_COLOR_NAME[ctx.look.change])}
        </p>
      </section>

      {runError !== null && <ErrorCard code={runError} />}

      <div data-import-bar="" className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-float border border-line-strong bg-surface px-4 py-3 shadow-float">
        <p className="min-w-0 flex-[1_1_520px] text-small text-ink-2">
          <Pieces of={BAR.text(n(counts.known), counts.fix ? n(counts.fix) : null, counts.skip ? n(counts.skip) : null)} />
        </p>
        <button type="button" className={ds.button.secondary} onClick={onBack}>
          {BAR.back}
        </button>
        <button type="button" disabled={locked || done} aria-busy={busy || undefined} className={ds.button.primary} onClick={() => void run()}>
          {BAR.run}
        </button>
      </div>

      <GcalNotice notice={notice} />
    </div>
  )
}
