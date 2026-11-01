// @vitest-environment jsdom
import { act, cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import type { PatientsWorkerMessage } from '@/types/patients'
import { PatientsScreen } from './PatientsScreen'
import type { PatientsTool } from './tools'
import type { PatientsBridge, PatientsWorkerHandle } from './usePatientsWorker'

// 비트 PC 환자 탭 틀(AC-610, 목업 loadingView·errorView). 이 TASK는 불러오는 중·오류·도구 자리만 그린다. 도구 몸통은 TASK-11~13
afterEach(cleanup)

const R1 = { from: '2026-07-06', to: '2026-08-05' }
const R2 = { from: '2026-08-06', to: '2026-09-05' }
const M1 = { from: '2026-10-01', to: '2026-10-31' }
const FOLLOWUP_VIEW = { read: R1, base: '2026-11-02', rows: [], undecided: [], phoneLoaded: true, marksLoaded: true }
const RECALL_VIEW = { rows: [], coverage: { records: 0, from: null, short: [], trimmed: 0 } }
const FU_LOADING = '비트에서 F/U 명단을 읽는 중이에요'
const RC_LOADING = '정기 주사 기록을 읽는 중이에요'

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

function setup(tool: PatientsTool) {
  const streams: { cmd: string; ok(id: string): void }[] = []
  const stream = vi.fn(
    (cmd: string) =>
      new Promise((resolve) => {
        streams.push({ cmd, ok: (id) => resolve({ id, count: 1 }) })
      }),
  )
  const posted: { type: string }[] = []
  const listeners = new Set<(event: MessageEvent) => void>()
  const worker: PatientsWorkerHandle = {
    postMessage: (message) => void posted.push(message as { type: string }),
    addEventListener: (_type, listener) => void listeners.add(listener),
    removeEventListener: (_type, listener) => void listeners.delete(listener),
  }
  const bridge = { stream: stream as unknown as PatientsBridge['stream'] }
  const view = render(<PatientsScreen tool={tool} bridge={bridge} worker={worker} />)
  const reply = async (message: PatientsWorkerMessage) => {
    for (const listener of [...listeners]) listener({ data: message } as MessageEvent)
    await flush()
  }
  const answer = async (id: string) => {
    streams[streams.length - 1]!.ok(id)
    await flush()
  }
  const toViews = async (message: Omit<Extract<PatientsWorkerMessage, { type: 'views' }>, 'type'>) => {
    await answer('store-1')
    await reply({ type: 'stored', ok: true, recall: [] })
    await reply({ type: 'plan', followup: [], recall: [] })
    await reply({ type: 'views', ...message })
  }
  const show = (next: PatientsTool) => view.rerender(<PatientsScreen tool={next} bridge={bridge} worker={worker} />)
  const slot = (name: PatientsTool) => view.container.querySelector(`[data-tool-slot="${name}"]`)
  const storeLoads = () => stream.mock.calls.filter(([cmd]) => cmd === 'store.load').length
  return { ...view, stream, streams, posted, reply, answer, toViews, show, slot, storeLoads }
}

describe('PatientsScreen: 불러오는 중', () => {
  it('AC-610.2: F/U 도구 — 도구 머리(목업 글자)와 읽는 중 글, plan 전에는 숫자가 없다', () => {
    const t = setup('followup')
    expect(screen.getByRole('heading', { level: 2, name: 'F/U 명단' })).toBeTruthy()
    expect(screen.getByText('다시 오시기로 한 날이 다가온 분이에요. 오시기 전날 문자로 알려 드려요.')).toBeTruthy()
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(FU_LOADING)
    expect(status.textContent).toContain('최근 120일을 네 번에 나눠 읽어요. 다 읽을 때까지 이 창을 열어 두세요.')
    expect(status.textContent).not.toMatch(/\d+\/\d+/)
    expect(t.slot('followup')).toBeNull()
  })

  it('AC-610.2: F/U 진행은 몇 번째를 읽는지 "n/전체"로 올라간다', async () => {
    const t = setup('followup')
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [] })
    await t.reply({ type: 'plan', followup: [R1, R2], recall: [] })
    expect(screen.getByRole('status').textContent).toContain('1/2')
    await t.answer('f1')
    await t.reply({ type: 'piece', id: 'f1', ok: true })
    expect(screen.getByRole('status').textContent).toContain('2/2')
    await t.answer('f2')
    await t.reply({ type: 'piece', id: 'f2', ok: true })
    // 다 읽고 보기 모양을 기다리는 동안 전체를 넘지 않는다
    expect(screen.getByRole('status').textContent).toContain('2/2')
  })

  it('AC-610.2: 정기 주사 도구 — 도구 머리와 달 진행 "n/전체 달". 첫 읽기인지 모르므로 "처음"·"7개월" 글이 없다', async () => {
    const t = setup('recall')
    expect(screen.getByRole('heading', { level: 2, name: '정기 주사 문자 명단' })).toBeTruthy()
    expect(screen.getByText('연골주사 · 비타민D 주사처럼 때마다 맞는 주사의 다음 날짜가 다가온 분이에요.')).toBeTruthy()
    await t.answer('store-1')
    await t.reply({ type: 'stored', ok: true, recall: [M1] })
    await t.reply({ type: 'plan', followup: [R1], recall: [M1] })
    const status = screen.getByRole('status')
    expect(status.textContent).toContain(RC_LOADING)
    expect(status.textContent).toContain('1/1 달')
    expect(status.textContent).toContain('다 읽을 때까지 이 창을 열어 두세요.')
    expect(status.textContent).not.toMatch(/처음|7개월/)
  })

  it('AC-610.2: 문자 문구 도구는 명단을 읽는 동안에도 불러오는 중이 아니라 자기 자리다', () => {
    const t = setup('messages')
    expect(screen.queryByRole('status')).toBeNull()
    expect(t.slot('messages')).not.toBeNull()
    // 탭에 들어왔으니 명단은 뒤에서 읽어 둔다
    expect(t.storeLoads()).toBe(1)
  })
})

