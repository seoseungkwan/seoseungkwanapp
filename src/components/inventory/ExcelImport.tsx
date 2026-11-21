'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import * as XLSX from 'xlsx'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { formatWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { todayInKorea } from '@/lib/analytics/dates'
import { FIELDS, FIELD_LABELS, type ColumnMapping, type Field } from '@/lib/inventory/ai'
import {
  TEMPLATE_FILE,
  TEMPLATE_MAPPING,
  categoryValues,
  defaultCategoryMap,
  previewRows,
  readSheet,
  sampleForAi,
  templateWorkbook,
  type Cell,
  type PreviewRow,
  type PreviewStatus,
  type SheetRead,
} from '@/lib/inventory/excel'
import { normalizeName } from '@/lib/inventory/names'
import { importItems, loadInventory } from '@/lib/storage/inventory'
import type { ErrorCode } from '@/types/errors'
import type { InvInventory, InvItem } from '@/types/inventory'
import { askColumns, type ColumnsAnswer } from './columnsClient'

// 엑셀 양식 받기·올리기 (spec inventory TASK-11, REQ-7509, design.md 4·6절, 시안 ?s=excel·excel-own).
// [양식 받기] = 브라우저가 지금 분류·물품으로 재고-양식.xlsx를 만든다(서버·정적 파일 없음).
// [엑셀 올리기] → ExcelPreview: 양식이면 칸 맞춤 없이 바로 미리 보기('양식 그대로'), 아니면 머리 줄 + 앞 줄 5개만 칸 맞춤 경로로 보내고
// 'AI가 맞춘 칸'·'분류 맞추기'를 고치면 미리 보기가 바로 바뀐다. 모든 줄은 브라우저가 읽는다 → [넣기] = importItems.
// 개인정보 모양이면(보내기 전 검사 또는 경로 답 E-INV-PRIVATE) 보내지 않고 양식 칸 이름과 똑같은 머리 글만 맞춘 칸 맞춤으로 시작한다(AC-7509.5).
// 넣기가 실패한 뒤 [넣기]는 재고를 다시 읽어 계획을 다시 만든다(칸 맞춤·분류 맞추기 그대로, AI 다시 안 부름, AC-7509.4).
// PC 모양 하나뿐이다. 미리 보기 표는 제 상자 안에서 옆으로 밀린다

/** [양식 받기]: 지금 분류·물품(숨긴 물품 빼고)을 채운 재고-양식.xlsx를 내려받게 한다. 못 읽거나 못 만들면 거짓 */
export async function downloadTemplate(): Promise<boolean> {
  const inventory = await loadInventory()
  if (inventory === 'failed') return false
  try {
    XLSX.writeFile(templateWorkbook(inventory.categories, inventory.items), TEMPLATE_FILE)
    return true
  } catch {
    return false
  }
}

type Stage =
  | { kind: 'reading' }
  | { kind: 'matching' }
  | { kind: 'error'; code: ErrorCode; retry: '다시 읽기' | '다시 분석' | null }
  | { kind: 'ready' }
type Loaded = { sheet: SheetRead; inventory: InvInventory }
type Filter = 'all' | PreviewStatus
type Note = { text: string; tone: 'error' | 'info' | 'plain' }
type InsertError = 'E-INV-SAVE-FAILED' | 'E-INV-READ-FAILED'

const PRIVATE_NOTE = '개인정보 모양이 있어 AI에 보내지 않았어요. 칸을 직접 골라 주세요.'

const STATUS: Record<PreviewStatus, { label: string; chip: string }> = {
  new: { label: '새 물품', chip: ds.chip.accent },
  update: { label: '고침', chip: ds.chip.warning },
  same: { label: '그대로', chip: ds.chip.neutral },
  skip: { label: '건너뜀', chip: ds.chip.neutral },
}
const FILTERS: readonly PreviewStatus[] = ['new', 'update', 'skip', 'same']
const NUMBER_FIELDS: Partial<Record<Field, 'count' | 'won'>> = { minQty: 'count', qty: 'count', unitPrice: 'won' }
const MONTH_ONLY = /^(\d{2}|\d{4})[-./](\d{1,2})$/

