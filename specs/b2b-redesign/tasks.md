# 작업 분할: B2B 디자인 시스템 개편 (모든 화면, UI/UX만)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 모양 기준: `docs/mockups/b2b-redesign/`(시안 소스) + 게시본 https://claude.ai/artifact/574fyw1mAQmqBw4jWjhr6f. 값: requirements.md·design.md. 규칙: `docs/UI_GUIDE.md`(TASK-1에서 새로 씀).
>
> **모든 TASK 공통**
> - REQ-201을 지킨다: 기능·API·인증·DB·middleware·`lib/` 계산과 `package.json`을 고치지 않는다.
> - 시험부터 고치고 RED를 본다(`tdd-run TASK-n --expect red`). 시험 이름에 새 AC ID를 넣는다.
> - "고치는 옛 시험"에 적힌 시험만 지우거나 기대값을 고친다. 목록 밖 시험은 이름·본문을 그대로 두고 통과해야 한다(AC-201.3). 목록 밖 시험을 고쳐야 할 것 같으면 멈추고 보고한다.
> - 시험 파일 맨 위의 그리기 준비(import·그려 둔 변수·짜임 정규식)를 바꾸는 일과, 시험의 `ui.*` 참조를 `ds.*`로 바꾸는 일(design.md '공통 모양 옮기기' 표)은 그 TASK "고치는 옛 시험"의 한 항목이다. 참조만 바꾼 시험은 기대값을 바꾼 것으로 치지 않는다.
> - 앱 화면 TASK(15~20·22)는 그 화면 컴포넌트의 `ui.*`를 `ds.*`로 바꾼다. `ui` 묶음 자체는 TASK-23 전까지 고치지 않는다.
> - 대시보드 두 폴더(`src/components/dashboard/*`·`src/app/(app)/dashboard/*`)는 어느 TASK도 고치지 않는다(2026-10-31 사용자 결정, design.md '대시보드 본문 빼기'). 그 시험은 그대로 통과해야 한다.
> - 고친 화면의 파일은 `ui/classes.test.ts`의 검사 목록(AC-204.6)과 상자 겹침 검사(AC-204.7, 앱 화면) 또는 `landing/rules.test.ts`의 검사 목록(AC-212.1)에 더한다.
> - `src/comments.test.ts`(landing-v2 AC-113.2)가 그대로 통과해야 한다. AppShell·AuthFrame 주석에 "한 색"·"글자색 ink를 따"·"자리표시"를 쓰지 않고, 로고 주석은 "LogoMark 고정 두 색(C③)"을 말한다. 주석에 색 값을 쓰지 않는다.
> - 끝 조건: `npm test`·`npm run lint`(경고 0)·`npm run build` 통과.
>
> **할 순서**: Phase 1(TASK-1~7) → Phase 2(TASK-8~14) → Phase 3(TASK-15~19) → Phase 4(TASK-20) → Phase 5(TASK-22) → Phase 6(TASK-23~24).
> 각 Phase 끝에 오케스트레이터가 `python3 ~/.claude/harness/bin/verify`를 돌리고, 바뀐 화면을 1440·390에서 찍어 사용자에게 보인다(TASK가 아님).
> - 찍는 법은 TASK-24와 같다(가짜 Supabase `docs/mockups/b2b-redesign/tools/stub.mjs`, 스크립트·사진은 scratchpad).
> - Phase 1~5 사진은 중간 상태다. 아직 안 고친 화면은 새 토큰 값과 옛 배치가 섞여 보인다(design.md 위험). `/dashboard` 본문은 Phase 6 뒤에도 그렇다.
>
> **2026-10-31 명세 고침(승인 뒤)**: TASK-21(대시보드 틀·빈 상태)을 뺐다. 대시보드는 다음 명세에서 따로 계획한다. 번호 TASK-21·REQ-219는 비워 두고 뒤 번호는 당기지 않는다. 함께 고친 곳: TASK-14(`.btnSm` 예외, AC-212.4), TASK-23(대시보드가 쓰는 옛 이름 남기기·검사에서 빼기), TASK-24(Files·대시보드 사진 기대).

## Phase 1 — 디자인 기초: 토큰·글꼴·공통 모양·차트 부품

## TASK-1: 문서 — ADR-019·UI_GUIDE·ARCHITECTURE·CLAUDE.md
- REQ: REQ-202, REQ-203, REQ-212
- Files: docs/ADR.md, docs/UI_GUIDE.md, docs/ARCHITECTURE.md, CLAUDE.md
- TDD: exempt — 문서만 고친다.
  - `docs/ADR.md`
    - ADR-019를 더한다. 글은 design.md '결정과 트레이드오프'의 초안 그대로다.
    - ADR-014·015·018의 **상태** 줄에 "토큰·글꼴(·랜딩 짜임)은 ADR-019 / specs/b2b-redesign이 대체"를 한 줄씩 더한다. 결정 본문은 고치지 않는다.
  - `docs/UI_GUIDE.md`: 랜딩·앱을 한 벌로 다시 쓴다. 맨 위에 기준(시안·명세·ADR-019, 승인 2026-10-30)과 "landing-v2·auth의 모양 값은 기록으로만 남는다"를 적는다.
    - 원칙과 하지 마라(그라데이션·카드 그림자·상자 안 상자·두 번째 글꼴·700 굵기·지어낸 숫자)
    - 토큰 표: REQ-202 값과 쓰는 곳
    - 글자 11단계, 간격 단계, 모서리·선·그림자
    - 칸·폭: 12칸, 랜딩 1200, 앱 1280, 768·1024
    - 단추·칩·입력·표·패널·떠 있는 층: REQ-204
    - 차트 규칙: REQ-205와 design.md '차트 부품'
    - 미리보기(예시)
    - 빈 상태
    - 앱 틀(붙는 띠 + 탭)
    - 랜딩 짜임(섹션 6개, 띠 2개)
    - 휴대폰(44px 누름, 1줄 메뉴)
    - 아이콘·로고(C③ 예외 색)
  - `docs/ARCHITECTURE.md`: `components/charts/`·`components/preview/`·`src/testing/`·`src/app/fonts/`를 한 줄씩 적는다.
  - `CLAUDE.md` 기술 스택 줄: "글꼴은 `next/font/local`의 Pretendard, 토큰은 `globals.css` `:root` 한 곳(ADR-019)". 다른 줄은 바꾸지 않는다.
  - 구현 중 값이 바뀌면 TASK-23에서 UI_GUIDE를 다시 맞춘다.

## TASK-2: 글꼴 Pretendard (layout·fonts)
- REQ: REQ-203
- Files: src/app/fonts/Pretendard-Regular.subset.woff2, src/app/fonts/Pretendard-Medium.subset.woff2, src/app/fonts/Pretendard-SemiBold.subset.woff2, src/app/fonts/OFL.txt, src/app/layout.tsx, src/app/globals.css, src/app/fonts.test.ts, src/app/theme.test.ts
- Tests: src/app/fonts.test.ts, src/app/theme.test.ts
- TDD: required — 먼저 `src/app/fonts.test.ts`를 쓰고 RED를 본다.
  - AC-203.1: 네 파일과 sha256, 세 글꼴 합 ≤ 810,000바이트, 폴더에 다른 파일 없음.
  - AC-203.2: `layout.tsx` 글자로 `localFont` 한 번·세 src·weight·`display`·`variable`, 시험 밖 `src/`에 `next/font/google`·`IBM_Plex`·`Space_Grotesk`·`--font-plex`·`--font-num`·`--font-grotesk` 없음.
  - 그다음 구현한다.
    - 파일 받기: scratchpad에서 `npm pack pretendard@1.3.9`로 꾸러미만 받아 푼다(저장소 의존성에 넣지 않는다). `dist/web/static/woff2-subset/`의 세 파일과 `dist/LICENSE.txt`(→ `OFL.txt`)를 복사한다.
    - `layout.tsx`: `IBM_Plex_Sans_KR`을 `localFont`로 바꾼다.
    - `globals.css`: `--font-sans` 두 곳(`@theme inline`·`:root`)의 `var(--font-plex)`를 `var(--font-pretendard), 'Apple SD Gothic Neo', 'Malgun Gothic'`로 바꾼다. 토큰 정리는 TASK-3이다.
  - 고치는 옛 시험(`theme.test.ts`):
    - describe 'AC-102.4: 글꼴은 IBM Plex Sans KR 하나'(3개)와 'AC-113.3: 임시 예외 없이…' → 지운다. `fonts.test.ts`의 AC-203.2가 맡는다.
    - 'AC-013.1: 글꼴 sans는 next/font의 IBM Plex Sans KR(--font-plex)' → 기대값만 `--font-pretendard`로.
    - 'AC-102.1: layer 밖 랜딩 :root는 색 12·섞은 색 2·틀 2와 --font-sans(AC-102.4)만 둔다'의 `--font-sans` 값 기대만 새 값으로.
  - 끝 조건(더): `npm run build` 뒤 `.next/static/media/*.woff2`가 3개이고 합이 810,000바이트 이하인지 보고에 적는다(AC-203.2 마지막 줄).
  - 굵기 규칙 시험(AC-203.3)은 700을 쓰는 화면이 다 바뀐 뒤 TASK-23에서 넣는다.

