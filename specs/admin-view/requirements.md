# 요구사항: 다른 의원 보기 · 의원 비교 (관리자만)

> 기능 ID: `admin-view` · 형식: `### REQ-8001: 제목` 아래 `- AC-8001.1: Given/When/Then`. 시험 이름에 AC ID를 넣는다.
> 번호: REQ-8001~8024(80xx는 저장소 모든 갈래의 specs에서 안 쓴 묶음, 2026-11-24 `git grep`으로 확인). ADR은 046·047·048·049(지금 `docs/ADR.md` 끝이 045). 2차(저절로 올리기·10년, REQ-8019~8023)는 Phase 1 뒤에 더한 것이라 SQL을 새 파일 `20261124010000_admin_sync.sql`에 둔다.
> **MVP 모드**(사용자 규칙: 계획 최소 · Phase별 step · 같은 Phase는 병렬 · 검토는 마지막 한 번). SQL 파일 하나(새 표 둘 · 함수 · 정책) · 새 서버 경로 없음 · 새 패키지 없음 · 도우미·확장 새 판 없음.
> **화면 글자는 승인된 시안 `docs/mockups/admin-view`(`index.html`·`notes.md`, 사용자 2026-11-24 "이대로 승인") 그대로**. 자리·모양도 시안이 이긴다. 시안 글은 design.md '화면 글자'에 한 글자도 바꾸지 않고 옮겼다. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21, 시안 사진도 PC 너비만).
> 근거: 사용자 인터뷰(2026-11-24, 아래 '이미 정한 것'), 코드 조사(design.md '조사로 안 것').

## 배경 / 목표
- 관리자(`admins`에 줄이 있는 계정)가 다른 승인된 의원의 화면을 그 의원이 된 것처럼 **읽기만** 하며 본다.
- 관리자 탭 안 '의원 비교'에서 지역·달을 골라 의원들의 매출·환자 수·직군별 월급·통계를 견준다.

## 이미 정한 것 (사용자 2026-11-24 인터뷰, 다시 묻지 않는다)
1. **누가**: 관리자 누구나(주 관리자만이 아님). **무엇을**: 승인된 의원 아무 곳.
2. **읽기만**: 저장·비트에서 불러오기·지우기·고치기 단추는 모두 숨기거나 막는다. 서버에서도 관리자는 남의 병원 줄을 읽기만 하고 넣기·고치기·지우기는 못 한다.
3. **빼는 탭**(환자 개인정보가 있어서, 보는 중 메뉴에서 사라짐): 예약(예약 줄에 환자 이름·차트번호) · 환자 · 청구.
4. **보이는 탭**: 대시보드 · 통계(매출 칸 포함) · 업무일지 · 수납일지 · 직원(전화·생일·주소·계좌·급여·파일까지 **모두** — 사용자가 직접 "다 보이게") · 고시·공지 · 입지 분석 · 재고 · 주소록 · 서식 · AI 리포트 · 설정. 자유롭게 적는 메모 칸도 보인다(사용자 선택).
5. 보이는 의원에는 **따로 알리지 않는다**(알림·동의 화면 없음).
6. **고르는 곳 두 군데**: 앱 머리의 `보는 의원 ▾`(관리자에게만) + 관리자 탭의 승인된 의원 목록(이름을 누름). 보는 동안 맨 위 띠 `○○의원 보는 중 · 읽기만` + [`내 의원으로`].
7. **본 기록**: 관리자가 다른 의원 보기를 시작할 때마다 누가·언제·어느 의원을 남긴다. 관리자만 읽고 관리자 탭에 보인다. 보인 의원은 못 본다.
8. **의원 비교**(관리자 탭 안, 관리자만): 지역 고르기(시·도: 서울·경기·부산 … + 전체)와 달 고르기(처음 = 지난달). 지역은 네 칸 모두에 걸린다.
   1. 의원 순위 표: 지역 안 승인된 의원마다 한 줄. 칸 = 총진료비 · 내원 수 · 신환 · 재진 · 하루 평균 내원 · 직군별 평균 월급(간호사·간호조무사·물리치료사·방사선사·원무·기타) · 통계 카드마다 대표 숫자 하나. 칸 이름을 누르면 오름차순, 한 번 더 누르면 내림차순. 대표 숫자는 시안의 8개, 시안 차례(design.md '대표 숫자 표', 시안 승인 때 정함).
   2. 통계 나란히 보기: 지역 안 모든 의원을 의원마다 한 칸(세로 줄)으로, 모두 같은 기간, 통계 탭의 카드를 같은 카드끼리 같은 줄에. 의원이 많으면 옆으로 민다(PC만). 의원마다 자기 처방 묶음 설정을 쓴다.
   3. 직군별 월급 표: 고른 달, 의원 × 직군(`staff_members.job`). 정규직·계약직만, 파트타임은 사람 수만. 사람 수 · 평균 · 가장 적음~가장 많음. 월급 = 그달 직원 탭이 보이는 지급 합계. 그달 급여 줄이 없는 의원은 `급여 없음`.
   4. 매출·환자 수 표: 의원마다 그달 `sales_days`의 총진료비 · 내원 · 신환 · 재진 · 하루 평균 내원(내원 ÷ 내원이 있는 날 수). 비트에서 불러온 날만 있다.
   5. 의원의 지역은 병원 정보 주소(`clinic_profiles.address`)에서 시·도를 저절로 읽고, 관리자가 관리자 탭 의원 목록에서 고칠 수 있다. 주소가 없거나 못 읽으면 고치기 전까지 `지역 모름`.
9. PC 화면만. 폰 전용 모양을 새로 만들지 않는다.

**시안 승인 때 사용자가 정한 것 (2026-11-24, 다시 묻지 않는다)**
10. 시안: **"이대로 승인"** — `docs/mockups/admin-view` 그대로 만든다.
11. **"합계만 저장하게 더하기"**: 지금 사이트에 저장되지 않는 통계('몇 번까지 받나'·'3번 이상 받은 비율', '예약·전환'의 Block 전환, '처방별 신환·재진')는 의원이 통계를 불러올 때(지금 `stats_days`·`stats_months` 저장 길) 달마다·날마다 **합계 숫자만** 함께 저장한다. 환자 이름·차트번호·환자 한 사람 줄은 저장하지 않는다. 도우미는 바꾸지 않는다. 그 뒤로 의원 비교·나란히 보기에 보이고, 그 전에 저장한 달은 그 의원이 다시 불러오기 전까지 `–`다. '가장 많은 나이대'도 같은 규칙: 비교에는 그 의원 통계 탭이 그달 보이는 **같은 숫자**를 보이고, 저장되지 않았으면 불러올 때 합계를 저장한다(REQ-8018).
12. 주소록 사이트 비밀번호(`site_pw`): **"비밀번호도 보이기"** — 보는 중에도 보인다.
13. 보이는 탭 안에서도 **환자 개인정보가 든 칸은 숨긴다**(환자 이름·차트번호·전화·주민번호 같은 정해 둔 칸). 자유롭게 적는 메모 칸은 보인다(사용자 "환자 개인정보 들어있는건 제외하고" + "메모도 보이기").

**2차 시안 승인 때 사용자가 정한 것 (2026-11-24, 다시 묻지 않는다)**
14. 2차 시안(저절로 올리기·의원 비교 달 10년): **"이대로 승인"** — 물을 때 `채울 기간을 줄여도 이미 올라온 숫자는 지우지 않아요`를 함께 보였다.
15. **저절로 올리기**: 의원 비트 PC(도우미가 붙은 PC)에서 그날 처음 앱을 열면, 어제까지 아직 안 올라온 날의 **매출**(`sales_days`)·**통계**(`stats_days`·`stats_months`, TASK-6 합계 포함)를 뒤에서 올린다. 수납 마감은 하지 않는다. **늘 켜져 있고 끄는 단추가 없다.** **의원 화면에는 아무것도 보이지 않는다.** 관리자가 다른 의원을 보는 중에는 돌지 않고, 그 병원 자료의 주인 계정이 아니면 돌지 않는다. 지금 도우미 명령만 쓴다.
16. **채울 기간**: 관리자가 가입 승인 '승인' 표에서 **의원마다** 고른다 — `1달` `2달` `3달` `6달` `1년` `2년` `3년` `5년` `10년`, 처음 `2달`. **달 단위**(11월 24일에 2달 = 9월 1일부터 어제까지). **줄여도 이미 올라온 숫자는 지우지 않는다.** 긴 기간은 **최근 달부터**, 열 때마다 어제를 먼저 하고 옛 달을 **5분쯤** 채운 뒤 멈추고 다음에 열 때 이어 한다.
17. **상태**는 의원마다 저장하고 '승인' 표 `저절로 올림` 칸에 시안 글 그대로(마지막으로 올라온 날 · 어디까지 채웠나 · 마지막 오류 번호와 글) 보인다. 상태를 읽는 것은 관리자만이고, 의원 브라우저는 자기 병원 상태만 쓴다.
18. **의원 비교 달 10년**: '지난 12달' 대신 모든 승인된 의원 가운데 저장된 숫자가 있는 가장 이른 달(지역과 상관없음, 10년 앞까지)부터 지난달까지(이번 달 뺌). 고르기는 ◀ [연도 ▾] [월 ▾] ▶. 그달 숫자가 없는 의원은 줄을 두고 `–`, 매출·환자 수 아래 줄에 `· 숫자 있는 {k}곳 합`.
19. **신청자·이메일** 한 칸 두 줄 — '승인'·'대기'·'거절' 탭 모두.
20. **"데스크 계정도 올리기 (추천)"**(2026-11-24): 의원 비트 PC가 **데스크 계정**으로 로그인돼 있어도 저절로 올리기가 돈다(15의 '주인 계정'에 그 병원 데스크 계정도 든다). 데스크 계정은 여전히 매출·통계 **값을 읽지 못하고** 화면도 지금 그대로이며 올리기만 한다. 자기 병원 줄만 쓰고, 다른 병원·보는 중에는 쓰지 않는다. SQL은 더하기만 한다(새 파일 `20261124020000_desk_upload.sql`).

## 요구사항

