// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { isYmd } from '@/lib/analytics/dates'
import type { MessageTemplate } from '@/lib/storage/messageTemplates'
import { MessagesTool } from './MessagesTool'

// 문자 문구 도구(AC-613.1~613.4·613.6, 목업 messagesTool). 환자 정보 없이 문구만 다룬다. 메모리 속 가짜 서버에 진짜 lib/storage를 물린다.
// 병원 이름·번호는 지어낸 것이다

const db = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => db.client }))

const TODAY = '2026-11-04' // 수요일
const FAILURE = { message: 'down' }
const COPY_BLOCKED = '복사하지 못했어요. 미리 보기 글을 골라 두었어요. 골라 둔 글을 오른쪽 클릭해 [복사]를 눌러 주세요.'
const NAME_ERROR = '이름을 1~30자로 적어 주세요.'
const BODY_ERROR = '내용을 1~2000자로 적어 주세요.'
const CHANGED = '바뀐 것이 있어요. [저장]을 눌러야 다른 PC와 휴대폰에도 같은 글이 나와요.'

const INJECTION: MessageTemplate = { id: 'a', kind: 'injection', name: '주사 알림', body: '[*1*]님, [*2*] 주사 날짜예요.\n* 1월 1일 금요일 *\n문의 02-0000-0000', sort_order: 0 }
const FOLLOWUP: MessageTemplate = { id: 'b', kind: 'followup', name: '진료 알림', body: '[*1*]님, 다음 진료일이에요.\n<<DATE>>', sort_order: 1 }

function fakeServer(initial: readonly MessageTemplate[] = [INJECTION, FOLLOWUP]) {
  let added = 0
  const server = {
    rows: initial.map((row) => ({ ...row })),
    reads: 0,
    updates: [] as { id: string; row: Partial<MessageTemplate> }[],
    inserts: [] as Omit<MessageTemplate, 'id'>[][],
    deletes: [] as string[][],
    failReads: 0,
    failUpdateOf: null as string | null,
    failInsert: false,
    gate: null as Promise<void> | null,
    writes() {
      return server.updates.length + server.inserts.length + server.deletes.length
    },
  }
  db.client = {
    from: () => ({
      select: () => ({
        order: () => ({
          order: async () => {
            server.reads += 1
            if (server.failReads > 0) {
              server.failReads -= 1
              return { data: null, error: FAILURE }
            }
            return { data: [...server.rows].sort((x, y) => x.sort_order - y.sort_order || x.kind.localeCompare(y.kind)).map((row) => ({ ...row })), error: null }
          },
        }),
      }),
      update: (row: Partial<MessageTemplate>) => ({
        eq: async (_column: string, id: string) => {
          if (server.gate) await server.gate
          server.updates.push({ id, row })
          if (server.failUpdateOf === id) return { error: FAILURE }
          server.rows = server.rows.map((old) => (old.id === id ? { ...old, ...row } : old))
          return { error: null }
        },
      }),
      delete: () => ({
        in: async (_column: string, ids: string[]) => {
          server.deletes.push(ids)
          server.rows = server.rows.filter((old) => !ids.includes(old.id))
          return { error: null }
        },
      }),
      insert: async (rows: Omit<MessageTemplate, 'id'>[]) => {
        if (server.gate) await server.gate
        server.inserts.push(rows)
        if (server.failInsert) return { error: FAILURE }
        for (const row of rows) server.rows.push({ ...row, id: `server-${(added += 1)}` })
        return { error: null }
      },
    }),
  }
  return server
}

const flush = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0))
  })

async function open(server = fakeServer(), today = TODAY) {
  const view = render(<MessagesTool today={today} active />)
  await flush()
  return { ...view, server }
}

