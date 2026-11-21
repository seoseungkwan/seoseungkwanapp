// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { buildImportPlan } from '@/lib/contacts/plan'
import { CONTACT_KEYS, type Cell, type ContactKey, type SheetRows } from '@/lib/contacts/sheet'
import {
  addCompany,
  addEquipment,
  addPerson,
  addRepair,
  ContactsStorageError,
  deleteCompany,
  deleteEquipment,
  deletePerson,
  importContacts,
  loadContacts,
  updateCompany,
} from '@/lib/storage/contacts'
import type { Company, ContactBook, Equipment, Person, Repair } from '@/types/contacts'
import { ContactsScreen } from './ContactsScreen'
import { readUpload } from './import/readUpload'
import { BOOK, installClipboard, installMatchMedia, MEDICAL, PHARM, PHYSIO, SHOCK } from './parts/book.test.data'

// 주소록 화면 잇기(spec contacts AC-6505.1·2·4·5·7·8·9, AC-6506.1·2·4, design.md '화면' ContactsScreen).
// 저장 함수·supabaseBrowser·파일 읽기(readUpload)는 흉내 낸다(실제 Supabase·파일에 붙지 않는다). 부품 자체의 글·모양은 parts/·import/ 시험이 본다.
// 오늘은 시안처럼 2026-11-21(한국). 업체·사람·번호는 모두 지어낸 것이다(parts/book.test.data.ts)

const CLIENT = vi.hoisted(() => ({ fake: 'client' }))
vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: () => CLIENT }))
vi.mock('@/lib/storage/contacts', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/storage/contacts')>()),
  loadContacts: vi.fn(),
  addCompany: vi.fn(),
  updateCompany: vi.fn(),
  deleteCompany: vi.fn(),
  addPerson: vi.fn(),
  updatePerson: vi.fn(),
  deletePerson: vi.fn(),
  addEquipment: vi.fn(),
  updateEquipment: vi.fn(),
  deleteEquipment: vi.fn(),
  addRepair: vi.fn(),
  updateRepair: vi.fn(),
  deleteRepair: vi.fn(),
  importContacts: vi.fn(),
}))
vi.mock('./import/readUpload', () => ({ readUpload: vi.fn() }))

const fetchSpy = vi.fn()
// jsdom은 링크 이동을 못 한다 → 화면의 누름 처리가 끝난 뒤 링크 이동만 막는다([양식 받기]. 단추·칸 보내기는 그대로)
const stopNavigation = (e: Event) => {
  if (e.target instanceof Element && e.target.closest('a[href]')) e.preventDefault()
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date('2026-11-21T01:40:00Z')) // 한국 2026-11-21 10:40
  installMatchMedia(false)
  installClipboard()
  vi.stubGlobal('fetch', fetchSpy)
  document.addEventListener('click', stopNavigation)
  vi.mocked(loadContacts).mockResolvedValue(BOOK)
})
afterEach(() => {
  cleanup()
  document.removeEventListener('click', stopNavigation)
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  Reflect.deleteProperty(window, 'matchMedia')
  Reflect.deleteProperty(navigator, 'clipboard')
})

function later<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

/** 화면을 그리고 처음 읽기가 끝날 때까지 기다린다 */
async function open(props: { initialCompanyId?: string } = {}) {
  const view = render(<ContactsScreen {...props} />)
  await screen.findByRole('searchbox', { name: '업체·담당자·품목·장비 찾기' })
  return view
}
const h1s = () => screen.queryAllByRole('heading', { level: 1 }).map((h) => h.textContent)
/** 왼쪽 목록 칸 */
const listBox = () => {
  const found = document.querySelector<HTMLElement>('[data-contacts-list]')
  if (!found) throw new Error('목록 칸이 없다')
  return found
}
/** 왼쪽 목록의 그 업체 줄 */
const row = (name: string) => {
  const found = listBox().querySelector<HTMLElement>(`[data-company="${name}"]`)
  if (!found) throw new Error(`목록에 ${name} 줄이 없다`)
  return found
}
/** 오른쪽 자세히 칸의 업체 이름(h2). 자세히가 없으면 null */
const detailTitle = () => document.querySelector('[data-contacts-frame] > :nth-child(2) h2')?.textContent ?? null
const panel = () => screen.getByRole('dialog')
/** 짧은 알림(ShortNotice, 아래 가운데) 글 */
const notice = () => document.querySelector('[role="status"][aria-live="polite"]')?.textContent ?? null

