# 설계: 수납일지 장부 줄 세우기

## 규칙 `src/lib/sunap/ledgerSort.ts` (환자 자료 구역, React·네트워크 없음)
```ts
export type LedgerSort =
  | { key: 'name' | 'kind' | 'cash' | 'card' | 'transfer' | 'unpaid' | 'block' | 'pt'; dir: 'asc' | 'desc' }
  | { key: 'rsv'; by: 'kind' | 'date'; dir: 'asc' | 'desc' }
export function sortLedger<T extends { row: LedgerRow }>(items: readonly T[], sort: LedgerSort | null): T[]
```
- 화면은 `{ row, no }`(NO = 접수 번호)를 넘긴다 → 세운 뒤에도 NO가 그대로다. 비교가 같으면 받은 차례(안정 정렬).
- 구분 차례 `new → d90 → re`. Block·물리치료는 `false → true`(오름차순). 예약 종류 차례 `inj → visit → etc → unknown`, `none`은 늘 맨 뒤. 예약 날짜는 `row.rsv.at`(`yyyyMMddHHmm` 글자, 없으면 null → 날짜 있는 줄 뒤).

## 화면 `src/components/sunap/rows/LedgerRows.tsx`
- 상태 `sort: LedgerSort | null`(처음 null). 거르기·찾기 뒤의 `shown`을 `sortLedger`로 세운다.
- 제목 칸은 `<th aria-sort>` 안의 `<button>`(이름 + ▲/▼/↕). 숫자 칸은 화살표가 글자 왼쪽(시안).
- [다음 예약]은 `src/components/sunap/rows/SortMenu.tsx`(새 파일): 누른 제목 아래에 `fixed`로 뜨는 목록(표가 `overflow-x-auto` 안이라 `absolute`는 잘린다 — `Pop`과 같은 `anchorOf` 자리 잡기, 바탕 흐림 없음). 항목은 `role="menuitemradio"`·`aria-checked`, Esc·바깥 `pointerdown`이면 닫는다.
- 표 위 한 줄(시안 `.sortnote`)은 칩 줄 아래 `text-caption text-muted`, 굵은 부분은 `font-semibold text-ink`.
- 글자·차례는 requirements 그대로. 시안과 다른 점: 시안의 '원장님' 칸은 실제 화면처럼 없다(시안에서도 뺐다).

## 위험
- 없음(보여 주는 차례만 바뀜). 고치기 판(금액·예약·비고)은 `chart`로 줄을 찾으므로 세운 차례와 상관없다.
