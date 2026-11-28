// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ourClinicPhrases, slotWords, type LearnRule } from '@/lib/precheck/memo'
import { LearnEditor, type LearnChips } from './LearnEditor'

// 학습 칸 고치기(claim-learn AC-9301.3·AC-9301.4·AC-9304.2, 시안 ?s=learn·?s=list, notes '학습 창'). 설정 학습 탭 [고치기]와 청구 학습 창이 같이 쓴다.
// 환자 자료 없이 이름·조건·문장·바뀌는 칸 단추·노란 안내만 그린다. 학습·칩 값은 지어낸 값이다

afterEach(cleanup)

const words = slotWords(ourClinicPhrases())
const RULE: LearnRule = {
  id: 'l0000abcd',
  name: 'LA358 · 허리',
  kind: 'replace',
  from: '{좌우} {레벨} MBB 시행 (C-arm guide 하에)',
  to: '{좌우} {레벨} 내측지 신경차단술(MBB) 시행, C-arm 유도 하',
  after: '',
  when: { codes: ['LA358', 'KK090'], regions: ['lumbar'], chartWords: [], withCodes: [], doctors: [] },
  on: true,
  left: 3,
  made: '2026-11-28',
}
const CHIPS: LearnChips = {
  codes: ['LA358', 'KK090'],
  regions: ['lumbar'],
  withCodes: ['KK001', 'MM001'],
  doctors: [{ code: 'D01', name: '김원장' }],
  names: { KK001: '하이알 주', MM001: '물리치료 기본' },
}

let latest: LearnRule
function Harness({ start = RULE, chips }: { start?: LearnRule; chips?: LearnChips }) {
  const [rule, setRule] = useState(start)
  latest = rule
  return <LearnEditor rule={rule} words={words} chips={chips} onChange={setRule} />
}
const box = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const chip = (name: string) => screen.getByRole('button', { name })
const sentence = () => screen.getByRole('textbox', { name: '학습할 문장' }) as HTMLInputElement
const withSentence = (to: string): LearnRule => ({ ...RULE, to })

describe('AC-9301.3 조건 체크리스트', () => {
  it("AC-9301.3: '이럴 때 쓰기' 다섯 줄 — 칩은 받은 목록이고 처음 켜짐은 학습 조건 그대로다", () => {
    render(<Harness chips={CHIPS} />)
    expect(screen.getByRole('heading', { name: '이럴 때 쓰기' })).toBeTruthy()
    expect(screen.getByText('켠 조건이 모두 맞을 때만 써요.')).toBeTruthy()
    expect(box('처방 코드').checked).toBe(true)
    expect(box('부위').checked).toBe(true)
    expect(box('차트에 쓴 말').checked).toBe(false)
    expect(box('함께 한 다른 시술').checked).toBe(false)
    expect(box('진료한 원장님').checked).toBe(false)
    expect(chip('LA358').getAttribute('aria-pressed')).toBe('true')
    expect(chip('KK090').getAttribute('aria-pressed')).toBe('true')
    expect(chip('허리').getAttribute('aria-pressed')).toBe('true')
    expect(chip('하이알 주').getAttribute('aria-pressed')).toBe('false')
    expect(chip('물리치료 기본').getAttribute('aria-pressed')).toBe('false')
    expect(chip('김원장').getAttribute('aria-pressed')).toBe('false')
    expect((screen.getByRole('textbox', { name: '차트에 쓴 말' }) as HTMLInputElement).placeholder).toBe('예: C-arm')
  })

  it('AC-9301.3: 칩을 누르면 그 조건만 바뀌고, 줄 체크를 끄면 그 줄 칩이 모두 꺼지고 다시 켜면 모두 켜진다', async () => {
    const user = userEvent.setup()
    render(<Harness chips={CHIPS} />)
    await user.click(chip('KK090'))
    expect(latest.when.codes).toEqual(['LA358'])
    await user.click(box('처방 코드'))
    expect(latest.when.codes).toEqual([])
    expect(box('처방 코드').checked).toBe(false)
    await user.click(box('처방 코드'))
    expect(latest.when.codes).toEqual(['LA358', 'KK090'])
    await user.click(chip('하이알 주'))
    expect(latest.when.withCodes).toEqual(['KK001'])
    expect(box('함께 한 다른 시술').checked).toBe(true)
    await user.click(chip('김원장'))
    expect(latest.when.doctors).toEqual(['D01'])
    expect(latest.when.regions).toEqual(['lumbar'])
  })

  it('AC-9301.3: 차트에 쓴 말을 적으면 그 줄이 켜지고 쉼표로 나눈 말이 들어가며, 끄면 빠진다', async () => {
    const user = userEvent.setup()
    render(<Harness chips={CHIPS} />)
    await user.type(screen.getByRole('textbox', { name: '차트에 쓴 말' }), 'C-arm, MBB')
    expect(box('차트에 쓴 말').checked).toBe(true)
    expect(latest.when.chartWords).toEqual(['C-arm', 'MBB'])
    await user.click(box('차트에 쓴 말'))
    expect(latest.when.chartWords).toEqual([])
    await user.click(box('차트에 쓴 말'))
    expect(latest.when.chartWords).toEqual(['C-arm', 'MBB'])
  })

  it("AC-9301.3: 켠 조건이 하나도 없으면 '조건을 하나 이상 골라 주세요.'가 보인다", async () => {
    const user = userEvent.setup()
    render(<Harness chips={CHIPS} />)
    expect(screen.queryByText('조건을 하나 이상 골라 주세요.')).toBeNull()
    await user.click(box('처방 코드'))
    expect(screen.queryByText('조건을 하나 이상 골라 주세요.')).toBeNull()
    await user.click(box('부위'))
    expect(screen.getByText('조건을 하나 이상 골라 주세요.')).toBeTruthy()
    expect(latest.when).toEqual({ codes: [], regions: [], chartWords: [], withCodes: [], doctors: [] })
  })

  it("AC-9301.3: 진료의를 모르는 진료(칩에 진료의 없음)면 '진료한 원장님' 줄이 없다", () => {
    render(<Harness chips={{ ...CHIPS, doctors: [] }} />)
    expect(screen.queryByRole('checkbox', { name: '진료한 원장님' })).toBeNull()
    expect(screen.getByRole('checkbox', { name: '함께 한 다른 시술' })).toBeTruthy()
  })

  it('AC-9304.2: 칩 목록이 없으면(설정 학습 탭) 그 학습의 조건 값만 칩이고, 끈 칩도 그 자리에 남는다', async () => {
    const user = userEvent.setup()
    const start: LearnRule = { ...RULE, when: { codes: ['LA358'], regions: ['lumbar'], chartWords: ['C-arm'], withCodes: [], doctors: ['D01'] } }
    render(<Harness start={start} />)
    const conditions = screen.getByRole('group', { name: '이럴 때 쓰기' })
    expect(within(conditions).getAllByRole('button').map((b) => b.textContent)).toEqual(['LA358', '허리', 'D01'])
    expect((screen.getByRole('textbox', { name: '차트에 쓴 말' }) as HTMLInputElement).value).toBe('C-arm')
    expect(box('차트에 쓴 말').checked).toBe(true)
    expect(box('진료한 원장님').checked).toBe(true)
    await user.click(chip('LA358'))
    expect(latest.when.codes).toEqual([])
    expect(chip('LA358').getAttribute('aria-pressed')).toBe('false')
    await user.click(chip('LA358'))
    expect(latest.when.codes).toEqual(['LA358'])
  })
})

