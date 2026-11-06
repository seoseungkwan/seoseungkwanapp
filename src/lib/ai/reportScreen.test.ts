import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReportCard } from '@/types/aiReport'
import {
  canGoNext,
  canGoPrev,
  compareLine,
  compareMonths,
  firstMonth,
  longMonth,
  madeAtText,
  modelName,
  partialNotice,
  REPORT_FIRST_MONTH,
  reportCopyText,
  shortMonth,
  usageText,
} from './reportScreen'

// 화면 글자를 만드는 순수 함수(spec ai-report-screen REQ-703). 글자는 requirements.md가 기준이다

describe('REPORT_FIRST_MONTH · firstMonth', () => {
  it('AC-703.1 고를 수 있는 처음 달은 2026-01이다', () => {
    expect(REPORT_FIRST_MONTH).toBe('2026-01')
  })

  it('AC-703.1 오늘 2026-11-18이면 첫 달은 지난달 2026-10이다', () => {
    expect(firstMonth('2026-11-18')).toBe('2026-10')
  })

  it('AC-703.1 지난달이 처음 달이면 그 달이고, 처음 달보다 앞이 되면 처음 달이다', () => {
    expect(firstMonth('2026-02-01')).toBe('2026-01')
    expect(firstMonth('2026-01-15')).toBe('2026-01') // 지난달 2025-12 → 처음 달
    expect(firstMonth('2025-06-30')).toBe('2026-01')
  })

  it('AC-703.1 해가 바뀌는 1월의 지난달은 앞 해 12월이다', () => {
    expect(firstMonth('2027-01-01')).toBe('2026-12')
  })
})

describe('canGoPrev · canGoNext', () => {
  it('AC-703.2 이번 달에서는 다음 달로 못 간다', () => {
    expect(canGoNext('2026-11', '2026-11-18')).toBe(false)
    expect(canGoNext('2026-11', '2026-11-01')).toBe(false)
    expect(canGoNext('2026-11', '2026-11-30')).toBe(false)
  })

  it('AC-703.2 처음 달 2026-01에서는 이전 달로 못 간다', () => {
    expect(canGoPrev('2026-01')).toBe(false)
  })

  it('AC-703.2 그 사이에서는 둘 다 간다', () => {
    for (const month of ['2026-02', '2026-09', '2026-10']) {
      expect(canGoPrev(month)).toBe(true)
      expect(canGoNext(month, '2026-11-18')).toBe(true)
    }
  })

  it('AC-703.2 처음 달에서 다음 달로, 이번 달에서 이전 달로는 간다', () => {
    expect(canGoNext('2026-01', '2026-11-18')).toBe(true)
    expect(canGoPrev('2026-11')).toBe(true)
  })

  it('AC-703.2 해가 바뀌어도 달 순서대로 본다', () => {
    expect(canGoNext('2026-12', '2027-01-01')).toBe(true)
    expect(canGoNext('2027-01', '2027-01-01')).toBe(false)
    expect(canGoPrev('2027-01')).toBe(true)
  })
})

describe('longMonth · shortMonth · compareMonths · compareLine', () => {
  it('AC-703.3 달 글자는 앞의 0 없이 쓴다', () => {
    expect(longMonth('2026-10')).toBe('2026년 10월')
    expect(longMonth('2026-01')).toBe('2026년 1월')
    expect(shortMonth('2026-10')).toBe('10월')
    expect(shortMonth('2026-01')).toBe('1월')
  })

  it('AC-703.3 달 2026-10을 견주는 글은 "2026년 10월을 9월, 작년 10월과 견줘요"다', () => {
    expect(compareMonths('2026-10')).toBe('9월, 작년 10월')
    expect(compareLine('2026-10')).toBe('2026년 10월을 9월, 작년 10월과 견줘요')
  })

  it('AC-703.3 달 2026-01은 지난달 자리가 "작년 12월"이다', () => {
    expect(compareMonths('2026-01')).toBe('작년 12월, 작년 1월')
    expect(compareLine('2026-01')).toBe('2026년 1월을 작년 12월, 작년 1월과 견줘요')
  })

  it('AC-703.3 2월의 지난달은 올해 1월이고 12월의 지난달은 올해 11월이다', () => {
    expect(compareMonths('2026-02')).toBe('1월, 작년 2월')
    expect(compareMonths('2026-12')).toBe('11월, 작년 12월')
  })
})

