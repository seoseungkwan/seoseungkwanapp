# 설계: 처방별 추세 묶음 빼는 처방·조건·총환자 대비

## 개요
- 처방별 추세(specs/treatment-trend) 위에 얹는다. 묶음 저장 표·불러올 때 세기·열쇠로 다시 불러오기 판단·줄 숫자 함수가 다 있다. 바꾸는 곳은 넷이다
  1. **묶음 모양**: 묶음에 `out`(빼는 처방)과 `cond`(넣는 처방마다 조건)를 더한다. DB 칸 둘(새 migration), 읽기·저장 코드, AI 리포트 이름 읽기
  2. **불러올 때 세기**: `aggregate`의 묶음 셈을 "줄마다 바로 더하기"에서 "환자·날마다 받은 코드를 모은 뒤 판단"으로 바꾼다. 빼는 처방은 같은 날 다른 줄에 있을 수 있어서다
  3. **열쇠**: `groupKey`에 빼는 처방·조건을 넣는다. 둘 다 없으면 지금 열쇠와 글자까지 같다 → 지금 묶음은 다시 불러오지 않아도 된다
  4. **화면**: 줄 표에 총환자·총환자 대비, 이름 아래 조건·빼는 처방. 열린 칸에 [건수]/[총환자 대비 %] 단추·요약·추세선·꺾은선. 고치기 화면에 빼는 처방·조건·묶음째 고르기
- 저장되는 일 숫자의 모양(`DayPayload.groups`)·검사(`validate.ts`)·DB `stats_days`는 바꾸지 않는다. 묶음 열쇠만 달라진다

## 코드로 확인한 것
| # | 사실 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 묶음 셈은 줄을 훑으며 그 자리에서 더한다 | 맞음. `newGroupDays`가 그 환자·그날 묶음에 처음 든 줄이면 일·주·달 칸에 더한다. 빼는 처방이 그날 뒤 줄에 나오면 되돌릴 수 없다 → 모은 뒤 판단으로 바꾼다 | `aggregate.ts:201`~`:235` |
| 2 | 화면 숫자는 묶음 줄을 처방 줄로 바꾼 가상 입력을 `rxPickRows`·`rxDetail`에 넘겨 낸다 | 맞음. 총환자 대비는 그 밖의 숫자라 새 순수 함수로 낸다 | `treatmentView.ts` `groupInput`·`treatmentDetail` |
| 3 | 묶음 정의를 Worker로 보내는 곳은 세 곳이고 모두 `{ id, codes }`만 새로 만든다 | 맞음. `out`·`cond`를 싣지 않으면 말없이 빠진다 → 세 곳 모두 같은 복사 함수를 쓴다 | `statsClient.ts:106`, `runAnalysis.ts:92`, `SourcePicker.tsx:53` |
| 4 | Worker 안은 정의를 통째로 넘긴다 | 맞음. `jobs.ts:276`(`groups ?? []`), `analyze.worker.ts:21`, `analyzeFiles.ts` `uniqueGroups`(객체 그대로) | 위 파일 |
| 5 | 대시보드 '처방 상위'와 환자 명단도 통계 묶음(`stats_rx_groups`)을 읽는다 | 대시보드는 `toDashboardGroups`가 줄 열쇠를 `groupKey(group.codes)`, 정의를 `groupDefs`로 만들고 `readBitDays`가 `{ id, codes }`만 복사한다 → 둘 다 고친다(AC-3705.5). 환자 명단은 넣는 처방 코드만 써서 마지막 진료를 거른다 → 범위 밖 | `dashboard/live/rxGroups.ts:2-18`, `readBitDays.ts:63`, `LapsedTool.tsx:67` |
| 6 | AI 리포트가 `stats_rx_groups`를 읽어 `groupKey(codes)` → 이름을 만든다 | 맞음. 열쇠가 바뀌므로 `out_codes`·`cond`도 읽어야 이름이 붙는다 | `app/api/ai/store.ts:45`·`:97` |
| 7 | 그래프 칸은 이미 7·30일 일, 90일 주, 12개월 달이다 | 맞음(`range.bucket`). 고른 기간(stats-period)도 같은 칸을 쓴다 | `view.ts` `statsRange`·`rxDetail` |
| 8 | 막대 그림에 선을 겹칠 자리가 없다 | 맞음. `StackedBarChart`에 선택 prop을 더한다(주지 않으면 지금 그림 그대로). 꺾은선 그림은 없다 → 새 부품 | `charts/StackedBarChart.tsx`, `charts/Sparkline.tsx`(작은 선뿐) |
| 9 | 범례 표시 종류에 선이 없다 | 맞음. `trend`(점선)·`line`(accent 선)을 더한다 | `charts/ChartLegend.tsx` |
| 10 | 비율 글은 소수 첫째 자리까지 버림이다 | 맞음. `rateText`·`formatRate`(`truncatedOne`) | `rxPickView.ts:25`, `charts/format.ts:14` |
| 11 | 옛 migration은 고칠 수 없다 | 새 파일로만 더한다. 저장 함수는 `create or replace`(같은 인자·같은 돌려주는 모양) | treatment-trend design.md 사실 12 |
| 12 | 저장 함수 본문 열쇠를 E2E가 못 박았다 | 맞음. `GROUP_BODY_KEYS`를 고친다 | `e2e/treatment-trend-privacy.spec.ts:30` |
| 13 | 승인된 AI 시험이 select 글자를 못 박았다 | 맞음(`'name, codes, sort_order'`, ai-report-stats AC-2002.1). 이 명세 AC-3702.4가 대신한다 | `store.test.ts:583`~`:586` |

