// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TAB_ACCESS_MENU, type MenuPath, type TabAccessRow } from '@/components/shell/menu'
import { ds } from '@/components/ui/classes'
import { errorInfo } from '@/lib/errors'
import { TabAccessError } from '@/lib/storage/tabAccess'
import { TabAccessSettings } from './TabAccessSettings'

// 설정 맨 아래 '관리자만 보는 탭' 칸 (multi-admin REQ-7707 AC-7707.2~5, design.md '설정 칸'·기본값 24·25, 시안 docs/mockups/multi-admin/settings.html ?s=owner|saved|error).
// 읽기·저장 함수(TASK-3)는 흉내 낸다 — 실제 Supabase에 붙지 않는다. TabAccessError는 진짜를 쓴다
const store = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn(), save: vi.fn() }))
vi.mock('@/lib/storage/tabAccess', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/tabAccess')>()),
  readTabOwner: store.owner,
  readTabAccess: store.read,
  saveTabAccess: store.save,
}))
vi.mock('@/lib/supabase/browser', () => ({
  supabaseBrowser: () => {
    throw new Error('시험은 실제 Supabase에 붙지 않는다')
  },
}))

const TITLE = '관리자만 보는 탭'
const DESC = '켜 둔 탭은 관리자 계정에만 보여요. 다른 원장 계정과 데스크 계정에서는 메뉴에서 사라지고, 주소로 들어와도 대시보드로 돌아가요. 새로 생긴 탭은 처음에 켜져 있어요.'
const NAMES = ['통계', '청구', '고시·공지', '환자', '업무일지', '수납일지', '예약', 'AI 리포트', '서식', '직원', '재고', '주소록']
const PATHS: MenuPath[] = ['/stats', '/claim', '/notices', '/patients', '/worklog', '/sunap', '/calendar', '/ai-report', '/forms', '/staff', '/inventory', '/contacts']
const SAVED_NOTE = '저장했어요.'
// 마이그레이션 씨앗: 지금 탭 12개 모두 '모두에게'
const SEED: TabAccessRow[] = TAB_ACCESS_MENU.map((item) => ({ path: item.path, adminOnly: false }))
// 시안 예시(AI 리포트·직원·재고 켜짐) + 서식 줄 없음(→ 관리자만) + 목록 밖 경로 줄(버림)
const SAVED: TabAccessRow[] = [
  ...SEED.filter((row) => !['/ai-report', '/staff', '/inventory', '/forms'].includes(row.path)),
  { path: '/ai-report', adminOnly: true },
  { path: '/staff', adminOnly: true },
  { path: '/inventory', adminOnly: true },
  { path: '/old-tab', adminOnly: true },
]

const tokens = (classes: string) => classes.split(/\s+/).filter(Boolean)
const classOf = (el: Element) => el.getAttribute('class') ?? ''
const sameClasses = (el: Element, classes: string) => expect(tokens(classOf(el)).sort()).toEqual(tokens(classes).sort())
const isBefore = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0

const section = () => screen.getByRole('region', { name: TITLE })
const boxes = () => within(section()).getAllByRole('checkbox') as HTMLInputElement[]
const box = (name: string) => within(section()).getByRole('checkbox', { name }) as HTMLInputElement
const checkedNames = () => boxes().filter((b) => b.checked).map((b) => b.getAttribute('aria-label') ?? b.closest('label')?.textContent)
const saveButton = () => within(section()).getByRole('button', { name: /^(저장|다시 저장)$/ }) as HTMLButtonElement
const flush = () => act(async () => {})

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason: unknown) => void
  const promise = new Promise<T>((ok, no) => {
    resolve = ok
    reject = no
  })
  return { promise, resolve, reject }
}

async function renderReady(rows: TabAccessRow[] = SEED) {
  store.read.mockResolvedValue(rows)
  const user = userEvent.setup()
  render(<TabAccessSettings />)
  await screen.findByRole('region', { name: TITLE })
  await within(section()).findAllByRole('checkbox')
  return user
}

beforeEach(() => {
  store.owner.mockReset().mockResolvedValue(true)
  store.read.mockReset().mockResolvedValue(SEED)
  store.save.mockReset().mockResolvedValue(undefined)
})
afterEach(cleanup)