const hold = (server: ReturnType<typeof fakeServer>) => {
  let release = () => {}
  server.gate = new Promise((resolve) => {
    release = resolve
  })
  return async () => {
    server.gate = null
    release()
    await flush()
  }
}

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const noButton = (name: string | RegExp) => screen.queryByRole('button', { name })
const saveButton = () => button(/^저장/)
const press = async (name: string | RegExp) => {
  fireEvent.click(button(name))
  await flush()
}
const names = () => screen.getAllByLabelText(/^이름/) as HTMLInputElement[]
const bodies = () => screen.getAllByLabelText(/^내용/) as HTMLTextAreaElement[]
const type = (box: HTMLElement, value: string) => fireEvent.change(box, { target: { value } })
const preview = () => screen.getByRole('region', { name: '미리 보기' }).textContent
const dateBox = () => screen.getByLabelText('내원 날짜') as HTMLInputElement

let writeText = vi.fn<(text: string) => Promise<void>>()

beforeEach(() => {
  writeText = vi.fn(async () => {})
  Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
})
afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('MessagesTool: 처음 열기 (AC-613.1)', () => {
  it('AC-613.1: 읽는 동안은 불러오는 중 글만 있고 [저장]이 없다', async () => {
    fakeServer()
    render(<MessagesTool today={TODAY} active />)
    expect(screen.getByRole('heading', { level: 2, name: '문자 문구' })).toBeTruthy()
    expect(screen.getByRole('status').textContent).toBe('문자 문구를 불러오는 중이에요')
    expect(noButton(/^저장/)).toBeNull()
    await flush()
    expect(screen.queryByText('문자 문구를 불러오는 중이에요')).toBeNull()
  })

  it('AC-613.1: 저장한 줄 목록(번호·종류 칩·이름·내용), 내원 날짜는 내일, 날짜를 채운 미리 보기', async () => {
    await open()
    const items = within(screen.getByRole('list', { name: '문구 목록' })).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(within(items[0]!).getByText('1번')).toBeTruthy()
    expect(within(items[0]!).getByText('주사 안내')).toBeTruthy()
    expect(within(items[1]!).getByText('2번')).toBeTruthy()
    expect(within(items[1]!).getByText('진료 안내')).toBeTruthy()
    expect(names().map((box) => box.value)).toEqual(['주사 알림', '진료 알림'])
    expect(bodies()[0]?.value).toBe(INJECTION.body)
    expect(dateBox().value).toBe('2026-11-05')
    expect(screen.getByText('처음에는 내일이에요. 문자는 오시기 전날 보내요.')).toBeTruthy()
    expect(preview()).toBe('[*1*]님, [*2*] 주사 날짜예요.\n* 11월 5일 목요일 *\n문의 02-0000-0000')
  })

  it('AC-613.1: 날짜를 바꾸면 미리 보기 날짜 줄이 바뀐다. <<DATE>> 줄도 채운다', async () => {
    await open()
    type(screen.getByLabelText('미리 볼 문구'), screen.getByRole<HTMLOptionElement>('option', { name: '2번 · 진료 알림' }).value)
    expect(preview()).toBe('[*1*]님, 다음 진료일이에요.\n* 11월 5일 목요일 *')
    type(dateBox(), '2026-11-09')
    expect(preview()).toBe('[*1*]님, 다음 진료일이에요.\n* 11월 9일 월요일 *')
  })

  it('AC-613.1: 고치는 글이 미리 보기에 바로 나오고 이름은 고르는 줄에도 바로 나온다', async () => {
    await open()
    type(bodies()[0]!, '고친 글\n<<DATE>>')
    expect(preview()).toBe('고친 글\n* 11월 5일 목요일 *')
    type(names()[0]!, '새 이름')
    expect(screen.getByRole('option', { name: '1번 · 새 이름' })).toBeTruthy()
    type(names()[0]!, '')
    expect(screen.getByRole('option', { name: '1번 · 이름 없음' })).toBeTruthy()
  })

  it('AC-613.1: [*1*]·[*2*]와 날짜 줄 설명이 있다', async () => {
    await open()
    expect(screen.getByText('[*1*] 자리는 받는 분 이름, [*2*] 자리는 부위(정기 주사는 주사 종류)로 문자 프로그램이 바꿔요. ‘* 11월 5일 목요일 *’처럼 별표로 감싼 날짜 줄은 고른 내원 날짜로 바뀌어요.')).toBeTruthy()
  })

  it('AC-613.1: 저장한 줄이 없을 때만 기본 문구와 원본 안내를 보이고, [저장]이 바로 눌린다', async () => {
    await open(fakeServer([]))
    expect(names().map((box) => box.value)).toEqual(['주사 안내', '진료 안내'])
    expect(screen.getByText('처음이라 기본 문구 2개를 넣어 뒀어요.')).toBeTruthy()
    expect(screen.getByText('사용 전 병원명·연락처·진료시간을 수정하세요. [저장]을 누르면 우리 의원 문구로 남아요.')).toBeTruthy()
    expect(saveButton().getAttribute('aria-disabled')).toBeNull()
    expect(screen.getByText(CHANGED)).toBeTruthy()
    expect(preview()).toContain('[*1*]님, 안녕하세요.')
    expect(preview()).toContain('* 11월 5일 목요일 *')
    expect(preview()).not.toContain('<<DATE>>')
  })

  it('AC-613.1: 저장한 줄이 있으면 기본 문구 안내가 없다', async () => {
    await open()
    expect(screen.queryByText(/처음이라 기본 문구/)).toBeNull()
  })
})

