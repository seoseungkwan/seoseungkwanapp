// @vitest-environment jsdom
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { GsheetStorageError, listGsheetRuns, loadGsheetSettings, saveGsheetSettings, setSecretTag } from '@/lib/storage/gsheet'
import { DEFAULT_GSHEET_SETTINGS, type GsheetRun, type GsheetSaved, type GsheetSettings } from '@/types/gsheet'
import { SheetSettings } from './SheetSettings'

// 수납일지 시트 설정 화면(spec google-link REQ-8516 AC-8516.1~6·REQ-8517 AC-8517.1, 시안 docs/mockups/google-link/sunap.html ?s=settings,
// notes-sunap '### `settings`', design.md 2절 표 17·9-2). 화면 글은 notes 글자를 그대로 적어 견준다(labels.ts를 import하지 않음).
// 도우미는 가짜 call, 저장은 lib/storage/gsheet를 가짜로 바꾼다. 메일은 @fake.test, 비밀 글자 표시·주소는 지어낸 값만 쓴다

vi.mock('@/lib/storage/gsheet', async (importOriginal) => {
  const real = await importOriginal<typeof import('@/lib/storage/gsheet')>()
  return { ...real, saveGsheetSettings: vi.fn(), setSecretTag: vi.fn(), loadGsheetSettings: vi.fn(), listGsheetRuns: vi.fn() }
})

const save = vi.mocked(saveGsheetSettings)
const setTag = vi.mocked(setSecretTag)
const load = vi.mocked(loadGsheetSettings)
const runs = vi.mocked(listGsheetRuns)

const NOW = new Date('2026-11-26T14:41:00+09:00')
const TAG = '0123456789abcdef'
const NEW_TAG = 'fedcba9876543210'
const URL_A = 'https://script.google.com/macros/s/AKfakeScriptAAAA1234/exec'
const URL_B = 'https://script.google.com/macros/s/AKfakeScriptBBBB5678/exec'
const TEMPLATE = 'https://docs.google.com/spreadsheets/d/fakeTemplate1234567890/edit'
const CLIENT = { from: vi.fn() } as unknown as Parameters<typeof SheetSettings>[0]['client']

const settingsWith = (patch: Partial<GsheetSettings> = {}): GsheetSettings => ({
  ...structuredClone(DEFAULT_GSHEET_SETTINGS),
  templateUrl: TEMPLATE,
  deptRooms: { OS: 1, OS2: 2, PM: 3 },
  deptRoomsHospital: '1',
  ...patch,
})
const SAVED: GsheetSaved = { settings: settingsWith(), secretTag: TAG }

const status = (patch: Record<string, unknown> = {}) => ({
  v: 1,
  secretTag: TAG,
  bitsheet: false,
  codeVersion: '8',
  url: URL_A,
  shareWith: ['staff1@fake.test', 'staff2@fake.test'],
  verified: true,
  ...patch,
})
const CATALOG = {
  v: 1,
  hospitals: [{ code: '1', name: '샘플정형외과의원', recent: 1204 }],
  depts: [
    { code: 'OS3', name: '정형외과 3진료실', n90: 0, today: false },
    { code: 'PM', name: '재활의학과', n90: 388, today: true },
    { code: 'OS', name: '정형외과 1진료실', n90: 1912, today: true },
    { code: 'OS2', name: '정형외과 2진료실', n90: 1204, today: true },
  ],
  rx: [
    { code: 'MM070', name: '표층열 치료', cls: '물리치료', n90: 1830 },
    { code: 'KK010', name: '관절강내 주사', cls: '주사', n90: 412 },
    { code: 'LA222', name: '신경차단술 — 요추 경막외', cls: '주사', n90: 348 },
  ],
  hospitalName: '샘플정형외과의원',
}
const PING_OK = { v: 1, ok: true, templateTitle: '샘플정형외과의원 일일수납일지 (원본)', version: '8' }

type Handler = unknown | ((args: Record<string, unknown>) => unknown)
const fail = (code: string) => () => {
  throw Object.assign(new Error(code), { code })
}

function fakeCall(over: Record<string, Handler> = {}) {
  const handlers: Record<string, Handler> = { 'sheet.status': status(), 'sheet.catalog': CATALOG, 'sheet.ping': PING_OK, ...over }
  return vi.fn(async (cmd: string, args: Record<string, unknown>) => {
    const handler = handlers[cmd]
    if (handler === undefined) throw Object.assign(new Error('unknown'), { code: 'E-HELPER-UNKNOWN-COMMAND' })
    return typeof handler === 'function' ? await (handler as (a: Record<string, unknown>) => unknown)(args) : handler
  })
}

async function open(options: { call?: ReturnType<typeof fakeCall>; saved?: GsheetSaved } = {}) {
  const call = options.call ?? fakeCall()
  const onChanged = vi.fn()
  const onClose = vi.fn()
  const view = render(
    <SheetSettings client={CLIENT} call={call} saved={options.saved ?? SAVED} onChanged={onChanged} onClose={onClose} now={() => NOW} />,
  )
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
  return { call, onChanged, onClose, view, user: userEvent.setup() }
}

const box = (name: string | RegExp) => screen.getByRole('textbox', { name }) as HTMLInputElement
const button = (name: string | RegExp) => screen.getByRole('button', { name }) as HTMLButtonElement
const section = (name: string) => within(screen.getByRole('region', { name }))
const savedArg = () => save.mock.calls[save.mock.calls.length - 1]![1]
const linkCalls = (call: ReturnType<typeof fakeCall>) => call.mock.calls.filter(([cmd]) => cmd === 'sheet.link')

