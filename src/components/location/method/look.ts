import { ds } from '@/components/ui/classes'

// 처음 안내 장·[분석 방법] 판 모양(시안 docs/mockups/location/index.html의 .mcard·.mrow·.mdata·.eg·.mfoot·.drawer.wide·.dwh·.dwb·.dwf·.btn·.tbtn 값).
// 폰 전용 모양 없음(사용자 규칙 2026-11-21): 폭 따라 바뀌는 클래스가 든 ds 묶음(단추·입력·글 단추)을 쓰지 않고 PC 값만 통째로 적는다.
// 토큰 단계 밖 시안 값(18px 제목·14px 줄 여백·5px 표 줄)은 가까운 단계로 바꿨다

// 단추 공통(ds.button.secondary의 PC 값): 36px·좌우 16px·body 500·4px·1px line-strong, 올림 canvas, 누름 아래 1px
const BUTTON_BASE = `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border transition active:translate-y-px ${ds.focusRing}`

export const look = {
  // 한 장(.mcard): 위 32px·최대 980px·안쪽 20/24/4px·1px line
  card: 'mt-8 max-w-245 min-w-0 rounded-control border border-line px-6 pt-5 pb-1',
  cardTitle: 'text-subtitle font-semibold text-ink',
  lead: 'mt-1 text-body text-ink-2',
  // 다섯 줄(.mrows·.mrow): 한 장은 왼쪽 176px, 판은 136px
  rows: 'mt-4',
  rowsInPanel: 'mt-3',
  row: 'grid grid-cols-[176px_minmax(0,1fr)] gap-x-5 gap-y-1.5 border-t border-line py-3',
  rowInPanel: 'grid grid-cols-[136px_minmax(0,1fr)] gap-x-5 gap-y-1.5 border-t border-line py-3',
  rowTitle: 'flex gap-2 text-body font-semibold text-ink',
  rowNo: 'tabular-nums text-accent-strong',
  rowBody: 'min-w-0',
  rowText: 'mb-1.5 text-small text-ink-2',
  // 묶음별 기관 표(.mdata): 왼쪽 112px
  org: 'grid grid-cols-[112px_minmax(0,1fr)] gap-x-3 gap-y-0.5 border-b border-line py-1 text-small last:border-b-0',
  orgGroup: 'font-semibold text-ink',
  orgText: 'text-ink-2',
  // 줄들(ul·li b): 목록 점 없음(시안 .mrow ul list-style none — 앱은 Preflight가 없어 브라우저 기본 점이 남는다)
  bullets: 'grid list-none gap-1.5 text-small text-ink-2',
  bulletLead: 'font-semibold text-ink',
  // 예: 출처 줄(.eg .src)
  example: 'mt-0.5 block w-fit rounded-control bg-canvas px-2 py-0.5 text-caption text-muted',
  exampleLink: `rounded-control text-muted underline-offset-2 transition hover:text-ink-2 hover:underline ${ds.focusRing}`,
  // 맨 아래(.mfoot): [근거와 출처 모두 보기](.tbtn) + 도움말
  foot: 'flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-line py-3',
  textButton: `inline-flex cursor-pointer items-center gap-1 rounded-control text-small font-medium text-accent underline-offset-3 transition hover:underline ${ds.focusRing}`,
  help: ds.help,
  // 오른쪽 판(.drawer.wide 760px · .dwh · .dwb · .dwf)
  scrim: 'fixed inset-0 z-40 bg-ink/36',
  panel: 'fixed top-0 right-0 bottom-0 z-50 flex w-190 max-w-full flex-col border-l border-line-strong bg-surface shadow-float focus:outline-none',
  panelHead: 'flex items-center justify-between gap-2 border-b border-line py-2 pr-3 pl-6',
  panelTitle: 'text-subtitle font-semibold text-ink',
  panelBody: 'flex-1 overflow-y-auto px-6 pt-5 pb-6',
  panelFoot: 'flex flex-wrap items-center justify-end gap-2 border-t border-line px-6 py-3',
  panelNote: 'min-w-0 flex-1 text-caption text-muted',
  // 단추: 보조(.btn) · 아이콘만(.btn.ghost 36px)
  button: `${BUTTON_BASE} h-9 border-line-strong bg-surface px-4 text-body font-medium text-ink no-underline hover:bg-canvas`,
  iconButton: `${BUTTON_BASE} size-9 border-transparent text-ink-2 hover:bg-canvas`,
} as const
