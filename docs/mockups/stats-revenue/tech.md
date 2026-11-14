# 매출을 통계에 섞기 — 기술 조사 (2026-11-14, 코드만 읽고 씀. 비트 DB에는 붙지 않았다)

## 1. 지금 매출 자료 흐름
- **명령** `revenue.days {from, to}` (`commands.json`: `patient:false`, `maxDays:31`, 숫자 명령이라 조각 없이 봉투 하나). 답은 정확히 `{days, codes}`.
  - `days`: 날마다 한 줄 15칸(`visits`·`newPatients`·`returnVisits`·금액 9칸·`unconfirmed`·`splitUnconfirmed`). 날마다 원본 검사 3개 → 통과한 날만 금액 문장 4개(한 달 ≈ 9초).
  - `codes`: **기간 전체** 코드 합계(`CodeAmounts` 문장 하나, `GROUP BY RTRIM(OdrCod)`, 처방일 `OdrDtm` 기준, 금액 = 일수×수량×단가). 1,000개 넘으면 `_REST`로 합침. 날짜 칸이 없다.
- **서버 표** (`20261101000400_revenue.sql`): `sales_days`(hospital_id·day + 위 15칸 + fetched_at, PK hospital_id+day) · `sales_codes`(hospital_id·**month**·code·name·count·amount·fetched_at, PK hospital_id+month+code) · `rx_groups`(매출 묶음). 모두 RLS·revoke 뒤 승인된 내 병원만.
- **달 단위인 까닭**: `saveMonth`가 답 첫날이 1일인지 보고 그 달 `sales_codes`를 지우고 다시 넣는다 → 코드 합계가 늘 "한 달 전체"여야 해서 읽기도 늘 달 1일~말일(어제까지)이다(`sync.ts dueRange`).
- **화면이 달로 묶는 곳**: `view.ts`의 `periodsFor(month)`(고른 달 · 지난달 같은 기간 · 작년 같은 달), `monthSeries`(13달 막대), `treatmentsBlock`이 `codes.filter(month === 고른 달)`.
- **가져오기**: 열면 `planFetch`(최근 13달 중 빈 날 있는 달, 최근 달부터)로 저절로 읽음 · [다시 가져오기] = 고른 달만 · 가져올 기간 [최근 1년|2년|전체 기간](spec revenue-load-range, 한 달 10초 어림) · 옛 달은 `loadRevenue('2020-01', …)`로 따로 읽음.
- **같이 쓰는 곳**: 업무일지 `useBitFill`이 `revenue.days {from=to=그날}`를 직접 불러 `days`만 쓴다(서버 표는 안 씀). 대시보드는 매출 숫자를 쓰지 않는다(`features.ts` 기능 목차의 `/revenue` 링크 하나뿐). AI 보고도 `sales_*`를 안 읽는다(원장님 매출은 통계 숫자).

