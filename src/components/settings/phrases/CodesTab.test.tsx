// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import type { DayPayload } from '@/types/payload'
import { CodesTab } from './CodesTab'

// '처방코드' 묶음(memo-settings AC-3004.2~3004.5, 시안 #codes, clinic-profile AC-6608.5 약 역할). 코드·이름은 가짜다

afterEach(cleanup)

const TODAY = '2026-11-08'
function day(date: string, rx: [code: string, name: string, type: string][]): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: date,
    partial: false,
    totals: {} as DayPayload['totals'],
    rx: rx.map(([code, name, type]) => ({ code, name, type, patients: 1, newPatients: 0, returning: 1 })),
    groups: [],
    revisit: { cohort: 0, within7: null, within14: null },
  }
}
const DAYS = [
  day('2026-11-07', [
    ['AA254', '재진진찰료', '진찰'],
    ['A55', '소론도정', '약'],
    ['KK090', '관절강내주사', '처치'],
  ]),
  day('2026-01-02', [['OLD1', '옛 처방', '처치']]),
]
const DICTIONARY = Object.keys(ourClinicPhrases().CODEMAP).length

let latest: Phrases
function Harness({ days = DAYS, state = 'ready', onRetry = () => {}, start = ourClinicPhrases }: { days?: DayPayload[]; state?: 'idle' | 'reading' | 'ready' | 'failed'; onRetry?: () => void; start?: () => Phrases }) {
  const [saved] = useState(start)
  const [draft, setDraft] = useState(start)
  latest = draft
  return <CodesTab draft={draft} saved={saved} errors={[]} onChange={setDraft} days={days} state={state} today={TODAY} onRetry={onRetry} />
}
// 줄·칸은 역할(role) 찾기 대신 tbody의 tr·td로 센다: 역할 찾기는 44줄 표에서 느려 전체 시험을 함께 돌리면 5초를 넘는다.
// 표의 역할·이름표는 AC-3004.2 첫 시험이 따로 확인한다
const table = () => screen.getByLabelText('처방코드 목록')
const cellsOf = (row: HTMLElement) => row.querySelectorAll(':scope > td')
const codeOf = (row: HTMLElement) => cellsOf(row)[0].textContent?.replace('새 코드', '').trim()
/** 코드 줄(머리 줄과 코드별 메모 문구를 고치는 줄은 뺀다) */
const codeRows = () => [...table().querySelectorAll<HTMLElement>(':scope > tbody > tr')].filter((row) => cellsOf(row).length > 1)
const rowOf = (code: string) => {
  const row = codeRows().find((r) => codeOf(r) === code)
  if (!row) throw new Error(`${code} 줄이 없다`)
  return row
}
const codes = () => codeRows().map(codeOf)

describe('AC-3004.2 처방코드 목록 화면', () => {
  it('AC-3004.2: 최근 3개월 코드와 사전 코드가 새 코드 먼저 보이고, 줄마다 비트 이름·종류·마지막 처방일·새 코드 표시가 있다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByRole('table', { name: '처방코드 목록' })).toBe(table())
    const shown = codes()
    expect(shown.slice(0, 2)).toEqual(['A55', 'AA254'])
    expect(shown).toHaveLength(DICTIONARY + 2)
    expect(shown).not.toContain('OLD1')
    const aa = rowOf('AA254')
    expect(within(aa).getByText('새 코드')).toBeTruthy()
    expect(within(aa).getByText('재진진찰료 · 진찰')).toBeTruthy()
    expect(within(aa).getByText('11-07')).toBeTruthy()
    expect(within(rowOf('KK090')).queryByText('새 코드')).toBeNull()
    expect(screen.getByText(`최근 3개월에 처방된 코드와 사전 코드 ${DICTIONARY + 2}개`)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '전체 보기' }))
    expect(codes()).toContain('OLD1')
    expect(screen.getByText(`저장된 통계 전체 기간에 처방된 코드와 사전 코드 ${DICTIONARY + 3}개`)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '최근 3개월만' }))
    expect(codes()).not.toContain('OLD1')
  })
})