// 표 칸: ds.table 몸 칸과 같은 모양이고 글자색은 줄(건너뜀은 흐림)이 정한다
const CELL = 'h-11 whitespace-nowrap border-b border-line px-3 first:pl-5 last:pr-5'
const NOTE_CELL = 'h-11 min-w-56 whitespace-normal border-b border-line px-3 py-2 first:pl-5 last:pr-5'
const SELECT = `h-9 w-full min-w-0 cursor-pointer rounded-control border border-line-strong bg-surface px-2 text-body text-ink not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden`
// 거르기 단추: ds.segment 모양에서 폰 너비 맞춤(max-md:)만 뺀다 — 새 화면은 폰 전용 모양이 없다(AC-7509.3)
const pcOnly = (classes: string) =>
  classes
    .split(' ')
    .filter((name) => !name.startsWith('max-md:'))
    .join(' ')
const FILTER_GROUP = pcOnly(ds.segment.group)
const FILTER_BUTTON = pcOnly(ds.segment.button)

// excel.ts와 같은 글자 다듬기(NFC, 제어 문자·빈칸 여럿 → 빈칸 하나, 앞뒤 빈칸 뗌): 분류 값 세기·물품 이름 맞추기에 쓴다
const clean = (value: string) => value.normalize('NFC').replace(/\p{Cc}+/gu, ' ').replace(/\s+/gu, ' ').trim()
const cellText = (value: Cell | undefined) => (value === null || value === undefined ? '' : clean(String(value)))
const columnLabel = (header: readonly string[], i: number) => `${XLSX.utils.encode_col(i)} ${header[i] ?? ''}`.trim()
const count = (n: number | null) => (n === null ? '–' : formatCount(n))
const won = (n: number | null) => (n === null ? '–' : formatWon(n))

// AC-7509.5: AI에 보내지 않을 때의 칸 맞춤 — 머리 글이 양식 칸 이름과 똑같은 엑셀 칸만 그 칸에, 나머지는 넣지 않음
function labelMapping(header: readonly string[]): ColumnMapping {
  const mapping = { ...TEMPLATE_MAPPING }
  for (const field of FIELDS) {
    const at = header.indexOf(FIELD_LABELS[field])
    mapping[field] = at < 0 ? null : at
  }
  return mapping
}

// 읽은 시트·재고·칸 맞춤·고른 분류 → 분류 맞추기 값과 미리 보기·넣기 계획. 다시 넣기 전 다시 읽은 재고로도 부른다
function previewOf(sheet: SheetRead, inventory: InvInventory, mapping: ColumnMapping, categoryPick: Readonly<Record<string, string>>) {
  const values = categoryValues(sheet.rows, mapping)
  const defaults = defaultCategoryMap(values, inventory.categories)
  const categoryMap = Object.fromEntries(values.map((value) => [value, categoryPick[value] ?? defaults[value]]))
  const preview = previewRows({ rows: sheet.rows, rowNumbers: sheet.rowNumbers, mapping, categoryMap, categories: inventory.categories, items: inventory.items })
  return { values, defaults, categoryMap, ...preview }
}

async function readFile(file: File): Promise<SheetRead | null> {
  try {
    return readSheet(await file.arrayBuffer())
  } catch {
    return null
  }
}

// 칸에 보일 글자: 정수 글자인 수량은 쉼표, 단가는 원. 못 읽은 칸(건너뛴 줄)은 적힌 글자 그대로
function shown(field: Field, value: string): string {
  const kind = NUMBER_FIELDS[field]
  if (kind === undefined || !/^-?\d+$/.test(value)) return value
  return kind === 'won' ? formatWon(Number(value)) : formatCount(Number(value))
}

