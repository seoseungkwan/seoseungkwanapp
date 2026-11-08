# 인수인계: 청구메모 설정 확장 (기능 ID 제안: `memo-settings`)

> 2026-11-08 클라우드 세션에서 조사·인터뷰까지 마쳤다. 명세(specs/)는 아직 쓰지 않았고, 코드는 하나도 고치지 않았다.
> 다음 Claude는 **2단계(명세 쓰기)**부터 이어 하면 된다. 기준 커밋: `fc81495` (main)

## 0. 진행 규칙 (CLAUDE.md)
- 새 기능은 `/sdd`로 `specs/memo-settings/`에 requirements·design·tasks를 쓰고, 사용자가 `/sdd approve memo-settings`를 직접 입력해야 승인된다. 승인 전에는 구현하지 않는다.
- 화면은 클릭 목업을 먼저 보여 주고 사용자 승인을 받은 뒤에 만든다. 목업 위치 예: `docs/mockups/precheck/`
- 구현은 `/tdd`: 실패하는 시험을 먼저 쓰고 RED를 확인한 뒤 고친다. 시험 이름에 AC ID를 넣는다.
- 환자 자료 구역(`lib/precheck`, `workers` 등)에는 네트워크·저장소·console을 쓰지 않는다. 설정에 들어가는 코드 목록·문구는 환자 자료가 아니다.
- 배포는 사용자에게 마지막에 다시 묻는다.
- 사용자에게는 쉬운 한국어로 짧게 말한다. 전문 용어와 긴 설명은 피한다.

## 1. 시작된 계기
사용자가 청구 화면 '빠지는 사람 > 확인 필요'를 보고 말했다. "약제가 인식이 안 되는 것 같은데, [약 확인]이 나오고 약제 이름에 약이 안 들어가 있어."
- 예: 11/2 진료 3건. 처방에 관절강내 주사(KK090), 척수신경말초지차단술(FNB·SNB), 아라간플러스주가 함께 있다. 메모는 `◈FNB both ◈SNB ◈K-L grade 1/1 [약 확인: 아라간]`이고 연골주사 줄이 없다.
- 원인은 고장이 아니라 규칙이다. AC-014.10(2026-11-01 사용자 결정, `specs/precheck/requirements.md:170`): 같은 날 시술 종류(`procKeys`)가 2개 이상이면 약을 자동으로 넣지 않고 `[약 확인]`만 남긴다. 연골주사약이 'check'면 연골주사 줄도 쓰지 않는다(`engine.ts` `cartilageWritten`·`cartilageHeld`).
- 약 판단 코드: `src/lib/precheck/memo/engine.ts` `drugPlan`(약 920~950줄)
- 우리 병원 시술별 약 값: `src/lib/precheck/memo/ourClinic.json`
  - KK090(IA): 덱사·트리암·조영제·아라간 넣기, 리도카인 빼기
  - KK062(건초내주사): 덱사·트리암·조영제 넣기, 아라간·리도카인 빼기
  - 나머지 시술: 모두 빼기

## 2. 사용자에게 이미 알려 준 것
- **아라간:** 설정 → 시술별 문구와 약 → 관절강내 주사(KK090) → 아라간 '빼기'로 바꾸면 `[약 확인: 아라간]`이 없어지고 연골주사 줄이 다시 나온다. 사용자가 직접 할 수 있는 설정이다. 사용자 말: "아라간은 안 넣어도 되고 트리암·덱사가 들어가야 해."
- **트리암·덱사:** 시술 2개 이상인 날에는 지금 규칙으로 늘 `[약 확인]`이다. 그래서 아래 3-6처럼 규칙을 바꾸기로 했다.

## 3. 사용자가 정한 것 (인터뷰 결과, 모두 확정)
1. **비트 처방코드 전체 불러오기.** 코드마다 정하는 것:
   - 메모에 쓸 이름
   - 구분: 시술·약·문구·검사·제외
   - 코드별 메모 문구: 그 코드가 처방되면 넣을 줄
   - 부위: 자동 또는 12개 부위 중 하나
