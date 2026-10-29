# 아키텍처

> 근거: `plan.md` §0·§4·§5·§6. 부딪히면 plan.md가 이긴다. **(예정)** = 아직 없는 폴더·표.

## 디렉토리 구조
```
src/
├── app/                 # 페이지(App Router). page.tsx = 랜딩(섹션은 components/landing/)
│   ├── globals.css      # 색·글꼴 변수, 모션 줄이기 규칙 (docs/UI_GUIDE.md)
│   └── api/ai/          # (예정) 유일한 서버 경로 (§5)
├── lib/
│   ├── parsers/         # [환자 구역] 파일 읽기. bit/ = 비트 '환자별 소모 통계'. 매출 파서도 여기 (예정)
│   ├── analytics/       # [환자 구역] 세기(aggregate)·요약(compare)·날짜(dates.ts)
│   ├── payload/         # [환자 구역] 저장 모양(toMonthPayload·toDayPayloads)·검사(validate.ts)
│   ├── errors.ts        # 오류 문구 한 곳 (§8)
│   ├── report/          # 월간보고 PPT: 양식(template)·숫자(numbers)·AI 자료(aiInput)·AI 답 검사(aiAnswer)·PPT(deck). 환자 구역 밖, 달 숫자만 읽는다 (ADR-016)
│   ├── storage/         # (예정) 검사한 달·일 숫자만 저장
│   └── folder/          # (예정) 비트 폴더 핸들만 브라우저 저장소에 (§5)
├── components/<화면>/  # 화면 컴포넌트와 그 CSS Module. landing/ = 랜딩
├── workers/             # [환자 구역] Web Worker(analyze.worker.ts)와 실행기
├── types/               # 공용 타입
└── guardrails.test.ts   # 환자 구역 ESLint 규칙 시험
fixtures/                # 가짜 비트 파일·생성기. 실제 파일은 .gitignore로 막음
scripts/                 # make-sample-deck.ts = 예시 PPT를 out/report/에 만든다(npm run report:sample)
public/                  # fake-sample/. landing/ = 랜딩 그림 6장(승인본 복사)
specs/<기능ID>/          # SDD 명세·TDD 기록
```
- [환자 구역] 네 곳은 `eslint.config.mjs`가 네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import를 막는다. 시험 파일도 같다
- `lib/auth`·`lib/supabase`·`services`는 ESLint 규칙에 이름만 있다(파일럿 경로). 미정 — 로그인을 옮길 때 정함
- 화면 컴포넌트 폴더: `src/components/<화면>/`. 페이지(`app/`)는 섹션을 놓기만 한다

## 패턴
- 서버 코드는 `app/api/ai/` 하나. 나머지는 브라우저 + Supabase RLS (§0)
- 같은 효과면 코드 대신 DB 제약. 예: 급여 `final` 잠금, 승인 DB 함수
- 통계: 원래 숫자는 `aggregate`, 비율·'집계 중' 판정은 `compare`, 저장 모양은 `payload` (`specs/stats-core/design.md`)
- 저장은 세기 숫자만. 비율은 읽을 때 계산한다
- 날짜는 `lib/analytics/dates.ts` 한 곳에서 한국 날짜로. 시험도 `TZ=Asia/Seoul`
- 오류 카드는 '무엇이 · 어떻게 고치나 · 번호'. 문구는 `lib/errors.ts` (§8)
- Server/Client Component: 기본은 Server. 값이 바뀌거나 브라우저 API가 필요한 부분만 `'use client'`로 작게 뗀다(예: 랜딩 히어로 차트). 움직임 로직은 순수 함수로 떼어 시험한다

