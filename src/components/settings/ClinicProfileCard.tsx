'use client'

import { useRouter } from 'next/navigation'
import { useId, useRef, useState, type ReactNode } from 'react'
import { CalIcon, Swatch, calVar } from '@/components/calendar/CalendarToolbar'
import { CAL_COLOR_LABEL } from '@/components/calendar/colors'
import { useClinicProfile, type ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useDesk } from '@/components/shell/role'
import { WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { isYmd, weekdayOf } from '@/lib/analytics/dates'
import { EMR_LABEL } from '@/lib/clinic/emrText'
import { clockText, phoneText } from '@/lib/clinic/format'
import { checkProfile, dayProblem, normalizeLogo, removeLogo, saveClinicProfile, uploadLogo } from '@/lib/storage/clinicProfile'
import { supabaseBrowser } from '@/lib/supabase/browser'
import { CAL_COLORS, type CalColor } from '@/types/calendar'
import {
  CLINIC_ADDRESS_MAX,
  CLINIC_NAME_MAX,
  CLOSED_DATES_MAX,
  EMR_KINDS,
  HONORIFICS,
  HOURS_STEP,
  LOGO_MAX_BYTES,
  STAFF_MAX,
  STAFF_NAME_MAX,
  STAFF_ROLES,
  WEEKDAY_NAMES,
  type ClinicProfile,
  type ClinicStaff,
  type DayHours,
  type EmrKind,
  type Honorific,
  type StaffRole,
} from '@/types/clinicProfile'
import { ReadOnlyFields } from './ReadOnlyFields'

// 설정 '병원 정보' 칸 (spec clinic-profile REQ-6602 AC-6602.1~AC-6602.8, design.md 3절, ADR-033). 시안 없음(사용자 결정) —
// 지금 설정 칸 모양(CashFloatSetting·DeskAccounts의 읽기 상태·ds.panel·결과 줄)과 ds 클래스를 따른다.
// 칸 차례: 병원 이름 · 로고 · 전화 · 주소 · 호칭 · 쓰는 EMR(spec emr-choice AC-7102.2) · 진료시간 · 휴진일 · 원장님·직원. 읽기는 공용 훅(useClinicProfile, 로고까지),
// 검사는 저장 층 checkProfile·dayProblem 한 곳이다. 열기만 해서는 저장하지 않고 [저장]이 표(saveClinicProfile)를 먼저 저장한 뒤
// 로고가 바뀌었으면 올리거나(uploadLogo — 줄이 있어야 올라가고, 옛 파일은 그 함수가 지운다) 뺀다(removeLogo).
// 실패하면 적은 값·고른 로고를 그대로 두고 오류 칸 + [다시 저장]. 표가 저장되면 router.refresh()로 헤더·탭 제목 이름을 다시 읽는다(readMe).
// 데스크에게는 그리지 않는다(설정 화면은 DeskGate가 막지만 칸도 스스로 숨는다, 자료는 RLS가 막는다).
// 보는 중(admin-view AC-8011.3, 관리자가 다른 의원을 읽기만)에는 칸을 모두 막고(ReadOnlyFields — 값은 칸 안 글자로 보인다) 로고 단추·휴진일 [더하기]·[빼기]·
// 사람 차례·[빼기]·[사람 더하기]·저장 줄을 그리지 않는다(WriteOnly)

type Draft = {
  name: string
  phone: string
  address: string
  honorific: Honorific
  emr: EmrKind // 읽은 값을 들고 가 '쓰는 EMR' 칸에서 고르고 저장에 실어 보낸다(spec emr-choice TASK-3·TASK-4)
  hours: HourRow[]
  closedDates: string[]
  staff: StaffRow[]
}
/** 요일 한 줄. 휴진을 체크해도 고른 시간은 남겨 두어 풀면 다시 보인다 */
type HourRow = { closed: boolean; open: number; close: number; lunchFrom: number | null; lunchTo: number | null }
/** markTouched: 표시 글자를 손으로 고쳤거나 저장된 사람 — 거짓이면 표시 글자가 이름 첫 글자를 따라간다 */
type StaffRow = ClinicStaff & { markTouched: boolean }
/** none 로고 없음 · saved 저장된 로고(미리보기 못 받으면 url null) · new 고른 그림(아직 안 올림) · removed 저장된 로고를 빼기로 함(아직 안 뺌) */
type Logo = { kind: 'none' } | { kind: 'saved'; url: string | null } | { kind: 'new'; blob: Blob; url: string } | { kind: 'removed' }
type LogoProblem = 'too-big' | 'unreadable'
type Outcome = { kind: 'idle' } | { kind: 'saved' } | { kind: 'failed'; code: 'E-CLINIC-SAVE-FAILED' | 'E-CLINIC-LOGO-FAILED' }

const INTRO = '헤더·탭 제목·서식·문자·예약·통계가 이 정보를 같이 써요. [저장]을 눌러야 저장돼요.'
const COMMAS = new Intl.NumberFormat('ko-KR')
const LOGO_TYPES = 'image/png,image/jpeg,image/webp'
const LOGO_HELP = 'PNG·JPEG·WEBP 그림을 고르면 긴 변 1,200px 안으로 줄여 [저장] 때 올려요.'
const LOGO_PROBLEM: Record<LogoProblem, string> = {
  'too-big': `그림이 너무 커요. 줄인 그림이 ${COMMAS.format(LOGO_MAX_BYTES)}바이트를 넘지 않게 더 작은 그림을 골라 주세요.`,
  unreadable: '그림을 읽지 못했어요. PNG·JPEG·WEBP 그림 파일을 골라 주세요.',
}
const ROLE_LABEL: Record<StaffRole, string> = { doctor: '원장님', staff: '직원' }

// 고르는 시간: 10분 단위 06:00~23:50. 저장된 값이 그 밖(옮겨 온 05:00·24:00 등)이면 그 값도 넣어 그대로 보인다
const FIRST_MINUTE = 6 * 60
const LAST_MINUTE = 23 * 60 + 50
const MINUTES = Array.from({ length: (LAST_MINUTE - FIRST_MINUTE) / HOURS_STEP + 1 }, (_, i) => FIRST_MINUTE + i * HOURS_STEP)
// 휴진 요일을 열 때 처음 시간
const OPEN_DEFAULT = { open: 9 * 60, close: 18 * 60 }

// 예약 설정 판(CalendarSettings)과 같은 작은 칸 모양
const FIELD = `h-8 min-w-0 rounded-control border border-line-strong bg-surface px-2 text-small text-ink placeholder:text-muted aria-invalid:border-negative focus-visible:border-accent focus-visible:outline-2 focus-visible:-outline-offset-1 focus-visible:outline-accent max-md:h-11 max-md:text-lead`
const SELECT = `h-8 rounded-control border border-line-strong bg-surface px-1.5 text-small text-ink tabular-nums aria-invalid:border-negative disabled:cursor-not-allowed disabled:opacity-40 ${ds.focusRing} max-md:h-11`
const MINI = `grid size-7 cursor-pointer place-items-center rounded-control border border-line-strong bg-surface text-caption text-ink-2 hover:bg-canvas disabled:cursor-default disabled:opacity-40 ${ds.focusRing} max-md:size-11`
const DELETE = `${ds.button.ghostSmall} text-negative`
const INLINE = 'inline-flex items-center gap-1.5 text-small text-ink-2'
const CHIP = 'inline-flex h-8 items-center gap-1 rounded-control border border-line bg-canvas pl-2 text-small text-ink-2 tabular-nums max-md:h-11'
const CHIP_X = `grid size-8 cursor-pointer place-items-center rounded-control text-ink-2 hover:bg-line ${ds.focusRing} max-md:size-11`

const textOrNull = (text: string): string | null => (text.trim() === '' ? null : text.trim())
const firstChar = (name: string) => [...name.trim()][0] ?? ''
const toRow = (day: DayHours): HourRow =>
  day === null ? { closed: true, ...OPEN_DEFAULT, lunchFrom: null, lunchTo: null } : { closed: false, ...day }
const toDay = (row: HourRow): DayHours =>
  row.closed ? null : { open: row.open, close: row.close, lunchFrom: row.lunchFrom, lunchTo: row.lunchTo }
const dateLabel = (ymd: string) => `${ymd} (${WEEKDAY_NAMES[weekdayOf(ymd) - 1]})`

/** 처음 값(AC-6602.2): 저장한 값. 이름이 없으면 가입 이름, 저장한 적 없으면 전화도 가입 전화 */
function initialDraft(view: ClinicProfileView): Draft {
  const p = view.profile
  return {
    name: p.displayName ?? view.signupName,
    phone: phoneText(p.phone ?? (view.saved ? null : view.signupPhone)),
    address: p.address ?? '',
    honorific: p.honorific,
    emr: p.emr,
    hours: p.hours.map(toRow),
    closedDates: [...p.closedDates],
    staff: p.staff.map((person) => ({ ...person, markTouched: true })),
  }
}

/** 보낼 병원 정보(검사·저장 모양). 앞뒤 빈칸·전화 기호 정리는 저장 층이 한다 */
function toProfile(draft: Draft, logoPath: string | null): ClinicProfile {
  return {
    displayName: textOrNull(draft.name),
    phone: textOrNull(draft.phone),
    address: textOrNull(draft.address),
    honorific: draft.honorific,
    emr: draft.emr,
    hours: draft.hours.map(toDay),
    closedDates: draft.closedDates,
    staff: draft.staff.map(({ id, name, role, mark, color, calendar }) => ({ id, name, role, mark, color, calendar })),
    logoPath,
  }
}

/** 새 사람 id: 짧은 무작위 글자(40자 안). 지금 목록·열 때 있던 사람의 id와 겹치지 않게(예약은 id로 사람을 가리킨다) */
function newStaffId(taken: readonly ClinicStaff[]): string {
  const used = new Set(taken.map((person) => person.id))
  for (;;) {
    const id = `s-${Math.random().toString(36).slice(2, 10)}`
    if (id.length > 2 && !used.has(id)) return id
  }
}

/** 미리보기 글(data:image/png). 밖 주소를 쓰지 않는다 */
function dataUrlOf(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader()
    reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null)
    reader.onerror = () => resolve(null)
    reader.readAsDataURL(blob)
  })
}

