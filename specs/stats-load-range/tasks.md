# 작업 분할: 통계 비트 불러올 기간 고르기 (최근 1년·2년·전체 기간, 나눠 읽기)

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
>
> **할 순서**: Phase 1(TASK-1 ‖ TASK-3) → Phase 2(TASK-2 ‖ TASK-4) → Phase 3(TASK-5) — 여기까지 끝남(브랜치 `feat-stats-load-range` HEAD 823ffd6) → **2026-11-09 고침** Phase 4(TASK-6 ‖ TASK-7) → Phase 5(TASK-8 ‖ TASK-9). 같은 Phase 안에서 파일이 겹치지 않는 것은 일꾼 둘까지 동시에(각자 worktree).
> 검토는 끝에 한 번(전체 시험·lint·build·1440px 화면 사진 포함, 고침 뒤에는 신환 재방문율의 합친 줄을 1440·390px로도 본다). 도우미·확장·`commands.json`·DB·서버는 고치지 않는다.
> **2026-11-09 고침(최종 검토 FIX 뒤 사용자 결정, requirements.md '이미 정한 것' 7 ~ 9)**: 끝난 TASK-1 ~ 5는 다시 열지 않고 그대로 둔다(그 안의 옛 글 '2020년부터 전부'·'한 달씩'은 고치기 전 판의 기록이다). 고침은 새 TASK-6 ~ 9가 한다. TASK-6·TASK-8은 `StatsScreen.test.tsx`를 같이 고치므로 TASK-8은 TASK-6 뒤다. 각 TASK는 시험을 먼저 고쳐 RED를 본다(TASK-9는 시험만이라 예외)

## 먼저 할 일 (코드 작업 아님)
1. 승인된 클릭 목업을 `docs/mockups/stats-load-range/`에 두었다(`index.html`·`1-view.png`·`2-all.png`·`3-working.png`·`4-stopped.png`·`notes.md`). 이 명세 승인을 목업 승인으로도 본다
2. 사용자가 `/sdd approve stats-load-range`를 입력한다
3. (2026-11-09) 명세를 고쳐 앞 승인이 풀렸다. 사용자가 고친 명세와 시안(`index.html` 단추 이름 '전체 기간', `notes.md`)을 보고 `/sdd approve stats-load-range`를 다시 입력한다

## TASK-1: Worker — keep: false면 메모리를 바꾸지 않음 (끝남 · 커밋 08d5587)
- REQ: REQ-3304
- AC: AC-3304.1
- Files: src/types/stats.ts, src/workers/stats/jobs.ts, src/workers/stats/jobs.test.ts
- Tests: src/workers/stats/jobs.test.ts
- TDD: required — `createStatsHost`로 A를 keep 없이 불러온 뒤 B를 `keep: false`로 불러오면 B의 'loaded' 답은 오고, split·sections는 A 안 기간에서 B 전과 같은 답·B에만 있는 기간은 'none', 그 뒤 C를 keep 없이 불러오면 C로 바뀜. `StatsLoadRequest`에 `keep?: boolean`만 더한다
- 차례: Phase 1

## TASK-2: 통로 입구 — requestLoad·useStatsWorker.load에 keep 잇기 (끝남 · 커밋 43b2c15)
- REQ: REQ-3304
- AC: AC-3304.2
- Files: src/workers/statsClient.ts, src/workers/statsClient.test.ts, src/components/stats/useStatsWorker.ts, src/components/stats/useStatsWorker.test.ts
- Tests: src/workers/statsClient.test.ts, src/components/stats/useStatsWorker.test.ts
- TDD: required — `keep: false`면 메시지에 `keep: false`, true·없음이면 keep 칸이 없음(지금 `toEqual` 시험 그대로 통과)
- 차례: Phase 2 (TASK-1 뒤. `StatsLoadRequest` 모양을 가져온다)

## TASK-3: 나눠 읽기 계획과 글 (순수 모듈) (끝남 · 커밋 23397fa)
- REQ: REQ-3301, REQ-3302, REQ-3303, REQ-3305
- AC: AC-3301.3, AC-3301.4, AC-3302.1, AC-3302.2, AC-3302.3, AC-3302.4, AC-3302.5, AC-3302.6, AC-3303.4, AC-3303.5, AC-3303.6, AC-3305.1
- Files: src/components/stats/loadPlan.ts, src/components/stats/loadPlan.test.ts, src/components/stats/periodPick.ts
- Tests: src/components/stats/loadPlan.test.ts
- TDD: required — `planLoad`(whole·조각 하나/여럿·save 경계·read 이웃 달·keepAt 예시 넷, 2026 ~ 2032년 모든 오늘 × 네 단추 × load 첫날 셋에서 read ≤ 800·save ≤ 731·save 이음), `partSave`(달·날·세 칸 거르기, covered 겹침·null, 조각 하나면 그대로, sections 열쇠 없음 그대로), `loadHint`(시안 네 글 그대로 + 고른 달·직접 날짜·최근 12개월 + 1년·2025년 + 지금 보는 기간), `monthsLabel`·`progressText`·`doneText`·`stoppedText`(시안 글), `MAX_READ_DAYS`가 `commands.json` stats.rows `maxDays`와 같음. `periodPick.ts`는 `spanLabel`·`hasFinal`에 `export`만 붙인다(`periodPick.test.ts` 그대로 통과)
- 차례: Phase 1

