import { describe, expect, it } from 'vitest'
import type { UisFileResult, UisKind, UisSpan } from '@/types/uisarang'
import { uisKindName, uisLineText, uisSpanText } from './spanText'

// 결과 줄 둘째 줄 글(specs/uisarang-upload requirements '화면 글자' 결과 · 종류 이름 · 기간 글, design.md §10-1 spanText.ts).
// 기간 글은 lib/analytics/dates만 쓰고, 오늘(한국 날짜)의 해와 다르면 앞에 {YYYY}년을 붙인다. 숫자·날짜는 지어낸 값이다

const TODAY = '2026-11-26' // 목요일(시안 오늘)

const span = (from: string, to: string, unit: UisSpan['unit']): UisSpan => ({ from, to, unit })
const readRx = (s: UisSpan): UisFileResult => ({ status: 'read', read: { kind: 'rx', span: s, payload: { v: 1, rows: [], total: null } } })
const refused = (kind: UisKind | null, s: { from: string; to: string } | null): UisFileResult => ({ status: 'refused', code: 'E-UIS-PERIOD', kind, span: s })

describe('AC-8810.3: 종류 이름', () => {
  it.each([
    ['income', '일일수입통계'],
    ['rx', '기간별처방통계'],
    ['visits', '내원일별 위쪽 표'],
    ['visitPatients', '내원일별 아래쪽 표'],
    ['rsv', '예약환자통계'],
    ['rsvPatients', '예약환자통계'],
    [null, '모르는 엑셀'],
  ] as const)('AC-8810.3: %s → %s', (kind, name) => {
    expect(uisKindName(kind)).toBe(name)
  })
})

describe('AC-8810.3: 기간 글', () => {
  it('AC-8810.3: 하루 {M}월 {D}일 · 한 주 {M}월 {D}일 ~ {M}월 {D}일 (한 주) · 한 달 {M}월 한 달', () => {
    expect(uisSpanText(readRx(span('2026-11-26', '2026-11-26', 'day')), TODAY)).toBe('11월 26일')
    expect(uisSpanText(readRx(span('2026-11-16', '2026-11-22', 'week')), TODAY)).toBe('11월 16일 ~ 11월 22일 (한 주)')
    expect(uisSpanText(readRx(span('2026-10-01', '2026-10-31', 'month')), TODAY)).toBe('10월 한 달')
  })

  it('AC-8810.3: 받지 않은 기간은 조회일 {M}월 {D}일 ~ {M}월 {D}일 (시안 ?s=refused)이고, 하루면 조회일 {M}월 {D}일', () => {
    expect(uisLineText(refused('rx', { from: '2026-11-01', to: '2026-11-26' }), TODAY)).toBe('기간별처방통계 · 조회일 11월 1일 ~ 11월 26일')
    expect(uisSpanText(refused('income', { from: '2026-11-26', to: '2026-11-26' }), TODAY)).toBe('조회일 11월 26일')
  })

  it('AC-8810.3: 올해가 아니면 앞에 {YYYY}년 — 해가 바뀌는 한 주는 끝 날에도 그 해를 붙인다', () => {
    expect(uisSpanText(readRx(span('2025-12-31', '2025-12-31', 'day')), TODAY)).toBe('2025년 12월 31일')
    expect(uisSpanText(readRx(span('2025-12-01', '2025-12-31', 'month')), TODAY)).toBe('2025년 12월 한 달')
    expect(uisSpanText(readRx(span('2025-11-17', '2025-11-23', 'week')), TODAY)).toBe('2025년 11월 17일 ~ 11월 23일 (한 주)')
    expect(uisSpanText(readRx(span('2025-12-29', '2026-01-04', 'week')), TODAY)).toBe('2025년 12월 29일 ~ 2026년 1월 4일 (한 주)')
    expect(uisSpanText(refused('rx', { from: '2025-11-01', to: '2025-11-26' }), TODAY)).toBe('조회일 2025년 11월 1일 ~ 11월 26일')
  })

  it('AC-8810.3: 조회일을 모르면 기간 글 없이 종류 이름만(모르는 엑셀 · 예약환자통계)', () => {
    expect(uisSpanText(refused(null, null), TODAY)).toBeNull()
    expect(uisLineText(refused(null, null), TODAY)).toBe('모르는 엑셀')
    expect(uisLineText({ status: 'skipped', why: 'rsv', kind: 'rsv', span: null }, TODAY)).toBe('예약환자통계')
  })

  it('AC-8810.3: 줄 글은 {종류 이름} · {기간 글} — 같은 엑셀로 건너뛴 파일도 받은 기간 글이다', () => {
    expect(uisLineText({ status: 'read', read: { kind: 'visits', span: span('2026-11-26', '2026-11-26', 'day'), days: [] } }, TODAY)).toBe('내원일별 위쪽 표 · 11월 26일')
    expect(uisLineText({ status: 'skipped', why: 'same', kind: 'income', span: span('2026-11-25', '2026-11-25', 'day') }, TODAY)).toBe('일일수입통계 · 11월 25일')
  })
})
