'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { addDays, isYmd } from '@/lib/analytics/dates'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import { defaultSendDate, fillClinic, fillTemplate, type ClinicInfo } from '@/lib/patientMessages/fill'
import { readTemplates, type MessageTemplate } from '@/lib/storage/messageTemplates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { FilteredRecall, RecallCoverage, RecallFilters, RecallView } from '@/types/patients'
import { CopyButton, CopyNoticeLine, type CopyNotice } from './CopyButton'
import { customRange, dayLabel } from './periods'
import { CheckMark, ErrorLine } from './rows/FollowupRows'
import { RecallRows } from './rows/RecallRows'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 정기 주사 문자 명단 도구(AC-612.1~612.4, 목업 rcTool). FollowupTool과 같은 방식이다: 화면은 거르지 않고 복사 글도 만들지 않는다. 고른 값을 filter로 보내 Worker가 거른 줄·복사 글을 받는다.
// 환자 값(이름·전화·차트번호)은 rows/RecallRows가 props로만 그린다. 여기서는 그리지 않는다. 복사 글은 Worker가 준 그대로 클립보드로만 가고 결과 줄에는 수만 보인다.
// 연락 표시는 Worker → 도우미 저장으로만 간다(브라우저 저장소 없음). store.load는 부르지 않고, reload는 사용자가 [다시 불러오기]를 누를 때만 부른다(AC-604.8).
// 고르기 칸·문구 읽기는 FollowupTool 안의 것과 같은 모양이다(그 파일을 고치는 TASK가 아니라 여기 따로 둔다)

const EMPTY = '이 기간에 주사 날짜가 다가온 분이 없어요. 기간을 넓혀 보세요.'
const STORE_FAILED = '기록을 이 PC에 저장하지 못했어요. 명단은 그대로 볼 수 있어요.'
const TEMPLATES_FAILED = '문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.'
const NO_NUMBERS = '복사할 번호가 없어요. 모두 번호 없는 분이에요.'

// 고르기 줄(목업 .flt·.fg·.acts·.ag). 휴대폰은 한 칸씩 쌓는다
const FILTER_BAR = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4 max-md:grid max-md:gap-3'
const FIELD = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1.5'
const FIELD_ROW = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:gap-x-4 max-md:gap-y-0'
const FIELD_NAME = 'whitespace-nowrap text-small font-semibold text-ink'
const RANGE = 'whitespace-nowrap text-small text-muted'
const ACTIONS = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 max-md:grid max-md:gap-3'
const ACTION_GROUP = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1'
const DATE_FIELD = 'w-40 max-md:w-full'

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
 * 이런 값은 쓰지 않고 글자만 둔다. 글자까지 되돌리면 연도를 칠 수 없다. 칸을 떠나면 쓰는 날짜로 맞춘다
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
type Listed = Pick<FilteredRecall, 'rows' | 'copy'>

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

/** 쌓인 기록 안내(AC-612.2, 목업 .cov). 읽은 기록이 아예 없으면 말할 것이 없다 */
function Coverage({ coverage }: { coverage: RecallCoverage }) {
  const { records, from, short, trimmed } = coverage
  if (records === 0 && from === null && trimmed === 0) return null
  return (
    <div className="mt-4 space-y-1 rounded-control bg-canvas px-4 py-3 text-small text-ink-2">
      <p>
        이 PC에 쌓인 정기 주사 기록 <b className="font-semibold text-ink">{formatCount(records)}건</b>
        {from !== null && isYmd(from) && ` · ${from.slice(0, 4)}년 ${dayLabel(from)}부터`}
      </p>
      {short.map(({ label, months }) => (
        <p key={label}>
          {label}는 {months}개월마다 맞는데, 쌓인 기록이 아직 그만큼 길지 않아요. 그보다 오래전에 맞은 분은 아직 명단에 없어요.
        </p>
      ))}
      {trimmed > 0 && <p>기록이 많아 오래된 {formatCount(trimmed)}건을 뺐어요.</p>}
    </div>
  )
}

