# 설계: 다른 의원 보기 · 의원 비교 (admin-view)

> 화면 글자·자리·모양은 승인된 시안 `docs/mockups/admin-view`가 기준이다(다른 일꾼이 만드는 중 — 이 문서는 그 폴더를 고치지 않는다). 이 문서는 자료·권한·함수·나눔을 정한다. 시안과 다르면 화면은 시안이 이기고, 그 때문에 Files 밖 파일이 필요하면 명세를 먼저 고친다.
> 폰 전용 모양은 만들지 않는다(사용자 규칙 2026-11-21). 넓은 표는 표 칸만 옆으로 밀린다.

## 조사로 안 것 (2026-11-24, 코드에서 확인)
1. **화면은 병원 id를 모른다.** 브라우저 읽기는 거의 모두 `hospital_id` 거르기 없이 RLS(`hospital_id = (select public.my_hospital_id())`)에만 기댄다. 한 줄 읽기도 거르기 없는 `.maybeSingle()`이다(`lib/storage/clinicProfile.ts:202·286`, `claimSettings.ts:122·148·172`, `worklogSettings.ts:39`, `sunap.ts:256`, `calendar.ts:475` …). 넣기는 DB 기본값(`hospital_id default public.my_hospital_id()`)이 병원을 정한다. 서버 AI 경로 `app/api/ai/store.ts`도 RLS만 쓴다(시험이 `hospital_id` 글자가 없음을 본다, `store.test.ts:240`).
   → 관리자에게 '남의 병원 읽기'를 그냥 열면 관리자 자신의 화면이 여러 병원 줄을 섞어 읽고 `maybeSingle`은 오류가 난다. 모든 읽기에 `.eq('hospital_id', …)`를 붙이면 `lib/storage` 거의 모든 파일과 부르기 모양을 못 박은 시험 수백 개(`staff.test.ts`·`calendar.test.ts`·`worklogDays.test.ts:237`이 `hospital_id`가 없어야 한다고 봄 …)를 고쳐야 한다.
2. 병원을 고르는 함수: `my_hospital_id()`(승인된 원장, 여러 migration에 같은 글자로 다시 만듦 'C1'), `my_desk_hospital_id()`·`my_clinic_hospital_id()`(데스크, `20261118100000_desk_accounts.sql:43-56`). `is_admin()`은 없고 정책은 `exists (select 1 from public.admins a where a.user_id = (select auth.uid()))`를 그 자리에 쓴다. `admins` 정책 안에서 `admins`를 다시 읽으면 무한 되부름(42P17, multi-admin 머리 주석).
3. 관리자가 지금 남의 병원을 읽는 곳은 `hospitals`(읽기 정책), `admin_hospitals()`, `notice_runs`, `install-files` 바구니뿐이다. 입지 분석 표의 '관리자' 정책은 '내 병원 **이면서** 관리자'다(`20261122000000_location.sql:337-371`).
4. 함수 안에서 `my_hospital_id()`로 읽을 병원을 고르는 읽기 함수: `sales_code_totals`(invoker, `20261114000000_sales_day_codes.sql:105-111`), `notice_list`(invoker, `20261121000001_notice_keywords.sql:173`), `notice_unread_count`(같은 파일 :242), `notice_rule_alerts`(`20261122000000_rule_auto.sql:267`), `rule_change_alerts`(같은 파일 :228), `desk_members`(정의자, `20261118100000_desk_accounts.sql`), `notice_ask_left`(정의자). 쓰기 정의자 함수(`save_ai_report`·`add_ai_usage`·`take_ai_image`·`take_notice_ask`·`end_notice_ask`·`add_desk_member`·`remove_desk_member`·`save_inventory_*`·`update_inventory_receipt`·`delete_inventory_receipt`·`set_inventory_order`)는 RLS를 지나치고 늘 **내** 병원에 쓴다.
5. `calendar_appts`(환자 이름·차트번호·메모, ADR-030)는 예약 탭 말고도 통계(`useStatsCalendar` → `listCalendarCounts`·`listCalendarSlots`, `lib/storage/calendar.ts:259-274` — 칸 묶음 `COUNT_COLUMNS`에는 이름·차트·메모가 없고 `SLOT_COLUMNS`에는 `chart`가 있다)와 직원(`lib/storage/staff.ts:816` `countAppts`)이 읽는다.
6. 통계 탭(`src/components/stats/`)은 저장된 줄(`stats_days`·`stats_coverage`·`stats_rx_groups`·`stats_goals`·`stats_rx_picks`·`sales_days`·`sales_codes`·`sales_code_totals`·`sunap_*`·`calendar_*`·`clinic_profiles`)로 대부분 카드를 그린다. 환자 구성·신환 1명당·Block 전환·원장님별·처방별 신환·재진·몇 번까지 받나·시간대별 접수·오늘/월간 보고 글은 그 PC에서 [비트에서 불러오기]를 한 뒤 Worker 기억(`bit`)에만 있어 다른 PC에서는 '비트 PC에서 불러오면 보여요' 글이다(`StatsScreen.tsx:286`, `PatientMixSection.tsx:23`). `stats_months`는 통계 탭이 읽지 않는다(`view.ts:13`). 카드 차례는 `StatsToc.tsx`의 `TOC_LINKS` 여덟(요약·환자·매출·예약·전환·예약·처방·진료 운영·보고)이다.
7. `StatsSections`는 순수 부품이 아니다(`useClinicProfile` 읽기, 고정 DOM id, `RxSection` portal). `TreatmentTrendSection`(편집기를 열 때만 처방 목록 읽기)·`RxPickerSection`(`rx_picks` 읽기)·`MonthlyReportSection`(`useReportReads`)은 안에서 Supabase를 부른다. 나머지 카드 부품은 props만 받는다.
8. 직원 탭의 그달 지급 금액 = `lib/staff/pay.ts:82-88` `lineTotal(line, items, month)` = 그달 보이는 '금액' 항목 합 + (보이는 인센티브 항목이면) 인센티브 합 + 조정. 항목 목록은 `staff_settings.pay_items`, 보임은 `visibleItems`(`removedFrom`). 세금 계산은 없다(세무사). 급여 확정 잠금도 없다. 고용 형태 `regular`·`contract`·`part`, 직군 여섯(`staff_members.job` check).
9. `sales_days`는 병원·날 한 줄(`primary key (hospital_id, day)`), 통계 탭 [비트에서 불러오기]만 채운다. 통계 '총매출'은 날마다 `total ?? rough_total`(`lib/revenue/summary.ts:48-51`).
10. `clinic_profiles.address`는 글자 한 칸(100자), 설정 → 병원 정보에서 그냥 적는다(주소 찾기 없음). 저장소 안 예: `서울 가짜구 가짜로 1`, `서울시 예시구 예시로 12, 3층`, `경기도 예시시 예시로 45`, `서울특별시 서초구 서초동 123-4`. 2026 개편으로 광주광역시·전라남도 → 전남광주통합특별시(`specs/location/design.md:122`, `src/lib/location/regions.ts:124-133`).
11. 앱 틀 레이아웃(서버)은 옆 탭으로 옮길 때 다시 그려지지 않는다(`(app)/layout.tsx:12`). 지금 쿠키는 Supabase 로그인 쿠키뿐이다. 비트 연결은 `src/components/claim/useBridge.ts` 하나(대시보드만 `readBitDays.ts`가 바로 잇는다).
12. 읽기만 모양의 본보기: 업무일지 `viewOnly`(`WorklogScreen.tsx:72-85` — 저장·비트 채우기를 끔), 수납일지 `RemoteView`(서버 숫자만), 데스크 `useDesk()`(`components/shell/role.tsx`, 보이기만 숨김).
13. SQL 시험은 `supabase/*.rls.test.ts`마다 PGlite + Supabase 흉내(역할·`auth.uid()`·`auth.jwt()`·Storage 흉내)를 복사해 쓰고, 정해 둔 migration 사슬을 차례로 돌린 뒤 이 파일을 두 번 돌린다(`existsSync` — 파일이 없으면 시험마다 실패 = RED). 사용자는 `set_config('request.jwt.claims', …)` + `set role authenticated`로 흉내 낸다.
14. 통계 저장 길·판 번호·네 숫자(몇 번까지 받나·Block 전환·처방별 신환·재진·나이대)의 지금 자리는 '통계 합계 저장'. 앞의 둘만 저장되지 않고, 처방별 신환·재진은 달 줄 `payload.rx`, 나이대는 달 `sections.mix`에 이미 같은 정의로 있다.
15. 보이는 탭의 서버 표에는 정해 둔 환자 칸이 없고, 환자 이름·차트가 화면에 나오는 곳은 이 PC 비트에서 읽는 수납일지 장부뿐이다('환자 칸 숨김'). [저장된 숫자 새로고침]은 `stats_days`를 다시 읽기만 한다(기본값 9).
16. **도우미 0.13.2로 충분**(2026-11-24 조사): `revenue.days` 한 번 31일(`commands.json` maxDays·`RevenueDays.cs:116,149`, 하루씩 읽음 0.3초쯤·달 9초쯤 잼), `stats.rows` 한 번 800일(`loadPlan.ts` `MAX_READ_DAYS`, 조각 하나 1분쯤 어림·잰 적 없음, 명령마다 SQL 150초). 달·12달·24달씩 나눠 읽으면 10년도 된다. 0.13.2는 비트 설치 위치 찾기만 바뀐 판(`3cbb68fb`, 명령·통계·매출 코드 그대로). 31일·800일을 늘리려면 새 판이 든다(이번에는 안 함).
17. 매출 탭은 따로 없고(`/revenue` → `/stats`) 매출은 통계 [비트에서 불러오기]가 `useStatsRevenue.sync` → `planRevenue`(저장 안 된 날·다 저장 안 된 날 + 어제, 31일 덩어리 새것부터) → `syncRanges` → `save_revenue_range`(그 범위 **날마다 한 줄** upsert — 쉬는 날도 줄이 생겨 다시 읽지 않음)로 한다. 통계는 저장된 날을 거르지 않고 늘 다 읽는다(`stats_coverage`가 0명 날까지 덮은 기간을 적음, 덮음 줄은 넣기만).
18. 통계·매출 줄은 **원장 계정만** 저장한다(RLS `my_hospital_id()`, 데스크 정책 없음, 데스크는 통계 화면도 못 엶). 서버에는 의원 요양기관번호가 없다(`bit.check`의 `institutionCode`는 청구 화면만 씀).
19. 확장은 웹 연결을 한 번에 하나만 받고(`E-BRIDGE-BUSY`), 화면은 `useBridge`로 떠 있는 동안 연결을 쥔다. 대시보드 `readBitDays`만 읽는 동안만 쥔다(본보기). 앱 코드에 브라우저 저장소(localStorage 등)가 없다 — '하루 한 번' 본보기는 DB에 날을 적는 `useLocationWatch`.
20. TASK-6(커밋 `904eb776`): 가장 새 조각이 아닌 조각은 `sunap`·`dropoff`를 뺌, `dropoff`는 달 전체가 읽기 안인 달만·`asOf` = 읽기 끝, `sunap`은 수납일지 Block·물리치료 묶음을 다 읽은 뒤에만, `sunapPct`는 `sunapView.ts`.

## 보는 의원 상태 — 어디에 두나 (결정)
| 후보 | 탭을 옮겨도 남나 | [내 의원으로]로 지움 | 관리자 아닌 사람 | 읽기를 바꾸는 법 | 결론 |
|---|---|---|---|---|---|
| 주소 (`?view=`) | 링크·`router.push` 모두에 붙여야 함 — 빠뜨리면 내 의원으로 돌아감 | 됨 | RLS가 막아야 함 | 모든 읽기에 `.eq` | 안 씀 |
| 화면 상태(React·브라우저 저장소) | 새로 고침에 사라짐(저장소면 남음) | 됨 | 같음 | 모든 읽기에 `.eq` | 안 씀 |
| 계정마다 DB 한 줄 | 남음 | 됨 | DB 함수가 거부 | **RLS가 바꿈** | 다른 PC의 같은 계정(의원 PC 청구 등)까지 갑자기 남의 의원 자료를 읽고 쓰기가 막힘 → 안 씀 |
| **쿠키(브라우저마다 보기 열쇠) → 요청 머리 + DB 한 줄** | 남음(쿠키) | 쿠키를 지움 | DB 함수가 그 사람의 열린 줄이 아니면 무시 | **RLS가 바꿈** | **씀** |

- 관리자가 고르면 DB 함수 `start_admin_view`가 본 기록 한 줄을 넣고 그 줄 id(= **보기 열쇠**, uuid)를 준다. 브라우저가 열쇠를 세션 쿠키 `ssk_view`에 두고 페이지를 새로 연다.
- 브라우저·서버 Supabase 클라이언트가 쿠키의 열쇠를 요청 머리 `x-ssk-view`에 붙인다. PostgREST는 요청 머리를 `current_setting('request.headers')`(JSON)로 넘긴다. RLS 함수 `admin_view_hospital_id()`가 그 열쇠로 '이 사람의 열린 보기 줄'을 찾아 보는 의원 id를 준다(아니면 `null`).
- 그래서 **읽기 코드는 그대로** 두어도 RLS가 보는 의원 줄만 준다(내 줄은 숨김). 쓰기는 DB가 모두 막는다(⑤). 브라우저마다 따로라 다른 PC·다른 브라우저는 그대로 내 의원이다. 한 페이지 안에서는 화면(띠)과 자료가 늘 같은 쿠키로 정해진다(시작·끝에 페이지를 새로 열어 클라이언트를 다시 만든다).
- 관리자가 아닌 사람이 쿠키를 꾸며도 `admin_views`에 자기 열린 줄이 없어 `null` → 지금과 같다. 시작은 관리자만 되므로 본 기록 없이 보는 길이 없다.
- Storage는 요청 머리를 정책에 넘기는지 문서로 확인하지 못했다 → 파일 읽기 정책은 머리 대신 '이 사람이 그 의원을 열어 둔 보기 줄이 있나'로 본다(⑥, 읽기만이고 파일 이름은 보이는 줄에서만 온다).

## 흐름
```
[관리자 PC] 머리 '보는 의원 ▾' 또는 관리자 탭 '승인' 줄의 의원 이름
  → startAdminView(병원) = rpc('start_admin_view') → admin_views 한 줄(본 기록) + 열쇠
  → document.cookie = ssk_view=<열쇠> (세션 쿠키) → location.assign('/dashboard')
[새로 연 페이지]
  서버 (app)/layout: currentMe() (그대로) → 관리자면 currentView() = readAdminView()
        = 쿠키 있을 때만 rpc('my_admin_view') (서버 클라이언트도 머리 x-ssk-view를 붙임) → { hospitalId, name } | null
  → <AppShell viewing> ┬ 맨 위 띠 '○○의원 보는 중 · 읽기만' [내 의원으로]
                       ├ 머리 의원 이름·탭 이름 = 보는 의원 이름, '보는 의원 ▾'
                       ├ 메뉴에서 예약·환자·청구 뺌 + ViewGate(그 주소면 /dashboard로)
                       └ <ViewingProvider viewing> → useReadOnly() 참 → <WriteOnly>가 쓰기 단추를 숨김
  브라우저 supabaseBrowser(): 쿠키 → 머리 x-ssk-view + 쓰기 거르는 fetch
  PostgREST → RLS: (select admin_view_hospital_id()) = 보는 의원 → '보기 ○' 표는 그 의원 줄만, '보기 ×' 표는 아무 줄도, 쓰기는 모두 거부
[내 의원으로] stopAdminView() (끝 시각) → 쿠키 지움 → location.assign('/dashboard')

[관리자 탭] /admin: 가입 승인(그대로) + 승인 줄 이름 단추·지역 칸 + '본 기록'(admin_view_log) + '의원 비교' 링크
[의원 비교] /admin/compare: listViewHospitals() → 지역으로 거름 → 의원마다 readAdminRows(종류, [병원], 기간) (한 번에 3곳)
  → 순수 계산(매출·월급·대표 숫자·통계 입력) → 순위 표 · 직군별 월급 표 · 매출·환자 수 표 · 통계 나란히 보기
```

## 사용자가 정한 것 (시안 승인 2026-11-24 — requirements.md '이미 정한 것' 10~13)
- 시안 **"이대로 승인"**. 시안과 이 문서가 다르면 시안이 이긴다.
- **"합계만 저장하게 더하기"**: 사이트에 저장되지 않던 '몇 번까지 받나'(3번 이상 받은 비율)·'예약·전환'(Block 전환)·'처방별 신환·재진'과 '가장 많은 나이대'는 의원이 통계를 불러올 때 합계 숫자만 함께 저장한다('통계 합계 저장'). 그 전 달은 다시 불러오기 전까지 `–`. 도우미는 그대로.
- 주소록 사이트 비밀번호: **"비밀번호도 보이기"**.
- 보이는 탭 안 환자 개인정보 칸은 숨기고 메모는 보인다("환자 개인정보 들어있는건 제외하고" + "메모도 보이기") — '환자 칸 숨김'.

## 기본값 (Claude가 정한 것 — 사용자에게 알림, 2026-11-24 시안 승인 때 다시 맞춤)
1. 보는 의원은 **브라우저마다**다(위 표). 다른 PC·다른 브라우저는 그대로 내 의원.
2. 보기는 [내 의원으로]·로그아웃·브라우저 닫기(세션 쿠키)·**12시간**이면 끝난다. **페이지를 새로 고쳐도 보던 의원을 계속 본다.**
3. 보기를 시작·끝낼 때 페이지를 새로 열어 그 의원(내 의원) **대시보드**로 간다. 고르면 확인 창 없이 바로 바뀐다(시안).
4. 보는 중 위쪽 띠의 의원 이름·브라우저 탭 이름은 보는 의원 이름이다(계정 단추는 내 메일 그대로, 시안).
5. 보는 중에는 **내 의원 줄도 안 보이고 아무것도 쓰지 못한다**(DB). 다만 **관리자 화면(`/admin`·`/admin/compare`)은 의원과 상관없어 띠·숨김·브라우저 쓰기 거르기가 없다**(시안 '모양 결정') — 보는 중에도 승인·관리자 정하기·지역 고치기·설치 파일 올리기가 된다. 다른 탭으로 가면 다시 띠.
6. 내 의원은 '보는 의원'으로 고를 수 없다(DB 22023). 판의 `내 의원` 줄을 누르면 [내 의원으로]와 같다.
7. 예약 **숫자**(이름·차트번호·메모 없이)는 보는 중·의원 비교에서 보인다(시안). 환자 정보가 없는 예약 설정(`calendar_settings`)·종일 줄(`calendar_allday`)은 읽기 허용, 예약 줄(`calendar_appts`)은 숫자 칸만 함수로 준다. '다시 예약'·'예약 빈자리'는 차트번호가 든 줄이 필요해 보는 중 통계에서 그리지 않는다(새 글 없음 — 시안 나란히 보기 '예약' 줄에도 없다).
8. 대시보드 안의 예약·환자·청구 링크는 그대로 두고, 누르면 `ViewGate`가 대시보드로 돌린다.
9. 보는 중에는 이 PC의 비트를 읽지 않는다(이 PC 비트는 내 의원 것): 수납일지는 서버 숫자 화면(`RemoteView`), 업무일지는 지금의 '보기만' 모양, 대시보드는 저장된 숫자만. **[저장된 숫자 새로고침]은 둔다** — 코드 확인: `ReadStatus.tsx:163` → `LiveDashboard.readAgain`(:129-139) → `readSaved` → `lib/storage/stats.ts` `readDays`(:224) → `readPeriod`(:178-195) = `stats_days` select만(쓰기·비트·도우미 없음). [비트에서 다시 읽기](`ReadStatus.tsx:165` → `readBitDays`)는 숨긴다.
10. 인쇄·PDF·그림 파일·엑셀 받기·파일 받기·[복사]·기간 단추·탭·날짜 옮기기·펼치기는 읽기라 보인다(시안).
11. 본 기록은 지우지 않고 다 둔다. 화면은 **최근 30일**, 칸은 `본 때`·`본 관리자`·`본 의원`(끝낸 때·본 화면은 적지 않음). '본 관리자' = 그 관리자 의원 이름 + 메일.
12. 지역은 시안의 **17개 시·도**(`서울`·`부산`·`대구`·`인천`·`광주`·`대전`·`울산`·`세종`·`경기`·`강원`·`충북`·`충남`·`전북`·`전남`·`경북`·`경남`·`제주`) + `지역 모름`. **광주·전남은 따로.** `광주시`만 적힌 주소는 경기 광주시와 헷갈려 `지역 모름`. 옛·새 정식 이름(`강원도`·`강원특별자치도`, `전라북도`·`전북특별자치도` …)과 흔한 줄인 이름을 모두 맞춘다. `전남광주통합특별시`로 적힌 주소는 다음 낱말이 '구'로 끝나면(옛 광주광역시 구) `광주`, 아니면 `전남`.
13. 관리자가 고른 지역은 `지역 모름`까지 그대로 둔다(줄이 없을 때만 주소에서 읽는다 — 시안 고르기에 '주소에서 읽기'가 없다).
14. 지역 칸은 **승인 탭에만**(대기·거절 탭에는 없다).
15. 순위 표 처음 차례 = **총진료비 내림차순**(시안). 다른 칸을 처음 누르면 오름, 한 번 더 누르면 내림. 빈 값 `–`는 늘 맨 아래. 월급·매출 표·나란히 보기는 내 의원 먼저 + 이름 차례.
16. 총진료비 = 날마다 `total`, 없으면 `rough_total`(통계 '총매출'과 같은 값).
17. 하루 평균 내원 = 내원 합 ÷ 내원이 있는 날 수, **소수 첫째 자리**(시안 `136.4건`, 그 아래 버림). 금액 글은 만 원 아래 버림(`1억 3,261만 원`·`252만 원`), 평균 월급 계산은 원 미만 버림. 비율은 소수 첫째 자리(`31.4%`).
18. 월급 = **실수령 기준**(직원 탭 `lineTotal`). 그달 지급 합계가 0보다 큰 정규직·계약직만 평균에 든다. 직군·고용 형태는 **지금** 직원 줄 값. '기타' 직군은 한 묶음. 직원 줄이 지워진 급여 줄은 뺀다. 파트타임 칸 이름 `파트타임` = 그달 일한(들어온 날 ≤ 달 끝, 나간 날 없음 또는 ≥ 달 첫날) 파트타임 사람 수.
19. 대표 숫자 = 시안의 **8개, 시안 차례**(비급여 비율 · 신환 재방문율 (30일) · 신환 예약률 · Block 전환율 · 예약 수 · 가장 많은 나이대 · 목표 달성률 · 3번 이상 받은 비율). 건당 진료비는 순위 표에서 뺀다(나란히 보기 '매출 요약' 안에는 남음).
20. 통계 나란히 보기: 시안의 **카드 목록·차례 그대로**('나란히 보기 칸 표'), **지역을 골랐을 때만**(전체면 안내 글), 기간 = 고른 달. '평소와 다른 것' = 그 달 마지막 주를 앞 4주와 견줌, '이번 달 목표' = 그 달 목표, '휴일에 따라' = 공휴일 앞날·다음 날.
21. 고를 달 = 2차에서 바뀜: 모든 승인된 의원 가운데 저장된 숫자가 있는 가장 이른 달(10년 앞까지) ~ 지난달(이번 달 뺌), 처음 = 지난달('의원 비교 달 10년').
22. 의원 비교는 지역 안 의원 모두(전체면 승인된 의원 모두, 내 의원 포함), 한 번에 3곳씩 읽는다(시안에 한도 글이 없어 한도를 두지 않는다).
23. 계정 메뉴에 [의원 비교]를 더하지 않는다(관리자 화면 안쪽 메뉴로만). 순위 표에서 의원 이름을 눌러도 보기를 시작하지 않는다.
24. [더보기] 안의 탭(입지 분석·설정·직원·재고·주소록·AI 리포트·서식)은 보는 중에도 모두 보이고 읽기만이다.
25. 승인 표는 1024px에서 옆으로 밀린다(시안 그대로).
26. 오류 번호 다섯(`E-VIEW-START`·`E-VIEW-LOG`·`E-REGION-SAVE`·`E-COMPARE-READ`·`E-VIEW-READONLY`)의 글은 시안에 없어 지금 `lib/errors.ts` 글 모양으로 Claude가 정했다('화면 글자').
27. 시안에 없는 지금 화면 글자(대시보드 머리 칩·저장 시각 줄, 보고 문장, 통계 카드 옆 글들, 나란히 보기 칸 안 글)는 지금 코드 글자를 쓴다(시안 `notes.md` '화면 글자' 끝 줄).

