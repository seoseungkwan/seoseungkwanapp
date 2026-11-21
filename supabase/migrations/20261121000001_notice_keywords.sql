-- 고시·공지 탭 내 낱말(꼭 볼 글) DB: 병원마다 고른 낱말(notice_keywords)과 그 낱말이 든 글 맞춤(notice_keyword_hits),
-- 맞춤을 늘 맞게 두는 트리거, 꼭 볼 글을 넣도록 다시 만든 목록 함수 둘(notice_list·notice_unread_count)
-- (spec notices REQ-7424 AC-7424.3~AC-7424.6, design.md 15절, ADR-037)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261121000000_notices.sql(고시·공지 표·my_hospital_id()·notice_list)이 들어가 있어야 한다. 그 파일의 함수는 다시 만들지 않고 그대로 쓴다.
-- 두 번 붙여 넣어도 그대로다(표·색인은 없을 때만 만들고, 함수·트리거는 바꿔 쓰고, 권한은 거두고 다시 주고, 정책은 지우고 다시 만든다.
-- 이미 있던 낱말·맞춤 줄은 그대로).
-- 20261121000000_notices.sql을 다시 붙이면 목록 함수가 낱말 없는 판으로 돌아가니 이 파일도 다시 붙인다(design 13절).
-- 관문: 이 파일을 붙여 넣은 뒤에 내 낱말 화면을 사이트에 올린다(없으면 낱말 읽기·저장이 실패하고 목록 줄에 keywords가 없다).
--
-- 무엇을 왜(ADR-037): 고시·공지 글은 모든 병원이 같이 보는 공용 줄이지만, 고른 낱말과 그 맞춤은 병원마다 다르므로 hospital_id 표다.
-- 맞춤은 DB가 미리 해 둔다(화면은 붙임 글자를 받지 않고 맞은 낱말만 받는다). 맞춤 줄은 정의자 트리거만 쓴다:
-- 원장이 낱말을 넣거나 지우면 그 병원 줄을, 모으기 계정이 글을 넣거나 제목·본문·붙임 글자·요약을 고치면 그 글의 모든 병원 줄을 같은 문장 안에서 다시 맞춘다.
-- 맞음 = 제목·본문·붙임 글자·요약 what·when·who·forUs 가운데 한 칸이라도 정규화한 글 안에 정규화한 낱말이 든다(칸을 잇지 않는다).
-- 정규화 notice_norm = 화면 normKeyword와 같은 규칙: 빈칸·탭·줄바꿈(\n·\r)·U+00A0·U+3000을 빼고 영문 A~Z만 소문자로.
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 승인된 원장은 notice_keywords에서 내 병원 줄만 읽고 넣고(word만, hospital_id는 DB 기본값,
-- word_norm·created_at은 DB가 채움) 지운다(고치기 없음). notice_keyword_hits는 내 병원 줄 읽기만이고 누구도 직접 넣고 고치고 지우지 못한다.
-- 데스크·승인 대기·거절·병원 없는 계정·관리자·모으기 계정은 두 표 모두 0줄이다. 환자 정보 모양 검사는 화면(checkKeyword)이 한다.
-- 화면 쪽(src/lib/storage/notices.ts)이 쓰는 모양: 읽기 select word order by created_at, word_norm · 넣기 { word } · 지우기 word = 낱말 ·
-- notice_list 줄마다 keywords(맞은 낱말 배열, 없으면 [])

