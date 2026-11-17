'use client'

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { ds } from '@/components/ui/classes'
import { addDays, addMonths, compareYmd, monthOf, todayInKorea, weekdayOf, weekStartOf } from '@/lib/analytics/dates'
import { nextWeek, slotLabel, visibleGhosts, warnings } from '@/lib/calendar/rules'
import {
  addAllDay,
  addAppt,
  CalendarStorageError,
  deleteAllDay,
  deleteAppt,
  listAllDay,
  listAppts,
  saveCalendarSettings,
  updateAppt,
} from '@/lib/storage/calendar'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { DEFAULT_CAL_SETTINGS, type CalAllDay, type CalAppt, type CalCountRow, type CalSettings } from '@/types/calendar'
import { AddPanel, draftOf, newDraft, type AddDraft, type AddFields } from './AddPanel'
import { AllDayPanel } from './AllDayPanel'
import { CalendarSettings } from './CalendarSettings'
import { CalendarLegend, CalendarToolbar, dayLabel, hm, type CalView } from './CalendarToolbar'
import { DetailPanel, type ArrivalPick } from './DetailPanel'
import { MonthGrid } from './MonthGrid'
import { BitPicks } from './rows/BitPicks'
import { GHOST_NOTE } from './rows/GhostBlock'
import { PhoneWeekList } from './rows/PhoneWeekList'
import { TimeGrid } from './rows/TimeGrid'
import { SummaryLine } from './SummaryLine'
import { useCalendarData, type CalendarPeriod, type CalendarSnapshot } from './useCalendarData'
import { findQuery, useCalendarWorker, useCalendarWorkerObject, type CalendarWorkerHandle } from './useCalendarWorker'

// 예약 화면 /calendar (spec clinic-calendar REQ-5905·REQ-5906·REQ-5907, design.md '화면', 시안 docs/mockups/clinic-calendar).
// 도구 줄 → 합계 줄 → 안내 줄 → 일·주(시간 표, 768px 미만 주 보기는 날짜별 목록) 또는 월(수만). 1024px 이상은 앱 폭 제한을 푼다(data-wide-page).
// 읽기·다시 읽기는 useCalendarData(rev 5초), 비트 찾기·도착 auto·비트 예약 칸은 useCalendarWorker(비트 PC만).
// 저장은 이 화면이 lib/storage/calendar로 바로 하고, 된 값을 지금 기간 자료에 바로 넣은 뒤 rev를 다시 읽는다(다른 PC는 몇 초 안에)

const FIND_WAIT_MS = 400 // 이름·차트번호를 적고 멈춘 뒤 비트에서 찾기까지
const TOAST_MS = 6_000
const CLOCK_MS = 30_000
const KST_MIN = 9 * 60
const DAY_MIN = 24 * 60
const LAST_START = DAY_MIN - 10
const FIRST_START = 9 * 60 // 오늘이 아닌 날 [+ 예약 더하기]의 시작
const NARROW = '(max-width: 767px)'

const OFFLINE = '인터넷 연결이 끊겨 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.'
const FAILED = '저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.'
const BLOCKED_APPT = '이름이나 메모에 전화번호·주민번호·메일 같은 글자가 있어 저장하지 않았어요.'
const BLOCKED_ALLDAY = '메모에 전화번호·주민번호·메일 같은 글자가 있어 저장하지 않았어요.'
const INVALID_SETTINGS = '설정을 저장하지 못했어요. 칸을 다시 확인해 주세요.'
const FIND_FAILED = '비트에서 찾지 못했어요. 이름과 차트번호를 손으로 적어 주세요.'
const SHARED = '다른 PC에도 몇 초 안에 보여요.'

const saveError = (error: unknown) => (error instanceof CalendarStorageError && error.kind === 'offline' ? OFFLINE : FAILED)

// ── 시계·화면 폭 ────────────────────────────────────────────

type Clock = { today: string; nowMin: number | null }

