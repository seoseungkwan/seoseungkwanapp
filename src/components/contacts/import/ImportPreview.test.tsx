// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import * as XLSX from 'xlsx'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { errorInfo } from '@/lib/errors'
import { buildImportPlan, type ImportPlan } from '@/lib/contacts/plan'
import { CONTACT_HEADERS, CONTACT_KEYS, EQUIPMENT_HEADERS, EQUIPMENT_KEYS, type Cell, type ContactKey, type EquipmentKey, type SheetRows } from '@/lib/contacts/sheet'
import type { Company, ContactBook } from '@/types/contacts'
import { ImportPreview } from './ImportPreview'
import { readUpload } from './readUpload'

// 엑셀 미리 보기(specs/contacts AC-6506.3, requirements.md '화면 글자' 엑셀 미리 보기, 시안 ?s=upload-preview).
// buildImportPlan(줄, 지금 주소록) 그대로 그리고, 칸 값(비밀번호·계좌·번호·주소·메모)은 보이지 않는다. [넣기] 전에는 아무것도 보내지 않는다.
// 업체·사람·번호·비밀번호는 모두 지어낸 것이다

vi.mock('@/lib/supabase/browser', () => ({ supabaseBrowser: vi.fn(() => ({})) }))

function company(over: Partial<Company> & Pick<Company, 'id' | 'name' | 'category'>): Company {
  return { phone: '', work: '', address: '', homepage: '', bizNo: '', account: '', siteId: '', sitePw: '', memo: '', ...over }
}
const BOOK: ContactBook = {
  companies: [
    company({ id: 'c1', category: 'supplier', name: '예시메디칼', phone: '02-000-0001', work: '의료기기 판매·수리', memo: '매달 말 주문', sitePw: 'Old-PW-0000' }),
    company({ id: 'c2', category: 'repair', name: '예시설비', phone: '02-000-0011', address: '서울시 예시구 예시로 1' }),
    company({ id: 'c3', category: 'supplier', name: '예시약품', phone: '02-000-0002', work: '주사제, 수액' }),
    company({ id: 'c4', category: 'other', name: '예시꽃집' }),
    company({ id: 'c5', category: 'repair', name: '예시방역' }),
  ],
  people: [{ id: 'p1', companyId: 'c1', name: '김예시', mobile: '010-0000-0001', role: '영업' }],
  equipment: [{ id: 'e1', companyId: 'c1', name: '충격파 기계', serial: 'ESW-0000-01', boughtOn: '2025-12-03', warrantyUntil: '2026-12-03' }],
  repairs: [],
}

const contact = (row: number, values: Partial<Record<ContactKey, Cell>>) => ({
  row,
  cells: Object.fromEntries(CONTACT_KEYS.map((key) => [key, values[key] ?? null])) as Record<ContactKey, Cell>,
})
const device = (row: number, values: Partial<Record<EquipmentKey, Cell>>) => ({
  row,
  cells: Object.fromEntries(EQUIPMENT_KEYS.map((key) => [key, values[key] ?? null])) as Record<EquipmentKey, Cell>,
})

