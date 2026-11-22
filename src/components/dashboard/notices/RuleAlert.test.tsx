// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ds } from '@/components/ui/classes'
import { NOTICES_CHANGED, ruleAlerts } from '@/lib/storage/notices'
import { ruleChangeAlerts } from '@/lib/storage/ruleChanges'
import type { RuleAlert as RuleAlertRow } from '@/types/notices'
import type { RuleChangeAlert } from '@/types/ruleAuto'
import { RuleAlert } from './RuleAlert'

// 대시보드 맨 위 띠 둘(specs/rule-auto TASK-11 · REQ-7816 · 기본값 9·10, 시안 docs/mockups/rule-auto ?v=dashboard .bands).
// 노랑 '점검 규칙 확인 필요'(ruleAlerts = 사람이 봐야 함이 남고 확인 안 한 글) 먼저, 파랑 '점검 규칙이 바뀌었어요'(ruleChangeAlerts = 안 본 바뀐 판) 다음.
// notices AC-7422.1(띠 하나 · '규칙은 저절로 바뀌지 않아요.')을 대체한다. 저장소만 가짜이고 글자 도구(lib/notices/ruleView·view)는 진짜다.
// 글 번호·제목·숫자는 지어낸 예시이고 환자 자료가 없다
vi.mock('@/lib/storage/notices', () => ({
  NOTICES_CHANGED: 'notices:changed',
  ruleAlerts: vi.fn(),
}))
vi.mock('@/lib/storage/ruleChanges', () => ({
  ruleChangeAlerts: vi.fn(),
}))

