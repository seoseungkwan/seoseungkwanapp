// @vitest-environment jsdom
import { cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { buildCalendarCode } from '@/lib/gcal/calendarCode'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, GCAL_DEFAULT_HEX, type GcalView } from '@/types/gcal'
import { GcalConnect, type GcalCalendarInfo, type GcalPingReply } from './Connect'

// 설정 › 구글 캘린더 › 잇기 (spec google-link REQ-8528 AC-8528.2~AC-8528.5, notes-calendar `connect`, design.md 2절 표 1·7·12, 5절).
// 구글 부르기·저장은 props로 받은 가짜 함수다(실제 구글·Supabase에 붙지 않는다). 글은 notes-calendar 글자 그대로 적어 견준다.
// 주소·비밀 글자·캘린더는 모두 지어낸 값이다(비밀 글자는 시험이 정한 가짜 바이트로 만든다)

const TITLE = '구글 캘린더 잇기'
const NOT_YET = '아직 이어지지 않았어요'
const LEAD =
  '병원 구글 계정의 캘린더와 예약 탭을 양쪽으로 이어요. 웹앱에서 넣거나 고친 예약은 바로 구글에 적히고, 구글에서 넣거나 고친 예약은 웹앱이 열려 있는 동안 2분마다 받아 와요. 처음 이을 때 지난 1년과 앞으로의 예약을 가져와요.'
const PRIVACY = '환자 이름과 차트번호가 병원 구글 캘린더 제목에도 그대로 적혀요. 병원 구글 계정의 비밀번호를 아는 사람만 볼 수 있으니 계정을 잘 지켜 주세요.'
const STEP1 = '1. 병원 구글 계정에 구글 코드 붙이기'
// 따라 하기: notes 네 줄 + design.md 2절 표 1의 서비스 켜기 줄(3번, 옛 3·4는 4·5)
const HOWTO = [
  '병원 구글 계정으로 로그인한 크롬에서 구글 코드 편집기(script.google.com)를 열어요.',
  '[새 프로젝트]를 누르고, 안에 있는 글을 모두 지운 뒤 아래 [구글 코드 복사]로 복사한 코드를 붙여 넣고 저장해요.',
  "왼쪽 [서비스] 옆 [+]를 눌러 'Google Calendar API'를 고르고 [추가]를 눌러요.",
  '오른쪽 위 [배포] → [새 배포] → 유형 [웹 앱], 실행 [나], 액세스 권한 [모든 사용자]를 고르고 [배포]를 눌러요. 구글이 권한을 물으면 병원 계정을 고르고 [허용]을 눌러요.',
  "나온 '웹 앱 주소'를 복사해 아래 2번 칸에 붙여 넣어요.",
]
// 글쇠 모양으로 그리는 [ ] (시안 .kbd — 2번 줄의 [구글 코드 복사]는 시안처럼 글 그대로)
const HOWTO_KEYS = [[], ['새 프로젝트'], ['서비스', '+', '추가'], ['배포', '새 배포', '웹 앱', '나', '모든 사용자', '배포', '허용'], []]
const STEP2 = '2. 주소와 비밀 글자 넣기'
const SECRET_HELP = '비밀 글자는 이 의원 계정에만 저장되고, 저장한 뒤에는 화면에 다시 보이지 않아요. 바꾸려면 코드를 다시 복사해 붙여요.'
const STEP3 = '3. 이을 캘린더 고르기'
const PICK_HELP = '웹앱은 고른 캘린더 하나에만 적고 그 캘린더만 받아 와요. 처음 가져오기도 이 캘린더에서만 해요.'
const BOTTOM = '아직 아무것도 가져오거나 바꾸지 않았어요. 다음 화면에서 시행자·종류 색을 맞춘 뒤, 가져오기 전에 한 번 더 보여 드려요.'
const COPIED_NOTICE = '구글 코드를 복사했어요. 비밀 글자를 새로 만들어 코드 맨 위에 넣었어요.'
const READ_ONLY_CAL = '보기만 할 수 있어 고를 수 없어요'

