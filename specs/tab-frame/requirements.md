# 요구사항: 탭 13개 틀과 대시보드 첫 화면 (1안 오늘 브리핑)

> 기능 ID: `tab-frame` · 형식: 요구사항은 `### REQ-301: 제목`, 수용 기준은 `- AC-301.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다. 화면 측정 AC(REQ-309)와 문서·저장소 설정·범위 AC(REQ-308의 일부, REQ-310, AC-313.1)는 명령·사진·측정으로 본다(tasks.md에 적은 방법).
> 번호는 301부터다. 다른 명세가 쓴 번호(auth·auth-live·landing·stats-core·precheck의 001~034, landing-v2의 101~114, b2b-redesign의 201~222)와 시험 이름이 겹치지 않게 한다.

## 배경 / 목표
- 사용자 결정(2026-10-31, 최종). 옛 계획 `docs/tab-frame/plan.md`(대시보드 탭 없음·로그인하면 통계·탭 12개)보다 이 명세가 이긴다.
  1. 로그인하면(승인 뒤, `/login`·`/signup`·`/pending`에서 와도) 늘 `/dashboard`에 닿는다. 지금 길이 이미 그렇다 — 그대로 두고 시험으로 못 박는다. `/dashboard`는 다른 탭으로 저절로 보내지 않는다.
  2. 위쪽 탭 줄은 그대로 두고 13개로 바꾼다: 대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 매출 · AI 리포트 · 서식 · 직원 · 업무일지 · 재고 · 주소록 · 설정. 옛 항목 급여 · 일일마감·보고 · 월간 PDF는 줄에서 빠진다(그 내용은 나중에 직원 · 업무일지 · AI 리포트에 들어간다).
  3. 아직 없는 기능은 탭과 목차 칸이 그 기능의 주소(`/stats` 등)로 가고, 그 주소는 공통 화면 "준비 중인 기능입니다"(대시보드로 돌아가는 단추 포함)를 그린다. 지금의 '준비 중 툴팁 단추' 탭을 이것이 대신한다.
  4. 설정: 이미 있는 비트 PC 연결 화면(`/claim/setup`)으로 가는 길을 잃지 않는다. 가장 작은 설계를 고르고 이유를 design.md에 적는다.
  5. 관리자만 보던 '관리자' 탭은 탭 줄에서 빠지고, 오른쪽 위 계정 메뉴에 관리자에게만 보이는 '가입 승인'(`/admin`) 링크가 생긴다. `/admin` 접근 규칙은 그대로다.
  6. 로그인·역할·API·DB·기존 화면(`/claim`·`/claim/setup`·`/admin`)과 자료는 그대로 두고 아무것도 지우지 않는다. 지금 디자인 토큰만 쓰고 새 색·글꼴·토큰은 없다.
- 사용자 결정(2026-10-31, 대시보드): 기능 칸 격자 시안을 버리고 **"1안 오늘 브리핑"**을 골랐다(최종 시안 `mockup-dashboard-v3`, 만드는 분을 위한 메모 `notes.md`). 대시보드는 위에서부터:
  - **브리핑**: 날짜 줄 + 큰 문장 하나 + 주 단추 [비트 PC 연결 시작](→ `/claim/setup`) + 연결 순서 5단계.
  - **지금 바로 쓸 수 있어요**: 지금 쓸 수 있는 삭감 예방 사전점검을 앞으로 뺀 한 줄.
  - **오늘 하루 분석**: 숫자 4칸(오늘 환자 수 · 신환 · 재진 · 지난주 같은 요일보다).
  - **기간별 흐름**: 기간 단추(최근 7일 · 30일 · 90일, 처음 30일) + 그래프 넷(환자 수 추이 · 신환 재방문율 7·14·30일 · 요일별 환자 수 · 처방 상위).
  - **기능 목차**: 12개 기능의 조용한 목록(탭 순서, 준비 중인 것은 그 준비 중 주소로).
  - **연결한 뒤 짜임**: 자료가 들어오면 큰 문장 자리에 "원장님 보고 문장" + [복사]가 올라오고, 연결 순서 자리로 '지금 바로 쓸 수 있어요'(사전점검)가 올라간다.
- 자료 규칙(사용자 결정):
  - 서버에는 아직 저장된 숫자가 없다. 이 명세는 새 표·API·DB를 만들지 않는다. 자료 읽는 자리(함수 하나)는 지금 늘 "자료 없음"을 돌려주고, 화면은 연결 전 모양(빈 상태 문구)만 보인다. **지어낸 숫자는 어디에도 없다**(시안에도 없다).
  - '연결한 뒤 짜임'은 이미 있는 저장 모양(`DayPayload`)의 진짜 자료를 그릴 수 있게 만들고, 시험 안의 가짜 자료로만 시험한다. 진짜 자료 연결은 다음 통계 명세다.
  - "지난주 같은 요일보다"는 오늘 진료가 끝난 뒤에만 숫자가 나온다. 그 전에는 "오늘 진료가 끝나면 비교해요"다.
  - 30일 재방문율은 저장 모양에 7·14일만 있어 연결한 뒤에도 늘 '자료 없음'이다.
  - 휴대폰 탭 띠 오른쪽 흐림(그라데이션)은 넣지 않는다.
- 사용자 결정(2026-10-31, 움직임): UI_GUIDE의 "움직이는 것이 없다"를 '짧은 반응 허용'으로 바꾼다 — 조작 요소의 색·투명도·작은 옮김만, 120~200ms(150ms 기본, 휴대폰 아래 단추만 200ms), 모션 줄이기를 켠 기기는 모두 바로 바뀐다. 그래프·랜딩은 지금처럼 움직이지 않는다.
- 기준 시안: 총괄이 고른 최종 시안(작업 공간 `mockup-dashboard-v3/index.html`과 `notes.md`, TASK-1이 `docs/mockups/dashboard-home/`으로 옮긴다). 화면 1 컴퓨터(연결 전) · 화면 2 휴대폰 · 화면 3 연결한 뒤 짜임 · 화면 4 계정 메뉴 · 화면 5 준비 중(주소록 예) · 반응. 모양 값(토큰·클래스·글자 단계·간격·칸)과 문구는 `notes.md`를 따르고, 이 명세의 AC는 동작과 꼭 지킬 값을 정한다. 시안과 이 명세의 동작이 다르면 이 명세가 이기고, 모양만 다르면 시안이 이긴다(그때 모양을 적은 AC를 고친다). 시안과 일부러 다르게 한 곳은 design.md '시안과 다른 점'에 적는다.
- 이 명세가 대체하는 옛 기준. 옛 명세 파일은 고치지 않는다(승인 기록이 깨지지 않게). 대신 UI_GUIDE에 "tab-frame이 대체"라고 적는다.
  - auth: AC-008.1(탭 10개 목록), AC-008.2(관리자 탭·구분선), AC-008.5(준비 중 툴팁 단추), AC-009.1(대시보드 h1 "오늘 + 날짜" — 이제 날짜는 작은 날짜 줄이고 h1은 큰 문장 또는 보고 문장), AC-009.2(대시보드 빈 안내 상자).
  - b2b-redesign: AC-218.2 가운데 준비 중 탭(`faint`·툴팁)과 관리자 구분선 부분(탭 크기·지금 탭 모양은 그대로 유효). UI_GUIDE '빈 상태'의 "그림·큰 아이콘을 쓰지 않는다"는 준비 중 화면의 꾸밈 선과 대시보드 빈 그래프 틀(글자 없는 선·빈 막대 칸, `aria-hidden`)만 예외. UI_GUIDE '하지 마라'·'움직임'의 "움직이는 것이 없다"는 '짧은 반응 허용'으로 바뀐다(차트 부품의 "움직이지 않는다"는 그대로).
  - precheck: AC-006.4·AC-034.1 가운데 "`/claim/setup`의 [설정]은 누를 수 없는 표시만"이라는 부분. 이제 [설정]은 `/claim/setup` 링크다. 설치·연결 확인 화면 안 [청구·연락]이 준비 중인 것은 그대로다.
- 다른 명세와의 관계: 사전점검(precheck) 뒤 단계가 통계(`/stats`)·설정(`/settings`)·환자 연락 화면을 채울 때 그 TASK가 `menu.ts`의 `href`와 이 명세의 목차 자료·준비 중 자료·준비 중 페이지를 함께 바꾼다(design.md '다음 명세가 탭을 채울 때'). 통계 명세는 대시보드의 자료 읽는 자리를 진짜 읽기로 바꾼다.

## 요구사항

### REQ-301: 로그인하면 늘 대시보드가 첫 화면이다
- AC-301.1: Given 구글 로그인 콜백 `/auth/callback?code=…`, When 세션 만들기가 성공하면, Then 응답은 같은 origin의 `/dashboard`로 보낸다. `next`·`redirect`·`returnTo` 쿼리를 줘도 `/dashboard`다.
- AC-301.2: Given 승인된 사용자(관리자 포함), When `/login`·`/signup`·`/pending`을 열면, Then 문지기(`decideRoute`)가 `/dashboard`로 보낸다. 로그인했고 병원 상태를 아직 모르는 middleware 단계(`hospital: 'unknown'`)에서 `/login`을 열어도 `/dashboard`다.
- AC-301.3: Given 승인된 사용자(관리자 포함), When `/dashboard`를 열면, Then 문지기는 그대로 연다(`null`). 대시보드 페이지와 그 화면 파일(`components/dashboard/**`) 소스에는 다른 주소로 보내는 코드(`redirect`·`permanentRedirect`·`useRouter`·`router.push`·`router.replace`·`location.`)가 없다.

### REQ-302: 탭 목록 13개 (`components/shell/menu.ts`)
- AC-302.1: Given `MENU`, When 이름을 차례로 읽으면, Then 정확히 13개이고 순서는 대시보드 · 통계 · 청구 · 고시·공지 · 환자 · 매출 · AI 리포트 · 서식 · 직원 · 업무일지 · 재고 · 주소록 · 설정이다. 급여 · 일일마감·보고 · 월간 PDF · 관리자는 없다.
- AC-302.2: Given `MENU`, When 항목마다 탭 주소(`path`)를 읽으면, Then 아래 표와 같고 13개가 모두 다르며 모두 `/`로 시작하는 같은 origin 고정 경로다.
  - 대시보드 `/dashboard` · 통계 `/stats` · 청구 `/claim` · 고시·공지 `/notices` · 환자 `/patients` · 매출 `/revenue` · AI 리포트 `/ai-report` · 서식 `/forms` · 직원 `/staff` · 업무일지 `/worklog` · 재고 `/inventory` · 주소록 `/contacts` · 설정 `/claim/setup`
- AC-302.3: Given `MENU`, When 항목마다 기능 자신의 화면(`href`)을 읽으면, Then 대시보드는 `/dashboard`, 청구는 `/claim`이고 나머지 11개(설정 포함)는 `null`이다. `href`가 `null`이 아니면 `path`와 같다. 그래서 설치·연결 확인 화면(`SetupScreen`) 안 [청구·연락]은 고치지 않고도 지금처럼 '준비 중'이다.
- AC-302.4: Given `currentMenuLabel(경로)`, When 경로를 주면, Then 아래와 같다.
  - `/dashboard` → 대시보드, `/claim`·`/claim/close` → 청구, `/claim/setup`·`/claim/setup/x` → 설정(가장 길게 맞는 주소가 이긴다)
  - 준비 중 주소 10개와 그 아래 경로(예: `/stats`·`/stats/x`·`/ai-report`) → 그 탭
  - `/admin`·`/`·`/statsx`·`/claimx`·`/settings` → `null`

### REQ-303: 탭 줄과 앱 틀 본문 (`components/shell/TabBar.tsx`·`AppShell.tsx`)
- AC-303.1: Given 어느 앱 화면, When 탭 줄(`nav`, 이름 "메뉴")을 그리면, Then 그 안에 링크 13개가 `MENU` 순서·이름대로 있고 링크마다 `href`가 그 탭의 `path`다. 탭 줄 안에 `button`·`aria-disabled`·`role="tooltip"`·"준비 중" 글자가 없다.
- AC-303.2: Given 지금 경로, When 탭 줄을 그리면, Then `currentMenuLabel`이 정한 탭 하나만 `aria-current="page"`이고 지금 탭 모양(ink 600 + 아래 2px accent 밑줄)이다. `/claim/setup`에서는 [설정], `/stats`에서는 [통계]가 지금 탭이고 [청구]·[대시보드]는 아니다. `/admin`에서는 지금 탭이 없다.
- AC-303.3: Given 화면이 아직 없는 기능의 탭, When 그리면, Then 다른 탭과 같은 기본 모양(44px·좌우 12px·body 500 `ink-2`, 올림 `ink`, 안쪽 2px accent 초점 고리)이고 `faint` 글자가 아니다. 모든 탭은 올림 글자색이 짧게 바뀐다(`transition`, 150ms 기본값). 그 밖의 움직임은 없다.
- AC-303.4: Given 관리자든 아니든, When 앱 틀(`AppShell`, `(app)/layout`)을 그리면, Then 탭 줄에 [관리자] 링크와 세로 구분선이 없다. `TabBar`는 관리자 여부를 받지 않는다.
- AC-303.5: Given 1024px 미만, When 탭 줄을 그리면, Then 지금처럼 띠 안에서 옆으로 밀리고(얇은 스크롤바, 줄바꿈 없음) 처음 그릴 때 지금 탭이 보이게 띠만 민다. 메뉴 서랍·[메뉴 열기] 단추·띠 끝 흐림(그라데이션)은 없다.
- AC-303.6: Given 본문에 흰 바탕 표시(`data-page-surface`)를 단 요소가 있는 페이지(대시보드), When `AppShell`을 그리면, Then 본문(`main`)이 그 표시를 가진 자식이 있을 때만 `surface` 바탕이 되는 클래스(`has-[[data-page-surface]]:bg-surface`)를 갖고, 표시가 없는 페이지는 지금처럼 앱 틀 바탕(`canvas`)이다. 본문 안쪽 감싸개(1280 폭·좌우 24px·위 24px·아래 48px, 폰 16·16·32)는 그대로다.

### REQ-304: 계정 메뉴의 [가입 승인] (`components/shell/AccountMenu.tsx`)
- AC-304.1: Given 관리자, When 계정 메뉴를 열면, Then 메뉴(`role="menu"`, 이름 "계정")의 항목이 위에서부터 [가입 승인](`/admin` 링크, `role="menuitem"`, 왼쪽에 꾸밈 아이콘 `userCheck` 16) · [로그아웃] 둘이다. 관리자가 아니면 항목은 [로그아웃] 하나뿐이고 "가입 승인" 글자가 없다. 메뉴 머리(이메일·병원 이름·관리자면 "관리자 계정" 칩)는 그대로다.
- AC-304.2: Given 열린 계정 메뉴, When 키보드를 쓰면, Then 열릴 때 첫 항목에 초점이 가고, ↓·↑로 항목 사이를 옮기며 끝에서 처음(처음에서 끝)으로 돈다. Esc는 닫고 계정 단추로 초점을 돌려준다. Tab은 닫는다.
- AC-304.3: Given 관리자의 열린 메뉴, When [가입 승인]을 누르면, Then 메뉴가 닫히고 `/admin`으로 간다(링크 이동). [가입 승인]은 [로그아웃]과 같은 메뉴 항목 모양(36px, 폰 44px, 올림 `canvas`, 누름 아래 1px, 안쪽 초점 고리)이다.
- AC-304.4: Given 계정 단추와 메뉴, When 올리거나 열면, Then 계정 단추는 올림과 열린 동안 바탕이 `canvas`이고(색 150ms), 메뉴는 나타날 때만 투명 → 보임 + 위 4px에서 제자리로 150ms 움직인다(`starting:opacity-0 starting:-translate-y-1` + `transition`). 닫힐 때는 바로 사라진다.

### REQ-305: 준비 중 화면 (공통 화면 + 기능별 문구 + 기능 주소 10개)
- AC-305.1: Given `NotReadyScreen`에 준비 중 기능 자료(이름·소개 문장·만들 것 목록)를 주면, When 그리면, Then h1이 기능 이름이고, 그 아래 바깥 상자 하나(`ds.panel` 틀) 안에 위에서부터 "준비 중" 칩(`ds.chip.neutral`) · "준비 중인 기능입니다" · 소개 문장 · 만들 것 목록(`ul`, 받은 순서) · "대시보드로 돌아가기" 링크(`/dashboard`, `ds.button.secondary` 모양, 왼쪽을 가리키는 꾸밈 화살표 아이콘)가 있다. 링크·단추는 그 하나뿐이다.
- AC-305.2: Given 같은 화면, When 그리면, Then 상자 안에 글자 없는 꾸밈 선 묶음이 `aria-hidden="true"`로 있다(마지막 선만 `line-strong`, 나머지 `line`). 768px 이상(768~1023px 포함)은 상자 높이가 시안 값 420px로 정해지고 글 묶음이 가운데에 놓인다. 768px 미만은 높이가 글에 맞고, 상자 안쪽 위아래 48px + 글 묶음 안쪽 위아래 12px(좌우 16px)로 상자 위·아래 끝에서 글까지 60px(시안과 같은 거리, 간격 단계 값만 쓴다)이며 돌아가기 링크가 44px이다.
- AC-305.3: Given `NotReadyScreen` 소스와 그린 결과, When 보면, Then Supabase·문지기(`*.server`)·`fetch`·브라우저 저장소를 쓰지 않고 `'use client'`가 아니다. 앱 틀(`main`·`header`·`nav`·`.app-ui`)을 다시 그리지 않는다. 상자 안 상자가 없다(`nestedBoxes`). `overflow-hidden` 클래스를 쓰지 않는다.
- AC-305.4: Given 준비 중 기능 자료 `NOT_READY_FEATURES`, When 읽으면, Then 10개가 탭 순서대로 주소·이름이 아래 표와 같고, 항목마다 소개 문장이 비어 있지 않고 만들 것이 하나 이상(빈 글자 없음)이다. 주소록 항목은 시안 문구 그대로다: 소개 "거래처와 업체 연락처를 한곳에 모아 둘 자리예요. 만들어지면 이 탭에서 바로 쓸 수 있어요.", 만들 것 "거래처" · "수리·관리 업체" · "뉴메디코어 연락처". `notReadyFeature(주소)`는 그 주소의 항목을 돌려준다.
  - `/stats` 통계 · `/notices` 고시·공지 · `/patients` 환자 · `/revenue` 매출 · `/ai-report` AI 리포트 · `/forms` 서식 · `/staff` 직원 · `/worklog` 업무일지 · `/inventory` 재고 · `/contacts` 주소록
- AC-305.5: Given 준비 중 주소 10개, When `src/app/(app)/<주소>/page.tsx`를 그리면, Then 각각 `notReadyFeature(<주소>)`를 준 `NotReadyScreen`과 같고 h1이 표의 이름이다.
- AC-305.6: Given 준비 중 주소 10개, When 문지기(`decideRoute`)에 넣으면, Then 로그인 안 함 → `/login`, 병원 줄 없음 → `/signup`, 대기·거절 → `/pending`, 승인 → 그대로 연다(`null`). 페이지 파일은 `src/app/(app)/` 아래에 있어 앱 틀과 승인 검사(`(app)/layout`)를 받는다.

### REQ-306: 대시보드 브리핑 (`components/dashboard/briefing/`의 `DashboardHome`)
- AC-306.1: Given `DashboardHome`에 오늘 한국 날짜(`today`, 'YYYY-MM-DD'), When 그리면, Then 맨 위 날짜 줄(`p`, small muted)이 "{월}월 {일}일 {요일}요일"이고 날짜 글자만 600 `ink`다(예: "10월 31일 토요일"). 그날이 그 달의 마지막 날이면 뒤에 "·"(`faint`, 좌우 8px) + "이번 달 마지막 날"이 붙고, 아니면 덧말이 없다. 날짜·요일 계산은 `lib/analytics/dates.ts`를 쓴다.
- AC-306.2: Given 연결 전(`report`가 `null`), When 그리면, Then 날짜 줄 아래 위에서부터 h1 "비트 PC를 연결하면 오늘 숫자가 여기에 채워집니다"(display-m 600, 폰 heading-m, `text-balance`) → 안내 문장 "아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 큰 문장 자리에 오늘의 보고 문장이 올라옵니다."(lead `ink-2`) → [비트 PC 연결 시작] 링크(`/claim/setup`, `ds.button.primaryLarge` + 오른쪽 꾸밈 `arrow` 16, 폰 전체 폭) → 안심 줄 "환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 합니다."(caption muted, 앞에 꾸밈 `shield` 14 `positive`)가 있다. 화면의 h1은 이것 하나다.
- AC-306.3: Given 연결 전, When 그리면, Then 브리핑 오른쪽 칸에 머리 "연결 순서" · "5단계"와 순서 목록(`ol`) 다섯 줄이 있다: 번호 상자(1~5) + 이름 "크롬 확장 프로그램 설치" · "도우미 설치" · "연결" · "비트 자료 읽기" · "요양기관기호 확인". 아래 줄은 "설정의 비트 PC 연결 화면이 한 단계씩 안내해요."다. 단계 칩("지금 할 일"·"대기")과 지금 단계 강조가 없다(대시보드는 연결 상태를 판정하지 않는다). 768px 미만에서는 같은 목록이 처음 접힌 `<details>` 안에 있고, 요약 줄은 "연결 순서 5단계"(body 600) + "처음은 크롬 확장 프로그램 설치"(caption muted) + 꺾쇠 `chev`(열리면 180° 회전, 150ms), 아래 줄은 "연결은 비트 PC의 크롬에서 해요. 설정의 비트 PC 연결 화면이 한 단계씩 안내해요."다.
- AC-306.4: Given 768px 미만 연결 전, When 위의 [비트 PC 연결 시작]이 화면 밖으로 나가면(IntersectionObserver), Then 아래에 붙는 줄(`sticky bottom-0`, `surface`, 위 1px `line`)의 [비트 PC 연결 시작](`/claim/setup`, 전체 폭)이 아래에서 올라오며(200ms) 보이고, 다시 보이면 숨는다. 숨은 동안은 `invisible`·`aria-hidden="true"`이고 링크가 Tab 차례에 없다(`tabIndex={-1}`). IntersectionObserver가 없는 브라우저에서는 숨은 채로 둔다. 768px 이상(`md:hidden`)과 연결 뒤에는 이 줄이 없다.
- AC-306.5: Given 연결 뒤(`report`가 있음), When 그리면, Then 날짜 줄 아래 왼쪽 칸에 받은 `report`를 그대로 그리고, 큰 문장 · 안내 문장 · 주 단추 · 안심 줄 · 연결 순서 · 폰 아래 단추 · 전체 폭 '지금 바로 쓸 수 있어요' 줄이 없다. 오른쪽 칸(연결 순서 자리, 폰은 보고 문장 바로 다음)에 '지금 바로 쓸 수 있어요' 묶음(REQ-316의 연결 뒤 모양)이 있다. `DashboardHome`은 h1을 그리지 않는다(h1은 `report` 안에 있다).
- AC-306.6: Given 화면 폭, When 그리면, Then 1024px 이상은 12칸 격자(사이 24px)에서 브리핑 왼쪽이 1~7칸, 오른쪽이 9~12칸(위 4px)이다. 768~1023px은 왼쪽이 전체 폭(글 최대 32em)이고 오른쪽은 그 아래 전체 폭(위 32px, 연결 순서는 펼친 목록)이다. 768px 미만은 위에서 아래로 쌓인다. 대시보드 뿌리 요소는 `data-page-surface`를 달고, 본문 여백이 위 32px·아래 64px(폰 위 20px·아래 32px)이 되게 앱 틀 안쪽 여백에 더한다. 가로로 밀리지 않는다.
- AC-306.7: Given 주 단추·보조 단추·글자 단추, When 올리거나 누르면, Then 바탕·밑줄 색이 짧게 바뀌고(`transition`, 150ms) 누름에 아래 1px(`active:translate-y-px`), 단추 안 오른쪽 화살표는 올림에 오른쪽 2px(`group-hover:translate-x-0.5`)다. 이 밖의 움직임(크기·높이·여백 바뀜, `animate-*`)은 없다.
- AC-306.8: Given `components/dashboard/briefing/*`(시험 밖) 소스, When 보면, Then Supabase·문지기·`fetch`·브라우저 저장소를 쓰지 않고, `components/shell/*`·`components/dashboard/summary/*`·`components/common/notReadyFeatures.ts`·`components/claim/**`를 불러오지 않는다. `'use client'`는 폰 아래 단추 파일 하나뿐이다. 앱 틀(`main`·`header`·`nav`·`.app-ui`)을 다시 그리지 않고, 상자 안 상자가 없고(`nestedBoxes`), `overflow-hidden` 클래스를 쓰지 않는다. 그린 글자의 숫자(0–9)는 날짜 줄 · "5단계"와 번호 1~5 · REQ-316의 기능 수 글뿐이다.

### REQ-307: 탭 · 목차 · 화면 맞춤과 대시보드 조립 (갈래를 합친 뒤)
- AC-307.1: Given 합친 코드의 `MENU`와 목차 자료 `DASHBOARD_FEATURES`, When 견주면, Then 목차 이름·순서는 `MENU`에서 대시보드를 뺀 12개와 같고, 칸마다 `href`가 같은 이름 탭의 `path`와 같다.
- AC-307.2: Given `MENU`의 탭 주소 13개, When 페이지 파일을 찾으면, Then 모두 `src/app/(app)<주소>/page.tsx`가 있다.
- AC-307.3: Given 준비 중 칸(`ready: false`), When 그 주소의 페이지를 그리면, Then 같은 이름의 준비 중 자료로 그린 `NotReadyScreen`과 같다. 사용 가능 칸의 주소(`/claim`·`/claim/setup`)의 페이지는 `NotReadyScreen`을 쓰지 않는 기존 화면이다.
- AC-307.4: Given `NOT_READY_FEATURES`, 준비 중 칸, `MENU`에서 `href`가 null이고 설정이 아닌 탭, When 셋을 견주면, Then 이름·주소·순서가 모두 같다.
- AC-307.5: Given `/dashboard` 페이지와 지금의 자료 읽는 자리(늘 자료 없음), When 그리면, Then 위에서부터 날짜 줄 → 큰 문장 h1 → 연결 순서 → '지금 바로 쓸 수 있어요' 줄 → 오늘 하루 분석 → 기간별 흐름 → 기능 목차 차례이고, h1이 하나다. 분석 칸은 모두 연결 전 빈 상태다. 페이지 글자에서 고정 글자(날짜 줄 · 기간 글자 · 기간 단추 셋 · 연결 순서 번호와 "5단계" · 기능 수 글 둘 · 환자 수 추이 날짜 눈금 · 재방문 줄 이름 셋 · 처방 상위 설명 · 처방 상위 빈 줄 번호)를 빼면 숫자(0–9)가 없다.
- AC-307.6: Given 시험 안에서 자료 읽는 자리를 가짜 자료(`{ kind: 'data' }`)로 바꾼 `/dashboard`, When 그리면, Then 연결 뒤 짜임이다: 날짜 줄 아래 원장님 보고 문장(h1 = 첫 문장) + [복사], 오른쪽 칸에 '지금 바로 쓸 수 있어요'(사전점검 · [비트 PC 연결 다시 확인]), 그 아래 오늘 하루 분석(가짜 자료의 숫자) → 기간별 흐름 → 기능 목차. 큰 문장 · 주 단추 · 연결 순서 · 폰 아래 단추 · 전체 폭 '지금 바로' 줄이 없고 h1이 하나다.
- AC-307.7: Given 합친 코드, When 견주면, Then 브리핑 연결 순서 다섯 이름은 설치·연결 확인 단계(`setupSteps`가 주는 `title`)와 같은 순서·글자이고, 기능 수 글의 숫자는 `DASHBOARD_FEATURES`의 개수(12)와 사용 가능 칸 수(2)와 같다.
- AC-307.8: Given 대시보드 페이지를 본문으로 그린 `AppShell`과 준비 중 페이지를 그린 `AppShell`, When 보면, Then 대시보드 쪽만 본문 안에 `data-page-surface` 요소가 있고 `main`이 흰 바탕 클래스를 가진다(AC-303.6과 AC-306.6이 맞물린다).

### REQ-308: 그대로 두는 것
- AC-308.1: Given 이 기능의 모든 커밋, When 기준 커밋 `7754001`(feat-tab-frame에 main을 합친 커밋)과 `git diff --name-only 7754001 -- <경로>`로 견주면, Then 아래 경로에 바뀐 파일이 없다.
  - `supabase/` · `src/lib/` · `src/app/api/` · `src/app/auth/` · `src/middleware.ts` · `src/types/` · `src/workers/` · `e2e/` · `extension/` · `helper/`
  - `src/app/(app)/layout.tsx` · `src/app/(app)/admin/` · `src/app/(app)/claim/` · `src/components/claim/` · `src/components/admin/` · `src/components/auth/` · `src/components/preview/` · `src/components/landing/`
  - `src/components/charts/` 가운데 `KpiStat.tsx`·`KpiStat.test.tsx`·`StackedBarChart.tsx`·`StackedBarChart.test.tsx`(REQ-314) 밖의 파일
  - `src/components/dashboard/DashboardEmpty.tsx` · `DashboardEmpty.test.tsx` · `todayTitle.ts` · `todayTitle.test.ts`(지우지 않는다)
  - `src/components/ui/classes.ts` · `src/app/globals.css` · `src/app/globals.test.ts` · `src/app/theme.test.ts` · `package.json` · `package-lock.json` · `eslint.config.mjs` · `next.config.ts` · `vercel.json`
- AC-308.2: Given 아래 시험 파일, When 돌리면, Then 한 글자도 고치지 않고 통과한다: `src/lib/**` · `src/app/auth/**` · `src/middleware.test.ts` · `src/app/(app)/admin/page.test.tsx` · `src/app/(app)/claim/**` · `src/components/claim/**`(설치·연결 확인의 [청구·연락] 준비 중 시험 포함) · `src/components/admin/**` · `src/components/auth/**` · `src/components/preview/**` · `src/components/landing/**`(`rules.test.ts`의 움직임 금지 포함) · `src/components/charts/**`(`KpiStat.test.tsx`·`StackedBarChart.test.tsx` 밖, `rules.test.ts`의 움직임 금지 포함) · `src/components/dashboard/DashboardEmpty.test.tsx` · `src/components/dashboard/todayTitle.test.ts` · `src/app/fonts.test.ts` · `src/app/globals.test.ts` · `src/app/theme.test.ts` · `src/comments.test.ts` · `src/guardrails.test.ts`.
- AC-308.3: Given 승인된 사용자, When 문지기에 `/admin`을 넣으면, Then 지금처럼 관리자가 아니면 `/dashboard`로 보내고 관리자면 연다. 관리자 페이지는 그리기 전에 `guardPage('/admin')`을 부른다.
- AC-308.4: Given 각 Phase 끝, When `python3 ~/.claude/harness/bin/verify`를 돌리면, Then `npm test`·`npm run lint`(경고 0)·`npm run build`가 모두 통과한다.

### REQ-309: 세 폭 화면 확인 (사진·측정)
- AC-309.1: Given 127.0.0.1 개발 서버(가짜 Supabase `docs/mockups/b2b-redesign/tools/stub.mjs`, 시험 스크립트가 넣는 가짜 세션 쿠키, 모션 줄이기), When `/dashboard`·`/contacts`·`/stats`·`/claim/setup`·`/admin`(관리자, 계정 메뉴를 연 상태 포함)을 390×844·768×1024·1440×900에서 열면, Then 모두 아래가 맞다.
  - 가로 스크롤이 없다(`document.documentElement.scrollWidth`가 창 폭과 같다).
  - 1440에서 탭 13개가 한 줄에 다 들어간다(탭 줄 `scrollWidth` ≤ `clientWidth`). 390에서는 탭 띠만 옆으로 밀리고 지금 탭이 보인다.
  - `/dashboard`: 기능 목차가 390 1열 · 768 2열 · 1440 3열이고, 숫자 칸 값이 모두 "–"이며 그래프 막대와 세로 눈금 숫자가 없다(날짜 눈금은 AC-311.4대로 있다). h1이 하나다. 본문 바탕이 `surface`이고 `/contacts` 본문은 `canvas`다. 390에서 맨 위에서는 아래 붙는 단추가 숨어 있고, [비트 PC 연결 시작]이 화면 밖으로 나가게 내리면 보인다.
  - 지금 탭이 맞다(`/contacts` → 주소록, `/claim/setup` → 설정, `/admin` → 없음).
- AC-309.2: Given 세 폭 사진, When 시안(`docs/mockups/dashboard-home/index.html`, 같은 폭)과 나란히 보면, Then 짜임·칩·글자 단계·간격·정렬이 같고 겹침·잘림이 없다(design.md '시안과 다른 점'은 빼고). 다른 곳은 그 화면 파일 안에서 클래스만 고치고 보고에 적는다.
- AC-309.3: Given 확인이 끝나면, When 포트를 보면(`ss -ltnp`), Then 띄운 서버·가짜 Supabase·브라우저가 모두 멈춰 있다. 진짜 계정으로 로그인하지 않고, 스크립트와 사진은 scratchpad에만 둔다.

### REQ-310: 병렬 작업 준비와 계획 문서
- AC-310.1: Given 저장소 뿌리 `.gitattributes`, When `git check-attr merge specs/tab-frame/tdd-log.jsonl`을 돌리면, Then `merge: union`이다. 파일에는 `specs/*/tdd-log.jsonl merge=union` 한 줄(과 그 이유 주석)만 있다.
- AC-310.2: Given `docs/tab-frame/plan.md`, When 읽으면, Then 이 명세의 결정과 같다: 대시보드가 첫 화면이자 첫 탭(탭 13개 순서), 로그인하면 대시보드, 아직 없는 기능은 각자 주소의 '준비 중' 화면, 관리자는 계정 메뉴 [가입 승인], 대시보드는 1안 오늘 브리핑(큰 문장 + [비트 PC 연결 시작] + 연결 순서 · 지금 바로 쓸 수 있어요 · 오늘 하루 분석 · 기간별 흐름 · 기능 목차, 지금은 자료 없음, 연결한 뒤 짜임), 기준 시안과 메모 경로. 바뀐 옛 결정은 "2026-10-31 바뀜" 표시와 함께 무엇이 바뀌었는지 남긴다.
- AC-310.3: Given `docs/mockups/dashboard-home/index.html`과 `notes.md`, When 견주면(`cmp`), Then 총괄이 고른 최종 시안 파일(작업 공간 `mockup-dashboard-v3/index.html`·`notes.md`)과 같은 내용이고, `docs/tab-frame/plan.md`가 두 경로를 가리킨다.

### REQ-311: 오늘 하루 분석 · 기간별 흐름 (`components/dashboard/summary/`의 `DashboardAnalysis`)
- AC-311.1: Given 연결 전(`source.kind === 'none'`, 또는 `data`인데 날짜 자료가 없음), When `DashboardAnalysis`를 그리면, Then 섹션 "오늘 하루 분석"(h2 + `ds.chip.neutral` "비트 PC 연결 전") 안 숫자 줄에 네 칸이 이 순서로 있다: 오늘 환자 수 · 신환 · 재진 · 지난주 같은 요일보다. 네 칸 모두 "–" + "연결하면 보여요"이고, 줄 아래 한 줄 "연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요."(caption muted)가 있다. 원장님 보고 문장 빈 줄은 이 섹션에 없다.
- AC-311.2: Given 연결 뒤 가짜 자료, When 그리면, Then 칩과 아래 한 줄이 없고 숫자 칸은 아래와 같다.
  - 오늘 환자 수 · 신환 · 재진: 오늘 날짜 줄(`day === today`)의 `totals`(`KpiStat` 'count', 단위 "명"). 오늘 줄이 없으면 셋 다 "–" + "자료 없음".
  - 지난주 같은 요일보다: 오늘 줄이 없거나 오늘 줄이 덜 끝났으면(`partial: true`) "–" + "오늘 진료가 끝나면 비교해요". 오늘 줄이 끝났고(`partial: false`) 7일 전 줄이 없거나 덜 끝났으면 "–" + "지난주 자료가 없어요". 둘 다 끝났으면 `compareNumbers(오늘 환자 수, 7일 전 환자 수)`의 증감 글자(`formatDelta(…, '명')`, 화살표·화면 읽기 글자 포함)와 비교 이름 "지난주 {요일}요일"이다.
- AC-311.3: Given 섹션 "기간별 흐름", When 그리면, Then 머리 줄에 h2 · 기간 글자("{월}월 {일}일 – {월}월 {일}일", 어제까지 N일) · 기간 단추 묶음(`role="group"`, 이름 "기간")의 "최근 7일" · "최근 30일" · "최근 90일"이 있고 처음은 "최근 30일"만 `aria-pressed="true"`다(예: 오늘 10월 31일 → "10월 1일 – 10월 30일"). 다른 단추를 누르면 그 단추만 눌림이 되고 기간 글자와 그래프 넷이 그 기간으로 바뀐다(연결 전에도 단추는 눌리고 기간 글자와 환자 수 추이의 날짜 눈금이 바뀐다, 90일 → "8월 2일 – 10월 30일"). 숫자 줄과 보고 문장은 바뀌지 않는다.
- AC-311.4: Given 연결 전, When 그래프 넷을 그리면, Then 각 그래프는 제목(h3)과 설명이 아래와 같고 빈 틀만 있다. 빈 틀(눈금선·빈 막대 칸·빈 줄)은 `aria-hidden="true"` 꾸밈이고 세로 눈금 숫자·막대 높이·값이 없으며 차트 부품(`StackedBarChart`·`RankedBars`)을 그리지 않는다.
  - 환자 수 추이 / 신환·재진, 하루씩 / 범례 신환 · 재진 / 가로 눈금선 다섯(마지막 `line-strong`) 가운데 "비트 PC를 연결하면 이 기간의 하루하루가 막대로 그려집니다" / 그 아래 날짜 눈금 "{월}.{일}"(caption muted, 어제까지의 기간에서 7일 = 날마다 일곱 개, 30일 = 기간 첫날부터 7일마다 다섯 개, 90일 = 21일마다 다섯 개. 예: 오늘 10월 31일 → 7일 "10.24" … "10.30", 30일 "10.1 · 10.8 · 10.15 · 10.22 · 10.29", 90일 "8.2 · 8.23 · 9.13 · 10.4 · 10.25"). 날짜는 통계가 아니므로 빈 틀에도 둔다
  - 신환 재방문율 / 처음 온 환자가 다시 온 비율 / 줄 셋 "7일 안에 다시 옴" · "14일 안에 다시 옴" · "30일 안에 다시 옴", 값 "–"(`faint`)과 빈 막대 칸
  - 요일별 환자 수 / 하루 평균, 요일마다 / 빈 막대 칸 7개와 "월 화 수 목 금 토 일"
  - 처방 상위 / 많이 낸 처방 5가지가 차례로 적힙니다 / 빈 줄 다섯(번호 · 빈 칸 · "–")
- AC-311.5: Given 연결 뒤 가짜 자료와 고른 기간(어제까지 N일), When 그래프를 그리면, Then 아래와 같다(차트 부품을 불러 쓴다).
  - 환자 수 추이: `StackedBarChart`, 계열 신환(`accent`)·재진(`chart-3`), 기간 안 자료가 있는 날마다 한 칸(자료 없는 날은 칸이 없다), 덜 끝난 날(`partial`)은 '일부 기간'. 30·90일은 `dense`. 아래 날짜 글자("{월}.{일}")는 7일 날마다, 30일 기간 첫날부터 7일마다, 90일 21일마다 그날에만 붙는다.
  - 신환 재방문율: 7일 · 14일 = 기간 안 그 값이 `null`이 아닌 날들의 재방문 합 ÷ 그날들의 `cohort` 합(`formatRate` % + 비율 폭 막대). 모든 날이 `null`이면 "집계 중", 분모가 0이면 "–" + "자료 없음". 30일은 늘 "자료 없음" + "30일 기록은 아직 모으지 않아요"(막대 없음).
  - 요일별 환자 수: `StackedBarChart` 한 계열(`accent`), 월 → 일 가운데 기간 안 자료가 있는 요일만, 값 = 그 요일 자료 있는 날의 `totals.patients` 평균(버림). 그 요일에 덜 끝난 날이 있으면 '일부 기간'.
  - 처방 상위: `RankedBars`, 단위 "건", 기간 안 처방코드별 `patients` 합이 큰 5개. 이름은 그 코드가 나온 가장 최근 날의 이름.
  - 기간 안 날짜 자료가 하나도 없으면 각 그래프는 빈 틀 + 가운데 "자료 없음"이다.
- AC-311.6: Given 일부만 있는 가짜 자료(오늘 없음, 7일 전 없음, 기간 안 빠진 날, 재방문 `null`), When 그리면, Then 그 값이 필요한 칸만 빈 상태이고 나머지는 있는 자료로 그린다. 빠진 날을 0으로 채워 막대·평균·비율·증감을 만들지 않는다.
- AC-311.7: Given 화면 폭, When 그리면, Then 숫자 줄은 768px 이상 4칸 한 줄(칸 사이 1px `line` 세로선), 768px 미만 2칸 × 2줄이다. 그래프는 1024px 이상 [환자 수 추이 1~8칸 · 신환 재방문율 9~12칸] / [요일별 1~6칸 · 처방 상위 7~12칸](줄 사이 32px, 오른쪽 그래프는 왼쪽 1px `line` 세로선 + 안쪽 24px), 768~1023px 환자 수 추이 전체 / 재방문율 · 요일별 반반 / 처방 상위 전체, 768px 미만 넷을 세로로(사이 32px, 세로선 없음)다. 기간 단추는 높이 32px(폰 44px, 셋이 같은 폭으로 다음 줄 전체 폭)이고 눌린 것은 `accent-soft` 바탕 `accent-strong` 600이다. 가로로 밀리지 않는다.
- AC-311.8: Given `components/dashboard/summary/*`(시험 밖) 소스, When 보면, Then 차트 부품은 `@/components/charts/*`에서 불러오기만 하고, 날짜 계산은 `lib/analytics/dates.ts`, 증감은 `compareNumbers`를 쓴다. Supabase·문지기·`fetch`·브라우저 저장소를 쓰지 않고 `components/shell/*`·`components/dashboard/briefing/*`·`components/common/notReadyFeatures.ts`를 불러오지 않는다. 앱 틀을 다시 그리지 않고, 상자 안 상자가 없고(`nestedBoxes`), `overflow-hidden` 클래스를 쓰지 않는다. 기간 단추는 올림 바탕이 짧게 바뀌고(150ms) 눌린 표시는 바로 바뀐다. 그래프는 움직이지 않는다.

### REQ-312: 자료 읽는 자리 (지금은 늘 자료 없음)
- AC-312.1: Given `dashboardSummarySource()`, When 부르면, Then 지금은 늘 `{ kind: 'none' }`을 돌려준다. 이 파일은 Supabase·`fetch`·브라우저 저장소·서버 전용 파일을 쓰지 않고, 새 표·API·DB를 만들지 않는다.
- AC-312.2: Given 자료 모양 `SummarySource`, When 자료가 있으면, Then `{ kind: 'data', days }`이고 `days`는 이미 있는 저장 모양 `DayPayload`(`@/types/payload`)를 다시 정의하지 않고 그대로 쓴다. `isConnected(source)`는 `data`이고 `days`가 하나 이상일 때만 참이다(빈 `days`는 연결 전과 같다). `DashboardAnalysis`·`ReportBlock`은 오늘 날짜와 이 값만 받아 그린다.
- AC-312.3: Given 시험 밖 `components/dashboard/summary/*` 파일, When 소스를 보면, Then `DayPayload` 값을 만드는 코드(`schemaVersion:` 글자)와 예시 숫자 자료가 없다. 가짜 자료는 시험 파일 안에서만 만든다.

### REQ-313: 앱 화면 규칙 — 짧은 반응 허용과 새 대시보드 파일 (`docs/UI_GUIDE.md`·`ui/classes.test.ts`)
- AC-313.1: Given `docs/UI_GUIDE.md`, When 읽으면, Then '하지 마라'의 움직임 줄과 '움직임' 절이 시안 메모(`notes.md` §8)의 글과 같고(조작 요소만 · 색·투명도·작은 옮김만 · 150ms 기본과 휴대폰 아래 단추 200ms · 120~200ms 밖 금지 · `transition-all`·`delay-*`·`ease-*`·`animate-*` 금지 · 떠 있는 층은 나타날 때만 · 그래프·랜딩은 움직이지 않음 · 모션 줄이기면 모두 바로), '공통 모양 › 단추' 끝에 반응 한 줄이 있다.
- AC-313.2: Given 앱 화면 규칙 시험(`ruleBreaks`), When 클래스를 넣으면, Then `transition-*`(맨 `transition` 밖), `duration-*`(`duration-200` 밖), `delay-*`, `ease-*`, `animate-*`를 규칙 위반으로 잡고, `transition` · `duration-200` · `active:translate-y-px` · `group-hover:translate-x-0.5` · `starting:opacity-0` · `starting:-translate-y-1` · `group-open:rotate-180`은 통과시킨다. 모든 `ds` 키와 검사 목록 파일이 이 규칙을 지킨다.
- AC-313.3: Given 앱 화면 규칙 검사(간격·글자·모서리·장식·움직임)와 `ui` 금지 검사, When 검사 파일 목록을 보면, Then `src/components/dashboard/**`·`src/app/(app)/dashboard/**`의 시험 밖 파일 가운데 빠지는 것은 옛 빈 자리 `DashboardEmpty.tsx` 하나뿐이다(그 뒤 이 두 폴더에 생기는 새 파일은 저절로 검사에 든다). `ui` 참조는 `classes.ts`와 `DashboardEmpty.tsx`에만 있다.
- AC-313.4: Given 움직이지 않는 곳의 규칙 시험(차트 부품 `charts/rules.test.ts`, 랜딩 `landing/rules.test.ts`, 모션 줄이기 전역 규칙 `globals.test.ts`·`theme.test.ts`), When 돌리면, Then 고치지 않은 채 통과한다.

### REQ-314: 차트 부품 두 곳 넓히기 (`components/charts/KpiStat.tsx`·`StackedBarChart.tsx`)
- AC-314.1: Given `KpiStat`에 값 `null`과 `emptyText`, When 그리면, Then "–" 아래 글자가 `emptyText`다(예: "연결하면 보여요"). `emptyText`를 주지 않으면 지금처럼 "자료 없음"이다.
- AC-314.2: Given `StackedBarChart`에 `dense`, When 그리면, Then 막대 위 합계·상태 글자를 그리지 않고, 화면 읽기 표(`sr-only`)는 지금처럼 모든 칸의 기간·계열 값·합계·상태를 준다. `label`이 빈 칸은 아래 날짜 글자를 비운다. `dense`를 주지 않으면 지금 그림과 한 글자도 다르지 않다.
- AC-314.3: Given 두 부품을 쓰는 지금 화면(미리보기 `DashboardPreview`)과 차트 규칙 시험, When 돌리면, Then 미리보기 시험과 `charts/rules.test.ts`(훅·`'use client'`·움직임 없음)가 고치지 않은 채 통과한다.

### REQ-315: 아이콘 둘 (`components/common/Icon.tsx`)
- AC-315.1: Given `ICON_NAMES`, When 읽으면, Then 지금 16개 뒤에 `copy`(복사)·`userCheck`(가입 승인)를 더한 18개이고, 두 그림은 시안(`docs/mockups/dashboard-home/index.html`)의 [복사]·[가입 승인] 아이콘 그림과 같다(viewBox 16, 선 1.5, `currentColor`, `aria-hidden`).
- AC-315.2: Given 지금 아이콘 16개, When 그리면, Then 그림·속성이 지금과 같다(지금 시험이 이름 목록 기대만 바꾸고 통과한다).

### REQ-316: 지금 바로 쓸 수 있어요 · 기능 목차 (`components/dashboard/briefing/`)
- AC-316.1: Given 연결 전, When `DashboardHome`을 그리면, Then 브리핑 다음 섹션이 h2 "지금 바로 쓸 수 있어요" + 옆 글 "기능 12개 가운데 2개예요. 다른 하나는 위의 비트 PC 연결이에요."이고, 그 안 줄 하나(위아래 1px `line`)에 이름 칸 "청구 탭"(caption muted) · "삭감 예방 사전점검"(subtitle 600), 설명 칸 "청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요." · "청구 점검은 비트 PC의 크롬에서 엽니다.", [사전점검 열기](`/claim`, `ds.button.secondary` + 오른쪽 꾸밈 `arrow` 16)가 있다. 1024px 이상 이름 1~3칸 · 설명 4~9칸 · 단추 10~12칸(오른쪽 끝), 768~1023px 1~4 · 5~9 · 10~12, 768px 미만 쌓이고 단추 전체 폭이다.
- AC-316.2: Given 연결 뒤, When 오른쪽 칸 묶음을 그리면, Then 머리 "지금 바로 쓸 수 있어요"(small 600, 폰 title) · 오른쪽 "청구 탭"(muted) → "삭감 예방 사전점검" → 설명 "청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요." + 둘째 줄 "청구 점검은 비트 PC의 크롬에서 엽니다."(small muted) → 단추 줄 [사전점검 열기](`/claim`, `ds.button.secondary`) + [비트 PC 연결 다시 확인](`/claim/setup`, `ds.textButton`)이다. 768px 미만은 두 단추가 전체 폭으로 쌓인다. 옆 글("기능 12개 …")은 없다.
- AC-316.3: Given 목차 자료 `DASHBOARD_FEATURES`, When 읽으면, Then 12개가 탭 순서대로 이름·설명·주소·상태가 아래 표와 같다(설명에 줄바꿈 문자·숫자 없음). 사용 가능은 청구 · 설정 둘뿐이다.
  - 통계 "환자 수 추이·신환 재방문율·처방 추세·요일별 환자 수" `/stats` · 청구 "삭감 예방 사전점검·청구메모·상병 확인·월말 마감" `/claim` 사용 가능 · 고시·공지 "심평원·보건복지부·건강보험공단 새 글과 세 줄 요약" `/notices` · 환자 "다시 오실 환자 명단·정기 주사 문자 명단·문자 문구" `/patients` · 매출 "매출 추이·급여와 비급여·치료별 매출·한 사람당 평균 진료비" `/revenue` · AI 리포트 "월간보고 발표 자료·주간 요약·분기와 연간 보고" `/ai-report` · 서식 "진료일정·휴진 안내·환자 안내문·근무표·보고서 양식" `/forms` · 직원 "직원 명단·급여 계산과 명세서·연차와 휴가" `/staff` · 업무일지 "엑셀 양식과 똑같은 업무일지" `/worklog` · 재고 "물품 목록·남은 수량·부족 표시" `/inventory` · 주소록 "거래처·수리와 관리 업체·뉴메디코어 연락처" `/contacts` · 설정 "점검 규칙·병원 문구·비트 PC 연결·백업" `/claim/setup` 사용 가능 (나머지는 준비 중)
- AC-316.4: Given 연결 전이든 뒤든, When 기능 목차를 그리면, Then 섹션 h2 "기능 목차" + 옆 "12개 가운데 2개를 지금 쓸 수 있어요"(small muted) 아래 목록(`ul`, 이름 "기능")에 칸 12개가 표 순서대로 있다. 칸 하나 = 링크 하나(안에 다른 링크·단추 없음, 위 1px `line`): 1줄 이름(subtitle 600, 사용 가능 `ink` · 준비 중 `ink-2`) + 오른쪽 상태(caption 500: 준비 중 "준비 중" `faint` / 사용 가능 "사용 가능" + 꾸밈 `arrow` 14 `accent`), 2줄 설명(small muted). 올림에 이름 `accent`·화살표 오른쪽 2px, 누름 아래 1px, 초점 고리 안쪽(-2px), 색 150ms. 1024px 이상 3열(사이 24px) · 768~1023px 2열 · 768px 미만 1열(칸 높이 56px 이상)이다. 칸마다 테두리 상자가 없다.

### REQ-317: 원장님 보고 문장 (연결 뒤 큰 문장 자리, `components/dashboard/summary/`의 `ReportBlock`)
- AC-317.1: Given 연결 뒤 가짜 자료에 오늘 줄이 있음, When `ReportBlock`을 그리면, Then 머리 줄 "원장님 보고 문장"(small 600 `ink`) 왼쪽 · [복사] 오른쪽, 그 아래 h1 = 보고 문장의 첫 문장(display-m 600, 폰 heading-m, `text-balance`), 그 아래 나머지 문장(lead `ink-2`), 안심 줄 "보고 문장은 숫자만 쓰고 환자 이름은 쓰지 않아요."(앞에 꾸밈 `shield` 14 `positive`)다. 보고 문장은 design.md '보고 문장 틀'대로 오늘 줄의 `totals`(와 끝난 날이면 7일 전 비교)만으로 만들고 첫 문장은 처음 "다."까지다. 이름·차트번호·처방 이름이 들어가지 않는다.
- AC-317.2: Given 보고 문장이 있는 [복사](`ds.button.secondarySmall` + 꾸밈 `copy` 14, 최소 폭 112px), When 누르면, Then 보고 문장 전부가 `navigator.clipboard.writeText`에 가고, 성공하면 2초 동안 단추 글자가 꾸밈 `check` 14(`positive`) + "복사했어요"로 바뀌었다가 "복사"로 돌아오며 화면 읽기 자리(`aria-live="polite"`)에 "복사했어요"가 나온다. 쓰기가 실패하거나 `navigator.clipboard`가 없으면 그 자리에 "복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요."가 보인다. 단추 폭은 글자가 바뀌어도 흔들리지 않는다.
- AC-317.3: Given 연결 뒤인데 오늘 줄이 없음, When 그리면, Then h1 "오늘 받은 진료 자료가 아직 없어요"와 안내 "오늘 자료가 들어오면 이 자리에 보고 문장이 올라와요."(lead `ink-2`)가 있고, [복사]는 막힘(`aria-disabled="true"`, 눌러도 클립보드를 부르지 않음)이며 `aria-describedby`로 툴팁(`role="tooltip"`) "문장이 생기면 복사할 수 있어요"를 가리킨다. 툴팁은 올림·초점에 보이고 나타날 때만 투명 → 보임 + 아래 2px에서 제자리로 150ms다.
- AC-317.4: Given `ReportBlock` 소스, When 보면, Then 문장 만들기는 순수 함수(`reportSentence`, React 없음)이고 숫자 글자는 `formatCount`, 요일은 `lib/analytics/dates.ts`를 쓴다. 복사 결과 문구는 이 파일 안에 둔다(로그인 화면 [주소 복사]와 같은 방식, `lib/errors.ts`를 고치지 않는다). 브라우저 저장소·네트워크를 쓰지 않는다.

## 범위 밖
- 각 기능의 실제 내용(통계 화면·고시 가져오기·환자 명단·매출·AI 리포트·서식·직원·업무일지·재고·주소록·설정 화면). 기능마다 따로 명세를 쓴다.
- 대시보드의 진짜 자료 연결(저장 표·RLS·읽기·파일 올리기·비트 PC 연결)과 "오늘 진료 끝" 표시를 만드는 일. 다음 통계 명세다. 30일 재방문 값 모으기도 그 명세다.
- 대시보드에서 비트 PC 연결 상태 판정(연결 순서의 "지금 할 일"·"대기" 칩, `useBridge`). 판정은 `/claim/setup`에만 있다.
- 다른 화면(`/claim`·`/claim/setup`·`/admin`·인증 화면)의 단추에 짧은 반응 넣기와 `ds`에 반응 클래스·새 키(기간 단추 묶음 등) 더하기. 이번에는 이 명세의 화면 파일 안 클래스로만 둔다.
- 차트 부품의 그림 높이·폭별 크기 바꾸기(시안의 200·150px 그림 높이는 연결 전 빈 틀에만 쓴다), REQ-314 밖의 차트 부품 고치기.
- 대시보드의 발주 알림 등 그 밖의 숫자(plan.md의 "오늘 숫자" 가운데 이번에 넣지 않은 것). 보고 문장을 AI로 만들기.
- `/settings` 화면과 설정 탭 안 메뉴(사전점검 명세의 설정 TASK 몫). 이번에는 만들지 않는다.
- 옛 빈 자리 `DashboardEmpty.tsx`·`todayTitle.ts`와 그것만 쓰는 옛 `ui` 키 지우기(총괄 확인 뒤 다음 명세).
- 탭 순서를 사람마다 바꾸기, 탭 숨기기, 역할별 탭(쓰는 사람은 총괄 혼자다). 휴대폰 탭 띠 끝 흐림.
- 로그인·가입·승인 흐름, 문지기 규칙, DB·RLS, API 바꾸기.
- 운영 사이트에 올리기와 합치기(총괄이 따로 말할 때만).
