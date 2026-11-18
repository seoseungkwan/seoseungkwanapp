# 작업 분할: 수납일지 장부 다른 기기에서 보기(계정마다)

> 형식: `## TASK-n: 제목` 아래에 `- Phase:`, `- AC:`, `- REQ:`, `- Files:`(수정 범위), `- Tests:`, `- TDD: required|exempt`.
> 승인되면 Files/Tests에 적힌 경로만 고친다. TASK마다 일꾼 하나. 같은 Phase는 병렬(최대 2)이고 **같은 Phase의 TASK끼리 파일이 겹치지 않는다**. 앞 Phase가 합쳐진 뒤 다음 Phase.
> MVP 모드: 중간 검토 없이 마지막에 전체 검사·검토 한 번. Phase 끝마다 그 Phase 시험 파일만 돌린다.
>
> | Phase | TASK | 하는 일 |
> |---|---|---|
> | 1 | TASK-1 | 서버 표 둘·함수·트리거·정책 SQL + PGlite RLS 시험 |
> | 1 | TASK-2 | 보낼 칸 고르기·읽은 값 검사 순수 함수 + 오류 번호 넷 |
> | 2 | TASK-3 | 저장 함수(계정 목록·스위치·상태·사본 보내기·읽기) |
> | 2 | TASK-4 | 장부 표 `readOnly` + 보기 전용 장부 칸(`rows/SharedLedgerPanel`) |
> | 3 | TASK-5 | 수납일지 [설정] '다른 기기에서 장부 보기' 칸 + 설정 판 `share` 자리 |
> | 3 | TASK-6 | 다른 기기 화면(`RemoteView`)에 사본·안내·힌트 |
> | 4 | TASK-7 | 훅 둘: 접수 PC 보내기(`useShareUpload`) · 다른 기기 읽기(`useSharedLedger`) |
> | 4 | TASK-8 | 문서: ADR-033 · CLAUDE.md 예외 줄 · plan.md · ARCHITECTURE |
> | 5 | TASK-9 | `SunapScreen` 잇기(접수 PC 보내기·상태 줄·다른 기기 사본·원장 [설정]) |
>
> - **시안 없음**: 사용자 2026-11-18 "시안만들지말고 바로 해"(design.md 0절). 화면 TASK(4·5·6·9)는 목업 승인을 기다리지 않고 design.md '화면 글자'·지금 부품 모양대로 만든다.
> - 잇는 곳: TASK-2의 `SharedCopy`·열쇠 목록을 TASK-1(SQL 열쇠 모음)·3·4가 같은 글로 쓴다(design.md 2-4·3절). TASK-6이 `SharedView` 타입을 `RemoteView.tsx`에서 내보내고 TASK-7 `useSharedLedger`가 쓴다(`ServerDayView`와 같은 길). TASK-5가 `SunapSettings`에 `share` 자리를 만들고 TASK-9가 `ShareAccounts`를 넣는다(그래서 TASK-5는 `SunapScreen.test.tsx`를 고치지 않는다).
> - **사용자 단계**: 배포 전 `supabase/migrations/20261118200000_sunap_share.sql`을 Supabase SQL Editor에 붙여 넣기(desk_accounts 다음, SQL 먼저 웹 다음 — design.md 11절). Claude는 실제 Supabase에 붙지 않는다. 도우미 새 판은 없다.

