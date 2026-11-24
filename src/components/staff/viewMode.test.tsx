// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { ViewingProvider, type Viewing } from '@/components/shell/viewing'
import { useStaffBase, type StaffBase } from '@/components/staff/useStaffBase'
import { phoneText } from '@/lib/clinic/format'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { defaultStaffSettings, type StaffStore } from '@/lib/storage/staff'
import type { StaffFileStore } from '@/lib/storage/staffFiles'
import type { DateRange } from '@/types/dates'
import type { StaffFile, StaffMember } from '@/types/staff'
import { LeaveEditor } from './leave/LeaveEditor'
import { LeaveScreen } from './leave/LeaveScreen'
import { LEAVES as LEAVE_ROWS, MEMBERS as LEAVE_MEMBERS, PLANS as LEAVE_PLANS, TODAY as LEAVE_TODAY, clinicProfile, makeBase as leaveBase } from './leave/testData'
import { HOSPITAL, payDb, TODAY as PAY_TODAY, type PayDb } from './pay/payTestKit'
import { PayView } from './pay/PayView'
import { RosterScreen } from './roster/RosterScreen'
import { CHANGES, TODAY as SCHEDULE_TODAY, cell, kit, resetKit } from './schedule/scheduleTestKit'
import { ScheduleScreen } from './schedule/ScheduleScreen'

// 다른 의원 보는 중 직원 탭 (admin-view REQ-8009 AC-8009.3·AC-8009.4, design.md '탭마다 읽기만' 직원 줄).
// 명단·근무표·휴가·급여를 ViewingProvider viewing={가짜} 안에서 그려 쓰기 단추·칸이 없고(금액 칸은 글자로만, 창 안 칸은 막힘)
// 전화·생일·주소·계좌·메모·급여·파일 목록은 보이며 [받기]·[인쇄·PDF]·[그림 파일]·[엑셀 받기]·[엑셀 양식 받기]는 그대로인지,
// 저장 층의 쓰기 함수가 불리지 않는지 본다. viewing={null}이면 지금처럼 쓰기 단추가 있다.
// 공용 읽기 훅(useStaffBase)·저장 층·파일 층은 가짜고 사람·전화·계좌·금액은 지어낸 값이다

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))

const VIEWING: Viewing = { hospitalId: '00000000-0000-4000-8000-00000000b001', name: '가짜다른의원' }

function withViewing(viewing: Viewing | null) {
  return function Wrapper({ children }: { children: ReactNode }) {
    return <ViewingProvider viewing={viewing}>{children}</ViewingProvider>
  }
}

const button = (name: string | RegExp) => screen.queryByRole('button', { name })
const disabled = (el: Element) => el.matches(':disabled')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

// ── 명단 ────────────────────────────────────────────────────

