// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { WhyLine } from '@/lib/precheck/memo'
import { WhyTable } from './WhyTable'

// [왜 이렇게?] 출처 표(claim-learn REQ-9306, 시안 ?s=why, notes '왜 이렇게?' 글 그대로). 줄은 props로만 받는다. 글·코드는 지어낸 것이다

afterEach(cleanup)

const LINES: WhyLine[] = [
  { line: '◈가상 진단 문장으로', source: { kind: 'field', tab: 'reason', tabLabel: '사유 문장', field: 'itv', label: '주사 간격 사유' }, codes: [], chart: '가상 허리 통증' },
  { line: '◈Rt L4,5 가상시술 시행', source: { kind: 'learn', id: 'l0000a001', name: 'LA358 · 허리' }, codes: ['LA358'], chart: '가상 MBB L4,5' },
  { line: '◈가상 관찰함', source: { kind: 'learn', id: 'l0000a001', name: 'LA358 · 허리' }, codes: ['LA358'], chart: null },
  { line: '◈가상 시술별 줄', source: { kind: 'field', tab: 'proc', tabLabel: '시술별 문구와 약', field: 'byProc.가상 시술', label: '가상 시술' }, codes: [], chart: null },
  { line: '◈경과 관찰 중', source: { kind: 'none' }, codes: [], chart: null },
]
const rows = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
const cells = (index: number) => within(rows()[index]).getAllByRole('cell')

describe('AC-9306.1 메모 줄마다 출처', () => {
  it("AC-9306.1: 머리 '이 메모가 이렇게 나온 까닭'과 줄 · 출처 표, 아래 작은 글 '출처를 누르면 그 설정으로 가요.'가 있다", () => {
    render(<WhyTable lines={LINES} />)
    const table = screen.getByRole('region', { name: '이 메모가 이렇게 나온 까닭' })
    expect(within(table).getByRole('heading', { name: '이 메모가 이렇게 나온 까닭' })).toBeTruthy()
    expect(within(table).getAllByRole('columnheader').map((cell) => cell.textContent)).toEqual(['줄', '출처'])
    expect(rows().map((item) => within(item).getAllByRole('cell')[0].textContent)).toEqual(LINES.map((item) => item.line))
    expect(within(table).getByText('출처를 누르면 그 설정으로 가요.')).toBeTruthy()
  })

  it("AC-9306.1·AC-9306.2: 학습 줄은 '학습: {이름}'이고 누르면 학습 탭의 그 학습으로 간다. 주소에 환자 값이 없다", () => {
    render(<WhyTable lines={LINES} />)
    const link = within(cells(1)[1]).getByRole('link', { name: '학습: LA358 · 허리' })
    expect(link.getAttribute('href')).toBe('/settings?ptab=learn&learn=l0000a001')
  })

  it("AC-9306.1·AC-9306.2: 병원 문구 줄은 '병원 문구 › {탭} › {칸 이름}'이고 그 탭·칸 주소로 간다", () => {
    render(<WhyTable lines={LINES} />)
    const reason = within(cells(0)[1]).getByRole('link', { name: '병원 문구 › 사유 문장 › 주사 간격 사유' })
    expect(reason.getAttribute('href')).toBe('/settings?ptab=reason&field=itv')
    const proc = within(cells(3)[1]).getByRole('link', { name: '병원 문구 › 시술별 문구와 약 › 가상 시술' })
    expect(new URL(proc.getAttribute('href')!, 'https://x.test').searchParams.get('field')).toBe('byProc.가상 시술')
    for (const link of screen.getAllByRole('link')) expect(link.getAttribute('href')).not.toMatch(/가상 (진단|관찰|허리)|L4|MBB/)
  })

  it("AC-9306.1: 덧붙임은 '처방 {코드}' · '차트: {차트 줄}'(찾은 것만)이고, 못 찾은 줄은 '출처 모름'이다", () => {
    render(<WhyTable lines={LINES} />)
    expect(cells(0)[1].textContent).toBe('병원 문구 › 사유 문장 › 주사 간격 사유차트: 가상 허리 통증')
    expect(cells(1)[1].textContent).toBe('학습: LA358 · 허리처방 LA358 · 차트: 가상 MBB L4,5')
    expect(cells(2)[1].textContent).toBe('학습: LA358 · 허리처방 LA358')
    expect(cells(4)[1].textContent).toBe('출처 모름')
    expect(within(cells(4)[1]).queryByRole('link')).toBeNull()
  })

  it('AC-9306.1: 환자 줄 화면 울타리 — 네트워크·저장소·console·supabase를 쓰지 않는다', () => {
    const text = readFileSync(join(process.cwd(), 'src/components/claim/rows/WhyTable.tsx'), 'utf-8')
    expect(text).not.toMatch(/\b(fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon|localStorage|sessionStorage|indexedDB|console|supabase)\b/)
  })
})
