# Step 5: privacy-e2e

> **TASK-15** 개인정보 E2E (실제 Supabase · 가짜 확장) · **REQ-615** · AC-615.1 ~ AC-615.3
> Phase 4 `patients-4-screen`(환자 화면) · Step 5 — 명세 `specs/patients/`
> 명세 `specs/patients/`는 승인됐다. 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/patients/requirements.md`의 REQ-615에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-615.1**: 시험 계정 + 가짜 확장·도우미로 `/patients`에서 두 명단 불러오기·[연락함]·문구 저장 → 나간 요청의 주소·쿼리·몸통에서 맞은 곳을 `{종류, 요청 경로}`로만 모아 `expect(hits).toEqual([])`. 헤더·쿠키 안 모음, `/auth/v1/` 몸통·`apikey`·`access_token` 값 건너뜀, 실패해도 값 출력 없음(C11). 경로는 `decodeURIComponent`, 쿼리 값은 `URLSearchParams`로 꺼내 맞춤(인코딩된 한글 가짜 이름 사례 포함)
- **AC-615.2**: `message_templates`·`contact_counts` 내 줄을 다시 읽으면 금지 글 없음, `contact_counts`는 정수 둘과 시각뿐
- **AC-615.3**: trace·스크린샷·네트워크 기록에 쿠키·토큰 없음(`trace: 'off'`)

## 시작 전 확인 (사용자 할 일)

- 사용자가 TASK-5의 `supabase/migrations/20261101000300_patients.sql`을 실제(시험용) Supabase에 붙였고, `.env.local`에 E2E 시험 계정이 있어야 돈다(`npm run e2e:env`는 사용자가 직접). 없으면 파일만 만들고 실행은 하지 않으며 `blocked`(사유: "Supabase에 환자 탭 표가 없음 / 시험 계정 없음 — 사용자 OK 뒤 실행")로 남긴다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-003·004·016·020·021
- `/specs/patients/requirements.md` — REQ-615
- `/specs/patients/design.md` — '결정과 트레이드오프'(개인정보 E2E), '데이터 흐름'
- `/specs/patients/tasks.md` — TASK-15
- `/docs/ADR.md` ADR-017(E2E는 `@playwright/test` + 실제 Supabase 시험 계정)
- `/playwright.config.ts`, `/e2e/support.ts`·`/e2e/lib/session.ts`(시험 코드가 세션 쿠키를 넣는 방식)·`/e2e/preflight.ts`
- `/src/lib/bridge/commands.json`·`/src/lib/bridge/protocol.ts`(가짜 확장이 흉내 낼 메시지 모양)
- 이전 step에서 만든 파일: `fixtures/patients/fake/*`(가짜 조각), `src/workers/patients/*`, `src/components/patients/*`, `supabase/migrations/20261101000300_patients.sql`

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `e2e/patients-privacy.spec.ts`
  - `e2e/patients/fakeExtension.ts`
  - `e2e/patients/forbidden.ts`
- Tests:
  - (없음 — TDD 예외, 아래 Acceptance Criteria의 E2E 명령으로 확인)
- TDD: exempt — Playwright E2E(`npm run e2e`)는 실제 Supabase와 시험 계정이 있어야 돌고 vitest 하네스(`tdd-run`)로 RED/GREEN을 남길 수 없다(ADR-017). 사용자가 TASK-5 SQL을 붙인 뒤 위 명령으로 확인한다

## 꼭 지킬 규칙 (CRITICAL)

- **환자 정보는 PC 밖으로 나가지 않는다**: 이름·전화·차트번호·증상 글은 서버·주소(URL)·브라우저 저장소·console·화면 제목에 넣지 않는다. 서버에는 남은 건수 정수 둘과 문자 문구만 간다 (CLAUDE.md, ADR-020·021)
- **앱에 시험 길을 만들지 않는다**: 가짜 확장은 시험 코드(`page.addInitScript`)가 `chrome.runtime`을 흉내 내는 것뿐이다. 앱 코드·`EXTENSION_ID`·`commands.json`을 시험 때문에 바꾸지 않는다. 로그인은 시험 코드가 세션 쿠키를 넣는다 (CLAUDE.md 보안 규칙)
- **시험 산출물에 비밀 없음**: `trace: 'off'`, 스크린샷·기록에 쿠키·토큰을 남기지 않는다. 시험 계정 값은 `.env.local`에만 (CLAUDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험·골든은 `fixtures/patients/`의 가짜 자료만 쓴다(이름 '가상환자NN', 차트번호 `9`로 시작하는 6자리, 전화 `010-0000-NNNN`, 내원번호 `V`+숫자). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 금지 글 (`e2e/patients/forbidden.ts`)
- `fixtures/patients/fake/`에서 가짜 차트번호·이름·전화·내원번호를 모으고, 주민번호 모양 정규식과 비트 파일 이름 모양(`.xlsx`·`.xls`·`.csv`·`.GHP`·`.CAR`)을 더한 목록 하나. `findForbidden(text: string): ForbiddenKind[]` — 맞은 **종류 이름만**(`'chart' | 'name' | 'phone' | 'rrn' | 'filename'`) 돌려주고 맞은 값은 돌려주지 않는다

### 2. 가짜 확장 (`e2e/patients/fakeExtension.ts`)
- `installFakeExtension(page, fixtures)`: `page.addInitScript`로 `chrome.runtime.connect(id)`를 흉내 낸다. `hello`(지금 `versions.ts`가 받는 판)·`store.load`·`contact.targets`(가짜 조각을 실제 규칙처럼 `chunk`…`end {count, bytes, sha256}`로)·`store.save`(`{saved: true}`)에 답한다

### 3. 시험 (`e2e/patients-privacy.spec.ts`)
- 시험 계정으로 들어가 `/patients` → 두 명단을 불러옴 → [연락함] 하나 → [문자 문구]에서 문구 하나 고쳐 저장 → 남은 건수 올리기가 끝날 때까지 기다림
- `page.on('request')`로 요청마다 주소·쿼리·몸통만 검사해 `hits: { kind: ForbiddenKind; path: string /* 쿼리 뺀 경로 */ }[]`에 모으고 `expect(hits).toEqual([])`(AC-615.1, 규칙 C11)
  - 요청 머리(헤더)·쿠키는 읽지도 모으지도 않는다. `/auth/v1/` 요청 몸통(refresh_token)은 건너뛴다
  - 주소는 날 글자로 맞추지 않는다: `new URL(request.url())`의 경로를 `decodeURIComponent`로 풀어 맞추고, 쿼리는 `URLSearchParams`로 값을 하나씩 꺼내 `apikey`·`access_token`을 뺀 뒤 값마다 맞춘다(한글 가짜 이름 '가상환자NN'이 퍼센트 인코딩돼도 잡게). 이 일은 `forbidden.ts`의 `requestHits(url: string, body: string | null): { kind: ForbiddenKind; path: string }[]` 한 곳
  - spec 첫 시험(자기 점검): `requestHits('https://example.test/rest/v1/x?name=' + encodeURIComponent('가상환자01'), null)`이 `[{ kind: 'name', path: '/rest/v1/x' }]`이고, `apikey`·`access_token` 값만 다른 주소는 `[]`이다
  - 실패해도 모은 글·몸통·값을 출력하지 않는다(실패 글은 `hits`의 종류·경로뿐)
- 끝난 뒤 시험 계정 세션으로 `message_templates`·`contact_counts` 내 줄을 읽어 금지 글 없음, `contact_counts` 칸이 `followup_left`·`injection_left`(정수)·`updated_at`·`hospital_id`뿐(AC-615.2)
- 저장된 줄 검사도 `findForbidden`의 종류만 모아 `expect(hits).toEqual([])`(값을 출력하지 않는다)
- 시험이 바꾼 문구는 처음 값으로 되돌리고, 시험 산출물 폴더에 쿠키·토큰 글자가 없는지 본다(AC-615.3)
- `contact_counts`에는 delete 권한이 없다(AC-607.3). 시험 계정의 건수 줄(가짜 자료의 정수 둘)은 남는다. 이 시험을 위해 delete 권한을 더하지 않는다

## TDD

- 이 TASK는 `TDD: exempt`다(Playwright E2E(`npm run e2e`)는 실제 Supabase와 시험 계정이 있어야 돌고 vitest 하네스(`tdd-run`)로 RED/GREEN을 남길 수 없다(ADR-017). 사용자가 TASK-5 SQL을 붙인 뒤 위 명령으로 확인한다). `tdd-run`을 부르지 않는다. 대신 시험 파일을 먼저 쓰고, 실행할 수 있는 환경이면 시험이 먼저 실패하는 것을 눈으로 확인한 뒤 맞춘다

## Acceptance Criteria

```bash
npm run lint && npm run build && npm test
# 사용자가 SQL을 붙이고 시험 계정이 있을 때만:
npm run e2e -- e2e/patients-privacy.spec.ts      # AC-615.1~AC-615.3
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- AC-615.1 ~ AC-615.3는 `npm run e2e` 결과로 확인한다(사용자가 SQL을 붙인 뒤). 결과를 summary에 적는다

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