const contact = (row: number, values: Partial<Record<ContactKey, Cell>>) => ({
  row,
  cells: Object.fromEntries(CONTACT_KEYS.map((key) => [key, values[key] ?? null])) as Record<ContactKey, Cell>,
})
// 새로 하나(예시방역) · 바뀜 하나(예시약품 대표 전화) · 넣지 않는 줄 하나(분류 '병원')
const ROWS: SheetRows = {
  contacts: [
    contact(2, { category: '수리·관리', name: '예시방역', phone: '02-000-0031', work: '방역·소독' }),
    contact(3, { category: '거래처', name: '예시약품', phone: '02-111-1111' }),
    contact(4, { category: '병원', name: '예시병원' }),
  ],
  equipment: [],
}
/** 숨은 파일 고르기 칸에 파일을 고른다(읽기는 readUpload 흉내가 답한다) */
function pickFile(name: string, container: ParentNode = document.body) {
  const input = container.querySelector('input[type="file"]')
  if (!(input instanceof HTMLInputElement)) throw new Error('파일 고르기 칸이 없다')
  Object.defineProperty(input, 'files', { configurable: true, value: [new File(['x'], name)] })
  fireEvent.change(input)
}

describe('AC-6505.9: 읽는 중·읽기 실패', () => {
  it('AC-6505.9: 읽는 동안은 h1 "주소록"만 있다(단추·찾기·목록·오른쪽 글 없음)', async () => {
    const first = later<ContactBook>()
    vi.mocked(loadContacts).mockReturnValue(first.promise)
    const { container } = render(<ContactsScreen />)
    expect(h1s()).toEqual(['주소록'])
    expect(container.textContent).toBe('주소록')
    expect(screen.queryAllByRole('button')).toEqual([])
    expect(screen.queryByRole('searchbox')).toBeNull()
    await act(async () => first.resolve(BOOK))
    expect(screen.getByRole('searchbox')).toBeTruthy()
  })

  it('AC-6505.9: 읽기가 실패하면 목록 자리에 E-CONTACTS-READ-FAILED 오류 카드와 [다시 읽기], 누르면 다시 읽어 목록을 그린다', async () => {
    vi.mocked(loadContacts).mockRejectedValueOnce(new ContactsStorageError('offline'))
    render(<ContactsScreen />)
    const card = await screen.findByRole('alert')
    const info = errorInfo('E-CONTACTS-READ-FAILED')
    expect(card.textContent).toContain(info.what)
    expect(card.textContent).toContain(info.fix)
    expect(card.textContent).toContain('E-CONTACTS-READ-FAILED')
    expect(h1s()).toEqual(['주소록'])
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('button', { name: '엑셀 올리기' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: '다시 읽기' }))
    expect(await screen.findByRole('searchbox')).toBeTruthy()
    expect(loadContacts).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('alert')).toBeNull()
  })
})

