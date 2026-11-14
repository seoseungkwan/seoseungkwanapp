// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createRef, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { groupKey } from '@/components/stats/treatmentView'
import type { StatsRxGroupsView } from '@/components/stats/useStatsRxGroups'
import { rangeOf, statsRange, type StatsInput, type StatsPeriod } from '@/components/stats/view'
import { ds } from '@/components/ui/classes'
import { readDays } from '@/lib/storage/stats'
import { nestedBoxes } from '@/testing/boxes'
import type { DateRange } from '@/types/dates'
import type { DayPayload } from '@/types/payload'
import type { RxGroup } from '@/types/rxGroups'
import { Section, StatsCard } from './parts'
import { RxSection } from './RxSection'
import { TreatmentTrendSection } from './TreatmentTrendSection'

// 처방별 추세 칸 잇기 (spec treatment-trend TASK-13, REQ-1201·1207·1208·1209·1210·1211·1213, 시안 docs/mockups/treatment-trend renderView()·startEdit()·save()).
// 묶음 값(StatsRxGroupsView)은 이 파일이 만든 가짜다(훅을 부르지 않는다). 찾기 목록은 진짜 useRxCatalog이고 넓은 읽기(readDays)만 가짜다.
// 묶음·처방 이름·코드·숫자는 모두 이 파일에서 지어낸 값이다

vi.mock('@/lib/storage/stats', () => ({
  readDays: vi.fn(),
  readCoverage: vi.fn(),
  readMonths: vi.fn(),
  saveStats: vi.fn(),
}))

const TODAY = '2026-11-13'
const WHOLE: DateRange[] = [{ from: '2024-12-01', to: '2026-11-12' }]
const NOW = '2026-11-02' // 최근 30일·90일·12개월 안
const BEFORE = '2026-09-21' // 지난 30일 안, 최근 90일·12개월 안
const SPRING = '2026-03-10' // 최근 12개월에만 든다

const TITLE = '처방별 추세'
// 고치기 제목은 칸 이름 대신 탭 이름을 쓴다(stats-pc-ux AC-4003.6). 따로 그릴 때의 h2 TITLE은 그대로다(design.md 표)
const EDIT_TITLE = '묶음별 추세 · 묶음 고치기'
const DESC = '만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건' // group-exclude AC-3708.7(treatment-trend AC-1201.1 설명 글자를 대신한다)
const NOT_SAVED = '자료 없음 · 불러오면 묶음마다 건수와 신환·재진이 보여요.'
const NO_RANGE = '자료 없음 · 불러온 숫자에 이 기간 자료가 없어요.'
const READING = '묶음을 읽는 중이에요'
// 고치기 화면 안내 글(group-exclude AC-3711.1이 treatment-trend AC-1210.2의 글자를 대신한다)
const INTRO =
  '묶음 이름을 짓고, 넣을 처방을 고르세요. 처방 하나는 한 묶음에만 들어가요. 넣는 처방마다 [조건 더하기]로 같이 받으면 안 세는 처방을 정할 수 있어요. 빼는 처방을 고르면, 그날 그 처방을 하나라도 받은 환자는 이 묶음에서 빠져요. 여기서 바꿔도 매출 탭 묶음은 그대로예요.'
const ALL_STALE_HEAD = '한 번 다시 불러오면 숫자가 나와요'
const ALL_STALE_TEXT = '묶음별 숫자는 다시 불러온 기간부터 세요. 비트 PC에서 다시 불러오거나, 파일을 다시 넣어 주세요.'
const SOME_STALE_HEAD = '다시 불러와야 맞는 묶음이 있어요'
// group-exclude AC-3708.6의 네 글(treatment-trend AC-1207.8의 세 글을 대신한다)
const NOTES = [
  '건 = 날마다 그 묶음 처방을 받은 환자 수를 더한 값이에요. 같은 날 같은 환자는 묶음 안 처방을 여러 개 받아도 1건이에요.',
  '빼는 처방이 있는 묶음은, 그날 빼는 처방을 하나라도 받은 환자를 그날 건수에서 빼요. * 표시 처방은 조건이 있어서, 조건 처방과 같은 날 받으면 그 처방으로는 세지 않아요.',
  '총환자 대비 = 묶음 건수 ÷ 총환자 · 신환율 = 신환 ÷ 건수 · 재진율 = 재진 ÷ 건수. 막대 안 회색 눈금은 비교 기간 건수예요.',
  '어느 묶음에도 넣지 않은 처방(진찰료, 먹는 약 등)은 여기 나오지 않아요. 줄을 누르면 날짜별 그래프와 추세선이 열려요.',
]
const SAVED = '저장했어요.'
const SAVED_AT_ONCE = '저장했어요. 이름과 순서만 바뀌어서 바로 반영했어요.'
const MORE = '처방 목록을 더 읽는 중이에요'
const WIDE_FAILED = '전체 처방 목록을 읽지 못해 지금 보는 기간의 처방만 보여요.'
const STALE = '다시 불러오면 보여요'

const group = (name: string, codes: string[], sortOrder: number, id: string | null = `g${sortOrder}`): RxGroup => ({ id, name, codes, sortOrder })
const SHOCK = group('충격파', ['ESWT1', 'ESWT7'], 0)
const MANUAL = group('도수치료', ['도수'], 1)
const CARM = group('C-arm', ['CARM1'], 2) // CARM1은 어느 날 처방 줄에도 없다
const FROZEN = group('냉동치료', [], 3)
const GROUPS = [SHOCK, MANUAL, CARM, FROZEN]
const KEY = { shock: groupKey(SHOCK.codes), manual: groupKey(MANUAL.codes), carm: groupKey(CARM.codes) }

type Line = DayPayload['groups'][number]
type Rx = DayPayload['rx'][number]
const line = (id: string, patients: number, newPatients = 0, returning = patients - newPatients): Line => ({ id, patients, newPatients, returning })
const rx = (code: string, name: string, patients: number): Rx => ({ code, name, type: '', patients, newPatients: 0, returning: patients })
function day(ymd: string, groups: Line[], rxLines: Rx[] = []): DayPayload {
  return {
    schemaVersion: 2,
    quality: 'valid',
    day: ymd,
    partial: false,
    totals: { patients: 10, newPatients: 2, returning: 8, unknown: 0 },
    rx: rxLines,
    groups: [...groups].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)),
    revisit: { cohort: 0, within7: null, within14: null, within30: null, after30: null },
  }
}

const RX_NOW = [rx('ESWT1', '체외충격파 1단계', 80), rx('ESWT7', '체외충격파 7단계', 40), rx('도수', '도수치료 20분', 40), rx('AA154', '재진 진찰료', 200)]
// 세 묶음 모두 두 기간을 지금 열쇠로 셌다
const ALL_READY = [
  day(BEFORE, [line(KEY.shock, 50, 5), line(KEY.manual, 10, 1), line(KEY.carm, 4, 1)], [rx('ESWT1', '체외충격파 1단계', 50), rx('도수', '도수치료 20분', 10)]),
  day(NOW, [line(KEY.shock, 120, 30), line(KEY.manual, 40, 8), line(KEY.carm, 6, 2)], RX_NOW),
]
// 처음 쓸 때: 저장된 날에 묶음 줄이 하나도 없다
const FIRST_USE = [day(BEFORE, []), day(NOW, [], RX_NOW)]
// 충격파만 지금 열쇠로 셌다
const PARTLY = [day(BEFORE, [line(KEY.shock, 50, 5)]), day(NOW, [line(KEY.shock, 120, 30)], RX_NOW)]
// 비교 기간을 충격파 열쇠로 세지 않았다(도수치료·C-arm은 셌다)
const UNCOMPARED = [day(BEFORE, [line(KEY.manual, 10, 1), line(KEY.carm, 4, 1)]), day(NOW, [line(KEY.shock, 120, 30), line(KEY.manual, 40, 8), line(KEY.carm, 6, 2)], RX_NOW)]

