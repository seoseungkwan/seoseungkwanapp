# 설계: 환자 탭 (F/U 명단 · 정기 주사 문자 명단 · 문자 문구)

## 개요
- 탭 [환자](`/patients`)의 준비 중 화면을 진짜 화면으로 바꾼다. 맨 위 도구 단추 줄에 도구 셋: **F/U 명단** · **정기 주사 문자 명단** · **문자 문구**.
- 명단 자료는 청구 사전점검과 같은 길로 온다: 도우미(비트 83·47 표) → 확장 → `lib/bridge`(풀지 않음) → Worker(`workers/patients.worker.ts`) → 화면 메모리. 계산은 원본 양지바른의 JS를 옮긴 `lib/patients/`(환자 자료 구역)에서 하고 골든 시험으로 원본과 견준다.
- 연락 표시와 정기 주사 기록(원본처럼 달마다 쌓는 36개월 기록)은 도우미가 그 PC의 `contact.dat`에 DPAPI로 암호화해 둔다. 서버에는 문자 문구(`message_templates`)와 남은 건수 정수 둘(`contact_counts`)만 간다.
- 휴대폰·확장 없는 브라우저: 명단 대신 남은 건수만. 문자 문구는 어디서나 고친다.
- 청구 사전점검 명세(`specs/precheck`) Phase 5(REQ-023~026, TASK-23~26, `phases/precheck-5-contact`)를 이 명세로 옮겨 왔다. `specs/precheck`·`phases/precheck-*`는 이 브랜치에서 고치지 않는다(그 브랜치 몫).

## 옮겨 온 것 (precheck → patients)

| precheck | patients | 바뀐 점 |
|---|---|---|
| REQ-023 · TASK-23 `followup-read` | REQ-605 · TASK-9 `contact-read` | 한 번에 31일 이하만 읽는다(웹이 달 조각으로 부른다). 줄 한도는 표마다 300,000줄(원본 `TreatmentUsage.MaximumRows`). 50,000건은 정기 주사 기록 한도(원본 `MAX_RECORDS`)라 Worker 쪽 규칙으로 옮김. 비트 표 읽기 부품은 precheck TASK-8 것을 쓴다 |
| REQ-024 · TASK-24 `followup-logic` | REQ-602 · TASK-2, REQ-603 · TASK-3 | F/U와 정기 주사를 두 TASK로 나눔. 원본 `prepareSchedule`·`preparePhones`·`pasteRows`·`ingest`·`coverageNote`·[명단 복사]·[번호 복사]를 더함(원본 문자 명단의 핵심). 폴더 `lib/precheck/followup` → `lib/patients` |
| REQ-025 · TASK-25 `message-templates` | REQ-608 · TASK-6, REQ-609 · TASK-7, REQ-613 · TASK-13 | 문구 편집은 설정 화면(`/settings`, 아직 없음)이 아니라 환자 탭의 [문자 문구] 도구에 둔다. 저장 함수는 `lib/storage/claimSettings.ts` 대신 새 파일 `lib/storage/messageTemplates.ts` |
| REQ-026 · TASK-26 `contact-screen` | REQ-601·604·610·611·612·614 · TASK-1·4·10·11·12·14 | `/contact` → `/patients`, `components/contact` → `components/patients`. [환자 연락] 탭을 새로 만들지 않고 이미 있는 [환자] 탭을 채운다. 연락 저장(`contact.dat`, precheck TASK-15 몫이던 것 중 연락 부분)은 REQ-606 · TASK-8 |
| design.md 8-1 `message_templates`, 8-2 `contact_counts` | REQ-607 · TASK-5 | 두 표만 먼저 만든다. `my_hospital_id()`·`touch_updated_at()`는 `create or replace`로 |

