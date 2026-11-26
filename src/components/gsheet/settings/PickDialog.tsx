'use client'

import { useId, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ds } from '@/components/ui/classes'
import { CodePicker, RuleLine, type CodeListState, type RxKind } from './CodePicker'
import { HOSPITAL_PICK, RX } from './labels'
import { Dialog, HINT } from './parts'
import type { Hospital } from './replies'
import { sortHospitals } from './rooms'

// 비트 맞춤의 고르기 창 둘(spec google-link AC-8516.3, notes-sunap `settings` '비트 맞춤').
// 우리 병원 고르기: 글은 notes 그대로, 목록 글·단추는 비트시트 HospitalPickForm·HospitalPick.Label 그대로(최근 환자 많은 차례).
// 물리치료 [고르기…]: Block과 같은 목록(CodePicker) + 물리치료 기준 풀이, 단추는 비트시트 CodePickerForm 그대로([취소][확인])

const FOOT = 'flex justify-end gap-2'

export function HospitalPickDialog({
  hospitals,
  current,
  onPick,
  onClose,
}: {
  hospitals: readonly Hospital[]
  /** 지금 고른 병원 코드(''이면 맨 위) */
  current: string
  onPick: (hospital: Hospital) => void
  onClose: () => void
}) {
  const titleId = useId()
  const group = useId()
  const list = sortHospitals(hospitals)
  const [code, setCode] = useState(() => list.find((h) => h.code === current)?.code ?? list[0]?.code ?? '')
  const chosen = list.find((h) => h.code === code)
  return (
    <Dialog labelledBy={titleId} width="w-140" onClose={onClose}>
      <h4 id={titleId} className="text-subtitle font-semibold text-ink">
        {HOSPITAL_PICK.title}
      </h4>
      <div className="grid gap-1">
        <p className="text-small font-semibold text-ink">{HOSPITAL_PICK.text}</p>
        <p className={HINT}>{HOSPITAL_PICK.hint}</p>
      </div>
      <div role="radiogroup" aria-labelledby={titleId} className="grid max-h-45 overflow-auto rounded-control border border-line">
        {list.map((h) => (
          <label key={h.code} className="flex h-9 cursor-pointer items-center gap-2 border-b border-line px-3 text-body text-ink last:border-b-0 hover:bg-canvas">
            <input type="radio" name={group} checked={code === h.code} onChange={() => setCode(h.code)} className={`size-4 shrink-0 accent-accent ${ds.focusRing}`} />
            {HOSPITAL_PICK.label(h.name.trim(), formatCount(h.recent), h.code)}
          </label>
        ))}
      </div>
      <div className={FOOT}>
        <button type="button" className={ds.button.secondary} onClick={onClose}>
          {HOSPITAL_PICK.cancel}
        </button>
        <button type="button" className={ds.button.primary} disabled={chosen === undefined} onClick={() => chosen && onPick(chosen)}>
          {HOSPITAL_PICK.pick}
        </button>
      </div>
    </Dialog>
  )
}

export function CodePickDialog({
  kind,
  state,
  selected,
  onDone,
  onClose,
  onRetry,
}: {
  kind: RxKind
  state: CodeListState
  selected: readonly string[]
  onDone: (codes: string[]) => void
  onClose: () => void
  onRetry: () => void
}) {
  const titleId = useId()
  const [codes, setCodes] = useState<string[]>(() => [...selected])
  return (
    <Dialog labelledBy={titleId} width="w-160" onClose={onClose}>
      <h4 id={titleId} className="text-subtitle font-semibold text-ink">
        {RX.dialogTitle}
      </h4>
      <RuleLine kind={kind} count={codes.length} />
      <CodePicker kind={kind} state={state} selected={codes} onChange={setCodes} onRetry={onRetry} />
      <div className={FOOT}>
        <button type="button" className={ds.button.secondary} onClick={onClose}>
          {RX.cancel}
        </button>
        <button type="button" className={ds.button.primary} onClick={() => onDone(codes)}>
          {RX.done}
        </button>
      </div>
    </Dialog>
  )
}
