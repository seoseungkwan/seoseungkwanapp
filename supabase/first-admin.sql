-- 운영자 본인의 구글 계정을 관리자로 넣고, 그 계정의 병원을 승인한다(처음 한 번. 다시 돌려도 결과가 같다)
--
-- 실행: 운영자가 사이트에서 구글로 로그인해 가입 신청을 한 뒤, Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 Run 한다
-- 이메일을 손으로 넣지 않는다: 구글로 들어온 계정 가운데 이메일 앞부분(@ 앞)에 시험 표시(e2e-)가 없는 것이
-- 정확히 하나일 때만 그 계정을 운영자로 본다. 마이그레이션 끝 주석의 방법(이메일 넣기)을 대신한다
-- 조건이 맞지 않으면 아무것도 바꾸지 않고 오류로 멈춘다

do $$
declare
  operator_id uuid;
begin
  -- 세기와 고르기를 한 문장으로 한다(그 사이에 구글 계정이 새로 들어와도 엉뚱한 계정을 고르지 않게)
  begin
    select u.id into strict operator_id
      from auth.users u
     where u.raw_app_meta_data -> 'providers' ? 'google'
       and split_part(lower(u.email), '@', 1) not like '%e2e-%';
  exception
    when no_data_found then
      raise exception '구글로 들어온 계정(시험 계정 빼고)이 0개예요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
    when too_many_rows then
      raise exception '구글로 들어온 계정(시험 계정 빼고)이 2개 이상이에요. 1개여야 해요. 아무것도 바꾸지 않았어요 — 이 문구를 Claude에게 알려 주세요';
  end;

  if not exists (select 1 from public.hospitals h where h.owner_id = operator_id) then
    raise exception '운영자 계정의 가입 신청이 없어요. 먼저 사이트에서 구글로 로그인해 가입 신청을 한 뒤 다시 실행해 주세요. 아무것도 바꾸지 않았어요';
  end if;

  insert into public.admins (user_id) values (operator_id) on conflict (user_id) do nothing;

  -- 이미 승인이면 검토 날짜를 그대로 둔다(다시 돌려도 같다)
  update public.hospitals h
     set status = 'approved',
         reviewed_at = case when h.status = 'approved' then coalesce(h.reviewed_at, now()) else now() end
   where h.owner_id = operator_id;
end;
$$;

-- 결과 표(읽기만): 역할·병원 상태·관리자 여부. 이메일은 보이지 않는다
select '운영자' as "역할",
       h.status as "병원 상태",
       case when a.user_id is null then '아니요' else '예' end as "관리자"
  from auth.users u
  join public.hospitals h on h.owner_id = u.id
  left join public.admins a on a.user_id = u.id
 where u.raw_app_meta_data -> 'providers' ? 'google'
   and split_part(lower(u.email), '@', 1) not like '%e2e-%';
