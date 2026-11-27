// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import type { ErrorCode } from '@/types/errors'
import type { UisFileResult } from '@/types/uisarang'
import { UisResult } from './UisResult'
import type { UisUploadRow, UisUploadView } from './useUisUpload'

// 결과 줄·아직 없는 파일 상자(specs/uisarang-upload requirements '화면 글자' 결과, 시안 ?s=dash-missing·dash-ok·refused).
// 상태 값은 시험이 만든다(흐름은 useUisUpload.test.ts). 파일 이름·숫자는 지어낸 값이다

const TODAY = '2026-11-26'
const day = (d: string) => ({ from: d, to: d, unit: 'day' as const })
const readOf = (kind: 'income' | 'rx' | 'visits' | 'visitPatients', d: string): UisFileResult => {
  switch (kind) {
    case 'income':
      return { status: 'read', read: { kind, span: day(d), row: { date: d } as never } }
    case 'rx':
      return { status: 'read', read: { kind, span: day(d), payload: { v: 1, rows: [], total: null } } }
    case 'visits':
      return { status: 'read', read: { kind, span: day(d), days: [] } }
    case 'visitPatients':
      return { status: 'read', read: { kind, span: day(d), payload: { v: 1, patients: 0, newPatients: 0, bands: [], newBands: [] } } }
  }
}
const row = (name: string, result: UisFileResult, status: UisUploadRow['status']): UisUploadRow => ({ name, result, status })
const view = (over: Partial<UisUploadView> = {}): UisUploadView => ({
  phase: 'done',
  count: 0,
  today: TODAY,
  rows: null,
  missing: null,
  error: null,
  busy: false,
  take: vi.fn(),
  retrySave: vi.fn(),
  ...over,
})

// 시안 ?s=refused 여섯 파일
const REFUSED_ROWS: UisUploadRow[] = [
  row('일일수입통계_1126.xls', readOf('income', TODAY), 'saved'),
  row('처방통계_11월.xls', { status: 'refused', code: 'E-UIS-PERIOD', kind: 'rx', span: { from: '2026-11-01', to: '2026-11-26' } }, 'refused'),
  row('내원일별_위_1126.xls', readOf('visits', TODAY), 'saved'),
  row('내원일별_아래_1126.xls', readOf('visitPatients', TODAY), 'saved'),
  row('예약환자_1126.xls', { status: 'skipped', why: 'rsv', kind: 'rsv', span: null }, 'skipped'),
  row('환자목록_정리.xlsx', { status: 'refused', code: 'E-UIS-KIND', kind: null, span: null }, 'refused'),
]
const OK_ROWS: UisUploadRow[] = [
  row('일일수입통계_1126.xls', readOf('income', TODAY), 'saved'),
  row('기간별처방통계_1126.xls', readOf('rx', TODAY), 'saved'),
  row('내원일별_위_1126.xls', readOf('visits', TODAY), 'saved'),
  row('내원일별_아래_1126.xls', readOf('visitPatients', TODAY), 'saved'),
]

const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const list = () => screen.getByRole('list', { name: /^방금 넣은 파일 \d+개$/ })
const items = () => within(list()).getAllByRole('listitem')
const cardText = (card: Element) => [...card.querySelectorAll('p')].map((p) => p.textContent)
const expectCard = (root: HTMLElement, code: ErrorCode, detail?: string) => {
  const card = within(root).getByRole('alert')
  const info = errorInfo(code)
  expect(cardText(card)).toEqual([info.what, info.fix, `오류 번호 ${code}${detail === undefined ? '' : ` (${detail})`}`])
}

afterEach(() => cleanup())

