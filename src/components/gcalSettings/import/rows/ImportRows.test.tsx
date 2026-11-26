// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { colorFromId, type GEvent } from '@/lib/calendar/gshapes'
import { parseGoogleEvent } from '@/lib/calendar/gtitle'
import { importRowState, type ImportPicks, type ImportRow } from '@/lib/gcal/importRead'
import { CTX, EVENTS, TODAY, timed } from '../testData'
import { ImportRows, type ImportRowsProps } from './ImportRows'

// 처음 가져오기 미리 보기 표 줄(spec google-link REQ-8530 AC-8530.1·AC-8530.3·AC-8530.4, notes-calendar `import`, 시안 calendar.html impRowHTML).
// 울타리 안 부품(components/gcalSettings/**/rows): 받은 줄(구글 제목 원문 = 환자 이름)을 그리고 고른 값은 onPick으로만 넘긴다.
// 글은 notes-calendar 글자를 그대로 적어 견준다. 환자 이름은 지어낸 값

afterEach(cleanup)

// jsdom은 칸 높이를 재지 못한다(clientHeight 0 → 부품은 표 칸 560px로 셈한다). 자료 19줄을 모두 보려는 시험은 표 칸이 큰 화면을 흉내 낸다
function tallView(px = 4000) {
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', {
    configurable: true,
    get(this: HTMLElement) {
      return this.dataset.testid === 'import-rows-scroll' ? px : 0
    },
  })
}
// HTMLElement에 얹은 것만 지우면 jsdom 본래 값(Element.prototype)으로 돌아간다
afterEach(() => {
  delete (HTMLElement.prototype as { clientHeight?: number }).clientHeight
})

function rowOf(ev: GEvent, known = false): ImportRow {
  const day = ev.start.slice(0, 10)
  return {
    key: ev.id,
    eventId: ev.id,
    title: ev.summary,
    gColor: colorFromId(ev.colorId),
    allDay: ev.allDay,
    day,
    past: day < TODAY,
    parsed: parseGoogleEvent(ev, CTX),
    known,
    event: ev,
  }
}

const ROWS = EVENTS.map((ev) => rowOf(ev))
const byId = (id: string) => ROWS.find((r) => r.key === id)!

function setup(over: Partial<ImportRowsProps> = {}) {
  const onPick = vi.fn()
  const picks: ImportPicks = over.picks ?? {}
  const props: ImportRowsProps = {
    rows: ROWS,
    today: TODAY,
    ctx: CTX,
    picks,
    stateOf: (row) => importRowState(row, picks),
    onPick,
    ...over,
  }
  const view = render(<ImportRows {...props} />)
  return { ...view, onPick }
}

const line = (key: string) => {
  const tr = document.querySelector<HTMLTableRowElement>(`tr[data-row="${key}"]`)
  if (!tr) throw new Error(`줄 없음 ${key}`)
  return tr
}
const cells = (key: string) => [...line(key).querySelectorAll('td')].map((td) => td.textContent?.replace(/\s+/g, ' ').trim())
const selects = (key: string) => [...line(key).querySelectorAll('select')]
const options = (select: HTMLSelectElement) => [...select.options].map((o) => o.textContent)

