'use client'

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { addDays } from '@/lib/analytics/dates'
import { errorInfo, isErrorCode } from '@/lib/errors'
import { DEFAULT_TEMPLATES } from '@/lib/patientMessages/defaults'
import { fillClinic, fillTemplate, type ClinicInfo } from '@/lib/patientMessages/fill'
import { inPickRange, missedRange, RESERVATION_AHEAD_DAYS, shortDay } from '@/lib/patients/reservations'
import { readTemplates, type MessageTemplate } from '@/lib/storage/messageTemplates'
import { supabaseBrowser } from '@/lib/supabase/browser'
import type { FilteredReservations, MissedSummary, ReservationFilters, ReservationPick } from '@/types/patients'
import { CopyButton, CopyNoticeLine, type CopyNotice } from './CopyButton'
import { dayLabel } from './periods'
import { CheckMark, ErrorLine } from './rows/FollowupRows'
import { MissedRows, NoPhoneBox, ReservationRows } from './rows/ReservationRows'
import { readAtText, type ReservationsRead } from './useBitList'
import type { ToolReply, ToolRequest } from './usePatientsWorker'

// 예약 문자 명단 도구(spec patients-bit-lists AC-2803.0~2803.9·2802.4, 시안 toolReservations). FollowupTool과 같은 방식이다:
// 화면은 거르지 않고 복사 글도 만들지 않는다. 고른 값을 filter로 보내 Worker가 거른 줄·복사 글·지난 예약 요약을 받는다.
// 환자 값(이름·전화)은 rows/ReservationRows가 props로만 그린다. 여기서는 그리지 않는다. 차트번호는 줄 열쇠 안에만 있다(AC-2802.7).
// 보냄 표시는 Worker → 도우미 저장(contact.marks, 열쇠 s|…)으로만 간다. [다시 불러오기]는 이 도구만 다시 읽고(useBitList) 고른 것은 그대로다(AC-2802.4).
// 고르기 칸·체크·머리 요약·표시 기다림은 장기 미방문 명단(LapsedTool)도 같이 쓴다(이 파일에서 내보낸다)

const EMPTY = '이 날 예약하신 분이 없어요. 비트에 예약 대기를 채운 뒤 [다시 불러오기]를 눌러 주세요.'
const MISSED_EMPTY = '이 기간에 안 오신 분이 없어요.'
const NO_PHONES = '복사할 명단이 없어요. 모두 번호 없는 분이에요.'
const ALL_SENT = '모두 보냈어요. 새 예약이 들어오면 [다시 불러오기]를 눌러 주세요.'
// 시안 글(AC-2803.3 글 뒤에 [보냄으로 표시] 안내 한 문장이 더 있다)
const GUIDE = '명단 넷째 칸은 예약 시각이에요(문구의 [*2*] 자리). 번호 없는 분은 복사에서 빠져요. 문자를 보낸 뒤 [보냄으로 표시]를 눌러 두면 나중에 예약이 더 들어와도 안 보낸 분만 복사돼요.'
const MISSED_NOTE = '예약한 날 진료 접수가 없는 분이에요. 비트는 미리 취소한 예약과 안 오신 예약을 똑같이 ‘예약 취소’로 바꿔서 함께 세요.'
const TEMPLATES_FAILED = '문자 문구를 불러오지 못해 [문구 복사]를 쓸 수 없어요.'
const MARKS_BLOCKED = '보냄 표시를 불러오지 못해 [보냄]을 쓸 수 없어요.'
// 지난 예약 칸은 처음에 10건까지 보인다(AC-2803.5. rows/ReservationRows와 같은 수)
const SHOWN = 10
// 저장한 예약 안내 문구가 없을 때(AC-2803.3)
const DEFAULT_RESERVATION = DEFAULT_TEMPLATES.find((row) => row.kind === 'reservation')!
// [직접]을 처음 누르면 [모레] 다음 날(시안 S.custom)
const CUSTOM_FIRST = 3

// ── 두 비트 명단 도구가 같이 쓰는 조각 ─────────────────────

