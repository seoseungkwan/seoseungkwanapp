'use client'

import { useId, useRef, useState, type MouseEvent, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import { parseWon } from '@/lib/sunap/ledger'
import { sortLedger, type LedgerSort } from '@/lib/sunap/ledgerSort'
import type { LedgerEditedField, LedgerRow, SunapTotals } from '@/types/sunap'
import { RSV_LABEL, VISIT_LABEL, WON_PROBLEM, cellWon, chipLine, chipTeal, rsvDay, won, type LedgerPatch } from '../labels'
import { Pop, PopHead, anchorOf, type Anchor } from './Pop'
import { RsvPicker } from './RsvPicker'
import { SortMenu } from './SortMenu'
import { PanelHead, TABLE, TD, TD_INK, TD_MID, TD_MUTED, TD_NUM, TF, TF_MID, TF_NUM, TH, TH_MID, TH_NUM } from './parts'

// 수납일지 환자 장부(spec sunap-ilji AC-4905.1·4905.2·4905.3, 시안 ledgerPanel) [장부 줄 화면 울타리 안].
// 줄(이름·차트번호·금액·고친 칸)은 props로만 받고, 고친 값은 onEdit(차트, 바꾼 칸)으로만 넘긴다. 네트워크·저장소·통로는 쓰지 않는다(eslint).
// 시안과 다른 곳(design.md): 원장님 칸이 없다. 금액 칸을 누르면 네 금액 칸 판이 뜬다(FREE 한 칸도 같다) — 고친 칸 옆에 [비트 값으로 되돌리기].
// Block·물리치료는 누르면 바로 바뀐다(다시 누르면 비트 값과 같아져 고친 칸에서 빠진다). 마감한 날(editable 거짓)은 값만 보인다.
// 줄 세우기(spec sunap-sort REQ-5302, 시안 docs/mockups/sunap-sort): 거르기·찾기 뒤의 줄을 sortLedger로 세운다(NO는 접수 번호 그대로).
// 세운 상태는 이 화면 안에만 있다(저장하지 않음 — 다시 열면 접수 순). 마감한 날에도 세울 수 있다

type Filter = 'all' | 'new' | 'd90' | 'block' | 'unknown' | 'edited'
type Dir = 'asc' | 'desc'
type ColumnKey = Exclude<LedgerSort['key'], 'rsv'>
type AmountField = Extract<LedgerEditedField, 'cash' | 'card' | 'transfer' | 'unpaid'>
type Open = { chart: string; what: 'amount' | 'note' | 'rsv'; field: AmountField; anchor: Anchor }

const AMOUNT_FIELDS: { field: AmountField; label: string }[] = [
  { field: 'cash', label: '현금' },
  { field: 'card', label: '카드' },
  { field: 'transfer', label: '계좌' },
  { field: 'unpaid', label: '미수' },
]
const FILTERS: { key: Filter; label: string; test(row: LedgerRow): boolean }[] = [
  { key: 'all', label: '전체', test: () => true },
  { key: 'new', label: '초진', test: (row) => row.kind === 'new' },
  { key: 'd90', label: '90일초진', test: (row) => row.kind === 'd90' },
  { key: 'block', label: 'Block', test: (row) => row.block },
  { key: 'unknown', label: '예약 종류 모름', test: (row) => row.rsv.kind === 'unknown' },
  { key: 'edited', label: '고친 칸 있는 줄', test: (row) => row.edited.length > 0 },
]
const NOTE_MAX = 100
// 세우는 칸 이름(제목·표 위 한 줄)
const SORT_COLUMNS: Record<ColumnKey, string> = {
  name: '이름',
  kind: '구분',
  cash: '현금',
  card: '카드',
  transfer: '계좌',
  unpaid: '미수',
  block: 'Block',
  pt: '물리치료',
}
const SORT_HINT = '제목(이름·구분·금액·Block·물리치료·다음 예약)을 누르면 줄을 세워요'

// 누를 수 있는 칸 안의 단추: 칸 전체를 채우고 올림에 accent-soft(시안 td.cell:hover)
const CELL_BUTTON = `flex h-10 w-full cursor-pointer items-center ${ds.focusRing} hover:bg-accent-soft`
// 고친 칸: 옅은 노랑 + 오른쪽 위 세모(시안 td.edited)
const EDITED = 'relative bg-warning-soft'

function EditedMark() {
  return (
    <>
      <span aria-hidden="true" className="absolute top-0 right-0 size-0 border-t-8 border-l-8 border-t-warning border-l-transparent" />
      <span className="sr-only">고친 칸</span>
    </>
  )
}

function KindChip({ kind }: { kind: LedgerRow['kind'] }) {
  if (kind === 'new') return <span className={ds.chip.accent}>{VISIT_LABEL.new}</span>
  if (kind === 'd90') return <span className={chipTeal}>{VISIT_LABEL.d90}</span>
  return <span className={chipLine}>{VISIT_LABEL.re}</span>
}

const SRC = 'rounded-control px-1 text-caption font-semibold'

/** 다음 예약 칸 안(시안 rsvCell). 마감한 날은 ▾가 없다 */
function RsvView({ row, caret }: { row: LedgerRow; caret: boolean }) {
  const { kind, source, at } = row.rsv
  const day = rsvDay(at)
  const src =
    source === 'hand' ? <span className={`${SRC} bg-accent text-surface`}>직접</span> : <span className={`${SRC} border border-line bg-canvas text-muted`}>비트</span>
  let body: ReactNode
  if (kind === 'none') {
    body = (
      <>
        <span className="text-muted">{RSV_LABEL.none}</span>
        {source === 'hand' && src}
      </>
    )
  } else {
    const chip = kind === 'unknown' ? ds.chip.warning : kind === 'inj' ? ds.chip.accent : kind === 'visit' ? chipTeal : ds.chip.neutral
    body = (
      <>
        <span className={chip}>{RSV_LABEL[kind]}</span>
        {day !== '' && <span className="text-caption text-muted tabular-nums">{day}</span>}
        {src}
      </>
    )
  }
  return (
    <span className="flex w-full items-center gap-1.5">
      {body}
      {caret && (
        <span aria-hidden="true" className="ml-auto text-caption text-muted">
          ▾
        </span>
      )}
    </span>
  )
}

function CheckBox({ on, teal, label, editable, onToggle }: { on: boolean; teal?: boolean; label: string; editable: boolean; onToggle(): void }) {
  const tone = on ? (teal ? 'border-cat-2 bg-cat-2' : 'border-accent bg-accent') : 'border-line-strong bg-surface'
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={on}
      aria-label={label}
      disabled={!editable}
      onClick={onToggle}
      className={`inline-grid size-4.5 place-items-center rounded-control border-[1.5px] align-middle ${tone} ${ds.focusRing} enabled:cursor-pointer`}
    >
      {on && (
        <svg aria-hidden="true" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-surface">
          <path d="M2.5 6.2 5 8.5l4.5-5" />
        </svg>
      )}
    </button>
  )
}

