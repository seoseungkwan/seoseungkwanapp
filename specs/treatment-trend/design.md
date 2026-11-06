# 설계: 통계 처방별 추세

## 개요
- 통계 탭의 처방 추세(`RxTrendSection`, 많이 낸 처방 5가지) 자리를 전체 폭 칸 **처방별 추세**(`TreatmentTrendSection`)로 바꾼다. 줄은 총괄이 만든 묶음이다
- 묶음은 새 표 `stats_rx_groups`에 둔다(매출 `rx_groups`와 따로). **새 표라서 사용자가 SQL 파일을 운영 Supabase에 손으로 붙여 넣어야 하고, 사이트에 올리기 전에 해야 한다**('사용자가 할 일')
- 묶음별 건수는 불러올 때 센다. 환자 줄은 불러오는 순간 Worker 안에만 있고, 저장된 일 숫자에는 환자가 누구인지가 없다. 그래서 "같은 환자·같은 날·같은 묶음 = 1건"은 그때만 셀 수 있다. 이미 있는 길을 쓴다: 저장 모양(`DayPayload.groups`)·검사(`validate.ts`)·셈(`aggregate`의 그룹 셈)이 다 있고, 지금은 아무 길도 묶음을 넘기지 않아 저장된 날의 `groups`가 늘 `[]`이다
- 저장된 숫자가 지금 묶음 처방으로 센 것인지는 **묶음 열쇠 = 처방 코드 모음의 지문**으로 가린다(아래 '다시 불러오기 판단'). DB 칸·저장 모양·검사를 바꾸지 않는다
- 화면 숫자는 처방 골라 보기·처방 추세가 쓰는 함수(`rxPickRows`·`rxDetail`·`rxComparedCells`, `view.ts`)를 그대로 쓴다. 묶음 줄을 "코드가 열쇠인 처방 줄"로 바꾼 가상 입력을 넘긴다. 그래서 증감·짝 빼기·일부 기간 규칙이 처방 추세와 한 글자도 다르지 않다

## 코드로 확인한 것 (부탁받은 사실을 코드에 다시 대 봄)
| # | 사실 | 확인 결과 | 근거 |
|---|---|---|---|
| 1 | 저장 모양에 묶음 칸이 이미 있다 | 맞음. 일 줄 `groups: [{ id, patients, newPatients, returning }]`, 달 줄은 `followup`도. 열쇠 밖은 거부(`exactly`) | `types/payload.ts`, `validate.ts:15`(`GROUP_ID`)·`:119` |
| 2 | `aggregate`가 묶음 정의를 받아 환자·날 기준으로 센다 | 맞음. 같은 환자·같은 날·같은 묶음의 여러 줄은 그날 칸에서 한 명(`newGroupDays`). 일 칸 `patients` = 그날 그 묶음 환자 수 = 건 | `aggregate.ts:161`·`:204`·`:213` |
| 3 | 어느 길도 묶음을 넘기지 않는다 | 맞음. 파일 길 `runAnalysis(files, { today })`(묶음 없음), 비트 길 `aggregate(..., [], toPatientDays(...))` | `SourcePicker.tsx:46`, `workers/stats/jobs.ts:42`, `StatsScreen.tsx:232`·`:244` |
| 4 | 그래서 저장된 날은 `groups: []`다 | 맞음. `toDayPayloads`가 칸의 `groups`를 그대로 옮긴다 | `toDayPayloads.ts:29` |
| 5 | `aggregate`는 그날 환자가 없는 묶음 줄을 만들지 않는다 | 맞음(stats-core AC-006.3 "그 칸에 환자가 없는 그룹은 빠진다"). **"0건"과 "세지 않음"을 가를 수 없다** → 저장 직전에 0줄을 채운다(`fillGroupCounts`) | `aggregate.ts` `toStats`, `aggregate.test.ts` "그 칸에 환자가 없는 그룹은 빠지고" |
| 6 | `aggregate`의 묶음 코드 맞추기는 대소문자를 가린다 | 맞음(`groupsOf.get(row.rxCode)`). 화면 쪽(`buildTrend`·`codeKey`)은 가리지 않는다 → 묶음도 가리지 않게 바꾼다(지금 묶음을 넘기는 길이 없어 바뀌는 숫자가 없다) | `aggregate.ts:130`, `rxTrend.ts` `codeKey` |
| 7 | 일 줄은 65,536바이트까지, 완전한 줄은 덜 덮인 줄로 안 바뀐다 | 맞음. 넘으면 그 저장 전체가 실패한다 | `20261101000200_stats.sql:46`·`:110` |
| 8 | 비트 불러오기는 고른 기간과 비교 기간을 함께 읽는다 | 맞음. `range.load` = 비교 기간 첫날이 든 달 1일 ~ 오늘 | `view.ts` `statsRange`, `StatsScreen.tsx:232` |
| 9 | 처방 추세 함수를 다른 칸이 쓴다 | `RxPickDetail.tsx:10`·`RxPickDetail.test.tsx:11`이 `longLabel`·`tickLabel`·`comparisonAt`·`detailNote`를 `RxTrendSection`에서 불러온다. `rxList`는 `RxTrendSection`만 쓴다 | 위 파일 |
| 10 | 다른 기능이 처방 추세 숫자를 읽는가 | 아니다. 원장님 보고 문장은 비트로 불러온 보고 숫자(`ReportSection`), 대시보드 '처방 상위'는 자기 `topRx`(`dashboard/summary/view.ts`)와 비트 바로 읽기, AI 리포트는 달 줄 `groups`를 쓰지만 달 읽기가 아직 늘 없음 | `ReportSection.tsx`, `DashboardAnalysis.tsx:216`, `lib/ai/input.ts:77`, `app/api/ai/store.ts:23` |
| 11 | 매출 묶음 함수를 다시 쓸 수 있다 | `suggestGroups`(제안 다섯, 규칙 `SUGGESTED_GROUPS`)·`deleteGroup`·`renameGroup`(이름 규칙 = DB 규칙)·`RxGroup` 모양은 그대로 쓴다. 매출 화면(`GroupEditor`)은 처방마다 고르기 상자를 두는 다른 모양이라 쓰지 않는다 | `lib/revenue/treatments.ts`, `types/rxGroups.ts` |
| 12 | 옛 migration은 운영에 들어가 고칠 수 없다 | 새 파일로만 더한다. `touch_updated_at`은 두 갈래가 다른 글자로 만들어(`precheck_settings.sql:21` security definer, `revenue.sql:60` 아님) 이 파일은 그 함수를 부르지도 만들지도 않는다 | 두 파일 |