### REQ-8001: DB — 보기 줄·보기 함수 (`supabase/migrations/20261124000000_admin_view.sql`)
- AC-8001.1: Given 이 파일을 지금 migration 사슬 다음에 두 번 돌림, When 끝나면, Then 오류가 없고 표 `admin_views`(design.md 'DB' ①)가 RLS 켜짐·`anon`·`authenticated` 표 권한 없음·정책 없음이며, 함수 `admin_view_key`·`admin_view_hospital_id`·`read_hospital_id`·`start_admin_view`·`stop_admin_view`·`my_admin_view`·`admin_view_log`·`admin_view_hospitals`가 design.md 'DB'의 모양(언어·`security definer` 여부·`set search_path = ''`)으로 있다. 사용자가 부르는 함수는 `public`·`anon`이 실행하지 못하고 `authenticated`만 실행한다. 두 번째 실행 뒤 표·정책·권한·함수 모양이 첫 실행 뒤와 같다
- AC-8001.2: Given 관리자 A(승인된 병원 HA 주인)·승인된 병원 HB(주인 B, 관리자 아님)·대기 병원 HC·거절 병원 HR, When A가 `start_admin_view(HB)`를 부르면, Then 새 보기 열쇠(uuid)를 돌려주고 `admin_views`에 (A, HB, 지금 시각, 끝 시각 없음) 한 줄이 생긴다. 관리자가 아닌 B·데스크·병원 줄 없는 사용자 → 42501(인자가 틀려도 이것이 먼저), anon → 42501, A가 자기 병원 HA·HC·HR·없는 id·`null` → 22023이고 `admin_views`는 그대로다. 요청 머리에 같은 사용자의 열린 열쇠가 있으면 그 줄은 끝 시각이 찍히고 새 줄이 생긴다
- AC-8001.3: Given A의 열쇠 K(HB), When 요청 머리 `x-ssk-view`(design.md '보기 열쇠')가 K이면, Then `admin_view_hospital_id()`는 HB, `read_hospital_id()`는 HB, `my_admin_view()`는 (HB, HB 병원 정보 이름 — 없으면 가입 이름) 한 줄이다. 머리가 없음·uuid 모양이 아님·남의 열쇠·끝난 열쇠·12시간 지난 열쇠·관리자에서 빠진 사람의 열쇠·승인 상태가 아닌 병원이면 `admin_view_hospital_id()`는 `null`, `read_hospital_id()`는 `my_hospital_id()`와 같고 `my_admin_view()`는 빈 목록이다. 모양이 틀린 머리에도 오류를 던지지 않는다
- AC-8001.4: Given 열쇠 K, When A가 머리 K로 `stop_admin_view()`를 부르면, Then K 줄에 끝 시각이 찍히고 그 뒤 `admin_view_hospital_id()`는 `null`이다. 머리가 없거나 남의 열쇠면 아무 줄도 바뀌지 않고 오류도 없다. 관리자가 아니면 42501이다
- AC-8001.5: Given 관리자 A·D가 여러 번 본 기록, When 관리자가 `admin_view_log()`를 부르면, Then 시작이 최근 30일 안인 줄 모두를 최근 시작 차례로 (본 때 = 시작 시각, 본 관리자의 의원 이름, 본 관리자 메일, 본 의원 id, 본 의원 이름) 준다(끝 시각은 주지 않는다, 30일 전 줄은 지우지 않고 답에만 없다). 관리자가 아닌 사용자(보인 의원 주인 B 포함)·데스크 → 42501, anon → 42501이고, 누구도 `admin_views`를 바로 읽거나 넣거나 고치거나 지우지 못한다
- AC-8001.6: Given 승인된 병원 여럿과 대기·거절 병원, When 관리자가 `admin_view_hospitals()`를 부르면, Then 승인된 병원만 (병원 id, 이름 = 병원 정보 이름·없으면 가입 이름, 주소 = 병원 정보 주소·없으면 `null`, 관리자가 정한 지역이 있는지, 정한 지역 = `hospital_regions.sido`(정했는데 `null`이면 '지역 모름'으로 정한 것), 내 병원인지) 이름 차례로 준다. 관리자가 아니면 42501이다

### REQ-8002: DB — 보는 중 읽기 전환 · 쓰기 막기 (같은 SQL 파일)
- AC-8002.1: Given design.md '병원별 표' 목록의 '보기 ○' 표마다, When 카탈로그를 보면, Then 그 표에 정책 `관리자 보는 의원 읽기`(permissive, select, `hospital_id = (select public.admin_view_hospital_id())`)와 `보는 중에는 그 의원만 · 쓰기 없음`(restrictive, all, design.md 'DB' ⑤ 글 그대로)이 있다. '보기 ×' 표에는 restrictive 정책 하나만 있고 permissive 정책은 더하지 않는다. 지금 정책·표 권한은 하나도 바뀌지 않는다
- AC-8002.2: Given 관리자 A가 머리 K(HB)로, When '보기 ○' 표(시험 표본: `stats_days`·`clinic_profiles`·`staff_members`·`staff_pay_lines`·`worklog_days`·`sunap_days`·`location_settings`·`contacts_people`·`ai_reports`·`notice_marks`·`calendar_settings`)를 hospital 거르기 없이 읽으면, Then HB 줄만 나오고 HA(내 병원) 줄은 안 나온다(`maybeSingle` 표도 한 줄). 머리 없이 읽으면 지금과 같이 HA 줄만 나온다
- AC-8002.3: Given 관리자 A가 머리 K(HB)로, When '보기 ×' 표(`calendar_appts`·`calendar_rev`·`contact_counts`·`message_templates`·`claim_day_counts`·`claim_month_counts`·`claim_day_closes`)를 읽으면, Then HA·HB 줄 모두 안 나온다
- AC-8002.4: Given 관리자 A가 머리 K(HB)로, When 표본 표에 넣기·고치기·지우기·upsert를 HA 줄과 HB 줄 모두에 하면, Then 넣기·upsert는 RLS 오류(42501)이고 고치기·지우기는 0줄이며 두 병원 줄 모두 그대로다. 같은 쓰기를 invoker 함수(`save_stats_rx_groups`·`save_revenue_range`·`contacts_import`·`see_rule_changes`)로 해도 막힌다
- AC-8002.5: Given 관리자가 아닌 원장·데스크·대기 병원 주인(가짜 머리를 붙여도), When 지금 시험과 같은 읽기·쓰기를 하면, Then 결과가 이 파일 전과 같다(자기 병원 줄만 읽고 쓴다, 남의 줄은 0줄)
- AC-8002.6: Given 비공개 바구니 `clinic-logos`·`staff-files`·`inventory-photos`·`location-photos`·`form-backgrounds`에 HA·HB 폴더 파일, When 머리 K(HB)를 가진 A가 HB 파일을 읽으면, Then 읽힌다(design.md 'DB' ⑥ 정책). A가 끝낸 보기·12시간 지난 보기·남의 보기로는 HB 파일이 안 읽히고, 관리자가 아닌 사용자는 이 파일 전과 같다. `install-files`와 다른 바구니 규칙은 그대로다
- AC-8002.7: Given 머리 K(HB), When 다시 만든 읽기 함수(`sales_code_totals`·`notice_list`·`notice_unread_count`·`notice_rule_alerts`·`rule_change_alerts`·`desk_members`)를 부르면, Then HB 기준 답이고, 머리 없이 부르면 이 파일 전과 같은 답이다. 인자·답 모양·권한은 그대로다
- AC-8002.8: Given 지금 DB의 `public` 표 가운데 `hospital_id` 칸이 있는 표 모두, When 이 파일 뒤 카탈로그를 보면, Then 모두 design.md '병원별 표'의 '보기 ○'·'보기 ×'·'함수로만' 가운데 정확히 한 곳에 있다(새 표를 빠뜨리면 시험이 실패한다). 무한 되부름(42P17)이 어디에서도 나지 않는다

### REQ-8003: DB — 지역 고친 값 · 의원 비교 읽기 함수 (같은 SQL 파일)
- AC-8003.1: Given 이 파일, When 카탈로그를 보면, Then 표 `hospital_regions`(병원 id 열쇠, `sido`는 design.md '지역'의 17개 이름 또는 `null` = 관리자가 '지역 모름'으로 정함, 고친 시각)가 RLS 켜짐·사용자 표 권한 없음이고, `set_hospital_region(p_hospital_id uuid, p_sido text)`·`admin_rows(p_kind text, p_hospital_ids uuid[], p_from date, p_to date)`가 design.md 'DB' 모양이다
- AC-8003.2: Given 관리자, When `set_hospital_region(HB, '경기')`·다시 `'광주'`·`null`을 부르면, Then 줄이 생기고·바뀌고·`sido`가 `null`(지역 모름으로 정함)인 줄로 남는다(줄은 지우지 않는다 — 줄이 없을 때만 주소에서 읽는다). 관리자가 아니면 42501, 대기·거절·없는 병원·`null` 병원·17개 밖 이름(`전남광주` 포함)이면 22023이고 표는 그대로다
- AC-8003.3: Given 관리자와 승인된 병원 HA·HB·대기 HC, When `admin_rows`를 design.md '비교 읽기' 표의 종류(열여덟)마다 부르면, Then 승인된 병원 줄만 (병원 id, 줄 jsonb)로 오고 jsonb 열쇠는 그 표에 적은 칸뿐이다. 특히 `calendar_counts`에는 `name`·`chart`·`memo`가, `staff_pay`·`staff_members`에는 이름·전화·생일·주소·계좌가 없고, `stats_months`는 payload 전체가 아니라 `rx`·`groups`·`dropoff`·`sections`만, `stats_day_totals`는 `totals`만이다. 보내지 않은 병원·HC 줄은 없다
- AC-8003.4: Given 거부할 부르기, When `admin_rows`를 부르면, Then 관리자가 아닌 사용자 → 42501(인자가 틀려도 먼저), anon → 42501, 모르는 종류·`null` 인자·병원 id 0개 또는 31개 이상·시작이 끝보다 뒤·기간 401일 이상 → 22023이다. 보는 중(머리 K)에도 같은 답이다(보기 상태와 상관없다)

