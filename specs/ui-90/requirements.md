# 요구사항: 모든 화면 90점 만들기 (UI 90)

> 기능 ID: `ui-90` · 형식: 요구사항은 `### REQ-401: 제목`, 수용 기준은 `- AC-401.1: Given/When/Then`.
> 각 AC 는 테스트 하나 이상으로 검증되어야 하며, 테스트 이름에 AC ID 를 넣는다. 문서·시안·저장소 범위 AC(REQ-401, REQ-423)와 세 폭 측정·점수 AC(REQ-422)는 명령·사진·측정으로 본다(tasks.md에 적은 방법).
> 번호는 401부터다. 다른 명세(001~034, 101~114, 201~222, 301~317)와 시험 이름이 겹치지 않게 한다.

## 배경 / 목표
- 총괄 목표(2026-11-01): 화면 **하나하나가** 10가지 기준 × 10점 표에서 90점 이상이다(평균이 아니다). 지금 점수: 랜딩·입구 76, 대시보드 77, 준비 중 79, 청구 68, 설정 66, 가입 승인 83, 앱 틀 78, 없는 주소(404) 32, 오류 78(점검 `/home/developer/backups/ui-90/audit-*.md`).
- 대상 화면 12개: 랜딩 · 로그인 · 가입 · 대기·거절 · 404 · 앱 틀(위 띠·탭 줄) · 대시보드 · 준비 중(화면 없는 탭 10개) · 청구 사전점검 · 설정(비트 PC 연결) · 가입 승인(관리자) · 오류.
- 지금의 차분한 모양을 지키고 다듬는다. 크게 새로 그리지 않는다. 아직 없는 기능(통계 화면 등)은 화면 손질로 고칠 수 없으니 범위 밖이다.
- 기준 시안(총괄 승인): 들어오는 화면 `mockup-entry`(랜딩·로그인·가입·대기·거절·404), 로그인 뒤 화면 `mockup-app`(앱 틀·대시보드·준비 중·청구·설정·가입 승인·오류). TASK-1이 `docs/mockups/ui-90/entry/`·`docs/mockups/ui-90/app/`으로 그대로 옮긴다. 문구·짜임·상태는 시안이 기준이고, 문구 원천은 시안 소스의 상수·함수다(design.md '문구 원천').
- 총괄 결정(시안 승인에 포함, 고정):
  1. 바탕 A: 모든 앱 화면이 흰 바탕 한 장이다. 바깥 회색 판이 없다.
  2. 모든 문구의 말끝은 "~요"다. 우리 쪽은 "의원"으로 쓴다(승인된 "병원 PC"는 그대로).
  3. 랜딩·인증 화면 단추도 누름 반응을 한다 → UI_GUIDE "랜딩은 움직이지 않는다"와 랜딩 규칙 시험(`components/landing/rules.test.ts`)을 **바꾼다**(지우지 않는다).
  4. 휴대폰 탭: 탭 줄 끝에 [전체 메뉴] 단추. 768px 폭도 같다. tab-frame AC-303.5("메뉴 단추 없음")를 뒤집는다 → `shell.test.tsx`의 그 시험을 새 동작으로 바꾼다.
  5. 오류·거절 화면의 관리자 메일은 설정값(환경 변수, 안전한 예시 주소로 대체)에서 온다. 진짜 개인 메일을 코드에 적지 않는다.
  6. 랜딩: 이번에는 개인정보처리방침·운영자 바닥글을 넣지 않는다. 대신 랜딩을 실제 앱에 맞춘다: 미리보기 탭 = 실제 탭, 청구 사전점검이 맨 앞, 없는 기능은 "준비 중" 칩, 기능 01 청구 · 02 환자 통계 · 03 매출·재고 · 04 직원·업무일지(준비 중), AI 채팅 없음, 급여 표 예시 → 청구 사전점검 예시. 기다리는 단추는 60% 흐림.
  7. 이름 하나: "비트 PC 연결". 청구는 연결 전까지 "연결 먼저" 상태, 빈 상태 문구는 '연결하면 바로 쓸 수 있어요'.
  8. 설정 첫 상태는 "할 차례"(빨강은 진짜 문제에만), 문제 상태 '의원 다름', 아래 [연결 다시 확인] 단추를 뺀다.
  9. 대시보드 빈 그래프 4개 → "연결하면 생기는 것" 한 덩어리.
  10. 흐린 글자색 `faint` → `muted`(글자에는 `faint`를 쓰지 않는다).
  11. 준비 중 화면 새 배치 + "그동안 쓸 수 있어요".
  12. 관리자 이름 "가입 승인", 대기 건수 표시 없음(메뉴에).
  13. 자동 로그아웃 1분 전 안내.
  14. 새 404, 오류 화면 h1 '화면을 열지 못했어요'.
  15. 화면마다 브라우저 탭 이름, 건너뛰기 링크, 대비 고침, `loading.tsx`.
- 이 명세가 대체하는 옛 기준. 옛 명세 파일은 고치지 않는다(승인 기록이 깨지지 않게). 대신 UI_GUIDE에 "ui-90이 대체"라고 적는다.
  - tab-frame: AC-303.5(폰 메뉴 단추 없음), AC-303.6·AC-306.6·AC-307.8(`data-page-surface`가 있을 때만 흰 바탕), AC-305.1·305.2·305.5(준비 중 패널·꾸밈 선·420px·h1 = 기능 이름), AC-306.2(h1 "…채워집니다"), AC-311.x 가운데 연결 전 빈 그래프 틀, AC-313.4 가운데 랜딩 규칙 시험 "고치지 않음", AC-316.1(연결 전 '지금 바로 쓸 수 있어요' 줄), AC-316.3·316.4 가운데 청구 "사용 가능"과 "준비 중" `faint`. 대시보드 시안 메모 `docs/mockups/dashboard-home/notes.md`는 이 명세가 바꾼 곳에서 ui-90 시안에 진다.
  - b2b-redesign: AC-217.2(오류 화면 = 오류 카드 + 단추 둘), AC-220.x 가운데 관리자 h1 "가입 신청", AC-216.x 가운데 승인 대기·거절 문구와 신청일 줄, 랜딩 AC-207~212 가운데 문구·움직임 금지·급여 패널·채팅 칸, 미리보기 탭 6개(`faint`).
  - precheck: AC-006.5(밖에서 보는 건수 자리), AC-006.x 가운데 설치·연결 확인의 첫 상태 빨강·[연결 다시 확인]·"앞 단계를 먼저" 되풀이·문구.
  - auth: AC-010.x 자동 로그아웃은 그대로 두고 1분 전 안내를 더한다.

