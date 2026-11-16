# 설계: 수납일지 탭

## 흐름
```
비트 DB ─(도우미 0.8.0: contact.targets kind 'sunap')→ 확장 → lib/bridge → sunap.worker
                                    store.load/save {month, sunap} ↔ 도우미 PC 암호화 파일 work-YYYY-MM.dat
sunap.worker ─(장부 보기: 이름 줄 포함)→ SunapScreen → components/sunap/rows(울타리)
SunapScreen ─(마감: 숫자 24칸만)→ Supabase sunap_days / 지출 sunap_spends / 설정 sunap_settings
통계 탭 ← listSunapDays(예약률) + stats.worker sunapRates(Block 전환, 비트에서 바로)
```

## 시안과 다른 곳
- 원장님별 표·통계 원장님별 표를 뺐다(사용자 결정 10). 장부의 '원장님' 칸도 없다
- 설정의 '지출 종류' 이름 바꾸기를 뺐다(MVP). 종류는 고정 넷
- 장부 위 필터 칩·찾기 칸은 둔다. 시안의 '미수 생긴 날' 칸은 뺀다(도우미가 읽기 어려움, MVP)
- (11-17 검토 뒤 더함) 도우미 답 `unsure`가 참이면 장부 위에 '확인 필요한 날' 한 줄(AC-4905.9, 통계 매출의 '확인 필요한 날'과 같은 말)
- (11-17) 미수 입금 표의 '접수' 시각은 늘 '–'다: 비트 `OrpAccDte`·`OrcAccDte`가 char(8) 날짜뿐이다(실제 DB 확인). 사용자 결정: 칸은 둔다
- 시안에 없던 글(구현 때 더함): 불러오는 중 글('비트 PC 연결을 확인하는 중이에요' 등), 서버 저장 실패 안내(마감·풀기·읽기), 0.8.0 미만 상자 '도우미 새 판(0.8.0)을 깔면 장부가 보여요', 62일 넘은 날 상자 '62일 넘게 지난 날은 합계·지출만 보여요', 빈 상태('아직 마감 전이에요'·'지출이 없어요'·'미수 입금이 없어요'), 금액·비고 고치기 판. 통계 칸은 '수납일지를 마감한 날이 없어요'·'수납일지 설정에서 Block·물리치료 묶음을 고르면 보여요'
- 환자 이름을 그리는 예약 고르기 판(`RsvPicker`·`Pop`)도 `components/sunap/rows/` 울타리 안에 둔다

## 도우미 답 (`contact.targets` kind `sunap`, 조각 하나의 JSON)
```json
{ "v": 1, "day": "2026-11-16", "unsure": false,
  "rows": [["10231", "김○○", "09:02", "re", 0, 15000, 0, 0, ["MM110", "KK020"], ["202611191030", "주사 오전"]]],
  "paid": [["20788", "문○○", "11:20", 10000, 0]] }
```
- rows 칸: 차트, 이름, 첫 접수 HH:mm, 구분(`new`|`d90`|`re`), 현금, 카드, 계좌, 미수(원 정수), 처방코드 글자 목록(중복 없음), 예약(null 또는 [yyyyMMddHHmm, 메모 앞 40자, 메모 없으면 ""])
- 센 내원 = `StatsSql` Visits 조건(외래·상태 WN/HN/TN/PN·`OcmRsuYon<>'O'`·이 병원). 첫 내원일 = `FirstVisits`와 같은 셈. 90일 = 그날 `OcmDgsNfs='3'` 내원이 있음
- 금액 = `RevenueSql.FinanceNormal`의 `NativeRows`를 `ByDoctorDay`처럼 글자 바꾸기로 '내원(OrpOcmNum)별'로 만든 새 상수(원본 글이 바뀌면 바로 실패). 현금 `CashAmt`, 카드 `CardAmt`, 계좌 `CheckAmt`, 미수 = max(0, 본인부담 총액 `OrpTotOwn` − (현금+카드+계좌)). `RcvAmt`는 받은 돈의 합이라 미수로 쓰지 않는다(구현 때 바로잡음). 음수 금액(환불 등)은 0으로 보내고 `unsure`를 참으로 한다
- 처방코드 = `VisitRowsSql`과 같은 줄을 그날·그 환자로 좁힌 새 상수
- 예약 = 같은 차트, `OcmAcpDtm >= D+1일 0시`, 외래, 이 병원, (`RsvInf` `RsvDivTyp` 'R'·'' 줄 있음 또는 상태 WR·NR·CR), 상태 CN 아님 중 가장 이른 것. 메모 = `RTRIM(RsvRefCmt)` 앞 40자. **이 새 상수만 메모를 읽는다**(patients-bit-lists `ReservationsSql`의 '메모 안 읽음' 시험은 그대로)
- paid = `FinanceReceivable`을 환자별로(현금 = 현금, 카드 = 카드+계좌). unsure = `RevenueDays`의 확인 필요 조건과 같음
- 새 SQL 상수는 `helper/src/Precheck.Core/Sunap/SunapSql.cs`에 두고 `Bit/Sql.cs` 허용 사슬에 더한다. 처리기 `Sunap/SunapTargets.cs`(`Kind = "sunap"`), `ContactCommands.BuildTargets`에 한 줄
- 범위: from = to, 오늘−62일 ≤ D ≤ 오늘. 명령 표 `contact.targets.kind` 값에 `sunap`만 더한다(확장 새 판 없음, 확장은 명령 이름만 본다)

