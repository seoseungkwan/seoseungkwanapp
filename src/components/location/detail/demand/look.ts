// 정형외과 수요·교통·둘레 시설 묶음의 모양(시안 docs/mockups/location/index.html의 .csec·.sh·.kgrid·.kbox·.info·.fl2·.nodata 값).
// PC 모양 하나(사용자 규칙 2026-11-21): 화면 폭 앞말이 없고, 폭 따라 바뀌는 클래스가 든 ds 묶음을 쓰지 않는다. 색·글 크기는 앱 토큰만

export const look = {
  // 묶음(시안 .csec · .sh · .body)
  section: 'min-w-0 scroll-mt-4',
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  title: 'text-subtitle font-semibold text-ink',
  aside: 'text-small text-muted',
  body: 'mt-3 grid min-w-0 gap-4',
  // 수요 칸(시안 .kgrid · .kbox)
  grid: 'grid min-w-0 grid-cols-3 gap-x-6 border-t border-line',
  box: 'min-w-0 border-b border-line py-3',
  label: 'text-small text-muted',
  value: 'text-title font-semibold tabular-nums text-ink',
  valueText: 'text-body font-medium text-ink',
  unit: 'ml-0.5 text-small font-medium text-muted',
  note: 'text-small text-ink-2',
  nodata: 'text-body font-medium text-muted',
  // 교통·둘레 줄(시안 .info · .fl2)
  rows: 'm-0',
  row: 'grid grid-cols-[148px_minmax(0,1fr)] items-baseline gap-x-3 gap-y-1 border-b border-line py-2.25',
  dt: 'text-small text-muted',
  dd: 'm-0 min-w-0 text-body text-ink wrap-anywhere',
  strong: 'font-semibold tabular-nums',
  aside2: 'text-small text-ink-2',
  line2: 'mt-0.5 block text-small text-ink-2',
  line2Muted: 'mt-0.5 block text-small text-muted',
  muted: 'text-muted',
} as const
