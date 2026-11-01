# Step 0: stats-mockup

> **TASK-12** 통계 화면 목업 (사용자 승인) · **REQ-512** · AC-512.1 ~ AC-512.2
> Phase 4 · 화면 `stats-4-screen` · Step 0 — `specs/stats/tasks.md`
> 명세 `specs/stats/`가 승인된 뒤에만 시작한다(`python3 ~/.claude/harness/bin/sdd status stats`). 이 step은 TASK-12 하나만 한다. 다른 TASK의 일은 하지 않는다.

## 이 step이 맞출 수용 기준 (AC)

전체 문장은 `/specs/stats/requirements.md`의 REQ-512(통계 화면 목업 (문서))에 있다. 아래는 같은 글이다. 시험 이름에 이 AC ID를 넣는다.

- **AC-512.1**: Given `docs/mockups/stats/index.html`·`notes.md`, When 열면, Then 화면 1 PC 불러온 뒤 · 화면 2 PC 처음(저장된 숫자 없음) · 화면 3 휴대폰(저장된 숫자만) · 화면 4 그래프 자세히 열림 · 화면 5 불러오는 중·저장 실패·확인 필요가 있고, REQ-513·REQ-514의 섹션·문구·기간 단추·증감 ▲▼가 보인다. 숫자는 모두 예시이고 화면 위에 "예시 숫자" 표시가 있다. 모양은 `docs/UI_GUIDE.md`와 ui-90 시안(`docs/mockups/ui-90/app/`)의 토큰·글자 단계를 따른다
- **AC-512.2**: Given 사용자 승인, When 기록하면, Then `notes.md` 맨 위에 승인 날짜·온라인 링크가 있다. 승인 전에는 TASK-13~16을 시작하지 않는다(CLAUDE.md: 화면은 목업 승인 뒤)

## 읽어야 할 파일

먼저 아래 파일들을 읽고 프로젝트의 아키텍처와 설계 의도를 파악하라:

- `/CLAUDE.md` (CRITICAL 규칙·기술 스택·명령어)
- `/docs/ARCHITECTURE.md`
- `/specs/stats/requirements.md` — REQ-512
- `/specs/stats/design.md` — '구성 요소 / 인터페이스' TASK-12~14, '사용자에게 물을 것'
- `/specs/stats/tasks.md` — TASK-12 (수정 범위·메모)
- `/docs/UI_GUIDE.md` (토큰·글자 단계·차트·빈 상태·앱 틀)
- `/docs/mockups/ui-90/app/gen.py`·`css_app.css`·`css_page.css`·`app.js` (앱 시안 만드는 도구 — 같은 방식으로)
- `/docs/mockups/dashboard-home/notes.md` (대시보드 기간별 흐름·보고 문장 문구)
- `/docs/mockups/tab-frame/index.html` (옛 시안의 통계 탭 내용, 참고만)
- `/specs/stats/requirements.md` — REQ-511·513·514 (화면에 보일 것)
- 사전점검 시안 화면 9 '통계 추가분'(`id="v-stats"`): https://claude.ai/artifact/499cp2Sodph7jYJ4gX4exj (참고만)
- 이전 step에서 만든 파일: TASK-11 (화면 숫자 — 시안의 칸 이름과 맞춘다)

이전 step에서 만들어진 코드를 꼼꼼히 읽고, 설계 의도를 이해한 뒤 작업하라.

## 승인된 목업

- 이 step이 목업을 만든다. 승인 전에는 TASK-13~16을 시작하지 않는다(CLAUDE.md: 화면은 목업 승인 뒤)

## 수정 범위 (tasks.md TASK-12)

이 목록에 있는 경로만 만들고 고칠 수 있다(glob 허용). 밖의 파일은 SDD 훅이 막는다.

- Files:
  - `docs/mockups/stats/index.html`
  - `docs/mockups/stats/notes.md`
  - `docs/mockups/stats/gen.py`
- TDD: exempt — 정적 시안과 메모만 만든다. 앱 코드가 없다
- 메모: 끝 조건: 온라인 시안 링크를 사용자에게 드리고 승인을 받는다. 승인 전에는 step을 `blocked`(사유: 목업 승인 대기)로 둔다. 승인 뒤 고칠 곳이 나오면 시안을 고치고 다시 묻는다. 승인본이 이 명세의 화면 AC와 다르면(차례·문구) AC-513.1의 '목업이 이긴다'를 따르고, 동작이 다르면 명세를 고쳐 다시 승인받는다

## 꼭 지킬 규칙 (CRITICAL)

- **화면은 승인된 목업대로**: 배치·문구·상태는 `docs/mockups/stats/` 승인본(`notes.md` 맨 위 승인 기록)을 따른다. 모양은 `components/ui/classes.ts`의 `ds`와 `globals.css` 토큰만(옛 `ui.`·옛 Tailwind 이름·`font-bold` 없음, 굵기 400·500·600). 좋고 나쁨은 색만 쓰지 않고 ▲▼·글자를 같이 쓴다. 그래프는 움직이지 않는다. 상자 안 상자 금지 (CLAUDE.md, docs/UI_GUIDE.md)
- **가짜 자료만**: 실제 환자 자료를 쓰지 않는다. 시험은 `fixtures/`의 가짜 자료와 시험 안에서 만든 가짜 값만 쓴다(차트번호는 `9`로 시작하는 6자리 가짜, 이름·전화·주민번호 없음). 차트번호·주민번호 모양은 소스에 통째로 쓰지 않고 조각을 이어 만든다(stats-core 규칙). 실제 비트 내보내기를 커밋하지 않는다 (CLAUDE.md)

