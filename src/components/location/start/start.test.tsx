// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { DongIndex } from '@/lib/location/regions'
import type { KeysReply, KeyState } from '@/types/location'
import { EmptyScreen } from './EmptyScreen'
import { KeyStatusList } from './KeyStatusList'
import { NoKeyScreen } from './NoKeyScreen'
import { KEY_ROWS, KEY_STATE_TEXT, showNoKey, type FreeTool } from './keys'

// 처음(후보 없음)·열쇠 없음 화면(spec location AC-7917.1, design.md 14·15절, requirements '화면 글 기본값' 열쇠 상태,
// 시안 docs/mockups/location/index.html ?s=empty·?s=no-key). 글은 명세 글 그대로 적어 견준다(시안 글과 다른 곳은 명세가 이긴다).
// 동 목록은 지어낸 이름만(fixtures/location/dongs/index.json과 같은 모양)

afterEach(cleanup)

const DATA_GETS =
  '사는 사람·세대, 아파트·입주 예정, 실거래가, 건물 서류, 둘레 병원·진료 시간·장비, 진료비, 가게, 개폐업, 경로당·체력단련장·학교·교통사고 다발 지역·전통시장, 역·정류장 타고 내린 사람(사람 흐름), 의료급여·차상위'
const MAP_GETS = '지도, 거리 사진(로드뷰)·하늘 사진'
const KAKAO_GETS = '주소 찾기, 둘레 시설(약국·마트·큰 병원·산업단지)'

const NOKEY_TITLE = '자료 열쇠를 넣으면 시작할 수 있어요'
const NOKEY_LEAD =
  '공공데이터포털 열쇠와 카카오 열쇠는 사이트 서버 설정에 넣어요. 넣기 어려우면 관리자에게 알려 주세요. 열쇠는 대화창이나 메신저에 붙이지 마세요.'
const NOKEY_NOTE =
  "자료 열쇠는 자료를 주는 사이트가 '이 앱이 받아 가도 돼요'라고 내어 주는 긴 비밀번호예요. 셋 다 무료예요. 이 화면에는 열쇠 넣는 칸이 없어요. 열쇠는 사이트 서버 설정에 넣고, 여기서는 넣었는지만 보여요."
const FREE_LINE = '열쇠 없이도 되는 것: 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산.'
const ALL_IN_LINE = '자료 열쇠(공공데이터포털 · 카카오 지도 · 카카오 장소 찾기)가 들어 있어요.'
const MAP_ONLY_LINE = '카카오 지도 열쇠를 넣으면 지도가 보여요. 숫자는 지도 없이도 볼 수 있어요.'

const EMPTY_TITLE = '아직 후보가 없어요'
const EMPTY_LEAD =
  '새로 개원할 자리를 넓게 훑고 깊게 봐요. 시·구를 고르면 동마다 점수를 매겨 좋은 동을 먼저 알려 주고, 마음에 드는 자리를 후보로 저장하면 그 둘레를 깊게 살펴봐요.'
const STEPS = [
  ['동네 훑기', '시·구를 고르면 행정동마다 점수 색을 칠해 보여 주고, 좋은 동 차례와 까닭을 알려 줘요.'],
  ['후보 더하기', '주소를 넣거나, 지도에서 찍거나, 네이버 부동산에서 본 매물을 붙여 넣어 후보로 저장해요.'],
  ['깊게 보고 견주기', '위험 신호·경쟁 의원·진료 시간 빈틈·건물 서류를 가지 않고 보고, 후보끼리 점수표로 견줘요.'],
  ['개원 준비', '개원 비용·손익분기·일정표·건물 요건을 챙기고, 한 장 보고서로 뽑아요.'],
]

const MISSING: KeysReply = { data: 'missing', kakao: 'missing' }
const ALL_OK: KeysReply = { data: 'ok', kakao: 'ok' }
const STATES: [KeyState, string][] = [
  ['ok', '들어 있어요'],
  ['missing', '안 넣음'],
  ['rejected', '열쇠가 맞지 않아요'],
  ['failed', '확인하지 못했어요'],
]

const INDEX: DongIndex = {
  asOf: '2026-07-01',
  sidos: [
    {
      code2: '99',
      name: '가상도',
      sggs: [
        { code5: '99110', name: '가람구', bbox: [127.0, 37.5, 127.03, 37.52] },
        { code5: '99120', name: '나래구', bbox: [127.03, 37.5, 127.06, 37.52] },
      ],
    },
    { code2: '98', name: '먼바다도', sggs: [{ code5: '98110', name: '마루군', bbox: [128.0, 36.0, 128.1, 36.1] }] },
  ],
}

