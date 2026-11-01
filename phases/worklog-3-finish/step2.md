# Step 2: e2e

> **TASK-13** 실제 Supabase 확인 E2E · **REQ-013** · AC-013.1 ~ AC-013.5
> Phase 3 `worklog-3-finish` · Step 2 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-013에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-013.1**: 승인 시험 계정 → 시험 날짜 2020-01-02 → 숫자 칸(숫자만·'가상 200,000 별도'·'2건 30,000'·'별도 보고')·항목 이름·비고·업무사항 → "저장했어요" → 새로 고침 → **날짜를 다시 2020-01-02로 고름**(날짜는 주소에 없다) → 적은 값·항목 이름·업무사항·자동 칸 그대로, '2건 30,000' 칸에만 "합계에서 빠졌어요"
- **AC-013.2**: 숫자 칸 글자·비고·업무사항·항목 이름에 막는 모양 → **모든 요청**(Supabase·같은 origin Next/Vercel 모두)의 주소와 본문, 다시 읽은 그 날 `worklog_days` 줄 어디에도 그 값이 없음, 그 칸은 빨강, 함께 고친 다른 칸은 저장됨(cross-branch C7)
- **AC-013.3**: 새 브라우저(다른 PC) → 숫자 칸·글자 칸·항목 이름·업무사항이 모두 같게 보임
- **AC-013.4**: A4 PDF 인쇄(업무사항 보임) → 한 쪽(`/\/Type\s*\/Page(?!s)/g`로 셈)
- **AC-013.5**: 두 브라우저가 같은 날을 열어 둠 → 서로 다른 칸을 고쳐 각각 "저장했어요" → 다시 읽은 줄에 두 칸 다, 한쪽이 날짜를 옮겼다 돌아오면 다른 쪽 값이 보임

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-013
- `/specs/worklog/design.md` — 15절(E2E), 8절(표 — 지우기 권한 없음)
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/e2e/support.ts` — `accounts.signIn(context, 'approved')`·`accounts.client('approved')`(값 출력 금지)
- `/e2e/config.ts`·`/playwright.config.ts`
- `/docs/ADR.md` — ADR-017(E2E 규칙)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `e2e/worklog.spec.ts`
  - `docs/ARCHITECTURE.md` (업무일지 흐름 줄·`worklog_days` 표 줄의 '(예정)' 빼기만)
- Tests:
  - `e2e/worklog.spec.ts`
- TDD: exempt — 시험을 더하고 문서 꼬리표 두 곳만 고친다(대상 코드는 TASK-2~12가 이미 만들었다). 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌린다(커밋하지 않음)

## 꼭 지킬 규칙 (CRITICAL)

- **먼저 확인**: 사용자가 TASK-4 migration(`supabase/migrations/20261101000100_worklog.sql`)을 실제 Supabase SQL 편집기에 붙여 넣었는가? 아니면 바로 `blocked`(사유: "worklog_days migration 적용 필요 — 사용자 OK")로 멈춘다. Claude가 붙여 넣지 않는다
- 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['업무사항-전화']` → `expect(hits).toEqual([])`, cross-branch C11)
- 시험 산출물(trace·영상·스크린샷·네트워크 로그)에 쿠키·토큰·이메일을 남기지 않는다(CLAUDE.md, `trace: 'off'`). 요청 본문은 메모리에서 검사만 하고 파일로 쓰지 않는다
- 시험 계정은 가짜 병원이다. 실제 의원 계정으로 돌리지 않는다. 시험 날짜는 늘 2020-01-02(실제 날짜를 더럽히지 않는다)

## 작업

- `import { test, expect } from './support'`
- **저장되는 값**(둥근 가짜 값·"가상" 글자): 신환 `3`, 현금수납 `100000`, 카드수납 `가상 200,000 별도`, 계좌이체 `2건 30,000`, 지출 현금 `5000`, 지출 환불 `별도 보고`, 지역화폐 항목 이름 `가상 항목`, 비고 `가상 택배비`, 업무사항 `E2E-가상 메모`
- **막는 모양**(칸마다 하나, 이름표 → 값): `업무사항-전화` → `010-0000-0001`, `비고-주민번호` → `900101 1234567`, `숫자칸-전화` → `0200000001 별도`, `항목이름-전화` → `(02)000-0001`
- 순서:
  1. `signIn` → `page.on('request', r => 모음.push({ url: r.url(), body: r.postData() ?? '' }))`(**origin을 거르지 않는다** — Supabase·같은 origin `/_next`·RSC 요청 모두) → `/worklog` → 날짜 고르기 칸에 `2020-01-02` → 저장되는 값 입력 → `getByRole('status')`가 "저장했어요" → `page.reload()` → **날짜 칸에 다시 `2020-01-02`** → 값·항목 이름·업무사항 확인, 수납액 "300,000원"·총지불액 "5,000원"·합계 "295,000원", "합계에서 빠졌어요" 한 개(AC-013.1)
  2. `browser.newContext()` + `signIn` → 같은 날 → 위 칸이 모두 같음(AC-013.3)
  3. 두 브라우저를 같은 날에 열어 둔 채 첫째는 지출 카드 `1000`, 둘째는 지출 free `2000` → 각각 "저장했어요" → `accounts.client('approved')`로 다시 읽어 `spend_card`·`spend_free` 둘 다 있음 → 첫째가 날짜를 옮겼다 돌아오면 지출 free가 보임(AC-013.5)
  4. `page.emulateMedia({ media: 'print' })` + `page.pdf({ format: 'A4', printBackground: true })` → `pdf.toString('latin1').match(/\/Type\s*\/Page(?!s)/g)?.length === 1`(AC-013.4), 끝나면 `emulateMedia({ media: 'screen' })`
  5. 막는 모양 넷 + 지출 현금에 보통 값 `7000` → 넷은 `aria-invalid`, 오류 카드 `E-WORKLOG-NOTE-PRIVATE`, 다시 읽은 줄의 `spend_cash`가 `7000`(저장됨). 모은 요청마다 `decodeURIComponent(url)`·본문에 막는 모양 넷이 없음 + 다시 읽은 줄의 모든 칸 값에 없음. 걸린 것은 이름표만 담아 `expect(hits).toEqual([])`(AC-013.2). 업무사항 표식이 서버에 없는지는 보지 않는다(업무사항은 서버에 있는 것이 맞다)
- 끝(`afterAll`): `accounts.client('approved')`로 그 날 값 32칸을 모두 null로 둔다(지우기 권한 없음)
- 확인: `npm run e2e`(`.env.local`의 E2E 값 필요, 없으면 preflight가 멈춘다 → `blocked`)

## Acceptance Criteria

```bash
npm run e2e   # AC-013.1~AC-013.5 (실제 Supabase + 시험 계정, migration 적용 뒤)
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-013.1 ~ AC-013.5가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-3-finish/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- migration이 없다고 시험을 `skip`하지 마라. 이유: 0 failed로 통과처럼 보인다. `blocked`로 멈춘다
- 시험 계정 이메일·uid·토큰·요청 본문을 출력·파일로 남기지 마라. 이유: E2E 규칙(ADR-017, `e2e/support.ts` 머리 주석)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. `docs/*`는 위 '수정 범위'의 `docs/ARCHITECTURE.md` 두 줄만 고친다. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
