# Step 0: bit-e2e

> **TASK-18** 실제 Supabase 비트 칸 확인 · **REQ-018** · AC-018.1 ~ AC-018.2
> Phase 5 `worklog-5-bitcheck` · Step 0 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-18 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-018에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-018.1**: 0110 migration 적용 뒤, 시험 코드가 승인 계정 클라이언트(RLS 아래)로 시험 날짜 줄에 `bit_fields`를 넣고 → 화면(비트 PC 없음)에서 다른 칸을 고쳐 자동 저장 → 다시 읽으면 고친 값 저장 + `bit_fields` 그대로, 화면에 표시 보임
- **AC-018.2**: 모든 요청의 주소·본문과 다시 읽은 줄에 가짜 환자 이름·차트번호·전화·주민번호·업무사항 표식이 없음(C7)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-018
- `/specs/worklog/design.md` — 20-4절, 15절
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/e2e/support.ts`·`/e2e/worklog.spec.ts` (Phase 3)
- `/docs/ADR.md` — ADR-017(E2E 규칙)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-18)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `e2e/worklog-bit.spec.ts`
- Tests:
  - `e2e/worklog-bit.spec.ts`
- TDD: exempt — 시험만 더한다(대상 코드는 TASK-15~17). 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌린다(커밋하지 않음)

## 꼭 지킬 규칙 (CRITICAL)

- **먼저 확인**: 사용자가 `20261101000110_worklog_bit_fields.sql`을 실제 Supabase SQL 편집기에 붙여 넣었는가? 아니면 바로 `blocked`(사유: "worklog_bit_fields migration 적용 필요 — 사용자 OK"). Claude가 붙여 넣지 않는다
- 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['표식', '전화']` → `expect(hits).toEqual([])`, cross-branch C11)
- 시험 산출물에 쿠키·토큰·이메일을 남기지 않는다(`trace: 'off'`). 요청 본문은 메모리에서 검사만 한다
- 시험 계정(가짜 병원)·시험 날짜 2020-01-02만 쓴다

## 작업

- `import { test, expect } from './support'`
- 순서: `accounts.client('approved')`로 2020-01-02 줄 upsert(`work_date`·`cash_in: 100000`·`bit_fields: ['cash_in']`) → `signIn` → `page.on('request')`로 **모든 요청** 주소·본문 모음 → `/worklog` → 날짜 2020-01-02 → 현금수납 칸에 비트 표시가 보임 → 지출 현금 칸에 5000 → "저장했어요" → 다시 읽어 `spend_cash = 5000`·`bit_fields = ['cash_in']`(AC-018.1) → 업무사항 칸에 가짜 글자(`'가상환자01'`·`'900001'`·`'010-0000-0001'`·`'900101-1234567'`·표식)를 넣고 저장 상태 확인 → 모은 요청과 다시 읽은 줄에 가짜 글자 없음(AC-018.2)
- 끝(`afterAll`): 그 날 줄을 빈 값·`bit_fields: []`로 되돌리고 업무사항 칸을 비운다
- 확인: `npm run e2e`


## Acceptance Criteria

```bash
npm run e2e   # AC-018.1~AC-018.2 (실제 Supabase, 0110 migration 적용 뒤)
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-018.1 ~ AC-018.2가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-5-bitcheck/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- migration이 없다고 시험을 `skip`하지 마라. 이유: 0 failed로 통과처럼 보인다. `blocked`로 멈춘다
- 시험 계정 이메일·uid·토큰·요청 본문을 출력·파일로 남기지 마라. 이유: E2E 규칙(ADR-017)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
