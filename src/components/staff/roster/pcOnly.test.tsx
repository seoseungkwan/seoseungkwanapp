// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClinicProfileView } from '@/components/clinic/useClinicProfile'
import { useStaffBase, type StaffBase } from '@/components/staff/useStaffBase'
import { readRoster, ROSTER_HEADERS, type RosterRead } from '@/lib/staff/rosterExcel'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { defaultStaffSettings, type StaffStore } from '@/lib/storage/staff'
import type { StaffFileStore } from '@/lib/storage/staffFiles'
import type { StaffFile, StaffMember } from '@/types/staff'
import { RosterScreen } from './RosterScreen'

// 명단 화면은 폰 전용 모양이 없다 (staff AC-7611.4, design.md 6절 '폰 모양 없음'). 폰에서도 PC 화면 그대로이고 넓은 표만 그 칸이 옆으로 밀린다.
// ① 이 폴더 소스(시험 파일 밖)에 폭 경계 접두와 ds 단추 묶음 틀(폰에서 칸 나눔)이 없다
// ② 명단·퇴사 목록·카드·더하기 칸·엑셀 미리 보기·처음 안내·지우기 창을 그려 모든 요소 class에 폭 경계 접두 + 모양 클래스가 없다(ds 손가락 크기는 괜찮다)
// 사람·번호는 지어낸 것이다

vi.mock('@/components/staff/useStaffBase', () => ({ useStaffBase: vi.fn() }))
vi.mock('@/lib/staff/rosterExcel', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/staff/rosterExcel')>()
  return { ...real, readRoster: vi.fn() }
})

const TODAY = '2026-11-21'
const DIR = join(process.cwd(), 'src', 'components', 'staff', 'roster')
// 폭 경계 접두: sm: md: lg: xl: 2xl: max-sm: max-md: max-lg: max-xl: min-[…]: max-[…]:
const BREAKPOINT_IN_SOURCE = /(?<![\w-])(?:2xl|xl|lg|md|sm|max-(?:sm|md|lg|xl)|min-\[[^\]\s]*\]|max-\[[^\]\s]*\]):/
const BREAKPOINT = /^(?:2xl|xl|lg|md|sm|max-(?:sm|md|lg|xl)|min-\[.*\]|max-\[.*\])$/
// 폭에 따라 칸 나눔·쌓임·폭이 바뀌는 모양 클래스
const SHAPE = /^(?:grid|grid-cols-.+|flex|flex-col|flex-row|block|hidden|w-full|col-span-.+)$/

/** 그린 화면에서 폭 경계 접두 + 모양 클래스를 모은다(ds 손가락 크기 max-md:h-11 같은 것은 모양이 아니라 통과) */
function phoneShapes(): string[] {
  const found: string[] = []
  for (const el of document.body.querySelectorAll('[class]')) {
    for (const token of (el.getAttribute('class') ?? '').split(/\s+/)) {
      const parts = token.split(':')
      if (parts.length < 2) continue
      const base = parts[parts.length - 1]!.replace(/^!/, '')
      if (parts.slice(0, -1).some((v) => BREAKPOINT.test(v)) && SHAPE.test(base)) found.push(`<${el.tagName.toLowerCase()}> ${token}`)
    }
  }
  return found
}

