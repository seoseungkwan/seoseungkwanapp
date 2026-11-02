// @vitest-environment jsdom
import { cleanup, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ds } from '@/components/ui/classes'
import type { ClaimVisitView, DxRow, Finding } from '@/types/precheck'
import { FindingRows } from './FindingRows'
import { GRADE_LABEL, gradeChip, topGrade } from './grade'
import { VisitDetail } from './VisitDetail'
import { VisitRows } from './VisitRows'

// 환자 줄 화면(components/claim/rows, AC-013.3). props로만 받아 그린다. 이름·차트번호는 모두 지어낸 것이다

afterEach(cleanup)

const finding = (over: Partial<Finding> = {}): Finding => ({
  visitKey: 'v1',
  ruleId: 'IJ-05',
  grade: '확인필요',
  message: '주사 간격이 짧아요.',
  detail: 'KK090 + A15',
  basis: [
    { doc: '주사 고시', number: '고시 제2026-1호', effective: '2026-08-31', url: 'https://example.invalid/gosi' },
    { doc: '심사 기준 문서', number: '심사 기준' },
  ],
  ...over,
})
const TITLES = new Map([
  ['IJ-05', '관절 주사 간격'],
  ['PT-01', '물리치료 3가지'],
  ['ETC-1', '기타 안내'],
])
const row = (over: Partial<DxRow>): DxRow => ({ dx: 'M17', nm: '무릎 관절증', src: ['gosi'], ex: false, basis: '', t: null, pos: 0, ...over })

const visit = (over: Partial<ClaimVisitView> = {}): ClaimVisitView => ({
  key: 'v1',
  chart: '00012',
  date: '2026-10-28',
  name: '가상환자A',
  findings: [finding(), finding({ ruleId: 'PT-01', grade: '알림', message: '부위를 적어 주세요.', detail: '', basis: [] }), finding({ ruleId: 'ETC-1', grade: '참고', message: '안내예요.', detail: '', basis: [] })],
  skippedNoHistory: 0,
  skippedNoDx: 0,
  checked: 3,
  memo: null,
  rx: ['관절 주사', '체외충격파'],
  dxNow: [
    { c: 'M751', n: '회전근개 증후군', m: true, s: '', d: '', t: '' },
    { c: 'M545', n: '허리 통증', m: false, s: '', d: '', t: '' },
  ],
  dx: {
    visitKey: 'v1',
    missingDx: false,
    needsCheck: true,
    issues: [{ code: 'KK090', name: '관절 주사', gosi: true, record: false, rec: [row({}), row({ dx: 'M19', nm: '관절증' })] }],
    recommendations: [
      { code: 'KK090', name: '관절 주사', visits: 10, list: [row({}), row({ dx: 'M19', nm: '관절증' })] },
      { code: 'MM010', name: '체외충격파', visits: 5, list: [row({ dx: 'M751', nm: '회전근개 증후군' })] },
      { code: 'MM020', name: '온열 치료', visits: 5, list: [row({ dx: 'M17', nm: '무릎 관절증' })] },
    ],
  },
  ...over,
})

describe('AC-013.3 grade: 등급은 색만이 아니라 글자로도 구분한다', () => {
  it('AC-013.3: 글자·칩 모양', () => {
    expect(GRADE_LABEL).toEqual({ 확인필요: '확인 필요', 알림: '알림', 참고: '참고' })
    expect(gradeChip('확인필요')).toBe(ds.chip.negative)
    expect(gradeChip('알림')).toBe(ds.chip.warning)
    expect(gradeChip('참고')).toBe(ds.chip.neutral)
  })

  it('AC-013.3: 진료의 가장 높은 등급', () => {
    expect(topGrade([finding({ grade: '참고' }), finding({ grade: '알림' })])).toBe('알림')
    expect(topGrade([finding({ grade: '참고' }), finding({ grade: '확인필요' })])).toBe('확인필요')
    expect(topGrade([])).toBeNull()
  })
})