### REQ-8004: 보기 열쇠 쿠키 · 요청 머리 · 브라우저 쓰기 막기 (`src/lib/supabase/`)
- AC-8004.1: Given `viewKey.ts`, When 쿠키 글을 주면, Then `readViewKey`는 `ssk_view` 값이 uuid 모양일 때만 그 값(소문자), 아니면 `null`이다. `viewCookie(key)`는 `ssk_view=<key>; Path=/; SameSite=Lax; Secure`(Max-Age 없음 = 브라우저를 닫으면 사라짐), `clearViewCookie()` 글은 같은 이름·경로에 `Max-Age=0`이다
- AC-8004.2: Given 보기 쿠키가 있는 브라우저, When `supabaseBrowser()`를 처음 부르면, Then 클라이언트가 모든 요청에 머리 `x-ssk-view: <key>`를 붙이고 design.md '브라우저 쓰기 막기'의 거르는 fetch를 쓴다. 쿠키가 없으면 지금과 같이 만든다(머리·거르기 없음)
- AC-8004.3: Given 거르는 fetch, When 요청이 오면, Then `GET`·`HEAD`, `/auth/v1/` 아래 모든 요청, `POST /rest/v1/rpc/<허용 목록>`, `POST /storage/v1/object/sign/`·`/storage/v1/object/list/`는 그대로 보내고, 그 밖의 `/rest/v1/`·`/storage/v1/` 쓰기(`POST`·`PATCH`·`PUT`·`DELETE`)는 보내지 않고 403 답(본문 `{"code":"E-VIEW-READONLY"}`)을 돌려준다. 다만 지금 페이지가 관리자 화면(`/admin`과 그 아래, `isAdminScreen`)이면 아무것도 거르지 않는다(관리자 화면은 의원과 상관없어 보는 중에도 승인·지역 고치기·설치 파일 올리기가 된다 — 시안 '모양 결정')
- AC-8004.4: Given 서버 `supabaseServer()`, When 요청 쿠키에 uuid 모양 `ssk_view`가 있으면, Then 같은 머리를 붙인다(거르는 fetch는 없음). 없거나 모양이 틀리면 지금과 같다
- AC-8004.5: Given `src/lib/auth/adminView.server.ts`(첫 줄 `import 'server-only'`), When `readAdminView()`를 부르면, Then 보기 쿠키가 없으면 DB를 부르지 않고 `null`, 있으면 `rpc('my_admin_view')` 한 번 → 한 줄이면 `{ hospitalId, name }`, 빈 목록이면 `null`이다. 답 오류·던짐·모양 틀림은 `AdminViewReadError`(원래 글은 `cause`에만)이고 쓰지 않는다

### REQ-8005: 보기·비교 브라우저 함수 · 오류 번호
- AC-8005.1: Given 가짜 Supabase, When `src/lib/auth/adminView.ts`의 `startAdminView(id)`·`stopAdminView()`·`listViewHospitals()`·`readViewLog()`·`setHospitalRegion(id, sido|null)`을 부르면, Then 각각 design.md '브라우저 함수'의 `rpc` 이름·인자로 한 번만 부르고 표(`from`)를 쓰지 않으며, 답을 정해 둔 모양으로 바꾼다(모양이 하나라도 틀리면 실패). 실패(답 오류·던짐·클라이언트 만들기 실패·모양 틀림)는 모두 `AdminViewError`(메시지에 원래 글 없음, `cause`에만)이고 저절로 다시 부르지 않는다
- AC-8005.2: Given 가짜 Supabase, When `src/lib/storage/adminRows.ts`의 `readAdminRows(kind, ids, from, to)`를 부르면, Then `rpc('admin_rows', { p_kind, p_hospital_ids, p_from, p_to })`를 1,000줄씩 `range`로 다 읽을 때까지 부르고 `{ hospitalId, row }` 목록을 준다. 실패는 `AdminRowsError`(원래 글은 `cause`에만)다
- AC-8005.3: Given 오류 번호 표, When `errorInfo(번호)`를 부르면, Then `E-VIEW-START`·`E-VIEW-LOG`·`E-REGION-SAVE`·`E-COMPARE-READ`·`E-VIEW-READONLY`가 design.md '화면 글자'의 글과 같고 `ErrorCode`에 든다. 다른 번호와 글은 그대로다

### REQ-8006: 앱 틀 — 보는 중 띠 · 보는 의원 고르기 · 메뉴에서 빼기 · 이름
- AC-8006.1: Given (app) 레이아웃, When 관리자(데스크 아님)를 그리면, Then `readAdminView()`를 한 번 읽어(그리기와 탭 이름이 같은 요청에서 한 번 — `currentView`) `AppShell`에 `viewing`으로 넘긴다. 관리자가 아니거나 데스크면 읽지 않고 `viewing`이 없다. 읽기 실패는 던진다 → 오류 화면(`E-PAGE-FAILED`)
- AC-8006.2: Given `viewing`이 있는 앱 틀, When 관리자 화면(`/admin`과 그 아래)이 아닌 곳을 그리면, Then 위에 붙는 묶음 맨 위에 44px 띠(`{의원 이름} 보는 중 · 읽기만` + `· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요` + [`내 의원으로`], 눈 아이콘, 글·색·크기는 design.md '화면 글자'·'앱 틀')가 있고 본문은 `ViewingProvider`(REQ-8007) 안이다. 머리의 의원 이름과 브라우저 탭 이름은 보는 의원 이름이다(계정 단추는 내 메일 그대로). 관리자 화면에서는 띠가 없고 본문은 읽기만이 아니다(보기 상태는 남아 다른 탭으로 가면 다시 띠). `viewing`이 없으면 띠가 없고 앱 틀의 글자·차례·클래스가 지금과 같다
- AC-8006.3: Given 보는 중, When 탭 띠·[더보기]를 그리면, Then 예약·환자·청구가 없고 주소가 `/calendar`·`/patients`·`/claim`과 그 아래(비트 PC 연결 `/claim/setup` 포함)이면 본문을 그리지 않고 `router.replace('/dashboard')`를 한 번 부른다(글 없음, 새 부품 `ViewGate`). [더보기] 안의 다른 탭(입지 분석·설정·직원·재고·주소록 등)은 모두 보이고 읽기만이다
- AC-8006.4: Given 관리자(데스크 아님)의 머리, When 그리면, Then 시계 왼쪽·계정 단추 왼쪽에 단추 `보는 의원`(눈 아이콘 + 아래 화살표, 평소 `ds.button.secondarySmall`, 보는 중 켜짐 모양)이 있다(관리자가 아니거나 데스크면 없음). 누르면 판(제목 `다른 의원 보기`·설명·찾기 칸 `의원 이름으로 찾기`·묶음 `내 의원` / `다른 의원 {n}곳`, 줄 = 의원 이름 + 오른쪽 지역, 지금 보는 의원은 체크 + 파랑 굵게, 찾는 것이 없으면 `찾는 의원이 없어요`)이 열리고 `listViewHospitals()`를 한 번 읽는다. 바깥 누름·Esc로 닫힌다. 다른 의원을 고르면 확인 창 없이 `startAdminView(id)` → 받은 열쇠로 보기 쿠키 → `location.assign('/dashboard')`, 보는 중에 `내 의원` 줄을 고르면 [`내 의원으로`]와 같다(보는 중이 아니면 닫기만). 읽기·시작 실패는 판 안에 `E-VIEW-START` 카드이고 쿠키를 쓰지 않는다
- AC-8006.5: Given 띠의 [`내 의원으로`], When 누르면, Then `stopAdminView()`를 한 번 부르고(실패해도) 보기 쿠키를 지운 뒤 `location.assign('/dashboard')`다. 로그아웃([로그아웃]·오래 안 씀 로그아웃)도 보기 쿠키를 지운다. 페이지를 새로 고쳐도 보던 의원을 계속 본다(세션 쿠키, 12시간까지). `viewing`이 없는데 보기 쿠키가 남아 있으면(끝났거나 12시간 지남·관리자에서 빠짐) 앱 틀이 쿠키를 지우고 한 번 새로 연다
- AC-8006.6: Given 보는 중, When `useClinicProfile`로 의원 이름을 쓰는 화면(통계·서식 등)을 그리면, Then 이름은 보는 의원 이름이다(병원 정보 이름이 없을 때 내 가입 이름을 쓰지 않는다)
- AC-8006.7: Given 이 기능이 더한 띠·고르기 판, When 클래스를 보면, Then 폰 전용 모양(`max-md:` 새 줄)이 없고 색은 `globals.css` 토큰만 쓴다(시안 그대로)

### REQ-8007: 읽기만 바탕 (`src/components/shell/viewing.tsx` · `viewPaths.ts`)
- AC-8007.1: Given `ViewingProvider viewing={{ hospitalId, name }}`, When 안에서 `useViewing()`·`useReadOnly()`를 부르면, Then 각각 그 값·참이다. 바깥이거나 `viewing={null}`이면 `null`·거짓이다. `ReadOnlyArea`(보기와 상관없이 읽기만 구역, 의원 비교가 씀) 안에서는 `useViewing()`은 그대로이고 `useReadOnly()`만 참이다
- AC-8007.2: Given `<WriteOnly>`, When 그리면, Then `useReadOnly()`가 참이면 아무것도 그리지 않고 거짓이면 children을 그대로 그린다(감싸는 요소를 더하지 않는다)
- AC-8007.3: Given `viewPaths.ts`, When 부르면, Then `VIEW_HIDDEN_TABS`는 `['/claim', '/patients', '/calendar']`(`menu.ts` `MENU` 차례 — 청구 → 환자 → 예약, 2026-11-24 TASK-4 일꾼 확인으로 고침)이고 `isViewBlockedPath(주소)`는 그 셋과 그 아래 주소(`/claim/setup` 포함)면 참, `/claims`처럼 비슷한 이름·`/dashboard`·`/admin`·그 밖은 거짓이다. `isAdminScreen(주소)`는 `/admin`과 그 아래(`/admin/compare`)만 참이고 `/administrator`·`/location`은 거짓이다. `menu.ts`는 고치지 않는다

