# Step 3: messages-screen

> **TASK-13** 문자 문구 화면 · **REQ-613** · AC-613.1 ~ AC-613.6
> Phase 4 `patients-4-screen`(환자 화면) · Step 3 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-613에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-613.1**: 주사 안내·진료 안내 목록(저장 줄 없으면 기본 문구), 내원 날짜(처음 내일), 채운 글 미리 보기
- **AC-613.2**: 더하기·고치기·지우기·위·아래 → [저장] → `saveTemplates`. 이름 1~30·내용 1~2000 화면 검사
- **AC-613.3**: [문구 복사] → 채운 글 클립보드 + "복사했어요", 막히면 글을 골라 둔 채 안내. 보내기 없음
- **AC-613.4**: 저장 실패 → 값 그대로 + `E-PATIENTS-TEMPLATES-SAVE` 오류 카드 + [다시 저장]
- **AC-613.5**: 휴대폰·확장 없는 곳에서도 같은 화면
- **AC-613.6**: 문구 읽기 실패(`E-PATIENTS-TEMPLATES-READ`) → 오류 카드 + [다시 불러오기]만, 목록·고치기·[저장]·[문구 복사]는 읽기가 될 때까지 없음(기본 문구를 `before = []`로 저장해 서버 줄이 겹치는 일을 막음)

## 승인된 목업 (화면 step)

- 이 탭의 승인 목업: `docs/mockups/patients/index.html`(메인 세션이 만들어 사용자 OK를 받은 것). 이 step이 볼 부분: 문자 문구 도구(목록·편집·순서·날짜·미리 보기·저장·저장 실패·복사), PC와 휴대폰
- 없으면 `blocked`(사유: 승인 목업 없음). 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8·11)은 탭 틀·ui-90 개편 전 것이라 따르지 않는다
- 목업 안의 환자 이름·전화·숫자는 지어낸 예시다. 화면에는 Worker가 만든 값만 그린다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-613
- `/specs/patients/design.md` — '화면', '결정과 트레이드오프'(문자 문구 종류·휴대폰에서 연다)
- `/specs/patients/tasks.md` — TASK-13
- `/docs/UI_GUIDE.md` '입력'·'오류 카드·확인 창'
- `/src/components/common/ErrorCard.tsx`
- 이전 step에서 만든 파일: `src/lib/patientMessages/fill.ts`·`defaults.ts`, `src/lib/storage/messageTemplates.ts`(`readTemplates`·`saveTemplates`·`checkTemplate`), `src/components/patients/CopyButton.tsx`, `src/components/patients/PatientsEntry.tsx`·`PatientsScreen.tsx`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/patients/MessagesTool.tsx`
  - `src/components/patients/MessagesTool.test.tsx`
  - `src/components/patients/useTemplates.ts`
  - `src/components/patients/useTemplates.test.ts`
  - `src/components/patients/PatientsScreen.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/PatientsEntry.tsx`
  - `src/components/patients/PatientsEntry.test.tsx`
- Tests:
  - `src/components/patients/MessagesTool.test.tsx`
  - `src/components/patients/useTemplates.test.ts`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/PatientsEntry.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인 목업대로**: 이 탭의 승인 목업 `docs/mockups/patients/index.html`(PC·휴대폰, 도구 셋, 상태)과 같은 배치·문구로 만든다. 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다. 목업 파일이 없거나 승인 표시(목업 안 '승인' 줄 또는 `docs/mockups/patients/README.md`)가 없으면 `blocked`(사유: 승인 목업 없음)로 멈춘다 (CLAUDE.md CRITICAL)
- **모양 규칙**: `docs/UI_GUIDE.md` '앱 화면'(토큰은 `src/app/globals.css`, 반복 모양은 `src/components/ui/classes.ts`의 `ds`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다. 좋고 나쁨을 색만으로 보이지 않는다
- **환자 줄 울타리**: 환자 줄(이름·전화·차트번호)은 `src/components/patients/rows/`의 부품이 props로만 그린다. 그 폴더는 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth`를 못 쓴다(TASK-1). 화면은 조각·보낼 글자를 받지 않는다(Worker가 만든 보기 모양·복사 글·오류 번호만)
- **브라우저 저장소 금지**: 명단·연락 표시를 `localStorage` 등에 두지 않는다. 연락 표시는 Worker → 도우미 `contact.dat`로만
- 화면 확인은 jsdom 시험으로 한다(`// @vitest-environment jsdom`). 실제 화면 캡처는 Phase 끝에 메인 세션이 한다
- **문구는 서버가 원본**: 읽고 쓰기는 `lib/storage/messageTemplates.ts`로만. 저장 실패면 화면이 고친 값을 들고 [다시 저장]을 보인다. 브라우저 저장소에 따로 두지 않는다 (ADR-021, ARCHITECTURE '상태 관리')
- **날짜는 한 곳**: 날짜 계산은 `src/lib/analytics/dates.ts`(한국 날짜, `YYYY-MM-DD`). '오늘'은 함수 인자로 받는다(`new Date()`를 계산 안에서 부르지 않는다). 시험은 `TZ=Asia/Seoul`에서 돈다 (CLAUDE.md)

