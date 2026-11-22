import { ds } from '@/components/ui/classes'

// 개원 준비(비용·손익분기·일정) 반복 모양 — 시안 docs/mockups/location/index.html의 .sh·.field·.inp·.suf·.help·.cost·.crow·.sumbox·.sched 값.
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 공용 묶음(ds.input·ds.button 등)은 쓰지 않는다.
// 색·글자·모서리는 앱 토큰만 쓴다

export const look = {
  // 칸 머리(.sh): 제목 왼쪽 · 곁글 오른쪽, 아래 진한 선
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  h2: 'text-subtitle font-semibold text-ink',
  aside: 'text-small text-muted',
  // 칸 하나(.field)
  field: 'grid min-w-0 content-start gap-1.5',
  label: 'text-small font-semibold text-ink',
  help: ds.help,
  error: ds.fieldError,
  // 단위가 붙는 숫자 칸(.suf .inp): 44px, 오른쪽 맞춤, 단위 자리 52px
  suffixWrap: 'relative',
  number:
    'h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface pr-13 pl-3 text-right text-body tabular-nums text-ink hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative',
  unit: 'pointer-events-none absolute inset-y-0 right-3 flex items-center text-body text-muted',
  // 날짜 칸(.inp)
  date: 'h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body tabular-nums text-ink hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden',
  // 칸과 글을 한 줄에(.findn)
  inline: 'mt-3 flex flex-wrap items-end gap-x-4 gap-y-3',

  // 개원 비용(.cost · .crow · .crow.sub2)
  costGrid: 'mt-1 grid grid-cols-[minmax(0,1fr)_340px] items-start gap-x-10 gap-y-6',
  row: 'grid grid-cols-[180px_200px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-line py-2',
  autoRow: 'grid grid-cols-[180px_200px_minmax(0,1fr)] items-center gap-x-4 gap-y-1 border-b border-line bg-canvas px-3 py-2',
  rowNotes: 'grid min-w-0 gap-0.5',
  auto: 'pr-3 text-right font-semibold tabular-nums text-ink',
  extra: 'text-small text-ink-2',
  extraNum: 'font-semibold tabular-nums text-ink',
  subHead: 'mt-5 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',

  // 합계 판(.sumbox)
  sumBox: 'sticky top-4 grid gap-2 rounded-control border border-line px-5 py-4',
  sumTitle: 'text-body font-semibold text-ink',
  sumRow: 'flex justify-between gap-2 text-small text-ink-2',
  sumNum: 'whitespace-nowrap font-medium tabular-nums text-ink',
  sumTotal: 'flex justify-between gap-2 border-t border-line pt-2 text-small text-ink-2',
  sumTotalNum: 'whitespace-nowrap text-title font-semibold tabular-nums text-ink',
  breakEven: 'grid gap-2 border-t border-line pt-2',
  breakEvenHead: 'text-small font-semibold text-ink',
  breakEvenNum: 'text-metric font-semibold tabular-nums text-ink',
  breakEvenUnit: 'ml-0.5 text-body font-medium text-muted',
  breakEvenNone: 'text-title font-semibold text-muted',
  small: 'text-small text-ink-2',

  // 개원 일정표(.t.sched)
  tableWrap: 'mt-2 min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-small',
  th: 'h-10 whitespace-nowrap border-b border-line px-3 text-left align-middle font-medium text-muted first:pl-0 last:pr-0',
  thNum: 'h-10 whitespace-nowrap border-b border-line px-3 text-right align-middle font-medium text-muted',
  td: 'h-11 border-b border-line px-3 py-2 align-middle first:pl-0 last:pr-0',
  tdDate: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 align-middle tabular-nums',
  tdNum: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 text-right align-middle tabular-nums',
  rowNow: 'text-ink hover:bg-canvas',
  rowGray: 'text-muted hover:bg-canvas',
  struck: 'line-through',
  check: `size-4 shrink-0 cursor-pointer accent-accent ${ds.focusRing}`,
  note: 'flex flex-wrap items-center gap-x-2 gap-y-1',
  chip: ds.chip.warning,
  link: `rounded-control text-accent underline-offset-3 hover:underline ${ds.focusRing}`,
} as const
