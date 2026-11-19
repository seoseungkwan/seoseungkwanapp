// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import {
  defaultProfile,
  downloadLogo,
  loadClinicProfile,
  loadSignup,
  normalizeLogo,
  removeLogo,
  saveClinicProfile,
  uploadLogo,
} from '@/lib/storage/clinicProfile'
import { CAL_COLORS } from '@/types/calendar'
import { DEFAULT_HOURS, type ClinicProfile, type ClinicStaff } from '@/types/clinicProfile'
import { ClinicProfileCard } from './ClinicProfileCard'

// 설정 '병원 정보' 칸 (spec clinic-profile REQ-6602 AC-6602.1~AC-6602.8, design.md 3절).
// 저장 층(lib/storage/clinicProfile)의 읽기·저장·로고 함수는 가짜다 — 검사(checkProfile·dayProblem)와 기본값(defaultProfile)만 진짜다.
// 실제 Supabase·Next 라우터에 붙지 않는다. 이름·전화·주소·사람은 모두 지어낸 값이다

vi.setConfig({ testTimeout: 60_000 })

vi.mock('@/lib/storage/clinicProfile', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/clinicProfile')>()),
  loadClinicProfile: vi.fn(),
  loadSignup: vi.fn(),
  downloadLogo: vi.fn(),
  saveClinicProfile: vi.fn(),
  uploadLogo: vi.fn(),
  removeLogo: vi.fn(),
  normalizeLogo: vi.fn(),
}))
const client = vi.hoisted(() => ({ client: 'browser' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => client }))
const router = vi.hoisted(() => ({ refresh: vi.fn(), push: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

const SIGNUP = { name: '가짜정형외과의원', phone: '0212345678' }
const LOGO_PATH = '11111111-2222-4333-8444-555555555555/aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee.png'
const NEW_LOGO_PATH = '11111111-2222-4333-8444-555555555555/bbbbbbbb-cccc-4ddd-8eee-ffffffffffff.png'
const SAVED_LOGO = 'data:image/png;base64,iVBORw0KGgoAAAA='
const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3])
const FIELDS = ['병원 이름', '로고', '전화', '주소', '호칭', '쓰는 EMR', '진료시간', '휴진일', '원장님·직원'] // '쓰는 EMR'은 spec emr-choice AC-7102.2
const DAYS = ['월', '화', '수', '목', '금', '토', '일']

const person = (n: number, extra: Partial<ClinicStaff> = {}): ClinicStaff => ({
  id: `p-${n}`,
  name: `사람${n}`,
  role: 'staff',
  mark: String.fromCodePoint(0xac00 + n), // 가·각·갂… 겹치지 않는 한 글자
  color: CAL_COLORS[n % CAL_COLORS.length]!,
  calendar: true,
  ...extra,
})

const SAVED: ClinicProfile = {
  ...defaultProfile(),
  displayName: '바뀐정형외과',
  phone: '0311234567',
  address: '가짜시 가짜로 1',
  honorific: '대표원장님',
  hours: [
    { open: 510, close: 1110, lunchFrom: 750, lunchTo: 810 },
    ...DEFAULT_HOURS.slice(1, 6).map((d) => (d === null ? null : { ...d })),
    { open: 540, close: 720, lunchFrom: null, lunchTo: null },
  ],
  closedDates: ['2026-12-25', '2027-01-01'],
  staff: [person(1, { name: '김원장', role: 'doctor', mark: '김', color: 'blue' }), person(2, { name: '이직원', mark: '이', color: 'teal', calendar: false })],
  logoPath: null,
}

const card = () => screen.getByRole('region', { name: '병원 정보' })
const box = (name: string) => screen.getByRole('textbox', { name }) as HTMLInputElement
const select = (name: string) => screen.getByRole('combobox', { name }) as HTMLSelectElement
const shown = (name: string) => select(name).selectedOptions[0]?.textContent
const check = (name: string) => screen.getByRole('checkbox', { name }) as HTMLInputElement
const saveButton = () => screen.getByRole('button', { name: '저장' }) as HTMLButtonElement
const honorific = () => within(screen.getByRole('group', { name: '호칭' }))
const emrGroup = () => within(screen.getByRole('group', { name: '쓰는 EMR' }))
const emrPressed = () => emrGroup().getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])
const staffRows = () => within(screen.getByRole('list', { name: '원장님·직원 목록' })).getAllByRole('listitem')
const staffNames = () => staffRows().map((row) => (within(row).getByRole('textbox', { name: '이름' }) as HTMLInputElement).value)
const closedChips = () =>
  within(screen.getByRole('list', { name: '휴진일 목록' }))
    .queryAllByRole('listitem')
    .map((li) => li.firstElementChild?.textContent)
const lastSaved = (): ClinicProfile => vi.mocked(saveClinicProfile).mock.calls.at(-1)![1]

async function renderReady(profile: ClinicProfile | null = null) {
  vi.mocked(loadClinicProfile).mockResolvedValue(profile)
  const user = userEvent.setup()
  render(<ClinicProfileCard />)
  await screen.findByRole('textbox', { name: '병원 이름' })
  return user
}

