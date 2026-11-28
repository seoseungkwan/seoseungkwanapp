// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ourClinicPhrases, slotWords, type LearnRule } from '@/lib/precheck/memo'
import type { AutoRule, LearnDraftLine, StyleChange } from '@/lib/precheck/memo/learn'
import type { PrecheckToScreen } from '@/types/precheck'
import type { LearnDraft } from '../rows/LearnDialog'
import { useLearned } from './useLearned'

// 메모 단계의 학습 저장(claim-learn design.md 5-1·6·7절). Worker 메시지(learnAuto·learnDraft·firstLearn·learnUsed)를 듣고 TASK-5 저장 함수를 부른다.
// 저장 함수와 supabase는 가짜다. 학습·글은 지어낸 것이다

const store = vi.hoisted(() => ({
  saveLearned: vi.fn(),
  revertLearned: vi.fn(),
  tickLearned: vi.fn(),
  addLearnKinds: vi.fn(),
  applyStyleChange: vi.fn(),
  readHospitalSettings: vi.fn(),
  writeHospitalSettings: vi.fn(),
  startHospitalSettings: vi.fn(),
}))
vi.mock('@/lib/storage/claimSettings', () => store)
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => ({ fake: 'sb' }) }))

type Listener = (event: Event) => void
function fakeWorker() {
  const listeners = new Set<Listener>()
  const posted: unknown[] = []
  return {
    posted,
    emit: (data: PrecheckToScreen) => act(async () => listeners.forEach((fn) => fn({ data } as unknown as Event))),
    postMessage: (message: unknown) => posted.push(message),
    addEventListener: (type: string, fn: Listener) => {
      if (type === 'message') listeners.add(fn)
    },
  }
}

const WHEN = { codes: ['LA358'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] }
const AUTO: AutoRule = { name: 'LA358 · 허리', kind: 'replace', from: '{좌우} 가상시술 {레벨} 시행', to: '{좌우} {레벨} 가상시술 시행', after: '', when: WHEN, on: true, left: 3 }
const OLD: LearnRule = { ...AUTO, id: 'l0000a002', to: '옛 문장', left: 1, made: '2026-11-01' }
const STYLE: StyleChange = { field: 'sideStyle', label: '좌우 표기', from: 'Lt', to: '좌측', patch: { TPL: { ...ourClinicPhrases().TPL, sideStyle: 'ko' } } }
const ok = (added: string[] = ['l0000a001'], before: LearnRule[] = []) => ({ ok: true, phrases: ourClinicPhrases(), added, before })
const auto = (over: Partial<Extract<PrecheckToScreen, { type: 'learnAuto' }>> = {}): PrecheckToScreen => ({ type: 'learnAuto', visitKey: 'v1', add: [AUTO], update: [], style: [], personal: 0, ...over })

/** 학습 창 재료(learnDraft 답). 줄 차이는 시험마다 바꾼다 */
const DRAFT: LearnDraft = { type: 'learnDraft', visitKey: 'v1', ok: true, diffs: [], codes: ['LA358'], withCodes: [], regions: ['lumbar'], doctors: [], forbidden: ['가상환자가'], words: slotWords(ourClinicPhrases()) }

function start() {
  const worker = fakeWorker()
  const onSaved = vi.fn()
  const hook = renderHook(() => useLearned({ worker, onSaved }))
  return { worker, onSaved, hook, now: () => hook.result.current }
}

beforeEach(() => {
  for (const fn of Object.values(store)) fn.mockReset()
  store.saveLearned.mockResolvedValue(ok())
  store.revertLearned.mockResolvedValue(ok([], []))
  store.tickLearned.mockResolvedValue('ok')
  store.addLearnKinds.mockResolvedValue('ok')
  store.applyStyleChange.mockResolvedValue('ok')
  store.readHospitalSettings.mockResolvedValue({ phrases: ourClinicPhrases(), dxLinks: [] })
  store.writeHospitalSettings.mockResolvedValue(undefined)
  store.startHospitalSettings.mockResolvedValue('ok')
})
afterEach(cleanup)

