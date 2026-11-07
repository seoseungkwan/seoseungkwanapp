// 앱 화면 공통 모양 — docs/UI_GUIDE.md '공통 모양'(단추·글자 단추·입력·칩·표·패널·떠 있는 층)을 Tailwind 클래스 묶음 ds로 (ADR-015·ADR-019, b2b-redesign REQ-204).
// 색·글자·모서리·그림자는 globals.css @theme 토큰만 쓴다(기본 색 팔레트는 지웠다. 흰 글자는 text-surface).
// Tailwind는 소스 글자에서 클래스 이름을 찾는다 → 이름은 늘 통째로 적는다(조각을 이어 붙여 만들지 않는다).
// 같은 속성의 클래스를 한 요소에 둘 겹치면 어느 쪽이 이길지 모른다 → 크기·종류가 다르면 묶음을 따로 둔다(button.primary / primarySmall)

// 초점(키보드): 2px accent 고리, 2px 띄움. 모든 조작 요소 공통
const focusRing = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent'

// 막힘(disabled·aria-disabled 준비 전): 40% 흐림 + not-allowed 커서. 올림 변화는 각 묶음이 not-disabled:not-aria-disabled:로만 준다
const disabled =
  'disabled:cursor-not-allowed disabled:opacity-40 aria-disabled:cursor-not-allowed aria-disabled:opacity-40'

// 짧은 반응(ui-90 REQ-406, UI_GUIDE '단추'·'움직임'): 색 150ms(transition 기본값). 단추는 막히지도 기다리지도 않을 때만 누름 아래 1px
const dsPress = 'transition not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px'
// 기다림(누른 뒤 답을 기다리는 동안): disabled가 아니라 aria-busy="true" → 60% 흐림 + progress 커서(막힘 40%와 겹치지 않는다).
// 기다리는 동안 다시 누름을 무시하는 것은 화면의 누름 처리 함수가 맡는다
const dsBusy = 'aria-busy:cursor-progress aria-busy:opacity-60'

// ── 옛 모양 묶음 ui: 옛 빈 자리 한 파일(components/dashboard/DashboardEmpty.tsx, 지금 그리는 화면 없음)이 쓰는 세 키만 남긴다. 값은 한 글자도 바꾸지 않는다.
// 값이 globals.css @theme의 옛 별칭(모서리 card·글자 panel)을 쓴다 — 그 파일을 지우는 명세에서 별칭과 함께 지운다 (b2b-redesign design.md '대시보드 본문 빼기')
export const ui = {
  // 빈 안내 상자: 흰 바탕·1px 선, 안쪽 24px(폰 20px 16px)
  card: 'rounded-card border border-line bg-surface p-6 max-md:px-4 max-md:py-5',
  // 패널: 안쪽 18px(아래 16px)
  panel: 'flex min-w-0 flex-col gap-3 rounded-card border border-line bg-surface px-4.5 pt-4.5 pb-4',
  panelTitle: 'text-panel font-semibold text-ink',
} as const

// ── 공통 모양 ds (b2b-redesign REQ-204, design.md '공통 모양 옮기기', docs/UI_GUIDE.md '공통 모양'). 옛 빈 자리 한 파일 밖의 앱 화면(대시보드 두 폴더 포함)·차트·미리보기는 ds만 쓴다.
// 토큰 클래스만 쓴다: 모서리 rounded-control(4px)·rounded-float(8px, 떠 있는 층), 그림자 shadow-float(층에만), 글자 11단계(글자색은 muted 이상, faint 글자 없음),
// 간격은 단계 0·0.5·1·1.5·2·3·4·5·6·8·12·16·24와 px뿐이다(classes.test.ts AC-204.6 규칙 시험). 넘침 자르기는 overflow-clip.
// 표의 tdNum·check는 아직 쓰는 화면이 없다 — 다음 대시보드 명세가 쓴다(차트 부품과 같다). button.ghost는 오류 화면 [로그아웃]이 쓴다(ui-90 TASK-8)

