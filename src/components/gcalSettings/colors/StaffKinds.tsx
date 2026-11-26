'use client'

import { useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { CAL_COLOR_LABEL } from '@/components/calendar/colors'
import { useDesk } from '@/components/shell/role'
import { useReadOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { composeOffTitle } from '@/lib/calendar/goff'
import { apptPaint, colorWarnings } from '@/lib/calendar/gpaint'
import type { PaintCtx } from '@/lib/calendar/gshapes'
import { formatGoogleTitle } from '@/lib/calendar/gtitle'
import { CAL_LABEL_MAX, KIND_LEN_MAX, checkCalendarKinds, type CalKindProblem } from '@/lib/storage/calendar'
import { checkProfile } from '@/lib/storage/clinicProfile'
import { checkGcalLook } from '@/lib/storage/gcal'
import type { CalKind, CalSettings, CalStaff, KindColor } from '@/types/calendar'
import { STAFF_NAME_MAX, type ClinicProfile } from '@/types/clinicProfile'
import { DEFAULT_GCAL_LOOK, type GcalLook, type GcalView } from '@/types/gcal'
import { ColorButton, ColorPalette, GoogleChip } from './ColorPalette'
import { ARIA, BAND, FOOT, KIND, KIND_PROBLEM, MARKS, NO_TEXT, SAVE_TEXT, STAFF, TITLE } from './labels'
import { saveColors, type StaffKindsDeps } from './save'

export type { StaffKindsDeps } from './save'

// 설정 › 구글 캘린더 › 시행자·종류 (spec google-link REQ-8529 AC-8529.1·AC-8529.2 · REQ-8521 AC-8521.4, design.md 2절 표 9, 시안 calendar.html ?s=colors).
// 이 부품은 띠부터 아래 단추까지만 그린다 — 설정 머리·안 메뉴·처음 잇기 차례(①②③)는 frame(TASK-17), 묶기·페이지는 GcalSettingsScreen(TASK-23).
// 세 모양: 처음 잇기(캘린더는 골랐고 이은 날 없음) = '{캘린더}를 골랐어요' 띠 + [← 잇기][저장하고 가져오기 미리 보기 →] ·
// 이은 뒤 = 받은 band(맞춤 방법 띠) + [저장] · 잇지 않은 병원 = 띠 없이 [저장](design.md 2절 표 9).
// 시행자 = 병원 정보에서 '예약에 보이기'를 켠 사람(병원 정보 차례). 병원 정보 줄이 없는 의원은 예약 설정의 옛 시행자 목록을 보이기만 한다(고칠 곳이 병원 정보라서).
// 미리 보기·경고는 lib/calendar(gtitle formatGoogleTitle · gpaint apptPaint·colorWarnings · goff composeOffTitle), 저장은 save.ts saveColors.
// 데스크·보는 중(관리자)은 보기만 — 칸을 막고 저장 단추가 없다. 폰 전용 모양은 만들지 않는다(넓은 표는 표 칸 안에서 옆으로 밀림)

export type StaffKindsLink = Pick<GcalView, 'calendarId' | 'calendarName' | 'linkedOn' | 'look' | 'defaultHex'>

/** 저장한 값(고치지 않은 쪽은 받은 값 그대로) */
export type SavedColors = { profile: ClinicProfile | null; kinds: CalKind[]; look: GcalLook }

export type StaffKindsProps = {
  /** 병원 정보(loadClinicProfile). 줄이 없으면 null */
  profile: ClinicProfile | null
  /** 예약 설정(loadCalendarSettings): 종류 · 병원 정보가 없을 때의 옛 시행자 목록 */
  settings: Pick<CalSettings, 'kinds' | 'staff'>
  /** 구글 연결(loadGcalView). 줄이 없으면 null = 잇지 않은 병원 */
  link: StaffKindsLink | null
  deps: StaffKindsDeps
  /** 이은 뒤 위 띠(맞춤 방법의 이어짐 띠 — TASK-17 부품을 TASK-23이 넘긴다) */
  band?: ReactNode
  /** 한국 오늘(시험용, 없으면 지금) */
  today?: string
  /** [잇기로 돌아가기]·[← 잇기] */
  onBack?(): void
  /** 처음 잇기: 저장이 끝나면 가져오기 미리 보기로 */
  onNext?(): void
  onSaved?(saved: SavedColors): void
}

type Mode = 'first' | 'linked' | 'none'
type Notice = { kind: 'saved' | 'error'; text: string } | null

const LENS = Array.from({ length: KIND_LEN_MAX / 5 }, (_, i) => (i + 1) * 5)
const HEX = /^#[0-9A-Fa-f]{6}$/
const WORD_SPLIT = /[,，]/

// 미리 보기 예(notes-calendar colors 미리 보기 여덟 줄). 시행자·종류는 지금 목록의 차례로 고른다(시안 설정이면 시안 줄 그대로)
const SAMPLES = [
  { at: '09:00', chart: '1234', name: '홍길동', staff: 0, kind: 0, memo: '' },
  { at: '09:30', chart: '2087', name: '이보기', staff: 1, kind: 1, memo: '' },
  { at: '10:00', chart: '5521', name: '최시안', staff: 2, kind: 2, memo: '4000타' },
  { at: '10:30', chart: null, name: '홍길순', staff: 2, kind: 0, memo: '' },
  { at: '11:00', chart: '1102', name: '오가짜', staff: 3, kind: 4, memo: '' },
  { at: '11:30', chart: '6603', name: '권샘플', staff: 0, kind: 0, memo: '', cancel: true },
  { at: '12:00', chart: '7781', name: '노예시', staff: 1, kind: 1, memo: '', change: true },
] as const
const SAMPLE_DAY = '2026-01-01' // 변경 예의 처음 날(칠하기 차례만 본다)

// ── 모양 ────────────────────────────────────────────────────

const CARD = 'grid min-w-0 gap-3.5 rounded-float border border-line bg-surface px-6 py-5'
const CARD_HEAD = 'flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1'
const H2 = 'text-subtitle font-semibold text-ink'
const LEAD = 'text-small text-muted'
const HINT = 'text-caption text-muted'
const TH = 'h-8 border-b border-line px-2 text-left text-caption font-semibold whitespace-nowrap text-muted first:pl-0'
const TD = 'border-b border-line px-2 py-1.5 align-middle text-ink first:pl-0'
const INPUT = `h-8 min-w-0 rounded-control border border-line-strong bg-surface px-2 text-small text-ink placeholder:text-muted focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent disabled:cursor-not-allowed disabled:bg-canvas aria-invalid:border-negative aria-invalid:bg-negative-soft`
const SELECT = `h-8 rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink disabled:cursor-not-allowed disabled:bg-canvas ${ds.focusRing}`
const MINI = `grid size-7 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-caption text-ink-2 disabled:cursor-default disabled:opacity-40 ${ds.focusRing}`
const DELETE = `h-7 cursor-pointer rounded-control px-1.5 text-caption text-negative not-disabled:hover:bg-negative-soft disabled:cursor-default disabled:text-faint ${ds.focusRing}`
const ROW = 'grid grid-cols-[220px_minmax(0,1fr)] items-start gap-x-4 gap-y-2 border-t border-line py-3 first:border-t-0 first:pt-0'
const ROW_KEY = 'pt-1.5 text-small font-semibold text-ink'
const ROW_SMALL = 'mt-0.5 block text-caption font-normal text-muted'
const ROW_VALUE = 'grid min-w-0 gap-1.5'
const INLINE = 'flex flex-wrap items-center gap-2 text-small text-ink-2'
const CHECK = 'inline-flex cursor-pointer items-center gap-2 text-small text-ink'
const CHECK_BOX = 'size-4 accent-accent disabled:cursor-not-allowed'
const pill = (on: boolean) =>
  `h-8 cursor-pointer rounded-full border px-3 text-small whitespace-nowrap disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing} ${
    on ? 'border-accent bg-accent-soft font-semibold text-accent' : 'border-line-strong bg-surface text-ink-2'
  }`

function WarnIcon() {
  return (
    <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" className="mt-px shrink-0 text-warning">
      <path d="M8 1.8 15 14H1z" fill="currentColor" />
      <path d="M8 6v3.6" fill="none" strokeWidth="1.6" strokeLinecap="round" className="stroke-surface" />
      <circle cx="8" cy="11.7" r=".9" className="fill-surface" />
    </svg>
  )
}

function InfoIcon() {
  return (
    <svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className="shrink-0">
      <circle cx="8" cy="8" r="6.5" />
      <path d="M8 7.2v4M8 4.8v.2" />
    </svg>
  )
}

function Card({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  const id = `gcal-colors-${title}`
  return (
    <section aria-labelledby={id} className={CARD}>
      <div className={CARD_HEAD}>
        <h2 id={id} className={H2}>
          {title}
        </h2>
        {hint && <span className={HINT}>{hint}</span>}
      </div>
      {children}
    </section>
  )
}

function OptRow({ title, small, children }: { title: string; small?: string; children: ReactNode }) {
  return (
    <div className={ROW}>
      <div className={ROW_KEY}>
        {title}
        {small && <small className={ROW_SMALL}>{small}</small>}
      </div>
      <div className={ROW_VALUE}>{children}</div>
    </div>
  )
}

// ── 값 다루기 ────────────────────────────────────────────────

const toStaff = ({ id, name, mark, color }: CalStaff): CalStaff => ({ id, name, mark, color })
const toKind = ({ id, name, len, color, words }: CalKind): CalKind => ({ id, name, len, color, words: [...words] })
const copyLook = (look: GcalLook): GcalLook => ({ ...look, noStaffKinds: [...look.noStaffKinds] })
const lookKey = (l: GcalLook) => JSON.stringify([l.cancel, l.change, l.offWord, l.offColor, l.noKind, l.staffByColor, l.noStaffKinds, l.titleLen, l.titleMemo])

/** 쉼표로 나눈 알아볼 글(앞뒤 빈칸 빼고 겹침 없이). 비면 새 종류는 자기 이름 하나, 있던 종류는 빈 목록(저장 함수가 기본 글로 채운다) */
function parseWords(text: string, fallback: string | null): string[] {
  const words = [...new Set(text.split(WORD_SPLIT).map((w) => w.trim()).filter(Boolean))]
  return words.length === 0 && fallback ? [fallback] : words
}

/** 종류 칸 첫 까닭(옛 예약 설정 서랍과 같은 차례 — 같은 종류 이름은 이름 까닭 바로 뒤) */
function kindProblem(kinds: readonly CalKind[]): string | null {
  const problems = checkCalendarKinds(kinds)
  const early: readonly CalKindProblem[] = ['kinds-empty', 'kind-id', 'kind-name']
  const first = problems.find((p) => early.includes(p))
  if (first) return KIND_PROBLEM[first]
  const names = kinds.map((k) => k.name.trim())
  if (new Set(names).size !== names.length) return KIND_PROBLEM['kind-dup']
  return problems[0] ? KIND_PROBLEM[problems[0]] : null
}

// ── 화면 ────────────────────────────────────────────────────

export function StaffKinds({ profile, settings, link, deps, band, today, onBack, onNext, onSaved }: StaffKindsProps) {
  const desk = useDesk()
  const viewing = useReadOnly()
  const readOnly = desk || viewing
  const staffLocked = readOnly || profile === null
  const mode: Mode = link?.linkedOn ? 'linked' : link?.calendarId ? 'first' : 'none'

  const firstStaff = (profile ? profile.staff.filter((p) => p.calendar) : settings.staff).map(toStaff)
  const firstKinds = settings.kinds.map(toKind)
  const firstLook = copyLook(link?.look ?? DEFAULT_GCAL_LOOK)

  const [staff, setStaff] = useState<CalStaff[]>(firstStaff)
  const [kinds, setKinds] = useState<CalKind[]>(firstKinds)
  const [words, setWords] = useState<Record<string, string>>(() => Object.fromEntries(firstKinds.map((k) => [k.id, k.words.join(', ')])))
  const [look, setLook] = useState<GcalLook>(firstLook)
  const [open, setOpen] = useState<string | null>(null)
  const [attempted, setAttempted] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<Notice>(null)
  const busyRef = useRef(false)
  const seq = useRef(0)

  // 저장할 값
  const cleanStaff = staff.map((s) => ({ ...s, name: s.name.trim(), mark: s.mark.trim() }))
  const nextProfile: ClinicProfile | null = profile && {
    ...profile,
    staff: profile.staff.map((p) => {
      const edited = cleanStaff.find((s) => s.id === p.id)
      return edited ? { ...p, name: edited.name, mark: edited.mark, color: edited.color } : p
    }),
  }
  const knownKinds = new Set(firstKinds.map((k) => k.id))
  const nextKinds: CalKind[] = kinds.map((k) => ({
    id: k.id,
    name: k.name.trim(),
    len: k.len,
    color: k.color,
    words: parseWords(words[k.id] ?? '', knownKinds.has(k.id) ? null : k.name.trim()),
  }))
  const kindIds = new Set(kinds.map((k) => k.id))
  const nextLook: GcalLook = {
    ...look,
    offWord: look.offWord.trim(),
    noKind: look.noKind === 'fix' || kindIds.has(look.noKind) ? look.noKind : (kinds[0]?.id ?? 'fix'),
    noStaffKinds: look.noStaffKinds.filter((id) => kindIds.has(id)),
  }
  const profileChanged = nextProfile !== null && JSON.stringify(nextProfile.staff) !== JSON.stringify(profile!.staff)
  const kindsChanged = JSON.stringify(nextKinds) !== JSON.stringify(firstKinds)
  const lookChanged = lookKey(nextLook) !== lookKey(firstLook)

  const problem =
    (nextProfile && profileChanged ? (checkProfile(nextProfile)[0] ?? null) : null) ??
    kindProblem(nextKinds) ??
    (checkGcalLook(nextLook) === null ? SAVE_TEXT.invalid : null)

  // 미리 보기·경고(지금 고친 값)
  const ctx: PaintCtx = { look, kinds, staff: cleanStaff }
  const warnings = colorWarnings({ staff: cleanStaff, kinds: nextKinds, look })
  const sampleStaff = (i: number) => (cleanStaff.length > 0 ? cleanStaff[i % cleanStaff.length]! : null)
  const sampleKind = (i: number) => nextKinds[i % nextKinds.length]!
  const titleOf = (chart: string | null, name: string, kind: CalKind, person: CalStaff | null, memo: string) =>
    formatGoogleTitle(
      { chart, name, kindId: kind.id, kindName: kind.name, len: kind.len, staffId: person?.id ?? null, staffMark: person?.mark ?? null, memo },
      look,
      nextKinds,
      cleanStaff,
    )
  const offNames = (() => {
    const others = profile ? profile.staff.filter((p) => !p.calendar).map((p) => p.name) : []
    const shown = cleanStaff.map((s) => s.name)
    const picked = [others[0], shown[1]].filter((n): n is string => Boolean(n))
    for (const name of shown) if (picked.length < 2 && !picked.includes(name)) picked.push(name)
    return picked
  })()
  const offTitle = composeOffTitle(offNames, null, look.offWord, []) || look.offWord.trim()

  const toggle = (key: string) => setOpen((now) => (now === key ? null : key))
  const setPerson = (id: string, patch: Partial<CalStaff>) => setStaff((list) => list.map((s) => (s.id === id ? { ...s, ...patch } : s)))
  const setKind = (id: string, patch: Partial<CalKind>) => setKinds((list) => list.map((k) => (k.id === id ? { ...k, ...patch } : k)))
  const setLookPart = (patch: Partial<GcalLook>) => setLook((now) => ({ ...now, ...patch }))

  function moveKind(index: number, by: -1 | 1) {
    const to = index + by
    if (to < 0 || to >= kinds.length) return
    const next = [...kinds]
    const [moved] = next.splice(index, 1)
    next.splice(to, 0, moved!)
    setKinds(next)
    setOpen(null)
  }

  function removeKind(id: string) {
    if (kinds.length < 2) return
    const rest = kinds.filter((k) => k.id !== id)
    setKinds(rest)
    setLook((now) => ({
      ...now,
      noKind: now.noKind === id ? rest[0]!.id : now.noKind,
      noStaffKinds: now.noStaffKinds.filter((k) => k !== id),
    }))
    setOpen(null)
  }

  function addKind() {
    const taken = new Set([...firstKinds, ...kinds].map((k) => k.id))
    let id = ''
    do {
      seq.current += 1
      id = `k-${Date.now().toString(36)}-${seq.current}`
    } while (taken.has(id))
    setKinds((list) => [...list, { id, name: '', len: 30, color: null, words: [] }])
    setWords((now) => ({ ...now, [id]: '' }))
  }

  function toggleNoStaff(id: string) {
    setLook((now) => ({ ...now, noStaffKinds: now.noStaffKinds.includes(id) ? now.noStaffKinds.filter((k) => k !== id) : [...now.noStaffKinds, id] }))
  }

  async function save() {
    if (busyRef.current || readOnly) return
    setAttempted(true)
    setNotice(null)
    if (problem !== null) return
    busyRef.current = true
    setBusy(true)
    const before: PaintCtx = { look: firstLook, kinds: firstKinds, staff: firstStaff }
    const after: PaintCtx = { look: nextLook, kinds: nextKinds, staff: cleanStaff }
    const outcome = await saveColors(deps, {
      profile: profileChanged ? nextProfile : null,
      kinds: kindsChanged ? nextKinds : null,
      look: lookChanged ? nextLook : null,
      before,
      after,
      linkedOn: link?.linkedOn ?? null,
      today: today ?? todayInKorea(),
    })
    busyRef.current = false
    setBusy(false)
    if (!outcome.ok) {
      setNotice({ kind: 'error', text: SAVE_TEXT[outcome.why] })
      return
    }
    onSaved?.({ profile: outcome.profile ?? profile, kinds: kindsChanged ? nextKinds : firstKinds, look: lookChanged ? nextLook : firstLook })
    if (mode === 'first') onNext?.()
    else setNotice({ kind: 'saved', text: SAVE_TEXT.saved })
  }

  const rootStyle = link && HEX.test(link.defaultHex) ? ({ '--cal-default': link.defaultHex } as CSSProperties) : undefined
  const namedKinds = kinds.filter((k) => k.name.trim() !== '')
  const shownProblem = attempted ? problem : null

  return (
    <div data-gcal-colors="" className="grid min-w-0 gap-4" style={rootStyle}>
      {mode === 'first' && (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-control border border-line bg-positive-soft px-3.5 py-3 text-small text-ink-2">
          <span>
            <span aria-hidden="true" className="mr-1.5 inline-block size-2 rounded-full bg-positive" />
            <b className="font-semibold text-ink">{link?.calendarName ?? ''}</b>
            {BAND.picked(link?.calendarName ?? '')}
          </span>
          <span className="flex-1" />
          <button type="button" className={ds.textButton} onClick={onBack}>
            {BAND.back}
          </button>
        </div>
      )}
      {mode === 'linked' && band}

      <Card title={STAFF.title} hint={STAFF.hint}>
        <p className={LEAD}>{STAFF.lead}</p>
        <div className="min-w-0 overflow-x-auto">
          <table aria-label={STAFF.title} className="w-full border-collapse text-small">
            <thead>
              <tr>
                {STAFF.head.map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {cleanStaff.map((s, i) => {
                const raw = staff[i]!
                const key = `s:${s.id}`
                const isOpen = open === key
                return [
                  <tr key={s.id}>
                    <td className={`${TD} ${isOpen ? 'border-b-0' : ''}`}>
                      <input
                        aria-label={ARIA.staffName}
                        value={raw.name}
                        maxLength={STAFF_NAME_MAX}
                        disabled={staffLocked}
                        aria-invalid={s.name === '' || undefined}
                        className={`${INPUT} w-30`}
                        onChange={(e) => setPerson(s.id, { name: e.target.value })}
                      />
                    </td>
                    <td className={`${TD} ${isOpen ? 'border-b-0' : ''}`}>
                      <input
                        aria-label={ARIA.staffMark}
                        value={raw.mark}
                        maxLength={1}
                        disabled={staffLocked}
                        aria-invalid={[...s.mark].length !== 1 || undefined}
                        className={`${INPUT} w-10 text-center font-semibold`}
                        onChange={(e) => setPerson(s.id, { mark: e.target.value })}
                      />
                    </td>
                    <td className={`${TD} ${isOpen ? 'border-b-0' : ''}`}>
                      <ColorButton value={s.color} label={ARIA.staffColor(`(${s.mark}) ${s.name}`)} open={isOpen} disabled={staffLocked} onToggle={() => toggle(key)} />
                    </td>
                    <td className={`${TD} max-w-70 ${isOpen ? 'border-b-0' : ''}`}>
                      <GoogleChip color={s.color} text={titleOf('1234', '홍길동', sampleKind(0), s, '')} />
                    </td>
                    <td className={`${TD} text-caption whitespace-nowrap text-muted ${isOpen ? 'border-b-0' : ''}`}>{STAFF.tail(s.mark, CAL_COLOR_LABEL[s.color])}</td>
                  </tr>,
                  isOpen && (
                    <tr key={`${s.id}-pal`}>
                      <td colSpan={5} className="border-b border-line pb-2.5">
                        <ColorPalette
                          value={s.color}
                          onPick={(color) => {
                            if (color !== null && color !== 'default') setPerson(s.id, { color })
                            setOpen(null)
                          }}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
        {warnings.length > 0 && (
          <div className="grid gap-1">
            {warnings.map((w) => (
              <p key={w} data-warn="" className="flex items-start gap-1.5 text-caption text-warning">
                <WarnIcon />
                <span>{w}</span>
              </p>
            ))}
          </div>
        )}
      </Card>

      <Card title={KIND.title} hint={KIND.hint}>
        <p className={LEAD}>
          {KIND.lead[0]}
          <b className="font-semibold text-ink-2">{KIND.lead[1]}</b>
          {KIND.lead[2]}
        </p>
        <div className="min-w-0 overflow-x-auto">
          <table aria-label={KIND.title} className="w-full border-collapse text-small">
            <thead>
              <tr>
                {KIND.head.map((h) => (
                  <th key={h} className={TH}>
                    {h}
                  </th>
                ))}
                <th className={TH} />
              </tr>
            </thead>
            <tbody>
              {kinds.map((k, i) => {
                const key = `k:${k.id}`
                const isOpen = open === key
                const cell = `${TD} ${isOpen ? 'border-b-0' : ''}`
                return [
                  <tr key={k.id}>
                    <td className={cell}>
                      <span className="inline-flex gap-1">
                        <button type="button" aria-label={ARIA.up(i + 1)} disabled={readOnly || i === 0} className={MINI} onClick={() => moveKind(i, -1)}>
                          ▲
                        </button>
                        <button type="button" aria-label={ARIA.down(i + 1)} disabled={readOnly || i === kinds.length - 1} className={MINI} onClick={() => moveKind(i, 1)}>
                          ▼
                        </button>
                      </span>
                    </td>
                    <td className={cell}>
                      <input
                        aria-label={ARIA.kindName}
                        value={k.name}
                        maxLength={CAL_LABEL_MAX}
                        disabled={readOnly}
                        aria-invalid={(attempted && k.name.trim() === '') || undefined}
                        className={`${INPUT} w-30 font-semibold`}
                        onChange={(e) => setKind(k.id, { name: e.target.value })}
                      />
                    </td>
                    <td className={cell}>
                      <input
                        aria-label={ARIA.kindWords}
                        value={words[k.id] ?? ''}
                        placeholder={KIND.wordsHint}
                        disabled={readOnly}
                        className={`${INPUT} w-55`}
                        onChange={(e) => setWords((now) => ({ ...now, [k.id]: e.target.value }))}
                      />
                    </td>
                    <td className={cell}>
                      <select aria-label={ARIA.kindLen} value={k.len} disabled={readOnly} className={SELECT} onChange={(e) => setKind(k.id, { len: Number(e.target.value) })}>
                        {(LENS.includes(k.len) ? LENS : [...LENS, k.len].sort((a, b) => a - b)).map((m) => (
                          <option key={m} value={m}>{`${m}분`}</option>
                        ))}
                      </select>
                    </td>
                    <td className={cell}>
                      <ColorButton value={k.color} label={ARIA.kindColor(k.name)} open={isOpen} disabled={readOnly} onToggle={() => toggle(key)} />
                    </td>
                    <td className={cell}>
                      <button type="button" disabled={readOnly || kinds.length < 2} className={DELETE} onClick={() => removeKind(k.id)}>
                        {KIND.remove}
                      </button>
                    </td>
                  </tr>,
                  isOpen && (
                    <tr key={`${k.id}-pal`}>
                      <td colSpan={6} className="border-b border-line pb-2.5">
                        <ColorPalette
                          value={k.color}
                          forKind
                          onPick={(color: KindColor) => {
                            setKind(k.id, { color })
                            setOpen(null)
                          }}
                        />
                      </td>
                    </tr>
                  ),
                ]
              })}
            </tbody>
          </table>
        </div>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
          <button type="button" disabled={readOnly} className={ds.button.secondarySmall} onClick={addKind}>
            <svg aria-hidden="true" width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M8 3v10M3 8h10" />
            </svg>
            {KIND.add}
          </button>
          <span className={HINT}>{KIND.gone}</span>
        </div>
      </Card>

      <Card title={MARKS.title} hint={MARKS.hint}>
        <div className="grid">
          {(
            [
              ['cancel', MARKS.cancel, MARKS.cancelSmall, MARKS.cancelHelp, ARIA.cancelColor],
              ['change', MARKS.change, MARKS.changeSmall, MARKS.changeHelp, ARIA.changeColor],
            ] as const
          ).map(([field, title, small, help, label]) => (
            <OptRow key={field} title={title} small={small}>
              <div className={INLINE}>
                {MARKS.color}
                <ColorButton value={look[field]} label={label} open={open === field} disabled={readOnly} onToggle={() => toggle(field)} />
              </div>
              {open === field && (
                <ColorPalette
                  value={look[field]}
                  onPick={(color) => {
                    if (color !== null && color !== 'default') setLookPart({ [field]: color })
                    setOpen(null)
                  }}
                />
              )}
              <p className={HINT}>{help}</p>
            </OptRow>
          ))}
        </div>
      </Card>

      <section aria-labelledby="gcal-colors-no-text" className={CARD}>
        <h2 id="gcal-colors-no-text" className={H2}>
          {NO_TEXT.title}
        </h2>
        <div className="grid">
          <OptRow title={NO_TEXT.noKind} small={NO_TEXT.noKindEx}>
            <div className={INLINE}>
              <select
                aria-label={NO_TEXT.noKind}
                value={look.noKind}
                disabled={readOnly}
                className={`${SELECT} min-w-40`}
                onChange={(e) => setLookPart({ noKind: e.target.value })}
              >
                {namedKinds.map((k) => (
                  <option key={k.id} value={k.id}>
                    {NO_TEXT.noKindOption(k.name.trim())}
                  </option>
                ))}
                <option value="fix">{NO_TEXT.noKindFix}</option>
              </select>
            </div>
            <p className={HINT}>{NO_TEXT.noKindHelp}</p>
          </OptRow>
          <OptRow title={NO_TEXT.noStaff} small={NO_TEXT.noStaffEx}>
            <label className={CHECK}>
              <input type="checkbox" checked={look.staffByColor} disabled={readOnly} className={CHECK_BOX} onChange={(e) => setLookPart({ staffByColor: e.target.checked })} />
              {NO_TEXT.byColor}
            </label>
            <p className={HINT}>{NO_TEXT.noStaffHelp}</p>
          </OptRow>
          <OptRow title={NO_TEXT.noStaffKinds} small={NO_TEXT.noStaffKindsEx}>
            <div role="group" aria-label={NO_TEXT.noStaffKinds} className="flex flex-wrap gap-1.5">
              {namedKinds.map((k) => {
                const on = look.noStaffKinds.includes(k.id)
                return (
                  <button key={k.id} type="button" aria-pressed={on} disabled={readOnly} className={pill(on)} onClick={() => toggleNoStaff(k.id)}>
                    {k.name.trim()}
                  </button>
                )
              })}
            </div>
            <p className={HINT}>{NO_TEXT.noStaffKindsHelp}</p>
          </OptRow>
          <OptRow title={NO_TEXT.off} small={NO_TEXT.offSmall}>
            <div className={INLINE}>
              {NO_TEXT.offWord}
              <input
                aria-label={NO_TEXT.offWordLabel}
                value={look.offWord}
                maxLength={10}
                disabled={readOnly}
                aria-invalid={(attempted && look.offWord.trim() === '') || undefined}
                className={`${INPUT} w-18`}
                onChange={(e) => setLookPart({ offWord: e.target.value })}
              />
              {NO_TEXT.offColor}
              <ColorButton value={look.offColor} label={ARIA.offColor} open={open === 'off'} disabled={readOnly} onToggle={() => toggle('off')} />
            </div>
            {open === 'off' && (
              <ColorPalette
                value={look.offColor}
                onPick={(color) => {
                  if (color !== null && color !== 'default') setLookPart({ offColor: color })
                  setOpen(null)
                }}
              />
            )}
            <p className={HINT}>
              <span className="tabular-nums">{NO_TEXT.offHelpSample}</span>
              {NO_TEXT.offHelp}
            </p>
          </OptRow>
          <OptRow title={NO_TEXT.other}>
            <p className="pt-1.5 text-small text-ink">{NO_TEXT.otherText}</p>
          </OptRow>
        </div>
      </section>

      <Card title={TITLE.title} hint={TITLE.hint}>
        <div className="grid grid-cols-2 items-start gap-4">
          <div className="grid gap-1">
            <div aria-label={TITLE.tokensLabel} className="inline-flex flex-wrap items-center gap-1">
              {TITLE.tokens.map((t, i) => {
                const off = (i === 3 && !look.titleLen) || (i === 5 && !look.titleMemo)
                return [
                  i > 0 && (
                    <i key={`dot-${t}`} className="text-caption text-faint not-italic">
                      ·
                    </i>
                  ),
                  <span
                    key={t}
                    data-off={off ? '' : undefined}
                    className={`inline-flex h-6.5 items-center rounded-control border border-line-strong bg-canvas px-2 text-caption font-semibold text-ink-2 ${off ? 'line-through opacity-40' : ''}`}
                  >
                    {t}
                  </span>,
                ]
              })}
            </div>
            <label className={`${CHECK} mt-2`}>
              <input type="checkbox" checked={look.titleLen} disabled={readOnly} className={CHECK_BOX} onChange={(e) => setLookPart({ titleLen: e.target.checked })} />
              {TITLE.len}
            </label>
            <label className={CHECK}>
              <input type="checkbox" checked={look.titleMemo} disabled={readOnly} className={CHECK_BOX} onChange={(e) => setLookPart({ titleMemo: e.target.checked })} />
              {TITLE.memo} <span className={HINT}>{TITLE.memoHint}</span>
            </label>
            <p className={`${HINT} mt-1.5`}>{TITLE.help}</p>
          </div>
          <section aria-label={TITLE.previewLabel} className="overflow-clip rounded-control border border-line bg-surface">
            <div className="flex items-center gap-2 border-b border-line bg-canvas px-3 py-2 text-caption text-muted">
              <InfoIcon />
              {TITLE.previewHead}
            </div>
            <div className="grid grid-cols-[52px_minmax(0,1fr)]">
              <div className="pt-1 pr-2 text-right text-caption text-muted">{TITLE.allDay}</div>
              <div className="grid gap-0.5 border-l border-line px-1.5 py-1">
                <GoogleChip color={look.offColor} text={offTitle} bold />
              </div>
            </div>
            {SAMPLES.map((sample) => {
              const kind = sampleKind(sample.kind)
              const person = sampleStaff(sample.staff)
              const cancel = 'cancel' in sample
              const change = 'change' in sample
              const paint = apptPaint(
                {
                  status: cancel ? 'cancel' : 'auto',
                  origDay: change ? SAMPLE_DAY : null,
                  origStart: null,
                  gMoved: change, // 이은 병원의 '변경'은 g_moved(google-link AC-8545.1)
                  colorFrom: 'app',
                  gColor: null,
                  kindId: kind.id,
                  staffId: person?.id ?? null,
                },
                ctx,
              )
              return (
                <div key={sample.at} className="grid grid-cols-[52px_minmax(0,1fr)]">
                  <div className="pt-1 pr-2 text-right text-caption text-muted tabular-nums">{sample.at}</div>
                  <div className="grid gap-0.5 border-l border-line px-1.5 py-1">
                    <GoogleChip color={paint.key} text={titleOf(sample.chart, sample.name, kind, person, sample.memo)} />
                    {cancel && <span className={HINT}>{TITLE.cancelNote(CAL_COLOR_LABEL[look.cancel])}</span>}
                    {change && <span className={HINT}>{TITLE.changeNote(CAL_COLOR_LABEL[look.change])}</span>}
                  </div>
                </div>
              )
            })}
          </section>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 rounded-float border border-line-strong bg-surface px-4 py-3.5">
        <p className="min-w-0 flex-[1_1_520px] text-small text-ink-2">{FOOT.text}</p>
        {mode === 'first' && (
          <button type="button" className={ds.button.secondary} onClick={onBack}>
            {FOOT.back}
          </button>
        )}
        {!readOnly && (
          <button type="button" aria-busy={busy || undefined} className={ds.button.primary} onClick={() => void save()}>
            {mode === 'first' ? FOOT.next : FOOT.save}
          </button>
        )}
        {(shownProblem !== null || notice !== null) && (
          <p
            role={shownProblem !== null || notice?.kind === 'error' ? 'alert' : 'status'}
            className={`basis-full text-right ${shownProblem !== null || notice?.kind === 'error' ? ds.fieldError : 'text-caption font-medium text-positive'}`}
          >
            {shownProblem ?? notice?.text}
          </p>
        )}
      </div>
    </div>
  )
}
