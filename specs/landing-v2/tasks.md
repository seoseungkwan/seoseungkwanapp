# 작업 분할: 랜딩페이지 디자인 전면 개편 (Linear·Stripe 톤, 제품 화면 미리보기)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 모양 기준: `docs/mockups/landing-v2/index.html`. 값 표: requirements.md·design.md, 규칙: `docs/UI_GUIDE.md` 랜딩 절.
> 모든 TASK에서 REQ-101(바뀌지 않는 동작)을 지킨다. 옛 동작 시험은 이름·내용을 고치지 않는다(design.md '옛 시험 다루기'). 예외는 TASK-19의 문구 한 줄뿐이다(AC-101.3).
> **할 순서**: Phase 1(TASK-1~6 → TASK-12) → Phase 2(TASK-7~10) → Phase 3(TASK-11) → Phase 4(TASK-13 → TASK-14) → Phase 5(TASK-15 → TASK-16 → TASK-17 → TASK-18) → Phase 6(TASK-19). Phase 4·5·6은 2026-10-30 화면 확인 뒤 사용자 결정으로 더했다. TASK-12는 2026-10-30 로고 결정이 바뀌어 뒤에 더했다. 번호는 뒤지만 Phase 1 안에서 Phase 2보다 먼저 한다.
> 각 Phase 끝에 `python3 ~/.claude/harness/bin/verify`(lint·build·test)를 돌리고 1440·390 화면을 찍어 보고한다. Phase 1·2 끝 사진은 중간 상태다. 안 고친 섹션은 깨져 보인다(design.md 위험).

## Phase 1 — 기초: 토큰·글꼴·로고·그림 빼기·공통 모양·위쪽 메뉴

## TASK-1: 문서 — UI_GUIDE·ADR·ARCHITECTURE·PRD·plan·시안 사본
- REQ: REQ-102, REQ-103, REQ-104, REQ-105
- Files: docs/UI_GUIDE.md, docs/ADR.md, docs/ARCHITECTURE.md, docs/PRD.md, plan.md, docs/mockups/landing-v2/index.html
- TDD: exempt — 문서만 고친다. 할 일:
  - UI_GUIDE 랜딩 절과 ADR-018(ADR-012·014 상태 줄 포함), 시안 사본은 명세와 함께 이미 썼다. 구현 중 값이 바뀌면 여기서 다시 맞춘다.
  - ARCHITECTURE.md: `public/` 줄의 "landing/ = 랜딩 그림 6장"을 지운다. `components/common/LogoMark.tsx`를 한 줄로 적는다.
  - PRD.md §9·plan.md §2-10: 각 한 줄 "2026-10-30 사용자: 그림·영상을 빼고 제품 화면 미리보기로(ADR-018, specs/landing-v2)". 다른 문장은 바꾸지 않는다.

## TASK-2: 전역 토큰·글꼴 (globals.css·layout.tsx)
- REQ: REQ-102, REQ-101
- Files: src/app/globals.css, src/app/layout.tsx, src/app/theme.test.ts
- Tests: src/app/theme.test.ts, src/app/globals.test.ts, src/lib/csp.test.ts, src/middleware.test.ts
- TDD: required — 먼저 `theme.test.ts`를 고치고 RED를 본다.
  - describe '랜딩은 그대로'(옛 값·`--font-num`·Space Grotesk·`a`/`a:hover`)를 AC-102.1~102.4 시험으로 바꾼다.
    - 랜딩 `:root` 값 목록과 `@theme` 색이 같은지
    - 옛 변수가 없는지
    - body
    - `@layer base`의 `a` 하나
    - layout의 Plex 하나
    - 시험 밖 `src/`에 `--font-num`·`--font-grotesk`가 없는지
  - 그다음 globals.css 랜딩 `:root`·body·`a`를 바꾸고 layout.tsx에서 Space Grotesk를 지운다.
  - Tailwind·`@theme`·`.app-ui` 시험(auth AC-013.1)과 `globals.test.ts`(모션 줄이기·그라데이션 글자)는 그대로 통과해야 한다.
  - 랜딩 CSS Module은 이 TASK에서 고치지 않는다. 옛 변수를 찾지 못해 기본값으로 그려지는 것은 Phase 2에서 고친다.