## 셈 규칙 (핵심)
그날 한 환자가 받은 코드 모음 S(대문자, 외래 줄만)에서 묶음 g를 1건으로 센다 ⇔
- (가) g의 넣는 처방 c 가운데 `S ∩ unless(c) = ∅`인 c가 S에 하나 이상 있다. 조건이 없는 c는 `unless(c) = ∅`
- (나) `S ∩ out(g) = ∅`

빼는 처방·조건이 없으면 (가)는 "넣는 처방 하나라도", (나)는 늘 참 → 지금 셈과 같다(AC-3703.7).

### `aggregate` 고침 (`src/lib/analytics/aggregate.ts`, 환자 자료 구역)
```ts
// src/types/analysis.ts
export type RxGroupDef = { id: string; codes: string[]; out?: string[]; cond?: Array<{ code: string; unless: string[] }> }
```
- 미리 만드는 것: 묶음마다 `include: Set<코드번호>`, `out: Set<코드번호>`, `unless: Map<넣는 코드번호, Set<코드번호>>`(대문자 코드를 0, 1, 2…로 매긴 번호. 묶음에 나오는 코드만). `cond` 항목 중 넣는 처방에 없는 코드·빈 `unless`는 버린다(열쇠 규칙과 같다)
- 줄을 훑을 때: 그 줄 코드(대문자)가 묶음 코드 번호에 있으면 `dayCodes: Map<일 칸, Map<환자, Set<코드번호>>>`에 넣는다. 처방 번호(`rxCodes`)마다 한 번만 찾아 둔다(지금 `groupsOfRx`와 같다)
- 다 훑은 뒤(totals 마무리 앞): 일 칸마다, 환자마다, 묶음마다 위 규칙이면 그날의 일·주·달 칸(`bucketsOfDate`) `groups`에 `환자 → 날 수 + 1`. 그 뒤 `toStats`는 그대로다
- 한 코드가 여러 묶음에 있어도 묶음마다 따로 판단한다(stats-core AC-006.3 그대로). 입원 줄은 지금처럼 맨 앞에서 건너뛴다
- 10만 줄 1초: 묶음 코드가 든 줄만 모으고, 판단은 환자·날마다 한 번이다(줄 수가 아님). 시험은 지금 시험과 같은 재기(AC-3703.10)

## 열쇠 (`src/components/stats/treatmentView.ts`)
```ts
export function groupKey(codes: readonly string[], extra?: { out?: readonly string[]; cond?: readonly RxCond[] }): string
export function groupDefs(groups: readonly StatsRxGroup[]): RxGroupDef[]
export function keptCond(codes: readonly string[], cond: readonly RxCond[]): RxCond[]
```
- `keptCond` 규칙: `code`를 `codeKey`(대문자)로 본다. 넣는 처방(`codeKey`)에 없는 항목은 버린다. `codeKey`가 같은 항목은 하나로 합친다(`unless`는 합집합). `unless`는 `codeKey`로 바꾸고 겹침·`code` 자신을 빼고 글자 차례로 둔다. 남은 `unless`가 비면 그 항목을 버린다. 항목은 `code`의 `codeKey` 글자 차례이고, 돌려주는 `code`·`unless`는 모두 `codeKey` 글자다(Worker 셈은 대소문자를 가리지 않으므로 같다)
- 글자: `A` = 지금 글자(넣는 처방 `codeKey`, 겹침 뺌, 글자 차례, `\n`). 빼는 처방이 없고 `keptCond`가 비면 `A` 그대로 → 지금 열쇠
- 아니면 `A + '\u0001' + B + '\u0001' + C`. B = 빼는 처방을 `A`와 같은 규칙으로, C = `keptCond` 항목마다 `code + '\u0002' + unless(같은 규칙, '\u0002'로 이음)`을 `\n`으로 이음. 코드에는 제어 문자가 없으므로(DB CHECK) 나눔 글자가 코드와 섞이지 않는다
- 그 글자의 UTF-8 FNV-1a 64비트(지금 그대로). 고정 값 시험 둘을 더한다(AC-3704.4)
- `groupDefs`: 처방 든 묶음만, sortOrder 차례, 같은 열쇠 한 번. 항목은 `{ id, codes }`에 `out`(있을 때)·`cond`(= `keptCond`, 있을 때)를 더한다
- `treatmentRows`: 열쇠를 `groupKey(group.codes, group)`로 만든다. 그 밖은 그대로다

