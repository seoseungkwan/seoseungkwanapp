# Step 3: bit-screen

> **TASK-17** 화면에서 비트로 채우기 · **REQ-017** · AC-017.1 ~ AC-017.8
> Phase 4 `worklog-4-bitfill` · Step 3 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-17 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-017에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-017.1**: 연결됨 → 날짜 열 때(오늘은 보이는 동안 10분마다) `revenue.days` 읽고 맞추고 자동 저장. 단추 없음
- **AC-017.2**: 비트 칸 표시 + "표시한 칸은 비트에서 불러온 숫자예요", 인쇄엔 없음
- **AC-017.3**: '다름' 목록(칸 이름(그날 이름)·적은 글자·비트 값·[비트 숫자로 바꾸기])
- **AC-017.4**: 연결 안 됨·확장/도우미 없음·옛 판·읽기 실패·확인 필요 → 손으로 적기 그대로 + 쉬운 안내 한 줄
- **AC-017.5**: 폰(터치 기기)·다른 PC → 저장된 표시만, 읽기 없음
- **AC-017.6**: 화면에 오는 것은 숫자뿐, 비트 때문에 서버로 가는 것은 채운 칸의 숫자 글자 + 비트 칸 목록뿐
- **AC-017.7**: 비트를 읽지 않는 화면에서 비트 칸 밖 칸을 고치거나 앱 안 이동 뒤 저장돼도 저장된 비트 표시가 지워지지 않음(목록이 안 바뀌면 `bit_fields`를 안 보냄)
- **AC-017.8**: 비트 답이 첫 읽기보다 먼저 오면 읽기가 끝난 뒤 합침, 불러오기 실패한 날은 합치지 않음(저장 없음), 옛 날짜 답은 버림

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-017
- `/specs/worklog/design.md` — 20-1·20-4·20-5절, 10·11절
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/components/claim/useBridge.ts` — 상태 이름(ready·no-extension·helper-old 등)
- 매출 갈래 화면이 `revenue.days`를 부르는 법(`src/components/revenue/*`, main)
- `/src/components/worklog/*`·`/src/lib/worklog/autosave.ts` (Phase 2·3)
- `/src/lib/worklog/bitFill.ts`·`/src/lib/storage/worklogDays.ts` (Step 0·2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-17)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/worklog/useBitFill.ts`
  - `src/components/worklog/useBitFill.test.tsx`
  - `src/components/worklog/WorklogScreen.tsx`
  - `src/components/worklog/WorklogScreen.test.tsx`
  - `src/components/worklog/useWorklogDay.ts`
  - `src/components/worklog/useWorklogDay.test.tsx`
  - `src/components/worklog/WorklogSheet.tsx`
  - `src/components/worklog/WorklogSheet.test.tsx`
  - `src/components/worklog/sheet.module.css`
  - `src/components/worklog/BitNotice.tsx`
  - `src/components/worklog/BitNotice.test.tsx`
  - `src/lib/worklog/autosave.ts`
  - `src/lib/worklog/autosave.test.ts`
  - `src/components/worklog/worklogSession.ts`
  - `src/components/worklog/worklogSession.test.ts`
  - `docs/mockups/worklog/bitfill.html`
- Tests:
  - `src/components/worklog/useBitFill.test.tsx`
  - `src/components/worklog/useWorklogDay.test.tsx`
  - `src/components/worklog/WorklogScreen.test.tsx`
  - `src/components/worklog/WorklogSheet.test.tsx`
  - `src/components/worklog/BitNotice.test.tsx`
  - `src/lib/worklog/autosave.test.ts`
  - `src/components/worklog/worklogSession.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **기다림(Phase 4 공통, 아니면 바로 `blocked`)**: `origin/main`의 `src/lib/bridge/commands.json`에 `"revenue.days"`가 있고 그 main이 이 브랜치에 합쳐져 있다. 확인: `git fetch origin && git show origin/main:src/lib/bridge/commands.json | grep -q '"revenue.days"' && grep -q '"revenue.days"' src/lib/bridge/commands.json`. 합치기는 이 step이 하지 않는다 — 없으면 `blocked`(사유: "매출 갈래 revenue.days가 main에 들어와 이 브랜치에 합쳐져야 함")
- **시안 먼저**: `docs/mockups/worklog/bitfill.html`(예시 숫자, "예시" 표시)을 만들고 사용자 OK를 받기 전에는 화면 코드를 쓰지 않는다 → OK가 없으면 시안만 만들고 `blocked`(사유: 비트 표시 시안 OK 기다림)
- **그날 읽기가 끝나기 전에는 합치지 않는다**: 읽기 전에는 `known`이 빈 하루라 비트 숫자가 차이로 저장되어 손으로 적어 둔 서버 값을 덮는다
- 적은 값을 몰래 덮어쓰지 않는다(사용자). '다름'은 보여 주기만 하고, 바꾸기는 사람이 누를 때만
- 환자 줄은 화면에 오지 않는다: `revenue.days`는 숫자 명령이고 답 검사를 지난다. 비트 때문에 나가는 저장에 채운 칸·비트 칸 목록 말고 다른 칸이 없음을 시험으로 본다
- 비트가 안 돼도 손으로 적기는 막지 않는다(오류 카드 대신 안내 한 줄)
- **표시를 지우지 않는다**: 자동 저장 길 전체가 `bitFields`를 나르고, 바뀌었을 때만 보낸다. 모르는 때나 안 바뀐 때는 칸을 보내지 않는다(`[]` 금지)
- **합치기·배포 관문**: 이 step 뒤로 읽기·쓰기가 `bit_fields`를 쓴다. 사용자가 `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣기 전에는 Phase 4를 main에 합치거나 배포하지 않는다(tasks.md 머리말). summary에 이 관문을 적는다

## 작업

- `useBitFill({ ymd, today, readOnly })` → `{ status: 'off' | 'reading' | 'ready' | 'unconfirmed' | 'failed' | 'not-connected' | 'setup-needed'; ymd: string; values: BitValues }`(`ymd` = 이 답의 날짜, 요청 번호로 늦은 옛 답은 버린다). `readOnly`(터치 기기 — 11-3절과 같은 판정)면 읽지 않는다. 통로 오류 `E-BRIDGE-REJECTED`·`E-HELPER-UNKNOWN-COMMAND`는 `setup-needed`('확장/도우미 새 버전' 안내, 매출 설계 5절과 같음)로, 그 밖의 읽기 오류만 `failed`로 간다. 오늘이면 10분 타이머(보일 때만). `bridge.call('revenue.days', { from: ymd, to: ymd })` → `bitValuesFrom(days[0])`
- 자동 저장 길에 `bitFields`(design.md 20-4절): `autosave.change(ymd, day, bitFields?)`, `serverDay(ymd, server, focusKey, bitFields?)` → `{ day, bitFields? }`(합친 하루·합친 목록), `pendingDay(ymd)` → `{ day, bitFields? } | null`, `worklogSession`의 `save = (ymd, changes, bitFields) => saveWorklogDay(supabaseBrowser(), ymd, changes, bitFields)`. 자동 저장은 칸처럼 아는 값·최신 값을 들고 목록이 달라졌을 때만(순서 무관) `save`에 넘긴다. 화면은 그 날의 `bitFields`를 알면(읽은 줄·맞춘 결과) 늘 같이 넘기고, 모르면 넘기지 않는다. 다시 읽은 `bit_fields`도 `serverDay`로 반영하고 돌려받은 목록으로 표시를 그린다(저장 안 된 목록은 그대로). TASK-6·10 시험의 `serverDay`·`pendingDay` 기대는 값은 그대로 두고 `.day`로 읽게 고친다
- 화면: 그날 읽기 상태가 `ready`이고 비트 답의 `ymd`가 고른 날과 같을 때만 `mergeBit` → 바뀌었으면 화면 값·`bitFields`를 바꾸고 `autosave.change`(서버로는 바뀐 칸만 간다). 답이 먼저 오면 들고 있다가 `ready` 뒤에 합치고, `error`인 날은 합치지 않는다([다시 불러오기]로 `ready`가 되면 합친다). 사람이 숫자 칸을 고치면 그 칸을 `bitFields`에서 뺀다. 초점 칸도 치기 전이면 새 값으로 맞춰 보이고(REQ-008), 친 뒤에는 손으로 적은 칸이라 `mergeBit`이 바꾸지 않는다
- `WorklogSheet`: `bitFields` prop → 그 칸에 표시 클래스(`sheet.module.css`, 인쇄에서 숨김). `BitNotice`: 안내 한 줄 + '다름' 목록(칸 이름은 그날 항목 이름, 없으면 기본 이름. 적은 값은 `cellShownText`) + 표시 설명 줄(`print:hidden`)
- 안내 문구는 design.md 20-5절 그대로(말끝 "~요")
- 시험: AC-017.1~017.6, 그리고 **AC-017.7**(표시가 저장된 날을 연결 안 됨 화면에서 비트 칸 밖 칸을 고침 → 저장 호출에 `bitFields` 없음 / 비트 칸을 손으로 고침 → 줄어든 목록을 보냄 / 앱 안 이동(`unmount`) 뒤 `flush` 저장도 표시를 지우지 않음 / `bitFields`를 모르는 저장은 `bit_fields`를 보내지 않음), **AC-017.8**(비트 답이 먼저 옴 → 그때 저장 호출 0, 서버 값이 있는 칸은 손으로 적은 칸으로 '다름'이 되고 덮지 않음 / 불러오기 실패 → `mergeBit`·저장 호출 0 / 날짜를 옮긴 뒤 온 옛 날짜 답 → 버림), 다시 읽은 목록이 표시로 보임(저장 안 된 목록은 그대로), 항목 이름을 고친 칸에도 비트 숫자가 채워지고 '다름' 목록에 그날 이름이 보임

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/worklog src/lib/worklog/autosave.test.ts   # AC-017.1~AC-017.8 + 앞 시험 그대로
npx vitest run src/components/ui/classes.test.ts src/app/theme.test.ts src/app/fonts.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-17 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-017.1 ~ AC-017.8이 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보는 서버로 가지 않는다 — 업무사항은 사용자 결정으로 서버에 두되 AI로 보내지 않고, 막는 모양은 저장하지 않는다. RLS, 비밀값)
3. 결과에 따라 `phases/worklog-4-bitfill/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 비트를 읽으려고 새 명령·새 Worker를 만들거나 통계 갈래 길을 쓰지 마라. 이유: `revenue.days` 하나를 불러 쓴다(design.md 20-1절)
- 지출·비고·업무사항을 비트로 채우지 마라. 이유: 손으로만(사용자)
- `bitFields`를 모를 때 `[]`을 보내지 마라. 이유: 저장된 비트 표시가 저장할 때마다 지워진다(AC-017.7)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