## TASK-4: 비트 칸 — 불러올 기간 단추·안내 줄·읽는 중 줄 (끝남 · 커밋 99316a4)
- REQ: REQ-3301, REQ-3303, REQ-3305
- AC: AC-3301.1, AC-3301.2, AC-3301.3, AC-3303.4, AC-3305.2
- Files: src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx
- Tests: src/components/stats/SourcePicker.test.tsx
- TDD: required — 묶음 이름·단추 차례·처음 [지금 보는 기간]만 눌림·누르면 그것만 눌림·`ds.segment` 모양과 `max-md:grid-cols-2`, 일이 있으면 `disabled`, `onLoad(false, 'view')`·`onLoad(true, 'all')`, 안내 줄이 고른 것마다 바뀌고 '오늘 진료 끝' 안내 위에 있음, `progress`가 있으면 읽는 중 줄이 그 글·없으면 지금 글. 지금 시험은 `range`·`progress` 속성과 `onLoad` 둘째 인자만 맞춘다(기대 글은 그대로)
- 차례: Phase 2 (TASK-3 뒤, TASK-2와 동시)

## TASK-5: 통계 화면 — 차례대로 읽고 저장·멈춤·이어서 (끝남 · 커밋 823ffd6)
- REQ: REQ-3303, REQ-3305
- AC: AC-3303.1, AC-3303.2, AC-3303.3, AC-3303.4, AC-3303.5, AC-3303.6, AC-3303.7, AC-3303.8, AC-3303.9, AC-3305.2
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/StatsScreen.test.tsx
- TDD: required — 가짜 통로·가짜 Worker로: 지금 보는 기간은 요청 하나·keep 칸 없음·저장 값 그대로·상자 없음, 전부(4조각)는 저장이 끝난 뒤에야 다음 요청·read 차례·closeToday 첫 조각만·keep 규칙·조각마다 partSave 저장, 보고는 첫 조각·처방별 묻기는 keepAt 뒤 한 번(최근 30일 + 전부 뒤에도 최근 30일 숫자, 2024년 월별이면 둘째 조각 뒤 2024년), 읽는 중 줄 '(2/4 · …)', 끝난 상자 글, 셋째에서 통로 오류 → 멈춤 상자 글·오류 카드 없음·넷째 요청 없음, 둘째가 확인 필요 → 상자에 확인 글·확인 카드 없음, 둘째 저장 실패 → 멈춤 + [다시 저장] 카드, 첫 조각 실패·확인 필요·저장 실패는 지금 카드·상자 없음, [이어서 불러오기]는 남은 조각만·closeToday false·보고 그대로·일 동안 `aria-disabled`, 새 불러오기·파일 읽기에서 상자가 사라짐. 지금 시험(불러오기 범위 1703.6 등)은 기대값을 바꾸지 않는다
- 차례: Phase 3 (TASK-1 ~ TASK-4 뒤)