## 2차 사용자가 정한 것 (2차 시안 승인 2026-11-24 — requirements.md '이미 정한 것' 14~19)
- 2차 시안 **"이대로 승인"**(물을 때 `채울 기간을 줄여도 이미 올라온 숫자는 지우지 않아요`를 함께 보임).
- 저절로 올리기: 비트 PC에서 그날 처음 열면 어제까지 안 올라온 매출·통계를 뒤에서 올림 · 늘 켜짐(끄기 없음) · 의원 화면에 아무것도 없음 · 수납 마감 안 함 · 보는 중·주인 계정 아니면 안 돎 · 지금 도우미 명령만.
- 채울 기간: 관리자가 의원마다 · `1달`~`10년` 아홉 · 처음 `2달` · 달 단위 · 줄여도 안 지움 · 최근 달부터 · 열 때마다 어제 먼저 + 옛 달 5분쯤.
- 상태: 의원마다 저장 · 승인 표 `저절로 올림` 칸 · 관리자만 읽음 · 의원 브라우저는 자기 병원만 씀.
- 의원 비교 달: 모든 의원 기준 가장 이른 달 ~ 지난달(10년까지) · ◀ [연도 ▾] [월 ▾] ▶ · 숫자 없는 의원은 `–` · `· 숫자 있는 {k}곳 합`.
- 신청자·이메일 한 칸 두 줄 — 승인·대기·거절 탭 모두.

## 2차 기본값 (Claude가 정한 것 — 사용자에게 알림)
1. 2차 물을 것 1~7(시안 끝 줄): 줄여도 안 지움 · 달 단위 · 신청자·이메일 세 탭 모두 · 며칠째 색 표시 안 함 · 실패는 마지막 오류 하나 · 1차 빈 자료 안내 글 그대로 · 가장 이른 달은 지역과 상관없이.
2. **겹침 막기**: 같은 브라우저 다른 탭은 `navigator.locks`(`ifAvailable`), 다른 PC는 DB 잡음(`claim_auto_upload`, 7분, 일마다 늘림), 그리고 모든 저장이 날·달 upsert라 두 번 해도 같다. 저장된 날은 다시 읽지 않는다(매출 `savedMark`, 통계 덮음 — 아래 셋째 예외만).
3. **다시 읽는 것**: 그날 처음 열 때 어제 매출(진료 중에 읽었을 수 있어서 — 지금 `planRevenue` 규칙), 최근 24달 안에서 합계가 없거나 덜 지켜본 달('통계 조각' 2 (나)·(다)).
4. **통계 조각**: 최근 24달은 한 번에(확실한 조각), 그보다 옛 달은 12달씩 + 뒤 석 달 더 읽기, 한 달씩 따로 읽지 않음('통계 조각'). 매출은 지금처럼 31일 이하 덩어리.
5. 연 뒤 **15초** 기다린 뒤, 탭이 보이고 비트 화면이 통로를 안 쓸 때만 돈다. 비트 화면이 열리거나 탭이 숨으면 바로 멈춘다(다음에 열 때 이어서).
6. **5분** = 첫 도우미 요청부터 5분이 지나면 새 일을 시작하지 않음(하던 요청은 끝냄 — 통계 조각 하나는 1분쯤 어림, 잰 적 없음).
7. **다른 의원 비트 막기**: 처음 올린 비트 PC의 요양기관번호 SHA-256을 그 병원에 묶고, 다른 번호의 비트 PC에서는 올리지 않고 `E-AUTO-OTHER-BIT`를 적는다(관리자가 다른 의원 PC에서 자기 계정으로 로그인한 경우 등). 번호 글자는 서버에 두지 않는다.
8. 의원 쪽은 자기 병원 `months`·`through_day` 두 칸만 읽는다(그날 처음인지 알려고). 오류·시각·잡음은 관리자만 읽는다.
9. 비트 PC가 아닌 PC(확장·도우미 없음·등록 안 됨)에서는 아무것도 알리지 않는다. 도우미 판이 낡았으면(`E-HELPER-OLD`) 알린다.
10. 오류 번호 셋(`E-AUTO-MONTHS`·`E-AUTO-UPLOAD`·`E-AUTO-OTHER-BIT`)의 글은 Claude가 정했다('화면 글자').
11. 상태에 적는 오류는 번호만(글은 관리자 화면이 `lib/errors.ts`에서) — 오류 글·환자 자료가 상태 표로 가지 않게.

## ADR-046 (TASK-1이 `docs/ADR.md` 끝에 넣는 글)
### ADR-046: 다른 의원 보기 — 브라우저마다 보기 열쇠(쿠키 → 요청 머리)로 RLS가 읽기를 그 의원으로 바꾸고 쓰기를 막는다
**맥락**: 2026-11-24 사용자: 관리자가 다른 승인된 의원 화면을 그 의원이 된 것처럼 읽기만 하며 보고 싶다. 예약·환자·청구는 환자 개인정보라 빼고 나머지(직원 개인정보·급여 포함)는 다 보인다. 보인 의원에는 알리지 않고, 볼 때마다 관리자만 보는 기록을 남긴다.
**결정** (사용자 + Claude, `specs/admin-view`):
- 새 표 `admin_views`(본 기록 = 보기 줄, id가 보기 열쇠). 시작·끝은 정의자 함수 `start_admin_view`·`stop_admin_view`만(관리자만, 승인된 남의 의원만). 표 권한·정책은 없다
- 열쇠는 브라우저 세션 쿠키 `ssk_view` → 브라우저·서버 Supabase 클라이언트가 요청 머리 `x-ssk-view`로 보낸다. `admin_view_hospital_id()`(정의자)가 머리의 열쇠가 '부른 관리자의 끝나지 않은 12시간 안 줄'이고 의원이 승인 상태일 때만 그 의원 id를 준다
- 병원별 표마다 정책 둘을 더한다(지금 정책은 그대로): permissive `관리자 보는 의원 읽기`(select, 보는 의원 줄) + restrictive `보는 중에는 그 의원만 · 쓰기 없음`(보는 중이면 보는 의원 줄만 보이고 넣기·고치기가 모두 실패). 예약 줄·환자·청구 표는 restrictive만(보는 중엔 아무 줄도 안 보임). 보는 중이 아니면 두 정책은 아무것도 바꾸지 않는다
- 함수 안에서 읽을 병원을 고르는 읽기 함수 여섯은 `read_hospital_id()`(= 보는 의원, 없으면 내 병원)로 다시 만든다. 예약 숫자는 이름·차트·메모 없이 `admin_rows('calendar_counts')`로
- 비공개 바구니 다섯은 '그 의원을 열어 둔 관리자' 읽기 정책 하나를 더한다
- 브라우저는 보는 중 쓰기 요청을 보내지 않는다(거르는 fetch — 정의자 쓰기 함수와 Storage 올리기까지). 화면은 `WriteOnly`로 쓰기 단추를 숨긴다 관리자 화면(`/admin` 아래)은 의원과 상관없어 거르지 않고 띠·숨김도 없다(시안)
- 서버 코드 예외(ADR-004)를 한 칸 넓힌다: 앱 틀 레이아웃이 보기 쿠키가 있는 관리자만 `my_admin_view()`(보는 의원 id·이름)를 읽는다(쓰지 않는다). 서버 Supabase 클라이언트는 같은 머리를 붙인다
**이유**: 화면 코드가 병원 id를 몰라도(조사 1) 모든 읽기가 그대로 보는 의원으로 바뀐다 — 부르기 모양을 못 박은 시험을 고치지 않는다. 쓰기 막기도 DB 한 곳이 증명한다. 브라우저마다라 같은 계정의 다른 PC 일을 건드리지 않는다
**대안**: (1) 관리자에게 모든 의원 읽기 + 모든 읽기에 `.eq` — 파일·시험 수백 곳, 빠뜨리면 섞임. (2) 계정마다 DB 상태 — 다른 PC까지 바뀜. (3) 주소 `?view=` — 링크마다 붙여야 함. (4) `my_hospital_id()`를 보는 중엔 바꾸기 — 'C1' 글자를 다시 붙이는 옛 migration이 되돌리고, 쓰기 기본값까지 바뀜
**트레이드오프**: 병원별 표가 새로 생기면 그 migration이 두 정책을 더해야 한다(시험 AC-8002.8이 빠뜨림을 잡는다). 정의자 쓰기 함수(AI 리포트 저장 등)는 DB가 보기 상태를 보지 않는다 — 브라우저 거르기와 단추 숨김이 막는다. 관리자는 다른 의원 직원의 전화·계좌·급여, 주소록 사이트 비밀번호까지 본다(사용자 결정)
**바꾸는 것**: `CLAUDE.md` 인증 예외 줄 + 새 예외 한 줄, `docs/ARCHITECTURE.md`, `plan.md` (아래 '문서 줄')

## ADR-047 (TASK-1이 ADR-046 다음에 넣는 글)
### ADR-047: 의원 비교 — 관리자만 부르는 읽기 함수 하나(`admin_rows`)와 지역 고친 값 표
**맥락**: 2026-11-24 사용자: 관리자 탭 안에서 지역·달로 의원들의 매출·환자 수·직군별 월급·통계를 견준다. 지역은 주소에서 저절로, 관리자가 고칠 수 있게.
**결정**: 여러 의원을 한 화면에 읽어야 해 보기 열쇠(한 의원)를 쓰지 않는다. 정의자 함수 `admin_rows(종류, 병원 id들, 시작, 끝)`이 관리자에게만, 승인된 병원 줄만, 종류마다 정해 둔 칸만(이름·연락처·차트번호 없음) jsonb로 준다(부를 때마다 30곳·400일 한도 — 화면은 의원마다 따로 부른다). 화면은 통계 탭과 같은 순수 함수로 숫자를 만든다. 지역 고친 값은 새 표 `hospital_regions`(정의자 함수 `set_hospital_region`만), 의원 목록·주소는 `admin_view_hospitals()`. 통계 Worker에만 있던 숫자 가운데 비교에 드는 것(몇 번까지 받나·Block 전환)은 의원이 통계를 불러올 때 **합계만** 날·달 줄에 함께 저장한다(사용자 "합계만 저장하게 더하기" — 환자 이름·차트·환자 한 사람 줄 없음, 판 번호·DB 그대로, 도우미 그대로)
**이유**: 표마다 관리자 정책을 열면 관리자 자신의 화면이 섞인다(ADR-046 맥락). 한 함수·한 검사 자리로 권한을 시험한다
**대안**: 표마다 관리자 읽기 정책 — 섞임. 종류마다 함수 — 같은 검사를 열여덟 번 씀
**트레이드오프**: 종류를 더하려면 함수를 다시 만든다. 합계를 저장하기 전에 불러온 달은 그 의원이 다시 불러오기 전까지 `–`다. 신환 1명당·보고 문장처럼 합계로 저장하지 않는 Worker 숫자는 비교에 없다

## ADR-048 (TASK-17이 ADR-047 다음에 넣는 글)
### ADR-048: 저절로 올리기 — 비트 PC 브라우저가 지금 저장 길로 뒤에서 올림 · DB 잡음 · 의원마다 채울 기간
**맥락**: 2026-11-24 사용자(2차 시안 "이대로 승인"): 의원 비트 PC에서 그날 처음 앱을 열면 어제까지 안 올라온 매출·통계를 저절로 올리고, 관리자가 의원마다 채울 기간(1달~10년)을 정하며, 상태를 관리자만 본다. 의원 화면에는 아무것도 보이지 않는다.
**결정**: 서버 경로를 만들지 않는다. 앱 틀의 보이지 않는 부품이 지금 통계 탭 저장 길(도우미 `revenue.days`·`stats.rows` → Worker → `saveRange`·`saveStats`)을 그대로 부른다. 같은 쪽 비트 화면과는 통로 차례(`bitLane`), 다른 탭과는 `navigator.locks`, 다른 PC와는 DB 잡음 함수로 한 곳만 돈다. 채울 기간·상태는 정책 없는 표 둘과 정의자 함수로만 읽고 쓴다(의원은 자기 병원만 쓰고, 읽기는 관리자). 처음 올린 비트 PC의 요양기관번호 SHA-256을 묶어 다른 의원 비트를 막는다.
**이유**: 환자 자료가 의원 PC 밖으로 나가지 않는 지금 규칙(ADR-020)을 그대로 지키고, 숫자 뜻이 통계 탭과 같아진다. 도우미 0.13.2 명령(31일·800일 한도)으로 달마다 나눠 읽을 수 있어 새 판이 없다.
**대안**: 도우미가 스스로 올리기 — 도우미가 서버에 붙어야 해 ADR-016·020을 바꿈. 서버가 끌어오기 — 비트는 의원 PC에만 있음. 브라우저 저장소에 '오늘 했음' 표시 — 지금 앱은 브라우저 저장소를 쓰지 않고 PC·탭마다 달라짐.
**트레이드오프**: 의원이 앱을 열어야 올라간다(PC를 안 켜면 날짜가 멈춤). 진료 중 비트 DB에 읽기가 더해진다(5분·한 번에 한 요청·비트 화면이 열리면 멈춤). 다른 탭에서 비트 화면을 막 연 순간과 겹치면 그 화면이 `E-BRIDGE-BUSY`를 볼 수 있다.

## 병원별 표 (보는 중에 무엇이 되나)
'보기 ○' = 정책 둘(보는 의원 줄 읽기 + 보는 중 그 의원만·쓰기 없음). '보기 ×' = restrictive 하나(보는 중 아무 줄도·쓰기 없음). '함수로만' = 사용자 표 권한·정책이 없어 건드리지 않음.

| 탭 | 표 | 보는 중 | 까닭·메모 |
|---|---|---|---|
| 통계 | `stats_months` `stats_days` `stats_coverage` `stats_rx_picks` `stats_rx_groups` `stats_goals` | 보기 ○ | `stats_months`는 AI 리포트·재고가 읽음 |
| 통계(매출) | `sales_days` `sales_codes` `sales_day_codes` `rx_groups` | 보기 ○ | `rx_groups`는 옛 매출 탭 표(지금 안 씀) |
| 업무일지 | `worklog_days` `worklog_settings` | 보기 ○ | 데스크 정책은 그대로 |
| 수납일지 | `sunap_days` `sunap_spends` `sunap_settings` | 보기 ○ | |
| 직원 | `staff_members` `staff_week_plans` `staff_day_changes` `staff_overtime` `staff_leaves` `staff_settings` `staff_incentive_rules` `staff_pay_lines` `staff_pay_months` `staff_files` | 보기 ○ | 사용자: 모두 보이게 |
| 고시·공지 | `notice_marks` `notice_keywords` `notice_keyword_hits` | 보기 ○ | 글 자체는 공용 표(그대로) |
| 대시보드·청구·고시 | `rule_change_marks` | 보기 ○ | 대시보드 규칙 바뀜 알림이 씀 |
| 입지 분석 | `location_settings` `location_candidates` `location_listings` `location_notes` `location_photos` `location_events` `location_flow_cache` | 보기 ○ | 보는 사람은 늘 관리자 |
| 재고 | `inventory_categories` `inventory_items` `inventory_counts` `inventory_count_lines` `inventory_receipts` `inventory_receipt_lines` `inventory_aliases` | 보기 ○ | |
| 주소록 | `contacts_companies` `contacts_people` `contacts_equipment` `contacts_repairs` | 보기 ○ | `site_pw`(사이트 비밀번호)도 보임 — 사용자 "비밀번호도 보이기" |
| 서식 | `form_notices` `form_guides` `form_backgrounds` | 보기 ○ | |
| AI 리포트 | `ai_reports` `ai_usage` | 보기 ○ | 지금 정책은 `owner_id`로 봄 — 더하는 정책은 같은 모양 |
| 설정 | `clinic_profiles` `claim_rule_settings` `claim_hospital_settings` | 보기 ○ | 청구 설정 두 표는 설정 탭 칸(점검 규칙·문구·상병 연결)이 씀 |
| 예약(설정·쉬는 날) | `calendar_settings` `calendar_allday` | 보기 ○ | 환자 정보 없음, 통계 '예약' 카드가 씀(기본값 7) |
| 예약 | `calendar_appts` `calendar_rev` | 보기 × | 환자 이름·차트번호·메모(ADR-030). 숫자는 `admin_rows('calendar_counts')` |
| 환자 | `message_templates` `contact_counts` | 보기 × | 환자 탭(·청구)만 씀 |
| 청구 | `claim_day_counts` `claim_month_counts` `claim_day_closes` | 보기 × | 청구 탭만 씀 |
| (함수로만) | `hospital_members` `ai_image_days` `notice_ask_days` `notice_ask_holds` `admin_views` `hospital_regions` | 함수로만 | 표 권한·정책 없음 |
| (병원 칸 없음) | `hospitals` `admins` `tab_access` `notices` `notice_posts` `notice_sources` `notice_weeks` `notice_runs` `notice_collectors` `rule_changes` `rule_review_tries` | 그대로 | `hospitals`·`admins`에 정책을 더하지 않는다(문지기가 내 줄을 읽음, 42P17) |

Storage 바구니(모두 비공개, 이름 첫 폴더 = 병원 id):
| 바구니 | 보는 중 | 메모 |
|---|---|---|
| `clinic-logos` · `staff-files` · `inventory-photos` · `location-photos` · `form-backgrounds` | 읽기 ○(⑥) | 올리기·지우기 정책은 그대로(내 병원 폴더). 보는 중 올리기는 브라우저 거르기가 막고, 로고·직원 파일·배경은 짝 줄 넣기가 RLS에서 막힌다 |
| `install-files` | 그대로 | 병원과 상관없음 |

## DB (`supabase/migrations/20261124000000_admin_view.sql`, 사용자가 SQL Editor에 붙여 넣음)
머리 주석은 `20261122000000_location.sql` 모양: 무엇(보기 줄·지역 고친 값 표 둘, 보기 함수, 병원별 표 정책 둘씩, 바구니 읽기 정책, 다시 만드는 읽기 함수 여섯, 비교 읽기 함수, spec admin-view REQ-8001~8003, ADR-046·047) · 실행(SQL Editor에 전체 한 번) · 먼저(지금 모든 migration — 이 파일이 정책을 더하는 표가 다 있어야 함) · 두 번 붙여도 그대로(표·색인은 없을 때만, 함수는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다) · 관문(이 파일 먼저, 그다음 사이트 — 없으면 관리자 탭이 의원 목록을 못 읽어 화면 오류, 다른 화면은 그대로) · 무엇을 왜 · 권한. 지금 표·정책·권한은 하나도 바꾸지 않는다(정책을 더하기만).

