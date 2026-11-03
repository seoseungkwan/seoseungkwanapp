-- 통계 탭 '처방 골라 보기'에서 고른 처방(stats_rx_picks)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다. 사이트에 올리기 전에 붙인다. 표가 없으면 이 칸만 읽기 오류를 보인다.
--
-- 왜: 고른 처방을 휴대폰과 컴퓨터에서 같이 보려고 계정에 둔다. 환자 자료 구역에는 브라우저 저장소를 쓰지 않는다.
-- 처방 코드와 이름뿐이고(통계 일 숫자에 이미 있는 값) 환자 칸은 없다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 줄을 읽고 넣고 지운다.
-- hospital_id·pick_order는 칸 권한이 없어 DB가 정한다. 고치기는 아무에게도 없다(뺐다가 다시 넣으면 맨 뒤로 간다)

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.stats_rx_picks (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  code text not null check (char_length(code) between 1 and 100 and code !~ '[[:cntrl:]]'),
  name text not null check (char_length(name) <= 100 and name !~ '[[:cntrl:]]'),
  pick_order bigint generated always as identity,
  primary key (hospital_id, code)
);
-- 앱은 코드 대소문자를 가리지 않는다(buildTrend). 대소문자만 다른 코드를 또 고르지 못하게
create unique index stats_rx_picks_code_once on public.stats_rx_picks (hospital_id, upper(code));

alter table public.stats_rx_picks enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.stats_rx_picks from anon, authenticated;
grant select, delete on table public.stats_rx_picks to authenticated;
grant insert (code, name) on table public.stats_rx_picks to authenticated;
-- Supabase는 순서표에도 기본 권한을 준다. 넣기는 이 권한이 없어도 된다(identity 칸은 순서표 권한을 보지 않는다)
revoke all on sequence public.stats_rx_picks_pick_order_seq from anon, authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
create policy "내 병원 고른 처방 읽기" on public.stats_rx_picks
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 고른 처방 넣기" on public.stats_rx_picks
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
create policy "내 병원 고른 처방 지우기" on public.stats_rx_picks
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));
