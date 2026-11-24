'use client'

import { useEffect, useRef, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { useClinicProfile } from '@/components/clinic/useClinicProfile'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { useReadOnly, WriteOnly } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import { compareYmd, isYmd, weekdayOf } from '@/lib/analytics/dates'
import { countWarning } from '@/lib/inventory/alerts'
import { lastCountDay, listCountLines, listReceiptLines, loadInventory, saveCount } from '@/lib/storage/inventory'
import { QTY_MAX, type InvCountInput, type InvInventory, type InvItem } from '@/types/inventory'
import { CountSheet, countGroups } from './CountSheet'

// 세기 도구 (spec inventory REQ-7507 AC-7507.1~AC-7507.4, design.md 6절, 시안 docs/mockups/inventory ?s=count·print).
// 스스로 물품(loadInventory)·마지막 세기 날짜(lastCountDay)를 읽는다(reloadKey가 바뀌면 다시). 센 날은 기본 오늘, 마지막 세기 날짜~오늘만.
// 머리 글 "지난 세기 M월 D일(요일) · 그 뒤 들어온 기록 n건": n = 마지막 세기 날 줄(listCountLines)의 가장 늦은 저장 시각 뒤에 저장된 입고 건수(listReceiptLines의 저장 시각).
// 0건이거나 못 읽으면 ' · …'를 붙이지 않는다(표는 그대로 그린다).
// 표는 숨기지 않은 물품을 목록 차례로(세기 종이와 같은 countGroups): 이름 · 단위 · 지난 수량 · 그 뒤 들어옴 · 센 수량(비면 "그대로") · 가장 빠른 유통기한.
// 센 수가 지금 수량보다 많으면 그 줄 바로 아래 countWarning 글 + [입고 적기](onManualReceipt, 사진 없이 적기는 TASK-15가 잇는다). 저장은 막지 않는다.
// [저장]은 바꾼 줄만(센 수량을 적은 줄은 qty, 기한을 바꾼 줄은 expiry — 비우면 null) saveCount로 보낸다. 성공하면 칸을 비우고 다시 읽어 새 지금 수량으로 그린다.
// 실패하면 적은 값은 그대로 두고 오류 카드와 [다시 저장]. 센 날이 범위 밖이면 보내지 않고 E-INV-COUNT-DATE.
// [세기 종이 인쇄]는 이 자리를 미리 보기(CountSheet)로 바꾼다 — 적던 값은 이 부품이 들고 있어 [세기로 돌아가기] 뒤에도 그대로다.
// 다른 의원을 보는 중(읽기만, admin-view AC-8010.3)이면 처음 분류 넣기 없이(seed: false) 읽고, 칸은 읽기만·[저장] 줄·[입고 적기]가 없다([세기 종이 인쇄]는 그대로)

type Loaded = { inventory: InvInventory; lastDay: string | null; later: number | null }
type Held = { key: string; value: Loaded | 'failed' }
/** 줄 하나에 적던 값. qty '' = 비움(그대로), expiry undefined = 손대지 않음 */
type Draft = { qty: string; expiry?: string }
type SaveProblem = 'E-INV-SAVE-FAILED' | 'E-INV-COUNT-DATE'

const WEEKDAY = ['', '월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

const monthDay = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일(${WEEKDAY[weekdayOf(ymd)]})`
const slashDay = (ymd: string) => `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`

/**
 * 마지막 세기 날 줄의 가장 늦은 저장 시각 뒤에 저장된 입고 건수(AC-7507.1). 입고 줄은 그 입고의 저장 시각을 함께 가지므로 저장 시각으로 한 건씩 묶는다.
 * 명세서 날짜가 세기 날보다 앞이어도 세기 뒤에 저장했으면 센다 — 그런 입고의 저장 시각(한국 날짜)은 세기 날~오늘이라 그 구간으로 읽는다. 못 읽으면 null
 */
async function receiptsAfter(lastDay: string, today: string): Promise<number | null> {
  try {
    const [counts, receipts] = await Promise.all([listCountLines({ from: lastDay, to: lastDay }), listReceiptLines({ from: lastDay, to: today })])
    if (!Array.isArray(counts) || !Array.isArray(receipts)) return null
    const since = counts.reduce((latest, line) => Math.max(latest, Date.parse(line.savedAt)), -Infinity)
    if (!Number.isFinite(since)) return null
    return new Set(receipts.filter((line) => Date.parse(line.savedAt) > since).map((line) => line.savedAt)).size
  } catch {
    return null
  }
}

/** 마지막 세기 날짜와 그 뒤 들어온 기록 건수(센 적이 없으면 읽지 않음) */
async function lastCount(today: string): Promise<Pick<Loaded, 'lastDay' | 'later'> | 'failed'> {
  const lastDay = await lastCountDay()
  if (lastDay === 'failed') return 'failed'
  return { lastDay, later: lastDay === null ? null : await receiptsAfter(lastDay, today) }
}

async function read(today: string, readOnly: boolean): Promise<Loaded | 'failed'> {
  const [inventory, last] = await Promise.all([readOnly ? loadInventory({ seed: false }) : loadInventory(), lastCount(today)])
  if (inventory === 'failed' || last === 'failed') return 'failed'
  return { inventory, ...last }
}

/** 센 수량 칸 글 → 수(빈칸은 null) */
const enteredOf = (draft: Draft | undefined): number | null => (draft === undefined || draft.qty === '' ? null : Number(draft.qty))

/** 바꾼 줄이면 보낼 한 줄(바꾼 열쇠만), 아니면 null */
function lineOf(item: InvItem, draft: Draft | undefined): InvCountInput | null {
  if (draft === undefined) return null
  const line: InvCountInput = { itemId: item.id }
  const entered = enteredOf(draft)
  if (entered !== null) line.qty = entered
  if (draft.expiry !== undefined) {
    const expiry = draft.expiry === '' ? null : draft.expiry
    if (expiry !== item.expiry) line.expiry = expiry
  }
  return line.qty !== undefined || line.expiry !== undefined ? line : null
}

// 표(ds.table 값). 경고가 붙는 줄은 아래 선을 경고 줄로 옮겨야 해서 칸 모양을 여기서 나눠 둔다(같은 속성 클래스를 겹치지 않게)
const TH = 'h-10 whitespace-nowrap border-b border-line px-3 font-medium text-muted first:pl-5 last:pr-5'
const GROUP = 'border-b border-line px-3 pl-5 text-left align-bottom font-semibold text-ink'
const CELL = 'h-11 whitespace-nowrap px-3 first:pl-5 last:pr-5'
const LINE = 'border-b border-line'
// 표 안 입력은 36px(줄이 많아서, 시안 notes 6). 나머지는 ds.input 값
const SMALL_INPUT =
  'h-9 w-full min-w-0 rounded-control border bg-surface px-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden'

function CountRow({
  item,
  draft,
  readOnly,
  onQty,
  onExpiry,
  onManualReceipt,
}: {
  item: InvItem
  draft: Draft | undefined
  readOnly: boolean
  onQty: (value: string) => void
  onExpiry: (value: string) => void
  onManualReceipt?: () => void
}) {
  const warning = countWarning(enteredOf(draft), item)
  const line = warning === null ? LINE : ''
  const after = item.qty - (item.lastCountQty ?? 0)
  return (
    <>
      <tr data-item={item.id} className="hover:bg-canvas">
        <td className={`${CELL} ${line} font-medium text-ink`}>{item.name}</td>
        <td className={`${CELL} ${line} text-ink-2`}>{item.unit}</td>
        <td className={`${CELL} ${line} text-right tabular-nums text-ink`}>
          {item.lastCountQty === null ? <span className="text-muted">–</span> : formatCount(item.lastCountQty)}
        </td>
        <td className={`${CELL} ${line} text-right tabular-nums text-ink`}>
          {after === 0 ? <span className="text-muted">–</span> : after > 0 ? `+${formatCount(after)}` : formatCount(after)}
        </td>
        <td className={`${CELL} ${line} w-30`}>
          <input
            inputMode="numeric"
            placeholder="그대로"
            aria-label={`${item.name} 센 수량`}
            readOnly={readOnly}
            value={draft?.qty ?? ''}
            onChange={(e) => onQty(e.target.value)}
            className={`${SMALL_INPUT} text-right ${warning === null ? 'border-line-strong' : 'border-warning'}`}
          />
        </td>
        <td className={`${CELL} ${line} w-42`}>
          <input
            type="date"
            aria-label={`${item.name} 가장 빠른 유통기한`}
            readOnly={readOnly}
            value={draft?.expiry ?? item.expiry ?? ''}
            onChange={(e) => onExpiry(e.target.value)}
            className={`${SMALL_INPUT} border-line-strong`}
          />
        </td>
      </tr>
      {warning !== null && (
        <tr>
          <td colSpan={6} className={`${LINE} px-5 pb-2`}>
            <p data-warning-for={item.id} className="flex flex-wrap items-start gap-1.5 text-caption font-medium text-warning">
              <Icon name="alert" className="shrink-0" />
              <span>{warning}</span>
              {onManualReceipt !== undefined && (
                <button type="button" onClick={onManualReceipt} className={`${ds.textButton} text-small`}>
                  입고 적기
                </button>
              )}
            </p>
          </td>
        </tr>
      )}
    </>
  )
}

/** 미리 보기를 열 때만 병원 이름을 읽는다(못 읽었거나 읽는 중이면 이름 없이) */
function SheetView({ inventory, today, onBack }: { inventory: InvInventory; today: string; onBack: () => void }) {
  const clinic = useClinicProfile()
  return <CountSheet items={inventory.items} categories={inventory.categories} clinicName={clinic.name} printedOn={today} onBack={onBack} />
}

export function CountTool({
  today,
  reloadKey,
  onChanged,
  onManualReceipt,
}: {
  today: string
  reloadKey?: number
  onChanged?: () => void
  onManualReceipt?: () => void
}) {
  const [attempt, setAttempt] = useState(0)
  const key = `${reloadKey ?? 0}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)
  const [day, setDay] = useState(today)
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [problem, setProblem] = useState<SaveProblem | null>(null)
  const [failedOnce, setFailedOnce] = useState(false)
  const [saving, setSaving] = useState(false)
  const busy = useRef(false)
  const [printing, setPrinting] = useState(false)
  const readOnly = useReadOnly()

  useEffect(() => {
    let current = true
    read(today, readOnly).then(
      (value) => {
        if (current) setHeld({ key, value })
      },
      () => {
        if (current) setHeld({ key, value: 'failed' })
      },
    )
    return () => {
      current = false
    }
  }, [key, today, readOnly])

  const reading = held === null || held.key !== key
  // 다시 읽는 동안에도 앞서 읽은 표는 그대로 보인다(실패 카드만 읽는 중으로 바뀐다)
  if (held === null || (held.value === 'failed' && reading)) return <p className="text-small text-muted">재고를 읽는 중이에요.</p>
  if (held.value === 'failed') {
    return (
      <div className="flex flex-col items-start gap-3">
        <ErrorCard code="E-INV-READ-FAILED" />
        <button type="button" onClick={() => setAttempt((n) => n + 1)} className={ds.button.secondary}>
          다시 읽기
        </button>
      </div>
    )
  }

  const { inventory, lastDay, later } = held.value
  if (printing) return <SheetView inventory={inventory} today={today} onBack={() => setPrinting(false)} />

  const groups = countGroups(inventory.items, inventory.categories)
  const shown = groups.flatMap((group) => group.items)
  const filled = shown.filter((it) => enteredOf(drafts[it.id]) !== null).length
  const lines = shown.flatMap((it) => lineOf(it, drafts[it.id]) ?? [])
  const dayOk = isYmd(day) && compareYmd(day, today) <= 0 && (lastDay === null || compareYmd(day, lastDay) >= 0)

  const setDraft = (itemId: string, change: Partial<Draft>) =>
    setDrafts((all) => ({ ...all, [itemId]: { qty: all[itemId]?.qty ?? '', expiry: all[itemId]?.expiry, ...change } }))
  // 숫자만 받고 앞 0은 뗀다. 1,000,000을 넘는 글은 받지 않는다(앞 값 그대로)
  const onQty = (itemId: string, value: string) => {
    const digits = value.replace(/[^0-9]/g, '')
    if (digits !== '' && Number(digits) > QTY_MAX) return
    setDraft(itemId, { qty: digits === '' ? '' : String(Number(digits)) })
  }

  async function onSave() {
    if (busy.current || lines.length === 0) return
    if (!dayOk) {
      setProblem('E-INV-COUNT-DATE')
      return
    }
    busy.current = true
    setSaving(true)
    const result = await saveCount(day, lines)
    busy.current = false
    setSaving(false)
    if (result !== 'ok') {
      setProblem('E-INV-SAVE-FAILED')
      setFailedOnce(true)
      return
    }
    setProblem(null)
    setFailedOnce(false)
    setDrafts({})
    setAttempt((n) => n + 1)
    onChanged?.()
  }

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="text-subtitle font-semibold text-ink">수량 세기</h2>
          <p className="mt-0.5 max-w-[52em] text-small text-muted">종이에 적어 온 숫자를 넣어요. 비운 칸은 지난 수량 그대로예요. 가장 빠른 유통기한도 여기서 고쳐요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setPrinting(true)} className={ds.button.secondary}>
            <Icon name="doc" className="text-ink-2" />
            세기 종이 인쇄
          </button>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className={`${ds.field} w-50`}>
          <label htmlFor="count-day" className={ds.label}>
            센 날
          </label>
          <input
            id="count-day"
            type="date"
            value={day}
            min={lastDay ?? undefined}
            max={today}
            readOnly={readOnly}
            onChange={(e) => {
              setDay(e.target.value)
              if (problem === 'E-INV-COUNT-DATE') setProblem(null)
            }}
            className={ds.input}
          />
        </div>
        <p className="pb-3 text-small text-muted">
          {lastDay === null
            ? '아직 센 적이 없어요'
            : `지난 세기 ${monthDay(lastDay)}${later !== null && later > 0 ? ` · 그 뒤 들어온 기록 ${formatCount(later)}건` : ''}`}
        </p>
      </div>

      <div className={`mt-3 ${ds.table.wrap}`}>
        <table className={ds.table.table}>
          <thead>
            <tr>
              <th className={`${TH} text-left`}>물품 이름</th>
              <th className={`${TH} text-left`}>단위</th>
              <th className={`${TH} text-right`}>{lastDay === null ? '지난 수량' : `지난 수량 (${slashDay(lastDay)})`}</th>
              <th className={`${TH} text-right`}>그 뒤 들어옴</th>
              <th className={`${TH} text-left`}>센 수량</th>
              <th className={`${TH} text-left`}>가장 빠른 유통기한</th>
            </tr>
          </thead>
          {groups.map((group, index) => (
            <tbody key={group.id}>
              <tr>
                <th colSpan={6} scope="colgroup" className={`${GROUP} ${index === 0 ? 'h-8' : 'h-11 pt-3'}`}>
                  {group.name}
                  <span className="ml-2 font-normal text-muted">{group.items.length}개</span>
                </th>
              </tr>
              {group.items.map((it) => (
                <CountRow
                  key={it.id}
                  item={it}
                  draft={drafts[it.id]}
                  readOnly={readOnly}
                  onQty={(value) => onQty(it.id, value)}
                  onExpiry={(value) => setDraft(it.id, { expiry: value })}
                  onManualReceipt={readOnly ? undefined : onManualReceipt}
                />
              ))}
            </tbody>
          ))}
          {groups.length === 0 && (
            <tbody>
              <tr>
                <td colSpan={6} className={ds.table.emptyRow}>
                  셀 물품이 없어요. 목록에서 물품을 더해 주세요.
                </td>
              </tr>
            </tbody>
          )}
        </table>
      </div>

      <WriteOnly>
        <div className="sticky bottom-0 z-4 mt-4 border-t border-line bg-surface">
          {problem !== null && (
            <div className="pt-3">
              <ErrorCard code={problem} />
            </div>
          )}
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
            <p data-count-fill="" className="text-small text-ink-2">
              <b className="font-semibold text-ink">
                {shown.length}개 가운데 {filled}개
              </b>{' '}
              적었어요 · 비운 {shown.length - filled}개는 그대로예요
            </p>
            <button type="button" disabled={lines.length === 0} aria-busy={saving || undefined} onClick={() => void onSave()} className={ds.button.primary}>
              {failedOnce ? '다시 저장' : '저장'}
            </button>
          </div>
        </div>
      </WriteOnly>
    </>
  )
}