describe('MessagesTool: 날짜 칸 (AC-613.1)', () => {
  it('AC-613.1: 날짜 칸은 오른쪽 칸 폭을 다 쓴다(목업 .fld 안 .inp.dt: PC는 세로 flex가 늘리고 휴대폰은 100%). 폭을 정하는 감싸개가 없다', async () => {
    await open()
    const box = dateBox()
    expect(box.parentElement?.className).toBe(ds.field)
    expect(box.classList.contains('w-full')).toBe(true)
    expect(box.className).toBe(screen.getByLabelText('미리 볼 문구').className)
  })

  it.each(['0002-11-02', '', '2026-02-30'])('AC-613.1: 날짜 칸에 %j가 와도 던지지 않고 고친 글을 잃지 않으며 마지막으로 맞았던 날짜를 쓴다', async (bad) => {
    await open()
    type(bodies()[0]!, '고친 글\n<<DATE>>')
    type(dateBox(), '2026-11-09')
    expect(() => {
      // jsdom은 없는 날을 빈 값으로 바꾼다. 어느 쪽이든 쓰지 않는다
      type(dateBox(), bad)
    }).not.toThrow()
    expect(screen.getByRole('heading', { level: 2, name: '문자 문구' })).toBeTruthy()
    expect(bodies()[0]?.value).toBe('고친 글\n<<DATE>>')
    expect(preview()).toBe('고친 글\n* 11월 9일 월요일 *')
    // 복사·날짜 줄 넣기도 맞았던 날짜로 간다
    await press('문구 복사')
    expect(writeText).toHaveBeenLastCalledWith('고친 글\n* 11월 9일 월요일 *')
    fireEvent.click(screen.getAllByRole('button', { name: '날짜 줄 넣기' })[0]!)
    expect(bodies()[0]?.value).toContain('* 11월 9일 월요일 *')
    // 칸을 떠나면 칸 글자도 맞았던 날짜로 돌아온다
    fireEvent.blur(dateBox())
    expect(dateBox().value).toBe('2026-11-09')
  })

  it('AC-613.1: 연도를 치는 동안 나오는 값은 칸에 그대로 둔다(되돌리면 연도를 칠 수 없다)', async () => {
    await open()
    type(dateBox(), '0002-11-02')
    expect(dateBox().value).toBe('0002-11-02')
    expect(preview()).toContain('* 11월 5일 목요일 *')
    type(dateBox(), '2027-01-04')
    expect(preview()).toContain('* 1월 4일 월요일 *')
  })

  it('AC-613.1: 받은 오늘이 날짜가 아니어도 던지지 않고 한국 오늘의 내일을 쓴다', async () => {
    await open(fakeServer(), '')
    expect(isYmd(dateBox().value)).toBe(true)
    expect(preview()).toMatch(/\* \d+월 \d+일 [월화수목금토일]요일 \*/)
  })

  it('AC-613.2: [날짜 줄 넣기]는 커서 자리에 지금 날짜 줄을 넣는다', async () => {
    await open(fakeServer([{ ...FOLLOWUP, body: '앞줄\n뒷줄' }]))
    const box = bodies()[0]!
    box.focus()
    box.setSelectionRange(2, 2)
    fireEvent.click(button('날짜 줄 넣기'))
    expect(bodies()[0]?.value).toBe('앞줄\n* 11월 5일 목요일 *\n뒷줄')
    expect(document.activeElement).toBe(bodies()[0])
    expect(bodies()[0]?.selectionStart).toBe('앞줄\n* 11월 5일 목요일 *'.length)
    expect(saveButton().getAttribute('aria-disabled')).toBeNull()

    // 줄 가운데면 앞뒤를 줄로 나눈다
    bodies()[0]!.setSelectionRange(1, 1)
    fireEvent.click(button('날짜 줄 넣기'))
    expect(bodies()[0]?.value).toBe('앞\n* 11월 5일 목요일 *\n줄\n* 11월 5일 목요일 *\n뒷줄')
  })
})

