// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ViewingProvider } from '@/components/shell/viewing'
import { GcalFrame, type GcalTab } from './GcalFrame'

// 설정 › 구글 캘린더 안 메뉴 틀 (spec google-link REQ-8528 AC-8528.1, notes-calendar '공통', 시안 calendar.html settingsHead·flowBar).
// 글은 notes-calendar '화면 글 › 공통' 글자 그대로 적어 견준다(labels.ts 상수를 부르지 않는다)

const SUB_MENU = ['잇기', '시행자·종류', '맞춤 방법']
const HINT = '원장 계정만 바꿀 수 있어요 · 데스크 계정은 보기만 해요'
const FLOW = ['① 잇기', '② 시행자·종류 확인', '③ 가져오기 미리 보기']
const FLOW_NOTE = '처음 한 번만 이 차례로 해요'

afterEach(cleanup)

function renderFrame(props: { tab?: GcalTab; firstRun?: boolean; closedTabs?: readonly ('connect' | 'colors' | 'rules')[] } = {}, wrap?: (node: React.ReactNode) => React.ReactNode) {
  const onTab = vi.fn()
  const node = (
    <GcalFrame tab={props.tab ?? 'connect'} firstRun={props.firstRun ?? false} closedTabs={props.closedTabs} onTab={onTab}>
      <p>안쪽 화면</p>
    </GcalFrame>
  )
  render(wrap ? wrap(node) : node)
  return { onTab }
}

const settingsNav = () => screen.getByRole('navigation', { name: '설정 안 메뉴' })
const subMenu = () => screen.getByRole('group', { name: '구글 캘린더 안 메뉴' })
const subButtons = () => within(subMenu()).getAllByRole('button') as HTMLButtonElement[]
const flowBar = () => screen.queryByRole('list', { name: '처음 잇기 차례' })