describe('AC-8810.3: 결과 머리 · 줄 · 칩 (시안 ?s=refused)', () => {
  it('AC-8810.3: 머리는 방금 넣은 파일 {n}개 · 옆 저장 {a}개 · 받지 않음 {b}개 · 건너뜀 {c}개이고, 줄은 놓은 차례로 이름(굵게) / 종류 · 기간 / 칩이다', () => {
    render(<UisResult upload={view({ rows: REFUSED_ROWS, missing: { state: 'ready', items: [{ kind: 'rx', days: [TODAY] }] } })} />)
    const head = screen.getByText('방금 넣은 파일 6개')
    expect(head.nextElementSibling!.textContent).toBe('저장 3개 · 받지 않음 2개 · 건너뜀 1개')
    expect(
      items().map((li) => {
        const [name, line] = li.firstElementChild!.children
        return [name!.textContent, line!.textContent, li.children[1]!.textContent]
      }),
    ).toEqual([
      ['일일수입통계_1126.xls', '일일수입통계 · 11월 26일', '저장함'],
      ['처방통계_11월.xls', '기간별처방통계 · 조회일 11월 1일 ~ 11월 26일', '받지 않음'],
      ['내원일별_위_1126.xls', '내원일별 위쪽 표 · 11월 26일', '저장함'],
      ['내원일별_아래_1126.xls', '내원일별 아래쪽 표 · 11월 26일', '저장함'],
      ['예약환자_1126.xls', '예약환자통계', '건너뜀'],
      ['환자목록_정리.xlsx', '모르는 엑셀', '받지 않음'],
    ])
    const name = items()[0]!.firstElementChild!.children[0]!
    expect(name.className).toContain('font-semibold')
  })

  it('AC-8810.3: 칩 색은 저장함 초록 · 받지 않음 빨강 · 건너뜀 회색 · 저장 못 함 빨강(ds.chip)이다', () => {
    render(
      <UisResult
        upload={view({
          phase: 'saveFailed',
          rows: [REFUSED_ROWS[0]!, REFUSED_ROWS[1]!, REFUSED_ROWS[4]!, row('내원일별_위_1126.xls', readOf('visits', TODAY), 'failed')],
        })}
      />,
    )
    const chips = items().map((li) => li.children[1]!)
    expect(chips.map((chip) => [chip.textContent, chip.className])).toEqual([
      ['저장함', expect.stringContaining(ds.chip.positive)],
      ['받지 않음', expect.stringContaining(ds.chip.negative)],
      ['건너뜀', expect.stringContaining(ds.chip.neutral)],
      ['저장 못 함', expect.stringContaining(ds.chip.negative)],
    ])
    // 저장 못 함은 저장으로 세지 않는다
    expect(screen.getByText('방금 넣은 파일 4개').nextElementSibling!.textContent).toBe('저장 1개 · 받지 않음 1개 · 건너뜀 1개')
  })

  it('AC-8810.3: 0개인 것은 뺀다 — 다 저장하면 저장 {n}개만', () => {
    render(<UisResult upload={view({ rows: OK_ROWS, missing: { state: 'ready', items: [] } })} />)
    expect(screen.getByText('방금 넣은 파일 4개').nextElementSibling!.textContent).toBe('저장 4개')
  })

  it('AC-8810.3: 받지 않음 줄 아래 오류 카드(무엇이 · 어떻게 고치나 · 번호), 건너뜀 줄 아래 예약·같은 엑셀 글', () => {
    render(
      <UisResult
        upload={view({
          rows: [...REFUSED_ROWS, row('일일수입통계_1126 (1).xls', { status: 'skipped', why: 'same', kind: 'income', span: day(TODAY) }, 'skipped')],
        })}
      />,
    )
    const [, period, , , rsv, kind, same] = items()
    expectCard(period!, 'E-UIS-PERIOD')
    expectCard(kind!, 'E-UIS-KIND')
    expect(within(rsv!).queryByRole('alert')).toBeNull()
    expect(textOf(rsv!.lastElementChild)).toBe('예약환자통계는 웹앱에서 쓰지 않아 건너뛰었어요.')
    expect(textOf(same!.lastElementChild)).toBe('같은 엑셀이 한 번 더 들어와 하나만 저장했어요.')
    expect(same!.children[0]!.children[1]!.textContent).toBe('일일수입통계 · 11월 26일')
    for (const li of [items()[0]!, items()[2]!]) expect(li.children).toHaveLength(2) // 저장함 줄은 아래 글이 없다
  })
})