const inputOf = (days: readonly DayPayload[] = ALL_READY, period: StatsPeriod = '30d', covered: DateRange[] = WHOLE): StatsInput => ({ days, covered, range: statsRange(TODAY, period) })

function viewOf(over: Partial<StatsRxGroupsView> = {}): StatsRxGroupsView {
  return {
    state: 'ready',
    groups: GROUPS,
    suggested: false,
    saving: false,
    saveFailed: false,
    reread: vi.fn(),
    save: vi.fn(async () => true),
    forLoad: vi.fn(async () => []),
    ...over,
  }
}

// 묶음 훅처럼 저장을 흉내 낸다: 성공하면 돌려받은 줄(새 묶음은 id가 생김)이 묶음이 된다. 실패하면 saveFailed
let saves: RxGroup[][]
function Live({ input, start = GROUPS, ok = true }: { input: StatsInput; start?: RxGroup[]; ok?: boolean }) {
  const [groups, setGroups] = useState<readonly RxGroup[]>(start)
  const [saveFailed, setSaveFailed] = useState(false)
  const save = async (after: readonly RxGroup[]) => {
    saves.push(after.map((g) => ({ ...g, codes: [...g.codes] })))
    setSaveFailed(!ok)
    if (ok) setGroups(after.map((g, i) => ({ ...g, id: g.id ?? `saved${i}` })))
    return ok
  }
  return <TreatmentTrendSection input={input} saved groups={viewOf({ groups, saveFailed, save })} revision={0} />
}

const drawView = (view: StatsRxGroupsView = viewOf(), input: StatsInput = inputOf(), saved = true) =>
  render(<TreatmentTrendSection input={input} saved={saved} groups={view} revision={0} />)

type Read = Awaited<ReturnType<typeof readDays>>
const read = (rows: DayPayload[] = []): Read => ({ rows, dropped: 0, latest: null, fromFile: false })

const heading = () => screen.getByRole('heading', { level: 2 })
const sectionEl = () => heading().closest('section')!
const editButton = () => screen.getByRole('button', { name: '묶음 고치기' })
const queryEdit = () => screen.queryByRole('button', { name: '묶음 고치기' })
const rowOf = (name: string) => screen.getByRole('button', { name: new RegExp(`^${name}`) })
const queryRow = (name: string) => screen.queryByRole('button', { name: new RegExp(`^${name}`) })
const notice = () => screen.queryByRole('note')
const nameFields = () => screen.getAllByRole('textbox', { name: '묶음 이름' }) as HTMLInputElement[]
const groupAt = (index: number) => nameFields()[index]!.closest('li')!
const classOf = (element: Element) => (element.getAttribute('class') ?? '').split(/\s+/).filter(Boolean)
const hasAll = (element: Element, classes: string) => expect(classOf(element)).toEqual(expect.arrayContaining(classes.split(/\s+/).filter(Boolean)))
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
const list = () => sectionEl().querySelector('ul')

