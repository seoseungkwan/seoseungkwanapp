# 설계: 어느 메모든 고치기 (완료·같음 메모도 고치고, 목록의 메모 줄마다 [메모 고치기])

## 개요
- 화면 둘(`rows/MemoTable`·`rows/MemoRows`)은 막는 조건과 단추만 바꾼다. 판단은 Worker(`jobs.ts`)가 한다: 완료한 사람을 고치면 '완료'를 풀고, 그 뒤는 지금 규칙(`inputTargets`·`replacesOf`) 그대로 '메모 바꿈'으로 입력할 사람에 든다
- '완료 풀림'은 그 달 파일의 `done` 칸에 `false`로 남긴다. `done`은 웹이 쓰는 칸이고(`store.save`가 칸째 바꾼다) 도우미는 값을 읽지 않는다. 입력 기록(journal)의 done은 도우미 것이라 웹이 지울 수 없으므로 `false`가 그것보다 앞선다
- 도우미·확장·명령 표·`MIN_HELPER`는 그대로다. `MemoPanel`도 고치지 않는다(`onEdit`·`onEditDone`·`locked`를 이미 넘긴다, `MemoPanel.tsx:382-404`)

## 도우미(C#) 영향: 웹만으로 된다
| 도우미 자리 | 하는 일 | 완료한 사람을 `replaces`와 함께 다시 보내면 |
|---|---|---|
| `InputBatch.Prepare`(`InputBatch.cs:117-171`) → `WorkStoreJournal.Scan`(`WorkStoreJournal.cs:86-103`) | 쓰다 멈춘 사람 검사: 기록이 writing·writeUnconfirmed인 사람만(96행) | done은 보지 않는다 |
| `InputBatch.DropReason`(`InputBatch.cs:179-186`) | 미리 빼기: 빈 메모·같은 날 내원 수·확인 표시 | done은 보지 않는다 |
| `InputRunner.ReadEarlierWrites`(`InputRunner.cs:270-297`) | 앞선 기록: writing·writeUnconfirmed → 쓰다 멈춤, skippedByHand → 직접 확인 기록(278-280행) | done은 보지 않는다 |
| `RunPerson`·`WhyNotReplace`(`InputRunner.cs:364-434`) | 칸을 다시 읽어 같으면 '이미 입력됨'(403-404행), 다르면 `replaces`가 칸 글과 같을 때만 바꾼다(432행, `MemoApproval.Matches`는 CRLF만 맞춤) | 칸 T · replaces T → E로 바꿈 |
| `WriteMemo`(`InputRunner.cs:469`) → `SaveOriginal`(`WorkStoreJournal.cs:48-72`) | 바꾸기 전 원래 메모를 그 달 `originals` 목록에 더한다. 같은 사람을 두 번 바꿔도 목록에 쌓인다 | 원래 메모 T가 남는다 |
| `MarkFinal`·`FinalState`(`InputRunner.cs:336-362`) | 끝나면 기록을 done(실패면 skipped·check)으로 덮는다 | 다시 done |
| `StoreCommands.Save`(`StoreCommands.cs:44-69`) · `WorkStore.SaveMonth`(`WorkStore.cs:85-105`) | drafts·done은 보낸 값으로 칸째 바꾼다. 웹이 보낸 journal은 저장하지 않는다. done 값은 어디서도 읽지 않는다 | `false`도 그대로 저장 |
| 명령 표 `store.save`(`src/lib/bridge/commands.json`) | done = 아무 object(`json`, `of: object`) | 새 칸·새 명령 없음 |

결론: 도우미는 기록이 done인 사람을 거르지도 거절하지도 않는다. 지금 막는 것은 웹의 `finishedKeys`(`jobs.ts:473-477`)와 화면의 `readOnly`뿐이다. 그래서 도우미 TASK·새 도우미 버전이 없다. PC 확인 창의 '다른 메모를 바꾸는 환자 N명'에도 풀린 사람이 저절로 센다(`InputPrompt.cs:59-61`).

