# 작업 분할: 업무일지 현금 시재

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다. TASK마다 일꾼(subagent) 하나다.
>
> **시작 조건**: `feat-worklog-memo-font`의 TASK-8이 끝나 이 갈래에 합쳐진 뒤 Phase 1을 시작한다.
> **할 순서**: Phase 1 → 2 → 3 → 4. 같은 Phase의 TASK는 **병렬**이다(수정 파일이 겹치지 않고 앞 Phase의 결과만 쓴다).
>
> | Phase | TASK | 하는 일 | 병렬 |
> |---|---|---|---|
> | 1 밑바탕 | TASK-1 | 시재 타입·계산·추측 규칙 | 혼자 |
> | 2 조각 | TASK-2 | DB 칸·설정 표(새 migration)와 RLS 시험 | 병렬 |
> | | TASK-3 | 하루 읽기·저장에 시재 | 병렬 |
> | | TASK-4 | 시재 설정 읽기·저장 | 병렬 |
> | | TASK-5 | 자동 저장이 시재를 나름 | 병렬 |
> | | TASK-6 | 현금 시재 상자 | 병렬 |
> | 3 잇기 | TASK-7 | 설정 탭 시재 금액 칸 | 병렬 |
> | | TASK-8 | 업무일지 화면·날짜별 값·자동 저장 한 벌에 잇기 | 병렬 |
> | 4 확인 | TASK-9 | 화면 확인(1440·700·390·설정·인쇄)과 전체 검사 | 혼자 |
>
> - 파일이 겹치는 곳: 없다. `docs/ARCHITECTURE.md`는 TASK-2만 고친다. TASK-9는 화면 확인에서 고칠 것이 나올 때만 TASK-6·7·8의 화면 파일을 고친다
> - **Phase 끝(메인 세션)**: 그 Phase에서 고친 시험 파일과 design.md '기존 명세·시험과의 관계'의 "고치지 않은 채 통과" 파일을 `npx vitest run <파일들>`로 돌린다. 전체 검사는 TASK-9에서 한 번
> - **사용자 단계(사이트에 올리기 전)**: 0200·0300 SQL을 운영 Supabase에 붙여 넣기(사용자가 직접). Claude는 실제 Supabase에 붙지 않는다
> - 승인된 시험의 기대를 바꾸는 곳은 design.md '기존 명세·시험과의 관계'의 "바꾸는 기존 기대"뿐이다. 그 밖이 바뀌어야 하면 멈추고 보고한다

## Phase 1 — 밑바탕

## TASK-1: 시재 타입·계산·추측 규칙
- Phase: 1 · 혼자
- AC: AC-1601.1, AC-1601.2, AC-1601.3, AC-1601.4, AC-1601.5, AC-1601.6, AC-1601.7, AC-1601.8
- REQ: REQ-1601
- Files: src/types/worklog.ts, src/lib/worklog/cashFloat.ts, src/lib/worklog/cashFloat.test.ts
- Tests: src/lib/worklog/cashFloat.test.ts
- TDD: required — 순수 함수만(design.md '규칙'). `types/worklog.ts`에는 시재 상수·타입·`emptyWorklogCash`·`WORKLOG_CASH_COLUMNS`·`WorklogBlockedKey`를 더하고 `WorklogSavedDay`에 선택 칸 `cash?`만 더한다. 32칸·`WORKLOG_COLUMNS`·글씨 크기 상수는 그대로인지 시험이 본다. 시안의 예시 숫자(장수 [6,11,1,10,6,20,0,0] → 430,000, 있어야 할 돈 435,000, 비트 142,000)로 AC 예를 시험한다. AC-1601.8은 소스 글자에 React·supabase·`@/lib/storage`·`localStorage`·`console`·`fetch`가 없는지로 본다

## Phase 2 — 조각 (다섯 병렬, Phase 1 뒤)

