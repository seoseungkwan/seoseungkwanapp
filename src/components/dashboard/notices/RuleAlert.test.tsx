// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { NOTICES_CHANGED, ruleAlerts } from '@/lib/storage/notices'
import type { RuleAlert as RuleAlertRow } from '@/types/notices'
import { RuleAlert } from './RuleAlert'

// 대시보드 맨 위 점검 규칙 경고(specs/notices TASK-20 · AC-7422.1 · 기본값 8·17, 시안 ?s=dashboard .dwarn).
// 저장소만 가짜이고 글자 도구(lib/notices/view)는 진짜다. 글 번호·제목·숫자는 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(),
}))

const alerts = vi.mocked(ruleAlerts)

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GOSI: RuleAlertRow = { id: id(218), noticeNo: '2026-218', title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정', ruleCount: 2 }
const OTHER: RuleAlertRow = { id: id(219), noticeNo: '2026-219', title: '「건강보험 행위 급여 목록표」 일부개정', ruleCount: 1 }
const NO_NUMBER: RuleAlertRow = { id: id(7), noticeNo: null, title: '물리치료 심사지침 안내', ruleCount: 1 }

const TITLE = '점검 규칙 확인 필요'
const TAIL = '규칙은 저절로 바뀌지 않아요.'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const settle = () => act(async () => {})
const draw = () => render(<RuleAlert />)
const box = () => screen.getByRole('status')
const seeLink = () => screen.getByRole('link', { name: '글 보기' })

beforeEach(() => {
  alerts.mockReset()
})

afterEach(() => {
  cleanup()
})

describe('RuleAlert — 맨 위 경고 (AC-7422.1)', () => {
  it('AC-7422.1: 확인하지 않은 규칙 연결 글이 하나면 `점검 규칙 확인 필요` · `새 고시({번호})가 점검 규칙 {n}개의 근거를 바꿨어요. 규칙은 저절로 바뀌지 않아요.`와 그 글로 가는 `글 보기`다', async () => {
    alerts.mockResolvedValue([GOSI])
    draw()
    await settle()
    expect(alerts).toHaveBeenCalledTimes(1)
    expect(box().textContent).toBe(`${TITLE} · 새 고시(보건복지부 고시 제2026-218호)가 점검 규칙 2개의 근거를 바꿨어요. ${TAIL}글 보기`)
    expect(screen.getByText(TITLE).tagName).toBe('B')
    expect(seeLink().getAttribute('href')).toBe(`/notices?id=${GOSI.id}`)
  })

  it('AC-7422.1·기본값 8: 둘 이상이면 `새 고시 {k}개가 점검 규칙 {n}개의 근거를 바꿨어요. …`(n은 규칙 수 합)이고 `글 보기`는 목록(/notices)으로 간다', async () => {
    alerts.mockResolvedValue([GOSI, OTHER, NO_NUMBER])
    draw()
    await settle()
    expect(box().textContent).toBe(`${TITLE} · 새 고시 3개가 점검 규칙 4개의 근거를 바꿨어요. ${TAIL}글 보기`)
    expect(seeLink().getAttribute('href')).toBe('/notices')
  })

  it('AC-7422.1·기본값 8: 하나인데 고시 번호가 없으면 `새 글이 점검 규칙 {n}개의 근거를 바꿨어요. …`이고 `글 보기`는 그 글이다', async () => {
    alerts.mockResolvedValue([NO_NUMBER])
    draw()
    await settle()
    expect(box().textContent).toBe(`${TITLE} · 새 글이 점검 규칙 1개의 근거를 바꿨어요. ${TAIL}글 보기`)
    expect(seeLink().getAttribute('href')).toBe(`/notices?id=${NO_NUMBER.id}`)
  })

  it('AC-7422.1: 0개·읽기 실패·읽는 중이면 아무것도 그리지 않는다', async () => {
    const wait = deferred<RuleAlertRow[] | 'failed'>()
    alerts.mockReturnValue(wait.promise)
    const reading = draw()
    expect(reading.container.innerHTML).toBe('')
    await act(async () => wait.resolve('failed'))
    expect(reading.container.innerHTML).toBe('')
    cleanup()

    alerts.mockResolvedValue([])
    const none = draw()
    await settle()
    expect(none.container.innerHTML).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-7422.1: notices:changed마다 다시 읽는다 — 규칙을 확인해 0개가 되면 경고가 사라지고, 다시 읽기가 실패해도 사라진다', async () => {
    alerts.mockResolvedValueOnce([GOSI]).mockResolvedValueOnce([]).mockResolvedValueOnce([OTHER]).mockResolvedValueOnce('failed')
    draw()
    await settle()
    expect(box()).toBeTruthy()

    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    expect(alerts).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('status')).toBeNull()

    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    expect(box().textContent).toContain('새 고시(보건복지부 고시 제2026-219호)가 점검 규칙 1개의 근거를 바꿨어요.')

    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-7422.1: 늦게 온 앞 읽기의 답은 뒤 읽기의 답을 덮지 않고, 떠난 뒤에는 듣지 않는다', async () => {
    const first = deferred<RuleAlertRow[] | 'failed'>()
    const second = deferred<RuleAlertRow[] | 'failed'>()
    alerts.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise)
    const view = draw()
    await act(async () => {
      window.dispatchEvent(new Event(NOTICES_CHANGED))
    })
    await act(async () => second.resolve([]))
    await act(async () => first.resolve([GOSI]))
    expect(screen.queryByRole('status')).toBeNull()

    view.unmount()
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    expect(alerts).toHaveBeenCalledTimes(2)
  })

  it('AC-7422.1: 데스크 계정(RoleProvider desk)에게는 그리지 않고 읽지도 않는다', async () => {
    alerts.mockResolvedValue([GOSI])
    const { container } = render(
      <RoleProvider desk>
        <RuleAlert />
      </RoleProvider>,
    )
    await settle()
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    await settle()
    expect(container.innerHTML).toBe('')
    expect(alerts).not.toHaveBeenCalled()
  })
})
