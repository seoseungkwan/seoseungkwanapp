# Step 2: recall-screen

> **TASK-12** 정기 주사 문자 명단 화면 · **REQ-612** · AC-612.1 ~ AC-612.4
> Phase 4 `patients-4-screen`(환자 화면) · Step 2 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-612에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-612.1**: store.load → 필요한 달만 contact.targets(injection) → 합치기 → store.save → 명단: 종류·이름·전화·마지막 주사(요일)·다음 예정일(요일)·상태·근거·연락함. 기간 처음 오늘~30일 뒤, 지난 예정 포함 처음 켬
- **AC-612.2**: 쌓인 기록 건수·시작 날짜, 짧은 규칙이 있으면 "그보다 오래전에 맞은 분은 아직 명단에 없어요", `coverage.trimmed` > 0이면 "기록이 많아 오래된 N건을 뺐어요", 처음 읽기 달 진행
- **AC-612.3**: [연락함]·[명단 복사]·[번호 복사](번호 없는 수 함께)·[문구 복사](주사 안내)
- **AC-612.4**: 빈 상태·불러오는 중·실패(기록 저장 실패 포함) + [다시 불러오기]

## 승인된 목업 (화면 step)

- 이 탭의 승인 목업: `docs/mockups/patients/index.html`(메인 세션이 만들어 사용자 OK를 받은 것). 이 step이 볼 부분: 정기 주사 문자 명단 도구(기간·지난 예정·표·쌓인 기록 안내·처음 읽기 진행·복사 단추·연락함·빈 상태)
- 없으면 `blocked`(사유: 승인 목업 없음). 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8·11)은 탭 틀·ui-90 개편 전 것이라 따르지 않는다
- 목업 안의 환자 이름·전화·숫자는 지어낸 예시다. 화면에는 Worker가 만든 값만 그린다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-612
- `/specs/patients/design.md` — '계산 모양'(`RecallRow`·`RecallCoverage`), 'Worker 메시지 약속', '결정과 트레이드오프'(쌓기·처음 읽는 기간)
- `/specs/patients/tasks.md` — TASK-12
- 이전 step에서 만든 파일: `src/components/patients/FollowupTool.tsx`·`rows/FollowupRows.tsx`·`periods.ts`(같은 방식으로), `src/components/patients/CopyButton.tsx`, `src/components/patients/PatientsScreen.tsx`·`usePatientsWorker.ts`, `src/workers/patients/jobs.ts`(`filterRecall`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/patients/RecallTool.tsx`
  - `src/components/patients/RecallTool.test.tsx`
  - `src/components/patients/rows/RecallRows.tsx`
  - `src/components/patients/rows/RecallRows.test.tsx`
  - `src/components/patients/PatientsScreen.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
- Tests:
  - `src/components/patients/RecallTool.test.tsx`
  - `src/components/patients/rows/RecallRows.test.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인 목업대로**: 이 탭의 승인 목업 `docs/mockups/patients/index.html`(PC·휴대폰, 도구 셋, 상태)과 같은 배치·문구로 만든다. 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다. 목업 파일이 없거나 승인 표시(목업 안 '승인' 줄 또는 `docs/mockups/patients/README.md`)가 없으면 `blocked`(사유: 승인 목업 없음)로 멈춘다 (CLAUDE.md CRITICAL)
- **모양 규칙**: `docs/UI_GUIDE.md` '앱 화면'(토큰은 `src/app/globals.css`, 반복 모양은 `src/components/ui/classes.ts`의 `ds`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다. 좋고 나쁨을 색만으로 보이지 않는다
- **환자 줄 울타리**: 환자 줄(이름·전화·차트번호)은 `src/components/patients/rows/`의 부품이 props로만 그린다. 그 폴더는 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth`를 못 쓴다(TASK-1). 화면은 조각·보낼 글자를 받지 않는다(Worker가 만든 보기 모양·복사 글·오류 번호만)
- **브라우저 저장소 금지**: 명단·연락 표시를 `localStorage` 등에 두지 않는다. 연락 표시는 Worker → 도우미 `contact.dat`로만
- 화면 확인은 jsdom 시험으로 한다(`// @vitest-environment jsdom`). 실제 화면 캡처는 Phase 끝에 메인 세션이 한다
- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 정기 주사 도구 (`RecallTool.tsx`)
- 고르기: 다음 예정일 기간(처음 오늘 ~ 오늘+30일, 직접 바꾸기), 지난 예정 포함(처음 켬) → Worker `filter` → 거른 줄·복사 글(`list`·`phones`·`missingPhones`)
- 쌓인 기록 안내(`RecallView.coverage`): "쌓인 기록 N건 (YYYY-MM-DD부터)", `short`가 있으면 규칙 이름·간격과 "그보다 오래전에 맞은 분은 아직 명단에 없어요"(목업 문구), `trimmed` > 0이면 한 줄 "기록이 많아 오래된 N건을 뺐어요"
- 처음 읽기(쌓인 기록 없음)는 `usePatientsWorker`의 진행을 달 단위("n/전체 달")로 보인다
- [명단 복사]·[번호 복사](결과 줄에 "번호 없음 N명"을 함께)·[문구 복사](주사 안내 첫 문구, 날짜는 `defaultSendDate(today)`)·[연락함](F/U와 같은 흐름)
- `views`에 저장 실패 `code`가 함께 오면 명단은 보이고 "기록을 이 PC에 저장하지 못했어요" 오류 줄 + [다시 불러오기]

### 2. 환자 줄 (`rows/RecallRows.tsx`, 울타리 안)
- props만. 칸: 연락함·종류·이름·전화·마지막 주사(요일)·다음 예정일(요일)·상태("지남 N일"·"오늘"·"N일 남음" 글자 그대로)·근거 문구

### 3. `PatientsScreen.tsx`: 도구 자리 `recall`에 `RecallTool`

### 4. 시험 (jsdom, 가짜 Worker)
- `RecallTool.test.tsx`(AC-612.1~612.4: 처음 값, 고르기 → `filter` 메시지, 안내 글, 처음 읽기 진행, 복사 셋, 저장 실패 줄), `rows/RecallRows.test.tsx`, `PatientsScreen.test.tsx`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/patients   # AC-612.1~AC-612.4 (+ 앞 step 그대로)
python3 ~/.claude/harness/bin/tdd-run TASK-12 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-612.1 ~ AC-612.4가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-4-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 약제코드·간격 설정 화면을 만들지 마라. 이유: 이번 범위 밖(원본 기본값 고정)
- 쌓인 기록을 화면 쪽 메모리 밖(저장소·주소)에 두지 마라. 이유: 기록은 Worker → 도우미 `contact.dat`로만
- 상태 글자를 색으로만 바꾸지 마라. 이유: 색만으로 좋고 나쁨을 보이지 않는다(UI_GUIDE)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
