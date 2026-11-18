-- 병원 정보 한 곳: 표 clinic_profiles(이름·전화·주소·호칭·요일별 진료시간·휴진일·원장님·직원·로고 자리)·로고 바구니(Storage) clinic-logos·
-- 예약 시행자 옮기기·데스크 문지기 이름(my_desk())·청구 입력 방식 칸(claim_hospital_settings.input_mode)
-- (spec clinic-profile REQ-6601·REQ-6610, ADR-033)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql·20261030000000_precheck_settings.sql(my_hospital_id()·claim_hospital_settings)·업무일지 넷
-- (20261101000100_worklog.sql·20261101000110_worklog_bit_fields.sql·20261105000200_worklog_memo_font.sql·20261105000300_worklog_cash_float.sql)·
-- 20261105000100_stats_rx_groups.sql·20261112000000_stats_rx_groups_exclude.sql·20261116000000_sunap.sql·
-- 20261117010000_calendar.sql(calendar_settings·calendar_rev·calendar_bump())·20261118100000_desk_accounts.sql(my_desk_hospital_id()·my_desk())이
-- 들어가 있어야 한다. my_hospital_id()·calendar_bump()는 여기서 다시 만들지 않는다(글자·권한 그대로).
-- 두 번 붙여 넣어도 그대로다(표는 없을 때만 만들고, 칸·이름 있는 제약은 없을 때만 더하고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고,
-- 정책은 지우고 다시 만들고, 바구니 설정은 이 파일 값으로 되돌린다. 이미 있던 병원 정보 줄은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 병원 정보 읽기가 실패해 앱은 예약 설정 시행자·이름 글자 로고로 돈다).
-- 주의: 20261118100000_desk_accounts.sql을 나중에 다시 붙여 넣으면 my_desk()가 옛 글(가입 이름)로 돌아가니 그때는 이 파일도 다시 붙여 넣는다.
-- 실행 뒤 Storage 화면에 clinic-logos 바구니가 보이고 'Private'(공개 아님)인지 본다.
--
-- 무엇을 왜(ADR-033): 다른 병원도 웹앱을 쓴다. 병원 이름·로고·전화·주소·호칭·요일별 진료시간·휴진일·원장님·직원을 병원마다 한 줄에 한 번만 적고,
-- 서식·문자·예약·통계·대시보드·AI가 가져다 쓴다. 환자 자료는 이 표에 들어가지 않는다. 예약 시행자 목록은 이 줄의 '예약에 보이기' 사람으로 합친다
-- (예약 설정의 시행자는 아래에서 한 번 옮기고, 옛 칸은 남겨 두고 앱이 읽지 않는다). 로고 그림은 비공개 바구니 clinic-logos의 '<병원 id>/…png'에 둔다.
-- 데스크 문지기(my_desk())의 병원 이름도 병원 정보 이름이 있으면 그 이름이다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 원장(authenticated)만 자기 병원 줄을 읽고 넣고 고치며(지우기 없음),
-- 그 병원 데스크는 읽기만 한다. hospital_id·updated_at은 칸 권한이 없어 DB(기본값·트리거)만 정한다. 승인 대기·거절·병원 없는 사용자는 아무 줄도 못 본다.
-- 로고 파일은 원장이 자기 병원 폴더 것만 읽고 지우며, 올리기는 자기 clinic_profiles.logo_path와 같은 이름일 때만이다(덮어쓰기 없음).
-- 청구 입력 방식(input_mode)은 원장이 자기 병원 문구 줄에서 고치기만 한다(넣기 칸 권한은 그대로).
-- 병원 정보를 넣거나 고치면 예약 바뀜 숫자(calendar_rev)가 올라 예약 화면이 시행자·시간을 다시 읽는다

-- 병원 정보 한 줄. hours = 월(0)~일(6) 일곱 칸({open, close, lunchFrom, lunchTo} 분, null = 휴진), closed_dates = 휴진일 글자 목록,
-- staff = 원장님·직원({id, name, role, mark, color, calendar}). 안 모양은 앱이 checkProfile로 본다. DB는 모양·길이·크기만 막는다
create table if not exists public.clinic_profiles (
  hospital_id uuid primary key default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  display_name text check (display_name is null or (display_name = btrim(display_name) and char_length(display_name) between 1 and 50)),
  phone text check (phone is null or phone ~ '^[0-9]{9,11}$'),
  address text check (address is null or char_length(address) <= 100),
  honorific text not null default '원장님' check (honorific in ('원장님', '대표원장님', '선생님')),
  hours jsonb not null check (jsonb_typeof(hours) = 'array' and jsonb_array_length(hours) = 7 and octet_length(hours::text) <= 2000),
  closed_dates jsonb not null default '[]' check (jsonb_typeof(closed_dates) = 'array' and octet_length(closed_dates::text) <= 8000),
  staff jsonb not null default '[]' check (jsonb_typeof(staff) = 'array' and octet_length(staff::text) <= 12000),
  logo_path text check (logo_path is null or char_length(logo_path) <= 120),
  updated_at timestamptz not null default now()
);

-- 고칠 때마다 updated_at = 지금(이 표만의 함수. 공용 touch_updated_at은 부르지 않는다). 트리거만 부른다
create or replace function public.clinic_profiles_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거둔다
revoke all on function public.clinic_profiles_touch() from public, anon, authenticated;

-- 바뀜 숫자: 예약 SQL의 calendar_bump()를 그대로 부른다(문장마다 내 병원 rev + 1, 다시 만들지 않는다)
create or replace trigger clinic_profiles_touch before update on public.clinic_profiles
  for each row execute function public.clinic_profiles_touch();
