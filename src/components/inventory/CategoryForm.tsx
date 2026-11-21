'use client'

import { useEffect, useId, useRef, useState } from 'react'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { normalizeName } from '@/lib/inventory/names'
import { addCategory, deleteCategory, renameCategory, saveCategoryOrder } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import { CATEGORY_NAME_MAX, type InvCategory, type InvItem } from '@/types/inventory'
import { SidePanel } from './ItemForm'

// 분류 고치기 판 (spec inventory REQ-7506 AC-7506.3, design.md 6절, 시안 ?s=cats).
// 분류 더하기·이름 고치기(1~20자, 겹치지 않음)·▲▼ 차례·지우기(물품 0개일 때만, 안 쓰는 물품 포함)를 판 안에서 바꾸고 [저장]으로 보낸다.
// 보내는 차례: 지우기 → 이름 고치기 → 더하기(끝에 붙음) → 차례(▲▼를 눌렀을 때만). 한 번에 묶이지 않아 중간에 실패하면
// 그때까지 저장된 것은 판에 저장된 값으로 남기고(다시 저장해도 두 번 보내지 않음) 오류 카드와 [다시 저장]이다

const NAME_EMPTY = '분류 이름을 적어 주세요'
const NAME_LONG = `분류 이름은 ${CATEGORY_NAME_MAX}자까지 적어요`
const NAME_TAKEN = '같은 이름 분류가 있어요'
const BAD_CHAR = '쓸 수 없는 글자(탭·줄바꿈 같은)가 있어요'
const IN_USE_TITLE = '물품이 있는 분류는 지울 수 없어요'
const CONTROL = /\p{Cc}/u

/** 판의 한 줄. id null = 아직 저장하지 않은 새 분류 */
type Row = { key: string; id: string | null; name: string }

const labelOf = (row: Row, index: number) => row.name.trim() || `${index + 1}번째 분류`

function problems(rows: readonly Row[]): Record<string, string> {
  const found: Record<string, string> = {}
  const seen = new Set<string>()
  for (const row of rows) {
    const name = row.name.trim()
    if (name === '') found[row.key] = NAME_EMPTY
    else if (CONTROL.test(name)) found[row.key] = BAD_CHAR
    else if ([...name].length > CATEGORY_NAME_MAX) found[row.key] = NAME_LONG
    else {
      const key = normalizeName(name)
      if (seen.has(key)) found[row.key] = NAME_TAKEN
      seen.add(key)
    }
  }
  return found
}

export type CategoryFormProps = {
  categories: readonly InvCategory[]
  /** 모든 물품(안 쓰는 물품 포함) — 분류마다 물품 수 */
  items: readonly InvItem[]
  /** 판을 닫을 때. changed = 저장한 것이 있음(다시 읽기) */
  onDone(changed: boolean): void
}