describe('PatientsScreen: 오류는 그 도구에만 (AC-604.3)', () => {
  it('AC-610.2: F/U가 실패하면 F/U 도구는 errors.ts 글·번호 + [다시 불러오기], 정기 주사 도구는 자기 자리', async () => {
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    const alert = screen.getByRole('alert')
    const info = errorInfo('E-BIT-READ-FAILED')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(screen.getByText('다른 도구는 그대로 쓸 수 있어요.')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: 'F/U 명단' })).toBeTruthy()

    t.show('recall')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.queryByRole('button', { name: '다시 불러오기' })).toBeNull()
    expect(t.slot('recall')).not.toBeNull()

    t.show('messages')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('messages')).not.toBeNull()
  })

  it('AC-610.2: 반대도 같다 — 정기 주사만 실패하면 F/U 도구는 자기 자리', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-BIT-READ-FAILED' } })
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-BIT-READ-FAILED')
    t.show('followup')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('followup')).not.toBeNull()
  })

  it('AC-604.8: store.load가 실패하면 정기 주사 도구만 오류이고 F/U는 자기 자리다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: { ...FOLLOWUP_VIEW, marksLoaded: false }, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    const info = errorInfo('E-STORE-BROKEN')
    expect(screen.getByRole('alert').textContent).toContain(info.what)
    expect(screen.getByRole('alert').textContent).toContain(info.fix)
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-BROKEN')
    t.show('followup')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('followup')).not.toBeNull()
  })

  it('AC-610.2: errors.ts에 없는 번호(도우미가 새로 준 번호)는 번호만 보이고 멈추지 않는다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-HELPER-NEW-CODE' } })
    expect(screen.getByRole('alert').textContent).toBe('오류 번호 E-HELPER-NEW-CODE')
    expect(screen.getByRole('button', { name: '다시 불러오기' })).toBeTruthy()
    expect(t.slot('followup')).toBeNull()
  })

  it('AC-610.2: 저장 실패 번호(codes.store)만 왔으면 도구 오류가 아니다', async () => {
    const t = setup('recall')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: null, codes: { store: 'E-STORE-FAILED' } })
    expect(screen.queryByRole('alert')).toBeNull()
    expect(t.slot('recall')).not.toBeNull()
  })
})

describe('PatientsScreen: [다시 불러오기]·도구 바꾸기', () => {
  it('AC-604.8: [다시 불러오기]는 Worker에 reload를 먼저 보내고 다시 store.load를 부르며, 도구는 불러오는 중으로 돌아간다', async () => {
    const user = userEvent.setup()
    const t = setup('followup')
    await t.toViews({ followup: null, recall: RECALL_VIEW, counts: null, codes: { followup: 'E-BIT-READ-FAILED' } })
    t.posted.length = 0
    expect(t.storeLoads()).toBe(1)

    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect(t.posted[0]).toEqual({ type: 'reload' })
    expect(t.storeLoads()).toBe(2)
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByRole('status').textContent).toContain(FU_LOADING)
  })

  it('AC-604.8: 도구를 바꿔도·다시 그려도 store.load는 한 번이다. 오류가 있어도 저절로 다시 읽지 않는다', async () => {
    const t = setup('followup')
    t.show('recall')
    t.show('messages')
    t.show('followup')
    expect(t.storeLoads()).toBe(1)
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: null, counts: null, codes: { recall: 'E-STORE-BROKEN' } })
    t.show('recall')
    t.show('followup')
    t.show('recall')
    await flush()
    expect(t.storeLoads()).toBe(1)
    // 번호는 누를 때까지 그대로 남는다
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-STORE-BROKEN')
  })

  it('AC-610.2: 이 TASK는 도구 몸통을 만들지 않는다 — 다 읽어도 자리뿐이고 지어낸 줄이 없다', async () => {
    const t = setup('followup')
    await t.toViews({ followup: FOLLOWUP_VIEW, recall: RECALL_VIEW, counts: { followup_left: 1, injection_left: 2 }, codes: {} })
    expect(t.slot('followup')?.textContent).toBe('')
    expect(screen.queryByRole('table')).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})
