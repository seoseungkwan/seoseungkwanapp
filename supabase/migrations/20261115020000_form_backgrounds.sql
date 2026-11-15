-- 서식 탭 휴진 안내 '내 배경'(AI 배경 그림)·AI 그림 하루 한도·그림 저장소 (spec forms-themes REQ-4607·REQ-4608)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원 표)과 20261110000000_form_notices.sql(휴진 안내 표)이 들어가 있어야 한다.
-- 사이트에 올리기 전에 붙인다. 붙이기 전에는 AI 배경 만들기·내 배경 저장과 목록만 오류를 보이고, 테마 그림은 그대로 된다.
-- 여러 번 실행해도 된다: 이미 있는 표와 그 안의 줄은 그대로 두고, 함수·권한·규칙(정책)·버킷 설정만 이 파일 값으로 다시 맞춘다.
-- 실행 뒤 Storage 화면에 form-backgrounds 버킷이 보이고 'Private'(공개 아님)인지 본다.
--
-- 만드는 것:
--   (1) 휴진 안내 theme 칸이 'bg-<내 배경 id>'(39자)도 받게 글자 수 한도를 32 → 40자로 넓힌다(그 밖의 칸·권한·규칙은 그대로)
--   (2) form_backgrounds 표: 저장한 내 배경(적은 말·강조색·작은 그림). 큰 그림은 표가 아니라 그림 저장소에 둔다
--   (3) ai_image_days 표와 take_ai_image() 함수: 병원마다 하루(한국 날짜) 20장까지만 AI 그림을 만들게 센다
--   (4) 그림 저장소(Storage 버킷) form-backgrounds: 공개 아님, 한 파일 3,000,000바이트까지, JPEG만. 그리고 그 안의 읽기·올리기·지우기 규칙
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원 사용자만 자기 병원 배경을 읽고 넣고 지운다(고치기 없음).
-- hospital_id·id·path·created_at은 칸 권한이 없어 DB가 정한다(path = '<병원 id>/<id>.jpg').
-- ai_image_days는 아무도 직접 읽거나 쓰지 못하고 take_ai_image()로만 센다.
-- 그림 파일은 내 병원 폴더 것만 읽고 지우며, 올리기는 내 form_backgrounds 줄의 path와 같은 이름으로만 된다(줄 넣기 → 올리기 순서).
-- storage.objects 표 자체(RLS·권한)는 Supabase가 이미 갖춘 것이라 건드리지 않고 규칙(정책)만 더한다.
-- 다른 갈래의 함수(touch_updated_at 등)는 만들지도 부르지도 않는다. my_hospital_id()만 C1 글자 그대로 다시 만든다

-- 여러 브랜치가 같이 쓰는 함수(cross-branch C1, 글자 그대로)
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

-- (1) 휴진 안내 theme: 'bg-<uuid>'(39자)가 들어가게 40자로 (지금 저장된 값 null·테마 열쇠는 새 한도도 그대로 넘는다)
alter table public.form_notices drop constraint form_notices_theme_check;
alter table public.form_notices add constraint form_notices_theme_check check (theme ~ '^[a-z0-9-]{1,40}$');

-- (2) 내 배경. words = 적은 말(목록 이름), accent = 강조색, thumb = 작은 그림(120×170 JPEG base64)
create table if not exists public.form_backgrounds (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  words text not null check (char_length(words) between 1 and 30 and words !~ '[[:cntrl:]]'),
  accent text not null check (accent ~ '^#[0-9a-f]{6}$'),
  thumb text not null check (char_length(thumb) <= 16000 and thumb ~ '^/9j/[A-Za-z0-9+/]*={0,2}$'),
  path text generated always as (hospital_id::text || '/' || id::text || '.jpg') stored, -- 그림 저장소 안 파일 이름
  created_at timestamptz not null default now()
);

alter table public.form_backgrounds enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다(고치기 권한 없음)
revoke all on table public.form_backgrounds from public, anon, authenticated;
grant select, delete on table public.form_backgrounds to authenticated;
grant insert (words, accent, thumb) on table public.form_backgrounds to authenticated;

-- (select …): 문장마다 한 번 계산한다. 승인되지 않은 병원은 null이라 아무 줄도 맞지 않는다
drop policy if exists "내 병원 배경 읽기" on public.form_backgrounds;
create policy "내 병원 배경 읽기" on public.form_backgrounds
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 배경 넣기" on public.form_backgrounds;
create policy "내 병원 배경 넣기" on public.form_backgrounds
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 배경 지우기" on public.form_backgrounds;
create policy "내 병원 배경 지우기" on public.form_backgrounds
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

-- (3) 하루 한도: 병원·한국 날짜마다 만든 장 수(0~20)
create table if not exists public.ai_image_days (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  day date not null,
  images integer not null default 0 check (images between 0 and 20),
  primary key (hospital_id, day)
);

alter table public.ai_image_days enable row level security;

-- 정책도 권한도 주지 않는다(아무도 직접 읽거나 쓰지 못한다. 세기는 아래 함수로만)
revoke all on table public.ai_image_days from public, anon, authenticated;

-- 내 병원 오늘(한국 날짜) 장 수가 20 밑이면 하나 올리고 true, 20이면 그대로 두고 false. 승인되지 않은 사용자는 오류 42501
-- 동시에 눌러도 on conflict가 줄을 잠그고 세므로 20을 넘지 않는다
create or replace function public.take_ai_image()
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hospital_id uuid;
  v_images integer;
begin
  select h.id into v_hospital_id
    from public.hospitals h
   where h.owner_id = (select auth.uid()) and h.status = 'approved';

  if v_hospital_id is null then
    raise exception 'hospital not approved' using errcode = '42501';
  end if;

  insert into public.ai_image_days as d (hospital_id, day, images)
  values (v_hospital_id, (now() at time zone 'Asia/Seoul')::date, 1)
  on conflict (hospital_id, day) do update
     set images = d.images + 1
   where d.images < 20
  returning d.images into v_images;

  return v_images is not null;
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 열어 둔다. 거두고 authenticated에만 준다
revoke all on function public.take_ai_image() from public, anon, authenticated;
grant execute on function public.take_ai_image() to authenticated;

-- (4) 그림 저장소: 공개 아님, 한 파일 3,000,000바이트, JPEG만. 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('form-backgrounds', 'form-backgrounds', false, 3000000, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 3000000, allowed_mime_types = array['image/jpeg'];

-- 파일 이름의 첫 폴더가 내 병원 id인 것만. 올리기는 거기에 더해 이름이 내 form_backgrounds 줄의 path와 같을 때만
-- (그 exists는 form_backgrounds의 읽기 규칙 안에서 돌아 내 병원 줄만 맞는다). 고치기 규칙은 두지 않는다
drop policy if exists "내 병원 배경 그림 읽기" on storage.objects;
create policy "내 병원 배경 그림 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'form-backgrounds' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
drop policy if exists "내 병원 배경 그림 올리기" on storage.objects;
create policy "내 병원 배경 그림 올리기" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'form-backgrounds'
    and (storage.foldername(name))[1] = (select public.my_hospital_id())::text
    and exists (select 1 from public.form_backgrounds b where b.path = objects.name)
  );
drop policy if exists "내 병원 배경 그림 지우기" on storage.objects;
create policy "내 병원 배경 그림 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'form-backgrounds' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
