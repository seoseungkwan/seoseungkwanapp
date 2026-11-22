// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { areaText, pyeongToM2 } from '@/lib/location/area'
import { compareListings, FEW_LISTINGS_TEXT } from '@/lib/location/listings'
import { naverLandUrl } from '@/lib/location/links'
import { wonText } from '@/lib/location/money'
import type { Listing } from '@/types/location'
import { ListingsView, type ListingCandidate, type ListingsViewProps } from './ListingsView'
import { TERM_ROWS } from './terms'

// 매물 화면 (spec location REQ-7910 AC-7910.1~AC-7910.4, design.md 11·13·14절, 시안 ?s=listings 승인 2026-11-22).
// 부품은 props·콜백만: 매물·후보·네이버 링크 점은 받고, 저장(onSave)·주소록에 넣기(onAddBroker)·협상표 저장(onSaveTerms)·후보로 저장(onMakeCandidate)은 부른다.
// 자료는 지어낸 값(시안과 같은 예시 이름·전화)

const AT = '2026-11-12T03:00:00.000Z' // 한국 11월 12일
function listing(over: Partial<Listing> & { id: string }): Listing {
  return {
    candidateId: null,
    title: '예시빌딩',
    url: '',
    areaM2: pyeongToM2(52),
    floorLabel: '3층',
    deposit: null,
    rent: null,
    premium: null,
    mgmt: null,
    brokerId: null,
    brokerNote: '',
    memo: '',
    lat: null,
    lng: null,
    createdAt: AT,
    updatedAt: AT,
    ...over,
  }
}

const PLACES = [
  { id: 'd1', label: '가람동', point: { lat: 37.5, lng: 127 } },
  { id: 'd2', label: '하늘동', point: { lat: 37.51, lng: 127.02 } },
]

const CANDS: ListingCandidate[] = [
  { id: 'cand-a', name: '예시빌딩 3층', status: 'visited', terms: { memo: '메모 그대로', freeRent: { now: '2개월', want: '' } } },
  { id: 'cand-b', name: '예시타워 2층', status: 'contacted', terms: {} },
  { id: 'cand-c', name: '내려놓은 자리', status: 'dropped', terms: {} },
]

// 시안 LISTINGS 여섯(금액은 만 원 × 10,000)
const SIX: Listing[] = [
  listing({ id: 'l1', title: '예시빌딩', floorLabel: '3층', areaM2: pyeongToM2(52), deposit: 100_000_000, rent: 5_200_000, mgmt: 780_000, premium: 0, brokerNote: '예시부동산 · 김예시 · 010-0000-0011', brokerId: 'co-1', candidateId: 'cand-a', url: 'https://m.land.naver.com/article/1' }),
  listing({ id: 'l2', title: '예시타워', floorLabel: '2층', areaM2: pyeongToM2(64), deposit: 150_000_000, rent: 8_600_000, mgmt: 960_000, premium: 50_000_000, brokerNote: '예시공인중개사 · 이예시 · 010-0000-0012', candidateId: 'cand-b' }),
  listing({ id: 'l3', title: '예시센터', floorLabel: '5층', areaM2: pyeongToM2(38), deposit: 50_000_000, rent: 3_300_000, mgmt: 500_000, premium: 0 }),
  listing({ id: 'l4', title: '예시스퀘어', floorLabel: '2층', areaM2: pyeongToM2(71), deposit: 200_000_000, rent: 9_800_000, mgmt: 1_200_000, premium: 80_000_000, brokerNote: '예시중개 · 박예시 · 010-0000-0013' }),
  listing({ id: 'l5', title: '예시프라자', floorLabel: '4층', areaM2: pyeongToM2(25), deposit: 50_000_000, rent: 2_900_000 }),
  listing({ id: 'l6', title: '예시메디컬빌딩', floorLabel: '', areaM2: null, rent: 4_400_000 }),
]

