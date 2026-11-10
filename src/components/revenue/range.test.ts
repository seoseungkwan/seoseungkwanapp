// 매출 가져올 기간의 글(spec revenue-load-range TASK-2). 글은 requirements.md와 docs/mockups/revenue-load-range/ 그대로다.
// 오늘 2026-11-10 → 최근 달 2026-11(어제 11월 9일까지), 최근 13달의 첫 달 2025-11
import { describe, expect, it } from 'vitest'
import { addMonths } from '@/lib/analytics/dates'
import { SPAN_NAMES, boundText, doneNotice, fetchingBody, spanHint, spanLabel, stoppedLine, timeText } from './range'

const TODAY = '2026-11-10'
const monthsBack = (from: string, count: number) => Array.from({ length: count }, (_, back) => addMonths(from, -back))

describe('AC-3501.2 기간 이름', () => {
  it('AC-3501.2 단추는 최근 1년·최근 2년·전체 기간 차례다', () => {
    expect(SPAN_NAMES).toEqual([
      { key: '1y', name: '최근 1년' },
      { key: '2y', name: '최근 2년' },
      { key: 'all', name: '전체 기간' },
    ])
  })

  it('AC-3501.2 오늘 2026-11-10이면 기간 이름 셋은 시안 글 그대로다', () => {
    expect(spanLabel('1y', TODAY)).toBe('최근 1년(2025년 11월 – 2026년 11월, 13달)')
    expect(spanLabel('2y', TODAY)).toBe('2024년 11월 – 2026년 11월(2년)')
    expect(spanLabel('all', TODAY)).toBe('2020년 1월 – 2026년 11월')
  })

  it('AC-3501.2 오늘이 1일이면 최근 달은 지난달이다', () => {
    expect(spanLabel('1y', '2026-11-01')).toBe('최근 1년(2025년 10월 – 2026년 10월, 13달)')
    expect(spanLabel('2y', '2026-11-01')).toBe('2024년 10월 – 2026년 10월(2년)')
    expect(spanLabel('all', '2026-11-01')).toBe('2020년 1월 – 2026년 10월')
  })
})

describe('AC-3501.3 걸리는 시간', () => {
  it.each([
    [12, '2분쯤 걸려요.'],
    [70, '12분쯤 걸려요.'],
    [6, '1분 안에 끝나요.'],
    [1, '1분 안에 끝나요.'],
    [7, '2분쯤 걸려요.'],
    [25, '5분쯤 걸려요.'],
  ])('AC-3501.3 %i달이면 "%s"(한 달 10초, 분은 올림)', (months, text) => {
    expect(timeText(months)).toBe(text)
  })
})

describe('AC-3501.3 AC-3501.4 안내 줄', () => {
  it('AC-3501.3 최근 2년에 남은 달이 12달이면 그 수와 시간이고 누를 수 있다', () => {
    expect(spanHint('2y', TODAY, 12)).toEqual({
      text: '2024년 11월 – 2026년 11월(2년) 가운데 아직 안 가져온 12달을 가져와요. 2분쯤 걸려요.',
      disabled: false,
    })
  })

  it('AC-3501.3 전체 기간에 남은 달이 70달이면 끝에 처음 한 번만 하면 된다는 말이 붙는다', () => {
    expect(spanHint('all', TODAY, 70)).toEqual({
      text: '2020년 1월 – 2026년 11월 가운데 아직 안 가져온 70달을 가져와요. 12분쯤 걸려요. 한 번 가져온 달은 남으니 처음 한 번만 하면 돼요.',
      disabled: false,
    })
  })

  it('AC-3501.3 최근 1년에 남은 달이 6달이면 1분 안에 끝난다', () => {
    expect(spanHint('1y', TODAY, 6)).toEqual({
      text: '최근 1년(2025년 11월 – 2026년 11월, 13달) 가운데 아직 안 가져온 6달을 가져와요. 1분 안에 끝나요.',
      disabled: false,
    })
  })

  it('AC-3501.4 최근 1년에 남은 달이 없으면 저절로 가져온다는 말이고 막힌다', () => {
    expect(spanHint('1y', TODAY, 0)).toEqual({
      text: '최근 1년(2025년 11월 – 2026년 11월, 13달)은 다 가져와 있어요. 화면을 열 때마다 새로 생긴 날을 저절로 가져와요.',
      disabled: true,
    })
  })

  it('AC-3501.4 최근 2년·전체 기간에 남은 달이 없으면 다 가져와 있다는 말뿐이고 막힌다', () => {
    expect(spanHint('2y', TODAY, 0)).toEqual({ text: '2024년 11월 – 2026년 11월(2년)은 다 가져와 있어요.', disabled: true })
    expect(spanHint('all', TODAY, 0)).toEqual({ text: '2020년 1월 – 2026년 11월은 다 가져와 있어요.', disabled: true })
  })
})