## TASK-1: 서버 표·함수·정책 SQL
- Phase: 1
- AC: AC-6501.1, AC-6501.2, AC-6501.3, AC-6501.4, AC-6501.5, AC-6501.6, AC-6501.7, AC-6501.8
- REQ: REQ-6501
- Files: supabase/migrations/20261118200000_sunap_share.sql, supabase/sunapShare.rls.test.ts
- Tests: supabase/sunapShare.rls.test.ts
- TDD: required — design.md 2절. 시험은 `supabase/desk.rls.test.ts` 꼴로 PGlite에서 진짜 migration을 차례로 돌린다(desk 시험의 CHAIN → `20261118100000_desk_accounts.sql` → 이 파일, 파일이 없으면 빈 글자). 사람: 원장 A·B, 승인 대기 C, 거절 D, 병원 없음 E, A 데스크 K·L, B 데스크 M, anon(JWT `sub`·`email`). 표·칸 권한, RLS, 정책 하나(이름·식), 함수 정의자·`search_path`·실행 권한 표(다섯만 authenticated, 모양 검사·트리거 함수는 아무에게도), 계정 목록·스위치(42501·남의 데스크 id·두 번 켜기), 상태, 저장(켠 계정 없음 → null·22023·42501·B 그대로·바로 쓰기 42501), 모양 거부(23514, 열쇠 phone·rrn·address·birth·doctor·codes·memo·rsv 밖 열쇠·줄 수·길이·크기)와 400줄·비고 100자 통과, 읽기(켠 원장·켠 데스크만, 오늘 − 30 보임·− 31 안 보임 — − 31 줄은 시험이 저장 트리거를 잠깐 끄고 넣는다, 데스크 줄 빼면 바로 못 봄), 지우기(저장 때 모든 병원 − 31 지움·마지막 끄기·마지막 데스크 줄 빼기 → A만 지움·하나 남으면 그대로), 두 번 돌리기·LF·머리 주석 낱말·쓴 문장 종류, `my_hospital_id`·`my_desk_hospital_id`·`my_clinic_hospital_id` 글자 그대로. **실제 Supabase에 붙여 넣지 않는다**

## TASK-2: 보낼 칸 고르기·오류 번호
- Phase: 1
- AC: AC-6502.1, AC-6502.2, AC-6502.3, AC-6502.4, AC-6502.5, AC-6507.1
- REQ: REQ-6502, REQ-6507
- Files: src/lib/sunap/share.ts, src/lib/sunap/share.test.ts, src/lib/errors.ts, src/types/errors.ts, src/lib/errors.test.ts
- Tests: src/lib/sunap/share.test.ts, src/lib/errors.test.ts
- TDD: required — design.md 3절·7절. `share.ts`는 `lib/sunap` 환자 자료 구역(네트워크·저장소·console·React 없음, `@/lib/worklog/notes`의 `privacyProblem`·`@/lib/analytics/dates`·`@/lib/sunap/kinds`만). 받은 객체를 펼치지 않고 열쇠 목록으로 새로 만든다. 시험: 금지 열쇠(phone·rrn·address·birth·memo·codes·doctor·rsv.memo)를 붙인 줄 → 결과 열쇠 목록과 `JSON.stringify` 글자에 없음, 받은 배열·객체와 `!==`, 비고 가리기, 틀린 값마다 null, `readSharedLedger` 같은 규칙, `dayTotals(sharedToLedger(…), sharedKinds(…))` = 원래 `dayTotals`, `shareOldest`·`inShareWindow` 끝 날. 오류 번호 넷은 design.md 7절 글 그대로, `ALL_CODES`에 더하고 E-SUNAP-SHARE- 번호가 이 넷뿐인지 본다('병원' 낱말 예외 목록은 그대로)

## TASK-3: 저장 함수
- Phase: 2
- AC: AC-6503.1, AC-6503.2, AC-6503.3, AC-6503.4
- REQ: REQ-6503
- Files: src/lib/storage/sunapShare.ts, src/lib/storage/sunapShare.test.ts
- Tests: src/lib/storage/sunapShare.test.ts
- TDD: required — design.md 4절. `lib/storage/sunap.ts`·`desk.ts` 꼴(가짜 client의 `rpc`·`from` 부름 기록). `saveSunapCopy`는 안에서 `toSharedLedger`를 불러 고른 값만 보내고, 시험은 진료의·전화 같은 값을 붙인 줄을 넣어 보낸 몸통 글자에 없는지 본다. 읽은 값은 `readSharedLedger`로 검사하고 틀리면 failed. 오류 글·JSON에 Supabase 문구·이름·차트번호 없음