function setup(over: Partial<ListingsViewProps> = {}) {
  const onSave = vi.fn<ListingsViewProps['onSave']>(async () => {})
  const onAddBroker = vi.fn<ListingsViewProps['onAddBroker']>(async () => {})
  const onSaveTerms = vi.fn<ListingsViewProps['onSaveTerms']>(async () => {})
  const onMakeCandidate = vi.fn<NonNullable<ListingsViewProps['onMakeCandidate']>>()
  const props: ListingsViewProps = { listings: [], candidates: [], places: PLACES, onSave, onAddBroker, onSaveTerms, onMakeCandidate, ...over }
  const view = render(<ListingsView {...props} />)
  return { ...view, props, onSave, onAddBroker, onSaveTerms, onMakeCandidate }
}

const region = (name: string) => screen.getByRole('region', { name })
const type = (name: string | RegExp, value: string) => fireEvent.change(within(region('매물 붙여 넣기')).getByRole('textbox', { name }), { target: { value } })
const box = (name: string | RegExp) => within(region('매물 붙여 넣기')).getByRole<HTMLInputElement>('textbox', { name })
const rowOf = (name: RegExp) => within(region('저장한 매물')).getByRole('row', { name })
async function press(button: HTMLElement) {
  await act(async () => {
    fireEvent.click(button)
  })
}

let fetchSpy: ReturnType<typeof vi.fn>
let openSpy: ReturnType<typeof vi.spyOn>
// jsdom은 링크 이동을 못 하니 링크 누름만 막는다(폼 제출은 그대로)
const stopNavigation = (e: Event) => {
  if (e.target instanceof Element && e.target.closest('a')) e.preventDefault()
}
beforeEach(() => {
  fetchSpy = vi.fn()
  vi.stubGlobal('fetch', fetchSpy)
  openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
  document.addEventListener('click', stopNavigation)
})
afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-7910.1: [네이버 부동산에서 보기]', () => {
  it('AC-7910.1: 고른 점의 네이버 부동산 링크를 새 창(noopener noreferrer)으로 연다', () => {
    setup()
    const link = within(region('매물 찾기')).getByRole('link', { name: '네이버 부동산에서 보기' })
    expect(link.getAttribute('href')).toBe('https://m.land.naver.com/map/37.500000:127.000000:16/SG:SMS/A1:B2')
    expect(link.getAttribute('href')).toBe(naverLandUrl(PLACES[0]!.point))
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(region('매물 찾기')).getByText('새 창에서 그 동 상가 매물 지도가 열려요')).toBeTruthy()
    expect(within(region('매물 찾기')).getByText(/부동산 사이트의 매물을 이 앱이 저절로 가져오는 것은 사이트 약관과 법으로 막혀 있어요/)).toBeTruthy()
  })

  it('AC-7910.1: 동(점)을 바꾸면 그 점 링크로 바뀌고, 처음 고른 점을 받을 수 있다', () => {
    setup({ defaultPlaceId: 'd2' })
    const select = within(region('매물 찾기')).getByRole<HTMLSelectElement>('combobox', { name: '어느 동 매물을 볼까요' })
    const link = () => within(region('매물 찾기')).getByRole('link', { name: '네이버 부동산에서 보기' })
    expect(select.value).toBe('d2')
    expect(link().getAttribute('href')).toBe(naverLandUrl(PLACES[1]!.point))
    expect(Array.from(select.options).map((o) => o.textContent)).toEqual(['가람동', '하늘동'])
    fireEvent.change(select, { target: { value: 'd1' } })
    expect(link().getAttribute('href')).toBe(naverLandUrl(PLACES[0]!.point))
  })

  it('AC-7910.1: 앱은 네이버를 부르지 않는다 — 그리고 누를 때 fetch·window.open이 없다(링크만)', () => {
    setup({ listings: SIX, candidates: CANDS })
    fireEvent.click(within(region('매물 찾기')).getByRole('link', { name: '네이버 부동산에서 보기' }))
    fireEvent.click(within(rowOf(/예시빌딩/)).getByRole('link', { name: '매물 화면 열기' }))
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(openSpy).not.toHaveBeenCalled()
  })

  it('AC-7910.1: 한국 범위 밖 점은 고르는 칸에서 빼고, 점이 하나도 없으면 링크 대신 안내 글', () => {
    const { unmount } = setup({ places: [{ id: 'x', label: '바다', point: { lat: 0, lng: 0 } }, PLACES[0]!] })
    const select = within(region('매물 찾기')).getByRole<HTMLSelectElement>('combobox', { name: '어느 동 매물을 볼까요' })
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['d1'])
    unmount()
    setup({ places: [] })
    expect(within(region('매물 찾기')).queryByRole('link', { name: '네이버 부동산에서 보기' })).toBeNull()
    expect(within(region('매물 찾기')).getByText('동네 훑기에서 동을 고르거나 후보를 더하면 그 둘레 매물 지도를 열 수 있어요.')).toBeTruthy()
  })

  it('AC-7910.1: 매물 링크를 적은 매물은 줄의 [매물 화면 열기]가 그 주소를 새 창으로 연다(링크가 없으면 없음)', () => {
    setup({ listings: SIX })
    const a = within(rowOf(/예시빌딩/)).getByRole('link', { name: '매물 화면 열기' })
    expect(a.getAttribute('href')).toBe('https://m.land.naver.com/article/1')
    expect(a.getAttribute('target')).toBe('_blank')
    expect(a.getAttribute('rel')).toBe('noopener noreferrer')
    expect(within(rowOf(/예시타워/)).queryByRole('link', { name: '매물 화면 열기' })).toBeNull()
  })
})

