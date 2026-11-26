# 작업 분할: 의사랑 엑셀 올리기

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나(각자 git worktree). **같은 Phase는 병렬이고 같은 Phase의 TASK끼리 파일이 겹치지 않는다.** Phase 1은 명세 승인 뒤, Phase 2는 Phase 1을 합친 뒤, Phase 3은 Phase 2를 합친 뒤 시작한다.
> MVP 모드: 중간 검토 없이 Phase 끝마다 그 Phase 시험 파일만 돌리고, 마지막에 전체 검사 → 독립 검토 한 번(재검토는 사용자에게 묻고).
> 화면 글자·자리·모양은 승인된 시안(`docs/mockups/uisarang-upload/index.html`·`notes.md`)과 requirements.md '화면 글자' 그대로다. **폰 전용 모양은 만들지 않는다**(사용자 규칙 2026-11-21) — 새로 쓰는 화면 코드에 `max-md:` 같은 폰 폭 클래스를 쓰지 않는다.
> TDD: 시험을 먼저 쓰고 실패(RED)를 본 뒤 만든다. 시험 이름에 AC ID를 넣는다. 가짜 엑셀은 시험 안에서 만든다(실제 의사랑 파일은 쓰지도 커밋하지도 않는다).
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | DB: 표 `uis_periods` · 출처 `uisarang` · 함수 `admin_uis_rows` SQL + RLS 시험 + ADR-056 · ARCHITECTURE |
> | 1 | TASK-2 | 계약: 타입 · 저장 모양 검사 · 저장 계획 · 의사랑 숫자 셈 · 저장·읽기 함수 · 통계 출처 셋 · E-UIS- 번호 열다섯 |
> | 2 | TASK-3 | 엑셀 읽기(환자 자료 구역): `lib/parsers/uisarang/**` + Worker 셋 |
> | 2 | TASK-4 | 통계 탭 의사랑 칸(안내 · 나이대 · 처방량 탭 · 묶음 찾기 목록) |
> | 2 | TASK-5 | 관리자 의원 비교(읽기 길 · '의사랑' 칩 · 날 숫자 · 칸) |
> | 2 | TASK-6 | 대시보드 의사랑 모양(시작 칸 자리 · 머리 줄 · 처음 날 · 안내) |
> | 3 | TASK-7 | 올리기 칸 `components/uisarang/**` + 대시보드 두 자리 · 통계 탭 한 자리에 놓기 |
>
> - 같은 Phase 파일 겹침 확인: Phase 1 — TASK-1은 `supabase/`·`docs/`, TASK-2는 `src/types/uisarang.ts`·`src/lib/payload/uisarang*`·`src/lib/analytics/uisarang*`·`src/lib/storage/uisarang*`·`src/lib/storage/stats*`·`src/types/db.ts`·`src/lib/errors*`·`src/types/errors.ts` → 겹침 없음. Phase 2 — TASK-3 `src/lib/parsers/uisarang/**`·`src/workers/uisarang.worker.ts`·`src/workers/readUisFiles*`·`src/workers/runUisarang*`, TASK-4 `src/components/stats/uisarang/**`·`src/components/stats/`의 소스 여덟(StatsScreen·useRxCatalog·sections 여섯), TASK-5 `src/lib/storage/adminRows*`·`src/lib/admin/compare/**`·`src/components/admin/compare/**`, TASK-6 `src/components/dashboard/`의 소스 여섯·시험 여섯 → 겹침 없음. Phase 3 — TASK-7 하나.
> - Phase 2의 넷은 서로 부르지 않는다: TASK-4·5·6은 TASK-2의 `lib/analytics/uisarang`·`lib/storage/uisarang`·`lib/storage/stats`만 부르고 TASK-3의 Worker를 부르지 않는다. 올리기 칸이 들어갈 자리는 TASK-4·6이 `null`을 돌려주는 `uisUploadSlot(look)`으로 두고 TASK-7이 채운다.
> - Phase 3의 TASK-7은 Phase 2 파일 두 개(`BitDashboard.tsx`·`StatsScreen.tsx`)의 `uisUploadSlot` 자리만 고친다(Phase가 달라 겹침 아님).
> - 다른 갈래와 겹칠 수 있는 파일: `docs/ADR.md`(번호 056) · `src/lib/errors.ts`·`src/types/errors.ts` · `src/lib/storage/adminRows.ts` · `src/components/stats/StatsScreen.tsx` · `src/components/dashboard/live/BitDashboard.tsx`. 합칠 때 앞 갈래를 먼저 받고 번호·수만 맞춘다.
> - **마무리(TASK 아님, 모두 합친 뒤 한 번)**: 전체 검사(`npm test`·`npm run lint`·`npm run build`·tsc, ssk-finish-check — 이 PC에서 원래 나는 실패는 앞 명세의 known-failures와 견줌) → 화면 확인(ssk-screen-check: 로그인 없는 하네스, 지어낸 숫자, **PC 폭 1440·1024만**, 시안 `?s=dash-empty`·`reading`·`dash-ok`·`dash-missing`·`refused`·`dash-data`·`stats`·`stats-gap`·`admin`과 견줌 — 폰 폭 사진은 찍지 않는다) → 독립 검토 한 번(코드를 주고 결론은 주지 않음). 고칠 것은 위 TASK의 Files 안에서만 고치고, 그 밖이면 명세를 고친 뒤 한다.
> - **사용자 단계**: design.md '배포 순서' — (1) 시안 확인 · `/sdd approve uisarang-upload` (2) 배포 전 `supabase/migrations/20261127000000_uisarang_upload.sql`을 Supabase SQL Editor에 붙여 넣기 (3) 배포 (4) 의사랑 의원 PC에서 design.md §13 '실제 PC에서 볼 것'. Claude는 실제 Supabase에 붙지 않는다. **배포·합치기(운영 갈래)는 사용자가 말할 때만** 한다. 도우미·확장·ERP 마감일지 도우미 새 판은 없다.

