# 이 PC(윈도우)에서 원래 나는 실패 — forms-accent 마지막 검사 (2026-11-15)

전체 실행(`npx vitest run --no-file-parallelism`, HEAD a10ace3): 426파일 중 8파일·8개 실패, 26,662개 통과. 모두 이 기능이 건드리지 않은 파일이다. 아래 넷은 forms-themes 마지막 검사(`specs/forms-themes/known-failures.md`)에서도 똑같이 실패한 것이다.

| 시험 | 까닭 |
|---|---|
| `e2e/lib/envFile.test.ts` AC-005.2 두 개 | 윈도우에서 파일 권한 600이 안 됨 |
| `e2e/lib/session.test.ts` (파일 전체) | 경로가 `C:\C:\`로 겹침 |
| `extension/src/manifest.test.ts` AC-003.8 | `spawnSync npm ENOENT` |
| `src/components/landing/rules.test.ts` AC-212.4·AC-420.3 | `\` 경로 |

- PC가 바빠(다른 창의 영상 만들기가 함께 돌던 때) `src/` 전체를 훑는 시험이 5초를 넘김: `src/b2b-merge.test.ts` AC-034.5, `src/components/common/GoogleMark.test.tsx` AC-214.4, `src/components/revenue/parts.test.tsx` AC-4110.4, `src/workers/precheck/tables.test.ts` AC-007.4, 그리고 `src/components/worklog/CashFloatBox.test.tsx` 일꾼 시작 시간 초과(Unhandled Error) → 다섯 파일만 다시 돌리면 138개 모두 통과(4.7초)
- tsc 통과, `npm run lint` 오류 0(경고 2개는 이 기능 밖), `npm run build` 성공
- 화면 확인(TASK-6): 저장소 밖 하네스로 1440·390 폭에서 승인 시안 `?s=color|light|pick`과 나란히 보고, 동작 차례(자동→직접→[자동]→[직접 고르기]→옅은 색 경고→[저장] 몸통 `accent` 직접·null→[새로 만들기] 자동→저장 안내문 열기→바꾸면 '저장하지 않은 내용이 있어요'·되돌리면 사라짐), 테마 그림 1·2·AI 만든 배경·내 배경 위 고른 색('N월'·띠·아래 글 5곳), 인쇄 사본, [그림 파일] PNG(1588×2246)를 확인했다. 가로 넘침 0