### precheck가 나중에 할 일 (이 명세가 합쳐진 뒤, precheck 브랜치에서)
- `specs/precheck/requirements.md`에서 REQ-023~026, `tasks.md`에서 TASK-23~26을 빼고 "환자 탭(`specs/patients`)으로 옮김"을 적는다. `phases/precheck-5-contact/`와 `phases/index.json`의 그 줄을 지운다. `docs/precheck/plan.md` §6 Phase 5를 같은 뜻으로 고친다
- `20261030000000_precheck_settings.sql`에서 `message_templates`를 빼고, `my_hospital_id()`·`touch_updated_at()`는 cross-branch 규칙 C1의 글 그대로(`create or replace`, 같은 몸통·권한)로 바꾼다. `20261030000100_precheck_counts.sql`에서 `contact_counts`를 뺀다
- precheck TASK-15(작업 저장): `store.load`·`store.save` 처리기를 만들 때 이 명세의 `ContactStore`를 그대로 불러 `contact` 칸을 맡기고, `Program.cs`의 `ContactCommands.RegisterStore` 한 줄을 지운다(아래 '도우미 저장')
- precheck TASK-15·17(작업 저장·자동 입력의 '한 번에 하나', precheck AC-017.10): 같은 뮤텍스 이름 `Local\SeoseungkwanPrecheckHelper.Work`를 이 명세의 `helper/src/Precheck.Core/Contact/NamedWorkLock.cs`(`IWorkLock`)가 이미 쓴다. 두 번째 뮤텍스 부품을 만들지 말고 이것을 쓰거나 공용 자리로 옮긴다
- 오류 번호: precheck가 자기 화면에 쓸 `E-SETTINGS-FAILED`·`E-COUNTS-FAILED`·`E-BIT-EXPORT-FAILED`는 precheck가 더한다. 이 명세는 `E-PATIENTS-*`만 더한다(규칙 C3). `E-BIT-EXPORT-FAILED`는 precheck TASK-8이 main에 더한 뒤 도우미 답에서 그대로 쓴다
- precheck TASK-9(조각 모으기): `src/workers/patients/assemble.ts`와 같은 일이면 하나로 합쳐도 된다
- precheck TASK-19(밖에서 보는 건수): 연락 남은 건수 칸은 `lib/storage/contactCounts.ts`의 `readContactCount`를 쓴다
- precheck TASK-31(보고 문장 복사): `components/patients/CopyButton.tsx`를 쓴다
- REQ-032(백업): `message_templates` 표 이름은 그대로다

## main에 있는 것 · 없는 것 (2026-11-01, `origin/main` 95cfa53에서 확인)
- 있다: 도우미 Phase 1(메시지 틀·명령 표·`Chunker`·등록·`RequireHospital`·`IProtector`·`DpapiProtector`·`DiagnosticLog`), `src/lib/bridge/commands.json`(이미 `contact.targets {kind, from, to}` 1,100일, `store.load {contact}`, `store.save {payload: {contact}}`가 있다 — 확장도 이 표로 검사하므로 **표를 바꾸지 않는다**), `lib/bridge/workerSink.ts`(`connectScreenBridge`, 포트 `chunk`·`end`·`abort`·`send`·`sent`), `components/claim/useBridge.ts`, `lib/analytics/dates.ts`, `components/auth/CopyStatus.tsx`(`useCopy`), PGlite RLS 시험 방식(`supabase/rls.test.ts`)
- 없다(이 명세가 만든다): `lib/patients/`, `workers/patients*`, 조각 모으기(Worker 쪽), `store.load`·`store.save` 처리기와 `contact.dat`, `contact.targets` 처리기, `message_templates`·`contact_counts`·`my_hospital_id()`, `lib/storage/`, `components/patients/CopyButton.tsx`·`ToolRow.tsx`, 화면 줄 울타리(`components/*/rows`), `scripts/patients/golden/`, `fixtures/patients/`, 오류 번호 `E-PATIENTS-TEMPLATES-READ`·`E-PATIENTS-TEMPLATES-SAVE`·`E-PATIENTS-COUNTS-READ`·`E-PATIENTS-COUNTS-SAVE`·`E-PATIENTS-SOURCE`, 환자 탭 E2E
- 없고 **이 명세가 만들지 않는다**: 비트 통계 화면 표 읽기(`VendorGridExport`·`GridReader`·`GridRows`, precheck TASK-8). 지금 `wt-precheck`에서 만드는 중이다(커밋 전 시험 `GridReader.test.cs`·`GridRows.test.cs`, `GridRows.Columns("83")` = 내원번호·차트번호·환자명·증상·기록날짜). 다시 옮기면 같은 원본(`NativeReportAdapter.cs` 549줄)을 두 번 옮기고 합칠 때 부딪힌다. 그래서 TASK-9는 그 부품이 main에 있어야 시작한다('사용자에게 물을 것' 1)

## 구성 요소 / 인터페이스

