// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { RoleProvider } from '@/components/shell/role'
import { ViewingProvider } from '@/components/shell/viewing'
import { ds } from '@/components/ui/classes'
import type { UisFileResult } from '@/types/uisarang'
import { UisUpload, type UisUploadLook } from './UisUpload'
import type { UisUploadView } from './useUisUpload'

// 올리기 칸 그림(specs/uisarang-upload requirements '화면 글자' 올리기 칸 펼친 모양·접은 모양·읽는 중, 시안 ?s=dash-empty·reading·dash-data).
// 상태는 시험이 만든 값이다(흐름은 useUisUpload.test.ts). 글자는 requirements '화면 글자' 그대로 옮겼다

const TITLE = '의사랑 엑셀 올리기'
const HELP = '의사랑 통계에서 저장한 엑셀을 여기에 끌어다 놓거나 [파일 고르기]를 눌러요. 여러 개를 한 번에 넣어도 돼요.'
const FILES_CAP = '받는 파일'
const FILES = ['수입통계 › 일일수입통계', '진료통계 › 기간별처방통계', '인원통계 › 내원일별환자현황 (위쪽 표 · 아래쪽 표)']
const PERIOD = '조회일은 하루 · 한 주(월~일) · 한 달(1일~말일)만 받아요. 일일수입통계와 아래쪽 표는 하루치만 돼요.'
const ERP = 'ERP 마감일지를 채우기 전에 여기에 먼저 올려 주세요. 마감일지 도우미는 엑셀을 읽은 뒤 지워요.'
const DROP = '파일을 여기에 끌어다 놓으세요'
const DROPPING = '놓으면 이 PC 안에서 읽어요'
const PICK = '파일 고르기'
const PRIVACY = '환자 개인정보는 의원 PC 밖으로 나가지 않아요. 서버에는 숫자만 저장해요.'
const FOLDED = '엑셀을 끌어다 놓거나 [파일 고르기]를 눌러요.'
const HELP_OPEN = '도움말 보기'
const HELP_CLOSE = '도움말 접기'
const SAVING = '숫자를 저장하는 중이에요.'

const view = (over: Partial<UisUploadView> = {}): UisUploadView => ({
  phase: 'idle',
  count: 0,
  today: null,
  rows: null,
  missing: null,
  error: null,
  busy: false,
  take: vi.fn(),
  retrySave: vi.fn(),
  ...over,
})
const INCOME: UisFileResult = { status: 'read', read: { kind: 'income', span: { from: '2026-11-26', to: '2026-11-26', unit: 'day' }, row: { date: '2026-11-26' } as never } }

const draw = (look: UisUploadLook, upload: UisUploadView = view(), wrap: (node: ReactNode) => ReactNode = (node) => node, place?: 'dashboard' | 'stats') =>
  render(<>{wrap(<UisUpload look={look} upload={upload} place={place} />)}</>)
