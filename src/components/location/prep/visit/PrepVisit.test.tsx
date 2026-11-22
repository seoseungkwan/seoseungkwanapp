// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { IROS_URL } from '@/lib/location/links'
import type { CandidateStatus, LocationNote } from '@/types/location'
import { PHOTO_LIMIT, PrepVisit, type PrepVisitProps, type VisitPhoto } from './PrepVisit'

// 개원 준비 — 건물 요건·계약 전 위험·보러 갈 때 점검표·사진·진행 메모·진행 상태
// (spec location REQ-7913 AC-7913.3·AC-7913.4·AC-7913.5, design.md 11·14·15절, 시안 docs/mockups/location/index.html ?s=plan).
// 줄 글은 design.md 11절·requirements '화면 글 기본값'을 손으로 옮겨 적어 견준다(시안 글과 다른 곳은 명세가 이긴다).
// 부품은 props·콜백만 받는다: 저장·사진 올리기·줄이기(shrinkPhoto 모양)는 모두 부모가 준 콜백이다. 이름·글은 지어낸 값만

afterEach(cleanup)

const TODAY = '2026-11-22'
const CAND_A = 'c0000000-0000-4000-8000-00000000000a'
const CAND_B = 'c0000000-0000-4000-8000-00000000000b'

const photo = (i: number, over: Partial<VisitPhoto> = {}): VisitPhoto => ({ id: `p-${i}`, label: `예시 사진 ${i}`, takenOn: '2026-11-21', url: null, ...over })
const note = (id: string, day: string, body: string, createdAt = `${day}T09:00:00+09:00`): LocationNote => ({
  id,
  candidateId: CAND_A,
  day,
  body,
  createdAt,
})

function setup(over: Partial<PrepVisitProps> = {}) {
  const props: PrepVisitProps = {
    candidate: { id: CAND_A, status: 'watching', checks: {}, terms: {} },
    photos: [],
    notes: [],
    today: TODAY,
    onChecks: vi.fn(),
    onTerms: vi.fn(),
    onStatus: vi.fn(),
    shrink: vi.fn(async (file: Blob) => new Blob([file], { type: 'image/jpeg' })),
    onAddPhoto: vi.fn(async () => undefined),
    onDeletePhoto: vi.fn(async () => undefined),
    onAddNote: vi.fn(async () => undefined),
    onDeleteNote: vi.fn(async () => undefined),
    ...over,
  }
  const view = render(<PrepVisit {...props} />)
  return { props, ...view }
}

const sectionOf = (title: string) => screen.getByRole('region', { name: title })
const lastCall = <T,>(fn: unknown): T => {
  const calls = (fn as ReturnType<typeof vi.fn>).mock.calls
  return calls[calls.length - 1]![0] as T
}
const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]')!
const jpegFile = (name: string) => new File([new Uint8Array([0xff, 0xd8, 0xff, 0x00])], name, { type: 'image/jpeg' })

// design.md 11절 BUILDING_CHECKS — [요건, 있어야 하는 것, 법 근거 칸 글(LAW_BASIS 이름 또는 법 기준 없음 글)]
const NO_LAW = '법 기준 없음 — 관리사무소에 물어요'
const BUILDING: readonly (readonly [string, string, string])[] = [
  ['엑스레이실 방사선 막는 벽', '벽·문에 납을 넣는 공사, 설치 뒤 검사', '방사선 장치'],
  ['전기 용량', '엑스레이·물리치료 기계를 함께 켤 만큼(장비 업체에 물어 정해요)', NO_LAW],
  ['천장 높이', '엑스레이 기계를 달 높이(장비 업체 기준)', NO_LAW],
  ['바닥이 견디는 무게', '엑스레이·견인 치료기 무게', NO_LAW],
  ['장애인 경사로·출입구', '건물 입구에 턱이 없거나 경사로', '장애인 편의시설'],
  ['장애인 화장실', '의원 넓이가 500㎡ 이상이면 꼭 있어야 해요', '장애인 편의시설'],
  ['화장실', '층 안에 남녀 따로', NO_LAW],
  ['엘리베이터', '휠체어·들것이 들어가는 크기', NO_LAW],
  ['건물 용도', '제1종 근린생활시설(의원) 또는 의료시설', '건물 용도'],
  ['보건소 신고 조건', '시설 기준대로 방을 나눔 · 위반 건축물이면 막힐 수 있어요', '의원 개설 신고'],
]
const BUILDING_LAW_HREF: Readonly<Record<string, string>> = {
  '엑스레이실 방사선 막는 벽': '/location?tab=sources#law-xray',
  '장애인 경사로·출입구': '/location?tab=sources#law-bf',
  '장애인 화장실': '/location?tab=sources#law-bf',
  '건물 용도': '/location?tab=sources#law-use',
  '보건소 신고 조건': '/location?tab=sources#law-open',
}
// design.md 11절 RISK_CHECKS · VISIT_CHECKS
const CLAUSES = [
  '의원 개설 신고가 안 되면 계약을 없던 일로 해요(특약)',
  '무상 기간이 공사 기간과 장비 설치까지 들어가요',
  '나갈 때 원상 복구 범위(방사선 벽·바닥)를 적어요',
  '권리금 계약서를 따로 써요',
  '전기 용량 늘리는 공사를 누가 하고 누가 내는지 적어요',
]
const VISIT = [
  '길 건너에서 간판 자리가 보여요',
  '1층 입구에 턱이 없거나 경사로가 있어요',
  '엘리베이터에 휠체어·들것이 들어가요',
  '층 안에 남녀 화장실이 따로 있어요',
  '천장 높이를 쟀어요(엑스레이 기계)',
  '배전반 사진을 찍었어요(전기 용량)',
  '창문 방향·햇빛·바깥 소리를 봤어요',
  '주차장 들어가는 길이 어르신에게 쉬워요',
  '평일 낮과 저녁에 지나가는 사람을 봤어요',
  '같은 건물 가게에 관리비·관리 상태를 물어봤어요',
]
// 시안 계약 전 위험 › 등기부 확인 다섯 줄
const REGI = [
  '인터넷등기소에서 건물 등기부를 떼요. 한 통에 몇백 원이고 누구나 뗄 수 있어요.',
  '소유자 이름이 계약하는 사람(건물주)과 같은지 봐요.',
  '근저당(건물을 맡기고 빌린 돈)이 얼마인지 봐요. 보증금보다 많이 잡혀 있으면 보증금을 못 돌려받을 수 있어요.',
  '압류·가압류·경매 글자가 있으면 계약하지 않아요.',
  '계약하는 날 한 번 더 떼서 그사이 바뀐 것이 없는지 봐요.',
]
const IROS_HELP =
  '인터넷등기소 첫 화면이 새 창으로 열려요(주소는 거기서 직접 넣어요). 이 앱은 등기부를 받아 오지 않고 링크만 걸어요. 첫 화면에서 보안 프로그램을 깔라고 할 수 있어요.'