const run = (at: string, patch: Partial<GsheetRun> = {}): GsheetRun => ({
  at,
  day: '2026-11-26',
  via: 'auto',
  mode: 'fillEmpty',
  outcome: 'ok',
  code: null,
  rows: 12,
  counts: {},
  cells: [],
  ...patch,
})

beforeEach(() => {
  save.mockReset().mockResolvedValue(undefined)
  setTag.mockReset().mockResolvedValue(undefined)
  load.mockReset()
  runs.mockReset().mockResolvedValue([])
})
afterEach(cleanup)

describe('AC-8516.1 설정 화면 틀(시안 ?s=settings)', () => {
  it('AC-8516.1: 머리·왼쪽 목차 넷·안내 글·네 칸 제목·아래 [취소][저장]이 시안 글 그대로다', async () => {
    await open()
    expect(button('‹ 시트로 돌아가기')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '수납일지 시트 설정' })).toBeTruthy()
    expect(screen.getByText('이 병원 하나의 설정이에요 · 비트 목록은 이 PC(비트 PC)에서 읽어요')).toBeTruthy()
    const nav = within(screen.getByRole('navigation'))
    expect(nav.getAllByRole('link').map((a) => a.textContent)).toEqual(['구글 연결', '시트', '비트 맞춤', '저절로 넣기'])
    expect(nav.getByText('바꾼 것은 아래 [저장]을 눌러야 들어가요. 저장한 뒤 다음 넣기부터 새 설정으로 넣어요.')).toBeTruthy()
    expect(screen.getByRole('heading', { name: '구글 연결 병원마다 한 번' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '시트 어느 파일, 어느 칸' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '비트 맞춤 병원마다 다르게 · 목록은 이 PC 비트에서 읽어요' })).toBeTruthy()
    expect(screen.getByRole('heading', { name: '저절로 넣기 거의 실시간' })).toBeTruthy()
    expect(button('취소')).toBeTruthy()
    expect(button('저장')).toBeTruthy()
  })

  it('AC-8516.1: [‹ 시트로 돌아가기]·[취소]는 저장하지 않고 닫는다', async () => {
    const { onClose, user } = await open()
    await user.click(button('‹ 시트로 돌아가기'))
    await user.click(button('취소'))
    expect(onClose).toHaveBeenCalledTimes(2)
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-8516.1: 열면 도우미에 sheet.status·sheet.catalog를 묻고, 오늘 0시(한국) 뒤 기록을 읽는다', async () => {
    const { call } = await open()
    expect(call).toHaveBeenCalledWith('sheet.status', {})
    expect(call).toHaveBeenCalledWith('sheet.catalog', {})
    expect(runs).toHaveBeenCalledWith(CLIENT, '2026-11-26T00:00:00+09:00')
  })
})

