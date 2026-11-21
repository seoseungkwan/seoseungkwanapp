'use client'

import { useEffect, useId, useState, type ReactNode } from 'react'
import { formatCount } from '@/components/charts/format'
import { ErrorCard } from '@/components/common/ErrorCard'
import { Icon } from '@/components/common/Icon'
import { formatWon } from '@/components/revenue/money'
import { ds } from '@/components/ui/classes'
import { addDays, addMonths, compareYmd, monthOf, monthRange } from '@/lib/analytics/dates'
import { monthlyReport, usageIntervals, type MonthlyReport, type MonthlyRow } from '@/lib/inventory/usage'
import { listCountLines, listReceiptLines, loadInventory } from '@/lib/storage/inventory'
import type { InvCategory, InvCountLine, InvInventory, InvItem, InvRange, InvReceiptLine } from '@/types/inventory'

// 달별 도구 (spec inventory REQ-7510 AC-7510.1·AC-7510.2, design.md 2·6절, 시안 docs/mockups/inventory ?s=month).
// ◀ yyyy년 m월 ▶(이번 달이 기본, 이번 달보다 뒤로는 못 감). 고른 달 첫날 − 1달 − 35일 ~ 그 달 끝의 세기·입고 줄과 물품을 스스로 읽어
// monthlyReport로 그린다(35일 = 지난달 첫 세기 앞 세기까지). 그 달에 끝난 세기 날짜 → 숫자 세 칸(구입비·들어온 기록·세기) →
// 두 표(분류별 구입비 | 물품별 쓴 양·구입비). 1280px 아래(작은 PC 화면)는 두 표가 위아래로, 표는 제 상자 안에서 옆으로 밀린다.
// 증감은 좋고 나쁨이 없어 색 없이 ink-2 화살표 + 글(읽기 글 늘어남·줄어듦), '새로 생김'·'–'·'변화 없음'은 muted 글만.
// 금액은 원 단위 정수(formatWon), 0원은 표 칸에서 '–'(분류 머리 줄·합계 줄은 "0원")

type Loaded = { inventory: InvInventory; counts: InvCountLine[]; receipts: InvReceiptLine[] }
type Held = { key: string; value: Loaded | 'failed' }
type Report = MonthlyReport<InvItem, InvCategory>

const MINUS = '−'
const HOW = `쓴 양 = 지난 세기 + 그 사이 들어온 것 ${MINUS} 이번 세기. 그 달에 끝난 주를 더해요(달을 걸친 주는 끝난 날의 달). 구입비 = 그 달 들어온 기록 금액의 합.`
const LOOK_BACK_DAYS = 35

const monthNo = (month: string) => Number(month.slice(5, 7))
const monthTitle = (month: string) => `${month.slice(0, 4)}년 ${monthNo(month)}월`
const dayNo = (ymd: string) => Number(ymd.slice(8, 10))
const monthDay = (ymd: string) => `${monthNo(ymd)}월 ${dayNo(ymd)}일`

/** 고른 달 첫날 − 1달 − 35일 ~ 그 달 끝 */
function readRange(month: string): InvRange {
  return { from: addDays(`${addMonths(month, -1)}-01`, -LOOK_BACK_DAYS), to: monthRange(month).to }
}

async function read(month: string): Promise<Loaded | 'failed'> {
  const span = readRange(month)
  const [inventory, counts, receipts] = await Promise.all([loadInventory(), listCountLines(span), listReceiptLines(span)])
  if (inventory === 'failed' || counts === 'failed' || receipts === 'failed') return 'failed'
  return { inventory, counts, receipts }
}

// ── 표 칸 모양 ──────────────────────────────────────────