2. **줄 순서.** 처음에는 차트에 적힌 순서다. 사용자가 원하는 코드만 하나하나 순서를 정할 수 있게 한다. 사용자 말: "차트 순이고, 그것도 내가 하나하나 정할 수도 있게 해." 메디코어에도 없던 새 기능이다.
3. **아직 설정하지 않은 코드가 처방되면** 메모에 `[코드 확인: 이름]`을 남기고, 설정 화면에서 '새 코드'로 보여 준다.
4. **메디코어 문구 기능 가져오기:**
   - 시술 이름별 문구(`TPL.byProc`)
   - 부위별 문구(`TPL.byRegion`)
   - 고정 멘트(`TPL.fixedPhrases`: {C-arm} {Sono} {시행함})
   - 표기 규칙 전부: 좌우 기본 표기 `sideMode`, 앞 좌우 적용 `sideSpread`, 코드별 좌우 `sideByCode`, 부위 영어 표기 `siteNames`, 표기 바꾸기 `rename`, 경추 CPB 따로 `splitCpb`, 요추 SNB 따로 `splitSnb`, 시술 줄 나누기 `splitEach`, 무릎 세트 IA 생략 `kneeSetSkipIa`
5. **설정에서 고르는 칸.** 처음 값은 지금 동작과 같게 둔다. 고르기 전에는 메모가 바뀌지 않는다.
   - IA·건초내주사 줄에 좌우 넣기. 지금은 `IA injection of - knee(triam)`처럼 좌우가 없다.
   - 무릎 세트(FNB·SNB + IA) 날에 트리암·덱사가 있으면 IA 줄 쓰기. 지금은 `kneeSetSkipIa`가 켜져 있어 IA 줄을 생략하고, 약은 `[약 확인]`만 남는다.
6. **시술 2개 이상인 날의 약 규칙.** 그 약이 '넣기'인 시술이 딱 하나이고 나머지가 모두 '빼기'면, 그 시술 줄에 자동으로 넣는다. '넣기'가 2곳 이상이거나 정하지 않은 시술이 있으면 지금처럼 `[약 확인]`을 남긴다. 이 방식을 켜고 끄는 칸을 두고 처음 값은 켜 둔다. AC-014.10과 `ProcedureDrugs.tsx:101` 안내 글을 고쳐야 한다.
7. **편의 기능:**
   - 메모 시험해 보기: 차트 글과 처방(코드·수량)을 직접 넣는다. 지금은 가짜 진료 1개로 고정이다(`HospitalPhrases.tsx` `FAKE_VISIT`).
   - 바뀐 부분 비교: 저장 전에 바뀐 칸의 전과 후를 보여 준다. `phrases.ts`에 `diffPhrases`와 칸 이름표(355~364줄)가 이미 있다.
   - 설정 이력과 설정 파일 주고받기는 사용자가 고르지 않았다. 범위 밖이다.
8. **코드 목록 보기.** 처음에는 최근 3개월 안에 처방된 코드만 보이고, '전체 보기'를 누르면 나머지가 나온다.

## 4. 고장 (같이 고치기로 함). 가짜 진료로 엔진을 돌려 확인했다
1. **IA 부위를 무릎·어깨만 읽는다.** `engine.ts` `iaLinesOf`의 `siteOf(v, …, ['shoulder', 'knee'])`(약 1227줄) 때문이다. "Rt ankle IA", "Lt hip IA", "Rt elbow 관절강내 주사"는 `IA injection of - [부위 확인](triam)`으로 나온다. 발목·팔꿈치·고관절 등도 읽게 한다.
2. **같은 날 아라간 + 트리암 IA를 하면 트리암이 표시 없이 사라진다.** 예: 차트 `Rt knee 아라간 2차` / `Lt knee IA triam`, 처방 KK090×2·A49·A21이면 `◈우측 슬관절 강내 연골주사 2회차`만 나온다.
   - 원인(추정): `iaKind`가 'ara'면 `iaLinesOf`는 연골주사 줄만 쓴다.
   - `drugPlan`은 트리암을 `afterProc`에 넣지만, 'ara'인 날은 그 약을 둘 줄이 없다. 약 1410줄 `iaKind(v) === 'ara'`이면 그냥 돌아간다.
   - 그래서 약도 `[약 확인]`도 남지 않는다.