## TASK-2: DB 칸·설정 표
- Phase: 2 · 병렬
- AC: AC-1602.1, AC-1602.2, AC-1602.3, AC-1602.4, AC-1602.5
- REQ: REQ-1602
- Files: supabase/migrations/20261105000300_worklog_cash_float.sql, supabase/worklog.rls.test.ts, docs/ARCHITECTURE.md
- Tests: supabase/worklog.rls.test.ts
- TDD: required — 새 migration 하나(design.md 'DB'). 먼저 `worklog.rls.test.ts` 끝에 새 `describe` 묶음(`SLOW`, 0200 묶음과 같은 방식)을 더해 파일이 없어 실패(RED)하는 것을 본다. 차례: 흉내 → auth → 0100 → 0110 → 0200 → 시험 줄 → 실행 전 모양 → 0300 → 실행 뒤 모양 → 한 번 더 실행. 칸 이름은 `@/types/worklog`의 `WORKLOG_CASH_COLUMNS`를 읽는다. 장수만 보낸 upsert가 `cash_float` null 줄에도 되는지(AC-1602.3)를 꼭 본다. `schemaSnapshot`은 거를 칸 목록을 받게만 넓히고 위 묶음 기대는 고치지 않는다. `docs/ARCHITECTURE.md`는 DB 표 목록의 `worklog_days` 줄 끝에 `· 현금 시재(장수 8칸·그날 시재·환불/미수입금 현금 표시·차이 이유, specs/worklog-cash-float)`, 그 아래 새 줄 `| \`worklog_settings\` | 병원 업무일지 설정 한 줄: 시재 금액 \`cash_float\`(기본 300,000원) (specs/worklog-cash-float) |`만 더한다(백슬래시는 넣지 않는다). **실제 Supabase에 붙여 넣지 않는다**

## TASK-3: 하루 읽기·저장에 시재
- Phase: 2 · 병렬
- AC: AC-1603.1, AC-1603.2
- REQ: REQ-1603
- Files: src/lib/storage/worklogDays.ts, src/lib/storage/worklogDays.test.ts
- Tests: src/lib/storage/worklogDays.test.ts
- TDD: required — 먼저 design.md '기존 명세·시험과의 관계'의 `worklogDays.test.ts` 기대(SELECT 상수·칸 차례·읽은 모양 아홉 곳)를 바꾸고 새 시험(읽은 시재 값·범위 밖 거르기·칸 없음 → 빈 시재, 여섯째 인자 → 받은 칸만 숫자·참거짓·다듬은 글, 비운 이유 → null, 범위 밖·개인정보 모양 → 보내지 않음·그것뿐이면 네트워크 없음, 셋~다섯째 `undefined` + 여섯째만 → `work_date`와 시재 칸만, 여섯째 없음 → 시재 칸 없음)을 더해 RED를 본다. 저장 쪽 지금 기대는 그대로 통과해야 한다

## TASK-4: 시재 설정 읽기·저장
- Phase: 2 · 병렬
- AC: AC-1603.3
- REQ: REQ-1603
- Files: src/lib/storage/worklogSettings.ts, src/lib/storage/worklogSettings.test.ts
- Tests: src/lib/storage/worklogSettings.test.ts
- TDD: required — `worklogDays.test.ts`의 가짜 클라이언트 방식. 표 이름·고르는 칸(`cash_float`만)·줄 없음 → 300000·범위 밖 → 300000·upsert 본문 `{ cash_float: n }`과 `onConflict: 'hospital_id'`·병원 id를 보내지 않음·끊김 → `offline`·오류·던짐 → `failed`(원래 글 없음)를 본다

## TASK-5: 자동 저장이 시재를 나름
- Phase: 2 · 병렬
- AC: AC-1604.1, AC-1604.2, AC-1604.3, AC-1604.4
- REQ: REQ-1604
- Files: src/lib/worklog/autosave.ts, src/lib/worklog/autosave.test.ts
- Tests: src/lib/worklog/autosave.test.ts
- TDD: required — 가짜 타이머·가짜 `save`(design.md '자동 저장'). 새 시험을 먼저 더해 RED: `changeCash` → 800ms 뒤 바뀐 칸만 다섯째 인자로 한 번, 연달아 바꾸면 마지막 값의 차이만, 되돌리면 안 보냄, 칸·목록·크기와 함께면 한 번에, 저장 중 또 바꾸면 끝난 뒤 남은 칸만, 실패·끊김·`retry`·`flush`·`hasUnsaved`, `serverDay` 여섯째(저장 안 된 칸·보내는 중 칸은 그대로, 나머지 반영, 없으면 그대로), `pendingDay`의 `cash`, 막힌 이유 → `blocked.fields`에 `'cashReason'`·보내지 않음·지우면 저장, `dispose` 뒤 시재 없음, `change`·`changeMemoFont`만 있은 저장은 인자 수 그대로. **지금 시험은 하나도 고치지 않은 채 통과해야 한다**