## 묶음 모양 (`src/types/rxGroups.ts`)
```ts
export type RxCond = { code: string; unless: string[] }   // 넣는 처방 code는 unless 가운데 하나라도 같은 날 받으면 그 처방으로는 세지 않는다
export type StatsRxGroup = RxGroup & { out?: string[]; cond?: RxCond[] }   // 없으면 빈 것
// src/components/stats/treatmentView.ts
export const groupOut = (group: StatsRxGroup): string[] => group.out ?? []
export const groupCond = (group: StatsRxGroup): RxCond[] => group.cond ?? []
```
- 매출 `RxGroup`은 그대로다. 통계 묶음 코드(`statsRxGroups.ts`·`useStatsRxGroups`·`treatmentEdit`·`treatmentView`·화면)는 `StatsRxGroup`을 쓰고, 칸은 늘 `groupOut`·`groupCond`로 읽는다
- 두 칸을 **선택 칸**으로 두는 까닭: 지금 `RxGroup` 값(제안 다섯·시험 자료·여러 화면)이 그대로 `StatsRxGroup`이라, TASK를 Phase로 나눠 고쳐도 Phase 끝마다 타입 검사(`next build`)가 지난다. 읽기 코드는 DB 값을 늘 채우고(null → 빈 배열), 고치기 함수·`forSave`는 늘 두 칸을 채운 묶음을 돌려준다
- `RxGroupDef`는 `analysis.ts`에 같은 모양을 따로 적는다(환자 자료 구역 타입이 화면 타입 파일을 부르지 않게)

