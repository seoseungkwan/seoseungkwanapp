# 프로젝트: {프로젝트명}

## 기술 스택
- {프레임워크 (예: Next.js 15)}
- {언어 (예: TypeScript strict mode)}
- {스타일링 (예: Tailwind CSS)}

## 아키텍처 규칙
- CRITICAL: {절대 지켜야 할 규칙 1 (예: 모든 API 로직은 app/api/ 라우트 핸들러에서만 처리)}
- CRITICAL: {절대 지켜야 할 규칙 2 (예: 클라이언트 컴포넌트에서 직접 외부 API를 호출하지 말 것)}
- {일반 규칙 (예: 컴포넌트는 components/ 폴더에, 타입은 types/ 폴더에 분리)}

## 보안 규칙 (기본값 — 프로젝트에 맞게 고치거나 지운다)
- CRITICAL: 비밀값(API 키·DB 비밀번호·서버 전용 키·토큰)은 `.env.local`에만 두고 커밋·출력·채팅 붙여넣기를 하지 않는다. 브라우저로 가는 공개 변수(예: `NEXT_PUBLIC_*`)에 비밀값을 넣지 않는다. 관리자 키(예: Supabase service role)는 꼭 필요할 때만 서버에서 쓰고 클라이언트 코드에는 절대 두지 않는다
- CRITICAL: DB 표는 모두 행 단위 권한(RLS 등)을 켠다. 기본 권한을 먼저 모두 회수(revoke)한 뒤 필요한 것만 준다(Supabase는 새 표에 `anon`·`authenticated` 권한을 기본으로 준다). 사용자는 자기 권한·승인 상태·소유자를 바꿀 수 없다. 이 규칙은 시험으로 증명한다
- CRITICAL: 앱 코드에 시험용 로그인·인증 우회 길을 만들지 않는다. E2E 로그인은 시험 코드가 세션 쿠키를 넣는다. 시험 계정은 `.env.local`에만
- 로그인 콜백 등 리디렉트는 정해 둔 같은 origin의 고정 경로로만 보낸다(돌아갈 주소 쿼리를 따르지 않는다 — 열린 리디렉트 금지). 오류 내용은 화면·응답에 그대로 보이지 않는다
- CSP를 둔다: `connect-src`는 `'self'`와 꼭 필요한 origin만(와일드카드 금지), `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`
- 개인정보는 필요한 것만 읽고, 서버로 보내는 값은 정해 둔 모양만. 보내는 요청(주소·헤더·본문)과 저장된 값에 금지 자료가 없는지 E2E로 확인한다
- 시험 산출물(trace·네트워크 로그·스크린샷)에 쿠키·토큰을 남기지 않는다(Playwright `trace: 'off'`, 로그는 읽고 바로 지움)

## 개발 프로세스
- CRITICAL: 새 기능은 `/sdd`로 명세(specs/<기능ID>/)를 쓰고 사용자가 `/sdd approve <기능ID>`로 승인한 뒤에만 구현할 것 (SDD)
- CRITICAL: 새 기능 구현 시 반드시 테스트를 먼저 작성하고 실패(RED)를 확인한 뒤, 테스트가 통과하는 구현을 작성할 것 (TDD, `/tdd`)
- 테스트 이름에 수용 기준 ID(AC-001.1 등)를 넣어 명세와 연결할 것
- 커밋 메시지는 conventional commits 형식을 따를 것 (feat:, fix:, docs:, refactor:)

## 명령어
npm run dev      # 개발 서버
npm run build    # 프로덕션 빌드
npm run lint     # ESLint
npm run test     # 테스트