describe('AC-8516.2 구글 연결', () => {
  it('AC-8516.2: 코드 복사·주소·넣는 PC 줄 글이 시안 그대로이고, 주소·메일 칸은 sheet.status 값으로 채운다', async () => {
    await open()
    const g = section('구글 연결')
    expect(g.getByText('1. 구글에 붙일 코드')).toBeTruthy()
    expect(g.getByText('병원 구글 계정으로 로그인한 뒤, 이 코드를 구글 자동 실행 도구(script.google.com)에 붙여 넣고 배포해요. 순서는 안내문에 있어요.')).toBeTruthy()
    expect(g.getByRole('button', { name: '구글에 붙일 코드 복사' })).toBeTruthy()
    expect(g.getByRole('button', { name: '안내문 열기' })).toBeTruthy()
    expect(g.getByText('코드 안에 이 PC만 아는 비밀 글자가 들어 있어요. 다른 사람에게 보내지 마세요.')).toBeTruthy()
    expect(box('2. 구글에서 받은 주소').value).toBe(URL_A)
    expect(box('2. 구글에서 받은 주소').placeholder).toBe('https://script.google.com/macros/s/…/exec')
    expect(g.getByText('아직 시험하지 않았어요.')).toBeTruthy()
    expect(g.getByText('이 PC')).toBeTruthy()
    expect(g.getByText('비트 도우미 연결됨 · 비밀 글자가 이 PC에 있어요')).toBeTruthy()
    expect(g.getByText('넣기는 비밀 글자가 있는 이 PC에서만 해요. 다른 PC에서 [구글에 붙일 코드 복사]를 하면 그 PC가 넣는 PC가 되고, 이 PC는 더 넣지 못해요.')).toBeTruthy()
    expect(box('함께 쓸 직원 메일').value).toBe('staff1@fake.test, staff2@fake.test')
  })

  it('AC-8516.2: [구글에 붙일 코드 복사]는 sheet.code를 부르고 서버 secret_tag만 새로 적은 뒤 복사 알림을 보인다', async () => {
    const { call, onChanged, user } = await open({ call: fakeCall({ 'sheet.code': { v: 1, secretTag: NEW_TAG, codeVersion: '8' } }) })
    await user.click(button('구글에 붙일 코드 복사'))
    expect(call).toHaveBeenCalledWith('sheet.code', {})
    expect(setTag).toHaveBeenCalledWith(CLIENT, NEW_TAG)
    expect(save).not.toHaveBeenCalled()
    expect(await screen.findByText('복사했어요. 구글 자동 실행 도구의 코드 칸에 붙여 넣으세요. 순서는 [안내문 열기]에 있어요.')).toBeTruthy()
    expect(onChanged).toHaveBeenCalledWith({ settings: SAVED.settings, secretTag: NEW_TAG })
  })

  it('AC-8516.2: 도우미 답에 정해 둔 칸 밖(비밀 글자 같은)이 섞이면 쓰지 않고 오류 카드, 그 글자는 화면에 없다', async () => {
    const secret = 'fakeSecretLetters-ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456'
    const { view, user } = await open({ call: fakeCall({ 'sheet.code': { v: 1, secretTag: NEW_TAG, codeVersion: '8', token: secret } }) })
    await user.click(button('구글에 붙일 코드 복사'))
    expect(await screen.findByText('오류 번호 E-BRIDGE-BAD-REPLY')).toBeTruthy()
    expect(setTag).not.toHaveBeenCalled()
    expect(view.container.innerHTML).not.toContain(secret)
  })

  it('AC-8516.2: 이 PC가 비밀 글자를 못 읽고 서버에는 넣는 PC 표시가 있으면 먼저 묻고, [새로 만들기]를 눌러야 sheet.code를 부른다', async () => {
    const call = fakeCall({ 'sheet.status': status({ secretTag: null }), 'sheet.code': { v: 1, secretTag: NEW_TAG, codeVersion: '8' } })
    const { user } = await open({ call })
    await user.click(button('구글에 붙일 코드 복사'))
    const ask = within(screen.getByRole('dialog'))
    expect(
      ask.getByText(
        '이 PC에서 비밀 글자를 읽지 못했어요(다른 PC에서 옮겨 온 설정일 수 있어요). 새 비밀 글자를 만들어 코드에 넣을까요? 새로 만들면 구글에 코드를 다시 붙이고 새 버전으로 배포해야 해요.',
      ),
    ).toBeTruthy()
    await user.click(ask.getByRole('button', { name: '취소' }))
    expect(call.mock.calls.some(([cmd]) => cmd === 'sheet.code')).toBe(false)
    await user.click(button('구글에 붙일 코드 복사'))
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: '새로 만들기' }))
    expect(call).toHaveBeenCalledWith('sheet.code', {})
    await waitFor(() => expect(setTag).toHaveBeenCalledWith(CLIENT, NEW_TAG))
  })

  it('AC-8516.2: 도우미가 없는 PC에서는 주소·메일 두 칸이 비고 잠기며 [연결 시험]도 잠긴다', async () => {
    await open({ call: fakeCall({ 'sheet.status': fail('E-BRIDGE-DISCONNECTED') }) })
    expect(box('2. 구글에서 받은 주소').value).toBe('')
    expect(box('2. 구글에서 받은 주소').disabled).toBe(true)
    expect(box('함께 쓸 직원 메일').value).toBe('')
    expect(box('함께 쓸 직원 메일').disabled).toBe(true)
    expect(button('연결 시험').disabled).toBe(true)
  })

  it('AC-8516.2: 비밀 글자가 없는 PC는 두 칸이 비고 잠기고, 코드를 복사해 비밀 글자가 생기면 풀린다', async () => {
    const call = fakeCall({ 'sheet.status': status({ secretTag: null, url: null, shareWith: [] }), 'sheet.code': { v: 1, secretTag: NEW_TAG, codeVersion: '8' } })
    const { user } = await open({ call, saved: { settings: settingsWith(), secretTag: null } })
    expect(box('2. 구글에서 받은 주소').disabled).toBe(true)
    expect(box('함께 쓸 직원 메일').disabled).toBe(true)
    expect(screen.queryByText('비트 도우미 연결됨 · 비밀 글자가 이 PC에 있어요')).toBeNull()
    await user.click(button('구글에 붙일 코드 복사'))
    await waitFor(() => expect(box('2. 구글에서 받은 주소').disabled).toBe(false))
    expect(box('2. 구글에서 받은 주소').value).toBe('')
    expect(box('함께 쓸 직원 메일').disabled).toBe(false)
  })

  it('AC-8516.2: 주소가 바뀐 채 [저장]하면 sheet.link를 먼저 부르고, 기다리는 동안 칸 아래 글, 됨이면 서버에는 두 칸 없이 저장한다', async () => {
    let answer: (value: unknown) => void = () => undefined
    const call = fakeCall({ 'sheet.link': () => new Promise((resolve) => (answer = resolve)) })
    const { user } = await open({ call })
    await user.clear(box('2. 구글에서 받은 주소'))
    await user.type(box('2. 구글에서 받은 주소'), URL_B)
    await user.click(button('저장'))
    expect(await screen.findByText('이 PC 화면에 뜬 확인 창에서 [바꾸기]를 눌러 주세요.')).toBeTruthy()
    expect(call).toHaveBeenCalledWith('sheet.link', { url: URL_B, shareWith: ['staff1@fake.test', 'staff2@fake.test'] })
    expect(save).not.toHaveBeenCalled()
    await act(async () => answer({ v: 1, ok: true }))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    const sent = JSON.stringify(savedArg())
    expect(sent).not.toMatch(/scriptUrl|"url"|shareWith/)
    expect(sent).not.toContain(URL_B)
    expect(sent).not.toContain('@fake.test')
    expect(screen.queryByText('이 PC 화면에 뜬 확인 창에서 [바꾸기]를 눌러 주세요.')).toBeNull()
  })

  it('AC-8516.2: 확인 창에서 [취소](E-GSHEET-DECLINED)면 오류 카드, 두 칸은 전 값으로 돌아가고 저장하지 않는다', async () => {
    const call = fakeCall({ 'sheet.link': fail('E-GSHEET-DECLINED') })
    const { user } = await open({ call })
    await user.clear(box('2. 구글에서 받은 주소'))
    await user.type(box('2. 구글에서 받은 주소'), URL_B)
    await user.clear(box('함께 쓸 직원 메일'))
    await user.type(box('함께 쓸 직원 메일'), 'staff9@fake.test')
    await user.click(button('저장'))
    expect(call).toHaveBeenCalledWith('sheet.link', { url: URL_B, shareWith: ['staff9@fake.test'] })
    expect((await screen.findAllByText('이 PC의 확인 창에서 주소를 바꾸지 않았어요. 넣기는 전에 쓰던 주소로 해요.')).length).toBeGreaterThan(0)
    expect(screen.getAllByText('오류 번호 E-GSHEET-DECLINED').length).toBeGreaterThan(0)
    expect(box('2. 구글에서 받은 주소').value).toBe(URL_A)
    expect(box('함께 쓸 직원 메일').value).toBe('staff1@fake.test, staff2@fake.test')
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-8516.2: 두 칸이 그대로면 [저장]은 sheet.link를 부르지 않는다', async () => {
    const { call, user } = await open()
    await user.click(button('저장'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(linkCalls(call)).toEqual([])
  })

  it('AC-8516.2: [연결 시험]은 시험하는 중… → [연결됨] 원본 이름 글, sheet.ping에는 주소·메일을 넘기지 않는다', async () => {
    let answer: (value: unknown) => void = () => undefined
    const call = fakeCall({ 'sheet.ping': () => new Promise((resolve) => (answer = resolve)) })
    const { user } = await open({ call })
    await user.click(button('연결 시험'))
    expect(await screen.findByText('시험하는 중…')).toBeTruthy()
    expect(linkCalls(call)).toEqual([])
    await act(async () => answer(PING_OK))
    expect(await screen.findByText('연결됨')).toBeTruthy()
    expect(screen.getByText("원본 시트 '샘플정형외과의원 일일수납일지 (원본)'을 읽을 수 있어요.")).toBeTruthy()
    const pingArgs = call.mock.calls.find(([cmd]) => cmd === 'sheet.ping')![1]
    expect(Object.keys(pingArgs)).toEqual(['settings'])
    expect(JSON.stringify(pingArgs)).not.toMatch(/scriptUrl|"url"|shareWith|@fake\.test/)
    expect((pingArgs.settings as GsheetSettings).templateUrl).toBe(TEMPLATE)
  })

  it('AC-8516.2: 메일이 바뀐 채 [연결 시험]이면 sheet.link 다음에 sheet.ping을 부른다', async () => {
    const call = fakeCall({ 'sheet.link': { v: 1, ok: true } })
    const { user } = await open({ call })
    await user.clear(box('함께 쓸 직원 메일'))
    await user.type(box('함께 쓸 직원 메일'), 'staff1@fake.test')
    await user.click(button('연결 시험'))
    expect(await screen.findByText('연결됨')).toBeTruthy()
    const cmds = call.mock.calls.map(([cmd]) => cmd).filter((cmd) => cmd === 'sheet.link' || cmd === 'sheet.ping')
    expect(cmds).toEqual(['sheet.link', 'sheet.ping'])
    expect(call).toHaveBeenCalledWith('sheet.link', { url: URL_A, shareWith: ['staff1@fake.test'] })
  })

  it('AC-8516.2: 구글 코드가 옛 판이면 [연결됨] 글 뒤에 덧붙임 글', async () => {
    const { user } = await open({ call: fakeCall({ 'sheet.ping': { ...PING_OK, version: '7' } }) })
    await user.click(button('연결 시험'))
    expect(
      await screen.findByText(
        "원본 시트 '샘플정형외과의원 일일수납일지 (원본)'을 읽을 수 있어요. 다만 구글 코드가 옛 판이에요 — [구글에 붙일 코드 복사]로 새로 붙이고 새 버전으로 배포해 주세요.",
      ),
    ).toBeTruthy()
  })

  it('AC-8516.2: 안 되면 [안 됨] + 까닭 글(수납 오류 번호 표의 글)', async () => {
    const { user } = await open({ call: fakeCall({ 'sheet.ping': { v: 1, ok: false, code: 'E-GSHEET-DENIED' } }) })
    await user.click(button('연결 시험'))
    expect(await screen.findByText('안 됨')).toBeTruthy()
    expect(screen.getByText("구글 웹 앱에 들어갈 수 없어요. 배포할 때 '액세스 권한: 모든 사용자'로 했는지 확인해 주세요.")).toBeTruthy()
  })

  it('AC-8516.2: 도우미에 닿지 못해 시험하지 못하면 [안 됨] + 비트 도우미 글', async () => {
    const { user } = await open({ call: fakeCall({ 'sheet.ping': fail('E-BRIDGE-DISCONNECTED') }) })
    await user.click(button('연결 시험'))
    expect(await screen.findByText('안 됨')).toBeTruthy()
    expect(screen.getByText('비트 도우미 연결을 확인해 주세요.')).toBeTruthy()
  })
})

