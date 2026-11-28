// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ourClinicPhrases, slotWords } from '@/lib/precheck/memo'
import type { LearnDraftLine, StyleChange } from '@/lib/precheck/memo/learn'
import { LearnDialog, type LearnDraft } from './LearnDialog'

// 학습 창(claim-learn AC-9301.2~AC-9301.6·AC-9303, 시안 ?s=learn, notes '학습 창' 글 그대로). 줄 차이·조건 칩은 props로만 받는다. 글·코드·이름은 지어낸 것이다

afterEach(cleanup)

const line = (over: Partial<LearnDraftLine>): LearnDraftLine => ({ kind: 'replace', old: '', new: '', before: '', from: '', to: '', after: '', update: null, skip: null, style: null, ...over })
const STYLE: StyleChange = { field: 'sideStyle', label: '좌우 표기', from: 'Lt', to: '좌측', patch: { TPL: { ...ourClinicPhrases().TPL, sideStyle: 'ko' } } }
const DRAFT: LearnDraft = {
  type: 'learnDraft',
  visitKey: 'v1',
  ok: true,
  diffs: [
    line({ kind: 'replace', old: '◈Rt L4,5 가상시술 시행', new: '◈Rt L4,5 가상시술 시행 (C-arm)', from: '{좌우} 가상시술 {레벨} 시행', to: '{좌우} {레벨} 가상시술 시행 (C-arm)' }),
    line({ kind: 'add', new: '◈가상 관찰함', before: '◈Rt L4,5 가상시술 시행', to: '가상 관찰함', after: '{좌우} 가상시술 {레벨} 시행' }),
    line({ kind: 'remove', old: '◈가상 지울 줄', from: '가상 지울 줄', update: 'l0000a009' }),
    line({ kind: 'replace', old: '◈Lt knee 가상주사', new: '◈좌측 knee 가상주사', from: '{좌우} {부위} 가상주사', to: '좌측 {부위} 가상주사', skip: 'style', style: STYLE }),
    line({ kind: 'replace', old: '◈[부위 확인] 가상', new: '◈wrist 가상', skip: 'hole' }),
  ],
  codes: ['LA358', 'KK090'],
  withCodes: ['B9001'],
  regions: ['lumbar'],
  doctors: [{ code: 'D01', name: '가상원장' }],
  forbidden: ['가상환자가', '900001'],
  words: slotWords(ourClinicPhrases()),
}

function open(over: Partial<Parameters<typeof LearnDialog>[0]> = {}) {
  const on = { onCancel: vi.fn(), onSave: vi.fn() }
  render(<LearnDialog draft={DRAFT} saving={false} error={null} names={{ B9001: '가상 관절주' }} {...on} {...over} />)
  return { on, user: userEvent.setup() }
}
const dialog = () => screen.getByRole('dialog', { name: '학습 고치기 — 다음에도 이렇게 쓸까요?' })
const lines = () => within(dialog()).getByRole('group', { name: '고친 줄' })
const save = () => within(dialog()).getByRole('button', { name: /^저장/ }) as HTMLButtonElement

describe('AC-9301.2 학습 창: 고친 줄', () => {
  it('AC-9301.2: 제목·설명이 있고, 고친 줄마다 고르기 칸(처음 모두 켜짐)·꼬리표(바꿈·더함·뺌)·옛 줄(지움 줄)·새 줄·처방 코드가 있다. 빈칸을 채운 줄은 없다', () => {
    open()
    expect(within(dialog()).getByText('고친 줄을 학습해 두면, 조건이 맞는 다음 진료에 저절로 이렇게 나와요.')).toBeTruthy()
    const boxes = within(lines()).getAllByRole('checkbox') as HTMLInputElement[]
    expect(boxes).toHaveLength(4)
    expect(boxes.every((box) => box.checked)).toBe(true)
    expect(within(lines()).getAllByText(/^(바꿈|더함|뺌)$/).map((tag) => tag.textContent)).toEqual(['바꿈', '더함', '뺌', '바꿈'])
    expect(within(lines()).getByText('◈Rt L4,5 가상시술 시행').className).toContain('line-through')
    expect(within(lines()).getByText('◈Rt L4,5 가상시술 시행 (C-arm)').className).not.toContain('line-through')
    expect(within(lines()).getAllByText('처방 LA358, KK090')).toHaveLength(4)
    expect(within(lines()).queryByText('◈wrist 가상')).toBeNull()
  })
})

