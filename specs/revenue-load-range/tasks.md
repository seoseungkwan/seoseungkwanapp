# 작업 분할: 매출 가져올 기간

> 형식: `## TASK-n: 제목` 아래 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD:`, `- 차례:`. 승인되면 Files/Tests 경로만 고칠 수 있다.
> **할 순서**: Phase 1(TASK-1 ‖ TASK-2 ‖ TASK-3, 파일이 겹치지 않아 일꾼 셋이 각자 worktree에서 동시에) → Phase 2(TASK-4). 각 TASK는 시험을 먼저 써서 RED를 본다.
> 검토는 끝에 한 번(전체 시험·lint·build·1440px 화면 사진). 도우미·확장·`commands.json`·DB·서버는 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 승인된 클릭 목업은 `docs/mockups/revenue-load-range/`에 있다
2. 사용자가 `/sdd approve revenue-load-range`를 입력한다

## TASK-1: 가져오기 계획 — 달 수 인자와 기간 달 수
- REQ: REQ-3501, REQ-3502
- AC: AC-3501.2, AC-3501.3, AC-3502.1, AC-3502.5
- Files: src/lib/revenue/sync.ts, src/lib/revenue/sync.test.ts
- Tests: src/lib/revenue/sync.test.ts
- TDD: required — `planFetch(today, saved, 25)`는 2024-11 ~ 2026-11 가운데 빠진 달만 새 달부터, 셋째 인자 없으면 지금처럼 13달, `spanMonths`('1y' 13 · '2y' 25 · 'all' 83, 오늘이 1일이면 지난달까지), 날 줄이 다 있는 달은 빠짐, 앞 12달을 저장한 뒤 다시 계획하면 남은 달만(AC-3502.5). `syncRevenue`에 그 목록을 `months`로 주면 차례대로 한 번씩(AC-3502.1). 지금 시험은 기대값을 바꾸지 않는다
- 차례: Phase 1

## TASK-2: 보기 글 — 안내·알림·막대 끝 달·못 가져온 달
- REQ: REQ-3501, REQ-3502, REQ-3503, REQ-3504
- AC: AC-3501.2, AC-3501.3, AC-3501.4, AC-3502.2, AC-3502.3, AC-3502.4, AC-3503.1, AC-3503.2, AC-3503.3, AC-3503.4, AC-3504.2
- Files: src/components/revenue/range.ts, src/components/revenue/range.test.ts, src/components/revenue/view.ts, src/components/revenue/view.test.ts
- Tests: src/components/revenue/range.test.ts, src/components/revenue/view.test.ts
- TDD: required — `range.ts`: 기간 이름 셋, 안내 글(N = 12·70·6·0, 최근 1년 0, 전체 기간 끝 문장), `disabled`, 가져오는 중 본문, 알림(여러 달·한 달·빈 목록 null), 멈춤 줄(여러 달·한 달·빈 목록 null, M), 끝 달 글. 글은 requirements.md와 목업 그대로. `view.ts`: 고른 달 2021-03이면 막대·표 2020-03 ~ 2021-03과 두 제목, 2025-11이면 최근 13달 그대로, 옛 달 비교·치료별 매출이 그 달 자료, 연결된 PC 옛 달 날 줄 없음 → 새 글(실패 목록에 있으면 지금 글, 최근 달·연결 안 됨은 지금 글), `sync.body`가 있으면 가져오는 중 본문, 제안 묶음은 최근 13달 코드만. 지금 시험은 기대값을 바꾸지 않는다
- 차례: Phase 1

## TASK-3: 부품 — 가져올 기간 칸·알림·멈춤 줄·기간 줄 끝 달
- REQ: REQ-3501, REQ-3502, REQ-3503
- AC: AC-3501.1, AC-3501.4, AC-3502.3, AC-3502.4, AC-3503.1
- Files: src/components/revenue/RevenueRange.tsx, src/components/revenue/RevenueRange.test.tsx, src/components/revenue/RevenueStates.tsx, src/components/revenue/parts.test.tsx
- Tests: src/components/revenue/RevenueRange.test.tsx, src/components/revenue/parts.test.tsx
- TDD: required — `LoadRangePanel`: '가져올 기간' 묶음과 단추 셋 차례·`aria-pressed`·누르면 `onSelect(key)`·안내 줄 글·`disabled`면 [비트에서 가져오기] 막힘, 누르면 `onLoad()`. `RangeDoneNotice` `role="status"` 굵은 줄과 둘째 줄, `RangeStoppedLine` 글. `PeriodRow`에 `bound`가 있으면 그 글, 없으면 지금 그대로(지금 시험 그대로)
- 차례: Phase 1

## TASK-4: 매출 화면 잇기 — 옛 달 읽기·칸·가져오기·알림·넘기기 끝
- REQ: REQ-3501, REQ-3502, REQ-3503, REQ-3504
- AC: AC-3501.1, AC-3502.1, AC-3502.2, AC-3502.3, AC-3502.4, AC-3502.5, AC-3503.1, AC-3503.3, AC-3504.1, AC-3504.2
- Files: src/components/revenue/RevenueScreen.tsx, src/components/revenue/RevenueScreen.test.tsx
- Tests: src/components/revenue/RevenueScreen.test.tsx
- TDD: required — 가짜 통로·저장소로: 최근 13달 읽기가 먼저이고 그 뒤 옛 달 읽기(`'2020-01', '2025-10'`), 옛 달 읽기 전·실패면 칸 없음·[지난달]은 2025-11에서 막힘, 옛 달이 있으면 그 달까지 넘김과 끝 달 글, 연결 안 된 PC는 칸 없음, [전체 기간] → 안내 줄 남은 달 → 누르면 그 달들만 차례로 부름·가져오는 중 본문, 끝나면 두 읽기를 다시 하고 알림, 셋째 달에서 끊김 → 오류 카드 + 멈춤 줄, 다시 연결 뒤 같은 기간 → 남은 달만, [묶음 고치기] 목록이 최근 13달 코드만, 옛 달 날 줄 없음 → 새 글. 지금 시험은 `loadRevenue` 부른 횟수처럼 옛 달 읽기로 바뀌는 수만 고치고 다른 기대값은 그대로
- 차례: Phase 2 (TASK-1 ~ 3 뒤)
