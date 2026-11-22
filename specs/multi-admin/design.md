# 설계: 관리자 여럿 · 주 관리자 · 관리자만 보는 탭 (multi-admin)

> 화면 글자는 requirements.md '화면 글자', 자리·모양은 승인된 시안 `docs/mockups/multi-admin/index.html`·`settings.html`·`notes.md`(2026-11-22 "이대로 만들기", 커밋 e9c87ca3)가 기준이다. 이 문서는 자료·함수·나눔을 정한다.

## 흐름
```
[관리자 PC] /admin page.tsx (그대로: guardPage('/admin') → <AdminApplications top={<InstallFilesAdmin />} />)
  AdminApplications 열 때 ─ Promise.all ┬ listApplications()    → from('hospitals') (RLS: 관리자는 모든 병원 — 그대로)
                                        └ listAdminHospitals()  → rpc('admin_hospitals') (정의자 함수, 관리자만, 주 관리자 표시 포함)
  '승인' 탭 줄 [관리자로 정하기]·[관리자 빼기] → 확인 창 → setAdmin(병원 id, true|false) → rpc('set_admin')
        → 되면 손에 든 관리자 표시만 고침(다시 읽지 않음) + 끝 알림 / 실패면 E-ADMIN-ROLE 카드
[다음 화면부터] 새 관리자: readMe()가 admins 내 줄을 읽음 → isAdmin 참 → 계정 메뉴 '가입 승인'·/admin 열림 (gate 그대로)
               뺀 관리자: isAdmin 거짓 → /admin은 /dashboard로 (gate 그대로). 열어 둔 화면의 단추는 함수가 42501로 거부

[모든 앱 화면] (app)/layout (서버) ─ currentMe() (그대로)
  관리자(데스크 아님) → 숨김 없음 (tab_access를 읽지 않는다)
  관리자가 아닌 원장·데스크 → readTabAccessRows() → from('tab_access') 한 번 → adminOnlyTabs(줄) = 숨긴 탭
        → <AppShell hiddenTabs> ┬ TabBar·MoreMenu: 숨긴 탭을 빼고 그림
                                ├ TabGate(숨긴 탭이 있을 때만): 지금 주소가 숨긴 탭 자리면 본문 비우고 router.replace('/dashboard')
                                └ DeskGate(데스크): /dashboard → deskHomeOf(숨긴 탭) (없으면 지금 막힌 화면)
  읽기 실패 → 던짐 → app/error.tsx (E-PAGE-FAILED)

[주 관리자 PC] /settings 맨 아래 TabAccessSettings (브라우저)
  readTabOwner() → from('admins').select('is_owner') (정책 '내 관리자 줄 읽기' 그대로) → 참일 때만
  readTabAccess() → from('tab_access') → 체크 = adminOnlyTabs(줄)
  [저장] → saveTabAccess(체크한 것, 안 한 것) → rpc('set_tab_access') (주 관리자만)
```
- 서버 코드는 늘지 않는다(ADR-004): 새 서버 파일은 인증 예외 안의 읽기 하나(`lib/auth/tabAccess.server.ts`)뿐이고 쓰지 않는다. 그 예외에 '탭 목록'을 더하는 것을 ADR-042와 `CLAUDE.md` 한 줄에 적는다.
- `page.tsx`(가입 승인·설정)·`guard.server.ts`·`hospital.server.ts`·`gate.ts`·`middleware.ts`·`AccountMenu`는 고치지 않는다.
- 새 관리자의 권한은 `admins`를 보는 곳 넷이 저절로 준다: `hospitals` 읽기 정책·`set_hospital_status`(`20261028000000_auth.sql`), 설치 파일 읽기·올리기 규칙(`20261117000000_install_files.sql`·`20261119200000_desk_install_files.sql`), 고시 모으기 실행 기록 읽기(`20261121000000_notices.sql`). 이 파일들은 고치지 않는다(새 칸 `is_owner`는 이 검사들에 영향이 없다).

