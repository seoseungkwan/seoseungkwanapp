// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { DetailToggle, type DetailTable } from './DetailToggle'

// [자세히] 열기·닫기 + 숫자 표 (stats REQ-513 AC-513.3, 시안 notes.md §5). 값은 시험 안에서 지은 가짜다

const TABLE: DetailTable = {
  caption: '환자 수 추이 (명)',
  columns: ['날짜', '신환', '합계'],
  rows: [
    ['11월 2일 (월)', '2', '10'],
    ['11월 3일 (화)', '3', '12'],
  ],
}

function draw() {
  return render(
    <DetailToggle table={TABLE}>
      {({ button, panel }) => (
        <section>
          <div data-testid="head">{button}</div>
          <p>그래프 자리</p>
          {panel}
        </section>
      )}
    </DetailToggle>,
  )
}

afterEach(cleanup)

describe('AC-513.3: [자세히]', () => {
  it('AC-513.3: 처음에는 닫혀 있고 aria-expanded·aria-controls가 표 칸을 가리킨다', () => {
    draw()
    const button = screen.getByRole('button', { name: '자세히' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    const panel = document.getElementById(button.getAttribute('aria-controls')!)
    expect(panel).not.toBeNull()
    expect(panel!.hidden).toBe(true)
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-513.3: 누르면 그래프 바로 아래에 머리 줄 + 값 표가 열리고 글자가 "접기"가 된다', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const button = screen.getByRole('button', { name: '접기' })
    expect(button.getAttribute('aria-expanded')).toBe('true')
    const table = screen.getByRole('table', { name: '환자 수 추이 (명)' })
    expect(screen.getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['날짜', '신환', '합계'])
    expect(table.querySelectorAll('tbody tr')).toHaveLength(2)
    expect(screen.getByText('11월 3일 (화)')).toBeTruthy()
    const panel = document.getElementById(button.getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(false)
    expect(screen.getByText('그래프 자리').nextElementSibling).toBe(panel)
  })

  it('AC-513.3: 다시 누르면 닫힌다', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(screen.getByRole('button', { name: '자세히' }).getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-513.3: 열고 닫아도 주소(URL)와 방문 기록이 바뀌지 않는다', () => {
    const href = window.location.href
    const length = window.history.length
    draw()
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    fireEvent.click(screen.getByRole('button', { name: '접기' }))
    expect(window.location.href).toBe(href)
    expect(window.history.length).toBe(length)
  })

  it('AC-513.3: 첫 칸 밖의 값은 오른쪽 정렬·고정폭이고, 표 칸은 최대 336px에서 세로로 밀린다', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    expect(screen.getByText('11월 3일 (화)').className).not.toContain('text-right')
    expect(screen.getByText('12').className).toContain('text-right')
    expect(screen.getByText('12').className).toContain('tabular-nums')
    expect(screen.getByRole('table').parentElement!.className).toContain('max-h-84')
  })

  it('AC-513.3: 꺾쇠는 열리면 180° 돌아간다', () => {
    draw()
    const svg = () => screen.getByRole('button').querySelector('svg')!.getAttribute('class') ?? ''
    expect(svg()).not.toContain('rotate-180')
    fireEvent.click(screen.getByRole('button'))
    expect(svg()).toContain('rotate-180')
  })
})