describe('AC-6505.1: 목록 화면', () => {
  it('AC-6505.1: h1 주소록·업체 {n}곳, 도구 줄 [엑셀 올리기][양식 받기][업체 더하기], 찾기 칸, 칩(수 포함), 분류 묶음 목록, 오른쪽 "업체를 골라 주세요"', async () => {
    await open()
    expect(h1s()).toEqual(['주소록'])
    expect(screen.getByText('업체 8곳')).toBeTruthy()
    const tools = screen.getByRole('button', { name: '엑셀 올리기' }).parentElement!
    expect(Array.from(tools.children).filter((el) => el.tagName !== 'INPUT').map((el) => el.textContent)).toEqual(['엑셀 올리기', '양식 받기', '업체 더하기'])
    const chips = within(screen.getByRole('group', { name: '분류' })).getAllByRole('button')
    expect(chips.map((c) => c.textContent)).toEqual(['전체 8', '거래처 3', '수리·관리 3', '기관·보험 1', '기타 1'])
    const names = Array.from(listBox().querySelectorAll('[data-company]')).map((el) => el.getAttribute('data-company'))
    expect(names).toEqual(['예시메디칼', '예시물리치료기', '예시약품', '예시설비', '예시전산', '예시정비', '예시배상보험', '예시세무회계'])
    expect(screen.getByText('업체를 골라 주세요')).toBeTruthy()
    expect(detailTitle()).toBeNull()
    // 목록 줄 무상 수리 칩: 예시메디칼은 충격파 기계 12일 남음(오늘 2026-11-21)
    expect(within(row('예시메디칼')).getByText('무상 수리 12일 남음')).toBeTruthy()
  })

  it('AC-6505.1: 찾기 칸에 치면 바로 걸러지고 칩 수도 찾은 결과 수, 결과가 없으면 시안 글, 칩을 고르면 그 분류만', async () => {
    await open()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '충격파' } })
    expect(Array.from(listBox().querySelectorAll('[data-company]')).map((el) => el.getAttribute('data-company'))).toEqual(['예시메디칼', '예시물리치료기'])
    expect(screen.getByRole('button', { name: '전체 2' })).toBeTruthy()
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '없는말' } })
    expect(listBox().textContent).toBe("'없는말'에 맞는 업체가 없어요.업체 이름·담당자 이름·하는 일·품목·장비 이름으로 찾아요.")
    fireEvent.click(screen.getByRole('button', { name: '찾기 지우기' }))
    fireEvent.click(screen.getByRole('button', { name: '수리·관리 3' }))
    expect(Array.from(listBox().querySelectorAll('[data-company]')).map((el) => el.getAttribute('data-company'))).toEqual(['예시설비', '예시전산', '예시정비'])
    expect(listBox().querySelector('[data-group]')).toBeNull()
  })

  it('AC-6505.1: 폰 전용 모양 없음 — 두 칸 틀은 최소 폭 720px(min-w-180)이고 감싼 칸만 옆으로 밀린다(overflow-x-auto). 768px 미만에서 바뀌는 클래스가 없다', async () => {
    await open()
    const frame = document.querySelector('[data-contacts-frame]') as HTMLElement
    const classes = frame.className.split(/\s+/)
    // 시안 .cbody: 목록 칸 300px(1024px 미만, 시안 .mid) · 360px(1024px 이상), 위 1px line-strong
    expect(classes).toEqual(expect.arrayContaining(['grid', 'min-w-180', 'grid-cols-[300px_minmax(0,1fr)]', 'lg:grid-cols-[360px_minmax(0,1fr)]', 'border-t', 'border-line-strong']))
    const wrap = frame.parentElement!
    expect(wrap.className.split(/\s+/)).toContain('overflow-x-auto')
    expect(frame.firstElementChild).toBe(listBox())
    // 화면이 그리는 틀(감싼 칸·두 칸 틀·두 칸)의 폭 접두사는 1024px 목록 칸(lg:)뿐이다 — md:·max-md: 같은 폰 전용 줄이 없다
    const widthOf = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter((t) => t.includes(':') && !t.startsWith('lg:') && /^(?:max-|min-)?(?:sm|md|lg|xl|2xl|\[)/.test(t))
    for (const el of [wrap, frame, ...Array.from(frame.children)]) expect(widthOf(el)).toEqual([])
    const source = readFileSync(join(process.cwd(), 'src/components/contacts/ContactsScreen.tsx'), 'utf8')
    expect(source).not.toMatch(/\b(?:max-)?(?:sm|md|xl|2xl):/)
  })

  it('AC-6505.1: 화면 뿌리가 본문 글자(text-body = 14px/22px, 시안 body)이고 업체 판·확인 창·짧은 알림도 그 안에 그려져 물려받는다', async () => {
    const { container } = await open({ initialCompanyId: MEDICAL.id })
    const root = container.firstElementChild as HTMLElement
    expect(container.children).toHaveLength(1)
    expect(root.tagName).toBe('DIV')
    expect(root.className.split(/\s+/)).toContain('text-body')
    expect(root.contains(listBox())).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: `${MEDICAL.name} 고치기` }))
    expect(root.contains(panel())).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: '닫기' }))
    fireEvent.click(screen.getByRole('button', { name: `${MEDICAL.name} 지우기` }))
    expect(root.contains(screen.getByRole('alertdialog'))).toBe(true)
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '그만두기' }))
    fireEvent.click(screen.getByRole('link', { name: '양식 받기' }))
    const toast = document.querySelector('[role="status"][aria-live="polite"]')
    expect(toast?.textContent).toBe('주소록-양식.xlsx를 받았어요.')
    expect(root.contains(toast)).toBe(true)
  })
})

describe('AC-6505.2: 업체 고르기·자세히', () => {
  it('AC-6505.2: 목록 줄을 누르면 오른쪽에 그 업체 자세히(h2)가 열리고 그 줄이 고른 줄이다', async () => {
    await open()
    fireEvent.click(row('예시약품'))
    expect(detailTitle()).toBe('예시약품')
    expect(row('예시약품').getAttribute('aria-current')).toBe('true')
    expect(screen.queryByText('업체를 골라 주세요')).toBeNull()
  })

  it('AC-6505.2: initialCompanyId(주소 ?c=)의 업체를 처음부터 고른다', async () => {
    await open({ initialCompanyId: MEDICAL.id })
    expect(detailTitle()).toBe('예시메디칼')
    expect(row('예시메디칼').getAttribute('aria-current')).toBe('true')
  })

  it('AC-6505.2: ?c=의 업체가 없으면 아무것도 안 고른 모양이다', async () => {
    await open({ initialCompanyId: 'c-none' })
    expect(detailTitle()).toBeNull()
    expect(screen.getByText('업체를 골라 주세요')).toBeTruthy()
    expect(listBox().querySelector('[aria-current]')).toBeNull()
  })

  it('AC-6505.2: [보기]로 연 사이트 비밀번호는 다른 업체로 옮겼다 돌아오면 다시 가려져 있다', async () => {
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '사이트 비밀번호 보기' }))
    expect(screen.getByText('Yesi2026!')).toBeTruthy()
    fireEvent.click(row('예시약품'))
    fireEvent.click(row('예시메디칼'))
    expect(screen.queryByText('Yesi2026!')).toBeNull()
  })
})

