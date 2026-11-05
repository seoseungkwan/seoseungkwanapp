# Step 0: patients-fence

> **TASK-1** 환자 자료 울타리 (ESLint) · **REQ-601** · AC-601.1 ~ AC-601.4
> Phase 1 `patients-1-lists`(명단 계산 (웹, 골든)) · Step 0 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-1 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-601에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-601.1**: `src/lib/patients/**`(시험 파일 포함)에 기존 환자 자료 구역 규칙 전부(네트워크·console·브라우저 저장소·React/Next/supabase/`lib/auth`/`lib/storage` import·JSX 금지)가 걸린다. 규칙마다 막힘을 시험으로 보인다
- **AC-601.2**: `src/components/patients/rows/**`: JSX는 되고 네트워크·console·브라우저 저장소·supabase·`lib/storage`·`lib/auth` import는 막힌다
- **AC-601.3**: `src/components/patients/**`·`src/app/(app)/patients/**`: 오류 보고 패키지(`@sentry/*`·`@vercel/analytics`·`@vercel/speed-insights`) import가 막힌다
- **AC-601.4**: 기존 구역(lib/parsers·analytics·payload·precheck·bridge·workers·extension) 시험이 그대로 통과한다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-601
- `/specs/patients/design.md` — '구성 요소 / 인터페이스'의 폴더, '다른 작업과 겹치는 파일'
- `/specs/patients/tasks.md` — TASK-1
- `/eslint.config.mjs` 전체(특히 `patientZoneRules`와 "같은 규칙 이름은 뒤 설정이 앞 설정을 통째로 덮으므로" 주석, `CLIENT_IMPORT` 블록)
- `/src/guardrails.test.ts` 전체(시험이 ESLint를 부르는 방식)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-1)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `eslint.config.mjs`
  - `src/guardrails.test.ts`
  - `docs/ARCHITECTURE.md`
- Tests:
  - `src/guardrails.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료 구역 울타리**: `src/lib/patients`·`src/lib/analytics`·`src/workers`(그리고 `lib/parsers`·`lib/payload`·`lib/precheck`·`lib/bridge`)에서는 네트워크(`fetch`·`XMLHttpRequest`·`WebSocket`·`EventSource`·`sendBeacon`), `console`, 브라우저 저장소(`localStorage`·`sessionStorage`·`indexedDB`), React·Next·supabase·`lib/auth`·`lib/storage` import, JSX를 쓰지 않는다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 울타리를 풀거나 `eslint-disable`로 피하지 않는다 (CLAUDE.md, ADR-020, REQ-601)
- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)

## 작업

### 1. 환자 자료 구역에 `lib/patients` 더하기 (AC-601.1)
- 환자 자료 구역 블록의 `files`에 `'src/lib/patients/**'`를 더한다. `PATIENT_ZONE_MESSAGE` 글에 `lib/patients`를 넣는다(예: `환자 자료 구역(lib/parsers·lib/analytics·lib/payload·lib/precheck·lib/patients·lib/bridge·workers)은 …`)
- 기존 시험 중 이 안내 글을 그대로 비교하는 것이 있으면 새 글에 맞춘다(뜻은 같고 구역 하나가 늘었다)

### 2. 화면 줄 울타리 `components/patients/rows/**` (AC-601.2)
- 새 함수 `rowsFenceRules()`를 만들어 블록 하나에 넣는다. 같은 규칙 이름은 뒤 블록이 앞 블록을 통째로 덮으므로 이 블록의 `no-restricted-imports`·`no-restricted-syntax`에는 전역 블록의 `CLIENT_IMPORT`·`CLIENT_IMPORT_SYNTAX`와 3번의 오류 보고 패키지 금지도 함께 넣는다
  - `no-restricted-globals`: `NETWORK`·`STORAGE`·`console`
  - `no-restricted-properties`: `sendBeacon`·`localStorage`·`sessionStorage`·`indexedDB`·`console`
  - `no-restricted-imports`: `@supabase/*`·`@/lib/supabase/*`·`@/lib/storage/*`·`@/lib/auth/*`(상대 경로 `**/storage/*`·`**/supabase/*`·`**/auth/*`도), 오류 보고 패키지, `CLIENT_IMPORT`
  - `no-console`: error. JSX·React import는 막지 않는다
- 블록 순서: 3번 블록 다음에 둔다(rows 파일은 이 블록이 이긴다)

### 3. 오류 보고 패키지 금지 (AC-601.3)
- `files: ['src/components/patients/**', 'src/app/(app)/patients/**']`, `no-restricted-imports`에 `@sentry/*`·`@vercel/analytics`·`@vercel/analytics/*`·`@vercel/speed-insights`·`@vercel/speed-insights/*` + `CLIENT_IMPORT`(덮어쓰기 때문)

### 4. 시험 (`src/guardrails.test.ts`에 더함)
- 기존 시험이 ESLint를 부르는 도우미를 그대로 써서 가짜 파일 경로로 글을 검사한다
- `describe('AC-601.1 src/lib/patients/**도 환자 자료 구역 …')`: fetch·console·localStorage·React import·supabase import·`@/lib/storage/x` import·JSX가 막히고, 하위 폴더·시험 파일도 같고, `@/lib/analytics/dates` import와 `node:fs`(시험)는 된다
- `describe('AC-601.2 components/patients/rows …')`: fetch·console·localStorage·`@/lib/supabase/browser`·`@/lib/storage/contactCounts`·`@/lib/auth/gate` 막힘, JSX와 `react` import는 됨
- `describe('AC-601.3 …')`: `components/patients/X.tsx`·`components/patients/rows/X.tsx`·`app/(app)/patients/page.tsx`에서 `@sentry/nextjs`·`@vercel/analytics/react`·`@vercel/speed-insights/next` 막힘. `components/patients/X.tsx`에서 `@/lib/supabase/browser`는 막히지 않는다(건수 올리기용)
- `describe('AC-601.4 …')`: `components/patients`·rows에서도 `@/lib/bridge/client` import가 막힌다(덮어쓰기로 풀리지 않았다). 기존 describe는 손대지 않는다

### 5. 문서 (`docs/ARCHITECTURE.md`)
- 디렉토리 구조와 '[환자 구역]' 줄에 `lib/patients`(환자 탭 계산)·`components/patients/rows`(환자 줄 울타리)를 더하고, 옛 이름 `components/contact/rows`는 `components/patients/rows`로 바꾼다. 다른 줄은 고치지 않는다. `CLAUDE.md`의 같은 글은 고치지 않는다(메인 세션이 사용자 OK로 고친다)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-602.1 내일은 진료일 다음 날', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 시험 파일과 설정 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/guardrails.test.ts      # AC-601.1~AC-601.4
npm run lint
python3 ~/.claude/harness/bin/tdd-run TASK-1 --expect green
npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status patients`에서 AC-601.1 ~ AC-601.4가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/patients-1-lists/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 저장소·승인 목업·선행 작업 없음 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 기존 구역 규칙을 지우거나 약하게 바꾸지 마라. 이유: 환자 자료가 새는 길이 열린다(ADR-020)
- rows 블록·오류 보고 블록에서 `CLIENT_IMPORT`를 빠뜨리지 마라. 이유: 뒤 블록이 같은 규칙 이름을 덮어 `lib/bridge/client.ts` 금지가 풀린다(precheck 004.11)
- `eslint-disable` 주석으로 시험을 통과시키지 마라. 이유: 울타리를 피한 것이다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