### 폴더 (새 파일)
```
src/lib/patients/            [환자 구역] 원본 계산 옮김
  followup.ts                parseFU·writtenDate·aragan·visitKind·extractTx·extractSite·prepareSchedule·preparePhones·phoneColumn·phoneTokens·scheduleRows·undecidedRows·pasteRows
  recall.ts                  RECALL_DEFAULTS·roundTest·ingestRecall·recallCompute·recallSelect·recallStatus·recallCoverage·recallCopyLines·recallPhones·prepareRx
  sourceError.ts             PatientsSourceError(code 'E-PATIENTS-SOURCE')
src/lib/patientMessages/fill.ts     fillTemplate·defaultSendDate (환자 정보 없음, 구역 밖)
src/lib/patientMessages/defaults.ts DEFAULT_TEMPLATES
src/lib/storage/messageTemplates.ts · contactCounts.ts   브라우저 → Supabase
src/types/patients.ts        보기 모양·Worker 메시지 타입
src/workers/patients.worker.ts            Worker 입구(메시지 받기만)
src/workers/patients/assemble.ts · plan.ts · jobs.ts      조각 모으기·읽을 조각 정하기·보기 모양/건수/저장 글자
src/components/patients/ToolRow.tsx         도구 단추 줄(기능 폴더에 둔다, 규칙 C6)
src/components/patients/CopyButton.tsx      복사 단추 + 결과 줄(기능 폴더, 규칙 C6)
src/components/patients/                  PatientsEntry·PatientsScreen·FollowupTool·RecallTool·MessagesTool·CountsOnly·usePatientsWorker·useCountsUpload
src/components/patients/rows/             [울타리] FollowupRows·RecallRows (props로만)
helper/src/Precheck.Core/Contact/         ContactColumns·ContactTargets·ContactStore·ContactCommands
helper/tests/Precheck.Core.Tests/Contact/ helper/tests/contact-read.dotnet.test.ts · contact-store.dotnet.test.ts
supabase/migrations/20261101000300_patients.sql · supabase/patients.rls.test.ts
scripts/patients/golden/      원본 결과 만들기(원본은 저장소 밖 YANGJI_SRC)
fixtures/patients/            가짜 자료 생성기·가짜 조각·골든 결과
```

### 도우미 `contact.targets` 답 모양 (TASK-9가 만들고 TASK-4가 읽는다)
```jsonc
{ "v": 1, "kind": "followup" | "injection", "from": "YYYY-MM-DD", "to": "YYYY-MM-DD",
  "chart": [["내원번호","차트번호","환자명","증상","기록날짜"], ["V0001","900001","가상환자01","무릎 통증 / 1주 뒤 f/u","2026-10-01"], …],
  "rx":    [["차트번호","휴대폰"], ["900001","010-0000-0001"], …]                                   // followup
        // [["처방코드","차트번호","처방일자","휴대폰"], ["A49","900001","2026-10-01","010-0000-0001"], …] // injection
}
```
- 칸 값은 비트 화면 표시 글자 그대로(`GridReader`가 읽는 값). 날짜 칸 모양 맞추기는 Worker가 원본 `dateKey`로 한다
- `chart`: precheck `GridRows.From("83", …)`의 칸 다섯 그대로
- `rx`: `ContactColumns.Rx(kind, header, rows)` — 원본 `prepareRx`의 `headerFor(["처방코드","차트번호","처방일자"])`(공백 지우고 포함, 같은 이름 두 칸이면 오류)와 `phoneColumn` 정규식으로 칸을 고른다. F/U는 처방 칸을 버린다. 남긴 칸이 같은 줄은 한 번만(처음 순서 유지)
- 31일 이하·오늘 이하만 받는다. 웹이 달 조각으로 여러 번 부른다(진행 표시·작은 답·실패하면 거기서 멈춤)

### 도우미 저장 `contact.dat` (TASK-8)
- `store.save {payload: {contact: {...}}}` · `store.load {contact: true}`만 받는다. 파일 머리 `PRECHECK-STORE-1\n` + `IProtector.Protect`(DPAPI CurrentUser) 바이트. 안쪽 JSON `{ "profileId": "…", "contact": {…} }`
- `ContactStore`(Core): `Load(profileId) → string /* contact JSON, 없으면 "{}" */`, `Save(profileId, contactJson)`. 임시 파일 → `File.Replace`(`.bak` 하나), 깨짐 → `.bak`, 둘 다 깨짐 → `E-STORE-BROKEN`(깨진 파일 이름 바꿔 남김)
- `ContactCommands.RegisterStore(dispatcher, services)`: 등록 확인(`HospitalGate`) → `ContactStore`. `contact` 밖의 칸(명령 표의 `store.save` payload `month`·`drafts`·`done`·`journal`·`settings`, `store.load`의 `months`·`settings`)은 무엇이든 `E-HELPER-BAD-MESSAGE`. `store.save`는 작업 뮤텍스(5초) 안에서만
- precheck TASK-15가 청구 작업 저장을 만들면 그 처리기가 `contact` 칸을 `ContactStore`에 맡기고 이 등록 줄을 지운다

