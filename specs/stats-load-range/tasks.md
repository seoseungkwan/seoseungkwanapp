# 작업 분할: 통계 비트 불러올 기간 고르기 (최근 1년·2년·2020년부터 전부, 나눠 읽기)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1(TASK-1 ‖ TASK-3) → Phase 2(TASK-2 ‖ TASK-4) → Phase 3(TASK-5). 같은 Phase 안에서 파일이 겹치지 않는 것은 일꾼 둘까지 동시에(각자 worktree).
> 검토는 끝에 한 번(전체 시험·lint·build·1440px 화면 사진 포함). 도우미·확장·`commands.json`·DB·서버는 고치지 않는다.

## 먼저 할 일 (코드 작업 아님)
1. 승인된 클릭 목업을 `docs/mockups/stats-load-range/`에 두었다(`index.html`·`1-view.png`·`2-all.png`·`3-working.png`·`4-stopped.png`·`notes.md`). 이 명세 승인을 목업 승인으로도 본다
2. 사용자가 `/sdd approve stats-load-range`를 입력한다

## TASK-1: Worker — keep: false면 메모리를 바꾸지 않음
- REQ: REQ-3304
- AC: AC-3304.1
- Files: src/types/stats.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts
- Tests: src/workers/stats/jobs.test.ts
- TDD: required — `createStatsHost`로 A를 keep 없이 불러온 뒤 B를 `keep: false`로 불러오면 B의 'loaded' 답은 오고, split·sections는 A 안 기간에서 B 전과 같은 답·B에만 있는 기간은 'none', 그 뒤 C를 keep 없이 불러오면 C로 바뀜. `StatsLoadRequest`에 `keep?: boolean`만 더한다
- 차례: Phase 1

## TASK-2: 통로 입구 — requestLoad·useStatsWorker.load에 keep 잇기
- REQ: REQ-3304
- AC: AC-3304.2
- Files: src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts
- Tests: src/workers/statsClient.test.ts, src/components/stats/useStatsWorker.test.ts
- TDD: required — `keep: false`면 메시지에 `keep: false`, true·없음이면 keep 칸이 없음(지금 `toEqual` 시험 그대로 통과)
- 차례: Phase 2 (TASK-1 뒤. `StatsLoadRequest` 모양을 가져온다)

## TASK-3: 나눠 읽기 계획과 글 (순수 모듈)
- REQ: REQ-3301, REQ-3302, REQ-3303, REQ-3305
- AC: AC-3301.3, AC-3301.4, AC-3302.1, AC-3302.2, AC-3302.3, AC-3302.4, AC-3302.5, AC-3302.6, AC-3303.4, AC-3303.5, AC-3303.6, AC-3305.1
- Files: src/components/stats/loadPlan.ts, src/components/stats/loadPlan.test.ts, src/components/stats/periodPick.ts
- Tests: src/components/stats/loadPlan.test.ts
- TDD: required — `planLoad`(whole·조각 하나/여럿·save 경계·read 이웃 달·keepAt 예시 넷, 2026 ~ 2032년 모든 오늘 × 네 단추 × load 첫날 셋에서 read ≤ 800·save ≤ 731·save 이음), `partSave`(달·날·세 칸 거르기, covered 겹침·null, 조각 하나면 그대로, sections 열쇠 없음 그대로), `loadHint`(시안 네 글 그대로 + 고른 달·직접 날짜·최근 12개월 + 1년·2025년 + 지금 보는 기간), `monthsLabel`·`progressText`·`doneText`·`stoppedText`(시안 글), `MAX_READ_DAYS`가 `commands.json` stats.rows `maxDays`와 같음. `periodPick.ts`는 `spanLabel`·`hasFinal`에 `export`만 붙인다(`periodPick.test.ts` 그대로 통과)
- 차례: Phase 1

## TASK-4: 비트 칸 — 불러올 기간 단추·안내 줄·읽는 중 줄
- REQ: REQ-3301, REQ-3303, REQ-3305
- AC: AC-3301.1, AC-3301.2, AC-3301.3, AC-3303.4, AC-3305.2
- Files: src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx
- Tests: src/components/stats/SourcePicker.test.tsx
- TDD: required — 묶음 이름·단추 차례·처음 [지금 보는 기간]만 눌림·누르면 그것만 눌림·`ds.segment` 모양과 `max-md:grid-cols-2`, 일이 있으면 `disabled`, `onLoad(false, 'view')`·`onLoad(true, 'all')`, 안내 줄이 고른 것마다 바뀌고 '오늘 진료 끝' 안내 위에 있음, `progress`가 있으면 읽는 중 줄이 그 글·없으면 지금 글. 지금 시험은 `range`·`progress` 속성과 `onLoad` 둘째 인자만 맞춘다(기대 글은 그대로)
- 차례: Phase 2 (TASK-3 뒤, TASK-2와 동시)

## TASK-5: 통계 화면 — 차례대로 읽고 저장·멈춤·이어서
- REQ: REQ-3303, REQ-3305
- AC: AC-3303.1, AC-3303.2, AC-3303.3, AC-3303.4, AC-3303.5, AC-3303.6, AC-3303.7, AC-3303.8, AC-3303.9, AC-3305.2
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/StatsScreen.test.tsx
- TDD: required — 가짜 통로·가짜 Worker로: 지금 보는 기간은 요청 하나·keep 칸 없음·저장 값 그대로·상자 없음, 전부(4조각)는 저장이 끝난 뒤에야 다음 요청·read 차례·closeToday 첫 조각만·keep 규칙·조각마다 partSave 저장, 보고는 첫 조각·처방별 묻기는 keepAt 뒤 한 번(최근 30일 + 전부 뒤에도 최근 30일 숫자, 2024년 월별이면 둘째 조각 뒤 2024년), 읽는 중 줄 '(2/4 · …)', 끝난 상자 글, 셋째에서 통로 오류 → 멈춤 상자 글·오류 카드 없음·넷째 요청 없음, 둘째가 확인 필요 → 상자에 확인 글·확인 카드 없음, 둘째 저장 실패 → 멈춤 + [다시 저장] 카드, 첫 조각 실패·확인 필요·저장 실패는 지금 카드·상자 없음, [이어서 불러오기]는 남은 조각만·closeToday false·보고 그대로·일 동안 `aria-disabled`, 새 불러오기·파일 읽기에서 상자가 사라짐. 지금 시험(불러오기 범위 1703.6 등)은 기대값을 바꾸지 않는다
- 차례: Phase 3 (TASK-1 ~ TASK-4 뒤)