## TASK-3: 로고 마크 한 색 (LogoMark)
- REQ: REQ-103, REQ-101
- Files: src/components/common/LogoMark.tsx, src/components/common/LogoMark.test.tsx, src/components/shell/AppShell.tsx, src/components/auth/AuthFrame.tsx, src/components/landing/SiteHeader.tsx
- Tests: src/components/common/LogoMark.test.tsx, src/components/shell/shell.test.tsx, src/app/login/page.test.tsx, src/components/landing/top.test.tsx
- TDD: required — `LogoMark.test.tsx`부터 쓴다.
  - AC-103.1: 마크업 속성·rect 3개·색 값 없음·className 전달.
  - AC-103.2: 시험 밖 `src/`를 읽어 rect 좌표 글자가 LogoMark.tsx에만 있는지, 세 파일에 옛 색 두 개가 없는지 본다.
  - 그다음 세 곳의 svg를 `<LogoMark size={26 | 22} className=… />`로 바꾼다. SiteHeader는 로고만 바꾸고 나머지는 TASK-6에서 한다.
  - `shell.test.tsx`·`login/page.test.tsx`(svg가 aria-hidden, 띠 안 원소가 svg·span 순서)와 `top.test.tsx`가 그대로 통과해야 한다.
  - (2026-10-30 뒤 바뀜) 사용자가 마크를 병원 십자 C③으로 바꿨다. 마크 모양·색과 AC-103.1·103.2 시험은 TASK-12가 바꾼다. 이 TASK에서 만든 "LogoMark 한 곳에서 그리기"는 그대로다.

