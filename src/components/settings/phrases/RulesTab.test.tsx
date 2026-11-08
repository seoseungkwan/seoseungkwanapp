// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { RulesTab } from './RulesTab'

// 설정 '표기 규칙' 묶음(memo-settings AC-3007.2)

afterEach(cleanup)

let latest: Phrases
function Harness({ start = ourClinicPhrases() }: { start?: Phrases }) {
  const [draft, setDraft] = useState(start)
  latest = draft
  return <RulesTab draft={draft} errors={[]} onChange={setDraft} />
}

describe('AC-3007.2 표기 규칙', () => {
  it('AC-3007.2: 좌우 기본 표기·앞에 한 번 적힌 좌우를 고른다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    expect((screen.getByLabelText('좌우 기본 표기') as HTMLSelectElement).value).toBe('quantity')
    await user.selectOptions(screen.getByLabelText('좌우 기본 표기'), 'chart')
    expect(latest.TPL.sideMode).toBe('chart')
    await user.selectOptions(screen.getByLabelText('앞에 한 번 적힌 좌우'), 'adjacent')
    expect(latest.TPL.sideSpread).toBe('adjacent')
  })

  it.each([
    ['경추 CPB 따로 쓰기', true, (p: Phrases) => p.TPL.splitCpb, false],
    ['요추 SNB 따로 쓰기', true, (p: Phrases) => p.TPL.splitSnb, false],
    ['시술 줄 나누기', true, (p: Phrases) => p.TPL.splitEach, false],
    ['무릎 세트(FNB·SNB + IA)면 IA 줄 생략', true, (p: Phrases) => p.TPL.kneeSetSkipIa, false],
    ['무릎 세트 날에 트리암·덱사가 있으면 IA 줄 쓰기', false, (p: Phrases) => p.memoRules?.kneeSetIaWithDrug, true],
    ['IA·건초내주사 줄에 좌우 넣기', false, (p: Phrases) => p.memoRules?.iaSide, true],
  ])('AC-3007.2: 켜고 끄기: %s (처음 값은 지금 동작)', async (name, start, read, after) => {
    const user = userEvent.setup()
    render(<Harness />)
    const box = screen.getByRole('checkbox', { name }) as HTMLInputElement
    expect(box.checked).toBe(start)
    await user.click(box)
    expect(read(latest)).toBe(after)
    expect(box.checked).toBe(after)
  })

  it('AC-3007.2: 새 켜기 칸은 안내 글로 무엇이 바뀌는지 말한다', () => {
    render(<Harness />)
    const helpOf = (name: string) => document.getElementById(screen.getByRole('checkbox', { name }).getAttribute('aria-describedby') ?? '')?.textContent
    expect(helpOf('무릎 세트 날에 트리암·덱사가 있으면 IA 줄 쓰기')).toBe('끄면 지금처럼 IA 줄을 생략하고 [약 확인]을 남겨요')
    expect(helpOf('IA·건초내주사 줄에 좌우 넣기')).toBe('켜면 IA injection of - Rt knee(triam)')
  })

  it('AC-3007.2: 코드별 좌우를 더하고 고르고 지운다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(screen.getByLabelText('더할 코드'), 'la247')
    await user.selectOptions(screen.getByLabelText('더할 코드의 좌우'), 'omit')
    await user.click(screen.getByRole('button', { name: '+ 코드 더하기' }))
    expect(latest.TPL.sideByCode).toEqual({ LA247: 'omit' })
    const table = screen.getByRole('table', { name: '코드별 좌우' })
    await user.selectOptions(within(table).getByLabelText('LA247 좌우'), 'keep')
    expect(latest.TPL.sideByCode).toEqual({ LA247: 'keep' })
    await user.type(screen.getByLabelText('더할 코드'), 'LA247')
    await user.click(screen.getByRole('button', { name: '+ 코드 더하기' }))
    expect(screen.getByText('이미 있는 코드예요')).toBeTruthy()
    expect(latest.TPL.sideByCode).toEqual({ LA247: 'keep' })
    await user.click(within(table).getByRole('button', { name: 'LA247 지우기' }))
    expect(latest.TPL.sideByCode).toEqual({})
  })

  it('AC-3007.2: 부위 영어 표기 12칸은 지금 쓰는 값으로 보이고, 하나를 고치면 12칸이 모두 저장된다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const group = screen.getByRole('group', { name: '부위 영어 표기' })
    expect(within(group).getAllByRole('textbox')).toHaveLength(12)
    const knee = within(group).getByLabelText('무릎') as HTMLInputElement
    expect(knee.value).toBe('knee')
    await user.clear(knee)
    await user.type(knee, 'Knee')
    expect(latest.TPL.siteNames).toEqual({ cervical: 'C', lumbar: 'L', shoulder: 'shoulder', knee: 'Knee', ankle: 'ankle', elbow: 'elbow', wrist: 'wrist', hand: 'hand', hip: 'hip', chest: 'rib', foot: 'foot', upper: 'upper extremity' })
  })

  it('AC-3007.2: 표기 바꾸기를 고친다', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    const rename = screen.getByLabelText(/표기 바꾸기/) as HTMLTextAreaElement
    expect(rename.value).toBe('C-MBB > MBB C')
    await user.type(rename, '{Enter}L-MBB > MBB L')
    expect(latest.TPL.rename).toBe('C-MBB > MBB C\nL-MBB > MBB L')
  })

  it('AC-3007.2: 틀린 칸의 글을 보인다', () => {
    render(<RulesTab draft={ourClinicPhrases()} errors={[{ path: 'TPL.sideByCode.LA1', message: '처방코드 형식 또는 중복을 확인해 주세요.' }, { path: 'memoRules.iaSide', message: '켜기·끄기 값을 확인해 주세요.' }]} onChange={() => {}} />)
    expect(screen.getByText('처방코드 형식 또는 중복을 확인해 주세요.')).toBeTruthy()
    expect(screen.getByText('켜기·끄기 값을 확인해 주세요.')).toBeTruthy()
  })
})