const box = () => screen.getByRole('region', { name: TITLE })
const pick = () => within(box()).getByRole('button', { name: PICK })
// [파일 고르기]를 눌러 열린 파일 고르기 창(input)을 잡는다. jsdom은 창을 띄우지 않으므로 click을 가로챈다
function openPicker(): HTMLInputElement {
  const click = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => undefined)
  fireEvent.click(pick())
  expect(click).toHaveBeenCalledTimes(1)
  const opened = click.mock.contexts[0] as HTMLInputElement
  click.mockRestore()
  expect(opened).toBeInstanceOf(HTMLInputElement)
  return opened
}
// 창에서 파일을 고른 것처럼: files를 넣고 change를 보낸다
function choose(field: HTMLInputElement, chosen: File[]) {
  Object.defineProperty(field, 'files', { value: chosen, configurable: true })
  field.dispatchEvent(new Event('change'))
}
const textOf = (el: Element | null) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim()
const visible = (text: string) => {
  const el = within(box()).queryByText(text)
  return el !== null && el.closest('[hidden]') === null
}
const expectOrder = (...els: Element[]) => {
  for (let i = 1; i < els.length; i += 1) {
    expect(els[i - 1]!.compareDocumentPosition(els[i]!) & Node.DOCUMENT_POSITION_FOLLOWING, `${i - 1}번 → ${i}번`).toBeTruthy()
  }
}
const files = (...names: string[]) => names.map((name) => new File(['가짜'], name))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('AC-8810.1: 펼친 모양(대시보드 시작 칸 · 숫자 없는 통계 탭, 시안 ?s=dash-empty)', () => {
  it('AC-8810.1: 제목 → 도움말 → 받는 파일 세 줄 → 기간 줄 → ERP 줄 → 놓는 자리([파일 고르기]) → 개인정보 줄 차례이고 글자는 화면 글자 그대로다', () => {
    draw('open')
    const region = box()
    const title = within(region).getByRole('heading', { level: 2, name: TITLE })
    const cap = within(region).getByText(FILES_CAP)
    const list = cap.nextElementSibling!
    expect(within(list as HTMLElement).getAllByRole('listitem').map(textOf)).toEqual(FILES)
    expectOrder(title, within(region).getByText(HELP), cap, within(region).getByText(PERIOD), within(region).getByText(ERP), within(region).getByText(DROP), pick(), within(region).getByText(PRIVACY))
    expect(visible(HELP) && visible(PERIOD) && visible(PRIVACY)).toBe(true)
    expect(within(region).queryByRole('button', { name: HELP_OPEN })).toBeNull()
    expect(pick().className).toContain(ds.button.primary)
    expect(pick().hasAttribute('disabled')).toBe(false)
  })

  it('AC-8810.1: ERP 줄은 노란 상자 + 알림 그림이고, 놓는 자리는 점선 상자다', () => {
    draw('open')
    const erp = within(box()).getByText(ERP).closest('p')!
    for (const name of ['bg-warning-soft', 'text-warning']) expect(erp.className).toContain(name)
    expect(erp.querySelector('svg[aria-hidden="true"]')).not.toBeNull()
    const zone = within(box()).getByText(DROP).parentElement!
    for (const name of ['border-dashed', 'border-line-strong']) expect(zone.className).toContain(name)
    expect(zone.contains(pick())).toBe(true)
  })

  it('AC-8810.1: [파일 고르기]는 누를 때 만든 파일 고르기 창(xls·xlsx·csv 여러 개)을 열고 고른 파일을 take로 넘긴다 — 칸 안에 파일 input을 두지 않는다', () => {
    const upload = view()
    draw('open', upload)
    expect(document.querySelector('input[type="file"]')).toBeNull()
    const field = openPicker()
    expect(field.type).toBe('file')
    expect(field.multiple).toBe(true)
    expect(field.accept).toBe('.xls,.xlsx,.csv')
    expect(document.querySelector('input[type="file"]')).toBeNull()
    const chosen = files('일일수입통계_1126.xls', '기간별처방통계_1126.xls')
    choose(field, chosen)
    expect(upload.take).toHaveBeenCalledTimes(1)
    expect(vi.mocked(upload.take).mock.calls[0]![0]).toEqual(chosen)
    choose(field, files('c.xls')) // 한 번 고른 창은 다시 쓰지 않는다
    expect(upload.take).toHaveBeenCalledTimes(1)
  })

  it('AC-8810.2: 창을 연 뒤 읽기가 시작됐으면 그 창에서 고른 파일은 받지 않는다', () => {
    const upload = view()
    const { rerender } = draw('open', upload)
    const field = openPicker()
    const busy = view({ phase: 'reading', count: 1, busy: true })
    rerender(<UisUpload look="open" upload={busy} />)
    choose(field, files('a.xls'))
    expect(upload.take).not.toHaveBeenCalled()
    expect(busy.take).not.toHaveBeenCalled()
  })

  it('AC-8810.1: 끌고 있는 동안 놓는 자리 글이 놓으면 이 PC 안에서 읽어요가 되고, 놓으면 그 파일을 take로 넘긴다(브라우저가 파일을 열지 않음)', () => {
    const upload = view()
    draw('open', upload)
    const region = box()
    expect(fireEvent.dragOver(region, { dataTransfer: { types: ['Files'], files: [] } })).toBe(false)
    expect(within(region).getByText(DROPPING)).toBeTruthy()
    expect(within(region).queryByText(DROP)).toBeNull()
    expect(within(region).getByText(DROPPING).parentElement!.className).toContain('border-accent')
    fireEvent.dragLeave(region, { relatedTarget: null })
    expect(within(region).getByText(DROP)).toBeTruthy()
    const dropped = files('내원일별_위_1126.xls')
    fireEvent.dragOver(region, { dataTransfer: { types: ['Files'], files: [] } })
    expect(fireEvent.drop(region, { dataTransfer: { types: ['Files'], files: dropped } })).toBe(false)
    expect(upload.take).toHaveBeenCalledTimes(1)
    expect(vi.mocked(upload.take).mock.calls[0]![0]).toEqual(dropped)
    expect(within(region).getByText(DROP)).toBeTruthy()
  })
})

