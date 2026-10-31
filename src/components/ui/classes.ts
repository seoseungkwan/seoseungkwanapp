// 앱 화면 공통 모양 — docs/UI_GUIDE.md '앱 화면'(단추·링크·입력·칩·표·카드·패널)을 Tailwind 클래스 묶음으로 (ADR-015).
// 색·글자·모서리·그림자는 globals.css @theme 토큰만 쓴다(기본 색 팔레트는 지웠다. 흰 글자는 text-surface).
// Tailwind는 소스 글자에서 클래스 이름을 찾는다 → 이름은 늘 통째로 적는다(조각을 이어 붙여 만들지 않는다).
// 같은 속성의 클래스를 한 요소에 둘 겹치면 어느 쪽이 이길지 모른다 → 크기·종류가 다르면 묶음을 따로 둔다(button.primary / primarySmall)

// 초점(키보드): 2px accent 고리, 2px 띄움. 모든 조작 요소 공통
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// 막힘(disabled·aria-disabled 준비 전): 40% 흐림 + not-allowed 커서. 올림·누름 변화는 각 묶음이 not-disabled:not-aria-disabled:로만 준다
const disabled =
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

// 단추 공통: 6px 모서리, 1px 테두리(색은 종류마다), 500.
// flex 크기(flex-·grow·shrink·basis)는 두지 않는다 — 놓는 자리가 정한다(error.tsx flex-[1_1_160px]·관리자 max-md:flex-1).
// 줄바꿈 없는 글자라 flex 안에서도 글자 폭 아래로는 줄지 않는다
const buttonBase = `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-card border font-medium ${focusRing} ${disabled}`
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

// ── 새 묶음 ds (b2b-redesign REQ-204, design.md '공통 모양 옮기기', docs/UI_GUIDE.md '공통 모양').
// 위의 ui는 한 글자도 바꾸지 않는다. 화면 TASK마다 그 화면의 ui.*를 ds.*로 바꾸고, TASK-23에서 ui를 지운다(마지막 이름은 ds).
// 토큰 클래스만 쓴다: 모서리 rounded-control(4px)·rounded-float(8px, 떠 있는 층), 그림자 shadow-float(층에만), 글자 11단계,
// 간격은 단계 0·0.5·1·1.5·2·3·4·5·6·8·12·16·24와 px뿐이다(classes.test.ts AC-204.6 규칙 시험). 넘침 자르기는 overflow-clip.
// 초점 고리(focusRing)·막힘(disabled)은 위의 같은 글자를 같이 쓴다

// 단추 공통: 4px 모서리, 1px 테두리(색은 종류마다), 가운데 정렬, 사이 8px, 줄바꿈 없음, 그림자 없음.
// 굵기·높이·좌우 여백은 크기·종류 묶음이 하나씩만 준다(같은 속성 클래스가 겹치지 않게). flex 크기는 놓는 자리가 정한다
const dsButtonBase = `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border ${focusRing} ${disabled}`
// 기본 36px·좌우 16px·body 500 / 작은 32px·좌우 12px·small 500 / 큰 44px·좌우 20px·body 600. 휴대폰은 모두 44px
const dsSize = 'h-9 px-4 text-body font-medium max-md:h-11'
const dsSizeSmall = 'h-8 px-3 text-small font-medium max-md:h-11'
const dsSizeSmallBold = 'h-8 px-3 text-small font-semibold max-md:h-11'
const dsSizeGhost = 'h-8 px-2 text-small font-medium max-md:h-11'
const dsSizeLarge = 'h-11 px-5 text-body font-semibold max-md:h-11'
// 올림 색은 막히지 않았을 때만
const dsPrimaryTone = 'border-transparent bg-accent text-surface not-disabled:not-aria-disabled:hover:bg-accent-strong'
const dsSecondaryTone = 'border-line-strong bg-surface text-ink not-disabled:not-aria-disabled:hover:bg-canvas'
const dsAccentOutlineTone = 'border-accent bg-surface text-accent not-disabled:not-aria-disabled:hover:bg-accent-soft'
const dsGhostTone = 'border-transparent text-ink-2 not-disabled:not-aria-disabled:hover:bg-canvas'
const dsDangerTone = 'border-line-strong bg-surface text-negative not-disabled:not-aria-disabled:hover:bg-canvas'

// 칩: 20px·좌우 6px·caption 500·4px·1px 테두리(없으면 투명)·아이콘(12px)과 글자 사이 4px
const dsChipBase = 'inline-flex h-5 shrink-0 items-center gap-1 whitespace-nowrap rounded-control border px-1.5 text-caption font-medium'

// 표 몸 칸: 44px·아래 1px line·좌우 12px(첫 칸 왼쪽·끝 칸 오른쪽 20px = 패널 안쪽), 줄바꿈 없음
const dsCell = 'h-11 whitespace-nowrap border-b border-line px-3 first:pl-5 last:pr-5'

