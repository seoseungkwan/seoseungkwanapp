// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { FirstLearnKind } from '@/types/precheck'
import { FirstLearn } from './FirstLearn'

// 처음 학습(claim-learn REQ-9305, 시안 ?s=first, notes '처음 학습' 글 그대로). 종류·예시 진료는 props로만 받는다. 글·코드는 지어낸 것이다

afterEach(cleanup)

const kind = (key: string, count: number, over: Partial<FirstLearnKind> = {}): FirstLearnKind => ({
  key,
  name: `가상 종류 ${key}`,
  count,
  done: false,
  example: { visitKey: `v-${key}`, chart: [`가상 차트 ${key} 1`, `가상 차트 ${key} 2`], rx: [{ code: 'LA358', name: '가상신경차단술', qty: 2 }, { code: 'B9001', name: '가상약', qty: null }], memo: `◈가상 메모 ${key}\n◈둘째 줄` },
  ...over,
})
const KINDS = [kind('a', 40, { done: true }), kind('b', 30), kind('c', 20), kind('d', 10)]

function open(over: Partial<Parameters<typeof FirstLearn>[0]> = {}) {
  const on = { onRight: vi.fn(), onFix: vi.fn(), onStop: vi.fn(), onLoadMonth: vi.fn() }
  const props = { total: 100, kinds: KINDS, confirmed: new Set<string>(), short: false, ...on, ...over }
  const view = render(<FirstLearn {...props} />)
  return { on, props, view, user: userEvent.setup() }
}
const panel = () => screen.getByRole('region', { name: '처음 학습' })
const heading = () => within(panel()).getByRole('heading', { level: 3 }).textContent

describe('AC-9305.1 처음 학습: 종류 하나씩', () => {
  it("AC-9305.1: 제목·설명·[그만]이 있고, 덮은 비율은 확인한 종류의 진료 수 ÷ 불러온 진료 수(내림 정수 %)와 '({k} / {n} 종류)'다", () => {
    open()
    expect(within(panel()).getByRole('heading', { level: 2, name: '처음 학습' })).toBeTruthy()
    expect(within(panel()).getByText('자주 나온 진료부터 하나씩 봐요. 맞으면 [맞아요], 다르면 [고치기]로 고쳐 학습해요. 언제든 [그만]하고 나중에 이어서 할 수 있어요.')).toBeTruthy()
    expect(within(panel()).getByText('확인한 종류가 불러온 진료의 40%예요 (1 / 4 종류)')).toBeTruthy()
    expect(within(panel()).getByRole('progressbar').getAttribute('aria-valuenow')).toBe('40')
    cleanup()
    open({ total: 101, confirmed: new Set(['b']) })
    expect(within(panel()).getByText('확인한 종류가 불러온 진료의 69%예요 (2 / 4 종류)')).toBeTruthy()
  })

  it("AC-9305.1: 확인 안 한 종류부터 '{종류 이름} · 진료 {n}건'과 예시 진료의 차트·처방·지금 메모, [맞아요]·[고치기]·[건너뛰기]가 있다", () => {
    open()
    expect(heading()).toBe('가상 종류 b · 진료 30건')
    const box = (name: string) => within(panel()).getByRole('group', { name })
    expect(box('차트').textContent).toBe('차트가상 차트 b 1가상 차트 b 2')
    expect(box('처방').textContent).toBe('처방LA358 가상신경차단술 2B9001 가상약')
    expect(box('지금 메모').textContent).toBe('지금 메모◈가상 메모 b◈둘째 줄')
    expect(within(panel()).getAllByRole('button').map((item) => item.textContent)).toEqual(['그만', '맞아요', '고치기', '건너뛰기'])
  })
})

describe('AC-9305.2 맞아요·고치기·건너뛰기', () => {
  it('AC-9305.2: [맞아요]는 그 종류를 알리고 다음 종류로 간다(확인한 종류는 위가 confirmed로 준다)', async () => {
    const { on, props, view, user } = open()
    await user.click(within(panel()).getByRole('button', { name: '맞아요' }))
    expect(on.onRight).toHaveBeenCalledWith(KINDS[1])
    view.rerender(<FirstLearn {...props} confirmed={new Set(['b'])} />)
    expect(heading()).toBe('가상 종류 c · 진료 20건')
  })

  it('AC-9305.2: [건너뛰기]는 알리지 않고 다음 종류로 간다. [고치기]는 그 종류를 알린다. [그만]은 닫는다', async () => {
    const { on, user } = open()
    await user.click(within(panel()).getByRole('button', { name: '건너뛰기' }))
    expect(on.onRight).not.toHaveBeenCalled()
    expect(heading()).toBe('가상 종류 c · 진료 20건')
    await user.click(within(panel()).getByRole('button', { name: '고치기' }))
    expect(on.onFix).toHaveBeenCalledWith(KINDS[2])
    await user.click(within(panel()).getByRole('button', { name: '그만' }))
    expect(on.onStop).toHaveBeenCalledTimes(1)
  })

  it("AC-9305.2: 종류를 다 보면 '불러온 진료의 종류를 다 봤어요.'다", async () => {
    const { user } = open({ kinds: KINDS.slice(0, 2) })
    await user.click(within(panel()).getByRole('button', { name: '건너뛰기' }))
    expect(within(panel()).getByText('불러온 진료의 종류를 다 봤어요.')).toBeTruthy()
    expect(within(panel()).queryByRole('button', { name: '맞아요' })).toBeNull()
  })
})

describe('AC-9305.4 한 달 불러오기', () => {
  it("AC-9305.4: 불러온 기간이 짧거나 진료가 없으면 '한 달 불러오기' 글과 [지난 30일 불러오기]가 있고 누르면 알린다", async () => {
    const { on, user } = open({ short: true })
    expect(within(panel()).getByText('처음 학습은 한 달쯤 불러온 진료로 하면 좋아요. 지금 불러온 기간이 짧아요.')).toBeTruthy()
    await user.click(within(panel()).getByRole('button', { name: '지난 30일 불러오기' }))
    expect(on.onLoadMonth).toHaveBeenCalledTimes(1)
    cleanup()
    open()
    expect(screen.queryByRole('button', { name: '지난 30일 불러오기' })).toBeNull()
  })

  it('AC-9305.4: 진료가 없으면 종류 카드 없이 한 달 불러오기만 있다', () => {
    open({ total: 0, kinds: [], short: true })
    expect(within(panel()).getByRole('button', { name: '지난 30일 불러오기' })).toBeTruthy()
    expect(within(panel()).queryByRole('button', { name: '맞아요' })).toBeNull()
  })
})

describe('AC-9305 처음 학습 울타리', () => {
  it('AC-9305.1: 네트워크·저장소·console·supabase를 쓰지 않는다(확인한 종류 저장은 위가 한다)', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/FirstLearn.tsx'), 'utf-8')
    expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase)\b/)
  })
})