describe('AC-9301.3 학습 창: 조건', () => {
  it('AC-9301.3: 처방 코드·부위 칩은 처음 켜지고 차트에 쓴 말·함께 한 다른 시술·진료한 원장님은 꺼져 있다', () => {
    open()
    const box = (name: string) => within(dialog()).getByRole('checkbox', { name }) as HTMLInputElement
    expect(box('처방 코드').checked).toBe(true)
    expect(box('부위').checked).toBe(true)
    expect(box('차트에 쓴 말').checked).toBe(false)
    expect(box('함께 한 다른 시술').checked).toBe(false)
    expect(box('진료한 원장님').checked).toBe(false)
    expect(within(dialog()).getByRole('button', { name: '가상 관절주' }).getAttribute('aria-pressed')).toBe('false')
    expect(within(dialog()).getByRole('button', { name: '가상원장' })).toBeTruthy()
  })

  it('AC-9301.3: 진료의를 모르는 진료면 진료한 원장님 줄이 없다', () => {
    open({ draft: { ...DRAFT, doctors: [] } })
    expect(within(dialog()).queryByRole('checkbox', { name: '진료한 원장님' })).toBeNull()
  })

  it("AC-9301.3: 켠 조건이 하나도 없으면 [저장]이 막히고 '조건을 하나 이상 골라 주세요.'가 보인다", async () => {
    const { user } = open()
    await user.click(within(dialog()).getByRole('checkbox', { name: '처방 코드' }))
    await user.click(within(dialog()).getByRole('checkbox', { name: '부위' }))
    expect(within(dialog()).getByText('조건을 하나 이상 골라 주세요.')).toBeTruthy()
    expect(save().disabled).toBe(true)
  })
})

describe('AC-9301.4·AC-9301.5 학습할 문장과 저장', () => {
  it('AC-9301.4: 학습할 줄마다 문장 칸(저절로 바꾼 칸 그대로)과 바뀌는 칸 단추가 있다. 뺀 줄·모양 고침 줄은 문장 칸이 없다', () => {
    open()
    const fields = within(dialog()).getAllByRole('textbox', { name: /학습할 문장/ }) as HTMLInputElement[]
    expect(fields.map((field) => field.value)).toEqual(['{좌우} {레벨} 가상시술 시행 (C-arm)', '가상 관찰함'])
    expect(within(dialog()).getAllByRole('button', { name: '{좌우}' })).toHaveLength(2)
  })

  it('AC-9301.5: [저장]은 켠 줄마다 학습(조건 같이, 이름은 조건 이름, 남은 확인 3)을 올린다. 끈 줄은 빠진다', async () => {
    const { on, user } = open()
    const field = within(dialog()).getAllByRole('textbox', { name: /학습할 문장/ })[1]
    await user.clear(field)
    await user.type(field, '가상 30분 관찰함')
    await user.click(within(lines()).getAllByRole('checkbox')[0])
    await user.click(save())
    expect(on.onSave).toHaveBeenCalledTimes(1)
    const { rules, styles } = on.onSave.mock.calls[0][0]
    const when = { codes: ['LA358', 'KK090'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] }
    expect(rules).toEqual([
      { name: 'LA358, KK090 · 허리', kind: 'add', from: '', to: '가상 30분 관찰함', after: '{좌우} 가상시술 {레벨} 시행', when, on: true, left: 3, update: null },
      { name: 'LA358, KK090 · 허리', kind: 'remove', from: '가상 지울 줄', to: '', after: '', when, on: true, left: 3, update: 'l0000a009' },
    ])
    expect(styles).toEqual([])
    expect(JSON.stringify(on.onSave.mock.calls[0][0])).not.toMatch(/가상환자가|900001/)
  })

  it('AC-9301.5: 문장이나 차트 말에 전화번호 모양·그 진료 환자 이름이 있으면 저장하지 않고 E-LEARN-PERSONAL 안내다', async () => {
    const { on, user } = open()
    const field = within(dialog()).getAllByRole('textbox', { name: /학습할 문장/ })[1]
    await user.clear(field)
    await user.type(field, '가상환자가 관찰함')
    await user.click(save())
    expect(on.onSave).not.toHaveBeenCalled()
    expect(within(dialog()).getByText('오류 번호 E-LEARN-PERSONAL')).toBeTruthy()
    await user.clear(field)
    await user.type(field, '010-1234-5678 관찰함')
    await user.click(save())
    expect(on.onSave).not.toHaveBeenCalled()
  })

  it('AC-9301.6: 저장 중이면 [저장 중…]으로 막히고, 실패(E-LEARN-SAVE)면 창은 그대로 안내가 보이며 다시 누를 수 있다. [취소]는 닫는다', async () => {
    open({ saving: true })
    expect(save().textContent).toBe('저장 중…')
    expect(save().disabled).toBe(true)
    cleanup()
    const { on, user } = open({ error: 'E-LEARN-SAVE' })
    expect(within(dialog()).getByText('학습을 저장하지 못했어요')).toBeTruthy()
    expect(save().disabled).toBe(false)
    await user.click(within(dialog()).getByRole('button', { name: '취소' }))
    expect(on.onCancel).toHaveBeenCalledTimes(1)
  })

  it('AC-9301.5·AC-9301.6: 창은 화면 높이를 넘지 않고 가운데 내용(고친 줄·조건·문장)만 세로로 스크롤되며, [취소]·[저장] 줄과 저장 실패 안내는 스크롤 칸 밖 맨 아래에 늘 보인다(시안 ?s=learn)', () => {
    const classes = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/)
    open({ error: 'E-LEARN-SAVE' })
    const box = dialog()
    expect(classes(box)).toEqual(expect.arrayContaining(['flex', 'flex-col', 'max-h-full']))
    const scroll = [...box.children].find((element) => classes(element).includes('overflow-y-auto'))!
    expect(scroll).toBeTruthy()
    expect(classes(scroll)).toEqual(expect.arrayContaining(['min-h-0', 'flex-1']))
    expect(scroll.contains(lines())).toBe(true)
    expect(scroll.contains(within(box).getByText('학습할 문장'))).toBe(true)
    const footer = box.lastElementChild!
    expect(footer.tagName).toBe('FOOTER')
    expect(classes(footer)).toContain('shrink-0')
    expect(footer.contains(save())).toBe(true)
    expect(footer.contains(within(box).getByRole('button', { name: '취소' }))).toBe(true)
    expect(scroll.contains(save())).toBe(false)
    // 저장 실패 안내는 스크롤 칸과 단추 줄 사이(문장 칸의 노란 안내와 섞이지 않게 그 칸 안에서만 찾는다)
    const errorBox = footer.previousElementSibling!
    expect(errorBox).not.toBe(scroll)
    expect(scroll.nextElementSibling).toBe(errorBox)
    expect(within(errorBox as HTMLElement).getByText('오류 번호 E-LEARN-SAVE')).toBeTruthy()
    expect(classes(errorBox)).toContain('shrink-0')
    expect(box.firstElementChild!.tagName).toBe('HEADER')
    expect(classes(box.firstElementChild!)).toContain('shrink-0')
  })
})

