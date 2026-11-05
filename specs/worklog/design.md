# 설계: 업무일지

> 기준: `requirements.md`, 시안 `docs/mockups/worklog/index.html`(사용자 승인 v2), `CLAUDE.md`, `docs/ARCHITECTURE.md`, `docs/ADR.md`, `docs/UI_GUIDE.md`, `specs/tab-frame/design.md` '다음 명세가 탭을 채울 때'.
> 표시: **(사용자)** 사용자가 정함 / **(Claude 판단)** 고쳐도 됨

## 1. 한눈에

```
[화면 /worklog] page.tsx(서버) → todayInKorea()
   └ WorklogScreen(클라이언트) ── 날짜 줄·저장 상태(WorklogToolbar) + 엑셀 양식(WorklogSheet)
        ├ 모든 칸(숫자 칸 글자·비고·업무사항·항목 이름) → 화면 밖 자동 저장 제어(worklogSession, 800ms 묶음, 바뀐 칸만, 막힌 칸 뺌) → saveWorklogDay → Supabase worklog_days (RLS, hospital_id = my_hospital_id())
        ├ 여러 PC가 같은 글을 보게: 그 날짜로 돌아올 때·다시 보일 때·보이는 동안 60초마다 다시 읽기 → 저장 안 된 칸·초점 칸을 빼고 반영
        └ 칸 글자 읽기·계산·글자 모양·날짜 이동 → lib/worklog (순수 함수)
```

- 화면은 날짜로 고른 **하루 한 장**이다. 오늘(한국 날짜)로 열리고, 화면을 연 채 자정이 지나면 새 날의 빈 양식으로 바뀐다 **(사용자)**
- 서버에는 값 32칸(숫자 칸 글자 14·비고 5·업무사항 1·항목 이름 12)이 간다. 업무사항도 서버에 저장해 모든 PC·휴대폰이 같은 글을 본다. **저장은 바뀐 칸만** 보낸다 **(사용자)**. 전화·주민번호·메일 모양이 있는 칸은 그 칸만 서버로 가지 않는다 **(Claude 판단)**
- 합계 넷은 저장하지 않고 그릴 때 칸 글자를 읽어 계산한다(ARCHITECTURE '저장은 세기 숫자만') **(Claude 판단)**
- Phase 4: 비트 PC가 연결되면 신환·재진과 수입 칸을 비트 숫자로 저절로 채운다(빈 칸만, 적은 칸은 '다름'으로 알림). 항목 이름이 아니라 칸 위치를 따른다. 매출 갈래의 `revenue.days` 하나를 불러 쓴다 — 20절 **(사용자)**

## 2. 엑셀 원본에서 확인한 것 (사용자 업로드, 서식·계산식만 읽음)

- 시트 26개(10.01~10.31 근무일), 모두 같은 틀. 인쇄 범위 `A1:I23`, A4 세로(`paperSize=9`)
- 계산식: `D6 = SUM(C5,C6)` · `E15 = SUM(E9:I12)` · `E22 = SUM(E17:G21)` · `E23 = E15-E22`
- 서식: 금액 `#,###"원"`(0이면 "원"만), 날짜 `yyyy/mm/dd aaa`
- 열 너비(글자 수): A 11.875 · B~D 8.5 · E 6.625 · F 4.375 · G 9.75 · H 9.5 · I 12.875 → 시안 `colgroup` 14.5·10.6·10.6·10.6·8.4·5.8·12·11.8·15.7%
- 줄 높이(pt): 1행 39.75 · 2행 18 · 3행 33.75 · 4~6행 21 · 7~16행 30 · 17·18행 15 · 19~23행 30 (합 634.5pt)
- 지출의 넷째 줄 이름은 26개 시트 모두 글자 그대로 "free"다(빈 줄이 아니라 고정 이름)
- 합친 칸 46개:

| 자리 | 내용 |
|---|---|
| A1:I1 | 제목 "업  무  일  지"(맑은 고딕 32pt) |
| A2:E3 | 날짜(연보라, 14pt) · F2:F3 "결/재" · G2·H2·I2 "담당·팀장·원장" · G3·H3·I3 빈 도장 칸(연보라) |
| A4:A6 | "환 자 / 현 황" · B4 "외래"(C4·D4 빈칸) · B5 "신 환"/C5 입력/D5 "합  계"(연보라) · B6 "재 진"/C6 입력/D6 자동(연보라) |
| E4:F6 · G4:I6 | "업무사항" · 업무사항 칸(11pt) |
| A7:A15 | "수   입" · B7:D7~B14:D14 이름 8개 + E7:I7~E14:I14 입력 · B15:D15 "수납액"/E15:I15 자동(둘 다 연보라). 7·8행(총진료비·조합청구액)은 회색 |
| A16:A22 | "지 출" · B16:D16 "항목" · E16:G16 "금액" · H16:I16 "비고" |
| B17:D18 · E17:G18 · H17:I18 | 현금(두 줄 높이) · 금액 · 비고(10pt) |
| B19:D19 … B21:D21 | 카드 · 환불 · free (금액 E:G, 비고 H:I) |
| B22:D22 · E22:G22 · H22:I22 | "총 지 불 액"(회색) · 자동(회색) · 비고(회색) |
| A23:D23 · E23:I23 | "합   계" · 자동(연보라), 아래 굵은 선 |

## 3. 목업과 다른 점 (2026-11-01 사용자 결정 반영)

| 시안 v2 | 실제 화면 |
|---|---|
| 아래 엑셀 시트 탭 줄(10.01 …) | **없다**. 날짜 줄(전날·날짜 고르기·다음 날·오늘로)로 고른다 **(사용자)** |
| 위 [달 고르기] | 날짜 고르기 칸(`<input type="date">`, 최대 = 오늘)으로 바꾼다 **(Claude 판단)** |
| [저장] 단추 + "저장했어요" 알림 | **자동 저장**. [저장] 단추가 없고 [인쇄] 옆에 저장 상태 글이 있다 **(사용자)** |
| [인쇄] → 목업 안 미리보기 창 | 브라우저 인쇄(`window.print()`)를 바로 연다. 미리보기는 브라우저 인쇄 창이 보여 준다 **(Claude 판단)** |
| 업무사항 흐린 안내 "환자 이름·차트번호는 적지 않아요" | 시안 글자 그대로 **(사용자, 2026-11-01)** |
| 숫자 칸에 숫자만 들어감, 치는 동안 쉼표를 다시 넣음 | **글자 칸**: 글자도 친다 **(사용자)**. 치는 동안은 친 글자 그대로이고(글자를 섞어 치고 커서가 튀지 않게), 초점이 나가면 숫자만인 칸은 엑셀 모양(7절). 시안에 없는 모양 → 아래 시안 OK |
| 수입·지출 항목 이름은 고정 글자 | **항목 이름 고치기**: 이름 칸이 입력 칸이다. 그날에만 남고 다음 날은 기본 이름 **(사용자)**. 시안에 없는 모양 → 아래 시안 OK |
| (없음) | **"합계에서 빠졌어요" 표시**: 합계에 들어가는 칸이 합계 제외로 읽힐 때 칸 안 작은 글자. 화면에만, 인쇄에는 없다 **(사용자)**. 시안에 없는 모양 → 아래 시안 OK |
| (없음) | **빨간 막힌 칸**: 개인정보 모양이 있는 칸(모든 입력 칸)은 빨간 테두리·옅은 빨강 바탕(`--negative`·`--negative-soft`). 시안에 없는 모양 → 아래 시안 OK |
| 목업의 옛 탭 줄·위쪽 띠 | 지금 앱 틀(`AppShell`, 탭 13개)을 그대로 쓴다 |
| 폰 화면에서도 칸을 고칠 수 있음 | 폰(터치 기기)은 같은 양식을 화면 폭에 맞춰 **보기만** 한다(`plan.md` §1) **(사용자 답 2026-11-01)**. 좁은 PC 창은 그대로 고칠 수 있다 |
| 칸 초점 테두리 초록 `#107C41` | 그대로(`--xl-focus` 토큰) |
| 목업 숫자(지어낸 예시) | 실제 화면은 서버 값만. 없는 날은 빈 양식 |

- **시안 승인됨(2026-11-01 사용자 "좋아")**: 글자 칸·항목 이름 고치기·"합계에서 빠졌어요"·빨간 막힌 칸의 시안 `docs/mockups/worklog/text-cells.html`(claude.ai artifact `Q2qMenScT5hojDRoqsLcjw`). 사용자 지시: 글씨는 원본과 똑같이(양식 칸 글꼴·굵기·크기는 시안 v2 그대로, 실제 화면은 굴림·맑은 고딕). 시안에서 정해진 모양: 칸보다 긴 글자는 한 줄에 끝 "…"(줄 높이 유지, 눌러서 밀어 보기, 마우스 올리면 전체, 인쇄에도 "…"), 표시는 수입 칸 오른쪽 끝·지출 금액 칸 글자 아래·좁은 신환·재진 칸은 "빠졌어요"만, 막힌 칸이 있을 때 저장 상태 글은 저장 시각이 있으면 "빨간 칸 빼고 저장했어요 · 14:05", 없으면 "빨간 칸은 저장하지 않았어요". 흐린 안내 글은 시안 v2와 같아 OK가 따로 필요 없지만 같은 시안에 함께 보인다

## 4. 파일과 구성 요소

| 파일 | 하는 일 | TASK |
|---|---|---|
| `src/types/worklog.ts` | 칸 열쇠·DB 칸 이름 표·기본 항목 이름·하루 값 모양·합계 모양 | 2 |
| `src/lib/worklog/calc.ts` | 읽은 숫자로 합계 넷, 숫자 → 칸 글자 모양 | 2 |
| `src/lib/worklog/days.ts` | 날짜 이동·자정 넘김·날짜 칸 글자·저장 시각 글자 | 2 |
| `src/lib/worklog/notes.ts` | 업무일지 칸 개인정보 모양 검사(모든 입력 칸) | 2 |
| `src/lib/worklog/cellText.ts` | 칸 글자 읽기: 글자 → 숫자·없음·합계 제외, 화면 글자, 저장할 글자 | 3 |
| `supabase/migrations/20261101000100_worklog.sql` | 표 `worklog_days`·RLS·권한·공용 함수(`my_hospital_id`) | 4 |
| `src/lib/storage/worklogDays.ts` | 하루 읽기·저장(Supabase), 오류 종류 나누기 | 5 |
| `src/lib/worklog/autosave.ts` | 자동 저장 제어(묶기·바뀐 칸 계산·다시 시도·끊김·막힌 칸·상태·서버 값 반영) | 6 |
| `src/app/globals.css` · 규칙 시험 셋 | 엑셀 색 토큰 넷, 굵기·CSS Module 예외 | 7 |
| `src/components/worklog/WorklogSheet.tsx` · `sheet.module.css` | 엑셀 양식 표(그리기만, 값은 props) | 8 |
| `src/components/worklog/WorklogToolbar.tsx` | 날짜 줄·저장 상태·오류 카드·[인쇄] | 9 |
| `src/components/worklog/WorklogScreen.tsx` | 화면 조립: 읽기·다시 읽기·자동 저장·자정·폰·떠나기 확인 | 10 |
| `src/components/worklog/useWorklogDay.ts` | WorklogScreen의 날짜별 값·읽기 상태(화면에서 뗀 훅) | 10 |
| `src/components/worklog/worklogSession.ts` | 화면 밖(모듈 하나)에 사는 자동 저장 제어·떠나기 확인·로그아웃 정리 | 10 |
| `sheet.module.css` 인쇄 부분 · `AppShell.tsx` | 인쇄 CSS, 앱 틀 인쇄 숨김 | 11 |
| `src/app/(app)/worklog/page.tsx` + 탭 목록 셋 | 진짜 화면 연결 | 12 |
| `e2e/worklog.spec.ts` | 실제 Supabase 확인 | 13 |

- `lib/worklog`는 환자 자료 구역이 아니다(업무사항은 사용자가 손으로 적는 글이고 비트 파일이 아니다). 그래도 `calc`·`cellText`·`days`·`notes`·`autosave`는 순수 TS로 두고 React·supabase를 쓰지 않는다 **(Claude 판단)**
- `lib/storage/`는 ARCHITECTURE의 '(예정) 검사한 달·일 숫자만 저장' 자리다. 사전점검도 이 폴더에 새 파일을 만든다(파일은 겹치지 않는다)

## 5. 자료 모양 (`src/types/worklog.ts`)

