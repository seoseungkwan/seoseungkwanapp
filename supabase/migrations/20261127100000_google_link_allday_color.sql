-- 종일 메모 구글 색 DB: 종일 줄(calendar_allday)에 구글 일정 색 칸 g_color 하나·그 칸 제약 calendar_allday_g_color 하나·그 칸 넣기·고치기 권한
-- (spec google-link REQ-8554 AC-8554.2, design.md 21-13, ADR-053)
--
-- 실행: 운영자가 Supabase 관리 화면 → SQL Editor에 이 파일 전체를 붙여 한 번 실행한다(앱·CLI는 실행하지 않는다).
-- 먼저 20261126000000_google_link.sql(calendar_allday 구글 칸·고치기 정책·트리거)과 20261127000000_google_link_offcolor.sql이 들어가 있어야 한다
-- (지금 모든 migration 뒤에 붙인다). 그 표·정책·트리거는 여기서 다시 만들지 않는다.
-- 두 번 붙여 넣어도 그대로다(칸은 없을 때만 더하고, 제약은 없을 때만 더하고, 칸 권한은 같은 것을 다시 준다. 줄·다른 칸·정책·트리거는 건드리지 않는다).
-- 관문: 이 파일을 먼저 붙여 넣고 그다음 사이트에 올린다(새 사이트는 종일 줄을 읽을 때 g_color를 읽어, 칸이 없으면 예약 탭 종일 줄 읽기가 실패한다).
-- 이 파일만 먼저 붙인 동안에도 옛 사이트는 그대로 돈다(아무도 이 칸을 읽거나 쓰지 않는다 — 비어 있다).
--
-- 무엇을 왜(2026-11-27 사용자 사진): 구글과 이은 종일 메모는 그 구글 일정의 색을 적어 두고 그 색으로 칠한다("구글캘린더 색 따라가고 싶은거지").
-- g_color = 메모 줄만 구글 11색 이름 또는 'default'(구글에서 색 없음 = 캘린더 기본 색). 비어 있으면(null) 웹앱에만 있는 메모·아직 못 읽은 메모다.
-- 휴무(off) 줄은 색을 두지 않는다(휴무 줄 색은 gcal_links look.offColor, design.md 21-5). 환자 자료는 들어가지 않는다.
--
-- 권한: 로그인한 사용자(authenticated)만 이 칸을 넣고 고친다(anon은 이 표 권한이 하나도 없다 — 그대로). 어느 줄인지는 지금 정책이 정한다:
-- 승인된 원장·데스크가 자기 병원 줄만(넣기 '승인된 내 병원 종일 줄만'·'데스크 종일 줄', 고치기 '내 병원 종일 줄 고치기'·'데스크 종일 줄 고치기'),
-- 관리자 '다른 의원 보기' 중에는 쓰기 없음(admin_view restrictive 정책). 정책·트리거는 그대로다 — calendar_allday_gwait는 day·memo만 보므로
-- 색만 고치면 g_wait·g_wait_at은 그대로다.

alter table public.calendar_allday add column if not exists g_color text;

do $$
begin
  if not exists (select 1 from pg_constraint where conrelid = 'public.calendar_allday'::regclass and conname = 'calendar_allday_g_color') then
    alter table public.calendar_allday add constraint calendar_allday_g_color check (g_color is null or (type = 'memo' and g_color in ('lavender', 'sage', 'grape', 'flamingo', 'banana', 'tangerine', 'peacock', 'graphite', 'blueberry', 'basil', 'tomato', 'default')));
  end if;
end
$$;

-- 종일 줄 구글 색: 넣기·고치기(읽기는 표 읽기 권한이 이미 모든 칸을 준다)
grant insert (g_color), update (g_color) on table public.calendar_allday to authenticated;