const TH_NUM = `${ds.table.th} text-right`
const TD_NAME = `${ds.table.td} font-medium`
const TD_SUB_NUM = `${ds.table.tdSub} text-right tabular-nums`
const ITEM_ROW = 'hover:bg-canvas'
// 합계 줄: 600, 위 1px line-strong
const TOTAL = 'h-11 whitespace-nowrap border-t border-t-line-strong px-3 font-semibold text-ink first:pl-5 last:pr-5'
const TOTAL_NUM = `${TOTAL} text-right tabular-nums`
// 분류 머리 줄(물품별 표): 600 ink, 위 12px 띄우고 아래에 붙임. 첫 분류는 띄움 없이 32px
const GROUP = 'h-11 whitespace-nowrap border-b border-line px-3 pt-3 align-bottom text-left font-semibold text-ink first:pl-5 last:pr-5'
const GROUP_FIRST = 'h-8 whitespace-nowrap border-b border-line px-3 pt-0 align-bottom text-left font-semibold text-ink first:pl-5 last:pr-5'
const GROUP_NUM = 'h-11 whitespace-nowrap border-b border-line px-3 pt-3 align-bottom text-right font-semibold tabular-nums text-ink first:pl-5 last:pr-5'
const GROUP_NUM_FIRST = 'h-8 whitespace-nowrap border-b border-line px-3 pt-0 align-bottom text-right font-semibold tabular-nums text-ink first:pl-5 last:pr-5'
const GROUP_PREV = 'h-11 whitespace-nowrap border-b border-line px-3 pt-3 align-bottom text-right font-medium tabular-nums text-ink-2 first:pl-5 last:pr-5'
const GROUP_PREV_FIRST = 'h-8 whitespace-nowrap border-b border-line px-3 pt-0 align-bottom text-right font-medium tabular-nums text-ink-2 first:pl-5 last:pr-5'

function Dash() {
  return <span className="text-muted">–</span>
}

/** 표 칸 금액: 0이면 '–' */
function Money({ won }: { won: number }) {
  return won === 0 ? <Dash /> : <>{formatWon(won)}</>
}

/** 증감 글(changeText): '+…'·'−…'만 화살표 + 읽기 글, 나머지는 muted 글. 색으로 좋고 나쁨을 가르지 않는다 */
function Change({ text }: { text: string }) {
  const up = text.startsWith('+')
  const down = text.startsWith(MINUS)
  if (!up && !down) return <span className="text-muted">{text}</span>
  return (
    <span className="inline-flex items-center gap-0.5 tabular-nums text-ink-2">
      <Icon name="chev" size={14} className={up ? 'rotate-180' : undefined} />
      {text}
      <span className="sr-only">{up ? '늘어남' : '줄어듦'}</span>
    </span>
  )
}

// ── 머리: 제목 · 달 고르기 ───────────────────────────────

const STEP = `${ds.button.secondary} w-8 px-0!`

function MonthHead({ month, canNext, onMonth }: { month: string; canNext: boolean; onMonth: (month: string) => void }) {
  const prev = addMonths(month, -1)
  const next = addMonths(month, 1)
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div>
        <h2 className="text-subtitle font-semibold text-ink">달별</h2>
        <p className="mt-0.5 max-w-168 text-small text-muted">{HOW}</p>
      </div>
      <div role="group" aria-label="달 고르기" className="flex items-center gap-1">
        <button type="button" aria-label={`${monthNo(prev)}월`} className={STEP} onClick={() => onMonth(prev)}>
          <Icon name="chev" className="rotate-90" />
        </button>
        <output aria-live="polite" className="min-w-28 text-center text-subtitle font-semibold whitespace-nowrap text-ink tabular-nums">
          {monthTitle(month)}
        </output>
        <button type="button" aria-label={`${monthNo(next)}월`} disabled={!canNext} className={STEP} onClick={() => onMonth(next)}>
          <Icon name="chev" className="-rotate-90" />
        </button>
      </div>
    </div>
  )
}

// ── 보고 ─────────────────────────────────────────────────

/** "11월에 끝난 세기 2번: 11월 7일 · 14일 (10월 31일 ~ 11월 14일에 쓴 양)" — 세기가 없으면 '이 달에 끝난 세기가 없어요' */
function countLine(month: string, report: Report, data: Loaded): string {
  const days = report.countDays
  if (days.length === 0) return '이 달에 끝난 세기가 없어요'
  const list = days.map((day, index) => (index === 0 ? monthDay(day) : `${dayNo(day)}일`)).join(' · ')
  const head = `${monthNo(month)}월에 끝난 세기 ${days.length}번: ${list}`
  const spans = usageIntervals(data.counts, data.receipts).filter((iv) => iv.month === month)
  if (spans.length === 0) return head
  const from = spans.map((iv) => iv.from).reduce((a, b) => (compareYmd(a, b) <= 0 ? a : b))
  const to = spans.map((iv) => iv.to).reduce((a, b) => (compareYmd(a, b) >= 0 ? a : b))
  return `${head} (${monthDay(from)} ~ ${monthDay(to)}에 쓴 양)`
}

