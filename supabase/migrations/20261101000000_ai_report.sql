-- AI 월간 리포트 저장 DB: 달별 리포트(ai_reports)·달별 사용량(ai_usage) 표, RLS, 쓰기 함수 둘 (ADR-024)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 20261028000000_auth.sql(hospitals 표)을 먼저 실행해 둔 DB에서 돌린다
--
-- 권한: 로그인 안 한 사용자(anon)는 아무것도 못 한다. 로그인한 사용자(authenticated)는 자기 병원 줄만 읽는다.
-- 관리자 예외는 없다(남의 AI 리포트·사용량은 볼 일이 없다).
-- 두 표에 직접 넣기·고치기·지우기 권한은 아무에게도 없다. 쓰기는 내 병원이 승인됐는지 확인하는
-- save_ai_report·add_ai_usage로만 한다(병원은 auth.uid()로만 정한다). service role 키는 쓰지 않는다

-- 병원·달마다 리포트 하나. 다시 분석하면 그 달 줄을 덮어쓴다(옛 판은 남기지 않는다).
-- report = { partial, summary, cards }(SavedReport에서 달·모델·지문을 뺀 것), input_hash = 만들 때 쓴 숫자의 SHA-256
create table public.ai_reports (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  report jsonb not null check (jsonb_typeof(report) = 'object' and pg_column_size(report) <= 32768),
  input_hash text not null check (input_hash ~ '^[0-9a-f]{64}$'),
  model text not null check (char_length(model) between 1 and 100),
  created_at timestamptz not null default now(),
  primary key (hospital_id, month)
);

-- 병원·달(한국 날짜)마다 AI 부름 횟수·토큰·비용(백만분의 1달러) 합. 화면 표시용이고 정확한 청구는 Anthropic 콘솔이 기준이다
create table public.ai_usage (
  hospital_id uuid not null references public.hospitals (id) on delete cascade,
  month text not null check (month ~ '^[0-9]{4}-(0[1-9]|1[0-2])$'),
  calls integer not null default 0 check (calls >= 0),
  input_tokens bigint not null default 0 check (input_tokens >= 0),
  output_tokens bigint not null default 0 check (output_tokens >= 0),
  cost_micro_usd bigint not null default 0 check (cost_micro_usd >= 0),
  updated_at timestamptz not null default now(),
  primary key (hospital_id, month)
);

alter table public.ai_reports enable row level security;
alter table public.ai_usage enable row level security;

-- Supabase는 새 표에 anon·authenticated 모든 권한을 기본으로 준다. 먼저 다 거두고 읽기만 준다
revoke all on table public.ai_reports, public.ai_usage from anon, authenticated;
grant select on table public.ai_reports, public.ai_usage to authenticated;

-- 내 병원(owner_id = 나) 줄만. hospitals 정책과 달리 관리자 예외가 없다
-- (select auth.uid()): 줄마다가 아니라 문장마다 한 번 계산한다(Supabase 권장)
create policy "내 병원 AI 리포트 읽기" on public.ai_reports
  for select to authenticated
  using (exists (select 1 from public.hospitals h where h.id = hospital_id and h.owner_id = (select auth.uid())));

create policy "내 병원 AI 사용량 읽기" on public.ai_usage
  for select to authenticated
  using (exists (select 1 from public.hospitals h where h.id = hospital_id and h.owner_id = (select auth.uid())));

-- 내 병원 그 달 리포트 저장(있으면 덮어쓰기). 달·리포트·지문·모델 모양은 표의 검사 제약이 막는다(23514)
create function public.save_ai_report(p_month text, p_report jsonb, p_input_hash text, p_model text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hospital_id uuid;
begin
  select h.id into v_hospital_id
    from public.hospitals h
   where h.owner_id = (select auth.uid()) and h.status = 'approved';

  if v_hospital_id is null then
    raise exception 'hospital not approved' using errcode = '42501';
  end if;

  insert into public.ai_reports (hospital_id, month, report, input_hash, model)
  values (v_hospital_id, p_month, p_report, p_input_hash, p_model)
  on conflict (hospital_id, month) do update
     set report = excluded.report,
         input_hash = excluded.input_hash,
         model = excluded.model,
         created_at = now();
end;
$$;

-- 내 병원 이번 달(한국 날짜) 사용량에 한 번의 부름을 더한다
create function public.add_ai_usage(p_input bigint, p_output bigint, p_cost bigint)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hospital_id uuid;
begin
  select h.id into v_hospital_id
    from public.hospitals h
   where h.owner_id = (select auth.uid()) and h.status = 'approved';

  if v_hospital_id is null then
    raise exception 'hospital not approved' using errcode = '42501';
  end if;

  if p_input is null or p_output is null or p_cost is null or p_input < 0 or p_output < 0 or p_cost < 0 then
    raise exception 'usage must be zero or more' using errcode = '22023';
  end if;

  insert into public.ai_usage as u (hospital_id, month, calls, input_tokens, output_tokens, cost_micro_usd)
  values (v_hospital_id, to_char(now() at time zone 'Asia/Seoul', 'YYYY-MM'), 1, p_input, p_output, p_cost)
  on conflict (hospital_id, month) do update
     set calls = u.calls + 1,
         input_tokens = u.input_tokens + excluded.input_tokens,
         output_tokens = u.output_tokens + excluded.output_tokens,
         cost_micro_usd = u.cost_micro_usd + excluded.cost_micro_usd,
         updated_at = now();
end;
$$;

-- Postgres는 새 함수를 PUBLIC에, Supabase는 anon에도 열어 둔다. 거두고 authenticated에만 준다
revoke all on function public.save_ai_report(text, jsonb, text, text) from public, anon, authenticated;
revoke all on function public.add_ai_usage(bigint, bigint, bigint) from public, anon, authenticated;
grant execute on function public.save_ai_report(text, jsonb, text, text) to authenticated;
grant execute on function public.add_ai_usage(bigint, bigint, bigint) to authenticated;