function person(over: Partial<StaffMember> & Pick<StaffMember, 'id' | 'name' | 'hiredOn'>): StaffMember {
  return {
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
    ...over,
  }
}
const LEE = person({
  id: 'm-lee',
  name: '이도윤',
  hiredOn: '2023-07-17',
  phone: '01000005247',
  birthday: '1996-11-23',
  address: '○○시 ○○구 ○○로 1',
  bank: '○○은행',
  accountNo: '123-456-789012',
  calendarStaffId: 'c-lee',
  memo: '도수치료 담당',
})
const OLD = person({ id: 'm-old', name: '문태호', job: '원무', hiredOn: '2018-04-02', leftOn: '2022-12-31' })
const DOCS: StaffFile[] = [
  { id: 'f1', kind: 'doc', staffId: 'm-lee', month: null, name: '근로계약서.pdf', path: 'h/doc/m-lee/f1', size: 240_000, mime: 'application/pdf', createdAt: '2023-07-17T01:00:00Z' },
]
const CLINIC: ClinicProfileView = {
  state: 'ready',
  profile: { ...defaultProfile(), staff: [{ id: 'c-lee', name: '이도윤', role: 'staff', mark: '이', color: 'basil', calendar: true }] },
  saved: true,
  signupName: '가짜의원',
  signupPhone: null,
  name: '가짜의원',
  logoDataUrl: null,
  reload: () => {},
}
const PLANS = [
  {
    id: 'p-lee',
    staffId: 'm-lee',
    from: '2023-07-17',
    week: [...Array(5).fill({ start: 540, end: 1080, lunchFrom: 780, lunchTo: 840 }), { start: 540, end: 780, lunchFrom: null, lunchTo: null }, null],
    sat: '2-4' as const,
  },
]
const STORE = { listLeaves: vi.fn(async () => []), saveMember: vi.fn(), purgeMember: vi.fn(), importRoster: vi.fn() } as unknown as StaffStore
const FILES = { listFiles: vi.fn(async () => DOCS), uploadFile: vi.fn(), deleteFile: vi.fn(), downloadFile: vi.fn() } as unknown as StaffFileStore