## 기본값 (사용자가 정하지 않아 Claude·시안이 정한 것)
1. 자기 자신은 정하기·빼기 둘 다 못 한다(사용자에게 알린 기본값). 화면은 내 줄에 `내 계정`, DB는 22023.
2. 두 관리자가 서로를 같은 때 빼도 0명이 되지 않게: `set_admin`은 부른 사람의 `admins` 줄을 `for update`로 잠그며 관리자인지 본다. 한쪽이 먼저 끝나면 다른 쪽은 기다렸다가 '관리자 아님'(42501), 엇갈려 잠그면 교착(40P01)으로 한쪽만 실패한다. (PGlite는 연결이 하나라 이 경우는 시험하지 못한다 — '위험'.) 주 관리자는 빠지지 않으므로 관리자는 늘 한 명 이상이다.
3. 이미 관리자인 사람을 다시 정하거나 관리자가 아닌 사람을 빼면 오류 없이 그대로다(두 관리자가 같은 줄을 같이 눌러도 둘 다 '됨').
4. '내 줄'·'주 관리자 줄'은 화면이 따로 알지 않고 `admin_hospitals()`의 `is_me`·`is_owner`(DB)로 안다 — 함수의 거부와 같은 기준이고, `page.tsx`·`page.test.tsx`(페이지 props가 `top` 하나인지 보는 시험)를 고치지 않으려고. 함수 이름은 공통 안내의 예시 `admin_hospital_ids` 대신 `admin_hospitals`(id와 표시를 같이 준다).
5. 관리자 목록 읽기 실패는 신청 목록 읽기 실패와 같이 화면 오류(`E-PAGE-FAILED` + [다시 시도])다 — 틀린 단추를 보일 바에는 멈춘다. 그래서 SQL을 사이트보다 먼저 붙인다('배포 순서').
6. `admin_hospitals()`는 관리자가 아니면 빈 목록이 아니라 42501이다(가입 승인 화면은 관리자만 열어 다른 사람이 부를 일이 없다).
7. 관리자 표시는 '승인' 탭에만 있다(함수가 승인된 병원만 준다). 승인된 병원은 다시 대기·거절이 되지 않으므로(`set_hospital_status`가 approved에서 바꾸지 않음) 관리자 줄이 다른 탭으로 옮겨 가지 않는다.
8. (시안) '승인' 탭 동작 칸의 '승인됨' 칩은 없앤다. 칸에는 단추 하나나 `내 계정` 하나만, 남이 보는 주 관리자 줄은 빈칸(150px 칸에 칩과 단추가 함께 들어가지 않고, 탭이 이미 '승인'이다).
9. (시안) 동작 칸은 1023px 이하에서도 150px(`w-37.5`, 지금의 `max-lg:w-35` 140px를 뺀다 — 140px이면 [관리자로 정하기]가 0.2px 남는다). 다른 칸 폭은 그대로다. 1024px에서 `주 관리자` 칩 줄의 이름은 더 일찍 말줄임된다(시안 '칸 폭', 지금 규칙과 같음).
10. 정하기·빼기가 되면 초점은 지금 탭으로, 실패하면 처음 누른 줄 단추로(지금 승인·거절과 같은 규칙, 시안 그대로).
11. 실패 번호는 새 `E-ADMIN-ROLE`(지금 `E-ADMIN-FAILED`의 '신청 상태를 바꾸지 못했어요'는 뜻이 다르다). 글은 시안 `notes.md`.
12. 확인 창 셋(거절·정하기·빼기)은 지금 `RejectDialog`를 넓힌 부품 하나다(제목·본문·확인 단추 글·확인 단추 모양만 다름). 그래서 거절 창에 이미 있는 폰 단추 반씩(`max-md:flex-1`)도 세 창이 같이 쓰고, 이 일이 새로 쓰는 `max-md:` 클래스는 없다. 확인 창이 떠 있는 동안 앞 완료 줄은 그대로 둔다(지금 거절 창과 같음).
13. 줄 단추 둘은 `ds.button.secondarySmall`(32px, 지금 [거절]·[되돌리기]와 같은 크기 — 공통 안내의 'ds.button.secondary'를 시안이 표 안 작은 단추로 정함). 확인 단추는 정하기 `ds.button.primary`, 빼기 `ds.button.danger`.
14. 주 관리자 줄로 `set_admin`을 부르면 참·거짓 모두 22023이다(빼기는 금지, 정하기는 이미 관리자라 할 일이 없다 — 화면도 단추가 없다). 주 관리자를 바꾸는 길은 SQL 편집기뿐이다.
15. 주 관리자 정하기: 파일 맨 앞 검사가 바꾸기 전에 멈춘다. 주 관리자가 이미 있으면(두 번째 실행) 후보 수를 보지 않고 건너뛴다 — 그 사이 다른 구글 원장을 관리자로 정해도 다시 돌릴 수 있다. 오류 글은 `first-admin.sql`과 같은 말투('DB' 절).
16. `tab_access`는 DB가 탭 이름 목록을 모른다(경로 모양만 검사). 새 탭이 생겨도 DB를 고치지 않고 '줄 없음 = 관리자만'이 된다. 앱 목록(`TAB_ACCESS_MENU`) 밖 경로 줄은 앱이 버린다. 지우는 함수는 없다(줄이 남아도 해가 없다).
17. 저장은 12개를 한꺼번에(함수 한 번 = 한 트랜잭션). 체크 = '관리자만'.
18. 숨긴 탭 목록은 서버(앱 틀 레이아웃)가 그리기 전에 읽는다 → 메뉴가 보였다 사라지거나 숨긴 화면이 잠깐 보이지 않는다. 돌려보내기는 서버가 할 수 없어 브라우저 부품(`TabGate`, `DeskGate`와 같은 방식)이 주소마다 한다 — 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않으며, middleware는 DB를 읽지 않는다(설계 그대로). 돌려보내는 동안 본문을 비워 숨긴 화면의 자료 읽기가 돌지 않는다.
19. 바꾼 목록은 다른 계정이 다음에 화면을 새로 열 때(새로 고침·다시 로그인·새 창) 적용된다. 열어 둔 화면의 메뉴는 그대로일 수 있다.
20. 목록 읽기 실패는 막는 쪽: 관리자가 아닌 계정은 오류 화면(`E-PAGE-FAILED` + [다시 시도]). 숨긴 탭을 열어 두거나 틀린 메뉴를 보이지 않는다. 그래서 SQL을 먼저 붙인다.
21. 관리자 여부는 지금 `readMe`의 `isAdmin`(데스크는 거짓)이다. 관리자는 목록을 읽지 않는다. `generateMetadata`도 읽지 않는다(탭 이름에 쓰지 않음, `notFound.test.tsx`가 레이아웃의 `generateMetadata`만 부른다).
22. 데스크(공통 안내와 다른 곳): 데스크의 `/dashboard`는 이미 `DeskGate`가 데스크 첫 화면으로 바꾸는 주소라, 숨긴 데스크 탭 → `/dashboard` → 숨기지 않은 첫 데스크 탭(수납일지 → 업무일지 → 예약)이 된다. 셋 다 숨기면 데스크는 지금 막힌 화면만 본다(그 안 [수납일지로 가기]도 그 화면으로 돌아온다). 끝없이 돌지 않는다.
23. [더보기] 판 머리의 수는 보이는 항목 수다. 판에는 늘 설정이 있어 [더보기]가 비지 않는다. 숨긴 탭이 없으면 `TabGate`를 그리지 않아 지금 앱 틀과 같다(지금 시험들이 `useRouter` 흉내 없이 `AppShell`을 그린다).
24. 주 관리자 확인은 설정 칸이 브라우저에서 `admins` 내 줄의 `is_owner`로 한다(정책 '내 관리자 줄 읽기' 그대로, 관리자가 아니면 줄이 안 보여 거짓) — `readMe`·설정 `page.tsx`와 그 시험을 고치지 않으려고. 확인이 실패하면 칸을 그리지 않는다(주 관리자가 아닌 계정에 이 칸이나 그 오류를 보이지 않는다, 주 관리자는 새로 고치면 된다).
25. 칸은 확인·목록 읽기가 둘 다 끝난 뒤 나타난다(읽는 중 글 없음 — 맨 아래 칸이고 다른 계정에는 없는 칸이라). 목록 읽기 실패는 다른 설정 칸처럼 `E-SETTINGS-FAILED` + [다시 불러오기].
26. 대시보드 안 기능 칸·링크·브리핑, 탭 안 작은 메뉴는 그대로다(범위 밖) — 숨긴 탭 링크를 누르면 대시보드로 돌아온다. 사용자에게 알린다.

## ADR-041 (TASK-1이 `docs/ADR.md` 끝에 넣는 글. ADR-040은 다른 갈래가 쓴다 — 합칠 때 그 갈래가 먼저 들어와도 번호는 041 그대로)
### ADR-041: 관리자를 여럿 둔다 — 관리자가 가입 승인 화면에서 승인된 원장 계정을 관리자로 정하고 뺀다 (admins는 SQL 편집기로만 → `set_admin` 함수)
**맥락**: 지금까지 `admins`는 운영자 한 줄이고 SQL 편집기로만 넣었다(`20261028000000_auth.sql` 끝 주석·`supabase/first-admin.sql`, plan.md §5 "운영자(나) 1줄"). 2026-11-22 사용자: "지금은 나만 가입 승인할 수 있는데, 내가 지정한 사람도 가입 승인할 수 있게"
**결정** (사용자, `specs/multi-admin`):
- 새 관리자는 이미 승인된 병원(`hospitals.status = 'approved'`)의 주인(`owner_id`) 계정이다. 역할 칸·따로 계정을 만들지 않고 `admins`에 그 사람 줄을 넣는다 → 권한은 지금 관리자와 똑같다(가입 승인·거절·되돌리기, 설치 파일 올리기, 고시 모으기 기록 읽기 — 모두 `admins`를 보는 곳). 문지기는 그대로다
- 정하기·빼기는 관리자 누구나, 가입 승인 화면 '승인' 탭 줄에서 한다. 쓰기는 정의자 함수 `set_admin(병원 id, 참/거짓)` 하나로만(`admins` 표 쓰기 권한은 여전히 아무에게도 없다). 누가 관리자인지는 정의자 함수 `admin_hospitals()`가 관리자에게만 준다 — `admins` 정책 안에서 `admins`를 다시 읽으면 무한 되부름(42P17)이라 정책은 '내 관리자 줄 읽기' 그대로 둔다
- 자기 자신과 주 관리자(ADR-042)는 정하거나 뺄 수 없다(화면은 단추가 없고 함수도 거부) → 관리자가 0명이 되지 않는다. 두 관리자가 서로를 같은 때 빼도 함수가 부른 사람의 줄을 잠가 한쪽만 된다
- 처음 관리자는 지금처럼 SQL 편집기(`first-admin.sql`)로 넣는다. 그 파일과 `20261028000000_auth.sql` 머리 주석은 옛 판 그대로 두고, 바뀐 점은 `20261122000000_multi_admin.sql` 머리 주석에 적는다
**이유**: 사용자 결정(2026-11-22). 같은 표·같은 검사를 쓰면 새 권한 길이 생기지 않는다
**대안**: (1) 역할 칸(승인만 하는 관리자 등) — 사용자가 "원장님과 똑같이"를 골랐다. (2) 승인 전용 따로 계정 — 사용자가 "이미 가입한 원장 계정"을 골랐다. (3) 계속 SQL 편집기로만 — 운영자가 매번 SQL을 붙여야 한다. (4) `admins` 읽기 정책 넓히기 — 무한 되부름
**트레이드오프**: 관리자는 누구든 다른 관리자를 뺄 수 있다(주 관리자만 빼지 못한다). 누가 언제 정하고 뺐는지 기록이 없다. 관리자는 모든 병원의 가입 신청 줄(의원 이름·신청자·메일·연락처)과 고시 모으기 비용 기록을 본다 — 다른 병원 원장을 정하면 그 사람도 본다. 뺀 관리자는 다음 화면부터 가입 승인 화면이 막힌다(열어 둔 화면의 단추는 함수가 거부)
**바꾸는 것**: `plan.md` §2-1 한 줄·§5 DB 표 `admins` 줄, `docs/ARCHITECTURE.md` DB 표 `admins` 줄·'인증·승인 흐름' 한 줄 (아래 '문서 줄')

