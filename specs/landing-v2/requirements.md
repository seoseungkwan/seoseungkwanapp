# 요구사항: 랜딩페이지 디자인 전면 개편 (Linear·Stripe 톤, 제품 화면 미리보기)

> 기능 ID: `landing-v2` · 형식: 요구사항은 `### REQ-101: 제목`, 수용 기준은 `- AC-101.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.
> 번호는 101부터다. 같은 시험 파일에 남는 옛 `landing` 명세 시험(AC-001.1~008.1)과 이름이 겹치지 않게 한다.

## 배경 / 목표
- 사용자 결정(2026-10-30): 랜딩이 "AI가 만든 템플릿"처럼 보인다. 디자인을 전면 개편한다.
  - 톤: Linear의 절제 + Stripe의 데이터 중심.
  - 일러스트·사진을 빼고 실제 제품 화면을 줄여 그린 미리보기로 보여 준다.
  - 색: 중립 회색 + 강조색 하나.
  - 칸: 휴대폰 1줄 · 태블릿 2줄 · PC 12칸. 휴대폰 메뉴는 작게.
  - 쓸데없는 그림자·그라데이션·장식을 없앤다.
  - **기능과 동작은 바꾸지 않는다(UI/UX만).**
- 사용자 결정(2026-10-30, 같은 날 고침): 로고 마크를 병원 십자(비교 시안 `docs/mockups/landing-v2/logo-options.html`의 **C③**, 게시본 https://claude.ai/artifact/X9wdjCVHdHuBnsoonUEpT6)로 바꾼다.
  - 모양: 둥근 네모 테두리 안에 꽉 찬 둥근 십자가 있다.
  - 색: 테두리 청록 `#14C8BA`, 십자 보라 `#6D5DF5`로 고정한다. 예전 로고 색이 좋다고 했다.
  - 강조색 하나 규칙에서 로고만 예외다.
  - 빨강은 쓰지 않는다. 적십자 표장은 법으로 사용이 제한된다.
  - 랜딩 메뉴·앱 틀(AppShell)·인증 화면 틀(AuthFrame)이 같은 `LogoMark`를 쓴다.
  - 처음에 정했던 "막대 세 개를 한 색(ink)으로"를 대체한다.