## 작업

### 1. 문구 상태 (`useTemplates.ts`)
```ts
export function useTemplates(sb: SupabaseClient): {
  state: 'loading' | 'ready' | 'load-failed'
  saved: MessageTemplate[]                 // 서버에 있는 것
  draft: TemplateDraft[]                   // 화면에서 고치는 것(처음: saved, 읽기가 됐고 줄이 없을 때만 DEFAULT_TEMPLATES). load-failed이면 []
  usingDefaults: boolean
  edit(i: number, patch: Partial<TemplateDraft>): void; add(kind: TemplateKind): void; remove(i: number): void; move(i: number, dir: -1 | 1): void
  save(): Promise<void>                    // state가 'ready'일 때만(읽기 실패 뒤에는 아무것도 보내지 않는다). checkTemplate 통과해야 보냄. 실패 → saveError = 'E-PATIENTS-TEMPLATES-SAVE', draft 그대로
  loadError: string | null; reload(): void  // 읽기 실패 → loadError = 'E-PATIENTS-TEMPLATES-READ'
  saveError: string | null; invalid: { index: number; field: 'name' | 'body' }[]
}
```

### 2. 화면 (`MessagesTool.tsx`)
- 목록(종류 칩·이름·내용 입력), [문구 더하기](종류 고르기), 지우기, 위·아래, [저장](바뀐 것이 있을 때만), 내원 날짜(처음 `defaultSendDate(today)`), 미리 보기(`fillTemplate`), [문구 복사](`CopyButton`)
- 기본 문구를 쓰는 중이면 원본 안내(`DEFAULT_TEMPLATE_NOTE`, "사용 전 병원명·연락처·진료시간을 수정하세요")와 `[*1*]`·`[*2*]` 설명(받는 분 이름·부위)
- 이름 1~30자·내용 1~2000자 검사 결과를 칸 옆 글자로. 저장 실패 → `ErrorCard`(E-PATIENTS-TEMPLATES-SAVE) + [다시 저장]
- 읽기 실패(`load-failed`, AC-613.6) → `ErrorCard`(E-PATIENTS-TEMPLATES-READ) + [다시 불러오기]만. 목록·고치기·[저장]·[문구 복사]·미리 보기를 그리지 않는다. 기본 문구는 읽기가 되고 줄이 0개일 때만 쓴다

### 3. 자리 넣기
- `PatientsScreen.tsx`: 도구 자리 `messages`에 `MessagesTool`
- `PatientsEntry.tsx`: 확장 없는 곳·휴대폰·연결 안 됨·busy에서도 `messages` 도구는 `MessagesTool`(AC-613.5)

### 4. 시험 (jsdom, 가짜 Supabase)
- `useTemplates.test.ts`(기본값은 읽기 성공 + 0줄일 때만·읽기 실패면 draft 없음이고 save가 아무것도 안 보냄·다시 불러오기·더하기·지우기·순서·검사·저장 실패 값 유지), `MessagesTool.test.tsx`(AC-613.1~613.4·613.6: 미리 보기 날짜 줄, 복사 됨·막힘, 읽기 실패 → 오류 카드만이고 [저장]·[문구 복사]가 없음), `PatientsEntry.test.tsx`(AC-613.5: 상태마다 문자 문구 도구가 열림), `PatientsScreen.test.tsx`

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/patients   # AC-613.1~AC-613.5 (+ 앞 step 그대로)
python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-613.1 ~ AC-613.6가 이 TASK의 시험과 이어져 보여야 한다

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

- 문구 미리 보기에 환자 이름·전화를 넣지 마라. 이유: 문자 문구 도구는 환자 정보 없이 어디서나 연다(AC-613.5)
- 저장 실패에서 고친 글을 지우거나 기본값으로 되돌리지 마라. 이유: 값을 그대로 두고 [다시 저장](CLAUDE.md·ARCHITECTURE)
- 문자 보내기 기능을 만들지 마라. 이유: 복사만 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
