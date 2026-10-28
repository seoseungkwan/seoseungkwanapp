# 요구사항: 로그인·가입 승인·관리자·대시보드 틀

> 기능 ID: `auth` · 형식: 요구사항은 `### REQ-001: 제목`, 수용 기준은 `- AC-001.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다.

## 배경 / 목표
- plan.md §9-2 "로그인·승인·관리자 화면·대시보드 틀"을 만든다. 흐름은 plan.md §2-1, 규칙은 §5·§6
- 화면 기준: 2026-10-28 사용자가 승인한 목업 `docs/mockups/auth/*.dc.html`(문구·순서·색). 캔버스: https://claude.ai/artifact/KS65LvXErcJ7dCqNyxMz3c. 색·글자 규칙은 `docs/UI_GUIDE.md`
- 이식 원본: 파일럿 `seoseungkwan/tonggye-bunseok` main `fbb303a`의 `src/lib/supabase`·`src/lib/auth`·`src/components/auth`·`src/components/common/ErrorCard`·`src/app/auth/callback`·`src/middleware.ts`·`src/lib/csp.ts`·`supabase/` (ADR-002)
- 사용자 결정(2026-10-28)
  - 인증만 서버 코드 예외로 둔다: 로그인 콜백 `/auth/callback`, middleware(세션 갱신·로그인 여부), 페이지 그리기 전 상태 확인. 이 서버 코드는 세션과 내 병원 줄만 다루고 다른 데이터는 읽지 않는다 (ADR-004 고침)
  - 가입 칸은 목업 그대로: 병원 이름·신청자 이름·연락처(선택)·동의. 요양기관번호는 받지 않는다
  - 실제 로그인 E2E(Playwright)와 새 Supabase·구글 OAuth 설정은 다음 단계로 나눈다. 이번에는 단위 시험과 DB 권한 시험(PGlite)까지
- 목업에서 물었지만 답이 없던 것은 목업 상태 그대로: 승인한 계정 막기 없음, 대시보드 숫자 움직임 없음, 아직 없는 메뉴는 누를 수 없음("준비 중" 표시 없음)

## 요구사항

### REQ-001: Supabase 연결 설정
- AC-001.1: Given `NEXT_PUBLIC_SUPABASE_URL`·`NEXT_PUBLIC_SUPABASE_ANON_KEY`, When `supabaseEnv()`를 부르면, Then URL은 origin만 남기고, 값이 비었거나 https가 아니면(localhost·127.0.0.1의 http는 허용) 값을 드러내지 않는 오류를 던진다. 모듈을 import할 때는 값을 읽지 않는다
- AC-001.2: Given 서버 클라이언트, When 만들면, Then 요청마다 `cookies()`로 새로 만들고, Server Component에서 쿠키 쓰기가 실패해도 던지지 않는다. 브라우저 클라이언트는 하나만 만든다
- AC-001.3: Given middleware 세션 갱신, When 요청이 오면, Then 클라이언트를 만든 바로 뒤 `getUser()`를 부르고, 갱신된 쿠키를 요청·응답 양쪽에 옮기고, 응답에 `Cache-Control: private, no-store`를 붙인다. 서버에서 `getSession()`을 믿지 않는다

### REQ-002: 경로 문지기
- AC-002.1: Given `/`·`/login`·`/auth/callback`·정적 파일, When 로그인하지 않은 사람이 열면, Then 그대로 연다. 그 밖의 경로는 `/login`으로 보낸다
- AC-002.2: Given 로그인했고 병원 줄이 없음, When `/signup` 밖의 앱 경로(`/login`·`/pending`·`/dashboard`·`/admin`)를 열면, Then `/signup`으로 보낸다
- AC-002.3: Given 병원 상태가 `pending` 또는 `rejected`, When `/pending` 밖의 앱 경로를 열면, Then `/pending`으로 보낸다
- AC-002.4: Given 병원 상태가 `approved`, When `/login`·`/signup`·`/pending`을 열면, Then `/dashboard`로 보낸다. `/dashboard`는 그대로 연다
- AC-002.5: Given 승인된 사람, When `/admin`을 열면, Then `admins`에 있으면 열고 없으면 `/dashboard`로 보낸다
- AC-002.6: Given `/` 랜딩, When 로그인 여부·병원 상태가 무엇이든, Then 그대로 연다
- AC-002.7: Given middleware matcher, When 경로를 대 보면, Then `_next/`·`favicon.ico`·`landing/`·`fake-sample/`·그림·영상 확장자(`.mp4` 포함)는 middleware를 거치지 않고, 나머지는 거친다
- AC-002.8: Given 서버에서 내 병원 줄을 읽다가 실패, When 페이지를 그리면, Then 로그인·대시보드로 돌려보내지 않고 오류 화면(`E-PAGE-FAILED`)을 보인다 (돌림 고리 방지)

### REQ-003: 구글 로그인·콜백·로그아웃
- AC-003.1: Given `/login`, When [구글로 시작하기]를 누르면, Then `signInWithOAuth({ provider: 'google' })`를 `redirectTo = <현재 origin>/auth/callback`으로 부르고, 누른 동안 버튼을 막는다. 뒤로 가기 캐시로 돌아오면 버튼을 다시 푼다
- AC-003.2: Given 카카오톡·네이버·인스타그램 등 인앱 브라우저, When `/login`을 열면, Then 구글 버튼 대신 "크롬·엣지에서 열어 주세요" 안내와 [주소 복사]를 보인다
- AC-003.3: Given `/auth/callback?code=…`, When 코드 교환이 성공하면, Then 같은 origin의 `/dashboard`로 보낸다. `next`·`redirect`·`returnTo` 같은 값은 무시한다
- AC-003.4: Given 코드가 없거나 교환이 실패, When 콜백을 처리하면, Then `/login?error=1`로 보내고 오류 내용을 응답·로그에 남기지 않는다
- AC-003.5: Given `/login?error=1`, When 화면을 그리면, Then 목업 '로그인 실패'처럼 "구글 로그인을 마치지 못했어요" 카드와 오류 번호 `E-AUTH-CALLBACK`, [다시 구글로 시작하기]를 보인다. `signInWithOAuth`가 오류를 돌려주면 같은 카드에 `E-AUTH-START`를 보인다
- AC-003.6: Given 로그아웃 또는 [다른 계정으로 로그인], When 누르면, Then `signOut()`을 부르고(실패해도) `/login`으로 새로 연다(`location.assign`)
- AC-003.7: Given 오류 화면(`E-PAGE-FAILED`), When 화면을 그리면, Then [다시 시도] 옆에 [로그아웃]이 있고, 누르면 AC-003.6처럼 로그아웃한 뒤 `/login`으로 새로 연다 (오류가 이어져도 화면에 갇히지 않게, 사용자 결정 2026-10-28)

### REQ-004: 가입 신청
- AC-004.1: Given 가입 신청 값, When `validateSignup`을 부르면, Then 병원 이름은 앞뒤 공백을 빼고 1~50자, 신청자 이름은 1~30자(글자 수는 코드포인트), 연락처는 비워도 되고 넣으면 공백·`-`를 뺀 9~11자리 숫자, 동의는 꼭 체크다. 틀린 칸마다 칸 아래에 보일 문구를 돌려준다
- AC-004.2: Given `/signup`, When 화면을 그리면, Then 로그인한 구글 이메일을 바꿀 수 없게 보이고, 병원 이름·신청자 이름(필수)·연락처(선택)·동의(필수) 칸과 [가입 신청]·[다른 계정으로 로그인]이 목업 순서대로 있다
- AC-004.3: Given 맞는 값, When [가입 신청]을 누르면, Then `hospitals`에 `name`·`applicant_name`·`phone`(없으면 null)만 넣고, 성공하면 `/pending`으로 바꾼다. 두 번 눌러도 한 번만 보낸다. 같은 계정 줄이 이미 있다는 오류(23505)는 성공으로 본다
- AC-004.4: Given 저장 실패, When [가입 신청]을 누르면, Then 넣은 값을 그대로 두고 `E-SIGNUP-FAILED` 카드를 보인다

### REQ-005: 승인 대기·거절 화면
- AC-005.1: Given 상태 `pending`, When `/pending`을 그리면, Then "신청을 확인하고 있습니다"와 보낸 신청 내용(신청일·병원 이름·신청자·구글 계정·연락처), [상태 다시 확인]·로그아웃을 보인다
- AC-005.2: Given [상태 다시 확인], When 누르면, Then 페이지를 새로 그린다(`router.refresh()`). 승인됐으면 문지기가 `/dashboard`로 보낸다
- AC-005.3: Given 상태 `rejected`, When `/pending`을 그리면, Then "가입이 승인되지 않았습니다"와 문의 안내, 보낸 신청 내용, [다른 계정으로 로그인]·로그아웃을 보이고 [상태 다시 확인]은 없다

### REQ-006: DB 권한 (RLS·승인 함수)
- AC-006.1: Given `anon`, When `hospitals`·`admins`를 읽거나 쓰려 하면, Then 모두 거부된다
- AC-006.2: Given 로그인한 사용자, When `hospitals`를 읽으면, Then 자기 줄만 보인다. 넣을 때는 `name`·`applicant_name`·`phone`만 넣을 수 있고, `owner_id`는 자기 uid, `email`은 로그인 토큰의 이메일, `status`는 `pending`이 DB 기본값으로 들어간다. 다른 `owner_id`·`status`·`email`을 넣으려 하면 거부된다
- AC-006.3: Given 로그인한 사용자, When 자기 `hospitals` 줄을 고치거나 지우려 하면(상태 포함), Then 거부된다. 한 계정은 줄을 하나만 만들 수 있다
- AC-006.4: Given `admins`에 있는 사용자, When `hospitals`를 읽으면, Then 모든 병원 줄이 보인다. `admins` 표는 자기 줄만 읽을 수 있고 아무도 쓸 수 없다(처음 줄은 SQL 편집기로 넣는다)
- AC-006.5: Given `set_hospital_status(hospital_id, status)`, When `admins`에 없는 사용자가 부르면, Then 오류가 나고 아무 줄도 바뀌지 않는다
- AC-006.6: Given 관리자, When `set_hospital_status`를 부르면, Then `pending→approved`·`pending→rejected`·`rejected→pending`만 되고 그 밖의 바꿈(예: `approved→rejected`, 없는 병원)은 오류가 난다. 바꾸면 `reviewed_at`이 기록된다
- AC-006.7: Given 이 마이그레이션, When 표를 만들면, Then 모든 표에 RLS가 켜져 있고 `anon`·`authenticated`의 기본 권한을 먼저 회수한 뒤 필요한 것만 준다. 함수는 `security definer`·`search_path = ''`이고 `authenticated`만 부를 수 있다

### REQ-007: 관리자 · 가입 신청 목록
- AC-007.1: Given `/admin`, When 그리면, Then 대기·승인·거절 탭에 줄 수가 보이고, 표에 신청일·병원 이름·신청자·이메일·연락처·동작 칸이 있다. 처음 탭은 대기다
- AC-007.2: Given 대기 줄, When [승인]을 누르면, Then `set_hospital_status(id, 'approved')`를 부르고 성공하면 줄이 승인 탭으로 옮겨지고 "○○ 신청을 승인했습니다." 줄을 보인다
- AC-007.3: Given 대기 줄, When [거절]을 누르면, Then 확인 창("이 신청을 거절할까요?")을 먼저 띄우고, [취소]면 아무것도 안 하며, [거절]이면 `'rejected'`로 바꾼다
- AC-007.4: Given 거절 줄, When [되돌리기]를 누르면, Then `'pending'`으로 바꾸고 "○○ 신청을 대기로 되돌렸습니다."를 보인다. 승인 줄에는 동작 버튼이 없다(승인됨 표시만)
- AC-007.5: Given 빈 탭, When 그 탭을 보면, Then 목업의 빈 탭 안내(예: "대기 중인 신청이 없습니다")를 보인다
- AC-007.6: Given 함수 호출 실패, When 버튼을 누르면, Then 줄 상태는 바뀌지 않고 `E-ADMIN-FAILED` 카드를 보인다

### REQ-008: 앱 틀 (메뉴·위쪽 띠)
- AC-008.1: Given 승인된 사용자의 앱 화면, When 그리면, Then 왼쪽 메뉴에 대시보드·통계·AI 리포트·매출·재고·급여·일일마감·보고·월간 PDF·설정이 목업 순서로 있고, 지금 화면은 `aria-current="page"`다. 아직 없는 화면(대시보드·관리자 밖)은 링크가 아니라 누를 수 없는 항목이다
- AC-008.2: Given 관리자, When 메뉴를 그리면, Then 구분선 아래 [관리자]가 `/admin` 링크로 있다. 관리자가 아니면 없다
- AC-008.3: Given 위쪽 띠, When 그리면, Then 내 병원 이름과 로그인한 구글 이메일이 보이고, 계정 단추를 누르면 메뉴(관리자면 "관리자 계정" 표시)에 로그아웃이 있다
- AC-008.4: Given 폰 폭(768px 미만), When 앱 화면을 보면, Then 왼쪽 메뉴 대신 [메뉴 열기] 단추가 보이고, 누르면 메뉴 서랍이 열리고 [메뉴 닫기]·바깥 누름으로 닫힌다

### REQ-009: 대시보드 첫 화면
- AC-009.1: Given `/dashboard`, When 그리면, Then 'TODAY'와 한국 날짜 제목(예: "2026년 10월 28일 (수)", `todayInKorea` 기준)을 보인다
- AC-009.2: Given 아직 통계 기능이 없음, When `/dashboard`를 그리면, Then 목업 '대시보드 첫 화면'처럼 "아직 올린 통계 파일이 없습니다" 안내, 빈 숫자 카드 4개(오늘 외래·신환·재진·신환율, 값 "—"), 발주 알림 빈 안내를 보인다. [통계 파일 올리기]·[재고 등록하기]는 아직 누를 수 없다. 예시 숫자는 보이지 않는다

### REQ-010: 30분 자동 로그아웃
- AC-010.1: Given 앱 화면, When 30분 동안 누름·키·스크롤·화면 보이기 바뀜이 없으면, Then 한 번만 `signOut()` 뒤 `/login`으로 새로 연다
- AC-010.2: Given 30분 전에 움직임이 있으면, When 시간이 지나면, Then 그 때부터 다시 30분을 센다. 같은 브라우저의 다른 탭에서 움직여도 다시 센다(BroadcastChannel). 브라우저 저장소는 쓰지 않는다
- AC-010.3: Given 앱 화면을 떠나면(unmount), When 시간이 지나도, Then 타이머·이벤트·채널이 모두 풀려 로그아웃하지 않는다

### REQ-011: 보안 헤더·CSP
- AC-011.1: Given `buildCsp(isDev, supabaseUrl)`, When 운영 값을 만들면, Then `default-src 'self'`, `script-src 'self' 'unsafe-inline'`, `style-src 'self' 'unsafe-inline'`, `img-src 'self' data: blob:`, `font-src 'self'`, `media-src 'self'`, `connect-src 'self' <supabase origin>`, `worker-src 'self' blob:`, `object-src 'none'`, `base-uri 'self'`, `form-action 'self'`, `frame-ancestors 'none'`이고 와일드카드가 없다. 개발 값만 `'unsafe-eval'`·`ws:`를 더한다
- AC-011.2: Given `next.config.ts`, When 헤더를 보면, Then 모든 경로에 CSP·`X-Content-Type-Options: nosniff`·`Referrer-Policy: no-referrer`·`X-Frame-Options: DENY`가 있다

### REQ-012: 오류 문구
- AC-012.1: Given `E-AUTH-CALLBACK`·`E-AUTH-START`·`E-SIGNUP-FAILED`·`E-ADMIN-FAILED`·`E-PAGE-FAILED`, When `errorInfo(code)`를 부르면, Then '무엇이·어떻게 고치나' 문구가 `lib/errors.ts` 한 곳에서 나온다
- AC-012.2: Given 오류 카드, When 그리면, Then 무엇이·어떻게 고치나·오류 번호만 보이고 원래 오류 내용(메시지·스택)은 보이지 않는다

## 범위 밖
- 실제 구글 로그인 E2E(Playwright), 새 Supabase 프로젝트·구글 OAuth 만들기, 마이그레이션을 Supabase에 넣기 → 다음 단계 (사용자 결정)
- 승인한 계정 막기, 직원·원장 계정과 역할 (plan.md §10)
- 대시보드의 실제 숫자·발주 알림 내용 → 통계·재고 기능
- 통계·AI·매출 등 다른 메뉴 화면
- 30분 로그아웃 뒤 안내 문구(목업에 없음)