function changeText(field: Field | 'hidden', row: PreviewRow, item: InvItem, categoryName: string): string {
  const v = row.values
  switch (field) {
    case 'category':
      return `분류 ${categoryName} → ${v.category}`
    case 'unit':
      return `단위 ${item.unit} → ${v.unit}`
    case 'minQty':
      return `최소 수량 ${count(item.minQty)} → ${count(Number(v.minQty))}`
    case 'qty':
      return `지금 수량 ${count(item.qty)} → ${count(Number(v.qty))} (오늘 센 것으로 남아요)`
    case 'expiry':
      return `유통기한 ${item.expiry ?? '–'} → ${v.expiry}`
    case 'vendor':
      return `거래처 ${item.vendor ?? '–'} → ${v.vendor}`
    case 'unitPrice':
      return `단가 ${won(item.unitPrice)} → ${won(Number(v.unitPrice))}`
    case 'hidden':
      return '안 쓰는 물품 → 다시 써요'
    case 'name':
      return ''
  }
}

// 바뀐 것 · 살펴볼 것: 건너뛴 까닭(오류 색) · 고친 칸 '옛 값 → 새 값' · 달만 적은 기한
function noteOf(row: PreviewRow, cells: readonly Cell[], mapping: ColumnMapping, item: InvItem | undefined, categoryName: string): Note | null {
  if (row.status === 'skip') return { text: row.reason ?? '', tone: 'error' }
  if (row.status === 'update' && item !== undefined) {
    return { text: row.changed.map((field) => changeText(field, row, item, categoryName)).join(' · '), tone: 'plain' }
  }
  if (row.status === 'new' && mapping.expiry !== null && row.values.expiry !== '') {
    const written = cellText(cells[mapping.expiry])
    if (MONTH_ONLY.test(written)) return { text: `유통기한 '${written}' → 그 달 마지막 날로 읽었어요`, tone: 'info' }
  }
  return null
}

