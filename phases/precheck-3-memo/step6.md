# Step 6: memo-replace-default

> **TASK-40** 다른 메모 기본으로 바꾸기 · [바꾸지 않기] · **REQ-016·REQ-018·REQ-019** · 바뀐 AC만
> Phase 3 `precheck-3-memo` · Step 6 — `docs/precheck/plan.md` §6 밖(2026-11-02 사용자 결정)
> 이 명세 변경이 승인된 뒤에 시작한다. 이 step은 TASK-40 하나만 한다. 다른 TASK의 일은 하지 않는다.
> **사이트만 고친다.** 도우미는 그대로이고 새 도우미 릴리스가 없다.

## 왜 하는가

비트에 사람이 직접 쓴 메모가 우리 메모와 다르면, 사람마다 승인받지 않고 우리 메모로 바꾼다. 사용자 말: "직접쓴건 없애 그리고 어떤거 없앴는지만 알려줄수있게해 어차피 내가 한번 다 확인하고 돌릴거여서 괜찮아". 지운 메모는 그 PC 기록에 남고, 결과 화면에 누구 메모를 바꿨는지 이전 메모와 함께 보인다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/precheck/requirements.md`에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-016.3**: 비교 `다름`이면 승인 없이 묶음에 넣고 지금 쥔 비트 글을 `replaces`로. 묻지 않기와 상관없다. 빠지는 사람은 [바꾸지 않기]를 누른 사람과 `skippedByHand`([이 메모로 바꾸기] 전까지)뿐이다. [직접 확인했어요]로 보낸 사람은 보낼 때 [바꾸지 않기]로 적는다: 사본을 적지 못한 답 뒤에 도우미가 막아 주지 않는다
- **AC-016.4**: `already`는 `다름`인 수다. 건너뛴다는 뜻이 아니다
- **AC-016.6**: 사이트가 쥔 비트 글은 늘 1~4,000자다. `truncated`인 답은 통째로 받지 않고(지금과 같음), `truncated` 없이 4,000자를 넘는 줄은 그 진료만 `조회 못함`이다
- **AC-016.7**: 성공한 다시 불러오기 뒤에는 `replaces`가 새 글이다
- **AC-016.8**: 실패하면 [바꾸지 않기]와 전 글이 그대로다
- **AC-018.3**: 단추 옆 글의 " 다른 메모 N명은 우리 메모로 바뀌고, 원래 메모는 기록에 남아요."는 묻지 않기와 상관없이 바뀌는 사람이 있으면 잇는다
- **AC-018.4**: 미리 뺀 사람의 이유는 "이미 있음: 비트에 다른 메모가 있고 바꾸지 않기로 했어요". 무엇을 지웠는지는 이 결과 화면과 엑셀이다. 새 화면을 만들지 않는다
- **AC-018.14**: `다름`이면 입력할 사람에 '메모 바꿈' 칩, 두 메모가 나란히, [바꾸지 않기]가 있다(묻지 않기가 켜져 있어도). 누르면 '다른 메모 있음'으로 가고 [이 메모로 바꾸기]로 돌아온다. 누른 사람은 어느 묶음에도 넣지 않는다. 쓰다 멈춘 사람만 `replaces` 없이 보낸다. 글이 달라져도 풀지 않고 새 [자료 불러오기]가 지운다. 직접 확인 기록이 남은 사람의 승인만 전 규칙 그대로다
- **AC-018.16**: [이어서 입력]에는 `replaces`를 싣지 않는다
- **AC-018.20**: '입력 직전 변경됨'은 기억하지 않는다. 다시 불러오면 새 글로 다음 묶음에 든다
- **AC-018.21**: [이어서 하기]·[다시 하기]의 `replaces`는 보낼 때의 값이고 [바꾸지 않기]를 누른 사람은 뺀다
- **AC-018.22**: 묻지 않기는 PC 창만 생략한다. 띠 글이 바뀐다. 첫 묶음 안내의 N은 `replaces` 없이 보내 '이미 있음'으로 돌아온 사람(불러온 뒤에 메모가 생김)뿐이다
- **AC-018.26**: 칩은 '새 메모'·'메모 바꿈'. '다른 메모 있음' 글이 바뀐다. 차례는 그대로다
- **AC-019.3**: 글만 바뀐다. `counts.ts`는 고치지 않는다. 바꿔 끝나면 입력됨이고 [바꾸지 않기]가 있는 날은 끝나지 않은 날로 남는다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ADR.md` — ADR-016·020·021
- `/specs/precheck/requirements.md` — 맨 위 사용자 결정, 위 AC 전문, REQ-037 머리
- `/specs/precheck/design.md` — 19-6절 전체(맨 위 줄부터 표까지), 19-1절(대상 고르기)
- `/specs/precheck/tasks.md` — TASK-40 (수정 범위·메모)
- 이전 step에서 만든 파일:
  - `src/lib/precheck/memoCompare.ts`(`bitMemoOf`·`visitMemos`·`inputPlan`) (Step 2)
  - `src/lib/precheck/inputTargets.ts`(`reasonOf`·칩), `src/workers/precheck/jobs.ts`(`approved`·`itemOf`·`buildBatch`·`applyInputResults`·`memoApprove`), `src/components/claim/rows/MemoRows.tsx`, `src/components/claim/rows/InputResultRows.tsx`, `src/components/claim/memo/MemoPanel.tsx`·`InputResults.tsx` (Step 4)
  - `src/lib/precheck/counts.ts`(읽기만) (Step 5)
  - `helper/src/Precheck.Core/Input/InputRunner.cs`의 `WhyNotReplace`·`RunPerson`, `BatchCheck.cs`의 `ValidReplaces`, `Claim/MemoRowsRead.cs`의 `Read` (읽기만) (Step 3·Step 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업 (화면 step)

- 새 목업이 없다. 새 화면과 새 배치를 만들지 않는다(tasks.md TASK-40). 입력 쪽 승인 목업(tasks.md TASK-18 링크)의 줄·단추 모양을 그대로 쓰고 글·칩·[바꾸지 않기]가 보이는 줄만 AC대로 바꾼다
- 모양은 `ds`와 토큰만 쓴다. 화면 확인은 jsdom 시험으로 한다. 실제 화면 캡처는 Phase 끝에 메인 세션이 한다

## 수정 범위 (tasks.md TASK-40)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/precheck/memoCompare.ts`
  - `src/lib/precheck/memoCompare.test.ts`
  - `src/lib/precheck/inputTargets.ts`
  - `src/lib/precheck/inputTargets.test.ts`
  - `src/types/precheck.ts`
  - `src/workers/precheck/jobs.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/components/claim/rows/MemoRows.tsx`
  - `src/components/claim/rows/MemoRows.test.tsx`
  - `src/components/claim/memo/MemoPanel.tsx`
  - `src/components/claim/memo/MemoPanel.test.tsx`
  - `src/components/claim/memo/InputResults.tsx`
  - `src/components/claim/memo/InputResults.test.tsx`
- Tests:
  - `src/lib/precheck/memoCompare.test.ts`
  - `src/lib/precheck/inputTargets.test.ts`
  - `src/workers/precheck/jobs.test.ts`
  - `src/components/claim/rows/MemoRows.test.tsx`
  - `src/components/claim/memo/MemoPanel.test.tsx`
  - `src/components/claim/memo/InputResults.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **`replaces`는 지금 쥔 글이다**: 칸 글이 이 글과 같을 때만 도우미가 바꾼다(AC-037.1). 다른 곳에 글을 기억해 두지 않는다
- **[바꾸지 않기]는 묻지 않기보다 앞선다**: `replaces` 없이 보내면 켜진 도우미가 그 칸을 바꾼다(AC-037.6). 그래서 보내지 않는다. 쓰다 멈춘 사람만 예외다(AC-018.14)
- **`skippedByHand`는 사이트가 막는다**: 도우미는 `replaces`가 오면 새 승인으로 본다(AC-037.6). 이 사람에게 `replaces`를 싣는 때는 [이 메모로 바꾸기]를 누른 때뿐이다
- **환자 자료 구역 울타리**: `src/lib/precheck`·`src/workers`에서는 네트워크·`console`·브라우저 저장소·React·Next·supabase·`lib/auth`·`lib/storage` import·JSX를 쓰지 않는다. `src/components/claim/rows/**`는 줄을 props로만 받는다 (CLAUDE.md, ADR-020)
- **브라우저 저장소 안 씀**: [바꾸지 않기]는 Worker 메모리에만 둔다. `localStorage`·`sessionStorage`·`indexedDB`에 두지 않는다 (ADR-020)

## 작업

### 1. 비교와 묶음 (`memoCompare.ts`, `types/precheck.ts`)
```ts
// MemoSource에 declined?: ReadonlySet<string>, VisitMemo에 declined?: true (compare가 '다름'일 때만)
export function replacesOf(row: VisitMemo): string | undefined
// '다름'이고 declined가 아니고, skippedByHand이면 approved가 있을 때만 row.inBit. 아니면 undefined
export function inputPlan(visits: readonly VisitMemo[]): InputPlan // noAsk 인자를 뺀다
```
- `inputPlan`의 차례는 그대로이고 `다름` 줄만 바뀐다: `replacesOf`가 글을 주면 `{ ...visit, replaces }`로 묶음에, 아니면 `이미 있음`으로
- `bitMemoOf`: 글이 4,000자를 넘으면 `undefined`(읽지 못한 것, AC-016.6)
- `MemoStateOptions`에서 `noAsk`를 빼고 `declined`를 더한다

### 2. 대상 고르기 (`inputTargets.ts`)
- `TargetContext.noAsk`를 뺀다. 칩은 `visit.compare !== '다름' ? '새 메모' : '메모 바꿈'`. `TargetRow.chip` 타입도 맞춘다

### 3. Worker (`jobs.ts`)
- `declined` 모음을 더하고 `visitMemos`에 넘긴다. 새 `loadStart`가 지운다(`keepEdits`와 상관없이)
- `memoApprove`: 거짓이면 `approved`에서 빼고, 비교가 `다름`인 줄이면 `declined`에 넣는다. 참이면 `declined`에서 빼고, 사본이 `skippedByHand`인 `다름` 줄이면 지금 글을 `approved`에 넣는다
- `itemOf`는 `replacesOf`를 쓴다. `plain`은 `declined`를 뺀다
- `continueStuck`은 `replaces` 없이 보낸다. `resume`은 `replacesOf`로 다시 정하고 `declined`를 빼되 쓰다 멈춘 사람은 `replaces` 없이 남긴다. `byHand`는 보낼 때 그 사람을 `declined`에 넣는다
- `continueStuck`은 `plain`을 쓰지 않는다(`declined`도 보낸다). 남은 수·[이어서 하기]·[다시 하기]는 비교가 `다름`인 `declined`를 세지 않고(이번 답에 쓰다 멈춘 줄이 있는 사람은 [이어서 하기] 묶음에 남는다. `left`는 지금처럼 그 줄을 세지 않는다) 0명이면 단추가 없다(AC-018.4·AC-018.21)
- `diffAtSend`를 지우고 `firstNoAsk`는 이번 답에서 `reasonKind`가 `already`이고 보낸 줄에 `replaces`·`checkedByHand`가 없고 사본이 `skippedByHand`가 아닌 사람 수로 센다
- `PRE_LEFT_REASON.diff`를 AC-018.4의 글로 바꾼다
- `approved`를 푸는 곳(`runCheck`·`editMemo`·다시 불러오기)은 그대로 둔다

### 4. 화면
- `rows/MemoRows.tsx`: `LEFT_GROUPS.diff.why`를 AC-018.26의 글로. [바꾸지 않기]는 칩이 '메모 바꿈'인 줄 모두에
- `memo/MemoPanel.tsx`: 단추 옆 글(AC-018.3), 묻지 않기 띠 글(AC-018.22)
- `memo/InputResults.tsx`: 첫 묶음 글(AC-018.22). 결과 칸과 이전 메모 줄은 이미 있다(AC-018.4)

### 5. 시험
- `memoCompare.test.ts`: AC-016.3(`다름`이면 지금 비트 글을 `replaces`로 듦, [바꾸지 않기]면 이미 있음, `skippedByHand`면 빠지고 승인하면 듦, 앞선 까닭이 먼저), AC-016.4(`already`), AC-016.6(4,000자는 듦, 4,001자는 그 진료만 `조회 못함`)
- `inputTargets.test.ts`: AC-018.26(칩 둘, 까닭 차례), AC-018.14(`declined`면 '다른 메모 있음', 목록과 묶음이 같음), AC-018.22(`skippedByHand`는 빠짐), AC-018.20(입력 직전 변경됨을 기억하지 않음)
- `jobs.test.ts`: AC-016.3(사본을 적지 못한 [직접 확인했어요] 사람이 다음 묶음에 없음), AC-016.7(`replaces`가 새 글), AC-016.8, AC-018.4, AC-018.14(AC 끝의 목록), AC-018.16, AC-018.21, AC-018.22(꺼짐과 켜짐의 묶음이 같음, 첫 묶음의 N), AC-019.3(바꿔 끝나면 `entered`, 아직이면 `skipped`, `declined`가 있는 날은 `entered`가 `need_memo`보다 적음)
- `rows/MemoRows.test.tsx`: AC-018.14, AC-018.26. `memo/MemoPanel.test.tsx`: AC-018.3, AC-018.22. `memo/InputResults.test.tsx`: AC-018.4, AC-018.22
- 옛 규칙을 본 시험은 지우지 않고 새 뜻으로 고친다(tasks.md TASK-40의 '뒤집히는 시험')

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-018.14: [바꾸지 않기]를 누른 사람은 묻지 않기가 켜져 있어도 묶음에 없다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-40 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-40 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/precheck/memoCompare.test.ts src/lib/precheck/inputTargets.test.ts src/lib/precheck/counts.test.ts src/lib/precheck/excel.test.ts src/workers/precheck/jobs.test.ts src/components/claim/rows/MemoRows.test.tsx src/components/claim/memo/MemoPanel.test.tsx src/components/claim/memo/InputResults.test.tsx
python3 ~/.claude/harness/bin/tdd-run TASK-40 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `counts.test.ts`·`excel.test.ts`는 고치지 않고 그대로 통과해야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
   - `helper/`·`commands.json`·`lib/bridge/versions.ts`를 건드리지 않았는가?
3. 결과에 따라 `phases/precheck-3-memo/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다. 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `replaces` 없이 `다름`인 사람을 보내지 마라(예외: 승인이 풀린 `skippedByHand` 사람의 [다시 하기]는 `replaces` 없이 가지만 도우미가 막는다). 이유: 묻지 않기가 켜진 도우미는 `replaces`가 없으면 칸 글을 그대로 받아 바꾼다(AC-037.6). 칸 글이 사용자가 목록에서 본 글과 달라도 바뀐다
- `helper/`와 `commands.json`을 고치지 마라. 이유: 새 도우미 릴리스 없이 끝내는 것이 이 결정의 조건이다. PC 창의 낡은 글은 다음 릴리스 때 고친다(REQ-037 머리)
- `counts.ts`를 고치지 마라. 이유: 건수는 입력을 마치면 저절로 맞는다(AC-019.3)
- 지운 메모를 보여 주는 새 화면을 만들지 마라. 이유: 결과 화면과 엑셀로 알린다(AC-018.4, 2026-11-01 사용자 결정 '이번에는 저장만 한다')
- 결과 엑셀을 자동으로 만들지 마라. 이유: 환자 이름이 들어가고 암호가 없다(AC-018.15, 사용자 결정)
- 묻지 않기를 사이트에서 켜는 칸·단추를 만들지 마라. 이유: 체크는 PC 확인 창에만 있다(AC-037.5)
- 메모·이름·차트번호를 주소·쿼리·`console`에 남기지 마라. 이유: 주소와 로그는 PC 밖으로 나갈 수 있다
- `specs/` 아래 파일을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다. 옛 규칙의 시험은 새 뜻으로 고친다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