describe('AC-8530.1 표 머리·날짜 줄·상태·꼬리표', () => {
  beforeEach(() => tallView())

  it('AC-8530.1: 표 머리가 notes-calendar `import` 그대로다', () => {
    setup()
    const head = [...document.querySelectorAll('thead th')].map((th) => th.textContent)
    expect(head).toEqual(['상태', '구글 일정 (색 · 제목 원문)', '', '날짜', '시작', '길이', '차트번호', '이름', '종류', '시행자', '메모'])
  })

  it("AC-8530.1: 날짜 줄은 '{11월 23일 (월)} · 오늘 (잇는 날)'이고, 지난 날은 '지난 예약 · 한 번만 옮겨 와요'가 붙고 지난해는 해를 앞에 적는다", () => {
    setup()
    const days = [...document.querySelectorAll('tr[data-day]')].map((tr) => tr.textContent)
    expect(days).toContain('11월 23일 (월) · 오늘 (잇는 날)')
    expect(days).toContain('11월 24일 (화)')
    expect(days).toContain('11월 21일 (토) · 지난 예약 · 한 번만 옮겨 와요')
    expect(days).toContain('2025년 12월 1일 (월) · 지난 예약 · 한 번만 옮겨 와요')
  })

  it('AC-8530.1: 알아본 예약 줄은 상태 · 색 · 제목 원문 → 날짜·시작·길이·차트번호·이름·종류·시행자·메모', () => {
    setup()
    expect(cells('evfut01')).toEqual(['✓ 알아봄', '1234 홍길동 도수 30분 (호)', '→', '11/23 (월)', '09:00', '30분', '1234', '홍길동', '도수', '(호) 정호연', ''])
    // 종류 글이 없어 설정으로, 시행자는 구글 색으로 알아봄
    expect(cells('evfut03')).toEqual(['✓ 알아봄', '6230 정샘플', '→', '11/23 (월)', '09:30', '30분', '6230', '정샘플', '도수설정', '(현) 이수현구글 색', ''])
    expect(line('evfut01').getAttribute('data-state')).toBe('known')
  })

  it("AC-8530.1: 취소 색 일정은 '{토마토} = 취소', 변경 색은 '{흑연} = 변경' 꼬리표", () => {
    setup()
    expect(cells('evpast02')[1]).toBe('9962 서모의 도수30분(호)토마토 = 취소')
    expect(cells('evpast01')[1]).toBe('6639 최가짜 도수 30분 (호)흑연 = 변경')
    expect(cells('evfut01')[1]).toBe('1234 홍길동 도수 30분 (호)')
  })

  it("AC-8530.1: 시행자 없이 가져오는 지난 예약은 시행자 칸 '없음' + '지난 예약 · 시행자 없이', 모르는 표시 글은 메모로", () => {
    setup()
    expect(cells('evpast03').slice(6)).toEqual(['2184', '배샘플', '충격파', '없음지난 예약 · 시행자 없이', '4000타'])
    expect(cells('evpast04').slice(6)).toEqual(['7740', '한시안', '도수', '없음지난 예약 · 시행자 없이', '(윤)'])
  })

  it("AC-8530.1: 하루 종일은 '하루 종일' + '휴무 {(원) 박지원} {김예시 (직원)}' 또는 '종일 메모 · {원장님 학회}', 여러 날이면 '· 날마다 따로 넣어요'", () => {
    setup()
    expect(cells('evfut09')).toEqual(['✓ 알아봄', '김예시, 박지원 off', '→', '11/24 (화)', '하루 종일', '휴무 김예시 (직원) (원) 박지원'])
    expect(cells('evfut10')).toEqual(['✓ 알아봄', '원장님 학회', '→', '11/25 (수)', '하루 종일', '종일 메모 · 원장님 학회'])
    expect(cells('evfut12')).toEqual(['✓ 알아봄', '정호연 off', '→', '11/30 (월) – 12/2 (수)', '하루 종일', '휴무 (호) 정호연 · 날마다 따로 넣어요'])
  })

  it('AC-8530.1: 고쳐야 할 까닭은 제목 아래 작은 글(notes-calendar 글 그대로)이고 상태는 ! 고쳐야 함', () => {
    setup()
    const why = (key: string) => line(key).querySelector('[data-why]')?.textContent
    expect(why('evfut02')).toBe('시행자 글이 없어요. 충격파는 그때그때 하는 사람이 달라 색으로는 몰라요')
    expect(why('evfut04')).toBe('시행자 글이 없고, 색도 캘린더 기본 색이에요')
    expect(why('evfut06')).toBe("'민'은 시행자 표시에 없어요")
    expect(why('evfut07')).toBe("'체외'를 종류로 알아보지 못했어요 (고르면 '체외'는 메모로 남아요)")
    expect(why('evfut05')).toBe('차트번호·시행자·종류 글이 없어 예약 같지 않아요')
    expect(why('evfut08')).toBe('구글 시간이 09:00–21:00 (12시간)이에요. 예약 칸은 4시간까지예요')
    expect(why('evfut11')).toBe("'최호'를 원장님·직원 목록에서 찾지 못했어요")
    expect(cells('evfut02')[0]).toBe('! 고쳐야 함')
    expect(line('evfut02').getAttribute('data-state')).toBe('fix')
    expect(line('evfut01').querySelector('[data-why]')).toBeNull()
  })

  it('AC-8530.1: 노란 칸 고르기 — 고를 거리마다 그 칸에, 모든 고르기 끝에 가져오지 않기 (구글에만 둠)', () => {
    setup()
    const skip = '가져오지 않기 (구글에만 둠)'
    // 시행자 칸
    const [staff] = selects('evfut02')
    expect(options(staff)).toEqual(['고르기', '(호) 정호연', '(원) 박지원', '(현) 이수현', '(장) 원장님', skip])
    expect(staff.closest('td')?.getAttribute('data-need')).toBe('staff')
    // 종류 칸
    const [kind] = selects('evfut07')
    expect(options(kind)).toEqual(['고르기', '도수', '자보도수', '충격파', '주사', '진료', skip])
    // 길이 칸: 구글 길이 + 고르기
    const [len] = selects('evfut08')
    expect(options(len)).toEqual(['고르기', '30분으로', '50분으로', skip])
    expect(len.closest('td')?.textContent).toContain('12시간')
    // 예약 같지 않음: 날짜·시작·길이 뒤 한 칸
    const [what] = selects('evfut05')
    expect(options(what)).toEqual(['고르기', '종일 메모로 넣기', skip])
    expect(cells('evfut05').slice(3, 6)).toEqual(['11/23 (월)', '13:00', '60분'])
    // 목록에 없는 이름: 사람 고르기 · 종일 메모로
    const [person] = selects('evfut11')
    expect(options(person)).toEqual([
      '고르기',
      '(장) 원장님',
      '(호) 정호연',
      '(원) 박지원',
      '(현) 이수현',
      '김예시 (직원)',
      '정예시 (직원)',
      "종일 메모로 ('최호 off')",
      skip,
    ])
    expect(cells('evfut11')[4]).toBe('하루 종일')
  })

  it('AC-8530.1: 문제가 둘인 줄(4시간 넘음 + 시행자 글 없음)은 길이·시행자 칸에 고르기가 하나씩, 까닭은 맨 앞 것', () => {
    setup()
    const both = selects('evfut13')
    expect(both.map((s) => s.closest('td')?.getAttribute('data-need'))).toEqual(['len', 'staff'])
    expect(line('evfut13').querySelector('[data-why]')?.textContent).toBe('구글 시간이 09:00–21:00 (12시간)이에요. 예약 칸은 4시간까지예요')
    expect(cells('evfut13').slice(6, 9)).toEqual(['6402', '윤모의', '충격파'])
  })

  it('AC-8530.1: 이미 웹앱에 있는 일정(짝 있음)은 알아봄이고 고르기가 없다', () => {
    const known = rowOf(EVENTS.find((e) => e.id === 'evfut02')!, true)
    setup({ rows: [known] })
    expect(cells('evfut02')[0]).toBe('✓ 알아봄')
    expect(selects('evfut02')).toEqual([])
  })

  it('AC-8530.1: 잠그면(데스크·보는 중) 고르기가 모두 막힌다', () => {
    setup({ locked: true })
    expect(selects('evfut02').every((s) => s.disabled)).toBe(true)
    expect(selects('evfut13').every((s) => s.disabled)).toBe(true)
  })
})

