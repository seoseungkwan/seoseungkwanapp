// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { askLeft } from '@/lib/storage/notices'
import type { ReadMode } from '@/types/notices'
import { AskBox } from './AskBox'

// AI에게 묻기 칸 (specs/notices TASK-18, AC-7420.6~AC-7420.10, design 10절, 승인 시안 ?s=ask·ask-blocked·ask-answer·ask-limit).
// 남은 수(askLeft)와 묻기 경로(fetch)만 가짜로 바꾼다. 질문 검사(lib/notices/askCheck)는 진짜를 쓴다.
// 막힘 예시의 전화번호·주민번호는 지어낸 모양이다
vi.mock('@/lib/storage/notices', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/notices')>()),
  askLeft: vi.fn(),
}))
const { supabaseBrowser } = vi.hoisted(() => ({ supabaseBrowser: vi.fn() }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser }))

const left = vi.mocked(askLeft)

const ID = '3f2c9a10-5b7d-4e21-9c8a-1d2e3f4a5b6c'
const QUESTION = '어깨 관절 주사도 1년에 4번으로 줄어드나요?'
const ANSWER =
  '네. 이번 개정은 관절 부위를 나누지 않아서 어깨에도 똑같이 적용돼요. 다만 ‘같은 관절’ 기준이라 무릎과 어깨는 따로 세요.'
const BLOCKED_TITLE = '환자 정보로 보이는 글자가 있어 보내지 않았어요'
const FAILED = '답을 받지 못했어요. 잠시 뒤 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.'
const LIMIT = '오늘 물어볼 수 있는 20번을 다 썼어요. 내일 다시 쓸 수 있어요.'

type Reply = { status: number; body?: unknown }
const reply = ({ status, body }: Reply) => new Response(body === undefined ? null : JSON.stringify(body), { status })

