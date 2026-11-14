// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { statsRange } from '@/components/stats/view'
import { formatPatientMix, mixBar } from '@/lib/analytics/patientMix'
import { VISIT_HOURS } from '@/lib/analytics/visitHours'
import type { BitSectionsView, MixRow, MixRowKind, PatientMix } from '@/types/stats'
import { StatsCard } from './parts'
import { PatientMixSection, type BitSectionsShown } from './PatientMixSection'

// 환자 구성 칸 (stats-bit-sections AC-2706.1·AC-2706.2·AC-2706.5·AC-2706.6·AC-2703.9·AC-2707.1, first90 REQ-4412 AC-4412.4,
// 시안 docs/mockups/first90/redesign.html '환자 구성'). 이름·숫자는 모두 시험 안에서 지은 가짜다

const HOSPITAL = '튼튼의원'
const TODAY = '2026-11-13'
const R30 = statsRange(TODAY, '30d') // 10월 14일 ~ 11월 12일, 견줄 기간 9월 14일 ~ 10월 13일
const R7 = statsRange(TODAY, '7d')
const COMPARED_FOOT = '증감은 지난 30일(9월 14일 – 10월 13일)의 명 수와 견줬어요.'
const NO_PREVIOUS = '지난 기간 자료가 없어 견주지 못해요. 지난 기간이 든 기간을 불러오면 보여요.'

const row = (label: string, people: number, visits: number, total: number, previous: number | null = null, kind: MixRowKind = 'row'): MixRow => ({
  label,
  people,
  visits,
  share: total === 0 ? 0 : people / total,
  kind,
  previous,
})

const ALL_PEOPLE = 1248
const ALL: PatientMix = {
  total: { people: ALL_PEOPLE, visits: 2310 },
  compared: true,
  age: [
    row('10세 미만', 18, 22, ALL_PEOPLE, 20), // ▼10%
    row('10대', 64, 98, ALL_PEOPLE, 64), // 0%
    row('80세 이상', 0, 0, ALL_PEOPLE, 0), // –
    row('생년월일 없음', 17, 15, ALL_PEOPLE, null, 'none'),
  ],
  insurance: [
    row('건강보험', 1071, 1943, ALL_PEOPLE, 956), // ▲12%
    row('차상위', 8, 12, ALL_PEOPLE, 0), // 새로, 1% 미만
  ],
  city: [row('영통구', 412, 790, ALL_PEOPLE, 460), row('그 밖 23곳', 66, 149, ALL_PEOPLE, null, 'rest'), row('주소 없음', 6, 11, ALL_PEOPLE, null, 'none')],
  town: [row('매탄동', 168, 322, ALL_PEOPLE, 168), row('동 없는 주소', 168, 304, ALL_PEOPLE, null, 'noTown')],
}
const NEW: PatientMix = {
  total: { people: 186, visits: 200 },
  compared: true,
  age: [row('20대', 24, 26, 186, 20)],
  insurance: [row('자동차보험', 11, 12, 186, 11)],
  city: [row('권선구', 31, 33, 186, 30)],
  town: [row('영통동', 19, 20, 186, 19)],
}
const HOURS = { hours: [...VISIT_HOURS], rows: [], unknown: 0, peak: null }
const ready = (all: PatientMix = ALL, fresh: PatientMix = NEW): BitSectionsView => ({ kind: 'ready', mix: { all, new: fresh }, hours: HOURS, doctors: { kind: 'single' } })

const draw = (view: BitSectionsShown, range = R30, className = 'col-span-12') =>
  render(<PatientMixSection view={view} range={range} hospitalName={HOSPITAL} className={className} />)
const section = () => screen.getByRole('heading', { level: 2, name: '환자 구성' }).closest('section')!
// 줄 목록은 탭 패널 안에 있어 고르지 않은 탭의 목록은 hidden 안이다. 줄 글은 숨김과 상관없이 읽는다
const listOf = (name: string) => screen.getByRole('list', { name, hidden: true })
const items = (name: string) => within(listOf(name)).getAllByRole('listitem', { hidden: true })
const labels = (name: string) => items(name).map((item) => item.children[0]!.textContent)
const itemOf = (list: string, label: string) => items(list).find((item) => item.children[0]!.textContent === label)!
const pressed = (group: string) =>
  within(screen.getByRole('group', { name: group }))
    .getAllByRole('button')
    .map((button) => [button.textContent, button.getAttribute('aria-pressed')])