async function addDate(user: ReturnType<typeof userEvent.setup>, ymd: string) {
  fireEvent.change(screen.getByLabelText('휴진일 날짜'), { target: { value: ymd } })
  await user.click(screen.getByRole('button', { name: '더하기' }))
}

function pngFile(name = 'logo.png') {
  return new File([PNG_BYTES], name, { type: 'image/png' })
}

beforeEach(() => {
  vi.mocked(loadClinicProfile).mockReset().mockResolvedValue(null)
  vi.mocked(loadSignup).mockReset().mockResolvedValue(SIGNUP)
  vi.mocked(downloadLogo).mockReset().mockResolvedValue(SAVED_LOGO)
  // 저장은 받은 값을 깨끗하게 해 돌려주는 척한다(전화는 숫자만)
  vi.mocked(saveClinicProfile)
    .mockReset()
    .mockImplementation(async (_client, profile) => ({ ...profile, phone: profile.phone === null ? null : profile.phone.replace(/\D/g, '') }))
  vi.mocked(uploadLogo).mockReset().mockResolvedValue(NEW_LOGO_PATH)
  vi.mocked(removeLogo).mockReset().mockResolvedValue('ok')
  vi.mocked(normalizeLogo).mockReset().mockImplementation(async () => new Blob([PNG_BYTES], { type: 'image/png' }))
  for (const fn of Object.values(router)) fn.mockReset()
})
afterEach(cleanup)

describe('AC-6602.1 칸 차례', () => {
  it("AC-6602.1·AC-7102.2: 제목 '병원 정보' 아래 칸 차례는 병원 이름·로고·전화·주소·호칭·쓰는 EMR·진료시간·휴진일·원장님·직원이고 [저장]이 있다", async () => {
    await renderReady()
    expect(within(card()).getByRole('heading', { level: 2, name: '병원 정보' })).toBeTruthy()
    expect(within(card()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(FIELDS)
    expect(saveButton().disabled).toBe(false)
    expect(loadClinicProfile).toHaveBeenCalledWith(client)
  })
})

describe('AC-6602.2 저장한 적 없는 병원의 처음 값', () => {
  it("AC-6602.2: 이름은 가입 이름, 전화는 가입 전화, 호칭 '원장님', 휴진일·직원은 비어 있다", async () => {
    await renderReady(null)
    expect(box('병원 이름').value).toBe('가짜정형외과의원')
    expect(box('전화').value).toBe('02-1234-5678')
    expect(box('주소').value).toBe('')
    expect(honorific().getByRole('button', { name: '원장님' }).getAttribute('aria-pressed')).toBe('true')
    expect(honorific().getByRole('button', { name: '대표원장님' }).getAttribute('aria-pressed')).toBe('false')
    expect(honorific().getByRole('button', { name: '선생님' }).getAttribute('aria-pressed')).toBe('false')
    expect(closedChips()).toEqual([])
    expect(screen.queryByRole('list', { name: '원장님·직원 목록' })).toBeNull()
    expect(screen.queryByRole('img', { name: '로고 미리보기' })).toBeNull()
  })

  it('AC-6602.2: 진료시간은 월~금 09:00~18:00·점심 13:00~14:00, 토 09:00~13:00(점심 없음), 일 휴진', async () => {
    await renderReady(null)
    for (const day of DAYS.slice(0, 5)) {
      expect(check(`${day}요일 휴진`).checked, day).toBe(false)
      expect([shown(`${day}요일 시작`), shown(`${day}요일 끝`)]).toEqual(['09:00', '18:00'])
      expect([shown(`${day}요일 점심 시작`), shown(`${day}요일 점심 끝`)]).toEqual(['13:00', '14:00'])
    }
    expect(check('토요일 휴진').checked).toBe(false)
    expect([shown('토요일 시작'), shown('토요일 끝')]).toEqual(['09:00', '13:00'])
    expect([shown('토요일 점심 시작'), shown('토요일 점심 끝')]).toEqual(['없음', '없음'])
    expect(check('일요일 휴진').checked).toBe(true)
    expect(select('일요일 시작').disabled).toBe(true)
  })

  it('AC-6602.2: 열기만 해서는 저장하지 않고, [저장]을 눌러야 그 값(가입 이름·가입 전화·기본 진료시간)으로 저장한다', async () => {
    const user = await renderReady(null)
    expect(saveClinicProfile).not.toHaveBeenCalled()
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(removeLogo).not.toHaveBeenCalled()
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(saveClinicProfile).toHaveBeenCalledTimes(1)
    expect(vi.mocked(saveClinicProfile).mock.calls[0]![0]).toBe(client)
    const sent = lastSaved()
    expect(sent.displayName).toBe('가짜정형외과의원')
    expect(sent.phone?.replace(/\D/g, '')).toBe('0212345678')
    expect(sent.address).toBeNull()
    expect(sent.honorific).toBe('원장님')
    expect(sent.hours).toEqual(DEFAULT_HOURS)
    expect(sent.closedDates).toEqual([])
    expect(sent.staff).toEqual([])
    // 로고는 바뀌지 않았으니 올리지도 빼지도 않는다
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(removeLogo).not.toHaveBeenCalled()
  })

  it('AC-6602.2: 저장한 병원은 저장한 값이 보인다', async () => {
    await renderReady(SAVED)
    expect(box('병원 이름').value).toBe('바뀐정형외과')
    expect(box('전화').value).toBe('031-123-4567')
    expect(box('주소').value).toBe('가짜시 가짜로 1')
    expect(honorific().getByRole('button', { name: '대표원장님' }).getAttribute('aria-pressed')).toBe('true')
    expect([shown('월요일 시작'), shown('월요일 끝'), shown('월요일 점심 시작'), shown('월요일 점심 끝')]).toEqual(['08:30', '18:30', '12:30', '13:30'])
    expect(check('일요일 휴진').checked).toBe(false)
    expect([shown('일요일 시작'), shown('일요일 끝')]).toEqual(['09:00', '12:00'])
    expect(closedChips()).toEqual(['2026-12-25 (금)', '2027-01-01 (금)'])
    expect(staffNames()).toEqual(['김원장', '이직원'])
  })

  it('AC-6602.2: 고친 값으로 저장한다(이름·전화·주소·호칭)', async () => {
    const user = await renderReady(null)
    await user.clear(box('병원 이름'))
    await user.type(box('병원 이름'), '새이름정형외과')
    await user.clear(box('전화'))
    await user.type(box('전화'), '031-987-6543')
    await user.type(box('주소'), '가짜시 새길 2')
    await user.click(honorific().getByRole('button', { name: '선생님' }))
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved()).toMatchObject({ displayName: '새이름정형외과', address: '가짜시 새길 2', honorific: '선생님' })
    expect(lastSaved().phone?.replace(/\D/g, '')).toBe('0319876543')
  })

  it('AC-6602.2: 병원 이름을 비우면 없음(null)으로 저장한다 — 헤더는 가입 이름을 쓴다', async () => {
    const user = await renderReady(SAVED)
    await user.clear(box('병원 이름'))
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().displayName).toBeNull()
  })
})

