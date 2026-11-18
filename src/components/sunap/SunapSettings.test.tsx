// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import type { StatsRxGroup } from '@/types/rxGroups'
import type { RsvKindDef, SunapSettings as Settings } from '@/types/sunap'
import { SunapSettings } from './SunapSettings'

// 수납일지 설정 판의 '다음 예약 종류' 목록(spec sunap-kinds REQ-5503 AC-5503.1~5503.3, 시안 docs/mockups/sunap-kinds ?s=kinds).
// 시안의 예시 목록(주사치료 → 진료(경과) → 도수치료 → 체외충격파 → 기타). 저장은 부르는 쪽(onSave)이 한다

afterEach(cleanup)

const KINDS: RsvKindDef[] = [
  { id: 'inj', label: '주사치료', counts: true, words: ['주사', '블록'] },
  { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
  { id: 'kdosu01', label: '도수치료', counts: true, words: ['도수'] },
  { id: 'kshock1', label: '체외충격파', counts: false, words: ['충격파', 'ESWT'] },
  { id: 'etc', label: '기타', counts: false, words: ['기타'] },
]
const GROUPS: StatsRxGroup[] = [
  { id: 'g-block', name: '신경차단술', codes: ['MM110', 'MM120'], sortOrder: 0 },
  { id: 'g-pt', name: '기본 물리치료', codes: ['MM301', 'MM302', 'MM303'], sortOrder: 1 },
]
const SETTINGS: Settings = { blockGroup: 'g-block', ptGroup: 'g-pt', kinds: KINDS }

const DESC_1 = '비트 예약 메모에 이 말이 있으면 그 종류로 정해요. 위에 있을수록 먼저 맞춰 봐요(메모에 말이 둘 다 있으면 위 종류). 말은 쉼표(,)로 나눠 적어요.'
const DESC_2 = '예약률 ○ 넣음인 종류만 신환·90일 예약률에 세요. 주사치료·진료(경과)·기타는 기본 종류라 이름은 바꿀 수 있지만 지울 수는 없어요.'
const AFTER = '예약률 ○·✕를 바꾸면 아직 마감 안 한 날부터 새로 세요. 마감한 날 숫자는 그대로예요(마감을 풀고 다시 마감하면 새 설정으로 세요).'
const WORDS = '메모에 이 말이 있으면'

function open(settings: Settings = SETTINGS) {
  const onSave = vi.fn(async (next: Settings) => void next)
  const onClose = vi.fn()
  render(<SunapSettings settings={settings} groups={GROUPS} onSave={onSave} onClose={onClose} />)
  return { onSave, onClose, user: userEvent.setup() }
}

const items = () => within(screen.getByRole('list', { name: '다음 예약 종류' })).getAllByRole('listitem')
const item = (n: number) => within(items()[n - 1]!)
const nameBox = (n: number) => screen.getByRole('textbox', { name: `${n}번째 종류 이름` }) as HTMLInputElement
const wordsBox = (n: number) => item(n).getByRole('textbox', { name: WORDS }) as HTMLInputElement
const pressed = (n: number, name: '○ 넣음' | '✕ 뺌') => item(n).getByRole('button', { name }).getAttribute('aria-pressed')
const button = (name: string) => screen.getByRole('button', { name }) as HTMLButtonElement
const names = () => items().map((_, i) => nameBox(i + 1).value)

describe('AC-5503.1 다음 예약 종류 목록(시안 ?s=kinds)', () => {
  it('AC-5503.1: 제목·설명 두 줄·PC 칸 제목(이름·예약률·순서)이 있고, 옛 예약 메모 말 세 줄·노란 점선 안내는 없다', () => {
    open()
    expect(screen.getByText('다음 예약 종류')).toBeTruthy()
    expect(screen.getByText(DESC_1)).toBeTruthy()
    expect(screen.getByText(DESC_2)).toBeTruthy()
    expect(screen.getByText('순서').parentElement!.textContent).toBe('이름예약률순서')
    expect(screen.queryByText('예약 메모 말')).toBeNull()
    expect(screen.queryByText(/정해진 말이 없는 예약/)).toBeNull()
    expect(screen.queryByRole('button', { name: /말 더하기$/ })).toBeNull()
    // 묶음 두 칸·취소·저장은 그대로
    expect(screen.getByRole('combobox', { name: 'Block으로 셀 처방' })).toBeTruthy()
    expect(screen.getByRole('combobox', { name: '물리치료로 셀 처방' })).toBeTruthy()
    expect(button('취소')).toBeTruthy()
    expect(button('저장')).toBeTruthy()
  })

  it('AC-5503.1: 종류마다 차례 번호·이름 칸·예약률 단추·▲▼·지우기(기본 종류는 기본)·메모 말 칸이 설정 차례대로 있다', () => {
    open()
    expect(items()).toHaveLength(5)
    expect(names()).toEqual(['주사치료', '진료(경과)', '도수치료', '체외충격파', '기타'])
    for (let n = 1; n <= 5; n++) {
      expect(item(n).getByText(String(n))).toBeTruthy()
      expect(nameBox(n).placeholder).toBe('이름 (예: 도수치료)')
      expect(nameBox(n).maxLength).toBe(10)
      expect(wordsBox(n).placeholder).toBe('예: 도수, 수기 (비우면 직접 고를 때만 써요)')
      expect(wordsBox(n).maxLength).toBe(40)
      expect(item(n).getByRole('button', { name: `${n}번째 종류 위로` }).textContent).toBe('▲')
      expect(item(n).getByRole('button', { name: `${n}번째 종류 아래로` }).textContent).toBe('▼')
    }
    expect(wordsBox(1).value).toBe('주사, 블록')
    expect(wordsBox(4).value).toBe('충격파, ESWT')
    expect([1, 2, 3, 4, 5].map((n) => pressed(n, '○ 넣음'))).toEqual(['true', 'true', 'true', 'false', 'false'])
    expect([1, 2, 3, 4, 5].map((n) => pressed(n, '✕ 뺌'))).toEqual(['false', 'false', 'false', 'true', 'true'])
    // 맨 위 ▲·맨 아래 ▼는 못 누른다
    expect(button('1번째 종류 위로').disabled).toBe(true)
    expect(button('1번째 종류 아래로').disabled).toBe(false)
    expect(button('5번째 종류 위로').disabled).toBe(false)
    expect(button('5번째 종류 아래로').disabled).toBe(true)
    // 기본 종류는 '기본'(지울 수 없음), 새 종류는 [지우기]
    for (const n of [1, 2, 5]) {
      expect(item(n).getByText('기본').getAttribute('title')).toBe('기본 종류라 지울 수 없어요')
      expect(item(n).queryByRole('button', { name: '지우기' })).toBeNull()
    }
    for (const n of [3, 4]) {
      expect(item(n).getByRole('button', { name: '지우기' })).toBeTruthy()
      expect(item(n).queryByText('기본')).toBeNull()
    }
  })

  it('AC-5503.1: 예약률 단추를 누르면 눌린 쪽이 바뀌고, ▲·▼는 차례를 바꾼다', async () => {
    const { user } = open()
    await user.click(item(1).getByRole('button', { name: '✕ 뺌' }))
    expect(pressed(1, '○ 넣음')).toBe('false')
    expect(pressed(1, '✕ 뺌')).toBe('true')
    await user.click(item(4).getByRole('button', { name: '○ 넣음' }))
    expect(pressed(4, '○ 넣음')).toBe('true')
    await user.click(button('5번째 종류 위로'))
    expect(names()).toEqual(['주사치료', '진료(경과)', '도수치료', '기타', '체외충격파'])
    expect(item(4).getByText('기본')).toBeTruthy()
    expect(pressed(5, '○ 넣음')).toBe('true')
    await user.click(button('1번째 종류 아래로'))
    expect(names()).toEqual(['진료(경과)', '주사치료', '도수치료', '기타', '체외충격파'])
    expect(pressed(2, '✕ 뺌')).toBe('true')
  })
})

describe('AC-5503.2 종류 더하기·늘 있는 줄', () => {
  it('AC-5503.2: [+ 종류 더하기]는 맨 아래에 이름·말 빈칸, 예약률 ✕ 뺌인 새 종류를 만들고 그 이름 칸에 초점을 준다', async () => {
    const { user } = open()
    expect(screen.getByText('종류는 10개까지 만들 수 있어요 · 지금 5개')).toBeTruthy()
    await user.click(button('+ 종류 더하기'))
    expect(items()).toHaveLength(6)
    expect(nameBox(6).value).toBe('')
    expect(wordsBox(6).value).toBe('')
    expect(pressed(6, '✕ 뺌')).toBe('true')
    expect(pressed(6, '○ 넣음')).toBe('false')
    expect(item(6).getByRole('button', { name: '지우기' })).toBeTruthy()
    expect(document.activeElement).toBe(nameBox(6))
    await user.type(nameBox(6), '추나')
    expect(nameBox(6).value).toBe('추나')
    expect(screen.getByText('종류는 10개까지 만들 수 있어요 · 지금 6개')).toBeTruthy()
  })

  it('AC-5503.2: 10개면 [+ 종류 더하기]를 못 누르고 글이 바뀐다. 하나 지우면 다시 누를 수 있다', async () => {
    const { user } = open()
    for (let i = 0; i < 5; i++) await user.click(button('+ 종류 더하기'))
    expect(items()).toHaveLength(10)
    expect(button('+ 종류 더하기').disabled).toBe(true)
    expect(screen.getByText('10개를 다 만들었어요. 더 만들려면 안 쓰는 종류를 지워 주세요.')).toBeTruthy()
    expect(screen.queryByText(/지금 10개/)).toBeNull()
    await user.click(item(3).getByRole('button', { name: '지우기' }))
    expect(items()).toHaveLength(9)
    expect(names().slice(0, 4)).toEqual(['주사치료', '진료(경과)', '체외충격파', '기타'])
    expect(button('+ 종류 더하기').disabled).toBe(false)
    expect(screen.getByText('종류는 10개까지 만들 수 있어요 · 지금 9개')).toBeTruthy()
  })

  it('AC-5503.2: 목록 아래 흐린 칸에 늘 있는 줄 둘(예약률 ✕)과 마감한 날 안내가 있다', () => {
    open()
    const box = screen.getByText('늘 있는 줄 · 바꿀 수 없어요').parentElement!
    const rows = [...box.children].slice(1).map((el) => el.textContent)
    expect(rows).toEqual(['예약 안 하고 가심비트에 다음 예약이 없을 때예약률 ✕', '종류 모름비트 예약은 있는데 메모에 맞는 말이 없을 때예약률 ✕'])
    expect(screen.getByText(AFTER)).toBeTruthy()
  })
})

describe('AC-5503.3 저장', () => {
  it('AC-5503.3: 이름이 비었거나·같은 이름(늘 있는 줄 이름 포함)·말 하나가 20자를 넘으면 저장하지 않고 그 칸 아래와 저장 단추 위에 글을 보인다', async () => {
    const { user, onSave } = open()
    await user.clear(nameBox(1))
    await user.clear(nameBox(3))
    await user.type(nameBox(3), '진료(경과)')
    await user.clear(nameBox(4))
    await user.type(nameBox(4), '종류 모름')
    await user.clear(wordsBox(5))
    await user.type(wordsBox(5), `기타, ${'가'.repeat(21)}`)
    await user.click(button('저장'))
    expect(onSave).not.toHaveBeenCalled()
    expect(item(1).getByText('이름을 적어 주세요')).toBeTruthy()
    expect(item(2).queryByText(/주세요|있어요/)).toBeNull()
    expect(item(3).getByText('같은 이름이 이미 있어요')).toBeTruthy()
    expect(item(4).getByText('같은 이름이 이미 있어요')).toBeTruthy()
    expect(item(5).getByText('말 하나는 20자까지 적을 수 있어요')).toBeTruthy()
    expect(nameBox(1).getAttribute('aria-invalid')).toBe('true')
    expect(wordsBox(5).getAttribute('aria-invalid')).toBe('true')
    expect(nameBox(2).getAttribute('aria-invalid')).toBeNull()
    expect(screen.getByRole('alert').textContent).toBe('빨간 칸을 고쳐 주세요')
    // 저장 단추 위(같은 아래 줄 안, 단추보다 앞)
    const alert = screen.getByRole('alert')
    expect(alert.compareDocumentPosition(button('저장')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByRole('dialog', { name: '수납일지 설정' })).toBeTruthy()
  })

  it('AC-5503.3: 고쳐서 다시 저장하면 글이 사라지고 onSave를 부른다', async () => {
    const { user, onSave } = open()
    await user.clear(nameBox(2))
    await user.click(button('저장'))
    expect(item(2).getByText('이름을 적어 주세요')).toBeTruthy()
    await user.type(nameBox(2), '경과')
    await user.click(button('저장'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(screen.queryByText('이름을 적어 주세요')).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-5503.3: 맞으면 이름·말을 다듬어(앞뒤 빈칸·빈 말·겹친 말·전각 쉼표) 목록 차례대로 저장한다. 지운 종류는 빠지고 새 종류는 k+6자 id', async () => {
    const { user, onSave } = open()
    await user.clear(nameBox(1))
    await user.type(nameBox(1), ' 주사 ')
    await user.clear(wordsBox(1))
    await user.type(wordsBox(1), ' 주사 ， 블록,, 블록 , 신경 ')
    await user.clear(wordsBox(4))
    await user.type(wordsBox(4), 'ESWT, eswt, 충격파')
    await user.click(item(3).getByRole('button', { name: '지우기' }))
    await user.click(button('+ 종류 더하기'))
    await user.type(nameBox(5), '추나')
    await user.click(item(5).getByRole('button', { name: '○ 넣음' }))
    await user.type(wordsBox(5), '추나, 수기')
    await user.click(button('5번째 종류 위로'))
    await user.click(button('저장'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith({
      blockGroup: 'g-block',
      ptGroup: 'g-pt',
      kinds: [
        { id: 'inj', label: '주사', counts: true, words: ['주사', '블록', '신경'] },
        { id: 'visit', label: '진료(경과)', counts: true, words: ['경과', '진료'] },
        { id: 'kshock1', label: '체외충격파', counts: false, words: ['ESWT', '충격파'] },
        { id: expect.stringMatching(/^k[a-z0-9]{6}$/), label: '추나', counts: true, words: ['추나', '수기'] },
        { id: 'etc', label: '기타', counts: false, words: ['기타'] },
      ],
    })
    const saved = onSave.mock.calls[0]![0].kinds.map((kind) => kind.id)
    expect(new Set(saved).size).toBe(saved.length)
  })

  it('AC-5503.3: 말 칸을 비우면 말 없이 저장한다(직접 고를 때만 쓰는 종류)', async () => {
    const { user, onSave } = open()
    await user.clear(wordsBox(3))
    await user.click(button('저장'))
    expect(onSave.mock.calls[0]![0].kinds[2]).toEqual({ id: 'kdosu01', label: '도수치료', counts: true, words: [] })
  })
})

// ── '초진' 글을 '신환'으로(spec sunap-new-label REQ-5601) ─────────
describe("AC-5601.4 설정 판 설명의 '초진'은 '신환'", () => {
  it('AC-5601.4: 다음 예약 종류 설명 둘째 줄은 신환·90일 예약률이다', () => {
    open()
    expect(
      screen.getByText('예약률 ○ 넣음인 종류만 신환·90일 예약률에 세요. 주사치료·진료(경과)·기타는 기본 종류라 이름은 바꿀 수 있지만 지울 수는 없어요.'),
    ).toBeTruthy()
    expect(document.body.textContent).not.toMatch(/(?<!90일)초진/)
  })
})

// ── 2026-11-17 검토 고침(spec sunap-kinds AC-5501.2·AC-5503.3) ─────────
describe('AC-5503.3 검토 고침 — 긴 말 저장·이름 오류 자리', () => {
  it('AC-5503.3·AC-5501.2: 띄어쓰기 없이 쉼표로 길게 적은 말(37자)도 저장된다', async () => {
    const { user, onSave } = open()
    await user.clear(wordsBox(3))
    await user.type(wordsBox(3), '도수치료,수기치료,도수,수기,체외충격파,충격파,ESWT,manual')
    await user.click(button('저장'))
    expect(screen.queryByRole('alert')).toBeNull()
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]![0].kinds[2]!.words).toEqual(['도수치료', '수기치료', '도수', '수기', '체외충격파', '충격파', 'ESWT', 'manual'])
  })

  it('AC-5503.3: 이름 오류 글은 이름 칸 바로 아래, 말 오류 글은 말 칸 아래에 있다', async () => {
    const { user } = open()
    await user.clear(nameBox(1))
    await user.clear(wordsBox(2))
    await user.type(wordsBox(2), 'ㄱ'.repeat(21))
    await user.click(button('저장'))
    const nameError = item(1).getByText('이름을 적어 주세요')
    expect(nameBox(1).nextElementSibling).toBe(nameError)
    const wordsError = item(2).getByText('말 하나는 20자까지 적을 수 있어요')
    expect(wordsBox(2).compareDocumentPosition(wordsError) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(nameBox(2).nextElementSibling).not.toBe(wordsError)
  })
})

// desk-feedback AC-6306.4: 데스크는 통계 탭(/stats)을 못 연다 → '처방 묶음 고치러 가기 →' 링크만 숨긴다.
// 데스크도 수납일지 [설정]을 고쳐 저장한다(사용자 결정 2026-11-18)
describe('AC-6306.4 데스크 — 처방 묶음 링크 숨김', () => {
  const LINK = '처방 묶음 고치러 가기 →'

  it('AC-6306.4: 원장은 지금처럼 Block 칸 옆에 "처방 묶음 고치러 가기 →"(/stats) 링크가 있다', () => {
    open()
    const link = screen.getByRole('link', { name: LINK })
    expect(link.getAttribute('href')).toBe('/stats')
  })

  it('AC-6306.4: 데스크면 그 링크가 없고, 묶음 고르기 둘·설명·다음 예약 종류·[취소]·[저장]은 그대로이며 고친 값을 저장한다', async () => {
    const onSave = vi.fn(async (next: Settings) => void next)
    const user = userEvent.setup()
    render(
      <RoleProvider desk>
        <SunapSettings settings={SETTINGS} groups={GROUPS} onSave={onSave} onClose={vi.fn()} />
      </RoleProvider>,
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.queryByText(LINK)).toBeNull()
    expect(document.querySelector('a[href="/stats"]')).toBeNull()
    const block = screen.getByRole('combobox', { name: 'Block으로 셀 처방' }) as HTMLSelectElement
    const pt = screen.getByRole('combobox', { name: '물리치료로 셀 처방' }) as HTMLSelectElement
    expect([block.value, pt.value]).toEqual(['g-block', 'g-pt'])
    expect(screen.getByText('통계 탭에 만들어 둔 처방 묶음 중 하나를 골라요. 묶음 안 코드를 바꾸면 수납일지·통계가 같이 바뀌어요.')).toBeTruthy()
    expect(screen.getByText(DESC_1)).toBeTruthy()
    expect(items()).toHaveLength(5)
    expect(button('취소')).toBeTruthy()
    await user.selectOptions(pt, '')
    await user.click(button('저장'))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave.mock.calls[0]?.[0]).toEqual(expect.objectContaining({ blockGroup: 'g-block', ptGroup: null }))
    expect(onSave.mock.calls[0]?.[0].kinds.map((kind) => kind.label)).toEqual(['주사치료', '진료(경과)', '도수치료', '체외충격파', '기타'])
  })
})