## ADR-042 (TASK-1이 ADR-041 다음에 넣는 글)
### ADR-042: 관리자만 보는 탭 — 메뉴와 주소만 막고 자료 권한(RLS)은 그대로 둔다. 목록은 공용 표 `tab_access` 한 벌이고 앱 틀 서버가 읽는다 (ADR-004 인증 예외 넓힘 · ADR-037 같은 공용 표 예외)
**맥락**: 2026-11-22 사용자: "관리자 계정만 볼 수 있는 탭 목록을 만들고, 지금 있는 탭도 몇 개는 관리자만 보게. 그 목록은 나만 정하게."
**결정** (사용자, `specs/multi-admin`):
- 주 관리자 = 원장님(운영자) 계정 하나(`admins.is_owner`, 참인 줄은 하나만 — 부분 유일 색인). migration이 정한다(구글로 들어왔고 메일 앞부분에 `e2e-`가 없고 `admins`에 있는 계정이 정확히 하나일 때만, 아니면 아무것도 바꾸지 않고 멈춤). 주 관리자는 아무도 관리자에서 못 뺀다(`set_admin` 거부). 바꾸려면 SQL 편집기
- 탭마다 '관리자만'을 공용 표 `tab_access`(`path`·`admin_only`, `hospital_id` 없음)에 둔다. 줄이 없는 탭 = 관리자만(새 탭은 처음엔 관리자만). 처음 실행이 지금 탭 12개를 모두 '모두에게'로 넣는다. 대시보드·설정은 늘 보이고 목록 밖, `/admin`은 원래 관리자만이라 목록 밖. 읽기는 로그인한 사람 모두, 쓰기는 정의자 함수 `set_tab_access`로 주 관리자만. 고르는 곳은 설정 맨 아래 칸(주 관리자에게만 보임)
- 관리자만 탭은 관리자가 아닌 원장(다른 병원 포함)·데스크에게 메뉴(탭 띠·[더보기])에서 빠지고, 주소로 오면 말 없이 `/dashboard`로 간다(데스크는 숨기지 않은 첫 데스크 탭). 관리자에게는 다 보인다
- **보이기만 막는다**: 그 탭이 쓰는 표·함수 권한(RLS)은 바꾸지 않는다. 관리자가 아닌 계정도 RLS가 허락하는 자기 병원 자료는 여전히 읽고 쓸 수 있다(메뉴와 화면이 없을 뿐)
- 앱 틀 레이아웃(서버)이 관리자가 아닌 계정을 그릴 때 `tab_access`를 한 번 읽는다(`lib/auth/tabAccess.server.ts`) → ADR-004 인증 예외(세션·내 병원·관리자·데스크 줄·병원 정보 이름)에 '관리자만 보는 탭 목록'을 더한다. 읽기만 하고 쓰지 않는다. 돌려보내기는 브라우저 부품(`TabGate`)이 한다 — 레이아웃은 지금 주소를 모르고 옆 화면으로 옮길 때 다시 그려지지 않으며, middleware는 DB를 읽지 않는다
**이유**: 사용자 결정. 메뉴가 깜빡이거나 숨긴 화면이 잠깐 보이지 않게 서버가 그리기 전에 읽는다. 탭마다 RLS를 고치면 표 수십 개의 정책을 바꿔야 하고 데스크 권한(ADR-031)과 엇갈린다
**대안**: (1) 탭마다 RLS로 자료까지 막기 — 바꿀 정책이 많고 틀리기 쉽다, 사용자가 '보이기'를 골랐다. (2) 브라우저가 목록을 읽기 — 화면을 열 때마다 읽는 동안 메뉴·본문을 숨기거나 깜빡인다. (3) middleware에서 막기 — middleware는 DB를 읽지 않는다(설계). (4) 코드 상수 목록 — 사용자가 화면에서 직접 정하기를 골랐다
**트레이드오프**: Supabase를 직접 부르면 숨긴 탭의 자료도 RLS가 허락하는 만큼(자기 병원 자료)은 읽힌다. 바꾼 목록은 다른 계정이 화면을 새로 열 때 적용된다. 목록 읽기가 실패하면 관리자가 아닌 계정은 앱 오류 화면을 본다(SQL을 먼저 붙여야 한다). 대시보드 안 기능 칸 링크는 그대로라 숨긴 탭을 누르면 대시보드로 돌아온다
**바꾸는 것**: `CLAUDE.md` 아키텍처 규칙의 인증 예외 한 줄, `docs/ARCHITECTURE.md` 서버 코드 줄·공용 표 예외 줄·DB 표 `admins` 줄과 새 `tab_access` 줄·'인증·승인 흐름' 한 줄, `plan.md` §2-1 한 줄·§5 DB 표 `admins` 줄과 새 `tab_access` 줄 (아래 '문서 줄')

## DB (`supabase/migrations/20261122000000_multi_admin.sql`, 사용자가 SQL Editor에 붙여 넣음)
머리 주석은 본보기 `20261119400000_hospital_emr.sql` 모양: 무엇(관리자 정하기·빼기 함수 둘 · 주 관리자 표시 · 관리자만 보는 탭 표와 고치는 함수, spec multi-admin REQ-7701·REQ-7705, ADR-041·ADR-042) · 실행(SQL Editor에 전체를 붙여 한 번) · 먼저 `20261028000000_auth.sql`과 `first-admin.sql`(운영자가 `admins`에 있어야 함) · 두 번 붙여도 그대로(주 관리자는 없을 때만 정하고, 칸·표·색인은 없을 때만 만들고, 탭 줄은 없을 때만 넣고, 함수는 바꿔 쓰고 권한은 거두고 다시 준다) · 멈춤(주 관리자 후보가 하나가 아니면 아무것도 바꾸지 않고 오류) · 관문(이 파일 먼저, 그다음 사이트 — 없으면 가입 승인 화면이 관리자 목록을 못 읽고, 관리자가 아닌 계정은 앱 오류 화면) · 무엇을 왜 · 권한. `hospitals` 표·칸·정책과 `admins` 정책·표 권한은 고치지 않는다.