const URL_A = 'https://script.google.com/macros/s/AKfycbFAKE-test-0000000000/exec'
const URL_B = 'https://script.google.com/a/macros/clinic.fake.test/s/AKfycbFAKE-test-1111111111/exec'

const CALS: GcalCalendarInfo[] = [
  { id: 'c1', name: '2026 양지바른정형외과', access: 'owner', hex: '#9fc6e7', past: 4188, future: 195 },
  { id: 'c2', name: '직원 생일', access: 'writer', hex: '#f4511e', past: 6, future: 6 },
  { id: 'c3', name: '예약 본점', access: 'owner', hex: '파랑', past: 3, future: 2 },
  { id: 'c4', name: '대한민국의 휴일', access: 'reader', hex: '#33b679', past: 0, future: 0 },
]
const PING_OK: GcalPingReply = { ok: true, version: '1', now: '2026-11-23T08:46', calendars: CALS }

const VIEW_SAVED: GcalView = {
  scriptUrl: URL_A,
  hasSecret: true,
  calendarId: null,
  calendarName: null,
  defaultHex: GCAL_DEFAULT_HEX,
  linkedOn: null,
  rules: { ...DEFAULT_GCAL_RULES },
  look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] },
}

// 시각: 잇는 날 2026-11-23 (월) 08:41 → 08:46 (한국 시각)
let clock = new Date('2026-11-22T23:41:00Z')
const now = () => clock

// 가짜 무작위 바이트(시험이 정함)와 그것으로 만든 비밀 글자
const fakeBytes = (n: number) => Uint8Array.from({ length: n }, (_, i) => (i * 37 + 11) & 255)
const FAKE_SECRET = Buffer.from(fakeBytes(32)).toString('base64url')

const fns = {
  ping: vi.fn<(input: { scriptUrl: string; secret: string | null }) => Promise<GcalPingReply>>(),
  saveConnection: vi.fn<(input: { scriptUrl: string; secret: string | null }) => Promise<void | 'invalid'>>(),
  saveCalendar: vi.fn<(input: { calendarId: string; calendarName: string; defaultHex: string }) => Promise<void | 'invalid'>>(),
  onNext: vi.fn<() => void>(),
}
const writeText = vi.fn<(text: string) => Promise<void>>()
let randomSpy: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  clock = new Date('2026-11-22T23:41:00Z')
  fns.ping.mockReset().mockResolvedValue(PING_OK)
  fns.saveConnection.mockReset().mockResolvedValue(undefined)
  fns.saveCalendar.mockReset().mockResolvedValue(undefined)
  fns.onNext.mockReset()
  writeText.mockReset().mockResolvedValue(undefined)
  randomSpy = vi.spyOn(globalThis.crypto, 'getRandomValues').mockImplementation(((array: Uint8Array) => {
    array.set(fakeBytes(array.length))
    return array
  }) as typeof globalThis.crypto.getRandomValues)
})
afterEach(() => {
  cleanup()
  randomSpy.mockRestore()
})

function setup(view: GcalView | null = null, wrap?: (node: React.ReactNode) => React.ReactNode) {
  const user = userEvent.setup()
  // userEvent가 붙인 클립보드 흉내를 이 시험의 가짜로 바꾼다
  Object.defineProperty(globalThis.navigator, 'clipboard', { value: { writeText }, configurable: true })
  const node = <GcalConnect view={view} now={now} {...fns} />
  render(wrap ? wrap(node) : node)
  return user
}

const card = () => screen.getByRole('region', { name: TITLE })
const urlInput = () => screen.getByLabelText(/^코드 주소/) as HTMLInputElement
const secretInput = () => screen.getByLabelText(/^비밀 글자/) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const noBrackets = (text: string) => text.replace(/[[\]]/g, '')
/** 비밀 글자가 화면 어디에도 없나(그린 글·칸 값 모두) */
const secretOnScreen = (secret: string) =>
  document.body.innerHTML.includes(secret) || [...document.querySelectorAll('input')].some((input) => input.value.includes(secret))

