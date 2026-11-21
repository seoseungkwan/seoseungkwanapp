// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EmptyBook } from './EmptyBook'
import { NOTICE_MS, ShortNotice, useShortNotice } from './ShortNotice'

// 빈 주소록(spec contacts AC-6505.8, 시안 기본값 27, ?s=empty)과 짧은 알림(저장했어요. 등, 시안 .toast)

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-6505.8: 빈 주소록 — 1·2·3 안내 · 단추 자리 · 아래 글', () => {
  it('AC-6505.8: 제목·설명·1·2·3 안내 글이 시안 그대로다', () => {
    render(<EmptyBook actions={null} />)
    expect(screen.getByRole('heading', { level: 2, name: '주소록이 비어 있어요' })).toBeTruthy()
    expect(
      screen.getByText('거래처와 수리·관리 업체 연락처를 한곳에 모아 둬요. 업체가 많으면 엑셀 양식에 적어 한 번에 올리고, 몇 곳 안 되면 하나씩 더해요.'),
    ).toBeTruthy()
    const steps = screen.getAllByRole('listitem').map((li) => li.textContent)
    expect(steps).toEqual([
      "1양식 받기빈 엑셀 양식(주소록-양식.xlsx)을 받아요. '쓰는 법' 시트에 적는 법과 예시가 있어요.",
      "2엑셀에 적기'연락처' 시트에 사람마다 한 줄씩 적어요. 업체 이름을 똑같이 적은 줄은 한 업체로 묶여요. 장비는 '장비' 시트에 적어요.",
      '3엑셀 올리기올리면 넣기 전에 미리 보여 줘요. 틀린 줄은 빼고 나머지만 넣을 수 있어요.',
    ])
    expect(screen.getByText('수리 기록은 엑셀로 넣지 않아요. 장비를 넣은 뒤 화면에서 장비마다 더해요.')).toBeTruthy()
  })

  it('AC-6505.8: 단추 셋은 부르는 쪽이 넣는 자리(actions)에 그리고, 아래 글은 단추 뒤에 있다', () => {
    render(
      <EmptyBook
        actions={
          <>
            <button type="button">양식 받기</button>
            <button type="button">엑셀 올리기</button>
            <button type="button">업체 더하기</button>
          </>
        }
      />,
    )
    const buttons = screen.getAllByRole('button')
    expect(buttons.map((b) => b.textContent)).toEqual(['양식 받기', '엑셀 올리기', '업체 더하기'])
    const note = screen.getByText('수리 기록은 엑셀로 넣지 않아요. 장비를 넣은 뒤 화면에서 장비마다 더해요.')
    expect(buttons[2]!.compareDocumentPosition(note) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 빈 주소록에는 찾기 칸·칩이 없다
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('group', { name: '분류' })).toBeNull()
  })
})

describe('AC-6505.4·AC-6505.5·AC-6505.7: 짧은 알림 — 아래 가운데에 잠깐', () => {
  function Harness() {
    const { notice, say } = useShortNotice()
    return (
      <>
        <button type="button" onClick={() => say('저장했어요.')}>
          저장
        </button>
        <button type="button" onClick={() => say('담당자를 지웠어요.')}>
          지우기
        </button>
        <ShortNotice notice={notice} />
      </>
    )
  }

  it('AC-6505.4: say(글)이면 role=status로 그 글을 보이고 NOTICE_MS 뒤 사라진다', () => {
    vi.useFakeTimers()
    render(<Harness />)
    expect(screen.queryByRole('status')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByRole('status').textContent).toBe('저장했어요.')
    act(() => vi.advanceTimersByTime(NOTICE_MS - 1))
    expect(screen.getByRole('status')).toBeTruthy()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-6505.7: 새 알림은 앞 알림을 바꾸고 시간을 새로 센다', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    act(() => vi.advanceTimersByTime(NOTICE_MS - 100))
    fireEvent.click(screen.getByRole('button', { name: '지우기' }))
    expect(screen.getByRole('status').textContent).toBe('담당자를 지웠어요.')
    act(() => vi.advanceTimersByTime(NOTICE_MS - 1))
    expect(screen.getByRole('status').textContent).toBe('담당자를 지웠어요.')
    act(() => vi.advanceTimersByTime(1))
    expect(screen.queryByRole('status')).toBeNull()
  })
})