```sql
-- ① 검사만(바꾸기 전에 멈춘다): 주 관리자가 아직 없으면 후보가 정확히 하나여야 한다. 이미 있으면 건너뛴다(두 번째 실행)
do $$
declare
  v_has_owner boolean := false;
  v_count integer;
begin
  if exists (select 1 from information_schema.columns
              where table_schema = 'public' and table_name = 'admins' and column_name = 'is_owner') then
    execute 'select exists (select 1 from public.admins where is_owner)' into v_has_owner;
  end if;
  if v_has_owner then
    return;
  end if;
  select count(*) into v_count
    from auth.users u
    join public.admins a on a.user_id = u.id
   where u.raw_app_meta_data -> 'providers' ? 'google'
     and split_part(lower(u.email), '@', 1) not like '%e2e-%';
  if v_count = 0 then
    raise exception '주 관리자로 정할 계정(구글로 들어온 관리자, 시험 계정 빼고)이 0개예요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
  elsif v_count > 1 then
    raise exception '주 관리자로 정할 계정(구글로 들어온 관리자, 시험 계정 빼고)이 2개 이상이에요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
  end if;
end;
$$;

-- ② 주 관리자 표시 칸. 참인 줄은 하나만(부분 유일 색인). 쓰기 권한은 여전히 아무에게도 없다(내 줄 읽기만)
alter table public.admins add column if not exists is_owner boolean not null default false;
create unique index if not exists admins_one_owner on public.admins (is_owner) where is_owner;

-- ③ 관리자만 보는 탭(공용 표, hospital_id 없음 — ADR-042). 줄 없는 탭 = 관리자만
create table if not exists public.tab_access (
  path text primary key
    check (path ~ '^/[a-z][a-z0-9-]*$' and path not in ('/dashboard', '/settings', '/admin')),
  admin_only boolean not null
);
alter table public.tab_access enable row level security;
revoke all on table public.tab_access from anon, authenticated;
grant select on table public.tab_access to authenticated;
drop policy if exists "로그인한 사람 모두 탭 목록 읽기" on public.tab_access;
create policy "로그인한 사람 모두 탭 목록 읽기" on public.tab_access
  for select to authenticated
  using (true);
-- 지금 탭 12개는 모두 '모두에게'(지금 보이는 그대로). 이미 있는 줄(주 관리자가 바꾼 값)은 그대로
insert into public.tab_access (path, admin_only) values
  ('/stats', false), ('/claim', false), ('/notices', false), ('/patients', false),
  ('/worklog', false), ('/sunap', false), ('/calendar', false), ('/ai-report', false),
  ('/forms', false), ('/staff', false), ('/inventory', false), ('/contacts', false)
on conflict (path) do nothing;

-- ④ 관리자 표시: 주인이 관리자인 승인된 병원 · 부른 사람 자신의 병원인지 · 주 관리자 병원인지. 관리자만
create or replace function public.admin_hospitals()
returns table (hospital_id uuid, is_me boolean, is_owner boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select h.id, h.owner_id = (select auth.uid()), a.is_owner
      from public.hospitals h
      join public.admins a on a.user_id = h.owner_id
     where h.status = 'approved';
end;
$$;

-- ⑤ 관리자 정하기(p_admin true)·빼기(false). 관리자만, 승인된 남의 병원 주인만, 주 관리자 줄은 못 바꾼다
create or replace function public.set_admin(p_hospital_id uuid, p_admin boolean)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_owner uuid;
begin
  -- 부른 사람의 관리자 줄을 잠그며 본다: 두 관리자가 서로를 같은 때 빼도 한쪽만 된다(0명이 되지 않게)
  perform 1 from public.admins a where a.user_id = (select auth.uid()) for update;
  if not found then
    raise exception 'not an admin' using errcode = '42501';
  end if;

  select h.owner_id into v_owner from public.hospitals h where h.id = p_hospital_id and h.status = 'approved';
  if v_owner is null or p_admin is null or v_owner = (select auth.uid())
     or exists (select 1 from public.admins o where o.user_id = v_owner and o.is_owner) then
    raise exception 'admin change not allowed' using errcode = '22023';
  end if;

  if p_admin then
    insert into public.admins (user_id) values (v_owner) on conflict (user_id) do nothing;
  else
    delete from public.admins a where a.user_id = v_owner;
  end if;
end;
$$;

-- ⑥ 관리자만 보는 탭 저장(주 관리자만). 보낸 경로만 넣거나 고친다(p_admin_only 참, p_everyone 거짓). 지우지 않는다
create or replace function public.set_tab_access(p_admin_only text[], p_everyone text[])
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_all text[];
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid()) and a.is_owner) then
    raise exception 'not the owner' using errcode = '42501';
  end if;
  if p_admin_only is null or p_everyone is null then
    raise exception 'tab access not allowed' using errcode = '22023';
  end if;
  v_all := p_admin_only || p_everyone;
  if exists (select 1 from unnest(v_all) p
              where p is null or p !~ '^/[a-z][a-z0-9-]*$' or p in ('/dashboard', '/settings', '/admin'))
     or (select count(*) from unnest(v_all)) <> (select count(distinct p) from unnest(v_all) p) then
    raise exception 'tab access not allowed' using errcode = '22023';
  end if;
  insert into public.tab_access (path, admin_only)
    select p, true from unnest(p_admin_only) p
    union all
    select p, false from unnest(p_everyone) p
  on conflict (path) do update set admin_only = excluded.admin_only;
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 연다. 거두고 authenticated에만 준다
revoke all on function public.admin_hospitals() from public, anon, authenticated;
grant execute on function public.admin_hospitals() to authenticated;
revoke all on function public.set_admin(uuid, boolean) from public, anon, authenticated;
grant execute on function public.set_admin(uuid, boolean) to authenticated;
revoke all on function public.set_tab_access(text[], text[]) from public, anon, authenticated;
grant execute on function public.set_tab_access(text[], text[]) to authenticated;

-- ⑦ 주 관리자 정하기(①이 후보 하나를 이미 확인했다. 이미 있으면 바꾸지 않는다)
update public.admins a
   set is_owner = true
 where not exists (select 1 from public.admins o where o.is_owner)
   and a.user_id = (
     select u.id
       from auth.users u
       join public.admins b on b.user_id = u.id
      where u.raw_app_meta_data -> 'providers' ? 'google'
        and split_part(lower(u.email), '@', 1) not like '%e2e-%'
   );
```
- SQL Editor는 붙인 글 전체를 한 번에 돌려 중간 오류면 모두 되돌린다. 그래도 ①을 맨 앞에 두어 어느 경우든 바꾸기 전에 멈춘다(AC-7705.2 시험은 PGlite에서 칸·표·함수가 없는지 본다).
- 두 번째 실행: ①은 주 관리자가 있어 건너뛰고, ②③은 없을 때만, ④⑤⑥은 바꿔 쓰고, ⑦은 `not exists`로 아무것도 바꾸지 않는다.