describe('AC-6602.3 진료시간', () => {
  it('AC-6602.3: 시간 고르기는 10분 단위 06:00~23:50이다(점심은 맨 앞에 비우기 "없음")', async () => {
    await renderReady(null)
    const labels = [...select('월요일 시작').options].map((o) => o.textContent)
    expect(labels).toHaveLength(108)
    expect(labels[0]).toBe('06:00')
    expect(labels[1]).toBe('06:10')
    expect(labels.at(-1)).toBe('23:50')
    expect([...select('월요일 끝').options].map((o) => o.textContent)).toEqual(labels)
    const lunch = [...select('월요일 점심 시작').options].map((o) => o.textContent)
    expect(lunch[0]).toBe('없음')
    expect(lunch.slice(1)).toEqual(labels)
  })

  it('AC-6602.3: 저장한 값이 고르기 칸 밖(예: 05:00·24:00)이어도 그 값이 보인다', async () => {
    await renderReady({ ...SAVED, hours: [{ open: 300, close: 1440, lunchFrom: null, lunchTo: null }, ...SAVED.hours.slice(1)] })
    expect([shown('월요일 시작'), shown('월요일 끝')]).toEqual(['05:00', '24:00'])
  })

  it('AC-6602.3: 끝이 시작보다 빠르면 그 요일 아래에 까닭이 보이고 저장이 막힌다. 고치면 풀린다', async () => {
    const user = await renderReady(null)
    await user.selectOptions(select('수요일 끝'), '480')
    const reason = screen.getByText('끝나는 시간이 시작 시간보다 늦어야 해요')
    expect(reason.closest('li')).toBe(select('수요일 끝').closest('li'))
    expect(select('수요일 끝').getAttribute('aria-invalid')).toBe('true')
    expect(saveButton().disabled).toBe(true)
    await user.click(saveButton())
    expect(saveClinicProfile).not.toHaveBeenCalled()
    await user.selectOptions(select('수요일 끝'), '1080')
    expect(screen.queryByText('끝나는 시간이 시작 시간보다 늦어야 해요')).toBeNull()
    expect(saveButton().disabled).toBe(false)
  })

  it('AC-6602.3: 점심이 진료시간 밖이거나 시작만 고르면 까닭이 보이고 저장이 막힌다', async () => {
    const user = await renderReady(null)
    await user.selectOptions(select('화요일 점심 끝'), '1140')
    expect(screen.getByText('점심은 진료시간 안에서, 시작이 끝보다 빨라야 해요').closest('li')).toBe(select('화요일 점심 끝').closest('li'))
    expect(saveButton().disabled).toBe(true)
    await user.selectOptions(select('화요일 점심 끝'), '')
    expect(screen.getByText('점심은 시작과 끝을 함께 고르거나 함께 비워 주세요')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
    await user.selectOptions(select('화요일 점심 시작'), '')
    expect(saveButton().disabled).toBe(false)
  })

  it("AC-6602.3: 점심을 비우면 점심 없음, '휴진'을 체크하면 그 요일은 휴진(null)으로 저장한다. 풀면 시간을 다시 고를 수 있다", async () => {
    const user = await renderReady(null)
    await user.selectOptions(select('월요일 점심 시작'), '')
    await user.selectOptions(select('월요일 점심 끝'), '')
    await user.selectOptions(select('월요일 시작'), '600')
    await user.click(check('목요일 휴진'))
    expect(select('목요일 시작').disabled).toBe(true)
    await user.click(check('일요일 휴진'))
    expect(select('일요일 시작').disabled).toBe(false)
    await user.selectOptions(select('일요일 끝'), '720')
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    const hours = lastSaved().hours
    expect(hours[0]).toEqual({ open: 600, close: 1080, lunchFrom: null, lunchTo: null })
    expect(hours[3]).toBeNull()
    expect(hours[6]).toMatchObject({ close: 720 })
    expect(hours).toHaveLength(7)
  })
})

describe('AC-6602.4 휴진일', () => {
  it('AC-6602.4: 날짜를 더하면 앞날부터 차례로 보이고, 같은 날은 한 번만, ×로 뺀다', async () => {
    const user = await renderReady(null)
    await addDate(user, '2027-03-01')
    await addDate(user, '2026-12-25')
    await addDate(user, '2027-01-01')
    expect(closedChips()).toEqual(['2026-12-25 (금)', '2027-01-01 (금)', '2027-03-01 (월)'])
    await addDate(user, '2027-01-01')
    expect(closedChips()).toEqual(['2026-12-25 (금)', '2027-01-01 (금)', '2027-03-01 (월)'])
    expect(screen.getByText('이미 더한 날이에요.')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '2027-01-01 빼기' }))
    expect(closedChips()).toEqual(['2026-12-25 (금)', '2027-03-01 (월)'])
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().closedDates).toEqual(['2026-12-25', '2027-03-01'])
  })

  it('AC-6602.4: 200개까지다 — 200개면 더하기가 막히고 까닭이 보인다', async () => {
    const dates = Array.from({ length: 200 }, (_, i) => {
      const d = new Date(Date.UTC(2026, 0, 1 + i))
      return d.toISOString().slice(0, 10)
    })
    await renderReady({ ...SAVED, closedDates: dates })
    expect(closedChips()).toHaveLength(200)
    expect((screen.getByRole('button', { name: '더하기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('휴진일은 200개까지예요')).toBeTruthy()
  })

  it('AC-6602.4: 저장하면 저장 층이 돌려준 목록(1년 넘게 지난 날을 뺀 것)이 보인다', async () => {
    vi.mocked(saveClinicProfile).mockImplementation(async (_client, profile) => ({ ...profile, closedDates: profile.closedDates.filter((d) => d >= '2025-11-18') }))
    const user = await renderReady({ ...SAVED, closedDates: ['2024-05-05', '2026-12-25'] })
    expect(closedChips()).toEqual(['2024-05-05 (일)', '2026-12-25 (금)'])
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().closedDates).toEqual(['2024-05-05', '2026-12-25'])
    expect(closedChips()).toEqual(['2026-12-25 (금)'])
  })
})

describe('AC-6602.5 원장님·직원', () => {
  it("AC-6602.5: 줄마다 이름·'원장님'/'직원'·표시 글자·색·'예약에 보이기'·▲▼·[빼기]가 있다", async () => {
    await renderReady(SAVED)
    const [first, second] = staffRows()
    const one = within(first!)
    expect((one.getByRole('textbox', { name: '이름' }) as HTMLInputElement).value).toBe('김원장')
    expect((one.getByRole('textbox', { name: '이름' }) as HTMLInputElement).maxLength).toBe(10)
    expect(one.getByRole('button', { name: '원장님' }).getAttribute('aria-pressed')).toBe('true')
    expect(one.getByRole('button', { name: '직원' }).getAttribute('aria-pressed')).toBe('false')
    expect((one.getByRole('textbox', { name: '예약 표시 글자' }) as HTMLInputElement).value).toBe('김')
    expect(one.getByRole('button', { name: '색 고르기 (파랑)' })).toBeTruthy()
    expect((one.getByRole('checkbox', { name: '예약에 보이기' }) as HTMLInputElement).checked).toBe(true)
    expect((one.getByRole('button', { name: '1번째 사람 위로' }) as HTMLButtonElement).disabled).toBe(true)
    expect((one.getByRole('button', { name: '1번째 사람 아래로' }) as HTMLButtonElement).disabled).toBe(false)
    expect(one.getByRole('button', { name: '1번째 사람 빼기' }).textContent).toBe('빼기')
    const two = within(second!)
    expect(two.getByRole('button', { name: '직원' }).getAttribute('aria-pressed')).toBe('true')
    expect((two.getByRole('checkbox', { name: '예약에 보이기' }) as HTMLInputElement).checked).toBe(false)
    expect((two.getByRole('button', { name: '2번째 사람 아래로' }) as HTMLButtonElement).disabled).toBe(true)
  })

  it('AC-6602.5: [사람 더하기] → 이름을 적으면 표시 글자는 이름 첫 글자, 색은 아직 안 쓴 첫 색, 예약에 보이기 체크', async () => {
    const user = await renderReady(SAVED) // 파랑·청록을 쓴다
    await user.click(screen.getByRole('button', { name: '사람 더하기' }))
    const row = within(staffRows()[2]!)
    await user.type(row.getByRole('textbox', { name: '이름' }), '박물리')
    expect((row.getByRole('textbox', { name: '예약 표시 글자' }) as HTMLInputElement).value).toBe('박')
    expect(row.getByRole('button', { name: '색 고르기 (보라)' })).toBeTruthy()
    expect((row.getByRole('checkbox', { name: '예약에 보이기' }) as HTMLInputElement).checked).toBe(true)
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    const added = lastSaved().staff[2]!
    expect(added).toMatchObject({ name: '박물리', mark: '박', color: 'purple', calendar: true })
    expect(['doctor', 'staff']).toContain(added.role)
    expect(added.id.length).toBeGreaterThan(0)
    expect(added.id.length).toBeLessThanOrEqual(40)
    expect(lastSaved().staff.map((s) => s.id)).toEqual(['p-1', 'p-2', added.id])
  })

  it('AC-6602.5: 표시 글자를 손으로 고치면 이름을 바꿔도 그대로다. 새 사람끼리 id가 겹치지 않는다', async () => {
    const user = await renderReady(null)
    await user.click(screen.getByRole('button', { name: '사람 더하기' }))
    await user.click(screen.getByRole('button', { name: '사람 더하기' }))
    const [a, b] = staffRows().map((r) => within(r))
    await user.type(a!.getByRole('textbox', { name: '이름' }), '최가')
    await user.clear(a!.getByRole('textbox', { name: '예약 표시 글자' }))
    await user.type(a!.getByRole('textbox', { name: '예약 표시 글자' }), '★')
    await user.type(a!.getByRole('textbox', { name: '이름' }), '나')
    expect((a!.getByRole('textbox', { name: '예약 표시 글자' }) as HTMLInputElement).value).toBe('★')
    await user.type(b!.getByRole('textbox', { name: '이름' }), '정다')
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    const [first, second] = lastSaved().staff
    expect(first).toMatchObject({ name: '최가나', mark: '★', color: 'blue' })
    expect(second).toMatchObject({ name: '정다', mark: '정', color: 'teal' })
    expect(first!.id).not.toBe(second!.id)
  })

  it('AC-6602.5: 표시 글자가 겹치거나 이름이 비면 저장이 막힌다', async () => {
    const user = await renderReady(SAVED)
    const second = within(staffRows()[1]!)
    await user.clear(second.getByRole('textbox', { name: '예약 표시 글자' }))
    await user.type(second.getByRole('textbox', { name: '예약 표시 글자' }), '김')
    expect(screen.getByText('예약 표시 글자가 겹쳐요')).toBeTruthy()
    expect(second.getByRole('textbox', { name: '예약 표시 글자' }).getAttribute('aria-invalid')).toBe('true')
    expect(saveButton().disabled).toBe(true)
    await user.clear(second.getByRole('textbox', { name: '예약 표시 글자' }))
    await user.type(second.getByRole('textbox', { name: '예약 표시 글자' }), '이')
    expect(saveButton().disabled).toBe(false)
    await user.clear(second.getByRole('textbox', { name: '이름' }))
    expect(screen.getByText('이름은 1~10자로 적어 주세요')).toBeTruthy()
    expect(saveButton().disabled).toBe(true)
  })

  it("AC-6602.5: '원장님'/'직원'·예약에 보이기·색(예약 20색)을 고치고 ▲▼로 차례를 바꾸고 [빼기]로 뺀다", async () => {
    const user = await renderReady({ ...SAVED, staff: [...SAVED.staff, person(3, { name: '박셋', mark: '박', color: 'purple' })] })
    const second = within(staffRows()[1]!)
    await user.click(second.getByRole('button', { name: '원장님' }))
    await user.click(second.getByRole('checkbox', { name: '예약에 보이기' }))
    await user.click(second.getByRole('button', { name: '색 고르기 (청록)' }))
    const palette = within(second.getByRole('group', { name: '색 고르기' }))
    expect(palette.getAllByRole('button')).toHaveLength(20)
    expect(palette.getByRole('button', { name: '청록' }).getAttribute('aria-pressed')).toBe('true')
    await user.click(palette.getByRole('button', { name: '주황' }))
    expect(second.queryByRole('group', { name: '색 고르기' })).toBeNull()
    expect(second.getByRole('button', { name: '색 고르기 (주황)' })).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '3번째 사람 위로' }))
    expect(staffNames()).toEqual(['김원장', '박셋', '이직원'])
    await user.click(screen.getByRole('button', { name: '1번째 사람 아래로' }))
    expect(staffNames()).toEqual(['박셋', '김원장', '이직원'])
    await user.click(screen.getByRole('button', { name: '2번째 사람 빼기' }))
    expect(staffNames()).toEqual(['박셋', '이직원'])
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().staff).toEqual([
      person(3, { name: '박셋', mark: '박', color: 'purple' }),
      { ...SAVED.staff[1], role: 'doctor', calendar: true, color: 'orange' },
    ])
  })

  it('AC-6602.5: 30명까지다 — 30명이면 [사람 더하기]가 막히고 까닭이 보인다', async () => {
    const staff = Array.from({ length: 30 }, (_, i) => person(i + 1))
    await renderReady({ ...SAVED, staff })
    expect(staffRows()).toHaveLength(30)
    expect((screen.getByRole('button', { name: '사람 더하기' }) as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('원장님·직원은 30명까지예요')).toBeTruthy()
  })
})