// 넣지 않는 줄 셋(분류 '병원' · 업체 이름 빔 · 날짜 모양 틀림), 새로 둘, 바뀜 둘, 그대로 하나, 엑셀에 없는 업체 둘
const ROWS: SheetRows = {
  contacts: [
    contact(2, { category: '거래처', name: '예시메디칼', phone: '02-000-0101', sitePw: 'Secret-PW-9999', personName: '김예시', personMobile: '010-9999-0001' }),
    contact(3, { name: '예시메디칼', personName: '오예시', personMobile: '010-0000-0005', personRole: '소모품 배송' }),
    contact(4, { category: '수리·관리', name: '예시설비', address: '서울시 예시구 예시로 88', memo: '급한 고장은 기사에게 바로' }),
    contact(5, { category: '거래처', name: '예시약품', phone: '02-000-0002', work: '주사제, 수액' }),
    contact(6, {
      category: '수리·관리',
      name: '예시엑스레이',
      phone: '02-000-0041',
      work: '엑스레이 장비 점검·수리',
      account: '예시은행 111-222-333 (예금주)',
      siteId: 'fake-xray-id',
      personName: '문예시',
      personMobile: '010-0000-0041',
      personRole: '점검 기사',
    }),
    contact(7, { category: '기타', name: '예시노무법인', phone: '02-000-0044', work: '노무 상담·4대 보험', bizNo: '000-00-00044' }),
    contact(8, { category: '병원', name: '예시병원물품', phone: '02-000-0088' }),
    contact(9, { phone: '02-000-0099', memo: '이름 없는 줄 메모' }),
  ],
  equipment: [
    device(2, { company: '예시메디칼', name: '견인 치료기', serial: 'TR-0000-02', boughtOn: '2026-11-10', warrantyUntil: '2027-11-10' }),
    device(3, { company: '예시엑스레이', name: '엑스레이 촬영기', serial: 'XR-0000-05', boughtOn: 46027, warrantyUntil: '2028-01-15' }),
    device(4, { company: '예시설비', name: '천장형 냉난방기', boughtOn: '2025.13.01' }),
  ],
}
// 화면에 나오면 안 되는 칸 값(바뀌기 전·뒤 값 모두)
const HIDDEN = [
  'Secret-PW-9999',
  'Old-PW-0000',
  '02-000-0101',
  '02-000-0001',
  '010-9999-0001',
  '010-0000-0001',
  '010-0000-0005',
  '서울시 예시구 예시로 88',
  '서울시 예시구 예시로 1',
  '급한 고장은 기사에게 바로',
  '매달 말 주문',
  '02-000-0041',
  '예시은행 111-222-333',
  'fake-xray-id',
  '010-0000-0041',
  '02-000-0044',
  '000-00-00044',
  '02-000-0088',
  '02-000-0099',
  '이름 없는 줄 메모',
  'TR-0000-02',
  'XR-0000-05',
  '2027-11-10',
  '2028-01-15',
  'ESW-0000-01',
]

const FILE = '주소록-양식.xlsx'
const plan = (): ImportPlan => buildImportPlan(ROWS, BOOK)
const handlers = () => ({ onCancel: vi.fn(), onImport: vi.fn() })

function draw(over: { plan?: ImportPlan; saving?: boolean; failed?: boolean } = {}) {
  const h = handlers()
  const view = render(<ImportPreview plan={over.plan ?? plan()} fileName={FILE} saving={over.saving ?? false} failed={over.failed ?? false} {...h} />)
  return { ...view, ...h }
}
const text = () => document.body.textContent ?? ''
const section = (name: string) => {
  const heading = screen.getByRole('heading', { name })
  const box = heading.closest('section')
  if (!box) throw new Error(`${name} 칸이 없다`)
  return box
}

