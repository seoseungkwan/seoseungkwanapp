import { describe, expect, it } from 'vitest'
import type { ReportInput, ReportMetric } from '@/types/aiReport'
import { basisLine } from './basis'

// 시험 자료는 여기서 손으로 만든 가짜 숫자다. 비교 달(prevMonth·lastYearMonth)은 buildReportInput이 이미 계산해 둔 값처럼 적는다

type Values = ReportMetric['values']

const count = (label: string, selected: number | null, prev: number | null, lastYear: number | null): ReportMetric => ({
  id: 'total.newPatients',
  label,
  kind: 'count',
  values: { selected, prev, lastYear },
})

const rate = (values: Values): ReportMetric => ({
  id: 'revisit.within7',
  label: '신환 7일 재방문율',
  kind: 'rate',
  values,
})

const october = (over: Partial<Pick<ReportInput, 'hasPrev' | 'hasLastYear'>> = {}): ReportInput => ({
  month: '2026-10',
  partial: false,
  prevMonth: '2026-09',
  lastYearMonth: '2025-10',
  hasPrev: true,
  hasLastYear: true,
  metrics: [],
  ...over,
})

const january: ReportInput = {
  month: '2026-01',
  partial: false,
  prevMonth: '2025-12',
  lastYearMonth: '2025-01',
  hasPrev: true,
  hasLastYear: true,
  metrics: [],
}

describe('basisLine — 근거 줄 (REQ-506)', () => {
  it('AC-506.1 신환 근거 줄은 "근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명"', () => {
    expect(basisLine(count('신환', 524, 486, 470), october())).toBe('근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 470명')
  })

  it('AC-506.2 지난달 값이 null이면 그 자리가 "9월 자료 없음"', () => {
    expect(basisLine(count('신환', 524, null, 470), october({ hasPrev: false }))).toBe(
      '근거 · 신환 9월 자료 없음 → 10월 524명 · 작년 10월 470명',
    )
  })

  it('AC-506.2 작년 같은 달 값이 null이면 그 자리가 "작년 10월 자료 없음"', () => {
    expect(basisLine(count('신환', 524, 486, null), october({ hasLastYear: false }))).toBe(
      '근거 · 신환 9월 486명 → 10월 524명 · 작년 10월 자료 없음',
    )
  })

  it('AC-506.2 비교 달 둘 다 null이면 둘 다 "자료 없음"', () => {
    expect(basisLine(count('신환', 524, null, null), october({ hasPrev: false, hasLastYear: false }))).toBe(
      '근거 · 신환 9월 자료 없음 → 10월 524명 · 작년 10월 자료 없음',
    )
  })

  it('AC-506.2 고른 달이 1월이면 지난달은 "작년 12월"', () => {
    expect(basisLine(count('신환', 524, 486, 470), january)).toBe('근거 · 신환 작년 12월 486명 → 1월 524명 · 작년 1월 470명')
  })

  it('AC-506.2 고른 달이 1월이고 지난달 자료가 없으면 "작년 12월 자료 없음"', () => {
    expect(basisLine(count('신환', 524, null, 470), { ...january, hasPrev: false })).toBe(
      '근거 · 신환 작년 12월 자료 없음 → 1월 524명 · 작년 1월 470명',
    )
  })

  it('AC-506.3 design 예: "근거 · 신환 7일 재방문율 9월 41.2% → 10월 집계 중 · 작년 10월 자료 없음"', () => {
    expect(basisLine(rate({ selected: null, prev: 0.41234, lastYear: null }), october({ hasLastYear: false }))).toBe(
      '근거 · 신환 7일 재방문율 9월 41.2% → 10월 집계 중 · 작년 10월 자료 없음',
    )
  })

  it('AC-506.3 비율은 소수 첫째 자리까지 버린다(반올림 안 함): 0.41299 → 41.2%, 0.29 → 29.0%', () => {
    expect(basisLine(rate({ selected: 0.29, prev: 0.41299, lastYear: 0.5 }), october())).toBe(
      '근거 · 신환 7일 재방문율 9월 41.2% → 10월 29.0% · 작년 10월 50.0%',
    )
  })

  it('AC-506.3 비율 0과 1은 0.0%·100.0%', () => {
    expect(basisLine(rate({ selected: 1, prev: 0, lastYear: 0.123 }), october())).toBe(
      '근거 · 신환 7일 재방문율 9월 0.0% → 10월 100.0% · 작년 10월 12.3%',
    )
  })

  it('AC-506.3 그 달 자료가 있는데 비율이 null이면 "집계 중"(지난달·작년 같은 달도)', () => {
    expect(basisLine(rate({ selected: 0.3, prev: null, lastYear: null }), october())).toBe(
      '근거 · 신환 7일 재방문율 9월 집계 중 → 10월 30.0% · 작년 10월 집계 중',
    )
  })

  it('AC-506.3 자료 없는 달의 비율은 "자료 없음"', () => {
    expect(basisLine(rate({ selected: 0.3, prev: null, lastYear: null }), october({ hasPrev: false, hasLastYear: false }))).toBe(
      '근거 · 신환 7일 재방문율 9월 자료 없음 → 10월 30.0% · 작년 10월 자료 없음',
    )
  })

  it('AC-506.3 숫자 지표는 그 달 자료가 있어도 null이면 "자료 없음"(집계 중은 비율만)', () => {
    expect(basisLine(count('신환', null, null, null), october())).toBe('근거 · 신환 9월 자료 없음 → 10월 자료 없음 · 작년 10월 자료 없음')
  })

  it('AC-506.4 천 이상 숫자는 세 자리마다 쉼표: 12345 → 12,345명', () => {
    expect(basisLine(count("처방 그룹 '도수치료' 환자", 12345, 1234567, 999), october())).toBe(
      "근거 · 처방 그룹 '도수치료' 환자 9월 1,234,567명 → 10월 12,345명 · 작년 10월 999명",
    )
  })

  it('AC-506.4 0명은 "0명"(자료 있는 달에 그 항목이 없을 때)', () => {
    expect(basisLine(count("처방 'FAKE-주사' 환자", 1000, 0, 0), october())).toBe(
      "근거 · 처방 'FAKE-주사' 환자 9월 0명 → 10월 1,000명 · 작년 10월 0명",
    )
  })
})

