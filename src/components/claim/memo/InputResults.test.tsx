// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { InputResultLine, InputResultView } from '@/types/precheck'
import { InputResults } from './InputResults'

// 입력 결과(AC-018.4·AC-018.15·AC-018.21). 이름은 지어낸 것이다

afterEach(cleanup)

const line = (key: string, over: Partial<InputResultLine> = {}): InputResultLine => ({ key, date: '2026-10-28', month: '2026-10', name: `가상환자${key}`, chart: `9${key}`, result: '건너뜀', reason: '내원일 없음', retry: false, ...over })
const result = (over: Partial<InputResultView> = {}): InputResultView => ({
  status: 'finished',
  code: null,
  reason: null,
  fields: [],
  done: [],
  check: [],
  skipped: [],
  uncounted: 0,
  retry: 0,
  entered: 0,
  left: 0,
  firstNoAsk: null,
  ...over,
})
const handlers = () => ({ onRetry: vi.fn(), onResume: vi.fn(), onBack: vi.fn(), onExcel: vi.fn() })
function show(value: InputResultView, busy = false) {
  const on = handlers()
  render(<InputResults result={value} busy={busy} excelBusy={false} excelError={null} {...on} />)
  return on
}

describe('AC-018.4 결과', () => {
  it('AC-018.4: 완료·확인 필요·건너뜀으로 나뉘고 수가 보인다', () => {
    show(result({ done: [line('a', { result: '완료', reason: '입력', memo: '넣은 글' })], check: [line('b', { result: '확인 필요', reason: '미처리' })], skipped: [line('c')] }))
    expect(screen.getByRole('region', { name: '확인 필요' }).textContent).toContain('가상환자b')
    expect(screen.getByRole('region', { name: '건너뜀' }).textContent).toContain('가상환자c')
    expect(screen.getByRole('region', { name: '건너뜀' }).textContent).toContain('내원일 없음')
    expect(screen.getByRole('region', { name: '완료' }).textContent).toContain('가상환자a')
  })

  it('AC-018.4: 바꾼 사람은 이전 메모가 함께 보이고, previousMemo가 없는 줄에는 없다', () => {
    show(result({ done: [line('a', { result: '완료', reason: '바꿈(기존 메모 덮어씀)', previousMemo: '옛 메모 글', memo: '넣은 글' }), line('b', { result: '완료', reason: '입력', memo: '넣은 글' })] }))
    const done = screen.getByRole('region', { name: '완료' })
    expect(done.textContent).toContain('이전 메모 (기록에 남아 있어요)')
    expect(done.textContent).toContain('옛 메모 글')
    expect(done.textContent).toContain('바꿈 (기존 메모 덮어씀)')
    expect(within(done).getAllByText(/이전 메모/)).toHaveLength(1)
  })

  it('AC-018.4: 무엇을 지웠는지: 그중 메모 바꿈 N명과 바꾼 사람 줄의 이전 메모·넣은 메모가 보인다', () => {
    show(result({ done: [line('a', { result: '완료', reason: '바꿈(기존 메모 덮어씀)', previousMemo: '직접 쓴 메모', memo: '우리가 넣은 메모' }), line('b', { result: '완료', reason: '입력', memo: '새로 넣은 메모' })] }))
    expect(screen.getByText('그중 메모 바꿈 1명')).toBeTruthy()
    const done = screen.getByRole('region', { name: '완료' })
    expect(done.textContent).toContain('직접 쓴 메모')
    expect(done.textContent).toContain('우리가 넣은 메모')
  })

  it('AC-018.4: 미리 뺀 사람의 이유가 건너뜀에 있고 세지 않은 수를 적는다', () => {
    show(result({ skipped: [line('a', { reason: '이미 있음: 비트에 다른 메모가 있고 바꾸지 않기로 했어요' })], uncounted: 3 }))
    expect(screen.getByRole('region', { name: '건너뜀' }).textContent).toContain('이미 있음: 비트에 다른 메모가 있고 바꾸지 않기로 했어요')
    expect(screen.getByText(/이미 입력된 사람과 메모 없는 사람 3명은 세지 않았어요/)).toBeTruthy()
  })

  it('AC-018.4: [다시 하기 (N명)]와 옆 글. 없으면 단추가 없다', async () => {
    const on = show(result({ skipped: [line('a', { retry: true }), line('b')], retry: 1 }))
    expect(screen.getByText('이미 있음과 직접 입력은 다시 넣지 않아요.')).toBeTruthy()
    expect(screen.getByRole('region', { name: '건너뜀' }).textContent).toContain('다시 할 수 있음')
    await userEvent.setup().click(screen.getByRole('button', { name: '다시 하기 (1명)' }))
    expect(on.onRetry).toHaveBeenCalledTimes(1)
    cleanup()
    show(result({ skipped: [line('b')] }))
    expect(screen.queryByRole('button', { name: /다시 하기/ })).toBeNull()
  })

  it('AC-018.4: 읽는 동안에는 [다시 하기]·[이어서 하기]가 막힌다', () => {
    show(result({ status: 'stopped', code: 'E-INPUT-STOPPED', skipped: [line('a', { retry: true })], retry: 1, left: 2 }), true)
    expect((screen.getByRole('button', { name: '다시 하기 (1명)' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '이어서 하기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-018.4: [입력 방식으로 돌아가기]와 [엑셀로 저장]이 있다', async () => {
    const user = userEvent.setup()
    const on = show(result())
    await user.click(screen.getByRole('button', { name: '입력 방식으로 돌아가기' }))
    expect(on.onBack).toHaveBeenCalledTimes(1)
    await user.click(screen.getByRole('button', { name: '엑셀로 저장' }))
    expect(on.onExcel).toHaveBeenCalledTimes(1)
  })

  it('AC-018.16: 자료에 없는 진료는 자리 채움 값을 보이지 않고 날짜(모르면 달)를 보인다', () => {
    show(result({ skipped: [line('g1', { name: null, chart: null, date: '2026-10-28' }), line('g2', { name: null, chart: null, date: null, month: '2026-10' })] }))
    const text = screen.getByRole('region', { name: '건너뜀' }).textContent
    expect(text).toContain('10/28')
    expect(text).toContain('10월')
    expect(text).not.toContain('000000')
    expect(text).not.toContain('null')
  })
})

describe('AC-018.21 멈춤', () => {
  it('AC-018.21: stopped는 제목·번호의 글·이유·넣은 수와 남은 수·[이어서 하기]다', async () => {
    const on = show(result({ status: 'stopped', code: 'E-INPUT-STOPPED', reason: '입력 기록의 일부를 확인할 수 없어 아무도 열지 않았습니다.', entered: 0, left: 3 }))
    const stop = screen.getByRole('alert')
    expect(stop.textContent).toContain('중간에 멈췄어요')
    expect(stop.textContent).toContain('비트 입력을 끝까지 하지 못했어요')
    expect(stop.textContent).toContain('입력 기록의 일부를 확인할 수 없어 아무도 열지 않았습니다.')
    expect(stop.textContent).toContain('넣은 0명은 그대로 두고, 남은 3명은 넣지 않았어요.')
    expect(stop.textContent).toContain('오류 번호 E-INPUT-STOPPED')
    await userEvent.setup().click(screen.getByRole('button', { name: '이어서 하기' }))
    expect(on.onResume).toHaveBeenCalledTimes(1)
  })

  it('AC-018.21: E-BIT-UI-CHANGED면 칸 ID 목록을 보인다', () => {
    show(result({ status: 'stopped', code: 'E-BIT-UI-CHANGED', fields: ['txtBilCmt', 'btnBilCmtModify'], entered: 1, left: 2 }))
    const stop = screen.getByRole('alert')
    expect(stop.textContent).toContain('비트 화면이 달라져 입력을 멈췄어요')
    expect(stop.textContent).toContain('txtBilCmt')
    expect(stop.textContent).toContain('btnBilCmtModify')
  })

  it('AC-018.21: E-BIT-UNSAVED-RX는 이유가 없어도 글이 있다', () => {
    show(result({ status: 'stopped', code: 'E-BIT-UNSAVED-RX', entered: 1, left: 2 }))
    expect(screen.getByRole('alert').textContent).toContain('비트에 저장하지 않은 처방 창이 떠 있어요')
  })
})

describe('AC-018.21 멈춤의 다음 할 일', () => {
  it('AC-018.21: 남은 사람이 없으면 [이어서 하기]가 없다(다시 보낼 사람이 없다)', () => {
    show(result({ status: 'stopped', code: 'E-INPUT-STOPPED', check: [line('a', { result: '확인 필요', reason: '입력 완료를 확인하지 못했습니다.' })], left: 0 }))
    expect(screen.queryByRole('button', { name: '이어서 하기' })).toBeNull()
  })

  it('AC-013.5·AC-609.7: 글에 비트 PC 연결 화면의 단추가 나오는 번호면 그리로 가는 링크가 있다(E-STORE-FAILED는 단추 이름이 없어 링크가 없다)', () => {
    show(result({ status: 'stopped', code: 'E-BIT-NOT-REGISTERED', left: 1 }))
    expect(screen.getByRole('link', { name: '비트 PC 연결 확인' })).toBeTruthy()
    cleanup()
    show(result({ status: 'stopped', code: 'E-STORE-FAILED', left: 1 }))
    expect(screen.queryByRole('link', { name: '비트 PC 연결 확인' })).toBeNull()
    cleanup()
    show(result({ status: 'stopped', code: 'E-INPUT-STOPPED', left: 1 }))
    expect(screen.queryByRole('link', { name: '비트 PC 연결 확인' })).toBeNull()
  })

  it('AC-016.3: 끝났어도 번호가 있으면(결과 저장 실패) 카드로 알린다', () => {
    show(result({ status: 'finished', code: 'E-STORE-FAILED' }))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-FAILED')
  })
})

describe('AC-018.22 첫 묶음 뒤 안내', () => {
  it('AC-018.22: N이 있으면 남은 사람을 알리고 0이면 앞 문장만이다', () => {
    show(result({ firstNoAsk: 2 }))
    expect(screen.getByText('이제부터 묻지 않아요. 불러온 뒤에 비트에 메모가 생긴 2명은 아직 바꾸지 않았어요. [비트에 입력]을 다시 누르면 원래 메모를 남기고 바꿔요')).toBeTruthy()
    cleanup()
    show(result({ firstNoAsk: 0 }))
    expect(screen.getByText('이제부터 묻지 않아요.')).toBeTruthy()
    cleanup()
    show(result({ firstNoAsk: null }))
    expect(screen.queryByText(/이제부터 묻지 않아요/)).toBeNull()
  })
})
