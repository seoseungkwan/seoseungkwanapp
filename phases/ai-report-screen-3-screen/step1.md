# Step 1: report-screen

> **TASK-9** 화면 상태와 동작 · **REQ-708·709·710·711·713·715**
> Phase 3 `ai-report-screen-3-screen` · Step 1. Step 0(TASK-8)이 끝난 뒤 돈다.
> 작업 폴더: `C:\Users\tjtmd\Desktop\dasdas\seoseungkwanapp\.claude\worktrees\feat-ai-report-screen`

## 읽어야 할 파일
- `/CLAUDE.md`, `/specs/ai-report-screen/requirements.md`(REQ-708~711·713·715), `/specs/ai-report-screen/design.md`('흐름', '달을 옮겨도 저장하지 않는다', '화면 상태', '위험' 3번), `/specs/ai-report-screen/tasks.md`(머리말, TASK-9)
- `src/components/ai-report/reportClient.ts`, `ReportBody.tsx`, `UsageAside.tsx`, `RedoDialog.tsx`(Step 0 결과, 그대로 쓴다), `src/lib/ai/reportScreen.ts`
- 시안 `docs/mockups/ai-report/index.html`은 1.1MB다. **통째로 읽지 마라.** 7~9번 줄이 글꼴이다. 머리·칸·알림 모양은 `sed -n 10,193p docs/mockups/ai-report/index.html | cut -c1-300`의 `.p-head`·`.p-act`·`.step`·`.grid`·`.col-m`·`.col-s`·`.toast`와 그 아래 `@media`만 본다. 동작은 `sed -n 205,468p … | cut -c1-1200`의 `main`.
- 참고: `src/components/auth/CopyStatus.tsx`(`useCopy`, 고치지 말고 보기만), `src/app/error.test.tsx` 39~53번 줄(`location.reload` 가짜 만드는 법), `src/lib/ai/boundary.test.ts`(울타리 시험 틀), `src/components/ui/classes.test.ts` 72~75번 줄 근처(`ARBITRARY_COLOR`·`PALETTE` 정규식과 주석 빼는 `code()`)

## 수정 범위 (승인된 Files, 이 3개뿐)
`src/components/ai-report/AiReportScreen.tsx`, `AiReportScreen.test.tsx`, `boundary.test.ts`

## 작업
`export function AiReportScreen({ today }: { today: string }): JSX.Element` (`'use client'`). `today`는 `YYYY-MM-DD`. 페이지에 붙이는 일은 TASK-10이다.

### 상태 고르기 (design '화면 상태' 표 그대로, 위가 이긴다)
| 조건 | `ReportBody` state | 머리 단추 |
|---|---|---|
| 읽는 중 | `loading` | 없음 |
| 읽기 실패 | `readError` | 없음 |
| 분석 중, 리포트 없음 | `busyEmpty` | 없음 |
| 분석 중, 리포트 있음 | `report`(`busySeconds` 숫자) | "분석 중" 보조(`aria-busy`) |
| `E-AI-NO-DATA`, 리포트 없음 | `noData` | 없음 |
| 오류, 리포트 없음 | `empty`(`error`) | 없음 |
| 오류, 리포트 있음(NO-DATA 포함) | `report`(`error`) | [다시 분석] |
| 리포트 있음 | `report` | [다시 분석], `stale`이면 `ds.button.primary`, 아니면 `ds.button.secondary` |
| 리포트 없음 | `empty`(`error: null`) | 없음 |

옆 칸 `usage`: 읽기가 끝나 값이 있을 때만 값, 읽는 중·읽기 실패면 `null`("—").

### 읽기
- 처음과 달을 옮길 때: 요청 번호를 올리고 → 오류·복사 표시·복사 실패 글을 지우고 → 읽는 중 → `loadMonth(month)` → 번호가 다르면 버린다(AC-708.2·708.3).
- 결과: `reauth` → `location.reload()`(오류 상자 없음, AC-713.1). `error` → 읽기 실패. `ok` → 값 저장.
- [다시 읽기]는 같은 달로 같은 길을 탄다.