describe('AC-6602.6 로고', () => {
  it('AC-6602.6: 그림 파일을 고르면 브라우저가 줄여(normalizeLogo) 미리보기에 보이고, [저장] 때 표를 먼저 저장한 뒤 올린다', async () => {
    const user = await renderReady(null)
    expect((screen.getByLabelText('로고 그림 파일') as HTMLInputElement).accept).toBe('image/png,image/jpeg,image/webp')
    const file = pngFile()
    await user.upload(screen.getByLabelText('로고 그림 파일'), file)
    const preview = (await screen.findByRole('img', { name: '로고 미리보기' })) as HTMLImageElement
    expect(preview.src.startsWith('data:image/png;base64,')).toBe(true)
    expect(normalizeLogo).toHaveBeenCalledWith(file)
    expect(uploadLogo).not.toHaveBeenCalled()
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(uploadLogo).toHaveBeenCalledTimes(1)
    const [sentClient, blob] = vi.mocked(uploadLogo).mock.calls[0]!
    expect(sentClient).toBe(client)
    expect(blob.type).toBe('image/png')
    expect(vi.mocked(saveClinicProfile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(uploadLogo).mock.invocationCallOrder[0]!)
    expect(removeLogo).not.toHaveBeenCalled()
    // 한 번 올렸으면 다시 저장해도 또 올리지 않는다
    await user.click(saveButton())
    await waitFor(() => expect(saveClinicProfile).toHaveBeenCalledTimes(2))
    expect(uploadLogo).toHaveBeenCalledTimes(1)
  })

  it.each([
    ['too-big', '그림이 너무 커요. 줄인 그림이 1,000,000바이트를 넘지 않게 더 작은 그림을 골라 주세요.'],
    ['unreadable', '그림을 읽지 못했어요. PNG·JPEG·WEBP 그림 파일을 골라 주세요.'],
  ] as const)('AC-6602.6: 줄인 그림이 %s이면 까닭이 보이고 올리지 않는다', async (problem, text) => {
    vi.mocked(normalizeLogo).mockResolvedValue(problem)
    const user = await renderReady(null)
    await user.upload(screen.getByLabelText('로고 그림 파일'), pngFile())
    expect(await screen.findByText(text)).toBeTruthy()
    expect(screen.queryByRole('img', { name: '로고 미리보기' })).toBeNull()
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(removeLogo).not.toHaveBeenCalled()
  })

  it('AC-6602.6: 저장한 로고가 미리보기에 보이고, [로고 빼기] → [저장]이면 표 저장 뒤 로고를 뺀다', async () => {
    const user = await renderReady({ ...SAVED, logoPath: LOGO_PATH })
    const preview = (await screen.findByRole('img', { name: '로고 미리보기' })) as HTMLImageElement
    expect(preview.getAttribute('src')).toBe(SAVED_LOGO)
    expect(downloadLogo).toHaveBeenCalledWith(client, LOGO_PATH)
    await user.click(screen.getByRole('button', { name: '로고 빼기' }))
    expect(screen.queryByRole('img', { name: '로고 미리보기' })).toBeNull()
    expect(removeLogo).not.toHaveBeenCalled()
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(removeLogo).toHaveBeenCalledExactlyOnceWith(client)
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(vi.mocked(saveClinicProfile).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(removeLogo).mock.invocationCallOrder[0]!)
  })

  it('AC-6602.6: 저장한 로고를 다른 그림으로 바꾸면 새로 올린다(옛 파일 지우기는 uploadLogo 몫) — 빼기는 부르지 않는다', async () => {
    const user = await renderReady({ ...SAVED, logoPath: LOGO_PATH })
    await screen.findByRole('img', { name: '로고 미리보기' })
    await user.upload(screen.getByLabelText('로고 그림 파일'), pngFile('new.png'))
    await waitFor(() => expect(screen.getByRole('img', { name: '로고 미리보기' }).getAttribute('src')).not.toBe(SAVED_LOGO))
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(uploadLogo).toHaveBeenCalledTimes(1)
    expect(removeLogo).not.toHaveBeenCalled()
  })

  it('AC-6602.6: 방금 고른(아직 안 올린) 로고를 빼면 저장한 로고가 없으니 아무것도 올리거나 빼지 않는다', async () => {
    const user = await renderReady(null)
    await user.upload(screen.getByLabelText('로고 그림 파일'), pngFile())
    await screen.findByRole('img', { name: '로고 미리보기' })
    await user.click(screen.getByRole('button', { name: '로고 빼기' }))
    expect(screen.queryByRole('img', { name: '로고 미리보기' })).toBeNull()
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(removeLogo).not.toHaveBeenCalled()
  })
})

describe('AC-6602.7 저장·읽기 실패, 데스크', () => {
  it("AC-6602.7: 표 저장이 실패하면 적은 값은 그대로이고 'E-CLINIC-SAVE-FAILED' 오류 칸과 [다시 저장]이 보인다. 로고는 올리지 않는다", async () => {
    vi.mocked(saveClinicProfile).mockResolvedValueOnce('failed')
    const user = await renderReady(null)
    await user.clear(box('병원 이름'))
    await user.type(box('병원 이름'), '고친이름의원')
    await user.upload(screen.getByLabelText('로고 그림 파일'), pngFile())
    await screen.findByRole('img', { name: '로고 미리보기' })
    await user.click(saveButton())
    expect(await screen.findByText('오류 번호 E-CLINIC-SAVE-FAILED')).toBeTruthy()
    expect(screen.queryByText('저장했어요')).toBeNull()
    expect(box('병원 이름').value).toBe('고친이름의원')
    expect(screen.getByRole('img', { name: '로고 미리보기' })).toBeTruthy()
    expect(uploadLogo).not.toHaveBeenCalled()
    expect(router.refresh).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await screen.findByText('저장했어요')
    expect(screen.queryByText('오류 번호 E-CLINIC-SAVE-FAILED')).toBeNull()
    expect(saveClinicProfile).toHaveBeenCalledTimes(2)
    expect(lastSaved().displayName).toBe('고친이름의원')
    expect(uploadLogo).toHaveBeenCalledTimes(1)
  })

  it("AC-6602.7: 로고 올리기가 실패하면 'E-CLINIC-LOGO-FAILED'와 [다시 저장]이 보이고, 고른 로고·적은 값이 남아 다시 저장 때 또 올린다", async () => {
    vi.mocked(uploadLogo).mockResolvedValueOnce('failed')
    const user = await renderReady(null)
    await user.upload(screen.getByLabelText('로고 그림 파일'), pngFile())
    await screen.findByRole('img', { name: '로고 미리보기' })
    await user.click(saveButton())
    expect(await screen.findByText('오류 번호 E-CLINIC-LOGO-FAILED')).toBeTruthy()
    expect(screen.queryByText('저장했어요')).toBeNull()
    expect(screen.getByRole('img', { name: '로고 미리보기' })).toBeTruthy()
    expect(box('병원 이름').value).toBe('가짜정형외과의원')
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await screen.findByText('저장했어요')
    expect(uploadLogo).toHaveBeenCalledTimes(2)
    expect(screen.queryByText('오류 번호 E-CLINIC-LOGO-FAILED')).toBeNull()
  })

  it("AC-6602.7: 로고 빼기가 실패해도 'E-CLINIC-LOGO-FAILED'와 [다시 저장]이다", async () => {
    vi.mocked(removeLogo).mockResolvedValueOnce('failed')
    const user = await renderReady({ ...SAVED, logoPath: LOGO_PATH })
    await screen.findByRole('img', { name: '로고 미리보기' })
    await user.click(screen.getByRole('button', { name: '로고 빼기' }))
    await user.click(saveButton())
    expect(await screen.findByText('오류 번호 E-CLINIC-LOGO-FAILED')).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '다시 저장' }))
    await screen.findByText('저장했어요')
    expect(removeLogo).toHaveBeenCalledTimes(2)
  })

  it("AC-6602.7: 읽기가 실패하면 'E-CLINIC-READ-FAILED'와 [다시 불러오기]이고, 누르면 다시 읽어 칸이 나온다", async () => {
    vi.mocked(loadClinicProfile).mockResolvedValueOnce('failed').mockResolvedValue(SAVED)
    const user = userEvent.setup()
    render(<ClinicProfileCard />)
    expect(await screen.findByText('오류 번호 E-CLINIC-READ-FAILED')).toBeTruthy()
    expect(screen.queryByRole('textbox', { name: '병원 이름' })).toBeNull()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    await user.click(screen.getByRole('button', { name: '다시 불러오기' }))
    expect((await screen.findByRole('textbox', { name: '병원 이름' }) as HTMLInputElement).value).toBe('바뀐정형외과')
    expect(screen.queryByText('오류 번호 E-CLINIC-READ-FAILED')).toBeNull()
    expect(loadClinicProfile).toHaveBeenCalledTimes(2)
  })

  it('AC-6602.7: 읽는 동안에는 읽는 중 글이 보이고 칸·[저장]이 없다', async () => {
    vi.mocked(loadClinicProfile).mockReturnValue(new Promise(() => {}))
    render(<ClinicProfileCard />)
    expect(screen.getByText('병원 정보를 읽는 중이에요…')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
  })

  it('AC-6602.7: 데스크에게는 칸이 없고 병원 정보를 읽지도 않는다', async () => {
    const { container } = render(
      <RoleProvider desk>
        <ClinicProfileCard />
      </RoleProvider>,
    )
    expect(container.innerHTML).toBe('')
    await Promise.resolve()
    expect(loadClinicProfile).not.toHaveBeenCalled()
  })
})