-- 낱말·글 정규화(바뀌지 않는 값만 본다). 줄 제약·만든 칸(word_norm)이 부르므로 넣는 사람(authenticated)이 부를 수 있어야 한다.
-- translate는 정규식·lower()보다 빠르고 DB 글자 설정(collation)에 기대지 않는다. 바꿀 글자보다 남는 앞 글자(빈칸 여섯)는 지운다
create or replace function public.notice_norm(s text) returns text language sql immutable security invoker set search_path = ''
as $$
  select translate(s, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ' || E' \t\n\r 　', 'abcdefghijklmnopqrstuvwxyz')
$$;

-- 병원마다 고른 낱말 0~30개. word는 화면이 다듬은 글(앞뒤 빈칸 없음, 1~20자, 제어 문자 없음, 정규화하면 빈 글자가 아님).
-- 띄어쓰기·영문 대소문자만 다른 낱말은 같은 낱말이라 병원마다 하나만(pk가 정규화 칸)
create table if not exists public.notice_keywords (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  word text not null check (
    word = btrim(word, E'  　')
    and char_length(word) between 1 and 20
    and word !~ '[[:cntrl:]]'
    and public.notice_norm(word) <> ''
  ),
  word_norm text generated always as (public.notice_norm(word)) stored,
  created_at timestamptz not null default now(),
  primary key (hospital_id, word_norm)
);

-- 병원·글마다 맞은 낱말(넣은 차례). 맞은 낱말이 없으면 줄이 없다. 쓰기는 아래 정의자 트리거뿐이다
create table if not exists public.notice_keyword_hits (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  notice_id uuid not null references public.notices (id) on delete cascade,
  words text[] not null check (cardinality(words) between 1 and 30),
  primary key (hospital_id, notice_id)
);
create index if not exists notice_keyword_hits_notice on public.notice_keyword_hits (notice_id);

-- 글 한 줄의 맞춤 칸 일곱을 정규화한 배열(칸마다 따로, 잇지 않는다). 트리거가 글마다 한 번만 정규화하려고 둔다
create or replace function public.notice_fields(n public.notices) returns text[] language sql immutable security invoker set search_path = ''
as $$
  select array[
    public.notice_norm(n.title), public.notice_norm(n.body), public.notice_norm(n.attach_text),
    public.notice_norm(n.summary ->> 'what'), public.notice_norm(n.summary ->> 'when'),
    public.notice_norm(n.summary ->> 'who'), public.notice_norm(n.summary ->> 'forUs')
  ]
$$;

-- 정규화한 칸들 가운데 하나라도 정규화한 낱말을 담는가(빈 낱말은 맞지 않음)
create or replace function public.notice_hit(p_fields text[], p_word text) returns boolean language sql immutable security invoker set search_path = ''
as $$
  select coalesce(p_word, '') <> '' and exists (select 1 from unnest(p_fields) as f (t) where strpos(f.t, p_word) > 0)
$$;

-- 낱말 넣기 앞: 병원마다 잠근 뒤(같은 때 두 번 넣어도 하나씩) 이미 30개면 거부(23514). 병원이 없으면(null) 정책·not null이 막게 둔다
create or replace function public.notice_keywords_cap() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if new.hospital_id is null then
    return new;
  end if;
  perform pg_advisory_xact_lock(hashtextextended('notice_keywords:' || new.hospital_id::text, 0));
  if (select count(*) from public.notice_keywords k where k.hospital_id = new.hospital_id) >= 30 then
    raise exception 'a hospital can keep up to 30 notice keywords' using errcode = 'check_violation';
  end if;
  return new;
end
$$;

-- 낱말 넣기·지우기 뒤: 넣으면 모든 글 가운데 맞는 글의 그 병원 줄 끝에 낱말을 더하고,
-- 지우면 그 병원 줄에서 낱말을 빼며 남은 낱말이 없는 줄은 지운다
create or replace function public.notice_keywords_hits() returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.notice_keyword_hits as h (hospital_id, notice_id, words)
    select new.hospital_id, n.id, array[new.word]
      from public.notices n
     where public.notice_hit(public.notice_fields(n), new.word_norm)
    on conflict (hospital_id, notice_id) do update set words = h.words || excluded.words;
  else
    delete from public.notice_keyword_hits h
     where h.hospital_id = old.hospital_id and h.words = array[old.word];
    update public.notice_keyword_hits h
       set words = array_remove(h.words, old.word)
     where h.hospital_id = old.hospital_id and old.word = any (h.words);
  end if;
  return null;
end
$$;

-- 글 넣기·맞춤 칸 고치기 뒤: 그 글의 줄을 지우고 모든 병원 낱말로 다시 넣는다(낱말은 넣은 차례).
-- 모으기 계정의 문장 안에서 돌지만 정의자라 낱말을 읽는다(모으기 계정은 낱말·맞춤 줄을 직접 읽지 못한다). 칸이 그대로면 아무것도 하지 않는다
create or replace function public.notice_hits_rematch() returns trigger language plpgsql security definer set search_path = ''
as $$
declare
  v_fields text[];
begin
  if tg_op = 'UPDATE'
     and new.title is not distinct from old.title
     and new.body is not distinct from old.body
     and new.attach_text is not distinct from old.attach_text
     and new.summary is not distinct from old.summary then
    return null;
  end if;
  v_fields := public.notice_fields(new);
  delete from public.notice_keyword_hits h where h.notice_id = new.id;
  insert into public.notice_keyword_hits (hospital_id, notice_id, words)
  select k.hospital_id, new.id, array_agg(k.word order by k.created_at, k.word_norm)
    from public.notice_keywords k
   where public.notice_hit(v_fields, k.word_norm)
   group by k.hospital_id;
  return null;
end
$$;

create or replace trigger notice_keywords_cap before insert on public.notice_keywords
  for each row execute function public.notice_keywords_cap();
create or replace trigger notice_keywords_hits after insert or delete on public.notice_keywords
  for each row execute function public.notice_keywords_hits();
create or replace trigger notice_hits_rematch after insert or update of title, body, attach_text, summary on public.notices
  for each row execute function public.notice_hits_rematch();

alter table public.notice_keywords enable row level security;
alter table public.notice_keyword_hits enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 필요한 것만 준다
revoke all on table public.notice_keywords, public.notice_keyword_hits from public, anon, authenticated;
-- 낱말: 읽기·지우기 + 넣기는 word 칸만(hospital_id·word_norm·created_at은 DB가 정한다). 고치기 없음
grant select, delete on table public.notice_keywords to authenticated;
grant insert (word) on table public.notice_keywords to authenticated;
-- 맞춤: 읽기만(쓰기는 정의자 트리거)
grant select on table public.notice_keyword_hits to authenticated;

-- (select …): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장). 승인된 원장이 아니면 my_hospital_id()가 null이다
drop policy if exists "내 병원 낱말 읽기" on public.notice_keywords;
create policy "내 병원 낱말 읽기" on public.notice_keywords
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 낱말 넣기" on public.notice_keywords;
create policy "내 병원 낱말 넣기" on public.notice_keywords
  for insert to authenticated
  with check (hospital_id = (select public.my_hospital_id()));
