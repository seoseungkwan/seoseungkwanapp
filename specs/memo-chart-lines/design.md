# 설계: 청구 메모 목록에 증상·처방내역(총투여량)을 한 줄씩

## 화면 목업 (승인 요청용, 지금 부품·글만. 이름·글은 지어낸 값)
눌러 보는 시안: `docs/mockups/precheck/memo-chart-lines.html`(원래 도구 chart review의 '증상 · 차트 원문'·'처방내역' 칸을 참고. PC·휴대폰 폭, 열고 닫기, [메모 고치기]가 줄 열기). 아래 글 그림은 그 요약이다.
열린 줄 — 지금
```
1  11/2 (월) 가상환자A  [새 메모]                                        접기
차트 9001 · 처방 가상리도카인주, 가상진찰료, 가상신경차단술-늑간신경, 가상초음파 …
┌ 우리 메모 ──────────────────┐ ┌ 비트에 저장된 청구메모  비트에 없음 ┐
│ ◈ICNB Rt 3 level             │ │ 비트에 저장된 청구메모가 없어요.     │
│ ◈PDNB                        │ │ 10/25-11/08 · 420건 · 13:33에 불러옴 │
└──────────────────────────────┘ └──────────────────────────────────────┘
[메모 고치기]
```
열린 줄 — 바뀐 뒤
```
1  11/2 (월) 가상환자A  [새 메모]                                        접기
차트 9001                                   ← 쉼표 처방 줄은 아래 처방내역으로
┌ 우리 메모 ──────────────────┐ ┌ 비트에 저장된 청구메모  비트에 없음 ┐
│ ◈ICNB Rt 3 level             │ │ 비트에 저장된 청구메모가 없어요.     │
│ ◈PDNB                        │ │ 10/25-11/08 · 420건 · 13:33에 불러옴 │
└──────────────────────────────┘ └──────────────────────────────────────┘
┌ 증상 · 차트 원문 8줄 ────────┐ ┌ 처방내역 6줄 · 시술 2 ──────────────────────────────┐
│ 호소  오른쪽 갈비 통증        │ │ 시술 LA248 가상신경차단술-늑간신경 ICNB    ×2   급여  │
│ 호소  3일 전 부딪힘           │ │ 시술 LA357 가상신경차단술-후지 PDNB        ×1   급여  │
│ 검사  Td(+): rib lower        │ │ 약제 A15   가상리도카인주 리도카인         ×0.2 급여  │
│ 진단  xr no def. fx           │ │ 기타 A30   가상관절주                      ×0.4 비급여│
│ 영상  sono: rib 골절 의심     │ │ 기타 AB11  가상위장약정                    ×10  급여  │
│ 시술  ICNB PDNB               │ │ 기타 G2101 Chest / AP                      ×?   급여  │
│ 처치  med                     │ │ ×숫자는 총투여량이에요.                              │
│ 계획  1주 뒤 2차 주사         │ └──────────────────────────────────────────────────────┘
└──────────────────────────────┘
[메모 고치기]
```
- 좁은 화면(휴대폰)에서는 네 칸이 위아래로 쌓인다: 우리 메모 → 비트 메모 → 증상 → 처방내역
- 닫힌 줄은 지금 그대로다(머리의 `차트 N · 처방 …` 줄, 확인 필요 묶음의 우리 메모 칸)
- 닫힌 줄에서 [메모 고치기]를 누르면 그 줄이 함께 열려 위 모양 아래에 고치는 칸이 생긴다

## 구성 요소
- `src/types/precheck.ts`: 두 모양을 더하고 `TargetVisit`에 칸 두 개
  ```ts
  export type ChartLineKind = 'subj' | 'exam' | 'dx' | 'img' | 'proc' | 'rx' | 'plan'
  export type ChartLine = { kind: ChartLineKind | null; text: string }
  export type RxRow = { kind: 'proc' | 'drug' | 'other'; code: string; name: string; short: string; qty: number | null; benefit: boolean }
  export type TargetVisit = VisitMemo & { …지금 칸…; chartLines: readonly ChartLine[]; rxRows: readonly RxRow[] }
  ```
- `src/workers/precheck/jobs.ts`
  - `memoViews(month, tables, input, kinds?)`: 넷째 인자(선택)로 `Map<내원번호, string[]>`를 받으면 `analyzeMonth`가 낸 진료마다 `items.map(i => i.k)`를 넣는다. 반환 모양(`MemoViews`)은 그대로다
  - `currentViews()`가 `viewsCache`와 함께 `kindsCache`를 채우고 같은 때 비운다(설정·자료가 바뀌면 같이 버림)
  - `targetVisits`: `chartLines = visit.lines.map((text, i) => ({ text, kind: 알려진 종류면 kinds[i], 아니면 null }))`, `rxRows = visit.rx`를 `codeInfo(code)?.k`로 시술·약제·기타로 나눠 안정 정렬, `short = codeInfo(code)?.n ?? ''`
- `src/components/claim/rows/MemoRows.tsx`: `Opened` 아래에 `ChartLines`·`RxRows` 두 칸(md 이상 두 열). 이름표 표 `{ subj: '호소', exam: '검사', dx: '진단', img: '영상', proc: '시술', rx: '처치', plan: '계획' }`, 처방 종류 `{ proc: '시술', drug: '약제', other: '기타' }`. `Head`는 `open`이면 처방 쉼표 줄을 그리지 않는다. 새 import 없음(지금 `ds`·`dayLabel`)
- `src/components/claim/memo/MemoPanel.tsx`: `onEdit`가 `setEditing(key)`와 함께 그 줄을 `open`에 더한다(닫지는 않는다)

## 데이터 흐름
비트 83·47 표 → 도우미 → 확장 → `lib/bridge` → Worker(`shape.ts`가 `Visit.lines`·`Visit.rx`로) → 메모 분석(줄 종류) → `targetVisits` → 화면 메시지 → `MemoRows` props. 서버·저장소·도우미로 가는 길은 새로 생기지 않는다(`bareItem`은 칸을 골라 담고, `store.save`는 drafts·done만)

## 결정과 트레이드오프
- **줄 종류는 메모 분석의 것**: 원래 도구와 같은 이름표이고, 메모가 그 줄을 무엇으로 읽었는지 그대로 보여 확인에 맞다. 새 분류기를 만들지 않는다
- **`VisitMemoView`에 칸을 더하지 않음**: 그 모양을 통째로 견주는 시험이 8곳이라 기대값이 바뀐다. 선택 인자로 따로 받는다
- **열린 줄에서만**: 목록이 수백 줄이라 늘 보이면 길어진다. 대신 [메모 고치기]가 줄을 연다
- **처방은 합치지 않음**: 같은 이름 두 줄도 비트 표 그대로 보여야 총투여량을 맞춰 볼 수 있다

## 위험
- 총투여량 칸이 없는 비트 표면 `qty`가 투여량·수량 칸 값이다(도우미 규칙 그대로). 이름은 '총투여량'으로 보인다
- 메모를 만들지 않는 병원(설정 막힘)은 목록이 없어 이 칸도 없다
