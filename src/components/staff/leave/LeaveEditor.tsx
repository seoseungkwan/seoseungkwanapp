'use client'

import { useEffect, useId, useMemo, useState, type CSSProperties } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { useViewing } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { compareYmd, isYmd } from '@/lib/analytics/dates'
import { josa } from '@/lib/calendar/josa'
import { StaffStoreError, type StaffStore } from '@/lib/storage/staff'
import type { ClinicProfile, ClinicStaff } from '@/types/clinicProfile'
import type { ErrorCode } from '@/types/errors'
import type { DayChange, Leave, LeaveKind, StaffMember, StaffSettings, WeekPlan } from '@/types/staff'
import { LEAVE_KIND_LABEL, jobLabel } from '../labels'
import { GcalOffResult } from './GcalOffResult'
import {
  HALF_HEAD,
  LINKED_HEAD,
  NEXT_LABEL,
  NOW_LABEL,
  SAVED_BUTTON,
  STAFF_HEAD,
  dayLine,
  koreaHm,
  leaveChange,
  loadWindow,
  offDaysFor,
  offPersonOf,
  previewDays,
  previewWindow,
  savedNotice,
  sendAll,
  type DayPreview,
  type OffCtx,
  type WindowData,
} from './gcalOff'
import { Choice, LeaveDialog } from './LeaveDialog'
import { countableDays, dayCtxOf, deductOf, draftRows, fmtDays, leftBeforeAfter, linkOf, mmdd, weekdayName } from './leaveView'

// 휴가 넣기·고치기 칸 (staff AC-7614.3, 시안 leave.html ③). 사람(재직자)·종류 여섯·날짜(하루 / 여러 날)·메모를 고르면
// 미리 보기 줄이 저장 뒤 남은 연차를 보인다(진짜 연차 셈으로 — 표 숫자와 같다). 여러 날은 그 사람 근무표에서 일하는 날만 센다(AC-7605.6).
// 예약 시행자와 이어진 사람이면 예약 달력 '휴무' 안내와, 그날 예약이 있으면 경고(예약 수만 센다 — AC-7610.5)를 보인다.
// 셀 날이 없거나 이미 휴가인 날이 있으면 저장을 막는다. 저장 = 펼친 날마다 한 줄을 한 묶음으로(고치기는 그 묶음을 지우고 다시 넣기, AC-7610.2)
// 구글 캘린더와 이은 병원(off, google-link REQ-8537)이면 칸이 두 칸 너비다: 파란 상자에 구글 off 줄 '지금 → 저장하면'(맡는 사람의 하루 종일 휴가),
// 반차는 구글에 넣지 않는다는 글, 오른쪽 '저장하면 이렇게 바뀌어요'. [저장]하면 칸을 닫지 않고 '저장한 뒤'로 바꾸며(뒤 표는 다시 읽고 칸은 저장한 때 모습 그대로),
// 휴가 날(고치기는 옛 날도)마다 off 날을 바로 보낸다. 다 보내면 '구글 캘린더에도 적었어요 · {HH:mm}'와 넣기 알림, 못 보내면 조용히(다음 맞춤이 보냄).
// 잇지 않은 병원(off = null)은 지금 글·동작 그대로다(AC-8537.3)

const KINDS: readonly { value: LeaveKind; text: string }[] = (['annual', 'half', 'family', 'sick', 'maternity', 'unpaid'] as const).map((value) => ({
  value,
  text: LEAVE_KIND_LABEL[value],
}))
const MODES = [
  { value: 'one', text: '하루' },
  { value: 'range', text: '여러 날 (시작~끝)' },
] as const
const PARTS = [
  { value: 'am', text: '오전' },
  { value: 'pm', text: '오후' },
] as const
const PAID = [
  { value: 'paid', text: '유급' },
  { value: 'unpaid', text: '무급' },
] as const
const MEMO_MAX = 50

const NOT_DEDUCTED: Partial<Record<LeaveKind, string>> = {
  family: '연차에서 빼지 않아요.',
  maternity: '연차에서 빼지 않아요.',
  unpaid: '연차에서 빼지 않아요. 이달 세무사 자료에 무급 일수로 들어가요.',
}

// 받침이 있으면 '과', 없으면 '와'(한글이 아닌 끝 글자는 '과')
function withAnd(name: string): string {
  const code = name.charCodeAt(name.length - 1) - 0xac00
  return `${name}${code >= 0 && code <= 11171 && code % 28 === 0 ? '와' : '과'}`
}