const press = (group: string, name: string) => fireEvent.click(within(screen.getByRole('group', { name: group })).getByRole('button', { name }))
const tabs = () => within(screen.getByRole('tablist', { name: '환자 구성 보기' })).getAllByRole('tab')
const tab = (name: string) => within(screen.getByRole('tablist', { name: '환자 구성 보기' })).getByRole('tab', { name })
const openTab = (name: string) => fireEvent.click(tab(name))
const panelOf = (name: string) => document.getElementById(tab(name).getAttribute('aria-controls')!)!

const original = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
function fakeClipboard() {
  const writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
  return writeText
}
afterEach(() => {
  cleanup()
  if (original) Object.defineProperty(navigator, 'clipboard', original)
  else Reflect.deleteProperty(navigator, 'clipboard')
})

describe('AC-2706.1·AC-2706.2·AC-4412.4 환자 구성 칸', () => {
  it('AC-2706.1·AC-4412.4: 제목 "환자 구성" + 옆 글 "명 = 서로 다른 환자 · 건 = 접수 건수 · 전체 {n}명", 섹션 틀은 놓는 쪽의 칸 폭을 받는다', () => {
    draw(ready())
    const heading = screen.getByRole('heading', { level: 2, name: '환자 구성' })
    expect(heading.parentElement!.textContent).toContain('환자 구성명 = 서로 다른 환자 · 건 = 접수 건수 · 전체 1,248명')
    expect(section().textContent).not.toContain('어떤 분들이 오시는지')
    expect(section().className.split(' ')).toContain('col-span-12')
    expect(section().className.split(' ')).toContain('border-t')
    cleanup()
    draw(ready(), R7)
    expect(screen.getByText('명 = 서로 다른 환자 · 건 = 접수 건수 · 전체 1,248명')).toBeTruthy()
  })

  it('AC-4412.4: 환자 카드 안에서는 h3다', () => {
    render(
      <StatsCard title="환자">
        <PatientMixSection view={ready()} range={R30} hospitalName={HOSPITAL} />
      </StatsCard>,
    )
    expect(screen.getByRole('heading', { level: 3, name: '환자 구성' })).toBeTruthy()
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual(['환자 구성'])
  })

  it('AC-2706.2·AC-4412.4: [전체][신환](누구를 셀까)은 머리 줄에 있고 처음 [전체]이다', () => {
    draw(ready())
    expect(pressed('누구를 셀까')).toEqual([
      ['전체', 'true'],
      ['신환', 'false'],
    ])
    const head = screen.getByRole('heading', { level: 2, name: '환자 구성' }).parentElement!
    expect(within(head).getByRole('group', { name: '누구를 셀까' })).toBeTruthy()
  })

  it('AC-2706.2·AC-4412.4: [신환]을 누르면 세 탭이 모두 신환 숫자이고 옆 글이 "신환 N명"이다', () => {
    draw(ready())
    press('누구를 셀까', '신환')
    expect(pressed('누구를 셀까')).toEqual([
      ['전체', 'false'],
      ['신환', 'true'],
    ])
    expect(screen.getByText('명 = 서로 다른 환자 · 건 = 접수 건수 · 신환 186명')).toBeTruthy()
    expect(labels('연령대')).toEqual(['20대'])
    expect(labels('보험')).toEqual(['자동차보험'])
    expect(labels('동네')).toEqual(['권선구'])
  })

  it('AC-4412.4: 세 열(h3) 대신 탭 셋 "연령대" · "보험" · "동네"이고 처음 연령대다', () => {
    draw(ready())
    expect(screen.queryAllByRole('heading', { level: 3 })).toEqual([])
    expect(tabs().map((t) => [t.textContent, t.getAttribute('aria-selected'), t.getAttribute('tabindex')])).toEqual([
      ['연령대', 'true', '0'],
      ['보험', 'false', '-1'],
      ['동네', 'false', '-1'],
    ])
    expect(panelOf('연령대').hidden).toBe(false)
    expect(panelOf('보험').hidden).toBe(true)
    expect(panelOf('동네').hidden).toBe(true)
    expect(panelOf('연령대').getAttribute('role')).toBe('tabpanel')
    expect(panelOf('연령대').getAttribute('aria-labelledby')).toBe(tab('연령대').id)
    expect(screen.getByRole('list', { name: '연령대' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: '보험' })).toBeNull()
    expect(labels('연령대')).toEqual(['10세 미만', '10대', '80세 이상', '생년월일 없음'])
    expect(labels('보험')).toEqual(['건강보험', '차상위'])
    expect(labels('동네')).toEqual(['영통구', '그 밖 23곳', '주소 없음'])
  })

  it('AC-4412.4: 탭을 누르면 그 탭의 줄만 보인다', () => {
    draw(ready())
    openTab('보험')
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(panelOf('보험').hidden).toBe(false)
    expect(panelOf('연령대').hidden).toBe(true)
    expect(screen.getByRole('list', { name: '보험' })).toBeTruthy()
    expect(screen.queryByRole('list', { name: '연령대' })).toBeNull()
  })

  it('AC-4412.4: → ← Home End로 탭을 옮기면 바로 고르고 초점도 옮긴다(롤빙 tabindex)', () => {
    draw(ready())
    const list = screen.getByRole('tablist', { name: '환자 구성 보기' })
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    expect(document.activeElement).toBe(tab('보험'))
    expect(tabs().map((t) => t.getAttribute('tabindex'))).toEqual(['-1', '0', '-1'])
    fireEvent.keyDown(list, { key: 'End' })
    expect(document.activeElement).toBe(tab('동네'))
    fireEvent.keyDown(list, { key: 'ArrowRight' })
    expect(document.activeElement).toBe(tab('연령대'))
    fireEvent.keyDown(list, { key: 'ArrowLeft' })
    expect(document.activeElement).toBe(tab('동네'))
    fireEvent.keyDown(list, { key: 'Home' })
    expect(tabs().map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false'])
  })

  it('AC-2706.2·AC-4412.4: [구·시][동](동네 단위)은 동네 탭 안에만 있고 처음 [구·시]다', () => {
    draw(ready())
    expect(screen.queryByRole('group', { name: '동네 단위' })).toBeNull()
    openTab('동네')
    expect(pressed('동네 단위')).toEqual([
      ['구·시', 'true'],
      ['동', 'false'],
    ])
    expect(panelOf('동네').contains(screen.getByRole('group', { name: '동네 단위' }))).toBe(true)
  })

  it('AC-2706.2: [동]을 누르면 동네 탭만 동 줄이다', () => {
    draw(ready())
    openTab('동네')
    press('동네 단위', '동')
    expect(pressed('동네 단위')).toEqual([
      ['구·시', 'false'],
      ['동', 'true'],
    ])
    expect(labels('동네')).toEqual(['매탄동', '동 없는 주소'])
    expect(labels('보험')).toEqual(['건강보험', '차상위'])
  })

  it('AC-2706.2·AC-4412.4: 줄은 이름 | 막대 | N명 | N건 · P%이고 비율은 mixShareText(1% 미만 포함), 막대 폭은 mixBar다', () => {
    draw(ready())
    const health = itemOf('보험', '건강보험')
    expect([...health.children].slice(0, 4).map((cell) => cell.textContent)).toEqual(['건강보험', '', '1,071명', '1,943건 · 86%'])
    expect(itemOf('보험', '차상위').children[3]!.textContent).toBe('12건 · 1% 미만')
    const bar = health.children[1]!
    expect(bar.getAttribute('aria-hidden')).toBe('true')
    expect((bar.firstElementChild as HTMLElement).style.width).toBe(`${mixBar(ALL.insurance[0]!, ALL.insurance)}%`)
    expect((itemOf('보험', '차상위').children[1]!.firstElementChild as HTMLElement).style.width).toBe(`${mixBar(ALL.insurance[1]!, ALL.insurance)}%`)
  })

  it('AC-4417.2: 막대 폭은 기간을 바꾸면 300ms 바뀐다(st-move-period)', () => {
    draw(ready())
    expect(itemOf('보험', '건강보험').children[1]!.firstElementChild!.className).toContain('st-move-period')
  })

  it('AC-2706.2: 그 밖·없음 줄은 이름이 흐린 글자이고 막대가 흐린 색이다', () => {
    draw(ready())
    const rest = itemOf('동네', '그 밖 23곳')
    expect(rest.children[0]!.className).toContain('text-muted')
    expect(rest.children[1]!.firstElementChild!.className).toContain('bg-chart-prev')
    const plain = itemOf('동네', '영통구')
    expect(plain.children[0]!.className).toContain('text-ink')
    expect(plain.children[1]!.firstElementChild!.className).toContain('bg-accent')
  })

  it('AC-4412.4: 1100px 이상에서는 줄을 두 열로 세로로 채운다(위에서 아래로 왼쪽 열 먼저, 줄은 열 사이에서 끊기지 않는다)', () => {
    draw(ready())
    for (const name of ['연령대', '보험', '동네']) {
      const list = listOf(name)
      expect(list.tagName, name).toBe('OL')
      expect(list.className.split(' '), name).toEqual(expect.arrayContaining(['min-[1100px]:columns-2', 'min-[1100px]:gap-x-12']))
      for (const item of items(name)) expect(item.className.split(' '), name).toContain('break-inside-avoid')
    }
  })

  it('AC-4412.4: 세 열 · 1280px 경계(min-[80rem]:) 클래스는 남지 않는다', () => {
    const { container } = draw(ready())
    expect(container.innerHTML).not.toContain('min-[80rem]')
    expect(container.innerHTML).not.toMatch(/lg:grid-cols-2|lg:row-span-2|lg:border-l/)
  })

  it('AC-2706.2: 아래 글과 [표 복사]가 있다', () => {
    draw(ready())
    expect(
      screen.getByText('명은 기간 안 마지막 내원 때의 나이·보험·주소로 한 번만 세요. 보험·동네는 비트에 적힌 이름 그대로예요(차상위는 한 줄로 묶어요).'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: '표 복사' })).toBeTruthy()
  })
})

