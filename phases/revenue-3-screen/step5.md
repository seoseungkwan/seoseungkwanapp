# Step 5: busy-wording

> **TASK-15** 비트 연결 문구 바꾸기 · **REQ-009·REQ-014** · AC-009.6 · AC-009.7 · AC-014.7
> Phase 3 `revenue-3-screen` · Step 5 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.
> Step 4(TASK-11)는 사용자 할 일로 `blocked`이고 이 step은 그것을 기다리지 않는다. `scripts/execute.py`는 `blocked`인 step이 있으면 멈추므로, 이 step은 메인 세션이 직접 맡긴다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-009·REQ-014에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-009.6**: 통로 `busy`(다른 창이 연결을 쓰는 중)면 연결 안 됨이라고 말하지 않고, 저장된 숫자는 그대로 둔 채 `E-BRIDGE-BUSY` 카드와 [다시 확인]. 저장된 줄이 없어도 같은 카드. 저장된 줄을 읽지 못했으면 `E-PAGE-FAILED` 카드, 열려 있는 묶음 고치기 화면은 그대로. 카드 글자는 `lib/errors.ts`의 그 번호 문구. `BusyCard`에 같은 안내를 되풀이하는 고정 줄 없음
- **AC-009.7**: 이 화면이 가져오기를 끝낸 뒤 통로가 끊기면 저절로 다시 붙지 않음. 저장된 숫자와 '이 PC는 비트와 연결되어 있지 않아요' + [비트 PC 연결](`/claim/setup` 링크). 그 화면에 다녀오거나 이 화면을 새로 열면 다시 붙음. 저장된 줄이 없으면 `connect-needed`(AC-009.3). 가져오는 도중 끊기거나 도우미가 끝나면 오류 카드 + [다시 확인](AC-009.4)
- **AC-014.7**: 묶음을 모두 지우고 [저장]하면 저장된 묶음이 없는 상태가 되어 치료별 매출과 편집 화면은 제안으로 돌아가고 칩이 다시 보임(AC-014.3). '묶음 없음'을 따로 저장하지 않음

## 승인된 글자

사용자 OK: 2026-11-02 "연결문구 바꿔", 같은 날 "다른 창으로 바꿔"로 fix를 다시 고침. 아래 글자 그대로 쓴다.

- what: `비트 연결을 다른 창에서 쓰고 있어요`
- fix: `비트 연결은 한 창에서만 쓸 수 있어요. 비트 연결을 쓰는 다른 창을 닫고 [다시 확인]을 눌러 주세요.`

사용자가 일부러 바꾼 문구다. 시험의 기대 글자를 이것으로 고치는 것은 시험을 약하게 바꾼 것이 아니다.

이 글자는 `lib/errors.ts`·그 글자를 못 박은 시험·`docs/mockups/revenue/README.md`·이 파일에만 둔다. `specs/revenue/`의 `requirements.md`·`design.md`·`tasks.md`에는 적지 않는다(사용자가 일부를 곧 넓힐 수 있다).

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/specs/revenue/requirements.md` — AC-009.3·009.4·009.6·009.7, AC-014.3·014.7
- `/specs/revenue/design.md` — 9절(화면), 13절(위험)
- `/specs/revenue/tasks.md` — 머리말의 2026-11-02 줄과 TASK-15
- `/docs/mockups/revenue/README.md` — 승인 기록 표
- `/src/lib/errors.ts`, `/src/lib/errors.test.ts`
- `/src/components/revenue/RevenueScreen.tsx`(223·305·337줄 근처), `/src/components/revenue/RevenueStates.tsx`(`RetryCard`·`BusyNotice`·`SavedNotice`), `/src/components/revenue/view.ts`(`buildRevenueView`)
- `/src/components/revenue/RevenueScreen.test.tsx`, `/src/components/revenue/groups/GroupEditor.test.tsx`
- `/src/components/claim/setup/SetupAlert.tsx`(`BusyCard`), `/src/components/claim/setup/SetupScreen.test.tsx`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 시안 (화면 step)

- 새 화면이나 배치가 없다. 글자가 바뀌고 `BusyCard`의 고정 줄 하나가 빠진다
- OK 기록은 `docs/mockups/revenue/README.md`에 줄 하나로 더한다(아래 작업 3)
- 옛 승인 시안(`docs/mockups/ui-90/...`)에는 옛 글자가 남는다. 다시 쓰지 않는다

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
  - `src/components/revenue/RevenueScreen.test.tsx`
  - `src/components/revenue/groups/GroupEditor.test.tsx`
  - `src/components/claim/setup/SetupScreen.test.tsx`
  - `src/components/claim/setup/SetupAlert.tsx`
  - `docs/mockups/revenue/README.md`
- Tests:
  - `src/lib/errors.test.ts`
  - `src/components/revenue/RevenueScreen.test.tsx`
  - `src/components/revenue/groups/GroupEditor.test.tsx`
  - `src/components/claim/setup/SetupScreen.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **오류 문구는 한 곳**: 글자는 `lib/errors.ts`의 `E-BRIDGE-BUSY` 두 줄에만 쓴다. 화면 부품에 글자를 넣지 않는다 (CLAUDE.md)