describe('AC-3502.2 가져오는 중 본문', () => {
  it('AC-3502.2 전체 기간 70달이면 시안 글 그대로다', () => {
    expect(fetchingBody('all', TODAY, 70)).toBe(
      '2020년 1월 – 2026년 11월 가운데 아직 안 가져온 70달을 읽어요. 12분쯤 걸려요. 다 끝날 때까지 이 창을 닫지 말아 주세요.',
    )
  })

  it('AC-3502.2 최근 2년 12달·최근 1년 3달', () => {
    expect(fetchingBody('2y', TODAY, 12)).toBe(
      '2024년 11월 – 2026년 11월(2년) 가운데 아직 안 가져온 12달을 읽어요. 2분쯤 걸려요. 다 끝날 때까지 이 창을 닫지 말아 주세요.',
    )
    expect(fetchingBody('1y', TODAY, 3)).toBe(
      '최근 1년(2025년 11월 – 2026년 11월, 13달) 가운데 아직 안 가져온 3달을 읽어요. 1분 안에 끝나요. 다 끝날 때까지 이 창을 닫지 말아 주세요.',
    )
  })
})

describe('AC-3502.3 다 가져온 뒤 알림', () => {
  const SEVENTY = monthsBack('2025-10', 70) // 2025-10 ~ 2020-01, 새 달부터(가져온 차례)

  it('AC-3502.3 여러 달이면 가장 옛 달 – 가장 새 달의 K달과 넘겨 볼 끝 달', () => {
    expect(doneNotice(SEVENTY, '2020-01')).toEqual({
      lead: '2020년 1월 – 2025년 10월의 70달을 가져왔어요.',
      rest: '이제 기간 줄의 ‹ 단추로 2020년 1월까지 넘겨 볼 수 있어요.',
    })
  })

  it('AC-3502.3 달 차례가 섞여 있어도 가장 옛 달·가장 새 달을 쓴다', () => {
    expect(doneNotice(['2024-05', '2025-10', '2023-01', '2024-11'], '2023-01')?.lead).toBe('2023년 1월 – 2025년 10월의 4달을 가져왔어요.')
  })

  it('AC-3502.3 한 달이면 범위 대신 그 달 하나다', () => {
    expect(doneNotice(['2024-03'], '2024-03')).toEqual({
      lead: '2024년 3월의 1달을 가져왔어요.',
      rest: '이제 기간 줄의 ‹ 단추로 2024년 3월까지 넘겨 볼 수 있어요.',
    })
  })

  it('AC-3502.3 가져온 달이 없으면(K = 0) 알림이 없다', () => {
    expect(doneNotice([], '2025-11')).toBeNull()
  })
})

describe('AC-3502.4 멈춘 뒤 줄', () => {
  it('AC-3502.4 전체 기간 70달 가운데 12달을 가져오고 멈추면 시안 글 그대로다(M = 58)', () => {
    expect(stoppedLine('all', monthsBack('2025-10', 12), 58)).toBe(
      '가져온 12달(2024년 11월 – 2025년 10월)은 저장됐어요. 연결한 뒤 [전체 기간]을 다시 고르고 [비트에서 가져오기]를 누르면 남은 58달만 읽어요.',
    )
  })

  it('AC-3502.4 한 달이면 범위 대신 그 달 하나이고, 단추 이름은 고른 기간이다', () => {
    expect(stoppedLine('2y', ['2025-10'], 11)).toBe(
      '가져온 1달(2025년 10월)은 저장됐어요. 연결한 뒤 [최근 2년]을 다시 고르고 [비트에서 가져오기]를 누르면 남은 11달만 읽어요.',
    )
    expect(stoppedLine('1y', ['2026-11'], 2)).toBe(
      '가져온 1달(2026년 11월)은 저장됐어요. 연결한 뒤 [최근 1년]을 다시 고르고 [비트에서 가져오기]를 누르면 남은 2달만 읽어요.',
    )
  })

  it('AC-3502.4 달 차례가 섞여 있어도 가장 옛 달·가장 새 달을 쓴다', () => {
    expect(stoppedLine('all', ['2025-02', '2025-10', '2024-11'], 67)).toBe(
      '가져온 3달(2024년 11월 – 2025년 10월)은 저장됐어요. 연결한 뒤 [전체 기간]을 다시 고르고 [비트에서 가져오기]를 누르면 남은 67달만 읽어요.',
    )
  })

  it('AC-3502.4 가져온 달이 없으면(K = 0) 줄이 없다', () => {
    expect(stoppedLine('all', [], 70)).toBeNull()
  })
})

describe('AC-3503.1 넘겨 볼 끝 달 글', () => {
  it('AC-3503.1 기간 줄 옆 글은 "· YYYY년 M월부터 넘겨 볼 수 있어요"다', () => {
    expect(boundText('2025-11')).toBe('· 2025년 11월부터 넘겨 볼 수 있어요')
    expect(boundText('2020-01')).toBe('· 2020년 1월부터 넘겨 볼 수 있어요')
  })
})