export function RecallTool({
  view,
  storeCode,
  today,
  clinic,
  active,
  post,
  listen,
  reload,
  head,
}: {
  view: RecallView
  /** 기록 저장 실패 번호(views.codes.store). 명단은 그대로 보인다 */
  storeCode?: string
  /** 이 명단을 읽은 날. 처음 기간·연락한 날·문구 날짜의 기준이다 */
  today: string
  /** [문구 복사] 글에 넣을 병원 정보(AC-6605.1). PatientsScreen이 한 번 읽어 넘긴다 */
  clinic: ClinicInfo
  /** 지금 보이는 도구인가. 다른 도구로 가도 살아 있어 고른 값·저장 답을 잃지 않는다 */
  active: boolean
  post(message: ToolRequest): void
  listen(listener: (message: ToolReply) => void): () => void
  /** [다시 불러오기] 누름에만 부른다 */
  reload(): void
  /** 도구 머리. 오른쪽에 놓을 요약을 받는다 */
  head(summary: ReactNode): ReactNode
}) {
  const fromField = useDayField(today)
  const toField = useDayField(addDays(today, 30))
  const [overdue, setOverdue] = useState(true)

  const { from, to } = customRange(fromField.valid, toField.valid)
  const filters = useMemo<RecallFilters>(() => ({ from, to, overdue }), [from, to, overdue])

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
          if (message.tool !== 'recall') return
          askedFilters.current = Math.max(0, askedFilters.current - 1)
          setListed({ rows: message.rows, copy: message.copy })
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
    post({ type: 'filter', tool: 'recall', filters })
  }, [post, filters, view])

  // 다른 도구로 가면 복사 결과 줄을 지운다(목업 setTool)
  useEffect(() => {
    if (!active) setNotice(null)
  }, [active])

  // 복사할 번호가 없다는 줄은 지금 고른 것을 말하므로 고른 것이 바뀌면 지운다. '복사했어요'·복사 실패 줄은 지난 누름의 결과라 그대로 맞는 말이다(목업)
  useEffect(() => {
    setNotice((prev) => (prev?.text === NO_NUMBERS ? null : prev))
  }, [filters])

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
  const phones = listed?.copy.phones ?? ''
  const missing = listed?.copy.missingPhones ?? 0
  const cannotCopy = waiting || rows.length === 0

  const summary = listed && (
    <p className="whitespace-nowrap text-small text-muted">
      <b className="font-semibold text-ink">{rows.length}명</b>
      {` · 아직 연락 안 한 분 ${rows.filter((row) => !row.contacted).length}명`}
    </p>
  )

  const templateRows = templates.state === 'ready' ? (templates.rows.length ? templates.rows : DEFAULT_TEMPLATES) : []
  const template = templateRows.find((row) => row.kind === 'injection')
  const sendDate = defaultSendDate(today)

  return (
    <>
      {head(summary)}

      <div className={FILTER_BAR}>
        <div className={FIELD}>
          <span className={FIELD_NAME}>다음 예정일</span>
          <DayInput label="시작 날짜" field={fromField} />
          <span className={RANGE}>~</span>
          <DayInput label="끝 날짜" field={toField} />
        </div>
        <div className={FIELD_ROW}>
          <Check label="지난 예정 포함" checked={overdue} onChange={setOverdue} />
        </div>
      </div>
      <p className="mt-2 text-caption text-muted">처음에는 오늘부터 30일 뒤까지예요 · 지난 예정: 주사 날짜가 지났는데 아직 안 오신 분</p>

      <Coverage coverage={view.coverage} />

      {storeCode && (
        <div className="mt-3">
          <ErrorLine text={STORE_FAILED} code={storeCode} onReload={reload} />
        </div>
      )}

      <div className={ACTIONS}>
        <div className={ACTION_GROUP}>
          <CopyButton
            text={listed?.copy.list ?? ''}
            label="명단 복사"
            disabled={cannotCopy}
            doneText={`복사했어요 · ${rows.length}명${missing ? ` (번호 없는 분 ${missing}명)` : ''}`}
            onResult={setNotice}
          />
          <CopyButton
            text={phones}
            label="번호 복사"
            disabled={cannotCopy}
            doneText={`번호 ${phones ? phones.split('\n').length : 0}개를 복사했어요${missing ? ` · 번호 없는 분 ${missing}명은 빠졌어요` : ''}`}
            // 줄은 있는데 번호가 하나도 없으면 빈 글로 클립보드를 덮어쓰지 않는다
            unavailable={phones ? undefined : NO_NUMBERS}
            onResult={setNotice}
          />
        </div>
        <div className={ACTION_GROUP}>
          {templates.state === 'failed' ? (
            <ErrorLine text={TEMPLATES_FAILED} code="E-PATIENTS-TEMPLATES-READ" onReload={retry} />
          ) : (
            <>
              <CopyButton
                text={() => fillClinic(fillTemplate(template?.body ?? '', sendDate), clinic)}
                label="문구 복사"
                disabled={!template}
                doneText={`복사했어요 · ${template?.name ?? ''} · ${dayLabel(sendDate)}`}
                onResult={setNotice}
              />
              <span className={RANGE}>주사 안내 · 문구 날짜 {dayLabel(sendDate)}</span>
            </>
          )}
        </div>
      </div>
      <CopyNoticeLine notice={notice} />

      {listed && <RecallRows rows={rows} onMark={mark} busyKeys={busyKeys} markErrors={markErrors} emptyText={EMPTY} />}
    </>
  )
}
