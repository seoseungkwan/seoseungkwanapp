'use client'

import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { cleanText, CONTACT_LIMITS, FIELD_LABELS, parseWon, wonText } from '@/lib/contacts/fields'
import type { Equipment, EquipmentFields, Person, PersonFields, Repair, RepairFields } from '@/types/contacts'
import { TextField, useReturnFocus, useSending } from './formBits'
import { look } from './look'
import type { SaveResult } from './types'

// 그 자리에서 고치는 칸(spec contacts AC-6505.5·AC-6505.7, 시안 기본값 11·14·15 · personForm·equipForm·repairForm).
// 담당자·장비·수리 기록 줄의 [+ …]·[고치기]가 그 자리에 연다. 빈 필수 칸·담당자 이름 겹침(손에 든 주소록)은 보내지 않는다.
// [저장]은 onSave(칸) → 되면 onDone('저장했어요.'), duplicate면 겹침 글, failed면 E-CONTACTS-SAVE-FAILED 카드(적은 값 그대로).
// [지우기](고칠 때만): 담당자·수리 기록은 묻지 않고 onDelete → onDone('…을 지웠어요.'), 장비는 onAskDelete로 확인 창을 부른다

const SAVED = '저장했어요.'
const NAME_EMPTY = '이름을 적어 주세요.'
const PERSON_DUPLICATE = '같은 이름의 담당자가 이미 있어요.'
const EQUIPMENT_EMPTY = '장비 이름을 적어 주세요.'
const CONTENT_EMPTY = '내용을 적어 주세요.'
const COST_DIGITS = String(9_999_999_999).length

/** 비용 칸 글: 숫자만(앞 0 뺌, 10자리까지) + 천 단위 쉼표 */
export function costText(typed: string): string {
  const digits = typed.replace(/\D/g, '').replace(/^0+(?=\d)/, '').slice(0, COST_DIGITS)
  return digits === '' ? '' : wonText(Number(digits))
}

type FrameProps = {
  title: string
  failed: boolean
  busy: boolean
  onSubmit(): void
  onCancel(): void
  onDelete?: () => void
  children: ReactNode
}

function InlineFrame({ title, failed, busy, onSubmit, onCancel, onDelete, children }: FrameProps) {
  useReturnFocus()
  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit()
  }
  return (
    <form aria-label={title} noValidate onSubmit={submit} className="mt-2 grid gap-3 rounded-control bg-canvas p-3">
      <h4 className="text-small font-semibold text-ink">{title}</h4>
      {children}
      {failed && <ErrorCard code="E-CONTACTS-SAVE-FAILED" />}
      <div className="flex flex-wrap items-center justify-end gap-2">
        {onDelete && (
          <button type="button" aria-busy={busy || undefined} onClick={onDelete} className={`mr-auto ${look.textButtonDanger}`}>
            지우기
          </button>
        )}
        <button type="button" onClick={onCancel} className={look.buttonSmall}>
          그만두기
        </button>
        <button type="submit" aria-busy={busy || undefined} className={look.primarySmall}>
          저장
        </button>
      </div>
    </form>
  )
}

/** 열릴 때 첫 칸에 초점 */
function useFirstFocus() {
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    ref.current?.focus()
  }, [])
  return ref
}

// ── 담당자 ─────────────────────────────────────────────

type PersonFormProps = {
  person: Person | null
  /** 같은 업체의 다른 담당자 이름(겹침을 먼저 본다) */
  others: readonly string[]
  onSave(fields: PersonFields): Promise<SaveResult>
  onDelete?: () => Promise<SaveResult>
  onCancel(): void
  onDone(notice: string): void
}