describe('AC-9301.4 학습할 문장', () => {
  it("AC-9301.4: '학습할 문장' 칸과 바뀌는 칸 단추 {좌우}{레벨}{부위}, 작은 글이 있다", () => {
    render(<Harness chips={CHIPS} />)
    expect(screen.getByRole('heading', { name: '학습할 문장' })).toBeTruthy()
    expect(sentence().value).toBe(RULE.to)
    for (const name of ['{좌우}', '{레벨}', '{부위}']) expect(screen.getByRole('button', { name })).toBeTruthy()
    expect(screen.getByText('환자마다 다른 칸은 단추로 바꿔 두세요. 다음 진료의 값이 들어가요.')).toBeTruthy()
  })

  it('AC-9301.4: 바뀌는 칸 단추를 누르면 커서 자리에 그 글자가 들어간다(칸을 누른 적 없으면 끝에)', async () => {
    const user = userEvent.setup()
    render(<Harness start={withSentence('내측지 시행')} />)
    await user.click(screen.getByRole('button', { name: '{부위}' }))
    expect(latest.to).toBe('내측지 시행{부위}')
    await user.click(sentence())
    sentence().setSelectionRange(0, 0)
    await user.click(screen.getByRole('button', { name: '{좌우}' }))
    expect(latest.to).toBe('{좌우}내측지 시행{부위}')
    sentence().setSelectionRange(4, 4)
    await user.click(screen.getByRole('button', { name: '{레벨}' }))
    expect(latest.to).toBe('{좌우}{레벨}내측지 시행{부위}')
  })

  it("AC-9301.4: 글자 그대로 남은 좌우·레벨·부위 글자는 노란 안내와 [{…}로 바꾸기]이고, 누르면 바뀌는 칸으로 바뀐다", async () => {
    const user = userEvent.setup()
    render(<Harness start={withSentence('Rt L4,5 knee IA 시행')} />)
    expect(screen.getByText('‘Rt’가 글자 그대로 있어요. 다른 환자에게도 ‘Rt’로 나와요.')).toBeTruthy()
    expect(screen.getByText('‘L4,5’가 글자 그대로 있어요. 다른 환자에게도 ‘L4,5’로 나와요.')).toBeTruthy()
    expect(screen.getByText('‘knee’가 글자 그대로 있어요. 다른 환자에게도 ‘knee’로 나와요.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '{부위}로 바꾸기' }))
    expect(latest.to).toBe('Rt L4,5 {부위} IA 시행')
    await user.click(screen.getByRole('button', { name: '{레벨}로 바꾸기' }))
    await user.click(screen.getByRole('button', { name: '{좌우}로 바꾸기' }))
    expect(latest.to).toBe('{좌우} {레벨} {부위} IA 시행')
    expect(screen.queryByText(/글자 그대로 있어요/)).toBeNull()
  })

  it('AC-9301.4: 바뀌는 칸만 있으면 노란 안내가 없다', () => {
    render(<Harness />)
    expect(screen.queryByText(/글자 그대로 있어요/)).toBeNull()
  })

  it('AC-9304.2: 줄 뺌 학습은 문장 칸이 없고 이름·조건만 고친다', () => {
    render(<Harness start={{ ...RULE, kind: 'remove', to: '' }} />)
    expect(screen.queryByRole('textbox', { name: '학습할 문장' })).toBeNull()
    expect(screen.getByRole('textbox', { name: '이름' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: '처방 코드' })).toBeTruthy()
  })
})

describe('AC-9304.2 이름', () => {
  it('AC-9304.2: 이름 칸을 고치면 학습 이름이 바뀐다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const name = screen.getByRole('textbox', { name: '이름' }) as HTMLInputElement
    expect(name.value).toBe('LA358 · 허리')
    await user.clear(name)
    await user.type(name, '허리 MBB')
    expect(latest.name).toBe('허리 MBB')
  })
})