```sql
-- ① 보기 줄(= 본 기록). id가 이 브라우저의 보기 열쇠. 표 권한·정책 없음 — 정의자 함수로만
create table if not exists public.admin_views (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  started_at timestamptz not null default now(),
  ended_at timestamptz,
  check (ended_at is null or ended_at >= started_at)
);
create index if not exists admin_views_started on public.admin_views (started_at desc);
alter table public.admin_views enable row level security;
revoke all on table public.admin_views from public, anon, authenticated;

-- ② 관리자가 정한 지역(줄이 없으면 주소에서 읽음, sido null = '지역 모름'으로 정함). 표 권한·정책 없음
create table if not exists public.hospital_regions (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  sido text check (sido in ('서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원',
                            '충북', '충남', '전북', '전남', '경북', '경남', '제주')),
  updated_at timestamptz not null default now()
);
alter table public.hospital_regions enable row level security;
revoke all on table public.hospital_regions from public, anon, authenticated;

-- ③ 보기 열쇠(요청 머리 x-ssk-view)와 보는 의원. 모양이 틀려도 던지지 않는다(null)
create or replace function public.admin_view_key()
returns uuid language plpgsql stable set search_path = ''
as $$
declare
  v text;
begin
  v := nullif(current_setting('request.headers', true), '')::json ->> 'x-ssk-view';
  if v ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return v::uuid;
  end if;
  return null;
exception when others then
  return null;
end;
$$;

-- 부른 관리자의 끝나지 않은 12시간 안 보기 줄 + 승인된 의원일 때만 그 의원 id
create or replace function public.admin_view_hospital_id()
returns uuid language sql stable security definer set search_path = ''
as $$
  select v.hospital_id
    from public.admin_views v
    join public.admins a on a.user_id = v.user_id
    join public.hospitals h on h.id = v.hospital_id and h.status = 'approved'
   where v.id = public.admin_view_key()
     and v.user_id = (select auth.uid())
     and v.ended_at is null
     and v.started_at > now() - interval '12 hours'
$$;

-- 읽을 병원: 보는 의원, 없으면 내 병원(읽기 함수 여섯이 씀. 쓰기에는 쓰지 않는다)
create or replace function public.read_hospital_id()
returns uuid language sql stable security definer set search_path = ''
as $$ select coalesce(public.admin_view_hospital_id(), public.my_hospital_id()) $$;

-- 파일 읽기용: 부른 관리자가 그 의원(첫 폴더 글자)을 열어 둔 보기 줄이 있나(머리를 보지 않는다 — Storage)
create or replace function public.admin_view_open(p_hospital text)
returns boolean language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
      from public.admin_views v
      join public.admins a on a.user_id = v.user_id
      join public.hospitals h on h.id = v.hospital_id and h.status = 'approved'
     where v.user_id = (select auth.uid())
       and v.hospital_id::text = p_hospital
       and v.ended_at is null
       and v.started_at > now() - interval '12 hours')
$$;

-- ④ 시작·끝·지금 보는 의원·본 기록·의원 목록·지역 고치기
create or replace function public.start_admin_view(p_hospital_id uuid)
returns uuid language plpgsql security definer set search_path = ''
as $$
declare
  v_id uuid;
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_hospital_id is null or not exists (
       select 1 from public.hospitals h
        where h.id = p_hospital_id and h.status = 'approved' and h.owner_id <> (select auth.uid())) then
    raise exception 'view not allowed' using errcode = '22023';
  end if;
  -- 이 브라우저가 보던 줄(머리의 열쇠)은 끝낸다
  update public.admin_views set ended_at = now()
   where id = public.admin_view_key() and user_id = (select auth.uid()) and ended_at is null;
  insert into public.admin_views (user_id, hospital_id) values ((select auth.uid()), p_hospital_id)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.stop_admin_view()
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  update public.admin_views set ended_at = now()
   where id = public.admin_view_key() and user_id = (select auth.uid()) and ended_at is null;
end;
$$;

create or replace function public.my_admin_view()
returns table (hospital_id uuid, name text) language sql stable security definer set search_path = ''
as $$
  select h.id, coalesce(nullif(btrim(p.display_name), ''), h.name)
    from public.hospitals h
    left join public.clinic_profiles p on p.hospital_id = h.id
   where h.id = public.admin_view_hospital_id()
$$;

create or replace function public.admin_view_log()
returns table (started_at timestamptz, viewer_name text, viewer_email text, hospital_id uuid, hospital_name text)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select v.started_at,
           coalesce(nullif(btrim(vp.display_name), ''), vh.name),
           coalesce(vh.email, u.email)::text,
           h.id,
           coalesce(nullif(btrim(p.display_name), ''), h.name)
      from public.admin_views v
      join public.hospitals h on h.id = v.hospital_id
      left join public.clinic_profiles p on p.hospital_id = h.id
      left join public.hospitals vh on vh.owner_id = v.user_id
      left join public.clinic_profiles vp on vp.hospital_id = vh.id
      left join auth.users u on u.id = v.user_id
     where v.started_at > now() - interval '30 days'
     order by v.started_at desc, v.id;
end;
$$;

create or replace function public.admin_view_hospitals()
returns table (hospital_id uuid, name text, address text, region_set boolean, region text, is_me boolean)
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  return query
    select h.id, coalesce(nullif(btrim(p.display_name), ''), h.name), p.address, r.hospital_id is not null, r.sido,
           h.owner_id = (select auth.uid())
      from public.hospitals h
      left join public.clinic_profiles p on p.hospital_id = h.id
      left join public.hospital_regions r on r.hospital_id = h.id
     where h.status = 'approved'
     order by 2, 1;
end;
$$;

create or replace function public.set_hospital_region(p_hospital_id uuid, p_sido text)
returns void language plpgsql security definer set search_path = ''
as $$
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_hospital_id is null or not exists (select 1 from public.hospitals h where h.id = p_hospital_id and h.status = 'approved')
     or (p_sido is not null and p_sido not in ('서울', '부산', '대구', '인천', '광주', '대전', '울산', '세종', '경기', '강원',
                                               '충북', '충남', '전북', '전남', '경북', '경남', '제주')) then
    raise exception 'region not allowed' using errcode = '22023';
  end if;
  -- null = 관리자가 '지역 모름'으로 정함(줄을 남긴다). 줄을 지우는 길은 없다(시안 고르기에 '주소에서 읽기' 없음)
  insert into public.hospital_regions (hospital_id, sido) values (p_hospital_id, p_sido)
  on conflict (hospital_id) do update set sido = excluded.sido, updated_at = now();
end;
$$;

-- ⑤ 병원별 표 정책 둘씩('병원별 표' 표 그대로). 지금 정책은 건드리지 않는다
do $$
declare
  t text;
  v_view text[] := array[
    'stats_months', 'stats_days', 'stats_coverage', 'stats_rx_picks', 'stats_rx_groups', 'stats_goals',
    'sales_days', 'sales_codes', 'sales_day_codes', 'rx_groups',
    'worklog_days', 'worklog_settings', 'sunap_days', 'sunap_spends', 'sunap_settings',
    'staff_members', 'staff_week_plans', 'staff_day_changes', 'staff_overtime', 'staff_leaves', 'staff_settings',
    'staff_incentive_rules', 'staff_pay_lines', 'staff_pay_months', 'staff_files',
    'notice_marks', 'notice_keywords', 'notice_keyword_hits', 'rule_change_marks',
    'location_settings', 'location_candidates', 'location_listings', 'location_notes', 'location_photos',
    'location_events', 'location_flow_cache',
    'inventory_categories', 'inventory_items', 'inventory_counts', 'inventory_count_lines', 'inventory_receipts',
    'inventory_receipt_lines', 'inventory_aliases',
    'contacts_companies', 'contacts_people', 'contacts_equipment', 'contacts_repairs',
    'form_notices', 'form_guides', 'form_backgrounds', 'ai_reports', 'ai_usage',
    'clinic_profiles', 'claim_rule_settings', 'claim_hospital_settings', 'calendar_settings', 'calendar_allday'];
  v_hidden text[] := array[
    'calendar_appts', 'calendar_rev', 'message_templates', 'contact_counts',
    'claim_day_counts', 'claim_month_counts', 'claim_day_closes'];
begin
  foreach t in array v_view loop
    execute format('drop policy if exists %I on public.%I', '관리자 보는 의원 읽기', t);
    execute format('create policy %I on public.%I for select to authenticated '
                   'using (hospital_id = (select public.admin_view_hospital_id()))', '관리자 보는 의원 읽기', t);
  end loop;
  foreach t in array v_view || v_hidden loop
    execute format('drop policy if exists %I on public.%I', '보는 중에는 그 의원만 · 쓰기 없음', t);
    execute format('create policy %I on public.%I as restrictive for all to authenticated '
                   'using ((select public.admin_view_hospital_id()) is null '
                   'or hospital_id = (select public.admin_view_hospital_id())) '
                   'with check ((select public.admin_view_hospital_id()) is null)', '보는 중에는 그 의원만 · 쓰기 없음', t);
  end loop;
end;
$$;

-- ⑥ 비공개 바구니 다섯: 그 의원을 열어 둔 관리자는 읽기만
drop policy if exists "관리자 보는 의원 파일 읽기" on storage.objects;
create policy "관리자 보는 의원 파일 읽기" on storage.objects
  for select to authenticated
  using (bucket_id in ('clinic-logos', 'staff-files', 'inventory-photos', 'location-photos', 'form-backgrounds')
         and public.admin_view_open((storage.foldername(name))[1]));

-- ⑦ 읽기 함수 여섯 다시 만들기('다시 만드는 읽기 함수')
-- ⑧ 비교 읽기 함수 admin_rows('비교 읽기')

-- 권한: Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 연다. 거두고 authenticated에만 준다
--   admin_view_key: 거두기만(정의자 함수 안에서만 쓴다)
--   admin_view_hospital_id·read_hospital_id·admin_view_open(정책·invoker 함수 안에서 사용자 권한으로 돈다)·
--   start_admin_view·stop_admin_view·my_admin_view·admin_view_log·admin_view_hospitals·set_hospital_region·admin_rows:
--   revoke all … from public, anon, authenticated; grant execute … to authenticated
```
- 정책 ⑤의 `(select …)`는 문장마다 한 번 계산한다(Supabase 권장) — 보는 중이 아닌 모든 사용자도 이 계산을 하지만 머리가 없으면 열쇠가 `null`이라 표를 읽지 않는다.
- restrictive 정책은 지금 permissive 정책과 AND로 묶인다: 보는 중이 아니면 늘 참(아무것도 안 바뀜), 보는 중이면 보는 의원 줄만 보이고(내 줄 숨김) `with check`가 거짓이라 넣기·고치기·upsert가 42501. 고치기·지우기는 보는 의원 줄에 맞는 permissive 쓰기 정책이 없어 0줄이다.
- `hospitals`·`admins`·`hospital_members`에는 정책을 더하지 않는다(문지기 `readMe()`가 `hospitals`·`admins` 내 줄을 읽어야 하고, `admins`는 42P17).

## 다시 만드는 읽기 함수 (⑦)
규칙: 각 함수의 **마지막** 정의(migration 파일 이름 차례로 맨 뒤의 `create or replace function public.<이름>`)를 글자 그대로 옮기고, **읽을 병원을 고르는 자리**의 `public.my_hospital_id()`만 `public.read_hospital_id()`로 바꾼다. 인자·답 모양·`security` 종류·`search_path`·권한 검사(예: "승인된 원장만")·권한 줄은 그대로다. 옮긴 함수마다 주석 한 줄('… 에서 옮김, 읽을 병원만 바꿈').

| 함수 | 마지막 정의(조사 때) | 바꾸는 자리 |
|---|---|---|
| `sales_code_totals(date, date)` | `20261114000000_sales_day_codes.sql:105` | `where d.hospital_id = (select public.my_hospital_id())` |
| `notice_list(…)` | `20261121000001_notice_keywords.sql:173` | 표시·맞춤 줄을 잇는 병원 |
| `notice_unread_count()` | 같은 파일 :242 | 읽음 표시를 보는 병원 |
| `notice_rule_alerts()` | `20261122000000_rule_auto.sql:267` | 표시를 보는 병원 |
| `rule_change_alerts()` | 같은 파일 :228 | 표시를 보는 병원(“내 병원이 승인됨” 검사는 `my_hospital_id()` 그대로) |
| `desk_members()` | `20261118100000_desk_accounts.sql` | 목록을 고르는 병원(원장 검사는 그대로) |

`notice_ask_left`·`my_desk`·`my_signup_emr`과 쓰기 함수는 다시 만들지 않는다(묻기는 보는 중 단추가 없음).

## 비교 읽기 (⑧ `admin_rows`)
```sql
create or replace function public.admin_rows(p_kind text, p_hospital_ids uuid[], p_from date, p_to date)
returns table (hospital_id uuid, row jsonb) language plpgsql stable security definer set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  if not exists (select 1 from public.admins a where a.user_id = (select auth.uid())) then
    raise exception 'not an admin' using errcode = '42501';
  end if;
  if p_kind is null or p_hospital_ids is null or p_from is null or p_to is null
     or coalesce(cardinality(p_hospital_ids), 0) not between 1 and 30
     or p_from > p_to or p_to - p_from >= 400 then
    raise exception 'rows not allowed' using errcode = '22023';
  end if;
  select coalesce(array_agg(h.id), '{}') into v_ids
    from public.hospitals h where h.id = any (p_hospital_ids) and h.status = 'approved';
  if p_kind = 'stats_days' then
    return query select d.hospital_id, jsonb_build_object('day', d.day, 'partial', d.partial, 'source', d.source,
                                                          'payload', d.payload, 'updated_at', d.updated_at)
      from public.stats_days d where d.hospital_id = any (v_ids) and d.day between p_from and p_to
      order by d.hospital_id, d.day;
  elsif p_kind = '…' then  -- 아래 표의 종류마다 한 갈래
    …
  else
    raise exception 'unknown kind' using errcode = '22023';
  end if;
end;
$$;
```
줄 jsonb의 열쇠는 지금 `lib/storage`가 그 표에서 고르는 칸 이름과 같다 — 지금 줄 검사 함수(`toCount` 등)를 그대로 쓰려고. 차례는 (병원, 날·달·id)로 정해 두어 `range` 쪽 나눠 읽기가 겹치지 않는다(Supabase 답 1,000줄 한도).

| 종류 | 표 | 거르기 | 칸(jsonb 열쇠) | 쓰는 곳 |
|---|---|---|---|---|
| `stats_days` | `stats_days` | `day` 기간 안 | `day, partial, source, payload, updated_at`(`lib/storage/stats.ts:189`과 같게, payload에 새 열쇠 `sunap`이 있으면 그대로) | 나란히 보기·대표 숫자 |
| `stats_months` | `stats_months` | `month` 기간의 달 | `month, partial, rx, groups, dropoff, sections` — `payload->'rx'`·`->'groups'`·`->'dropoff'`(새 열쇠, 없으면 `null`)와 `sections`만(payload 전체 1 MiB를 주지 않음) | 처방별 신환·재진·몇 번까지 받나·환자 구성·원장님별·시간대별 |
| `stats_day_totals` | `stats_days` | `day` 기간 안 | `day, partial, totals` — `payload->'totals'`만 | 휴일에 따라(12달) |
| `stats_coverage` | `stats_coverage` | 기간과 겹침 | `lib/storage/stats.ts:245`이 고르는 칸 | 같음 |
| `stats_rx_groups` | `stats_rx_groups` | 없음 | `lib/storage/statsRxGroups.ts:68` 칸 | 처방 묶음(의원마다) |
| `stats_goals` | `stats_goals` | `month` 기간의 달 | `month, visits, new_patients, revenue` | 목표 |
| `sales_days` | `sales_days` | `day` 기간 안 | `lib/storage/revenue.ts:129` 칸 | 매출 표·매출 카드 |
| `sales_code_totals` | `sales_day_codes` 합 | `day` 기간 안 | `code, count, amount, missing`(`sales_code_totals`와 같은 합) | 치료별 매출 |
| `sales_codes` | `sales_codes` | `month` 기간의 달 | `lib/storage/revenue.ts:146` 칸 | 치료별 매출 |
| `sunap_settings` | `sunap_settings` | 없음 | `lib/storage/sunap.ts:256` 칸 | 예약·전환 |
| `sunap_days` | `sunap_days` | `work_date` 기간 안 | `lib/storage/sunap.ts:132` 칸 | 신환 예약률 |
| `calendar_settings` | `calendar_settings` | 없음 | `kinds, staff, open_hour, close_hour, sunday` | 예약 카드 |
| `calendar_allday` | `calendar_allday` | `day` 기간 안 | `id, day, type, memo, staff_id, staff_name, part` | 예약 카드 |
| `calendar_counts` | `calendar_appts` | `day` 기간 안 | `day, staff_id, staff_name, kind_id, kind_name, status, auto, orig_day`(`COUNT_COLUMNS` — **이름·차트·메모 없음**) | 예약 수·보는 중 통계·직원 |
| `clinic_profiles` | `clinic_profiles` | 없음 | `display_name, honorific, hours, closed_dates, staff` | 카드 글·진료 시간 |
| `staff_members` | `staff_members` | 없음 | `id, job, employment, hired_on, left_on`(**이름·연락처·계좌 없음**) | 직군·파트타임 수 |
| `staff_pay` | `staff_pay_lines` | `month` 기간의 달 | `month, staff_id, amounts, incentives, adjust` | 월급 |
| `staff_settings` | `staff_settings` | 없음 | `pay_items` | 월급 항목 |

## 보기 열쇠 · 브라우저 쓰기 막기 (`src/lib/supabase/`, TASK-2)
- `viewKey.ts`(순수 + `document.cookie` 쓰는 작은 함수 둘):
  ```ts
  export const VIEW_COOKIE = 'ssk_view'
  export const VIEW_HEADER = 'x-ssk-view'
  /** 쿠키 글에서 열쇠(uuid 모양만, 소문자). 없으면 null */
  export function readViewKey(cookieText: string): string | null
  /** 'ssk_view=<key>; Path=/; SameSite=Lax; Secure' (Max-Age 없음 = 세션 쿠키) */
  export function viewCookie(key: string): string
  /** 'ssk_view=; Path=/; SameSite=Lax; Secure; Max-Age=0' */
  export function clearViewCookie(): string
  export function setViewKey(key: string): void      // document.cookie = viewCookie(key)
  export function dropViewKey(): void                // document.cookie = clearViewCookie()
  /** 보는 중 브라우저 쓰기 거르기(아래). 감싼 fetch를 돌려준다 */
  export function readOnlyFetch(base: typeof fetch): typeof fetch
  export const VIEW_READ_RPCS: readonly string[]
  ```
- `browser.ts`: 처음 만들 때 `readViewKey(document.cookie)`가 있으면 `createBrowserClient(url, anonKey, { global: { headers: { [VIEW_HEADER]: key }, fetch: readOnlyFetch(fetch) } })`, 없으면 지금 그대로. 보기를 시작·끝낼 때는 페이지를 새로 열어 클라이언트를 다시 만든다.
- `server.ts`: `cookieStore.get(VIEW_COOKIE)`가 uuid 모양이면 같은 머리를 `global.headers`로(거르기 없음). 쿠키 읽기·쓰기 처리는 그대로.
- 거르기 규칙(`readOnlyFetch`): 주소의 경로로 본다.
  - 보냄: `GET`·`HEAD` 모두 · `/auth/v1/` 아래 모두(로그인 새로 고침·로그아웃) · `POST /rest/v1/rpc/<VIEW_READ_RPCS>` · `POST /storage/v1/object/sign/…`·`/storage/v1/object/list/…`
  - `VIEW_READ_RPCS` = `sales_code_totals`, `notice_list`, `notice_search`, `notice_unread_count`, `notice_ask_left`, `notice_rule_alerts`, `rule_change_alerts`, `desk_members`, `my_desk`, `my_signup_emr`, `admin_hospitals`, `admin_view_hospitals`, `admin_view_log`, `admin_rows`, `my_admin_view`, `start_admin_view`, `stop_admin_view`
  - 막음: 그 밖의 `/rest/v1/`·`/storage/v1/` `POST`·`PATCH`·`PUT`·`DELETE` → 보내지 않고 `new Response('{"code":"E-VIEW-READONLY"}', { status: 403, headers: { 'content-type': 'application/json' } })`
  - 다른 주소(우리 `/api/ai/*` 등)는 이 fetch를 지나지 않는다(Supabase 클라이언트만 씀).
  - **관리자 화면은 거르지 않는다**: 요청을 보낼 때 `location.pathname`이 `isAdminScreen`(`/admin`과 그 아래)이면 위 규칙을 건너뛰고 그대로 보낸다(시안 '모양 결정' — 관리자 화면은 의원과 상관없어 보는 중에도 승인·지역 고치기·설치 파일 올리기가 된다). 그 쓰기들은 정의자 함수(`hospitals`·`admins`·`hospital_regions`)와 `install-files` 바구니라 ⑤의 막는 정책과 상관없다. `isAdminScreen`은 `viewKey.ts` 안에 같은 규칙으로 둔다(`viewPaths.ts`와 같은 Phase라 서로 부르지 않음 — 두 시험이 같은 주소 표를 본다).
- 서버 읽기 `src/lib/auth/adminView.server.ts`(첫 줄 `import 'server-only'`):
  ```ts
  export type AdminView = { hospitalId: string; name: string }
  export class AdminViewReadError extends Error {}
  /** 보기 쿠키가 없으면 null(DB 안 부름). 있으면 rpc('my_admin_view') 한 번 → 한 줄 | 빈 목록 → null. 쓰지 않는다 */
  export async function readAdminView(): Promise<AdminView | null>
  ```