function readClock(): Clock {
  const ms = Date.now()
  return { today: todayInKorea(new Date(ms)), nowMin: (Math.floor(ms / 60_000) + KST_MIN) % DAY_MIN }
}

/** 한국 날짜·시각(분). 서버 그림과 첫 그림은 지금 선이 없다(nowMin null) */
function useClock(initialToday: string): Clock {
  const [clock, setClock] = useState<Clock>({ today: initialToday, nowMin: null })
  useEffect(() => {
    const tick = () => setClock(readClock())
    tick()
    const timer = setInterval(tick, CLOCK_MS)
    return () => clearInterval(timer)
  }, [])
  return clock
}

function subscribeNarrow(listener: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {}
  const query = window.matchMedia(NARROW)
  query.addEventListener('change', listener)
  return () => query.removeEventListener('change', listener)
}
const isNarrow = () => typeof window.matchMedia === 'function' && window.matchMedia(NARROW).matches
const wideOnServer = () => false

// ── 기간 ────────────────────────────────────────────────────

const lastOfMonth = (month: string) => addDays(`${addMonths(month, 1)}-01`, -1)
const inRange = (day: string, from: string, to: string) => compareYmd(day, from) >= 0 && compareYmd(day, to) <= 0

/** 읽는 기간: 일 = 그날, 주 = 월~일(일요일을 안 보여도 읽는다), 월 = 그 달을 덮는 주 전부 */
function readPeriod(view: CalView, anchor: string): CalendarPeriod {
  if (view === 'day') return { view, from: anchor, to: anchor }
  if (view === 'week') {
    const from = weekStartOf(anchor)
    return { view, from, to: addDays(from, 6) }
  }
  const month = monthOf(anchor)
  return { view, from: weekStartOf(`${month}-01`), to: addDays(weekStartOf(lastOfMonth(month)), 6) }
}

/** 보이는 날(일·주). 주는 월~토, 설정이 켜면 일요일까지 */
function shownDays(view: CalView, anchor: string, sunday: boolean): string[] {
  if (view === 'day') return [anchor]
  const from = weekStartOf(anchor)
  return Array.from({ length: sunday ? 7 : 6 }, (_, i) => addDays(from, i))
}

// 일 보기 ◀▶: 일요일을 안 보면 건너뛴다
function stepDay(day: string, by: 1 | -1, sunday: boolean): string {
  const next = addDays(day, by)
  return !sunday && weekdayOf(next) === 7 ? addDays(next, by) : next
}

// ── 판 ──────────────────────────────────────────────────────

type Spot = { day: string; start: number }
type Layer =
  | { kind: 'add'; editId: string | null; from: Spot | null; orig: Spot | null }
  | { kind: 'detail'; id: string }
  | { kind: 'settings' }
  | { kind: 'allday'; day: string }
  | null

type Ask = { field: 'name' | 'chart'; q: string }

const countRow = ({ day, staffId, staffName, kindId, kindName, status, auto, origDay }: CalAppt): CalCountRow => ({
  day,
  staffId,
  staffName,
  kindId,
  kindName,
  status,
  auto,
  origDay,
})

export function CalendarScreen({ initialToday }: { initialToday: string }) {
  const worker = useCalendarWorkerObject()
  return (
    <div data-wide-page="" className="grid gap-3 max-md:gap-2">
      {worker ? (
        <Board worker={worker} initialToday={initialToday} />
      ) : (
        <p role="status" className="rounded-control border border-line bg-surface px-5 py-6 text-small text-muted">
          예약을 불러오는 중이에요
        </p>
      )}
    </div>
  )
}

