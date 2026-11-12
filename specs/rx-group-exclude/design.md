# 설계: 처방별 추세 묶음에 제외할 처방

## 개요
- 처방별 추세 묶음(specs/treatment-trend)에 **제외할 처방** 목록 `exclude`를 더한다. 셈 규칙: 그날 묶음 처방 중 하나라도 받고, **같은 날** 제외할 처방은 하나도 받지 않은 환자 = 그날 그 묶음 1건
- 셈은 지금처럼 불러올 때 Worker 안 `aggregate`에서 한다. 저장 모양(`DayPayload.groups`)·검사(`validate.ts`)·`stats_days` 제약은 바꾸지 않는다
- "지금 묶음으로 센 숫자인가"는 지금처럼 **묶음 열쇠(지문)**로 가린다. 열쇠에 제외할 처방을 넣는다. 제외할 처방이 없으면 열쇠 글자가 지금과 한 글자도 같아서 이미 저장된 숫자가 그대로 보인다
- 묶음 표 `stats_rx_groups`에 칸 `exclude_codes`를 더하는 **새 migration**이 있다. **사용자가 사이트에 올리기 전에 SQL 편집기에 붙여야 한다**('사용자가 할 일')
- 도우미·확장은 바꾸지 않는다(도우미는 이미 모든 처방 줄을 보낸다. 제외할 처방 줄도 Worker에 온다)

## 코드로 확인한 것
| # | 사실 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 묶음 셈은 줄 하나씩 훑으며 그 자리에서 더한다 | 맞음. 처방 번호마다 든 묶음 자리를 찾아(`groupsOfRx`) 그날 칸에 환자가 없으면 더한다(`newGroupDays`). 같은 날 제외할 처방 줄이 뒤에 올 수 있어 **한 번 먼저 훑어** 빼는 (묶음, 환자, 날)을 모아야 한다 | `aggregate.ts:231`~`:262` |
| 2 | 묶음 정의를 옮겨 실을 때 `{ id, codes }`만 골라 새로 만드는 곳이 넷이다 | 맞음. 그대로 두면 `exclude`가 말없이 빠진다 → 넷 모두 `copyGroupDef`로 바꾼다 | `statsClient.ts:96`, `runAnalysis.ts:92`, `SourcePicker.tsx:50`, `readBitDays.ts:63` |
| 3 | Worker 입구는 정의를 통째로 넘긴다 | 맞음. `createStatsHost.load`는 `groups ?? []`를 `loadJob`에, `loadJob`은 `aggregate`에, 파일 Worker는 `groups ?? []`를 `analyzeFiles`에 넘긴다 → 고칠 것 없음(시험만 더함) | `jobs.ts:46`·`:187`, `analyze.worker.ts:21` |
| 4 | `groupKey`를 부르는 곳 | 통계 화면(`treatmentView.ts`), 대시보드 '처방 상위'(`dashboard/live/rxGroups.ts:18`), AI 리포트 이름 짝(`app/api/ai/store.ts:84`), E2E(`treatment-trend-privacy.spec.ts:259`). 넷 다 `exclude`를 넘기게 고친다. 안 고치면 제외할 처방이 있는 묶음이 대시보드에서 숫자를 못 찾고 AI 리포트에서 `이름 없는 그룹`이 된다 | 위 파일 |
| 5 | 묶음 모양 `RxGroup`은 매출 탭과 같이 쓴다 | 맞음. 머리 주석: "매출만의 칸을 넣지 않는다". 그래서 통계만의 칸은 새 타입 `StatsRxGroup`에 둔다 | `types/rxGroups.ts:1` |
| 6 | 묶음 코드 글자에는 제어 문자가 없다 | 맞음(`stats_rx_group_codes_ok`). 그래서 열쇠 글의 나눔 글자로 U+001F를 써도 코드와 섞이지 않는다 | `20261105000100_stats_rx_groups.sql:73` |
| 7 | 옛 migration은 운영에 들어가 고칠 수 없다 | 새 파일로만 더한다. `save_stats_rx_groups`는 `create or replace`로 바꾼다(이름·인자·돌려주는 모양 그대로) | treatment-trend design.md 사실 12 |