beforeEach(() => {
  saves = []
  vi.mocked(readDays).mockReset().mockResolvedValue(read())
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(cleanup)

describe('AC-1201.3: 저장된 숫자가 없음', () => {
  it('AC-1201.3: 안내 한 줄만 있고 [묶음 고치기]·줄·안내가 없다', () => {
    drawView(viewOf(), inputOf(FIRST_USE), false)
    expect(heading().textContent).toBe(TITLE)
    expect(sectionEl().textContent).toBe(`${TITLE}${NOT_SAVED}`)
    expect(queryEdit()).toBeNull()
    expect(list()).toBeNull()
    expect(notice()).toBeNull()
  })

  it('AC-1201.3: 묶음을 읽는 중이어도 같은 한 줄이다', () => {
    drawView(viewOf({ state: 'reading', groups: [] }), inputOf(FIRST_USE), false)
    expect(sectionEl().textContent).toBe(`${TITLE}${NOT_SAVED}`)
  })
})

describe('AC-1201.4: 고른 기간에 일 줄이 없음', () => {
  it('AC-1201.4: 줄·안내 상자 대신 `불러온 숫자에 이 기간 자료가 없어요.`이고 0건으로 그리지 않는다', () => {
    drawView(viewOf(), inputOf([day(BEFORE, [])]))
    expect(screen.getByText('자료 없음').parentElement!.textContent).toBe(NO_RANGE)
    expect(list()).toBeNull()
    expect(notice()).toBeNull()
    expect(screen.queryByText(/0건/)).toBeNull()
    for (const note of NOTES) expect(screen.queryByText(note)).toBeNull()
  })

  it('AC-1201.4·AC-4003.6: [묶음 고치기]는 누를 수 있다', async () => {
    const user = userEvent.setup()
    drawView(viewOf(), inputOf([day(BEFORE, [])]))
    expect(editButton().hasAttribute('aria-disabled')).toBe(false)
    await user.click(editButton())
    expect(heading().textContent).toBe(EDIT_TITLE)
  })
})

describe('AC-1201.5: 시안에서만 쓰는 것', () => {
  it('AC-1201.5: 바뀐 칸 칩·시안 줄과 두 모습 단추·처방 추세 견주기·정하신 내용·제가 정한 부분·예시가 어느 모습에도 없다', async () => {
    const user = userEvent.setup()
    drawView(viewOf(), inputOf(PARTLY))
    await user.click(rowOf('충격파'))
    const words = ['바뀐 칸', '시안에서만 보이는 줄', '숫자가 있는 모습', '처음 쓸 때 모습', "지금 화면의 '처방 추세'와 견주기", '정하신 내용', '제가 정한 부분', '예시']
    for (const word of words) expect(document.body.textContent, word).not.toContain(word)
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    for (const word of words) expect(document.body.textContent, word).not.toContain(word)
  })
})

describe('AC-1210.1: 칸 머리와 [묶음 고치기]', () => {
  it('AC-1210.1: h2 `처방별 추세`, 옆 설명, 같은 머리 줄 오른쪽에 [묶음 고치기]가 있다', () => {
    drawView()
    expect(heading().textContent).toBe(TITLE)
    const head = heading().parentElement!
    expect(within(head).getByText(DESC)).toBeTruthy()
    expect(head.contains(editButton())).toBe(true)
    expect(follows(heading(), editButton())).toBe(true)
  })

  it('AC-1210.1: 보조 작은 단추이고 휴대폰은 폭 전체·44px이다(감싸는 머리 칸도 휴대폰 폭 전체)', () => {
    drawView()
    hasAll(editButton(), `${ds.button.secondarySmall} max-md:w-full`)
    expect(classOf(editButton())).toContain('max-md:h-11')
    // 머리 줄의 오른쪽 칸(Section의 action 칸)을 휴대폰에서 폭 전체로 편다
    expect(editButton().parentElement!.classList.contains('ml-auto')).toBe(true)
    expect(classOf(sectionEl())).toContain('max-md:[&>div>.ml-auto]:w-full')
  })

  it('AC-1210.1: 받은 className(칸 자리)을 섹션에 그대로 둔다', () => {
    render(<TreatmentTrendSection input={inputOf()} saved groups={viewOf()} revision={0} className="col-span-12" />)
    expect(classOf(sectionEl())).toContain('col-span-12')
  })

  it.each(['reading', 'read-failed'] as const)('AC-1210.1: 묶음 %s 동안은 막혀 있고(aria-disabled) 누르면 아무 일 없다', async (state) => {
    const user = userEvent.setup()
    drawView(viewOf({ state, groups: [] }))
    expect(editButton().getAttribute('aria-disabled')).toBe('true')
    await user.click(editButton())
    expect(heading().textContent).toBe(TITLE)
    expect(screen.queryByText(INTRO)).toBeNull()
  })

  it('AC-1210.1: 묶음을 읽었으면(ready) 막히지 않았다', () => {
    drawView()
    expect(editButton().hasAttribute('aria-disabled')).toBe(false)
  })
})

describe('AC-1211.1·AC-1211.2: 묶음 읽기 상태', () => {
  it('AC-1211.1: 읽는 동안 `묶음을 읽는 중이에요`(시계 아이콘, role=status)가 있고 줄이 없다', () => {
    drawView(viewOf({ state: 'reading', groups: [] }))
    const status = screen.getByRole('status')
    expect(status.textContent).toBe(READING)
    expect(status.querySelector('svg')).not.toBeNull()
    expect(list()).toBeNull()
    expect(notice()).toBeNull()
    for (const note of NOTES) expect(screen.queryByText(note)).toBeNull()
  })

  it('AC-1211.2: 읽기 실패면 오류 카드(E-STATS-GROUP-READ-FAILED)와 [다시 읽기]가 있고 줄이 없다. 누르면 다시 읽는다', async () => {
    const user = userEvent.setup()
    const view = viewOf({ state: 'read-failed', groups: [] })
    drawView(view)
    const card = screen.getByRole('alert')
    expect(within(card).getByText('처방별 추세 묶음을 읽지 못했어요')).toBeTruthy()
    expect(card.textContent).toContain('오류 번호 E-STATS-GROUP-READ-FAILED')
    expect(list()).toBeNull()
    expect(notice()).toBeNull()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(view.reread).toHaveBeenCalledTimes(1)
  })

  it('AC-1211.1·AC-1201.4: 읽는 중이면 기간 자료가 없어도 읽는 중 글이 먼저다', () => {
    drawView(viewOf({ state: 'reading', groups: [] }), inputOf([day(BEFORE, [])]))
    expect(screen.getByRole('status').textContent).toBe(READING)
    expect(screen.queryByText('자료 없음')).toBeNull()
  })
})

describe('AC-1211.3: 서버에서 읽은 묶음을 그린다', () => {
  it('AC-1211.3: 받은 묶음이 그대로(sortOrder 차례, 이름·코드 줄) 그려진다', () => {
    drawView(viewOf({ groups: [CARM, FROZEN, SHOCK, MANUAL] }))
    const names = within(list()!)
      .getAllByRole('listitem')
      .map((item) => item.querySelector('.font-semibold')!.textContent)
    expect(names).toEqual(['충격파', '도수치료', 'C-arm', '냉동치료'])
    expect(within(rowOf('충격파')).getByText('ESWT1 · ESWT7')).toBeTruthy()
  })

  it('AC-1211.3: 줄을 열고 고쳐 저장해도 브라우저 저장소에 아무것도 넣지 않는다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(rowOf('충격파'))
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '체외충격파' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(SAVED_AT_ONCE)
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })
})

describe('AC-1208.1~AC-1208.4: 다시 불러오기 안내', () => {
  it('AC-1208.1: 처방 든 묶음이 모두 다시 불러와야 하면(처음 쓸 때) 줄 위에 경고 바탕 안내가 있다', () => {
    drawView(viewOf(), inputOf(FIRST_USE))
    const box = notice()!
    expect(box.textContent).toBe(`${ALL_STALE_HEAD}${ALL_STALE_TEXT}`)
    hasAll(box, 'bg-warning-soft text-small')
    const head = within(box).getByText(ALL_STALE_HEAD)
    hasAll(head, 'font-semibold text-warning')
    expect(follows(box, list()!)).toBe(true)
    expect(screen.getAllByText(STALE)).toHaveLength(3)
  })

  it('AC-1208.2: 일부 묶음만 다시 불러와야 하면 그 이름을 줄 차례로 `, `로 잇는다', () => {
    drawView(viewOf({ groups: [CARM, SHOCK, FROZEN, MANUAL] }), inputOf(PARTLY))
    const box = notice()!
    expect(within(box).getByText(SOME_STALE_HEAD)).toBeTruthy()
    expect(box.textContent).toBe(
      `${SOME_STALE_HEAD}도수치료, C-arm 묶음은 이 기간을 다시 불러와야 숫자가 나와요. 비트 PC에서 다시 불러오거나, 파일을 다시 넣어 주세요.`,
    )
  })

  it('AC-1208.3: 다시 불러와야 하는 묶음이 없으면 안내 상자가 없다', () => {
    drawView()
    expect(notice()).toBeNull()
  })

  it('AC-1208.4: 비교 기간을 그 열쇠로 세지 않은 묶음은 줄 아래에 이름을 알린다(small muted)', () => {
    drawView(viewOf(), inputOf(UNCOMPARED))
    const note = screen.getByText('충격파 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.')
    hasAll(note, 'text-small text-muted')
    expect(follows(list()!, note)).toBe(true)
  })

  it('AC-1208.4: 여럿이면 줄 차례로 `, `로 잇는다', () => {
    drawView(viewOf(), inputOf([day(BEFORE, [line(KEY.carm, 4, 1)]), ...UNCOMPARED.slice(1)]))
    expect(screen.getByText('충격파, 도수치료 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.')).toBeTruthy()
  })

  it('AC-1208.4: 모두 견주면 이 글이 없다', () => {
    drawView()
    expect(screen.queryByText(/비교 기간을 다시 불러오면 지난 기간과 견줘요/)).toBeNull()
  })
})

describe('AC-1207.8: 줄 아래 안내', () => {
  const notesIn = () => Array.from(sectionEl().querySelectorAll('p')).map((p) => p.textContent)

  it('AC-1207.8: 줄 목록 아래에 세 안내 글이 이 차례로 있다', () => {
    drawView()
    const shown = NOTES.map((text) => screen.getByText(text))
    expect(follows(list()!, shown[0]!)).toBe(true)
    expect(follows(shown[0]!, shown[1]!)).toBe(true)
    expect(follows(shown[1]!, shown[2]!)).toBe(true)
  })

  it('AC-1207.8: 처음 쓸 때(줄이 모두 다시 불러와야 함)도 세 안내 글이 있다', () => {
    drawView(viewOf(), inputOf(FIRST_USE))
    for (const text of NOTES) expect(screen.getByText(text)).toBeTruthy()
  })

  it('AC-1207.8: 견준 짝이 빠졌으면(30일, 비교 기간의 마지막 8일만 덮임) 세 글 위에 처방 추세와 같은 글이 있다', () => {
    drawView(viewOf(), inputOf(ALL_READY, '30d', [{ from: '2026-10-06', to: '2026-11-12' }]))
    const compared = screen.getByText('증감과 막대는 두 기간 모두 자료가 있는 8일만 견줘요. 건수는 기간 전체예요.')
    hasAll(compared, 'text-small text-muted')
    expect(follows(list()!, compared)).toBe(true)
    expect(follows(compared, screen.getByText(NOTES[0]!))).toBe(true)
  })

  it('AC-1207.8: 12개월은 끝난 달 수다(이번 달만 덜 끝남 → 11달)', () => {
    drawView(viewOf(), inputOf(ALL_READY, '12m'))
    expect(screen.getByText('증감과 막대는 끝난 11달만 견줘요. 건수는 기간 전체예요.')).toBeTruthy()
  })

  it('AC-1207.8: 두 기간이 온전히 덮였으면 그 글이 없다', () => {
    drawView()
    expect(notesIn().some((text) => text?.startsWith('증감과 막대는'))).toBe(false)
  })

  it('AC-1207.8: 견주는 준비된 줄이 없으면(모두 비교하지 않음) 그 글이 없다', () => {
    const days = [day('2026-10-10', []), UNCOMPARED[1]!]
    drawView(viewOf(), inputOf(days, '30d', [{ from: '2026-10-06', to: '2026-11-12' }]))
    expect(notesIn().some((text) => text?.startsWith('증감과 막대는'))).toBe(false)
    expect(screen.getByText('충격파, 도수치료, C-arm 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.')).toBeTruthy()
  })
})

describe('AC-1209.1·AC-1209.5: 줄 열기', () => {
  it('AC-1209.1: 준비된 줄을 누르면 그 아래 칸이 열리고 여러 줄을 같이 열 수 있다. 다시 누르면 닫힌다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(rowOf('충격파'))
    await user.click(rowOf('도수치료'))
    expect(rowOf('충격파').getAttribute('aria-expanded')).toBe('true')
    expect(rowOf('도수치료').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('충격파 · 일별 건수')).toBeTruthy()
    expect(screen.getByText('도수치료 · 일별 건수')).toBeTruthy()
    await user.click(rowOf('충격파'))
    expect(rowOf('충격파').getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText('충격파 · 일별 건수')).toBeNull()
    expect(screen.getByText('도수치료 · 일별 건수')).toBeTruthy()
  })

  it('AC-1209.1: 열린 칸은 줄 바로 아래이고 [숫자로 보기]가 있다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(rowOf('충격파'))
    const panel = document.getElementById(rowOf('충격파').getAttribute('aria-controls')!)!
    expect(panel.hidden).toBe(false)
    expect(within(panel).getByText('충격파 · 일별 건수')).toBeTruthy()
    expect(within(panel).getByRole('button', { name: '숫자로 보기' })).toBeTruthy()
  })

  it('AC-1209.5: 기간을 바꾸면 열린 채 새 기간으로 다시 그리고, 다시 불러와야 하는 기간에는 닫힌 것으로 보이다가 돌아오면 열린 채다', async () => {
    const user = userEvent.setup()
    const days = [...ALL_READY, day(SPRING, [])]
    const view = viewOf()
    const { rerender } = drawView(view, inputOf(days, '30d'))
    await user.click(rowOf('충격파'))
    expect(screen.getByText('충격파 · 일별 건수')).toBeTruthy()

    rerender(<TreatmentTrendSection input={inputOf(days, '90d')} saved groups={view} revision={0} />)
    expect(rowOf('충격파').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('충격파 · 주별 건수')).toBeTruthy()

    rerender(<TreatmentTrendSection input={inputOf(days, '12m')} saved groups={view} revision={0} />)
    expect(queryRow('충격파')).toBeNull()
    expect(screen.getByText('충격파').closest('li')!.textContent).toContain(STALE)
    expect(screen.queryByText(/충격파 · .별 건수/)).toBeNull()

    rerender(<TreatmentTrendSection input={inputOf(days, '30d')} saved groups={view} revision={0} />)
    expect(rowOf('충격파').getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('충격파 · 일별 건수')).toBeTruthy()
  })
})