describe('AC-7707.2 주 관리자에게만 보이는 칸', () => {
  it("AC-7707.2: 주 관리자(readTabOwner 참)면 제목 '관리자만 보는 탭'과 설명이 화면 글자 그대로인 칸이 보이고, 확인·목록 읽기를 한 번씩 부른다", async () => {
    await renderReady()
    const title = within(section()).getByRole('heading', { level: 2, name: TITLE })
    const desc = within(section()).getByText(DESC)
    expect(desc.tagName).toBe('P')
    expect(isBefore(title, desc)).toBe(true)
    expect(isBefore(desc, within(section()).getByRole('list'))).toBe(true)
    expect(store.owner).toHaveBeenCalledTimes(1)
    expect(store.read).toHaveBeenCalledTimes(1)
    expect(store.save).not.toHaveBeenCalled()
  })

  it.each<[string, () => void]>([
    ['주 관리자가 아닌 관리자·원장(거짓)', () => store.owner.mockResolvedValue(false)],
    ['확인 실패(TabAccessError)', () => store.owner.mockRejectedValue(new TabAccessError('관리자만 보는 탭을 읽지 못했어요', { cause: new Error('secret') }))],
    ['확인이 던짐(다른 오류)', () => store.owner.mockRejectedValue(new Error('network secret'))],
  ])('AC-7707.2: %s면 칸도 오류 카드도 없고 목록을 읽지 않는다', async (_, arrange) => {
    arrange()
    const { container } = render(<TabAccessSettings />)
    await waitFor(() => expect(store.owner).toHaveBeenCalledTimes(1))
    await flush()
    await flush()
    expect(container.innerHTML).toBe('')
    expect(screen.queryByRole('region', { name: TITLE })).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
    expect(store.read).not.toHaveBeenCalled()
    expect(store.save).not.toHaveBeenCalled()
  })

  it('AC-7707.2: 주 관리자도 확인과 목록 읽기가 둘 다 끝나기 전에는 칸이 없다(읽는 중 글 없음)', async () => {
    const owner = deferred<boolean>()
    const rows = deferred<TabAccessRow[]>()
    store.owner.mockReturnValue(owner.promise)
    store.read.mockReturnValue(rows.promise)
    const { container } = render(<TabAccessSettings />)
    await flush()
    expect(container.innerHTML).toBe('')
    expect(store.read).not.toHaveBeenCalled()
    owner.resolve(true)
    await waitFor(() => expect(store.read).toHaveBeenCalledTimes(1))
    await flush()
    expect(container.innerHTML).toBe('')
    rows.resolve(SEED)
    expect(await screen.findByRole('region', { name: TITLE })).toBeTruthy()
    expect(boxes()).toHaveLength(12)
  })

  it('AC-7707.2: 설정 화면(SettingsPage)은 데스크 계정(DeskAccounts) 바로 다음 줄, 맨 아래에 이 칸을 둔다', () => {
    const page = readFileSync(join(process.cwd(), 'src/components/settings/SettingsPage.tsx'), 'utf8')
    expect(page).toMatch(/import \{ TabAccessSettings \} from '\.\/TabAccessSettings'/)
    expect(page).toMatch(/<DeskAccounts \/>\n\s*<TabAccessSettings \/>\n/)
    expect(page).toMatch(/<CashFloatSetting \/>\n\s*<DeskAccounts \/>\n/)
  })
})