export function PersonForm({ person, others, onSave, onDelete, onCancel, onDone }: PersonFormProps) {
  const id = useId()
  const nameRef = useFirstFocus()
  const [name, setName] = useState(person?.name ?? '')
  const [mobile, setMobile] = useState(person?.mobile ?? '')
  const [role, setRole] = useState(person?.role ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const { busy, failed, send } = useSending()
  const labels = FIELD_LABELS.person
  const limits = CONTACT_LIMITS.person

  const blockName = (text: string) => {
    setNameError(text)
    nameRef.current?.focus()
  }

  async function save() {
    if (busy) return
    const fields: PersonFields = { name: cleanText(name), mobile: cleanText(mobile), role: cleanText(role) }
    if (fields.name === '') return blockName(NAME_EMPTY)
    if (others.some((other) => cleanText(other) === fields.name)) return blockName(PERSON_DUPLICATE)
    const result = await send(() => onSave(fields))
    if (result?.ok) onDone(SAVED)
    else if (result && result.reason === 'duplicate') blockName(PERSON_DUPLICATE)
  }

  async function remove() {
    if (busy || !onDelete) return
    const result = await send(onDelete)
    if (result?.ok) onDone('담당자를 지웠어요.')
  }

  return (
    <InlineFrame
      title={person ? '담당자 고치기' : '담당자 더하기'}
      failed={failed}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={onCancel}
      onDelete={person && onDelete ? () => void remove() : undefined}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id={`${id}-name`}
          label={labels.name}
          required
          value={name}
          onChange={(next) => {
            setName(next)
            setNameError(null)
          }}
          placeholder="예: 김예시"
          maxLength={limits.name}
          error={nameError}
          inputRef={nameRef}
        />
        <TextField id={`${id}-mobile`} label={labels.mobile} value={mobile} onChange={setMobile} placeholder="010-0000-0000" maxLength={limits.mobile} inputMode="tel" />
        <TextField id={`${id}-role`} label={labels.role} value={role} onChange={setRole} placeholder="예: 영업·주문" maxLength={limits.role} />
      </div>
    </InlineFrame>
  )
}

// ── 장비 ─────────────────────────────────────────────

type EquipmentFormProps = {
  equipment: Equipment | null
  onSave(fields: EquipmentFields): Promise<SaveResult>
  /** 고칠 때 [지우기]: 확인 창을 연다(지우기는 창이 한다) */
  onAskDelete?: () => void
  onCancel(): void
  onDone(notice: string): void
}

export function EquipmentForm({ equipment, onSave, onAskDelete, onCancel, onDone }: EquipmentFormProps) {
  const id = useId()
  const nameRef = useFirstFocus()
  const [name, setName] = useState(equipment?.name ?? '')
  const [serial, setSerial] = useState(equipment?.serial ?? '')
  const [boughtOn, setBoughtOn] = useState(equipment?.boughtOn ?? '')
  const [warrantyUntil, setWarrantyUntil] = useState(equipment?.warrantyUntil ?? '')
  const [nameError, setNameError] = useState<string | null>(null)
  const { busy, failed, send } = useSending()
  const labels = FIELD_LABELS.equipment
  const limits = CONTACT_LIMITS.equipment

  async function save() {
    if (busy) return
    const fields: EquipmentFields = {
      name: cleanText(name),
      serial: cleanText(serial),
      boughtOn: boughtOn === '' ? null : boughtOn,
      warrantyUntil: warrantyUntil === '' ? null : warrantyUntil,
    }
    if (fields.name === '') {
      setNameError(EQUIPMENT_EMPTY)
      nameRef.current?.focus()
      return
    }
    const result = await send(() => onSave(fields))
    if (result?.ok) onDone(SAVED)
  }

  return (
    <InlineFrame
      title={equipment ? '장비 고치기' : '장비 더하기'}
      failed={failed}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={onCancel}
      onDelete={equipment && onAskDelete ? onAskDelete : undefined}
    >
      <div className="grid grid-cols-2 gap-3">
        <TextField
          id={`${id}-name`}
          label={labels.name}
          required
          value={name}
          onChange={(next) => {
            setName(next)
            setNameError(null)
          }}
          placeholder="예: 충격파 기계"
          maxLength={limits.name}
          error={nameError}
          inputRef={nameRef}
        />
        <TextField id={`${id}-serial`} label={labels.serial} value={serial} onChange={setSerial} placeholder="기계 뒷면 이름표" maxLength={limits.serial} />
        <TextField id={`${id}-bought`} label={labels.boughtOn} type="date" value={boughtOn} onChange={setBoughtOn} />
        <TextField
          id={`${id}-warranty`}
          label={labels.warrantyUntil}
          type="date"
          value={warrantyUntil}
          onChange={setWarrantyUntil}
          help="끝나기 30일 전부터 주소록과 대시보드에 알려 줘요."
        />
      </div>
    </InlineFrame>
  )
}

// ── 수리 기록 ─────────────────────────────────────────────

type RepairFormProps = {
  repair: Repair | null
  /** 한국 날짜 오늘(날짜 기본값, 비우면 오늘) */
  today: string
  onSave(fields: RepairFields): Promise<SaveResult>
  onDelete?: () => Promise<SaveResult>
  onCancel(): void
  onDone(notice: string): void
}

export function RepairForm({ repair, today, onSave, onDelete, onCancel, onDone }: RepairFormProps) {
  const id = useId()
  const firstRef = useFirstFocus()
  const contentRef = useRef<HTMLInputElement>(null)
  const [day, setDay] = useState(repair?.day ?? today)
  const [content, setContent] = useState(repair?.content ?? '')
  const [cost, setCost] = useState(repair && repair.cost !== null ? wonText(repair.cost) : '')
  const [contentError, setContentError] = useState<string | null>(null)
  const { busy, failed, send } = useSending()
  const labels = FIELD_LABELS.repair

  async function save() {
    if (busy) return
    const won = parseWon(cost)
    const fields: RepairFields = { day: day === '' ? today : day, content: cleanText(content), cost: won === 'bad' ? null : won }
    if (fields.content === '') {
      setContentError(CONTENT_EMPTY)
      contentRef.current?.focus()
      return
    }
    const result = await send(() => onSave(fields))
    if (result?.ok) onDone(SAVED)
  }

  async function remove() {
    if (busy || !onDelete) return
    const result = await send(onDelete)
    if (result?.ok) onDone('수리 기록을 지웠어요.')
  }

  return (
    <InlineFrame
      title={repair ? '수리 기록 고치기' : '수리 기록 더하기'}
      failed={failed}
      busy={busy}
      onSubmit={() => void save()}
      onCancel={onCancel}
      onDelete={repair && onDelete ? () => void remove() : undefined}
    >
      <div className="grid grid-cols-[160px_minmax(0,1fr)] gap-3">
        <TextField id={`${id}-day`} label={labels.day} required type="date" value={day} onChange={setDay} inputRef={firstRef} />
        <TextField
          id={`${id}-content`}
          label={labels.content}
          required
          value={content}
          onChange={(next) => {
            setContent(next)
            setContentError(null)
          }}
          placeholder="예: 헤드 교체"
          maxLength={CONTACT_LIMITS.repair.content}
          error={contentError}
          inputRef={contentRef}
        />
        <TextField id={`${id}-cost`} label={labels.cost} value={cost} onChange={(next) => setCost(costText(next))} placeholder="비워도 돼요" inputMode="numeric" suffix="원" />
      </div>
    </InlineFrame>
  )
}