// ── group-exclude 보기 화면 (REQ-3708 AC-3708.6·3708.7, REQ-3709 AC-3709.7, REQ-3712 AC-3712.2·3712.3) ─────────────────
describe('AC-3708.7: 칸 머리 설명', () => {
  it('AC-3708.7: h2 옆 설명이 `만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건`이다', () => {
    drawView()
    expect(within(heading().parentElement!).getByText('만들어 둔 묶음마다 건수와 총환자 대비 · 같은 날 같은 환자는 1건')).toBeTruthy()
    expect(screen.queryByText('만들어 둔 묶음마다 건수와 신환·재진 · 같은 날 같은 환자는 1건')).toBeNull()
  })
})

describe('AC-3708.6: 칸 아래 안내 네 글', () => {
  it('AC-3708.6: 줄 목록 아래에 네 글이 이 차례로 있고(small muted), 비교하지 않는 묶음 글은 그 위에 있다', () => {
    drawView(viewOf(), inputOf(UNCOMPARED))
    const shown = NOTES.map((text) => screen.getByText(text))
    expect(follows(list()!, shown[0]!)).toBe(true)
    for (let i = 1; i < shown.length; i++) expect(follows(shown[i - 1]!, shown[i]!), NOTES[i]).toBe(true)
    for (const note of shown) hasAll(note, 'text-small text-muted')
    expect(follows(screen.getByText('충격파 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.'), shown[0]!)).toBe(true)
  })

  it('AC-3708.6: 뺀 짝 글도 네 글 위에 있다', () => {
    drawView(viewOf(), inputOf(ALL_READY, '30d', [{ from: '2026-10-06', to: '2026-11-12' }]))
    expect(follows(screen.getByText('증감과 막대는 두 기간 모두 자료가 있는 8일만 견줘요. 건수는 기간 전체예요.'), screen.getByText(NOTES[0]!))).toBe(true)
  })
})

describe('AC-3709.7·AC-3712.2·AC-3712.3: 줄마다 그래프 모양', () => {
  const panelOf = (name: string) => document.getElementById(rowOf(name).getAttribute('aria-controls')!)!
  const modeOf = (name: string, button: '건수' | '총환자 대비 %') => within(panelOf(name)).getByRole('button', { name: button })

  it('AC-3709.7·AC-3712.2: 한 줄에서 [총환자 대비 %]를 고르면 그 줄을 닫았다 열어도, 기간을 바꿔도 그대로이고 다른 줄은 [건수]다', async () => {
    const user = userEvent.setup()
    const view = viewOf()
    const { rerender } = drawView(view)
    await user.click(rowOf('충격파'))
    expect(modeOf('충격파', '건수').getAttribute('aria-pressed')).toBe('true')
    await user.click(modeOf('충격파', '총환자 대비 %'))
    expect(screen.getByText('충격파 · 일별 총환자 대비')).toBeTruthy()

    await user.click(rowOf('충격파'))
    expect(screen.queryByText('충격파 · 일별 총환자 대비')).toBeNull()
    await user.click(rowOf('충격파'))
    expect(modeOf('충격파', '총환자 대비 %').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('충격파 · 일별 총환자 대비')).toBeTruthy()

    await user.click(rowOf('도수치료'))
    expect(modeOf('도수치료', '건수').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('도수치료 · 일별 건수')).toBeTruthy()

    rerender(<TreatmentTrendSection input={inputOf(ALL_READY, '90d')} saved groups={view} revision={0} />)
    expect(screen.getByText('충격파 · 주별 총환자 대비')).toBeTruthy()
    expect(screen.getByText('도수치료 · 주별 건수')).toBeTruthy()

    await user.click(modeOf('충격파', '건수'))
    expect(screen.getByText('충격파 · 주별 건수')).toBeTruthy()
  })

  it('AC-3709.7: 화면을 새로 열면 모두 [건수]다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(rowOf('충격파'))
    await user.click(modeOf('충격파', '총환자 대비 %'))
    cleanup()
    drawView()
    await user.click(rowOf('충격파'))
    expect(modeOf('충격파', '건수').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('충격파 · 일별 건수')).toBeTruthy()
  })

  it('AC-3712.3: 줄을 열고 모양을 바꿔도 브라우저 저장소·쿠키에 아무것도 넣지 않는다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(rowOf('충격파'))
    await user.click(modeOf('충격파', '총환자 대비 %'))
    await user.click(rowOf('도수치료'))
    await user.click(modeOf('도수치료', '총환자 대비 %'))
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
    expect(document.cookie).toBe('')
  })
})