describe('AC-7707.3 탭 목록·체크·읽기 실패', () => {
  it('AC-7707.3: 12줄이 화면 글자 차례이고 줄마다 체크 상자(이름 = 탭 이름)이며 줄 전체(label)가 눌린다', async () => {
    const user = await renderReady()
    const list = within(section()).getByRole('list')
    const items = within(list).getAllByRole('listitem')
    expect(items.map((li) => li.textContent)).toEqual(NAMES)
    expect(boxes()).toHaveLength(12)
    NAMES.forEach((name, at) => {
      const input = box(name)
      expect(input.type).toBe('checkbox')
      expect(items[at]!.contains(input)).toBe(true)
      // 줄 전체가 label: 상자와 탭 이름이 한 label 안에 있고 그 label이 줄(li)의 유일한 자식이다
      const label = input.closest('label') as HTMLLabelElement
      expect(label).toBeTruthy()
      expect(label.parentElement).toBe(items[at])
      expect(items[at]!.children).toHaveLength(1)
      expect(label.textContent).toBe(name)
    })
    // 이름 글자를 눌러도 체크가 바뀐다
    expect(box('통계').checked).toBe(false)
    await user.click(within(section()).getByText('통계'))
    expect(box('통계').checked).toBe(true)
    await user.click(box('통계').closest('label') as HTMLLabelElement)
    expect(box('통계').checked).toBe(false)
  })

  it.each<[string, TabAccessRow[], string[]]>([
    ['씨앗 12줄 모두 모두에게', SEED, []],
    ['시안 예시 + 줄 없는 서식 + 목록 밖 줄', SAVED, ['AI 리포트', '서식', '직원', '재고']],
    ['줄이 하나도 없음(새 탭 = 관리자만)', [], NAMES],
  ])('AC-7707.3: 체크는 adminOnlyTabs(읽은 줄)에 든 탭이다 — %s', async (_, rows, checked) => {
    await renderReady(rows)
    expect(checkedNames()).toEqual(checked)
    expect(boxes()).toHaveLength(12)
  })

  it('AC-7707.3: 목록 읽기가 실패하면 칸 안에 E-SETTINGS-FAILED 카드와 [다시 불러오기]만 있고, 누르면 목록만 다시 읽어 되면 목록이 나온다', async () => {
    store.read.mockRejectedValueOnce(new TabAccessError('관리자만 보는 탭을 읽지 못했어요', { cause: new Error('relation secret does not exist') }))
    const user = userEvent.setup()
    render(<TabAccessSettings />)
    const alert = await within(await screen.findByRole('region', { name: TITLE })).findByRole('alert')
    const info = errorInfo('E-SETTINGS-FAILED')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(section().textContent).not.toContain('secret')
    // 제목·설명은 그대로, 목록·체크·[저장]은 없다
    expect(within(section()).getByRole('heading', { level: 2, name: TITLE })).toBeTruthy()
    expect(within(section()).getByText(DESC)).toBeTruthy()
    expect(within(section()).queryByRole('list')).toBeNull()
    expect(within(section()).queryAllByRole('checkbox')).toEqual([])
    expect(within(section()).getAllByRole('button').map((b) => b.textContent)).toEqual(['다시 불러오기'])
    store.read.mockResolvedValueOnce(SAVED)
    await user.click(within(section()).getByRole('button', { name: '다시 불러오기' }))
    await within(section()).findByRole('list')
    expect(within(section()).queryByRole('alert')).toBeNull()
    expect(checkedNames()).toEqual(['AI 리포트', '서식', '직원', '재고'])
    expect(store.read).toHaveBeenCalledTimes(2)
    expect(store.owner).toHaveBeenCalledTimes(1)
  })
})

