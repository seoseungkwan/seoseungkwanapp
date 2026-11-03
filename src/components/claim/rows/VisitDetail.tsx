import { useId, type ReactNode } from 'react'
import { ds } from '@/components/ui/classes'
import type { ClaimVisitView, DxLine, DxRow, VisitDxView } from '@/types/precheck'
import { dayLabel } from '../dateList'
import { FindingRows } from './FindingRows'

// 환자 자세히(AC-013.3, 목업 화면 3 오른쪽 칸): 이름 → 처방·상병 → 점검 경고 → 추천 상병·상병 확인. 줄은 props로만 받는다.
// 아래에 메모 초안과 [메모 확인에서 고치기]가 있다(TASK-18). 메모를 만들지 않는 병원은 없다(AC-018.18)

const DX_ROLE = (line: DxLine) => (line.m === true ? '주상병' : line.m === false ? '부상병' : line.m === 'x' ? '배제상병' : '상병')

/** 추천 상병 글: 첫 추천 + 외 N개. 없으면 줄표 */
function recommendText(list: readonly DxRow[]): string {
  const [first, ...rest] = list
  if (!first) return '—'
  return `${first.dx} ${first.nm}${rest.length ? ` 외 ${rest.length}개` : ''}`
}

/** 이 진료의 상병 가운데 추천에 드는 것(원본 covers: 앞자리가 같으면 그 묶음이다) */
const matching = (now: readonly DxLine[], list: readonly DxRow[]) => now.find((line) => list.some((row) => line.c.toUpperCase().startsWith(row.dx.toUpperCase())))

type DxTableRow = { code: string; name: string; recommend: string; now: string; issue: boolean; ok: boolean; record: boolean }

/** 표 줄: 상병 경고가 있는 처방이 먼저다. 추천만 있는 처방은 지금 상병이 추천에 들면 '맞음', 아니면 판단하지 않은 것이라 줄표다 */
function dxTableRows(dx: VisitDxView, now: readonly DxLine[]): DxTableRow[] {
  const issues = new Map(dx.issues.map((issue) => [issue.code, issue]))
  const rows: DxTableRow[] = dx.issues.map((issue) => {
    const list = dx.recommendations.find((item) => item.code === issue.code)?.list ?? issue.rec
    return { code: issue.code, name: issue.name, recommend: recommendText(list), now: '없음', issue: true, ok: false, record: issue.record && !issue.gosi }
  })
  for (const item of dx.recommendations) {
    if (issues.has(item.code)) continue
    const hit = matching(now, item.list)
    rows.push({ code: item.code, name: item.name, recommend: recommendText(item.list), now: hit ? DX_ROLE(hit) : '—', issue: false, ok: hit !== undefined, record: false })
  }
  return rows
}

// 이 표는 패널 안쪽에 있어 양 끝 여백을 패널이 준다. 처방 이름이 길어(공백 없는 약 이름) ds.table의 줄바꿈 없는 칸이면 결과 칸이 밀려 안 보인다
const dxHead = 'h-10 whitespace-nowrap border-b border-line px-2 text-left font-medium text-muted first:pl-0 last:pr-0'
const dxCell = 'border-b border-line px-2 py-2 first:pl-0 last:pr-0'
const dxText = `${dxCell} break-all text-ink`
const dxFixed = `${dxCell} whitespace-nowrap text-ink-2`

function DxTable({ visit }: { visit: ClaimVisitView }) {
  const rows = dxTableRows(visit.dx, visit.dxNow)
  return (
    <>
      <div className={ds.table.wrap}>
        <table aria-label="추천 상병" className={ds.table.table}>
          <thead>
            <tr>
              <th className={dxHead}>처방</th>
              <th className={dxHead}>필요한 상병(추천)</th>
              <th className={dxHead}>지금 상병</th>
              <th className={dxHead}>결과</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.code} className={ds.table.row}>
                <td className={dxText}>{row.name}</td>
                <td className={dxText}>{row.recommend}</td>
                <td className={dxFixed}>{row.now}</td>
                <td className={dxFixed}>
                  {row.issue && <span className={ds.chip.negative}>상병 없음</span>}
                  {row.ok && <span className={ds.chip.positive}>맞음</span>}
                  {!row.issue && !row.ok && <span className="text-muted">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.some((row) => row.record) && <p className="text-small text-ink-2">평소 기록과 달라요</p>}
      <p className={ds.help}>추천 상병은 고시 기준과 우리 병원 12개월 기록으로 골라요. 상병은 자동으로 넣지 않아요. 비트에서 직접 고치세요.</p>
    </>
  )
}

function DxSection({ visit, hasDx }: { visit: ClaimVisitView; hasDx: boolean }) {
  if (!hasDx) return <p className="text-small text-muted">상병 자료가 없어 상병을 확인하지 못했어요.</p>
  const hasRows = visit.dx.issues.length > 0 || visit.dx.recommendations.length > 0
  return (
    <>
      {visit.dx.missingDx && <p className="text-small font-medium text-negative">이 진료에 상병이 없어요.</p>}
      {hasRows ? <DxTable visit={visit} /> : !visit.dx.missingDx && <p className="text-small text-muted">이 환자는 처방과 상병이 맞아요.</p>}
    </>
  )
}

function Fact({ name, children }: { name: string; children: ReactNode }) {
  const id = useId()
  return (
    <>
      <dt id={id} className="text-muted">
        {name}
      </dt>
      <dd aria-labelledby={id} className="min-w-0 text-ink">
        {children}
      </dd>
    </>
  )
}

const dxNowText = (now: readonly DxLine[]) => (now.length ? now.map((line) => `${DX_ROLE(line)} ${line.c} ${line.n}`).join(' · ') : '없음')

export function VisitDetail({ visit, titles, hasDx, onOpenMemo }: { visit: ClaimVisitView; titles: ReadonlyMap<string, string>; hasDx: boolean; onOpenMemo?: (visitKey: string) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <h2 className={ds.panelTitle}>
        {visit.name}{' '}
        <span className="text-small font-normal text-muted">
          {visit.chart} · {dayLabel(visit.date)} 진료
        </span>
      </h2>
      <dl className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-1 text-small">
        <Fact name="처방">{visit.rx.length ? visit.rx.join(' · ') : '없음'}</Fact>
        <Fact name="상병">{dxNowText(visit.dxNow)}</Fact>
      </dl>
      <h3 className="mt-1 text-body font-semibold text-ink">
        점검 경고 <span className="text-small font-normal text-muted">{visit.findings.length}개</span>
      </h3>
      {visit.findings.length ? <FindingRows findings={visit.findings} titles={titles} /> : <p className="text-small text-muted">걸린 규칙이 없어요.</p>}
      <h3 className="mt-1 text-body font-semibold text-ink">추천 상병 · 상병 확인</h3>
      <DxSection visit={visit} hasDx={hasDx} />
      {visit.memo && (
        <>
          <h3 className="mt-1 text-body font-semibold text-ink">메모 초안</h3>
          <p className="whitespace-pre-wrap break-words text-small text-ink-2">{visit.memo.text || '메모가 없어요.'}</p>
          {onOpenMemo && (
            <div>
              <button type="button" className={ds.button.secondarySmall} onClick={() => onOpenMemo(visit.key)}>
                메모 확인에서 고치기
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