describe('AC-8516.3 시트·비트 맞춤·저절로 넣기 칸과 기본값', () => {
  it('AC-8516.3: 시트 칸·기본값(비트시트 7판)·풀이 글이 시안 그대로다', async () => {
    await open({ saved: { settings: { ...settingsWith(), templateUrl: '' }, secretTag: TAG } })
    const s = section('시트')
    expect(box('원본 시트 주소').placeholder).toBe('https://docs.google.com/spreadsheets/d/…/edit')
    expect(box('새 달 파일 이름').value).toBe('{병원} 일일수납일지 {yyyy}년 {m}월')
    expect(
      s.getByText('예: 샘플정형외과의원 일일수납일지 2026년 12월 — 달이 바뀌면 원본을 복사해 저절로 만들어요. 그 달 파일이 이미 있으면 그것을 써요.'),
    ).toBeTruthy()
    expect(box('병원 이름').placeholder).toBe('비우면 비트의 병원 이름(샘플정형외과의원)')
    expect(s.getByText('파일 이름의 {병원} 자리에 들어가요.')).toBeTruthy()
    expect(box('넣을 폴더').placeholder).toBe('비우면 원본과 같은 폴더')
    expect(s.getByText('쉼표로 나눠 적어요. 새 달 파일을 만들 때 이 메일에 편집 권한을 줘요.')).toBeTruthy()
    expect(box('환자 줄 몇 줄부터').value).toBe('17')
    expect(box('환자 줄 몇 줄까지').value).toBe('302')
    const letters = ['차트번호', '이름', '기호', '금액', '진료실', '초진', '90일초진', 'Block(주사)', '물리치료', '비고'].map((n) => box(`${n} 칸 글자`).value)
    expect(letters).toEqual(['B', 'C', 'D', 'F', 'I', 'J', 'K', 'L', 'M', 'G'])
    expect(s.getByText('비고 칸은 비우면 비고 글을 넣지 않아요. 같은 칸 글자를 두 번 쓸 수 없어요.')).toBeTruthy()
    expect(box('표시 값').value).toBe('0')
    expect(s.getByText('초진·90일초진·Block(주사)·물리치료면 넣는 값(시트 식은 0을 셈)')).toBeTruthy()
    const signs = ['현금', '카드', '미수현금', '미수카드', '계좌이체', 'FREE'].map((n) => box(`${n} 기호 번호`).value)
    expect(signs).toEqual(['1', '2', '3', '4', '5', '6'])
    expect(s.getByText('현금과 카드를 나눠 냈으면 두 줄로 넣어요. 둘째 줄에는 이름·기호·금액만 들어가요(차트번호는 첫 줄만).')).toBeTruthy()
    expect(box('밀어 내릴 칸').value).toBe('A:P')
    expect(s.getByText('고급')).toBeTruthy()
    expect(s.getByText('늦게 낸 돈을 환자 바로 아래에 끼울 때 이 칸들만 아래로 밀어요(지출 칸은 그대로). 비우면 끼우지 않아요.')).toBeTruthy()
  })

  it('AC-8516.3: 비트 맞춤 — 병원·진료실 표·초진·처방 고르기·FREE·비고 글이 시안 그대로다', async () => {
    await open()
    const b = section('비트 맞춤')
    expect(within(b.getByRole('group', { name: '비트 병원' })).getByRole('button', { name: '고르기…' })).toBeTruthy()
    expect(b.getByText('저절로 정함 (병원이 여럿이면 최근 환자가 있는 병원)')).toBeTruthy()
    expect(b.getByText('비트에 병원이 여럿일 때만 필요해요.')).toBeTruthy()
    // 진료실 표: 최근 90일 환자가 있는 과(코드 차례) → 쓰지 않는 과
    const rooms = within(b.getByRole('table', { name: '진료실 (1~10)' }))
    expect(rooms.getAllByRole('combobox').map((c) => c.getAttribute('aria-label'))).toEqual([
      'OS 시트 진료실',
      'OS2 시트 진료실',
      'PM 시트 진료실',
      'OS3 시트 진료실',
    ])
    expect(rooms.getByText('최근 90일 환자 1,912')).toBeTruthy()
    expect(rooms.getByText('쓰지 않음')).toBeTruthy()
    expect(rooms.getAllByRole('combobox').map((c) => (c as HTMLSelectElement).value)).toEqual(['1', '2', '3', ''])
    expect(within(rooms.getByRole('combobox', { name: 'OS3 시트 진료실' })).getByRole('option', { name: '빈칸' })).toBeTruthy()
    expect(
      b.getByText('진료과 4개 · 번호는 시트 진료실(1~10). 처음에는 최근 90일 환자가 있는 과부터 1, 2, …를 저절로 붙여요. 맞춤이 없는 과는 빈칸으로 넣어요.'),
    ).toBeTruthy()
    expect(b.getByText('비트 진찰구분 기준')).toBeTruthy()
    expect((b.getByRole('checkbox', { name: '1 신환' }) as HTMLInputElement).checked).toBe(true)
    expect((b.getByRole('checkbox', { name: '2 과초진' }) as HTMLInputElement).checked).toBe(false)
    expect((b.getByRole('checkbox', { name: '3 90일초진' }) as HTMLInputElement).checked).toBe(true)
    expect(b.getByText('고른 처방 없음 → 주사 처방 전부 셈')).toBeTruthy()
    expect(b.getByText("고른 처방이 없으면 비트 처방 분류가 '주사료'·'마취료'인 처방(붕대 같은 재료는 빼고)이 있는 환자를 세요.")).toBeTruthy()
    expect(b.getByRole('searchbox', { name: '찾기: 코드나 이름' })).toBeTruthy()
    expect(b.getByText('최근 90일에 쓴 처방만 보여요 · 그 분류 처방이 위에 있어요')).toBeTruthy()
    expect(b.getByText('고른 처방 없음 → 물리치료 처방 전부 셈')).toBeTruthy()
    expect(b.getByText('위와 같은 고르기 창')).toBeTruthy()
    const freeNames = [
      "비트 할인 기록이 '사용자할인(FREE)'일 때",
      '받은 돈 0원이고 미수도 없을 때',
      '건강보험 환자인데 본인부담이 0원일 때',
      '본인부담이 0원일 때 (자보·의료급여 포함)',
      '총진료비가 0원일 때',
      'FREE 안 씀',
    ]
    expect(b.getAllByRole('radio')).toHaveLength(6)
    expect(freeNames.map((name) => (b.getByRole('radio', { name }) as HTMLInputElement).checked)).toEqual([true, false, false, false, false, false])
    expect(
      b.getByText(
        "기본. 수납할 때 할인 종류를 '사용자할인(FREE)'로 고른 환자는 받은 돈과 상관없이 FREE 한 줄(기호 6, 0원)로 넣어요. 그날 낸 미수 돈은 따로 넣어요. 할인 기록이 늦게 붙으면 먼저 넣은 현금·카드 줄을 FREE로 바꿔요.",
      ),
    ).toBeTruthy()
    expect(b.getByText('본인부담이 있는데 수납에서 0원을 받고, 미수 발생·건강생활유지비도 없는 환자.')).toBeTruthy()
    expect(b.getByText('보험 코드 31(국민건강보험) 환자의 본인부담이 0원이고 총진료비는 있을 때.')).toBeTruthy()
    expect((b.getByRole('checkbox', { name: '자동차보험' }) as HTMLInputElement).checked).toBe(true)
    expect(b.getByText('그날 보험이 21 자보-청구분 · 22 자보-100%일 때')).toBeTruthy()
    expect((b.getByRole('checkbox', { name: '건강생활잔액' }) as HTMLInputElement).checked).toBe(true)
    expect(b.getByText('의료급여(51 보호1종 · 52 보호2종) 환자가 그날 건강생활유지비를 썼을 때')).toBeTruthy()
    expect(
      b.getByText("비고 칸이 비어 있을 때만 넣어요. 직원이 적은 글은 안 바꿔요. 비고 칸 글자는 위 '시트 › 칸 글자'에서 정해요(비우면 둘 다 꺼요)."),
    ).toBeTruthy()
  })

  it('AC-8516.3: 진료실 맞춤이 없는 병원은 최근 90일 환자가 있는 과부터 번호를 미리 채우고 글을 보이며, 저장하면 그 번호·병원이 들어간다', async () => {
    const { user } = await open({ saved: { settings: settingsWith({ deptRooms: {}, deptRoomsHospital: '' }), secretTag: TAG } })
    const b = section('비트 맞춤')
    expect(b.getByText('진료과에 번호를 저절로 붙였어요(최근 90일 환자가 있는 과부터). 맞는지 보고 [저장]을 눌러 주세요.')).toBeTruthy()
    expect(b.getAllByRole('combobox').map((c) => (c as HTMLSelectElement).value)).toEqual(['1', '2', '3', ''])
    await user.click(button('저장'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(savedArg().deptRooms).toEqual({ OS: 1, OS2: 2, PM: 3 })
    expect(savedArg().deptRoomsHospital).toBe('1')
  })

  it('AC-8516.3: 진료과 목록 자리 글 — 불러오는 중·불러오지 못함·없음', async () => {
    await open({ call: fakeCall({ 'sheet.catalog': () => new Promise(() => undefined) }) })
    expect(section('비트 맞춤').getByText('비트에서 진료과를 불러오는 중…')).toBeTruthy()
    cleanup()
    await open({ call: fakeCall({ 'sheet.catalog': fail('E-BIT-READ') }) })
    expect(section('비트 맞춤').getByText('진료과를 불러오지 못했어요.')).toBeTruthy()
    cleanup()
    await open({ call: fakeCall({ 'sheet.catalog': { ...CATALOG, depts: [] } }) })
    expect(section('비트 맞춤').getByText('이 병원 진료과가 비트에 없어요.')).toBeTruthy()
  })

  it('AC-8516.3: 비트 병원 [고르기…] → 우리 병원 고르기 창, 고르면 그 병원 목록을 다시 읽고 글·저장 값이 바뀐다', async () => {
    const two = {
      ...CATALOG,
      hospitals: [
        { code: '1', name: '샘플정형외과의원', recent: 1204 },
        { code: '2', name: '둘째의원', recent: 3 },
      ],
    }
    const { call, user } = await open({ call: fakeCall({ 'sheet.catalog': two }) })
    await user.click(within(screen.getByRole('group', { name: '비트 병원' })).getByRole('button', { name: '고르기…' }))
    const dialog = within(screen.getByRole('dialog', { name: '우리 병원 고르기' }))
    await user.click(dialog.getByRole('radio', { name: '둘째의원 · 최근 30일 환자 3명 (코드 2)' }))
    await user.click(dialog.getByRole('button', { name: '고르기' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(section('비트 맞춤').getByText('둘째의원 (코드 2) — 비트에 병원이 여럿일 때만 필요해요')).toBeTruthy()
    expect(call).toHaveBeenCalledWith('sheet.catalog', { hospital: '2' })
    await user.click(button('저장'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(savedArg().bitHospital).toBe('2')
  })

  it('AC-8516.3: 처방 고르기 — Block은 칸 안 목록, 물리치료는 [고르기…] 창, 고른 것이 저장 값에 들어간다', async () => {
    const { user } = await open()
    const block = within(screen.getByRole('group', { name: 'Block(주사)로 셀 처방' }))
    await user.click(block.getByRole('checkbox', { name: 'KK010' }))
    expect(block.getByText('고른 처방 1개만 셈')).toBeTruthy()
    const therapy = within(screen.getByRole('group', { name: '물리치료로 셀 처방' }))
    await user.click(therapy.getByRole('button', { name: '고르기…' }))
    const dialog = within(screen.getByRole('dialog', { name: '물리치료로 셀 처방 — 최근 90일에 쓴 처방' }))
    await user.click(dialog.getByRole('checkbox', { name: 'MM070' }))
    await user.click(dialog.getByRole('button', { name: '확인' }))
    expect(therapy.getByText('고른 처방 1개만 셈')).toBeTruthy()
    await user.click(button('저장'))
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1))
    expect(savedArg().blockCodes).toEqual(['KK010'])
    expect(savedArg().therapyCodes).toEqual(['MM070'])
  })

  it('AC-8516.3: 저절로 넣기 칸·기본값·풀이 글이 시안 그대로다', async () => {
    await open()
    const a = section('저절로 넣기')
    expect((a.getByRole('checkbox', { name: '켜기' }) as HTMLInputElement).checked).toBe(true)
    expect(a.getByText('웹앱이 열려 있는 동안(어느 탭이든) 이 PC에서 넣어요. 창을 줄여 두는 것은 괜찮지만, 창을 닫으면 멈춰요.')).toBeTruthy()
    expect(box('몇 분마다').value).toBe('5')
    expect(box('넣기 시작 시각').value).toBe('08:00')
    expect(box('넣기 끝 시각').value).toBe('20:00')
    expect(a.getByText('바뀐 게 있을 때만 구글에 보내요')).toBeTruthy()
    expect((a.getByRole('checkbox', { name: '저녁 마지막 넣기' }) as HTMLInputElement).checked).toBe(true)
    expect(box('저녁 마지막 넣기 시각').value).toBe('19:30')
    expect(a.getByText('빠진 것이 없게 한 번 더 넣어요(그때 웹앱이 열려 있어야 해요)')).toBeTruthy()
    expect(a.getByText('저녁 마지막 넣기를 못 한 날은 다음에 웹앱을 열 때 그날을 한 번 더 넣어요(7일 안, 빈 칸만 채우기).')).toBeTruthy()
    expect(a.getByText('빈 칸만 채우기')).toBeTruthy()
    expect(a.getByText('(저절로 넣을 때는 늘 이 방식 — 직원이 적은 값은 안 지워요)')).toBeTruthy()
  })
})

describe('AC-8516.4 [저장]', () => {
  it('AC-8516.4: 막는 글이 있으면 저장하지 않고 그 글을 보인다(lib/gsheet/check)', async () => {
    const { user } = await open()
    await user.clear(box('환자 줄 몇 줄부터'))
    await user.type(box('환자 줄 몇 줄부터'), 'x')
    await user.clear(box('몇 분마다'))
    await user.type(box('몇 분마다'), '0')
    await user.click(button('저장'))
    expect(await screen.findByText('환자 줄(몇 줄부터 몇 줄까지)을 숫자로 넣어 주세요.')).toBeTruthy()
    expect(screen.getByText('몇 분마다는 1~240 사이 숫자로 넣어 주세요.')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-8516.4: 메일 모양이 틀리면 sheet.link도 부르지 않는다', async () => {
    const { call, user } = await open()
    await user.clear(box('함께 쓸 직원 메일'))
    await user.type(box('함께 쓸 직원 메일'), 'staff-fake.test')
    await user.click(button('저장'))
    expect(await screen.findByText('함께 쓸 직원 메일 모양을 확인해 주세요(쉼표로 나눠 적어요).')).toBeTruthy()
    expect(linkCalls(call)).toEqual([])
    expect(save).not.toHaveBeenCalled()
  })

  it('AC-8516.4: 막는 글이 없으면 고친 값으로 서버에 저장하고 알린 뒤 닫는다', async () => {
    const { onChanged, onClose, user } = await open()
    await user.clear(box('표시 값'))
    await user.type(box('표시 값'), '1')
    await user.clear(box('넣기 시작 시각'))
    await user.type(box('넣기 시작 시각'), '9:00')
    await user.click(screen.getByRole('radio', { name: 'FREE 안 씀' }))
    await user.click(button('저장'))
    await waitFor(() => expect(onClose).toHaveBeenCalled())
    const sent = savedArg()
    expect(save.mock.calls[0]![0]).toBe(CLIENT)
    expect(sent).toEqual({ ...settingsWith(), markValue: '1', from: '09:00', free: 'none' })
    expect(onChanged).toHaveBeenCalledWith({ settings: sent, secretTag: TAG })
  })

  it('AC-8516.4: 저장이 실패하면 \'설정을 저장하지 못했어요.\' 오류 카드, 닫지 않는다', async () => {
    save.mockRejectedValueOnce(new GsheetStorageError('failed'))
    const { onClose, user } = await open()
    await user.click(button('저장'))
    expect(await screen.findByText('설정을 저장하지 못했어요.')).toBeTruthy()
    expect(screen.getByText('오류 번호 E-SETTINGS-FAILED')).toBeTruthy()
    expect(onClose).not.toHaveBeenCalled()
    cleanup()
    save.mockResolvedValueOnce('invalid')
    const second = await open()
    await second.user.click(button('저장'))
    expect(await screen.findByText('설정을 저장하지 못했어요.')).toBeTruthy()
    expect(second.onClose).not.toHaveBeenCalled()
  })
})

describe('AC-8516.5 비트시트 설정 그대로 가져오기', () => {
  const BANNER_TEXT =
    '원본 시트 주소·구글 주소·비밀 글자·진료실·처방 고르기를 그대로 가져올 수 있어요. 가져온 뒤에는 비트시트 프로그램을 꺼 주세요(둘이 같이 넣으면 같은 일을 두 번 해요).'
  const IMPORTED = settingsWith({ templateUrl: 'https://docs.google.com/spreadsheets/d/fakeImported1234567890/edit', blockCodes: ['KK010'] })

  it('AC-8516.5: 이 PC에 비트시트 설정이 없으면 파란 알림이 없다', async () => {
    await open()
    expect(screen.queryByText('이 PC에 비트시트 프로그램 설정이 있어요.')).toBeNull()
  })

  it('AC-8516.5: 있으면 맨 위 파란 알림과 [그대로 가져오기][안 가져와요], [안 가져와요]는 알림만 닫는다', async () => {
    const { call, user } = await open({ call: fakeCall({ 'sheet.status': status({ bitsheet: true }) }) })
    expect(screen.getByText('이 PC에 비트시트 프로그램 설정이 있어요.')).toBeTruthy()
    expect(screen.getByText(BANNER_TEXT)).toBeTruthy()
    expect(button('그대로 가져오기')).toBeTruthy()
    await user.click(button('안 가져와요'))
    expect(screen.queryByText('이 PC에 비트시트 프로그램 설정이 있어요.')).toBeNull()
    expect(call.mock.calls.some(([cmd]) => cmd === 'sheet.import')).toBe(false)
  })

  it('AC-8516.5: [그대로 가져오기]는 sheet.import 결과를 서버 설정·secret_tag로 저장한 뒤 화면 칸을 채운다', async () => {
    let imported = false
    const call = fakeCall({
      'sheet.status': () => status(imported ? { url: URL_B, shareWith: ['staff3@fake.test'], bitsheet: true } : { bitsheet: true, secretTag: null, url: null, shareWith: [] }),
      'sheet.import': () => {
        imported = true
        return { v: 1, secretTag: NEW_TAG, settings: IMPORTED }
      },
    })
    load.mockResolvedValue({ settings: IMPORTED, secretTag: NEW_TAG })
    const { onChanged, user } = await open({ call, saved: { settings: settingsWith(), secretTag: null } })
    await user.click(button('그대로 가져오기'))
    await waitFor(() => expect(box('원본 시트 주소').value).toBe(IMPORTED.templateUrl))
    expect(call).toHaveBeenCalledWith('sheet.import', {})
    expect(save).toHaveBeenCalledWith(CLIENT, IMPORTED)
    expect(setTag).toHaveBeenCalledWith(CLIENT, NEW_TAG)
    expect(box('2. 구글에서 받은 주소').value).toBe(URL_B)
    expect(box('함께 쓸 직원 메일').value).toBe('staff3@fake.test')
    expect(onChanged).toHaveBeenCalledWith({ settings: IMPORTED, secretTag: NEW_TAG })
    expect(screen.queryByText('이 PC에 비트시트 프로그램 설정이 있어요.')).toBeNull()
  })

  it('AC-8516.5: 가져온 설정에 주소·메일 열쇠가 있으면 저장하지 않고 오류 카드', async () => {
    const call = fakeCall({
      'sheet.status': status({ bitsheet: true }),
      'sheet.import': { v: 1, secretTag: NEW_TAG, settings: { ...IMPORTED, shareWith: ['staff3@fake.test'] } },
    })
    const { user } = await open({ call })
    await user.click(button('그대로 가져오기'))
    expect(await screen.findByText('오류 번호 E-BRIDGE-BAD-REPLY')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    expect(setTag).not.toHaveBeenCalled()
  })
})

describe('AC-8516.6 저절로 넣기 › 최근 기록', () => {
  // '최근 기록' 줄(이름 + 값)의 글 전체
  const recentLine = () => screen.getByRole('group', { name: '최근 기록' }).textContent!.replace(/^최근 기록/, '')

  it('AC-8516.6: 오늘 기록을 새것부터 시안 꼴로(실패 뒤 다시 넣은 것은 → … 다시 넣음 ✔)', async () => {
    runs.mockResolvedValue([
      run('2026-11-25T19:30:00+09:00', { outcome: 'ok', counts: { added: 9 } }),
      run('2026-11-26T11:10:00+09:00', { outcome: 'fail', code: 'E-GSHEET-NET' }),
      run('2026-11-26T11:15:00+09:00', { outcome: 'ok' }),
      run('2026-11-26T14:25:00+09:00', { outcome: 'ok', counts: { filled: 1 } }),
      run('2026-11-26T14:30:00+09:00', { outcome: 'same' }),
      run('2026-11-26T14:35:00+09:00', { outcome: 'ok', counts: { added: 2, filled: 1 } }),
    ])
    await open()
    expect(recentLine()).toBe('14:35 ✔ 새 줄 2 · 14:30 바뀐 것 없음 · 14:25 ✔ 채운 줄 1 · 11:10 구글 연결 안 됨 → 11:15 다시 넣음 ✔')
  })

  it('AC-8516.6: 실패 종류 셋(구글 연결 안 됨·비트 못 읽음·넣지 못함), 확인 필요는 ⚠', async () => {
    runs.mockResolvedValue([
      run('2026-11-26T09:00:00+09:00', { outcome: 'fail', code: 'E-BIT-READ' }),
      run('2026-11-26T09:05:00+09:00', { outcome: 'fail', code: 'E-GSHEET-DAY' }),
      run('2026-11-26T09:10:00+09:00', { outcome: 'warn', counts: { added: 1 } }),
    ])
    await open()
    expect(recentLine()).toBe('09:10 ⚠ 새 줄 1 · 09:05 넣지 못함 · 09:00 비트 못 읽음')
  })

  it("AC-8516.6: 오늘 기록이 없으면 '오늘은 아직 없어요'", async () => {
    runs.mockResolvedValue([run('2026-11-25T19:30:00+09:00')])
    await open()
    expect(recentLine()).toBe('오늘은 아직 없어요')
  })
})

describe('AC-8517.1 [안내문 열기]', () => {
  it('AC-8517.1: [안내문 열기]는 탭 안에서 안내문을 열고, 돌아오면 고치던 값이 그대로다', async () => {
    const { user } = await open()
    await user.clear(box('표시 값'))
    await user.type(box('표시 값'), '7')
    await user.click(button('안내문 열기'))
    expect(screen.getByRole('heading', { name: '수납일지 구글 쪽 준비하기 (처음 한 번)' })).toBeTruthy()
    expect(screen.queryByRole('heading', { name: '수납일지 시트 설정' })).toBeNull()
    await user.click(button('‹ 돌아가기'))
    expect(box('표시 값').value).toBe('7')
  })
})
