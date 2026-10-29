// 앱 화면 공통 모양 — docs/UI_GUIDE.md '앱 화면'(단추·링크·입력·칩·표·카드·패널)을 Tailwind 클래스 묶음으로 (ADR-015).
// 색·글자·모서리·그림자는 globals.css @theme 토큰만 쓴다(기본 색 팔레트는 지웠다. 흰 글자는 text-surface).
// Tailwind는 소스 글자에서 클래스 이름을 찾는다 → 이름은 늘 통째로 적는다(조각을 이어 붙여 만들지 않는다).
// 같은 속성의 클래스를 한 요소에 둘 겹치면 어느 쪽이 이길지 모른다 → 크기·종류가 다르면 묶음을 따로 둔다(button.primary / primarySmall)

// 초점(키보드): 2px accent 고리, 2px 띄움. 모든 조작 요소 공통
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// 막힘(disabled·aria-disabled 준비 전): 40% 흐림 + not-allowed 커서. 올림·누름 변화는 각 묶음이 not-disabled:not-aria-disabled:로만 준다
const disabled =
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

// 단추 공통: 6px 모서리, 1px 테두리(색은 종류마다), 500
const buttonBase = `inline-flex shrink-0 cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-card border font-medium ${focusRing} ${disabled}`
// 기본 36px·좌우 14px·body / 작은 단추(표 안) 32px·좌우 12px·table. 폰은 둘 다 44px
const buttonSize = 'h-9 px-3.5 text-body max-md:h-11'
const buttonSizeSmall = 'h-8 px-3 text-table max-md:h-11'
// 주: ink 바탕·흰 글자 → 올림 ink-2, 누름 ink
const primaryTone =
  'border-transparent bg-ink text-surface not-disabled:not-aria-disabled:hover:bg-ink-2 not-disabled:not-aria-disabled:active:bg-ink'
// 보조: surface·1px line·ink → 올림 canvas, 누름 line
const secondaryTone =
  'border-line bg-surface text-ink not-disabled:not-aria-disabled:hover:bg-canvas not-disabled:not-aria-disabled:active:bg-line'
// 위험(거절 확정): 보조 모양 + danger 글자
const dangerTone =
  'border-line bg-surface text-danger not-disabled:not-aria-disabled:hover:bg-canvas not-disabled:not-aria-disabled:active:bg-line'

// 칩: 22px·좌우 7px·caption 500·4px·1px 테두리(색은 종류마다, 없으면 투명)
const chipBase = 'inline-flex h-5.5 shrink-0 items-center whitespace-nowrap rounded-chip border px-1.75 text-caption font-medium'

// 표 칸 공통: 좌우 6px(첫 칸 왼쪽 8px), 아래 1px 선, 줄바꿈 없음
const cell = 'whitespace-nowrap border-b border-line px-1.5 first:pl-2'

