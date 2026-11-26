// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, GCAL_DEFAULT_HEX, type GcalRules, type GcalView } from '@/types/gcal'
import { GcalRulesForm, type GcalSyncReply } from './Rules'

// 설정 › 구글 캘린더 › 맞춤 방법 (spec google-link REQ-8531 AC-8531.1~AC-8531.3, notes-calendar `rules`, design.md 2절 표 4·12).
// 저장·맞추기·끊기는 props로 받은 가짜 함수다. 글은 notes-calendar 글자 그대로 적어 견준다(조각마다 — 단추·작은 글은 따로 된 글 조각)

const VIEW: GcalView = {
  scriptUrl: 'https://script.google.com/macros/s/AKfycbFAKE-test-0000000000/exec',
  hasSecret: true,
  calendarId: 'c1',
  calendarName: '2026 양지바른정형외과',
  defaultHex: GCAL_DEFAULT_HEX,
  linkedOn: '2026-11-23',
  rules: { ...DEFAULT_GCAL_RULES },
  look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] },
}
const LAST_OK = '2026-11-26 14:35:00.123456+09' // DB가 준 글자 그대로
const BAND = '이어져 있어요 · 2026 양지바른정형외과 · 11/23 (월)부터 · 마지막 맞춤 14:35'
const UNLINK_ASK = '끊어도 웹앱 예약과 구글 일정은 그대로 남고, 그 뒤로는 서로 맞추지 않아요.'

// 열다섯 줄: 왼쪽 제목 → 오른쪽 글 조각(단추·고르기 글 포함, 차례대로)
const ROWS: [string, string[]][] = [
  [
    '구글에서 받아 오기',
    [
      '웹앱이 열려 있는 동안',
      '1분',
      '2분',
      '5분',
      '마다 받아 와요',
      '다른 창을 보다 예약 탭으로 돌아오면 바로 한 번 받아 와요. 웹앱이 열린 PC가 하나도 없으면 받아 오지 않고, 다음에 열 때 그동안 바뀐 것을 한꺼번에 받아 와요.',
    ],
  ],
  ['웹앱에서 넣고 고치기', ['저장하면 바로 구글에 적어요. 구글에 닿지 못하면 모아 두었다가 다시 닿을 때 보내요.']],
  [
    '웹앱에서 [예약 취소]하면',
    ['구글 일정은 지우지 않고 색을 취소 색(토마토)으로 바꿔요.', '[취소 되돌리기]하면 원래 색으로 돌려요. 취소 색은 설정 › 구글 캘린더 › 시행자·종류에서 바꿔요.'],
  ],
  ['웹앱에서 [지우기]하면', ['구글에서도 지워요.']],
  ['구글에서 일정 색을 취소 색으로 바꾸면', ["웹앱에서도 '취소'로 바꿔요.", '다른 색으로 되돌리면 웹앱 취소도 풀려요.']],
  [
    '구글에서 일정을 지우면',
    ["웹앱에서는 '취소'로 바꿔요", '흐린 칸으로 남아 취소 수에 들어가요. 실수로 지웠으면 [취소 되돌리기]로 구글에 다시 적어요(원래 색으로).', '웹앱에서도 지워요'],
  ],
  ['같은 예약을 양쪽에서 고치면', ['나중에 고친 쪽으로 맞춰요.', "덮인 쪽 내용은 예약 자세히에 한 줄 남겨요(예: '구글에서 14:20에 고친 내용을 웹앱 내용으로 덮었어요')."]],
  ['웹앱에서 날짜·시작을 옮기면', ["'변경'으로 세고 구글 일정 색을 변경 색(흑연)으로 바꿔요."]],
  ['구글에서 날짜·시작을 옮기면', ["웹앱에서 옮긴 것처럼 '변경'으로 세고 처음 시간을 남겨요.", '구글 일정 색도 변경 색으로 바꿔요.']],
  ['구글에서 일정 색을 변경 색으로 바꾸면', ["웹앱에 '변경' 표시를 붙여요.", '처음 시간은 몰라 비워 둬요. 다른 색으로 되돌리면 표시도 풀려요.']],
  ['도착 (왔음·안 옴)', ['구글에 보내지 않아요', '도착은 웹앱과 비트 PC에서만 봐요. 구글 제목이 자주 바뀌지 않아요.', "구글 제목 앞에 '왔음'·'안 옴'을 붙여요"]],
  [
    '맞추는 날짜',
    [
      '이은 날 11/23 (월) 0시부터의 예약을 양쪽으로 맞춰요(날이 지나도 계속).',
      '그 전 1년(2025-11-23부터)은 처음 가져올 때 한 번만 옮겨 왔고, 그 뒤로는 구글과 맞추지 않아요. 지난 예약 도착은 비트 PC가 그날 비트 접수를 보고 채워요.',
    ],
  ],
  ['같은 시행자 시간 겹침', ['지금처럼 웹앱에서 넣고 고칠 때만 알려요.', '구글에서 겹쳐 넣은 예약은 예약표에 나란히 보여요.']],
  ['가져오지 않기로 한 일정', ['구글에만 두고 웹앱은 건드리지 않아요.', '구글에서 제목을 고치면 다시 알아봐요.']],
  [
    '직원 탭 휴가',
    [
      '하루 종일 쉬는 휴가만 그날 구글 off 줄에 이름을 더하고, 지우면 빼요. 아무도 안 남으면 그 줄을 지워요.',
      '반차는 off 줄에 넣지 않고 예약 달력에만 보여요.',
      '예약 시행자가 아닌 직원(데스크 등)도 off 줄에 넣어요',
    ],
  ],
]

