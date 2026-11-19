# 작업 분할: 가입 신청 때 쓰는 EMR 고르기 (emr-signup)

> 기준 갈래 `feat-emr-signup`(운영 `f26c45a1`에서). 같은 Phase의 TASK는 파일이 겹치지 않는다. 검토는 마지막 한 번.
> 사용자 "빨리, 병렬로" → Phase 1: 일꾼 둘(TASK-3·4) + 기능 폴더에서 TASK-2(SQL) → TASK-3이 합쳐지면 Phase 2(TASK-5).

## TASK-1: 시안과 결정 기록
- Phase: 0
- AC: AC-7303.1, AC-7304.1
- REQ: REQ-7303, REQ-7304
- Files: docs/mockups/emr-signup/index.html, docs/mockups/emr-signup/notes.md
- Tests: 없음
- TDD: exempt — 클릭 시안(지어낸 병원·사람 이름)과 사용자 결정 기록 문서다. 2026-11-19 "좋아"로 승인됐다.

## TASK-2: 가입 신청 줄 EMR SQL
- Phase: 1
- AC: AC-7301.1, AC-7301.2
- REQ: REQ-7301
- Files: supabase/migrations/20261119400000_hospital_emr.sql, supabase/hospitalEmr.rls.test.ts
- Tests: supabase/hospitalEmr.rls.test.ts
- TDD: required — design.md 1절. `clinicEmr.rls.test.ts`와 같은 PGlite 틀. 파일이 없으면 시험마다 실패(RED). 옛 RLS 시험(`rls.test.ts`·`clinicEmr.rls.test.ts` 등)은 고치지 않고 통과해야 한다.

## TASK-3: 병원 정보 기본값·관리자 목록 자료
- Phase: 1
- AC: AC-7302.2, AC-7302.3, AC-7302.4
- REQ: REQ-7302
- Files: src/types/db.ts, src/lib/storage/clinicProfile.ts, src/lib/storage/clinicProfile.test.ts, src/components/clinic/useClinicProfile.ts, src/components/clinic/useClinicProfile.test.ts, src/lib/auth/admin.ts, src/lib/auth/admin.test.ts, src/components/admin/AdminApplications.test.tsx, src/components/admin/applications.test.ts, src/app/(app)/admin/page.test.tsx, src/app/(app)/settings/page.test.tsx, src/components/settings/ClinicProfileCard.test.tsx
- Tests: src/lib/storage/clinicProfile.test.ts, src/components/clinic/useClinicProfile.test.ts, src/lib/auth/admin.test.ts
- TDD: required — design.md 2절. 목록의 뒤 다섯 시험 파일은 `Application`에 `emr`이 생기거나 `@/lib/storage/clinicProfile` 가짜에 `loadSignupEmr`가 필요해 깨지는 곳만 고친다(줄 글자에 `emr: 'bit'`, 가짜에 `loadSignupEmr: async () => null` — 화면 바뀜 없음, 관리자 칸은 TASK-5). `npx tsc --noEmit -p .`가 지나야 끝.

## TASK-4: 가입 신청 '쓰는 EMR' 칸
- Phase: 1
- AC: AC-7302.1, AC-7303.1, AC-7303.2, AC-7303.3
- REQ: REQ-7302, REQ-7303
- Files: src/lib/auth/signup.ts, src/lib/auth/signup.test.ts, src/lib/auth/hospital.ts, src/lib/auth/hospital.test.ts, src/components/auth/SignupForm.tsx, src/components/auth/SignupForm.test.tsx, src/components/ui/classes.test.ts
- Tests: src/lib/auth/signup.test.ts, src/lib/auth/hospital.test.ts, src/components/auth/SignupForm.test.tsx
- TDD: required — design.md 3절, 시안 ①. 옛 가입 시험은 이 칸 때문에 바뀌는 곳(칸 차례·보내는 값·EMR을 골라야 보냄)만 고친다. `classes.test.ts`는 AC-204.7 REQ-215 시험에 '비트' 누르는 한 줄만 더한다.

## TASK-5: 관리자 승인 목록 'EMR' 칸
- Phase: 2
- AC: AC-7304.1
- REQ: REQ-7304
- Files: src/components/admin/AdminApplications.tsx, src/components/admin/AdminApplications.test.tsx
- Tests: src/components/admin/AdminApplications.test.tsx
- TDD: required — design.md 4절, 시안 ②. TASK-3 다음(Application.emr).
