# 작업 분할: AI 리포트 탭 화면

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 값과 동작: requirements.md · design.md. 글자와 모양의 기준: `docs/mockups/ai-report/index.html`(글꼴을 품어 1.1MB이니 `<body>` 아래만 읽는다).
>
> **시작 조건**: 사용자의 명세 승인. 워크트리 `feat-ai-report-screen`(main `68de8aa` + 시안 커밋 `6835691`)에서 한다. 이 폴더에는 `node_modules`가 없으니 처음에 `npm ci`를 한다.
>
> **모든 TASK 공통**
> - 시험부터 쓰고 RED를 본다. 새 시험 이름에 AC ID(AC-701.1 등)를 넣는다.
> - 지어낸 숫자는 시험 파일 안에만 둔다. 앱 경로에는 없다.
> - 진짜 Claude를 부르지 않는다. 열쇠가 없어도 모든 시험이 돈다. `npm run ai:try`는 이 명세의 구현에 쓰지 않는다.
> - `lib/payload`·`lib/analytics`·`lib/parsers`(환자 자료 구역)를 고치지 않는다(읽어서 쓰기만). middleware·`lib/auth`도 고치지 않는다.
> - 줄바꿈: `src`는 LF다. `sed -i`로 고치지 않는다(시험 파일도 Edit로).
> - 끝 조건: `npm run lint`(경고 0)·`npx tsc --noEmit`·`npm run build` 통과. `npm test`는 기준선(환경 탓 38개 + aggregate 시간 시험 흔들림)보다 늘지 않아야 한다. 실패 수만 보지 말고 **실패한 시험 파일 목록을 기준선과 맞대어 본다**(b2b-merge 때 수만 보다가 놓침).
>
> **할 순서**: 단계 하나 끝나면 멈추고 사용자의 "N단계해"를 기다린다. step 하나 = TASK 하나, step은 보조 작업자가 하고 리뷰 PASS 뒤 메인이 커밋한다.
> 1. `ai-report-screen-1-parts`: TASK-1 먼저 → TASK-2 · TASK-3 · TASK-5 병렬(수정 파일이 겹치지 않고 모두 TASK-1의 타입만 쓴다).
> 2. `ai-report-screen-2-read`: TASK-4 → TASK-6(TASK-4가 TASK-2를, TASK-6이 TASK-4·TASK-5를 쓴다), TASK-7은 TASK-6과 병렬(공유 타입만 쓴다).
> 3. `ai-report-screen-3-screen`: TASK-8 → TASK-9.
> 4. `ai-report-screen-4-switch`: TASK-10. 탭을 켜는 일은 맨 끝이다. 그 전까지 사용자에게는 '준비 중'이 보인다.

## TASK-1: 읽기 오류 번호와 화면 타입
- REQ: REQ-701
- Files: src/lib/errors.ts, src/lib/errors.test.ts, src/types/errors.ts, src/types/aiReport.ts
- Tests: src/lib/errors.test.ts
- TDD: required
- 할 일: `E-AI-READ` 더하기. `AiUsageView`·`ShownReport`·`ReportView` 타입 더하기(design '타입'). `AiErrorCode`는 그대로 넷이다.

## TASK-2: 저장된 리포트 검사
- REQ: REQ-702
- Files: src/lib/ai/savedReport.ts, src/lib/ai/savedReport.test.ts
- Tests: src/lib/ai/savedReport.test.ts
- TDD: required

## TASK-3: 화면 글자를 만드는 순수 함수
- REQ: REQ-703
- Files: src/lib/ai/reportScreen.ts, src/lib/ai/reportScreen.test.ts
- Tests: src/lib/ai/reportScreen.test.ts
- TDD: required
- 할 일: 날짜 계산은 `lib/analytics/dates.ts`를 쓴다(새로 만들지 않는다). 시험은 `TZ`와 상관없이 같은 글이 나오는지도 본다(`timeZone: 'Asia/Seoul'`).

## TASK-4: 저장된 값 읽기
- REQ: REQ-704
- Files: src/app/api/ai/store.ts, src/app/api/ai/store.test.ts
- Tests: src/app/api/ai/store.test.ts
- TDD: required

## TASK-5: 숫자가 바뀌었는지 보기
- REQ: REQ-705
- Files: src/app/api/ai/generate.ts, src/app/api/ai/generate.test.ts
- Tests: src/app/api/ai/generate.test.ts
- TDD: required
- 할 일: `generateReport`의 "세 달 검사 → 입력 → 지문"을 내부 함수로 꺼내 `isReportStale`과 함께 쓴다. `generateReport`의 동작은 바뀌지 않는다(기존 시험이 그대로 통과).

## TASK-6: 서버 경로 GET
- REQ: REQ-706
- Files: src/app/api/ai/report/route.ts, src/app/api/ai/report/route.test.ts
- Tests: src/app/api/ai/report/route.test.ts
- TDD: required

## TASK-7: 브라우저 쪽 부르기
- REQ: REQ-707
- Files: src/components/ai-report/reportClient.ts, src/components/ai-report/reportClient.test.ts
- Tests: src/components/ai-report/reportClient.test.ts
- TDD: required