## TASK-1: DB — 표 `uis_periods` · 출처 `uisarang` · 함수 `admin_uis_rows` · ADR-056
- Phase: 1
- AC: AC-8801.1, AC-8801.2, AC-8801.3, AC-8801.4, AC-8801.5, AC-8801.6, AC-8801.7
- REQ: REQ-8801
- Files: supabase/migrations/20261127000000_uisarang_upload.sql, supabase/uisarangUpload.rls.test.ts, docs/ADR.md, docs/ARCHITECTURE.md
- Tests: supabase/uisarangUpload.rls.test.ts
- TDD: required — design.md §7 SQL 글 그대로(표·제약 둘·`touch_updated_at` 트리거·RLS → revoke all → 필요한 권한만·정책 셋 + 보는 중 정책 둘·지우기 없음, 출처 제약 둘, `admin_uis_rows`). SQL은 Write 도구로 쓴다(두 번 실행 안전: `create table if not exists` · `drop constraint if exists` 뒤 `add constraint` · `drop policy if exists` 뒤 `create policy` · `drop trigger if exists` · `create or replace function`, 줄 끝 LF, 머리 주석에 무엇·실행·먼저·두 번·웹보다 먼저·`REQ-8801`·`ADR-056`). `admin_rows`·`stats_months`·공용 함수(`my_hospital_id`·`touch_updated_at`·`admin_view_hospital_id`)는 다시 만들지 않는다. 시험은 `supabase/library.rls.test.ts`·`supabase/adminView.rls.test.ts`처럼 PGlite에서 진짜 migration 사슬을 차례로 돌린다(원장 둘·데스크·승인 대기·관리자·로그인 안 함, 메일은 지어낸 것): 넣기·읽기·고치기·`updated_at` 바뀜·지우기 막힘·`hospital_id` 칸 권한 없음, 남의 줄·데스크·대기·anon 0줄, 기간·종류·payload 제약, 출처 `uisarang`(stats_days·stats_coverage 됨 · stats_months 막힘 · `bit`·`file` 그대로 · 그 밖 막힘 · 제약 이름이 `pg_constraint`에 있음), 보는 중 읽기·쓰기 막힘, `admin_uis_rows` 관문(42501·22023·승인만·차례·`clinic_emr` coalesce), SQL 두 번 실행. `docs/ADR.md` 끝에 design.md §12 글만 더한다(지금 ADR 글은 고치지 않음), `docs/ARCHITECTURE.md`는 §12 끝 줄의 세 줄만. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 계약 — 타입 · 저장 모양 · 셈 · 저장 함수 · 출처 셋 · 오류 번호
- Phase: 1
- AC: AC-8805.3, AC-8808.1, AC-8808.2, AC-8808.3, AC-8808.4, AC-8808.5, AC-8808.6, AC-8808.7, AC-8809.1, AC-8809.2, AC-8809.3, AC-8809.4, AC-8809.5, AC-8809.6, AC-8809.7, AC-8814.1, AC-8815.2
- REQ: REQ-8805, REQ-8808, REQ-8809, REQ-8814, REQ-8815
- Files: src/types/uisarang.ts, src/lib/payload/uisarang.ts, src/lib/payload/uisarang.test.ts, src/lib/analytics/uisarang.ts, src/lib/analytics/uisarang.test.ts, src/lib/storage/uisarang.ts, src/lib/storage/uisarang.test.ts, src/lib/storage/stats.ts, src/lib/storage/stats.test.ts, src/types/db.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts
- Tests: src/lib/payload/uisarang.test.ts, src/lib/analytics/uisarang.test.ts, src/lib/storage/uisarang.test.ts, src/lib/storage/stats.test.ts, src/lib/errors.test.ts
- TDD: required — design.md §5 타입(글자 그대로, `UisRefuseCode`가 `ErrorCode` 부분 집합임을 `satisfies` 시험) · §6 저장 모양(`validateUisRxPayload`·`validateUisAgePayload`·`toUisDayPayload`(지금 `validateDayPayload` 통과를 시험)·`planUisSave`) · §8 셈(`tileRx` 표 시험: 똑같은 줄 하나 · 달+주+날 섞임 · 겹치는 주 버림 · 휴진 날 · 오늘·오늘 뒤 빼기 · 모자란 날 차례, `sumRxCodes`·`sumRxGroups`(대소문자·빈칸·`ignored`·그 밖·합계)·`sumAges`·`missingFiles`·`formatQty`·`dayListText` 글자) · §9 저장 함수(가짜 supabase client로 부른 표·칸·`onConflict`·rpc 이름·인자를 그대로 견줌, `saveStats` 출처 `uisarang`·`months: []`, 매출 날마다 `save_revenue_range` · `p_day_codes` null, 실패 줄 번호 모음 · 나머지 계속, 오류에 Supabase 글 없음, 요청 본문 전체에 가짜 환자 글자·파일 이름 없음(AC-8815.2), 소스 글자에 `parsers`·`workers` import 없음) · `stats.ts` 출처 셋(`readDays`·`readCoverage`가 `uisarang` 줄을 남김 · `fromFile`은 `file`만 · `uisarang` + 달 줄 = 보내지 않음, 지금 시험은 그대로 지나야 함) · `types/db.ts` `StatsSourceColumn` 셋. `lib/payload/uisarang.ts`·`lib/analytics/uisarang.ts`는 환자 자료 구역 규칙 안(React·supabase·네트워크·저장소·console 없음). E-UIS- 열다섯의 what·fix는 requirements.md '오류 번호' 표 글자 그대로(끝 마침표 없음), `errors.test.ts`는 번호 수·글자를 본다. `lib/parsers`·`workers`·화면 파일은 고치지 않는다

