# Step 0: tab-entry

> **TASK-10** 환자 탭 입구 · 도구 단추 줄 · 휴대폰은 건수만 · 준비 중에서 빼기 · **REQ-610** · AC-610.1 ~ AC-610.5
> Phase 4 `patients-4-screen`(환자 화면) · Step 0 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-10 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-610에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-610.1**: `/patients`가 환자 탭. 탭 [환자]는 `href: '/patients'`·`ready: true`, 준비 중 목록·대시보드 목차의 '준비 중'에서 빠짐(목차 `connect-first`). 탭 이름 "환자"
- **AC-610.2**: 도구 단추 줄 [F/U 명단]·[정기 주사 문자 명단]·[문자 문구], 고른 것에 `aria-current`, 주소 `?tool=followup|recall|messages`, 없거나 모르면 F/U
- **AC-610.3**: 확장 없는 브라우저·휴대폰: 명단 도구 자리에 남은 건수(두 수·바뀐 시각)만, 줄 없으면 "자료 없음" + "비트 PC에서 환자 탭을 열면 건수가 생겨요". 읽기 실패(`E-PATIENTS-COUNTS-READ`)는 '자료 없음'과 다르게 오류 카드 + [다시 불러오기]. 문자 문구 도구는 그대로
- **AC-610.4**: 확장은 있는데 도우미 없음·업데이트·끊김: 비트 PC 연결 안내 + [비트 PC 연결](`/claim/setup`). busy: 안내 + [건수만 보기]
- **AC-610.5**: 주소·화면 제목·탭 이름에 이름·전화·차트번호 없음(주소에는 도구 이름만)

## 승인된 목업 (화면 step)

- 이 탭의 승인 목업: `docs/mockups/patients/index.html`(메인 세션이 만들어 사용자 OK를 받은 것). 이 step이 볼 부분: 도구 단추 줄, PC 명단 도구의 불러오는 중·오류, 휴대폰·확장 없음의 건수만 화면, 연결 안 됨·다른 창 작업 중
- 없으면 `blocked`(사유: 승인 목업 없음). 옛 precheck 목업(https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj 화면 8·11)은 탭 틀·ui-90 개편 전 것이라 따르지 않는다
- 목업 안의 환자 이름·전화·숫자는 지어낸 예시다. 화면에는 Worker가 만든 값만 그린다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-610
- `/specs/patients/design.md` — '화면', '데이터 흐름', '결정과 트레이드오프'(도구는 주소로·휴대폰에서 문자 문구·공용 부품), '다른 작업과 겹치는 파일'
- `/specs/patients/tasks.md` — TASK-10
- `/docs/UI_GUIDE.md` '앱 틀'·'빈 상태'·'휴대폰'·'문구'
- `/src/components/claim/setup/ClaimEntry.tsx`(연결 상태로 화면 고르기·확장 없는 곳·busy 카드 — 같은 방식으로), `/src/components/claim/useBridge.ts`(`useBridge({ worker })`)
- `/src/components/shell/menu.ts`·`shell.test.tsx`, `/src/components/common/notReadyFeatures.ts`(+시험), `/src/components/dashboard/briefing/features.ts`(+시험), `/src/app/(app)/notReadyPages.test.tsx`·`tabFrame.test.tsx`, `/src/app/titles.test.tsx`·`notFound.test.tsx`, `/src/app/(app)/claim/page.tsx`
- 이전 step에서 만든 파일: `src/workers/patients.worker.ts`·`patients/handler.ts`(메시지 약속), `src/lib/storage/contactCounts.ts`(`readContactCount`), `src/lib/errors.ts`, `src/types/patients.ts`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-10)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/app/(app)/patients/page.tsx`
  - `src/app/(app)/patients/page.test.tsx`
  - `src/components/patients/PatientsEntry.tsx`
  - `src/components/patients/PatientsEntry.test.tsx`
  - `src/components/patients/PatientsScreen.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/usePatientsWorker.ts`
  - `src/components/patients/usePatientsWorker.test.ts`
  - `src/components/patients/CountsOnly.tsx`
  - `src/components/patients/CountsOnly.test.tsx`
  - `src/components/patients/tools.ts`
  - `src/components/patients/tools.test.ts`
  - `src/components/patients/ToolRow.tsx`
  - `src/components/patients/ToolRow.test.tsx`
  - `src/components/common/notReadyFeatures.ts`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/components/shell/menu.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.ts`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
  - `src/app/notFound.test.tsx`
  - `docs/UI_GUIDE.md`