### 분석 (`AI 분석`과 창의 `다시 분석`이 같은 함수)
- 이미 기다리는 중이면 아무것도 하지 않는다. **상태 값이 아니라 ref로 막는다**(같은 틱에 두 번 눌러도 한 번만 보낸다, AC-710.3).
- 시작하면 오류를 지우고, 초를 0으로 두고, 1초마다 초를 올리는 타이머를 건다. 이전·다음 단추는 `disabled`(AC-710.2).
- 끝나면(성공·실패 모두) 타이머를 끄고 **조용히 다시 읽는다**. 조용히란 '읽는 중' 상태로 가지 않는다는 뜻이다(받은 리포트가 깜빡이면 안 된다).
  - 분석 성공: 받은 리포트를 바로 보이고, `stale`은 false로 둔다(AC-710.4).
  - 분석 오류: 그 번호를 남기고(다음 동작까지, design '위험' 3번) 조용히 다시 읽는다.
  - 조용한 읽기의 답: `ok` → `report`(`view.report ?? 지금 리포트`)·`stale`·`usage`를 바꾼다. 응답을 못 받았지만 서버는 성공한 경우 이렇게 해야 새 리포트가 오류 상자 아래에 보인다(위험 3번). `error` → 아무것도 바꾸지 않고 **오류 상자를 띄우지 않는다**(AC-710.4). `reauth` → `location.reload()`.
  - 조용한 읽기도 요청 번호를 쓴다. 답이 오기 전에 달을 옮기면 버린다.
- 분석의 `reauth` → `location.reload()`, 오류 상자 없음. 이때 기다림 표시를 풀지 않아도 된다(페이지가 다시 읽힌다).

### 화면을 떠날 때
언마운트하면 타이머(초·복사 2초·복사 실패 2.2초)를 모두 끄고, 요청 번호를 올려 늦은 답을 버린다. **늦게 온 `reauth`로 `location.reload()`를 부르면 안 된다**(다른 탭으로 옮겼는데 페이지가 다시 읽힌다). 분석 중 떠났다가 온 답도 같다.
Next 개발 서버는 StrictMode라 effect가 두 번 돈다. 번호·기다림 ref가 그때도 맞게 돌아야 한다(마운트 때 다시 세운다).

### 다시 분석 확인 창
- 머리의 [다시 분석] → `RedoDialog`(`month`). 머리 단추에 ref를 둔다.
- `onCancel`: 창을 닫고 머리 단추로 초점을 돌린다(AC-711.2). 요청 없음.
- `onConfirm`: 창을 닫고 분석 시작. 머리 단추는 같은 요소로 남아 "분석 중"이 되고(요소가 바뀌지 않게 `key`를 나누지 마라) 초점도 거기로 준다. 창이 사라지며 초점이 몸통으로 빠지지 않게 하려는 것이다. 이 "분석 중" 단추를 또 눌러도 요청을 보내지 않는다.

### 복사 (AC-709.6)
- `reportCopyText(report)`를 `navigator.clipboard.writeText`로. 성공 → `copied` 2000ms. 실패(`clipboard`가 없어도 실패다) → `role="status"`의 "복사하지 못했어요. 문장을 길게 눌러 직접 복사해 주세요." 2200ms. 같은 타이머를 다시 걸 때는 앞 타이머를 끈다.
- 글자 자리: 시안의 `.toast` 모양(`ds` 토큰으로). 글이 없을 때 그 `role="status"`를 그리지 않아도 된다.
- 복사 도중 달을 옮겼다면 늦은 결과를 버린다(번호 비교).

### 머리 (AC-708.1)
`<h1>` "AI 리포트", `compareLine(month)`, `role="group" aria-label="달 고르기"` 안에 이전(`aria-label="이전 달"`, `canGoPrev`)·`<output aria-live="polite">`(`longMonth`)·다음(`aria-label="다음 달"`, `canGoNext(month, today)`). 아이콘은 `chev`(왼쪽·오른쪽은 회전, 시안 CSS `.ic.left`·`.ic.right`). 첫 달은 `firstMonth(today)`. 시안 `.p-head` 아래 선, `.grid` 8:4 칸, 좁은 폭에서 한 줄로 내려오는 `@media`를 Tailwind로 옮긴다. 왼쪽 선은 `aside`를 감싼 칸이 맡는다.

`now`는 그릴 때 `new Date()`를 넘긴다(리포트 받은 직후 "방금 만들었어요").