// 화면 글·보조 글(aria-label·title·placeholder·alt)의 로마자 낱말. 명세가 허락한 이름·단위만 남아도 된다
const ALLOWED_LATIN = ['SGIS', 'TASIS', 'KTX', 'MRI', 'CT', 'km', 'PDF', 'A4']
const latinWords = (root: HTMLElement) => {
  const attrs = [...root.querySelectorAll('*')].flatMap((el) =>
    ['aria-label', 'title', 'placeholder', 'alt'].map((name) => el.getAttribute(name) ?? ''),
  )
  return [root.textContent ?? '', ...attrs]
    .flatMap((text) => text.match(/[A-Za-z][A-Za-z0-9]*/g) ?? [])
    .filter((word) => !ALLOWED_LATIN.includes(word))
}
// 그린 클래스 가운데 화면 폭 따라 바뀌는 것(sm:·md:·lg:·xl:·max-*:·min-*:·min-[…]:·max-[…]:)
const WIDTH_VARIANT = /^(?:(?:max-|min-)?(?:sm|md|lg|\d*xl)|(?:min|max)-\[[^\]]*\])$/
const widthClasses = (root: HTMLElement) =>
  [...root.querySelectorAll('[class]')]
    .flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/))
    .filter((token) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)))
const writableFields = (root: HTMLElement) => root.querySelectorAll('input, textarea, [contenteditable]')
const rowsOf = (root: HTMLElement) => within(within(root).getByRole('list', { name: '열쇠 상태' })).getAllByRole('listitem')

describe('AC-7917.1: 열쇠 상태 글(화면 글 기본값)', () => {
  it('AC-7917.1: 열쇠 셋 줄 — 이름·받는 자료가 화면 글 기본값 그대로, 차례는 공공데이터포털 · 카카오 지도 · 카카오 장소 찾기', () => {
    expect(KEY_ROWS).toEqual([
      { id: 'data', name: '공공데이터포털 열쇠', gets: DATA_GETS },
      { id: 'map', name: '카카오 지도 열쇠', gets: MAP_GETS },
      { id: 'kakao', name: '카카오 장소 찾기 열쇠', gets: KAKAO_GETS },
    ])
    const { container } = render(<KeyStatusList keys={MISSING} mapKey="missing" />)
    expect(rowsOf(container).map((row) => row.textContent)).toEqual([
      `공공데이터포털 열쇠받는 자료: ${DATA_GETS}안 넣음`,
      `카카오 지도 열쇠받는 자료: ${MAP_GETS}안 넣음`,
      `카카오 장소 찾기 열쇠받는 자료: ${KAKAO_GETS}안 넣음`,
    ])
  })

  it('AC-7917.1: 상태 표 네 글 — ok 들어 있어요 · missing 안 넣음 · rejected 열쇠가 맞지 않아요 · failed 확인하지 못했어요', () => {
    expect(KEY_STATE_TEXT).toEqual(Object.fromEntries(STATES))
  })

  it.each(STATES)('AC-7917.1: 공공데이터포털·카카오 장소 찾기 열쇠가 %s이면 그 줄 상태 표가 "%s"', (state, text) => {
    const { container } = render(<KeyStatusList keys={{ data: state, kakao: state }} mapKey="ok" />)
    const [data, map, kakao] = rowsOf(container)
    expect(within(data!).getByText(text)).toBeTruthy()
    expect(within(kakao!).getByText(text)).toBeTruthy()
    expect(within(map!).getByText('들어 있어요')).toBeTruthy()
  })

  it('AC-7917.1: 줄마다 제 열쇠 상태만 — 공공 들어 있어요 · 지도 안 넣음 · 장소 찾기 열쇠가 맞지 않아요', () => {
    const { container } = render(<KeyStatusList keys={{ data: 'ok', kakao: 'rejected' }} mapKey="missing" />)
    expect(rowsOf(container).map((row) => row.textContent)).toEqual([
      `공공데이터포털 열쇠받는 자료: ${DATA_GETS}들어 있어요`,
      `카카오 지도 열쇠받는 자료: ${MAP_GETS}안 넣음`,
      `카카오 장소 찾기 열쇠받는 자료: ${KAKAO_GETS}열쇠가 맞지 않아요`,
    ])
  })

  it('AC-7917.1: 열쇠 없음 화면은 공공데이터포털·카카오 장소 찾기 열쇠가 둘 다 안 넣음일 때만(design.md 14절)', () => {
    expect(showNoKey({ data: 'missing', kakao: 'missing' })).toBe(true)
    expect(showNoKey({ data: 'ok', kakao: 'missing' })).toBe(false)
    expect(showNoKey({ data: 'missing', kakao: 'ok' })).toBe(false)
    expect(showNoKey({ data: 'missing', kakao: 'rejected' })).toBe(false)
    expect(showNoKey({ data: 'failed', kakao: 'failed' })).toBe(false)
  })
})

