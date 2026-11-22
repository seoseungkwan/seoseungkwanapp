import { describe, expect, it } from 'vitest'
import { FLOW_LIST_MAX } from '@/lib/location/flow'
import {
  FLOW_NOTE,
  areaKm2Text,
  bandsLabel,
  densityPerKm2,
  flowCapped,
  pickedPeople,
  sharePct,
  stationsText,
  stopsText,
} from './text'

// 정형외과 수요·교통·둘레 시설 묶음의 글자 만들기(spec location AC-7909.6, requirements '화면 글 기본값' 후보 자세히)

describe('AC-7909.6: 고른 나이대 이름', () => {
  it('AC-7909.6: 처음 설정(40세 이상 = 칸 4~10)은 `40세 이상`', () => {
    expect(bandsLabel([4, 5, 6, 7, 8, 9, 10])).toBe('40세 이상')
  })

  it('AC-7909.6: 끝까지 이어지면 `{n}세 이상`, 중간에서 끝나면 `{a}~{b}세`, 칸 하나면 그 10세', () => {
    expect(bandsLabel([6, 7, 8, 9, 10])).toBe('60세 이상')
    expect(bandsLabel([2, 3])).toBe('20~39세')
    expect(bandsLabel([4])).toBe('40~49세')
    expect(bandsLabel([10])).toBe('100세 이상')
  })

  it('AC-7909.6: 떨어진 나이대는 이어진 묶음마다 ` · `로 잇는다(차례·겹침 상관없음)', () => {
    expect(bandsLabel([7, 0, 1, 6, 8, 9, 10, 6])).toBe('0~19세 · 60세 이상')
    expect(bandsLabel([1, 3, 5])).toBe('10~19세 · 30~39세 · 50~59세')
  })

  it('AC-7909.6: 모든 칸이면 `모든 나이`, 고른 칸이 없거나 틀린 칸만 있으면 `고른 나이대`', () => {
    expect(bandsLabel([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe('모든 나이')
    expect(bandsLabel([])).toBe('고른 나이대')
    expect(bandsLabel([11, -1, 2.5])).toBe('고른 나이대')
  })
})

describe('AC-7909.6: 고른 나이대 인구·밀도(하루 환자 수 어림 없음)', () => {
  const bands = [1000, 1100, 1200, 1300, 1400, 1500, 1600, 1000, 600, 200, 100]

  it('AC-7909.6: 고른 칸만 더한다(틀린 칸·겹친 칸은 한 번만)', () => {
    expect(pickedPeople(bands, [4, 5, 6, 7, 8, 9, 10])).toBe(6400)
    expect(pickedPeople(bands, [6, 6, 7, 8, 9, 10, 11])).toBe(3500)
    expect(pickedPeople([5, 5], [0, 1, 2])).toBe(10)
  })

  it('AC-7909.6: 1km²당 밀도 = 고른 나이대 인구 ÷ 범위(π × 반지름²) 버림', () => {
    expect(densityPerKm2(6400, 1000)).toBe(2037) // 6,400 ÷ 3.1415…
    expect(densityPerKm2(6400, 300)).toBe(22635) // 6,400 ÷ 0.2827…
    expect(densityPerKm2(0, 3000)).toBe(0)
  })

  it('AC-7909.6: 범위 넓이 글은 km² 소수 첫째 자리 버림(끝 .0 뺌)', () => {
    expect(areaKm2Text(1000)).toBe('3.1')
    expect(areaKm2Text(300)).toBe('0.2')
    expect(areaKm2Text(1500)).toBe('7')
    expect(areaKm2Text(3000)).toBe('28.2')
  })

  it('AC-7909.6: 비율은 버림 정수 %, 전체가 0이면 없음', () => {
    expect(sharePct(6400, 11000)).toBe(58)
    expect(sharePct(3500, 11000)).toBe(31)
    expect(sharePct(5, 0)).toBeNull()
  })
})

describe('AC-7909.6: 사람 흐름 글', () => {
  const stations = [
    { name: '예시역', line: '예시1호선', distM: 180, perDay: 15200 },
    { name: '예시중앙역', line: '예시2호선', distM: 905, perDay: 4100 },
  ]
  const stops = [
    { name: '예시정류장', distM: 60, perDay: 1500 },
    { name: '예시시장앞', distM: 240, perDay: 1200 },
    { name: '예시학교앞', distM: 1380, perDay: 1000 },
  ]

  it('AC-7909.6: 역마다 `{역}({노선}) {거리} · 하루 {n}명`을 ` · `로 잇고, 없으면 `범위 안에 역이 없어요`', () => {
    expect(stationsText(stations)).toBe('예시역(예시1호선) 180m · 하루 15,200명 · 예시중앙역(예시2호선) 905m · 하루 4,100명')
    expect(stationsText([])).toBe('범위 안에 역이 없어요')
  })

  it('AC-7909.6: 정류장은 `정류장 {n}곳 합계 하루 {n}명`, 없으면 `범위 안에 정류장이 없어요`', () => {
    expect(stopsText(stops)).toBe('정류장 3곳 합계 하루 3,700명')
    expect(stopsText([])).toBe('범위 안에 정류장이 없어요')
  })

  it('AC-7909.6: 교통카드 안내 한 줄은 화면 글 기본값 그대로', () => {
    expect(FLOW_NOTE).toBe('교통카드 찍은 사람 수예요(걷는 사람 수와 달라요) · 현금으로 타거나 내릴 때 카드를 안 찍는 곳은 적게 잡혀요')
  })

  it('AC-7909.6: 역·정류장 목록이 한도(60개)에 닿으면 한도 수를 돌려준다(capped 글), 아니면 null', () => {
    const many = Array.from({ length: FLOW_LIST_MAX }, (_, i) => ({ name: `예시정류장${i}`, distM: i * 10, perDay: 10 }))
    expect(flowCapped({ stations, stops })).toBeNull()
    expect(flowCapped({ stations, stops: many })).toBe(FLOW_LIST_MAX)
  })
})