describe('AC-013.3 FindingRows: 등급 칩·규칙 제목·내용·고시 근거', () => {
  it('AC-013.3: 줄마다 등급 글자·규칙 제목·내용·세부·근거가 보인다', () => {
    render(<FindingRows findings={visit().findings} titles={TITLES} />)
    const items = screen.getAllByRole('listitem')
    expect(items).toHaveLength(3)
    const first = within(items[0])
    expect(first.getByText('확인 필요').getAttribute('class')).toContain(ds.chip.negative)
    expect(first.getByText('관절 주사 간격')).toBeTruthy()
    expect(first.getByText('주사 간격이 짧아요.')).toBeTruthy()
    expect(first.getByText('KK090 + A15')).toBeTruthy()
    expect(items[0].textContent).toContain('근거: 고시 제2026-1호 외 1건')
    expect(within(items[1]).getByText('알림').getAttribute('class')).toContain(ds.chip.warning)
    expect(within(items[2]).getByText('참고').getAttribute('class')).toContain(ds.chip.neutral)
  })

  it('화면 확인: 글자 크기 클래스가 겹치지 않는다(text-body와 text-caption을 함께 두면 어느 쪽이 이길지 모른다)', () => {
    render(<FindingRows findings={[finding()]} titles={TITLES} />)
    const classes = (screen.getByRole('button', { name: '근거 보기' }).getAttribute('class') ?? '').split(/\s+/)
    expect(classes).toContain('text-caption')
    expect(classes).not.toContain('text-body')
  })

  it('화면 확인: 같은 규칙이 같은 글로 두 번 걸려도 두 줄이 다 보인다', () => {
    render(<FindingRows findings={[finding(), finding()]} titles={TITLES} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(2)
  })

  it('AC-013.3: 제목을 모르면 규칙 번호를 보인다', () => {
    render(<FindingRows findings={[finding({ ruleId: 'ZZ-99' })]} titles={TITLES} />)
    expect(screen.getByText('ZZ-99')).toBeTruthy()
  })

  it('AC-013.3: [근거 보기]를 누르면 근거 전체(문서·번호·시행일·링크)가 열린다', async () => {
    render(<FindingRows findings={[finding()]} titles={TITLES} />)
    const toggle = screen.getByRole('button', { name: '근거 보기' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByText(/주사 고시/)).toBeNull()
    await userEvent.setup().click(toggle)
    expect(toggle.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText(/주사 고시 · 고시 제2026-1호 \(2026-08-31\)/)).toBeTruthy()
    const link = screen.getByRole('link', { name: '원문 열기' })
    expect(link.getAttribute('href')).toBe('https://example.invalid/gosi')
    expect(link.getAttribute('rel')).toBe('noreferrer noopener')
    expect(link.getAttribute('target')).toBe('_blank')
    expect(screen.getByText(/심사 기준 문서 · 심사 기준/)).toBeTruthy()
  })

  it('AC-013.3: 근거가 없는 규칙은 근거 줄이 없다', () => {
    render(<FindingRows findings={[finding({ basis: [] })]} titles={TITLES} />)
    expect(screen.queryByRole('button', { name: '근거 보기' })).toBeNull()
    expect(screen.getByRole('listitem').textContent).not.toContain('근거:')
  })

  it('보안: http·https가 아닌 링크는 걸지 않는다', async () => {
    render(<FindingRows findings={[finding({ basis: [{ doc: '문서', number: '번호', url: 'javascript:alert(1)' }] })]} titles={TITLES} />)
    await userEvent.setup().click(screen.getByRole('button', { name: '근거 보기' }))
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByText(/문서 · 번호/)).toBeTruthy()
  })
})

describe('AC-013.3 VisitRows: 환자 목록 줄', () => {
  const list = (visits: ClaimVisitView[], selected: string | null, onSelect = vi.fn()) => (
    <table>
      <tbody>
        <VisitRows visits={visits} selected={selected} onSelect={onSelect} />
      </tbody>
    </table>
  )

  it('AC-013.3: 진료일·차트번호·이름·등급별 수·상병 없음 수를 보인다', () => {
    render(list([visit()], 'v1'))
    const cells = within(screen.getAllByRole('row')[0]).getAllByRole('cell')
    expect(cells[0].textContent).toBe('10/28 (수)')
    expect(cells[1].textContent).toBe('00012')
    expect(cells[2].textContent).toBe('가상환자A')
    expect(cells[3].textContent).toContain('확인 필요 1')
    expect(cells[3].textContent).toContain('알림 1')
    expect(cells[3].textContent).toContain('참고 1')
    expect(cells[4].textContent).toBe('상병 없음 1')
  })

  it('AC-013.3: 상병 경고가 없으면 줄표, 상병이 아예 없으면 상병 없음이다', () => {
    const noIssue = { ...visit().dx, issues: [] }
    render(list([visit({ dx: noIssue }), visit({ key: 'v2', dx: { ...noIssue, missingDx: true } })], null))
    const rows = screen.getAllByRole('row')
    expect(within(rows[0]).getAllByRole('cell')[4].textContent).toBe('—')
    expect(within(rows[1]).getAllByRole('cell')[4].textContent).toBe('상병 없음')
  })

  it('AC-013.3: 이름을 누르면 그 환자를 고른다. 고른 줄은 aria-pressed다', async () => {
    const onSelect = vi.fn()
    render(list([visit(), visit({ key: 'v2', name: '가상환자B' })], 'v1', onSelect))
    expect(screen.getByRole('button', { name: '가상환자A' }).getAttribute('aria-pressed')).toBe('true')
    const other = screen.getByRole('button', { name: '가상환자B' })
    expect(other.getAttribute('aria-pressed')).toBe('false')
    await userEvent.setup().click(other)
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('v2')
  })

  it('AC-013.3: 줄 어디를 눌러도 고른다', async () => {
    const onSelect = vi.fn()
    render(list([visit()], null, onSelect))
    await userEvent.setup().click(screen.getByText('00012'))
    expect(onSelect).toHaveBeenCalledExactlyOnceWith('v1')
  })
})

describe('AC-013.3 VisitDetail: 환자 자세히', () => {
  it('AC-013.3: 이름·차트번호·진료일, 처방·상병, 점검 경고 수가 보인다', () => {
    render(<VisitDetail visit={visit()} titles={TITLES} hasDx />)
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('가상환자A 00012 · 10/28 (수) 진료')
    const kv = screen.getByRole('definition', { name: '처방' })
    expect(kv.textContent).toBe('관절 주사 · 체외충격파')
    expect(screen.getByRole('definition', { name: '상병' }).textContent).toBe('주상병 M751 회전근개 증후군 · 부상병 M545 허리 통증')
    expect(screen.getByRole('heading', { level: 3, name: '점검 경고 3개' })).toBeTruthy()
  })

  it('AC-013.3: 추천 상병 표: 맞으면 맞음, 빠졌으면 상병 없음, 판단하지 않은 처방은 줄표', () => {
    render(<VisitDetail visit={visit()} titles={TITLES} hasDx />)
    expect(screen.getByRole('heading', { level: 3, name: '추천 상병 · 상병 확인' })).toBeTruthy()
    const table = screen.getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toEqual(['처방', '필요한 상병(추천)', '지금 상병', '결과'])
    const rows = within(table).getAllByRole('row').slice(1)
    const text = (r: HTMLElement) => within(r).getAllByRole('cell').map((c) => c.textContent)
    expect(text(rows[0])).toEqual(['관절 주사', 'M17 무릎 관절증 외 1개', '없음', '상병 없음'])
    expect(text(rows[1])).toEqual(['체외충격파', 'M751 회전근개 증후군', '주상병', '맞음'])
    expect(text(rows[2])).toEqual(['온열 치료', 'M17 무릎 관절증', '—', '—'])
    expect(within(rows[0]).getByText('상병 없음').getAttribute('class')).toContain(ds.chip.negative)
    expect(within(rows[1]).getByText('맞음').getAttribute('class')).toContain(ds.chip.positive)
    expect(screen.getByText('추천 상병은 고시 기준과 우리 병원 12개월 기록으로 골라요. 상병은 자동으로 넣지 않아요. 비트에서 직접 고치세요.')).toBeTruthy()
  })

  it('화면 확인: 긴 처방 이름은 줄을 바꿔 결과 칸이 칸 밖으로 밀리지 않는다', () => {
    render(<VisitDetail visit={visit()} titles={TITLES} hasDx />)
    const table = screen.getByRole('table')
    const [name, , , result] = within(within(table).getAllByRole('row')[1]).getAllByRole('cell')
    expect(name.getAttribute('class')).toContain('break-all')
    expect(name.getAttribute('class')).not.toContain('whitespace-nowrap')
    expect(result.getAttribute('class')).toContain('whitespace-nowrap')
  })

  it('AC-013.3: 추천이 없는 처방의 상병 경고도 표에 나온다', () => {
    const dx = { visitKey: 'v1', missingDx: false, needsCheck: true, issues: [{ code: 'KK090', name: '관절 주사', gosi: true, record: false, rec: [] }], recommendations: [] }
    render(<VisitDetail visit={visit({ dx })} titles={TITLES} hasDx />)
    const rows = within(screen.getByRole('table')).getAllByRole('row').slice(1)
    expect(within(rows[0]).getAllByRole('cell').map((c) => c.textContent)).toEqual(['관절 주사', '—', '없음', '상병 없음'])
  })

  it('AC-013.3: 고시 없이 평소 기록과 다른 경고는 그렇게 알린다', () => {
    const dx = { visitKey: 'v1', missingDx: false, needsCheck: true, issues: [{ code: 'KK090', name: '관절 주사', gosi: false, record: true, rec: [] }], recommendations: [] }
    render(<VisitDetail visit={visit({ dx })} titles={TITLES} hasDx />)
    expect(screen.getByText('평소 기록과 달라요')).toBeTruthy()
  })

  it('AC-013.3: 추천도 경고도 없으면 "이 환자는 처방과 상병이 맞아요."', () => {
    const dx = { visitKey: 'v1', missingDx: false, needsCheck: false, issues: [], recommendations: [] }
    render(<VisitDetail visit={visit({ dx })} titles={TITLES} hasDx />)
    expect(screen.getByText('이 환자는 처방과 상병이 맞아요.')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
  })

  it('AC-013.3: 진료에 상병이 아예 없으면 경고가 먼저 보이고, 맞다고 하지 않는다', () => {
    const dx = { visitKey: 'v1', missingDx: true, needsCheck: true, issues: [], recommendations: [] }
    render(<VisitDetail visit={visit({ dx, dxNow: [] })} titles={TITLES} hasDx />)
    expect(screen.getByText('이 진료에 상병이 없어요.')).toBeTruthy()
    expect(screen.queryByText('이 환자는 처방과 상병이 맞아요.')).toBeNull()
    expect(screen.getByRole('definition', { name: '상병' }).textContent).toBe('없음')
  })

  it('AC-013.3: 상병 자료가 아예 없는 달은 확인하지 못했다고 알리고 맞음을 보이지 않는다', () => {
    render(<VisitDetail visit={visit({ dxNow: [] })} titles={TITLES} hasDx={false} />)
    expect(screen.getByText('상병 자료가 없어 상병을 확인하지 못했어요.')).toBeTruthy()
    expect(screen.queryByText('맞음')).toBeNull()
    expect(screen.queryByText('이 환자는 처방과 상병이 맞아요.')).toBeNull()
  })

  it('AC-013.3: 규칙 경고가 없으면 없다고 알린다', () => {
    render(<VisitDetail visit={visit({ findings: [] })} titles={TITLES} hasDx />)
    expect(screen.getByRole('heading', { level: 3, name: '점검 경고 0개' })).toBeTruthy()
    expect(screen.getByText('걸린 규칙이 없어요.')).toBeTruthy()
  })

  it('TASK-18 전: 메모 패널과 나중에 확인 표시를 그리지 않는다', () => {
    render(<VisitDetail visit={visit({ memo: { visitKey: 'v1', text: '메모 초안 글', edited: false, missing: [], hasMemo: true, unfinished: false } })} titles={TITLES} hasDx />)
    expect(screen.queryByText('메모 초안')).toBeNull()
    expect(screen.queryByText('메모 초안 글')).toBeNull()
    expect(screen.queryByRole('checkbox')).toBeNull()
  })
})