// 제목 단추(시안 th button.sort): 글자 + 화살표(▲ 오름차순 · ▼ 내림차순 · ↕ 접수 순). 세운 칸은 글자 ink·화살표 accent, 올림 ink
const SORT_BUTTON = `inline-flex cursor-pointer items-center gap-1 rounded-control hover:text-ink ${ds.focusRing}`
const arrowOf = (dir: Dir | null) => (dir === null ? '↕' : dir === 'asc' ? '▲' : '▼')
const ariaSort = (dir: Dir | null) => (dir === null ? 'none' : dir === 'asc' ? 'ascending' : 'descending')

function SortMark({ dir, children }: { dir: Dir | null; children: string }) {
  return (
    <span aria-hidden="true" className={`w-3 text-center text-caption ${dir === null ? 'text-muted' : 'text-accent'}`}>
      {children}
    </span>
  )
}

/** 누를 때마다 오름차순 → 내림차순 → 접수 순인 제목 칸. 숫자 칸은 화살표가 글자 왼쪽(시안) */
function SortHead({ label, dir, className, markFirst, onClick }: { label: string; dir: Dir | null; className: string; markFirst?: boolean; onClick(): void }) {
  const mark = <SortMark dir={dir}>{arrowOf(dir)}</SortMark>
  return (
    <th className={className} aria-sort={ariaSort(dir)}>
      <button type="button" className={`${SORT_BUTTON} ${dir === null ? '' : 'text-ink'}`} onClick={onClick}>
        {markFirst && mark}
        {label}
        {!markFirst && mark}
      </button>
    </th>
  )
}