## PC 저장 (`work-YYYY-MM.dat`의 새 칸 `sunap`)
```ts
type SunapLocalMonth = { [day: string /* YYYY-MM-DD */]: SunapLocalDay }
type SunapLocalDay = {
  edits?: { [chart: string]: SunapEdit }
  closedAt?: string          // ISO, 마감 중일 때만
  late?: boolean             // 처음 마감이 늦었음
  fixed?: { [chart: string]: RsvKind }  // 처음 마감 때 자동 예약 종류
}
type SunapEdit = { cash?: number; card?: number; transfer?: number; unpaid?: number; block?: boolean; pt?: boolean; rsv?: Exclude<RsvKind, 'unknown'>; note?: string /* ≤100자 */ }
type RsvKind = 'none' | 'inj' | 'visit' | 'etc' | 'unknown'
```
- `WorkStore.ObjectFields`에 `sunap`, `StoreCommands.Save` 규칙은 "month는 drafts·done·journal·sunap 중 하나라도 있을 때만 있다". 지킴(13달 지움)은 지금 그대로
- 명령 표 `store.save.payload.fields`에 `sunap: {type:'json', of:'object', optional:true}`

## 순수 규칙 (`src/lib/sunap/`, 환자 자료 구역)
- `ledger.ts`: `buildLedger(reply, local: SunapLocalDay, settings) → Ledger`, `dayTotals(ledger) → SunapTotals`, `closeLocal`, `reopenLocal`, `parseWon`
- `memo.ts`: `classifyMemo(memo, words)`
- `src/lib/analytics/groupMatch.ts`: `groupMatches(def: RxGroupDef | null, codes: readonly string[])` — `aggregate`의 `groupCodeKey`·셈 규칙과 같게(aggregate는 고치지 않는다)
- `src/lib/analytics/sunapRates.ts`: `sunapRates(...)` — 통계 Worker가 이미 가진 환자·날 줄과 처방 줄로 셈
- 장부 줄 `LedgerRow = { chart, name, time, kind, cash, card, transfer, unpaid, free, block, pt, rsv: { kind, source: 'hand'|'bit', at: string|null }, note, edited: string[] }`
- 예약률·전환 비율: 초진 예약률 = rsv_first/first_n, 90일 = rsv_d90/d90_n, 초진+Block = first_block/first_n, 90일+Block = d90_block/d90_n, 재진+Block = ret_block/block_n, Block = block_n/visits, 물리치료 = pt_n/visits. 분모 0이면 '–'

## DB (`20261116000000_sunap.sql`, 사용자가 SQL Editor에 붙여 넣음)
- `sunap_days`: `hospital_id`(기본 `my_hospital_id()`), `work_date` date, `closed_at` timestamptz 기본 now(), `late` bool not null 기본 false, 숫자 24칸(int not null 기본 0, 0~1,000,000,000): `visits, first_n, d90_n, ret_n, block_n, pt_n, rsv_first, rsv_d90, first_block, d90_block, ret_block, cash_n, cash_won, card_n, card_won, transfer_n, transfer_won, paid_cash_n, paid_cash_won, paid_card_n, paid_card_won, free_n, unpaid_n, unpaid_won`. 기본 키 (hospital_id, work_date). 권한: select·delete, insert/update(hospital_id 뺀 칸)
- `sunap_spends`: `id` uuid 기본 gen_random_uuid(), `hospital_id`, `work_date`, `kind` text in ('cash','card','etc','parking'), `memo` text 1~50자, `amount` int 0~100,000,000, `created_at`. 권한: select·delete, insert(work_date, kind, memo, amount), update(kind, memo, amount)
- `sunap_settings`: `hospital_id` 기본 키, `block_group` uuid null, `pt_group` uuid null, `rsv_words` jsonb not null 기본 `{"inj":["주사","블록"],"visit":["경과","진료"],"etc":["기타"]}`(object이고 4,000바이트 미만). 권한: select, insert/update(block_group, pt_group, rsv_words). 묶음은 외래 키 없이(지워진 묶음 = 안 고름)
- 모두 RLS 켜고 `revoke all from anon, authenticated` 뒤 필요한 권한만, 정책은 `hospital_id = (select public.my_hospital_id())`. `if not exists`·`drop policy if exists`로 두 번 실행 안전. 본보기 `20261108000000_claim_day_closes.sql`