// ── stats-pc-ux: 줄 아래 [어떻게 세나요?] · [표 복사] 줄 (REQ-4004 AC-4004.2 ⑥·AC-4004.3, REQ-4005 AC-4005.1), first90 AC-4412.4 견줌 글 ─────────────────
describe('AC-4004.2 ⑥·AC-4004.3·AC-4005.1·AC-4412.4: 환자 구성 아래 줄과 접는 설명', () => {
  const FOOT = '명은 기간 안 마지막 내원 때의 나이·보험·주소로 한 번만 세요. 보험·동네는 비트에 적힌 이름 그대로예요(차상위는 한 줄로 묶어요).'
  const howButton = () => screen.getByRole('button', { name: '어떻게 세나요?' })
  const howBody = () => document.getElementById(howButton().getAttribute('aria-controls')!)!
  const copyButton = () => screen.getByRole('button', { name: '표 복사' })

  it('AC-4005.1·AC-4412.4: 탭 패널 다음이 견줌 글, 그 바로 다음 줄이 왼쪽 [어떻게 세나요?] · 오른쪽 끝 [표 복사] 한 줄(flex-wrap justify-between)이다', () => {
    draw(ready())
    const line = howButton().parentElement!
    const foot = screen.getByText(COMPARED_FOOT)
    expect(panelOf('동네').nextElementSibling).toBe(foot)
    expect(foot.nextElementSibling).toBe(line.parentElement)
    expect(line.parentElement!.firstElementChild).toBe(line)
    expect(line.className.split(' ')).toEqual(expect.arrayContaining(['flex', 'flex-wrap', 'items-center', 'justify-between']))
    expect(line.firstElementChild).toBe(howButton())
    expect(line.lastElementChild!.contains(copyButton())).toBe(true)
  })

  it('AC-4005.1: 768px 미만은 [표 복사]가 줄 전체 폭이고 [어떻게 세나요?]가 그 아래다(order)', () => {
    draw(ready())
    expect(howButton().classList.contains('max-md:order-2')).toBe(true)
    expect(howButton().parentElement!.lastElementChild!.classList.contains('max-md:w-full')).toBe(true)
    expect(copyButton().classList.contains('max-md:w-full')).toBe(true)
  })

  it('AC-4004.2: 아래 글은 "어떻게 세나요?" 칸 안에 있고 처음에는 접혀(hidden) 있어 그 자리에 보이지 않으며, 펼친 글은 그 줄 아래다', () => {
    draw(ready())
    expect(howButton().getAttribute('aria-expanded')).toBe('false')
    expect(howBody().hidden).toBe(true)
    expect(screen.getByText(FOOT).closest('[hidden]')).toBe(howBody())
    expect(howBody().textContent).toBe(FOOT)
    expect(howButton().parentElement!.nextElementSibling).toBe(howBody())
    fireEvent.click(howButton())
    expect(howButton().getAttribute('aria-expanded')).toBe('true')
    expect(howBody().hidden).toBe(false)
  })

  it('AC-4004.3·AC-4412.4: 견줌 글과 [전체][신환] 옆 글은 접지 않고 그대로 보인다', () => {
    draw(ready())
    expect(screen.getByText(COMPARED_FOOT).closest('[hidden]')).toBeNull()
    expect(screen.getByText(/^명 = 서로 다른 환자 · 건 = 접수 건수/).closest('[hidden]')).toBeNull()
  })

  it('AC-4004.2: 빈 상태·기다리는 칸에는 접는 칸이 없다', () => {
    draw(null)
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
    cleanup()
    draw('waiting')
    expect(screen.queryByRole('button', { name: '어떻게 세나요?' })).toBeNull()
  })
})