describe('AC-8810.2: 읽는 중 · 저장 중 (시안 ?s=reading)', () => {
  it('AC-8810.2: 읽는 동안 파일 {n}개를 이 PC 안에서 읽는 중이에요. 줄(놓는 자리 아래)이 있고 [파일 고르기]는 눌리지 않으며 놓은 파일은 받지 않는다', () => {
    const upload = view({ phase: 'reading', count: 4, busy: true })
    draw('open', upload)
    const line = within(box()).getByRole('status')
    expect(textOf(line)).toBe('파일 4개를 이 PC 안에서 읽는 중이에요.')
    expect(line.querySelector('.bit-read-spin')).not.toBeNull()
    expectOrder(within(box()).getByText(DROP), line, within(box()).getByText(PRIVACY))
    expect(pick().hasAttribute('disabled')).toBe(true)
    fireEvent.drop(box(), { dataTransfer: { types: ['Files'], files: files('a.xls') } })
    expect(upload.take).not.toHaveBeenCalled()
  })

  it('AC-8810.2: 저장하는 동안은 숫자를 저장하는 중이에요. 줄이고 [파일 고르기]는 그대로 막혀 있다 — 접은 모양에도 같은 줄이다', () => {
    const { unmount } = draw('open', view({ phase: 'saving', busy: true }))
    expect(textOf(within(box()).getByRole('status'))).toBe(SAVING)
    expect(pick().hasAttribute('disabled')).toBe(true)
    unmount()
    draw('folded', view({ phase: 'reading', count: 2, busy: true }))
    expect(textOf(within(box()).getByRole('status'))).toBe('파일 2개를 이 PC 안에서 읽는 중이에요.')
    expect(pick().hasAttribute('disabled')).toBe(true)
  })

  it('AC-8810.2: 읽는 중이 아니면 읽는 중 줄이 없다', () => {
    draw('open')
    expect(within(box()).queryByRole('status')).toBeNull()
  })
})

describe('AC-8810.6: 접은 모양(숫자가 있는 대시보드 · 통계 탭, 시안 ?s=dash-data·stats)', () => {
  it('AC-8810.6: 한 줄 = 제목 · 엑셀을 끌어다 놓거나 [파일 고르기]를 눌러요. · [파일 고르기] · [도움말 보기], 그 아래 ERP 줄은 늘 보이고 도움말·받는 파일·기간 줄·개인정보 줄은 접혀 있다', () => {
    draw('folded')
    const region = box()
    const title = within(region).getByRole('heading', { level: 2, name: TITLE })
    const toggle = within(region).getByRole('button', { name: HELP_OPEN })
    expectOrder(title, within(region).getByText(FOLDED), pick(), toggle, within(region).getByText(ERP))
    expect(pick().className).toContain(ds.button.secondarySmall)
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(visible(ERP)).toBe(true)
    for (const text of [HELP, FILES_CAP, PERIOD, PRIVACY]) expect(visible(text), text).toBe(false)
    expect(within(region).queryByText(DROP)).toBeNull()
  })

  it('AC-8810.6: [도움말 보기]를 누르면 펼친 모양의 도움말·받는 파일·기간 줄·개인정보 줄이 열리고 단추는 [도움말 접기]가 된다', () => {
    draw('folded')
    fireEvent.click(within(box()).getByRole('button', { name: HELP_OPEN }))
    const toggle = within(box()).getByRole('button', { name: HELP_CLOSE })
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    for (const text of [HELP, FILES_CAP, PERIOD, PRIVACY]) expect(visible(text), text).toBe(true)
    expect(visible(ERP)).toBe(true)
    expectOrder(within(box()).getByText(ERP), within(box()).getByText(HELP), within(box()).getByText(PRIVACY))
    fireEvent.click(toggle)
    expect(visible(HELP)).toBe(false)
  })

  it('AC-8810.6: 칸 전체에 파일을 놓을 수 있다', () => {
    const upload = view()
    draw('folded', upload)
    const dropped = files('a.xls', 'b.xls')
    expect(fireEvent.dragOver(box(), { dataTransfer: { types: ['Files'], files: [] } })).toBe(false)
    expect(fireEvent.drop(box(), { dataTransfer: { types: ['Files'], files: dropped } })).toBe(false)
    expect(vi.mocked(upload.take).mock.calls[0]![0]).toEqual(dropped)
  })

  it('AC-8810.10: 결과는 접은 칸 안(ERP 줄 아래)에 그대로 그린다(시안 ?s=dash-ok)', () => {
    draw('folded', view({ phase: 'done', today: '2026-11-26', rows: [{ name: '일일수입통계_1126.xls', result: INCOME, status: 'saved' }], missing: { state: 'ready', items: [] } }))
    const list = within(box()).getByRole('list', { name: '방금 넣은 파일 1개' })
    expectOrder(within(box()).getByText(ERP), list, within(box()).getByText('넣은 날은 네 가지 파일이 모두 있어요.'))
  })

  it('AC-8810.1: 펼친 모양의 결과는 놓는 자리·읽는 중 줄 다음 · 개인정보 줄 앞이다(시안 ?s=dash-missing)', () => {
    draw('open', view({ phase: 'done', today: '2026-11-26', rows: [{ name: '일일수입통계_1126.xls', result: INCOME, status: 'saved' }], missing: { state: 'ready', items: [] } }))
    expectOrder(within(box()).getByText(DROP), within(box()).getByRole('list', { name: '방금 넣은 파일 1개' }), within(box()).getByText(PRIVACY))
  })
})