describe('madeAtText', () => {
  const NOW = new Date('2026-11-18T00:00:00.000Z')
  const originalTz = process.env.TZ

  afterEach(() => {
    process.env.TZ = originalTz
  })

  it('AC-703.4 차이가 60초 미만이면 "방금 만들었어요"다', () => {
    expect(madeAtText('2026-11-18T00:00:00.000Z', NOW)).toBe('방금 만들었어요')
    expect(madeAtText('2026-11-17T23:59:00.001Z', NOW)).toBe('방금 만들었어요') // 59.999초 전
  })

  it('AC-703.4 차이가 딱 60초면 "방금"이 아니라 한국 시각이다', () => {
    expect(madeAtText('2026-11-17T23:59:00.000Z', NOW)).toBe('11월 18일 오전 8:59에 만들었어요')
  })

  it('AC-703.4 저장 시각이 조금 미래여도 "방금"이고, 60초 이상 미래면 한국 시각이다', () => {
    expect(madeAtText('2026-11-18T00:00:30.000Z', NOW)).toBe('방금 만들었어요')
    expect(madeAtText('2026-11-18T00:00:59.999Z', NOW)).toBe('방금 만들었어요')
    expect(madeAtText('2026-11-18T00:01:00.000Z', NOW)).toBe('11월 18일 오전 9:01에 만들었어요')
  })

  it('AC-703.4 60초 이상이면 "11월 2일 오전 9:12에 만들었어요"처럼 한국 시각이다', () => {
    expect(madeAtText('2026-11-02T00:12:00.000Z', NOW)).toBe('11월 2일 오전 9:12에 만들었어요')
  })

  it('AC-703.4 낮 12시는 "오후 12:00", 밤 0시는 "오전 12:00"이다', () => {
    expect(madeAtText('2026-11-02T03:00:00.000Z', NOW)).toBe('11월 2일 오후 12:00에 만들었어요')
    expect(madeAtText('2026-11-01T15:00:00.000Z', NOW)).toBe('11월 2일 오전 12:00에 만들었어요')
  })

  it('AC-703.4 낮 12시 앞뒤와 밤 0시 앞뒤의 오전·오후가 맞다', () => {
    expect(madeAtText('2026-11-02T02:59:00.000Z', NOW)).toBe('11월 2일 오전 11:59에 만들었어요')
    expect(madeAtText('2026-11-02T03:01:00.000Z', NOW)).toBe('11월 2일 오후 12:01에 만들었어요')
    expect(madeAtText('2026-11-02T04:00:00.000Z', NOW)).toBe('11월 2일 오후 1:00에 만들었어요')
    expect(madeAtText('2026-11-02T14:59:00.000Z', NOW)).toBe('11월 2일 오후 11:59에 만들었어요')
  })

  it('AC-703.4 분은 늘 두 자리다', () => {
    expect(madeAtText('2026-11-02T00:05:00.000Z', NOW)).toBe('11월 2일 오전 9:05에 만들었어요')
    expect(madeAtText('2026-11-02T04:00:00.000Z', NOW)).toContain('1:00에')
  })

  it('AC-703.4 한국 날짜가 UTC와 달라지는 순간은 한국 날짜로 쓴다', () => {
    expect(madeAtText('2026-11-01T15:30:00Z', NOW)).toBe('11월 2일 오전 12:30에 만들었어요')
    expect(madeAtText('2026-10-31T15:30:00Z', NOW)).toBe('11월 1일 오전 12:30에 만들었어요') // 달이 바뀜
    expect(madeAtText('2026-12-31T15:05:00Z', new Date('2027-01-05T00:00:00Z'))).toBe(
      '1월 1일 오전 12:05에 만들었어요', // 해가 바뀜
    )
  })

  it('AC-703.4 DB가 주는 +00:00 꼴의 시각도 같은 글이다', () => {
    expect(madeAtText('2026-11-01T15:30:00+00:00', NOW)).toBe('11월 2일 오전 12:30에 만들었어요')
    expect(madeAtText('2026-11-01T15:30:00.123456+00:00', NOW)).toBe('11월 2일 오전 12:30에 만들었어요')
  })

  it.each([
    ['Asia/Seoul', -540],
    ['UTC', 0],
    ['America/Los_Angeles', 420],
  ])('AC-703.4 컴퓨터 시간대가 %s여도 같은 글이다', async (tz, offset) => {
    process.env.TZ = tz
    // 시간대가 실제로 바뀌었는지 함께 본다(안 바뀌면 이 시험은 아무것도 확인하지 않는다)
    expect(new Date(Date.UTC(2026, 9, 1)).getTimezoneOffset()).toBe(offset)
    // 시각 변환기는 파일을 불러올 때 한 번 만들어지므로, 바꾼 시간대에서 파일을 다시 불러와 본다
    vi.resetModules()
    const reloaded = await import('./reportScreen')
    expect(reloaded.madeAtText('2026-11-01T15:30:00Z', NOW)).toBe('11월 2일 오전 12:30에 만들었어요')
    expect(reloaded.madeAtText('2026-11-02T00:12:00Z', NOW)).toBe('11월 2일 오전 9:12에 만들었어요')
    expect(reloaded.madeAtText('2026-11-02T03:00:00Z', NOW)).toBe('11월 2일 오후 12:00에 만들었어요')
  })
})