describe('AC-8530.3 노란 칸 고르기 · 가져오지 않기 · 되돌리기', () => {
  beforeEach(() => tallView())

  it('AC-8530.3: 고르면 그 줄 · 고를 거리 · 값으로 onPick을 부른다(가져오지 않기·고르기로 되돌리기도)', () => {
    const { onPick } = setup()
    fireEvent.change(selects('evfut02')[0], { target: { value: 'staff:won' } })
    expect(onPick).toHaveBeenLastCalledWith(byId('evfut02'), 'staff', 'staff:won')
    fireEvent.change(selects('evfut05')[0], { target: { value: 'skip' } })
    expect(onPick).toHaveBeenLastCalledWith(byId('evfut05'), 'what', 'skip')
    fireEvent.change(selects('evfut13')[1], { target: { value: 'staff:ho' } })
    expect(onPick).toHaveBeenLastCalledWith(byId('evfut13'), 'staff', 'staff:ho')
    fireEvent.change(selects('evfut11')[0], { target: { value: 'memo' } })
    expect(onPick).toHaveBeenLastCalledWith(byId('evfut11'), 'person', 'memo')
  })

  it("AC-8530.3: 고른 줄은 '✓ 고름'(고른 값이 칸에 남고 '고름' 꼬리표), 까닭 글은 사라진다", () => {
    setup({ picks: { evfut02: ['staff:won'], evfut13: ['len:30'] } })
    expect(cells('evfut02')[0]).toBe('✓ 고름')
    expect(line('evfut02').getAttribute('data-state')).toBe('picked')
    expect(selects('evfut02')[0].value).toBe('staff:won')
    expect(within(line('evfut02')).getByText('고름')).toBeTruthy()
    expect(line('evfut02').querySelector('[data-why]')).toBeNull()
    // 둘 가운데 하나만 골랐으면 아직 고쳐야 함
    expect(cells('evfut13')[0]).toBe('! 고쳐야 함')
    expect(selects('evfut13').map((s) => s.value)).toEqual(['len:30', ''])
  })

  it("AC-8530.3: 가져오지 않기를 고른 줄은 '가져오지 않음' + '구글에만 두고 웹앱은 건드리지 않아요', 고르기 칸은 모두 가져오지 않기", () => {
    setup({ picks: { evfut05: ['skip'], evfut13: ['skip'] } })
    expect(cells('evfut05')[0]).toBe('가져오지 않음')
    expect(line('evfut05').getAttribute('data-state')).toBe('skip')
    expect(line('evfut05').querySelector('[data-skip]')?.textContent).toBe('구글에만 두고 웹앱은 건드리지 않아요')
    expect(selects('evfut13').map((s) => s.value)).toEqual(['skip', 'skip'])
    expect(line('evfut05').querySelector('[data-why]')).toBeNull()
  })
})