describe('AC-8009.3 보는 중 직원 명단', () => {
  const TODAY = '2026-11-21'
  const blank: Omit<StaffMember, 'id' | 'name' | 'hiredOn'> = {
    job: '물리치료사',
    jobOther: null,
    employment: 'regular',
    weeklyHours: 40,
    leftOn: null,
    phone: null,
    birthday: null,
    address: null,
    bank: null,
    accountNo: null,
    calendarStaffId: null,
    memo: null,
    usedBefore: 0,
    usedBeforeFrom: null,
    carryStart: 0,
    registeredOn: '2000-01-01',
  }
  const LEE: StaffMember = {
    ...blank,
    id: 'm-lee',
    name: '이도윤',
    hiredOn: '2023-07-17',
    phone: '01000005247',
    birthday: '1996-04-12',
    address: '○○시 ○○구 ○○로 123, 4층',
    bank: '○○은행',
    accountNo: '123-456-789012',
    memo: '가상 도수치료 담당',
  }
  const MOON: StaffMember = { ...blank, id: 'm-moon', name: '문태호', hiredOn: '2018-04-02', leftOn: '2022-12-31' } // 보관 3년이 지나 지울 때가 된 퇴사자
  const DOC: StaffFile = {
    id: 'f1',
    kind: 'doc',
    staffId: 'm-lee',
    month: null,
    name: '가상 근로계약서.pdf',
    path: 'h/doc/m-lee/f1',
    size: 240_000,
    mime: 'application/pdf',
    createdAt: '2023-07-17T01:00:00Z',
  }
  const CLINIC: ClinicProfileView = {
    state: 'ready',
    profile: defaultProfile(),
    saved: true,
    signupName: '가짜의원',
    signupPhone: null,
    name: '가짜의원',
    logoDataUrl: null,
    reload: () => {},
  }
  const store = {
    listLeaves: vi.fn<StaffStore['listLeaves']>(),
    saveMember: vi.fn<StaffStore['saveMember']>(),
    purgeMember: vi.fn<StaffStore['purgeMember']>(),
    importRoster: vi.fn<StaffStore['importRoster']>(),
  }
  const files = {
    listFiles: vi.fn<StaffFileStore['listFiles']>(),
    uploadFile: vi.fn<StaffFileStore['uploadFile']>(),
    deleteFile: vi.fn<StaffFileStore['deleteFile']>(),
    downloadFile: vi.fn<StaffFileStore['downloadFile']>(),
  }

  function show(viewing: Viewing | null, members: StaffMember[] = [LEE, MOON]) {
    const base: StaffBase = {
      state: 'ready',
      members,
      settings: defaultStaffSettings(),
      plans: [],
      clinic: CLINIC,
      store: store as unknown as StaffStore,
      files: files as unknown as StaffFileStore,
      reload: vi.fn(),
    }
    vi.mocked(useStaffBase).mockReturnValue(base)
    render(<RosterScreen today={TODAY} />, { wrapper: withViewing(viewing) })
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T03:00:00Z'))
    for (const fn of [...Object.values(store), ...Object.values(files)]) fn.mockReset()
    store.listLeaves.mockResolvedValue([])
    files.listFiles.mockResolvedValue([DOC])
    files.downloadFile.mockResolvedValue(undefined)
  })

  it('AC-8009.3: 명단에 [＋ 직원 더하기]·[엑셀 올리기]가 없고 [엑셀 양식 받기]·연락처는 그대로다', async () => {
    show(VIEWING)
    const table = await screen.findByRole('table', { name: '재직 직원' })
    expect(button('＋ 직원 더하기')).toBeNull()
    expect(button('엑셀 올리기')).toBeNull()
    expect(screen.getByRole('link', { name: '엑셀 양식 받기' })).toBeTruthy()
    expect(within(table).getByText(phoneText('01000005247'))).toBeTruthy()
  })

  it('AC-8009.3: 퇴사 표에 [지우기]가 없다(지울 때가 된 사람도)', async () => {
    show(VIEWING)
    await screen.findByRole('table', { name: '재직 직원' })
    fireEvent.click(screen.getByRole('button', { name: '퇴사 1' }))
    const table = screen.getByRole('table', { name: '퇴사 직원' })
    expect(within(table).getByText('지울 때가 됐어요')).toBeTruthy()
    expect(within(table).queryByRole('button', { name: '지우기' })).toBeNull()
  })

  it('AC-8009.3: 직원 카드는 전화·생일·주소·계좌·메모와 서류 파일 목록·[받기]가 보이고 [고치기]·[파일 올리기]·파일 [지우기]가 없다', async () => {
    show(VIEWING)
    await screen.findByRole('table', { name: '재직 직원' })
    fireEvent.click(screen.getByRole('button', { name: '이도윤' }))
    const info = screen.getByRole('region', { name: '직원 정보' })
    for (const text of [phoneText('01000005247'), '1996-04-12', '○○시 ○○구 ○○로 123, 4층', '○○은행', '123-456-789012', '가상 도수치료 담당']) {
      expect(within(info).getByText(text)).toBeTruthy()
    }
    expect(await screen.findByText('가상 근로계약서.pdf')).toBeTruthy()
    expect(button('고치기')).toBeNull()
    expect(button('파일 올리기')).toBeNull()
    expect(screen.queryByLabelText('서류 파일 고르기')).toBeNull()
    expect(button('지우기')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '받기' }))
    await waitFor(() => expect(files.downloadFile).toHaveBeenCalledWith(DOC))
    for (const write of [store.saveMember, store.purgeMember, store.importRoster, files.uploadFile, files.deleteFile]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8009.3: 직원이 없는 의원이면 처음 화면에 [엑셀 올리기]·[＋ 직원 더하기]가 없고 [엑셀 양식 받기]는 그대로다', async () => {
    show(VIEWING, [])
    expect(await screen.findByText('아직 직원이 없어요')).toBeTruthy()
    expect(button('엑셀 올리기')).toBeNull()
    expect(button('＋ 직원 더하기')).toBeNull()
    expect(screen.getByRole('link', { name: '엑셀 양식 받기' })).toBeTruthy()
  })

  it('AC-8009.3: viewing={null}이면 지금처럼 [＋ 직원 더하기]·[엑셀 올리기]·카드 [고치기]·[파일 올리기]·[지우기]가 있다', async () => {
    show(null)
    await screen.findByRole('table', { name: '재직 직원' })
    expect(button('＋ 직원 더하기')).toBeTruthy()
    expect(button('엑셀 올리기')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '이도윤' }))
    await screen.findByText('가상 근로계약서.pdf')
    expect(button('고치기')).toBeTruthy()
    expect(button('파일 올리기')).toBeTruthy()
    expect(button('지우기')).toBeTruthy()
  })
})