## 다시 불러오기 판단 (핵심 결정)
**묶음 열쇠 = 처방 코드 모음의 지문.** 불러올 때 묶음마다 `id = groupKey(codes)`로 세어 일 줄 `groups`에 넣는다. 화면은 지금 묶음의 `groupKey(codes)`가 있는 줄의 숫자만 쓴다.

- `groupKey(codes)`: 코드를 `codeKey`(대문자)로 바꾸고 겹침을 빼서 글자 차례(`a < b`)로 늘어놓아 `\n`으로 이은 글자의 UTF-8 바이트에 FNV-1a 64비트(BigInt, 시작 값 `0xcbf29ce484222325`, 곱 `0x100000001b3`, 2⁶⁴로 자름)를 하고 `t` + 소문자 16진수 16자리로 쓴다. `GROUP_ID`(`[A-Za-z0-9-]{1,64}`)를 지나므로 검사·DB를 바꾸지 않는다. 고정 값은 AC-1206.1
- 판단(묶음마다, 기간마다): 고른 기간의 저장된 일 줄이 **모두** 그 열쇠 줄을 가지면 숫자를 보인다. 아니면 `다시 불러오면 보여요`. 비교 기간도 모두 가지면 증감을 내고, 아니면 그 묶음만 비교하지 않는다(덮은 기간에서 비교 기간을 빼고 계산 → `comparable` null → `비교할 수 없음`, 회색 막대 없음)
- 0건 날도 열쇠 줄이 있어야 "센 날"이다. 그래서 저장 직전에 받은 열쇠마다 0줄을 채운다(`fillGroupCounts`, 사실 5)

왜 이것인가(다른 후보):
| 후보 | 왜 아닌가 |
|---|---|
| 묶음마다 `codes_changed_at`(DB) vs 일 줄 `updated_at` | 불러오는 동안 다른 기기가 처방을 바꾸면, 옛 처방으로 센 줄이 바뀐 시각 뒤에 저장되어 "맞음"으로 보인다(사용자 규칙 "옛 처방으로 센 숫자는 절대 안 보임"을 어긴다). 트리거·칸이 늘고 `stats_keep_complete`로 남은 줄의 시각도 따로 따져야 한다 |
| 묶음 uuid + 처방 판 번호(DB가 올림)를 열쇠로 | 맞게 돌지만 판 번호를 올리는 트리거와 칸이 필요하고, 같은 처방으로 되돌려도 다시 불러와야 한다. 지문은 DB에 아무것도 더하지 않는다 |
| 저장 모양에 `groupsRev` 같은 새 칸 | `validate.ts`가 모르는 열쇠를 거부하고, 칸을 더하면 `schemaVersion`·DB 제약·AI 검사를 함께 바꿔야 한다 |
| 일 줄 하나에 "센 묶음 판" 하나 | 묶음 하나만 바꿔도 모든 묶음이 다시 불러와야 한다. 이름·차례만 바꿨을 때 바로 보이는 규칙(결정 11)을 지키기 어렵다 |

이 결정으로 저절로 지켜지는 것:
- 이름·차례만 바꿈 → 열쇠 그대로 → 바로 보임(결정 11)
- 처방을 넣고 뺌·새 묶음 → 새 열쇠 → 다시 불러올 때까지 숨김. 다른 기기가 불러오는 도중에 고쳐도 숨김(경쟁이 없다)
- 처방을 예전 모음으로 되돌림 → 그 모음으로 센 줄이 있는 기간은 바로 보인다. 지금 처방으로 센 숫자라 규칙에 맞는다. 시안 말 "새로 만든 묶음은 다시 불러온 뒤부터"와 다른 드문 경우다(지운 묶음과 처방이 같은 새 묶음도 바로 보인다)
- 처음 쓸 때: 저장된 날에 묶음 줄이 하나도 없다 → 모든 묶음이 숨김 → "한 번 다시 불러오면 숫자가 나와요"(결정 17)
- 부분만 다시 불러옴(예: 7일만): 7일 보기에는 숫자, 30일 보기에는 숨김. 비교 기간만 옛날이면 숫자는 보이고 증감만 `비교할 수 없음`
- 지문이 겹칠 확률: 서로 다른 코드 모음 수만 개라도 10⁻¹¹ 아래다. 처방 하나는 한 묶음에만 들어 한 계정의 처방 든 묶음끼리는 모음이 늘 다르다

## 구성 요소 / 인터페이스