const buildingRows = () => within(sectionOf('건물 요건 표')).getAllByRole('row').slice(1)
const cellTexts = (row: HTMLElement) => within(row).getAllByRole('cell').map((td) => td.textContent?.replace(/\s+/g, ' ').trim() ?? '')
const ox = (label: string, state: '됨' | '안 됨' | '모름') => screen.getByRole('button', { name: `${label}: ${state} (누르면 바뀜)` })
const howBox = (label: string) => screen.getByRole('textbox', { name: `${label} 어떻게 알았나` })

describe('AC-7913.5: 점검 셋 줄 글(design.md 11절 그대로)', () => {
  it('AC-7913.5: 건물 요건 표는 머리 다섯과 10줄(요건·있어야 하는 것·이 자리·어떻게 알았나·법 근거)이고 곁글이 있다', () => {
    setup()
    const section = sectionOf('건물 요건 표')
    expect(within(section).getAllByRole('columnheader').map((th) => th.textContent)).toEqual(['요건', '있어야 하는 것', '이 자리', '어떻게 알았나', '법 근거'])
    expect(within(section).getByText('○ 됨 · ✕ 안 됨 · ? 모름 — 칸을 누르면 바뀌어요')).toBeTruthy()
    const rows = buildingRows()
    expect(rows).toHaveLength(10)
    rows.forEach((row, i) => {
      const [label, need, law] = BUILDING[i]!
      const cells = cellTexts(row)
      expect(cells[0], label).toBe(label)
      expect(cells[1], label).toBe(need)
      expect(cells[2], label).toBe('?')
      expect(cells[4], label).toBe(law)
    })
  })

  it('AC-7913.5: 계약서에 꼭 넣을 것 5줄·보러 갈 때 10줄은 체크 칸이고 글이 차례 그대로다', () => {
    setup()
    const risk = sectionOf('계약 전 위험')
    expect(within(risk).getByText('계약서에 꼭 넣을 것')).toBeTruthy()
    expect(within(risk).getAllByRole('checkbox').map((c) => c.getAttribute('aria-label') ?? (c.closest('label')?.textContent ?? ''))).toEqual(CLAUSES)
    const visit = sectionOf('보러 갈 때 점검표')
    expect(within(visit).getAllByRole('checkbox').map((c) => c.closest('label')?.textContent ?? '')).toEqual(VISIT)
    for (const text of [...CLAUSES, ...VISIT]) expect((screen.getByRole('checkbox', { name: text }) as HTMLInputElement).checked).toBe(false)
  })

  it('AC-7913.5: 위반 건축물은 점검 줄이 아니다(고르는 칸·체크 칸 이름에 없다)', () => {
    setup()
    const names = [...screen.getAllByRole('button'), ...screen.getAllByRole('checkbox')].map((el) => el.getAttribute('aria-label') ?? el.closest('label')?.textContent ?? el.textContent ?? '')
    expect(names.filter((n) => n.includes('위반 건축물'))).toEqual([])
    expect(screen.getAllByRole('button', { name: /\(누르면 바뀜\)$/ })).toHaveLength(10)
  })

  it('AC-7913.5: 어떻게 알았나 글은 줄마다 40자 — 적고 칸을 떠나면 checks.how로 저장하고, 41자는 40자로 자른다', () => {
    const { props } = setup()
    const box = howBox('전기 용량')
    expect(box.getAttribute('maxlength')).toBe('40')
    fireEvent.change(box, { target: { value: '관리사무소에 물음 — 지금 30킬로와트' } })
    expect(props.onChecks).not.toHaveBeenCalled()
    fireEvent.blur(box)
    expect(props.onChecks).toHaveBeenCalledTimes(1)
    expect(lastCall(props.onChecks)).toEqual({ how: { 'b-power': '관리사무소에 물음 — 지금 30킬로와트' } })

    const long = '가'.repeat(41)
    fireEvent.change(howBox('천장 높이'), { target: { value: long } })
    expect((howBox('천장 높이') as HTMLInputElement).value).toBe('가'.repeat(40))
    fireEvent.blur(howBox('천장 높이'))
    expect(lastCall(props.onChecks)).toEqual({ how: { 'b-power': '관리사무소에 물음 — 지금 30킬로와트', 'b-ceiling': '가'.repeat(40) } })
  })

  it('AC-7913.5: 글을 바꾸지 않고 칸을 떠나면 저장하지 않는다', () => {
    const { props } = setup()
    fireEvent.focus(howBox('화장실'))
    fireEvent.blur(howBox('화장실'))
    expect(props.onChecks).not.toHaveBeenCalled()
  })

  it('AC-7913.5: 저장된 어떻게 알았나 글과 ○·✕ 값이 칸에 보인다', () => {
    setup({
      candidate: {
        id: CAND_A,
        status: 'watching',
        checks: { 'b-power': 'no', 'b-ramp': 'yes', how: { 'b-power': '지금 30킬로와트 — 늘려야 해요', 'b-ramp': '1층 입구에 경사로 있음' } },
        terms: {},
      },
    })
    expect((howBox('전기 용량') as HTMLInputElement).value).toBe('지금 30킬로와트 — 늘려야 해요')
    expect((howBox('장애인 경사로·출입구') as HTMLInputElement).value).toBe('1층 입구에 경사로 있음')
    expect(ox('전기 용량', '안 됨').textContent).toBe('✕')
    expect(ox('장애인 경사로·출입구', '됨').textContent).toBe('○')
  })

  it('AC-7913.5: 임대 조건 메모(300자)는 칸을 떠나면 terms.memo로 저장하고 협상표 칸은 그대로 둔다', () => {
    const terms = { freeRent: { now: '2개월', want: '3개월' }, memo: '' }
    const { props } = setup({ candidate: { id: CAND_A, status: 'watching', checks: {}, terms } })
    const memo = screen.getByRole('textbox', { name: '임대 조건 메모' })
    expect(memo.tagName).toBe('TEXTAREA')
    expect(memo.getAttribute('maxlength')).toBe('300')
    expect(memo.getAttribute('placeholder')).toBe('중개사와 말한 것, 건물주에게 물을 것')
    fireEvent.change(memo, { target: { value: '무상 기간 3개월 다시 물어보기' } })
    fireEvent.blur(memo)
    expect(props.onTerms).toHaveBeenCalledTimes(1)
    expect(lastCall(props.onTerms)).toEqual({ freeRent: { now: '2개월', want: '3개월' }, memo: '무상 기간 3개월 다시 물어보기' })

    fireEvent.change(memo, { target: { value: '나'.repeat(301) } })
    fireEvent.blur(memo)
    expect(lastCall<{ memo: string }>(props.onTerms).memo).toBe('나'.repeat(300))
  })

  it('AC-7913.5: 저장된 임대 조건 메모가 보이고, 바꾸지 않고 떠나면 저장하지 않는다', () => {
    const { props } = setup({ candidate: { id: CAND_A, status: 'watching', checks: {}, terms: { memo: '전기 증설 비용 건물주와 반반?' } } })
    const memo = screen.getByRole('textbox', { name: '임대 조건 메모' }) as HTMLTextAreaElement
    expect(memo.value).toBe('전기 증설 비용 건물주와 반반?')
    fireEvent.blur(memo)
    expect(props.onTerms).not.toHaveBeenCalled()
  })

  it('AC-7913.5: 임대 조건 메모 아래에 협상표(매물)에 적은 앞 세 줄(바라는 것, 없으면 지금 제안, 없으면 –)이 보인다', () => {
    setup({
      candidate: {
        id: CAND_A,
        status: 'watching',
        checks: {},
        terms: { freeRent: { now: '2개월', want: '3개월' }, mgmt: { now: '', want: '' }, raise: { now: '해마다 5%', want: '' }, restore: { now: '전부', want: '빼기' } },
      },
    })
    expect(within(sectionOf('계약 전 위험')).getByText('임대 조건 협상표(매물)에 적은 것: 무상 기간 3개월 · 관리비 – · 월세 올리는 비율 해마다 5% …')).toBeTruthy()
  })

  it('AC-7913.5: 적던 글은 화면이 닫힐 때도 저장한다(어떻게 알았나·임대 조건 메모)', () => {
    const { props, unmount } = setup()
    fireEvent.change(howBox('엘리베이터'), { target: { value: '비상용 1대가 침대 크기' } })
    fireEvent.change(screen.getByRole('textbox', { name: '임대 조건 메모' }), { target: { value: '원상 복구 범위 다시 묻기' } })
    unmount()
    expect(lastCall(props.onChecks)).toEqual({ how: { 'b-elevator': '비상용 1대가 침대 크기' } })
    expect(lastCall(props.onTerms)).toEqual({ memo: '원상 복구 범위 다시 묻기' })
  })
})