drop policy if exists "내 병원 낱말 지우기" on public.notice_keywords;
create policy "내 병원 낱말 지우기" on public.notice_keywords
  for delete to authenticated
  using (hospital_id = (select public.my_hospital_id()));

drop policy if exists "내 병원 맞춤 읽기" on public.notice_keyword_hits;
create policy "내 병원 맞춤 읽기" on public.notice_keyword_hits
  for select to authenticated
  using (hospital_id = (select public.my_hospital_id()));

-- 목록(호출자 권한) 다시 만들기: 20261121000000_notices.sql 본문 그대로에 낱말 자리만 더한다 —
-- 내 병원 맞춤 줄을 잇고(left join), 줄마다 keywords(맞은 낱말, 없으면 []), p_related 참이면 맞은 글도 든다(AI가 관련 아님으로 본 글 포함).
-- 인자·돌려주는 모양·호출자·권한은 그대로다
create or replace function public.notice_list(
  p_related boolean, p_sources text[], p_starred boolean, p_ids uuid[], p_unread_only boolean, p_limit integer, p_offset integer
) returns jsonb language sql stable security invoker set search_path = ''
as $$
  with me as (
    select (select public.my_hospital_id()) as hospital_id, (now() at time zone 'Asia/Seoul')::date as today
  ),
  picked as (
    select n.id, n.title, n.kind, n.posted_on, n.notice_no, n.related, n.summary, n.read_mode, n.state, n.rule_hits, n.created_at,
           m.read_at, coalesce(m.starred, false) as starred, coalesce(m.memo, '') as memo, m.memo_at, m.rules_checked_at,
           (n.posted_on > me.today - 14 and m.read_at is null) as unread,
           coalesce(h.words, '{}'::text[]) as keywords
      from public.notices n
     cross join me
      left join public.notice_marks m on m.notice_id = n.id and m.hospital_id = me.hospital_id
      left join public.notice_keyword_hits h on h.notice_id = n.id and h.hospital_id = me.hospital_id
     where (not coalesce(p_related, false) or n.related is not false or n.state <> 'done' or h.notice_id is not null)
       and (p_sources is null or exists (select 1 from public.notice_posts p where p.notice_id = n.id and p.source = any (p_sources)))
       and (not coalesce(p_starred, false) or coalesce(m.starred, false))
       and (p_ids is null or n.id = any (p_ids))
  ),
  kept as (
    select * from picked where not coalesce(p_unread_only, false) or unread
  ),
  page as (
    select *
      from kept
     order by posted_on desc, created_at desc, id desc
     limit least(greatest(coalesce(p_limit, 50), 1), 50)
    offset greatest(coalesce(p_offset, 0), 0)
  )
  select jsonb_build_object(
    'total', (select count(*) from kept),
    'unread', (select count(*) from kept where unread),
    'rows', coalesce((
      select jsonb_agg(
               jsonb_build_object(
                 'id', g.id,
                 'title', g.title,
                 'kind', g.kind,
                 'postedOn', g.posted_on,
                 'noticeNo', g.notice_no,
                 'related', g.related,
                 'summary', g.summary,
                 'readMode', g.read_mode,
                 'state', g.state,
                 'ruleHits', g.rule_hits,
                 'posts', (
                   select coalesce(jsonb_agg(
                            jsonb_build_object('source', p.source, 'title', p.title, 'url', p.url, 'postedOn', p.posted_on, 'attachments', p.attachments)
                            order by case p.source when 'mohw_rss' then 0 when 'hira_notice' then 1 else 2 end, p.posted_on, p.created_at, p.id),
                          '[]'::jsonb)
                     from public.notice_posts p
                    where p.notice_id = g.id
                 ),
                 'mark', jsonb_build_object(
                   'readAt', g.read_at, 'starred', g.starred, 'memo', g.memo, 'memoAt', g.memo_at, 'rulesCheckedAt', g.rules_checked_at
                 ),
                 'keywords', g.keywords,
                 'unread', g.unread
               )
               order by g.posted_on desc, g.created_at desc, g.id desc)
        from page g
    ), '[]'::jsonb)
  )
