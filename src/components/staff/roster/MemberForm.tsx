'use client'

import { useId, useState, type ReactNode } from 'react'
import { Swatch } from '@/components/calendar/CalendarToolbar'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { EMPLOYMENT_LABEL } from '@/components/staff/labels'
import { ds } from '@/components/ui/classes'
import { isYmd } from '@/lib/analytics/dates'
import { phoneText } from '@/lib/clinic/format'
import { hasNationalId } from '@/lib/staff/nationalId'
import type { StaffStore } from '@/lib/storage/staff'
import type { ClinicStaff } from '@/types/clinicProfile'
import type { ErrorCode } from '@/types/errors'
import { EMPLOYMENTS, STAFF_JOBS, type Employment, type StaffJob, type StaffMember, type StaffSettings } from '@/types/staff'
import { codeOf, periodStartOf } from './rosterText'

// 직원 더하기 · 고치기 칸(staff AC-7612.3, 시안 list.html ③). 꼭 적을 칸은 이름·입사일 둘이고 나머지는 비워도 저장된다.
// 칸 규칙(AC-7601.4)은 저장 전에 칸 아래 까닭으로 막는다(DB도 같은 규칙으로 막는다). '올해 이미 쓴 연차'는 더할 때만 있고,
// 이번 연차 기간 시작일과 함께 저장한다. 직종을 고르지 않으면 '기타'(직접 적은 직종 없음 — 엑셀로 넣을 때와 같다)

const OTHER_BANK = '그 밖의 은행'
/** 은행 고르기(Claude가 정한 것 9: 주요 은행 + '그 밖의 은행' 직접 적기) */
const BANKS = [
  'KB국민은행',
  '신한은행',
  '우리은행',
  '하나은행',
  'NH농협은행',
  'IBK기업은행',
  'SC제일은행',
  '씨티은행',
  'KDB산업은행',
  '수협은행',
  '카카오뱅크',
  '케이뱅크',
  '토스뱅크',
  '새마을금고',
  '신협',
  '우체국',
  'iM뱅크',
  '부산은행',
  '경남은행',
  '광주은행',
  '전북은행',
  '제주은행',
] as const

// DB 제약과 같은 한도(AC-7601.4)
const NAME_MAX = 20
const JOB_OTHER_MAX = 20
const ADDRESS_MAX = 100
const BANK_MAX = 20
const MEMO_MAX = 500
const ACCOUNT = /^[0-9-]{6,30}$/
const DECIMAL = /^\d+(\.\d+)?$/

const lengthOf = (text: string) => [...text].length
const halfStep = (text: string, max: number): number | null => {
  const value = Number(text)
  return DECIMAL.test(text) && value <= max && Number.isInteger(value * 2) ? value : null
}

type Draft = {
  name: string
  employment: Employment
  job: StaffJob | null
  jobOther: string
  weeklyHours: string
  hiredOn: string
  leftOn: string
  phone: string
  birthday: string
  address: string
  bank: string // '' = 고르지 않음 · 목록 은행 · OTHER_BANK
  bankOther: string
  accountNo: string
  calendarStaffId: string | null
  usedBefore: string
  memo: string
}
type Problems = Partial<Record<keyof Draft, string>>

function draftOf(member: StaffMember | null): Draft {
  const bank = member?.bank ?? null
  const listed = bank !== null && (BANKS as readonly string[]).includes(bank)
  return {
    name: member?.name ?? '',
    employment: member?.employment ?? 'regular',
    job: member?.job ?? null,
    jobOther: member?.jobOther ?? '',
    weeklyHours: String(member?.weeklyHours ?? 40),
    hiredOn: member?.hiredOn ?? '',
    leftOn: member?.leftOn ?? '',
    phone: member?.phone == null ? '' : phoneText(member.phone),
    birthday: member?.birthday ?? '',
    address: member?.address ?? '',
    bank: bank === null ? '' : listed ? bank : OTHER_BANK,
    bankOther: bank !== null && !listed ? bank : '',
    accountNo: member?.accountNo ?? '',
    calendarStaffId: member?.calendarStaffId ?? null,
    usedBefore: '0',
    memo: member?.memo ?? '',
  }
}