describe('AC-1210.2: 묶음 고치기 열기', () => {
  it('AC-1210.2·AC-4003.6: 제목이 `묶음별 추세 · 묶음 고치기`가 되고(옆 설명·단추 없음) 초점이 그 제목으로 간다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(editButton())
    expect(heading().textContent).toBe(EDIT_TITLE)
    expect(heading().parentElement!.textContent).toBe(EDIT_TITLE)
    expect(queryEdit()).toBeNull()
    expect(document.activeElement).toBe(heading())
    expect(heading().tabIndex).toBe(-1)
  })

  it('AC-1210.2: 안내 글과 묶음 목록이 나오고 줄·안내 상자·그래프·아래 안내는 없다', async () => {
    const user = userEvent.setup()
    drawView(viewOf(), inputOf(PARTLY))
    await user.click(rowOf('충격파'))
    await user.click(editButton())
    expect(screen.getByText(INTRO)).toBeTruthy()
    expect(nameFields().map((field) => field.value)).toEqual(['충격파', '도수치료', 'C-arm', '냉동치료'])
    expect(document.querySelector('[aria-expanded]')).toBeNull()
    expect(notice()).toBeNull()
    expect(screen.queryByText('충격파 · 일별 건수')).toBeNull()
    for (const note of NOTES) expect(screen.queryByText(note)).toBeNull()
  })

  it('AC-1210.2: 묶음 안 처방은 이 기간 건수(최근 30일)와 찾기 목록의 이름으로 나온다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(editButton())
    expect(within(groupAt(0)).getByText('체외충격파 1단계')).toBeTruthy()
    expect(within(groupAt(0)).getByText('최근 30일 80건')).toBeTruthy()
    expect(within(groupAt(2)).getByText('CARM1')).toBeTruthy()
  })

  it('AC-1210.2: 고치는 내용은 [저장] 전까지 이 화면에만 있다 — 받은 묶음 값을 바꾸지 않고 저장을 부르지 않는다', async () => {
    const user = userEvent.setup()
    const view = viewOf()
    drawView(view)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '바꾼 이름' } })
    await user.click(within(groupAt(1)).getByRole('button', { name: '지우기' })) // AC-3711.3: [빼기] → [지우기]
    expect(view.groups).toEqual(GROUPS)
    expect(GROUPS[0]!.name).toBe('충격파')
    expect(GROUPS[1]!.codes).toEqual(['도수'])
    expect(view.save).not.toHaveBeenCalled()
  })
})

describe('AC-1210.8: 찾기 목록 읽기', () => {
  const wide = statsRange(TODAY, '12m')
  const foundList = () => screen.getByRole('list', { name: '찾은 처방' })

  it('AC-1210.8: 넓은 범위는 처음 목록을 열 때 한 번 읽는다(그리기·고치기 열기만으로는 읽지 않는다)', async () => {
    const user = userEvent.setup()
    drawView()
    expect(readDays).not.toHaveBeenCalled()
    await user.click(editButton())
    expect(readDays).not.toHaveBeenCalled()
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    expect(readDays).toHaveBeenCalledTimes(1)
    expect(readDays).toHaveBeenCalledWith({ from: wide.previous.from, to: wide.current.to })
    await user.click(screen.getByRole('button', { name: '닫기' }))
    await user.click(within(groupAt(1)).getByRole('button', { name: '+ 처방 넣기' }))
    expect(readDays).toHaveBeenCalledTimes(1)
  })

  it('AC-1210.8: 목록은 넓은 범위 처방 + 화면 일 숫자 처방 + 이미 묶음에 든 처방이다', async () => {
    const user = userEvent.setup()
    vi.mocked(readDays).mockResolvedValue(read([day('2025-06-02', [], [rx('WIDE1', '넓은 범위 처방', 3)])]))
    drawView()
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    const found = await waitFor(() => {
      const box = foundList()
      within(box).getByText('넓은 범위 처방')
      return box
    })
    expect(within(found).getByText('재진 진찰료')).toBeTruthy() // 화면 일 숫자
    expect(within(found).getByText('CARM1')).toBeTruthy() // 어느 날에도 없고 C-arm 묶음에만 있다
    expect(within(found).getByText('C-arm에 있어요. 고르면 이 묶음으로 옮겨요')).toBeTruthy()
    expect(within(within(found).getByText('체외충격파 1단계').closest('button')!).getByText('이 묶음에 있음')).toBeTruthy()
  })

  it('AC-1210.8: 읽는 중이면 `처방 목록을 더 읽는 중이에요`다', async () => {
    const user = userEvent.setup()
    vi.mocked(readDays).mockReturnValue(new Promise(() => {}))
    drawView()
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    expect(screen.getByText(MORE)).toBeTruthy()
  })

  it('AC-1210.8: 실패하면 안내 글과 [다시 읽기]가 있고 누르면 다시 읽는다', async () => {
    const user = userEvent.setup()
    vi.mocked(readDays).mockRejectedValueOnce(new Error('가짜 실패'))
    drawView()
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    expect(await screen.findByText(WIDE_FAILED)).toBeTruthy()
    await user.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(readDays).toHaveBeenCalledTimes(2)
    await waitFor(() => expect(screen.queryByText(WIDE_FAILED)).toBeNull())
  })
})