## 데이터 흐름
```
[통계] 파일 끌어다 놓기 → Worker: parse → aggregate → compare → 화면
       화면 → toMonthPayload·toDayPayloads → validate → (예정) lib/storage → months·days
[매출] (예정) 폴더 연결(읽기 전용) 또는 끌어다 놓기 → Worker → 집계 → sales_days
[입력] 재고·직원·급여·일일마감·보고 → 브라우저 → Supabase(RLS)
[AI]   [AI 분석] → app/api/ai: 승인 확인 → DB 집계 읽기 → validate → Claude API
       → ai_usage 기록 → 화면(글자로만)
[백업] [백업 내려받기] → 브라우저가 내 병원 모든 표 읽기 → JSON 파일 하나
[보고] 달 숫자 → lib/report: computeReport(코드가 숫자·그래프·표 계산)
       → (예정) app/api/ai: buildAiPrompt → Claude → validateAiAnswer(문장만, 자료에 있는 숫자만)
       → 브라우저 buildDeck(pptxgenjs) → .pptx 내려받기. 서버에서 파일을 만들지 않는다
```
- 환자 줄·차트번호·파일 이름은 Worker 밖으로 나가지 않는다. 차트번호는 메모리 안 번호로만 쓴다 (§4)
- 서버로 가는 것: 통계·매출 집계, 재고, 직원 이름·직종·금액, 일일마감·보고 내용, 병원 이름 (§4)
- Claude API로 가는 것: 서버가 DB에서 꺼낸 집계와 인건비 총액뿐. 직원 이름·개인별 급여는 안 보낸다 (§2-3)
- 채팅 입력에 전화·주민번호·메일 모양이 있으면 보내지 않는다. 처방명은 '데이터'로 감싼다 (§6-2)
- AI 경로 로그에는 오류 번호·경로만 남긴다 (§8)
- 보고서 PPT: 모양(쪽 순서·색·글꼴·글자 수)은 `lib/report/template.ts` 한 곳에 고정. AI는 '한눈에'·'다음 할 일' 문장만 쓴다. 1단계(로그인 없이 도는 로직)는 `specs/ai-report/`, 화면·서버 연결은 로그인 작업 뒤 (ADR-016)

## DB 표 (§5)
모든 표에 `hospital_id`를 둔다(§0). 모든 표에 RLS.

| 표 | 내용 |
|---|---|
| `hospitals` | 파일럿 그대로(이름·요양기관번호·상태) |
| `admins` | 운영자(나) 1줄. 처음에 SQL로 넣는다 |
| `months` · `days` | 통계 월 숫자 · 일 숫자(폰에서 '어제' 보기용) |
| `rx_groups` | 그룹 이름·코드 목록·즐겨찾기 |
| `sales_days` | 일 매출 집계. 칸: 미정 — 매출 파일 예시(§12)를 보고 정함 |
| `inventory_items` · `inventory_moves` | 품목(단위·최소 수량) · 입고·사용·실사 |
| `employees` · `incentive_rules` | 직원(세후 기본급·재직 여부) · 인센티브 항목(방식·금액·%) |
| `payroll_months` | 달마다 입력값·결과(jsonb), `draft`·`final`. `final`은 RLS로 수정 불가 |
| `daily_reports` | 미정 — 일일마감·보고 양식(§12)을 보고 정함 |
| `ai_usage` | 달별 토큰·비용 |

- 금액은 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 합. %는 소수 둘째 자리까지
- 퇴사자는 지우지 않고 숨긴다(임금대장 3년 보존, §6-3). 주민번호·계좌번호는 저장하지 않는다

## 인증·승인 흐름 (§2-1, §5, §6-4)
```
랜딩 → [구글로 시작하기] → (처음만) 가입 신청 → 승인 대기 → 관리자 승인 → 대시보드
                                                    └→ 거절(되돌릴 수 있음)
```
- 계정 1개 = 병원 1개
- 승인·거절은 DB 함수 하나가 한다. `admins` 표에 있는 사람만 상태를 바꿀 수 있다. service role 키는 없다
- AI 경로도 '승인된 사용자'인지 다시 확인한다
- 30분 동안 움직임이 없으면 자동 로그아웃. 화면 위쪽 띠에 로그인한 구글 계정을 보인다

## 상태 관리
- 브라우저 저장소에는 폴더 핸들만 둔다 (§5). 환자 구역은 브라우저 저장소를 쓰지 않는다
- 채팅 기록·월간 보고서는 저장하지 않는다(새로 고침하면 사라짐, 열 때마다 새로 만듦)
- 입력값 임시 저장은 없다. 저장에 실패하면 값을 화면에 두고 [다시 저장]을 보인다 (§8)
- 그 밖의 화면 상태 관리 방식: 미정 — 첫 화면 작업 때 정함