describe('AC-6602.8 저장 성공', () => {
  it("AC-6602.8: 저장이 끝나면 '저장했어요'가 보이고 router.refresh()로 헤더·탭 제목 이름을 다시 읽는다(다른 곳으로 보내지 않는다)", async () => {
    const user = await renderReady(null)
    await user.click(saveButton())
    const status = await screen.findByRole('status')
    expect(status.textContent).toBe('저장했어요')
    expect(router.refresh).toHaveBeenCalledTimes(1)
    expect(router.push).not.toHaveBeenCalled()
    expect(router.replace).not.toHaveBeenCalled()
  })

  it("AC-6602.8: 저장한 뒤 값을 고치면 '저장했어요'는 사라진다", async () => {
    const user = await renderReady(null)
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    await user.type(box('주소'), '가')
    expect(screen.queryByText('저장했어요')).toBeNull()
  })
})

describe('AC-7102.1 쓰는 EMR 들고 가기(spec emr-choice TASK-3 — 고르는 칸은 TASK-4)', () => {
  it.each(['uisarang', 'egis', 'other', 'bit'] as const)("AC-7102.1: 읽은 쓰는 EMR('%s')을 바꾸지 않고 [저장]에 그대로 실어 보낸다", async (emr) => {
    const user = await renderReady({ ...SAVED, emr })
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().emr).toBe(emr)
  })

  it("AC-7102.1: 저장한 적 없으면 기본값 'bit'로 저장한다", async () => {
    const user = await renderReady(null)
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().emr).toBe('bit')
  })
})