// 단추 공통: 4px 모서리, 1px 테두리(색은 종류마다), 가운데 정렬, 사이 8px, 줄바꿈 없음, 그림자 없음, 짧은 반응·기다림 모양.
// 굵기·높이·좌우 여백은 크기·종류 묶음이 하나씩만 준다(같은 속성 클래스가 겹치지 않게). flex 크기는 놓는 자리가 정한다
const dsButtonBase = `inline-flex cursor-pointer items-center justify-center gap-2 whitespace-nowrap rounded-control border ${focusRing} ${disabled} ${dsPress} ${dsBusy}`
// 기본 36px·좌우 16px·body 500 / 작은 32px·좌우 12px·small 500 / 큰 44px·좌우 20px·body 600 / 글자만 작은 32px·좌우 8px. 휴대폰은 모두 44px
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
    ghost: `${dsButtonBase} ${dsSize} ${dsGhostTone}`, // 글자만 기본 — 오류 화면 [로그아웃]
    ghostSmall: `${dsButtonBase} ${dsSizeGhost} ${dsGhostTone}`, // 승인 대기 위 줄 [로그아웃]
    googleLarge: `${dsButtonBase} ${dsSizeLarge} ${dsSecondaryTone}`, // [구글로 시작하기] — 안에 GoogleMark 18. 로그인 카드만 쓴다(dashboard-ux AC-2707.5)
    secondaryLarge: `${dsButtonBase} ${dsSizeLarge} ${dsSecondaryTone}`, // 보조 큰 단추(보조 색 × 큰 크기, dashboard-ux AC-2707.5): 연결 확인·로그인으로 같은 일반 용도
  },

  // 글자 단추·링크: 바탕 없음·accent·body 500 → 올림 밑줄(아래 3px), 색 150ms(transition). 휴대폰은 44px 높이
  textButton: `inline-flex cursor-pointer items-center gap-1 rounded-control text-body font-medium text-accent underline-offset-3 transition not-disabled:not-aria-disabled:hover:underline ${focusRing} ${disabled} max-md:min-h-11`,

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

  // 기간 단추 묶음(dashboard-ux AC-2703.2·AC-2707.4, 시안 .seg): 대시보드 추이 빠른 단추·통계 기간 고르기가 같이 쓴다. 값은 통계 기간 고르기 단추 그대로다.
  // 묶음 32px(테두리 포함)·4px·1px line-strong, 휴대폰은 전체 폭 칸 나눔(칸 수 max-md:grid-cols-N은 단추 수에 맞춰 놓는 자리가 준다)·단추마다 44px.
  // 눌린 것(aria-pressed) accent-soft · accent-strong 600. 올림 바탕만 짧게 바뀌고(transition), 눌린 단추에는 transition이 없어 눌린 표시가 바로 바뀐다
  segment: {
    group: 'inline-flex shrink-0 overflow-clip rounded-control border border-line-strong bg-surface max-md:grid max-md:w-full',
    button:
      'h-7.5 cursor-pointer border-l border-line-strong px-3 text-small first:border-l-0 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent max-md:h-11 max-md:px-1',
    on: 'bg-accent-soft font-semibold text-accent-strong',
    off: 'font-medium text-ink-2 transition hover:bg-canvas',
  },

  // 막대 그래프를 감싸는 칸(dashboard-ux AC-2707.4): 칸이 날짜 글자보다 좁아도 글자가 오른쪽으로 넘쳐 휴대폰 쪽이 옆으로 밀리지 않게 한다(tab-frame AC-311.7).
  // 대시보드 추이와 통계 탭 그래프(stats/sections/parts.tsx CHART_NO_SIDE_SCROLL)가 같이 쓴다
  chartNoSideScroll: 'relative [&_.text-center]:flex [&_.text-center]:flex-col [&_.text-center]:items-center [&_table]:right-0',
} as const