## `boundary.test.ts` (이 폴더 울타리)
`src/components/ai-report/`의 `*.ts`·`*.tsx` 중 시험 아닌 파일 전부를 읽어 본다. **`AiReportScreen`·`ReportBody`·`UsageAside`·`RedoDialog`·`reportClient` 다섯이 목록에 있는지 먼저 본다**(빈 검사 방지).
- AC-715.1: import(정적·동적·`require`, 상대 경로 포함)에 `@anthropic-ai/sdk`·`@/lib/supabase`·`lib/supabase`·`@/app/api`·`app/api`·`server-only`가 없다. 글자로 `dangerouslySetInnerHTML`·`localStorage`·`sessionStorage`·`console.`이 없다.
- 시험 이름도 AC-715.1 또는 AC-708.4로 달아 **색과 움직임**을 본다. `src/components/ui/classes.test.ts`의 검사 폴더에 `ai-report`가 없어(그 파일은 수정 범위 밖) 여기서 본다. 그 파일의 `ARBITRARY_COLOR`·`PALETTE` 정규식과 `code()`(주석·SVG 색 빼기)를 그대로 옮겨 쓴다. 추가로 `animate-`·`transition`·`@keyframes`가 없다.
- 규칙 자체가 잡아야 할 것을 잡는지 일부러 나쁜 글자 몇 개로 본다(`console.log`, `from "../../app/api/x"`, `animate-spin`, `bg-[#fff]`).
- 경로는 윈도우·리눅스 모두에서 맞게 `node:path`로 만든다. 경로 글자를 슬래시로 비교하지 마라(이 PC의 `classes.test.ts`가 그래서 22개 깨진다).

## 시험에 꼭 넣을 것 (`AiReportScreen.test.tsx`)
`// @vitest-environment jsdom`. **`fetch`만 가짜**로 둔다(`vi.stubGlobal('fetch', …)`, `reportClient`는 진짜). 시계는 `vi.useFakeTimers` + `userEvent.setup({ advanceTimers: vi.advanceTimersByTime })`, 오늘은 prop으로. `location`은 `error.test.tsx`처럼 통째로 가짜. 끝날 때 `vi.unstubAllGlobals`·`useRealTimers`·`cleanup`.

**시안 9상태를 모두 그린다**(시험 이름에 상태 이름도 적어라): 리포트가 있는 달 / 아직 안 만든 달 / 분석 중 / 진행 중인 달 / 숫자가 바뀐 리포트 / AI가 바쁠 때 / 사용 한도에 닿았을 때 / 만들지 못했을 때 / 통계가 없는 달. 추가 상태: 읽는 중 / 읽기 실패 / 달 지난 partial / 리포트 위 NO-DATA 오류.