- **청구 화면과 같이 쓴다**: `/claim`의 카드도 `errorInfo('E-BRIDGE-BUSY')`로 같은 글자를 읽는다. 청구 쪽 시험은 `SetupScreen.test.tsx:701` 말고 그대로 통과해야 한다. `components/claim/*`는 `setup/SetupAlert.tsx`의 그 줄과 `setup/SetupScreen.test.tsx` 말고 고치지 않는다
- **화면 코드는 `BusyCard`의 고정 줄 하나를 빼는 것(작업 4) 말고 그대로**: 세 AC의 동작은 TASK-9·TASK-14가 이미 만들었다. 시험을 통과시키려고 그 밖의 화면 코드를 고쳐야 하면 고치지 말고 `blocked`로 멈춘다(어느 AC의 어느 부분이 왜 안 되는지 적는다)

## 작업

줄 번호는 이 step을 시작할 때 기준이다.

### 1. 글자 바꾸기 (RED 먼저)
1. 시험의 못 박은 글자를 승인된 글자로 바꾼다: `src/lib/errors.test.ts:259-260`의 what·fix, `src/components/revenue/RevenueScreen.test.tsx:36`의 `BUSY_WHAT`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect red`로 실패를 확인한다
3. `src/lib/errors.ts:78-79`를 승인된 글자로 바꾼다
4. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green`으로 통과를 확인한다

### 2. AC ID 달기 · 없는 시험 더하기
이미 그 동작을 증명하는 시험은 이름에 AC ID를 더한다. 증명하는 시험이 없는 부분은 시험을 더한다. 아래는 이 명세를 쓸 때 찾은 자리다. 직접 읽고 확인한다.

- **AC-009.6**
  - `RevenueScreen.test.tsx:690`(저장된 줄 없음)·`:711`(저장된 줄 있음)이 앞 두 문장을 증명한다. 이름에 AC-009.6을 더한다. `parts.test.tsx:277`은 수정 범위 밖이라 그대로 둔다
  - 열려 있는 묶음 고치기 화면을 그대로 두는 문장: `:1308` 이름에 더한다
  - `busy` + 저장된 줄 읽기 실패(`E-PAGE-FAILED`): 시험이 없다(`:744`는 `ready`다). 더한다
- **AC-009.7**
  - 가져오기를 끝낸 뒤 끊김 + 저장된 줄 있음: `:477` 이름에 더한다. 이 시험은 [비트 PC 연결] 링크와 `bridge.retry`가 불리지 않는 것을 보지 않으므로 그 둘을 보는 시험을 더한다
  - 가져오기를 끝낸 뒤 끊김 + 저장된 줄 없음: `:488`(비트 오류로 멈춘 뒤 끊김, 줄 없음 → 연결 필요)이 같은 갈래를 지난다. 이름에 더한다. `:468`은 처음부터 끊겨 있던 경우다
  - "그 화면에 다녀오거나 이 화면을 새로 열면 다시 붙는다": 시험이 없다. `RevenueScreen.test.tsx`에 끊김 → unmount → `ready`로 다시 render해 가져오기가 도는 시험을 더한다
  - 가져오는 도중 끊김·도우미가 끝남: `:384`·`:505` 이름에 더한다
  - 새 unmount 시험의 자료: 가짜 저장소의 줄은 unmount 뒤에도 남고 모든 달이 저장돼 있으면 `planFetch`가 빈 목록을 낸다. 첫 읽기를 `E-BIT-READ-FAILED`로 끝내 달 하나를 남겨 둔다. 이 시험은 가짜 `useBridge`라 화면 쪽만 증명한다
  - 768px 문장은 수정 범위 밖 `parts.test.tsx:288`이 이미 증명한다. 그대로 둔다
  - [비트 PC 연결]은 `/claim/setup`으로 가는 링크다(`SavedNotice`). 시험은 링크의 `href`까지 본다
  - `connect-needed` 상태의 화면 글자는 '비트 PC 연결 전' 칩과 머리말 `CONNECT`이므로 시험은 그 글자를 본다
