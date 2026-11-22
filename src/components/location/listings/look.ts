import { ds } from '@/components/ui/classes'

// 매물 부품의 반복 모양(시안 docs/mockups/location/index.html .sh·.btn·.tbtn·.field·.inp·.suf·.ob·.whybox·.pform·table.t·.lcmp·.cmpbar·.neg 값).
// 색·글자·모서리는 globals.css 토큰 클래스만 쓴다. 폰 전용 모양은 없다(사용자 규칙 2026-11-21) — ds 묶음 가운데 화면 폭 앞말이 든 것
// (button·input·textButton·panel…)은 쓰지 않고, 앞말이 없는 focusRing·help·fieldError·chip만 가져다 쓴다(source.test가 본다)

const ring = ds.focusRing
const btnBase = `inline-flex cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border no-underline transition disabled:cursor-not-allowed disabled:opacity-40 aria-busy:cursor-progress aria-busy:opacity-60 ${ring}`
const btnSecondary = 'border-line-strong bg-surface text-ink hover:bg-canvas'
const inputBase =
  'w-full min-w-0 rounded-control border border-line-strong bg-surface text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative'
const thBase = 'h-10 whitespace-nowrap border-b border-line px-3 font-medium text-muted first:pl-0 last:pr-0'
const tdBase = 'h-11 border-b border-line px-3 py-2 align-middle text-ink first:pl-0 last:pr-0'