### `contact` 안쪽 모양 (Worker가 만들고 읽는다, 도우미는 풀어 보지 않고 객체인지·크기만 본다)
```ts
type ContactStoreData = {
  v: 1
  marks: Record<string /* 줄 열쇠 */, string /* 연락한 날 YYYY-MM-DD */>   // 정리 규칙은 아래
  recall: { from: string | null; readThrough: string | null /* 마지막으로 읽은 날 */; records: RecallRecord[] }
}
type RecallRecord = { chart: string; name: string; date: string; codes: string[]; text: string; phone: string }  // 원본 ingest 모양 그대로
```
- 연락 표시 정리(AC-604.6·604.7): 저장할 때 그 종류의 보기 모양을 만들었으면, 지금 보기 모양에 열쇠가 있는 표시는 **날짜와 상관없이** 남기고(연락한 뒤 다시 오지 않은 정기 주사 환자가 '미연락'으로 돌아와 `injection_left`에 다시 들어가지 않게), 열쇠가 보기 모양에 없거나 열쇠의 날짜가 읽는 범위(F/U 최근 120일, 정기 주사 기록 36개월) 밖인 표시만 뺀다. 보기 모양을 못 만든 종류(읽기 실패)의 표시는 건드리지 않는다. 날짜만으로(예: 180일) 지우지 않는다
- 줄 열쇠: F/U `f|<내원번호>|<차트번호>|<다음 날짜>`, 정기 주사 `r|<규칙 id>|<차트번호>|<다음 예정일>`. 새로 진료하거나 주사하면 열쇠가 바뀌어 표시가 저절로 풀린다. 열쇠는 메모리·`contact.dat`에만 있고 주소·서버로 가지 않는다

### 계산 모양 (`src/types/patients.ts`)
```ts
export type FollowupRow = { key: string; chart: string; name: string; phone: string; lastVisit: string; next: string /* YYYY-MM-DD */; nextLabel: string /* 원본 dateStr */; plan: '예정' | '조건부'; visitKind: '주사' | 'F/U'; site: string; tx: string; evidence: string; contacted: boolean }
export type UndecidedRow = { key: string; chart: string; name: string; phone: string; lastVisit: string; nextLabel: string; evidence: string }
export type FollowupView = { read: { from: string; to: string }; base: string /* 원본 baseDate */; rows: FollowupRow[]; undecided: UndecidedRow[]; phoneLoaded: boolean }
export type RecallRow = { key: string; ruleId: string; label: string; months: number; chart: string; name: string; phone: string; last: string; due: string; status: string; evidence: string; contacted: boolean }
export type RecallCoverage = { records: number; from: string | null; short: { label: string; months: number }[] }
export type RecallView = { rows: RecallRow[]; coverage: RecallCoverage }
export type ContactCount = { followup_left: number; injection_left: number }
```
- 화면 고르기(기간·조건부·지난 예정·구분)는 다시 읽지 않는다. 화면이 `filter` 메시지로 고른 값을 보내면 Worker가 `lib/patients`의 원본 옮김(`scheduleRows`·`passFilters`·`recallSelect`)으로 거른 줄과 그 줄의 복사 글을 돌려준다(원본과 같은 결과를 한 곳에서, 화면은 거르지 않는다)

### Worker 메시지 약속 (`workers/patients.worker.ts`, TASK-4)
- 통로 포트(`{type: 'bridge-port'}`로 받음): `chunk`·`end`·`abort`를 `assemble`에 넣고, `{type: 'send', ticket, cmd: 'store.save', payload}`를 보내고 `{type: 'sent', ticket, ok, code?}`를 받는다
- 화면 → Worker
  - `{type: 'plan', today}` → `{type: 'plan', followup: Range[], recall: Range[] | null /* store.load 전이면 null */}`
  - `{type: 'piece', id, kind, from, to}`(화면이 `stream('contact.targets', …)`이 끝난 뒤 그 `id`를 알림) → `{type: 'piece', id, ok, code?}`
  - `{type: 'stored', id}`(`stream('store.load', {contact: true})`의 `id`) → `{type: 'stored', ok, code?, recall: Range[]}`
  - `{type: 'build', today}` → `{type: 'views', followup: FollowupView | null, recall: RecallView | null, counts: ContactCount | null, code?}` (정기 주사 조각을 합치면 Worker가 `store.save`로 기록을 저장한 뒤 보낸다)
  - `{type: 'filter', tool, filters}` → `{type: 'filtered', tool, rows, copy: {list: string, phones?: string, missingPhones?: number}}`
  - `{type: 'mark', key, on, today}` → `{type: 'marked', key, ok, code?, counts}` + 바뀐 `views`
- 화면은 조각·보낼 글자를 받지 않는다(AC-604.4). Worker 밖으로 나가는 환자 자료는 보기 모양과 복사 글뿐이다

