# 설계: B2B 디자인 시스템 개편 (모든 화면, UI/UX만)

## 개요

**기준 시안.** 승인 시안 `docs/mockups/b2b-redesign/`(게시본 https://claude.ai/artifact/574fyw1mAQmqBw4jWjhr6f). 화면마다 `screens.mjs`의 함수(예: `landingPC`·`dashboardPC({ empty: true })`)와 `style.css`의 같은 이름 규칙을 읽어 옮긴다. 시안의 번호 핀(`.pin`)과 "지금/개편 후" 비교 칸은 설명용이라 옮기지 않는다.

**순서.** 바닥부터 올린다.
1. 토큰 한 곳(`globals.css`) + 글꼴(Pretendard) + 앱 공통 모양(`ui/classes.ts`의 새 묶음 `ds`·아이콘) + 차트 부품.
2. 그 위에 화면을 하나씩 다시 입힌다: 랜딩 → 인증 화면 → 앱 틀·대시보드 → 관리자.
3. 옛 이름을 지우고, 세 폭 사진으로 확인한다.

옛 Tailwind 이름은 1단계에서 새 토큰을 가리키는 **별칭**으로 남긴다. 그래서 아직 안 고친 화면도 깨지지 않고, 시험이 TASK마다 RED → GREEN으로 간다. 별칭은 마지막에 지운다(TASK-23).

**바뀌지 않는 것.** 기능·동작·API·인증·승인·DB·middleware·자료 계산. 페이지 파일은 틀 JSX만 바뀐다(REQ-201). 새 npm 패키지가 없다. 차트는 Next·React·Tailwind만으로 그린다.

**시험 방식(이번에 바꾸는 점).** landing-v2는 CSS 선언을 하나하나 박은 시험(`styles.test.ts`, 약 1,650줄)을 썼다. 이번에는 아래 셋으로 나눈다.
- **규칙 시험**: 토큰만 쓰는지, 간격 단계·글자 단계·모서리·굵기·금지 장식(AC-204.6·AC-212.1).
- **짜임·문구 시험**: 마크업 순서, 문구, 단추 종류, 숨김 도우미 붙은 곳(각 화면 AC).
- **화면 사진**: 픽셀 모양은 Phase 끝 사진과 TASK-24의 세 폭 측정이 본다.

이렇게 하면 시안 값을 조금 고칠 때마다 수십 줄의 시험을 고치지 않아도 된다.

## 구성 요소 / 인터페이스

```
src/app/
  globals.css          # :root 토큰 블록(REQ-202) · @theme inline(var만) · .app-ui 초기화 · body · a · 모션 줄이기
  layout.tsx           # next/font/local Pretendard 3굵기 → --font-pretendard
  fonts/               # Pretendard-{Regular,Medium,SemiBold}.subset.woff2 · OFL.txt (REQ-203)
  page.tsx             # 랜딩: .root > SiteHeader · main(섹션 6) · SiteFooter
  error.tsx            # <AuthFrame> 안 오류 카드 + 단추 줄
  login/page.tsx       # <AuthFrame aside={<LoginAside/>}><LoginCard/></AuthFrame>
  (onboarding)/signup/page.tsx · pending/page.tsx   # AuthFrame(그대로) — props만
  (app)/dashboard/page.tsx  # <DashboardView />
src/components/
  ui/classes.ts        # 새 묶음 ds.*(REQ-204) + 옛 묶음 ui.*(한 글자도 안 바꾸고 두었다가 TASK-23에서 지움)
  common/Icon.tsx      # 16px 선 아이콘(시안 parts.mjs의 I) — aria-hidden, currentColor
  common/GoogleMark.tsx# 구글 G(상표 색은 여기에만)
  common/LogoMark.tsx  # 그대로(주석의 쓰는 곳 크기만 고침)
  common/ErrorCard.tsx # 새 모양
  charts/              # REQ-205. 서버에서 그리는 순수 부품. Tailwind 클래스
    format.ts  scale.ts  Sparkline.tsx  KpiStat.tsx  StackedBarChart.tsx  ChartLegend.tsx  RankedBars.tsx  InlineBar.tsx
  preview/             # REQ-206. 예시 자료 + 미리보기(랜딩 히어로·로그인 오른쪽)
    sample.ts  DashboardPreview.tsx
  landing/             # CSS Modules(ADR-014 그대로), 토큰 var()만
    base.module.css  SiteHeader  Hero  AiSection  OrthoSection  FeaturesSection  PrivacySection  HowSection  SiteFooter  links.ts
    (지움) PromiseBand · HeroChart · heroFrames · StartSection · styles.test.ts
  auth/  AuthFrame(열 | 두 칸) · LoginCard · LoginAside(새) · Stepper(새) · SignupForm · PendingCard(+HeaderSignOut) · SignOutButton(그대로)
  shell/ AppShell · TabBar · AccountMenu · KstClock (모양만)
  dashboard/ DashboardView(새, DashboardEmpty 대체) · (지움) DashboardEmpty · todayTitle
  admin/ AdminApplications (모양만)
src/testing/boxes.ts   # 시험 도우미: 상자 안 상자 찾기(AC-204.7·AC-212.3)
```

### 토큰 블록 (`globals.css`)

```css
@theme inline {
  --color-*: initial;
  --color-canvas: var(--canvas); /* … REQ-202 색 토큰 전부, 차트·항목 색 포함 */
  --radius-*: initial;  --radius-control: var(--r-control);  --radius-float: var(--r-float);
  --shadow-*: initial;  --shadow-float: var(--elev-float);
  --text-*: initial;
  --text-caption: var(--fs-caption);  --text-caption--line-height: var(--lh-caption);
  /* small · body · lead · subtitle · title · heading-m · heading · metric · display-m · display */
  --text-heading--letter-spacing: var(--ls-heading);  /* heading-m·metric도 같음, display·display-m은 --ls-display */
  --font-sans: var(--font-ui);
  /* 옛 이름 별칭(TASK-23에서 지움) — 아래 표 */
}
:root { /* REQ-202 AC-202.1 값. 이 블록 밖에는 16진수 색이 없다 */ }
```

- 원래 값을 Tailwind 이름 공간(`--color-*`·`--text-*`·`--radius-*`·`--shadow-*`·`--font-*`) 밖의 이름(`--ink`·`--fs-body`·`--r-control`·`--elev-float`·`--font-ui`)으로 둔다. 그래서 `@theme inline`의 `--shadow-float: var(--elev-float)`처럼 자기 자신을 가리키는 일이 없다.
- `@theme inline`이라 Tailwind는 `--color-ink` 같은 변수를 따로 만들지 않고 클래스에 `var(--ink)`를 바로 쓴다(`text-ink { color: var(--ink) }`, `border-muted/55`는 `color-mix(… var(--muted) 55% …)`).
- 간격은 Tailwind 기본 `--spacing`(4px) 그대로이고, 쓰는 단계를 규칙 시험이 묶는다(AC-204.6).
- 화면 폭은 Tailwind 기본 `md`(768)·`lg`(1024)만 쓴다.

### 공통 모양 옮기기 (`ui` → `ds`)

- `ui` 묶음의 값을 그 자리에서 바꾸면 Phase 1에서 아직 안 고친 화면의 시험이 깨진다. 예를 들어 주 단추가 accent가 되면 관리자 시험의 "accent는 지금 탭에만"이 깨진다. 대시보드 시험의 `rounded-card` 개수, 가입 시험의 `aria-invalid:border-danger`도 깨진다.
- 그래서 TASK-4는 같은 파일에 새 묶음 `export const ds`를 더하기만 한다. `ui`는 한 글자도 바꾸지 않는다.
- 화면 TASK는 그 화면 컴포넌트와 그 화면 시험에서 `ui.*` 참조를 아래 표의 `ds.*`로 바꾼다. 이 바꾸기는 "고치는 옛 시험"의 한 항목으로 적는다. 시험의 `ui.X` → `ds.Y` 참조 바꾸기는 기대값 바꾸기가 아니다. 그 밖의 기대값이 바뀌는 시험은 이름을 따로 적는다.
- TASK-23에서 `ui`와 그 옛 시험(`classes.test.ts`의 AC-013.3 묶음·AC-013.4의 `ui` 목록)을 지운다.
- 마지막 이름은 `ds`다. 파일 이름은 그대로 `classes.ts`다.

| 옛 `ui` | 새 `ds` |
|---|---|
| `button.primary`·`primarySmall`·`secondary`·`secondarySmall`·`danger` | 같은 이름 + `primaryLarge`·`accentOutlineSmall`·`ghostSmall`·`googleLarge` |
| `textButton`·`focusRing`·`field`·`label`·`input`·`readonly`·`help`·`fieldError`·`checkbox`·`checkboxWrap`·`checkboxMark` | 같은 이름 + `labelHint` |
| `chip.neutral`·`waiting` / `done` / `progress`·`sample` / `rejected` | `chip.neutral` / `chip.positive` / `chip.accent` / `chip.negative` (+ `chip.warning`) |
| `card` | 없음(카드 상자를 뺀다) |
| `panel`·`panelHead`·`panelTitle`·`count` | 같은 이름 + `panelBody` |
| `table.*`(wrap·table·th·row·td·tdSub·tdNum·check·emptyRow) | 같은 이름 |
| `layer` | `layer`(8px) |

쓰는 곳이 없는 옛 키(`dangerSmall` 등)는 `ds`에 만들지 않는다.

### 옛 이름 별칭 (TASK-3에서 만들고 TASK-23에서 지움)

| 옛 이름 | 가리키는 새 토큰 | 지금 쓰는 곳 |
|---|---|---|
| `text-table` | small 13/20 | 표·칩 글자 |
| `text-tab` | body 14/22 | 앱 탭 |
| `text-panel`·`text-logo` | subtitle 16/24 | 패널 제목·로고 글자 |
| `text-title-sm` | title 20/28 | 폰 제목 |
| `text-kpi-sm`·`text-kpi` | metric 28/36 | (안 씀) |
| `rounded-card`·`rounded-chip` | `--r-control` 4px | 카드·단추·칩 |
| `*-ok`·`*-ok-soft` | positive·positive-soft | 완료 칩·완료 줄 |
| `*-danger`·`*-danger-soft` | negative·negative-soft | 오류 카드·위험 단추 |
| `*-warn` | warning | (안 씀) |
| 랜딩 `--ok`·`--ok-soft`·`--danger`·`--danger-soft` | `var(--positive)` … | 랜딩 칩 |
| 랜딩 `--accent-tint` | `var(--chart-2)` | 옛 히어로 막대 |
| 랜딩 `--field` | `var(--faint)` | 점선·점 |
| 랜딩 `--content-max` | `var(--w-landing)` | `.wrap` |
| 랜딩 `--font-sans` | `var(--font-ui)` | 옛 body |

같은 이름이 남는 것(`text-caption`·`text-body`·`text-lead`·`text-title`, 색 `ink`·`line`·`accent` …)은 별칭이 아니라 새 토큰 그대로다. `text-title`은 25/32에서 20/28로 바뀐다.

`theme.test.ts`의 "Tailwind는 `src/`만 본다" 시험은 실제 Tailwind로 만든 CSS에 앱 클래스가 있는지 본다. 지금 고른 클래스는 `lg:max-w-60`·`md:table-fixed`·`empty:sr-only`·`bg-ink`인데, 개편으로 없어질 수 있다. 그래서 TASK-3이 끝까지 남는 클래스(`max-md:hidden`·`flex-[1_1_160px]`·`shadow-float`)로 바꾼다. "시험 글자에만 있는 `overflow-hidden`은 만들지 않는다"는 그대로 둔다. 그래서 화면 소스는 `overflow-hidden` 대신 `overflow-clip`을 쓴다(AC-204.6).

### 차트 부품 (`components/charts`)

```ts
import type { BucketState, Delta } from '@/types/analysis'

// format.ts — 보이는 숫자는 버림(반올림 안 함, plan.md §5). 그리는 위치(%·좌표)만 toFixed로 자른다
export type DeltaUnit = '명' | '건' | '%p'
export type DeltaView = { dir: 'up' | 'down' | 'flat' | 'none'; text: string; srText: string }
export function formatCount(n: number): string                  // 12000000 → '12,000,000'
export function formatRate(r: number): string                   // 0~1 → '18.3' (첫째 자리 버림)
export function formatDelta(d: Delta, unit: DeltaUnit): DeltaView
export function percentOf(v: number, max: number): number       // 0~100으로 자르고 Number(x.toFixed(2)), max ≤ 0이면 0

// scale.ts
export function niceScale(max: number): { max: number; ticks: number[] }
// 간격 = max/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4
// 714 → { max: 800, ticks: [0, 200, 400, 600, 800] } · 0 → { max: 0, ticks: [0] }. compact는 ticks의 짝수 번째(0·400·800)만 그린다

export function Sparkline(p: { values: number[]; size?: 'md' | 'sm' }): JSX.Element | null
export type KpiStatProps = {
  label: string; value: number | null; format: 'count' | 'percent'; unit: string
  delta?: Delta | null; deltaUnit?: DeltaUnit; compareLabel?: string
  spark?: number[] | null; size?: 'md' | 'sm'; sparkOnPhone?: boolean
}
export function KpiStat(p: KpiStatProps): JSX.Element

export type BarSeries = { name: string; tone: 'accent' | 'chart-3' }        // 첫 계열이 맨 위·범례 첫째
export type BarBucket = { key: string; label: string; rangeLabel: string; state: BucketState; values: number[]; note?: string }
export function StackedBarChart(p: { chartId: string; title: string; unit: string; series: BarSeries[]; buckets: BarBucket[]; compact?: boolean }): JSX.Element

export type LegendItem = { label: string; mark: 'accent' | 'chart-3' | 'hatch' | 'prev' }
export function ChartLegend(p: { items: LegendItem[] }): JSX.Element

export type RankedItem = { name: string; value: number; rest?: boolean }   // rest = '그 밖'·'주소 없음'
export function RankedBars(p: { title: string; unit: string; items: RankedItem[]; showShare?: boolean }): JSX.Element

export function InlineBar(p: { current: number; previous: number | null; max: number }): JSX.Element
```

- **HTML 막대.** 쌓은 막대·순위 막대·줄 안 막대는 `div`/`span` + % 높이·폭(inline style)으로 그린다. 눈금 글자·값 글자는 HTML 글자다.
  - 이유: 시안처럼 viewBox SVG로 그리면 칸 폭이 바뀔 때 글자까지 줄고 는다(1024px 폭 히어로에서 12px → 약 9.6px). HTML이면 글자는 늘 12px이고 막대만 늘어난다. 서버에서 그대로 그리고 크기를 재는 클라이언트 코드가 없다.
  - SVG는 Sparkline(고정 88×28·56×22), 빗금(막대 안에 꽉 채운 `<svg>` + `<pattern id="<chartId>-hatch">`, userSpaceOnUse라 빗금 간격이 늘 4px), 화살표·범례 표시에만 쓴다.
- **접근성.** 그림은 모두 `aria-hidden="true"`. 쌓은 막대는 `sr-only` 표가 숫자를 준다. KpiStat·RankedBars는 보이는 글자가 곧 정보다. 증감 방향은 화면 읽기 글자("늘어남"·"줄어듦")로도 준다.
- **색.** `fill-accent`·`stroke-accent`·`bg-chart-3`·`bg-line-strong`·`bg-faint` 같은 토큰 클래스만 쓴다. 차트 색 토큰은 `@theme` 색에 들어 있어 클래스가 된다.
- **자료 모양.** 부품은 `@/types/analysis`의 `Delta`·`BucketState`를 그대로 받는다. 다음 대시보드 명세에서 `Summary.series.week`(`BucketRef`)를 `BarBucket`으로 옮기는 일은 이름 바꾸기뿐이다(totals.newPatients·returning → values, range → rangeLabel).
- **비율 표시.** 소수 첫째 자리까지 **버림**이다(plan.md §5 "반올림하지 않는다"를 비율 표시에도 따름). 부동소수 오차 때문에 `Math.trunc(x * 10 + 1e-9) / 10`처럼 아주 작은 값을 더해 자른다(음수는 절댓값으로 자른 뒤 부호). 다음 대시보드 명세에서 바꿀 수 있다.

### 미리보기 (`components/preview`)

- `sample.ts`: 시안 `parts.mjs`의 `WEEKS`를 `BarBucket[]`로 옮기고, KPI 4개를 마지막 완료 주와 그 전 주에서 만든다(AC-206.1). 모두 예시이며 실제 자료를 읽지 않는다.
  - 증감·비율을 여기서 계산한다. 예시 자료 파일 안에서만이다. 실제 화면은 `lib/analytics/compare.ts`가 만든 값을 그대로 보여 준다.
- `DashboardPreview.tsx`: 위 줄 · 탭 · KPI 4 · 쌓은 막대(compact). 서버 컴포넌트, 받는 것·누르는 것·이정표 요소가 없다(랜딩 AC-007.1과 page.test의 header·section 개수 시험 때문).
- 시안의 이 값들은 버림 규칙 때문에 조금 다르게 보인다: 신환 증감 "+4.0%" → "+3.9%", 신환율 증감 "0.3%p" → "0.2%p".

### 랜딩 (CSS Modules)

- 섹션은 6개다: `#top` · `#ai`(띠) · `#ortho` · `#features` · `#privacy`(띠) · `#how`. 약속 띠는 히어로 안 약속 목록이 되고, 시작하기 섹션은 `#how`에 합친다.
- `base.module.css`:
  - 요소 초기화(`.root :where(h1, h2, h3, p, ol, ul, dl, dd, figure)`·`.root a`·`.root *`의 box-sizing)는 `@layer base { }` 안에 둔다. layer 밖 CSS는 Tailwind 클래스보다 늘 이기기 때문이다. 미리보기(Tailwind)의 `mt-1` 같은 클래스가 랜딩 초기화에 지지 않게 한다.
  - 클래스 규칙(`.wrap`·`.grid`·`.sec`·글자 단계·단추·칩·숨김 도우미)은 layer 밖에 둔다.
  - 섹션 모듈은 `.shot` 같은 자리 클래스만 미리보기 바깥에 주고, 미리보기 안쪽 요소를 고르지 않는다.
- 숨김 도우미: `.pcOnly`(767.98px 이하에서 `display: none !important`), `.phoneOnly`(768px 이상에서 숨김), `.srOnly`. `display: none`이라 화면 읽기에서도 빠진다. 그래서 휴대폰·PC에 다른 문구(기능 목록 짧은 설명, 정형외과 휴대폰 표)를 두어도 두 번 읽히지 않는다.
- 정형외과 표: `ORTHO` 배열 하나(이름·보는 숫자·기준·예시 값 쌍)에서 PC 표(`.pcOnly`)와 휴대폰 표(`.phoneOnly`)를 그린다. 표를 CSS로 뒤집을 수 없어서다.
- `#how`의 단추: 휴대폰에서 단계 뒤로 가야 한다. 같은 DOM에서 grid `order`로 옮긴다.
- 위쪽 메뉴: 휴대폰은 한 줄(로고 · 단추)이고 nav는 숨긴다. 섹션 링크는 768px 이상에서만 보인다. 로고 링크에 보이는 글자가 없으므로 `.srOnly` "맨 위로"로 이름을 준다.

### 인증 화면

- `AuthFrame({ children, headerEnd?, aside? })`:
  - aside 없음 → 480 열: 맨 위 줄(로고 28 + headerEnd)과 본문이 같은 왼쪽 끝을 쓴다(지금의 띠 x=24 vs 본문 x=240 어긋남 해결).
  - aside 있음 → 1024px 이상 두 칸. 왼쪽 400 열은 위 로고 · 가운데 본문 · 아래 소개 줄. 오른쪽은 canvas `<aside>`. 1024px 미만은 한 칸이고 aside를 숨긴다.
  - 어느 쪽이든 `<main>`이 하나다.
- `Stepper({ current: 2 | 3 })`(새): 가입 신청·승인 대기가 같이 쓴다. 끝난 단계는 체크 칸 + 화면 읽기 "끝남", 지금 단계는 `aria-current="step"`.
- `LoginCard`는 폼 부분만 그린다. 소개 문장은 `LoginAside`로, 소개 줄은 AuthFrame 왼쪽 아래로 옮긴다. 구글 단추는 보조 모양 + G 마크(흰 사각형 없이).
- 앱 안 브라우저 안내 상자는 테두리를 뺀다(canvas 바탕만). 안의 읽기 전용 칸이 테두리를 가져서 상자 안 상자가 되기 때문이다(AC-204.7).
- 승인 대기·거절: 본문 [로그아웃]을 뺀다(사용자 승인). 위 줄 `HeaderSignOut`은 글자만 단추(ghost)다.

### 앱 틀·대시보드·관리자

- `AppShell`: `<div class="sticky top-0 z-10">` 안에 `<header>`와 `<TabBar>`. 안쪽 감싸개 셋(띠·탭·본문)은 같은 `mx-auto w-full max-w-7xl px-6 max-md:px-4`다. 첫 탭은 `md:-ml-3`으로 글자를 로고 끝에 맞춘다.
- `TabBar`: 준비 중 탭은 faint 글자. 툴팁·밀기·지금 탭 판단 코드는 그대로이고 클래스만 바뀐다.
- `DashboardView`: 도구 줄 · KPI 줄(KpiStat value null) · 빈 패널. 막힌 단추는 `disabled`라 누를 수 없고 Tab 순서에도 들지 않는다. 숫자·차트·예시가 없다.
- `AdminApplications`: 패널 틀(흰 상자·안쪽 여백)을 빼고 표를 본문 위에 바로 둔다(위아래 1px 선). 상태 칩을 뺀다. 휴대폰 줄은 지금처럼 같은 표의 줄을 CSS로 세로로 쌓는다.

## 데이터 흐름
- 없다. 서버·DB·브라우저 저장소·네트워크를 새로 쓰지 않는다.
- 미리보기와 차트 시험은 `preview/sample.ts`와 시험 안 예시 값만 쓴다. 실제 `/dashboard`는 자료를 읽지 않는다(지금과 같다).

## 결정과 트레이드오프

**사용자 결정(2026-10-30)**
1. 대시보드는 디자인만. 차트 부품 + 예시 미리보기(랜딩·로그인), 실제 대시보드는 빈 상태. 파일 올리기 연결은 다음 명세.
2. 위쪽 가로 탭 유지 + 띠와 함께 붙음.
3. Pretendard(`next/font/local`, OFL), Plex 뺌, 숫자 자릿수 맞춤.
4. 빈칸 → 자연스러운 문구. `[서비스 이름]`은 숨김(로고 옆 병원 이름만).
5. 로고 C③ 유지(유일한 예외 색).
6. 승인 대기·거절 [로그아웃] 하나.

**Claude 판단**

- **ADR-019 (TASK-1에서 `docs/ADR.md`에 더함).** 초안:
  > **ADR-019: 디자인 토큰 한 곳 + Pretendard** (ADR-014·015·018의 토큰·글꼴 줄을 바꿈)
  > **결정**: 토큰 값(색·차트 색·글자 크기/줄 높이/자간·모서리·그림자·틀 폭·글꼴 묶음)은 `src/app/globals.css`의 layer 밖 `:root` 한 곳에 CSS 변수로 둔다. 앱(Tailwind v4)은 `@theme inline`에서 이 변수를 `var()`로만 가리키고(기본 팔레트·모서리·그림자·글자 크기는 `initial`로 지움), 랜딩(CSS Modules)은 같은 변수를 바로 쓴다. 차트·미리보기 부품(`components/charts`·`components/preview`)은 앱 쪽 Tailwind로 만들고 랜딩이 그대로 놓는다. 랜딩 요소 초기화는 `@layer base` 안에 둔다. 글꼴은 Pretendard 1.3.9 정적 subset 세 굵기(400·500·600)를 `next/font/local`로 우리 쪽에서 낸다(`src/app/fonts/`, `OFL.txt` 함께). IBM Plex Sans KR을 뺀다.
  > **이유**: 사용자 결정 2026-10-30(한 벌의 디자인 규칙, Pretendard). 값이 한 곳이면 랜딩과 앱이 어긋날 수 없다(지금은 `@theme`과 랜딩 `:root`에 두 번 있어 시험으로 묶었다). 정적 subset은 글꼴 저자가 낸 파일 그대로라 OFL의 Reserved Font Name 조건(고친 글꼴은 다른 이름을 써야 함)에 걸리지 않는다. 가변 글꼴 전체(2.0MB)보다 작고, `next/font/local`은 unicode-range 조각(dynamic subset)을 받지 못한다. CSP는 그대로 `font-src 'self'`다.
  > **트레이드오프**: 글꼴 세 파일 합 804,172바이트(약 785KB)를 첫 방문에 받는다(캐시 뒤에는 없음). `next/font`가 모든 페이지에서 세 파일을 미리 받는다(preload) — 사용자 결정의 글꼴이라 받아들인다. Plex(구글이 나눈 조각)보다 첫 방문이 무겁다 → 810,000바이트 상한을 시험으로 묶는다. subset 밖의 드문 한글 음절은 맑은 고딕·Apple SD Gothic Neo로 보인다. 옮기는 동안 옛 Tailwind 이름 별칭이 잠시 남는다. 스타일링 방식은 여전히 둘(랜딩 CSS Modules, 앱 Tailwind)이지만 같은 토큰을 쓰고 규칙 시험이 둘 다 본다.
  - 상태 줄: ADR-014("글꼴·토큰은 ADR-019"), ADR-015("토큰·글꼴 줄은 ADR-019"), ADR-018("색·글꼴·랜딩 짜임·미리보기는 b2b-redesign·ADR-019가 대체. 그림 없음·로고 C③은 그대로").
- **글꼴 파일 고르기.**
  - 가변 글꼴 전체(`PretendardVariable.woff2` 2,057,688바이트): 너무 크다.
  - 가변 dynamic subset(92조각): `next/font/local`로는 조각별 unicode-range를 줄 수 없다.
  - 직접 subset 만들기: OFL "고친 글꼴"이 되어 이름을 바꿔야 한다. 도구(fonttools)도 더 필요하다.
  - 그래서 정적 subset 세 파일(각 약 262KB)을 고른다. 다른 굵기(700 등)를 쓰면 가짜 굵게가 되므로 규칙 시험이 막는다(AC-203.3).
  - 받는 법: scratchpad에서 `npm pack pretendard@1.3.9`로 꾸러미만 받아 풀고 세 파일과 `dist/LICENSE.txt`를 복사한다. 의존성에 넣지 않는다(`package.json` 그대로).
- **글자 단계.** 사용자 표 8단계에 lead(16/24 보통)·heading-m·display-m(휴대폰)을 더해 11단계다. 768px 미만은 `-m` 단계, 이상은 PC 단계를 쓴다.
- **간격 단계.** 사용자 표 9단계(4·8·12·16·24·32·48·64·96)에 패널 안쪽 20, 칩·툴팁 안쪽 2·6을 더한다. 시안의 9·10·11·14px은 가까운 단계나 고정 높이(줄 44px 등)로 바꾼다.
- **단추.** 주 단추가 ink에서 accent(파랑)로 바뀐다(시안). 화면마다 주 단추는 하나만 둔다.
- **휴대폰 누름 영역.** 단추·탭·입력은 휴대폰에서 44px이다(지금 규칙 유지). 시안 휴대폰 관리자 단추(36px)는 44px로 둔다. 랜딩 휴대폰 메뉴 단추는 32px 모양에 44px 누름 영역(`::after`)이다.
- **대시보드 제목.** 시안대로 "대시보드"이고 날짜는 위쪽 띠의 한국 시각이 보인다. `todayTitle.ts`는 쓰는 곳이 없어지므로 지운다. 동작이 아니라 제목 글자 모양이다.
- **옛 시험 다루기.** 각 TASK의 "고치는 옛 시험"에 이름을 적고 그것만 지우거나 기대값을 고친다.
  - 동작 시험(클릭·초점·보내기·이동)은 기대값을 고치지 않는다(AC-201.3).
  - 모양·문구가 바뀐 시험은 새 AC 이름의 시험으로 바꾼다. 옛 이름 시험에서 문구 한 줄만 바뀌면 그 줄만 고친다.
  - 통째로 사라지는 화면 조각(약속 띠·히어로 순환·시작하기 섹션·작은 카드·통계 미리보기)의 시험은 파일·describe째 지운다.
- **검사 목록을 점점 넓힌다.** AC-204.6·AC-204.7·AC-212.1의 검사 목록은 TASK마다 그 TASK가 고친 파일·화면을 더한다. 랜딩은 TASK-14, 앱은 TASK-23에서 전체로 바꾼다. 아직 안 고친 화면 때문에 시험이 계속 실패하지 않게 해서, TASK마다 RED → GREEN을 볼 수 있게 한다(landing-v2와 같은 방식).
- **상자 겹침 시험 도우미.** `src/testing/boxes.ts`의 `nestedBoxes(root: Element, isBox: (el: Element) => boolean): string[]`.
  - jsdom에서 그린 마크업을 훑어, 상자 안에 든 상자의 경로를 돌려준다. `aria-hidden` 안쪽은 건너뛴다.
  - `isBox` 기본값은 클래스 목록에 `border` 낱말이 있는 블록 요소다.
  - 랜딩은 CSS Module에서 네 변 테두리를 주는 클래스의 해시 이름을 더한다.

## 시안과 다른 점
- 단추 좌우 여백: md 14 → 16px, lg 20px, sm 12px(간격 단계).
- 차트: SVG viewBox 대신 HTML 막대(글자 크기 고정). 차트 SVG의 `role="img"`·`aria-label` 대신 `aria-hidden` + `sr-only` 표(랜딩 "모든 svg는 꾸밈" 규칙과 두 번 읽힘 방지).
- 비율 버림: 미리보기 신환 "+3.9%", 신환율 "0.2%p"(시안 "+4.0%", "0.3%p").
- 로그인 왼쪽 400 열은 가운데(시안은 왼쪽 120px). 1024px 폭에서도 들어가게.
- 관리자 표 아래 "대기 중인 신청 N건" 줄은 두지 않는다(탭 개수와 겹침).
- 승인 대기 `dl` 줄 위아래 10 → 12px. 히어로 위 여백 80 → 64px(1024 이상).
- 개인정보 흐름의 멈춤 줄은 PC·휴대폰 모두 지금 문구 그대로("환자 이름 · 주민번호 · 차트번호 · 파일 이름", 시안은 빈칸 없는 가운뎃점·휴대폰 짧은 문구). 대시보드 빈 안내 첫 문장은 휴대폰에서도 PC 문구 그대로.
- 768~1023px(시안에 없는 폭): 랜딩 두 칸 배치는 쌓이고, 목록 두 칸(개인정보 약속)은 두 칸 그대로다.
- 앱 탭 띠는 지금 코드처럼 1024px 미만에서 옆으로 밀린다.
- 인증 화면 좁은 폭의 본문 위 여백은 32px(간격 단계).

## 위험 / 미해결 질문
- **Tailwind `@theme inline` + `var()` + `--text-*: initial`.** 4.3.3에서 기대대로 클래스가 나오는지 TASK-3에서 `npm run build` 뒤 만든 CSS(`.next/static/css`)로 확인한다(`text-small`에 `font-size: var(--fs-small)`, `text-sm`이 없음). 안 되면 `--text-*: initial` 대신 쓰는 기본 이름만 하나씩 지우고, 그 결정을 TASK-3 보고에 적는다.
- **layer 밖 랜딩 CSS vs Tailwind 부품.** 랜딩 섹션 모듈이 미리보기 안쪽 요소를 고르면 Tailwind 클래스를 이긴다. 섹션 모듈은 미리보기 바깥 자리만 정한다(시험: 섹션 모듈 선택자에 미리보기 클래스가 없다). Phase 2 사진으로 확인한다.
- **글꼴 무게.** 첫 방문 약 785KB. 화면 사진 단계에서 첫 화면 그리는 시간을 따로 재지는 않는다. 필요하면 다음에 굵기 수를 줄인다(500 → 600 합치기 등).
- **subset 밖 글자.** 병원 이름에 드문 음절이 있으면 그 글자만 시스템 글꼴로 보인다.
- **색 대비.** 재진 막대(chart-3)·지난 기간(chart-prev)·준비 중 탭(faint)은 흰 바탕 대비 3:1이 안 된다. 차트 값은 늘 글자와 `sr-only` 표로도 주고, 준비 중 탭은 누를 수 없는 단추라 WCAG 1.4.3 예외다. 늘어남 초록(#15803D)은 옅은 바탕 위 4.58:1로 겨우 넘는다 → 칩 글자는 500 이상.
- **중간 단계의 섞인 모양.** Phase 1 뒤에는 새 토큰 값(4px 모서리, 파랑 주 단추)과 옛 배치가 섞여 보인다. Phase 사진은 중간 상태다. 운영 배포는 Phase 6 확인 뒤 사용자가 OK할 때만 한다.
- **시험 대량 교체.** 옛 시험을 지우며 동작 확인을 함께 잃을 수 있다. TASK마다 "고치는 옛 시험" 목록 밖은 손대지 않고, 리뷰어가 `git diff`로 목록과 맞는지 본다(AC-201.3).
- **휴대폰·PC 두 벌 문구.** 정형외과 표·기능 짧은 설명은 마크업에 두 번 있다(하나는 `display: none`). 글자 수를 세는 시험은 이 점을 알고 쓴다.
