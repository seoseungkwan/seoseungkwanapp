-- 업무일지 업무사항 글씨 크기(memo_font_pt): 그날 업무사항 칸 글씨 pt (worklog-memo-font REQ-1502)
-- 실행: 운영자가 Supabase SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 0100(업무일지)·0110(비트 칸 표시)이 먼저 들어가 있어야 한다.
-- 관문: 새 화면부터 읽기가 이 칸을 고른다. 이 파일을 붙여 넣기 전에는 새 화면을 사이트에 올리지 않는다
-- (붙여 넣는 것은 지금 사이트에 해가 없다: 옛 화면은 이 칸을 읽지도 보내지도 않고, 새 줄은 11이 된다)
-- 칸 하나와 그 칸의 넣기·고치기 권한만 더한다. 정책(my_hospital_id())·다른 칸·공용 함수는 그대로다.
-- 이미 있던 줄은 11이 된다. 칸이 이미 있으면 건너뛰므로 두 번 붙여 넣어도 그대로다
alter table public.worklog_days add column if not exists memo_font_pt smallint not null default 11
  check (memo_font_pt in (8, 9, 10, 11, 12, 14, 16));

-- 읽기는 표 권한(select)에 이미 들어 있다. upsert가 보낸 칸을 모두 SET에 쓰니 넣기·고치기 둘 다 준다
grant insert (memo_font_pt), update (memo_font_pt) on table public.worklog_days to authenticated;