## 문서 줄 (TASK-1)
- `CLAUDE.md` 아키텍처 규칙 셋째 줄(사용자가 명세를 승인하면 이 한 줄을 바꾼다): "… 로그인 콜백·middleware·페이지 guard(`*.server.ts`)는 세션과 내 병원·관리자·데스크 줄과 병원 정보 이름만 읽고 쓰지 않는다 (ADR-004·ADR-031·ADR-033)" → "… 세션과 내 병원·관리자·데스크 줄, 병원 정보 이름, 관리자만 보는 탭 목록(공용 표 `tab_access`)만 읽고 쓰지 않는다 (ADR-004·ADR-031·ADR-033·ADR-042)". 다른 줄은 고치지 않는다.
- `docs/ARCHITECTURE.md`
  - 서버 코드 줄 "예외: 인증(콜백·middleware·페이지 guard)은 세션과 내 줄만 읽는다 (ADR-004)" → "… 세션과 내 줄, 관리자만 보는 탭 목록만 읽는다 (ADR-004·ADR-042)".
  - DB 표 머리 '예외:' 줄 끝에 " · 관리자만 보는 탭 `tab_access`도 병원과 상관없는 한 벌이다 (ADR-042)".
  - DB 표 `admins` 줄 → "관리자 줄(`user_id`·`is_owner` 주 관리자 표시, 참인 줄은 하나). 처음 한 줄(운영자)은 SQL 편집기로(`first-admin.sql`) 넣고 `20261122000000_multi_admin.sql`이 주 관리자로 표시한다. 그 뒤는 관리자가 가입 승인 화면 '승인' 탭에서 승인된 원장 계정을 정하고 뺀다 — 정의자 함수 `set_admin`·`admin_hospitals`(관리자만, 자기 자신·주 관리자는 못 바꿈). 사용자 표 권한은 내 줄 읽기뿐 (ADR-041·ADR-042, specs/multi-admin)".
  - DB 표 `admins` 줄 다음에 새 줄 "| `tab_access` | 관리자만 보는 탭(공용 표, `hospital_id` 없음): `path`(탭 주소, `/dashboard`·`/settings`·`/admin` 빼고)·`admin_only`. 줄 없는 탭 = 관리자만. 읽기는 로그인한 사람 모두, 쓰기는 정의자 함수 `set_tab_access`(주 관리자만). 관리자가 아닌 계정의 메뉴·주소만 막고 RLS는 그대로 (ADR-042, specs/multi-admin) |".
  - '인증·승인 흐름'의 "승인·거절은 DB 함수 하나가 한다 …" 줄 다음에 "- 관리자는 여럿일 수 있다. 관리자가 가입 승인 화면에서 승인된 원장 계정을 관리자로 정하고 뺀다(권한은 모두 같음, 자기 자신·주 관리자는 못 뺌, ADR-041). 주 관리자는 설정에서 관리자만 보는 탭을 고르고, 앱 틀이 관리자가 아닌 계정의 메뉴에서 빼고 주소를 대시보드로 돌린다(ADR-042)".
- `plan.md`
  - §2-1 끝에 "- 관리자는 여럿 둘 수 있다: 관리자가 가입 승인 화면 '승인' 탭에서 승인된 원장 계정을 관리자로 정하고 뺀다. 권한은 모두 같고 자기 자신은 못 뺀다. 원장님 계정은 주 관리자라 아무도 못 빼고, 주 관리자만 설정에서 '관리자만 보는 탭'을 고른다(관리자가 아닌 계정의 메뉴에서 빠지고 주소는 대시보드로, 자료 권한은 그대로) **(사용자, 2026-11-22, ADR-041·ADR-042)**".
  - §5 DB 표 `admins` 줄 → "관리자. 처음 한 줄(운영자)은 SQL로 넣고 주 관리자로 표시한다. 그 뒤는 관리자가 화면에서 정하고 뺀다(ADR-041·ADR-042)", 그 다음에 새 줄 "| `tab_access` | 관리자만 보는 탭(공용 표). 줄 없는 탭은 관리자만, 주 관리자가 설정에서 고른다 (ADR-042, specs/multi-admin) **(사용자, 2026-11-22)** |".

## 관리자 브라우저 함수 (`src/lib/auth/admin.ts`, TASK-2)
```ts
/** 주인이 관리자인 승인된 병원 하나. mine = 내(부른 관리자) 병원, owner = 주 관리자 병원 */
export type AdminMark = { hospitalId: string; mine: boolean; owner: boolean }

/** '승인' 탭 관리자 표시. rpc('admin_hospitals') 한 번. 실패 → AdminError('관리자 목록을 읽지 못했어요', { cause }) */
export async function listAdminHospitals(): Promise<AdminMark[]>

/** 정하기(true)·빼기(false). rpc('set_admin', { p_hospital_id, p_admin }) 한 번, 저절로 다시 부르지 않는다.
 *  실패 → AdminError('관리자를 바꾸지 못했어요', { cause }) */
export async function setAdmin(hospitalId: string, admin: boolean): Promise<void>
```
- 답은 믿지 않는다: 목록이 아니거나 줄이 `{ hospital_id: string, is_me: boolean, is_owner: boolean }` 모양이 아니면 `AdminError`(막는 쪽 — 틀린 표시로 그리지 않는다).
- 본보기는 같은 파일의 `setHospitalStatus`(try/catch → `AdminError`, `result.error` → `AdminError`). `listApplications`·`setHospitalStatus`·`Application`은 그대로다.

## 오류 번호 (TASK-2가 `src/types/errors.ts`·`src/lib/errors.ts`에 넣음, 글은 시안 `notes.md` 그대로)
| 번호 | what | fix | 언제 |
|---|---|---|---|
| E-ADMIN-ROLE | `관리자를 정하거나 빼지 못했어요` | `인터넷 연결을 확인하고 다시 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요.` | `setAdmin` 실패 |
- `ErrorCode`의 인증 줄(`'E-ADMIN-FAILED'` 옆)에 둔다. `errors.test.ts`의 `ALL_CODES`·`AUTH_CODES`에 한 줄씩(그래서 '오류 번호와 함께 문의해 주세요'·'병원' 없음·'니다.' 없음 시험도 같이 지난다).
- 설정 칸은 지금 `E-SETTINGS-FAILED`를 그대로 쓴다(새 번호 없음, 시안 결정). 목록 읽기 실패는 오류 화면 `E-PAGE-FAILED`(지금 번호).

## '승인' 탭 화면 (TASK-4 — `src/components/admin/`)
- `applications.ts`(순수):
  ```ts
  export type AdminRole = 'mine' | 'owner' | 'admin' | 'none'
  /** 그 병원 줄의 동작 칸 표시: 내 병원 'mine'(주 관리자 자신 포함), 그 밖의 주 관리자 병원 'owner', 다른 관리자 'admin', 아니면 'none' */
  export function adminRoleOf(marks: readonly AdminMark[], hospitalId: string): AdminRole
  /** 의원 이름 뒤 표 글자: 주 관리자 병원 '주 관리자', 다른 관리자 병원 '관리자'(내 줄 포함), 아니면 null */
  export function adminBadgeOf(marks: readonly AdminMark[], hospitalId: string): '주 관리자' | '관리자' | null
  /** 정함: 없으면 { hospitalId, mine: false, owner: false }를 더함 / 뺌: 그 id를 뺌. 받은 목록은 그대로 두고 새 목록 */
  export function withAdmin(marks: readonly AdminMark[], hospitalId: string, admin: boolean): AdminMark[]
  /** `${name} 계정을 관리자로 정했어요.` / `${name} 계정을 관리자에서 뺐어요.` */
  export function adminDoneMessage(name: string, admin: boolean): string
  ```
