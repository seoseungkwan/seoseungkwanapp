'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { EXPIRY_WINDOW_DAYS, expiryText, inventoryAlerts, type AlertRow } from '@/lib/inventory/alerts'
import { sortItems } from '@/lib/inventory/order'
import { loadInventory, setOrdered } from '@/lib/storage/inventory'
import type { InvItem } from '@/types/inventory'

// 목록 도구 맨 위 '챙길 것' (spec inventory REQ-7511 AC-7511.1·AC-7511.2, design.md 6절 TASK-13·8절, 시안 docs/mockups/inventory ?s=list alertBlock · notes.md 4).
// 스스로 물품을 읽어(loadInventory) 목록 차례(sortItems)로 inventoryAlerts에 넘긴다. 처음 분류 넣기는 목록 도구 몫이라 여기서는 seed: false로 읽는다
// (분류가 없으면 물품도 없어 챙길 것도 없다 — 두 곳이 같은 때 처음 분류를 넣으려 다투지 않게).
// [주문함]은 '주문하세요' 줄에만 있다(총괄 결정). 누르면 ordered_at을 적고 그 줄은 칩 '주문함 m/d' + [주문 취소]로 맨 아래, 수에서 빠진다.
// 기한 줄은 정보만(단추 없음), 주문함과 상관없이 그대로 남는다. 저장이 되면 onChanged로 알린다(목록 표의 상태 칩도 다시 읽게)

type Props = { today: string; reloadKey?: number; onChanged?: () => void }
type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; items: InvItem[] }

const TITLE = '챙길 것'
const NONE = '챙길 것이 없어요.'
// 줄 칸: 칩 112 · 이름 280까지 · 글 · 거래처 160 · 단추 120(시안 .al > li). 줄 묶음은 최소 800px이고 좁으면 제 상자 안에서 옆으로 밀린다
const ROW = 'grid min-h-12 grid-cols-[112px_minmax(0,280px)_minmax(0,1fr)_160px_120px] items-center gap-x-4 gap-y-1 border-b border-line py-1.5'

// 'YYYY-MM-DD' → 'm월 d일'
const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
// 주문함 누른 시각(ISO) → 한국 날짜 'm/d'. 읽을 수 없는 값이면 빈 글자
function orderedDay(at: string | null): string {
  if (at === null || Number.isNaN(Date.parse(at))) return ''
  const [, month, day] = todayInKorea(new Date(at)).split('-')
  return `${Number(month)}/${Number(day)}`
}
const left = (item: InvItem) => `남은 ${formatCount(item.qty)}${item.unit}`

function rowText(row: AlertRow<InvItem>): string {
  const { item } = row
  if (row.kind === 'low') return `${left(item)} · 최소 ${formatCount(item.minQty ?? 0)}`
  return `기한 ${monthDay(item.expiry ?? '')} · ${expiryText(row.days ?? 0)} · ${left(item)}`
}

function RowChip({ row }: { row: AlertRow<InvItem> }) {
  if (row.ordered) {
    const day = orderedDay(row.item.orderedAt)
    return (
      <span className={ds.chip.neutral}>
        <Icon name="check" size={12} />
        {day ? `주문함 ${day}` : '주문함'}
      </span>
    )
  }
  if (row.kind === 'low') return <span className={ds.chip.warning}>주문하세요</span>
  return <span className={ds.chip.warning}>{(row.days ?? 0) < 0 ? '기한 지남' : '기한 가까움'}</span>
}

