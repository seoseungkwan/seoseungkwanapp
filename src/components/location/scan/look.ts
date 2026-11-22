import { ds } from '@/components/ui/classes'

// 동네 훑기 부품의 반복 모양(시안 docs/mockups/location/index.html의 .btn·.btn.primary·.btn.sm·.field·.inp·.help·.chip.accent·.tbtn·.sh·.kwarn 값).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 폭 따라 바뀌는 클래스가 든 공용 묶음(ds.button·ds.input·ds.textButton)을 쓰지 않고
// 같은 값을 PC 하나로 통째로 적는다(Tailwind가 소스 글자에서 클래스를 찾는다)

// 단추 공통(classes.ts 단추와 같은 값): 모서리·테두리·가운데·사이 8px·줄바꿈 없음·누름 1px·막힘 40%·기다림 60%
// 단추 모양 <a>(네이버 부동산)도 같이 쓰므로 밑줄을 지운다(앱은 브라우저 기본 초기화를 넣지 않는다)
const BUTTON_BASE =
  'inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border no-underline transition ' +
  'not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px ' +
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40 aria-busy:cursor-progress aria-busy:opacity-60 ' +
  ds.focusRing
const SECONDARY_TONE = 'border-line-strong bg-surface text-ink not-disabled:not-aria-disabled:hover:bg-canvas'
const PRIMARY_TONE = 'border-transparent bg-accent text-surface not-disabled:not-aria-disabled:hover:bg-accent-strong'

export const look = {
  // 단추(시안 .btn 36px · .btn.primary 36px · .btn.sm 32px)
  button: `${BUTTON_BASE} h-9 px-4 text-body font-medium ${SECONDARY_TONE}`,
  primary: `${BUTTON_BASE} h-9 px-4 text-body font-medium ${PRIMARY_TONE}`,
  buttonSmall: `${BUTTON_BASE} h-8 px-3 text-small font-medium ${SECONDARY_TONE}`,
  // 칸(시안 .scanbar .field 180px · .inp 44px)
  field: 'grid w-45 min-w-0 content-start gap-1.5',
  label: 'text-small font-semibold text-ink',
  select:
    'h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink not-disabled:hover:border-muted ' +
    'focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden ' +
    'disabled:cursor-not-allowed disabled:opacity-40',
  help: ds.help,
  // 후보 칩(시안 .chip.accent)
  chip: ds.chip.accent,
  // 글자 단추(시안 .tbtn — 높이 없이 글줄 안에)
  textLink: `inline-flex cursor-pointer items-center gap-1 rounded-control text-caption font-medium text-accent no-underline underline-offset-3 transition hover:underline ${ds.focusRing}`,
  moreButton: `mt-1 inline-flex h-8 cursor-pointer items-center gap-1 rounded-control px-1 text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`,
  // 묶음 머리(시안 .sh)
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  // 노란 안내(시안 .kwarn — 경쟁 의원 과목을 하나도 안 골랐을 때)
  warn: 'flex flex-wrap items-center gap-2 rounded-control border border-line-strong bg-warning-soft px-3 py-2.5 text-body font-medium text-ink',
} as const
