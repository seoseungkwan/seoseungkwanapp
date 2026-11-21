'use client'

import Link from 'next/link'
import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { expiryText, inventoryAlerts, type AlertRow } from '@/lib/inventory/alerts'
import { sortItems } from '@/lib/inventory/order'
import { loadInventory } from '@/lib/storage/inventory'
import type { InvItem } from '@/types/inventory'

// 대시보드 재고 칸 (spec inventory REQ-7511 AC-7511.3, design.md 6절 TASK-13·8절, 시안 docs/mockups/inventory ?s=dash vDash · notes.md '대시보드 칸').
// 스스로 loadInventory({ seed: false })로 읽는다 — 대시보드를 보기만 해도 처음 분류가 생기지 않게. 목록 차례(sortItems)로 inventoryAlerts에 넘긴다.
// 두 모양: children(보고 문장)이 있으면 알림이 있을 때 12칸 그리드 왼쪽 1~7 children · 오른쪽 9~12 재고 칸, 없으면 재고 칸만(대시보드 맨 위 자리, 아래 여백).
// 알림(주문하세요 + 기한 가까움) 0개·물품 없음·읽는 중·읽기 실패면 재고 칸을 그리지 않는다(children만, 감싸지 않고 그대로).
// 칸 안: 위 1px line-strong → h2 "재고" + [재고 탭에서 보기 →] → 숫자 두 칸 → 물품 4줄까지(주문함이 아닌 줄, 챙길 것 차례) + "외 n개". 단추([주문함])는 없다(재고 탭에서만)

type Props = { today: string; children?: ReactNode }
type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; items: InvItem[] }

const MAX_LINES = 4
// 작은 글자 단추(시안 .tbtn.s): ds.textButton의 글자 크기만 small로
const SMALL_TEXT_BUTTON = ds.textButton.replace('text-body ', 'text-small ')

const lineText = (row: AlertRow<InvItem>) => (row.kind === 'low' ? `남은 ${formatCount(row.item.qty)}${row.item.unit}` : expiryText(row.days ?? 0))

function Count({ label, value, first }: { label: string; value: number; first: boolean }) {
  return (
    <div className={first ? 'py-2' : 'border-l border-line py-2 pl-4'}>
      <p className="text-small text-muted">{label}</p>
      <p className="text-heading-m font-semibold text-ink">
        {formatCount(value)}
        <small className="ml-0.5 text-body font-medium tracking-normal text-ink-2">개</small>
      </p>
    </div>
  )
}

function Card({ low, soon, rows }: { low: number; soon: number; rows: AlertRow<InvItem>[] }) {
  const titleId = useId()
  const shown = rows.slice(0, MAX_LINES)
  const more = rows.length - shown.length
  return (
    <section aria-labelledby={titleId} className="border-t border-line-strong pt-4">
      <div className="flex items-baseline justify-between gap-2">
        <h2 id={titleId} className="text-subtitle font-semibold text-ink">
          재고
        </h2>
        <Link href="/inventory" className={SMALL_TEXT_BUTTON}>
          재고 탭에서 보기
          <Icon name="arrow" size={14} />
        </Link>
      </div>
      <div className="mt-3 grid grid-cols-2 border-y border-line">
        <Count label="주문하세요" value={low} first />
        <Count label="기한 가까움" value={soon} first={false} />
      </div>
      <ul className="mt-1">
        {shown.map((row) => (
          <li key={`${row.kind}-${row.item.id}`} className="flex justify-between gap-2 border-b border-line py-1.5 text-small">
            <span className="min-w-0 text-ink">{row.item.name}</span>
            <span className="whitespace-nowrap text-ink-2">{lineText(row)}</span>
          </li>
        ))}
      </ul>
      {more > 0 && <p className="mt-2 text-small text-muted">{`외 ${more}개`}</p>}
    </section>
  )
}

export function InventoryAlertCard({ today, children }: Props) {
  const [state, setState] = useState<Loaded>({ kind: 'loading' })

  useEffect(() => {
    let live = true
    void loadInventory({ seed: false }).then((result) => {
      if (!live) return
      setState(result === 'failed' ? { kind: 'failed' } : { kind: 'ready', items: sortItems(result.items, result.categories) })
    })
    return () => {
      live = false
    }
  }, [])

  const alerts = state.kind === 'ready' ? inventoryAlerts(state.items, today) : null
  if (alerts === null || alerts.low + alerts.soon === 0) return <>{children}</>

  const card = <Card low={alerts.low} soon={alerts.soon} rows={alerts.rows.filter((row) => !row.ordered)} />
  if (children == null) {
    return (
      <div className="mb-12 max-md:mb-8 lg:grid lg:grid-cols-12 lg:gap-x-6">
        <div className="md:max-lg:max-w-128 lg:col-span-4">{card}</div>
      </div>
    )
  }
  return (
    <div className="lg:grid lg:grid-cols-12 lg:items-start lg:gap-x-6">
      <div className="min-w-0 lg:col-span-7">{children}</div>
      {/* 보고 문장 머리 줄이 위 12px에서 시작한다 → 같은 높이에서 시작. 1024px 아래는 보고 문장 아래 24px */}
      <div className="mt-6 lg:col-span-4 lg:col-start-9 lg:mt-3">{card}</div>
    </div>
  )
}
