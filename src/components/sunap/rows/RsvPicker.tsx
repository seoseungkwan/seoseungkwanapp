'use client'

import { Fragment, useId, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { ds } from '@/components/ui/classes'
import type { LedgerRow, RsvKindDef } from '@/types/sunap'
import { RSV_NONE, VISIT_LABEL, rsvDay, rsvLabel, type LedgerPatch } from '../labels'
import { RSV_BIT, RSV_KEY_TIP, rsvKeyChoices, rsvNow, rsvPatchFor, type RsvChoice } from '../rsvKeys'
import { Pop, PopHead, type Anchor } from './Pop'

// 다음 예약 직접 고르기 판(spec sunap-ilji AC-4905.3, spec sunap-kinds AC-5503.4, 시안 docs/mockups/sunap-kinds ?s=pick).
// 받은 줄을 그리고 고른 값을 onPick으로만 넘긴다(장부 줄 화면이 연다). 선택지 = 비트 따라가기 · 예약 안 하고 가심 · 가는 선 · 설정 목록 차례대로 모든 종류.
// 비트 따라가기 = 직접 고른 값을 지운다({revert: 'rsv'}). 직접 고르기는 '종류 모름'을 받지 않는다(AC-4901.4). 시안의 '이○○ 원장'은 뺐다(원장님 칸 없음).
// 시안과 다른 곳: 판 자리(Pop)는 그대로라 칸 위로 뜨지 않는다. 종류가 많아 판이 화면 아래를 넘으면 선택지 목록만 안에서 밀린다(고르기 단추가 늘 보이게)
// 번호 고르기(spec desk-feedback AC-6301.4): 선택지 줄 앞에 번호(0·1·2~9, 번호 없는 종류는 빈 칸). 판 안 어디서든 번호 키를 치면 그 값으로 고르고 닫는다(같은 값이면 닫기만)

// counts: 예약률에 드는지(null = 비트 값에 따름)
type Option = { value: RsvChoice; label: string; counts: boolean | null }
/** 키 모양(components/claim/rows/MemoDetail.tsx kbdPlain과 같은 토큰). 장부 위 번호표도 쓴다 */
export const KBD =
  'inline-block min-w-4.5 rounded-control border border-b-2 border-line-strong bg-surface px-1 text-center font-sans text-caption font-semibold text-ink-2'
const TIP = '직접 고르면 비트 예약보다 이 값을 써요. 비트에 없는 예약(전화·종이 예약)도 여기서 고르면 돼요. 마감을 풀었다 다시 해도 직접 고른 값은 그대로예요.'
// 화면 아래 여백(Pop의 16px과 같다)과 선택지 목록의 가장 작은 높이
const EDGE = 16
const LIST_MIN = 120

/** 비트 따라가기 아래 작은 글: 지금 비트 예약 */
function bitNow(row: LedgerRow, kinds: readonly RsvKindDef[]): string | null {
  const { kind, source, at } = row.rsv
  const day = rsvDay(at)
  if (source === 'hand') return at === null ? null : `지금: ${day} 예약 있음`
  if (kind === 'none') return '지금: 예약 없음'
  return `지금: ${day ? `${day} ` : ''}예약 있음 · ${rsvLabel(kind, kinds)}`
}

export function RsvPicker({
  row,
  kinds,
  anchor,
  onPick,
  onClose,
}: {
  row: LedgerRow
  kinds: readonly RsvKindDef[]
  anchor: Anchor
  onPick(patch: LedgerPatch): void
  onClose(): void
}) {
  const titleId = useId()
  const name = useId()
  const listRef = useRef<HTMLDivElement>(null)
  const [choice, setChoice] = useState<RsvChoice>(() => rsvNow(row, kinds))
  const small = bitNow(row, kinds)
  const keyed = rsvKeyChoices(kinds)
  const options: Option[] = [
    { value: 'bit', label: RSV_BIT, counts: null },
    { value: 'none', label: RSV_NONE, counts: false },
    ...kinds.map((item) => ({ value: item.id, label: item.label, counts: item.counts })),
  ]

  // 판 아래가 화면을 넘으면 선택지 목록 높이를 그만큼 줄인다(목록 안에서 밀림)
  useLayoutEffect(() => {
    const list = listRef.current
    const box = list?.closest('[role="dialog"]')
    if (!list || !box) return
    const over = box.getBoundingClientRect().bottom - (window.innerHeight - EDGE)
    if (over > 0) list.style.maxHeight = `${Math.max(LIST_MIN, list.clientHeight - over)}px`
  }, [])

  function choose(value: RsvChoice) {
    const patch = rsvPatchFor(row, kinds, value)
    if (patch !== null) onPick(patch)
    onClose()
  }

  // 판 안 어디에 초점이 있든 번호 키 하나로 고르고 닫는다. Ctrl·Alt·Meta와 함께 누른 키·번호 없는 키는 그냥 둔다
  function onKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.ctrlKey || event.altKey || event.metaKey) return
    const hit = keyed.find((item) => item.key === event.key)
    if (hit === undefined) return
    event.preventDefault()
    choose(hit.choice)
  }

  return (
    <Pop anchor={anchor} titleId={titleId} onClose={onClose}>
      {/* 판 안 키를 받는 감싸개(display: contents — 판 칸 사이 간격은 그대로) */}
      <div className="contents" onKeyDown={onKey}>
        <PopHead id={titleId} title={`다음 예약 · ${row.name}`} who={`${row.chart} · ${VISIT_LABEL[row.kind]}`} />
        <div ref={listRef} className="grid gap-1 overflow-y-auto">
          {options.map(({ value, label, counts }) => {
            const key = keyed.find((item) => item.choice === value)?.key
            return (
              <Fragment key={value}>
                <label className="grid cursor-pointer grid-cols-[22px_18px_minmax(0,1fr)_auto] items-center gap-2 rounded-control border border-line px-3 py-2 text-body text-ink has-checked:border-accent has-checked:bg-accent-soft">
                  {/* 번호는 눈으로 보는 표시(읽어 주는 이름에서 빼고 aria-keyshortcuts로 알린다). 번호 없는 종류는 빈 칸 */}
                  {key === undefined ? (
                    <span aria-hidden="true" />
                  ) : (
                    <kbd aria-hidden="true" className={`${KBD} justify-self-start`}>
                      {key}
                    </kbd>
                  )}
                  <input
                    type="radio"
                    name={name}
                    value={value}
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                    autoFocus={choice === value}
                    aria-keyshortcuts={key}
                    className={`size-4 cursor-pointer accent-accent ${ds.focusRing}`}
                  />
                  <span className="min-w-0">
                    {label}
                    {value === 'bit' && small !== null && <small className="block text-caption text-muted">{small}</small>}
                  </span>
                  <span className={counts ? 'text-caption font-semibold text-positive' : 'text-caption font-semibold text-muted'}>
                    {counts === null ? '—' : counts ? '예약률 ○' : '예약률 ✕'}
                  </span>
                </label>
                {/* 늘 있는 두 줄과 설정 종류 사이 가는 선(시안 .optsep) */}
                {value === 'none' && <i aria-hidden="true" className="my-0.5 h-px bg-line" />}
              </Fragment>
            )
          })}
        </div>
        <p className="text-caption text-muted">{TIP}</p>
        <p className="text-caption text-muted">
          종류를 더하거나 예약률 ○·✕를 바꾸려면 <b className="font-semibold text-ink-2">[설정] → 다음 예약 종류</b>에서 해요.
        </p>
        <p className="text-caption text-muted">{RSV_KEY_TIP}</p>
        <div className="flex justify-end gap-2">
          <button type="button" className={ds.button.secondarySmall} onClick={onClose}>
            닫기
          </button>
          <button type="button" className={ds.button.primarySmall} onClick={() => choose(choice)}>
            고르기
          </button>
        </div>
      </div>
    </Pop>
  )
}