describe('AC-1210.12: 저장하고 돌아오기', () => {
  it('AC-1210.12: 이름만 바꿔 저장하면 앞뒤 빈칸을 뗀 이름·지금 차례로 한 번 저장하고, 보는 화면으로 돌아와 저장된 묶음을 그린다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '  체외충격파  ' } })
    await user.click(screen.getByRole('button', { name: '도수치료 위로' }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(SAVED_AT_ONCE)
    expect(saves).toEqual([
      [
        { id: 'g1', name: '도수치료', codes: ['도수'], sortOrder: 0 },
        { id: 'g0', name: '체외충격파', codes: ['ESWT1', 'ESWT7'], sortOrder: 1 },
        { id: 'g2', name: 'C-arm', codes: ['CARM1'], sortOrder: 2 },
        { id: 'g3', name: '냉동치료', codes: [], sortOrder: 3 },
      ],
    ])
    expect(heading().textContent).toBe(TITLE)
    // 열쇠가 그대로라 바로 숫자가 보인다
    expect(rowOf('체외충격파')).toBeTruthy()
    expect(follows(rowOf('도수치료'), rowOf('체외충격파'))).toBe(true)
  })

  it('AC-1210.12: 머리 아래에 `저장했어요…`(role=status, 긍정 색)가 있고 초점은 [묶음 고치기]에 간다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '체외충격파' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    const note = await screen.findByText(SAVED_AT_ONCE)
    expect(note.getAttribute('role')).toBe('status')
    expect(classOf(note)).toContain('text-positive')
    expect(heading().parentElement!.nextElementSibling).toBe(note)
    await waitFor(() => expect(document.activeElement).toBe(editButton()))
  })

  it('AC-1210.12: 처방을 바꿔 저장하면 글은 `저장했어요.`이고 그 묶음은 다시 불러올 때까지 숫자가 없다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    const eswt7 = within(groupAt(0)).getByText('체외충격파 7단계').closest('li')!
    await user.click(within(eswt7).getByRole('button', { name: '지우기' })) // AC-3711.3: [빼기] → [지우기]
    await user.click(screen.getByRole('button', { name: '저장' }))
    const note = await screen.findByText(SAVED)
    expect(note.textContent).toBe(SAVED)
    expect(saves[0]![0]!.codes).toEqual(['ESWT1'])
    expect(queryRow('충격파')).toBeNull()
    expect(screen.getByText('충격파').closest('li')!.textContent).toContain(STALE)
    expect(within(notice()!).getByText(SOME_STALE_HEAD)).toBeTruthy()
  })

  it('AC-1210.12: 처방이 든 새 묶음을 더해 저장하면 `저장했어요.`다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    await user.click(screen.getByRole('button', { name: '+ 묶음 더하기' }))
    fireEvent.change(nameFields()[4]!, { target: { value: '진찰' } })
    await user.click(within(groupAt(4)).getByRole('button', { name: '+ 처방 넣기' }))
    await user.click(await screen.findByRole('button', { name: /^재진 진찰료/ }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect((await screen.findByText(SAVED)).textContent).toBe(SAVED)
    expect(saves[0]![4]).toEqual({ id: null, name: '진찰', codes: ['AA154'], sortOrder: 4 })
  })

  it('AC-1210.12: 저장 글은 기간을 바꿔도 있고, 다음에 [묶음 고치기]를 누르면 없어진다(그만두어도 다시 나오지 않는다)', async () => {
    const user = userEvent.setup()
    const { rerender } = render(<Live input={inputOf()} />)
    await user.click(editButton())
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText(SAVED_AT_ONCE)
    rerender(<Live input={inputOf(ALL_READY, '90d')} />)
    expect(screen.getByText(SAVED_AT_ONCE)).toBeTruthy()
    await user.click(editButton())
    expect(screen.queryByText(SAVED_AT_ONCE)).toBeNull()
    await user.click(screen.getByRole('button', { name: '그만두기' }))
    expect(heading().textContent).toBe(TITLE)
    expect(screen.queryByText(SAVED_AT_ONCE)).toBeNull()
    expect(screen.queryByText(SAVED)).toBeNull()
  })
})

describe('AC-1210.13: 저장 실패', () => {
  it('AC-1210.13·AC-4003.6: 고치는 화면이 그대로이고 오류 카드가 있으며 고치던 내용이 남는다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} ok={false} />)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '체외충격파' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    const card = await screen.findByText('처방별 추세 묶음을 저장하지 못했어요')
    expect(card.closest('[role="alert"]')!.textContent).toContain('오류 번호 E-STATS-GROUP-SAVE-FAILED')
    expect(heading().textContent).toBe(EDIT_TITLE)
    expect(nameFields()[0]!.value).toBe('체외충격파')
    expect(screen.queryByText(SAVED)).toBeNull()
    expect(screen.queryByText(SAVED_AT_ONCE)).toBeNull()
    expect(saves).toHaveLength(1)
  })

  it('AC-1210.13: 그만두고 다시 열면 지난 실패의 오류 카드가 없다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} ok={false} />)
    await user.click(editButton())
    await user.click(screen.getByRole('button', { name: '저장' }))
    await screen.findByText('처방별 추세 묶음을 저장하지 못했어요')
    await user.click(screen.getByRole('button', { name: '그만두기' }))
    await user.click(editButton())
    expect(screen.queryByText('처방별 추세 묶음을 저장하지 못했어요')).toBeNull()
  })
})

describe('AC-1210.14: 그만두기', () => {
  it('AC-1210.14: 고친 것을 버리고 보는 화면으로 돌아가며 초점은 [묶음 고치기]에 간다. 저장을 부르지 않는다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '바꾼 이름' } })
    await user.click(screen.getByRole('button', { name: '그만두기' }))
    expect(heading().textContent).toBe(TITLE)
    expect(rowOf('충격파')).toBeTruthy()
    expect(screen.queryByText('바꾼 이름')).toBeNull()
    expect(saves).toHaveLength(0)
    await waitFor(() => expect(document.activeElement).toBe(editButton()))
    await user.click(editButton())
    expect(nameFields()[0]!.value).toBe('충격파')
  })
})

// 매출 묶음 저장(lib/storage/rxGroups)은 지웠다(stats-revenue AC-4110.4) → 그 가짜와 '부르지 않는다' 확인은 뺐다
describe('AC-1210.15: 통계 묶음 저장만 부른다', () => {
  it('AC-1210.15·AC-4110.4·AC-4111.1: 저장하면 받은 통계 묶음 저장만 한 번 부른다', async () => {
    const user = userEvent.setup()
    const view = viewOf()
    drawView(view)
    await user.click(editButton())
    fireEvent.change(nameFields()[0]!, { target: { value: '체외충격파' } })
    await user.click(screen.getByRole('button', { name: '저장' }))
    await waitFor(() => expect(heading().textContent).toBe(TITLE))
    expect(view.save).toHaveBeenCalledTimes(1)
  })
})