## TASK-3: 디자인 토큰 한 곳 (globals.css)
- REQ: REQ-202
- Files: src/app/globals.css, src/app/theme.test.ts, src/components/ui/classes.test.ts
- Tests: src/app/theme.test.ts, src/components/ui/classes.test.ts
- TDD: required — 먼저 `theme.test.ts`를 고치고 RED를 본다.
  - 새 시험:
    - AC-202.1: `:root` 토큰 이름·값 표와 design.md '옛 이름 별칭'의 랜딩 별칭(값은 `var()`)만 있다.
    - AC-202.2: `@theme inline`이 `var()`만 쓰고 `initial` 네 줄이 있다. 글자 11단계·모서리·그림자·색 이름이 있고 옛 Tailwind 별칭이 표와 같다. 실제 Tailwind(postcss)로 돌려 `text-small`이 `font-size: var(--fs-small)`·`line-height: var(--lh-small)`이 되고, `text-sm`·`rounded-lg`·`shadow-md`·`bg-blue-500`이 만들어지지 않는다.
    - AC-202.3: 시험 밖 `src/`의 16진수 색·`rgb(`·`hsl(`·`color-mix(` 위치. 옮기는 동안의 예외는 `src/components/auth/LoginCard.tsx`(구글 마크) 하나다.
    - AC-202.4: 그라데이션·blur·그림자 하나·`body` 글꼴 `var(--font-ui)`.
  - 그다음 `globals.css`의 `:root`와 `@theme`을 design.md '토큰 블록'대로 다시 쓴다. Tailwind 불러오기 줄·`@source` 줄·`@layer base`(`.app-ui` 초기화, `a`)·모션 줄이기는 그대로다.
  - 고치는 옛 시험:
    - `theme.test.ts`
      - describe 'AC-013.1: @theme 토큰'(6개) → AC-202.2.
      - describe 'AC-102.1'(3개)·'AC-102.2'(2개)·'AC-102.3'(1개) → AC-202.1·AC-202.4. `@layer base`의 `a`·`.app-ui` 시험은 그대로 둔다.
      - 'AC-013.1: Tailwind는 src/ 안 소스만 보고 시험 파일(*.test.ts·*.test.tsx)은 보지 않는다…' → "만들어야 하는 클래스" 목록만 끝까지 남는 `max-md:hidden`·`flex-[1_1_160px]`·`shadow-float`로 바꾼다(개편으로 `lg:max-w-60`·`md:table-fixed`·`empty:sr-only`·`bg-ink`가 없어질 수 있음). "만들지 않는 클래스"(`overflow-hidden`·`rounded-2xl`·`text-4xl`)는 그대로다.
      - 'AC-013.1: Tailwind 불러오기' describe의 나머지 두 시험, '.app-ui 초기화'·'PostCSS 설정과 패키지' describe는 그대로다.
    - `classes.test.ts`: 'AC-013.4: 입력란·읽기 전용 칸 글자는 폰에서 16px'의 globals 확인 줄 `--text-lead: 16px` → `--fs-lead: 16px`. 이 한 줄만 고친다.
  - `globals.test.ts`와 `landing/styles.test.ts`(랜딩 모듈이 쓰는 변수가 `:root`에 있는지)는 이 TASK 범위 밖이고, 고치지 않고 통과해야 한다. 랜딩 별칭이 그 일을 한다.
  - 위험 확인(design.md): `npm run build` 뒤 `.next/static/css`에서 위 클래스 모양을 한 번 보고 보고에 적는다.

## TASK-4: 앱 공통 모양(새 묶음 ds)·아이콘·상자 검사 도우미
- REQ: REQ-204
- Files: src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/common/Icon.tsx, src/components/common/Icon.test.tsx, src/testing/boxes.ts, src/testing/boxes.test.ts
- Tests: src/components/ui/classes.test.ts, src/components/common/Icon.test.tsx, src/testing/boxes.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다.
  - `classes.test.ts`(새 describe만 더함)
    - AC-204.1~AC-204.5: `ds`의 키별 클래스(design.md '공통 모양 옮기기' 표의 새 키 전부).
    - AC-204.6: 규칙 시험과, 그 규칙이 잘못된 예(`p-2.5`·`gap-[10px]`·`rounded-lg`·`text-sm`·`bg-linear-to-r`·`sm:`·`overflow-hidden`)를 잡는지. 검사 대상 시작값은 `ds`의 클래스 글자와 `common/Icon.tsx`다.
    - `ds` 단추·입력의 휴대폰 44px 시험(AC-204.1·AC-204.3).
  - `Icon.test.tsx`: 이름 16개(시안 `parts.mjs`의 `I`: shield·lock·clock·cal·upload·user·chev·check·x·arrow·arrowDown·monitor·server·sigma·doc·stop). 모두 `aria-hidden="true"`·viewBox `0 0 16 16`·`fill="none"`·`stroke="currentColor"`·선 1.5이고 `size`가 너비·높이다.
  - `boxes.test.ts`(AC-204.7 도우미): 겹친 상자를 찾는다, `aria-hidden` 안은 건너뛴다, 테두리 요소 자신이 `aria-hidden`이면 상자로 치지 않는다, 상자가 없으면 빈 배열이다.
  - 구현: `classes.ts`에 `export const ds`를 더한다. `export const ui`는 한 글자도 바꾸지 않는다(design.md '공통 모양 옮기기'). 그래서 화면 컴포넌트와 그 시험은 이 TASK에서 바뀌지 않고 그대로 통과한다.
  - 고치는 옛 시험: 없다. `classes.test.ts`의 'AC-013.2'·'AC-013.3'·'AC-013.4' 시험은 옛 `ui`를 그대로 보고 통과한다(TASK-23에서 `ui`와 함께 지움).

## TASK-5: 차트 부품 ① 숫자 글자·KpiStat·Sparkline
- REQ: REQ-205
- Files: src/components/charts/format.ts, src/components/charts/format.test.ts, src/components/charts/Sparkline.tsx, src/components/charts/KpiStat.tsx, src/components/charts/KpiStat.test.tsx, src/components/charts/rules.test.ts, src/components/ui/classes.test.ts
- Tests: src/components/charts/format.test.ts, src/components/charts/KpiStat.test.tsx, src/components/charts/rules.test.ts, src/components/ui/classes.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다.
  - `format.test.ts`: AC-205.1. 버림 오차 경계(`0.29` → `'29.0'`, `-0.0027` → `'0.2%p'` 줄어듦)와 `percentOf`(0·max 0·넘침 자르기)도 넣는다.
  - `KpiStat.test.tsx`: AC-205.2(Sparkline 점 글자·순서·2개 미만)와 AC-205.3(값·단위·증감 네 종류·null·`size="sm"`·`sparkOnPhone`). 상자 겹침이 없다(AC-204.7 도우미).
  - `charts/rules.test.ts`: AC-205.8. 폴더의 `*.ts`·`*.tsx`(시험 제외)를 모두 읽는다. 다음 TASK의 파일도 저절로 들어온다.
  - `classes.test.ts`: AC-013.2 검사 폴더(`APP_DIRS`)와 AC-204.6 검사 목록에 `src/components/charts`를 더한다.

