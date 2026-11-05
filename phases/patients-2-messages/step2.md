# Step 2: patients-storage

> **TASK-7** 문자 문구 · 남은 건수 저장 (브라우저 → Supabase) · 오류 번호 · **REQ-609** · AC-609.1 ~ AC-609.5
> Phase 2 `patients-2-messages`(문자 문구 · 서버 표) · Step 2 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-7 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-609에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-609.1**: `readTemplates(sb)`: sort_order 순서, 줄 없으면 `[]`, 읽기 실패면 `[]`로 바꾸지 않고 `E-PATIENTS-TEMPLATES-READ`
- **AC-609.2**: `saveTemplates(sb, before, after)`: 더함 insert·바뀜 update·빠짐 delete·순서 sort_order. 몸통에 hospital_id·updated_at(insert는 id도) 없음. 실패 → `E-PATIENTS-TEMPLATES-SAVE`
- **AC-609.3**: `checkContactCount`·`upsertContactCount`: 0~100000 정수 두 칸만(다른 칸·글자·음수·소수 거절), 몸통도 두 칸뿐. 실패 → `E-PATIENTS-COUNTS-SAVE`
- **AC-609.4**: `readContactCount(sb)`: `{followup_left, injection_left, updated_at}` 또는 줄 없으면 `null`, 읽기 실패면 `null`로 바꾸지 않고 `E-PATIENTS-COUNTS-READ`
- **AC-609.5**: `lib/errors.ts`에 `E-PATIENTS-TEMPLATES-READ`·`-TEMPLATES-SAVE`·`-COUNTS-READ`·`-COUNTS-SAVE`·`E-PATIENTS-SOURCE` 문구. 다른 브랜치 몫 번호는 더하지 않음(C3)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-609
- `/specs/patients/design.md` — '서버 표', '결정과 트레이드오프'의 오류 번호
- `/specs/patients/tasks.md` — TASK-7
- `/src/lib/supabase/browser.ts`(클라이언트 만들기), `/src/lib/auth/signup.ts`(브라우저에서 Supabase에 쓰고 오류 번호로 바꾸는 방식)
- `/src/lib/errors.ts`·`errors.test.ts`·`/src/types/errors.ts`
- `/specs/precheck/design.md` 4-5(오류 번호 목록, 읽기만)
- 이전 step에서 만든 파일: `supabase/migrations/20261101000300_patients.sql`(칸·제약), `src/lib/patientMessages/defaults.ts`(`TemplateKind`), `src/types/patients.ts`(`ContactCount`)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-7)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/storage/messageTemplates.ts`
  - `src/lib/storage/messageTemplates.test.ts`
  - `src/lib/storage/contactCounts.ts`
  - `src/lib/storage/contactCounts.test.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
  - `src/types/errors.ts`
  - `src/types/patients.ts`