| 열쇠 | 칸 이름(`aria-label`, 시안 그대로) | 엑셀 | DB 칸 | 종류 |
|---|---|---|---|---|
| `newPatients` | 신환 | C5 | `new_patients` | 숫자 칸(인원) |
| `returnPatients` | 재진 | C6 | `return_patients` | 숫자 칸(인원) |
| `totalFee` | 총진료비 | E7 | `total_fee` | 숫자 칸(금액) |
| `claimAmount` | 조합청구액 | E8 | `claim_amount` | 숫자 칸(금액) |
| `cashIn` | 현금수납 | E9 | `cash_in` | 숫자 칸(금액) |
| `cardIn` | 카드수납 | E10 | `card_in` | 숫자 칸(금액) |
| `transferIn` | 계좌이체 | E11 | `transfer_in` | 숫자 칸(금액) |
| `localCurrencyIn` | 지역화폐 | E12 | `local_currency_in` | 숫자 칸(금액) |
| `unpaidNew` | 미수발생 | E13 | `unpaid_new` | 숫자 칸(금액) |
| `unpaidPaid` | 미수입금 | E14 | `unpaid_paid` | 숫자 칸(금액) |
| `spendCash` | 지출 현금 금액 | E17 | `spend_cash` | 숫자 칸(금액) |
| `spendCard` | 지출 카드 금액 | E19 | `spend_card` | 숫자 칸(금액) |
| `spendRefund` | 환불 금액 | E20 | `spend_refund` | 숫자 칸(금액) |
| `spendFree` | 지출 free 금액 | E21 | `spend_free` | 숫자 칸(금액) |
| `noteCash` | 지출 현금 비고 | H17 | `note_cash` | 비고 |
| `noteCard` | 지출 카드 비고 | H19 | `note_card` | 비고 |
| `noteRefund` | 환불 비고 | H20 | `note_refund` | 비고 |
| `noteFree` | 지출 free 비고 | H21 | `note_free` | 비고 |
| `noteTotal` | 총 지불액 비고 | H22 | `note_total` | 비고 |
| `memo` | 업무사항 | G4 | `memo` | 업무사항 |

항목 이름 12칸(금액 칸마다 하나, 수입 8 + 지출 4). 칸 이름은 `<기본 이름> 항목 이름`이다. 같은 줄의 금액 칸 `aria-label`은 이름을 고쳐도 그대로다(시험·E2E가 칸 위치로 찾고, 칸 위치가 비트 채우기의 기준이다).

| 열쇠 | 기본 이름(엑셀) | 엑셀 | DB 칸 | 금액 칸 |
|---|---|---|---|---|
| `nameTotalFee` | 총진료비 | B7 | `name_total_fee` | `totalFee` |
| `nameClaimAmount` | 조합청구액 | B8 | `name_claim_amount` | `claimAmount` |
| `nameCashIn` | 현금수납 | B9 | `name_cash_in` | `cashIn` |
| `nameCardIn` | 카드수납 | B10 | `name_card_in` | `cardIn` |
| `nameTransferIn` | 계좌이체 | B11 | `name_transfer_in` | `transferIn` |
| `nameLocalCurrencyIn` | 지역화폐 | B12 | `name_local_currency_in` | `localCurrencyIn` |
| `nameUnpaidNew` | 미수발생 | B13 | `name_unpaid_new` | `unpaidNew` |
| `nameUnpaidPaid` | 미수입금 | B14 | `name_unpaid_paid` | `unpaidPaid` |
| `nameSpendCash` | 현금 | B17 | `name_spend_cash` | `spendCash` |
| `nameSpendCard` | 카드 | B19 | `name_spend_card` | `spendCard` |
| `nameSpendRefund` | 환불 | B20 | `name_spend_refund` | `spendRefund` |
| `nameSpendFree` | free | B21 | `name_spend_free` | `spendFree` |

- 항목 이름을 칸마다 따로 두는 까닭: jsonb 한 칸이면 두 PC가 다른 이름을 고칠 때 한쪽이 사라져 '다른 칸은 둘 다 남는다'(사용자 결정 4)가 깨진다

```ts
export type WorklogCountKey = 'newPatients' | 'returnPatients'
export type WorklogWonKey = 'totalFee' | 'claimAmount' | 'cashIn' | 'cardIn' | 'transferIn' | 'localCurrencyIn'
  | 'unpaidNew' | 'unpaidPaid' | 'spendCash' | 'spendCard' | 'spendRefund' | 'spendFree'
export type WorklogNumberKey = WorklogCountKey | WorklogWonKey
export type WorklogNoteKey = 'noteCash' | 'noteCard' | 'noteRefund' | 'noteFree' | 'noteTotal'
export type WorklogNameKey = 'nameTotalFee' | 'nameClaimAmount' | 'nameCashIn' | 'nameCardIn' | 'nameTransferIn' | 'nameLocalCurrencyIn'
  | 'nameUnpaidNew' | 'nameUnpaidPaid' | 'nameSpendCash' | 'nameSpendCard' | 'nameSpendRefund' | 'nameSpendFree'
export type WorklogCellKey = WorklogNumberKey | WorklogNoteKey | WorklogNameKey | 'memo'
/** 서버에 저장하는 하루 값. 모든 칸이 글자이고 빈 칸은 ''(서버에서는 null). 항목 이름이 ''이면 기본 이름 */
export type WorklogDay = Record<WorklogCellKey, string>
/** 저장에 넘기는 바뀐 칸만 */
export type WorklogChanges = Partial<WorklogDay>
/** 칸 글자에서 읽은 숫자(합계 계산의 입력). 숫자로 읽히지 않은 칸은 null */
export type WorklogNumbers = Record<WorklogNumberKey, number | null>
export type WorklogTotals = { visits: number; received: number; spent: number; net: number }
export const WORKLOG_COUNT_KEYS: readonly WorklogCountKey[]
export const WORKLOG_WON_KEYS: readonly WorklogWonKey[]
export const WORKLOG_NOTE_KEYS: readonly WorklogNoteKey[]
export const WORKLOG_NAME_KEYS: readonly WorklogNameKey[]
export const WORKLOG_CELL_KEYS: readonly WorklogCellKey[]                          // 32칸, 엑셀 줄 순서
export const WORKLOG_SUM_KEYS: readonly WorklogNumberKey[]                         // 실제로 합계에 들어가는 열 칸(AC-003.13)
export const WORKLOG_COLUMNS: Readonly<Record<WorklogCellKey, string>>             // 위 표의 DB 칸
export const WORKLOG_LABELS: Readonly<Record<WorklogCellKey, string>>              // 위 표의 칸 이름
export const WORKLOG_NAME_OF: Readonly<Record<WorklogWonKey, WorklogNameKey>>      // 금액 칸 → 항목 이름 칸
export const WORKLOG_DEFAULT_NAMES: Readonly<Record<WorklogNameKey, string>>       // 위 표의 기본 이름
export const CELL_MAX = 50     // 숫자 칸 글자
export const NAME_MAX = 20     // 항목 이름
export const NOTE_MAX = 100
export const MEMO_MAX = 2000
export function emptyWorklogDay(): WorklogDay   // 모든 칸 ''
```
- 값이 없음 = 빈 글자(서버 `null`, 엑셀 빈칸). 0을 치면 "0"으로 저장하고 입력 칸에는 빈 글자로 보인다(시안·엑셀 `#,###"원"`과 같다)
- 숫자 칸은 친 글자를 앞뒤 공백만 지워 그대로 저장한다(50자까지) **(사용자 결정에서 나온 Claude 판단)**. 음수·소수·큰 숫자도 글자로는 저장되지만 합계에는 들어가지 않는다(7절). 금액 정수 규칙(`plan.md` §5)의 업무일지 예외이고 **합계는 그대로 원 단위 정수다**

## 6. 순수 함수

```ts
// calc.ts — 읽은 숫자로 합계만 낸다. 글자를 읽는 일은 cellText.ts(7절)
export function worklogTotals(numbers: WorklogNumbers): WorklogTotals  // AC-002.1~002.4
export function wonInputText(n: number | null, focused: boolean): string  // ''|'1,234,500원'|'1,234,500'
export function wonAutoText(n: number): string                 // '원'|'1,234,500원'|'-12,000원'
export function countText(n: number | null): string            // ''|'86'
export function visitsText(n: number): string                  // 환자 합계 칸, 0도 '0'
// days.ts (날짜 계산은 lib/analytics/dates.ts의 addDays·compareYmd·isYmd·weekdayOf만 쓴다)
export function previousDay(ymd: string): string
export function nextDay(ymd: string, today: string): string | null
export function clampToToday(input: string, today: string): string
export function dayAfterRollover(selected: string, oldToday: string, newToday: string): string
export function sheetDateText(ymd: string): string             // '2026/10/28 수'
export function savedTimeText(at: Date): string                // '14:05' (Asia/Seoul, h23)
// notes.ts
export function privacyProblem(text: string): boolean          // AC-002.10
export function blockedCellKeys(cells: WorklogChanges): WorklogCellKey[]   // 값이 개인정보 모양인 칸(모든 입력 칸)
```
- 쉼표는 `ko-KR` 천 단위(`1,234,500`). 합계는 정수만 다룬다(나눗셈이 없어 버림 규칙이 필요 없다)
- `privacyProblem`은 검사 전에 글자를 맞춘다: 줄표(`－`·`—`·`–`·`―`·`‐`·`‑`·`−`·`ㅡ`)를 `-`로 바꾼 뒤 두 가지로 맞춰 **둘 중 하나라도 모양이 맞으면 막는다**: ① `normalize('NFKC')`만 한 글자(`⓪①⓪-…`처럼 번호 글자로만 적은 전화도 잡는다), ② `①`·`²` 같은 딸린 숫자(`\p{No}`)를 빈칸으로 바꾸고 `normalize('NFKC')`한 글자(`①010-0000-1234`에서 `①`이 옆 번호에 붙는 숫자가 되어 통과하지 않게). NFKC로 전각 숫자·기호를 보통 글자로 바꾼다(NFKC가 `ㅡ`를 다른 글자로 바꾸므로 줄표를 먼저 맞춘다). 저장하는 글자는 바꾸지 않고 검사에만 쓴다
- `privacyProblem`의 모양은 `lib/payload/validate.ts`의 전화·주민번호·메일 정규식을 옮기고 **업무일지에 한해 넓힌다**. 그 파일은 환자 자료 구역이고 상수를 내보내지 않아 불러오지 않으며 고치지도 않는다(그 파일은 처방코드 같은 숫자를 잘못 거르지 않아야 한다) **(Claude 판단)**
```ts
const PHONE = /(?<!\d)(?:\+82[-. ]?\(?0?\d{1,2}\)?|\(?0\d{1,2}\)|0\d{1,2}) *[-.]? *\d{3,4} *[-.]? *\d{4}(?!\d)/
const NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01]) *[-. ] *\d{7}(?!\d)/
const JOINED_NATIONAL_ID = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[1-8]\d{6}(?!\d)/
const MAIL = /[^\s@]+@[^\s@]+\.[^\s@]+/
```
- 0으로 시작하고 9~11자리인 붙여 쓴 숫자는 전화로 본다(`0200001234`). 금액은 0으로 시작하지 않아 부딪히지 않는다. 13자리 붙여 쓴 주민번호는 금액 한도(12자리)를 넘으므로 금액과 부딪히지 않는다

## 7. 칸 글자 읽기 (`src/lib/worklog/cellText.ts`, TASK-3)

```ts
export type CellKind = 'count' | 'won'
export type CellRead = { kind: 'number'; value: number } | { kind: 'none' } | { kind: 'excluded' }
export function cellKindOf(key: WorklogNumberKey): CellKind
export function readCell(kind: CellKind, text: string): CellRead              // AC-003.6~003.11
export function readDayNumbers(day: WorklogDay): WorklogNumbers               // AC-003.12, worklogTotals의 입력
export function excludedSumKeys(day: WorklogDay): WorklogNumberKey[]          // AC-003.13
export function cellShownText(kind: CellKind, text: string, focused: boolean): string   // AC-003.14
export function cellSaveText(key: WorklogCellKey, text: string): string       // AC-003.15, 빈 글자 = 서버 null
```
의존 방향: `cellText` → `calc`(글자 모양)·`notes`(모양 검사). `calc`는 `cellText`를 부르지 않는다(읽은 숫자만 받는다).