## 저장 함수 (`src/lib/storage/sunap.ts`)
- `closeSunapDay(client, ymd, totals, late)` upsert(onConflict hospital_id,work_date, closed_at = now) · `reopenSunapDay(client, ymd)` delete · `loadSunapDay(client, ymd)` → `{closedAt, late, totals} | null` · `listSunapDays(client, from, to)` → 같은 모양 배열
- `listSpends(client, ymd)` · `addSpend(client, ymd, {kind, memo, amount})` · `updateSpend(client, id, patch)` · `deleteSpend(client, id)` — 내용은 앞뒤 빈칸을 빼고 `privacyProblem`이면 `'blocked'`
- `loadSunapSettings(client)` → 줄이 없거나 모양이 틀리면 기본값 · `saveSunapSettings(client, settings)` upsert(onConflict hospital_id)

## Worker 메시지 (`src/workers/sunap.worker.ts` + `src/workers/sunap/*`)
- 화면 → Worker: `bridge-port`(기존 `connectScreenBridge`), `load {day, words, blockDef, ptDef}`, `edit {chart, patch: Partial<SunapEdit> | {revert: keyof SunapEdit}}`, `close {now}`, `reopen`
- Worker → 화면: `ledger {day, rows: LedgerRow[], paid, unsure, closedAt, late, totals}` · `closed {totals, late}` · `error {code}`
- 본보기: `src/workers/patients.worker.ts`·`patients/handler.ts`(조각 받기 `createAssembler`, 보내기 `{type:'send', cmd:'store.save'}`)

## 화면 (`src/components/sunap/`)
- `SunapScreen.tsx`(날짜·상태·단추·흐름), `SunapCards.tsx`(요약 네 칸), `SpendPanel.tsx`, `RsvPicker.tsx`, `SunapSettings.tsx`, `RemoteView.tsx`, `useSunapWorker.ts`
- 환자 줄: `rows/LedgerRows.tsx`, `rows/PaidRows.tsx`(울타리 안: React만, 네트워크·저장소·bridge 없음)
- 도우미 확인: `useBridge`의 handshake 버전 ≥ `SUNAP_HELPER`면 장부, 아니면 `RemoteView`
- 오늘 이후 날짜로는 못 간다. 오늘−62일보다 이른 날은 `RemoteView`(서버 숫자만)
- 모양은 앱 토큰·`components/ui/classes.ts`. 문구는 시안 글자 그대로(바꾼 곳은 이 문서에 적는다)

## 예 (시안 숫자, `dayTotals` 시험)
- 시안 장부 16줄(시안 `ROWS`, 13번 Block·16번 현금은 고친 칸)로 만든 가짜 답의 합: visits 16, 초진 4·90일 2·재진 10, Block 7, 물리치료 13, rsv_first 3(3번 진료(경과)·10번 직접 진료(경과)·14번 주사치료), rsv_d90 2, first_block 2, d90_block 1, ret_block 4, 현금 4건 25,600, 카드 10건 193,600, 계좌 1건 25,000, FREE 1, 미수 1건 16,300, 미수 입금 현금 1건 10,000·카드 1건 15,000. 8번(종류 모름)은 예약률에 안 든다

## 위험
- (11-16 실제 비트 확인, 개수만) 11-13·11-16 센 환자 65·93명 모두 돈 줄이 있었다(한 푼도 안 낸 환자도 빠지지 않음). 미수로 보인 환자 1명 1,000원·5명 7,000원 → 첫날 엑셀과 견준다
- 비트 RsvInf·`RcvAmt` 뜻이 이 의원에서 맞는지 아직 실제로 견주지 않았다 → 설치 뒤 첫날 엑셀(또는 비트 수납 화면)과 사용자가 한 번 견준다. 다르면 고친다
- 예약을 비트에 적기 시작한 지 얼마 안 되면 예약률이 낮다(사용자에게 안내함)
- 장부 고친 칸은 그 PC에만 있다. PC를 바꾸면 고친 칸이 안 보인다(사용자 결정 1·접수 PC 한 대)
