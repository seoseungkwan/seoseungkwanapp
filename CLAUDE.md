# 프로젝트: 병원 업무 도구 (서비스 이름 미정, 임시 이름)

정형외과 의원 총괄의 반복 업무(환자 통계·AI 분석·매출·재고·급여·일일마감·보고)를 웹사이트 하나에서 처리한다. 당분간 혼자 쓰는 MVP다.
문서 순서: `plan.md`(부딪히면 이것이 이긴다) → `docs/PRD.md` → `docs/ARCHITECTURE.md` · `docs/ADR.md`

## 기술 스택
- Next.js 15.5 (App Router) · React 19.1 — 파일럿과 같은 버전
- TypeScript strict · 경로 별칭 `@/*` → `src/*`
- 시험: Vitest 4 (node 환경, `TZ=Asia/Seoul`). E2E 도구: 미정 — 파일럿 이식 때 정함
- 파일 읽기: SheetJS `xlsx` 0.20.3 (CDN 패키지)
- Supabase(서울, 무료 플랜) · 구글 OAuth · Vercel · Claude API — 패키지는 쓰는 기능에서 넣는다
- 스타일링: CSS Modules(화면별 `*.module.css`) + `src/app/globals.css`의 색·글꼴 변수. 글꼴은 `next/font` (ADR-014)

## 아키텍처 규칙
- CRITICAL: 환자 개인정보는 의원 PC 밖으로 나가지 않는다. 환자 파일은 브라우저 Web Worker 안에서만 읽고 계산한다. 서버·Claude API에는 집계 숫자만 간다. 읽는 칸·차트번호·파일 이름 규칙은 `plan.md §4`
- CRITICAL: `lib/parsers`·`lib/analytics`·`lib/payload`·`workers`는 환자 자료 구역이다. 네트워크·console·브라우저 저장소·React/Next/supabase/auth import를 쓰지 않는다. `eslint.config.mjs`가 막고 `src/guardrails.test.ts`가 증명한다. 이 규칙을 풀지 않는다
- CRITICAL: 서버 코드는 `app/api/ai/` 하나뿐이다. 나머지는 브라우저 + Supabase RLS
- CRITICAL: AI 경로는 브라우저가 보낸 숫자를 쓰지 않는다. 서버가 DB에서 읽어 `validate.ts`로 검사한 집계만 보낸다. 답은 글자로만 그린다(HTML 금지) (`plan.md §6-2`)
- 날짜 계산은 `lib/analytics/dates.ts` 한 곳(한국 날짜). 오류 문구는 `lib/errors.ts` 한 곳('무엇이 · 어떻게 고치나 · 번호')
- 금액은 원 단위 정수다. 반올림하지 않고 원 미만은 항목마다 버린다. 합계는 항목 금액의 합 (`plan.md §5`)
- 같은 효과면 코드 대신 DB 제약. 자동 계산보다 직접 입력 + 조정 칸 (`plan.md §0`)
- `plan.md §10`(2차로 미룬 것)은 사용자가 다시 꺼내기 전에는 만들지 않는다

## 보안 규칙
- CRITICAL: 비밀값(Supabase 키·`ANTHROPIC_API_KEY`·토큰)은 `.env.local`과 서버 환경 변수에만 둔다. 커밋·로그·출력·채팅 붙여넣기를 하지 않는다. `NEXT_PUBLIC_*`에 비밀값을 넣지 않는다. service role 키는 두지 않는다 (`plan.md §5`)
- CRITICAL: DB 표는 모두 RLS를 켠다. 기본 권한을 먼저 모두 회수(revoke)한 뒤 필요한 것만 준다(Supabase는 새 표에 `anon`·`authenticated` 권한을 기본으로 준다). 사용자는 자기 권한·승인 상태·소유자를 바꿀 수 없다. 이 규칙은 시험으로 증명한다
- CRITICAL: 앱 코드에 시험용 로그인·인증 우회 길을 만들지 않는다. E2E 로그인은 시험 코드가 세션 쿠키를 넣는다. 시험 계정은 `.env.local`에만
- CRITICAL: 실제 환자 파일(비트 내보내기)은 커밋하지 않는다. 시험은 `fixtures/`의 가짜 파일만 쓴다
- 로그인 콜백 등 리디렉트는 정해 둔 같은 origin의 고정 경로로만 보낸다(열린 리디렉트 금지). 오류 내용은 화면·응답에 그대로 보이지 않는다
- CSP·보안 헤더는 파일럿 것을 옮기고 `media-src 'self'`만 더한다 (`plan.md §6-1`). `connect-src`는 `'self'`와 꼭 필요한 origin만(와일드카드 금지), `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`
- 개인정보는 필요한 것만 읽고, 서버로 보내는 값은 정해 둔 모양만. 보내는 요청과 저장된 값에 금지 자료가 없는지 E2E로 확인한다
- AI 경로는 오류 번호·경로만 로그에 남긴다. 요청 내용·숫자는 남기지 않는다 (`plan.md §8`)
- 시험 산출물(trace·네트워크 로그·스크린샷)에 쿠키·토큰을 남기지 않는다(Playwright를 쓰면 `trace: 'off'`)

## 개발 프로세스
- CRITICAL: 새 기능은 `/sdd`로 명세(`specs/<기능ID>/`)를 쓰고 사용자가 `/sdd approve <기능ID>`로 승인한 뒤에만 구현한다 (SDD)
- CRITICAL: 테스트를 먼저 쓰고 실패(RED)를 확인한 뒤 구현한다 (TDD, `/tdd`). 테스트 이름에 AC ID(AC-001.1 등)를 넣는다
- CRITICAL: 화면은 클릭 목업을 사용자가 승인한 뒤에만 구현한다. 승인 전에는 화면 코드를 만들지 않는다 (`plan.md §3·§9`)
- 커밋 메시지는 conventional commits (`feat(stats-core): …`처럼 기능 ID를 scope로)

## 명령어
npm run dev        # 개발 서버
npm run build      # 프로덕션 빌드
npm run start      # 빌드한 앱 실행
npm run lint       # ESLint (환자 자료 구역 울타리 포함)
npm run test       # Vitest 전체
npx vitest run <파일>  # 시험 파일 하나
npm run fixtures   # 가짜 비트 파일 다시 만들기