## DB: `supabase/migrations/20261112000000_stats_rx_groups_exclude.sql` (전체)
```sql
-- 통계 '처방별 추세' 묶음에 빼는 처방(out_codes)과 넣는 처방마다 조건(cond)을 더한다 (specs/group-exclude)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261105000100_stats_rx_groups.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 안 붙이고 올리면 처방별 추세 칸이 묶음 읽기 오류를 보인다.
-- 묶음 이름·처방 코드뿐이고 환자 칸은 없다. 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다

-- 칸 검사(한 줄 안): 빼는 처방은 코드 규칙(stats_rx_group_codes_ok)·대소문자 무시 겹침 없음·넣는 처방과 안 겹침.
-- 조건은 [{ "code": 넣는 처방, "unless": [코드…] }] 배열. code는 그 줄 넣는 처방(대소문자 무시)·항목끼리 안 겹침, unless는 1~1000개·코드 규칙·안에서 안 겹침·code 자신 아님
create function public.stats_rx_group_parts_ok(codes text[], out_codes text[], cond jsonb) returns boolean language plpgsql immutable set search_path = ''
as $$
declare e jsonb; seen text[] := '{}'; u text[];
begin
  if out_codes is null or not public.stats_rx_group_codes_ok(out_codes) then return false; end if;
  if (select count(distinct upper(c)) from unnest(out_codes) c) <> cardinality(out_codes) then return false; end if;
  if exists (select 1 from unnest(out_codes) o join unnest(codes) c on upper(o) = upper(c)) then return false; end if;
  if cond is null or jsonb_typeof(cond) <> 'array' or jsonb_array_length(cond) > 1000 then return false; end if;
  for e in select * from jsonb_array_elements(cond) loop
    -- or는 앞에서부터 끊긴다는 보장이 없어 검사를 나눈다(객체가 아닌 값에 jsonb_object_keys를 부르지 않게)
    if jsonb_typeof(e) <> 'object' then return false; end if;
    if (select count(*) from jsonb_object_keys(e)) <> 2 then return false; end if;
    if jsonb_typeof(e->'code') is distinct from 'string' or jsonb_typeof(e->'unless') is distinct from 'array' then return false; end if;
    if exists (select 1 from jsonb_array_elements(e->'unless') x where jsonb_typeof(x) <> 'string') then return false; end if;
    u := array(select jsonb_array_elements_text(e->'unless'));
    if cardinality(u) < 1 or not public.stats_rx_group_codes_ok(u) or not public.stats_rx_group_codes_ok(array[e->>'code']) then return false; end if;
    if (select count(distinct upper(x)) from unnest(u) x) <> cardinality(u) then return false; end if;
    if upper(e->>'code') = any(array(select upper(x) from unnest(u) x)) then return false; end if;
    if not upper(e->>'code') = any(array(select upper(c) from unnest(codes) c)) then return false; end if;
    if upper(e->>'code') = any(seen) then return false; end if;
    seen := seen || upper(e->>'code');
  end loop;
  return true;
end $$;
revoke all on function public.stats_rx_group_parts_ok(text[], text[], jsonb) from public, anon;
grant execute on function public.stats_rx_group_parts_ok(text[], text[], jsonb) to authenticated;

alter table public.stats_rx_groups
  add column out_codes text[] not null default '{}',
  add column cond jsonb not null default '[]'::jsonb,
  add constraint stats_rx_groups_parts_ok check (public.stats_rx_group_parts_ok(codes, out_codes, cond));

-- 새 칸 권한(이미 있는 name·codes·sort_order 권한은 그대로)
grant insert (out_codes, cond), update (out_codes, cond) on table public.stats_rx_groups to authenticated;

-- 저장 함수: 항목의 out_codes·cond도 넣는다. 열쇠가 없는 항목(옛 앱)은 빈 값. 배열이 아니면 bad groups
create or replace function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid; outs text[]; conds jsonb;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    if g ? 'out_codes' and jsonb_typeof(g->'out_codes') <> 'array' then raise exception 'bad groups'; end if;
    if g ? 'cond' and jsonb_typeof(g->'cond') <> 'array' then raise exception 'bad groups'; end if;
    outs := array(select jsonb_array_elements_text(coalesce(g->'out_codes', '[]'::jsonb)));
    conds := coalesce(g->'cond', '[]'::jsonb);
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then
      insert into public.stats_rx_groups (name, codes, out_codes, cond, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), outs, conds, (g->>'sort_order')::int) returning id into gid;
    else
      -- 열쇠가 없는 항목(옛 앱 탭)은 그 칸을 지금 값 그대로 둔다
      update public.stats_rx_groups s set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')),
        out_codes = case when g ? 'out_codes' then outs else s.out_codes end,
        cond = case when g ? 'cond' then conds else s.cond end,
        sort_order = (g->>'sort_order')::int
        where s.id = gid;
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
- `jsonb_array_elements_text`는 글자 아닌 값(숫자 등)도 글자로 바꾼다. 빼는 처방은 `text[]` 칸이라 저장 함수가 글자로 바꾸고 `stats_rx_group_codes_ok`가 길이·제어 문자를 본다. 조건 `unless`는 칸 검사가 글자인지 직접 본다(AC-3701.4 (마))
- 시험(`supabase/statsRxGroupsExclude.rls.test.ts`, 새 파일)은 `statsRxGroups.rls.test.ts`와 같은 PGlite 흉내에 두 migration을 차례로 붙인다. 지금 시험 파일은 고치지 않는다(새 migration을 붙이지 않으므로 그대로 통과)
- 위 SQL은 설계의 기준이다. PGlite에서 문법이 다르게 돌면 같은 뜻으로 고치되 칸·권한·규칙은 바꾸지 않는다

## 읽기·저장 코드
```ts
// src/lib/storage/statsRxGroups.ts
type DbGroup = { id: string; name: string; codes: string[]; out_codes: string[] | null; cond: RxCond[] | null; sort_order: number }
export function listStatsRxGroups(deps?: Deps): Promise<StatsRxGroup[]>   // select('id,name,codes,out_codes,cond,sort_order')
export function saveStatsRxGroups(after: readonly StatsRxGroup[], deps?: Deps): Promise<StatsRxGroup[]>
// 보내는 항목: { id, name, codes: [...], out_codes: [...out], cond: cond.map(({ code, unless }) => ({ code, unless: [...unless] })), sort_order }
```
```ts
// src/app/api/ai/store.ts (서버, 읽기만)
supabase.from('stats_rx_groups').select('name, codes, out_codes, cond, sort_order')
groupKey(group.codes, { out: group.out, cond: group.cond })
```
- `groupRowOf`가 `out_codes`(글자 배열, null이면 빈 배열)와 `cond`(`{ code: 글자, unless: 글자 배열 }` 배열, null이면 빈 배열)를 본다. 다르면 지금처럼 `GROUPS_SHAPE_FAILED`
- 처방 코드는 열쇠를 만든 뒤 버린다(지금 그대로). AI로 가는 것은 이름뿐이다

## 불러오기 길
```ts
// src/lib/analytics/groupDef.ts (새 파일, 순수 함수)
export function copyGroupDef(def: RxGroupDef): RxGroupDef   // { id, codes: [...] } + out(비지 않으면 새 배열) + cond(비지 않으면 { code, unless: [...] }만)
```
- `statsClient.requestLoad`·`runAnalysis`·`SourcePicker.readFiles`·`dashboard/live/readBitDays.ts` 넷이 지금 `({ id, codes }) => ({ id, codes: [...codes] })` 자리에서 이 함수를 쓴다. 빼는 처방·조건이 없으면 지금 메시지와 글자까지 같다(Worker 메시지를 `toEqual`로 못 박은 지금 시험이 그대로 통과)
- 대시보드 `toDashboardGroups`(`dashboard/live/rxGroups.ts`)는 줄 열쇠를 `groupKey(group.codes, group)`로 만든다(정의는 이미 `groupDefs`라 저절로 따라온다)

## 화면 숫자 (`src/components/stats/treatmentChart.ts`, 새 파일, 순수 함수)
```ts
export type ChartMode = 'count' | 'pct'
export function periodPatients(days: readonly DayPayload[], range: DateRange): { patients: number; openDays: number }
export type ChartCell = RxDetailPoint & { patients: number; pct: number | null; comparison: number | null }   // pct = count ÷ patients × 100(patients 0이면 null)
export function chartCells(input: StatsInput, item: ReadyTreatmentRow): ChartCell[]   // treatmentDetail의 current에 칸 총환자·비교(comparisonAt)를 붙인다
export type TrendFit = { slope: number; intercept: number; from: number; to: number }   // from·to = 쓴 첫·끝 칸 자리
export function trendFit(cells: readonly ChartCell[], mode: ChartMode): TrendFit | null
export function trendText(fit: TrendFit | null, cells: readonly ChartCell[], mode: ChartMode, bucket: TrendBucket): string
export function sumLabel(range: StatsRange): string                     // '최근 30일 합계' · '1년(최근 12개월) 합계' · '{name} 합계'
export function perDayText(count: number, openDays: number): string     // 버림 소수 첫째, openDays 0이면 '–'
```
- `trendFit`: 쓰는 칸 = `patients > 0 && !partial`(결정 15). y는 [건수]면 `count`, [총환자 대비 %]면 `pct`. 최소제곱(`n·Σxy − Σx·Σy) / (n·Σx² − (Σx)²)`, 분모 0이면 null
- `trendText`: AC-3707.2~4. 평균 = 쓴 칸 y의 평균. 숫자 글은 `formatCount`(정수)·소수 첫째 자리 버림(`format.ts`의 `truncatedOne`을 내보내 쓴다)
- 칸 총환자: 칸 `start`~`end` 안 저장된 일 줄(같은 날은 뒤의 것)의 `totals.patients` 합
- `treatmentView.ts`의 `TreatmentRow`는 `group: StatsRxGroup`이 된다(선택 칸이라 지금 `RxGroup` 값도 그대로 들어간다). 나머지는 그대로다

## 그래프 부품 (`src/components/charts/`)
```ts
// StackedBarChart.tsx: 선택 prop. 주지 않으면 지금 그림과 한 글자도 다르지 않다
trend?: { from: { at: number; value: number }; to: { at: number; value: number } } | null
// 그림 칸 안 absolute inset-0 svg(viewBox `0 0 {칸 수} 100`, preserveAspectRatio none), x = at + 0.5, y = 100 − value ÷ 눈금 최대 × 100.
// 점선(stroke-dasharray 6 4), 2px, vector-effect non-scaling-stroke, stroke-ink. 눈금은 막대로만 잡는다(선은 그림 칸 밖으로 잘린다)