## 브라우저 함수 (TASK-3)
- `src/lib/auth/adminView.ts`(`supabaseBrowser`, 본보기 `lib/auth/admin.ts`):
  ```ts
  export class AdminViewError extends Error {}
  /** regionSet = 관리자가 지역을 정했는지(정했는데 region null = '지역 모름'으로 정함) */
  export type ViewHospital = { hospitalId: string; name: string; address: string | null; regionSet: boolean; region: string | null; mine: boolean }
  export type ViewLogRow = { startedAt: string; viewerName: string | null; viewerEmail: string | null; hospitalId: string; hospitalName: string }
  export async function startAdminView(hospitalId: string): Promise<string>   // rpc('start_admin_view', { p_hospital_id }) → 열쇠 uuid
  export async function stopAdminView(): Promise<void>                        // rpc('stop_admin_view')
  export async function listViewHospitals(): Promise<ViewHospital[]>          // rpc('admin_view_hospitals')
  export async function readViewLog(): Promise<ViewLogRow[]>                  // rpc('admin_view_log')
  export async function setHospitalRegion(hospitalId: string, sido: string | null): Promise<void> // rpc('set_hospital_region', { p_hospital_id, p_sido })
  ```
- `src/lib/storage/adminRows.ts`:
  ```ts
  export type AdminRowKind = 'stats_days' | 'stats_months' | 'stats_day_totals' | 'stats_coverage' | 'stats_rx_groups' | 'stats_goals' | 'sales_days' | 'sales_code_totals'
    | 'sales_codes' | 'sunap_settings' | 'sunap_days' | 'calendar_settings' | 'calendar_allday' | 'calendar_counts'
    | 'clinic_profiles' | 'staff_members' | 'staff_pay' | 'staff_settings'
  export class AdminRowsError extends Error {}
  /** rpc('admin_rows', …).range(i, i + 999)를 짧은 답이 올 때까지 */
  export async function readAdminRows(kind: AdminRowKind, hospitalIds: readonly string[], from: string, to: string,
    deps?: { client?: SupabaseClient }): Promise<{ hospitalId: string; row: Record<string, unknown> }[]>
  ```
- 오류 번호 다섯은 `src/types/errors.ts`·`src/lib/errors.ts`에(글은 '화면 글자').

## 내 병원 id를 따로 쓰는 곳 (보는 중에 바꿔야 하나)
| 곳 | 지금 | 보는 중 | 할 일 |
|---|---|---|---|
| `readMe()` 병원 정보 이름(`hospital.server.ts:60-73`, `.eq('hospital_id', 내 id)`) | 머리 이름 | 내 줄이 숨어 가입 이름이 됨 | 앱 틀이 `my_admin_view` 이름을 씀(이 파일은 그대로) |
| `loadSignup`(`clinicProfile.ts:408`, `hospitals .eq('owner_id', 나)`) → `useClinicProfile` 이름 | 내 가입 이름 | 내 가입 이름이 나옴 | `useClinicProfile`이 보는 중이면 보는 의원 이름(TASK-7) |
| `rpc('my_hospital_id')`로 만드는 올리기 길(`inventory.ts:484`, `location.ts:693`, `staffFiles.ts:107`) | 올리기 | — | 보는 중엔 단추 없음 + 브라우저 거르기 |
| 줄에서 읽은 `hospital_id`로 고치기(`clinicProfile.ts:286-332`, `claimSettings.ts:148-187`) | 고치기 | 보는 의원 id를 읽게 됨 | 쓰기는 DB·브라우저가 막음, 단추 없음 |
| DB가 만든 파일 길(`form_backgrounds.path`), 줄에 든 파일 길(로고·사진·직원 파일) | 받기 | 보는 의원 길 | 바구니 읽기 정책 ⑥ |
| 함수 안 `my_hospital_id()` 읽기 여섯 | 내 병원 | — | ⑦ |
| `calendar_appts` 읽기(`useStatsCalendar`·`staff.ts:816`) | 내 병원 | 안 보임(보기 ×) | `readAdminRows('calendar_counts')`(TASK-8·9) |
| 서버 AI 경로 읽기(`store.ts`, RLS만) | 내 병원 | 보는 의원(서버 클라이언트가 머리를 붙임) | 없음 |
| 정의자 쓰기 함수·AI 경로 쓰기(`report/route.ts` 저장 등) | 내 병원에 씀 | 내 병원에 씀 | 단추 없음 + 브라우저 거르기('위험') |

부르기 모양을 못 박은 지금 시험(`staff.test.ts`·`calendar.test.ts`·`worklogDays.test.ts`·`store.test.ts` …)은 고치지 않는다 — 읽기에 `.eq`를 더하지 않으므로.

## 앱 틀 (TASK-7)
- `(app)/currentMe.server.ts`: `currentView = cache(async () => { const me = await currentMe(); return me.isAdmin && me.hospital?.status === 'approved' ? readAdminView() : null })` 더함.
- `(app)/layout.tsx`: `approvedMe()`·`generateMetadata`의 이름 = `(await currentView())?.name ?? 지금 이름`. `AppLayout`이 `viewing={await currentView()}`를 `AppShell`에. 데스크·관리자 아님은 `currentView`가 DB를 부르지 않는다.
- `AppShell`: 새 선택 prop `viewing?: AdminView | null`. 있으면 ① 위에 붙는 묶음 맨 위 띠 `ViewBand`(관리자 화면 `isAdminScreen(path)`에서는 그리지 않음), ② 숨김 = `hiddenTabs ∪ VIEW_HIDDEN_TABS`(TabBar·MoreMenu는 지금 `hidden` prop 그대로 — [더보기] 안 다른 탭은 그대로 보임), ③ 본문을 `<ViewingProvider viewing={isAdminScreen(path) ? null : viewing}><ViewGate>{…}</ViewGate></ViewingProvider>`로(관리자 화면은 읽기만이 아님). 관리자(데스크 아님)면 머리 시계 왼쪽에 `ViewPicker`. `viewing`이 없고 보기 쿠키가 있으면 `ViewCookieSync`(`ViewBand.tsx` 안)가 `dropViewKey()` 뒤 `location.reload()` 한 번. 띠가 생기면 붙는 묶음이 44px 길어진다(바로가기 띠 붙는 자리 102 → 147px, 시안).
- `ViewBand.tsx`: 44px, `warning-soft` 바탕 + 아래 1px `line`, 눈 아이콘 `warning`, 의원 이름 600, `읽기만` 600 `warning`, 안내 small `ink-2`, 오른쪽 [내 의원으로] `ds.button.secondarySmall`(시안 '모양 결정'). [내 의원으로] → `stopAdminView().catch(() => {})` → `dropViewKey()` → `location.assign('/dashboard')`(누르는 동안 `aria-busy`). 눈 아이콘은 `src/components/common/Icon.tsx`의 `eye`(16칸·선 1.5, 시안의 새 그림 하나 — TASK-4가 더함)를 쓴다.
- `ViewPicker.tsx`: 단추 `보는 의원`(눈 아이콘 + 아래 화살표, 평소 `ds.button.secondarySmall`, 보는 중 `accentOutline` 모양 = 켜짐, `aria-expanded`). 판 = 계정 메뉴와 같은 떠 있는 층(`ds.layer`, 폭 320, 안쪽 4), 제목·설명·찾기 칸(36px, 이름에 든 글자로 거름)·묶음 `내 의원`(내 의원 한 줄) / `다른 의원 {n}곳`, 줄 36px = 이름 + 오른쪽 지역(`regionOf`, 없으면 `지역 모름`), 지금 보는 의원은 체크 + 파랑 굵게, 목록 최대 340px 안에서 내림, 바깥 누름·Esc로 닫힘. 열 때 `listViewHospitals()` 한 번. 다른 의원을 고르면 확인 창 없이 `startAdminView` → `setViewKey` → `location.assign('/dashboard')`. 보는 중 `내 의원` 줄 = [내 의원으로]와 같음(보는 중이 아니면 닫기만). 실패는 판 안 `ErrorCard E-VIEW-START`.
- `ViewGate.tsx`(`TabGate`와 같은 틀): `isViewBlockedPath(usePathname())`이면 `router.replace('/dashboard')`, 그동안 `null`.
- 로그아웃(`SignOutButton`·`IdleLogout`): 로그아웃 부르기 전에 `dropViewKey()`.
- `useClinicProfile`: 보는 중이면 이름 = `viewing.name`(가입 이름으로 돌아가지 않음).
- `docs/UI_GUIDE.md`에 띠·고르기 판 줄(시안 모양).

## 읽기만 바탕 (`src/components/shell/viewing.tsx`, TASK-4)
```tsx
export type Viewing = { hospitalId: string; name: string }
export function ViewingProvider({ viewing, children }: { viewing: Viewing | null; children: ReactNode }): ReactNode
export function ReadOnlyArea({ children }: { children: ReactNode }): ReactNode   // 의원 비교가 씀
export function useViewing(): Viewing | null
export function useReadOnly(): boolean       // viewing !== null || ReadOnlyArea 안
export function WriteOnly({ children }: { children: ReactNode }): ReactNode      // 읽기만이면 null, 아니면 children 그대로
```
- `src/components/shell/viewPaths.ts`: `VIEW_HIDDEN_TABS = ['/claim', '/patients', '/calendar'] as const`(`MENU` 차례 청구 → 환자 → 예약 — TASK-4 일꾼 확인으로 고침, 옛 글의 차례를 옮기지 않는다), `isViewBlockedPath(path)`(그 셋과 그 아래, `/claim/setup` 포함).
- 쓰기 단추는 `<WriteOnly>`로 감싸는 것이 기본(가장 적은 코드). 입력 칸은 `useReadOnly()`면 글자로만(또는 `readOnly`·`disabled` — 지금 부품에 그 prop이 있으면 그것). 저절로 쓰는 훅은 `useReadOnly()`면 쓰지 않는다. 환자 줄 구역(`components/*/rows`)은 이 파일을 import해도 된다(네트워크·저장소 없음).

## 탭마다 읽기만 (숨길 것 · 저절로 쓰기 · 비트)
| 탭 | 숨길 단추·칸(`WriteOnly`) | 저절로 쓰기·비트 — 보는 중엔 안 함 | 그대로 |
|---|---|---|---|
| 대시보드 | [AI 리포트 만들기]·[다시 분석](`ai/AiBrief.tsx`), 입지 알림 [닫기], [비트에서 다시 읽기](`live/ReadStatus.tsx:165`) | `BitDashboard`(`:172-189` 열 때 저절로 비트 읽기)·`readBitDays`, `useLocationWatch`의 `addEvents`·`setWatchChecked` | 저장된 숫자 칸·고시·규칙 알림, **[저장된 숫자 새로고침]**(`ReadStatus.tsx:163`, `stats_days` select만 — 기본값 9) |
| 통계 | `SourcePicker` 불러오기 상자 전체(비트에서 불러오기·파일·불러올 기간·오늘 진료 끝), [다시 저장]·[이어서 불러오기]·[매출만 다시 읽기], `GoalSection` [목표 적기]/[목표 고치기]/[저장], `TreatmentTrendSection` [묶음 고치기], `RxPickerSection` 넣기·빼기·비우기 | 비트 불러오기 뒤 저장(불러오기가 없음). 예약 숫자는 `readAdminRows('calendar_counts')`, 다시 예약·예약 빈자리는 그리지 않음(기본값 7). 비트 칸(몇 번까지 받나·Block 전환·처방별 신환·재진·환자 구성)은 저장된 합계로('통계 합계 저장') | 저장 숫자 카드, 기간 단추·탭·[다시 읽기] |
| 업무일지 | 지금 `viewOnly` 모양 전체(칸 고치기·글씨 크기·[지금 불러오기]·[비트 숫자로 바꾸기]·시재 고치기) | 칸 저절로 저장, `useBitFill` | 하루 보기·날짜 옮기기 |
| 수납일지 | [마감하기]·[마감 풀기]·[설정]·지출 줄 더하기·지우기·[비트에서 다시 불러오기], 환자 칸이 든 장부 전체('환자 칸 숨김') | Worker·비트·PC 저장소 읽기 → 늘 `RemoteView`(`SunapScreen.tsx:50-57·:424`의 장부 조건을 건너뜀) | 서버 숫자·지출 메모·[다시 불러오기] |
| 직원 | 명단 [＋ 직원 더하기]·[엑셀 올리기]·[고치기]·[저장]·[지우기]·[파일 올리기]·파일 [지우기], 근무표 `DayDialog`·`PlanEditor` 저장, 휴가 [휴가 넣기]·[연차 규칙]·고치기·지우기, 급여 금액·실적 칸 고치기·[지난달 금액 가져오기]·[항목 고치기]·조정·[인센티브 규칙 고치기]·[규칙 더하기]·인건비 [저장]·세금 파일 [파일 올리기]/[지우기] | `countAppts` → `readAdminRows('calendar_counts')` | 모든 칸 글자, [받기]·[인쇄·PDF]·[그림 파일]·[엑셀 받기] |
| 고시·공지 | [별표]·[메모 저장]·[AI에게 묻기]·[메모에 옮기기]·[확인했어요]·[되돌리기]/[다시 적용]·낱말 더하기·빼기 | 글 열 때 `markRead` | 글·붙임·보는 의원 표시 |
| 입지 분석 | 후보 더하기·저장, 매물 붙여 넣기·저장, 메모·사진, 점수 무게 저장·되돌리기, [주소록에 넣기], [과목 거르기] 저장 | `markCandidateEventsSeen`·`saveFlowCache`·알림 줄 쓰기 | 후보·사진·바깥 자료 보기 |
| 재고 | [물품 더하기]·[분류 고치기]·[+ 분류 더하기]·[순서 바꾸기]·[고치기]·[지우기]·[엑셀 올리기]·[비트 코드에서 고르기]·세기 [저장]·[입고 적기]·[사진 올리기]·[사진 없이 적기]·[주문함]/[주문 취소]·[다 됐어요] | `loadInventory`의 처음 분류 넣기(`seed: false`) | 목록·[양식 받기] |
| 주소록 | [업체 더하기]·[고치기]·[저장]·[지우기]·[넣기] | — | 목록·자세히 |
| 서식 | [저장]/[다시 저장]·[+ 새로 만들기]·[지우기]·줄·카드 더하기·[처음대로]·[AI로 정리하기]·[AI로 배경 만들기]·배경 지우기·[안 쓰기]·[AI로 그림 그리기] | — | 보기·[인쇄·PDF]·[그림 파일] |
| AI 리포트 | [분석]·[다시 분석] | — | 저장된 리포트 |
| 설정 | 병원 정보 [저장]·로고·사람 칸, 점검 규칙 [저장]·[기본값으로]·[되돌리기], 문구 [저장]·[처음 질문 하기]·[기본 문구로 바로 시작], 상병 연결 줄 더하기·빼기·[저장], 시재 [저장], 데스크 [더하기]/[빼기], '관리자만 보는 탭' 칸 전체, [비트 PC 연결]로 가는 길 | — | 값 글자, 데스크 메일 목록, 설치 파일 [받기] |
| 관리자 화면(`/admin`·`/admin/compare`) | 없음 — 띠·숨김·브라우저 거르기 없음(기본값 5) | — | 모두 지금처럼 |
- 비트 연결: `useBridge`가 보는 중이면 `chrome.runtime`을 건드리지 않고 `state: 'no-extension'`, `call`·`stream`은 보내지 않고 거부(TASK-8). 각 화면은 `useReadOnly()`로 스스로도 비트 칸을 숨긴다(두 겹).
- 보는 중 첫 열기 뒤에 오류 카드가 뜨면 그 화면에 숨기지 못한 쓰기가 있다는 뜻 → 마지막 TASK 화면 확인에서 탭마다 연다.

## 환자 칸 숨김 (보이는 탭 안 환자 개인정보 칸 — 조사 2026-11-24)
- **서버 표**: 보이는 탭의 표에는 정해 둔 환자 칸(이름·차트번호·전화·주민번호·환자 생일)이 없다. `sunap_days`(`20261116000000_sunap.sql:9-10·:20-50`, 숫자 칸만)·`sunap_spends`(`memo` 50자 — 앱이 전화·주민번호·메일 모양을 거부)·`sunap_settings`, `worklog_days`(`20261101000100_worklog.sql:20-58` 숫자·금액 글·`note_*`·`memo`·`cash_reason` 자유 글, `name_*`은 항목 이름)·`worklog_settings`, `stats_*` payload(집계만 — `lib/payload/validate.ts:28-40·:286-290`, 동네 이름·원장님 이름·처방 이름), `ai_reports.report`(집계, `doctor:<원장님>`), 서식 표(자유 글·jsonb). → 숨길 서버 칸은 없고 메모·비고·사유 같은 자유 글은 보인다(사용자 "메모도 보이기").
- **화면에 환자 이름·차트가 나오는 곳 = 이 PC의 비트에서 바로 읽는 곳뿐**이고, 보는 중에는 모두 그리지 않는다:

  | 곳 | 환자 칸 | 보는 중 |
  |---|---|---|
  | 수납일지 장부 `rows/LedgerRows.tsx` | `차트`·`이름` 칸(:457-458·:497-498), 찾기 칸 `이름·차트번호 찾기`(:442-443), 금액·비고 판 제목의 이름·차트(:225·:287), aria 글 속 이름 | 그리지 않음 — 늘 `RemoteView` |
  | 수납일지 예약 고르기 `rows/RsvPicker.tsx:88` | 판 머리 이름·차트 | 그리지 않음 |
  | 수납일지 미수 입금 `rows/PaidRows.tsx` | `차트`·`이름`(:17-18·:34-35) | 그리지 않음 |
  | 통계 다시 예약 `listCalendarSlots`(`calendar.ts:58`의 `chart`, 화면엔 안 나옴) | 차트(계산에만) | 부르지 않음(기본값 7) |
- 업무일지·대시보드에는 환자 한 사람 줄이 없다(대시보드 비트 읽기는 날 합계뿐이지만 이 PC 의원 숫자라 끈다 — 기본값 9). 직원 탭 칸은 환자가 아니라 직원이라 모두 보인다(사용자 결정 4).
- 시험: 수납일지 `viewMode.test.tsx`가 비트 준비·도우미 0.8.0 이상·62일 안 조건이어도 보는 중이면 `LedgerView`·`PaidRows`·`RsvPicker`를 그리지 않음(`차트`·`이름` 칸 글이 없음)을 본다.

## 관리자 화면 (TASK-12)
- `admin/page.tsx`: 머리에 `AdminNav`(설정 화면 안쪽 메뉴와 같은 모양, `가입 승인` | `의원 비교`), `<AdminApplications top={<InstallFilesAdmin />} bottom={<AdminViewLog />} />`(자리는 시안 — 본 기록은 승인 표 아래 `ds.panel`).
- 관리자 화면에서는 보는 중이어도 띠·`WriteOnly` 숨김·브라우저 거르기가 없다(기본값 5). 계정 메뉴는 그대로([가입 승인]만, [의원 비교] 없음).
- `AdminApplications`: 여는 때 `Promise.all([listApplications(), listAdminHospitals(), listViewHospitals()])`. 안내 글 끝에 한 문장(`의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.`). '승인' 탭만:
  - 이름 칸 = 내 줄이 아니면 눈 14 + `accent-strong` 600 글자 단추(올리면 밑줄, 마우스 글 `{의원 이름} 화면 보기 (읽기만)`, 관리자 칩은 그 뒤). 누르면 확인 창 없이 `startAdminView` → `setViewKey` → `location.assign('/dashboard')`(`ViewPicker`와 같은 흐름을 이 파일이 스스로 씀). 내 줄은 보통 글자.
  - 새 칸 `지역`(120px, 고르기 상자 32px, 설정 예약 칸 `SELECT`와 같은 모양): 값 = `regionOf(address, regionSet ? region : undefined)`, 없으면 `지역 모름`(주황 글자 + 마우스 글). 고르기 = 17개 + `지역 모름`. 바꾸면 `setHospitalRegion(id, 고른 값 | null)` 한 번 → 되면 손에 든 목록만 고치고 완료 줄 `{의원 이름} 지역을 {지역}로/으로 바꿨어요.`(받침 규칙: 받침 없음·'ㄹ' 받침 → `로`, 그 밖 받침 → `으로`; `지역 모름` → `으로`), 실패 → 그 자리 `E-REGION-SAVE`, 값은 그대로.
  - 표가 1120px보다 좁으면 옆으로 밀린다(1024에서는 동작 칸이 오른쪽 밖, 기본값 25).
- `AdminViewLog.tsx`: `readViewLog()` → 제목 `본 기록` · 오른쪽 `최근 30일 · {n}번` · 설명 · 칸 `본 때`(`11월 24일 (화) 09:12`, 한국 시각) · `본 관리자`(`{의원 이름} · {메일}`) · `본 의원`. 새 것이 위. 줄이 없으면 `최근 30일 · 0번` + 빈 몸통. 실패 → 칸 안 `E-VIEW-LOG` + [다시 불러오기].