export function CategoryForm({ categories, items, onDone }: CategoryFormProps) {
  const [rows, setRows] = useState<Row[]>(() =>
    [...categories].sort((a, b) => a.sortOrder - b.sortOrder).map((c) => ({ key: c.id, id: c.id, name: c.name })),
  )
  // 저장된 이름(id → 이름). 이것과 다른 줄만 이름을 고친다
  const [saved, setSaved] = useState<Record<string, string>>(() => Object.fromEntries(categories.map((c) => [c.id, c.name])))
  const [removed, setRemoved] = useState<string[]>([])
  const [moved, setMoved] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<ErrorCode | null>(null)
  const changed = useRef(false)
  const newCount = useRef(0)
  const focusKey = useRef<string | null>(null)
  const inputs = useRef(new Map<string, HTMLInputElement>())
  const listId = useId()
  const errorBase = useId()

  const counts = new Map<string, number>()
  for (const item of items) counts.set(item.categoryId, (counts.get(item.categoryId) ?? 0) + 1)
  const countOf = (row: Row) => (row.id === null ? 0 : (counts.get(row.id) ?? 0))

  // [+ 분류 더하기] 뒤 새 줄 이름 칸으로 초점
  useEffect(() => {
    if (focusKey.current === null) return
    inputs.current.get(focusKey.current)?.focus()
    focusKey.current = null
  }, [rows])

  const rename = (key: string, name: string) => setRows((list) => list.map((row) => (row.key === key ? { ...row, name } : row)))
  function move(index: number, step: number) {
    const to = index + step
    if (to < 0 || to >= rows.length) return
    const next = [...rows]
    ;[next[index], next[to]] = [next[to], next[index]]
    setRows(next)
    setMoved(true)
  }
  function remove(row: Row) {
    if (countOf(row) > 0) return
    setRows((list) => list.filter((r) => r.key !== row.key))
    if (row.id !== null) setRemoved((ids) => [...ids, row.id as string])
  }
  function addRow() {
    const key = `new-${++newCount.current}`
    focusKey.current = key
    setRows((list) => [...list, { key, id: null, name: '' }])
  }

  async function save() {
    if (saving) return
    const found = problems(rows)
    setErrors(found)
    if (Object.keys(found).length > 0) return
    let nextRows = rows.map((row) => ({ ...row, name: row.name.trim() }))
    let nextSaved = { ...saved }
    let nextRemoved = [...removed]
    let nextMoved = moved
    const pending = nextRemoved.length > 0 || nextMoved || nextRows.some((row) => row.id === null || row.name !== nextSaved[row.id])
    if (!pending) return onDone(changed.current)

    setSaving(true)
    setSaveError(null)
    let problem: ErrorCode | null = null
    for (const id of [...nextRemoved]) {
      const result = await deleteCategory(id)
      if (result !== 'ok') {
        problem = result === 'in-use' ? 'E-INV-IN-USE' : 'E-INV-SAVE-FAILED'
        break
      }
      nextRemoved = nextRemoved.filter((other) => other !== id)
      changed.current = true
    }
    for (const row of problem ? [] : [...nextRows]) {
      if (row.id === null || row.name === nextSaved[row.id]) continue
      const result = await renameCategory(row.id, row.name)
      if (result !== 'ok') {
        problem = result === 'duplicate' ? 'E-INV-DUPLICATE' : 'E-INV-SAVE-FAILED'
        break
      }
      nextSaved = { ...nextSaved, [row.id]: row.name }
      changed.current = true
    }
    for (const row of problem ? [] : [...nextRows]) {
      if (row.id !== null) continue
      const result = await addCategory(row.name)
      if (result === 'duplicate' || result === 'failed') {
        problem = result === 'duplicate' ? 'E-INV-DUPLICATE' : 'E-INV-SAVE-FAILED'
        break
      }
      nextRows = nextRows.map((r) => (r.key === row.key ? { ...r, id: result.id } : r))
      nextSaved = { ...nextSaved, [result.id]: row.name }
      changed.current = true
    }
    if (!problem && nextMoved) {
      const result = await saveCategoryOrder(nextRows.map((row) => row.id as string))
      if (result === 'ok') {
        nextMoved = false
        changed.current = true
      } else problem = 'E-INV-SAVE-FAILED'
    }
    setRows(nextRows)
    setSaved(nextSaved)
    setRemoved(nextRemoved)
    setMoved(nextMoved)
    setSaving(false)
    if (problem) setSaveError(problem)
    else onDone(true)
  }

  const close = () => onDone(changed.current)
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
    <SidePanel title="분류 고치기" onClose={close} foot={foot}>
      <p className="text-small text-ink-2">
        목록·세기 표·세기 종이가 이 차례로 나와요. 물품이 있는 분류는 지울 수 없어요(물품을 다른 분류로 옮긴 뒤 지워요).
      </p>
      <ol id={listId} aria-label="분류 차례" className="flex flex-col">
        {rows.map((row, index) => {
          const label = labelOf(row, index)
          const count = countOf(row)
          const error = errors[row.key]
          const errorId = `${errorBase}-${row.key}`
          return (
            <li key={row.key} className="flex flex-col gap-1 border-b border-line py-2 last:border-b-0">
              <div className="flex items-center gap-2">
                <span className="w-6 shrink-0 text-right text-small text-muted tabular-nums">{index + 1}</span>
                <input
                  ref={(el) => {
                    if (el) inputs.current.set(row.key, el)
                    else inputs.current.delete(row.key)
                  }}
                  className={`${ds.input} h-9`}
                  aria-label={`${index + 1}번째 분류 이름`}
                  aria-invalid={Boolean(error)}
                  aria-describedby={error ? errorId : undefined}
                  maxLength={CATEGORY_NAME_MAX}
                  value={row.name}
                  onChange={(e) => rename(row.key, e.target.value)}
                />
                <span className="shrink-0 text-small whitespace-nowrap text-muted">{`물품 ${count}개`}</span>
                <span className="flex shrink-0 items-center gap-1">
                  <button
                    type="button"
                    className={ds.button.secondarySmall}
                    aria-label={`${label} 위로`}
                    aria-disabled={index === 0}
                    onClick={() => move(index, -1)}
                  >
                    <Icon name="chev" className="rotate-180" />
                  </button>
                  <button
                    type="button"
                    className={ds.button.secondarySmall}
                    aria-label={`${label} 아래로`}
                    aria-disabled={index === rows.length - 1}
                    onClick={() => move(index, 1)}
                  >
                    <Icon name="chev" />
                  </button>
                  <button
                    type="button"
                    className={ds.button.ghostSmall}
                    aria-label={`${label} 지우기`}
                    aria-disabled={count > 0}
                    title={count > 0 ? IN_USE_TITLE : undefined}
                    onClick={() => remove(row)}
                  >
                    <Icon name="x" />
                  </button>
                </span>
              </div>
              {error && (
                <p id={errorId} className={`${ds.fieldError} pl-8`}>
                  {error}
                </p>
              )}
            </li>
          )
        })}
      </ol>
      <div>
        <button type="button" className={ds.textButton} onClick={addRow}>
          + 분류 더하기
        </button>
      </div>
      {saveError && <ErrorCard code={saveError} />}
    </SidePanel>
  )
}