**읽는 순서**(`readCell`, 원칙: 짐작하지 않는다 **(사용자)**)
1. 앞뒤 공백을 지운다. 빈 글자면 `none`
2. `privacyProblem`이면 `excluded`(저장되지 않을 값이 합계에 들어가지 않게)
3. 글자에 전각 숫자(`０`~`９`)가 있으면 → `excluded`(`\d`가 전각을 못 잡으니 덩이를 찾기 전에 본다). 숫자 덩이를 찾는다: `/\d[\d,]*/g`(쉼표는 한 숫자에 속한다). 없으면 `none`, 둘 이상이면 `excluded`
4. 쉼표가 있는 덩이가 3자리 묶음(`^\d{1,3}(,\d{3})+$`)이 아니면 → `excluded`('120,00'·'3,4건'·'10,000,20,000'·끝에 쉼표가 붙은 '12,000,'·'12,만원'). 덩이 앞(공백 건너)이 `.`이면 소수 → `excluded`. `-`·`−`·`–`·`—`·`―`·`‐`·`‑`·`ㅡ`·`－`·`△`·`▲`·`▼`·`(`·`（`이면 빼기 표시 → `excluded`. 빼기 표시와 덩이 사이의 원 표시 하나(`₩`·`￦`·`\`, 앞뒤 공백 포함)는 건너 본다('-₩5,000'·'(₩5,000)')
5. 덩이 뒤(공백 건너)가 `십`·`백`·`천`·`만`·`억`·`조`면 → `excluded`
6. 쉼표와 앞의 0을 지운 자릿수가 인원 5자리·금액 12자리를 넘으면 → `excluded`(앞자리만 잘라 읽지 않는다)
7. 그 숫자가 `{ kind: 'number', value }`다. 끝에 붙은 붙임표·마침표·글자는 상관없다

| 친 글자 | 읽기 | 합계 | "합계에서 빠졌어요" |
|---|---|---|---|
| `12000` · `12,000원` · `12,000 원` · `00012` | 숫자 | 더함 | 없음 |
| `12,000 별도` · `12,000-` · `3건` | 숫자(하나) | 그 숫자를 더함(사용자 규칙) | 없음 |
| `별도 보고` · (빈 칸) | 없음 | 안 더함 | 없음 |
| `2건 12,000` · `12 000` · `10/28` | 합계 제외(둘 이상) | 안 더함 | 있음 |
| `12.5` · `.5` · `-5,000` · `- 5,000` · `△5,000` · `(5,000)` · `ㅡ5,000` · `-₩5,000` · `(₩5,000)` · `１２,０００` · `120,00` · `3,4건` · `12,000,` | 합계 제외 | 안 더함 | 있음 |
| `12만원` · `12 만원` · `3십만원` · `3백원` · `3천` · `1억` · `1조` | 합계 제외 | 안 더함 | 있음 |
| 금액 13자리·인원 6자리 숫자 | 합계 제외 | 안 더함 | 있음 |
| `010-0000-1234`(막는 모양) | 합계 제외 | 안 더함 | 있음(+ 빨강, 저장 안 됨) |

- **표시 칸**(`excludedSumKeys`): `WORKLOG_SUM_KEYS` 열 칸(신환·재진, 현금수납·카드수납·계좌이체·지역화폐, 지출 금액 넷) 가운데 `excluded`인 칸만이다. 총진료비·조합청구액·미수발생·미수입금은 어차피 더하지 않으므로 표시하지 않는다. 업무사항·비고·항목 이름은 읽지 않는다
- **화면 글자**(`cellShownText`): 글자가 `/^\d[\d,]*\s*원?$/`(숫자만, 쉼표·"원" 허용)이고 `readCell`이 `number`면 기존 엑셀 모양(금액 `wonInputText`, 인원 `countText`, 0이면 빈 글자)이고, 그 밖(글이 섞임·합계 제외·막는 모양)은 친 글자 그대로다. 막는 모양인 숫자가 쉼표 붙은 금액으로 보이지 않는다
- **저장할 글자**(`cellSaveText`): 숫자 칸·항목 이름은 앞뒤 공백을 지운다(칠 때 끝 공백을 없애면 '12,000 별도'를 칠 수 없으므로 화면 값에는 그대로 두고 저장·비교 때만 지운다). 항목 이름이 기본 이름과 같으면 빈 글자다. 비고·업무사항은 그대로다

## 8. DB 표 (`supabase/migrations/20261101000100_worklog.sql`, TASK-4)

```sql
-- 공용 함수: 갈래마다 글자 그대로 같다(cross-branch C1, precheck design.md 8-1과 같은 본문). 어느 갈래가 먼저 들어가도 된다
create or replace function public.my_hospital_id() returns uuid language sql stable security definer set search_path = ''
  as $$ select h.id from public.hospitals h where h.owner_id = (select auth.uid()) and h.status = 'approved' $$;
revoke execute on function public.my_hospital_id() from public, anon;
grant execute on function public.my_hospital_id() to authenticated;

create table public.worklog_days (
  hospital_id uuid not null default public.my_hospital_id() references public.hospitals (id) on delete cascade,
  work_date date not null,
  new_patients text check (char_length(new_patients) between 1 and 50),
  -- return_patients · total_fee · claim_amount · cash_in · card_in · transfer_in · local_currency_in · unpaid_new · unpaid_paid
  -- spend_cash · spend_card · spend_refund · spend_free : 모두 같은 text 제약(숫자 칸 14)
  note_cash text check (char_length(note_cash) between 1 and 100),
  -- note_card · note_refund · note_free · note_total : 같은 text 제약
  memo text check (char_length(memo) between 1 and 2000),
  name_total_fee text check (char_length(name_total_fee) between 1 and 20),
  -- name_claim_amount · name_cash_in · name_card_in · name_transfer_in · name_local_currency_in · name_unpaid_new · name_unpaid_paid
  -- name_spend_cash · name_spend_card · name_spend_refund · name_spend_free : 같은 text 제약(항목 이름 12)
  primary key (hospital_id, work_date)
);
alter table public.worklog_days enable row level security;
revoke all on table public.worklog_days from anon, authenticated;
grant select on table public.worklog_days to authenticated;
grant insert (work_date, <값 32칸>) on table public.worklog_days to authenticated;
grant update (work_date, <값 32칸>) on table public.worklog_days to authenticated;
-- 정책 셋(select · insert with check · update using + with check), 모두 hospital_id = (select public.my_hospital_id())
```
- **숫자 칸은 글자 칸이다**(사용자 결정 2). 음수·한도 숫자 제약은 없어지고 글자 길이만 본다. 합계는 DB가 아니라 화면이 낸다
- **병원 id는 DB 기본값 `my_hospital_id()`로만 채워진다**(cross-branch C1). 브라우저는 `hospital_id`를 보내지 않고 그 칸에는 넣기·고치기 권한이 없다. 승인 안 된 병원은 `my_hospital_id()`가 null이라 아무 줄도 못 보고 못 넣는다
- upsert(`insert … on conflict (hospital_id, work_date) do update`)는 **보낸 칸만** `update set`에 쓴다(PostgREST). 그래서 바뀐 칸만 보내면 다른 PC가 고친 칸이 남는다(사용자 결정 4, AC-004.9). `work_date`는 늘 보내므로 update 권한을 준다(같은 병원 안 날짜 옮기기는 앱이 하지 않는다). 충돌 판정은 기본값으로 채운 `hospital_id`로 한다
- 지우기 권한은 없다(화면에 지우기가 없다. 빈 칸으로 저장하면 된다). 저장 시각 칸·방아쇠는 두지 않는다(사용자 결정 5: 고친 사람·시각을 남기지 않는다. 쓰는 곳도 없다)
- 개인정보 모양 검사는 브라우저에서 한다(9·10절). DB 제약으로 두지 않는다: 정규식을 SQL로 다시 쓰면 두 벌이 어긋나고, 서버 코드는 두지 않는다(ADR-004)
- 시험: `supabase/worklog.rls.test.ts`(PGlite, `supabase/rls.test.ts`와 같은 Supabase 흉내 + auth migration을 먼저 실행). 공용 함수 `my_hospital_id()`가 **이미 있을 때**(다른 갈래가 먼저 들어감)도 이 migration이 실패하지 않는지 한 번 더 돈다
- **실제 Supabase에 붙여 넣는 것은 사용자 OK가 필요하다.** TASK-4는 파일과 시험만 만든다. 운영자(사용자)가 SQL 편집기에 붙여 넣는 때는 Phase 2를 마친 뒤 화면을 실제로 볼 때다. Claude가 직접 실행하지 않는다
- 2026-11-01 고침: 이 파일은 아직 실제 Supabase에 붙이지 않았으므로 같은 파일을 고친다(새 migration을 더하지 않는다)

## 9. 하루 읽기·저장 (`src/lib/storage/worklogDays.ts`)

```ts
export type WorklogErrorKind = 'offline' | 'failed'
export class WorklogStorageError extends Error {
  readonly kind: WorklogErrorKind
}
type Client = Pick<SupabaseClient, 'from'>
export async function loadWorklogDay(client: Client, ymd: string): Promise<WorklogDay | null>
export async function saveWorklogDay(client: Client, ymd: string, changes: WorklogChanges): Promise<void>
```
- 읽기: `from('worklog_days').select(<값 32칸>).eq('work_date', ymd).maybeSingle()`(내 병원 줄만 보이는 것은 RLS가 한다) → 화면 모양. null 칸은 `''`
- **저장은 바뀐 칸만 받는다**(사용자 결정 4). 줄 전체 upsert를 대체한다. 순서: ① 받은 값에서 `WORKLOG_CELL_KEYS` 안의 열쇠만 고른다(다른 열쇠가 섞여도 안 간다) ② `blockedCellKeys`에 걸린 칸을 뺀다(자동 저장이 이미 빼고 주지만 서버로 가는 마지막 문에서 한 번 더 막는다) ③ 남은 칸이 없으면 네트워크 없이 끝 ④ 오프라인이면 `offline` ⑤ `upsert(row, { onConflict: 'hospital_id,work_date' })`. `row`는 `work_date` + 남은 칸뿐이고 `hospital_id`는 보내지 않는다. 값은 `cellSaveText`이고 빈 글자는 `null`이다
- 긴 글자를 자르지 않는다(화면 `maxLength`가 먼저 막는다. 넘어 오면 DB 제약이 거부 → `failed`, 몰래 잘라 저장하지 않으려고)
- 오류 종류: `navigator.onLine === false`면 부르기 전에 `offline`. 응답 `status === 0`(postgrest-js가 연결 실패를 이렇게 돌려준다)이면 `offline`. 그 밖의 `error`는 `failed`. 오류 객체에 Supabase `message`·`details`를 넣지 않는다(CLAUDE.md '오류 내용은 화면에 그대로 보이지 않는다')
- `worklog_days`는 AI 경로가 읽지 않는다(업무사항은 AI로 보내지 않는다, AC-005.5)

## 10. 자동 저장 (`src/lib/worklog/autosave.ts`)

```ts
/** 날짜 하나의 상태. pending = 800ms 기다리는 중 */
export type DaySaveState = 'idle' | 'pending' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
/** 바깥에 보이는 전체 상태. pending은 saving으로 보인다 */
export type SaveState = 'idle' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked'
export type AutosaveSnapshot = {
  state: SaveState
  savedAt: Date | null
  blocked: { ymd: string; fields: readonly WorklogCellKey[] } | null   // 막힌 칸이 있는 가장 이른 날
}
export type AutosaveOptions = {
  save: (ymd: string, changes: WorklogChanges) => Promise<void>   // WorklogStorageError를 던진다
  delayMs?: number                 // 800
  retryDelaysMs?: readonly number[] // [2000, 5000, 15000]
  offlineRetryMs?: number          // 15000
  now?: () => Date
  timers?: { setTimeout: typeof setTimeout; clearTimeout: typeof clearTimeout }
  onChange?: (snapshot: AutosaveSnapshot) => void
}
export function createAutosave(options: AutosaveOptions): {
  change(ymd: string, day: WorklogDay): void
  serverDay(ymd: string, server: WorklogDay | null, focusKey?: WorklogCellKey | null): WorklogDay  // 읽은 값 반영(AC-006.12). Phase 4에서 돌려주는 모양이 바뀐다(20-4절)
  revision(ymd: string): number                // 그 날 저장이 시작·끝날 때마다 는다(AC-006.13)
  flush(): void
  retry(): void
  online(): void
  hasUnsaved(): boolean
  snapshot(): AutosaveSnapshot
  subscribe(listener: (snapshot: AutosaveSnapshot) => void): () => void
  pendingDay(ymd: string): WorklogDay | null   // 아직 저장 안 된 최신 값(AC-006.10). Phase 4에서 모양이 바뀐다(20-4절)
  dispose(): void                             // 로그아웃 때만
}
```
- 제어는 **화면 밖 모듈 하나**(`components/worklog/worklogSession.ts`)가 한 벌만 만든다. 화면이 내려가도(앱 안 다른 탭) 저장·다시 하기가 이어지고, 돌아오면 저장 안 된 값을 다시 보인다(AC-010.11)
- **바뀐 칸만 보낸다**(사용자 결정 4). 날짜마다 `known`(서버에 있다고 아는 값)과 `latest`(최신 값)를 들고, 저장 때 칸마다 `cellSaveText`로 견줘 다른 칸만 `save`에 넘긴다. 처음 읽기 전이면 `known`은 빈 하루다
  - 되돌려 같아진 칸은 차이가 아니라 안 보낸다(AC-006.11). 저장 중 또 바뀌면 끝난 뒤 남은 차이만, 재시도도 그때의 차이만 보낸다
  - 저장 성공 → 보낸 칸의 `known`을 보낸 값으로 바꾼다. 실패면 `known`이 그대로라 다음에 같은 차이가 다시 계산된다(upsert 한 번은 전부 되거나 전부 안 된다)
  - 차이 가운데 `blockedCellKeys`에 걸린 칸은 빼고 보낸다. 남은 칸이 없으면 `save`를 부르지 않는다(AC-006.6)
- **`serverDay`**: 처음 읽은 날은 `known = latest = 서버 값`. 그 뒤로는 칸마다 저장 안 된 칸(`latest`와 `known`이 다름, 막힌 칸 포함)이나 `focusKey` 칸이면 그대로 두고(`known`도 그대로), 나머지는 `known = latest = 서버 값`이다. `focusKey` 칸의 `known`을 올리면 그 칸의 옛 화면 값이 차이가 되어 다른 PC 값을 덮게 되므로 올리지 않는다. 서버 줄이 없으면(null) 빈 하루로 본다

| 날짜 하나의 상태 | 들어옴 | 다음 |
|---|---|---|
| idle·saved·failed·offline·blocked | `change` | pending(800ms 타이머, 그 사이 `change`는 값만 바꾸고 타이머를 다시 건다) |
| pending | 타이머 끝·`flush` | 보낼 칸이 있으면 saving. 없고 막힌 칸이 있으면 blocked. 둘 다 없으면 저장 전 상태(saved·idle) |
| saving | 성공 | 남은 차이(막힌 칸 뺌)가 있으면 saving 다시, 없고 막힌 칸이 있으면 blocked, 아니면 saved(`savedAt = now()`) |
| saving | `failed` | 2초 → 5초 → 15초 뒤 다시(그 사이 `change`면 그 값의 차이로). 세 번 다 실패하면 failed(타이머 없음) |
| saving | `offline` | offline. 15초마다 다시, `online()`이면 바로 |
| blocked | 시간 | 아무 일도 없다. 다음 `change`가 칸을 다시 본다 |
| failed | `retry()` | 바로 saving |

- 바깥에 보이는 `snapshot().state`는 날짜 전부 중 가장 나쁜 것: failed > offline > saving(pending 포함) > blocked > saved > idle(남은 저장이 있는데 "저장했어요"로 보이지 않게). 막힌 칸 오류 안내는 전체 상태가 아니라 막힌 칸 목록으로 띄우므로 다른 날이 저장 중이거나 끊겨도 계속 보인다. `savedAt`은 가장 최근 성공 시각
- `hasUnsaved()`: pending·saving·offline·failed·blocked인 날짜가 하나라도 있으면 참
- `dispose()`: 타이머를 멈추고 날짜 상태(`known`·`latest` 포함)를 모두 비운다(공용 PC에 값을 남기지 않는다). `pendingDay`는 null, `hasUnsaved()`는 거짓이 된다. 저장 중에 불렀으면 그 응답은 버리고 타이머·상태를 되살리지 않는다
- 화면 값은 늘 화면(React 상태)에 있다. 저장이 실패해도 화면 값은 그대로다(`plan.md` §8 '값을 화면에 두고 [다시 저장]')
- 브라우저 저장소에 임시 사본을 두지 않는다(`plan.md` §10 '입력값 임시 저장'은 2차). 대신 저장 안 된 값이 있으면 떠나기 확인을 묻는다 **(Claude 판단)**

## 11. 화면

### 11-1. `WorklogSheet` (그리기만)
```ts
type Props = {
  ymd: string
  day: WorklogDay
  readOnly: boolean
  blockedCells: readonly WorklogCellKey[]    // 개인정보 모양으로 막힌 칸(빨강, aria-invalid)
  onCell(key: WorklogCellKey, value: string): void   // 모든 입력 칸. 친 글자 그대로
  onFocusCell(key: WorklogCellKey | null): void      // 초점 칸(다시 읽기가 건너뛴다)
}
```
- 시안의 `<table class="sheet">`를 칸·글자·`aria-label`·합친 칸까지 그대로 옮긴다(2절 표). 클래스는 `sheet.module.css`의 이름(`sheet`·`lav`·`gray`·`date`·`small`·`memo`·`title`·`in`·`L`·`R`·`B`·`r1`·`r2`·`r3`·`r28`·`r20`, 더해서 `blocked`·`flag`)
- **숫자 칸**: `maxLength={CELL_MAX}`. `inputMode="numeric"`을 쓰지 않는다(글자도 친다). 초점이 있는 동안은 칸 안 글자(초점 들어올 때 `cellShownText(kind, 값, true)`, 치면 친 글자 그대로)를 보이고 바뀔 때마다 `onCell`로 친 글자를 알린다. 초점이 나가면 `cellShownText(kind, 값, false)`다. 치지 않고 초점만 오가면 `onCell`을 부르지 않는다(값이 바뀌지 않는다). **치기 전이면 값이 바뀔 때 초점 글자도 새 값으로 맞춘다**(읽는 동안 잠긴 칸을 눌러 두면 초점 글자가 빈 채 남아, 풀린 뒤 치면 안 보이던 서버 값을 덮는다, AC-008.11). 친 뒤에는 친 글자를 그대로 둔다
- **항목 이름 칸**: 12칸 모두 입력 칸이고 `maxLength={NAME_MAX}`. 값이 비어 있으면 기본 이름을 보인다(초점이 들어와도 기본 이름에서 고치기 시작). 지우고 나가면 기본 이름으로 돌아간다. 초점 글자를 따로 들므로 치기 전 값이 바뀌면 숫자 칸처럼 맞춘다. 모양은 칸 글자 그대로라 고치지 않으면 엑셀과 같다. 줄 머리 "수납액"·"총 지 불 액"·"합 계"는 입력 칸이 아니다
- 비고는 100자(`NOTE_MAX`), 업무사항은 2,000자(`MEMO_MAX`)까지, 빈 업무사항 흐린 안내 "환자 이름·차트번호는 적지 않아요"(고칠 수 있을 때만). 입력 칸은 모두 `spellCheck={false}`(브라우저 맞춤법 검사가 글을 밖으로 보낼 수 있다)
- **빨간 칸**: `blockedCells`의 칸은 `aria-invalid`와 `s.blocked`(`--negative` 테두리·`--negative-soft` 바탕). 숫자 칸·비고·업무사항·항목 이름 모두 같다
- **"합계에서 빠졌어요"**: `excludedSumKeys(day)`의 칸 안에 작은 글자(`s.flag`, `--negative`, 칸 높이를 늘리지 않게 칸 안에 겹쳐 둔다). 입력의 `aria-describedby`로 잇는다. 인쇄에서는 숨긴다(13절)
- 자동 칸: `worklogTotals(readDayNumbers(day))`
- 양식 안에 `ds` 단추·칩·앱 토큰 글자 모양을 넣지 않는다(엑셀 모양만)
- 바깥 종이: 시안 `.paper`(흰 바탕·1px `line`·안쪽 24px, 폰 8px). `.paper`는 상자 하나이고 안의 `table`은 테두리를 가진 상자가 아니라 엑셀 칸 선이다 — UI_GUIDE '상자 안 상자'의 예외로 적는다(TASK-1)

### 11-2. `WorklogToolbar`
```ts
type Props = {
  ymd: string; today: string
  onDate(ymd: string): void
  status: ToolbarStatus      // 'loading' | 'empty' | 'saving' | 'saved' | 'offline' | 'failed' | 'blocked' | 'load-failed' | 'view-only'
  savedAt: Date | null
  blockedYmd: string | null  // 막힌 칸이 있는 날. 지금 보는 날과 다르면 그 날짜 글자를 보인다
  onRetrySave(): void; onReload(): void; onPrint(): void
}
```
- PC: 한 줄. 왼쪽 [‹ 전날] · 날짜 칸 · [다음 날 ›] · [오늘로](오늘이 아닐 때만) / 오른쪽 상태 글 · [인쇄]. 폭은 시안 `.work`(737px, 가운데)
- 폰(768px 미만): 두 줄. 날짜 줄(44px) / 상태 글 · [인쇄]
- 단추: `ds.button.secondary`(전날·다음 날·오늘로·인쇄), 날짜 칸 `ds.input`. 상태 글 small `ink-2`(끊김은 `warning` 글자 + 아이콘), `role="status"`
- 오류 카드는 날짜 줄 아래 전체 폭(`ErrorCard`) + 그 아래 단추([다시 저장]·[다시 불러오기]). 보통 하나이고, 저장·불러오기 실패와 막힌 칸이 겹치면 둘 다 위아래로 보인다. 문구는 `lib/errors.ts`
- 막힌 칸이 다른 날에 있으면(`blockedYmd !== ymd`) 카드 아래 글자 "막힌 칸은 2026/10/30 금에 있어요"(`sheetDateText`). 그 날은 날짜 칸으로 고른다. 빨간 칸이 안 보이는 날에 카드만 남아 어디를 고칠지 모르는 일을 막는다 **(Claude 판단)**

| 번호 | 무엇이 | 어떻게 고치나 |
|---|---|---|
| `E-WORKLOG-SAVE-FAILED` | 업무일지를 저장하지 못했어요 | 적은 값은 화면에 그대로 있어요. [다시 저장]을 눌러 주세요. 계속되면 오류 번호와 함께 관리자에게 알려 주세요. |
| `E-WORKLOG-LOAD-FAILED` | 이 날 업무일지를 불러오지 못했어요 | 인터넷 연결을 확인하고 [다시 불러오기]를 눌러 주세요. 불러오기 전에는 칸을 고칠 수 없어요. |
| `E-WORKLOG-NOTE-PRIVATE` | 전화번호나 주민번호 같은 글자가 있어 그 칸은 저장하지 않았어요 | 빨갛게 표시된 칸에서 그 글자를 지우면 바로 저장돼요. 다른 칸은 그대로 저장돼요. 환자 정보는 업무일지에 적지 말아 주세요. |

### 11-3. `WorklogScreen` + `useWorklogDay` + `worklogSession`
```ts
export function WorklogScreen(props: { initialToday: string }): JSX.Element  // 'use client'
// worklogSession.ts — 모듈 하나에 한 벌(화면이 내려가도 남는다)
export function worklogAutosave(): ReturnType<typeof createAutosave>   // 처음 부를 때 만든다. save = (ymd, changes) => saveWorklogDay(supabaseBrowser(), ymd, changes)
export function startWorklogSession(): () => void                       // beforeunload·online·SIGNED_OUT 듣기(한 번만), 돌려준 함수는 시험용 정리
```
- 처음: 고른 날 = 오늘 = `initialToday`. 30초마다와 `visibilitychange`(보임)마다 `todayInKorea()`를 다시 보고 `dayAfterRollover`로 옮긴다
- 날짜별 화면 값: `Map<ymd, { load: 'loading' | 'ready' | 'error'; day: WorklogDay }>`. 읽기 응답은 요청 번호로 맞춰 늦게 온 옛 응답을 버린다. 자동 저장 제어에 `pendingDay(ymd)`가 있으면 그 값을 먼저 보인다
- 읽는 중(처음 여는 날)·읽기 실패면 양식은 `readOnly`(빈 양식이 서버 값을 덮어쓰지 않게)
- **첫 읽기도 저장과 겹치는지 본다**: 읽기 전에 `autosave.revision(ymd)`를 기억하고, 응답 때 달라졌으면(앱 안 이동 뒤 돌아와 읽는 중 저장·재시도가 끝남) 그 응답을 `serverDay`에 넘기지 않고 잠금(`loading`)을 유지한 채 바로 다시 읽는다. 옛 응답을 넘기면 방금 저장한 칸과 `known`이 되돌아가고, 그냥 버리면 `loading`에 갇힌다(AC-010.16)
- 칸 바뀜(모든 입력 칸) → 화면 값 바꾸고 `autosave.change(ymd, day)`. 빨간 칸은 저장을 기다리지 않고 `blockedCellKeys(day)`로 바로 그린다
- 지난 날도 오늘과 같다: 잠금이 없고 고친 사람·시각을 보이지 않는다 **(사용자)**. 줄이 없는 날(일요일·휴일 포함)은 빈 양식이고 적기 전에는 저장을 부르지 않는다
- 날짜 옮김 → `autosave.flush()` 뒤 새 날 보이기. 옮긴 뒤에도 옛 날짜 저장은 계속된다(상태 글은 전체 상태)
- **다시 읽기**(여러 PC가 같은 글을 보게, 사용자 결정 1·4): 이미 연 날로 돌아올 때, 화면이 다시 보일 때(`visibilitychange`), 보이는 동안 60초마다 고른 날을 읽는다(`ready`인 날만). 칸을 잠그지 않는다. 터치 기기(보기만)도 같다. 실시간 연결(Realtime)은 쓰지 않는다 — 탭마다 연결이 늘고, 60초 늦어도 일지에는 문제없다 **(Claude 판단)**
  - 읽기 전에 `autosave.revision(ymd)`를 기억하고, 응답 때 달라졌으면 버린다(읽기를 시작한 뒤 저장이 오갔으면 옛 값일 수 있다). 다음 때 다시 읽는다
  - 응답은 `autosave.serverDay(ymd, 서버 값, 초점 칸)`이 돌려준 하루로 화면 값을 바꾼다. 저장을 부르지 않는다(`change`를 부르지 않는다)
  - 실패는 조용히 넘긴다. 오류 카드·상태 글이 바뀌지 않고 값을 그대로 두며 다음 때 다시 한다. 처음 읽기 실패만 `load-failed` 카드다
- **앱 안 이동**(Next 링크로 다른 탭, 화면이 내려감): 내려갈 때 `flush()`만 부르고 `dispose()`는 부르지 않는다 → 저장·다시 하기가 모듈에서 이어진다. `beforeunload`는 브라우저를 떠날 때만 울리므로 앱 안 이동은 이 길로 지킨다(AC-010.11)
- **보기만은 터치 기기로 정한다**: `matchMedia('(hover: none) and (pointer: coarse)')`가 참이면 `readOnly`이고 `autosave.change`를 부르지 않는다. 값(업무사항·고친 항목 이름 포함)은 그대로 보인다. 화면 폭(768px 미만)은 배치만 바꾼다 — 반쪽 창·150% 확대한 의원 PC도 그대로 고친다(AC-010.10) **(Claude 판단)**
- **터치 기기의 상태 글**(AC-010.17, 사용자 2026-11-01): 터치 기기에서 "아직 적지 않음"에 해당하면 `WorklogScreen`이 툴바에 `view-only` 상태를 넘기고 툴바는 "휴대폰에서는 보기만 할 수 있어요"를 그린다. 나머지 상태의 우선순위와 글은 그대로다
- `beforeunload`(모듈이 한 번 건다): `hasUnsaved()`면 `preventDefault()`(+ `returnValue = ''`). `visibilitychange` hidden → `flush()`. `online` → `autosave.online()`
- **로그아웃**: `supabaseBrowser().auth.onAuthStateChange`의 `SIGNED_OUT`(30분 자동 로그아웃의 `signOut()` 포함) → 떠나기 확인을 떼고, `dispose()`, 화면 값을 지우고 요청 번호를 올린다(그 뒤 온 읽기 응답은 버린다). 그래야 `IdleLogout`의 `window.location.assign('/login')`이 떠나기 확인에 막혀 공용 PC 화면에 일지가 남는 일이 없다(AC-010.12)
- [인쇄] → `flush()` → `window.print()`
- Supabase 클라이언트는 `supabaseBrowser()`. 시험은 `vi.mock`으로 `lib/storage/worklogDays`·`lib/supabase/browser`를 바꾼다

## 12. 엑셀 서식 예외 (TASK-7)

- UI_GUIDE는 Pretendard 하나·400/500/600·토큰 밖 색 금지·앱 화면 Tailwind만이다. 사용자가 "엑셀이랑 완전 똑같이"를 골랐으므로 **양식 칸 안만** 예외로 둔다 **(사용자 결정에서 나온 Claude 판단)**
  - 색: `:root`에 `--xl-ink #000000`·`--xl-lav #CCCCFF`·`--xl-gray #D9D9D9`·`--xl-focus #107C41`. 흰 종이는 `--surface`, 흐린 안내 글은 `--muted`, 막힌 칸·"합계에서 빠졌어요"는 앱 토큰 `--negative`·`--negative-soft`. `@theme inline`에 넣지 않는다(Tailwind 색 이름을 만들지 않는다)
  - 글꼴: `"Gulim", "굴림", "Apple SD Gothic Neo", sans-serif`(칸), 제목 `"Malgun Gothic", "맑은 고딕", "Apple SD Gothic Neo", sans-serif`. 시스템 글꼴 이름만 쓰고 글꼴 파일을 싣지 않는다(시안의 구글 글꼴 `Nanum Gothic`·`IBM Plex`는 쓰지 않는다 — CSP·UI_GUIDE). 의원 PC(윈도우)에는 굴림·맑은 고딕이 있다. 폰은 비슷한 고딕으로 보인다
  - 굵기: 칸 글자 700(엑셀 굵게). 굴림은 굵은 글꼴 파일이 없어 윈도우가 굵게 만든다 — 엑셀과 같다
  - 크기·높이: 엑셀 pt를 화면 px로 옮긴 시안 값(17px 등)과 인쇄 pt 값. Tailwind 대괄호 값 금지 규칙 때문에 CSS Module 한 파일(`sheet.module.css`)에 둔다
- 규칙 시험은 지우지 않고 **예외 한 파일**만 연다: `fonts.test.ts`(700), `classes.test.ts`(APP_DIRS에 `src/components/worklog` 더하기, `*.module.css` 파일·import 예외 한 개씩), `theme.test.ts`(토큰 표에 넷). 다른 파일은 그대로 잡힌다

## 13. 인쇄 (TASK-11)

- `sheet.module.css` `@media print`: `@page { size: A4 portrait; margin: 12mm; }`, `.paper`는 테두리·여백 없음, `.sheet { width: 100%; }` + pt 변수(시안 그대로), `print-color-adjust: exact`, 흐린 안내 글 투명, `.flag`(합계에서 빠졌어요) 숨김, `.blocked`는 빨강을 지운다(인쇄는 엑셀 모양만). 업무사항·고친 항목 이름은 찍힌다
  - Next CSS Modules가 `@page`를 거부하면 그 한 줄만 `globals.css` 끝 `@media print { @page … }`로 옮긴다(TASK-11 Files에 있다)
- 앱 틀: `AppShell`의 위쪽 묶음(`sticky` div)·건너뛰기 링크에 `print:hidden`, 본문 안쪽 감싸개에 `print:p-0`. 다른 화면 인쇄에도 같은 효과다(지금 인쇄하는 화면이 없다)
- 날짜 줄·상태·오류 카드: `print:hidden`
- 한 장 확인: 시험은 CSS의 줄 높이 pt 합(634.5pt)이 A4 인쇄 높이(273mm ≈ 773.9pt) 안인지 본다. 실제 PDF 한 쪽은 E2E(TASK-13)

## 14. 탭 연결 (TASK-12, tab-frame '다음 명세가 탭을 채울 때')

- `menu.ts`: `MenuHref`에 `'/worklog'`, 업무일지 `{ href: '/worklog', ready: true }`
- `dashboard/briefing/features.ts`: 업무일지 `status: 'ready'`(설명 글자는 그대로)
- `notReadyFeatures.ts`: `/worklog` 항목과 `NotReadyPath`의 `'/worklog'` 빼기
- `(app)/worklog/page.tsx`: `export const dynamic = 'force-dynamic'`, `metadata = { title: '업무일지' }`, `<WorklogScreen initialToday={todayInKorea()} />`. 병원 id는 넘기지 않는다(옛 업무사항 열쇠용이었다. 저장은 RLS·DB 기본값이 내 병원으로 한다). 승인 확인은 `(app)/layout`이 한다
- 고칠 시험: `src/app/(app)/notReadyPages.test.tsx`(업무일지 줄 빼기), `src/app/titles.test.tsx`(업무일지를 준비 중 목록 밖 `{ path: '/worklog', title: '업무일지' }`로), `src/components/common/notReadyFeatures.test.ts`, `src/components/dashboard/briefing/features.test.ts`, `src/components/shell/shell.test.tsx`(준비 중 칩·ready 기대), `src/app/(app)/tabFrame.test.tsx`(ready·soon 칸을 나누는 기대가 있으면), `src/components/dashboard/briefing/DashboardHome.test.tsx`(기능 목차 옆 글 `INDEX_SIDE` "12개 가운데 1개는 지금 …"·준비 중 개수·사용 가능 개수 — `FeatureIndex.tsx`는 목록에서 세므로 코드는 그대로, 시험 기대만 바뀐다). 기대 숫자는 손으로 적지 않고 `DASHBOARD_FEATURES`에서 센다(cross-branch C5, AC-012.5). '지금 바로 쓸 수 있어요'(`ReadyNow.tsx`)는 청구만 말해 그대로다
- `src/app/(app)/dashboard/page.test.tsx`: `INDEX_SIDE`의 손 숫자("12개 가운데 1개는 지금, …")도 `DASHBOARD_FEATURES`에서 센다(AC-012.5, C5). 기능 목차 글자를 고정 문구로 지우고 남은 글자에 숫자가 없는지 보는 시험이라, 이 문구가 틀리면 `npm test`가 깨진다
- 문서와 주석(코드 동작은 그대로): `docs/ARCHITECTURE.md` — 폴더 줄 셋(`worklogDays.ts`, `lib/worklog/`, `components/worklog/`)의 '(예정)' 빼기, '화면이 아직 없는 탭 10개'를 9개로. 흐름 줄(`[업무일지]`)과 표 줄(`worklog_days`)의 '(예정)'은 실제 DB에 표가 들어간 뒤 TASK-13에서 뺀다(문서 첫머리: '(예정) = 아직 없는 폴더·표'). `docs/UI_GUIDE.md` — '준비 중 10개'·'화면이 아직 없는 10개'·그 목록·'준비 중 10개는 neutral 칩'·기능 목차 '12개 가운데 …'·'나머지 10개'를 업무일지가 빠진 값으로, 탭 이름 줄은 업무일지를 앞쪽 묶음으로 옮겨 합 14개를 지키고, '대시보드·청구·설정만 `true`'와 기능 목차 '설정(`ready`)' 줄에 업무일지를 더한다. `FeatureIndex.tsx` 윗주석의 상태 글자 설명에 업무일지(ready)를 맞춘다
- `phases/worklog-2-screen/index.json`·`phases/worklog-3-finish/index.json`: 끝난 단계의 `status`·`summary`를 적는다(구현 단계에서 범위 밖으로 막혀 밀린 일)
- `shell.test.tsx`의 "준비 중 주소 /worklog" 탭 띠 밀기 시험은 경로만 쓰므로 그대로 통과한다. 이름 글자만 '준비 중'이 틀리게 되므로, 그 시험을 고칠 일이 생기면 아직 준비 중인 `/inventory`로 바꾼다(이 TASK에서는 고치지 않아 겹침을 줄인다)

## 15. E2E (TASK-13, `e2e/worklog.spec.ts`)

**사용자 결정(2026-11-01): 시험 계정 값을 넣는 자동 시험은 미루고, 사이트에 올린 뒤 사용자가 손으로 확인한다.** 표는 실제 저장소에 들어갔다(같은 날 사용자가 Success 확인). `e2e/worklog.spec.ts`는 시험 계정 값이 들어올 때 쓰고, 그 전에는 만들지 않는다. 지금 할 일은 `docs/ARCHITECTURE.md`의 '(예정)' 두 곳 빼기와 아래 손 확인 목록을 검토 요청 글에 적기다. 손 확인: 병원 계정으로 지난 날짜 2020-01-02에 가짜 값만 적는다. ① 숫자·'가상 200,000 별도'·'2건 30,000'과 항목 이름·비고·업무사항을 적고 저장 → 새로 고침 → 날짜를 다시 고르면 값이 그대로이고 합계가 맞으며 '2건 30,000' 칸에만 "합계에서 빠졌어요" ② 다른 PC에서 같은 날을 열면 같은 값 ③ 두 PC가 같은 날 다른 칸을 고치면 날짜를 옮겼다 돌아왔을 때 둘 다 보임 ④ 전화번호 모양은 빨간 칸이 되고 새로 고치면 그 글이 없으며 함께 고친 칸은 저장됨 ⑤ A4 한 장으로 인쇄 ⑥ 끝나면 칸을 모두 비운다(지우기 권한이 없어 빈 칸으로 저장). 아래는 자동 시험을 쓸 때의 내용이다. 연습용 서버로 한 확인(2026-11-01): 계산, 막는 모양이 요청에 없음, 인쇄 A4 1쪽(빌드한 화면).

- 승인 계정(`accounts.signIn(context, 'approved')`)으로 `/worklog` → 날짜 칸으로 **시험 날짜 2020-01-02**(지난 날, 실제 오늘 일지를 더럽히지 않음)
- **저장되는 값**: 현금수납 `100000`, 카드수납 `가상 200,000 별도`, 계좌이체 `2건 30,000`, 지출 환불 `별도 보고`, 지출 현금 `5000`, 지역화폐 항목 이름 `가상 항목`, 비고 `가상 택배비`, 업무사항 `E2E-가상 메모`, 신환 `3` → "저장했어요" 기다림 → 새로 고침 → **날짜를 다시 2020-01-02로 고름**(날짜는 주소에 없고 화면은 오늘로 열린다) → 값·항목 이름·업무사항 확인, 수납액 `300,000원`·총지불액 `5,000원`·합계 `295,000원`, "합계에서 빠졌어요"는 계좌이체 칸 하나(AC-013.1)
- 새 `browser.newContext()`(다른 PC 흉내)로 같은 날 → 위 칸이 모두 같게 보임(AC-013.3)
- 두 브라우저를 같은 날에 열어 둔 채 첫째는 지출 카드, 둘째는 지출 free를 고쳐 각각 "저장했어요" → `accounts.client('approved')`로 다시 읽은 줄에 둘 다 있음, 첫째가 날짜를 옮겼다 돌아오면 둘째 값이 보임(AC-013.5)
- `page.emulateMedia({ media: 'print' })` + `page.pdf({ format: 'A4', printBackground: true })` → 쪽 수 1(`/\/Type\s*\/Page(?!s)/g`로 센다 — `/Pages`를 세지 않게) (AC-013.4)
- **막는 모양**: 업무사항에 전화 `010-0000-0001`, 비고에 주민번호 모양 `900101 1234567`, 숫자 칸에 `0200000001 별도`, 항목 이름에 `(02)000-0001`, 그리고 다른 칸(지출 카드)에 보통 값 → 넷은 빨강(`aria-invalid`), 오류 카드 `E-WORKLOG-NOTE-PRIVATE`, 보통 값은 저장됨. `page.on('request')`로 **모든 요청**(Supabase·같은 origin Next/Vercel·그 밖)의 주소와 본문을 모아 이 네 글자가 하나도 없는지 보고, `accounts.client('approved')`로 그 날 줄을 다시 읽어 모든 칸에 없는지 본다(AC-013.2, cross-branch C7). 업무사항에 적은 보통 글은 이제 서버에 있는 것이 맞다(옛 '표식이 서버에 없다' 검사는 없앴다). 요청 머리(headers)·쿠키·`apikey` 값은 모으지 않는다(주소에서도 `apikey`·`access_token` 같은 query는 지우고 본다). 걸린 것은 값 대신 **이름만** 담는다(예: `hits = ['업무사항-전화']` → `expect(hits).toEqual([])`, cross-branch C11)
- 끝에 `accounts.client('approved')`로 그 날 칸을 모두 null로 둔다(지우기 권한이 없다). 시험 계정은 가짜 병원이다
- 실제 Supabase에 migration이 들어가야 돈다 → 그 전에는 `blocked`
- 표가 들어간 뒤 `docs/ARCHITECTURE.md`의 `[업무일지]` 흐름 줄·`worklog_days` 표 줄 '(예정)'을 뺀다(14절)

## 16. 결정과 트레이드오프

- **하루 한 줄 표, 칸마다 열** vs jsonb 한 칸: 칸 단위 제약(글자 길이)을 DB가 지키고, 다른 칸이 둘 다 남는 것을 DB가 칸 단위로 보장한다(`plan.md` §0 '코드 대신 DB 제약'). 양식이 바뀌면 migration이 필요하다
- **바뀐 칸만 upsert** vs 줄 전체 upsert **(사용자)**: 두 PC가 다른 칸을 고쳐도 둘 다 남는다. 같은 칸은 나중 저장이 이긴다(동시 수정 막기는 §10 2차). 자동 저장이 '서버에 있다고 아는 값'을 들고 있어야 하므로 조금 복잡하다
- **업무사항 서버 저장** vs 이 PC localStorage **(사용자, 2026-11-01)**: 모든 PC·휴대폰이 같은 글을 보고 어느 PC에서든 인쇄된다. 남는 위험: 환자 이름은 자동으로 못 막는다 → 흐린 안내 글과 모양 막기로 줄이고, AI로 보내지 않는다. 사용자는 환자 이름·차트번호를 적지 않기로 했다
- **숫자 칸을 글자로 저장** vs 숫자 칸 + 메모 칸 **(사용자)**: 엑셀처럼 칸에 뭐든 적는다. 합계는 짐작하지 않는 규칙(7절)으로 낸다. DB가 숫자 범위를 지켜 주지 못하고, 다른 명세가 이 칸을 숫자로 쓰려면 같은 읽기 규칙을 거쳐야 한다
- **항목 이름 12칸**: jsonb 한 칸보다 칸이 많지만 사용자 결정 4를 지킨다(5절)
- **800ms 묶음 + 3번 다시**: 칠 때마다 요청하지 않으면서 "적으면 곧 저장됨"을 지킨다. 무료 Supabase 요청 수에도 부담이 없다
- **60초 다시 읽기** vs 실시간 연결: 단순하고 연결을 늘리지 않는다. 다른 PC 글이 최대 60초 늦게 보인다. 보이는 화면 하나당 1분에 한 번이라 무료 플랜에 부담이 없다
- **폰 보기만**: 아이폰 입력 확대(16px 미만 글자) 문제와 엑셀 칸 크기를 함께 지키기 어렵다. `plan.md` §1과 같다
- **병원 id는 공용 `my_hospital_id()` 기본값**: 다른 갈래와 같은 글자(`create or replace`)라 어느 쪽이 먼저 들어가도 된다. 브라우저가 병원 id를 보내지 않으니 꾸밀 길이 없다
- **자동 저장 제어를 화면 밖 모듈에**: 앱 안 이동에서 값을 잃지 않는다. 대신 로그아웃 때 정리를 꼭 해야 한다(11-3절)
- **보기만 = 터치 기기**: 폭으로 정하면 반쪽 창·확대한 의원 PC가 막힌다. 터치 노트북(마우스 없음)은 보기만이 될 수 있다 — 의원 PC는 마우스를 쓴다

## 17. 위험

- **업무사항·비고에 환자 이름**: 사용자 답(2026-11-01) — 적지 않는다. 이름은 자동으로 알아낼 수 없어 흐린 안내 글로 알리고, 전화·주민번호·메일 모양은 막는다. 서버에 저장되는 글이지만 RLS로 내 병원만 읽고 AI로 보내지 않는다
- **합계가 생각과 다름**: 글자 칸은 규칙대로만 더한다. 합계 제외는 칸에 표시되지만, 숫자가 하나인 글('3건')은 사용자 규칙대로 그 숫자를 더하고 표시가 없다. 표시 칸이 아닌 네 칸(총진료비 등)은 합계에 안 들어가 영향이 없다
- **긴 글자가 칸에서 잘림**: 숫자 칸 50자·항목 이름 20자는 칸 폭보다 길 수 있다. 칸은 엑셀처럼 한 줄이고, 화면은 초점을 두면 밀어 볼 수 있다. 인쇄는 한 장을 지키려고 잘린 채 찍힌다. 업무사항도 칸 높이를 넘으면 인쇄에서 잘린다 → 시안 OK 때 보이고 의원 PC에서 확인한다
- **막는 모양 잘못 걸림**: 0으로 시작하는 9~11자리 붙여 쓴 숫자는 전화로 본다. 걸리면 빨갛게 보이고 그 칸만 저장 안 되므로 조용히 사라지지 않는다. 글을 고치면 풀린다
- **같은 칸을 두 PC가 고침**: 나중 저장이 이기고 앞 글은 사라진다. 바꾼 기록이 없어 되돌릴 수 없다(사용자 결정 5). 다른 PC 값은 60초 안에 보이므로 겹침은 드물다
- **초점 있는 칸은 늦게 바뀜**: 다른 PC가 그 칸을 고쳐도 초점이 나간 뒤 다음 다시 읽기 때 보인다. 치던 글을 빼앗지 않으려고 고른 동작이다
- **굴림이 없는 PC**: 맥·폰은 비슷한 고딕으로 보여 칸 글자가 넘칠 수 있다. 칸은 `overflow`를 숨기지 않고 줄바꿈 없이 둔다(엑셀과 같음). 의원 PC 기준으로 확인한다
- **`@page`와 CSS Modules**: 거부되면 globals.css로 한 줄 옮긴다(13절)
- **자정 넘김 중 입력**: 옛 오늘에 치던 값은 옛 날짜로 저장되고 화면만 새 날로 바뀐다. 입력 중(초점이 양식 안)이면 넘김을 초점이 나갈 때까지 미룬다
- **세션 만료**: 30분 자동 로그아웃(`SIGNED_OUT`)이면 저장 못 한 값은 버리고 화면을 지운다(공용 PC에 일지를 남기지 않는 쪽을 고름). 그 전에 저장이 인증 오류로 실패하면 `failed` 카드다

## 18. 다른 작업과 겹치는 파일 (cross-branch C8)

같은 때 계획하는 통계·매출·환자 갈래, 사전점검·AI 리포트 갈래와 같이 고칠 수 있는 파일이다. 모두 **더하기만** 하고 다른 줄은 바꾸지 않는다. 예외: TASK-12·13이 두 문서에서 업무일지가 준비 중 목록을 벗어나며 틀려지는 손 숫자·목록 줄과 업무일지 '(예정)' 꼬리표만 고친다(14절, 합칠 때 다시 맞춤).

| 파일 | 고치는 것 | TASK | 같이 고치는 갈래 |
|---|---|---|---|
| `supabase/migrations/` + 공용 함수 `my_hospital_id()` | 새 파일 `20261101000100_worklog.sql`(·Phase 4 `…0110_worklog_bit_fields.sql`), 공용 함수는 C1 글자 그대로 | 4·15 | 통계·환자·매출·사전점검 |
| `src/lib/errors.ts` · `src/types/errors.ts` · `src/lib/errors.test.ts` | 끝에 `E-WORKLOG-*` 셋(C3, 다른 갈래 번호와 겹치지 않음) | 9 | 사전점검·통계·환자·매출 |
| `docs/ADR.md` | 끝에 업무일지 ADR 하나. 번호는 그때 마지막 번호 + 1(합칠 때 다시 매김, 시험은 번호를 보지 않는다) | 1 | 모두 |
| `docs/ARCHITECTURE.md` · `docs/UI_GUIDE.md` · `plan.md` | 줄·절 더하기, '하지 마라' 세 줄 꼬리표, plan.md 금액 줄 꼬리표 한 줄. 위 예외의 손 숫자·꼬리표 줄(두 문서만) | 1·12·13 | 모두 |
| `src/app/globals.css` | `:root` 끝에 `--xl-*` 넷(필요하면 인쇄 `@page` 한 블록) | 7·11 | — |
| `src/app/theme.test.ts` · `src/app/fonts.test.ts` · `src/components/ui/classes.test.ts` | 예외 표 한 줄씩(`APP_DIRS`에 한 줄) | 7 | 화면을 더하는 갈래(`APP_DIRS`) |
| `src/components/shell/AppShell.tsx` · `shell.test.tsx` | `print:hidden`·`print:p-0` 세 곳, 시험 하나 | 11 | — |
| `src/components/shell/menu.ts`(`MenuHref` 줄) · `src/components/dashboard/briefing/features.ts` · `src/components/common/notReadyFeatures.ts` (+ 시험) | 업무일지 한 줄씩 | 12 | 통계·환자·매출 |
| `src/app/(app)/tabFrame.test.tsx` · `notReadyPages.test.tsx` · `src/app/titles.test.tsx` · `src/components/dashboard/briefing/DashboardHome.test.tsx` · `src/app/(app)/dashboard/page.test.tsx` | 업무일지 줄, 목록에서 세는 기대 | 12 | 통계·환자·매출 |
| `phases/index.json` · `.harness/active` | phase 줄 더하기 · 활성 기능 이름 | — | 모두 |
| `eslint.config.mjs` · `src/guardrails.test.ts` · 도우미 `Sql.cs`·`Program.cs`·`commands.json` | **고치지 않는다**(Phase 4도 매출 명령을 불러 쓰기만) | — | 통계·환자·매출·사전점검 |

- **합칠 때 숫자 다시 맞춤**: 준비 중 개수(`notReadyFeatures.test.ts`의 `toHaveLength(10)` 같은 기대), `MenuHref` 합집합, 대시보드 `INDEX_SIDE`·준비 중·사용 가능 개수, 두 문서의 손 숫자, 주석의 '10개'(`NotReadyScreen.tsx`·`ClaimEntry.tsx`, 여러 갈래가 바꾸므로 이 명세에서 고치지 않는다), `phases/index.json` 줄 순서, `.harness/active`. 이 명세의 시험은 목록에서 세게 바꾸지만(C5) 다른 갈래 시험에 남은 손 숫자는 합칠 때 맞춘다
- 사전점검 갈래가 막아 두라고 한 파일(`src/workers/precheck/jobs.ts`·`helper/…/Commands/*`·`SqlBitDb.cs`·`src/types/precheck.ts`)은 고치지 않는다. `src/lib/errors.ts`만 더하기로 고친다
- [백업 내려받기](사전점검 TASK-32 `lib/backup/tables.ts`)가 생기면 `worklog_days`를 그 표 목록에 더해야 한다(업무사항도 백업에 들어간다). 이 명세 밖이다(그 TASK가 들어간 뒤 한 줄)

## 19. 사용자에게 물을 것

1. ~~비고 칸에 환자 이름이나 차트번호를 적으시나요?~~ — **답함(2026-11-01)**: 적지 않는다. 비고는 서버에 저장한다(전화·주민번호 모양은 그래도 막는다)
2. ~~휴대폰에서도 고쳐야 하나요?~~ — **답함(2026-11-01)**: 보기만. 업무사항도 폰에 보인다(승인된 로그인)
3. ~~업무사항 칸에 환자 이름을 적으시나요?~~ — **답함(2026-11-01)**: 적지 않는다. 그래서 서버에 저장한다(결정 1). 옛 질문(크롬 데이터를 지우면 사라져도 되는가)은 없어졌다

## 20. 비트에서 채우기 (Phase 4, 2026-11-01 사용자 결정 더함)

### 20-1. 자료 길 (새 읽기 코드를 만들지 않는다)
```
[의원 PC] 업무일지 열기 → useBridge() (components/claim/useBridge, 고치지 않음)
   ready → bridge.call('revenue.days', {from: 그날, to: 그날})   ← 매출 갈래 명령(숫자 명령, 환자 줄 없음, 답 검사 isRevenueDays는 lib/bridge)
   → bitValuesFrom(그날 줄)(순수) → mergeBit(빈 칸만 채움 · 다르면 알림) → 화면 값 + bitFields
   → 자동 저장(worklog_days 바뀐 칸 + 바뀌었으면 bit_fields)
[폰(터치 기기)·다른 PC] 저장된 값과 bit_fields 표시만. 비트 읽기 없음
```
- **합치기 조건**(AC-017.8): `mergeBit`은 그날 읽기 상태가 `ready`일 때만 돌린다. 비트 답이 첫 읽기보다 먼저 오면 들고 있다가 `ready` 뒤에 합친다. 불러오기에 실패한 날은 합치지 않는다. 고른 날짜와 다른 옛 날짜 답은 버린다. 까닭: 읽기 전에는 `known`이 빈 하루라 화면 빈 칸에 비트 숫자가 차고 차이로 저장되어, 손으로 적어 둔 서버 값을 덮는다
- **모든 비트 숫자는 매출 명령 `revenue.days` 하나에서 온다**(`specs/revenue/design.md` 5-2·5-4절): 금액은 양지바른 일일보고 기준(외래환자경영통계, 회계일 = 수납일 기준 정상수납 + 미수입금), 신환·재진은 접수일 기준 `newPatients`·`returnVisits`(= `visits − newPatients`). 금액을 세지 않은 날은 금액 아홉 칸이 `null` + `unconfirmed`(확인 필요)다. 환불·변경수납·예치금·수납 연결 중복, `total`·`cash`·`card`·`transfer`·`receivableIn` 가운데 음수가 그 까닭이고 **까닭은 답에 없다**(환불이 없는 날도 빈칸일 수 있다). 업무일지가 쓰는 금액 여섯 칸도 그 안에 든다 → 업무일지는 그날 **금액 칸만** 채우지 않고 "이 날은 비트 금액 확인이 필요해요. 금액은 직접 적어 주세요"를 보인다. 신환·재진은 그날도 채운다(`null`이 아니면). 금액 맞춤 검사(`insurer + copay ≠ 요양비용총액`)나 나눔 네 칸의 음수에 걸린 날은 나눔만 못 센 날(`splitUnconfirmed`)이고 조합청구액만 빈다(20-2절)
- 업무일지 자신은 도우미·명령 표·통로·검사·Worker를 고치지 않고, 통계 갈래의 길(`stats.rows`·Worker·저장 숫자)도 쓰지 않는다
- `sales_days`(매출 저장 표)에 쓰지 않는다(매출 5-4절: 하루만 따로 쓰는 길은 없다). 업무일지는 자기 표 `worklog_days`에만 쓴다

### 20-2. 칸 맞춤 표 (매출 계약 `specs/revenue/design.md` 5-2절 그대로 — TASK-19 의원 PC 확인으로 확정)

| 업무일지 칸(열쇠) | `revenue.days` 칸 | DB 칸 | 채우기 |
|---|---|---|---|
| 신환(`newPatients`) | `newPatients` | `new_patients` | 채움(`unconfirmed`인 날도) |
| 재진(`returnPatients`) | `returnVisits` | `return_patients` | 채움(`unconfirmed`인 날도) |
| 총진료비(`totalFee`) | `total` | `total_fee` | 채움 |
| 조합청구액(`claimAmount`) | `insurer` | `claim_amount` | 채움(`splitUnconfirmed`인 날은 안 채움) |
| 현금수납(`cashIn`) | `cash` | `cash_in` | 채움 |
| 카드수납(`cardIn`) | `card` | `card_in` | 채움 |
| 계좌이체(`transferIn`) | `transfer` | `transfer_in` | 채움 |
| 미수입금(`unpaidPaid`) | `receivableIn` | `unpaid_paid` | 채움 |
| 미수발생(`unpaidNew`) | — | `unpaid_new` | **계약에 생기기 전에는 안 채움** |
| 지역화폐(`localCurrencyIn`) | — | `local_currency_in` | **계약에 생기기 전에는 안 채움** |
| 지출 넷·비고·업무사항 | — | — | 손으로만 **(사용자)** |

- 값이 `null`인 칸은 비트 값이 없는 것으로 본다(지어내지 않는다). `visits`·`noncovered`는 업무일지에 칸이 없어 쓰지 않는다. 매출 쪽에 더해진 `copay`·`otherTotal`도 칸이 없어 이 표에 영향이 없다
- 하루 줄의 두 표시(`src/types/revenue.ts`, 함께 참이 되지 않는다): `unconfirmed`면 금액 아홉 칸이 모두 `null` → 금액 칸(총진료비·조합청구액·현금수납·카드수납·계좌이체·미수입금)은 채우지 않고 신환·재진은 채운다(`null`이 아니면). `splitUnconfirmed`면 나눔 네 칸(`insurer`·`noncovered`·`copay`·`otherTotal`)만 `null` → 조합청구액만 비트 값이 없어 채우지 않고, 총진료비·현금수납·카드수납·계좌이체·미수입금·신환·재진은 채운다
- **칸 위치로 채운다** **(사용자)**: 위 표의 DB 칸에 넣고 그날 항목 이름은 보지 않는다. 현금수납 이름을 다른 글자로 고쳐도 비트 현금은 `cash_in`에 들어간다

### 20-3. 맞추는 규칙 (`src/lib/worklog/bitFill.ts`, 순수 함수)
```ts
export type BitValues = Partial<Record<WorklogNumberKey, number>>       // 값이 있는 칸만
export const BIT_FILL_KEYS: readonly WorklogNumberKey[]                  // 20-2절 '채움' 여덟 칸
export function bitValuesFrom(revenueDay: RevenueDayRow | null): { values: BitValues; unconfirmed: boolean }
export type BitMerge = { day: WorklogDay; bitFields: WorklogNumberKey[]; changed: boolean; differs: Array<{ key: WorklogNumberKey; typed: string; bit: number }> }
export function mergeBit(day: WorklogDay, bitFields: readonly WorklogNumberKey[], bit: BitValues): BitMerge
export function takeBitValue(day: WorklogDay, bitFields: readonly WorklogNumberKey[], key: WorklogNumberKey, bit: BitValues): BitMerge   // [비트 숫자로 바꾸기]
```
- 비트 값은 숫자 글자로 저장한다(`String(125000)` = `'125000'`, 화면에는 엑셀 모양 `125,000원`)
- `bitValuesFrom`의 `unconfirmed`는 하루 줄의 `unconfirmed`만 따른다. `splitUnconfirmed`인 날은 `unconfirmed: false`이고 `values`에 조합청구액만 없다(그날은 '확인 필요 날' 안내를 띄우지 않는다, 20-5절)
- 빈 칸 → 채우고 비트 칸. 비트 칸 → 비트 값을 따라간다. 손으로 적은 칸 → `readCell`로 읽은 숫자가 비트 값과 같으면 아무 일도 없고, 그 밖(다른 숫자·숫자 없음·합계 제외)은 그대로 두고 `differs`(적은 글자·비트 값). [비트 숫자로 바꾸기]는 적은 글자를 덮는다. 사람이 칸을 고치면 화면이 그 칸을 `bitFields`에서 뺀다
- 비트 칸을 사람이 비우면 다음 비트 읽기에서 다시 채워진다(빈 칸 = 아직 안 적음). "0"을 뜻하면 0을 적는다 — 위험에 적는다 **(Claude 판단)**

### 20-4. 비트 칸 표시 (`bit_fields`, TASK-15·16·17)
- `alter table public.worklog_days add column bit_fields text[] not null default '{}' check (bit_fields <@ array['new_patients', 'return_patients', 'total_fee', 'claim_amount', 'cash_in', 'card_in', 'transfer_in', 'local_currency_in', 'unpaid_new', 'unpaid_paid']::text[])` + `grant insert (bit_fields), update (bit_fields) on table public.worklog_days to authenticated`(정책은 그대로 `my_hospital_id()`). 새 migration 파일 `20261101000110_worklog_bit_fields.sql`(TASK-4 파일은 고치지 않는다). 나중에 계약에 칸이 생길 것을 생각해 check 목록은 열 칸 모두를 받는다
- 저장해 두는 까닭: 폰·다른 PC에서도 어느 칸이 비트에서 왔는지 보이고, 다시 열어도 '비트 칸은 따라가고 적은 칸은 지킨다'가 이어진다 **(Claude 판단)**
- **자동 저장 길 전체가 `bitFields`를 나른다**(TASK-16·17): `loadWorklogDay` → `{ day, bitFields }`, `saveWorklogDay(client, ymd, changes, bitFields?)`, 자동 저장 `change(ymd, day, bitFields?)`, `serverDay(ymd, server, focusKey, bitFields?)` → `{ day, bitFields? }`(합친 하루와 합친 목록, 화면이 이 목록으로 표시를 그린다), `pendingDay(ymd)` → `{ day, bitFields? } | null`, `worklogSession`의 `save`도 같은 모양. Phase 2의 두 함수는 `WorklogDay`를 돌려주고 TASK-17이 이 모양으로 바꾸며, TASK-6·10 시험의 기대는 값은 그대로 두고 `.day`로 읽게 고친다. 자동 저장은 칸처럼 `bitFields`의 아는 값·최신 값을 들고 **바뀌었을 때만 보낸다**. 다시 읽은 목록은 저장 안 된 목록(최신 ≠ 아는 값)이 아니면 아는 값·최신 값을 서버 목록으로 바꾼다. **`bitFields`를 받지 않은 저장은 `bit_fields` 칸을 보내지 않는다**(빈 목록 `[]`을 보내 저장된 표시를 지우지 않게) — 비트를 읽지 않는 화면(폰·연결 안 된 PC)·앱 안 이동 뒤 저장이 표시를 지우지 않는다
- `bit_fields`는 배열 한 칸이라 칸별로 합쳐지지 않고 나중 저장이 이긴다. 비트 PC가 주로 쓰고, 다른 PC는 비트 칸을 손으로 고칠 때만 그 목록을 쓰므로 겹치는 일이 드물다. 겹쳐도 틀리는 것은 표시 하나이고 숫자 칸은 잃지 않으며, 다음 비트 읽기 때 바로잡힌다 **(Claude 판단)**
- 목록 밖 이름은 버린다(열쇠 이름 ↔ DB 칸 이름)
- **합치기·배포 관문**: TASK-16 뒤로 읽기·쓰기가 `bit_fields`를 쓴다 → `20261101000110_worklog_bit_fields.sql`을 실제 Supabase에 붙여 넣기 전(사용자 OK)에는 Phase 4를 main에 합치거나 배포하지 않는다. 붙여 넣은 뒤 실제 Supabase 확인(TASK-18)을 하고, **TASK-18 통과 전에는 4단계를 합치거나 배포하지 않는다**

### 20-5. 화면 (TASK-17)
- 비트 칸: 칸 모서리 작은 표시(엑셀 메모 표시처럼, `--xl-focus` 색) + 양식 아래 한 줄 "표시한 칸은 비트에서 불러온 숫자예요". 인쇄에서는 숨긴다
- 다른 칸: 양식 아래 제목 "비트 숫자와 다른 칸이 있어요"(small 600 `ink`, 목록의 이름) 밑 목록 "현금수납 · 적은 값 120,000 별도 · 비트 125,000원 [비트 숫자로 바꾸기]"(`ds.button.secondarySmall`). 칸 이름은 그날 이름이고, 적은 값은 칸의 화면 글자(`cellShownText`)다. 비트 값 글자는 신환·재진이면 칸처럼 숫자만("신환 · 적은 값 11 · 비트 12"), 금액 칸이면 쉼표와 "원"("125,000원", 0은 "0원") **(사용자, 2026-11-05 시안 v2)**
- 안내 한 줄(날짜 줄 아래, 오류 카드 아님): 연결 안 됨 "비트 PC가 연결되지 않아 직접 적어요" · 확장/도우미 없음·옛 판 "비트 PC 연결을 마치면 숫자를 저절로 채워요" + 끝에 글자 링크 "연결하러 가기"(`/claim/setup`, Next `Link`, **사용자 2026-11-05**)(통로 오류 `E-BRIDGE-REJECTED`·`E-HELPER-UNKNOWN-COMMAND`도 이 '확장/도우미 새 버전' 상태로 본다 — 매출 설계 5절과 같음, '읽기 실패'가 아니다) · 읽기 실패 "비트 숫자를 불러오지 못했어요. 직접 적어도 돼요" · 확인 필요 날 "이 날은 비트 금액 확인이 필요해요. 금액은 직접 적어 주세요"(까닭을 말하지 않는다, 20-1절)
- **휴대폰(터치 기기)에는 비트 안내 줄이 없다** **(사용자, 2026-11-05)**: 위 안내 한 줄도 아래 [지금 불러오기] 줄도 그리지 않고, 툴바의 지금 상태 글("휴대폰에서는 보기만 할 수 있어요", 11-3절 `view-only`)만 보인다. 저장된 비트 칸 표시와 "표시한 칸은 비트에서 불러온 숫자예요" 한 줄은 보인다(AC-017.5)
- 다시 읽기: 그날을 열 때, 날짜를 옮길 때, 오늘이면 화면이 보이는 동안 10분마다, 그리고 [지금 불러오기]를 누를 때(아래). 터치 기기(보기만, `readOnly` — 11-3절과 같은 판정)에서는 읽지 않는다
- **[지금 불러오기]** (AC-017.9, **사용자 2026-11-05 "필요해"**): 날짜 줄 아래 안내 자리는 `useBitFill` 상태마다 아래 표와 같다. 비트를 읽을 수 있는 상태(`useBridge` ready이고 터치 기기 아님 = `reading`·`ready`·`unconfirmed`·`failed`)면 그 자리가 한 줄(시안 `.loadrow`)이 된다 — 왼쪽 글(small `ink-2`), 오른쪽 작은 단추 [지금 불러오기](`ds.button.secondarySmall`), 좁으면 줄을 바꾼다(`flex-wrap`). 줄 전체 `print:hidden`

| `useBitFill` 상태 | 날짜 줄 아래 한 줄 왼쪽 | 오른쪽 단추 |
|---|---|---|
| `off`(터치 기기) | 없음(줄이 없다) | 없음 |
| `not-connected` | "비트 PC가 연결되지 않아 직접 적어요" | 없음 |
| `setup-needed` | "비트 PC 연결을 마치면 숫자를 저절로 채워요" + "연결하러 가기"(`/claim/setup`) | 없음 |
| `reading`(첫 읽기·10분 읽기·누른 읽기 모두) | "비트 숫자를 불러오는 중이에요" | `disabled`, 글자 "불러오는 중" |
| `ready` | "비트 숫자를 14:20에 불러왔어요"(`savedTimeText(lastReadAt)`) | [지금 불러오기] |
| `unconfirmed` | "이 날은 비트 금액 확인이 필요해요. 금액은 직접 적어 주세요" | [지금 불러오기] |
| `failed` | "비트 숫자를 불러오지 못했어요. 직접 적어도 돼요" | [지금 불러오기] |

  - `useBridge` 상태 → `useBitFill` 상태(Claude 판단): 터치 기기면 늘 `off`. 아니면 `connecting` → `reading`(의원 PC를 열 때마다 거치므로 '연결 안 됨'을 잠깐 띄우지 않는다. 단 `connecting`인데 `helloError`가 있으면 `setup-needed` — 매출 화면처럼 멈춘 '불러오는 중'에 갇히지 않게), `ready` → 읽기에 따라 `reading`·`ready`·`unconfirmed`·`failed`, `busy`·`disconnected` → `not-connected`, `no-extension`·`no-helper`·`update-helper`·`update-extension` → `setup-needed`
  - 인쇄: `BitNotice` 전부(모든 상태의 안내 줄·[지금 불러오기] 줄·'다름' 목록과 그 단추·설명 줄)를 `print:hidden`으로 숨긴다(AC-011.3 "양식만 나온다", 시안 상황 6)

  - 시각: `lastReadAt` = 그날(`ymd`) `revenue.days` 답이 답 검사를 지나 도착한 때(`new Date()`, 시험은 가짜 시계)다. 글자는 `lib/worklog/days.ts`의 `savedTimeText`(한국 시각 `HH:MM`, 24시간, PC 시간대와 상관없음 — "저장했어요 · 14:05"와 같은 함수)로 만든다. 답의 `ymd`가 고른 날과 다르면(날짜를 막 옮김) 옛 날 시각을 보이지 않고 `reading`처럼 그린다 **(Claude 판단)**
  - 누르면 `reload()`: 그날 `bridge.call('revenue.days', { from: ymd, to: ymd })`을 바로 부른다 — AC-017.1과 같은 길(같은 요청 번호로 늦은 옛 답을 버림, 같은 오류 나눔 `failed`·`setup-needed`), 같은 합치기(`mergeBit`, 그날 읽기 상태가 `ready`일 때만 — AC-017.8 그대로. 첫 읽기 전에 온 답은 들고 있다가 합치고, 불러오기 실패한 날은 합치지 않는다), 바뀐 칸만 자동 저장. 그래서 저장에 넘기는 목록도 `mergeBit`이 돌려준 것뿐이다. 오늘이면 10분 타이머를 누른 때부터 다시 센다(지난 날은 타이머가 없다). `reading`일 때나 단추가 없는 상태에서는 아무 일도 하지 않는다
  - 다시 읽는 동안(`reading`) 같은 날의 앞 `values`·`lastReadAt`은 그대로 둔다('다름' 목록·표시가 깜빡이지 않게) **(Claude 판단)**. `failed`인 날에 누른 읽기가 성공하면 상태가 `ready`(또는 `unconfirmed`)가 되어 실패 안내가 사라진다
  - 아이콘(시안 v2 그대로): 날짜 줄 아래 안내 줄은 모든 상태(위 '안내 한 줄' 넷 포함)에서 글 앞에 `Icon info`(16, `text-muted`, `shrink-0`), [지금 불러오기] 단추는 글자 앞에 `Icon reload`(16, 글자색, 읽는 중에도 그대로)다. 두 이름은 지금 `src/components/common/Icon.tsx`에 없어 TASK-17이 `ICON_NAMES` 끝(`logout` 뒤)에 `info`·`reload`를 더한다(21개, tab-frame TASK-4의 `copy`·`userCheck`·ui-90의 `logout`과 같은 길). 그림은 시안 `docs/mockups/worklog/bitfill.html`의 `ICON_INFO`·`ICON_LOAD`(viewBox 24)를 16 칸으로 ×2/3 한 것(소수 둘째 자리, 점 `h.01`은 그대로)이고 속성은 다른 아이콘과 같다(viewBox `0 0 16 16`·`fill="none"`·`stroke="currentColor"`·선 1.5·`aria-hidden`):
    - `info`: `<circle cx="8" cy="8" r="6" />` · `<path d="M8 7.33v3.67" />` · `<path d="M8 5h.01" />`
    - `reload`: `<path d="M13.33 8a5.33 5.33 0 1 1-1.56-3.77" />` · `<path d="M13.33 2.67v3.33h-3.33" />`
    - `Icon.tsx` 머리 주석에 그림 출처(`docs/mockups/worklog/bitfill.html`의 `ICON_INFO`·`ICON_LOAD`, ×2/3)를 더한다. `Icon.test.tsx`: 이름 목록·개수 시험은 이름에 AC-017.9를 더하고 기대를 "… logout 뒤에 info·reload를 더한 21개"로 바꾼다(지금 `NAMES`·`NEW_NAMES`는 그대로). 새 시험(AC-017.9): 시안에서 `ICON_INFO`·`ICON_LOAD`를 읽었다(시험 준비) · 두 이름의 속성·기본 16×16 · 안쪽 그림이 위 글자와 같다(×2/3 바꿈이 있어 기대 그림은 시험에 글자로 적는다) · 원소 종류·개수가 시안과 같다(circle·path·path / path·path) · 안쪽 원소에 색·style·글자가 없다 · 크기 12·14·16 · 머리 주석에 출처가 있다. 나머지 Icon 시험과 `classes.test.ts`는 고치지 않은 채 통과한다
    - `docs/UI_GUIDE.md` '아이콘·로고' 줄: "19개(…·logout)" → "21개(…·logout·info·reload)"와 "`info`·`reload`는 업무일지 비트 안내 줄·[지금 불러오기]가 쓴다(worklog 비트 표시 시안 그림)" 한 마디만 더한다
- 모양(TASK-17이 정한다, 화면 시험이 보는 것):

```ts
// src/components/worklog/useBitFill.ts
export type BitFillStatus = 'off' | 'reading' | 'ready' | 'unconfirmed' | 'failed' | 'not-connected' | 'setup-needed'
export function useBitFill(opts: { ymd: string; today: string; readOnly: boolean }): {
  status: BitFillStatus
  ymd: string                // 이 답의 날짜(요청 번호로 늦은 옛 답은 버린다)
  values: BitValues
  lastReadAt: Date | null    // 이 ymd의 마지막 성공 읽기가 끝난 때. 아직 없으면 null
  reload(): void             // [지금 불러오기]. ready·unconfirmed·failed일 때만 읽고, 오늘이면 10분 타이머를 다시 건다
}
// src/components/worklog/BitNotice.tsx — 그리기만. 날짜 줄 아래 한 줄은 { status, lastReadAt, onReload } 를 받는다
// (양식 아래 설명 줄·'다름' 목록과 같은 파일에서 나눠 내보내도 된다). 줄 앞 <Icon name="info" />, 단추 글자 앞 <Icon name="reload" />
// src/components/common/Icon.tsx — ICON_NAMES = [...지금 19개(… 'logout'), 'info', 'reload'] (21개)
```
- **화면 시안이 먼저다**: 이 표시·목록·안내는 승인된 시안 v2에 없다 → TASK-17 전에 시안을 더해(예시 숫자) 사용자 OK를 받는다(CLAUDE.md 화면 규칙). **2026-11-05 사용자 OK(비트 표시 시안 v2, [지금 불러오기] 포함)** → `docs/mockups/worklog/bitfill.html`

### 20-6. 의원 PC 확인 (TASK-19, 코드 없음, Phase 4 배포 뒤)
- 총괄이 지난 날 사흘(금액이 채워진 날 둘 + 금액이 '확인 필요'로 빈칸인 날 하나, 그런 날이 있으면)을 골라 **업무일지 화면(비트가 채운 칸)**·그날 엑셀 업무일지·비트 '외래환자경영통계'를 칸마다 견준다: 날짜별 신환·재진, 수납 나눔(현금·카드·계좌·미수입금), 총진료비, 조합청구액(= 공단부담인지), 그리고 미수발생·지역화폐가 비트에 따로 있는지
- 수납 나눔과 날짜별 신환·재진은 **매출 갈래가 넘긴 확인**이다(그 칸은 매출 탭에 없고 업무일지 화면에만 그려진다, `specs/revenue/design.md` 5절)
- 결과는 `docs/worklog/bit-check.md`에 "같음 / 다름(어떻게) / 비트에 없음"으로만 적는다(숫자는 적지 않는다 — 실제 매출 숫자는 저장소에 두지 않는다)
- 20-2절과 다르면 명세를 고친다(채우는 칸 목록). 미수발생·지역화폐가 비트에 있거나 수납 나눔·신환·재진 기준이 다르면 매출 갈래에 계약 변경을 알린다. 조합청구액이 날마다 빈칸이면 금액 맞춤 검사의 가정이 틀린 것일 수 있으니 적어 두고 매출 갈래에 알린다(`specs/revenue/design.md` 5-2절)

### 20-7. 더하는 위험
- 엑셀 업무일지 숫자가 진료일 기준이었다면 수납일 기준인 비트 금액과 날마다 조금 다를 수 있다. 신환·재진은 접수일 기준이라 엑셀과 같을 가능성이 높다 → TASK-19가 확인한다
- 오늘은 진료 중 숫자가 늘어난다: 비트 칸은 10분마다 따라가고, 사람이 고친 칸은 '다름'으로만 알린다
- `bit_fields` 칸이 실제 Supabase에 없는데 Phase 4가 배포되면 읽기·쓰기가 모두 실패한다 → 20-4절 관문

### 20-8. 겹치는 파일 (Phase 4)
| 파일 | 하는 일 |
|---|---|
| `src/components/claim/useBridge.ts` · `src/lib/bridge/*` · `src/types/revenue.ts` | 불러 쓰기만(고치지 않음) |
| `src/lib/storage/worklogDays.ts` · `src/lib/worklog/autosave.ts` · `src/types/worklog.ts` · `src/components/worklog/*` | 이 명세 파일(Phase 1~3에서 만든 것)에 `bitFields`·표시 더하기 |
| `supabase/migrations/` | 새 파일 `20261101000110_worklog_bit_fields.sql`(C2) |
| `src/components/common/Icon.tsx` · `Icon.test.tsx` · `docs/UI_GUIDE.md` '아이콘·로고' 줄 | `ICON_NAMES` 끝에 `info`·`reload` 더하기(TASK-17, 20-5절). 다른 갈래가 같은 목록에 이름을 더했으면 합칠 때 목록·개수 시험·UI_GUIDE 개수를 함께 맞춘다 |