const fetchSpy = vi.fn()
beforeEach(() => {
  vi.stubGlobal('fetch', fetchSpy)
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('AC-6506.3 ImportPreview — 화면 글자 그대로', () => {
  it('AC-6506.3: h1·파일 줄·숫자 칸·규칙 글', () => {
    draw()
    expect(screen.getByRole('heading', { level: 1, name: '엑셀 미리 보기' })).toBeTruthy()
    expect(screen.getByText(FILE)).toBeTruthy()
    expect(screen.getByText('연락처 시트 8줄 · 장비 시트 3줄')).toBeTruthy()
    const sum = screen.getByRole('list', { name: '미리 보기 숫자' })
    expect([...sum.querySelectorAll('li')].map((li) => li.textContent)).toEqual(['새로2곳', '바뀜2곳', '그대로1곳', '넣지 않는 줄3줄'])
    expect(
      screen.getByText(
        '업체 이름이 같으면 고치고, 새 업체는 더해요. 엑셀에 없는 업체는 그대로 두고, 엑셀의 빈 칸은 지금 값을 지우지 않아요. 엑셀로는 아무것도 지우지 않아요. 수리 기록은 엑셀로 넣지 않아요(화면에서 장비마다 더해요).',
      ),
    ).toBeTruthy()
  })

  it('AC-6506.3: 새로 더할 업체 — 칩 새로 · 이름 · 분류 · {하는 일·품목} · 담당자 {n}명 · 장비 {n}대', () => {
    draw()
    const box = section('새로 더할 업체 2')
    const rows = within(box).getAllByRole('listitem')
    expect(rows.map((row) => row.textContent)).toEqual([
      '새로예시엑스레이수리·관리엑스레이 장비 점검·수리 · 담당자 1명 · 장비 1대',
      '새로예시노무법인기타노무 상담·4대 보험',
    ])
  })

  it('AC-6506.3: 바뀌는 업체 — 옆 글 · 칩 바뀜 · 이름 · 분류 · 바뀐 칸 이름표만(값 없음)', () => {
    draw()
    const box = section('바뀌는 업체 2')
    expect(within(box).getByText('바뀌는 칸만 보여 줘요')).toBeTruthy()
    const rows = within(box).getAllByRole('listitem')
    expect(rows).toHaveLength(2)
    expect(within(rows[0]).getByText('바뀜')).toBeTruthy()
    expect(within(rows[0]).getByText('예시메디칼')).toBeTruthy()
    expect(within(rows[0]).getByText('거래처')).toBeTruthy()
    const tags = (row: HTMLElement) => [...row.querySelectorAll('[data-tag]')].map((tag) => tag.textContent)
    expect(tags(rows[0])).toEqual(['대표 전화', '사이트 비밀번호', '담당자 1명 더함', '장비 1대 더함', "담당자 '김예시' 휴대폰"])
    expect(within(rows[1]).getByText('예시설비')).toBeTruthy()
    expect(within(rows[1]).getByText('수리·관리')).toBeTruthy()
    expect(tags(rows[1])).toEqual(['주소', '업체 메모'])
  })

  it('AC-6506.3: 넣지 않는 줄 — 옆 글 · 시트 {n}번째 줄 · 업체(· 장비) · 까닭 글', () => {
    draw()
    const box = section('넣지 않는 줄 3')
    expect(within(box).getByText('이 줄만 빼고 나머지는 넣을 수 있어요')).toBeTruthy()
    expect(within(box).getAllByRole('listitem').map((row) => row.textContent)).toEqual([
      "연락처 시트 8번째 줄예시병원물품분류 '병원'은 쓸 수 없어요. 거래처·수리·관리·기관·보험·기타 가운데 하나로 골라 주세요.",
      '연락처 시트 9번째 줄업체 이름이 비었어요.',
      "장비 시트 4번째 줄예시설비 · 천장형 냉난방기들여온 날 '2025.13.01'은 날짜 모양이 아니에요. 2026-11-21처럼 적어 주세요.",
    ])
  })

  it('AC-6506.3: 그대로인 업체는 접혀 있다가 [그대로인 업체 {n}곳 보기]로 펼치고, 엑셀에 없는 업체도 그대로 둔다고 알린다', () => {
    draw()
    const box = section('그대로인 업체 1')
    const toggle = within(box).getByRole('button', { name: '그대로인 업체 1곳 보기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(within(box).queryByText('예시약품')).toBeNull()
    fireEvent.click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(within(box).getByText('예시약품')).toBeTruthy()
    expect(within(box).getByText('엑셀에 없는 업체 2곳(예시꽃집·예시방역)도 그대로 둬요.')).toBeTruthy()
  })

  it('AC-6506.3: [그대로인 업체 {n}곳 보기] 앞 표시는 시안(details summary 표시)처럼 채운 세모 ▶이고 펼치면 아래 ▼로 돈다', () => {
    draw()
    const toggle = within(section('그대로인 업체 1')).getByRole('button', { name: '그대로인 업체 1곳 보기' })
    const marks = toggle.querySelectorAll('svg')
    expect(marks).toHaveLength(1)
    const mark = marks[0]!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
    // 채운 세모(선 그림 꺾쇠 › 가 아님): 글자색으로 채우고 선은 없다. 오른쪽을 가리킨다
    expect(mark.getAttribute('fill')).toBe('currentColor')
    expect(mark.getAttribute('stroke')).toBeNull()
    expect(mark.querySelector('path')?.getAttribute('d')).toBe('M0 0 8 4.5 0 9z')
    expect(mark.getAttribute('class')?.split(/\s+/)).not.toContain('rotate-90')
    fireEvent.click(toggle)
    expect(mark.getAttribute('class')?.split(/\s+/)).toContain('rotate-90')
  })

  it('AC-6506.3: 아래 줄 글과 위·아래 [그만두기]·[넣기]', () => {
    const { onCancel, onImport } = draw()
    expect(screen.getByText('새로 2곳을 더하고 2곳을 고쳐요. 넣지 않는 줄 3개는 빼요.')).toBeTruthy()
    const cancels = screen.getAllByRole('button', { name: '그만두기' })
    const imports = screen.getAllByRole('button', { name: '넣기' })
    expect([cancels.length, imports.length]).toEqual([2, 2])
    for (const b of [...cancels, ...imports]) expect((b as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(imports[0])
    fireEvent.click(imports[1])
    fireEvent.click(cancels[1])
    expect(onImport).toHaveBeenCalledTimes(2)
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('AC-6506.3: 칸 값(사이트 비밀번호·계좌·번호·주소·메모·일련번호·날짜)은 보이지 않는다 — 칸 이름과 까닭 글의 분류·날짜 값만', () => {
    draw()
    fireEvent.click(screen.getByRole('button', { name: '그대로인 업체 1곳 보기' }))
    for (const value of HIDDEN) expect(text(), value).not.toContain(value)
    expect(text()).toContain("'병원'")
    expect(text()).toContain("'2025.13.01'")
  })

  it('AC-6506.3: 넣을 것이 없으면(새로 0·바뀜 0) [넣기]가 꺼지고, 없는 칸·0인 넣지 않는 줄은 그리지 않는다', () => {
    const same = buildImportPlan({ contacts: [contact(2, { category: '거래처', name: '예시약품', work: '주사제, 수액' })], equipment: [] }, BOOK)
    draw({ plan: same })
    for (const b of screen.getAllByRole('button', { name: '넣기' })) expect((b as HTMLButtonElement).disabled).toBe(true)
    for (const b of screen.getAllByRole('button', { name: '그만두기' })) expect((b as HTMLButtonElement).disabled).toBe(false)
    expect(screen.queryByRole('heading', { name: /^새로 더할 업체/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^바뀌는 업체/ })).toBeNull()
    expect(screen.queryByRole('heading', { name: /^넣지 않는 줄/ })).toBeNull()
    // 아래 줄은 requirements.md '화면 글자' 엑셀 미리 보기(시안 .upbar)대로 늘 두 문장이다 — 넣지 않는 줄이 0이어도 뒤 문장을 빼지 않는다
    expect(screen.getByText('새로 0곳을 더하고 0곳을 고쳐요. 넣지 않는 줄 0개는 빼요.')).toBeTruthy()
  })

  it('AC-6506.3: 넣는 동안(saving)은 [넣기]·[그만두기]가 모두 꺼진다', () => {
    draw({ saving: true })
    for (const name of ['넣기', '그만두기']) for (const b of screen.getAllByRole('button', { name })) expect((b as HTMLButtonElement).disabled, name).toBe(true)
  })

  it('AC-6506.3: [넣기] 실패(failed)면 아래 줄 위에 E-CONTACTS-IMPORT-FAILED 오류 카드가 있다', () => {
    const { rerender } = draw()
    expect(screen.queryByRole('alert')).toBeNull()
    rerender(<ImportPreview plan={plan()} fileName={FILE} saving={false} failed {...handlers()} />)
    const card = screen.getByRole('alert')
    expect(card.textContent).toContain(errorInfo('E-CONTACTS-IMPORT-FAILED').what)
    expect(card.textContent).toContain('오류 번호 E-CONTACTS-IMPORT-FAILED')
    const bottom = screen.getByText('새로 2곳을 더하고 2곳을 고쳐요. 넣지 않는 줄 3개는 빼요.')
    expect(card.compareDocumentPosition(bottom) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    for (const b of screen.getAllByRole('button', { name: '넣기' })) expect((b as HTMLButtonElement).disabled).toBe(false)
  })
})

describe('AC-6506.3 미리 보기까지 네트워크가 없다', () => {
  it('AC-6506.3: 파일을 읽고 계획을 만들어 미리 보기를 그리고 펼치는 동안 fetch·Supabase를 부르지 않는다', async () => {
    const { supabaseBrowser } = await import('@/lib/supabase/browser')
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...CONTACT_HEADERS], ['거래처', '예시약품', '02-000-0002', '주사제, 수액'], ['기타', '예시새업체']]), '연락처')
    XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([[...EQUIPMENT_HEADERS]]), '장비')
    const file = new File([XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer], FILE)
    const rows = await readUpload(file)
    if (typeof rows === 'string') throw new Error(rows)
    draw({ plan: buildImportPlan(rows, BOOK) })
    fireEvent.click(screen.getByRole('button', { name: '그대로인 업체 1곳 보기' }))
    expect(screen.getByText('연락처 시트 2줄 · 장비 시트 0줄')).toBeTruthy()
    expect(fetchSpy).not.toHaveBeenCalled()
    expect(supabaseBrowser).not.toHaveBeenCalled()
  })
})