### DB: `supabase/migrations/20261105000100_stats_rx_groups.sql` (전체)
```sql
-- 통계 탭 '처방별 추세'의 묶음(stats_rx_groups)과 묶음 저장 함수(save_stats_rx_groups)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 처방별 추세 칸만 읽기 오류를 보이고 다른 칸·불러오기는 그대로다.
--
-- 왜: 매출 탭 묶음(rx_groups)과 따로 둔다. 한쪽을 고쳐도 다른 쪽은 그대로다(2026-11-05 사용자 결정). 휴대폰과 컴퓨터가 같은 묶음을 보려고 계정에 둔다.
-- 묶음 이름·처방 코드·차례뿐이고 환자 칸은 없다. 처방 코드는 통계 일 숫자(stats_days)에 이미 있는 값이다.
--
-- 권한: rx_groups와 같은 모양이다. 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 고치고 지운다.
-- hospital_id·id·updated_at은 칸 권한이 없어 DB가 정한다. 처방 하나는 한 병원의 한 묶음에만 든다(대소문자 무시, 저장이 끝날 때 검사).
-- 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- 코드 목록: 1000개까지, 칸마다 1~100자, 제어 문자 없음. 통계 일 숫자의 코드 규칙(validate.ts isCode, 100자)보다 좁지 않다
create function public.stats_rx_group_codes_ok(codes text[]) returns boolean language sql immutable set search_path = ''
  as $$ select cardinality(codes) <= 1000 and coalesce(bool_and(c is not null and char_length(c) between 1 and 100 and c !~ '[[:cntrl:]]'), true) from unnest(codes) c $$;
  -- bool_and는 null을 건너뛰므로 c is not null을 같이 본다(null 칸 거부)
-- CHECK는 넣는 사람 권한으로 도니 authenticated에게는 남긴다. anon만 /rest/v1/rpc/로 못 부르게 막는다
revoke all on function public.stats_rx_group_codes_ok(text[]) from public, anon;
grant execute on function public.stats_rx_group_codes_ok(text[]) to authenticated;

create table public.stats_rx_groups (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 30 and name = btrim(name)
                             and name !~ '[[:cntrl:]]' and name !~ '[0-9]{6,}'),   -- rx_groups와 같은 울타리
  codes text[] not null default '{}' check (public.stats_rx_group_codes_ok(codes)),
  sort_order integer not null default 0 check (sort_order between 0 and 49),
  updated_at timestamptz not null default now(),
  unique (hospital_id, name) deferrable initially deferred);   -- 이름 맞바꾸기를 한 저장 안에서 허용(끝에 검사)

-- 트리거만 부른다
create function public.stats_rx_groups_touch() returns trigger language plpgsql set search_path = ''
  as $$ begin new.updated_at := now(); return new; end $$;
revoke all on function public.stats_rx_groups_touch() from public, anon, authenticated;
create trigger stats_rx_groups_updated_at before update on public.stats_rx_groups for each row execute function public.stats_rx_groups_touch();

-- 처방 하나는 한 병원의 한 묶음에만(대소문자 무시, 한 묶음 안 두 번도 막음). 한 저장 안에서 묶음 사이로 옮길 수 있게 끝(commit)에 본다.
-- 부른 사람 권한으로 돌아 RLS가 자기 병원 줄만 보인다
create function public.stats_rx_groups_code_once() returns trigger language plpgsql set search_path = ''
as $$
begin
  if exists (
    select 1 from public.stats_rx_groups g cross join lateral unnest(g.codes) as c(code)
     where g.hospital_id = new.hospital_id
     group by upper(c.code) having count(*) > 1
  ) then
    raise exception 'code in two groups' using errcode = '23505';
  end if;
  return null;
end $$;
revoke all on function public.stats_rx_groups_code_once() from public, anon, authenticated;
create constraint trigger stats_rx_groups_code_once after insert or update on public.stats_rx_groups
  deferrable initially deferred for each row execute function public.stats_rx_groups_code_once();

-- 묶음 목록 한꺼번에 저장(save_rx_groups와 같은 규칙. 부른 사람 권한, RLS 그대로, 한 트랜잭션이라 도중 실패면 아무것도 안 바뀜)
create function public.save_stats_rx_groups(groups jsonb) returns setof public.stats_rx_groups language plpgsql security invoker set search_path = ''
as $$
declare g jsonb; keep uuid[] := '{}'; gid uuid;
begin
  if groups is null or jsonb_typeof(groups) <> 'array' or jsonb_array_length(groups) > 50 then raise exception 'bad groups'; end if;
  for g in select * from jsonb_array_elements(groups) loop
    if jsonb_typeof(g->'codes') is distinct from 'array' then raise exception 'bad groups'; end if;
    gid := nullif(g->>'id', '')::uuid;
    if gid is null then   -- 새 묶음은 넣기만(줄은 id로만 고른다)
      insert into public.stats_rx_groups (name, codes, sort_order)
        values (g->>'name', array(select jsonb_array_elements_text(g->'codes')), (g->>'sort_order')::int) returning id into gid;
    else
      update public.stats_rx_groups set name = g->>'name', codes = array(select jsonb_array_elements_text(g->'codes')), sort_order = (g->>'sort_order')::int
        where id = gid;
      if not found then raise exception 'not my group'; end if;   -- 남의 병원 id(RLS로 안 보임)
    end if;
    keep := keep || gid;
  end loop;
  delete from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() and not (s.id = any(keep));
  return query select * from public.stats_rx_groups s where s.hospital_id = public.my_hospital_id() order by s.sort_order;
end $$;
revoke all on function public.save_stats_rx_groups(jsonb) from public, anon;
grant execute on function public.save_stats_rx_groups(jsonb) to authenticated;

alter table public.stats_rx_groups enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_rx_groups from anon, authenticated;
grant select, delete on table public.stats_rx_groups to authenticated;
grant insert (name, codes, sort_order), update (name, codes, sort_order) on table public.stats_rx_groups to authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 통계 묶음 읽기" on public.stats_rx_groups
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 넣기" on public.stats_rx_groups
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 고치기" on public.stats_rx_groups
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 통계 묶음 지우기" on public.stats_rx_groups
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
```
- 시험(`supabase/statsRxGroups.rls.test.ts`)은 `revenue.rls.test.ts`·`rxPicks.rls.test.ts`와 같은 PGlite 흉내다. 코드 겹침 검사는 끝에 돌므로 시험은 `begin … commit`(또는 함수 부름 하나)으로 보고, 오류 번호 `23505`를 본다
- 위 SQL은 설계의 기준이다. 시험이 PGlite에서 다르게 돌면(예: 묶음 제약 트리거 문법) 같은 뜻으로 고치되 칸·권한·규칙은 바꾸지 않는다

### 저장 코드 (`src/lib/storage/statsRxGroups.ts`)
```ts
type Deps = { client?: Pick<SupabaseClient, 'from' | 'rpc'> }   // stats.ts의 SupabaseLike는 'from'뿐이라 따로 둔다
export class StatsRxGroupStoreError extends Error { readonly code: ErrorCode }
export function listStatsRxGroups(deps?: Deps): Promise<RxGroup[]>      // select('id,name,codes,sort_order').order('sort_order')
export function saveStatsRxGroups(after: readonly RxGroup[], deps?: Deps): Promise<RxGroup[]>  // rpc('save_stats_rx_groups', { groups: [{ id, name, codes, sort_order }] })
```
- `rxPicks.ts`와 같은 모양(`deps?.client ?? supabaseBrowser()`, 실패는 번호 하나). `rxGroups.ts`를 고치지 않고 따로 둔다(표 이름이 다르고, 매출 쪽 시험을 건드리지 않으려고)
- `src/types/errors.ts`·`src/lib/errors.ts`에 `E-STATS-GROUP-READ-FAILED`·`E-STATS-GROUP-SAVE-FAILED`(글은 AC-1203.4)
- `src/types/rxGroups.ts`·`src/lib/storage/rxGroups.ts` 머리 주석의 "통계 탭이 합친 뒤 다시 쓴다"를 "통계 처방별 추세는 같은 모양(`RxGroup`)을 쓰지만 표는 따로(`stats_rx_groups`)"로 고친다(주석만)

### 불러올 때 세기 (환자 자료 구역, 순수 함수)
```ts
// src/lib/analytics/aggregate.ts (고침): 묶음 코드 맞추기를 대소문자 무시로. 처방 번호(rxCodes)마다 한 번만 찾아 둔다(10만 줄 1초 시험 유지)
// src/lib/payload/groupCounts.ts (새 파일)
export function fillGroupCounts(days: readonly DayPayload[], ids: readonly string[]): DayPayload[]
```
- `fillGroupCounts`: 날마다 받은 id 중 빠진 것에 0줄을 더하고 id 글자 차례(`toDayPayloads`의 `compareText`)로 둔다. 받지 않은 id 줄은 남기지 않는다(`aggregate`는 받은 id만 만든다). 새 객체를 돌려준다
- `validate.ts`는 `GROUP_ID` 옆 주석만 "묶음 열쇠(`t` + 16진수 16자리, treatment-trend)"로 고친다. 검사 규칙은 그대로다