describe('modelName', () => {
  it('AC-703.5 claude-opus-5-5는 "Claude Opus 5.5"다', () => {
    expect(modelName('claude-opus-5-5')).toBe('Claude Opus 5.5')
  })

  it.each(['claude-opus-5', 'claude-opus-4-8', 'some-fallback-model', 'constructor', ''])(
    'AC-703.5 그 밖의 모델 이름 "%s"는 받은 글자 그대로다',
    (model) => {
      expect(modelName(model)).toBe(model)
    },
  )
})

describe('usageText', () => {
  it('AC-703.6 입력 10,000 + 출력 4,060 토큰·3회·비용 120,000은 "3회"·"14,060개"·"$0.12"다', () => {
    expect(usageText({ calls: 3, tokens: 10_000 + 4_060, costMicroUsd: 120_000 })).toEqual({
      calls: '3회',
      tokens: '14,060개',
      cost: '$0.12',
    })
  })

  it('AC-703.6 사용량이 없는 달은 "0회"·"0개"·"$0.00"이다', () => {
    expect(usageText({ calls: 0, tokens: 0, costMicroUsd: 0 })).toEqual({
      calls: '0회',
      tokens: '0개',
      cost: '$0.00',
    })
  })

  it.each([
    [1_999_999, '$1.99'], // 올리면 $2.00
    [9_999, '$0.00'], // 1센트가 안 됨
    [5_000, '$0.00'], // 올리면 $0.01
    [10_000, '$0.01'],
    [15_000, '$0.01'], // 올리면 $0.02
    [290_000, '$0.29'], // 소수로 계산하면 0.29 × 100 = 28.999…
    [1_000_000, '$1.00'],
    [1_050_000, '$1.05'], // 센트는 두 자리
    [123_456_789, '$123.45'],
  ])('AC-703.6 비용 %i은 센트 아래를 버려 %s다', (micro, cost) => {
    expect(usageText({ calls: 1, tokens: 1, costMicroUsd: micro }).cost).toBe(cost)
  })

  it('AC-703.6 횟수와 토큰은 세 자리마다 쉼표를 쓴다', () => {
    const text = usageText({ calls: 1_234, tokens: 12_000_000, costMicroUsd: 0 })
    expect(text.calls).toBe('1,234회')
    expect(text.tokens).toBe('12,000,000개')
  })
})

describe('reportCopyText', () => {
  const card = (tag: ReportCard['tag'], text: string, basis: string): ReportCard => ({
    tag,
    text,
    basis,
    metric: 'total.newPatients',
  })

  it('AC-703.7 달 보고, 빈 줄, 요약, 빈 줄, 카드마다 "[꼬리표] 문장" 다음 줄에 근거 줄이고 카드 사이는 빈 줄이다', () => {
    const text = reportCopyText({
      month: '2026-10',
      summary: '신환이 늘었어요.',
      cards: [
        card('up', '신환이 늘었습니다.', '근거 · 신환 9월 100명 → 10월 120명 · 작년 10월 90명'),
        card('down', '재진이 줄었습니다.', '근거 · 재진 9월 90명 → 10월 80명 · 작년 10월 85명'),
        card('watch', '도수치료를 살펴봅니다.', '근거 · 도수치료 9월 10명 → 10월 12명 · 작년 10월 11명'),
        card('guess', '날씨 탓일 수 있습니다.', '근거 · 전체 9월 200명 → 10월 210명 · 작년 10월 190명'),
      ],
    })
    expect(text).toBe(
      [
        '2026년 10월 보고',
        '',
        '신환이 늘었어요.',
        '',
        '[늘었어요] 신환이 늘었습니다.',
        '근거 · 신환 9월 100명 → 10월 120명 · 작년 10월 90명',
        '',
        '[줄었어요] 재진이 줄었습니다.',
        '근거 · 재진 9월 90명 → 10월 80명 · 작년 10월 85명',
        '',
        '[살펴볼 것] 도수치료를 살펴봅니다.',
        '근거 · 도수치료 9월 10명 → 10월 12명 · 작년 10월 11명',
        '',
        '[추정] 날씨 탓일 수 있습니다.',
        '근거 · 전체 9월 200명 → 10월 210명 · 작년 10월 190명',
      ].join('\n'),
    )
  })

  it('AC-703.7 카드는 저장된 순서 그대로이고 달 글자는 앞의 0 없이 쓴다', () => {
    const text = reportCopyText({
      month: '2026-01',
      summary: '요약',
      cards: [card('guess', '가', '근거 가'), card('up', '나', '근거 나')],
    })
    expect(text).toBe('2026년 1월 보고\n\n요약\n\n[추정] 가\n근거 가\n\n[늘었어요] 나\n근거 나')
  })

  it('AC-703.7 카드가 없으면 요약에서 끝나고 뒤에 빈 줄이 붙지 않는다', () => {
    expect(reportCopyText({ month: '2026-10', summary: '요약', cards: [] })).toBe('2026년 10월 보고\n\n요약')
  })
})