## TASK-4: 보기 전용 장부 표
- Phase: 2
- AC: AC-6506.1, AC-6506.2
- REQ: REQ-6506
- Files: src/components/sunap/rows/LedgerRows.tsx, src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/rows/SharedLedgerPanel.tsx, src/components/sunap/rows/SharedLedgerPanel.test.tsx
- Tests: src/components/sunap/rows/LedgerRows.test.tsx, src/components/sunap/rows/SharedLedgerPanel.test.tsx
- TDD: required — design.md 5-2절. `rows/**` 환자 줄 울타리 안(네트워크·저장소·supabase·lib/storage 없음, 받은 값만). `readOnly`를 안 주면 지금 시험이 그대로 통과한다. `SharedLedgerPanel`은 맨 위 줄(같은 날 'HH:MM'·다른 날 'M월 D일 HH:MM'·closedText null이면 마감 상태 빼기)·[새로 읽기]·읽기 전용 표(칸 단추 0개)·미수 입금·aside 자리·바깥 `min-w-0`과 표 감싸개 `overflow-x-auto`를 본다

## TASK-5: 설정 '다른 기기에서 장부 보기'
- Phase: 3
- AC: AC-6504.1, AC-6504.2, AC-6504.3, AC-6504.4, AC-6504.5, AC-6504.6
- REQ: REQ-6504
- Files: src/components/sunap/ShareAccounts.tsx, src/components/sunap/ShareAccounts.test.tsx, src/components/sunap/SunapSettings.tsx, src/components/sunap/SunapSettings.test.tsx
- Tests: src/components/sunap/ShareAccounts.test.tsx, src/components/sunap/SunapSettings.test.tsx
- TDD: required — design.md 5-1절·6절. 모양은 설정 탭 `DeskAccounts` 목록 + `RoughSwitch`의 `role="switch"`. 시험은 `@/lib/storage/sunapShare`·`@/lib/supabase/browser`를 흉내 내고, 데스크는 `RoleProvider desk`로 감싸 아무것도 그리지 않고 부르지 않는지 본다. 처음 켜기·마지막 끄기 확인 상자(초점 [취소], Esc는 상자만 닫고 설정 판은 그대로 — `SunapSettings.test.tsx`에서 `share={<ShareAccounts />}`로 함께 그려 본다)·그 밖은 바로 보냄·보내는 동안 막힘·실패 카드·`onChange` 한 번. `SunapSettings`는 `ShareAccounts`를 import하지 않고 `share` 자리만 판 맨 위에 둔다(안 주면 지금 시험 그대로)

## TASK-6: 다른 기기 화면 사본·안내
- Phase: 3
- AC: AC-6506.3, AC-6506.4, AC-6506.5, AC-6506.6, AC-6506.7
- REQ: REQ-6506
- Files: src/components/sunap/RemoteView.tsx, src/components/sunap/RemoteView.test.tsx
- Tests: src/components/sunap/RemoteView.test.tsx
- TDD: required — design.md 5-3절·6절. `RemoteView`는 받은 `share`(`SharedView`)로만 그리고 읽지 않는다(`SharedView` 타입을 이 파일에서 내보냄). `share`가 없으면 지금 시험이 그대로 통과한다(old-day). loading·off(sharing 참·거짓, 원장·데스크 힌트 — `RoleProvider desk`로 데스크)·old·none·ready(잠금 줄·`SharedLedgerPanel`·지출 목록이 aside로 옮김·자물쇠 카드 없음·고치기·마감 단추 없음)·failed(viewer 참: 사본 자리 오류 카드 / 거짓: 지금 카드 + 오류 카드)·[다시 불러오기]·[새로 읽기]가 `onShareReload`를 부름