### 불러오기 길
```ts
// src/types/stats.ts
export type StatsLoadRequest = { type: 'load'; streamId: string; from: string; to: string; today: string; closeToday: boolean; groups?: RxGroupDef[] }  // 없으면 []로 본다
// src/workers/statsClient.ts
export function requestLoad(worker, req: { streamId; from; to; today; closeToday; groups?: readonly RxGroupDef[] }, opts?): Promise<StatsLoaded>  // 메시지에는 늘 groups 배열(없으면 []). { id, codes: [...codes] }만 골라 새로 만든다
// src/workers/stats/jobs.ts
createStatsHost(send).load({ streamId, from, to, today, closeToday, groups })  // loadJob에 groups ?? []를 함께 넘긴다
loadJob(text, { from, to, today, closeToday, groups = [] })  // aggregate(rows, groups, patientDays) → days: fillGroupCounts(toDayPayloads(result), ids)
// src/components/stats/useStatsWorker.ts
load({ range, today, closeToday, groups }: { …; groups?: Promise<readonly RxGroupDef[]> })  // stream을 먼저 열고, id를 받은 뒤 groups를 기다린다(없거나 거절이면 [])
// src/components/stats/SourcePicker.tsx
readFiles(files: File[], today: string, groups: readonly RxGroupDef[] = []): Promise<FileOutcome>  // runAnalysis(files, { today, groups }) → fillGroupCounts
```
- `createStatsHost.load`는 지금 요청에서 다섯 칸(`streamId`·`from`·`to`·`today`·`closeToday`)만 꺼내고 `loadJob`에 `{ from, to, today, closeToday }`만 넘긴다(`jobs.ts:176`·`:182`). 그대로 두면 비트 길에서 `groups`가 말없이 빠진다. TASK-7이 `groups ?? []`를 함께 꺼내 넘기게 고치고, 시험은 `loadJob`만 부르지 않고 `createStatsHost(...).load({ …, groups })`를 거쳐 `loaded` 답의 `view.days[].groups`에 열쇠가 있는지 본다. `stats.worker.ts`는 요청을 통째로 `host.load`에 넘기므로 그대로다
- `groups`는 `StatsLoadRequest`·`requestLoad`·`loadJob`·`useStatsWorker.load` 모두 선택 칸이다(없으면 `[]`). 그래서 고치지 않는 부르는 곳(대시보드 `readBitDays.ts:41`)과 다음 Phase에서 고칠 곳(`useStatsWorker.ts:56`은 TASK-14, `StatsScreen.tsx`는 TASK-15)이 Phase마다 타입 검사·빌드를 지난다. Worker로 가는 메시지에는 늘 `groups` 배열이 있다(없으면 `[]`)
- `analyzeFiles`·`runAnalysis`·`analyze.worker.ts`는 이미 묶음을 받는다(바꿀 것 없음)

### 화면 숫자 (`src/components/stats/treatmentView.ts`, 순수 함수, 시험은 가짜 일 줄)
```ts
export const GROUP_KEY = /^t[0-9a-f]{16}$/
export function groupKey(codes: readonly string[]): string
export function groupDefs(groups: readonly RxGroup[]): RxGroupDef[]          // 처방 든 묶음만, sortOrder 차례, 같은 열쇠 한 번
export function keyedIn(days: readonly DayPayload[], range: DateRange, key: string): boolean  // 기간 안 저장된 일 줄이 모두 그 열쇠 줄을 가짐(줄 없으면 참)
export function groupInput(input: StatsInput, key: string, name: string, compared: boolean): StatsInput
export type TreatmentRow =
  | { kind: 'empty'; group: RxGroup }
  | { kind: 'stale'; group: RxGroup; key: string }
  | { kind: 'ready'; group: RxGroup; key: string; compared: boolean; row: RxPickRow }
export function treatmentRows(input: StatsInput, groups: readonly RxGroup[]): TreatmentRow[]   // sortOrder 차례
export function treatmentDetail(input: StatsInput, item: Extract<TreatmentRow, { kind: 'ready' }>): { current: RxDetailPoint[]; previous: RxDetailPoint[] }
export function staleNames(rows: readonly TreatmentRow[]): { all: boolean; names: string[] }   // 처방 든 묶음 중 숨긴 것
export function uncomparedNames(rows: readonly TreatmentRow[]): string[]
export const rowKey: (group: RxGroup) => string   // 열린 줄 열쇠: id, 없으면(제안) 'new:' + 이름
```
- `groupInput`: 날마다 `rx`를 그 묶음 열쇠 줄 하나(`{ code: key, name, type: '', patients, newPatients, returning }`, 없으면 빈 목록)로 바꾼 가상 일 줄과, `compared`가 거짓이면 비교 기간을 뺀 덮은 기간. 이것을 `rxPickRows(groupInput, [{ code: key, name }])[0]`·`rxDetail(groupInput, key)`에 넘긴다. `view.ts`는 고치지 않는다
- 이름·`sortOrder`·제안 여부는 숫자에 쓰지 않는다. 숫자는 열쇠만 본다

### 고치기 규칙 (`src/components/stats/treatmentEdit.ts`, 순수 함수)
```ts
export function moveGroup(groups: readonly RxGroup[], index: number, step: -1 | 1): RxGroup[]
export function addBlankGroup(groups: readonly RxGroup[]): RxGroup[] | 'tooMany'      // 이름 '' 끝에, 50개면 'tooMany'
export function removeCode(groups: readonly RxGroup[], index: number, code: string): RxGroup[]
export function pickCode(groups: readonly RxGroup[], toIndex: number, code: string): { groups: RxGroup[]; from: string | null }  // 다른 묶음에서 codeKey로 빼고 끝에 넣음. from = 뺀 묶음 이름(빈 이름은 '이름 없는 묶음')
export function ownerOf(groups: readonly RxGroup[], code: string): number          // codeKey로 찾은 자리, 없으면 -1
export function draftProblem(groups: readonly RxGroup[]): { index: number; message: string } | null   // AC-1210.11 글, 첫 문제
export function forSave(groups: readonly RxGroup[]): RxGroup[]                       // 이름 trim, sortOrder 0부터
export function savedNote(before: readonly RxGroup[], after: readonly RxGroup[]): string   // AC-1210.12
```
- 이름 규칙은 `lib/revenue/treatments.ts`의 `renameGroup`(= DB CHECK)을 불러 쓴다. 빈 이름 칸이 있는 초안을 다루므로 `addGroup`은 쓰지 않는다
- 모든 함수는 받은 목록을 바꾸지 않고 새 목록을 돌려준다(매출 `treatments.ts`와 같은 규칙)