## 구성 요소 / 인터페이스
```ts
// lib/precheck/memoCompare.ts (TASK-1): MemoSource에 선택 칸 하나
export type MemoSource = {
  /* …지금 칸 그대로(atLoad·latest·journal·approved·declined)… */
  /** 완료를 푼 사람 가운데 이 화면에서 비트 메모를 읽은 뒤 입력을 마친 사람: 내원번호 → 그때 넣은 글. 있으면 받은 비트 메모 대신 이 글과 견준다. 4,000자를 넘으면 읽지 못한 것(undefined) */
  entered?: ReadonlyMap<string, string>
}
// visitMemos만 이 칸을 본다. compareMemo·bitMemoOf·replacesOf·inputPlan과 C# 사례 파일은 그대로

// workers/precheck/jobs.ts (TASK-2)
type StoredWork = { /* 지금 칸 */; released: Set<string> } // 달 파일 done 값이 false인 사람(완료 풀림)
// loadStore: done 값이 false면 work.done·saved에 넣지 않고 released에 넣는다. 달 칸(months.done)에는 false 그대로 둔다(다시 보낼 때 남게)
// finishedKeys(): work.done ∪ (journal이 done인 사람 − released)
// editMemo: 지금 글과 다른 글이고 finishedKeys에 있으면 → work.done.delete · released.add · months.done.set(key, false) · unsaved에 release: true.
//           그 뒤는 지금 길 그대로(approved.delete · saved · drafts · unsaved · markMonth · saveMonth). 그래서 store.save 한 번에 drafts와 done이 함께 간다
let unsaved: Map<string, { text: string; month: string; release?: true }> // applyUnsaved가 release도 다시 얹는다(AC-2202.7)
const afterEntry: Map<string, string> // Set → Map(내원번호 → 넣은 글 item.memo). has·clear 자리는 그대로
// applyInputResults '완료': released.delete(key) 하나 더(done.set(key, item.memo)는 지금 그대로)
// memoRows(): visitMemos source에 entered = afterEntry 가운데 released인 사람만

// components/claim/rows/MemoTable.tsx (TASK-3)
// readOnly={locked}. className = locked ? `${ds.readonly} h-auto py-1.5 text-small` : `${ds.input} h-auto py-1.5 text-small`

// components/claim/rows/MemoRows.tsx (TASK-4)
const editable = (row: TargetRow) => row.hasMemo && !isBlankMemo(row.text) // '메모 없음'과 같은 판단(inputPlan)
// 줄마다 단추 줄 하나: 지금 단추([바꾸지 않기] 또는 [이 메모로 바꾸기], 있으면) + [메모 고치기](editable, disabled={locked}).
// editing === row.key면 [메모 고치기] 대신 그 아래에 지금 Editor. [다시 하기 (N명)]는 묶음 머리 그대로
```

## 데이터 흐름 (고치기 → 다음 입력)
1. 표 칸이나 목록 칸에서 고침 → `useMemoDrafts`(1초 또는 칸 밖) → `editMemo`(지금 메시지 그대로) → Worker
2. Worker: 완료한 사람이면 풀고, drafts와 done(false)을 한 번의 `store.save`로 보낸다 → 도우미가 그 PC 암호화 파일에 저장
3. 메모 보기: 그 사람은 finished가 아니다 → `reasonOf`가 'done'으로 빼지 않는다(`inputTargets.ts:49`) → 비교가 '다름'이면 `replacesOf` = 비트 글(`memoCompare.ts:104-108`) → 입력할 사람 '메모 바꿈'(`inputTargets.ts:109`)
4. [비트에 입력] → `itemOf` `{ memo: E, replaces: T }`(`jobs.ts:573-576`) → 도우미가 칸이 T일 때만 E로 바꾸고 T는 `originals`에
5. 끝 답 '완료' → `done[key] = E`, released에서 지움 → 다시 '완료'. 건너뜀·확인 필요면 풀린 채

