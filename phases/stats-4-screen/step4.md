# Step 4: stats-e2e

> **TASK-17** 개인정보 E2E (실제 Supabase) · **REQ-517** · AC-517.1 ~ AC-517.3
> Phase 4 · 화면 `stats-4-screen` · Step 4 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-17 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-517(개인정보 E2E (실제 Supabase, 사용자가 SQL을 붙인 뒤))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-517.1**: Given 시험 계정(승인됨)으로 연 `/stats`와 가짜 비트 파일(`fixtures/fake-bit/`), When 파일을 넣어 저장하면, Then 브라우저가 보낸 모든 요청(주소·본문, 그리고 `authorization`·`apikey`·`cookie`를 뺀 머리)에 그 파일의 차트번호·이름 칸 값·전화·주민번호 모양·파일 이름이 없다. 시험은 인증 머리·쿠키·apikey 값을 모으지 않고, 걸리면 어떤 종류가 어디에서 걸렸는지(`{ kind, where }`, 값 없음)만 보인다(`expect(hits).toEqual([])`)
- **AC-517.2**: Given 같은 시험 뒤, When 시험 계정으로 `stats_months`·`stats_days`·`stats_coverage`를 다시 읽으면, Then 저장된 값에도 AC-517.1의 값이 하나도 없고 줄 모양이 `validateMonthPayload`·`validateDayPayload`를 지난다
- **AC-517.3**: Given `/dashboard`, When 그 계정으로 열면, Then 방금 저장한 숫자가 보이고(연결 뒤 짜임) 요청에 같은 금지 값이 없다. 시험은 `npm run e2e`에서만 돌고(`npm test` 밖), 시험 계정 병원의 통계 줄만 쓴다

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-517
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-17, '데이터 흐름'(서버로 가는 것)
- `/specs/stats/tasks.md` — TASK-17 (수정 범위·메모)
- `/tmp/claude-1000/-home-developer/e95c76cc-42cc-429c-acc9-4833022da887/scratchpad/cross-branch-rules.md`가 있으면 C7
- `/docs/ADR.md` — ADR-017(E2E: 실제 Supabase + 시험 계정, 쿠키 넣기 로그인, trace·영상·스크린샷 끔)
- `/specs/auth-live/tasks.md` — TASK-7~9(E2E만 더하는 TASK의 본보기: TDD exempt, 일부러 틀린 기대값으로 실패 한 번)
- `/e2e/support.ts`(역할별 로그인 fixture·쿠키 넣기), `/e2e/lib/session.ts`(시험 계정 세션), `/playwright.config.ts`, `/e2e/config.ts`, `/specs/auth-live/design.md` 'E2E 시나리오'(요청 모으기·다시 읽기 규칙 — 이 브랜치에는 auth-live의 `requests.spec.ts`·`rls-live.spec.ts`가 아직 없으니 본보기로 찾지 않는다)
- `/fixtures/fake-bit/` (넣을 가짜 파일 — 차트번호·이름 칸 값을 시험이 파일에서 꺼내 금지 목록으로 쓴다)
- `/src/lib/payload/validate.ts`
- 이전 step에서 만든 파일: TASK-14·15·16 (통계 화면·탭·대시보드 읽기), TASK-6 SQL이 실제 Supabase에 붙어 있어야 한다

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-17)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `e2e/stats-privacy.spec.ts`
- Tests:
  - `e2e/stats-privacy.spec.ts`
- TDD: exempt — 시험만 더한다. 대상 코드(저장·화면·대시보드 읽기)는 TASK-7·14·16에서 단위 시험을 통과했으므로 구현할 것이 없어 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음, auth-live TASK-7~9와 같은 방식). 기다림: 사용자가 TASK-6 SQL을 실제 Supabase에 붙임 + 시험 계정(`.env.local`). 확인: `npm run e2e`
- 메모: Phase 4 끝(메인 세션): `verify` → PC·휴대폰 화면 캡처 → 쉬운 말 보고 → 의원 PC 시험 목록(새 도우미 zip 설치, [비트에서 불러오기], 지난달 숫자를 양지바른·비트 통계와 비교, 보고 문장을 양지바른 일일보고와 비교, 800일 불러오기 시간)

## 꼭 지킬 규칙 (CRITICAL)

- **서버에는 숫자만**: 서버로 가는 값은 검사한 저장 모양(`validateMonthPayload`·`validateDayPayload`), 덮은 기간(날짜 둘), 출처('bit'|'file')뿐이다. 차트번호·환자 번호·진료 줄·파일 이름·보고 금액·보고 글은 보내지 않는다 (CLAUDE.md, plan.md §2-2·§4)
- **비밀값 (E2E)**: 이 시험은 실제 Supabase에 붙는다(사용자가 SQL을 붙인 뒤, `.env.local`의 시험 계정). 시험 계정 값·쿠키·토큰·apikey를 코드·출력·실패 메시지·산출물에 쓰지 않는다. 요청을 모을 때 인증 머리·쿠키·apikey 값은 모으지 않는다(cross-branch C11). `trace: 'off'` (CLAUDE.md, ADR-017)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)
- **새 서버 경로 없음**: `app/api/*`·Route Handler·Server Action을 만들지 않는다. 서버 코드는 `app/api/ai/` 하나다. 통계 숫자는 브라우저가 Supabase(RLS)에 바로 읽고 쓴다. 페이지·`*.server.ts`는 통계 표를 읽지 않는다 (CLAUDE.md, ADR-004)