## 요구사항

### REQ-401: 시안 옮기기와 UI_GUIDE 규칙 바꾸기 (`docs/`)
- AC-401.1: Given 승인된 두 시안 폴더(`/home/developer/backups/ui-90/mockup-entry/`·`/home/developer/backups/ui-90/mockup-app/`), When `diff -r`로 `docs/mockups/ui-90/entry/`·`docs/mockups/ui-90/app/`과 견주면, Then 다른 파일·빠진 파일이 없다.
- AC-401.2: Given `docs/UI_GUIDE.md`, When 읽으면, Then 맨 위 기준 줄에 ui-90(시안 경로·명세 경로·"화면마다 90점")이 있고, 아래 규칙이 design.md 'UI_GUIDE 바꿀 곳' 표대로 바뀌어 있다: 움직임(랜딩·인증 누름 반응 허용, 불러오기 줄 예외), 글자에 `faint` 금지(토큰 표·대비·차트 "–"), 빈 상태 예외 정리(준비 중 꾸밈 선·빈 그래프 틀 예외 삭제, "연결하면 생기는 것"·준비 중 새 배치), 칩 표, 바탕 A, 폰 [전체 메뉴](AC-303.5 대체), 문구(~요·의원·"비트 PC 연결"), 탭 이름·건너뛰기 링크, 관리자 h1 "가입 승인", 오류 화면·없는 주소 화면 짜임, 랜딩 표(#ai·#features).
- AC-401.3: Given `docs/UI_GUIDE.md`, When 옛 글자를 찾으면(`grep -n`), Then "랜딩·미리보기는 지금처럼 움직이지 않는다", "`transition`은 없다", "준비 중인 기능입니다", "글자 없는 1px 가로선(넷", "h1 \"가입 신청\"", "급여 패널(직원 1~4" 가 없다.

### REQ-402: 화면마다 브라우저 탭 이름 (metadata)
- AC-402.1: Given 뿌리 레이아웃(`src/app/layout.tsx`)의 `metadata`, When 읽으면, Then `title`이 `{ template: '%s · 병원 업무 도구', default: '병원 업무 도구' }`다.
- AC-402.2: Given 입구 페이지, When `metadata`(또는 `generateMetadata`)를 읽으면, Then `/` "숫자로 보는 우리 의원", `/login` "로그인", `/signup` "가입 신청", `/pending`은 승인 대기면 "승인 대기", 거절이면 "가입 승인 안 됨"이다.
- AC-402.3: Given 승인된 사용자, When 앱 틀 레이아웃(`src/app/(app)/layout.tsx`)의 `generateMetadata`를 부르면, Then `title`이 `{ template: '%s · <의원 이름>', default: '<의원 이름>' }`이고, 레이아웃 그리기와 `generateMetadata`는 같은 요청 안에서 한 번 캐시한 읽기(`currentMe`, `guardPage('/dashboard')`)를 같이 쓴다. 승인 전이면 지금처럼 guard가 보낸다.
- AC-402.4: Given 앱 페이지, When `metadata.title`을 읽으면, Then `/dashboard` "대시보드", `/claim` "청구", `/claim/setup` "비트 PC 연결", `/admin` "가입 승인"이고, 준비 중 주소 10개는 `notReadyFeature(주소).name`이다. 이 14개 이름은 모두 다르다.

### REQ-403: 건너뛰기 링크 (앱 틀)
- AC-403.1: Given `AppShell`, When 그리면, Then 문서 순서로 첫 조작 요소가 `<a href="#main">본문으로 건너뛰기</a>`이고 평소에는 `sr-only`, 키보드 초점이면 보인다(왼쪽 위 띠 위, 높이 44px, `surface`, 1px `line`, `rounded-float`, `shadow-float`, body 600, 2px `accent` 초점 고리). `main`은 `id="main"`·`tabIndex={-1}`이다.

### REQ-404: 바탕 A — 흰 바탕 한 장
- AC-404.1: Given `AppShell`, When 그리면, Then 뿌리와 `main`이 `bg-surface`이고 `bg-canvas`와 `has-[[data-page-surface]]:` 클래스가 없다. 본문 감싸개(1280 폭·좌우 24·위 24·아래 48, 폰 16·16·32)는 그대로다.
- AC-404.2: Given 시험 파일 밖 `src/components/**`·`src/app/**` 소스, When `data-page-surface`를 찾으면, Then 없다.

### REQ-405: 불러오는 동안 (`(app)/loading.tsx` · 누른 탭 · 불러오기 줄)
- AC-405.1: Given `src/app/(app)/loading.tsx`, When 그리면, Then `role="status"` 요소 하나 안에 화면 읽기 글자 "화면을 여는 중이에요"(`sr-only`)만 있다. h1·움직임 클래스·`'use client'`가 없다.
- AC-405.2: Given 탭 줄(또는 [전체 메뉴] 판)의 링크, When 지금 경로와 다른 탭을 누르면, Then 그 탭이 바로 지금 탭 모양(ink 600 + 아래 2px accent 밑줄, `data-pending="true"`)이 되고 옛 지금 탭은 기본 모양이 된다. `aria-current`는 경로가 바뀔 때 옮겨지고, 경로가 바뀌면 `data-pending`이 사라진다. 지금 탭을 다시 누르면 아무것도 바뀌지 않는다.
- AC-405.3: Given 누른 뒤 경로가 아직 그대로, When 탭 줄을 보면, Then 탭 줄 맨 아래에 `aria-hidden` 2px `accent` 불러오기 줄이 보이고 왼쪽에서 80%까지 700ms 동안 감속하며 차오른다(`scaleX`). 경로가 바뀌면 150ms에 사라진다. 이 줄의 700ms·감속 곡선 클래스는 이 한 곳에서만 규칙 시험의 예외다. 모션 줄이기 기기에서는 전역 규칙으로 움직이지 않는다.

### REQ-406: 짧은 반응과 기다리는 단추를 `ds`에 (`components/ui/classes.ts`)
- AC-406.1: Given `ds.button`의 모든 키와 `ds.textButton`, When 클래스를 읽으면, Then `transition`(150ms 기본)이 있고 단추 키는 막히지도 기다리지도 않을 때만 누름 아래 1px(`not-disabled:not-aria-disabled:not-aria-busy:active:translate-y-px`)이다. tab-frame 규칙 시험(AC-313.2)이 모든 `ds` 키에서 그대로 통과한다.
- AC-406.2: Given `ds.button`의 모든 키(새 `ghost` — 글자만 단추 기본 36px, 폰 44px — 포함), When 클래스를 읽으면, Then 기다림 모양 `aria-busy:cursor-progress aria-busy:opacity-60`이 있다. 기다리는 단추는 `disabled`가 아니라 `aria-busy="true"`로 표시하고(막힘 40%와 겹치지 않게) 기다리는 동안 누름을 무시한다.

### REQ-407: 글자 대비
- AC-407.1: Given 앱 화면 규칙 시험(`ui/classes.test.ts`의 검사 파일 전체), When 클래스를 보면, Then 글자색 `text-faint`(변형 앞말 포함)가 없고 규칙 시험이 그것을 잡는다. `bg-faint`(차트 지난 기간 눈금·범례)는 그대로 된다.
- AC-407.2: Given 값 없는 `KpiStat`·대시보드 날짜 줄 "·"·기능 목차 "준비 중"·분석의 "–"·미리보기의 지금 아닌 탭, When 그리면, Then 글자색이 `text-muted`다.
- AC-407.3: Given `ErrorCard`, When 그리면, Then "오류 번호 E-…" 줄이 caption `text-ink-2` 고정폭이다(나머지 모양 그대로).

### REQ-408: 청구 폴더도 앱 화면 규칙 시험에 (`ui/classes.test.ts`)
- AC-408.1: Given 규칙 시험의 앱 화면 폴더 목록, When 읽으면, Then `src/components/claim`이 들어 있고, 시험 파일 밖 청구 소스가 모두 검사 목록에 있으며 간격·글자·모서리·장식·움직임·`ui` 금지 규칙을 지킨다.
- AC-408.2: Given 시험 파일 밖 `src/components/claim/**` 소스, When 찾으면, Then 직접 그린 `<svg`와 "✓"·"✗" 글자가 없다(아이콘은 `Icon`의 `stop`·`check`·`x`). 보이는 모양(크기·색·자리)은 가까운 단계 값으로 그대로다.

### REQ-409: 공용 오류 문구와 관리자 메일 설정값
- AC-409.1: Given `lib/errors.ts`, When 읽으면, Then `E-PAGE-FAILED.fix`는 "잠시 뒤 [다시 시도]를 눌러 주세요. 계속되면 아래 오류 번호를 관리자에게 메일로 알려 주세요.", `E-BIT-NOT-REGISTERED.what`은 "이 PC에 등록한 의원이 없어요", `E-BIT-HOSPITAL-MISMATCH`는 what "이 PC의 비트가 등록한 의원과 달라요" · fix "우리 의원 비트가 맞으면 [다시 등록]을 눌러요. 이 PC에 뜨는 확인 창에서 전에 등록한 값과 새 값을 보고 [확인]을 눌러요.", `E-BRIDGE-REJECTED.fix`는 "비트 PC 연결 화면에서 [다시 확인]을 누른 뒤 다시 해 주세요. 계속되면 오류 번호와 함께 문의해 주세요."다. 모든 what·fix에 "병원"·"설치·연결 확인"이 없고 "니다."로 끝나는 문장이 없다.
- AC-409.2: Given `adminContactEmail()`(`components/common/adminContact.ts`), When 환경 변수 `NEXT_PUBLIC_ADMIN_CONTACT_EMAIL`이 메일 모양(앞뒤 빈칸 뺀 뒤, 254자 이하)이면, Then 그 값을, 비었거나 없거나 메일 모양이 아니면 `admin@example.com`을 돌려준다.
- AC-409.3: Given 시험 파일 밖 `src/` 소스, When 메일 모양 글자를 찾으면, Then `adminContact.ts`의 대체 주소 `admin@example.com` 하나뿐이다. 설정값 이름과 대체 동작은 `docs/UI_GUIDE.md` '문구'에 적혀 있다(`.env.example`은 E2E 값 목록 시험이 있어 고치지 않는다).

### REQ-410: 없는 주소 화면 (404)
- AC-410.1: Given 승인된 사용자가 없는 주소(예: `/dashbord`·`/claim/close`), When 열면, Then `src/app/(app)/[...rest]/page.tsx`가 `notFound()`를 부르고 앱 틀 안에 `(app)/not-found.tsx`가 `NotFoundScreen`(앱 안 모양)을 그린다: 패널 하나(`ds.panel`) 안에 `neutral` 칩 "없는 주소" → h1 "찾는 화면이 없어요"(title) → "주소가 바뀌었거나 잘못 적힌 것 같아요. 위 탭에서 가려는 화면을 고르거나 대시보드로 가 주세요." → "열려던 주소" + 그 경로 → [대시보드로 가기](`/dashboard`, `ds.button.primaryLarge`, 폰 전체 폭). 상자 안 상자가 없다.
- AC-410.2: Given 뿌리 `src/app/not-found.tsx`, When 그리면, Then 한 칸 `AuthFrame` 안에 `NotFoundScreen`(밖 모양)이 칩 "없는 주소" → h1 "찾는 화면이 없어요"(heading-m → heading) → "주소가 바뀌었거나 잘못 적힌 것 같아요. 처음 화면에서 다시 시작해 주세요." → 열려던 주소 → [처음 화면으로](`/`, 주 큰) · [로그인](`/login`, 보조 큰)이다. Supabase·guard·`fetch`를 쓰지 않는다.
- AC-410.3: Given 열려던 주소 자리(`RequestedPath`, `'use client'`), When 그리면, Then `usePathname()`의 경로만(쿼리·해시 없음) 글자로 보이고 긴 경로는 줄바꿈된다(`break-all`, 고정폭).
- AC-410.4: Given 두 404, When 탭 이름을 읽으면, Then "찾는 화면이 없어요"이다(앱 안은 `· <의원 이름>`, 밖은 `· 병원 업무 도구`가 붙는다).
- AC-410.5: Given 라우트 파일, When 찾으면, Then `(app)/[...rest]`보다 구체적인 기존 주소(`/`·`/login`·`/signup`·`/pending`·`/auth/callback`·탭 주소 13개·`/admin`)가 모두 자기 페이지를 갖고, 문지기·middleware 소스는 바뀌지 않는다(로그인 안 한 사람의 없는 주소는 지금처럼 `/login`).

### REQ-411: 오류 화면 (`app/error.tsx`)
- AC-411.1: Given 화면을 그리다 난 오류, When 오류 화면을 그리면, Then 한 칸 `AuthFrame` 안에 위에서부터 `negative` 칩(`Icon stop` 12 + "문제가 생겼어요") → h1 "화면을 열지 못했어요"(= `errorInfo('E-PAGE-FAILED').what`, heading-m → heading) → 안내(`E-PAGE-FAILED.fix`) → "오류 번호 E-PAGE-FAILED"(`ink-2` 이상) · "관리자 메일: <adminContactEmail()>" → 단추 줄 [다시 시도](주, 새로 열기) · [대시보드로](보조, `/dashboard` 링크) · [로그아웃](`ds.button.ghost`, `SignOutButton`)이다. 빨간 오류 카드가 없고 h1은 하나다.
- AC-411.2: Given 같은 화면, When 그리면, Then Next가 넘긴 오류 내용(message·digest·stack)을 그리지 않고 저절로 다른 주소로 보내지 않는다(옛 AC-002.8 그대로).
- AC-411.3: Given 같은 화면, When 탭 이름을 읽으면, Then "오류 · 병원 업무 도구"다(React `<title>`).
- AC-411.4: Given 시험에서 환경 변수를 넣거나 비우면, When 그리면, Then 관리자 메일 자리가 그 값 또는 `admin@example.com`이다.

### REQ-412: 설정 — 비트 PC 연결 (`/claim/setup`)
- AC-412.1: Given 처음 들어옴(확장 없음, 아무것도 안 함), When 그리면, Then 맨 위 `accent-soft` 안내(`Icon monitor`) "이 화면은 비트 PC의 크롬에서 열어요."(600) + "비트 PC는 비트가 깔린 의원 PC예요. 집 PC나 휴대폰에서는 연결하지 않아도 돼요."가 있고, 화면 어디에도 `negative` 칩·위쪽 오류 상자·`text-negative`가 없다. 1단계는 `accent` 칩 "할 차례"와 시안의 순서 4줄 + [확장 내려받기](주, 웹스토어 주소가 있으면 지금처럼 [확장 설치하러 가기]) · [다시 확인](보조), 2~5단계는 `neutral` 칩 "대기"와 설명만이다("앞 단계를" 글자 없음).
- AC-412.2: Given 단계 상태, When 칩을 그리면, Then design.md '단계 칩' 표대로다: 대기 → `neutral` "대기", 확인 중 → `accent` "확인 중", 됨 → `positive` `Icon check` "완료", 안 됨 가운데 설치·등록·다시 확인 안내 → `accent` "할 차례", 버전 안 맞음 → `negative` `Icon x` "버전 안 맞음", 의원 다름 → `negative` `Icon x` "의원 다름".
- AC-412.3: Given 진짜 문제(확장·도우미 버전 안 맞음, 의원 다름), When 그리면, Then 안쪽 메뉴 아래 오류 상자가 하나(`negative-soft`, `Icon stop`)이고 그 안에 what · fix(`lib/errors.ts`) · "오류 번호 <번호>"(`ink-2`) · 단추 줄(의원 다름: [다시 등록] 주 · [다시 확인] 보조 / 버전: 지금 안내의 내려받기 단추 — 확장 [확장 내려받기]·[확장 설치하러 가기], 도우미 [새 도우미 내려받기] — 주 · [다시 확인] 보조)이 있다. 그 단계 줄에는 칩과 설명만 있다.
- AC-412.4: Given 어느 상태든(다른 창 카드 밖), When 그리면, Then 주 단추가 하나 이하, [다시 확인]이 하나 이하, 같은 오류 번호 글자가 한 번 이하다. 아래 [연결 다시 확인] 단추와 "누르면 1번부터 5번까지 다시 확인해요."가 없다.
- AC-412.5: Given 같은 화면, When 글자를 읽으면, Then 안쪽 메뉴가 "청구·연락"(준비 중 칩) · "비트 PC 연결"(지금)이고, 5단계 설명은 시안 `SDESC`, '이 PC' 줄 이름은 "크롬 확장 프로그램"·"도우미"·"요양기관기호"·"마지막 확인"이며 값은 design.md '이 PC 값' 표대로, '이렇게 지켜요' 세 줄은 시안 그대로다. "병원"·"설치·연결 확인"·"[비트 연결]"·"니다." 글자가 없다.
- AC-412.6: Given 768px 미만, When 그리면, Then 단계 칩이 단계 이름 바로 아래에 있고 설명은 body(14px), 단계 안 단추는 전체 폭이다.
- AC-412.7: Given 다른 창 카드·모두 됨 줄([청구로 가기])·새 도우미 줄·처음 등록·다시 등록 흐름·기관기호 가리기, When 지금 시험을 돌리면, Then 문구·모양 기대만 바꾸고 동작 시험은 그대로 통과한다.

### REQ-413: 청구 (`/claim`)
- AC-413.1: Given 확장 없는 곳·휴대폰, When `/claim`을 열면, Then h1 "이 PC에서는 청구 점검을 열 수 없어요"(heading-m → heading) → 점 목록 두 줄 "환자 정보와 삭감 경고는 비트 PC(비트가 깔린 의원 PC)에서만 보여요." · "이 PC는 아직 비트 PC로 연결되지 않았어요." → [이 PC를 비트 PC로 연결](`/claim/setup`, 주 큰 + 꾸밈 화살표, 폰 전체 폭) → 위 1px `line` 아래 "다른 PC에서는 건수만 볼 수 있어요" + `neutral` 칩 "준비 중"이다. "밖에서 보는 건수"·패널 상자가 없고 h1은 하나다.
- AC-413.2: Given 연결됨(ready), When 그리면, Then `NotReadyScreen`이 h1 "청구 점검 화면은 준비 중이에요", 소개 "이 PC는 비트와 연결됐어요. 점검 화면이 만들어지면 이 탭에서 바로 열려요.", 만들 것 "삭감 예방 사전점검"·"청구메모"·"상병 확인"·"월말 마감", 단추 [비트 PC 연결 다시 확인](`/claim/setup`, 보조)로 그리고 "그동안 쓸 수 있어요"가 없다. 따로 "청구" h1이 없다.
- AC-413.3: Given 다른 창에서 작업 중, When 그리면, Then 다른 창 카드는 지금 그대로이고, [건수만 보기]를 누르면 h1 "청구" 아래 "건수만 볼 수 있어요" + `neutral` 칩 "준비 중"과 [다시 확인](보조, 다시 붙기)만 보인다(design.md '시안과 다른 점' 7). 연결 중·설정으로 보내기(`router.replace('/claim/setup')`)는 지금 그대로다.

### REQ-414: 대시보드 — 연결 전 (`components/dashboard/**`)
- AC-414.1: Given 연결 전, When 브리핑을 그리면, Then h1 "비트 PC를 연결하면 오늘 숫자가 여기에 채워져요", 안내 "아직 받은 진료 자료가 없어 오늘 분석이 비어 있어요. 연결은 처음 한 번만 하면 되고, 연결한 뒤에는 이 자리에 오늘의 보고 문장이 올라와요.", 안심 줄 "환자 개인정보는 의원 PC 밖으로 나가지 않아요. 비트 자료는 읽기만 해요."다(시안 `dash_body`).
- AC-414.2: Given 연결 전, When 브리핑 다음 섹션을 그리면, Then h2 "연결하면 바로 쓸 수 있어요" + 옆 글 "삭감 예방 사전점검은 비트 PC를 연결한 뒤 열려요." 아래 줄 하나에 "청구 탭" · "삭감 예방 사전점검" · "청구하기 전에 삭감될 만한 처방을 미리 찾아 줘요." · "청구 점검은 비트 PC의 크롬에서 열려요." · [비트 PC 연결부터](`/claim/setup`, 보조 + 꾸밈 화살표)가 있다. 연결 뒤 오른쪽 칸 묶음은 지금 그대로이고 둘째 줄만 "…크롬에서 열려요."다.
- AC-414.3: Given 연결 전, When 오늘 하루 분석을 그리면, Then h2 옆에 `neutral` 칩 "비트 PC 연결 전", 숫자 4칸은 "–"(`muted`) + "연결하면 보여요", 아래 "연결하면 이 숫자로 원장님 보고 문장을 만들어 맨 위 큰 문장 자리에 올려요."다.
- AC-414.4: Given 연결 전, When 기간별 흐름을 그리면, Then 기간 글자와 기간 단추(최근 7·30·90일, 폰 44px) 아래 "연결하면 생기는 것 4가지"(subtitle 600) + 순서 목록 4개(시안 `gains`의 이름·설명, 1024px 이상 4칸·칸 사이 1px `line`, 768px 미만 쌓기) + "연결한 뒤에는 이 자리에 그래프 4개가 그려지고, 기간 단추로 7일·30일·90일을 바꿔 볼 수 있어요."가 있고, 빈 그래프 틀·차트 부품이 없다. 연결 뒤(시험 안 가짜 자료)에는 그래프 넷이 지금 그대로다.
- AC-414.5: Given 기능 목차, When 그리면, Then 옆 글이 "12개 가운데 1개는 지금, 1개는 연결하면 쓸 수 있어요"이고 상태 글자는 청구 = 연결 전 "연결 먼저"(ink-2 600 + 화살표) · 연결 뒤 "사용 가능", 설정 = "사용 가능"(accent + 화살표), 나머지 10개 = "준비 중"(`muted`)이다. 옆 글의 숫자는 목차 자료의 개수와 같다.
- AC-414.6: Given 대시보드 보조 글(숫자 칸 아래 글·안내 줄·섹션 옆 글), When 그리면, Then small(13px)이고 글 덩어리는 최대 폭이 있다(시안 40em에 가장 가까운 4px 단위 폭 단계, 대괄호 값 없음). 대시보드 뿌리에 `data-page-surface`가 없고, 연결 판정은 `report != null`이다.
- AC-414.7: Given `/dashboard`(지금 자료 없음), When 그리면, Then h1이 하나이고, 그린 글자의 숫자는 날짜 줄·기간 글자·기간 단추·연결 순서 번호와 "5단계"·"4가지"와 1~4 번호·기능 수 글뿐이다(지어낸 숫자 없음).

### REQ-415: 준비 중 화면 새 배치 (`components/common/NotReadyScreen.tsx`)
- AC-415.1: Given `NOT_READY_FEATURES`, When 읽으면, Then 항목마다 `title`이 있고 차례로 "통계는 준비 중이에요" · "고시·공지는 준비 중이에요" · "환자는 준비 중이에요" · "매출은 준비 중이에요" · "AI 리포트는 준비 중이에요" · "서식은 준비 중이에요" · "직원은 준비 중이에요" · "업무일지는 준비 중이에요" · "재고는 준비 중이에요" · "주소록은 준비 중이에요"다. 이름·주소·소개·만들 것은 그대로다.
- AC-415.2: Given `NotReadyScreen`, When 그리면, Then 왼쪽 칸에 `neutral` 칩 "준비 중" → h1 = `title`(heading, 폰 heading-m) → 소개(lead `ink-2`, 시안 30em에 가장 가까운 최대 폭 단계) → [대시보드로 돌아가기](보조 + 왼쪽 화살표, 폰 전체 폭), 오른쪽 칸에 h2 "만들 것"(small 600 muted) + 점 목록(`ul`, 받은 순서, 꾸밈 점 `accent`), 그 아래 전체 폭(위 1px `line`)에 h2 "그동안 쓸 수 있어요" + [비트 PC 연결](`/claim/setup`) "청구 점검을 쓰려면 먼저 해요" · [청구](`/claim`) "삭감 예방 사전점검"(글자 단추 + 화살표)이다. 1024px 이상 12칸(왼 1~6·오 8~12), 768px 미만 쌓기(만들 것 위 1px `line`).
- AC-415.3: Given 같은 화면, When 그리면, Then 바깥 상자(`ds.panel`·네 변 테두리)·꾸밈 선·고정 높이가 없고, 상자 안 상자가 없으며, Supabase·문지기·`fetch`·브라우저 저장소·`'use client'`가 없다.
- AC-415.4: Given `action`·`meanwhile={false}`를 주면, When 그리면, Then 돌아가기 링크 자리에 받은 `action`이 오고 "그동안 쓸 수 있어요"가 없다. 주지 않으면 돌아가기 링크와 "그동안 쓸 수 있어요"가 있다.
- AC-415.5: Given 준비 중 주소 10개, When 페이지를 그리면, Then h1이 그 항목의 `title`이다.

### REQ-416: 앱 틀 — 폰 [전체 메뉴] · 768 (`components/shell/**`)
- AC-416.1: Given 1024px 미만, When 탭 줄을 그리면, Then 옆으로 밀리는 탭 띠(지금 탭이 보이게 띠만 민다) 오른쪽 끝, 띠 밖에 [전체 메뉴] 단추(44px, 왼쪽 1px `line`, accent 600, 꾸밈 `chev`, `aria-expanded`, `aria-controls`)가 있다. 1024px 이상에서는 단추가 보이지 않는다(`lg:hidden`). (tab-frame AC-303.5 대체)
- AC-416.2: Given [전체 메뉴]를 누름, When 판을 그리면, Then 탭 줄 바로 아래 판(`surface`, 아래 1px `line`, `shadow-float`)에 머리 "모든 탭 13개" · "준비 중 10개"(small muted, 숫자는 `MENU`에서)와 2칸 목록(`ul`) 링크 13개가 `MENU` 순서로 있다. 링크는 44px, 지금 탭은 `aria-current="page"`(accent-strong 600 + 왼쪽 2px accent 막대), 준비 중 10개는 `neutral` 칩 "준비 중"이다. 판은 나타날 때만 150ms 흐림 → 보임이고 꺾쇠는 180° 돈다.
- AC-416.3: Given 열린 판, When 단추를 다시 누르거나 Esc(초점은 단추로)·판 안 링크 누름·판 밖 누름·경로 바뀜이 생기면, Then 판이 닫힌다.
- AC-416.4: Given `MENU`, When 읽으면, Then 항목마다 `ready`가 있고 대시보드·청구·설정만 `true`이며, `ready: false`인 주소들은 `NOT_READY_FEATURES`의 주소와 같다.
- AC-416.5: Given 1024px 미만 탭 띠, When 키보드 초점이 띠 밖으로 밀린 탭에 가면, Then 띠만 밀어 그 탭이 보인다.
- AC-416.6: Given 768px 이상 계정 단추, When 그리면, Then 이메일 칸 최대 폭이 240px(`md:max-w-60`)이고 그보다 길 때만 말줄임이다.
- AC-416.7: Given 계정 메뉴 [로그아웃], When 그리면, Then 꾸밈 아이콘이 `Icon`의 새 `logout`(시안 그림)이고 `ICON_NAMES`는 19개다.

### REQ-417: 가입 승인 (`/admin`)
- AC-417.1: Given 관리자 화면, When 그리면, Then h1 위에 작은 "관리자"(`Icon userCheck` 14, small muted), h1 "가입 승인", 안내 "승인하면 그 계정은 바로 대시보드를 쓸 수 있어요. 거절한 신청은 거절 탭에서 되돌릴 수 있어요."(시안 40em에 가장 가까운 최대 폭 단계), 표 머리 "의원 이름", 거절 확인 창 "거절하면 이 계정은 대시보드를 쓸 수 없어요. 거절 탭에서 언제든 되돌릴 수 있어요."다. 빈 탭 안내와 알림 글(`components/admin/applications.ts`)은 "대기 중인 신청이 없어요"·"새 가입 신청이 오면 여기에 보여요." / "승인한 신청이 없어요"·"승인한 계정이 여기에 모여요." / "거절한 신청이 없어요"·"거절한 신청은 여기에서 되돌릴 수 있어요." / "신청을 승인했어요."·"신청을 거절했어요."·"신청을 대기로 되돌렸어요."다. "가입 신청" h1·"병원 이름"·"니다." 글자가 없다.
- AC-417.2: Given 화면 안 탭과 계정 메뉴, When 그리면, Then 화면 안 탭의 개수 글자는 지금 그대로이고 계정 메뉴 [가입 승인]에는 숫자·칩이 없다.

### REQ-418: 자동 로그아웃 1분 전 안내
- AC-418.1: Given `startIdleLogout({ timeoutMs, warnMs, onWarn, onActive, onIdle, … })`, When 움직임 없이 `timeoutMs − warnMs`가 지나면, Then `onWarn`을 한 번 부르고, 그 뒤 움직임(이 탭 또는 다른 탭 소식)이 오면 `onActive`를 한 번 부르고 처음부터 다시 센다. `timeoutMs`가 지나면 `onIdle`이다. `warnMs`를 주지 않으면 지금과 똑같다(옛 AC-010.x 시험 그대로 통과).
- AC-418.2: Given 29분 동안 움직임 없음, When `IdleLogout`이 그리면, Then 아래에 붙는 안내(`role="alert"`, `ds.layer` 모양)에 `Icon clock`(warning) + "1분 뒤 자동으로 로그아웃돼요"(subtitle 600) · "30분 동안 아무것도 누르지 않았어요. 환자 정보를 지키려고 곧 로그아웃해요."(small ink-2) · [계속 쓰기](주, 폰 전체 폭)가 있다. 폰은 좌우·아래 12px, 768px 이상은 오른쪽 아래 24px·폭 360px이다. 초점을 옮기지 않는다.
- AC-418.3: Given 안내가 보임, When [계속 쓰기]를 누르거나 다른 움직임이 오면, Then 안내가 사라진다. [계속 쓰기]로 닫히면 그 자리에 "다시 30분 동안 쓸 수 있어요."(`role="status"`)가 3초 보였다가 사라진다. 30분이 되면 지금처럼 로그아웃하고 `/login`으로 간다.
- AC-418.4: Given `IdleLogout`, When 떠나면(unmount), Then 시계·이벤트·채널이 모두 풀리고 브라우저 저장소를 쓰지 않는다.

### REQ-419: 로그인 · 가입 · 승인 대기 · 거절 (`components/auth/**`)
- AC-419.1: Given `AuthFrame`(한 칸·두 칸), When 그리면, Then 로고가 `<a href="/" aria-label="처음 화면으로 가기">` 안에 있고(누름 영역 44px 이상, 안쪽 초점 고리) 로고는 문서에 하나다.
- AC-419.2: Given 로그인, When 그리면, Then 문구가 시안 `loginForm`·`loginPC`와 같고("구글 계정으로 로그인해요. 처음이면 가입 신청으로 이어져요." 등), 승인 안내는 small(13px) muted다. [구글로 시작하기]를 누르면 글자가 "구글로 넘어가는 중…"·`aria-busy="true"`가 되고 다시 눌러도 다시 부르지 않는다. 실패하면 지금처럼 오류 카드와 [다시 구글로 시작하기]다.
- AC-419.3: Given 가입 신청, When 그리면, Then 칸 이름 "의원 이름"(예: 가나 정형외과의원)과 안내·도움말·동의 문구가 시안 `signupBody`와 같고, [가입 신청]을 누르면 보내는 동안 "보내는 중…"·`aria-busy="true"`이며 두 번 보내지 않는다. 칸 오류 글의 이름표는 "의원 이름"이다(`lib/auth/signup.ts`, 예: "의원 이름을 적어 주세요.").
- AC-419.4: Given 승인 대기, When 그리면, Then 상태 줄(칩 + "<신청일> 신청") → h1 "신청을 확인하고 있어요" → "관리자가 승인하면 대시보드를 쓸 수 있어요. 승인됐는지는 [상태 다시 확인]을 눌러 확인하세요." → 보낸 신청 내용 4줄(의원 이름·신청자·구글 계정·연락처, 신청일 줄 없음) → [상태 다시 확인]이다. 누르면 "확인 중…"(`aria-busy`) 뒤 아직 대기면 `role="status"` 줄에 `Icon clock` + "아직 승인 전이에요 · <오전|오후 h:mm> 확인"(한국 시각)이 나온다.
- AC-419.5: Given 거절, When 그리면, Then h1 "가입이 승인되지 않았어요", 안내 "궁금한 점은 아래 관리자 메일로 물어봐 주세요. 관리자가 다시 검토해 승인하면 이 계정으로 이어서 쓸 수 있어요.", "관리자 메일: <adminContactEmail()>" + [주소 복사](보조 작은, 결과 "복사했어요"/"복사하지 못했어요. …"), 보낸 신청 내용 2줄(의원 이름·구글 계정), [다른 계정으로 로그인](주 큰)이다.
- AC-419.6: Given 인증 화면 넷, When 글자를 읽으면, Then "병원 이름"·"니다." 글자가 없고, 로그인·신청·로그아웃·앱 안 브라우저 안내 동작 시험은 그대로 통과한다.

### REQ-420: 랜딩 누름 반응 규칙 (`components/landing/base.module.css`·`rules.test.ts`)
- AC-420.1: Given `base.module.css`, When 읽으면, Then `.btn`이 `transition: background-color 150ms, border-color 150ms, color 150ms, opacity 150ms, transform 150ms`이고 `.btn:active:not(:disabled)`가 `transform: translateY(1px)`, 주 단추 올림 `accent-strong` · 보조 올림 `canvas`다. 메뉴 링크·로고 링크는 색·투명도만 같은 150ms로 바뀐다.
- AC-420.2: Given 랜딩 규칙 시험, When 돌리면, Then 위 선택자의 위 값만 통과하고 `animation`·`@keyframes`·`transition: all`·150ms 밖 시간·`transition-delay`·그 밖 선택자의 `transition`은 잡는다. 모션 줄이기 전역 규칙(`globals.test.ts`)은 고치지 않고 통과한다.
- AC-420.3: Given 랜딩 TSX, When 보면, Then `'use client'`·타이머·스크립트 움직임이 없다(지금 그대로).

### REQ-421: 랜딩을 실제 앱에 맞추기 (`components/landing/**`·`components/preview/**`)
- AC-421.1: Given 랜딩, When 그리면, Then 첫 조작 요소가 `<a href="#main">본문으로 건너뛰기</a>`(키보드 초점일 때만 보임)이고 `<main id="main">`이다.
- AC-421.2: Given 미리보기(`DashboardPreview`), When 그리면, Then 탭 줄이 `MENU`의 13개 이름 순서(첫째만 지금 탭, 나머지 `text-muted`)이고 한 줄 높이에서 넘치는 탭은 통째로 숨는다(줄바꿈 + 높이 자르기, 스크립트 없음). 768px 미만 쌓은 막대의 날짜 글자는 하나 걸러 보인다(`StackedBarChart`의 새 선택 옵션, 주지 않으면 지금 그대로).
- AC-421.3: Given 히어로, When 그리면, Then 소개 줄·h1·안내(`HERO_LEAD`, "원장님 보고까지"·"한 화면에서" 줄바꿈 없음)·단추·약속이 시안 `landingPC`·`landingPhone`과 같다.
- AC-421.4: Given `#ai`, When 그리면, Then 머리에 `neutral` 칩 "준비 중" + "AI 리포트 탭", 약속은 시안 `AI_POINTS` 4개, 리포트 패널은 "10월 AI 리포트" + "예시" 칩 + 항목 3개(`AI_ITEMS`)이고 채팅 칸이 없으며 패널 아래 빈 공간이 없다(위 맞춤).
- AC-421.5: Given `#ortho`, When 그리면, Then 표가 시안 `ORTHO`이고 "F/U"가 없다("주사 치료 수와 재방문").
- AC-421.6: Given `#features`, When 그리면, Then h2 "매일 하던 일을 한곳에 모아요" · 안내 "지금은 청구 사전점검을 쓸 수 있고, 나머지 기능은 차례로 열려요." 아래 왼쪽에 "01 · 청구 · 삭감 예방 사전점검" + `positive` 칩(`Icon check` + "쓸 수 있어요") · h3 · 설명 · 예시 패널 하나("10월 28일 사전점검" "예시" · "환자 32명 점검" · 표 3줄), 오른쪽 목록에 02 환자 통계 · 03 매출·재고 · 04 직원·업무일지(각 `neutral` 칩 "준비 중")가 있다. 폰은 01~04 목록 하나(시안 `FEATURES`의 `phone` 글). 급여 패널이 없다.
- AC-421.7: Given `#privacy`·`#how`·바닥글, When 그리면, Then 문구가 시안(`PRIV_H2`·`PRIV_RULES`·`STEPS` 등)과 같고 바닥글은 지금 그대로다.
- AC-421.8: Given 768px 미만, When 글자 크기를 보면, Then 히어로·섹션 안내는 lead(16), 기능 설명은 body(14), 소개 줄은 body 600(14)이다.
- AC-421.9: Given 랜딩 글자 전체, When 읽으면, Then "니다."로 끝나는 문장과 "F/U"가 없고 "병원 PC"는 그대로다.

### REQ-422: 다시 매기기 — 세 폭 측정과 점수 표
- AC-422.1: Given 127.0.0.1 개발 서버(가짜 Supabase `docs/mockups/b2b-redesign/tools/stub.mjs`, 시험 스크립트가 넣는 가짜 세션 쿠키, 가짜 확장 신호), When 12개 화면(상태는 design.md '찍을 화면' 표)을 390×844·768×1024·1440×900에서 열면, Then 모두: 가로 스크롤 없음 · 탭 이름이 REQ-402·410·411대로 · 랜딩과 앱 화면은 첫 Tab이 건너뛰기 링크이고 보임 · 보이는 글자 대비 4.5:1 이상(로고·막힌 단추·`aria-hidden` 빼고) · 390에서 누름 영역 44px 이상 · 앱 본문 바탕 흰색 · 1440에서 탭 13개 한 줄, 1024 미만에서 [전체 메뉴] 보임 · 랜딩 390 전체 높이 4,220px 이하다.
- AC-422.2: Given 세 폭 사진과 시안, When 만든 사람과 다른 리뷰 에이전트가 design.md '점수 매기는 법'대로 매기면, Then `docs/ui-90/scores.md`에 12개 화면 × 10기준(0~10) + 합계 표가 있고 칸마다 한 줄 근거가 있으며 **모든 화면 합계가 90 이상**이다. AC-422.1 측정 결과도 같은 파일에 있다.
- AC-422.3: Given 90 미만 화면, When 고치면, Then 이 명세가 그 화면 TASK에 적은 파일 안에서 시안 범위의 클래스·문구만 고치고 다시 찍어 다시 매긴다. 두 번 고쳐도 90 미만이면 멈추고 총괄에게 알린다.
- AC-422.4: Given 확인이 끝나면, When 포트를 보면(`ss -ltnp`), Then 띄운 서버·가짜 Supabase·브라우저가 모두 멈춰 있다. 진짜 계정으로 로그인하지 않고 스크립트·사진은 scratchpad에만 둔다.

### REQ-423: 그대로 두는 것
- AC-423.1: Given 이 기능의 모든 커밋, When `git diff --name-only ec58679 -- <경로>`로 보면, Then 아래 경로에 바뀐 파일이 없다: `supabase/` · `src/lib/parsers/` · `src/lib/analytics/` · `src/lib/payload/` · `src/lib/bridge/` · `src/lib/supabase/` · `src/lib/auth/`(`idle.ts`·`idle.test.ts`·`signup.ts`·`signup.test.ts` 밖) · `src/lib/csp.ts` · `src/workers/` · `src/types/` · `src/middleware.ts` · `src/app/api/` · `src/app/auth/` · `src/app/globals.css` · `e2e/` · `.env.example` · `extension/` · `helper/` · `eslint.config.mjs` · `next.config.ts` · `vercel.json` · `package.json` · `package-lock.json`.
- AC-423.2: Given 같은 커밋, When 보면, Then 새 npm 패키지·새 토큰·새 색·새 글꼴·DB·API가 없다.
- AC-423.3: Given 각 Phase 끝, When `python3 ~/.claude/harness/bin/verify`를 돌리면, Then `npm test`·`npm run lint`(경고 0)·`npm run build`가 모두 통과한다.

## 범위 밖
- 아직 없는 기능의 실제 화면(통계·고시·환자·매출·AI 리포트·서식·직원·업무일지·재고·주소록·설정 안 메뉴), 청구 점검 화면과 건수, 대시보드 진짜 자료 연결. 각 기능 명세 몫이다.
- 랜딩 바닥글의 개인정보처리방침·운영 의원·문의처, 가입 동의의 보관 기간, 파비콘(총괄이 이번에 넣지 않기로 함).
- 연결 뒤 원장님 보고 문장의 말투(`dashboard/summary/view.ts`, "…왔습니다."). 지금은 자료가 없어 어느 화면에도 보이지 않고, 원장님께 보내는 글이라 말투는 총괄 확인 뒤 정한다.
- 서비스 이름 정하기, 다크 모드, 새 글꼴·색·토큰, 차트 툴팁.
- 문지기·middleware·로그인 콜백·DB·RLS·API 바꾸기(로그인 안 한 사람의 없는 주소가 `/login`으로 가는 길 포함).
- 운영 사이트에 올리기, 합치기, Vercel 환경 변수 넣기(총괄이 따로 말할 때만).
