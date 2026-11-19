# 설계: 신환 1명당 탭을 고른 기간 그대로 (pv-month)

## 1. Worker (환자 자료 구역)
- `src/lib/analytics/patientValue.ts`
  - 셈 칸을 달 열쇠에서 떼어 낸다: `type Span = { from: string; to: string; people: Map<number, Person> }`. 날 → 셈 칸 찾기를 인자 함수로 받는 `countInto(spanOn: (date) => Span | null, input)` 하나가 대상·내원·금액·진료 줄을 센다(지금 `monthValues` 몸통을 옮김).
  - `monthValues`는 달 셈 칸(`monthsOf`) + `countInto`로 지금과 같은 답을 낸다(옛 시험 그대로 통과).
  - 새 `export function periodValue(input: Omit<MonthValueInput, 'range'> & { span: DateRange }): PeriodValue` — 셈 칸 하나(from ≤ date ≤ to) + `countInto` + 같은 `valueOf` 숫자 규칙.
- `src/types/stats.ts`: `export type PeriodValue = PatientValue & { from: string; to: string }`, `BitSectionsView` ready에 `period?: PeriodValue`.
- `src/workers/stats/jobs.ts` `sectionsJob`: `if (bit.pays !== null) { view.values = valuesOf(bit, bit.pays); view.period = periodValue({ days: bit.patientDays, rows: bit.consumption, pays: bit.pays, groups: bit.groups, span: { from, to } }) }`. 묻기 from·to는 이미 메모리 안인지 본 뒤다(밖이면 `none`). 기간마다 새로 센다(메모리 한 번 훑기, `monthValues`와 같은 크기).

## 2. 화면
- `PatientValueSection.tsx`: props `{ view, groups, range }`(range: `StatsRange`). `value = ready ? view.period : undefined`. 글:
  - DESC '고른 기간 신환이 그 기간에 낸 진료비를 받은 치료별로 봐요'
  - 칸 위 줄 `${range.name} 신환 ${people(n)} · ${spanLabel({ from, to }, true)}`
  - 칸 이름 `${short} 신환 1명당 평균` · `${short} 신환 1명당 내원 횟수` · '한 번 올 때 평균'. `short = shortName(range)`: `/^(\d{4})년 (\d{1,2}월)$/`에 맞고 그 해가 `range.load.to`의 해면 둘째 묶음, 아니면 `range.name`
  - FOOT 새 글. NO_FIRST_DAY 글은 지운다
  - 글 고르기 차례: 기다림 → none(NOT_HERE) → `period` 없음(OLD_HELPER) → n 0(NOBODY) → 숫자
- `RevenueSection.tsx`: props `range?: StatsRange`, 다섯째 탭 `<PatientValueSection view={bit} groups={groups} range={range} />`. 탭은 지금처럼 `bit`를 줄 때만 있고, range가 없으면 탭을 두지 않는다(bit와 range를 함께 줄 때만).
- `StatsSections.tsx`: `<RevenueSection … range={input.range} />`.
- `spanLabel`은 `periodPick.ts`에서 가져온다(이미 export).

## 3. 결정
- 숫자는 달 줄을 화면에서 더하지 않고 Worker가 기간으로 다시 센다: 한 사람이 두 달에 신환 표시가 있으면 기간 안에서는 한 명이어야 하고, 평균은 더할 수 없다.
- `values`·`monthValues`는 월간 보고서가 쓰므로 그대로 둔다.
- 칸 이름 짧은 이름 규칙은 화면 글만 바꾼다(비교 글이 오늘과 같은 해면 해를 빼는 것과 같은 뜻).

## 4. 위험
- 기간마다 메모리를 한 번 훑는다(접수·진료·금액 줄). 12개월 메모리도 `monthValues` 한 번과 같은 크기라 기간 바꿀 때 느려지지 않는다.
- 옛 AC-6911.4 화면 시험은 이 탭의 글이 바뀌어 새 AC로 옮긴다(같은 파일). 막대·받은 치료 이름 규칙 시험은 `period`로 데이터만 바꿔 그대로 둔다.
