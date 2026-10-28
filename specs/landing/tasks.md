# 작업 분할: 랜딩 페이지

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests 에 적힌 경로만 수정할 수 있다. 작업 하나는 한 모듈·한 레이어만 다룬다.
> 값·문구 기준: `docs/mockups/landing/landing-mockup.dc.html`, 색·글자 규칙: `docs/UI_GUIDE.md`.

## TASK-1: 시험 설정 (.tsx 시험)
- REQ: REQ-001
- Files: vitest.config.ts
- TDD: exempt — 설정만 한다. `src/**/*.test.tsx`를 찾게 하고 JSX를 automatic 런타임으로 변환한다. 끝 조건: 빈 `.tsx` 시험 하나가 돌고(확인 뒤 지움), 기존 `npm test` 전체가 그대로 통과한다. `next/image`·CSS Module import가 node 환경에서 되는지 여기서 확인한다(design.md 위험)

## TASK-2: 그림 파일과 목록
- REQ: REQ-006
- Files: public/landing/*.jpg, src/components/landing/images.ts, src/components/landing/images.test.ts
- Tests: src/components/landing/images.test.ts
- TDD: required

## TASK-3: 히어로 값과 타이머
- REQ: REQ-003, REQ-004
- Files: src/components/landing/heroFrames.ts, src/components/landing/heroFrames.test.ts
- Tests: src/components/landing/heroFrames.test.ts
- TDD: required

## TASK-4: 전역 스타일과 글꼴
- REQ: REQ-004, REQ-005
- Files: src/app/globals.css, src/app/layout.tsx, src/app/globals.test.ts
- Tests: src/app/globals.test.ts
- TDD: required

## TASK-5: 히어로 차트 컴포넌트
- REQ: REQ-003, REQ-008
- Files: src/components/landing/HeroChart.tsx, src/components/landing/HeroChart.module.css, src/components/landing/HeroChart.test.tsx
- Tests: src/components/landing/HeroChart.test.tsx
- TDD: required

## TASK-6: 메뉴 띠 · 히어로 · 약속 띠
- REQ: REQ-001, REQ-002, REQ-005
- Files: src/components/landing/links.ts, src/components/landing/SiteHeader.tsx, src/components/landing/SiteHeader.module.css, src/components/landing/Hero.tsx, src/components/landing/Hero.module.css, src/components/landing/PromiseBand.tsx, src/components/landing/PromiseBand.module.css, src/components/landing/top.test.tsx
- Tests: src/components/landing/top.test.tsx
- TDD: required

## TASK-7: AI · 정형외과 · 기능 섹션
- REQ: REQ-005, REQ-006, REQ-007
- Files: src/components/landing/AiSection.tsx, src/components/landing/AiSection.module.css, src/components/landing/OrthoSection.tsx, src/components/landing/OrthoSection.module.css, src/components/landing/FeaturesSection.tsx, src/components/landing/FeaturesSection.module.css, src/components/landing/middle.test.tsx
- Tests: src/components/landing/middle.test.tsx
- TDD: required

## TASK-8: 개인정보 · 시작 3단계 · 시작하기 · 푸터
- REQ: REQ-002, REQ-005
- Files: src/components/landing/PrivacySection.tsx, src/components/landing/PrivacySection.module.css, src/components/landing/HowSection.tsx, src/components/landing/HowSection.module.css, src/components/landing/StartSection.tsx, src/components/landing/StartSection.module.css, src/components/landing/SiteFooter.tsx, src/components/landing/SiteFooter.module.css, src/components/landing/bottom.test.tsx
- Tests: src/components/landing/bottom.test.tsx
- TDD: required

## TASK-9: 페이지 조립
- REQ: REQ-001, REQ-002, REQ-005, REQ-006, REQ-007, REQ-008
- Files: src/app/page.tsx, src/app/page.test.tsx
- Tests: src/app/page.test.tsx
- TDD: required

## TASK-10: 문서에 결정 기록
- REQ: REQ-001
- Files: CLAUDE.md, docs/ARCHITECTURE.md, docs/ADR.md
- TDD: exempt — 문서만 고친다. CLAUDE.md 스타일링 줄, ARCHITECTURE.md 화면 컴포넌트 폴더·Server/Client·public 줄, ADR-012 고침·ADR-013 추가. 한두 줄씩만 바꾼다
