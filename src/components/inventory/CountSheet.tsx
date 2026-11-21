import { formatCount } from '@/components/charts/format'
import { Icon } from '@/components/common/Icon'
import { ds } from '@/components/ui/classes'
import { sortItems } from '@/lib/inventory/order'
import type { InvCategory, InvItem } from '@/types/inventory'

// 세기 종이 미리 보기 (spec inventory REQ-7507 AC-7507.4, design.md 6절, 시안 docs/mockups/inventory ?s=print).
// 머리(제목·안내·[세기로 돌아가기]·[인쇄]) 아래 A4 세로 종이 한 장: 위 센 날·센 사람 빈칸, 병원 이름·인쇄 날짜, 세기 표와 같은 물품·차례(countGroups)
// 칸 = 물품 이름 · 단위 · 지금 수량 · 센 수량(빈 네모) · 지금 유통기한 · 가장 빠른 유통기한(빈 네모).
// [인쇄]는 window.print — 아래 인쇄 규칙(월간 보고서 종이와 같은 틀, 이 부품이 붙어 있을 때만)이 종이·그 안·종이를 품은 바깥 틀 밖을 모두 가리고
// 바깥 틀의 여백·테두리·바탕을 없앤다. 종이 여백은 @page 12mm가 맡아 물품이 많아 다음 장으로 넘어가도 장마다 여백이 같고, 줄은 장 사이에서 갈라지지 않는다.
// 규칙 글자에는 HTML로 바뀌는 글자(<·>·&)를 쓰지 않는다. 색은 토큰만 쓴다

const PRINT_CSS = [
  '@media print {',
  '@page { size: A4 portrait; margin: 12mm; }',
  'body:has([data-print-count-sheet]) *:not([data-print-count-sheet], [data-print-count-sheet] *, :has([data-print-count-sheet])) { display: none !important; }',
  'body:has([data-print-count-sheet]) :has([data-print-count-sheet]) { margin: 0; padding: 0; border: 0; box-shadow: none; background: none; gap: 0; max-width: none; min-height: 0; overflow: visible; }',
  '[data-print-count-sheet] { width: auto; min-height: 0; margin: 0; padding: 0; border: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }',
  '[data-print-count-sheet] tr { break-inside: avoid; }',
  '}',
].join(' ')

const GUIDE = '센 수량을 적어요. 못 센 물품은 비워 두면 지난 수량 그대로예요. 가장 빠른 유통기한이 바뀌었을 때만 적어요.'

/** 세기 표·세기 종이가 같이 쓰는 묶음: 숨기지 않은 물품을 목록 차례(sortItems)로, 같은 분류끼리 */
export type CountGroup = { id: string; name: string; items: InvItem[] }

export function countGroups(items: readonly InvItem[], categories: readonly InvCategory[]): CountGroup[] {
  const names = new Map(categories.map((category) => [category.id, category.name]))
  const groups: CountGroup[] = []
  for (const item of sortItems(
    items.filter((it) => !it.hidden),
    categories,
  )) {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.id === item.categoryId) last.items.push(item)
    else groups.push({ id: item.categoryId, name: names.get(item.categoryId) ?? '', items: [item] })
  }
  return groups
}

// 시안 .a4: 화면에서는 A4 크기 흰 종이(바깥 여백 = 인쇄 여백 12mm에 가까운 48px). 인쇄에서는 인쇄 규칙이 폭·여백·테두리를 푼다
const WRAP = 'mt-4 overflow-x-auto rounded-control bg-canvas p-6'
const PAPER = 'mx-auto min-h-[297mm] w-[210mm] border border-line bg-surface p-12 text-caption text-ink'
const TH = 'h-6.5 whitespace-nowrap border-b border-ink px-1.5 text-left font-medium text-ink-2'
const TD = 'h-7.5 border-b border-line-strong px-1.5'
const GROUP_TD = 'h-7 border-b border-ink px-1.5 pt-2 align-bottom font-semibold'
const BOX = 'inline-block h-5.5 w-16 border border-ink align-middle'
const DATE_BOX = 'inline-flex h-5.5 w-28 items-center justify-center gap-6 border border-ink align-middle text-muted'
const BLANK_LINE = 'inline-block w-24 border-b border-ink'

export function CountSheet({
  items,
  categories,
  clinicName,
  printedOn,
  onBack,
}: {
  items: readonly InvItem[]
  categories: readonly InvCategory[]
  clinicName: string
  printedOn: string
  onBack: () => void
}) {
  const groups = countGroups(items, categories)
  const sub = `${clinicName === '' ? '' : `${clinicName} · `}인쇄 ${printedOn} · ${GUIDE}`
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
        <div>
          <h2 className="text-subtitle font-semibold text-ink">세기 종이 미리 보기</h2>
          <p className="mt-0.5 max-w-[52em] text-small text-muted">A4 한 장에 세기 표와 같은 차례로 나와요. 안 쓰는 물품은 빠져요. 물품이 많으면 다음 장으로 넘어가요.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={onBack} className={ds.button.secondary}>
            세기로 돌아가기
          </button>
          <button type="button" onClick={() => window.print()} className={ds.button.primary}>
            <Icon name="doc" />
            인쇄
          </button>
        </div>
      </div>
      <div className={WRAP}>
        <article data-print-count-sheet="" aria-label="세기 종이" className={PAPER}>
          <div className="flex items-end justify-between gap-4 border-b-2 border-ink pb-2">
            <h3 className="text-title font-semibold">재고 세기</h3>
            <p data-blanks="" className="text-small">
              센 날 <span data-blank="" className={BLANK_LINE} /> <span className="ml-3">센 사람</span> <span data-blank="" className={BLANK_LINE} />
            </p>
          </div>
          <p className="mt-1.5 text-caption text-ink-2">{sub}</p>
          <table className="mt-3 w-full border-collapse">
            <thead>
              <tr>
                <th className={TH}>물품 이름</th>
                <th className={TH}>단위</th>
                <th className={`${TH} text-right`}>지금 수량</th>
                <th className={TH}>센 수량</th>
                <th className={TH}>지금 유통기한</th>
                <th className={TH}>가장 빠른 유통기한</th>
              </tr>
            </thead>
            <tbody>
              {groups.map((group) => [
                <tr key={`g-${group.id}`}>
                  <td colSpan={6} className={GROUP_TD}>
                    {group.name}
                  </td>
                </tr>,
                ...group.items.map((it) => (
                  <tr key={it.id} data-item={it.id}>
                    <td className={TD}>{it.name}</td>
                    <td className={TD}>{it.unit}</td>
                    <td className={`${TD} text-right tabular-nums`}>{formatCount(it.qty)}</td>
                    <td className={TD}>
                      <span data-blank="" className={BOX} />
                    </td>
                    <td className={`${TD} text-ink-2 tabular-nums`}>{it.expiry ?? ''}</td>
                    <td className={TD}>
                      <span data-blank="" aria-hidden="true" className={DATE_BOX}>
                        <span>.</span>
                        <span>.</span>
                      </span>
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
          <p className="mt-4 text-caption text-ink-2">재고 · 세기 종이</p>
        </article>
      </div>
    </>
  )
}
