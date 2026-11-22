// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DEFAULT_DEPT_RULE } from '@/lib/location/depts'
import type { DeptId, DeptRule } from '@/types/location'
import { DeptPicker, type DeptPickerProps } from './DeptPicker'

// 의원 과목 고르기 판 (spec location REQ-7921 AC-7921.1·AC-7921.2, design.md 18절, 시안 ?s=kinds 승인 3).
// 설정은 props(rule), 바뀐 설정은 onChange(바로), 저장은 onSave(마지막으로 고친 뒤 800ms — 점수 무게 판과 같음), 닫기는 onClose.
// 과목 차례·이름·글은 design.md 18절 표와 requirements '화면 글 기본값' › 의원 과목 고르기 판을 손으로 옮겨 적어 견준다

const fresh = (): DeptRule => ({ v: 1, rival: [...DEFAULT_DEPT_RULE.rival], hide: [...DEFAULT_DEPT_RULE.hide] })

function setup(over: Partial<DeptPickerProps> = {}) {
  const onChange = vi.fn<(rule: DeptRule) => void>()
  const onSave = vi.fn<(rule: DeptRule) => void>()
  const onClose = vi.fn<() => void>()
  const props: DeptPickerProps = { rule: fresh(), open: true, onChange, onSave, onClose, ...over }
  const view = render(<DeptPicker {...props} />)
  return { onChange, onSave, onClose, props, ...view }
}

// design.md 18절 표 차례(이 차례가 '목록 차례')
const NAMES = [
  '내과',
  '신경과',
  '정신건강의학과',
  '외과',
  '정형외과',
  '신경외과',
  '흉부외과',
  '성형외과',
  '마취통증의학과',
  '산부인과',
  '소아청소년과',
  '안과',
  '이비인후과',
  '피부과',
  '비뇨의학과',
  '영상의학과',
  '재활의학과',
  '가정의학과',
  '직업환경의학과',
  '치과의원',
  '한의원',
]
const FIRST_RIVAL = ['정형외과', '신경외과', '마취통증의학과', '재활의학과']
const ROLES = ['경쟁 의원', '둘레로 보기', '안 보기'] as const

