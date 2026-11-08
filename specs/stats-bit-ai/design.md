# 설계: 통계 비트 세 칸을 AI 리포트에

## 한눈에
```
[의원 PC 브라우저]
 비트 → 도우미 v3 → Worker loadJob ──(달마다)──▶ toMonthSections(달 기간)   ← 새 순수 함수, 환자 자료 구역
                                │                    patientMix [전체] · visitHours · doctorStats 재사용
                                ▼
                    view.months(지금) + view.sections(새, 달마다 하나 또는 null)
                                ▼
 StatsScreen → saveStats({ months, days, covered, source, sections }) → stats_months 줄의 새 칸 sections
[서버 app/api/ai]
 loadReportMonths: select('month, payload, sections') → generate: validateMonthSections → buildReportInput(+세 칸 지표) → Claude
```
화면은 바뀌지 않는다. AI 리포트 카드의 근거 줄 글자만 새 지표 것이 더해진다(시안 불필요: 지금 근거 줄과 같은 꼴 `근거 · <이름> <지난달> <값> → <고른 달> <값> · 작년 <달> <값>`).

## 저장 모양 `MonthSections` (`src/types/payload.ts`)
```ts
export type MonthSections = {
  v: 1
  month: string          // 'YYYY-MM' (그 달 줄과 같다)
  partial: boolean       // 그 달 줄과 같다
  mix: {
    people: number                                // 그 달 실환자(차트번호 있는 서로 다른 환자)
    age: { name: string; people: number }[]       // 연령대 열 줄, 화면 차례(AGE_BANDS + 생년월일 없음)
    insurance: { name: string; people: number }[] // 보통 줄 · 5명 이상, 명 큰 차례
    town: { name: string; people: number }[]      // [동] 보통 줄 · 5명 이상, 명 큰 차례(많아야 10)
  }
  hours: {
    openDays: number[]   // 7칸 월~일
    weekdays: number[]   // 7칸 월~일 접수 합
    hours: number[]      // 13칸 8~20시 접수 합
    unknown: number
  }
  doctors: { name: string; patients: number; newPatients: number; amount: number }[] // 화면 차례, single이면 []
}
```
- 요일·시간 칸 하나하나(7×13)는 저장하지 않는다. AI가 쓰는 것은 요일 합·시간 합뿐이다(필요한 것만, CLAUDE.md 보안 규칙).
- 원장님 줄의 내원·1인당 진료비·비중은 저장하지 않는다(AI 지표가 아니다).
- 크기: 줄 수가 많아야 10+α라 1~3KB. DB 한도는 65,536바이트.

## 구성 요소
| 파일 | 일 |
|---|---|
| `supabase/migrations/20261109000000_stats_month_sections.sql` | `alter table stats_months add column sections jsonb` + check(값이 있으면 객체·`v`=1·`month`·`partial`이 줄과 같음·크기 ≤ 65,536, `is true`로 감쌈) + `grant insert (sections), update (sections)` |
| `src/lib/payload/toMonthSections.ts` (새) | `toMonthSections(input): MonthSections[]` — 달 줄 목록(달·partial)과 비트 기억(`BitMemory`의 visits·people·first·doctors·doctorDays), 불러온 범위(오늘까지)를 받아 달마다 셈 기간을 정하고 `patientMix(…, 'all')`·`visitHours`·`doctorStats`를 부른 뒤 저장 모양으로 줄인다. 이름이 `isText`를 못 넘는 줄은 뺀다. 보험의 '보험 모름' 줄(화면은 보통 줄로 그린다)도 뺀다. 원장님 줄은 이름이 진료의 표에 있는 줄(과 '진료의 미지정')만 넣는다 — 이름이 없어 코드로 보이는 줄은 뺀다. 같은 이름이 둘 이상인 보험·동네·원장님 줄은 모두 뺀다 |
| `src/lib/payload/validate.ts` | `validateMonthSections(value): MonthSections \| null` — 열쇠 목록·`v`·달 글자·배열 길이(age 10, openDays·weekdays 7, hours 13, insurance·town·doctors 한도)·수(0 이상 정수, 금액은 안전 정수)·이름(`isText(…, true)`)·묶음 안 이름 겹침 없음·셈이 늘 지키는 관계(연령대 명의 합 = 실환자, 보험·동네 명 ≤ 실환자, 요일 합 = 시간 합, 한 요일 문 연 날 ≤ 5이고 접수가 있을 때만 문 연 날 > 0, 원장님 신환 ≤ 실환자). 금액은 안전 정수(환불로 음수 가능) |
| `src/workers/stats/jobs.ts` | `loadJob`이 `view.sections`를 만든다: v3이고 `view.months`가 있으면 `toMonthSections`, 아니면 `null` |
| `src/types/stats.ts` | `StatsLoaded.sections?: MonthSections[] \| null` — 선택 칸. v3 답이면 늘 있고(못 만들면 `null`), v2 답이면 열쇠가 없다(화면 값을 만드는 지금 시험 자료 `StatsLoaded`가 고치지 않고 그대로 맞게, 2026-11-08 구현 중 고침) |
| `src/components/stats/StatsScreen.tsx` | 비트 저장에 `sections: view.sections`를 더한다(글자 한 군데, 화면 모양 바뀜 없음). 파일 저장 값(`outcome.save`)은 그대로 |
| `src/lib/storage/stats.ts` | `saveStats` 입력에 `sections?: MonthSections[] \| null`. 달 줄마다 같은 달 sections를 `validateMonthSections` + 크기 검사로 고르고, 못 넘거나 없으면 `null`. 파일 출처는 늘 `null` |
| `src/app/api/ai/store.ts` | `select('month, payload, sections')`, `ReportMonths`에 `sections?: { selected, prev, lastYear }`(unknown). loadReportMonths는 늘 채운다(없는 달은 `null`). 타입만 선택 칸이다 — 지금 시험의 `ReportMonths` 가짜 값이 그대로 맞게 |
| `src/app/api/ai/generate.ts` | `currentInput`이 sections를 검사(`validateMonthSections` + 달 같음)하고, 비교 달은 그 달 payload를 견줄 때만 쓴다 |
| `src/lib/ai/input.ts` | `ValidReportMonths.sections?`(선택 칸, 없으면 세 달 모두 없음). 고른 달에 sections가 있을 때만 세 칸 지표를 지금 지표 뒤에 더한다 |
| `src/types/aiReport.ts` | `MetricKind`에 `'won' \| 'average'` |
| `src/lib/ai/basis.ts` | `won` → `formatCount(값)원`, `average` → 0이면 `0건`, 아니면 `averageText(값)건` |
| `src/lib/ai/prompt.ts` | 새 kind 설명과 쓰는 규칙(AC-2905.2). 지금 kind 설명 줄·이름 줄에 이어 쓴다(지시문 판 `ai-report-3`은 그대로 — 지문에 들지 않는다) |
| `src/lib/ai/output.ts` | 숫자 규칙의 이름 예외 `NAME_LABELS`에 새 이름 지표 모양(`age:`·`insurance:`·`town:`·`hour:`·`doctor:`)을 더한다(AC-2905.4). 지표 ID 검사는 그대로 |