describe('AC-9303 모양 고침 물음', () => {
  it("AC-9303.1: 알아보는 모양 고침인 줄 위에 '전체에 적용' 물음과 [모든 메모에]·[이 학습만]이 있다", () => {
    open()
    expect(within(lines()).getByText('이 고침은 모든 메모의 좌우 표기예요. 모든 메모에서 ‘Lt’을 ‘좌측’으로 바꿀까요?')).toBeTruthy()
    expect(within(lines()).getAllByRole('button', { name: /^(모든 메모에|이 학습만)$/ })).toHaveLength(2)
  })

  it('AC-9303.2: [모든 메모에]는 그 모양 고침을 올리고 그 줄은 학습하지 않는다. [이 학습만]은 그 줄을 다른 줄처럼 학습한다', async () => {
    const { on, user } = open()
    await user.click(within(lines()).getByRole('button', { name: '모든 메모에' }))
    expect(within(lines()).getByRole('button', { name: '모든 메모에' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(save())
    expect(on.onSave.mock.calls[0][0].styles).toEqual([STYLE])
    expect(on.onSave.mock.calls[0][0].rules.map((rule: { to: string }) => rule.to)).not.toContain('좌측 {부위} 가상주사')
    await user.click(within(lines()).getByRole('button', { name: '이 학습만' }))
    expect(within(dialog()).getAllByRole('textbox', { name: /학습할 문장/ })).toHaveLength(3)
    await user.click(save())
    expect(on.onSave.mock.calls[1][0].styles).toEqual([])
    expect(on.onSave.mock.calls[1][0].rules.map((rule: { to: string }) => rule.to)).toContain('좌측 {부위} 가상주사')
  })

  it('AC-9303.3: 모양 고침이 아닌 줄에는 묻지 않는다', () => {
    open({ draft: { ...DRAFT, diffs: DRAFT.diffs.slice(0, 2) } })
    expect(within(dialog()).queryByText(/이 고침은 모든 메모의/)).toBeNull()
    expect(within(dialog()).queryByRole('button', { name: '모든 메모에' })).toBeNull()
  })
})

describe('AC-9301 학습 창 울타리', () => {
  it('AC-9301.5: 학습 창은 네트워크·저장소·console·supabase를 쓰지 않는다(저장은 위가 한다). 칸은 설정의 LearnEditor 부분을 쓴다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/LearnDialog.tsx'), 'utf-8')
    expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase)\b/)
    expect(text).toContain("from '@/components/settings/phrases/LearnEditor'")
  })
})