const flat = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const dialog = () => screen.getByRole('dialog', { name: '의원 과목 고르기' })
const rows = () => within(dialog()).getAllByRole('listitem')
const rowOf = (name: string) => {
  const hit = rows().find((r) => within(r).getByRole('group').getAttribute('aria-label') === name)
  if (!hit) throw new Error(`줄 없음: ${name}`)
  return hit
}
const pick = (name: string, role: (typeof ROLES)[number]) => fireEvent.click(within(rowOf(name)).getByRole('button', { name: role }))
const pressed = (name: string) => ROLES.filter((r) => within(rowOf(name)).getByRole('button', { name: r }).getAttribute('aria-pressed') === 'true')
const summary = () => flat(within(dialog()).getByText(/^경쟁 의원으로 보는 과목:/).closest('p'))
const WARN = '경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요'
const wait = (ms: number) =>
  act(() => {
    vi.advanceTimersByTime(ms)
  })

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7921.1: 과목 고르기 판 — 오른쪽 판·과목 스물하나·요약·도움말·곁글·바닥', () => {
  it('AC-7921.1: open이 거짓이면 아무것도 그리지 않는다', () => {
    setup({ open: false })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(screen.queryByText('의원 과목 고르기')).toBeNull()
  })

  it('AC-7921.1: 오른쪽 판(760px, 모달)이고 제목은 "의원 과목 고르기"다', () => {
    setup()
    const d = dialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    expect(d.className).toMatch(/\bw-190\b/)
    expect(d.className).toMatch(/\bfixed\b/)
    expect(d.className).toMatch(/\bright-0\b/)
    expect(within(d).getByRole('heading', { name: '의원 과목 고르기' })).toBeTruthy()
  })

  it('AC-7921.1: 과목 스물하나가 design.md 18절 차례로 한 줄씩 있고, 줄마다 경쟁 의원·둘레로 보기·안 보기 셋 가운데 하나만 눌려 있다', () => {
    setup()
    const list = within(dialog()).getByRole('list', { name: '과목마다 고르기' })
    const items = within(list).getAllByRole('listitem')
    expect(items.map((r) => within(r).getByRole('group').getAttribute('aria-label'))).toEqual(NAMES)
    for (const name of NAMES) {
      const buttons = within(within(rowOf(name)).getByRole('group')).getAllByRole('button')
      expect(buttons.map((b) => b.textContent), name).toEqual([...ROLES])
      expect(pressed(name), name).toEqual([FIRST_RIVAL.includes(name) ? '경쟁 의원' : '둘레로 보기'])
    }
  })

  it("AC-7921.1: 처음 넷(정형외과·신경외과·마취통증의학과·재활의학과)에만 회색 칩 '처음 경쟁'이 있고, 한의원 줄에 곁글이 있다", () => {
    setup()
    for (const name of NAMES) {
      const chip = within(rowOf(name)).queryByText('처음 경쟁')
      expect(chip !== null, name).toBe(FIRST_RIVAL.includes(name))
      if (chip) expect(chip.className).toMatch(/\bbg-canvas\b/)
    }
    expect(within(rowOf('한의원')).getByText('처음엔 경쟁 수에 넣지 않고 따로 한 줄')).toBeTruthy()
    expect(within(dialog()).getAllByText('처음엔 경쟁 수에 넣지 않고 따로 한 줄')).toHaveLength(1)
  })

  it('AC-7921.1: 처음 경쟁 칩은 지금 설정과 상관없이 처음 넷에 붙는다(뺀 뒤에도 그대로)', () => {
    setup({ rule: { v: 1, rival: ['im'], hide: ['ortho'] } })
    expect(within(rowOf('정형외과')).getByText('처음 경쟁')).toBeTruthy()
    expect(within(rowOf('내과')).queryByText('처음 경쟁')).toBeNull()
    expect(pressed('정형외과')).toEqual(['안 보기'])
    expect(pressed('내과')).toEqual(['경쟁 의원'])
  })

  it('AC-7921.1: 맨 위 요약은 경쟁 과목 이름을 목록 차례로 " · "로 잇고 개수를 붙인다(고른 차례가 아님)', () => {
    setup()
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 정형외과 · 신경외과 · 마취통증의학과 · 재활의학과 (4개)')
    expect(within(dialog()).queryByText(WARN)).toBeNull()
    cleanup()
    setup({ rule: { v: 1, rival: ['korean', 'rehab', 'im'] as DeptId[], hide: [] } })
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 내과 · 재활의학과 · 한의원 (3개)')
  })

  it('AC-7921.1: 경쟁이 0개면 요약은 "없음 (0개)"이고 그 아래 노란 안내 글이 있다', () => {
    setup({ rule: { v: 1, rival: [], hide: [] } })
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 없음 (0개)')
    const warn = within(dialog()).getByText(WARN)
    expect(warn.closest('.bg-warning-soft')).not.toBeNull()
  })

  it('AC-7921.1: 요약 아래 도움말이 화면 글 기본값 그대로이고 세 이름은 굵게다', () => {
    setup()
    const help = within(dialog()).getByText((_, el) => el?.tagName === 'P' && flat(el).startsWith('경쟁 의원 = '))
    expect(flat(help)).toBe(
      "경쟁 의원 = 경쟁 수 · 1곳당 사는 사람 · 진료비 · 진료 시간 빈틈 · 새로 연 곳 알림과 점수에 넣어요. 둘레로 보기 = 후보 자세히 '둘레 다른 과 의원'에 과목마다 수만 보여요. 안 보기 = 어디에도 안 보여요.",
    )
    expect(Array.from(help.querySelectorAll('b')).map((b) => b.textContent)).toEqual(['경쟁 의원', '둘레로 보기', '안 보기'])
  })

  it('AC-7921.1: 줄 오른쪽은 `후보 {글자} {범위} 안 {n}곳`이다(지금 보는 후보, 고른 값과 상관없이 그 과목 수, 없으면 0곳)', () => {
    setup({ letter: 'A', radiusM: 1000, counts: { ortho: 3, im: 12, korean: 4 }, rule: { v: 1, rival: ['im'], hide: ['ortho'] } })
    expect(within(rowOf('정형외과')).getByText('후보 A 1km 안 3곳')).toBeTruthy()
    expect(within(rowOf('내과')).getByText('후보 A 1km 안 12곳')).toBeTruthy()
    expect(within(rowOf('한의원')).getByText('후보 A 1km 안 4곳')).toBeTruthy()
    expect(within(rowOf('안과')).getByText('후보 A 1km 안 0곳')).toBeTruthy()
    expect(within(dialog()).getAllByText(/^후보 A 1km 안 \d+곳$/)).toHaveLength(21)
  })

  it('AC-7921.1: 범위 글은 거리 글(500m·1.5km)이다', () => {
    setup({ letter: 'C', radiusM: 1500, counts: { pain: 2 } })
    expect(within(rowOf('마취통증의학과')).getByText('후보 C 1.5km 안 2곳')).toBeTruthy()
    cleanup()
    setup({ letter: 'B', radiusM: 500, counts: {} })
    expect(within(rowOf('외과')).getByText('후보 B 500m 안 0곳')).toBeTruthy()
  })

  it('AC-7921.1: 보는 후보가 없으면(글자·범위·수를 안 주면) 줄 오른쪽 글이 없다', () => {
    setup()
    expect(within(dialog()).queryByText(/^후보 /)).toBeNull()
  })

  it('AC-7921.1: 판 아래 곁글 둘과 바닥 글·[기본값으로]·[닫기]가 화면 글 기본값 그대로다', () => {
    setup()
    const d = dialog()
    expect(within(d).getByText('새로 경쟁 의원에 넣은 과목은 [다시 받기]를 누르면 의사 수·장비·진료비가 채워져요')).toBeTruthy()
    expect(
      within(d).getByText('의원마다 대표 과목 하나로 셌어요(이름에 든 과목 먼저). 과목 목록은 심평원 의원 진료과목 열아홉과 치과의원·한의원이에요.'),
    ).toBeTruthy()
    expect(within(d).getByText('바꾸면 바로 저장돼요(점수 무게 판과 같아요).')).toBeTruthy()
    expect(within(d).getByRole('button', { name: '기본값으로' })).toBeTruthy()
    const closes = within(d).getAllByRole('button', { name: '닫기' })
    expect(closes).toHaveLength(2)
    expect(closes[1].textContent).toBe('닫기')
  })

  it('AC-7921.1: 위에서 아래로 요약 → 도움말 → 과목 줄 → 곁글 둘 → 바닥 차례다', () => {
    setup()
    const text = flat(dialog())
    const at = (s: string) => text.indexOf(s)
    const order = [
      '경쟁 의원으로 보는 과목:',
      '경쟁 의원 = ',
      '내과',
      '한의원처음엔',
      '새로 경쟁 의원에 넣은 과목은',
      '의원마다 대표 과목 하나로',
      '바꾸면 바로 저장돼요',
    ].map(at)
    expect(order.every((n) => n >= 0)).toBe(true)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
  })

  it('AC-7921.1: [닫기] 둘·Esc·바탕 누름은 onClose를 부른다', () => {
    const { onClose } = setup()
    const [head, foot] = within(dialog()).getAllByRole('button', { name: '닫기' })
    fireEvent.click(head)
    fireEvent.click(foot)
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('kinds-scrim'))
    expect(onClose).toHaveBeenCalledTimes(4)
  })

  it('AC-7921.1: 닫힌 판(open 거짓)에서는 Esc가 onClose를 부르지 않는다', () => {
    const { onClose } = setup({ open: false })
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(onClose).not.toHaveBeenCalled()
  })

  it('AC-7921.1: 판이 열리면 판 안으로 초점이 가고, 닫히면 연 단추로 돌아간다', () => {
    const opener = document.createElement('button')
    document.body.append(opener)
    opener.focus()
    const { rerender, props } = setup({ open: false })
    rerender(<DeptPicker {...props} open />)
    expect(dialog().contains(document.activeElement)).toBe(true)
    rerender(<DeptPicker {...props} open={false} />)
    expect(document.activeElement).toBe(opener)
    opener.remove()
  })
})