describe('AC-8530.4 보이는 줄만 그린다', () => {
  // 4,000줄: 하루 40줄씩 100일(앞으로), 고쳐야 할 것 섞음
  const MANY: ImportRow[] = Array.from({ length: 4000 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 10, 23 + Math.floor(i / 40))).toISOString().slice(0, 10)
    const min = 540 + (i % 40) * 15
    const hm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
    const title = i % 7 === 0 ? `${3000 + i} 가상${i % 10} (4000타)` : `${3000 + i} 가상${i % 10} 도수 30분 (호)`
    return rowOf(timed(`evmany${String(i).padStart(4, '0')}`, `${day}T${hm(min)}`, `${day}T${hm(min + 15)}`, title, i % 7 === 0 ? '2' : '1'))
  })

  it('AC-8530.4: 4,000줄을 받아도 그린 줄은 표 칸 높이 만큼(+ 앞뒤 몇 줄)뿐이고, 내려 보면 그 자리 줄을 그린다', () => {
    setup({ rows: MANY })
    const drawn = () => [...document.querySelectorAll('tr[data-row]')].map((tr) => tr.getAttribute('data-row'))
    const first = drawn()
    expect(first.length).toBeGreaterThan(5)
    expect(first.length).toBeLessThan(40)
    expect(first[0]).toBe('evmany0000')
    // 표 칸 전체 높이는 4,000줄 + 날짜 줄 100개만큼(빈 자리로 채움)
    const box = screen.getByTestId('import-rows-scroll')
    const table = box.querySelector('table')!
    expect(table.getAttribute('aria-rowcount')).toBe(String(4000 + 100 + 1))
    // 가운데로 내려 본다
    box.scrollTop = 60_000
    fireEvent.scroll(box)
    const middle = drawn()
    expect(middle.length).toBeLessThan(40)
    expect(middle).not.toContain('evmany0000')
    const index = Number(middle[0]!.slice(6))
    expect(index).toBeGreaterThan(1000)
    expect(index).toBeLessThan(1600)
  })

  it('AC-8530.4: 고른 값을 바꿔도 그린 줄 수는 그대로다', () => {
    const picks: ImportPicks = { evmany0000: ['staff:ho'] }
    setup({ rows: MANY, picks, stateOf: (row) => importRowState(row, picks) })
    expect(cells('evmany0000')[0]).toBe('✓ 고름')
    expect(document.querySelectorAll('tr[data-row]').length).toBeLessThan(40)
  })
})