## 지역 (`src/lib/admin/region.ts`, TASK-4)
- `SIDO_LIST` 차례(시안): 서울 · 부산 · 대구 · 인천 · 광주 · 대전 · 울산 · 세종 · 경기 · 강원 · 충북 · 충남 · 전북 · 전남 · 경북 · 경남 · 제주. 화면의 `지역 모름`은 목록 밖 값(`null`).
- 읽기 규칙 `sidoOf(address)`:
  1. `null`·빈 글 → `null`. 앞뒤 빈칸을 떼고 빈칸 여럿은 하나로.
  2. 맨 앞 우편번호(`(12345)`·`12345`·`[12345]`)와 `대한민국 `을 뗀다.
  3. 첫 낱말(빈칸·쉼표 앞)을 아래 이름 표와 맞춘다(정확히 같을 때).
  4. 첫 낱말이 `전남광주통합특별시`·`전남광주`면 다음 낱말이 '구'로 끝나면(옛 광주광역시 동·서·남·북·광산구) `광주`, 아니면(시·군) `전남`.
  5. 안 맞으면 주소가 **정식·옛 이름(3글자 이상)** 으로 시작하는지 본다(띄어쓰기 없이 붙은 `서울특별시강남구…`). 2글자 줄인 이름은 붙은 꼴로 보지 않는다(`경기광주…`처럼 헷갈림).
  6. 그래도 없으면 `null`(시·도 없이 `성남시 분당구 …`로 시작 = 지역 모름). **`광주시`는 표에 넣지 않는다**(경기 광주시와 헷갈림 → 지역 모름).

  | 시·도 | 맞추는 이름 |
  |---|---|
  | 서울 | 서울특별시 · 서울시 · 서울 |
  | 부산 | 부산광역시 · 부산시 · 부산 |
  | 대구 | 대구광역시 · 대구시 · 대구 |
  | 인천 | 인천광역시 · 인천시 · 인천 |
  | 광주 | 광주광역시 · 광주 |
  | 대전 | 대전광역시 · 대전시 · 대전 |
  | 울산 | 울산광역시 · 울산시 · 울산 |
  | 세종 | 세종특별자치시 · 세종시 · 세종 |
  | 경기 | 경기도 · 경기 |
  | 강원 | 강원특별자치도 · 강원도 · 강원 |
  | 충북 | 충청북도 · 충북 |
  | 충남 | 충청남도 · 충남 |
  | 전북 | 전북특별자치도 · 전라북도 · 전북 |
  | 전남 | 전라남도 · 전남 |
  | 경북 | 경상북도 · 경북 |
  | 경남 | 경상남도 · 경남 |
  | 제주 | 제주특별자치도 · 제주도 · 제주시 · 제주 |
- `regionOf(address, chosen)`: `chosen`이 `undefined`(관리자가 정한 줄 없음)면 `sidoOf(address)`, 아니면 `chosen`(`null` = 지역 모름으로 정함). 결과 `null` → 화면 `지역 모름`.
- `roParticle(sido)`: 완료 줄 '로'·'으로'(위 받침 규칙).

## 통계 합계 저장 (TASK-6 — 사용자 "합계만 저장하게 더하기")
조사(2026-11-24):
- 저장 길: Worker `loadJob`(`src/workers/stats/jobs.ts:128-212`)이 날 줄(`toDayPayloads`, `lib/payload/toDayPayloads.ts:58-73` + `fillGroupCounts` jobs.ts:166)·달 줄(`toMonthPayload`, `toMonthPayload.ts:40-73`)·달 `sections`(`toMonthSections`, `toMonthSections.ts:47-89`, jobs.ts:195-210, 도우미 v3 이후)를 만든다 → 불러오기 조각마다 `partSave`(`components/stats/loadPlan.ts:94-110`, 확실하지 않은 조각은 `after30`을 비우고 `once`를 뺌) → `StatsScreen.readParts`(`StatsScreen.tsx:338-374`, 저장 :365) → `useStatsData.save`(`useStatsData.ts:163-177`) → `saveStats`(`lib/storage/stats.ts:122-160`: 모든 줄 검사 `allChecked` :63-70·바이트 한도 :33-35, 날 줄이 64KB를 넘으면 `fitDay` :74-79가 `again`을 뺌, `stats_months`·`stats_days` upsert :151-152).
- 판 번호: `schemaVersion: 2` 글자 고정(toDayPayloads.ts:62, toMonthPayload.ts:42), DB 검사도 2(`20261101000200_stats.sql:24-31·:41-47`, 달 ≤1 MiB·날 ≤65,536바이트, 덜 된 줄이 다 된 줄을 덮지 않는 트리거 :110-131), `sections`는 `v:1`·≤64KB(`20261109000000_stats_month_sections.sql:16-26`). 줄 검사 `exactly()`(`lib/payload/validate.ts:45-50`)는 모르는 열쇠를 거부하고, 읽을 때 검사에 진 줄은 말없이 빠진다(`readPeriod` stats.ts:204-208).
- 네 숫자의 지금 자리:

  | 숫자 | 계산(Worker) | 지금 저장 | 이번에 |
  |---|---|---|---|
  | 몇 번까지 받나 · 3번 이상 받은 비율 | `dropoffOf`(jobs.ts:96-103) → `dropoff()`(`lib/analytics/dropoff.ts:65-82`): 불러온 기억 범위 안에 첫 진료가 있고 그 묶음을 받은 신환, 마지막 묶음 날 ≤ 자료 끝 − 30일인 사람만. 결과 `DropoffLine{n, atLeast[6], ten, once, average, drop}` | 없음 | **달 줄에 새 열쇠 `dropoff`** |
  | 예약·전환 Block 전환 | `sunapRates`(`lib/analytics/sunapRates.ts:79-126`, jobs.ts:300-305), 환자-날마다 9개 수. Block·물리치료 묶음 정의는 화면이 따로 보냄(`useStatsSunap.ts:83-89`, `StatsLoadRequest`에 없음 `types/stats.ts:136-146`) | 없음 | **날 줄에 새 열쇠 `sunap`**(날마다 더할 수 있음) |
  | 처방별 신환·재진 | `splitJob`(jobs.ts:236-257) → `rxVisitSplit`(`rxVisitSplit.ts:63-82`), 기간 안 서로 다른 환자 수 | 달 줄 `payload.rx`(patients·newPatients·returning)가 달 하나에서 같은 정의(`aggregate.ts:288·457-467`) | **새 열쇠 없음** — 같은지 시험으로 못 박음, 다르면 달 줄에 `rxSplit` 열쇠 |
  | 환자 구성 · 가장 많은 나이대 | `patientMix`(`patientMix.ts:115-148·172-177`, 사람마다 기간 안 마지막 진료 한 번, 나이는 기간 끝 기준) | 달 `sections.mix.age`·`people`(같은 `patientMix(…,'all')`을 달 경계로, toMonthSections.ts:48-53) — 다 불러온 달이면 통계 탭 [전체]와 같은 숫자 | **새 열쇠 없음**(파일로 불러온 달·옛 도우미 달은 `null` → `–`) |

새 파일: `src/lib/payload/statSums.ts`(순수 — 날 `sunap` 합·달 `dropoff` 묶음 만들기)·`statSums.test.ts`. 고치는 곳은 아래 규칙과 TASK-6 Files.

규칙:
1. **판 번호·DB는 그대로**(`schemaVersion: 2`, SQL 바꿈 없음). 새 열쇠는 모두 **있어도 되고 없어도 되는 것**으로 `validate.ts` `exactly()` 목록과 `types/payload.ts`에 더한다 — 없는 옛 줄은 지금처럼 통과하고 비교·나란히 보기에서 `–`.
2. **날 줄 `sunap`** = 그날의 `SunapRates` 9개 수(환자 이름·차트·환자 한 사람 줄 없음, 원장님별 표는 저장하지 않음). 불러오기 요청(`StatsLoadRequest`)에 그 의원 `sunap_settings`의 Block·물리치료 묶음 정의를 싣는다(웹만 바꿈 — `statsClient.ts`·`useStatsWorker.ts`·`StatsScreen.tsx`). 정의가 없으면 열쇠를 넣지 않는다.
3. **달 줄 `dropoff`** = `{ asOf: 'YYYY-MM-DD'(자료 끝 날), lines: DropoffLine[] }` — 묶음마다, **첫 진료가 그달인 신환**만 모아 지금 `dropoff()` 규칙(마지막 묶음 날 ≤ asOf − 30일)으로 센 값. Worker 기억 범위(가장 최근 조각) 안에 온전히 든 달에만 넣는다. 기억 범위의 모든 달 `lines`를 더하면 통계 탭 카드와 같은 수다(같은 자료 끝일 때).
4. 확실하지 않은 조각(`partSave`의 unsure)에는 새 열쇠를 넣지 않는다. `fitDay`는 64KB를 넘을 때 지금처럼 `again`을 먼저 빼고, 새 열쇠는 작아(수십 바이트) 빼지 않는다.
5. 도우미·확장·`lib/bridge`는 그대로(네 숫자 모두 도우미가 이미 주는 줄 — `helperData.ts:377·396·407·419·448` — 에서 Worker가 센다). 환자 자료 구역 울타리(ADR-020)도 그대로: 새 계산은 `lib/payload`·`lib/analytics`·`workers` 안 순수 함수.
6. AI 경로(`app/api/ai/`)에 보내는 집계(`lib/ai/input.ts`)에는 새 열쇠를 넣지 않는다(지금 시험이 그대로 지나야 한다).
7. 통계 탭 화면은 바뀌지 않는다(새 열쇠는 비교·나란히 보기만 읽는다). 보는 중 통계 탭도 지금처럼 비트 칸은 안내 글.
8. (2차) Phase 3 TASK-18이 `partSave` 규칙 4를 두 열쇠에 한해 바꾼다: 확실하지 않은 조각에서도 `sunap`은 남기고 `dropoff`는 석 달 넘게 지켜본 달만 남긴다(AC-8021.10, '저절로 올리기 — 통계 조각').

## 의원 비교 — 계산 (TASK-5 · TASK-13 · TASK-14, 순수 함수)
- `src/lib/admin/compare/sales.ts` `salesRow(days)` → `{ total, visits, newPatients, returnVisits, dayAvg, days } | null`(AC-8014.1). `total` = Σ(`total ?? rough_total`) — `lib/revenue/summary.ts` `dayRevenue`. `dayAvg` = 내원 합 ÷ 내원 1 이상인 날 수, 소수 첫째 자리 버림.
- `src/lib/admin/compare/pay.ts` `payByJob({ lines, members, items, month })` → `{ none: boolean; jobs: Record<Job, { count, avg, min, max } | null>; partTime: number }`. 금액은 `lib/staff/pay.ts` `lineTotal`·`visibleItems` 그대로(실수령, 새 공식 금지).
- `src/lib/admin/compare/sort.ts` `sortRows`·`nextSort`·`ownFirst`.
- `src/lib/admin/compare/load.ts` `loadHospital(read, hospitalId, month)` → 종류 열여덟을 읽어 종류별 줄(jsonb 그대로) 묶음 `CompareRaw`(`read`는 `readAdminRows` 모양의 함수 — 같은 Phase 파일을 부르지 않으려고). 기간: `stats_days`·`sales_days`·`sunap_days`·`calendar_*`·`sales_code_totals` = 지난달 1일 ~ 고른 달 끝, `stats_months` = 지난달·고른 달, `stats_day_totals` = 고른 달 끝 − 364일 ~ 고른 달 끝, 목표·급여 = 고른 달. 줄 검사는 쓰는 쪽(TASK-13·14)이 지금 줄 검사 함수(`validate.ts`·`toStatsDay` 등)로.
- `src/lib/admin/compare/rank.ts`(TASK-14) `representative(raw, month)` → '대표 숫자 표' 여덟 `{ [열쇠]: { value: number | null, text: string | null } }`.
- `src/components/admin/compare/statsInput.ts`(TASK-13) `compareStatsInput(raw, month)` → '나란히 보기 칸 표'의 칸마다 값(통계 탭과 같은 순수 함수 — `components/stats/view.ts`·`revenueView.ts`·`lib/analytics/*`·`lib/revenue/*`·`lib/calendar/counts.ts`).
- 수납 합 `sumClosed`(`SunapSection.tsx`)는 TASK-5가 `export`만 더했다. `sunapPct`는 처음부터 `src/components/stats/sunapView.ts:12`에서 내보내고 있어 TASK-13·14는 **`sunapView`에서 import**한다(`SunapSection`에서 가져오지 않는다 — TASK-5 일꾼 확인).
- `load.ts` `compareRanges`(TASK-5가 만든 그대로 적음): 날 줄·매출·코드 합·수납·예약·통계 덮음·달 줄은 지난달 1일 ~ 고른 달 끝, `stats_day_totals`는 고른 달 끝 − 364일 ~ 고른 달 끝, 목표·급여는 고른 달. 기간으로 거르지 않는 종류 가운데 `stats_rx_groups`·`sunap_settings`·`clinic_profiles`·`staff_members`·`staff_settings`는 **고른 달만** 넘기고, `stats_coverage`·`sales_codes`·`calendar_settings`는 **지난달 1일 ~ 고른 달 끝**을 넘긴다. 달마다 같은 셈이라 10년 달 고르기(REQ-8020)에도 바꾸지 않는다.

## 대표 숫자 표 (시안 8개, 시안 차례 — 순위 표 '통계 대표 숫자' 칸 차례)
순위 표 앞 칸(늘 있음): 총진료비 · 내원 수 · 신환 · 재진 · 하루 평균 내원(`sales_days`, 매출·환자 수 표와 같은 값) · 직군 여섯 평균 월급. 건당 진료비는 순위 표에 없다(나란히 보기 '매출 요약' 안에만).

| 차례 | 칸 이름(시안) | 뜻 | 만들 수 있나 | 근거(코드) · `–`일 때 |
|---|---|---|---|---|
| 1 | 비급여 비율 | 총진료비 중 비급여 | 됨 | `sumPeriod`(`lib/revenue/summary.ts:77-121`)로 나눔이 맞는 날만 Σ비급여 ÷ Σ총액(`revenueView.ts:542`) · 그런 날이 없으면 |
| 2 | 신환 재방문율 (30일) | 30일 안에 다시 온 신환 비율 | 됨 | `rateOf`·`finishedCohort`(`components/stats/view.ts:502-563`, `stats_days.revisit`) · 끝난 신환이 없으면 |
| 3 | 신환 예약률 | 수납일지 마감한 날 Σ예약한 신환 ÷ Σ신환 | 됨 | `sumClosed`(`SunapSection.tsx`)·`sunapPct`(`sunapView.ts`) · 마감한 날이 없으면 |
| 4 | Block 전환율 | 신환 + Block(통계 탭 'Block 전환'의 신환 줄) | 됨(합계 저장 뒤) | 날 줄 `sunap`을 그달 더해 `first_block ÷ first_n`(`sunapView.ts:12-15` 모양) · 그달 `sunap`이 있는 날이 없으면(저장 전 달·Block 묶음 정의 없음) |
| 5 | 예약 수 | 예약 탭에 적은 그달 예약 | 됨 | `admin_rows('calendar_counts')` → `lib/calendar/counts.ts:58-90` `rateSummary().total` · 예약 줄이 없으면 |
| 6 | 가장 많은 나이대 | 그달 실환자 중 가장 많은 나이대와 그 비율 | 됨(이미 저장) | 달 `sections.mix.age` 가운데 사람 수가 가장 많은 나이대(같으면 통계 탭 차례로 앞) · 그 수 ÷ `mix.people` → `50대 · 24.1%` · `sections`가 없거나 `mix`가 `null`이면(파일로 불러온 달·옛 도우미 달) |
| 7 | 목표 달성률 | 그달 총매출 ÷ 그달 매출 목표 | 됨 | 그달 `salesRow.total` × 100 ÷ `stats_goals.revenue`, 소수 첫째 자리 버림(`102.0%`) · 매출 목표가 없으면. 통계 탭 '이번 달 목표' 카드는 '중심 목표' 없이 적은 목표를 모두(내원 → 신환 → 매출) 보이므로 시안의 매출 목표를 쓴다. `goalPace`는 오늘 기준이라 끝난 달에는 쓰지 않는다(조사: 오늘 = 다음 달 1일이면 그다음 달을 셈) |
| 8 | 3번 이상 받은 비율 | 그달 첫 진료한 신환 중 그 묶음을 3번 이상 받은 비율 | 됨(합계 저장 뒤) | 달 줄 `dropoff.lines`에서 그 의원 처방 묶음(`stats_rx_groups`) 차례의 첫 묶음 줄 `atLeast[2] ÷ n`(통계 탭 비교표 '3회 이상'과 같은 분자·분모, `DropoffSection.tsx:138` — 저장된 `average`·`drop`을 쓰지 않고 수에서 새로 셈, '의원 비교 달 10년' 끝 줄) · `dropoff`가 없거나 `n` = 0이면. 의원마다 첫 묶음 이름이 다를 수 있다(화면에 묶음 이름을 함께 보이지 않음 — 시안) |
- 비율 글은 소수 첫째 자리(`31.4%`, 그 아래 버림). 통계 탭은 같은 분자·분모를 정수 %로 보인다 — 숫자 모양만 시안을 따른다.

## 통계 나란히 보기 칸 표 (시안 그대로 — 줄 = 통계 큰 카드 일곱, 칸 = 의원)
지역을 골랐을 때만 그린다(`전체`면 안내 글). 기간 = 고른 달(증감 비교 = 지난달). 의원마다 흰 작은 카드 하나(288px), 카드 안에 작은 칸을 시안 차례로 쌓는다(작은 칸 이름 = 통계 탭 이름). 칸 안 모양은 시안의 작은 그림(작은 막대·띠·표·숫자)이고 숫자는 통계 탭과 같은 순수 함수로 만든다. 그 의원에 그달 자료가 하나도 없으면 칸 전체가 `자료 없음`.

| 줄(시안) | 작은 칸(시안 차례) | 자료 · 계산 | 못 만들 때 |
|---|---|---|---|
| 요약 | 환자 요약 | `stats_days` → 하루 평균 내원·신환·90일초진·재진(`view.ts` 요약 함수, 기간 = 그달) | 날 줄 없음 → 칸 안 `–` |
| 요약 | 매출 요약 | `sales_days` → 총매출·건당 진료비(`revenueCells`, `revenueView.ts:442`) | 매출 줄 없음 → `–` |
| 요약 | 평소와 다른 것 (그 달 마지막 주를 앞 4주와 견줌) | `alerts.ts:109-148`에 오늘 = 고른 달 다음 달 1일 → 그 달 마지막 주(어제가 든 주 월요일 ~ 그달 끝) vs 7·14·21·28일 전 같은 요일. `stats_days` 두 달 + 예약 숫자(`calendar_counts`) | 견줄 날이 모자라면 통계 탭과 같은 빈 글 |
| 요약 | 이번 달 목표 (그 달 목표) | 그달 매출 목표 하나: `{달성률}% · 목표 {금액}` + 막대(대표 숫자 7과 같은 값) | 목표 없음 → `목표를 적지 않았어요` |
| 환자 | 일별 내원 | `stats_days` 그달 날마다 신환·재진 막대 | 날 줄 없음 → `–` |
| 환자 | 환자 구성 | 달 `sections.mix.age`(나이대 막대, 많은 차례 셋) | `sections` 없음 → `–` |
| 환자 | 신환 재방문율 | `stats_days.revisit` → 7일·14일·30일 안(`view.ts:502-563`) | 끝난 신환 없음 → `–` |
| 환자 | 몇 번까지 받나 | 달 줄 `dropoff.lines` 첫 묶음 → 1번·2번·3번 이상 막대(수 `n`·`once`·`atLeast[]`에서 새로 셈 — 저장된 평균을 더하지 않음) | 합계 저장 전 달·`dropoff` 없는 달 → `–` |
| 매출 | 매출 추이 | `sales_days` 날마다 총매출 막대 + 합계 | 매출 줄 없음 → `–` |
| 매출 | 급여·비급여·기타 | `sales_days` 나눔이 맞는 날 합(`sumPeriod`) 띠 | 그런 날 없음 → `–` |
| 예약·전환 | 신환 예약률 · 90일 예약률 | 마감한 `sunap_days` 합(`sumClosed`·`sunapPct` — `sunapView.ts`) + `수납일지 마감한 날만` | 마감한 날 없음 → `수납일지를 마감한 날이 없어요` |
| 예약·전환 | Block 전환 | 날 줄 `sunap` 그달 합 → 신환 + Block 비율 | 합계 저장 전 → 그 숫자만 `–` |
| 예약 | 예약 수 · 취소율 · 변경율 · 안 옴율 | `calendar_counts` → `rateSummary`(그달) | 예약 줄 없음 → `예약 탭에 적은 예약이 없어요` |
| 처방 | 처방별 추세 | `stats_days.groups` 그달 합(그 의원 `stats_rx_groups` 묶음, 많은 차례 셋) | 묶음 없음 → `–` |
| 처방 | 처방별 신환·재진 | 달 줄 `payload.rx`를 묶음으로 모음 → 신환 {n}명 · 재진 {n}건 | 달 줄 없음 → `–` |
| 진료 운영 | 원장님별 | 달 `sections.doctors` → 원장님마다 내원·매출 | `sections` 없음 → `–`, 한 분이면 `원장님이 한 분이라 나누어 볼 것이 없어요.` |
| 진료 운영 | 시간대별 접수 | 달 `sections.hours` → 열 칸 띠 | `sections` 없음 → `–` |
| 진료 운영 | 요일별 내원 | `stats_days` 그달 요일 평균(`WeekdaySection` 계산) | 날 줄 없음 → `–` |
| 진료 운영 | 휴일에 따라 (공휴일 앞날 / 공휴일 다음 날) | **고른 달 끝까지 12달**의 날 합계(`admin_rows('stats_day_totals')`) + `HOLIDAYS`·그 의원 `closed_dates` → `holidayEffect`(`holidayEffect.ts:69-89`) 앞날·다음 날 줄 `평소보다 +6%` | **기간 예외**: 한 달 안에는 공휴일이 없거나 하나뿐인 달이 많고 평소 값도 모자라 통계 탭과 다른 뜻이 되어, 이 칸만 통계 탭처럼 12달로 센다(사용자에게 알림). 날 수가 모자라면 통계 탭과 같은 빈 글 |
- 통계 탭 카드 가운데 '보고'(오늘·월간 글·고른 기간 보고·월간 보고서)는 시안 줄에 없어 그리지 않는다. '신환 1명당'·'처방 골라 보기'·'90일 예약 외 원장님별 Block 표'처럼 시안 작은 칸에 없는 것도 그리지 않는다.
- 그리기: CSS grid — 첫 세로 칸(줄 이름 + 작은 칸 이름들)은 `sticky left-0`, 의원마다 288px 세로 칸, 줄 높이 = 그 줄에서 가장 높은 칸. 바깥 틀 `overflow-x-auto`(1440에서도 옆으로 밀림). 카드 안 카드가 되지 않게 회색 바탕 위에 제목과 옆으로 미는 칸만 둔다(시안 '모양 결정'). 칸 차례 = 내 의원 먼저 + 이름 차례.