describe('AC-8814.2: 오류 카드 안 덧붙임(빠진 칸 · 줄 번호)', () => {
  it('AC-8814.2: E-UIS-COLUMN은 빠진 칸: {칸}, {칸} · E-UIS-ROW는 빈 줄을 빼고 위에서 {n}번째 줄 · 그 밖 번호와 검사를 못 지난 모양(plan.refused)은 덧붙임 없음', () => {
    render(
      <UisResult
        upload={view({
          rows: [
            row('a.xls', { status: 'refused', code: 'E-UIS-COLUMN', kind: 'rx', span: { from: TODAY, to: TODAY }, columns: ['총투여량', '총액'] }, 'refused'),
            row('b.xls', { status: 'refused', code: 'E-UIS-ROW', kind: 'visits', span: { from: TODAY, to: TODAY }, row: 12 }, 'refused'),
            row('c.xls', { status: 'refused', code: 'E-UIS-TOTAL', kind: 'income', span: { from: TODAY, to: TODAY }, columns: ['합계'], row: 3 }, 'refused'),
            row('d.xls', readOf('rx', TODAY), 'refused'),
          ],
        })}
      />,
    )
    const [column, rowNo, total, plan] = items()
    expectCard(column!, 'E-UIS-COLUMN', '빠진 칸: 총투여량, 총액')
    expectCard(rowNo!, 'E-UIS-ROW', '빈 줄을 빼고 위에서 12번째 줄')
    expectCard(total!, 'E-UIS-TOTAL')
    expectCard(plan!, 'E-UIS-ROW')
    expect(column!.children[0]!.children[1]!.textContent).toBe('기간별처방통계 · 조회일 11월 26일')
    expect(plan!.children[0]!.children[1]!.textContent).toBe('기간별처방통계 · 11월 26일')
  })
})

