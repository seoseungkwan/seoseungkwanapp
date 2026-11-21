# 작업 분할: 고시·공지 탭

> 형식: `## TASK-n: 제목` 아래에 `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 수정할 수 있다. 같은 Phase 안 TASK끼리는 Files가 겹치지 않는다.
> 값과 동작: requirements.md · design.md. 화면 글자: requirements(시안 `docs/mockups/notices/notes.md` 그대로 + '기본값').
>
> **시작 조건**: 사용자의 명세 승인. 워크트리 `feat-notices`(시안 커밋 563aaf0b 위). `node_modules`가 없으면 처음에 `npm ci`.
>
> **모든 TASK 공통**
> - 시험부터 쓰고 RED를 본다. 새 시험 이름에 AC ID를 넣는다.
> - 진짜 사이트·진짜 Claude·진짜 Supabase를 부르지 않는다. 사이트는 `fixtures/notices/` 견본, Claude·DB는 시험이 넣는 가짜다.
> - 환자 자료 구역(`lib/parsers`·`lib/analytics`·`lib/payload`·`lib/precheck` 등)과 `eslint.config.mjs`는 고치지 않는다(읽어서 쓰기만).
> - 화면은 PC 배치 하나다. 폰 전용 배치·폭 시험을 만들지 않는다.
> - 줄바꿈: `src`는 LF다. `sed -i`로 고치지 않는다.
> - 끝 조건: `npm run lint`(경고 0)·`npx tsc --noEmit` 통과, 고친 시험 파일 모두 통과.
>
> **할 순서**: Phase 하나 = 단계 하나. 같은 Phase의 TASK는 병렬 작업자(ssk-parallel-workers)가 따로 한다. 단계마다 합친 뒤 다음 단계. 검토는 모든 단계가 끝난 뒤 ssk-finish-check와 독립 검토 한 번.
> 1. Phase 1: TASK-1 (모두가 쓰는 타입·오류 번호)
> 2. Phase 2: TASK-2~12 병렬 (TASK-1의 타입만 쓴다)
> 3. Phase 3: TASK-13~16 · TASK-23·24 병렬
> 4. Phase 4: TASK-17~21 · TASK-25 병렬 (화면은 시안 승인됨, 내 낱말은 2026-11-21 추가분 승인 뒤)
> 5. Phase 5: TASK-22 — 탭을 켜는 일은 맨 끝이다. 그 전까지 사용자에게는 '준비 중'이 보인다.

## TASK-1: 공용 타입 · 오류 번호 · 글자 도구
- Phase: 1
- AC: AC-7401.1, AC-7401.2
- REQ: REQ-7401
- Files: src/types/notices.ts, src/types/errors.ts, src/lib/errors.ts, src/lib/errors.test.ts, src/app/api/ai/notices/text.ts, src/app/api/ai/notices/text.test.ts
- Tests: src/lib/errors.test.ts, src/app/api/ai/notices/text.test.ts
- TDD: required

## TASK-2: DB 표 · 권한 · 함수
- Phase: 2
- AC: AC-7402.1~AC-7402.6, AC-7403.1~AC-7403.6
- REQ: REQ-7402, REQ-7403
- Files: supabase/migrations/20261121000000_notices.sql, supabase/notices.rls.test.ts
- Tests: supabase/notices.rls.test.ts
- TDD: required

## TASK-3: 사이트 읽기 규칙
- Phase: 2
- AC: AC-7404.1~AC-7404.4
- REQ: REQ-7404
- Files: src/app/api/ai/notices/fetchSite.ts, src/app/api/ai/notices/fetchSite.test.ts
- Tests: src/app/api/ai/notices/fetchSite.test.ts
- TDD: required

## TASK-4: 심평원 공지 읽기
- Phase: 2
- AC: AC-7405.1~AC-7405.3
- REQ: REQ-7405
- Files: src/app/api/ai/notices/sources/hiraNotice.ts, src/app/api/ai/notices/sources/hiraNotice.test.ts, fixtures/notices/hira-notice-*
- Tests: src/app/api/ai/notices/sources/hiraNotice.test.ts
- TDD: required

## TASK-5: 심평원 심사기준 읽기
- Phase: 2
- AC: AC-7406.1~AC-7406.3
- REQ: REQ-7406
- Files: src/app/api/ai/notices/sources/hiraCrtr.ts, src/app/api/ai/notices/sources/hiraCrtr.test.ts, fixtures/notices/hira-crtr-*
- Tests: src/app/api/ai/notices/sources/hiraCrtr.test.ts
- TDD: required

## TASK-6: 보건복지부 RSS 읽기
- Phase: 2
- AC: AC-7407.1, AC-7407.2
- REQ: REQ-7407
- Files: src/app/api/ai/notices/sources/mohwRss.ts, src/app/api/ai/notices/sources/mohwRss.test.ts, fixtures/notices/mohw-rss*
- Tests: src/app/api/ai/notices/sources/mohwRss.test.ts
- TDD: required

## TASK-7: 붙임 글자 꺼내기 (새 패키지 unpdf·fflate)
- Phase: 2
- AC: AC-7408.1~AC-7408.4
- REQ: REQ-7408
- Files: src/app/api/ai/notices/attachText.ts, src/app/api/ai/notices/attachText.test.ts, package.json, package-lock.json, next.config.ts
- Tests: src/app/api/ai/notices/attachText.test.ts
- TDD: required

## TASK-8: 고시 번호 · 묶기 · 점검 규칙 연결
- Phase: 2
- AC: AC-7409.1~AC-7409.5
- REQ: REQ-7409
- Files: src/app/api/ai/notices/noticeNo.ts, src/app/api/ai/notices/noticeNo.test.ts, src/app/api/ai/notices/ruleMatch.ts, src/app/api/ai/notices/ruleMatch.test.ts
- Tests: src/app/api/ai/notices/noticeNo.test.ts, src/app/api/ai/notices/ruleMatch.test.ts
- TDD: required

## TASK-9: 요약 · 주간 모음 요청과 답 검사
- Phase: 2
- AC: AC-7410.1, AC-7410.2, AC-7411.1, AC-7411.2
- REQ: REQ-7410, REQ-7411
- Files: src/app/api/ai/notices/summaryPrompt.ts, src/app/api/ai/notices/summaryPrompt.test.ts, src/app/api/ai/notices/weeklyPrompt.ts, src/app/api/ai/notices/weeklyPrompt.test.ts
- Tests: src/app/api/ai/notices/summaryPrompt.test.ts, src/app/api/ai/notices/weeklyPrompt.test.ts
- TDD: required

## TASK-10: Claude 부르기 넓히기 · 일괄 처리
- Phase: 2
- AC: AC-7412.1~AC-7412.3
- REQ: REQ-7412
- Files: src/app/api/ai/claude.ts, src/app/api/ai/claude.test.ts, src/app/api/ai/notices/batch.ts, src/app/api/ai/notices/batch.test.ts, src/app/api/ai/generate.test.ts, src/app/api/ai/store.test.ts
- 왜 두 시험 파일: `user`를 `string | BetaContentBlockParam[]`로 넓히면 가짜 부름 인자에 `user.slice(...)`를 쓰는 세 줄(generate.test.ts 435·552, store.test.ts 776)이 타입 검사에서 깨진다 → 줄마다 `user as string`만 고친다.
- Tests: src/app/api/ai/claude.test.ts, src/app/api/ai/notices/batch.test.ts
- TDD: required

## TASK-11: 환자 정보 모양 검사
- Phase: 2
- AC: AC-7413.1~AC-7413.3
- REQ: REQ-7413
- Files: src/lib/notices/askCheck.ts, src/lib/notices/askCheck.test.ts
- Tests: src/lib/notices/askCheck.test.ts
- TDD: required

## TASK-12: 화면 글자 함수 (`lib/notices/view.ts`)
- Phase: 2
- AC: AC-7419.2(글 번호 자리·출처 이름), AC-7419.6(오늘·어제·시각·게시판 주소), AC-7420.3(본문만 이유·붙임 없음·링크 거르기), AC-7421.1(주 기간 글), AC-7423.3(99+)
- REQ: REQ-7419, REQ-7420, REQ-7421, REQ-7423
- Files: src/lib/notices/view.ts, src/lib/notices/view.test.ts
- Tests: src/lib/notices/view.test.ts
- TDD: required

## TASK-13: 모으기 DB 쪽
- Phase: 3
- AC: AC-7415.1~AC-7415.3
- REQ: REQ-7415
- Files: src/app/api/ai/notices/collectStore.ts, src/app/api/ai/notices/collectStore.test.ts
- Tests: src/app/api/ai/notices/collectStore.test.ts
- TDD: required

## TASK-14: 모으기 흐름
- Phase: 3
- AC: AC-7414.1~AC-7414.9
- REQ: REQ-7414
- Files: src/app/api/ai/notices/collector.ts, src/app/api/ai/notices/collector.test.ts
- Tests: src/app/api/ai/notices/collector.test.ts
- TDD: required

## TASK-15: AI에게 묻기 경로
- Phase: 3
- AC: AC-7417.1~AC-7417.5
- REQ: REQ-7417
- Files: src/app/api/ai/notices/ask/route.ts, src/app/api/ai/notices/ask/route.test.ts, src/app/api/ai/notices/ask/askPrompt.ts, src/app/api/ai/notices/ask/askPrompt.test.ts
- Tests: src/app/api/ai/notices/ask/route.test.ts, src/app/api/ai/notices/ask/askPrompt.test.ts
- TDD: required

## TASK-16: 화면 자료 읽고 쓰기
- Phase: 3
- AC: AC-7418.1~AC-7418.4, AC-7424.7
- REQ: REQ-7418, REQ-7424
- Files: src/lib/storage/notices.ts, src/lib/storage/notices.test.ts, src/types/notices.ts
- 내 낱말: `NoticeView.keywords`를 타입에 더하는 것도 이 TASK다(design 15절). 같은 Phase의 TASK-23(DB)·TASK-24(도구)를 import하지 않는다.
- Tests: src/lib/storage/notices.test.ts
- TDD: required

## TASK-17: 글 목록 화면
- Phase: 4
- AC: AC-7419.1~AC-7419.8, AC-7424.10
- REQ: REQ-7419, REQ-7424
- Files: src/components/notices/list/**
- Tests: src/components/notices/list/NoticesScreen.test.tsx
- TDD: required

## TASK-18: 글 화면 (규칙 상자 · 요약 · 묻기 · 메모 · 올라온 곳)
- Phase: 4
- AC: AC-7420.1~AC-7420.10, AC-7424.11
- REQ: REQ-7420, REQ-7424
- Files: src/components/notices/detail/**
- Tests: src/components/notices/detail/NoticeDetail.test.tsx, src/components/notices/detail/AskBox.test.tsx
- TDD: required

## TASK-19: 주간 모음 화면
- Phase: 4
- AC: AC-7421.1~AC-7421.3
- REQ: REQ-7421
- Files: src/components/notices/week/**, src/app/(app)/notices/week/page.tsx
- Tests: src/components/notices/week/WeekScreen.test.tsx
- TDD: required

## TASK-20: 대시보드 맨 위 경고 · '고시·공지' 칸
- Phase: 4
- AC: AC-7422.1, AC-7422.2, AC-7424.12
- REQ: REQ-7422, REQ-7424
- Files: src/components/dashboard/notices/**, src/components/dashboard/summary/LiveDashboard.tsx, src/components/dashboard/summary/LiveDashboard.test.tsx, src/components/dashboard/live/BitDashboard.tsx, src/components/dashboard/live/BitDashboard.test.tsx
- Tests: src/components/dashboard/notices/RuleAlert.test.tsx, src/components/dashboard/notices/NoticesCard.test.tsx
- TDD: required

## TASK-21: 자동 실행 경로 · 문지기 · Cron 설정
- Phase: 4
- AC: AC-7416.1~AC-7416.4
- REQ: REQ-7416
- Files: src/app/api/ai/notices/collect/route.ts, src/app/api/ai/notices/collect/route.test.ts, src/lib/auth/gate.ts, src/lib/auth/gate.test.ts, vercel.json, src/vercel-config.test.ts
- Tests: src/app/api/ai/notices/collect/route.test.ts, src/lib/auth/gate.test.ts, src/vercel-config.test.ts
- TDD: required

## TASK-22: 탭 켜기 · 탭 숫자 · 문서
- Phase: 5
- AC: AC-7423.1~AC-7423.3, AC-7424.13
- REQ: REQ-7423, REQ-7424
- Files: src/components/shell/menu.ts, src/components/shell/TabBar.tsx, src/components/shell/NoticeBadge.tsx, src/components/shell/NoticeBadge.test.tsx, src/components/shell/shell.test.tsx, src/components/common/notReadyFeatures.ts, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notices/page.tsx, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx, src/app/titles.test.tsx, src/app/notFound.test.tsx, docs/ADR.md, docs/ARCHITECTURE.md, plan.md, CLAUDE.md
- Tests: src/components/shell/shell.test.tsx, src/components/shell/NoticeBadge.test.tsx, src/components/common/notReadyFeatures.test.ts, src/components/dashboard/briefing/features.test.ts, src/app/(app)/notReadyPages.test.tsx, src/app/(app)/tabFrame.test.tsx
- TDD: required
- 문서: design 12절 ADR-034~036을 `docs/ADR.md`에 옮기고, `CLAUDE.md` 아키텍처 규칙에 예외 한 줄(ADR-034~036: 고시·공지 모으기 경로·공용 표·바깥 글과 질문을 Claude로)을 더한다. `docs/ARCHITECTURE.md`·`plan.md`에는 고시·공지 줄만 더한다.

## TASK-23: 내 낱말 DB 표 · 맞춤 · 목록 함수 (2026-11-21 추가)
- Phase: 3
- AC: AC-7424.3~AC-7424.6
- REQ: REQ-7424
- Files: supabase/migrations/20261121000001_notice_keywords.sql, supabase/noticeKeywords.rls.test.ts
- Tests: supabase/noticeKeywords.rls.test.ts
- TDD: required
- 메모: TASK-2의 `20261121000000_notices.sql`은 고치지 않는다. `notice_list`·`notice_unread_count`는 합쳐진 TASK-2 본문을 옮겨 두 곳만 더한다(design 15절). 시험은 auth·desk·000000·000001 차례로 돌린다.

## TASK-24: 내 낱말 도구 · 오류 번호 (2026-11-21 추가)
- Phase: 3
- AC: AC-7424.1, AC-7424.2
- REQ: REQ-7424
- Files: src/lib/notices/keywords.ts, src/lib/notices/keywords.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/notices/keywords.test.ts, src/lib/errors.test.ts
- TDD: required

## TASK-25: 내 낱말 단추 · 칸 (2026-11-21 추가)
- Phase: 4
- AC: AC-7424.8, AC-7424.9
- REQ: REQ-7424
- Files: src/components/notices/keywords/**
- Tests: src/components/notices/keywords/KeywordsControl.test.tsx
- TDD: required
- 메모: 목록(TASK-17)을 import하지 않는다. 목록에 끼우는 것은 TASK-22의 쪽 파일이다(AC-7424.13).