async function copyCode(user: ReturnType<typeof userEvent.setup>) {
  await user.click(button('구글 코드 복사'))
  await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
}

async function testConnection(user: ReturnType<typeof userEvent.setup>) {
  clock = new Date('2026-11-22T23:46:00Z')
  await user.click(button('연결 시험'))
}

describe('AC-8528.2 잇기 화면 글', () => {
  it('AC-8528.2: 제목·오른쪽 글·설명·노란 상자·세 단계 제목·칸 이름과 도움 글·아래 글이 notes-calendar 그대로다', () => {
    setup()
    const section = card()
    expect(within(section).getByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
    expect(within(section).getByText(NOT_YET)).toBeTruthy()
    expect(within(section).getByText((_, el) => el?.tagName === 'P' && el.textContent === LEAD)).toBeTruthy()
    expect(within(section).getByText(PRIVACY)).toBeTruthy()
    expect(within(section).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([STEP1, STEP2, STEP3])
    const urlLabel = section.querySelector('label[for="' + urlInput().id + '"]')
    expect(urlLabel?.textContent).toBe("코드 주소구글이 준 '웹 앱 주소'")
    const secretLabel = section.querySelector('label[for="' + secretInput().id + '"]')
    expect(secretLabel?.textContent).toBe('비밀 글자코드 맨 위 줄')
    expect(within(section).getByText(SECRET_HELP)).toBeTruthy()
    expect(within(section).getByText(PICK_HELP)).toBeTruthy()
    expect(within(section).getByText(BOTTOM)).toBeTruthy()
    expect(button('구글 코드 복사')).toBeTruthy()
    expect(button('보기')).toBeTruthy()
    expect(button('연결 시험')).toBeTruthy()
    // 시험 전에는 결과 줄·캘린더 목록·잇기 단추가 없다
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByRole('button', { name: /잇고 다음/ })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-8528.2: 따라 하기는 다섯 줄(2절 표 1의 서비스 켜기 줄이 3번)이고 [ ]는 글쇠 모양으로 그린다', () => {
    setup()
    const items = within(screen.getByRole('list', { name: STEP1 })).getAllByRole('listitem')
    expect(items.map((li) => noBrackets(li.textContent ?? ''))).toEqual(HOWTO.map(noBrackets))
    expect(items.map((li) => [...li.querySelectorAll('kbd')].map((kbd) => kbd.textContent))).toEqual(HOWTO_KEYS)
    expect(items[0].querySelector('code')?.textContent).toBe('script.google.com')
    expect(screen.getByRole('list', { name: STEP1 }).tagName).toBe('OL')
  })

  it("AC-8528.2: 이미 이어진 병원(이은 날 있음)은 '아직 이어지지 않았어요'를 그리지 않는다", () => {
    setup({ ...VIEW_SAVED, calendarId: 'c1', calendarName: '2026 양지바른정형외과', linkedOn: '2026-11-23' })
    expect(screen.queryByText(NOT_YET)).toBeNull()
    expect(urlInput().value).toBe(URL_A)
  })
})

describe('AC-8528.3 [구글 코드 복사]', () => {
  it('AC-8528.3: 무작위 32바이트 → base64url 비밀 글자를 넣은 구글 코드를 클립보드에 넣고, 복사한 때 줄·알림이 뜨며 비밀 글자 칸이 가려진 채 채워진다', async () => {
    const user = setup()
    await copyCode(user)
    expect(randomSpy).toHaveBeenCalledTimes(1)
    const asked = randomSpy.mock.calls[0][0] as Uint8Array
    expect(asked).toBeInstanceOf(Uint8Array)
    expect(asked.length).toBe(32)
    expect(FAKE_SECRET).toMatch(/^[A-Za-z0-9_-]{43}$/)
    expect(writeText).toHaveBeenCalledWith(buildCalendarCode(FAKE_SECRET))
    expect(writeText.mock.calls[0][0]).toContain(`const KEY = '${FAKE_SECRET}';`)
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '11/23 (월) 08:41에 복사했어요 · 비밀 글자를 새로 만들어 코드 맨 위에 넣었어요')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe(COPIED_NOTICE)
    expect(secretInput().type).toBe('password')
    expect(secretInput().value).toBe(FAKE_SECRET)
    // 아직 시험 전이라 저장하지 않는다
    expect(fns.saveConnection).not.toHaveBeenCalled()
    expect(fns.ping).not.toHaveBeenCalled()
  })

  it('AC-8528.3: [보기]를 누르면 비밀 글자가 보이고 단추는 [숨기기], 다시 누르면 가린다', async () => {
    const user = setup()
    await copyCode(user)
    await user.click(button('보기'))
    expect(secretInput().type).toBe('text')
    await user.click(button('숨기기'))
    expect(secretInput().type).toBe('password')
    expect(button('보기')).toBeTruthy()
  })

  it('AC-8528.3: 클립보드에 넣지 못하면 비밀 글자 칸을 채우지 않고 복사한 때 줄·알림도 없다', async () => {
    const user = setup()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await user.click(button('구글 코드 복사'))
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1))
    expect(secretInput().value).toBe('')
    expect(screen.queryByText(/에 복사했어요/)).toBeNull()
    expect(screen.queryByRole('status')).toBeNull()
  })
})