const human = vi.mocked(ruleAlerts)
const changes = vi.mocked(ruleChangeAlerts)

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`
const GOSI: RuleAlertRow = { id: id(218), noticeNo: '2026-218', title: '「요양급여의 적용기준 및 방법에 관한 세부사항」 일부개정', ruleCount: 2 }
const OTHER: RuleAlertRow = { id: id(219), noticeNo: '2026-219', title: '「건강보험 행위 급여 목록표」 일부개정', ruleCount: 1 }
const NO_NUMBER: RuleAlertRow = { id: id(7), noticeNo: null, title: '물리치료 심사지침 안내', ruleCount: 1 }
// ruleChangeAlerts는 최근 글부터(DB 차례 그대로)
const CHANGED: RuleChangeAlert = { id: id(251), noticeNo: '2026-251', title: '체외충격파 치료 인정기준 일부개정', changeCount: 2 }
const CHANGED_OLDER: RuleChangeAlert = { id: id(240), noticeNo: '2026-240', title: '온열치료 산정지침 일부개정', changeCount: 1 }
const CHANGED_NO_NUMBER: RuleChangeAlert = { id: id(9), noticeNo: null, title: '물리치료 산정 안내', changeCount: 1 }

const HUMAN_TITLE = '점검 규칙 확인 필요'
const HUMAN_TAIL = '저절로 고칠 수 없는 내용이라 직접 확인해야 해요.'
const CHANGE_TITLE = '점검 규칙이 바뀌었어요'
const CHANGE_TAIL = '틀려 보이면 글 화면에서 되돌릴 수 있어요.'

function deferred<T>() {
  let resolve!: (v: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

const never = <T,>() => new Promise<T>(() => {})
const settle = () => act(async () => {})
const draw = () => render(<RuleAlert />)
const changed = () =>
  act(async () => {
    window.dispatchEvent(new Event(NOTICES_CHANGED))
  })
const band = (title: string) => (screen.queryByText(title)?.closest('[role="status"]') as HTMLElement | null) ?? null
const humanBand = () => band(HUMAN_TITLE)
const changeBand = () => band(CHANGE_TITLE)
const linkIn = (el: HTMLElement | null, name: string) => {
  expect(el).not.toBeNull()
  const links = Array.from((el as HTMLElement).querySelectorAll('a')).filter((a) => a.textContent === name)
  expect(links).toHaveLength(1)
  return links[0]
}
const classesOf = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/)

beforeEach(() => {
  human.mockReset()
  changes.mockReset()
  human.mockImplementation(never)
  changes.mockImplementation(never)
})

afterEach(() => {
  cleanup()
})

describe('RuleAlert — 노랑 띠 `점검 규칙 확인 필요` (AC-7816.1)', () => {
  it('AC-7816.1: 사람이 봐야 함이 남은 글이 하나면 `점검 규칙 확인 필요` · `새 고시({번호})가 점검 규칙 {n}개를 바꿨는데, 저절로 고칠 수 없는 내용이라 직접 확인해야 해요.`와 그 글로 가는 `글 보기`다', async () => {
    human.mockResolvedValue([GOSI])
    draw()
    await settle()
    expect(human).toHaveBeenCalledTimes(1)
    expect(humanBand()?.textContent).toBe(`${HUMAN_TITLE} · 새 고시(보건복지부 고시 제2026-218호)가 점검 규칙 2개를 바꿨는데, ${HUMAN_TAIL}글 보기`)
    expect(screen.getByText(HUMAN_TITLE).tagName).toBe('B')
    expect(linkIn(humanBand(), '글 보기').getAttribute('href')).toBe(`/notices?id=${GOSI.id}`)
    // 예전 글('규칙은 저절로 바뀌지 않아요.')은 없다
    expect(document.body.textContent).not.toContain('규칙은 저절로 바뀌지 않아요.')
  })

  it('AC-7816.1: 둘 이상이면 `새 고시 {k}개가 점검 규칙 {n}개를 바꿨는데, …`(n은 줄 수 합)이고 `글 보기`는 목록(/notices)으로 간다', async () => {
    human.mockResolvedValue([GOSI, OTHER, NO_NUMBER])
    draw()
    await settle()
    expect(humanBand()?.textContent).toBe(`${HUMAN_TITLE} · 새 고시 3개가 점검 규칙 4개를 바꿨는데, ${HUMAN_TAIL}글 보기`)
    expect(linkIn(humanBand(), '글 보기').getAttribute('href')).toBe('/notices')
  })

  it('AC-7816.1: 하나인데 고시 번호가 없으면 `새 글이 점검 규칙 {n}개를 바꿨는데, …`이고 `글 보기`는 그 글이다', async () => {
    human.mockResolvedValue([NO_NUMBER])
    draw()
    await settle()
    expect(humanBand()?.textContent).toBe(`${HUMAN_TITLE} · 새 글이 점검 규칙 1개를 바꿨는데, ${HUMAN_TAIL}글 보기`)
    expect(linkIn(humanBand(), '글 보기').getAttribute('href')).toBe(`/notices?id=${NO_NUMBER.id}`)
  })

  it('AC-7816.1: 노랑 띠는 warning 토큰 색이고 `글 보기`는 글자 단추 모양 그대로 + no-underline이다 — 앱에는 a 밑줄을 지우는 바탕 규칙이 없다', async () => {
    human.mockResolvedValue([GOSI])
    draw()
    await settle()
    expect(classesOf(humanBand())).toEqual(expect.arrayContaining(['bg-warning-soft', 'border-warning/30']))
    expect(classesOf(linkIn(humanBand(), '글 보기'))).toEqual(expect.arrayContaining([...ds.textButton.split(/\s+/), 'no-underline']))
  })
})

describe('RuleAlert — 파랑 띠 `점검 규칙이 바뀌었어요` (AC-7816.2)', () => {
  it('AC-7816.2: 안 본 바뀐 판이 있는 글이 하나면 `점검 규칙이 바뀌었어요` · `새 고시({번호})로 점검 규칙 {n}개가 저절로 바뀌었어요. 틀려 보이면 글 화면에서 되돌릴 수 있어요.`와 그 글로 가는 `바뀐 내용 보기`다', async () => {
    changes.mockResolvedValue([CHANGED])
    draw()
    await settle()
    expect(changes).toHaveBeenCalledTimes(1)
    expect(changeBand()?.textContent).toBe(`${CHANGE_TITLE} · 새 고시(보건복지부 고시 제2026-251호)로 점검 규칙 2개가 저절로 바뀌었어요. ${CHANGE_TAIL}바뀐 내용 보기`)
    expect(screen.getByText(CHANGE_TITLE).tagName).toBe('B')
    expect(linkIn(changeBand(), '바뀐 내용 보기').getAttribute('href')).toBe(`/notices?id=${CHANGED.id}`)
  })

  it('AC-7816.2·기본값 9: 둘 이상이면 `새 고시 {k}개로 점검 규칙 {n}개가 …`이고 `바뀐 내용 보기`는 목록의 첫 글(가장 최근 글)로 간다', async () => {
    changes.mockResolvedValue([CHANGED, CHANGED_OLDER])
    draw()
    await settle()
    expect(changeBand()?.textContent).toBe(`${CHANGE_TITLE} · 새 고시 2개로 점검 규칙 3개가 저절로 바뀌었어요. ${CHANGE_TAIL}바뀐 내용 보기`)
    expect(linkIn(changeBand(), '바뀐 내용 보기').getAttribute('href')).toBe(`/notices?id=${CHANGED.id}`)
  })

  it('AC-7816.2: 하나인데 고시 번호가 없으면 `새 글로 점검 규칙 {n}개가 저절로 바뀌었어요. …`다', async () => {
    changes.mockResolvedValue([CHANGED_NO_NUMBER])
    draw()
    await settle()
    expect(changeBand()?.textContent).toBe(`${CHANGE_TITLE} · 새 글로 점검 규칙 1개가 저절로 바뀌었어요. ${CHANGE_TAIL}바뀐 내용 보기`)
    expect(linkIn(changeBand(), '바뀐 내용 보기').getAttribute('href')).toBe(`/notices?id=${CHANGED_NO_NUMBER.id}`)
  })

  it('AC-7816.2: 파랑 띠는 accent 토큰 색이고 `바뀐 내용 보기`는 글자 단추 모양 그대로 + no-underline이다', async () => {
    changes.mockResolvedValue([CHANGED])
    draw()
    await settle()
    expect(classesOf(changeBand())).toEqual(expect.arrayContaining(['bg-accent-soft', 'border-accent/20']))
    expect(classesOf(screen.getByText(CHANGE_TITLE))).toContain('text-accent-strong')
    expect(classesOf(linkIn(changeBand(), '바뀐 내용 보기'))).toEqual(expect.arrayContaining([...ds.textButton.split(/\s+/), 'no-underline']))
  })

  it('AC-7816.2: 둘 다 있으면 한 묶음 안에 노랑 먼저, 파랑 다음이다', async () => {
    human.mockResolvedValue([GOSI])
    changes.mockResolvedValue([CHANGED])
    const { container } = draw()
    await settle()
    const bands = screen.getAllByRole('status')
    expect(bands).toEqual([humanBand(), changeBand()])
    expect(container.children).toHaveLength(1)
    expect(Array.from((container.firstElementChild as HTMLElement).children)).toEqual(bands)
  })

  it('AC-7816.2: 노랑이 없으면 파랑이 맨 위다', async () => {
    human.mockResolvedValue([])
    changes.mockResolvedValue([CHANGED])
    const { container } = draw()
    await settle()
    expect(humanBand()).toBeNull()
    expect(screen.getAllByRole('status')).toEqual([changeBand()])
    expect(container.firstElementChild?.firstElementChild).toBe(changeBand())
  })
})

describe('RuleAlert — 띠마다 따로 · 다시 읽기 · 데스크 (AC-7816.3)', () => {
  it('AC-7816.3: 노랑 읽기 실패·0개면 노랑만 없고 파랑은 그대로다', async () => {
    human.mockResolvedValue('failed')
    changes.mockResolvedValue([CHANGED])
    draw()
    await settle()
    expect(humanBand()).toBeNull()
    expect(changeBand()).not.toBeNull()
    cleanup()

    human.mockResolvedValue([])
    draw()
    await settle()
    expect(humanBand()).toBeNull()
    expect(changeBand()).not.toBeNull()
  })

  it('AC-7816.3: 파랑 읽기 실패·0개면 파랑만 없고 노랑은 그대로다', async () => {
    human.mockResolvedValue([GOSI])
    changes.mockResolvedValue('failed')
    draw()
    await settle()
    expect(changeBand()).toBeNull()
    expect(humanBand()).not.toBeNull()
    cleanup()

    changes.mockResolvedValue([])
    draw()
    await settle()
    expect(changeBand()).toBeNull()
    expect(humanBand()).not.toBeNull()
  })

  it('AC-7816.3: 둘 다 읽는 중·실패·0개면 아무것도 그리지 않는다(빈 묶음도 없음)', async () => {
    const waitHuman = deferred<RuleAlertRow[] | 'failed'>()
    const waitChanges = deferred<RuleChangeAlert[] | 'failed'>()
    human.mockReturnValue(waitHuman.promise)
    changes.mockReturnValue(waitChanges.promise)
    const reading = draw()
    expect(reading.container.innerHTML).toBe('')
    await act(async () => waitHuman.resolve('failed'))
    await act(async () => waitChanges.resolve('failed'))
    expect(reading.container.innerHTML).toBe('')
    cleanup()

    human.mockResolvedValue([])
    changes.mockResolvedValue([])
    const none = draw()
    await settle()
    expect(none.container.innerHTML).toBe('')
    expect(screen.queryByRole('status')).toBeNull()
  })

  it('AC-7816.3: 그릴 때 한 번, notices:changed마다 둘 다 다시 읽는다 — 확인하거나 본 띠는 사라지고, 다시 읽기가 실패한 띠도 사라진다', async () => {
    human.mockResolvedValueOnce([GOSI]).mockResolvedValueOnce([GOSI]).mockResolvedValueOnce([]).mockResolvedValueOnce('failed')
    changes.mockResolvedValueOnce([CHANGED]).mockResolvedValueOnce([]).mockResolvedValueOnce([CHANGED_OLDER]).mockResolvedValueOnce([CHANGED_OLDER])
    draw()
    await settle()
    expect(human).toHaveBeenCalledTimes(1)
    expect(changes).toHaveBeenCalledTimes(1)
    expect(humanBand()).not.toBeNull()
    expect(changeBand()).not.toBeNull()

    // 글 화면에서 바뀐 내용을 봄(see_rule_changes) → 파랑만 사라짐
    await changed()
    expect(human).toHaveBeenCalledTimes(2)
    expect(changes).toHaveBeenCalledTimes(2)
    expect(humanBand()).not.toBeNull()
    expect(changeBand()).toBeNull()

    // [확인했어요] → 노랑 사라짐, 다른 글이 바뀌어 파랑이 다시
    await changed()
    expect(humanBand()).toBeNull()
    expect(changeBand()?.textContent).toContain('새 고시(보건복지부 고시 제2026-240호)로 점검 규칙 1개가 저절로 바뀌었어요.')

    // 노랑 다시 읽기 실패 → 노랑 없음, 파랑은 그대로
    await changed()
    expect(humanBand()).toBeNull()
    expect(changeBand()).not.toBeNull()
  })

  it('AC-7816.3: 늦게 온 앞 읽기의 답은 두 띠 모두 뒤 읽기의 답을 덮지 않고, 떠난 뒤에는 듣지 않는다', async () => {
    const firstHuman = deferred<RuleAlertRow[] | 'failed'>()
    const secondHuman = deferred<RuleAlertRow[] | 'failed'>()
    const firstChanges = deferred<RuleChangeAlert[] | 'failed'>()
    const secondChanges = deferred<RuleChangeAlert[] | 'failed'>()
    human.mockReturnValueOnce(firstHuman.promise).mockReturnValueOnce(secondHuman.promise)
    changes.mockReturnValueOnce(firstChanges.promise).mockReturnValueOnce(secondChanges.promise)
    const view = draw()
    await changed()
    await act(async () => secondHuman.resolve([]))
    await act(async () => secondChanges.resolve([]))
    await act(async () => firstHuman.resolve([GOSI]))
    await act(async () => firstChanges.resolve([CHANGED]))
    expect(screen.queryByRole('status')).toBeNull()

    view.unmount()
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    expect(human).toHaveBeenCalledTimes(2)
    expect(changes).toHaveBeenCalledTimes(2)
  })

  it('AC-7816.3: 데스크 계정(RoleProvider desk)에게는 두 띠 모두 그리지 않고 읽지도 않는다', async () => {
    human.mockResolvedValue([GOSI])
    changes.mockResolvedValue([CHANGED])
    const { container } = render(
      <RoleProvider desk>
        <RuleAlert />
      </RoleProvider>,
    )
    await settle()
    window.dispatchEvent(new Event(NOTICES_CHANGED))
    await settle()
    expect(container.innerHTML).toBe('')
    expect(human).not.toHaveBeenCalled()
    expect(changes).not.toHaveBeenCalled()
  })
})