describe('AC-7917.1: 열쇠 없음 화면', () => {
  it('AC-7917.1: 머리(입지 분석 · 관리자만 보여요)와 design.md 15절 글 — 제목·서버 설정 안내·열쇠 셋 줄·알림·열쇠 없이 되는 것', () => {
    const { container } = render(<NoKeyScreen keys={MISSING} mapKey="missing" onOpen={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: '입지 분석' })).toBeTruthy()
    expect(screen.getByText('관리자만 보여요')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: NOKEY_TITLE })).toBeTruthy()
    expect(screen.getByText(NOKEY_LEAD)).toBeTruthy()
    expect(rowsOf(container)).toHaveLength(3)
    expect(screen.getByRole('note').textContent).toBe(NOKEY_NOTE)
    expect(screen.getByText(FREE_LINE)).toBeTruthy()
  })

  it('AC-7917.1: 열쇠 셋 줄에 지금 상태 — 지도 열쇠만 넣었으면 지도 줄만 들어 있어요', () => {
    const { container } = render(<NoKeyScreen keys={MISSING} mapKey="ok" onOpen={vi.fn()} />)
    expect(rowsOf(container).map((row) => row.textContent?.endsWith('들어 있어요'))).toEqual([false, true, false])
  })

  it('AC-7917.1: 열쇠 입력 칸이 없다 — 입력·글 칸·고르기 칸이 하나도 없고 열쇠를 넣는 단추도 없다', () => {
    const { container } = render(<NoKeyScreen keys={MISSING} mapKey="missing" onOpen={vi.fn()} />)
    expect(container.querySelectorAll('input, textarea, select, [contenteditable]')).toHaveLength(0)
    expect(screen.queryAllByRole('textbox')).toHaveLength(0)
    expect(screen.getAllByRole('button').filter((button) => button.textContent?.includes('열쇠'))).toHaveLength(0)
  })

  it('AC-7917.1: 열쇠 없이 되는 것 세 가지 단추 — 매물 붙여 넣기 · 진행 메모 · 개원 비용 계산', () => {
    const onOpen = vi.fn()
    render(<NoKeyScreen keys={MISSING} mapKey="missing" onOpen={onOpen} />)
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['매물 붙여 넣기', '진행 메모', '개원 비용 계산'])
    fireEvent.click(screen.getByRole('button', { name: '매물 붙여 넣기' }))
    fireEvent.click(screen.getByRole('button', { name: '진행 메모' }))
    fireEvent.click(screen.getByRole('button', { name: '개원 비용 계산' }))
    expect(onOpen.mock.calls).toEqual([['listings'], ['memo'], ['costs']])
  })

  it('AC-7917.1: 화면 글에 영어 사이트·도구 이름이 없다(시안의 서버 설정·도우미 이름 글은 명세 글로 바뀜)', () => {
    const { container } = render(<NoKeyScreen keys={MISSING} mapKey="missing" onOpen={vi.fn()} />)
    expect(latinWords(container)).toEqual([])
  })

  it('AC-7917.1: PC 모양 하나 — 화면 폭 따라 바뀌는 클래스가 없다', () => {
    const { container } = render(<NoKeyScreen keys={MISSING} mapKey="missing" onOpen={vi.fn()} />)
    expect(widthClasses(container)).toEqual([])
  })
})