describe('AC-7707.4 저장·알림·실패', () => {
  it('AC-7707.4: [저장]은 saveTabAccess를 한 번 부르며 12개를 체크한 것(관리자만)·안 한 것(모두에게)으로 MENU 차례로 모두 나눠 보낸다(바뀐 것이 없어도 눌린다)', async () => {
    const user = await renderReady(SAVED)
    expect(saveButton().textContent).toBe('저장')
    expect(saveButton().disabled).toBe(false)
    await user.click(saveButton())
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(1))
    expect(store.save).toHaveBeenCalledWith(
      ['/ai-report', '/forms', '/staff', '/inventory'],
      ['/stats', '/claim', '/notices', '/patients', '/worklog', '/sunap', '/calendar', '/contacts'],
    )
    // 통계를 켜고 서식을 끄면 그대로 나뉜다
    await user.click(box('통계'))
    await user.click(box('서식'))
    await user.click(saveButton())
    await waitFor(() => expect(store.save).toHaveBeenCalledTimes(2))
    const [adminOnly, everyone] = store.save.mock.calls[1] as [MenuPath[], MenuPath[]]
    expect(adminOnly).toEqual(['/stats', '/ai-report', '/staff', '/inventory'])
    expect(everyone).toEqual(['/claim', '/notices', '/patients', '/worklog', '/sunap', '/calendar', '/forms', '/contacts'])
    expect([...adminOnly, ...everyone].sort()).toEqual([...PATHS].sort())
    // 저장해도 다시 읽지 않는다(주 관리자 자신의 메뉴는 바뀌지 않는다)
    expect(store.owner).toHaveBeenCalledTimes(1)
    expect(store.read).toHaveBeenCalledTimes(1)
  })

  it('AC-7707.4: 보내는 동안 단추는 aria-busy이고 다시 눌러도 한 번만 보낸다', async () => {
    const sending = deferred<void>()
    store.save.mockReturnValue(sending.promise)
    const user = await renderReady()
    expect(saveButton().hasAttribute('aria-busy')).toBe(false)
    await user.click(saveButton())
    expect(saveButton().getAttribute('aria-busy')).toBe('true')
    await user.click(saveButton())
    await user.click(saveButton())
    expect(store.save).toHaveBeenCalledTimes(1)
    sending.resolve()
    await within(section()).findByRole('status')
    expect(saveButton().hasAttribute('aria-busy')).toBe(false)
    expect(store.save).toHaveBeenCalledTimes(1)
  })

  it("AC-7707.4: 되면 단추 옆에 '저장했어요.'(role=status)가 보이고 체크를 바꾸면 사라진다", async () => {
    const user = await renderReady()
    expect(within(section()).queryByRole('status')).toBeNull()
    await user.click(saveButton())
    const status = await within(section()).findByRole('status')
    expect(status.textContent).toBe(SAVED_NOTE)
    expect(status.tagName).toBe('SPAN')
    expect(status.parentElement).toBe(saveButton().parentElement)
    expect(isBefore(saveButton(), status)).toBe(true)
    await user.click(box('예약'))
    expect(within(section()).queryByRole('status')).toBeNull()
    expect(within(section()).queryByText(SAVED_NOTE)).toBeNull()
  })

  it("AC-7707.4: 실패하면 단추 줄 위에 E-SETTINGS-FAILED 카드(원래 글 없음)·단추 '다시 저장'·체크 그대로이고, 다시 해서 되면 카드가 사라지고 '저장했어요.'·단추 '저장'이다", async () => {
    const user = await renderReady(SAVED)
    // 먼저 한 번 되어 '저장했어요.'가 있던 뒤에 실패해도 그 글은 사라진다
    await user.click(saveButton())
    await within(section()).findByRole('status')
    await user.click(box('통계'))
    store.save.mockRejectedValueOnce(new TabAccessError('관리자만 보는 탭을 저장하지 못했어요', { cause: new Error('permission denied secret') }))
    await user.click(saveButton())
    const alert = await within(section()).findByRole('alert')
    const info = errorInfo('E-SETTINGS-FAILED')
    expect(alert.textContent).toContain(info.what)
    expect(alert.textContent).toContain(info.fix)
    expect(alert.textContent).toContain('오류 번호 E-SETTINGS-FAILED')
    expect(section().textContent).not.toContain('secret')
    expect(section().textContent).not.toContain('관리자만 보는 탭을 저장하지 못했어요')
    // 자리: 목록 다음, 단추 줄 위(단추 줄 바로 앞)
    expect(isBefore(within(section()).getByRole('list'), alert)).toBe(true)
    expect(alert.nextElementSibling).toBe(saveButton().parentElement)
    expect(saveButton().textContent).toBe('다시 저장')
    expect(within(section()).queryByRole('status')).toBeNull()
    expect(checkedNames()).toEqual(['통계', 'AI 리포트', '서식', '직원', '재고'])
    // 체크를 바꿔도 카드는 다시 누를 때까지 남는다(시안)
    await user.click(box('통계'))
    await user.click(box('통계'))
    expect(within(section()).getByRole('alert')).toBe(alert)
    await user.click(saveButton())
    await within(section()).findByRole('status')
    expect(within(section()).queryByRole('alert')).toBeNull()
    expect(within(section()).getByRole('status').textContent).toBe(SAVED_NOTE)
    expect(saveButton().textContent).toBe('저장')
    expect(store.save).toHaveBeenCalledTimes(3)
    expect(store.save.mock.calls[2]).toEqual(store.save.mock.calls[1])
  })
})