describe('AC-7913.3: 고르면 저장 · 법 근거 · 등기부 안내', () => {
  it('AC-7913.3: 건물 요건 칸은 처음 모름(?)이고 누를 때마다 ○ → ✕ → ? 로 바뀌며 그때마다 checks를 저장한다', () => {
    const { props } = setup()
    fireEvent.click(ox('천장 높이', '모름'))
    expect(ox('천장 높이', '됨').textContent).toBe('○')
    expect(lastCall(props.onChecks)).toEqual({ 'b-ceiling': 'yes' })
    fireEvent.click(ox('천장 높이', '됨'))
    expect(ox('천장 높이', '안 됨').textContent).toBe('✕')
    expect(lastCall(props.onChecks)).toEqual({ 'b-ceiling': 'no' })
    fireEvent.click(ox('천장 높이', '안 됨'))
    expect(ox('천장 높이', '모름').textContent).toBe('?')
    expect(lastCall(props.onChecks)).toEqual({ 'b-ceiling': 'unknown' })
    expect(props.onChecks).toHaveBeenCalledTimes(3)
  })

  it('AC-7913.3: 표 아래에 ○·✕·? 수가 보이고 고를 때 바로 바뀐다', () => {
    setup({ candidate: { id: CAND_A, status: 'watching', checks: { 'b-xray': 'yes', 'b-load': 'no' }, terms: {} } })
    const section = sectionOf('건물 요건 표')
    expect(within(section).getByText('○ 1 · ✕ 1 · ? 8')).toBeTruthy()
    fireEvent.click(ox('화장실', '모름'))
    expect(within(section).getByText('○ 2 · ✕ 1 · ? 7')).toBeTruthy()
  })

  it('AC-7913.3: 고를 때 저장하는 checks는 다른 줄 값과 적던 어떻게 알았나 글을 함께 담는다(cleanChecks 모양)', () => {
    const { props } = setup({ candidate: { id: CAND_A, status: 'watching', checks: { 'b-xray': 'yes', 'x-old': 'yes', how: { 'b-xray': '도면으로 봄' } }, terms: {} } })
    fireEvent.change(howBox('바닥이 견디는 무게'), { target: { value: '구조 계산서를 받아요' } })
    fireEvent.click(ox('바닥이 견디는 무게', '모름'))
    expect(lastCall(props.onChecks)).toEqual({ 'b-xray': 'yes', 'b-load': 'yes', how: { 'b-xray': '도면으로 봄', 'b-load': '구조 계산서를 받아요' } })
  })

  it('AC-7913.3: 계약서·보러 갈 때 체크 칸은 켜면 yes·끄면 unknown으로 저장하고, 보러 갈 때 곁글 {n} / 10 했어요가 바뀐다', () => {
    const { props } = setup()
    const visit = sectionOf('보러 갈 때 점검표')
    expect(within(visit).getByText('0 / 10 했어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: '배전반 사진을 찍었어요(전기 용량)' }))
    expect(lastCall(props.onChecks)).toEqual({ 'v-panel': 'yes' })
    expect(within(visit).getByText('1 / 10 했어요')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: '권리금 계약서를 따로 써요' }))
    expect(lastCall(props.onChecks)).toEqual({ 'v-panel': 'yes', 'r-premium': 'yes' })
    fireEvent.click(screen.getByRole('checkbox', { name: '배전반 사진을 찍었어요(전기 용량)' }))
    expect(lastCall(props.onChecks)).toEqual({ 'v-panel': 'unknown', 'r-premium': 'yes' })
    expect(within(visit).getByText('0 / 10 했어요')).toBeTruthy()
  })

  it('AC-7913.3: 저장된 체크 값(yes)은 켜진 채로 보인다', () => {
    setup({ candidate: { id: CAND_A, status: 'watching', checks: { 'r-cancel': 'yes', 'v-sign': 'yes', 'v-mgmt': 'unknown' }, terms: {} } })
    expect((screen.getByRole('checkbox', { name: CLAUSES[0]! }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: VISIT[0]! }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: VISIT[9]! }) as HTMLInputElement).checked).toBe(false)
    expect(within(sectionOf('보러 갈 때 점검표')).getByText('1 / 10 했어요')).toBeTruthy()
  })

  it('AC-7913.3: 법 근거는 LAW_BASIS 이름으로 근거와 출처의 그 줄(#law-<id>)로 가고, 법이 없는 줄은 법 기준 없음 글이다', () => {
    setup()
    for (const row of buildingRows()) {
      const label = cellTexts(row)[0]!
      const links = within(row).queryAllByRole('link')
      if (BUILDING_LAW_HREF[label]) {
        expect(links.map((a) => a.getAttribute('href')), label).toEqual([BUILDING_LAW_HREF[label]])
      } else {
        expect(links, label).toEqual([])
      }
    }
    // 체크 칸 줄도 법 id가 있으면 근거가 보인다(계약 특약 → 의원 개설 신고, 1층 입구 → 장애인 편의시설)
    const risk = sectionOf('계약 전 위험')
    expect(within(risk).getByRole('link', { name: '의원 개설 신고' }).getAttribute('href')).toBe('/location?tab=sources#law-open')
    const visit = sectionOf('보러 갈 때 점검표')
    expect(within(visit).getAllByRole('link').map((a) => [a.textContent, a.getAttribute('href')])).toEqual([['장애인 편의시설', '/location?tab=sources#law-bf']])
  })

  it('AC-7913.3: onOpenLaw를 주면 법 근거를 그냥 누를 때 주소 이동 대신 그 법 id로 부른다', () => {
    const onOpenLaw = vi.fn()
    setup({ onOpenLaw })
    const link = within(buildingRows()[0]!).getByRole('link', { name: '방사선 장치' })
    fireEvent.click(link)
    expect(onOpenLaw).toHaveBeenCalledWith('xray')
  })

  it('AC-7913.3: 계약 전 위험에 등기부 확인 다섯 줄과 [인터넷등기소 바로 가기](첫 화면 · 새 창 · noopener noreferrer)·도움 글이 있다', () => {
    setup()
    const risk = sectionOf('계약 전 위험')
    expect(within(risk).getByText('등기부 확인 — 계약하기 전에 꼭')).toBeTruthy()
    const steps = within(risk).getAllByRole('listitem').map((li) => li.textContent?.replace(/\s+/g, ' ').trim())
    expect(steps).toEqual(REGI)
    const link = within(risk).getByRole('link', { name: '인터넷등기소 바로 가기' })
    expect(link.getAttribute('href')).toBe(IROS_URL)
    expect(link.getAttribute('href')).toBe('https://www.iros.go.kr/index.jsp')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(risk).getByText(IROS_HELP)).toBeTruthy()
  })

  it('AC-7913.3: 다른 후보로 바뀌면 그 후보의 값으로 다시 그린다', () => {
    const { props, rerender } = setup({ candidate: { id: CAND_A, status: 'watching', checks: { 'b-use': 'yes', how: { 'b-use': '건축물대장' } }, terms: { memo: '가 메모' } } })
    expect(ox('건물 용도', '됨')).toBeTruthy()
    rerender(<PrepVisit {...props} candidate={{ id: CAND_B, status: 'contacted', checks: { 'b-use': 'no' }, terms: { memo: '나 메모' } }} />)
    expect(ox('건물 용도', '안 됨')).toBeTruthy()
    expect((howBox('건물 용도') as HTMLInputElement).value).toBe('')
    expect((screen.getByRole('textbox', { name: '임대 조건 메모' }) as HTMLTextAreaElement).value).toBe('나 메모')
  })
})