## TASK-6: 나눠 읽기 계획 고침 — '전체 기간' 이름·이웃 31일·keepAt 비교 범위·옛 조각 after30
- REQ: REQ-3301, REQ-3302
- AC: AC-3301.1, AC-3301.3, AC-3301.4, AC-3302.1, AC-3302.4, AC-3302.5, AC-3302.6, AC-3302.7
- Files: src/components/stats/loadPlan.ts, src/components/stats/loadPlan.test.ts, src/components/stats/SourcePicker.test.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/loadPlan.test.ts, src/components/stats/SourcePicker.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — 먼저 시험을 고쳐 RED를 본다(`tdd-run TASK-6 --expect red`, 고친 기대값이 지금 `loadPlan.ts`와 달라 실패하는지).
  - `loadPlan.test.ts`: `LOAD_SPANS` 이름 넷이 [지금 보는 기간, 최근 1년, 최근 2년, 전체 기간](AC-3301.1), '한 번 저장한 달은 남으니…'는 전체 기간일 때만(AC-3301.4 시험 이름), AC-3302.4 read 넷 [2024-10-31 ~ 2026-11-09] [2022-10-31 ~ 2024-12-31] [2020-10-31 ~ 2022-12-31] [2020-01-01 ~ 2020-12-31]과 2월 예 둘(오늘 2027-01-15 + 전체 기간의 둘째 read 2023-01-01 ~ 2025-03-03, 오늘 2027-02-10 + 전체 기간의 첫 read 2025-01-29 ~ 2027-02-10). 2026 ~ 2032년 모든 날 시험의 '이웃 쪽으로 한 달씩' 두 확인을 바꾼다: 가장 새 조각이 아니면 `read.to === addDays(save.to, 31)`이고 `diffDays(save.to, read.to) >= 30`이며 read.to ≥ save 끝 달의 다음 달 말일, 가장 옛 조각이 아니면 `read.from === addDays(save.from, -31)`이고 `diffDays(read.from, save.from) >= 30`이며 read.from ≤ save 첫 달의 앞 달 1일. read ≤ 800·save ≤ 731·save 이음·끝/첫날 확인은 그대로. AC-3302.5 keepAt 예 다섯(최근 30일 + 전체 기간 0 · 2024년 월별 1 · 2024년 11월 일별 + 지금 보는 기간 1(새) · 2025년 월별 0(첫 read 2024-10-31 ~로 고침) · 직접 날짜 2024-06-01 ~ 2025-03-31 0)과 지금 있는 '끝이 오늘보다 뒤면 오늘까지만' 시험. AC-3302.7 `partSave`: 둘째 ~ 넷째 조각의 months·days 줄은 `revisit.after30`이 null이고 cohort·within7·within14·within30·다른 칸은 그대로, 첫 조각과 조각 하나는 after30도 그대로. AC-3302.6의 지금 시험 가운데 둘째 조각(`parts[1]`)의 줄을 `toEqual`로 견주는 '달·날·세 칸은 save 안의 것만…' 시험은 가짜 줄에 revisit을 넣고 거른 months·days 줄의 after30이 null인 값을 기대하도록 고치고(주석의 read 날짜도 2022-10-31 ~ 2024-12-31로), covered·sections·조각 하나 시험은 그대로 둔다
  - `SourcePicker.test.tsx`: REQ-3301 묶음의 단추 이름을 '전체 기간'으로(`SPAN_NAMES`와 그 단추를 누르는 곳), 화면에 '2020년부터 전부' 글이 없음. 기대 안내 글은 그대로다(AC-3301.3)
  - `StatsScreen.test.tsx`: REQ-3303 묶음의 고정값만 고친다 — `ALL` = '전체 기간'(시험 이름의 옛 이름도), `ALL_READS` = 위 read 넷, `ALL_SAVES`의 날(read 첫날이 31일 앞이라 '첫날 + 40일' 날 줄이 하루씩 앞당겨진다: 2024-12-10 · 2022-12-10 · 2020-12-10, 넷째는 그대로), AC-3303.2의 저장 값에서 둘째 ~ 넷째 조각 날 줄은 `revisit`에 `after30: null`, AC-3303.3 '2024년(월별)' 시험의 첫 요청 `{ from: '2024-11-01', to: TODAY }` → `'2024-10-31'`(둘째 요청 2023-01-01 ~ 2024-12-31은 그대로). 기대 글·차례·횟수는 그대로다. 이 파일의 다른 묶음·[이어서 불러오기] 시험 고침은 TASK-8이 하고 `StatsScreen.tsx`는 고치지 않는다
  - 그 뒤 `loadPlan.ts`: `LOAD_SPANS` 'all' 이름 '전체 기간', `NEIGHBOR_DAYS = 31`로 read(`addDays`), `keepIndex`를 비교 범위(`readSpan`) → 지금 범위 → 0 차례로, `partSave`는 `compareYmd(read.to, save.to) > 0`이면 months·days 줄의 after30을 null로(design.md loadPlan.ts). `LoadPart`·`partSave` 모양은 그대로 → GREEN(`tdd-run TASK-6 --expect green`)
- 차례: Phase 4 (TASK-7과 동시, 파일이 겹치지 않는다)

