'use client'

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { isYmd } from '@/lib/analytics/dates'
import { normalizeName } from '@/lib/inventory/names'
import { addItem, deleteAlias, listAliases, updateItem } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import {
  ITEM_NAME_MAX,
  QTY_MAX,
  UNIT_MAX,
  UNIT_PRICE_MAX,
  VENDOR_MAX,
  type InvAlias,
  type InvCategory,
  type InvItem,
  type InvItemChanges,
  type InvItemFields,
} from '@/types/inventory'

// 물품 더하기·고치기 판 (spec inventory REQ-7506 AC-7506.2, REQ-7514 AC-7514.5, design.md 6절, 시안 ?s=edit).
// 오른쪽 판(예약 탭 AddPanel의 Drawer 모양, 460px)이고 [취소]·[저장]이다. 칸 검사에 걸리면 칸 아래 오류 글이고 보내지 않는다.
// 지금 수량은 더하기에서만 적는다(그날 세기로 남는다, 저장 모듈 addItem). 고치기에서는 읽기만 — 수량은 [세기]에서만 바뀐다.
// 고치기 판 아래 "명세서에서 맞춘 이름"의 [지우기]와 비트 코드 [연결 끊기]는 누르면 바로 저장한다(판 [저장]과 따로).
// 그래서 판을 닫을 때 onDone(바뀐 것이 있었나)를 준다. 새 물품을 그 분류 맨 끝에 붙이는 것은 addItem이 한다.
// 더하기에서 물품은 들어가고 처음 수량(오늘 세기)만 실패하면 판을 닫고 onDone(true, 알림 글)로 목록이 그 글을 보이게 한다.
// 이름 겹침은 normalizeName으로 본다. 고치기에서 이름이 그대로(제 옛 이름과 normalizeName이 같음)면 보지 않는다

const NAME_EMPTY = '물품 이름을 적어 주세요'
const NAME_LONG = `물품 이름은 ${ITEM_NAME_MAX}자까지 적어요`
const NAME_TAKEN = '같은 이름 물품이 있어요(안 쓰는 물품 포함)'
const UNIT_EMPTY = '단위를 적어 주세요'
const UNIT_LONG = `단위는 ${UNIT_MAX}자까지 적어요`
const VENDOR_LONG = `거래처는 ${VENDOR_MAX}자까지 적어요`
const BAD_CHAR = '쓸 수 없는 글자(탭·줄바꿈 같은)가 있어요'
const QTY_BAD = `0부터 ${formatCount(QTY_MAX)}까지 정수로 적어요`
const PRICE_BAD = `0부터 ${formatCount(UNIT_PRICE_MAX)}까지 정수로 적어요`
const DAY_BAD = '날짜를 2027-03-31처럼 골라 주세요'
const CATEGORY_EMPTY = '분류를 골라 주세요'
const COUNT_FAILED = '물품은 더했어요. 처음 수량은 [세기]에서 적어 주세요.'

const CONTROL = /\p{Cc}/u
const lengthOf = (text: string) => [...text].length

// ── 오른쪽 판 틀 (분류 고치기 판도 쓴다) ─────────────────────────

