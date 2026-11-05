// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ds } from '@/components/ui/classes'
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

// treatment-trend REQ-1209: 치료별 추세 열린 칸은 같은 부품에 단추 글자만 바꿔 준다(design.md '화면' DetailToggle.tsx)
const NUMBERS = { closed: '숫자로 보기', open: '접기' }

function drawTwo() {
  return render(
    <>
      <DetailToggle table={TABLE} labels={NUMBERS}>
        {({ button, panel }) => (
          <section data-testid="numbers">
            {button}
            {panel}
          </section>
        )}
      </DetailToggle>
      <DetailToggle table={{ ...TABLE, caption: '다른 칸 표' }}>
        {({ button, panel }) => (
          <section data-testid="other">
            {button}
            {panel}
          </section>
        )}
      </DetailToggle>
    </>,
  )
}

// useId 값만 ID로 바꾼 마크업
function markupOf(container: HTMLElement) {
  const id = container.querySelector('button')!.getAttribute('aria-controls')!
  return container.innerHTML.replaceAll(id, 'ID')
}

describe('AC-1209.4: [숫자로 보기] 단추 글자', () => {
  it('AC-1209.4: labels를 주면 닫혀서 "숫자로 보기", 누르면 "접기"와 표, 다시 누르면 "숫자로 보기"로 닫힌다', () => {
    drawTwo()
    const box = within(screen.getByTestId('numbers'))
    const button = box.getByRole('button', { name: '숫자로 보기' })
    expect(button.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(button)
    expect(box.getByRole('button', { name: '접기' }).getAttribute('aria-expanded')).toBe('true')
    expect(box.getByRole('table', { name: TABLE.caption })).toBeTruthy()
    fireEvent.click(box.getByRole('button', { name: '접기' }))
    expect(box.getByRole('button', { name: '숫자로 보기' }).getAttribute('aria-expanded')).toBe('false')
    expect(box.queryByRole('table')).toBeNull()
  })

  it('AC-1209.4: 글자를 바꾼 칸을 열어도 labels를 주지 않은 다른 칸의 [자세히] 글자는 그대로다', () => {
    drawTwo()
    fireEvent.click(within(screen.getByTestId('numbers')).getByRole('button', { name: '숫자로 보기' }))
    const other = within(screen.getByTestId('other'))
    expect(other.getByRole('button', { name: '자세히' }).getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(other.getByRole('button', { name: '자세히' }))
    expect(other.getByRole('button', { name: '접기' })).toBeTruthy()
    expect(within(screen.getByTestId('numbers')).getByRole('button', { name: '접기' })).toBeTruthy()
  })

  it('AC-1209.4: labels를 주지 않으면 단추·표 칸 마크업이 지금과 같다(자세히 ↔ 접기)', () => {
    const { container } = draw()
    const svg = (cls: string) =>
      `<svg aria-hidden="true" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" class="${cls}"><path d="m4.75 6.25 3.25 3.25 3.25-3.25"></path></svg>`
    const button = (open: boolean) =>
      `<button type="button" aria-expanded="${open}" aria-controls="ID" class="${ds.textButton} min-h-8"><span>${open ? '접기' : '자세히'}</span>${svg(open ? 'rotate-180 transition' : 'transition')}</button>`
    expect(markupOf(container)).toBe(
      `<section><div data-testid="head">${button(false)}</div><p>그래프 자리</p><div id="ID" hidden="" class="mt-4 max-h-84 overflow-auto border-y border-line"></div></section>`,
    )
    fireEvent.click(screen.getByRole('button', { name: '자세히' }))
    const open = markupOf(container)
    expect(open.startsWith(`<section><div data-testid="head">${button(true)}</div><p>그래프 자리</p><div id="ID" class="mt-4 max-h-84 overflow-auto border-y border-line"><table class="${ds.table.table}">`)).toBe(true)
  })
})
