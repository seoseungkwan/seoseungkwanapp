# 설계: ERP 마감일지 비트 값 채우기

> 일꾼끼리의 경계는 2절(명령 모양)과 3절(설정 모양)·4절(칸 표)이다. 이 세 절은 승인 뒤 고치지 않는다.

## 1. 흐름
- 채우기: ERP `/h/closing` 화면 [비트 값 채우기](`content.ts`) → `chrome.runtime.sendMessage` → 서비스 워커(`background.ts`) → `chrome.runtime.connectNative('com.seoseungkwan.precheck')` → 도우미(호출 origin = 새 확장) `closing.day` → 숫자 답 → `cells.ts`가 4절 표로 칸 계획 → `fill.ts`가 넣음 → `panel.ts` 안내
- 설정: 확장 설정 화면(`options.html`·`options.ts`) → 서비스 워커 → `closing.codes` → 찾기·고르기 → `chrome.storage.local` `erpClosing`
- 환자 줄·차트번호는 도우미 밖으로 나가지 않는다. ERP 화면에는 숫자만 들어가고 저장은 사용자가 누른다

## 2. 명령 모양 (`src/lib/bridge/commands.json`의 새 `erp` 구역)
```json
"erp": {
  "extensionId": "<TASK-1 공개키의 ID>", "extensionKey": "<TASK-1 공개키 DER base64>",
  "commands": {
    "closing.codes": { "patient": false, "args": {} },
    "closing.day": { "patient": false, "args": {
      "date": { "type": "date" },
      "groups": { "type": "array", "min": 0, "max": 19, "items": { "type": "object", "fields": {
        "key": { "type": "enum", "values": ["carm","sono","arthro","manual","eswt","pt","etc1","etc2","etc3","etc4",
                 "manualConsult","lipus","nail","ct","surgery","eswtStd","eswtRadial","injection","ptVisit"] },
        "codes": { "type": "array", "min": 1, "max": 20,
                   "items": { "type": "string", "min": 1, "max": 20, "pattern": "^\\S{1,20}$" } } } } } } }
  }
}
```
- 묶음 key(차례 그대로, 설정 이름 · 쓰는 칸): carm 씨암 · sono SONO · arthro 관절조영 · manual 도수 · eswt 충격파 · pt 물리치료 · etc1~etc4 기타1~4(치료별 건수·치료별 매출) / manualConsult 도수상담 · lipus 리푸스 · nail 손발톱케어 · ct CT · surgery 수술(진료·치료현황만) / eswtStd ESWT Standard · eswtRadial ESWT Radial · injection 주사(운영 지표) / ptVisit 물리치료내원(환자현황)
- 답(`{ v, id, type: 'result', data }`의 data, TS 모양. C# 모델 칸 이름도 같다):
```ts
type Three = { new: number; first90: number; return: number }
type ClosingCodes = { codes: { code: string; name: string | null; visits: number }[]; kinds: { kind: string; name: string | null }[] }
type ClosingDay = {
  date: string                                   // 'YYYY-MM-DD'
  patients: { new: number; first90: number; return: number; ptVisit: number | null; noExamFee: number; total: number }
  groups: ({ key: GroupKey; patients: number; total: number; unpaidVisits: number } & Three)[]   // args 차례
  ages: ({ band: '0' | '10' | '20' | '30' | '40' | '50' | '60' | '70' | '80' | '90' } & Three)[] // 늘 10줄
  money: Record<'total' | 'insurer' | 'receivableIn' | 'unpaidNew' | 'noncovered' | 'discount' | 'disabledFund'
              | 'received' | 'card' | 'cash' | 'transfer' | 'refund', number | null>
  inpatientVisits: number
  reservations: { kinds: { kind: string; total: number; visited: number; changed: number; canceled: number }[]; patients: number }
  injection: { firstTime: number | null; newPatients: number; newLines: number } | null
  warnings: { moneyUnconfirmed: boolean; splitUnconfirmed: boolean; unpaidVisits: number; unknownAge: number; noHistory: boolean }
}
```

## 3. 도우미
### 3-1 새 확장 허용 (TASK-2)
- `CommandTable`: 맨 위 열쇠에 `erp`를 더한다(`erp` 안은 extensionId·extensionKey·commands 셋뿐, 이름이 `commands`와 겹치면 표가 틀림). `Has`는 두 구역을 다 보고(Dispatcher.Register용) `Names`는 지금처럼 `commands`만, `ErpNames`를 더한다
- `OriginGuard.CallerOf(args, table)` → `Caller.Web | Caller.Erp | null`. `MessageLoop`이 null이면 지금처럼 끝내고, 아니면 `Dispatcher.Handle(message, sink, caller)` → `table.Validate(request, caller)`: 부른 쪽 구역에 없는 이름은 E-HELPER-UNKNOWN-COMMAND. 지금의 두 인자 `Handle(message, sink)`·`Validate(request)`는 Web으로 보고 남긴다(지금 시험 그대로)
- `helper/install/host-manifest.json` `allowed_origins` = [기존 ID, 새 ID]. `install.ps1`은 그대로(틀을 복사한다)

### 3-2 새 문장 (TASK-3, `Closing/ClosingSql.cs`, `Parameters` 표. `Bit/Sql.cs`의 `IsAllowed`·`ParametersOf`에 한 줄씩)
- 진료 조건(모든 문장 같음): 외래(`OcmPatTyp='O'`)·접수취소 아님(`OcmRsuYon<>'O'`)·`OcmComStt IN ('HN','PN','TN','VN','OE','WN','OB')`·병원 범위(DepMst, `RevenueSql`과 같음). 처방 조건: `OdrDelFlg='N' AND OdrCanYon='N' AND OdrOutCod<>'99'`
- `DayVisitsSql`(@day·@from·@to·@hospital): 진료마다 [진료번호, 그날 번호 `DENSE_RANK() OVER (ORDER BY RTRIM(OcmChtNum))`, `RTRIM(OcmDgsNfs)`, 만 나이(`PbsBirDte`가 8자리 날짜면 `(CONVERT(int,@day) − CONVERT(int,PbsBirDte)) / 10000`, 아니면 NULL), 마지막 정상 수납 줄(`OrpRcpStt<>'C'`인 줄 가운데 `MAX(OrpRcpSeq)`, 미수입금 줄 'C'는 진료비 칸이 늘 0이라 뺀다) `OrpTotAmt` 또는 NULL]
- `DayCodesSql`(@from·@to·@hospital): [진료번호, `UPPER(RTRIM(OdrCod))`, 줄 수]
- `InjectionFirstSql`(@from·@to·@hospital·@c0~@c19, 빈 자리는 첫 코드로 채움): 그날 그 코드를 받은 환자 가운데 @from 전 진료에 그 코드가 없는 환자 수 하나
- `MoneyExtraSql`(@day·@nextDay·@hospital, 수납일 기준): [COO 현금 합, 할인 줄(DOD·DOE·DET·DNI·DN1·DN3·DN5) 현금 합, `OrpRcvBil` 합, TPR 현금+카드+계좌 합] (`notes/bit-codes.md` B절, 비트 수납집계 화면과 같은 칸)
- `InpatientSql`(@from·@to·@hospital): 외래가 아닌 접수 수
- `ReservationKindsSql`·`ReservationPatientsSql`(@from·@to = `RsvDtm` 그날, @hospital = 이어진 접수의 범위): 메모 번호(`RTRIM(RsvRefMem)`)마다 [모두, 내원(`RsvSts='OS'`이고 이어진 접수가 진료 끝남), 바꿈(`RsvLog`에 그 예약 기록 있음), 취소(`RsvSts='OC'`)] / 그날 예약 환자 수(`COUNT(DISTINCT 차트번호)`) 하나
- `MemoKindsSql`(매개변수 없음): DtlMst `RESERVMEMO`의 [번호('Memo'+번호 꼴이면 번호만), 이름]
- `closing.codes`의 코드는 새 문장 없이 `Sql.TrendTotalsSql`(어제까지 365일)·`StatsSql.CodeNamesSql`(이름, 코드마다 첫 줄)을 쓴다

### 3-3 계산 (TASK-3, `ClosingDay.Read(db, scope, date, groups)` · `ClosingCodes.Read(db, scope, today)`)
- 금액: `RevenueDays.Read(db, scope, d, d).Days[0]`을 그대로 쓰고(unconfirmed·splitUnconfirmed인 날은 빠진 칸을 `RevenueSql.FinanceNormal`·`FinanceReceivable` 줄을 확정 검사 없이 그대로 더해 채우고 경고 표시), 그 위에 `RevenueSql.FinanceReceivable`의 미수입금 현금·카드·계좌(4~6번째 칸)를 더 읽어 cash·card·transfer에 더한다. 원 미만은 칸마다 버린다. received = cash + card + transfer
- 사람(그날 번호): 진찰구분은 1 → 3 → 그 밖(0 아님) → 0 차례로 앞선 하나, 만 나이는 첫 진료 값, 코드 집합, 진료 목록. 환자현황·3분류·연령은 requirements 이미 정한 것 3·4 그대로
- 묶음: 코드 집합이 묶음 코드와 겹치는 사람 → patients·3분류, total = 그 사람들 진료 총진료비 합(NULL은 0으로, 그 수를 unpaidVisits에). `warnings.unpaidVisits` = 그날 모든 진료 가운데 NULL 수
- 주사: newPatients = 신환 가운데 injection 묶음 사람, newLines = 그들의 injection 코드 줄 수 합, firstTime = `InjectionFirstSql`(`RevenueSql.HistoryGuard` ≠ 0이면 부르지 않고 null)
- 시간 제한은 `RevenueDays`와 같고, 1년 코드 목록은 `Sql.TrendTimeout`

### 3-4 잇기 (TASK-6)
- `Closing/ClosingCommands.Register(dispatcher, services)`: 두 처리기. 처음에 `HospitalGate.Open(services)`(revenue.days와 같음), groups를 풀어(같은 key 두 번 → E-HELPER-BAD-MESSAGE) 읽고 `Envelope.Result` 하나. `Precheck.Helper/Program.cs`에 한 줄

## 4. 새 확장 `extension-erp/`
| 파일 | 하는 일 | TASK |
|---|---|---|
| `manifest.json` | MV3, 'ERP 마감일지 채우기' 0.1.0, permissions [nativeMessaging, storage], background `background.js`(module), content_scripts [{ matches [`https://erp.minesolution.com/*`], js [`content.js`] }], web_accessible_resources [{ resources [`main.js`·`cells.js`·`fill.js`·`panel.js`·`settings.js`·`types.js`], matches 같은 하나 }], options_page `options.html`, key | 1 |
| `src/types.ts` | 2절 답 모양·`GROUP_KEYS`(2절 차례)·`RSV_ROWS`·`HOST_NAME`·`Settings`·설정 이름 | 1 |
| `src/settings.ts` | `DEFAULTS`, `load()`/`save()`, `toGroups(settings)`(코드 있는 항목만 GROUP_KEYS 차례), `search(codes, text)` | 5 |
| `options.html`·`src/options.ts` | 설정 화면(목업대로) | 5 |
| `src/cells.ts` | `planCells(answer, settings) → Planned[]`(아래 표) | 4 |
| `src/fill.ts` | `findInput(doc, where)`, `putValue(input, text)`, `fillAll(doc, plan) → { filled, missing: string[], unpicked, unknown }` | 4 |
| `src/background.ts` | 통로(요청마다 연결 하나, 120초) | 7 |
| `src/content.ts`(일반 스크립트, `import(chrome.runtime.getURL('main.js'))`만) · `src/main.ts` · `src/panel.ts` | 단추·날짜 읽기·부르기·채우기·안내 | 7 |

- 설정 모양: `{ v: 1, picks: Partial<Record<GroupKey, string[]>>, etcNames: Record<'etc1'|'etc2'|'etc3'|'etc4', string>, reservations: Partial<Record<RsvRow, string[]>> }`. `RsvRow` = injection 주사 · followup 경과 · manual 도수 · eswt 충격파 · clinic 진료예약 · etc 기타(수액,드레싱등). 설정 화면 차례 = GROUP_KEYS 차례 → 예약 6줄
- `Planned = { where: { j: 1, box, row } | { j: 2, card, row, col } | { j: 2, field }, value: string | null, why?: 'unpicked' | 'unknown' }`. 기타 줄의 row는 그 기타 이름(이름이 비면 unpicked)
- 칸 표 (구역 > 줄 ← 값, 고르지 않은 묶음은 unpicked, null은 unknown):
  - 1 환자현황 > 신환·90일초진·재진·물리치료내원·진찰료 산정안함·합계 ← patients.new·first90·return·ptVisit·noExamFee·total
  - 1 진료 · 치료현황 > 씨암·SONO·도수상담·도수치료·충격파(체충)·관절조영술·리푸스·손발톱케어·CT·수술 ← groups[carm·sono·manualConsult·manual·eswt·arthro·lipus·nail·ct·surgery].patients
  - 1 외래 수입 > 외래 총매출·청구액(-)·미수입금(+)·미수발생(-)·비급여·감액·장애인기금(-)·진료수납액·카드수납액(-)·현금수납액(-)·계좌이체액(-)·현불/환불(-) ← money.total·insurer·receivableIn·unpaidNew·noncovered·discount·disabledFund·received·card·cash·transfer·refund
  - 1 입원수입 > 청구·비급여·본인부담금·수납액 ← '0'(inpatientVisits가 0일 때만, 아니면 unknown)
  - 2 예약 > 주사·경과·도수·충격파·진료예약·기타(수액,드레싱등) × 총갯수·내원·변경·취소 ← 그 줄에 고른 메모 번호들의 total·visited·changed·canceled 합 / 실예약환자수(첫 열) ← reservations.patients
  - 2 치료별 신환/90일초진/재진 건수 > 씨암(주사)·SONO(주사)·관절조영·도수·충격파·{기타 이름} × 신환·90일초진·재진 ← groups[carm·sono·arthro·manual·eswt·etc1~4]
  - 2 연령별 신환/90일초진/재진 > 10대미만·10대·…·90대 × 신환·90일초진·재진 ← ages['0'…'90']
  - 2 운영 지표 낱칸 > 도수 총금액·충격파 총금액 ← groups[manual·eswt].total · ESWT Standard·ESWT Radial ← groups[eswtStd·eswtRadial].patients · 주사1회환자·신환주사환자·신환주사건수 ← injection.firstTime·newPatients·newLines
  - 2 치료별 매출 > 씨암·SONO·관절조영·도수·충격파·물리치료·{기타 이름} × 금액(원) ← groups[carm·sono·arthro·manual·eswt·pt·etc1~4].total
- 넣는 법: 내용 스크립트 세계에서도 DOM 값은 같다. `Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(el, text)` → `new Event('input', { bubbles: true })`. 금액칸은 '' → input → 숫자 → input → `blur()`(조사 6절). 이 방법이 React 값으로 남는지는 TASK-10에서 실측하고, 안 되면 `fill.ts`만 `execCommand('insertText')`로 바꾼다
- 날짜 읽기: 글자 '마감 일자' label과 같은 줄의 `input.datepicker-input`(aria-label '연도 선택' 아닌 것) 값, 없으면 'YYYY-MM-DD (오늘)' 글자. 화면 안 이동은 0.5초마다 주소를 보거나 `MutationObserver`로 안다
- 서비스 워커는 `sender.id === chrome.runtime.id`이고 cmd가 둘 중 하나일 때만 받는다. 연결이 '없음'·'거절'(옛 도우미는 새 ID를 모른다)로 끊기면 E-HELPER-MISSING로 답한다
- 빌드: `npm run ext-erp:build` → `extension-erp/dist/`(tsc + manifest·options.html 복사). 설치는 기존처럼 압축 파일을 풀어 '압축해제된 확장 프로그램 로드'. 개인키는 두지 않는다(공개키 `key`만으로 ID가 정해진다)

## 5. 결과 안내 경고 줄 (`panel.ts`, 해당할 때만)
- moneyUnconfirmed: '환불·변경수납 등이 있는 날이에요. 외래 수입 8칸(총매출·청구액·비급여·미수입금·진료수납액·카드·현금·계좌)은 비트 수납 줄을 그대로 더한 값이라 다를 수 있어요. 확인해 주세요.' · splitUnconfirmed: '청구액·비급여는 비트에서 딱 나눠지지 않아 그대로 더한 값이에요. 확인해 주세요.'
- unpaidVisits N: '수납이 끝나지 않은 진료 N건이 있어요. 치료별 매출이 적게 나왔을 수 있어요.' · refund > 0: '환불 {금액}원이 있어요. 금액을 확인해 주세요.'
- unknownAge N: '생년월일이 없는 환자 N명은 연령별 표에 넣지 않았어요.' · noHistory: '예전 자료가 따로 있어 주사1회환자는 채우지 않았어요.' · inpatientVisits > 0: '입원 접수가 있어 입원수입 칸은 채우지 않았어요.'
- 늘 끝에: '확인한 뒤 업무일지 1 [전체 저장]과 업무일지 2 [일일 상세 저장]을 눌러 주세요.'

## 위험
- ERP 화면은 공개 화면 파일로만 조사했다. 판이 바뀌면 칸을 못 찾는다 → 그 칸만 '못 찾은 칸'으로 보이고 멈추지 않는다. 금액칸 넣기·날짜 읽기는 TASK-10 실측 전까지 추정이다
- 환불(TPR)은 비트에 한 번도 없어 부호를 모른다 → 양수로 넣는다(음수면 부호를 뗀다). 장애인기금·감액의 줄 고르기는 TASK-9 실측으로 비트 수납집계 화면과 맞춘다
- 새 확장은 새 도우미가 있어야 한다(옛 도우미는 새 ID를 거절). 도우미 새 판은 GitHub에서 만들어 의원 PC에 깔아야 하므로 사용자가 말할 때 한다
