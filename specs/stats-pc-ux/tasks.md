# 작업 분할: 통계 PC 화면 정리

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- AC:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`, `- 차례:`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 시험 이름에 이 명세 AC ID를 넣는다. 지금 시험의 기대값을 고칠 때는 이 명세가 바꾸는 글·구조만 고치고 그 시험 이름에 바꾼 AC ID를 더한다(AC-4006.1).

## 할 순서
- 먼저 할 일(코드 작업 아님): 사용자가 `/sdd approve stats-pc-ux`를 입력한다
- Phase 1 (병렬 2): TASK-1 칸 틀 부품 ‖ TASK-2 목차 띠 부품 — 새 파일 위주, 파일이 겹치지 않는다
- Phase 2 (병렬 2, TASK-1 뒤): TASK-3 처방 탭 안 칸 ‖ TASK-4 불러오기 상자 접기
- Phase 3 (병렬 2, Phase 1·2 뒤): TASK-5 나머지 칸 설명 접기·환자 구성 두 열 ‖ TASK-6 화면 잇기(목차 띠·처방 탭)
- Phase 4 (코드 작업 아님): 전체 검사·검토·화면 확인 — 아래 맨 끝

## TASK-1: 칸 틀 부품 — Section 두 모드 · 접는 단추 · 어떻게 세나요 · 처방 탭 칸
- REQ: REQ-4002, REQ-4003, REQ-4004, REQ-4005, REQ-4006
- AC: AC-4002.6(목차 자리 id·scroll-margin·안쪽에 넘기지 않음), AC-4003.2, AC-4003.3, AC-4003.4(고른 탭의 설명·단추만 머리 줄에), AC-4003.5(패널을 내려놓지 않음), AC-4003.6(패널 안 h3·초점 ref), AC-4004.1, AC-4005.1(side 한 줄 모양·휴대폰 차례), AC-4006.2
- Files: src/components/stats/sections/parts.tsx, src/components/stats/sections/parts.test.tsx, src/components/stats/sections/HowCounted.tsx, src/components/stats/sections/HowCounted.test.tsx, src/components/stats/sections/RxSection.tsx, src/components/stats/sections/RxSection.test.tsx
- Tests: src/components/stats/sections/parts.test.tsx, src/components/stats/sections/HowCounted.test.tsx, src/components/stats/sections/RxSection.test.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx, src/components/ui/classes.test.ts
- 돌리기만 하는 시험(고치지 않음): TreatmentTrendSection 'Section headingRef' · PeriodSummary '섹션 소스 규칙' · classes 클래스 규칙 — 새 파일이 지금 규칙을 지키는지 본다
- TDD: required — 가짜 칸(시험 안 작은 부품)으로: 보통 Section 마크업이 지금 그대로(기존 'Section headingRef' 시험도 그대로 통과) · `SectionAnchor` id·scroll-margin, 안쪽 Section에는 id 없음 · 탭 패널 모드에서 h2·section 없음, 고른 탭만 설명·단추가 머리 줄 자리에 한 번, 탭을 바꾸면 옮겨 감 · headingRef면 h3 + ref 초점 · tablist/tab/tabpanel 속성, 클릭·→←(돌기)·Home·End와 초점 · 고르지 않은 패널 `hidden`이고 그 안 상태(가짜 칸의 카운터)가 탭을 옮겼다 와도 남음 · FoldButton·HowCounted aria-expanded/aria-controls/hidden/꺾쇠, side 줄 `justify-between`·휴대폰 순서·전체 폭 · 클래스 규칙(새 파일이 `ui/classes.test.ts` 검사 대상)
- 차례: Phase 1

## TASK-2: 목차 띠 부품 StatsToc
- REQ: REQ-4002
- AC: AC-4002.2, AC-4002.3, AC-4002.4, AC-4002.5
- Files: src/components/stats/StatsToc.tsx, src/components/stats/StatsToc.test.tsx
- Tests: src/components/stats/StatsToc.test.tsx, src/components/ui/classes.test.ts
- TDD: required — `tocRangeText`(최근 30일 · 고른 달 · 최근 12개월 끝 자르기 · 해 넘김 · 오늘 진료 끝) · `activeTocIndex`(기준선 위 마지막 · 나란한 칸 2px 안이면 앞 칸 · 맨 아래면 마지막 · 없음 -1) · nav 이름·링크 아홉 차례·href · sticky·top 클래스·`overflow-x-auto`·휴대폰 44px · 누르면 `location.hash` 그대로, `scrollIntoView` 부름(모션 줄이기면 `behavior: 'auto'`), 누른 링크만 `aria-current="true"` · `scrollIntoView`·`matchMedia`가 없어도 던지지 않음 · 브라우저 저장소를 쓰지 않음
- 차례: Phase 1 (TASK-1과 병렬)

## TASK-3: 처방 탭 안 칸 — 묶음별 추세 · 처방 골라 보기 · 같은 처방 재방문
- REQ: REQ-4003, REQ-4004, REQ-4005
- AC: AC-4003.6(고치기 제목 글 `묶음별 추세 · 묶음 고치기`), AC-4004.2(①②③), AC-4004.3, AC-4004.4, AC-4005.1(처방 골라 보기)
- Files: src/components/stats/sections/TreatmentTrendSection.tsx, src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/RxPickTable.tsx, src/components/stats/sections/RxPickTable.test.tsx, src/components/stats/sections/RxPickAgain.tsx, src/components/stats/sections/RxPickAgain.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx
- Tests: src/components/stats/sections/TreatmentTrendSection.test.tsx, src/components/stats/sections/RxPickTable.test.tsx, src/components/stats/sections/RxPickAgain.test.tsx, src/components/stats/sections/RxPickerSection.test.tsx
- TDD: required — 네 글·네 글·재방문 설명이 "어떻게 세나요?" 칸 안(처음 hidden)에 차례대로 있고 그 자리에 보이지 않음 · 상황 안내(비교·비교하지 않는 묶음·구분 없음)는 접는 칸 밖에 보임 · 처방 골라 보기 표 바로 다음 줄 [어떻게 세나요?]·[표 복사](`justify-between`), 복사 실패 직접 복사 칸은 그 줄 아래 · 같은 처방 재방문 굵은 `어떻게 세나요` 없음, 날 수 단추 다음이 기간 막대, 접는 칸은 칸 맨 아래이고 표 없는 상태엔 설명·예시만, 예시 처음 열림 · 고치기 제목 상수 `EDIT_TITLE` = `묶음별 추세 · 묶음 고치기`(따로 그릴 때의 h2 `TITLE`은 그대로, design.md 표). 지금 시험 가운데 바꾸는 것: TreatmentTrendSection `EDIT_TITLE` 상수, RxPickTable `notesOf`·[표 복사] 자리(`justify-end` → 새 줄), RxPickAgain 'AC-1307.4'(굵은 머리)·`notesOf` 자리, RxPickerSection 같은 처방 재방문 앞 형제(790~805줄 근처)
- 차례: Phase 2 (TASK-1 뒤, TASK-4와 병렬)

## TASK-4: 불러오기 상자를 한 줄 띠로 접기
- REQ: REQ-4001, REQ-4006
- AC: AC-4001.1, AC-4001.2, AC-4001.3, AC-4001.4, AC-4001.5, AC-4001.6, AC-4001.7, AC-4001.8, AC-4006.1
- Files: src/components/stats/SourcePicker.tsx, src/components/stats/SourcePicker.test.tsx, src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx
- Tests: src/components/stats/SourcePicker.test.tsx, src/components/stats/StatsScreen.test.tsx
- TDD: required — SourcePicker: `canFold`면 띠만 보이고 펼칠 칸 hidden, 주지 않으면 펼침 · [불러오기 설정] 토글 · 접힌 채 띠 단추가 고른 기간·오늘 진료 끝으로 `onLoad` · 'ready'만 띠 단추 · 주의 상태 여섯(끊김·바쁨·연결 확인 오류·도우미 없음·도우미 업데이트·확장 업데이트)은 펼침, 접은 뒤 주의 상태로 바뀌면 펼침 · 확장 없음은 설정 단추만 · 펼친 칸 `lg:`두 칸/`max-lg:border-t` · 상자 안 상자 없음 · 띠에 끌어다 놓아도 받음 · 개인정보 줄이 펼칠 칸 안 · 저장소에 쓰지 않음. StatsScreen: 띠 왼쪽 자료 글(짧은 끝 글 세 가지, ` · 방금`, 파일 안내 아래 줄), 기간 글 아래 자료 줄 없음, 저장된 숫자 없음이면 펼친 채·있으면/읽는 중/읽기 실패면 접힌 채, 저장 뒤 저절로 접힘(기본값 2). 지금 StatsScreen 시험 가운데 바꾸는 것: 자료 줄 끝 글(`끝난 날로 저장했어요` 들어간 곳), 저장된 숫자가 있는 화면에서 [파일 고르기]·'오늘 진료 끝'·'불러올 기간'을 role로 찾는 곳([불러오기 설정]을 먼저 누름), 나눠 읽기 상자와 개인정보 줄 자리(2560~2590줄 근처)
- 차례: Phase 2 (TASK-1 뒤 — `FoldButton`, TASK-3과 병렬)

## TASK-5: 나머지 칸 — 설명 접기 · [표 복사] 줄 · 환자 구성 두 열
- REQ: REQ-4004, REQ-4005, REQ-4006
- AC: AC-4004.2(④⑤⑥⑦⑧), AC-4004.3, AC-4005.1(환자 구성·원장님별), AC-4005.2, AC-4006.2
- Files: src/components/stats/sections/RevisitSection.tsx, src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/ReportSection.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/sections/PatientMixSection.tsx, src/components/stats/sections/PatientMixSection.test.tsx, src/components/stats/sections/VisitHoursSection.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/ui/classes.test.ts, docs/UI_GUIDE.md
- Tests: src/components/stats/sections/RevisitSection.test.tsx, src/components/stats/sections/ReportSection.test.tsx, src/components/stats/sections/PatientMixSection.test.tsx, src/components/stats/sections/VisitHoursSection.test.tsx, src/components/stats/sections/DoctorsSection.test.tsx, src/components/ui/classes.test.ts
- TDD: required — 다섯 칸의 글이 접는 칸 안(처음 hidden)에 있고 그 자리에 보이지 않음 · 재방문율·보고는 글이 없으면 접는 칸도 없음 · 그대로 보이는 글(개인정보 줄·범례·접수 시각 모름·견줘요 줄) · 환자 구성·원장님별 표 바로 다음 줄 [어떻게 세나요?]·[표 복사] · 원장님이 한 분이면 접는 칸·[표 복사] 없음(지금처럼) · 환자 구성 감싸개 `lg:grid-cols-2`·연령대 두 줄·동네 둘째 열 둘째 줄·`min-[80rem]:` 세 열 · 클래스 규칙 시험: 예외가 이 파일의 `min-[80rem]:` 클래스뿐이고 실제로 씀(다른 파일은 그대로 잡음). UI_GUIDE '화면 폭'에 예외 한 줄. 지금 시험 가운데 바꾸는 것: RevisitSection [자세히] 칸 앞 형제(242줄 근처), PatientMix 열 감싸개 클래스(160줄 근처)
- 차례: Phase 3 (TASK-1 뒤, TASK-6과 병렬)

## TASK-6: 화면 잇기 — 목차 띠 · 처방 탭 · 칸 차례
- REQ: REQ-4002, REQ-4003, REQ-4006
- AC: AC-4002.1, AC-4002.6, AC-4003.1, AC-4003.4, AC-4003.5, AC-4003.6, AC-4003.7, AC-4006.1
- Files: src/components/stats/StatsScreen.tsx, src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/StatsSections.tsx, src/components/stats/sections/PeriodSummary.test.tsx, e2e/rx-picker-privacy.spec.ts, e2e/fu-rate-privacy.spec.ts, e2e/treatment-trend-privacy.spec.ts
- Tests: src/components/stats/StatsScreen.test.tsx, src/components/stats/sections/PeriodSummary.test.tsx
- TDD: required — h2 아홉 차례·`처방` 12칸 · 불러오는 중 칸 아홉 · 목차 띠는 칸을 그릴 때만, 기간 줄 다음·화면 바깥 div의 바로 아래 자식, 링크 href = 아홉 칸 id, 불러오는 중 칸에는 id 없음 · 탭 셋에 세 칸, 머리 줄 설명이 탭 따라 바뀜(고른 기간 이름 붙음·빈 상태 없음), [묶음 고치기]는 첫 탭만 · 묶음별 추세 줄을 연 채 둘째 탭 갔다 오면 열린 채, 처방 골라 보기 고른 날 수 그대로 · [묶음 고치기] → h3 초점 → [그만두기] → 단추 초점 · 다시 그리면 첫 탭 · 저장 줄·Worker 요청 모양 시험 그대로. 지금 시험 가운데 바꾸는 것: StatsScreen `SECTIONS`·기다리는 칸 배치·처방 칸을 h2로 찾던 곳(처방 골라 보기·처방별 추세 묶음·처방별 신환·재진 describe)은 탭을 고르고 `tabpanel` 안에서 찾음, PeriodSummary `TITLES`·'처방별 추세 칸 h2 옆 설명'·처방별 신환·재진 표 찾기. E2E 셋: 자료 글 기다림(`/저장했어요/` → 새 띠 글), 처방 골라 보기 탭 고르기, 고치기 제목 새 글(이 PC에 `.env.local`이 있을 때 `npm run e2e`로 돌린다)
- 차례: Phase 3 (TASK-1·TASK-2·TASK-3·TASK-4 뒤, TASK-5와 병렬)

## Phase 4: 전체 검사 · 검토 · 화면 확인 (코드 작업 아님)
- `npx tsc --noEmit` · `npm run lint` · `npm test`(이 PC에서 원래 나는 실패는 ssk-finish-check로 가름)
- 검토 한 번(마지막)
- requirements.md '화면 확인': 하네스 `~/.claude/state/handoff/stats-harness/`로 1440 · 1280 · 1024 · 768 · 390px 가로 넘침 0, 목차 띠 붙음·이동·강조, 시안 사진과 견주어 사용자에게 보인다