- `AdminApplications.tsx`:
  - `INTRO`를 requirements.md '화면 글자' 전체로.
  - 읽기: `Promise.all([listApplications(), listAdminHospitals()])` → `rows`·`marks`를 함께 둔다(둘 다 오기 전에는 `null` = 읽는 중, 지금처럼 `aria-busy`). 실패는 지금처럼 그리기 중에 던진다. 떠난 뒤 온 답은 버린다(`alive`).
  - 실패 상태를 참거짓에서 번호로: `failed: 'E-ADMIN-FAILED' | 'E-ADMIN-ROLE' | null` → 같은 자리 `<ErrorCard code={failed} />`.
  - 확인 창 상태 `{ row: Application; kind: 'reject' | 'add' | 'remove' } | null`. 창 부품은 지금 `RejectDialog`를 넓힌 `ConfirmDialog({ row, title, body, confirmLabel, confirmClass, onCancel, onConfirm })` 하나(같은 파일에 두거나 `ConfirmDialog.tsx`로 옮김 — 클래스·초점·Esc·Tab 처리 글자는 그대로). `confirmClass`는 거절·빼기 `ds.button.danger`, 정하기 `ds.button.primary`.
  - `changeAdmin(row, admin, origin)`: 지금 `change`와 같은 틀(`busy`·`focusAfterRef`·`focusTick`). 되면 `marks = withAdmin(…)`, `message = adminDoneMessage(row.name, admin)`, `failed = null`, 초점 `'tab'`. 실패면 `message = ''`, `failed = 'E-ADMIN-ROLE'`, 초점 `origin`. 목록을 다시 읽지 않는다.
  - 의원 이름 칸: `adminBadgeOf`가 `null`이 아닌 승인 줄은 칸 안을 `flex min-w-0 items-center gap-1.5` 묶음으로 — 이름 `span.truncate` + `<span className={ds.chip.accent}>{표 글자}</span>`(시안: 이름 바로 뒤 6px, 이름만 말줄임). 칸의 클래스·`title`(이름)은 그대로. 관리자가 아닌 줄은 지금 그대로.
  - 동작 칸(승인 줄): `'mine'` → `<span className="text-small text-muted">내 계정</span>`, `'owner'` → 빈칸(칸 `td`만), `'admin'` → [관리자 빼기], `'none'` → [관리자로 정하기](둘 다 `ds.button.secondarySmall`, `disabled={busy}`) → 누르면 확인 창. '승인됨' 칩·`CheckIcon size 12` 쓰임은 빠진다(`CheckIcon`은 완료 줄이 계속 쓴다).
  - `COLUMNS`의 동작 칸 폭 `'w-37.5 max-lg:w-35 md:text-right'` → `'w-37.5 md:text-right'`(기본값 9). 다른 칸 폭은 그대로.
  - 새로 더하는 요소에 `max-md:` 클래스를 쓰지 않는다(기본값 12).
- `docs/UI_GUIDE.md` '관리자': "관리자 표 줄에는 상태 칩을 두지 않는다 … 승인 줄의 '승인됨' 완료 칩만 둔다" → "… '승인' 탭 줄 의원 이름 뒤 `관리자`·`주 관리자` 칩(`accent`)만 둔다(multi-admin)", 동작 줄 "승인 '승인됨'(positive 칩)" → "승인 [관리자로 정하기]·[관리자 빼기](보조 작은)·내 줄 `내 계정`(small muted)·남이 보는 주 관리자 줄은 빈칸", 칸 폭 줄 "768~1023px: … 동작 140" → "동작은 150 그대로". 색 표의 `positive` 칸 '승인됨' 낱말은 빼고 `accent` 칸에 '관리자·주 관리자(가입 승인 표)'를 더한다.

## 탭 목록 함수 (TASK-3)
- `src/components/shell/menu.ts`에 더함(지금 내보내는 것·`MENU` 항목 모양은 그대로 — `shell.test.tsx`·`tabFrame.test.tsx`가 항목을 `toEqual`로 본다):
  ```ts
  /** '관리자만 보는 탭' 목록(MENU 차례, 대시보드·설정 뺌 — 늘 보임). 12개 */
  export const TAB_ACCESS_MENU: readonly MenuItem[]
  /** tab_access 한 줄 */
  export type TabAccessRow = { path: string; adminOnly: boolean }
  /** 답 모양 검사: [{ path: string, admin_only: boolean }]만 → TabAccessRow[], 아니면 null(막는 쪽) */
  export function toTabAccessRows(data: unknown): TabAccessRow[] | null
  /** 관리자가 아닌 계정에게 숨길 탭: TAB_ACCESS_MENU 가운데 줄이 없거나 adminOnly 참(MENU 차례). 목록 밖 줄은 버린다 */
  export function adminOnlyTabs(rows: readonly TabAccessRow[]): MenuPath[]
  /** 지금 주소가 숨긴 탭 자리인가 — path·owns 중 가장 길게 맞는 자리(currentMenuLabel과 같음)가 숨긴 탭이면 참 */
  export function isHiddenPath(pathname: string, hidden: readonly MenuPath[]): boolean
  /** 데스크 첫 화면: DESK_HOME, 숨겼으면 DESK_MENU 차례로 숨기지 않은 첫 탭. 셋 다 숨김이면 null */
  export function deskHomeOf(hidden: readonly MenuPath[]): MenuPath | null
  ```
- `src/lib/auth/tabAccess.server.ts`(첫 줄 `import 'server-only'`, `hospital.server.ts`와 같은 모양):
  ```ts
  /** 읽지 못함(표 없음·권한·장애·모양 틀림) — 던져서 오류 화면(E-PAGE-FAILED) */
  export class TabAccessReadError extends Error {}
  /** tab_access 모든 줄. from('tab_access').select('path, admin_only') 한 번, 쓰지 않는다 */
  export async function readTabAccessRows(): Promise<TabAccessRow[]>
  ```
- `src/lib/storage/tabAccess.ts`(브라우저, `lib/storage/desk.ts`처럼 `supabaseBrowser`):
  ```ts
  export class TabAccessError extends Error {}
  /** 내가 주 관리자인가: from('admins').select('is_owner').maybeSingle() 한 번(RLS가 내 줄만 준다). 줄 없음 → false */
  export async function readTabOwner(): Promise<boolean>
  /** from('tab_access').select('path, admin_only') 한 번 → toTabAccessRows */
  export async function readTabAccess(): Promise<TabAccessRow[]>
  /** rpc('set_tab_access', { p_admin_only, p_everyone }) 한 번, 저절로 다시 부르지 않는다 */
  export async function saveTabAccess(adminOnly: readonly MenuPath[], everyone: readonly MenuPath[]): Promise<void>
  ```
  실패(답 오류·던짐·클라이언트 만들기 실패·모양 틀림)는 모두 `TabAccessError('…', { cause })`이고 메시지에 원래 글이 없다.

## 앱 틀 (TASK-5 — `src/app/(app)/layout.tsx`·`src/components/shell/`)
- `(app)/layout.tsx`: `AppLayout`만 `const hiddenTabs = me.isAdmin ? [] : adminOnlyTabs(await readTabAccessRows())` → `<AppShell … hiddenTabs={hiddenTabs}>`. `approvedMe`·`generateMetadata`는 그대로(목록을 읽지 않는다).
- `AppShell`: 새 선택 prop `hiddenTabs?: readonly MenuPath[]`(없으면 `[]`). 본문은 `숨긴 탭이 있으면 <TabGate hidden>{지금 body}</TabGate>, 없으면 지금 body`. `DeskGate`에 `hidden`, `TabBar`에 `hidden`을 넘긴다. 띠·계정 메뉴·클래스는 그대로.
- `TabGate.tsx`(새, `'use client'`, `DeskGate`와 같은 틀): `isHiddenPath(usePathname(), hidden)`이면 `useEffect`에서 `router.replace('/dashboard')`, 그동안 `null`. 아니면 children.
- `DeskGate`: 새 선택 prop `hidden?: readonly MenuPath[]`(없으면 `[]`). `/dashboard`에서 `deskHomeOf(hidden)`이 있으면 거기로 `replace`(지금은 `DESK_HOME` 고정), `null`이면 `DeskBlocked`를 그린다. 그 밖은 그대로(`DeskBlocked`의 글·링크도 그대로).
- `TabBar`: 새 선택 prop `hidden`(없으면 `[]`). `tabs = (desk ? DESK_MENU : PRIMARY_MENU)`에서 숨긴 탭을 뺀다. `MoreMenu`에 `hidden`을 넘긴다.
- `MoreMenu`: 새 선택 prop `hidden`(없으면 `[]`). 모듈 상수 `OTHERS`·`NOT_READY`를 `items = MORE_MENU.filter(숨기지 않음)`에서 세는 값으로 바꾸고 판 목록·`inMore`도 `items`를 쓴다.