### 서버 표 (`supabase/migrations/20261101000300_patients.sql`, TASK-5)
```sql
-- cross-branch 규칙 C1 글 그대로(업무일지·통계·매출·precheck가 같은 글을 쓴다)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;
-- definer 없음(C1)
create or replace function public.touch_updated_at() returns trigger language plpgsql set search_path = '' as $$ begin new.updated_at = now(); return new; end $$;
create table if not exists public.message_templates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('injection', 'followup')),
  name text not null check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 2000),
  sort_order int not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now());
create table if not exists public.contact_counts (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  followup_left int not null check (followup_left between 0 and 100000),
  injection_left int not null check (injection_left between 0 and 100000),
  updated_at timestamptz not null default now());
-- RLS 켜기 → revoke all from anon, authenticated → grant select · insert(칸) · update(칸) [· delete] to authenticated
-- 정책: using/with check (hospital_id = (select public.my_hospital_id())). update 트리거 touch_updated_at
```
- `hospitals` 칸 이름(`owner_id`·`status`)은 `20261028000000_auth.sql`에 맞춘다(TASK-5 시작 때 확인)
- 정책·트리거는 `drop … if exists` 뒤 만든다(두 번 실행해도 됨, AC-607.4)
- 실제 Supabase에 붙여 넣는 것은 **그때 사용자 OK를 받고** 운영자가 SQL 편집기로 한다(auth와 같은 방식). 붙이기 전에는 표가 없어 문구 읽기·건수 읽기가 `E-PATIENTS-TEMPLATES-READ`·`E-PATIENTS-COUNTS-READ`로 실패한다. 화면은 그때 기본 문구로 대신하지 않고 오류 카드 + [다시 불러오기]를 보이며, 읽기가 될 때까지 문구 저장·복사를 열지 않는다(읽기 실패 뒤 기본 문구를 `before = []`로 저장하면 서버 줄과 겹친다, AC-613.6). 명단(비트 PC)은 건수 올리기만 실패하고 그대로 쓴다

### 화면 (내용만, 배치·문구는 목업 승인본)
| 도구 | PC(연결됨) | 휴대폰·확장 없음 | 상태 |
|---|---|---|---|
| F/U 명단 | 기간(내일·이번 주·다음 주·직접) · 조건부 포함 · 지난 예정 포함 · 구분 · 명단(이름·전화·마지막 진료·다음 날짜·구분·근거·연락함) · 날짜 미정 명단 · [명단 복사] · [문구 복사] | F/U 남은 수 + 바뀐 시각 | 불러오는 중(n/전체) · 대상 없음 · 오류 번호 + [다시 불러오기] |
| 정기 주사 문자 명단 | 기간(오늘~30일 뒤) · 지난 예정 포함 · 명단(종류·이름·전화·마지막 주사·다음 예정일·상태·근거·연락함) · 쌓인 기록 안내 · [명단 복사] · [번호 복사] · [문구 복사] | 정기 주사 남은 수 + 바뀐 시각 | 같음 + 처음 읽기 달 진행 |
| 문자 문구 | 문구 목록(주사 안내·진료 안내) · 내원 날짜(처음 내일) · 미리 보기 · 더하기·고치기·지우기·위·아래 · [저장] · [문구 복사] | 같음 | 저장 실패(값 유지 + [다시 저장]) |
- 연결 안 됨(도우미 없음·업데이트·끊김): 명단 도구 자리에 비트 PC 연결 안내 + [비트 PC 연결](`/claim/setup`). 다른 창에서 작업 중: 안내 + [건수만 보기]
- 탭에 들어오면(연결된 PC) 두 명단을 차례로 불러 둔다(F/U 먼저). 도구를 바꿔도 다시 읽지 않는다. 건수는 둘 다 온 뒤 올린다(AC-614.1)
- 모양은 `docs/UI_GUIDE.md`·`components/ui/classes.ts`의 `ds`와 토큰만(새 색·크기 없음). 도구 단추 줄 모양은 목업 승인 뒤 UI_GUIDE에 한 절로 적는다(TASK-10)
- **목업**: 이 탭의 클릭 목업(PC·휴대폰, 도구 셋, 상태)을 Phase 4 전에 사용자에게 승인받는다. 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8 '환자 연락'·화면 11)은 탭 틀·ui-90 개편 전 것이라 내용 참고만이다. 승인본은 `docs/mockups/patients/`에 둔다

## 데이터 흐름
```
[비트 PC, 환자 탭 열기]
 화면 ─stream('store.load',{contact:true})→ 통로 ─조각→ Worker(assemble) ── 연락 표시·정기 주사 기록
 화면 ─plan→ Worker ─조각 목록→ 화면 ─stream('contact.targets',{kind,from,to}) × n→ 통로 ─조각→ Worker
 화면 ─build→ Worker: lib/patients 계산 → (정기 주사 기록 바뀜) store.save 글자 ─포트→ 통로 → 도우미 contact.dat
                    → views·counts → 화면(메모리만) → rows가 그림
 화면 ─counts(정수 둘)→ lib/storage/contactCounts → Supabase contact_counts
[연락함] 화면 ─mark→ Worker → store.save 글자 ─포트→ 도우미 → sent → Worker → marked·views·counts → 화면 → (바뀌면) upsert
[문자 문구] 화면 ↔ lib/storage/messageTemplates ↔ Supabase message_templates; fillTemplate → 클립보드
[휴대폰] 화면 → readContactCount → 남은 수 두 개 + 바뀐 시각 (명단 없음)
```