export function AlertBar({ today, reloadKey, onChanged }: Props) {
  const titleId = useId()
  const [state, setState] = useState<Loaded>({ kind: 'loading' })
  const [readTick, setReadTick] = useState(0)
  const [saving, setSaving] = useState<string | null>(null)
  const [saveFailed, setSaveFailed] = useState(false)
  const busy = useRef(false)
  const alive = useRef(false)

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    let live = true
    setState({ kind: 'loading' })
    void loadInventory({ seed: false }).then((result) => {
      if (!live) return
      setState(result === 'failed' ? { kind: 'failed' } : { kind: 'ready', items: sortItems(result.items, result.categories) })
    })
    return () => {
      live = false
    }
  }, [reloadKey, readTick])

  async function toggle(item: InvItem, on: boolean) {
    if (busy.current) return
    busy.current = true
    setSaving(item.id)
    const result = await setOrdered(item.id, on)
    busy.current = false
    if (!alive.current) return
    setSaving(null)
    if (result !== 'ok') {
      setSaveFailed(true)
      return
    }
    setSaveFailed(false)
    const orderedAt = on ? new Date().toISOString() : null
    setState((now) => (now.kind === 'ready' ? { kind: 'ready', items: now.items.map((it) => (it.id === item.id ? { ...it, orderedAt } : it)) } : now))
    onChanged?.()
  }

  const head = (
    <h2 id={titleId} className="text-subtitle font-semibold text-ink">
      {TITLE}
    </h2>
  )

  if (state.kind !== 'ready') {
    return (
      <section aria-labelledby={titleId} aria-busy={state.kind === 'loading' || undefined}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{head}</div>
        {state.kind === 'failed' && (
          <div className="mt-2 flex flex-col items-start gap-2">
            <ErrorCard code="E-INV-READ-FAILED" />
            <button type="button" className={ds.button.secondarySmall} onClick={() => setReadTick((n) => n + 1)}>
              다시 읽기
            </button>
          </div>
        )}
      </section>
    )
  }

  const alerts = inventoryAlerts(state.items, today)
  if (alerts.rows.length === 0) {
    return (
      <section aria-labelledby={titleId}>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">{head}</div>
        <p className="mt-2 border-y border-line py-3 text-small text-muted">{NONE}</p>
      </section>
    )
  }

  const orderedCount = alerts.rows.filter((row) => row.ordered).length
  return (
    <section aria-labelledby={titleId}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {head}
        {alerts.low > 0 && <span className={ds.chip.warning}>{`주문하세요 ${alerts.low}`}</span>}
        {alerts.soon > 0 && <span className={ds.chip.warning}>{`기한 가까움 ${alerts.soon}`}</span>}
        <span className="text-small text-muted">
          {orderedCount > 0 ? `주문함 ${orderedCount}개는 들어오면 저절로 풀려요` : `기한 가까움 = ${EXPIRY_WINDOW_DAYS}일 안`}
        </span>
      </div>
      {saveFailed && (
        <div className="mt-2">
          <ErrorCard code="E-INV-SAVE-FAILED" />
        </div>
      )}
      <div className="relative min-w-0 overflow-x-auto">
        <ul className="mt-2 min-w-200 border-t border-line">
          {alerts.rows.map((row) => {
            const { item } = row
            const done = row.ordered
            return (
              <li key={`${row.kind}-${item.id}`} className={ROW}>
                <span className="flex">
                  <RowChip row={row} />
                </span>
                <span className={`text-body ${done ? 'font-normal text-muted' : 'font-medium text-ink'}`}>{item.name}</span>
                <span className={`text-small ${done ? 'text-muted' : 'text-ink-2'}`}>{rowText(row)}</span>
                <span className="text-small text-muted">{item.vendor ?? ''}</span>
                <span className="justify-self-end">
                  {row.kind === 'low' &&
                    (done ? (
                      <button
                        type="button"
                        className={ds.button.ghostSmall}
                        aria-label={`${item.name} 주문함 표시 취소`}
                        aria-busy={saving === item.id || undefined}
                        onClick={() => void toggle(item, false)}
                      >
                        주문 취소
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={ds.button.secondarySmall}
                        aria-label={`${item.name} 주문함`}
                        aria-busy={saving === item.id || undefined}
                        onClick={() => void toggle(item, true)}
                      >
                        <Icon name="check" size={14} />
                        주문함
                      </button>
                    ))}
                </span>
              </li>
            )
          })}
        </ul>
      </div>
    </section>
  )
}