## 의원 비교 — 불러오기와 한도 (TASK-15)
- 의원 하나 = `admin_rows` 열여덟 번. 큰 것은 `stats_days` 두 달(≈62줄, 한 줄 64KB까지 → 많아야 4MB쯤)이고 `stats_months`는 payload 전체가 아니라 `rx`·`groups`·`dropoff`·`sections`만, `stats_day_totals`는 `totals`만(12달 ≈ 365줄 × 수백 바이트) 준다. **한 번에 3곳**, 끝난 의원부터 칸을 채우고, 날 줄은 칸 값을 만든 뒤 버린다(의원마다 만든 값만 손에 든다).
- 지역 `전체`면 승인된 의원 모두(한도 없음 — 시안에 한도 글이 없다), 나란히 보기 값(`compareStatsInput`)은 지역을 골랐을 때만 만든다. 같은 (의원, 달)은 화면 안에서 다시 읽지 않는다.
- Web Worker·비트 연결을 만들지 않는다(저장된 숫자만, 통계 탭의 저장 숫자 카드도 화면 쪽 순수 함수).
- 순위 표·월급 표·매출 표·나란히 보기는 같은 불러온 자료로 만든다(한 번 읽기).

## 저절로 올리기 DB (`supabase/migrations/20261124010000_admin_sync.sql`, TASK-17 — `20261124000000_admin_view.sql` 다음에 사용자가 붙여 넣음)
머리 주석 모양·두 번 실행 안전·기본 권한 회수는 TASK-1 파일과 같다. **TASK-1 파일은 고치지 않는다**(그 파일의 `my_hospital_id()`·`admin_view_hospital_id()`·`admins` 표를 부르기만 한다). 표 둘은 정책이 없고 함수로만 읽고 쓴다(`admin_views`·`hospital_regions`와 같은 꼴 — design.md '병원별 표' '(함수로만)' 줄에 둘을 더한 것과 같다).

```sql
-- ① 표 둘 (RLS 켬, 정책 없음 = 함수로만)
create table if not exists public.auto_upload_plans (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  months smallint not null default 2 check (months in (1, 2, 3, 6, 12, 24, 36, 60, 120)),
  updated_at timestamptz not null default now()
);
create table if not exists public.auto_upload_status (
  hospital_id uuid primary key references public.hospitals (id) on delete cascade,
  through_day date,                       -- '{M월 D일}까지' = 어제 쪽으로 끊김 없이 다 올라온 가장 늦은 날
  filled_from date check (filled_from is null or extract(day from filled_from) = 1),
                                          -- '{YYYY년 M월}까지 채움' = through_day에서 거꾸로 끊김 없이 다 올라온 가장 이른 달 1일
  last_ok_at timestamptz,                 -- '마지막으로 올린 때'
  error_code text check (error_code is null or error_code ~ '^E-[A-Z0-9-]{1,40}$'),  -- 오류 번호만(글자는 화면이 lib/errors.ts에서)
  error_at timestamptz,
  bit_mark text check (bit_mark is null or bit_mark ~ '^[0-9a-f]{64}$'),
                                          -- 처음 올린 비트 PC의 요양기관번호 SHA-256(번호 글자는 두지 않음, 다른 의원 비트 막기)
  lease_by uuid,                          -- 지금 올리는 탭의 무작위 id(겹침 막기)
  lease_until timestamptz,
  updated_at timestamptz not null default now(),
  check (filled_from is null or (through_day is not null and filled_from <= through_day))
);
alter table public.auto_upload_plans enable row level security;
alter table public.auto_upload_status enable row level security;
revoke all on public.auto_upload_plans, public.auto_upload_status from public, anon, authenticated;
```

함수(모두 `security definer set search_path = ''`, `revoke execute … from public, anon` 뒤 `grant execute … to authenticated`):

| 함수 | 누가 | 하는 일 · 거부 |
|---|---|---|
| `my_auto_upload_plan() returns table (months smallint, through_day date)` | 승인된 원장(`my_hospital_id()`) | 내 병원 한 줄: `months`(계획 줄 없으면 2)와 `through_day`(상태 줄 없으면 `null`) — 돌리는 쪽이 '그날 처음인가'를 알려고 쓰는 두 칸뿐이고 오류·시각·잡음은 주지 않는다(상태 읽기는 관리자만). 보는 중(`admin_view_hospital_id()`가 있음)·원장 아님(데스크·승인 전) → 줄 없음 |
| `claim_auto_upload(p_tab uuid, p_bit_mark text) returns boolean` | 같음 | `p_bit_mark`는 `null`(도우미 판이 낡아 `bit.check`를 못 함 — 묶기·검사 없이 잡기만) 또는 표시 모양(`^[0-9a-f]{64}$`, 아니면 22023). 표시를 주었고 내 병원 상태 줄의 `bit_mark`가 있으며 서로 다르면 잡지 않고 `error_code = 'E-AUTO-OTHER-BIT'`·`error_at = now()`만 쓴 뒤 `false`. 아니면 `insert … on conflict (hospital_id) do update set lease_by = p_tab, lease_until = now() + interval '7 minutes', bit_mark = coalesce(bit_mark, p_bit_mark) where lease_until is null or lease_until < now() or lease_by = p_tab` — 잡으면 `true`, 다른 탭이 잡고 있으면 `false`(한 줄 잠금이라 동시에 둘이 `true`가 될 수 없다). 보는 중·원장 아님·`p_tab` 없음 → 42501 |
| `report_auto_upload(p_tab uuid, p_through date, p_filled_from date, p_error text, p_done boolean) returns void` | 같음 · **잡은 탭만** | `lease_by = p_tab`인 내 병원 줄만 고친다(아니면 아무것도 안 함 — 늦게 끝난 탭이 남의 상태를 덮지 않음). `p_error`가 `null`이면 `through_day`·`filled_from`·`last_ok_at = now()`를 쓰고 `error_code`·`error_at`을 지운다. 있으면 `through_day`·`filled_from`(지금까지 된 것)과 `error_code = p_error`·`error_at = now()`를 쓰고 `last_ok_at`은 그대로. `p_done`이면 `lease_by`·`lease_until`을 비우고, 아니면 `lease_until`을 7분 뒤로 늘린다. 검사: `p_through` ≤ 한국 어제(`(now() at time zone 'Asia/Seoul')::date - 1`), `p_filled_from`은 1일이고 ≤ `p_through`, `p_error`는 `^E-[A-Z0-9-]{1,40}$` — 어기면 22023. 보는 중·원장 아님 → 42501 |
| `admin_auto_upload_list() returns table (hospital_id uuid, months smallint, through_day date, filled_from date, last_ok_at timestamptz, error_code text, error_at timestamptz)` | 관리자(`admins`) | 승인된 병원마다 한 줄(`left join`, 계획 줄 없으면 `months = 2`, 상태 줄 없으면 나머지 `null`). `lease_*`는 주지 않는다. 관리자 아님 → 42501 |
| `set_auto_upload_months(p_hospital_id uuid, p_months smallint) returns void` | 관리자 | 승인된 병원·값이 아홉 가운데 하나가 아니면 22023. `insert … on conflict do update set months, updated_at`. **`sales_days`·`stats_*` 줄은 건드리지 않는다**(줄여도 지우지 않음 — 사용자 결정) |
| `admin_compare_first_month() returns date` | 관리자 | 승인된 병원의 `stats_days.day`·`sales_days.day` 가운데 가장 이른 날의 달 1일(`date_trunc('month', …)::date`), 없으면 `null`. 지역과 상관없다(2차 물을 것 7). 10년 자르기는 화면 순수 함수가 한다 |

## 저절로 올리기 — 셈 · 글 · 브라우저 함수 (TASK-17)
- `src/lib/autoUpload/range.ts`(순수, 환자 자료 구역 밖):
  - `FILL_CHOICES = [{ months: 1, name: '1달' }, { months: 2, name: '2달' }, { months: 3, name: '3달' }, { months: 6, name: '6달' }, { months: 12, name: '1년' }, { months: 24, name: '2년' }, { months: 36, name: '3년' }, { months: 60, name: '5년' }, { months: 120, name: '10년' }]`, `DEFAULT_FILL_MONTHS = 2`.
  - `fillRange(today, months)` → `{ from: monthRange(addMonths(monthOf(today), -months)).from, to: addDays(today, -1) }`(날짜는 `lib/analytics/dates.ts`).
  - `uploadStatus({ row, months, today })` → `{ kind: 'done' | 'filling' | 'failed' | 'none', first: string, second: string | null, title: string }`. `none` = `through_day`가 `null`이고 오류 없음(`아직 없음`, 마우스 글 `이 의원 비트 PC에서 아직 올라온 날이 없어요.`). `failed` = 오류 번호 있음(첫 줄 = `lib/errors.ts` 그 번호의 `what`, 번호를 모르면 `E-AUTO-UPLOAD`의 what, 둘째 줄 `{번호} · {M월 D일}까지`, `through_day`가 없으면 `{번호}`만). `filling` = 오류 없고 `filled_from`이 `null`이거나 `fillRange(today, months).from`보다 뒤(둘째 줄 `{YYYY년 M월}까지 채움` = `filled_from`의 달, `null`이면 둘째 줄 없음). 그 밖 `done`. 마우스 글 = `마지막으로 올린 때 {M월 D일 (요일) HH:mm}`(한국 시각, `last_ok_at`이 없으면 이 줄 없음) + 채우는 중이면 ` · 채울 기간 {기간} 가운데 {YYYY년 M월}까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.`
  - `fillChangedText(name, before, after)` → 늘림/줄임 완료 줄(받침 규칙은 `lib/admin/region.ts` `roParticle` — TASK-4).
- `src/lib/storage/autoUpload.ts`(의원 쪽, 가짜 `supabaseBrowser`로 시험):
  - `readMyUploadPlan()` → `rpc('my_auto_upload_plan')` → `{ months, throughDay } | null`(줄 없음 = `null`).
  - `claimUpload(tab, bitMark)` → `rpc('claim_auto_upload', { p_tab, p_bit_mark })` → boolean.
  - `reportUpload(tab, { through, filledFrom, error, done })` → `rpc('report_auto_upload', …)`.
  - `readSavedSalesDays(from, to)` → `from('sales_days').select('day, day_codes, unconfirmed, rough_total')` 기간 안, `range`로 1,000줄씩 → `planRevenue`에 넘길 `Map<날, savedMark 값>`의 재료(`SavedRevenueDay` 모양 칸 이름은 지금 `lib/storage/revenue.ts`와 같게).
  - `readStatsMarks(from, to)` → 날 `from('stats_days').select('day, partial, sunap:payload->sunap')`·달 `from('stats_months').select('month, partial, asOf:payload->dropoff->>asOf')` 기간 안, 1,000줄씩 → `{ days: { day, partial, hasSunap }[], months: { month, partial, dropoffAsOf: string | null }[] }`(합계 몸통은 받지 않는다 — 10년이어도 가볍게).
  - 실패는 Supabase 글 없이 `AutoUploadError`(번호는 부른 쪽이 정함).
- `src/lib/auth/adminSync.ts`(관리자 쪽): `listUploadStatus()` → `rpc('admin_auto_upload_list')` → `Map<병원 id, UploadRow>`, `setUploadMonths(id, months)` → `rpc('set_auto_upload_months', …)`(실패 `AdminSyncError` = `E-AUTO-MONTHS`), `readCompareFirstMonth()` → `rpc('admin_compare_first_month')` → `'YYYY-MM' | null`.
- 오류 셋(`src/types/errors.ts`·`src/lib/errors.ts`, 글은 '화면 글자' 2차 오류 표).

## 저절로 올리기 — 통계 조각 (TASK-18, `src/lib/autoUpload/plan.ts` · TASK-6 조사 2026-11-24 반영)
TASK-6 일꾼 보고(커밋 `904eb776`): 긴 기간을 여러 조각으로 읽으면 **가장 새 조각이 아닌 조각**(`partSave`의 `unsure` = 읽기 끝 > 저장 끝)은 날 `sunap`·달 `dropoff`를 둘 다 뺀다. 달 `dropoff`는 **달 전체가 읽은 범위 안인 달**만(`statSums.ts` `wholeMonths`), `asOf` = 읽기 끝. 날 `sunap`은 수납일지 설정의 Block·물리치료 묶음을 고르고 **그 설정을 다 읽은 뒤** 불러올 때만 붙는다. 이를 따라:
1. **달째로 저장**한다. 저장 첫날은 늘 달 1일, 끝은 달 끝(지금 달만 어제까지 — 지금 달은 비교하지 않으므로 그달 `dropoff`가 없어도 된다).
2. **할 달**(채울 기간 안): (가) 통계 덮은 날(`readCoverage` — `bit`·`file` 모두)이 아닌 날이 있는 달, (나) 최근 24달 안에서 Block·물리치료 묶음이 있는데 `sunap` 없는 날 줄이 있는 달, (다) 최근 24달 안에서 처방 묶음이 있고 다 끝난 달인데 달 줄 `dropoff`가 없거나 `asOf` < min(그 달 + 석 달의 끝, 어제)인 달. (나)·(다)는 TASK-6 전에 저장한 달과 아직 덜 지켜본 '몇 번까지 받나'를 저절로 채운다. 24달보다 옛 달은 (가)만 — 이미 저장된 옛 달을 다시 읽으면 `after30`·`once`가 비워질 수 있어서다(범위 밖).
3. **새 조각**(하나): 최근 24달 안의 할 달이 있으면 저장 = 가장 이른 할 달 1일 ~ 어제, 읽기 = 저장 첫날 − 31일 ~ 어제(≤ 762일). 읽기 끝 = 저장 끝이라 확실한 조각이고 지금 TASK-6 규칙으로 `after30`·`once`·`sunap`·`dropoff`가 다 남는다(가운데 할 일 없는 달도 같이 다시 저장 — 같은 값이라 해 없음).
4. **옛 조각**(24달보다 옛 할 달): 최근 달부터 이어진 할 달 12달 이하씩, 저장 = 그 달들, 읽기 = 저장 첫날 − 31일 ~ min(저장 끝 달 + 석 달의 끝, 어제)(≤ 488일). 확실하지 않은 조각이라 `after30`·`once`는 지금처럼 빠지고, **AC-8021.10의 `partSave` 바꿈**으로 `sunap`(그날 접수만 보는 수)은 남고 `dropoff`는 석 달 넘게 지켜본 달(그 달 + 석 달 끝 ≤ 읽기 끝 — 조각의 모든 달)만 남는다. 그래서 **채운 옛 달도 Block 전환·몇 번까지 받나가 생긴다.**
5. 한 달씩 따로 읽는 길은 쓰지 않는다: 읽기 끝이 그 달 끝이면 '확실한 조각'으로 보여 `after30`·`once`가 덜 센 값으로 저장되고 `dropoff`는 지켜본 날이 없어(그 달 끝 − 30일 뒤에 끝난 사람은 빠짐) 뜻이 없다.
6. 요청마다 그 의원 처방 묶음(`stats_rx_groups` → `forLoad`와 같은 값)과 수납일지 Block·물리치료 묶음(`sunap_settings`)을 싣는다. 둘 다 **다 읽은 뒤에** 첫 통계 요청을 보낸다(AC-8021.11).
7. 저장은 통계 탭과 같다: `requestLoad`(조각마다 `keep: true` — 그 조각이 Worker 기억 범위) → `partSave` → `saveStats`(덮음 줄 `stats_coverage`는 저장 범위 — 지금 그대로).
8. `progressOf`: 매출 저장 표시(`savedMark`)와 통계 덮음이 둘 다 참인 날로 `through_day`·`filled_from`(AC-8021.9). 합계 열쇠는 진행에 넣지 않는다.

`partSave` 바꿈(TASK-18이 `src/components/stats/loadPlan.ts`를 고침 — Phase 2 TASK-8 뒤라 겹치지 않음): `unsure`일 때 `sunap`을 빼던 것을 지우고, `dropoff`는 `monthRange(addMonths(row.month, 3)).to ≤ read.to`인 달 줄만 남긴다. 통계 탭 '전체 기간' 옛 조각에도 같은 규칙이 걸려 거기서도 옛 달 합계가 생긴다(화면 숫자는 Worker 기억에서 그리므로 그대로). TASK-6 시험 가운데 '옛 조각은 둘 다 뺀다'를 새 규칙으로 고친다.

## 저절로 올리기 — 돌리기 (TASK-18, `src/components/autoUpload/`)
- `AutoUpload.tsx`: `AppShell`이 늘 그린다(한 줄). `null`을 그린다. 쪽을 처음 열 때 한 번 `runUpload`를 부른다(탭 사이를 옮겨도 다시 부르지 않음 — 앱 틀이 남아 있음). 연 뒤 15초 기다림(첫 화면·대시보드 비트 읽기가 먼저), 탭이 보이는 중이 아니면 보일 때까지 기다림.
- `runUpload(deps)`(훅 아님 — 본보기 `components/dashboard/live/readBitDays.ts`; 통로·Worker·저장소·시계·`bitLane`·`navigator.locks`를 인자로 받아 시험):
  1. 보는 중(`useReadOnly()`·`readViewKey()`)이면 끝. `readMyUploadPlan()` 줄 없음이면 끝.
  2. 읽기 넷(`readSavedSalesDays`·`readCoverage`·`readStatsMarks` — 채울 기간 안, 처방 묶음·수납일지 설정) → `uploadPlan`. 빈 목록 + `through_day` ≥ 어제면 끝(그날 두 번째 열기부터 서버 읽기만).
  3. `navigator.locks.request('ssk-auto-upload', { ifAvailable: true }, …)` — 못 받으면 끝(같은 브라우저 다른 탭이 돌고 있음).
  4. `bitLane.enterBackground(stop)` — 화면이 통로를 쓰는 중이면 끝.
  5. 통로를 스스로 붙인다(`connectScreenBridge` + 새 `createStatsWorker`): hello → `bit.check`. 확장 없음·도우미 없음·등록 안 됨이면 알리지 않고 끝(비트 PC가 아님). `institutionCode`가 없으면(번호 없이 등록한 의원, precheck AC-005.13) 끝내지 않고 표시 없이 올린다(6). hello가 판 오류(`E-HELPER-OLD`)면 `bit.check`를 못 하므로 표시 없이 잡고(`claimUpload(tab, null)` — DB는 표시가 `null`이면 묶기·검사를 건너뜀) 그 번호만 알리고 끝 → 판이 낡은 비트 PC도 관리자 표에 `도우미를 업데이트하세요 · E-HELPER-OLD`가 보인다.
  6. 비트 표시 = `crypto.subtle.digest('SHA-256', institutionCode)` 16진 64자(번호가 없으면 `null` — 그 병원은 다른 의원 비트 막기 없이 돈다, '위험') → `claimUpload(tab, 표시)`. `false`면 끝(다른 PC가 돌고 있거나 다른 의원 비트 — 그때 DB가 `E-AUTO-OTHER-BIT`를 적음).
  7. 일을 차례로 하나씩(AC-8021.5). 첫 도우미 요청 때 시계를 잡고 5분이 지나면 새 일을 시작하지 않는다. 일이 끝날 때마다 `reportUpload(…, done: false)`(잡음 7분 늘림). 탭이 숨거나(`visibilitychange`) `bitLane`이 끊기를 알리면 통로·Worker를 닫아 하던 요청을 끊고(그 일은 저장 안 함) 오류 없이 마침.
  8. 끝: `reportUpload(…, error, done: true)` → 통로·Worker 닫기 → `bitLane` 놓기 → 잠금 놓기. 실패 번호는 AC-8021.7. 저장 도중 끊겨도 날·달 줄은 upsert라 다음에 같은 일을 다시 해도 같다.
- 확인 창·알림·표시·`console`은 없다. 환자 자료는 지금처럼 Worker 안에서만 세고 서버에는 집계 줄만 간다(지금 통계 탭 저장 길 그대로).

## 비트 통로 차례 (TASK-8, `src/components/claim/bitLane.ts`)
조사: 확장은 웹 연결을 **한 번에 하나만** 받고 둘째는 `E-BRIDGE-BUSY`로 거절한다(`extension/src/background.ts:173-177`), 도우미도 한 번에 한 명령(`MessageLoop.cs:8`). 화면은 모두 `useBridge`(청구·통계·환자·수납·예약·업무일지 `useBitFill`·설정 등록)로, 대시보드만 `readBitDays`로 붙는다. 그래서 같은 쪽 안 차례를 둔다:
- 모듈 하나(네트워크·저장소·React 없음): `enterScreen(onFree): boolean` — 저절로 올리기가 쥐고 있지 않으면 화면 수를 하나 늘리고 `true`(지금처럼 바로 붙음). 쥐고 있으면 그쪽 `stop()`을 부르고 `false`, 놓이면 `onFree()`. `leaveScreen()`. `enterBackground(stop): (() => void) | null` — 화면이 하나라도 있으면 `null`.
- `useBridge`는 붙기 전 `enterScreen`, 닫을 때·떠날 때 `leaveScreen`. `readBitDays`는 읽는 동안만. 쥔 쪽이 없을 때 부르기 차례·횟수는 지금과 같다(지금 시험이 고치지 않고 지남).
- 다른 탭과는 막지 못한다 → 저절로 올리기는 **탭이 보이는 동안만** 돈다(숨으면 바로 끊음). 다른 탭에서 비트 화면을 막 연 순간과 겹치면 그 화면이 지금처럼 `E-BRIDGE-BUSY`를 볼 수 있다('위험').