describe('AC-8810.4: 아직 없는 파일 · 다 있음', () => {
  it('AC-8810.4: 노란 상자 머리 · 설명 · 줄 {종류 이름} · {날 목록}(차례 고정, 시안 ?s=dash-missing)', () => {
    render(
      <UisResult
        upload={view({
          rows: OK_ROWS.slice(0, 1),
          missing: {
            state: 'ready',
            items: [
              { kind: 'rx', days: ['2026-11-25', '2026-11-26'] },
              { kind: 'visits', days: ['2026-11-25', '2026-11-26'] },
              { kind: 'visitPatients', days: ['2026-11-25'] },
            ],
          },
        })}
      />,
    )
    const box = screen.getByRole('group', { name: '아직 없는 파일' })
    expect(box.className).toContain('bg-warning-soft')
    expect([...box.querySelectorAll('p')].map((p) => p.textContent)).toEqual([
      '아직 없는 파일',
      '이번에 넣은 날 가운데 아래 파일이 아직 없어요. 같은 날 엑셀을 더 넣으면 채워져요.',
    ])
    expect(within(box).getAllByRole('listitem').map(textOf)).toEqual(['기간별처방통계 · 11월 25일~26일', '내원일별 위쪽 표 · 11월 25일~26일', '내원일별 아래쪽 표 · 11월 25일'])
    expect(screen.queryByText('넣은 날은 네 가지 파일이 모두 있어요.')).toBeNull()
  })

  it('AC-8810.4: 날 목록은 열 덩어리가 넘으면 외 {n}일(dayListText)', () => {
    const days = Array.from({ length: 12 }, (_, i) => `2026-11-${String(i * 2 + 1).padStart(2, '0')}`)
    render(<UisResult upload={view({ rows: OK_ROWS.slice(0, 1), missing: { state: 'ready', items: [{ kind: 'income', days }] } })} />)
    const line = within(screen.getByRole('group', { name: '아직 없는 파일' })).getByRole('listitem')
    expect(textOf(line)).toBe('일일수입통계 · 11월 1일, 11월 3일, 11월 5일, 11월 7일, 11월 9일, 11월 11일, 11월 13일, 11월 15일, 11월 17일, 11월 19일 외 2일')
  })

  it('AC-8810.4: 다 있으면 초록 한 줄 + 체크 그림(시안 ?s=dash-ok)', () => {
    render(<UisResult upload={view({ rows: OK_ROWS, missing: { state: 'ready', items: [] } })} />)
    const line = screen.getByText('넣은 날은 네 가지 파일이 모두 있어요.').closest('p')!
    expect(line.className).toContain('text-positive')
    expect(line.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    expect(screen.queryByRole('group', { name: '아직 없는 파일' })).toBeNull()
  })

  it('AC-8810.4: 있는 것을 읽지 못하면 결과 줄은 두고 그 자리만 E-UIS-READ-FAILED 카드 · 저장된 파일이 없으면(missing null) 아무것도 없다', () => {
    const { unmount } = render(<UisResult upload={view({ rows: OK_ROWS.slice(0, 1), missing: { state: 'failed' } })} />)
    expect(items()).toHaveLength(1)
    const cards = screen.getAllByRole('alert')
    expect(cards).toHaveLength(1)
    expect(cardText(cards[0]!)[2]).toBe('오류 번호 E-UIS-READ-FAILED')
    unmount()
    render(<UisResult upload={view({ rows: [REFUSED_ROWS[5]!], missing: null })} />)
    expect(items()).toHaveLength(1)
    expect(screen.queryByRole('group', { name: '아직 없는 파일' })).toBeNull()
    expect(screen.queryByText('넣은 날은 네 가지 파일이 모두 있어요.')).toBeNull()
    expect(screen.getAllByRole('alert')).toHaveLength(1) // 받지 않음 줄의 카드뿐
  })
})

describe('AC-8810.5: 저장 실패 · [다시 저장]', () => {
  it('AC-8810.5: saveFailed면 결과 아래 E-UIS-SAVE-FAILED 카드 + [다시 저장] — 누르면 retrySave', () => {
    const retrySave = vi.fn()
    render(<UisResult upload={view({ phase: 'saveFailed', rows: [row('a.xls', readOf('income', TODAY), 'failed')], retrySave })} />)
    const button = screen.getByRole('button', { name: '다시 저장' })
    const box = button.closest('div')!.parentElement!
    expectCard(box, 'E-UIS-SAVE-FAILED')
    expect(button.className).toContain(ds.button.secondarySmall)
    fireEvent.click(button)
    expect(retrySave).toHaveBeenCalledTimes(1)
  })

  it('AC-8810.5: 저장 중·다 됨에는 저장 실패 카드·단추가 없다', () => {
    const { rerender } = render(<UisResult upload={view({ phase: 'saving', busy: true, rows: [row('a.xls', readOf('income', TODAY), 'failed')] })} />)
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
    rerender(<UisResult upload={view({ rows: OK_ROWS })} />)
    expect(screen.queryByRole('button', { name: '다시 저장' })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('읽기 전체 실패 · 빈 상태', () => {
  it('AC-8807.3: 읽기 전체가 실패하면 그 번호 오류 카드 하나만(결과 줄 없음)', () => {
    const { container } = render(<UisResult upload={view({ error: 'E-UIS-TOO-MANY' })} />)
    expect(screen.getAllByRole('alert')).toHaveLength(1)
    expectCard(container as HTMLElement, 'E-UIS-TOO-MANY')
    expect(screen.queryByRole('list')).toBeNull()
  })

  it('AC-8810.2: 결과가 없으면(idle·읽는 중) 아무것도 그리지 않는다', () => {
    const { container } = render(<UisResult upload={view({ phase: 'reading', busy: true, count: 2, rows: null })} />)
    expect(container.innerHTML).toBe('')
  })

  it('AC-8810.8·AC-8810.3: 결과 감싸개는 옆으로 밀린다(overflow-x-auto) · 파일 이름은 글자로만 그린다', () => {
    render(<UisResult upload={view({ rows: [row('<b>홍길동</b>.xls', readOf('income', TODAY), 'saved')], missing: { state: 'ready', items: [] } })} />)
    expect(list().closest('.overflow-x-auto')).not.toBeNull()
    expect(screen.getByText('<b>홍길동</b>.xls')).toBeTruthy()
    expect(document.querySelector('b')).toBeNull()
  })
})