## TASK-7: 보내기·읽기 훅
- Phase: 4
- AC: AC-6505.1, AC-6505.2, AC-6505.3, AC-6505.5, AC-6506.7
- REQ: REQ-6505, REQ-6506
- Files: src/components/sunap/useShareUpload.ts, src/components/sunap/useShareUpload.test.ts, src/components/sunap/useSharedLedger.ts, src/components/sunap/useSharedLedger.test.ts
- Tests: src/components/sunap/useShareUpload.test.ts, src/components/sunap/useSharedLedger.test.ts
- TDD: required — design.md 5-4절. jsdom + `renderHook`, `@/lib/storage/sunapShare`·`@/lib/supabase/browser` 흉내, 가짜 시계(`vi.useFakeTimers`). `useShareUpload`: 새 보기마다 5초 다시 걸기·마지막 것만·sharing 거짓이면 저장 안 부름·31일 밖이면 상태도 안 부름·`flush` 바로·날 바뀜이면 앞 날 바로 보내고 답 버림·unmount면 버림·한 번에 하나·실패 규칙(sharing 참일 때만 상태 실패 = failed)·`retry`·`recheck`. `useSharedLedger`: 상태 → off·old(사본 안 부름)·none·ready, 첫 읽기 loading·다시 읽기는 앞 값 두고 refreshing, 날 바뀜 늦은 답 버림, `visibilitychange`(보임)·`reload`, 상태 실패 = failed viewer 거짓·사본 실패 = viewer 참, enabled 거짓이면 아무것도 안 부름

## TASK-8: 문서 — ADR-033·CLAUDE.md·plan.md·ARCHITECTURE
- Phase: 4
- AC: AC-6508.1, AC-6508.2, AC-6508.3
- REQ: REQ-6508
- Files: docs/ADR.md, CLAUDE.md, plan.md, docs/ARCHITECTURE.md
- TDD: exempt — 문서 글자만 고친다(앱 코드 없음). design.md 8절 글 그대로: `docs/ADR.md` 끝에 ADR-033, `CLAUDE.md`는 ADR-030 예외 줄 바로 아래 한 줄만, `plan.md`는 DB 표 `hospital_members` 줄 바로 아래 두 줄, `docs/ARCHITECTURE.md`는 DB 표 `sunap_settings` 줄 바로 아래 두 줄과 폴더 설명 예약 탭 줄 바로 아래 한 줄. 다른 줄·차례는 바꾸지 않는다. 확인: 문서를 읽는 지금 시험(`src/b2b-merge.test.ts`·`src/lib/forms/backgroundDocs.test.ts`·`src/lib/forms/guideDocs.test.ts`·`src/lib/forms/rules.test.ts`·`src/components/revenue/parts.test.tsx`·`supabase/rxPicks.rls.test.ts`·`supabase/statsRxGroups.rls.test.ts`·`supabase/statsRxGroupsExclude.rls.test.ts`·`supabase/worklog.rls.test.ts`)이 그대로 통과

## TASK-9: SunapScreen 잇기
- Phase: 5
- AC: AC-6505.4, AC-6505.5, AC-6505.6, AC-6506.3, AC-6506.8, AC-6506.9
- REQ: REQ-6505, REQ-6506
- Files: src/components/sunap/SunapScreen.tsx, src/components/sunap/SunapScreen.test.tsx
- Tests: src/components/sunap/SunapScreen.test.tsx
- TDD: required — design.md 5-5절·6절. 접수 PC: `useShareUpload`·상태 줄('다른 기기로 보내는 중…'·'다른 기기로 보냄 · HH:MM')·잠금 줄 글 바꾸기·보내기 실패 카드와 [다시 보내기]·마감 성공 뒤 `flush`·설정 판 `share={<ShareAccounts onChange={upload.recheck} />}`. 다른 기기: `useSharedLedger`(device·old-helper만 enabled)·`RemoteView`에 `share`·원장만 [설정](설정·묶음 읽기, 실패 E-SETTINGS-FAILED, 판에 `ShareAccounts onChange={shared.reload}`), 데스크는 [설정] 없음. connecting·old-day 그대로. 시험은 `vi.mock('@/lib/storage/sunapShare')`(기본 상태 `{sharing:false, canView:false}`·계정 빈 목록)를 더해 지금 시험(설정 열기 포함)이 그대로 통과하게 하고 새 AC 시험을 더한다
