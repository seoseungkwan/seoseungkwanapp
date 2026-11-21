'use client'

import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { formatWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { todayInKorea, weekdayOf } from '@/lib/analytics/dates'
import { FIELDS, FIELD_LABELS } from '@/lib/inventory/ai'
import { inventoryAlerts } from '@/lib/inventory/alerts'
import { moveBy, moveItem, sortItems } from '@/lib/inventory/order'
import { lastCountDay, loadInventory, saveOrder, updateItem } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import type { InvCategory, InvInventory, InvItem } from '@/types/inventory'
import { CategoryForm } from './CategoryForm'
import { ItemForm } from './ItemForm'

// 재고 목록 도구 (spec inventory REQ-7506·REQ-7514 AC-7514.5, design.md 6절, 시안 ?s=list·order·edit·cats·empty).
// 차례: 챙길 것 자리(받은 alerts) → 머리 줄 단추 → 분류별로 묶은 표 → 숨긴 물품 줄 → (물품이 없으면) 빈 상태.
// 챙길 것·엑셀 양식·엑셀 올리기·비트 코드 고르기는 다른 부품이라 props(alerts·onTemplate·onUpload·onBitPick)로만 받는다(이어 주기는 InventoryScreen).
// [순서 바꾸기] 모드: 줄 앞 끌기 손잡이(포인터 이벤트, 라이브러리 없음)와 ▲▼로 같은 분류 안에서만 옮기고 바로 보인다.
// [다 됐어요] = saveOrder(set_inventory_order, 숨긴 물품은 제자리), 실패면 옛 차례 + 오류 카드. 바꾼 것이 없으면 보내지 않는다.
// 저장(판·다시 쓰기·차례)이 끝나면 스스로 다시 읽고(차례는 저장한 차례를 그대로 쓴다) onChanged로 화면에 알린다

const WEEKDAYS = ['월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일
const XLSX_ACCEPT = '.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
const TEMPLATE_HELP = '[양식 받기] = 지금 목록이 채워진 양식(엑셀)이에요. 고쳐서 [엑셀 올리기]로 넣으면 바뀐 줄만 고쳐져요.'

/** '2026-11-14' → '11월 14일(토)' */
function dayLabel(ymd: string): string {
  return `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일(${WEEKDAYS[weekdayOf(ymd) - 1]})`
}
/** [주문함] 누른 시각 → 한국 날짜 '11/20'(읽을 수 없으면 빈 글자) */
function orderedDay(at: string | null): string {
  const time = at === null ? NaN : new Date(at).getTime()
  if (Number.isNaN(time)) return ''
  const ymd = todayInKorea(new Date(time))
  return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`
}
const byOrder = (categories: readonly InvCategory[]) => [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

/** 끌기 손잡이(점 6개, 시안 grip). Icon에 더하지 않고 이 부품 안에만 둔다 */
function GripIcon({ size = 16, className }: { size?: number; className?: string }) {
  return (
    <svg aria-hidden="true" width={size} height={size} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" className={className}>
      <path d="M6 4h.01M10 4h.01M6 8h.01M10 8h.01M6 12h.01M10 12h.01" />
    </svg>
  )
}

const NONE = <span className="text-muted">–</span>
const NUM_HEAD = `${ds.table.th} text-right`
// 분류 머리 줄(시안 .tb tr.grp): 흰 바탕·아래 선·글은 아래에 붙임. 첫 묶음은 32px, 다음 묶음부터 위 12px 띄워 44px
const GROUP_HEAD = 'border-b border-line px-3 pl-5 text-left align-bottom font-semibold text-ink'
// 물품 줄: 마지막 줄도 아래 선을 둔다(ds.table.row는 마지막 줄 선을 지운다)
const ITEM_ROW = 'hover:bg-canvas'

/** 물품 하나의 챙길 것 상태: 주문하세요(주문함이면 그 날짜), 기한 가까움(남은 날, 음수 = 지남) */
type Status = { low?: { ordered: boolean }; expiryDays?: number }

function StatusChips({ item, status }: { item: InvItem; status: Status | undefined }) {
  if (item.hidden) return <span className={ds.chip.neutral}>안 씀</span>
  const chips: ReactNode[] = []
  if (status?.low) {
    chips.push(
      status.low.ordered ? (
        <span key="low" className={ds.chip.neutral}>
          <Icon name="check" size={12} />
          {`주문함 ${orderedDay(item.orderedAt)}`.trim()}
        </span>
      ) : (
        <span key="low" className={ds.chip.warning}>
          주문하세요
        </span>
      ),
    )
  }
  if (status?.expiryDays !== undefined) {
    chips.push(
      <span key="expiry" className={ds.chip.warning}>
        {status.expiryDays < 0 ? '기한 지남' : '기한 가까움'}
      </span>,
    )
  }
  return chips.length > 0 ? <span className="flex gap-1">{chips}</span> : null
}

type Loaded = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; data: InvInventory; lastDay: string | null }
type Panel = { kind: 'add' } | { kind: 'edit'; itemId: string } | { kind: 'cats' } | null

export type ItemsToolProps = {
  today: string
  /** 바뀌면 다시 읽는다(다른 도구가 저장한 뒤) */
  reloadKey?: number
  /** 이 도구가 저장한 뒤(다른 도구·챙길 것을 다시 읽게) */
  onChanged?: () => void
  /** 맨 위 챙길 것 자리(AlertBar) */
  alerts?: ReactNode
  /** [양식 받기] */
  onTemplate?: () => void
  /** [엑셀 올리기]로 고른 파일 */
  onUpload?: (file: File) => void
  /** [비트 코드에서 고르기] */
  onBitPick?: () => void
}

export function ItemsTool({ today, reloadKey, onChanged, alerts, onTemplate, onUpload, onBitPick }: ItemsToolProps) {
  const [loaded, setLoaded] = useState<Loaded>({ kind: 'loading' })
  const [showHidden, setShowHidden] = useState(false)
  const [panel, setPanel] = useState<Panel>(null)
  const [error, setError] = useState<ErrorCode | null>(null)
  // 판이 닫힐 때 받은 알림 글(물품은 더했는데 처음 수량만 실패, AC-7506.2). 다른 판을 열거나 다른 저장을 하면 지운다
  const [notice, setNotice] = useState<string | null>(null)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  // 순서 바꾸기 모드: 숨기지 않은 물품 id 차례(null = 목록 모양)
  const [orderIds, setOrderIds] = useState<string[] | null>(null)
  const [savingOrder, setSavingOrder] = useState(false)
  const [dragging, setDragging] = useState<string | null>(null)
  const stopDrag = useRef<(() => void) | null>(null)
  const run = useRef(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const helpId = useId()

  const load = useCallback(async () => {
    const mine = ++run.current
    const [data, day] = await Promise.all([loadInventory(), lastCountDay()])
    if (mine !== run.current) return
    if (data === 'failed') setLoaded({ kind: 'failed' })
    else setLoaded({ kind: 'ready', data, lastDay: day === 'failed' ? null : day })
  }, [])

  useEffect(() => {
    void load()
  }, [load, reloadKey])
  useEffect(
    () => () => {
      run.current++
      stopDrag.current?.()
    },
    [],
  )

  const changed = () => {
    void load()
    onChanged?.()
  }
  function openPanel(next: NonNullable<Panel>) {
    setNotice(null)
    setPanel(next)
  }
  function closePanel(saved: boolean, message?: string) {
    setPanel(null)
    setNotice(message ?? null)
    if (saved) changed()
  }
  function pickFile() {
    fileInput.current?.click()
  }

  const fileBox = (
    <input
      ref={fileInput}
      type="file"
      accept={XLSX_ACCEPT}
      className="hidden"
      tabIndex={-1}
      aria-hidden="true"
      onChange={(event) => {
        const file = event.target.files?.[0]
        event.target.value = ''
        if (file) onUpload?.(file)
      }}
    />
  )

  if (loaded.kind === 'loading') return <p className="text-small text-muted">재고를 읽는 중…</p>
  if (loaded.kind === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorCard code="E-INV-READ-FAILED" />
        <button
          type="button"
          className={ds.button.secondary}
          onClick={() => {
            setLoaded({ kind: 'loading' })
            void load()
          }}
        >
          다시 읽기
        </button>
      </div>
    )
  }

  const { data, lastDay } = loaded
  const categories = byOrder(data.categories)
  const sorted = sortItems(data.items, data.categories)
  const visible = sorted.filter((item) => !item.hidden)
  const hiddenCount = sorted.length - visible.length
  const byId = new Map(data.items.map((item) => [item.id, item]))
  const ordering = orderIds !== null
  const shown = ordering ? orderIds.flatMap((id) => byId.get(id) ?? []) : showHidden ? sorted : visible

  const statuses = new Map<string, Status>()
  for (const row of inventoryAlerts(data.items, today).rows) {
    const status = statuses.get(row.item.id) ?? {}
    if (row.kind === 'low') status.low = { ordered: row.ordered }
    else if (row.days !== null) status.expiryDays = row.days
    statuses.set(row.item.id, status)
  }

  const panelView =
    panel?.kind === 'add' ? (
      <ItemForm mode="add" categories={data.categories} items={data.items} today={today} onDone={closePanel} />
    ) : panel?.kind === 'edit' && byId.has(panel.itemId) ? (
      <ItemForm mode="edit" item={byId.get(panel.itemId) as InvItem} categories={data.categories} items={data.items} today={today} onDone={closePanel} />
    ) : panel?.kind === 'cats' ? (
      <CategoryForm categories={data.categories} items={data.items} onDone={closePanel} />
    ) : null

  if (data.items.length === 0) {
    return (
      <>
        <EmptyState
          categories={categories}
          onTemplate={() => onTemplate?.()}
          onUpload={pickFile}
          onAdd={() => openPanel({ kind: 'add' })}
          onBitPick={() => onBitPick?.()}
          onCategories={() => openPanel({ kind: 'cats' })}
        />
        {fileBox}
        {panelView}
      </>
    )
  }

  // ── 순서 바꾸기 ───────────────────────────────────────────
  const categoryOf = new Map(data.items.map((item) => [item.id, item.categoryId]))
  const movable = (ids: readonly string[]) => ids.map((id) => ({ id, categoryId: categoryOf.get(id) }))

  function startOrder() {
    setError(null)
    setNotice(null)
    setOrderIds(visible.map((item) => item.id))
  }
  function step(id: string, by: number) {
    if (savingOrder) return
    setOrderIds((ids) => (ids === null ? ids : moveBy(movable(ids), id, by)))
  }
  function startDrag(event: ReactPointerEvent, item: InvItem) {
    if (event.button !== 0 || savingOrder) return
    event.preventDefault()
    stopDrag.current?.()
    setDragging(item.id)
    const onMove = (move: PointerEvent) => {
      const under = typeof document.elementFromPoint === 'function' ? document.elementFromPoint(move.clientX, move.clientY) : null
      const targetId = under?.closest('tr[data-item]')?.getAttribute('data-item')
      // 같은 분류의 다른 줄 위에서만 그 자리로 옮긴다
      if (!targetId || targetId === item.id || categoryOf.get(targetId) !== item.categoryId) return
      setOrderIds((ids) => {
        const to = ids?.indexOf(targetId) ?? -1
        return ids === null || to < 0 ? ids : moveItem(movable(ids), item.id, to)
      })
    }
    const stop = () => {
      document.removeEventListener('pointermove', onMove)
      document.removeEventListener('pointerup', stop)
      document.removeEventListener('pointercancel', stop)
      stopDrag.current = null
      setDragging(null)
    }
    document.addEventListener('pointermove', onMove)
    document.addEventListener('pointerup', stop)
    document.addEventListener('pointercancel', stop)
    stopDrag.current = stop
  }
  async function finishOrder() {
    if (orderIds === null || savingOrder) return
    stopDrag.current?.()
    const before = visible.map((item) => item.id)
    if (orderIds.every((id, index) => id === before[index])) return setOrderIds(null)
    // 숨긴 물품은 제자리, 숨기지 않은 자리는 새 차례로 채운다(같은 분류 안에서만 옮겼으니 분류 자리는 그대로다)
    const queue = [...orderIds]
    const full = sorted.map((item) => (item.hidden ? item.id : (queue.shift() ?? item.id)))
    setSavingOrder(true)
    const result = await saveOrder(full)
    setSavingOrder(false)
    setOrderIds(null)
    if (result !== 'ok') return setError('E-INV-SAVE-FAILED')
    const rank = new Map(full.map((id, index) => [id, index]))
    setLoaded({ kind: 'ready', lastDay, data: { ...data, items: data.items.map((item) => ({ ...item, sortOrder: rank.get(item.id) ?? item.sortOrder })) } })
    onChanged?.()
  }

  async function unhide(item: InvItem) {
    if (busyItem !== null) return
    setBusyItem(item.id)
    setError(null)
    setNotice(null)
    const result = await updateItem(item.id, { hidden: false })
    setBusyItem(null)
    if (result === 'ok') changed()
    else setError('E-INV-SAVE-FAILED')
  }

  const groups = categories
    .map((category) => ({ category, items: shown.filter((item) => item.categoryId === category.id) }))
    .filter((group) => group.items.length > 0)
  const columns = ordering ? 9 : 8
  const summary = [`${visible.length}개`, lastDay ? `마지막 세기 ${dayLabel(lastDay)}` : null, '지금 수량 = 마지막 세기 + 그 뒤 들어온 것']
    .filter(Boolean)
    .join(' · ')

  return (
    <div className="flex min-w-0 flex-col gap-8">
      {!ordering && alerts}
      <section className="flex min-w-0 flex-col gap-3">
        {ordering ? (
          <div data-head className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-subtitle font-semibold text-ink">순서 바꾸기</h2>
              <p className="text-small text-ink-2">
                줄 앞 <GripIcon size={14} className="inline align-middle text-muted" />를 끌거나 ▲▼로 옮겨요. 분류 안에서만 옮겨져요. 분류 차례는 [분류 고치기]에서 바꿔요.
              </p>
            </div>
            <button type="button" className={ds.button.primary} aria-busy={savingOrder || undefined} onClick={() => void finishOrder()}>
              <Icon name="check" />
              다 됐어요
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            <div data-head className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 className="text-subtitle font-semibold text-ink">물품 목록</h2>
                <p className="text-small text-muted">{summary}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button type="button" className={ds.button.secondary} aria-describedby={helpId} onClick={() => onTemplate?.()}>
                  <Icon name="arrowDown" />
                  양식 받기
                </button>
                <button type="button" className={ds.button.secondary} onClick={pickFile}>
                  <Icon name="upload" />
                  엑셀 올리기
                </button>
                <button type="button" className={ds.button.secondary} onClick={() => openPanel({ kind: 'cats' })}>
                  분류 고치기
                </button>
                <button type="button" className={ds.button.secondary} onClick={startOrder}>
                  순서 바꾸기
                </button>
                <button type="button" className={ds.button.secondary} onClick={() => onBitPick?.()}>
                  비트 코드에서 고르기
                </button>
                <button type="button" className={ds.button.primary} onClick={() => openPanel({ kind: 'add' })}>
                  물품 더하기
                </button>
              </div>
            </div>
            <p id={helpId} className={`${ds.help} text-right`}>
              {TEMPLATE_HELP}
            </p>
          </div>
        )}

        {!ordering && notice && (
          <p role="status" className="flex items-center gap-2 text-small text-ink-2">
            <Icon name="info" className="text-muted" />
            {notice}
          </p>
        )}
        {error && <ErrorCard code={error} />}

        <div className={ds.table.wrap}>
          <table className={`${ds.table.table} min-w-200`}>
            <thead>
              <tr>
                {ordering && (
                  <th scope="col" className={`${ds.table.th} w-10`}>
                    <span className="sr-only">끌기</span>
                  </th>
                )}
                <th scope="col" className={ds.table.th}>
                  물품 이름
                </th>
                <th scope="col" className={NUM_HEAD}>
                  지금 수량
                </th>
                <th scope="col" className={NUM_HEAD}>
                  최소 수량
                </th>
                <th scope="col" className={ds.table.th}>
                  가장 빠른 유통기한
                </th>
                <th scope="col" className={ds.table.th}>
                  거래처
                </th>
                <th scope="col" className={NUM_HEAD}>
                  단가
                </th>
                <th scope="col" className={ds.table.th}>
                  상태
                </th>
                <th scope="col" className={ds.table.th}>
                  <span className="sr-only">{ordering ? '옮기기' : '고치기'}</span>
                </th>
              </tr>
            </thead>
            {groups.map(({ category, items }, groupIndex) => (
              <tbody key={category.id}>
                <tr>
                  <th scope="rowgroup" colSpan={columns} className={`${GROUP_HEAD} ${groupIndex === 0 ? 'h-8' : 'h-11 pt-3'}`}>
                    {category.name}
                    <span className="ml-2 font-normal text-muted">{`${items.length}개`}</span>
                  </th>
                </tr>
                {items.map((item, index) => (
                  <tr
                    key={item.id}
                    data-item={item.id}
                    className={`${ITEM_ROW} ${item.hidden ? 'opacity-60' : ''} ${dragging === item.id ? 'bg-accent-soft' : ''}`}
                  >
                    {ordering && (
                      <td aria-hidden="true" className={`${ds.table.td} w-10`}>
                        <span
                          data-grip
                          className="inline-flex cursor-grab touch-none text-muted select-none active:cursor-grabbing"
                          onPointerDown={(event) => startDrag(event, item)}
                        >
                          <GripIcon />
                        </span>
                      </td>
                    )}
                    <td className={`${ds.table.td} ${item.hidden ? '' : 'font-medium'}`}>{item.name}</td>
                    <td className={ds.table.tdNum}>
                      <span className={item.qty < 0 ? 'text-negative' : undefined}>{formatCount(item.qty)}</span>
                      <span className="ml-0.5 text-caption text-muted">{item.unit}</span>
                    </td>
                    <td className={ds.table.tdNum}>{item.minQty === null ? NONE : formatCount(item.minQty)}</td>
                    <td className={`${ds.table.tdSub} tabular-nums`}>{item.expiry ?? NONE}</td>
                    <td className={ds.table.tdSub}>{item.vendor ?? NONE}</td>
                    <td className={ds.table.tdNum}>{item.unitPrice === null ? NONE : formatWon(item.unitPrice)}</td>
                    <td className={ds.table.td}>
                      <StatusChips item={item} status={statuses.get(item.id)} />
                    </td>
                    <td className={`${ds.table.td} text-right`}>
                      {ordering ? (
                        <span className="inline-flex gap-1">
                          <button
                            type="button"
                            className={ds.button.secondarySmall}
                            aria-label={`${item.name} 위로`}
                            aria-disabled={index === 0}
                            onClick={() => step(item.id, -1)}
                          >
                            <Icon name="chev" className="rotate-180" />
                          </button>
                          <button
                            type="button"
                            className={ds.button.secondarySmall}
                            aria-label={`${item.name} 아래로`}
                            aria-disabled={index === items.length - 1}
                            onClick={() => step(item.id, 1)}
                          >
                            <Icon name="chev" />
                          </button>
                        </span>
                      ) : item.hidden ? (
                        <button
                          type="button"
                          className={ds.button.ghostSmall}
                          aria-label={`${item.name} 다시 쓰기`}
                          aria-busy={busyItem === item.id || undefined}
                          onClick={() => void unhide(item)}
                        >
                          다시 쓰기
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={ds.button.ghostSmall}
                          aria-label={`${item.name} 고치기`}
                          onClick={() => openPanel({ kind: 'edit', itemId: item.id })}
                        >
                          고치기
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            ))}
          </table>
        </div>

        {!ordering && hiddenCount > 0 && (
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 pl-5 text-small text-muted">
            {showHidden ? `안 쓰는 물품 ${hiddenCount}개도 흐리게 보여요.` : `안 쓰는 물품 ${hiddenCount}개는 숨겨 뒀어요.`}{' '}
            <button type="button" className={ds.textButton} onClick={() => setShowHidden((on) => !on)}>
              {showHidden ? '숨기기' : '보기'}
            </button>
          </p>
        )}
      </section>
      {fileBox}
      {panelView}
    </div>
  )
}

/** 물품이 하나도 없을 때(시안 ?s=empty): 세 단계 → 안내 글 → 하나씩 더하기·비트 코드 → 시작 분류 */
function EmptyState({
  categories,
  onTemplate,
  onUpload,
  onAdd,
  onBitPick,
  onCategories,
}: {
  categories: readonly InvCategory[]
  onTemplate(): void
  onUpload(): void
  onAdd(): void
  onBitPick(): void
  onCategories(): void
}) {
  const fields = FIELDS.map((field) => FIELD_LABELS[field]).join(' · ')
  // 시안 .steps: 960px까지, 위아래 선과 단계 사이 선만(네 변 상자 아님). 첫 단계는 왼쪽 여백 없이
  const step = 'flex flex-col items-start border-l border-line px-6 pt-4 pb-5 first:border-l-0 first:pl-0'
  const number = 'inline-flex size-6 items-center justify-center rounded-control bg-accent-soft text-caption font-semibold text-accent-strong'
  const title = 'mt-2 text-subtitle font-semibold text-ink'
  const desc = 'mt-0.5 text-small text-ink-2'
  return (
    <section className="flex min-w-0 flex-col">
      <div className="flex flex-col gap-2">
        <h2 className="text-subtitle font-semibold text-ink">아직 물품이 없어요</h2>
        <p className="text-body text-ink-2">양식 받기 → 채우기 → 엑셀 올리기, 이 차례로 하면 목록이 한 번에 만들어져요.</p>
      </div>
      <div className="mt-5 min-w-0 overflow-x-auto">
        <ol aria-label="물품 넣는 차례" className="grid min-w-180 max-w-240 list-none grid-cols-3 border-y border-line">
          <li className={step}>
            <span className={number}>1</span>
            <p className={title}>양식 받기</p>
            <p className={desc}>빈 양식(엑셀), 시트 &apos;물품&apos;</p>
            <button type="button" className={`${ds.button.secondary} mt-3`} onClick={onTemplate}>
              <Icon name="arrowDown" />
              양식 받기
            </button>
          </li>
          <li className={step}>
            <span className={number}>2</span>
            <p className={title}>채우기</p>
            <p className={desc}>{`한 줄에 물품 하나: ${fields}`}</p>
          </li>
          <li className={step}>
            <span className={number}>3</span>
            <p className={title}>엑셀 올리기</p>
            <p className={desc}>넣기 전에 미리 보기로 확인해요</p>
            <button type="button" className={`${ds.button.primary} mt-3`} onClick={onUpload}>
              <Icon name="upload" />
              엑셀 올리기
            </button>
          </li>
        </ol>
      </div>
      <p className="mt-3 text-small text-muted">갖고 계신 엑셀도 올릴 수 있어요(AI가 칸을 맞춰요).</p>
      <p className="mt-2 text-small text-ink-2">
        물품을 하나씩 더할 수도 있어요.{' '}
        <button type="button" className={ds.textButton} onClick={onAdd}>
          물품 더하기
        </button>
      </p>
      <p className="mt-1 text-small text-ink-2">
        비트에서 쓰던 약·재료 코드에서 골라 넣을 수도 있어요.{' '}
        <button type="button" className={ds.textButton} onClick={onBitPick}>
          비트 코드에서 고르기
        </button>
      </p>
      <div className="mt-8 flex max-w-140 flex-col items-start gap-1 border-t border-line pt-4">
        <p className="text-small font-semibold text-muted">{categories.length === 4 ? '분류는 넷으로 시작해요' : `분류 ${categories.length}개`}</p>
        <p className="text-body text-ink-2">{categories.map((c) => c.name).join(' · ')}</p>
        <button type="button" className={ds.textButton} onClick={onCategories}>
          분류 고치기
        </button>
      </div>
    </section>
  )
}