### REQ-8008: 탭마다 읽기만 — 대시보드 · 통계 · 비트 연결 끄기
- AC-8008.1: Given 보는 중(`useReadOnly()` 참), When 통계를 그리면, Then design.md '탭마다 읽기만' 통계 줄의 단추·칸(불러오기 상자 전체 — [비트에서 불러오기]·파일 고르기·불러올 기간·오늘 진료 끝, [다시 저장]·[이어서 불러오기]·[매출만 다시 읽기]·[목표 적기]/[목표 고치기]·[묶음 고치기]·처방 고르기 넣고 빼기)이 없고, 저장된 숫자 카드와 기간 단추·탭·[다시 읽기](서버 다시 읽기)는 그대로다. 의원 이름은 보는 의원 이름이다
- AC-8008.2: Given 보는 중, When 통계 '예약' 카드를 그리면, Then 예약 숫자는 `readAdminRows('calendar_counts', [보는 의원], …)`로 읽고(`calendar_appts`·`listCalendarSlots`를 바로 읽지 않는다) '다시 예약'·'예약 빈자리' 작은 칸은 그리지 않는다(새 글 없음). 보는 중이 아니면 지금과 같다
- AC-8008.3: Given 보는 중, When 대시보드를 그리면, Then [AI 리포트 만들기]·[다시 분석]·입지 알림 [닫기]·[비트에서 다시 읽기]가 없고, 비트 바로 읽기(`BitDashboard`·`readBitDays`)와 입지 알림 저절로 쓰기(`useLocationWatch`의 `addEvents`·`setWatchChecked`)를 하지 않으며, 저장된 숫자 칸은 보는 의원 것이다. [저장된 숫자 새로고침](저장된 줄을 다시 읽기만 함)은 그대로 있다
- AC-8008.4: Given 보는 중, When `useBridge`를 쓰는 화면을 열면, Then `chrome.runtime`을 건드리지 않고 상태 `no-extension`을 주며 `call`·`stream`은 보내지 않고 실패한다. 보는 중이 아니면 지금과 같다

### REQ-8009: 탭마다 읽기만 — 업무일지 · 수납일지 · 직원
- AC-8009.1: Given 보는 중, When 업무일지를 그리면, Then 지금의 '보기만' 모양(`viewOnly` — 칸 저절로 저장·비트 채우기(`useBitFill`)·[지금 불러오기]·[비트 숫자로 바꾸기]·글씨 크기·시재 고치기 없음)이고 보는 의원 줄을 보인다. 메모·비고·사유 같은 자유 글 칸은 보인다
- AC-8009.2: Given 보는 중, When 수납일지를 그리면, Then 비트·도우미 판·날짜 조건과 상관없이 늘 서버 숫자 화면(`RemoteView`)이고 비트·PC 저장소를 읽지 않으며, 환자 칸이 든 장부(`LedgerRows`의 `차트`·`이름` 칸과 `이름·차트번호 찾기`, `PaidRows`, `RsvPicker`)를 그리지 않는다(design.md '환자 칸 숨김'). [마감하기]·[마감 풀기]·[설정]·지출 줄 더하기·지우기·[비트에서 다시 불러오기]가 없고, 지출 메모는 보인다
- AC-8009.3: Given 보는 중, When 직원 탭(명단·근무표·휴가·급여)을 그리면, Then design.md '탭마다 읽기만' 직원 줄의 쓰기 단추·칸이 없고(금액 칸은 글자로만), 전화·생일·주소·계좌·메모·급여·파일 목록은 보이며 [받기]·[인쇄·PDF]·[그림 파일]·[엑셀 받기]는 그대로다
- AC-8009.4: Given 보는 중, When 직원 탭이 예약 건수(`countAppts`)를 쓰면, Then `calendar_appts`를 바로 읽지 않고 `readAdminRows('calendar_counts', [보는 의원], …)`로 같은 날 목록(취소 뺌)을 만든다. 보는 중이 아니면 지금 부르기 모양 그대로다

### REQ-8010: 탭마다 읽기만 — 고시·공지 · 입지 분석 · 재고
- AC-8010.1: Given 보는 중, When 고시·공지 글을 열면, Then 읽음 표시(`markRead`)를 쓰지 않고 [별표]·[메모 저장]·[AI에게 묻기]·[확인했어요]·[되돌리기]/[다시 적용]·낱말 더하기·빼기가 없다. 글 목록·보는 의원의 별표·메모·맞춤 표시는 보인다
- AC-8010.2: Given 보는 중, When 입지 분석을 그리면, Then 후보·매물·메모·사진·점수 설정·주소록에 넣기 단추가 없고 `markCandidateEventsSeen`·`saveFlowCache`·알림 줄 쓰기를 하지 않는다. 보는 의원의 후보·사진은 보인다
- AC-8010.3: Given 보는 중, When 재고를 그리면, Then 처음 분류 넣기(`loadInventory`의 seed)를 하지 않고 design.md '탭마다 읽기만' 재고 줄의 쓰기 단추가 없으며 [양식 받기]는 그대로다

### REQ-8011: 탭마다 읽기만 — 주소록 · 서식 · AI 리포트 · 설정
- AC-8011.1: Given 보는 중, When 주소록·서식을 그리면, Then design.md '탭마다 읽기만'의 쓰기·AI 단추가 없고 [인쇄·PDF]·[그림 파일]은 그대로다. 주소록의 사이트 비밀번호(`site_pw`)는 보인다(사용자 "비밀번호도 보이기")
- AC-8011.2: Given 보는 중, When AI 리포트를 그리면, Then [분석]·[다시 분석]이 없고 저장된 보는 의원 리포트는 보인다
- AC-8011.3: Given 보는 중, When 설정을 그리면, Then 모든 칸의 쓰기 단추·입력이 없고(값은 글자로 보임), [비트 PC 연결]로 가는 길과 '관리자만 보는 탭' 칸이 없으며, 데스크 계정 칸은 보는 의원의 데스크 메일 목록을 보인다. [받기](설치 파일)는 그대로다

### REQ-8012: 관리자 화면 — 안쪽 메뉴 · 이름 눌러 보기 · 지역 칸 · 본 기록
- AC-8012.1: Given 관리자 화면 가입 승인 '승인' 탭, When 그리면, Then 내 줄이 아닌 의원 이름이 눈 아이콘 + 파랑 글자 단추(마우스 글 `{의원 이름} 화면 보기 (읽기만)`, 관리자 칩은 그 뒤)이고 누르면 확인 창 없이 `startAdminView(그 병원)` → 보기 쿠키 → `location.assign('/dashboard')`다(보는 중이면 그 의원으로 바뀜, 실패하면 그 자리 `E-VIEW-START` 카드). 내 줄 이름은 보통 글자다. 안내 글 끝에 `의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.`가 붙는다
- AC-8012.2: Given '승인' 탭(대기·거절 탭에는 지역 칸이 없다), When 그리면, Then 줄마다 새 칸 `지역`의 고르기 상자(32px, 값 = 관리자가 정한 지역 → 주소에서 읽은 시·도 → `지역 모름`, 고르기 = 17개 + `지역 모름`)가 있고 `지역 모름`은 주황 글자 + 마우스 글 `병원 정보에 주소가 없어 지역을 몰라요. 골라 주세요.`다. 바꾸면 `setHospitalRegion`을 한 번 부르고(`지역 모름` = `null`), 되면 그 줄 값만 바뀌고 완료 줄 `{의원 이름} 지역을 {지역}로/으로 바꿨어요.`(받침 따라 '로'·'으로', 'ㄹ' 받침은 '로')가 뜬다. 실패하면 `E-REGION-SAVE` 카드이고 값은 그대로다
- AC-8012.3: Given 관리자 화면 가입 승인, When 그리면, Then 승인 표 아래 `ds.panel` 칸 `본 기록`(오른쪽 `최근 30일 · {n}번`, 설명 `관리자가 다른 의원 화면을 열 때마다 적어요.`, 칸 `본 때`·`본 관리자`·`본 의원`, 때 모양 `11월 24일 (화) 09:12` 한국 시각, 관리자 모양 `{의원 이름} · {메일}`)이 `readViewLog()`로 새 것이 위인 줄을 보인다. 줄이 없으면 `최근 30일 · 0번`이고 표 몸통이 빈다. 읽기 실패는 그 칸 안 `E-VIEW-LOG` 카드 + [다시 불러오기]다(다른 칸은 그대로)
- AC-8012.4: Given 관리자 화면, When 그리면, Then 설정 화면과 같은 모양의 안쪽 메뉴 `가입 승인` | `의원 비교`(`/admin`·`/admin/compare`)가 있다(계정 메뉴에는 [의원 비교]를 더하지 않는다). 관리자 화면에서는 보는 중이어도 띠·숨김이 없어 가입 승인·거절·되돌리기·관리자 정하기·빼기·설치 파일 올리기·지역 고치기가 지금처럼 된다
- AC-8012.5: Given 가입 승인 화면, When `listApplications`·`listAdminHospitals`·`listViewHospitals`를 읽으면, Then 셋이 다 온 뒤 탭·표를 그리고 하나라도 실패하면 지금과 같이 화면 오류(`E-PAGE-FAILED`)다

### REQ-8013: 지역 읽기 (순수 함수 `src/lib/admin/region.ts`)
- AC-8013.1: Given `SIDO_LIST`, When 보면, Then design.md '지역'의 17개 이름(`서울`·`부산`·`대구`·`인천`·`광주`·`대전`·`울산`·`세종`·`경기`·`강원`·`충북`·`충남`·`전북`·`전남`·`경북`·`경남`·`제주`)이 그 차례다
- AC-8013.2: Given 주소 글, When `sidoOf(주소)`를 부르면, Then design.md '지역' 읽기 규칙대로다: 정식·옛·줄인 이름(`서울특별시`·`서울시`·`서울` → `서울`, `강원도`·`강원특별자치도` → `강원`, `전라북도`·`전북특별자치도` → `전북`, `광주광역시`·`광주` → `광주`, `전라남도`·`전남` → `전남`, `제주특별자치도`·`제주도` → `제주` …), `전남광주통합특별시` 다음 낱말이 '구'로 끝나면 `광주`·아니면 `전남`, 앞의 우편번호·`대한민국` 떼기, 띄어쓰기 없이 붙은 정식 이름. `광주시`만 있음(경기 광주시와 헷갈림)·시·도가 없음(`성남시 분당구 …`)·빈 글·`null`은 `null`이다
- AC-8013.3: Given 관리자가 정한 지역과 주소, When `regionOf(주소, 정한 것)`을 부르면, Then 정한 줄이 있으면 그 값(`null`이면 `null`), 정한 줄이 없으면 `sidoOf(주소)`다. `null`은 화면에서 `지역 모름`이다

