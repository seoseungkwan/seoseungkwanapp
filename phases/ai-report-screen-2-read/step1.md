# Step 1: report-get-route

> **TASK-6** 서버 경로 GET · **REQ-706** · AC-706.1 ~ AC-706.6
> Phase 2 `ai-report-screen-2-read` · Step 1. **병렬 step**: Step 2와 같은 폴더에서 동시에 돈다. 수정 파일은 겹치지 않는다. Step 0(TASK-4)이 끝난 뒤 시작한다.

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-706), `/specs/ai-report-screen/design.md`('흐름', '읽기는 브라우저 직접 읽기 대신', '저장 지문은 화면에 보내지 않는다', '서버', '뒷단에서 넘겨받은 것'), `/specs/ai-report-screen/tasks.md`(머리말, TASK-6)
- `/src/app/api/ai/report/route.ts`, `/src/app/api/ai/report/route.test.ts`, `/src/app/api/ai/store.ts`(`readSavedReport`·`readUsage`·`loadReportMonths`), `/src/app/api/ai/generate.ts`(`isReportStale`), `/src/types/aiReport.ts`(`ReportView`·`ShownReport`)

## 수정 범위
- `src/app/api/ai/report/route.ts`, `src/app/api/ai/report/route.test.ts`

## 작업
`export async function GET(request: Request): Promise<Response>`를 더한다. 순서:
1. **승인 확인**: `readMe`. `NotSignedInError` → 401 몸통 없음. 병원 없음·승인 안 됨 → 403 몸통 없음. 그 밖의 오류 → 502 `{ code: 'E-AI-READ' }`. 이 단계를 넘기 전에는 `supabaseServer`를 부르지 않는다.
2. **달 검사**: `new URL(request.url).searchParams.get('month')`. 값이 없거나 `isMonth`가 아니거나 `monthOf(todayInKorea())`보다 뒤면 400 몸통 없음. DB를 읽지 않는다. (로그인을 먼저 보므로 로그인 안 한 사람의 잘못된 달은 401이다. POST와 순서가 다른 것은 명세대로다.)
3. **읽기**: `sb = await supabaseServer()`. `readSavedReport(sb, month)`와 `readUsage(sb, thisMonth)`를 `Promise.all`로 함께 부른다(차례로 부르면 망이 끊겼을 때 라이브러리 재시도가 한 번에 7초쯤씩 쌓인다). `thisMonth`는 2번에서 쓴 이번 달과 같은 값이다(고른 달이 아니다). 어느 쪽이든 `'failed'`면 502 `{ code: 'E-AI-READ' }`.
4. **바뀜**: 리포트가 있을 때만 `isReportStale(month, saved.inputHash, (m) => loadReportMonths(sb, m))`. 리포트가 없으면 `stale: false`이고 `loadReportMonths`를 부르지 않는다.
5. **응답**: 200 `{ report, stale, usage }`, 머리에 `Cache-Control: no-store`. 리포트가 있어도 없어도 같다. `report`에는 `inputHash`가 없다. 나머지 칸은 `ShownReport` 타입대로 빠짐없이 보낸다. 이 전체를 `try`로 감싸 던지면 502 `E-AI-READ`.

- 502를 만드는 작은 함수를 따로 둔다: `console.error('[api/ai/report]', 'E-AI-READ')` 한 줄 + `Response.json({ code: 'E-AI-READ' }, { status: 502 })`. 기존 `fail()`은 `AiErrorCode`만 받는다. **`fail()`·`STATUS`·`AiErrorCode`를 넓히지 않는다**(E-AI-READ는 POST가 쓰지 않는다, AC-701.1).
- `POST`·`readMonth`·`runtime`·`maxDuration`을 고치지 않는다(AC-706.6). `readMonth`는 몸통을 읽는 함수이니 재사용하지 말고, 달이 이번 달 이전인지 보는 부분만 작은 내부 함수로 함께 쓰는 것은 괜찮다. POST의 동작이 그대로면 된다.
- 파일 위쪽 주석의 export 이름 목록에 `GET`을 더한다. **Next가 아는 이름 말고는 export하지 않는다**(헬퍼를 export하면 `next build`가 깨진다).