/** 표 위 한 줄(시안 .sortnote): 지금 세운 기준과 다음에 누르면 어떻게 되는지 */
function SortNote({ sort }: { sort: LedgerSort | null }) {
  let strong = ''
  let rest = SORT_HINT
  if (sort !== null && sort.key === 'rsv') {
    strong = `다음 예약 ${sort.by === 'date' ? '날짜' : '종류'} 순 ${arrowOf(sort.dir)}`
    rest = " · '예약 안 하고 가심'은 늘 맨 뒤 · 제목을 눌러 다른 기준·접수 순"
  } else if (sort !== null) {
    strong = `${SORT_COLUMNS[sort.key]} ${sort.dir === 'asc' ? '오름차순' : '내림차순'}`
    rest = ` · 한 번 더 누르면 ${sort.dir === 'asc' ? '내림차순' : '접수 순'}`
  }
  return (
    <p aria-live="polite" className="px-5 py-2 text-caption text-muted max-md:px-4">
      {strong !== '' && <b className="font-semibold text-ink">{strong}</b>}
      {rest}
    </p>
  )
}

/** 금액 네 칸 판. 바꾼 칸만 넘긴다. 틀린 금액이 있으면 넘기지 않는다 */
function AmountPop({ row, focus, anchor, onEdit, onClose }: { row: LedgerRow; focus: AmountField; anchor: Anchor; onEdit(patch: LedgerPatch): void; onClose(): void }) {
  const titleId = useId()
  const [texts, setTexts] = useState(() => Object.fromEntries(AMOUNT_FIELDS.map(({ field }) => [field, cellWon(row[field])])) as Record<AmountField, string>)
  const [wrong, setWrong] = useState<AmountField[]>([])

  function save() {
    const patch: Partial<Record<AmountField, number>> = {}
    const bad: AmountField[] = []
    for (const { field } of AMOUNT_FIELDS) {
      const value = parseWon(texts[field])
      if (value === 'invalid') bad.push(field)
      else if (value !== row[field]) patch[field] = value
    }
    setWrong(bad)
    if (bad.length > 0) return
    if (Object.keys(patch).length > 0) onEdit(patch)
    onClose()
  }

  return (
    <Pop anchor={anchor} titleId={titleId} onClose={onClose}>
      <PopHead id={titleId} title={`금액 · ${row.name}`} who={`${row.chart} · ${VISIT_LABEL[row.kind]}`} />
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          save()
        }}
      >
        {AMOUNT_FIELDS.map(({ field, label }) => {
          const id = `${titleId}-${field}`
          return (
            <div key={field} className="flex items-center gap-2">
              <label htmlFor={id} className="w-10 shrink-0 text-small font-medium text-ink-2">
                {label}
              </label>
              <input
                id={id}
                type="text"
                inputMode="numeric"
                autoComplete="off"
                autoFocus={field === focus}
                value={texts[field]}
                aria-invalid={wrong.includes(field) || undefined}
                onChange={(event) => setTexts((prev) => ({ ...prev, [field]: event.target.value }))}
                className={`${ds.input} h-9! text-right tabular-nums`}
              />
              {row.edited.includes(field) && (
                <button
                  type="button"
                  aria-label={`${label} 비트 값으로 되돌리기`}
                  className={`${ds.textButton} shrink-0 text-small!`}
                  onClick={() => {
                    onEdit({ revert: field })
                    onClose()
                  }}
                >
                  비트 값으로 되돌리기
                </button>
              )}
            </div>
          )
        })}
        {wrong.length > 0 && <p className={ds.fieldError}>{WON_PROBLEM}</p>}
        <div className="flex justify-end gap-2">
          <button type="button" className={ds.button.secondarySmall} onClick={onClose}>
            닫기
          </button>
          <button type="submit" className={ds.button.primarySmall}>
            저장
          </button>
        </div>
      </form>
    </Pop>
  )
}

