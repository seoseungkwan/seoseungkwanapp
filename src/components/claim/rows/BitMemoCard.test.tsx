// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BitMemoCard, type BitCardState } from './BitMemoCard'

// 비트에 저장된 청구메모 카드(AC-018.25). 글은 지어낸 것이다

afterEach(cleanup)

const OK: BitCardState = { status: 'ok', at: '14:05', count: 12, period: { from: '2026-10-01', to: '2026-10-12' }, has: true, code: null }
const show = (row: Parameters<typeof BitMemoCard>[0]['row'], state: BitCardState = OK, over: Partial<Parameters<typeof BitMemoCard>[0]> = {}) =>
  render(<BitMemoCard row={row} state={state} afterEntry={false} locked={false} {...over} />)
const card = () => screen.getByRole('group', { name: '비트에 저장된 청구메모' })

describe('AC-018.25 카드', () => {
  it.each([
    ['같음', { compare: '같음', inBit: '비트 글' }, '지금 메모와 같음', '비트 글'],
    ['다름', { compare: '다름', inBit: '비트 글' }, '지금 메모와 다름', '비트 글'],
    ['비트에 없음', { compare: '비트에 없음' }, '비트에 없음', '비트에 저장된 청구메모가 없어요.'],
    ['조회 못함', { compare: '조회 못함' }, '불러오지 못함', '이 사람 메모는 읽지 못했어요. 비어 있다는 뜻이 아니에요.'],
  ] as const)('AC-018.25: %s의 배지와 글', (_, row, badge, text) => {
    show(row)
    expect(card().textContent).toContain(badge)
    expect(card().textContent).toContain(text)
    expect(card().textContent).toContain('10/01~10/12 · 12건 · 14:05에 불러옴')
  })

  it('AC-018.25: 같음에도 카드와 글이 있고 카드 안에 [이 메모로 바꾸기]가 없다', () => {
    show({ compare: '같음', inBit: '비트 글' })
    expect(card().textContent).toContain('비트 글')
    expect(screen.queryByRole('button', { name: '이 메모로 바꾸기' })).toBeNull()
  })

  it('AC-018.25: 조회 못함은 없어요라고 하지 않는다', () => {
    show({ compare: '조회 못함' })
    expect(card().textContent).not.toContain('없어요')
  })

  it('AC-018.25: 읽는 동안의 배지와 글', () => {
    show({ compare: '다름', inBit: '비트 글' }, { ...OK, status: 'reading' })
    expect(card().textContent).toContain('불러오는 중')
    expect(card().textContent).toContain('비트에서 기간 전체 청구메모를 불러오는 중이에요…')
    expect(card().textContent).not.toContain('비트 글')
  })

  it('AC-018.25: 아직 받지 않았으면 배지 없이 안내하고, 입력 중이면 끝난 뒤 누르라고 한다', () => {
    const never: BitCardState = { status: 'never', at: null, count: 0, period: null, has: true, code: null }
    const { unmount } = show({ compare: '다름', inBit: '비트 글' }, never)
    expect(card().textContent).toContain('아직 불러오지 않았어요. [비트 메모 전체 불러오기]를 눌러 주세요.')
    expect(card().textContent).toContain('비트에서 읽기만 해요. 비트 로그인 창은 뜨지 않아요.')
    expect(card().textContent).not.toContain('지금 메모와')
    unmount()
    show({ compare: '다름', inBit: '비트 글' }, never, { locked: true })
    expect(card().textContent).toContain('아직 불러오지 않았어요. 입력이 끝난 뒤 [비트 메모 전체 불러오기]를 눌러 주세요.')
  })

  it('AC-018.25: 실패 때 배지 둘과 오류 문구, 지난 내용의 시각을 보인다', () => {
    show({ compare: '다름', inBit: '비트 글' }, { ...OK, status: 'failed', code: 'E-BIT-READ-FAILED' })
    expect(card().textContent).toContain('불러오지 못함')
    expect(card().textContent).toContain('지금 메모와 다름')
    expect(card().textContent).toContain('비트 자료를 읽지 못했어요')
    expect(card().textContent).toContain('아래는 14:05에 불러온 내용 · 10/01~10/12 · 12건')
    expect(card().textContent).toContain('비트 글')
  })

  it('AC-018.25: 읽은 적이 아예 없으면 실패 때 "아래는 HH:MM" 없이 오류 문구만이다', () => {
    show({ compare: '조회 못함' }, { status: 'failed', at: null, count: 0, period: null, has: false, code: 'E-BIT-READ-FAILED' })
    expect(card().textContent).toContain('비트 자료를 읽지 못했어요')
    expect(card().textContent).not.toContain('아래는')
  })

  it('AC-018.25: 입력을 마친 사람에게는 안내를 덧붙인다', () => {
    show({ compare: '비트에 없음' }, OK, { afterEntry: true })
    expect(card().textContent).toContain('14:05 뒤에 비트에 입력한 사람이에요. 다시 불러오면 맞춰져요.')
  })
})