describe('AC-8528.4 [연결 시험]', () => {
  it("AC-8528.4: 되면 '연결됐어요 · 병원 구글 계정에서 캘린더 {n}개를 찾았어요 ({HH:mm})'와 캘린더 줄, 보기만 되는 캘린더는 못 고른다", async () => {
    const user = setup()
    await user.type(urlInput(), URL_A)
    await copyCode(user)
    await testConnection(user)
    await screen.findByRole('radiogroup', { name: '이을 캘린더' })
    expect(fns.ping).toHaveBeenCalledWith({ scriptUrl: URL_A, secret: FAKE_SECRET })
    expect(screen.getByText((_, el) => el?.tagName === 'P' && el.textContent === '연결됐어요 · 병원 구글 계정에서 캘린더 4개를 찾았어요 (08:46)')).toBeTruthy()
    const radios = within(screen.getByRole('radiogroup')).getAllByRole('radio') as HTMLInputElement[]
    const rowText = (radio: HTMLInputElement) => radio.closest('label')?.textContent
    expect(radios.map(rowText)).toEqual([
      '2026 양지바른정형외과지난 1년 4,188개 · 앞으로 195개 · 고칠 수 있음',
      '직원 생일지난 1년 6개 · 앞으로 6개 · 고칠 수 있음',
      '예약 본점지난 1년 3개 · 앞으로 2개 · 고칠 수 있음',
      `대한민국의 휴일${READ_ONLY_CAL}`,
    ])
    expect(radios.map((radio) => radio.disabled)).toEqual([false, false, false, true])
    expect(radios.map((radio) => radio.checked)).toEqual([false, false, false, false])
    await user.click(radios[3])
    expect(radios[3].checked).toBe(false)
  })

  it('AC-8528.4: 주소·비밀 글자는 시험이 된 뒤에만 저장하고, 저장한 비밀 글자는 화면(그린 글·칸 값)에 다시 그리지 않는다', async () => {
    const user = setup()
    await user.type(urlInput(), URL_A)
    await copyCode(user)
    expect(secretOnScreen(FAKE_SECRET)).toBe(true) // 저장 전에는 가린 칸에 있다
    await testConnection(user)
    await waitFor(() => expect(fns.saveConnection).toHaveBeenCalledWith({ scriptUrl: URL_A, secret: FAKE_SECRET }))
    expect(fns.ping.mock.invocationCallOrder[0]).toBeLessThan(fns.saveConnection.mock.invocationCallOrder[0])
    await screen.findByRole('radiogroup')
    expect(secretOnScreen(FAKE_SECRET)).toBe(false)
    expect(secretInput().value).toBe('')
    await user.click(button('보기'))
    expect(secretOnScreen(FAKE_SECRET)).toBe(false)
  })

  it('AC-8528.4: 안 되면 오류 카드(구글 코드 답의 오류 번호)이고 저장하지 않으며, 구글이 준 글은 그리지 않는다', async () => {
    const user = setup()
    fns.ping.mockResolvedValueOnce({ ok: false, version: '1', error: 'E-GCAL-KEY', code: 'E-GCAL-KEY', message: 'bad_token 가짜 원문' })
    await user.type(urlInput(), URL_A)
    await copyCode(user)
    await testConnection(user)
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toBe('비밀 글자가 맞지 않아요.설정에서 코드를 다시 복사해 붙여 주세요.오류 번호 E-GCAL-KEY')
    expect(screen.queryByText(/가짜 원문/)).toBeNull()
    expect(fns.saveConnection).not.toHaveBeenCalled()
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText(/연결됐어요/)).toBeNull()
    // 다시 해 볼 수 있게 비밀 글자는 가린 칸에 그대로
    expect(secretInput().value).toBe(FAKE_SECRET)
  })

  it('AC-8528.4: 부르다 던지거나 모르는 오류 번호면 E-GCAL-REACH 카드', async () => {
    const user = setup()
    fns.ping.mockRejectedValueOnce(new Error('network'))
    await user.type(urlInput(), URL_A)
    await copyCode(user)
    await testConnection(user)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-GCAL-REACH')
    fns.ping.mockResolvedValueOnce({ ok: false, version: '1', error: 'weird', code: 'weird' })
    await user.click(button('연결 시험'))
    await waitFor(() => expect(fns.ping).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-GCAL-REACH')
    expect(fns.saveConnection).not.toHaveBeenCalled()
  })

  it('AC-8528.4: 주소 모양이 틀리면 부르지 않고 E-GCAL-URL, 비밀 글자가 없으면 E-GCAL-KEY 카드', async () => {
    const user = setup()
    await copyCode(user)
    await user.type(urlInput(), 'https://script.google.com/home')
    await user.click(button('연결 시험'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-GCAL-URL')
    cleanup()
    const user2 = setup()
    await user2.type(urlInput(), URL_A)
    await user2.click(button('연결 시험'))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-GCAL-KEY')
    expect(fns.ping).not.toHaveBeenCalled()
  })

  it('AC-8528.4: 비밀 글자를 이미 저장한 병원은 칸이 비어 있고, 빈 칸으로 시험하면 저장한 것을 쓰라고(null) 부르며 주소가 같으면 다시 저장하지 않는다', async () => {
    const user = setup(VIEW_SAVED)
    expect(urlInput().value).toBe(URL_A)
    expect(secretInput().value).toBe('')
    await testConnection(user)
    await screen.findByRole('radiogroup')
    expect(fns.ping).toHaveBeenCalledWith({ scriptUrl: URL_A, secret: null })
    expect(fns.saveConnection).not.toHaveBeenCalled()
  })

  it('AC-8528.4: 저장한 비밀 글자로 주소만 바꿔 시험이 되면 주소만 바꿔 저장한다(secret null = 저장한 것 그대로)', async () => {
    const user = setup(VIEW_SAVED)
    await user.clear(urlInput())
    await user.type(urlInput(), URL_B)
    await testConnection(user)
    await waitFor(() => expect(fns.saveConnection).toHaveBeenCalledWith({ scriptUrl: URL_B, secret: null }))
  })

  it('AC-8528.4: 시험은 됐지만 저장하지 못하면 E-SETTINGS-FAILED 카드이고 캘린더 목록을 보이지 않는다', async () => {
    const user = setup()
    fns.saveConnection.mockResolvedValueOnce('invalid')
    await user.type(urlInput(), URL_A)
    await copyCode(user)
    await testConnection(user)
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('AC-8528.4: 시험이 된 뒤 주소를 고치면 결과 줄·목록을 거둔다(다시 시험해야 함)', async () => {
    const user = setup(VIEW_SAVED)
    await testConnection(user)
    await screen.findByRole('radiogroup')
    await user.type(urlInput(), 'x')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    expect(screen.queryByText(/연결됐어요/)).toBeNull()
  })
})

describe('AC-8528.5 캘린더 고르고 잇기', () => {
  it("AC-8528.5: 고르면 단추 '{이름}'{로/으로} 잇고 다음 → 이 뜨고, 누르면 캘린더 id·이름·바탕 hex를 저장한 뒤 다음(② 시행자·종류)으로 간다", async () => {
    const user = setup(VIEW_SAVED)
    await testConnection(user)
    await screen.findByRole('radiogroup')
    expect(screen.getByText(BOTTOM)).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /^2026 양지바른정형외과/ }))
    const next = button("'2026 양지바른정형외과'로 잇고 다음 →")
    await user.click(next)
    await waitFor(() => expect(fns.onNext).toHaveBeenCalledTimes(1))
    expect(fns.saveCalendar).toHaveBeenCalledWith({ calendarId: 'c1', calendarName: '2026 양지바른정형외과', defaultHex: '#9fc6e7' })
    expect(fns.saveCalendar.mock.invocationCallOrder[0]).toBeLessThan(fns.onNext.mock.invocationCallOrder[0])
  })

  it('AC-8528.5: 조사는 이름 끝 받침으로(ㄹ 받침 → 로, 그 밖 받침 → 으로), 바탕 색 모양이 틀리면 캘린더 기본 색으로 저장한다', async () => {
    const user = setup(VIEW_SAVED)
    await testConnection(user)
    await screen.findByRole('radiogroup')
    await user.click(screen.getByRole('radio', { name: /^직원 생일/ }))
    expect(button("'직원 생일'로 잇고 다음 →")).toBeTruthy()
    await user.click(screen.getByRole('radio', { name: /^예약 본점/ }))
    await user.click(button("'예약 본점'으로 잇고 다음 →"))
    await waitFor(() => expect(fns.saveCalendar).toHaveBeenCalledWith({ calendarId: 'c3', calendarName: '예약 본점', defaultHex: GCAL_DEFAULT_HEX }))
  })

  it('AC-8528.5: 이미 고른 캘린더가 목록에 있으면 그 줄이 골라져 있다', async () => {
    const user = setup({ ...VIEW_SAVED, calendarId: 'c2', calendarName: '직원 생일' })
    await testConnection(user)
    expect((await screen.findByRole('radio', { name: /^직원 생일/ }) as HTMLInputElement).checked).toBe(true)
    expect(button("'직원 생일'로 잇고 다음 →")).toBeTruthy()
  })

  it('AC-8528.5: 캘린더를 저장하지 못하면 E-SETTINGS-FAILED 카드이고 다음으로 가지 않는다', async () => {
    const user = setup(VIEW_SAVED)
    fns.saveCalendar.mockRejectedValueOnce(new Error('offline'))
    await testConnection(user)
    await user.click(await screen.findByRole('radio', { name: /^2026 양지바른정형외과/ }))
    await user.click(button("'2026 양지바른정형외과'로 잇고 다음 →"))
    expect((await screen.findByRole('alert')).textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(fns.onNext).not.toHaveBeenCalled()
  })
})

describe('AC-8528.1 데스크는 보기만', () => {
  it('AC-8528.1: 데스크는 잇기 화면의 모든 칸·단추가 잠기고(주소는 보임) 구글을 부르지 않는다', async () => {
    const user = setup(VIEW_SAVED, (node) => <RoleProvider desk>{node}</RoleProvider>)
    const section = card()
    const controls = [...section.querySelectorAll('button, input')] as (HTMLButtonElement | HTMLInputElement)[]
    expect(controls.length).toBeGreaterThanOrEqual(5)
    expect(controls.filter((control) => !control.disabled).map((control) => control.outerHTML)).toEqual([])
    expect(urlInput().value).toBe(URL_A)
    await user.click(button('연결 시험'))
    await user.click(button('구글 코드 복사'))
    expect(fns.ping).not.toHaveBeenCalled()
    expect(writeText).not.toHaveBeenCalled()
  })
})
