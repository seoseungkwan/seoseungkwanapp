import { ds } from '@/components/ui/classes'

// 후보 자세히 틀의 반복 모양(시안 docs/mockups/location/index.html의 .btn·.tbtn·.sh·.flags·.scorebox·.range·.toc·.chead 값).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 화면 폭 앞말을 쓰지 않고, 폭 따라 바뀌는 ds 묶음(단추·글자 단추·입력)도 쓰지 않는다.
// 색은 토큰 클래스만

const RING = ds.focusRing

export const look = {
  // 단추(시안 .btn 36px)
  button: `inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-body font-medium text-ink transition hover:bg-canvas ${RING}`,
  // 글자 단추(시안 .tbtn 13px)
  textButton: `inline-flex h-8 cursor-pointer items-center gap-1 whitespace-nowrap rounded-control px-1 text-small font-medium text-accent hover:underline disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:no-underline ${RING}`,
  // 글 사이 링크(법 근거·매기는 법)
  inlineLink: `rounded-control font-medium text-accent underline-offset-2 hover:underline ${RING}`,
  chipAccent: ds.chip.accent,
  chipNeutral: ds.chip.neutral,
  chipWarning: ds.chip.warning,
  chipNegative: ds.chip.negative,

  // 묶음 머리(시안 .sh): 제목 · 곁글, 아래 1px line-strong
  sectionHead: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  sectionTitle: 'text-subtitle font-semibold text-ink',
  sectionCount: 'font-medium tabular-nums text-muted',
  sectionAside: 'text-small text-muted',
  sectionBody: 'mt-3 grid min-w-0 gap-4',
  // 묶음 자리(목차가 건너뛸 곳)
  section: 'min-w-0 scroll-mt-4 focus:outline-none',
  help: 'text-caption text-muted',
} as const
