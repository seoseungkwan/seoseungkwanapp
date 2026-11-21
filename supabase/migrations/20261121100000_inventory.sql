-- 재고 탭: 분류·물품·세기·세기 줄·입고·입고 줄·별칭 표 일곱, 수량을 맞추는 DB 함수 다섯, 명세서 사진 바구니(Storage) inventory-photos
-- (spec inventory REQ-7501·REQ-7514, design.md 1절, ADR-034)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261028000000_auth.sql(병원 표)·20261101000200_stats.sql(my_hospital_id()·통계 stats_months)이 들어가 있어야 한다.
-- my_hospital_id()는 여기서 다시 만들지 않는다(글자·권한 그대로).
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만들고,
-- 바구니 설정은 이 파일 값으로 되돌린다. 이미 있던 물품·세기·입고 줄과 사진은 그대로).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(없으면 재고 탭은 읽기 실패 카드이고 대시보드 재고 칸은 그리지 않는다).
-- 실행 뒤 Storage 화면에 inventory-photos 바구니가 보이고 'Private'(공개 아님)인지 본다.
--
-- 무엇을 왜: 원장이 물품 목록을 두고 매주 한 번 세고(세기), 거래명세서로 들어온 것(입고)을 적는다. 쓴 것은 적지 않는다.
-- 지금 수량(inventory_items.qty)은 화면이 바로 쓰지 못하고 DB 함수만 맞춘다(저장 순서 규칙):
--   입고가 그 물품의 마지막 세기 저장(last_counted_at)보다 먼저 저장됐으면(inventory_receipts.created_at ≤ last_counted_at) 그 세기에 들었다고 본다.
--   지금 수량 = 마지막 센 수 + 그 뒤에 저장된 입고 줄 수량 합. 세기 저장 = 센 수, 입고 저장 = 더함, 입고 고치기·지우기 = 들지 않은 입고만 빼고 더함.
-- 명세서 사진은 비공개 바구니 inventory-photos의 '<병원 id>/<uuid>.jpg'에 둔다(한 입고에 한 장, JPEG 3,000,000바이트까지). 환자 자료는 들어가지 않는다.
-- 모든 표의 줄은 hospital_id로 병원에 묶이고, 다른 표를 가리킬 때는 (hospital_id, id)로 가리켜 다른 병원 줄을 가리키지 못한다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 병원의 원장(authenticated)만 자기 병원 줄을 읽고,
-- 분류·물품·별칭만 정해 둔 칸으로 넣고 고친다(분류·별칭은 지우기도, 물품은 지우지 않고 '안 씀'으로 숨긴다).
-- 세기·입고 네 표는 읽기만 하고 넣기·고치기·지우기는 DB 함수로만 한다. hospital_id·id·시각·qty·last_count_*는 칸 권한이 없어 DB만 정한다.
-- 데스크·승인 대기·거절·병원 없는 사용자는 아무 줄도 못 보고 못 바꾼다(데스크 정책 없음). 사진은 원장이 자기 병원 폴더 것만 읽고 올리고 지운다(고치기 없음)

-- (1) 분류: 처음 넷(약품·치료 소모품·보조기·깁스·사무·생활)은 앱이 넣는다. 이름은 병원 안에서 하나
create table if not exists public.inventory_categories (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 20 and name !~ '[[:cntrl:]]'),
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (hospital_id, name),
  unique (hospital_id, id)
);

