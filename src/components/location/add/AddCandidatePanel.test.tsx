// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Point } from '@/types/location'
import { AddCandidatePanel, type AddCandidatePanelProps, type AddListing, type AddressFind, type AddressHit, type CandidateDraft, type SpotFind } from './AddCandidatePanel'
import { RADII } from './addDraft'

// 후보 더하기 판(spec location REQ-7908 AC-7908.1·AC-7908.2, design.md 6·14절, ADR-044, 시안 docs/mockups/location/index.html ?s=add).
// 세 길(주소로 찾기 결과 고르기 · 지도 찍기 · 붙여 넣은 매물 고르기)로 점을 정하고 이름(1~40자)·범위(일곱 값, 기본 1,000m)를 정해 저장 콜백을 부른다.
// 저장 몸통에는 사용자가 고른 점·적은 이름·적은 주소 글만 있고 카카오에서 받은 주소 글은 없다.
// 카카오 지도는 흉내 낸다(찍기 단추 하나). 이름·주소는 모두 지어낸 값

vi.mock('@/components/location/map/KakaoMap', () => ({
  KakaoMap: ({ label, onPick, marks }: { label: string; onPick?: (at: { lat: number; lng: number }) => void; marks?: readonly unknown[] }) => (
    <div role="group" aria-label={label} data-marks={JSON.stringify(marks ?? [])}>
      <button type="button" onClick={() => onPick?.({ lat: 37.523456, lng: 127.034567 })}>
        지도에서 이 자리 누르기
      </button>
    </div>
  ),
}))

afterEach(cleanup)

const TODAY = '2026-11-22'
const CENTER: Point = { lat: 37.5, lng: 127.0 }
const PICKED: Point = { lat: 37.523456, lng: 127.034567 }

const HITS: AddressHit[] = [
  { at: { lat: 37.512345, lng: 127.012345 }, road: '서울특별시 예시구 가람로 123', jibun: '서울특별시 예시구 가람동 45-6' },
  { at: { lat: 37.513456, lng: 127.013456 }, road: '서울특별시 예시구 가람로 123-4', jibun: '서울특별시 예시구 가람동 45-7' },
]
const SPOT_ROAD = '서울특별시 예시구 하늘로 140'
const SPOT_JIBUN = '서울특별시 예시구 하늘동 77'
const KAKAO_TEXTS = [...HITS.flatMap((h) => [h.road!, h.jibun!]), SPOT_ROAD, SPOT_JIBUN]

const LISTINGS: AddListing[] = [
  {
    id: 'l1',
    candidateId: null,
    title: '예시빌딩',
    floorLabel: '3층',
    areaM2: 99.17,
    deposit: 30_000_000,
    rent: 1_500_000,
    brokerNote: '예시부동산 김예시',
    lat: 37.521234,
    lng: 127.021234,
  },
  { id: 'l2', candidateId: null, title: '예시타워', floorLabel: '2층', areaM2: null, deposit: null, rent: null, brokerNote: '', lat: null, lng: null },
  { id: 'l3', candidateId: 'c-1', title: '예시프라자', floorLabel: '1층', areaM2: 50, deposit: 1, rent: 1, brokerNote: '', lat: 37.5, lng: 127.0 },
]

const READY_TEXT = '저장하면 오늘(11월 22일) 받은 자료로 굳혀 두고 기준 날짜를 함께 남겨요.'

function setup(over: Partial<AddCandidatePanelProps> = {}) {
  const onFind = vi.fn<(q: string) => Promise<AddressFind>>(async () => ({ ok: true, hits: HITS }))
  const onSpot = vi.fn<(at: Point) => Promise<SpotFind>>(async () => ({ ok: true, road: SPOT_ROAD, jibun: SPOT_JIBUN }))
  const onSave = vi.fn<(draft: CandidateDraft) => Promise<boolean>>(async () => true)
  const onClose = vi.fn()
  const props: AddCandidatePanelProps = { today: TODAY, center: CENTER, listings: LISTINGS, onFind, onSpot, onSave, onClose, ...over }
  render(<AddCandidatePanel {...props} />)
  return { onFind, onSpot, onSave, onClose, props }
}