## TASK-6: 차트 부품 ② 쌓은 막대·범례
- REQ: REQ-205
- Files: src/components/charts/scale.ts, src/components/charts/scale.test.ts, src/components/charts/StackedBarChart.tsx, src/components/charts/StackedBarChart.test.tsx, src/components/charts/ChartLegend.tsx, src/components/charts/ChartLegend.test.tsx
- Tests: src/components/charts/scale.test.ts, src/components/charts/StackedBarChart.test.tsx, src/components/charts/ChartLegend.test.tsx, src/components/charts/rules.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다.
  - `scale.test.ts`: `niceScale` — 714(→800), 0(→[0]), 1(→간격 1·최대 4), 99(→100), 250(→400), 1001(→2000).
  - `StackedBarChart.test.tsx`: AC-205.4. 시험 안 예시 8주로 본다.
    - 눈금 줄 수·글자
    - 막대 높이 %(합계/800)·계열 순서(첫 계열 위)
    - 집계 중 막대 빗금: 막대 안 `<svg aria-hidden>`의 `<path stroke="currentColor">`, `<pattern>`·`url(#`·`id` 없음(한 쪽에 차트가 둘이어도 겹칠 id가 없다), 마지막 선이 k = 440(폭 40·높이 400을 덮음), svg에 style 없음
    - `partial` 글자 "일부 기간"
    - 마지막 완료 칸 굵게
    - `note`·`compact`에서 빠지는 것
    - `sr-only` 표 caption·머리·줄
    - inline style 종류
    - 합계 0 차트
  - `ChartLegend.test.tsx`: AC-205.5.

## TASK-7: 차트 부품 ③ 순위 막대·줄 안 막대
- REQ: REQ-205
- Files: src/components/charts/RankedBars.tsx, src/components/charts/RankedBars.test.tsx, src/components/charts/InlineBar.tsx, src/components/charts/InlineBar.test.tsx
- Tests: src/components/charts/RankedBars.test.tsx, src/components/charts/InlineBar.test.tsx, src/components/charts/rules.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다.
  - `RankedBars.test.tsx`: AC-205.6.
    - 시안 `REGIONS` 7개로 순서(rest 뒤)·같은 값 순서·폭 %·rest 색을 본다.
    - 몫 글자 168/714 → "23.5%"를 본다.
    - 최대 0도 본다.
  - `InlineBar.test.tsx`: AC-205.7. 86/74/402, previous null, max 0, current > max(100%로 자름).

## Phase 2 — 랜딩

## TASK-8: 대시보드 미리보기 (예시)
- REQ: REQ-206
- Files: src/components/preview/sample.ts, src/components/preview/sample.test.ts, src/components/preview/DashboardPreview.tsx, src/components/preview/DashboardPreview.test.tsx, src/components/ui/classes.test.ts, src/components/common/LogoMark.tsx, src/comments.test.ts
- Tests: src/components/preview/sample.test.ts, src/components/preview/DashboardPreview.test.tsx, src/components/ui/classes.test.ts, src/comments.test.ts
- TDD: required — 시험부터 쓰고 RED를 본다.
  - `sample.test.ts`: AC-206.1. 8주 값·상태·메모, KPI 값과 증감(계산한 Delta), Sparkline 7개 값, 병원 이름·탭.
  - `DashboardPreview.test.tsx`: AC-206.2·AC-206.3.
    - 순서·칩·탭 6개(5·6번째 숨김 클래스)
    - KPI 4개와 보이는 글자: "714"·"17명 (+2.4%)"·"131"·"5명 (+3.9%)"·"583"·"12명 (+2.1%)"·"18.3"·"0.2%p"
    - 차트 compact·범례
    - 금지 요소·`'use client'` 없음
    - 상자 겹침 없음
  - `classes.test.ts`: AC-013.2 검사 폴더와 AC-204.6 검사 목록에 `src/components/preview`를 더한다.
  - 고치는 옛 시험(`comments.test.ts`):
    - 'AC-113.2: LogoMark.tsx 주석의 쓰는 곳 크기 목록에 히어로 미리보기(20)가 있고, src/에서 쓰는 크기가 모두 들어 있다' → AC-221.3의 느슨한 꼴로 바꾼다. 목록 줄은 "쓰는 곳:"으로 찾는다. `src/`에서 쓰는 크기가 모두 목록에 있어야 한다(같은 집합인지는 TASK-23에서 본다).
    - `LogoMark.tsx`는 주석만 고친다. 새 크기(메뉴 24·바닥글 18·미리보기 18·앱 틀 24·인증 틀 28)와 옮기는 동안 남는 옛 크기(22·20·26)를 적는다. 코드는 한 글자도 바꾸지 않는다.

## TASK-9: 랜딩 공통 모양 (base.module.css + 규칙 시험)
- REQ: REQ-212, REQ-203
- Files: src/components/landing/base.module.css, src/components/landing/rules.test.ts, src/components/landing/styles.test.ts
- Tests: src/components/landing/rules.test.ts
- TDD: required — 먼저 `rules.test.ts`를 쓰고 RED를 본다.
  - CSS 읽기 도우미: 주석 지우기, 맨 위·`@media`·`@layer` 블록 나누기.
  - AC-212.1: 검사 목록 `CHECKED = ['base.module.css']`.
  - AC-212.2: `@layer base` 안의 요소 초기화, `.root`·`.wrap`·`.grid`·`.sec`·`.band`·글자 단계·단추·칩 값, 숨김 도우미.
  - 구현: `base.module.css`를 새 토큰으로 다시 쓴다.
    - 아직 안 고친 섹션이 쓰는 옛 클래스 이름(`.tH2`·`.tH3`·`.tH3l`·`.tLead`·`.tBody`·`.tSmall`·`.tLabel`·`.card`·`.item`·`.items`·`.itemsFour`·`.grid3`·`.grid4`·`.group`·`.secCanvas`·`.stack`·`.head`·`.chipOk`·`.chipAttn`·`.chipWait`·`.chipSample`·`.nowrap` 등)은 이름을 두고 새 규칙 값으로 바꾼다.
    - 쓰지 않게 된 클래스는 TASK-14에서 지운다.
  - 고치는 옛 시험: `styles.test.ts` 파일을 지운다(landing-v2 AC-105.x~AC-113.x의 CSS 값 시험 전부. design.md '시험 방식').
  - `top`·`middle`·`bottom`·`page` 시험(클래스가 CSS에 정의돼 있는지 포함)은 고치지 않고 통과해야 한다.

## TASK-10: 랜딩 위쪽 메뉴·바닥글
- REQ: REQ-207, REQ-212
- Files: src/components/landing/SiteHeader.tsx, src/components/landing/SiteHeader.module.css, src/components/landing/SiteFooter.tsx, src/components/landing/SiteFooter.module.css, src/components/landing/top.test.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx, src/components/common/LogoMark.test.tsx
- Tests: src/components/landing/top.test.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx, src/components/common/LogoMark.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `top.test.tsx`에 AC-207.1, `bottom.test.tsx`에 AC-207.3, `rules.test.ts`에 AC-207.2(CSS 부분)를 넣는다. `CHECKED`에 두 모듈을 더한다.
  - 고치는 옛 시험:
    - `top.test.tsx`
      - describe 'AC-106.1: 위쪽 메뉴의 짜임'(5개) → AC-207.1.
      - 'AC-005.2: 메뉴 로고의 서비스 이름은 [서비스 이름]이다' → 지운다(AC-207.1이 없음을 본다).
    - `bottom.test.tsx`
      - describe 'AC-110.5: 푸터의 짜임'(3개) → AC-207.3.
      - 'AC-005.2: 푸터의 서비스 이름은 [서비스 이름], 문의 메일은 [이메일 주소]' → 지운다.
    - `page.test.tsx`
      - 'AC-005.2: [서비스 이름]은 메뉴 로고와 푸터에, 문의 메일은 [이메일 주소]' → 지운다(TASK-14 AC-211.3이 맡음).
      - 'AC-105.8: 로고는 <LogoMark />를 부르기만 한다(메뉴 22 · 미리보기 20)…' → 기대 크기만 메뉴 24 · 미리보기 20 · 바닥글 18.
    - `LogoMark.test.tsx` 'AC-103.2: AppShell(26)·AuthFrame(26)·SiteHeader(22)는…'·'AC-103.2: 그린 화면마다 로고 svg(viewBox 0 0 30 30)가 하나이고…' → SiteHeader 기대 크기만 24.
    - `top.test.tsx` 'AC-001.2: 로고는 #top(히어로)으로 가고, 히어로 섹션 id가 top이다' → 로고 링크를 `[서비스 이름]` 글자 대신 `href="#top"`(글자 "맨 위로")로 찾는다. 기대 그대로.
  - 'AC-001.2: nav aria-label="주요 메뉴" 안에 섹션 링크 4개…'·'AC-002.1'·'AC-007.1'·'AC-008.1' 메뉴 시험은 그대로 통과해야 한다.

