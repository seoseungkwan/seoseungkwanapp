'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { isYmd } from '@/lib/analytics/dates'
import { HALF_DAY_NOON, parseStart, slotLabel, warnings } from '@/lib/calendar/rules'
import type { CalAllDay } from '@/lib/calendar/shapes'
import { APPT_MEMO_MAX, APPT_NAME_MAX } from '@/lib/storage/calendar'
import type { ApptDraft, CalAppt, CalSettings } from '@/types/calendar'
import { CalIcon, Swatch, dayLabel, hm } from './CalendarToolbar'
import { offText } from './rows/parts'

// 예약 더하기·고치기 판 (spec clinic-calendar AC-5905.2·AC-5905.6·AC-5906.2, 시안 ?s=new·phone-new·overlap-warn·off-warn).
// 판은 draft를 받아 onDraft로 돌려준다(화면이 쥔다 → 이름·차트번호가 바뀌면 화면이 비트에서 찾아 나머지 칸을 채운다).
// 비트 찾기 자리는 화면이 넣는 lookup 칸이다: 이 판은 비트 자료를 쥐지 않는다. 경고(담당 겹침·휴무)는 lib/calendar warnings, 저장은 막지 않는다.
// 반차 휴무(spec staff AC-7616)는 담당 칩이 '오전 휴무'·'오후 휴무'이고, 경고는 화면이 넘긴 noon(그 요일 병원 점심 시작) 앞뒤 반나절만이다.
// [저장]은 onSave로 칸만 넘긴다(이름·메모 앞뒤 빈칸 빼고, 빈 차트번호는 null). 서버에 넣는 일은 화면이 한다
// 시작은 쳐서 넣는 글 칸이다(spec calendar-colors AC-6002.2~4): 읽히면 바로 draft.start, 못 읽는 동안은 저장을 막고 벗어나면 오류 글

const START_ERROR = { format: '시간을 14:30처럼 적어 주세요', step: '5분 단위로 적어 주세요 (예: 14:30)' } as const
const LEN_MIN = 5
const LEN_MAX = 240
const LEN_STEP = 5
const CHART_MAX = 10

/** 판이 쥐는 칸. 차트번호는 글자(빈 글자 = 신환), 담당·종류는 고르기 전 null */
export type AddDraft = {
  day: string
  start: number
  len: number
  name: string
  chart: string
  staffId: string | null
  staffName: string
  staffMark: string
  kindId: string | null
  kindName: string
  memo: string
}

/** 저장할 칸(상태는 화면이 정한다: 새 예약은 auto, 고치기는 그대로) */
export type AddFields = Omit<ApptDraft, 'status'>

/** 빈 칸을 누른 자리의 새 예약(길이 30분) */
export function newDraft(day: string, start: number): AddDraft {
  return { day, start, len: 30, name: '', chart: '', staffId: null, staffName: '', staffMark: '', kindId: null, kindName: '', memo: '' }
}

/** 고칠 예약의 칸(차트번호 null은 빈 글자) */
export function draftOf(appt: CalAppt): AddDraft {
  return {
    day: appt.day,
    start: appt.start,
    len: appt.len,
    name: appt.name,
    chart: appt.chart ?? '',
    staffId: appt.staffId,
    staffName: appt.staffName ?? '', // 시행자 없는 예약(구글에서 옴)은 빈 글 — 고치기 판의 '없음'은 TASK-12
    staffMark: appt.staffMark ?? '',
    kindId: appt.kindId,
    kindName: appt.kindName,
    memo: appt.memo,
  }
}

// ── 오른쪽 판 틀(예약 더하기·자세히·설정이 같이 쓴다, 시안 .drawer 460px) ──────────