describe('AC-7707.5 클래스(시안 settings.html)', () => {
  const clinicSource = () => readFileSync(join(process.cwd(), 'src/components/settings/ClinicProfileCard.tsx'), 'utf8')
  const PANEL = `${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`
  const HEAD = 'flex flex-col gap-1'
  const DESC_CLASS = 'text-small text-ink-2'
  // list-none: 앱 초기화(.app-ui)는 목록 점을 지우지 않는다 → 줄마다 기본 점이 틀 밖에 찍혔다(TASK-7 화면 확인, 시안은 list-style:none)
  const LIST = 'flex max-w-90 list-none flex-col rounded-control border border-line'
  const ITEM = 'border-b border-line last:border-b-0'
  const LABEL = 'flex cursor-pointer items-center gap-2 px-3 py-2 text-body text-ink hover:bg-canvas'

  it('AC-7707.5: 칸 틀·머리(제목 ds.panelTitle + 설명 small ink-2)는 병원 정보 칸과 같은 클래스 글자다', async () => {
    await renderReady()
    const source = clinicSource()
    expect(source).toContain('className={`${ds.panel} flex flex-col gap-4 p-5 max-md:p-4`}')
    expect(source).toContain(`<div className="${HEAD}">`)
    expect(source).toContain(`<p className="${DESC_CLASS}">{INTRO}</p>`)
    sameClasses(section(), PANEL)
    expect(section().tagName).toBe('SECTION')
    const title = within(section()).getByRole('heading', { level: 2, name: TITLE })
    sameClasses(title, ds.panelTitle)
    const head = title.parentElement as HTMLElement
    expect(head.parentElement).toBe(section())
    expect(head.tagName).toBe('DIV')
    sameClasses(head, HEAD)
    sameClasses(within(section()).getByText(DESC), DESC_CLASS)
    expect(within(section()).getByText(DESC).parentElement).toBe(head)
  })

  it("AC-7707.5: 목록은 병원 정보 '진료시간' 목록 틀(1px line·4px·줄 사이 1px·줄 안쪽 8px 12px)에 폭 360px, 체크 상자는 ds.checkboxWrap·checkbox·checkboxMark다", async () => {
    await renderReady(SAVED)
    const source = clinicSource()
    expect(source).toContain('className="flex flex-col rounded-control border border-line"')
    expect(source).toMatch(/border-b border-line px-3 py-2 last:border-b-0/)
    const list = within(section()).getByRole('list')
    expect(list.tagName).toBe('UL')
    sameClasses(list, LIST)
    expect(list.getAttribute('aria-labelledby')).toBe(within(section()).getByRole('heading', { level: 2 }).id)
    for (const li of within(list).getAllByRole('listitem')) {
      sameClasses(li, ITEM)
      sameClasses(li.firstElementChild as Element, LABEL)
    }
    for (const input of boxes()) {
      sameClasses(input, ds.checkbox)
      const wrap = input.parentElement as HTMLElement
      expect(wrap.tagName).toBe('SPAN')
      sameClasses(wrap, ds.checkboxWrap)
      const mark = input.nextElementSibling as Element
      expect(mark.tagName.toLowerCase()).toBe('svg')
      sameClasses(mark, ds.checkboxMark)
      expect(mark.getAttribute('aria-hidden')).toBe('true')
    }
  })

  it('AC-7707.5: [저장]·[다시 저장]은 ds.button.primary, 단추 줄은 flex-wrap 8px, 저장 알림은 small ink-2, [다시 불러오기]는 ds.button.secondarySmall', async () => {
    const user = await renderReady()
    sameClasses(saveButton(), ds.button.primary)
    sameClasses(saveButton().parentElement as Element, 'flex flex-wrap items-center gap-2')
    await user.click(saveButton())
    sameClasses(await within(section()).findByRole('status'), 'text-small text-ink-2')
    store.save.mockRejectedValueOnce(new Error('x'))
    await user.click(saveButton())
    await within(section()).findByRole('alert')
    sameClasses(saveButton(), ds.button.primary)
    cleanup()
    store.read.mockRejectedValueOnce(new Error('x'))
    render(<TabAccessSettings />)
    const again = await within(await screen.findByRole('region', { name: TITLE })).findByRole('button', { name: '다시 불러오기' })
    sameClasses(again, ds.button.secondarySmall)
  })

  it('AC-7707.5: 폰 전용 모양을 새로 두지 않는다 — max-md:는 칸 틀 max-md:p-4와 ds 값에 든 것뿐이고, 새 색·임의 값·style이 없다', async () => {
    const dsMaxMd = new Set(
      tokens([ds.panel, ds.panelTitle, ds.checkboxWrap, ds.checkbox, ds.checkboxMark, ds.button.primary, ds.button.secondarySmall].join(' ')).filter((t) =>
        t.startsWith('max-md:'),
      ),
    )
    const check = () => {
      for (const el of [section(), ...Array.from(section().querySelectorAll('*'))]) {
        const own = tokens(classOf(el)).filter((t) => t.startsWith('max-md:'))
        for (const t of own) {
          const ok = (el === section() && t === 'max-md:p-4') || dsMaxMd.has(t)
          expect(ok, `${el.tagName} ${t}`).toBe(true)
        }
        expect(el.hasAttribute('style'), el.tagName).toBe(false)
      }
    }
    const user = await renderReady(SAVED)
    check()
    await user.click(saveButton())
    await within(section()).findByRole('status')
    check()
    store.save.mockRejectedValueOnce(new Error('x'))
    await user.click(saveButton())
    await within(section()).findByRole('alert')
    check()
    const source = readFileSync(join(process.cwd(), 'src/components/settings/TabAccessSettings.tsx'), 'utf8')
    // 소스의 max-md:는 칸 틀 한 곳뿐이다
    expect(source.match(/max-md:/g)).toEqual(['max-md:'])
    expect(source).toContain('max-md:p-4')
    // 새 색 없음: 색 글자(#…·rgb·hsl)·임의 값([…])·style 없음
    expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(|hsla?\(|-\[|style=/)
  })
})