- 기준 시안: 사용자가 승인한 `docs/mockups/landing-v2/index.html`(게시본 https://claude.ai/artifact/UbFfEzgrKExnLgsjtoZv2o)이다. 아래 값은 모두 이 시안의 CSS에서 옮겼다. 색·글자·간격 규칙은 `docs/UI_GUIDE.md` 랜딩 절(이 명세와 함께 고침)을 따른다.
- 이 명세가 옛 명세를 대체하는 부분:
  - 옛 `landing` 명세의 REQ-006(그림 6장)
  - UI_GUIDE 랜딩 원칙 2("한 가지 색으로 통일하지 않는다")
  - 옛 시안 `docs/mockups/landing/landing-mockup.dc.html`의 모양 값
- 옛 `landing` 명세의 동작 AC는 그대로 유효하고, 그 시험도 그대로 둔다(REQ-101). `specs/landing/`은 고치지 않는다.
- 문구는 모두 그대로다. 바뀌는 문구는 두 가지뿐이다.
  - 개인정보 약속 2의 강제 줄바꿈 하나를 뺀다.
  - 미리보기 안에 예시 글자가 새로 생긴다(탭 이름·월·예시 숫자, 모두 "예시" 표시와 함께).
  - 영문 소제목(AI ANALYSIS 등)은 빼고, 그 자리에 다른 것을 넣지 않는다.

## 요구사항

### REQ-101: 바뀌지 않는 동작
> REQ-101의 AC는 옛 `landing` 명세(와 auth 명세)의 AC 이름을 단 기존 시험이 맡는다. 아래에 그 AC ID를 모두 적어 추적표에 나오게 했다. 같은 내용의 새 시험을 따로 만들지 않고, 그 시험은 고치지 않는다.

- AC-101.1: Given 개편한 `/`, When 서버 마크업을 보면, Then 옛 AC(AC-001.1, AC-001.2, AC-001.3, AC-002.1, AC-002.2)가 그대로 맞는다. 맡는 시험: `page.test.tsx`·`top.test.tsx`·`bottom.test.tsx`의 옛 이름 시험.
  - 섹션 순서: header → `#top` → 핵심 약속 띠 → `#ai` → `#ortho` → `#features` → `#privacy` → `#how` → `#start` → footer.
  - `<main>` 하나 안에 `<section>` 8개, header·footer는 하나씩.
  - 메뉴 4개와 `#` 링크·id는 그대로다.
  - h1은 `숫자로 보는<br/>우리 의원`.
  - [구글로 시작하기]는 메뉴·히어로·시작하기에 하나씩 3개이고, 모두 `href="/login"`, `<a>` 안에는 글자만 있다.
  - [AI 분석 보기]는 하나이고 `#ai`로 간다.
- AC-101.2: Given `heroFrames.ts`와 `HeroChart`, When 시험을 돌리면, Then 옛 AC(AC-003.1, AC-003.2, AC-003.3, AC-004.1, AC-004.2, AC-004.3)가 그대로 맞는다. `heroFrames.ts`·`heroFrames.test.ts`는 고치지 않고, `HeroChart.test.tsx`·`globals.test.ts`의 옛 시험도 그대로 통과한다.
  - 틱 값·순환·2600ms 주기. 모션 줄이기면 타이머가 없다.
  - 서버 그림은 틱 0이다: "오늘 외래 128 명", 한 덩어리 글자 "신환율 18.2%", `stroke-dasharray="18 100"`, 막대 `style="height:N%"` 6개.
  - globals.css의 모션 줄이기 전역 규칙.
- AC-101.3: Given 페이지, When 글자를 보면, Then 옛 AC(AC-005.1, AC-005.2, AC-005.3)가 그대로 맞는다.
  - 정한 문구와 `[ ]` 빈칸.
  - 예시 표시: "숫자는 예시"는 히어로, "방금 생성 · 예시"는 `#ai`.
  - "Powered by AI"와 그라데이션 글자가 없다.
- AC-101.4: Given 페이지, When 마크업을 보면, Then 옛 AC(AC-007.1, AC-008.1)가 그대로 맞는다.
  - `form`·`input`·`textarea`·`button`·`select`·`label`이 없다.
  - 채팅 칩은 `<span>`, "통계 파일을 여기에 놓기"는 `<div>`.
  - 모든 `<svg>`가 `aria-hidden="true"`이고, 페이지 전체에 10개를 넘는다.
  - 미리보기는 실제 앱 컴포넌트(TabBar·AccountMenu·SignOutButton·KstClock)를 쓰지 않는다.
- AC-101.5: Given `src/lib/csp.ts`·`src/middleware.ts`·`globals.css`의 `@theme`, When 시험을 돌리면, Then 아래가 바뀌지 않는다. 맡는 시험: `csp.test.ts`·`middleware.test.ts`, 그리고 `theme.test.ts`의 Tailwind·`@theme` 시험(auth 명세 AC-013.1, 이름 그대로).
  - CSP·보안 헤더.
  - middleware matcher와 `/` 공개.
  - `@theme` 토큰(색 13·모서리 2·글자 11·그림자 1)과 Tailwind 불러오기.

### REQ-102: 전역 토큰과 글꼴
- AC-102.1: Given `src/app/globals.css` layer 밖의 랜딩 `:root`, When 변수를 읽으면, Then 아래 값만 있다.
  - 색: `--ink: #111827` · `--ink-2: #374151` · `--muted: #6b7280` · `--line: #e5e7eb` · `--canvas: #f7f8fa` · `--surface: #ffffff` · `--accent: #2563eb` · `--accent-soft: #eaf1fe` · `--ok: #166534` · `--ok-soft: #e7f6ec` · `--danger: #c2410c` · `--danger-soft: #fff1e8`
  - 섞은 색: `--accent-tint: color-mix(in srgb, #2563eb 32%, #ffffff)` · `--field: color-mix(in srgb, #6b7280 55%, #ffffff)`
  - 틀: `--content-max: 1200px` · `--gutter: 24px`
  - 색 12개는 `@theme`의 같은 이름 `--color-*` 값과 같다(대소문자 무시).
  - 옛 변수는 없다: `--bg-*`, `--border-card`, `--text-strong`·`--text-body`·`--text-muted`, `--teal-*`·`--violet-*`·`--amber-*`·`--pink-*`·`--blue-*`·`--coral-*`·`--warn-*`.
- AC-102.2: Given `body` 규칙, When 읽으면, Then 아래와 같다. layer 밖 선택자는 `:root`·`body`·모션 줄이기 블록뿐이다.
  - `background: var(--surface)`, `color: var(--ink)`
  - `font-family: var(--font-sans), system-ui, sans-serif`
  - `word-break: keep-all`, `overflow-x: clip`
- AC-102.3: Given `@layer base`, When 읽으면, Then 랜딩 요소 규칙은 `a { color: var(--accent) }` 하나뿐이고 `a:hover` 규칙이 없다. `.app-ui` 초기화는 그대로다.
- AC-102.4: Given `src/app/layout.tsx`와 `src/`, When 읽으면, Then 글꼴은 IBM Plex Sans KR 하나다.
  - `next/font/google`에서 `IBM_Plex_Sans_KR`(weight 400·500·600·700, `variable: '--font-plex'`) 하나만 불러오고, `Space_Grotesk`가 없다.
  - `:root`에 `--font-sans: var(--font-plex), system-ui, sans-serif`가 있다.
  - `--font-num`·`--font-grotesk`는 시험 파일 밖 `src/` 어디에도 없다.

### REQ-103: 로고 마크 (병원 십자 C③)
- AC-103.1: Given `<LogoMark size={22} />`, When 그리면, Then 다음과 같다.
  - 바깥: `<svg aria-hidden="true" width="22" height="22" viewBox="0 0 30 30">`. 바깥 svg에는 `fill`·`stroke`가 없다.
  - 안에는 정확히 두 원소가 이 순서로 있다(비교 시안 C③ 그대로).
    - 테두리: `<rect x="3" y="3" width="24" height="24" rx="6" fill="none" stroke="#14C8BA" stroke-width="2.4"/>`
    - 십자: `<path d="M13.5 8h3a1 1 0 0 1 1 1v3.5H21a1 1 0 0 1 1 1v3a1 1 0 0 1-1 1h-3.5V21a1 1 0 0 1-1 1h-3a1 1 0 0 1-1-1v-3.5H9a1 1 0 0 1-1-1v-3a1 1 0 0 1 1-1h3.5V9a1 1 0 0 1 1-1z" fill="#6D5DF5"/>`
  - 색은 이 두 값으로 고정이다. `currentColor`·다른 색 값·`style`이 없다. 빨강 계열도 없다(적십자 표장 혼동 금지).
  - `size`가 너비·높이가 된다(앱 틀·인증 틀 26). `className`을 넘기면 svg에 붙고, 안 넘기면 class가 없다.
- AC-103.2: Given 시험 파일 밖 `src/`와 로고를 그리는 세 화면, When 보면, Then 다음과 같다.
  - 십자 path 글자(`M13.5 8h3`)는 `src/components/common/LogoMark.tsx`에만 있다.
  - 옛 막대 좌표 글자(`x="9" y="3"`·`x="11" y="12"`·`x="8" y="21"`)는 어디에도 없다.
  - `AppShell.tsx`(26)·`AuthFrame.tsx`(26)·`SiteHeader.tsx`(22)는 다음을 지킨다.
    - `LogoMark`를 하나씩 import해 그린다.
    - 직접 그린 `<svg>`·`<rect>`가 없다.
    - `#14C8BA`·`#6D5DF5`(대소문자 무시)가 없다. 로고 색은 LogoMark 한 곳에만 있다.
  - 그린 화면마다 로고 svg(viewBox 0 0 30 30)가 하나이고, `LogoMark` 출력과 같다(배치용 class만 다를 수 있음).

### REQ-104: 그림을 모두 뺀다
- AC-104.1: Given `/` 마크업과 `src/components/landing/`, When 보면, Then 다음이 모두 없다.
  - `<img>`·`<picture>`·`<video>`(0개)
  - `next/image` import
  - CSS `url(`
- AC-104.2: Given 저장소, When 파일을 보면, Then 아래 파일이 없다. 승인 기록 `docs/mockups/landing/images/`(6장)는 남는다.
  - `public/landing/`(jpg 6장)
  - `src/components/landing/images.ts`, `images.test.ts`

### REQ-105: 랜딩 공통 모양과 CSS 규칙
- AC-105.1: Given `src/app/page.tsx`, When 그리면, Then header·main·footer를 `base.module.css`의 `.root` 클래스 `<div>` 하나가 감싼다. `.root`는 다음과 같다.
  - `background: var(--surface)`, `color: var(--ink)`, `font-size: 14px`, `line-height: 22px`
  - `font-variant-numeric: tabular-nums`, `word-break: keep-all`
  - 안쪽 요소(`::before`·`::after` 포함)는 `box-sizing: border-box`.
  - `h1·h2·h3·p·ol·ul·dl·dd·figure`의 margin·padding은 0이고, 목록 점이 없다.
  - 링크는 `color: inherit; text-decoration: none`이다.
  - 링크 초점은 `outline: 2px solid var(--accent); outline-offset: 2px`이다.
- AC-105.2: Given `base.module.css` 글자 단계, When 읽으면, Then 휴대폰 → 768px → 1024px 값(크기/줄 높이)이 아래와 같다.

  | 클래스 | 휴대폰 | 768px | 1024px | 굵기·기타 |
  |---|---|---|---|---|
  | `.tDisplay` | 34/42 | 44/52 | 56/64 | 600, 자간 -0.02em |
  | `.tH2` | 24/32 | 28/36 | 32/40 | 600, -0.015em |
  | `.tH3l` | 20/28 | 22/30 | 22/30 | 600, -0.01em |
  | `.tH3` | 17/24 | 18/26 | 18/26 | 600 |
  | `.tLead` | 16/26 | 18/28 | 18/28 | `var(--ink-2)`, 최대 폭 640px |
  | `.tBody` | 14/22 | 15/24 | 15/24 | `var(--ink-2)` |
  | `.tSmall` | 13/20 | | | |
  | `.tLabel` | 13/20 | | | 500, `var(--muted)` |

- AC-105.3: Given `base.module.css` 틀과 간격, When 읽으면, Then 아래와 같다.
  - `.wrap`: `max-width: 1248px`(내용 1200 + 좌우 24), `margin-inline: auto`, `padding-inline` 16px → 24px(768).
  - `.sec`: `padding-block` 56px → 80px(768) → 96px(1024). `scroll-margin-top` 96px → 64px(768).
  - `.secCanvas`: `background: var(--canvas)`.
  - `.stack`: gap 32px → 40px → 48px.
  - `.head`: gap 12px → 16px, `max-width: 760px`.
- AC-105.4: Given 카드·항목·묶음, When 읽으면, Then 아래와 같다.
  - `.card`: 흰 바탕(`var(--surface)`), `1px solid var(--line)`, `border-radius: 6px`, padding 16px → 24px(768), `min-width: 0`.
  - `.item`: `border-top: 1px solid var(--line)`, `padding-top` 16px → 20px(768).
  - `.group`: 휴대폰에서는 테두리 하나(흰 바탕·1px line·6px) 안에 카드들이 테두리 없이 위 1px 선으로 나뉜다. 768부터는 카드마다 제 테두리를 가진다.
- AC-105.5: Given 단추·칩, When 읽으면, Then 아래와 같다.
  - `.btn`: inline-flex, 모서리 6px, 1px 투명 테두리, 500, 줄바꿈 없음, `transition: background-color .15s ease`.
  - `.btnMd`: 높이 36px, `padding: 0 14px`, 14px.
  - `.btnLg`: 높이 44px, `padding: 0 20px`, 15px.
  - `.btnPrimary`: 바탕 `var(--ink)`, 글자 `var(--surface)`. hover 바탕 `var(--ink-2)`.
  - `.btnSecondary`: 바탕 `var(--surface)`, 테두리 `var(--line)`, 글자 `var(--ink)`. hover 바탕 `var(--canvas)`.
  - `.chip`: 높이 22px, `padding: 0 7px`, 모서리 4px, 12px/16px, 500, 1px 투명 테두리. 변형은 다음 5가지다.

    | 변형 | 글자 / 바탕 / 테두리 |
    |---|---|
    | `.chipNeutral` | ink-2 / surface / line |
    | `.chipSample` | muted / surface / line |
    | `.chipOk` | ok / ok-soft |
    | `.chipAttn` | danger / danger-soft |
    | `.chipWait` | muted / canvas / line |

- AC-105.6: Given `base.module.css` 칸, When 읽으면, Then 칸 수가 아래와 같다. 모든 칸은 `minmax(0, 1fr)`이다.
  - `.grid4`: 1칸 → `repeat(2, …)`(768) → `repeat(4, …)`(1024).
  - `.grid3`: 1칸 → `repeat(3, …)`(768).
  - `.grid3`·`.grid4`의 간격은 12px → 16px(768).
  - `.items`: 1칸 → 2칸(768), 간격 20px 24px → 32px 24px. `.itemsFour`는 1024부터 4칸이다.
- AC-105.7: Given `src/components/landing/`의 모든 `*.module.css`, When 읽으면(주석 제외), Then 아래 규칙을 모두 지킨다.
  - (a) 미디어 쿼리는 `@media (min-width: 768px)`와 `@media (min-width: 1024px)`뿐이다. 휴대폰 값이 먼저 오고, max-width 쿼리가 없다.
  - (b) 색 글자(`#…`·`rgb(`·`rgba(`·`hsl(`)가 없다. 색은 `var(--…)`·`transparent`·`currentColor`만 쓴다.
  - (c) 다음이 없다: `gradient`, `box-shadow`(`none` 빼고), `text-shadow`, `backdrop-filter`, `filter:`, `background-clip`, `url(`, `font-family`.
  - (d) `border-radius` 값은 `0`·`2px`·`3px`·`4px`·`6px`·`50%`로만 이루어진다.
  - (e) `font-size`는 px 값이고 다음 중 하나다: 11·12·13·14·15·16·17·18·20·22·24·25·28·30·32·34·44·48·56. `clamp`·`vw`·`em` 크기는 없다.
  - (f) `font-weight`는 400·500·600이다. 700은 `HeroChart.module.css`(미리보기의 지금 탭)에만 있다.
  - (g) `@keyframes`·`animation`이 없다. `transition`은 두 가지뿐이다.
    - `.btn`의 `background-color .15s ease`
    - `HeroChart.module.css`의 `stroke-dasharray`·`height`·`width` `.6s ease`
  - (h) `--accent`·`--accent-soft`·`--accent-tint`는 `base.module.css`(초점 고리)·`HeroChart.module.css`·`FeaturesSection.module.css`에만 나온다. `--ok*`·`--danger*`는 `base.module.css`(칩)·`PrivacySection.module.css`("여기서 멈춤")에만 나온다.
- AC-105.8: Given `src/components/landing/`의 `*.tsx`(시험 제외), When 읽으면, Then 다음과 같다.
  - 색 글자(`#` + 16진수 3·6자리)가 없다. svg 선·채움은 `currentColor`나 CSS 클래스로 정한다.
  - 로고 마크는 이 규칙 밖이다. 고정 두 색은 `src/components/common/LogoMark.tsx`에 있고, 랜딩 TSX는 `<LogoMark />`를 부르기만 한다.
  - inline `style`은 % 값의 높이·폭·위치에만 쓴다: 히어로 막대 높이, 신환율 막대 폭, 처방 그룹 막대 폭, 눈금선 위치.

### REQ-106: 위쪽 메뉴
- AC-106.1: Given `SiteHeader`, When 그리면, Then `<header>` 안이 아래와 같다. header 안의 svg는 로고 하나다.
  - 로고 `<a href="#top">`: `LogoMark` 22 + `[서비스 이름]`
  - `<nav aria-label="주요 메뉴">` 링크 4개
  - `<a href="/login">` [구글로 시작하기]: `.btn`·`.btnMd`·`.btnPrimary` 클래스
- AC-106.2: Given `SiteHeader.module.css`의 휴대폰 값(767px 이하), When 읽으면, Then 아래와 같다.
  - header: `position: sticky; top: 0`, z-index 20, 바탕 `var(--surface)`, 아래 1px line. 그림자·blur는 없다.
  - 안쪽은 grid로 두 줄이다: `grid-template-areas: "logo cta" "nav nav"`.
  - 로고 줄은 48px이다.
  - nav 줄은 위 1px line이 있고 `overflow-x: auto`, `scrollbar-width: none`이다.
  - 링크는 높이 46px, `padding: 0 14px`, 14px 500 `var(--ink-2)`, `flex: none`이다.
  - [구글로 시작하기]의 `::after`가 누름 영역을 44px로 늘린다(`inset: -4px 0`).
  - nav와 링크에는 어느 폭에서도 `display: none`이 없다. 스크롤바 숨김 `::-webkit-scrollbar`만 예외다.
- AC-106.3: Given 768px 이상, When 읽으면, Then 아래와 같다.
  - 한 줄이다: `grid-template-areas: "logo nav cta"`, 높이 64px.
  - 링크는 높이 64px, `padding: 0 12px`. nav는 스크롤하지 않는다(`overflow: visible`).
  - `::after`는 끄지 않는다. 휴대폰 값이 그대로 적용된다(AC-112.1, 2026-10-30 고침).
  - 1024px부터 nav 왼쪽 여백 16px.

### REQ-107: 히어로·제품 화면 미리보기·약속 띠
- AC-107.1: Given `Hero`, When 그리면, Then `section#top` 안이 순서대로 아래와 같다. 배경 장식(격자·원형 빛·점)은 없다.
  - 소개 줄 `<p>`: "통증 의원 관리자를 위한 AI 업무 도구"(칩·svg 없음)
  - h1: `숫자로 보는<br/>우리 의원`(색 강조 span 없음)
  - 안내 `<p>`
  - [구글로 시작하기](`.btnLg`·`.btnPrimary`)와 [AI 분석 보기](`.btnLg`·`.btnSecondary`, 글자만)
  - 방패 svg 하나가 붙은 개인정보 줄
  - 그 아래 `HeroChart` 미리보기
- AC-107.2: Given `Hero.module.css`, When 읽으면, Then 아래와 같다.
  - 위아래 여백: 32px 56px → 64px 80px(768) → 88px 96px(1024). `scroll-margin-top`은 96px → 64px(768).
  - 1024px부터 12칸 grid다: `repeat(12, minmax(0, 1fr))`, column-gap 24px, `align-items: end`.
    - 글 덩어리 `grid-column: 1 / span 6`
    - 단추 덩어리 `grid-column: 8 / span 5`
  - 미리보기 위 여백: 32px → 48px → 64px.
- AC-107.3: Given `<HeroChart />` 서버 그림(틱 0), When 마크업을 보면, Then 앱 화면 미리보기 하나가 순서대로 아래와 같다.
  - `aria-hidden` 위쪽 띠: `LogoMark` 20 + `[서비스 이름]` + 계정 아이콘.
  - `aria-hidden` 탭 줄: span 8개 "대시보드 통계 AI 리포트 매출 재고 급여 일일마감·보고 월간 PDF". "대시보드"가 지금 탭이다.
  - 제목 "대시보드" + `.chipSample` "숫자는 예시".
  - KPI 3장:
    - 오늘 외래: 값 `128` + "명". 아래 줄은 강조색 span "▲" + "지난주 같은 요일보다".
    - 신환율: 한 덩어리 글자 `18.2%`. `aria-hidden` 막대의 채움이 `style="width:18.2%"`(틱마다 `newRate`).
    - AI 한 줄 요약: 글 + span "근거 숫자 보기 →"(링크 아님).
  - 패널 "월별 추이":
    - 도넛 svg(`pathLength="100"`, `stroke-dasharray="{ringPct} 100"`, 가운데 `{ringPct}%`)
    - 막대 6개(`style="height:N%"` + "N%" 글자)
    - `aria-hidden` 월 "5월 6월 7월 8월 9월 10월"
  - 미리보기 안에는 `<a>`·`<header>`·`<main>`·`<footer>`·`<section>`·`<nav>`가 없다.
- AC-107.4: Given `HeroChart.module.css`, When 읽으면, Then 아래와 같다.
  - 틀: 1px line, 모서리 6px, 바탕 `var(--canvas)`.
  - 위쪽 띠 높이: 48px → 56px(768) → 64px(1024).
  - 탭: 높이 46 → 48 → 50px. 지금 탭은 글자 `var(--accent)` 700에 아래 3px `var(--accent)` 밑줄(좌우 10px 안쪽, 모서리 `2px 2px 0 0`)이 붙는다.
  - KPI 칸: 2칸(AI 카드는 한 줄 전체) → 768부터 3칸.
  - KPI 값: 28/34 → 30/38 → 34/40.
  - 도넛: 바탕 고리 `var(--accent-soft)`, 값 고리 `var(--accent)`, 굵기 12.
  - 막대는 `var(--accent-tint)`이고, 마지막 막대만 `var(--accent)`이다.
  - 도넛·막대·신환율 막대는 `.6s ease`로 따라 움직인다.
- AC-107.5: Given `PromiseBand`, When 그리고 CSS를 읽으면, Then 아래와 같다.
  - `section[aria-label="핵심 약속"]` 안에 항목 3개가 있다. 각 항목은 20px svg(`stroke="currentColor"`, 굵기 1.5) + 글자(15px 500 ink)다.
  - AI 항목 아이콘은 반짝이 대신 합계 기호(Σ)다.
  - 띠: 위아래 1px line, 흰 바탕.
  - 휴대폰은 위 선으로 나뉜 세 줄이고, 768부터 3칸(`repeat(3, minmax(0, 1fr))`)을 왼쪽 선으로 나눈다.

### REQ-108: AI 섹션·정형외과 섹션
- AC-108.1: Given `AiSection`, When 그리면, Then `section#ai`(`.secCanvas`) 안이 순서대로 아래와 같다. 번호 상자·반짝이·"AI ANALYSIS"는 없다.
  - h2 `버튼 한 번이면,<br/>AI가 이번 달을 읽어 줍니다`(강조 span 없음) + 안내 글
  - 리포트 패널:
    - 머리: h3 "10월 AI 리포트" + `.chipSample` "방금 생성 · 예시"
    - 항목 3개. 각 항목은 칩 + 글 + 근거: `.chipOk` "늘었어요", `.chipAttn` "살펴볼 것", `.chipWait` "추정".
    - 채팅 칸:
      - 질문 말풍선
      - 움직이지 않는 점 3개(`role="img" aria-label="AI가 답을 쓰는 중"`)
      - `.chipNeutral` `<span>` 칩 2개
      - `aria-hidden` "AI에게 물어보기" + 보내기 아이콘
  - `<ul>`(`.items`·`.itemsFour`) 안의 `<li>` 4개. 각 `<li>`는 h3 + p이고, 순서는 근거 숫자와 함께 · 짐작은 '추정'이라고 · 이어서 채팅으로 질문 · 환자 정보 없이.
- AC-108.2: Given `AiSection.module.css`, When 읽으면, Then 아래와 같다.
  - 리포트 본문: 1칸 → 768부터 `minmax(0, 7fr) minmax(0, 5fr)`. 채팅 칸은 왼쪽 1px 선(휴대폰은 위 선).
  - 항목 줄: `grid-template-columns: 72px minmax(0, 1fr)`.
- AC-108.3: Given `OrthoSection`, When 그리면, Then `section#ortho`(흰 바탕) 안이 아래와 같다. `<figure>`·그림·"FOR ORTHO & PAIN CLINICS"는 없다.
  - h2 + 안내 글.
  - `<ul>`(`.grid4`·`.group`) 안의 `<li class=card>` 4개.
  - 카드마다 h3 제목·p 설명(주사/주사 치료 수와 F/U 기록 · 물리치료/물리치료 내원 환자 수 · 비급여/비급여 치료 내역 · 월말 보고/한 장으로 받는 월간 보고)이 있다.
  - 카드마다 `aria-hidden` 숫자 조각이 있다. 조각은 기간 + "예시" + 두 줄이고, 값은 시안 그대로다.

    | 카드 | 기간 | 두 줄 |
    |---|---|---|
    | 주사 | 이번 달 | 주사 치료 142건 · F/U 기록 37건 |
    | 물리치료 | 오늘 | 오전 21명 · 오후 17명 |
    | 비급여 | 이번 달 | 도수치료 86건 · 체외충격파 31건 |
    | 월말 보고 | 10월 | 보고서 PDF 1장 · AI 분석 포함 |

- AC-108.4: Given `OrthoSection.module.css`, When 읽으면, Then 카드가 아래와 같다.
  - 휴대폰: `grid-template-columns: minmax(0, 1fr) 136px`(글 | 조각).
  - 768부터: 한 칸이고 조각이 위로 간다(`order: -1`).

### REQ-109: 기능 섹션
- AC-109.1: Given `FeaturesSection`, When 그리면, Then `section#features`(`.secCanvas`) 안이 아래와 같다. 사진·출렁이는 막대·스캔 띠·"FEATURES"는 없다.
  - h2 `매일 하던 일,<br/>이제 숫자가 알아서 움직입니다`.
  - `<article>` 2개. 각각 순서대로 다음을 담는다.
    - 이름표 p("01 · 환자 통계" / "02 · 급여·인센티브")
    - h3(줄바꿈 그대로)
    - 본문 p
    - `.chipNeutral` 칩 3개
    - 미리보기
  - 통계 미리보기:
    - `<div>` 파일 놓는 칸(svg + "통계 파일을 여기에 놓기")
    - `aria-hidden` 작은 패널 "환자 통계" + "예시" 칩
    - `<dl>` 비율 4개: 신환율 18.2% · 재진율 81.8% · 7일 재방문 41.0% · 14일 재방문 52.6%
    - "처방 그룹 · 환자 수" 4줄: 물리치료 214 · 주사 142 · 도수 86 · 체외충격파 31
  - 급여 미리보기:
    - 패널 "10월 급여" + `.chipOk`(체크 svg + "10월 확정됨")
    - `<table>`: 머리 직원·직종·인센티브·합계, 줄 4개 `[직원 A]`~`[직원 D]`, `[금액]` 8개
  - 그 아래 `<ul>`(`.grid3`·`.group`) 안의 `<li>` 카드 3개. 각 카드는 svg + h3 + p다.
- AC-109.2: Given `FeaturesSection.module.css`, When 읽으면, Then 아래와 같다.
  - 기능 카드:
    - 휴대폰: 세로로 쌓이고 미리보기 위에 1px 선.
    - 768부터: `minmax(0, 1fr) minmax(0, 1fr)`, 미리보기 왼쪽 1px 선.
    - 1024부터: `minmax(0, 5fr) minmax(0, 7fr)`.
  - 통계 작은 패널: 휴대폰은 비율 4칸 줄 아래에 처방 그룹이 온다. 1024부터는 2칸(비율 2×2 | 처방 그룹)이다.
  - 처방 그룹 막대는 `var(--accent-tint)`이고, 첫 막대만 `var(--accent)`이다.
  - 급여표:
    - 13px, 머리 34px `var(--canvas)`, 칸 36px, 줄바꿈 없음, 금액 칸 오른쪽 정렬.
    - 감싸개는 `overflow-x: auto`다.

### REQ-110: 개인정보·시작 3단계·시작하기·푸터
- AC-110.1: Given `PrivacySection`, When 그리면, Then `section#privacy`(흰 바탕) 안이 아래와 같다. "PRIVACY FIRST"는 없다.
  - h2 `환자 개인정보는<br/>절대 병원 PC 밖으로 나가지 않습니다`(강조 span 없음) + 안내 글.
  - 0건 카드: `<p>0<span>건</span></p>` + `서버와 AI로 보내는<br/>환자 개인정보`.
  - 흐름: 카드 3개가 순서대로 있다.
    - 병원 PC · 브라우저: "여기서 멈춤" 상자 + 항목
    - 서버
    - AI 분석
  - 흐름 카드의 h3는 모두 왼쪽 정렬이고 20px 아이콘이 붙는다.
  - 카드 사이에는 `aria-hidden` 연결 2개가 있다. 각 연결은 화살표 선 + `.chipNeutral`("합계 숫자만" / "집계만")이다.
  - 약속 `<ul>`(`.items`·`.itemsFour`) 안의 `<li>` 4개. 각 `<li>`는 h3 + p이고, 약속 2 설명에는 `<br>`가 없다.
- AC-110.2: Given `PrivacySection.module.css`, When 읽으면, Then 아래와 같다.
  - 윗부분: 1칸 → 1024부터 `minmax(0, 1fr) 360px`.
  - 0건 숫자: 48/52 → 56/64(1024). 단위 "건"은 22px → 24px.
  - 흐름:
    - 1024 미만은 세로다. 연결은 1px `var(--ink-2)` 선 + 아래 화살표다.
    - 1024부터 `grid-template-columns: minmax(0, 1fr) 112px minmax(0, 1fr) 112px minmax(0, 1fr)`. 연결은 가로 화살표이고 칩이 선 위에 온다.
  - "여기서 멈춤" 상자: `var(--danger-soft)`, 모서리 4px. 제목은 `var(--danger)` 13px 600.
- AC-110.3: Given `HowSection`, When 그리고 CSS를 읽으면, Then 아래와 같다. 흐르는 선과 "HOW IT STARTS"는 없다.
  - `section#how`(`.secCanvas`) 안에 h2 하나 + `<ol>`.
  - `<ol>` 안의 `<li class=item>` 3개. 각 항목은 span "01|02|03"(13px 600 muted) + h3 + p.
  - 칸: 1칸 → 768부터 3칸.
- AC-110.4: Given `StartSection`, When 그리고 CSS를 읽으면, Then 아래와 같다. 원형 빛과 가운데 정렬은 없다.
  - `section#start`(흰 바탕) 안에 글(h2 `우리 의원도<br/>숫자로 운영해 보세요` + 안내 글)과 [구글로 시작하기](`.btnLg`·`.btnPrimary`).
  - 휴대폰은 위아래로 쌓이고 왼쪽 정렬이다.
  - 768부터 `grid-template-columns: minmax(0, 1fr) auto`, `align-items: end`.
- AC-110.5: Given `SiteFooter`, When 그리고 CSS를 읽으면, Then 아래와 같다.
  - 위 1px line, 흰 바탕, 위아래 24px, 13px `var(--muted)`.
  - 왼쪽 `[서비스 이름]`, 오른쪽 묶음 "문의 [이메일 주소]" · "© 2026".
- AC-110.6: Given `/` 마크업, When 섹션 바탕을 보면, Then `.secCanvas`는 `#ai`·`#features`·`#how` 세 섹션에만 있다.

### REQ-111: 화면 확인
- AC-111.1: Given 개발 서버를 127.0.0.1에서 띄우고(Supabase는 가짜 값), When `/`를 390×844·768×1024·1440×900(모션 줄이기)에서 열면, Then 아래와 같다.
  - 가로 스크롤이 없다: `document.documentElement.scrollWidth`가 창 폭과 같다.
  - `<img>`가 0개다.
  - 위쪽 메뉴 높이: 휴대폰 94px(48 + 46), 768·1440 64px.
  - 390에서 급여표가 카드 안에 다 들어온다: 감싸개의 `scrollWidth`가 `clientWidth` 이하.
- AC-111.2: Given 세 폭의 전체 화면 사진, When 승인 시안(`docs/mockups/landing-v2/index.html`을 같은 폭으로 연 것)과 나란히 보면, Then 아래가 시안과 같다. 다른 곳은 랜딩 파일 안에서 고치고 기록한다.
  - 섹션 순서·칸 수·카드 모양·색·글자 크기 단계
  - 겹침·잘림 없음
- AC-111.3: Given 확인이 끝나면, When 포트를 보면, Then 띄운 서버·브라우저가 모두 멈춰 있다(`ss -ltnp`). 사진에 쿠키·토큰이 없다(로그인하지 않는다).

### REQ-112: 태블릿·PC 마무리 (메뉴 누름 영역·줄바꿈 두 곳)
- 배경: TASK-11 화면 확인에서 세 가지가 남았다. 사용자가 2026-10-30에 고치기로 했다.
  - 768 이상에서 [구글로 시작하기]의 누름 영역이 36px이다.
  - 768에서 약속 3의 "이름·개인별"이 가운뎃점 뒤에서 끊긴다.
  - 768에서 기능 섹션 작은 카드 3의 마지막 줄에 "저장합니다." 한 낱말만 남는다.
- 문구는 바꾸지 않는다. 줄바꿈을 막는 `<span>`만 더한다.
- AC-112.1: Given `SiteHeader.module.css`의 768px·1024px 블록, When 읽으면, Then `.start::after`를 끄는 규칙(`display: none`)이 없다.
  - 휴대폰 값(`content: ""`, `position: absolute`, `inset: -4px 0`)이 그대로 적용된다.
  - 그래서 누름 높이가 어느 폭에서나 44px이다. 단추는 36px 그대로다.
- AC-112.2: Given `PrivacySection`, When 그리면, Then 약속 3("통계·매출 합계와…")의 설명 `<p>`가 아래와 같다.
  - "이름·개인별"이 `base.nowrap` 클래스 `<span>` 하나에 들어 있다.
  - `<p>`에서 태그를 뺀 글자는 지금 문구와 한 글자도 다르지 않다.
  - 다른 약속 세 개의 설명 `<p>`에는 태그가 없다. 약속 2에 `<br>`가 없는 것도 그대로다(AC-110.1).
- AC-112.3: Given `FeaturesSection`, When 그리면, Then 작은 카드 3("월말보고·통계 그래프·AI 분석을…")의 설명 `<p>`가 아래와 같다.
  - "PDF로 저장합니다."가 `base.nowrap` 클래스 `<span>` 하나에 들어 있다.
  - `<p>`에서 태그를 뺀 글자는 지금 문구와 같다.
  - 다른 작은 카드 두 개의 `<p>`에는 태그가 없다.
- AC-112.4: Given AC-111.1과 같은 방법(127.0.0.1 개발 서버, 가짜 Supabase 값, 모션 줄이기)으로 390×844·768×1024·1440×900을 열면, When 재면, Then 아래와 같다.
  - 위쪽 메뉴의 [구글로 시작하기](`header a[href="/login"]`)의 `::after` 높이가 세 폭 모두 44px 이상이다(`getComputedStyle(a, '::after').height`).
  - AC-112.2·112.3의 `<span>`이 세 폭 모두 한 줄에 있다(`getClientRects().length === 1`).
  - AC-111.1의 측정값이 그대로다: 가로 넘침 없음, `<img>` 0, 메뉴 높이 94·64·64, 390 급여표가 카드 안에 들어옴.
  - AC-111.3과 같이 끝나면 서버·브라우저를 멈추고, 로그인하지 않는다.

### REQ-113: 남은 정리 (로고 초점 고리·옛 주석·시험 보강)
- 배경: 사용자가 2026-10-30에 "F/U 목록 말고 F/U로 해"라고 했다. 리뷰와 화면 확인에서 남은 작은 일을 목록으로 남기지 않고 고친다. 동작·문구·모양은 로고 초점 고리 말고는 바뀌지 않는다.
- AC-113.1: Given `SiteHeader.module.css`, When 읽으면, Then 로고 링크의 초점 고리가 안쪽으로 그려진다.
  - 선택자가 `.logo:focus-visible`로 끝나는 규칙이 맨 위(휴대폰) 블록에 하나 있고, 값은 `outline-offset: -2px`다. 768·1024 블록에서 이 값을 다시 바꾸지 않는다.
  - 그 선택자는 클래스를 둘 이상 가진다(예: `.inner .logo:focus-visible`). base의 `.root a:focus-visible`보다 구체성이 높아야 CSS 순서와 상관없이 이긴다. `.nav .navLink:focus-visible`과 같은 방식이다.
  - AC-111.1과 같은 방법(127.0.0.1 개발 서버, 가짜 Supabase 값, 모션 줄이기, 로그인 안 함, 끝나면 `ss -ltnp`)으로 390·768·1440을 열고 Tab으로 `header a[href="#top"]`에 초점을 주면, `getBoundingClientRect().top - (outline-offset + outline-width)`가 0 이상이다(TASK-18).
- AC-113.2: Given 아래 파일의 주석, When 시험이 파일을 글자로 읽으면, Then 지금 동작과 맞다. 코드는 바꾸지 않는다. 새 주석에 색 값(`#14C8BA`·`#6D5DF5` 등)을 쓰지 않는다(AC-103.2가 주석까지 읽는다).
  - `src/components/shell/AppShell.tsx`·`src/components/auth/AuthFrame.tsx`: 로고가 "한 색"이거나 "글자색 ink를 따른다", 또는 "십자는 자리표시"라는 말이 없다. LogoMark가 고정 두 색(C③)으로 그린다고 적는다.
  - `src/components/common/LogoMark.tsx`: 쓰는 곳 크기 목록에 히어로 미리보기(20)가 들어 있다.
  - `src/middleware.ts`: matcher 주석이 "랜딩 그림"이 있는 것처럼 말하지 않는다. `landing/` 제외는 그대로 둔다(matcher는 범위 밖). 그림은 landing-v2에서 뺐다고 적는다.
  - `src/components/shell/TabBar.tsx`: "teal 글자·밑줄" 같은 옛 랜딩 색 이야기가 없다.
- AC-113.3: Given `src/app/theme.test.ts`의 AC-102.4 시험, When 읽으면, Then "아직 안 고친 랜딩 모듈" 임시 예외(옛 `font-family: var(--font-num)` 줄을 지워 주는 부분)가 없다. 모든 파일을 같은 규칙으로 엄격하게 본다. 시험은 그대로 통과한다.
- AC-113.4: Given `top.test.tsx`·`HeroChart.test.tsx`의 "마크업에 붙은 클래스가 CSS에 정의돼 있다" 시험, When 돌리면, Then 넘겨받은 모듈 파일마다 실제로 확인한 클래스가 하나 이상이다. 한 파일이라도 하나도 확인하지 못하면(해시 대응이 깨지거나 견본 키가 겹치면) 실패한다. 헛돌며 통과하지 않는다.
- AC-113.5: Given `styles.test.ts`의 AC-112.1 시험, When 돌리면, Then 맨 위·768·1024 블록의 모든 규칙을 훑는다. `.start`와 `::after`(또는 `:after`)를 함께 고르는 선택자에 `display: none`·`content: none`이 없다. 선택자 글자가 `.start::after`와 똑같지 않아도 잡는다.

## 범위 밖
- 기능·동작·문구 바꾸기(위 예외 둘만 바뀜)
- CSP·보안 헤더·middleware matcher
- 앱 화면(로그인·대시보드·관리자)의 모양. 바꾸는 것은 로고 마크(모양·색)뿐이다.
- 랜딩을 Tailwind로 옮기기(ADR-014 그대로), 새 `@theme` 토큰
- 서비스 이름·문의 메일 확정, 다크 모드
- 옛 명세 `specs/landing/` 고치기
- 운영 배포. 사용자가 OK할 때 따로 한다.