## 작업

### 0. 기다림
- 사용자가 TASK-6 SQL(`supabase/migrations/20261101000200_stats.sql`)을 실제 Supabase SQL 편집기에 붙였고 `.env.local`에 시험 계정 값이 있어야 한다. 아니면 `blocked`(사유: "통계 표 SQL 붙이기·시험 계정 필요")로 멈춘다. Claude가 SQL을 붙이지 않는다

### 1. 시험 (`e2e/stats-privacy.spec.ts`, Playwright)
- 승인된 시험 계정으로(`e2e/support.ts`의 쿠키 넣기) `/stats` → 가짜 비트 파일을 넣고 저장될 때까지 기다린다
- AC-517.1: `page.on('request')`로 요청마다 주소·본문(`postData`)과 머리 가운데 `authorization`·`apikey`·`cookie`(대소문자 무시)를 **뺀** 것만 모은다(인증 값은 처음부터 모으지 않는다, cross-branch C11). 가짜 파일에서 꺼낸 차트번호·이름 칸 값·전화 모양·주민번호 모양(자리표시 `XXXXXX-XXXXXXX` 포함)·파일 이름을 찾고, 걸리면 `{ kind: 'chart' | 'name' | 'phone' | 'rrn' | 'fileName', where: 'url' | 'body' | 'header:<이름>' }`만 `hits`에 넣는다(값을 넣지 않는다). `expect(hits).toEqual([])` — 실패해도 값·토큰이 출력되지 않는다
- AC-517.2: 같은 방식(`hits`에 종류·표 이름만)으로, 시험 계정 세션의 supabase-js로 `stats_months`·`stats_days`·`stats_coverage`를 다시 읽어 같은 값이 없고, 달·일 줄이 `validateMonthPayload`·`validateDayPayload`를 지남을 본다
- AC-517.3: `/dashboard`를 열어 방금 저장한 숫자가 연결 뒤 짜임으로 보이고 요청에 금지 값이 없음을 본다
- 시험 계정 병원의 통계 줄만 쓴다(다른 줄을 지우거나 고치지 않는다). 산출물에 쿠키·토큰을 남기지 않는다(`trace: 'off'`)

## TDD

- `TDD: exempt` — 시험만 더한다. 대상 코드(저장·화면·대시보드 읽기)는 TASK-7·14·16에서 단위 시험을 통과해 RED 단계가 없다. 시험이 헛돌지 않는지는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌려 확인한다(커밋하지 않음). `tdd-run`을 부르지 않는다

## Acceptance Criteria

```bash
npm run e2e -- e2e/stats-privacy.spec.ts   # 사용자가 SQL을 붙인 뒤
npm run lint && npm test && npm run build   # npm test는 e2e를 돌리지 않는다
```

- 위 커맨드가 모두 에러 없이 끝나야 한다.

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/stats-4-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (원본 접근, 목업 승인, 외부 인증, 수동 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 실제 Supabase에 SQL을 붙이거나 표를 지우지 마라. 이유: DB 바꿈은 사용자가 허락하고 사용자가 한다
- 시험 계정 값·쿠키·토큰을 출력·파일·커밋에 남기지 마라. 이유: CLAUDE.md 비밀값 규칙
- 실제 환자 파일을 쓰지 마라. 이유: `fixtures/fake-bit/`의 가짜 파일만(CLAUDE.md)
- 앱 코드에 시험용 로그인·우회 길을 만들지 마라. 이유: E2E 로그인은 시험 코드가 쿠키를 넣는다(CLAUDE.md)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 · `docs/*`. 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다

## 참고

- 통계 명세의 마지막 step이다. 메인 세션이 할 일: `verify` → PC·휴대폰 화면 캡처(`/stats`·`/dashboard`, 390·768·1440) → 쉬운 말 보고 → 의원 PC 시험 목록(새 도우미 zip 설치, [비트에서 불러오기], 지난달 숫자를 양지바른·비트 통계와 비교, 보고 문장을 양지바른 일일보고와 비교, 800일 불러오기 시간, 확인 필요 날)
- 실제 Supabase에 TASK-6 SQL이 붙어 있어야 저장·읽기가 된다. 아직이면 사용자에게 SQL 편집기 순서를 채팅으로 드리고 허락을 받는다