export function ExcelPreview({ file, onDone, onCancel }: { file: File; onDone: () => void; onCancel: () => void }) {
  // [다른 파일 올리기]로 고른 파일. 받은 file이 바뀌면 그 파일이 다시 이긴다
  const [picked, setPicked] = useState<{ from: File; file: File } | null>(null)
  const current = picked !== null && picked.from === file ? picked.file : file
  const [attempt, setAttempt] = useState(0)
  const [stage, setStage] = useState<Stage>({ kind: 'reading' })
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  const [mapping, setMapping] = useState<ColumnMapping | null>(null)
  const [categoryPick, setCategoryPick] = useState<Record<string, string>>({})
  const [filter, setFilter] = useState<Filter>('all')
  const [importing, setImporting] = useState(false)
  const [insertError, setInsertError] = useState<InsertError | null>(null)
  const [templateFailed, setTemplateFailed] = useState(false)
  // 개인정보 모양이라 AI에 보내지 않고 칸을 직접 고르는 중(AC-7509.5)
  const [manual, setManual] = useState(false)
  const busy = useRef(false)
  // 넣기가 한 번 실패했다: 다음 [넣기]는 재고를 다시 읽고 계획을 다시 만든다(AC-7509.4)
  const failedOnce = useRef(false)
  const input = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let alive = true
    setStage({ kind: 'reading' })
    setLoaded(null)
    setMapping(null)
    setCategoryPick({})
    setFilter('all')
    setInsertError(null)
    setManual(false)
    failedOnce.current = false
    void (async () => {
      const [sheet, inventory] = await Promise.all([readFile(current), loadInventory()])
      if (!alive) return
      if (sheet === null) return setStage({ kind: 'error', code: 'E-INV-EXCEL', retry: null })
      if (inventory === 'failed') return setStage({ kind: 'error', code: 'E-INV-READ-FAILED', retry: '다시 읽기' })
      setLoaded({ sheet, inventory })
      if (sheet.template) {
        setMapping(TEMPLATE_MAPPING)
        return setStage({ kind: 'ready' })
      }
      // 보내기 전 개인정보 모양 검사(sampleForAi). 걸리거나 경로가 E-INV-PRIVATE로 답하면 보내지 않고 칸을 직접 고르게 한다
      const sample = sampleForAi(sheet.header, sheet.rows)
      let answer: ColumnsAnswer = { kind: 'error', code: 'E-INV-PRIVATE' }
      if (!sample.problem) {
        setStage({ kind: 'matching' })
        answer = await askColumns(sample)
        if (!alive) return
      }
      if (answer.kind === 'error' && answer.code === 'E-INV-PRIVATE') {
        setMapping(labelMapping(sheet.header))
        setManual(true)
        return setStage({ kind: 'ready' })
      }
      if (answer.kind === 'error') {
        const retry = answer.code === 'E-AI-BUSY' || answer.code === 'E-AI-FAILED' ? '다시 분석' : null
        return setStage({ kind: 'error', code: answer.code, retry })
      }
      setMapping(answer.mapping)
      setStage({ kind: 'ready' })
    })()
    return () => {
      alive = false
    }
  }, [current, attempt])

  const view = useMemo(() => {
    if (loaded === null || mapping === null) return null
    const { sheet, inventory } = loaded
    const preview = previewOf(sheet, inventory, mapping, categoryPick)
    // 미리 보기 줄의 물품(같은 이름 = normalizeName이 같음, previewRows와 같이 먼저 나온 물품)
    const itemByName = new Map<string, InvItem>()
    for (const item of inventory.items) if (!itemByName.has(normalizeName(item.name))) itemByName.set(normalizeName(item.name), item)
    const categoryName = new Map(inventory.categories.map((category) => [category.id, category.name]))
    const notes = preview.rows.map((row, i) => {
      const item = itemByName.get(normalizeName(row.values.name))
      return noteOf(row, sheet.rows[i] ?? [], mapping, item, item === undefined ? '' : (categoryName.get(item.categoryId) ?? ''))
    })
    const sums: Record<PreviewStatus, number> = { new: 0, update: 0, same: 0, skip: 0 }
    for (const row of preview.rows) sums[row.status]++
    return { notes, sums, ...preview }
  }, [loaded, mapping, categoryPick])

  const ready = stage.kind === 'ready' && view !== null && loaded !== null && mapping !== null
  const canInsert = view !== null && view.sums.new + view.sums.update > 0

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const chosen = event.target.files?.[0]
    event.target.value = ''
    if (chosen !== undefined) setPicked({ from: file, file: chosen })
  }

  async function template() {
    setTemplateFailed(!(await downloadTemplate()))
  }

  function pickColumn(field: Field, value: string) {
    const column = value === '' ? null : Number(value)
    setMapping((prev) => {
      if (prev === null) return prev
      const next = { ...prev }
      // 엑셀 칸 하나 = 재고 칸 하나: 다른 재고 칸이 쓰던 엑셀 칸이면 그 칸은 '넣지 않음'
      if (column !== null) for (const other of FIELDS) if (other !== field && next[other] === column) next[other] = null
      next[field] = column
      return next
    })
  }

  async function insert() {
    if (view === null || loaded === null || mapping === null || !canInsert || busy.current) return
    busy.current = true
    setImporting(true)
    setInsertError(null)
    let plan = view.plan
    if (failedOnce.current) {
      // 반쯤 들어갔을 수 있다: 지금 재고를 다시 읽어 읽어 둔 시트·지금 칸 맞춤·고른 분류로 계획을 다시 만든다(AI 안 부름)
      const inventory = await loadInventory()
      if (inventory === 'failed') {
        busy.current = false
        setImporting(false)
        setInsertError('E-INV-READ-FAILED')
        return
      }
      setLoaded({ sheet: loaded.sheet, inventory })
      plan = previewOf(loaded.sheet, inventory, mapping, categoryPick).plan
    }
    const result = await importItems(plan, todayInKorea())
    busy.current = false
    setImporting(false)
    if (result === 'ok') return onDone()
    failedOnce.current = true
    setInsertError('E-INV-SAVE-FAILED')
  }

  const own = loaded !== null && !loaded.sheet.template
  const categoryColumn = mapping?.category ?? null
  const desc = !ready
    ? null
    : !own
      ? '양식 그대로라 칸을 맞출 것이 없어요. 미리 보기를 보고 넣어요. 물품 이름이 같은 줄은 그 물품을 고쳐요.'
      : manual
        ? '양식이 아닌 엑셀이에요. 칸과 분류를 골라 미리 보기를 본 뒤 넣어요. 물품 이름이 같은 줄은 그 물품을 고쳐요.'
        : '양식이 아닌 엑셀이라 AI가 칸을 맞췄어요. 칸이나 분류가 틀리면 바꾸고, 미리 보기를 본 뒤 넣어요. 물품 이름이 같은 줄은 그 물품을 고쳐요.'

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="text-subtitle font-semibold text-ink">엑셀로 물품 넣기</h2>
          {desc !== null && <p className="mt-0.5 max-w-2xl text-small text-muted">{desc}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" className={ds.button.secondary} onClick={() => void template()}>
            <Icon name="arrowDown" className="text-ink-2" />
            양식 받기
          </button>
          <button type="button" className={ds.button.secondary} onClick={() => input.current?.click()}>
            <Icon name="upload" className="text-ink-2" />
            다른 파일 올리기
          </button>
          <input ref={input} type="file" accept=".xlsx" hidden onChange={chooseFile} />
        </div>
      </div>
      {templateFailed && (
        <div className="mt-4">
          <ErrorCard code="E-INV-READ-FAILED" />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-y border-line py-3 text-small text-ink-2">
        <Icon name="doc" className="text-ink-2" />
        <span className="font-semibold text-ink">{current.name}</span>
        {loaded?.sheet.template && (
          <>
            <span>{"시트 '물품'"}</span>
            <span className={ds.chip.positive}>
              <Icon name="check" size={12} />
              양식 그대로
            </span>
          </>
        )}
        {loaded !== null && <span>{`${loaded.sheet.rows.length}줄`}</span>}
      </div>

      {stage.kind === 'reading' && (
        <p role="status" className="mt-6 text-small text-muted">
          엑셀을 읽는 중…
        </p>
      )}
      {stage.kind === 'matching' && (
        <p role="status" className="mt-6 text-small text-muted">
          AI가 칸을 맞추는 중…
        </p>
      )}
      {stage.kind === 'error' && (
        <div className="mt-6">
          <ErrorCard code={stage.code} />
          {stage.retry !== null && (
            <button type="button" className={`mt-3 ${ds.button.secondary}`} onClick={() => setAttempt((n) => n + 1)}>
              {stage.retry}
            </button>
          )}
        </div>
      )}

      {ready && own && <ColumnsSection header={loaded.sheet.header} mapping={mapping} manual={manual} onPick={pickColumn} />}
      {ready && own && categoryColumn !== null && view.values.length > 0 && (
        <CategorySection
          title={loaded.sheet.header[categoryColumn] || XLSX.utils.encode_col(categoryColumn)}
          values={view.values}
          counts={view.values.map((value) => loaded.sheet.rows.filter((row) => cellText(row[categoryColumn]) === value).length)}
          defaults={view.defaults}
          chosen={view.categoryMap}
          categories={loaded.inventory.categories.map((category) => category.name)}
          onPick={(value, name) => setCategoryPick((prev) => ({ ...prev, [value]: name }))}
        />
      )}

      {ready && (
        <section className="mt-6" aria-labelledby="excel-preview-h">
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p id="excel-preview-h" className="text-small font-semibold text-ink">
              미리 보기
            </p>
            <div role="group" aria-label="보일 줄" className={FILTER_GROUP}>
              {(['all', ...FILTERS.filter((status) => status !== 'same' || view.sums.same > 0)] as Filter[]).map((key) => (
                <button
                  key={key}
                  type="button"
                  aria-pressed={filter === key}
                  className={`${FILTER_BUTTON} ${filter === key ? ds.segment.on : ds.segment.off}`}
                  onClick={() => setFilter(key)}
                >
                  {key === 'all' ? `모두 ${view.rows.length}` : `${STATUS[key].label} ${view.sums[key]}`}
                </button>
              ))}
            </div>
          </div>
          <PreviewTable rows={view.rows} notes={view.notes} filter={filter} />
          <p className="mt-2 pl-5 text-caption text-muted">굵은 글자 = 바뀌는 칸. 파일에 없는 물품은 그대로 둬요(지우지 않아요).</p>
          {insertError !== null && (
            <div className="mt-4">
              <ErrorCard code={insertError} />
            </div>
          )}
        </section>
      )}

      <div data-savebar className="sticky bottom-0 z-10 mt-4 border-t border-line bg-surface">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-3">
          <p className="text-small text-ink-2">
            {view !== null && ready && (
              <>
                <b className="font-semibold text-ink">{`새 물품 ${view.sums.new} · 고침 ${view.sums.update} · 건너뜀 ${view.sums.skip}`}</b>
                {view.sums.same > 0 ? ` · 그대로 ${view.sums.same}` : ''}
                {view.sums.skip > 0 ? ' · 건너뛴 줄은 고쳐서 다시 올리면 돼요' : ''}
              </>
            )}
          </p>
          <div className="flex items-center gap-2">
            <button type="button" className={ds.button.secondary} onClick={onCancel}>
              취소
            </button>
            {ready && (
              <button
                type="button"
                className={ds.button.primary}
                aria-disabled={canInsert ? undefined : true}
                aria-busy={importing ? true : undefined}
                onClick={() => void insert()}
              >
                {importing ? '넣는 중…' : '넣기'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

// AI가 맞춘 칸: 재고 탭 칸 여덟 → 엑셀 칸 고르기(4칸 그리드) + 넣지 않는 엑셀 칸.
// manual(개인정보 모양이라 보내지 않음)이면 제목은 '칸 맞춤'이고 칸을 직접 고르라는 안내 글이 붙는다(AC-7509.5)
function ColumnsSection({
  header,
  mapping,
  manual,
  onPick,
}: {
  header: readonly string[]
  mapping: ColumnMapping
  manual: boolean
  onPick: (field: Field, value: string) => void
}) {
  const used = new Set(FIELDS.map((field) => mapping[field]))
  const unused = header.map((_, i) => i).filter((i) => !used.has(i))
  return (
    <section className="mt-6" aria-labelledby="excel-columns-h">
      <p id="excel-columns-h" className="text-small font-semibold text-ink">
        {manual ? '칸 맞춤' : 'AI가 맞춘 칸'}
        <span className="ml-2 font-normal text-muted">왼쪽이 재고 탭 칸, 고른 것이 엑셀 칸이에요. 틀리면 바꿔요</span>
      </p>
      {manual && (
        <p className="mt-1.5 flex items-start gap-1.5 text-caption font-medium text-warning">
          <Icon name="alert" className="shrink-0" />
          <span>{PRIVATE_NOTE}</span>
        </p>
      )}
      <div className="mt-3 grid grid-cols-4 gap-x-6 gap-y-4">
        {FIELDS.map((field) => (
          <div key={field} className={ds.field}>
            <span className={ds.label}>
              {FIELD_LABELS[field]}
              {field === 'name' && <span className={ds.labelHint}>필수</span>}
            </span>
            <select
              aria-label={`${FIELD_LABELS[field]}에 넣을 엑셀 칸`}
              className={SELECT}
              value={mapping[field] === null ? '' : String(mapping[field])}
              onChange={(event) => onPick(field, event.target.value)}
            >
              <option value="">넣지 않음</option>
              {header.map((_, i) => (
                <option key={i} value={String(i)}>
                  {columnLabel(header, i)}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      {unused.length > 0 && <p className="mt-3 text-caption text-muted">{`넣지 않는 엑셀 칸: ${unused.map((i) => columnLabel(header, i)).join(' · ')}`}</p>}
    </section>
  )
}

// 분류 맞추기: 엑셀 분류 값 → 재고 탭 분류(지금 분류 또는 '+ 새 분류')
function CategorySection({
  title,
  values,
  counts,
  defaults,
  chosen,
  categories,
  onPick,
}: {
  title: string
  values: readonly string[]
  counts: readonly number[]
  defaults: Readonly<Record<string, string>>
  chosen: Readonly<Record<string, string>>
  categories: readonly string[]
  onPick: (value: string, name: string) => void
}) {
  return (
    <section className="mt-6" aria-labelledby="excel-categories-h">
      <p id="excel-categories-h" className="text-small font-semibold text-ink">
        분류 맞추기<span className="ml-2 font-normal text-muted">{`엑셀 '${title}' 값 → 재고 탭 분류`}</span>
      </p>
      <div className="mt-3 grid grid-cols-3 gap-x-6 gap-y-3">
        {values.map((value, i) => {
          // 새 분류 이름 = 이 값(20자). 같은 이름 분류가 있으면 새로 만들 것이 없다
          const fresh = defaultCategoryMap([value], [])[value]
          return (
            <div key={value} className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1.2fr)] items-center gap-2">
              <span className="min-w-0 text-small text-ink">
                {value}
                <span className="ml-1 text-muted">{`${counts[i]}줄`}</span>
              </span>
              <Icon name="arrow" size={14} className="text-muted" />
              <select aria-label={`엑셀 '${value}'을 넣을 분류`} className={SELECT} value={chosen[value] ?? defaults[value]} onChange={(event) => onPick(value, event.target.value)}>
                {categories.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
                {!categories.includes(fresh) && <option value={fresh}>{`+ 새 분류 '${fresh}'`}</option>}
              </select>
            </div>
          )
        })}
      </div>
    </section>
  )
}

function PreviewTable({ rows, notes, filter }: { rows: readonly PreviewRow[]; notes: readonly (Note | null)[]; filter: Filter }) {
  const shownRows = rows.map((row, i) => ({ row, note: notes[i] })).filter(({ row }) => filter === 'all' || row.status === filter)
  const numberHead = `${ds.table.th} text-right`
  return (
    <div className={`mt-3 ${ds.table.wrap}`}>
      <table className={ds.table.table}>
        <thead>
          <tr>
            <th className={numberHead}>엑셀 줄</th>
            <th className={ds.table.th}>상태</th>
            {FIELDS.map((field) => (
              <th key={field} className={NUMBER_FIELDS[field] === undefined ? ds.table.th : numberHead}>
                {FIELD_LABELS[field]}
              </th>
            ))}
            <th className={ds.table.th}>바뀐 것 · 살펴볼 것</th>
          </tr>
        </thead>
        <tbody>
          {shownRows.length === 0 ? (
            <tr>
              <td colSpan={FIELDS.length + 3} className={ds.table.emptyRow}>
                이 상태인 줄이 없어요.
              </td>
            </tr>
          ) : (
            shownRows.map(({ row, note }) => <PreviewLine key={row.row} row={row} note={note} />)
          )}
        </tbody>
      </table>
    </div>
  )
}

function PreviewLine({ row, note }: { row: PreviewRow; note: Note | null }) {
  const off = row.status === 'skip'
  const tone = (sub: boolean) => (off ? '' : sub ? 'text-ink-2' : 'text-ink')
  const cellClass = (field: Field) => {
    if (NUMBER_FIELDS[field] !== undefined) return `${CELL} text-right tabular-nums ${tone(false)}`
    if (field === 'name') return `${CELL} ${off ? 'font-normal' : 'font-medium text-ink'}`
    return `${CELL} ${tone(true)}`
  }
  return (
    <tr className={off ? `${ds.table.row} text-muted` : ds.table.row}>
      <td className={`${CELL} text-right tabular-nums text-muted`}>{row.row}</td>
      <td className={CELL}>
        <span className={STATUS[row.status].chip}>{STATUS[row.status].label}</span>
      </td>
      {FIELDS.map((field) => {
        const value = shown(field, row.values[field])
        return (
          <td key={field} className={cellClass(field)}>
            {value === '' ? (
              <span className="text-muted">–</span>
            ) : row.changed.includes(field) ? (
              <span className="font-semibold text-ink">{value}</span>
            ) : (
              value
            )}
          </td>
        )
      })}
      <td className={`${NOTE_CELL} ${note?.tone === 'info' ? 'text-muted' : 'text-ink-2'}`}>
        {note === null ? null : note.tone === 'error' ? (
          <span className="inline-flex items-start gap-1 text-caption font-medium text-negative">
            <Icon name="alert" size={14} className="mt-px shrink-0" />
            {note.text}
          </span>
        ) : (
          note.text
        )}
      </td>
    </tr>
  )
}