## TASK-6: 현금 시재 상자
- Phase: 2 · 병렬
- AC: AC-1605.1, AC-1605.2, AC-1605.3, AC-1605.4, AC-1605.5, AC-1605.6, AC-1605.7, AC-1606.1, AC-1606.2, AC-1606.3, AC-1607.1, AC-1607.2
- REQ: REQ-1605, REQ-1606, REQ-1607
- Files: src/components/worklog/CashFloatBox.tsx, src/components/worklog/CashFloatBox.test.tsx
- Tests: src/components/worklog/CashFloatBox.test.tsx
- TDD: required — 시안 승인됨(`docs/mockups/worklog/cash-float.html`). 받은 값을 그리기만 하는 부품(design.md '상자'). 먼저 시험을 더해 RED: 차례·글(글자 그대로)·쉼표 금액, 장수 치기 → 숫자만·`onCash` 한 번, 확인란 보임/숨김·켜면 계산, 결과 네 가지·색(토큰 클래스), 다름일 때만 추측·이유, 추측 세 가지 글·[비트 숫자로 고치기] → `onTakeBitCash`, 다른 PC 한 줄, 모드 `none`, 막힌 이유 빨강·`aria-invalid`, 설정 불러오는 중·실패 줄과 잠김·[시재 금액 다시 불러오기] → `onReloadFloat`, `locked`면 모두 잠김, `view`(센 날·안 센 날), 바깥 `print:hidden`, `role="status"`·`output`·`role="alert"` 없음·안 센 날 `li` 없음, 768px 미만 장수 칸 44px

## Phase 3 — 잇기 (두 병렬, Phase 2 뒤)

## TASK-7: 설정 탭 시재 금액 칸
- Phase: 3 · 병렬
- AC: AC-1608.1, AC-1608.2, AC-1608.3
- REQ: REQ-1608
- Files: src/components/settings/CashFloatSetting.tsx, src/components/settings/CashFloatSetting.test.tsx, src/components/settings/SettingsPage.tsx
- Tests: src/components/settings/CashFloatSetting.test.tsx
- TDD: required — `worklogSettings`·`supabase/browser`를 `vi.mock`. 먼저 시험: 읽은 값(줄 없음 300,000) 쉼표로 보임, 저장 → 숫자로 한 번·안내 글, 틀린 값 두 안내·저장 없음, 저장 중 단추 막힘, 읽기·저장 실패 카드·[다시 불러오기]·적은 값 유지. `SettingsPage.tsx`는 `DxLinks` 아래 한 줄만 더한다(`tabFrame.test.tsx` 그대로 통과)

