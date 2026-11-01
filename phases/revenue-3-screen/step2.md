# Step 2: group-editor

> **TASK-14** 묶음 고치기 화면 · **REQ-014** · AC-014.1 ~ AC-014.6
> Phase 3 `revenue-3-screen` · Step 2 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-14 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-014에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-014.1**: 치료별 매출 머리 [묶음 고치기] → 매출 탭 안 '치료 묶음 고치기' 화면(시안 3절, 2026-11-01 승인). [취소]는 고친 것 버리고 돌아가기
- **AC-014.2**: 묶음마다 이름 칸·처방 수·[묶음 지우기]·처방 줄(코드·이름·옮길 묶음 고르기, PC는 고른 달 금액도, 폰은 금액 숨김), 오른쪽(폰은 아래) '그 밖 처방' 목록과 찾기 칸, [새 묶음]. 처방 목록은 저장된 `sales_codes` 최근 13달 코드와 가장 늦은 이름, `_REST` 없음
- **AC-014.3**: 묶음 읽기가 성공했고 저장된 묶음이 없으면 제안 다섯 개로 채우고 "제안 묶음 · 아직 저장 안 함" 칩. 치료별 매출도 같은 표시. 읽기가 실패하면 제안으로 바꾸지 않고 "치료 묶음을 불러오지 못했어요" + [다시 불러오기], [묶음 고치기]는 누를 수 없음(시안)
- **AC-014.4**: 이름이 비거나 30자 넘거나 겹치거나 제어 문자·6개 이상 이어진 숫자면 그 칸 아래 이유 글(시안: "같은 이름의 묶음이 있어요. 다른 이름을 써 주세요."), 저장 안 함. 묶음 지우기는 확인 창(시안: "'○○' 묶음을 지울까요?" · "이 묶음의 처방 n개는 '그 밖 처방'으로 가요" · [취소]·[지우기])
- **AC-014.5**: [저장] 되면 매출 화면으로 돌아가 치료별 매출을 저장한 묶음으로 다시 그림. 실패하면 오류 카드 + [다시 저장], 고친 것 그대로
- **AC-014.6**: 폰·연결 안 된 PC에서도 편집 됨(서버 표만). 폰은 한 줄, 이름 칸·고르기·단추 44px 이상, 입력 글자 16px. 토큰·`ds`·상자 안 상자 없음

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 9절(묶음 고치기), 7절(고치기 함수), 8-2절(저장)
- `/docs/UI_GUIDE.md` — '입력'·'확인 창'·'오류 카드'·'휴대폰'
- `/src/components/claim/*`·`/src/components/admin/*`(확인 창·오류 카드·입력 모양 예)
- 이전 step에서 만든 파일:
  - `src/components/revenue/*` (Phase 3 Step 1)
  - `src/lib/revenue/treatments.ts`·`src/lib/storage/rxGroups.ts` (Phase 2 Step 2·4)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 시안 (화면 step)

- `docs/mockups/revenue/index.html` — 만든 코드 `docs/mockups/revenue/gen.py`(문구의 원천). 숫자는 모두 예시라 화면에 옮기지 않는다
- 시안의 앱 틀(위쪽 띠·탭 줄)은 이미 있는 `components/shell`이 그린다. 이 step은 본문만 만든다
- 시안과 명세가 다르면 명세가 이긴다. 다른 점은 summary에 적는다


## 수정 범위 (tasks.md TASK-14)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/revenue/groups/*`
  - `src/components/revenue/RevenueTreatments.tsx`
  - `src/components/revenue/RevenueScreen.tsx`
  - `src/components/revenue/RevenueScreen.test.tsx`
- Tests:
  - `src/components/revenue/groups/GroupEditor.test.tsx`
  - `src/components/revenue/RevenueScreen.test.tsx`
  - `src/components/ui/classes.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **시안 승인본**: 배치·문구는 `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 시안 3절 '치료 묶음 고치기'는 2026-11-01 사용자 승인 "묶음 화면 좋아요")의 글자 그대로다 (CLAUDE.md: 화면은 목업 승인 뒤)