## 묶음 열쇠 (핵심 결정)
```ts
// src/components/stats/treatmentView.ts
export function groupKey(codes: readonly string[], exclude: readonly string[] = []): string
```
- 넣은 처방 글 = 지금 규칙(`codeKey` 대문자 → 겹침 뺌 → `compareText` 차례 → `\n`로 이음). 제외할 처방 글도 같은 규칙
- 제외할 처방 글이 비면 넣은 처방 글만 지문한다(**지금 값 그대로**). 아니면 `넣은 글 + '\u001f' + 제외 글`을 지문한다(FNV-1a 64비트, `t` + 16진수 16자리)
- 고정 값(AC-2705.2): `(['MM010'], ['ESWT7'])` → `t7bdb9b20a17a64d3`, `(['MM010'], ['ESWT7','ESWT1'])` → `t0058156be546398f`, `(['MM010'])` → `tf5a35bf567c9d2cc`
- 이 결정으로 지켜지는 것: 제외할 처방을 넣고 빼면 새 열쇠 → 다시 불러올 때까지 숨김(결정 5). 제외할 처방이 없는 묶음·이름·차례만 바꾼 묶음은 바로 보임. 되돌리면 예전 열쇠로 센 기간은 바로 보임(지금 처방으로 센 숫자다)

왜 이것인가(다른 후보):
| 후보 | 왜 아닌가 |
|---|---|
| 넣은 처방과 제외할 처방을 한 목록에 `!ESWT7`처럼 섞기 | 코드에 `!`가 들 수 있다(코드 규칙은 제어 문자만 막는다). 표 칸·고치기 규칙이 둘로 갈려 읽기 어렵다 |
| 제외할 처방이 없어도 열쇠 글을 늘 새 모양으로 | 이미 저장된 모든 묶음 숫자가 숨겨져 사용자가 전부 다시 불러와야 한다 |

## 구성 요소 / 인터페이스

### DB: `supabase/migrations/20261112000100_stats_rx_groups_exclude.sql` (전체)
```sql
-- 처방별 추세 묶음에 '제외할 처방'(exclude_codes)을 더한다 (specs/rx-group-exclude)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261105000100_stats_rx_groups.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다.
-- 안 붙이고 올리면 통계 탭 처방별 추세 칸·대시보드 '처방 상위'·AI 리포트의 묶음 읽기가 실패한다(다른 칸·불러오기는 그대로).
--
-- 왜: 그날 묶음 처방을 받았어도 같은 날 제외할 처방을 받은 환자는 그 묶음에서 세지 않으려고(2026-11-12 사용자 결정).
-- 처방 코드뿐이고 환자 칸은 없다. 권한은 stats_rx_groups 그대로이고 이 칸만 authenticated가 넣고 고칠 수 있다.

-- 제외할 처방: 같은 줄의 넣은 처방과 겹치지 않고(대소문자 무시) 제외 목록 안에서도 두 번 나오지 않는다
create function public.stats_rx_group_exclude_ok(codes text[], exclude_codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select (select count(distinct upper(e)) from unnest(exclude_codes) e) = cardinality(exclude_codes)
           and not exists (select 1 from unnest(codes) c join unnest(exclude_codes) e on upper(c) = upper(e)) $$;
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 막는다(stats_rx_group_codes_ok와 같다)
revoke all on function public.stats_rx_group_exclude_ok(text[], text[]) from public, anon;
grant execute on function public.stats_rx_group_exclude_ok(text[], text[]) to authenticated;

alter table public.stats_rx_groups
  add column exclude_codes text[] not null default '{}' check (public.stats_rx_group_codes_ok(exclude_codes)),
  add constraint stats_rx_groups_exclude_apart check (public.stats_rx_group_exclude_ok(codes, exclude_codes));

grant insert (exclude_codes), update (exclude_codes) on table public.stats_rx_groups to authenticated;

-- 묶음 목록 한꺼번에 저장: 20261105000100의 규칙 그대로에 exclude_codes만 더한다.
-- 열쇠가 없으면(예전 화면) 새 묶음은 빈 배열, 이미 있는 묶음은 그 값을 그대로 둔다(예전 화면이 저장해도 제외할 처방이 지워지지 않게)
create or replace function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid; has_exclude boolean;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    has_exclude := g ? 'exclude_codes';
    if has_exclude and jsonb_typeof(g->'exclude_codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then
      insert into public.stats_rx_groups (name, codes, exclude_codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')),
                case when has_exclude then array(select jsonb_array_elements_text(g->'exclude_codes')) else '{}'::text[] end,
                (g->>'sort_order')::int)
        returning id into gid;
    else
      update public.stats_rx_groups
         set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')),
             exclude_codes = case when has_exclude then array(select jsonb_array_elements_text(g->'exclude_codes')) else exclude_codes end,
             sort_order = (g->>'sort_order')::int
       where id = gid;
      if not found then raise exception 'not my group'; end if;
    end if;
    keep := keep || gid;
  end loop;
  delete from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() and not (s.id = any(keep));
  return query select * from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() order by s.sort_order;
end $$;
revoke all on function public.save_stats_rx_groups(jsonb) from public, anon;
grant execute on function public.save_stats_rx_groups(jsonb) to authenticated;
```
- 시험은 새 파일 `supabase/statsRxGroupsExclude.rls.test.ts`다. `statsRxGroups.rls.test.ts`와 같은 PGlite 흉내에 인증 → 통계 → stats_rx_groups → 이 파일 차례로 돌린다. 지금 시험 파일은 고치지 않는다(그 파일은 이 칸 없이 돌아야 하는 AC를 본다)
- 위 SQL은 설계의 기준이다. PGlite에서 다르게 돌면 같은 뜻으로 고치되 칸·권한·규칙은 바꾸지 않는다