## 2. 치료별 매출을 날 단위로
**권장: 새 명령을 만들지 말고 `revenue.days` 답에 셋째 열쇠 `dayCodes`를 더한다.**
- 까닭: 확장(`extension/src/relay.ts`)은 `commands.json`을 묶어 넣어 **모르는 명령을 막는다** → 새 명령이면 확장 새 판(웹스토어 올리기)도 필요. 답 안쪽은 확장이 보지 않으므로 열쇠 추가는 **도우미 새 판만** 있으면 된다. 업무일지는 `days`만 써서 그대로.
- 도우미: 새 문장 `CodeAmountsByDay` = 지금 `CodeAmounts`와 WHERE 같고 `GROUP BY LEFT(o.OdrDtm,8), RTRIM(o.OdrCod)`(이름 없음). `LEFT`는 묶기용 자르기라 무거운 글자 처리가 아니다(통계 문장도 `LEFT(OrpAccDte,8)`을 쓴다). 이름은 지금 `CodeAmounts`(기간 합계) 답에서. C#에서 날별 합 = 기간 합 맞춤 검사, 하루 600코드 넘으면 그날 `_REST`. `ReadOnlyGuard` 허용 목록에 문장 하나 추가.
- 답 모양: `dayCodes: [[날짜, 코드, 건수, 금액|null], …]`(객체보다 작은 배열, 통계 답과 같은 방식). **크기 한도**: 도우미가 한 번에 보내는 글은 1,000,000바이트(`Framing.MaxOutgoing`). 31일 × 300코드 ≈ 9,300줄 × 35바이트 ≈ 330KB라 들어가지만, 의원 실제 "하루 코드 수"를 `ssk-bit-db-probe`로 먼저 재 볼 것. 답 한도는 1만 5천 줄로 두고 넘으면 오류 대신 하루 `_REST`로 접는다. 기존 `codes` 1,000개 한도는 그대로.
- 웹 검사(`revenueResult.ts`): `{days, codes}`(옛 도우미)와 `{days, codes, dayCodes}`(새 도우미) 둘 다 받는다. `dayCodes`가 없으면 = 도우미 예전 판.
- 판: 도우미 `0.6.0` + `versions.ts LATEST_HELPER` 같은 커밋. `MIN_HELPER`(0.3.0)는 그대로 → 다른 도구는 막지 않는다. 0.3.0 이상 도우미는 모두 `revenue.days`를 알므로 "예전 판"이면 매출 합계·추이·급여·건당 진료비는 그대로 되고 **치료별 매출만** 안내(시안 `?s=old-helper`).
- **새 서버 표** `sales_day_codes`(hospital_id uuid default `my_hospital_id()`, day date, code text, count int, amount bigint null, fetched_at; PK hospital_id+day+code). 제약: day ≥ 2000-01-01, code는 지금 코드 모양, count ≥ 0, amount ≥ 0 또는 null. **RLS 켜기 → public·anon·authenticated 모두 revoke → authenticated에 select, insert(day, code, count, amount), delete만 → 정책은 승인된 내 병원 줄만**(sales_codes와 같은 글). 시험: `supabase/revenue.rls.test.ts` 옆에 새 RLS 시험.
  - `sales_days`에 칸 `day_codes boolean not null default false`(그날 치료별 금액을 날 단위로 저장했음).
  - 저장 함수 `save_revenue_range(p_from, p_to, p_days jsonb, p_day_codes jsonb)`(호출한 사람 권한, 한 트랜잭션): 날 줄 upsert(`day_codes = p_day_codes is not null`) → 그 범위 `sales_day_codes` 지우고 넣기. 실패하면 아무것도 안 바뀜. anon 실행 회수.
  - 읽기 함수 `sales_code_totals(p_from, p_to)` → 코드별 합(건수·금액·빠짐 여부). 날×코드 줄을 그대로 읽으면 12개월 보기에서 7만 줄(70쪽)이라 서버에서 더해 몇백 줄만 받는다.
  - 크기: 1년 ≈ 300일 × 150~300코드 = 5~9만 줄. 무료 500MB 안이지만 6년 치면 수십 MB → 하루 한 줄(jsonb) 모양도 대안(제약은 함수로 검사해야 해서 더 번거롭다).
- **옛 자료**: `sales_days`는 그대로 쓴다(이미 날 단위). `sales_codes`(달 합계)는 지우지 않고 읽기만: 보는 기간이 **통째 달**이고 그 달에 날 단위 코드가 없으면 달 합계로 보여 준다(예: 2026년 9월, 12개월). 달 중간이 끼는 기간(최근 30일 등)에 날 단위가 없는 날이 있으면 표에서 빼고 "n일은 치료별로 나눠 저장하지 않아 빠졌어요" 안내(나눔 못 한 날과 같은 모양). 새 도우미로 한 번 불러오면 그 범위는 `day_codes=false`인 날을 다시 읽어 채워진다(다시 읽기 안내 따로 없음). 새로 읽는 쪽은 `sales_codes`에 더 쓰지 않는다.

## 3. 한 단추로 통계 + 매출 읽기
- **연결은 하나**: 확장은 창 하나의 웹 연결만 받는다(`useBridge` 주석). 매출 화면처럼 따로 `useBridge()`를 붙이면 둘째 연결이 `E-BRIDGE-BUSY`. → `useStatsWorker`가 이미 쥔 `useBridge({worker})`의 `call`을 밖으로 내어 `revenue.days`를 같은 연결로 부른다.
- **차례**: 도우미는 한 번에 한 명령 → ① 지금처럼 `planLoad` 조각(`stats.rows`, 800일 이하, 24달씩) 읽기·저장 → ② 매출: `plan.whole` 안에서 `sales_days`가 없거나 `day_codes=false`인 날 + **늘 어제·오늘(오늘 진료 끝일 때)** 을 31일 이하 덩어리로 묶어 차례로 `revenue.days` → `save_revenue_range`. 이제 달 1일에 맞출 까닭이 없어 빈 날만 읽는다.
- **걸리는 시간(어림)**: 비트 매출 읽기 ≈ 하루 0.3초(한 달 9초 실측 기준), 날별 코드 문장은 달마다 1초 안팎 더.
  - 최근 30일(보통): 통계 "빨리 끝나요" + 매출 새 날 1~2일 ≈ 1초. 새 도우미 깐 뒤 처음 한 번은 9/1~11/14(75일) 다시 읽기 ≈ 25초 더.
  - 최근 1년 처음: 통계 1분쯤 + 매출 13달 ≈ 2분. 전체 기간 처음: 통계 4분쯤 + 매출 83달 ≈ 13분(한 번 읽은 날은 남는다).
  - 안내 글: 펼친 설정에 "…의 환자·처방·매출을 함께 읽어요" + "매출은 아직 가져오지 않은 날만 읽어요. 처음 한 번은 한 달에 10초쯤 더 걸려요"(시안). 1년·2년·전체는 지금 `loadHint`에 매출 달 수·분을 더한다.