## 결정과 트레이드오프
- **비트 표 읽기 부품은 precheck TASK-8 것을 쓴다**: 같은 원본을 두 번 옮기지 않는다. 대가: TASK-9는 그것이 main에 합쳐질 때까지 기다린다. 그래서 도우미 Phase를 셋째(Phase 3)로 미루고, 그 안에서도 선행 작업이 없는 저장(TASK-8 `contact-store`)을 먼저, 표 읽기(TASK-9 `contact-read`)를 뒤에 둔다. Phase 1·2·4는 도우미 없이 가짜 조각·가짜 통로로 다 시험한다
- **정기 주사 기록은 PC에 쌓는다(원본과 같음, Claude 판단 (기본값))**: 36개월을 매번 비트 통계 화면으로 읽으면 몇 분 이상 걸릴 수 있다(47 표만 수십만 줄). 원본처럼 한 번 읽은 달은 `contact.dat`에 쌓고 마지막 달부터만 다시 읽는다. 대가: 환자 기록(차트번호·이름·날짜·처방코드·증상 한 줄·전화)이 그 PC에 암호화돼 남는다. ADR-020은 '연락 표시'까지만 적었으므로 TASK-8이 `docs/ADR.md` ADR-020에 보충을 단다: 담는 것(연락 표시 + 정기 주사 기록), DPAPI CurrentUser, 36개월·50,000건 한도, 다른 등록 프로필의 파일은 읽지 않음, `.bak`·깨진 파일은 지우지 않고 남김. CLAUDE.md CRITICAL 줄('고치던 메모·완료 표시는 도우미가 그 PC에 암호화해 둔다')에 같은 뜻을 더할지는 사용자에게 따로 알린다(이 명세는 CLAUDE.md를 고치지 않는다)
- **처음 읽는 기간**: 켠 규칙 중 가장 긴 간격 + 1개월(기본 7개월, 원본 안내와 같음). 그보다 오래전 주사는 쌓인 기록 안내로 알린다
- **F/U는 쌓지 않는다**: 최근 120일을 31일 조각 넷으로 그때그때 읽는다(원본 F/U도 쌓지 않음). 느리면 의원 PC 시험에서 재고 조각 수를 줄인다(위험)
- **도우미는 칸만 고르고 계산하지 않는다**: 원본 계산은 JS라 웹 쪽에서 원본과 같은 입력(표 줄)으로 골든 시험을 할 수 있다. 도우미는 83·47 표의 필요한 칸만 남겨 보낸다(주소·주민번호·금액 같은 칸은 보내지 않는다)
- **명령 표(`commands.json`)를 바꾸지 않는다**: 확장이 같은 표로 검사하고, 바꾸면 크롬 웹스토어에 확장을 다시 올려야 한다. 그래서 정기 주사 약제코드는 도우미에 보내지 않고 47 표의 처방 줄을 받아 Worker가 거른다. 더 좁은 기간 한도(31일)는 도우미가 한 번 더 막는다
- **복사는 원본 글 그대로**: 문자 발송 프로그램에 붙여 넣는 4칸 명단(이름·전화·이름·부위/fu 또는 종류)과 번호 목록을 원본과 같은 글로 만든다. 클립보드는 그 PC 안이다. 문자는 보내지 않는다
- **문자 문구 종류**: 원본 `jusa`(주사 안내, `[*2*]` = 부위)는 `injection`, `jinryo`(진료 안내)는 `followup`. F/U 명단의 [문구 복사]는 둘 다 고를 수 있고, 정기 주사 명단은 주사 안내다. 날짜는 고른 날짜 하나(처음 내일, 원본과 같음)
- **남은 건수 정의(Claude 판단 (기본값))**: F/U = '예정'이고 다음 내원일이 내일인데 연락함이 아닌 수(문자는 전날 보낸다), 정기 주사 = 예정일이 오늘까지 왔는데 연락함이 아닌 수('사용자에게 물을 것' 3)
- **도구는 주소 `?tool=`로**: 새로 고침해도 같은 도구가 열린다. 도구 이름만이라 환자 정보가 주소에 없다
- **휴대폰에서 문자 문구는 연다(Claude 판단 (기본값))**: 환자 정보가 없고 설정의 원본은 서버다(ADR-021). 명단 자리만 건수로 바꾼다
- **도구 단추 줄·복사 단추는 이 기능 폴더에**: 다른 탭도 도구 단추 줄을 두지만(tab-frame 계획), 병렬 브랜치끼리 같은 이름의 새 파일이 부딪히지 않게(규칙 C6) `components/patients/ToolRow.tsx`·`CopyButton.tsx`로 둔다. 여러 탭이 같은 모양을 쓰게 되면 나중에 공용으로 모은다
- **오류 번호(규칙 C3)**: 이 명세가 더하는 번호는 `E-PATIENTS-*`뿐이다 — `E-PATIENTS-SOURCE`(원본 자료 문제: 필수 칸 없음·중복·충돌 번호), `E-PATIENTS-TEMPLATES-READ`·`-TEMPLATES-SAVE`(문자 문구 읽기·저장), `E-PATIENTS-COUNTS-READ`·`-COUNTS-SAVE`(남은 건수 읽기·올리기). 도우미 오류(`E-BIT-READ-FAILED`·`E-STORE-*`·`E-HELPER-*`·`E-BRIDGE-*`)는 main에 있는 것을 그대로, `E-BIT-EXPORT-FAILED`는 precheck TASK-8이 더한 것을 쓴다(화면은 모르는 번호면 번호만 보인다)
- **읽기 실패와 '자료 없음'을 나눈다**: 문구·건수 읽기가 실패하면 빈 목록·`null`로 바꾸지 않고 오류 번호를 던진다. 화면은 오류 카드 + [다시 불러오기]를 보이고, 문구는 읽기가 될 때까지 고치기·저장·복사를 열지 않는다(AC-609.1·609.4·610.3·613.6)
- **개인정보 E2E(규칙 C7)**: TASK-15가 시험 계정·가짜 확장으로 실제 Supabase에 나가는 요청과 저장된 줄을 다시 읽어 환자 정보가 없음을 본다. 사용자가 SQL을 붙인 뒤에만 돈다
- **CLAUDE.md 글**: CLAUDE.md의 `components/contact/rows`(옛 이름)는 이 명세의 `components/patients/rows`와 같은 뜻이다. `docs/ARCHITECTURE.md`는 TASK-1이 고치고, CLAUDE.md 글 고치기는 메인 세션이 사용자 OK를 받아 한다
- **안 쓰는 것**: 브라우저 저장소, 서버 경로(ADR-004), 새 패키지(xlsx·PGlite·testing-library 모두 이미 있다), 오류 수집 도구

