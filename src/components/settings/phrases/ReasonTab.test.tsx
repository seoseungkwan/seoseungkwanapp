// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_INTERVAL_CODES, DEFAULT_TWO_SITE_RULES, ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { ReasonTab } from './ReasonTab'

// 설정 '사유 문장' 묶음(memo-settings AC-3007.1, clinic-profile AC-6613.1·AC-6613.3 숨은 칸). 코드는 가짜다

afterEach(cleanup)

let latest: Phrases
function Harness({ start = ourClinicPhrases() }: { start?: Phrases }) {
  const [draft, setDraft] = useState(start)
  latest = draft
  return <ReasonTab draft={draft} errors={[]} onChange={setDraft} />
}

/** 엔진 기본값을 쓰는(세 칸이 없는) 문구 */
const emptied = () => {
  const phrases = ourClinicPhrases()
  delete phrases.TPL.intervalCodes
  delete phrases.TPL.twoSiteRules
  delete phrases.TPL.reasonPriority
  return phrases
}

const field = (label: string) => screen.getByLabelText(label) as HTMLInputElement
const follows = (a: HTMLElement, b: HTMLElement) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

describe('AC-6613.1 숨은 칸', () => {
  it("AC-6613.1: 지금 칸(주사 간격 사유·2부위 시술 사유·주사 간격 일수) 아래에 '주사 간격을 볼 처방코드'·'2부위로 보는 처방'·'두 사유가 겹칠 때'가 차례로 있다", () => {
    render(<Harness />)
    const order = ['주사 간격 사유', '2부위 시술 사유', '주사 간격 일수', '주사 간격을 볼 처방코드', '2부위로 보는 처방', '두 사유가 겹칠 때'].map(field)
    for (let at = 1; at < order.length; at += 1) expect(follows(order[at - 1], order[at])).toBe(true)
    expect(field('주사 간격을 볼 처방코드').value).toBe('LA358, KK090')
    expect(field('2부위로 보는 처방').tagName).toBe('TEXTAREA')
    expect(field('2부위로 보는 처방').value).toBe('KK090 = LA274, LA272\nKK061\nKK062')
    const priority = screen.getByLabelText('두 사유가 겹칠 때') as HTMLSelectElement
    expect([...priority.options].map((option) => option.textContent)).toEqual(['2부위 사유 먼저', '주사 간격 사유 먼저', '둘 다'])
    expect(priority.value).toBe('') // 원본 기본값 'twoSite'는 '2부위 사유 먼저'다
  })

  it('AC-6613.1: 비어 있으면 엔진 기본값이 흐린 글로 보이고, 비우면 칸을 지워 엔진 기본값을 쓴다', async () => {
    const user = userEvent.setup()
    render(<Harness start={emptied()} />)
    expect(field('주사 간격을 볼 처방코드').value).toBe('')
    expect(field('주사 간격을 볼 처방코드').placeholder).toBe(DEFAULT_INTERVAL_CODES)
    expect(field('2부위로 보는 처방').value).toBe('')
    expect(field('2부위로 보는 처방').placeholder).toBe(DEFAULT_TWO_SITE_RULES)
    await user.type(field('주사 간격을 볼 처방코드'), 'LA358')
    expect(latest.TPL.intervalCodes).toBe('LA358')
    await user.clear(field('주사 간격을 볼 처방코드'))
    expect(Object.hasOwn(latest.TPL, 'intervalCodes')).toBe(false)
    await user.type(field('2부위로 보는 처방'), 'KK090 = LA274{Enter}KK061')
    expect(latest.TPL.twoSiteRules).toBe('KK090 = LA274\nKK061')
    await user.clear(field('2부위로 보는 처방'))
    expect(Object.hasOwn(latest.TPL, 'twoSiteRules')).toBe(false)
  })

  it("AC-6613.1: '두 사유가 겹칠 때'는 interval·both를 쓰고 '2부위 사유 먼저'는 값을 지운다", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const priority = screen.getByLabelText('두 사유가 겹칠 때')
    await user.selectOptions(priority, 'interval')
    expect(latest.TPL.reasonPriority).toBe('interval')
    await user.selectOptions(priority, 'both')
    expect(latest.TPL.reasonPriority).toBe('both')
    await user.selectOptions(priority, '')
    expect(Object.hasOwn(latest.TPL, 'reasonPriority')).toBe(false)
  })
})

describe('AC-6613.3 틀린 값', () => {
  it('AC-6613.3: 검사(validatePhrases)의 까닭을 그 칸 아래에 보인다', () => {
    const errors = [
      { path: 'TPL.intervalCodes', message: '코드 칸 오류' },
      { path: 'TPL.twoSiteRules', message: '2부위 칸 오류' },
      { path: 'TPL.reasonPriority', message: '고르기 오류' },
    ]
    render(<ReasonTab draft={ourClinicPhrases()} errors={errors} onChange={() => {}} />)
    for (const [label, message] of [
      ['주사 간격을 볼 처방코드', '코드 칸 오류'],
      ['2부위로 보는 처방', '2부위 칸 오류'],
      ['두 사유가 겹칠 때', '고르기 오류'],
    ]) {
      expect(field(label).getAttribute('aria-invalid')).toBe('true')
      expect(follows(field(label), screen.getByText(message))).toBe(true)
    }
  })
})