export const look = {
  // 판 전체(시안 .lgrid): 묶음 사이 40px
  grid: 'mt-5 grid gap-10',
  // 묶음 머리(시안 .sh): 제목 16px 600 · 곁글 13px muted · 아래 1px line-strong
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  title: 'text-subtitle font-semibold text-ink',
  count: 'ml-1 font-medium tabular-nums text-muted',
  aside: 'text-small text-muted',
  empty: 'py-3 text-body text-muted',

  // 단추(시안 .btn 36px · .btn.sm 32px · .btn.lg 44px · .btn.primary)
  button: `${btnBase} ${btnSecondary} h-9 px-4 text-body font-medium`,
  buttonSmall: `${btnBase} ${btnSecondary} h-8 px-3 text-small font-medium`,
  buttonLarge: `${btnBase} ${btnSecondary} h-11 px-5 text-body font-semibold`,
  primary: `${btnBase} h-9 border-transparent bg-accent px-4 text-body font-medium text-surface hover:bg-accent-strong`,
  // 글자 단추(시안 .tbtn)
  textButton: `inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-control px-1 text-small font-medium text-accent hover:underline aria-busy:cursor-progress aria-busy:opacity-60 ${ring}`,
  iconLink: `ml-1 inline-flex size-5 items-center justify-center rounded-control align-[-4px] text-accent hover:text-accent-strong ${ring}`,

  // 칸(시안 .field·.inp·.suf·textarea.inp·.help·.ferr)
  field: 'grid min-w-0 content-start gap-1.5',
  labelRow: 'flex min-h-5 flex-wrap items-center justify-between gap-x-2 gap-y-1',
  label: 'flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5 text-small font-semibold text-ink',
  req: 'text-caption font-normal text-muted',
  input: `${inputBase} h-11 px-3 text-body`,
  inputSuffix: `${inputBase} h-11 pr-14 pl-3 text-right text-body tabular-nums`,
  suffixWrap: 'relative',
  suffix: 'pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-body text-muted',
  textarea: `${inputBase} h-22 resize-y px-3 py-2.5 text-body`,
  inputSmall: `${inputBase} h-9 px-2 text-small`,
  help: ds.help,
  error: ds.fieldError,
  check: `size-4 shrink-0 cursor-pointer accent-accent ${ring}`,
  checkLabel: 'inline-flex cursor-pointer items-center gap-2 text-small text-ink-2',
  status: 'text-small text-ink-2',

  // 넓이 단위 고르기(평·㎡)
  seg: 'inline-flex w-fit overflow-clip rounded-control border border-line-strong bg-surface',
  segButton: 'h-5 cursor-pointer border-l border-line-strong px-2 text-caption font-medium text-ink-2 first:border-l-0 hover:bg-canvas focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-strong',

  // 매물 찾기(시안 .findn·.whybox)
  find: 'mt-3 flex flex-wrap items-end gap-x-4 gap-y-3',
  findField: 'grid w-50 min-w-0 content-start gap-1.5',
  findHelp: 'self-center text-caption text-muted',
  whyBox: 'mt-3 max-w-220 rounded-control bg-canvas px-3 py-2.5 text-small text-ink-2',

  // 붙여 넣기 칸(시안 .pform 4칸 · .w2 · .w4 · .pfoot)
  form: 'mt-3 grid grid-cols-4 gap-x-3 gap-y-4',
  span2: 'col-span-2',
  spanAll: 'col-span-full',
  formFoot: 'col-span-full flex flex-wrap items-center justify-between gap-x-4 gap-y-2',
  formFootLeft: 'flex flex-wrap items-center gap-x-4 gap-y-2',

  // 평수 칩(시안 .opts·.ob)
  chips: 'mt-3 flex flex-wrap gap-1.5',
  chip: 'h-9 cursor-pointer whitespace-nowrap rounded-control border border-line-strong bg-surface px-3 text-body text-ink hover:bg-canvas focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent aria-pressed:border-accent aria-pressed:bg-accent-soft aria-pressed:font-semibold aria-pressed:text-accent-strong aria-pressed:ring-1 aria-pressed:ring-inset aria-pressed:ring-accent',
  chipCount: 'ml-1 font-medium tabular-nums text-muted',
  chipTag: ds.chip.accent,
  chipNeutral: ds.chip.neutral,

  // 표(시안 table.t: 머리 40px · 몸 44px · 첫 칸 왼쪽·끝 칸 오른쪽 0)
  tableWrap: 'mt-2 min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-small',
  th: `${thBase} text-left`,
  thNum: `${thBase} text-right`,
  td: tdBase,
  tdNum: `${tdBase} whitespace-nowrap text-right tabular-nums`,
  tdNoWrap: `${tdBase} whitespace-nowrap`,
  row: 'hover:bg-canvas',
  strong: 'font-semibold',
  sub: 'block text-caption text-muted',
  subLine: 'block max-w-60 truncate text-caption text-muted',

  // 매물 값 견주기(시안 .lcmp·.cmpbar·.cv·.hi-t·.lo-t)
  cmpList: 'mt-3 grid',
  cmpRow: 'grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-6 gap-y-1 border-b border-line py-2',
  cmpHead: 'grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-6 gap-y-1 border-b border-line pb-1 text-caption text-muted',
  cmpTicks: 'grid grid-cols-[200px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-x-6 pt-1 text-caption text-muted',
  cmpTick: 'flex justify-between',
  cmpAvg: 'font-semibold tabular-nums text-ink-2',
  bar: 'relative h-5 min-w-40',
  barAxis: 'absolute inset-x-0 top-2.25 h-0.5 bg-line',
  barAvg: 'absolute top-0.5 -ml-px h-4 w-0.5 bg-ink-2',
  barDot: 'absolute top-1 -ml-1.5 size-3 rounded-full bg-accent ring-2 ring-surface',
  barDotHigh: 'absolute top-1 -ml-1.5 size-3 rounded-full bg-warning ring-2 ring-surface',
  value: 'mt-0.5 text-caption tabular-nums text-ink-2',
  high: 'font-medium text-warning',
  low: 'font-medium text-positive',
  same: 'text-muted',

  // 협상표(시안 .neg·.nc)
  termHead: `${tdBase} w-50 align-top text-left font-normal`,
  termCell: `${tdBase} min-w-50 align-top`,
  termPair: 'grid gap-1.5',
  termLabel: 'grid grid-cols-[40px_minmax(0,1fr)] items-center gap-1.5 text-caption text-muted',
  termNote: 'mt-1.5 text-caption text-muted',
} as const