// 시각: 2026-11-26 (목) 14:37 (한국 시각)
const now = () => new Date('2026-11-26T05:37:00Z')

const fns = {
  saveRules: vi.fn<(rules: GcalRules) => Promise<void | 'invalid'>>(),
  syncNow: vi.fn<() => Promise<GcalSyncReply>>(),
  unlink: vi.fn<() => Promise<void>>(),
  onChangeCalendar: vi.fn<() => void>(),
}

beforeEach(() => {
  fns.saveRules.mockReset().mockResolvedValue(undefined)
  fns.syncNow.mockReset().mockResolvedValue({ ok: true, changed: 0 })
  fns.unlink.mockReset().mockResolvedValue(undefined)
  fns.onChangeCalendar.mockReset()
})
afterEach(cleanup)

function setup(view: GcalView = VIEW, lastOkAt: string | null = LAST_OK, wrap?: (node: React.ReactNode) => React.ReactNode) {
  const user = userEvent.setup()
  const node = <GcalRulesForm view={view} lastOkAt={lastOkAt} now={now} {...fns} />
  render(wrap ? wrap(node) : node)
  return user
}

/** 요소 안 글 조각(앞뒤 빈칸을 뗀 비지 않은 글 마디)을 차례대로 */
function pieces(el: Element): string[] {
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  const out: string[] = []
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.textContent?.trim()
    if (text) out.push(text)
  }
  return out
}

const card = () => screen.getByRole('region', { name: '맞춤 방법' })
const band = () => screen.getByText((_, el) => el?.tagName === 'P' && (el.textContent ?? '').startsWith('이어져 있어요'))
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const pullButtons = () => within(screen.getByRole('group', { name: '받아 오는 간격' })).getAllByRole('button') as HTMLButtonElement[]
const radio = (name: string) => screen.getByRole('radio', { name: new RegExp(`^${name}`) }) as HTMLInputElement
const offAll = () => screen.getByRole('checkbox', { name: '예약 시행자가 아닌 직원(데스크 등)도 off 줄에 넣어요' }) as HTMLInputElement