export type EditorPreset = { staffId: string | null; day: string | null; group: Leave[] | null }

type LeaveEditorProps = {
  /** 고를 수 있는 사람(재직자, 고치는 휴가의 사람은 퇴사자여도 든다) */
  choices: readonly StaffMember[]
  leaves: readonly Leave[]
  changes: readonly DayChange[]
  plans: readonly WeekPlan[]
  settings: StaffSettings
  profile: ClinicProfile
  today: string
  preset: EditorPreset
  store: Pick<StaffStore, 'addLeaveGroup' | 'replaceLeaveGroup' | 'countAppts'>
  /** 구글 캘린더와 이은 병원이면 연결(없으면 지금 그대로) */
  off?: OffCtx | null
  /** 저장됨. keepOpen = 이은 병원이라 칸을 연 채 '저장한 뒤'를 보인다(화면은 휴가만 다시 읽는다) */
  onSaved(keepOpen?: boolean): void
  /** 짧은 알림(칸을 닫아도 남게 화면이 띄운다) */
  onNotice?(text: string): void
  /** 고치기(지우고 다시 넣기)가 실패함 — 지우기만 됐을 수 있어 칸은 연 채 휴가를 다시 읽는다(AC-7614.3) */
  onFailed(): void
  onClose(): void
}

const rowLabel = 'pt-2 text-small font-semibold text-ink-2'
const offChip = 'inline-block max-w-full truncate rounded-control px-2 py-0.5 text-caption font-semibold'
const formRow = 'grid grid-cols-[4.5rem_minmax(0,1fr)] items-start gap-3'
const dateInput = `${ds.input} w-auto max-w-50`

/** 지금 글은 받침 있으면 '과'(한글 아닌 끝 글자도 '과'), 이은 병원은 조사 규칙(josa — 한글 아닌 끝 글자는 받침 없음, design.md 2절 표 7) */
const linkText = (link: ClinicStaff, linked: boolean) =>
  `(예약 시행자 (${link.mark}) ${linked ? `${link.name}${josa(link.name, '와/과')}` : withAnd(link.name)} 이어져 있어요)`

function GoogleChip({ text, off }: { text: string; off: OffCtx }) {
  const style: CSSProperties = { background: `var(--cal-${off.info.offColor})`, color: `var(--cal-${off.info.offColor}-on)` }
  return (
    <span className={offChip} style={style}>
      {text}
    </span>
  )
}

type Saved = { views: DayPreview[] | null; sentAt: string | null }