// ── 고치기 찾기 목록 줄·저장 (group-exclude TASK-14, AC-3712.2·AC-3711.13) ─────────────────
describe('AC-3712.2·AC-3711.13: 고치기 화면의 빼는 처방·조건', () => {
  // XRAY9·TENS3은 어느 날 처방 줄에도 없다
  const PT = { ...group('기본 PT', ['도수'], 1, 'g9'), out: ['XRAY9'], cond: [{ code: '도수', unless: ['TENS3'] }] }
  const foundList = () => screen.getByRole('list', { name: '찾은 처방' })

  it('AC-3712.2: 그 기간 일 숫자에 없는 빼는 처방·조건 처방도 찾기 목록에 줄이 있다', async () => {
    const user = userEvent.setup()
    drawView(viewOf({ groups: [SHOCK, PT] }))
    await user.click(editButton())
    await user.click(within(groupAt(1)).getByRole('button', { name: '+ 빼는 처방 고르기' }))
    const outRow = within(foundList()).getByRole('button', { name: /^XRAY9/ }) as HTMLButtonElement
    expect(outRow.textContent).toContain('빼는 처방에 있음')
    expect(outRow.disabled).toBe(true)
    expect(within(foundList()).getByRole('button', { name: /^TENS3/ }).textContent).toContain('0건')
    // 조건 처방 찾기 칸에서도 같다
    const box = screen.getByText(/^조건 · 도수은\(는\)/).parentElement!
    await user.click(within(box).getByRole('button', { name: '+ 처방 고르기' }))
    expect(within(foundList()).getByRole('button', { name: /^TENS3/ }).textContent).toContain('조건에 있음')
    expect(within(foundList()).getByRole('button', { name: /^XRAY9/ })).toBeTruthy()
  })

  it('AC-3711.13: 빼는 처방을 더해 저장하면 out이 든 forSave 값으로 한 번 저장하고 글은 `저장했어요.`다', async () => {
    const user = userEvent.setup()
    render(<Live input={inputOf()} />)
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 빼는 처방 고르기' }))
    await user.click(within(foundList()).getByRole('button', { name: /^재진 진찰료/ }))
    await user.click(screen.getByRole('button', { name: '저장' }))
    expect((await screen.findByText(SAVED)).textContent).toBe(SAVED)
    expect(saves).toHaveLength(1)
    expect(saves[0]![0]).toEqual({ id: 'g0', name: '충격파', codes: ['ESWT1', 'ESWT7'], sortOrder: 0, out: ['AA154'] })
    expect(saves[0]![1]).toEqual({ id: 'g1', name: '도수치료', codes: ['도수'], sortOrder: 1 })
    // 열쇠가 바뀌어 다시 불러올 때까지 숫자가 없다
    expect(queryRow('충격파')).toBeNull()
    expect(screen.getByText('충격파').closest('li')!.textContent).toContain(STALE)
  })
})

describe('AC-1213.1: 섹션 파일 소스', () => {
  it('AC-1213.1: 브라우저 저장소·document.cookie·console·lib/bridge/client를 쓰지 않는다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/stats/sections/TreatmentTrendSection.tsx'), 'utf8')
    for (const word of ['localStorage', 'sessionStorage', 'indexedDB', 'document.cookie', 'console', 'lib/bridge/client']) {
      expect(source, word).not.toContain(word)
    }
  })
})

describe('AC-1210.2: Section headingRef (parts.tsx)', () => {
  it('AC-1210.2: headingRef를 주지 않으면 제목 마크업이 지금 그대로다(tabindex 없음)', () => {
    render(
      <Section title="가짜 칸">
        <p>내용</p>
      </Section>,
    )
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(h2.hasAttribute('tabindex')).toBe(false)
    expect(h2.getAttribute('class')).toBe('text-title font-semibold text-ink')
  })

  it('AC-1210.2: headingRef를 주면 그 ref가 제목이고 코드로 초점을 받을 수 있다(tabindex -1)', () => {
    const ref = createRef<HTMLHeadingElement>()
    render(
      <Section title="가짜 칸" headingRef={ref}>
        <p>내용</p>
      </Section>,
    )
    const h2 = screen.getByRole('heading', { level: 2 })
    expect(ref.current).toBe(h2)
    expect(h2.tabIndex).toBe(-1)
    ref.current!.focus()
    expect(document.activeElement).toBe(h2)
  })
})

describe('AC-1208.1·AC-1209.1·AC-1210.2: 상자 안 상자 없음', () => {
  it('AC-1208.1·AC-1209.1: 안내 상자와 열린 칸이 있는 보기, 목록을 연 고치기 화면에 상자 안 상자가 없다', async () => {
    const user = userEvent.setup()
    const { container } = drawView(viewOf(), inputOf(PARTLY))
    await user.click(rowOf('충격파'))
    await user.click(screen.getByRole('button', { name: '숫자로 보기' }))
    expect(nestedBoxes(container)).toEqual([])
    await user.click(editButton())
    await user.click(within(groupAt(0)).getByRole('button', { name: '+ 처방 넣기' }))
    expect(nestedBoxes(container)).toEqual([])
  })
})

// ── 고른 기간 (stats-period AC-1704.4) ─────────────────
describe('AC-1704.4: 고른 기간의 처방별 추세', () => {
  const pickInput = (): StatsInput => ({ days: ALL_READY, covered: WHOLE, range: rangeOf(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, false) })

  it('AC-1704.4: 설명 끝에 " · {name}"이 붙는다', () => {
    drawView(viewOf(), pickInput())
    expect(screen.getByText(`${DESC} · 2026년 11월`)).toBeTruthy()
  })

  it('AC-1704.4: 빠른 단추일 때 설명은 지금과 같다', () => {
    drawView(viewOf(), inputOf())
    expect(screen.getByText(DESC)).toBeTruthy()
  })
})

// ── stats-pc-ux: 처방 탭 안의 묶음별 추세 (REQ-4003 AC-4003.6, REQ-4004 AC-4004.2 ①·AC-4004.3) ─────────────────
describe('AC-4004.2 ①·AC-4004.3: 묶음별 추세 아래 네 글 접기', () => {
  const HOW = '어떻게 세나요?'
  const howButton = () => screen.getByRole('button', { name: HOW })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
  const COMPARED = '증감과 막대는 두 기간 모두 자료가 있는 8일만 견줘요. 건수는 기간 전체예요.'
  const UNCOMPARED_NOTE = '충격파 묶음은 비교 기간을 다시 불러오면 지난 기간과 견줘요.'

  it('AC-4004.2: 네 글은 "어떻게 세나요?" 칸 안에 이 차례로 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않는다', () => {
    drawView()
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    const body = howBody()
    expect(body.hidden).toBe(true)
    expect(Array.from(body.querySelectorAll('p')).map((p) => p.textContent)).toEqual(NOTES)
    for (const note of NOTES) {
      const shown = screen.getByText(note)
      expect(shown.closest('[hidden]')).toBe(body)
      hasAll(shown, 'text-small text-muted')
    }
  })

  it('AC-4004.2: 누르면 네 글이 보이고(aria-expanded="true") 다시 누르면 접힌다', async () => {
    const user = userEvent.setup()
    drawView()
    await user.click(howButton())
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
    await user.click(howButton())
    expect(howBody().hidden).toBe(true)
  })

  it('AC-4004.2: 접는 칸은 줄 목록 아래이고, 보이는 안내(비교하지 않는 묶음 글) 다음이다', () => {
    drawView(viewOf(), inputOf(UNCOMPARED))
    expect(follows(list()!, howButton())).toBe(true)
    expect(follows(screen.getByText(UNCOMPARED_NOTE), howButton())).toBe(true)
  })

  it('AC-4004.3: 비교하지 않는 묶음 글은 접는 칸 밖에 그대로 보인다', () => {
    drawView(viewOf(), inputOf(UNCOMPARED))
    const note = screen.getByText(UNCOMPARED_NOTE)
    expect(note.closest('[hidden]')).toBeNull()
    expect(howBody().contains(note)).toBe(false)
  })

  it('AC-4004.3: 견준 짝이 빠졌다는 글은 접는 칸 밖에 그대로 보이고 접는 칸 앞이다', () => {
    drawView(viewOf(), inputOf(ALL_READY, '30d', [{ from: '2026-10-06', to: '2026-11-12' }]))
    const note = screen.getByText(COMPARED)
    expect(note.closest('[hidden]')).toBeNull()
    expect(howBody().contains(note)).toBe(false)
    expect(follows(note, howButton())).toBe(true)
  })

  it('AC-4004.3: 다시 불러오기 안내 상자는 접지 않고 줄 위 그대로다', () => {
    drawView(viewOf(), inputOf(PARTLY))
    expect(notice()!.closest('[hidden]')).toBeNull()
    expect(follows(notice()!, list()!)).toBe(true)
  })

  it('AC-4004.2: 저장된 숫자 없음·묶음 읽는 중·읽기 실패·기간 자료 없음·고치기 화면에는 "어떻게 세나요?"가 없다', async () => {
    const none = () => expect(screen.queryByRole('button', { name: HOW })).toBeNull()
    drawView(viewOf(), inputOf(), false)
    none()
    cleanup()
    drawView(viewOf({ state: 'reading', groups: [] }))
    none()
    cleanup()
    drawView(viewOf({ state: 'read-failed', groups: [] }))
    none()
    cleanup()
    drawView(viewOf(), inputOf([day(BEFORE, [])]))
    none()
    cleanup()
    const user = userEvent.setup()
    drawView()
    await user.click(editButton())
    none()
  })

  it('AC-4004.2: 접는 칸 단추는 열린 줄 단추와 섞이지 않는다(줄 단추만 li 안이다)', () => {
    drawView()
    expect(howButton().closest('li')).toBeNull()
    expect(howButton().closest('ul')).toBeNull()
  })
})

