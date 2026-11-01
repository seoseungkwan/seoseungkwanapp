# Step 0: revenue-view

> **TASK-8** 화면 보기 모양 · **REQ-008** · AC-008.1 ~ AC-008.5
> Phase 3 `revenue-3-screen` · Step 0 — `specs/revenue/tasks.md`
> 명세 `specs/revenue/`가 승인된 뒤에만 한다(`python3 ~/.claude/harness/bin/sdd status revenue`로 확인. 승인 전이면 `blocked`). 이 step은 TASK-8 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/revenue/requirements.md`의 REQ-008에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-008.1**: `buildRevenueView(input)`: 네 덩어리(매출 추이 · 급여·비급여 · 치료별 매출(묶음별, 저장된 묶음이 없으면 제안 묶음과 "제안 묶음 · 아직 저장 안 함" 표시) · 환자 1인당 평균 진료비(환자 한 명 기준)) 글자와 막대 높이·폭(0~100 %, 소수 둘째 자리). 큰 금액은 "1억 6,248만 원"(만 원 아래 버림), 화면 읽기 표는 원 단위
- **AC-008.2**: 상태: `connect-needed`·`fetching`(done/total)·`ready`(가져오지 못한 달 목록 포함)·`empty`·`helper-old`·`extension-old`·`saved-only`(마지막 가져온 시각)·`error`(번호)
- **AC-008.3**: 확인 필요한 날이 있으면 "확인 필요한 날 n일"과 날짜, 합계에서 뺐고 1인당 평균이 낮게 보일 수 있다는 말. 없으면 "없음"
- **AC-008.4**: 몫·증감 소수 첫째 자리 버림, 빼기 U+2212, 자료 없는 칸 "–"와 "자료 없음", 지어낸 숫자 없음
- **AC-008.5**: 막대 눈금은 `components/charts/scale.ts`의 `niceScale`

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·016·020·021
- `/specs/revenue/requirements.md` — 맨 위 승인 줄(시안 승인·사용자 결정 2026-11-01)과 이 step의 REQ
- `/specs/revenue/design.md` — 이 step이 가리키는 절
- `/specs/revenue/tasks.md` — 머리말과 이 step의 TASK
- `/specs/revenue/design.md` — 9절(화면), 7절(계산 함수)
- `/docs/UI_GUIDE.md` — '차트'·'빈 상태'·'문구'
- `/src/components/dashboard/summary/view.ts`(보기 모양을 순수 함수로 만드는 예)
- `/src/components/charts/format.ts`·`scale.ts`
- 이전 step에서 만든 파일:
  - `src/lib/revenue/summary.ts`·`treatments.ts`·`sync.ts`, `src/lib/storage/revenue.ts` (Phase 2)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 시안 (화면 step)

- `docs/mockups/revenue/index.html` — 만든 코드 `docs/mockups/revenue/gen.py`(문구의 원천). 숫자는 모두 예시라 화면에 옮기지 않는다
- 시안의 앱 틀(위쪽 띠·탭 줄)은 이미 있는 `components/shell`이 그린다. 이 step은 본문만 만든다
- 시안과 명세가 다르면 명세가 이긴다. 다른 점은 summary에 적는다


## 수정 범위 (tasks.md TASK-8)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `src/components/revenue/view.ts`
  - `src/components/revenue/view.test.ts`
  - `src/components/revenue/money.ts`
  - `src/components/revenue/money.test.ts`
- Tests:
  - `src/components/revenue/view.test.ts`
  - `src/components/revenue/money.test.ts`
- TDD: required

## 꼭 지킬 규칙 (CRITICAL)

- **시안 승인본**: 배치·문구는 `docs/mockups/revenue/index.html`(만든 코드 `gen.py`, 2026-11-01 사용자 승인 "이대로 만들기")의 글자 그대로다 (CLAUDE.md: 화면은 목업 승인 뒤)
- **모양 규칙**: `docs/UI_GUIDE.md` — 토큰 클래스와 `ds`(`components/ui/classes.ts`)만, 16진수·대괄호 임의 값·`font-bold`·`animate-*`·그라데이션·그림자 카드·상자 안 상자 없음. 말끝은 "~요". 숫자는 지어내지 않는다(자료 없으면 "–"와 "자료 없음")
- **그래프**: HTML 막대(% 높이·폭 inline style만), 가로 눈금선만, 그림은 `aria-hidden`, 숫자는 화면 읽기 표(`sr-only`)로도. 증감은 화살표와 글자("늘어남"·"줄어듦")를 같이. `components/charts/*`는 고치지 않고 불러 쓰기만
- **환자 자료는 PC 밖으로 안 나간다**: 서버(Supabase)에는 날짜별 합계 금액·건수(내원·신환·재진·환자 수)·확인 필요 여부와 달별 처방 코드·건수·금액만 간다. 환자 수는 도우미가 비트 DB 안에서 센다. 이름·차트번호·접수 번호·주민번호는 어디에도(답·저장·기록·시험 자료) 없다. 가짜 자료만 쓴다 (CLAUDE.md, design.md 1·3절)
- **금액**: 원 단위 정수. 반올림하지 않고 원 미만은 버린다. 합계는 항목 금액의 합 (CLAUDE.md, ADR-008). 비율은 소수 첫째 자리 버림
- **순수 함수**: `view.ts`·`money.ts`는 React·네트워크·저장소를 쓰지 않는다. 글자는 시안 `gen.py`의 글자 그대로

## 작업

### 1. `money.ts`
- `formatManWon(n)`: `n`을 만 원 아래 버림 → "1억 6,248만 원" / "6,728만 원" / "2억 원" / 1만 원 미만은 "0만 원"이 아니라 `formatWon`으로. `formatWon(n)`: "86,795원"

### 2. `view.ts`
- 입력: `{ days, codes, groups, fetchedAt, month, today, bridge: 'ready' | 'none' | 'helper-old', sync: { state: 'idle' | 'running' | 'error'; done?; total?; code? } }` · `groups`는 `listGroups()` 결과(빈 목록이면 `suggestGroups(아는 코드)`로 세고 `suggested` 표시) 또는 `'load-failed'`(읽기 실패: 치료별 매출 자리에 "치료 묶음을 불러오지 못했어요"와 [다시 불러오기], 제안으로 바꾸지 않음)
- 상태 고르기(AC-008.2): `helperOld` → `helper-old`; `extensionOld` → `extension-old`; sync 실행 중 → `fetching`; `stopped` 번호 → `error`; 연결 안 됨 + 저장된 줄 없음 → `connect-needed`; 연결 안 됨 + 줄 있음 → `saved-only`; 고른 달 `sumPeriod`가 `null` → `empty`; 그 밖 `ready`(`failed` 달이 있으면 "n달을 가져오지 못했어요" 글자 함께)
- 덩어리 글자(시안 그대로): 매출 추이 KPI 넷(고른 달 매출·하루 평균 / 지난달보다 / 작년 같은 달보다 / 확인 필요한 날), 13달 막대(고른 달·작년 같은 달·다른 달 구분), 급여·비급여·기타 표(급여 아래 공단부담·본인부담, 비급여, 기타, 합계 = 매출 = 총진료비, 몫, 지난달보다)와 13달 세 겹 쌓은 막대, 치료별 순위 막대(금액·몫·건수, '그 밖 처방'), 환자 1인당 평균 KPI 넷(1인당 평균 "매출 ÷ 환자 n명" / 지난달보다 / 작년 같은 달보다 / 환자 수 "내원은 n번")과 13달 막대, 안내(같은 환자 여러 번은 한 명, 확인 필요한 날이 있으면 낮게 보일 수 있음)
- 막대 %: 값 / `niceScale(최대).max` × 100, 소수 둘째 자리 버림. 순위 막대 폭은 '그 밖' 아닌 최대 대비(UI_GUIDE '순위 막대')
- 화면 읽기 표 자료(제목·머리·줄, 원 단위)

### 3. 시험
- 예시와 같은 가짜 숫자로 시안의 글자가 나오는지(예: 162,480,350 → "1억 6,248만 원", +4.0%, 56.0%·41.4%·2.5% 버림, 86,795원·1,872명)(AC-008.1·008.4) · 상태 일곱 가지(AC-008.2) · `groups`가 `'load-failed'`면 치료별 매출 자리가 "치료 묶음을 불러오지 못했어요"·[다시 불러오기]이고 제안 묶음·제안 칩이 없음(AC-008.1) · 확인 필요 2일/없음, `lowered` 안내(AC-008.3) · 눈금(AC-008.5) · 자료 없는 달 막대 없음

## TDD 순서

1. 시험을 먼저 쓴다. 시험 이름(`describe`·`it`)에 AC ID를 넣는다. 예: `it('AC-008.1 1억 6,248만 원으로 보인다 …', …)`
2. `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect red` 로 실패(RED)를 확인하고 기록한다. RED 기록 전에는 구현 파일을 고칠 수 없다(훅이 막는다). 설정 파일과 시험 파일은 RED 전에도 고칠 수 있다
3. 구현하고 `python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green` 으로 통과(GREEN)를 기록한다
4. 정리(REFACTOR)한 뒤 다시 green을 확인한다. 시험을 지우거나 약하게 바꿔 통과시키지 않는다

## Acceptance Criteria

```bash
npx vitest run src/components/revenue/view.test.ts src/components/revenue/money.test.ts   # AC-008.1~AC-008.5
python3 ~/.claude/harness/bin/tdd-run TASK-8 --expect green
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
3. 결과에 따라 `phases/revenue-3-screen/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (사용자 확인·외부 설정 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 시안의 예시 숫자를 코드·시험 기대값 밖에 넣지 마라. 이유: 실제 화면에 지어낸 숫자가 보이면 안 된다(UI_GUIDE '하지 마라')
- `components/charts/*`를 고치지 마라. 이유: 다른 화면(대시보드·미리보기)이 같이 쓴다. 불러 쓰기만
- 문구를 새로 지어내지 마라. 이유: 시안 승인본 글자 그대로다. 시안에 없는 글은 같은 말투("~요")로 짧게 하고 summary에 적는다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 기존 테스트를 깨뜨리지 마라. 이유: 앞 TASK와 다른 기능(청구 사전점검 등)의 시험이 계속 통과해야 한다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 규칙 문서는 사용자 승인으로만 바뀐다
