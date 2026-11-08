// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { allowedTokens, ourClinicPhrases, type Phrases } from '@/lib/precheck/memo'
import { TemplateField } from './TemplateField'

// 문구 칸 하나(memo-settings REQ-3008): 글 칸 + '자동 채움 넣기' 단추 + 조각 줄(◀ ▶ ×) + 보기 한 줄

afterEach(cleanup)

function Harness({ path = 'TPL.iaEtc', label = '일반 IA', start, draft = ourClinicPhrases(), rows }: { path?: string; label?: string; start: string; draft?: Phrases; rows?: number }) {
  const [value, setValue] = useState(start)
  return <TemplateField label={label} path={path} value={value} draft={draft} rows={rows} onChange={setValue} />
}

const field = (label = '일반 IA') => screen.getByLabelText(label) as HTMLInputElement
const insertGroup = (label = '일반 IA') => screen.getByRole('group', { name: `${label} 자동 채움 넣기` })
const pieceGroup = (label = '일반 IA') => screen.getByRole('group', { name: `${label} 조각` })

describe('AC-3008.1 자동 채움 넣기 단추', () => {
  it('AC-3008.1: 단추는 그 칸에서 쓸 수 있는 {항목}과 고정 멘트이고 allowedTokens와 같다', () => {
    const draft = ourClinicPhrases()
    render(<Harness start="" draft={draft} />)
    const names = within(insertGroup()).getAllByRole('button').map((b) => b.textContent)
    expect(names).toEqual(allowedTokens('TPL.iaEtc', draft).map((t) => `{${t}}`))
    expect(names).toEqual(expect.arrayContaining(['{부위}', '{약제}', '{투여량}', '{C-arm}', '{시행함}']))
    cleanup()
    render(<Harness path="TPL.ara" label="연골주사" start="" draft={draft} />)
    expect(within(insertGroup('연골주사')).getByRole('button', { name: '{회차}' })).toBeTruthy()
  })

  it('AC-3008.1: 글쓰기 표시가 없으면 글 끝에 넣는다', async () => {
    const user = userEvent.setup()
    render(<Harness start="IA injection of -" />)
    await user.click(within(insertGroup()).getByRole('button', { name: '{부위}' }))
    expect(field().value).toBe('IA injection of -{부위}')
  })

  it('AC-3008.1: 글쓰기 표시가 있는 자리에 넣고, 이어 누르면 그 뒤에 넣는다', async () => {
    const user = userEvent.setup()
    render(<Harness start="IA - knee" />)
    const input = field()
    input.focus()
    input.setSelectionRange(4, 4)
    fireEvent.select(input)
    await user.click(within(insertGroup()).getByRole('button', { name: '{좌우}' }))
    expect(input.value).toBe('IA -{좌우} knee')
    await user.click(within(insertGroup()).getByRole('button', { name: '{부위}' }))
    expect(input.value).toBe('IA -{좌우}{부위} knee')
  })

  it('AC-3008.1: 고정 멘트를 더하거나 이름을 바꾸면 단추가 바로 바뀐다', () => {
    const draft = ourClinicPhrases()
    const { rerender } = render(<TemplateField label="일반 IA" path="TPL.iaEtc" value="" draft={draft} onChange={() => {}} />)
    expect(within(insertGroup()).queryByRole('button', { name: '{초음파}' })).toBeNull()
    const next = structuredClone(draft)
    next.TPL.fixedPhrases = [{ token: '초음파', text: '초음파 유도하', on: true }]
    rerender(<TemplateField label="일반 IA" path="TPL.iaEtc" value="" draft={next} onChange={() => {}} />)
    expect(within(insertGroup()).getByRole('button', { name: '{초음파}' })).toBeTruthy()
    expect(within(insertGroup()).queryByRole('button', { name: '{C-arm}' })).toBeNull()
  })

  it('AC-3008.1: 틀 칸이 아니면 단추가 없다', () => {
    render(<Harness path="TPL.rename" label="표기 바꾸기" start="" />)
    expect(screen.queryByRole('group', { name: '표기 바꾸기 자동 채움 넣기' })).toBeNull()
  })
})

describe('AC-3008.2 조각 줄의 ◀ ▶ ×', () => {
  it('AC-3008.2: {항목} 조각의 ◀를 누르면 바로 앞 조각과 자리를 바꾼다', async () => {
    const user = userEvent.setup()
    render(<Harness start="IA injection of - {부위}{약제}" />)
    await user.click(within(pieceGroup()).getByRole('button', { name: '{약제} 앞으로' }))
    expect(field().value).toBe('IA injection of - {약제}{부위}')
    await user.click(within(pieceGroup()).getByRole('button', { name: '{약제} 뒤로' }))
    expect(field().value).toBe('IA injection of - {부위}{약제}')
  })

  it('AC-3008.2: 맨 앞·맨 뒤에서는 그쪽 단추가 꺼진다', () => {
    render(<Harness start="{좌우} 슬관절 {회차}" />)
    const group = pieceGroup()
    expect((within(group).getByRole('button', { name: '{좌우} 앞으로' }) as HTMLButtonElement).disabled).toBe(true)
    expect((within(group).getByRole('button', { name: '{좌우} 뒤로' }) as HTMLButtonElement).disabled).toBe(false)
    expect((within(group).getByRole('button', { name: '{회차} 뒤로' }) as HTMLButtonElement).disabled).toBe(true)
    expect(within(group).getByText('슬관절')).toBeTruthy()
  })

  it('AC-3008.2: ×를 누르면 그 항목만 지운다', async () => {
    const user = userEvent.setup()
    render(<Harness start="{좌우} 슬관절 강내 연골주사 {회차}회차" />)
    await user.click(within(pieceGroup()).getByRole('button', { name: '{좌우} 지우기' }))
    expect(field().value).toBe('슬관절 강내 연골주사 {회차}회차')
  })
})

describe('AC-3008.3 보기 한 줄', () => {
  it('AC-3008.3: 보기 값으로 채운 한 줄이 바로 보인다(엔진 fill)', async () => {
    const user = userEvent.setup()
    render(<Harness start="IA injection of - {부위}{약제}" />)
    expect(screen.getByText('IA injection of - knee(triam)')).toBeTruthy()
    await user.type(field(), ' {{좌우}')
    expect(screen.getByText('IA injection of - knee(triam) Rt')).toBeTruthy()
  })

  it('AC-3008.3: 회차·시술·레벨·고정 멘트도 보기 값으로 채운다', () => {
    render(<Harness path="TPL.ara" label="연골주사" start="{C-arm} {좌우} {시술} L{레벨} {회차}회차 {시행함}" />)
    expect(screen.getByText('C-arm guide 하에 Rt MBB L4,5 L4,5 2회차 시행함')).toBeTruthy()
  })

  it('AC-3008.3: 빈 글이면 빈 줄이라고 보인다', () => {
    render(<Harness start="" />)
    expect(screen.getByText('(빈 줄)')).toBeTruthy()
  })
})

describe('틀린 칸', () => {
  it('AC-3008.1: 검사 오류를 칸 아래에 보인다', () => {
    render(<TemplateField label="일반 IA" path="TPL.iaEtc" value="{없는말}" draft={ourClinicPhrases()} error="지원하지 않는 항목 {없는말}입니다." onChange={() => {}} />)
    expect(screen.getByText('지원하지 않는 항목 {없는말}입니다.')).toBeTruthy()
    expect(field().getAttribute('aria-invalid')).toBe('true')
  })
})