describe('AC-8810.7: 보는 중 · 데스크에는 칸이 없다', () => {
  it('AC-8810.7: 관리자가 다른 의원을 보는 중이면(ViewingProvider) 아무것도 그리지 않는다', () => {
    const { container } = draw('open', view(), (node) => <ViewingProvider viewing={{ hospitalId: '00000000-0000-4000-8000-000000000001', name: '가나 정형외과의원' }}>{node}</ViewingProvider>)
    expect(container.innerHTML).toBe('')
  })

  it('AC-8810.7: 데스크 계정이면(RoleProvider desk) 아무것도 그리지 않는다', () => {
    const { container } = draw('folded', view(), (node) => <RoleProvider desk>{node}</RoleProvider>)
    expect(container.innerHTML).toBe('')
  })
})

describe('모양: 놓는 곳마다 상자 · 바깥 위 여백 없음', () => {
  it('AC-8811.1·AC-8812.1: 대시보드는 canvas 상자, 통계 탭은 흰 상자 + st 선(시안 .ubox · .ubox.stbox)이고, 둘 다 바깥 위 여백이 없다(놓는 쪽 mt-4가 준다)', () => {
    const { unmount } = draw('open')
    const dash = box().className.split(/\s+/)
    expect(dash).toEqual(expect.arrayContaining(['rounded-control', 'bg-canvas']))
    expect(dash.filter((name) => /^m[ty]?-/.test(name))).toEqual([])
    unmount()
    draw('folded', view(), undefined, 'stats')
    const stats = box().className.split(/\s+/)
    expect(stats).toEqual(expect.arrayContaining(['bg-surface', 'border', 'border-st-line', 'rounded-st-sm']))
    expect(stats).not.toContain('bg-canvas')
    expect(stats.filter((name) => /^m[ty]?-/.test(name))).toEqual([])
  })
})

describe('AC-8815.3: 올리기 칸 코드의 울타리', () => {
  const DIR = join(process.cwd(), 'src/components/uisarang')
  const sources = () => readdirSync(DIR).filter((name) => /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name))
  const code = (name: string) =>
    readFileSync(join(DIR, name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/.*$/gm, '$1')
  const importsOf = (name: string) => [...code(name).matchAll(/^import\s[^'"]*?from\s+['"]([^'"]+)['"]/gm)].map((m) => m[1]!)

  it('AC-8815.3: 소스가 다섯 있다(UisUpload · UisResult · useUisUpload · spanText · texts)', () => {
    expect(sources().sort()).toEqual(['UisResult.tsx', 'UisUpload.tsx', 'spanText.ts', 'texts.ts', 'useUisUpload.ts'])
  })

  it('AC-8815.3: lib/parsers를 부르지 않고 Worker는 workers/runUisarang 하나로만 부른다', () => {
    const all = sources().flatMap((name) => importsOf(name))
    expect(all.filter((from) => from.includes('lib/parsers'))).toEqual([])
    expect(all.filter((from) => from.includes('workers'))).toEqual(['@/workers/runUisarang'])
    for (const name of sources()) expect(code(name), name).not.toMatch(/lib\/parsers|new Worker\b/)
  })

  it('AC-8815.3·AC-8810.8: 브라우저 저장소(localStorage·sessionStorage·indexedDB)·쿠키·네트워크를 쓰지 않는다', () => {
    for (const name of sources()) expect(code(name), name).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie|\bfetch\s*\(|XMLHttpRequest|console\./)
  })

  it('PC 화면만: 폰 폭 클래스(max-md: 등)를 쓰지 않는다', () => {
    for (const name of sources()) expect(code(name), name).not.toMatch(/\b(?:max-)?(?:sm|md):/)
  })
})
