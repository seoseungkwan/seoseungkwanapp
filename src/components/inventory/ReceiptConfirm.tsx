'use client'

import { useEffect, useId, useMemo, useRef, useState } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { formatWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { compareYmd, isYmd, weekdayOf } from '@/lib/analytics/dates'
import { matchLines, normalizeName } from '@/lib/inventory/names'
import { sortItems } from '@/lib/inventory/order'
import { addItem, deleteReceipt, saveAliases, saveReceipt, updateReceipt } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import {
  AMOUNT_MAX,
  ITEM_NAME_MAX,
  QTY_MAX,
  RECEIPT_LINES_MAX,
  UNIT_MAX,
  UNIT_PRICE_MAX,
  VENDOR_MAX,
  type InvAlias,
  type InvCategory,
  type InvItem,
  type InvReceipt,
  type InvReceiptLine,
  type InvReceiptLineInput,
} from '@/types/inventory'
import type { InvoiceRead } from './invoiceClient'
import { PhotoDialog } from './PhotoDialog'

// "들어온 것 확인" 화면 (specs/inventory REQ-7508 AC-7508.1~7508.5, design.md 6절 TASK-10, 시안 ?s=in-check·in-manual).
// 세 모양: 사진(photo, 경로가 읽은 줄) · 사진 없이(manual, 빈 줄 하나) · 고치기(edit, 저장한 기록). 왼쪽 사진(300px) + 오른쪽 날짜·거래처·줄 표,
// 1200px 아래(작은 PC 화면)는 사진이 표 위로 가고, 덩어리는 최소 960px(사진 없으면 720px)이라 더 좁으면 제 상자 안에서 옆으로 밀린다.
// 물품은 matchLines(이름 같음 → 기억한 이름 → AI → 새 물품)로 미리 고른다. 금액은 답 금액이고 수량·단가를 고치면 수량 × 단가다.
// [저장]: 칸 검사를 넘을 때만 '새 물품'을 먼저 만들고(같은 이름은 하나) → 입고 저장(사진은 저장 모듈이 먼저 올림, '넣지 않음' 줄 뺌)
// → 읽은 이름이 고른 물품 이름과 다른 줄은 별칭으로 기억한다(기억 실패는 입고를 되돌리지 않는다). 실패하면 화면 값은 그대로이고 오류 카드다 —
// 이미 만든 새 물품은 기억해 두어 다시 저장할 때 또 만들지 않는다. 고치기는 update_inventory_receipt, 줄을 다 지우면 확인 창 뒤 delete

export type ConfirmMode = 'photo' | 'manual' | 'edit'

const NEW = 'new'
const SKIP = 'skip'
const NONE = ''
const DEFAULT_UNIT = '개'
const DELETE_CONFIRM = '줄을 모두 지웠어요. 이 들어온 기록을 지울까요?'
const PRIVACY_NOTE = '사진은 Claude가 읽어요. 환자 이름이 보이는 사진은 올리지 마세요.'
const WEEKDAYS = ['', '월', '화', '수', '목', '금', '토', '일'] // weekdayOf: 1=월 … 7=일

/** 확인 화면 한 줄. pick = 물품 id · 'new'(새 물품) · 'skip'(넣지 않음) · ''(아직 안 고름). 수량·단가는 칸 글자 그대로 */
export type DraftLine = {
  key: number
  src: string // 명세서에 적힌 이름 · 적은 이름 · (고치기) 물품 이름
  read: boolean // 사진에서 읽은 줄 — 별칭 후보
  typed: boolean // 이름을 적는 줄(사진 없이·더한 줄)
  pick: string
  tag: 'alias' | 'unsure' | null // 미리 고른 까닭 칩(고르기를 바꾸면 빠진다)
  qty: string
  price: string
  amount: number | null // 답·저장한 금액. 수량·단가를 고치면 null → 수량 × 단가
  newCategoryId: string
  newUnit: string
}
export type ReceiptDraft = { day: string; vendor: string; lines: DraftLine[] }

// ── 날짜 글자 ───────────────────────────────────────────────

/** '11월 21일' */
export const monthDayText = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
/** '11월 21일(토)' */
export const dayText = (ymd: string) => `${monthDayText(ymd)}(${WEEKDAYS[weekdayOf(ymd)]})`

// ── 처음 값 만들기 ──────────────────────────────────────────

const byOrder = (categories: readonly InvCategory[]) => [...categories].sort((a, b) => a.sortOrder - b.sortOrder)
const firstCategoryId = (categories: readonly InvCategory[]) => byOrder(categories)[0]?.id ?? ''
const priceText = (price: number | null) => (price === null ? '' : formatCount(price))

function blankLine(key: number, categories: readonly InvCategory[]): DraftLine {
  return { key, src: '', read: false, typed: true, pick: NONE, tag: null, qty: '', price: '', amount: null, newCategoryId: firstCategoryId(categories), newUnit: DEFAULT_UNIT }
}

/** 경로가 읽은 명세서 → 확인 화면 값. 날짜가 없거나 오늘보다 뒤면 오늘 */
export function draftFromInvoice(
  invoice: InvoiceRead,
  items: readonly InvItem[],
  aliases: readonly InvAlias[],
  categories: readonly InvCategory[],
  today: string,
): ReceiptDraft {
  const matched = matchLines(
    invoice.lines.map((line) => ({ name: line.name, itemId: line.itemId, unsure: line.unsure })),
    items,
    aliases,
  )
  const lines = invoice.lines.map((line, index): DraftLine => {
    const match = matched[index]
    return {
      ...blankLine(index, categories),
      src: line.name,
      read: true,
      typed: false,
      pick: match.itemId ?? NEW,
      tag: match.how === 'alias' ? 'alias' : match.how === 'ai' && match.unsure ? 'unsure' : null,
      qty: String(line.qty),
      price: priceText(line.unitPrice),
      amount: line.amount,
    }
  })
  const day = invoice.date !== null && compareYmd(invoice.date, today) <= 0 ? invoice.date : today
  return { day, vendor: invoice.vendor ?? '', lines }
}

/** 사진 없이 적기: 오늘 · 빈 줄 하나 */
export function manualDraft(today: string, categories: readonly InvCategory[]): ReceiptDraft {
  return { day: today, vendor: '', lines: [blankLine(0, categories)] }
}

/** 입고 줄은 차례 칸이 없다 → 물품 목록 차례(sortItems: 분류 → sort_order → 이름)로 둔다. 목록에 없는 물품 줄은 맨 뒤 */
export function orderReceiptLines<L extends Pick<InvReceiptLine, 'itemId'>>(
  lines: readonly L[],
  items: readonly InvItem[],
  categories: readonly InvCategory[],
): L[] {
  const rank = new Map(sortItems(items, categories).map((item, index) => [item.id, index]))
  const rankOf = (line: L) => rank.get(line.itemId) ?? rank.size
  return lines
    .map((line, index) => ({ line, index }))
    .sort((a, b) => rankOf(a.line) - rankOf(b.line) || a.index - b.index)
    .map(({ line }) => line)
}

/** 저장한 기록 → 고치기 화면 값(줄은 목록 차례) */
export function draftFromReceipt(receipt: InvReceipt, items: readonly InvItem[], categories: readonly InvCategory[]): ReceiptDraft {
  const byId = new Map(items.map((item) => [item.id, item]))
  const lines = orderReceiptLines(receipt.lines, items, categories).map(
    (line, index): DraftLine => ({
      ...blankLine(index, categories),
      src: byId.get(line.itemId)?.name ?? '',
      typed: false,
      pick: line.itemId,
      qty: String(line.qty),
      price: priceText(line.unitPrice),
      amount: line.amount,
    }),
  )
  return { day: receipt.day, vendor: receipt.vendor ?? '', lines }
}

// ── 칸 읽기·검사 ────────────────────────────────────────────

/** 쉼표·빈칸을 뗀 0 이상 정수, 아니면 null */
function wholeOf(text: string): number | null {
  const digits = text.replace(/[,\s]/g, '')
  if (!/^\d+$/.test(digits)) return null
  const value = Number(digits)
  return Number.isSafeInteger(value) ? value : null
}
const qtyOf = (line: DraftLine) => {
  const qty = wholeOf(line.qty)
  return qty !== null && qty >= 1 && qty <= QTY_MAX ? qty : null
}
/** 단가: 빈칸 = null(괜찮음), 틀림 = undefined */
const priceOf = (line: DraftLine): number | null | undefined => {
  if (line.price.trim() === '') return null
  const price = wholeOf(line.price)
  return price !== null && price <= UNIT_PRICE_MAX ? price : undefined
}
function amountOf(line: DraftLine): number | null {
  if (line.amount !== null) return line.amount
  const qty = qtyOf(line)
  const price = priceOf(line)
  return qty !== null && typeof price === 'number' ? qty * price : null
}
const clip = (text: string, max: number) => [...text.trim()].slice(0, max).join('').trim()
/** 새 물품 이름: 명세서·적은 이름(40자로 자름) */
const newNameOf = (line: DraftLine) => clip(line.src, ITEM_NAME_MAX)
const isItem = (pick: string) => pick !== NEW && pick !== SKIP && pick !== NONE

type LineIssue = Partial<Record<'name' | 'pick' | 'category' | 'unit' | 'qty' | 'price' | 'amount', string>>
type Issues = { day?: string; vendor?: string; lines: Map<number, LineIssue>; count: number }

function issuesOf(draft: ReceiptDraft, today: string, items: ReadonlyMap<string, InvItem>, categories: readonly InvCategory[]): Issues {
  const issues: Issues = { lines: new Map(), count: 0 }
  if (!isYmd(draft.day)) issues.day = '날짜를 골라 주세요'
  else if (compareYmd(draft.day, today) > 0) issues.day = '오늘보다 뒤 날짜는 적을 수 없어요'
  if ([...draft.vendor.trim()].length > VENDOR_MAX) issues.vendor = `거래처는 ${VENDOR_MAX}자까지 적어요`
  issues.count = (issues.day ? 1 : 0) + (issues.vendor ? 1 : 0)
  for (const line of draft.lines) {
    if (line.pick === SKIP) continue
    const issue: LineIssue = {}
    if (line.pick === NONE || (isItem(line.pick) && !items.has(line.pick))) issue.pick = '목록 물품을 골라 주세요'
    if (line.pick === NEW) {
      if (newNameOf(line) === '') issue.name = '물품 이름을 적어 주세요'
      if (!categories.some((category) => category.id === line.newCategoryId)) issue.category = '분류를 골라 주세요'
      const unit = [...line.newUnit.trim()].length
      if (unit < 1 || unit > UNIT_MAX) issue.unit = `단위를 1~${UNIT_MAX}자로 적어 주세요`
    }
    if (qtyOf(line) === null) issue.qty = `수량은 1~${formatCount(QTY_MAX)} 사이 숫자로 적어 주세요`
    if (priceOf(line) === undefined) issue.price = '단가는 0 이상 숫자로 적어 주세요'
    const amount = amountOf(line)
    if (amount !== null && amount > AMOUNT_MAX) issue.amount = '금액이 너무 커요'
    const found = Object.keys(issue).length
    if (found > 0) {
      issues.lines.set(line.key, issue)
      issues.count += found
    }
  }
  return issues
}

// ── 모양 ───────────────────────────────────────────────────

// 표 안 칸(시안 .inp.sm): 36px·좌우 8px. 줄이 많아 ds.input(44px)보다 낮다
const CELL_INPUT =
  'h-9 w-full min-w-0 rounded-control border border-line-strong bg-surface px-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'
const CELL_NUMBER = `${CELL_INPUT} min-w-16 text-right tabular-nums`
const CELL_SELECT = `${CELL_INPUT} block cursor-pointer`
const TH_BASE = 'h-10 whitespace-nowrap border-b border-line px-3 font-medium text-muted first:pl-5 last:pr-5'
const TH = `${TH_BASE} text-left`
const TH_NUM = `${TH_BASE} text-right`
const TD = 'whitespace-nowrap border-b border-line px-3 py-1.5 align-top text-ink first:pl-5 last:pr-5'
const SMALL_LINK = ds.textButton.replace('text-body', 'text-small')
const FIELD_ERROR = `${ds.fieldError} mt-1 whitespace-normal`
const HELP = `${ds.help} mt-1 whitespace-normal`

const TITLE: Record<ConfirmMode, string> = { photo: '들어온 것 확인', manual: '사진 없이 적기', edit: '들어온 기록 고치기' }
const DESC: Record<ConfirmMode, string> = {
  photo: 'AI가 사진에서 읽은 내용이에요. 맞는지 보고 고친 뒤 저장해요. 저장하면 지금 수량에 더해져요.',
  manual: '명세서가 없을 때 직접 적어요. 저장하면 지금 수량에 더해져요.',
  edit: '날짜·거래처·줄을 고쳐요. 줄을 모두 지우고 저장하면 이 기록을 지워요.',
}

function Chips({ line }: { line: DraftLine }) {
  if (line.tag === null && line.pick !== NEW) return null
  return (
    <div className="mt-1 flex flex-wrap gap-1">
      {line.tag === 'alias' && <span className={ds.chip.neutral}>기억한 이름</span>}
      {line.tag === 'unsure' && <span className={ds.chip.warning}>확인해 주세요</span>}
      {line.pick === NEW && <span className={ds.chip.accent}>새 물품</span>}
    </div>
  )
}

type Group = { category: InvCategory; items: InvItem[] }

function PickSelect({ n, line, groups, hidden, invalid, onPick }: { n: number; line: DraftLine; groups: Group[]; hidden: InvItem | undefined; invalid: boolean; onPick: (pick: string) => void }) {
  return (
    <select aria-label={`${n}번째 줄 목록 물품`} aria-invalid={invalid || undefined} className={CELL_SELECT} value={line.pick} onChange={(event) => onPick(event.target.value)}>
      {line.pick === NONE && <option value={NONE}>고르기</option>}
      <option value={NEW}>+ 새 물품으로 넣기</option>
      <option value={SKIP}>넣지 않음</option>
      {groups.map(({ category, items }) => {
        const shown = hidden !== undefined && hidden.categoryId === category.id ? [...items, hidden] : items
        if (shown.length === 0) return null
        return (
          <optgroup key={category.id} label={category.name}>
            {shown.map((item) => (
              <option key={item.id} value={item.id}>
                {item.hidden ? `${item.name} (안 씀)` : item.name}
              </option>
            ))}
          </optgroup>
        )
      })}
    </select>
  )
}

// ── 화면 ───────────────────────────────────────────────────

export type ReceiptConfirmProps = {
  mode: ConfirmMode
  today: string
  categories: InvCategory[]
  items: InvItem[]
  initial: ReceiptDraft
  /** 왼쪽에 보일 사진(사진: 줄인 JPEG, 고치기: 저장한 사진). 사진 모양에서는 이것을 함께 저장한다 */
  photo?: Blob | null
  photoName?: string | null
  /** 고치기 모양의 기록 id */
  receiptId?: string
  /** [사진 다시 올리기]·[사진 올리기] — 사진 고르기를 연다 */
  onPhoto?: () => void
  onCancel: () => void
  onSaved: () => void
}

export function ReceiptConfirm({ mode, today, categories, items, initial, photo = null, photoName = null, receiptId, onPhoto, onCancel, onSaved }: ReceiptConfirmProps) {
  const ids = useId()
  const [draft, setDraft] = useState(initial)
  const [checked, setChecked] = useState(false) // [저장]을 한 번 누른 뒤부터 칸 오류를 보인다
  const [busy, setBusy] = useState(false)
  const [failure, setFailure] = useState<ErrorCode | null>(null)
  const [zoom, setZoom] = useState(false)
  const [photoUrl, setPhotoUrl] = useState<string | null>(null)
  const working = useRef(false)
  const created = useRef(new Map<string, string>()) // 새 물품 이름(normalizeName) → 만든 물품 id
  const nextKey = useRef(Math.max(-1, ...initial.lines.map((line) => line.key)) + 1)

  useEffect(() => {
    if (photo === null) {
      setPhotoUrl(null)
      return
    }
    const url = URL.createObjectURL(photo)
    setPhotoUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [photo])

  const itemById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items])
  const groups = useMemo(() => {
    const shown = sortItems(
      items.filter((item) => !item.hidden),
      categories,
    )
    return byOrder(categories).map((category) => ({ category, items: shown.filter((item) => item.categoryId === category.id) }))
  }, [items, categories])
  const vendors = useMemo(() => [...new Set(items.flatMap((item) => (item.vendor ? [item.vendor] : [])))].sort((a, b) => a.localeCompare(b, 'ko')), [items])

  const issues = issuesOf(draft, today, itemById, categories)
  const shownIssues = checked ? issues : { lines: new Map<number, LineIssue>(), count: 0 }
  const kept = draft.lines.filter((line) => line.pick !== SKIP)
  const total = kept.reduce((sum, line) => sum + (amountOf(line) ?? 0), 0)
  const canSave = mode === 'edit' || kept.length > 0

  const patch = (key: number, change: Partial<DraftLine>) =>
    setDraft((current) => ({ ...current, lines: current.lines.map((line) => (line.key === key ? { ...line, ...change } : line)) }))
  const addLine = () => setDraft((current) => ({ ...current, lines: [...current.lines, blankLine(nextKey.current++, categories)] }))
  const removeLine = (key: number) => setDraft((current) => ({ ...current, lines: current.lines.filter((line) => line.key !== key) }))

  const notes = [PRIVACY_NOTE, '수량은 목록 단위로 적어요. 100개들이 2박스면 200이에요.']
  if (mode !== 'edit') {
    // 입고 저장이 '주문함'을 푼다(고치기는 그대로 둔다)
    const ordered = [...new Set(kept.flatMap((line) => (isItem(line.pick) && itemById.get(line.pick)?.orderedAt ? [itemById.get(line.pick)?.name ?? ''] : [])))]
    if (ordered.length > 0) notes.push(`저장하면 ${ordered.join('·')}의 '주문함' 표시가 풀려요.`)
  }
  if (mode === 'photo') notes.push('고른 짝(명세서 이름 → 목록 물품)은 기억해서 다음 명세서에는 저절로 골라요.')
  notes.push('단가를 적은 줄은 그 물품 단가도 이 값으로 바뀌어요.')

  async function run(work: () => Promise<ErrorCode | null>) {
    working.current = true
    setBusy(true)
    setFailure(null)
    try {
      const code = await work()
      if (code === null) onSaved()
      else setFailure(code)
    } catch {
      setFailure('E-INV-SAVE-FAILED')
    } finally {
      working.current = false
      setBusy(false)
    }
  }

  // 새 물품을 만든다(같은 이름은 하나, 이미 만든 것은 다시 쓴다). 줄 key → 물품 id, 아니면 오류 번호
  async function itemIdsOf(lines: DraftLine[]): Promise<Map<number, string> | ErrorCode> {
    const idOf = new Map<number, string>()
    for (const line of lines) {
      if (line.pick !== NEW) {
        idOf.set(line.key, line.pick)
        continue
      }
      const name = newNameOf(line)
      const key = normalizeName(name)
      let itemId = created.current.get(key)
      if (itemId === undefined) {
        const fields = { categoryId: line.newCategoryId, name, unit: line.newUnit.trim(), minQty: null, expiry: null, vendor: null, unitPrice: null }
        const made = await addItem(fields, null, today)
        if (made === 'duplicate') return 'E-INV-DUPLICATE'
        if (made === 'failed') return 'E-INV-SAVE-FAILED'
        itemId = made.id
        created.current.set(key, itemId)
      }
      idOf.set(line.key, itemId)
    }
    return idOf
  }

  function save() {
    if (working.current) return
    setChecked(true)
    if (issues.count > 0 || !canSave) return
    const vendor = draft.vendor.trim() === '' ? null : draft.vendor.trim()
    if (mode === 'edit' && kept.length === 0) {
      if (receiptId === undefined || !window.confirm(DELETE_CONFIRM)) return
      void run(async () => ((await deleteReceipt(receiptId)) === 'ok' ? null : 'E-INV-SAVE-FAILED'))
      return
    }
    void run(async () => {
      const idOf = await itemIdsOf(kept)
      if (!(idOf instanceof Map)) return idOf
      const lines: InvReceiptLineInput[] = kept.map((line) => ({
        itemId: idOf.get(line.key) ?? '',
        qty: qtyOf(line) ?? 0,
        unitPrice: priceOf(line) ?? null,
        amount: amountOf(line) ?? 0,
      }))
      if (mode === 'edit') {
        if (receiptId === undefined || (await updateReceipt(receiptId, { day: draft.day, vendor, lines })) !== 'ok') return 'E-INV-SAVE-FAILED'
      } else {
        const saved = await saveReceipt({ day: draft.day, vendor, photo: mode === 'photo' ? photo : null, lines })
        if (saved === 'failed') return 'E-INV-SAVE-FAILED'
      }
      // 맞춘 이름 기억: 읽은 이름이 고른 물품 이름과 다른 줄만. 입고는 이미 저장됐으니 실패해도 되돌리지 않는다
      const aliases = kept.flatMap((line) => {
        const itemId = idOf.get(line.key)
        const itemName = line.pick === NEW ? newNameOf(line) : itemById.get(line.pick)?.name
        const alias = normalizeName(line.src)
        return line.read && itemId && itemName !== undefined && alias !== '' && alias !== normalizeName(itemName) ? [{ alias, itemId }] : []
      })
      if (aliases.length > 0) {
        try {
          await saveAliases(aliases)
        } catch {
          // 기억하지 못해도 입고는 저장됐다(다음 명세서에서 다시 고르면 된다)
        }
      }
      return null
    })
  }

  const hasPhoto = photo !== null
  const savedText = (() => {
    if (mode === 'manual') return <>날짜·거래처·줄을 적어요</>
    const head = [isYmd(draft.day) ? monthDayText(draft.day) : '', draft.vendor.trim()].filter((part) => part !== '').join(' · ')
    const lead = head === '' ? null : <b className="font-semibold text-ink">{head}</b>
    if (mode === 'edit' && kept.length === 0) return <>줄이 없어요. 저장하면 이 기록을 지워요.</>
    return (
      <>
        {lead}
        {lead !== null && ' · '}
        {kept.length}줄{mode === 'edit' ? '로 고쳐요' : '을 들어온 기록에 넣어요'}
      </>
    )
  })()
  const dayId = `${ids}-day`
  const vendorId = `${ids}-vendor`
  const vendorList = `${ids}-vendors`

  return (
    <section aria-labelledby={`${ids}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 id={`${ids}-title`} className="text-subtitle font-semibold text-ink">
            {TITLE[mode]}
          </h2>
          <p className="mt-0.5 max-w-208 text-small text-muted">{DESC[mode]}</p>
        </div>
        {mode !== 'edit' && onPhoto && (
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.secondary} onClick={onPhoto}>
              <Icon name="upload" className="text-ink-2" />
              {mode === 'photo' ? '사진 다시 올리기' : '사진 올리기'}
            </button>
          </div>
        )}
      </div>

      <div className="relative min-w-0 overflow-x-auto">
        <div className={`mt-4 grid grid-cols-1 items-start gap-6 ${hasPhoto ? 'min-w-240 min-[1200px]:grid-cols-[300px_minmax(0,1fr)]' : 'min-w-180'}`}>
          {hasPhoto && (
            <figure className="w-75">
              {photoUrl !== null && (
                // eslint-disable-next-line @next/next/no-img-element -- blob: 주소(이미지 최적화 대상이 아니다)
                <img src={photoUrl} alt="올린 명세서 사진" className="block h-auto w-full rounded-control border border-line-strong bg-canvas" />
              )}
              <figcaption className="mt-2 flex items-center justify-between gap-2 text-caption text-muted">
                <span className="min-w-0 truncate">{photoName ?? ''}</span>
                <button type="button" className={SMALL_LINK} onClick={() => setZoom(true)}>
                  크게 보기
                </button>
              </figcaption>
            </figure>
          )}

          <div className="min-w-0">
            <div className="grid grid-cols-[200px_minmax(0,320px)] gap-4">
              <div className={ds.field}>
                <label htmlFor={dayId} className={ds.label}>
                  날짜
                </label>
                <input
                  id={dayId}
                  type="date"
                  max={today}
                  aria-invalid={shownIssues.day ? true : undefined}
                  className={ds.input}
                  value={draft.day}
                  onChange={(event) => setDraft((current) => ({ ...current, day: event.target.value }))}
                />
                {shownIssues.day && <p className={ds.fieldError}>{shownIssues.day}</p>}
              </div>
              <div className={ds.field}>
                <label htmlFor={vendorId} className={ds.label}>
                  거래처
                </label>
                <input
                  id={vendorId}
                  type="text"
                  list={vendorList}
                  maxLength={VENDOR_MAX}
                  autoComplete="off"
                  placeholder="거래처 이름"
                  aria-invalid={shownIssues.vendor ? true : undefined}
                  className={ds.input}
                  value={draft.vendor}
                  onChange={(event) => setDraft((current) => ({ ...current, vendor: event.target.value }))}
                />
                <datalist id={vendorList}>
                  {vendors.map((vendor) => (
                    <option key={vendor} value={vendor} />
                  ))}
                </datalist>
                {shownIssues.vendor && <p className={ds.fieldError}>{shownIssues.vendor}</p>}
              </div>
            </div>

            <div className="relative mt-3 min-w-0 overflow-x-auto">
              <table className="w-full border-collapse text-small">
                <thead>
                  <tr>
                    <th className={TH}>
                      <span className="sr-only">줄</span>
                    </th>
                    <th className={TH}>{mode === 'photo' ? '명세서에 적힌 이름' : '이름'}</th>
                    <th className={TH}>목록 물품</th>
                    <th className={TH}>수량</th>
                    <th className={TH}>단가</th>
                    <th className={TH_NUM}>금액</th>
                    <th className={TH}>
                      <span className="sr-only">지우기</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {draft.lines.length === 0 && (
                    <tr>
                      <td colSpan={7} className="h-12 px-5 text-muted">
                        {mode === 'edit' ? '줄이 없어요. [저장]하면 이 기록을 지워요.' : '줄이 없어요. [+ 줄 더하기]로 적어요.'}
                      </td>
                    </tr>
                  )}
                  {draft.lines.map((line, index) => {
                    const n = index + 1
                    const issue = shownIssues.lines.get(line.key) ?? {}
                    const picked = isItem(line.pick) ? itemById.get(line.pick) : undefined
                    const unit = line.pick === NEW ? line.newUnit.trim() : (picked?.unit ?? '')
                    const amount = line.pick === SKIP ? null : amountOf(line)
                    const price = priceOf(line)
                    const priceChange = picked !== undefined && picked.unitPrice !== null && typeof price === 'number' && price !== picked.unitPrice
                    return (
                      <tr key={line.key}>
                        <td className={`${TD} w-px pt-3.5 text-muted`}>{n}</td>
                        <td className={TD}>
                          {line.typed ? (
                            <>
                              <input
                                type="text"
                                aria-label={`${n}번째 줄 이름`}
                                aria-invalid={issue.name ? true : undefined}
                                placeholder="물품 이름"
                                maxLength={ITEM_NAME_MAX}
                                autoComplete="off"
                                className={`${CELL_INPUT} min-w-40`}
                                value={line.src}
                                onChange={(event) => patch(line.key, { src: event.target.value })}
                              />
                              {issue.name && <p className={FIELD_ERROR}>{issue.name}</p>}
                            </>
                          ) : (
                            <div className="max-w-45 truncate pt-2 text-ink-2" title={line.src}>
                              {line.src}
                            </div>
                          )}
                        </td>
                        <td className={`${TD} min-w-55`}>
                          <PickSelect
                            n={n}
                            line={line}
                            groups={groups}
                            hidden={picked?.hidden ? picked : undefined}
                            invalid={Boolean(issue.pick)}
                            onPick={(pick) => patch(line.key, { pick, tag: null })}
                          />
                          <Chips line={line} />
                          {issue.pick && <p className={FIELD_ERROR}>{issue.pick}</p>}
                          {line.pick === NEW && (
                            <>
                              <div className="mt-1.5 grid grid-cols-[160px_96px] gap-2">
                                <div className="grid content-start gap-1">
                                  <span className="text-caption font-medium text-ink-2">분류</span>
                                  <select
                                    aria-label={`${n}번째 줄 새 물품 분류`}
                                    aria-invalid={issue.category ? true : undefined}
                                    className={CELL_SELECT}
                                    value={line.newCategoryId}
                                    onChange={(event) => patch(line.key, { newCategoryId: event.target.value })}
                                  >
                                    {byOrder(categories).map((category) => (
                                      <option key={category.id} value={category.id}>
                                        {category.name}
                                      </option>
                                    ))}
                                  </select>
                                  {issue.category && <p className={FIELD_ERROR}>{issue.category}</p>}
                                </div>
                                <div className="grid content-start gap-1">
                                  <span className="text-caption font-medium text-ink-2">단위</span>
                                  <input
                                    type="text"
                                    aria-label={`${n}번째 줄 새 물품 단위`}
                                    aria-invalid={issue.unit ? true : undefined}
                                    maxLength={UNIT_MAX}
                                    autoComplete="off"
                                    className={CELL_INPUT}
                                    value={line.newUnit}
                                    onChange={(event) => patch(line.key, { newUnit: event.target.value })}
                                  />
                                </div>
                              </div>
                              {issue.unit && <p className={FIELD_ERROR}>{issue.unit}</p>}
                              <p className={HELP}>
                                {line.typed ? '이름은 왼쪽에 적은 이름으로 넣어요.' : '이름은 명세서 글자로 넣어요.'} 최소 수량은 나중에 [고치기]에서.
                              </p>
                            </>
                          )}
                        </td>
                        <td className={`${TD} w-30`}>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`${n}번째 줄 수량`}
                              aria-invalid={issue.qty ? true : undefined}
                              autoComplete="off"
                              className={CELL_NUMBER}
                              value={line.qty}
                              onChange={(event) => patch(line.key, { qty: event.target.value, amount: null })}
                            />
                            {unit !== '' && <span className="text-small text-muted">{unit}</span>}
                          </div>
                          {issue.qty && <p className={FIELD_ERROR}>{issue.qty}</p>}
                        </td>
                        <td className={`${TD} w-37.5`}>
                          <div className="flex items-center gap-1.5">
                            <input
                              type="text"
                              inputMode="numeric"
                              aria-label={`${n}번째 줄 단가`}
                              aria-invalid={issue.price ? true : undefined}
                              autoComplete="off"
                              placeholder="비워도 돼요"
                              className={CELL_NUMBER}
                              value={line.price}
                              onChange={(event) => patch(line.key, { price: event.target.value, amount: null })}
                            />
                            <span className="text-small text-muted">원</span>
                          </div>
                          {issue.price && <p className={FIELD_ERROR}>{issue.price}</p>}
                          {priceChange && picked.unitPrice !== null && (
                            <p className={HELP}>{`목록 단가 ${formatWon(picked.unitPrice)} → ${formatWon(price)}으로 바뀌어요`}</p>
                          )}
                        </td>
                        <td className={`${TD} pt-3.5 text-right tabular-nums`}>
                          {amount !== null ? formatWon(amount) : <span className="text-muted">–</span>}
                          {issue.amount && <p className={FIELD_ERROR}>{issue.amount}</p>}
                        </td>
                        <td className={`${TD} w-px text-right`}>
                          <button type="button" aria-label={`${n}번째 줄 지우기`} className={ds.button.ghostSmall} onClick={() => removeLine(line.key)}>
                            <Icon name="x" />
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <div className="mt-2 flex flex-wrap items-center justify-between gap-2 pl-5">
              <button type="button" className={SMALL_LINK} disabled={draft.lines.length >= RECEIPT_LINES_MAX} onClick={addLine}>
                + 줄 더하기
              </button>
              <p className="text-small text-ink-2">
                {kept.length}줄 · 합계<b className="ml-1 text-lead font-semibold text-ink">{total > 0 ? formatWon(total) : '–'}</b>
              </p>
            </div>
            <ul className="mt-3 grid gap-1">
              {notes.map((note) => (
                <li key={note} className={`flex gap-1.5 text-caption ${note === PRIVACY_NOTE ? 'text-ink-2' : 'text-muted'}`}>
                  <Icon name={note === PRIVACY_NOTE ? 'alert' : 'info'} size={14} className="mt-px shrink-0" />
                  {note}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>

      {failure !== null && (
        <div className="mt-4">
          <ErrorCard code={failure} />
        </div>
      )}

      <div className="sticky bottom-0 z-10 mt-4 border-t border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <p className="text-small text-ink-2">{savedText}</p>
          <span className="flex flex-wrap items-center gap-2">
            <button type="button" className={ds.button.secondary} onClick={onCancel}>
              취소
            </button>
            <button type="button" className={ds.button.primary} disabled={!canSave} aria-busy={busy || undefined} onClick={save}>
              {busy ? '저장하는 중…' : '저장'}
            </button>
          </span>
        </div>
      </div>

      {zoom && photo !== null && (
        <PhotoDialog title={isYmd(draft.day) ? `${dayText(draft.day)} 사진` : '올린 사진'} source={{ blob: photo }} onClose={() => setZoom(false)} />
      )}
    </section>
  )
}