describe('AC-3004.3 코드 고치기', () => {
  it('AC-3004.3: 메모 이름·구분·부위·줄 순서를 고치면 CODEMAP과 memoRules.order에 들어간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const kk = rowOf('KK090')
    const name = within(kk).getByLabelText('KK090 메모에 쓸 이름')
    await user.clear(name)
    await user.type(name, 'IA주사')
    await user.selectOptions(within(rowOf('KK090')).getByLabelText('KK090 구분'), 'note')
    await user.selectOptions(within(rowOf('KK090')).getByLabelText('KK090 부위'), 'knee')
    expect(latest.CODEMAP.KK090).toEqual({ n: 'IA주사', k: 'note', rg: 'knee' })
    await user.selectOptions(within(rowOf('KK090')).getByLabelText('KK090 부위'), '')
    expect(latest.CODEMAP.KK090.rg).toBeNull()
    await user.type(within(rowOf('KK090')).getByLabelText('KK090 줄 순서'), '1')
    expect(latest.memoRules?.order).toEqual({ KK090: 1 })
    await user.clear(within(rowOf('KK090')).getByLabelText('KK090 줄 순서'))
    expect(latest.memoRules?.order).toEqual({})
  })

  it('AC-3004.3: 코드별 메모 문구는 {항목} 칸으로 고친다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(within(rowOf('HA280')).getByRole('button', { name: 'HA280 메모 문구 고치기' }))
    const memo = screen.getByLabelText('HA280 코드별 메모 문구') as HTMLInputElement
    expect(memo.value).toBe('관절조영 시행')
    await user.clear(memo)
    await user.type(memo, '관절조영 시행')
    await user.click(within(screen.getByRole('group', { name: 'HA280 코드별 메모 문구 자동 채움 넣기' })).getByRole('button', { name: '{투여량}' }))
    expect(latest.CODEMAP.HA280.memo).toBe('관절조영 시행{투여량}')
    expect(within(rowOf('HA280')).getByText('관절조영 시행{투여량}')).toBeTruthy()
  })

  it('AC-3004.3: 새 코드는 구분을 고르면 비트 이름으로 사전에 들어가고, 정하기로 되돌리면 빠진다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect((within(rowOf('AA254')).getByLabelText('AA254 메모에 쓸 이름') as HTMLInputElement).placeholder).toBe('재진진찰료')
    await user.selectOptions(within(rowOf('AA254')).getByLabelText('AA254 구분'), 'proc')
    expect(latest.CODEMAP.AA254).toEqual({ n: '재진진찰료', k: 'proc', rg: null })
    expect(within(rowOf('AA254')).getByText('새 코드')).toBeTruthy()
    await user.selectOptions(within(rowOf('AA254')).getByLabelText('AA254 구분'), '')
    expect(latest.CODEMAP.AA254).toBeUndefined()
  })

  it('AC-3004.3: 찾기 칸은 코드·이름으로 거른다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const search = screen.getByLabelText('코드나 이름으로 찾기')
    await user.type(search, '소론')
    expect(codes()).toEqual(['A55'])
    await user.clear(search)
    await user.type(search, 'kk09')
    expect(codes()).toEqual(['KK090'])
    await user.clear(search)
    await user.type(search, 'MBB')
    expect(codes()).toContain('LA358')
  })
})

describe('AC-3004.4 새 코드 모두 제외', () => {
  it("AC-3004.4: '새 코드 모두 제외'는 보이는 새 코드를 모두 {n: 비트 이름, k: 'skip', rg: null}로 초안에 넣는다", async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByText('새 코드 2개')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '새 코드 모두 제외' }))
    expect(latest.CODEMAP.AA254).toEqual({ n: '재진진찰료', k: 'skip', rg: null })
    expect(latest.CODEMAP.A55).toEqual({ n: '소론도정', k: 'skip', rg: null })
    expect((within(rowOf('AA254')).getByLabelText('AA254 구분') as HTMLSelectElement).value).toBe('skip')
    expect(screen.queryByRole('button', { name: '새 코드 모두 제외' })).toBeNull()
  })

  it('AC-3004.4: 찾기로 거르면 보이는 새 코드만 넣고 이미 정한 새 코드는 그대로 둔다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(within(rowOf('AA254')).getByLabelText('AA254 구분'), 'proc')
    await user.type(screen.getByLabelText('코드나 이름으로 찾기'), 'A')
    await user.click(screen.getByRole('button', { name: '새 코드 모두 제외' }))
    expect(latest.CODEMAP.AA254.k).toBe('proc')
    expect(latest.CODEMAP.A55.k).toBe('skip')
  })
})