## TASK-3: 엑셀 읽기 — `lib/parsers/uisarang/**` · Worker 셋 (환자 자료 구역)
- Phase: 2
- AC: AC-8802.1, AC-8802.2, AC-8802.3, AC-8802.4, AC-8802.5, AC-8802.6, AC-8802.7, AC-8802.8, AC-8803.1, AC-8803.2, AC-8803.3, AC-8803.4, AC-8803.5, AC-8803.6, AC-8803.7, AC-8804.1, AC-8804.2, AC-8804.3, AC-8804.4, AC-8804.5, AC-8805.1, AC-8805.2, AC-8805.4, AC-8806.1, AC-8806.2, AC-8806.3, AC-8806.4, AC-8807.1, AC-8807.2, AC-8807.3, AC-8807.4, AC-8807.5, AC-8815.1
- REQ: REQ-8802, REQ-8803, REQ-8804, REQ-8805, REQ-8806, REQ-8807, REQ-8815
- Files: src/lib/parsers/uisarang/**, src/workers/uisarang.worker.ts, src/workers/readUisFiles.ts, src/workers/readUisFiles.test.ts, src/workers/runUisarang.ts, src/workers/runUisarang.test.ts
- Tests: src/lib/parsers/uisarang/kind.test.ts, src/lib/parsers/uisarang/labels.test.ts, src/lib/parsers/uisarang/income.test.ts, src/lib/parsers/uisarang/rx.test.ts, src/lib/parsers/uisarang/visits.test.ts, src/lib/parsers/uisarang/visitPatients.test.ts, src/lib/parsers/uisarang/batch.test.ts, src/workers/readUisFiles.test.ts, src/workers/runUisarang.test.ts, src/guardrails.test.ts
- TDD: required — design.md §3(종류 표 · 머리 줄 30줄 · 라벨 · 조회일 → 기간 · 오류 차례 · 숫자 글자) · §4(종류마다: 일일수입통계 표 그대로 · 처방 합계 맞춤 · 위쪽 표 합계 · 아래쪽 표 나이 규칙) · §5(묶음 · 결과 모양은 TASK-2의 `src/types/uisarang.ts` 그대로, 고치지 않음). 저장 모양은 TASK-2의 `toUisDayPayload`·`validateUis*`를 부른다(고치지 않음). 가짜 엑셀은 `src/lib/parsers/uisarang/testBooks.ts`(시험 전용 · SheetJS `XLSX.write`로 xls(BIFF8)·xlsx·html 바이트 · 라벨 줄 · 되풀이 머리 줄 · 합친 칸 · 합계 줄 · 지어낸 환자 글자)로 만든다. `readGrid`는 `lib/parsers/common.ts`를 그대로 부른다(고치지 않음). Worker 길은 `runAnalysis.ts`·`analyze.worker.ts`와 같은 모양(바이트 transfer · 30초 + 파일마다 3초 · Worker 예외 = E-ANALYZE-FAILED · 파일 하나 예외 = 그 파일 E-UIS-UNREADABLE). 시험: 보낸 메시지에 파일 이름이 없음, 답 JSON에 가짜 이름·차트번호·주민번호·전화·주소 글자가 없음(AC-8807.5), 100개 넘음은 Worker를 만들지 않음. `src/guardrails.test.ts`는 고치지 않고 돌려 새 파일이 울타리 안임을 본다(AC-8815.1, `npm run lint`도). 화면·저장 파일은 고치지 않는다

## TASK-4: 통계 탭 의사랑 칸
- Phase: 2
- AC: AC-8812.1, AC-8812.2, AC-8812.3, AC-8812.4, AC-8812.5, AC-8812.6, AC-8812.7, AC-8812.8, AC-8812.9
- REQ: REQ-8812
- Files: src/components/stats/uisarang/**, src/components/stats/StatsScreen.tsx, src/components/stats/useRxCatalog.ts, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/RxSection.tsx, src/components/stats/sections/PeriodSummary.tsx, src/components/stats/sections/SunapSection.tsx, src/components/stats/sections/RevenueSection.tsx, src/components/stats/sections/ReportSection.tsx
- Tests: src/components/stats/uisarang/UisStats.test.tsx, src/components/stats/uisarang/UisAgeSection.test.tsx, src/components/stats/uisarang/UisRxSection.test.tsx, src/components/stats/uisarang/useUisPeriods.test.ts, src/components/stats/StatsScreen.test.tsx, src/components/stats/useRxCatalog.test.ts
- TDD: required — design.md §10-3, requirements.md '화면 글자' 통계 탭·셀 수 없음 안내 표 글자·자리 그대로(**시안 `?s=stats`·`?s=stats-gap`을 열어 견준다**). 새 칸(`UisAgeSection`·`UisRxSection`·`UisNote`·`useUisPeriods`)은 `src/components/stats/uisarang/`에 두고, 지금 섹션 파일은 `uis` 값(StatsSections가 이미 부르는 `useClinicProfile` emr)을 받아 자리만 바꾼다. 셈은 TASK-2의 `lib/analytics/uisarang`(`tileRx`·`sumRxCodes`·`sumRxGroups`·`sumAges`·`formatQty`·`dayListText`), 읽기는 `lib/storage/uisarang` `readUisPeriods`를 흉내 내 시험한다(고치지 않음). `StatsScreen`: `SOURCE_NAME.uisarang = '의사랑 엑셀'`, 의사랑이면 `SourcePicker` 대신 `uisUploadSlot(look)`(이 TASK에서는 `null`을 돌려주는 함수 — TASK-7이 채움), 빈 글 둘. [묶음 고치기]는 `TreatmentGroupEditor`를 고치지 않고 `lines`(의사랑 코드)·`counts`(빈 Map)만 다르게 넘긴다. 비트 의원 화면이 그대로임을 지금 시험(`StatsScreen.test.tsx`·`useRxCatalog.test.ts`)이 그대로 지나 증명하고, 새 시험(`UisStats.test.tsx`)이 같은 화면을 `emr: 'bit'`으로도 그려 안내 글이 없음을 본다. 폰 폭 클래스 없음. `lib/**`·`components/uisarang/**`·`TreatmentGroupEditor.tsx`는 고치지 않는다

## TASK-5: 관리자 의원 비교 — 읽기 길 · '의사랑' 칩 · 날 숫자 · 칸
- Phase: 2
- AC: AC-8813.1, AC-8813.2, AC-8813.3, AC-8813.4, AC-8813.5, AC-8813.6
- REQ: REQ-8813
- Files: src/lib/storage/adminRows.ts, src/lib/storage/adminRows.test.ts, src/lib/admin/compare/**, src/components/admin/compare/**
- Tests: src/lib/storage/adminRows.test.ts, src/lib/admin/compare/load.test.ts, src/lib/admin/compare/rank.test.ts, src/lib/admin/compare/sales.test.ts, src/components/admin/compare/RankTable.test.tsx, src/components/admin/compare/CompareCells.test.tsx, src/components/admin/compare/statsInput.test.ts, src/components/admin/compare/useCompareData.test.tsx
- TDD: required — design.md §10-4, requirements.md '화면 글자' 관리자 의원 비교 글자 그대로(**시안 `?s=admin`과 견준다**). `ADMIN_ROW_KINDS` 스물(새 둘은 `admin_uis_rows`, 가짜 client로 부른 함수 이름·인자를 견줌 · 나머지 열여덟은 그대로 `admin_rows`), `COMPARE_KINDS`에 둘, 출처 거르기(`rank.ts`·`statsInput.ts`)에 `uisarang`. 의사랑 의원의 내원 수·신환·재진·하루 평균은 stats_days 날 숫자, 총진료비는 sales_days, 나이대·처방량은 TASK-2의 `sumAges`·`tileRx`·`sumRxGroups`·`formatQty`(고치지 않음). 칩 `의사랑`(`ds.chip.neutral`)은 `내 의원` 다음·지역 앞, 표 아래 줄은 의사랑 의원이 있을 때만. 비트 의원 줄·칸이 그대로임을 지금 시험이 그대로 지나 증명한다(수를 고정한 시험은 종류 수 18 → 20만 맞춘다). 폰 폭 클래스 없음

## TASK-6: 대시보드 의사랑 모양
- Phase: 2
- AC: AC-8811.1, AC-8811.2, AC-8811.3, AC-8811.4, AC-8811.5, AC-8811.6, AC-8811.7
- REQ: REQ-8811
- Files: src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/ReadStatus.tsx, src/components/dashboard/live/uisDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/summary/DailySection.tsx, src/components/dashboard/summary/FlowSection.tsx, src/components/dashboard/summary/ReportBlock.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx
- Tests: src/components/dashboard/live/uisDashboard.test.tsx, src/components/dashboard/live/BitDashboard.test.tsx, src/components/dashboard/briefing/DashboardHome.test.tsx, src/components/dashboard/summary/ReportBlock.test.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx
- TDD: required — design.md §10-2, requirements.md '화면 글자' 대시보드·셀 수 없음 안내 글자 그대로(**시안 `?s=dash-empty`·`?s=dash-data`와 견준다**). `BitDashboard`: 의사랑(`clinic.state === 'ready' && emr === 'uisarang'`)이면 비트 읽기 효과를 돌리지 않음(가짜 `chrome.runtime`이 있어도 부르지 않음을 시험) · 처음 날 = 오늘 이하 가장 늦은 저장된 날 · `StatusHeader` 의사랑 모양(칩·시각 글·[저장된 숫자 새로고침]만) · 그 아래 `uisUploadSlot('folded')` 자리(이 TASK에서는 `null` — TASK-7이 채움). `DashboardHome`: 의사랑 · `report === null`이면 시작 칸(`uisUpload` prop 자리), 보는 중이면 '보는 중 · 숫자 없음' 글. `DailySection`·`FlowSection`·`ReportBlock`은 `uis` 값을 받아 칸·안내·빈 글만 바꾼다. `LiveDashboard`는 마지막 저장 날을 넘기는 것만 고친다(읽기 한 곳 그대로). 비트·이지스·그 밖 의원 화면이 그대로임을 지금 시험이 그대로 지나 증명한다. 폰 폭 클래스를 새로 쓰지 않는다(지금 줄의 클래스는 그대로). `lib/**`·`components/uisarang/**`·`app/(app)/dashboard/page.tsx`는 고치지 않는다

## TASK-7: 올리기 칸 · 세 자리에 놓기
- Phase: 3
- AC: AC-8810.1, AC-8810.2, AC-8810.3, AC-8810.4, AC-8810.5, AC-8810.6, AC-8810.7, AC-8810.8, AC-8810.9, AC-8810.10, AC-8811.1, AC-8812.1, AC-8814.2, AC-8815.3
- REQ: REQ-8810, REQ-8811, REQ-8812, REQ-8814, REQ-8815
- Files: src/components/uisarang/**, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/uisDashboard.test.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/uisarang/UisUpload.test.tsx, src/components/uisarang/UisResult.test.tsx, src/components/uisarang/useUisUpload.test.ts, src/components/uisarang/spanText.test.ts, src/components/uisarang/placement.test.tsx, src/components/dashboard/live/uisDashboard.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — design.md §10-1, requirements.md '화면 글자' 올리기 칸(펼침·접음)·읽는 중·결과·아직 없는 파일·오류 카드 detail 글자 그대로(**시안 `?s=dash-empty`·`reading`·`dash-ok`·`dash-missing`·`refused`·`dash-data`·`stats`를 열어 상태마다 견준다**). `runUisarang`(TASK-3)·`planUisSave`·`saveUisPlan`·`readUisHave`·`missingFiles`(TASK-2)를 흉내 내 흐름(읽는 중 → 저장 중 → 결과)·[다시 저장](다시 읽지 않고 실패한 번호만)·`onSaved` 한 번을 시험한다(그 파일들은 고치지 않음). 파일 이름은 결과 줄에만 있고 `runUisarang`에 넘긴 값·저장 함수 인자에 없음을 시험(AC-8810.8), 소스 글자에 `lib/parsers` import·`localStorage`·`sessionStorage`·`indexedDB`가 없음(AC-8815.3). 보는 중(`ViewingProvider`)·`emr !== 'uisarang'`이면 칸이 없음. 놓기: `BitDashboard.tsx`에서 `useUisUpload()`를 한 번 불러(시작 칸 → 숫자 화면으로 바뀌어도 결과가 남게, AC-8810.10) 그 상태를 `uisUploadSlot`과 `DashboardHome`에 넘기는 `uisUpload` 두 모양에 함께 주고, `StatsScreen.tsx`의 `uisUploadSlot`만 채운다(다른 줄은 고치지 않음 — `placement.test.tsx`·`uisDashboard.test.tsx`·`StatsScreen.test.tsx`가 자리를 본다). 표·상자 감싸개 `overflow-x: auto`, 폰 폭 클래스 없음