// 고르기 줄(시안 .flt·.fg·.acts·.ag, FollowupTool과 같은 값). 휴대폰은 한 칸씩 쌓는다
export const FILTER_BAR = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-line pt-4 max-md:grid max-md:gap-3'
export const FIELD = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1.5'
const FIELD_ROW = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:gap-x-4 max-md:gap-y-0'
export const FIELD_NAME = 'whitespace-nowrap text-small font-semibold text-ink'
export const RANGE = 'whitespace-nowrap text-small text-muted max-md:whitespace-normal'
export const ACTIONS = 'mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 max-md:grid max-md:gap-3'
export const ACTION_GROUP = 'inline-flex flex-wrap items-center gap-x-3 gap-y-2 max-md:grid max-md:gap-1'
// 작은 안내 글(시안 .fhelp·.note)
export const HELP = 'mt-2 max-w-240 text-caption text-muted'
export const DATE_FIELD = 'w-40 max-md:w-full'
// 글자 단추 13px(시안 .tbtn): [다시 불러오기]·[모두 보기]
export const SMALL_TEXT_BUTTON = `inline-flex cursor-pointer items-center rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing} max-md:min-h-11`

// 기간 단추 묶음(시안 .seg, FollowupTool과 같은 모양). 휴대폰은 칸이 같은 폭으로 줄을 채운다
const SEG_GROUP = 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full max-md:auto-cols-fr max-md:grid-flow-col'
const SEG_BUTTON =
  'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-2'
const SEG_ON = 'bg-accent-soft font-semibold text-accent-strong'
const SEG_OFF = 'font-medium text-ink-2 transition hover:bg-canvas'