describe('AC-3004.5 통계를 못 읽음', () => {
  it("AC-3004.5: 사전의 코드만 보이고 '통계를 읽지 못했어요 · 다시 읽기' 안내가 있다", async () => {
    const user = userEvent.setup()
    const onRetry = vi.fn()
    render(<Harness days={[]} state="failed" onRetry={onRetry} />)
    expect(codes()).toHaveLength(DICTIONARY)
    expect(screen.queryByText('새 코드')).toBeNull()
    expect(screen.getByText('통계를 읽지 못했어요')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-3004.5: 읽는 중이면 사전 코드와 읽는 중 안내다', () => {
    render(<Harness days={DAYS} state="reading" />)
    expect(codes()).toHaveLength(DICTIONARY)
    expect(screen.getByText('통계를 읽는 중이에요…')).toBeTruthy()
  })
})

describe('AC-6608.5 약 역할 고르기', () => {
  const roleOf = (code: string) => within(rowOf(code)).getByLabelText(`${code} 역할`) as HTMLSelectElement
  const optionLabels = (select: HTMLSelectElement) => [...select.options].map((option) => option.textContent)

  it("AC-6608.5: 약 줄마다 '역할' 고르기 [자동]·[스테로이드]·[마취약]·[연골주사]·[아님]이 있고 처음은 [자동]이며 그 옆에 '보험코드 성분으로 정해요'가 보인다", () => {
    render(<Harness />)
    expect([...table().querySelectorAll('thead th')].map((th) => th.textContent)).toContain('역할')
    for (const code of ['A15', 'A19', 'A21', 'A41', 'A49']) {
      expect(roleOf(code).value).toBe('auto')
      expect(optionLabels(roleOf(code))).toEqual(['자동', '스테로이드', '마취약', '연골주사', '아님'])
      expect(within(rowOf(code)).getByText('보험코드 성분으로 정해요')).toBeTruthy()
    }
    // 비트 종류가 약인 새 코드도 약 줄이다. 약이 아닌 줄에는 없다
    expect(roleOf('A55').value).toBe('auto')
    expect(within(rowOf('KK090')).queryByLabelText('KK090 역할')).toBeNull()
    expect(within(rowOf('AA254')).queryByLabelText('AA254 역할')).toBeNull()
  })

  it('AC-6608.5: 고른 역할은 CODEMAP 줄 깃발로 들어간다: 하나만 true, [아님]은 셋 다 false, [자동]은 셋 다 지운다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const before = ourClinicPhrases().CODEMAP.A15
    await user.selectOptions(roleOf('A15'), 'steroid')
    expect(latest.CODEMAP.A15).toEqual({ ...before, steroid: true })
    expect(within(rowOf('A15')).queryByText('보험코드 성분으로 정해요')).toBeNull()
    await user.selectOptions(roleOf('A15'), 'localAnesthetic')
    expect(latest.CODEMAP.A15).toEqual({ ...before, localAnesthetic: true })
    await user.selectOptions(roleOf('A15'), 'cartilage')
    expect(latest.CODEMAP.A15).toEqual({ ...before, cartilage: true })
    await user.selectOptions(roleOf('A15'), 'none')
    expect(latest.CODEMAP.A15).toEqual({ ...before, steroid: false, localAnesthetic: false, cartilage: false })
    expect(roleOf('A15').value).toBe('none')
    await user.selectOptions(roleOf('A15'), 'auto')
    expect(latest.CODEMAP.A15).toEqual(before)
    expect(within(rowOf('A15')).getByText('보험코드 성분으로 정해요')).toBeTruthy()
  })

  it('AC-6608.5: 저장된 깃발이 있으면 그 역할이 골라져 보인다', () => {
    const start = () => {
      const phrases = ourClinicPhrases()
      phrases.CODEMAP.A49 = { ...phrases.CODEMAP.A49, cartilage: true }
      phrases.CODEMAP.A19 = { ...phrases.CODEMAP.A19, steroid: false, localAnesthetic: false, cartilage: false }
      phrases.CODEMAP.A21 = { ...phrases.CODEMAP.A21, steroid: true }
      return phrases
    }
    render(<Harness start={start} />)
    expect(roleOf('A49').value).toBe('cartilage')
    expect(roleOf('A19').value).toBe('none')
    expect(roleOf('A21').value).toBe('steroid')
    expect(roleOf('A15').value).toBe('auto')
  })

  it('AC-6608.5: 사전에 없는 새 약 코드에 역할을 고르면 약 구분으로 사전에 들어간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.selectOptions(roleOf('A55'), 'steroid')
    expect(latest.CODEMAP.A55).toEqual({ n: '소론도정', k: 'drug', rg: null, steroid: true })
  })
})