describe('AC-7910.2: 붙여 넣기 칸 · 목록 · 평수 거르기 · 견주기', () => {
  it('AC-7910.2: 칸을 적고 [매물 저장]을 누르면 저장 몸통(https 링크·㎡·원 정수)으로 부르고, 끝나면 칸을 비우고 알린다', async () => {
    const { onSave } = setup()
    type('매물 링크', 'https://m.land.naver.com/article/123')
    type(/^건물 이름/, '예시빌딩')
    type('층', '3층')
    type(/^전용 넓이/, '30.2')
    type('보증금', '10,000')
    type(/^월세/, '520')
    type('권리금', '0')
    type('관리비(한 달)', '78')
    type('메모', '주차 2대')
    fireEvent.click(within(region('매물 붙여 넣기')).getByRole('checkbox', { name: '중개사를 주소록(기타)에도 넣어요' }))
    await press(within(region('매물 붙여 넣기')).getByRole('button', { name: '매물 저장' }))
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(onSave).toHaveBeenCalledWith(
      {
        candidateId: null,
        title: '예시빌딩',
        url: 'https://m.land.naver.com/article/123',
        areaM2: 99.83,
        floorLabel: '3층',
        deposit: 100_000_000,
        rent: 5_200_000,
        premium: 0,
        mgmt: 780_000,
        brokerId: null,
        brokerNote: '',
        memo: '주차 2대',
        lat: null,
        lng: null,
      },
      null,
    )
    expect(screen.getByRole('status').textContent).toBe('매물을 저장했어요.')
    expect(box(/^건물 이름/).value).toBe('')
    expect(box(/^월세/).value).toBe('')
  })

  it('AC-7910.2: 넓이는 [평]·[㎡]를 골라 적는다', async () => {
    const { onSave } = setup()
    type(/^건물 이름/, '예시센터')
    type(/^월세/, '330')
    const unit = within(region('매물 붙여 넣기')).getByRole('group', { name: '넓이 단위' })
    expect(within(unit).getByRole('button', { name: '평' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(within(unit).getByRole('button', { name: '㎡' }))
    expect(within(unit).getByRole('button', { name: '㎡' }).getAttribute('aria-pressed')).toBe('true')
    type(/^전용 넓이/, '125.62')
    await press(within(region('매물 붙여 넣기')).getByRole('button', { name: '매물 저장' }))
    expect(onSave.mock.calls[0]![0].areaM2).toBe(125.62)
  })

  it('AC-7910.2: https가 아닌 링크·소수 금액·빈 필수 칸은 그 칸 아래 글이 보이고 저장하지 않는다', async () => {
    const { onSave } = setup()
    type('매물 링크', 'http://m.land.naver.com/article/123')
    type(/^월세/, '52.5')
    await press(within(region('매물 붙여 넣기')).getByRole('button', { name: '매물 저장' }))
    expect(onSave).not.toHaveBeenCalled()
    const form = region('매물 붙여 넣기')
    expect(within(form).getByText('매물 링크는 주소창에 보이는 주소를 그대로 붙여 넣어 주세요. 보안 연결 주소만 받아요.')).toBeTruthy()
    expect(within(form).getByText('건물 이름을 적어 주세요.')).toBeTruthy()
    expect(within(form).getByText('전용 넓이를 숫자로 적어 주세요.')).toBeTruthy()
    expect(within(form).getByText('월세를 숫자로 적어 주세요(만 원).')).toBeTruthy()
    expect(box('매물 링크').getAttribute('aria-invalid')).toBe('true')
    expect(box(/^월세/).getAttribute('aria-invalid')).toBe('true')
    expect(document.activeElement).toBe(box('매물 링크'))
  })

  it('AC-7910.2: 저장이 실패하면 오류 카드(E-LOC-SAVE-FAILED)가 보이고 적은 값은 그대로다', async () => {
    const { onSave } = setup({ onSave: vi.fn(async () => Promise.reject(new Error('x'))) })
    type(/^건물 이름/, '예시빌딩')
    type(/^전용 넓이/, '52')
    type(/^월세/, '520')
    await press(within(region('매물 붙여 넣기')).getByRole('button', { name: '매물 저장' }))
    void onSave
    const alert = within(region('매물 붙여 넣기')).getByRole('alert')
    expect(alert.textContent).toContain(errorInfo('E-LOC-SAVE-FAILED').what)
    expect(alert.textContent).toContain(errorInfo('E-LOC-SAVE-FAILED').fix)
    expect(box(/^건물 이름/).value).toBe('예시빌딩')
    expect(box(/^월세/).value).toBe('520')
  })

  it('AC-7910.2: 저장한 매물이 목록에 든다 — 넓이·돈 글은 area·money 함수, 평당 월세, 적은 날', () => {
    setup({ listings: SIX, candidates: CANDS })
    expect(region('저장한 매물').querySelector('h2')?.textContent).toBe('저장한 매물6')
    const r1 = rowOf(/예시빌딩/)
    const cells = within(r1).getAllByRole('cell').map((c) => c.textContent)
    expect(cells.slice(1, 7)).toEqual([
      areaText(pyeongToM2(52)),
      wonText(100_000_000),
      wonText(5_200_000),
      wonText(780_000),
      wonText(0),
      wonText(compareListings(SIX).items.l1!.rent!.perPy),
    ])
    expect(cells[1]).toBe('52평 (171.9㎡)')
    expect(cells[6]).toBe('100,000원')
    expect(within(r1).getByText('11월 12일 적음')).toBeTruthy()
    // 값이 없는 칸은 '–'
    const r6 = within(rowOf(/예시메디컬빌딩/)).getAllByRole('cell').map((c) => c.textContent)
    expect([r6[1], r6[2], r6[6]]).toEqual(['–', '–', '–'])
  })

  it('AC-7910.2: 평수 거르기(○평~○평) — 칩마다 수가 보이고 누르면 그 평수 매물만(넓이 없는 매물은 전체에서만)', () => {
    setup({ listings: SIX })
    const chips = within(region('저장한 매물')).getByRole('group', { name: '평수로 거르기' })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체6', '30평 아래1', '30~50평1', '50~70평2', '70평 넘게1'])
    const titles = () =>
      within(region('저장한 매물'))
        .getAllByRole('row')
        .slice(1)
        .map((r) => within(r).getAllByRole('cell')[0]!.querySelector('b')?.textContent)
    fireEvent.click(within(chips).getByRole('button', { name: /^50~70평/ }))
    expect(within(chips).getByRole('button', { name: /^50~70평/ }).getAttribute('aria-pressed')).toBe('true')
    expect(titles()).toEqual(['예시빌딩 3층', '예시타워 2층'])
    fireEvent.click(within(chips).getByRole('button', { name: /^30평 아래/ }))
    expect(titles()).toEqual(['예시프라자 4층'])
    fireEvent.click(within(chips).getByRole('button', { name: /^전체/ }))
    expect(titles()).toHaveLength(6)
  })

  it('AC-7910.2: 30평 칸 경계 — 30평은 30~50평에, 29.9평은 30평 아래에, 70평은 70평 넘게에 든다', () => {
    setup({
      listings: [
        listing({ id: 'a', title: '가', areaM2: pyeongToM2(29.9) }),
        listing({ id: 'b', title: '나', areaM2: pyeongToM2(30) }),
        listing({ id: 'c', title: '다', areaM2: pyeongToM2(69.9) }),
        listing({ id: 'd', title: '라', areaM2: pyeongToM2(70) }),
      ],
    })
    const chips = within(region('저장한 매물')).getByRole('group', { name: '평수로 거르기' })
    expect(within(chips).getAllByRole('button').map((b) => b.textContent)).toEqual(['전체4', '30평 아래1', '30~50평1', '50~70평1', '70평 넘게1'])
  })

  it('AC-7910.2: 저장한 매물이 2개 미만이면 견주지 않고 안내만 보인다', () => {
    setup({ listings: [listing({ id: 'only', rent: 3_000_000, deposit: 30_000_000 })] })
    const cmp = region('매물 값 견주기')
    expect(FEW_LISTINGS_TEXT).toBe('매물을 2개 이상 저장하면 서로 견줘 드려요')
    expect(within(cmp).getByText('매물을 2개 이상 저장하면 서로 견줘 드려요')).toBeTruthy()
    expect(cmp.textContent).not.toMatch(/평균보다|평균과 같아요/)
  })

  it('AC-7910.2: 2개 이상이면 매물마다 평당 월세·보증금을 저장한 매물 평균과 견준 글(listings.ts)이 보인다', () => {
    const two = [
      listing({ id: 'a', title: '예시가람', floorLabel: '2층', areaM2: pyeongToM2(30), rent: 3_000_000, deposit: 30_000_000 }),
      listing({ id: 'b', title: '예시하늘', floorLabel: '4층', areaM2: pyeongToM2(30), rent: 3_840_000, deposit: 30_000_000 }),
    ]
    setup({ listings: two })
    const cmp = region('매물 값 견주기')
    expect(cmp.textContent).not.toContain(FEW_LISTINGS_TEXT)
    expect(within(cmp).getByText('저장한 매물 2개')).toBeTruthy()
    expect(cmp.textContent).toContain(`평당 월세 · 평균 ${wonText(114_000)}`)
    expect(cmp.textContent).toContain(`평당 보증금 · 평균 ${wonText(1_000_000)}`)
    const rowA = within(cmp).getByRole('listitem', { name: '예시가람 2층' })
    const rowB = within(cmp).getByRole('listitem', { name: '예시하늘 4층' })
    expect(rowA.textContent).toContain('100,000원 · 저장한 매물 평균보다 12% 싸요')
    expect(rowB.textContent).toContain('128,000원 · 저장한 매물 평균보다 12% 비싸요')
    expect(rowB.textContent).toContain(compareListings(two).items.b!.rent!.vs!.text)
    expect(rowA.textContent).toContain(`${wonText(1_000_000)} · 평균과 같아요`)
    expect(rowA.textContent).toContain('100만 원 · 평균과 같아요')
  })

  it('AC-7910.2: 견주기 줄도 평수 거르기를 따르되 평균은 저장한 매물 모두로 센다', () => {
    setup({ listings: SIX })
    const avg = compareListings(SIX).rentAvg!
    fireEvent.click(within(region('저장한 매물')).getByRole('button', { name: /^30평 아래/ }))
    const cmp = region('매물 값 견주기')
    expect(within(cmp).getAllByRole('listitem').map((li) => li.getAttribute('aria-label'))).toEqual(['예시프라자 4층'])
    expect(cmp.textContent).toContain(`평당 월세 · 평균 ${wonText(avg)}`)
  })

  it('AC-7910.2: [후보로 저장]은 그 매물로 후보 더하기를 부르고, 후보에 이은 매물은 후보 이름이 보인다', () => {
    const { onMakeCandidate } = setup({ listings: SIX, candidates: CANDS })
    expect(within(rowOf(/예시빌딩/)).getByText('후보 예시빌딩 3층')).toBeTruthy()
    expect(within(rowOf(/예시빌딩/)).queryByRole('button', { name: '후보로 저장' })).toBeNull()
    fireEvent.click(within(rowOf(/예시센터/)).getByRole('button', { name: '후보로 저장' }))
    expect(onMakeCandidate).toHaveBeenCalledWith(SIX[2])
  })
})

describe('AC-7910.3: 임대 조건 협상표', () => {
  it('AC-7910.3: 여섯 줄(무상 기간·관리비·월세 올리는 비율·원상 복구·계약 기간·권리금) × 내려놓지 않은 후보마다 제안·바람 칸', () => {
    setup({ candidates: CANDS })
    const table = within(region('임대 조건 협상표')).getByRole('table')
    const rows = within(table).getAllByRole('row')
    expect(rows).toHaveLength(7)
    expect(within(rows[0]!).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['조건', '예시빌딩 3층', '예시타워 2층'])
    expect(rows.slice(1).map((r) => within(r).getByRole('rowheader').querySelector('b')?.textContent)).toEqual(TERM_ROWS.map((t) => t.label))
    expect(rows.slice(1).map((r) => within(r).getByRole('rowheader').querySelector('b')?.textContent)).toEqual([
      '무상 기간',
      '관리비',
      '월세 올리는 비율',
      '원상 복구',
      '계약 기간',
      '권리금',
    ])
    expect(within(table).getAllByRole('textbox')).toHaveLength(6 * 2 * 2)
    expect(within(table).queryByRole('textbox', { name: /내려놓은 자리/ })).toBeNull()
    const now = within(table).getByRole<HTMLInputElement>('textbox', { name: '예시빌딩 3층 무상 기간 제안' })
    expect(now.value).toBe('2개월')
    expect(now.maxLength).toBe(100)
    expect(within(table).getByRole<HTMLInputElement>('textbox', { name: '예시빌딩 3층 무상 기간 바람' }).placeholder).toBe('바라는 것')
  })

  it('AC-7910.3: 적고 칸을 떠나면 그 후보의 terms 전체(임대 조건 메모 그대로)로 저장을 부른다', () => {
    const { onSaveTerms } = setup({ candidates: CANDS })
    const want = screen.getByRole('textbox', { name: '예시빌딩 3층 무상 기간 바람' })
    fireEvent.change(want, { target: { value: ' 3개월 ' } })
    expect(onSaveTerms).not.toHaveBeenCalled()
    fireEvent.blur(want)
    expect(onSaveTerms).toHaveBeenCalledTimes(1)
    expect(onSaveTerms).toHaveBeenCalledWith('cand-a', { memo: '메모 그대로', freeRent: { now: '2개월', want: '3개월' } })
    const b = screen.getByRole('textbox', { name: '예시타워 2층 계약 기간 제안' })
    fireEvent.change(b, { target: { value: '3년' } })
    fireEvent.blur(b)
    expect(onSaveTerms).toHaveBeenLastCalledWith('cand-b', { period: { now: '3년', want: '' } })
  })

  it('AC-7910.3: 바꾸지 않고 떠나면 부르지 않고, 같은 값으로 두 번 떠나도 한 번만 부른다', () => {
    const { onSaveTerms } = setup({ candidates: CANDS })
    const now = screen.getByRole('textbox', { name: '예시빌딩 3층 무상 기간 제안' })
    fireEvent.blur(now)
    fireEvent.change(now, { target: { value: '2개월 ' } })
    fireEvent.blur(now)
    expect(onSaveTerms).not.toHaveBeenCalled()
    fireEvent.change(now, { target: { value: '1개월' } })
    fireEvent.blur(now)
    fireEvent.blur(now)
    expect(onSaveTerms).toHaveBeenCalledTimes(1)
  })

  it('AC-7910.3: 한 후보에서 두 칸을 고치면 두 번째 저장에 앞서 고친 칸도 들어 있다(부모가 아직 새 값을 안 줬어도)', () => {
    const { onSaveTerms } = setup({ candidates: CANDS })
    const a = screen.getByRole('textbox', { name: '예시빌딩 3층 관리비 제안' })
    fireEvent.change(a, { target: { value: '78만 원' } })
    fireEvent.blur(a)
    const c = screen.getByRole('textbox', { name: '예시빌딩 3층 관리비 바람' })
    fireEvent.change(c, { target: { value: '70만 원' } })
    fireEvent.blur(c)
    expect(onSaveTerms).toHaveBeenLastCalledWith('cand-a', {
      memo: '메모 그대로',
      freeRent: { now: '2개월', want: '' },
      mgmt: { now: '78만 원', want: '70만 원' },
    })
  })

  it('AC-7910.3: 칸을 떠나기 전에 화면이 닫혀도 고친 값을 저장한다', () => {
    const { onSaveTerms, unmount } = setup({ candidates: CANDS })
    fireEvent.change(screen.getByRole('textbox', { name: '예시타워 2층 권리금 바람' }), { target: { value: '3,000만 원' } })
    unmount()
    expect(onSaveTerms).toHaveBeenCalledWith('cand-b', { premium: { now: '', want: '3,000만 원' } })
  })

  it('AC-7910.3: 저장이 실패하면 표 아래 오류 카드가 보이고 적은 값은 그대로다', async () => {
    setup({ candidates: CANDS, onSaveTerms: vi.fn(async () => Promise.reject(new Error('x'))) })
    const want = screen.getByRole<HTMLInputElement>('textbox', { name: '예시빌딩 3층 원상 복구 바람' })
    fireEvent.change(want, { target: { value: '방사선 벽은 빼기' } })
    await act(async () => {
      fireEvent.blur(want)
    })
    expect(within(region('임대 조건 협상표')).getByRole('alert').textContent).toContain(errorInfo('E-LOC-SAVE-FAILED').what)
    expect(want.value).toBe('방사선 벽은 빼기')
  })

  it('AC-7910.3: 후보가 없으면 표 대신 안내 글', () => {
    setup({ candidates: [CANDS[2]!] })
    expect(within(region('임대 조건 협상표')).queryByRole('table')).toBeNull()
    expect(within(region('임대 조건 협상표')).getByText('후보를 더하면 후보마다 협상표를 적을 수 있어요.')).toBeTruthy()
  })
})

describe('AC-7910.4: [주소록에 넣기]', () => {
  it('AC-7910.4: 붙여 넣기 칸에서 [주소록에도 넣어요]를 켜고 저장하면 매물 몸통과 주소록 몸통(분류 other·하는 일 부동산 중개)을 함께 넘긴다', async () => {
    const { onSave } = setup()
    type(/^건물 이름/, '예시스퀘어')
    type(/^전용 넓이/, '71')
    type(/^월세/, '980')
    type('중개사 이름', '예시중개')
    type('담당자', '박예시')
    type('중개사 전화', '010-0000-0013')
    expect(within(region('매물 붙여 넣기')).getByRole<HTMLInputElement>('checkbox', { name: '중개사를 주소록(기타)에도 넣어요' }).checked).toBe(true)
    await press(within(region('매물 붙여 넣기')).getByRole('button', { name: '매물 저장' }))
    const [fields, broker] = onSave.mock.calls[0]!
    expect(fields.brokerNote).toBe('예시중개 · 박예시 · 010-0000-0013')
    expect(fields.brokerId).toBeNull()
    expect(broker).toEqual({
      company: {
        category: 'other',
        name: '예시중개',
        phone: '010-0000-0013',
        work: '부동산 중개',
        address: '',
        homepage: '',
        bizNo: '',
        account: '',
        siteId: '',
        sitePw: '',
        memo: '',
      },
      person: { name: '박예시', mobile: '', role: '' },
    })
    expect(screen.getByRole('status').textContent).toBe('매물을 저장했어요. 중개사 예시중개를 주소록(기타)에도 넣었어요.')
  })

  it('AC-7910.4: 저장한 매물 줄의 [주소록에 넣기]는 그 매물 id와 중개사 글로 만든 주소록 몸통을 넘긴다', async () => {
    const { onAddBroker } = setup({ listings: SIX })
    await press(within(rowOf(/예시스퀘어/)).getByRole('button', { name: '주소록에 넣기' }))
    expect(onAddBroker).toHaveBeenCalledWith('l4', {
      company: {
        category: 'other',
        name: '예시중개',
        phone: '010-0000-0013',
        work: '부동산 중개',
        address: '',
        homepage: '',
        bizNo: '',
        account: '',
        siteId: '',
        sitePw: '',
        memo: '',
      },
      person: { name: '박예시', mobile: '', role: '' },
    })
  })

  it('AC-7910.4: 주소록에 이은 매물은 단추 대신 `주소록에 있어요`, 중개사가 없으면 `–`이고 단추가 없다', () => {
    setup({ listings: SIX })
    expect(within(rowOf(/예시빌딩/)).queryByRole('button', { name: '주소록에 넣기' })).toBeNull()
    expect(within(rowOf(/예시빌딩/)).getByText('주소록에 있어요')).toBeTruthy()
    expect(within(rowOf(/예시빌딩/)).getByText('예시부동산 · 김예시 · 010-0000-0011')).toBeTruthy()
    expect(within(rowOf(/예시센터/)).queryByRole('button', { name: '주소록에 넣기' })).toBeNull()
    expect(within(rowOf(/예시타워/)).getByRole('button', { name: '주소록에 넣기' })).toBeTruthy()
  })

  it('AC-7910.4: 주소록에 넣기가 실패하면 오류 카드가 보인다', async () => {
    setup({ listings: SIX, onAddBroker: vi.fn(async () => Promise.reject(new Error('x'))) })
    await press(within(rowOf(/예시스퀘어/)).getByRole('button', { name: '주소록에 넣기' }))
    expect(within(region('저장한 매물')).getByRole('alert').textContent).toContain(errorInfo('E-LOC-SAVE-FAILED').what)
  })
})

describe('AC-7910.1~4: 화면 글', () => {
  it('AC-7917.1: 화면 글에 영어 낱말이 없다(시안 글 · 머리 다섯)', () => {
    setup({ listings: SIX, candidates: CANDS })
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ''))).toEqual([
      '매물 찾기',
      '매물 붙여 넣기',
      '저장한 매물',
      '매물 값 견주기',
      '임대 조건 협상표',
    ])
    const text = document.body.textContent ?? ''
    expect(text.match(/[A-Za-z]+/g) ?? []).toEqual([])
    const holders = Array.from(document.querySelectorAll('[placeholder]')).map((el) => el.getAttribute('placeholder') ?? '')
    expect(holders.join(' ').match(/[A-Za-z]+/g) ?? []).toEqual([])
  })
})