### 타입
```ts
// src/types/rxGroups.ts — 매출 RxGroup은 그대로
/** 통계 처방별 추세 묶음. exclude 없음 = 제외할 처방 없음 (specs/rx-group-exclude) */
export type StatsRxGroup = RxGroup & { exclude?: string[] }
// src/types/analysis.ts
export type RxGroupDef = { id: string; codes: string[]; exclude?: string[] }   // exclude 없음·빈 배열 = 제외 없음
```
- `exclude`를 선택 칸으로 둔다: 지금 시험·대시보드 가짜 값(`exclude` 없는 묶음)이 그대로 타입 검사를 지난다
- 통계 쪽 함수(`treatmentView`·`treatmentEdit`·`useStatsRxGroups`·`statsRxGroups` 저장 코드·화면 props)의 묶음 타입을 `StatsRxGroup`으로 바꾼다. `RxGroup`을 받는 매출 함수(`suggestGroups`·`renameGroup`·`deleteGroup`)는 그대로 부른다(`StatsRxGroup`은 `RxGroup`에 넣을 수 있다. 돌려받은 목록은 같은 객체라 `exclude`가 남는다)

### 정의 옮기기 (`src/lib/analytics/groupDef.ts`, 새 파일, 환자 자료 구역·순수)
```ts
/** 묶음 정의를 새 객체로 옮긴다. 제외할 처방이 있을 때만 exclude 칸을 싣는다(없으면 지금처럼 { id, codes }) */
export function copyGroupDef(def: RxGroupDef): RxGroupDef
```
- 사실 2의 네 곳이 이것을 부른다. 이름 등 다른 칸은 싣지 않는다

### 셈 (`src/lib/analytics/aggregate.ts`)
- 제외할 처방이 있는 묶음이 하나라도 있을 때만 줄을 **한 번 먼저 훑는다**: 외래 줄(`outpatient !== false`)의 코드가(대소문자 무시, `groupCodeKey`) 어떤 묶음의 제외할 처방이면 그 (묶음 자리, 환자, 날)을 모은다
- 본 훑기에서 `newGroupDays`를 만들 때 그 (묶음 자리, 환자, 그 줄 날)이 모음에 있으면 그 묶음을 뺀다. 나머지(같은 날 1건, 일·주·달 칸, F/U, 신환·재진)는 그대로다
- 제외할 처방이 없으면 먼저 훑기를 하지 않는다(지금 길·속도 그대로). 10만 줄 1초 시험은 제외할 처방이 있는 묶음으로도 본다

### 저장 코드 (`src/lib/storage/statsRxGroups.ts`)
- 읽기: `select('id,name,codes,exclude_codes,sort_order')`, `exclude: Array.isArray(row.exclude_codes) ? row.exclude_codes : []`
- 저장: `{ id, name, codes: [...codes], exclude_codes: [...(exclude ?? [])], sort_order }`

