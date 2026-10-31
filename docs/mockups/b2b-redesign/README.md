# B2B 디자인 개편 시안 (승인본 기록)

모든 화면(랜딩·로그인·가입 신청·승인 대기·거절·대시보드·관리자)을 한 벌의 디자인 규칙으로 다시 그린 시안의 **원본 소스**입니다.
구현할 때 마크업·CSS 값을 그대로 읽어 보려고 저장소에 남깁니다. 앱 코드가 아니며, 시험·빌드에 쓰이지 않습니다.

- 승인: 2026-10-30, 사용자가 "진행해"로 승인
- 게시본(보는 곳): https://claude.ai/artifact/574fyw1mAQmqBw4jWjhr6f
- 명세: `specs/b2b-redesign/` (요구사항·설계·작업 분할)

## 파일

| 파일 | 내용 |
|---|---|
| `screens.mjs` | 화면별 마크업. `landingPC`·`landingPhone`·`loginPC`·`loginPhone`·`signupBody`·`pendingBody`·`rejectedBody`·`dashboardPC`·`dashboardPhone`(빈 상태는 `{ empty: true }`)·`adminPC`·`adminPhone`, 미리보기 `preview` |
| `parts.mjs` | 공통 조각: 아이콘, 로고, 구글 G 마크, 예시 숫자(`WEEKS`·`KPI`·`RX`·`REGIONS`), 차트 그림(`barsChart`·`spark`·`rxBar`·`regionsChart`), 앱 위쪽 띠·탭 |
| `style.css` | 시안 CSS. 맨 위 `:root`가 디자인 토큰(색), 그 아래 글자 단계·단추·칩·표·화면별 규칙 |
| `build.mjs` | 위 파일들을 묶어 게시본 `index.html`을 만들던 스크립트. 경로가 그때 임시 폴더를 가리켜 그대로는 돌지 않습니다 |
| `page.js` | 게시본 페이지의 확대 보기·크기 맞춤 스크립트(시안 화면과 상관없음) |
| `tools/stub.mjs` | 화면 사진용 가짜 Supabase(127.0.0.1:54399). 로그인이 필요한 화면을 실제 계정 없이 그릴 때만 씁니다 |
| `tools/shoot.mjs` | Playwright로 화면 사진을 찍던 스크립트(사진 폴더 경로는 바꿔서 씀) |

## 주의

- 게시본 `index.html`(약 1.3MB)과 그 안에 넣었던 글꼴 파일은 저장소에 넣지 않았습니다. 화면은 위 게시본 주소에서 봅니다.
- 시안의 숫자는 모두 **예시**입니다. 실제 대시보드는 자료가 생기기 전까지 빈 상태를 보입니다.
- 시안에 있는 번호 핀(1, 2, 3…)과 "지금/개편 후" 비교 칸은 설명용이라 구현하지 않습니다.
- `build.mjs`·`page.js` 맨 위의 `eslint-disable` 한 줄은 저장소 검사 경고를 늘리지 않으려고 넣었습니다(내용은 승인본 그대로).
- `tools/`의 가짜 Supabase와 가짜 세션 쿠키는 내 컴퓨터(127.0.0.1)에서 사진을 찍을 때만 씁니다. 앱 코드에 시험용 로그인 길을 만들지 않습니다(CLAUDE.md 보안 규칙).
