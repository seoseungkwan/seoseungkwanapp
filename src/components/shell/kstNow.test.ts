import { afterEach, describe, expect, it } from 'vitest'
import { kstNow } from './kstNow'

// 위쪽 띠 한국 시각 (AC-008.6, design.md '한국 시각'). 날짜는 dates.ts(todayInKorea·weekdayOf), 시각은 Asia/Seoul
const at = (iso: string) => new Date(iso)

describe('kstNow', () => {
  const originalTz = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('AC-008.6: "2026년 10월 29일 (목) 09:42 (KST)" 꼴 — 월·일은 앞 0 없이, 시·분은 두 자리', () => {
    expect(kstNow(at('2026-10-29T00:42:00Z'))).toBe('2026년 10월 29일 (목) 09:42 (KST)')
    expect(kstNow(at('2026-01-04T15:05:59Z'))).toBe('2026년 1월 5일 (월) 00:05 (KST)')
  })

  it('AC-008.6: 요일 7개가 모두 맞다(월~일)', () => {
    const days = ['26', '27', '28', '29', '30', '31', '01'].map((d, i) =>
      kstNow(at(`2026-${i === 6 ? '11' : '10'}-${d}T03:00:00Z`)),
    )
    expect(days.map((s) => s.match(/\((.)\)/)?.[1])).toEqual(['월', '화', '수', '목', '금', '토', '일'])
  })

  it('AC-008.6: 한국 자정 경계 — UTC 15:00은 한국 다음 날 00:00, 14:59는 그날 23:59 (24:00이 아니다)', () => {
    expect(kstNow(at('2026-10-28T15:00:00Z'))).toBe('2026년 10월 29일 (목) 00:00 (KST)')
    expect(kstNow(at('2026-10-29T14:59:59Z'))).toBe('2026년 10월 29일 (목) 23:59 (KST)')
    expect(kstNow(at('2026-12-31T15:00:00Z'))).toBe('2027년 1월 1일 (금) 00:00 (KST)')
  })

  it('AC-008.6: 서버 시간대가 UTC여도 한국 시각이다', () => {
    process.env.TZ = 'UTC'
    expect(new Date('2026-10-28T15:30:00Z').getHours()).toBe(15) // 이 시험 안에서 정말 UTC로 바뀌었다
    expect(kstNow(at('2026-10-28T15:30:00Z'))).toBe('2026년 10월 29일 (목) 00:30 (KST)')
  })
})