// 주소·메모에 주민번호 모양이 있으면 저장하지 않는다(AC-7612.7). 모양은 lib/staff/nationalId.ts 한 곳(엑셀 읽기·저장 층과 같다)
const NATIONAL_ID_PROBLEM = '주민번호는 저장하지 않아요. 지우고 다시 저장해 주세요.'

const digitsOf = (phone: string) => phone.replace(/[\s.()-]/g, '')

function check(draft: Draft, others: readonly StaffMember[], adding: boolean): Problems {
  const problems: Problems = {}
  const name = draft.name.trim()
  if (name === '') problems.name = '이름을 적어 주세요.'
  else if (lengthOf(name) > NAME_MAX) problems.name = `이름은 ${NAME_MAX}자까지예요.`
  else if (others.some((m) => m.name === name && m.hiredOn === draft.hiredOn)) problems.name = '같은 이름과 입사일인 직원이 이미 있어요.'
  if (draft.job === '기타' && lengthOf(draft.jobOther.trim()) > JOB_OTHER_MAX) problems.jobOther = `직종은 ${JOB_OTHER_MAX}자까지예요.`
  if (halfStep(draft.weeklyHours.trim(), 80) === null) problems.weeklyHours = '주 근무시간은 0~80시간, 0.5시간 단위로 적어 주세요.'
  if (!isYmd(draft.hiredOn)) problems.hiredOn = '입사일을 적어 주세요. 연차와 근속을 셀 때 써요.'
  if (draft.leftOn !== '' && !isYmd(draft.leftOn)) problems.leftOn = '날짜 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'
  else if (draft.leftOn !== '' && isYmd(draft.hiredOn) && draft.leftOn < draft.hiredOn) problems.leftOn = '퇴사일은 입사일보다 앞일 수 없어요.'
  const phone = digitsOf(draft.phone.trim())
  if (phone !== '' && !/^[0-9]{9,11}$/.test(phone)) problems.phone = '연락처는 숫자 9~11자리로 적어 주세요.'
  if (draft.birthday !== '' && !isYmd(draft.birthday)) problems.birthday = '날짜 모양이 틀렸어요. 2026-03-02처럼 적어 주세요.'
  if (lengthOf(draft.address.trim()) > ADDRESS_MAX) problems.address = `주소는 ${ADDRESS_MAX}자까지예요.`
  else if (hasNationalId(draft.address)) problems.address = NATIONAL_ID_PROBLEM
  if (draft.bank === OTHER_BANK && lengthOf(draft.bankOther.trim()) > BANK_MAX) problems.bankOther = `은행 이름은 ${BANK_MAX}자까지예요.`
  const account = draft.accountNo.trim()
  if (account !== '' && !ACCOUNT.test(account)) problems.accountNo = '계좌번호는 숫자와 - 만, 6~30자로 적어 주세요.'
  if (adding && draft.usedBefore.trim() !== '' && halfStep(draft.usedBefore.trim(), 50) === null) problems.usedBefore = '0~50일, 0.5일 단위로 적어 주세요.'
  if (lengthOf(draft.memo.trim()) > MEMO_MAX) problems.memo = `메모는 ${MEMO_MAX}자까지예요.`
  else if (hasNationalId(draft.memo)) problems.memo = NATIONAL_ID_PROBLEM
  return problems
}

const orNull = (text: string) => (text.trim() === '' ? null : text.trim())