create or replace trigger clinic_profiles_bump after insert or update on public.clinic_profiles
  for each statement execute function public.calendar_bump();

alter table public.clinic_profiles enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.clinic_profiles from public, anon, authenticated;

-- 읽기, 넣기·고치기는 값 칸 여덟(hospital_id·updated_at 빼고). 지우기 없음. upsert(onConflict hospital_id)가 보낸 칸을 모두 SET에 쓴다
grant select on table public.clinic_profiles to authenticated;
grant insert (display_name, phone, address, honorific, hours, closed_dates, staff, logo_path),
  update (display_name, phone, address, honorific, hours, closed_dates, staff, logo_path)
  on table public.clinic_profiles to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장이 아니면 null이라 아무 줄과도 같지 않다
drop policy if exists "내 병원 정보 읽기" on public.clinic_profiles;
create policy "내 병원 정보 읽기" on public.clinic_profiles
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 정보 넣기" on public.clinic_profiles;
create policy "내 병원 정보 넣기" on public.clinic_profiles
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 정보 고치기" on public.clinic_profiles;
create policy "내 병원 정보 고치기" on public.clinic_profiles
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
-- 데스크는 읽기만(예약 화면이 시행자·진료시간을 읽는다). 데스크가 아니면 null이다
drop policy if exists "데스크 병원 정보 읽기" on public.clinic_profiles;
create policy "데스크 병원 정보 읽기" on public.clinic_profiles
  for select to authenticated
  using (hospital_id = (select public.my_desk_hospital_id()));

-- 예약 시행자 옮기기(AC-6601.4): 예약 설정이 있고 병원 정보 줄이 없는 병원마다 한 줄. 시행자는 같은 차례로 각 사람에 role 'staff'·calendar true를
-- 더하고, 진료시간은 월~토(일요일 켜짐이면 일요일도) open_hour~close_hour(분)·점심 없음. 이미 있는 줄은 건드리지 않는다. 예약·종일 줄은 손대지 않는다
-- (예약은 staff_id 글자로 사람을 가리키므로 id만 같으면 된다). 옮긴 시행자가 12,000바이트를 넘는 병원은 건너뛴다(그 병원은 예약 설정 시행자를 그대로 쓴다)
insert into public.clinic_profiles (hospital_id, staff, hours)
select s.hospital_id,
       moved.staff,
       jsonb_build_array(d.day, d.day, d.day, d.day, d.day, d.day, case when s.sunday then d.day else 'null'::jsonb end)
  from public.calendar_settings s
 cross join lateral (
   select coalesce(jsonb_agg(e.person || '{"role": "staff", "calendar": true}'::jsonb order by e.n), '[]'::jsonb) as staff
     from jsonb_array_elements(s.staff) with ordinality as e (person, n)
 ) moved
 cross join lateral (
   select jsonb_build_object('open', s.open_hour * 60, 'close', s.close_hour * 60, 'lunchFrom', null, 'lunchTo', null) as day
 ) d
 where octet_length(moved.staff::text) <= 12000
on conflict (hospital_id) do nothing;

-- 문지기가 읽는 내 데스크 줄: 20261118100000_desk_accounts.sql과 같은 모양·권한이고 이름만 병원 정보 이름이 먼저다(없으면 가입 이름)
create or replace function public.my_desk() returns table (hospital_id uuid, hospital_name text) language sql stable security definer set search_path = ''
as $$
  select h.id, coalesce(p.display_name, h.name)
    from public.hospitals h
    left join public.clinic_profiles p on p.hospital_id = h.id
   where h.id = public.my_desk_hospital_id()
$$;

revoke all on function public.my_desk() from public, anon, authenticated;
grant execute on function public.my_desk() to authenticated;

-- 로고 바구니: 공개 아님, 한 파일 1,000,000바이트, PNG만(앱이 브라우저에서 PNG로 다시 만들어 올린다). 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('clinic-logos', 'clinic-logos', false, 1000000, array['image/png'])
  on conflict (id) do update set public = false, file_size_limit = 1000000, allowed_mime_types = array['image/png'];

-- 파일 이름의 첫 폴더가 내 병원 id인 것만 읽고 지운다. 올리기는 거기에 더해 이름이 내 clinic_profiles 줄의 logo_path와 같을 때만
-- (줄의 logo_path를 먼저 고치고 → 올린다). 고치기(덮어쓰기) 규칙은 두지 않는다
drop policy if exists "내 병원 로고 읽기" on storage.objects;
create policy "내 병원 로고 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
drop policy if exists "내 병원 로고 올리기" on storage.objects;
create policy "내 병원 로고 올리기" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'clinic-logos'
    and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
    and exists (
      select 1 from public.clinic_profiles p
       where p.hospital_id = (select public.my_hospital_id()) and p.logo_path = objects.name
    )
  );
drop policy if exists "내 병원 로고 지우기" on storage.objects;
create policy "내 병원 로고 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'clinic-logos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);

-- 청구 입력 방식 기억(REQ-6610): null = 앱 기본('날짜별'), 'code' = 처방코드별, 'date' = 날짜별. 병원 문구 줄의 지금 정책(내 병원 줄만)이 그대로 막는다
alter table public.claim_hospital_settings add column if not exists input_mode text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
     where conrelid = 'public.claim_hospital_settings'::regclass and conname = 'claim_hospital_settings_input_mode_check'
  ) then
    alter table public.claim_hospital_settings
      add constraint claim_hospital_settings_input_mode_check check (input_mode is null or input_mode in ('code', 'date'));
  end if;
end
$$;

-- 고치기만(넣기 칸 권한은 그대로 phrases·dx_links). 데스크에게는 이 표 정책이 없어 못 고친다
grant update (input_mode) on table public.claim_hospital_settings to authenticated;
