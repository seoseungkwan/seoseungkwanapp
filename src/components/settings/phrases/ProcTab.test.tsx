// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { DEFAULT_MAIN_CENTRAL_CODES, ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { ProcTab } from './ProcTab'

// 설정 '시술별 문구와 약' 묶음(memo-settings AC-3007.3, AC-3002.6, clinic-profile AC-6613.2 Central 시술 처방코드)

afterEach(cleanup)

let latest: Phrases
function Harness({ start = ourClinicPhrases() }: { start?: Phrases }) {
  const [draft, setDraft] = useState(start)
  latest = draft
  return <ProcTab draft={draft} errors={[]} onChange={setDraft} />
}

describe('AC-3007.3 시술별 문구와 약', () => {
  it('AC-3007.3: 지금 시술 문구 11칸이 {항목} 칸으로 있다', () => {
    render(<Harness />)
    for (const label of ['기본 시술 문구', 'Central 시술 문구', 'Peripheral 시술 문구', '경부 CPB', 'SNB 문구', 'ICNB', '연골주사', 'K-L grade', '연골주사 포함 IA', '일반 IA', '건초내주사']) {
      expect(screen.getByRole('group', { name: `${label} 자동 채움 넣기` })).toBeTruthy()
    }
    expect((screen.getByLabelText('일반 IA') as HTMLInputElement).value).toBe('IA injection of - {부위}{약제}')
  })

  it('AC-3007.3: 시술 이름별 문구를 더하고 고치고 지운다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const group = screen.getByRole('group', { name: '시술 이름별 문구' })
    await user.type(within(group).getByLabelText('더할 시술 이름'), 'SSNB')
    await user.click(within(group).getByRole('button', { name: '+ 이름 더하기' }))
    expect(latest.TPL.byProc).toEqual({ SSNB: '{시술}' })
    const field = within(group).getByLabelText('SSNB') as HTMLInputElement
    await user.clear(field)
    await user.type(field, '{{C-arm} SSNB')
    expect(latest.TPL.byProc).toEqual({ SSNB: '{C-arm} SSNB' })
    await user.type(within(group).getByLabelText('더할 시술 이름'), 'ssnb')
    await user.click(within(group).getByRole('button', { name: '+ 이름 더하기' }))
    expect(within(group).getByText('이미 있는 이름이에요')).toBeTruthy()
    await user.click(within(group).getByRole('button', { name: 'SSNB 지우기' }))
    expect(latest.TPL.byProc).toEqual({})
  })

  it('AC-3007.3: 부위별 문구 12칸: 쓰면 그 부위 문구가 되고 비우면 빠진다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const group = screen.getByRole('group', { name: '부위별 문구' })
    expect(within(group).getAllByRole('textbox')).toHaveLength(12)
    await user.type(within(group).getByLabelText('무릎'), 'knee {{시술}')
    expect(latest.TPL.byRegion).toEqual({ knee: 'knee {시술}' })
    await user.clear(within(group).getByLabelText('무릎'))
    expect(latest.TPL.byRegion).toEqual({})
  })

  it('AC-3007.3: 고정 멘트는 처음 멘트 셋이 보이고, 켜기·단추 이름·글을 고칠 수 있다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const table = screen.getByRole('table', { name: '고정 멘트' })
    expect((within(table).getByLabelText('고정 멘트 1 단추 이름') as HTMLInputElement).value).toBe('C-arm')
    expect((within(table).getByLabelText('고정 멘트 1 글') as HTMLInputElement).value).toBe('C-arm guide 하에')
    await user.click(within(table).getByRole('checkbox', { name: '고정 멘트 2 켜기' }))
    expect(latest.TPL.fixedPhrases).toEqual([
      { token: 'C-arm', text: 'C-arm guide 하에', on: true },
      { token: 'Sono', text: 'Sono guide 하에', on: false },
      { token: '시행함', text: '시행함', on: true },
    ])
    await user.type(within(table).getByLabelText('고정 멘트 3 글'), '.')
    expect(latest.TPL.fixedPhrases?.[2]).toEqual({ token: '시행함', text: '시행함.', on: true })
    await user.click(within(table).getByRole('button', { name: '고정 멘트 1 지우기' }))
    expect(latest.TPL.fixedPhrases?.map((f) => f.token)).toEqual(['Sono', '시행함'])
  })

  it('AC-3007.3: 멘트를 더하거나 이름을 바꾸면 모든 문구 칸의 단추가 바로 바뀐다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(screen.getByRole('button', { name: '+ 멘트 더하기' }))
    expect(latest.TPL.fixedPhrases?.[3]).toEqual({ token: '멘트4', text: '', on: true })
    expect(within(screen.getByRole('group', { name: '일반 IA 자동 채움 넣기' })).getByRole('button', { name: '{멘트4}' })).toBeTruthy()
    const name = within(screen.getByRole('table', { name: '고정 멘트' })).getByLabelText('고정 멘트 4 단추 이름')
    await user.clear(name)
    await user.type(name, '유도')
    expect(within(screen.getByRole('group', { name: '기본 시술 문구 자동 채움 넣기' })).getByRole('button', { name: '{유도}' })).toBeTruthy()
    expect(within(screen.getByRole('group', { name: '기본 시술 문구 자동 채움 넣기' })).queryByRole('button', { name: '{멘트4}' })).toBeNull()
  })

  it('AC-3007.3: 고정 멘트는 30개까지 더할 수 있다', () => {
    const start = ourClinicPhrases()
    start.TPL.fixedPhrases = Array.from({ length: 30 }, (_, i) => ({ token: `m${i}`, text: '', on: true }))
    render(<Harness start={start} />)
    expect((screen.getByRole('button', { name: '+ 멘트 더하기' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-3002.6: 시술별 약과 시술 2개 이상인 날의 켜기 칸이 있고 memoRules.singleOwnerDrug에 들어간다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect(screen.getByLabelText('고칠 시술')).toBeTruthy()
    const box = screen.getByRole('checkbox', { name: "시술이 2개 이상인 날, '넣기'인 시술이 하나뿐이면 그 시술 줄에 자동으로 넣기" }) as HTMLInputElement
    expect(box.checked).toBe(true)
    await user.click(box)
    expect(latest.memoRules).toEqual({ singleOwnerDrug: false })
    await user.click(box)
    expect(latest.memoRules).toEqual({ singleOwnerDrug: true })
  })

  it('AC-3007.3: 틀린 칸의 글을 칸 아래에 보인다', () => {
    render(<ProcTab draft={ourClinicPhrases()} errors={[{ path: 'TPL.iaEtc', message: '일반 IA 오류' }, { path: 'TPL.fixedPhrases.0', message: '멘트 오류' }]} onChange={() => {}} />)
    expect(screen.getByText('일반 IA 오류')).toBeTruthy()
    expect(screen.getByText('멘트 오류')).toBeTruthy()
  })
})

describe('AC-6613.2 Central 시술 처방코드', () => {
  const follows = (a: HTMLElement, b: HTMLElement) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

  it("AC-6613.2: 'Central 시술 문구' 칸 바로 아래에 'Central 시술 처방코드' 칸이 있고, 엔진이 읽지 않는 리도카인·Peripheral 코드 칸은 없다", () => {
    render(<Harness />)
    const codes = screen.getByLabelText('Central 시술 처방코드') as HTMLInputElement
    expect(codes.value).toBe('LA321, LA323, LA326, LA354, LA356, LA357, LA358, LA359')
    expect(follows(screen.getByLabelText('Central 시술 문구'), codes)).toBe(true)
    expect(follows(codes, screen.getByLabelText('Peripheral 시술 문구'))).toBe(true)
    expect(screen.queryByLabelText('리도카인(국소마취제) 처방코드')).toBeNull()
    expect(screen.queryByLabelText('Peripheral 시술 처방코드')).toBeNull()
  })

  it('AC-6613.2: 고치면 TPL.mainCentralCodes에 들어가고, 비우면 칸을 지워 엔진 기본값이 흐린 글로 보인다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const codes = screen.getByLabelText('Central 시술 처방코드') as HTMLInputElement
    await user.clear(codes)
    expect(Object.hasOwn(latest.TPL, 'mainCentralCodes')).toBe(false)
    expect(codes.placeholder).toBe(DEFAULT_MAIN_CENTRAL_CODES)
    await user.type(codes, 'LA321, LA358')
    expect(latest.TPL.mainCentralCodes).toBe('LA321, LA358')
  })

  it('AC-6613.3: 틀린 값의 까닭을 그 칸 아래에 보인다', () => {
    render(<ProcTab draft={ourClinicPhrases()} errors={[{ path: 'TPL.mainCentralCodes', message: 'Central 코드 오류' }]} onChange={() => {}} />)
    const codes = screen.getByLabelText('Central 시술 처방코드')
    expect(codes.getAttribute('aria-invalid')).toBe('true')
    expect(follows(codes, screen.getByText('Central 코드 오류'))).toBe(true)
  })
})