describe('MessagesTool: 고치고 저장 (AC-613.2)', () => {
  it('AC-613.2: 바뀐 것이 없으면 [저장]이 막혀 있고 눌러도 아무것도 나가지 않는다', async () => {
    const { server } = await open()
    expect(saveButton().getAttribute('aria-disabled')).toBe('true')
    await press(/^저장/)
    expect(server.writes()).toBe(0)
    expect(server.reads).toBe(1)
    expect(screen.queryByText('저장했어요')).toBeNull()
  })

  it('AC-613.2: 고치면 [저장]이 풀리고 안내가 나오며, 누르면 서버에 저장되고 "저장했어요"가 나온다. 다시 고치면 내려간다', async () => {
    const { server } = await open()
    type(names()[0]!, '새 이름')
    expect(saveButton().getAttribute('aria-disabled')).toBeNull()
    expect(screen.getByText(CHANGED)).toBeTruthy()
    await press(/^저장/)
    expect(server.rows[0]?.name).toBe('새 이름')
    expect(screen.getByText('저장했어요')).toBeTruthy()
    expect(screen.queryByText(CHANGED)).toBeNull()
    expect(saveButton().getAttribute('aria-disabled')).toBe('true')
    type(names()[0]!, '또 고침')
    expect(screen.queryByText('저장했어요')).toBeNull()
  })

  it('AC-613.2: 위·아래·지우기가 저장 순서·삭제로 간다. 맨 위 줄 [위로]·맨 아래 줄 [아래로]는 막혀 있다', async () => {
    const third = { ...FOLLOWUP, id: 'c', name: '세 번째', sort_order: 2 }
    const { server } = await open(fakeServer([INJECTION, FOLLOWUP, third]))
    expect(button('주사 알림 위로').getAttribute('aria-disabled')).toBe('true')
    expect(button('세 번째 아래로').getAttribute('aria-disabled')).toBe('true')
    fireEvent.click(button('주사 알림 위로'))
    fireEvent.click(button('세 번째 아래로'))
    expect(names().map((box) => box.value)).toEqual(['주사 알림', '진료 알림', '세 번째'])

    fireEvent.click(button('세 번째 위로'))
    expect(names().map((box) => box.value)).toEqual(['주사 알림', '세 번째', '진료 알림'])
    // 누른 단추에 초점이 남는다(줄을 옮겨도 키보드로 이어서 누른다)
    expect(document.activeElement).toBe(button('세 번째 위로'))
    fireEvent.click(button('주사 알림 지우기'))
    expect(names().map((box) => box.value)).toEqual(['세 번째', '진료 알림'])
    await press(/^저장/)
    expect(server.deletes).toEqual([['a']])
    expect(server.rows.map(({ id, sort_order }) => [id, sort_order])).toEqual([
      ['b', 1],
      ['c', 0],
    ])
  })

  it('AC-613.2: [문구 더하기]는 고른 종류·기본 이름으로 줄을 더하고, 내용 칸에 초점을 주며, 미리 볼 문구도 그 줄이 된다', async () => {
    const { server } = await open()
    expect(button('주사 안내').getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(button('진료 안내'))
    expect(button('진료 안내').getAttribute('aria-pressed')).toBe('true')
    await press('문구 더하기')
    expect(names()[2]?.value).toBe('새 진료 안내')
    expect(document.activeElement).toBe(bodies()[2])
    expect((screen.getByLabelText('미리 볼 문구') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('3번 · 새 진료 안내')
    // 내용이 비어 있어도 고치기 전에는 나무라지 않는다
    expect(screen.queryByText(BODY_ERROR)).toBeNull()
    type(bodies()[2]!, '새 글')
    await press(/^저장/)
    expect(server.inserts).toEqual([[{ kind: 'followup', name: '새 진료 안내', body: '새 글', sort_order: 2 }]])
    // 저장해도 고른 줄이 그대로다
    expect((screen.getByLabelText('미리 볼 문구') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe('3번 · 새 진료 안내')
  })

  it('AC-613.2: 줄이 없을 때 빈 글에 번호(1.)가 붙지 않고 글자는 14/22다(목업 .mlist > li.empty)', async () => {
    await open(fakeServer([INJECTION]))
    fireEvent.click(button('주사 알림 지우기'))
    const list = screen.getByRole('list', { name: '문구 목록' })
    expect(list.classList.contains('list-none')).toBe(true)
    const empty = within(list).getByRole('listitem')
    expect(empty.textContent).toBe('문구가 없어요. 아래에서 문구를 더해 주세요.')
    expect(empty.classList.contains('text-body')).toBe(true)
  })

  it('AC-613.2: 줄이 없으면 빈 글이 나오고, 미리 볼 문구가 막히며 [문구 복사]가 먹지 않는다', async () => {
    await open(fakeServer([INJECTION]))
    fireEvent.click(button('주사 알림 지우기'))
    expect(screen.getByText('문구가 없어요. 아래에서 문구를 더해 주세요.')).toBeTruthy()
    expect((screen.getByLabelText('미리 볼 문구') as HTMLSelectElement).disabled).toBe(true)
    expect(preview()).toBe('미리 볼 문구가 없어요.')
    expect(button('문구 복사').getAttribute('aria-disabled')).toBe('true')
    await press('문구 복사')
    expect(writeText).not.toHaveBeenCalled()
  })

  it('AC-613.2: 고친 칸만 바로 알려 주고, 글자 수를 보인다', async () => {
    await open(fakeServer([{ ...INJECTION, body: '글' }, FOLLOWUP]))
    expect(screen.getByText('1/2,000자')).toBeTruthy()
    type(names()[0]!, 'ㄱ'.repeat(31))
    expect(screen.getByText(NAME_ERROR)).toBeTruthy()
    expect(names()[0]?.getAttribute('aria-invalid')).toBe('true')
    expect(names()[1]?.getAttribute('aria-invalid')).toBeNull()
    type(bodies()[0]!, 'ㄴ'.repeat(2001))
    expect(screen.getByText(BODY_ERROR)).toBeTruthy()
    expect(screen.getByText('2,001/2,000자')).toBeTruthy()
    type(names()[0]!, 'ㄱ'.repeat(30))
    expect(screen.queryByText(NAME_ERROR)).toBeNull()
    expect(names()[0]?.getAttribute('aria-invalid')).toBeNull()
  })

  it('AC-613.2: 틀린 칸이 있으면 [저장]이 보내지 않고 안내·칸 오류를 보이며 첫 틀린 칸에 초점을 준다', async () => {
    const { server } = await open()
    fireEvent.click(button('문구 더하기'))
    await press(/^저장/)
    expect(server.writes()).toBe(0)
    expect(screen.getByText('고칠 칸이 있어요. 칸 아래 안내를 확인해 주세요.')).toBeTruthy()
    expect(screen.getByText(BODY_ERROR)).toBeTruthy()
    expect(document.activeElement).toBe(bodies()[2])
    expect(bodies()[2]?.getAttribute('aria-invalid')).toBe('true')
    expect(bodies()[2]?.getAttribute('aria-describedby')).toBe(screen.getByText(BODY_ERROR).id)
  })

  it('AC-613.2: 저장 중에는 [저장]을 또 눌러도 더하기가 한 번만 나가고, 칸을 고칠 수 없다', async () => {
    const { server } = await open()
    fireEvent.click(button('문구 더하기'))
    type(bodies()[2]!, '새 글')
    const release = hold(server)
    fireEvent.click(saveButton())
    fireEvent.click(saveButton())
    await flush()

    expect(saveButton().textContent).toBe('저장하는 중…')
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    expect(screen.getByText('저장하는 중이에요…')).toBeTruthy()
    fireEvent.click(saveButton())
    expect(names()[0]?.readOnly).toBe(true)
    expect(bodies()[0]?.readOnly).toBe(true)
    await release()

    expect(server.inserts).toHaveLength(1)
    expect(server.rows).toHaveLength(3)
    expect(saveButton().textContent).toBe('저장')
    expect(saveButton().getAttribute('aria-busy')).toBeNull()
    expect(names()[0]?.readOnly).toBe(false)
  })
})

describe('MessagesTool: 복사 (AC-613.3)', () => {
  it('AC-613.3: [문구 복사]는 고른 줄을 고른 날짜로 채워 넣고 결과 줄을 보인다. 저장 전 글도 그대로 복사한다', async () => {
    await open()
    await press('문구 복사')
    expect(writeText).toHaveBeenCalledTimes(1)
    expect(writeText).toHaveBeenCalledWith('[*1*]님, [*2*] 주사 날짜예요.\n* 11월 5일 목요일 *\n문의 02-0000-0000')
    expect(screen.getByText('복사했어요 · 주사 알림 · 11월 5일 (목)')).toBeTruthy()

    type(bodies()[1]!, '고친 글\n<<DATE>>')
    type(screen.getByLabelText('미리 볼 문구'), screen.getByRole<HTMLOptionElement>('option', { name: '2번 · 진료 알림' }).value)
    type(dateBox(), '2026-11-09')
    await press('문구 복사')
    expect(writeText).toHaveBeenLastCalledWith('고친 글\n* 11월 9일 월요일 *')
    expect(screen.getByText('복사했어요 · 진료 알림 · 11월 9일 (월)')).toBeTruthy()
  })

  it('AC-613.3: 복사가 막히면 미리 보기 글을 골라 둔 채 안내한다', async () => {
    await open()
    writeText.mockRejectedValue(new Error('denied'))
    await press('문구 복사')
    expect(screen.getByText(COPY_BLOCKED)).toBeTruthy()
    expect(screen.queryByText(/^복사했어요/)).toBeNull()
    expect(window.getSelection()?.toString()).toBe(preview())
  })

  it('AC-613.3: 문자를 보내는 단추가 없다', async () => {
    await open()
    expect(noButton(/보내기|발송|전송/)).toBeNull()
  })

  it('AC-613.3: 다른 도구로 가면 복사 결과 줄을 지운다(목업 setTool)', async () => {
    const { rerender } = await open()
    await press('문구 복사')
    expect(screen.getByText(/^복사했어요/)).toBeTruthy()
    rerender(<MessagesTool today={TODAY} active={false} />)
    await flush()
    expect(screen.queryByText(/^복사했어요/)).toBeNull()
  })
})

describe('MessagesTool: 저장 실패 (AC-613.4)', () => {
  it('AC-613.4: 고친 값을 그대로 두고 오류 카드와 [다시 저장]을 보인다. 다시 저장이 되면 카드가 사라진다', async () => {
    const { server } = await open()
    server.failUpdateOf = 'a'
    type(names()[0]!, '고친 이름')
    type(bodies()[1]!, '고친 글')
    await press(/^저장/)

    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-PATIENTS-TEMPLATES-SAVE').what)
    expect(card.textContent).toContain('오류 번호 E-PATIENTS-TEMPLATES-SAVE')
    expect(names()[0]?.value).toBe('고친 이름')
    expect(bodies()[1]?.value).toBe('고친 글')
    expect(screen.queryByText(/처음이라 기본 문구/)).toBeNull()

    server.failUpdateOf = null
    await press('다시 저장')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(noButton('다시 저장')).toBeNull()
    expect(server.rows.map(({ name }) => name)).toEqual(['고친 이름', '진료 알림'])
    expect(screen.getByText('저장했어요')).toBeTruthy()
  })

  it('AC-613.4: 다시 저장을 두 번 눌러도 한 번만 나간다. 그동안 [다시 저장]은 없고 [저장]은 기다림이다', async () => {
    const { server } = await open()
    fireEvent.click(button('문구 더하기'))
    type(bodies()[2]!, '새 글')
    server.failInsert = true
    await press(/^저장/)
    expect(server.inserts).toHaveLength(1)

    server.failInsert = false
    const release = hold(server)
    const again = button('다시 저장')
    fireEvent.click(again)
    fireEvent.click(again)
    await flush()
    expect(noButton('다시 저장')).toBeNull()
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    expect(document.activeElement).toBe(saveButton())
    fireEvent.click(saveButton())
    await release()

    expect(server.inserts).toHaveLength(2)
    expect(server.rows).toHaveLength(3)
  })

  it('AC-613.4: 다시 읽기까지 실패해도 카드와 고친 값이 그대로이고, [다시 저장]은 읽기 전에는 쓰지 않는다', async () => {
    const { server } = await open()
    server.failUpdateOf = 'a'
    server.failReads = 1
    type(names()[0]!, '고친 이름')
    await press(/^저장/)
    expect(screen.getByRole('alert').textContent).toContain('E-PATIENTS-TEMPLATES-SAVE')
    expect(names()[0]?.value).toBe('고친 이름')

    server.failUpdateOf = null
    server.failReads = 1
    const writes = server.writes()
    await press('다시 저장')
    expect(server.writes()).toBe(writes)
    expect(screen.getByRole('alert').textContent).toContain('E-PATIENTS-TEMPLATES-SAVE')
    expect(button('다시 저장')).toBeTruthy()
    expect(noButton('다시 불러오기')).toBeNull()
    expect(names()[0]?.value).toBe('고친 이름')

    await press('다시 저장')
    expect(screen.queryByRole('alert')).toBeNull()
    expect(server.rows[0]?.name).toBe('고친 이름')
  })

  it('AC-613.4: 순서 바꾸기가 반만 되면 "저장했어요"가 아니라 오류 카드와 [다시 저장]이고, 누르면 남은 줄의 순서를 고친다', async () => {
    const { server } = await open()
    fireEvent.click(button('진료 알림 위로'))
    server.failUpdateOf = 'a'
    await press(/^저장/)

    expect(screen.getByRole('alert').textContent).toContain('오류 번호 E-PATIENTS-TEMPLATES-SAVE')
    expect(screen.queryByText('저장했어요')).toBeNull()
    expect(names().map((box) => box.value)).toEqual(['진료 알림', '주사 알림'])
    expect(server.rows.map(({ sort_order }) => sort_order)).toEqual([0, 0])

    server.failUpdateOf = null
    const sent = server.updates.length
    await press('다시 저장')
    expect(server.updates.slice(sent).map(({ id, row }) => [id, row.sort_order])).toEqual([['a', 1]])
    expect(server.rows.map(({ id, sort_order }) => [id, sort_order])).toEqual([
      ['a', 1],
      ['b', 0],
    ])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('저장했어요')).toBeTruthy()
  })

  it('AC-613.4: 실패 뒤 다시 읽기에 다른 기기 줄이 오면 보이지 않은 채 두었다가, [다시 저장]이 지우지 않고 저장 뒤 목록에 보인다', async () => {
    const { server } = await open()
    server.failUpdateOf = 'a'
    server.rows.push({ ...FOLLOWUP, id: 'x', name: '다른 기기 줄', sort_order: 5 })
    type(names()[0]!, '고친 이름')
    await press(/^저장/)
    expect(screen.getByRole('alert').textContent).toContain('E-PATIENTS-TEMPLATES-SAVE')
    expect(names().map((box) => box.value)).toEqual(['고친 이름', '진료 알림'])

    server.failUpdateOf = null
    await press('다시 저장')
    expect(server.deletes).toEqual([])
    expect(names().map((box) => box.value)).toEqual(['고친 이름', '진료 알림', '다른 기기 줄'])
    expect(screen.queryByRole('alert')).toBeNull()
    expect(screen.getByText('저장했어요')).toBeTruthy()
  })

  it('AC-613.4: [다시 저장]을 눌렀는데 틀린 칸이 있으면 보내지 않고 카드를 둔 채 그 칸에 초점을 준다', async () => {
    const { server } = await open()
    server.failUpdateOf = 'a'
    type(names()[0]!, '고친 이름')
    await press(/^저장/)
    const writes = server.writes()
    type(names()[1]!, '')
    await press('다시 저장')
    expect(server.writes()).toBe(writes)
    expect(screen.getByRole('alert').textContent).toContain('E-PATIENTS-TEMPLATES-SAVE')
    expect(document.activeElement).toBe(names()[1])
  })

  it('AC-613.4: 쓰기가 끝나고 다시 읽기만 실패하면 [다시 저장]이 아니라 읽기 오류 카드와 [다시 불러오기]다. 눌러도 줄이 겹치지 않는다', async () => {
    const { server } = await open()
    fireEvent.click(button('문구 더하기'))
    type(bodies()[2]!, '새 글')
    server.failReads = 1
    await press(/^저장/)

    expect(screen.getByRole('alert').textContent).toContain('E-PATIENTS-TEMPLATES-READ')
    expect(noButton('다시 저장')).toBeNull()
    expect(noButton(/^저장/)).toBeNull()
    expect(screen.queryByRole('list', { name: '문구 목록' })).toBeNull()

    await press('다시 불러오기')
    expect(server.inserts).toHaveLength(1)
    expect(server.rows).toHaveLength(3)
    expect(names().map((box) => box.value)).toEqual(['주사 알림', '진료 알림', '새 주사 안내'])
    expect(saveButton().getAttribute('aria-disabled')).toBe('true')
  })
})

describe('MessagesTool: 읽기 실패 (AC-613.6)', () => {
  it('AC-613.6: 오류 카드와 [다시 불러오기]만 보이고 목록·고치기·[저장]·[문구 복사]·미리 보기가 없다', async () => {
    const server = fakeServer()
    server.failReads = 1
    await open(server)
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-PATIENTS-TEMPLATES-READ').what)
    expect(card.textContent).toContain('오류 번호 E-PATIENTS-TEMPLATES-READ')
    expect(screen.getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 불러오기'])
    expect(screen.queryByRole('list')).toBeNull()
    expect(screen.queryByRole('textbox')).toBeNull()
    expect(screen.queryByRole('region', { name: '미리 보기' })).toBeNull()
    expect(screen.queryByLabelText('내원 날짜')).toBeNull()
    expect(screen.queryByText(/처음이라 기본 문구/)).toBeNull()
    expect(server.writes()).toBe(0)
  })

  it('AC-613.6: 저절로 다시 읽지 않는다. 눌렀을 때만 읽고, 읽히면 서버 줄이 나온다', async () => {
    const server = fakeServer()
    server.failReads = 1
    await open(server)
    await flush()
    await flush()
    expect(server.reads).toBe(1)
    fireEvent.click(button('다시 불러오기'))
    expect(screen.getByRole('status').textContent).toBe('문자 문구를 불러오는 중이에요')
    await flush()
    expect(server.reads).toBe(2)
    expect(names().map((box) => box.value)).toEqual(['주사 알림', '진료 알림'])
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('MessagesTool: 문구 밖으로 새지 않는다', () => {
  it('AC-613.3: 미리 보기·복사·저장 동안 console·브라우저 저장소·주소에 아무것도 남지 않는다', async () => {
    const consoles = (['log', 'info', 'warn', 'error', 'debug'] as const).map((level) => vi.spyOn(console, level))
    const stored = vi.spyOn(Storage.prototype, 'setItem')
    const address = window.location.href
    const { server } = await open()
    type(bodies()[0]!, '고친 글\n<<DATE>>')
    await press('문구 복사')
    await press(/^저장/)
    server.failUpdateOf = 'a'
    type(bodies()[0]!, '또 고친 글')
    await press(/^저장/)
    for (const spy of consoles) expect(spy).not.toHaveBeenCalled()
    expect(stored).not.toHaveBeenCalled()
    expect(window.location.href).toBe(address)
  })
})