$$;

-- 탭 숫자·대시보드: 목록의 '관련 글만'(관련 글·요약 전·실패 글·내 낱말이 맞은 글) 가운데 안 읽은 수.
-- 본문은 첫 파일 그대로다(다시 만든 notice_list의 거르기를 따르므로 꼭 볼 글이 저절로 든다)
create or replace function public.notice_unread_count() returns integer language sql stable security invoker set search_path = ''
as $$
  select (public.notice_list(true, null, false, null, false, 1, 0) ->> 'unread')::integer
$$;

-- 함수는 기본으로 public이 부를 수 있고, Supabase는 anon·authenticated에도 준다. 다 거두고 필요한 것만 authenticated에 준다
-- (도우미 둘·트리거 함수 셋은 아무에게도 주지 않는다. 트리거·정의자 함수 안에서만 돈다)
revoke all on function public.notice_norm(text) from public, anon, authenticated;
revoke all on function public.notice_fields(public.notices) from public, anon, authenticated;
revoke all on function public.notice_hit(text[], text) from public, anon, authenticated;
revoke all on function public.notice_keywords_cap() from public, anon, authenticated;
revoke all on function public.notice_keywords_hits() from public, anon, authenticated;
revoke all on function public.notice_hits_rematch() from public, anon, authenticated;
revoke all on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) from public, anon, authenticated;
revoke all on function public.notice_unread_count() from public, anon, authenticated;
grant execute on function public.notice_norm(text) to authenticated;
grant execute on function public.notice_list(boolean, text[], boolean, uuid[], boolean, integer, integer) to authenticated;
grant execute on function public.notice_unread_count() to authenticated;