## TASK-11: 랜딩 히어로 (미리보기, 숫자 순환·약속 띠 빼기)
- REQ: REQ-208, REQ-212
- Files: src/components/landing/Hero.tsx, src/components/landing/Hero.module.css, src/components/landing/HeroChart.tsx, src/components/landing/HeroChart.module.css, src/components/landing/HeroChart.test.tsx, src/components/landing/heroFrames.ts, src/components/landing/heroFrames.test.ts, src/components/landing/PromiseBand.tsx, src/components/landing/PromiseBand.module.css, src/app/page.tsx, src/components/landing/top.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- Tests: src/components/landing/top.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `top.test.tsx`에 AC-208.1, `page.test.tsx`에 AC-208.3(지운 파일·클라이언트 코드 없음), `rules.test.ts`에 AC-208.2를 넣는다. `CHECKED`에 `Hero.module.css`를 더한다.
  - 구현:
    - `Hero.tsx`를 다시 쓴다. 미리보기는 `<DashboardPreview />`, 아이콘은 `common/Icon`이다.
    - `page.tsx`에서 `PromiseBand`를 뺀다.
    - `HeroChart.*`·`heroFrames.*`·`PromiseBand.*` 파일을 지운다.
  - 고치는 옛 시험:
    - `HeroChart.test.tsx`·`heroFrames.test.ts`: 파일째 지운다. 옛 AC-003.1~AC-004.2, landing-v2 AC-107.3·107.4와 미리보기 AC-113.4가 대체된다.
    - `top.test.tsx`
      - 파일 맨 위: `HeroChart`·`PromiseBand`·`PromiseBand.module.css` import와 `band` 변수를 지운다.
      - describe 'AC-107.1'(7개) → AC-208.1. describe 'AC-107.5'(4개)와 'AC-001.1: 핵심 약속 띠는 section aria-label=…' → 지운다.
      - 'AC-008.1: 메뉴·히어로·약속 띠의 svg가 모두 aria-hidden="true"다'·'AC-007.1: 메뉴·히어로·약속 띠에 form·input·textarea·button이 없다' → 훑는 목록에서 `band`만 뺀다(기대 그대로).
      - 'AC-001.3: 히어로에 h1이 하나이고 글자는 …' → 기대 글자 "숫자로 보는 우리 의원"(태그 없음).
      - 'AC-005.2: 히어로 오른쪽은 HeroChart이고 …' → `DashboardPreview`와 "예시 숫자".
      - 'AC-113.4' 도우미 시험 3개 → 도우미를 더 쓰지 않으면 도우미와 함께 지운다.
    - `page.test.tsx`
      - 'AC-001.1: header → #top → 핵심 약속 → …' → 약속 띠 없는 순서(이 TASK 끝에는 `#start`가 아직 있음).
      - 'AC-001.1: 섹션은 main 하나 안에 있고, 메뉴 띠는 main 앞·푸터는 main 뒤에 있다' → section 개수만 8 → 7.
      - 'AC-001.3: h1은 하나이고 글자는 …' → 태그 없는 글자.
      - 'AC-105.8: inline style은 % 값의 높이·폭·위치 하나씩뿐이다…' → AC-212.4(랜딩 TSX에 inline style 없음).
      - 'AC-105.8: 랜딩 폴더의 *.tsx(시험 제외)에 색 글자(# + 16진수)가 없다' → 꼭 있어야 하는 파일 목록에서 `HeroChart.tsx`만 뺀다.
      - 'AC-105.8: 로고는 …' → 로고 목록만: 메뉴 24 한 번, 18은 바닥글·미리보기에 두 번(미리보기는 `components/preview` 소스).
      - 'AC-005.2: 예시 숫자 영역에 …' → "예시 숫자".
  - 'AC-005.1: 히어로 칩 …'·'히어로 아래 문장 …'(글자만 봄)과 `globals.test.ts`(모션 줄이기)는 그대로 통과해야 한다.

## TASK-12: 랜딩 AI 섹션·정형외과 비교표
- REQ: REQ-209, REQ-212
- Files: src/components/landing/AiSection.tsx, src/components/landing/AiSection.module.css, src/components/landing/OrthoSection.tsx, src/components/landing/OrthoSection.module.css, src/components/landing/middle.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- Tests: src/components/landing/middle.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `middle.test.tsx`에 AC-209.1·AC-209.2, `rules.test.ts`에 두 모듈의 CSS 부분을 넣는다. `CHECKED`에 두 모듈을 더한다.
  - 구현: 정형외과는 `ORTHO` 배열 하나에서 PC 표와 휴대폰 표를 그린다(design.md).
  - 고치는 옛 시험:
    - `middle.test.tsx`
      - 파일 맨 위·중간의 AI·정형외과 짜임 정규식(`AI_SHAPE`·`REP_*`·`CHAT_SHAPE`·`ORTHO_*` 등)을 새 짜임으로 바꾼다.
      - describe 'AC-108.1'(8개) → AC-209.1. describe 'AC-108.3'(5개) → AC-209.2.
      - 'AC-005.2: 모르는 값은 [ ] 빈칸 그대로다' → 지운다(TASK-14 AC-211.3).
      - 'AC-114.1: 주사 카드(첫 카드)의 p 설명은 정확히 …' → 찾는 자리만 PC 표 주사 열 "보는 숫자" 칸으로. 기대 글자 "주사 치료 수와 F/U"는 그대로.
      - 'AC-114.1: 주사 카드 조각은 이번 달 · 예시, …' → 찾는 자리만 표 주사 열(기준 "이번 달", 예시 줄 "주사 치료 142건"·"F/U 37건")으로.
  - 'AC-114.1: #ortho의 글자와 마크업 어디에도 F/U 기록 없음'·'AC-005.1: 정형외과 타일 4개의 설명 문구'·'AC-005.2: AI 리포트 카드에 "방금 생성 · 예시"'·'AC-104.1'·'AC-007.1'(질문 칩 span 포함)·'AC-008.1'과 `page.test.tsx`의 'AC-005.1'(글자만 봄)은 그대로 통과해야 한다.

## TASK-13: 랜딩 기능 섹션·개인정보 섹션
- REQ: REQ-210, REQ-212
- Files: src/components/landing/FeaturesSection.tsx, src/components/landing/FeaturesSection.module.css, src/components/landing/PrivacySection.tsx, src/components/landing/PrivacySection.module.css, src/components/landing/middle.test.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- Tests: src/components/landing/middle.test.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `middle.test.tsx`에 AC-210.1, `bottom.test.tsx`에 AC-210.2, `rules.test.ts`에 두 모듈을 넣는다(`CHECKED`).
  - 고치는 옛 시험:
    - `middle.test.tsx`
      - describe 'AC-109.1'(11개) → AC-210.1. describe 'AC-112.3'(3개) → 지운다(작은 카드 없음).
      - 'AC-007.1: "통계 파일을 여기에 놓기"는 받는 칸이 아니다(div 글자)' → 지운다(통계 미리보기 없음).
      - 기능 섹션 짜임 정규식(`FEATURES_SHAPE` 등)을 새 짜임으로 바꾼다.
      - 'AC-005.1: 기능 01 설명에 …' → 그대로 둔다.
    - `bottom.test.tsx`
      - describe 'AC-110.1'(10개) → AC-210.2. describe 'AC-112.2'(3개) → 지운다(`nowrap` span 없음).
      - 'AC-005.1: 개인정보 섹션 제목은 …' → `^환자 개인정보는<br\/>` 확인만 뺀다(글자 기대 그대로).
      - 'AC-005.1: 흐름 카드 제목 …'(멈춤 문구 빈칸 포함)·'AC-005.1: 큰 숫자 "0"과 단위 "건"'은 그대로 통과해야 한다.
    - `page.test.tsx`
      - 'AC-110.6: .secCanvas는 #ai · #features · #how 세 섹션에만 있다' → 지운다(TASK-14 AC-211.2가 띠를 본다).