## 설정 칸 (TASK-6 — `src/components/settings/`)
- `TabAccessSettings.tsx`(새, `'use client'`): 상태 `'checking' | 'none' | 'failed' | 'ready'`.
  - 처음: `readTabOwner()` → 던지거나 거짓이면 `'none'`(그리지 않음). 참이면 `readTabAccess()` → 되면 `checked = new Set(adminOnlyTabs(rows))`·`'ready'`, 실패면 `'failed'`. `'checking'`·`'none'`이면 `null`.
  - 틀: `<section aria-labelledby={제목 id} className={`${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`}>`(병원 정보 칸 틀 글자 그대로 — `max-md:p-4`는 모든 설정 칸이 같이 쓰는 칸 틀 값이라 새 폰 모양이 아니다) → 머리 `<div className="flex flex-col gap-1">` 안 제목 `<h2 id className={ds.panelTitle}>` + 설명 `<p className="text-small text-ink-2">`(병원 정보 칸 머리와 같음) → 몸. 몸 안 새 요소에는 `max-md:`를 쓰지 않는다.
  - `'failed'`: `<ErrorCard code="E-SETTINGS-FAILED" />` + [다시 불러오기](`ds.button.secondarySmall`, 목록만 다시 읽음 — `DxLinks`와 같음).
  - `'ready'`: `<ul aria-labelledby={제목 id} className="flex max-w-90 flex-col rounded-control border border-line">` → `TAB_ACCESS_MENU`마다 `<li className="border-b border-line last:border-b-0"><label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-ink hover:bg-canvas">` + 체크 상자(`ds.checkboxWrap`·`ds.checkbox`·`ds.checkboxMark`, 이름은 label 글자) + 탭 이름`</label></li>`. 그 아래 `saveFailed`면 `<ErrorCard code="E-SETTINGS-FAILED" />`, 그 아래 단추 줄 `flex flex-wrap items-center gap-2` → [저장]/[다시 저장](`ds.button.primary`, `aria-busy`) + `savedNote`면 `<span role="status" className="text-small text-ink-2">저장했어요.</span>`.
  - 체크를 바꾸면 `savedNote = false`(실패 카드는 다시 누를 때까지 둔다 — 시안). [저장]: 보내는 중이면 무시. `saveTabAccess(TAB_ACCESS_MENU 중 체크한 path, 안 한 path)` → 되면 `saveFailed = false`·`savedNote = true`, 실패면 `saveFailed = true`·`savedNote = false`(체크 그대로).
- `SettingsPage.tsx`: `<DeskAccounts />` 바로 다음 줄에 `<TabAccessSettings />`(import 한 줄). 뒤 TASK 안내 주석은 그 아래 그대로.

## 시험 계획 (시험 이름에 AC ID)
| 파일 | 보는 것 |
|---|---|
| `supabase/multiAdmin.rls.test.ts` (TASK-1) | AC-7701.1~5·AC-7705.1~4: PGlite에 `setup-sql.test.ts`의 Supabase 흉내(역할·auth 스키마·`auth.users`에 `email`·`raw_app_meta_data`) → `20261028000000_auth.sql` → 사용자·병원·`admins`(주 관리자 후보 A 하나 — 구글·`e2e-` 없음, 다른 관리자는 이메일 가입 또는 `e2e-` 메일) → 이 파일 → 이 파일(두 번). 파일이 없으면 시험마다 실패(`desk.rls.test.ts`의 `existsSync`). 함수 속성(`prosecdef`·`proconfig`·결과 모양)·실행 권한(`has_function_privilege` public·anon·authenticated), `admins` 정책 이름·표 권한·새 칸·유일 색인(23505), `admin_hospitals` 답(세 칸), `set_admin` 넣기·빼기·두 번·거부(42501·22023, 주 관리자 줄 포함)·정한 뒤·뺀 뒤 B, 42P17 없음. 주 관리자 정하기: 후보 0개·2개면 오류 글(`0개예요`·`2개 이상이에요`·`아무것도 바꾸지 않았어요`)이고 칸·표·함수 셋이 없고 `admins` 그대로(새 PGlite에서), 두 번째 실행은 구글 관리자를 더해도 통과. `tab_access` 칸·검사 제약·RLS·씨앗 12줄·다시 돌려도 바꾼 줄 그대로·읽기(관리자·원장·병원 줄 없는 사용자·대기 병원 주인)·anon 못 읽음·바로 쓰기 못 함, `set_tab_access` 넣기·고치기·안 보낸 줄 그대로·두 번·거부(42501·22023, 표 그대로). 데스크 migration은 돌리지 않는다(데스크도 '로그인한 사람'이라 읽기·거부가 같다 — 병원 줄 없는 사용자로 본다). 가짜 메일(`@fake.test`)·가짜 병원 이름만 |
| `src/lib/auth/admin.test.ts` (TASK-2) | AC-7702.1·2: 가짜 `supabaseBrowser`의 `rpc` 이름·인자·횟수, `from` 안 부름, 답 모양 검사(목록 아님·줄 모양 틀림·`is_owner` 없음), 오류·던짐 → `AdminError`(메시지에 원래 글 없음, `cause`에 있음) |
| `src/lib/errors.test.ts` (TASK-2) | AC-7702.3: 글 두 칸이 위 표와 같음, `ALL_CODES`·`AUTH_CODES`에 듦 |
| `src/components/shell/tabAccess.test.ts` (TASK-3) | AC-7706.1: `TAB_ACCESS_MENU` 12개 이름·차례, `toTabAccessRows`(좋은 답·목록 아님·칸 틀림·null), `adminOnlyTabs`(줄 없음·참·거짓·목록 밖 줄·차례), `isHiddenPath`(그 주소·아래 주소·`/claim/setup`·`/dashboard`·`/settings`·`/admin`·탭 밖), `deskHomeOf`(숨김 없음·수납일지만·수납일지+업무일지·셋 다), 옛 상수 그대로 |
| `src/lib/auth/tabAccess.server.test.ts` (TASK-3) | AC-7706.2(함수): 첫 줄 `server-only`, 가짜 `supabaseServer`의 `from`·`select` 인자·한 번, 쓰기 없음, 오류·던짐·모양 틀림 → `TabAccessReadError`(원래 글 없음) |
| `src/lib/storage/tabAccess.test.ts` (TASK-3) | AC-7707.1: 세 함수의 `from`·`select`·`maybeSingle`·`rpc` 인자·횟수, 줄 없음·거짓 → 주 관리자 아님, 실패 → `TabAccessError` |
| `src/components/admin/applications.test.ts` (TASK-4) | AC-7703.3·AC-7704.3: `adminRoleOf` 넷, `adminBadgeOf` 셋, `withAdmin`(더함·뺌·이미 있음·없음, 받은 목록 그대로), `adminDoneMessage` 둘 |
| `src/components/admin/AdminApplications.test.tsx` (TASK-4) | AC-7703.1~4·AC-7704.1~4 (아래 '지금 시험에서 바뀌는 곳'), 주 관리자가 볼 때(시안 `list`)·다른 관리자가 볼 때(시안 `other`) 두 차림 |
| `src/components/ui/classes.test.ts` (TASK-4) | 고치는 곳은 'AC-204.7: REQ-218·REQ-220 앱 틀 + 관리자' 시험의 `rpc` 흉내 하나(`admin_hospitals`에 `[]`를 줌). 다른 시험은 고치지 않고 지나야 한다(새 파일 `ConfirmDialog.tsx`·`TabGate.tsx`·`TabAccessSettings.tsx`도 AC-204.6 클래스 규칙 검사에 저절로 든다) |
| `src/app/(app)/layout.test.tsx` (TASK-5) | AC-7706.2(레이아웃): `@/lib/auth/tabAccess.server` 흉내(기본값 = 씨앗 12줄 '모두에게' — 지금 시험들이 그대로 지나게), 관리자면 안 읽음·숨김 없음, 원장·데스크면 한 번 읽고 `hiddenTabs`를 넘김, 실패면 던짐, `generateMetadata`는 안 읽음 |
| `src/components/shell/hiddenTabs.test.tsx` (TASK-5) | AC-7706.3: 숨긴 탭이 있는 원장·데스크 탭 띠·[더보기] 판·머리 수, 대시보드·설정·[가입 승인] 그대로, 숨김 없으면 지금과 같은 글자·차례·클래스, `AppShell`이 숨긴 탭이 없으면 `TabGate`를 그리지 않음 |
| `src/components/shell/TabGate.test.tsx` (TASK-5) | AC-7706.4: 숨긴 탭 주소·아래 주소 → 본문 없음·`replace('/dashboard')` 한 번·글 없음, `/claim/setup`·`/dashboard`·`/settings`·`/admin`·숨기지 않은 탭 → 본문 그대로 |
| `src/components/shell/DeskGate.test.tsx` (TASK-5) | AC-7706.4(데스크): `hidden`이 없을 때 지금 시험 그대로, 수납일지 숨김 → `/dashboard`가 업무일지로, 셋 다 숨김 → `/dashboard`에서 막힌 화면·`replace` 없음 |
| `src/components/settings/TabAccessSettings.test.tsx` (TASK-6) | AC-7707.2~5: 주 관리자·아님·확인 실패(던짐), 둘 다 읽기 전 칸 없음, 제목·설명 글자, 12줄 차례·체크(줄 없는 탭 체크), 읽기 실패 카드·[다시 불러오기], [저장] 한 번·나눠 보냄·`aria-busy`·두 번 눌러도 한 번, `저장했어요.`·체크 바꾸면 사라짐, 실패 카드·[다시 저장]·체크 그대로·다시 해서 됨, 클래스(시안 `settings.html`), 새 `max-md:` 없음 |
| `src/app/(app)/settings/page.test.tsx` (TASK-6) | AC-7707.2: `@/lib/storage/tabAccess` 흉내 — 주 관리자면 맨 아래 h2가 `관리자만 보는 탭`(데스크 계정 다음), 아니면 지금 시험 그대로(맨 아래 `데스크 계정`) |

지금 `AdminApplications.test.tsx`에서 바뀌는 곳(이 명세 때문에 깨지는 곳만 고친다):
- `INTRO` 글자 → 새 INTRO.
- `rpc` 흉내: 이름으로 나눠 답한다(`admin_hospitals` → 표시 목록, `set_admin`·`set_hospital_status` → 지금처럼). `rpc`를 '한 번' 세는 시험은 그 이름의 부르기만 센다.
- '승인됨' 칩을 보는 시험 셋(AC-007.4 "승인 줄에는 동작 단추가 없고 '승인됨' 완료 칩만", AC-220.1·AC-220.2 "승인 줄의 '승인됨' 완료 칩은 PC·폰 모두 그대로", 칸 시험의 `getByText('승인됨')`) → AC-7703.3의 동작 칸으로 바꾼다.
- 칸 폭 시험의 768~1023px 값: 동작 `['max-lg:w-35']` → `[]`(AC-7703.4).
- 관리자 표가 붙은 줄은 칸 이름에 `관리자`·`주 관리자`가 더해지므로 그 줄을 이름으로 찾는 도움 함수(`rowOf`)는 `title`·이름 글자로 찾게 고친다.

지금 시험 가운데 깨질 수 있는 곳(앱 틀·설정, 2026-11-22 읽어 봄):
- `src/app/(app)/layout.test.tsx` — **깨진다**: 승인된 원장(`isAdmin` 거짓)·데스크를 그리는 시험이 진짜 `readTabAccessRows`(→ 진짜 `supabaseServer`)를 부른다 → 흉내 한 줄 + 기본값 씨앗 12줄(TASK-5).
- 그 밖(`shell.test.tsx`·`tabFrame.test.tsx`·`DeskGate.test.tsx`·`notReadyPages.test.tsx`·`staff.integration.test.tsx`·`notFound.test.tsx`·`classes.test.ts`·`InstallFilesCard.test.tsx`·`DeskAccounts.test.tsx`·`CashFloatSetting.test.tsx`·`settings/page.test.tsx`)은 새 prop이 모두 선택이고 숨김이 없으면 지금 틀 그대로(`TabGate`를 그리지 않음 — `tabFrame.test.tsx` 등은 `useRouter`를 흉내 내지 않는다), `MENU` 항목 모양·옛 상수 그대로, 새 설정 칸은 주 관리자가 아니거나 확인이 던지면 그리지 않으므로 지나야 한다. 깨지면 그 TASK의 Files 안에서만 흉내를 더한다(`shell.test.tsx`·`DeskGate.test.tsx`는 TASK-5, `InstallFilesCard.test.tsx`·`settings/page.test.tsx`는 TASK-6). `DeskAccounts.test.tsx`의 차례 시험(`<CashFloatSetting />` 다음 `<DeskAccounts />`)은 새 줄이 그 뒤라 그대로 지난다.

## 위험
- SQL을 붙이기 전에 사이트를 올리면 `/admin`이 화면 오류(관리자 목록 읽기 실패)이고, **관리자가 아닌 모든 계정(다른 병원 원장·데스크)이 앱 오류 화면**이다(탭 목록 읽기 실패, 기본값 20) → SQL 먼저('배포 순서'). SQL만 먼저 붙인 동안 옛 사이트는 그대로 돈다(옛 함수·표를 바꾸지 않고 칸·표·함수만 더함).
- 주 관리자 정하기는 지금 DB의 계정에 달렸다: 구글로 들어온 관리자가 운영자 하나뿐이어야 한다(시험 계정은 메일 앞부분 `e2e-`라 빠진다). 아니면 SQL이 멈추고 그 글을 Claude에게 알려 달라고 한다. 빈 DB(새 Supabase 프로젝트)에서는 `first-admin.sql`을 먼저 돌려야 이 파일이 지난다.
- 숨긴 탭은 보이기만 막는다(ADR-042 트레이드오프). 사용자에게 알린다.
- 같은 때 서로 빼기 보호(`for update`)는 PGlite(연결 하나)로 시험하지 못한다. 교착이 나면 한쪽이 `E-ADMIN-ROLE` 카드를 본다(다시 누르면 42501이거나 이미 됨).
- 열어 둔 화면의 관리자 표시·메뉴는 다른 관리자가 같은 때 바꾸면 낡을 수 있다 → 함수가 멱등이라 결과는 맞고, 빠진 관리자의 단추는 42501 → `E-ADMIN-ROLE`. 새로 고치면 맞다.
- 관리자는 모든 병원의 가입 신청 줄을 본다(ADR-041 트레이드오프). 사용자에게 알린다.
- E2E(`npm run e2e`, 실제 Supabase)의 승인된 시험 계정은 관리자가 아니라 숨긴 탭이 생기면 그 탭 시험이 대시보드로 돌아간다. 처음 값은 모두 '모두에게'라 지금은 그대로다.
- `first-admin.sql`은 '구글 계정(시험 계정 빼고) 하나'일 때만 돈다. 이미 처음 설정을 했고 다시 돌릴 일이 없다(지금도 같다, 고치지 않음).

## 배포 순서
1. 모두 합친 뒤 전체 검사(ssk-finish-check)·화면 확인·독립 검토 한 번.
2. 사용자: Supabase SQL Editor에 `supabase/migrations/20261122000000_multi_admin.sql` 전체를 붙여 넣고 Run(ssk-supabase-sql). 멈추면 그 글을 Claude에게 알린다. Claude는 실제 Supabase에 붙지 않는다.
3. 웹 배포는 사용자가 말할 때만(ssk-deploy, 운영 갈래). 도우미·확장 새 판은 없다.