### 묶음 훅 (`src/components/stats/useStatsRxGroups.ts`)
```ts
export type StatsRxGroupsView = {
  state: 'reading' | 'ready' | 'read-failed'
  groups: readonly RxGroup[]        // sortOrder 차례. 저장된 줄이 없으면 제안 다섯(id null)
  suggested: boolean
  saving: boolean
  saveFailed: boolean
  reread(): void
  save(after: readonly RxGroup[]): Promise<boolean>  // forSave 값을 저장. 성공하면 groups가 돌려받은 줄이 된다
  forLoad(): Promise<RxGroupDef[]>                   // 거절하지 않고 부른 뒤 5초 안에 늘 풀린다(AC-1205.7·AC-1205.9·AC-1204.3)
}
export function useStatsRxGroups(days: readonly DayPayload[]): StatsRxGroupsView
```
- 처음 그릴 때 한 번 읽는다. 상태는 셋 중 하나다
  - (가) 읽는 중·읽기 실패
  - (나) **저장된 줄 없음**: `groups`는 그릴 때마다 지금 `days`로 다시 고른다: `suggestGroups(rxCatalog(days, [], isSavableLine).map(({ code }) => code))`(대소문자 합친 코드, 제안 다섯, `suggested: true`). 그래서 읽기가 `days`보다 먼저 빈 목록으로 끝나 처방 없는 제안이었다가, `days`가 오면 코드가 찬다
  - (다) **저장된 줄 있음**: 받은 줄 그대로(`suggested: false`)이고 `days`를 따라가지 않는다
- (나) → (다): [묶음 고치기] [저장] 성공, `forLoad` ②의 제안 저장 성공(돌려받은 줄이 상태가 된다), `forLoad` ①·[다시 읽기]가 줄을 받음. (다)에서 묶음을 모두 지우고 저장하면 (나)로 돌아간다(AC-1204.4)
- `forLoad`: ① 서버에서 다시 읽는다 → 줄이 있으면 그것으로 상태를 바꾸고 `groupDefs` ② 줄이 없으면 그때의 제안을, 처방 든 것이 있을 때만 저장하고(성공하면 (다), 실패는 무시) `groupDefs(그 제안)` ③ 읽기 실패면 상태가 (나)·(다)일 때 지금 묶음의 `groupDefs`, (가)이면 `[]`
- **기다림 한도 5초**(`FOR_LOAD_LIMIT_MS = 5_000`): `forLoad`는 부른 뒤 5초 안에 늘 풀린다. ①·②가 그 안에 끝나지 않으면 그때 화면의 묶음(③과 같은 규칙)으로 푼다. 늦게 끝난 읽기·저장은 묶음 상태만 바꾸고 이미 시작한 불러오기에는 쓰이지 않는다
  - 5초인 까닭: 읽기는 50줄 안의 작은 select 하나, 처음 한 번의 저장은 RPC 하나라 보통 1초 안이고, 무료 플랜이 잠에서 깨는 첫 요청도 1~2초다. 파일 길은 이 기다림 뒤에 Worker를 시작하므로 한도가 길면 그만큼 늦는다. 5초 넘게 답이 없으면 연결이 끊긴 것에 가깝고 그때는 일 숫자 저장도 실패할 것이라 더 기다릴 값이 없다. 비트 길은 도우미 읽기(수십 초)와 함께 기다리므로 보통 늦어지지 않는다
- 브라우저 저장소를 쓰지 않는다. 묶음은 React 상태와 서버 표에만 있다

### 화면 (`src/components/stats/sections/`)
| 파일 | 하는 일 | 받는 것 |
|---|---|---|
| `trendLabels.ts` | `RxTrendSection`에서 옮긴 글 함수 `longLabel`·`tickLabel`·`comparisonAt`·`detailNote`·`comparedNote`와 `GRAIN_NAME` | 기간·점 |
| `TreatmentTable.tsx` | 머리 줄·묶음 줄(준비·숨김·처방 없음)·열린 칸 자리 | `input`·`rows`·`opened`·`onToggle(key)`·`renderPanel(item)` |
| `TreatmentDetail.tsx` | 열린 칸: 제목·범례·막대·안내·[숫자로 보기] | `input`·`item` |
| `TreatmentGroupEditor.tsx` | 묶음 고치기 화면 전체(초안 상태는 이 안에만) | `groups`·`lines`·`counts`·`periodName`·`catalogState`·`onOpenCatalog`·`onRetryCatalog`·`saving`·`saveFailed`·`onSave`·`onCancel` |
| `TreatmentTrendSection.tsx` | 위 셋과 묶음 훅 값·찾기 목록 훅을 잇고 빈 상태·읽기 상태·안내 상자·아래 안내·`저장했어요` 줄·고치기 열고 닫기·열린 줄을 든다 | `input`·`saved`·`groups: StatsRxGroupsView`·`revision`·`className` |

- `DetailToggle.tsx`: 선택 prop `labels?: { closed: string; open: string }`(주지 않으면 지금 `자세히`·`접기` 그대로). 이 칸은 `{ closed: '숫자로 보기', open: '접기' }`
- `parts.tsx` `Section`: 선택 prop `headingRef`(묶음 고치기를 열 때 제목에 초점, AC-1210.2). 주지 않으면 지금 그대로
- 열린 칸 그림은 처방 추세 `RxDetail`과 같다. 다른 점: 전체 폭이라 `dense`는 칸 13개 넘을 때만(시안 `showTot = 칸 ≤ 13`), 단추 글자 `숫자로 보기`
- 찾기 목록은 처방 골라 보기의 `useRxCatalog`(넓은 범위, 처음 열 때 한 번)·`rxCatalog`·`searchCatalog`·`rxPeriodCounts`를 그대로 쓴다. 처방 골라 보기와 따로 한 벌이다