function Board({ worker, initialToday }: { worker: CalendarWorkerHandle; initialToday: string }) {
  const client = useMemo(() => supabaseBrowser(), [])
  const { today, nowMin } = useClock(initialToday)
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, wideOnServer)
  const [view, setView] = useState<CalView>('week')
  const [anchor, setAnchor] = useState(initialToday)

  const period = readPeriod(view, anchor)
  const data = useCalendarData(period)
  const settings: CalSettings = data.settings ?? DEFAULT_CAL_SETTINGS
  const snap = data.snapshot
  const days = shownDays(view, anchor, settings.sunday)
  const month = monthOf(anchor)
  // 도구 줄·합계 줄의 기간: 일·주는 보이는 날, 월은 그 달
  const [shownFrom, shownTo] = view === 'month' ? [`${month}-01`, lastOfMonth(month)] : [days[0]!, days[days.length - 1]!]
  const appts = useMemo(() => snap?.appts ?? [], [snap])
  const allday = snap?.allday ?? []

  const [toast, setToast] = useState<{ text: string; n: number } | null>(null)
  const say = (text: string) => setToast((prev) => ({ text, n: (prev?.n ?? 0) + 1 }))
  useEffect(() => {
    if (toast === null) return
    const timer = setTimeout(() => setToast(null), TOAST_MS)
    return () => clearTimeout(timer)
  }, [toast])

  const api = useCalendarWorker(worker, {
    view,
    from: period.from,
    to: period.to,
    appts: view === 'month' ? null : (snap?.appts ?? null),
    onAuto: (pairs) => {
      const auto = new Map(pairs)
      data.update((s) => ({ ...s, appts: s.appts.map((a) => (auto.has(a.id) ? { ...a, auto: auto.get(a.id) ?? null } : a)) }))
    },
  })
  const ghosts = api.bit ? visibleGhosts(api.ghosts, appts) : []

  // ── 판 상태 ──
  const [layer, setLayer] = useState<Layer>(null)
  const [draft, setDraft] = useState<AddDraft>(() => newDraft(initialToday, FIRST_START))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState<ReadonlySet<string>>(new Set())
  const [ask, setAsk] = useState<Ask | null>(null)
  const [filled, setFilled] = useState<'name' | 'chart' | null>(null)

  function openLayer(next: Layer) {
    setLayer(next)
    setError(null)
    setBusy(false)
    setAsk(null)
    setFilled(null)
  }
  const close = () => openLayer(null)

  function openAdd(day: string, start: number) {
    if (data.settings === null) return
    setDraft(newDraft(day, start))
    openLayer({ kind: 'add', editId: null, from: null, orig: null })
  }
  function openAddNow() {
    const inView = inRange(today, shownFrom, shownTo)
    const day = inView ? today : shownFrom
    const start = day === today && nowMin !== null ? Math.min(Math.ceil((nowMin + 1) / 10) * 10, LAST_START) : FIRST_START
    openAdd(day, start)
  }

  // 판의 날짜를 바꾸면 그날이 보이게 기간을 옮긴다(시간 표의 새 예약 자리·경고가 그날 예약을 본다)
  function changeDraft(next: AddDraft) {
    if (next.day !== draft.day) {
      const shown = view === 'month' ? monthOf(next.day) === month : days.includes(next.day)
      if (!shown) setAnchor(next.day)
    }
    if (next.name !== draft.name) {
      const q = findQuery('name', next.name)
      setAsk(q === null ? null : { field: 'name', q })
      setFilled(null)
    } else if (next.chart !== draft.chart) {
      const q = findQuery('chart', next.chart)
      setAsk(q === null ? null : { field: 'chart', q })
      setFilled(null)
    }
    setDraft(next)
  }

  // 비트 찾기: 적고 400ms 멈추면 묻는다(비트 PC·더하기 판이 열렸을 때만)
  const { find, found } = api
  const askQ = api.bit && layer?.kind === 'add' ? (ask?.q ?? null) : null
  useEffect(() => {
    if (askQ === null) {
      find(null)
      return
    }
    const timer = setTimeout(() => find(askQ), FIND_WAIT_MS)
    return () => clearTimeout(timer)
  }, [askQ, find])

  // 한 명이면 바로 채운다: 이름으로 찾으면 차트번호(+ 비트 이름), 차트번호로 찾으면 이름
  const applied = useRef<typeof found>(null)
  useEffect(() => {
    if (found === null || found === applied.current || ask === null || found.q !== ask.q || !('rows' in found) || found.rows.length !== 1) return
    applied.current = found
    const row = found.rows[0]!
    setDraft((prev) => ({ ...prev, name: row.name, chart: row.chart }))
    setFilled(ask.field === 'name' ? 'chart' : 'name')
  }, [found, ask])

  // 월 보기에서 연 판의 경고: 그날 예약을 따로 읽는다(월 자료는 수만 있다)
  const panelDay = layer?.kind === 'add' && view === 'month' ? draft.day : null
  const [dayAppts, setDayAppts] = useState<{ day: string; appts: CalAppt[] } | null>(null)
  useEffect(() => {
    if (panelDay === null) return
    let live = true
    listAppts(client, panelDay, panelDay).then(
      (rows) => {
        if (live) setDayAppts({ day: panelDay, appts: rows })
      },
      () => {}, // 경고만 못 본다(저장은 막지 않는다)
    )
    return () => {
      live = false
    }
  }, [client, panelDay])
  const warnAppts = view === 'month' ? (dayAppts !== null && dayAppts.day === draft.day ? dayAppts.appts : []) : appts

  // ── 지금 기간 자료 바로 고치기 ──
  const inPeriod = (day: string) => inRange(day, period.from, period.to)
  function putAppt(saved: CalAppt) {
    data.update((s: CalendarSnapshot) => {
      if (s.counts !== null) return inPeriod(saved.day) ? { ...s, counts: [...s.counts, countRow(saved)] } : s
      const rest = s.appts.filter((a) => a.id !== saved.id)
      return { ...s, appts: inPeriod(saved.day) ? [...rest, saved] : rest }
    })
  }

  async function run(work: () => Promise<boolean>) {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const ok = await work()
      if (ok) data.refresh()
    } catch (caught) {
      setError(saveError(caught))
    } finally {
      setBusy(false)
    }
  }

  function saveAdd(fields: AddFields) {
    if (layer?.kind !== 'add') return
    const { editId, from } = layer
    void run(async () => {
      const saved = editId === null ? await addAppt(client, { ...fields, status: 'auto' }) : await updateAppt(client, editId, fields)
      if (saved === 'blocked') {
        setError(BLOCKED_APPT)
        return false
      }
      putAppt(saved)
      close()
      if (editId === null) say(`${dayLabel(saved.day)} ${hm(saved.start)} 예약을 넣었어요. ${SHARED}`)
      else if (from !== null && (from.day !== fields.day || from.start !== fields.start))
        say(`예약을 옮겼어요. '변경'으로 표시하고 원래 시간(${slotLabel(saved.origDay ?? from.day, saved.origStart ?? from.start)})을 남겼어요.`)
      else say(`예약을 고쳤어요. ${SHARED}`)
      return true
    })
  }

  function patchAppt(appt: CalAppt, patch: Partial<Pick<CalAppt, 'status'>>, done: string | null) {
    void run(async () => {
      const saved = await updateAppt(client, appt.id, patch)
      if (saved === 'blocked') {
        setError(BLOCKED_APPT)
        return false
      }
      putAppt(saved)
      if (done) say(done)
      return true
    })
  }

  function copyNextWeek(appt: CalAppt) {
    void run(async () => {
      const next = nextWeek(appt)
      const saved = await addAppt(client, next)
      if (saved === 'blocked') {
        setError(BLOCKED_APPT)
        return false
      }
      putAppt(saved)
      setCopied((prev) => new Set(prev).add(appt.id))
      let caution = ''
      try {
        const [there, thereAllDay] = await Promise.all([listAppts(client, next.day, next.day), listAllDay(client, next.day, next.day)])
        const found = warnings({ id: saved.id, day: next.day, start: next.start, len: next.len, staffId: next.staffId }, there, thereAllDay)
        if (found.overlap.length > 0 || found.off) caution = ' 그 시간에 같은 담당 예약이 있거나 휴무예요 — 확인해 주세요.'
      } catch {
        // 확인을 못 해도 넣은 것은 그대로다
      }
      say(`${dayLabel(next.day)} ${hm(next.start)}에 똑같이 넣었어요.${caution}`)
      return true
    })
  }

  function removeAppt(appt: CalAppt) {
    void run(async () => {
      await deleteAppt(client, appt.id)
      data.update((s) => ({ ...s, appts: s.appts.filter((a) => a.id !== appt.id) }))
      close()
      say('예약을 지웠어요.')
      return true
    })
  }

  function saveSettings(next: CalSettings) {
    void run(async () => {
      if ((await saveCalendarSettings(client, next)) === 'invalid') {
        setError(INVALID_SETTINGS)
        return false
      }
      data.setSettings(next)
      close()
      say(`설정을 저장했어요. ${SHARED}`)
      return true
    })
  }

  function saveAllDay(item: Omit<CalAllDay, 'id'>) {
    void run(async () => {
      const saved = await addAllDay(client, item)
      if (saved === 'blocked') {
        setError(BLOCKED_ALLDAY)
        return false
      }
      data.update((s) => ({ ...s, allday: [...s.allday, saved] }))
      close()
      return true
    })
  }

  function removeAllDay(id: string) {
    void run(async () => {
      await deleteAllDay(client, id)
      data.update((s) => ({ ...s, allday: s.allday.filter((d) => d.id !== id) }))
      close()
      return true
    })
  }

  // ── 도구 줄 ──
  function step(by: 1 | -1) {
    if (view === 'day') setAnchor(stepDay(anchor, by, settings.sunday))
    else if (view === 'week') setAnchor(addDays(anchor, 7 * by))
    else setAnchor(`${addMonths(month, by)}-01`)
  }
  function showDay(day: string) {
    setView('day')
    setAnchor(day)
  }

  // ── 그리기 ──
  const editing = layer?.kind === 'add' ? layer : null
  const draftWarn = editing
    ? warnings({ id: editing.editId, day: draft.day, start: draft.start, len: draft.len, staffId: draft.staffId ?? '' }, warnAppts, allday)
    : null
  const gridDraft =
    editing && draftWarn
      ? { day: draft.day, start: draft.start, len: draft.len, editing: editing.editId !== null, warn: draftWarn.overlap.length > 0 || draftWarn.off }
      : null
  const summaryRows: readonly CalCountRow[] =
    view === 'month' ? (snap?.counts ?? []).filter((r) => inRange(r.day, shownFrom, shownTo)) : appts.filter((a) => days.includes(a.day))
  const detail = layer?.kind === 'detail' ? (appts.find((a) => a.id === layer.id) ?? null) : null

  const lookup =
    api.bit && ask !== null && found !== null && found.q === ask.q ? (
      'code' in found ? (
        <p className="text-caption text-muted">{FIND_FAILED}</p>
      ) : (
        <BitPicks
          rows={found.rows}
          more={found.more}
          filled={filled}
          today={today}
          onPick={(picked) => {
            setDraft((prev) => ({ ...prev, name: picked.name, chart: picked.chart }))
            setFilled('chart')
            setAsk(null)
          }}
        />
      )
    ) : null

  let body
  if (data.status === 'failed') {
    body = (
      <div role="alert" className="grid justify-items-start gap-3 rounded-control border border-line bg-surface px-5 py-6">
        <p className="text-small text-ink">예약을 불러오지 못했어요. 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요.</p>
        <button type="button" className={ds.button.secondary} onClick={data.reload}>
          다시 불러오기
        </button>
      </div>
    )
  } else if (data.status === 'loading' || snap === null) {
    body = (
      <p role="status" className="rounded-control border border-line bg-surface px-5 py-6 text-small text-muted">
        예약을 불러오는 중이에요
      </p>
    )
  } else {
    body = (
      <>
        <SummaryLine key={`${view}|${shownFrom}`} view={view} from={shownFrom} to={shownTo} rows={summaryRows} settings={settings} />
        <CalendarLegend settings={settings} bit={api.bit} />
        {view === 'month' ? (
          <MonthGrid month={month} rows={snap.counts ?? []} allday={allday} settings={settings} today={today} onDay={showDay} />
        ) : narrow && view === 'week' ? (
          <PhoneWeekList
            key={days[0]}
            days={days}
            settings={settings}
            appts={appts}
            ghosts={ghosts}
            allday={allday}
            today={today}
            onAppt={(id) => openLayer({ kind: 'detail', id })}
            onGhost={() => say(GHOST_NOTE)}
            onAllDay={(day) => openLayer({ kind: 'allday', day })}
          />
        ) : (
          <TimeGrid
            days={days}
            settings={settings}
            appts={appts}
            ghosts={ghosts}
            allday={allday}
            today={today}
            nowMin={nowMin}
            draft={gridDraft}
            onSlot={openAdd}
            onAppt={(id) => openLayer({ kind: 'detail', id })}
            onGhost={() => say(GHOST_NOTE)}
            onAllDay={(day) => openLayer({ kind: 'allday', day })}
            onDay={showDay}
            onAdd={openAddNow}
          />
        )}
      </>
    )
  }

  return (
    <>
      <CalendarToolbar
        view={view}
        from={shownFrom}
        to={shownTo}
        onView={setView}
        onToday={() => setAnchor(today)}
        onPrev={() => step(-1)}
        onNext={() => step(1)}
        onSettings={() => {
          if (data.settings !== null) openLayer({ kind: 'settings' })
        }}
        onAdd={openAddNow}
      />
      {body}

      {editing && (
        <AddPanel
          mode={editing.editId === null ? 'new' : 'edit'}
          draft={draft}
          onDraft={changeDraft}
          settings={settings}
          appts={warnAppts}
          allday={allday}
          editId={editing.editId}
          orig={editing.orig}
          bit={api.bit}
          lookup={lookup}
          filled={filled}
          busy={busy}
          error={error}
          onSave={saveAdd}
          onClose={close}
          onSettings={() => openLayer({ kind: 'settings' })}
        />
      )}
      {detail && (
        <DetailPanel
          appt={detail}
          settings={settings}
          copied={copied.has(detail.id)}
          busy={busy}
          error={error}
          onClose={close}
          onArrival={(pick: ArrivalPick) => patchAppt(detail, { status: pick }, null)}
          onNextWeek={() => copyNextWeek(detail)}
          onEdit={() => {
            setDraft(draftOf(detail))
            openLayer({
              kind: 'add',
              editId: detail.id,
              from: { day: detail.day, start: detail.start },
              orig: detail.origDay !== null && detail.origStart !== null ? { day: detail.origDay, start: detail.origStart } : null,
            })
          }}
          onToggleCancel={() =>
            detail.status === 'cancel'
              ? patchAppt(detail, { status: 'auto' }, '취소를 되돌렸어요.')
              : patchAppt(detail, { status: 'cancel' }, '예약을 취소했어요. 칸은 흐리게 남아요.')
          }
          onDelete={() => removeAppt(detail)}
        />
      )}
      {layer?.kind === 'settings' && data.settings !== null && (
        <CalendarSettings settings={data.settings} busy={busy} error={error} onSave={saveSettings} onClose={close} />
      )}
      {layer?.kind === 'allday' && (
        <AllDayPanel
          day={layer.day}
          items={allday.filter((d) => d.day === layer.day)}
          settings={settings}
          busy={busy}
          error={error}
          onAdd={saveAllDay}
          onDelete={removeAllDay}
          onClose={close}
        />
      )}

      {toast && (
        <p
          key={toast.n}
          role="status"
          className="fixed bottom-6 left-1/2 z-60 w-max max-w-[calc(100%-32px)] -translate-x-1/2 rounded-control bg-ink px-4 py-2.5 text-small text-surface shadow-float"
        >
          {toast.text}
        </p>
      )}
    </>
  )
}