function show(over: Partial<StaffBase> = {}) {
  const base: StaffBase = {
    state: 'ready',
    members: [OLD, LEE],
    settings: defaultStaffSettings(),
    plans: PLANS,
    clinic: CLINIC,
    store: STORE,
    files: FILES,
    reload: vi.fn(),
    ...over,
  }
  vi.mocked(useStaffBase).mockReturnValue(base)
  const user = userEvent.setup({ applyAccept: false })
  render(<RosterScreen today={TODAY} />)
  return user
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T03:00:00Z'))
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('AC-7611.4: 명단 화면은 폰 전용 모양이 없다', () => {
  it('AC-7611.4: 명단 폴더 소스(시험 밖)에 폭 경계 접두와 ds 단추 묶음 틀(ds.segment.group)이 없다', () => {
    const files = readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
    expect(files.length).toBeGreaterThan(5)
    for (const name of files) {
      const text = readFileSync(join(DIR, name), 'utf8')
      expect(BREAKPOINT_IN_SOURCE.exec(text)?.[0] ?? null, name).toBeNull()
      expect(text.includes('segment.group'), name).toBe(false)
    }
  })

  it('AC-7611.4: 재직·퇴사 목록, 직원 카드, 고치기 칸, 지우기 창에 폭 경계 + 모양 클래스가 없다', async () => {
    const user = show()
    await screen.findByRole('table', { name: '재직 직원' })
    expect(phoneShapes()).toEqual([])
    // 재직·퇴사 고르기는 PC 모양 단추 묶음이다
    expect(screen.getByRole('group', { name: '재직·퇴사' })).toBeTruthy()

    await user.click(screen.getByRole('button', { name: '퇴사 1' }))
    await screen.findByRole('table', { name: '퇴사 직원' })
    expect(phoneShapes()).toEqual([])
    await user.click(screen.getByRole('button', { name: '지우기' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(phoneShapes()).toEqual([])
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '취소' }))

    await user.click(screen.getByRole('button', { name: '재직 1' }))
    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    await screen.findByText('근로계약서.pdf')
    expect(phoneShapes()).toEqual([])

    await user.click(screen.getByRole('button', { name: '고치기' }))
    await user.click(within(screen.getByRole('group', { name: '직종' })).getByRole('button', { name: '기타' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByLabelText('은행 이름')).toBeTruthy()
    expect(phoneShapes()).toEqual([])
  })

  it('AC-7611.4: 직원 더하기 칸·엑셀 미리 보기·처음 안내에 폭 경계 + 모양 클래스가 없다', async () => {
    const raw = Object.fromEntries(ROSTER_HEADERS.map((h) => [h, ''])) as Record<(typeof ROSTER_HEADERS)[number], string>
    const read: RosterRead = {
      problem: null,
      rows: [
        { line: 2, action: 'new', reason: null, changed: [], member: { name: '강다은', job: '간호사', employment: 'regular', weeklyHours: 40, hiredOn: '2026-03-02', usedBefore: 0 }, plan: null, raw },
        { line: 3, action: 'update', reason: null, changed: ['연락처'], member: { id: 'm-lee', name: '이도윤', hiredOn: '2023-07-17', phone: '01000005248' }, plan: null, raw },
        { line: 4, action: 'problem', reason: '이름을 적어 주세요.', changed: [], member: {}, plan: null, raw },
      ],
    }
    vi.mocked(readRoster).mockReturnValue(read)
    const user = show()
    await user.click(await screen.findByRole('button', { name: '엑셀 올리기' }))
    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), new File([new Uint8Array([80, 75, 3, 4])], '직원명단.xlsx'))
    await screen.findByRole('dialog', { name: '엑셀 올리기 — 미리 보기' })
    expect(phoneShapes()).toEqual([])
    await user.click(screen.getByRole('button', { name: '취소' }))

    await user.click(screen.getByRole('button', { name: '＋ 직원 더하기' }))
    await screen.findByRole('heading', { name: '직원 더하기' })
    expect(phoneShapes()).toEqual([])

    cleanup()
    show({ members: [] })
    await screen.findByText('아직 직원이 없어요')
    expect(phoneShapes()).toEqual([])
  })

  it("AC-7611.4·AC-7612.8: 다음 해로 넘김 병원의 '넘어온 연차' 칸(더하기·고치기)과 미리 보기 칸에도 폭 경계 + 모양 클래스가 없다", async () => {
    const raw = Object.fromEntries(ROSTER_HEADERS.map((h) => [h, ''])) as Record<(typeof ROSTER_HEADERS)[number], string>
    const read: RosterRead = {
      problem: null,
      rows: [
        { line: 2, action: 'new', reason: null, changed: [], member: { name: '강다은', job: '간호사', employment: 'regular', weeklyHours: 40, hiredOn: '2026-03-02', usedBefore: 0, carryStart: 2.5 }, plan: null, raw },
        { line: 3, action: 'update', reason: null, changed: ['넘어온 연차'], member: { id: 'm-lee', name: '이도윤', hiredOn: '2023-07-17', carryStart: -1 }, plan: null, raw },
        { line: 4, action: 'problem', reason: '이름을 적어 주세요.', changed: [], member: {}, plan: null, raw: { ...raw, '넘어온 연차(일)': '두 일' } },
      ],
    }
    vi.mocked(readRoster).mockReturnValue(read)
    const user = show({ settings: { ...defaultStaffSettings(), leftover: 'carry' }, members: [OLD, { ...LEE, carryStart: 3 }] })
    await user.click(await screen.findByRole('button', { name: '엑셀 올리기' }))
    await user.upload(screen.getByLabelText('엑셀 파일 고르기'), new File([new Uint8Array([80, 75, 3, 4])], '직원명단.xlsx'))
    const dialog = await screen.findByRole('dialog', { name: '엑셀 올리기 — 미리 보기' })
    expect(within(dialog).getByRole('columnheader', { name: '넘어온 연차' })).toBeTruthy()
    expect(phoneShapes()).toEqual([])
    await user.click(screen.getByRole('button', { name: '취소' }))

    await user.click(screen.getByRole('button', { name: '＋ 직원 더하기' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect(screen.getByLabelText('넘어온 연차')).toBeTruthy()
    expect(phoneShapes()).toEqual([])
    await user.click(screen.getByRole('button', { name: '취소' }))

    await user.click(within(await screen.findByRole('table', { name: '재직 직원' })).getByText('이도윤'))
    await user.click(screen.getByRole('button', { name: '고치기' }))
    expect((screen.getByLabelText('넘어온 연차') as HTMLInputElement).value).toBe('3')
    expect(phoneShapes()).toEqual([])
  })
})
