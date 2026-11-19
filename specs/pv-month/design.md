# 설계: 신환 1명당 탭을 고른 기간의 달로 (pv-month)

## 1. 바뀌는 곳
| 파일 | 바뀜 |
|---|---|
| `src/components/stats/sections/PatientValueSection.tsx` | `export function valueMonthOf(range: Pick<StatsRange, 'current'>): string` — `range.current.to.slice(0, 7)`. 부품 props에 `month?: string`. `value = month === undefined ? values?.at(-1) : values?.find((v) => v.month === month)` |
| `src/components/stats/sections/RevenueSection.tsx` | props에 `valueMonth?: string`, 다섯째 탭 `<PatientValueSection view={bit} groups={groups} month={valueMonth} />` |
| `src/components/stats/sections/StatsSections.tsx` | `<RevenueSection … valueMonth={valueMonthOf(input.range)} />` |

## 2. 글 고르기 (지금 차례 그대로)
기다리는 중 → 불러오지 않음(NOT_HERE) → 옛 도우미(`values` 없음, OLD_HELPER) → 고른 달 줄 없음(NO_FIRST_DAY) → n 0(NOBODY) → 숫자.
`values`가 빈 목록이거나 고른 달 줄이 없으면 같은 NO_FIRST_DAY다(그 달 1일이 불러온 범위 밖).

## 3. 결정
- 달을 고르는 규칙은 끝 날 하나로 한다(`current.to`). 여러 달 기간(최근 90일·12개월·해·직접 날짜)도 끝 달이다 — 지금 '이번 달' 동작과 가장 가깝고, 기간 골라 보기 한 달은 그 달이 된다.
- `valueMonthOf`는 `PatientValueSection.tsx`에 둔다(이 칸만 쓴다). 순수 함수라 `rangeOf`로 만든 진짜 기간으로 시험한다.
- `month`를 주지 않으면 옛 동작(마지막 달)이라 다른 호출·옛 시험이 그대로다.
- `StatsSections.tsx`의 한 줄 연결은 시험 파일이 없어 따로 시험하지 않는다. `valueMonthOf`(AC-7201.1)와 `RevenueSection` 전달(AC-7201.4)을 시험으로 증명한다.

## 4. 위험
- 고른 달 줄이 없는 경우: `StatsRange.load`가 가장 앞 비교 기간이 든 달 1일부터라 끝 날이 든 달 1일은 늘 불러온 범위 안이다. 그래도 Worker 메모리가 다르면 NO_FIRST_DAY 글로 막힌다(숫자를 지어내지 않는다).