### REQ-8014: 의원 비교 계산 (순수 함수)
- AC-8014.1: Given 한 의원 한 달 `sales_days` 줄, When `salesRow(줄)`을 부르면, Then 총진료비 = 날마다 `total`(없으면 `rough_total`, 통계 '총매출'과 같음)의 합, 내원·신환·재진 = 칸마다 합, 하루 평균 내원 = 내원 합 ÷ 내원이 1 이상인 날 수(소수 첫째 자리까지, 그 아래 버림 — 시안 `136.4건`), 날이 하나도 없으면 모두 `null`이다. 빈 칸(`null`)은 합에서 뺀다
- AC-8014.2: Given 한 의원 한 달 급여 줄·직원(직군·고용 형태·들어온 날·나간 날)·급여 항목, When `payByJob(…)`을 부르면, Then 직군 여섯마다 정규직·계약직 가운데 그달 지급 합계(실수령 기준 — `lib/staff/pay.ts` `lineTotal` 그대로)가 0보다 큰 사람의 사람 수·평균(원 미만 버림)·가장 적음·가장 많음이고, 파트타임은 그달 일한 사람 수만이다. 직원 줄이 지워진 급여 줄은 뺀다. 지급 합계가 0보다 큰 줄이 하나도 없으면 `급여 없음`(`none: true`)이다
- AC-8014.3: Given 비교 줄과 칸, When `sortRows(줄, 칸, 차례)`를 부르면, Then 오름·내림 차례로 줄을 바꾸고 빈 값(`null`·`급여 없음`, 화면 `–`)은 차례와 상관없이 늘 맨 아래이며 같은 값은 이름 차례다. 처음 차례는 총진료비 내림차순이다. `nextSort(지금, 누른 칸)`은 다른 칸이면 오름, 같은 칸 오름이면 내림, 같은 칸 내림이면 오름이다. `ownFirst(줄)`은 내 의원 먼저 + 이름 차례다(월급·매출 표·나란히 보기)
- AC-8014.4: Given 한 의원의 비교 자료, When `representative(자료, 달)`을 부르면, Then design.md '대표 숫자 표'의 여덟(비급여 비율 · 신환 재방문율 (30일) · 신환 예약률 · Block 전환율 · 예약 수 · 가장 많은 나이대 · 목표 달성률 · 3번 이상 받은 비율, 시안 차례)마다 그 표의 함수·규칙으로 만든 값과 글(`31.4%`·`50대 · 24.1%`·`3,412건`)이고, 자료가 없으면(합계 저장 전 달 포함) `null`(화면 `–`)이다. 건당 진료비는 만들지 않는다
- AC-8014.5: Given 한 의원의 비교 자료와 고른 달, When `compareStatsInput(자료, 달)`을 부르면, Then design.md '나란히 보기 칸 표'의 작은 칸마다 값을 통계 탭과 같은 순수 함수로 만든다(기간 = 그달, 증감 비교 = 지난달, '평소와 다른 것'은 오늘 = 다음 달 1일, '휴일에 따라'만 그달 끝까지 12달, '이번 달 목표'는 그달 매출 목표). 새 계산 공식을 두지 않고, 저장되지 않은 값은 `null`이다

### REQ-8015: 의원 비교 화면 — 고르기 · 순위 표 · 월급 표 · 매출 표 (`src/components/admin/compare/`)
- AC-8015.1: Given 고르기 칸, When 그리면, Then `지역` 고르기는 `전체`(첫 값) + `SIDO_LIST` 17개 + (지역 모름인 의원이 있으면) `지역 모름`이고, `달`은 2차 시안의 ◀ [연도 ▾] [월 ▾] ▶이며 처음 값은 한국 날짜로 지난달, 고를 수 있는 달은 REQ-8023(저장된 가장 이른 달 ~ 지난달, 10년까지 — 2차 사용자 결정 18로 '지난 12달'을 바꿈)이다. 아래 줄은 `{YYYY년 M월} · M월 1일 – M월 말일 · 의원 {n}곳`(지역을 고르면 `{지역} 의원 {n}곳`)이고 바로가기 알약 넷(`의원 순위`·`통계 나란히 보기`·`직군별 월급`·`매출·환자 수`)이 붙어 있다. 바꾸면 `onChange`로 알린다
- AC-8015.2: Given 의원 줄들, When 순위 표를 그리면, Then 묶음 머리 `매출·환자 수` / `직군별 평균 월급` / `통계 대표 숫자` 아래 칸이 `의원`(순위 번호 + 이름 + 내 의원이면 칩 `내 의원` + 지역이 `전체`일 때 지역) · `총진료비` `내원 수` `신환` `재진` `하루 평균 내원` · 직군 여섯 · 대표 숫자 여덟(design.md '대표 숫자 표' 차례)이다. 첫 칸은 왼쪽에 붙어 옆으로 밀어도 남고, 처음 차례는 총진료비 내림차순이다. 칸 이름(단추)을 누르면 오름차순, 한 번 더 누르면 내림차순이고 고른 칸은 강조 글자 + ↑·↓ + 그 칸 값 굵게, `aria-sort`가 바뀐다. 값 모양은 design.md '화면 글자'(`1억 3,261만 원`(만 원 아래 버림)·`3,412건`·`286명`·`136.4건`·`252만 원`·`31.4%`·`50대 · 24.1%`), 없는 값은 `–`이고 아래 글이 있다. 의원 이름을 눌러도 보기를 시작하지 않는다
- AC-8015.3: Given 월급 자료, When 직군별 월급 표를 그리면, Then 칸 `의원` + 직군 여섯 + `파트타임`, 직군 칸은 `평균 252만 원` / `4명 · 238만~271만 원`(한 명이면 `365만 원` / `1명`, 없으면 `–`), 파트타임 칸은 `2명`, 급여 없는 의원은 그 줄에 `급여 없음 · {M}월 급여를 적지 않았어요` 하나다. 줄 차례는 내 의원 먼저 + 이름 차례, 아래 줄 `전체 {n}곳`과 아래 글(design.md '화면 글자')이 있다
- AC-8015.4: Given 매출 자료, When 매출·환자 수 표를 그리면, Then 칸 `의원` `총진료비` `내원 수` `신환` `재진` `하루 평균 내원`이고 값 모양은 순위 표와 같다. 줄 차례는 내 의원 먼저 + 이름 차례, 아래 줄 `전체 {n}곳`(그달 숫자 없는 의원이 있으면 뒤에 `· 숫자 있는 {k}곳 합`, AC-8023.3) + 마지막 칸 `의원 평균 {x}건`(숫자 있는 의원마다 하루 평균 내원의 평균, 소수 첫째 자리 버림)이다
- AC-8015.5: Given 넓은 표, When 그리면, Then 표 칸만 옆으로 밀리고(바깥 틀 `overflow-x-auto`) 폰 전용 모양(`max-md:` 새 줄)이 없다. 바탕은 통계 화면과 같은 회색 바탕 + 흰 큰 카드(`StatsCard` 모양)다
- AC-8015.6: Given 빈 자료, When 그리면, Then 지역에 승인된 의원이 0곳이면 네 칸 모두 `의원 없음 · {지역}에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.`, 그달 저장된 숫자가 있는 의원이 없으면 순위·나란히 보기·매출 칸은 `자료 없음 · {YYYY년 M월}에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.`, 그달 급여를 적은 의원이 없으면 월급 칸은 `급여 없음 · {YYYY년 M월} 급여를 적은 의원이 없어요.`다

### REQ-8016: 통계 나란히 보기 (`src/components/admin/compare/CompareStats.tsx` · `CompareCells.tsx`)
- AC-8016.1: Given 지역을 고른 비교 화면과 의원 N곳의 `compareStatsInput` 결과, When 그리면, Then 줄 = 시안의 통계 큰 카드 일곱(`요약`·`환자`·`매출`·`예약·전환`·`예약`·`처방`·`진료 운영`, 줄 이름 옆에 작은 칸 이름들), 칸 = 의원마다 288px 흰 작은 카드(내 의원 먼저 + 이름 차례)이고 같은 카드는 같은 줄에 있다(줄 높이는 그 줄에서 가장 높은 칸). 줄 이름 칸은 왼쪽에 붙어 있고 의원이 많으면 옆으로 민다. 옆 글은 `{달} · {지역} {n}곳 · 통계 탭 카드를 의원마다 나란히 · 같은 달 · 옆으로 밀어 봐요`다
- AC-8016.2: Given 각 칸, When 그리면, Then 작은 칸은 design.md '나란히 보기 칸 표'의 차례·자료·못 만들 때 글 그대로이고(합계 저장 전 달은 그 값만 `–`, 그 의원에 그달 자료가 하나도 없으면 칸 전체 `자료 없음`), 판 전체가 `ReadOnlyArea` 안이며 쓰기 단추가 없다
- AC-8016.3: Given 아직 읽는 의원·읽기 실패 의원, When 그리면, Then 그 의원 칸만 읽는 중 표시·`E-COMPARE-READ` 카드 + [다시 불러오기]이고 다른 칸은 그대로다
- AC-8016.4: Given 칸 줄 목록, When 시험이 보면, Then `TOC_LINKS`의 카드마다 나란히 보기 줄이 있거나 design.md '나란히 보기 칸 표'에 그리지 않는 까닭이 적혀 있다('보고'). 통계 탭에 카드가 더해지면 이 시험이 실패한다

### REQ-8017: 의원 비교 화면 잇기 · 불러오기 한도 (`/admin/compare`)
- AC-8017.1: Given `/admin/compare`, When 관리자가 열면, Then 그려지고(관리자가 아니면 문지기가 `/dashboard`로 — 지금 `ADMIN_PATHS` 규칙), 브라우저 탭 이름은 '화면 글자'의 제목이다
- AC-8017.2: Given 지역·달, When `useCompareData`가 불러오면, Then `listViewHospitals()` 한 번 뒤 그 지역 의원만(`전체`면 승인된 의원 모두, 내 의원 포함), 의원마다 design.md '비교 읽기' 종류를 `readAdminRows`로 읽고 한 번에 세 의원까지 동시에 읽으며, 끝난 의원부터 칸을 채운다. 같은 (의원, 달)은 화면을 떠나기 전까지 다시 읽지 않는다
- AC-8017.3: Given 지역이 `전체`, When 그리면, Then 통계 나란히 보기 칸은 `지역을 골라 주세요 · 지역을 고르면 그 지역 의원들의 통계 카드를 나란히 보여 줘요.`이고 나란히 보기에만 드는 자료(그 판의 카드 입력)를 만들지 않는다. 지역을 고르면 그 지역 의원으로 나란히 보기를 그린다
- AC-8017.4: Given 비교 화면, When 그리면, Then 네 칸이 모두 같은 지역·달을 쓰고, Web Worker·비트 연결을 만들지 않으며, 쓰기 요청(`from(...).insert/update/upsert/delete`·쓰기 함수)을 보내지 않는다