export function Segments<T extends string>({ label, options, value, onChange }: { label: string; options: readonly (readonly [T, string])[]; value: T; onChange(next: T): void }) {
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

export function Check({ label, checked, onChange }: { label: string; checked: boolean; onChange(next: boolean): void }) {
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

/** 머리 오른쪽 요약(AC-2802.4, 시안 sumRight): 사람 수 · (남은 수) · 읽은 때 + [다시 불러오기] */
export function ReadSummary({ readAt, onReload, children }: { readAt: number; onReload(): void; children: ReactNode }) {
  return (
    <p className="inline-flex flex-wrap items-center gap-x-2 text-small text-muted">
      <span className="whitespace-nowrap max-md:whitespace-normal">
        {children} · {readAtText(readAt)}
      </span>
      <button type="button" className={SMALL_TEXT_BUTTON} onClick={onReload}>
        다시 불러오기
      </button>
    </p>
  )
}

/** 표시를 못 불러왔을 때의 글(F/U와 같은 모양). 까닭은 errors.ts 글을 그대로 쓴다. 글이 없는 번호는 번호만 보인다 */
export function marksBlockedText(lead: string, code: string): string {
  if (!isErrorCode(code)) return lead
  const { what, fix } = errorInfo(code)
  return `${lead} ${what}. ${fix}`
}

type Marked = Extract<ToolReply, { type: 'marked' }>

/**
 * 줄 표시의 저장 기다림(F/U 연락함과 같다). begin은 기다리지 않는 열쇠만 기다림에 넣어 돌려준다(그 열쇠만 보낸다).
 * settle은 marked 답을 받아 기다리던 열쇠면 보낸 값을 돌려주고 실패면 그 줄에 번호를 남긴다
 */
export function useMarkWaits() {
  const pending = useRef(new Map<string, boolean>())
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set())
  const [markErrors, setMarkErrors] = useState<ReadonlyMap<string, string>>(new Map())
  const begin = useCallback((keys: readonly string[], on: boolean): string[] => {
    const fresh = keys.filter((key) => !pending.current.has(key))
    if (!fresh.length) return fresh
    for (const key of fresh) pending.current.set(key, on)
    setBusyKeys(new Set(pending.current.keys()))
    setMarkErrors((prev) => {
      if (!fresh.some((key) => prev.has(key))) return prev
      const next = new Map(prev)
      for (const key of fresh) next.delete(key)
      return next
    })
    return fresh
  }, [])
  const settle = useCallback((message: Marked): boolean | undefined => {
    const on = pending.current.get(message.key)
    if (on === undefined) return undefined
    pending.current.delete(message.key)
    setBusyKeys(new Set(pending.current.keys()))
    if (!message.ok) setMarkErrors((prev) => new Map(prev).set(message.key, message.code ?? 'E-STORE-FAILED'))
    return on
  }, [])
  return { busyKeys, markErrors, begin, settle }
}

// ── 이 도구만 쓰는 것 ────────────────────────────────────

/**
 * 날짜 칸 값 둘: 칸에 보이는 글자(text)와 쓰는 날짜(valid). 받는 날(오늘 ~ 오늘+14일)이 아니면 쓰지 않고 글자만 둔다(FollowupTool과 같은 까닭).
 * 칸을 떠나면 쓰는 날짜로 맞춘다
 */
function useDayField(initial: string, accept: (day: string) => boolean) {
  const [text, setText] = useState(initial)
  const [valid, setValid] = useState(initial)
  const change = (next: string) => {
    setText(next)
    if (accept(next)) setValid(next)
  }
  return { text, valid, change, settle: () => setText(valid) }
}

type Templates = { state: 'loading' } | { state: 'failed' } | { state: 'ready'; rows: readonly MessageTemplate[] }

/** 문구를 읽어 둔다. active일 때만 읽고, 열릴 때마다 다시 읽는다(문자 문구 도구에서 고친 글을 복사해야 한다). retry는 문구만 다시 읽는다 */
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

/** 결과 줄(시안 rsvNoteLine): 알림 + [보냄으로 표시 (N명)], 모두 보냈으면 그 안내. 처음부터 있는 role="status"라 바뀐 글을 읽어 준다 */
function NoticeLine({ notice, toMark, allSent, onMark }: { notice: CopyNotice; toMark: number; allSent: boolean; onMark(): void }) {
  return (
    <p role="status" className="mt-2 flex min-h-5 flex-wrap items-center gap-x-3 gap-y-1 text-small text-ink-2">
      {notice &&
        (notice.ok ? (
          <span className="inline-flex items-center gap-1 font-medium text-positive">
            <Icon name="check" size={14} />
            {notice.text}
          </span>
        ) : (
          <span>{notice.text}</span>
        ))}
      {toMark > 0 && (
        <button type="button" className={`${ds.button.secondarySmall} max-md:w-full`} onClick={onMark}>
          보냄으로 표시 ({toMark}명)
        </button>
      )}
      {toMark === 0 && allSent && <span>{ALL_SENT}</span>}
    </p>
  )
}

/** 지난 예약 요약 줄(AC-2803.6). 숫자만 굵게(시안 .ratio) */
function MissedSummaryLine({ summary }: { summary: MissedSummary }) {
  if (summary.total === 0) return <p className="mt-3 text-body text-ink-2">이 기간에 예약이 없어요.</p>
  return (
    <p className="mt-3 text-body text-ink-2">
      예약 <b className="font-semibold text-ink">{formatCount(summary.total)}건</b> 중 안 오신 분{' '}
      <b className="font-semibold text-ink">
        {formatCount(summary.missed)}건 · {summary.percent}%
      </b>{' '}
      · 아직 안 오신 분 <b className="font-semibold text-ink">{formatCount(summary.notYet)}명</b>
    </p>
  )
}

type Listed = Omit<FilteredReservations, 'type' | 'tool'>
type Preset = ReservationPick['preset']
type MissedDays = '7' | '30'
// [보냄으로 표시]로 보낸 열쇠. 모두 답이 오면 알림을 바꾼다
type Bulk = { keys: Set<string>; count: number; failed: boolean }

const MISSED_PERIODS: readonly (readonly [MissedDays, string])[] = [
  ['7', '지난 7일'],
  ['30', '지난 30일'],
]

export function ReservationTool({
  read,
  storeCode,
  clinic,
  active,
  post,
  listen,
  markMany,
  reload,
  reloadStore,
  head,
}: {
  /** 다 읽은 결과(useBitList). 바뀌면(다시 읽음) 고른 것 그대로 다시 묻는다 */
  read: ReservationsRead
  /** 표시 저장을 못 불러온 번호. 모르면(아직 불러오는 중) 없다 */
  storeCode?: string | null
  /** [문구 복사] 글에 넣을 병원 정보(AC-6605.1). PatientsScreen이 한 번 읽어 넘긴다 */
  clinic: ClinicInfo
  /** 지금 보이는 도구인가. 다른 도구로 가도 살아 있어 고른 값·저장 답을 잃지 않는다 */
  active: boolean
  post(message: ToolRequest): void
  listen(listener: (message: ToolReply) => void): () => void
  /** [보냄으로 표시 (N명)]: 열쇠 여럿을 저장 한 번에(mark-many) */
  markMany(keys: string[], today: string): void
  /** 머리 [다시 불러오기]: 이 도구만 다시 읽는다 */
  reload(): void
  /** 표시를 못 불러왔을 때 줄의 [다시 불러오기]: 저장을 다시 불러온다(F/U [다시 불러오기]와 같다) */
  reloadStore(): void
  /** 도구 머리. 오른쪽에 놓을 요약을 받는다 */
  head(summary: ReactNode): ReactNode
}) {
  // 이 명단을 읽은 날. 날짜 단추·문구 날짜·표시한 날의 기준이다
  const { today, pick, dayCounts } = read
  const dayId = useId()
  const missedTitleId = useId()

  const [preset, setPreset] = useState<Preset>(pick.preset)
  const customDay = useDayField(pick.preset === 'custom' ? pick.day : addDays(today, CUSTOM_FIRST), (next) => inPickRange(next, today))
  // 날짜를 직접 바꾸면 처음 고른 날 안내를 지운다(시안 autoNote)
  const [touched, setTouched] = useState(false)
  const [withDate, setWithDate] = useState(true)
  const [unsentOnly, setUnsentOnly] = useState(true)
  const [missedDays, setMissedDays] = useState<MissedDays>('7')
  const [notYetOnly, setNotYetOnly] = useState(true)
  const [missedAll, setMissedAll] = useState(false)

  const day = preset === 'tomorrow' ? addDays(today, 1) : preset === 'after' ? addDays(today, 2) : customDay.valid
  const days = missedDays === '30' ? 30 : 7
  const filters = useMemo<ReservationFilters>(() => ({ day, withDate, unsentOnly, missedDays: days, notYetOnly }), [day, withDate, unsentOnly, days, notYetOnly])

  const [listed, setListed] = useState<Listed | null>(null)
  // 답을 기다리는 filter 수. 고르기를 바꾼 뒤 답이 오기 전에는 옛 날짜의 글을 복사하지 못하게 막는다. Worker는 보낸 차례로 답한다
  const askedFilters = useRef(0)
  const askedRead = useRef<ReservationsRead | null>(null)
  const [waiting, setWaiting] = useState(true)
  const { busyKeys, markErrors, begin, settle } = useMarkWaits()
  const [notice, setNotice] = useState<CopyNotice>(null)
  const [missedNotice, setMissedNotice] = useState<CopyNotice>(null)
  // 방금 복사한 명단의 열쇠([보냄으로 표시]에 쓴다)
  const [copied, setCopied] = useState<readonly string[] | null>(null)
  const bulk = useRef<Bulk | null>(null)
  const { templates, retry } = useTemplates(active)

  useEffect(
    () =>
      listen((message) => {
        if (message.type === 'filtered') {
          if (message.tool !== 'reservations') return
          askedFilters.current = Math.max(0, askedFilters.current - 1)
          setListed({ day: message.day, rows: message.rows, copy: message.copy, missed: message.missed, marksLoaded: message.marksLoaded })
          setWaiting(askedFilters.current > 0)
          return
        }
        const on = settle(message)
        if (on === undefined) return
        // 다시 오는 filtered 전까지 줄이 잠깐 되돌아 보이지 않게 한다
        if (message.ok) setListed((prev) => prev && { ...prev, rows: prev.rows.map((row) => (row.key === message.key ? { ...row, sent: on } : row)) })
        const sending = bulk.current
        if (!sending || !sending.keys.delete(message.key)) return
        if (!message.ok) sending.failed = true
        if (sending.keys.size) return
        bulk.current = null
        // 한 분이라도 못 했으면 그 줄 아래 실패 줄이 말한다
        if (!sending.failed) setNotice({ ok: true, text: `${sending.count}명을 보냄으로 표시했어요` })
      }),
    [listen, settle],
  )

  // 고르기가 바뀌거나 새로 읽으면 Worker에 다시 묻는다. 새로 읽었으면 앞 읽기에서 답 없이 남은 물음은 세지 않는다
  useEffect(() => {
    askedFilters.current = askedRead.current === read ? askedFilters.current + 1 : 1
    askedRead.current = read
    setWaiting(true)
    post({ type: 'filter', tool: 'reservations', filters })
  }, [post, filters, read])

  // 다른 도구로 가면 결과 줄을 지운다(시안 setTool)
  useEffect(() => {
    if (active) return
    setNotice(null)
    setMissedNotice(null)
    setCopied(null)
  }, [active])

  // 결과 줄은 지금 고른 것을 말하므로 고른 것이 바뀌거나 새로 읽으면 지운다(시안: 날짜·체크를 바꾸면 note·toMark를 지운다)
  useEffect(() => {
    setNotice(null)
    setCopied(null)
    bulk.current = null
  }, [day, withDate, unsentOnly, read])
  useEffect(() => {
    setMissedNotice(null)
  }, [days, notYetOnly, read])
  useEffect(() => {
    setMissedAll(false)
  }, [days, notYetOnly])

  const mark = useCallback(
    (key: string, on: boolean) => {
      // 기다리는 그 줄만 다시 보내지 않는다. 다른 줄은 막지 않는다: Worker가 저장을 차례로 보낸다
      if (begin([key], on).length) post({ type: 'mark', key, on, today })
    },
    [begin, post, today],
  )

  const rows = listed?.rows ?? []
  // 받은 명단이 지금 고른 날의 것일 때만 복사한다. 날짜를 바꾼 뒤 저장 뒤 다시 온 앞 날 명단이 먼저 와도 복사하지 않는다(AC-2803.2)
  const listedToday = listed?.day === day
  const marksBlocked = !listed?.marksLoaded
  const copyKeys = listed?.copy.keys ?? []
  const sentKeys = new Set(rows.filter((row) => row.sent).map((row) => row.key))
  // 방금 복사한 분 중 아직 보냄 표시가 없는 분(시안 toMark)
  const toMark = copied && !marksBlocked ? copied.filter((key) => !sentKeys.has(key) && !busyKeys.has(key)) : []
  // 번호 있는 분이 있는데 [안 보낸 분만]으로 복사할 분이 없음 = 모두 보냄(시안 allSent)
  const allSent = !!listed && unsentOnly && !marksBlocked && rows.some((row) => row.phone) && copyKeys.length === 0
  const listText = listed?.copy.list ?? ''
  const missed = listed?.missed
  const missedText = missed?.copy.list ?? ''
  const range = missedRange(today, days)
  const note = !touched && pick.note && day === pick.day ? pick.note : null

  const markCopied = () => {
    const keys = begin(toMark, true)
    if (!keys.length) return
    bulk.current = { keys: new Set(keys), count: keys.length, failed: false }
    setCopied(null)
    markMany(keys, today)
  }

  const choosePreset = (next: Preset) => {
    setPreset(next)
    setTouched(true)
  }

  const summary = listed && (
    <ReadSummary readAt={read.readAt} onReload={reload}>
      <b className="font-semibold text-ink">{rows.length}명</b>
      {/* 표시를 못 불러오면 보냈는지 모른다 */}
      {rows.length > 0 && !marksBlocked && ` · 아직 안 보낸 분 ${rows.filter((row) => !row.sent).length}명`}
    </ReadSummary>
  )

  const template = templates.state === 'ready' ? (templates.rows.find((row) => row.kind === 'reservation') ?? DEFAULT_RESERVATION) : null

  return (
    <>
      {head(summary)}

      <div className={FILTER_BAR}>
        <div className={FIELD}>
          <span className={FIELD_NAME}>날짜</span>
          <Segments<Preset>
            label="날짜"
            options={[
              ['tomorrow', `내일 · ${dayCounts.tomorrow}명`],
              ['after', `모레 · ${dayCounts.after}명`],
              ['custom', '직접'],
            ]}
            value={preset}
            onChange={choosePreset}
          />
          <span className={RANGE}>{dayLabel(day)}</span>
        </div>
        {preset === 'custom' && (
          <div className={FIELD}>
            <label className={FIELD_NAME} htmlFor={dayId}>
              예약 날짜
            </label>
            <span className={DATE_FIELD}>
              <input
                id={dayId}
                type="date"
                className={ds.input}
                min={today}
                max={addDays(today, RESERVATION_AHEAD_DAYS)}
                value={customDay.text}
                onChange={(event) => {
                  customDay.change(event.target.value)
                  setTouched(true)
                }}
                onBlur={customDay.settle}
              />
            </span>
          </div>
        )}
      </div>
      {note && <p className={HELP}>{note}</p>}

      {listed && marksBlocked && storeCode && (
        <div className="mt-3">
          <ErrorLine text={marksBlockedText(MARKS_BLOCKED, storeCode)} code={storeCode} onReload={reloadStore} />
        </div>
      )}

      <div className={ACTIONS}>
        <div className={ACTION_GROUP}>
          <CopyButton
            text={listText}
            label="명단 복사"
            disabled={waiting || !listedToday || rows.length === 0 || allSent}
            doneText={`복사했어요 · ${copyKeys.length}명${unsentOnly ? ' · 안 보낸 분만' : ''}${withDate ? ' · 날짜 제목 줄 포함' : ''}`}
            // 줄은 있는데 복사 글이 비었으면 모두 번호 없는 분이다. 빈 글로 클립보드를 덮어쓰지 않는다
            unavailable={listText ? undefined : NO_PHONES}
            onResult={(result) => {
              setNotice(result)
              setCopied(result?.ok ? copyKeys : null)
              bulk.current = null
            }}
          />
          <Check label="안 보낸 분만" checked={unsentOnly} onChange={setUnsentOnly} />
          <Check label="날짜 제목 줄 넣기" checked={withDate} onChange={setWithDate} />
        </div>
        <div className={ACTION_GROUP}>
          {templates.state === 'failed' ? (
            <ErrorLine text={TEMPLATES_FAILED} code="E-PATIENTS-TEMPLATES-READ" onReload={retry} />
          ) : (
            <>
              <CopyButton
                text={() => fillClinic(fillTemplate(template?.body ?? '', day), clinic)}
                label="문구 복사"
                disabled={!template || rows.length === 0}
                doneText={`복사했어요 · ${template?.name ?? ''} · ${dayLabel(day)}`}
                onResult={(result) => {
                  setNotice(result)
                  setCopied(null)
                  bulk.current = null
                }}
              />
              <span className={RANGE}>문구 날짜 {dayLabel(day)}</span>
            </>
          )}
        </div>
      </div>
      <NoticeLine notice={notice} toMark={toMark.length} allSent={allSent} onMark={markCopied} />
      <p className={HELP}>{GUIDE}</p>

      {listed && <NoPhoneBox rows={rows} />}
      {listed && <ReservationRows rows={rows} onMark={mark} busyKeys={busyKeys} markErrors={markErrors} marksBlocked={marksBlocked} emptyText={EMPTY} />}

      <section aria-labelledby={missedTitleId} className="mt-8 border-t border-line pt-6">
        <h3 id={missedTitleId} className="text-subtitle font-semibold text-ink">
          지난 예약 · 안 오신 분
        </h3>
        <div className="mt-3 flex flex-wrap items-center gap-x-6 gap-y-3 max-md:grid max-md:gap-3">
          <div className={FIELD}>
            <span className={FIELD_NAME}>기간</span>
            <Segments<MissedDays> label="지난 기간" options={MISSED_PERIODS} value={missedDays} onChange={setMissedDays} />
            <span className={RANGE}>
              {shortDay(range.from)} ~ {shortDay(range.to)}
            </span>
          </div>
          <div className={FIELD_ROW}>
            <Check label="아직 안 오신 분만" checked={notYetOnly} onChange={setNotYetOnly} />
          </div>
        </div>
        {missed && <MissedSummaryLine summary={missed.summary} />}
        <p className={HELP}>{MISSED_NOTE}</p>
        <div className="mt-3">
          <CopyButton
            text={missedText}
            label="명단 복사"
            disabled={waiting || !missed?.rows.length}
            doneText={`복사했어요 · ${missed?.copy.count ?? 0}명`}
            unavailable={missedText ? undefined : NO_PHONES}
            onResult={setMissedNotice}
          />
        </div>
        <CopyNoticeLine notice={missedNotice} />
        {missed && <MissedRows rows={missed.rows} expanded={missedAll} emptyText={MISSED_EMPTY} />}
        {missed && missed.rows.length > SHOWN && (
          <p className="mt-2">
            <button type="button" className={SMALL_TEXT_BUTTON} aria-expanded={missedAll} onClick={() => setMissedAll((open) => !open)}>
              {missedAll ? '10건만 보기' : `모두 보기 (${formatCount(missed.rows.length)}건)`}
            </button>
          </p>
        )}
      </section>
    </>
  )
}