## TASK-7: 첫 재방문까지 날수 — 옛 달은 '30일 넘어'와 '아직 안 옴'을 합쳐 보이기
- REQ: REQ-3306
- AC: AC-3306.1, AC-3306.2
- Files: src/components/stats/view.ts, src/components/stats/view.test.ts, src/components/stats/sections/RevisitSection.tsx, src/components/stats/sections/RevisitSection.test.tsx
- Tests: src/components/stats/view.test.ts, src/components/stats/sections/RevisitSection.test.tsx
- TDD: required — 먼저 시험을 더해 RED를 본다.
  - `view.test.ts`(AC-3306.1): 예(센 날 둘, 둘째 after30 null) → items 넷 [7일 안 13, 8~14일 9, 15~30일 4, 30일 넘어 다시 왔거나 아직 안 옴 24]이고 넷째 key가 `after30OrNever`, 합 = cohort 50, from·to·cohort는 다섯일 때와 같음 · 둘째 after30이 1이면 지금처럼 다섯 · after30 열쇠가 없는 줄(within30은 숫자)도 null로 쳐 넷 · 30일 값이 null인 날(센 단위 밖)의 after30 null로는 합치지 않음 · d7·d14·d30·d30Cohort는 after30과 상관없이 같음 · 12개월(달 단위)도 같은 규칙
  - `RevisitSection.test.tsx`(AC-3306.2): 넷이면 목록 네 줄의 글('30일 넘어 다시 왔거나 아직 안 옴{수}명{몫}%' 등)과 차례, 합친 줄만 막대 line-strong, 막대 폭은 넷 가운데 가장 큰 값 대비, 줄 모양 `grid-cols-[112px_minmax(0,1fr)_auto]`·`.truncate` 없음, "'30일 넘어 다시 옴'은 불러온 자료 끝날…" 안내 없음, [자세히] 표의 첫 재방문 줄 넷(마지막 '첫 재방문 30일 넘어 다시 왔거나 아직 안 옴')
  - 그 뒤 `view.ts` `FirstRevisitKey`·`firstRevisitOf`, `RevisitSection.tsx` `FirstRevisitList`(line-strong 조건)·`FirstRevisitBlock`(안내는 `after30` 줄이 있을 때만) → GREEN. 지금 시험은 기대값을 바꾸지 않는다(AC-3305.2: 지금 가짜 줄은 within30이 숫자면 after30도 숫자라 다섯 그대로다)
- 차례: Phase 4 (TASK-6과 동시, 파일이 겹치지 않는다)

## TASK-8: 통계 화면 — [이어서 불러오기]는 연결이 ready일 때만 · 시험 고침
- REQ: REQ-3303, REQ-3305
- AC: AC-3303.9, AC-3303.10, AC-3305.2
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/StatsScreen.test.tsx
- TDD: required — 먼저 시험을 고쳐 RED를 본다.
  - AC-3303.10(새 시험): 전체 기간을 누르고 셋째 조각에서 `port.fireDisconnect()`로 멈춘 뒤, 상자의 [이어서 불러오기]가 `aria-disabled="true"`이고 눌러도 stats.rows 요청 수가 그대로(3)이며 일이 시작되지 않음 → [다시 확인]과 hello로 연결이 'ready'가 되면 `aria-disabled`가 없음 → 누르면 넷째 요청이 셋째 read(`ALL_READS[2]`)
  - AC-3303.9 시험(지금 ~2691줄): `expect(screen.queryByRole('button', { name: RESUME })?.getAttribute('aria-disabled') ?? 'true').toBe('true')`를 `expect(screen.queryByRole('button', { name: RESUME })).toBeNull()`로 바꾼다(이어서 읽는 동안 상자와 단추가 없다. 일 중 `aria-disabled`는 지금 [다시 저장] 시험이 본다). 이 줄은 지금 코드로도 통과한다(헛돌던 확인을 실제 상태로 바꾸는 고침이고, RED는 AC-3303.10이 낸다)
  - AC-3305.2: 'AC-514.3 불러올 범위로 통로 → Worker → 저장 → 표에서 다시 읽기, 그동안 단추는 막힌다' 시험 이름을 'AC-514.3·AC-3305.2 …'로 바꾼다. 기대값·몸통은 그대로
  - 그 뒤 `StatsScreen.tsx`: `LoadRunBox`의 `busy`를 `job !== null || state !== 'ready'`로(design.md StatsScreen) → GREEN
- 차례: Phase 5 (TASK-6 뒤 — TASK-6이 같은 시험 파일의 REQ-3303 묶음 고정값을 고친다. TASK-9와 동시)

## TASK-9: AI 입력이 after30을 쓰지 않음을 묶는 시험
- REQ: REQ-3306
- AC: AC-3306.3
- Files: src/lib/ai/input.test.ts
- Tests: src/lib/ai/input.test.ts
- TDD: exempt — 시험만 더한다. 대상 코드(`lib/ai/input.ts` `buildReportInput`)는 after30을 읽지 않아(재방문 지표는 `revisit.within7`·`revisit.within14`뿐) 고칠 것이 없고 RED 단계가 없다. 시험 이름에 AC-3306.3: 세 달 줄의 revisit에 within30·after30을 숫자로 둔 입력과 after30만 null로 둔 입력의 `buildReportInput` 결과가 `toEqual`로 같고, 지표 ID에 'after30'이 든 것이 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음). `input.ts`·서버 경로는 고치지 않는다(AC-3305.1)
- 차례: Phase 5 (TASK-8과 동시, 파일이 겹치지 않는다. 앞 TASK에 기대지 않으니 더 먼저 해도 된다)
