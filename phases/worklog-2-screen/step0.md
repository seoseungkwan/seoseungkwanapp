# Step 0: autosave

> **TASK-6** 자동 저장 제어 · **REQ-006** · AC-006.1 ~ AC-006.9
> Phase 2 `worklog-2-screen` · Step 0 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-6 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-006에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-006.1**: 마지막 바뀜 뒤 800ms 조용하면 그날 최신 값으로 한 번 저장
- **AC-006.2**: 저장 중 또 바뀌면 끝난 뒤 최신 값으로 한 번 더. 같은 날 저장은 동시에 하나
- **AC-006.3**: 성공 → `saved` + 저장 시각
- **AC-006.4**: `failed` → 2초·5초·15초 뒤 다시, 그래도 실패면 `failed`로 멈춤. `retry()`는 바로
- **AC-006.5**: `offline` → `offline`, 15초마다 다시, `online()`이면 바로
- **AC-006.6**: `private` → `blocked`(칸 이름), 그날 값이 다시 바뀔 때까지 안 함
- **AC-006.7**: `flush()` → 기다리지 않고 바로 시작
- **AC-006.8**: 날짜마다 따로, 전체 상태 = 가장 나쁜 것(failed > blocked > offline > saving > saved > idle), `hasUnsaved()`
- **AC-006.9**: `dispose()` → 타이머 모두 멈춤

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-006
- `/specs/worklog/design.md` — 10절(자동 저장 — 인터페이스·상태 표), 9절(오류 종류)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/lib/storage/worklogDays.ts` — `WorklogStorageError`·`kind` (Phase 1 Step 4)
- `/src/types/worklog.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-6)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/worklog/autosave.ts`
  - `src/lib/worklog/autosave.test.ts`
- Tests:
  - `src/lib/worklog/autosave.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **저장 안 된 값을 조용히 잃지 않는다**(사용자 결정). 어떤 실패도 상태로 드러나고 `hasUnsaved()`가 참이다
- 순수 TS: React·supabase·DOM 이벤트를 쓰지 않는다. `save`·타이머·`now`는 주입한다(화면이 `saveWorklogDay`를 묶어 넣는다)
- 브라우저 저장소에 임시 사본을 두지 않는다(`plan.md` §10, design.md 10절)

## 작업

design.md 10절의 `createAutosave(options)`를 만든다.
- 날짜마다 `{ state, latest: WorklogDay, dirty: boolean, attempt, timer, blockedField }`
- `change(ymd, day)`: `latest = day`, `dirty = true`. saving이면 값만 두고 끝(끝나면 다시). 아니면 800ms 타이머를 다시 건다(blocked도 풀린다)
- 저장: `dirty = false`로 표시하고 `save(ymd, latest)`. 끝나면 `dirty`면 바로 다시, 아니면 saved
- 실패: `err instanceof WorklogStorageError`로 `kind`를 본다. 모르는 오류는 `failed`로 다룬다
- `retryDelaysMs` 다 쓰면 failed(타이머 없음). `retry()`는 failed·offline·pending 날짜를 바로 저장
- `onChange(snapshot)`: 전체 상태가 바뀔 때마다 부른다(화면이 그린다)
- 시험(`vi.useFakeTimers()`): 묶기(700ms에 또 바뀌면 그 뒤 800ms), 저장 중 바뀜 → 두 번째 저장 값이 최신, 동시 저장 없음(가짜 `save`의 대기 약속으로 확인), 실패 세 번 뒤 멈춤과 그 사이 시각(2000·5000·15000), offline 15초 반복과 `online()`, blocked는 시간이 지나도 저장 안 함 → `change` 뒤 저장, 날짜 둘(하나 failed·하나 saved → 전체 failed), `dispose()` 뒤 타이머 0개(`vi.getTimerCount()`)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/worklog/autosave.test.ts   # AC-006.1~AC-006.9
python3 ~/.claude/harness/bin/tdd-run TASK-6 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-006.1 ~ AC-006.9가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-2-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 저장을 무한히 빠르게 다시 하지 마라(바로 다시 → 실패 → 바로 다시). 이유: 무료 Supabase 요청을 태우고 화면이 멈춘다. 간격은 정해 둔 2·5·15초와 15초뿐이다
- 여러 날짜 저장을 하나로 묶어 보내지 마라. 이유: 저장 단위는 하루 한 줄 upsert다(design.md 16절)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