/** 비고 판(100자까지). 빈 글로 저장하면 비고를 지운다 */
function NotePop({ row, anchor, onEdit, onClose }: { row: LedgerRow; anchor: Anchor; onEdit(patch: LedgerPatch): void; onClose(): void }) {
  const titleId = useId()
  const [text, setText] = useState(row.note)
  return (
    <Pop anchor={anchor} titleId={titleId} onClose={onClose}>
      <PopHead id={titleId} title={`비고 · ${row.name}`} who={`${row.chart} · ${VISIT_LABEL[row.kind]}`} />
      <form
        className="grid gap-2"
        onSubmit={(event) => {
          event.preventDefault()
          if (text.trim() !== row.note) onEdit({ note: text.trim() })
          onClose()
        }}
      >
        <label htmlFor={`${titleId}-note`} className="sr-only">
          비고
        </label>
        <input
          id={`${titleId}-note`}
          type="text"
          autoComplete="off"
          autoFocus
          maxLength={NOTE_MAX}
          value={text}
          onChange={(event) => setText(event.target.value)}
          className={`${ds.input} h-9!`}
        />
        <div className="flex justify-end gap-2">
          <button type="button" className={ds.button.secondarySmall} onClick={onClose}>
            닫기
          </button>
          <button type="submit" className={ds.button.primarySmall}>
            저장
          </button>
        </div>
      </form>
    </Pop>
  )
}