describe('AC-7913.4: 사진(브라우저가 줄인 JPEG · 후보마다 30장 · 지우기)', () => {
  it('AC-7913.4: 사진 수·이 후보에만 붙어요와 사진마다 이름·찍은 날이 보이고, 주소가 있으면 그림을 그린다', () => {
    setup({ photos: [photo(1, { label: '입구', url: 'blob:예시-1' }), photo(2, { label: '3층 복도', takenOn: null })] })
    const visit = sectionOf('보러 갈 때 점검표')
    expect(within(visit).getByText('2장 · 이 후보에만 붙어요')).toBeTruthy()
    const img = within(visit).getByRole('img', { name: '입구' })
    expect(img.getAttribute('src')).toBe('blob:예시-1')
    expect(within(visit).getByText('11월 21일')).toBeTruthy()
    expect(within(visit).getByText('3층 복도')).toBeTruthy()
    expect(within(visit).getByRole('button', { name: '사진 올리기' })).toBeTruthy()
  })

  it('AC-7913.4: [사진 올리기]는 사진 파일 고르기 칸(JPEG·PNG·WEBP, 여러 장)을 연다', () => {
    const { container } = setup()
    const input = fileInput(container)
    expect(input.getAttribute('accept')).toBe('image/jpeg,image/png,image/webp')
    expect(input.multiple).toBe(true)
    const click = vi.spyOn(input, 'click').mockImplementation(() => undefined)
    fireEvent.click(screen.getByRole('button', { name: '사진 올리기' }))
    expect(click).toHaveBeenCalledTimes(1)
  })

  it('AC-7913.4: 사진을 고르면 shrink로 줄인 JPEG를 하나씩 이름(확장자 뺌, 40자까지)·오늘 날짜로 올린다', async () => {
    const shrunk = [new Blob(['a'], { type: 'image/jpeg' }), new Blob(['b'], { type: 'image/jpeg' })]
    const shrink = vi.fn<(file: Blob) => Promise<Blob | null>>().mockResolvedValueOnce(shrunk[0]!).mockResolvedValueOnce(shrunk[1]!)
    const { props, container } = setup({ shrink })
    const files = [jpegFile('배전반.jpg'), jpegFile(`${'다'.repeat(45)}.png`)]
    fireEvent.change(fileInput(container), { target: { files } })
    await waitFor(() => expect(props.onAddPhoto).toHaveBeenCalledTimes(2))
    expect(shrink.mock.calls.map((c) => c[0])).toEqual(files)
    expect((props.onAddPhoto as ReturnType<typeof vi.fn>).mock.calls).toEqual([
      [shrunk[0], { label: '배전반', takenOn: TODAY }],
      [shrunk[1], { label: '다'.repeat(40), takenOn: TODAY }],
    ])
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7913.4: 30장을 넘기면 넘는 사진은 올리지 않고 E-LOC-PHOTO를 보인다', async () => {
    expect(PHOTO_LIMIT).toBe(30)
    const photos = Array.from({ length: 29 }, (_, i) => photo(i))
    const { props, container } = setup({ photos })
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('하나.jpg'), jpegFile('둘.jpg'), jpegFile('셋.jpg')] } })
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('사진을 올리지 못했어요')
    expect(alert.textContent).toContain('후보마다 30장까지 올릴 수 있어요')
    expect(alert.textContent).toContain('E-LOC-PHOTO')
    expect(props.onAddPhoto).toHaveBeenCalledTimes(1)
    expect(lastCall<Blob>(props.onAddPhoto)).toBeInstanceOf(Blob)
    expect((props.onAddPhoto as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ label: '하나', takenOn: TODAY })
  })

  it('AC-7913.4: 이미 30장이면 하나도 줄이거나 올리지 않고 E-LOC-PHOTO', async () => {
    const photos = Array.from({ length: 30 }, (_, i) => photo(i))
    const { props, container } = setup({ photos })
    expect(within(sectionOf('보러 갈 때 점검표')).getByText('30장 · 이 후보에만 붙어요')).toBeTruthy()
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('넷.jpg')] } })
    expect((await screen.findByRole('alert')).textContent).toContain('E-LOC-PHOTO')
    expect(props.shrink).not.toHaveBeenCalled()
    expect(props.onAddPhoto).not.toHaveBeenCalled()
  })

  it('AC-7913.4: 줄이지 못한 사진(null)은 건너뛰고 E-LOC-PHOTO, 나머지는 올린다', async () => {
    const shrink = vi.fn<(file: Blob) => Promise<Blob | null>>().mockResolvedValueOnce(null).mockResolvedValueOnce(new Blob(['b'], { type: 'image/jpeg' }))
    const { props, container } = setup({ shrink })
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('흐림.gif'), jpegFile('입구.jpg')] } })
    expect((await screen.findByRole('alert')).textContent).toContain('E-LOC-PHOTO')
    expect(props.onAddPhoto).toHaveBeenCalledTimes(1)
    expect((props.onAddPhoto as ReturnType<typeof vi.fn>).mock.calls[0]![1]).toEqual({ label: '입구', takenOn: TODAY })
  })

  it('AC-7913.4: 올리기 콜백이 실패하면 E-LOC-PHOTO, 다음에 잘 올리면 글이 사라진다', async () => {
    const onAddPhoto = vi.fn<PrepVisitProps['onAddPhoto']>().mockRejectedValueOnce(new Error('E-LOC-PHOTO')).mockResolvedValueOnce(undefined)
    const { container } = setup({ onAddPhoto })
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('하나.jpg')] } })
    expect((await screen.findByRole('alert')).textContent).toContain('E-LOC-PHOTO')
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('둘.jpg')] } })
    await waitFor(() => expect(onAddPhoto).toHaveBeenCalledTimes(2))
    await waitFor(() => expect(screen.queryByRole('alert')).toBeNull())
  })

  it('AC-7913.4: 사진마다 [지우기]는 그 사진 id로 onDeletePhoto를 부르고, 실패하면 E-LOC-SAVE-FAILED', async () => {
    const onDeletePhoto = vi.fn<PrepVisitProps['onDeletePhoto']>().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('x'))
    setup({ photos: [photo(1, { label: '입구' }), photo(2, { label: '배전반' })], onDeletePhoto })
    fireEvent.click(screen.getByRole('button', { name: '배전반 사진 지우기' }))
    expect(onDeletePhoto).toHaveBeenCalledWith('p-2')
    fireEvent.click(screen.getByRole('button', { name: '입구 사진 지우기' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('저장하지 못했어요')
    expect(alert.textContent).toContain('E-LOC-SAVE-FAILED')
  })
})