// ── 근무표 ──────────────────────────────────────────────────

describe('AC-8009.3 보는 중 근무표', () => {
  beforeEach(resetKit)

  async function show(viewing: Viewing | null) {
    render(<ScheduleScreen today={SCHEDULE_TODAY} />, { wrapper: withViewing(viewing) })
    await screen.findByRole('table', { name: '주 근무표' })
  }

  it('AC-8009.3: 그날만 바꾸기 창은 그날 근무·더 일한 시간·메모가 보이지만 칸·단추가 모두 막히고 [저장]·[기본으로 되돌리기]가 없다', async () => {
    await show(VIEWING)
    const memo = CHANGES.find((c) => c.staffId === 'm6')!.memo!
    fireEvent.click(cell('한지우', '11월 20일 (금)'))
    const dialog = await screen.findByRole('dialog')
    const q = within(dialog)
    const memoInput = q.getByLabelText<HTMLInputElement>('메모')
    expect(memoInput.value).toBe(memo)
    expect(disabled(memoInput)).toBe(true)
    for (const select of q.getAllByRole('combobox')) expect(disabled(select)).toBe(true)
    expect(disabled(q.getByRole('button', { name: '일함' }))).toBe(true)
    expect(disabled(q.getByRole('button', { name: '연장 30분 늘리기' }))).toBe(true)
    expect(q.queryByRole('button', { name: '저장' })).toBeNull()
    expect(q.queryByRole('button', { name: '기본으로 되돌리기' })).toBeNull()
    const close = q.getByRole('button', { name: '닫기' })
    expect(disabled(close)).toBe(false)
    fireEvent.click(close)
    expect(screen.queryByRole('dialog')).toBeNull()
    for (const write of [kit.store.saveChange, kit.store.saveOvertime, kit.store.resetDay, kit.store.savePlan]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8009.3: 기본 근무는 요일마다 근무가 보이지만 칸이 막히고 [저장]이 없다. [◀ 근무표로]는 그대로다', async () => {
    await show(VIEWING)
    fireEvent.click(screen.getByRole('button', { name: '김하늘 간호조무사 · 토 1·3주' }))
    const region = screen.getByRole('region', { name: '김하늘 — 기본 근무' })
    const q = within(region)
    expect(q.getAllByRole('combobox').length).toBeGreaterThan(0)
    for (const select of q.getAllByRole('combobox')) expect(disabled(select)).toBe(true)
    expect(disabled(q.getByLabelText('바꾸기 시작하는 날'))).toBe(true)
    expect(q.queryByRole('button', { name: '저장' })).toBeNull()
    fireEvent.click(q.getByRole('button', { name: '◀ 근무표로' }))
    expect(await screen.findByRole('table', { name: '주 근무표' })).toBeTruthy()
    expect(kit.store.savePlan).not.toHaveBeenCalled()
  })

  it('AC-8009.3: viewing={null}이면 지금처럼 창에 [저장]·[기본으로 되돌리기]가 있고 메모 칸을 고칠 수 있다', async () => {
    await show(null)
    fireEvent.click(cell('한지우', '11월 20일 (금)'))
    const q = within(await screen.findByRole('dialog'))
    expect(q.getByRole('button', { name: '저장' })).toBeTruthy()
    expect(q.getByRole('button', { name: '기본으로 되돌리기' })).toBeTruthy()
    expect(disabled(q.getByLabelText('메모'))).toBe(false)
  })
})

// ── 휴가 ────────────────────────────────────────────────────

describe('AC-8009.3 보는 중 휴가', () => {
  async function show(viewing: Viewing | null) {
    const base = leaveBase()
    vi.mocked(useStaffBase).mockReturnValue(base as never)
    render(<LeaveScreen today={LEAVE_TODAY} />, { wrapper: withViewing(viewing) })
    await screen.findByRole('table', { name: '연차 현황' })
    return base
  }

  it('AC-8009.3: 연차 현황에 [휴가 넣기]·[연차 규칙]이 없고, 달력 날짜 칸·칩은 눌리지 않아 휴가 넣기 칸이 열리지 않는다', async () => {
    const base = await show(VIEWING)
    expect(button('휴가 넣기')).toBeNull()
    expect(button('연차 규칙')).toBeNull()
    const calendar = screen.getByRole('region', { name: '휴가 달력' })
    const days = within(calendar).getAllByRole('button', { name: /휴가 넣기$/ })
    expect(days.length).toBeGreaterThan(27)
    for (const day of days) expect(disabled(day)).toBe(true)
    fireEvent.click(days[10]!)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(disabled(within(calendar).getByRole('button', { name: '지난달' }))).toBe(false)
    for (const write of [base.store.addLeaveGroup, base.store.replaceLeaveGroup, base.store.deleteLeaveGroup, base.store.saveSettings]) expect(write).not.toHaveBeenCalled()
  })

  it('AC-8009.3: 한 사람 기록은 쓴 휴가·메모가 보이고 [{이름} 님 휴가 넣기]·[고치기]·[지우기]가 없다', async () => {
    await show(VIEWING)
    fireEvent.click(screen.getByRole('button', { name: '이도윤' }))
    const record = screen.getByRole('region', { name: '이도윤 휴가 기록' })
    expect(within(record).getByText('이사')).toBeTruthy()
    expect(within(record).getByText('병원 진료')).toBeTruthy()
    expect(within(record).queryByRole('button', { name: '이도윤 님 휴가 넣기' })).toBeNull()
    expect(within(record).queryByRole('button', { name: '고치기' })).toBeNull()
    expect(within(record).queryByRole('button', { name: '지우기' })).toBeNull()
    expect(within(record).getByRole('button', { name: '‹ 연차 현황' })).toBeTruthy()
  })

  it('AC-8009.3: viewing={null}이면 지금처럼 [휴가 넣기]·[연차 규칙]이 있고 날짜 칸을 누르면 휴가 넣기 칸이 열린다', async () => {
    await show(null)
    expect(button('휴가 넣기')).toBeTruthy()
    expect(button('연차 규칙')).toBeTruthy()
    const calendar = screen.getByRole('region', { name: '휴가 달력' })
    fireEvent.click(within(calendar).getAllByRole('button', { name: /휴가 넣기$/ })[10]!)
    expect(screen.getByRole('dialog', { name: '휴가 넣기' })).toBeTruthy()
  })
})

describe('AC-8009.4 보는 중 휴가 날 예약 수', () => {
  function editor(viewing: Viewing | null) {
    const store = leaveBase().store
    store.countAppts.mockResolvedValue([{ day: '2026-11-28', count: 3 }])
    render(
      <LeaveEditor
        choices={LEAVE_MEMBERS.filter((m) => m.leftOn === null)}
        leaves={LEAVE_ROWS}
        changes={[]}
        plans={LEAVE_PLANS}
        settings={defaultStaffSettings()}
        profile={clinicProfile()}
        today={LEAVE_TODAY}
        preset={{ staffId: 'm-lee', day: '2026-11-28', group: null }}
        store={store}
        onSaved={vi.fn()}
        onFailed={vi.fn()}
        onClose={vi.fn()}
      />,
      { wrapper: withViewing(viewing) },
    )
    return store
  }

  it('AC-8009.4: 보는 중이면 예약 수를 보는 의원 id와 함께 센다(countAppts가 readAdminRows로 읽게)', async () => {
    const store = editor(VIEWING)
    await waitFor(() => expect(store.countAppts).toHaveBeenCalled())
    expect(store.countAppts).toHaveBeenLastCalledWith('cal-lee', ['2026-11-28'], VIEWING.hospitalId)
  })

  it('AC-8009.4: 보는 중이 아니면 지금 부르기 모양 그대로(시행자·날 두 값)', async () => {
    const store = editor(null)
    await waitFor(() => expect(store.countAppts).toHaveBeenCalled())
    expect(store.countAppts).toHaveBeenLastCalledWith('cal-lee', ['2026-11-28'])
  })
})

// ── 급여 ────────────────────────────────────────────────────

describe('AC-8009.3 보는 중 급여', () => {
  const WRITES = ['saveMember', 'purgeMember', 'importRoster', 'savePlan', 'saveChange', 'resetDay', 'saveOvertime', 'addLeaveGroup', 'replaceLeaveGroup', 'deleteLeaveGroup', 'saveSettings', 'saveRules', 'savePayLine', 'savePayMonth'] as const

  // 읽기는 db에서, 쓰기는 모두 흉내(불리면 안 된다)
  function fakeStores(db: PayDb) {
    const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to
    const writes = Object.fromEntries(WRITES.map((name) => [name, vi.fn(async () => undefined)]))
    const store = {
      ...writes,
      listMembers: async () => db.members,
      listPlans: async () => [],
      listChanges: async () => [],
      listOvertime: async (range: DateRange) => db.overtime.filter((o) => inRange(o.day, range)),
      listLeaves: async (range: DateRange) => db.leaves.filter((l) => inRange(l.day, range)),
      countAppts: vi.fn(async () => []),
      loadSettings: async () => db.settings,
      listRules: async () => db.rules,
      listPayLines: async (from: string, to: string) => db.lines.filter((line) => line.month >= from && line.month <= to),
      listPayMonths: async (from: string, to: string) => db.months.filter((m) => m.month >= from && m.month <= to),
    } as unknown as StaffStore
    const files = {
      listFiles: vi.fn(async (kind: StaffFile['kind']) => db.files.filter((f) => f.kind === kind)),
      uploadFile: vi.fn(),
      deleteFile: vi.fn(),
      downloadFile: vi.fn(async () => undefined),
    }
    return { store, files, writes }
  }

  async function show(viewing: Viewing | null, part: string | null = null) {
    const db = payDb()
    const { store, files, writes } = fakeStores(db)
    const clinic: ClinicProfileView = { state: 'ready', profile: defaultProfile(), saved: true, signupName: HOSPITAL, signupPhone: null, name: HOSPITAL, logoDataUrl: null, reload: () => {} }
    const base: StaffBase = { state: 'ready', members: db.members, settings: db.settings, plans: [], clinic, store, files: files as unknown as StaffFileStore, reload: vi.fn() }
    const loadRevenue = async (range: DateRange) => db.revenue.filter((day) => inRange(day.date, range))
    const inRange = (day: string, range: DateRange) => day >= range.from && day <= range.to
    render(<PayView base={base} today={PAY_TODAY} initialPart={part} loadRevenue={loadRevenue} />, { wrapper: withViewing(viewing) })
    await act(async () => {})
    return { files, writes }
  }

  const noWrites = (writes: Record<string, ReturnType<typeof vi.fn>>, files: { uploadFile: ReturnType<typeof vi.fn>; deleteFile: ReturnType<typeof vi.fn> }) => {
    for (const [name, fn] of Object.entries(writes)) expect(fn, name).not.toHaveBeenCalled()
    expect(files.uploadFile).not.toHaveBeenCalled()
    expect(files.deleteFile).not.toHaveBeenCalled()
  }

  it('AC-8009.3: 이달 급여 표는 금액이 글자로만 보이고 [지난달 금액 가져오기]·[항목 고치기]가 없으며 [엑셀 받기]는 그대로다', async () => {
    const { files, writes } = await show(VIEWING)
    const table = await screen.findByRole('table', { name: '이달 급여 표' })
    expect(within(table).queryAllByRole('textbox')).toEqual([])
    expect(within(table).getAllByText('2,900,000').length).toBeGreaterThan(0)
    expect(within(table).getAllByText('3,300,000').length).toBeGreaterThan(0)
    expect(button('지난달 금액 가져오기')).toBeNull()
    expect(button('항목 고치기')).toBeNull()
    expect(button('엑셀 받기')).toBeTruthy()
    noWrites(writes, files)
  })

  it('AC-8009.3: 조정(±) 창은 열어 볼 수 있지만 금액·까닭 칸과 단추가 모두 막혀 있다', async () => {
    const { files, writes } = await show(VIEWING)
    await screen.findByRole('table', { name: '이달 급여 표' })
    fireEvent.click(screen.getByRole('button', { name: '김하늘 조정(±)' }))
    const panel = screen.getByRole('dialog', { name: '조정(±) · 김하늘 · 11월' })
    const q = within(panel)
    expect(q.queryByRole('textbox', { name: '조정 금액' })).toBeNull()
    expect(disabled(q.getByRole('textbox', { name: '까닭 글' }))).toBe(true)
    expect(disabled(q.getByRole('button', { name: '+ 더하기' }))).toBe(true)
    expect(disabled(q.getByRole('button', { name: '공제' }))).toBe(true)
    expect(disabled(q.getByRole('button', { name: '닫기' }))).toBe(false)
    noWrites(writes, files)
  })

  it('AC-8009.3: 인센티브 칸은 실적이 글자로만 보이고 [인센티브 규칙 고치기]·[규칙 더하기]가 없다', async () => {
    const { files, writes } = await show(VIEWING, 'incentive')
    const table = await screen.findByRole('table', { name: '인센티브 실적 표' })
    expect(within(table).queryAllByRole('textbox')).toEqual([])
    expect(within(table).getByText('32')).toBeTruthy()
    expect(button('인센티브 규칙 고치기')).toBeNull()
    expect(button('규칙 더하기')).toBeNull()
    noWrites(writes, files)
  })

  it('AC-8009.3: 인건비의 병원 부담분은 글자로만 보이고 [저장]이 없다', async () => {
    const { files, writes } = await show(VIEWING, 'cost')
    const label = await screen.findByText('병원 부담분 (11월)')
    expect(screen.queryByRole('textbox', { name: '병원 부담분 (11월)' })).toBeNull()
    // 병원 부담분 줄(이름 칸의 바깥 틀) 안에 저장된 금액이 글자로 있다 — 달별 표에도 같은 숫자가 있어 줄 안에서만 찾는다
    const burden = label.parentElement!.parentElement!
    expect(within(burden).getByText('2,150,000')).toBeTruthy()
    expect(button('저장')).toBeNull()
    noWrites(writes, files)
  })

  it('AC-8009.3: 세무사 파일은 목록·[받기]가 보이고 올리기 칸·[파일 올리기]·[지우기]가 없다', async () => {
    const { files, writes } = await show(VIEWING, 'files')
    expect(await screen.findByText('급여대장_11월.pdf')).toBeTruthy()
    expect(screen.queryByRole('group', { name: '세무사 파일 올리기' })).toBeNull()
    expect(button('파일 올리기')).toBeNull()
    expect(screen.queryAllByRole('button', { name: '지우기' })).toEqual([])
    fireEvent.click(screen.getAllByRole('button', { name: '받기' })[0]!)
    await waitFor(() => expect(files.downloadFile).toHaveBeenCalledTimes(1))
    noWrites(writes, files)
  })

  it('AC-8009.3: 명세서의 [인쇄·PDF]·[그림 파일]은 그대로다', async () => {
    await show(VIEWING, 'slip')
    expect(await screen.findByRole('button', { name: '인쇄·PDF' })).toBeTruthy()
    expect(button('그림 파일')).toBeTruthy()
  })

  it('AC-8009.3: viewing={null}이면 지금처럼 금액 칸·[지난달 금액 가져오기]·[항목 고치기]가 있다', async () => {
    await show(null)
    const table = await screen.findByRole('table', { name: '이달 급여 표' })
    expect(within(table).getAllByRole('textbox').length).toBeGreaterThan(0)
    expect(button('지난달 금액 가져오기')).toBeTruthy()
    expect(button('항목 고치기')).toBeTruthy()
  })
})