- **하나만 실패**: 통계 조각이 멈추면 지금 '멈춘 상자' 그대로, 매출은 읽지 않는다(다음 [이어서 불러오기]가 둘 다). 통계는 끝났는데 매출이 실패하면 통계는 저장된 채, 띠 아래 노란 상자 "매출은 읽지 못했어요 … (오류 번호 …)" + [매출만 다시 읽기](시안 `?s=rev-failed`). 그 덩어리만 실패하는 번호(`E-BIT-READ-FAILED`·`E-BRIDGE-BAD-REPLY`·`E-REVENUE-SAVE-FAILED`)는 다음 덩어리를 계속(지금 `syncRevenue` 규칙).
- 업무일지·청구 화면의 매출 읽기는 그대로(각자 화면에서 연결).

## 4. 숫자 뜻이 다른 곳 (한 화면에 같이 보이게 됨)
| 숫자 | 셈 | 새 매출 칸과 다를 때 |
|---|---|---|
| 매출(새 매출 칸·기간 요약) | 수납한 날(회계일) 총진료비 = 원본 `FinanceNormal` + `FinanceReceivable` 첫 칸. **확인 필요한 날**(환불·변경수납·예치금·수납 연결 중복, 음수)은 뺀다 | — |
| 원장님별 매출·1인당 진료비 | 같은 원본 두 문장을 진료의·날로 묶은 `OrpTotAmt` 합. **확인 필요한 날도 더함**(환불이면 음수). 1인당 = 매출 ÷ 내원 | 기간에 확인 필요한 날이 있으면 합계가 다르다(시안: 1억 3,784만 vs 1억 3,261만, 그날 523만 원) |
| 보고 문장 총진료비·건당진료비 | 오늘·어제·이번 달·지난달 **단위**(기간 단추와 무관). 그 날·달에 하루라도 걸리면 금액 전부 '확인 필요'. 월 보고 총환은 넓은 상태 목록(`@daily=0`)이라 분모도 다름 | 기간·셈이 다르다 |
| 치료별 매출 | 처방한 날의 처방 금액(단가×수량×일수). 환불·할인 안 빠짐 | 매출 합계보다 크거나 작다(지금 매출 탭도 안내) |
| 처방 칸 '건' | 같은 날 같은 환자 1건, 빼는 처방·조건 적용 | 치료별 매출의 '처방 n번'(처방 낸 횟수)과 다르다 |
- 안내안(시안에 넣음): 매출 칸 [어떻게 세나요?]에 원장님별·보고 문장과 다를 수 있는 까닭 한 문단 · 원장님별 설명 끝에 "확인 필요한 날(환불 등)도 더해서 위 매출 칸과 다를 수 있어요." · 기간 요약 '확인 필요한 날' 칸 · 치료별 매출의 건수는 '처방 n번'으로 이름을 바꿔 처방 칸 '건'과 가른다.

## 5. 처방 묶음 두 벌
- 지금: 매출 `rx_groups`(이름·코드·차례) / 통계 `stats_rx_groups`(+ `out_codes` 빼는 처방·`cond` 조건). 2026-11-05 사용자 결정으로 따로 두었다. 둘 다 "넣는 처방은 한 묶음에만"이라 금액을 두 번 세지 않는다.
- **권장: 한 벌 = 통계 묶음.** 대시보드·AI 보고도 이미 통계 묶음을 쓴다. 한 화면에 [묶음 고치기]가 둘(서로 다른 묶음)이면 헷갈린다. 매출은 통계 묶음의 **넣는 처방(codes)만** 쓰고 빼는 처방·조건은 쓰지 않는다(금액은 환자·날로 나눠 있지 않아 "그날 같이 받으면 뺀다"를 셀 수 없다). 그래서 '물리치료(빼는 처방 MT20·MT30)'의 매출에는 빼는 처방 규칙이 안 들어간다 → [어떻게 세나요?]에 적음. 묶음이 없으면 지금 통계 제안 묶음(`suggestGroups`, 이미 같이 씀).
- 매출 묶음 화면(`components/revenue/groups/*`)은 없앤다. `rx_groups` 표는 지우지 않고 남겨 두었다가(되돌리기) 나중에 따로 지운다. 옮겨 담기는 하지 않는다(통계 묶음이 이미 있으므로) — 사용자 확인 필요.