// 접수 건수·재진(kind: 'visits')은 사람 수가 아니라 건수다(spec ai-report-stats REQ-2004)
const visits = (label: string, selected: number | null, prev: number | null, lastYear: number | null): ReportMetric => ({
  id: 'total.patients',
  label,
  kind: 'visits',
  values: { selected, prev, lastYear },
})

describe('basisLine — 접수 건수는 "건" (REQ-2004)', () => {
  it('AC-2004.2 visits 근거 줄은 "근거 · 접수 건수 9월 2,480건 → 10월 2,615건 · 작년 10월 2,310건"', () => {
    expect(basisLine(visits('접수 건수', 2615, 2480, 2310), october())).toBe(
      '근거 · 접수 건수 9월 2,480건 → 10월 2,615건 · 작년 10월 2,310건',
    )
  })

  it('AC-2004.2 visits도 천 이상은 세 자리마다 쉼표, 천 미만·0은 쉼표 없이 "건"', () => {
    expect(basisLine(visits('재진', 1234567, 999, 0), october())).toBe('근거 · 재진 9월 999건 → 10월 1,234,567건 · 작년 10월 0건')
  })

  it('AC-2004.2 visits 비교 달 자료가 없으면 "자료 없음"(지난달·작년 같은 달 둘 다)', () => {
    expect(basisLine(visits('접수 건수', 2615, null, null), october({ hasPrev: false, hasLastYear: false }))).toBe(
      '근거 · 접수 건수 9월 자료 없음 → 10월 2,615건 · 작년 10월 자료 없음',
    )
  })

  it('AC-2004.2 visits 값이 null이면 그 달 자료가 있어도 "자료 없음"("집계 중"은 비율만)', () => {
    expect(basisLine(visits('접수 건수', null, null, null), october())).toBe(
      '근거 · 접수 건수 9월 자료 없음 → 10월 자료 없음 · 작년 10월 자료 없음',
    )
  })

  it('AC-2004.2 visits도 고른 달이 1월이면 지난달은 "작년 12월"', () => {
    expect(basisLine(visits('접수 건수', 2615, 2480, 2310), january)).toBe(
      '근거 · 접수 건수 작년 12월 2,480건 → 1월 2,615건 · 작년 1월 2,310건',
    )
  })

  it('AC-2004.2 count는 그대로 "명", rate는 그대로 "%"', () => {
    expect(basisLine(count('신환', 2615, 2480, 2310), october())).toBe('근거 · 신환 9월 2,480명 → 10월 2,615명 · 작년 10월 2,310명')
    expect(basisLine(rate({ selected: 0.5, prev: 0.25, lastYear: null }), october())).toBe(
      '근거 · 신환 7일 재방문율 9월 25.0% → 10월 50.0% · 작년 10월 집계 중',
    )
  })
})