describe('AC-6505.4: 업체 더하기·고치기 판', () => {
  it('AC-6505.4: [업체 더하기] → 판(분류는 지금 칩), [저장] → addCompany(client, 칸) → 판이 닫히고 그 업체 자세히·저장했어요.·업체 수 +1', async () => {
    const added: Company = { ...PHARM, id: 'c-new', category: 'repair', name: '예시방역', phone: '', work: '', memo: '' }
    vi.mocked(addCompany).mockResolvedValue(added)
    await open()
    fireEvent.click(screen.getByRole('button', { name: '수리·관리 3' }))
    fireEvent.click(screen.getByRole('button', { name: '업체 더하기' }))
    expect(within(panel()).getByRole('heading', { name: '업체 더하기' })).toBeTruthy()
    expect(within(panel()).getByRole('button', { name: '수리·관리' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(panel()).getByLabelText(/^업체 이름/), { target: { value: ' 예시방역 ' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(addCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, {
      category: 'repair',
      name: '예시방역',
      phone: '',
      work: '',
      address: '',
      homepage: '',
      bizNo: '',
      account: '',
      siteId: '',
      sitePw: '',
      memo: '',
    })
    expect(detailTitle()).toBe('예시방역')
    expect(notice()).toBe('저장했어요.')
    expect(screen.getByText('업체 9곳')).toBeTruthy()
    expect(row('예시방역').getAttribute('aria-current')).toBe('true')
  })

  it('AC-6505.4: 손에 든 주소록에 같은 이름이 있으면 보내지 않고, DB가 겹침(duplicate)이라 해도 "같은 이름의 업체가 이미 있어요."이고 판은 그대로다', async () => {
    vi.mocked(addCompany).mockResolvedValue('duplicate')
    await open()
    fireEvent.click(screen.getByRole('button', { name: '업체 더하기' }))
    const name = within(panel()).getByLabelText(/^업체 이름/)
    fireEvent.change(name, { target: { value: '예시약품' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    expect(within(panel()).getByText('같은 이름의 업체가 이미 있어요.')).toBeTruthy()
    expect(addCompany).not.toHaveBeenCalled()
    fireEvent.change(name, { target: { value: '예시다른곳' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    expect(await within(panel()).findByText('같은 이름의 업체가 이미 있어요.')).toBeTruthy()
    expect(addCompany).toHaveBeenCalledTimes(1)
    expect(screen.getByText('업체 8곳')).toBeTruthy()
  })

  it('AC-6505.4: 저장이 실패하면 판 바닥에 E-CONTACTS-SAVE-FAILED이고 적은 값은 그대로다', async () => {
    vi.mocked(addCompany).mockRejectedValue(new ContactsStorageError('offline'))
    await open()
    fireEvent.click(screen.getByRole('button', { name: '업체 더하기' }))
    fireEvent.change(within(panel()).getByLabelText(/^업체 이름/), { target: { value: '예시방역' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    const card = await within(panel()).findByRole('alert')
    expect(card.textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect((within(panel()).getByLabelText(/^업체 이름/) as HTMLInputElement).value).toBe('예시방역')
  })

  it('AC-6505.4: 자세히 [고치기] → "업체 고치기" 판, [저장] → updateCompany(client, id, 칸) → 자세히가 고친 값이다', async () => {
    vi.mocked(updateCompany).mockImplementation(async (_client, id, fields) => ({ ...fields, id }))
    await open({ initialCompanyId: PHARM.id })
    fireEvent.click(screen.getByRole('button', { name: '예시약품 고치기' }))
    expect(within(panel()).getByRole('heading', { name: '업체 고치기' })).toBeTruthy()
    fireEvent.change(within(panel()).getByLabelText('대표 전화'), { target: { value: '02-111-1111' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(updateCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, PHARM.id, expect.objectContaining({ name: '예시약품', phone: '02-111-1111', category: 'supplier' }))
    expect(screen.getByText('대표 전화').parentElement!.textContent).toContain('02-111-1111')
    expect(within(row('예시약품')).getByText('02-111-1111')).toBeTruthy()
  })
})

describe('AC-6505.5: 담당자·장비·수리 기록 그 자리 칸', () => {
  it('AC-6505.5: [+ 담당자] → 이름 적고 [저장] → addPerson(client, 업체 id, 칸) → 그 줄이 바로 보이고 저장했어요.', async () => {
    const added: Person = { id: 'p9', companyId: PHARM.id, name: '정예시', mobile: '010-0000-0099', role: '' }
    vi.mocked(addPerson).mockResolvedValue(added)
    await open({ initialCompanyId: PHARM.id })
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '정예시' } })
    fireEvent.change(within(form).getByLabelText('휴대폰'), { target: { value: '010-0000-0099' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(addPerson).toHaveBeenCalledExactlyOnceWith(CLIENT, PHARM.id, { name: '정예시', mobile: '010-0000-0099', role: '' })
    expect(within(screen.getByRole('region', { name: '담당자' })).getByText('정예시')).toBeTruthy()
    expect(screen.getByRole('region', { name: '담당자' }).querySelector('h3')!.textContent).toBe('담당자 2')
    expect(notice()).toBe('저장했어요.')
  })

  it('AC-6505.5: DB가 담당자 이름 겹침(duplicate)이면 "같은 이름의 담당자가 이미 있어요.", 실패면 E-CONTACTS-SAVE-FAILED(적은 값 그대로)', async () => {
    vi.mocked(addPerson).mockResolvedValueOnce('duplicate').mockRejectedValueOnce(new ContactsStorageError('failed'))
    await open({ initialCompanyId: PHARM.id })
    fireEvent.click(screen.getByRole('button', { name: '담당자 더하기' }))
    const form = screen.getByRole('form', { name: '담당자 더하기' })
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '정예시' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect(await within(form).findByText('같은 이름의 담당자가 이미 있어요.')).toBeTruthy()
    fireEvent.change(within(form).getByLabelText(/^이름/), { target: { value: '정예시2' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    expect((await within(form).findByRole('alert')).textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect((within(form).getByLabelText(/^이름/) as HTMLInputElement).value).toBe('정예시2')
  })

  it('AC-6505.5: [+ 장비] → 날짜를 비운 채 [저장] → addEquipment(client, 업체 id, 빈 날짜 null) → 장비 줄이 보인다', async () => {
    const added: Equipment = { id: 'e9', companyId: PHARM.id, name: '냉장 보관함', serial: '', boughtOn: null, warrantyUntil: null }
    vi.mocked(addEquipment).mockResolvedValue(added)
    await open({ initialCompanyId: PHARM.id })
    fireEvent.click(screen.getByRole('button', { name: '장비 더하기' }))
    const form = screen.getByRole('form', { name: '장비 더하기' })
    fireEvent.change(within(form).getByLabelText(/^장비 이름/), { target: { value: '냉장 보관함' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(addEquipment).toHaveBeenCalledExactlyOnceWith(CLIENT, PHARM.id, { name: '냉장 보관함', serial: '', boughtOn: null, warrantyUntil: null })
    expect(screen.getByRole('article', { name: '냉장 보관함' })).toBeTruthy()
  })

  it('AC-6505.5: [+ 수리 기록] → 날짜 기본값은 오늘(한국 날짜), [저장] → addRepair(client, 장비 id, 칸) → 수리 기록 줄이 맨 위에 보인다', async () => {
    const added: Repair = { id: 'r9', equipmentId: SHOCK.id, day: '2026-11-21', content: '헤드 점검', cost: 30000 }
    vi.mocked(addRepair).mockResolvedValue(added)
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 수리 기록 더하기' }))
    const form = screen.getByRole('form', { name: '수리 기록 더하기' })
    expect((within(form).getByLabelText(/^날짜/) as HTMLInputElement).value).toBe('2026-11-21')
    fireEvent.change(within(form).getByLabelText(/^내용/), { target: { value: '헤드 점검' } })
    fireEvent.change(within(form).getByLabelText('비용'), { target: { value: '30000' } })
    fireEvent.click(within(form).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(addRepair).toHaveBeenCalledExactlyOnceWith(CLIENT, SHOCK.id, { day: '2026-11-21', content: '헤드 점검', cost: 30000 })
    const list = screen.getByRole('list', { name: '충격파 기계 수리 기록' })
    expect(within(list).getAllByRole('listitem')[0]!.textContent).toContain('헤드 점검30,000원')
  })
})

describe('AC-6505.7: 지우기', () => {
  it('AC-6505.7: 업체 [지우기] → 확인 창 → [지우기]를 누를 때만 deleteCompany → 목록에서 빠지고 오른쪽은 빈 자리·알림·업체 수 -1', async () => {
    vi.mocked(deleteCompany).mockResolvedValue(undefined)
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    const dialog = screen.getByRole('alertdialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('예시메디칼을 지울까요?')
    expect(deleteCompany).not.toHaveBeenCalled()
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(deleteCompany).toHaveBeenCalledExactlyOnceWith(CLIENT, MEDICAL.id)
    expect(listBox().querySelector('[data-company="예시메디칼"]')).toBeNull()
    expect(screen.getByText('업체를 골라 주세요')).toBeTruthy()
    expect(screen.getByText('업체 7곳')).toBeTruthy()
    expect(notice()).toBe('예시메디칼을 지웠어요.')
    // 딸린 장비도 손에 든 주소록에서 빠졌다: 장비 이름으로 찾아도 없다
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '초음파' } })
    expect(listBox().querySelector('[data-company]')).toBeNull()
  })

  it('AC-6505.7: 장비 [지우기] → 확인 창 → deleteEquipment → 그 장비와 수리 기록이 빠지고 "{장비 이름}을 지웠어요."', async () => {
    vi.mocked(deleteEquipment).mockResolvedValue(undefined)
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '충격파 기계 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '장비 고치기' })).getByRole('button', { name: '지우기' }))
    const dialog = screen.getByRole('alertdialog')
    expect(dialog.textContent).toContain('수리 기록 3줄도 함께 지워져요.')
    fireEvent.click(within(dialog).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull())
    expect(deleteEquipment).toHaveBeenCalledExactlyOnceWith(CLIENT, SHOCK.id)
    expect(screen.queryByRole('article', { name: '충격파 기계' })).toBeNull()
    expect(screen.getByRole('region', { name: '장비' }).querySelector('h3')!.textContent).toBe('장비 1')
    expect(notice()).toBe('충격파 기계를 지웠어요.')
    expect(within(row('예시메디칼')).queryByText(/무상 수리/)).toBeNull()
  })

  it('AC-6505.7: 담당자는 묻지 않고 지운 뒤 "담당자를 지웠어요." — 그 줄이 빠진다', async () => {
    vi.mocked(deletePerson).mockResolvedValue(undefined)
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '김예시 고치기' }))
    fireEvent.click(within(screen.getByRole('form', { name: '담당자 고치기' })).getByRole('button', { name: '지우기' }))
    await waitFor(() => expect(screen.queryByRole('form')).toBeNull())
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(deletePerson).toHaveBeenCalledExactlyOnceWith(CLIENT, 'p1')
    expect(within(screen.getByRole('region', { name: '담당자' })).queryByText('김예시')).toBeNull()
    expect(notice()).toBe('담당자를 지웠어요.')
  })

  it('AC-6505.7: 업체 지우기가 실패하면 확인 창 안에 E-CONTACTS-SAVE-FAILED이고 목록은 그대로다', async () => {
    vi.mocked(deleteCompany).mockRejectedValue(new ContactsStorageError('offline'))
    await open({ initialCompanyId: MEDICAL.id })
    fireEvent.click(screen.getByRole('button', { name: '예시메디칼 지우기' }))
    fireEvent.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: '지우기' }))
    expect((await within(screen.getByRole('alertdialog')).findByRole('alert')).textContent).toContain('E-CONTACTS-SAVE-FAILED')
    expect(screen.getByText('업체 8곳')).toBeTruthy()
    expect(detailTitle()).toBe('예시메디칼')
  })
})

describe('AC-6505.8: 빈 주소록', () => {
  const EMPTY: ContactBook = { companies: [], people: [], equipment: [], repairs: [] }

  it('AC-6505.8: 업체가 0곳이면 빈 주소록(단추 셋 [양식 받기][엑셀 올리기][업체 더하기])만 있고 도구 줄 단추·찾기·칩·업체 수가 없다', async () => {
    vi.mocked(loadContacts).mockResolvedValue(EMPTY)
    render(<ContactsScreen />)
    const empty = await screen.findByRole('region', { name: '빈 주소록' })
    expect(within(empty).getByRole('heading', { name: '주소록이 비어 있어요' })).toBeTruthy()
    expect(within(empty).getAllByRole('button').map((b) => b.textContent)).toEqual(['엑셀 올리기', '업체 더하기'])
    const actions = within(empty).getByRole('link', { name: '양식 받기' }).parentElement!
    expect(Array.from(actions.children).filter((el) => el.tagName !== 'INPUT').map((el) => el.textContent)).toEqual(['양식 받기', '엑셀 올리기', '업체 더하기'])
    expect(screen.getAllByRole('button').every((b) => empty.contains(b))).toBe(true)
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(screen.queryByRole('group', { name: '분류' })).toBeNull()
    expect(screen.queryByText(/^업체 \d+곳$/)).toBeNull()
    expect(h1s()).toEqual(['주소록'])
  })

  it('AC-6505.8·AC-6505.4: 빈 주소록에서 [업체 더하기]로 저장하면 목록 화면이 되고 그 업체가 골라진다(분류 기본 거래처)', async () => {
    vi.mocked(loadContacts).mockResolvedValue(EMPTY)
    vi.mocked(addCompany).mockImplementation(async (_client, fields) => ({ ...fields, id: 'c-first' }))
    render(<ContactsScreen />)
    fireEvent.click(within(await screen.findByRole('region', { name: '빈 주소록' })).getByRole('button', { name: '업체 더하기' }))
    expect(within(panel()).getByRole('button', { name: '거래처' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.change(within(panel()).getByLabelText(/^업체 이름/), { target: { value: '예시첫업체' } })
    fireEvent.click(within(panel()).getByRole('button', { name: '저장' }))
    await waitFor(() => expect(detailTitle()).toBe('예시첫업체'))
    expect(screen.queryByRole('region', { name: '빈 주소록' })).toBeNull()
    expect(screen.getByText('업체 1곳')).toBeTruthy()
  })
})

describe('AC-6506.1·AC-6506.2: 양식 받기·못 쓰는 파일', () => {
  it('AC-6506.1: [양식 받기]는 정적 양식 링크이고 누르면 "주소록-양식.xlsx를 받았어요." 알림, 서버·fetch를 부르지 않는다', async () => {
    await open()
    const link = screen.getByRole('link', { name: '양식 받기' })
    expect(link.getAttribute('href')).toBe('/contacts/contacts-template.xlsx')
    expect(link.getAttribute('download')).toBe('주소록-양식.xlsx')
    fireEvent.click(link)
    expect(notice()).toBe('주소록-양식.xlsx를 받았어요.')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-6506.2: 못 쓰는 파일이면 확인 창(제목 = 그 까닭, 파일 이름)이고 [닫기]로 목록 그대로 돌아온다. 그동안 저장 함수를 부르지 않는다', async () => {
    vi.mocked(readUpload).mockResolvedValue('form')
    await open()
    pickFile('거래처 목록.xlsx')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('주소록 양식이 아니에요')
    expect(dialog.textContent).toContain('거래처 목록.xlsx')
    fireEvent.click(within(dialog).getByRole('button', { name: '닫기' }))
    expect(screen.queryByRole('alertdialog')).toBeNull()
    expect(h1s()).toEqual(['주소록'])
    expect(importContacts).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-6506.2: 창의 [다른 파일 고르기]로 맞는 파일을 고르면 창이 닫히고 미리 보기가 열린다', async () => {
    vi.mocked(readUpload).mockResolvedValueOnce('empty').mockResolvedValueOnce(ROWS)
    await open()
    pickFile('빈 파일.xlsx')
    const dialog = await screen.findByRole('alertdialog')
    expect(within(dialog).getByRole('heading').textContent).toBe('엑셀에 적힌 업체가 없어요')
    pickFile('주소록-양식.xlsx', dialog)
    expect(await screen.findByRole('heading', { level: 1, name: '엑셀 미리 보기' })).toBeTruthy()
    expect(screen.queryByRole('alertdialog')).toBeNull()
  })
})

describe('AC-6506.4: 엑셀 미리 보기 → [넣기]', () => {
  const PLAN = buildImportPlan(ROWS, BOOK)

  async function preview() {
    vi.mocked(readUpload).mockResolvedValue(ROWS)
    await open({ initialCompanyId: MEDICAL.id })
    pickFile('주소록-양식.xlsx')
    await screen.findByRole('heading', { level: 1, name: '엑셀 미리 보기' })
  }
  const importButton = () => screen.getAllByRole('button', { name: '넣기' })[0] as HTMLButtonElement

  it('AC-6506.4: 미리 보기 동안은 주소록 머리 줄·찾기·목록·자세히 대신 미리 보기 한 화면이고 [그만두기]면 목록으로 돌아간다(아무것도 보내지 않음)', async () => {
    await preview()
    expect(h1s()).toEqual(['엑셀 미리 보기'])
    expect(screen.queryByRole('searchbox')).toBeNull()
    expect(document.querySelector('[data-contacts-list]')).toBeNull()
    expect(detailTitle()).not.toBe('예시메디칼')
    fireEvent.click(screen.getAllByRole('button', { name: '그만두기' })[0]!)
    expect(h1s()).toEqual(['주소록'])
    expect(detailTitle()).toBe('예시메디칼')
    expect(importContacts).not.toHaveBeenCalled()
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('AC-6506.4: [넣기] → importContacts(client, 계획 몸통) 한 번(넣는 동안 [넣기]·[그만두기] 꺼짐) → 다시 읽어 목록으로, 목록 위 초록 줄은 [닫기]까지 남는다', async () => {
    await preview()
    const sending = later<void>()
    vi.mocked(importContacts).mockReturnValue(sending.promise)
    const after: ContactBook = { ...BOOK, companies: [...BOOK.companies, { ...PHARM, id: 'c-new', category: 'repair', name: '예시방역' }] }
    vi.mocked(loadContacts).mockResolvedValue(after)
    fireEvent.click(importButton())
    expect(importContacts).toHaveBeenCalledExactlyOnceWith(CLIENT, PLAN.payload)
    for (const b of [...screen.getAllByRole('button', { name: '넣기' }), ...screen.getAllByRole('button', { name: '그만두기' })]) expect((b as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(importButton())
    expect(importContacts).toHaveBeenCalledTimes(1)
    await act(async () => sending.resolve())
    await screen.findByRole('searchbox')
    expect(loadContacts).toHaveBeenCalledTimes(2)
    expect(h1s()).toEqual(['주소록'])
    expect(screen.getByText('업체 9곳')).toBeTruthy()
    const done = screen.getByText('엑셀에서 넣었어요.').closest('[role="status"]') as HTMLElement
    expect(done.textContent).toBe('엑셀에서 넣었어요. 새로 1곳 · 바뀜 1곳. 넣지 않은 줄 1개는 엑셀에서 고쳐 다시 올리면 돼요.닫기')
    // 목록 위(찾기 줄 앞)에 있다
    expect(done.compareDocumentPosition(screen.getByRole('searchbox')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    // 다른 일을 해도 남는다
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: '예시' } })
    fireEvent.click(row('예시약품'))
    expect(screen.getByText('엑셀에서 넣었어요.')).toBeTruthy()
    fireEvent.click(within(done).getByRole('button', { name: '닫기' }))
    expect(screen.queryByText('엑셀에서 넣었어요.')).toBeNull()
  })

  it('AC-6506.4: [넣기]가 실패하면 E-CONTACTS-IMPORT-FAILED와 미리 보기 그대로이고 다시 [넣기]를 누를 수 있다(다시 읽지 않음)', async () => {
    await preview()
    vi.mocked(importContacts).mockRejectedValueOnce(new ContactsStorageError('offline')).mockResolvedValueOnce(undefined)
    fireEvent.click(importButton())
    const card = await screen.findByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-CONTACTS-IMPORT-FAILED').what)
    expect(h1s()).toEqual(['엑셀 미리 보기'])
    expect(loadContacts).toHaveBeenCalledTimes(1)
    expect(importButton().disabled).toBe(false)
    fireEvent.click(importButton())
    await screen.findByRole('searchbox')
    expect(importContacts).toHaveBeenCalledTimes(2)
    expect(screen.getByText('엑셀에서 넣었어요.')).toBeTruthy()
  })

  it('AC-6506.4: 넣은 뒤 줄 글 — 넣지 않은 줄이 0이면 뒤 문장이 없다', async () => {
    const clean: SheetRows = { contacts: ROWS.contacts.slice(0, 2), equipment: [] }
    vi.mocked(readUpload).mockResolvedValue(clean)
    vi.mocked(importContacts).mockResolvedValue(undefined)
    await open()
    pickFile('주소록-양식.xlsx')
    await screen.findByRole('heading', { level: 1, name: '엑셀 미리 보기' })
    fireEvent.click(importButton())
    const done = (await screen.findByText('엑셀에서 넣었어요.')).closest('[role="status"]') as HTMLElement
    expect(done.textContent).toBe('엑셀에서 넣었어요. 새로 1곳 · 바뀜 1곳.닫기')
  })
})

describe('AC-6505.1: 화면 소스 울타리', () => {
  it('AC-6505.1: 화면은 저장 함수(lib/storage/contacts)·supabaseBrowser로만 서버에 닿고 fetch·브라우저 저장소·console을 쓰지 않는다', () => {
    const code = ['ContactsScreen.tsx', 'useContacts.ts']
      .map((name) => readFileSync(join(process.cwd(), 'src/components/contacts', name), 'utf8'))
      .join('\n')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
    expect(code).not.toMatch(/\bfetch\s*\(|XMLHttpRequest|localStorage|sessionStorage|indexedDB|console\./)
    expect(code).not.toMatch(/from '@supabase\//)
    expect(code).toMatch(/from '@\/lib\/storage\/contacts'/)
    expect(code).toMatch(/from '@\/lib\/supabase\/browser'/)
    expect(PHYSIO.name).toBe('예시물리치료기') // 시험 자료가 시안 자료다
  })
})