### 잇기
- `StatsScreen.tsx`: `const groups = useStatsRxGroups(data.input?.days ?? NO_DAYS)`. 비트 `load({ …, groups: groups.forLoad() })`(기다리지 않고 넘김), 파일 `readFiles(files, today, await groups.forLoad())`. `WAITING`의 넷째를 `{ title: '처방별 추세', place: 'col-span-12' }`, 다섯째를 `{ title: '처방별 신환·재진', place: 'col-span-12' }`로. `StatsSections`에 `groups`를 넘긴다
- `StatsSections.tsx`: `RxTrendSection` 자리에 `TreatmentTrendSection`(`col-span-12`), `RxSplitSection`은 `col-span-12`. `groups: StatsRxGroupsView`는 필수 prop이다
- `dashboard/briefing/features.ts`: 통계 칸 설명 글자의 `처방 추세`를 `처방별 추세`로(AC-1201.7)
- 지우는 파일: `sections/RxTrendSection.tsx`·`sections/RxTrendSection.test.tsx`(칸이 없어진다. 공용 글 함수는 `trendLabels.ts`로 옮긴 뒤)

## 데이터 흐름
```
stats_rx_groups ⇄ lib/storage/statsRxGroups ⇄ useStatsRxGroups ─ groups ─→ TreatmentTrendSection(보기·고치기)
                                                     └ forLoad() → groupDefs: [{ id: groupKey(codes), codes }]
비트: helper → 확장 → lib/bridge → stats Worker(loadJob: aggregate(rows, defs) → toDayPayloads → fillGroupCounts) → saveStats → stats_days
파일: runAnalysis(files, { groups: defs }) → analyzeFiles(aggregate) → toDayPayloads → fillGroupCounts → saveStats → stats_days
stats_days ─ readDays → useStatsData.input → treatmentRows(keyedIn·groupInput → rxPickRows) → TreatmentTable
                                           └ treatmentDetail(groupInput → rxDetail)  → TreatmentDetail
```
- Worker로 가는 것: 묶음 열쇠·처방 코드뿐(이름 없음). 서버로 가는 것: 묶음 이름·코드·차례(`stats_rx_groups`), 일 줄의 묶음 숫자(열쇠·세 숫자). 환자 칸은 어디에도 없다
- 환자 자료 구역(`lib/analytics`·`lib/payload`·`workers`)에 네트워크·저장소를 더하지 않는다. `lib/storage/statsRxGroups.ts`는 구역 밖이고 구역에서 부를 수 없다(지금 `eslint.config.mjs` 규칙 그대로)

## 결정과 트레이드오프

### 저장 위치: 새 표 `stats_rx_groups` (사용자 결정 1)
- `rx_groups`에 칸을 더하면(`kind`) 매출 화면·`save_rx_groups`가 모든 줄을 매출 묶음으로 읽고 지운다(rx-picker design.md '저장 위치' ①②와 같은 까닭). 코드 모양도 매출은 `^[0-9A-Za-z가-힣_.-]{1,30}$`라 통계 코드(100자, 빈칸·괄호)를 못 받는다
- 모양은 `rx_groups`를 따른다(목록 통째 저장 함수, 이름 고유, 같은 권한). 다른 점: 코드 규칙을 통계 코드에 맞춤, "처방 하나는 한 묶음에만"을 DB가 막음(`plan.md §0` 같은 효과면 DB 제약), 차례 0~49
- 목록 통째 저장이라 두 기기가 같이 고치면 나중 것이 이긴다. 지운 묶음 id를 다른 기기가 고치면 저장이 실패한다(매출과 같다, '위험')

### 0줄 채우기를 `aggregate`가 아니라 저장 직전에
- `aggregate`의 "환자 없는 묶음은 빠진다"는 승인된 stats-core AC-006.3이고 시험이 못 박았다. 일 줄 저장 모양에만 필요한 일이라 `lib/payload/groupCounts.ts` 새 함수로 두 길(파일·비트)이 부른다. 달 줄은 채우지 않는다(통계 화면이 달 줄을 읽지 않는다)

### 대소문자
- 화면은 코드를 대문자로 합친다(`codeKey`). 묶음에 `ESWT1`이 있는데 옛날 줄이 `eswt1`이면 화면 목록에는 한 줄인데 셈에서 빠진다. 그래서 `aggregate`의 묶음 맞추기와 `groupKey`, DB 겹침 검사를 모두 대소문자 무시로 맞춘다

### 제안 다섯은 보기만으로 저장하지 않는다
- 매출과 같이 "저장된 묶음이 없을 때만 제안"이다. 저장된 줄이 없는 동안 제안은 화면의 일 숫자를 따라 다시 고른다(묶음 훅 (나)). 다만 열쇠가 처방 모음이라, 불러올 때 쓴 제안 처방이 나중에 다시 고른 제안과 달라지면 또 숨겨진다. 그래서 처음 불러올 때 그 다섯을 저장해 굳힌다(AC-1204.3). 저장에 성공하면 그 뒤로는 일 숫자가 바뀌어도 묶음 처방이 그대로다(AC-1204.5)
- 제안 처방은 화면의 일 숫자(고른 기간 + 비교 기간)에서 고른다. 넓은 범위를 따로 읽지 않는다(처방 골라 보기의 넓은 읽기 횟수 시험과 겹치지 않고, 휴대폰 부담이 없다). 그 기간에 안 나온 코드(예: 7일 보기에서 한 번도 안 한 냉동치료)는 빠질 수 있고, 사용자가 [묶음 고치기]에서 넣는다
- 모두 지우고 저장하면 다음에 제안이 다시 보인다(표가 비어 "처음"과 가를 수 없다. 매출과 같다)

### 비교 기간이 옛 열쇠면 그 묶음만 비교하지 않는다
- 날마다 빼서 남은 날끼리 견줄 수도 있지만, 묶음마다 견준 날 수가 달라져 아래 안내 글(처방 추세 글은 한 줄)이 맞지 않는다. 비트 불러오기는 두 기간을 같이 읽으므로(사실 8) 이 경우는 파일로 일부만 넣었거나 다른 기간으로 불러왔을 때뿐이다. 그 묶음 이름을 안내 한 줄(AC-1208.4)로 알린다

### 묶음 훅을 통계 화면에 둔다
- 불러오기(`StatsScreen`)와 칸(`TreatmentTrendSection`)이 같은 묶음을 써야 한다. 훅은 `StatsScreen`에서 한 번 부르고 값을 칸에 넘긴다. 칸 시험은 가짜 값으로 훅 없이 돈다

### 처방 추세 칸을 지우고 글 함수는 옮긴다
- `RxTrendSection`은 그릴 곳이 없어진다. 처방 골라 보기가 쓰던 네 함수와 이 칸이 쓸 안내 글(`comparedNote`)을 `trendLabels.ts`로 옮기고 `RxPickDetail`의 불러오는 경로만 바꾼다(동작 그대로)
- `view.ts`의 `rxList`는 남긴다(쓰는 곳은 없어지지만 승인된 stats 시험이 붙어 있다. '범위 밖')