- **AC-014.7**
  - `RevenueScreen.test.tsx:1226`(`saveGroups([])`, 칩이 돌아옴)과 `GroupEditor.test.tsx:220`(`groups: []`면 제안 다섯 개와 칩) 이름에 더한다
  - 비워 저장한 뒤 [묶음 고치기]를 다시 열면 편집 화면이 제안 다섯 개와 칩인 것을 한 흐름으로 보는 시험이 없다. `RevenueScreen.test.tsx`에 더한다
  - 치료별 매출은 금액·건수가 모두 0인 묶음을 뺀다(REQ-006). 기본 자료의 코드 `MANUAL1`은 제안 규칙(`treatments.ts`)에 맞지 않아 다섯 묶음이 모두 빠지므로, 치료별 매출의 제안 묶음 이름을 보려면 `store.loadRevenue`로 `ESWT1` 같은 코드를 준다. 줄이 다섯 개인지는 시험하지 않는다

### 3. OK 기록
`docs/mockups/revenue/README.md`의 표에서 옛 글자 줄의 상태를 `바뀜(아래 줄)`로 고치고, 표 끝에 이 줄을 더한다:

```
| E-BRIDGE-BUSY 문구(다른 창이 비트 연결을 쓸 때의 카드, 청구 화면과 같이 씀). what: "비트 연결을 다른 창에서 쓰고 있어요" · fix: "비트 연결은 한 창에서만 쓸 수 있어요. 비트 연결을 쓰는 다른 창을 닫고 [다시 확인]을 눌러 주세요." · 같은 안내를 되풀이하던 청구 카드의 고정 줄은 뺌 | OK | 2026-11-02 | "다른 창으로 바꿔" |
```

### 4. 다시 연 부분 ("다른 창으로 바꿔")
1~3 가운데 AC ID와 새 시험은 이미 커밋되어 있다(e143695). 다시 할 일은 글자, OK 기록, 아래 줄 빼기뿐이다.

- `errors.test.ts:260`의 기대 글자를 새 fix로 고쳐 RED를 본 뒤 `errors.ts:79`를 고친다
- `SetupScreen.test.tsx:701`의 `toContain('다른 창을 닫았다면 [다시 확인]을 누르세요.')`를 `not.toContain`으로 바꾸고 시험 이름에 AC-009.6을 더해 RED를 본 뒤 `SetupAlert.tsx:49` 그 줄만 뺀다. 사용자가 일부러 뺀 줄이라 시험을 약하게 바꾼 것이 아니다
- 그 시험의 나머지 단언(번호·제목·[건수만 보기]·[다시 확인]으로 새로 붙기)은 그대로 둔다

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 이미 있는 시험에는 AC ID를 더한다
2. `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/errors.test.ts src/components/revenue   # 글자 변경, AC-009.6·AC-009.7·AC-014.7
npx vitest run src/components/claim "src/app/(app)/claim/page.test.tsx"   # 같은 글자를 쓰는 청구 화면
! grep -nE "비트 연결을 다른 창에서|한 창에서만 쓸 수|청구나 매출을 연|비트 연결을 쓰는 다른 창" specs/revenue/requirements.md specs/revenue/design.md specs/revenue/tasks.md   # 명세에 글자가 없다
python3 ~/.claude/harness/bin/tdd-run TASK-15 --expect green
npm run lint && npm run build && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-3-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- `src/components/revenue/*.tsx`(시험 파일 제외)·`groups/GroupEditor.tsx`·`components/claim/*`(`setup/SetupAlert.tsx`의 그 줄과 `setup/SetupScreen.test.tsx` 제외)를 고치지 마라. 이유: 동작은 이미 있고 수정 범위 밖이다. 고쳐야만 하면 `blocked`로 멈춘다
- 옛 승인 시안(`docs/mockups/ui-90/...`)을 고치지 마라. 이유: 그때 승인받은 기록이다. 새 OK는 `docs/mockups/revenue/README.md`에 적는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이 step에서 바꾸는 기대값은 `E-BRIDGE-BUSY` 글자와 `SetupScreen.test.tsx:701`의 빠진 줄뿐이다. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
