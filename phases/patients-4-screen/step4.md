# Step 4: counts-upload

> **TASK-14** 연락 남은 건수 올리기 · **REQ-614** · AC-614.1 ~ AC-614.4
> Phase 4 `patients-4-screen`(환자 화면) · Step 4 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-614에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-614.1**: 두 명단을 다 불러온 뒤에만 `contactCounts`를 upsert. 한 명단만이면 안 올림
- **AC-614.2**: 연락 표시로 건수가 바뀌면 다시 올림. 지난번과 같으면 안 보냄
- **AC-614.3**: 요청 몸통은 정수 두 칸뿐(이름·전화·차트번호·날짜 글자 없음)
- **AC-614.4**: 실패 → 명단 그대로 + `E-PATIENTS-COUNTS-SAVE` 작은 오류 줄 + [다시 올리기]

## 승인된 목업 (화면 step)

- 이 탭의 승인 목업: `docs/mockups/patients/index.html`(메인 세션이 만들어 사용자 OK를 받은 것). 이 step이 볼 부분: 건수 올리기 실패 줄(있으면). 없으면 오류 줄은 UI_GUIDE의 작은 오류 줄 모양
- 없으면 `blocked`(사유: 승인 목업 없음). 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8·11)은 탭 틀·ui-90 개편 전 것이라 따르지 않는다
- 목업 안의 환자 이름·전화·숫자는 지어낸 예시다. 화면에는 Worker가 만든 값만 그린다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-614
- `/specs/patients/design.md` — '데이터 흐름', '결정과 트레이드오프'(남은 건수 정의)
- `/specs/patients/tasks.md` — TASK-14
- 이전 step에서 만든 파일: `src/lib/storage/contactCounts.ts`(`checkContactCount`·`upsertContactCount`), `src/components/patients/usePatientsWorker.ts`(`views`·`marked`의 `counts`), `src/components/patients/PatientsScreen.tsx`, `src/workers/patients/jobs.ts`(`contactCounts`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/patients/useCountsUpload.ts`
  - `src/components/patients/useCountsUpload.test.ts`
  - `src/components/patients/PatientsScreen.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
- Tests:
  - `src/components/patients/useCountsUpload.test.ts`
  - `src/components/patients/PatientsScreen.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)
- **서버에는 정수 둘만**: 올리기는 늘 `checkContactCount`를 거친 `{followup_left, injection_left}` 새 객체만 보낸다. Worker가 준 다른 칸을 그대로 넘기지 않는다 (ADR-021)

## 작업

### 1. `useCountsUpload.ts`
```ts
export function useCountsUpload(sb: SupabaseClient, counts: ContactCount | null /* 두 명단이 다 왔을 때만 값 */): { error: string | null; retry(): void }
```
- `counts`가 `null`이면 아무것도 안 한다. 값이 지난번 올린 값과 같으면 안 보낸다. 실패 → `error = 'E-PATIENTS-COUNTS-SAVE'`, `retry`로 같은 값 다시

### 2. `PatientsScreen.tsx`
- `usePatientsWorker`의 `views.counts`(F/U·정기 주사 보기 모양이 둘 다 있을 때만)와 `marked.counts`를 `useCountsUpload`에 넘긴다. 실패 줄 + [다시 올리기]는 도구 줄 아래 작은 줄(명단은 그대로)

### 3. 시험 (가짜 Supabase: 요청 몸통 기록)
- `useCountsUpload.test.ts`(AC-614.1·614.2·614.4: null이면 안 보냄, 같은 값 두 번이면 한 번, 바뀌면 다시, 실패·다시)
- `PatientsScreen.test.tsx`(AC-614.1·614.3: 가짜 Worker가 F/U만 준 상태 → 안 올림, 둘 다 → 올림, 몸통 키가 정확히 두 개이고 값이 정수, 몸통 글자에 가짜 이름·전화·차트번호가 없음)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/patients   # AC-614.1~AC-614.4 (+ 앞 step 그대로)
npx vitest run src/lib/storage src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-614.1 ~ AC-614.4가 이 TASK의 시험과 이어져 보여야 한다

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

- 한 명단만 불러왔을 때 다른 칸을 0으로 채워 올리지 마라. 이유: 휴대폰에 틀린 수가 보인다(AC-614.1)
- 건수 몸통에 날짜·기간·도구 이름 같은 칸을 더하지 마라. 이유: 서버에는 정수 둘만(AC-614.3)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 다음 step(TASK-15 `privacy-e2e`)이 Phase 4의 마지막이다. Phase 끝 할 일은 그 step 파일에 있다