## TASK-8: 화면 부품 그리기
- REQ: REQ-709, REQ-712
- Files: src/components/ai-report/ReportBody.tsx, src/components/ai-report/ReportBody.test.tsx, src/components/ai-report/UsageAside.tsx, src/components/ai-report/UsageAside.test.tsx, src/components/ai-report/RedoDialog.tsx, src/components/ai-report/RedoDialog.test.tsx
- Tests: src/components/ai-report/ReportBody.test.tsx, src/components/ai-report/UsageAside.test.tsx, src/components/ai-report/RedoDialog.test.tsx
- TDD: required
- 할 일: props만 받아 그린다(부르기·타이머 없음). `ds`·토큰만 쓰고 새 색 값을 넣지 않는다. 움직임을 넣지 않는다. 이 TASK의 AC 가운데 복사 동작(AC-709.6)과 바뀜에 따른 머리 단추(AC-709.5의 단추 부분)는 TASK-9에서 시험한다.

## TASK-9: 화면 상태와 동작
- REQ: REQ-708, REQ-709, REQ-710, REQ-711, REQ-713, REQ-715
- Files: src/components/ai-report/AiReportScreen.tsx, src/components/ai-report/AiReportScreen.test.tsx, src/components/ai-report/boundary.test.ts
- Tests: src/components/ai-report/AiReportScreen.test.tsx, src/components/ai-report/boundary.test.ts
- TDD: required
- 할 일: design '화면 상태' 표대로 고른다. `fetch`만 가짜로 두고 시안 9상태와 추가 상태를 모두 그린다. 늦게 온 답 버리기·기다리는 중 다시 안 보내기·타이머 정리(화면을 떠날 때)를 시험한다.

## TASK-10: 탭 켜기
- REQ: REQ-714
- Files: src/app/(app)/ai-report/page.tsx, src/components/shell/menu.ts, src/components/common/notReadyFeatures.ts, src/components/dashboard/briefing/features.ts, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/titles.test.tsx, docs/UI_GUIDE.md, docs/ARCHITECTURE.md
- Tests: src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/components/dashboard/briefing/DashboardHome.test.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/(app)/dashboard/page.test.tsx, src/app/titles.test.tsx
- TDD: required
- 근거: 위 시험 8개 파일은 임시 복사본에서 메뉴·준비 중 목록·기능 목록·페이지를 실제로 바꿔 돌려 찾았다(2026-11-02, 새 실패 29건이 이 8개 파일에서만 나옴). `src/app/notFound.test.tsx`는 주소 파일이 있는지만 봐서 깨지지 않으므로 Files에 넣지 않는다. 돌린 범위는 `src/app`과 메뉴·공통·대시보드·설정·랜딩·미리보기·인증 부품, 오류 문구 시험이다. 그 밖의 시험은 이 네 코드 파일을 쓰지 않는 것을 찾아서 확인했다.
- 할 일:
  - 시험을 먼저 새 값으로 고쳐 RED를 본다. 옛 AC ID는 시험 이름에 그대로 둔다. 준비 중·사용 가능 개수는 손으로 적지 않고 목록에서 센다(worklog AC-012.5).
  - `titles.test.tsx`는 `/ai-report`를 `notReadyFeature`를 쓰는 목록에서 빼고 이름 "AI 리포트"를 직접 적는다(안 빼면 파일 전체가 돌지 못한다).
  - `DashboardHome.test.tsx`·`page.test.tsx`의 기능 목차 옆 글도 목록에서 센 숫자로 본다.
  - 옛 명세(`specs/ui-90`·`specs/tab-frame`)는 고치지 않는다.
- 기록: main을 합쳐 업무일지 탭도 켜졌다(2026-11-02, 424c7bd). 그래서 처음 승인한 "준비 중 9개"를 목록에서 세는 것으로 바꿨다. `tabFrame.test.tsx`의 AC-301.3·AC-404.2는 윈도우 경로 구분자 탓으로 시작 전부터 실패하므로, 이 PC의 TDD 기록은 RED로 남는다. 리눅스(VPS)에서 `tdd-run TASK-10 --expect green`으로 확인한다.

## 구현 뒤 사람이 할 일 (코드 밖, 이 순서로)
1. 전체 점검 뒤 GitHub에 올리고, VPS에서 CodeRabbit 검사를 받아 초안 PR을 만든다(이 PC에는 CodeRabbit이 없다). 합치기는 사용자가 번호로 지시할 때만 한다.
2. **합치기 전에** 운영 Supabase의 SQL Editor에 `supabase/migrations/20261101000000_ai_report.sql`을 붙여 한 번 실행한다. 빠지면 탭이 `E-AI-READ`만 보인다. 표가 생긴 뒤 합쳐도 지금 쓰는 다른 화면에는 영향이 없다.
3. 합치고 배포되면 운영에서 AI 리포트 탭을 연다. '아직 만들지 않았어요' → [AI 분석] → '이 달 통계가 아직 없어요' → [통계 탭으로]까지 눌러 본다.
4. **맨 마지막** (사용자, 2026-11-02): 열쇠를 받아 이 PC에서 `npm run ai:key` → `npm run ai:try`로 진짜 리포트 글을 읽어 본다. Anthropic 콘솔에 월 한도를 걸고, Vercel 환경 변수에 `ANTHROPIC_API_KEY`를 넣는다. 통계 명세가 들어오기 전에는 운영 앱이 Claude를 부르지 않는다.