describe('AC-2703.9·AC-4412.4 지난 기간과 견주기', () => {
  it('AC-2703.9·AC-4412.4: 견줬으면 줄 아래 글이 "증감은 {비교 이름}({시작} – {끝})의 명 수와 견줬어요."이고 위의 "…과 견줘요 · 명 기준" 줄은 없다', () => {
    draw(ready())
    const line = screen.getByText(COMPARED_FOOT)
    expect(line.className).toContain('text-muted')
    expect(screen.queryByText(/견줘요 · 명 기준/)).toBeNull()
    expect(screen.queryByText(/견주지 못해요/)).toBeNull()
  })

  it('AC-4412.4: 견줄 기간 이름과 날짜는 지금 통계 탭의 견줄 기간이다', () => {
    draw(ready(), R7)
    expect(R7.previous).toEqual(expect.objectContaining({ from: '2026-10-30', to: '2026-11-05' }))
    expect(screen.getByText(`증감은 ${R7.previous.name}(10월 30일 – 11월 5일)의 명 수와 견줬어요.`)).toBeTruthy()
  })

  it('AC-2703.9: ▲는 text-positive·"늘어남", ▼는 text-negative·"줄어듦"이고 화살표는 화면 읽기에서 뺀다(DeltaText와 같은 색)', () => {
    draw(ready())
    const up = itemOf('보험', '건강보험').children[4]!
    expect(up.textContent).toBe('▲12% 늘어남')
    expect(up.className).toContain('text-positive')
    expect(within(up as HTMLElement).getByText('▲').getAttribute('aria-hidden')).toBe('true')
    expect(within(up as HTMLElement).getByText('늘어남', { exact: false }).className).toContain('sr-only')
    const down = itemOf('연령대', '10세 미만').children[4]!
    expect(down.textContent).toBe('▼10% 줄어듦')
    expect(down.className).toContain('text-negative')
    expect(itemOf('동네', '영통구').children[4]!.textContent).toBe('▼10% 줄어듦')
  })

  it('AC-2703.9: 0%·새로·–는 흐린 글씨이고 화면 읽기 글이 "변화 없음"·"지난 기간에 없던 줄"이다', () => {
    draw(ready())
    const cases: [string, string, string][] = [
      ['연령대', '10대', '0% 변화 없음'],
      ['보험', '차상위', '새로 지난 기간에 없던 줄'],
      ['연령대', '80세 이상', '– 변화 없음'],
    ]
    for (const [list, label, text] of cases) {
      const cell = itemOf(list, label).children[4]!
      expect(cell.textContent, label).toBe(text)
      expect(cell.className, label).toContain('text-muted')
      expect(cell.className, label).not.toMatch(/text-positive|text-negative/)
    }
  })

  it('AC-2703.9: 생년월일 없음·그 밖 N곳·동 없는 주소·주소 없음 줄은 증감 칸이 비어 있다', () => {
    draw(ready())
    expect(itemOf('연령대', '생년월일 없음').children[4]!.textContent).toBe('')
    expect(itemOf('동네', '그 밖 23곳').children[4]!.textContent).toBe('')
    expect(itemOf('동네', '주소 없음').children[4]!.textContent).toBe('')
    openTab('동네')
    press('동네 단위', '동')
    expect(itemOf('동네', '동 없는 주소').children[4]!.textContent).toBe('')
  })

  it('AC-2703.9·AC-4412.4: 견주지 못했으면 아래 글이 견주지 못함 글이고 줄에 증감 칸이 없다', () => {
    const notCompared = (mix: PatientMix): PatientMix => ({
      ...mix,
      compared: false,
      age: mix.age.map((one) => ({ ...one, previous: null })),
      insurance: mix.insurance.map((one) => ({ ...one, previous: null })),
      city: mix.city.map((one) => ({ ...one, previous: null })),
      town: mix.town.map((one) => ({ ...one, previous: null })),
    })
    draw(ready(notCompared(ALL), notCompared(NEW)))
    const foot = screen.getByText(NO_PREVIOUS)
    expect(panelOf('동네').nextElementSibling).toBe(foot)
    expect(screen.queryByText(/견줬어요|견줘요 · 명 기준/)).toBeNull()
    const health = itemOf('보험', '건강보험')
    expect(health.children).toHaveLength(4)
    expect(section().textContent).not.toMatch(/[▲▼]|늘어남|줄어듦|변화 없음|새로/)
  })
})