describe('AC-9301.1 저절로 학습 저장', () => {
  it('AC-9301.1: learnAuto를 받으면 더하기·바꾸기를 한 번에 saveLearned로 저장하고(바꾼 학습은 남은 확인 3), 되면 띠가 학습함이고 위에 알린다', async () => {
    const { worker, onSaved, now } = start()
    await worker.emit(auto({ update: [{ id: 'l0000a002', to: '새 문장' }] }))
    expect(store.saveLearned).toHaveBeenCalledWith({ fake: 'sb' }, { add: [AUTO], update: [{ id: 'l0000a002', to: '새 문장', left: 3 }] })
    await waitFor(() => expect(now().band).toEqual({ visitKey: 'v1', phase: 'learned', personal: 0, styles: [] }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('AC-9301.5: 개인정보라 학습하지 않은 줄 수와 모양 고침 물음이 띠에 실린다. 학습할 것이 없으면 저장하지 않는다', async () => {
    const { worker, now } = start()
    await worker.emit(auto({ add: [], personal: 2, style: [STYLE] }))
    expect(store.saveLearned).not.toHaveBeenCalled()
    expect(now().band).toEqual({ visitKey: 'v1', phase: 'note', personal: 2, styles: [{ change: STYLE, state: 'ask' }] })
  })

  it('AC-9301.6: 저장이 실패하면 띠가 실패(E-LEARN-SAVE)이고 [다시 저장]은 같은 것을 다시 저장한다', async () => {
    const { worker, onSaved, now } = start()
    store.saveLearned.mockResolvedValueOnce({ ok: false, code: 'E-LEARN-SAVE', limit: false })
    await worker.emit(auto({ personal: 1 }))
    await waitFor(() => expect(now().band).toMatchObject({ visitKey: 'v1', phase: 'failed', personal: 1 }))
    expect(onSaved).not.toHaveBeenCalled()
    await act(async () => now().retry())
    expect(store.saveLearned).toHaveBeenCalledTimes(2)
    expect(store.saveLearned.mock.calls[1]).toEqual(store.saveLearned.mock.calls[0])
    await waitFor(() => expect(now().band).toMatchObject({ phase: 'learned', personal: 1 }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })
})

describe('AC-9301.2 [이번만 고친 거예요]', () => {
  it('AC-9301.2: 방금 더한 학습은 지우고 바꾼 학습은 그 전으로 되돌린다(revertLearned). 되면 띠가 이번만이고 위에 알린다', async () => {
    const { worker, onSaved, now } = start()
    store.saveLearned.mockResolvedValueOnce(ok(['l0000a001'], [OLD]))
    await worker.emit(auto())
    await waitFor(() => expect(now().band?.phase).toBe('learned'))
    await act(async () => now().once())
    expect(store.revertLearned).toHaveBeenCalledWith({ fake: 'sb' }, { added: ['l0000a001'], before: [OLD] })
    await waitFor(() => expect(now().band).toEqual({ visitKey: 'v1', phase: 'once' }))
    expect(onSaved).toHaveBeenCalledTimes(2)
  })
})

describe('AC-9301.2·AC-9301.5 [조건 바꾸기]와 학습 창 저장', () => {

  it('AC-9301.2: [조건 바꾸기]는 Worker에 그 진료의 learnDraft를 묻고, 답이 오면 학습 창 재료가 된다', async () => {
    const { worker, now } = start()
    act(() => now().openDialog('v1'))
    expect(worker.posted).toEqual([{ type: 'learnDraft', visitKey: 'v1' }])
    await worker.emit({ ...DRAFT, visitKey: 'other' })
    expect(now().dialog).toBeNull()
    await worker.emit(DRAFT)
    expect(now().dialog).toEqual({ draft: DRAFT, saving: false, error: null })
    act(() => now().closeDialog())
    expect(now().dialog).toBeNull()
  })

  it('AC-9301.5: 학습 창 [저장]은 방금 저절로 만든 학습을 창에서 고른 것으로 바꾼다(더한 것은 지우고 새로, 바꾼 것은 그 번호를 고침, 고르지 않은 바꾼 학습은 되돌림)', async () => {
    const { worker, onSaved, now } = start()
    const OTHER: LearnRule = { ...OLD, id: 'l0000a003', to: '다른 옛 문장' }
    store.saveLearned.mockResolvedValueOnce(ok(['l0000a001'], [OLD, OTHER]))
    await worker.emit(auto())
    await waitFor(() => expect(now().band?.phase).toBe('learned'))
    act(() => now().openDialog('v1'))
    await worker.emit(DRAFT)
    const picked = { ...AUTO, to: '{좌우} {레벨} 고친 문장', when: { ...WHEN, chartWords: ['C-arm'] } }
    store.saveLearned.mockResolvedValueOnce(ok(['l0000a004'], []))
    await act(async () => now().saveDialog({ rules: [{ ...picked, update: 'l0000a001' }, { ...picked, kind: 'remove', to: '', update: 'l0000a002' }], styles: [] }))
    expect(store.saveLearned).toHaveBeenLastCalledWith({ fake: 'sb' }, {
      remove: ['l0000a001'],
      add: [picked],
      update: [{ ...picked, kind: 'remove', to: '', id: 'l0000a002', left: 3 }, OTHER],
    })
    await waitFor(() => expect(now().dialog).toBeNull())
    expect(now().band).toEqual({ visitKey: 'v1', phase: 'saved' })
    expect(onSaved).toHaveBeenCalledTimes(2)
  })

  it('AC-9301.5: 학습 창 [저장]으로 기존 학습을 고치면 그 학습의 지금 이름을 그대로 두고(조건 이름으로 덮지 않음), 새 학습만 조건 이름을 쓴다', async () => {
    const { worker, now } = start()
    const RENAMED: LearnRule = { ...OLD, name: '내가 지은 이름' }
    store.saveLearned.mockResolvedValueOnce(ok(['l0000a001'], [RENAMED]))
    await worker.emit(auto({ update: [{ id: RENAMED.id, to: '새 문장' }] }))
    await waitFor(() => expect(now().band?.phase).toBe('learned'))
    act(() => now().openDialog('v1'))
    await worker.emit(DRAFT)
    const picked = { ...AUTO, to: '{좌우} {레벨} 고친 문장', when: { ...WHEN, chartWords: ['C-arm'] } }
    const { name: _conditionName, ...kept } = picked
    store.saveLearned.mockResolvedValueOnce(ok(['l0000a004'], []))
    await act(async () => now().saveDialog({ rules: [{ ...picked, update: RENAMED.id }, { ...picked, update: null }, { ...picked, update: 'l0000a009' }], styles: [] }))
    expect(_conditionName).toBe('LA358 · 허리')
    expect(store.saveLearned).toHaveBeenLastCalledWith({ fake: 'sb' }, {
      remove: ['l0000a001'],
      add: [picked],
      update: [{ ...kept, name: '내가 지은 이름', id: RENAMED.id, left: 3 }, { ...kept, id: 'l0000a009', left: 3 }],
    })
    // 이름을 모르는 기존 학습은 이름 칸을 보내지 않는다: 서버의 지금 이름이 남는다
    const sent = store.saveLearned.mock.lastCall![1] as { update: Record<string, unknown>[] }
    expect('name' in sent.update[1]).toBe(false)
  })

  it('AC-9301.6: 학습 창 저장이 실패하면 창은 그대로이고 그 번호가 보인다', async () => {
    const { worker, now } = start()
    act(() => now().openDialog('v1'))
    await worker.emit(DRAFT)
    store.saveLearned.mockResolvedValueOnce({ ok: false, code: 'E-LEARN-SAVE', limit: true })
    await act(async () => now().saveDialog({ rules: [{ ...AUTO, update: null }], styles: [] }))
    expect(now().dialog).toEqual({ draft: DRAFT, saving: false, error: 'E-LEARN-SAVE' })
  })
})

describe('AC-9303.2 모양 고침', () => {
  it('AC-9303.2: [모든 메모에]는 서버 병원 문구를 다시 읽어 그 설정 칸만 바꿔 저장하고 위에 알린다(학습은 만들지 않는다). 저장은 학습 저장과 같은 줄에 서는 applyStyleChange가 하고 설정 전체를 덮어쓰지 않는다', async () => {
    const { worker, onSaved, now } = start()
    await worker.emit(auto({ add: [], style: [STYLE] }))
    await act(async () => now().styleAll(0))
    expect(store.saveLearned).not.toHaveBeenCalled()
    expect(store.applyStyleChange).toHaveBeenCalledWith({ fake: 'sb' }, STYLE)
    expect(store.readHospitalSettings).not.toHaveBeenCalled()
    expect(store.writeHospitalSettings).not.toHaveBeenCalled()
    expect(store.startHospitalSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(now().band).toMatchObject({ styles: [{ change: STYLE, state: 'all' }] }))
    expect(onSaved).toHaveBeenCalledTimes(1)
  })

  it('AC-9303.2: [모든 메모에] 저장이 실패하면 그 물음이 저장 못 함이고 위에 알리지 않는다', async () => {
    const { worker, onSaved, now } = start()
    store.applyStyleChange.mockResolvedValueOnce('failed')
    await worker.emit(auto({ add: [], style: [STYLE] }))
    await act(async () => now().styleAll(0))
    await waitFor(() => expect(now().band).toMatchObject({ styles: [{ change: STYLE, state: 'failed' }] }))
    expect(onSaved).not.toHaveBeenCalled()
  })

  it('AC-9303.2: 학습 창 [저장]에서 [모든 메모에]를 고른 모양 고침도 applyStyleChange로 그 칸만 저장한다(설정 전체를 쓰지 않는다)', async () => {
    const { worker, now } = start()
    act(() => now().openDialog('v1'))
    await worker.emit(DRAFT)
    await act(async () => now().saveDialog({ rules: [], styles: [STYLE] }))
    expect(store.applyStyleChange).toHaveBeenCalledWith({ fake: 'sb' }, STYLE)
    expect(store.writeHospitalSettings).not.toHaveBeenCalled()
    await waitFor(() => expect(now().dialog).toBeNull())
    expect(now().band).toEqual({ visitKey: 'v1', phase: 'saved' })
    store.applyStyleChange.mockResolvedValueOnce('failed')
    act(() => now().openDialog('v1'))
    await worker.emit(DRAFT)
    await act(async () => now().saveDialog({ rules: [], styles: [STYLE] }))
    expect(now().dialog).toEqual({ draft: DRAFT, saving: false, error: 'E-LEARN-SAVE' })
  })

  it('AC-9303.2: [이 학습만]은 그 진료의 학습 창 재료를 물어 그 모양 고침 줄을 다른 줄처럼 학습한다(조건은 그 진료 처방 코드 + 부위)', async () => {
    const { worker, now } = start()
    await worker.emit(auto({ add: [], style: [STYLE] }))
    act(() => now().styleLine(0))
    expect(worker.posted).toEqual([{ type: 'learnDraft', visitKey: 'v1' }])
    const styled: LearnDraftLine = { kind: 'replace', old: '◈Lt knee', new: '◈좌측 knee', before: '', from: '{좌우} {부위}', to: '좌측 {부위}', after: '', update: null, skip: 'style', style: STYLE }
    await worker.emit({ ...DRAFT, diffs: [styled] })
    await waitFor(() => expect(store.saveLearned).toHaveBeenCalledTimes(1))
    expect(store.saveLearned).toHaveBeenCalledWith({ fake: 'sb' }, { add: [{ name: 'LA358 · 허리', kind: 'replace', from: '{좌우} {부위}', to: '좌측 {부위}', after: '', when: WHEN, on: true, left: 3 }] })
    await waitFor(() => expect(now().band).toMatchObject({ styles: [{ change: STYLE, state: 'line' }] }))
    expect(now().dialog).toBeNull()
  })

  it('AC-9303.2·AC-9301.5: [이 학습만]이 기존 학습(같은 줄 틀·조건)을 고치면 그 학습의 지금 이름은 그대로 둔다(조건 이름을 보내지 않는다)', async () => {
    const { worker, now } = start()
    await worker.emit(auto({ add: [], style: [STYLE] }))
    act(() => now().styleLine(0))
    const styled: LearnDraftLine = { kind: 'replace', old: '◈Lt knee', new: '◈좌측 knee', before: '', from: '{좌우} {부위}', to: '좌측 {부위}', after: '', update: 'l0000a002', skip: 'style', style: STYLE }
    await worker.emit({ ...DRAFT, diffs: [styled] })
    await waitFor(() => expect(store.saveLearned).toHaveBeenCalledTimes(1))
    expect(store.saveLearned).toHaveBeenCalledWith({ fake: 'sb' }, { update: [{ id: 'l0000a002', kind: 'replace', from: '{좌우} {부위}', to: '좌측 {부위}', after: '', when: WHEN, on: true, left: 3 }] })
    expect('name' in (store.saveLearned.mock.lastCall![1] as { update: object[] }).update[0]).toBe(false)
  })
})

describe('AC-9302.7·AC-9305 남은 확인과 처음 학습', () => {
  it('AC-9302.7: learnUsed를 받으면 tickLearned로 남은 확인을 바꾼다(실패해도 알리지 않는다)', async () => {
    const { worker, now } = start()
    store.tickLearned.mockResolvedValueOnce('failed')
    await worker.emit({ type: 'learnUsed', ids: ['l0000a001'], how: 'done' })
    await worker.emit({ type: 'learnUsed', ids: ['l0000a001'], how: 'edited' })
    expect(store.tickLearned.mock.calls).toEqual([
      [{ fake: 'sb' }, ['l0000a001'], 'done'],
      [{ fake: 'sb' }, ['l0000a001'], 'edited'],
    ])
    expect(now().band).toBeNull()
  })

  it('AC-9305.1·AC-9305.3: [처음 학습]은 firstLearn을 묻고 답을 쥔다. 확인한 종류는 addLearnKinds로 저장한다', async () => {
    const { worker, now } = start()
    act(() => now().askFirst())
    expect(worker.posted).toEqual([{ type: 'firstLearn' }])
    expect(now().first).toBeNull()
    await worker.emit({ type: 'firstLearn', total: 3, kinds: [] })
    expect(now().first).toEqual({ total: 3, kinds: [] })
    act(() => now().confirmKinds(['LA358|lumbar']))
    expect(store.addLearnKinds).toHaveBeenCalledWith({ fake: 'sb' }, ['LA358|lumbar'])
  })
})

describe('design.md 1절 울타리', () => {
  it('AC-9301.5: 저장은 memo/useLearned.ts가 TASK-5 저장 함수로만 한다(환자 줄 화면 rows/는 저장 함수를 부르지 않는다)', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/memo/useLearned.ts'), 'utf-8')
    expect(text).toContain("from '@/lib/storage/claimSettings'")
    expect(text).not.toMatch(/\b(localStorage|sessionStorage|indexedDB|console)\b/)
  })
})