-- (2) 물품: 이름은 병원 안에서 하나(안 쓰는 물품 포함). 분류는 같은 병원 것만, 물품이 있는 분류는 지우지 못한다(on delete 없음 → 23503).
-- qty = 지금 수량(음수는 입고 지우기·고치기로만 생김), last_count_qty·last_counted_at = 마지막 센 수·그 줄을 저장한 시각, expiry = 가장 빠른 유통기한,
-- bit_code = 비트 처방 코드(병원 안에서 대소문자 없이 하나), ordered_at = [주문함]을 누른 시각(입고되면 DB가 비운다)
create table if not exists public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  category_id uuid not null,
  name text not null check (name = btrim(name) and char_length(name) between 1 and 40 and name !~ '[[:cntrl:]]'),
  unit text not null check (unit = btrim(unit) and char_length(unit) between 1 and 10 and unit !~ '[[:cntrl:]]'),
  min_qty integer check (min_qty between 0 and 1000000),
  qty integer not null default 0 check (qty between -1000000 and 1000000),
  last_count_qty integer check (last_count_qty between 0 and 1000000),
  last_counted_at timestamptz,
  expiry date,
  vendor text check (vendor = btrim(vendor) and char_length(vendor) between 1 and 40 and vendor !~ '[[:cntrl:]]'),
  unit_price integer check (unit_price between 0 and 100000000),
  bit_code text check (bit_code = btrim(bit_code) and char_length(bit_code) between 1 and 100 and bit_code !~ '[[:cntrl:]]'),
  sort_order integer not null default 0 check (sort_order >= 0),
  hidden boolean not null default false,
  ordered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (hospital_id, name),
  unique (hospital_id, id),
  foreign key (hospital_id, category_id) references public.inventory_categories (hospital_id, id)
);
create unique index if not exists inventory_items_bit_code on public.inventory_items (hospital_id, upper(bit_code)) where bit_code is not null;

-- (3) 세기: 병원·날짜마다 하나(사용자가 고른 센 날)
create table if not exists public.inventory_counts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  counted_on date not null,
  created_at timestamptz not null default now(),
  unique (hospital_id, counted_on),
  unique (hospital_id, id)
);

-- (4) 세기 줄: 그 날 그 물품의 센 수. saved_at = 줄을 저장(덮어쓰기 포함)한 시각(쓴 양의 '그 사이 입고'를 이 시각으로 고른다)
create table if not exists public.inventory_count_lines (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  count_id uuid not null,
  item_id uuid not null,
  qty integer not null check (qty between 0 and 1000000),
  saved_at timestamptz not null default now(),
  primary key (count_id, item_id),
  foreign key (hospital_id, count_id) references public.inventory_counts (hospital_id, id) on delete cascade,
  foreign key (hospital_id, item_id) references public.inventory_items (hospital_id, id)
);

-- (5) 입고: received_on = 명세서 날짜, created_at = 저장 시각(고치기로 바뀌지 않는다), photo_path = 내 병원 폴더의 사진 하나
create table if not exists public.inventory_receipts (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  received_on date not null,
  vendor text check (vendor = btrim(vendor) and char_length(vendor) between 1 and 40 and vendor !~ '[[:cntrl:]]'),
  photo_path text check (photo_path ~ ('^' || hospital_id::text || '/[0-9a-f-]{36}\.jpg$')),
  created_at timestamptz not null default now(),
  unique (hospital_id, id)
);
create index if not exists inventory_receipts_day on public.inventory_receipts (hospital_id, received_on);

-- (6) 입고 줄: 수량(목록 단위)·단가(없으면 null)·금액(원, 명세서 줄 합계)
create table if not exists public.inventory_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  receipt_id uuid not null,
  item_id uuid not null,
  qty integer not null check (qty between 1 and 1000000),
  unit_price integer check (unit_price between 0 and 100000000),
  amount integer not null check (amount between 0 and 1000000000),
  foreign key (hospital_id, receipt_id) references public.inventory_receipts (hospital_id, id) on delete cascade,
  foreign key (hospital_id, item_id) references public.inventory_items (hospital_id, id)
);
create index if not exists inventory_receipt_lines_receipt on public.inventory_receipt_lines (hospital_id, receipt_id);

-- (7) 별칭: 명세서에 적힌 이름(앱이 normalizeName한 값) → 고른 물품. 병원 안에서 하나
create table if not exists public.inventory_aliases (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  alias text not null check (alias = btrim(alias) and char_length(alias) between 1 and 60 and alias !~ '[[:cntrl:]]'),
  item_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (hospital_id, alias),
  foreign key (hospital_id, item_id) references public.inventory_items (hospital_id, id)
);

alter table public.inventory_categories enable row level security;
alter table public.inventory_items enable row level security;
alter table public.inventory_counts enable row level security;
alter table public.inventory_count_lines enable row level security;
alter table public.inventory_receipts enable row level security;
alter table public.inventory_receipt_lines enable row level security;
alter table public.inventory_aliases enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고(칸 권한도 함께 거둬진다) 필요한 것만 준다
revoke all on table public.inventory_categories from public, anon, authenticated;
revoke all on table public.inventory_items from public, anon, authenticated;
revoke all on table public.inventory_counts from public, anon, authenticated;
revoke all on table public.inventory_count_lines from public, anon, authenticated;
revoke all on table public.inventory_receipts from public, anon, authenticated;
revoke all on table public.inventory_receipt_lines from public, anon, authenticated;
revoke all on table public.inventory_aliases from public, anon, authenticated;