/** 오른쪽에서 나오는 판: 머리(제목·닫기) · 몸(스크롤) · 발(단추). Esc·바탕 누름은 닫기다. 폰은 전체 폭 */
export function Drawer({ title, onClose, foot, children }: { title: string; onClose(): void; foot: ReactNode; children: ReactNode }) {
  const titleId = useId()
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} />
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="fixed top-0 right-0 bottom-0 z-50 flex w-115 max-w-full flex-col border-l border-line-strong bg-surface shadow-float max-md:border-l-0"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-5 max-md:pl-4">
          <h2 id={titleId} className="text-lead font-semibold text-ink">
            {title}
          </h2>
          <button type="button" aria-label="닫기" className={`${ds.button.ghostSmall} text-muted`} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-4 overflow-y-auto px-5 pt-4 pb-5 max-md:px-4">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3 max-md:px-4">{foot}</div>
      </aside>
    </>
  )
}

// ── 판 안 작은 조각 ─────────────────────────────────────────

/** 고르는 단추(시안 .ob): 36px·13px, 눌리면 accent */
export const optionButton = (pressed: boolean) =>
  `inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-control border px-2 text-small whitespace-nowrap ${ds.focusRing} max-md:h-11 ${
    pressed ? 'border-accent bg-accent-soft font-semibold text-accent-strong ring-1 ring-accent ring-inset' : 'border-line-strong bg-surface text-ink hover:bg-canvas'
  }`
/** 칸 이름 줄(시안 .field > label·.lb, 13px 600) */
const LABEL = 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink'
const HINT = 'text-caption font-normal text-muted'
const FIELD =
  'w-full min-w-0 rounded-control border px-2 text-body text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent max-md:text-lead'
const TONE = 'border-line-strong bg-surface'
// 비트에서 채운 칸(시안 .inp.filled): 옅은 초록
const inputOf = (filled: boolean) => `${FIELD} h-10 max-md:h-11 ${filled ? 'border-positive bg-positive-soft' : TONE}`
const INPUT = inputOf(false)
/** 안내 한 줄(아이콘 + 12px muted) */
export function InfoLine({ children }: { children: string }) {
  return (
    <p className="flex items-start gap-1.5 text-caption text-muted">
      <CalIcon name="info" size={14} className="mt-0.5" />
      <span>{children}</span>
    </p>
  )
}
/** 노란 경고 상자(시안 .wbox) */
function WarnBox({ who, children }: { who: string; children: string }) {
  return (
    <p role="alert" className="flex items-start gap-2 rounded-control border border-warning bg-warning-soft px-3 py-2 text-small text-ink">
      <CalIcon name="warn" className="mt-0.5" />
      <span>
        <b className="font-semibold text-warning">{who}</b>
        {children}
      </span>
    </p>
  )
}

type AddPanelProps = {
  mode: 'new' | 'edit'
  draft: AddDraft
  onDraft(next: AddDraft): void
  settings: CalSettings
  appts: readonly CalAppt[] // 경고를 볼 예약(보이는 기간)
  allday: readonly CalAllDay[] // 휴무를 볼 종일 항목
  noon?: number // 반차 휴무 경계(분) — 그 날 요일 병원 점심 시작, 없으면 13:00
  editId?: string | null // 고치는 예약 id(자기 자신과는 겹침을 보지 않는다)
  orig?: { day: string; start: number } | null // 고치는 예약의 처음 자리(있으면 변경 안내에 적는다)
  bit: boolean // 비트 PC면 안내 상자 + lookup 자리, 아니면 손으로 적는다
  lookup?: ReactNode // 비트 찾기 결과 자리(화면이 그린다)
  filled?: 'name' | 'chart' | null // 비트에서 채운 칸(옅은 초록)
  busy?: boolean
  error?: ReactNode
  onSave(fields: AddFields): void
  onClose(): void
  onSettings?(): void
}