### 화면 숫자·고치기 규칙
```ts
// src/components/stats/treatmentView.ts
export function groupKey(codes: readonly string[], exclude?: readonly string[]): string
export function groupDefs(groups: readonly StatsRxGroup[]): RxGroupDef[]   // 처방 든 묶음만, exclude는 있을 때만
// treatmentRows·staleNames 등은 groupKey(group.codes, group.exclude)를 쓴다

// src/components/stats/treatmentEdit.ts
export function pickExclude(groups: readonly StatsRxGroup[], index: number, code: string): StatsRxGroup[]
export function removeExclude(groups: readonly StatsRxGroup[], index: number, code: string): StatsRxGroup[]
export function inExclude(group: StatsRxGroup, code: string): boolean       // 대소문자 무시
// pickCode: 이 묶음 exclude에 있으면 그대로. forSave: exclude를 늘 배열로. savedNote: 처방 든 묶음의 exclude 집합이 바뀌면 다시 불러와야 함
// addBlankGroup: exclude: []
```

### 화면 (`src/components/stats/sections/`)
- `TreatmentGroupEditor.tsx`: 묶음마다 [+ 처방 넣기] 아래에 제외할 처방 자리(AC-2707.1). 찾기 목록 상태 `open`을 `{ key, kind: 'codes' | 'exclude' }`로 넓혀 한 번에 하나만 연다. 찾기 목록 그리기(`picker`)는 하나를 두고 `kind`에 따라 칸 이름·줄 오른쪽 글·누를 수 있는지·고르면 부르는 함수를 바꾼다. 제외 쪽 [빼기]·[+ 제외할 처방 넣기]는 지금 [빼기]·[+ 처방 넣기]와 같은 부품 클래스(`PLAIN_BUTTON`·`ADD_CODE_BUTTON`)다
- `TreatmentTable.tsx`: 이름 옆 코드 줄 `Name`에 `exclude`를 넘겨 ` · 제외 A, B`를 붙인다(AC-2708.1)
- `TreatmentTrendSection.tsx`: `BottomNotes`의 세 안내 글 위에 AC-2708.2 글(처방 든 묶음 중 `exclude`가 있는 것이 있을 때만)

### 대시보드·AI 리포트
- `dashboard/live/rxGroups.ts` `toDashboardGroups`: 열쇠 `groupKey(group.codes, group.exclude)`. 정의는 지금처럼 `groupDefs`
- `app/api/ai/store.ts` `loadReportMonths`: 읽는 칸에 `exclude_codes`를 더하고 `groupRowOf`가 `exclude`(없으면 `[]`, 글자 배열이 아니면 `GROUPS_SHAPE_FAILED`)를 읽어 `groupKey(codes, exclude)`로 이름 짝을 만든다. 코드는 짝을 만든 뒤 버린다(지금 규칙). 서버로 오는 값·AI로 가는 값의 모양은 그대로다

## 데이터 흐름
```
stats_rx_groups(codes·exclude_codes) ⇄ lib/storage/statsRxGroups ⇄ useStatsRxGroups ─→ TreatmentTrendSection(보기·고치기)
                                                    └ forLoad() → groupDefs: [{ id: groupKey(codes, exclude), codes, exclude? }]
비트: helper → 확장 → lib/bridge → stats Worker(loadJob: aggregate(rows, defs) — 먼저 훑어 같은 날 제외할 처방 받은 (묶음, 환자, 날)을 뺌) → stats_days
파일: runAnalysis(files, { groups: defs }) → analyzeFiles(aggregate 같은 규칙) → stats_days
stats_days ─ readDays → treatmentRows(keyedIn(groupKey(codes, exclude))) → TreatmentTable
대시보드: readDashboardGroups → toDashboardGroups(열쇠 = groupKey(codes, exclude)) · AI: loadReportMonths(이름 짝 = groupKey(codes, exclude_codes))
```
- Worker로 가는 것: 묶음 열쇠·넣은 처방 코드·제외할 처방 코드(이름 없음). 서버로 가는 것: 묶음 이름·두 코드 목록·차례, 일 줄 묶음 숫자(열쇠·세 숫자). 환자 칸은 어디에도 없다
- 환자 자료 구역에 더하는 것은 순수 함수뿐이다(`groupDef.ts`, `aggregate.ts` 고침). 네트워크·저장소·console·React 없음