## 다른 작업과 겹치는 파일 (규칙 C8)
| 파일 | 이 명세가 하는 일 | 같은 파일을 고치는 다른 브랜치 |
|---|---|---|
| `supabase/migrations/20261101000300_patients.sql` (새 파일, 이름은 규칙 C2) + C1 함수 `my_hospital_id()`·`touch_updated_at()` | 두 표 + C1 글 그대로의 함수 | 업무일지(`…000100`·`…000110`)·통계(`…000200`)·매출(`…000400`)·precheck(`20261030000000`·`…000100`)가 같은 함수 글을 쓴다 |
| `src/lib/errors.ts`·`src/types/errors.ts` | `E-PATIENTS-*` 다섯 줄 더함 | 업무일지·통계·매출(`E-<기능>-*`), precheck(`E-SETTINGS-FAILED` 등) |
| `eslint.config.mjs`·`src/guardrails.test.ts` | `lib/patients` 구역, `components/patients/rows` 울타리, 오류 보고 패키지 금지 | precheck(TASK-13·26 청구 줄 울타리), 다른 탭 명세가 새 환자 구역을 더하면 같은 블록 |
| `docs/ARCHITECTURE.md` | 환자 구역 줄에 `lib/patients`·`components/patients/rows` | 업무일지·통계·매출·precheck(폴더 줄) |
| `docs/UI_GUIDE.md` | '도구 단추 줄'·'환자' 절 | 업무일지·통계·매출(자기 화면 절), precheck |
| `docs/ADR.md` | ADR-020 보충(정기 주사 기록 PC 저장) | precheck(ADR-016·020·021 근처), 다른 브랜치가 새 ADR을 더할 수 있음 — 보충으로 달아 새 번호를 쓰지 않는다 |
| `src/components/common/notReadyFeatures.ts`(+시험), `src/components/shell/menu.ts`·`shell.test.tsx`, `src/components/dashboard/briefing/features.ts`(+시험), `src/app/(app)/notReadyPages.test.tsx`·`tabFrame.test.tsx`, `src/app/titles.test.tsx`·`notFound.test.tsx` | [환자]를 준비 중에서 빼기. 고정 수는 목록 길이로(규칙 C5) | 업무일지·통계·매출이 자기 항목을 뺀다 |
| `src/lib/analytics/dates.ts`(+시험) | `addMonthsToDay` 하나 더함 | precheck(TASK-24 몫이던 것), 통계 |
| `helper/src/Precheck.Helper/Program.cs` | `ContactCommands.RegisterStore`·`RegisterTargets` 두 줄과 `HelperServices.Create()`를 변수로 받기(규칙 C4 합칠 자리) | precheck(TASK-8·15·17 등록 줄), 통계·매출(도우미 명령을 더하면) |
| `helper/src/Precheck.Helper/Commands/ContactHelperServices.cs` (새 파일) | 연락 부품 한 벌(`HelperServices.cs`는 고치지 않는다) | — |
| `helper/src/Precheck.Core/Bit/Sql.cs`·`src/lib/bridge/commands.json` | **고치지 않는다**(SQL 없음, 명령 표 그대로) | 통계·매출·precheck가 고친다 |