export function LeaveEditor({
  choices,
  leaves,
  changes,
  plans,
  settings,
  profile,
  today,
  preset,
  store,
  off = null,
  onSaved,
  onFailed,
  onClose,
  onNotice,
}: LeaveEditorProps) {
  const ids = { person: useId(), memo: useId() }
  const viewHospitalId = useViewing()?.hospitalId ?? null
  const group = preset.group
  const first = group?.[0] ?? null
  const [staffId, setStaffId] = useState(first?.staffId ?? preset.staffId ?? '')
  const [kind, setKind] = useState<LeaveKind>(first?.kind ?? 'annual')
  const [part, setPart] = useState<'am' | 'pm'>(first?.part ?? 'am')
  const [paid, setPaid] = useState(first?.kind === 'sick' ? first.paid : true)
  const [mode, setMode] = useState<'one' | 'range'>(group !== null && group.length > 1 ? 'range' : 'one')
  const startDay = group?.[0]?.day ?? preset.day ?? today
  const [from, setFrom] = useState(startDay)
  const [to, setTo] = useState(group?.[group.length - 1]?.day ?? startDay)
  const [memo, setMemo] = useState(first?.memo ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)
  const [appts, setAppts] = useState<{ key: string; list: { day: string; count: number }[] } | null>(null)
  // 이은 병원: 저장한 때의 휴가(뒤 화면이 다시 읽어도 칸은 넣기 전 셈 그대로) · 저장한 뒤 모습 · 미리 보기 넷째 날 자료
  const [held, setHeld] = useState<readonly Leave[] | null>(null)
  const [saved, setSaved] = useState<Saved | null>(null)
  const [win, setWin] = useState<{ key: string; data: WindowData } | null>(null)
  const leavesNow = held ?? leaves

  const person = choices.find((m) => m.id === staffId) ?? null
  const link = person ? linkOf(person, profile.staff) : null
  const groupId = first?.groupId ?? null

  const days = useMemo(
    () => (person ? countableDays(person, from, mode === 'one' ? from : to, { plans, changes, day: dayCtxOf(profile) }) : []),
    [person, from, to, mode, plans, changes, profile],
  )
  const rows = person ? draftRows(person.id, days, { kind, part, paid, memo }) : []
  const taken = person ? days.find((day) => leavesNow.some((l) => l.staffId === person.id && l.day === day && l.groupId !== groupId)) : undefined
  const problem = person === null ? null : days.length === 0 ? '휴가로 셀 날이 없어요.' : taken !== undefined ? `${mmdd(taken)}에 이미 휴가가 있어요.` : null
  const left = person ? leftBeforeAfter(person, leavesNow, settings, today, { groupId, rows }) : null

  // 구글 off 줄(이은 병원만): 미리 보기 넷째 날(첫 휴가 날 앞 이틀 ~ 다음 날)을 읽어 저장하면 바뀔 모습을 셈한다
  const original = first === null ? null : (choices.find((m) => m.id === first.staffId) ?? null)
  const firstDay = rows[0]?.day ?? from
  const winFirst = off !== null && isYmd(firstDay) ? firstDay : null
  useEffect(() => {
    if (off === null || winFirst === null) return
    let current = true
    loadWindow(off.store, previewDays(winFirst)).then(
      (data) => current && setWin({ key: winFirst, data }),
      () => current && setWin({ key: winFirst, data: { allday: [], offDays: [] } }),
    )
    return () => {
      current = false
    }
  }, [off, winFirst])
  const winData = win !== null && win.key === winFirst ? win.data : null
  const marks = useMemo(() => new Map(profile.staff.map((s) => [s.id, s.mark])), [profile.staff])
  const change = leaveChange(person, rows, group !== null && original !== null ? { member: original, days: group.map((l) => l.day) } : null, profile.staff)
  const preview = off !== null && winFirst !== null && winData !== null ? previewWindow(previewDays(winFirst), winData, off, marks, change) : null
  const titles = preview?.titles.get(firstDay) ?? null
  const offPerson = off !== null && person !== null ? offPersonOf(person, profile.staff, off.scope) : null
  const googleOff = off !== null && offPerson !== null && kind !== 'half' && compareYmd(firstDay, off.info.linkedOn) >= 0

  // 이어진 사람의 그날 예약 수(경고만 — 저장은 막지 않는다). 못 세면 경고 없이 둔다.
  // 관리자가 다른 의원을 보는 중이면 보는 의원 id를 함께 넘겨 예약 표 대신 관리자 비교 읽기로 센다(admin-view AC-8009.4)
  const apptKey = link && days.length > 0 ? `${link.id}|${days.join(',')}` : null
  useEffect(() => {
    if (apptKey === null) return
    let current = true
    const [calendarStaffId, list] = apptKey.split('|')
    const counting = viewHospitalId === null ? store.countAppts(calendarStaffId, list.split(',')) : store.countAppts(calendarStaffId, list.split(','), viewHospitalId)
    counting.then(
      (counts) => current && setAppts({ key: apptKey, list: counts }),
      () => current && setAppts({ key: apptKey, list: [] }),
    )
    return () => {
      current = false
    }
  }, [apptKey, store, viewHospitalId])
  const warnings = appts !== null && appts.key === apptKey ? appts.list.filter((a) => a.count > 0) : []

  const changeMode = (next: 'one' | 'range') => {
    setMode(next)
    if (next === 'one') setTo(from)
  }
  const changeDay = (value: string) => {
    setFrom(value)
    setTo(value)
  }

  async function save() {
    if (person === null || problem !== null || busy || saved !== null) return
    setBusy(true)
    setError(null)
    try {
      if (groupId !== null) await store.replaceLeaveGroup(groupId, rows)
      else await store.addLeaveGroup(rows)
    } catch (e) {
      setError(e instanceof StaffStoreError ? e.code : 'E-STAFF-SAVE-FAILED')
      setBusy(false)
      // 넣기는 한 번에 들어가거나 안 들어가 다시 읽을 것이 없다. 고치기는 지운 뒤 넣기가 실패했을 수 있어 뒤 표·달력을 DB와 맞춘다
      if (groupId !== null) onFailed()
      return
    }
    if (off === null) {
      onSaved()
      return
    }
    await sendAfterSave(off, person)
  }

  // 이은 병원: 칸은 연 채 '저장한 뒤'로 바꾸고 날마다 off 날을 보낸 뒤(못 보내면 조용히) 다시 읽어 그린다
  async function sendAfterSave(ctx: OffCtx, who: StaffMember) {
    const days = [...offDaysFor(rows, who, ctx, profile.staff), ...(group !== null && original !== null ? offDaysFor(group, original, ctx, profile.staff) : [])]
    const sendDays = [...new Set(days)].sort(compareYmd)
    setHeld(leaves)
    setSaved({ views: preview?.views ?? null, sentAt: null })
    setBusy(false)
    onSaved(true)
    const ok = await sendAll(ctx.store, sendDays)
    const data = winFirst === null ? null : await loadWindow(ctx.store, previewDays(winFirst)).catch(() => null)
    const views = data !== null && winFirst !== null ? previewWindow(previewDays(winFirst), data, ctx, marks, null).views : null
    setSaved((prev) => ({ views: views ?? prev?.views ?? null, sentAt: ok ? koreaHm(new Date()) : null }))
    if (ok && group === null) onNotice?.(savedNotice(sendDays[0]))
  }

  const deducts = deductOf(kind) > 0
  const sameLeft = left ? fmtDays(left.before) : ''

  const body = (
    <>
      <div className="grid gap-4">
        <div className={formRow}>
          <label htmlFor={ids.person} className={rowLabel}>
            사람
          </label>
          <select id={ids.person} value={staffId} onChange={(e) => setStaffId(e.target.value)} className={ds.input}>
            <option value="">사람을 고르세요</option>
            {choices.map((m) => (
              <option key={m.id} value={m.id}>
                {`${m.name} · ${jobLabel(m)}`}
              </option>
            ))}
          </select>
        </div>

        <div className={formRow}>
          <span className={rowLabel}>종류</span>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <Choice<LeaveKind> label="종류" options={KINDS} value={kind} onChange={setKind} />
            {kind === 'half' ? <Choice<'am' | 'pm'> label="오전·오후" options={PARTS} value={part} onChange={setPart} /> : null}
            {kind === 'sick' ? (
              <Choice<'paid' | 'unpaid'> label="유급·무급" options={PAID} value={paid ? 'paid' : 'unpaid'} onChange={(v) => setPaid(v === 'paid')} />
            ) : null}
          </div>
        </div>

        <div className={formRow}>
          <span className={rowLabel}>날짜</span>
          <div className="flex min-w-0 flex-col items-start gap-2">
            <Choice<'one' | 'range'> label="하루·여러 날" options={MODES} value={mode} onChange={changeMode} />
            {mode === 'one' ? (
              <span className="flex items-center gap-2">
                <input type="date" aria-label="날짜" value={from} onChange={(e) => changeDay(e.target.value)} className={dateInput} />
                {isYmd(from) ? <span className={ds.help}>({weekdayName(from)})</span> : null}
              </span>
            ) : (
              <span className="flex flex-wrap items-center gap-2">
                <input type="date" aria-label="시작 날짜" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInput} />
                <span className={ds.help}>~</span>
                <input type="date" aria-label="끝 날짜" value={to} onChange={(e) => setTo(e.target.value)} className={dateInput} />
              </span>
            )}
          </div>
        </div>

        <div className={formRow}>
          <label htmlFor={ids.memo} className={rowLabel}>
            메모
          </label>
          <input id={ids.memo} value={memo} maxLength={MEMO_MAX} onChange={(e) => setMemo(e.target.value)} className={ds.input} />
        </div>
      </div>

      {person !== null && left !== null ? (
        <>
          {days.length > 0 && (deducts || mode === 'range') ? (
            <section aria-label="미리 보기" className="flex flex-wrap items-baseline gap-1.5 rounded-control border border-line bg-canvas px-3 py-2 text-body text-ink-2">
              <span>{mode === 'range' ? `쉬는 날 빼고 ${fmtDays(days.length)} · 남은 연차` : `${person.name} 님 남은 연차`}</span>{' '}
              <b className="text-lead font-semibold text-ink">{fmtDays(left.before)}</b> <span className="text-muted">→</span>{' '}
              <span className={`text-lead font-semibold ${left.after < 0 ? 'text-negative' : 'text-accent'}`}>{fmtDays(left.after)}</span>
            </section>
          ) : null}
          {mode === 'range' ? <p className={ds.help}>그 사람 근무표에서 쉬는 요일·공휴일·휴진일은 세지 않아요.</p> : null}
          {kind === 'sick' ? (
            <p className="text-small text-ink-2">{`연차에서 빼지 않아요. 남은 연차는 그대로 ${sameLeft}이에요. 무급을 고르면 이달 세무사 자료에 무급 일수로 들어가요.`}</p>
          ) : NOT_DEDUCTED[kind] ? (
            <p className="text-small text-ink-2">{NOT_DEDUCTED[kind]}</p>
          ) : null}
          {off !== null && googleOff ? (
            <div data-off-box="" className="grid gap-2 rounded-control bg-accent-soft px-3 py-2 text-small text-ink-2">
              <p>
                <b className="font-semibold text-accent-strong">{link !== null ? LINKED_HEAD : STAFF_HEAD}</b>
                {link !== null ? (
                  <>
                    {' '}
                    <span className="text-caption text-muted">{linkText(link, true)}</span>
                  </>
                ) : null}
              </p>
              {titles !== null && (titles.now || titles.next) ? (
                <dl className="grid grid-cols-[3.5rem_minmax(0,1fr)] items-center gap-x-2.5 gap-y-1.5 text-caption text-muted">
                  {titles.now ? (
                    <>
                      <dt>{NOW_LABEL}</dt>{' '}
                      <dd className="min-w-0">
                        <GoogleChip text={titles.now} off={off} />
                      </dd>{' '}
                    </>
                  ) : null}
                  {titles.next ? (
                    <>
                      <dt>{NEXT_LABEL}</dt>{' '}
                      <dd className="min-w-0">
                        <GoogleChip text={titles.next} off={off} />
                      </dd>
                    </>
                  ) : null}
                </dl>
              ) : null}
              <p className="text-caption text-muted">{dayLine(off.info.calendarName, firstDay)}</p>
            </div>
          ) : off !== null && kind === 'half' && link !== null ? (
            <p data-off-box="" className="rounded-control bg-accent-soft px-3 py-2 text-small text-ink-2">
              <span>{HALF_HEAD}</span> <span className="text-caption text-muted">{linkText(link, true)}</span>
            </p>
          ) : link !== null ? (
            <p className="rounded-control bg-accent-soft px-3 py-2 text-small text-ink-2">
              <span>{kind === 'half' ? `예약 달력에 그날 ${part === 'am' ? '오전' : '오후'}만 '휴무'로 보여요.` : "예약 달력에 '휴무'로 보여요."}</span>{' '}
              <span className="text-caption text-muted">{linkText(link, off !== null)}</span>
            </p>
          ) : null}
          {warnings.map((w) => (
            <p key={w.day} className="rounded-control bg-warning-soft px-3 py-2 text-small text-warning">
              {`${mmdd(w.day)}에 ${person.name} 님 예약이 ${w.count}건 있어요. 예약은 그대로 두고 휴무만 표시해요.`}
            </p>
          ))}
          {problem !== null ? <p className={ds.fieldError}>{problem}</p> : null}
        </>
      ) : null}

      {error !== null ? <ErrorCard code={error} /> : null}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={save}
          disabled={person === null || problem !== null || saved !== null}
          aria-busy={busy || undefined}
          className={ds.button.primary}
        >
          {saved !== null ? SAVED_BUTTON : '저장'}
        </button>
        <button type="button" onClick={onClose} className={ds.button.secondary}>
          취소
        </button>
      </div>
    </>
  )

  const title = group !== null ? '휴가 고치기' : '휴가 넣기'
  if (off === null) {
    return (
      <LeaveDialog title={title} onClose={onClose}>
        {body}
      </LeaveDialog>
    )
  }
  return (
    <LeaveDialog title={title} wide onClose={onClose}>
      <div className="grid grid-cols-[minmax(0,32.5rem)_minmax(0,1fr)] items-start gap-5">
        <div className="grid min-w-0 content-start gap-4">{body}</div>
        <GcalOffResult
          info={off.info}
          days={previewDays(winFirst ?? today)}
          views={saved !== null ? saved.views : (preview?.views ?? null)}
          today={today}
          saved={saved !== null}
          sentAt={saved?.sentAt ?? null}
        />
      </div>
    </LeaveDialog>
  )
}
