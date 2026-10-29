-- E2E 시험 계정 4개의 병원 줄·관리자 줄을 처음 상태로 맞춘다(되풀이 가능 — 시험이 상태를 어지럽혔을 때 되돌리는 도구)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 Run 한다. 몇 번 돌려도 결과가 같다
-- 먼저: Authentication → Users → Add user로 시험 계정 4개를 만들어 둔다(Auto Confirm User 체크)
--
-- 계정은 이메일 대신 이메일 앞부분(@ 앞)의 역할 표시로 찾는다. 대시보드에서 만든 이메일 계정만 센다(구글 계정은 세지 않는다)
--   관리자 e2e-admin → 'E2E 관리자 의원' approved + 관리자
--   승인됨 e2e-approved → 'E2E 승인 의원' approved
--   승인 대기 e2e-pending → 'E2E 대기 의원' pending(검토 날짜 없음)
--   신청 전 e2e-new → 병원 줄 없음
-- 시험 계정이 아닌 사용자의 줄은 건드리지 않는다. 바꾸는 일은 모두 아래 DO 블록 하나 안에서 하므로
-- 중간에 오류가 나면 앞에서 바꾼 줄까지 모두 취소된다(아무것도 바뀌지 않는다)

do $$
declare
  r record;
  acct record;
begin
  for r in
    select * from (values
      (1, '관리자', 'e2e-admin', 'E2E 관리자 의원', 'approved', true),
      (2, '승인됨', 'e2e-approved', 'E2E 승인 의원', 'approved', false),
      (3, '승인 대기', 'e2e-pending', 'E2E 대기 의원', 'pending', false),
      (4, '신청 전', 'e2e-new', null, null, false)
    ) as t (ord, role, tag, hospital, status, is_admin)
    order by ord
  loop
    begin
      select u.id, u.email, u.email_confirmed_at into strict acct
        from auth.users u
       where u.raw_app_meta_data ->> 'provider' = 'email'
         and split_part(lower(u.email), '@', 1) like '%' || r.tag || '%';
    exception
      when no_data_found then
        raise exception '''%'' 시험 계정이 없어요(이메일 앞부분 %). Authentication → Users → Add user로 만들고 Auto Confirm User를 체크한 뒤 다시 실행해 주세요. 아무것도 바꾸지 않았어요',
          r.role, r.tag;
      when too_many_rows then
        raise exception '''%'' 시험 계정이 2개 이상이에요(이메일 앞부분 %). Authentication → Users에서 하나만 남기고 지운 뒤 다시 실행해 주세요. 아무것도 바꾸지 않았어요',
          r.role, r.tag;
    end;

    if acct.email_confirmed_at is null then
      raise exception '''%'' 시험 계정의 이메일 확인이 안 됐어요(이메일 앞부분 %). Authentication → Users에서 지우고 Add user로 다시 만들 때 Auto Confirm User를 체크해 주세요. 아무것도 바꾸지 않았어요',
        r.role, r.tag;
    end if;

    if r.hospital is null then
      delete from public.hospitals where owner_id = acct.id;
    else
      insert into public.hospitals (owner_id, name, applicant_name, phone, email, status, reviewed_at)
      values (acct.id, r.hospital, 'E2E 시험', null, acct.email, r.status,
              case when r.status = 'approved' then now() end)
      on conflict (owner_id) do update
        set name = excluded.name,
            applicant_name = excluded.applicant_name,
            phone = excluded.phone,
            email = excluded.email,
            status = excluded.status,
            reviewed_at = excluded.reviewed_at;
    end if;

    if r.is_admin then
      insert into public.admins (user_id) values (acct.id) on conflict (user_id) do nothing;
    else
      delete from public.admins where user_id = acct.id;
    end if;
  end loop;
end;
$$;

-- 결과 표(읽기만): 역할·병원 상태·관리자 여부. 이메일은 보이지 않는다. 역할·표시는 위 DO 블록의 표와 같다
select r.role as "역할",
       coalesce(h.status, '없음') as "병원 상태",
       case when a.user_id is null then '아니요' else '예' end as "관리자"
  from (values
    (1, '관리자', 'e2e-admin'),
    (2, '승인됨', 'e2e-approved'),
    (3, '승인 대기', 'e2e-pending'),
    (4, '신청 전', 'e2e-new')
  ) as r (ord, role, tag)
  join auth.users u
    on u.raw_app_meta_data ->> 'provider' = 'email'
   and split_part(lower(u.email), '@', 1) like '%' || r.tag || '%'
  left join public.hospitals h on h.owner_id = u.id
  left join public.admins a on a.user_id = u.id
 order by r.ord;
