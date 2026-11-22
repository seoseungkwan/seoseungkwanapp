-- 점검 규칙 저절로 바꾸기 DB: AI 판정 줄(rule_changes, 공용)·병원마다 본 때와 되돌림(rule_change_marks)·글마다 살피기 실패 수(rule_review_tries)와
-- 그 권한·함수 넷·표시 트리거, 사람이 봐야 함 줄을 세도록 다시 만든 notice_rule_alerts (spec rule-auto REQ-7805·REQ-7806, design.md 7절, ADR-040)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261121000000_notices.sql·20261121000001_notice_keywords.sql이 들어가 있어야 한다. 그 파일의 함수(my_hospital_id·is_notice_collector)는 다시 만들지 않고 그대로 쓴다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다. 이미 있던 줄은 그대로).
-- 20261121000000_notices.sql을 다시 붙이면 notice_rule_alerts가 규칙 연결 수로 세는 옛 판으로 돌아가니 이 파일도 다시 붙인다(design 13절).
-- 관문: 이 파일을 사이트에 올리기 전에 먼저 붙여 넣는다(없으면 청구 화면이 바뀐 규칙을 못 읽어 도우미 사본으로 점검하고, 규칙 상자·띠가 읽기 실패를 보이고 모으기의 규칙 살피기가 멈춘다).
--
-- 무엇을 왜(ADR-040): 새 고시가 근거를 바꾼 점검 규칙마다 AI 판정(none·same·change·human) 한 줄을 둔다. 고시와 규칙은 병원과 상관없는 같은 자료라
-- hospital_id 없이 한 벌만 둔다. 줄은 모으기 계정만 넣고, 고치는 것은 state(live → old)뿐이다(지우는 길은 없다 — 모든 병원에서 빼려면 SQL 편집기로 old).
-- 바뀐 판(change)은 규칙 JSON과 시행일을 담고, 같은 규칙의 live 바뀐 판은 시행일마다 하나뿐이다. 되돌리기·본 때는 병원마다라 hospital_id 표다.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. rule_changes는 승인된 원장(my_hospital_id()가 있음)과 모으기 계정만 읽고,
-- 데스크·승인 대기·거절·병원 없는 계정·관리자는 0줄이다. 넣기는 모으기 계정만 정해 둔 칸에(id·state·created_at은 DB가 정한다), 고치기는 state를 old로만.
-- rule_change_marks는 승인된 원장이 자기 병원 줄만 읽고 넣고(change_id·seen_at·reverted, hospital_id는 DB 기본값) 고친다(seen_at·reverted, 지우기 없음).
-- 화면의 upsert(onConflict hospital_id,change_id)가 SET에 change_id를 같은 값으로 다시 쓰므로 change_id 고치기 권한도 주고, 다른 값으로 바꾸는 것은 트리거가 막는다.
-- reverted_at·updated_at은 트리거가 맞춘다. rule_review_tries는 표 권한·정책이 없다(rule_review_waiting·rule_review_failed만 쓴다)

-- AI 판정 줄(공용, 병원 칸 없음). change 줄만 rule·effective_from이 있다
create table if not exists public.rule_changes (
  id uuid primary key default gen_random_uuid(),
  notice_id uuid not null references public.notices (id) on delete cascade,
  rule_id text not null check (rule_id ~ '^[A-Z]{2}-[0-9]{2,3}[a-z]?$'),
  base_version text not null check (char_length(base_version) between 1 and 40),
  verdict text not null check (verdict in ('none', 'same', 'change', 'human')),
  by_ai boolean not null default true,
  check_code text check (check_code in ('no-auto', 'fixed', 'shape', 'size', 'names', 'removed', 'grade', 'status', 'date', 'tries')),
  why text not null default '' check (char_length(why) <= 120 and why !~ '[[:cntrl:]]'),
  before_text text not null default '' check (char_length(before_text) <= 100 and before_text !~ '[[:cntrl:]]'),
  after_text text not null default '' check (char_length(after_text) <= 100 and after_text !~ '[[:cntrl:]]'),
  effective_from date,
  rule jsonb,
  state text not null default 'live' check (state in ('live', 'old')),
  created_at timestamptz not null default now(),
  unique (notice_id, rule_id),
  check ((verdict = 'change' and rule is not null and effective_from is not null)
      or (verdict <> 'change' and rule is null and effective_from is null)),
  -- id·effective_from 칸이 없는 규칙도 막는다(비교가 null이면 coalesce가 거짓으로)
  check (rule is null or coalesce(jsonb_typeof(rule) = 'object' and octet_length(rule::text) <= 8000
      and rule ->> 'id' = rule_id and rule ->> 'effective_from' = effective_from::text, false))
);
create unique index if not exists rule_changes_live_from on public.rule_changes (rule_id, effective_from)
  where verdict = 'change' and state = 'live';