- 앱 코드에 시험용 확장 흉내·로그인 우회를 넣지 마라. 이유: 운영 사이트에 시험 길이 남는다(CLAUDE.md CRITICAL)
- 실제 환자 자료로 E2E를 돌리지 마라. 이유: 가짜 조각만(`fixtures/patients/fake`)
- 요청 머리·쿠키·토큰·apikey 값을 모으거나, 실패 글에 모은 값을 찍지 마라. 이유: 시험 기록에 비밀이 남는다(규칙 C11)
- 사용자 OK 없이 Supabase에 SQL을 붙이지 마라. 이유: DB 변경은 그때 사용자 OK가 필요하다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- `specs/precheck/`·`phases/precheck-*`·`src/lib/bridge/*`·`src/lib/bridge/commands.json`·`src/workers/precheck/*`·`src/types/precheck.ts`를 고치지 마라. 이유: 청구 사전점검 브랜치가 쓰는 파일이다(design.md '다른 작업과 겹치는 파일')
- 기존 테스트를 깨뜨리지 마라. 이유: 다른 기능의 시험이 계속 통과해야 한다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`(수정 범위에 적힌 것 빼고)를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- Phase 4 마지막 step이다. 메인 세션이 Phase 끝에 할 일: `verify` → 화면 캡처(PC·휴대폰, 도구 셋, 연결 안 됨·건수만) → 쉬운 말 보고 → 의원 PC 시험 목록(F/U·정기 주사 명단을 양지바른과 비교, 연락함이 다시 열어도 남는지, 휴대폰 건수가 바뀌는지)
- 합치기(merge)·운영 배포·도우미 릴리스 태그(`helper-v*`)·Supabase에 표 붙이기는 사용자가 그때마다 지시할 때만 한다