describe('AC-8528.1 설정 안 메뉴 · 구글 캘린더 안 메뉴 · 처음 잇기 차례', () => {
  it("AC-8528.1: 제목 '설정' → 설정 안 메뉴 '설정' · '비트 PC 연결' · '구글 캘린더' + '새'(지금 화면), 안쪽 화면이 그 아래에 그려진다", () => {
    renderFrame()
    expect(screen.getByRole('heading', { level: 1, name: '설정' })).toBeTruthy()
    const links = within(settingsNav()).getAllByRole('link') as HTMLAnchorElement[]
    expect(links.map((link) => link.textContent)).toEqual(['설정', '비트 PC 연결', '구글 캘린더새'])
    expect(links.map((link) => link.getAttribute('href'))).toEqual(['/settings', '/claim/setup', '/settings/google-calendar'])
    expect(links.map((link) => link.getAttribute('aria-current'))).toEqual([null, null, 'page'])
    // '새'는 이름 옆 작은 꼬리표(따로 된 요소)
    const badge = within(links[2]).getByText('새')
    expect(badge.tagName).toBe('SPAN')
    expect(links[2].firstChild?.textContent).toBe('구글 캘린더')
    expect(screen.getByText('안쪽 화면')).toBeTruthy()
  })

  it("AC-8528.1: 구글 캘린더 안 메뉴는 '잇기' · '시행자·종류' · '맞춤 방법' 단추 셋이고 오른쪽 글이 notes 그대로, 지금 칸만 눌려 있다", () => {
    renderFrame({ tab: 'colors' })
    expect(subButtons().map((button) => button.textContent)).toEqual(SUB_MENU)
    expect(subButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false'])
    expect(screen.getByText(HINT)).toBeTruthy()
  })

  it("AC-8528.1: 가져오기 미리 보기(③)일 때는 '잇기'가 눌려 있고(시안 그대로), 맞춤 방법이면 '맞춤 방법'", () => {
    renderFrame({ tab: 'import' })
    expect(subButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['true', 'false', 'false'])
    cleanup()
    renderFrame({ tab: 'rules' })
    expect(subButtons().map((button) => button.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
  })

  it('AC-8528.1: 안 메뉴 단추를 누르면 그 칸 이름으로 onTab을 부른다', async () => {
    const user = userEvent.setup()
    const { onTab } = renderFrame({ tab: 'connect' })
    await user.click(screen.getByRole('button', { name: '맞춤 방법' }))
    await user.click(screen.getByRole('button', { name: '시행자·종류' }))
    await user.click(screen.getByRole('button', { name: '잇기' }))
    expect(onTab.mock.calls).toEqual([['rules'], ['colors'], ['connect']])
  })

  it('AC-8528.1: 닫아 둔 칸(closedTabs)은 눌리지 않는다 — 처음 잇기 차례만 열어 두는 화면이 쓴다', async () => {
    const user = userEvent.setup()
    const { onTab } = renderFrame({ tab: 'connect', firstRun: true, closedTabs: ['colors', 'rules'] })
    expect(subButtons().map((button) => button.disabled)).toEqual([false, true, true])
    await user.click(screen.getByRole('button', { name: '맞춤 방법' }))
    expect(onTab).not.toHaveBeenCalled()
  })

  it("AC-8528.1: 처음 잇기면 차례 띠 '① 잇기' → '② 시행자·종류 확인' → '③ 가져오기 미리 보기' · '처음 한 번만 이 차례로 해요', 지금 차례만 aria-current", () => {
    renderFrame({ tab: 'colors', firstRun: true })
    const bar = flowBar()
    expect(bar).not.toBeNull()
    const steps = within(bar as HTMLElement).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual(FLOW)
    expect(steps.map((step) => step.getAttribute('aria-current'))).toEqual([null, 'step', null])
    // 지난 차례에는 체크 표시(그림만, 글자는 그대로)
    expect(steps[0].querySelector('svg')?.getAttribute('aria-hidden')).toBe('true')
    expect(steps[2].querySelector('svg')).toBeNull()
    expect(screen.getByText(FLOW_NOTE)).toBeTruthy()
    // 차례 사이 화살표는 그림 글자라 읽지 않는다
    expect((bar as HTMLElement).parentElement?.textContent).toBe(`${FLOW.join('→')}${FLOW_NOTE}`)
  })

  it('AC-8528.1: 차례 띠는 잇기 · 시행자·종류 · 가져오기 미리 보기에만 — 처음 잇기가 아니거나 맞춤 방법이면 없다', () => {
    for (const tab of ['connect', 'colors', 'import'] as const) {
      renderFrame({ tab, firstRun: true })
      const steps = within(flowBar() as HTMLElement).getAllByRole('listitem')
      expect(steps.findIndex((step) => step.getAttribute('aria-current') === 'step')).toBe(['connect', 'colors', 'import'].indexOf(tab))
      cleanup()
    }
    renderFrame({ tab: 'rules', firstRun: true })
    expect(flowBar()).toBeNull()
    expect(screen.queryByText(FLOW_NOTE)).toBeNull()
    cleanup()
    renderFrame({ tab: 'connect', firstRun: false })
    expect(flowBar()).toBeNull()
  })

  it("AC-8528.1: 데스크는 보기만 — 열 수 없는 '설정' 칸은 그리지 않고, 안 메뉴로 다른 칸을 보는 것은 된다", async () => {
    const user = userEvent.setup()
    const { onTab } = renderFrame({ tab: 'connect' }, (node) => <RoleProvider desk>{node}</RoleProvider>)
    const links = within(settingsNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['비트 PC 연결', '구글 캘린더새'])
    expect(screen.getByText(HINT)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '맞춤 방법' }))
    expect(onTab).toHaveBeenCalledWith('rules')
  })

  it("AC-8528.1: 관리자가 다른 의원을 보는 중이면 '비트 PC 연결' 칸은 그리지 않는다(설정 화면과 같은 규칙)", () => {
    renderFrame({ tab: 'connect' }, (node) => <ViewingProvider viewing={{ hospitalId: 'h-1', name: '가상의원' }}>{node}</ViewingProvider>)
    const links = within(settingsNav()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual(['설정', '구글 캘린더새'])
  })
})