function memberOf(draft: Draft, member: StaffMember | null, settings: StaffSettings, today: string): Omit<StaffMember, 'id'> {
  const job = draft.job ?? '기타'
  const employment = draft.employment
  const weeklyHours = Number(draft.weeklyHours.trim())
  const hiredOn = draft.hiredOn
  const leftOn = draft.leftOn === '' ? null : draft.leftOn
  const bank = draft.bank === OTHER_BANK ? orNull(draft.bankOther) : draft.bank === '' ? null : draft.bank
  const usedBefore = member === null ? Number(draft.usedBefore.trim() || '0') : member.usedBefore
  const usedBeforeFrom =
    member === null ? (usedBefore > 0 ? periodStartOf({ employment, weeklyHours, hiredOn, leftOn }, settings, today) : null) : member.usedBeforeFrom
  return {
    name: draft.name.trim(),
    job,
    jobOther: job === '기타' ? orNull(draft.jobOther) : null,
    employment,
    weeklyHours,
    hiredOn,
    leftOn,
    phone: orNull(digitsOf(draft.phone)),
    birthday: draft.birthday === '' ? null : draft.birthday,
    address: orNull(draft.address),
    bank,
    accountNo: orNull(draft.accountNo),
    calendarStaffId: draft.calendarStaffId,
    memo: orNull(draft.memo),
    usedBefore,
    usedBeforeFrom,
  }
}

const pill = `${ds.button.secondarySmall} aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:text-accent-strong`
const textarea =
  'min-h-20 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'
const pickRow =
  'flex w-full cursor-pointer items-center gap-1.5 border-t border-line px-3 py-2 text-left text-small text-ink first:border-t-0 aria-pressed:bg-accent-soft aria-pressed:font-semibold disabled:cursor-not-allowed disabled:text-muted focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent'

function Field({
  id,
  label,
  required,
  help,
  error,
  full,
  children,
}: {
  id: string
  label: string
  required?: boolean
  help?: string
  error?: string
  full?: boolean
  children: ReactNode
}) {
  return (
    <div className={`${ds.field} min-w-0 ${full ? 'col-span-2' : ''}`}>
      <div className="flex items-center gap-1.5">
        <label htmlFor={id} className={ds.label}>
          {label}
        </label>
        {required && <span className={ds.chip.negative}>꼭</span>}
      </div>
      {children}
      {error && (
        <p id={`${id}-error`} className={ds.fieldError}>
          {error}
        </p>
      )}
      {help && <p className={ds.help}>{help}</p>}
    </div>
  )
}

function Group({ title, children }: { title: string; children: ReactNode }) {
  const titleId = useId()
  return (
    <section aria-labelledby={titleId} className={`${ds.panel} flex flex-col gap-3 px-4 py-4`}>
      <h3 id={titleId} className="text-body font-semibold text-ink">
        {title}
      </h3>
      <div className="grid grid-cols-2 gap-x-4 gap-y-3">{children}</div>
    </section>
  )
}

