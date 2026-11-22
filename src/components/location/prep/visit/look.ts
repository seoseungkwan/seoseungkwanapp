import { ds } from '@/components/ui/classes'

// 개원 준비(점검·사진·메모) 부품의 반복 모양 — 시안 docs/mockups/location/index.html의 .sh·.btn·.tbtn·.inp·.t·.ox·.cklist·.photos·.memos·.stp 값.
// PC 모양 하나(사용자 규칙 2026-11-21): 폭 따라 바뀌는 클래스가 든 ds 묶음(단추·입력·글자 단추)은 쓰지 않고 여기서 따로 적는다.
// 색·글자·모서리는 토큰 클래스만. 이름은 통째로 적는다(Tailwind가 소스 글자에서 찾는다)

const focus = ds.focusRing

export const look = {
  // 묶음 머리(시안 .sh): 제목 왼쪽 · 곁글 오른쪽 · 아래 진한 선
  head: 'flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 border-b border-line-strong pb-1.5',
  h2: 'text-subtitle font-semibold text-ink',
  aside: 'text-small text-muted',
  small: 'text-small text-ink-2',
  smallStrong: 'text-small font-semibold text-ink',
  help: ds.help,
  muted: 'text-muted',
  focus,

  // 단추(시안 .btn 36px) · 글자 단추(시안 .tbtn.mut) · 법 근거 링크(시안 lawLink = .tbtn 높이 없음)
  button: `inline-flex h-9 cursor-pointer items-center justify-center gap-1.5 whitespace-nowrap rounded-control border border-line-strong bg-surface px-4 text-body font-medium text-ink no-underline transition hover:bg-canvas aria-busy:cursor-progress aria-busy:opacity-60 ${focus}`,
  textButton: `inline-flex h-8 cursor-pointer items-center whitespace-nowrap rounded-control px-1 text-small font-medium text-ink-2 hover:underline ${focus}`,
  // 사진 이름 줄 옆 작은 [지우기](12px 글자 줄 높이)
  photoDelete: `inline-flex h-4 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-control px-0.5 text-caption font-medium text-ink-2 hover:underline ${focus}`,
  // 사진 올리기 자리(시안 .ph.addp 152×104, 점선)
  photoAdd: `grid h-26 w-38 cursor-pointer content-center justify-items-center gap-1 rounded-control border border-dashed border-line-strong bg-surface text-small font-medium text-accent hover:bg-canvas aria-busy:cursor-progress aria-busy:opacity-60 ${focus}`,
  lawLink: `rounded-control text-small font-medium text-accent no-underline underline-offset-2 hover:underline ${focus}`,

  // 입력(시안 .inp 44px) · 표 안 작은 입력 · 글 칸(임대 조건 메모 120px)
  input: `h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent`,
  cellInput: `h-8 w-full min-w-48 rounded-control border border-line-strong bg-surface px-2 text-small text-ink hover:border-muted focus-visible:border-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent`,
  textarea: `h-30 w-full min-w-0 resize-y rounded-control border border-line-strong bg-surface px-3 py-2 text-body text-ink placeholder:text-muted hover:border-muted focus-visible:border-accent focus-visible:outline-hidden focus-visible:ring-1 focus-visible:ring-accent`,
  field: 'grid min-w-0 content-start gap-1.5',
  label: 'text-small font-semibold text-ink',

  // 표(시안 .t: 13px, 머리 40px, 몸 44px, 첫·끝 칸 바깥 여백 없음, 줄 올림 canvas)
  tableWrap: 'mt-2 min-w-0 overflow-x-auto',
  table: 'w-full border-collapse text-small',
  th: 'h-10 whitespace-nowrap border-b border-line px-3 text-left align-middle font-medium text-muted first:pl-0 last:pr-0',
  thCenter: 'h-10 whitespace-nowrap border-b border-line px-3 text-center align-middle font-medium text-muted',
  row: 'hover:bg-canvas',
  td: 'h-11 border-b border-line px-3 py-2 align-middle text-ink first:pl-0 last:pr-0',
  tdCenter: 'h-11 whitespace-nowrap border-b border-line px-3 py-2 text-center align-middle',

  // ○ · ✕ · ? 칸(시안 .ox · .oxb)
  oxButton: `cursor-pointer rounded-control p-0 ${focus}`,
  ox: {
    yes: 'inline-grid h-6 min-w-7 place-items-center rounded-control border border-transparent bg-positive-soft px-1.5 text-small font-semibold text-positive',
    no: 'inline-grid h-6 min-w-7 place-items-center rounded-control border border-transparent bg-negative-soft px-1.5 text-small font-semibold text-negative',
    unknown: 'inline-grid h-6 min-w-7 place-items-center rounded-control border border-line-strong bg-surface px-1.5 text-small font-semibold text-ink-2',
  },

  // 체크 칸 목록(시안 .cklist): 줄마다 아래 선, 켜면 글이 흐려진다
  checkList2: 'grid grid-cols-[minmax(0,1fr)_minmax(0,1fr)] gap-x-8 border-t border-line',
  checkList1: 'grid grid-cols-[minmax(0,1fr)] border-t border-line',
  checkRow: 'flex items-start justify-between gap-3 border-b border-line py-2.5',
  checkLabel: 'flex min-w-0 cursor-pointer items-start gap-2.5 text-small text-ink-2',
  checkLabelOn: 'flex min-w-0 cursor-pointer items-start gap-2.5 text-small text-muted',
  checkWrap: `${ds.checkboxWrap} mt-0.5`,
  checkbox: ds.checkbox,
  checkMark: ds.checkboxMark,
} as const