## 가입 승인 표 2차 (TASK-12 · TASK-19)
- TASK-12: 세 탭 모두 `신청자`·`이메일`을 한 칸 `신청자 · 이메일`(이름 / 메일 small `ink-2`, 메일 줄 바꿈 자리 `@` 뒤 그대로)로. 지금 휴대폰 격자 모양은 고치지 않고 그 안 글 차례만 맞춘다(새 폰 모양 없음).
- TASK-19('승인' 탭만): 표 위 안내 줄(올림 아이콘 = `Icon.tsx`의 지금 `upload` 그림, 새 그림 없음), 새 칸 `채울 기간`(88px, 고르기 32px)·`저절로 올림`(248px, 두 줄), 칸 폭·차례는 아래 시안 줄 그대로. `AdminApplications`가 여는 때 `listUploadStatus()`를 같은 `Promise.all`에 더한다(AC-8022.5). 채울 기간을 바꾸면 손에 든 값만 고치고 `저절로 올림` 글을 `uploadStatus`로 다시 만든다.
- 시안 '2차 모양 결정'(notes.md 92~100줄, 그대로 옮김):

- **승인 표 칸 차례**: 신청일 · 의원 이름 · 지역 · **채울 기간** · **저절로 올림** · EMR · 신청자 · 이메일 · 연락처 · 동작. 새 두 칸은 관리자가 자주 보는 지역 옆에 둔다.
- **1440에 다 들어가게**: 두 칸(88 + 248px)이 늘어 신청자·이메일을 한 칸 두 줄로 합치고, 칸 너비를 줄였다(신청일 112 · 이름 184 · 지역 108 · EMR 60 · 연락처 132 · 동작 144). 표 최소 폭 1232px — 1440은 다 보이고, 더 좁으면 표만 옆으로 밀린다. 관리자 칩이 붙은 긴 이름은 1440에서도 '…'로 줄어든다(마우스 글에 전체 이름).
- **채울 기간 고르기**: 지역 고르기와 같은 32px 상자. 바꾸면 바로 저장 + 완료 줄(확인 창 없음).
- **채울 기간 셈**: 달 단위. 'N달' = 이번 달에서 N달 앞 달의 1일부터 어제까지(예: 11월 24일에 2달 = 9월 1일 ~ 11월 23일, 10년 = 2016년 11월 1일 ~). 다 채우면 둘째 줄이 사라진다.
- **상태 글 색**: 보통 `ink`, 채우는 중 둘째 줄 `accent-strong`, 실패 첫 줄 `negative` 500, 아직 없음 `muted`. 새 색 없음.
- **실패**: 마지막 시도가 실패면 실패로 보이고, 둘째 줄에 그래도 어디까지 올라왔는지 적는다. 다음에 성공하면 보통으로 돌아간다.
- **의원 화면**: 아무것도 그리지 않는다(올리는 중 표시·완료 알림·오류 모두 없음).
- **달 고르기**: 1차의 ◀ 달 ▶ 상자에서 가운데 글을 [연도 ▾][월 ▾] 두 고르기로 바꿨다 — 10년 전으로 한 번에 가고, ◀▶로 한 달씩. 연도를 바꿀 때 그 해에 없는 달이면 가장 가까운 고를 수 있는 달로. 가장 이른 달 = 모든 의원 중 저장된 숫자가 있는 가장 이른 달(10년보다 앞은 안 됨), 가장 늦은 달 = 지난달.
- **옛 달**: 그 달 숫자가 없는 의원은 줄은 두고 칸은 '–'(순위 표에서 늘 아래). 합계는 숫자 있는 의원만 더한다.

## 의원 비교 달 10년 (TASK-14 · TASK-15)
- `src/lib/admin/compare/months.ts`(TASK-14, 순수): `compareMonths(first: 'YYYY-MM' | null, today)` → `{ first, last, years: { year, months: number[] }[] }`. `last` = 지난달, `cap` = 이번 달 − 120달, `first` = `first`가 `null`이거나 `last`보다 늦으면 `last`, 아니면 max(`first`, `cap`). `nearestMonth(years, year, month)` = 그 해에 고를 수 있는 달 가운데 가장 가까운 달(같으면 앞 달).
- `ComparePickers`(TASK-14): 1차 ◀ 달 ▶ 상자의 가운데 글을 [연도 ▾][월 ▾] 두 `select`로(읽기용 이름 시안), 옆 글, 범위는 props(`months`)로 받는다(네트워크 없음).
- 표(TASK-14): 그달 숫자가 없는 의원 줄은 남고 `–`. 매출·환자 수 아래 줄 `· 숫자 있는 {k}곳 합`, 합·의원 평균은 숫자 있는 의원만. 순위 표 빈 값은 늘 아래(지금 `sortRows`).
- `useCompareData`(TASK-15): `readCompareFirstMonth()`를 화면을 여는 때 한 번(지역과 상관없이) → `compareMonths` → `ComparePickers`. 의원마다 읽는 기간은 `compareRanges(고른 달)` 그대로(옛 달도 두 달·12달 — `admin_rows`의 400일 한도 안).
- 몇 번까지 받나 셈(TASK-13·14, TASK-6 보고 4): 달 줄 `dropoff.lines`의 `average`·`drop`은 그 달·그 묶음 하나의 값이라 **더하거나 평균 내지 않는다**. 비율은 늘 수(`n`·`atLeast[]`·`ten`·`once`)에서 새로 센다(3번 이상 = `atLeast[2] ÷ n`, 1번 = `once ÷ n`, 2번 = (`atLeast[1]` − `atLeast[2]`) ÷ `n`). 묶음·달을 합칠 일이 생기면 수를 더한 뒤 나눈다. 평균 횟수는 그 달 그 묶음 하나일 때만 그 줄 값을 쓴다.

## 화면 글자 (시안 `docs/mockups/admin-view/notes.md` '화면 글자' 그대로 — 사용자 2026-11-24 "이대로 승인")
> 아래 '시안 글'은 `notes.md` 35~57줄(2차로 줄 번호가 밀림)을 한 글자도 바꾸지 않고 옮긴 것이다(글자 안 `{…}`는 채울 값). 이 글과 시안 `index.html`이 다르면 `index.html`의 `T` 글이 이긴다(같은 글로 확인함 2026-11-24).

**다른 의원 보기**
- 위쪽 띠 단추: `보는 의원` (눈 아이콘 + 아래 화살표, 관리자만, 계정 단추 왼쪽·시계 왼쪽)
- 판: 제목 `다른 의원 보기` · 설명 `고르면 그 의원 화면을 읽기만 해요. 예약·환자·청구 탭은 보이지 않아요.` · 찾기 칸 `의원 이름으로 찾기` · 묶음 이름 `내 의원` / `다른 의원 {n}곳` · 찾는 것 없음 `찾는 의원이 없어요` · 줄 = 의원 이름 + 오른쪽 지역, 지금 보는 의원은 체크 + 파랑 굵게
- 맨 위 띠: `{의원 이름} 보는 중 · 읽기만` + `· 예약·환자·청구 탭과 저장·고치기 단추는 숨겼어요` + 단추 `내 의원으로`
- 승인 목록 이름 링크의 마우스 글: `{의원 이름} 화면 보기 (읽기만)`

**관리자 화면**
- 안쪽 메뉴(설정 화면과 같은 모양): `가입 승인` | `의원 비교`
- 가입 승인 안내 끝에 한 문장 더함: `의원 이름을 누르면 그 의원 화면을 읽기만 할 수 있어요.`
- 새 칸 이름 `지역`, 고르기 = `서울·부산·대구·인천·광주·대전·울산·세종·경기·강원·충북·충남·전북·전남·경북·경남·제주` + `지역 모름`. 지역 모름 마우스 글 `병원 정보에 주소가 없어 지역을 몰라요. 골라 주세요.` 바꾼 뒤 완료 줄 `{의원 이름} 지역을 {지역}로/으로 바꿨어요.`(받침 따라 '로'·'으로')
- 본 기록: 제목 `본 기록` · 오른쪽 `최근 30일 · {n}번` · 설명 `관리자가 다른 의원 화면을 열 때마다 적어요.` · 칸 `본 때` · `본 관리자` · `본 의원` · 때 모양 `11월 24일 (화) 09:12` · 관리자 모양 `{의원 이름} · {메일}`

**의원 비교**
- 제목 `의원 비교` · 안내 `승인한 의원들의 한 달 숫자를 나란히 봐요. 의원마다 저장된 숫자로 세고, 환자 이름 같은 개인정보는 없어요.`
- 고르기 이름 `지역`(첫 값 `전체`) · `달`(◀ `2026년 10월` ▶) · 아래 줄 `{YYYY년 M월} · M월 1일 – M월 말일 · 의원 {n}곳`(지역을 고르면 `{지역} 의원 {n}곳`)
- 바로가기: `의원 순위` · `통계 나란히 보기` · `직군별 월급` · `매출·환자 수`
- 의원 순위: 옆 글 `{달} · 칸 이름을 누르면 그 숫자로 줄을 세워요. 한 번 더 누르면 거꾸로예요.` · 묶음 머리 `매출·환자 수` / `직군별 평균 월급` / `통계 대표 숫자` · 첫 칸 `의원`(순위 번호 + 이름 + 내 의원이면 칩 `내 의원` + 전체일 때 지역) · 칸 `총진료비` `내원 수` `신환` `재진` `하루 평균 내원` / `간호사` `간호조무사` `물리치료사` `방사선사` `원무` `기타` / `비급여 비율` `신환 재방문율 (30일)` `신환 예약률` `Block 전환율` `예약 수` `가장 많은 나이대` `목표 달성률` `3번 이상 받은 비율` · 아래 글 `–는 그 의원에 그 달 숫자가 없는 칸이에요. 줄을 세울 때 늘 맨 아래에 둬요.`
- 값 모양: `1억 3,261만 원`(만 원 아래 버림) · `3,412건` · `286명` · `136.4건` · `252만 원` · `31.4%` · `50대 · 24.1%` · 없음 `–`
- 통계 나란히 보기: 옆 글 `{달} · {지역} {n}곳 · 통계 탭 카드를 의원마다 나란히 · 같은 달 · 옆으로 밀어 봐요` · 전체일 때 `지역을 골라 주세요 · 지역을 고르면 그 지역 의원들의 통계 카드를 나란히 보여 줘요.` · 줄 이름(통계 큰 카드) `요약` `환자` `매출` `예약·전환` `예약` `처방` `진료 운영` + 옆에 작은 칸 이름들 · 작은 칸 이름은 통계 탭 그대로(환자 요약·매출 요약·평소와 다른 것·이번 달 목표·일별 내원·환자 구성·신환 재방문율·몇 번까지 받나·매출 추이·급여·비급여·기타·신환 예약률·90일 예약률·Block 전환·예약 수·취소율·변경율·안 옴율·처방별 추세·처방별 신환·재진·원장님별·시간대별 접수·요일별 내원·휴일에 따라) · 새 글 `목표를 적지 않았어요` · `▲ 19% 물리치료가 평소보다 많아요` 꼴 · `102.0% · 목표 1억 3,000만 원` · `공휴일 앞날` / `공휴일 다음 날` / `평소보다 +6%` · 요약 줄 옆 글의 `(그 달 마지막 주를 앞 4주와 견줌)`·`(그 달 목표)`
- 직군별 월급: 옆 글 `{달} 급여 · 정규직·계약직 · 실수령 기준 · 평균과 가장 적은~많은` · 칸 `의원` + 직군 여섯 + `파트타임` · 값 `평균 252만 원` / `4명 · 238만~271만 원`, 한 명이면 `365만 원` / `1명`, 없으면 `–`, 파트타임 칸 `2명` · 급여 없는 의원 `급여 없음 · 10월 급여를 적지 않았어요` · 아래 줄 `전체 {n}곳` · 아래 글 `파트타임은 일하는 시간이 달라 평균에 넣지 않고 사람 수만 적어요.`
- 매출·환자 수: 옆 글 `{달} · 저장된 숫자 · 총진료비는 수납한 날 기준` · 칸 `의원` `총진료비` `내원 수` `신환` `재진` `하루 평균 내원` · 아래 줄 `전체 {n}곳` + 마지막 칸 `의원 평균 98.6건`
- 빈 자료: `의원 없음 · {지역}에 승인된 의원이 없어요. 지역을 바꾸거나 전체로 봐 주세요.` / `자료 없음 · {YYYY년 M월}에 저장된 숫자가 있는 의원이 없어요. 의원 PC에서 그 달 통계를 불러와 저장하면 채워져요.` / 월급 `급여 없음 · {YYYY년 M월} 급여를 적은 의원이 없어요.`

**2차 시안 글** (`notes.md` 58~73줄을 한 글자도 바꾸지 않고 옮김 — 2차 "이대로 승인")

**2차 · 저절로 올리기 (가입 승인 · 승인 탭)**
- 표 위 안내 줄(올림 아이콘): `저절로 올림` · `의원 비트 PC에서 그날 처음 앱을 열면, 어제까지 아직 안 올라온 날의 매출·통계 숫자를 사이트에 올려요. 채울 기간이 길면 최근 달부터 한 번에 5분쯤씩 나눠 채우고, 다음에 열 때 이어서 채워요. 의원 화면에는 아무것도 보이지 않아요.`
- 새 칸 이름: `채울 기간` · `저절로 올림`. 칸 이름 바꿈: `신청자`+`이메일` → `신청자 · 이메일`(한 칸 두 줄: 이름 / 메일 작게)
- 채울 기간 고르기 값: `1달` `2달` `3달` `6달` `1년` `2년` `3년` `5년` `10년`(처음 `2달`)
- 저절로 올림 값
  - 다 올라옴: `{M월 D일}까지` (예 `11월 23일까지`)
  - 채우는 중: 첫 줄 `{M월 D일}까지` + 둘째 줄(파랑) `{YYYY년 M월}까지 채움` (예 `2024년 3월까지 채움`)
  - 실패: 첫 줄(주황 빨강) 오류 글 — `lib/errors.ts`의 what 그대로(`도우미를 업데이트하세요` · `통계 숫자를 저장하지 못했어요`) + 둘째 줄 `{오류 번호} · {M월 D일}까지` (예 `E-HELPER-OLD · 11월 20일까지`)
  - 한 번도 없음: `아직 없음`
- 마우스 글: `마지막으로 올린 때 {11월 24일 (화) 08:05}` · 채우는 중이면 덧붙임 `채울 기간 {10년} 가운데 {2024년 3월}까지 채웠어요. 앱을 열 때마다 5분쯤씩 더 채워요.` · 아직 없음 `이 의원 비트 PC에서 아직 올라온 날이 없어요.`
- 채울 기간을 바꾼 뒤 완료 줄: 늘리면 `{의원} 채울 기간을 {기간}로/으로 바꿨어요. 그 의원 PC에서 다음에 앱을 열 때부터 더 채워요.` · 줄이면 `{의원} 채울 기간을 {기간}로/으로 바꿨어요. 이미 올라온 숫자는 지우지 않아요.`

**2차 · 의원 비교 달 10년**
- 달 고르기: ◀ [`2026년` ▾] [`10월` ▾] ▶ (읽기용 이름 `달 고르기` · `연도` · `월` · `앞 달` · `다음 달`). 연도는 최근 해가 위, 월은 그 해에 고를 수 있는 달만
- 옆 글: `{YYYY년 M월}부터 {YYYY년 M월}까지 고를 수 있어요 · 저장된 숫자가 있는 달, 10년까지` (예 `2023년 11월부터 2026년 10월까지 …`)
- 매출·환자 수 아래 줄 덧붙임(그 달 숫자 없는 의원이 있을 때): `전체 {n}곳` 뒤 `· 숫자 있는 {k}곳 합`

**2차 오류 셋 (시안에 없어 Claude가 정함 — 지금 `lib/errors.ts` 글 모양)**
| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| `E-AUTO-MONTHS` | 채울 기간을 바꾸지 못했어요 | 인터넷 연결을 확인하고 다시 골라 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-AUTO-UPLOAD` | 비트 숫자를 올리지 못했어요 | 그 의원 PC에서 앱을 다시 열면 이어서 해요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-AUTO-OTHER-BIT` | 다른 의원 비트 PC예요 | 이 PC의 비트는 처음 올린 의원과 달라 올리지 않았어요. 그 의원 계정으로 열어 주세요. |
- `저절로 올림` 칸 실패 첫 줄은 그 번호의 '무엇이' 글이다(시안 예 `도우미를 업데이트하세요`·`통계 숫자를 저장하지 못했어요` = 지금 `E-HELPER-OLD`·`E-STATS-SAVE-FAILED`). 의원 화면에는 이 글들이 나오지 않는다.

**오류 다섯 (시안에 없어 Claude가 지금 `lib/errors.ts` 글 모양으로 정함 — '무엇이 · 어떻게 고치나 · 번호')**
| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| `E-VIEW-START` | 다른 의원 화면을 열지 못했어요 | 인터넷 연결을 확인하고 다시 골라 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-VIEW-LOG` | 본 기록을 불러오지 못했어요 | [다시 불러오기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-REGION-SAVE` | 지역을 바꾸지 못했어요 | 인터넷 연결을 확인하고 다시 골라 주세요. 계속되면 오류 번호와 함께 문의해 주세요. |
| `E-COMPARE-READ` | 이 의원 숫자를 불러오지 못했어요 | [다시 불러오기]를 눌러 주세요. 다른 의원 칸은 그대로 볼 수 있어요. |
| `E-VIEW-READONLY` | 보는 중에는 저장할 수 없어요 | 다른 의원 화면은 읽기만 해요. 고치려면 [내 의원으로]를 누른 뒤 해 주세요. |

**시안에 없고 지금 코드 글자를 쓰는 것**: 대시보드 머리의 칩·저장 시각 줄(`저장된 숫자`, `{M월 D일 HH:mm}에 저장한 숫자`), 보고 문장, 통계 카드 옆 글들, 나란히 보기 작은 칸 안 글 가운데 시안에 적히지 않은 것. 읽는 중 표시는 지금 `LoadBar`·읽는 중 모양.
- 시안 `index.html`에만 있는 글(같은 글을 쓴다): 나란히 보기 의원 칸 빈 자료 `자료 없음`, 예약·전환 칸 아래 `수납일지 마감한 날만`, 원장님별 한 분 `원장님이 한 분이라 나누어 볼 것이 없어요.`, 처방별 신환·재진 줄 `신환 {n}명` · `재진 {n}건`, 매출 추이 `합계 {금액}`, 신환 재방문율 `7일 안`·`14일 안`·`30일 안`, 몇 번까지 받나 `1번`·`2번`·`3번 이상`.

## 문서 줄 (TASK-1, 사용자가 명세를 승인하면 바꾼다)
- `CLAUDE.md` 아키텍처 규칙 셋째 줄 끝: "… 관리자만 보는 탭 목록(공용 표 `tab_access`)만 읽고 쓰지 않는다 (ADR-004·ADR-031·ADR-033·ADR-042)" → "… 관리자만 보는 탭 목록(공용 표 `tab_access`), 관리자가 이 브라우저에서 보는 의원(보기 쿠키가 있을 때 `my_admin_view()` 한 줄)만 읽고 쓰지 않는다 (ADR-004·ADR-031·ADR-033·ADR-042·ADR-046)".
- `CLAUDE.md` 예외 줄들 끝(ADR-043~045 줄 다음)에 한 줄: "- 예외 (ADR-046·047): 다른 의원 보기·의원 비교(`specs/admin-view`, 관리자만)만 — 관리자가 고른 승인된 의원의 줄을 **읽기만** 한다. 보기 열쇠(세션 쿠키 `ssk_view` → 요청 머리 `x-ssk-view`)로 RLS가 그 의원 줄만 주고 쓰기를 모두 막는다. 예약 줄(`calendar_appts`)·환자·청구 표는 보지 않고 예약은 이름·차트번호·메모 없는 숫자 칸만. 볼 때마다 `admin_views`에 남기고 관리자만 읽는다. 의원 비교는 정의자 함수 `admin_rows`(이름·연락처·차트번호 없는 칸)로 읽는다".
- `docs/ARCHITECTURE.md`: 서버 코드 줄의 인증 예외에 "보는 의원 한 줄(ADR-046)", DB 표에 `admin_views`·`hospital_regions` 두 줄과 '병원별 표에는 보기 정책 둘(ADR-046)' 한 줄, '인증·승인 흐름'에 보기 한 줄.
- `plan.md` §2-1 끝에 "- 관리자는 다른 승인된 의원 화면을 읽기만 하며 볼 수 있다(예약·환자·청구 빼고, 볼 때마다 기록, 그 의원에는 알리지 않음). 관리자 탭 '의원 비교'에서 지역·달로 의원을 견준다 **(사용자, 2026-11-24, ADR-046·047)**", §5 DB 표에 `admin_views`·`hospital_regions` 줄.