export function MemberForm({
  member,
  members,
  calendarStaff,
  settings,
  today,
  store,
  onBack,
  onCancel,
  onSaved,
}: {
  /** 고칠 사람. null = 더하기 */
  member: StaffMember | null
  members: readonly StaffMember[]
  /** 병원 정보 원장님·직원 모두(예약에 보이기인 사람만 고른다) */
  calendarStaff: readonly ClinicStaff[]
  settings: StaffSettings
  today: string
  store: StaffStore
  onBack(): void
  onCancel(): void
  onSaved(saved: StaffMember): void
}) {
  const adding = member === null
  const [draft, setDraft] = useState<Draft>(() => draftOf(member))
  const [problems, setProblems] = useState<Problems>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<ErrorCode | null>(null)
  const id = useId()
  const ids = {
    name: `${id}-name`,
    employment: `${id}-employment`,
    job: `${id}-job`,
    jobOther: `${id}-job-other`,
    weeklyHours: `${id}-hours`,
    hiredOn: `${id}-hired`,
    leftOn: `${id}-left`,
    phone: `${id}-phone`,
    birthday: `${id}-birthday`,
    address: `${id}-address`,
    bank: `${id}-bank`,
    bankOther: `${id}-bank-other`,
    accountNo: `${id}-account`,
    calendar: `${id}-calendar`,
    usedBefore: `${id}-used`,
    memo: `${id}-memo`,
  }

  const others = members.filter((m) => m.id !== member?.id)
  // 다른 직원과 이어진 예약 시행자 → 그 직원 이름(AC-7601.4 한 시행자는 한 사람에게만)
  const takenBy = new Map(others.flatMap((m) => (m.calendarStaffId === null ? [] : [[m.calendarStaffId, m.name] as const])))
  const choices = calendarStaff.filter((person) => person.calendar)

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  // 칸 props: 값·바꾸기·오류 표시
  const text = (key: keyof Draft & keyof typeof ids) => ({
    id: ids[key],
    value: draft[key] as string,
    'aria-invalid': problems[key] ? true : undefined,
    'aria-describedby': problems[key] ? `${ids[key]}-error` : undefined,
    onChange: (event: { target: { value: string } }) => set(key, event.target.value as Draft[typeof key]),
  })

  async function save() {
    if (saving) return
    const found = check(draft, others, adding)
    setProblems(found)
    setSaveError(null)
    if (Object.keys(found).length > 0) return
    setSaving(true)
    try {
      const saved = await store.saveMember(memberOf(draft, member, settings, today), member?.id)
      onSaved(saved)
    } catch (error) {
      setSaveError(codeOf(error, 'E-STAFF-SAVE-FAILED'))
      setSaving(false)
    }
  }

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <button type="button" className={`${ds.textButton} self-start text-small`} onClick={onBack}>
        ← 명단으로
      </button>
      <h2 className="text-subtitle font-semibold text-ink">{adding ? '직원 더하기' : `${member.name} 님 고치기`}</h2>

      <Group title="기본">
        <Field id={ids.name} label="이름" required error={problems.name}>
          <input type="text" className={ds.input} {...text('name')} />
        </Field>
        <div className={`${ds.field} min-w-0`}>
          <span id={ids.employment} className={ds.label}>
            근무 형태
          </span>
          <div role="group" aria-labelledby={ids.employment} className="flex flex-wrap gap-1.5">
            {EMPLOYMENTS.map((value) => (
              <button key={value} type="button" aria-pressed={draft.employment === value} className={pill} onClick={() => set('employment', value)}>
                {EMPLOYMENT_LABEL[value]}
              </button>
            ))}
          </div>
        </div>
        <div className={`${ds.field} col-span-2 min-w-0`}>
          <span id={ids.job} className={ds.label}>
            직종
          </span>
          <div role="group" aria-labelledby={ids.job} className="flex flex-wrap gap-1.5">
            {STAFF_JOBS.map((value) => (
              <button key={value} type="button" aria-pressed={draft.job === value} className={pill} onClick={() => set('job', value)}>
                {value}
              </button>
            ))}
          </div>
        </div>
        {draft.job === '기타' && (
          <Field id={ids.jobOther} label="직종 직접 적기" help="'기타'를 고르면 나오는 칸이에요." error={problems.jobOther}>
            <input type="text" className={ds.input} {...text('jobOther')} />
          </Field>
        )}
        <Field id={ids.weeklyHours} label="주 근무시간" help="연차를 셀 때 써요. 주 15시간 안 되면 연차가 없어요." error={problems.weeklyHours}>
          <div className="flex items-center gap-2">
            <input type="text" inputMode="decimal" className={`${ds.input} max-w-32`} {...text('weeklyHours')} />
            <span className="text-small text-muted">시간</span>
          </div>
        </Field>
        <Field id={ids.hiredOn} label="입사일" required error={problems.hiredOn}>
          <input type="date" placeholder="예) 2026-11-23" className={ds.input} {...text('hiredOn')} />
        </Field>
        <Field id={ids.leftOn} label="퇴사일" help="넣으면 '퇴사' 목록으로 옮겨요." error={problems.leftOn}>
          <input type="date" placeholder="비워 두세요" className={ds.input} {...text('leftOn')} />
        </Field>
      </Group>

      <Group title="연락 · 급여 계좌">
        <Field id={ids.phone} label="연락처" error={problems.phone}>
          <input type="tel" className={ds.input} {...text('phone')} />
        </Field>
        <Field id={ids.birthday} label="생일" error={problems.birthday}>
          <input type="date" className={ds.input} {...text('birthday')} />
        </Field>
        <Field id={ids.address} label="주소" full error={problems.address}>
          <input type="text" placeholder="○○시 ○○구 ○○로" className={ds.input} {...text('address')} />
        </Field>
        <Field id={ids.bank} label="은행">
          <select id={ids.bank} className={ds.input} value={draft.bank} onChange={(event) => set('bank', event.target.value)}>
            <option value="">고르기</option>
            {BANKS.map((bank) => (
              <option key={bank} value={bank}>
                {bank}
              </option>
            ))}
            <option value={OTHER_BANK}>{OTHER_BANK}</option>
          </select>
        </Field>
        <Field id={ids.accountNo} label="계좌번호" error={problems.accountNo}>
          <input type="text" inputMode="numeric" placeholder="숫자와 - 만" className={ds.input} {...text('accountNo')} />
        </Field>
        {draft.bank === OTHER_BANK && (
          <Field id={ids.bankOther} label="은행 이름" error={problems.bankOther}>
            <input type="text" className={ds.input} {...text('bankOther')} />
          </Field>
        )}
      </Group>

      <Group title="예약 · 연차 · 메모">
        <div className={`${ds.field} min-w-0`}>
          <span id={ids.calendar} className={ds.label}>
            예약 시행자
          </span>
          <div role="group" aria-labelledby={ids.calendar} className="flex flex-col overflow-clip rounded-control border border-line-strong bg-surface">
            <button type="button" aria-pressed={draft.calendarStaffId === null} className={pickRow} onClick={() => set('calendarStaffId', null)}>
              없음
              {draft.calendarStaffId === null && <Icon name="check" className="ml-auto text-accent" />}
            </button>
            {choices.map((person) => {
              const taken = takenBy.get(person.id)
              const picked = draft.calendarStaffId === person.id
              return (
                <button
                  key={person.id}
                  type="button"
                  disabled={taken !== undefined}
                  aria-pressed={picked}
                  className={pickRow}
                  onClick={() => set('calendarStaffId', person.id)}
                >
                  <Swatch color={person.color} />
                  {`(${person.mark}) ${person.name}`}
                  {taken !== undefined && <small className="ml-auto text-caption font-normal">{`${taken} 님과 이어짐`}</small>}
                  {picked && <Icon name="check" className="ml-auto text-accent" />}
                </button>
              )
            })}
          </div>
          <p className={ds.help}>고르면 휴가가 예약 달력에 &apos;휴무&apos;로 보여요. 목록은 설정 → 병원 정보 &apos;원장님·직원&apos;에서 고쳐요.</p>
        </div>
        {adding && (
          <Field
            id={ids.usedBefore}
            label="올해 이미 쓴 연차"
            help="처음 넣을 때만 적어요. 웹앱을 쓰기 전에 이번 연차 기간에 이미 쓴 날수예요. 반차는 0.5로 적어요."
            error={problems.usedBefore}
          >
            <div className="flex items-center gap-2">
              <input type="text" inputMode="decimal" className={`${ds.input} max-w-32`} {...text('usedBefore')} />
              <span className="text-small text-muted">일</span>
            </div>
          </Field>
        )}
        <Field id={ids.memo} label="메모" full error={problems.memo}>
          <textarea rows={3} placeholder="자유롭게 적어요" className={textarea} {...text('memo')} />
        </Field>
      </Group>

      {saveError !== null && <ErrorCard code={saveError} />}
      <div className="flex flex-wrap gap-2">
        <button type="button" aria-busy={saving || undefined} className={ds.button.primary} onClick={() => void save()}>
          저장
        </button>
        <button type="button" className={ds.button.secondary} onClick={onCancel}>
          취소
        </button>
      </div>
    </div>
  )
}