## TASK-14: 랜딩 시작 3단계·페이지 짜임·빈칸 전체 검사·정리
- REQ: REQ-211, REQ-212
- Files: src/components/landing/HowSection.tsx, src/components/landing/HowSection.module.css, src/components/landing/StartSection.tsx, src/components/landing/StartSection.module.css, src/components/landing/base.module.css, src/app/page.tsx, src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- Tests: src/components/landing/bottom.test.tsx, src/components/landing/rules.test.ts, src/app/page.test.tsx
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험:
    - `bottom.test.tsx`: AC-211.1.
    - `page.test.tsx`: AC-211.2·AC-211.3, AC-212.3(페이지 전체 상자 겹침·섹션당 상자 하나 이하), AC-212.4.
    - `rules.test.ts`: `CHECKED`를 랜딩 폴더 전체 읽기로 바꾼다(AC-212.1). `base.module.css`의 모든 클래스가 쓰이는지 본다(AC-212.4). 예외 목록은 `.btnSm` 하나다(AC-212.2·AC-207.2 시험의 32px 기준값, requirements AC-212.4).
  - 구현:
    - `HowSection`을 다시 쓴다(시작하기 단추를 합침).
    - `page.tsx`에서 `StartSection`을 빼고 그 두 파일을 지운다.
    - `base.module.css`에서 쓰지 않는 옛 클래스를 지운다. `.btnSm`은 쓰는 곳이 없어도 남긴다(AC-212.4 예외).
  - 고치는 옛 시험:
    - `bottom.test.tsx`
      - 'AC-001.1: section#privacy · section#how · section#start · footer다' → `#start` 없이.
      - 파일 맨 위: `StartSection` import와 `start` 변수를 지우고 `all`에서 뺀다. 'AC-007.1: form·input·textarea·button이 없다'·'AC-008.1: 개인정보·시작 3단계·시작하기·푸터의 svg…'는 본문 그대로 통과해야 한다.
      - 'AC-002.1: 시작하기 섹션에 하나 있고 /login으로 간다(목업의 #top 아님)' → `#how`에 하나.
      - 'AC-002.1: 시작 3단계의 "구글로 시작하기"는 링크가 아닌 단계 제목이다' → `#how`의 링크는 [구글로 시작하기](`/login`) 하나이고, 단계 h3 "구글로 시작하기"는 링크가 아니다. `privacy + footer` 링크 0개는 그대로.
      - 'AC-001.1: 시작 3단계는 ol 안의 01·02·03이다' → "1·2·3".
      - describe 'AC-110.3'(4개) → AC-211.1. describe 'AC-110.4'(4개) → 지운다.
      - 'AC-110.1 · AC-110.3 · AC-110.4 · AC-110.5: 아무것도 받지 않는다' → 이름과 범위를 AC-210.2 · AC-211.1 · AC-207.3으로(내용 그대로).
    - `page.test.tsx`
      - describe 'AC-001.1: 섹션 순서'(2개, section 개수 7 → 6 포함) → AC-211.2.
      - 'AC-105.8: 랜딩 폴더의 *.tsx(시험 제외)에 색 글자(# + 16진수)가 없다' → 꼭 있어야 하는 파일 목록에서 `StartSection.tsx`만 뺀다.
      - 'AC-002.1: 메뉴·히어로·시작하기 섹션에 하나씩 모두 3개…' → 메뉴·히어로·`#how`.
  - 끝 조건(더): 이 TASK 끝에 랜딩 폴더 시험 파일은 `top`·`middle`·`bottom`·`rules`뿐이고 모두 통과한다.

## Phase 3 — 로그인·가입 신청·승인 대기·오류 화면

## TASK-15: 인증 화면 틀 (AuthFrame)
- REQ: REQ-213
- Files: src/components/auth/AuthFrame.tsx, src/components/auth/AuthFrame.test.tsx, src/app/login/page.test.tsx, src/app/(onboarding)/pending/page.test.tsx, src/app/(onboarding)/signup/page.test.tsx, src/components/common/LogoMark.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/auth/AuthFrame.test.tsx, src/app/login/page.test.tsx, src/app/(onboarding)/pending/page.test.tsx, src/app/(onboarding)/signup/page.test.tsx, src/components/common/LogoMark.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 먼저 `AuthFrame.test.tsx`를 쓰고 RED를 본다.
  - AC-213.1·AC-213.2를 본다: 열·두 칸, `headerEnd` 자리, `<main>` 하나, aside 숨김, 로고 크기.
  - `classes.test.ts` 검사 목록(AC-204.6)에 `AuthFrame.tsx`를 더한다.
  - 구현: `AuthFrame`에 `aside?: ReactNode`를 더하고 두 모양을 그린다. 로그인 페이지에 aside를 넘기는 일은 TASK-16이다.
  - 고치는 옛 시험:
    - `login/page.test.tsx`
      - 'AC-003.6: headerEnd가 없으면 머리띠에 로고·[서비스 이름]만 있다…' → 로고만(`['svg']`).
      - 'AC-003.6: headerEnd를 주면 머리띠 맨 끝…' → 위 줄 원소 개수만 3 → 2(로고·끝 자리). `ml-auto` 끝 자리와 본문에 단추 없음은 그대로.
      - 'AC-003.6: 로그인 화면 머리띠에는 오른쪽 끝 자리가 없다' → 원소 개수만 2 → 1.
      - 도우미 `headerInner()`는 새 위 줄 짜임에 맞춘다(파일 맨 위 준비).
      - 'AC-013.2·AC-013.3: 틀 모양 — .app-ui 뿌리·canvas 바탕, 흰 띠 64px…' → 지운다(`AuthFrame.test.tsx` AC-213.1).
      - 'AC-003.1: 위쪽 띠(로고·[서비스 이름])와 본문(main) 틀 안에 소개와 로그인 카드가 있다' → `[서비스 이름]` 기대만 뺀다.
    - `(onboarding)/pending/page.test.tsx`: 'AC-005.1: pending — 위쪽 띠(로고·[서비스 이름]·[로그아웃])…'·'AC-005.3: rejected — 같은 띠 [로그아웃]과 거절 카드…' → 띠 글자 기대만 `'[서비스 이름]로그아웃'` → `'로그아웃'`. 본문 단추 기대는 TASK-18이 고친다.
    - `(onboarding)/signup/page.test.tsx`: 'AC-004.2: 위쪽 띠(로고·[서비스 이름]만)…' → `[서비스 이름]` 기대만 뺀다.
    - `LogoMark.test.tsx` 'AC-103.2: AppShell(26)·AuthFrame(26)·SiteHeader(22)는…'·'AC-103.2: 그린 화면마다 로고 svg…가 하나이고…' → AuthFrame 기대 크기만 28.

## TASK-16: 로그인 화면 (LoginCard·LoginAside·GoogleMark)
- REQ: REQ-214, REQ-202
- Files: src/components/auth/LoginCard.tsx, src/components/auth/LoginCard.test.tsx, src/components/auth/LoginAside.tsx, src/components/common/GoogleMark.tsx, src/components/common/GoogleMark.test.tsx, src/app/login/page.tsx, src/app/login/page.test.tsx, src/app/theme.test.ts, src/components/ui/classes.test.ts
- Tests: src/components/auth/LoginCard.test.tsx, src/components/common/GoogleMark.test.tsx, src/app/login/page.test.tsx, src/app/theme.test.ts, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험:
    - `LoginCard.test.tsx`
      - AC-214.1·AC-214.2·AC-214.3을 본다.
      - 상자 겹침(AC-204.7)은 일반·앱 안 브라우저·`failed` 세 상태에서 본다.
    - `GoogleMark.test.tsx`: AC-214.4.
    - `theme.test.ts`: AC-202.3의 옮기는 동안 예외(`LoginCard.tsx`)를 지운다. 구글 색은 이제 `GoogleMark.tsx`에만 있다.
    - `classes.test.ts`: 검사 목록에 세 파일을 더한다.
  - 구현:
    - `LoginCard`는 폼만 그린다.
    - `LoginAside`는 소개 문장 + `DashboardPreview`다.
    - `login/page.tsx`는 `<AuthFrame aside={<LoginAside />}>`다. `searchParams`의 `error === '1'` 판단은 그대로다.
  - 고치는 옛 시험:
    - `LoginCard.test.tsx`
      - 'AC-003.1: 왼쪽 소개 — SIGN IN · 제목 · 설명 · 칩 4개…' → 지운다(AC-214.1이 없음을, AC-214.3이 소개 문장을 본다).
      - 'AC-003.1: 로그인 카드 — 제목 …' → 제목 태그만 h1.
      - 'AC-003.1·AC-013.2·AC-013.3: 모양 — [구글로 시작하기]는 주 단추 전체 폭, 기능 칩 4개…' → AC-214.1.
      - 'AC-003.1·AC-013.3: 글자 — SIGN IN은 caption 600 muted…' → AC-214.1.
      - 'AC-003.2·AC-013.3: 앱 안 안내는 canvas 상자(1px 선·6px)…' → AC-214.2.
    - `login/page.test.tsx` 'AC-003.1: 위쪽 띠…와 본문(main) 틀 안에 소개와 로그인 카드가 있다' → main 안 로그인 폼 + aside 안 소개·미리보기.
    - `LoginCard.test.tsx` 나머지 시험의 `ui.*` → `ds.*` 참조.
  - 구글 시작·막기·뒤로 가기·오류 카드·앱 안 브라우저 동작 시험(region "로그인"으로 찾음)과 'AC-003.2: 설명 문장 속 "크롬·엣지"는 한 덩이로…'는 기대값을 고치지 않는다(AC-201.3).

