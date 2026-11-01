# Step 4: rx-group-store

> **TASK-13** 묶음 저장 · **REQ-013** · AC-013.1 ~ AC-013.3
> Phase 2 `revenue-2-numbers` · Step 4 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-13 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-013에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-013.1**: `createRxGroupStore(client).listGroups()`: 내 병원 `rx_groups`를 `sortOrder` 순 `RxGroup[]`로(RLS가 내 줄만). 없으면 빈 목록. 읽기 실패는 빈 목록이 아니라 `E-REVENUE-GROUP-LOAD-FAILED`를 던진다
- **AC-013.2**: `saveGroups(after)`: `save_rx_groups` 함수를 한 번 불러 한꺼번에 저장하고 저장된 목록을 돌려준다. 보내는 묶음 칸은 `id`·`name`·`codes`·`sort_order`뿐(시험: 칸 이름 비교). 제안 다섯 개 처음 저장 → 다섯 개. 첫 호출이 실패해도 같은 목록으로 다시 부르면 다섯 개 모두(반쪽 저장 없음)
- **AC-013.3**: 저장 실패(이름 겹침 포함)는 `E-REVENUE-GROUP-SAVE-FAILED`(무엇이 "치료 묶음을 저장하지 못했어요" · 어떻게 "인터넷 연결과 이름이 겹치지 않는지 보고 [다시 저장]을 눌러 주세요"), 읽기 실패는 `E-REVENUE-GROUP-LOAD-FAILED`(무엇이 "치료 묶음을 불러오지 못했어요" · 어떻게 "[다시 불러오기]를 눌러 주세요"). 받은 목록은 그대로

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 6절(`rx_groups` 표·권한), 8-2절(저장 모양), 11절(통계가 다시 쓴다·오류 번호 겹침)
- `/src/lib/storage/revenue.ts`(Phase 2 Step 3, 가짜 클라이언트로 시험하는 법), `/src/lib/errors.ts`·`/src/types/errors.ts`
- 이전 step에서 만든 파일:
  - `src/types/rxGroups.ts`·`src/lib/revenue/treatments.ts` (Phase 2 Step 2)
  - `supabase/migrations/20261101000400_revenue.sql`의 `rx_groups`·`save_rx_groups` (Phase 2 Step 0)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-13)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/lib/storage/rxGroups.ts`
  - `src/lib/storage/rxGroups.test.ts`
  - `src/lib/errors.ts`
  - `src/lib/errors.test.ts`
  - `src/types/errors.ts`
- Tests:
  - `src/lib/storage/rxGroups.test.ts`
  - `src/lib/errors.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **서버 코드 없음**: 브라우저 Supabase 클라이언트 + RLS로만 저장한다 (ADR-004)
- **보내는 모양을 정해 둔다**: `name`·`codes`·`sort_order`만 새 객체로 만든다. `id`·`hospital_id`·`updated_at`은 보내지 않는다(DB가 채움). 고칠 때는 `id`로 줄을 고른다
- **이름이 일반적인 저장소**: `rxGroups.ts`는 통계 탭이 합친 뒤 다시 쓴다. 매출만의 일(코드 금액 등)을 넣지 않는다
- **겹치는 파일은 더하기만**: `errors.ts`·`types/errors.ts`에 `E-REVENUE-GROUP-SAVE-FAILED`·`E-REVENUE-GROUP-LOAD-FAILED` 두 항목(갈래 규칙 C3)

## 작업

### 1. `src/lib/storage/rxGroups.ts`
- design.md 8-2절 모양. `listGroups`: `select('id,name,codes,sort_order')` → `order('sort_order')` → `RxGroup[]`(`sort_order` → `sortOrder`). Supabase 오류면 `E-REVENUE-GROUP-LOAD-FAILED`를 던진다(빈 목록으로 바꾸지 않는다 — 화면이 제안 묶음으로 잘못 바꾸지 않게)
- `saveGroups(after)`: `client.rpc('save_rx_groups', { groups: after.map(g => ({ id: g.id, name: g.name, codes: g.codes, sort_order: g.sortOrder })) })` 한 번. 함수가 한 트랜잭션이라 도중 실패면 표는 그대로이고, id 없는 새 묶음은 같은 이름 줄을 고치므로 같은 목록으로 다시 불러도 결과가 같다(design.md 6절). 돌려받은 줄을 `RxGroup[]`로
- Supabase 오류 내용은 버리고 번호만 던진다

### 2. 시험 (가짜 클라이언트)
- 읽기 순서·모양, 빈 목록, 읽기 오류 → `E-REVENUE-GROUP-LOAD-FAILED`(빈 목록이 아님)(AC-013.1) · `rpc` 이름·보낸 칸이 `id`·`name`·`codes`·`sort_order`뿐(`hospital_id` 없음), 제안 다섯 개 저장, 첫 호출 실패 → 같은 목록 다시 → 다섯 개(AC-013.2) · 실패 → `E-REVENUE-GROUP-SAVE-FAILED`, 받은 목록 그대로, 두 오류 문구(AC-013.3)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-013.2 보내는 칸은 id·name·codes·sort_order뿐 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/lib/storage/rxGroups.test.ts src/lib/errors.test.ts   # AC-013.1~AC-013.3
python3 ~/.claude/harness/bin/tdd-run TASK-13 --expect green
npm run lint && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-2-numbers/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 실제 Supabase에 시험 줄을 쓰지 마라. 이유: 이 step 시험은 가짜 클라이언트로 한다. 실제 표는 사용자 OK 뒤 E2E에서만
- 받은 묶음 객체를 그대로(`...group`) 보내지 마라. 이유: 정해 둔 칸만 서버로 간다
- 묶음에 처방 이름·금액을 저장하지 마라. 이유: `rx_groups`는 묶음 이름과 코드 목록뿐이다(design.md 6절)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
