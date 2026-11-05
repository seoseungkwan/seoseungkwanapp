# 아키텍처

> 근거: `plan.md` §0·§4·§5·§6. 부딪히면 plan.md가 이긴다. **(예정)** = 아직 없는 폴더·표.

## 디렉토리 구조
```
src/
├── app/                 # 페이지(App Router). page.tsx = 랜딩(섹션은 components/landing/)
│   ├── globals.css      # 디자인 토큰 한 곳(`:root`), Tailwind `@theme inline`(토큰을 var()로만), 모션 줄이기 규칙 (docs/UI_GUIDE.md, ADR-019)
│   ├── fonts/           # Pretendard 1.3.9 정적 subset 세 굵기(400·500·600) woff2 + OFL.txt. layout.tsx가 next/font/local로 낸다 (ADR-019)
│   ├── (app)/<기능 주소>/page.tsx  # 화면이 아직 없는 탭(/notices 등)의 준비 중 화면 = components/common/NotReadyScreen + notReadyFeatures. 기능 명세가 진짜 화면으로 바꿀 때 shell/menu.ts·dashboard/briefing/features.ts·common/notReadyFeatures.ts를 같이 고친다(맞춤은 (app)/tabFrame.test.tsx, specs/tab-frame)
│   ├── (app)/revenue/page.tsx  # 매출 화면 = components/revenue/RevenueScreen (specs/revenue)
│   ├── (app)/patients/page.tsx # 환자 탭 = components/patients/PatientsEntry (specs/patients)
│   └── api/ai/          # (예정) 유일한 서버 경로 (§5)
├── lib/
│   ├── parsers/         # [환자 구역] 파일 읽기. bit/ = 비트 '환자별 소모 통계'
│   ├── analytics/       # [환자 구역] 세기(aggregate)·요약(compare)·날짜(dates.ts)
│   ├── payload/         # [환자 구역] 저장 모양(toMonthPayload·toDayPayloads)·검사(validate.ts)
│   ├── patients/        # [환자 구역] 환자 탭 계산(F/U·정기 주사 명단, 원본 양지바른 옮김) — specs/patients
│   ├── errors.ts        # 오류 문구 한 곳 (§8)
│   ├── revenue/         # 매출 계산(집계만 다뤄 환자 구역이 아니다): summary.ts·treatments.ts·sync.ts (specs/revenue)
│   ├── storage/         # 검사한 숫자만 저장. revenue.ts = sales_days·sales_codes, rxGroups.ts = rx_groups (specs/revenue). stats.ts = stats_months·stats_days·stats_coverage (specs/stats)
│   │   └── worklogDays.ts  # 업무일지 하루 읽기·저장(Supabase, 바뀐 칸만)
│   ├── worklog/         # 업무일지 합계·칸 글자 읽기·날짜·개인정보 모양 검사·자동 저장. 환자 구역이 아니다
│   └── folder/          # (예정) 비트 폴더 핸들만 브라우저 저장소에 (§5)
├── components/<화면>/  # 화면 컴포넌트. 앱 화면은 Tailwind 클래스(ui/classes.ts), landing/ = 랜딩(CSS Module)
│   ├── common/LogoMark.tsx  # 로고 마크 한 곳(병원 십자 C③, 고정 두 색). 랜딩·앱 틀·인증 틀이 같이 쓴다 (ADR-018)
│   ├── dashboard/briefing/  # 대시보드 브리핑(날짜 줄·큰 문장·연결 순서)·지금 바로 쓸 수 있어요·기능 목차(features.ts). 서버 컴포넌트(폰 아래 단추 StickyConnect만 클라이언트), 자료를 읽지 않고 연결 상태도 판정하지 않는다 (specs/tab-frame)
│   ├── dashboard/summary/   # 대시보드 오늘 하루 분석·기간별 흐름·원장님 보고 문장(계산은 view.ts). 자료 읽는 자리는 source.ts 하나이고 지금은 늘 자료 없음 — 통계 명세가 진짜 읽기로 바꾼다 (specs/tab-frame)
│   ├── revenue/         # 매출 화면(RevenueScreen). 보기 모양은 view.ts, 그래프는 charts/를 불러 쓰기만 한다 (specs/revenue)
│   ├── ai-report/       # AI 리포트 탭 화면(AiReportScreen·ReportBody·UsageAside·RedoDialog)과 서버 경로 `GET/POST /api/ai/report`를 부르는 reportClient. 달·읽기·분석 상태는 화면에만 둔다 (specs/ai-report-screen)
│   ├── worklog/         # 업무일지 화면. 엑셀 양식 `sheet.module.css`는 앱 화면의 유일한 CSS Module (docs/UI_GUIDE.md '업무일지 양식')
│   ├── patients/rows/   # [울타리] 환자 줄 화면(props로만). JSX는 되고 네트워크·console·브라우저 저장소·supabase·lib/auth·lib/storage는 못 쓴다. components/patients·app/(app)/patients 전체는 오류 보고 패키지(@sentry·@vercel/analytics·@vercel/speed-insights)도 못 쓴다 — specs/patients
│   ├── charts/          # 차트 부품(숫자 글자·KPI·Sparkline·쌓은 막대·범례·순위 막대·줄 안 막대). 서버에서 그리는 순수 부품, 토큰 클래스만, 자료 모양은 `@/types/analysis` (specs/b2b-redesign)
│   └── preview/         # 대시보드 미리보기 + 예시 자료(sample.ts). 랜딩 히어로·로그인 오른쪽이 같이 쓴다. 실제 자료를 읽지 않는다
├── workers/             # [환자 구역] Web Worker(analyze.worker.ts)와 실행기
├── types/               # 공용 타입
├── testing/             # 시험 도우미(boxes.ts: 그린 마크업에서 상자 안 상자 찾기). 앱 화면이 쓰지 않는다
└── guardrails.test.ts   # 환자 구역 ESLint 규칙 시험(접수 현황 화면 울타리 포함)
fixtures/                # 가짜 비트 파일·생성기. 실제 파일은 .gitignore로 막음
e2e/                     # E2E. Playwright 시험 `*.spec.ts` + Vitest `*.test.ts`(config.test.ts·lib/). `npm run e2e` (ADR-017)
supabase/*.sql           # 시험 계정·처음 관리자 SQL(SQL 편집기에 붙여 넣음). 시험은 supabase/setup-sql.test.ts
public/                  # fake-sample/
reception/               # 접수 현황 휴대폰 화면(ADR-027). www/ = 빌드 없는 순수 JS 화면(총괄 PC의 PrecheckReception.exe가 품어 그대로 내준다), tests/ = vitest + jsdom 시험. [울타리] www/는 브라우저 저장소·서비스 워커·console·innerHTML 등 HTML 넣기·eval·Function·'/'로 시작하지 않는 주소의 fetch를 못 쓴다(eslint.config.mjs, src/guardrails.test.ts) — specs/reception-phone
specs/<기능ID>/          # SDD 명세·TDD 기록
```
- [환자 구역] 네 곳과 `lib/patients`(환자 탭 계산)는 `eslint.config.mjs`가 네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import를 막는다. 시험 파일도 같다
- (예정, 청구 사전점검 ADR-016·020·021) `lib/bridge`(비트 자료 통로)·`lib/precheck`(청구 계산)도 환자 구역이다. 환자 줄을 그리는 `components/claim/rows`·`components/patients/rows`(환자 줄 울타리)는 네트워크·저장소·console·supabase를 못 쓴다. 저장소 밖에 `extension/`(크롬 확장)·`helper/`(윈도우 도우미, C#)·`.github/workflows/helper.yml`이 생긴다 — `specs/precheck/design.md` 3절
- 접수 현황(ADR-027): `helper/src/Precheck.Reception/`(늘 켜 두는 창 없는 프로그램 `PrecheckReception.exe`, 의원 와이파이에 문 47200으로 `reception/www` 화면과 `/api/*`를 내준다). 계산·규칙·HTTP는 `helper/src/Precheck.Core/Reception/`(netstandard2.0, 이 서버에서 시험) — `specs/reception-phone/design.md`
- `lib/supabase/`(연결), `lib/auth/`(문지기·가입·관리자·자동 로그아웃), `components/{auth,shell,dashboard,admin,common}/`, `supabase/migrations/`(SQL 편집기에 붙여 넣음) — `specs/auth/design.md`
- 화면 컴포넌트 폴더: `src/components/<화면>/`. 페이지(`app/`)는 섹션을 놓기만 한다

## 패턴
- 서버 코드는 `app/api/ai/` 하나. 나머지는 브라우저 + Supabase RLS (§0). 예외: 인증(콜백·middleware·페이지 guard)은 세션과 내 줄만 읽는다 (ADR-004)
- 같은 효과면 코드 대신 DB 제약. 예: 급여 `final` 잠금, 승인 DB 함수
- 통계: 원래 숫자는 `aggregate`, 비율·'집계 중' 판정은 `compare`, 저장 모양은 `payload` (`specs/stats-core/design.md`)
- 저장은 세기 숫자만. 비율은 읽을 때 계산한다
- 날짜는 `lib/analytics/dates.ts` 한 곳에서 한국 날짜로. 시험도 `TZ=Asia/Seoul`
- 오류 카드는 '무엇이 · 어떻게 고치나 · 번호'. 문구는 `lib/errors.ts` (§8)
- Server/Client Component: 기본은 Server. 값이 바뀌거나 브라우저 API가 필요한 부분만 `'use client'`로 작게 뗀다(예: 랜딩 히어로 차트). 움직임 로직은 순수 함수로 떼어 시험한다

## 데이터 흐름
```
[통계] 파일 끌어다 놓기 → Worker: parse → aggregate → compare → 화면
       화면 → toMonthPayload·toDayPayloads + 덮은 기간 → validate → lib/storage/stats.ts → stats_months·stats_days·stats_coverage
[매출] 비트 PC 도우미 읽기(`revenue.days`) → 확장 → lib/bridge → 집계만 → lib/storage → sales_days·sales_codes (2026-11-01 바뀜, specs/revenue)
[입력] 재고·직원·급여·일일마감·보고 → 브라우저 → Supabase(RLS)
[업무일지] 칸 입력 → 자동 저장(800ms, 바뀐 칸만, 막는 모양 칸 뺌) → worklog_days(RLS). 화면은 60초마다·다시 보일 때 다시 읽는다
[AI]   [AI 분석] → app/api/ai: 승인 확인 → DB 집계 읽기 → validate → Claude API
       → 답 검사(근거 숫자는 앱이 채움) → ai_reports 저장(그 달 덮어씀) → ai_usage 기록 → 화면(글자로만) (ADR-024)
[백업] [백업 내려받기] → 브라우저가 내 병원 모든 표 읽기 → JSON 파일 하나
[접수 현황] 비트 DB → PrecheckReception.exe(읽기 전용, 허용 SELECT만) → 의원 와이파이 HTTP → 직원 폰 화면(메모리만, 10초마다 다시 읽기) (ADR-027)
[청구] (예정) 도우미(비트 DB·화면) → 확장 → lib/bridge(풀지 않음) → Worker → 화면(보기 모양, PC 메모리만)
       고친 메모·완료 표시 → 도우미가 그 PC에 암호화 저장. 서버에는 건수(정수)·설정만 (ADR-020·021)
```
- 환자 줄·차트번호·파일 이름은 Worker 밖으로 나가지 않는다. 차트번호는 메모리 안 번호로만 쓴다 (§4)
- 예외는 청구·환자 연락 화면뿐이다: 일을 하려면 PC 화면에 환자 줄(차트번호·이름·전화)을 보여야 한다. 그 줄은 화면 줄 울타리 안에서만 그리고 서버·저장소·로그로 가지 않는다 (ADR-020)
- 예외(ADR-027, 사용자 결정 2026-11-05): 접수 현황 화면만 환자 줄(이름·차트번호·접수 메모·처방·증상)이 총괄 PC 밖, 같은 의원 직원 와이파이(사설 주소)의 폰·태블릿까지 간다. 인터넷·우리 서버·Claude API로는 가지 않고, 폰에 남기지 않으며(`no-store`·저장소 금지 울타리), 연결이 끊기거나 화면이 숨겨지면 바로 지운다
- 서버로 가는 것: 통계·매출 집계, 재고, 직원 이름·직종·금액, 일일마감·보고 내용, 병원 이름 (§4)
- Claude API로 가는 것: 서버가 DB에서 꺼낸 집계와 인건비 총액뿐. 직원 이름·개인별 급여는 안 보낸다 (§2-3)
- 채팅 입력에 전화·주민번호·메일 모양이 있으면 보내지 않는다. 처방명은 '데이터'로 감싼다 (§6-2)
- AI 경로 로그에는 오류 번호·경로만 남긴다 (§8)

## DB 표 (§5)
모든 표에 `hospital_id`를 둔다(§0). 모든 표에 RLS.

| 표 | 내용 |
|---|---|
| `hospitals` | 병원 이름·신청자 이름·연락처·이메일·상태(가입 신청 줄). 요양기관번호는 받지 않는다(2026-10-28 사용자) |
| `admins` | 운영자(나) 1줄. 처음에 SQL로 넣는다 |
| `stats_months` · `stats_days` · `stats_coverage` | 통계 월 숫자 · 일 숫자(폰에서 '어제' 보기용. 칸: `month` 또는 `day`·`partial`·`source`·`payload`·`updated_at`, 완전한 줄은 덜 덮인 줄로 안 바뀌는 트리거) · 불러온 기간 한 줄씩(칸: `from_day`·`to_day`·`source`·`created_at`, 넣기만) |
| `rx_groups` | 치료 묶음. 칸: 이름·코드 목록·순서. 즐겨찾기는 아직 없음. 매출 탭이 만들고 통계가 나중에 함께 씀 (specs/revenue) |
| `stats_rx_picks` | 통계 처방 골라 보기에서 고른 처방 한 줄씩. 칸: `hospital_id`·`code`·`name`·`pick_order`. 낱개 처방이라 묶음 표(`rx_groups`)와 따로 둔다. 넣기·읽기·지우기만, 고치기 없음 (specs/rx-picker) |
| `sales_days` | 일 매출 집계. 칸은 specs/revenue design.md 6절 |
| `sales_codes` | 달별 처방 코드 집계(코드·이름·건수·금액). 칸은 specs/revenue design.md 6절 |
| `inventory_items` · `inventory_moves` | 품목(단위·최소 수량) · 입고·사용·실사 |
| `employees` · `incentive_rules` | 직원(세후 기본급·재직 여부) · 인센티브 항목(방식·금액·%) |
| `payroll_months` | 달마다 입력값·결과(jsonb), `draft`·`final`. `final`은 RLS로 수정 불가 |
| `worklog_days` | 업무일지 하루 한 줄: 인원 2·수입 8·지출 4칸은 글자, 비고 5·업무사항 1·항목 이름 12칸 |
| `ai_usage` | 달별 토큰·비용 |
| `ai_reports` | 달별 AI 리포트(병원·달마다 하나, 다시 분석하면 덮어씀)·만들 때 쓴 숫자의 지문. 쓰기는 DB 함수로만 (ADR-024) |

- 금액은 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 합. %는 소수 둘째 자리까지
- 퇴사자는 지우지 않고 숨긴다(임금대장 3년 보존, §6-3). 주민번호·계좌번호는 저장하지 않는다
- 백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료). `stats_rx_picks`: `lib/backup/tables.ts`가 생기면 이 표도 넣는다

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
- AI 리포트는 달마다 저장(ADR-024), 채팅·월간 PDF는 저장하지 않는다(채팅은 새로 고침하면 사라짐, 월간 PDF는 열 때마다 새로 만듦). 2026-11-01 전 줄은 "채팅 기록·월간 보고서는 저장하지 않는다"였고, AI 리포트만 바뀌었다
- 입력값 임시 저장은 없다. 저장에 실패하면 값을 화면에 두고 [다시 저장]을 보인다 (§8)
- 그 밖의 화면 상태 관리 방식: 미정 — 첫 화면 작업 때 정함
