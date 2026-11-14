// 매출 부품의 보기 타입 (stats-revenue design.md '매출 보기'). view.ts에서 옮겨 왔고 view.ts가 다시 내보낸다.
// 매출 화면(components/revenue)과 통계 매출 칸(components/stats/revenueView.ts)이 같이 쓴다. 타입만 있다

export type Tone = 'ink' | 'warn' | 'up' | 'down' | 'flat' | 'none'
/** 숫자 칸. srText = 화면 읽기로 주는 방향("늘어남"·"줄어듦") */
export type Kpi = { name: string; value: string; sub: string | null; tone: Tone; srText: string }
export type DeltaText = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; srText: string }
/** lead는 굵게, rest는 이어서 */
export type Notice = { lead: string; rest: string }
export type SrTable = { caption: string; head: string[]; rows: string[][] }
export type LegendItem = { key: string; label: string }
export type Axis = { unit: string; ticks: { label: string; bottom: number }[] }
export type BarKind = 'selected' | 'last-year' | 'other'
export type Column = { month: string; label: string; year: string; kind: BarKind; partial: boolean }
export type StackSegment = { key: 'covered' | 'noncovered' | 'other'; height: number }
export type StackColumn = Column & { segments: StackSegment[] | null }
export type Chart<C> = { title: string; legend: LegendItem[]; axis: Axis; columns: C[]; table: SrTable }
export type StackChart = Chart<StackColumn>

export type SplitRow = { name: string; kind: 'main' | 'sub' | 'sum'; amount: string; share: string; delta: DeltaText }
export type TreatmentRow = { name: string; amount: string; share: string; detail: string; width: number; rest: boolean; missing: boolean }
