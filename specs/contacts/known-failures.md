# 이 PC(윈도우)에서 원래 나는 시험 실패 — contacts 마지막 전체 검사(2026-11-21, TASK-8)

전체 vitest(`--no-file-parallelism`, 61분): 567파일 중 8파일·25시험 실패, 32,756 통과.

## 기준(b2ab27e5 = `git merge-base HEAD origin/feat-dashboard-saved`)에서도 같은 실패 — 이 기능 탓이 아니다
- e2e/lib/envFile.test.ts — AC-005.2 파일 권한 600 두 시험(윈도우 권한 모델)
- e2e/lib/session.test.ts — 파일 단위 실패(윈도우 권한)
- src/components/landing/rules.test.ts — AC-212.4·AC-420.3 경로 구분자 `\`

## PC가 바쁠 때만 난 실패 — 그 파일만 다시 돌리면 모두 통과(5파일 690시험)
- src/app/titles.test.tsx — AC-402.4 여섯(5초 한도 넘김, 처음 불러오기가 느림)
- src/lib/analytics/aggregate.test.ts — "10만 줄 1초" 둘
- helper/tests/input.dotnet.test.ts — xUnit 하나(AC-017.10 abandoned 뮤텍스) 때문에 감싸개 열하나

## 이 검사에서 고친 것(새로 생긴 실패)
- src/components/ui/classes.test.ts AC-204.6 — `WarrantyNotice.tsx`의 `mt-0.75`(간격 단계 밖). 렌치를 본문 한 줄(22px) 칸 가운데에 두어 같은 3px 자리로 고침
- src/components/dashboard/warranty/WarrantyNotice.test.tsx — 위를 지키는 새 시험이 고치기 전 코드로 돈 것(고친 뒤 통과)

tsc·lint(경고 2, 기존)·build는 모두 통과. 도우미·확장은 고치지 않아 dotnet test·확장 빌드는 돌리지 않았다.