### REQ-8018: 통계 합계 저장 — 비교에 드는 비트 숫자 (사용자 "합계만 저장하게 더하기")
- AC-8018.1: Given 의원이 통계 탭에서 비트로 불러옴(Block·물리치료 묶음 정의가 있음), When 저장하면, Then 그 날 줄 payload에 새 열쇠 `sunap`(그날 `SunapRates` 9개 수, design.md '통계 합계 저장')이 함께 저장되고, 그 기간 날 `sunap`을 모두 더한 값은 같은 자료로 통계 탭 'Block 전환'이 세는 `sunapRates` 값과 같다. 묶음 정의가 없으면 열쇠를 넣지 않는다
- AC-8018.2: Given 같은 불러오기, When 저장하면, Then Worker 기억 범위 안에 온전히 든 달마다 달 줄 payload에 새 열쇠 `dropoff`(`asOf` = 자료 끝 날, `lines` = 묶음마다 첫 진료가 그달인 신환의 `DropoffLine`)가 저장되고, 그 범위 모든 달의 `lines`를 묶음마다 더한 값은 통계 탭 '몇 번까지 받나'의 `dropoff()` 값과 같다
- AC-8018.3: Given 다 불러온 달 하나, When 견주면, Then 그달 달 줄 `payload.rx`(patients·newPatients·returning)가 그달로 센 `rxVisitSplit`과 같고, 그달 `sections.mix`(전체)가 통계 탭 '환자 구성' [전체]와 같다(같지 않으면 design.md '위험'대로 달 줄 `rxSplit` 열쇠를 더해 같게 만든다)
- AC-8018.4: Given 새 열쇠가 없는 옛 줄과 있는 새 줄, When 줄 검사(`validate.ts`)·저장·읽기·DB 검사를 하면, Then 둘 다 통과하고(`schemaVersion: 2` 그대로, SQL 바꿈 없음) 통계 탭 화면·AI 경로에 보내는 집계는 지금과 같다. 확실하지 않은 불러오기 조각에는 새 열쇠를 넣지 않고, 64KB를 넘는 날 줄은 지금처럼 `again`만 빠진다
- AC-8018.5: Given 새로 저장한 줄, When 보면, Then 환자 이름·차트번호·환자 한 사람 줄이 없다(가짜 이름·차트를 넣은 불러오기로 저장 줄 글자를 찾는다). 도우미·확장·`lib/bridge`는 바뀌지 않고 환자 자료 구역 울타리 시험(`guardrails.test.ts`)이 그대로 지난다

### REQ-8019: DB — 채울 기간 · 올림 상태 · 겹침 막기 · 가장 이른 달 (`supabase/migrations/20261124010000_admin_sync.sql`)
- AC-8019.1: Given 이 파일을 TASK-1 파일 다음에 붙인 DB, When 표 `auto_upload_plans`·`auto_upload_status`를 보면, Then 둘 다 RLS가 켜져 있고 `anon`·`authenticated`에 표 권한이 없으며 정책이 없다(원장·관리자가 바로 `select`·`insert`·`update`·`delete`하면 막힌다). 두 번 실행해도 같고, TASK-1 파일·앞 migration의 표·정책·함수는 하나도 바뀌지 않는다(옛 RLS 시험이 고치지 않고 지난다)
- AC-8019.2: Given 관리자와 승인된 병원 HA·대기 HC, When `set_auto_upload_months(HA, 12)`·다시 `1`을 부르면, Then 계획 줄이 생기고 바뀌며 HA의 `sales_days`·`stats_days`·`stats_months`·`stats_coverage` 줄 수는 그대로다(줄여도 지우지 않음). 값이 1·2·3·6·12·24·36·60·120이 아니거나 HC·없는 병원이면 22023, 관리자가 아니면 42501이다
- AC-8019.3: Given 관리자, When `admin_auto_upload_list()`를 부르면, Then 승인된 병원마다 한 줄(계획 줄이 없으면 `months = 2`, 상태 줄이 없으면 상태 칸 `null`)이고 대기·거절 병원과 `lease_*` 칸은 없다. 관리자가 아니면(원장·데스크 포함) 42501이다
- AC-8019.4: Given 승인된 원장 HA, When `my_auto_upload_plan()`·`claim_auto_upload(탭1, 표시1)`을 부르면, Then HA의 (`months`(줄 없으면 2), `through_day`)·`true`이고 처음 받은 비트 표시(`bit_mark`)가 HA에 남는다. 다른 표시로 부르면 `false`이고 HA 상태 줄에 `E-AUTO-OTHER-BIT`가 적힌다(표시·잡음은 그대로). 같은 때 `claim_auto_upload(탭2, 표시1)`은 `false`, `탭1`이 다시 부르면 `true`(늘림)이고, 잡은 때가 7분 지나면(`lease_until`을 당겨 봄) `탭2`가 `true`다. 대기 병원 원장·데스크 계정·보는 중(요청 머리 `x-ssk-view`)이면 `my_auto_upload_plan()`은 줄이 없고(브라우저 함수는 `null`), `claim_auto_upload`·`report_auto_upload`는 42501이다
- AC-8019.5: Given HA를 잡은 `탭1`, When `report_auto_upload(탭1, 어제, 그달 1일, null, true)`를 부르면, Then HA 상태 줄의 `through_day`·`filled_from`·`last_ok_at`이 쓰이고 오류 칸이 비며 잡음이 풀린다. 오류 번호를 주면 `error_code`·`error_at`과 그때까지 된 날이 쓰이고 `last_ok_at`은 그대로다. 잡지 않은 `탭2`가 부르면 아무것도 바뀌지 않는다. `p_through`가 한국 어제보다 뒤이거나, `p_filled_from`이 1일이 아니거나 `p_through`보다 뒤이거나, 오류 번호 모양(`^E-[A-Z0-9-]{1,40}$`)이 아니면 22023이다. 다른 병원 HB 줄은 어떤 부르기로도 바뀌지 않는다
- AC-8019.6: Given 관리자, When `admin_compare_first_month()`를 부르면, Then 승인된 병원들의 `stats_days`·`sales_days` 가운데 가장 이른 날의 달 1일이고(대기 병원 줄은 세지 않음, 지역과 상관없음), 줄이 하나도 없으면 `null`이다. 관리자가 아니면 42501이다

### REQ-8020: 저절로 올리기 — 기간 셈 · 상태 글 · 브라우저 함수 (`src/lib/autoUpload/` · `src/lib/storage/autoUpload.ts` · `src/lib/auth/adminSync.ts`)
- AC-8020.1: Given 한국 오늘과 채울 기간(달 수), When `fillRange(오늘, 달 수)`를 부르면, Then `{ from: 오늘 달에서 그 달 수만큼 앞 달의 1일, to: 어제 }`다(11월 24일·2 → 9월 1일 ~ 11월 23일, 120 → 2016년 11월 1일 ~, 12월 1일·1 → 11월 1일 ~ 11월 30일). 달 이름은 `FILL_CHOICES`(`1달`·`2달`·`3달`·`6달`·`1년`·`2년`·`3년`·`5년`·`10년` ↔ 1·2·3·6·12·24·36·60·120) 차례다
- AC-8020.2: Given 상태 줄·채울 기간·한국 오늘, When `uploadStatus(…)`를 부르면, Then design.md '화면 글자' 2차의 네 모양이다: 다 올라옴 `{M월 D일}까지` · 채우는 중 `{M월 D일}까지` + `{YYYY년 M월}까지 채움` · 실패 `lib/errors.ts`의 그 번호 what + `{오류 번호} · {M월 D일}까지` · 한 번도 없음 `아직 없음`. 마우스 글도 그 글이다(`마지막으로 올린 때 {11월 24일 (화) 08:05}`, 채우는 중 덧붙임, 아직 없음 글). 채울 기간 첫날 ≥ `filled_from`이면 채우는 중이 아니다(기간을 늘리면 다시 채우는 중)
- AC-8020.3: Given 가짜 `supabaseBrowser`, When 브라우저 함수(`readMyUploadPlan`·`claimUpload`·`reportUpload`·`readSavedSalesDays`·`readStatsMarks`·`listUploadStatus`·`setUploadMonths`·`readCompareFirstMonth`)를 부르면, Then design.md '저절로 올리기 — 셈·글·브라우저 함수'의 rpc·표 이름·인자로 한 번씩 부르고(`readSavedSalesDays`는 `day`·`day_codes`·`unconfirmed`·`rough_total`만, `readStatsMarks`는 날 줄 `day`·`partial`·`payload->sunap`이 있는지·달 줄 `month`·`payload->dropoff->>asOf`만 고르고 1,000줄마다 다음 쪽), 실패하면 Supabase 글 없이 그 함수의 오류(`AutoUploadError`·`AdminSyncError`)다
- AC-8020.4: Given 오류 목록, When 보면, Then `E-AUTO-MONTHS`·`E-AUTO-UPLOAD`·`E-AUTO-OTHER-BIT` 세 줄이 design.md '화면 글자' 오류 표 글자 그대로다