function stubFetch(...replies: (Reply | Error)[]) {
  const fetchMock = vi.fn<(url: string, init?: RequestInit) => Promise<Response>>(async () => {
    const next = replies.length > 1 ? replies.shift() : replies[0]
    if (next === undefined) throw new Error('답 없음')
    if (next instanceof Error) throw next
    return reply(next)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function deferredFetch() {
  let resolve!: (r: Response) => void
  const fetchMock = vi.fn(
    () =>
      new Promise<Response>((res) => {
        resolve = res
      }),
  )
  vi.stubGlobal('fetch', fetchMock)
  return { fetchMock, resolve: (r: Reply) => resolve(reply(r)) }
}

const onToMemo = vi.fn<(answer: string) => void>()

async function showBox(readMode: ReadMode | null = 'full') {
  const result = render(<AskBox noticeId={ID} readMode={readMode} onToMemo={onToMemo} />)
  await waitFor(() => expect(left).toHaveBeenCalled())
  return result
}

const box = () => screen.getByRole('region', { name: 'AI에게 묻기' })
const area = () => within(box()).getByRole('textbox', { name: '물어볼 것' }) as HTMLTextAreaElement
const sendButton = () => within(box()).getByRole('button', { name: '묻기' }) as HTMLButtonElement

async function openBox(readMode: ReadMode | null = 'full') {
  const result = await showBox(readMode)
  await expectLeft(17)
  fireEvent.click(within(box()).getByRole('button', { name: 'AI에게 묻기' }))
  return result
}

function type(question: string) {
  fireEvent.change(area(), { target: { value: question } })
}

function send(question: string) {
  type(question)
  fireEvent.click(sendButton())
}

// '오늘 **{n}번** 남음 (하루 20번)': 글은 한 줄, {n}번만 굵게
async function expectLeft(n: number) {
  const line = await within(box()).findByText((_, el) => el !== null && el.tagName === 'SPAN' && el.textContent === `오늘 ${n}번 남음 (하루 20번)`)
  const bold = line.querySelector('b')
  expect(bold?.textContent).toBe(`${n}번`)
}

beforeEach(() => {
  left.mockReset()
  left.mockResolvedValue(17)
  onToMemo.mockReset()
  supabaseBrowser.mockReset()
  window.localStorage.clear()
  window.sessionStorage.clear()
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('AC-7420.6: AI에게 묻기 (처음 접힘 → 펼침)', () => {
  it('AC-7420.6: 처음엔 접혀 제목 · 오늘 {n}번 남음 (하루 20번) · 안내 · AI에게 묻기 단추이고 칸이 없다', async () => {
    const fetchMock = stubFetch({ status: 500 })
    await showBox()
    expect(within(box()).getByRole('heading', { level: 2 }).textContent).toBe('AI에게 묻기')
    await expectLeft(17)
    expect(within(box()).getByText('이 글과 붙임 파일 내용을 바탕으로 답해요.')).toBeTruthy()
    expect(within(box()).getByRole('button', { name: 'AI에게 묻기' })).toBeTruthy()
    expect(within(box()).queryByRole('textbox')).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("AC-7420.6: 본문만 요약한 글(readMode 'body')은 이 글 본문을 바탕으로 답해요.다", async () => {
    await showBox('body')
    expect(within(box()).getByText('이 글 본문을 바탕으로 답해요.')).toBeTruthy()
    expect(within(box()).queryByText('이 글과 붙임 파일 내용을 바탕으로 답해요.')).toBeNull()
  })

  it('AC-7420.6: 펼치면 경고 · 칸(물어볼 것·칸 안 글·300자) · 묻기 · 닫기 · 남은 수 · 함께 쓰는 안내다', async () => {
    await openBox()
    const b = box()
    expect(within(b).getByText('이 글과 붙임 파일 내용을 바탕으로 답해요.')).toBeTruthy()
    expect(within(b).getByText('환자 이름·주민번호·전화번호·차트번호는 쓰지 마세요.')).toBeTruthy()
    expect(area().tagName).toBe('TEXTAREA')
    expect(area().placeholder).toBe('예: 어깨 관절 주사도 횟수가 줄어드나요?')
    expect(area().maxLength).toBe(300)
    expect(sendButton().disabled).toBe(false)
    expect(within(b).getByRole('button', { name: '닫기' })).toBeTruthy()
    await expectLeft(17)
    expect(within(b).getByText('우리 병원 계정이 함께 하루 20번까지 쓸 수 있어요.')).toBeTruthy()
    expect(within(b).queryByRole('button', { name: 'AI에게 묻기' })).toBeNull()
  })

  it('AC-7420.6: 닫기를 누르면 다시 접힌다', async () => {
    await openBox()
    fireEvent.click(within(box()).getByRole('button', { name: '닫기' }))
    expect(within(box()).getByRole('button', { name: 'AI에게 묻기' })).toBeTruthy()
    expect(within(box()).queryByRole('textbox')).toBeNull()
  })

  it('AC-7420.6: 남은 수를 읽지 못하면 남은 수 줄을 그리지 않는다', async () => {
    left.mockResolvedValue('failed')
    await showBox()
    fireEvent.click(within(box()).getByRole('button', { name: 'AI에게 묻기' }))
    expect(within(box()).queryByText(/남음/)).toBeNull()
    expect(sendButton().disabled).toBe(false)
  })
})

describe('AC-7420.7: 환자 정보 모양은 보내지 않는다', () => {
  it('AC-7420.7: checkQuestion이 환자 정보 모양을 찾으면 보내지 않고 칸이 aria-invalid이며 막힘 두 글이고 남은 수는 그대로다', async () => {
    const fetchMock = stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    await openBox()
    send('010-1234-5678 환자분 어깨 주사도 해당되나요?')
    expect(await within(box()).findByText(BLOCKED_TITLE)).toBeTruthy()
    expect(
      within(box()).getByText('전화번호로 보이는 글자를 지우고 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.'),
    ).toBeTruthy()
    expect(area().getAttribute('aria-invalid')).toBe('true')
    expect(area().value).toBe('010-1234-5678 환자분 어깨 주사도 해당되나요?')
    expect(fetchMock).not.toHaveBeenCalled()
    await expectLeft(17)
  })

  it('AC-7420.7: 종류가 여럿이면 kindsText로 잇는다', async () => {
    const fetchMock = stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    await openBox()
    send('900101-1234567 환자 010-1234-5678로 연락')
    expect(
      await within(box()).findByText('주민번호·전화번호로 보이는 글자를 지우고 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.'),
    ).toBeTruthy()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7420.7: 서버가 E-NOTICE-PRIVATE로 답해도 같은 막힘이다', async () => {
    stubFetch({ status: 400, body: { code: 'E-NOTICE-PRIVATE', kinds: ['chart'] } })
    await openBox()
    send(QUESTION)
    expect(await within(box()).findByText(BLOCKED_TITLE)).toBeTruthy()
    expect(
      within(box()).getByText('차트번호로 보이는 글자를 지우고 다시 눌러 주세요. 남은 횟수는 줄지 않았어요.'),
    ).toBeTruthy()
    expect(area().getAttribute('aria-invalid')).toBe('true')
    await expectLeft(17)
  })

  it('AC-7420.7: 빈 질문은 보내지 않고 아무 글도 없다', async () => {
    const fetchMock = stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    await openBox()
    send('   ')
    expect(fetchMock).not.toHaveBeenCalled()
    expect(within(box()).queryByRole('alert')).toBeNull()
    expect(area().getAttribute('aria-invalid')).not.toBe('true')
  })
})

describe('AC-7420.8: 기다림 · 답 · 메모에 옮기기', () => {
  it('AC-7420.8: 같은 origin POST /api/ai/notices/ask(redirect error)로 몸통 { noticeId, question }만 보낸다', async () => {
    const fetchMock = stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    await openBox()
    send(`  ${QUESTION}  `)
    await within(box()).findByText(ANSWER)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/ai/notices/ask')
    expect(init?.method).toBe('POST')
    expect(init?.redirect).toBe('error')
    expect(new Headers(init?.headers).get('Content-Type')).toBe('application/json')
    expect(JSON.parse(String(init?.body))).toStrictEqual({ noticeId: ID, question: QUESTION })
  })

  it('AC-7420.8: 기다리는 동안 AI가 답을 쓰는 중이에요이고 다시 눌러도 한 번만 보낸다. 답이 오면 물어본 것 · AI 답 · 주의 · 메모에 옮기기 · 안내와 줄어든 남은 수다', async () => {
    const { fetchMock, resolve } = deferredFetch()
    await openBox()
    send(QUESTION)
    expect(await within(box()).findByText('AI가 답을 쓰는 중이에요')).toBeTruthy()
    fireEvent.click(sendButton())
    expect(fetchMock).toHaveBeenCalledTimes(1)
    resolve({ status: 200, body: { answer: ANSWER, left: 16 } })
    expect(await within(box()).findByText(ANSWER)).toBeTruthy()
    const b = box()
    expect(within(b).getByText('물어본 것')).toBeTruthy()
    expect(within(b).getByText(QUESTION)).toBeTruthy()
    expect(within(b).getByText('AI 답')).toBeTruthy()
    expect(within(b).getByText('AI 답이라 틀릴 수 있어요. 원문에서 꼭 확인해 주세요.')).toBeTruthy()
    expect(within(b).getByRole('button', { name: '메모에 옮기기' })).toBeTruthy()
    expect(within(b).getByText('답은 저장되지 않아요. 남기려면 메모에 옮겨 두세요.')).toBeTruthy()
    expect(within(b).queryByText('AI가 답을 쓰는 중이에요')).toBeNull()
    await expectLeft(16)
    expect(area().value).toBe('')
  })

  it('AC-7420.8: 메모에 옮기기는 답을 넘기기만 한다(부모가 메모 칸에 붙인다)', async () => {
    stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    await openBox()
    send(QUESTION)
    fireEvent.click(await within(box()).findByRole('button', { name: '메모에 옮기기' }))
    expect(onToMemo).toHaveBeenCalledWith(ANSWER)
  })

  it('AC-7420.8: 답은 저장되지 않아 새로 고침하면(다시 그리면) 사라진다', async () => {
    stubFetch({ status: 200, body: { answer: ANSWER, left: 16 } })
    const first = await openBox()
    send(QUESTION)
    await within(box()).findByText(ANSWER)
    first.unmount()
    left.mockResolvedValue(16)
    await showBox()
    fireEvent.click(within(box()).getByRole('button', { name: 'AI에게 묻기' }))
    expect(within(box()).queryByText(ANSWER)).toBeNull()
    expect(within(box()).queryByText('물어본 것')).toBeNull()
    expect(window.localStorage.length).toBe(0)
    expect(window.sessionStorage.length).toBe(0)
  })
})

describe('AC-7420.9: 실패 · 다 씀', () => {
  it('AC-7420.9: AI 실패(503)면 실패 글이고 남은 수는 그대로, 적은 질문도 그대로다', async () => {
    stubFetch({ status: 503, body: { code: 'E-AI-BUSY' } })
    await openBox()
    send(QUESTION)
    expect(await within(box()).findByText(FAILED)).toBeTruthy()
    await expectLeft(17)
    expect(area().value).toBe(QUESTION)
    expect(sendButton().disabled).toBe(false)
  })

  it('AC-7420.9: 망 끊김·돌려보냄(fetch 던짐)·글 없음(404)·모양이 틀린 답도 실패 글이다', async () => {
    stubFetch(new TypeError('Failed to fetch'), { status: 404, body: { code: 'E-NOTICE-READ' } }, { status: 200, body: { answer: 3 } })
    await openBox()
    for (let i = 0; i < 3; i++) {
      send(QUESTION)
      expect(await within(box()).findByText(FAILED)).toBeTruthy()
      fireEvent.change(area(), { target: { value: '' } })
    }
    await expectLeft(17)
  })

  it('AC-7420.9: 429면 다 씀 글이고 칸과 묻기가 막히며 남은 수는 0이다', async () => {
    stubFetch({ status: 429, body: { code: 'E-NOTICE-ASK-LIMIT' } })
    await openBox()
    send(QUESTION)
    expect(await within(box()).findByText(LIMIT)).toBeTruthy()
    expect(area().disabled).toBe(true)
    expect(sendButton().disabled).toBe(true)
    await expectLeft(0)
    expect(within(box()).queryByText(FAILED)).toBeNull()
  })

  it('AC-7420.9: 처음부터 남은 수가 0이면 펼쳤을 때 다 씀 글이고 칸과 묻기가 막힌다', async () => {
    left.mockResolvedValue(0)
    const fetchMock = stubFetch({ status: 200, body: { answer: ANSWER, left: 0 } })
    await showBox()
    await expectLeft(0)
    fireEvent.click(within(box()).getByRole('button', { name: 'AI에게 묻기' }))
    expect(within(box()).getByText(LIMIT)).toBeTruthy()
    expect(area().disabled).toBe(true)
    expect(sendButton().disabled).toBe(true)
    fireEvent.click(sendButton())
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('AC-7420.9: 답을 받아 남은 수가 0이 되면 다 씀 글이고 칸과 묻기가 막힌다', async () => {
    stubFetch({ status: 200, body: { answer: ANSWER, left: 0 } })
    await openBox()
    send(QUESTION)
    expect(await within(box()).findByText(ANSWER)).toBeTruthy()
    expect(within(box()).getByText(LIMIT)).toBeTruthy()
    expect(area().disabled).toBe(true)
    expect(sendButton().disabled).toBe(true)
  })
})

describe('AC-7420.10: 답은 글자로만', () => {
  it('AC-7420.10: 질문·답의 <b>x</b>는 HTML로 해석하지 않고 글자 그대로 보인다', async () => {
    stubFetch({ status: 200, body: { answer: '답 <b>x</b>', left: 16 } })
    const { container } = await openBox()
    send('질문 <b>x</b>')
    expect(await within(box()).findByText('답 <b>x</b>')).toBeTruthy()
    expect(within(box()).getByText('질문 <b>x</b>')).toBeTruthy()
    expect(container.innerHTML).not.toContain('<b>x</b>')
  })
})