describe('AC-4003.6: 묶음별 추세 · 묶음 고치기 제목', () => {
  it('AC-4003.6: 고치기 제목 상수는 `묶음별 추세 · 묶음 고치기`이고 따로 그릴 때의 h2 TITLE은 `처방별 추세` 그대로다', () => {
    const source = readFileSync(join(process.cwd(), 'src/components/stats/sections/TreatmentTrendSection.tsx'), 'utf8')
    expect(source).toMatch(/const EDIT_TITLE = '묶음별 추세 · 묶음 고치기'/)
    expect(source).toMatch(/const TITLE = '처방별 추세'/)
    expect(source).not.toContain('처방별 추세 · 묶음 고치기')
  })

  it('AC-4003.6: 처방 탭 칸 첫 탭에서 [묶음 고치기]를 누르면 패널 맨 위 h3 `묶음별 추세 · 묶음 고치기`에 초점이 가고 머리 줄 설명·단추가 없다. [그만두기]로 닫으면 초점이 [묶음 고치기]로 온다', async () => {
    const user = userEvent.setup()
    render(
      <RxSection
        tabs={[
          { name: '묶음별 추세', panel: <Live input={inputOf()} /> },
          { name: '처방별 신환·재진', panel: <p>둘째 탭</p> },
        ]}
      />,
    )
    const head = screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!
    const edit = await within(head).findByRole('button', { name: '묶음 고치기' })
    expect(within(head).getByText(DESC)).toBeTruthy()
    await user.click(edit)
    const panel = screen.getByRole('tabpanel')
    const h3 = within(panel).getByRole('heading', { level: 3, name: EDIT_TITLE })
    expect(panel.firstElementChild).toBe(h3)
    expect(document.activeElement).toBe(h3)
    expect(within(head).queryByText(DESC)).toBeNull()
    expect(screen.queryByRole('button', { name: '묶음 고치기' })).toBeNull()
    expect(screen.queryByRole('heading', { level: 2, name: EDIT_TITLE })).toBeNull()
    await user.click(within(panel).getByRole('button', { name: '그만두기' }))
    await waitFor(() => expect(document.activeElement).toBe(within(head).getByRole('button', { name: '묶음 고치기' })))
    expect(within(panel).queryByRole('heading', { level: 3 })).toBeNull()
  })

  it('AC-4003.6·AC-4004.2: 처방 탭 칸 안에서도 네 글은 "어떻게 세나요?" 칸 안(처음 접힘)이고 머리 줄로 가지 않는다', async () => {
    render(<RxSection tabs={[{ name: '묶음별 추세', panel: <Live input={inputOf()} /> }]} />)
    const head = screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!
    await within(head).findByRole('button', { name: '묶음 고치기' })
    const how = within(screen.getByRole('tabpanel')).getByRole('button', { name: '어떻게 세나요?' })
    const body = document.getElementById(how.getAttribute('aria-controls')!)!
    expect(body.hidden).toBe(true)
    for (const note of NOTES) expect(body.contains(screen.getByText(note))).toBe(true)
    expect(head.contains(how)).toBe(false)
  })
})

// ── first90: 처방 카드 머리(REQ-4413 AC-4413.1). 카드 h2 `처방`이 칸 머리를 대신하고 [묶음 고치기]는 카드 머리 줄 오른쪽이다 ─────────────────
describe('AC-4413.1: 처방 카드 안의 묶음별 추세', () => {
  const inCard = (input: StatsInput = inputOf()) =>
    render(
      <StatsCard id="stats-rx" title="처방" desc={DESC}>
        <RxSection
          tabs={[
            { name: '묶음별 추세', panel: <Live input={input} /> },
            { name: '처방별 신환·재진', panel: <p>둘째 탭</p> },
          ]}
        />
      </StatsCard>,
    )
  const cardHead = () => screen.getByRole('heading', { level: 2, name: '처방' }).parentElement!

  it('AC-4413.1: h2는 카드의 `처방` 하나이고 [묶음 고치기]는 카드 머리 줄 오른쪽(ml-auto, 휴대폰 폭 전체)이며 설명은 카드 옆 글 하나뿐이다', async () => {
    inCard()
    const edit = await within(cardHead()).findByRole('button', { name: '묶음 고치기' })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(['처방'])
    expect(classOf(edit.parentElement!)).toContain('ml-auto')
    hasAll(edit, `${ds.button.secondarySmall} max-md:w-full`)
    expect(cardHead().textContent).toBe(`처방${DESC}묶음 고치기`)
    expect(screen.getAllByText(DESC)).toHaveLength(1)
    expect(within(screen.getByRole('tabpanel')).getAllByRole('list').length).toBeGreaterThan(0)
  })

  it('AC-4413.1: [묶음 고치기]를 누르면 탭 안 h3로 초점이 가고 카드 머리에는 옆 글만 남는다. [그만두기]로 닫으면 카드 머리 단추로 초점이 온다', async () => {
    const user = userEvent.setup()
    inCard()
    await user.click(await within(cardHead()).findByRole('button', { name: '묶음 고치기' }))
    const h3 = within(screen.getByRole('tabpanel')).getByRole('heading', { level: 3, name: EDIT_TITLE })
    expect(document.activeElement).toBe(h3)
    expect(cardHead().textContent).toBe(`처방${DESC}`)
    await user.click(screen.getByRole('button', { name: '그만두기' }))
    await waitFor(() => expect(document.activeElement).toBe(within(cardHead()).getByRole('button', { name: '묶음 고치기' })))
  })

  it('AC-4413.1: 고른 기간이어도 카드 안에서는 설명이 카드 옆 글 하나뿐이다', async () => {
    inCard({ days: ALL_READY, covered: WHOLE, range: rangeOf(TODAY, { kind: 'month', unit: 'day', month: '2026-11' }, false) })
    await within(cardHead()).findByRole('button', { name: '묶음 고치기' })
    expect(screen.queryByText(`${DESC} · 2026년 11월`)).toBeNull()
    expect(screen.getAllByText(DESC)).toHaveLength(1)
  })
})