## TASK-8: 업무일지 화면·날짜별 값·자동 저장 한 벌에 잇기
- Phase: 3 · 병렬
- AC: AC-1606.4, AC-1607.3, AC-1609.1, AC-1609.2, AC-1609.3, AC-1609.4, AC-1609.5, AC-1609.6, AC-1609.7
- REQ: REQ-1606, REQ-1607, REQ-1609
- Files: src/components/worklog/useWorklogDay.ts, src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/useCashFloatSetting.ts, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.cash.test.tsx, src/components/worklog/worklogSession.ts, src/components/worklog/worklogSession.test.ts, src/components/worklog/WorklogToolbar.tsx
- Tests: src/components/worklog/useWorklogDay.test.tsx, src/components/worklog/WorklogScreen.cash.test.tsx, src/components/worklog/worklogSession.test.ts
- TDD: required — design.md '화면 잇기'. 먼저 `useWorklogDay.test.tsx`의 `serverDay` 기대 여섯 곳에 여섯째 인자를 더하고 새 시험을 더해 RED: 날짜 칸이 시재를 들고 `setCell`·`setMemoFont`·`editBit` 뒤에도 남음, `setCash`는 ready만. 새 파일 `WorklogScreen.cash.test.tsx`(지금 화면 시험과 같은 가짜 + `@/lib/storage/worklogSettings` 가짜): 저장된 시재가 보임·줄 없는 날 빈 시재, 첫 장수 → `floatWon` 설정 금액과 함께 여섯 인자 저장, 이미 센 날은 설정이 달라도 그날 시재·`floatWon` 안 보냄, 설정 불러오는 중·실패면 안 센 날 장수 잠김·다시 불러오기, 날짜 옮김·앱 안 이동 뒤 저장 안 된 시재, 다시 읽기 반영·저장 안 부름, 비트 채우기·[비트 숫자로 바꾸기]·칸 고치기·글씨 크기 뒤 시재 그대로·여섯째 없음, 비트 PC 추측 모드 규칙(그날 읽기 끝난 뒤만, 확인 필요 날 비트 현금 없음, 연결 안 됨·준비 전 → 다른 PC 줄)·[비트 숫자로 고치기] → 현금수납이 비트 숫자·결과 다시 계산, 터치 기기는 보기만·설정 읽지 않음·저장 없음, 상자가 비트 설명 줄 뒤·인쇄 숨김, 막힌 이유 → `E-WORKLOG-NOTE-PRIVATE`·"빨간 칸 빼고 저장했어요", 로그아웃 뒤 시재 없음. `worklogSession`: 시재 있으면 여섯 인자·없으면 지금처럼. `WorklogToolbar.tsx`는 `statusText`에 `export`만 붙인다. **`WorklogScreen.test.tsx`·`WorklogToolbar.test.tsx`를 포함해 지금 시험은 위 여섯 줄 말고 고치지 않은 채 통과해야 한다**

## Phase 4 — 확인 (혼자, Phase 3 뒤)

## TASK-9: 화면 확인과 전체 검사
- Phase: 4 · 혼자
- AC: AC-1610.1, AC-1610.2
- REQ: REQ-1610
- Files: src/components/worklog/CashFloatBox.tsx, src/components/worklog/CashFloatBox.test.tsx, src/components/worklog/WorklogScreen.tsx, src/components/worklog/WorklogScreen.cash.test.tsx, src/components/settings/CashFloatSetting.tsx, src/components/settings/CashFloatSetting.test.tsx
- Tests: src/components/worklog/CashFloatBox.test.tsx, src/components/worklog/WorklogScreen.cash.test.tsx, src/components/settings/CashFloatSetting.test.tsx
- TDD: required — 찍는 법은 worklog-memo-font TASK-8과 같다: scratchpad의 Node 가짜 Supabase(가짜 사용자·승인 병원, 지어낸 `worklog_days` 줄: 모자람·맞음·많음·안 센 날, 환불·미수입금 있는 날, `worklog_settings` 한 줄. upsert는 받아서 줄을 바꿈), 명령 환경 변수로 그 서버를 보는 `npm run dev`, 세션은 찍기 스크립트가 쿠키로 넣는다(앱 코드에 우회 길 없음, 토큰 값을 남기지 않음). `dev-browser`로 1440×900·700×900 마우스·390×844 터치 흉내·설정 화면·인쇄(`page.pdf` A4, 쪽 수 1·상자 없음)를 찍고 `scrollWidth ≤ clientWidth`를 잰 뒤 시안과 나란히 본다. 다른 점을 고칠 때는 그 모양을 보는 시험을 먼저 고쳐 RED를 본다. 의도한 차이는 design.md '시안과 다른 곳'뿐이다. 고칠 것이 없으면 파일을 바꾸지 않는다. 끝에 `python3 ~/.claude/harness/bin/verify`(다른 일이 없을 때)를 돌리고 사진을 사용자에게 쉬운 말로 보인다. 사진·스크립트·가짜 서버는 저장소에 넣지 않는다. 끝나면 서버·브라우저를 멈춘다