function Tile({ name, value, unit, children }: { name: string; value: number; unit: string; children: ReactNode }) {
  return (
    <li className="min-w-0 border-line px-5 py-4 first:pl-0 not-first:border-l">
      <p className="text-small text-muted">{name}</p>
      <p className="mt-1 text-metric font-semibold text-ink tabular-nums">
        {formatCount(value)}
        <small className="ml-0.5 text-subtitle font-medium tracking-normal text-ink-2">{unit}</small>
      </p>
      <p className="mt-1 text-small text-ink-2">{children}</p>
    </li>
  )
}

function Tiles({ month, report, prevReport }: { month: string; report: Report; prevReport: Report }) {
  const m = monthNo(month)
  const pm = monthNo(addMonths(month, -1))
  const missing = report.rows.filter((row) => row.missing).length
  return (
    <ul aria-label={`${m}월 숫자`} className="mt-4 grid max-w-210 list-none grid-cols-3 border-y border-line">
      <Tile name={`${m}월 구입비`} value={report.numbers.cost} unit="원">
        {`${pm}월 ${formatWon(report.total.prevCost)} · `}
        <Change text={report.total.change} />
      </Tile>
      <Tile name="들어온 기록" value={report.numbers.receipts} unit="건">
        {`${pm}월 ${formatCount(prevReport.numbers.receipts)}건`}
      </Tile>
      <Tile name="세기" value={report.numbers.counts} unit="번">
        {missing === 0 ? '빠진 입고 없음' : `빠진 입고 ${formatCount(missing)}개`}
      </Tile>
    </ul>
  )
}

function CategoryTable({ month, report, labelId }: { month: string; report: Report; labelId: string }) {
  const m = monthNo(month)
  const pm = monthNo(addMonths(month, -1))
  return (
    <div className={`mt-3 ${ds.table.wrap}`}>
      <table aria-labelledby={labelId} className={ds.table.table}>
        <thead>
          <tr>
            <th scope="col" className={ds.table.th}>
              분류
            </th>
            <th scope="col" className={TH_NUM}>{`${m}월 구입비`}</th>
            <th scope="col" className={TH_NUM}>{`${pm}월`}</th>
            <th scope="col" className={ds.table.th}>
              지난달보다
            </th>
          </tr>
        </thead>
        <tbody>
          {report.categories.map((row) => (
            <tr key={row.category.id} className={ds.table.row}>
              <td className={TD_NAME}>{row.category.name}</td>
              <td className={ds.table.tdNum}>
                <Money won={row.cost} />
              </td>
              <td className={TD_SUB_NUM}>
                <Money won={row.prevCost} />
              </td>
              <td className={ds.table.td}>
                <Change text={row.change} />
              </td>
            </tr>
          ))}
          <tr className={ds.table.row}>
            <td className={TOTAL}>합계</td>
            <td className={TOTAL_NUM}>{formatWon(report.total.cost)}</td>
            <td className={TOTAL_NUM}>{formatWon(report.total.prevCost)}</td>
            <td className={TOTAL}>
              <Change text={report.total.change} />
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  )
}

function UsedCell({ row }: { row: MonthlyRow<InvItem> }) {
  return (
    <td className={ds.table.tdNum}>
      <span className="inline-flex items-center justify-end gap-2">
        {row.missing && <span className={ds.chip.warning}>빠진 입고</span>}
        {row.used === null ? (
          <Dash />
        ) : (
          <span>
            {formatCount(row.used)}
            <span className="ml-0.5 text-caption text-muted">{row.item.unit}</span>
          </span>
        )}
      </span>
    </td>
  )
}