const dialog = () => screen.getByRole('dialog', { name: '후보 더하기' })
const saveButton = () => screen.getByRole('button', { name: '후보로 저장' })
const nameInput = () => screen.getByLabelText('부르는 이름') as HTMLInputElement
const way = (name: string) => screen.getByRole('button', { name })

async function findAddress(q: string) {
  fireEvent.change(screen.getByLabelText(/^주소/), { target: { value: q } })
  fireEvent.click(screen.getByRole('button', { name: '찾기' }))
  return screen.findByRole('radiogroup', { name: '찾은 주소' })
}

async function save(onSave: ReturnType<typeof vi.fn>) {
  fireEvent.click(saveButton())
  await waitFor(() => expect(onSave).toHaveBeenCalledTimes(1))
  return onSave.mock.calls[0]![0] as CandidateDraft
}

describe('AC-7908.1: 후보 더하기 판 — 틀과 세 길', () => {
  it('AC-7908.1: 오른쪽 판(대화 상자) 머리 `후보 더하기` · 길 셋 · 살필 범위 · 메모 · [그만두기]·[후보로 저장]', () => {
    setup()
    const d = dialog()
    expect(d.getAttribute('aria-modal')).toBe('true')
    const ways = within(d).getByRole('group', { name: '더하는 길' })
    expect(within(ways).getAllByRole('button').map((b) => b.textContent)).toEqual(['주소로 찾기', '지도에서 찍기', '붙여 넣은 매물에서'])
    expect(way('주소로 찾기').getAttribute('aria-pressed')).toBe('true')
    expect(way('지도에서 찍기').getAttribute('aria-pressed')).toBe('false')
    expect(within(d).getByRole('slider', { name: '살필 범위' })).toBeTruthy()
    expect(within(d).getByLabelText('메모').getAttribute('placeholder')).toBe('예: 네이버 부동산에서 봄, 중개사 김예시')
    expect(within(d).getByRole('button', { name: '그만두기' })).toBeTruthy()
    expect(saveButton()).toBeTruthy()
  })

  it('AC-7908.1: 처음 길을 받는다(매물 탭 [후보로 저장] → 붙여 넣은 매물에서, 그 매물이 골라져 있음)', () => {
    setup({ way: 'listing', listingId: 'l1' })
    expect(way('붙여 넣은 매물에서').getAttribute('aria-pressed')).toBe('true')
    const group = screen.getByRole('radiogroup', { name: '붙여 넣은 매물' })
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios.map((r) => r.checked)).toEqual([true, false])
  })

  it('AC-7908.1: 길 단추를 누르면 그 길로 바뀐다', () => {
    setup()
    fireEvent.click(way('지도에서 찍기'))
    expect(way('지도에서 찍기').getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('group', { name: '후보 자리 찍기' })).toBeTruthy()
    fireEvent.click(way('붙여 넣은 매물에서'))
    expect(screen.getByRole('radiogroup', { name: '붙여 넣은 매물' })).toBeTruthy()
    fireEvent.click(way('주소로 찾기'))
    expect(screen.getByLabelText(/^주소/)).toBeTruthy()
  })

  it('AC-7908.1: [그만두기]·[닫기]·Esc·바탕 누름은 닫기 콜백만 부른다(저장 없음)', () => {
    const { onClose, onSave } = setup()
    fireEvent.click(screen.getByRole('button', { name: '그만두기' }))
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    fireEvent.click(screen.getByTestId('add-scrim'))
    expect(onClose).toHaveBeenCalledTimes(4)
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('AC-7908.1: 주소로 찾기(k-address) → 결과 고르기', () => {
  it('AC-7908.1: 주소 칸 `필수`·도움말, [찾기]는 앞뒤 빈칸을 뺀 글로 찾기 콜백을 부르고 결과를 라디오로 보인다(첫째가 골라짐)', async () => {
    const { onFind } = setup()
    expect(screen.getByText('도로명·지번·건물 이름으로 찾아요(카카오 주소 찾기).')).toBeTruthy()
    expect(screen.getByText('필수')).toBeTruthy()
    const group = await findAddress('  가람로 123  ')
    expect(onFind).toHaveBeenCalledWith('가람로 123')
    const radios = within(group).getAllByRole('radio') as HTMLInputElement[]
    expect(radios).toHaveLength(2)
    expect(radios.map((r) => r.checked)).toEqual([true, false])
    expect(within(group).getByText('서울특별시 예시구 가람로 123-4')).toBeTruthy()
    expect(within(group).getByText('서울특별시 예시구 가람동 45-7')).toBeTruthy()
  })

  it('AC-7908.1: 주소 칸에서 Enter도 찾는다', async () => {
    const { onFind } = setup()
    const input = screen.getByLabelText(/^주소/)
    fireEvent.change(input, { target: { value: '가람로 123' } })
    fireEvent.submit(input)
    await screen.findByRole('radiogroup', { name: '찾은 주소' })
    expect(onFind).toHaveBeenCalledTimes(1)
  })

  it('AC-7908.1: 고른 결과의 점·적은 주소 글·층·이름·범위로 저장 콜백을 부른다', async () => {
    const { onSave } = setup()
    const group = await findAddress('가람로 123')
    fireEvent.click(within(group).getAllByRole('radio')[1]!)
    fireEvent.change(screen.getByLabelText('층'), { target: { value: '3층' } })
    fireEvent.change(nameInput(), { target: { value: '가람로 자리' } })
    fireEvent.change(screen.getByLabelText('메모'), { target: { value: '중개사 김예시와 통화' } })
    expect(screen.getByText(READY_TEXT)).toBeTruthy()
    const body = await save(onSave)
    expect(body).toStrictEqual({
      name: '가람로 자리',
      addressNote: '가람로 123',
      lat: 37.513456,
      lng: 127.013456,
      radiusM: 1000,
      floorLabel: '3층',
      memo: '중개사 김예시와 통화',
      listingId: null,
    })
  })

  it('AC-7908.1: 이름을 안 고쳤으면 적은 주소 글과 층으로 처음 이름을 채운다(카카오 글이 아님)', async () => {
    setup()
    await findAddress('가람로 123')
    expect(nameInput().value).toBe('가람로 123')
    fireEvent.change(screen.getByLabelText('층'), { target: { value: '3층' } })
    expect(nameInput().value).toBe('가람로 123 3층')
  })

  it('AC-7908.1: 주소가 2자 미만이거나 100자를 넘으면 찾지 않고 안내한다', async () => {
    const { onFind } = setup()
    fireEvent.change(screen.getByLabelText(/^주소/), { target: { value: ' 가 ' } })
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    expect(screen.getByText('주소를 2~100자로 적어 주세요.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText(/^주소/), { target: { value: '가'.repeat(101) } })
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    expect(onFind).not.toHaveBeenCalled()
    expect((screen.getByLabelText(/^주소/) as HTMLInputElement).maxLength).toBe(100)
  })

  it('AC-7908.1: 찾은 주소가 없음 · 열쇠 없음 · 받지 못함 글, 받지 못함은 [다시 받기]로 같은 글을 다시 찾는다', async () => {
    const answers: AddressFind[] = [{ ok: true, hits: [] }, { ok: false, why: 'no-key' }, { ok: false, why: 'failed' }, { ok: true, hits: HITS }]
    const onFind = vi.fn<(q: string) => Promise<AddressFind>>(async () => answers.shift()!)
    setup({ onFind })
    fireEvent.change(screen.getByLabelText(/^주소/), { target: { value: '없는로 1' } })
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    expect(await screen.findByText('찾은 주소가 없어요. 도로명이나 지번을 다르게 적어 보세요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    expect(await screen.findByText('카카오 장소 찾기 열쇠: 열쇠를 넣으면 보여요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '찾기' }))
    expect(await screen.findByText('지금 받지 못했어요.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '다시 받기' }))
    await screen.findByRole('radiogroup', { name: '찾은 주소' })
    expect(onFind.mock.calls.map((c) => c[0])).toEqual(['없는로 1', '없는로 1', '없는로 1', '없는로 1'])
  })

  it('AC-7908.1: 결과를 고르기 전에는 저장할 수 없고 무엇이 빠졌는지 보인다', () => {
    const { onSave } = setup()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    expect(screen.getByText('찾은 주소에서 하나를 골라 주세요.')).toBeTruthy()
    fireEvent.click(saveButton())
    expect(onSave).not.toHaveBeenCalled()
  })
})

describe('AC-7908.1: 지도에서 찍기', () => {
  it('AC-7908.1: 지도(KakaoMap onPick)를 찍으면 그 점이 표시되고, 그 자리 주소를 보여 주기만 하며, 그 점으로 저장한다', async () => {
    const { onSave, onSpot } = setup({ way: 'map' })
    const map = screen.getByRole('group', { name: '후보 자리 찍기' })
    expect(screen.getByText('지도에서 자리를 누르면 주소가 채워져요.')).toBeTruthy()
    expect(screen.getByText('아직 찍지 않았어요.')).toBeTruthy()
    expect(screen.getByText('지도에서 자리를 찍어 주세요.')).toBeTruthy()
    fireEvent.click(within(map).getByRole('button', { name: '지도에서 이 자리 누르기' }))
    expect(onSpot).toHaveBeenCalledWith(PICKED)
    expect(await screen.findByText(SPOT_ROAD)).toBeTruthy()
    expect(JSON.parse(screen.getByRole('group', { name: '후보 자리 찍기' }).dataset.marks!)).toEqual([
      expect.objectContaining({ kind: 'candidate', at: PICKED }),
    ])
    expect(nameInput().value).toBe('')
    expect(screen.getByText('부르는 이름을 1~40자로 적어 주세요.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('층'), { target: { value: '5층' } })
    fireEvent.change(nameInput(), { target: { value: '하늘로 센터' } })
    const body = await save(onSave)
    expect(body).toStrictEqual({
      name: '하늘로 센터',
      addressNote: '',
      lat: PICKED.lat,
      lng: PICKED.lng,
      radiusM: 1000,
      floorLabel: '5층',
      memo: '',
      listingId: null,
    })
  })

  it('AC-7908.1: 찍은 자리 주소를 받지 못해도 찍은 점으로 저장할 수 있다', async () => {
    const onSpot = vi.fn(async (): Promise<SpotFind> => ({ ok: false, why: 'failed' }))
    const { onSave } = setup({ way: 'map', onSpot })
    fireEvent.click(screen.getByRole('button', { name: '지도에서 이 자리 누르기' }))
    expect(await screen.findByText('지금 받지 못했어요.')).toBeTruthy()
    fireEvent.change(nameInput(), { target: { value: '찍은 자리' } })
    const body = await save(onSave)
    expect([body.lat, body.lng]).toEqual([PICKED.lat, PICKED.lng])
  })
})

describe('AC-7908.1: 붙여 넣은 매물에서 고르기', () => {
  it('AC-7908.1: 아직 후보가 아닌 매물만 보이고, 줄마다 이름·층·넓이·보증금/월세·중개사', () => {
    setup({ way: 'listing' })
    expect(screen.getByText('매물 탭에 붙여 넣은 매물 가운데 아직 후보가 아닌 것이에요.')).toBeTruthy()
    const group = screen.getByRole('radiogroup', { name: '붙여 넣은 매물' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(within(group).queryByText(/예시프라자/)).toBeNull()
    expect(within(group).getByText('예시빌딩 3층')).toBeTruthy()
    expect(within(group).getByText('전용 30평 · 보증금 3,000만 원 / 월세 150만 원 · 예시부동산 김예시')).toBeTruthy()
    expect(within(group).getByText('예시타워 2층')).toBeTruthy()
  })

  it('AC-7908.1: 점이 있는 매물을 고르면 매물 점·층·매물 id로 저장하고 처음 이름은 매물 이름 + 층이다', async () => {
    const { onSave, onFind } = setup({ way: 'listing' })
    fireEvent.click(screen.getByRole('radio', { name: /예시빌딩 3층/ }))
    expect(nameInput().value).toBe('예시빌딩 3층')
    expect(screen.queryByLabelText('층')).toBeNull()
    const body = await save(onSave)
    expect(body).toStrictEqual({
      name: '예시빌딩 3층',
      addressNote: '',
      lat: 37.521234,
      lng: 127.021234,
      radiusM: 1000,
      floorLabel: '3층',
      memo: '',
      listingId: 'l1',
    })
    expect(onFind).not.toHaveBeenCalled()
  })

  it('AC-7908.1: 점이 없는 매물은 주소로 찾아 자리를 고른 뒤 저장한다', async () => {
    const { onSave } = setup({ way: 'listing', listingId: 'l2' })
    expect(screen.getByText('이 매물은 자리가 정해지지 않았어요. 주소로 찾아 자리를 골라 주세요.')).toBeTruthy()
    expect(screen.getByText('매물 자리를 주소로 찾아 골라 주세요.')).toBeTruthy()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
    await findAddress('하늘로 9')
    const body = await save(onSave)
    expect(body).toStrictEqual({
      name: '예시타워 2층',
      addressNote: '하늘로 9',
      lat: HITS[0]!.at.lat,
      lng: HITS[0]!.at.lng,
      radiusM: 1000,
      floorLabel: '2층',
      memo: '',
      listingId: 'l2',
    })
  })

  it('AC-7908.1: 고를 매물이 없으면 그렇게 적고 저장할 수 없다', () => {
    setup({ way: 'listing', listings: [LISTINGS[2]!] })
    expect(screen.getByText('후보가 아닌 매물이 없어요.')).toBeTruthy()
    expect(screen.getByText('매물을 하나 골라 주세요.')).toBeTruthy()
    expect((saveButton() as HTMLButtonElement).disabled).toBe(true)
  })
})

describe('AC-7908.1: 이름 1~40자', () => {
  it('AC-7908.1: 빈칸·빈칸만·41자는 저장이 막히고 안내, 40자는 되고 앞뒤 빈칸은 뺀다', async () => {
    const { onSave } = setup({ way: 'listing', listingId: 'l1' })
    expect(nameInput().maxLength).toBe(40)
    for (const bad of ['', '   ', '가'.repeat(41)]) {
      fireEvent.change(nameInput(), { target: { value: bad } })
      expect((saveButton() as HTMLButtonElement).disabled, JSON.stringify(bad)).toBe(true)
      expect(screen.getByText('부르는 이름을 1~40자로 적어 주세요.')).toBeTruthy()
      expect(nameInput().getAttribute('aria-invalid')).toBe('true')
    }
    fireEvent.change(nameInput(), { target: { value: `  ${'가'.repeat(40)}  ` } })
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false)
    expect(nameInput().getAttribute('aria-invalid')).toBeNull()
    const body = await save(onSave)
    expect(body.name).toBe('가'.repeat(40))
  })

  it('AC-7908.1: 매물 이름 + 층이 40자를 넘으면 처음 이름은 40자에서 자르고 끝 빈칸을 뺀다', () => {
    setup({ way: 'listing', listingId: 'x', listings: [{ ...LISTINGS[0]!, id: 'x', title: '나'.repeat(39), floorLabel: '12층' }] })
    expect(nameInput().value).toBe('나'.repeat(39))
    expect((saveButton() as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('AC-7908.1: 살필 범위 일곱 값(기본 1,000m)', () => {
  it('AC-7908.1: 범위 값은 300·500·700·1,000·1,500·2,000·3,000m이다', () => {
    expect(RADII).toEqual([300, 500, 700, 1000, 1500, 2000, 3000])
  })

  it('AC-7908.1: 막대는 일곱 칸, 처음 1km, 눈금 300m·1km·3km와 도움말', () => {
    setup()
    const slider = screen.getByRole('slider', { name: '살필 범위' }) as HTMLInputElement
    expect([slider.min, slider.max, slider.step, slider.value]).toEqual(['0', '6', '1', '3'])
    expect(slider.disabled).toBe(false)
    expect(slider.getAttribute('aria-valuetext')).toBe('1km')
    expect(screen.getByTestId('add-radius').textContent).toBe('1km')
    expect(screen.getByText('300m')).toBeTruthy()
    expect(screen.getByText('3km')).toBeTruthy()
    expect(screen.getByText('저장한 뒤에도 후보 자세히에서 바꿀 수 있어요.')).toBeTruthy()
  })

  it('AC-7908.1: 막대를 옮기면 글이 바뀌고(300m~3km) 고른 범위로 저장한다', async () => {
    const { onSave } = setup({ way: 'listing', listingId: 'l1' })
    const slider = screen.getByRole('slider', { name: '살필 범위' })
    const texts = ['300m', '500m', '700m', '1km', '1.5km', '2km', '3km']
    texts.forEach((text, i) => {
      fireEvent.change(slider, { target: { value: String(i) } })
      expect(slider.getAttribute('aria-valuetext')).toBe(text)
      expect(screen.getByTestId('add-radius').textContent).toBe(text)
    })
    fireEvent.change(slider, { target: { value: '0' } })
    const body = await save(onSave)
    expect(body.radiusM).toBe(300)
  })
})

describe('AC-7908.2: 저장 몸통에 카카오 주소 글이 없다(ADR-044)', () => {
  it('AC-7908.2: 주소로 찾기 — 몸통은 정해 둔 칸 여덟뿐이고 카카오 도로명·지번 글이 어디에도 없다(적은 주소 글만)', async () => {
    const { onSave } = setup()
    await findAddress('가람로 123')
    expect(screen.getAllByText(HITS[0]!.road!).length).toBeGreaterThan(0)
    const body = await save(onSave)
    expect(Object.keys(body).sort()).toEqual(['addressNote', 'floorLabel', 'lat', 'listingId', 'lng', 'memo', 'name', 'radiusM'])
    const text = JSON.stringify(body)
    for (const kakao of KAKAO_TEXTS) expect(text, kakao).not.toContain(kakao)
    expect(body.addressNote).toBe('가람로 123')
  })

  it('AC-7908.2: 지도 찍기 — 화면에 보인 그 자리 주소 글이 몸통에 없고 적은 주소 글은 빈칸이다', async () => {
    const { onSave } = setup({ way: 'map' })
    fireEvent.click(screen.getByRole('button', { name: '지도에서 이 자리 누르기' }))
    await screen.findByText(SPOT_ROAD)
    fireEvent.change(nameInput(), { target: { value: '하늘로 센터' } })
    const body = await save(onSave)
    const text = JSON.stringify(body)
    for (const kakao of KAKAO_TEXTS) expect(text, kakao).not.toContain(kakao)
    expect(body.addressNote).toBe('')
  })
})

describe('AC-7908.1: 저장하는 동안 · 실패', () => {
  it('AC-7908.1: 기다리는 동안 다시 눌러도 한 번만 부르고, 진행 `자료 {n}/{m}`을 보인다', async () => {
    let finish: (ok: boolean) => void = () => {}
    const onSave = vi.fn(() => new Promise<boolean>((resolve) => (finish = resolve)))
    setup({ way: 'listing', listingId: 'l1', onSave, progress: { done: 3, total: 12 } })
    fireEvent.click(saveButton())
    fireEvent.click(saveButton())
    expect(onSave).toHaveBeenCalledTimes(1)
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('자료 3/12')).toBeTruthy()
    await act(async () => finish(true))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('AC-7908.1: 저장 콜백이 실패를 돌려주면 E-LOC-SAVE-FAILED 카드를 보이고 적은 값은 그대로 둔다', async () => {
    const onSave = vi.fn(async () => false)
    setup({ way: 'listing', listingId: 'l1', onSave })
    fireEvent.change(nameInput(), { target: { value: '다시 할 자리' } })
    fireEvent.click(saveButton())
    const alert = await screen.findByRole('alert')
    expect(alert.textContent).toContain('E-LOC-SAVE-FAILED')
    expect(nameInput().value).toBe('다시 할 자리')
    expect(saveButton().getAttribute('aria-busy')).toBeNull()
    fireEvent.click(saveButton())
    await waitFor(() => expect(onSave).toHaveBeenCalledTimes(2))
  })
})

describe('AC-7908.1·AC-7917.1: 화면 글에 영어 낱말이 없다', () => {
  // m·km 같은 단위는 된다(글이 붙어 이어져도 — '300m1km3km')
  const latin = (text: string) => text.replace(/\d+(?:\.\d+)?k?m(?![A-Za-z])/g, '').match(/[A-Za-z]+/g) ?? []

  it('AC-7908.1: 세 길 모두 그린 글에 영어 낱말이 없다', async () => {
    setup()
    await findAddress('가람로 123')
    expect(latin(document.body.textContent ?? '')).toEqual([])
    fireEvent.click(way('지도에서 찍기'))
    fireEvent.click(screen.getByRole('button', { name: '지도에서 이 자리 누르기' }))
    await screen.findByText(SPOT_ROAD)
    expect(latin(document.body.textContent ?? '')).toEqual([])
    fireEvent.click(way('붙여 넣은 매물에서'))
    expect(latin(document.body.textContent ?? '')).toEqual([])
  })
})
