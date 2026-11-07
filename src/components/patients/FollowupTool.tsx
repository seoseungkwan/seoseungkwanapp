'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { addDays, isYmd } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { DEFAULT_TEMPLATES, type TemplateKind } from '@/lib/patientMessages/defaults'
import { fillTemplate } from '@/lib/patientMessages/fill'
import { readTemplates, type MessageTemplate } from '@/lib/storage/messageTemplates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { FilteredFollowup, FollowupFilters, FollowupView, VisitKind } from '@/types/patients'
import { CopyButton, CopyNoticeLine, type CopyNotice } from './CopyButton'
import { customRange, dayLabel, presetRange, rangeLabel, type PeriodPreset } from './periods'
import { CheckMark, ErrorLine, FollowupRows, UndecidedRows } from './rows/FollowupRows'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// F/U 명단 도구(AC-611.1~611.4, 목업 fuTool). 화면은 거르지 않고 복사 글도 만들지 않는다: 고른 값을 filter로 보내 Worker가 거른 줄·복사 글을 받는다.
// 환자 값(이름·전화·차트번호)은 rows/FollowupRows가 props로만 그린다. 여기서는 그리지 않는다. 복사 글은 Worker가 준 그대로 클립보드로만 간다.
// 연락 표시는 Worker → 도우미 저장으로만 간다(브라우저 저장소 없음). store.load는 부르지 않고, reload는 사용자가 [다시 불러오기]를 누를 때만 부른다(AC-604.8)

const EMPTY = '이 기간에 오실 분이 없어요. 기간을 바꾸거나 ‘조건부 포함’ · ‘지난 예정 포함’을 켜 보세요.'
const TEMPLATES_FAILED = '문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.'
const NO_TEMPLATE = '복사할 문구가 없어요. 문자 문구에서 먼저 만들어 주세요.'
const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
const MARKS_BLOCKED = '연락 표시를 불러오지 못해 [연락함]을 쓸 수 없어요.'

// 연락 표시를 못 불러왔을 때의 글. 까닭은 errors.ts 글을 그대로 쓴다. 글이 없는 번호(도우미가 새로 준 번호)는 번호만 보인다
function marksBlockedText(code: string): string {
  if (!isErrorCode(code)) return MARKS_BLOCKED
  const { what, fix } = errorInfo(code)
  return `${MARKS_BLOCKED} ${what}. ${fix}`
}

const PRESETS: readonly (readonly [PeriodPreset, string])[] = [
  ['tomorrow', '내일'],
  ['thisWeek', '이번 주'],
  ['nextWeek', '다음 주'],
  ['custom', '직접'],
]
const KINDS: readonly (readonly ['' | VisitKind, string])[] = [
  ['', '전체'],
  ['주사', '주사'],
  ['F/U', 'F/U'],
]
// F/U 명단은 주사 안내·진료 안내만 복사한다. 예약 안내는 예약 문자 명단에서만 쓴다(AC-2805.4)
type FollowupTemplateKind = Exclude<TemplateKind, 'reservation'>
const TEMPLATE_KINDS: readonly (readonly [FollowupTemplateKind, string])[] = [
  ['injection', '주사 안내'],
  ['followup', '진료 안내'],
]

// 고르기 줄(목업 .flt·.fg·.acts·.ag). 휴대폰은 한 칸씩 쌓는다
const FILTER_BAR = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4 max-md:grid max-md:gap-3'
const FIELD = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1.5'
const FIELD_ROW = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:gap-x-4 max-md:gap-y-0'
const FIELD_NAME = 'whitespace-nowrap text-small font-semibold text-ink'
const RANGE = 'whitespace-nowrap text-small text-muted'
const ACTIONS = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 max-md:grid max-md:gap-3'
const ACTION_GROUP = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1'
const DATE_FIELD = 'w-40 max-md:w-full'

// 기간 단추 묶음(목업 .seg, 대시보드 기간 단추와 같은 모양). 휴대폰은 칸이 같은 폭으로 줄을 채운다
const SEG_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:auto-cols-fr max-md:grid-flow-col'
const SEG_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-2'
const SEG_ON = 'bg-accent-soft font-semibold text-accent-strong'
const SEG_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