// RateLineChart.tsx (새 부품): 총환자 대비 꺾은선
type RatePoint = { key: string; label: string; rangeLabel: string; value: number | null; partial: boolean }
export function RateLineChart(props: { title: string; points: RatePoint[]; trend?: …같은 모양 | null; dense?: boolean; thinLabels?: boolean })
// StackedBarChart compact와 같은 틀: '(%)' 단위 줄, niceScale 눈금(짝수 번째만), 가로 눈금선, 아래 기간 글자.
// 값 있는 점을 차례로 잇는 accent 2px 선(값 없는 칸은 건너 이음), 점은 HTML(8px 둥근 accent, 2px surface 테두리), dense가 아니면 점 위 'x.x%' 글(formatRate).
// 그림은 aria-hidden, sr-only 표 '기간 | 총환자 대비 | 상태'(값 없으면 '–')
// ChartLegend.tsx: mark에 'trend'(가로 12px 점선, ink)·'line'(가로 12px 2px accent 선)을 더한다
```

## 화면 (`src/components/stats/sections/`)
| 파일 | 바뀌는 것 |
|---|---|
| `TreatmentTable.tsx` | props는 그대로. `periodPatients(input.days, input.range.current)`로 표 위 총환자 줄(AC-3708.1). 칸 `총환자 대비` 하나 더함(넓으면 84px 뒤 96px 칸, 좁으면 셋째 줄 왼쪽, 이름표 보임). 이름 칸: 조건 있는 코드 `*`, 조건 줄, `빼는 처방` 줄(AC-3708.4·5). 둘 다 없는 묶음은 지금 이름 칸 그대로 |
| `TreatmentDetail.tsx` | 선택 props `mode`·`onMode`(없으면 제 상태, 처음 [건수]). 머리(제목 + `ds.segment` 두 단추), 요약 줄, [건수]면 막대 + `trend`, [총환자 대비 %]면 `RateLineChart`, 추세 글(`border-l-2 border-ink pl-3`), 안내, 표 칸 일곱(AC-3709.1~6) |
| `TreatmentGroupEditor.tsx` | 초안 `StatsRxGroup`. 넣는 처방·빼는 처방 두 칸, 조건 칸, 찾기 칸 종류 셋(`in`·`out`·`cond`), 묶음째 고르기, [지우기], 글(AC-3711) |
| `TreatmentTrendSection.tsx` | 설명 글·아래 안내 글 바꿈, 줄마다 그래프 모양 상태(`Record<rowKey, ChartMode>`)를 열린 칸에 넘김, 고치기 찾기 목록 줄에 빼는 처방·조건 처방도 더함(AC-3712.2) |

- 찾기 칸 상태: `{ key: 묶음 열쇠, kind: 'in' | 'out' | 'cond', code?: 넣는 처방 }` 하나(한 번에 하나 열림). id는 지금 규칙(`{base}-{key}-{part}`)에 `add-out`·`search-out`·`cadd-{at}`·`search-cond-{at}`·`rm-out-{at}`·`crm-{at}-{n}`을 더한다
- 묶음째 고르기 단추: `ds.button.secondarySmall`. 찾기 목록 위 칸이며 상자 안 상자를 만들지 않는다(목록 층 안 맨 위 줄, 아래 1px line)
- 조건 칸: 왼쪽 2px warning 선 + `bg-warning-soft`, 안쪽 12px. 고치기 화면은 상자 안이 아니라 `nestedBoxes`에 걸리지 않는다
- 휴대폰: 처방 줄 단추 44px(`max-md:min-h-11`), 들여쓰기 없음(지금 규칙)

## 데이터 흐름
```
stats_rx_groups(+out_codes, cond) ⇄ statsRxGroups ⇄ useStatsRxGroups ─ StatsRxGroup[] → TreatmentTrendSection(보기·고치기)
                                                        └ forLoad() → groupDefs: [{ id: groupKey(codes, {out, cond}), codes, out?, cond? }]
