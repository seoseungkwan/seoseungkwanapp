'use client'

import { useEffect, useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { bitCodeList, searchBitCodes, type BitCode } from '@/lib/inventory/bitCodes'
import { normalizeName } from '@/lib/inventory/names'
import { addBitItems, listBitCodeMonths, loadInventory } from '@/lib/storage/inventory'
import type { InvBitMonth, InvCategory } from '@/types/inventory'

// 비트 코드에서 고르기 판 (spec inventory REQ-7514 AC-7514.4, design.md 6절 TASK-14, 시안 docs/mockups/inventory ?s=bit·bit-empty).
// 가운데 창(시안 .dlg 640px, 사진 보기 창과 같은 틀). 열리면 스스로 물품(loadInventory)과 통계에 저장된 처방 코드(listBitCodeMonths)를 읽어
// bitCodeList로 많이 쓴 차례 목록을 만든다. 이미 이어진 코드·같은 이름 물품이 있는 코드는 "이미 있음"이고 고를 수 없다.
// 한 코드를 고르면 이름(normalizeName)이 같은 다른 코드는 "같은 이름 고름"이고 고를 수 없다(풀면 다시 고를 수 있음).
// [n개 더하기] = 고른 코드를 넣을 분류 하나에 한 번에(addBitItems). 성공하면 onAdded(목록 다시 읽기) → onClose, 실패하면 고른 것 그대로 + 오류 카드.
// 코드·이름·건수만 다룬다(환자 정보 없음, 서버·Claude로 가지 않음). 여는 단추·닫은 뒤 초점은 화면(InventoryScreen, TASK-15)이 맡는다

type Props = { onAdded: () => void; onClose: () => void }

type Ready = { kind: 'ready'; categories: InvCategory[]; codes: BitCode[]; span: string | null }
type View = { kind: 'loading' } | { kind: 'failed' } | Ready
type SaveError = 'E-INV-SAVE-FAILED' | 'E-INV-DUPLICATE'

const EMPTY_TEXT = '불러온 처방 코드가 없어요. 통계에서 비트 자료를 불러오면 고를 수 있어요.'

// 시안 .inp.sm(36px, 표 위 작은 칸). 찾기 칸은 왼쪽에 돋보기 자리(32px)를 둔다
const SMALL_FIELD =
  'h-9 min-w-0 rounded-control border border-line-strong bg-surface text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden'
// 표 칸: 머리는 스크롤해도 위에 붙는다(시안 .bit-l th sticky). 이름 칸은 40자 이름이 창을 넘지 않게 줄바꿈한다.
// ds.table.th는 왼쪽 정렬이라 숫자 머리는 따로 둔다(같은 속성 클래스를 겹치지 않게)
const HEAD_STICKY = 'sticky top-0 z-10 bg-surface'
const CHECK_HEAD = `h-10 w-10 whitespace-nowrap border-b border-line pr-1 pl-5 ${HEAD_STICKY}`
const NUM_HEAD = `h-10 whitespace-nowrap border-b border-line px-3 text-right font-medium text-muted first:pl-5 last:pr-5 ${HEAD_STICKY}`
const NAME_CELL = 'h-11 border-b border-line px-3 py-1.5 first:pl-5 last:pr-5'
const CODE_CELL = 'h-11 whitespace-nowrap border-b border-line px-3 tabular-nums text-muted first:pl-5 last:pr-5'

/** '2026-08' → '2026년 8월' */
const monthText = (month: string) => `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`

/** 처방 줄이 있는 달의 처음~끝: '2026년 8월 ~ 11월' · '2025년 12월 ~ 2026년 2월' · '2026년 11월'. 없으면 null */
function spanOf(months: readonly InvBitMonth[]): string | null {
  const used = months.filter((m) => Array.isArray(m.rx) && m.rx.length > 0).map((m) => m.month)
  if (used.length === 0) return null
  const sorted = [...used].sort()
  const [from, to] = [sorted[0]!, sorted[sorted.length - 1]!]
  if (from === to) return monthText(from)
  return from.slice(0, 4) === to.slice(0, 4) ? `${monthText(from)} ~ ${Number(to.slice(5, 7))}월` : `${monthText(from)} ~ ${monthText(to)}`
}

async function readPicker(): Promise<Ready | 'failed'> {
  const [inventory, months] = await Promise.all([loadInventory(), listBitCodeMonths()])
  if (inventory === 'failed' || months === 'failed') return 'failed'
  return { kind: 'ready', categories: inventory.categories, codes: bitCodeList(months, inventory.items), span: spanOf(months) }
}

/** 찾기 돋보기(시안 ic('search')). Icon에는 없어 이 부품 안에 둔다 */
function SearchIcon() {
  return (
    <svg
      aria-hidden="true"
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted"
    >
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5 14 14" />
    </svg>
  )
}

export function BitCodePicker({ onAdded, onClose }: Props) {
  const titleId = useId()
  const idBase = useId()
  const categoryFieldId = useId()
  const dialogRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  const savingRef = useRef(false)

  const [view, setView] = useState<View>({ kind: 'loading' })
  const [readCount, setReadCount] = useState(0)
  const [query, setQuery] = useState('')
  const [picked, setPicked] = useState<ReadonlySet<string>>(() => new Set())
  const [categoryId, setCategoryId] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<SaveError | null>(null)

  useEffect(() => {
    let live = true
    void readPicker().then((result) => {
      if (!live) return
      if (result === 'failed') {
        setView({ kind: 'failed' })
        return
      }
      setView(result)
      setCategoryId(result.categories[0]?.id ?? '')
    })
    return () => {
      live = false
    }
  }, [readCount])

  // 열리면 창에, 목록이 보이면 찾기 칸에 초점
  const hasList = view.kind === 'ready' && view.codes.length > 0
  useEffect(() => {
    if (hasList) searchRef.current?.focus()
    else dialogRef.current?.focus()
  }, [hasList, view.kind])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  // 가림막 자신을 눌렀을 때만 닫는다(창 안에서 올라온 누름은 target이 다르다)
  const closeOnBackdrop = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target === event.currentTarget) onClose()
  }

  const reread = () => {
    setView({ kind: 'loading' })
    setReadCount((n) => n + 1)
  }

  const toggle = (code: string) => {
    setPicked((before) => {
      const next = new Set(before)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const add = async () => {
    if (savingRef.current || view.kind !== 'ready') return
    // 목록 차례(많이 쓴 차례) 그대로 보낸다. 고를 수 없는 줄은 picked에 들지 않는다
    const picks = view.codes.filter((c) => !c.taken && picked.has(c.code)).map(({ code, name }) => ({ code, name }))
    if (picks.length === 0 || categoryId === '') return
    savingRef.current = true
    setSaving(true)
    setSaveError(null)
    const result = await addBitItems(categoryId, picks)
    savingRef.current = false
    setSaving(false)
    if (result === 'ok') {
      onAdded()
      onClose()
      return
    }
    setSaveError(result === 'duplicate' ? 'E-INV-DUPLICATE' : 'E-INV-SAVE-FAILED')
  }

  const head = (
    <div className="flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-5">
      <h2 id={titleId} className="text-subtitle font-semibold text-ink">
        비트 코드에서 고르기
      </h2>
      <button type="button" aria-label="닫기" className={`${ds.button.ghostSmall} text-muted`} onClick={onClose}>
        <Icon name="x" />
      </button>
    </div>
  )
  const closeFoot = (
    <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">
      <button type="button" className={ds.button.secondary} onClick={onClose}>
        닫기
      </button>
    </div>
  )

  let body: ReactNode
  if (view.kind === 'loading') {
    body = (
      <p role="status" className="px-5 py-12 text-center text-small text-muted">
        불러오는 중이에요
      </p>
    )
  } else if (view.kind === 'failed') {
    body = (
      <>
        <div className="grid gap-3 px-5 py-5">
          <ErrorCard code="E-INV-READ-FAILED" />
          <div>
            <button type="button" className={ds.button.secondary} onClick={reread}>
              다시 읽기
            </button>
          </div>
        </div>
        {closeFoot}
      </>
    )
  } else if (view.codes.length === 0) {
    body = (
      <>
        <div className="grid flex-1 place-items-center px-8 py-12 text-center text-body text-ink-2">
          <p>{EMPTY_TEXT}</p>
        </div>
        {closeFoot}
      </>
    )
  } else {
    const shown = searchBitCodes(view.codes, query)
    const count = picked.size
    // 고른 코드의 이름들: 같은 이름 다른 코드는 고를 수 없다(물품 이름은 겹칠 수 없다)
    const pickedNames = new Set(view.codes.filter((c) => picked.has(c.code)).map((c) => normalizeName(c.name)))
    body = (
      <>
        <div className="border-b border-line px-5 pt-4 pb-3">
          <div className="relative">
            <SearchIcon />
            <input
              ref={searchRef}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="이름이나 코드"
              aria-label="이름이나 코드로 찾기"
              className={`${SMALL_FIELD} w-full pr-2 pl-8`}
            />
          </div>
          {view.span !== null && <p className={`${ds.help} mt-1.5`}>{`통계에서 불러온 비트 자료(${view.span})의 처방 코드예요. 많이 쓴 차례.`}</p>}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto">
          <table className={ds.table.table}>
            <thead>
              <tr>
                <th scope="col" className={CHECK_HEAD}>
                  <span className="sr-only">고르기</span>
                </th>
                <th scope="col" className={`${ds.table.th} ${HEAD_STICKY}`}>
                  이름
                </th>
                <th scope="col" className={`${ds.table.th} ${HEAD_STICKY}`}>
                  코드
                </th>
                <th scope="col" className={NUM_HEAD}>
                  쓴 건수
                </th>
              </tr>
            </thead>
            <tbody>
              {shown.map((c, index) => {
                const inputId = `${idBase}-${index}`
                const twin = !c.taken && !picked.has(c.code) && pickedNames.has(normalizeName(c.name))
                const off = c.taken || twin
                const tone = off ? 'text-ink-2' : 'text-ink'
                return (
                  <tr key={c.code} className={ds.table.row}>
                    <td className={ds.table.check}>
                      <span className={ds.checkboxWrap}>
                        <input
                          id={inputId}
                          type="checkbox"
                          aria-label={c.name}
                          checked={!c.taken && picked.has(c.code)}
                          disabled={off}
                          onChange={() => toggle(c.code)}
                          className={ds.checkbox}
                        />
                        <Icon name="check" className={ds.checkboxMark} />
                      </span>
                    </td>
                    <td className={`${NAME_CELL} ${tone}`}>
                      <label htmlFor={inputId} className={off ? undefined : 'cursor-pointer'}>
                        {c.name}
                      </label>
                      {c.taken && <span className={`${ds.chip.neutral} ml-1.5`}>이미 있음</span>}
                      {twin && <span className={`${ds.chip.neutral} ml-1.5`}>같은 이름 고름</span>}
                    </td>
                    <td className={CODE_CELL}>{c.code}</td>
                    <td className={off ? `${ds.table.tdSub} text-right tabular-nums` : ds.table.tdNum}>{`${formatCount(c.count)}건`}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
          {shown.length === 0 && <p className="px-5 py-6 text-small text-muted">맞는 코드가 없어요.</p>}
        </div>
        {saveError !== null && (
          <div className="border-t border-line px-5 pt-3">
            <ErrorCard code={saveError} />
          </div>
        )}
        <div className={`flex flex-wrap items-center justify-between gap-2 px-5 py-3 ${saveError === null ? 'border-t border-line' : ''}`}>
          <span className="inline-flex items-center gap-2 text-small text-ink-2">
            <label htmlFor={categoryFieldId}>넣을 분류</label>
            <select id={categoryFieldId} value={categoryId} onChange={(event) => setCategoryId(event.target.value)} className={`${SMALL_FIELD} w-40 px-2`}>
              {view.categories.map((category) => (
                <option key={category.id} value={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </span>
          <span className="inline-flex gap-2">
            <button type="button" className={ds.button.secondary} onClick={onClose}>
              취소
            </button>
            <button
              type="button"
              className={ds.button.primary}
              disabled={count === 0 || categoryId === ''}
              aria-busy={saving ? 'true' : undefined}
              onClick={() => void add()}
            >
              {`${count}개 더하기`}
            </button>
          </span>
        </div>
      </>
    )
  }

  return (
    <div onClick={closeOnBackdrop} className="fixed inset-0 z-40 flex items-center justify-center bg-ink/20 px-4 py-6">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={`${ds.layer} flex max-h-full w-160 max-w-full flex-col outline-hidden ${hasList ? 'h-180' : ''}`}
      >
        {head}
        {body}
      </div>
    </div>
  )
}
