# 설계: 수납일지 다음 예약 종류 직접 만들기

## 바탕
- 구현은 sunap-sort(줄 세우기)를 합친 뒤에 한다: `ledgerSort.ts`·`SortMenu.tsx`·`LedgerRows.tsx`를 둘 다 고친다. 승인 뒤 첫 일로 `feat-sunap-sort`를 이 갈래에 합친다(명세 파일은 겹치지 않아 승인 그대로).

## 타입 `src/types/sunap.ts`
```ts
export type RsvKindDef = { id: string; label: string; counts: boolean; words: string[] }
// 'none' | 'unknown' | 종류 id(inj·visit·etc·k+6자). 글자라 타입으로 못 좁히고 kinds.ts의 검사로 지킨다
export type RsvKind = string
export type HandRsvKind = string // 'unknown' 아님
export const DEFAULT_RSV_KINDS: RsvKindDef[] // 주사치료 inj ○ [주사,블록] · 진료(경과) visit ○ [경과,진료] · 기타 etc ✕ [기타]
export type SunapSettings = { blockGroup: string | null; ptGroup: string | null; kinds: RsvKindDef[] }
export type LedgerSettings = { kinds: RsvKindDef[]; blockDef; ptDef }
```
- `RsvWords`·`DEFAULT_RSV_WORDS`는 옛 줄 읽기와 RLS 시험(기본값 비교)에 그대로 남긴다.

## 규칙 `src/lib/sunap/kinds.ts` (새, 환자 자료 구역 규칙만)
- `KIND_ID = /^(inj|visit|etc|k[a-z0-9]{6})$/`, `isKindId(x)`, `isHandKind(x) = x === 'none' || isKindId(x)`, `isFixedKind(x) = isHandKind(x) || x === 'unknown'`.
- `readKinds(x: unknown): RsvKindDef[] | null` — AC-5501.2 검사, 맞으면 새 배열(복사), 아니면 null.
- `splitWords(text: string): string[]` — AC-5501.3(`,`·`，`로 나눔, trim, 빈 말 버림, 대소문자 무시 겹침 제거).
- `kindsFromLegacy(words: RsvWords): RsvKindDef[]` — 기본 이름·예약률 + 그 말.
- `newKindId(taken: readonly string[], random: () => number = Math.random): string` — `k`+6자, 겹치면 다시.
- 이름 상수 `FIXED_LABELS = ['예약 안 하고 가심', '종류 모름']`, `KIND_MAX = 10`, `LABEL_MAX = 10`, `WORD_MAX = 20`, `WORDS_TEXT_MAX = 40`.
- 바이트: 10종류 × (이름 30 + 말 글 40자 ≤ 120 + 따옴표·쉼표 + 칸 이름) ≈ 3,000바이트 < 4,000 → SQL 그대로.

## 장부 `src/lib/sunap/memo.ts`·`ledger.ts`·`ledgerSort.ts`
- `classifyMemo(memo, kinds)` — 목록 차례.
- `rsvOf(bit, edit, fixed, kinds)` — AC-5502.2. `ids = new Set(kinds.map(id))`.
- `dayTotals(ledger, kinds = DEFAULT_RSV_KINDS)` — counts인 id 집합으로 rsv_first·rsv_d90.
- `sortLedger(items, sort, order: readonly string[] = ['inj','visit','etc'])` — 종류 순 = order → unknown → none(none 늘 맨 뒤).

## Worker `src/workers/sunap/read.ts`·`messages.ts`·`handler.ts`
- 고정 집합 `RSV_KINDS`·`HAND_KINDS` 대신 `isHandKind`·`isFixedKind`.
- `readLoad`: `readKinds(m.kinds)`; `SunapLoadMessage.words` → `kinds`. handler는 받은 kinds를 buildLedger·dayTotals에 넘긴다.

## 저장 `src/lib/storage/sunap.ts`
- 읽기: `readKinds(row.rsv_words?.kinds) ?? (pickWords(row.rsv_words) && kindsFromLegacy) ?? DEFAULT_RSV_KINDS` 복사.
- 쓰기: `readKinds(settings.kinds)`가 null이면 failed, 아니면 `rsv_words: { kinds }`.

## 화면
- `SunapSettings.tsx`: 종류 목록 상태(이름·말 글·counts), 저장 때 검사(AC-5503.3) → `kinds` 만들어 onSave. 새 id는 `newKindId`. 기본 셋 지우기 없음. 지우기는 목록에서 뺄 뿐(PC 저장의 직접 고른 값은 그대로 두고 장부 규칙이 비트 따라가기로 본다).
- `labels.ts`: `RSV_LABEL` 대신 `rsvLabel(kind, kinds)`(none·unknown은 지금 글, 목록에 없으면 '종류 모름').
- `RsvPicker.tsx`·`LedgerRows.tsx`·`SortMenu.tsx`: props `kinds`. 칩 색 inj 파랑·visit 청록·unknown 노랑·나머지 회색.
- `SunapScreen.tsx`: 설정 kinds를 Worker load·장부·고르기·카드·알림 띠에 넘김. `useSunapWorker.ts`: `SunapAsk.words` → `kinds`.
- `SunapCards.tsx`: props `reserved: readonly string[]`(counts인 이름). `RemoteView.tsx`는 설정을 읽지 않고 `예약률 ○ 종류 예약만`(SunapCards에 그 글을 넘김).
- 말 길이: `words.join(',').length <= 40`(말 칸 maxLength 40과 같은 셈, 다듬으면 줄기만 한다).
- `stats/sections/SunapSection.tsx`: 글 두 곳만(AC-5503.8).

## 위험
- 배포 순간 열려 있던 옛 화면이 설정을 저장하면 `{inj,visit,etc}`만 남아 새 종류가 사라진다 → 새 화면은 옛 모양도 읽으니 깨지지는 않는다(드묾, 다시 만들면 됨).
- 마감한 날 카드 아래 글은 지금 설정 이름을 쓴다(숫자는 마감 때 그대로).