- AC-708.1: 제목·견주는 글·달 고르기, 첫 달이 지난달, 첫 GET의 주소가 `?month=` 그 달. 끝 달에서 단추가 막힌다.
- AC-708.2: 달을 옮기면 새 GET, 앞 달의 오류·"복사했어요"·복사 실패 글이 사라진다.
- AC-708.3: 앞 달 답을 뒤에 풀어 주어도 마지막 달 내용만 보인다. 조용한 읽기 답이 달을 옮긴 뒤 와도 버린다.
- AC-708.4·708.5: 읽는 중·읽기 실패에 [AI 분석]·[다시 분석]이 없고 사용량이 "—". [다시 읽기]가 같은 달을 다시 부른다. 읽는 중에 움직임 클래스가 없다.
- AC-709.5(단추): `stale` 참이면 머리 단추 클래스가 `ds.button.primary`, 거짓이면 `ds.button.secondary`.
- AC-709.6: 복사 글이 `reportCopyText` 결과와 같다. 1999ms에는 "복사했어요", 2000ms 뒤 "복사". 실패 글이 2199ms에 있고 2200ms 뒤 없다. `clipboard`가 없을 때도 실패 글.
- AC-710.1: 빈 화면, 머리에 [다시 분석] 없음.
- AC-710.2: 기다리는 동안 글·`aria-busy`·초가 늘어남(3초 뒤 "지금까지 3초")·이전 다음 막힘. POST 몸통이 정확히 `{"month":"…"}`.
- AC-710.3: "분석 중"을 눌러도, [AI 분석]을 같은 틱에 두 번 눌러도 POST가 한 번.
- AC-710.4: 성공 뒤 리포트·"방금 만들었어요", 이어서 GET 한 번, 사용량이 새 값. 그 GET이 실패해도 리포트가 그대로이고 `alert`가 없다. 이 사이에 "읽고 있어요"가 나타나지 않는다.
- AC-710.5: 통계 없음 → 글·링크·번호, [AI 분석] 없음. 달을 옮겼다 돌아오면 '아직 만들지 않았어요'.
- AC-710.6: 세 번호 모두 오류 상자(무엇·어떻게·번호), 리포트 있으면 리포트, 없으면 [AI 분석]. 끝난 뒤 GET이 다시 불려 사용량이 바뀐다. **응답을 못 받았지만(`fetch` 거절 → BUSY) 다시 읽으니 리포트가 있는 경우 오류 상자와 새 리포트가 함께 보인다**(위험 3번).
- AC-711.1·711.2·711.3·711.4: 창을 띄워 POST가 아직 없음, 취소·Esc·가림막 뒤 초점이 머리 단추, POST 없음. 확인 뒤 옛 리포트 + 안내 + 머리 "분석 중"(`aria-busy`, 보조), 초가 늘어남, 초점이 머리 단추. 오류면 옛 리포트 위 오류 상자, NO-DATA도 빈 화면으로 안 간다.
- AC-712.1: 지난달을 골라도 옆 칸 값이 응답의 `usage`(화면이 달로 고르지 않음).
- AC-713.1: GET 401·403·돌려보냄(`{ type: 'opaqueredirect', status: 0 }`), POST 401·돌려보냄, 조용한 읽기의 401에서 `reload`가 한 번 불리고 `alert`가 없다.
- 타이머 정리: 분석 중·복사 표시 중 언마운트 → `vi.getTimerCount()`가 0. 분석 중 언마운트 뒤 온 답(성공·`reauth` 모두)에 `reload`·GET이 없다.
- StrictMode: `<StrictMode>`로 감싸 그려도 첫 읽기가 끝나 리포트가 보이고, [AI 분석]이 POST를 한 번 보낸다.
- 다른 달 숫자: 지어낸 숫자는 시험 파일 안에만 둔다.

## TDD 순서
1. `AiReportScreen.test.tsx`·`boundary.test.ts`를 먼저 쓴다. 이름에 AC ID를 넣는다.
2. `python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-9 --expect red`로 RED를 기록한다. 그 전에는 `AiReportScreen.tsx`를 만들지 않는다.
3. 구현 뒤 `... tdd-run TASK-9 --expect green`. 정리한 뒤 다시 green을 본다.

## 이 PC(윈도우)에서
- 파일은 Edit·Write 도구로만 고친다. 스크립트·`sed`로 고치지 않는다(읽기만 `sed`). `src`는 LF다.

## Acceptance Criteria
```bash
npx vitest run src/components/ai-report
python -I -X utf8 C:/Users/tjtmd/.claude/harness/bin/tdd-run TASK-9 --expect green
npx eslint src/components/ai-report --max-warnings=0
npx tsc --noEmit
```
`npm run build`와 전체 `npm test`는 돌리지 않는다. 단계 끝에 메인이 돌린다.

## 금지사항
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 리뷰 PASS 뒤 메인이 한다.
- `phases/**/index.json`을 만들거나 고치지 마라. 이유: 승인 범위 밖이라 안전장치가 막는다. 스크립트로 우회하지도 마라.
- 수정 범위 밖 파일을 고치지 마라. `ReportBody.tsx`·`UsageAside.tsx`·`RedoDialog.tsx`·`reportClient.ts`·`reportScreen.ts`·`classes.ts`·`classes.test.ts`도 그렇다. `menu.ts`·`page.tsx`는 TASK-10이다. 고칠 일이 생기면 고치지 말고 답에 적어라.
- `specs/`·`.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 승인이 풀린다. 명세와 다른 점을 찾으면 답에 적어라.
- 기존 시험을 지우거나 약하게 바꾸거나 `eslint-disable`을 쓰지 마라. `rm -rf`가 든 스크립트를 쓰지 마라.
- 진짜 Claude를 부르지 않는다. 열쇠를 찾거나 만들지 않는다.

## 답에 적을 것
만든 파일, 시험 수, RED·GREEN 결과, 시안 9상태 대응표(상태 → 시험 이름), 명세·시안과 달라진 곳과 그 까닭, 시험으로 못 본 것, 마지막에 한 줄 요약.