describe('AC-2707.1 [표 복사]', () => {
  it('AC-2707.1: 처음은 formatPatientMix(병원 이름, 기간 글자, 전체, 구·시) 글이고 복사되면 "복사했어요"다', async () => {
    const writeText = fakeClipboard()
    draw(ready())
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(formatPatientMix(HOSPITAL, R30.label, 'all', 'city', ALL))
    expect(screen.getAllByText('복사했어요').length).toBeGreaterThan(0)
  })

  it('AC-2707.1·AC-4412.4: [신환]·[동]을 고르면 그 숫자·묶음의 글이다(화면에 보이는 것 그대로, 고른 탭과는 상관없다)', async () => {
    const writeText = fakeClipboard()
    draw(ready())
    press('누구를 셀까', '신환')
    openTab('동네')
    press('동네 단위', '동')
    openTab('보험')
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: '표 복사' }))
    })
    expect(writeText).toHaveBeenCalledWith(formatPatientMix(HOSPITAL, R30.label, 'new', 'town', NEW))
    expect((writeText.mock.calls[0] as unknown as [string])[0].split('\n')[0]).toBe(`${HOSPITAL} 환자 구성 (${R30.label}, 신환)`)
  })
})

describe('AC-2706.5·AC-2706.6 숫자가 없을 때', () => {
  it.each<[string, BitSectionsShown, string]>([
    ['이 기기에서 불러오지 않음', null, '비트 PC에서 불러오면 보여요 · 진료 줄은 서버에 저장하지 않아서, 비트 PC에서 불러온 화면에서만 볼 수 있어요.'],
    ['불러온 범위 밖(none)', { kind: 'none' }, '이 기간은 아직 불러오지 않았어요 · 이 기간을 고른 채 [비트에서 불러오기]를 누르면 보여요.'],
    [
      '옛 도우미(old-helper)',
      { kind: 'old-helper' },
      '도우미를 업데이트하면 보여요 · 새 도우미가 나이·보험·동네·접수 시각·원장님을 함께 읽어 와요. 비트 PC 연결 화면에서 업데이트할 수 있어요.',
    ],
  ])('AC-2706.5: %s → 제목만 두고 안내 한 줄(EmptyNote)이다', (_name, view, text) => {
    draw(view)
    const body = section()
    expect(body.querySelector('p')!.textContent).toBe(text)
    expect(body.textContent).not.toContain('어떤 분들이 오시는지')
    expect(within(body).queryByRole('button')).toBeNull()
    expect(within(body).queryByRole('list')).toBeNull()
    expect(within(body).queryByRole('tablist')).toBeNull()
  })

  it('AC-2706.6: 고른 기간에 접수가 하나도 없으면 "이 기간에 불러온 접수가 없어요."다', () => {
    const empty = (mix: PatientMix): PatientMix => ({ ...mix, total: { people: 0, visits: 0 } })
    draw(ready(empty(ALL), empty(NEW)))
    expect(section().querySelector('p')!.textContent).toBe('자료 없음 · 이 기간에 불러온 접수가 없어요.')
    expect(within(section()).queryByRole('button')).toBeNull()
  })

  it('AC-2706.1·AC-4412.4: 이 기간 답을 기다리는 동안은 제목·설명만이다(지금 안내 그대로)', () => {
    draw('waiting')
    expect(section().textContent).toBe('환자 구성어떤 분들이 오시는지 · 최근 30일')
  })
})
