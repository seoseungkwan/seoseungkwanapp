# 요구사항: B2B 디자인 시스템 개편 (모든 화면, UI/UX만)

> 기능 ID: `b2b-redesign` · 형식: 요구사항은 `### REQ-201: 제목`, 수용 기준은 `- AC-201.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다. 화면 측정 AC(REQ-222)는 사진·측정 스크립트로 본다.
> 번호는 201부터다. 같은 시험 파일에 남는 옛 명세 시험(landing·auth의 AC-001~013, landing-v2의 AC-101~114)과 이름이 겹치지 않게 한다.

## 배경 / 목표
- 사용자 요청(2026-10-30): 앱 전체 화면을 전문 B2B SaaS 수준으로 다시 디자인한다(참고: Linear, Stripe 대시보드, 토스).
  1. "AI가 만든 템플릿" 느낌(같은 상자 반복, 큰 둥글기, 그라데이션)을 없앤다.
  2. 글자·간격·정렬·색을 한 벌의 디자인 규칙으로 맞춘다.
  3. 병원 관리자가 믿고 쓰는 데이터 분석 서비스처럼 보이게 한다.
  4. 대시보드와 통계 차트를 중심 그림으로 쓴다.
  5. PC와 휴대폰 모두 맞춘다.
  6. **기능·API·자료 처리 로직은 바꾸지 않는다(UI/UX만).**
- 사용자 결정(2026-10-30):
  - **대시보드는 이번에 디자인만 한다.** 다시 쓰는 차트 부품을 `src/components/charts`에 만들고 예시 자료로 시험한다. 랜딩 첫 화면은 그 부품으로 그린 미리보기를 "예시" 표시와 함께 보여 준다. 실제 `/dashboard`는 지어낸 숫자를 쓰지 않는다. 파일 올리기 연결은 다음 명세다. (본문의 새 빈 상태는 아래 2026-10-31 결정으로 이 명세에서 뺐다.)
  - **위쪽 가로 탭을 그대로 쓴다.** 탭 줄은 위쪽 띠와 함께 화면 위에 붙어 따라온다.
  - **글꼴은 Pretendard**(`next/font/local`, OFL 사용 허락 파일 함께 커밋). IBM Plex Sans KR은 뺀다. 숫자는 자릿수를 맞춘다.
  - **빈칸은 자연스러운 문구로**: `[금액]` → 예시 금액 + "예시" 표시, `[직원 A]` → "직원 1", `[지난달]`·`[이번 달]` → "9월"·"10월", `[서비스 이름]` → 숨긴다(이름이 정해질 때까지 로고 옆에는 병원 이름만), `[이메일 주소]` → 뺀다.
  - **로고는 C③ 그대로**(테두리 `#14C8BA`, 십자 `#6D5DF5`). 강조색 하나 규칙의 유일한 예외다.
  - 승인 대기·거절 화면의 [로그아웃]은 위쪽 줄 하나만 둔다(시안대로 승인).
- 사용자 결정(2026-10-31, 승인 뒤 명세 고침):
  - **대시보드 본문은 이 명세에서 뺀다.** 대시보드는 다음에 따로 명세를 써서 계획한다. 그래서 옛 REQ-219(대시보드 틀·빈 상태)와 TASK-21을 지웠다. 번호는 비워 두고 다시 쓰지 않는다. 뒤 번호(REQ-220~222, TASK-22~24)도 당기지 않는다(시험 이름·TDD 기록·커밋이 지금 번호를 쓴다).
    - `src/components/dashboard/*`와 `src/app/(app)/dashboard/*`는 이 명세에서 고치지 않는다. `/dashboard`는 새 앱 틀(REQ-218) 안에 지금의 빈 자리("오늘 + 날짜" 제목과 준비 중 상자, auth AC-009.1·AC-009.2)를 그대로 그린다. 바뀌는 것은 옛 이름 별칭을 거쳐 들어오는 새 토큰 값(글꼴·색·모서리·글자 크기)뿐이다.
    - 그 두 폴더가 아직 쓰는 옛 `ui` 키와 옛 Tailwind 별칭은 TASK-23에서 남기고, 규칙 전체 검사에서 두 폴더를 뺀다(REQ-221).
    - 앱 틀(REQ-218)과 차트 부품(REQ-205)·미리보기(REQ-206)는 그대로 둔다. 차트 부품은 다음 대시보드 명세가 다시 쓴다.
  - 랜딩 `base.module.css`의 `.btnSm`은 랜딩 TSX에서 쓰는 곳이 없어도 남긴다(AC-212.4 예외).
  - 앱 탭 줄의 첫 탭 맞춤은 줄 한 곳의 `[&>:first-child]:-ml-3`으로 모든 폭에서 한다(TASK-20에서 만든 대로, AC-218.2·design.md).