function ItemTable({ month, report, labelId }: { month: string; report: Report; labelId: string }) {
  const m = monthNo(month)
  const pm = monthNo(addMonths(month, -1))
  const rowsOf = (categoryId: string) => report.rows.filter((row) => row.item.categoryId === categoryId)
  return (
    <div className={`mt-3 ${ds.table.wrap}`}>
      <table aria-labelledby={labelId} className={ds.table.table}>
        <thead>
          <tr>
            <th scope="col" className={ds.table.th}>
              이름
            </th>
            <th scope="col" className={TH_NUM}>{`${m}월 쓴 양`}</th>
            <th scope="col" className={TH_NUM}>{`${pm}월`}</th>
            <th scope="col" className={ds.table.th}>
              지난달보다
            </th>
            <th scope="col" className={TH_NUM}>{`${m}월 구입비`}</th>
            <th scope="col" className={TH_NUM}>{`${pm}월`}</th>
          </tr>
        </thead>
        {report.categories.map((group, index) => {
          const rows = rowsOf(group.category.id)
          const first = index === 0
          return (
            <tbody key={group.category.id}>
              <tr>
                <th colSpan={4} scope="colgroup" className={first ? GROUP_FIRST : GROUP}>
                  {group.category.name}
                  <span className="ml-2 font-normal text-muted">{`${formatCount(rows.length)}개`}</span>
                </th>
                <th className={first ? GROUP_NUM_FIRST : GROUP_NUM}>{formatWon(group.cost)}</th>
                <th className={first ? GROUP_PREV_FIRST : GROUP_PREV}>{formatWon(group.prevCost)}</th>
              </tr>
              {rows.map((row) => (
                <tr key={row.item.id} className={ITEM_ROW}>
                  <td className={TD_NAME}>{row.item.name}</td>
                  <UsedCell row={row} />
                  <td className={TD_SUB_NUM}>{row.prevUsed === null ? <Dash /> : formatCount(row.prevUsed)}</td>
                  <td className={ds.table.td}>
                    <Change text={row.change} />
                  </td>
                  <td className={ds.table.tdNum}>
                    <Money won={row.cost} />
                  </td>
                  <td className={TD_SUB_NUM}>
                    <Money won={row.prevCost} />
                  </td>
                </tr>
              ))}
            </tbody>
          )
        })}
      </table>
    </div>
  )
}

function ReportView({ month, data }: { month: string; data: Loaded }) {
  const categoryId = useId()
  const itemId = useId()
  const input = { items: data.inventory.items, categories: data.inventory.categories, counts: data.counts, receipts: data.receipts }
  const report = monthlyReport({ month, ...input })
  const prevReport = monthlyReport({ month: addMonths(month, -1), ...input })
  const missing = report.rows.some((row) => row.missing)
  return (
    <>
      <p className="mt-2 text-small text-muted">{countLine(month, report, data)}</p>
      <Tiles month={month} report={report} prevReport={prevReport} />
      <div className="mt-8 grid grid-cols-1 items-start gap-8 xl:grid-cols-12">
        <section aria-labelledby={categoryId} className="min-w-0 max-w-160 xl:col-span-5 xl:max-w-none">
          <h2 id={categoryId} className="text-subtitle font-semibold text-ink">
            분류별 구입비
          </h2>
          <CategoryTable month={month} report={report} labelId={categoryId} />
        </section>
        <section aria-labelledby={itemId} className="min-w-0 xl:col-span-7">
          <h2 id={itemId} className="text-subtitle font-semibold text-ink">
            물품별 쓴 양 · 구입비
          </h2>
          <ItemTable month={month} report={report} labelId={itemId} />
          <p className={`mt-2 pl-5 ${ds.help}`}>{"'–' = 그 달 세기가 없었거나 그 달에 들어온 기록이 없어요."}</p>
          {missing && (
            <p className={`mt-1 pl-5 ${ds.help}`}>
              {"'빠진 입고' = 센 수량이 지난 수량과 그 사이 들어온 것보다 많았어요. 입고 기록이 빠졌을 수 있어 쓴 양은 0으로 셌어요."}
            </p>
          )}
        </section>
      </div>
    </>
  )
}

// ── 도구 ─────────────────────────────────────────────────

export function MonthlyTool({ today }: { today: string }) {
  const thisMonth = monthOf(today)
  const [picked, setPicked] = useState(thisMonth)
  // 이번 달보다 뒤로는 못 간다(오늘이 바뀌어 고른 달이 앞서도 이번 달로)
  const month = picked > thisMonth ? thisMonth : picked
  const [attempt, setAttempt] = useState(0)
  const key = `${month}|${attempt}`
  const [held, setHeld] = useState<Held | null>(null)

  useEffect(() => {
    let current = true
    read(month).then(
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
  }, [key, month])

  const reading = held === null || held.key !== key
  return (
    <div>
      <MonthHead month={month} canNext={month < thisMonth} onMonth={setPicked} />
      {reading ? (
        <p className="mt-6 text-small text-muted">재고를 읽는 중이에요.</p>
      ) : held.value === 'failed' ? (
        <div className="mt-6 flex flex-col items-start gap-3">
          <ErrorCard code="E-INV-READ-FAILED" />
          <button type="button" onClick={() => setAttempt((n) => n + 1)} className={ds.button.secondary}>
            다시 읽기
          </button>
        </div>
      ) : (
        <ReportView month={month} data={held.value} />
      )}
    </div>
  )
}