## 6. 메뉴·주소·업무일지·대시보드
- `shell/menu.ts`: '매출' 줄과 `MenuHref`의 `/revenue`를 뺀다(주요 메뉴 넷). `shell.test.tsx`·`tabFrame.test.tsx`가 견준다.
- `/revenue`: `next.config`의 `redirects()`로 `/stats`에 보낸다(고정 경로, 서버 코드 아님). 화면은 `?section=revenue`면 매출 칸으로 내려가게(선택).
- 대시보드 `features.ts`: '매출' 줄을 빼고 '통계' 설명에 '매출'을 넣는다(`features.test.ts`). 대시보드는 매출 숫자를 안 쓴다.
- 업무일지: `revenue.days`의 `days` 모양이 그대로라 영향 없음. 검사 함수를 바꿀 때 업무일지 시험(`lib/worklog`·`useBitFill`)을 같이 돌린다.
- 문서: `plan.md` §2-4·`docs/ARCHITECTURE.md` 매출 줄, `docs/revenue/pc-check.md`의 '매출 탭에서 볼 것'을 '통계 매출 칸'으로.

## 7. 일 크기 어림과 위험
- **크기 ≈ 5~6일**(일꾼 기준). Phase 1 도우미(문장·C# 정리·`dayCodes`·시험·0.6.0) ∥ Phase 1 DB(표·칸·함수 둘·RLS 시험) → Phase 2 순수 계산(통계 기간·비교·막대 칸으로 매출 합·급여 나눔·건당·치료별, 옛 달 섞기) → Phase 3 화면(매출 칸 탭 넷·기간 요약 둘째 줄·목차·불러오기 잇기·예전 판/실패 상자) → Phase 4 정리(메뉴·주소·대시보드·매출 화면 지우기·문서).
- 파일: 새 8개쯤(마이그레이션·RLS 시험·`RevenueSection`·순수 계산·시험), 고침 25개쯤, 지움 12개쯤.
- 시험: 지움 — `RevenueScreen.test.tsx`(1,914줄)·`RevenueRange.test.tsx`·`range.test.ts`·`GroupEditor.test.tsx`·`(app)/revenue/page.test.tsx`. 다시 씀 — `revenue/view.test.ts`(1,020줄 → 통계 기간 판), `sync.test.ts`(달 → 빈 날). 고침 — `revenueResult.test.ts`·`revenueCall.test.ts`·`storage/revenue.test.ts`·`supabase/revenue.rls.test.ts`·C# `RevenueDays`·`RevenueCommands`·`ReadOnlyGuard` 시험·`handshake.test.ts`·`StatsScreen.test.tsx`(2,864줄, 불러오기 잇기)·`PeriodSummary.test.tsx`·`DoctorsSection.test.tsx`·`shell.test.tsx`·`tabFrame.test.tsx`·`notReadyPages.test.tsx`·`features.test.ts`.
- **위험**
  1. 답 1MB 한도 — 하루 코드 수를 먼저 잰다(위 2절).
  2. 처음 '전체 기간'은 매출 때문에 13분쯤 더 걸린다(안내 글로 알림, 한 번만).
  3. 한 연결 규칙 — 매출을 따로 연결하면 `E-BRIDGE-BUSY`(위 3절).
  4. 숫자 뜻 차이가 한 화면에 보인다(위 4절 안내).
  5. 옛 달 치료별 매출은 달 단위로만 — 달 중간 기간은 다시 불러오기 전까지 빠진 날 안내.
  6. 매출 탭의 "열면 저절로 가져오기"가 없어진다 → [비트에서 불러오기]를 눌러야 매출이 새로워진다(질문 4).
  7. `sales_days` 칸을 더하면 "칸 목록은 정확히 이것뿐"(AC-004.1) 시험과 `toDbDay` 칸 목록을 같이 바꾼다.
