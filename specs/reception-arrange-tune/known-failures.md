# 이 PC에서 원래 나는 실패 — reception-arrange-tune 마지막 검사 (2026-11-16, e11c6b4)

- 전체 시험(`npx vitest run --no-file-parallelism`): 21409 통과 · 60 실패(23 파일) · 6 건너뜀. 실패 파일 23개와 실패 수 60은 reception-pick-lists 마지막 검사(`specs/reception-pick-lists/known-failures.md`, cd5738b)와 같다. 모두 웹사이트·로그인·RLS·랜딩·classes 규칙·가짜 파일 만들기 시험이고(윈도우 경로·줄 끝 문제), 이 기능은 그 파일들을 건드리지 않았다(`git diff --name-only fa54335 HEAD`는 helper/·reception/·specs/·docs/mockups/뿐). 접수 현황·도우미 시험은 모두 통과
- 실패 파일: e2e/lib/envFile·session, extension/src/manifest, fixtures/patients/make-fake-patients, fixtures/precheck/make-fake-claims, src/app/(app)/tabFrame, src/app/login/page, src/components/charts/rules, common/adminContact, landing/rules, settings/CashFloatSetting, ui/classes, src/lib/auth/guard.server·hospital.server, patients/goldenFollowup·goldenRecall, supabase/server, supabase/patients·revenue·rxPicks·stats·statsRxGroups·worklog RLS
- tsc 오류 0, `npm run lint` 오류 0(경고 2, 이 기능 밖), 접수 현황 프로그램 net48 Release 빌드 성공(일꾼 A 전체 솔루션, 설치 zip용 깨끗한 사본)
- C#: 일꾼 A가 접수 시험 전체 net10 1822개 통과. net48 한꺼번에 돌릴 때 시간 시험 AC-1403.2·AC-1406.4가 한 번 실패했고 둘만 다시 돌리면 통과(앞 기록과 같은 꼴)
- 화면 확인: 저장소 밖 하네스(가짜 서버)로 1194·834·390 폭에서 돌아옴 0분째 → 칸 누르면 멈춤, 자리비움 [되돌리기] → away clear·표시 없음, PT 이름 바꾸기·저장(여섯 무리 몸)·머리 글 바뀜, 비고 → 기록부, 그 전 기록부 3 → [더 보기] 6 → 저절로 다시 읽어도 6, 가로 넘침 0, 콘솔 오류 0
- 마지막 독립 검토: PASS(막는 것 없음)