## TASK-17: 가입 신청 (SignupForm·Stepper)
- REQ: REQ-215
- Files: src/components/auth/SignupForm.tsx, src/components/auth/SignupForm.test.tsx, src/components/auth/Stepper.tsx, src/components/auth/Stepper.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/auth/SignupForm.test.tsx, src/components/auth/Stepper.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험:
    - `Stepper.test.tsx`: `current` 2·3의 단계 모양과 화면 읽기 글자.
    - `SignupForm.test.tsx`: AC-215.1(순서·칸 이름 줄·도움말·카드 없음·왼쪽 정렬 글자 단추)과 상자 겹침.
    - `classes.test.ts`: 검사 목록에 두 파일을 더한다.
  - 고치는 옛 시험(`SignupForm.test.tsx`):
    - 'AC-004.2: 가입 단계 칩 3개 — 구글 로그인(끝남) · 02 가입 신청(지금) · 03 관리자 승인' → AC-215.1(번호 "1·2·3", 끝남 체크).
    - 'AC-004.2·AC-013.3: 단계 표시 색 …' → AC-215.1.
    - 'AC-004.2·AC-013.2·AC-013.3: 모양 — 카드 ui.card, 입력란 ui.input, …' → AC-215.1(카드 없음, 나머지는 `ds.*` 참조).
    - 'AC-004.1·AC-013.3: 틀린 칸은 aria-invalid(테두리 danger)이고 칸 아래 문구는 ui.fieldError' → `ds.input`·`ds.checkbox`에 `aria-invalid:border-negative`, 문구는 `ds.fieldError`.
    - 나머지 시험의 `ui.*` → `ds.*` 참조.
  - 값 검사·보내기·저장 실패·[다른 계정으로 로그인] 동작 시험과 '목업 순서'·'필수·선택 표시와 자리표시 글자' 시험은 그대로 통과해야 한다. '긴 구글 이메일도 잘리지 않고…'는 `ui.readonly` → `ds.readonly` 참조만 바뀌고(`ds.readonly`에 `focus-within:border-accent`가 있음, AC-204.3) `min-w-0 wrap-anywhere`·`sr-only`는 그대로다.

## TASK-18: 승인 대기·거절 (PendingCard)
- REQ: REQ-216
- Files: src/components/auth/PendingCard.tsx, src/components/auth/PendingCard.test.tsx, src/app/(onboarding)/pending/page.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/auth/PendingCard.test.tsx, src/app/(onboarding)/pending/page.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `PendingCard.test.tsx`에 AC-216.1·AC-216.2(상태 줄·`dl`·단추 하나·`[이메일 주소]` 없음·상자 겹침)를 넣는다. `classes.test.ts` 검사 목록에 더한다.
  - 구현: `Stepper`(TASK-17)·`Icon`을 쓴다. 본문 `SignOutButton` 두 곳을 뺀다. `HeaderSignOut`은 `ds.button.ghostSmall`이다.
  - 고치는 옛 시험:
    - `PendingCard.test.tsx`
      - 'AC-005.1: 가입 단계 칩 3개 …' → `Stepper` 모양.
      - 'AC-005.1: 목업 순서 — 단계 · 제목 · 보낸 신청 내용 · [상태 다시 확인] · [로그아웃]…' → 단계 · 상태 줄 · 제목 · 보낸 신청 내용 · [상태 다시 확인].
      - 'AC-005.1: 본문 [로그아웃]은 signOut() 뒤 /login을 새로 연다'·'AC-005.3: 본문 [로그아웃]도 signOut() 뒤 /login을 새로 연다' → 지운다. 사용자 결정으로 본문 [로그아웃]이 없다. 같은 동작은 'HeaderSignOut' 시험과 `SignOutButton.test.tsx`가 맡는다.
      - 'AC-005.3: [다른 계정으로 로그인] · [로그아웃]만 있고 …' → [다른 계정으로 로그인]만.
      - 'AC-005.3: 제목 …'의 문의 문구 기대 → AC-216.2 문구.
      - describe 'PendingCard: 모양'(5개) → AC-216.1·AC-216.2.
    - `(onboarding)/pending/page.test.tsx`: 'AC-005.1: pending — …'의 본문 단추 기대 `['상태 다시 확인', '로그아웃']` → `['상태 다시 확인']`, 'AC-005.3: rejected — …'의 `['다른 계정으로 로그인', '로그아웃']` → `['다른 계정으로 로그인']`. [로그아웃]은 띠에 하나다. 보낸 신청 내용 region 찾기는 그대로다(AC-216.1의 `section aria-labelledby`).
    - `PendingCard.test.tsx` 나머지 시험의 `ui.*` → `ds.*` 참조.
  - [상태 다시 확인]·[다른 계정으로 로그인]·받은 값 글자 그리기·신청일 한국 날짜·연락처 끊어 보이기 시험은 그대로 통과해야 한다.

## TASK-19: 오류 화면·오류 카드
- REQ: REQ-217
- Files: src/components/common/ErrorCard.tsx, src/components/common/ErrorCard.test.tsx, src/app/error.tsx, src/app/error.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/common/ErrorCard.test.tsx, src/app/error.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `ErrorCard.test.tsx`에 AC-217.1, `error.test.tsx`에 AC-217.2와 상자 겹침을 넣는다.
  - 고치는 옛 시험:
    - `ErrorCard.test.tsx` 'AC-012.2·AC-013.2·AC-013.3: 오류 카드 모양 — danger-soft 바탕·6px 모서리…' → AC-217.1.
    - `error.test.tsx` 'AC-013.2: 화면 뿌리는 앱 초기화 범위(.app-ui), 가운데 한 칸은 최대 400px' → AC-217.2(AuthFrame 480 칸).
    - 두 파일 나머지 시험의 `ui.*` → `ds.*` 참조(예: 'AC-003.7·AC-013.3: [다시 시도]는 주 단추(ui.button.primary)…').
  - [다시 시도]·[로그아웃]·오류 내용 숨김·단추 줄(`flex-wrap`·`gap-2`·`flex-[1_1_160px]`) 시험은 그대로 통과해야 한다.
  - 오류 카드를 쓰는 로그인·가입·관리자 시험도 고치지 않고 통과해야 한다.

## Phase 4 — 앱 틀

> TASK-21(대시보드 틀·빈 상태)은 2026-10-31 사용자 결정으로 뺐다(위 '명세 고침'). Phase 4는 TASK-20 하나다.