/** 예약 더하기·고치기 판 */
export function AddPanel({
  mode,
  draft,
  onDraft,
  settings,
  appts,
  allday,
  noon = HALF_DAY_NOON,
  editId = null,
  orig = null,
  bit,
  lookup,
  filled = null,
  busy = false,
  error,
  onSave,
  onClose,
  onSettings,
}: AddPanelProps) {
  const ids = useId()
  const set = (patch: Partial<AddDraft>) => onDraft({ ...draft, ...patch })
  // 그날 휴무인 시행자 → 담당 칩 글('휴무'·반차면 '오전 휴무'·'오후 휴무')
  const offLabels = new Map(allday.filter((d) => d.type === 'off' && d.day === draft.day).map((d) => [d.staffId, offText(d.part)]))

  const found = warnings({ id: editId, day: draft.day, start: draft.start, len: draft.len, staffId: draft.staffId ?? '' }, appts, allday, noon)
  const who = `(${draft.staffMark}) ${draft.staffName}`
  const overlapText = found.overlap
    .map((id) => appts.find((a) => a.id === id))
    .filter((a) => a !== undefined)
    .map((a) => `${hm(a.start)}–${hm(a.start + a.len)} ${a.chart ? `${a.chart} ` : ''}${a.name} ${a.kindName}`)
    .join(', ')
  const warned = found.overlap.length > 0 || found.off

  // 시작 글: 지금 draft 시각 HH:MM 그대로면 그 시각(보이는 시간 밖 값이 오후로 바뀌지 않게), 아니면 parseStart
  const [startText, setStartText] = useState(() => hm(draft.start))
  const [startTouched, setStartTouched] = useState(false)
  const readStart = (text: string) => (text.trim() === hm(draft.start) ? draft.start : parseStart(text, settings.openHour, settings.closeHour))
  // 판 밖에서 draft 시각이 바뀌면(빈 칸을 다시 누름) 글도 그 시각으로, 오류는 지운다(AC-6002.4)
  const [seenStart, setSeenStart] = useState(draft.start)
  if (seenStart !== draft.start) {
    setSeenStart(draft.start)
    if (readStart(startText) !== draft.start) {
      setStartText(hm(draft.start))
      setStartTouched(false)
    }
  }
  const startRead = readStart(startText)
  const startError = startTouched && typeof startRead !== 'number' ? START_ERROR[startRead] : null

  const missing = [
    typeof startRead === 'number' ? null : '시작',
    draft.name.trim() ? null : '이름',
    draft.staffId ? null : '담당',
    draft.kindId ? null : '종류',
  ].filter((m) => m !== null)
  const ready = missing.length === 0

  // 시작 고르기 목록: 보이는 시간 안 5분 칸(google-link AC-8503.3, 지금 값이 칸 밖이면 그 값도 둔다)
  const starts: number[] = []
  for (let m = settings.openHour * 60; m < settings.closeHour * 60; m += 5) starts.push(m)
  if (!starts.includes(draft.start)) starts.push(draft.start)
  starts.sort((a, b) => a - b)

  const staffKnown = draft.staffId !== null && settings.staff.some((s) => s.id === draft.staffId)
  const kindKnown = draft.kindId !== null && settings.kinds.some((k) => k.id === draft.kindId)

  function save() {
    if (!ready || busy || draft.staffId === null || draft.kindId === null) return
    onSave({
      day: draft.day,
      start: draft.start,
      len: draft.len,
      name: draft.name.trim(),
      chart: draft.chart === '' ? null : draft.chart,
      staffId: draft.staffId,
      staffName: draft.staffName,
      staffMark: draft.staffMark,
      kindId: draft.kindId,
      kindName: draft.kindName,
      memo: draft.memo.trim(),
    })
  }

  const foot = (
    <>
      {!ready && (
        <span data-need className="min-w-35 flex-1 text-caption text-muted">
          {`${missing.join('·')} 칸을 채우면 저장할 수 있어요`}
        </span>
      )}
      {error && (
        <p role="alert" className={`${ds.fieldError} basis-full text-right`}>
          {error}
        </p>
      )}
      <button type="button" className={ds.button.secondary} onClick={onClose}>
        취소
      </button>
      <button type="button" disabled={!ready} aria-busy={busy || undefined} className={ds.button.primary} onClick={save}>
        {warned ? '그래도 저장' : '저장'}
      </button>
    </>
  )

  return (
    <Drawer title={mode === 'edit' ? '예약 고치기' : '예약 더하기'} onClose={onClose} foot={foot}>
      {bit && (
        <p className="flex items-start gap-2 rounded-control bg-accent-soft px-2 py-2 text-caption text-accent-strong">
          <CalIcon name="bit" size={14} className="mt-0.5" />
          <span>비트 PC예요. 이름이나 차트번호를 적으면 비트에서 찾아 나머지 하나를 채워요.</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor={`${ids}-day`} className={LABEL}>
            날짜
          </label>
          <input
            id={`${ids}-day`}
            type="date"
            value={draft.day}
            className={INPUT}
            onChange={(event) => {
              if (isYmd(event.target.value)) set({ day: event.target.value })
            }}
          />
          <span className={HINT}>{dayLabel(draft.day)}</span>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor={`${ids}-start`} className={LABEL}>
            시작
          </label>
          <input
            id={`${ids}-start`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            placeholder="예: 1430"
            list={`${ids}-starts`}
            value={startText}
            aria-invalid={startError ? true : undefined}
            aria-describedby={`${ids}-start-hint`}
            className={`${INPUT} tabular-nums aria-invalid:border-negative`}
            onChange={(event) => {
              const text = event.target.value
              setStartText(text)
              setStartTouched(false)
              const read = readStart(text)
              if (typeof read === 'number' && read !== draft.start) set({ start: read })
            }}
            onBlur={() => {
              setStartTouched(true)
              if (typeof startRead === 'number') setStartText(hm(startRead))
            }}
          />
          <datalist id={`${ids}-starts`}>
            {starts.map((m) => (
              <option key={m} value={hm(m)} />
            ))}
          </datalist>
          <span id={`${ids}-start-hint`} className={startError ? ds.fieldError : HINT}>
            {startError ?? '1430처럼 쳐도 돼요 · 5분 단위'}
          </span>
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor={`${ids}-name`} className={LABEL}>
            이름
          </label>
          <input
            id={`${ids}-name`}
            value={draft.name}
            maxLength={APPT_NAME_MAX}
            autoComplete="off"
            placeholder={bit ? '이름 앞 두 글자부터 찾아요' : '이름'}
            data-filled={filled === 'name' ? 'true' : undefined}
            className={inputOf(filled === 'name')}
            onChange={(event) => set({ name: event.target.value })}
          />
        </div>
        <div className="grid min-w-0 content-start gap-1.5">
          <label htmlFor={`${ids}-chart`} className={LABEL}>
            차트번호 <span className={HINT}>신환이면 비워요</span>
          </label>
          <input
            id={`${ids}-chart`}
            value={draft.chart}
            inputMode="numeric"
            autoComplete="off"
            placeholder={bit ? '이름을 고르면 채워져요' : '차트번호'}
            data-filled={filled === 'chart' ? 'true' : undefined}
            className={`${inputOf(filled === 'chart')} tabular-nums`}
            onChange={(event) => set({ chart: event.target.value.replace(/\D/g, '').slice(0, CHART_MAX) })}
          />
        </div>
        {bit && lookup && <div className="col-span-2 grid gap-1.5">{lookup}</div>}
      </div>
      {!bit && <InfoLine>비트 PC에서는 자동으로 채워져요</InfoLine>}
      {mode === 'edit' && (
        <InfoLine>{`날짜나 시작 시간을 바꾸면 예약표에 '변경'으로 보이고 처음 시간이 남아요${
          orig ? ` (지금: 원래 ${slotLabel(orig.day, orig.start)})` : ''
        }. 길이·담당·종류·메모만 바꾸면 표시하지 않아요.`}</InfoLine>
      )}

      <div className="grid gap-1.5">
        <span className={LABEL}>
          담당 <span className={HINT}>(시행자)</span>
        </span>
        <div role="group" aria-label="담당" className="flex flex-wrap gap-1.5">
          {settings.staff.map((person) => (
            <button
              key={person.id}
              type="button"
              aria-pressed={draft.staffId === person.id}
              className={optionButton(draft.staffId === person.id)}
              onClick={() => set({ staffId: person.id, staffName: person.name, staffMark: person.mark })}
            >
              <Swatch color={person.color} />({person.mark}) {person.name}
              {offLabels.has(person.id) && (
                <span className="rounded-control bg-warning-soft px-1 text-caption leading-4 font-semibold text-warning">{offLabels.get(person.id)}</span>
              )}
            </button>
          ))}
          {draft.staffId !== null && !staffKnown && (
            <button type="button" aria-pressed="true" className={optionButton(true)}>
              ({draft.staffMark}) {draft.staffName}
            </button>
          )}
        </div>
        {settings.staff.length === 0 && (
          <p className="flex flex-wrap items-center gap-2 text-caption text-muted">
            <span>설정에서 시행자를 먼저 더해 주세요</span>
            {onSettings && (
              <button type="button" className={ds.button.secondarySmall} onClick={onSettings}>
                설정
              </button>
            )}
          </p>
        )}
      </div>

      <div className="grid gap-1.5">
        <span className={LABEL}>종류</span>
        <div role="group" aria-label="종류" className="flex flex-wrap gap-1.5">
          {settings.kinds.map((kind) => (
            <button
              key={kind.id}
              type="button"
              aria-pressed={draft.kindId === kind.id}
              className={optionButton(draft.kindId === kind.id)}
              onClick={() => set({ kindId: kind.id, kindName: kind.name, len: kind.len })}
            >
              <Swatch color={kind.color} />
              {kind.name} <span className="text-caption font-normal text-muted">{kind.len}분</span>
            </button>
          ))}
          {draft.kindId !== null && !kindKnown && (
            <button type="button" aria-pressed="true" className={optionButton(true)}>
              {draft.kindName}
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-1.5">
        <span className={LABEL}>
          길이 <span className={HINT}>종류를 고르면 그 종류의 기본 길이가 들어가요 · 5분씩 바꿔요</span>
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <div className="inline-flex items-center overflow-clip rounded-control border border-line-strong bg-surface">
            <button
              type="button"
              aria-label="5분 줄이기"
              disabled={draft.len <= LEN_MIN}
              className={`grid size-9 cursor-pointer place-items-center text-lead text-ink-2 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 ${ds.focusRing}`}
              onClick={() => set({ len: Math.max(LEN_MIN, draft.len - LEN_STEP) })}
            >
              −
            </button>
            <output className="grid h-9 min-w-16 place-items-center border-x border-line font-semibold text-ink tabular-nums max-md:h-11">{draft.len}분</output>
            <button
              type="button"
              aria-label="5분 늘리기"
              disabled={draft.len >= LEN_MAX}
              className={`grid size-9 cursor-pointer place-items-center text-lead text-ink-2 hover:bg-canvas disabled:cursor-not-allowed disabled:opacity-40 max-md:size-11 ${ds.focusRing}`}
              onClick={() => set({ len: Math.min(LEN_MAX, draft.len + LEN_STEP) })}
            >
              +
            </button>
          </div>
          <span className="text-small text-ink-2 tabular-nums">{`${hm(draft.start)} – ${hm(draft.start + draft.len)}`}</span>
        </div>
      </div>

      <div className="grid gap-1.5">
        <label htmlFor={`${ids}-memo`} className={LABEL}>
          메모 <span className={HINT}>선택</span>
        </label>
        <textarea
          id={`${ids}-memo`}
          value={draft.memo}
          maxLength={APPT_MEMO_MAX}
          placeholder="예: 허리, 3회차"
          className={`${FIELD} ${TONE} h-15 resize-y py-2`}
          onChange={(event) => set({ memo: event.target.value })}
        />
      </div>

      {warned && (
        <div className="grid gap-2">
          {found.overlap.length > 0 && <WarnBox who={who}>{` 담당에게 같은 시간 예약이 있어요: ${overlapText}. 겹쳐도 저장할 수 있어요.`}</WarnBox>}
          {found.off && <WarnBox who={who}>{` 담당은 ${dayLabel(draft.day)} 휴무예요. 그래도 저장할 수 있어요.`}</WarnBox>}
        </div>
      )}
    </Drawer>
  )
}
