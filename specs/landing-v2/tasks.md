# 작업 분할: 랜딩페이지 디자인 전면 개편 (Linear·Stripe 톤, 제품 화면 미리보기)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 모양 기준: `docs/mockups/landing-v2/index.html`. 값 표: requirements.md·design.md, 규칙: `docs/UI_GUIDE.md` 랜딩 절.
> 모든 TASK에서 REQ-101(바뀌지 않는 동작)을 지킨다. 옛 동작 시험은 이름·내용을 고치지 않는다(design.md '옛 시험 다루기').
> **할 순서**: Phase 1(TASK-1~6) → Phase 2(TASK-7~10) → Phase 3(TASK-11).
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
    - `CHECKED`를 폴더 전체 읽기로 바꾼다. 랜딩의 `*.module.css` 11개 모두와 강조색 위치 (h)를 검사한다.
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
