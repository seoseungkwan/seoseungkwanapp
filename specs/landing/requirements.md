# 요구사항: 랜딩 페이지

> 기능 ID: `landing` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- 다른 의원 유치용 랜딩을 `/`에 만든다 (plan.md §2-10). 2026-10-28에 사용자가 승인한 목업을 그대로 옮긴다
- 기준: `docs/mockups/landing/landing-mockup.dc.html`(값·문구·순서), `docs/UI_GUIDE.md`(색·글자·움직임 규칙). 화면으로 볼 때는 캔버스 링크(UI_GUIDE 머리말)
- 사용자 결정(2026-10-28): [구글로 시작하기]는 `/login`으로 보낸다. 스타일링은 CSS Modules. CSP·보안 헤더는 로그인 기능 때 옮긴다
- 화면 속 숫자는 모두 예시다. 모르는 값은 `[ ]` 빈칸으로 둔다

## 요구사항

### REQ-001: 섹션 순서와 메뉴
- AC-001.1: Given `/` 페이지를 서버에서 그리면, When 마크업을 보면, Then `header` → `#top`(히어로) → 핵심 약속 띠(`aria-label="핵심 약속"`) → `#ai` → `#ortho` → `#features` → `#privacy` → `#how` → `#start` → `footer` 순서로 있다
- AC-001.2: Given 위쪽 메뉴(`nav aria-label="주요 메뉴"`), When 링크를 보면, Then [AI 분석]`#ai` · [기능]`#features` · [개인정보 보호]`#privacy` · [시작 방법]`#how` 4개가 있고, 페이지 안의 모든 `#` 링크는 페이지에 있는 id를 가리킨다
- AC-001.3: Given 페이지, When 제목을 세면, Then `h1`은 하나뿐이고 글자는 "숫자로 보는 우리 의원"이다

### REQ-002: 시작 버튼
- AC-002.1: Given 페이지, When [구글로 시작하기] 링크를 찾으면, Then 메뉴·히어로·시작하기 섹션에 하나씩 모두 3개이고 셋 다 `href="/login"`이다
- AC-002.2: Given 히어로, When [AI 분석 보기]를 보면, Then `href="#ai"`이다

### REQ-003: 히어로 차트 값
- AC-003.1: Given `heroFrame(0)`, When 값을 보면, Then 오늘 외래 128, 신환율 `'18.2'`, 도넛 18, 막대 `[22, 35, 41, 52, 60, 74]`이다 (목업 값)
- AC-003.2: Given 틱 t, When `heroFrame(t)`를 부르면, Then 오늘 외래는 `[128, 129, 131, 132, 134, 135, 137, 138]`을 8개 주기로, 신환율 `['18.2', '18.4', '18.6', '18.4']`·도넛 `[18, 24, 31, 27]`·막대 4묶음은 4개 주기로 돈다 (예: t=5 → 135 · '18.4' · 24 · 둘째 막대 묶음 `[30, 38, 49, 58, 71, 82]`, t=8 → 128 · '18.2' · 18 · 첫째 묶음)
- AC-003.3: Given 히어로 차트를 서버에서 그리면, When 마크업을 보면, Then 틱 0 값(128, 18.2%, 도넛 18%, 막대 6개 높이 22%~74%)과 "숫자는 예시" 칩, 떠 있는 카드 3개(오늘 외래·신환율·AI 한 줄 요약)가 보인다

### REQ-004: 움직임과 모션 줄이기
- AC-004.1: Given 모션 줄이기가 꺼져 있을 때, When `startHeroTicker`를 시작하면, Then 2600ms마다 `onTick(1)`, `onTick(2)` … 순서로 부르고, 돌려받은 정리 함수를 부르면 더 부르지 않는다
- AC-004.2: Given 모션 줄이기가 켜져 있을 때(`reduce: true`), When `startHeroTicker`를 시작하고 시간이 지나도, Then `onTick`을 한 번도 부르지 않는다 (차트는 틱 0 그대로 읽힌다)
- AC-004.3: Given `src/app/globals.css`, When 내용을 보면, Then `@media (prefers-reduced-motion: reduce)` 안에서 모든 요소의 `animation`과 `transition`을 끈다

### REQ-005: 정한 문구와 빈칸
- AC-005.1: Given 페이지, When 글자를 보면, Then 사용자가 정한 문구가 그대로 있다: "통증 의원 관리자를 위한 AI 업무 도구", "환자 개인정보는 병원 PC 밖으로 나가지 않습니다"(히어로), "환자 개인정보는 절대 병원 PC 밖으로 나가지 않습니다"(개인정보 섹션 제목), 개인정보 섹션의 큰 숫자 "0"과 단위 "건", "EMR", 타일 설명 "주사 치료 수와 F/U 기록"·"물리치료 내원 환자 수"·"비급여 치료 내역"·"한 장으로 받는 월간 보고"
- AC-005.2: Given 페이지, When 아직 정하지 않은 값을 보면, Then 서비스 이름은 `[서비스 이름]`(메뉴 로고·푸터), 문의 메일은 `[이메일 주소]`로 비워 두고, 예시 숫자 영역에는 "숫자는 예시"(히어로)·"방금 생성 · 예시"(AI 리포트) 표시가 있다
- AC-005.3: Given 페이지와 `src/app/globals.css`·`src/components/landing/*.module.css`, When 보면, Then "Powered by AI" 글자가 없고 그라데이션 글자(`background-clip: text`)가 없다

### REQ-006: 그림
- AC-006.1: Given 페이지, When `img`를 보면, Then 6장이 `/landing/tile-injection.jpg`·`tile-physio.jpg`·`tile-noncovered.jpg`·`tile-report.jpg`·`feature-stats.jpg`·`feature-payroll.jpg` 경로로 나오고, 각각 목업과 같은 빈칸 아닌 `alt`가 있으며, `http`로 시작하는 바깥 주소 그림이 없다
- AC-006.2: Given `public/landing/`, When 파일을 보면, Then 위 6개 파일이 있고 승인본 `docs/mockups/landing/images/`의 같은 이름 파일과 내용(sha256)이 같다

### REQ-007: 랜딩은 아무것도 받지 않는다
- AC-007.1: Given 페이지, When 마크업을 보면, Then `form`·`input`·`textarea`·`button`이 없다 — 목업의 "통계 파일을 여기에 놓기"·"AI에게 질문"·질문 칩은 그림처럼 보이기만 하고 파일·글을 받지 않는다

### REQ-008: 접근성
- AC-008.1: Given 페이지, When `svg`를 보면, Then 모두 `aria-hidden="true"`다 (꾸밈·예시 차트. 숫자는 떠 있는 카드 글자로 읽힌다)

## 범위 밖
- CSP·보안 헤더 (로그인 기능 때 파일럿에서 옮긴다 — 사용자 결정)
- `/login` 화면·구글 로그인·가입 신청 (다음 기능)
- 배포 (로그인이 생기기 전에는 공개 배포하지 않는다)
- 히어로 영상 (사용자가 코드 차트로 바꿈. 영상은 저장소 밖 `~/seoseungkwan/landing-approved/unused/`)
- 다크 모드, E2E 도구 선택, 서비스 이름·문의 메일 확정, Higgsfield 상업 이용 약관 확인(plan.md §6-6, 공개 전에 사용자가 확인)