비트: requestLoad(copyGroupDef) → stats Worker(loadJob → aggregate: 환자·날 코드 모음 → 셈 규칙) → toDayPayloads → fillGroupCounts → stats_days
파일: runAnalysis(copyGroupDef) → analyzeFiles(aggregate) → 같은 길
stats_days → treatmentRows(열쇠) → TreatmentTable(+ periodPatients)
          └ chartCells·trendFit·trendText → TreatmentDetail(StackedBarChart trend | RateLineChart)
AI: store.loadReportMonths → stats_rx_groups(name, codes, out_codes, cond) → groupKey → 이름
```
- Worker로 가는 것: 열쇠·넣는 처방·빼는 처방·조건 코드뿐(이름 없음). 서버로 가는 것: 묶음 이름·세 코드 칸·차례, 일 줄 묶음 숫자. 환자 칸은 어디에도 없다

## 결정과 트레이드오프

### 모은 뒤 판단 (aggregate)
- 빼는 처방은 같은 날 어느 줄에든 있을 수 있어 줄마다 바로 더할 수 없다. 묶음 코드가 든 줄만 환자·날마다 코드 번호 Set으로 모은다. 묶음 없는 불러오기(대시보드 등)는 모을 것이 없어 지금과 같은 일을 한다
- 빼는 처방이 없는 묶음도 같은 길로 센다(길을 둘로 두지 않는다). 숫자가 같음은 AC-3703.7 시험(지금 묶음 시험을 그대로 돌림)이 증명한다

### 열쇠에 빼는 처방·조건 넣기, 없으면 지금 글자 그대로
- 열쇠가 "무엇으로 셌나"의 지문이라, 빼는 처방·조건을 바꾸면 옛 숫자가 숨겨져야 한다(결정 13). 없으면 지금 글자 그대로라 기능을 올려도 지금 묶음이 숨겨지지 않는다(결정 14)
- 다른 후보(묶음마다 판 번호 칸)는 treatment-trend design.md '다시 불러오기 판단'에서 버린 까닭이 그대로다

### 조건은 넣는 처방에 붙은 목록
- `cond`를 넣는 처방 코드 → 목록으로 두면 "넣는 처방을 지우면 조건도 없어진다"(결정 17)가 저절로 맞고, DB도 "code는 그 줄 넣는 처방"으로 막는다
- JSON 배열(`[{ code, unless }]`)로 둔다. 표를 하나 더 두면 목록 통째 저장 함수가 표 둘을 맞춰야 해 복잡해진다. 칸 하나 + 검사 함수로 같은 효과를 낸다(`plan.md §0` DB 제약)

### 추세선에서 빗금 칸을 뺀다 (결정 15)
- 90일 보기의 처음·끝 주, 12개월 보기의 이번 달, 오늘 진료 중인 날은 칸이 덜 차서 건수가 작다. 넣으면 선이 끝에서 끌려 내려간다. % 모양은 덜 찬 칸도 비율은 맞지만, 두 모양의 규칙을 하나로 두어 글로 설명하기 쉽게 한다

### 총환자는 저장된 날만
- 건수도 저장된(덮인) 날만 세므로 둘을 같은 날로 맞춘다. 기간 일부만 불러왔으면 둘 다 그만큼만이라 비율이 틀어지지 않는다

### 그래프 모양은 칸 상태
- 열린 칸(`TreatmentDetail`)은 줄을 닫으면 사라져 그 안에 상태를 두면 [건수]로 돌아간다. 칸(`TreatmentTrendSection`)이 줄 열쇠마다 든다(AC-3709.7). 저장소는 쓰지 않는다

## 시안과 다른 곳
| 시안 | 실제 | 까닭 |
|---|---|---|
| 노란 시안 줄·`새 칸` 칩·정하신 내용·제가 정한 부분 | 없음 | 시안에서만 쓰는 표시 |
| 고치기 아래 안내 "넣는 처방이나 빼는 처방을 바꾼 묶음과…" | "넣는 처방·빼는 처방·조건을 바꾼 묶음과…" | 조건을 바꿔도 열쇠가 바뀌어 다시 불러와야 한다 |
| 다시 불러와야 하는 묶음 안내 "새로 만들었거나 처방을 바꿔서, 다시 불러온 뒤부터" | 지금 앱 글 "이 기간을 다시 불러와야 숫자가 나와요" 그대로 | treatment-trend '시안과 다른 곳'과 같은 까닭(숨긴 까닭을 가를 수 없다) |
| 추세선은 쉬는 날만 뺌 | 쉬는 날과 빗금 칸을 뺌 | 결정 15. 시안은 덜 찬 칸이 없는 지어낸 자료다 |
| 안내 "일요일은 쉬는 날이라 비어 있고" | 지금 `detailNote` + "추세선은 쉬는 날(총환자 0명)과 빗금 칸을 빼고 그었어요." | 시안 자료에만 맞는 글이다(treatment-trend와 같다) |
| 12개월 비교 머리 "지난 12개월보다" | 지금 앱 글 "작년 같은 12달보다" | treatment-trend '시안과 다른 곳' 그대로 |
| 막대 위 합계 휴대폰 8칸 이상 숨김 | 지금 `thinTotals`·13칸 규칙 | treatment-trend와 같다. 꺾은선 점 위 글도 13칸 넘으면 없다 |
| `<details>` [숫자로 보기] | `DetailToggle`(지금 그대로) | 통계 칸의 표 열기 부품이 하나다 |
| 추세 글 상자(흰 바탕 + 왼쪽 선) | 왼쪽 2px ink 선 + 글(바탕 없음) | 열린 칸이 canvas 바탕 상자라 상자 안 상자(`nestedBoxes`)를 피한다 |
| 조건 칸 들여쓰기·간격 단계 밖 값 | 가까운 간격 단계 | `classes.test.ts` 간격 단계 |
| 그래프 모양 단추 상태: 묶음마다 기억(시안 state.mode) | 같다. 다만 화면을 새로 열면 [건수] | 저장소를 쓰지 않는다(결정 16) |
| 시안 % 꺾은선의 점·글자 크기 | 점 8px·글 12px(`text-caption`) | 앱 차트 글자 단계 |
| 추세 글 숫자 반올림(`Math.round`·`toFixed`) | 버림(정수는 소수 버림, 아니면 소수 첫째 자리까지 버림) | 앱 비율·증감 글이 모두 버림이다(`formatRate`·`truncatedOne`) |
| 표가 총환자를 따로 받음(시안 `totals()`) | 표가 `input`으로 직접 셈 | prop을 늘리지 않아 Phase 사이 타입 검사가 지난다 |

## 다른 기능에 미치는 것
- **지금 묶음**: 빼는 처방·조건이 없으면 열쇠·숫자가 그대로라 다시 불러오지 않아도 된다
- **AI 리포트**: 묶음 이름 읽기에 두 칸이 더해진다. 빼는 처방 묶음도 이름이 붙는다(달 줄에 그 열쇠가 있을 때)
- **처방 골라 보기·처방별 신환·재진·대시보드·환자 명단**: 그대로
- **일 줄 크기**: 열쇠 수는 묶음 수와 같아(최대 50) 지금 한도 안이다
- **비트 PC 부담**: 도우미 요청은 그대로. Worker 셈이 묶음 코드가 든 줄만큼 조금 는다

## 기존 명세·시험과의 관계
- 승인된 명세는 고치지 않는다(treatment-trend·ai-report-stats·stats-core 승인 그대로)
- 이 명세가 대신하는 AC: treatment-trend AC-1201.1의 설명 글자(→ AC-3708.7), AC-1207.8의 아래 안내 세 글(→ AC-3708.6), AC-1209의 열린 칸 표 칸·제목(→ AC-3709.1·3709.6), AC-1210의 안내 글·[빼기] 글자(→ AC-3711.1·3711.3·3711.10), AC-1213.4의 저장 본문 열쇠(→ AC-3713.1), ai-report-stats AC-2002.1의 select 글자(→ AC-3702.4). 그 시험의 기대 글자만 고친다
- 함께 고치는 시험(알려진 것): `TreatmentTrendSection.test.tsx`(설명·안내 글), `TreatmentTable.test.tsx`(머리 칸·줄 칸 수), `TreatmentDetail.test.tsx`(제목·표 칸), `TreatmentGroupEditor.test.tsx`([빼기] → [지우기], 안내 글), `statsRxGroups.test.ts`(select 글자·보내는 칸), `useStatsRxGroups.test.ts`(제안 모양), `treatmentEdit.test.ts`(`forSave` 모양), `store.test.ts`(select 글자), `e2e/treatment-trend-privacy.spec.ts`(`GROUP_BODY_KEYS`)
- `aggregate.test.ts`의 묶음 시험(stats-core AC-006.3·treatment-trend AC-1205.2)은 그대로 통과해야 한다(AC-3703.7)

## 사용자가 할 일
1. **사이트에 올리기 전에** `supabase/migrations/20261112000000_stats_rx_groups_exclude.sql` 전체를 운영 Supabase SQL 편집기에 붙여 한 번 실행한다. 빠뜨리면 처방별 추세 칸이 묶음 읽기 오류를 보이고, AI 리포트 만들기가 실패한다
2. 올린 뒤 [묶음 고치기]에서 기본 PT 묶음을 만든다(이름·넣는 처방·빼는 처방·조건)
3. 비트 PC에서 보고 싶은 기간을 한 번 다시 불러온다(1년을 보려면 최근 12개월)

## 위험 / 미해결 질문
- 옛 앱이 열린 채 새 표에 저장하면(올린 직후 새로 고치지 않은 탭) 고친 줄의 빼는 처방·조건은 그대로 남는다(저장 함수가 없는 열쇠는 지금 값을 둔다). 다만 그 탭이 넣는 처방을 바꾸면 남은 조건이 넣는 처방에 없어 칸 검사에 걸려 저장이 실패할 수 있다. 탭을 새로 열면 된다. 드물다
- 조건 처방이 다른 묶음의 넣는 처방이면, 그 묶음을 고쳐도 조건은 따라 바뀌지 않는다(복사가 아니라 코드 글자라 그 코드 그대로다). 묶음째 고르기와 같은 규칙이다
- 지문 겹침은 확률로만 막는다(treatment-trend와 같다)
- 화면 확인·E2E는 `next build`나 개발 서버가 필요하다. E2E는 사용자가 SQL을 붙이고 시험 계정이 있어야 돈다