describe('AC-7913.4: 진행 메모(날짜별)', () => {
  const NOTES = [
    note('n-1', '2026-11-12', '네이버 부동산에서 보고 매물 붙여 넣음.'),
    note('n-2', '2026-11-21', '보러 감 — 3층 창이 커서 밝아요.'),
    note('n-3', '2026-11-18', '중개사 김예시와 통화 — 무상 기간 2개월까지 된대요.'),
    note('n-4', '2026-11-21', '관리사무소에 전기 용량을 물었어요.', '2026-11-21T18:00:00+09:00'),
  ]
  const memoRows = () => within(within(sectionOf('진행 메모')).getByRole('list')).getAllByRole('listitem')

  it('AC-7913.4: 메모는 날짜가 새것이 위(같은 날은 나중에 적은 것이 위)이고 날짜·글이 보인다, 곁글 날짜별 · 새것이 위', () => {
    setup({ notes: NOTES })
    const section = sectionOf('진행 메모')
    expect(within(section).getByText('날짜별 · 새것이 위')).toBeTruthy()
    expect(memoRows().map((li) => [li.querySelector('time')?.textContent, li.querySelector('p')?.textContent])).toEqual([
      ['2026-11-21', '관리사무소에 전기 용량을 물었어요.'],
      ['2026-11-21', '보러 감 — 3층 창이 커서 밝아요.'],
      ['2026-11-18', '중개사 김예시와 통화 — 무상 기간 2개월까지 된대요.'],
      ['2026-11-12', '네이버 부동산에서 보고 매물 붙여 넣음.'],
    ])
  })

  it('AC-7913.4: 날짜(처음 오늘)와 글을 적어 [메모 더하기]하면 onAddNote를 부르고 글 칸을 비운다', async () => {
    const { props } = setup()
    const date = screen.getByLabelText('메모 날짜') as HTMLInputElement
    expect(date.type).toBe('date')
    expect(date.value).toBe(TODAY)
    const text = screen.getByRole('textbox', { name: '메모' }) as HTMLInputElement
    expect(text.getAttribute('placeholder')).toBe('예: 중개사와 통화 — 무상 기간 3개월 됨')
    expect(text.getAttribute('maxlength')).toBe('500')
    fireEvent.change(date, { target: { value: '2026-11-20' } })
    fireEvent.change(text, { target: { value: '  중개사와 통화 — 무상 기간 3개월 됨  ' } })
    fireEvent.click(screen.getByRole('button', { name: '메모 더하기' }))
    await waitFor(() => expect(props.onAddNote).toHaveBeenCalledWith({ day: '2026-11-20', body: '중개사와 통화 — 무상 기간 3개월 됨' }))
    await waitFor(() => expect(text.value).toBe(''))
  })

  it('AC-7913.4: 날짜 칸을 비우면 오늘 날짜로 적는다', async () => {
    const { props } = setup()
    fireEvent.change(screen.getByLabelText('메모 날짜'), { target: { value: '' } })
    fireEvent.change(screen.getByRole('textbox', { name: '메모' }), { target: { value: '후보로 저장.' } })
    fireEvent.click(screen.getByRole('button', { name: '메모 더하기' }))
    await waitFor(() => expect(props.onAddNote).toHaveBeenCalledWith({ day: TODAY, body: '후보로 저장.' }))
  })

  it('AC-7913.4: 빈 글이면 부르지 않고 메모를 적어 주세요.를 보인다', () => {
    const { props } = setup()
    fireEvent.change(screen.getByRole('textbox', { name: '메모' }), { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: '메모 더하기' }))
    expect(props.onAddNote).not.toHaveBeenCalled()
    expect(within(sectionOf('진행 메모')).getByText('메모를 적어 주세요.')).toBeTruthy()
  })

  it('AC-7913.4: 메모 저장이 실패하면 E-LOC-SAVE-FAILED를 보이고 적은 글은 그대로 둔다', async () => {
    const onAddNote = vi.fn<PrepVisitProps['onAddNote']>().mockRejectedValue(new Error('E-LOC-SAVE-FAILED'))
    setup({ onAddNote })
    const text = screen.getByRole('textbox', { name: '메모' }) as HTMLInputElement
    fireEvent.change(text, { target: { value: '건물주와 통화' } })
    fireEvent.click(screen.getByRole('button', { name: '메모 더하기' }))
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('저장하지 못했어요')
    expect(alert.textContent).toContain('E-LOC-SAVE-FAILED')
    expect(text.value).toBe('건물주와 통화')
  })

  it('AC-7913.4: 메모마다 [지우기]는 그 메모 id로 onDeleteNote를 부른다', () => {
    const { props } = setup({ notes: NOTES })
    const row = memoRows()[2]!
    fireEvent.click(within(row).getByRole('button', { name: '2026-11-18 메모 지우기' }))
    expect(props.onDeleteNote).toHaveBeenCalledWith('n-3')
  })
})