describe('AC-8531.1 맞춤 방법 화면 글', () => {
  it('AC-8531.1: 이어짐 띠와 [지금 맞추기][연결 시험 · 캘린더 바꾸기][잇기 끊기]가 notes 그대로다(마지막 맞춤은 DB 시각 글자를 한국 시각으로)', () => {
    setup()
    expect(band().textContent).toBe(BAND)
    expect(within(band()).getByText('2026 양지바른정형외과').tagName).toBe('B')
    const bandBox = band().parentElement as HTMLElement
    expect(within(bandBox).getAllByRole('button').map((b) => b.textContent)).toEqual(['지금 맞추기', '연결 시험 · 캘린더 바꾸기', '잇기 끊기'])
  })

  it("AC-8531.1: 제목 '맞춤 방법' · '골라져 있는 것이 기본값이에요'와 열다섯 줄(왼쪽 제목 → 오른쪽 글)이 notes 그대로, 맨 아래 [저장]", () => {
    setup()
    const section = card()
    expect(within(section).getByRole('heading', { level: 2, name: '맞춤 방법' })).toBeTruthy()
    expect(within(section).getByText('골라져 있는 것이 기본값이에요')).toBeTruthy()
    const terms = within(section).getAllByRole('term')
    const values = within(section).getAllByRole('definition')
    expect(terms.map((term) => term.textContent)).toEqual(ROWS.map(([key]) => key))
    expect(values.map(pieces)).toEqual(ROWS.map(([, texts]) => texts))
    expect(button('저장')).toBeTruthy()
  })

  it('AC-8531.1: 고를 수 있는 넷은 단추이고 기본값(2분 · 취소로 바꿈 · 구글에 보내지 않음 · 데스크도 넣음)이 골라져 있다', () => {
    setup()
    expect(pullButtons().map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['1분', 'false'],
      ['2분', 'true'],
      ['5분', 'false'],
    ])
    expect(radio("웹앱에서는 '취소'로 바꿔요").checked).toBe(true)
    expect(radio('웹앱에서도 지워요').checked).toBe(false)
    expect(radio('구글에 보내지 않아요').checked).toBe(true)
    expect(radio("구글 제목 앞에 '왔음'·'안 옴'을 붙여요").checked).toBe(false)
    expect(offAll().checked).toBe(true)
  })

  it('AC-8531.1: 저장해 둔 맞춤 방법·취소 색·변경 색 이름을 그대로 보인다', () => {
    setup({ ...VIEW, rules: { pullMin: 5, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: false }, look: { ...VIEW.look, cancel: 'banana', change: 'sage' } })
    expect(pullButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    expect(radio('웹앱에서도 지워요').checked).toBe(true)
    expect(radio("구글 제목 앞에 '왔음'·'안 옴'을 붙여요").checked).toBe(true)
    expect(offAll().checked).toBe(false)
    expect(screen.getByText('구글 일정은 지우지 않고 색을 취소 색(바나나)으로 바꿔요.')).toBeTruthy()
    expect(screen.getByText("'변경'으로 세고 구글 일정 색을 변경 색(세이지)으로 바꿔요.")).toBeTruthy()
  })

  it("AC-8531.1: 마지막 맞춤이 아직 없으면 띠에 '마지막 맞춤'을 붙이지 않는다", () => {
    setup(VIEW, null)
    expect(band().textContent).toBe('이어져 있어요 · 2026 양지바른정형외과 · 11/23 (월)부터')
  })

  it("AC-8531.1: [지금 맞추기]는 바뀐 것이 없으면 '구글과 맞췄어요 · 바뀐 것 없음 ({HH:mm})', 있으면 '… 바뀐 것 {n}개 ({HH:mm})'(2절 표 4)이고 띠의 마지막 맞춤도 바뀐다", async () => {
    const user = setup()
    await user.click(button('지금 맞추기'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('구글과 맞췄어요 · 바뀐 것 없음 (14:37)'))
    expect(band().textContent).toBe('이어져 있어요 · 2026 양지바른정형외과 · 11/23 (월)부터 · 마지막 맞춤 14:37')
    fns.syncNow.mockResolvedValueOnce({ ok: true, changed: 3 })
    await user.click(button('지금 맞추기'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('구글과 맞췄어요 · 바뀐 것 3개 (14:37)'))
    expect(fns.syncNow).toHaveBeenCalledTimes(2)
  })

  it('AC-8531.1: [지금 맞추기]가 안 되면 오류 번호 카드(모르는 번호·던짐은 E-GCAL-REACH)', async () => {
    const user = setup()
    fns.syncNow.mockResolvedValueOnce({ ok: false, code: 'E-GCAL-GONE' })
    await user.click(button('지금 맞추기'))
    expect((await screen.findByRole('alert')).textContent).toBe(
      '고른 캘린더를 찾을 수 없거나 고칠 권한이 없어요.설정 › 구글 캘린더에서 캘린더를 다시 골라 주세요.오류 번호 E-GCAL-GONE',
    )
    fns.syncNow.mockRejectedValueOnce(new Error('network'))
    await user.click(button('지금 맞추기'))
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-GCAL-REACH'))
  })

  it('AC-8531.1: [연결 시험 · 캘린더 바꾸기]는 잇기 화면으로 가는 onChangeCalendar를 부른다', async () => {
    const user = setup()
    await user.click(button('연결 시험 · 캘린더 바꾸기'))
    expect(fns.onChangeCalendar).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8531.2 [저장]', () => {
  it("AC-8531.2: 받아 오는 간격·구글에서 지울 때·도착·예약 시행자가 아닌 직원 체크를 저장하고 '맞춤 방법을 저장했어요.'", async () => {
    const user = setup()
    await user.click(screen.getByRole('button', { name: '5분' }))
    expect(pullButtons().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false', 'true'])
    await user.click(radio('웹앱에서도 지워요'))
    await user.click(radio("구글 제목 앞에 '왔음'·'안 옴'을 붙여요"))
    await user.click(offAll())
    expect(fns.saveRules).not.toHaveBeenCalled()
    await user.click(button('저장'))
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('맞춤 방법을 저장했어요.'))
    expect(fns.saveRules).toHaveBeenCalledWith({ pullMin: 5, onGoogleDelete: 'delete', arrival: 'title', offAllStaff: false })
  })

  it('AC-8531.2: 아무것도 안 바꾸고 저장하면 기본값 그대로 저장한다', async () => {
    const user = setup()
    await user.click(button('저장'))
    await waitFor(() => expect(fns.saveRules).toHaveBeenCalledWith({ pullMin: 2, onGoogleDelete: 'cancel', arrival: 'off', offAllStaff: true }))
  })

  it('AC-8531.2: 저장하지 못하면(invalid·던짐) E-SETTINGS-FAILED 카드이고 저장 알림은 없다', async () => {
    const user = setup()
    fns.saveRules.mockResolvedValueOnce('invalid')
    await user.click(button('저장'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(screen.queryByRole('status')).toBeNull()
    fns.saveRules.mockRejectedValueOnce(new Error('offline'))
    await user.click(button('저장'))
    await waitFor(() => expect(fns.saveRules).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-SETTINGS-FAILED')
  })
})

describe('AC-8531.3 [잇기 끊기]', () => {
  it('AC-8531.3: 누르면 한 번 더 묻고(notes 글 그대로), [취소]면 끊지 않는다', async () => {
    const user = setup()
    await user.click(button('잇기 끊기'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText(UNLINK_ASK)).toBeTruthy()
    expect(within(dialog).getAllByRole('button').map((b) => b.textContent)).toEqual(['잇기 끊기', '취소'])
    expect(fns.unlink).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: '취소' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fns.unlink).not.toHaveBeenCalled()
  })

  it('AC-8531.3: 물음에 [잇기 끊기]로 답하면 unlink를 한 번 부르고 창을 닫는다(캘린더 id·이은 날만 비우는 일은 저장 함수 몫)', async () => {
    const user = setup()
    await user.click(button('잇기 끊기'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '잇기 끊기' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(fns.unlink).toHaveBeenCalledTimes(1)
    expect(fns.saveRules).not.toHaveBeenCalled()
  })

  it('AC-8531.3: 끊지 못하면 창을 닫고 E-SETTINGS-FAILED 카드', async () => {
    const user = setup()
    fns.unlink.mockRejectedValueOnce(new Error('offline'))
    await user.click(button('잇기 끊기'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '잇기 끊기' }))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('AC-8528.1 데스크는 보기만', () => {
  it('AC-8528.1: 데스크는 맞춤 방법의 모든 단추·고르기·체크가 잠기고 아무것도 부르지 않는다', async () => {
    const user = setup(VIEW, LAST_OK, (node) => <RoleProvider desk>{node}</RoleProvider>)
    const controls = [...document.body.querySelectorAll('button, input')] as (HTMLButtonElement | HTMLInputElement)[]
    expect(controls.length).toBeGreaterThanOrEqual(12)
    expect(controls.filter((control) => !control.disabled).map((control) => control.outerHTML)).toEqual([])
    await user.click(button('저장'))
    await user.click(button('지금 맞추기'))
    await user.click(button('잇기 끊기'))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(fns.saveRules).not.toHaveBeenCalled()
    expect(fns.syncNow).not.toHaveBeenCalled()
    expect(fns.unlink).not.toHaveBeenCalled()
  })
})
