# Step 0: bit-contract

> **TASK-14** 비트 숫자 맞추기 규칙 · **REQ-014** · AC-014.1 ~ AC-014.8
> Phase 4 `worklog-4-bitfill` · Step 0 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-014에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-014.1**: `revenue.days` 하루 줄 → `total`→총진료비, `insurer`→조합청구액, `cash`→현금수납, `card`→카드수납, `transfer`→계좌이체, `receivableIn`→미수입금. 미수발생·지역화폐는 값 없음. `null` 칸도 값 없음
- **AC-014.2**: 신환 = `newPatients`, 재진 = `returnVisits`. `unconfirmed`인 날도 두 인원 칸은 채우고(`null`이 아니면) 금액 칸은 안 채움
- **AC-014.3**: 빈 칸 → 비트 값을 숫자 글자('125000')로 + 비트 칸
- **AC-014.4**: 비트 칸 → 바뀐 비트 값을 따라감
- **AC-014.5**: 적은 칸 → REQ-003 규칙으로 읽은 숫자가 비트 값과 같으면 아무 일 없음. 그 밖(다른 숫자·숫자 없음·합계 제외)은 그대로 두고 '다름'(적은 글자·비트 값)
- **AC-014.6**: [비트 숫자로 바꾸기] → 적은 글자를 덮고 비트 칸 / 사람이 고치면 비트 칸 아님
- **AC-014.7**: 지출·비고·업무사항·항목 이름은 안 건드림
- **AC-014.8**: 항목 이름을 고친 칸도 비트 값은 이름을 보지 않고 칸 위치(같은 DB 칸)에 들어감

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-014
- `/specs/worklog/design.md` — 20-1·20-2·20-3절
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/specs/revenue/design.md` 5-2·5-4절(main에 합쳐진 판) — `revenue.days` 답 칸
- `/src/types/revenue.ts`(`RevenueDayRow`)·`/src/lib/bridge/commands.json` (매출 갈래가 넣은 것)
- `/src/types/worklog.ts`·`/src/lib/worklog/cellText.ts`(`readCell`) (Phase 1)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/worklog/bitFill.ts`
  - `src/lib/worklog/bitFill.test.ts`
- Tests:
  - `src/lib/worklog/bitFill.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **기다림(Phase 4 공통, 아니면 바로 `blocked`)**: `origin/main`의 `src/lib/bridge/commands.json`에 `"revenue.days"`가 있고 그 main이 이 브랜치에 합쳐져 있다. 확인: `git fetch origin && git show origin/main:src/lib/bridge/commands.json | grep -q '"revenue.days"' && grep -q '"revenue.days"' src/lib/bridge/commands.json`. 합치기는 이 step이 하지 않는다 — 없으면 `blocked`(사유: "매출 갈래 revenue.days가 main에 들어와 이 브랜치에 합쳐져야 함")
- 순수 함수다: 통로·supabase·React를 부르지 않는다. 매출 타입만 `import type`으로 쓴다
- 비트 숫자는 `revenue.days` 한 줄에서만 온다. 통계 갈래 길(`readDays`·`DayPayload`·`stats.rows`)을 쓰지 않는다
- 비트 값이 없으면 지어내지 않는다(0으로 채우지 않는다). '확인 필요' 날은 금액 칸만 비운 채 둔다
- **칸 위치로 채운다**(사용자 결정 3): 항목 이름을 읽거나 견주지 않는다
- 적은 글자를 몰래 덮지 않는다. 숫자를 짐작하지 않고 `readCell` 규칙만 쓴다

## 작업

design.md 20-3절의 `BIT_FILL_KEYS`(여덟 칸)·`bitValuesFrom(revenueDay)`·`mergeBit`·`takeBitValue`. 칸 맞춤은 이 표 그대로(design.md 20-2절):

| 업무일지 칸 | `revenue.days` 칸 | 비고 |
|---|---|---|
| 신환 `newPatients` | `newPatients` | `unconfirmed`인 날도 채움 |
| 재진 `returnPatients` | `returnVisits` | `unconfirmed`인 날도 채움 |
| 총진료비 `totalFee` | `total` | |
| 조합청구액 `claimAmount` | `insurer` | |
| 현금수납 `cashIn` | `cash` | |
| 카드수납 `cardIn` | `card` | |
| 계좌이체 `transferIn` | `transfer` | |
| 미수입금 `unpaidPaid` | `receivableIn` | |
| 미수발생 `unpaidNew`·지역화폐 `localCurrencyIn` | — | 계약에 생기기 전에는 안 채움 |

- 매출 쪽에 더해진 `copay`·`otherTotal`은 이 표에 없고 쓰지 않는다
- 비트 값은 숫자 글자로 넣는다(`String(값)`). `BitMerge.differs`는 `{ key, typed: 적은 글자, bit: 숫자 }`(design.md 20-3절)
- main의 `RevenueDayRow` 칸 이름이 위와 다르면 멈추고 `blocked`(사유: 매출 계약과 업무일지 표가 다름 — 명세 고침 필요)
- 시험: 칸 맞춤(가짜 둥근 숫자), **`unconfirmed`인 날 신환·재진은 채워지고 금액 여섯 칸은 없음**, `null` 칸, 미수발생·지역화폐는 늘 없음, 빈 칸 채움(숫자 글자), 비트 칸 따라감, 적은 칸: '125,000원'·'125,000 별도' 같음 / '120,000'·'별도 보고'·'2건 125,000' 다름(적은 글자 그대로), 바꾸기, 지출·비고·업무사항·항목 이름은 그대로, **항목 이름을 고친 칸도 같은 칸에 채움**

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-002.2: 수납액은 현금·카드·계좌·지역화폐만 더한다', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/worklog/bitFill.test.ts   # AC-014.1~AC-014.8
python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-014.1 ~ AC-014.8이 이 TASK의 시험과 이어져 보여야 한다

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

- 매출 명령·답 검사·도우미를 고치거나 새 도우미 명령·Worker를 만들지 마라. 이유: 사용자·조정 담당 결정 — 두 번째 읽기 코드를 만들지 않는다
- main을 이 브랜치에 합치거나 rebase하지 마라. 이유: 합치기는 메인 세션이 사용자 지시로 한다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`docs/*`를 고치지 마라. 이유: 이 step의 범위가 아니고, 규칙 문서는 Phase 1 Step 0과 사용자 승인으로만 바뀐다
