# 설계: 랜딩페이지 디자인 전면 개편 (Linear·Stripe 톤, 제품 화면 미리보기)

## 개요

**기준 시안.** 승인 시안 `docs/mockups/landing-v2/index.html`(게시본 https://claude.ai/artifact/UbFfEzgrKExnLgsjtoZv2o)의 랜딩 부분(`.lp` 안)을 섹션별 CSS Module로 옮긴다.
- 시안의 `@container lp (min-width: 768px | 1024px)`는 같은 숫자의 `@media (min-width: …)`로 바꾼다.
- 휴대폰 값을 먼저 쓴다(mobile-first).
- 클래스 이름은 시안 이름을 camelCase로 옮긴다. 예: `.kpi-f` → `.kpiFoot`, `.t-h2` → `.tH2`.

**스타일링 방식.**
- 랜딩은 그대로 CSS Modules다(ADR-014).
- 새로 `src/components/landing/base.module.css` 하나를 둔다. 여기에 공통 모양을 모은다: 뿌리 초기화, 틀, 글자 단계, 단추, 칩, 카드, 항목, 칸. 섹션 컴포넌트는 `base`와 제 모듈을 함께 import한다.
- Tailwind와 `@theme`은 건드리지 않는다.

**색과 글꼴.**
- 색 값은 앱 토큰과 같다. globals.css의 랜딩 `:root` 변수를 앱 값으로 바꾸고, 시험이 `@theme`과 같은지 확인한다.
- 글꼴은 IBM Plex Sans KR 하나다(Space Grotesk 뺌).

**그림 대신 제품 화면.**
- 그림 6장(public/landing)과 `images.ts`를 지운다.
- 그 자리에 앱 시안 A + 블루를 줄여 다시 그린 미리보기를 `div`·`span`·`table`·`dl`로 그린다.
- 실제 앱 컴포넌트는 `button`·`Link`·시계를 품고 있어 쓰지 않는다(옛 AC-007.1).

**바뀌지 않는 것.**
- 동작: 링크 6종, 시작 링크 3개, 섹션 8개 순서, heroFrames 틱, 모션 줄이기, CSP.
- 옛 동작 시험은 고치지 않는다.

**로고.** 마크를 `src/components/common/LogoMark.tsx` 하나로 모으고 `currentColor` 한 색으로 그린다. 랜딩 메뉴·히어로 미리보기·앱 틀·인증 틀이 모두 이것을 쓴다.

## 구성 요소 / 인터페이스

```
src/app/
  globals.css        # 랜딩 :root를 앱 토큰 값으로(REQ-102). body·a(@layer base)·모션 줄이기. @theme 그대로
  layout.tsx         # IBM_Plex_Sans_KR(400·500·600·700, --font-plex)만
  page.tsx           # <div className={base.root}> 안에 SiteHeader · main(섹션 8개) · SiteFooter
src/components/common/
  LogoMark.tsx       # export function LogoMark({ size, className }: { size: number; className?: string })
src/components/landing/
  base.module.css    # 공통 모양(아래 표)
  SiteHeader.tsx/.module.css    # 두 줄(휴대폰) → 한 줄(768~)
  Hero.tsx/.module.css          # 글 + 단추 + 개인정보 줄 + <HeroChart/>
  HeroChart.tsx/.module.css     # 'use client'. 앱 화면 미리보기 전체(위쪽 띠·탭·제목·KPI 3·월별 추이)
  heroFrames.ts                 # 그대로(고치지 않음)
  PromiseBand.tsx/.module.css
  AiSection.tsx/.module.css     # 리포트 패널 + 채팅 칸 + 약속 4개(항목)
  OrthoSection.tsx/.module.css  # 카드 4장 + 숫자 조각
  FeaturesSection.tsx/.module.css  # 기능 카드 2개(통계·급여 미리보기) + 작은 카드 3개
  PrivacySection.tsx/.module.css   # 0건 카드 + 흐름 + 약속 4개
  HowSection.tsx/.module.css    # <ol> 3단계
  StartSection.tsx/.module.css  # 글 | 단추
  SiteFooter.tsx/.module.css
  links.ts                      # 그대로
  styles.test.ts                # CSS 글자 규칙 시험(REQ-105~110의 CSS 부분)
  (지움) images.ts, images.test.ts, public/landing/*.jpg
```

### `base.module.css` 클래스

| 클래스 | 내용(휴대폰 → 768 → 1024) |
|---|---|
| `.root` | 랜딩 뿌리. 초기화와 기본 글자(AC-105.1) |
| `.wrap` | 최대 폭 1248px, 가운데, 좌우 16 → 24 |
| `.sec` · `.secCanvas` | 섹션 위아래 56 → 80 → 96, scroll-margin-top 96 → 64 · 회색 바탕 |
| `.stack` · `.head` | 제목과 내용 사이 32 → 40 → 48 · 제목 덩어리 gap 12 → 16, 최대 760 |
| `.tDisplay` `.tH2` `.tH3l` `.tH3` `.tLead` `.tBody` `.tSmall` `.tLabel` | 글자 단계(AC-105.2) |
| `.nowrap` | `white-space: nowrap` |
| `.btn` `.btnMd` `.btnLg` `.btnPrimary` `.btnSecondary` | 단추(AC-105.5) |
| `.chips` `.chip` `.chipNeutral` `.chipSample` `.chipOk` `.chipAttn` `.chipWait` | 칩(AC-105.5) |
| `.card` `.item` `.items` `.itemsFour` `.grid3` `.grid4` `.group` | 카드·항목·칸(AC-105.4·105.6) |

**CSS 적용 순서.** 섹션 모듈은 base 클래스와 같은 속성을 덮어쓰지 않는다. 섹션 모듈은 배치(grid·order·폭)만 더한다.
- 예: 정형외과 카드는 `${base.card} ${styles.orthoCard}`로 쓰고, `.orthoCard`는 grid만 정한다.
- 덮어써야 하는 `.group > .card` 규칙은 base 안에 둔다.
- 이렇게 하면 두 모듈의 CSS 순서가 바뀌어도 결과가 같다.

### 섹션별 마크업 요점

시안 HTML을 JSX로 옮긴다. 문구는 지금 컴포넌트에서 그대로 가져온다.

- **SiteHeader**
  - `<header>` > `.wrap.inner`(grid) > `<a href="#top">`(LogoMark 22 + 이름) · `<nav aria-label="주요 메뉴">` 링크 4 · `<a href="/login">`(btn·btnMd·btnPrimary).
  - nav 링크 목록(`NAV`)은 그대로다.
- **Hero**
  - `section#top` > `.wrap` > `.grid`(text: kicker p + h1 / side: lead p + actions + privacy p) + `.shot` > `<HeroChart/>`.
  - `Sparkle` 함수와 장식 div는 지운다.
- **HeroChart**
  - `'use client'`, `useState(0)` + `useEffect(startHeroTicker)`. 이 부분은 지금 코드 그대로다.
  - 그리는 내용: `heroFrame(tick)`로 `visits`·`newRate`·`ringPct`·`bars`를 받아 아래를 그린다. 탭 이름 8개와 월 6개는 파일 안 상수다.
    - `.app` > `.top`(aria-hidden) · `.tabs`(aria-hidden, span 8, 첫째 `.tabOn`) · `.body`
    - `.body` 안: `.title`(span "대시보드" + base.chip·chipSample "숫자는 예시") + `.grid`(KPI 3 + `.panel`)
  - 신환율 값은 `{newRate}%`로 한 원소 안에 쓴다. 옛 시험 `/신환율 18\.2%/` 때문이다.
  - 신환율 막대는 `<i style={{ width: `${newRate}%` }}>`.
  - 도넛은 `<circle className={styles.ringValue} pathLength={100} strokeDasharray={`${ringPct} 100`} …>`로 그린다. 색은 CSS(`stroke: var(--accent)`)가 정한다.
  - 막대는 `style={{ height: `${h}%` }}` + `<span>{h}%</span>`이고, 마지막 막대만 `.barLast`다.
  - 눈금선 4개는 `style={{ bottom: '25%' … }}`다.
  - 미리보기 안에 `<a>`·`<header>`·`<main>`·`<footer>`·`<section>`·`<nav>`를 쓰지 않는다. page.test가 header·footer·section 수를 센다.
- **PromiseBand**: 항목 3개, svg는 `stroke="currentColor"`. AI 항목은 Σ 경로(`M14.5 4h-9l5 6-5 6h9`).
- **AiSection**
  - head → `.rep`(`.repHead` h3 + 칩 / `.repBody` = `.repItems`(3줄) + `.chat`) → `<ul className={items itemsFour}>` li 4.
  - `POINTS`는 번호와 색 없이 제목·설명만 남긴다.
  - `ITEMS`의 tone은 base 칩 변형(chipOk·chipAttn·chipWait)이다.
- **OrthoSection**
  - `<ul className={grid4 group}>` > `<li className={card orthoCard}>` > `.text`(h3 + p) + `.snip`(aria-hidden).
  - `TILES`에서 image를 빼고, 숫자 조각 값(AC-108.3 표)을 더한다.
- **FeaturesSection**
  - `<article className={styles.fcard}>` 2개 + `<ul className={grid3 group}>` li 3.
  - 통계 미리보기는 `.drop` div + `.mini`(aria-hidden: 머리, `<dl className=rates>`, `.groups` 4줄)다.
  - 급여 미리보기는 `.mini`(머리 + 칩, `.tblWrap` > `<table>`)다.
  - 금액·이름 빈칸은 그대로다(`[금액]` 8개).
- **PrivacySection**
  - `.top`(head + `.zero` card) → `.flow`(node · link · node · link · node) → `<ul items itemsFour>`.
  - 연결(`.link`)은 aria-hidden이고 `.linkLine` + base 칩이다.
  - `RULES[1]`의 `<br />`를 지운다.
- **HowSection**: `<ol className={styles.steps}>` > `<li className={base.item}>` > `<span className=stepNum>` + h3 + p.
- **StartSection**: `.wrap` > `.start`(grid) > `.text`(h2 + lead) + `<a>`(btnLg·btnPrimary).
- **SiteFooter**: `.wrap.inner` > span 이름 + `.right`(span 문의 · span ©).

### 미리보기 안 값(시안 그대로)

| 미리보기 | 값 |
|---|---|
| 히어로 | 탭 "대시보드 통계 AI 리포트 매출 재고 급여 일일마감·보고 월간 PDF", 월 "5월~10월" |
| 정형외과 | AC-108.3 표 |
| 통계 | 비율 4개, 처방 그룹 4줄(막대 폭 100·66·40·14%) |
| 급여 | 표 머리 4칸 + 줄 4개 |

### 크기 표: 미리보기(앱 화면 축소판)

| 요소 | 휴대폰 | 768 | 1024 |
|---|---|---|---|
| 위쪽 띠 | 48 | 56 | 64 |
| 탭 높이 | 46 | 48 | 50 |
| 화면 제목 | 20/28 | 22/30 | 25/32 |
| KPI 이름 | 13/20 | 14/22 | 14/22 |
| KPI 값 | 28/34 | 30/38 | 34/40 |
| KPI 단위 | 16 | 18 | 20 |
| 도넛 폭 | 84 | 132 | 156 |
| 막대 영역 높이 | 116 | 150 | 168 |

## 데이터 흐름
- 없다. 서버·DB·브라우저 저장소·네트워크를 쓰지 않는다.
- 히어로 틱만 화면 안 state로 바뀐다(`heroFrame` → 미리보기 KPI·도넛·막대·신환율 막대).

## 결정과 트레이드오프

**사용자 결정(2026-10-30)**
1. 전면 개편: Linear 절제 + Stripe 데이터 중심, 그림 제거, 제품 화면 미리보기, 중립색 + 강조색 하나, 1/2/12칸, 작은 휴대폰 메뉴, 장식 제거. UI/UX만 바꾼다.
   - UI_GUIDE 랜딩 원칙 2와 옛 `landing` REQ-006을 대체한다.
2. 로고 마크를 어디서나 한 색(ink)으로 그린다. 앱 틀·인증 틀 포함.

**Claude 판단**

- **CSS Modules 유지.** ADR-014는 그대로다.
  - 랜딩 `:root` 변수를 앱 값으로 바꾸고 새 `@theme` 토큰은 넣지 않는다.
  - 이유: Tailwind로 옮기면 클래스 금지 목록(theme.test)·Preflight 없음·`.app-ui` 범위 문제를 새로 풀어야 한다. 시안 CSS는 그대로 옮기기 쉽다.
  - 값이 두 곳(`@theme`와 랜딩 `:root`)에 있으니 같은지를 시험으로 묶는다(AC-102.1).
- **변수 이름은 시안 그대로** (`--ink`, `--line`, `--accent` …).
  - Tailwind 테마 이름 공간(`--color-*`·`--text-*`·`--font-*`·`--radius-*`·`--shadow-*`)과 겹치지 않는다.
  - 지금 `--text-body`가 Tailwind와 겹치던 문제도 함께 사라진다.
- **글꼴은 Plex 하나.**
  - Space Grotesk를 지우고 `--font-num`도 지운다.
  - 굵기 700은 앱의 지금 탭이 쓰므로 계속 불러온다.
- **`a` 기본 색.** `@layer base`의 `a`를 `var(--accent)` 하나로 둔다.
  - 랜딩 링크는 `.root a { color: inherit }`(layer 밖)가 이긴다.
  - 앱 링크는 Tailwind 클래스가 이긴다.
  - `a:hover`(옛 청록 진하게)는 쓰는 곳이 없어 지운다.
- **뿌리 감싸개.** 랜딩 초기화가 앱에 새지 않게 `page.tsx`에 `<div className={base.root}>` 하나를 더한다.
  - header·main·footer의 순서·개수는 그대로다.
- **섞은 색.** `--accent-tint`·`--field`는 시안처럼 `color-mix()`로 둔다.
  - 지원: Chrome 111·Safari 16.2 이상. 의원 PC 크롬과 폰은 이미 그 이상이다.
- **시안 숫자 차이.** 시안 설명 카드 표에는 휴대폰 섹션 여백이 64·카드 안쪽이 20으로 적혀 있다. 시안 화면(CSS)은 56·16이다.
  - 사용자가 본 것은 화면이므로 CSS 값(56·16)을 따른다. UI_GUIDE에도 그 값을 적는다.
- **그림 파일.** 그림 6장은 지운다.
  - 승인 기록은 `docs/mockups/landing/images/`에 남는다.
  - middleware matcher의 `landing/` 예외와 CSP는 그대로 둔다(사용자 지시). 쓰이지 않지만 해가 없다.
- **옛 시험 다루기.** 동작 시험은 이름·내용을 그대로 둔다. 옛 모양을 묶던 시험만 새 AC로 바꾼다.
  - `images.test.ts`: 지운다(AC-104.2).
  - `middle.test.tsx`:
    - 'AC-006.1' 그림 시험 3개 → AC-104.1(그림 0장). 바깥 주소 시험은 둬도 된다.
    - 'AC-005.1: 정형외과 타일 4개의 설명 문구'의 `figcaption` 부분 → AC-108.3(카드 h3·p). 문구 확인은 옮겨 남긴다.
  - `page.test.tsx`: 'AC-006.1' 2개 → AC-104.1·104.2.
  - `theme.test.ts`: describe '랜딩은 그대로'(옛 값·`--font-num`·Space Grotesk·`a:hover`) → AC-102.1~102.4. Tailwind·`@theme` 시험은 그대로다.
  - 그 밖(top·bottom·HeroChart·heroFrames·globals·csp·middleware·shell·login): 그대로 둔다. 새 AC 시험만 더한다.
- **CSS 시험 방식.**
  - `styles.test.ts`가 `*.module.css`를 글자로 읽는다. 주석을 지운 뒤 맨 위 규칙과 `@media` 블록을 나눠 값을 확인한다. `theme.test.ts`의 `blockBody`·`rules`와 같은 방식이다.
  - 마크업 쪽 시험은 `renderToStaticMarkup` 글자에서 확인한다. 클래스는 `import base from './base.module.css'`의 `base.grid4`처럼 찾는다.
  - 주의: Vitest의 CSS Module은 어떤 이름에도 `_이름_해시`를 돌려준다(없는 이름도). 그래서 클래스가 붙었는지 보는 시험은 CSS 글자에 그 클래스가 정의됐는지 확인하는 시험과 짝으로 쓴다.
- **CSS 규칙 시험의 범위는 단계적으로 넓힌다.**
  - `styles.test.ts`의 규칙 시험(AC-105.7)은 고친 모듈 목록만 본다. 목록은 TASK마다 늘어난다(base → SiteHeader → … ).
  - 마지막 섹션 TASK에서 폴더 전체 읽기로 바꾼다.
  - 그래야 TASK마다 RED → GREEN이 되고, 아직 안 고친 섹션 때문에 시험이 계속 실패하지 않는다.
- **화면 확인.** Phase 3에서 Playwright 크로미움으로 세 폭을 찍어 시안과 비교한다.
  - 가로 넘침·높이 같은 측정은 스크립트로 한다(AC-111.1).
  - 스크립트는 scratchpad에 두고 저장소에 넣지 않는다.

## 위험 / 미해결 질문
- **중간 단계의 모양 깨짐.** TASK-2에서 전역 변수를 바꾸면, 아직 안 고친 섹션 모듈이 옛 변수(`--teal-text` 등)를 찾지 못해 기본값으로 그려진다. Phase 2가 끝날 때까지 화면이 섞여 보인다.
  - 시험은 통과한다.
  - 배포는 Phase 3 확인 뒤에만 한다.
- **CSS 순서.** base 모듈과 섹션 모듈이 같은 속성을 다투면 순서에 따라 결과가 달라진다. 위 'CSS 적용 순서' 규칙으로 막는다.
  - Phase 3 사진에서 어긋나면 섹션 모듈 쪽 선택자를 좁혀 고친다.
- **미리보기는 복제본이다.** 앱 화면이 바뀌어도 랜딩 미리보기는 저절로 따라가지 않는다.
  - 탭 이름·KPI 모양이 크게 바뀌면 랜딩도 고쳐야 한다(UI_GUIDE에 적음).
- **휴대폰 메뉴 줄.** 휴대폰 메뉴 줄(46px)이 붙어 있어 섹션 앞부분이 가릴 수 있다. `scroll-margin-top` 96px(휴대폰)·64px로 막는다.
  - Phase 3에서 메뉴 링크를 눌러 확인한다.
- **옛 명세 글.** `specs/landing/`(고치지 않음)의 글과 옛 시안이 이제 화면과 다르다.
  - UI_GUIDE·ADR-018에 "landing-v2가 대체"라고 적어 헷갈리지 않게 한다.