function Segments<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange(next: T): void }) {
  return (
    <div role="group" aria-label={label} className={SEG_GROUP}>
      {options.map(([option, text]) => (
        <button key={option} type="button" aria-pressed={option === value} onClick={() => onChange(option)} className={`${SEG_BUTTON} ${option === value ? SEG_ON : SEG_OFF}`}>
          {text}
        </button>
      ))}
    </div>
  )
}

function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
  return (
    <label className="inline-flex cursor-pointer items-center gap-2 whitespace-nowrap text-small text-ink max-md:min-h-11">
      <span className={ds.checkboxWrap}>
        <input type="checkbox" className={ds.checkbox} checked={checked} onChange={(event) => onChange(event.target.checked)} />
        <CheckMark />
      </span>
      {label}
    </label>
  )
}

/**
 * 날짜 칸 값 둘: 칸에 보이는 글자(text)와 쓰는 날짜(valid). 크롬 날짜 칸은 연도 첫 자리를 치는 순간 0002-11-02 같은 값을 낸다.
 * 이런 값은 쓰지 않고(fillTemplate이 던진다) 글자만 둔다. 글자까지 되돌리면 연도를 칠 수 없다. 칸을 떠나면 쓰는 날짜로 맞춘다
 */
function useDayField(initial: string) {
  const [text, setText] = useState(initial)
  const [valid, setValid] = useState(initial)
  const change = (next: string) => {
    setText(next)
    if (isYmd(next)) setValid(next)
  }
  return { text, valid, change, settle: () => setText(valid) }
}

function DayInput({ label, field }: { label: string; field: ReturnType<typeof useDayField> }) {
  const id = useId()
  return (
    <span className={DATE_FIELD}>
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <input id={id} type="date" className={ds.input} value={field.text} onChange={(event) => field.change(event.target.value)} onBlur={field.settle} />
    </span>
  )
}

type Templates = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; rows: readonly MessageTemplate[] }
type Listed = Pick<FilteredFollowup, 'rows' | 'undecided' | 'copy'>

/** 문구를 읽어 둔다. active일 때만 읽고, 열릴 때마다 다시 읽는다(문자 문구 도구에서 고친 글을 복사해야 한다). retry는 문구만 다시 읽는다(명단을 다시 읽지 않는다) */
function useTemplates(active: boolean) {
  const [templates, setTemplates] = useState<Templates>({ state: 'loading' })
  const [tries, setTries] = useState(0)
  useEffect(() => {
    if (!active) return
    let live = true
    setTemplates({ state: 'loading' })
    // supabaseBrowser가 던져도 같은 실패다. 읽기 실패를 빈 목록으로 바꾸지 않는다(기본 문구로 대신하게 된다)
    Promise.resolve()
      .then(() => readTemplates(supabaseBrowser()))
      .then(
        (rows) => {
          if (live) setTemplates({ state: 'ready', rows })
        },
        () => {
          if (live) setTemplates({ state: 'failed' })
        },
      )
    return () => {
      live = false
    }
  }, [active, tries])
  return { templates, retry: () => setTries((n) => n + 1) }
}