export function LedgerRows({
  rows,
  totals,
  editable,
  closed,
  onEdit,
}: {
  rows: readonly LedgerRow[]
  totals: SunapTotals
  editable: boolean
  /** 마감한 날(못 고치는 까닭이 마감일 때만 마감 안내를 띄운다. 불러오는 중·마감하는 중은 잠깐 막기만) */
  closed: boolean
  onEdit(chart: string, patch: LedgerPatch): void
}) {
  const [filter, setFilter] = useState<Filter>('all')
  const [query, setQuery] = useState('')
  const [open, setOpen] = useState<Open | null>(null)
  const [sort, setSort] = useState<LedgerSort | null>(null)
  // 다음 예약 세우는 기준 목록이 뜬 자리(닫혀 있으면 null)
  const [menu, setMenu] = useState<Anchor | null>(null)
  const rsvHead = useRef<HTMLButtonElement>(null)
  const rsvHeadId = useId()
  const menuId = useId()

  const test = FILTERS.find(({ key }) => key === filter)!.test
  const words = query.trim()
  const shown = sortLedger(
    rows
      .map((row, index) => ({ row, no: index + 1 }))
      .filter(({ row }) => test(row) && (words === '' || row.name.includes(words) || row.chart.includes(words))),
    sort,
  )
  const dirOf = (key: LedgerSort['key']): Dir | null => (sort !== null && sort.key === key ? sort.dir : null)
  const rsvSort = sort !== null && sort.key === 'rsv' ? sort : null
  // 다른 칸 → 오름차순, 오름차순 → 내림차순, 내림차순 → 접수 순
  const cycle = (key: ColumnKey) => {
    const dir = dirOf(key)
    setSort(dir === null ? { key, dir: 'asc' } : dir === 'asc' ? { key, dir: 'desc' } : null)
  }
  const column = (key: ColumnKey, className: string, markFirst = false) => (
    <SortHead label={SORT_COLUMNS[key]} dir={dirOf(key)} className={className} markFirst={markFirst} onClick={() => cycle(key)} />
  )
  const openRow = editable && open !== null ? rows.find((row) => row.chart === open.chart) : undefined
  const booked = rows.filter((row) => row.rsv.kind !== 'none').length

  const openAt = (chart: string, what: Open['what'], field: AmountField = 'cash') => (event: MouseEvent<HTMLElement>) =>
    setOpen({ chart, what, field, anchor: anchorOf(event.currentTarget) })
  const close = () => setOpen(null)
  const edit = (chart: string) => (patch: LedgerPatch) => onEdit(chart, patch)

  function moneyCell(row: LedgerRow, field: AmountField, label: string) {
    const edited = row.edited.includes(field)
    const tone = field === 'unpaid' ? 'text-negative' : 'text-ink'
    return (
      <td key={field} className={`${TD_NUM} ${edited ? EDITED : ''} ${editable ? 'p-0!' : ''}`}>
        {editable ? (
          <button type="button" aria-label={`${row.name} ${label}`} className={`${CELL_BUTTON} justify-end px-3 ${tone}`} onClick={openAt(row.chart, 'amount', field)}>
            {cellWon(row[field])}
          </button>
        ) : (
          <span className={tone}>{cellWon(row[field])}</span>
        )}
        {edited && <EditedMark />}
      </td>
    )
  }

  return (
    <section aria-labelledby="sunap-ledger-title" className="min-w-0 rounded-control border border-line bg-surface">
      <PanelHead id="sunap-ledger-title" title="환자 장부" hint={closed ? '마감한 날이라 고칠 수 없어요' : '칸을 누르면 고칠 수 있어요'}>
        <span className="flex-1 max-md:hidden" />
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map(({ key, label, test: match }) => {
            const on = filter === key
            return (
              <button
                key={key}
                type="button"
                aria-pressed={on}
                onClick={() => setFilter(key)}
                className={`inline-flex h-7 cursor-pointer items-center gap-1 rounded-control border px-3 text-caption ${ds.focusRing} ${
                  on ? 'border-ink bg-ink text-surface' : 'border-line-strong bg-surface text-ink-2 hover:bg-canvas'
                }`}
              >
                {label} <b className="font-semibold">{rows.filter(match).length}</b>
              </button>
            )
          })}
        </div>
        <input
          type="search"
          aria-label="이름·차트번호 찾기"
          placeholder="이름·차트번호 찾기"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${ds.input} h-8! w-45 text-small! max-md:w-full`}
        />
      </PanelHead>
      <SortNote sort={sort} />
      <div className="overflow-x-auto">
        <table className={`${TABLE} min-w-260`}>
          <thead>
            <tr>
              <th className={TH}>NO</th>
              <th className={TH}>접수</th>
              <th className={TH}>차트</th>
              {column('name', TH)}
              {column('kind', TH)}
              {column('cash', TH_NUM, true)}
              {column('card', TH_NUM, true)}
              {column('transfer', TH_NUM, true)}
              {column('unpaid', TH_NUM, true)}
              {column('block', TH_MID)}
              {column('pt', TH_MID)}
              <th className={TH} aria-sort={ariaSort(dirOf('rsv'))}>
                {/* 누르면 세우는 기준 목록(SortMenu)이 열리고 닫힌다 */}
                <button
                  ref={rsvHead}
                  id={rsvHeadId}
                  type="button"
                  aria-haspopup="menu"
                  aria-expanded={menu !== null}
                  aria-controls={menu !== null ? menuId : undefined}
                  className={`${SORT_BUTTON} ${rsvSort === null ? '' : 'text-ink'}`}
                  onClick={(event) => setMenu(menu === null ? anchorOf(event.currentTarget) : null)}
                >
                  {rsvSort === null ? '다음 예약' : `다음 예약 · ${rsvSort.by === 'date' ? '날짜' : '종류'}`}
                  <SortMark dir={dirOf('rsv')}>{arrowOf(dirOf('rsv'))}</SortMark>
                  <SortMark dir={dirOf('rsv')}>▾</SortMark>
                </button>
              </th>
              <th className={TH}>비고</th>
            </tr>
          </thead>
          <tbody>
            {shown.map(({ row, no }) => {
              // 고친 금액 칸이 있으면 FREE 줄도 네 칸으로 그린다(고친 칸 표시가 보이게)
              const free = row.free && !row.edited.some((field) => AMOUNT_FIELDS.some((a) => a.field === field))
              return (
                <tr key={row.chart} className={open?.chart === row.chart ? 'bg-accent-soft' : undefined}>
                  <td className={`${TD_MUTED} tabular-nums`}>{no}</td>
                  <td className={`${TD} tabular-nums`}>{row.time}</td>
                  <td className={`${TD_MUTED} tabular-nums`}>{row.chart}</td>
                  <td className={`${TD_INK} font-semibold`}>{row.name}</td>
                  <td className={TD}>
                    <KindChip kind={row.kind} />
                  </td>
                  {free ? (
                    <td colSpan={4} className={`${TD_MID} ${editable ? 'p-0!' : ''}`}>
                      {editable ? (
                        <button type="button" aria-label={`${row.name} 금액`} className={`${CELL_BUTTON} justify-center px-3`} onClick={openAt(row.chart, 'amount')}>
                          <span className={ds.chip.neutral}>FREE · 0원</span>
                        </button>
                      ) : (
                        <span className={ds.chip.neutral}>FREE · 0원</span>
                      )}
                    </td>
                  ) : (
                    AMOUNT_FIELDS.map(({ field, label }) => moneyCell(row, field, label))
                  )}
                  <td className={`${TD_MID} ${row.edited.includes('block') ? EDITED : ''}`}>
                    <CheckBox on={row.block} label={`${row.name} Block`} editable={editable} onToggle={() => onEdit(row.chart, { block: !row.block })} />
                    {row.edited.includes('block') && <EditedMark />}
                  </td>
                  <td className={`${TD_MID} ${row.edited.includes('pt') ? EDITED : ''}`}>
                    <CheckBox on={row.pt} teal label={`${row.name} 물리치료`} editable={editable} onToggle={() => onEdit(row.chart, { pt: !row.pt })} />
                    {row.edited.includes('pt') && <EditedMark />}
                  </td>
                  <td className={`${TD} min-w-52 ${editable ? 'p-0!' : ''}`}>
                    {editable ? (
                      <button type="button" aria-label={`${row.name} 다음 예약`} className={`${CELL_BUTTON} px-3`} onClick={openAt(row.chart, 'rsv')}>
                        <RsvView row={row} caret />
                      </button>
                    ) : (
                      <RsvView row={row} caret={false} />
                    )}
                  </td>
                  <td className={`${TD} ${editable ? 'p-0!' : ''}`}>
                    {editable ? (
                      <button type="button" aria-label={`${row.name} 비고`} className={`${CELL_BUTTON} px-3`} onClick={openAt(row.chart, 'note')}>
                        <span className={`max-w-55 overflow-clip text-ellipsis ${row.note ? 'text-ink-2' : 'text-muted'}`}>{row.note || '–'}</span>
                      </button>
                    ) : (
                      <span className={`block max-w-55 overflow-clip text-ellipsis ${row.note ? 'text-ink-2' : 'text-muted'}`}>{row.note || '–'}</span>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className={TF}>{`합계 · ${totals.visits}명`}</td>
              <td className={TF_NUM}>{cellWon(totals.cash_won)}</td>
              <td className={TF_NUM}>{cellWon(totals.card_won)}</td>
              <td className={TF_NUM}>{cellWon(totals.transfer_won)}</td>
              <td className={`${TF_NUM} text-negative`}>{cellWon(totals.unpaid_won)}</td>
              <td className={TF_MID}>{won(totals.block_n)}</td>
              <td className={TF_MID}>{won(totals.pt_n)}</td>
              <td className={TF}>{`예약 ${booked}명`}</td>
              <td className={TF} />
            </tr>
          </tfoot>
        </table>
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 border-t border-line px-5 py-3 text-caption text-muted max-md:px-4">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden="true" className="relative inline-block size-3.5 border border-line bg-warning-soft">
            <span className="absolute top-0 right-0 size-0 border-t-6 border-l-6 border-t-warning border-l-transparent" />
          </span>
          직원이 고친 칸(비트 값과 다름) — 눌러서 [비트 값으로 되돌리기]
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`${SRC} border border-line bg-canvas text-muted`}>비트</span>
          <span>비트 예약 메모로 정한 종류</span>
        </span>
        <span className="inline-flex items-center gap-1">
          <span className={`${SRC} bg-accent text-surface`}>직접</span>
          <span>직원이 고른 예약</span>
        </span>
        <span>FREE = 그날 낸 돈 0원</span>
      </div>
      {openRow && open?.what === 'amount' && <AmountPop row={openRow} focus={open.field} anchor={open.anchor} onEdit={edit(openRow.chart)} onClose={close} />}
      {openRow && open?.what === 'note' && <NotePop row={openRow} anchor={open.anchor} onEdit={edit(openRow.chart)} onClose={close} />}
      {openRow && open?.what === 'rsv' && <RsvPicker row={openRow} anchor={open.anchor} onPick={edit(openRow.chart)} onClose={close} />}
      {menu !== null && (
        <SortMenu
          id={menuId}
          labelledBy={rsvHeadId}
          anchor={menu}
          current={rsvSort === null ? null : { by: rsvSort.by, dir: rsvSort.dir }}
          trigger={rsvHead}
          onPick={(pick) => {
            setSort(pick === null ? null : { key: 'rsv', ...pick })
            setMenu(null)
          }}
          onClose={() => setMenu(null)}
        />
      )}
    </section>
  )
}