잘 되는 것: 무릎·어깨 IA + 트리암·덱사, 손가락·엄지·손목·어깨 건초내주사 + 약(부위 영어로 나옴, 좌우는 없음).

## 5. 지금 설정 화면에 있는 것과 없는 것
- **있는 것:** `src/components/settings/HospitalPhrases.tsx` 33~55줄, 시술별 약은 `ProcedureDrugs.tsx`
  - 메모 모양: 줄 앞 기호, 좌우 표기, 연골주사 좌우 표기, 레벨 이어 쓰기, 줄 나눔, 약 모양, 약 양 단위, 양도 쓰기
  - 시술 문구 11개: main, mainCentral, mainPeripheral, cpb, snb, icnb, ara, klg, iaAra, iaEtc, ts
  - 사유 2개(itv, ia2)와 주사 간격 일수
- **엔진은 쓰는데 화면에 없는 것:** mainCentralCodes, sentence, twoSiteRules, intervalCodes, reasonPriority, sideByCode, rename, byRegion, byProc, splitEach, fixedPhrases, siteNames, kneeSetSkipIa, splitCpb, splitSnb, sideMode, sideSpread
- **코드 사전:** `CODEMAP`은 `src/lib/precheck/data/codeMap.json`에 20개뿐이다(시술 15, 약 5). 화면에서 고칠 수 없다. `withPhraseChanges`도 TPL과 procedureDrugs만 고친다.
- 엔진 머리 주석(`engine.ts` 11줄)에 따르면 메디코어의 '병원 모드(`TPL.__catalog`)'는 옮기지 않았다. 그래서 메모는 고정 20개 코드만 본다.

## 6. 처방코드를 어디서 가져올지 (설계 메모, 사용자 미확인)
- 비트 처방코드 전체 목록(코드·이름·종류·사용 여부·표준코드)은 도우미가 이미 읽는다.
  - 도우미: `helper/src/Precheck.Core/Claim/CatalogRead.cs`
  - `claim.month` 응답의 `catalog`로 오고, 사이트에서는 `src/lib/precheck/shape.ts` `readCatalog`가 받는다.
  - 점검 규칙(`rules/run.ts` `catalogEntry`)만 쓰고, 메모 엔진은 쓰지 않는다.
- 도우미에는 처방코드 목록만 따로 읽는 명령이 없다. `src/lib/bridge/commands.json`에 있는 명령은 hello, bit.check, bit.register, claim.dates, claim.month, claim.memos, store.load, store.save, bit.input다.
- **새 도우미 배포 없이 갈 수 있는 길:** 통계 일별 자료(서버, `DayPayload.rx`)에 날마다 처방된 코드·이름·종류(type)·환자 수가 들어 있다. `src/components/stats/useRxCatalog.ts`가 `readDays`로 읽는다.
  - 최근 3개월 목록: 이 자료에서 처방된 코드를 모으면 된다.
  - '전체 보기': 저장된 통계 전체 기간의 코드로 하면 된다.
  - 한 번도 처방되지 않은 비트 코드까지 보여 주려면 `claim.month`의 catalog나 새 도우미 명령이 필요하다. 이 차이를 사용자에게 한 번 확인할 것.
- 코드별 설정은 지금처럼 병원 설정(`claim_hospital_settings.phrases`의 `CODEMAP`)에 저장한다. 메디코어도 그렇게 했다. 환자 자료가 아니다.
- 줄 순서는 새 칸이 필요하다. 예: 코드별 `order?: number`. 순서가 없으면 차트 순서를 따른다.

