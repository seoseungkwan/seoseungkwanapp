# 설계: 통계 더 보기

## 원칙
- 새 차례(TOC) 칸은 만들지 않는다. 있는 칸 안에 넣는다: 요약(알림·목표), 처방(새 탭), 예약(시행자 표 두 칸·빈자리), 매출(새 탭), 진료 운영(휴일), 보고(월간 보고서).
- 계산은 순수 함수(`lib/analytics`·`lib/calendar`)에 두고 화면 부품은 그 결과만 그린다. 환자 번호·금액이 줄 단위로 Worker 밖에 나가지 않는다.
- 서버에 새로 두는 것은 목표 표 하나뿐이다. ③·⑥은 저장하지 않는다(`validate.ts`·`stats_months` 그대로).

## 구성 요소

| 무엇 | 파일 | 자료 |
|---|---|---|
| 알림 | `lib/analytics/alerts.ts` `buildAlerts({today, days, cal})` → `Alert[]` `{kind:'down'|'up'|'warn', text, range}` | 저장된 하루 숫자 35일 + 예약 수 세기 줄(이미 12달 읽음) |
| 넓은 하루 읽기 | `components/stats/useWideDays.ts` — 오늘 앞 12달 `stats_days`를 기간 고르기와 따로 한 번 읽음(`useAgainDays`와 같은 길). 알림·휴일·목표(내원·신환)가 함께 씀 | Supabase |
| 목표 | SQL `stats_goals`, `lib/storage/goals.ts`, `types/goals.ts` `Goal = {visits, newPatients, revenue}`(각 number|null), `lib/analytics/goalPace.ts`, `components/stats/useStatsGoals.ts`, `sections/GoalSection.tsx` | 내원·신환 = 넓은 하루 읽기, 매출 = `sales_days`(이번 달 + 앞 56일, `lib/storage/revenue.ts`의 있는 읽기) |
| 이탈 | `lib/analytics/dropoff.ts`, Worker `jobs.ts` `sectionsJob`에 `dropoff` 칸, `types/stats.ts` `BitSectionsView.dropoff`, `sections/DropoffSection.tsx`, `RxSection.tsx` 탭 | Worker 메모리(BitMemory) |
| 예약 줄 | `lib/storage/calendar.ts` `listCalendarSlots` → `CalSlotRow`(`types/calendar.ts`) | calendar_appts(이미 있는 select 권한·RLS, 새 SQL 없음) |
| 다시 예약 | `lib/calendar/rebook.ts` `rebookRates(rows, today)` | 예약 줄 12달 |
| 빈자리 | `lib/calendar/occupancy.ts` `occupancy({rows, offs, settings, today, staffId})`, `sections/OccupancySection.tsx`(CalendarSection 안에서 그림) | 예약 줄 56일 + `listAllDay` 휴무 |
| 1명당 매출 | 도우미 `StatsSql`/`StatsCommands`(v5 `extra.pays`), `workers/stats/helperData.ts`, `lib/analytics/patientValue.ts`, `sectionsJob`의 `value` 칸, `sections/PatientValueSection.tsx`, `RevenueSection.tsx` 탭 | Worker 메모리 |
| 휴일 | `lib/analytics/holidays.ts`(`HOLIDAYS`), `lib/analytics/holidayEffect.ts`, `sections/HolidaySection.tsx` | 넓은 하루 읽기 |
| 월간 보고서 | `components/stats/report/MonthlyReport.tsx`·`reportData.ts`(순수: 여러 자료 → 보고서 칸 목록), `sections/ReportSection.tsx` | `stats_months`(있는 읽기)·매출·예약·목표·Bit 메모리 결과 |

## 정한 것과 까닭
- **예약 줄 새 읽기**: `CalCountRow`에 칸을 더하면 예약 탭 월 보기와 그 시험이 함께 바뀐다. 통계만 쓰는 `listCalendarSlots`를 따로 둔다. 차트번호는 다시 예약 셈에만 쓰고 `lib/calendar`(환자 자료 구역) 순수 함수 안에서 끝난다. 이름·메모는 읽지 않는다(ADR-030 범위 안: 이미 서버에 있는 값, 내 병원 로그인만).
- **이탈·1명당 매출을 `sectionsJob`에**: 화면이 이미 Bit 칸 결과(`BitSectionsView`)를 받는 길이 있어 새 요청 종류를 만들지 않는다. 메모리 기간(많아야 약 26달)이 대상 범위다.
- **도우미 금액 줄**: 원장님별 금액(`ByDoctorDay`)과 같은 NativeRows에서 묶는 칸만 차트번호·수납일로 바꾼다(`ByPatientDay`). 글자 처리 없는 SUM/GROUP BY라 가볍다. 답 `v` 5. 옛 도우미(v3·v4)는 그대로 받고 ⑥만 안내 글.
- **공휴일은 고정 목록**: 음력 명절 때문에 계산식 대신 2025~2027 목록. 해마다 더한다(화면 글에 범위를 적음).
- **월간 보고서는 화면에 그대로**: 인쇄 전용 사본을 숨겨 두는 것보다 단순하다. 인쇄 때는 보고서 밖을 `print:hidden`으로 가린다(AppShell은 이미 머리줄을 가림). `@page`는 A4 세로.
- **묶음**: ①③⑥⑧ 모두 통계 탭이 지금 쓰는 처방 묶음(`stats_rx_groups`/묶음별 추세) 그대로.

## 자료 흐름
1. 화면이 열리면 `useWideDays`·`useStatsCalendar`(예약 줄·휴무 더 읽음)·`useStatsGoals`가 각자 읽는다. 실패하면 그 칸만 '불러오지 못했어요'(있는 부품 모양), 다른 칸은 그대로.
2. 비트에서 불러오면 Worker `sectionsJob`이 `dropoff`·`value`를 함께 낸다.
3. 보고 칸은 위 결과들과 고른 달의 `stats_months`·매출을 `reportData`로 묶어 그린다.

## 위험
- 예약 탭을 쓴 지 얼마 안 돼 ④⑤와 알림의 예약 줄은 한동안 비거나 '—'다(화면 글로 알림).
- 메모리 기간이 짧게 불러와졌으면(예: 최근 30일) ③⑥ 대상이 거의 없다 → '아직 셀 환자가 없어요'. 넓게 불러오는 방법은 기존 '불러올 기간' 고르기.
- 도우미 0.11.0을 깔기 전에는 ⑥이 안내 글만 보인다. 웹 배포는 도우미 릴리스 뒤에 한다.
- 목표 SQL을 넣기 전에 배포하면 목표 칸이 '불러오지 못했어요'가 된다 → SQL 먼저.
- 비트 금액 줄이 실제 DB에서 얼마나 걸리는지는 TASK-5에서 하루 범위로 재 본다(진료 시간엔 짧게).