- Tests:
  - `src/app/(app)/patients/page.test.tsx`
  - `src/components/patients/PatientsEntry.test.tsx`
  - `src/components/patients/PatientsScreen.test.tsx`
  - `src/components/patients/usePatientsWorker.test.ts`
  - `src/components/patients/CountsOnly.test.tsx`
  - `src/components/patients/tools.test.ts`
  - `src/components/patients/ToolRow.test.tsx`
  - `src/components/common/notReadyFeatures.test.ts`
  - `src/components/shell/shell.test.tsx`
  - `src/components/dashboard/briefing/features.test.ts`
  - `src/app/(app)/notReadyPages.test.tsx`
  - `src/app/(app)/tabFrame.test.tsx`
  - `src/app/titles.test.tsx`
  - `src/app/notFound.test.tsx`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인 목업대로**: 이 탭의 승인 목업 `docs/mockups/patients/index.html`(PC·휴대폰, 도구 셋, 상태)과 같은 배치·문구로 만든다. 명세의 화면 AC는 내용만 정하고 배치·문구는 목업이 정한다. 목업 파일이 없거나 승인 표시(목업 안 '승인' 줄 또는 `docs/mockups/patients/README.md`)가 없으면 `blocked`(사유: 승인 목업 없음)로 멈춘다 (CLAUDE.md CRITICAL)
- **모양 규칙**: `docs/UI_GUIDE.md` '앱 화면'(토큰은 `src/app/globals.css`, 반복 모양은 `src/components/ui/classes.ts`의 `ds`). 목업의 inline 값을 새 색·새 크기로 만들지 않는다. 좋고 나쁨을 색만으로 보이지 않는다
- **환자 줄 울타리**: 환자 줄(이름·전화·차트번호)은 `src/components/patients/rows/`의 부품이 props로만 그린다. 그 폴더는 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth`를 못 쓴다(TASK-1). 화면은 조각·보낼 글자를 받지 않는다(Worker가 만든 보기 모양·복사 글·오류 번호만)
- **브라우저 저장소 금지**: 명단·연락 표시를 `localStorage` 등에 두지 않는다. 연락 표시는 Worker → 도우미 `contact.dat`로만
- 화면 확인은 jsdom 시험으로 한다(`// @vitest-environment jsdom`). 실제 화면 캡처는 Phase 끝에 메인 세션이 한다
- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)

## 작업

### 1. 준비 중에서 빼기 (AC-610.1)
- `notReadyFeatures.ts`: `'/patients'`를 `NotReadyPath`와 `NOT_READY_FEATURES`에서 뺀다
- `menu.ts`: `MenuHref`에 `'/patients'`, [환자] 항목 `href: '/patients'`, `ready: true`
- `features.ts`: 환자 `status: 'connect-first'`(청구와 같다: 비트 PC를 연결해야 명단을 쓴다)
- 시험: 고정 수("준비 중 10개", `toHaveLength(10)` 등)를 목록 길이·목록에서 계산한 값으로 바꾼다(통계·매출·업무일지 명세도 같은 시험에서 자기 항목을 뺀다. 합칠 때 부딪힘을 줄인다). 바뀐 뜻: [환자]는 화면이 있는 탭
- `notReadyPages.test.tsx`·`titles.test.tsx`·`notFound.test.tsx`의 `/patients` 줄을 '준비 중' 표에서 '화면이 있는 주소' 쪽으로 옮긴다

### 2. 주소와 도구 (AC-610.2·610.5)
```ts
// src/components/patients/tools.ts
export type PatientsTool = 'followup' | 'recall' | 'messages'
export const PATIENTS_TOOLS: readonly { id: PatientsTool; label: 'F/U 명단' | '정기 주사 문자 명단' | '문자 문구' }[]
export function toolFrom(param: string | string[] | undefined): PatientsTool   // 모르는 값 → 'followup'
// src/components/patients/ToolRow.tsx — 도구 단추 줄(링크 목록, 고른 것에 aria-current="page"). 기능 폴더에 둔다(규칙 C6, 나중에 공용으로 모을 수 있게 props는 일반 모양)
export function ToolRow<T extends string>(props: { label: string /* nav 이름 */; items: readonly { id: T; label: string; href: string }[]; current: T }): JSX.Element
```
- `src/components/common/`에 새 파일을 만들지 않는다(병렬 브랜치와 같은 이름이 부딪히지 않게, 규칙 C6)
- `page.tsx`(서버 컴포넌트): `metadata.title = '환자'`, `searchParams.tool` → `toolFrom` → `<PatientsEntry tool={…} />`. 주소에는 `?tool=`만