## 7. 메디코어(옛 앱) 참고 위치
- 저장소: `seoseungkwan/shared`
- 파일: `MediCore_사전점검/assets/mx999_v22.html` (13,538줄)
- 설정 창 `NEW_MEDICORE_OPEN_HOSPITAL_SETTINGS`(10772~11999줄)의 탭: 전체 설정 / 기본 문구 / 시술별 문구 / 보조 문구 / 부위별 문구 / 처방코드 / 표기 규칙 / 메모 시험해 보기 / 설정 주고받기
- **문구 칸마다:** 자동 채움 단추(토큰), 기본값 되돌리기, 칸 이름 바꾸기(`__labels`). 10952줄
- **처방코드 탭** `renderCodes`(11195줄), 50개씩, 찾기. 코드마다:
  - 메모에 표시할 이름(n), 구분(k: proc/drug/note/lab/skip), 부위(rg)
  - 코드별 메모 문구(memo): `noteLines` 3959줄
  - 처방에 있고 메모에서 빠지면 자동 보충(add)
  - C-Arm·주사약·국소마취제·스테로이드·연골주사 체크
  - 연골주사 청구 문구(cartilageMemo), 확인 체크(pendingReview), 코드 삭제(CODEMAP_DEL)
  - 비트 원본 이름·종류 읽기 전용
- **새 코드 추가:** 11259줄. **비트에서 코드 가져오기:** '병원 업데이트' 12322~12444줄, 새 코드는 `pendingReview`.
- **문구가 이기는 차례(3391줄):** byProc(긴 이름 먼저) > byRegion > Central/Peripheral > main
- **메모 줄 순서는 메디코어에서도 바꿀 수 없었다.** fullTextBody 3990~4009줄의 고정 순서:
  1. 부위 묶음(차트 순서)
  2. 묶음 안: 시술 → CPB → SNB → K-L grade
  3. 처방 보충
  4. 코드별 메모
  5. IA 줄
  6. 사유 문장
  - ▲▼ 순서 바꾸기는 필터 단추에만 있었다(7894~8126줄).
- **틀 변수(fill 2265줄, 칸별 허용 목록 10521줄):**
  - 공통: {좌우} {한글방향} {영문방향} {레벨} {부위} {시술} {약제} {KLG} {검사} {기간} {진단} {영상}
  - 칸별: {시술목록} {회차} {KL1} {KL2} {투여량} {코드} {처방명} {표기} {골절}
  - 고정 멘트 토큰
- **메모 시험해 보기:** 차트 글 자유 입력 + "코드 수량" 줄(11572줄). 변경 전후 미리보기(10754줄), 변경 항목 전/후 표(10682·11798줄).

## 8. 다음 할 일
1. 6번의 코드 출처(통계 자료로 충분한지)를 사용자에게 한 번 확인한다.
2. `/sdd memo-settings`로 명세를 쓴다.
   - 일이 크니 TASK를 잘게 나눈다. 예:
     - 엔진 고장 2개
     - 약 규칙
     - 코드 사전 모양과 순서
     - `[코드 확인]`
     - 표기 칸
     - 설정 화면 묶음들
   - AC-014.10을 바꾸는 것은 명세에 적는다.
   - 골든 시험(`golden.test.ts` `knownDiffs`)도 함께 다룬다.
3. 설정 화면 클릭 목업을 만들어 승인받는다. 메디코어처럼 탭으로 나누는 방식을 제안할 만하다.
4. 승인 뒤 `/tdd`로 구현하고, 배포는 사용자에게 묻는다.

## 9. 참고: 가짜 진료로 엔진 돌리는 법
- 이 클라우드에서는 `xlsx` CDN이 막혀 `npm ci`가 실패했다. 그래서 esbuild로 `src/lib/precheck/memo/index.ts`를 묶어 node로 돌렸다.
- PC에서는 `npx vitest run src/lib/precheck/memo/drugs.test.ts`처럼 기존 시험 방식(`ourClinicPhrases()` + `prepareVisit` + `fullText`)을 쓰면 된다.