## 결정과 이유
- **새 칸(`sections`)을 둔다, payload 안에 넣지 않는다.** payload는 `schemaVersion: 2` 모양을 통계 탭·대시보드·AI가 함께 엄하게 검사한다. 열쇠를 더하면 옛 검사가 줄 전체를 버린다. 새 칸은 그 검사들을 건드리지 않는다.
- **새 표가 아니라 같은 줄의 칸.** 달 줄과 한 번에 쓰여 서로 어긋나지 않고, 완전한 줄 지키기 트리거도 그대로 함께 지킨다.
- **sections 검사에 걸려도 저장은 계속.** 세 칸은 AI에게 더 주는 숫자다. 이 때문에 지금 되던 통계 저장이 깨지면 안 된다(AC-2902.2). 서버도 같은 이유로 그 달 sections만 없는 것으로 본다(AC-2903.2).
- **고른 달에 sections가 없으면 지표를 하나도 더하지 않는다.** 이미 만든 리포트의 지문이 그대로라 '숫자가 바뀌었어요'가 갑자기 뜨지 않는다(AC-2904.1). 고른 달을 비트로 다시 불러오면 그때 지문이 바뀌어 [다시 분석]을 권한다(지금 동작).
- **보험·동네 5명 미만은 저장하지 않는다.** 지금 동네 저장 규칙과 같다. 그래서 비교 달에 줄이 없으면 0이 아니라 `null`이다(AC-2904.3). 원장님은 줄이 없으면 그 달 환자가 없다는 뜻이라 0이다.
- **평균은 소수 둘째 자리 반올림 값을 AI에게 준다.** 금액이 아니라 반올림 금지 규칙과 부딪히지 않는다. 근거 줄 글자는 통계 화면 글(`averageText`, 소수 한 자리)과 같다.
- **원장님 매출 = 통계 화면 원장님별 매출 그대로**(수납일 기준 총진료비 합, AC-2705.2). AI 지시문에도 이 뜻을 적는다.
- 비트 동네(`MonthPayload.regions`)는 지금처럼 비트 달에서 비어 있다. 동네 지표는 `town:`으로 따로 둔다(파일 달 `region:`과 이름이 같아 보여도 섞지 않는다).

## 배포 차례
`feat-helper-batch`(통계 세 칸·새 도우미) 뒤에 얹는다. ① Supabase SQL Editor에 새 마이그레이션 → ② 웹 배포. 마이그레이션 전에 새 웹이 나가면 저장과 AI 리포트 읽기가 모르는 칸 때문에 실패한다. 옛 웹이 새 DB에 저장하면 `sections`를 보내지 않아 옛 값이 남을 수 있다 — 새 웹 배포까지 잠깐이고, 다음 비트 불러오기가 덮는다.

## 위험
- 요청이 커진다: 지표가 많아야 약 70개 더해진다(연령대 10 + 보험 10 + 동네 10 + 요일 7 + 시간 13 + 원장님 3×N). 지금 입력의 두 배 안쪽이라 비용 한도(`cost.ts`) 안이다 → 첫 실행 때 사용량 줄을 본다.
- 원장님 이름·매출이 Anthropic으로 간다(사용자 결정 2026-11-08). 환자 정보는 가지 않는다.
- 세 칸은 비트로 다시 불러온 달부터 생긴다. 지난 달들은 통계 탭에서 그 기간을 다시 불러와야 AI가 본다.