### 3. 입구 (`PatientsEntry.tsx`, 클라이언트, AC-610.3·610.4)
- `ToolRow` → 아래에 도구 자리. `useBridge({ worker })`의 `state`로 고른다(ClaimEntry와 같은 갈래)
  - `no-extension`(휴대폰 포함): 명단 도구 → `CountsOnly`, 문자 문구 → (TASK-13이 넣을) 문자 문구 자리
  - `no-helper`·`update-helper`·`update-extension`·`disconnected`: 명단 도구 → 비트 PC 연결 안내 + [비트 PC 연결](`/claim/setup`)
  - `busy`: 다른 창 작업 중 안내 + [건수만 보기](누르면 그 자리에서 `CountsOnly`)
  - `connecting`: 불러오는 중. `ready`: `PatientsScreen`
- Worker는 `usePatientsWorker`가 `new Worker(new URL('@/workers/patients.worker.ts', import.meta.url))`로 한 번 만들고 화면을 떠나면 끝낸다

### 4. 건수만 (`CountsOnly.tsx`)
- `readContactCount(createClient())` → F/U 남은 수·정기 주사 남은 수·마지막 바뀐 시각(한국 시각). `null`(줄 없음)이면 숫자 없이 "자료 없음" + "비트 PC에서 환자 탭을 열면 건수가 생겨요". 읽기 실패(`E-PATIENTS-COUNTS-READ`를 던짐)는 '자료 없음'과 다르게 `ErrorCard` + [다시 불러오기](숫자도 '자료 없음'도 보이지 않는다)

### 5. 화면 틀 (`PatientsScreen.tsx`·`usePatientsWorker.ts`)
- `usePatientsWorker(bridge)`: 들어오면 `store.load {contact: true}` → Worker `stored` → `plan` → F/U 조각을 차례로 `stream('contact.targets', {kind: 'followup', from, to})` → `piece` → 정기 주사 조각 → `build` → `views`. 진행은 `{done, total}`. 실패하면 거기서 멈추고 오류 번호 + [다시 불러오기]
- 이 step의 `PatientsScreen`은 불러오는 중(진행 "n/전체")·오류·도구 자리만 그린다. 도구 몸통은 TASK-11~13이 그 자리에 넣는다(이 step에서 가짜 도구 몸통을 만들지 않는다)

### 6. UI_GUIDE (`docs/UI_GUIDE.md`)
- '도구 단추 줄' 절(모양·상태·휴대폰 밀기·`aria-current`, 승인 목업 그대로)과 '환자' 절(도구 셋·휴대폰 건수만·연결 안 됨) 더함. 다른 절은 고치지 않는다

### 7. 시험 (jsdom, 가짜 통로·가짜 Worker·가짜 Supabase)
- `page.test.tsx`: 탭 이름, `?tool=` 세 값·모르는 값, 주소에 도구 이름만(AC-610.1·610.2·610.5)
- `PatientsEntry.test.tsx`: 상태마다 그려지는 것(AC-610.3·610.4), `ToolRow.test.tsx`, `tools.test.ts`, `CountsOnly.test.tsx`(줄 있음·줄 없음 → 자료 없음·읽기 실패 → 오류 카드이고 '자료 없음' 글이 없음·다시 불러오기), `usePatientsWorker.test.ts`(부르는 순서·진행·실패 멈춤), `PatientsScreen.test.tsx`
- 기존 시험(shell·features·notReady·tabFrame·titles·notFound)이 새 상태로 통과

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run "src/app/(app)/patients/page.test.tsx" src/components/patients src/components/patients/ToolRow.test.tsx   # AC-610.1~AC-610.5
npx vitest run src/components/common/notReadyFeatures.test.ts src/components/shell/shell.test.tsx src/components/dashboard/briefing/features.test.ts "src/app/(app)/notReadyPages.test.tsx" "src/app/(app)/tabFrame.test.tsx" src/app/titles.test.tsx src/app/notFound.test.tsx
python3 ~/.claude/harness/bin/tdd-run TASK-10 --expect green
npm run lint && npm test && npm run build
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-610.1 ~ AC-610.5가 이 TASK의 시험과 이어져 보여야 한다

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

- 주소·쿼리에 이름·전화·차트번호·줄 열쇠를 넣지 마라. 이유: 주소는 서버 기록·방문 기록에 남는다(AC-610.5)
- 휴대폰·확장 없는 곳에서 명단을 그리거나 지어낸 숫자를 보이지 마라. 이유: 환자 정보는 비트 PC에서만, 자료 없으면 "자료 없음"
- 도구 몸통(F/U·정기 주사·문자 문구)을 이 step에서 만들지 마라. 이유: TASK-11~13 몫이다
- `useBridge.ts`·`ClaimEntry.tsx`·`SetupScreen.tsx`를 고치지 마라. 이유: 청구 화면 파일이다. 불러 쓰기만 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
