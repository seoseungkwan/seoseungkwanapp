# stats-revenue — 이 PC(윈도우)에서 원래 나는 시험 실패와 마지막 검사 메모

2026-11-14 전체 시험(`PATH="$HOME/.dotnet:$PATH" npx vitest run --no-file-parallelism`, 기능 갈래 a09a1b7): 391개 파일 중 4개 실패, 시험 24,355개 중 4개 실패. 아래는 모두 이 기능이 고치지 않은 파일이다(`git diff 9597521 -- e2e/lib extension src/components/landing`가 비어 있음).

| 파일 | 까닭 |
|---|---|
| `e2e/lib/envFile.test.ts`, `e2e/lib/session.test.ts` | 파일 권한 600 확인 — 윈도우는 chmod가 그대로 남지 않음 |
| `extension/src/manifest.test.ts` AC-003.8 | npm ENOENT(이 PC에서 원래 나는 실패) |
| `src/components/landing/rules.test.ts` | `\` 경로(이 PC에서 원래 나는 실패) |

그 밖: `tsc --noEmit` 통과(옛 `.next/types`는 `npm run build`로 새로 만든 뒤), `npm run lint` 오류 0(옛 경고 2), `npm run build` 통과, 도우미 `Precheck.Core.Tests` net10.0 1,894개 통과, `sdd status` AC 54개 모두 GREEN. 독립 검토 VERDICT: PASS.

## 검토 참고(고치지 않음)
- 도우미 답 크기: 하루 300줄 × 31일 = 9,300줄에 30자 한글 코드면 `dayCodes`만 약 1.25MB라 1,000,000바이트 한도를 넘을 수 있다(design.md의 "1MB 안" 문장은 이 최악에서 맞지 않음). 넘으면 도우미가 꺼지고 웹은 `E-BRIDGE-DISCONNECTED`로 매출 덩어리를 멈춘다. 잰 실제 자료는 하루 최대 136코드·코드 10자 이하 ASCII, 가장 큰 달 약 110KB라 한도까지 5배 넘게 남는다. 막으려면 다음 기능에서 `RevenueCommands`가 직렬화한 크기를 먼저 보고 오류로 답하게 한다.
- 웹 배포 뒤 도우미 0.6.0을 깔기 전에는 `day_codes`가 거짓인 날을 늘 다시 고르므로 [비트에서 불러오기]마다 매출을 다시 읽는다(명세대로). 배포 직후 도우미를 깔도록 안내한다.
- 고른 기간에서 비교 칸이 둘(지난 기간·작년)이면 기간 요약 첫 줄은 5칸, 매출 둘째 줄은 4칸이라 세로선이 맞지 않을 수 있다(보기만).
- 범위 밖 옛 글: `docs/UI_GUIDE.md`(탭 13개·`/revenue`), `docs/tab-frame/plan.md`의 매출 줄, `DashboardPreview.tsx` '13개' 주석, `treatmentEdit.ts`의 `deleteGroup` 주석.
