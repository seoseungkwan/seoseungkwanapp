# 작업 분할: 수납일지·통계 원장님별 표

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위, glob 허용), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬(최대 2), 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 마지막에 전체 검사·검토 한 번.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 도우미: 장부 줄에 원장님·0.9.0 |
> | 1 | TASK-2 | 타입·셈 규칙·표 부품 |
> | 2 | TASK-3 | 수납일지 Worker·화면 |
> | 2 | TASK-4 | 통계 Worker·'예약·전환' 칸 |
>
> - **사용자 단계**: 배포 뒤 도우미 0.9.0 정식 판을 접수 PC에 설치(SQL 없음)

## TASK-1: 도우미 장부 줄에 원장님·0.9.0
- Phase: 1
- AC: AC-5002.1, AC-5002.2, AC-5002.3
- REQ: REQ-5002
- Files: helper/src/Precheck.Core/Sunap/**, helper/src/Precheck.Core/Stats/StatsRows.cs, helper/Directory.Build.props, helper/tests/**, src/lib/bridge/versions.ts, src/lib/bridge/*.test.ts
- Tests: helper/tests/Precheck.Core.Tests/Sunap/SunapTargets.test.cs, src/lib/bridge/handshake.test.ts
- TDD: required — design.md '도우미'. `StatsRows.cs`는 `DoctorNames`를 `internal`로 바꾸는 것만. 버전 박힌 기존 시험은 0.8.0 → 0.9.0 숫자만. dotnet 시험은 `PATH="$HOME/.dotnet:$PATH"`

## TASK-2: 타입·셈 규칙·표 부품
- Phase: 1
- AC: AC-5001.1, AC-5001.2, AC-5001.3, AC-5001.4, AC-5001.5, AC-5001.6
- REQ: REQ-5001
- Files: src/types/sunap.ts, src/types/stats.ts, src/lib/sunap/**, src/lib/analytics/sunapRates.ts, src/lib/analytics/sunapRates.test.ts, src/components/sunap/DoctorTable.tsx, src/components/sunap/DoctorTable.test.tsx
- Tests: src/lib/sunap/ledger.test.ts, src/lib/analytics/sunapRates.test.ts, src/components/sunap/DoctorTable.test.tsx
- TDD: required — design.md '타입'·'셈'. 타입을 넓혀 다른 곳이 깨지면(`LedgerRow`를 만드는 기존 시험 자료) 이 TASK Files 안에서만 맞춘다. 밖 파일이 깨지면 TASK-3·4가 맞춘다(그 전까지 tsc 오류는 보고만)

## TASK-3: 수납일지 Worker·화면
- Phase: 2
- AC: AC-5003.1, AC-5003.2, AC-5003.3
- REQ: REQ-5003
- Files: src/workers/sunap/**, src/workers/sunap.worker.ts, src/components/sunap/**
- Tests: src/workers/sunap/handler.test.ts, src/components/sunap/SunapScreen.test.tsx
- TDD: required — design.md '수납일지 Worker·화면'. `DoctorTable.tsx`는 고치지 않고 쓴다

## TASK-4: 통계 Worker·'예약·전환' 칸
- Phase: 2
- AC: AC-5004.1, AC-5004.2
- REQ: REQ-5004
- Files: src/workers/stats/**, src/components/stats/**
- Tests: src/workers/stats/jobs.test.ts, src/components/stats/sections/SunapSection.test.tsx
- TDD: required — design.md '통계'. `DoctorTable.tsx`는 고치지 않고 쓴다