## 시안과 다른 곳 (까닭은 앱 규칙. 보고에 적는다)
| 시안 | 실제 | 까닭 |
|---|---|---|
| `바뀐 칸` 칩, 시안 줄, 견주기 접기, 정하신 내용·제가 정한 부분 | 없음 | 시안에서만 쓰는 표시 |
| 900px에서 쌓임 | 1024px에서 쌓임(`max-lg:`) | `classes.test.ts`가 `max-[…]` 폭 접두사를 막는다(md·lg·max-md·max-lg만). 칸 합계 폭(약 800px)도 7/12 칸에 들어가지 않는다 |
| (말 없음) 처방별 신환·재진 자리 | 전체 폭(`col-span-12`) | 이 칸이 전체 폭이 되어 그 옆자리가 없어진다. 내용은 그대로 |
| 일부 묶음 안내 "처방을 바꿔서, 다시 불러온 뒤부터" | "이 기간을 다시 불러와야 숫자가 나와요" | 숨긴 까닭(처방을 바꿈·새 묶음·그 기간을 아직 안 불러옴)을 저장된 숫자로 가를 수 없다 |
| 열린 칸 안내 "일요일은 쉬는 날이라 비어 있어요" | 처방 추세 `detailNote` 그대로 | 시안 자료에만 맞는 글이다 |
| `<details>` [숫자로 보기] | `DetailToggle` 단추(`숫자로 보기`↔`접기`) | 통계 칸의 표 열기 부품이 하나다 |
| 묶음 안 처방 들여쓰기 72px, 휴대폰 이름 칸 옆 80px 등 단계 밖 간격 | 가까운 간격 단계(64px 등) | 간격 단계(`classes.test.ts:636`)와 대괄호 금지 |
| 처음 쓸 때 다섯 묶음의 처방(지어낸 `도수`·`MA4`) | `SUGGESTED_GROUPS` 규칙에 맞는 실제 코드(도수치료는 코드가 정확히 `도수`인 것만) | 결정 4 |
| 새 묶음은 늘 "다시 불러온 뒤부터" | 지운 묶음과 처방 모음이 같으면 바로 보임 | 열쇠가 처방 모음이다. 지금 처방으로 센 숫자라 결정 11에 맞는다 |
| 없음 | 비교 기간만 옛 열쇠인 묶음: 증감 `비교할 수 없음` + 안내 한 줄(AC-1208.4) | 시안이 그리지 않은 상태 |
| 없음 | 저장된 숫자 없음(AC-1201.3)·이 기간 자료 없음(AC-1201.4)·묶음 읽는 중·읽기 실패(REQ-1211)·저장 실패(AC-1210.13)·찾기 목록 읽는 중·실패(AC-1210.8)·이름 규칙 글 셋(AC-1210.11)·50개 한도(AC-1210.9) | 다른 칸·매출 묶음 화면의 같은 상태 글을 따른다 |
| 처방 추세 칸 끝 "금액·소모량은 매출 탭에서 볼 수 있어요" | 없음 | 시안에 없다 |
| 12개월 머리 줄 "지난 12개월보다" | "작년 같은 12달보다"(`COMPARE_NAME['12m']`) | 앱 처방 추세 머리 줄·기간 줄의 비교 이름이 이 글이다. 7·30·90일은 시안과 같다 |
| 숫자 표 마지막 칸 "비교 기간" | 비교 이름(`COMPARE_NAME`: `지난 30일` 등) | 처방 추세 숫자 표(`RxDetail`)의 칸 이름이 이 글이다 |
| 휴대폰에서 막대 8칸 이상이면 막대 위 합계를 모두 숨김(`.tot.dense`) | 13칸 이상이면 마지막 칸 글자만 남김(`thinTotals`) | 통계 탭 다른 그래프의 휴대폰 규칙이 이것이다 |
| [저장] 글: 새 묶음은 처방이 없어도 "처방이 바뀜"으로 셈 | 처방이 든 새 묶음만 "바뀜"으로 셈(빈 새 묶음만 더했으면 "이름과 순서만 바뀌어서 바로 반영했어요") | 처방 없는 묶음은 다시 불러올 것이 없다(줄이 `넣은 처방이 없어요`라 숫자가 없다) |

## 다른 기능에 미치는 것
- **처방별 신환·재진**: 폭만 전체로. 숫자·글 그대로
- **처방 골라 보기**: `RxPickDetail.tsx`·`RxPickDetail.test.tsx`의 불러오는 경로 한 줄. 동작 그대로. 찾기 목록 넓은 읽기는 이 칸과 따로 한 벌이라 두 칸의 목록을 다 열면 넓은 범위를 두 번 읽는다
- **원장님 보고 문장·요일별 환자 수**: 그대로
- **대시보드 '처방 상위'**: 그대로(자기 `topRx`, 저장 숫자를 읽지 않음)
- **대시보드 비트 바로 읽기(`dashboard/live/readBitDays.ts`)**: 고치지 않는다. `requestLoad`에 묶음을 주지 않으므로 Worker 메시지에 `groups: []`가 실리고, Worker는 묶음 없이 세며(일 줄 `groups`는 빈 목록 그대로) 대시보드는 아무것도 저장하지 않는다. 바뀌는 것은 메시지를 못 박은 시험 한 줄(`readBitDays.test.ts:157`)뿐이다
- **대시보드 기능 목차 글(`dashboard/briefing/features.ts:23`)**: 통계 칸 설명 `환자 수 추이·신환 재방문율·처방 추세·요일별 환자 수`를 `환자 수 추이·신환 재방문율·처방별 추세·요일별 환자 수`로 바꾼다(TASK-15, AC-1201.7). 화면에 없는 칸 이름을 남기지 않으려고
- **AI 리포트**: 지금은 달 읽기가 늘 없음이라 그대로다. 이 기능 뒤 저장되는 **달 줄 `groups`에 묶음 열쇠(`t…`)가 든다**(`toMonthPayload`가 칸의 묶음을 옮긴다). AI 리포트가 달 줄을 읽게 되면 `groupNames`를 `stats_rx_groups`에서 `groupKey(codes) → name`으로 만들어야 하고, 옛 열쇠는 `이름 없는 그룹`이 된다. 그 명세가 정한다
- **일 줄 크기**: 묶음 50개면 하루 줄이 약 4KB 는다(AC-1205.8). 지금 64KB 한도에 가까운 날은 저장 전체가 실패할 수 있다('위험')
- **비트 PC 부담**: 도우미 요청은 그대로다. Worker의 셈이 묶음만큼 조금 는다(`aggregate` 10만 줄 1초 시험 유지)