export function FollowupTool({
  view,
  storeCode,
  active,
  post,
  listen,
  reload,
  head,
}: {
  view: FollowupView
  /** store.load 실패 번호: 연락 표시를 못 불러오면(marksLoaded 거짓) Worker가 views.codes.recall에 싣는다 */
  storeCode?: string
  /** 지금 보이는 도구인가. 다른 도구로 가도 살아 있어 고른 값·저장 답을 잃지 않는다 */
  active: boolean
  post(message: ToolRequest): void
  listen(listener: (message: ToolReply) => void): () => void
  /** [다시 불러오기] 누름에만 부른다 */
  reload(): void
  /** 도구 머리. 오른쪽에 놓을 요약을 받는다 */
  head(summary: ReactNode): ReactNode
}) {
  // 이 명단을 읽은 날(이 흐름의 today). 읽는 사이 자정이 지나도 plan·build와 같은 날을 본다
  const today = view.read.to

  const [preset, setPreset] = useState<PeriodPreset>('tomorrow')
  const customFrom = useDayField(addDays(today, 1))
  const customTo = useDayField(addDays(today, 7))
  const [includeCond, setIncludeCond] = useState(false)
  const [includePast, setIncludePast] = useState(false)
  const [kind, setKind] = useState<'' | VisitKind>('')
  const [withDate, setWithDate] = useState(true)
  const [templateKind, setTemplateKind] = useState<FollowupTemplateKind>('injection')

  const range = preset === 'custom' ? customRange(customFrom.valid, customTo.valid) : presetRange(preset, today)
  const { from, to } = range
  const filters = useMemo<FollowupFilters>(() => ({ kind, from, to, includeCond, includePast }), [kind, from, to, includeCond, includePast])

  const [listed, setListed] = useState<Listed | null>(null)
  // 답을 기다리는 filter 수. 고르기를 바꾼 뒤 답이 오기 전에는 옛 기간의 글을 복사하지 못하게 막는다. Worker는 보낸 차례로 답한다
  const askedFilters = useRef(0)
  const [waiting, setWaiting] = useState(true)
  // 저장 답을 기다리는 줄 → 보낸 값
  const sentMarks = useRef(new Map<string, boolean>())
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())
  const [markErrors, setMarkErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const [notice, setNotice] = useState<CopyNotice>(null)
  const { templates, retry } = useTemplates(active)

  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'filtered') {
          if (message.tool !== 'followup') return
          askedFilters.current = Math.max(0, askedFilters.current - 1)
          setListed({ rows: message.rows, undecided: message.undecided, copy: message.copy })
          setWaiting(askedFilters.current > 0)
          return
        }
        const on = sentMarks.current.get(message.key)
        if (on === undefined) return
        sentMarks.current.delete(message.key)
        setBusyKeys(new Set(sentMarks.current.keys()))
        if (message.ok) {
          // 뒤따르는 views로 Worker에 다시 묻기 전까지 줄이 잠깐 되돌아 보이지 않게 한다
          setListed((prev) => prev && { ...prev, rows: prev.rows.map((row) => (row.key === message.key ? { ...row, contacted: on } : row)) })
        } else {
          setMarkErrors((prev) => new Map(prev).set(message.key, message.code ?? 'E-STORE-FAILED'))
        }
      }),
    [listen],
  )

  // 고르기가 바뀌거나 표시가 바뀌어(view) 새 보기 모양이 오면 Worker에 다시 묻는다
  useEffect(() => {
    askedFilters.current += 1
    setWaiting(true)
    post({ type: 'filter', tool: 'followup', filters })
  }, [post, filters, view])

  // 다른 도구로 가면 복사 결과 줄을 지운다(목업 setTool)
  useEffect(() => {
    if (!active) setNotice(null)
  }, [active])

  // 복사할 글이 없다는 줄은 지금 고른 것을 말하므로 고른 것이 바뀌면 지운다. '복사했어요'·복사 실패 줄은 지난 누름의 결과라 그대로 맞는 말이다(목업)
  useEffect(() => {
    setNotice((prev) => (prev?.text === NO_PHONES ? null : prev))
  }, [filters])
  useEffect(() => {
    setNotice((prev) => (prev?.text === NO_TEMPLATE ? null : prev))
  }, [templateKind])

  const mark = useCallback(
    (key: string, on: boolean) => {
      // 기다리는 그 줄만 다시 보내지 않는다. 다른 줄은 막지 않는다: Worker가 저장을 차례로 보낸다(AC-604.4)
      if (sentMarks.current.has(key)) return
      sentMarks.current.set(key, on)
      setBusyKeys(new Set(sentMarks.current.keys()))
      setMarkErrors((prev) => {
        if (!prev.has(key)) return prev
        const next = new Map(prev)
        next.delete(key)
        return next
      })
      post({ type: 'mark', key, on, today })
    },
    [post, today],
  )

  const rows = listed?.rows ?? []
  const marksBlocked = !view.marksLoaded
  // 복사 글은 전화 자료가 있으면 번호 없는 분을 뺀다(pasteRows). 알리는 수도 복사된 수다
  const copiedCount = view.phoneLoaded ? rows.filter((row) => row.phone.trim()).length : rows.length
  const listText = (withDate ? listed?.copy.listWithDate : listed?.copy.list) ?? ''

  const summary = listed && (
    <p className="whitespace-nowrap text-small text-muted">
      <b className="font-semibold text-ink">{rows.length}명</b>
      {/* 표시를 못 불러오면 연락했는지 모른다 */}
      {!marksBlocked && ` · 아직 연락 안 한 분 ${rows.filter((row) => !row.contacted).length}명`}
    </p>
  )

  const templateRows = templates.state === 'ready' ? (templates.rows.length ? templates.rows : DEFAULT_TEMPLATES) : []
  const template = templateRows.find((row) => row.kind === templateKind)
  const marksCode = storeCode ?? 'E-STORE-FAILED'

  return (
    <>
      {head(summary)}

      <div className={FILTER_BAR}>
        <div className={FIELD}>
          <span className={FIELD_NAME}>기간</span>
          <Segments<PeriodPreset> label="기간" options={PRESETS} value={preset} onChange={setPreset} />
          <span className={RANGE}>{rangeLabel(range)}</span>
        </div>
        {preset === 'custom' && (
          <div className={FIELD}>
            <DayInput label="시작 날짜" field={customFrom} />
            <span className={RANGE}>~</span>
            <DayInput label="끝 날짜" field={customTo} />
          </div>
        )}
        <div className={FIELD_ROW}>
          <Check label="조건부 포함" checked={includeCond} onChange={setIncludeCond} />
          <Check label="지난 예정 포함" checked={includePast} onChange={setIncludePast} />
        </div>
        <div className={FIELD}>
          <span className={FIELD_NAME}>구분</span>
          <Segments<'' | VisitKind> label="구분" options={KINDS} value={kind} onChange={setKind} />
        </div>
      </div>
      <p className="mt-2 text-caption text-muted">조건부: ‘아프면 오세요’처럼 조건을 달아 둔 분 · 지난 예정: 날짜가 지났는데 아직 안 오신 분</p>

      {marksBlocked && (
        <div className="mt-3">
          <ErrorLine text={marksBlockedText(marksCode)} code={marksCode} onReload={reload} />
        </div>
      )}

      <div className={ACTIONS}>
        <div className={ACTION_GROUP}>
          <CopyButton
            text={listText}
            label="명단 복사"
            disabled={waiting || rows.length === 0}
            doneText={`복사했어요 · ${copiedCount}명${withDate ? ' · 날짜 제목 줄 포함' : ''}`}
            // 줄은 있는데 복사 글이 비었으면 모두 번호 없는 분이다. 빈 글로 클립보드를 덮어쓰지 않는다
            unavailable={listText ? undefined : NO_PHONES}
            onResult={setNotice}
          />
          <Check label="날짜 제목 줄 넣기" checked={withDate} onChange={setWithDate} />
        </div>
        <div className={ACTION_GROUP}>
          {templates.state === 'failed' ? (
            <ErrorLine text={TEMPLATES_FAILED} code="E-PATIENTS-TEMPLATES-READ" onReload={retry} />
          ) : (
            <>
              <CopyButton
                text={() => fillTemplate(template?.body ?? '', from)}
                label="문구 복사"
                disabled={templates.state === 'loading'}
                doneText={`복사했어요 · ${template?.name ?? ''} · ${dayLabel(from)}`}
                unavailable={template ? undefined : NO_TEMPLATE}
                onResult={setNotice}
              />
              <Segments<FollowupTemplateKind> label="복사할 문구" options={TEMPLATE_KINDS} value={templateKind} onChange={setTemplateKind} />
              <span className={RANGE}>문구 날짜 {dayLabel(from)}</span>
            </>
          )}
        </div>
      </div>
      <CopyNoticeLine notice={notice} />

      {listed && <FollowupRows rows={rows} today={today} onMark={mark} busyKeys={busyKeys} markErrors={markErrors} marksBlocked={marksBlocked} emptyText={EMPTY} />}
      {listed && listed.undecided.length > 0 && <UndecidedRows rows={listed.undecided} />}
    </>
  )
}