## TASK-4: 그림 6장 빼기
- REQ: REQ-104, REQ-101
- Files: public/landing/*.jpg, src/components/landing/images.ts, src/components/landing/images.test.ts, src/components/landing/OrthoSection.tsx, src/components/landing/FeaturesSection.tsx, src/components/landing/middle.test.tsx, src/app/page.test.tsx
- Tests: src/components/landing/middle.test.tsx, src/app/page.test.tsx
- TDD: required — 먼저 `middle.test.tsx`·`page.test.tsx`를 고치고 RED를 본다.
  - 'AC-006.1' 그림 시험들을 AC-104.1(ai·ortho·features·페이지 전체에 `<img>`·`<picture>`·`<video>` 0개, 랜딩 폴더에 `next/image`·`url(` 없음)로 바꾼다.
  - AC-104.2(파일 없음, `docs/mockups/landing/images/` 6장은 있음)를 더한다.
  - 그다음 두 컴포넌트에서 `<Image>`와 import만 빼고, `images.ts`·`images.test.ts`·`public/landing/` 6장을 지운다.
  - 모양은 이 TASK에서 고치지 않는다. figure·figcaption은 TASK-8까지 남는다.
  - 문서 쪽 승인본 그림은 지우지 않는다.

## TASK-5: 랜딩 공통 모양 (base.module.css + 뿌리 감싸개)
- REQ: REQ-105, REQ-101
- Files: src/components/landing/base.module.css, src/components/landing/styles.test.ts, src/app/page.tsx, src/app/page.test.tsx
- Tests: src/components/landing/styles.test.ts, src/app/page.test.tsx
- TDD: required — 먼저 `styles.test.ts`를 새로 쓰고 RED를 본다.
  - CSS 글자 읽기 도우미(주석 제거, 맨 위 규칙과 `@media` 블록 나누기)를 만든다.
  - base.module.css 시험: AC-105.1~105.6의 값.
  - AC-105.7 규칙 시험: 검사 목록 `CHECKED = ['base.module.css']`에 대해 (a)~(h)를 본다.
  - `page.test.tsx`에는 AC-105.1(뿌리 `<div>` 하나가 header·main·footer를 감싼다)을 더한다.
  - 그다음 base.module.css를 시안 공통 CSS로 쓰고 `page.tsx`에 감싸개를 둔다.

## TASK-6: 위쪽 메뉴와 휴대폰 메뉴 줄
- REQ: REQ-106, REQ-105, REQ-101
- Files: src/components/landing/SiteHeader.tsx, src/components/landing/SiteHeader.module.css, src/components/landing/top.test.tsx, src/components/landing/styles.test.ts
- Tests: src/components/landing/top.test.tsx, src/components/landing/styles.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - `top.test.tsx`에 AC-106.1을 더한다: 로고 링크 안 LogoMark·이름, CTA 클래스, header 안 svg 1개.
  - `styles.test.ts`에 AC-106.2·106.3을 더하고, `CHECKED`에 SiteHeader.module.css를 넣는다.
  - 그다음 시안의 `.lp-hd`를 옮긴다(grid 두 줄 → 768 한 줄, glass·pill 제거).
  - 옛 AC-001.2·002.1 시험은 그대로 통과해야 한다.

## TASK-12: 로고 십자 모양(C③)
- REQ: REQ-103, REQ-101
- Files: src/components/common/LogoMark.tsx, src/components/common/LogoMark.test.tsx
- Tests: src/components/common/LogoMark.test.tsx, src/components/shell/shell.test.tsx, src/app/login/page.test.tsx, src/components/landing/top.test.tsx
- TDD: required — 먼저 `LogoMark.test.tsx`의 AC-103.1·103.2 시험을 새 AC로 고치고 RED를 본다.
  - AC-103.1: 바깥 svg 속성(aria-hidden·size·viewBox, fill·stroke 없음), 안쪽 두 원소(rect 테두리 `#14C8BA` 2.4 · 십자 path `#6D5DF5`)와 그 순서, `currentColor`·다른 색·`style` 없음, className 전달.
  - AC-103.2: 시험 밖 `src/`를 읽어 다음을 본다.
    - 십자 path 글자는 LogoMark.tsx에만 있다.
    - 옛 막대 좌표는 어디에도 없다.
    - AppShell·AuthFrame·SiteHeader는 LogoMark를 하나씩 쓰고, 직접 그린 svg·로고 색이 없다.
    - 그린 세 화면의 로고가 LogoMark 출력과 같다.
    - "부모 글자색 ink를 따른다" 확인은 지운다.
  - 그다음 LogoMark.tsx의 svg를 비교 시안 C③(`docs/mockups/landing-v2/logo-options.html`) 그대로 바꾼다. 크기 22·26·20과 `aria-hidden`은 그대로다.
  - 쓰는 곳 세 파일은 이미 LogoMark를 쓰므로 고치지 않는다.
  - `top.test.tsx` AC-106.1은 LogoMark 출력과 비교하므로 그대로 통과한다. `shell.test.tsx`·`login/page.test.tsx`도 그대로 통과해야 한다.
  - `SiteHeader.module.css`의 `.logo` 주석("마크(currentColor)도 ink")은 맞지 않게 된다. 이 TASK에서는 두고, TASK-11에서 랜딩 CSS를 정리할 때 고친다(`.logo` 글자색 ink는 그대로).

## Phase 2 — 섹션

## TASK-7: 히어로·제품 화면 미리보기·약속 띠
- REQ: REQ-107, REQ-105, REQ-101
- Files: src/components/landing/Hero.tsx, src/components/landing/Hero.module.css, src/components/landing/HeroChart.tsx, src/components/landing/HeroChart.module.css, src/components/landing/PromiseBand.tsx, src/components/landing/PromiseBand.module.css, src/components/landing/top.test.tsx, src/components/landing/HeroChart.test.tsx, src/components/landing/styles.test.ts
- Tests: src/components/landing/top.test.tsx, src/components/landing/HeroChart.test.tsx, src/components/landing/heroFrames.test.ts, src/components/landing/styles.test.ts
- TDD: required — 시험부터 더하고 RED를 본다.
  - `top.test.tsx`: AC-107.1(히어로 순서·클래스·장식 없음), AC-107.5(약속 띠 마크업).
  - `HeroChart.test.tsx`: AC-107.3(미리보기 구조·틱 0 신환율 막대 `width:18.2%`·금지 태그 없음).
  - `styles.test.ts`: AC-107.2·107.4·107.5의 CSS 부분. `CHECKED`에 Hero·HeroChart·PromiseBand 모듈을 넣는다.
  - `heroFrames.ts`·`heroFrames.test.ts`는 고치지 않는다.
  - `HeroChart.test.tsx`의 옛 AC-003.3·008.1 시험은 그대로 통과해야 한다. 신환율은 `{newRate}%` 한 원소다.

## TASK-8: AI 섹션·정형외과 섹션
- REQ: REQ-108, REQ-105, REQ-101
- Files: src/components/landing/AiSection.tsx, src/components/landing/AiSection.module.css, src/components/landing/OrthoSection.tsx, src/components/landing/OrthoSection.module.css, src/components/landing/middle.test.tsx, src/components/landing/styles.test.ts
- Tests: src/components/landing/middle.test.tsx, src/components/landing/styles.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - `middle.test.tsx`: AC-108.1을 더한다(리포트 패널·칩 변형·채팅 칸·약속 `<ul>` 4개·영문 소제목 없음).
  - 'AC-005.1: 정형외과 타일 4개의 설명 문구'의 figcaption 확인을 AC-108.3으로 바꾼다(`<li>` 카드 4개 h3·p 순서, 숫자 조각 값과 "예시", `<figure>` 없음). 문구 확인은 남긴다.
  - `styles.test.ts`: AC-108.2·108.4. `CHECKED`에 두 모듈을 넣는다.
  - 옛 AC-005.2·007.1·008.1 시험은 그대로 통과해야 한다.

## TASK-9: 기능 섹션
- REQ: REQ-109, REQ-105, REQ-101
- Files: src/components/landing/FeaturesSection.tsx, src/components/landing/FeaturesSection.module.css, src/components/landing/middle.test.tsx, src/components/landing/styles.test.ts
- Tests: src/components/landing/middle.test.tsx, src/components/landing/styles.test.ts
- TDD: required — 시험부터 더하고 RED를 본다.
  - `middle.test.tsx`: AC-109.1을 더한다(article 2개 순서, 통계 미리보기 값, 급여표 머리·줄, 작은 카드 `<ul>` 3개, 사진·"FEATURES" 없음).
  - `styles.test.ts`: AC-109.2. `CHECKED`에 이 모듈을 넣는다.
  - 옛 시험은 그대로 통과해야 한다: "EMR…", `[직원 A~D]`·`[금액]` 8개, "통계 파일을 여기에 놓기" `<div>`.

## TASK-10: 개인정보·시작 3단계·시작하기·푸터 (+ CSS 규칙 전체 검사)
- REQ: REQ-110, REQ-105, REQ-101
- Files: src/components/landing/PrivacySection.tsx, src/components/landing/PrivacySection.module.css, src/components/landing/HowSection.tsx, src/components/landing/HowSection.module.css, src/components/landing/StartSection.tsx, src/components/landing/StartSection.module.css, src/components/landing/SiteFooter.tsx, src/components/landing/SiteFooter.module.css, src/components/landing/bottom.test.tsx, src/components/landing/styles.test.ts, src/app/page.test.tsx
- Tests: src/components/landing/bottom.test.tsx, src/components/landing/styles.test.ts, src/app/page.test.tsx
- TDD: required — 시험부터 더하고 RED를 본다.
  - `bottom.test.tsx`: AC-110.1·110.3~110.5의 마크업(흐름 순서·연결 칩·약속 2에 `<br>` 없음·`<ol>` 번호 span·시작하기 클래스·푸터 묶음).
  - `page.test.tsx`: AC-110.6(`.secCanvas`는 `#ai`·`#features`·`#how`에만), AC-105.8(랜딩 TSX 색 글자·inline style 범위).
  - `styles.test.ts`:
    - AC-110.2~110.5의 CSS 부분을 더한다.
    - `CHECKED`를 폴더 전체 읽기로 바꾼다. 랜딩의 `*.module.css` 12개 모두와 강조색 위치 (h)를 검사한다.
  - 옛 AC-001.1·002.1·005.1·005.2·007.1·008.1 시험은 그대로 통과해야 한다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과.

## Phase 3 — 화면 확인

## TASK-11: 세 폭 화면 사진과 시안 비교
- REQ: REQ-111
- Files: src/components/landing/*.module.css, src/components/landing/*.tsx
- TDD: exempt — 화면 확인 작업이라 먼저 쓸 실패 시험이 없다. 새 로직을 만들지 않고, 사진으로 보는 모양만 시안에 맞춘다.
  - **서버.** 저장소를 scratchpad로 `git archive`해서 띄운다. `next dev -H 127.0.0.1`, Supabase 주소·열쇠는 가짜 값, `devIndicators` 끔.
  - **찍기.** `@playwright/test` 크로미움을 쓰고 스크립트는 scratchpad에 둔다(저장소에 넣지 않음).
    - 390×844·768×1024·1440×900, 모션 줄이기로 전체 화면과 첫 화면을 찍는다.
    - 같은 폭의 시안(`docs/mockups/landing-v2/index.html?w=…&still`)과 나란히 놓는다.
  - **측정(AC-111.1).** 가로 넘침, `<img>` 0, 메뉴 높이 94·64, 390 급여표 들어감. 메뉴 링크 4개를 눌러 섹션 제목이 메뉴에 가리지 않는지도 본다.
  - **고치기.** 다른 곳은 랜딩 파일 안에서만 고친다. 마크업을 고치면 그 시험도 함께 맞추고 `verify`를 다시 돌린다. 고친 점은 보고에 적는다.
  - **정리(AC-111.3).** 서버·브라우저를 모두 멈추고 `ss -ltnp`로 확인한다. 로그인하지 않는다.
  - **끝 조건.** 세 폭 사진을 사용자에게 보여 주고, 배포 여부를 묻는다.

## Phase 4 — 태블릿·PC 마무리

## TASK-13: 메뉴 누름 영역과 줄바꿈 두 곳
- REQ: REQ-112, REQ-106, REQ-101
- Files: src/components/landing/SiteHeader.module.css, src/components/landing/PrivacySection.tsx, src/components/landing/FeaturesSection.tsx, src/components/landing/styles.test.ts, src/components/landing/bottom.test.tsx, src/components/landing/middle.test.tsx
- Tests: src/components/landing/styles.test.ts, src/components/landing/bottom.test.tsx, src/components/landing/middle.test.tsx, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - `styles.test.ts`: AC-106.3의 "`::after`는 끈다" 시험을 AC-112.1 시험으로 바꾼다. 768·1024 블록에 `.start::after`의 `display` 값이 없고, 휴대폰 값 `inset: -4px 0`이 있는지 본다.
  - `bottom.test.tsx`: AC-112.2를 더한다. `LIST_ITEM`이 약속 3의 `<p>` 안 `<span>` 하나를 받도록 고친다. 다른 세 약속은 지금처럼 태그 없는 글자만 받는다. 문구 시험(약속 설명 4개)은 태그를 빈칸 없이 지운 글자(`replace(/<[^>]+>/g, '')`)를 정해 둔 문구와 비교한다. `textOf`는 빈칸을 모아 `<span>` 앞뒤 띄어쓰기가 사라져도 통과하므로 이 비교에 쓰지 않는다. 문구는 그대로 둔다.
  - `middle.test.tsx`: AC-112.3을 더한다. `SMALL_CARD`가 작은 카드 3의 `<p>` 안 `<span>` 하나를 받도록 고친다. 다른 두 카드는 그대로 태그 없는 글자만 받는다. 작은 카드 문구 시험도 bottom과 같이 태그를 빈칸 없이 지운 글자로 비교한다.
  - 두 `<span>` 모두 `base.nowrap` 클래스이고, `base.module.css`에 `.nowrap { white-space: nowrap }`이 정의돼 있는지 짝으로 본다(design.md 'CSS 시험 방식' 주의).
  - 그다음 구현한다.
    - `SiteHeader.module.css`: 768 블록의 `.start::after { display: none }`을 지우고 주석을 맞춘다.
    - `PrivacySection.tsx`·`FeaturesSection.tsx`: 해당 설명만 `<span className={base.nowrap}>`로 감싼다. 문구는 바꾸지 않는다.
  - 옛 시험(AC-001.1~008.1)과 다른 landing-v2 시험은 이름·내용을 고치지 않고 그대로 통과해야 한다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과.

## TASK-14: 세 폭 다시 찍기
- REQ: REQ-112
- Files: src/components/landing/*.module.css
- TDD: exempt — 화면 측정 작업이라 먼저 쓸 실패 시험이 없다. 새 로직을 만들지 않는다.
  - TASK-11과 같은 서버·찍기 방법을 쓴다. 스크립트는 scratchpad에 두고 저장소에 넣지 않는다.
  - AC-112.4를 잰다. 고치기 전 사진은 TASK-13 앞 커밋 `b060462`를 `git archive`로 띄워 찍고, 고친 세 곳을 768에서 나란히 놓는다.
  - 측정이 어긋나면 랜딩 CSS 안에서만 고치고 `verify`를 다시 돌린다. 고친 점은 보고에 적는다. 시험 값을 바꿔야 하는 수정이면 고치지 말고 멈춰 보고한다.
  - 끝나면 서버·브라우저를 모두 멈추고 `ss -ltnp`로 확인한다.

## Phase 5 — 남은 정리

## TASK-15: 옛 주석 정리
- REQ: REQ-113
- Files: src/components/shell/AppShell.tsx, src/components/auth/AuthFrame.tsx, src/components/common/LogoMark.tsx, src/middleware.ts, src/components/shell/TabBar.tsx, src/comments.test.ts
- Tests: src/comments.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다. 세 파일(AppShell·AuthFrame·LogoMark)은 TASK-3·12의 범위이기도 해서, 이 TASK의 RED 기록 없이 고치면 훅이 막는다.
  - `src/comments.test.ts`(새 파일): AC-113.2. 다섯 파일을 글자로 읽어 확인한다.
    - AppShell·AuthFrame에 "한 색"·"글자색 ink를 따"·"자리표시"가 없다.
    - middleware.ts에 "랜딩 그림"이 없다. 그래서 새 주석은 이 낱말을 쓰지 않고 다른 말로 적는다(예: "옛 `landing/` 경로").
    - TabBar.tsx에 "teal"이 없다.
    - LogoMark.tsx 주석의 쓰는 곳 크기 목록에 20(히어로 미리보기)이 있다.
    - 지금 주석으로 RED를 본다(`tdd-run TASK-15 --expect red`).
  - 그다음 AC-113.2대로 주석만 고친다. 클래스·JSX·matcher 글자는 한 글자도 바꾸지 않는다(`git diff`에 주석 줄만 나와야 한다). 새 주석에 색 값을 쓰지 않는다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과.

## TASK-16: 로고 초점 고리
- REQ: REQ-113
- Files: src/components/landing/SiteHeader.module.css, src/components/landing/styles.test.ts
- Tests: src/components/landing/styles.test.ts
- TDD: required — 시험부터 더하고 RED를 본다.
  - `styles.test.ts`: AC-113.1의 CSS 부분을 더한다. 맨 위(휴대폰) 블록에 선택자가 `.logo:focus-visible`로 끝나고 클래스가 둘 이상인 규칙이 하나 있고 `outline-offset: -2px`인지 본다. 768·1024 블록에는 `.logo:focus-visible`을 고르는 규칙의 `outline-offset`이 없는지 본다.
  - 그다음 `SiteHeader.module.css`에 규칙을 더한다. `.nav .navLink:focus-visible` 옆에 같은 주석 방식으로 둔다.
  - 화면 측정(AC-113.1 마지막 줄)은 TASK-18에서 한다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과.

## TASK-17: 시험 보강
- REQ: REQ-113
- Files: src/app/theme.test.ts, src/components/landing/top.test.tsx, src/components/landing/HeroChart.test.tsx, src/components/landing/styles.test.ts
- Tests: src/app/theme.test.ts, src/components/landing/top.test.tsx, src/components/landing/HeroChart.test.tsx, src/components/landing/styles.test.ts
- TDD: exempt — 시험만 단단하게 고친다. 구현을 바꾸지 않으므로 지금 코드에서 RED가 나올 수 없다. 대신 검사 함수에 일부러 틀린 CSS·마크업 글자를 넣고 실패를 기대하는 시험을 영구로 둔다. 랜딩 CSS를 잠깐 고쳐 보는 방식은 쓰지 않는다(TASK-17 Files 밖이다).
  - AC-113.3: `theme.test.ts` AC-102.4의 임시 예외(`LEGACY`·`pending`)와 그 주석을 지운다. 쓰지 않게 된 `OLD_LANDING_VARS`가 다른 곳에서 안 쓰이면 함께 지운다.
  - AC-113.4: `top.test.tsx`·`HeroChart.test.tsx`의 클래스 확인 도우미가 넘겨받은 모듈 파일마다 확인한 클래스 수를 센다. 0인 파일이 하나라도 있거나 견본 해시 키가 겹치면 실패하게 한다.
  - AC-113.5: `styles.test.ts`의 AC-112.1 시험이 맨 위·768·1024 블록 규칙을 모두 훑게 한다(AC-106.2 nav 시험처럼). `.start`와 `::after`·`:after`를 함께 고르는 선택자에 `display: none`과 `content: none`이 둘 다 없는지 본다.
  - 새 시험 이름에 AC-113.3·113.4·113.5를 넣는다. 도우미만 고치면 AC-107.x 이름 안에 AC-113.4가 나오지 않으므로, AC-113.4 이름의 시험을 따로 둔다. 기존 시험의 기대값은 바꾸지 않는다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과.

## TASK-18: 로고 초점 고리 화면 측정
- REQ: REQ-113
- Files: src/components/landing/*.module.css
- TDD: exempt — 화면 측정 작업이라 먼저 쓸 실패 시험이 없다. 새 로직을 만들지 않는다.
  - TASK-14와 같은 서버·찍기 방법을 쓴다(지금 커밋을 `git archive`로 띄움). 스크립트는 scratchpad에 두고 저장소에 넣지 않는다.
  - AC-113.1 마지막 줄을 390·768·1440에서 잰다. 초점이 간 로고를 찍어, 안쪽 고리가 로고 마크·글자와 겹쳐 보기 싫지 않은지 본다.
  - AC-111.1·112.4 측정값이 그대로인지도 다시 본다.
  - 측정이 어긋나면 랜딩 CSS 안에서만 고치고 `verify`를 다시 돌린다. 시험 값을 바꿔야 하는 수정이면 고치지 말고 멈춰 보고한다.
  - 끝나면 서버·브라우저를 모두 멈추고 `ss -ltnp`로 확인한다.

## Phase 6 — 문구 고침

## TASK-19: 주사 카드 "F/U 기록" → "F/U"
- REQ: REQ-114
- Files: src/components/landing/OrthoSection.tsx, src/components/landing/middle.test.tsx, src/app/page.test.tsx, docs/mockups/landing-v2/index.html
- Tests: src/components/landing/middle.test.tsx, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - `middle.test.tsx`: AC-114.1 시험을 새로 둔다. `#ortho` 글자에 "F/U 기록"이 없고, 주사 카드 p 글자 전체가 "주사 치료 수와 F/U"이고, 조각 둘째 줄이 "F/U"·"37건"인지 본다.
  - `middle.test.tsx`: AC-108.3 시험 두 개의 기대값 중 주사 카드 두 곳만 새 문구로 바꾼다(설명, 조각 줄 `F/U 37건`).
  - `page.test.tsx`: 페이지 전체 글자에 "F/U 기록"이 없다는 AC-114.1 시험을 둔다.
  - 옛 AC-005.1 이름 시험 두 곳(`page.test.tsx`·`middle.test.tsx`)은 '주사 치료 수와 F/U 기록' 한 줄만 '주사 치료 수와 F/U'로 바꾼다. 시험 이름과 다른 줄은 그대로다(AC-101.3 예외).
  - 지금 코드로 RED를 본다(`tdd-run TASK-19 --expect red`).
  - 그다음 `OrthoSection.tsx`의 두 글자만 고친다. 시안 `docs/mockups/landing-v2/index.html`의 같은 두 곳(주사 카드 설명 `<p>`, 조각 줄 `<span>`)도 같이 고친다. 다른 줄은 바꾸지 않는다.
  - 끝 조건: `npm test`·`npm run lint`·`npm run build` 통과. 127.0.0.1 개발 서버(가짜 Supabase 값, 로그인 안 함)에서 390·1440 폭의 주사 카드를 찍어 본다. 사진과 스크립트는 scratchpad에 두고 저장소에 넣지 않는다. 끝나면 서버·브라우저를 멈추고 `ss -ltnp`로 확인한다.