// 원장님 매출(won)·하루 평균 접수(average) 근거 줄 (spec stats-bit-ai AC-2905.1). 글자는 통계 화면 원장님별·시간대별 접수와 같다
describe('basisLine — 원장님 매출·하루 평균 (AC-2905.1)', () => {
  const won = (values: Values): ReportMetric => ({ id: 'doctor:김가상.amount', label: "원장님 '김가상' 매출", kind: 'won', values })
  const average = (values: Values): ReportMetric => ({ id: 'weekday:1', label: "요일 '월' 하루 평균 접수", kind: 'average', values })

  it('AC-2905.1 won은 formatCount(값)원이다(세 자리마다 쉼표, 0이면 0원)', () => {
    expect(basisLine(won({ selected: 12345000, prev: 11000000, lastYear: 0 }), october())).toBe(
      "근거 · 원장님 '김가상' 매출 9월 11,000,000원 → 10월 12,345,000원 · 작년 10월 0원",
    )
  })

  it('AC-2905.1 won이 음수(환불이 더 많은 달)면 통계 화면과 같은 빼기 기호(−)다', () => {
    expect(basisLine(won({ selected: -50000, prev: 0, lastYear: 3000 }), october())).toBe(
      "근거 · 원장님 '김가상' 매출 9월 0원 → 10월 −50,000원 · 작년 10월 3,000원",
    )
  })

  it('AC-2905.1 average는 averageText(값)건이다(소수 한 자리로 반올림: 14.29 → 14.3건, 8.33 → 8.3건, 10 → 10.0건)', () => {
    expect(basisLine(average({ selected: 14.29, prev: 8.33, lastYear: 10 }), october())).toBe(
      "근거 · 요일 '월' 하루 평균 접수 9월 8.3건 → 10월 14.3건 · 작년 10월 10.0건",
    )
  })

  it("AC-2905.1 average가 0이면 '0건'이다(화면 칸의 '–'가 아니다)", () => {
    expect(basisLine(average({ selected: 0.43, prev: 0, lastYear: 0 }), october())).toBe("근거 · 요일 '월' 하루 평균 접수 9월 0건 → 10월 0.4건 · 작년 10월 0건")
  })

  it("AC-2905.1 won·average가 null이면 그 달 자료가 있어도 '자료 없음'이다(비율의 '집계 중'이 아니다)", () => {
    expect(basisLine(won({ selected: 12345000, prev: null, lastYear: null }), october())).toBe(
      "근거 · 원장님 '김가상' 매출 9월 자료 없음 → 10월 12,345,000원 · 작년 10월 자료 없음",
    )
    expect(basisLine(average({ selected: null, prev: null, lastYear: 7.5 }), october())).toBe(
      "근거 · 요일 '월' 하루 평균 접수 9월 자료 없음 → 10월 자료 없음 · 작년 10월 7.5건",
    )
  })
})