export function ClinicProfileCard() {
  if (useDesk()) return null
  return <ClinicProfilePanel />
}

function ClinicProfilePanel() {
  const view = useClinicProfile({ logo: true })
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`}>
      <div className="flex flex-col gap-1">
        <h2 id={titleId} className={ds.panelTitle}>
          병원 정보
        </h2>
        <p className="text-small text-ink-2">{INTRO}</p>
      </div>
      {view.state === 'loading' && <p className="text-small text-muted">병원 정보를 읽는 중이에요…</p>}
      {view.state === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-CLINIC-READ-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={view.reload}>
            다시 불러오기
          </button>
        </div>
      )}
      {view.state === 'ready' && <ProfileForm view={view} />}
    </section>
  )
}

function Field({ titleId, title, help, children }: { titleId: string; title: string; help?: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <h3 id={titleId} className={ds.label}>
        {title}
      </h3>
      {children}
      {help && <p className={ds.help}>{help}</p>}
    </div>
  )
}

function Checkbox({ label, checked, onChange }: { label?: string; checked: boolean; onChange(checked: boolean): void }) {
  return (
    <span className={ds.checkboxWrap}>
      <input type="checkbox" aria-label={label} checked={checked} className={ds.checkbox} onChange={(event) => onChange(event.target.checked)} />
      <Icon name="check" className={ds.checkboxMark} />
    </span>
  )
}

function TimeSelect({
  label,
  value,
  empty,
  disabled,
  invalid,
  onChange,
}: {
  label: string
  value: number | null
  empty?: boolean
  disabled: boolean
  invalid: boolean
  onChange(value: number | null): void
}) {
  const options = value === null || MINUTES.includes(value) ? MINUTES : [...MINUTES, value].sort((a, b) => a - b)
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      disabled={disabled}
      aria-invalid={invalid || undefined}
      className={SELECT}
      onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))}
    >
      {empty && <option value="">없음</option>}
      {options.map((minute) => (
        <option key={minute} value={minute}>
          {clockText(minute)}
        </option>
      ))}
    </select>
  )
}

/** 색판(예약 설정 판의 색판과 같은 모양, 예약 20색) */
function Palette({ color, onPick }: { color: CalColor; onPick(color: CalColor): void }) {
  return (
    <div role="group" aria-label="색 고르기" className="flex flex-wrap items-center gap-1.5 rounded-control bg-canvas p-2">
      {CAL_COLORS.map((c) => (
        <button
          key={c}
          type="button"
          aria-label={CAL_COLOR_LABEL[c]}
          title={CAL_COLOR_LABEL[c]}
          aria-pressed={color === c}
          className={`size-7 cursor-pointer rounded-control border-2 border-surface ${ds.focusRing} max-md:size-11 ${color === c ? 'ring-2 ring-ink' : 'ring-1 ring-line-strong'}`}
          style={{ backgroundColor: calVar(c) }}
          onClick={() => onPick(c)}
        />
      ))}
    </div>
  )
}

function colorButton(open: boolean) {
  return `inline-flex h-8 cursor-pointer items-center gap-1.5 rounded-control border bg-surface px-2 text-small whitespace-nowrap text-ink ${ds.focusRing} max-md:h-11 ${
    open ? 'border-accent ring-1 ring-accent ring-inset' : 'border-line-strong'
  }`
}

function ProfileForm({ view }: { view: ClinicProfileView }) {
  const router = useRouter()
  const [draft, setDraft] = useState<Draft>(() => initialDraft(view))
  const [logo, setLogo] = useState<Logo>(() => (view.profile.logoPath === null ? { kind: 'none' } : { kind: 'saved', url: view.logoDataUrl }))
  // DB에 로고가 있는지(빼기를 저장할 때 지울 것이 있는지)
  const [storedLogo, setStoredLogo] = useState(() => view.profile.logoPath !== null)
  const [logoProblem, setLogoProblem] = useState<LogoProblem | null>(null)
  const [dateText, setDateText] = useState('')
  const [dateTaken, setDateTaken] = useState(false)
  const [palette, setPalette] = useState<string | null>(null) // 색판을 연 사람 id
  const [saving, setSaving] = useState(false)
  const [outcome, setOutcome] = useState<Outcome>({ kind: 'idle' })
  const fileInput = useRef<HTMLInputElement>(null)
  const ids = {
    name: useId(),
    logo: useId(),
    phone: useId(),
    address: useId(),
    honorific: useId(),
    emr: useId(),
    hours: useId(),
    closed: useId(),
    staff: useId(),
  }

  const profile = toProfile(draft, view.profile.logoPath)
  const problems = checkProfile(profile)
  const blocked = problems.length > 0
  const datesFull = draft.closedDates.length >= CLOSED_DATES_MAX
  const staffFull = draft.staff.length >= STAFF_MAX
  const markCount = new Map<string, number>()
  for (const person of draft.staff) markCount.set(person.mark.trim(), (markCount.get(person.mark.trim()) ?? 0) + 1)

  // 고치면 '저장했어요'는 사라진다(오류 칸은 [다시 저장]까지 남는다)
  const touched = () => setOutcome((now) => (now.kind === 'saved' ? { kind: 'idle' } : now))
  const edit = (change: (prev: Draft) => Draft) => {
    setDraft(change)
    touched()
  }
  const setHour = (index: number, next: Partial<HourRow>) =>
    edit((d) => ({ ...d, hours: d.hours.map((row, i) => (i === index ? { ...row, ...next } : row)) }))
  const setPerson = (id: string, next: Partial<StaffRow>) =>
    edit((d) => ({ ...d, staff: d.staff.map((person) => (person.id === id ? { ...person, ...next } : person)) }))

  function rename(id: string, name: string) {
    edit((d) => ({
      ...d,
      staff: d.staff.map((person) => (person.id !== id ? person : { ...person, name, mark: person.markTouched ? person.mark : firstChar(name) })),
    }))
  }

  function move(index: number, by: -1 | 1) {
    edit((d) => {
      const to = index + by
      if (to < 0 || to >= d.staff.length) return d
      const staff = [...d.staff]
      const [moved] = staff.splice(index, 1)
      staff.splice(to, 0, moved!)
      return { ...d, staff }
    })
  }

  // 새 사람: 이름은 비우고(적으면 표시가 첫 글자를 따라간다), 색은 아직 안 쓴 첫 색(다 쓰면 회색), 예약에 보이기 켬
  function addPerson() {
    if (staffFull) return
    const used = new Set(draft.staff.map((person) => person.color))
    const color = CAL_COLORS.find((c) => !used.has(c)) ?? 'gray'
    const added: StaffRow = { id: newStaffId([...view.profile.staff, ...draft.staff]), name: '', role: 'staff', mark: '', color, calendar: true, markTouched: false }
    edit((d) => (d.staff.length >= STAFF_MAX ? d : { ...d, staff: [...d.staff, added] }))
  }

  function addDate() {
    if (datesFull || !isYmd(dateText)) return
    if (draft.closedDates.includes(dateText)) {
      setDateTaken(true)
      return
    }
    const day = dateText
    edit((d) => (d.closedDates.includes(day) ? d : { ...d, closedDates: [...d.closedDates, day].sort() }))
    setDateText('')
    setDateTaken(false)
  }

  async function pickLogo(file: File | undefined) {
    if (!file) return
    setLogoProblem(null)
    let png: Blob | LogoProblem
    try {
      png = await normalizeLogo(file)
    } catch {
      png = 'unreadable'
    }
    if (png === 'too-big' || png === 'unreadable') {
      setLogoProblem(png)
      return
    }
    const url = await dataUrlOf(png)
    if (url === null) {
      setLogoProblem('unreadable')
      return
    }
    setLogo({ kind: 'new', blob: png, url })
    touched()
  }

  function dropLogo() {
    setLogoProblem(null)
    setLogo(storedLogo ? { kind: 'removed' } : { kind: 'none' })
    touched()
  }

  // 로고가 바뀌었으면 올리거나 뺀다. 성공하면 그 사이에 로고를 또 바꾸지 않았을 때만 '저장된 로고'로 둔다
  async function applyLogo(client: ReturnType<typeof supabaseBrowser>, sent: Logo): Promise<boolean> {
    if (sent.kind === 'new') {
      if ((await uploadLogo(client, sent.blob)) === 'failed') return false
      setStoredLogo(true)
      setLogo((now) => (now === sent ? { kind: 'saved', url: sent.url } : now))
    } else if (sent.kind === 'removed') {
      if ((await removeLogo(client)) === 'failed') return false
      setStoredLogo(false)
      setLogo((now) => (now === sent ? { kind: 'none' } : now))
    }
    return true
  }

  async function save() {
    if (saving || blocked) return
    setSaving(true)
    setOutcome({ kind: 'idle' })
    const sentLogo = logo
    let tableSaved = false
    try {
      const client = supabaseBrowser()
      const saved = await saveClinicProfile(client, profile)
      if (saved === 'failed' || saved === 'invalid') {
        setOutcome({ kind: 'failed', code: 'E-CLINIC-SAVE-FAILED' })
        return
      }
      tableSaved = true
      // 저장 층이 뺀 1년 넘게 지난 휴진일만 목록에서도 뺀다(그 사이 더한 날은 남긴다)
      const dropped = new Set(profile.closedDates.filter((day) => !saved.closedDates.includes(day)))
      if (dropped.size > 0) setDraft((d) => ({ ...d, closedDates: d.closedDates.filter((day) => !dropped.has(day)) }))
      if (!(await applyLogo(client, sentLogo))) {
        setOutcome({ kind: 'failed', code: 'E-CLINIC-LOGO-FAILED' })
        return
      }
      setOutcome({ kind: 'saved' })
    } catch {
      setOutcome({ kind: 'failed', code: tableSaved ? 'E-CLINIC-LOGO-FAILED' : 'E-CLINIC-SAVE-FAILED' })
    } finally {
      setSaving(false)
      // 헤더·탭 제목의 병원 이름은 페이지 guard가 읽는다 → 표가 저장됐으면 서버 그림을 다시 받는다(AC-6602.8)
      if (tableSaved) router.refresh()
    }
  }

  const preview = logo.kind === 'new' || logo.kind === 'saved' ? logo.url : null
  const hasLogo = logo.kind === 'new' || logo.kind === 'saved'

  return (
    <>
      <ReadOnlyFields>
        <div className="flex flex-col gap-5">
          <Field titleId={ids.name} title="병원 이름" help="헤더·탭 제목·서식·문자에 이 이름이 보여요. 비우면 가입할 때 적은 이름을 써요.">
            <input
              type="text"
              autoComplete="off"
              aria-labelledby={ids.name}
              maxLength={CLINIC_NAME_MAX}
              placeholder={view.signupName}
              className={`${ds.input} max-w-md`}
              value={draft.name}
              onChange={(event) => edit((d) => ({ ...d, name: event.target.value }))}
            />
          </Field>

          <Field titleId={ids.logo} title="로고" help={LOGO_HELP}>
            <div className="flex flex-wrap items-center gap-3">
              <div className="grid h-20 w-48 place-items-center overflow-clip rounded-control border border-line bg-canvas p-2">
                {preview !== null ? (
                  // eslint-disable-next-line @next/next/no-img-element -- 작은 그림 data: 주소(이미지 최적화 대상이 아니다)
                  <img src={preview} alt="로고 미리보기" className="max-h-full max-w-full object-contain" />
                ) : (
                  <span className="text-small text-muted">{logo.kind === 'saved' ? '미리보기를 불러오지 못했어요' : '로고 없음'}</span>
                )}
              </div>
              <WriteOnly>
                <div className="flex flex-wrap gap-2">
                  <button type="button" className={ds.button.secondarySmall} onClick={() => fileInput.current?.click()}>
                    <Icon name="upload" size={14} />
                    {hasLogo ? '로고 바꾸기' : '로고 고르기'}
                  </button>
                  {hasLogo && (
                    <button type="button" className={ds.button.secondarySmall} onClick={dropLogo}>
                      로고 빼기
                    </button>
                  )}
                  <input
                    ref={fileInput}
                    type="file"
                    hidden
                    accept={LOGO_TYPES}
                    aria-label="로고 그림 파일"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = '' // 같은 파일을 다시 고를 수 있게
                      void pickLogo(file)
                    }}
                  />
                </div>
              </WriteOnly>
            </div>
            {logoProblem && <p className={ds.fieldError}>{LOGO_PROBLEM[logoProblem]}</p>}
          </Field>

          <Field titleId={ids.phone} title="전화">
            <input
              type="text"
              inputMode="tel"
              autoComplete="off"
              aria-labelledby={ids.phone}
              placeholder="02-123-4567"
              className={`${ds.input} max-w-60`}
              value={draft.phone}
              onChange={(event) => edit((d) => ({ ...d, phone: event.target.value }))}
            />
          </Field>

          <Field titleId={ids.address} title="주소">
            <input
              type="text"
              autoComplete="off"
              aria-labelledby={ids.address}
              maxLength={CLINIC_ADDRESS_MAX}
              className={`${ds.input} max-w-xl`}
              value={draft.address}
              onChange={(event) => edit((d) => ({ ...d, address: event.target.value }))}
            />
          </Field>

          <Field titleId={ids.honorific} title="호칭" help="문자·안내문에서 원장님을 부르는 말이에요.">
            <div role="group" aria-labelledby={ids.honorific} className={`${ds.segment.group} self-start max-md:grid-cols-3`}>
              {HONORIFICS.map((word) => (
                <button
                  key={word}
                  type="button"
                  aria-pressed={draft.honorific === word}
                  className={`${ds.segment.button} ${draft.honorific === word ? ds.segment.on : ds.segment.off}`}
                  onClick={() => edit((d) => ({ ...d, honorific: word }))}
                >
                  {word}
                </button>
              ))}
            </div>
          </Field>

          <Field titleId={ids.emr} title="쓰는 EMR" help="진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 의사랑·이지스는 준비하고 있어요.">
            <div role="group" aria-labelledby={ids.emr} className={`${ds.segment.group} self-start max-md:grid-cols-2`}>
              {EMR_KINDS.map((emr) => (
                <button
                  key={emr}
                  type="button"
                  aria-pressed={draft.emr === emr}
                  className={`${ds.segment.button} ${draft.emr === emr ? ds.segment.on : ds.segment.off}`}
                  onClick={() => edit((d) => ({ ...d, emr }))}
                >
                  {EMR_LABEL[emr]}
                </button>
              ))}
            </div>
          </Field>

          <Field titleId={ids.hours} title="진료시간" help="요일마다 10분 단위로 골라요. 점심을 '없음'으로 두면 점심시간이 없어요.">
            <ul aria-labelledby={ids.hours} className="flex flex-col rounded-control border border-line">
              {draft.hours.map((row, index) => {
                const day = WEEKDAY_NAMES[index]
                const problem = dayProblem(toDay(row))
                const bad = problem !== null
                return (
                  <li key={day} className="flex flex-col gap-1 border-b border-line px-3 py-2 last:border-b-0">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                      <span className="w-5 text-body font-semibold text-ink">{day}</span>
                      <label className={INLINE}>
                        <Checkbox label={`${day}요일 휴진`} checked={row.closed} onChange={(closed) => setHour(index, { closed })} />
                        휴진
                      </label>
                      <span className={INLINE}>
                        <TimeSelect label={`${day}요일 시작`} value={row.open} disabled={row.closed} invalid={bad} onChange={(open) => setHour(index, { open: open ?? row.open })} />
                        <span aria-hidden="true">~</span>
                        <TimeSelect label={`${day}요일 끝`} value={row.close} disabled={row.closed} invalid={bad} onChange={(close) => setHour(index, { close: close ?? row.close })} />
                      </span>
                      <span className={INLINE}>
                        점심
                        <TimeSelect
                          label={`${day}요일 점심 시작`}
                          value={row.lunchFrom}
                          empty
                          disabled={row.closed}
                          invalid={bad}
                          onChange={(lunchFrom) => setHour(index, { lunchFrom })}
                        />
                        <span aria-hidden="true">~</span>
                        <TimeSelect
                          label={`${day}요일 점심 끝`}
                          value={row.lunchTo}
                          empty
                          disabled={row.closed}
                          invalid={bad}
                          onChange={(lunchTo) => setHour(index, { lunchTo })}
                        />
                      </span>
                    </div>
                    {problem !== null && <p className={ds.fieldError}>{problem}</p>}
                  </li>
                )
              })}
            </ul>
          </Field>

          <Field
            titleId={ids.closed}
            title="휴진일"
            help={`날짜를 더하면 앞날부터 차례로 보여요. 같은 날은 한 번만, ${CLOSED_DATES_MAX}개까지 적어요. 1년 넘게 지난 날은 저장할 때 빠져요.`}
          >
            <WriteOnly>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="휴진일 날짜"
                  className={`${ds.input} w-48! max-w-full`}
                  value={dateText}
                  disabled={datesFull}
                  onChange={(event) => {
                    setDateText(event.target.value)
                    setDateTaken(false)
                  }}
                />
                <button type="button" className={ds.button.secondary} disabled={datesFull} onClick={addDate}>
                  더하기
                </button>
              </div>
              {datesFull ? (
                <p className={ds.help}>{`휴진일은 ${CLOSED_DATES_MAX}개까지예요`}</p>
              ) : (
                dateTaken && <p className={ds.fieldError}>이미 더한 날이에요.</p>
              )}
            </WriteOnly>
            <ul aria-label="휴진일 목록" className="flex flex-wrap gap-1.5">
              {draft.closedDates.map((day) => (
                <li key={day} className={CHIP}>
                  <span>{dateLabel(day)}</span>
                  <WriteOnly>
                    <button
                      type="button"
                      aria-label={`${day} 빼기`}
                      className={CHIP_X}
                      onClick={() => edit((d) => ({ ...d, closedDates: d.closedDates.filter((x) => x !== day) }))}
                    >
                      <Icon name="x" size={12} />
                    </button>
                  </WriteOnly>
                </li>
              ))}
            </ul>
            {draft.closedDates.length === 0 && <p className="text-small text-muted">더한 휴진일이 없어요.</p>}
          </Field>

          <Field
            titleId={ids.staff}
            title="원장님·직원"
            help={`'예약에 보이기'를 켠 사람이 예약 시행자로 나와요. 표시는 예약 칸 끝의 한 글자예요. ${STAFF_MAX}명까지 적어요.`}
          >
            {draft.staff.length > 0 ? (
              <ul aria-label="원장님·직원 목록" className="flex flex-col gap-1.5">
                {draft.staff.map((person, index) => {
                  const n = index + 1
                  const open = palette === person.id
                  const name = person.name.trim()
                  const nameBad = name === '' || [...name].length > STAFF_NAME_MAX
                  const mark = person.mark.trim()
                  const markBad = [...mark].length !== 1 || (markCount.get(mark) ?? 0) > 1
                  return (
                    <li key={person.id} className="flex flex-col gap-2 rounded-control border border-line px-3 py-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <input
                          type="text"
                          autoComplete="off"
                          aria-label="이름"
                          placeholder="이름"
                          maxLength={STAFF_NAME_MAX}
                          aria-invalid={nameBad || undefined}
                          className={`${FIELD} w-32`}
                          value={person.name}
                          onChange={(event) => rename(person.id, event.target.value)}
                        />
                        <div role="group" aria-label={`${n}번째 사람 구분`} className={`${ds.segment.group} max-md:grid-cols-2`}>
                          {STAFF_ROLES.map((role) => (
                            <button
                              key={role}
                              type="button"
                              aria-pressed={person.role === role}
                              className={`${ds.segment.button} ${person.role === role ? ds.segment.on : ds.segment.off}`}
                              onClick={() => setPerson(person.id, { role })}
                            >
                              {ROLE_LABEL[role]}
                            </button>
                          ))}
                        </div>
                        <label className={INLINE}>
                          표시
                          <input
                            type="text"
                            autoComplete="off"
                            aria-label="예약 표시 글자"
                            maxLength={2}
                            aria-invalid={markBad || undefined}
                            className={`${FIELD} w-10 text-center font-semibold max-md:w-11`}
                            value={person.mark}
                            onChange={(event) => setPerson(person.id, { mark: event.target.value, markTouched: true })}
                          />
                        </label>
                        <button
                          type="button"
                          aria-label={`색 고르기 (${CAL_COLOR_LABEL[person.color]})`}
                          aria-expanded={open}
                          className={colorButton(open)}
                          onClick={() => setPalette(open ? null : person.id)}
                        >
                          <Swatch color={person.color} />
                          {CAL_COLOR_LABEL[person.color]}
                          <span aria-hidden="true" className="text-caption text-muted">
                            ▼
                          </span>
                        </button>
                        <label className={INLINE}>
                          <Checkbox checked={person.calendar} onChange={(calendar) => setPerson(person.id, { calendar })} />
                          예약에 보이기
                        </label>
                        <WriteOnly>
                          <span className="inline-flex gap-1">
                            <button type="button" aria-label={`${n}번째 사람 위로`} disabled={index === 0} className={MINI} onClick={() => move(index, -1)}>
                              ▲
                            </button>
                            <button
                              type="button"
                              aria-label={`${n}번째 사람 아래로`}
                              disabled={index === draft.staff.length - 1}
                              className={MINI}
                              onClick={() => move(index, 1)}
                            >
                              ▼
                            </button>
                          </span>
                          <button
                            type="button"
                            aria-label={`${n}번째 사람 빼기`}
                            className={DELETE}
                            onClick={() => edit((d) => ({ ...d, staff: d.staff.filter((s) => s.id !== person.id) }))}
                          >
                            빼기
                          </button>
                        </WriteOnly>
                      </div>
                      {open && (
                        <Palette
                          color={person.color}
                          onPick={(color) => {
                            setPerson(person.id, { color })
                            setPalette(null)
                          }}
                        />
                      )}
                    </li>
                  )
                })}
              </ul>
            ) : (
              <p className="text-small text-muted">더한 사람이 없어요.</p>
            )}
            <WriteOnly>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <button type="button" className={ds.button.secondarySmall} disabled={staffFull} onClick={addPerson}>
                  <CalIcon name="plus" size={14} />
                  사람 더하기
                </button>
                {staffFull && <span className={ds.help}>{`원장님·직원은 ${STAFF_MAX}명까지예요`}</span>}
              </div>
            </WriteOnly>
          </Field>
        </div>
      </ReadOnlyFields>

      <WriteOnly>
        <div className="flex flex-col gap-2 border-t border-line pt-4">
          <div className="flex flex-wrap items-center gap-3">
            <button type="button" className={ds.button.primary} disabled={blocked} aria-busy={saving || undefined} onClick={() => void save()}>
              저장
            </button>
            {blocked && <p className={ds.fieldError}>{problems[0]}</p>}
            {outcome.kind === 'saved' && (
              <p role="status" className="text-small text-ink-2">
                저장했어요
              </p>
            )}
          </div>
          {outcome.kind === 'failed' && (
            <div className="flex flex-col items-start gap-2">
              <ErrorCard code={outcome.code} />
              <button type="button" className={ds.button.secondarySmall} disabled={blocked} aria-busy={saving || undefined} onClick={() => void save()}>
                다시 저장
              </button>
            </div>
          )}
        </div>
      </WriteOnly>
    </>
  )
}