export const ui = {
  focusRing,

  button: {
    primary: `${buttonBase} ${buttonSize} ${primaryTone}`,
    secondary: `${buttonBase} ${buttonSize} ${secondaryTone}`,
    danger: `${buttonBase} ${buttonSize} ${dangerTone}`,
    primarySmall: `${buttonBase} ${buttonSizeSmall} ${primaryTone}`,
    secondarySmall: `${buttonBase} ${buttonSizeSmall} ${secondaryTone}`,
    dangerSmall: `${buttonBase} ${buttonSizeSmall} ${dangerTone}`,
  },

  // 글자 단추·링크: accent 글자·table 500·바탕 없음 → 올림 밑줄(아래 3px), 누름 ink. 폰은 위아래 여백으로 44px
  textButton: `inline-flex cursor-pointer items-center gap-1 rounded-chip text-table font-medium text-accent underline-offset-3 not-disabled:not-aria-disabled:hover:underline not-disabled:not-aria-disabled:active:text-ink ${focusRing} ${disabled} max-md:min-h-11`,

  // 칸 하나(칸 이름 위, 8px 사이)
  field: 'flex flex-col gap-2',
  label: 'text-table font-medium text-ink-2',
  // 입력란: 36px·좌우 12px·surface·1px muted 55%·body → 올림 테두리 muted, 초점 테두리 accent + 1px accent 고리, 오류 테두리 danger. 폰 44px·16px
  input: `h-9 w-full min-w-0 rounded-card border border-muted/55 bg-surface px-3 text-body text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-danger ${disabled} max-md:h-11 max-md:text-lead`,
  // 읽기 전용 칸: canvas 바탕·1px line·ink-2 글자. 안에 아이콘 + 테두리 없는 칸(또는 글자)을 둔다
  readonly:
    'flex min-h-9 w-full min-w-0 items-center gap-2 rounded-card border border-line bg-canvas px-3 py-1.5 text-body text-ink-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent max-md:min-h-11 max-md:text-lead',
  help: 'text-caption text-muted',
  fieldError: 'text-caption font-medium text-danger',

  // 체크 상자: 16px·4px·1px muted 55% → 체크하면 accent 바탕 + 흰 체크(checkboxMark).
  // <span class={checkboxWrap}><input class={checkbox} /><svg class={checkboxMark} /></span> — 체크 그림은 input 바로 뒤(peer)
  checkbox: `peer size-4 shrink-0 cursor-pointer appearance-none rounded-chip border border-muted/55 bg-surface checked:border-accent checked:bg-accent aria-invalid:border-danger ${focusRing} ${disabled}`,
  checkboxWrap: 'relative inline-flex size-4 shrink-0',
  checkboxMark: 'pointer-events-none absolute inset-0 hidden size-4 text-surface peer-checked:block',

  chip: {
    neutral: `${chipBase} border-line bg-surface text-ink-2`, // 범주(구분·기능 이름·"관리자 계정")
    done: `${chipBase} border-transparent bg-ok-soft text-ok`, // 완료·승인됨
    progress: `${chipBase} border-transparent bg-accent-soft text-accent`, // 진행중
    waiting: `${chipBase} border-line bg-canvas text-muted`, // 대기·승인 대기
    rejected: `${chipBase} border-transparent bg-danger-soft text-danger`, // 거절됨
    sample: `${chipBase} border-line bg-surface text-muted`, // 예시 자료 — 목업에서만
  },

  // 인증 화면 카드·빈 안내 상자: 패널 모양, 안쪽 24px(폰 20px 16px)
  card: 'rounded-card border border-line bg-surface p-6 max-md:px-4 max-md:py-5',
  // 패널: 안쪽 18px(아래 16px). 머리 줄 = 제목(panel 600) 왼쪽 · 개수(table muted) 오른쪽
  panel: 'flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface px-4.5 pt-4.5 pb-4',
  panelHead: 'flex items-baseline justify-between gap-3',
  panelTitle: 'text-panel font-semibold text-ink',
  count: 'whitespace-nowrap text-table text-muted',

  // 표: 감싸개가 옆으로 밀린다. 머리 34px(canvas·위아래 선·500 ink-2), 칸 36px(ink), 줄 올림 canvas
  table: {
    wrap: 'min-w-0 overflow-x-auto',
    table: 'w-full border-collapse text-table',
    th: 'h-8.5 whitespace-nowrap border-y border-line bg-canvas px-1.5 text-left font-medium text-ink-2 first:pl-2',
    row: 'hover:bg-canvas',
    td: `h-9 ${cell} text-ink`,
    tdSub: `h-9 ${cell} text-ink-2`, // 보조 칸(규격·시각)
    tdNum: `h-9 ${cell} text-right text-ink`, // 숫자 칸
    check: `h-9 w-8.5 ${cell} pr-1`, // 체크 칸
    // 빈 탭: 칸 전체를 잇는 한 줄(48px·muted·줄바꿈 허용)
    emptyRow: 'h-12 border-b border-line px-2 text-muted',
  },

  // 떠 있는 층(계정 메뉴·확인 창): 그림자는 여기에만
  layer: 'rounded-card border border-line bg-surface shadow-float',
} as const