describe('AC-7917.1: 처음(후보 없음) 화면', () => {
  type Shown = Pick<Parameters<typeof EmptyScreen>[0], 'index' | 'keys' | 'mapKey'>
  const renderEmpty = (over: Partial<Shown> = {}) => {
    const props = {
      onScan: vi.fn<(code5: string) => void>(),
      onAdd: vi.fn<() => void>(),
      onOpen: vi.fn<(to: FreeTool) => void>(),
    }
    const shown: Shown = { index: INDEX, keys: ALL_OK, mapKey: 'ok', ...over }
    return { ...render(<EmptyScreen {...shown} {...props} />), props }
  }
  const optionNames = (label: string) =>
    within(screen.getByLabelText(label)).getAllByRole('option').map((option) => option.textContent)

  it('AC-7917.1: 머리와 시안 글 — 제목·설명·네 걸음', () => {
    renderEmpty()
    expect(screen.getByRole('heading', { level: 1, name: '입지 분석' })).toBeTruthy()
    expect(screen.getByText('관리자만 보여요')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 2, name: EMPTY_TITLE })).toBeTruthy()
    expect(screen.getByText(EMPTY_LEAD)).toBeTruthy()
    const steps = within(screen.getByRole('list', { name: '시작하는 차례' })).getAllByRole('listitem')
    expect(steps.map((step) => step.textContent)).toEqual(STEPS.map(([title, text], i) => `${i + 1}${title}${text}`))
  })

  it('AC-7917.1: 열쇠가 셋 다 들어 있으면 한 줄 — 자료 열쇠(…)가 들어 있어요.', () => {
    renderEmpty()
    expect(screen.getByText(ALL_IN_LINE)).toBeTruthy()
    expect(screen.queryByRole('list', { name: '열쇠 상태' })).toBeNull()
  })

  it('AC-7917.1: 들어 있지 않은 열쇠가 있으면 한 줄 대신 열쇠 셋 줄과 상태(확인하지 못했어요)', () => {
    const { container } = renderEmpty({ keys: { data: 'ok', kakao: 'failed' } })
    expect(screen.queryByText(ALL_IN_LINE)).toBeNull()
    expect(rowsOf(container).map((row) => row.textContent)).toEqual([
      `공공데이터포털 열쇠받는 자료: ${DATA_GETS}들어 있어요`,
      `카카오 지도 열쇠받는 자료: ${MAP_GETS}들어 있어요`,
      `카카오 장소 찾기 열쇠받는 자료: ${KAKAO_GETS}확인하지 못했어요`,
    ])
    expect(screen.queryByText(MAP_ONLY_LINE)).toBeNull()
  })

  it('AC-7917.1: 지도 열쇠가 없으면 열쇠 셋 줄 아래 지도 글(design.md 15절)', () => {
    const { container } = renderEmpty({ mapKey: 'missing' })
    expect(rowsOf(container)[1]!.textContent).toBe(`카카오 지도 열쇠받는 자료: ${MAP_GETS}안 넣음`)
    expect(screen.getByText(MAP_ONLY_LINE)).toBeTruthy()
  })

  it('AC-7917.1: 시·도 → 시·군·구를 고르고 [동네 훑기 시작]을 누르면 그 시군구 코드 5자리로 부른다', () => {
    const { props } = renderEmpty()
    expect(optionNames('시·도')).toEqual(['가상도', '먼바다도'])
    expect(optionNames('시·군·구')).toEqual(['가람구', '나래구'])
    fireEvent.click(screen.getByRole('button', { name: '동네 훑기 시작' }))
    fireEvent.change(screen.getByLabelText('시·군·구'), { target: { value: '99120' } })
    fireEvent.click(screen.getByRole('button', { name: '동네 훑기 시작' }))
    fireEvent.change(screen.getByLabelText('시·도'), { target: { value: '98' } })
    expect(optionNames('시·군·구')).toEqual(['마루군'])
    fireEvent.click(screen.getByRole('button', { name: '동네 훑기 시작' }))
    expect(props.onScan.mock.calls).toEqual([['99110'], ['99120'], ['98110']])
  })

  it('AC-7917.1: 동 목록을 아직 못 받았으면 고르기 칸과 [동네 훑기 시작]이 막힌다', () => {
    const { props } = renderEmpty({ index: null })
    expect((screen.getByLabelText('시·도') as HTMLSelectElement).disabled).toBe(true)
    expect((screen.getByLabelText('시·군·구') as HTMLSelectElement).disabled).toBe(true)
    const start = screen.getByRole('button', { name: '동네 훑기 시작' }) as HTMLButtonElement
    expect(start.disabled).toBe(true)
    fireEvent.click(start)
    expect(props.onScan).not.toHaveBeenCalled()
  })

  it('AC-7917.1: [주소로 후보 더하기]·[매물 붙여 넣기]', () => {
    const { props } = renderEmpty()
    fireEvent.click(screen.getByRole('button', { name: '주소로 후보 더하기' }))
    fireEvent.click(screen.getByRole('button', { name: '매물 붙여 넣기' }))
    expect(props.onAdd).toHaveBeenCalledTimes(1)
    expect(props.onOpen.mock.calls).toEqual([['listings']])
  })

  it('AC-7917.1: 열쇠 입력 칸이 없다 — 고르기 칸은 시·도·시·군·구 둘뿐이고 입력·글 칸이 없다', () => {
    const { container } = renderEmpty({ keys: MISSING, mapKey: 'missing' })
    expect(writableFields(container)).toHaveLength(0)
    expect([...container.querySelectorAll('select')].map((select) => select.labels?.[0]?.textContent)).toEqual(['시·도', '시·군·구'])
  })

  it.each([
    ['셋 다 들어 있음', ALL_OK, 'ok'],
    ['안 넣음·맞지 않음', { data: 'missing', kakao: 'rejected' }, 'missing'],
  ] as const)('AC-7917.1: 화면 글에 영어 사이트·도구 이름이 없다(%s)', (_name, keys, mapKey) => {
    const { container } = renderEmpty({ keys, mapKey })
    expect(latinWords(container)).toEqual([])
  })

  it('AC-7917.1: PC 모양 하나 — 화면 폭 따라 바뀌는 클래스가 없다', () => {
    const { container } = renderEmpty({ keys: { data: 'ok', kakao: 'failed' }, mapKey: 'missing' })
    expect(widthClasses(container)).toEqual([])
  })
})