- Tests:
  - `src/lib/storage/messageTemplates.test.ts`
  - `src/lib/storage/contactCounts.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)
- **오류 문구는 한 곳**: 문구는 `src/lib/errors.ts`에만 '무엇이 · 어떻게 고치나'로 쓴다. 오류 내용(DB 메시지)을 화면·응답에 그대로 보이지 않는다 (CLAUDE.md)
- **서버 경로를 만들지 않는다**: 브라우저 Supabase 클라이언트 + RLS로만 읽고 쓴다(`app/api/`에 아무것도 더하지 않는다, ADR-004)

## 작업

### 1. 문자 문구 (`src/lib/storage/messageTemplates.ts`)
```ts
export type MessageTemplate = { id: string; kind: TemplateKind; name: string; body: string; sort_order: number }
export type TemplateDraft = { id?: string; kind: TemplateKind; name: string; body: string }   // 화면 순서가 곧 sort_order
export function checkTemplate(t: TemplateDraft): 'name' | 'body' | 'kind' | null              // 이름 1~30자·내용 1~2000자(앞뒤 공백 빼고 0자면 안 됨)·kind
export async function readTemplates(sb: SupabaseClient): Promise<MessageTemplate[]>         // select id, kind, name, body, sort_order order by sort_order, kind. 오류 → E-PATIENTS-TEMPLATES-READ(빈 목록으로 바꾸지 않는다)
export async function saveTemplates(sb: SupabaseClient, before: MessageTemplate[], after: TemplateDraft[]): Promise<MessageTemplate[]>   // 끝나면 다시 읽어 돌려준다
```
- `after`의 차례가 `sort_order`(0부터, 99까지. 100개 넘으면 `E-PATIENTS-TEMPLATES-SAVE`). 바뀐 칸이 있는 줄만 update. `before`에 있고 `after`에 없는 `id`는 delete
- 하나라도 실패하면 `BridgeError`가 아니라 `PatientsStorageError('E-PATIENTS-TEMPLATES-SAVE')`(이 파일에 만든다)를 던진다
- `saveTemplates`의 `before`는 늘 성공한 `readTemplates` 결과여야 한다(함수 주석에 적는다). 읽기에 실패한 채 기본 문구를 `before = []`로 저장하면 서버 줄이 겹친다 — 화면(TASK-13)이 막는다

### 2. 남은 건수 (`src/lib/storage/contactCounts.ts`)
```ts
export function checkContactCount(row: unknown): ContactCount                         // 정확히 두 칸, Number.isInteger, 0~100000. 아니면 E-PATIENTS-COUNTS-SAVE
export async function upsertContactCount(sb: SupabaseClient, row: ContactCount): Promise<void>   // .from('contact_counts').upsert({ followup_left, injection_left }, { onConflict: 'hospital_id' })
export async function readContactCount(sb: SupabaseClient): Promise<{ followup_left: number; injection_left: number; updated_at: string } | null>   // maybeSingle. 줄 없음 → null, 오류 → E-PATIENTS-COUNTS-READ
```
- 보내기 전에 늘 `checkContactCount`를 거친다(넘어온 객체에 다른 칸이 있어도 두 칸만 새 객체로)

### 3. 오류 번호 (`src/lib/errors.ts`·`src/types/errors.ts`, cross-branch 규칙 C3: `E-PATIENTS-*`만 더한다)
- `E-PATIENTS-TEMPLATES-READ`(문자 문구를 불러오지 못했어요 · 잠시 뒤 [다시 불러오기]를 눌러 주세요. 계속되면 오류 번호와 함께 문의)
- `E-PATIENTS-TEMPLATES-SAVE`(문자 문구를 저장하지 못했어요 · 고친 글은 그대로 있어요. 잠시 뒤 [다시 저장]을 눌러 주세요)
- `E-PATIENTS-COUNTS-READ`(남은 건수를 불러오지 못했어요 · 잠시 뒤 [다시 불러오기]를 눌러 주세요)
- `E-PATIENTS-COUNTS-SAVE`(남은 건수를 올리지 못했어요 · 명단은 그대로 쓸 수 있어요. [다시 올리기]를 눌러 주세요)
- `E-PATIENTS-SOURCE`(비트에서 읽은 명단 자료에 맞지 않는 줄이 있어요 · 비트 통계 화면의 칸 설정을 확인하고 [다시 불러오기]. 계속되면 오류 번호와 함께 문의)
- 문구 말투는 기존 항목과 같게 다듬는다. `E-SETTINGS-FAILED`·`E-COUNTS-FAILED`·`E-BIT-EXPORT-FAILED`처럼 다른 브랜치(precheck)가 더할 번호는 더하지 않는다

### 4. 시험 (가짜 Supabase 클라이언트: 부른 표·칸·몸통을 기록)
- `messageTemplates.test.ts`(AC-609.1·609.2): 순서, 빈 목록, 읽기 오류 → `E-PATIENTS-TEMPLATES-READ`(빈 목록이 아님), 더하기·고치기·지우기·순서 바꾸기의 요청, 몸통에 `hospital_id`·`updated_at`·(insert) `id` 없음, 실패 → `E-PATIENTS-TEMPLATES-SAVE`, `checkTemplate` 경계(0·1·30·31자, 2000·2001자)
- `contactCounts.test.ts`(AC-609.3·609.4): 통과·거절 사례(칸 더 있음·글자·-1·100001·1.5·NaN), 몸통이 두 칸뿐, 올리기 실패, 줄 없음 → `null`, 읽기 오류 → `E-PATIENTS-COUNTS-READ`(`null`이 아님)
- `errors.test.ts`(AC-609.5): 다섯 번호의 `what`·`fix`가 있다(기존 시험 방식대로)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/storage/messageTemplates.test.ts src/lib/storage/contactCounts.test.ts src/lib/errors.test.ts   # AC-609.1~AC-609.5
python3 ~/.claude/harness/bin/tdd-run TASK-7 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-609.1 ~ AC-609.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-2-messages/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 건수 몸통에 날짜·이름·메모 같은 칸을 더하지 마라. 이유: 서버에는 정수 둘만(ADR-021)
- `localStorage`에 문구를 따로 두지 마라. 이유: 문구의 원본은 서버다(ADR-021). 저장 실패면 화면이 값을 들고 [다시 저장]
- `src/lib/errors.ts`의 기존 문구를 바꾸지 마라. 이유: 다른 화면 시험이 그 글자를 본다. 더하기만 한다
- `E-PATIENTS-` 밖의 새 번호를 더하지 마라. 이유: 병렬 브랜치가 같은 번호를 더하면 합칠 때 부딪힌다(규칙 C3)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