- (2차, TASK-17) `docs/ADR.md` 끝(ADR-047 다음)에 'ADR-048' 글. `docs/ARCHITECTURE.md` DB 표에 `auto_upload_plans`·`auto_upload_status` 두 줄(함수로만, ADR-048)과 브라우저 쪽에 "저절로 올리기: 원장 계정 비트 PC 탭이 지금 통계 저장 길로 매출·통계를 뒤에서 올림(ADR-048)" 한 줄. `CLAUDE.md`·`plan.md`는 고치지 않는다(서버 경로·환자 자료 규칙이 그대로라서).
## 시험 계획 (시험 이름에 AC ID)
| 파일 | 보는 것 |
|---|---|
| `supabase/adminView.rls.test.ts` (TASK-1) | AC-8001.1~6·AC-8002.1~8·AC-8003.1~4: PGlite + Supabase·Storage 흉내(`location.rls.test.ts` 복사) + **지금 모든 migration**(파일 이름 차례, `location.rls.test.ts`의 사슬 차례 예외를 따름) → 이 파일 → 이 파일. 머리는 `set_config('request.headers', '{"x-ssk-view":"<열쇠>"}', false)`로 흉내. 함수 속성·실행 권한·표 권한·정책(이름·종류·식, '병원별 표'의 표마다), 시작·끝·12시간(줄의 `started_at`을 운영자로 당김)·남의 열쇠·관리자에서 뺌·대기 병원, 표본 표 읽기(내 줄 숨김·`maybeSingle` 한 줄)·'보기 ×' 표 빈 답·쓰기 넷(넣기·고치기·지우기·upsert)과 invoker 함수 넷이 막힘·머리 없을 때와 관리자 아닌 사람은 이 파일 전과 같음(같은 읽기를 파일 전·후로 견줌), 바구니 다섯 읽기, 다시 만든 함수 여섯의 머리 있음·없음 답, 카탈로그 완전성(`hospital_id` 칸 있는 모든 표가 세 목록 중 한 곳), `admin_rows` 종류마다 칸 열쇠(이름·차트·메모·연락처 없음)·한도·거부, `set_hospital_region`, `admin_view_log`·`admin_view_hospitals`, 두 번 실행 모양 같음, 42P17 없음. 가짜 메일(`@fake.test`)·가짜 이름만 |
| `src/lib/supabase/viewKey.test.ts`·`browser.test.ts`·`server.test.ts` (TASK-2) | AC-8004.1~4: 쿠키 글 읽기·쓰기 글, 머리 붙임 여부, 거르기 규칙 표의 주소·방법마다(보냄·막음·403 본문), 서버 쿠키 |
| `src/lib/auth/adminView.server.test.ts` (TASK-2) | AC-8004.5: 첫 줄 `server-only`, 쿠키 없으면 DB 안 부름, rpc 한 번·답 모양·오류 → `AdminViewReadError` |
| `src/lib/auth/adminView.test.ts`·`src/lib/storage/adminRows.test.ts`·`src/lib/errors.test.ts` (TASK-3) | AC-8005.1~3 |
| `src/components/shell/viewing.test.tsx`·`viewPaths.test.ts`·`src/lib/admin/region.test.ts` (TASK-4) | AC-8007.1~3·AC-8013.1~3(design '지역' 표의 이름마다 한 줄, 우편번호·붙은 꼴·`광주시`·`성남시 …`·저장소 안 예 다섯) |
| `src/lib/admin/compare/{sales,pay,sort,load}.test.ts`·`src/components/stats/sections/SunapSection.test.tsx` (TASK-5) | AC-8014.1~3: 가짜 줄로 합·평균(소수 첫째 자리 버림)·빈칸, 월급(항목 뺌·인센티브·조정·파트타임·지운 직원·급여 없음), 차례(처음 총진료비 내림·빈 값 맨 아래·내 의원 먼저), 불러오기 종류·기간 |
| `src/lib/payload/validate.test.ts`·`src/lib/payload/statSums.test.ts`·`src/lib/analytics/dropoff.test.ts`·`src/lib/analytics/sunapRates.test.ts`·`src/workers/stats/jobs.test.ts`·`src/workers/statsClient.test.ts`·`src/components/stats/loadPlan.test.ts`·`src/components/stats/useStatsWorker.test.ts`·`src/lib/storage/stats.test.ts`·`src/lib/payload/toMonthPayload.test.ts` (TASK-6) | AC-8018.1~5: 새 열쇠가 있는 줄·없는 옛 줄 모두 통과, 날 `sunap` 합 = 그 기간 `sunapRates`, 달 `dropoff.lines`를 모두 더하면 지금 `dropoff()`와 같음, 그달 `payload.rx` = 그달 `rxVisitSplit`, 확실하지 않은 조각엔 새 열쇠 없음, 64KB 넘는 날 줄은 `again`만 빠짐, 환자 이름·차트 글자가 저장 줄에 없음(가짜 이름 넣고 찾기), 옛 시험 그대로 통과 |
| `src/components/shell/viewShell.test.tsx`·`ViewBand.test.tsx`·`ViewPicker.test.tsx`·`ViewGate.test.tsx`·`src/app/(app)/layout.test.tsx` 등 (TASK-7) | AC-8006.1~7 |
| `src/components/stats/viewMode.test.tsx`·`src/components/dashboard/viewMode.test.tsx`·`src/components/claim/useBridge.test.ts` (TASK-8) | AC-8008.1~4 |
| `src/components/worklog/viewMode.test.tsx`·`src/components/sunap/viewMode.test.tsx`·`src/components/staff/viewMode.test.tsx`·`src/lib/storage/staff.test.ts` (TASK-9) | AC-8009.1~4 |
| `src/components/notices/viewMode.test.tsx`·`src/components/location/viewMode.test.tsx`·`src/components/inventory/viewMode.test.tsx` (TASK-10) | AC-8010.1~3 |
| `src/components/contacts/viewMode.test.tsx`·`src/components/forms/viewMode.test.tsx`·`src/components/ai-report/viewMode.test.tsx`·`src/components/settings/viewMode.test.tsx` (TASK-11) | AC-8011.1~3 |
| `src/components/admin/AdminApplications.test.tsx`·`AdminViewLog.test.tsx`·`AdminNav.test.tsx`·`src/app/(app)/admin/page.test.tsx` (TASK-12) | AC-8012.1~5 |
| `src/components/admin/compare/statsInput.test.ts`·`CompareCells.test.tsx`·`CompareStats.test.tsx` (TASK-13) | AC-8014.5·AC-8016.1~4: 같은 가짜 저장 숫자로 통계 탭 순수 함수 값과 칸 값이 같음, 합계 저장 전 달 `–`, 휴일 칸 12달, 목표 칸, 줄·작은 칸 차례가 시안 표와 같음, `TOC_LINKS` 빠짐 검사, 전체면 안내 글 |
| `src/lib/admin/compare/rank.test.ts`·`src/components/admin/compare/ComparePickers.test.tsx`·`RankTable.test.tsx`·`PayTable.test.tsx`·`SalesTable.test.tsx` (TASK-14) | AC-8014.4·AC-8015.1~6: 대표 숫자 여덟(차례·값·`–`), 달 12개·▶ 막힘, 값 모양, 빈 자료 글 |
| `src/app/(app)/admin/compare/page.test.tsx`·`src/components/admin/compare/ComparePage.test.tsx`·`useCompareData.test.tsx`·`src/app/titles.test.tsx`·`src/app/notFound.test.tsx` (TASK-15) | AC-8017.1~4, 비교 판 전체에 쓰기 단추·쓰기 요청 없음 |
| `supabase/adminSync.rls.test.ts`·`supabase/adminView.rls.test.ts` (TASK-17) | AC-8019.1~6: TASK-1 시험의 PGlite 흉내로 모든 migration → `20261124000000_admin_view.sql` → `20261124010000_admin_sync.sql`(두 번). 표 권한·정책 없음, 함수마다 관리자·원장·데스크·대기·보는 중(요청 머리) 결과, 잡음 둘째 탭 `false`·7분 뒤 `true`(운영자 권한으로 `lease_until` 당김), 잡지 않은 탭 보고 무시, 비트 표시 묶기·다른 표시 `E-AUTO-OTHER-BIT`·`null` 표시, 줄여도 매출·통계 줄 수 그대로, 가장 이른 달(대기 병원 뺌). `adminView.rls.test.ts`는 '함수로만' 표 목록에 새 표 둘만 더한다 |
| `src/lib/autoUpload/range.test.ts`·`src/lib/storage/autoUpload.test.ts`·`src/lib/auth/adminSync.test.ts`·`src/lib/errors.test.ts` (TASK-17) | AC-8020.1~4: 11월 24일·12월 1일·1월 1일 기간, 상태 네 모양·색 종류·마우스 글, rpc 이름·인자·쪽 나눔(0·1,000·1,001줄), 오류 셋 글 |
| `src/components/claim/bitLane.test.ts`·`src/components/claim/useBridge.test.ts`·`src/components/dashboard/live/readBitDays.test.ts` (TASK-8) | AC-8021.8: 쥔 쪽 없으면 지금 부르기 차례 그대로, 쥐고 있으면 `stop` 부름 → 놓인 뒤 붙음, 화면이 있으면 `enterBackground`가 `null` |
| `src/components/admin/AdminApplications.test.tsx` (TASK-12) | AC-8022.1: 세 탭 `신청자 · 이메일` 한 칸 두 줄 |
| `src/lib/admin/compare/months.test.ts`·`ComparePickers.test.tsx`·`SalesTable.test.tsx` (TASK-14) | AC-8023.1~3: 첫 달 `null`·10년보다 앞·지난달보다 늦음, 연도 바꿀 때 가까운 달, ◀▶ 막힘, 숫자 있는 곳 합 |
| `src/components/admin/compare/useCompareData.test.tsx` (TASK-15) | AC-8023.4: 가장 이른 달 한 번 읽기·지역 바꿔도 다시 안 읽음·실패 카드 |
| `src/lib/autoUpload/plan.test.ts`·`src/components/autoUpload/runUpload.test.ts`·`AutoUpload.test.tsx`·`src/components/stats/loadPlan.test.ts` (TASK-18) | AC-8021.1~7·9~11: 조건마다 아무것도 안 함(보는 중·쿠키·숨은 탭·15초 전·원장 아님·비트 PC 아님), 할 일 목록(어제 먼저·최근 달 먼저·저장된 날 빼기·새 조각/옛 조각 경계·800일·달째), 그날 두 번째는 서버 읽기만, 잠금·잡음 못 받으면 멈춤, 5분 가짜 시계, 숨기·화면 열기로 끊기, 실패 번호 계속/멈춤, 진행 보고 값, 설정 다 읽기 전 통계 요청 없음, `partSave` 새 규칙(옛 조각 `sunap` 남음·석 달 지켜본 달만 `dropoff`) |
| `src/components/admin/UploadCells.test.tsx`·`AdminApplications.test.tsx` (TASK-19) | AC-8022.2~5: 칸 차례·폭·안내 줄, 채울 기간 바꾸기(한 번 부름·완료 줄 둘·실패 카드), 상태 칸 네 모양, 넷 다 온 뒤 그림 |
| `e2e/adminView.spec.ts` (TASK-16, 사용자가 SQL을 붙인 뒤) | 진짜 Supabase에서 머리 `x-ssk-view`가 REST·RPC에서 먹는지, 보는 중 쓰기가 막히는지, 바구니 파일 받기 — 시험 계정 둘(관리자·다른 승인 의원) |
- 탭마다 '보는 중' 시험(`viewMode.test.tsx`)은 화면 부품을 `ViewingProvider viewing={가짜}` 안에서 그려 '탭마다 읽기만' 표의 단추가 없고 저절로 쓰기 흉내가 불리지 않는지, `viewing={null}`이면 지금과 같은지 본다. 지금 그 탭 시험은 고치지 않고 지나야 한다.

## 위험
- **SQL 먼저**: 이 파일 없이 사이트를 올리면 관리자 탭이 의원 목록을 못 읽어 화면 오류다(관리자만). 보기 쿠키가 아무에게도 없으므로 다른 화면은 그대로다. SQL만 먼저 붙인 동안 옛 사이트도 그대로 돈다(정책을 더하기만, 머리 없으면 아무것도 안 바뀜).
- **요청 머리**: PostgREST는 `request.headers`를 넘긴다(공식 문서). Supabase가 브라우저의 새 머리를 막지 않는지(CORS)는 진짜로 확인해야 한다 → 마지막 TASK의 E2E. 머리가 안 가면 보기가 '안 되는' 쪽(내 의원 그대로)으로 깨진다 — 남의 의원이 섞이지 않는다.
- **새 병원별 표**: 앞으로 `hospital_id` 표를 만드는 migration은 정책 둘을 더해야 한다. 안 하면 보는 중에 그 표가 내 의원 줄을 보인다(그 의원 이름 아래). `ARCHITECTURE.md`에 적고, AC-8002.8 시험이 이 파일 시점의 표를 지킨다 — 다음 migration 명세는 이 시험의 목록을 늘려야 한다.
- **정의자 쓰기·AI 경로**: DB는 정의자 쓰기 함수(AI 리포트 저장·재고 저장 등)에서 보기 상태를 보지 않는다. 보는 중 그 단추는 숨기고 브라우저 거르기가 RPC를 보내지 않지만, 서버 AI 경로(`/api/ai/report` POST 등)를 일부러 부르면 보는 의원 숫자로 만든 리포트가 **내** 의원에 저장될 수 있다(남의 의원 줄은 안 바뀜). 범위 밖으로 두고 사용자에게 알린다.
- **다시 만든 읽기 함수**: 다른 갈래가 같은 함수를 고치면 합칠 때 어긋난다 → 합칠 때 그 함수의 마지막 정의를 다시 옮긴다(시험이 답을 본다).
- **개인정보**: 관리자는 다른 의원 직원의 전화·생일·주소·계좌·급여·파일, 주소록 사이트 비밀번호, 업무일지·수납 메모를 본다(사용자 결정). 본 기록이 남는다. 예약 숫자는 이름·차트 없이 본다.
- **보는 중 화면 오류**: 숨기지 못한 쓰기 단추를 누르면 DB·브라우저가 막아 그 화면의 실패 카드가 뜬다(자료는 안전). 마지막 TASK에서 탭마다 열어 본다.
- **통계 합계 저장과 옛 화면**: 줄 검사(`validate.ts` `exactly()`)는 모르는 열쇠를 거부하고 읽을 때 진 줄을 버린다. 배포 뒤 새 화면이 저장한 줄(새 열쇠 있음)을 **새로 고치지 않은 옛 화면**(의원 PC에 열려 있던 탭)이 읽으면 그 날·달 줄이 빠져 보인다(새로 고치면 그대로). 배포 안내에 "통계 화면을 한 번 새로 고침"을 넣는다. DB·판 번호는 그대로라 SQL은 없다.
- **몇 번까지 받나 합계의 뜻**: 그달 첫 진료한 신환을 그 불러오기의 자료 끝 날(`asOf`)까지 본 값이라, 최근 달은 다음에 다시 불러오면 숫자가 바뀐다(통계 탭 카드도 같은 규칙). 의원마다 첫 처방 묶음 이름이 다를 수 있다.
- **처방별 신환·재진**: 달 줄 `payload.rx`가 그달 `rxVisitSplit`과 같다는 것은 코드 읽기로 안 것이다 — TASK-6 시험이 다르다고 하면 그 TASK 안에서 달 줄 `rxSplit` 열쇠를 더한다(같은 Files).
- **저절로 올리기 — 진료 중 비트 부담**: 그날 처음 열 때 어제 매출(1초쯤)과 최근 몇 달 통계(한 번)를 읽고, 채울 기간이 길면 옛 달을 5분쯤 더 읽는다. 통계 조각 하나의 시간은 잰 적이 없다(어림 1분). 한 번에 한 요청·15초 뒤 시작·비트 화면이 열리면 바로 멈춤·탭이 숨으면 멈춤으로 줄인다. 데스크가 비트가 느리다고 하면 그 의원 채울 기간을 줄이거나(이미 올라온 숫자는 그대로) 알려 달라고 사용자에게 안내한다.
- **두 PC·두 탭**: 같은 의원 원장 계정이 두 비트 PC에서 함께 열면 DB 잡음으로 한 곳만 돈다(7분, 일마다 늘림). 한 요청이 7분을 넘겨 잡음이 풀리면 두 곳이 같은 날을 함께 쓸 수 있으나 upsert라 값은 같고, 늦은 쪽 보고는 무시된다. 같은 PC 두 탭은 `navigator.locks`.
- **열려 있던 옛 화면**: 배포 전에 열어 둔 탭에는 `bitLane`이 없어, 새로 연 탭의 저절로 올리기가 통로를 쥔 동안 그 옛 탭의 비트 화면이 `E-BRIDGE-BUSY`를 볼 수 있다. 옛 탭은 TASK-6 새 열쇠가 든 줄도 버린다(위). 배포 안내에 "의원 PC의 앱 탭을 모두 한 번 새로 고침"을 넣는다.
- **번호 없는 의원**: 요양기관번호를 못 찾은 비트 PC는 표시 `null`로 올리므로 다른 의원 비트 막기가 없다(관리자가 그 PC에서 자기 계정으로 열면 섞일 수 있음). 사용자 결정 '번호 없어도 다 열리게'(precheck TASK-43)를 따른 것.
- **다른 의원 비트 막기**: 처음 올린 비트 PC의 번호를 묶으므로, 첫 올림이 잘못된 PC에서 일어났거나 의원 요양기관번호가 바뀌면 바른 PC가 `E-AUTO-OTHER-BIT`로 막힌다. 화면에서 풀 길은 없고, 그때는 Claude가 그 병원 `bit_mark`를 비우는 SQL 한 줄을 사용자에게 준다.
- **덜 지켜본 '몇 번까지 받나'**: 최근 석 달의 달 `dropoff`는 아직 받는 중인 사람이 빠져 3번 이상 비율이 낮게 나온다(통계 탭과 같은 규칙). 그 달들은 그날 처음 열 때마다 다시 읽고, 석 달이 지나면 굳는다. 처음 값인 지난달 비교도 그렇다.
- **저장 크기**: 10년을 채우면 의원마다 날 줄 3,650개쯤(+ 달 줄 120개). 지금 날 줄 크기로 의원마다 수십 MB까지 될 수 있다(Supabase 무료 500MB). 채울 기간을 길게 잡은 의원이 많아지면 크기를 본다.
- **24달보다 옛 저장된 달**: TASK-6 전에 저장된 옛 달은 다시 읽으면 `after30`·`once`가 비워질 수 있어 합계를 채우지 않는다 — 그 달 Block 전환·몇 번까지 받나는 `–`로 남는다(범위 밖).
- 다른 갈래와 겹칠 수 있는 파일: `CLAUDE.md`·`docs/ADR.md`(번호 046·047)·`docs/ARCHITECTURE.md`·`plan.md`·`src/types/errors.ts`·`src/lib/errors.ts`·`src/components/shell/AppShell.tsx`·`src/app/(app)/layout.tsx`·`src/lib/supabase/browser.ts`·`server.ts`·`src/components/admin/AdminApplications.tsx`·통계 부품. 합칠 때 앞 갈래를 먼저 받고 번호·목록만 맞춘다.

## 물었던 것 (2026-11-24 시안 승인 때 닫음)
- 대표 숫자 → 시안 8개 그대로(건당 진료비 뺌). 나이대·Block 전환율·3번 이상 받은 비율은 사용자 "합계만 저장하게 더하기"로 만든다('통계 합계 저장'). 목표 달성률 = 매출 목표(통계 탭 카드에 중심 목표가 없어 시안을 따름).
- 예약 숫자(이름·차트·메모 없이) → 보는 중·비교에서 보임. 총진료비에 `rough_total` 넣음. 광주·전남 따로(17개). 나란히 보기 = 시안 카드 목록·차례 그대로(휴일에 따라만 12달 — '나란히 보기 칸 표'). 주소록 사이트 비밀번호 → 사용자 "비밀번호도 보이기". 12시간 끝 → 그대로.
- 시안 `notes.md` '사용자에게 물을 것' 16개 → '기본값'에 모두 적음(새로 고침해도 계속 · 더보기 안 탭 보임 · [저장된 숫자 새로고침] 둠(읽기만 확인) · 지역 칸 승인 탭만 · 계정 메뉴에 의원 비교 없음 · 순위 표 이름 눌러도 보기 안 함 · 지난 12달 · 본 기록 최근 30일 · 실수령 · 환자 칸 숨김).
- 2차(저절로 올리기·10년) 물을 것 1~7 → '2차 기본값' 1에 모두 적음.
- 남은 사용자 확인 하나: '휴일에 따라' 칸만 고른 달이 아니라 그 달 끝까지 12달로 센다(한 달 안에는 공휴일이 거의 없어 숫자가 뜻이 없음). 사용자에게 알린다.

## 배포 순서
1. 모두 합친 뒤 전체 검사(ssk-finish-check)·화면 확인·독립 검토 한 번.
2. 사용자: Supabase SQL Editor에 **두 파일을 이 차례로** 붙여 넣고 Run(ssk-supabase-sql) — ① `supabase/migrations/20261124000000_admin_view.sql` 전체 → ② `supabase/migrations/20261124010000_admin_sync.sql` 전체. ②는 ①의 함수(`my_hospital_id()`·`admin_view_hospital_id()`)를 쓰므로 ①이 먼저다. 멈추면 그 글을 Claude에게 알린다. Claude는 실제 Supabase에 붙지 않는다.
3. SQL을 붙인 뒤 E2E `e2e/adminView.spec.ts`를 한 번(머리·쓰기 막기·저절로 올리기 함수 확인, `.env.local` 시험 계정).
4. 웹 배포는 사용자가 말할 때만(ssk-deploy, 운영 갈래 `origin/feat-dashboard-saved`). **SQL 둘 → 웹** 차례(웹이 먼저 올라가면 저절로 올리기 rpc가 없어 그날은 아무것도 안 올라가고, 관리자 화면 승인 표가 읽기 오류다). 도우미·확장 새 판은 없다(지금 0.13.2로 됨).
5. 배포 뒤 의원 PC마다 열려 있던 앱 탭을 한 번 새로 고침('위험' 옛 화면). 채울 기간 처음 값은 모든 의원 `2달`이라 첫날은 9월부터 채운다(관리자가 늘리면 그다음 열기부터).