## '같음' 줄
완료 기록 없이 '같음'인 줄은 풀 것이 없다. 고치면 글이 달라져 비교가 '다름'이 되고(`compareMemo`) 3번부터 같다. done 칸은 건드리지 않는다.

## 방금 넣은 사람 (같은 화면)
입력 뒤 웹의 비트 메모 사본은 다시 불러오기 전까지 입력 전 값이다(카드의 '다시 불러오면 맞춰져요'). 그대로 견주면 넣기 전에 비었던 사람은 '새 메모'(replaces 없음)가 되고, 묻지 않기가 꺼져 있으면 도우미가 '이미 있음'으로 건너뛴다(`InputRunner.cs:433`). 그래서 풀린 사람 가운데 afterEntry인 사람만 그때 넣은 글을 비트 글로 본다. 도우미가 저장 뒤 다시 읽어 확인한 글이다(`SaveAndConfirm`, `InputRunner.cs:510-516`). 그사이 비트에서 누가 바꿨으면 replaces가 칸 글과 달라 도우미가 바꾸지 않고 '입력 직전 기존 청구메모가 변경되었습니다'로 건너뛴다(432·459행). 틀려도 안전한 쪽이다. 고치지 않은 완료 줄의 비교는 지금처럼 사본 그대로다.

## 얼림 (precheck AC-014.11)
- 고친 글 E는 drafts에 있어 설정을 바꿔도 다시 만들지 않는다(`memoViews`, `jobs.ts:125-137`). 풀린 사람의 done 글은 false가 되지만 drafts가 글을 지킨다. 넣었던 글 T는 비트에 있고, 바꿀 때 도우미가 `originals`에 남긴다
- `editMemo`는 그 사람 한 줄만 바꾼다. 다른 사람의 drafts·done 값은 받은 그대로 다시 보낸다(`saveMonth`, `jobs.ts:416-422`)

## 울타리
- `components/claim/rows`는 props로만 받는다. 새 불러오기는 `@/lib/precheck/memoCompare`의 `isBlankMemo`(순수 함수) 하나다. rows 울타리(`eslint.config.mjs:173-`)가 막는 것은 네트워크·console·저장소·supabase·services·storage·auth라 걸리지 않는다
- `lib/precheck`·`workers`는 지금 규칙 그대로(새 import 없음). 고친 글·완료 풀림은 Worker → 통로 → 도우미로만 간다. 서버로 가는 날짜별 건수 모양은 그대로다

## 화면
- 메모 표: 칸은 `locked`일 때만 막힌다. 막힌 칸은 `ds.readonly` 모양(canvas 바탕·line 테두리·ink-2 글자)이라 칠 수 있어 보이지 않는다. 상태·비교 칩과 '지난 입력' 글은 지금처럼 Worker 값을 그린다(풀린 줄은 '고침'·'다름')
- 목록: [메모 고치기]는 지금 `ds.button.secondarySmall`. 단추가 둘인 줄은 `flex flex-wrap gap-2` 한 줄. 새 글·새 부품 없음
- 휴대폰: 단추 줄은 꺾일 수 있다(지금 단추 모양 그대로)