- 읽기만(고치지 않음): `src/lib/bridge/*`, `components/claim/useBridge.ts`, precheck TASK-8의 `GridReader`·`GridRows`·`VendorGridExport`, `src/workers/precheck/*`, `src/types/precheck.ts`, `helper/src/Precheck.Windows/SqlBitDb.cs`
- 기능 이름을 붙인 새 파일만 만든다(규칙 C6): `lib/patients`·`lib/patientMessages`·`lib/storage/messageTemplates.ts`·`contactCounts.ts`·`types/patients.ts`·`workers/patients*`·`components/patients/*`·`fixtures/patients`·`scripts/patients`·`e2e/patients*`

## 위험 / 미해결 질문
- **precheck TASK-8이 늦게 합쳐짐**: TASK-9가 막힌다. Phase 1·2·4는 가짜 통로로 만들 수 있지만 의원 PC에서 진짜 명단을 보려면 TASK-8·9가 있어야 한다
- **비트 통계 화면 읽기 시간**: 83·47 표를 31일씩 F/U 넷 + 정기 주사(처음 7개월) 읽는다. precheck TASK-8의 35일 읽기 시간을 의원 PC 시험에서 재 보고 느리면 F/U 기간·조각을 줄인다(명세 고침)
- **47 표의 전화 칸**: 원본은 통계 엑셀 프로그램이 내보낸 47 표에서 전화 칸을 찾았다. 비트 화면 표에 전화 칸이 숨겨져 있으면(보이는 칸만 읽음) 전화가 빈다. 그때는 원본처럼 전화 칸 없이 명단을 보이고(`phoneLoaded: false`) 의원 PC 시험 목록에 적는다
- **도우미·확장 배포**: 도우미 새 zip(`contact.targets`·`store.*` 포함)이 있어야 의원 PC에서 쓴다. 확장은 바꾸지 않는다. 도우미 릴리스 태그·운영 배포는 사용자가 그때 지시할 때만
- **Supabase 표 붙이기**: TASK-5 뒤 실제 Supabase에 붙이는 일은 사용자 OK가 필요하다

## 사용자에게 물을 것 (답을 받기 전까지 모두 Claude 판단 (기본값)으로 계획함)
1. **만드는 순서** (Claude 판단 (기본값)) — 도우미가 비트 표를 읽는 부품은 청구 사전점검 2단계(지금 만드는 중)의 것을 같이 쓴다. 그것이 합쳐진 뒤에 환자 탭 3단계(도우미)를 한다. **기본: 그렇게 한다**(1·2·4단계는 먼저 해도 된다)
2. **정기 주사 기록을 비트 PC에 쌓아 둘까요?** (Claude 판단 (기본값), 개인정보) 원본 양지바른처럼 한 번 읽은 달을 그 PC에 암호화해 두면 다음부터 빨라진다(서버로는 안 간다). 쌓지 않으면 열 때마다 7개월치를 읽어 몇 분 걸릴 수 있다. **기본: 쌓는다**
3. **남은 건수 기준** (Claude 판단 (기본값), 화면에 보이는 것) — 휴대폰에 보이는 수: F/U는 "내일 오실 분 중 아직 연락 안 한 분", 정기 주사는 "예정일이 오늘까지 왔는데 아직 연락 안 한 분". **기본: 이대로**
- (덜 급함, Claude 판단 (기본값)) 휴대폰·확장 없는 곳에서도 [문자 문구] 도구는 열린다(환자 정보 없음). 정기 주사 약제코드·간격은 원본 기본값(연골주사 A49 3차 뒤 6개월, 비타민D A32 3개월)으로 고정했다. 바꿀 화면이 필요하면 다음 명세