## 시안과 다른 곳
| 시안 | 실제 | 까닭 |
|---|---|---|
| 맨 위 시안 막대(보는 화면·묶음 고치기·휴대폰 폭 단추), `시안` 표시, 끝의 '정하신 내용'·'제가 정한 부분' | 없음 | 시안에서만 쓰는 표시 |
| 처방별 추세 칸만 그림 | 통계 탭 다른 칸 그대로 | 이 기능은 그 칸만 바꾼다 |
| 없음 | 찾기 목록 읽는 중·실패, 저장 실패, 이름 규칙 글, 50개 한도 | treatment-trend 화면의 같은 상태 글 그대로 |

## 다른 기능에 미치는 것
- **처방별 추세**: 제외할 처방이 없는 묶음은 숫자·글 그대로(열쇠 같음). 제외할 처방을 쓰는 묶음만 다시 불러와야 한다
- **대시보드 '처방 상위'**: 같은 열쇠를 쓰므로 제외 규칙이 같이 든다. 제외할 처방을 바꾼 묶음은 대시보드가 그날을 다시 읽어야(대시보드는 비트 바로 읽기라 다음 읽기에서) 맞는다
- **AI 리포트**: 이름 짝만 바뀐다. 달 줄 `groups` 숫자는 저장된 그대로다
- **처방 골라 보기·처방별 신환·재진·매출 탭**: 그대로
- **비트 PC 부담**: 도우미 요청 그대로. 제외할 처방이 있으면 Worker가 줄을 한 번 더 훑는다(10만 줄 1초 시험 유지)

## 기존 명세·시험과의 관계
- 승인된 명세(treatment-trend·bit-dashboard·ai-report-stats)는 고치지 않는다. treatment-trend AC-1202.1(표 칸이 여섯뿐), AC-1203.1(읽는 칸), AC-1203.2·AC-1213.3·AC-1213.4(저장 본문 열쇠 넷), AC-1210.10(경고 글)은 이 명세의 AC-2701.1·2702.1·2702.2·2709.2·2707.6이 대신한다
- 그래서 함께 고치는 승인된 시험(알려진 것): `statsRxGroups.test.ts`(읽는 칸 글자·저장 본문 열쇠), `TreatmentGroupEditor.test.tsx`(경고 글), `e2e/treatment-trend-privacy.spec.ts`(본문 열쇠·열쇠 계산), `app/api/ai/store.test.ts`(읽는 칸 글자). `supabase/statsRxGroups.rls.test.ts`는 이 migration을 돌리지 않으므로 그대로다. 이 밖에 바뀌는 기대값이 나오면 멈추고 보고한다
- treatment-trend AC-1206.1의 고정 값은 그대로 지난다(AC-2705.1)

## 사용자가 할 일
1. **사이트에 올리기 전에** `supabase/migrations/20261112000100_stats_rx_groups_exclude.sql` 전체를 운영 Supabase SQL 편집기에 붙여 한 번 실행한다. 빠뜨리면 처방별 추세 칸·대시보드 처방 상위·AI 리포트가 묶음을 읽지 못한다(다른 칸·불러오기는 그대로)
2. 제외할 처방을 넣은 묶음은 보고 싶은 기간을 비트 PC에서 다시 불러온다(최근 12개월을 고르면 작년까지 함께 읽힌다)

## 위험 / 미해결 질문
- SQL을 붙이기 전에 올리면 묶음 읽기가 실패한다(위 1). 붙인 뒤 올리면 예전 화면이 열린 탭에서 저장해도 제외할 처방은 지워지지 않는다(저장 함수가 열쇠 없는 묶음의 값을 그대로 둔다)
- 넣은 처방은 한 묶음에만 들어서 `MM010 전체`와 `MM010 중 ESWT7 날 뺌`을 두 묶음으로 나란히 둘 수 없다. 전체는 처방 골라 보기에서 본다(결정 7). 사용자가 나란히 보고 싶다고 하면 그때 "한 묶음에만" 규칙을 다시 정한다
- E2E(`npm run e2e`)는 사용자가 SQL을 붙이고 시험 계정이 있어야 돈다. 이 서버에서는 파일만 고치고 타입 검사까지 한다