describe('AC-7913.4: 진행 상태 다섯(보는 중 → 중개사 연락 → 보러 감 → 계약 검토 / 내려놓음)', () => {
  const STEPS: readonly (readonly [CandidateStatus, string])[] = [
    ['watching', '1. 보는 중'],
    ['contacted', '2. 중개사 연락'],
    ['visited', '3. 보러 감'],
    ['reviewing', '4. 계약 검토'],
  ]
  const group = () => screen.getByRole('group', { name: '진행 상태' })
  const pressed = () =>
    within(group())
      .getAllByRole('button')
      .filter((b) => b.getAttribute('aria-pressed') === 'true')
      .map((b) => b.textContent)

  it('AC-7913.4: 네 단계 단추가 차례대로 있고 지금 단계만 눌려 있으며 [내려놓기]가 있다', () => {
    setup({ candidate: { id: CAND_A, status: 'visited', checks: {}, terms: {} } })
    expect(within(group()).getAllByRole('button').map((b) => b.textContent)).toEqual(STEPS.map((s) => s[1]))
    expect(pressed()).toEqual(['3. 보러 감'])
    expect(screen.getByRole('button', { name: '내려놓기' })).toBeTruthy()
  })

  it.each(STEPS)('AC-7913.4: [%s] 단계를 누르면 그 상태로 onStatus를 부른다', (status, label) => {
    const from: CandidateStatus = status === 'watching' ? 'reviewing' : 'watching'
    const { props } = setup({ candidate: { id: CAND_A, status: from, checks: {}, terms: {} } })
    fireEvent.click(within(group()).getByRole('button', { name: label }))
    expect(props.onStatus).toHaveBeenCalledWith(status)
  })

  it('AC-7913.4: 지금 단계를 다시 누르면 부르지 않는다', () => {
    const { props } = setup({ candidate: { id: CAND_A, status: 'contacted', checks: {}, terms: {} } })
    fireEvent.click(within(group()).getByRole('button', { name: '2. 중개사 연락' }))
    expect(props.onStatus).not.toHaveBeenCalled()
  })

  it('AC-7913.4: [내려놓기]는 dropped로 바꾸고, 내려놓음이면 눌린 단계 없이 내려놓음이 보이며 단계를 누르면 다시 올린다', () => {
    const first = setup({ candidate: { id: CAND_A, status: 'reviewing', checks: {}, terms: {} } })
    fireEvent.click(screen.getByRole('button', { name: '내려놓기' }))
    expect(first.props.onStatus).toHaveBeenCalledWith('dropped')
    cleanup()

    const { props } = setup({ candidate: { id: CAND_A, status: 'dropped', checks: {}, terms: {} } })
    expect(pressed()).toEqual([])
    expect(screen.queryByRole('button', { name: '내려놓기' })).toBeNull()
    expect(within(sectionOf('진행 메모')).getByText('내려놓음')).toBeTruthy()
    fireEvent.click(within(group()).getByRole('button', { name: '1. 보는 중' }))
    expect(props.onStatus).toHaveBeenCalledWith('watching')
  })
})

