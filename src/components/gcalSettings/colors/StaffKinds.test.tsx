// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ViewingProvider } from '@/components/shell/viewing'
import { defaultProfile } from '@/lib/storage/clinicProfile'
import { GcalStorageError } from '@/lib/storage/gcal'
import { DEFAULT_CAL_SETTINGS, type CalAppt, type CalKind, type CalStaff } from '@/types/calendar'
import type { ClinicProfile } from '@/types/clinicProfile'
import { DEFAULT_GCAL_LOOK } from '@/types/gcal'
import { StaffKinds, type StaffKindsDeps, type StaffKindsLink } from './StaffKinds'

// 설정 › 구글 캘린더 › 시행자·종류 (spec google-link REQ-8529 AC-8529.1·AC-8529.2, REQ-8521 AC-8521.4 · design.md 2절 표 9 · 시안 calendar.html ?s=colors).
// 글은 notes-calendar `colors` 그대로 적어 견준다(labels.ts 상수가 아니라). 시안 설정: (호) 정호연 라벤더 · (원) 박지원 바나나 · (현) 이수현 플라밍고 · (장) 원장님 블루베리,
// 충격파 세이지 고정, 도수·자보도수·주사·진료는 시행자 색 따름, 휴무 줄 포도, 취소 토마토, 변경 흑연, 시행자 글이 없는 종류 = 충격파. 데스크 김예시·정예시는 예약에 안 보임.
// 저장: 시행자 → 병원 정보(saveProfile) · 종류 → 예약 설정(saveKinds) · 취소·변경 색·글 없을 때·제목 꼴 → 구글 연결(saveLook) →
// 이은 병원이면 colorChangeTargets가 고른 예약(구글에 아직 보낼 것이 없는 것만)에 g_wait='color'(markColor) → pushWaiting(TASK-12, AC-8526.6)

afterEach(cleanup)

const person = (id: string, name: string, mark: string, color: CalStaff['color'], calendar = true): ClinicProfile['staff'][number] => ({
  id,
  name,
  mark,
  color,
  calendar,
  role: id === 'jang' ? 'doctor' : 'staff',
})

const PROFILE: ClinicProfile = {
  ...defaultProfile(),
  staff: [
    person('ho', '정호연', '호', 'lavender'),
    person('won', '박지원', '원', 'banana'),
    person('hyun', '이수현', '현', 'flamingo'),
    person('jang', '원장님', '장', 'blueberry'),
    person('kim', '김예시', '예', 'peacock', false),
    person('jung', '정예시', '시', 'basil', false),
  ],
}
const KINDS: CalKind[] = DEFAULT_CAL_SETTINGS.kinds.map((k) => ({ ...k, words: [...k.words] }))
const CAL_NAME = '2026 양지바른정형외과'
const FIRST: StaffKindsLink = { calendarId: 'c1', calendarName: CAL_NAME, linkedOn: null, look: DEFAULT_GCAL_LOOK, defaultHex: '#3366CC' }
const LINKED: StaffKindsLink = { ...FIRST, linkedOn: '2026-11-23' }
const TODAY = '2026-11-26'

const EVENT = (n: number) => `ssk${String(n).padStart(32, '0')}`
function appt(over: Partial<CalAppt> & Pick<CalAppt, 'id' | 'day'>): CalAppt {
  return {
    start: 600,
    len: 30,
    name: '홍길동',
    chart: '1234',
    staffId: 'ho',
    staffName: '정호연',
    staffMark: '호',
    kindId: 'dosu',
    kindName: '도수',
    memo: '',
    status: 'auto',
    auto: null,
    origDay: null,
    origStart: null,
    gEventId: EVENT(1),
    gUpdated: null,
    gTitle: null,
    gColor: null,
    colorFrom: 'app',
    gKeepTitle: false,
    gMoved: false,
    gGone: false,
    gWait: null,
    gWaitAt: null,
    gNote: null,
    gFrom: 'web',
    gHow: null,
    createdAt: '2026-11-20T00:00:00.123456+00:00',
    ...over,
  }
}

function fakeDeps(over: Partial<StaffKindsDeps> = {}) {
  const base = {
    saveProfile: vi.fn<StaffKindsDeps['saveProfile']>(async (p: ClinicProfile) => p),
    saveKinds: vi.fn<StaffKindsDeps['saveKinds']>(async () => undefined),
    saveLook: vi.fn<StaffKindsDeps['saveLook']>(async () => undefined),
    listAppts: vi.fn<StaffKindsDeps['listAppts']>(async () => [] as CalAppt[]),
    markColor: vi.fn<StaffKindsDeps['markColor']>(async () => undefined),
    pushWaiting: vi.fn<StaffKindsDeps['pushWaiting']>(async () => undefined),
    reread: vi.fn<StaffKindsDeps['reread']>(async () => ({ ok: true, read: 0, kindChanged: 0, changed: 0, unread: 0, missed: 0 }) as const),
  }
  return Object.assign(base, over) as typeof base
}

type DrawOptions = {
  link?: StaffKindsLink | null
  profile?: ClinicProfile | null
  staff?: CalStaff[]
  deps?: ReturnType<typeof fakeDeps>
  desk?: boolean
  band?: ReactNode
  /** 종류(없으면 기본 종류) */
  kinds?: CalKind[]
  /** 관리자 '다른 의원 보기' */
  viewing?: boolean
  now?: () => Date
}

function draw(options: DrawOptions = {}) {
  const deps = options.deps ?? fakeDeps()
  const calls = { back: vi.fn(), next: vi.fn(), saved: vi.fn() }
  const link = options.link === undefined ? FIRST : options.link
  const profile = options.profile === undefined ? PROFILE : options.profile
  const ui = (
    <StaffKinds
      profile={profile}
      settings={{ kinds: options.kinds ?? KINDS, staff: options.staff ?? [] }}
      link={link}
      deps={deps}
      band={options.band}
      today={TODAY}
      now={options.now}
      onBack={calls.back}
      onNext={calls.next}
      onSaved={calls.saved}
    />
  )
  const roled = options.desk ? <RoleProvider desk>{ui}</RoleProvider> : ui
  render(options.viewing ? <ViewingProvider viewing={{ hospitalId: 'h-view', name: '보기의원' }}>{roled}</ViewingProvider> : roled)
  return { deps, calls }
}

const page = () => document.body.textContent ?? ''
const card = (title: string) => screen.getByRole('heading', { name: title }).closest('section') as HTMLElement
const colorButton = (label: string) => screen.getByRole('button', { name: new RegExp(`^${label.replace(/[()]/g, '\\$&')} `) })
function pick(label: string, color: string) {
  fireEvent.click(colorButton(label))
  fireEvent.click(within(screen.getByRole('group', { name: '구글 색 고르기' })).getByRole('button', { name: color }))
}
const preview = () => screen.getByRole('region', { name: '구글 캘린더에서 보이는 모습' })
const previewChips = () => within(preview()).getAllByText((_, el) => el?.hasAttribute('data-chip') ?? false)
const warnings = () => [...document.querySelectorAll('[data-warn]')].map((el) => el.textContent)
const type = (el: HTMLElement, value: string) => fireEvent.change(el, { target: { value } })
const kindNames = () => screen.getAllByRole('textbox', { name: '종류 이름' }).map((el) => (el as HTMLInputElement).value)