grant select, delete on table public.inventory_categories to authenticated;
grant insert (name, sort_order), update (name, sort_order) on table public.inventory_categories to authenticated;
-- 물품: qty·last_count_qty·last_counted_at은 함수만 쓴다. ordered_at은 고치기만([주문함]·[주문 취소]). 지우기 없음
grant select on table public.inventory_items to authenticated;
grant insert (category_id, name, unit, min_qty, expiry, vendor, unit_price, bit_code, sort_order, hidden),
  update (category_id, name, unit, min_qty, expiry, vendor, unit_price, bit_code, sort_order, hidden, ordered_at)
  on table public.inventory_items to authenticated;
-- 세기·입고 네 표는 읽기만(넣기·고치기·지우기는 아래 함수로만)
grant select on table public.inventory_counts to authenticated;
grant select on table public.inventory_count_lines to authenticated;
grant select on table public.inventory_receipts to authenticated;
grant select on table public.inventory_receipt_lines to authenticated;
-- 별칭: 앱의 저장(upsert onConflict hospital_id,alias)이 보낸 칸(alias·item_id)을 모두 SET에 쓰므로 고치기도 두 칸
grant select, delete on table public.inventory_aliases to authenticated;
grant insert (alias, item_id), update (alias, item_id) on table public.inventory_aliases to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 원장이 아니면 null이라 아무 줄과도 같지 않다
drop policy if exists "내 병원 재고 분류 읽기" on public.inventory_categories;
create policy "내 병원 재고 분류 읽기" on public.inventory_categories
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 분류 넣기" on public.inventory_categories;
create policy "내 병원 재고 분류 넣기" on public.inventory_categories
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 분류 고치기" on public.inventory_categories;
create policy "내 병원 재고 분류 고치기" on public.inventory_categories
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 분류 지우기" on public.inventory_categories;
create policy "내 병원 재고 분류 지우기" on public.inventory_categories
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 재고 물품 읽기" on public.inventory_items;
create policy "내 병원 재고 물품 읽기" on public.inventory_items
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 물품 넣기" on public.inventory_items;
create policy "내 병원 재고 물품 넣기" on public.inventory_items
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 물품 고치기" on public.inventory_items;
create policy "내 병원 재고 물품 고치기" on public.inventory_items
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 재고 세기 읽기" on public.inventory_counts;
create policy "내 병원 재고 세기 읽기" on public.inventory_counts
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 세기 줄 읽기" on public.inventory_count_lines;
create policy "내 병원 재고 세기 줄 읽기" on public.inventory_count_lines
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 입고 읽기" on public.inventory_receipts;
create policy "내 병원 재고 입고 읽기" on public.inventory_receipts
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 입고 줄 읽기" on public.inventory_receipt_lines;
create policy "내 병원 재고 입고 줄 읽기" on public.inventory_receipt_lines
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 재고 별칭 읽기" on public.inventory_aliases;
create policy "내 병원 재고 별칭 읽기" on public.inventory_aliases
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 별칭 넣기" on public.inventory_aliases;
create policy "내 병원 재고 별칭 넣기" on public.inventory_aliases
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 별칭 고치기" on public.inventory_aliases;
create policy "내 병원 재고 별칭 고치기" on public.inventory_aliases
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 재고 별칭 지우기" on public.inventory_aliases;
create policy "내 병원 재고 별칭 지우기" on public.inventory_aliases
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

-- DB 함수 다섯: 만든 사람 권한(security definer)으로 RLS를 건너뛰므로 모든 문장을 v_h(내 병원)로 거른다.
-- 원장이 아니면 오류 42501, 검사를 어기면 오류 22023이고 아무것도 바꾸지 않는다(오류가 나면 그 부르기 전체가 되돌려진다).
-- 오늘은 세션 시간대가 아니라 한국 날짜다

