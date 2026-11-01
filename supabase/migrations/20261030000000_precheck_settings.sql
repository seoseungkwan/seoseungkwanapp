-- 청구 사전점검 설정 DB: 점검 규칙(claim_rule_settings)·병원 문구와 상병 연결표(claim_hospital_settings)·문자 문구(message_templates)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql이 들어가 있어야 한다(hospitals 표).
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 사용자(authenticated)만 자기 병원 줄을 보고 고친다.
-- hospital_id는 DB 기본값으로만 들어가고(열 권한 없음), updated_at은 트리거로만 바뀐다. 환자 자료는 이 표들에 들어가지 않는다

-- 공용 함수 둘은 다른 기능(업무일지·환자·매출)의 마이그레이션도 만든다. 어느 쪽이 먼저 들어가도 붙여 넣어지게 create or replace로 쓴다
-- 승인된 내 병원 id. 승인되지 않았거나 병원이 없으면 null → 아래 정책에서 어떤 줄과도 같지 않아 줄이 보이지 않고 넣기도 거부된다
create or replace function public.my_hospital_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved'
$$;

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon에도 준다. 다 거두고 authenticated에만 준다
revoke all on function public.my_hospital_id() from public, anon, authenticated;
revoke all on function public.touch_updated_at() from public, anon, authenticated;
grant execute on function public.my_hospital_id() to authenticated;
grant execute on function public.touch_updated_at() to authenticated;

-- 줄이 없는 규칙은 규칙표 기본값을 따른다([기본값으로]는 그 줄을 지운다). grade null = 규칙표 기본 등급
create table public.claim_rule_settings (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[A-Z]{2}-[0-9]{2,3}[a-z]?$'),
  enabled boolean not null,
  grade text check (grade in ('확인필요', '알림', '참고')),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, rule_id)
);

-- 병원 문구 + 상병 연결표(원본 설정 모양 그대로 jsonb 하나씩). 병원마다 한 줄
create table public.claim_hospital_settings (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  phrases jsonb not null check (jsonb_typeof(phrases) = 'object' and pg_column_size(phrases) < 262144),
  dx_links jsonb not null default '[]' check (jsonb_typeof(dx_links) = 'array' and pg_column_size(dx_links) < 262144),
  updated_at timestamptz not null default now()
);

create table public.message_templates (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  kind text not null check (kind in ('injection', 'followup')),
  name text not null check (char_length(name) between 1 and 30),
  body text not null check (char_length(body) between 1 and 2000),
  sort_order int not null default 0 check (sort_order between 0 and 99),
  updated_at timestamptz not null default now()
);

create trigger claim_rule_settings_touch before update on public.claim_rule_settings
  for each row execute function public.touch_updated_at();
create trigger claim_hospital_settings_touch before update on public.claim_hospital_settings
  for each row execute function public.touch_updated_at();
create trigger message_templates_touch before update on public.message_templates
  for each row execute function public.touch_updated_at();

alter table public.claim_rule_settings enable row level security;
alter table public.claim_hospital_settings enable row level security;
alter table public.message_templates enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.claim_rule_settings, public.claim_hospital_settings, public.message_templates from anon, authenticated;

-- 넣기·고치기는 칸 단위: hospital_id·updated_at·id는 뺀다(남의 병원으로 쓰지 못하게, 바꾼 날을 꾸미지 못하게).
-- 지우기는 [기본값으로]용 claim_rule_settings와 message_templates만. 병원 문구 줄은 지우지 않는다
grant select, delete on table public.claim_rule_settings to authenticated;
grant insert (rule_id, enabled, grade), update (rule_id, enabled, grade) on table public.claim_rule_settings to authenticated;
grant select on table public.claim_hospital_settings to authenticated;
grant insert (phrases, dx_links), update (phrases, dx_links) on table public.claim_hospital_settings to authenticated;
grant select, delete on table public.message_templates to authenticated;
grant insert (kind, name, body, sort_order), update (kind, name, body, sort_order) on table public.message_templates to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인 안 된 병원은 null이라 아무 줄과도 같지 않다
create policy "승인된 내 병원 줄만" on public.claim_rule_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "승인된 내 병원 줄만" on public.claim_hospital_settings
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
create policy "승인된 내 병원 줄만" on public.message_templates
  for all to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