- **모양 규칙**: `docs/UI_GUIDE.md` — 토큰 클래스와 `ds`(`components/ui/classes.ts`)만, 16진수·대괄호 임의 값·`font-bold`·`animate-*`·그라데이션·그림자 카드·상자 안 상자 없음. 말끝은 "~요". 숫자는 지어내지 않는다(자료 없으면 "–"와 "자료 없음")
- **그래프**: HTML 막대(% 높이·폭 inline style만), 가로 눈금선만, 그림은 `aria-hidden`, 숫자는 화면 읽기 표(`sr-only`)로도. 증감은 화살표와 글자("늘어남"·"줄어듦")를 같이. `components/charts/*`는 고치지 않고 불러 쓰기만
- **이 부분 시안은 OK 받음**: 시안 3절 '치료 묶음 고치기'와 묶음 50개 한도는 2026-11-01 사용자 OK다(`docs/mockups/revenue/README.md`). 이 step을 막는 것이 없다
- **고치기는 순수 함수로**: 이름·옮기기·지우기는 `treatments.ts`의 함수만 쓴다. 화면에서 따로 규칙을 만들지 않는다
- **저장은 [저장]을 누를 때만**: 제안 묶음을 저절로 저장하지 않는다. 저장은 `createRxGroupStore(...).saveGroups(after)` 한 번(DB 함수 `save_rx_groups`가 한꺼번에)
- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 건수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)

## 작업

### 1. 부품 (`src/components/revenue/groups/`)
- `GroupEditor.tsx`(`'use client'`): 입력 = 묶음 목록(저장된 것 또는 제안)·아는 처방(코드·이름·고른 달 금액, `_REST` 뺌). 상태는 고치는 중인 목록 하나(+ 확인 창·오류). 묶음 블록(이름 `input`, 처방 수, [묶음 지우기] → 확인 창), 처방 줄(코드·이름·금액·`select` 옮기기), '그 밖 처방' 칸(찾기 `input`으로 코드·이름 거르기), [새 묶음], [취소]·[저장](폰은 아래에 반씩)
- 이름 칸 검사 글은 칸 아래(입력 오류 모양, `aria-describedby`). 확인 창은 앱의 확인 창 모양(UI_GUIDE '오류 카드·확인 창')
- 시안 3절의 글자 그대로(예: "제안 묶음 · 아직 저장 안 함", "묶음 없음", "처방 이름이나 코드로 찾기")

### 2. 매출 화면에 잇기
- `RevenueTreatments.tsx`: 머리에 [묶음 고치기](보조 작은 단추, 폰 44px), 제안이면 칩
- `RevenueScreen.tsx`: 편집 중인지(`editing`)는 `RevenueScreen` 안의 화면 상태(`useState`)이고 `view.ts`의 보기 상태(AC-008.2)에 더하지 않는다. `editing`이면 네 덩어리 대신 `GroupEditor`. [저장]이 되면 `listGroups()`를 다시 읽고 보기 모양을 다시 만든다. 묶음 읽기가 실패한 상태에서는 [묶음 고치기]가 눌리지 않는다(`disabled`·`aria-disabled`)

### 3. 시험
- `GroupEditor.test.tsx`: 시안 글자·묶음 블록·처방 줄(폰은 금액 숨김 클래스)·그 밖 목록(AC-014.2), 제안 칩(AC-014.3), 빈 이름·31자·겹침·제어 문자·`01012345678` → 칸 아래 이유 글(`aria-describedby`)·저장 안 부름, 지우기 확인 창 글·[취소]는 그대로·[지우기]는 처방이 그 밖으로(AC-014.4), 저장 성공 → `onSaved`, 실패 → 오류 카드·[다시 저장]·고친 것 그대로(AC-014.5), 폰 44px·16px 입력 클래스(AC-014.6)
- `RevenueScreen.test.tsx`의 읽기 실패 사례: `listGroups`가 던지면 치료별 매출에 "치료 묶음을 불러오지 못했어요"·[다시 불러오기], 제안 칩 없음, [묶음 고치기] `disabled`(AC-014.3)
- `RevenueScreen.test.tsx`: [묶음 고치기] → 편집, [취소] → 돌아감, 저장 뒤 치료별 매출이 새 묶음으로(AC-014.1·014.5)

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-014.4 겹치는 이름이면 저장하지 않는다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/revenue   # AC-014.1~AC-014.6
npx vitest run src/components/ui/classes.test.ts src/guardrails.test.ts
python3 ~/.claude/harness/bin/tdd-run TASK-14 --expect green
npm run lint && npm run build && npm test
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가(새 npm·NuGet 패키지 없음)?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가?
3. 결과에 따라 `phases/revenue-3-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 시안 3절에 없는 모양·문구를 새로 만들지 마라. 이유: 사용자가 OK한 것은 그 그림이다(CLAUDE.md)
- 묶음을 고칠 때마다 서버에 저장하지 마라. 이유: [저장]을 누를 때 한 번만, [취소]는 아무것도 보내지 않는다
- 편집 화면에 환자 자료(이름·차트번호)를 보이지 마라. 이유: 처방 코드·이름·금액 합계만 다룬다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