-- 세기 저장: p_lines = [{ item_id, qty?: 0~1,000,000 정수|null, expiry?: 'YYYY-MM-DD'|null }] 1~1,000개(물품 겹침 없음).
-- p_day는 병원의 마지막 세기 날짜 ~ 한국 오늘. 그 날 세기가 없으면 만든다.
-- qty가 있는 줄: 세기 줄을 넣거나 덮어쓰고(saved_at = 지금), 물품 qty = last_count_qty = 센 수, last_counted_at = 지금.
-- expiry 열쇠가 있는 줄: 물품 expiry = 그 값(null이면 비움). 돌려주는 값 = 넣거나 덮어쓴 세기 줄 수
create or replace function public.save_inventory_count(p_day date, p_lines jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h uuid := public.my_hospital_id();
  v_line jsonb;
  v_qty integer;
  v_expiry date;
  v_items uuid[] := '{}';
  v_qtys integer[] := '{}';
  v_set_expiry boolean[] := '{}';
  v_expiries date[] := '{}';
  v_count uuid;
  v_saved integer;
begin
  if v_h is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  if p_day is null or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'bad inventory count' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 1000
     or p_day > (now() at time zone 'Asia/Seoul')::date
     or p_day < (select max(c.counted_on) from public.inventory_counts c where c.hospital_id = v_h) then
    raise exception 'bad inventory count' using errcode = '22023';
  end if;

  for v_line in select e.value from jsonb_array_elements(p_lines) as e loop
    if jsonb_typeof(v_line) <> 'object' or jsonb_typeof(v_line -> 'item_id') is distinct from 'string' then
      raise exception 'bad inventory count' using errcode = '22023';
    end if;
    if (v_line ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
      raise exception 'bad inventory count' using errcode = '22023';
    end if;

    v_qty := null;
    case coalesce(jsonb_typeof(v_line -> 'qty'), 'null')
      when 'null' then
        null;
      when 'number' then
        if (v_line ->> 'qty') !~ '^[0-9]{1,7}$' then
          raise exception 'bad inventory count' using errcode = '22023';
        end if;
        v_qty := (v_line ->> 'qty')::integer;
        if v_qty > 1000000 then
          raise exception 'bad inventory count' using errcode = '22023';
        end if;
      else
        raise exception 'bad inventory count' using errcode = '22023';
    end case;

    v_expiry := null;
    if v_line ? 'expiry' then
      case jsonb_typeof(v_line -> 'expiry')
        when 'null' then
          null;
        when 'string' then
          if (v_line ->> 'expiry') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then
            raise exception 'bad inventory count' using errcode = '22023';
          end if;
          begin
            v_expiry := (v_line ->> 'expiry')::date; -- 없는 날(2027-02-30 등)은 여기서 걸린다
          exception when others then
            raise exception 'bad inventory count' using errcode = '22023';
          end;
        else
          raise exception 'bad inventory count' using errcode = '22023';
      end case;
    end if;

    v_items := array_append(v_items, (v_line ->> 'item_id')::uuid);
    v_qtys := array_append(v_qtys, v_qty);
    v_set_expiry := array_append(v_set_expiry, v_line ? 'expiry');
    v_expiries := array_append(v_expiries, v_expiry);
  end loop;

  -- 물품은 겹치지 않고 모두 내 병원 것이어야 한다
  if (select count(distinct u.id) from unnest(v_items) as u (id)) <> cardinality(v_items)
     or exists (
       select 1 from unnest(v_items) as u (id)
        where not exists (select 1 from public.inventory_items i where i.hospital_id = v_h and i.id = u.id)
     ) then
    raise exception 'bad inventory count' using errcode = '22023';
  end if;

  insert into public.inventory_counts (hospital_id, counted_on) values (v_h, p_day)
    on conflict (hospital_id, counted_on) do nothing;
  select c.id into v_count from public.inventory_counts c where c.hospital_id = v_h and c.counted_on = p_day;

  insert into public.inventory_count_lines (hospital_id, count_id, item_id, qty, saved_at)
  select v_h, v_count, u.item_id, u.qty, now()
    from unnest(v_items, v_qtys) as u (item_id, qty)
   where u.qty is not null
  on conflict (count_id, item_id) do update set qty = excluded.qty, saved_at = excluded.saved_at;
  get diagnostics v_saved = row_count;

  update public.inventory_items i
     set qty = u.qty, last_count_qty = u.qty, last_counted_at = now()
    from unnest(v_items, v_qtys) as u (item_id, qty)
   where u.qty is not null and i.hospital_id = v_h and i.id = u.item_id;

  update public.inventory_items i
     set expiry = u.expiry
    from unnest(v_items, v_set_expiry, v_expiries) as u (item_id, set_expiry, expiry)
   where u.set_expiry and i.hospital_id = v_h and i.id = u.item_id;

  return v_saved;
end
$$;

-- 입고 저장: p_lines = [{ item_id, qty: 1~1,000,000, unit_price: 0~100,000,000|null, amount: 0~1,000,000,000 }] 1~100개
-- (같은 물품 줄이 둘 이상이어도 된다). p_day ≤ 한국 오늘. 입고(created_at = 지금)·줄을 넣고, 물품마다 qty += 줄 수량 합,
-- ordered_at = null, 단가를 적은 줄이 있으면 unit_price = 그 값(뒤 줄이 이김), 물품 거래처가 비었고 p_vendor가 있으면 채운다. 돌려주는 값 = 입고 id
create or replace function public.save_inventory_receipt(p_day date, p_vendor text, p_photo_path text, p_lines jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h uuid := public.my_hospital_id();
  v_line jsonb;
  v_items uuid[] := '{}';
  v_qtys integer[] := '{}';
  v_prices integer[] := '{}';
  v_amounts integer[] := '{}';
  v_id uuid;
begin
  if v_h is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  if p_day is null or p_day > (now() at time zone 'Asia/Seoul')::date or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;

  for v_line in select e.value from jsonb_array_elements(p_lines) as e loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'item_id') is distinct from 'string'
       or jsonb_typeof(v_line -> 'qty') is distinct from 'number'
       or jsonb_typeof(v_line -> 'amount') is distinct from 'number'
       or coalesce(jsonb_typeof(v_line -> 'unit_price'), 'null') not in ('number', 'null') then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    if (v_line ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line ->> 'qty') !~ '^[0-9]{1,7}$'
       or (v_line ->> 'amount') !~ '^[0-9]{1,10}$'
       or coalesce(v_line ->> 'unit_price', '0') !~ '^[0-9]{1,9}$' then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    if (v_line ->> 'qty')::integer not between 1 and 1000000
       or (v_line ->> 'amount')::bigint > 1000000000
       or coalesce((v_line ->> 'unit_price')::integer, 0) > 100000000 then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    v_items := array_append(v_items, (v_line ->> 'item_id')::uuid);
    v_qtys := array_append(v_qtys, (v_line ->> 'qty')::integer);
    v_prices := array_append(v_prices, (v_line ->> 'unit_price')::integer);
    v_amounts := array_append(v_amounts, (v_line ->> 'amount')::integer);
  end loop;

  if exists (
    select 1 from unnest(v_items) as u (id)
     where not exists (select 1 from public.inventory_items i where i.hospital_id = v_h and i.id = u.id)
  ) then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;

  insert into public.inventory_receipts (hospital_id, received_on, vendor, photo_path)
  values (v_h, p_day, p_vendor, p_photo_path)
  returning id into v_id;

  insert into public.inventory_receipt_lines (hospital_id, receipt_id, item_id, qty, unit_price, amount)
  select v_h, v_id, u.item_id, u.qty, u.unit_price, u.amount
    from unnest(v_items, v_qtys, v_prices, v_amounts) as u (item_id, qty, unit_price, amount);

  update public.inventory_items i
     set qty = i.qty + s.qty,
         ordered_at = null,
         unit_price = coalesce(s.unit_price, i.unit_price),
         vendor = coalesce(i.vendor, p_vendor)
    from (
      select u.item_id, sum(u.qty)::integer as qty,
             (array_agg(u.unit_price order by u.n desc) filter (where u.unit_price is not null))[1] as unit_price
        from unnest(v_items, v_qtys, v_prices) with ordinality as u (item_id, qty, unit_price, n)
       group by u.item_id
    ) s
   where i.hospital_id = v_h and i.id = s.item_id;

  return v_id;
end
$$;

-- 입고 고치기: 날짜·거래처·줄을 바꾼다(줄 검사는 저장과 같음. created_at·photo_path·ordered_at은 그대로).
-- 물품마다 그 물품의 마지막 세기로 보아, 이 입고가 세기에 들지 않았으면(세기 없음 또는 created_at > last_counted_at)
-- qty += 새 줄 수량 합 − 옛 줄 수량 합(음수 가능). 단가·거래처 채우기는 저장과 같다. 남의 입고·없는 입고는 22023
create or replace function public.update_inventory_receipt(p_id uuid, p_day date, p_vendor text, p_lines jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h uuid := public.my_hospital_id();
  v_line jsonb;
  v_items uuid[] := '{}';
  v_qtys integer[] := '{}';
  v_prices integer[] := '{}';
  v_amounts integer[] := '{}';
  v_created timestamptz;
begin
  if v_h is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  if p_day is null or p_day > (now() at time zone 'Asia/Seoul')::date or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;
  if jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;

  for v_line in select e.value from jsonb_array_elements(p_lines) as e loop
    if jsonb_typeof(v_line) <> 'object'
       or jsonb_typeof(v_line -> 'item_id') is distinct from 'string'
       or jsonb_typeof(v_line -> 'qty') is distinct from 'number'
       or jsonb_typeof(v_line -> 'amount') is distinct from 'number'
       or coalesce(jsonb_typeof(v_line -> 'unit_price'), 'null') not in ('number', 'null') then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    if (v_line ->> 'item_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
       or (v_line ->> 'qty') !~ '^[0-9]{1,7}$'
       or (v_line ->> 'amount') !~ '^[0-9]{1,10}$'
       or coalesce(v_line ->> 'unit_price', '0') !~ '^[0-9]{1,9}$' then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    if (v_line ->> 'qty')::integer not between 1 and 1000000
       or (v_line ->> 'amount')::bigint > 1000000000
       or coalesce((v_line ->> 'unit_price')::integer, 0) > 100000000 then
      raise exception 'bad inventory receipt' using errcode = '22023';
    end if;
    v_items := array_append(v_items, (v_line ->> 'item_id')::uuid);
    v_qtys := array_append(v_qtys, (v_line ->> 'qty')::integer);
    v_prices := array_append(v_prices, (v_line ->> 'unit_price')::integer);
    v_amounts := array_append(v_amounts, (v_line ->> 'amount')::integer);
  end loop;

  select r.created_at into v_created from public.inventory_receipts r where r.id = p_id and r.hospital_id = v_h for update;
  if not found then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;
  if exists (
    select 1 from unnest(v_items) as u (id)
     where not exists (select 1 from public.inventory_items i where i.hospital_id = v_h and i.id = u.id)
  ) then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;

  -- 옛 줄을 지우기 전에 수량부터: 물품마다 (새 줄 합 − 옛 줄 합), 세기에 들지 않은 물품만
  update public.inventory_items i
     set qty = i.qty + d.delta
    from (
      select x.item_id, sum(x.qty)::integer as delta
        from (
          select u.item_id, u.qty from unnest(v_items, v_qtys) as u (item_id, qty)
          union all
          select l.item_id, -l.qty from public.inventory_receipt_lines l where l.hospital_id = v_h and l.receipt_id = p_id
        ) x
       group by x.item_id
    ) d
   where i.hospital_id = v_h and i.id = d.item_id and d.delta <> 0
     and (i.last_counted_at is null or v_created > i.last_counted_at);

  update public.inventory_items i
     set unit_price = coalesce(s.unit_price, i.unit_price),
         vendor = coalesce(i.vendor, p_vendor)
    from (
      select u.item_id,
             (array_agg(u.unit_price order by u.n desc) filter (where u.unit_price is not null))[1] as unit_price
        from unnest(v_items, v_prices) with ordinality as u (item_id, unit_price, n)
       group by u.item_id
    ) s
   where i.hospital_id = v_h and i.id = s.item_id;

  delete from public.inventory_receipt_lines l where l.hospital_id = v_h and l.receipt_id = p_id;
  insert into public.inventory_receipt_lines (hospital_id, receipt_id, item_id, qty, unit_price, amount)
  select v_h, p_id, u.item_id, u.qty, u.unit_price, u.amount
    from unnest(v_items, v_qtys, v_prices, v_amounts) as u (item_id, qty, unit_price, amount);

  update public.inventory_receipts r set received_on = p_day, vendor = p_vendor where r.id = p_id and r.hospital_id = v_h;
end
$$;

-- 입고 지우기: 세기에 들지 않은 물품만 qty -= 줄 수량 합(음수 가능), 그다음 입고를 지운다(줄은 함께 지워짐). ordered_at은 되돌리지 않는다.
-- 돌려주는 값 = 지운 입고의 사진 자리(없으면 null, 앱이 그 파일을 지운다). 남의 입고·없는 입고는 22023
create or replace function public.delete_inventory_receipt(p_id uuid)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h uuid := public.my_hospital_id();
  v_created timestamptz;
  v_path text;
begin
  if v_h is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  select r.created_at, r.photo_path into v_created, v_path
    from public.inventory_receipts r where r.id = p_id and r.hospital_id = v_h for update;
  if not found then
    raise exception 'bad inventory receipt' using errcode = '22023';
  end if;

  update public.inventory_items i
     set qty = i.qty - s.qty
    from (
      select l.item_id, sum(l.qty)::integer as qty
        from public.inventory_receipt_lines l where l.hospital_id = v_h and l.receipt_id = p_id
       group by l.item_id
    ) s
   where i.hospital_id = v_h and i.id = s.item_id
     and (i.last_counted_at is null or v_created > i.last_counted_at);

  delete from public.inventory_receipts r where r.id = p_id and r.hospital_id = v_h;
  return v_path;
end
$$;

-- 물품 차례: 내 병원 물품만 sort_order = 배열 자리 − 1(0부터). 남의 id·없는 id는 무시하고, 같은 id가 둘이면 앞 자리
create or replace function public.set_inventory_order(p_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_h uuid := public.my_hospital_id();
begin
  if v_h is null then
    raise exception 'not a hospital owner' using errcode = '42501';
  end if;
  update public.inventory_items i
     set sort_order = o.n - 1
    from (select u.id, min(u.n) as n from unnest(p_ids) with ordinality as u (id, n) group by u.id) o
   where i.hospital_id = v_h and i.id = o.id;
end
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon에도 준다. 다 거두고 authenticated에만 준다
revoke all on function public.save_inventory_count(date, jsonb) from public, anon, authenticated;
revoke all on function public.save_inventory_receipt(date, text, text, jsonb) from public, anon, authenticated;
revoke all on function public.update_inventory_receipt(uuid, date, text, jsonb) from public, anon, authenticated;
revoke all on function public.delete_inventory_receipt(uuid) from public, anon, authenticated;
revoke all on function public.set_inventory_order(uuid[]) from public, anon, authenticated;
grant execute on function public.save_inventory_count(date, jsonb) to authenticated;
grant execute on function public.save_inventory_receipt(date, text, text, jsonb) to authenticated;
grant execute on function public.update_inventory_receipt(uuid, date, text, jsonb) to authenticated;
grant execute on function public.delete_inventory_receipt(uuid) to authenticated;
grant execute on function public.set_inventory_order(uuid[]) to authenticated;

-- 명세서 사진 바구니: 공개 아님, 한 파일 3,000,000바이트, JPEG만(앱이 브라우저에서 줄여 JPEG로 올린다). 이미 있으면 설정을 이 값으로 되돌린다
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('inventory-photos', 'inventory-photos', false, 3000000, array['image/jpeg'])
  on conflict (id) do update set public = false, file_size_limit = 3000000, allowed_mime_types = array['image/jpeg'];

-- 파일 이름의 첫 폴더가 내 병원 id인 것만 읽고 올리고 지운다(사진 먼저 올리고 → 입고 저장). 고치기(덮어쓰기) 규칙은 두지 않는다
drop policy if exists "내 병원 재고 사진 읽기" on storage.objects;
create policy "내 병원 재고 사진 읽기" on storage.objects
  for select to authenticated
  using (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
drop policy if exists "내 병원 재고 사진 올리기" on storage.objects;
create policy "내 병원 재고 사진 올리기" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
drop policy if exists "내 병원 재고 사진 지우기" on storage.objects;
create policy "내 병원 재고 사진 지우기" on storage.objects
  for delete to authenticated
  using (bucket_id = 'inventory-photos' and (storage.foldername(name))[1] = (select public.my_hospital_id())::text);