create index if not exists rule_changes_notice on public.rule_changes (notice_id);

-- 병원마다 바뀐 판 하나에 표시 한 줄: 본 때·되돌림·되돌린 때
create table if not exists public.rule_change_marks (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  change_id uuid not null references public.rule_changes (id) on delete cascade,
  seen_at timestamptz,
  reverted boolean not null default false,
  reverted_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (hospital_id, change_id)
);

-- 글마다 규칙 살피기 실패 수(0~3). 정의자 함수만 읽고 쓴다
create table if not exists public.rule_review_tries (
  notice_id uuid primary key references public.notices (id) on delete cascade,
  tries integer not null default 0 check (tries between 0 and 3),
  updated_at timestamptz not null default now()
);

-- 표시 넣기·고치기 앞: reverted가 참이 되면(넣기거나 전에 거짓) 되돌린 때 = 지금·본 때가 비었으면 지금, 거짓이면 되돌린 때를 비운다. 고친 때 = 지금.
-- change_id를 다른 값으로 바꾸는 고치기는 거부한다(upsert가 같은 값을 다시 쓰는 것만 지난다). 트리거만 부른다
create or replace function public.rule_change_marks_touch() returns trigger language plpgsql security invoker set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.change_id is distinct from old.change_id then
    raise exception 'change_id of a rule change mark cannot change' using errcode = '42501';
  end if;
  if new.reverted then
    if tg_op = 'INSERT' or not old.reverted then
      new.reverted_at := now();
      new.seen_at := coalesce(new.seen_at, now());
    end if;
  else
    new.reverted_at := null;
  end if;
  new.updated_at := now();
  return new;
end
$$;

create or replace trigger rule_change_marks_touch before insert or update on public.rule_change_marks
  for each row execute function public.rule_change_marks_touch();

alter table public.rule_changes enable row level security;
alter table public.rule_change_marks enable row level security;
alter table public.rule_review_tries enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.rule_changes, public.rule_change_marks, public.rule_review_tries from public, anon, authenticated;

-- 판정 줄: 읽기 + 정해 둔 칸 넣기(모으기의 upsert ignoreDuplicates는 겹치면 아무것도 안 함) + state 고치기. 지우기 권한 없음
grant select on table public.rule_changes to authenticated;
grant insert (notice_id, rule_id, base_version, verdict, by_ai, check_code, why, before_text, after_text, effective_from, rule),
  update (state)
  on table public.rule_changes to authenticated;
-- 내 병원 표시: hospital_id·reverted_at·updated_at은 뺀다(남의 병원으로 쓰지 못하게, 시각은 트리거가). change_id 고치기는 upsert SET 때문(값 바꾸기는 트리거가 막음)
grant select on table public.rule_change_marks to authenticated;
grant insert (change_id, seen_at, reverted),
  update (change_id, seen_at, reverted)
  on table public.rule_change_marks to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인된 원장이 아니면 my_hospital_id()가 null이다
drop policy if exists "공용 읽기(승인된 원장·모으기 계정)" on public.rule_changes;
create policy "공용 읽기(승인된 원장·모으기 계정)" on public.rule_changes
  for select to authenticated
  using ((select public.my_hospital_id()) is not null or (select public.is_notice_collector()));
drop policy if exists "모으기 계정 넣기" on public.rule_changes;
create policy "모으기 계정 넣기" on public.rule_changes
  for insert to authenticated
  with check ((select public.is_notice_collector()));
-- live → old만(old 줄을 되살리지 못한다)
drop policy if exists "모으기 계정 old로 고치기" on public.rule_changes;
create policy "모으기 계정 old로 고치기" on public.rule_changes
  for update to authenticated
  using ((select public.is_notice_collector()))
  with check ((select public.is_notice_collector()) and state = 'old');