export const ds = {
  focusRing,

  button: {
    primary: `${dsButtonBase} ${dsSize} ${dsPrimaryTone}`,
    primarySmall: `${dsButtonBase} ${dsSizeSmall} ${dsPrimaryTone}`,
    primaryLarge: `${dsButtonBase} ${dsSizeLarge} ${dsPrimaryTone}`,
    secondary: `${dsButtonBase} ${dsSize} ${dsSecondaryTone}`,
    secondarySmall: `${dsButtonBase} ${dsSizeSmall} ${dsSecondaryTone}`,
    danger: `${dsButtonBase} ${dsSize} ${dsDangerTone}`, // 확인 창 [거절]
    accentOutlineSmall: `${dsButtonBase} ${dsSizeSmallBold} ${dsAccentOutlineTone}`, // 관리자 [승인]
    ghostSmall: `${dsButtonBase} ${dsSizeGhost} ${dsGhostTone}`, // 승인 대기 위 줄 [로그아웃]
    googleLarge: `${dsButtonBase} ${dsSizeLarge} ${dsSecondaryTone}`, // [구글로 시작하기] — 안에 GoogleMark 18
  },

  // 글자 단추·링크: 바탕 없음·accent·body 500 → 올림 밑줄(아래 3px). 휴대폰은 44px 높이
  textButton: `inline-flex cursor-pointer items-center gap-1 rounded-control text-body font-medium text-accent underline-offset-3 not-disabled:not-aria-disabled:hover:underline ${focusRing} ${disabled} max-md:min-h-11`,

  // 칸 하나: 이름 → 입력(사이 6px). 이름 줄은 이름(label) + 필수·선택(labelHint)
  field: 'flex flex-col gap-1.5',
  label: 'flex items-baseline gap-1.5 text-small font-semibold text-ink',
  labelHint: 'text-caption font-normal text-muted',
  // 입력란: 44px(모든 폭)·좌우 12px·surface·1px line-strong·body(휴대폰 16px, 아이폰 확대 방지) → 올림 muted 테두리, 초점 accent 테두리 + 1px 고리, 오류 negative
  input: `h-11 w-full min-w-0 rounded-control border border-line-strong bg-surface px-3 text-body text-ink placeholder:text-muted not-disabled:hover:border-muted focus-visible:border-accent focus-visible:ring-1 focus-visible:ring-accent focus-visible:outline-hidden aria-invalid:border-negative ${disabled} max-md:text-lead`,
  // 읽기 전용 칸: 44px 이상·canvas·1px line·ink-2. 안에 아이콘 + 테두리 없는 칸(또는 글자)을 둔다
  readonly:
    'flex min-h-11 w-full min-w-0 items-center gap-2 rounded-control border border-line bg-canvas px-3 py-1.5 text-body text-ink-2 focus-within:border-accent focus-within:ring-1 focus-within:ring-accent max-md:text-lead',
  help: 'text-caption text-muted',
  fieldError: 'text-caption font-medium text-negative',

  // 체크 상자: 16px·4px·1px line-strong → 체크하면 accent 바탕 + 흰 체크(checkboxMark).
  // <span class={checkboxWrap}><input class={checkbox} /><svg class={checkboxMark} /></span> — 체크 그림은 input 바로 뒤(peer)
  checkbox: `peer size-4 shrink-0 cursor-pointer appearance-none rounded-control border border-line-strong bg-surface checked:border-accent checked:bg-accent aria-invalid:border-negative ${focusRing} ${disabled}`,
  checkboxWrap: 'relative inline-flex size-4 shrink-0',
  checkboxMark: 'pointer-events-none absolute inset-0 hidden size-4 text-surface peer-checked:block',

  chip: {
    neutral: `${dsChipBase} border-line bg-canvas text-ink-2`, // 준비 중·추정·예시
    accent: `${dsChipBase} border-transparent bg-accent-soft text-accent-strong`, // 미리보기 "예시 숫자"
    positive: `${dsChipBase} border-transparent bg-positive-soft text-positive`, // 승인됨·확정됨
    negative: `${dsChipBase} border-transparent bg-negative-soft text-negative`, // 승인되지 않음
    warning: `${dsChipBase} border-transparent bg-warning-soft text-warning`, // 승인 대기·살펴볼 것
  },

  // 패널: surface·1px line·4px·그림자 없음. 안쪽은 머리(panelHead)와 몸(panelBody)이 준다
  panel: 'min-w-0 rounded-control border border-line bg-surface',
  // 머리 줄: 제목(panelTitle) 왼쪽 · 보조 글(count) 오른쪽. 좌우 20px·위 16px(휴대폰 16·12)
  panelHead: 'flex items-center justify-between gap-3 px-5 pt-4 max-md:px-4 max-md:pt-3',
  panelTitle: 'text-subtitle font-semibold text-ink',
  count: 'whitespace-nowrap text-small text-muted',
  // 몸: 좌우 20px·위 16px·아래 20px(휴대폰 16·8·16)
  panelBody: 'px-5 pt-4 pb-5 max-md:px-4 max-md:pt-2 max-md:pb-4',

  // 표: 감싸개가 옆으로 밀린다. 머리 40px(small 500 muted·아래 선), 몸 44px(ink), 줄 올림 canvas, 마지막 줄 아래 선 없음.
  // 줄무늬·모서리·바깥 테두리가 없다
  table: {
    wrap: 'min-w-0 overflow-x-auto',
    table: 'w-full border-collapse text-small',
    th: 'h-10 whitespace-nowrap border-b border-line px-3 text-left font-medium text-muted first:pl-5 last:pr-5',
    row: 'hover:bg-canvas last:*:border-b-0',
    td: `${dsCell} text-ink`,
    tdSub: `${dsCell} text-ink-2`, // 보조 칸(규격·시각)
    tdNum: `${dsCell} text-right tabular-nums text-ink`, // 숫자 칸
    check: 'h-11 w-10 whitespace-nowrap border-b border-line pr-1 pl-5', // 체크 칸(늘 첫 칸)
    // 빈 탭: 칸 전체를 잇는 한 줄(48px·muted·줄바꿈 허용). 늘 마지막 줄이라 아래 선이 없다
    emptyRow: 'h-12 px-5 text-muted',
  },

  // 떠 있는 층(계정 메뉴·확인 창): 8px 모서리. 그림자는 여기(와 툴팁)에만
  layer: 'rounded-float border border-line bg-surface shadow-float',
} as const