## 화면 목업 (승인 요청용, 지금 부품·글만)
메모 표 — 완료 줄 (가상환자a, 지금)
```
진료일       차트번호  환자       처방         메모                              비교   상태
10/28 (화)  9a       가상환자a  가상시술 가  ┌ 우리 메모 a ─────────────────┐  [같음] [완료]
                                             └ 흰 칸이라 칠 수 있어 보이지만 안 쳐짐 ┘
```
메모 표 — 바뀐 뒤
```
① 고치기 전   ┌ 우리 메모 a ──────┐ (흰 보통 칸, 칠 수 있음)        [같음] [완료]
② 고친 뒤     ┌ 우리 메모 a 고침 ─┐                                   [다름] [고침]
③ 입력 중     ┌ 우리 메모 a ──────┐ (회색 바탕·연한 테두리, 모든 줄)  지금 칩 그대로
```
목록 — 이미 입력됨 줄
```
지금                                         바뀐 뒤
이미 입력됨 [1명]                            이미 입력됨 [1명]
비트 메모가 우리 메모와 같아요. 다시 넣지 않아요.   (글 그대로)
────────────────────────────────────         ────────────────────────────────────
10/28 (화) 가상환자a           메모 보기     10/28 (화) 가상환자a           메모 보기
차트 9a · 처방 가상시술 가                   차트 9a · 처방 가상시술 가
                                             [메모 고치기]
```
목록 — 고친 뒤(입력할 사람으로 옮김) · [메모 고치기]를 누른 때
```
1  10/28 (화) 가상환자a  [메모 바꿈]                    메모 보기
차트 9a · 처방 가상시술 가
┌ 비트에 있는 메모 ┐ ┌ 우리 메모 ─────┐
│ 우리 메모 a      │ │ 우리 메모 a 고침 │
[바꾸지 않기] [메모 고치기]

[메모 고치기]를 누르면:
[바꾸지 않기]
가상환자a 메모 고치기
┌ 우리 메모 a 고침 ──────────────┐
확인 표시를 지우거나 글을 고친 뒤 칸 밖을 누르면 목록에 바로 반영돼요.
```
다른 메모 있음 줄은 `[이 메모로 바꾸기] [메모 고치기]`, 새 메모·직접 입력·비트 메모를 읽지 못함 줄은 `[메모 고치기]` 하나, 메모 없음 줄은 지금처럼 단추 없음. 입력 중에는 [메모 고치기]가 모두 흐리다.

## 결정과 트레이드오프
- **완료 풀림을 done 칸 false로**: journal은 도우미 것이라 웹이 못 지우고(`StoreCommands.cs:44-47`), 메모리에만 두면 다시 불러올 때 '완료'로 돌아간다. done 칸은 웹이 쓰는 칸이고 모양(`string | boolean`, `types/precheck.ts:220`)도 그대로다. 지금 배포된 화면(81af11c)은 false도 완료로 읽어(`jobs.ts:95-96`) 막히는 쪽이라 안전하다
- **버린 길**: 'drafts 글 ≠ done 글이면 풀림'은 입력 중에 화면을 떠나 done 칸은 비고 journal만 done인 사람과 가를 수 없다
- **고치면 바로 풀림, 묻는 창 없음**(사용자 결정 1): 상태가 '고침'이 되고 목록에서 '메모 바꿈'으로 옮겨 보인다. 새 안내 글은 더하지 않는다. 고쳤다가 T로 되돌리면 풀린 채지만 비교가 '같음'이라 지금처럼 '이미 입력됨'으로 보인다
- **직접 확인 기록**(skippedByHand)이 남은 사람은 풀려도 지금처럼 '다른 메모 있음'이고 [이 메모로 바꾸기]를 눌러야 든다(`memoCompare.ts:106`)
- **날짜별 건수**: 풀린 사람은 다음 건수 보내기(불러오기·입력 끝)부터 입력 안 된 사람으로 센다(`counts.ts` 그대로)
- **바뀌는 시험 기대값 없음**: `jobs.test.ts:1855-1868`('입력 기록이 done이면 … 이미 입력됨')은 고치지 않은 완료 줄의 시험이라 그대로 맞다. 표의 잠금(`row.done`)을 기대한 시험은 없다. `MemoRows.test.tsx:140`의 이름만 고친다

## 위험
- 완료 줄을 실수로 치면 1초 뒤 풀린다. 다음 입력에서 비트 메모가 그 글로 바뀐다(원래 메모는 PC 기록과 엑셀에 남는다)
- 4,000자를 넘는 글을 넣었던 사람은 고치면 '비트 메모를 읽지 못함'이 된다(replaces 한도, `BatchCheck.MaxReplaces`). 비트 메모를 다시 불러와도 같다(지금 규칙)
- 다른 PC나 옛 화면이 같은 달 파일을 저장하면 false를 모르는 채 다시 보낼 수 있다. 옛 화면은 false를 완료로 보고 그대로 되돌려 보내므로 풀림이 지워지지는 않는다