### REQ-8021: 저절로 올리기 — 돌리기 (`src/components/autoUpload/` · `src/lib/autoUpload/plan.ts` · 비트 통로 차례 `src/components/claim/bitLane.ts`)
- AC-8021.1: Given 앱 틀, When 열리면, Then `AutoUpload`는 아무것도 그리지 않고(빈 자리, 알림·표시 없음) 다음이 모두 참일 때만 일을 한다: 보는 중이 아님(`useReadOnly()` 거짓이고 보기 쿠키(`readViewKey()`)도 없음), 탭이 보이는 중(`document.visibilityState === 'visible'`), 연 뒤 15초가 지남, 비트 통로를 쓰는 화면이 없음(`bitLane`). 그다음 `readMyUploadPlan()`(원장)이 줄을 주면 원장 길, 아니면 `readDeskUploadPlan()`(데스크, REQ-8024)이 줄을 주면 데스크 길로 하고, 둘 다 `null`(승인 전·다른 계정·보는 중)이면 멈추고 도우미에 붙지 않는다
- AC-8021.2: Given 채울 기간·`through_day`·저장된 매출 날(`readSavedSalesDays`)·통계 덮은 날(`readCoverage`)·통계 표시(`readStatsMarks`)·그 의원 묶음 정의(처방 묶음, 수납일지 Block·물리치료 묶음), When `uploadPlan(…)`을 부르면, Then 일 목록은 **어제 묶음 먼저**(어제가 든 매출 덩어리 + 어제까지 저장하는 통계 '새 조각'), 그다음 남은 일을 끝날이 늦은 것부터(최근 달 먼저)다. 매출은 지금 `planRevenue`·`savedMark` 그대로(31일 이하 덩어리, 저장 안 된 날·다 저장 안 된 날만, 어제는 그날 처음일 때만 다시). 통계는 design.md '저절로 올리기 — 통계 조각' 규칙대로 **할 달**(덮지 않은 날이 있는 달 · 최근 24달 안에서 Block·물리치료 묶음이 있는데 `sunap` 없는 날 줄이 있는 달 · 최근 24달 안에서 처방 묶음이 있는데 다 끝난 달의 `dropoff`가 없거나 `asOf` < min(그 달 + 석 달 끝, 어제)인 달)을 골라, 최근 24달 안의 할 달은 '새 조각' 하나(저장 = 가장 이른 할 달 1일 ~ 어제, 읽기 = 저장 앞 31일 ~ 어제)로, 그보다 옛 할 달은 이어진 12달 이하 '옛 조각'(저장 = 그 달들, 읽기 = 앞 31일 ~ 저장 끝 달 + 석 달의 끝 · 어제를 넘지 않음)으로 묶는다. 저장은 늘 달째(지금 달만 어제까지)이고 읽기는 800일 이하다. 할 일이 없으면 빈 목록이다
- AC-8021.3: Given 빈 목록이고 `through_day` ≥ 어제, When 돌면, Then 도우미에 붙지 않고 rpc도 더 부르지 않는다(그날 두 번째 열기부터는 서버 읽기 셋뿐). 빈 목록이지만 `through_day` < 어제면 잡고(`claimUpload`) 상태만 알린다
- AC-8021.4: Given 할 일, When 돌면, Then 같은 브라우저 다른 탭과는 `navigator.locks.request('ssk-auto-upload', { ifAvailable: true })`로, 다른 PC와는 `claimUpload(탭 id, 비트 표시)`로 한 곳만 돈다(못 잡으면 아무것도 안 함). 통로는 `readBitDays`처럼 스스로 붙고(hello → `bit.check` 등록·모든 단계 ok) 비트 표시 = `institutionCode`의 SHA-256 16진 글이다. 요양기관번호를 못 찾은 PC(`institutionCode` 없음, precheck AC-005.13 — 번호 없이 등록한 의원)도 올린다: 표시는 `null`(묶기·검사 없이 잡기만). 단 그 의원에 이미 묶인 표시가 있으면 `null`로는 잡지 못한다(`claim_auto_upload`·`desk_claim_auto_upload`가 거짓 — 번호를 못 찾는 다른 의원 비트 PC에서 같은 계정으로 열어도 그 의원 숫자를 덮어쓰지 않게, 마지막 검토 뒤 고침). 확장·도우미가 없거나 등록 안 된 PC면 알리지 않고 멈춘다. hello가 판 오류(`E-HELPER-OLD`)면 그 번호를 알린다
- AC-8021.5: Given 일 목록, When 돌면, Then 일을 하나씩 차례로(동시에 둘 없음) 통계 탭과 같은 함수로 한다: 매출 = `revenue.days` → `createRevenueStore().saveRange`, 통계 = `stats.rows` → `requestLoad`(그 의원 처방 묶음·TASK-6의 Block·물리치료 묶음 정의를 실음) → `partSave` → `saveStats`(TASK-6 합계 포함, 확실하지 않은 조각은 TASK-6 규칙대로). 수납 마감·업무일지·다른 표는 쓰지 않는다. 일 하나가 끝날 때마다 `reportUpload(…, done = false)`로 `through_day`·`filled_from`(`progressOf`)을 알린다
- AC-8021.6: Given 도는 중, When 첫 도우미 요청에서 5분이 지나면, Then 새 일을 시작하지 않고(하던 일은 끝냄) `reportUpload(…, done = true)`로 마친다. 탭이 숨거나 비트 통로를 쓰는 화면이 열리면(`bitLane`) 하던 일을 그 자리에서 끊고(통로·Worker 닫음, 그 일은 저장 안 함) 오류 없이 마친다. 다음 열기에서 남은 일부터 이어 한다
- AC-8021.7: Given 일 실패, When 번호가 매출·통계 덩어리만 실패로 치는 것(`E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`·`E-STATS-SAVE-FAILED`)이면, Then 다음 일을 계속하고 마지막에 그 번호를 알린다. 그 밖 번호면 거기서 멈추고 그 번호를, 번호 없는 오류면 `E-AUTO-UPLOAD`를 알린다(오류 글·환자 자료는 보내지 않는다). 다음에 다 되면 오류 칸이 비워진다
- AC-8021.8: Given `bitLane`, When 화면(`useBridge`·`readBitDays`)이 붙으려 하면, Then 저절로 올리기가 통로를 쥐고 있으면 그쪽에 끊기를 알리고 놓인 뒤에 붙는다(쥔 쪽이 없으면 지금처럼 바로 — 지금 `useBridge`·대시보드 시험이 고치지 않고 지난다). 화면이 하나라도 붙어 있으면 저절로 올리기는 통로를 잡지 못한다. 그때 저절로 올리기는 그만두지 않고, 그 쪽이 열려 있는 동안 통로가 풀리면(쥔 화면이 모두 떠나면) 그날 할 일을 다시 시도한다(15초·보이는 중 조건은 그대로, 마지막 검토 뒤 고침)
- AC-8021.9: Given `progressOf(채울 기간, 어제, 저장된 날들)`, When 부르면, Then `through_day` = 어제부터 거꾸로 보아 매출·통계가 둘 다 저장된 가장 늦은 날, `filled_from` = 그날에서 거꾸로 끊김 없이 둘 다 저장된 날들의 첫날이 든 달의 다음 달 1일(첫날이 1일이면 그달 1일, 그런 달이 없으면 `null`)이다. 둘 다 저장된 날이 없으면 둘 다 `null`이다
- AC-8021.10: Given 통계 조각 하나의 Worker 답, When `partSave(답, 조각)`(TASK-6이 고친 것)을 부르면, Then 확실하지 않은 조각(읽기 끝 > 저장 끝)에서도 **날 줄 `sunap`은 남기고**(그날 접수만으로 세는 수라 읽기 끝과 상관없음), **달 줄 `dropoff`는 그 달 + 석 달의 끝 ≤ 읽기 끝이면 남긴다**(석 달 넘게 지켜본 값). `after30`·`once`를 빼는 지금 규칙과 확실한 조각은 그대로다. 이 AC는 AC-8018.4의 '확실하지 않은 조각에는 새 열쇠를 넣지 않는다'를 두 열쇠에 한해 바꾼다(통계 탭 '전체 기간' 옛 조각도 같은 규칙 — 통계 탭 화면 숫자는 그대로)
- AC-8021.11: Given 저절로 올리기, When 통계 일을 시작하기 전, Then 그 의원 처방 묶음(`stats_rx_groups`)·수납일지 설정(`sunap_settings`의 Block·물리치료 묶음)을 다 읽은 뒤 그 값을 모든 통계 요청에 싣는다(다 읽기 전에는 시작하지 않음). 읽기가 실패하면 통계 일을 하지 않고 그 번호를 알린다(매출 일은 한다). 묶음을 고르지 않은 의원은 그 열쇠 없이 올린다(비교에서 `–`)

### REQ-8022: 가입 승인 표 2차 — 신청자·이메일 한 칸 · 채울 기간 · 저절로 올림
- AC-8022.1: Given 가입 승인의 '승인'·'대기'·'거절' 탭, When 표를 그리면, Then `신청자`·`이메일` 두 칸 대신 한 칸 `신청자 · 이메일`(첫 줄 이름, 둘째 줄 메일 caption `muted` — 시안 `.who2 .e` 12px muted, 메일 줄 바꿈 자리는 지금처럼 `@` 뒤)이다. 다른 칸·단추·지금 휴대폰 모양은 그대로다
- AC-8022.2: Given '승인' 탭, When 그리면, Then 표 위에 올림 아이콘 + `저절로 올림` 안내 줄(design.md '화면 글자' 2차)이 있고 칸 차례는 신청일 · 의원 이름 · 지역 · 채울 기간 · 저절로 올림 · EMR · 신청자 · 이메일 · 연락처 · 동작, 칸 폭은 시안(신청일 112 · 이름 184 · 지역 108 · 채울 기간 88 · 저절로 올림 248 · EMR 60 · 연락처 132 · 동작 144, 표 최소 폭 1232px — 1440은 다 보이고 더 좁으면 표만 옆으로 밀림)이다. 대기·거절 탭에는 새 두 칸이 없다
- AC-8022.3: Given 채울 기간 칸, When 그리면, Then 지역 고르기와 같은 32px 상자에 `FILL_CHOICES` 아홉(값 = 그 의원 `months`)이고, 바꾸면 확인 창 없이 `setUploadMonths`를 한 번 부르고 되면 그 줄 값만 바뀌며 완료 줄이 늘리면 `{의원} 채울 기간을 {기간}로/으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.`, 줄이면 `{의원} 채울 기간을 {기간}로/으로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.`다(받침 규칙은 지역과 같음 — `1년`→`으로`, `2달`→`로`). 실패하면 그 자리 `E-AUTO-MONTHS` 카드이고 값은 그대로다
- AC-8022.4: Given 저절로 올림 칸, When 그리면, Then 값은 `uploadStatus`(AC-8020.2)의 글이고 색은 보통 `ink`, 채우는 중 둘째 줄 `accent-strong`, 실패 첫 줄 `negative` 500, 아직 없음 `muted`이며(새 색 없음) 마우스 글이 있다. 채울 기간을 바꾸면 다시 읽지 않고 손에 든 값으로 글이 바로 바뀐다
- AC-8022.5: Given 가입 승인 화면, When 열면, Then `listApplications`·`listAdminHospitals`·`listViewHospitals`·`listUploadStatus` 넷이 다 온 뒤 그리고(`Promise.all` 한 번), 하나라도 실패하면 지금처럼 `E-PAGE-FAILED`다

