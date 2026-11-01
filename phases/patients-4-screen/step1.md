# Step 1: followup-screen

> **TASK-11** F/U 명단 화면 · **REQ-611** · AC-611.1 ~ AC-611.5
> Phase 4 `patients-4-screen`(환자 화면) · Step 1 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-11 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-611에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-611.1**: 연결된 PC에서 F/U 명단: 이름·전화·마지막 진료·다음 날짜(요일)·구분·근거·연락함. 기간(처음 내일·이번 주·다음 주·직접), 조건부 포함, 지난 예정 포함, 구분. 날짜 미정 명단 따로
- **AC-611.2**: 대상 없음·불러오는 중·실패(오류 번호 + [다시 불러오기]), 지어낸 줄 없음
- **AC-611.3**: [연락함] → Worker `mark` → 됨이면 '연락함', 실패면 그대로 + 오류 번호 줄. 브라우저 저장소 안 씀
- **AC-611.4**: [명단 복사](날짜 머리 줄 선택)·[문구 복사](주사 안내·진료 안내, 고른 날짜) → 클립보드 + "복사했어요". 문자 안 보냄
- **AC-611.5**: 환자 줄은 `components/patients/rows`가 props로만

## 승인된 목업 (화면 step)

- 이 탭의 승인 목업: `docs/mockups/patients/index.html`(메인 세션이 만들어 사용자 OK를 받은 것). 이 step이 볼 부분: F/U 명단 도구(기간·고르기·표·날짜 미정·복사 단추·연락함·빈 상태)
- 없으면 `blocked`(사유: 승인 목업 없음). 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8·11)은 탭 틀·ui-90 개편 전 것이라 따르지 않는다
- 목업 안의 환자 이름·전화·숫자는 지어낸 예시다. 화면에는 Worker가 만든 값만 그린다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-611
- `/specs/patients/design.md` — '계산 모양'(`FollowupRow`), 'Worker 메시지 약속'(`filter`·`mark`), '화면'
- `/specs/patients/tasks.md` — TASK-11
- `/docs/UI_GUIDE.md` '표'·'단추'·'입력'·'빈 상태'·'휴대폰'
- `/src/components/auth/CopyStatus.tsx`(`useCopy` — 복사 결과 줄 방식)
- 이전 step에서 만든 파일: `src/components/patients/PatientsScreen.tsx`·`usePatientsWorker.ts`, `src/workers/patients/jobs.ts`(`filterFollowup` 결과 모양), `src/lib/patientMessages/fill.ts`·`defaults.ts`, `src/lib/storage/messageTemplates.ts`(`readTemplates`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-11)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/patients/FollowupTool.tsx`
  - `src/components/patients/FollowupTool.test.tsx`
  - `src/components/patients/rows/FollowupRows.tsx`
  - `src/components/patients/rows/FollowupRows.test.tsx`
  - `src/components/patients/periods.ts`
  - `src/components/patients/periods.test.ts`
  - `src/components/patients/PatientsScreen.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/CopyButton.tsx`
  - `src/components/patients/CopyButton.test.tsx`
- Tests:
  - `src/components/patients/FollowupTool.test.tsx`
  - `src/components/patients/rows/FollowupRows.test.tsx`
  - `src/components/patients/periods.test.ts`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/CopyButton.test.tsx`
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

### 1. 기간 (`periods.ts`)
```ts
export type PeriodPreset = 'tomorrow' | 'thisWeek' | 'nextWeek' | 'custom'
export function presetRange(p: Exclude<PeriodPreset, 'custom'>, today: string): { from: string; to: string }   // 주는 월~일(dates.ts weekStartOf)
```

### 2. 복사 단추 (`components/patients/CopyButton.tsx`)
```ts
export function CopyButton(props: { text: string | (() => string); label: string; disabled?: boolean }): JSX.Element   // navigator.clipboard.writeText → "복사했어요" / 실패 "복사하지 못했어요. …"(role="status")
```
- 기능 폴더(`components/patients/`)에 둔다(규칙 C6). 결과 줄 방식은 `useCopy`와 같다

### 3. F/U 도구 (`FollowupTool.tsx`)
- `PatientsScreen`이 넘기는 Worker 연결로 `filter`를 보내 거른 줄·날짜 미정 줄·복사 글을 받는다(화면은 거르지 않는다). 고르기: 기간(처음 `tomorrow`), 조건부 포함(처음 끔), 지난 예정 포함(처음 끔), 구분(전체·주사·F/U)
- [명단 복사]: 날짜 머리 줄 켜기·끄기 → `copy.list`/`copy.listWithDate`. [문구 복사]: 주사 안내·진료 안내 중 고르기 → `readTemplates`(읽기는 됐고 줄이 없을 때만 `DEFAULT_TEMPLATES`)의 그 종류 첫 문구를 `fillTemplate(body, 기간 시작일)`로. 문구 읽기가 실패하면(`E-PATIENTS-TEMPLATES-READ`) [문구 복사] 자리에 오류 번호와 [다시 불러오기]만, 기본 문구로 대신하지 않는다
- [연락함]: `mark` 보냄 → `marked`의 `ok`로 줄을 바꾸거나 오류 줄. 단추는 막지 않는다 — 여러 줄을 잇따라 눌러도 Worker가 저장을 차례로 보내고 최신 표시로 글자를 만든다(AC-604.4). 답을 기다리는 줄에는 '저장 중' 글자
- 빈 상태·불러오는 중·실패는 목업 문구. 실패 오류 카드는 `errorInfo(code)`(모르는 번호면 번호만)

### 4. 환자 줄 (`rows/FollowupRows.tsx`, 울타리 안)
- props: `rows: FollowupRow[]`, `onMark(key, on)`, `busyKey`. 칸: 연락함·이름·전화·마지막 진료·다음 날짜(요일)·구분·근거 문구(길면 줄임 + 전체는 `title`). 지난 예정은 글자로도 표시(색만 쓰지 않음)
- 휴대폰 폭에서는 목업의 휴대폰 줄 모양(연결된 PC가 좁을 때)

### 5. `PatientsScreen.tsx`
- 도구 자리 `followup`에 `FollowupTool`을 넣는다

### 6. 시험 (jsdom, 가짜 Worker: `filter`·`mark` 답을 정해 둠, 가짜 clipboard)
- `FollowupTool.test.tsx`(AC-611.1~611.4), `rows/FollowupRows.test.tsx`(AC-611.5: props만, 칸·지난 예정 글자), `periods.test.ts`(내일·이번 주·다음 주, 일요일·월말), `CopyButton.test.tsx`(됨·실패), `PatientsScreen.test.tsx`(도구 자리)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/patients src/components/patients/CopyButton.test.tsx   # AC-611.1~AC-611.5
npx vitest run src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-11 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-611.1 ~ AC-611.5가 이 TASK의 시험과 이어져 보여야 한다

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

- 화면에서 명단을 직접 거르거나 복사 글을 만들지 마라. 이유: 원본과 같은 결과를 Worker 한 곳에서 만든다(design.md)
- 연락 표시를 화면 상태나 저장소에만 두고 도우미 저장을 건너뛰지 마라. 이유: 다시 열면 사라진다(AC-611.3)
- 문자 보내기 단추·외부 문자 서비스 연결을 만들지 마라. 이유: 복사만 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