## TASK-20: 앱 틀 (AppShell·TabBar·AccountMenu·KstClock)
- REQ: REQ-218
- Files: src/components/shell/AppShell.tsx, src/components/shell/TabBar.tsx, src/components/shell/AccountMenu.tsx, src/components/shell/KstClock.tsx, src/components/shell/shell.test.tsx, src/components/common/LogoMark.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/shell/shell.test.tsx, src/components/common/LogoMark.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `shell.test.tsx`에 AC-218.1~AC-218.3(붙는 묶음 하나·1280 감싸개 셋·첫 탭 맞춤·준비 중 faint)을 넣는다. 검사 목록에 네 파일을 더한다.
  - 구현: 클래스와 감싸개만 바꾼다. 탭·툴팁·밀기·메뉴·시계의 상태와 이벤트 코드는 바꾸지 않는다. `menu.ts`는 고치지 않는다.
    - TabBar 폭 맞춤은 nav 첫 자식 줄 하나에 클래스를 더해서 한다(AC-218.2). 새 감싸개를 넣지 않는다. 그래서 'AC-008.7: 1024px 미만에서는 띠 안에서 옆으로 밀린다…'(`nav().firstElementChild`가 `flex w-max min-w-full items-stretch`)가 그대로 통과한다.
    - 'AC-008.2: 관리자면 설정 뒤 세로 구분선…'(`w-px h-4 bg-line`), 'AC-008.7·AC-013.4: 폰은 44×44 아이콘 단추…'(`max-md:size-11`·`max-md:border-transparent`·메뉴 항목 `max-md:h-11`), 'AC-008.3: 768~1023px 띠에서도 병원 이름 자리가 남는다…'(이메일 `max-w-32 lg:max-w-60`, 병원 이름 `min-w-20 truncate`)의 클래스를 남긴다. 이 시험들은 그대로 통과해야 한다.
  - 고치는 옛 시험(`shell.test.tsx`)
    - TabBar
      - 'AC-008.5: 툴팁은 평소 숨고, 1024px 이상에서 올림·초점에 보인다(ink 바탕·흰 caption 500·4px·shadow-float)' → 모서리 기대만 `rounded-float`.
      - 'AC-008.5: 툴팁은 탭 띠 아래 페이지 제목을 덮지 않는다 — 탭(50px) 안 40px…' → 44px 탭 기준 값.
      - 'AC-008.5: 준비 중 탭의 모양은 다른 탭과 같다(같은 크기·글자·색)' → 같은 크기·글자, 색만 faint.
      - 'AC-008.1·AC-013.3: 탭 모양 — 50px·좌우 20px·tab 500 ink-2…'·'AC-008.1·AC-013.3: 지금 탭은 accent 700 + 아래 3px accent 밑줄…' → AC-218.2.
      - 'AC-008.7·AC-013.4: 폰 탭은 46px(44px 이상)·좌우 14px·body' → 44px·좌우 12px.
      - 'AC-008.1: 굵기가 바뀌어도 탭 폭이 흔들리지 않게 굵은 글자 폭을 미리 잡는다' → `after:font-bold` 기대만 `after:font-semibold`(지금 탭 600, AC-203.3).
    - AccountMenu 'AC-008.3·AC-013.3: 계정 단추 38px·1px line·6px·body 500…' → AC-218.3.
    - KstClock 'AC-008.6·AC-008.7: table 글자 muted, 폰에서만 숨긴다' → small 글자(숨김 그대로).
    - AppShell
      - 'AC-008.3: 위쪽 띠 왼쪽 로고·[서비스 이름]·구분선·병원 이름…' → 로고·병원 이름.
      - 'AC-008.1·AC-013.1: 앱 뿌리 .app-ui·canvas 바탕, 띠는 흰 바탕·64px·좌우 24px…'·'AC-008.1: 본문은 좌우 24px·위 24px·아래 28px' → AC-218.1.
      - 'AC-008.3·AC-013.3: [서비스 이름] logo 600, 병원 이름 lead 500…' → 병원 이름 subtitle 600.
      - 'AC-008.1: 띠 → 탭 줄(nav "메뉴") → 본문(main) 순서, 본문에 페이지를 그린다' → 띠와 탭 줄이 붙는 묶음 하나의 두 자식이고, 그 묶음 다음이 main이다(순서·본문 기대 그대로).
      - 'AC-008.7: 폰 — 띠 48px·좌우 16px, 로고·병원 이름(body 600)·계정 단추만 보이고 [서비스 이름]·구분선·시각은 숨…' → [서비스 이름]·구분선 기대를 빼고, 시각 숨김은 그대로.
    - `LogoMark.test.tsx` 'AC-103.2: AppShell(26)·AuthFrame(26)·SiteHeader(22)는…'·'AC-103.2: 그린 화면마다 로고 svg…가 하나이고…' → AppShell 기대 크기만 24.
    - 나머지 시험의 `ui.*` → `ds.*` 참조(예: 계정 메뉴 `ui.layer`).
  - 메뉴(menu)·탭 링크·관리자 탭·툴팁 Esc/올림/누름·'AC-008.7: 1024px 미만에서는 띠 안에서 옆으로 밀린다'·계정 메뉴 여닫기·[로그아웃]·한국 시각 시험과 `(app)/layout.test.tsx`는 그대로 통과해야 한다.

## Phase 5 — 관리자

## TASK-22: 관리자 가입 신청 화면
- REQ: REQ-220
- Files: src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx, src/components/ui/classes.test.ts
- Tests: src/components/admin/AdminApplications.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - 새 시험: `AdminApplications.test.tsx`에 AC-220.1~AC-220.3과 상자 겹침(세 탭·확인 창)을 넣는다. 검사 목록에 더한다.
  - 구현: 클래스와 감싸개만 바꾼다. 목록 읽기·탭 키보드·승인·거절·되돌리기·실패·초점 코드는 바꾸지 않는다. 완료 줄 자리의 `empty:sr-only`와 빈 연락처 "—"는 그대로다('AC-007.2: 완료 줄 자리…'·'AC-007.1: 표 칸은…'이 그대로 통과).
  - 고치는 옛 시험(`AdminApplications.test.tsx`)
    - 'AC-007.1: 제목·안내는 목업 그대로, 탭 줄(대기·승인·거절)마다 줄 수 칩, 처음 탭은 대기' → 칩 대신 글자 개수.
    - 폰
      - 'AC-007.7: 표 머리를 숨기고, 표는 옆으로 밀지 않고 줄을 세로로 쌓는다' → 몸 칸 기대 `max-md:gap-3`만 줄 사이 1px 선(사이 0)으로(AC-220.2). 머리 숨김·옆으로 밀지 않음은 그대로.
      - 'AC-007.7: 줄마다 카드처럼(흰 바탕·1px 선·6px) …' → AC-220.2.
      - 'AC-007.7: 대기·거절 줄은 폰에서 상태 칩(대기·거절됨)을 보이고, PC에서는 숨긴다' → 지운다(칩 없음, AC-220.2가 없음을 본다).
      - 'AC-007.7·AC-013.4: 동작 단추는 폰에서 전체 폭으로 나란히, 높이 44px' → 오른쪽에 나란히 44px.
      - 'AC-007.7·AC-013.4: 화면 안 탭은 폰에서 높이 44px, 제목은 title-sm' → 제목 기대만 title.
    - 모양
      - 'AC-007.1·AC-013.3: 화면 안 탭 — 같은 밑줄 모양(40px·body), 지금 탭 accent 700 + 3px 밑줄…' → AC-220.1.
      - 'AC-013.3: 표는 ui.table…, 표는 패널(흰 바탕·1px 선·6px) 안에 있다' → 패널 없이 위아래 선.
      - 'AC-013.3: 표 안 단추 — [승인] 주(small), [거절]·[되돌리기] 보조(small)' → [승인] `accentOutlineSmall`.
      - 'AC-013.3: 완료 줄은 table·ok 글자 + 체크 아이콘(꾸밈)' → small·positive.
      - 'AC-013.3: 그림자는 확인 창 하나에만, accent는 지금 탭(글자·밑줄)과 초점 고리에만' → accent에 [승인] 테두리를 더한다.
      - 'AC-007.1·AC-013.3: PC 표는 칸 폭을 정해 둔다(table-fixed)…' → 칸 폭 값만 AC-220.1.
    - 나머지 시험의 `ui.*` → `ds.*` 참조. 'AC-007.4: 승인 줄에는 동작 단추가 없고 "승인됨" 완료 칩만 있다'는 `ui.chip.done` → `ds.chip.positive` 참조만 바뀐다(칩은 남음, AC-220.1).
  - 승인·거절 확인 창·되돌리기·실패 카드·초점·빈 탭·읽기 기다림 시험과 `admin/page.test.tsx`는 그대로 통과해야 한다.

## Phase 6 — 마무리

