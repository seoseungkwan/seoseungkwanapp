'use client'

import { useId, useState } from 'react'
import { ds } from '@/components/ui/classes'
import type { HandRsvKind, LedgerRow } from '@/types/sunap'
import { RSV_LABEL, VISIT_LABEL, rsvDay, type LedgerPatch } from '../labels'
import { Pop, PopHead, type Anchor } from './Pop'

// 다음 예약 직접 고르기 판(spec sunap-ilji AC-4905.3, 시안 ?s=pick). 받은 줄을 그리고 고른 값을 onPick으로만 넘긴다(장부 줄 화면이 연다).
// 비트 따라가기 = 직접 고른 값을 지운다({revert: 'rsv'}). 직접 고르기는 '종류 모름'을 받지 않는다(AC-4901.4). 시안의 '이○○ 원장'은 뺐다(원장님 칸 없음)

type Choice = 'bit' | HandRsvKind
// counts: 예약률에 드는지(null = 비트 값에 따름)
const CHOICES: { value: Choice; counts: boolean | null }[] = [
  { value: 'bit', counts: null },
  { value: 'none', counts: false },
  { value: 'inj', counts: true },
  { value: 'visit', counts: true },
  { value: 'etc', counts: false },
]
const TIP = '직접 고르면 비트 예약보다 이 값을 써요. 비트에 없는 예약(전화·종이 예약)도 여기서 고르면 돼요. 마감을 풀었다 다시 해도 직접 고른 값은 그대로예요.'

/** 비트 따라가기 아래 작은 글: 지금 비트 예약 */
function bitNow(row: LedgerRow): string | null {
  const { kind, source, at } = row.rsv
  const day = rsvDay(at)
  if (source === 'hand') return at === null ? null : `지금: ${day} 예약 있음`
  if (kind === 'none') return '지금: 예약 없음'
  return `지금: ${day ? `${day} ` : ''}예약 있음 · ${RSV_LABEL[kind]}`
}

export function RsvPicker({ row, anchor, onPick, onClose }: { row: LedgerRow; anchor: Anchor; onPick(patch: LedgerPatch): void; onClose(): void }) {
  const titleId = useId()
  const name = useId()
  const now: Choice = row.rsv.source === 'hand' && row.rsv.kind !== 'unknown' ? row.rsv.kind : 'bit'
  const [choice, setChoice] = useState<Choice>(now)
  const small = bitNow(row)

  function pick() {
    if (choice !== now) onPick(choice === 'bit' ? { revert: 'rsv' } : { rsv: choice })
    onClose()
  }

  return (
    <Pop anchor={anchor} titleId={titleId} onClose={onClose}>
      <PopHead id={titleId} title={`다음 예약 · ${row.name}`} who={`${row.chart} · ${VISIT_LABEL[row.kind]}`} />
      <div className="grid gap-1">
        {CHOICES.map(({ value, counts }) => (
          <label
            key={value}
            className="grid cursor-pointer grid-cols-[18px_minmax(0,1fr)_auto] items-center gap-2 rounded-control border border-line px-3 py-2 text-body text-ink has-checked:border-accent has-checked:bg-accent-soft"
          >
            <input
              type="radio"
              name={name}
              value={value}
              checked={choice === value}
              onChange={() => setChoice(value)}
              autoFocus={choice === value}
              className={`size-4 cursor-pointer accent-accent ${ds.focusRing}`}
            />
            <span>
              {value === 'bit' ? '비트 따라가기' : RSV_LABEL[value]}
              {value === 'bit' && small !== null && <small className="block text-caption text-muted">{small}</small>}
            </span>
            <span className={counts ? 'text-caption font-semibold text-positive' : 'text-caption font-semibold text-muted'}>
              {counts === null ? '—' : counts ? '예약률 ○' : '예약률 ✕'}
            </span>
          </label>
        ))}
      </div>
      <p className="text-caption text-muted">{TIP}</p>
      <div className="flex justify-end gap-2">
        <button type="button" className={ds.button.secondarySmall} onClick={onClose}>
          닫기
        </button>
        <button type="button" className={ds.button.primarySmall} onClick={pick}>
          고르기
        </button>
      </div>
    </Pop>
  )
}