drop policy if exists "내 병원 표시 읽기" on public.rule_change_marks;
create policy "내 병원 표시 읽기" on public.rule_change_marks
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 표시 넣기" on public.rule_change_marks;
create policy "내 병원 표시 넣기" on public.rule_change_marks
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 표시 고치기" on public.rule_change_marks;
create policy "내 병원 표시 고치기" on public.rule_change_marks
  for update to authenticated
  using (hospital_id = (select public.my_hospital_id()))
  with check (hospital_id = (select public.my_hospital_id()));

-- 규칙 살피기를 기다리는 글: 모으기 계정만(아니면 42501). done·요약 있음·posted_on > p_cutoff이고 rule_hits 가운데 판정 줄(state 상관없음)이 없는
-- 규칙이 하나라도 있고 실패 수가 3 미만인 글을 최근 글부터 p_limit(1~20으로 맞춤, 비면 20)개.
-- 줄 모양(src/types/ruleAuto.ts ReviewNotice): id·title·noticeNo·postedOn·kind·body·attachText·summary·url·source·ruleHits·pending·tries.
-- url·source = 출처 글 가운데 복지부 → 심평원 공지 → 심평원 심사기준, 같은 출처면 이른 날·id 차례의 첫 글(없으면 null).
-- pending = 판정 줄이 없는 규칙 id(rule_hits 차례, 같은 id는 한 번)
create or replace function public.rule_review_waiting(p_cutoff date, p_limit integer) returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
begin
  if not public.is_notice_collector() then
    raise exception 'not a notice collector' using errcode = '42501';
  end if;
  return (
    with hits as (
      select n.id as notice_id, e.item ->> 'id' as rule_id, min(e.n) as n
        from public.notices n
       cross join lateral jsonb_array_elements(n.rule_hits) with ordinality as e (item, n)
       where n.state = 'done'
         and n.summary is not null
         and n.posted_on > p_cutoff
         and jsonb_typeof(e.item) = 'object'
         and jsonb_typeof(e.item -> 'id') = 'string'
         and not exists (select 1 from public.rule_changes c where c.notice_id = n.id and c.rule_id = e.item ->> 'id')
       group by n.id, e.item ->> 'id'
    ),
    waiting as (
      select h.notice_id, jsonb_agg(h.rule_id order by h.n) as pending
        from hits h
       group by h.notice_id
    ),
    picked as (
      select n.id, n.title, n.notice_no, n.posted_on, n.kind, n.body, n.attach_text, n.summary, n.rule_hits, n.created_at,
             w.pending, coalesce(t.tries, 0) as review_tries
        from public.notices n
        join waiting w on w.notice_id = n.id
        left join public.rule_review_tries t on t.notice_id = n.id
       where coalesce(t.tries, 0) < 3
       order by n.posted_on desc, n.created_at desc, n.id desc
       limit least(greatest(coalesce(p_limit, 20), 1), 20)
    )
    select coalesce(jsonb_agg(
             jsonb_build_object(
               'id', g.id,
               'title', g.title,
               'noticeNo', g.notice_no,
               'postedOn', g.posted_on,
               'kind', g.kind,
               'body', g.body,
               'attachText', g.attach_text,
               'summary', g.summary,
               'url', s.url,
               'source', s.source,
               'ruleHits', g.rule_hits,
               'pending', g.pending,
               'tries', g.review_tries
             )
             order by g.posted_on desc, g.created_at desc, g.id desc),
           '[]'::jsonb)
      from picked g
      left join lateral (
        select p.url, p.source
          from public.notice_posts p
         where p.notice_id = g.id
         order by case p.source when 'mohw_rss' then 0 when 'hira_notice' then 1 else 2 end, p.posted_on, p.id
         limit 1
      ) s on true
  );
end
$$;