## TASK-23: 옛 이름 정리·규칙 전체 검사
- REQ: REQ-221, REQ-203, REQ-204, REQ-202
- Files: src/app/globals.css, src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.ts, src/components/ui/classes.test.ts, src/components/common/LogoMark.tsx, src/comments.test.ts, docs/UI_GUIDE.md
- Tests: src/app/theme.test.ts, src/app/fonts.test.ts, src/components/ui/classes.test.ts, src/comments.test.ts
- TDD: required — 시험부터 고치고 RED를 본다.
  - **대시보드 두 폴더는 고치지 않고 남긴다**(2026-10-31, design.md '대시보드 본문 빼기'). `src/components/dashboard/*`·`src/app/(app)/dashboard/*`의 시험(`DashboardEmpty.test.tsx`·`todayTitle.test.ts`·`page.test.tsx`)이 한 글자도 고치지 않고 통과해야 한다. 그래서 아래를 지우지 않는다.
    - `ui`의 세 키 `card`·`panel`·`panelTitle`(값 그대로). `DashboardEmpty.tsx`가 `ui.card`·`ui.panelTitle`을, 그 시험이 `ui.panel`·`ui.card`·`ui.panelTitle`과 `rounded-card` 개수를 본다.
    - `globals.css` `@theme`의 별칭 넷: `--radius-card`, `--text-table`·`--text-panel`·`--text-title-sm`(각 `--line-height` 포함). 소스가 바로 `max-md:text-title-sm`·`text-table`을 쓰고, 세 키가 `rounded-card`·`text-panel`을 쓴다.
  - 새 시험:
    - `theme.test.ts`: AC-221.1(옛 클래스 이름이 `src/`에 없음 — 대시보드 두 폴더와 남는 `ui` 세 키 값은 빼고 본다, `@theme`·`:root` 옛 별칭은 위 넷만 남음).
    - `fonts.test.ts`: AC-203.3(굵기 400·500·600만, `tabular-nums`). 대시보드 두 폴더도 본다(지금 `font-semibold`뿐이라 통과).
    - `classes.test.ts`: AC-221.1(`export const ui`의 키가 `card`·`panel`·`panelTitle` 셋뿐, `ui.` 참조는 `classes.ts`와 대시보드 두 폴더에만, 쓰지 않는 `ds` 키 없음), AC-221.2(AC-204.6 검사 목록을 폴더 전체로 — 대시보드 두 폴더와 남는 `ui` 세 키 값은 빼고, 상자 겹침은 REQ-213~218·220 화면 전부 — 대시보드 없음).
    - `comments.test.ts`: AC-221.3(쓰는 크기 집합과 주석 목록이 같다).
  - 구현:
    - `globals.css`에서 별칭을 지운다. 위 넷은 남기고 주석을 "대시보드 빈 자리가 쓴다 — 다음 대시보드 명세에서 지움"으로 바꾼다.
    - `classes.ts`에서 옛 `ui`의 세 키 밖 키와 `ds`의 쓰지 않는 키를 지운다. 세 키 값은 바꾸지 않는다.
    - `LogoMark.tsx` 주석에서 옛 크기를 지운다(코드 그대로).
    - UI_GUIDE를 구현과 다시 맞춘다. 대시보드 빈 상태 설명(`## 빈 상태`의 `/dashboard` 줄들, 막힘 줄의 대시보드 단추, 휴대폰에서 빠지는 것의 대시보드 [파일 올리기])은 "다음 대시보드 명세에서 정한다. 지금 `/dashboard`는 옛 빈 자리 그대로"로 바꾼다.
  - 고치는 옛 시험
    - `classes.test.ts`: 옛 `ui`를 보는 describe 'AC-013.3'(모서리·그림자·강조색·단추·칩 색)과 'AC-013.4'의 `ui` 목록 시험 → 지운다(같은 내용은 `ds`의 AC-204.1~AC-204.5가 맡음). 파일 맨 위 `ui`로 만든 변수(`ALL`·`BUTTONS`·`CHIPS`)도 함께 지운다(그리기 준비). 'AC-013.2'는 그대로다(대시보드 두 폴더도 계속 본다).
    - `theme.test.ts`: TASK-3이 넣은 AC-202.1·AC-202.2 시험이 보는 옛 별칭 표(파일 맨 위 `LANDING_ALIASES`·`OLD_COLORS`·`OLD_RADII`·`OLD_TEXT`)를 남는 넷(`OLD_RADII`의 `card`, `OLD_TEXT`의 `table`·`panel`·`title-sm`)만 두게 줄인다(`LANDING_ALIASES`·`OLD_COLORS`는 빈다, 그리기 준비). 이름에 지운 별칭이 적힌 시험('… 옛 별칭 ok·ok-soft·danger·danger-soft·warn은 …'·'… 옛 card·chip은 control …')은 이름만 남는 별칭에 맞추고, 'AC-202.2: 실제 Tailwind로 돌리면 …'에서 지운 별칭 `text-ok`(클래스 목록과 `.text-ok` 기대 줄)를 뺀다. `rounded-card`·남는 글자 별칭 기대는 그대로다. 나머지 기대는 그대로다.
  - 대시보드 두 폴더 밖에서 지우는 별칭이나 `ui`를 아직 쓰는 화면이 있으면 고치지 말고 멈춰 보고한다(그 화면 TASK가 덜 된 것이다).

## TASK-24: 세 폭 화면 확인과 고치기
- REQ: REQ-222, REQ-201
- Files: src/components/landing/*.module.css, src/components/landing/*.tsx, src/components/auth/*.tsx, src/components/common/*.tsx, src/components/shell/*.tsx, src/components/admin/AdminApplications.tsx, src/components/charts/*.tsx, src/components/preview/*.tsx, src/components/ui/classes.ts, src/app/globals.css
- TDD: exempt — 화면 측정 작업이라 먼저 쓸 실패 시험이 없다. 새 로직을 만들지 않고 클래스·CSS 값만 맞춘다.
  - **서버.**
    - 저장소를 scratchpad로 `git archive`해서 `next dev -H 127.0.0.1`로 띄운다(`devIndicators` 끔).
    - Supabase 주소는 가짜 Supabase(`docs/mockups/b2b-redesign/tools/stub.mjs`, 127.0.0.1:54399), 열쇠는 가짜 값이다.
    - 가짜 세션 쿠키는 `tools/shoot.mjs`처럼 시험 스크립트가 넣는다. 앱 코드에 시험용 길을 만들지 않는다.
  - **찍기.**
    - `@playwright/test` 크로미움, 모션 줄이기, `trace` 끔.
    - AC-222.1의 화면 8개를 390×844·768×1024·1440×900에서 전체·첫 화면으로 찍는다.
    - 같은 폭의 시안(게시본, 1440·390)과 나란히 놓는다.
    - `/dashboard`는 앱 틀(위쪽 띠·탭 줄)만 시안과 견준다. 본문은 이 명세가 고치지 않은 옛 빈 자리("오늘 + 날짜" 제목·준비 중 상자)이고, 시안의 대시보드 본문과 다른 것은 고치지 않고 보고에 "다음 대시보드 명세"로 적는다(AC-222.2). 대시보드 두 폴더는 Files에 없다.
  - **측정(AC-222.1).** 가로 넘침, 글꼴 이름·`document.fonts.check`, 600px 내린 뒤 붙는 띠의 top, 랜딩 390 높이, 차트 눈금 글자 크기. 랜딩 메뉴 링크 4개를 눌러 섹션 제목이 메뉴에 가리지 않는지도 본다.
  - **고치기.** 어긋난 곳은 그 화면 파일 안에서 클래스·CSS 값만 고치고 `verify`를 다시 돌린다.
    - 시험 기대값을 바꿔야 하는 수정이면 고치지 말고 멈춰 보고한다.
    - 고친 점은 보고에 적는다.
  - **범위 확인(AC-201.1).** `git diff --name-only 6becd49 -- src/app/api src/app/auth src/lib src/workers src/types src/middleware.ts supabase src/components/dashboard 'src/app/(app)/dashboard' package.json package-lock.json eslint.config.mjs postcss.config.mjs next.config.ts vercel.json`이 비어 있는지 본다.
  - **정리(AC-222.3).** 서버·가짜 Supabase·브라우저를 모두 멈추고 `ss -ltnp`로 확인한다. 사진·스크립트는 scratchpad에만 둔다.
  - **끝 조건.** 세 폭 사진을 사용자에게 보이고, 운영 배포 여부를 묻는다(배포는 사용자 OK 뒤 따로).
