'use client'

import { useId, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { ds } from '@/components/ui/classes'
import { ceilHalf } from '@/lib/staff/leave'
import { StaffStoreError, type StaffStore } from '@/lib/storage/staff'
import type { ErrorCode } from '@/types/errors'
import type { LeaveBasis, Leftover, StaffMember, StaffSettings } from '@/types/staff'
import { LeaveDialog } from './LeaveDialog'

// 연차 규칙 칸 (staff AC-7614.5, 시안 leave.html ⑤). 병원마다 두 가지(연차 기준·못 쓴 연차)를 고르고 [저장] — 설정 줄 하나(staff_settings)를 저장한다.
// 법으로 정해진 셈법은 고를 수 없어 아래에 보여만 준다(파트타임 줄은 Claude가 정한 것 2, 보기는 재직 파트타임 한 사람).
// 저장하면 공용 자료(useStaffBase)를 다시 읽어 표·달력이 새 기준으로 다시 셈한다

const BASIS: readonly { value: LeaveBasis; title: string; text: string }[] = [
  { value: 'hire', title: '입사일 기준', text: '사람마다 입사한 날부터 1년씩 세요. 입사 기념일에 새 연차가 생겨요.' },
  {
    value: 'jan1',
    title: '1월 1일 기준',
    text: '모두 1월 1일에 한꺼번에 새 연차가 생겨요. 입사한 해는 일한 날만큼 나눠 주고, 퇴사할 때 입사일 기준보다 적으면 차이를 알려 드려요.',
  },
]
const LEFTOVER: readonly { value: Leftover; title: string; text: string }[] = [
  { value: 'pay', title: '수당으로 정산', text: '연차 기간이 끝날 때 남은 일수를 세무사 자료에 넣어요. 금액은 세무사가 계산해요.' },
  { value: 'carry', title: '다음 해로 넘김', text: '남은 일수를 다음 연차 기간에 더해요.' },
]
const LAW = [
  '1년 미만: 한 달 다 나오면 1일씩 (최대 11일)',
  '1년 이상: 15일, 3년째부터 2년마다 1일 더 (최대 25일)',
  '파트타임: 15일 × 주 근무시간 ÷ 40 (가산 일수도 같은 비율, 주 15시간 밑이면 연차 없음)',
  '쓰는 단위: 하루 · 반차(오전/오후)',
  '직원 5명 이상 의원 규칙이에요.',
]

function Options<T extends string>({
  name,
  label,
  options,
  value,
  onChange,
}: {
  name: string
  label: string
  options: readonly { value: T; title: string; text: string }[]
  value: T
  onChange(value: T): void
}) {
  const labelId = useId()
  return (
    <div role="radiogroup" aria-labelledby={labelId} className="grid gap-2">
      <span id={labelId} className="text-body font-semibold text-ink">
        {label}
      </span>
      {options.map((option) => {
        const on = option.value === value
        return (
          <label
            key={option.value}
            className={`grid cursor-pointer grid-cols-[1.25rem_minmax(0,1fr)] gap-3 rounded-control border p-3 ${on ? 'border-accent bg-accent-soft' : 'border-line bg-surface'}`}
          >
            <input type="radio" name={name} checked={on} onChange={() => onChange(option.value)} className={`mt-0.5 size-4 accent-accent ${ds.focusRing}`} />
            <span className="grid gap-0.5">
              <span className="text-body font-semibold text-ink">{option.title}</span>{' '}
              <span className="text-small text-ink-2">{option.text}</span>
            </span>
          </label>
        )
      })}
    </div>
  )
}

type LeaveRulesProps = {
  settings: StaffSettings
  /** 재직자(파트타임 보기를 고른다) */
  active: readonly StaffMember[]
  store: Pick<StaffStore, 'saveSettings'>
  onSaved(): void
  onClose(): void
}

export function LeaveRules({ settings, active, store, onSaved, onClose }: LeaveRulesProps) {
  const groupName = useId()
  const lawId = useId()
  const [basis, setBasis] = useState(settings.leaveBasis)
  const [leftover, setLeftover] = useState(settings.leftover)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ErrorCode | null>(null)

  // 보기: 재직 파트타임 가운데 주 15시간 이상인 첫 사람(주 40시간까지만 비례)
  const sample = active.find((m) => m.employment === 'part' && m.weeklyHours >= 15) ?? null
  const hours = sample ? Math.min(sample.weeklyHours, 40) : 0

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      await store.saveSettings({ ...settings, leaveBasis: basis, leftover })
      onSaved()
    } catch (e) {
      setError(e instanceof StaffStoreError ? e.code : 'E-STAFF-SAVE-FAILED')
      setBusy(false)
    }
  }

  return (
    <LeaveDialog title="연차 규칙" onClose={onClose}>
      <Options<LeaveBasis> name={`${groupName}-basis`} label="연차 기준" options={BASIS} value={basis} onChange={setBasis} />
      <Options<Leftover> name={`${groupName}-leftover`} label="못 쓴 연차" options={LEFTOVER} value={leftover} onChange={setLeftover} />
      {error !== null ? <ErrorCard code={error} /> : null}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} aria-busy={busy || undefined} className={ds.button.primary}>
          저장
        </button>
        <button type="button" onClick={onClose} className={ds.button.secondary}>
          취소
        </button>
      </div>
      <div className="grid gap-2">
        <span id={lawId} className="text-small font-semibold text-ink-2">
          법으로 정해진 셈법
        </span>
        <ul aria-labelledby={lawId} className="grid list-disc gap-0.5 rounded-control border border-line bg-canvas py-2 pr-3 pl-8 text-small text-ink-2">
          {LAW.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        {sample !== null ? (
          <p className={ds.help}>{`예: ${sample.name} 님 주 ${sample.weeklyHours}시간 → 15 × ${hours} ÷ 40 = ${ceilHalf((15 * hours) / 40)}일.`}</p>
        ) : null}
      </div>
    </LeaveDialog>
  )
}
