# 아키텍처

> 근거: `plan.md` §0·§4·§5·§6. 부딪히면 plan.md가 이긴다. **(예정)** = 아직 없는 폴더·표.

## 디렉토리 구조
```
src/
├── app/                 # 페이지(App Router). page.tsx = 랜딩(섹션은 components/landing/)
│   ├── globals.css      # 디자인 토큰 한 곳(`:root`), Tailwind `@theme inline`(토큰을 var()로만), 모션 줄이기 규칙 (docs/UI_GUIDE.md, ADR-019)
│   ├── fonts/           # Pretendard 1.3.9 정적 subset 세 굵기(400·500·600) woff2 + OFL.txt. layout.tsx가 next/font/local로 낸다 (ADR-019)
│   ├── (app)/<기능 주소>/page.tsx  # 화면이 아직 없는 탭(/notices 등)의 준비 중 화면 = components/common/NotReadyScreen + notReadyFeatures. 기능 명세가 진짜 화면으로 바꿀 때 shell/menu.ts·dashboard/briefing/features.ts·common/notReadyFeatures.ts를 같이 고친다(맞춤은 (app)/tabFrame.test.tsx, specs/tab-frame)
│   ├── (app)/patients/page.tsx # 환자 탭 = components/patients/PatientsEntry (specs/patients)
│   ├── (app)/forms/page.tsx    # 서식 탭 = components/forms/FormsScreen (specs/forms)
│   ├── (app)/inventory/page.tsx # 재고 탭 = components/inventory/InventoryScreen (specs/inventory)
│   └── api/ai/          # 유일한 서버 경로 (§5). forms/route.ts = 서식 AI 정리 `POST /api/ai/forms`(적은 글을 Claude로 보내는 예외, ADR-028). forms/guide/route.ts = 환자 안내문 AI 정리 `POST /api/ai/forms/guide`, forms/guide/picture/route.ts = 환자 안내문 AI 그림 `POST /api/ai/forms/guide/picture`(도형·색 이름·숫자로만 받음) (ADR-028 덧붙임, specs/forms-guide). forms/background/route.ts = 휴진 안내 AI 배경 `POST /api/ai/forms/background`(적은 말을 OpenAI 그림 AI로 보내는 예외, 부르기는 openaiImage.ts, ADR-029, specs/forms-themes). inventory/invoice/route.ts = 재고 거래명세서 사진 읽기 `POST /api/ai/inventory/invoice`, inventory/columns/route.ts = 재고 엑셀 칸 맞춤 `POST /api/ai/inventory/columns`(사진·엑셀 머리 줄을 Claude로 보내는 예외, 사진은 claude.ts가 한 장 붙여 보냄, ADR-034, specs/inventory)
├── lib/
│   ├── parsers/         # [환자 구역] 파일 읽기. bit/ = 비트 '환자별 소모 통계'
│   ├── analytics/       # [환자 구역] 세기(aggregate)·요약(compare)·날짜(dates.ts)
│   ├── payload/         # [환자 구역] 저장 모양(toMonthPayload·toDayPayloads)·검사(validate.ts)
│   ├── patients/        # [환자 구역] 환자 탭 계산(F/U·정기 주사 명단, 원본 양지바른 옮김) — specs/patients
│   ├── errors.ts        # 오류 문구 한 곳 (§8)
│   ├── revenue/         # 매출 계산(집계만 다뤄 환자 구역이 아니다): summary.ts·treatments.ts·sync.ts(빈 날 31일 덩어리 읽기) (specs/revenue, specs/stats-revenue)
│   ├── storage/         # 검사한 숫자만 저장. revenue.ts = sales_days·sales_codes, rxGroups.ts = rx_groups (specs/revenue). stats.ts = stats_months·stats_days·stats_coverage (specs/stats). statsRxGroups.ts = stats_rx_groups (specs/treatment-trend). formNotices.ts = form_notices (specs/forms). formGuides.ts = form_guides (specs/forms-guide). formBackgrounds.ts = form_backgrounds 표 + Storage form-backgrounds 그림(내 배경, specs/forms-themes). 2026-11-14 바뀜: revenue.ts는 save_revenue_range로 sales_days·sales_day_codes를 저장하고, rxGroups.ts(매출 탭 묶음 저장)는 지웠다(표 rx_groups는 남김, specs/stats-revenue). inventory.ts = 재고 표 일곱 + Storage inventory-photos 명세서 사진(specs/inventory)
│   │   └── worklogDays.ts  # 업무일지 하루 읽기·저장(Supabase, 바뀐 칸만)
│   ├── worklog/         # 업무일지 합계·칸 글자 읽기·날짜·개인정보 모양 검사·자동 저장. 환자 구역이 아니다
│   ├── forms/           # 서식 순수 함수. 휴진 안내: 카드 검사·날짜 글(notice)·테마 23개(themes)·배치(layout)·AI 글과 답 검사(ai)·그림 파일(png) (specs/forms). 환자 안내문: 칸 검사(guide)·배치(guideLayout)·AI 글과 답·숫자 검사(guideAi)·AI 그림 검사(guideDrawing) (specs/forms-guide). 휴진 안내 AI 배경: 고른 그림 값·테마 그림 1·2(themes)·적은 말·프롬프트·줄 검사(background)·강조색(accent)·그림 읽기(backgroundImage, 브라우저) (specs/forms-themes). 환자 구역이 아니다(구역에서는 analytics/dates·payload/validate만 불러 쓴다)
│   ├── inventory/       # 재고 순수 함수: 이름 맞추기(names)·쓴 양과 달별(usage)·챙길 것(alerts)·차례(order)·비트 코드 목록(bitCodes)·AI 질문과 답 검사(ai)·엑셀 양식과 미리 보기(excel). 환자 구역이 아니다 (specs/inventory)
│   └── folder/          # (예정) 비트 폴더 핸들만 브라우저 저장소에 (§5)
├── components/<화면>/  # 화면 컴포넌트. 앱 화면은 Tailwind 클래스(ui/classes.ts), landing/ = 랜딩(CSS Module)
│   ├── common/LogoMark.tsx  # 로고 마크 한 곳(병원 십자 C③, 고정 두 색). 랜딩·앱 틀·인증 틀이 같이 쓴다 (ADR-018)
│   ├── dashboard/briefing/  # 대시보드 브리핑(날짜 줄·큰 문장·연결 순서)·지금 바로 쓸 수 있어요·기능 목차(features.ts). 서버 컴포넌트(폰 아래 단추 StickyConnect만 클라이언트), 자료를 읽지 않고 연결 상태도 판정하지 않는다 (specs/tab-frame)
│   ├── dashboard/inventory/ # 대시보드 재고 칸(InventoryAlertCard). 챙길 것이 있을 때만 그리고, 읽을 때 처음 분류를 넣지 않는다 (specs/inventory)
│   ├── dashboard/summary/   # 대시보드 오늘 하루 분석·기간별 흐름·원장님 보고 문장(계산은 view.ts). 자료 읽는 자리는 source.ts 하나이고 지금은 늘 자료 없음 — 통계 명세가 진짜 읽기로 바꾼다 (specs/tab-frame)
│   ├── revenue/         # 통계 매출 칸(stats/sections/RevenueSection)이 쓰는 매출 부품: 숫자 칸 줄·안내 줄·증감 글·급여 표·세 겹 막대·순위 막대(RevenueParts·RevenueSplit·MonthBars·TreatmentBars), 금액 글(money.ts), 보기 타입(types.ts). 매출 탭 화면은 지웠다 (specs/revenue, specs/stats-revenue)
│   ├── ai-report/       # AI 리포트 탭 화면(AiReportScreen·ReportBody·UsageAside·RedoDialog)과 서버 경로 `GET/POST /api/ai/report`를 부르는 reportClient. 달·읽기·분석 상태는 화면에만 둔다 (specs/ai-report-screen)
│   ├── inventory/       # 재고 탭 화면(InventoryScreen, 도구 넷: 목록·세기·들어온 기록·달별)과 엑셀 넣기·비트 코드 고르기·사진 줄이기(photo.ts)·두 AI 경로를 부르는 invoiceClient·columnsClient (specs/inventory)
│   ├── worklog/         # 업무일지 화면. 엑셀 양식 `sheet.module.css`는 앱 화면의 유일한 CSS Module (docs/UI_GUIDE.md '업무일지 양식')
│   ├── forms/           # 서식 화면(FormsScreen·NoticeList·NoticeEditor·PreviewPanel, 상태는 formsState)과 안내문 SVG(Poster). 그림 안의 테마 색·글꼴 PosterPretendard 700·900은 앱 토큰 예외 (ADR-028, docs/UI_GUIDE.md '토큰'). 환자 안내문: SVG(GuidePoster)·그림 16개와 AI 그림(guidePictures)·로고색 한 곳(guideColors)·화면(GuideWorkspace·GuideEditor, 상태는 guideState) (specs/forms-guide). 휴진 안내 '배경' 칸: ThemePicker·hook useBackgrounds·상태 backgroundState (specs/forms-themes). 그 아래 '글자 색' 칸: AccentPicker (specs/forms-accent)
│   ├── patients/rows/   # [울타리] 환자 줄 화면(props로만). JSX는 되고 네트워크·console·브라우저 저장소·supabase·lib/auth·lib/storage는 못 쓴다. components/patients·app/(app)/patients 전체는 오류 보고 패키지(@sentry·@vercel/analytics·@vercel/speed-insights)도 못 쓴다 — specs/patients
│   ├── charts/          # 차트 부품(숫자 글자·KPI·Sparkline·쌓은 막대·범례·순위 막대·줄 안 막대). 서버에서 그리는 순수 부품, 토큰 클래스만, 자료 모양은 `@/types/analysis` (specs/b2b-redesign)
│   └── preview/         # 대시보드 미리보기 + 예시 자료(sample.ts). 랜딩 히어로·로그인 오른쪽이 같이 쓴다. 실제 자료를 읽지 않는다
├── workers/             # [환자 구역] Web Worker(analyze.worker.ts)와 실행기
├── types/               # 공용 타입
├── testing/             # 시험 도우미(boxes.ts: 그린 마크업에서 상자 안 상자 찾기). 앱 화면이 쓰지 않는다
└── guardrails.test.ts   # 환자 구역 ESLint 규칙 시험
fixtures/                # 가짜 비트 파일·생성기. 실제 파일은 .gitignore로 막음
e2e/                     # E2E. Playwright 시험 `*.spec.ts` + Vitest `*.test.ts`(config.test.ts·lib/). `npm run e2e` (ADR-017)
supabase/*.sql           # 시험 계정·처음 관리자 SQL(SQL 편집기에 붙여 넣음). 시험은 supabase/setup-sql.test.ts
public/                  # fake-sample/ · poster/(서식 안내문: themes/ 테마 그림 46장(테마 23개마다 <열쇠>.svg·<열쇠>-2.svg, specs/forms-themes) · fonts/ Pretendard Bold·Black subset + OFL.txt, specs/forms)
specs/<기능ID>/          # SDD 명세·TDD 기록
```
- [환자 구역] 네 곳과 `lib/patients`(환자 탭 계산)는 `eslint.config.mjs`가 네트워크·console·브라우저 저장소·React/Next/supabase/auth/storage import를 막는다. 시험 파일도 같다
- (예정, 청구 사전점검 ADR-016·020·021) `lib/bridge`(비트 자료 통로)·`lib/precheck`(청구 계산)도 환자 구역이다. 환자 줄을 그리는 `components/claim/rows`·`components/patients/rows`(환자 줄 울타리)는 네트워크·저장소·console·supabase를 못 쓴다. 저장소 밖에 `extension/`(크롬 확장)·`helper/`(윈도우 도우미, C#)·`.github/workflows/helper.yml`이 생긴다 — `specs/precheck/design.md` 3절
- `lib/supabase/`(연결), `lib/auth/`(문지기·가입·관리자·자동 로그아웃), `components/{auth,shell,dashboard,admin,common}/`, `supabase/migrations/`(SQL 편집기에 붙여 넣음) — `specs/auth/design.md`
- 화면 컴포넌트 폴더: `src/components/<화면>/`. 페이지(`app/`)는 섹션을 놓기만 한다
- 서식(휴진 안내): `components/forms/`(화면·안내문 SVG) · `lib/forms/`(순수 함수) · `lib/storage/formNotices.ts`(저장) · `public/poster/`(테마 그림·글꼴) · `app/api/ai/forms/`(AI 정리, ADR-028) — `specs/forms/design.md` 1절. 서식 두 폴더는 환자 자료 구역·브라우저 저장소를 쓰지 않는다(`src/lib/forms/rules.test.ts`)
- 서식(환자 안내문): 같은 두 폴더 · `lib/storage/formGuides.ts`(저장, `form_guides`) · `app/api/ai/forms/guide/`(AI 정리, 그 아래 `picture/`는 AI 그림, ADR-028 덧붙임) — `specs/forms-guide/design.md` 1절. 휴진 안내 표·경로(`form_notices`·`app/api/ai/forms/route.ts`)는 그대로다
- 서식(휴진 안내 AI 배경·내 배경): 같은 두 폴더 · `app/api/ai/forms/background/`(AI 배경, OpenAI 그림 AI, ADR-029) · `lib/storage/formBackgrounds.ts`(저장, `form_backgrounds` 표 + Storage `form-backgrounds`) · migration `supabase/migrations/20261115020000_form_backgrounds.sql` — `specs/forms-themes/design.md` 1절. 고른 그림은 `form_notices.theme` 한 칸에 담는다(테마·그림 2·`bg-<id>`)
- 예약 탭(구글 캘린더 대신): `components/calendar/`(화면, 그 아래 `rows/`는 예약표 울타리) · `lib/calendar/`(환자 구역, 칸 놓기·경고·도착·수 세기 순수 함수) · `workers/calendar.worker.ts`(비트 찾기·도착·비트 예약 칸) · `lib/storage/calendar.ts`(저장, 표 넷) · migration `supabase/migrations/20261117010000_calendar.sql` — 환자 이름·차트번호를 서버에 두는 예외(ADR-030), `specs/clinic-calendar/design.md`
- 재고 탭: `components/inventory/`(화면) · `components/dashboard/inventory/`(대시보드 재고 칸) · `lib/inventory/`(순수 함수, 환자 구역 아님) · `lib/storage/inventory.ts`(저장, 표 일곱 + Storage `inventory-photos`) · `app/api/ai/inventory/`(명세서 사진 읽기 `invoice`·엑셀 칸 맞춤 `columns`, ADR-034) · migration `supabase/migrations/20261121100000_inventory.sql` — 사이트 올리기 전에 Supabase SQL Editor에 붙여 한 번 실행하고 Storage `inventory-photos`가 Private(공개 아님)인지 본다(안 붙이면 재고 탭은 읽기 실패 카드). 원장만 쓴다(데스크 정책 없음) — `specs/inventory/design.md`

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
[매출] 통계 매출 칸 · `sales_day_codes`: 통계 [비트에서 불러오기] → 통계 조각 저장 뒤 같은 연결로 비트 PC 도우미 읽기(`revenue.days`, 빈 날만 31일 덩어리) → 확장 → lib/bridge → 집계만 → lib/storage(save_revenue_range) → sales_days·sales_day_codes(날마다 처방별 금액). 옛 달 합계 sales_codes는 읽기만 한다. 매출 탭은 없앴고 /revenue는 /stats로 넘긴다 (2026-11-14 바뀜, specs/stats-revenue)
[입력] 직원·급여·일일마감·보고 → 브라우저 → Supabase(RLS)
[재고] 목록·세기·입고 확인·엑셀 넣기 → lib/storage/inventory.ts → Supabase(RLS 원장만) · DB 함수(지금 수량을 저장 순서로 맞춤)
       명세서 사진 → 브라우저가 줄임(JPEG, 긴 변 1,600px) → app/api/ai/inventory/invoice: 승인 확인 → DB에서 물품 이름·단위 → Claude API(사진 + 번호 목록)
       → 답 검사 → 확인 화면에서 고치기 → [저장]만 사진을 Storage inventory-photos에 올림 → save_inventory_receipt → 맞춘 이름 기억 (ADR-034)
       엑셀: 양식이면 AI 없이 / 아니면 머리 줄 + 앞 줄 5개 → 개인정보 모양 검사(화면·서버) → app/api/ai/inventory/columns → 칸 맞춤
       → 브라우저가 모든 줄 읽기 → 미리 보기 → [넣기]
       비트 코드: stats_months의 payload->rx(이미 저장된 처방 코드·이름·환자 수) → 고르기 → inventory_items 넣기 (서버 경로·Claude로 가지 않음)
[업무일지] 칸 입력 → 자동 저장(800ms, 바뀐 칸만, 막는 모양 칸 뺌) → worklog_days(RLS). 화면은 60초마다·다시 보일 때 다시 읽는다
[AI]   [AI 분석] → app/api/ai: 승인 확인 → DB 집계 읽기(stats_months 세 달 + stats_rx_groups 묶음 이름, specs/ai-report-stats) → validate → Claude API
       → 답 검사(근거 숫자는 앱이 채움) → ai_reports 저장(그 달 덮어씀) → ai_usage 기록 → 화면(글자로만) (ADR-024)
[서식] 대충 적은 글(500자까지) → 개인정보 모양 검사(화면·서버) → app/api/ai/forms: 승인 확인 → Claude API(<memo>, effort low)
       → 답 검사 → 카드 → 화면에서 고치기 → form_notices(RLS, 달·카드·테마·글자 색 accent만). 적은 글은 저장·로그하지 않는다 (ADR-028)
       환자 안내문: 적은 글 → app/api/ai/forms/guide → 답 검사(메모에 없는 숫자면 버림) → 칸 → 화면에서 고치기 → form_guides(RLS)
       AI 그림: 그릴 것(20자까지) → app/api/ai/forms/guide/picture(effort medium) → 도형·색 이름·숫자 검사 → 앱이 그림 (ADR-028 덧붙임)
       AI 배경: 적은 말(30자까지) → 개인정보 모양 검사(화면·서버) → app/api/ai/forms/background: 승인 확인 → 하루 한도(take_ai_image, 20장)
       → OpenAI 그림 AI(고정 프롬프트 + 적은 말) → JPEG base64 → 브라우저가 강조색·작은 그림 → 미리보기
       → [내 배경으로 저장]만 form_backgrounds(RLS) + Storage form-backgrounds → 안내문 theme = bg-<id> (ADR-029)
[백업] [백업 내려받기] → 브라우저가 내 병원 모든 표 읽기 → JSON 파일 하나
[청구] (예정) 도우미(비트 DB·화면) → 확장 → lib/bridge(풀지 않음) → Worker → 화면(보기 모양, PC 메모리만)
       고친 메모·완료 표시 → 도우미가 그 PC에 암호화 저장. 서버에는 건수(정수)·설정만 (ADR-020·021)
```
- 환자 줄·차트번호·파일 이름은 Worker 밖으로 나가지 않는다. 차트번호는 메모리 안 번호로만 쓴다 (§4)
- 예외는 청구·환자 연락 화면뿐이다: 일을 하려면 PC 화면에 환자 줄(차트번호·이름·전화)을 보여야 한다. 그 줄은 화면 줄 울타리 안에서만 그리고 서버·저장소·로그로 가지 않는다 (ADR-020)
- 서버로 가는 것: 통계·매출 집계, 재고(거래명세서 사진 포함), 직원 이름·직종·금액, 일일마감·보고 내용, 병원 이름 (§4)
- Claude API로 가는 것: 서버가 DB에서 꺼낸 집계와 인건비 총액뿐. 직원 이름·개인별 급여는 안 보낸다 (§2-3). 예외는 둘이다. 서식 AI 정리: 사용자가 적은 글(500자까지, 전화·주민번호·메일 모양이면 안 보냄)과 오늘 날짜. 환자 안내문은 적은 글, AI 그림은 그릴 것(20자까지)만 보낸다 (ADR-028). 재고 탭: 거래명세서 사진 한 장(브라우저가 줄인 JPEG)과 서버가 DB에서 읽은 물품 이름·단위, 엑셀 머리 줄과 앞 줄 5개(칸마다 40자, 전화·주민번호·메일 모양이면 안 보냄, 앱 양식 엑셀은 부르지 않음). 환자 정보는 보내지 않는다 (ADR-034)
- OpenAI 그림 AI로 가는 것: 휴진 안내 AI 배경의 고정 프롬프트와 적은 말(30자까지, 전화·주민번호·메일 모양이면 안 보냄)뿐이다. 병원·환자·안내문 카드·사용자 정보는 보내지 않는다. 서버만 부르므로 CSP는 그대로다 (ADR-029)
- 채팅 입력에 전화·주민번호·메일 모양이 있으면 보내지 않는다. 처방명은 '데이터'로 감싼다 (§6-2)
- AI 경로 로그에는 오류 번호·경로만 남긴다 (§8)

## DB 표 (§5)
모든 표에 `hospital_id`를 둔다(§0). 모든 표에 RLS.

| 표 | 내용 |
|---|---|
| `hospitals` | 병원 이름·신청자 이름·연락처·이메일·상태(가입 신청 줄). 요양기관번호는 받지 않는다(2026-10-28 사용자) |
| `admins` | 운영자(나) 1줄. 처음에 SQL로 넣는다 |
| `hospital_members` | 병원의 데스크 메일 한 줄: `id`·`hospital_id`·`email`(소문자·앞뒤 빈칸 없는 메일 모양 3~254자, 표 전체에서 하나)·`role`('desk'뿐)·`created_at`. 표 권한·정책이 없고 정의자 함수(`add_desk_member`·`desk_members`·`remove_desk_member`·`my_desk`)로만 다룬다. 데스크는 `my_desk_hospital_id()`와 '데스크 …' 정책이 연 표(`worklog_days`·`sunap_*`·`calendar_*` 표 권한대로, `worklog_settings`·`stats_rx_groups`·`calendar_rev` 읽기)만 쓴다. 그 일곱 표의 `hospital_id` 기본값·예약 트리거 둘은 `my_clinic_hospital_id()` (ADR-031, specs/desk-feedback) |
| `stats_months` · `stats_days` · `stats_coverage` | 통계 월 숫자 · 일 숫자(폰에서 '어제' 보기용. 칸: `month` 또는 `day`·`partial`·`source`·`payload`·`updated_at`, 완전한 줄은 덜 덮인 줄로 안 바뀌는 트리거) · 불러온 기간 한 줄씩(칸: `from_day`·`to_day`·`source`·`created_at`, 넣기만) |
| `rx_groups` | 치료 묶음. 칸: 이름·코드 목록·순서. 즐겨찾기는 아직 없음. 매출 탭 묶음. 통계 처방별 추세는 따로 `stats_rx_groups`를 쓴다 (specs/revenue) |
| `stats_rx_picks` | 통계 처방 골라 보기에서 고른 처방 한 줄씩. 칸: `hospital_id`·`code`·`name`·`pick_order`. 낱개 처방이라 묶음 표(`rx_groups`)와 따로 둔다. 넣기·읽기·지우기만, 고치기 없음 (specs/rx-picker) |
| `stats_rx_groups` | 통계 처방별 추세의 묶음. 칸: `id`·`hospital_id`·`name`·`codes`·`sort_order`·`updated_at`. 저장은 `save_stats_rx_groups`로 목록 통째(새 묶음 넣기·고치기·빠진 묶음 지우기). 처방 하나는 한 묶음에만 든다(대소문자 무시, 저장이 끝날 때 DB가 검사). 매출 탭 묶음(`rx_groups`)과 따로 둔다. 더한 칸: 빼는 처방 `out_codes`(코드 목록, 그날 하나라도 받은 환자는 그 묶음에서 뺀다)·넣는 처방마다 조건 `cond`(`[{ code, unless }]`, 그날 `unless` 가운데 하나라도 받으면 그 넣는 처방으로는 세지 않는다). 두 칸은 칸 검사(`stats_rx_group_parts_ok`)를 지나야 하고, '한 묶음에만'은 넣는 처방에만 써서 빼는 처방·조건 처방은 다른 묶음의 넣는 처방이어도 된다. 두 칸 없이 저장하는 옛 탭은 고친 줄의 두 칸을 그대로 둔다(specs/group-exclude) (specs/treatment-trend) |
| `sales_days` | 일 매출 집계. 칸은 specs/revenue design.md 6절 |
| `sales_codes` | 달별 처방 코드 집계(코드·이름·건수·금액). 칸은 specs/revenue design.md 6절 |
| `sales_day_codes` | 날마다 처방 코드 집계(날·코드·건수·금액). 통계 매출 칸의 치료별 매출이 쓴다. 저장은 `save_revenue_range`(날 줄과 한 트랜잭션), 코드별 합은 `sales_code_totals`. `sales_days.day_codes`가 그날 이 줄이 있는지 적는다 (specs/stats-revenue) |
| `inventory_categories` · `inventory_items` | 재고 분류(이름 1~20자·차례) · 물품(분류·이름 1~40자·단위 하나·최소 수량·지금 수량 `qty`·마지막 센 수와 시각·가장 빠른 유통기한 `expiry`·거래처·단가·비트 코드 `bit_code`(병원 안에서 대소문자 없이 하나)·차례·안 씀 `hidden`·주문함 `ordered_at`). 이름은 병원 안에서 하나. 물품은 지우지 않고 숨기고, 물품이 있는 분류는 못 지운다. 지금 수량은 칸 권한이 없고 DB 함수만 고친다(저장 순서 규칙). 원장만 읽고 쓴다(데스크 정책 없음) (ADR-034, specs/inventory) |
| `inventory_counts` · `inventory_count_lines` | 세기(센 날 하나씩) · 세기 줄(물품마다 센 수·저장 시각). 읽기만, 쓰기는 DB 함수 `save_inventory_count`로만(날짜는 마지막 세기 날~한국 오늘, 같은 날은 덮어씀) (specs/inventory) |
| `inventory_receipts` · `inventory_receipt_lines` | 입고(명세서 날짜·거래처·사진 자리 `photo_path`·저장 시각) · 입고 줄(물품·수량·단가·금액). 읽기만, 쓰기는 DB 함수 `save_inventory_receipt`·`update_inventory_receipt`·`delete_inventory_receipt`로만. 저장하면 지금 수량에 더하고, 단가를 적은 줄은 물품 단가를 바꾸고, 주문함을 푼다 (specs/inventory) |
| `inventory_aliases` | 명세서에서 읽은 이름 → 물품(맞춘 이름을 기억해 다음엔 자동). 넣기·읽기·고치기·지우기 (specs/inventory) |
| `employees` · `incentive_rules` | 직원(세후 기본급·재직 여부) · 인센티브 항목(방식·금액·%) |
| `payroll_months` | 달마다 입력값·결과(jsonb), `draft`·`final`. `final`은 RLS로 수정 불가 |
| `worklog_days` | 업무일지 하루 한 줄: 인원 2·수입 8·지출 4칸은 글자, 비고 5·업무사항 1·항목 이름 12칸 · 업무사항 글씨 크기 `memo_font_pt`(8·9·10·11·12·14·16pt, 기본 11, specs/worklog-memo-font) · 현금 시재(장수 8칸·그날 시재·환불/미수입금 현금 표시·차이 이유, specs/worklog-cash-float) |
| `worklog_settings` | 병원 업무일지 설정 한 줄: 시재 금액 `cash_float`(기본 300,000원) (specs/worklog-cash-float) |
| `sunap_days` | 수납일지 마감한 날 한 줄: `work_date`·`closed_at`·`late`(늦은 마감)와 합계 숫자 24칸(내원·구분·Block·물리치료·예약·결제별 건수·금액, 0~10억 정수). 환자 줄은 없다(장부는 접수 PC 도우미 저장). 다시 마감하면 덮어쓰고 마감 풀기는 지운다. 저장은 `lib/storage/sunap.ts` (specs/sunap-ilji) |
| `sunap_spends` | 수납일지 그날 지출 한 줄: 종류(`cash`·`card`·`etc`·`parking`)·내용(1~50자, 개인정보 모양은 앱이 안 보냄)·금액(0~1억). 넣기·읽기·고치기(종류·내용·금액)·지우기 (specs/sunap-ilji) |
| `sunap_settings` | 병원 수납일지 설정 한 줄: Block·물리치료 묶음 id(`block_group`·`pt_group`, 통계 처방 묶음, 바깥 키 없음 = 지워지면 안 고름)·예약 메모 말 `rsv_words`(jsonb 객체, 4,000바이트 미만). 지우기 없음 (specs/sunap-ilji) |
| `calendar_settings` | 병원 예약 탭 설정 한 줄: 종류 `kinds`·시행자 `staff`(jsonb 배열, 8,000바이트 미만, 안 모양은 앱이 `checkCalendarSettings`로 봄)·보이는 시간 `open_hour`(5~12)·`close_hour`(12~24)·`sunday`. 지우기 없음 (specs/clinic-calendar) |
| `calendar_appts` | 예약 한 줄: 날짜·시작(분, 10분 칸)·길이(5~240분)·환자 이름(1~20자)·차트번호(숫자 10자리까지, 신환은 비움)·시행자·종류(id와 그때 이름)·메모(100자)·상태(`auto`·`came`·`noshow`·`cancel`)·도착 자동 `auto`(비트 PC가 정함)·처음 자리 `orig_day`·`orig_start`(트리거만 적음). 전화·성별·나이·생일 칸 없음. 넣을 때마다 한국 오늘 − 1년보다 이른 예약·종일 줄을 트리거가 지운다 (ADR-030, specs/clinic-calendar) |
| `calendar_allday` | 예약 탭 종일 한 줄: 메모(1~20자) 또는 시행자 휴무(같은 날 같은 시행자 하나). 고치기 없음(지우고 다시 넣음) (specs/clinic-calendar) |
| `calendar_rev` | 병원마다 예약 바뀜 숫자 한 줄. 위 세 표가 바뀔 때마다 트리거(`calendar_bump`)만 늘리고 사용자는 읽기만 한다. 화면이 5초마다 읽어 바뀌면 다시 읽는다 (specs/clinic-calendar) |
| `clinic_profiles` | 병원 정보 한 줄: `display_name`(1~50자)·`phone`(숫자 9~11자)·`address`(100자)·`honorific`(원장님·대표원장님·선생님)·`hours`(월~일 7칸, 분)·`closed_dates`·`staff`(원장님·직원, 예약 시행자를 합침, 12,000바이트까지)·`logo_path`·`updated_at`. 원장만 넣고 고치고 데스크는 읽기만, 지우기 없음. 넣고 고치면 `calendar_bump`로 rev가 오른다. 처음 실행 때 예약 설정 시행자를 옮긴다. `claim_hospital_settings.input_mode`(null·code·date, 원장만 고침)도 같은 SQL `20261119000000_clinic_profile.sql` (ADR-033, specs/clinic-profile) |
| `ai_usage` | 달별 토큰·비용 |
| `ai_reports` | 달별 AI 리포트(병원·달마다 하나, 다시 분석하면 덮어씀)·만들 때 쓴 숫자의 지문. 쓰기는 DB 함수로만 (ADR-024) |
| `form_notices` | 서식 휴진 안내 한 줄: 연·월·카드(1~4장, jsonb)·테마. 대충 적은 글은 두지 않는다. 칸은 specs/forms design.md 8절 (ADR-028). 테마 칸은 고른 그림 값(null·`auto-2`·`<열쇠>`·`<열쇠>-2`·`bg-<내 배경 id>`, 40자까지)이다 (specs/forms-themes design.md 2절). 글자 색 칸 `accent`는 null(자동) 또는 `#` + 소문자 16진수 6자리다 (specs/forms-accent design.md 2절) |
| `form_guides` | 서식 환자 안내문 한 줄: 안내문 칸·고른 그림·AI로 그린 그림을 `content`(jsonb 객체, 16,000바이트까지) 하나에 담는다. 안 모양은 앱이 `checkGuideValue`로 본다. 대충 적은 글은 두지 않는다. 칸은 specs/forms-guide design.md 7절 (ADR-028 덧붙임) |
| `form_backgrounds` | 서식 휴진 안내 '내 배경' 한 장: 적은 말 `words`(1~30자)·강조색 `accent`·작은 그림 `thumb`(120×170 JPEG base64, 16,000자까지)·그림 자리 `path`(`<병원 id>/<id>.jpg`, DB가 만듦). 큰 그림은 Storage `form-backgrounds`에만. 넣기(세 칸만)·읽기·지우기, 고치기 없음. 화면은 30장까지. 칸은 specs/forms-themes design.md 8-1절 (ADR-029) |
| `ai_image_days` | 병원·한국 날짜마다 AI 배경 장 수(0~20). 표 권한·정책이 없고 DB 함수 `take_ai_image()`로만 센다(하루 20장, 보내기 전에) (ADR-029) |

- Storage 버킷 `form-backgrounds`(내 배경 큰 그림, 공개 아님, 한 파일 3,000,000바이트·`image/jpeg`만). `storage.objects` 정책은 첫 폴더가 내 병원 id인 것만 읽기·지우기, 올리기는 거기에 더해 이름이 내 `form_backgrounds` 줄의 `path`와 같을 때만이다(고치기 없음). 버킷과 정책은 migration `20261115020000_form_backgrounds.sql`이 만든다 (ADR-029)
- Storage 버킷 `clinic-logos`(병원 로고, 공개 아님, 한 파일 1,000,000바이트·`image/png`만): 첫 폴더가 내 병원 id인 것만 원장이 읽기·지우기, 올리기는 거기에 더해 이름이 내 `clinic_profiles.logo_path`와 같을 때만(고치기 없음, 데스크·다른 병원 못 함). migration `20261119000000_clinic_profile.sql` (ADR-033)
- Storage 버킷 `inventory-photos`(재고 거래명세서 사진, 공개 아님, 한 파일 3,000,000바이트·`image/jpeg`만, 이름 `<병원 id>/<uuid>.jpg`): 첫 폴더가 내 병원 id인 것만 원장이 읽기·올리기·지우기(고치기 없음, 데스크·다른 병원 못 함). [저장]한 입고만 올리고 입고를 지우면 사진도 지운다. migration `20261121100000_inventory.sql` (ADR-034)
- 금액은 원 단위 정수. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 합. %는 소수 둘째 자리까지
- 퇴사자는 지우지 않고 숨긴다(임금대장 3년 보존, §6-3). 주민번호·계좌번호는 저장하지 않는다
- 백업 목록(`lib/backup/tables.ts`)에 `sales_days`·`sales_codes`·`rx_groups`를 넣는다(`rx_groups`는 총괄이 손으로 만든 유일한 자료). `stats_rx_picks`: `lib/backup/tables.ts`가 생기면 이 표도 넣는다. `stats_rx_groups`(손으로 만든 자료, 통계 처방별 추세 묶음, specs/treatment-trend)도 넣는다

## 인증·승인 흐름 (§2-1, §5, §6-4)
```
랜딩 → [구글로 시작하기] → (처음만) 가입 신청 → 승인 대기 → 관리자 승인 → 대시보드
                                                    └→ 거절(되돌릴 수 있음)
```
- 계정 1개 = 병원 1개. 예외는 데스크 계정(ADR-031): 원장이 설정에서 더한 데스크 구글 메일(병원마다 5개까지)로 로그인하면 가입 승인 없이 그 병원의 데스크다. 로그인 메일(JWT의 email)로 맞추고 사용자 id는 적지 않는다. 이미 병원 가입 신청이 있는 메일은 데스크가 될 수 없고, 데스크 메일은 가입 신청을 못 한다. 페이지 문지기는 내 병원 줄이 없을 때 `my_desk()`만 읽는다(쓰지 않음)
- 승인·거절은 DB 함수 하나가 한다. `admins` 표에 있는 사람만 상태를 바꿀 수 있다. service role 키는 없다
- AI 경로도 '승인된 사용자'인지 다시 확인한다
- 30분 동안 움직임이 없으면 자동 로그아웃. 화면 위쪽 띠에 로그인한 구글 계정을 보인다

## 상태 관리
- 브라우저 저장소에는 폴더 핸들만 둔다 (§5). 환자 구역은 브라우저 저장소를 쓰지 않는다
- AI 리포트는 달마다 저장(ADR-024), 채팅·월간 PDF는 저장하지 않는다(채팅은 새로 고침하면 사라짐, 월간 PDF는 열 때마다 새로 만듦). 2026-11-01 전 줄은 "채팅 기록·월간 보고서는 저장하지 않는다"였고, AI 리포트만 바뀌었다
- 입력값 임시 저장은 없다. 저장에 실패하면 값을 화면에 두고 [다시 저장]을 보인다 (§8)
- 그 밖의 화면 상태 관리 방식: 미정 — 첫 화면 작업 때 정함