describe('AC-7913.3: 화면 규칙(PC 모양 하나 · 영어 낱말 없음)', () => {
  const full = () =>
    setup({
      candidate: { id: CAND_A, status: 'visited', checks: { 'b-xray': 'yes', 'v-sign': 'yes' }, terms: { freeRent: { now: '2개월', want: '3개월' }, memo: '다시 묻기' } },
      photos: [photo(1, { label: '입구', url: 'blob:예시' })],
      notes: [note('n-1', '2026-11-21', '보러 감')],
    })

  it('AC-7913.3: 화면 글·보조 글(aria-label·title·placeholder·alt)에 영어 낱말이 없다', () => {
    const { container } = full()
    const attrs = [...container.querySelectorAll('*')].flatMap((el) => ['aria-label', 'title', 'placeholder', 'alt'].map((name) => el.getAttribute(name) ?? ''))
    const words = [container.textContent ?? '', ...attrs].flatMap((text) => text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [])
    expect(words).toEqual([])
  })

  it('AC-7913.3: 그린 클래스에 화면 폭 따라 바뀌는 것(max-md: 등)이 없다', () => {
    const { container } = full()
    const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
    const tokens = [...container.querySelectorAll('[class]')].flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
    expect(tokens.filter((t) => t.split(':').slice(0, -1).some((v) => WIDTH_VARIANT.test(v)))).toEqual([])
  })

  it('AC-7913.3: 네 묶음(건물 요건 표·계약 전 위험·보러 갈 때 점검표·진행 메모)이 시안 차례로 있다', () => {
    full()
    expect(screen.getAllByRole('region').map((r) => r.getAttribute('aria-label') ?? document.getElementById(r.getAttribute('aria-labelledby') ?? '')?.textContent)).toEqual([
      '건물 요건 표',
      '계약 전 위험',
      '보러 갈 때 점검표',
      '진행 메모',
    ])
  })

  it('AC-7913.3: 사진을 올리는 동안 다시 고르면 무시한다(한 번에 한 묶음)', async () => {
    let release: (v: Blob | null) => void = () => undefined
    const shrink = vi.fn(() => new Promise<Blob | null>((resolve) => (release = resolve)))
    const { props, container } = setup({ shrink })
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('하나.jpg')] } })
    await waitFor(() => expect(shrink).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '사진 올리기' }).getAttribute('aria-busy')).toBe('true')
    fireEvent.change(fileInput(container), { target: { files: [jpegFile('둘.jpg')] } })
    expect(shrink).toHaveBeenCalledTimes(1)
    await act(async () => release(new Blob(['a'], { type: 'image/jpeg' })))
    await waitFor(() => expect(props.onAddPhoto).toHaveBeenCalledTimes(1))
    expect(screen.getByRole('button', { name: '사진 올리기' }).getAttribute('aria-busy')).toBeNull()
  })
})