## 기존 명세·시험과의 관계
- **승인된 명세는 고치지 않는다.** specs/stats·stats-core·rx-picker·revenue의 승인이 그대로다
- specs/stats REQ-513의 처방 추세 AC(513.1 차례 중 처방 추세 자리, 513.2·513.3·513.4·513.5·513.11·513.12)와 rx-picker AC-801.1·801.2(여덟 칸 차례·배치)는 이 명세의 REQ-1201·1207~1209가 대신한다. 그 시험 `RxTrendSection.test.tsx`는 칸과 함께 지운다
- TASK-15에서 함께 고치는 시험(알려진 것): `StatsScreen.test.tsx:58`(SECTIONS)·`:438-445`(load 요청에 `groups`)·`:1229-1234`·`:1611-1617`(배치)·`:1641-1664`(rx-picker AC-806.5의 처방 추세 줄 부분 → 처방별 추세 줄로), `PeriodSummary.test.tsx:53`(TITLES)·`:72`·`:76-80`(배치)·`:247`(검사 파일 목록)·`:320-327`(처방 줄 열기·`접기` 단추 수·`가짜 처방 일별 건수` 표). 두 파일에 `vi.mock('@/lib/storage/statsRxGroups', …)`를 더한다(기본: 저장된 묶음 하나, 넓은 읽기 횟수 시험 `:1599`이 바뀌지 않게)
- specs/stats AC-505.7(`specs/stats/requirements.md:57`, "Worker에는 기간·오늘·오늘 진료 끝 표시·통로 요청 id만 간다")은 새 칸 `groups`(묶음 열쇠·코드, 없으면 `[]`)에 한해 이 명세의 AC-1205.4가 대신한다. 다른 칸은 그대로 가지 않는다
- Worker `load` 메시지를 `toEqual`로 못 박은 승인된 시험 넷은 TASK-7에서 기대에 `groups: []`만 더한다(같은 Phase 끝 검사가 깨지지 않게): `statsClient.test.ts:55-58`(AC-505.7), `useStatsWorker.test.ts:205`, `StatsScreen.test.tsx:438-445`, `readBitDays.test.ts:157`(bit-dashboard AC-601.1, 그 AC 글은 칸 목록을 말하지 않아 대신할 것이 없다). 뒤에 TASK-14는 `useStatsWorker.test.ts:205`를 그대로 두고 진짜 묶음을 넘기는 시험을 더하고, TASK-15는 `StatsScreen.test.tsx:438-445`를 진짜 묶음을 넘기는 기대로 고친다
- tab-frame AC-316.3과 specs/stats AC-515.2가 못 박은 통계 칸 설명 글자의 `처방 추세`는 이 명세의 AC-1201.7이 `처방별 추세`로 대신한다. 시험 `features.test.ts:11`(표)·`:66`(AC-515.2 기대)을 TASK-15에서 고친다
- stats-core AC-006.3("한 코드가 여러 그룹에 있으면 각 그룹에", "환자 없는 그룹은 빠진다"): `aggregate`는 그대로 그렇게 센다. "한 묶음에만"은 통계 묶음 저장(DB·고치기 화면)의 규칙이고, 대소문자 무시는 넓힘이라 그 시험이 그대로 통과한다
- `plan.md §7`의 "한 코드가 여러 그룹에 들어가도 된다"(plan.md:140)는 계획 문서라 줄 끝에 이 묶음의 예외를 붙인다(AC-1214.2). `plan.md:141` "그룹을 바꾸면 이전 달은 파일을 다시 넣어야 반영된다(화면에 안내 한 줄)"와 이 설계가 같다

## 사용자가 할 일
1. **사이트에 올리기 전에** `supabase/migrations/20261105000100_stats_rx_groups.sql` 전체를 운영 Supabase SQL 편집기에 붙여 한 번 실행한다. 빠뜨리면 처방별 추세 칸만 오류 카드를 보이고 다른 칸·불러오기는 그대로다
2. 올린 뒤 비트 PC에서 **최근 12개월**을 고르고 [비트에서 불러오기]를 한 번 누른다(12개월 + 작년이 함께 읽혀 모든 기간 보기에 숫자가 나온다). 파일로 넣던 기간은 파일을 다시 넣는다
3. 묶음의 처방을 바꾸면 보고 싶은 기간을 다시 불러온다

## 위험 / 미해결 질문
- 처음 한 번은 다시 불러와야 한다(결정 17). 저장된 숫자가 전혀 없는 새 계정은 첫 불러오기 때 제안에 처방이 없어 묶음 숫자를 세지 못하고, 두 번째 불러오기부터 나온다(드묾)
- 불러올 때 묶음 다시 읽기가 실패하면 그 불러오기는 화면에 있던 묶음으로 센다. 화면이 묶음을 읽은 적도 없으면 묶음 없이 저장해, 그 기간 묶음 숫자가 숨겨진다(틀린 숫자는 아니고 다시 불러오면 된다)
- 묶음 다시 읽기가 5초 안에 끝나지 않으면 그 불러오기는 화면의 묶음으로 센다(위 '기다림 한도'). 다른 기기에서 막 고친 처방이면 그 묶음은 다시 불러올 때까지 숨겨진다(틀린 숫자는 아님)
- `supabase/migrations/20261101000200_stats.sql:116`은 완전한 줄을 덜 덮인 줄로 바꾸지 않는다. 그래서 [오늘 진료 끝]을 켜고 오늘을 불러온 뒤 묶음 처방을 바꾸고, 끄고 다시 불러오면 오늘 줄은 옛 열쇠 그대로 남는다. 그 묶음은 오늘이 든 보기에서 다음 날 다시 불러올 때까지 숨겨진다. 틀린 숫자는 보이지 않고 숨겨질 뿐이다
- 다른 기기에서 지운 묶음을 고쳐 저장하면 `not my group`으로 실패가 이어진다. 화면을 새로 열면 된다(글: AC-1203.4 저장 실패의 "계속되면 화면을 새로 열어 주세요")
- 하루 줄이 이미 64KB 가까이면 묶음 칸 때문에 그 저장 전체가 실패할 수 있다(실제 크기를 재지 못함). 묶음 수 한도 50과 짧은 열쇠로 늘어남을 4KB 안팎에 묶었다
- 지문 겹침은 확률로만 막는다(위 '다시 불러오기 판단')
- 화면 확인(TASK-17)·E2E(TASK-16)는 `next build`나 개발 서버가 필요해 이 서버(2 CPU·7.8GB·스왑 없음)에 다른 일이 없을 때 돌린다. E2E는 사용자가 SQL을 붙이고 시험 계정이 있어야 돈다