describe('partialNotice', () => {
  it('AC-703.8 partial이고 고른 달이 이번 달이면 칩은 "진행 중"이고 아직 끝나지 않은 달이라는 안내다', () => {
    expect(partialNotice({ month: '2026-11', partial: true }, '2026-11-18')).toEqual({
      chip: '진행 중',
      title: '11월은 아직 끝나지 않은 달이에요',
      body: '숫자가 적게 보일 수 있어요. 달이 끝난 뒤 다시 분석하면 다 찬 숫자로 써요.',
    })
  })

  it('AC-2008.1 partial이고 그 달이 이미 지났으면 칩은 "덜 찬 숫자"이고 통계 탭에서 다시 불러온 뒤 [다시 분석]하라는 안내다', () => {
    expect(partialNotice({ month: '2026-10', partial: true }, '2026-11-18')).toEqual({
      chip: '덜 찬 숫자',
      title: '이 리포트는 10월 숫자가 다 차기 전에 만들었어요',
      body: '숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.',
    })
  })

  it('AC-2008.1 해가 바뀌는 달(12월 리포트를 다음 해 1월에 봄)도 같은 안내다', () => {
    expect(partialNotice({ month: '2026-12', partial: true }, '2027-01-05')).toEqual({
      chip: '덜 찬 숫자',
      title: '이 리포트는 12월 숫자가 다 차기 전에 만들었어요',
      body: '숫자가 적게 잡혀 있을 수 있어요. 통계 탭에서 그 달을 다시 불러온 뒤 [다시 분석]을 눌러 주세요.',
    })
  })

  it('AC-703.8·AC-2008.1 안내의 달 자리에는 그 달 이름이 들어간다(shortMonth)', () => {
    expect(partialNotice({ month: '2026-02', partial: true }, '2026-02-10')?.title).toBe(
      '2월은 아직 끝나지 않은 달이에요',
    )
    expect(partialNotice({ month: '2026-11', partial: true }, '2026-12-05')?.title).toBe(
      '이 리포트는 11월 숫자가 다 차기 전에 만들었어요',
    )
  })

  it('AC-703.8·AC-2008.1 달의 마지막 날까지는 이번 달이고 다음 달 1일부터 지난 달이다', () => {
    expect(partialNotice({ month: '2026-11', partial: true }, '2026-11-30')?.chip).toBe('진행 중')
    expect(partialNotice({ month: '2026-11', partial: true }, '2026-12-01')?.chip).toBe('덜 찬 숫자')
    expect(partialNotice({ month: '2026-12', partial: true }, '2027-01-01')?.chip).toBe('덜 찬 숫자')
  })

  it('AC-2008.2 이번 달 partial 안내와 partial false의 null은 그대로다', () => {
    expect(partialNotice({ month: '2026-11', partial: true }, '2026-11-06')).toEqual({
      chip: '진행 중',
      title: '11월은 아직 끝나지 않은 달이에요',
      body: '숫자가 적게 보일 수 있어요. 달이 끝난 뒤 다시 분석하면 다 찬 숫자로 써요.',
    })
    expect(partialNotice({ month: '2026-10', partial: false }, '2026-11-06')).toBeNull()
  })

  it('AC-703.8 partial이 false면 칩·안내가 없다', () => {
    expect(partialNotice({ month: '2026-11', partial: false }, '2026-11-18')).toBeNull()
    expect(partialNotice({ month: '2026-10', partial: false }, '2026-11-18')).toBeNull()
  })
})
