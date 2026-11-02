# 나중에 고칠 것 (AS 목록)

AI 리포트 탭(PR #18)을 2026-11-02에 운영에 올린 뒤 정리했다. 아래는 **아직 하나도 고치지 않았다.**

- 코드를 고칠 때는 명세(`/sdd`)를 먼저 승인받는다. 문서나 주석만 고치는 일은 그렇지 않다.
- 합쳐도 자동 배포되지 않는다. 운영 배포는 사용자가 "배포해"라고 한 뒤에만 한다(ADR-013).
- 자세한 근거는 `specs/ai-report-screen/`에 있다.

## 먼저 할 것

### 1. 통계 숫자를 AI 리포트에 연결하기 (이게 돼야 진짜 리포트가 나온다)
- 지금 상태: `src/app/api/ai/store.ts`의 `loadReportMonths`는 늘 세 달 모두 없음을 돌려준다. 그래서 어느 달이든 '이 달 통계가 아직 없어요'만 나온다.
- 문제: 주석과 `specs/ai-report-screen/requirements.md`는 "통계 명세가 바꾼다"고 적었는데, `feat-stats`(8c2e38c 기준)에는 맡은 곳이 없다. 표 이름도 `months`에서 `stats_months`로 바뀌었다.
- 할 일: 통계가 main에 들어온 뒤 AI 쪽 새 명세로 연결한다. 통계 창도 AI 쪽이 맡는 게 낫다고 봤다. 사용자의 최종 답은 아직 없다.
- 함께 고칠 글: `tasks.md`의 "통계 명세가 들어오기 전에는" 문장, 처음 달 `REPORT_FIRST_MONTH = '2026-01'`.

### 2. AI에게 주는 숫자 이름을 접수 기준에 맞추기 (1번과 함께)
- 지금 상태: `src/lib/ai/input.ts`의 이름이 `'전체 환자'`인데 실제 숫자는 접수 건수다. 같은 날 두 번 오면 2건이다. 이대로면 AI가 "환자 ○○명"이라고 잘못 쓸 수 있다.
- 확인할 것: 통계 창이 말한 "접수 기준 외래 문구"의 정확한 글은 그 창에서 전해 들은 내용이다. 고치기 전에 사용자에게 확인한다. `src/lib/ai/prompt.ts`의 설명 글도 함께 본다.

### 3. 로그인 전 첫 화면의 "준비 중" 표시 고치기
- 지금 상태: `src/components/landing/AiSection.tsx`의 26·36번 줄. 탭은 켜졌는데 첫 화면은 "AI 리포트 탭"에 "준비 중" 칩을 단다. 사용자에게 보인다.
- 함께 고칠 것: `src/components/landing/middle.test.tsx`(AC-421.4)가 이 글자를 못 박았고, `docs/UI_GUIDE.md`의 랜딩 `#ai` 줄에도 적혀 있다.
- 참고: 진짜 리포트는 1번 뒤에 나오므로 그때까지 두어도 틀린 안내는 아니다.

### 4. 열쇠 넣고 진짜 리포트 시험하기 (맨 마지막, 사용자 결정)
1. Anthropic 콘솔에서 열쇠를 받고 월 사용 한도를 건다.
2. PowerShell에서 `npm run ai:key` → `npm run ai:try`로 진짜 리포트 글을 읽어 본다. 1회 약 100원으로 추정했다.
3. Vercel 환경 변수에 `ANTHROPIC_API_KEY`를 넣고 배포한다.

## 연결한 뒤 눈으로 볼 것
지금은 볼 수 없어서 아무도 확인하지 못했다.

- 진짜 리포트 화면, [복사] 단추, [다시 분석]과 확인 창
- 분석 도중 로그인이 끊겼을 때
- 숫자가 바뀌었다는 표시
- `npm run ai:key`의 숨김 입력(실제 터미널에서 아직 안 돌려 봄)
- `feat-auth-hardening`이 합쳐질 때: `app-active` 쿠키로 로그인이 끊겨도 탭이 로그인 화면으로 잘 가는지

운영에서 확인한 것은 '아직 만들지 않았어요' → [AI 분석] → '이 달 통계가 아직 없어요' → [통계 탭으로]까지다(사용자, 오류 없음).

## 대시보드 (AI 리포트와 별개)

### 저장해 둔 숫자를 먼저 보여 주기 (`bit-dashboard` TASK-8)
- 지금 상태: `/dashboard`는 열 때마다 도우미로 비트에서 직접 읽는다. 읽는 동안 기다려야 하고, 도우미가 없는 컴퓨터·휴대폰에서는 숫자 없이 나온다. `src/components/dashboard/summary/source.ts`의 `dashboardSummarySource()`가 늘 자료 없음(`{ kind: 'none' }`)을 돌려주기 때문이다.
- 할 일: 통계에 저장해 둔 숫자를 먼저 띄우고, 비트에서 읽은 새 숫자로 바꾼다(`specs/bit-dashboard` AC-601.14).
- 기다리는 것: 통계 쪽 저장 숫자 읽기(`specs/stats` REQ-516 `LiveDashboard`, 통계 TASK-16). 통계 쪽에서 미뤄졌고, 2026-11-02 사용자 결정("빼")으로 합본(`feat-combined`)에서 뺐다. 통계 창의 말로는 만들다 만 것이 VPS 로컬 `wip-stats-dashboard-source`에 있고 GitHub에는 없다.
- 함께 볼 것: `partial: true`인 저장 숫자로 지난 날을 그리면 맨 위 문장이 "왔습니다"로 확정해 말한다.
- 급하지 않은 이유: 의원 PC에서는 도우미로 읽으니 지금의 숫자 확인에는 영향이 없다. 휴대폰이나 도우미 없는 컴퓨터에서 숫자를 보고 싶어지면 필요하다.

## 작은 것 (급하지 않음)
리뷰에서 나왔지만 합치는 것을 막지 않은 것들이다.

### 화면 동작
- [AI 분석]·[다시 읽기]를 키보드로 누르면 단추가 바뀌면서 초점이 몸통으로 빠진다. 시안도 같다.
- Space를 쥔 채 Enter나 마우스로 확인 창을 열고 키 반복 뒤 떼면 창을 그냥 통과한다. 일부러 해야 생긴다. `AiReportScreen`의 조건에 `' '`를 더하면 막힌다.
- [취소]에서 Enter를 누른 채면 창이 닫혔다 다시 열린다. 요청은 가지 않는다.

### 서버
- `src/app/api/ai/report/route.ts` GET은 달 검사 전에 병원·관리자 표를 읽는다. AC-706.2의 "DB를 읽지 않는다"는 AI 표 기준으로만 맞다.
- 같은 파일의 `Cache-Control: no-store`는 200 답에만 붙는다. 화면이 `no-store`로 불러서 실제 영향은 없다.
- 로그인 안 한 사람의 잘못된 POST 몸통은 401이 아니라 400이다. Content-Type을 보지 않고, 승인 사용자의 연타도 막지 않는다. 비용 상한은 콘솔 한도가 맡는다.
- `claude.ts`: 답을 다 받은 뒤 연결이 끊기면 `E-AI-BUSY`이고 사용량이 남지 않는다(틈이 아주 짧다). 200 HTML 같은 다른 형식의 답도 `E-AI-BUSY`다.
- 처방 이름이 비었고 코드가 숫자뿐이면 카드에서 빠지고, 요약에 쓰이면 실패한다(드묾).
- 받은 자료의 달이 요청한 달과 다르면 없는 달로 본다. 명세에 글로 적지 않은 판단이라, 다음 명세 수정 때 적는다.

### 명령어
- `scripts/aiKey.ts`의 "(권한 600)" 문구는 윈도우에서는 사실이 아니다. 쓴 뒤 다시 읽어 확인하지도 않는다.
- 비용 표시 계산이 `scripts/ai-try.ts`와 `markdown.ts` 두 곳에 있다.

### 시험의 빈틈
- `src/components/ai-report/boundary.test.ts`가 `@supabase/ssr` 직접 import를 못 잡는다.
- `src/components/ui/classes.test.ts`의 검사 폴더에 `components/ai-report`가 없다(리뷰어가 넣어 돌려 보니 새 실패는 없었다).
- `reportClient`의 `credentials` 시험이 없다.
- AC-714.3 시험은 화면 부품을 가짜로 바꿔 "준비 중이 없다" 검사가 약하다. 소스 검사가 보강한다.
- `claude.ts`의 오류 나누기 일부와 timeout 값을 바꿔도 시험이 못 잡는다. `prompt.test.ts`의 정규식 끝을 `쓰지 않고`로 좁힐 수 있다.

### 시험이 환경 탓으로 실패하는 것
- 윈도우 전용 실패: `classes` 26개, `tabFrame` 2개(AC-301.3·AC-404.2), `landing/rules` 2개, `charts/rules` 1개, `envFile` 2개, `.NET` 15개, 파일째 실패 `e2e/lib/session`·`extension/src/manifest`. 경로 표기 등 환경 탓으로 보이고 VPS(리눅스)에서는 모두 통과했다. 별도 명세로 고친다. 그 전까지 Stop 훅은 꺼 둔다.
- `src/lib/analytics/aggregate.test.ts`의 "10만 줄을 1초 안에 센다": 서버가 바쁘면 1.06~1.2초로 실패한다. 한가할 때 재 보지 않았다.

### 낡은 글자
- 옛 주석: `src/components/common/NotReadyScreen.tsx`와 `src/components/claim/setup/ClaimEntry.tsx`의 "10개", `src/components/dashboard/briefing/FeatureIndex.tsx`의 상태 설명.
- `specs/ai-report/`의 AC-508.4 낱말이 코드보다 좁다.
- `phases/index.json`에 AI 리포트 화면 단계가 없다. 진행 표시일 뿐이라 동작에는 영향이 없다.

## 고치지 않기를 추천하는 것
- `docs/mockups/ai-report/index.html` 334번 줄(CodeRabbit 지적 1개): 시안의 전체 메뉴가 "준비 중 9개"이고 업무일지에 칩이 있다. 업무일지가 켜지기 전에 승인한 기록이고 실제 화면과 무관하다.
- 이전·다음 달 단추의 배경 전환(150ms)을 뺀 것: 폴더 규칙(transition 금지)을 따른 것이다.