### REQ-8023: 의원 비교 달 — 저장된 가장 이른 달부터 10년까지
- AC-8023.1: Given 가장 이른 달(`admin_compare_first_month`, 없으면 `null`)과 한국 오늘, When `compareMonths(첫 달, 오늘)`을 부르면, Then 고를 수 있는 달은 `max(첫 달, 이번 달 − 120달)`부터 지난달까지이고(이번 달 뺌), 첫 달이 `null`이거나 지난달보다 늦으면 지난달 하나다. 연도는 최근 해가 먼저, 해마다 그 해에 고를 수 있는 달만이다
- AC-8023.2: Given 달 고르기, When 그리면, Then ◀ [연도 ▾] [월 ▾] ▶(읽기용 이름 `달 고르기`·`연도`·`월`·`앞 달`·`다음 달`)이고 옆 글 `{YYYY년 M월}부터 {YYYY년 M월}까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지`가 있다. 연도를 바꿀 때 그 해에 없는 달이면 가장 가까운 고를 수 있는 달로 가고, 첫 달에서 ◀, 지난달에서 ▶가 막힌다. 처음 값은 지난달이다
- AC-8023.3: Given 고른 달에 숫자가 없는 의원이 있는 자료, When 순위·월급·매출 표를 그리면, Then 그 의원 줄은 남고 칸은 `–`(순위 표에서 늘 아래)이며, 매출·환자 수 아래 줄은 `전체 {n}곳` 뒤에 `· 숫자 있는 {k}곳 합`이 붙고 합·`의원 평균`은 숫자 있는 의원만 센다(모두 있으면 덧붙임 없음)
- AC-8023.4: Given 비교 화면, When 열면, Then `readCompareFirstMonth()`를 한 번 읽어 달 고르기에 넘기고(지역을 바꿔도 다시 읽지 않음), 실패하면 지금 화면 오류(`E-PAGE-FAILED`)와 같은 자리에 [다시 불러오기]다. 고른 달이 아무리 옛 달이어도 의원마다 읽는 기간은 `compareRanges(그 달)` 그대로다(한 번에 두 달·휴일 칸 12달)

### REQ-8024: 데스크 계정 올리기 (`supabase/migrations/20261124020000_desk_upload.sql` · `src/lib/storage/deskUpload.ts` — 사용자 "데스크 계정도 올리기 (추천)")
- AC-8024.1: Given 세 SQL 파일을 차례로 붙인 DB, When 함수 열하나(design.md '데스크 계정 올리기' 표)를 보면, Then 모두 정의자·`search_path = ''`·`authenticated`만 부를 수 있고, 새 표·새 정책·표 권한·기본값 바꿈이 없다(더하기만 — 옛 RLS 시험과 TASK-1·TASK-17 시험이 고치지 않고 지난다). 데스크 계정이 `sales_days`·`sales_day_codes`·`stats_days`·`stats_months`·`stats_coverage`를 바로 `select`하면 지금처럼 0줄이고, `my_auto_upload_plan()`은 지금처럼 줄이 없다
- AC-8024.2: Given 승인된 병원 HA의 데스크 계정, When `desk_upload_plan()`·`desk_claim_upload(탭, 표시)`·`desk_report_upload(…)`를 부르면, Then HA에 대해 원장 함수(AC-8019.4·AC-8019.5)와 같은 값·잡음·비트 표시 묶기·검사를 한다(원장 탭과 데스크 탭이 같은 잡음을 다툼 — 한 곳만 `true`). 원장·대기 병원 데스크·데스크 아님·보는 중(요청 머리)이면 `desk_upload_plan()`은 줄이 없고 나머지는 42501이다. 병원 id를 받는 인자가 없어 다른 병원 줄은 어떤 부르기로도 바뀌지 않는다
- AC-8024.3: Given HA 데스크, When `desk_sales_marks(시작, 끝)`·`desk_stats_day_marks`·`desk_stats_month_marks`·`desk_stats_coverage`를 부르면, Then HA 줄의 **날짜와 참·거짓만** 온다(칸은 design.md 표 그대로 — 매출은 `day, day_codes, unconfirmed, has_rough`, 통계 날은 `day, partial, has_sunap`, 달은 `month, partial, dropoff_as_of`, 덮음은 `from_day, to_day`). 금액·환자 수·payload·sections는 오지 않는다. 기간이 거꾸로이거나 3,700일을 넘으면 22023이다
- AC-8024.4: Given HA 데스크, When `desk_save_revenue_range(시작, 끝, 날 줄, 코드 줄)`을 부르면, Then 지금 `save_revenue_range`와 같은 검사(31일 이하·날 수 = 날 줄 수·날이 범위 안·코드 줄 9,300개 이하)를 하고 HA의 `sales_days` upsert·그 범위 `sales_day_codes` 바꿈을 하며 아무것도 돌려주지 않는다. 다른 병원 줄은 그대로다
- AC-8024.5: Given HA 데스크, When `desk_upsert_stats_months(줄들)`·`desk_upsert_stats_days(줄들)`·`desk_add_stats_coverage(시작, 끝)`을 부르면, Then HA 줄만 `source = 'bit'`로 넣거나 고치고(지금 표 제약 — 판 번호 2·크기 한도 — 과 '덜 된 줄이 다 된 줄을 덮지 않음' 트리거가 그대로 걸림) 아무것도 돌려주지 않는다. 덮음은 800일 이하만이다
- AC-8024.6: Given 가짜 `supabaseBrowser`, When `deskUpload.ts` 함수·`saveStats(입력, { desk: true })`·`createRevenueStore(client, { desk: true }).saveRange`를 부르면, Then 지금과 **같은 줄 검사·크기 줄이기·묶음 나누기**를 한 뒤 표 대신 위 rpc를 부르고(원장 부르기 모양은 지금 그대로 — 지금 `stats.test.ts`·`revenue.test.ts`가 고치지 않고 지남), 데스크 표시 함수 답을 원장 읽기와 같은 모양(`SavedRevenueDay` 표시 칸·덮은 기간·통계 표시)으로 바꾼다. 실패 번호는 원장 길과 같다(`E-STATS-SAVE-FAILED`·`E-REVENUE-SAVE-FAILED`·`E-STATS-READ-FAILED`)
- AC-8024.7: Given 데스크 계정으로 연 비트 PC, When 저절로 올리기가 돌면, Then 원장 길과 같은 계획·차례·5분·멈춤·보고(AC-8021.2~11)를 데스크 함수로 한다. 데스크 화면(탭·메뉴·통계 숨김)은 바뀌지 않고, 데스크 브라우저가 서버에서 매출·통계 값을 읽는 부르기는 하나도 없다(가짜로 부르기 목록을 본다)

## 범위 밖
- 다른 의원 화면에서 고치기·저장하기·비트에서 불러오기(사용자 결정 2), 예약·환자·청구 탭 보기(사용자 결정 3).
- 보인 의원에게 알리기·동의 받기(사용자 결정 5), 본 기록 지우기·내려받기.
- 비교 화면의 폰 모양, 그림 파일·엑셀 내보내기, 두 달 이상 기간(나란히 보기 '휴일에 따라'의 12달은 예외), 작년 같은 달과 견주기, 10년 앞보다 이른 달·이번 달 고르기.
- 저절로 올리기를 끄는 단추·의원 화면의 올리는 중 표시·완료 알림·오류 표시(사용자 결정 15), 수납 마감 저절로 하기, 며칠째 안 올라온 의원 색 표시·실패 여러 번 기록(2차 물을 것 4·5 — Claude가 '안 함'으로 정함), 채울 기간을 줄일 때 지우기(사용자 결정 16).
- 새 도우미 판(지금 0.13.2 명령으로 달마다 읽는다 — design.md '조사로 안 것' 16), 한 번 요청에 31일 넘는 매출·800일 넘는 통계 읽기.
- 24달보다 옛 달 가운데 **이미 저장된** 달에 합계(`sunap`·`dropoff`)만 채우려고 다시 읽기(그 달 `after30`·`once`가 지워질 수 있어서 — 그 달은 의원이 다시 불러오기 전까지 `–`, 사용자 결정 11과 같음).
- 합계로 저장하지 않는 비트 숫자(신환 1명당·원장님별 Block 표·보고 문장)를 다른 의원 것으로 보기(진료 줄은 서버에 없다). 합계 저장 전에 불러온 달 채우기(그 의원이 다시 불러와야 한다).
- 보는 중 통계 탭 화면의 비트 칸을 저장 합계로 그리기(통계 탭 화면은 그대로 — 합계는 의원 비교·나란히 보기만 읽는다).
- 관리자 권한 나누기(plan.md §10 '운영자 권한과 병원 관리자 권한의 세부 분리'는 그대로 미룸).
- 대시보드 안 예약·환자·청구 링크 숨기기(누르면 대시보드로 돌아온다), AI 경로 서버의 보기 상태 검사(design.md '위험').
- 시·도 아래(시·군·구) 지역 고르기.

### REQ-8025: 보는 중 통계 탭 — 비트 전용 칸을 저장 합계로 (사용자 "통계도 다 보여야 해", 2026-11-24 Claude가 알리고 고침)
- AC-8025.1: Given 보는 중(`useReadOnly()` 참)이고 고른 기간의 모든 달 줄(`stats_months`)에 저장 합계(`sections.mix`·`sections.doctors`·`sections.hours`·`dropoff`·`groups`)가, 모든 날 줄에 `sunap`이 있을 때, When 통계 탭을 그리면, Then 환자 구성·원장님별·시간대별 접수·처방별 신환·재진·몇 번까지 받나·Block 전환 카드가 '비트 PC에서 불러오면 보여요' 대신 저장 합계로 그려진다. 새 화면 글자는 없고 지금 카드 부품·글을 그대로 쓴다. 몇 번까지 받나는 저장된 평균(`average`·`drop`)을 더하지 않고 수(`n`·`once`·`atLeast`)에서 다시 센다(TASK-13과 같은 셈). 읽기는 `readAdminRows`(보는 의원, 고른 기간)로 한다
- AC-8025.2: Given 보는 중이고 고른 기간 가운데 그 합계가 없는 달·날이 있거나, 카드가 저장 합계에 없는 숫자(예: 원장님별 건수)를 써야 할 때, When 그 카드를 그리면, Then 그 카드만 지금처럼 '비트 PC에서 불러오면 보여요'다(일부 달만으로 세지 않음). 보는 중이 아니면 통계 탭은 지금과 같다(비트 PC는 Worker 기억, 다른 PC는 안내 글). 오늘·월간 보고 글과 신환 1명당은 이 일에 들지 않는다
