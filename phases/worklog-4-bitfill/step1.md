# Step 1: clinic-check

> **TASK-15** 의원 PC 확인 · **REQ-015** · AC-015.1 ~ AC-015.2
> Phase 4 `worklog-4-bitfill` · Step 1 — `specs/worklog/tasks.md`
> 명세 `specs/worklog/`는 승인됐다. 이 step은 TASK-15 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/worklog/requirements.md`의 REQ-015에 있다. 아래는 요약이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-015.1**: 엑셀 사흘 × 비트 외래환자경영통계 → `docs/worklog/bit-check.md`에 칸마다 같음 / 다름(어떻게) / 비트에 없음
- **AC-015.2**: 기본 표와 다르면 다음 step 전에 명세 고침 + 다시 승인

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/docs/ADR.md` — 특히 ADR-004·008·019와 끝의 업무일지 ADR(Phase 1 Step 0이 더함)
- `/specs/worklog/requirements.md` — REQ-015
- `/specs/worklog/design.md` — 20-2·20-6절
- `/specs/worklog/tasks.md` — 이 TASK의 수정 범위·메모
- 승인된 시안 `/docs/mockups/worklog/index.html` (화면 step이면 꼭)
- `/src/lib/worklog/bitFill.ts` (Step 0 — 실제로 채우는 칸 목록)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 수정 범위 (tasks.md TASK-15)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `docs/worklog/bit-check.md`
- Tests:
  - `없음(사용자 확인)`
- TDD: exempt — 사용자가 의원 PC에서 확인한다

## 꼭 지킬 규칙 (CRITICAL)

- 실제 매출 숫자·환자 정보를 문서·채팅에 적지 않는다. 결과는 "같음 / 다름(어떻게) / 비트에 없음" 낱말만
- 확인은 총괄이 한다. Claude는 확인표를 만들고 쉬운 말로 안내한 뒤 `blocked`(사유: "의원 PC 확인 답 기다림")로 멈춘다. 답이 오면 표를 채우고 completed

## 작업

- `docs/worklog/bit-check.md`: 칸 9줄(신환·재진, 총진료비, 조합청구액, 현금수납, 카드수납, 계좌이체, 미수발생·미수입금, 지역화폐) × 사흘(환불 없는 날 둘, 환불 있는 날 하나) 표, 칸마다 결과 낱말과 메모(예: "비트는 공단부담만, 엑셀 조합청구액은 공단+보훈")
- 안내(채팅, 쉬운 말 3~4줄): 어느 날 엑셀을 열고, 비트 '외래환자경영통계'에서 같은 날을 열어, 칸마다 같은지만 알려 달라고
- 결과가 design.md 20-2절 기본과 다르면 summary에 "명세 고침 필요: …"를 적고 completed 대신 `blocked`(사유: 명세 다시 승인 필요)


## Acceptance Criteria

```bash
test -f docs/worklog/bit-check.md
python3 ~/.claude/harness/bin/verify
```

- 위 커맨드가 모두 에러 없이 끝나야 한다. `verify`는 SDD 사후 점검 + lint → build → test를 한 번에 돈다
- `python3 ~/.claude/harness/bin/sdd status worklog`에서 AC-015.1 ~ AC-015.2가 이 TASK의 시험과 이어져 보여야 한다

## 검증 절차

1. 위 AC 커맨드를 실행한다.
2. 아키텍처 체크리스트를 확인한다:
   - ARCHITECTURE.md 디렉토리 구조를 따르는가?
   - ADR 기술 스택을 벗어나지 않았는가?
   - CLAUDE.md CRITICAL 규칙을 위반하지 않았는가? (환자 개인정보·업무사항은 서버로 가지 않는다, RLS, 비밀값)
3. 결과에 따라 `phases/worklog-4-bitfill/index.json`의 해당 step을 업데이트한다:
   - 성공 → `"status": "completed"`, `"summary": "산출물 한 줄 요약"`
   - 수정 5회 시도 후에도 실패 → `"status": "error"`, `"error_message": "구체적 에러 내용"`
   - 사용자 개입 필요 (API 키, 외부 인증, 실제 Supabase에 SQL 붙여 넣기 등) → `"status": "blocked"`, `"blocked_reason": "구체적 사유"` 후 즉시 중단

- `index.json`은 `python3`로 JSON을 읽고 써서 고친다(이 파일은 TASK 수정 범위 밖이라 편집 도구는 훅이 막을 수 있다). 다른 칸과 다른 step은 건드리지 않는다
- `summary`는 다음 step 프롬프트에 그대로 전달된다. 만든 파일, 정한 이름·모양, 다음 step이 알아야 할 결정을 한 줄에 담는다

## 금지사항

- 결과를 기다리지 않고 기본값으로 채우지 마라. 이유: 칸이 틀리면 잘못된 돈 숫자가 저절로 들어간다
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 실제 Supabase에 SQL을 실행하거나 붙여 넣지 마라(대시보드·CLI·REST 모두). 이유: DB 바꾸기는 사용자 OK가 필요하다(design.md 8절)
- 시험·고정 자료에 실제 의원 숫자(엑셀 10월 값)·환자 이름·차트번호·전화번호를 쓰지 마라. 이유: 가짜 자료만 쓴다(CLAUDE.md). 둥근 가짜 숫자(예: 100000)와 "가상" 글자를 쓴다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`를 고치지 마라. 이유: 이 step의 범위가 아니다