/** 오른쪽에서 나오는 판: 머리(제목·닫기) · 몸(스크롤) · 발(단추). Esc·바탕 누름은 닫기다. 열리면 판으로 초점이 온다 */
export function SidePanel({ title, onClose, foot, children }: { title: string; onClose(): void; foot: ReactNode; children: ReactNode }) {
  const titleId = useId()
  const panel = useRef<HTMLElement>(null)
  const close = useRef(onClose)
  useEffect(() => {
    close.current = onClose
  }, [onClose])
  useEffect(() => {
    panel.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') close.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])
  return (
    <>
      <div aria-hidden="true" className="fixed inset-0 z-40 bg-ink/20" onClick={onClose} />
      <aside
        ref={panel}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="fixed top-0 right-0 bottom-0 z-50 flex w-115 max-w-full flex-col border-l border-line-strong bg-surface shadow-float outline-hidden"
      >
        <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-5">
          <h2 id={titleId} className="text-lead font-semibold text-ink">
            {title}
          </h2>
          <button type="button" aria-label="닫기" className={`${ds.button.ghostSmall} text-muted`} onClick={onClose}>
            <Icon name="x" />
          </button>
        </div>
        <div className="grid flex-1 content-start gap-5 overflow-y-auto px-5 pt-4 pb-5">{children}</div>
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-line px-5 py-3">{foot}</div>
      </aside>
    </>
  )
}

// ── 칸 ─────────────────────────────────────────────────────

type Draft = {
  name: string
  categoryId: string
  unit: string
  minQty: string
  qty: string
  expiry: string
  vendor: string
  unitPrice: string
  hidden: boolean
}
type FieldKey = 'name' | 'categoryId' | 'unit' | 'minQty' | 'qty' | 'expiry' | 'vendor' | 'unitPrice'
type Errors = Partial<Record<FieldKey, string>>
/** 검사를 지난 값(빈 선택 칸은 null) */
type Values = Omit<InvItemFields, 'bitCode'> & { qty: number | null; hidden: boolean }

const byOrder = (categories: readonly InvCategory[]) => [...categories].sort((a, b) => a.sortOrder - b.sortOrder)

function draftOf(item: InvItem | undefined, firstCategory: string): Draft {
  if (!item) return { name: '', categoryId: firstCategory, unit: '', minQty: '', qty: '', expiry: '', vendor: '', unitPrice: '', hidden: false }
  return {
    name: item.name,
    categoryId: item.categoryId,
    unit: item.unit,
    minQty: item.minQty === null ? '' : String(item.minQty),
    qty: '',
    expiry: item.expiry ?? '',
    vendor: item.vendor ?? '',
    unitPrice: item.unitPrice === null ? '' : formatCount(item.unitPrice),
    hidden: item.hidden,
  }
}

/** 글 칸: 비었으면 empty(선택 칸은 null = 통과), 제어 문자·길이 넘침은 오류 */
function textProblem(value: string, max: number, empty: string | null, long: string): string | null {
  const text = value.trim()
  if (text === '') return empty
  if (CONTROL.test(text)) return BAD_CHAR
  return lengthOf(text) > max ? long : null
}

/** 수 칸: 빈칸 null, 쉼표·앞뒤 빈칸은 뗀다. 0~max 정수가 아니면 'bad' */
function wholeOf(value: string, max: number): number | null | 'bad' {
  const text = value.trim().replace(/,/g, '')
  if (text === '') return null
  if (!/^\d+$/.test(text)) return 'bad'
  const n = Number(text)
  return n <= max ? n : 'bad'
}

function check(draft: Draft, mode: 'add' | 'edit', taken: (name: string) => boolean): { errors: Errors; values: Values | null } {
  const errors: Errors = {}
  const name = textProblem(draft.name, ITEM_NAME_MAX, NAME_EMPTY, NAME_LONG) ?? (taken(draft.name) ? NAME_TAKEN : null)
  if (name) errors.name = name
  if (draft.categoryId === '') errors.categoryId = CATEGORY_EMPTY
  const unit = textProblem(draft.unit, UNIT_MAX, UNIT_EMPTY, UNIT_LONG)
  if (unit) errors.unit = unit
  const vendor = textProblem(draft.vendor, VENDOR_MAX, null, VENDOR_LONG)
  if (vendor) errors.vendor = vendor
  const minQty = wholeOf(draft.minQty, QTY_MAX)
  if (minQty === 'bad') errors.minQty = QTY_BAD
  const qty = mode === 'add' ? wholeOf(draft.qty, QTY_MAX) : null
  if (qty === 'bad') errors.qty = QTY_BAD
  const unitPrice = wholeOf(draft.unitPrice, UNIT_PRICE_MAX)
  if (unitPrice === 'bad') errors.unitPrice = PRICE_BAD
  if (draft.expiry !== '' && !isYmd(draft.expiry)) errors.expiry = DAY_BAD
  if (Object.keys(errors).length > 0 || minQty === 'bad' || qty === 'bad' || unitPrice === 'bad') return { errors, values: null }
  return {
    errors,
    values: {
      categoryId: draft.categoryId,
      name: draft.name.trim(),
      unit: draft.unit.trim(),
      minQty,
      expiry: draft.expiry === '' ? null : draft.expiry,
      vendor: draft.vendor.trim() === '' ? null : draft.vendor.trim(),
      unitPrice,
      qty,
      hidden: draft.hidden,
    },
  }
}

/** 고치기: 지금 값과 다른 칸만 */
function changesOf(item: InvItem, values: Values): InvItemChanges {
  const changes: InvItemChanges = {}
  if (values.name !== item.name) changes.name = values.name
  if (values.categoryId !== item.categoryId) changes.categoryId = values.categoryId
  if (values.unit !== item.unit) changes.unit = values.unit
  if (values.minQty !== item.minQty) changes.minQty = values.minQty
  if (values.expiry !== item.expiry) changes.expiry = values.expiry
  if (values.vendor !== item.vendor) changes.vendor = values.vendor
  if (values.unitPrice !== item.unitPrice) changes.unitPrice = values.unitPrice
  if (values.hidden !== item.hidden) changes.hidden = values.hidden
  return changes
}

/** 칸 하나: 이름 줄 → 입력 → 도움말 → 오류 글. 입력에는 도움말·오류 글 id를 이어 준다 */
function Field({
  label,
  hint,
  help,
  error,
  children,
}: {
  label: string
  hint?: '필수' | '선택'
  help?: string
  error?: string
  children: (props: { id: string; 'aria-invalid': boolean; 'aria-describedby'?: string }) => ReactNode
}) {
  const id = useId()
  const helpId = `${id}-help`
  const errorId = `${id}-error`
  const described = [help ? helpId : null, error ? errorId : null].filter(Boolean).join(' ')
  return (
    <div className={ds.field}>
      <label htmlFor={id} className={ds.label}>
        {label}
        {/* 이름과 필수·선택 사이 빈칸: 화면 읽기 이름이 "물품 이름 필수"가 된다(flex라 화면에는 gap만 보인다) */}
        {hint && ' '}
        {hint && <span className={ds.labelHint}>{hint}</span>}
      </label>
      {children({ id, 'aria-invalid': Boolean(error), 'aria-describedby': described || undefined })}
      {help && (
        <p id={helpId} className={ds.help}>
          {help}
        </p>
      )}
      {error && (
        <p id={errorId} className={ds.fieldError}>
          {error}
        </p>
      )}
    </div>
  )
}

const NUMBER_INPUT = `${ds.input} text-right tabular-nums`

type AliasState = { kind: 'loading' } | { kind: 'failed' } | { kind: 'ready'; list: InvAlias[] }

export type ItemFormProps = {
  categories: readonly InvCategory[]
  /** 모든 물품(안 쓰는 물품 포함) — 이름 겹침을 본다 */
  items: readonly InvItem[]
  today: string
  /** 판을 닫을 때. changed = 저장한 것이 있음(다시 읽기), notice = 목록에 보일 알림 글(물품은 더했는데 처음 수량만 실패했을 때) */
  onDone(changed: boolean, notice?: string): void
} & ({ mode: 'add'; item?: undefined } | { mode: 'edit'; item: InvItem })

export function ItemForm({ mode, item, categories, items, today, onDone }: ItemFormProps) {
  const ordered = byOrder(categories)
  const [draft, setDraft] = useState<Draft>(() => draftOf(item, ordered[0]?.id ?? ''))
  const [errors, setErrors] = useState<Errors>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<ErrorCode | null>(null)
  const [aliases, setAliases] = useState<AliasState>({ kind: 'loading' })
  const [aliasBusy, setAliasBusy] = useState<string | null>(null)
  const [aliasError, setAliasError] = useState<ErrorCode | null>(null)
  const [unlinked, setUnlinked] = useState(false)
  const [unlinking, setUnlinking] = useState(false)
  const [bitError, setBitError] = useState<ErrorCode | null>(null)
  // 판 밖으로 이미 저장한 것([지우기]·[연결 끊기]·실패 전 저장)
  const changed = useRef(false)
  const aliasRun = useRef(0)
  const hideId = useId()

  const itemId = item?.id ?? null
  const readAliases = useCallback(async () => {
    if (itemId === null) return
    const mine = ++aliasRun.current
    const result = await listAliases()
    if (mine !== aliasRun.current) return
    setAliases(result === 'failed' ? { kind: 'failed' } : { kind: 'ready', list: result.filter((a) => a.itemId === itemId) })
  }, [itemId])
  useEffect(() => {
    if (mode === 'edit') void readAliases()
  }, [mode, readAliases])
  // 닫힌 뒤 늦게 온 답은 버린다
  useEffect(
    () => () => {
      aliasRun.current++
    },
    [],
  )

  const set = <K extends keyof Draft>(key: K, value: Draft[K]) => setDraft((d) => ({ ...d, [key]: value }))
  const taken = (name: string) => {
    const key = normalizeName(name)
    if (item !== undefined && normalizeName(item.name) === key) return false // 고치기에서 이름이 그대로
    return items.some((other) => other.id !== itemId && normalizeName(other.name) === key)
  }
  const close = () => onDone(changed.current)

  async function save() {
    if (saving) return
    const { errors: found, values } = check(draft, mode, taken)
    setErrors(found)
    if (values === null) return
    let result: 'ok' | 'duplicate' | 'failed'
    if (mode === 'add') {
      setSaving(true)
      const { categoryId, name, unit, minQty, expiry, vendor, unitPrice } = values
      const added = await addItem({ categoryId, name, unit, minQty, expiry, vendor, unitPrice }, values.qty, today)
      if (added !== 'duplicate' && added !== 'failed' && added.countFailed) {
        setSaving(false)
        return onDone(true, COUNT_FAILED)
      }
      result = added === 'duplicate' || added === 'failed' ? added : 'ok'
    } else {
      const changes = changesOf(item, values)
      if (Object.keys(changes).length === 0) return onDone(changed.current)
      setSaving(true)
      result = await updateItem(item.id, changes)
    }
    setSaving(false)
    if (result === 'ok') return onDone(true)
    if (result === 'duplicate') {
      setErrors({ name: NAME_TAKEN })
      setSaveError(null)
    } else setSaveError('E-INV-SAVE-FAILED')
  }

  async function removeAlias(alias: string) {
    if (aliasBusy !== null) return
    setAliasBusy(alias)
    setAliasError(null)
    const result = await deleteAlias(alias)
    setAliasBusy(null)
    if (result !== 'ok') return setAliasError('E-INV-SAVE-FAILED')
    changed.current = true
    setAliases((state) => (state.kind === 'ready' ? { kind: 'ready', list: state.list.filter((a) => a.alias !== alias) } : state))
  }

  async function unlink() {
    if (unlinking || itemId === null) return
    setUnlinking(true)
    setBitError(null)
    const result = await updateItem(itemId, { bitCode: null })
    setUnlinking(false)
    if (result !== 'ok') return setBitError('E-INV-SAVE-FAILED')
    changed.current = true
    setUnlinked(true)
  }

  const foot = (
    <>
      <button type="button" className={ds.button.secondary} onClick={close}>
        취소
      </button>
      <button type="button" className={ds.button.primary} aria-busy={saving || undefined} onClick={() => void save()}>
        {saveError ? '다시 저장' : '저장'}
      </button>
    </>
  )

  return (
    <SidePanel title={mode === 'add' ? '물품 더하기' : '물품 고치기'} onClose={close} foot={foot}>
      <Field label="물품 이름" hint="필수" error={errors.name}>
        {(p) => <input {...p} className={ds.input} maxLength={ITEM_NAME_MAX} value={draft.name} onChange={(e) => set('name', e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="분류" error={errors.categoryId}>
          {(p) => (
            <select {...p} className={ds.input} value={draft.categoryId} onChange={(e) => set('categoryId', e.target.value)}>
              {ordered.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          )}
        </Field>
        <Field label="단위" hint="필수" help="하나만 써요. 세기·입고 수량이 모두 이 단위예요." error={errors.unit}>
          {(p) => <input {...p} className={ds.input} maxLength={UNIT_MAX} value={draft.unit} onChange={(e) => set('unit', e.target.value)} />}
        </Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="최소 수량" hint="선택" help="이보다 적으면 '주문하세요'. 비우면 알림이 없어요." error={errors.minQty}>
          {(p) => <input {...p} className={NUMBER_INPUT} inputMode="numeric" value={draft.minQty} onChange={(e) => set('minQty', e.target.value)} />}
        </Field>
        {mode === 'add' ? (
          <Field label="지금 수량" hint="선택" help="적으면 오늘 센 수량으로 남아요. 비우면 0이에요." error={errors.qty}>
            {(p) => <input {...p} className={NUMBER_INPUT} inputMode="numeric" value={draft.qty} onChange={(e) => set('qty', e.target.value)} />}
          </Field>
        ) : (
          <div className={ds.field}>
            <span className={ds.label}>지금 수량</span>
            <div className={`${ds.readonly} tabular-nums`}>{`${formatCount(item.qty)}${item.unit}`}</div>
            <p className={ds.help}>수량은 [세기]에서 고쳐요.</p>
          </div>
        )}
      </div>
      <Field label="가장 빠른 유통기한" hint="선택" help="30일 안으로 다가오면 '기한 가까움'이 떠요." error={errors.expiry}>
        {(p) => <input {...p} type="date" className={ds.input} value={draft.expiry} onChange={(e) => set('expiry', e.target.value)} />}
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="거래처" hint="선택" error={errors.vendor}>
          {(p) => <input {...p} className={ds.input} maxLength={VENDOR_MAX} value={draft.vendor} onChange={(e) => set('vendor', e.target.value)} />}
        </Field>
        <Field label="단가" hint="선택" error={errors.unitPrice}>
          {(p) => (
            <div className="flex items-center gap-2">
              <input {...p} className={NUMBER_INPUT} inputMode="numeric" value={draft.unitPrice} onChange={(e) => set('unitPrice', e.target.value)} />
              <span className="text-small text-muted">원</span>
            </div>
          )}
        </Field>
      </div>

      {mode === 'edit' && item.bitCode !== null && !unlinked && (
        <div className={ds.field} data-field>
          <span className={ds.label}>비트 코드</span>
          <div className={ds.readonly}>
            <span className="min-w-0 flex-1 truncate font-semibold text-ink">{item.bitCode}</span>
            <button type="button" className={ds.button.ghostSmall} aria-busy={unlinking || undefined} onClick={() => void unlink()}>
              연결 끊기
            </button>
          </div>
          <p className={ds.help}>[비트 코드에서 고르기]로 이어진 코드예요. 끊으면 그 목록에서 다시 고를 수 있어요.</p>
          {bitError && <ErrorCard code={bitError} />}
        </div>
      )}

      {mode === 'edit' && (
        <AliasField
          state={aliases}
          busy={aliasBusy}
          error={aliasError}
          onRemove={(alias) => void removeAlias(alias)}
          onRetry={() => {
            setAliases({ kind: 'loading' })
            void readAliases()
          }}
        />
      )}

      {mode === 'edit' && (
        <label htmlFor={hideId} className="flex cursor-pointer items-start gap-3 border-t border-line pt-4">
          <span className={`${ds.checkboxWrap} mt-0.5`}>
            <input id={hideId} type="checkbox" className={ds.checkbox} checked={draft.hidden} onChange={(e) => set('hidden', e.target.checked)} />
            <Icon name="check" className={ds.checkboxMark} />
          </span>
          <span className="flex flex-col gap-0.5">
            <span className="text-small font-semibold text-ink">안 씀</span>
            <span className={ds.help}>목록·세기·알림에서 숨겨요. 지난 기록은 그대로 남아요.</span>
          </span>
        </label>
      )}

      {saveError && <ErrorCard code={saveError} />}
    </SidePanel>
  )
}

/** "명세서에서 맞춘 이름" 목록(그 물품 것만) + [지우기] */
function AliasField({
  state,
  busy,
  error,
  onRemove,
  onRetry,
}: {
  state: AliasState
  busy: string | null
  error: ErrorCode | null
  onRemove(alias: string): void
  onRetry(): void
}) {
  const labelId = useId()
  return (
    <div className={ds.field}>
      <span id={labelId} className={ds.label}>
        명세서에서 맞춘 이름
      </span>
      {state.kind === 'loading' && <p className="text-small text-muted">읽는 중…</p>}
      {state.kind === 'failed' && (
        <div className="flex flex-col items-start gap-2">
          <ErrorCard code="E-INV-READ-FAILED" />
          <button type="button" className={ds.button.secondarySmall} onClick={onRetry}>
            다시 읽기
          </button>
        </div>
      )}
      {state.kind === 'ready' && state.list.length === 0 && <p className="text-small text-muted">아직 없어요.</p>}
      {state.kind === 'ready' && state.list.length > 0 && (
        <ul aria-labelledby={labelId} className="flex flex-col">
          {state.list.map(({ alias }) => (
            <li key={alias} className="flex min-h-10 items-center justify-between gap-2 border-b border-line text-small text-ink last:border-b-0">
              <span className="min-w-0 break-all">{alias}</span>
              <button
                type="button"
                className={ds.button.ghostSmall}
                aria-label={`${alias} 지우기`}
                aria-busy={busy === alias || undefined}
                onClick={() => onRemove(alias)}
              >
                지우기
              </button>
            </li>
          ))}
        </ul>
      )}
      <p className={ds.help}>다음 명세서에 이 이름이 있으면 이 물품으로 골라요.</p>
      {error && <ErrorCard code={error} />}
    </div>
  )
}