-- 규칙 살피기 실패 하나: 모으기 계정만(아니면 42501). 그 글의 실패 수를 1 올리고(3에서 멈춤) 새 값
create or replace function public.rule_review_failed(p_notice uuid) returns integer
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_tries integer;
begin
  if not public.is_notice_collector() then
    raise exception 'not a notice collector' using errcode = '42501';
  end if;
  insert into public.rule_review_tries as t (notice_id, tries)
  values (p_notice, 1)
  on conflict (notice_id) do update
     set tries = least(t.tries + 1, 3), updated_at = now()
  returning t.tries into v_tries;
  return v_tries;
end
$$;

-- 대시보드 파랑 띠(호출자 권한): live 바뀐 판 가운데 내 병원이 본 적 없고 되돌리지 않은 줄이 있는 글과 그 줄 수(최근 글부터).
-- 승인된 원장이 아니면(my_hospital_id()가 null — 모으기 계정 포함) 빈 목록
create or replace function public.rule_change_alerts() returns table (id uuid, notice_no text, title text, change_count integer)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.notice_no, n.title, count(*)::integer
    from public.notices n
    join public.rule_changes c on c.notice_id = n.id and c.verdict = 'change' and c.state = 'live'
    left join public.rule_change_marks m on m.change_id = c.id and m.hospital_id = (select public.my_hospital_id())
   where (select public.my_hospital_id()) is not null
     and m.seen_at is null
     and not coalesce(m.reverted, false)
   group by n.id
   order by n.posted_on desc, n.created_at desc, n.id desc
$$;

-- 글 화면 규칙 상자를 읽음(호출자 권한): 승인된 원장만(아니면 42501). 그 글의 live 바뀐 판마다 내 병원 표시의 본 때를 비었을 때만 지금으로
-- (없으면 줄을 만든다). reverted는 건드리지 않는다. 바꾼 줄 수
create or replace function public.see_rule_changes(p_notice uuid) returns integer
language plpgsql volatile security invoker set search_path = ''
as $$
declare
  v_count integer;
begin
  if public.my_hospital_id() is null then
    raise exception 'not an approved hospital owner' using errcode = '42501';
  end if;
  insert into public.rule_change_marks as m (change_id, seen_at)
  select c.id, now()
    from public.rule_changes c
   where c.notice_id = p_notice and c.verdict = 'change' and c.state = 'live'
  on conflict (hospital_id, change_id) do update
     set seen_at = now()
   where m.seen_at is null;
  get diagnostics v_count = row_count;
  return v_count;
end
$$;

-- 대시보드 맨 위 노랑 경고(다시 만듦, 인자·돌려주는 모양·호출자 그대로): live인 사람이 봐야 함(human) 줄이 있고 내 병원 규칙 확인이 없는 글,
-- rule_count = 그 human 줄 수(최근 글부터). rule_hits만 있고 human 줄이 없는 글은 나오지 않는다(AC-7806.4, notices AC-7403.6을 바꿈)
create or replace function public.notice_rule_alerts() returns table (id uuid, notice_no text, title text, rule_count integer)
language sql stable security invoker set search_path = ''
as $$
  select n.id, n.notice_no, n.title, h.n
    from public.notices n
   cross join lateral (
     select count(*)::integer as n
       from public.rule_changes c
      where c.notice_id = n.id and c.verdict = 'human' and c.state = 'live'
   ) h
   where h.n > 0
     and not exists (
       select 1
         from public.notice_marks m
        where m.notice_id = n.id and m.hospital_id = (select public.my_hospital_id()) and m.rules_checked_at is not null
     )
   order by n.posted_on desc, n.created_at desc, n.id desc
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거두고 authenticated에만 준다(트리거 함수는 아무에게도)
revoke all on function public.rule_change_marks_touch() from public, anon, authenticated;
revoke all on function public.rule_review_waiting(date, integer) from public, anon, authenticated;
revoke all on function public.rule_review_failed(uuid) from public, anon, authenticated;
revoke all on function public.rule_change_alerts() from public, anon, authenticated;
revoke all on function public.see_rule_changes(uuid) from public, anon, authenticated;
revoke all on function public.notice_rule_alerts() from public, anon, authenticated;
grant execute on function public.rule_review_waiting(date, integer) to authenticated;
grant execute on function public.rule_review_failed(uuid) to authenticated;
grant execute on function public.rule_change_alerts() to authenticated;
grant execute on function public.see_rule_changes(uuid) to authenticated;
grant execute on function public.notice_rule_alerts() to authenticated;