// notes-calendar colors 미리 보기 여덟 줄(시안 값)
const PREVIEW = [
  '김예시, 박지원 off',
  '1234 홍길동 도수 30분 (호)',
  '2087 이보기 자보도수 30분 (원)',
  '5521 최시안 충격파 15분 (현) 4000타',
  '홍길순 도수 30분 (현)',
  '1102 오가짜 진료 10분 (장)',
  '6603 권샘플 도수 30분 (호)',
  '7781 노예시 자보도수 30분 (원)',
]

describe('AC-8529.1: 시행자·종류 화면 글 — notes-calendar colors 그대로', () => {
  it('AC-8529.1: 처음 잇기 띠·시행자 표(이름·표시·구글 색·구글에서는)·줄 끝 글', () => {
    draw()
    const band = screen.getByRole('button', { name: '잇기로 돌아가기' }).parentElement as HTMLElement
    expect(band.textContent).toContain('2026 양지바른정형외과를 골랐어요 · 아직 가져오지 않았어요')
    const staff = card('시행자')
    expect(within(staff).getByText('구글 제목 끝 괄호 한 글자와 일정 색으로 알아봐요')).toBeTruthy()
    expect(
      within(staff).getByText("병원 정보의 원장님·직원 가운데 '예약에 보이기'를 켠 사람이에요. 이름·표시를 여기서 고치면 병원 정보에도 같이 바뀌어요."),
    ).toBeTruthy()
    const table = within(staff).getByRole('table', { name: '시행자' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['이름', '표시', '구글 색', '구글에서는', ''])
    // 예약에 보이기를 켠 사람만, 병원 정보 차례로
    expect(within(table).getAllByRole('textbox', { name: '시행자 이름' }).map((el) => (el as HTMLInputElement).value)).toEqual(['정호연', '박지원', '이수현', '원장님'])
    expect(within(table).getAllByRole('textbox', { name: '표시 한 글자' }).map((el) => (el as HTMLInputElement).value)).toEqual(['호', '원', '현', '장'])
    for (const tail of ['제목 끝 (호) · 색 라벤더', '제목 끝 (원) · 색 바나나', '제목 끝 (현) · 색 플라밍고', '제목 끝 (장) · 색 블루베리']) {
      expect(within(table).getByText(tail)).toBeTruthy()
    }
    const sample = within(table).getByText('1234 홍길동 도수 30분 (호)')
    expect(sample.style.backgroundColor).toBe('var(--cal-lavender)')
    expect(warnings()).toEqual([])
  })

  it("AC-8529.1: 종류 표(차례·이름·제목에서 알아볼 글·기본 길이·구글 색·지우기) + [종류 더하기]", () => {
    draw()
    const kinds = card('종류')
    expect(within(kinds).getByText('위에 있을수록 예약 더하기에서 앞에 보여요')).toBeTruthy()
    expect(kinds.textContent).toContain(
      "구글 제목에서 이 글을 찾으면 그 종류로 봐요. 쉼표로 나눠 여러 개 적어요. 긴 글부터 맞춰 봐요(자보도수 → 도수). '타'는 4000타처럼 숫자 뒤에 붙은 글만 봐요. 색이 '시행자 색 따름'이면 그 시행자 색으로 칠해요.",
    )
    const table = within(kinds).getByRole('table', { name: '종류' })
    expect(within(table).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['차례', '이름', '제목에서 알아볼 글', '기본 길이', '구글 색', ''])
    expect(kindNames()).toEqual(['도수', '자보도수', '충격파', '주사', '진료'])
    expect(screen.getAllByRole('textbox', { name: '제목에서 알아볼 글' }).map((el) => (el as HTMLInputElement).value)).toEqual([
      '도수',
      '자보도수, 자보',
      '충격파, 타',
      '주사',
      '진료',
    ])
    expect(screen.getAllByRole('combobox', { name: '기본 길이' }).map((el) => (el as HTMLSelectElement).value)).toEqual(['30', '30', '15', '10', '10'])
    expect(colorButton('도수 구글 색').textContent).toBe('시행자 색 따름▼')
    expect(colorButton('충격파 구글 색').textContent).toBe('세이지▼')
    expect(within(table).getAllByRole('button', { name: '지우기' })).toHaveLength(5)
    expect(within(kinds).getByRole('button', { name: '종류 더하기' })).toBeTruthy()
    expect(within(kinds).getByText('지운 종류의 지난 예약은 그 이름 그대로 남아요')).toBeTruthy()
  })

  it('AC-8529.1: 취소·변경 색 두 줄', () => {
    draw()
    const box = card('취소·변경 색')
    expect(within(box).getByText("웹앱과 구글이 '취소'·'변경'을 서로 알아보는 색이에요")).toBeTruthy()
    expect(within(box).getByText('취소한 예약')).toBeTruthy()
    expect(within(box).getByText('구글 일정을 지우지 않고 색만 바꿔요')).toBeTruthy()
    expect(
      within(box).getByText(
        "웹앱에서 [예약 취소]하면 구글 일정 색을 이 색으로 바꾸고, [취소 되돌리기]하면 원래 색으로 돌려요. 구글에서 일정 색을 이 색으로 바꾸면 웹앱에서도 취소예요. 처음 가져올 때도 이 색 일정은 '취소'로 가져와요.",
      ),
    ).toBeTruthy()
    expect(within(box).getByText('변경한 예약')).toBeTruthy()
    expect(within(box).getByText('날짜·시작 시간을 옮긴 예약')).toBeTruthy()
    expect(
      within(box).getByText(
        "지금 구글에서 흑연(짙은 회색)으로 쓰는 '예약 변경' 표시예요. 웹앱에서 날짜·시작을 옮겨 '변경'이 되면 구글 일정 색을 이 색으로 바꿔요. 구글에서 일정 색을 이 색으로 바꾸면 웹앱에 '변경' 표시가 붙어요. 처음 가져올 때도 이 색 일정은 '변경' 표시를 붙여 가져와요.",
      ),
    ).toBeTruthy()
    expect(colorButton('취소 색').textContent).toBe('토마토▼')
    expect(colorButton('변경 색').textContent).toBe('흑연▼')
    // 색판은 11색만
    fireEvent.click(colorButton('취소 색'))
    expect(within(screen.getByRole('group', { name: '구글 색 고르기' })).getAllByRole('button')).toHaveLength(11)
  })

  it("AC-8529.1: '구글 제목에 글이 없을 때' — 종류 글·시행자 글·시행자 글이 없는 종류·휴무 줄·그 밖의 하루 종일", () => {
    draw()
    const box = card('구글 제목에 글이 없을 때')
    expect(within(box).getByText('종류 글이 없는 예약')).toBeTruthy()
    expect(within(box).getByText('예: 6230 정샘플')).toBeTruthy()
    const noKind = within(box).getByRole('combobox', { name: '종류 글이 없는 예약' }) as HTMLSelectElement
    expect([...noKind.options].map((o) => o.textContent)).toEqual(['도수로 봐요', '자보도수로 봐요', '충격파로 봐요', '주사로 봐요', '진료로 봐요', '고쳐야 함으로 두기'])
    expect(noKind.value).toBe('dosu')
    expect(within(box).getByText('먼저 일정 색이 한 종류의 고정 색이면 그 종류로 보고(예: 초록 → 충격파), 아니면 여기서 고른 종류로 봐요.')).toBeTruthy()

    expect(within(box).getByText('시행자 글이 없는 예약')).toBeTruthy()
    expect(within(box).getByText('예: 8456 윤모의 도수 30분')).toBeTruthy()
    expect((within(box).getByRole('checkbox', { name: '일정 색이 한 사람의 시행자 색이면 그 사람으로 봐요' }) as HTMLInputElement).checked).toBe(true)
    expect(
      within(box).getByText("색으로도 모르면 지난 1년 예약은 시행자 없이 가져오고, 앞으로의 예약은 '고쳐야 할 구글 예약'으로 남아요. 예: 분홍(플라밍고) 6230 정샘플 → (현) 이수현."),
    ).toBeTruthy()

    expect(within(box).getByText('시행자 글이 없는 종류')).toBeTruthy()
    expect(within(box).getByText('예: 5521 최시안 (4000타)')).toBeTruthy()
    const pills = within(box).getByRole('group', { name: '시행자 글이 없는 종류' })
    expect(within(pills).getAllByRole('button').map((b) => [b.textContent, b.getAttribute('aria-pressed')])).toEqual([
      ['도수', 'false'],
      ['자보도수', 'false'],
      ['충격파', 'true'],
      ['주사', 'false'],
      ['진료', 'false'],
    ])
    expect(
      within(box).getByText(
        '구글 제목에 시행자 글을 안 적는 게 보통인 종류예요. 일정 색으로 시행자를 짐작하지 않아요(색이 종류 색이라서). 지난 1년 예약은 시행자 없이 가져오고, 앞으로의 예약(처음 가져오기·새로 들어온 것)은 하나씩 시행자를 골라요.',
      ),
    ).toBeTruthy()

    expect(within(box).getByText('하루 종일 휴무 줄')).toBeTruthy()
    expect(within(box).getByText("지금 구글 보라 'off' 줄")).toBeTruthy()
    expect((within(box).getByRole('textbox', { name: '휴무 줄 끝 글' }) as HTMLInputElement).value).toBe('off')
    expect(colorButton('휴무 줄 색').textContent).toBe('포도▼')
    expect(box.textContent).toContain('끝 글')
    expect(box.textContent).toContain('김예시, 박지원 off → 그날 김예시·박지원 하루 종일 휴무. 이름은 원장님·직원 목록과 맞춰 봐요. 반차는 off 줄에 넣지 않아요.')

    expect(within(box).getByText('그 밖의 하루 종일 일정')).toBeTruthy()
    expect(within(box).getByText('종일 메모로 가져와요(예: 원장님 학회). 웹앱에서 넣은 종일 메모는 캘린더 기본 색으로 적어요.')).toBeTruthy()
  })

  it("AC-8529.1: '웹앱 → 구글 제목 꼴' 차례 칩·체크 둘·미리 보기 여덟 줄(색 차례: 휴무 줄 포도 · 설정 색 · 취소 토마토 · 변경 흑연)", () => {
    draw()
    const box = card('웹앱 → 구글 제목 꼴')
    expect(within(box).getByText('웹앱에서 넣거나 고친 예약을 구글에 이렇게 적어요')).toBeTruthy()
    const tokens = within(box).getByLabelText('제목 차례')
    expect([...tokens.querySelectorAll('span')].map((s) => s.textContent)).toEqual(['차트번호', '이름', '종류', '길이 30분', '(시행자)', '메모'])
    expect((within(box).getByRole('checkbox', { name: '길이를 넣어요 (30분)' }) as HTMLInputElement).checked).toBe(true)
    expect((within(box).getByRole('checkbox', { name: /^메모를 제목 끝에 붙여요/ }) as HTMLInputElement).checked).toBe(true)
    expect(within(box).getByText("끄면 구글 '설명' 칸에만 적어요")).toBeTruthy()
    expect(
      within(box).getByText("차트번호가 없으면(신환) 이름부터 적어요. 메모는 늘 구글 '설명' 칸에도 적어요. 가져온 예약의 구글 제목은 웹앱에서 그 예약을 고칠 때만 이 꼴로 다시 적어요."),
    ).toBeTruthy()
    expect(preview().textContent).toContain('구글 캘린더에서는 이렇게 보여요 (미리 보기)')
    expect(previewChips().map((c) => c.textContent)).toEqual(PREVIEW)
    expect(previewChips().map((c) => c.style.backgroundColor)).toEqual([
      'var(--cal-grape)',
      'var(--cal-lavender)',
      'var(--cal-banana)',
      'var(--cal-sage)',
      'var(--cal-flamingo)',
      'var(--cal-blueberry)',
      'var(--cal-tomato)',
      'var(--cal-graphite)',
    ])
    expect(within(preview()).getByText('↑ 취소한 예약 (토마토)')).toBeTruthy()
    expect(within(preview()).getByText('↑ 날짜·시간을 옮긴 예약 (흑연)')).toBeTruthy()
    expect(within(preview()).getByText('종일')).toBeTruthy()
  })

  it('AC-8529.1: 처음 잇기 아래 띠 글과 [← 잇기][저장하고 가져오기 미리 보기 →]', () => {
    const { calls } = draw()
    expect(
      screen.getByText(
        '저장하면 웹앱 예약 칸 색이 바로 바뀌어요. 구글에서 따로 색을 고른 일정은 웹앱에서도 그 색 그대로예요. 나중에 색을 바꾸면 그 색이던 앞으로의 예약은 구글에서도 같이 바꿔요.',
      ),
    ).toBeTruthy()
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '← 잇기' }))
    fireEvent.click(screen.getByRole('button', { name: '잇기로 돌아가기' }))
    expect(calls.back).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' })).toBeTruthy()
  })

  it('AC-8529.1: 띠의 캘린더 이름 뒤 조사는 낱말 끝에 맞춘다({캘린더}{을/를}), 종류 고르기는 {종류}{으로/로} 봐요', () => {
    draw({ link: { ...FIRST, calendarName: '병원 예약 일정' } })
    expect(page()).toContain('병원 예약 일정을 골랐어요 · 아직 가져오지 않았어요')
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[2]!, '체외충격')
    const noKind = screen.getByRole('combobox', { name: '종류 글이 없는 예약' }) as HTMLSelectElement
    expect([...noKind.options].map((o) => o.textContent)).toContain('체외충격으로 봐요')
  })

  it('AC-8529.1: 이은 뒤에는 받은 띠(맞춤 방법 띠)를 그리고 아래 단추는 [저장]만, 잇지 않은 병원은 띠 없이 [저장]만(design.md 2절 표 9)', () => {
    draw({ link: LINKED, band: <div>이어짐 띠</div> })
    expect(screen.getByText('이어짐 띠')).toBeTruthy()
    expect(screen.queryByRole('button', { name: '잇기로 돌아가기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '← 잇기' })).toBeNull()
    expect(screen.queryByRole('button', { name: '저장하고 가져오기 미리 보기 →' })).toBeNull()
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
    cleanup()
    draw({ link: null, band: <div>이어짐 띠</div> })
    expect(screen.queryByText('이어짐 띠')).toBeNull()
    expect(page()).not.toContain('골랐어요')
    expect(screen.queryByRole('button', { name: '← 잇기' })).toBeNull()
    expect(screen.getByRole('button', { name: '저장' })).toBeTruthy()
  })

  it('AC-8529.1: 그 캘린더 기본 색(default_hex)을 화면 뿌리의 --cal-default로 둔다', () => {
    draw()
    const root = screen.getByRole('table', { name: '시행자' }).closest('[data-gcal-colors]') as HTMLElement
    expect(root.style.getPropertyValue('--cal-default')).toBe('#3366CC')
  })
})

describe('AC-8529.1: 고치기 — 색판·미리 보기가 따라 바뀜', () => {
  it('AC-8529.1: 시행자 색 단추 → 색판(11색)에서 고르면 단추·줄 끝 글·구글 모양·미리 보기가 바뀌고 색판이 닫힌다', () => {
    draw()
    pick('(호) 정호연 구글 색', '공작')
    expect(screen.queryByRole('group', { name: '구글 색 고르기' })).toBeNull()
    expect(colorButton('(호) 정호연 구글 색').textContent).toBe('공작▼')
    expect(screen.getByText('제목 끝 (호) · 색 공작')).toBeTruthy()
    expect(previewChips()[1]!.style.backgroundColor).toBe('var(--cal-peacock)')
    expect(previewChips()[6]!.style.backgroundColor).toBe('var(--cal-tomato)') // 취소한 예약은 그대로 취소 색
  })

  it('AC-8529.1: 종류 색판은 시행자 색 따름 + 11색 + 캘린더 기본 색, 표시·이름을 고치면 미리 보기도 바뀐다', () => {
    draw()
    fireEvent.click(colorButton('도수 구글 색'))
    expect(within(screen.getByRole('group', { name: '구글 색 고르기' })).getAllByRole('button')).toHaveLength(13)
    fireEvent.click(within(screen.getByRole('group', { name: '구글 색 고르기' })).getByRole('button', { name: '바질' }))
    expect(previewChips()[1]!.style.backgroundColor).toBe('var(--cal-basil)')
    type(screen.getAllByRole('textbox', { name: '표시 한 글자' })[0]!, '정')
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, '도수치료')
    expect(previewChips()[1]!.textContent).toBe('1234 홍길동 도수치료 30분 (정)')
    expect(screen.getByText('제목 끝 (정) · 색 라벤더')).toBeTruthy()
  })

  it('AC-8529.1: 길이·메모 체크를 끄면 미리 보기 제목에서 빠지고 차례 칩이 흐려진다', () => {
    draw()
    fireEvent.click(screen.getByRole('checkbox', { name: '길이를 넣어요 (30분)' }))
    fireEvent.click(screen.getByRole('checkbox', { name: /^메모를 제목 끝에 붙여요/ }))
    expect(previewChips().map((c) => c.textContent)).toEqual([
      '김예시, 박지원 off',
      '1234 홍길동 도수 (호)',
      '2087 이보기 자보도수 (원)',
      '5521 최시안 충격파 (현)',
      '홍길순 도수 (현)',
      '1102 오가짜 진료 (장)',
      '6603 권샘플 도수 (호)',
      '7781 노예시 자보도수 (원)',
    ])
    const tokens = [...screen.getByLabelText('제목 차례').querySelectorAll('span')]
    expect(tokens.filter((s) => s.hasAttribute('data-off')).map((s) => s.textContent)).toEqual(['길이 30분', '메모'])
  })

  it('AC-8529.1: 취소·변경·휴무 줄 색과 휴무 줄 끝 글을 바꾸면 미리 보기가 따라 바뀐다', () => {
    draw()
    pick('취소 색', '바질')
    pick('변경 색', '귤')
    pick('휴무 줄 색', '공작')
    type(screen.getByRole('textbox', { name: '휴무 줄 끝 글' }), '휴무')
    const chips = previewChips()
    expect(chips[0]!.textContent).toBe('김예시, 박지원 휴무')
    expect(chips[0]!.style.backgroundColor).toBe('var(--cal-peacock)')
    expect(chips[6]!.style.backgroundColor).toBe('var(--cal-basil)')
    expect(chips[7]!.style.backgroundColor).toBe('var(--cal-tangerine)')
    expect(within(preview()).getByText('↑ 취소한 예약 (바질)')).toBeTruthy()
    expect(within(preview()).getByText('↑ 날짜·시간을 옮긴 예약 (귤)')).toBeTruthy()
  })

  it('AC-8529.1: 종류 ▲▼·지우기·더하기(하나는 남긴다), 시행자 글이 없는 종류 누름 단추', () => {
    draw()
    expect((screen.getByRole('button', { name: '1번째 종류 위로' }) as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('button', { name: '5번째 종류 아래로' }) as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '3번째 종류 위로' }))
    expect(kindNames()).toEqual(['도수', '충격파', '자보도수', '주사', '진료'])
    fireEvent.click(screen.getAllByRole('button', { name: '지우기' })[4]!)
    expect(kindNames()).toEqual(['도수', '충격파', '자보도수', '주사'])
    fireEvent.click(screen.getByRole('button', { name: '종류 더하기' }))
    expect(kindNames()).toEqual(['도수', '충격파', '자보도수', '주사', ''])
    expect(colorButton('종류 구글 색').textContent).toBe('시행자 색 따름▼')
    const pills = screen.getByRole('group', { name: '시행자 글이 없는 종류' })
    fireEvent.click(within(pills).getByRole('button', { name: '주사' }))
    expect(within(pills).getByRole('button', { name: '주사' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(pills).getByRole('button', { name: '충격파' }))
    expect(within(pills).getByRole('button', { name: '충격파' }).getAttribute('aria-pressed')).toBe('false')
    // 하나만 남으면 지우기가 막힌다
    for (let i = 0; i < 4; i += 1) fireEvent.click(screen.getAllByRole('button', { name: '지우기' })[0]!)
    expect(kindNames()).toHaveLength(1)
    expect((screen.getByRole('button', { name: '지우기' }) as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-8521.4: 같은 색 경고 — 그 경우에만 나오고 저장은 막지 않는다', () => {
  it('AC-8521.4: 시행자끼리 같은 색', () => {
    draw({ link: LINKED })
    pick('(원) 박지원 구글 색', '라벤더')
    expect(warnings()).toEqual(['(호) 정호연과 (원) 박지원이 같은 색(라벤더)이에요. 시행자 글이 없는 구글 예약은 색으로 누구인지 알아볼 수 없어요.'])
    expect((screen.getByRole('button', { name: '저장' }) as HTMLButtonElement).disabled).toBe(false)
  })

  it('AC-8521.4: 고정 색 종류와 시행자 색이 같음', () => {
    draw()
    pick('충격파 구글 색', '플라밍고')
    expect(warnings()).toEqual(["'충격파' 색(플라밍고)이 (현) 이수현 색과 같아요. 색만으로는 종류와 시행자를 가려낼 수 없어요."])
  })

  it('AC-8521.4: 휴무 줄 색을 시행자·종류도 씀', () => {
    draw()
    pick('휴무 줄 색', '세이지')
    expect(warnings()).toEqual(['휴무 줄 색(세이지)을 시행자·종류도 쓰고 있어요.'])
  })

  it("AC-8521.4: 취소 색을 시행자·종류·휴무 줄이 씀(조사는 '취소'로)", () => {
    draw()
    pick('취소 색', '블루베리')
    expect(warnings()).toEqual(["취소 색(블루베리)을 (장) 원장님도 쓰고 있어요. 구글에서 이 색 일정은 모두 '취소'로 알아봐요. 다른 색을 골라 주세요."])
  })

  it('AC-8521.4: 취소 색과 변경 색이 같음', () => {
    draw()
    pick('변경 색', '토마토')
    expect(warnings()).toEqual(['취소 색과 변경 색이 같아요(토마토). 구글에서 취소와 변경을 가려낼 수 없어요.'])
  })

  it('AC-8521.4: 경고가 있어도 [저장하고 가져오기 미리 보기 →]는 저장하고 다음으로 간다', async () => {
    const { deps, calls } = draw()
    pick('(원) 박지원 구글 색', '라벤더')
    expect(warnings()).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' }))
    await waitFor(() => expect(calls.next).toHaveBeenCalledTimes(1))
    expect(deps.saveProfile).toHaveBeenCalledTimes(1)
  })
})

describe('AC-8529.2: 저장', () => {
  it('AC-8529.2: 시행자 이름·표시·색은 병원 정보 원장님·직원에(예약에 안 보이는 사람·다른 칸은 그대로), 종류는 예약 설정에, 취소·변경 색·글 없을 때·제목 꼴은 구글 연결 설정에', async () => {
    const { deps, calls } = draw()
    type(screen.getAllByRole('textbox', { name: '시행자 이름' })[1]!, ' 박지은 ')
    type(screen.getAllByRole('textbox', { name: '표시 한 글자' })[1]!, '은')
    pick('(현) 이수현 구글 색', '귤')
    type(screen.getAllByRole('textbox', { name: '제목에서 알아볼 글' })[2]!, '충격파, 타,체외충격 , ')
    fireEvent.change(screen.getAllByRole('combobox', { name: '기본 길이' })[0]!, { target: { value: '40' } })
    pick('주사 구글 색', '캘린더 기본 색')
    pick('취소 색', '바질')
    fireEvent.change(screen.getByRole('combobox', { name: '종류 글이 없는 예약' }), { target: { value: 'fix' } })
    fireEvent.click(screen.getByRole('checkbox', { name: '일정 색이 한 사람의 시행자 색이면 그 사람으로 봐요' }))
    fireEvent.click(within(screen.getByRole('group', { name: '시행자 글이 없는 종류' })).getByRole('button', { name: '주사' }))
    type(screen.getByRole('textbox', { name: '휴무 줄 끝 글' }), '휴무')
    fireEvent.click(screen.getByRole('checkbox', { name: '길이를 넣어요 (30분)' }))
    fireEvent.click(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' }))
    await waitFor(() => expect(calls.next).toHaveBeenCalledTimes(1))

    expect(deps.saveProfile).toHaveBeenCalledTimes(1)
    const savedProfile = deps.saveProfile.mock.calls[0]![0]
    expect(savedProfile).toEqual({
      ...PROFILE,
      staff: [
        PROFILE.staff[0],
        { ...PROFILE.staff[1], name: '박지은', mark: '은' },
        { ...PROFILE.staff[2], color: 'tangerine' },
        PROFILE.staff[3],
        PROFILE.staff[4],
        PROFILE.staff[5],
      ],
    })
    expect(deps.saveKinds).toHaveBeenCalledWith([
      { id: 'dosu', name: '도수', len: 40, color: null, words: ['도수'] },
      { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
      { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타', '체외충격'] },
      { id: 'inj', name: '주사', len: 10, color: 'default', words: ['주사'] },
      { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
    ])
    expect(deps.saveLook).toHaveBeenCalledWith({
      ...DEFAULT_GCAL_LOOK,
      cancel: 'basil',
      noKind: 'fix',
      staffByColor: false,
      noStaffKinds: ['shock', 'inj'],
      offWord: '휴무',
      titleLen: false,
    })
    // 처음 잇기(이은 날 없음)는 바꿀 예약을 고르지 않는다 — 가져오기가 칠한다
    expect(deps.listAppts).not.toHaveBeenCalled()
    expect(deps.markColor).not.toHaveBeenCalled()
    expect(deps.pushWaiting).not.toHaveBeenCalled()
    expect(calls.saved).toHaveBeenCalledWith({
      profile: savedProfile,
      kinds: deps.saveKinds.mock.calls[0]![0],
      look: deps.saveLook.mock.calls[0]![0],
    })
  })

  it('AC-8529.2: 고치지 않은 쪽은 보내지 않는다(종류만 고치면 종류만)', async () => {
    const { deps, calls } = draw()
    fireEvent.change(screen.getAllByRole('combobox', { name: '기본 길이' })[1]!, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' }))
    await waitFor(() => expect(calls.next).toHaveBeenCalledTimes(1))
    expect(deps.saveKinds).toHaveBeenCalledTimes(1)
    expect(deps.saveProfile).not.toHaveBeenCalled()
    expect(deps.saveLook).not.toHaveBeenCalled()
  })

  it('AC-8529.2: 새 종류의 알아볼 글이 비면 자기 이름 하나, 지운 종류는 시행자 글이 없는 종류·종류 글이 없는 예약에서도 빠진다', async () => {
    const { deps, calls } = draw()
    fireEvent.click(screen.getAllByRole('button', { name: '지우기' })[0]!) // 도수(= 종류 글이 없는 예약의 종류)
    fireEvent.click(screen.getAllByRole('button', { name: '지우기' })[1]!) // 충격파(= 시행자 글이 없는 종류)
    expect((screen.getByRole('combobox', { name: '종류 글이 없는 예약' }) as HTMLSelectElement).value).toBe('jabo')
    fireEvent.click(screen.getByRole('button', { name: '종류 더하기' }))
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[3]!, ' 체외충격 ')
    fireEvent.click(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' }))
    await waitFor(() => expect(calls.next).toHaveBeenCalledTimes(1))
    const kinds = deps.saveKinds.mock.calls[0]![0]
    expect(kinds.map((k) => k.name)).toEqual(['자보도수', '주사', '진료', '체외충격'])
    expect(kinds[3]).toMatchObject({ name: '체외충격', len: 30, color: null, words: ['체외충격'] })
    expect(kinds[3]!.id).toMatch(/\S/)
    expect(deps.saveLook.mock.calls[0]![0]).toMatchObject({ noKind: 'jabo', noStaffKinds: [] })
  })

  it('AC-8529.2·AC-8526.6: 이은 병원은 저장 뒤 옛 색으로 칠해진 앞으로의 예약(오늘부터, 구글에 보낼 것이 없는 것만)에 g_wait=color를 적고 pushWaiting', async () => {
    const appts = [
      appt({ id: 'a1', day: '2026-11-27' }), // 정호연 · 설정 색 → 바뀜
      appt({ id: 'a2', day: '2026-11-25' }), // 오늘 전
      appt({ id: 'a3', day: '2026-11-28', colorFrom: 'google', gColor: 'tangerine' }), // 구글에서 고른 색
      appt({ id: 'a4', day: '2026-11-28', gWait: 'edit', gWaitAt: '2026-11-26T01:00:00.123456+00:00' }), // 보낼 것이 있음(그때 새 색으로 감)
      appt({ id: 'a5', day: '2026-11-29', staffId: 'won', staffName: '박지원', staffMark: '원' }), // 색 그대로
      appt({ id: 'a6', day: '2026-11-29', staffId: 'won', staffName: '박지원', staffMark: '원', status: 'cancel' }), // 취소 색 바뀜
      appt({ id: 'a7', day: '2026-11-30', status: 'cancel', gGone: true }), // 구글에서 지움 — 되살리지 않는다
      appt({ id: 'a8', day: '2026-11-30', gEventId: null }), // 구글 짝 없음
      appt({ id: 'a9', day: '2026-11-26', kindId: 'shock', kindName: '충격파' }), // 고정 색 종류 — 그대로
    ]
    const deps = fakeDeps({ listAppts: vi.fn(async () => appts) })
    const { calls } = draw({ link: LINKED, deps })
    pick('(호) 정호연 구글 색', '공작')
    pick('취소 색', '바질')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(deps.pushWaiting).toHaveBeenCalledTimes(1))
    expect(deps.listAppts).toHaveBeenCalledWith('2026-11-26', '2028-11-26')
    expect(deps.markColor.mock.calls.map(([id]) => id).sort()).toEqual(['a1', 'a6'])
    expect(calls.saved).toHaveBeenCalledTimes(1)
    expect(calls.next).not.toHaveBeenCalled()
    expect(await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')).toBeTruthy()
  })

  it('AC-8529.2·AC-8526.6: 색을 바꾸지 않았으면 예약을 읽지 않고, 바꿀 예약이 없으면 pushWaiting을 부르지 않는다', async () => {
    const deps = fakeDeps()
    draw({ link: LINKED, deps })
    fireEvent.click(screen.getByRole('checkbox', { name: '길이를 넣어요 (30분)' }))
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(deps.saveLook).toHaveBeenCalledTimes(1)
    expect(deps.listAppts).not.toHaveBeenCalled()
    cleanup()
    const quiet = fakeDeps()
    draw({ link: LINKED, deps: quiet })
    pick('(호) 정호연 구글 색', '공작')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(quiet.listAppts).toHaveBeenCalledTimes(1)
    expect(quiet.markColor).not.toHaveBeenCalled()
    expect(quiet.pushWaiting).not.toHaveBeenCalled()
  })

  it('AC-8529.2: pushWaiting이 실패해도 저장은 끝난 것이다(못 보낸 것은 g_wait로 남아 다시 보낸다)', async () => {
    const deps = fakeDeps({ listAppts: vi.fn(async () => [appt({ id: 'a1', day: '2026-11-27' })]), pushWaiting: vi.fn(async () => Promise.reject(new Error('reach'))) })
    const { calls } = draw({ link: LINKED, deps })
    pick('(호) 정호연 구글 색', '공작')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(deps.markColor).toHaveBeenCalledWith('a1')
    expect(calls.saved).toHaveBeenCalledTimes(1)
  })

  it('AC-8529.2: 잇지 않은 병원도 [저장]은 세 곳에 저장하고 예약은 고르지 않는다', async () => {
    const deps = fakeDeps()
    draw({ link: null, deps })
    pick('(호) 정호연 구글 색', '공작')
    pick('변경 색', '포도')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(deps.saveProfile).toHaveBeenCalledTimes(1)
    expect(deps.saveLook).toHaveBeenCalledWith({ ...DEFAULT_GCAL_LOOK, change: 'grape' })
    expect(deps.listAppts).not.toHaveBeenCalled()
  })

  it('AC-8529.2: 칸이 틀리면 보내지 않고 까닭 한 줄(종류 이름 없음·같은 종류 이름·표시 겹침)', async () => {
    const { deps } = draw({ link: LINKED })
    const save = () => screen.getByRole('button', { name: '저장' })
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, ' ')
    fireEvent.click(save())
    expect(screen.getByText('종류 이름을 적어 주세요')).toBeTruthy()
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, '주사')
    fireEvent.click(save())
    expect(screen.getByText('같은 종류 이름이 있어요')).toBeTruthy()
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, '도수')
    type(screen.getAllByRole('textbox', { name: '표시 한 글자' })[1]!, '호')
    fireEvent.click(save())
    expect(screen.getByText('예약 표시 글자가 겹쳐요')).toBeTruthy()
    type(screen.getAllByRole('textbox', { name: '표시 한 글자' })[1]!, '원')
    type(screen.getByRole('textbox', { name: '휴무 줄 끝 글' }), ' ')
    fireEvent.click(save())
    expect(screen.getByText('설정을 저장하지 못했어요. 칸을 다시 확인해 주세요.')).toBeTruthy()
    await act(async () => {})
    expect(deps.saveProfile).not.toHaveBeenCalled()
    expect(deps.saveKinds).not.toHaveBeenCalled()
    expect(deps.saveLook).not.toHaveBeenCalled()
  })

  it('AC-8529.2: 저장 실패 — invalid는 칸 확인 글, 인터넷 끊김은 연결 글, 그 밖은 다시 눌러 달라는 글(다음으로 가지 않음)', async () => {
    const invalid = fakeDeps({ saveKinds: vi.fn(async () => 'invalid' as const) })
    const first = draw({ deps: invalid })
    fireEvent.change(screen.getAllByRole('combobox', { name: '기본 길이' })[1]!, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '저장하고 가져오기 미리 보기 →' }))
    expect(await screen.findByText('설정을 저장하지 못했어요. 칸을 다시 확인해 주세요.')).toBeTruthy()
    expect(first.calls.next).not.toHaveBeenCalled()
    cleanup()
    const offline = fakeDeps({ saveLook: vi.fn(async () => Promise.reject(new GcalStorageError('offline'))) })
    draw({ link: LINKED, deps: offline })
    pick('취소 색', '바질')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('인터넷 연결이 끊겨 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.')).toBeTruthy()
    cleanup()
    const failed = fakeDeps({ saveProfile: vi.fn(async () => 'failed' as const) })
    draw({ link: LINKED, deps: failed })
    pick('취소 색', '바질')
    pick('(호) 정호연 구글 색', '공작')
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    expect(await screen.findByText('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.')).toBeTruthy()
    expect(failed.saveLook).not.toHaveBeenCalled()
  })

  it('AC-8529.2: 데스크는 보기만 — 칸·색 단추가 막히고 저장 단추가 없다', () => {
    draw({ link: LINKED, desk: true })
    for (const box of screen.getAllByRole('textbox')) expect((box as HTMLInputElement).disabled).toBe(true)
    expect((colorButton('(호) 정호연 구글 색') as HTMLButtonElement).disabled).toBe(true)
    expect((colorButton('취소 색') as HTMLButtonElement).disabled).toBe(true)
    expect((screen.getByRole('checkbox', { name: '길이를 넣어요 (30분)' }) as HTMLInputElement).disabled).toBe(true)
    expect(screen.queryByRole('button', { name: '저장' })).toBeNull()
    expect(previewChips().map((c) => c.textContent)).toEqual(PREVIEW)
  })

  it('AC-8529.2: 병원 정보가 없는 의원은 예약 설정의 옛 시행자 목록을 보여 주고(고치지 못함) 병원 정보는 저장하지 않는다', async () => {
    const staff: CalStaff[] = [
      { id: 'ga', name: '한예시', mark: '가', color: 'blueberry' },
      { id: 'na', name: '윤예시', mark: '나', color: 'basil' },
    ]
    const deps = fakeDeps()
    draw({ link: LINKED, profile: null, staff, deps })
    const names = screen.getAllByRole('textbox', { name: '시행자 이름' }) as HTMLInputElement[]
    expect(names.map((el) => [el.value, el.disabled])).toEqual([
      ['한예시', true],
      ['윤예시', true],
    ])
    expect(previewChips()[0]!.textContent).toBe('윤예시, 한예시 off')
    fireEvent.change(screen.getAllByRole('combobox', { name: '기본 길이' })[1]!, { target: { value: '20' } })
    fireEvent.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(deps.saveProfile).not.toHaveBeenCalled()
    expect(deps.saveKinds).toHaveBeenCalledTimes(1)
  })

  it('AC-8529.2: 저장하는 동안 다시 눌러도 한 번만 보낸다', async () => {
    let release: () => void = () => {}
    const deps = fakeDeps({ saveLook: vi.fn(() => new Promise<undefined>((resolve) => (release = () => resolve(undefined)))) })
    draw({ link: LINKED, deps })
    pick('취소 색', '바질')
    const save = screen.getByRole('button', { name: '저장' })
    fireEvent.click(save)
    fireEvent.click(save)
    expect(save.getAttribute('aria-busy')).toBe('true')
    await act(async () => release())
    await screen.findByText('설정을 저장했어요. 다른 PC에도 몇 초 안에 보여요.')
    expect(deps.saveLook).toHaveBeenCalledTimes(1)
  })
})

// ── 2차 고침 (spec google-link REQ-8552, design.md 21-9 · 시안 calendar.html ?s=colors-reread · notes-calendar '2차 고침 › colors-reread') ─────
// '이 병원 꼴'(design.md 21-1): 시행자 셋((호) 정호연 · (원) 박지원 · (현) 이수현), 종류 아홉(알아볼 글 = 이름, 고정 색 없음),
// noKind 'fix' · noStaffKinds [] · 색 짐작 켬. 이름·차트번호는 시안의 지어낸 값이다
const H_PROFILE: ClinicProfile = {
  ...defaultProfile(),
  staff: [person('ho', '정호연', '호', 'lavender'), person('won', '박지원', '원', 'banana'), person('hyun', '이수현', '현', 'flamingo'), person('kim', '김예시', '예', 'peacock', false)],
}
const hKind = (id: string, name: string, len: number): CalKind => ({ id, name, len, color: null, words: [name] })
const H_KINDS: CalKind[] = [
  hKind('d30ho', '도수 30분(호)', 30),
  hKind('d30won', '도수 30분(원)', 30),
  hKind('d30hyun', '도수 30분(현)', 30),
  hKind('d50ho', '도수 50분(호)', 50),
  hKind('d50won', '도수 50분(원)', 50),
  hKind('d50hyun', '도수 50분(현)', 50),
  hKind('s2000', '체외충격파 2000', 15),
  hKind('s3000', '체외충격파 3000', 15),
  hKind('s4000', '체외충격파 4000', 15),
]
const H_LOOK = { ...DEFAULT_GCAL_LOOK, noKind: 'fix', noStaffKinds: [], staffByColor: true }
const H_LINKED: StaffKindsLink = { ...LINKED, look: H_LOOK }
const drawClinic = (options: DrawOptions = {}) => draw({ link: H_LINKED, profile: H_PROFILE, kinds: H_KINDS, ...options })
const LEAD2 = '종류 이름에 길이(30분)·시행자 표시((원))·타수(3000)가 들어 있으면 제목과 가장 많이 맞는 종류를 골라요. 3천은 3000타로 봐요.'
const examples = () => screen.queryByRole('list', { name: '알아보기 보기' })
const exampleLines = () => within(examples()!).getAllByRole('listitem').map((li) => li.textContent)
const REREAD = '이미 들어온 예약 다시 알아보기'
const rereadCard = () => (screen.queryByRole('heading', { name: '이미 들어온 예약' })?.closest('section') ?? null) as HTMLElement | null
const AT_1438 = () => new Date('2026-11-26T14:38:20+09:00')
type RereadReply = Awaited<ReturnType<StaffKindsDeps['reread']>>

describe('AC-8552.1: 종류 설명 둘째 줄 — 처음 잇기·이은 뒤 모두', () => {
  it('AC-8552.1: 처음 잇기(기본 종류)·이은 뒤(이 병원 꼴)·잇지 않은 병원 모두 종류 칸 설명 아래에 둘째 줄', () => {
    draw()
    expect([...card('종류').querySelectorAll('p')].map((p) => p.textContent)).toContain(LEAD2)
    cleanup()
    drawClinic()
    expect([...card('종류').querySelectorAll('p')].map((p) => p.textContent)).toContain(LEAD2)
    cleanup()
    draw({ link: null })
    expect([...card('종류').querySelectorAll('p')].map((p) => p.textContent)).toContain(LEAD2)
  })
})

describe('AC-8552.2: 보기 상자 — 그 병원 종류 이름으로(결과 = 실제 알아보기)', () => {
  it("AC-8552.2: '이 병원 꼴' 세 줄 — 30분 도수 (원) · 길이 없는 제목은 구글 일정 길이 + 작은 글 · (3천", () => {
    drawClinic()
    const box = examples()!
    expect(card('종류').contains(box)).toBe(true)
    expect(exampleLines()).toEqual([
      '1234 홍길동 30분 도수 (원) → 도수 30분(원)',
      '1234 홍길동 도수 (호) · 구글 일정 50분 → 도수 50분(호) 제목에 길이가 없으면 구글 일정 길이로 봐요',
      '1234 홍길동(3천 → 체외충격파 3000',
    ])
    expect(within(box).getByText('도수 30분(원)').tagName).toBe('B')
    expect(within(box).getByText('제목에 길이가 없으면 구글 일정 길이로 봐요')).toBeTruthy()
  })

  it('AC-8553.3: 보기 상자 줄 앞에 목록 점이 없다(ul list-none, 시안 colors-reread)', () => {
    drawClinic()
    expect(examples()!.className).toContain('list-none')
  })

  it('AC-8552.2: 이름에 길이·표시·타수가 하나도 없는 병원(기본 종류)은 상자가 없고, 저장 전 고친 종류 이름으로 바로 만든다', () => {
    draw({ link: LINKED })
    expect(examples()).toBeNull()
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, '도수 30분(호)')
    expect(exampleLines()).toEqual(['1234 홍길동 30분 도수 (호) → 도수 30분(호)'])
    type(screen.getAllByRole('textbox', { name: '종류 이름' })[0]!, '도수')
    expect(examples()).toBeNull()
  })

  it('AC-8552.2: 데스크(보기만)도 상자는 보인다', () => {
    drawClinic({ desk: true })
    expect(exampleLines()).toHaveLength(3)
  })
})

describe("AC-8552.3: 맨 아래 '이미 들어온 예약' 칸 — 이은 뒤 원장만", () => {
  it('AC-8552.3: 제목·오른쪽 글·글·작은 글·단추(동기화 아이콘)가 저장 단추 줄 아래에 있다', () => {
    drawClinic()
    const box = rereadCard()!
    expect(within(box).getByText('원장 계정만 할 수 있어요')).toBeTruthy()
    expect(within(box).getByText('구글 제목을 지금 설정으로 다시 읽어 종류·시행자를 맞춰요. 구글 일정은 바꾸지 않아요.')).toBeTruthy()
    expect(within(box).getByText('저장한 설정으로 읽어요. 가져올 때 고르거나 [고치기]로 바꾼 종류·시행자는 그대로 둬요.')).toBeTruthy()
    const button = within(box).getByRole('button', { name: REREAD })
    expect(button.textContent).toBe(REREAD)
    expect(button.querySelector('svg[aria-hidden="true"]')).toBeTruthy()
    const save = screen.getByRole('button', { name: '저장' })
    expect(save.compareDocumentPosition(box) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(box.contains(save)).toBe(false)
  })

  it("AC-8552.3: 데스크·관리자 '다른 의원 보기'·처음 잇기·잇지 않은 병원에는 이 칸이 없다", () => {
    const cases: DrawOptions[] = [{ desk: true }, { viewing: true }, { link: { ...FIRST, look: H_LOOK } }, { link: null }]
    for (const options of cases) {
      drawClinic(options)
      expect(rereadCard()).toBeNull()
      expect(screen.queryByRole('button', { name: REREAD })).toBeNull()
      expect(page()).not.toContain('이미 들어온 예약')
      cleanup()
    }
  })
})

describe('AC-8552.4: [이미 들어온 예약 다시 알아보기]', () => {
  it('AC-8552.4: 누르면 deps.reread() 한 번 · 도는 동안 `다시 알아보는 중…`(못 누름) · 끝나면 결과 줄(세 자리 쉼표 + 끝난 시각) + 작은 글', async () => {
    let finish: (r: RereadReply) => void = () => {}
    const deps = fakeDeps({ reread: vi.fn(() => new Promise<RereadReply>((resolve) => (finish = resolve))) })
    drawClinic({ deps, now: AT_1438 })
    fireEvent.click(screen.getByRole('button', { name: REREAD }))
    const busy = within(rereadCard()!).getByRole('button', { name: '다시 알아보는 중…' }) as HTMLButtonElement
    expect(busy.disabled).toBe(true)
    fireEvent.click(busy)
    expect(deps.reread).toHaveBeenCalledTimes(1)
    expect(within(rereadCard()!).queryByRole('status')).toBeNull()
    await act(async () => finish({ ok: true, read: 4358, kindChanged: 1962, changed: 2040, unread: 31, missed: 0 }))
    const done = within(rereadCard()!).getByRole('status')
    expect(done.textContent).toBe('예약 4,358개를 다시 알아봤어요 · 종류가 바뀐 것 1,962개 · 못 알아본 것 31개 (14:38)')
    expect(within(done).getByText('(14:38)')).toBeTruthy()
    expect(within(rereadCard()!).getByText('못 알아본 예약은 전 종류·시행자 그대로 두었어요.')).toBeTruthy()
    expect((within(rereadCard()!).getByRole('button', { name: REREAD }) as HTMLButtonElement).disabled).toBe(false)
    // 다시 알아보기는 deps.reread 하나만 부른다(설정 저장·구글 보내기 없음)
    expect(deps.saveLook).not.toHaveBeenCalled()
    expect(deps.pushWaiting).not.toHaveBeenCalled()
    // 결과 줄은 그 화면에만 — 떠났다 오면 없다
    cleanup()
    drawClinic({ deps, now: AT_1438 })
    expect(within(rereadCard()!).queryByRole('status')).toBeNull()
    expect(page()).not.toContain('다시 알아봤어요')
  })

  it('AC-8552.4: 실패하면 저장 실패 글을 빌린다(던져도 같음), 인터넷이 끊겼으면 연결 글 — 결과 줄·작은 글은 없다', async () => {
    const failed = fakeDeps({ reread: vi.fn(async (): Promise<RereadReply> => ({ ok: false, why: 'failed' })) })
    drawClinic({ deps: failed, now: AT_1438 })
    fireEvent.click(screen.getByRole('button', { name: REREAD }))
    expect((await screen.findByRole('alert')).textContent).toBe('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect(page()).not.toContain('다시 알아봤어요')
    expect(page()).not.toContain('못 알아본 예약은 전 종류·시행자 그대로 두었어요.')
    cleanup()
    const thrown = fakeDeps({ reread: vi.fn(async (): Promise<RereadReply> => Promise.reject(new Error('x'))) })
    drawClinic({ deps: thrown })
    fireEvent.click(screen.getByRole('button', { name: REREAD }))
    expect((await screen.findByRole('alert')).textContent).toBe('저장하지 못했어요. 잠시 뒤 다시 눌러 주세요.')
    expect((screen.getByRole('button', { name: REREAD }) as HTMLButtonElement).disabled).toBe(false)
    cleanup()
    const online = vi.spyOn(window.navigator, 'onLine', 'get').mockReturnValue(false)
    try {
      const offline = fakeDeps({ reread: vi.fn(async (): Promise<RereadReply> => ({ ok: false, why: 'failed' })) })
      drawClinic({ deps: offline })
      fireEvent.click(screen.getByRole('button', { name: REREAD }))
      expect((await screen.findByRole('alert')).textContent).toBe('인터넷 연결이 끊겨 저장하지 못했어요. 연결을 확인하고 다시 눌러 주세요.')
    } finally {
      online.mockRestore()
    }
  })
})

describe("AC-8552.5: '이 병원 꼴' 조사 · 제목 꼴 미리 보기 겹쳐 적지 않기", () => {
  it("AC-8552.5: '종류 글이 없는 예약' 고르기 글 조사(`도수 30분(호)로 봐요`·`체외충격파 2000으로 봐요`)", () => {
    drawClinic()
    const noKind = screen.getByRole('combobox', { name: '종류 글이 없는 예약' }) as HTMLSelectElement
    const options = [...noKind.options].map((o) => o.textContent)
    expect(options).toContain('도수 30분(호)로 봐요')
    expect(options).toContain('체외충격파 2000으로 봐요')
    expect(noKind.value).toBe('fix')
  })

  it('AC-8552.5: 미리 보기 줄은 종류 이름의 길이·표시를 겹쳐 적지 않는다(`도수 30분(호)`·(호)·30분 → `1234 홍길동 도수 30분 (호)`)', () => {
    drawClinic()
    const chips = previewChips().map((c) => c.textContent ?? '')
    expect(chips[1]).toBe('1234 홍길동 도수 30분 (호)')
    for (const chip of chips.slice(1)) {
      expect(chip).not.toMatch(/\(.\) \(.\)/) // 표시 두 번
      expect(chip).not.toMatch(/(\d+)분\S* \1분/) // 길이 두 번
    }
  })
})