## 고쳐야 하는 기존 시험 (이 하나와 mock 목록만 허락한다)
- `route.test.ts`의 `AC-512.5` 시험은 export를 `['POST', 'maxDuration', 'runtime']`로 못 박았다. `GET`을 더하므로 반드시 깨진다. 기대 목록에 `'GET'`만 더한다.
- 파일 위쪽의 가짜(`mocks`, `vi.mock('../store')`, `vi.mock('../generate')`)에 `readSavedReport`·`readUsage`·`isReportStale`을 더한다.
- 그 밖의 기존 POST 시험은 고치지 않고 그대로 통과해야 한다. 그것이 AC-706.6의 증거다.
- 고친 내용을 답에 적어라. 리뷰어가 본다.

## 시험에 꼭 넣을 것
- AC-706.1: 로그인 안 함 → 401·몸통 없음 / 병원 없음·승인 대기 → 403·몸통 없음. 셋 다 `supabaseServer`를 부르지 않고 로그를 남기지 않는다. `readMe`의 다른 오류 → 502 `E-AI-READ`.
- AC-706.1·706.2 순서: 로그인 안 함 + 잘못된 달 → 401이다.
- AC-706.2: 값 없음 / `2026-13` / `2026-1` / 빈 글자 / 이번 달 다음 달 → 400·몸통 없음·`supabaseServer` 안 부름. 시계는 가짜로 둔다. 이번 달 자체는 통과한다.
- AC-706.3: 200, 칸이 `report`·`stale`·`usage` 셋이다. `stale` 참·거짓 모두. `report`에 `inputHash` 칸이 없고 **응답 글자 전체에 지문 값이 없다**. `Cache-Control`이 `no-store`다.
- 달: `readSavedReport`는 고른 달, `readUsage`는 이번 달을 받는다(지난달을 골라 부른 경우로 본다).
- AC-706.4: `{ report: null, stale: false, usage }`, `isReportStale`·`loadReportMonths`를 부르지 않는다, `no-store`.
- AC-706.5: 리포트 `'failed'` / 사용량 `'failed'` / 읽기가 던짐 → 502 `{ code: 'E-AI-READ' }`. `console.error`가 정확히 한 번이고 인자가 정확히 `['[api/ai/report]', 'E-AI-READ']`다.
- AC-706.6: 기존 POST 시험 통과. `runtime`·`maxDuration` 그대로.

## 꼭 지킬 규칙
- 사용자 세션 클라이언트만 쓴다. service role 키를 쓰지 않는다. 병원을 고르는 조건을 넣지 않는다(RLS).
- 로그에 달·숫자·글자를 넣지 않는다. 진짜 Claude를 부르지 않는다. GET은 `generateReport`·`callClaude`를 부르지 않는다.

## TDD 순서
1. 시험을 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-6 --expect red`로 RED를 기록한다. 그 전에는 `route.ts`를 고치지 않는다.
3. 구현 뒤 `... tdd-run TASK-6 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다. `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/app/api/ai/report/route.test.ts
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-6 --expect green
npx eslint src/app/api/ai/report/route.ts src/app/api/ai/report/route.test.ts --max-warnings=0
```
병렬 step이므로 `npm run build`·전체 `npm test`·`npx tsc`·`npm install`을 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 고치지 마라. 이유: 병렬이라 부딪힌다. 대신 답의 마지막에 한 줄 요약을 적어라.
- `store.ts`·`generate.ts`·`src/components/**`를 고치지 마라. 이유: 끝난 TASK이거나 병렬 step의 파일이다.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 고치지 말고 답에 적어라.
- 위에서 허락한 것 말고 기존 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라.