## 작업

### 1. 시안 (`docs/mockups/stats/gen.py` → `index.html`)
- ui-90 시안 도구와 같은 방식(같은 css·글꼴·앱 틀)으로 통계 탭 화면을 만든다. 화면 1 PC 불러온 뒤 · 화면 2 PC 처음(저장된 숫자 없음) · 화면 3 휴대폰 390(저장된 숫자만, PC 전용 섹션은 "비트 PC에서 불러오면 보여요") · 화면 4 그래프 자세히 열림(환자 수 추이 숫자 표·처방 하나의 추세) · 화면 5 불러오는 중·저장 실패(`E-SAVE-FAILED` + [다시 저장])·확인 필요(일부 기록) (AC-512.1)
- 섹션 차례(AC-513.1)·기간 단추(AC-514.2)·자료 고르기([비트에서 불러오기]·"오늘 진료 끝"·파일)·출처 줄(AC-514.7)·▲▼ 증감·보고 문장 고르기(일일 오늘·어제 / 월말 이번 달·지난달)·[복사]·'확인 필요' 표시
- 숫자는 모두 예시이고 화면 위에 "예시 숫자" 띠(시안에만). 환자 이름·차트번호 모양을 쓰지 않는다

### 2. 메모 (`docs/mockups/stats/notes.md`)
- 화면마다 문구·상태·배치(1440·1024·768·390)·모양 값(`ds` 키·토큰·글자 단계·간격), 빈 상태 문구, 자세히 단추 동작. 시안과 명세가 다르면 무엇이 이기는지(AC-513.1)

### 3. 승인 받기
- 온라인 시안(artifact)으로 올려 링크를 summary에 적고 `blocked`(사유: "목업 승인 대기 — 링크")로 멈춘다. 메인 세션이 사용자에게 쉬운 말로 보이고 승인을 받는다
- 승인되면(다음 실행) `notes.md` 맨 위에 "승인: 2026-MM-DD · 링크"를 적고 `completed`(AC-512.2). 고칠 곳이 나오면 시안·메모를 고치고 다시 `blocked`

## TDD

- `TDD: exempt` — 정적 시안과 메모만 만든다. 앱 코드와 시험이 없다. `tdd-run`을 부르지 않는다

## Acceptance Criteria

```bash
test -f docs/mockups/stats/index.html && test -f docs/mockups/stats/notes.md
grep -q '예시 숫자' docs/mockups/stats/index.html
grep -q '^승인:' docs/mockups/stats/notes.md   # 승인 뒤에만 통과
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

- 앱 코드(`src/`)를 만들거나 고치지 마라. 이유: 화면은 목업 승인 뒤에만 구현한다(CLAUDE.md)
- 승인 없이 `notes.md`에 승인 줄을 쓰지 마라. 이유: 승인은 사용자만 한다
- 시안에 실제 숫자·환자 이름·차트번호 모양을 넣지 마라. 이유: 예시 숫자만(CLAUDE.md 개인정보)
- 명세의 동작(무엇이 어디서 오는지·저장 규칙)을 시안에서 바꾸지 마라. 이유: 동작이 달라지면 명세를 고쳐 다시 승인받아야 한다(TASK-12 끝 조건)
- 기존 테스트를 깨뜨리지 마라. 이유: 지금 통계 엔진·청구·탭 틀 시험이 계속 통과해야 한다(이 TASK의 Files에 있는 시험만, 정한 칸만 고친다)
- `specs/` 아래 파일(requirements·design·tasks·approval·tdd-log)을 고치지 마라. 이유: 승인 해시가 바뀌면 승인이 풀려 모든 구현이 막힌다. 명세와 다른 점을 찾으면 고치지 말고 summary에 적는다
- `specs/precheck/`·`phases/precheck-*`를 고치지 마라. 이유: 청구 브랜치가 그 파일을 가진다. 그쪽이 할 일은 `specs/stats/design.md` '사전점검 명세가 할 일'에 적혀 있다
- 위 '수정 범위' 밖의 파일을 만들거나 고치지 마라. 이유: SDD 훅이 막고 Stop 점검이 '범위 밖'으로 실패한다. 꼭 필요하면 `blocked`로 멈추고 어떤 파일이 왜 필요한지 적는다
- 시험을 지우거나, 건너뛰거나(`skip`·`only`), 기대값을 약하게 바꿔 통과시키지 마라. 이유: AC와 시험의 연결이 끊겨 명세를 지켰는지 알 수 없게 된다
- 새 npm·NuGet 패키지를 넣지 마라. 이유: `package.json`·csproj가 수정 범위 밖이고 ADR 기술 스택 밖이다
- `git commit`·`git push`를 하지 마라. 이유: 커밋은 harness-reviewer PASS 뒤에 execute.py(또는 메인 세션)가 한다
- `.harness/*`·`CLAUDE.md`·`plan.md`를 고치지 마라 (`docs/mockups/stats/`는 이 step 범위다). 이유: 이 step의 범위가 아니고, 규칙 문서는 사용자 승인으로만 바뀐다
