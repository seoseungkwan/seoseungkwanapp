-- 통계 달 줄에 세 칸 합계(sections)를 더한다: 환자 구성·시간대별 접수·원장님별의 달 합계 숫자 (spec stats-bit-ai REQ-2902, AC-2902.1)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다). 붙여 넣는 때는 사용자 OK 뒤다.
-- 통계 마이그레이션(20261101000200_stats.sql)이 먼저 들어가 있어야 한다.
-- 관문: 새 웹(통계 저장·AI 리포트 읽기가 이 칸을 쓴다)은 이 파일을 붙인 뒤에 사이트에 올린다. 그 전에는 모르는 칸 때문에 저장·읽기가 실패한다.
-- 붙여 넣는 것은 지금 사이트에 해가 없다: 옛 웹은 이 칸을 보내지 않고, 있던 줄은 빈 값(NULL)이 된다.
--
-- 칸 하나와 그 칸의 넣기·고치기 권한만 더한다. RLS 정책(my_hospital_id())·다른 칸·완전한 줄 지키기 트리거·공용 함수는 그대로다.
-- 트리거가 옛 줄을 통째로 돌려주므로, 다 불러온 달 위에 덜 덮인 달을 저장하면 sections도 옛 값이 남는다(AC-2902.4).
-- 칸이 이미 있으면 건너뛰므로 두 번 붙여 넣어도 그대로다. 환자 번호·차트번호·이름은 이 칸에 없다(묶음 이름과 수, 원장님 이름·매출뿐)
--
-- 안 모양 검사는 lib/payload/validate.ts(validateMonthSections) 한 곳이다. DB는 객체인지·v·month·partial이 줄과 같은지·크기만 본다.
-- check는 NULL을 통과시킨다. 빈 칸(NULL)은 받고, 값이 있는데 열쇠가 없어 비교가 NULL이 되면 거부하려고 묶음을 is true로 감싼다.
-- 크기 한도 65,536바이트: 줄 수가 많아야 열 몇 줄이라 실제로는 1~3KB다

alter table public.stats_months add column if not exists sections jsonb
  constraint stats_months_sections_check check (
    sections is null
    or (
      jsonb_typeof(sections) = 'object'
      and sections -> 'v' = '1'::jsonb
      and sections -> 'month' = to_jsonb(month)
      and sections -> 'partial' = to_jsonb(partial)
      and octet_length(sections::text) <= 65536
    ) is true
  );

-- 읽기는 표 권한(select)에 이미 들어 있다. PostgREST upsert가 보낸 칸을 모두 SET에 쓰니 넣기·고치기 둘 다 준다
grant insert (sections), update (sections) on table public.stats_months to authenticated;