describe('AC-7102.2 쓰는 EMR 고르기(spec emr-choice TASK-4, design.md 3절)', () => {
  it("AC-7102.2: '호칭' 바로 아래 '쓰는 EMR' 칸에 단추 넷 '비트'·'의사랑'·'이지스'·'그 밖의 EMR'과 도움말이 있다. 저장한 적 없으면 '비트'가 눌려 있다", async () => {
    await renderReady(null)
    const titles = within(card()).getAllByRole('heading', { level: 3 }).map((h) => h.textContent)
    expect(titles[titles.indexOf('호칭') + 1]).toBe('쓰는 EMR')
    expect(emrPressed()).toEqual([
      ['비트', 'true'],
      ['의사랑', 'false'],
      ['이지스', 'false'],
      ['그 밖의 EMR', 'false'],
    ])
    const field = screen.getByRole('heading', { level: 3, name: '쓰는 EMR' }).parentElement!
    expect(within(field).getByText('진료 자료를 읽어 오는 연결은 지금 비트만 돼요. 의사랑·이지스는 준비하고 있어요.').tagName).toBe('P')
  })

  it.each([
    ['uisarang', '의사랑'],
    ['egis', '이지스'],
    ['other', '그 밖의 EMR'],
  ] as const)("AC-7102.2: 저장한 쓰는 EMR('%s')이면 '%s'만 눌려 있다", async (emr, label) => {
    await renderReady({ ...SAVED, emr })
    expect(emrPressed().filter(([, pressed]) => pressed === 'true')).toEqual([[label, 'true']])
  })

  it('AC-7102.2: 단추를 누르면 고른 값이 바뀌고(누르기만 해서는 저장하지 않음), [저장]을 누르면 고른 값으로 저장한다', async () => {
    const user = await renderReady(SAVED)
    await user.click(emrGroup().getByRole('button', { name: '이지스' }))
    expect(emrPressed().filter(([, pressed]) => pressed === 'true')).toEqual([['이지스', 'true']])
    expect(saveClinicProfile).not.toHaveBeenCalled()
    await user.click(emrGroup().getByRole('button', { name: '그 밖의 EMR' }))
    expect(emrPressed().filter(([, pressed]) => pressed === 'true')).toEqual([['그 밖의 EMR', 'true']])
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(saveClinicProfile).toHaveBeenCalledTimes(1)
    expect(lastSaved()).toMatchObject({ emr: 'other', displayName: '바뀐정형외과', honorific: '대표원장님' })
  })

  it("AC-7102.2: 비트가 아닌 병원도 '비트'를 누르고 [저장]하면 'bit'로 저장하고, 저장한 뒤 고르면 '저장했어요'가 사라진다", async () => {
    const user = await renderReady({ ...SAVED, emr: 'uisarang' })
    await user.click(emrGroup().getByRole('button', { name: '비트' }))
    await user.click(saveButton())
    await screen.findByText('저장했어요')
    expect(lastSaved().emr).toBe('bit')
    await user.click(emrGroup().getByRole('button', { name: '의사랑' }))
    expect(screen.queryByText('저장했어요')).toBeNull()
  })
})