- 기준 시안: `docs/mockups/b2b-redesign/`(게시본 https://claude.ai/artifact/574fyw1mAQmqBw4jWjhr6f, 2026-10-30 사용자가 "진행해"로 승인). 화면 마크업·CSS 값은 시안의 `screens.mjs`·`parts.mjs`·`style.css`를 따른다. 시안과 이 명세가 다르면 이 명세가 이긴다(design.md '시안과 다른 점').
- 문구는 지금 컴포넌트 문구를 그대로 쓴다. 바뀌는 문구는 이 명세 AC에 적힌 것(빈칸 바꾸기, 줄바꿈 태그 빼기, 사라지는 영역의 문구, 새 빈 상태 문구)뿐이다.
- 이 명세가 대체하는 옛 기준. 옛 명세 파일(`specs/landing/`·`specs/auth/`·`specs/landing-v2/`)은 고치지 않는다(승인 기록이 깨지지 않게). 대신 UI_GUIDE·ADR-019에 "b2b-redesign이 대체"라고 적는다.
  - landing-v2: REQ-102·REQ-105~REQ-113의 모양 값 전부(CSS 값, 섹션 짜임, 약속 띠, 히어로 미리보기), 시안 `docs/mockups/landing-v2/`의 모양
  - landing: AC-001.1(섹션 8개·약속 띠·`#start`), AC-001.3(h1 줄바꿈), AC-002.1의 "시작하기 섹션" 위치, AC-003.1~AC-004.2(히어로 숫자 2.6초 순환), AC-005.1 중 사라지는 문구, AC-005.2(빈칸)
  - auth: AC-003.1의 로그인 소개(SIGN IN·칩·두 줄 제목·카드), AC-005.1·AC-005.3의 본문 [로그아웃]과 문의 빈칸, AC-008.x·AC-013.x의 모양 값(높이·색·모서리·굵기. 대시보드 빈 자리는 빼고)
  - 그대로 유효한 것: landing-v2의 AC-103(로고 모양·색, 크기만 바뀜)·AC-104(그림 없음)·AC-114(F/U 문구), landing의 AC-007.1(랜딩은 아무것도 받지 않음)·AC-008.1(svg는 꾸밈), auth의 AC-009.1·AC-009.2(대시보드 제목 "오늘 + 날짜"와 준비 중 상자, 그 시험이 보는 클래스 — 다음 대시보드 명세가 바꿀 때까지), 모든 동작 AC

## 요구사항

### REQ-201: 바뀌지 않는 것 (기능·자료·패키지)
- AC-201.1: Given 이 기능의 커밋, When 기준 커밋 `6becd49`(feat-landing-v2 끝)과 `git diff --name-only 6becd49 -- <경로>`로 비교하면, Then 아래 경로에 바뀐 파일이 없다.
  - `src/app/api/` · `src/app/auth/` · `src/lib/` · `src/workers/` · `src/types/` · `src/middleware.ts` · `supabase/`
  - 대시보드 두 폴더 `src/components/dashboard/` · `src/app/(app)/dashboard/`(2026-10-31 결정, 다음 대시보드 명세 몫)
  - `package.json` · `package-lock.json`(새 npm 패키지 없음) · `eslint.config.mjs` · `postcss.config.mjs` · `next.config.ts` · `vercel.json`
  - 페이지 파일(`src/app/**/page.tsx`·`layout.tsx`)은 그리는 JSX(틀 컴포넌트와 그 props)와 그에 필요한 import만 바뀐다. `guardPage` 호출·`redirect`·`export const dynamic` 줄은 그대로다. 예외: 뿌리 `src/app/layout.tsx`는 글꼴 불러오기 코드도 바뀐다(REQ-203).
- AC-201.2: Given 아래 시험 파일, When 전체 시험을 돌리면, Then 한 글자도 고치지 않고 통과한다.
  - `src/lib/**` · `src/workers/**` · `src/app/auth/**` · `supabase/**` · `fixtures/**` · `e2e/**`
  - `src/middleware.test.ts` · `src/guardrails.test.ts` · `src/vercel-config.test.ts` · `src/app/globals.test.ts`
  - `src/app/(app)/layout.test.tsx` · `src/app/(app)/admin/page.test.tsx`
  - `src/components/dashboard/**` · `src/app/(app)/dashboard/**`(`DashboardEmpty.test.tsx`·`todayTitle.test.ts`·`page.test.tsx`)
  - `src/components/admin/applications.test.ts` · `src/components/auth/SignOutButton.test.tsx` · `src/components/shell/IdleLogout.test.tsx` · `src/components/shell/kstNow.test.ts`
- AC-201.3: Given 이 명세가 고치는 시험 파일, When 바뀐 줄을 보면, Then 지우거나 기대값을 고친 시험은 그 TASK의 "고치는 옛 시험" 목록에 이름이 있는 것뿐이다. 파일 맨 위 그리기 준비(import·그려 둔 변수·짜임 정규식)와 `ui.*` → `ds.*` 참조 바꾸기도 그 목록의 한 항목으로 적는다. 나머지 시험은 이름·본문이 그대로이고 통과한다. 아래 동작 시험은 기대값을 바꾸지 않는다.
  - 로그인: 구글 시작·두 번 막기·뒤로 가기로 다시 풀기·오류 카드·앱 안 브라우저 안내·주소 복사
  - 가입 신청: 값 검사·보내기·두 번 막기·저장 실패 카드·[다른 계정으로 로그인]
  - 승인 대기·거절: [상태 다시 확인]·[다른 계정으로 로그인]·위쪽 [로그아웃]·받은 값은 글자로만
  - 앱 틀: 탭 링크와 지금 탭·준비 중 툴팁(Esc·올림·초점·누름)·탭 띠 밀기·계정 메뉴 열고 닫기·[로그아웃]·한국 시각
  - 관리자: 목록 읽기·탭 키보드·승인·거절 확인 창(초점 가두기)·되돌리기·실패 카드·초점 돌려주기
  - 오류 화면: [다시 시도]·[로그아웃]·오류 내용 숨김
- AC-201.4: Given 각 Phase 끝, When `python3 ~/.claude/harness/bin/verify`를 돌리면, Then `npm test`·`npm run lint`(경고 0)·`npm run build`가 모두 통과한다.

### REQ-202: 디자인 토큰 한 곳 (`globals.css`)
- AC-202.1: Given `src/app/globals.css` layer 밖의 `:root`, When 변수를 읽으면, Then 디자인 토큰이 아래 값으로 한 번씩 있다(16진수는 대소문자 무시).
  - 바탕·선·글자: `--canvas: #F7F8FA` · `--surface: #FFFFFF` · `--line: #E5E7EB` · `--line-strong: #D1D5DB` · `--faint: #9CA3AF` · `--muted: #6B7280` · `--ink-2: #374151` · `--ink: #111827`
  - 강조: `--accent: #2563EB` · `--accent-strong: #1D4ED8` · `--accent-soft: #EAF1FE`
  - 상태: `--positive: #15803D` · `--positive-soft: #ECF7EF` · `--negative: #C2410C` · `--negative-soft: #FDF0EA` · `--warning: #B45309` · `--warning-soft: #FDF4E3`
  - 차트: 크기(파랑 줄) `--chart-1: #DBE7FD` · `--chart-2: #B4CDFA` · `--chart-3: #8DB0F4` · `--chart-4: #2563EB` · `--chart-5: #1D4ED8`, 지난 기간 `--chart-prev: #9CA3AF`, 항목 구분 `--cat-1: #2563EB` · `--cat-2: #0F766E` · `--cat-3: #B45309` · `--cat-4: #6D28D9` · `--cat-5: #6B7280`
  - 글자 크기/줄 높이(`--fs-<단계>`/`--lh-<단계>`): caption 12/16 · small 13/20 · body 14/22 · lead 16/24 · subtitle 16/24 · title 20/28 · heading-m 24/32 · heading 28/36 · metric 28/36 · display-m 32/40 · display 48/56. 자간 `--ls-heading: -0.01em` · `--ls-display: -0.02em`
  - 모서리 `--r-control: 4px` · `--r-float: 8px`. 그림자 `--elev-float: 0 1px 2px rgb(17 24 39 / 0.06), 0 6px 16px rgb(17 24 39 / 0.1)`
  - 틀 `--w-landing: 1200px` · `--w-app: 1280px` · `--gutter: 24px` · `--gutter-m: 16px`
  - 글꼴 `--font-ui: var(--font-pretendard), 'Apple SD Gothic Neo', 'Malgun Gothic', system-ui, sans-serif`
  - 옮기는 동안만 design.md '옛 이름 별칭' 표의 별칭을 더 둔다. 별칭 값은 위 토큰의 `var()`뿐이다.
- AC-202.2: Given `@theme inline`, When 읽으면, Then Tailwind 이름은 위 토큰을 `var(--…)`로만 가리킨다. 16진수 색·px·em 값을 직접 쓰지 않는다.
  - `--color-*: initial` · `--radius-*: initial` · `--shadow-*: initial` · `--text-*: initial` 뒤에 토큰 이름만 둔다.
  - 색: 위 색 토큰과 같은 이름(`--color-ink: var(--ink)` …, 차트 색 포함). 모서리: `--radius-control`·`--radius-float`. 그림자: `--shadow-float`.
  - 글자 11단계: `--text-<단계>` + `--text-<단계>--line-height`. heading·heading-m·metric은 `--letter-spacing: var(--ls-heading)`, display·display-m은 `var(--ls-display)`.
  - `--font-sans: var(--font-ui)`.
  - Tailwind 불러오기(theme·utilities만, Preflight 없음, `src/`만 훑고 시험 파일 제외)와 `@layer base`의 `.app-ui` 초기화는 그대로다.
- AC-202.3: Given 시험 파일 밖 `src/`의 `*.css`·`*.ts`·`*.tsx`, When 색 글자를 찾으면, Then 아래와 같다.
  - 16진수 색(`#` + 3·4·6·8자리)은 `globals.css`의 `:root` 토큰 블록, `src/components/common/LogoMark.tsx`(로고 두 색), `src/components/common/GoogleMark.tsx`(구글 상표 네 색)에만 있다.
  - `rgb(`·`hsl(`·`color-mix(`도 `:root` 토큰 블록 밖에는 없다.
  - 옮기는 동안의 예외(지금 구글 마크가 들어 있는 `LoginCard.tsx`)는 TASK-16에서 없어진다.
- AC-202.4: Given `globals.css`, When 읽으면, Then 그라데이션(`gradient(`)·`backdrop-filter`·`blur(`가 없고, 그림자 값은 `--elev-float` 하나뿐이다. 모션 줄이기 전역 규칙과 `body`의 `overflow-x: clip`·`word-break: keep-all`은 그대로다. `body` 글꼴은 `var(--font-ui)`다.

### REQ-203: 글꼴 Pretendard
- AC-203.1: Given `src/app/fonts/`, When 파일을 보면, Then 아래 네 파일만 있고 sha256이 같다. 글꼴 세 파일은 npm `pretendard@1.3.9` 꾸러미의 `dist/web/static/woff2-subset/` 파일을 고치지 않은 것이고, 셋의 합은 810,000바이트 이하다(지금 804,172바이트).
  - `Pretendard-Regular.subset.woff2` — `01dd73155fdfab7ce9b25224523e85a96927e21aef97f21957d41f1bfa7e3878`
  - `Pretendard-Medium.subset.woff2` — `6f4e897a59138903ae64e814df059790cf0e0ff73b8595810145aee23204469f`
  - `Pretendard-SemiBold.subset.woff2` — `4247dc5e260b92640c2cbd0e75091154647b71e1d5884116655e2903468c54cc`
  - `OFL.txt` — 같은 꾸러미의 `dist/LICENSE.txt`(SIL Open Font License 1.1, Reserved Font Name Pretendard) — `b04538c9abec39a3db75108cf0af0fd9c77032fe8aa2cf38345b4d250e98e38e`
- AC-203.2: Given `src/app/layout.tsx`, When 읽으면, Then 아래와 같다.
  - `next/font/local`의 `localFont`를 한 번 부른다. `src`는 위 세 파일(weight `'400'`·`'500'`·`'600'`, style `'normal'`)이다.
  - `display: 'swap'`, `variable: '--font-pretendard'`. `<html lang="ko">`에 그 변수 class가 붙는다.
  - 시험 파일 밖 `src/`에 `next/font/google`·`IBM_Plex`·`Space_Grotesk`·`--font-plex`·`--font-num`·`--font-grotesk`가 없다.
  - 운영 빌드(`npm run build`) 뒤 `.next/static/media`의 글꼴(`*.woff2`)은 세 개이고 합이 810,000바이트 이하다. CSP의 `font-src 'self'`는 그대로다.
- AC-203.3: Given 글꼴 굵기, When 시험 파일 밖 `src/`를 보면, Then 400·500·600만 쓴다.
  - TSX에 `font-bold`·`font-extrabold`·`font-black`·`font-light`·`font-extralight`·`font-thin`이 없다.
  - CSS에 `font-weight`가 400·500·600 밖의 값(`700`·`bold`·`300` 등)이 없다.
  - `.app-ui`와 랜딩 뿌리(`base.module.css`의 `.root`)는 `font-variant-numeric: tabular-nums`다.

### REQ-204: 앱 공통 모양 (`components/ui/classes.ts`의 새 묶음 `ds`)
- 새 모양은 같은 파일에 새 이름 `ds`로 둔다. 지금의 `ui` 묶음은 한 글자도 바꾸지 않고 두었다가, 화면마다 그 화면 TASK에서 `ui.*`를 `ds.*`로 바꾸고, TASK-23에서 `ui`를 지운다. 다만 이 명세가 고치지 않는 대시보드 빈 자리가 쓰는 세 키(`card`·`panel`·`panelTitle`)는 남긴다(design.md '공통 모양 옮기기'·'대시보드 본문 빼기'). 그래서 Phase 1이 아직 안 고친 화면의 시험을 깨지 않는다.
- AC-204.1: Given `ds.button`, When 클래스를 읽으면, Then 아래와 같다.
  - 크기: 기본 36px·좌우 16px·body / `…Small` 32px·좌우 12px·small / `…Large` 44px·좌우 20px·body 600. 휴대폰(768px 미만)에서는 모두 44px(`max-md:h-11`).
  - 종류:
    - 주(`primary`·`primarySmall`·`primaryLarge`): `bg-accent`·`text-surface` → 올림 `bg-accent-strong`
    - 보조(`secondary`·`secondarySmall`): `bg-surface`·1px `border-line-strong`·`text-ink` → 올림 `bg-canvas`
    - 강조 테두리(`accentOutlineSmall`): `bg-surface`·1px `border-accent`·`text-accent`·600 → 올림 `bg-accent-soft`
    - 글자만(`ghostSmall`): 테두리 투명·`text-ink-2`·좌우 8px → 올림 `bg-canvas`
    - 위험(`danger`): 보조 모양 + `text-negative`
    - 구글(`googleLarge`): 보조 모양 + 44px + 가운데 정렬 + 사이 8px + 600
  - 모두 `rounded-control`·500(Large·강조 테두리는 600)·줄바꿈 없음·같은 초점 고리(2px accent, 2px 띄움)·막힘 40% 흐림 + not-allowed. 그림자가 없다.
  - 글자 단추 `ds.textButton`: 바탕 없음·accent·body 500 → 올림 밑줄, 휴대폰 44px 높이.
  - 입력 오류 테두리는 `aria-invalid:border-negative`다(옛 `border-danger` 아님).
- AC-204.2: Given `ds.chip`, When 읽으면, Then 칩은 모두 20px(`h-5`)·좌우 6px·caption 500·`rounded-control`·1px 테두리·사이 4px다. 종류: `neutral`(canvas·line·ink-2) · `accent`(accent-soft·투명·accent-strong) · `positive`(positive-soft·투명·positive) · `negative`(negative-soft·투명·negative) · `warning`(warning-soft·투명·warning).
- AC-204.3: Given 입력 모양, When 읽으면, Then 아래와 같다.
  - `ds.input`: 44px(모든 폭)·좌우 12px·surface·1px line-strong·body(휴대폰 16px `text-lead`)·`rounded-control` → 올림 muted 테두리, 초점 accent 테두리 + 1px accent 고리, `aria-invalid` 테두리 negative.
  - `ds.readonly`: 44px 이상·canvas·1px line·ink-2, 안쪽 초점이면 accent 테두리(`focus-within:border-accent`) + 1px accent 고리. `ds.label`: small 600 ink. 필수·선택 표시 `ds.labelHint`: caption 400 muted. `ds.help`: caption muted. `ds.fieldError`: caption 500 negative.
  - `ds.checkbox`: 16px·`rounded-control`·1px line-strong → 체크하면 accent 바탕 + 흰 체크.
- AC-204.4: Given `ds.table`, When 읽으면, Then 머리 칸 40px·small 500 muted·아래 1px line, 몸 칸 44px·small ink·아래 1px line, 마지막 줄 아래 선 없음, 숫자 칸 오른쪽 정렬, 첫 칸 왼쪽·끝 칸 오른쪽 20px(패널 안쪽과 맞춤), 칸 좌우 12px다. 줄무늬·모서리·바깥 테두리가 없고 줄 올림은 canvas다.
- AC-204.5: Given 패널·층, When 읽으면, Then 아래와 같다.
  - `ds.panel`: surface·1px line·`rounded-control`·그림자 없음. `ds.panelHead`: 좌우 20px·위 16px(휴대폰 16·12), 제목 `ds.panelTitle` subtitle 600 ink, 보조 글 small muted. `ds.panelBody`: 좌우 20px·위 16px·아래 20px(휴대폰 16·8·16).
  - `ds.layer`(떠 있는 층: 계정 메뉴·확인 창): surface·1px line·`rounded-float`·`shadow-float`. 그림자는 층과 툴팁에만 있다.
- AC-204.6: Given `ds`의 클래스 글자와 검사 목록의 앱 화면 소스(TASK마다 늘고 TASK-23에서 앱 화면 폴더 전체 + `components/charts`·`components/preview`. 대시보드 두 폴더 `src/components/dashboard`·`src/app/(app)/dashboard`는 끝까지 빼고 본다. 옛 `ui` 묶음은 지울 때까지, TASK-23 뒤에 남는 세 키도 빼고 본다), When 클래스 글자를 보면, Then 아래와 같다.
  - 여백·간격 클래스(`p`·`px`·`py`·`pt`·`pr`·`pb`·`pl`·`m*`·`gap*`·`space-*`)의 값은 단계 `0`·`0.5`·`1`·`1.5`·`2`·`3`·`4`·`5`·`6`·`8`·`12`·`16`·`24`(= 0·2·4·6·8·12·16·20·24·32·48·64·96px)와 `px`뿐이다. 대괄호 임의 값이 없다.
  - 모서리는 `rounded-control`·`rounded-float`·`rounded-none`, 그림자는 `shadow-float`, 글자 크기는 토큰 11단계뿐이다.
  - 그라데이션(`bg-linear-*`·`bg-radial-*`·`bg-conic-*`·`bg-gradient-*`·`from-*`·`via-*`·`to-*`)·`backdrop-*`·`blur*`·`animate-*`가 없다. 화면 폭 접두사는 `md:`·`lg:`·`max-md:`·`max-lg:`뿐이다.
  - 넘침 자르기는 `overflow-clip`이다. 접두사 없는 `overflow-hidden` 클래스는 쓰지 않는다(`theme.test.ts`가 "시험 글자에만 있는 클래스는 만들지 않는다"를 이 이름으로 본다). `after:overflow-hidden`처럼 변형이 붙은 것은 된다(TabBar·관리자가 씀).
  - CSS Module import·임의 색·Tailwind 기본 색 이름이 없다(지금 검사 그대로).
- AC-204.7: Given 앱 화면을 그린 마크업, When 상자(`aria-hidden` 밖의 `div`·`section`·`article`·`ul`·`ol`·`li`·`dl`·`table`·`aside`·`form` 가운데 클래스 목록에 네 변 테두리 `border` 낱말이 있는 것. 입력란·단추·칩처럼 조작 요소 그림이고 `aria-hidden`인 것은 들지 않는다)를 보면, Then 상자 안에 상자가 없다. 검사 화면은 TASK마다 늘어 TASK-23에서 로그인(일반·앱 안 브라우저·오류)·가입 신청·승인 대기·거절·오류 화면·관리자(세 탭·확인 창)가 모두 들어간다. 대시보드 본문은 이 명세가 고치지 않으므로 들지 않는다.

### REQ-205: 차트 부품 (`components/charts`)
- AC-205.1: Given `format.ts`, When 부르면, Then 아래와 같다(버림은 부동소수 오차를 막으려고 아주 작은 값을 더한 뒤 자른다. 반올림하지 않는다).
  - `formatCount(714)` = `'714'`, `formatCount(12000000)` = `'12,000,000'`.
  - `formatRate(0.18347)` = `'18.3'`, `formatRate(0.29)` = `'29.0'`, `formatRate(1)` = `'100.0'`(0~1 → %, 소수 첫째 자리까지 버림).
  - `formatDelta(delta, unit)`은 `{ dir, text, srText }`를 돌려준다.
    - `change`·diff > 0: `dir 'up'`, `srText '늘어남'`, `text '17명 (+2.4%)'`(pct 2.439). diff < 0: `dir 'down'`, `srText '줄어듦'`, `text '12명 (−2.1%)'`(빼기 기호는 U+2212). pct가 null이면 괄호 부분이 없다.
    - `change`·diff = 0: `dir 'flat'`, `text '변화 없음'`.
    - `new` → `'새로 생김'`, `in-progress` → `'집계 중'`, `unavailable` → `'비교할 수 없음'`(모두 `dir 'none'`).
    - unit `'%p'`면 diff는 0~1 비율 차이다: diff 0.0027 → `'0.2%p'`, pct는 쓰지 않는다.
- AC-205.2: Given `<Sparkline values={[1, 3, 2]} />`, When 그리면, Then `aria-hidden="true"`인 88×28 svg(`size="sm"`은 56×22) 하나다.
  - 안에는 면 `path`(`fill-accent-soft`) → 선 `polyline`(`stroke-accent`·1.5·채움 없음) → 끝점 `circle`(r 2.75·`fill-accent`·`stroke-surface` 1.5)이 이 순서로 있다.
  - 점은 x = 3 + i·(w − 6)/(n − 1), y = h − 3 − (v − 최소)/(최대 − 최소)·(h − 6)이고 `Number(v.toFixed(1))`로 적는다(그리는 위치라 버림 규칙과 상관없다). [1, 3, 2]는 `3,25 44,3 85,14`다. 값이 모두 같으면 가운데 가로줄이다.
  - 값이 2개 미만이면 아무것도 그리지 않는다.
- AC-205.3: Given `KpiStat`, When 그리면, Then 아래와 같다.
  - 짜임: 이름(small muted) + 오른쪽 `Sparkline`(있을 때) → 값(metric 28/36 600, `size="sm"`은 heading-m 24/32 600, 고정폭 숫자) + 단위(body 500 muted) → 증감 줄.
  - 증감 줄: 위 화살표(`up`, positive) 또는 아래 화살표(`down`, negative) svg(aria-hidden) + 화면 읽기 전용 `srText` + `text`, 이어서 비교 이름(`compareLabel`, 예 "그 전 주 대비", muted, 기본 크기에서만). `flat`·`none`은 화살표 없이 muted다.
  - `format: 'percent'`면 값은 `formatRate`, `'count'`면 `formatCount`다.
  - 값이 null이면 값 자리에 "–"(faint)와 "자료 없음"(small muted)만 있고 Sparkline·증감 줄이 없다.
  - `sparkOnPhone={false}`면 Sparkline 감싸개가 768px 미만에서 숨는다.
- AC-205.4: Given `<StackedBarChart>`에 예시 8주(마지막 주 `in-progress`, 합계 최대 714명), When 그리면, Then 아래와 같다.
  - 눈금(`niceScale`): 간격 = 최대 합계/4 이상인 가장 작은 {1, 2, 2.5, 5}×10ⁿ(1 이상), 최대 = 간격×4다(714 → 간격 200, 최대 800). 기본은 0·200·400·600·800 다섯 줄, `compact`는 그 가운데 0·400·800 세 줄. 합계가 모두 0이면 0 한 줄이다.
  - 그림(`aria-hidden="true"`): 가로 눈금선만 있고(맨 아래 0 선은 line-strong, 나머지 line), 세로 선·바깥 테두리가 없다. 위 왼쪽에 단위 "(명)", 왼쪽에 눈금 글자, 막대 아래 기간 글자가 있고 모두 caption muted·고정폭 숫자다.
  - 막대: `complete`는 계열을 쌓는다. 첫 계열이 맨 위이고 계열 사이는 2px 띄운다. 높이는 합계/최대 %다(`style="height:N%"`). 막대 폭은 칸의 반, 최대 40px(`compact` 20px)이다.
  - `in-progress`·`partial` 칸은 한 막대로 그리고 빗금(accent 1px 선, 4px 간격 45°. 막대를 꽉 채운 viewBox 없는 `<svg aria-hidden>` 안의 `<path stroke="currentColor">` 하나로 그리고 svg 밖은 잘린다. 선은 `M0 k L k 0`을 k = 4, 8, …, 440까지 이어 폭 40px·높이 400px 막대까지 빈틈없이 덮는다(그림 칸 높이는 400px을 넘지 않는다). svg 크기는 클래스(`absolute inset-0 size-full`)로 주고 style을 쓰지 않는다. `<pattern>`·`url(#…)`·`id`를 쓰지 않는다 — AC-205.8의 `currentColor`·`none` 규칙)과 1px accent 테두리를 쓴다. 기본 크기에서는 값 위에 "집계 중"(in-progress) 또는 "일부 기간"(partial)이 붙는다.
  - 막대 위에 합계 글자(caption ink-2, 고정폭)가 있다. 마지막 `complete` 칸만 600 ink다. 기본 크기에서 `note`가 있으면 기간 글자 아래 한 줄 더 나온다(muted).
  - 화면 읽기용 표(`sr-only`): caption "<제목> (<단위>)", 머리 "기간 · <계열 이름들> · 합계 · 상태", 줄마다 `rangeLabel` · 계열 값 · 합계 · "완료"/"집계 중"/"일부 기간".
  - inline style은 `height`·`bottom`의 % 값(0~100, `Number(v.toFixed(2))`)뿐이다.
- AC-205.5: Given `ChartLegend`, When 그리면, Then `<ul>` 안에 항목마다 10×10 색 표시(aria-hidden: accent 면 · chart-3 면 · 빗금(패턴 없이 선 세 개를 그린 svg) · 지난 기간 세로 막대 2×12 faint) + 이름(small ink-2)이 있고 항목 사이는 16px다.
- AC-205.6: Given `<RankedBars>`에 동네 7개(`rest` 2개 포함), When 그리면, Then `<ol aria-label="<제목>">` 안에 `<li>`가 이 순서로 있다: `rest` 아닌 항목이 값 큰 순(같으면 받은 순서), 그 뒤 `rest` 항목이 받은 순서.
  - 줄마다 이름(small ink-2, `rest`는 muted) · 막대(aria-hidden, 높이 10px, `rest` 아닌 항목 accent·`rest` line-strong, 폭 = 값/`rest` 아닌 최대 값 %) · 값 "168명"(small 600 ink, 고정폭) · `showShare`면 몫 "23.5%"(전체 합 대비, 소수 첫째 자리까지 버림, small muted).
  - 최대 값이 0이면 막대 폭은 모두 0%다. inline style은 막대 `width` % 하나뿐이다(`Number(v.toFixed(2))`).
- AC-205.7: Given `<InlineBar current={86} previous={74} max={402} />`, When 그리면, Then aria-hidden 감싸개(폭 140px·높이 12px) 안에 이번 막대(accent, 높이 8px, 위 2px, 폭 21.39%)와 지난 기간 눈금(faint, 2×12px, `left` 18.41%, 가운데 맞춤)이 있다(% 값은 `Number(v.toFixed(2))`).
  - 값은 0~max로 자른다. `previous`가 null이면 눈금이 없다. max가 0 이하이면 막대·눈금이 없다.
- AC-205.8: Given `src/components/charts/` 소스, When 읽으면, Then 아래와 같다.
  - `'use client'`·React 훅·타이머(`setInterval`·`setTimeout`·`requestAnimationFrame`)·`animate-*`·`transition*` 클래스가 없다(서버에서 그대로 그린다, 움직임 없음).
  - 색은 토큰 클래스(`fill-*`·`stroke-*`·`bg-*`·`text-*`·`border-*`)로만 쓰고 16진수 색이 없다. svg의 `fill`·`stroke` 속성 값은 `currentColor`·`none`뿐이다(랜딩 page.test의 "로고 밖 svg는 currentColor나 none" 시험이 미리보기에도 닿는다). `role="img"`가 없고 모든 `<svg>`가 `aria-hidden="true"`다.
  - 폴더 밖에서 불러오는 것은 `react` 타입과 `@/types/analysis`의 타입뿐이다(폴더 안 파일끼리는 불러도 된다). 새 npm 패키지가 없다.

### REQ-206: 대시보드 미리보기 (`components/preview`, 예시)
- AC-206.1: Given `src/components/preview/sample.ts`, When 읽으면, Then 예시 자료가 시안 `parts.mjs`의 `WEEKS`와 같다.
  - 8주: 키 `9.7`·`9.14`·`9.21`·`9.28`·`10.5`·`10.12`·`10.19`·`10.26`. 신환 112·118·92·121·109·126·131·98, 재진 524·538·431·556·521·571·583·452. 마지막 주만 `in-progress`. 메모 "추석 연휴"(9.21)·"한글날"(10.5).
  - KPI 4개는 마지막 완료 주(10.19)와 그 전 주(10.12)에서 나온 값이다: 환자 수 714명(+17명, pct 17/697×100) · 신환 131명(+5명, pct 5/126×100) · 재진 583명(+12명, pct 12/571×100) · 신환율 131/714(+(131/714 − 126/697) %p). Sparkline은 완료된 7주 값이다.
  - 병원 이름 "예시정형외과의원", 탭 6개 "대시보드 · 통계 · AI 리포트 · 매출 · 재고 · 급여".
- AC-206.2: Given `<DashboardPreview />`, When 그리면, Then 상자(surface·1px line·`rounded-control`·`overflow-clip`) 하나 안이 이 순서다.
  - 위 줄(44px·아래 1px line): `LogoMark` 18 + "예시정형외과의원"(small 600) · 오른쪽 `ds.chip.accent` "예시 숫자".
  - 탭 줄(36px·아래 1px line, small 500, 사이 20px): `<span>` 6개. 첫째만 ink 600 + 아래 2px accent, 나머지 faint. 5·6번째는 768px 미만에서 숨는다.
  - KPI 줄(아래 1px line): `KpiStat size="sm"` 4개(`sparkOnPhone={false}`). 768px 이상 4칸, 미만 2×2. 칸 사이는 왼쪽 1px line(2×2의 아래 줄은 위 1px line).
  - 차트(좌우 16px·위 12px·아래 16px): 제목 "주별 환자 수"(small 600) + 오른쪽 `ChartLegend`(신환 · 재진 · 집계 중) → `StackedBarChart compact`(제목 "주별 환자 수 (예시)").
- AC-206.3: Given 미리보기 마크업, When 보면, Then `a`·`button`·`input`·`select`·`textarea`·`label`·`form`·`header`·`nav`·`main`·`section`·`footer`·`tabindex`가 없다. `'use client'`·타이머가 없다. 숫자는 위 줄의 "예시 숫자" 칩과 함께 보인다. 랜딩 히어로와 로그인 오른쪽이 이 한 컴포넌트를 같이 쓴다.

### REQ-207: 랜딩 위쪽 메뉴·바닥글
- AC-207.1: Given `SiteHeader`, When 그리면, Then `<header>` > `.wrap` 안이 이 순서다: 로고 링크 `<a href="#top">`(LogoMark 24 + 화면 읽기 전용 "맨 위로", 보이는 글자 없음) · `<nav aria-label="주요 메뉴">`(AI 분석 `#ai` · 기능 `#features` · 개인정보 보호 `#privacy` · 시작 방법 `#how`) · `<a href="/login">구글로 시작하기</a>`(글자만).
  - `[서비스 이름]`·`button`·`input`·`tabindex`가 없고 svg는 로고 하나다.
- AC-207.2: Given `SiteHeader.module.css`, When 읽으면, Then 모든 폭에서 한 줄이다.
  - 높이 56px(768px 미만) → 64px. 위에 붙어 따라오고(sticky, top 0) surface 바탕·아래 1px line이다.
  - nav는 768px 미만에서 숨고, 이상에서 링크 body 500 ink-2·사이 24px다.
  - [구글로 시작하기]는 주 단추다. 768px 미만 32px(누름 영역 44px 이상) → 이상 36px.
  - 로고 초점 고리는 안쪽(`outline-offset: -2px`)이다.
  - 섹션(`base.module.css`의 `.sec`)의 `scroll-margin-top`은 72px(768px 미만) → 80px라 메뉴 링크로 옮겨도 제목이 메뉴에 가리지 않는다.
- AC-207.3: Given `SiteFooter`, When 그리고 CSS를 읽으면, Then `<footer>`(위 1px line, 위아래 24px) > `.wrap` 안이 왼쪽 LogoMark 18 + "통증 의원 관리자를 위한 AI 업무 도구"(caption muted) · 오른쪽 "© 2026"(caption muted)이다. 링크·`[서비스 이름]`·`[이메일 주소]`가 없고 svg는 로고 하나다.

### REQ-208: 랜딩 히어로 (숫자 순환 없음)
- AC-208.1: Given `Hero`, When 그리면, Then `section#top` > `.wrap` > `.grid` 안이 글 덩어리 → 미리보기 순서다.
  - 글 덩어리: 소개 `<p>` "통증 의원 관리자를 위한 AI 업무 도구"(small 600 ink-2) → `<h1>` "숫자로 보는 우리 의원"(태그 없는 글자 하나, `text-wrap: balance`) → 안내 `<p>`(지금 문구, 태그 없음) → 단추 줄 → 약속.
  - 단추 줄: [구글로 시작하기](`/login`, 주·44px, 768px 미만 전체 폭) · [AI 분석 보기](`#ai`, 보조·44px, 768px 미만 숨김).
  - 약속(768px 이상): `<ul>` 안 `<li>` 3개, 위아래 1px line으로 나뉜다. 순서와 문구: 방패 + "환자 개인정보 서버 전송 0건"("0건"은 600 ink) · 모니터 + "환자 파일은 브라우저 안에서만 계산" · 합계 기호 + "AI에는 합계 숫자만". 아이콘은 16px svg(`currentColor`, muted).
  - 휴대폰 한 줄(768px 미만만): 방패 14px + "환자 개인정보는 병원 PC 밖으로 나가지 않습니다"(small muted).
  - 미리보기: `.shot` 안에 `<DashboardPreview />` 하나.
- AC-208.2: Given `Hero.module.css`, When 읽으면, Then 칸이 아래와 같다.
  - 1024px 이상: 12칸에서 글 1~5칸 · 미리보기 6~12칸, 세로 가운데 맞춤. 미만: 위아래로 쌓인다(글 → 미리보기).
  - 위아래 여백 32/48(768px 미만) → 48/64(768) → 64/96(1024).
  - 제목은 display-m(768px 미만) → display. 장식(격자·원형 빛·반짝이)이 없다.
- AC-208.3: Given 저장소, When 보면, Then 숫자 순환이 없다.
  - `src/components/landing/heroFrames.ts`·`heroFrames.test.ts`·`HeroChart.tsx`·`HeroChart.module.css`·`HeroChart.test.tsx`·`PromiseBand.tsx`·`PromiseBand.module.css`가 없다.
  - 시험 파일 밖 `src/components/landing/`에 `'use client'`·`useEffect`·`useState`·`setInterval`·`setTimeout`·`requestAnimationFrame`이 없다.

### REQ-209: 랜딩 AI 섹션·정형외과 비교표
- AC-209.1: Given `AiSection`, When 그리면, Then `section#ai`(canvas 띠) > `.wrap` > `.grid` 안이 아래와 같다. 1024px 이상 글 1~4칸 · 리포트 5~12칸, 미만은 쌓인다.
  - 글: h2 "버튼 한 번이면 AI가 이번 달을 읽어 줍니다"(태그 없음, heading-m → heading) → 안내 `<p>`(지금 문구) → 약속 `<dl>` 4개(dt 600 + dd small muted, 위아래 1px line으로 나뉨, 지금 제목·설명 문구). 768px 미만에서는 dd가 숨고 dt가 2칸으로 놓인다(앞에 4×4 accent 점).
  - 리포트: 패널 모양(surface·1px line·4px) 하나. 머리 h3 "10월 AI 리포트"(subtitle) + 칩 "방금 생성 · 예시"(neutral, 768px 미만은 "예시"). 몸은 1024px 이상 `minmax(0,1fr) 300px` 두 칸(사이 1px line).
    - 항목 `<ol>` 3개: 칩(늘었어요 positive · 살펴볼 것 warning · 추정 neutral) + 글 + 근거(small muted). 근거 문구: "근거 · 신환 9월 486명 → 10월 524명", "근거 · 인건비 총액 ÷ 매출", "근거 · 처방 그룹 ‘도수’ 9월 312건 → 10월 356건"(셋째 근거는 768px 미만에서 숨김).
    - 채팅 칸(768px 미만 숨김): 질문 말풍선 "다음 달엔 뭘 보면 좋을까?" → "AI가 답을 쓰는 중…"(small muted) → 칩 `<span>` 2개 → 물어보기 칸 `<div aria-hidden="true">`("AI에게 물어보기" + 보내기 표시 `<span>`, 1px line-strong 테두리).
    - 물어보기 칸은 입력란 그림이라 상자가 아니다. `aria-hidden`이라 랜딩 상자 검사(REQ-212)에서 빠진다. 말풍선은 `<p>`라 상자가 아니다.
  - `[지난달]`·`[이번 달]`·영문 소제목·반짝이가 없다.
- AC-209.2: Given `OrthoSection`, When 그리면, Then `section#ortho`(흰 바탕) > `.wrap` 안이 아래와 같다.
  - 머리: h2 "정형외과·통증 의원을 위해 만들었습니다"(1024px 이상 1~6칸) + 안내 `<p>`(7~11칸, 아래 맞춤). 미만은 쌓인다.
  - PC 비교표(768px 이상): `<table>` 하나. `thead`: 빈 모서리 칸 + `th` 주사·물리치료·비급여·월말 보고(subtitle 600, 아래 1px ink 선). `tbody` 세 줄 `th`(small 500 muted, 120px) "보는 숫자"·"기준"·"예시" — 보는 숫자: 주사 치료 수와 F/U · 물리치료 내원 환자 수 · 비급여 치료 내역 · 한 장으로 받는 월간 보고 / 기준: 이번 달 · 오늘 · 이번 달 · 10월 / 예시: 값 쌍(주사 치료 142건·F/U 37건 · 오전 21명·오후 17명 · 도수치료 86건·체외충격파 31건 · 보고서 PDF 1장·AI 분석 포함). 칸 아래 1px line, 세로 선·바깥 테두리 없음.
  - 휴대폰 표(768px 미만만): caption "예시 값" + 줄 4개. 줄 머리 `th`는 이름(600) 아래 기준(caption muted), 칸은 같은 값 쌍. 첫 줄 위 1px ink 선.
  - 두 표는 같은 배열 하나에서 그린다. "F/U 기록"·`<figure>`·카드가 없다.

### REQ-210: 랜딩 기능 섹션·개인정보 섹션
- AC-210.1: Given `FeaturesSection`, When 그리면, Then `section#features`(흰 바탕, `.wrap` 위 1px line) 안이 아래와 같다.
  - h2 "매일 하던 일, 이제 숫자가 알아서 움직입니다"(태그 없음, 최대 560px).
  - 급여(768px 이상만, 1024px 이상 1~6칸): 소개 "02 · 급여·인센티브"(small 600 accent) → h3 "월 실적만 넣으면 급여 계산이 끝납니다"(title) → 지금 설명 문구 → 패널 하나: 머리 "10월 급여" + "예시"(small muted) · 칩 positive(체크 12px) "10월 확정됨", 표 머리 직원·직종·인센티브·합계, 줄 "직원 1 물리치료사 420,000원 3,120,000원" · "직원 2 도수치료사 680,000원 3,480,000원" · "직원 3 간호조무사 120,000원 2,510,000원" · "직원 4 방사선사 150,000원 2,890,000원", 바닥 줄 "합계 4명 · 12,000,000원"(600, 위 1px line-strong). 금액 칸은 오른쪽 정렬·고정폭.
  - 기능 목록 `<ol>`(1024px 이상 8~12칸): `<li>`마다 번호 `<span>`(small 600 accent) + h3(subtitle) + p(ink-2). 768px 이상은 01 환자 통계 · 03 매출·재고 · 04 일일마감·보고 · 05 원장님 월간 보고(지금 설명 문구).
  - 768px 미만: 02 급여·인센티브 `<li>`가 01 뒤에 더 보이고(768px 이상에서는 숨음) 급여 패널은 숨는다. 설명은 시안 휴대폰 문구(small muted)로 바뀐다. 긴 설명은 `.pcOnly`, 짧은 설명은 `.phoneOnly`다.
    - 01 "통계 파일을 올리면 신환율·재진율, 재방문이 바로 계산됩니다." · 02 "월 실적만 넣으면 급여 계산이 끝납니다." · 03 "재고가 떨어지면 발주 알림을 띄웁니다." · 04 "정해진 양식에 맞춰 빠르게 씁니다." · 05 "한 장에 모아 PDF로 저장합니다."
  - `[직원 A]`~`[직원 D]`·`[금액]`·통계 미리보기·"통계 파일을 여기에 놓기"·작은 카드가 없다.
- AC-210.2: Given `PrivacySection`, When 그리면, Then `section#privacy`(canvas 띠) > `.wrap` 안이 아래와 같다.
  - 윗부분: h2 "환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다"(태그 없음) + 안내 `<p>`(1024px 이상 1~8칸) · 0건 덩어리(10~12칸, 왼쪽 1px line): `<p>`0`<span>`건`</span></p>`(display) + "서버와 AI로 보내는 환자 개인정보"(small muted, 태그 없음). 768px 미만에서 0건 덩어리는 왼쪽 선 없이 한 줄이다.
  - 흐름: 상자 하나(surface·1px line·4px) 안에 칸 3개와 연결 2개. 1024px 이상 `1fr 104px 1fr 104px 1fr` 가로, 미만 세로.
    - 칸: h3(subtitle, 16px 아이콘 muted) "병원 PC · 브라우저"·"서버"·"AI 분석" + 설명 p(지금 문구, 768px 미만 숨김). 첫 칸에만 멈춤 줄(negative, 멈춤 아이콘 14px): "여기서 멈춤"(600) + "환자 이름 · 주민번호 · 차트번호 · 파일 이름"(지금 문구, 가운뎃점 앞뒤 빈칸).
    - 연결(aria-hidden): caption muted "합계 숫자만"·"집계만" + 화살표 svg(가로, 1024px 미만은 아래쪽).
  - 약속 `<dl>` 4개(768px 이상만): 2칸(사이 24px), 칸마다 위 1px line, dt 600 + dd body ink-2, 지금 문구(줄바꿈 태그·`nowrap` span 없음).
  - "PRIVACY FIRST"·두 겹 상자(카드 안 카드)가 없다.

### REQ-211: 랜딩 시작 3단계·페이지 짜임·빈칸
- AC-211.1: Given `HowSection`, When 그리면, Then `section#how`(흰 바탕) > `.wrap` > `.grid` 안이 아래와 같다.
  - 글(1024px 이상 1~5칸): h2 "시작은 3단계면 충분합니다" → 안내 `<p>` "처음이면 가입 신청 후 관리자 승인을 받습니다." → [구글로 시작하기](`/login`, 주·44px).
  - 단계 `<ol>`(7~12칸): `<li>` 3개, 위아래 1px line. 번호 `<span>` "1"·"2"·"3"(24px 칸·accent-soft 바탕·accent-strong 600) + h3(subtitle) + p(ink-2, 768px 미만 숨김). 지금 단계 문구.
  - 768px 미만 순서: h2 → 안내 → 단계 → 단추(전체 폭).
- AC-211.2: Given `/` 페이지, When 서버 마크업을 보면, Then 아래와 같다.
  - `.root` 감싸개 하나 안에 header → `<main>`(section `#top` · `#ai` · `#ortho` · `#features` · `#privacy` · `#how`, 6개) → footer.
  - [구글로 시작하기]는 메뉴·히어로·`#how`에 하나씩 3개, 모두 `href="/login"`이고 안에 글자만 있다. [AI 분석 보기]는 하나이고 `#ai`로 간다.
  - 메뉴의 `#` 링크는 모두 페이지의 id를 가리키고 id는 겹치지 않는다.
  - canvas 띠(`.secCanvas`)는 `#ai`·`#privacy` 두 섹션뿐이다.
  - `StartSection.tsx`·`StartSection.module.css`가 없다.
- AC-211.3: Given `/` 페이지 글자, When 보면, Then 빈칸이 없다.
  - 보이는 글자에 `[`…`]` 꼴 빈칸이 없다. "서비스 이름"·"이메일 주소"·"[금액]"·"[직원"·"[지난달]"·"[이번 달]"이 없다.
  - "예시" 표시가 미리보기("예시 숫자")·AI 리포트("방금 생성 · 예시")·비교표("예시" 줄·"예시 값")·급여 패널("예시")에 있다.
  - "Powered by AI"·그라데이션 글자가 없다.

### REQ-212: 랜딩 CSS 규칙 (`rules.test.ts`)
- AC-212.1: Given 검사 목록의 랜딩 `*.module.css`(TASK마다 늘고 TASK-14에서 랜딩 폴더 전체), When 주석을 지우고 읽으면, Then 아래와 같다.
  - 색은 `var(--토큰)`·`transparent`·`currentColor`·`inherit`뿐이다. 16진수·`rgb(`·`hsl(`·`color-mix(`·색 이름이 없다.
  - `font-size`·`line-height`는 `var(--fs-*)`·`var(--lh-*)`뿐, `font-weight`는 400·500·600뿐, `letter-spacing`은 `0`·`var(--ls-*)`뿐이다.
  - `border-radius`는 `0`·`var(--r-control)`·`var(--r-float)`뿐이다.
  - `margin`·`padding`·`gap`·`row-gap`·`column-gap`·`inset`·`top`·`right`·`bottom`·`left`·`scroll-margin-top`의 길이는 0·2·4·6·8·12·16·20·24·32·48·64·72·80·96px(음수 포함)·%·`auto`·`var(--gutter*)`뿐이다.
  - `box-shadow`·`gradient(`·`backdrop-filter`·`filter`·`@keyframes`·`animation`·`transition`이 없다. `!important`는 `.pcOnly`·`.phoneOnly` 숨김 규칙에만 있다.
  - 화면 폭 조건은 `(min-width: 768px)`·`(min-width: 1024px)`와 숨김 도우미의 `(max-width: 767.98px)`뿐이다.
- AC-212.2: Given `base.module.css`, When 읽으면, Then 아래와 같다.
  - 요소 선택자(`h1`·`p`·`a` 등)를 쓰는 초기화 규칙은 모두 `@layer base { … }` 안에 있다. 그래서 랜딩 안에 놓인 Tailwind 부품(미리보기·차트)의 클래스가 이긴다.
  - `.root`: surface 바탕·ink 글자·`var(--font-ui)`·body 14/22·고정폭 숫자·`word-break: keep-all`.
  - `.wrap`: 최대 폭 `calc(var(--w-landing) + 2 * var(--gutter))`·가운데·좌우 `var(--gutter-m)` → `var(--gutter)`(768). `.grid`: 1024px 이상 12칸·칸 사이 24px.
  - `.sec`: 위아래 48px → 64px(768) → 96px(1024). `.secCanvas`(띠): canvas 바탕. 이름은 지금 그대로 둔다.
  - 글자 단계 클래스(`.tDisplay`·`.tHeading`·`.tTitle`·`.tSubtitle`·`.tLead`·`.tSmall`·`.tCaption` 가운데 랜딩이 쓰는 것)는 토큰 크기·줄 높이다. `.tDisplay`는 display-m → display(768), `.tHeading`은 heading-m → heading(768).
  - 단추(`.btn`+`.btnSm`·`.btnMd`·`.btnLg`, `.btnPrimary`·`.btnSecondary`)와 칩(`.chip`+`.chipNeutral`·`.chipPositive`·`.chipWarning`)은 앱 공통 모양(REQ-204)의 같은 종류와 같은 토큰 값이다(높이·여백·모서리·색).
  - 숨김 도우미 `.pcOnly`(768px 미만 숨김)·`.phoneOnly`(768px 이상 숨김)·`.srOnly`가 있다.
- AC-212.3: Given `/` 페이지 마크업, When 상자(REQ-204 AC-204.7과 같은 규칙. 랜딩 모듈에서 네 변 테두리를 주는 클래스도 상자다)를 보면, Then 상자 안에 상자가 없고, 섹션마다 맨 바깥 상자는 하나 이하다.
- AC-212.4: Given 랜딩 TSX(시험 제외), When 읽으면, Then 색 글자(`#` + 16진수)가 없고, `LogoMark`는 메뉴 24·바닥글 18로만 부르며, inline style이 없다(미리보기·차트의 % 값은 `components/charts` 안에 있다). `base.module.css`에 정의한 클래스는 모두 랜딩 TSX 어딘가에서 쓴다.
  - 예외는 `.btnSm`(32px·좌우 12px·small) 하나다. 랜딩에 그 크기 단추를 클래스로 쓰는 곳이 없다: 메뉴 [구글로 시작하기]는 `.btn`·`.btnMd`·`.btnPrimary`이고, 768px 미만에서만 `SiteHeader.module.css`의 `.inner .start`(클래스 둘이라 CSS 파일 순서와 상관없이 `.btnMd`를 이김)가 높이 32px·좌우 12px·small로 줄인다(누름 영역은 `.start::after` 위아래 8px로 44px 이상). 히어로·`#how` 단추는 `.btnLg`다.
  - `.btnSm`은 단추 크기 한 벌의 기준값으로 남는다. AC-212.2 시험이 `ds.button.primarySmall`과 같은 값인지, 메뉴 단추 시험(REQ-207)이 `.inner .start`의 768px 미만 크기와 같은지 본다.

### REQ-213: 인증 화면 틀 (`AuthFrame`)
- AC-213.1: Given `<AuthFrame>`(aside 없음: 가입 신청·승인 대기·거절·오류 화면), When 그리면, Then `.app-ui` 뿌리(surface 바탕) 안에 480px 한 칸(가운데, 768px 미만 좌우 16px)이 있다.
  - 칸 맨 위 줄 `<header>`(72px, 768px 미만 56px): 왼쪽 `LogoMark` 28, `headerEnd`를 주면 같은 줄 오른쪽 끝. 로고 왼쪽 끝과 본문 왼쪽 끝이 같다.
  - 그 아래 `<main>`에 본문(아래 48px, 768px 미만 32px). 띠 테두리·`[서비스 이름]`이 없다.
  - 두 모양 모두 `LogoMark`는 소스에 하나(`<header>` 안)이고, 그린 화면에도 하나다.
- AC-213.2: Given `<AuthFrame aside={…}>`(로그인), When 그리면, Then 1024px 이상에서 두 칸(반반)이다.
  - 왼쪽(surface): 가운데 400px 칸에 위 `<header>`(`LogoMark` 28) · 세로 가운데 `<main>` 본문 · 아래 "통증 의원 관리자를 위한 AI 업무 도구"(caption muted). 위아래 32px.
  - 오른쪽 `<aside aria-label="미리보기">`(canvas, 왼쪽 1px line): 가운데 560px 칸에 aside 내용.
  - 1024px 미만: 한 칸이다(좌우 16px, 768px 이상은 가운데 400px). 위 줄(56px)에 같은 `LogoMark`를 24px로 줄여(클래스) 두고 → 본문(위 32px). aside와 아래 소개 줄은 숨는다.
- AC-213.3: Given 로그인·가입 신청·승인 대기 페이지, When 그리면, Then 페이지 파일은 AuthFrame과 그 props만 바뀐다(로그인은 `aside={<LoginAside />}`, 승인 대기는 지금처럼 `headerEnd={<HeaderSignOut />}`). 문지기·`dynamic`은 그대로다.

### REQ-214: 로그인
- AC-214.1: Given `LoginCard`, When 그리면, Then 상자(카드) 없이 이 순서다.
  - h1 "로그인"(heading-m → heading(768)) → `<p>` "구글 계정으로 로그인합니다. 처음이면 가입 신청으로 이어집니다."(ink-2, 위 8px) → (오류면 오류 카드) → [구글로 시작하기](`ds.button.googleLarge` 전체 폭, 위 24px, 안에 `GoogleMark` 18(aria-hidden) + 글자. 다시 시작이면 "다시 구글로 시작하기") → 안내 줄(위 24px, 위 1px line): 방패 16px(muted) + "환자 개인정보는 병원 PC 밖으로 나가지 않습니다"(small 600) + "환자 파일은 이 브라우저 안에서만 읽고, 서버에는 집계 숫자만 저장합니다."(small muted) → "처음 가입하면 관리자가 승인한 뒤부터 쓸 수 있습니다."(caption muted, 위 16px).
  - 이 모두는 지금처럼 `<section aria-labelledby>`(이름 "로그인" = h1, 테두리·바탕 없음) 하나 안에 있다. 그래서 그 region으로 찾는 동작 시험이 그대로 통과한다.
  - "SIGN IN"·기능 칩 4개·두 줄 소개 제목·카드 상자가 없다. 구글 G는 흰 사각형 안에 넣지 않는다. "크롬·엣지" 한 덩이(`whitespace-nowrap`)는 그대로다.
- AC-214.2: Given 앱 안 브라우저, When 그리면, Then 안내 상자는 canvas 바탕·4px이고 테두리가 없다(안의 읽기 전용 주소 칸이 테두리를 가진다). 문구·[주소 복사] 동작은 그대로다.
- AC-214.3: Given `LoginAside`, When 그리면, Then "로그인하면 우리 의원의 오늘 숫자, AI 리포트, 급여와 보고를 한 곳에서 이어서 봅니다."(small ink-2, 최대 480px) → `<DashboardPreview />` 순서다(사이 16px).
- AC-214.4: Given `src/components/common/GoogleMark.tsx`, When 그리면, Then 구글 G(48×48 viewBox, 상표 네 색 path 4개)를 `aria-hidden="true"`·`size` 크기로 그린다. 구글 상표 색은 이 파일에만 있다.

### REQ-215: 가입 신청
- AC-215.1: Given `SignupForm`, When 그리면, Then AuthFrame 480 칸 안이 이 순서다: 단계 → h1 → 안내 → 폼 → [다른 계정으로 로그인].
  - 단계 `<ol aria-label="가입 단계">`(위 24px, small): `<li>` 3개 사이에 aria-hidden 연결선(24px·1px line-strong, 768px 미만 10px).
    - 1 구글 로그인(끝남): 20px 칸 accent-soft 바탕 + accent 체크 12px, 글자 ink-2. 화면 읽기 "끝남".
    - 2 가입 신청(지금): accent 바탕 흰 "2", 글자 ink 600, `aria-current="step"`.
    - 3 관리자 승인(다음): 1px line-strong 테두리 muted "3", 글자 muted.
  - h1 "가입 신청"(heading-m → heading, 위 24px) → 안내 `<p>`(지금 문구, ink-2, 위 8px).
  - 폼(위 24px, 칸 사이 20px): 구글 계정(읽기 전용 칸 + 자물쇠 14px + 이메일, 도움말 "로그인한 계정이라 바꿀 수 없습니다.") · 병원 이름(필수) · 신청자 이름(필수) · 연락처(선택, 도움말 "승인 관련해 연락이 필요할 때만 씁니다.") · 동의 체크(지금 문구 + "필수") · [가입 신청](`ds.button.primaryLarge` 전체 폭). 칸 이름 줄은 이름(small 600) + 필수·선택(caption muted).
  - [다른 계정으로 로그인]은 폼 밖 아래(위 16px), 왼쪽 정렬 글자 단추(accent, body 500)다.
  - 카드 상자가 없다. 자리표시 글자·오류 문구·오류 카드 위치는 지금 그대로다.

### REQ-216: 승인 대기·거절
- AC-216.1: Given 대기 `PendingCard`, When 그리면, Then 이 순서다(카드 상자 없음).
  - 단계(가입 신청과 같은 모양): 1·2 끝남, 3 관리자 승인 지금.
  - 상태 줄(위 24px): `ds.chip.warning`(시계 12px) "승인 대기" + "<신청일> 신청"(small muted, 한국 날짜).
  - h1 "신청을 확인하고 있습니다"(위 8px) → 안내 `<p>`(지금 문구).
  - `<section aria-labelledby>`(이름 "보낸 신청 내용", 테두리·바탕 없음) 안에 h2 "보낸 신청 내용"(small 600 muted, 위 32px) → `<dl>`(위 8px, 위 1px line): 줄마다 96px dt(small muted) + dd(body), 줄 아래 1px line, 줄 높이 44px 이상(위아래 12px). 신청일·병원 이름(600)·신청자·구글 계정·연락처(지금 값 규칙 그대로).
  - [상태 다시 확인](`ds.button.primaryLarge`, 위 24px, 768px 미만 전체 폭).
  - 본문 [로그아웃]이 없다. 페이지의 [로그아웃]은 위 줄 `HeaderSignOut`(`ds.button.ghostSmall`) 하나뿐이다.
- AC-216.2: Given 거절 `PendingCard`, When 그리면, Then 단계가 없고 이 순서다.
  - 상태 줄: `ds.chip.negative`(× 12px) "승인되지 않음" + "<신청일> 신청".
  - h1 "가입이 승인되지 않았습니다" → `<p>` "궁금한 점은 신청을 검토한 관리자에게 문의해 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있습니다."
  - h2 "보낸 신청 내용" → `<dl>` 신청일·병원 이름·구글 계정.
  - [다른 계정으로 로그인](`ds.button.primaryLarge`). 본문 [로그아웃]이 없고 `[이메일 주소]`가 없다. 위 줄 [로그아웃]은 하나다.

### REQ-217: 오류 화면·오류 카드
- AC-217.1: Given `ErrorCard`, When 그리면, Then negative-soft 바탕·`rounded-control`·테두리 없음·안쪽 12px 16px이다. 아이콘 16px(negative, aria-hidden) + 무엇이(small 600 negative) · 어떻게 고치나(small ink-2) · "오류 번호 E-…"(caption muted, 고정폭). 문구 출처(`lib/errors.ts`)와 글자 목록은 그대로다.
- AC-217.2: Given `app/error.tsx`, When 그리면, Then `<AuthFrame>`(480 칸, 위 줄 로고) 본문에 오류 카드 → 단추 줄([다시 시도] `ds.button.primary` · [로그아웃] `ds.button.secondary`, 한 줄에 나란히·좁으면 아래로·사이 8px·단추마다 `flex-[1_1_160px]`) 순서다(위 24px). 글자는 지금 그대로이고 이동 링크가 없다.

### REQ-218: 앱 틀 (`AppShell`·`TabBar`·`AccountMenu`·`KstClock`)
- AC-218.1: Given `AppShell`, When 그리면, Then `.app-ui` 뿌리(canvas) 안이 아래와 같다.
  - 위에 붙는 묶음 하나(sticky, top 0, z 10)에 위쪽 띠와 탭 줄이 함께 있다.
  - 위쪽 띠(`<header>`, surface·아래 1px line): 56px(768px 미만 48px). 안쪽 감싸개는 `max-w-7xl`(1280px)·가운데·좌우 24px(768px 미만 16px).
    - 왼쪽: `LogoMark` 24 + 병원 이름(subtitle 600, 넘치면 말줄임. 768px 미만 body 600).
    - 오른쪽: `KstClock`(small muted, 768px 미만 숨김) · 계정 단추. 사이 16px.
    - `[서비스 이름]`과 세로 구분선이 없다.
  - `<main>`: 감싸개 `max-w-7xl`·가운데·좌우 24px·위 24px·아래 48px(768px 미만 좌우 16·위 16·아래 32).
- AC-218.2: Given `TabBar`, When 그리면, Then 아래와 같다.
  - 탭 줄 44px·surface·아래 1px line. 안쪽 줄은 지금처럼 nav의 첫 자식 하나(`flex w-max min-w-full items-stretch`)이고, 감싸개를 따로 더하지 않는다. 그 줄에 `px-6 max-md:px-4 lg:mx-auto lg:w-full lg:min-w-0 lg:max-w-7xl`을 더해 1024px 이상에서 위쪽 띠와 같은 폭·여백이 된다. 첫 탭 글자가 로고 왼쪽 끝과 맞는다(같은 줄의 `[&>:first-child]:-ml-3`, 모든 폭).
  - 탭: 좌우 12px·body 500·ink-2 → 올림 ink. 지금 탭은 ink 600 + 아래 2px accent 밑줄(좌우 12px 안쪽). 준비 중 탭은 faint 글자(같은 크기, 누를 수 없는 단추 그대로).
  - 툴팁 "준비 중": ink 바탕·surface 글자 caption 500·좌우 8px·위아래 6px·`rounded-float`·`shadow-float`, 탭 아래 붙어 나온다(1024px 이상).
  - 관리자: 지금과 같은 세로 구분선(`w-px h-4 bg-line`, 가운데) 뒤 [관리자].
  - 1024px 미만: 지금처럼 띠 안에서 옆으로 밀린다(얇은 스크롤바). 탭 높이는 모든 폭에서 44px.
  - 탭 순서·링크·지금 탭 판단은 그대로다.
- AC-218.3: Given `AccountMenu`, When 그리면, Then 계정 단추는 `ds.button.secondarySmall`(32px) 모양에 사람 아이콘 16 + 이메일 + 아래 화살표다. 메뉴는 `ds.layer`(8px·그림자)·폭 240px다. 768px 미만은 44×44 아이콘 단추(테두리 없음, aria-label에 이메일)다. 여닫기·초점·[로그아웃] 동작은 그대로다.

### REQ-220: 관리자
- AC-220.1: Given `AdminApplications`(PC), When 그리면, Then 아래와 같다.
  - h1 "가입 신청"(title) → 안내 `<p>`(지금 문구, ink-2, 위 4px).
  - 화면 안 탭(위 16px, 40px, 아래 1px line): 대기·승인·거절 + 개수(글자만, muted 500, 칩 아님). 지금 탭은 ink 600 + 아래 2px accent 밑줄, 나머지 ink-2 500.
  - 표: 패널 틀 없이 본문 위에 바로(surface 바탕·위아래 1px line·모서리 없음·위 16px). 칸 신청일(120px, muted 고정폭) · 병원 이름(600) · 신청자(120px) · 이메일(ink-2) · 연락처(150px, ink-2 고정폭) · 동작(150px, 오른쪽). 몸 줄 56px, 머리 small 500 muted.
  - 동작 칸: 대기 줄 [승인] `ds.button.accentOutlineSmall` · [거절] `ds.button.secondarySmall`, 거절 줄 [되돌리기] `ds.button.secondarySmall`, 승인 줄 "승인됨" 완료 칩 `ds.chip.positive`(지금처럼 단추 대신). 줄의 상태를 따로 알리는 상태 칩(지금 휴대폰의 대기·거절됨)은 없다(탭이 상태다).
  - 표 아래 "대기 중인 신청 N건"(small muted)은 시안에 있지만 두지 않는다(개수는 탭에 있다).
  - 완료 줄·오류 카드 자리(탭 줄과 표 사이)·빈 탭 줄은 그대로다.
- AC-220.2: Given 768px 미만, When 그리면, Then 표 머리가 숨고 줄마다 세로로 쌓인다(본문 좌우 끝까지 닿는 띠, 위아래 1px line, 줄 사이 1px line, 안쪽 12px 16px).
  - 줄 안 순서: 병원 이름(600, 말줄임) + 오른쪽 신청일(caption muted) → "신청자 · 이메일"(small ink-2) → 연락처(small muted, 비었으면 지금처럼 "—". 시안의 "연락처 없음"은 쓰지 않음) + 오른쪽 단추들(44px).
  - 상태 칩이 없다(승인 줄의 "승인됨" 완료 칩은 그대로). 화면 안 탭은 44px다.
- AC-220.3: Given 거절 확인 창, When 열면, Then `ds.layer`(8px·그림자)·폭 400px·안쪽 24px, 뒤 가림막 ink 36%, [취소] `ds.button.secondary` · [거절] `ds.button.danger`(768px 미만 나란히 반씩 44px)다. 문구·초점 동작은 그대로다.

### REQ-221: 옛 이름 정리
- AC-221.1: Given 시험 파일 밖 `src/`(대시보드 두 폴더 `src/components/dashboard/`·`src/app/(app)/dashboard/`는 빼고), When 읽으면, Then 옮기는 동안 둔 옛 이름이 없다.
  - Tailwind 클래스 `text-table`·`text-tab`·`text-panel`·`text-logo`·`text-title-sm`·`text-kpi`·`text-kpi-sm`·`rounded-card`·`rounded-chip`·`*-ok`·`*-ok-soft`·`*-danger`·`*-danger-soft`·`*-warn`이 없다. 남기는 `ui` 세 키의 값(`classes.ts`) 안의 `rounded-card`·`text-panel`은 이 검사에서 뺀다.
  - `globals.css`에 옛 별칭(`@theme`의 옛 이름, `:root`의 `--ok`·`--ok-soft`·`--danger`·`--danger-soft`·`--accent-tint`·`--field`·`--content-max`)이 없다. 예외는 대시보드 빈 자리가 아직 쓰는 `@theme` 별칭 넷이다: `--radius-card`·`--text-table`·`--text-panel`·`--text-title-sm`(글자 셋은 `--line-height`까지). 값은 지금 그대로다(`var(--r-control)`·small·subtitle·title 토큰).
  - 옛 모양 묶음 `ui`(`classes.ts`의 `export const ui`)에는 대시보드 빈 자리가 쓰는 세 키 `card`·`panel`·`panelTitle`만 남고, 값은 한 글자도 바뀌지 않는다. `ui`를 보는 옛 시험(TASK-23 '고치는 옛 시험'에 적은 `classes.test.ts`의 옛 `ui` 모양·휴대폰 목록 시험)이 없다. `ui.` 참조는 `classes.ts`와 대시보드 두 폴더에만 있다. 대시보드 두 폴더 밖의 앱 화면·차트·미리보기는 모두 `ds`만 쓴다. `ds`에 어느 화면도 쓰지 않는 키가 없다.
- AC-221.2: Given 규칙 시험, When 돌리면, Then 검사 목록 없이 전체를 본다: AC-204.6은 앱 화면 폴더 전체(대시보드 두 폴더 빼고) + `components/charts`·`components/preview`, AC-204.7은 REQ-213~REQ-218·REQ-220의 모든 화면(대시보드 본문 없음), AC-212.1은 랜딩 폴더 전체.
  - 대시보드 두 폴더를 빼는 것은 이 AC의 두 검사(REQ-204의 클래스 규칙·상자 겹침)와 AC-221.1뿐이다. 16진수 색 검사(REQ-202)·굵기 검사(REQ-203)·그대로 두는 옛 앱 화면 색 검사(`classes.test.ts`, auth 명세)는 그 두 폴더도 보고, 지금 파일 그대로 통과한다.
- AC-221.3: Given `src/components/common/LogoMark.tsx` 주석과 `src/comments.test.ts`, When 읽으면, Then 쓰는 곳 크기 목록이 지금과 같다(랜딩 메뉴 24·바닥글 18·미리보기 18·앱 틀 24·인증 틀 28, 로그인 좁은 화면은 같은 28을 클래스로 24로 줄임).

### REQ-222: 세 폭 화면 확인
- AC-222.1: Given 127.0.0.1 개발 서버(가짜 Supabase `docs/mockups/b2b-redesign/tools/stub.mjs`, 가짜 세션 쿠키, 모션 줄이기), When 아래 화면을 390×844·768×1024·1440×900에서 열면, Then 모든 화면·폭에서 아래가 맞다.
  - 화면: `/` · `/login` · `/login?error=1` · `/signup`(신청 전) · `/pending`(대기·거절) · `/dashboard` · `/admin`. `/dashboard`는 앱 틀(위쪽 띠·탭 줄)을 보려고 연다. 본문은 이 명세가 고치지 않은 빈 자리("오늘 + 날짜" 제목·준비 중 상자)이고 새 대시보드 본문을 기대하지 않는다.
  - 가로 스크롤이 없다(`document.documentElement.scrollWidth`가 창 폭과 같다).
  - 글자의 계산된 `font-family` 첫 글꼴이 Pretendard(next/font 이름)이고 `document.fonts.check('600 16px <그 이름>')`이 참이다.
  - 화면을 600px 내린 뒤에도 랜딩 위쪽 메뉴, 앱의 위쪽 띠 + 탭 줄이 맨 위(top 0)에 붙어 있다.
  - 랜딩 390의 전체 높이는 5화면(4,220px) 이하다.
  - 차트 눈금 글자의 계산된 크기는 12px이다.
- AC-222.2: Given 세 폭 사진, When 승인 시안(게시본, 같은 폭)과 나란히 보면, Then 섹션 순서·칸 수·상자 모양·색·글자 단계·정렬 선이 같고 겹침·잘림이 없다. 다른 곳은 그 화면 파일 안에서 고치고 보고에 적는다.
  - `/dashboard`는 앱 틀만 시안과 견준다. 본문이 시안의 대시보드 본문(`dashboardPC`·`dashboardPhone`)과 다른 것은 고치지 않고 보고에 "다음 대시보드 명세"로 적는다. 본문에도 겹침·잘림·가로 넘침은 없어야 한다.
- AC-222.3: Given 확인이 끝나면, When 포트를 보면(`ss -ltnp`), Then 띄운 서버·가짜 Supabase·브라우저가 모두 멈춰 있다. 사진·기록에 진짜 쿠키·토큰이 없다(실제 계정으로 로그인하지 않는다). 스크립트와 사진은 scratchpad에만 둔다.

## 범위 밖
- 기능·동작·API·서버 경로·인증·승인 로직·Supabase 표와 RLS·middleware·`lib/analytics` 계산
- 대시보드에 실제 숫자 연결(파일 올리기, Worker 결과 그리기), 재방문 선 그래프·처방 표·늘고 준 처방·동네 패널의 실제 화면, 차트 툴팁(마우스 올림 상자). 다음 대시보드 명세에서 한다
- 대시보드 본문 다시 디자인(제목 "대시보드"·도구 줄·KPI 줄·빈 상태, `DashboardView`, `DashboardEmpty`·`todayTitle` 지우기). 옛 REQ-219·TASK-21이었고 2026-10-31 사용자 결정으로 다음 대시보드 명세로 옮겼다. 이 명세는 `src/components/dashboard/*`·`src/app/(app)/dashboard/*`를 고치지 않는다
- 서비스 이름·문의 메일 정하기, 다크 모드
- 새 npm 패키지(차트·UI 라이브러리), Playwright E2E 시험 추가
- 옛 명세(`specs/landing/`·`specs/auth/`·`specs/landing-v2/`)와 옛 시안 폴더 고치기
- 운영 배포. 사용자가 OK할 때 따로 한다