describe('AC-7921.2: 바꾸면 onChange 바로·onSave는 멈춘 뒤 한 번, [기본값으로]는 처음 값', () => {
  it('AC-7921.2: 과목 하나를 바꾸면 바뀐 설정이 onChange로 바로 가고 판이 바로 그 값으로 그려진다', () => {
    const { onChange, onSave } = setup()
    pick('한의원', '경쟁 의원')
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(onChange).toHaveBeenLastCalledWith({ v: 1, rival: ['ortho', 'ns', 'pain', 'rehab', 'korean'], hide: [] })
    expect(pressed('한의원')).toEqual(['경쟁 의원'])
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 정형외과 · 신경외과 · 마취통증의학과 · 재활의학과 · 한의원 (5개)')
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-7921.2: 경쟁·둘레로 보기·안 보기 사이를 옮기면 두 목록 모두 목록 차례로 맞춰진다(겹침 없음)', () => {
    const { onChange } = setup()
    pick('내과', '안 보기')
    expect(onChange).toHaveBeenLastCalledWith({ v: 1, rival: ['ortho', 'ns', 'pain', 'rehab'], hide: ['im'] })
    pick('정형외과', '안 보기')
    expect(onChange).toHaveBeenLastCalledWith({ v: 1, rival: ['ns', 'pain', 'rehab'], hide: ['im', 'ortho'] })
    pick('내과', '경쟁 의원')
    expect(onChange).toHaveBeenLastCalledWith({ v: 1, rival: ['im', 'ns', 'pain', 'rehab'], hide: ['ortho'] })
    pick('신경외과', '둘레로 보기')
    expect(onChange).toHaveBeenLastCalledWith({ v: 1, rival: ['im', 'pain', 'rehab'], hide: ['ortho'] })
    expect(pressed('신경외과')).toEqual(['둘레로 보기'])
    expect(onChange).toHaveBeenCalledTimes(4)
  })

  it('AC-7921.2: 이미 눌린 것을 다시 누르면 아무것도 부르지 않는다', () => {
    const { onChange, onSave } = setup()
    pick('정형외과', '경쟁 의원')
    pick('안과', '둘레로 보기')
    wait(1000)
    expect(onChange).not.toHaveBeenCalled()
    expect(onSave).not.toHaveBeenCalled()
  })

  it('AC-7921.2: 저장(onSave)은 마지막으로 고친 뒤 800ms가 지나면 마지막 설정으로 한 번만 간다(점수 무게 판과 같다)', () => {
    const { onChange, onSave } = setup()
    pick('내과', '경쟁 의원')
    wait(500)
    pick('치과의원', '안 보기')
    wait(799)
    expect(onSave).not.toHaveBeenCalled()
    wait(1)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ v: 1, rival: ['im', 'ortho', 'ns', 'pain', 'rehab'], hide: ['dental'] })
    expect(onSave.mock.calls[0][0]).toEqual(onChange.mock.calls[1][0])
    wait(2000)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-7921.2: 경쟁 과목을 모두 빼면 0개 설정을 저장하고 노란 안내가 바로 보인다', () => {
    const { onSave } = setup()
    for (const name of FIRST_RIVAL) pick(name, '둘레로 보기')
    expect(within(dialog()).getByText(WARN)).toBeTruthy()
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 없음 (0개)')
    wait(800)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ v: 1, rival: [], hide: [] })
  })

  it('AC-7921.2: [기본값으로]는 처음 값(경쟁 = 정형외과·신경외과·마취통증의학과·재활의학과, 나머지 둘레로 보기)으로 되돌려 저장한다', () => {
    const { onChange, onSave } = setup({ rule: { v: 1, rival: ['im', 'korean'], hide: ['ortho', 'dental'] } })
    expect(pressed('정형외과')).toEqual(['안 보기'])
    fireEvent.click(within(dialog()).getByRole('button', { name: '기본값으로' }))
    expect(onChange).toHaveBeenLastCalledWith(fresh())
    for (const name of NAMES) expect(pressed(name), name).toEqual([FIRST_RIVAL.includes(name) ? '경쟁 의원' : '둘레로 보기'])
    wait(800)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(fresh())
  })

  it('AC-7921.2: 넘겨준 설정은 얼려 둔 처음 값과 다른 새 객체다(받는 쪽이 고쳐도 처음 값이 안 바뀐다)', () => {
    const { onChange } = setup()
    fireEvent.click(within(dialog()).getByRole('button', { name: '기본값으로' }))
    const sent = onChange.mock.calls[0][0]
    expect(sent).not.toBe(DEFAULT_DEPT_RULE)
    expect(Object.isFrozen(sent.rival)).toBe(false)
  })

  it('AC-7921.2: 저장을 기다리는 중에 판을 닫으면(open 거짓) 마지막 설정을 바로 저장한다', () => {
    const { onSave, rerender, props } = setup()
    pick('안과', '안 보기')
    rerender(<DeptPicker {...props} open={false} />)
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({ v: 1, rival: ['ortho', 'ns', 'pain', 'rehab'], hide: ['eye'] })
    wait(1000)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-7921.2: 저장을 기다리는 중에 판이 사라지면 마지막 설정을 바로 저장한다', () => {
    const { onSave, unmount } = setup()
    pick('피부과', '경쟁 의원')
    unmount()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0][0].rival).toEqual(['ortho', 'ns', 'pain', 'derm', 'rehab'])
  })

  it('AC-7921.2: 설정은 props로 받는다 — 받은 값으로 그리고, 밖에서 다른 설정이 오면 그 값으로 다시 그린다', () => {
    const { rerender, props } = setup({ rule: { v: 1, rival: ['eye'], hide: [] } })
    expect(pressed('안과')).toEqual(['경쟁 의원'])
    rerender(<DeptPicker {...props} rule={{ v: 1, rival: ['ent'], hide: ['eye'] }} />)
    expect(pressed('안과')).toEqual(['안 보기'])
    expect(pressed('이비인후과')).toEqual(['경쟁 의원'])
  })

  it('AC-7921.2: 판이 넘긴 것과 같은 설정을 부모가 다시 내려 주면 그대로 두고, 저장도 한 번만 간다', () => {
    const { rerender, props, onChange, onSave } = setup()
    pick('내과', '경쟁 의원')
    const sent = onChange.mock.calls[0][0]
    rerender(<DeptPicker {...props} rule={sent} />)
    expect(pressed('내과')).toEqual(['경쟁 의원'])
    wait(800)
    expect(onSave).toHaveBeenCalledTimes(1)
  })

  it('AC-7921.2: 못 읽는 설정이 오면 처음 값으로 보고, 모르는 과목 id는 버린다(fillDeptRule)', () => {
    setup({ rule: { v: 1, rival: ['ortho', 'xx' as DeptId], hide: ['im'] } })
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 정형외과 (1개)')
    expect(pressed('내과')).toEqual(['안 보기'])
    cleanup()
    setup({ rule: null as unknown as DeptRule })
    expect(summary()).toBe('경쟁 의원으로 보는 과목: 정형외과 · 신경외과 · 마취통증의학과 · 재활의학과 (4개)')
  })
})
