// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Got, Rival } from '@/types/location'
import { HoursSection } from './HoursSection'
import { OthersSection } from './OthersSection'
import { PriceSection } from './PriceSection'
import { RivalsSection } from './RivalsSection'
import {
  CLINICS,
  CTX,
  HOW,
  NO_RIVAL,
  PHARMACIES,
  ROAD,
  RULE,
  clinic,
  detail,
  manyOrtho,
  okHistory,
  okPeople,
  okRivals,
  rule,
  span,
  text,
  weekOf,
} from './rivals.test.data'
import { buildingKey, gapSummary, weekText } from './text'

// 후보 자세히 — 경쟁 의원 · 경쟁 의원 진료비 · 진료 시간 빈틈 (spec location REQ-7909·REQ-7921·REQ-7920·REQ-7922,
// AC-7909.3·AC-7921.5·AC-7920.2·AC-7922.2, design.md 6·11·18·19절, 승인된 시안 docs/mockups/location ?s=candidate 의 sec-comp·sec-price·sec-hours,
// 글은 requirements '화면 글 기본값' 먼저). 경쟁 의원 = 대표 과목(deptOf)이 과목 고르기 설정의 경쟁 과목인 의원. 부품은 props·콜백만 받는다

afterEach(cleanup)

const section = (id: string) => document.getElementById(id) as HTMLElement
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => text(c))
const firstTable = (id: string) => within(section(id)).getAllByRole('table')[0]!

function rivals(over: Partial<Parameters<typeof RivalsSection>[0]> = {}) {
  return render(<RivalsSection radiusM={1000} rivals={okRivals} history={okHistory} people={okPeople} deptRule={RULE} kakaoRoad={ROAD} {...HOW} {...over} />)
}

describe('AC-7909.3: 경쟁 의원 묶음 — 고른 경쟁 과목 수와 한의원 따로', () => {
  it('AC-7909.3: 제목 `경쟁 의원 {n}` + [과목 고르기] · 곁글 `범위 {범위} 안 · 고른 과목 {k}개`', () => {
    const onPickDepts = vi.fn()
    rivals({ onPickDepts })
    const sec = section('sec-comp')
    expect(text(within(sec).getByRole('heading'))).toBe('경쟁 의원 7')
    expect(text(sec)).toContain('범위 1km 안 · 고른 과목 4개')
    const pick = within(sec).getByRole('button', { name: '과목 고르기' })
    expect(pick.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(pick)
    expect(onPickDepts).toHaveBeenCalledTimes(1)
  })

  it('AC-7909.3: [과목 고르기] 콜백을 주지 않으면 단추가 없다', () => {
    rivals()
    expect(within(section('sec-comp')).queryByRole('button', { name: '과목 고르기' })).toBeNull()
  })

  it('AC-7909.3: 첫 줄 `범위 안에 경쟁 의원이 {n}곳이에요 ({짧은 이름}) → 경쟁 의원 1곳당 사는 사람 {m}명`(버림) — 대표 과목으로 센다', () => {
    rivals()
    expect(text(screen.getByTestId('rival-line'))).toBe(
      '범위 안에 경쟁 의원이 7곳이에요 (정형외과·신경외과·마취통증·재활) → 경쟁 의원 1곳당 사는 사람 6,887명',
    )
  })

  it('AC-7909.3: 사는 사람을 못 받았으면 1곳당 사는 사람 글을 뺀다', () => {
    rivals({ people: { ok: false, why: 'failed', src: 'pop-age' } })
    expect(text(screen.getByTestId('rival-line'))).toBe('범위 안에 경쟁 의원이 7곳이에요 (정형외과·신경외과·마취통증·재활)')
  })

  it('AC-7909.3: 한의원이 둘레로 보기면 따로 한 줄 `한의원 {n}곳은 경쟁 수에 넣지 않고 따로 세요 · [과목 고르기]에서 경쟁 의원으로 바꿀 수 있어요`', () => {
    rivals()
    expect(text(screen.getByTestId('rival-korean'))).toBe(
      '한의원 1곳은 경쟁 수에 넣지 않고 따로 세요 · [과목 고르기]에서 경쟁 의원으로 바꿀 수 있어요',
    )
    cleanup()
    rivals({ deptRule: rule({ hide: ['korean'] }) })
    expect(screen.queryByTestId('rival-korean')).toBeNull()
  })

  it('AC-7909.3: 한의원을 경쟁 의원으로 고르면 따로 한 줄은 없고 경쟁 표·거르기 단추에 같이 나온다', () => {
    rivals({ deptRule: rule({ rival: ['ortho', 'ns', 'pain', 'rehab', 'korean'] }) })
    expect(screen.queryByTestId('rival-korean')).toBeNull()
    expect(text(within(section('sec-comp')).getByRole('heading'))).toBe('경쟁 의원 8')
    const group = screen.getByRole('group', { name: '과목 거르기' })
    expect(within(group).getAllByRole('button').map((b) => text(b))).toContain('한의원 1')
    expect(bodyRows(firstTable('sec-comp')).map((r) => cellsOf(r)[0])).toContain('예시다한의원')
  })

  it('AC-7909.3: 범위 밖(거리 > 범위) 의원은 세지도 그리지도 않는다', () => {
    rivals()
    expect(screen.queryByText('예시바재활의학과')).toBeNull()
    cleanup()
    rivals({ radiusM: 1500 })
    expect(screen.getAllByText('예시바재활의학과').length).toBeGreaterThan(0)
  })

  it('AC-7909.3: 둘레로 보기·안 보기 과목 의원(내과·치과 등)은 경쟁 의원 표에 없다', () => {
    rivals()
    const names = bodyRows(firstTable('sec-comp')).map((r) => cellsOf(r)[0])
    for (const n of ['예시하내과의원', '예시거치과의원', '예시머피부과', '예시다한의원', '예시너내과']) expect(names).not.toContain(n)
  })

  it('AC-7909.3: 경쟁 과목이 0개면 노란 안내 `경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요` + [과목 고르기], 거르기 단추·표 없음', () => {
    const onPickDepts = vi.fn()
    rivals({ deptRule: NO_RIVAL, onPickDepts })
    const sec = section('sec-comp')
    expect(text(within(sec).getByRole('heading'))).toBe('경쟁 의원 0')
    expect(text(sec)).toContain('범위 1km 안 · 고른 과목 0개')
    const warn = screen.getByTestId('rival-none')
    expect(text(warn)).toBe('경쟁 의원 과목을 하나 이상 골라 주세요. 지금은 경쟁 점수를 셀 수 없어요과목 고르기')
    expect(warn.className).toContain('bg-warning-soft')
    fireEvent.click(within(warn).getByRole('button', { name: '과목 고르기' }))
    expect(onPickDepts).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('group', { name: '과목 거르기' })).toBeNull()
    expect(screen.queryByTestId('rival-line')).toBeNull()
    expect(within(sec).getAllByRole('table').length).toBe(1) // 3년 개폐업 표만(이 자리 폐업)
  })
})

describe('AC-7909.3: 경쟁 의원 표 — 의사·물리치료사·장비·문 연 해·같은 건물·진료 시간', () => {
  it('AC-7909.3: 머리 칸은 시안 그대로 의원·과목·거리·의사·물리치료사·장비·문 연 해·진료 시간이고 가까운 차례다', () => {
    rivals()
    const table = firstTable('sec-comp')
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual([
      '의원', '과목', '거리', '의사', '물리치료사', '장비', '문 연 해', '진료 시간',
    ])
    expect(bodyRows(table).map((r) => cellsOf(r)[0])).toEqual([
      '예시가정형외과', '예시나정형외과', '예시라마취통증의학과', '예시아신경외과', '예시바른의원', '예시마정형외과', '예시사정형외과',
    ])
  })

  it('AC-7909.3: 과목 칸은 대표 과목 이름 — 찾은 과목이 여럿이면 경쟁 과목 먼저(내과·정형외과 → 정형외과)', () => {
    rivals()
    const row = bodyRows(firstTable('sec-comp')).find((r) => cellsOf(r)[0] === '예시바른의원')!
    expect(cellsOf(row)[1]).toBe('정형외과')
  })

  it('AC-7909.3: 30m 안이면 거리 칸은 후보 도로명과 견줘 `같은 건물`·`옆 건물`, 물리치료사가 없으면 `자료 없음`, 장비는 MRI·CT 표', () => {
    rivals()
    const rows = bodyRows(firstTable('sec-comp'))
    const [first, second, , ns, barun, fifth, unknown] = rows
    expect(cellsOf(first!)).toEqual(['예시가정형외과', '정형외과', '같은 건물', '2명', '4명', 'MRI', '2021년', '평일 9~18:30 · 수 ~20시 · 토 9~13시'])
    expect(cellsOf(second!)).toEqual(['예시나정형외과', '정형외과', '350m', '1명', '3명', '–', '2026년', '평일 9~18시 · 토 9~13시'])
    expect(cellsOf(ns!)).toEqual(['예시아신경외과', '신경외과', '700m', '1명', '1명', 'CT', '2019년', '자료 없음'])
    expect(cellsOf(barun!)).toEqual(['예시바른의원', '정형외과', '800m', '1명', '자료 없음', '자료 없음', '–', '자료 없음'])
    expect(within(fifth!).getAllByText(/^(MRI|CT)$/).map((e) => e.textContent)).toEqual(['MRI', 'CT'])
    expect(cellsOf(unknown!)).toEqual(['예시사정형외과', '정형외과', '900m', '–', '자료 없음', '자료 없음', '–', '자료 없음'])
  })

  it('AC-7909.3: 옆 건물(도로명 + 건물 번호가 다름)이면 `옆 건물`, 카카오 도로명이 없으면 `30m 안`', () => {
    const next = clinic({ name: '예시카정형외과', depts: ['ortho'], distM: 15, address: '서울특별시 예시구 예시로 14', detail: detail() })
    rivals({ rivals: { ...okRivals, v: [next] } })
    expect(cellsOf(bodyRows(firstTable('sec-comp'))[0]!)[2]).toBe('옆 건물')
    cleanup()
    rivals({ rivals: { ...okRivals, v: [next] }, kakaoRoad: undefined })
    expect(cellsOf(bodyRows(firstTable('sec-comp'))[0]!)[2]).toBe('30m 안')
    cleanup()
    rivals({ rivals: { ...okRivals, v: [next] }, kakaoRoad: null })
    expect(cellsOf(bodyRows(firstTable('sec-comp'))[0]!)[2]).toBe('30m 안')
  })

  it('AC-7909.3: 과목 거르기 — [전체 {n}] + 고른 경쟁 과목마다 `{과목} {n}`(목록 차례), 누르면 그 과목만 보인다', () => {
    rivals()
    const group = screen.getByRole('group', { name: '과목 거르기' })
    const buttons = within(group).getAllByRole('button')
    expect(buttons.map((b) => text(b))).toEqual(['전체 7', '정형외과 5', '신경외과 1', '마취통증의학과 1', '재활의학과 0'])
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(buttons[2]!)
    expect(buttons[2]!.getAttribute('aria-pressed')).toBe('true')
    expect(buttons[0]!.getAttribute('aria-pressed')).toBe('false')
    expect(bodyRows(firstTable('sec-comp')).map((r) => cellsOf(r)[0])).toEqual(['예시아신경외과'])
    fireEvent.click(buttons[4]!)
    expect(within(section('sec-comp')).getByText('이 과목 의원이 범위 안에 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 거르기 단추 이름과 수 사이가 4px 띄어진다(시안 .ob .n — 단추가 inline-flex라 글 사이 빈칸은 화면에서 지워진다)', () => {
    rivals()
    const buttons = within(screen.getByRole('group', { name: '과목 거르기' })).getAllByRole('button')
    expect(buttons.length).toBeGreaterThan(1)
    for (const b of buttons) {
      const n = b.querySelector('span')
      expect(n, text(b)).not.toBeNull()
      expect(n!.className.split(/\s+/), text(b)).toContain('ml-1')
    }
  })

  it('AC-7909.3: 출처 줄 셋 — 의원·과목·의사 수·문 연 해 / MRI·CT·물리치료사 / 진료 시간, 기준 날짜와 함께', () => {
    const onOpenSource = vi.fn()
    rivals({ onOpenSource })
    const links = within(section('sec-comp')).getAllByRole('link').map((a) => text(a))
    expect(links).toEqual(
      expect.arrayContaining([
        '건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목·의사 수·문 연 해',
        '건강보험심사평가원 의료기관별상세정보서비스 · 기준 2026년 11월 15일 · MRI·CT·물리치료사',
        '국립중앙의료원 전국 병·의원 찾기 서비스 · 기준 2026년 11월 15일 · 진료 시간',
      ]),
    )
    fireEvent.click(within(section('sec-comp')).getByRole('link', { name: /MRI·CT·물리치료사/ }))
    expect(onOpenSource).toHaveBeenCalledWith('hosp-detail')
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 그 자리에 `지금 받지 못했어요.` [다시 받기]', () => {
    const onRetry = vi.fn()
    rivals({ rivals: { ok: false, why: 'failed', src: 'hosp-list' }, onRetry })
    const sec = section('sec-comp')
    expect(within(sec).getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(within(sec).queryAllByRole('table').length).toBe(1) // 3년 개폐업 표만
    fireEvent.click(within(sec).getAllByRole('button', { name: '다시 받기' })[0]!)
    expect(onRetry).toHaveBeenCalledTimes(1)
  })

  it('AC-7909.3: 못 받았지만 지난 값이 있으면 지난 값을 그리고 `지난 값 · 기준 {날짜}`를 붙인다', () => {
    rivals({ rivals: { ok: false, why: 'failed', src: 'hosp-list', prev: { v: CLINICS.slice(0, 5), asOf: '2026-10-01' } } })
    const sec = section('sec-comp')
    expect(text(within(sec).getByRole('heading'))).toBe('경쟁 의원 2')
    expect(within(sec).getByText('지난 값 · 기준 2026년 10월 1일')).toBeTruthy()
    expect(within(sec).getByRole('link', { name: /병원정보서비스 · 기준 2026년 10월 1일/ })).toBeTruthy()
  })

  it('AC-7909.3: 받은 의원 목록이 200곳이면 `200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.`', () => {
    const list = [
      ...CLINICS.slice(0, 1),
      ...Array.from({ length: 199 }, (_, i) => clinic({ name: `예시${i + 1}내과`, depts: ['im'], distM: 100 + i })),
    ]
    rivals({ rivals: { ...okRivals, v: list } })
    expect(within(section('sec-comp')).getByText('200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.')).toBeTruthy()
    cleanup()
    rivals()
    expect(screen.queryByText('200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.')).toBeNull()
  })
})

describe('AC-7921.5: 새로 경쟁 의원에 넣은 과목 — 자세한 칸 `–`와 표 아래 글', () => {
  const plusIm = rule({ rival: ['im', 'ortho', 'ns', 'pain', 'rehab'] })

  it('AC-7921.5: 모을 때 경쟁이 아니던 의원(detail 없음)은 의사 수·문 연 해 말고 물리치료사·장비·진료 시간이 `–`', () => {
    rivals({ deptRule: plusIm })
    const row = bodyRows(firstTable('sec-comp')).find((r) => cellsOf(r)[0] === '예시너내과')!
    expect(cellsOf(row)).toEqual(['예시너내과', '내과', '500m', '1명', '–', '–', '2010년', '–'])
  })

  it("AC-7921.5: 표 아래 `'–'인 {n}곳은 새로 경쟁 의원에 넣은 과목이에요. [다시 받기]를 누르면 의사 수·장비·진료비가 채워져요.`", () => {
    rivals({ deptRule: plusIm })
    expect(text(screen.getByTestId('rival-fresh'))).toBe(
      "'–'인 2곳은 새로 경쟁 의원에 넣은 과목이에요. [다시 받기]를 누르면 의사 수·장비·진료비가 채워져요.",
    )
    cleanup()
    rivals()
    expect(screen.queryByTestId('rival-fresh')).toBeNull()
  })

  it('AC-7921.5: 진료 시간 빈틈은 새로 넣은 의원을 빼고 세고 `진료 시간이 아직 없는 {n}곳은 빼고 셌어요. [다시 받기]를 누르면 더해져요.`', () => {
    hours({ deptRule: plusIm })
    const sec = section('sec-hours')
    expect(within(sec).getByText('진료 시간이 아직 없는 2곳은 빼고 셌어요. [다시 받기]를 누르면 더해져요.')).toBeTruthy()
    expect(text(sec)).toContain('범위 1km 안 경쟁 의원 4곳 · 칸 숫자 = 문 연 의원 수')
  })

  it('AC-7921.5: 진료비도 새로 넣은 의원은 세지 않는다(값 칸 없음)', () => {
    price({ deptRule: plusIm })
    expect(text(screen.getByTestId('price-eswt-head'))).toBe('체외충격파 1회 · 범위 안 4곳')
  })
})

describe('AC-7909.3: 3년 개폐업 — 경쟁 과목만, 이 자리 폐업은 과목과 상관없이', () => {
  it('AC-7909.3: `3년 사이 문 열고 닫은 곳` · 곁글 `경쟁 의원 · 문 엶 {a} · 문 닫음 {b}`, 표는 새 날짜부터(범위 밖·경쟁 아닌 과목 뺌)', () => {
    rivals()
    const sec = section('sec-comp')
    expect(text(screen.getByTestId('rival-history-head'))).toBe('3년 사이 문 열고 닫은 곳 경쟁 의원 · 문 엶 1 · 문 닫음 2')
    const table = within(sec).getAllByRole('table')[1]!
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual(['날짜', '무엇', '의원', '거리'])
    expect(bodyRows(table).map((r) => cellsOf(r))).toEqual([
      ['2026년 11월 3일', '문 엶', '예시나정형외과', '350m'],
      ['2025년 5월 12일', '문 닫음', '예시자정형외과', '700m'],
      ['2024년 3월 29일', '문 닫음', '예시카내과의원경쟁 과목은 아니지만 이 자리라 보여요', '이 자리'],
    ])
    expect(within(sec).getByRole('link', { name: '행정안전부 건강_의원 조회서비스 · 기준 2026년 11월 14일' })).toBeTruthy()
  })

  it('AC-7909.3: 경쟁 과목을 바꾸면 개폐업 표도 바로 따른다(내과를 경쟁으로 → 내과 개업이 보이고 이 자리 글은 없음)', () => {
    rivals({ deptRule: rule({ rival: ['im', 'ortho'] }) })
    const table = within(section('sec-comp')).getAllByRole('table')[1]!
    expect(bodyRows(table).map((r) => cellsOf(r)[2])).toEqual(['예시나정형외과', '예시자정형외과', '예시타내과', '예시카내과의원'])
    expect(text(screen.getByTestId('rival-history-head'))).toBe('3년 사이 문 열고 닫은 곳 경쟁 의원 · 문 엶 2 · 문 닫음 2')
  })

  it('AC-7909.3: 범위 안에 없으면 `범위 안에서 3년 사이 문 열거나 닫은 경쟁 의원이 없어요.`', () => {
    rivals({ history: { ...okHistory, v: [okHistory.v[3]!].map((e) => ({ ...e, distM: 400 })) } })
    expect(screen.getByText('범위 안에서 3년 사이 문 열거나 닫은 경쟁 의원이 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 개폐업 자료가 열쇠 없음이면 그 칸만 열쇠 글이고 경쟁 의원 표는 그대로다', () => {
    rivals({ history: { ok: false, why: 'no-key', src: 'clinic-license' } })
    expect(screen.getByText('건강_의원 조회서비스: 열쇠를 넣으면 보여요.')).toBeTruthy()
    expect(screen.getAllByRole('table').length).toBe(1)
  })
})

function price(over: Partial<Parameters<typeof PriceSection>[0]> = {}) {
  return render(<PriceSection radiusM={1000} rivals={okRivals} deptRule={RULE} homeEswt={null} {...HOW} {...over} />)
}

describe('AC-7909.3: 경쟁 의원 진료비 — 체외충격파 최저·최고·평균 vs 지금 의원 값', () => {
  it('AC-7909.3: 머리 `경쟁 의원 진료비` · `건강보험이 안 되는 진료(비급여) · 의원마다 올린 값`과 보기 글 셋', () => {
    price()
    const sec = section('sec-price')
    expect(text(within(sec).getByRole('heading'))).toBe('경쟁 의원 진료비')
    expect(text(sec)).toContain('건강보험이 안 되는 진료(비급여) · 의원마다 올린 값')
    expect(text(sec)).toContain('둘레 의원평균지금 의원 값(개원 준비에 적은 값)')
  })

  it('AC-7909.3: 범위 안 경쟁 의원이 올린 값으로 가장 싼 곳·평균(버림)·가장 비싼 곳, 원 칸 금액은 wonText', () => {
    price()
    expect(text(screen.getByTestId('price-eswt-head'))).toBe('체외충격파 1회 · 범위 안 4곳')
    expect(text(screen.getByTestId('price-eswt'))).toBe(
      '가장 싼 곳 60,000원 · 평균 80,000원 · 가장 비싼 곳 100,000원 · 지금 의원 값은 개원 준비에서 적어요',
    )
  })

  it('AC-7909.3: 경쟁 과목에서 뺀 과목 의원은 값이 있어도 세지 않는다(마취통증 뺌)', () => {
    price({ deptRule: rule({ rival: ['ortho', 'ns', 'rehab'] }) })
    expect(text(screen.getByTestId('price-eswt-head'))).toBe('체외충격파 1회 · 범위 안 3곳')
    expect(text(screen.getByTestId('price-eswt'))).toContain('가장 싼 곳 70,000원 · 평균 86,666원 · 가장 비싼 곳 100,000원')
  })

  it('AC-7909.3: 지금 의원 값이 있으면 평균과 견준다(버림 %) — 싸요·비싸요·같아요', () => {
    price({ homeEswt: 72000 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 72,000원 (평균보다 10% 싸요)')
    cleanup()
    price({ homeEswt: 99999 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 99,999원 (평균보다 24% 비싸요)')
    cleanup()
    price({ homeEswt: 80000 })
    expect(text(screen.getByTestId('price-eswt'))).toContain('지금 의원 80,000원 (평균과 같아요)')
  })

  it.each([null, 72000])('AC-7909.3: 값 띠 눈금 글자는 띠 안에 머문다 — 맨 왼쪽은 왼쪽 맞춤, 맨 오른쪽은 오른쪽 맞춤, 가운데는 가운데(지금 의원 값 %s)', (homeEswt) => {
    price({ homeEswt })
    const ticks = [...section('sec-price').querySelectorAll('[aria-hidden="true"] span')].filter((s) => /^(?:0|[\d,]+만)$/.test(s.textContent ?? '')) as HTMLElement[]
    expect(ticks.map((t) => t.textContent)).toEqual(['5만', '6만', '7만', '8만', '9만', '10만', '11만'])
    const first = ticks[0]!
    const last = ticks.at(-1)!
    expect(parseFloat(first.style.left)).toBe(0)
    expect(parseFloat(last.style.left)).toBe(100)
    expect(first.className.split(/\s+/)).not.toEqual(expect.arrayContaining([expect.stringMatching(/translate-x/)]))
    expect(last.className.split(/\s+/)).toContain('-translate-x-full')
    expect(last.className.split(/\s+/)).not.toContain('-translate-x-1/2')
    for (const t of ticks.slice(1, -1)) expect(t.className.split(/\s+/), t.textContent ?? '').toContain('-translate-x-1/2')
  })

  it('AC-7909.3: 지금 의원 값이 없으면 [지금 의원 값은 개원 준비에서 적어요]를 누르면 적기 콜백을 부른다', () => {
    const onWriteHomeEswt = vi.fn()
    price({ onWriteHomeEswt })
    fireEvent.click(screen.getByRole('button', { name: '지금 의원 값은 개원 준비에서 적어요' }))
    expect(onWriteHomeEswt).toHaveBeenCalledTimes(1)
  })

  it('AC-7909.3: 100만 원 넘는 값도 wonText 글자(`120만 원`)', () => {
    const big = [clinic({ name: '예시카정형외과', depts: ['ortho'], distM: 100, detail: detail({ eswt: 1_200_000 }) })]
    price({ rivals: { ...okRivals, v: big } })
    expect(text(screen.getByTestId('price-eswt'))).toContain('가장 싼 곳 120만 원 · 평균 120만 원 · 가장 비싼 곳 120만 원')
  })

  it('AC-7909.3: 값을 올린 의원이 없으면 `범위 안에 값을 올린 의원이 없어요.`', () => {
    price({ rivals: { ...okRivals, v: CLINICS.filter((r) => ['예시아신경외과', '예시바른의원'].includes(r.name)) } })
    expect(within(section('sec-price')).getByText('범위 안에 값을 올린 의원이 없어요.')).toBeTruthy()
  })

  it('AC-7909.3: 도수치료 값이 하나도 없으면 `도수치료는 2026년 7월부터 관리급여라 견주지 않아요`, 출처 줄 옆 관리급여 글과 1회 기준 글', () => {
    price()
    const sec = section('sec-price')
    expect(within(sec).getByText('도수치료')).toBeTruthy()
    expect(within(sec).getByText('도수치료는 2026년 7월부터 관리급여라 견주지 않아요')).toBeTruthy()
    expect(within(sec).getByText('도수치료는 2026년 7월부터 관리급여예요. 공개 자료에 값이 있을 때만 보여요.')).toBeTruthy()
    expect(within(sec).getByText('의원마다 1회 기준(시간·부위)이 다를 수 있어요.')).toBeTruthy()
    expect(within(sec).getByRole('link', { name: '건강보험심사평가원 비급여진료비정보조회서비스 · 기준 2026년 11월 15일' })).toBeTruthy()
  })

  it('AC-7909.3: 공개 자료에 도수치료 값이 있으면(detail.manual) 같은 모양으로 가장 싼 곳·평균·가장 비싼 곳', () => {
    const withManual = CLINICS.map((r) =>
      r.name === '예시가정형외과' ? { ...r, detail: { ...r.detail!, manual: 100000 } } : r.name === '예시마정형외과' ? { ...r, detail: { ...r.detail!, manual: 120000 } } : r,
    )
    price({ rivals: { ...okRivals, v: withManual }, homeEswt: 80000 })
    expect(text(screen.getByTestId('price-manual-head'))).toBe('도수치료 1회 · 범위 안 2곳')
    expect(text(screen.getByTestId('price-manual'))).toBe('가장 싼 곳 100,000원 · 평균 110,000원 · 가장 비싼 곳 120,000원')
    expect(screen.queryByText('도수치료는 2026년 7월부터 관리급여라 견주지 않아요')).toBeNull()
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 진료비 자리에 까닭 글', () => {
    price({ rivals: { ok: false, why: 'not-applied', src: 'hosp-list' } })
    expect(within(section('sec-price')).getByText("공공데이터포털에서 '병원정보서비스' 활용신청을 하면 보여요.")).toBeTruthy()
    expect(screen.queryByTestId('price-eswt')).toBeNull()
  })
})

describe('AC-7922.2: 비급여 — 가까운 경쟁 의원 20곳, 못 받은 의원은 그 값만 `지금 받지 못했어요`', () => {
  it('AC-7922.2: 20곳 안에서 비급여를 못 받은 의원(priced: false)은 `{의원}: 지금 받지 못했어요.` [다시 받기], 다른 의원 값은 그대로', () => {
    const onRetry = vi.fn()
    price({ onRetry })
    const failed = screen.getByTestId('price-failed')
    expect(text(failed)).toBe('예시사정형외과: 지금 받지 못했어요.다시 받기')
    fireEvent.click(within(failed).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
    expect(text(screen.getByTestId('price-eswt'))).toContain('가장 싼 곳 60,000원 · 평균 80,000원 · 가장 비싼 곳 100,000원')
    expect(screen.queryByText('가까운 경쟁 의원 20곳만 값을 봤어요.')).toBeNull()
  })

  it('AC-7922.2: 경쟁 의원이 20곳 넘으면 21번째부터(priced: false)는 못 받은 것이 아니라 `가까운 경쟁 의원 20곳만 값을 봤어요.`', () => {
    const list = manyOrtho(23, (i) => (i === 3 || i >= 20 ? { priced: false, eswt: null } : {}))
    price({ rivals: { ...okRivals, v: list } })
    expect(text(screen.getByTestId('price-failed'))).toBe('예시4정형외과: 지금 받지 못했어요.')
    expect(within(section('sec-price')).getByText('가까운 경쟁 의원 20곳만 값을 봤어요.')).toBeTruthy()
    expect(text(screen.getByTestId('price-eswt-head'))).toBe('체외충격파 1회 · 범위 안 19곳')
  })

  it('AC-7922.2: 20곳 차례는 모을 때 detail이 있던 의원 모두의 가까운 차례다(지금 경쟁에서 뺀 의원도 차례에 든다)', () => {
    // 가까운 3곳은 마취통증(지금 경쟁에서 뺌), 그다음 정형외과 20곳 — 정형외과 뒤 3곳은 20곳 밖
    const pains = Array.from({ length: 3 }, (_, i) => clinic({ name: `예시${i + 1}마취통증의학과`, depts: ['pain'], distM: 50 + i, detail: detail({ eswt: 40000 }) }))
    const orthos = manyOrtho(20, (i) => (i >= 17 ? { priced: false, eswt: null } : {}))
    price({ rivals: { ...okRivals, v: [...pains, ...orthos] }, deptRule: rule({ rival: ['ortho'] }) })
    expect(screen.queryByTestId('price-failed')).toBeNull()
    expect(within(section('sec-price')).getByText('가까운 경쟁 의원 20곳만 값을 봤어요.')).toBeTruthy()
  })

  it('AC-7922.2: 경쟁 의원 묶음은 받은 것으로 남는다 — 못 받은 의원도 경쟁 의원 표·수에 그대로 있다', () => {
    rivals()
    expect(text(within(section('sec-comp')).getByRole('heading'))).toBe('경쟁 의원 7')
    expect(bodyRows(firstTable('sec-comp')).map((r) => cellsOf(r)[0])).toContain('예시사정형외과')
  })
})

function hours(over: Partial<Parameters<typeof HoursSection>[0]> = {}) {
  return render(<HoursSection radiusM={1000} rivals={okRivals} deptRule={RULE} {...HOW} {...over} />)
}

describe('AC-7909.3: 진료 시간 빈틈 표(design.md 11절 칸) — 경쟁 과목만', () => {
  it('AC-7909.3: 머리 `진료 시간 빈틈` · `범위 {범위} 안 경쟁 의원 {n}곳 · 칸 숫자 = 문 연 의원 수`(진료 시간이 있는 곳)', () => {
    hours()
    const sec = section('sec-hours')
    expect(text(within(sec).getByRole('heading'))).toBe('진료 시간 빈틈')
    expect(text(sec)).toContain('범위 1km 안 경쟁 의원 4곳 · 칸 숫자 = 문 연 의원 수')
  })

  it('AC-7909.3: 요일 7 × 칸 7, 칸마다 문 연 경쟁 의원 수(한의원·다른 과·범위 밖 뺌), 0이면 `빈틈`', () => {
    hours()
    const table = within(section('sec-hours')).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual(['시간', '월', '화', '수', '목', '금', '토', '일'])
    const rows = bodyRows(table).map((r) => [text(within(r).getByRole('rowheader')), ...cellsOf(r)])
    expect(rows).toEqual([
      ['아침 8~9시', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈'],
      ['오전 9~13시', '4', '4', '4', '4', '4', '4', '빈틈'],
      ['점심 13~14시', '4', '4', '4', '4', '4', '1', '빈틈'],
      ['오후 14~18시', '4', '4', '4', '4', '4', '빈틈', '빈틈'],
      ['저녁 18~19시', '1', '빈틈', '1', '1', '빈틈', '빈틈', '빈틈'],
      ['저녁 19~20시', '1', '빈틈', '1', '1', '빈틈', '빈틈', '빈틈'],
      ['밤 20~21시', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈', '빈틈'],
    ])
  })

  it('AC-7909.3: 빈 시간을 한 줄로 모아 알린다(시안 글)', () => {
    hours()
    expect(text(screen.getByTestId('gap-line'))).toBe(
      '평일 아침 8~9시 · 화·금요일 저녁 19~20시 · 평일 밤 20~21시 · 토요일 오후 · 일요일에 문 연 의원이 없어요. 이 시간에 문을 열면 환자를 모을 수 있어요.',
    )
  })

  it('AC-7909.3: 빈 시간이 없으면 `빈 시간이 없어요. 모든 시간에 문 연 의원이 있어요.`', () => {
    const allDay = clinic({ name: '예시타정형외과', depts: ['ortho'], distM: 100, detail: detail({ week: weekOf(span(700, 2300), span(700, 2300), span(700, 2300)) }) })
    hours({ rivals: { ...okRivals, v: [allDay] } })
    expect(text(screen.getByTestId('gap-line'))).toBe('빈 시간이 없어요. 모든 시간에 문 연 의원이 있어요.')
  })

  it('AC-7909.3: 점심 쉼 모름 글 — `점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요. 공휴일 진료는 의원마다 그때그때 달라 세지 않아요.`', () => {
    hours()
    expect(
      within(section('sec-hours')).getByText('점심 쉬는 시간은 자료에 없어 문을 연 것으로 세요. 공휴일 진료는 의원마다 그때그때 달라 세지 않아요.'),
    ).toBeTruthy()
    expect(within(section('sec-hours')).getByRole('link', { name: '국립중앙의료원 전국 병·의원 찾기 서비스 · 기준 2026년 11월 15일' })).toBeTruthy()
  })

  it('AC-7909.3: 모을 때 진료 시간을 못 찾은 경쟁 의원(detail.week 없음)은 세지 않았다고 적는다', () => {
    hours()
    expect(within(section('sec-hours')).getByText('진료 시간 자료가 없는 3곳은 세지 않았어요.')).toBeTruthy()
    expect(screen.queryByText(/진료 시간이 아직 없는/)).toBeNull()
  })

  it('AC-7909.3: 경쟁 과목이 0개면 `경쟁 의원 과목을 고르면 보여요.`만 — 표·빈틈 줄 없음', () => {
    hours({ deptRule: NO_RIVAL })
    const sec = section('sec-hours')
    expect(within(sec).getByText('경쟁 의원 과목을 고르면 보여요.')).toBeTruthy()
    expect(within(sec).queryByRole('table')).toBeNull()
    expect(screen.queryByTestId('gap-line')).toBeNull()
  })

  it('AC-7909.3: 경쟁 의원 자료를 못 받았으면 표 대신 까닭 글과 [다시 받기]', () => {
    const onRetry = vi.fn()
    hours({ rivals: { ok: false, why: 'failed', src: 'hosp-list' }, onRetry })
    expect(within(section('sec-hours')).queryByRole('table')).toBeNull()
    fireEvent.click(within(section('sec-hours')).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("AC-7920.2: 묶음마다 '이렇게 봤어요'(comp · price · hours) — 제목 바로 아래, {경쟁}·기준 날짜를 채움", () => {
  const howOf = (id: string) => within(section(id)).getByText('이렇게 봤어요').closest('p') as HTMLElement

  it('AC-7920.2: 경쟁 의원 한 줄 — `범위 안 경쟁 의원({경쟁})을 세고 사는 사람을 의원 수로 나눴어요` + 흔히 보는 기준 칩, 기준 날짜는 그날 값', () => {
    rivals()
    const line = text(howOf('sec-comp'))
    expect(line).toContain('이렇게 봤어요 심평원 병원정보·상세정보(기준 2026년 11월 15일) · 국립중앙의료원 진료 시간 · 행정안전부 의원 인허가')
    expect(line).toContain('범위 안 경쟁 의원(정형외과·신경외과·마취통증·재활)을 세고 사는 사람을 의원 수로 나눴어요')
    expect(line).toContain('흔히 보는 기준')
  })

  it('AC-7920.2: 한 줄은 묶음 제목 바로 아래(머리 줄 다음 첫 칸)에 있다', () => {
    rivals()
    price()
    hours()
    for (const id of ['sec-comp', 'sec-price', 'sec-hours']) {
      const sec = section(id)
      expect(sec.children[1]!.textContent).toContain('이렇게 봤어요')
    }
  })

  it('AC-7920.2: 글은 부르는 쪽이 넘긴 howCtx로 채운다 — {경쟁}·기준 날짜(없으면 그 조각을 뺌)', () => {
    rivals({ howCtx: { ...CTX, asOf: () => null, rivalShort: '고른 과목 없음' } })
    const line = text(howOf('sec-comp'))
    expect(line).toContain('범위 안 경쟁 의원(고른 과목 없음)을 세고')
    expect(line).toContain('이렇게 봤어요 심평원 병원정보·상세정보 · 국립중앙의료원 진료 시간')
  })

  it('AC-7920.2: 접혀 있으면 [더 보기](펼침 아님), 누르면 onHow만 부른다', () => {
    const onHow = vi.fn()
    rivals({ onHow })
    const sec = section('sec-comp')
    const more = within(sec).getByRole('button', { name: '더 보기' })
    expect(more.getAttribute('aria-expanded')).toBe('false')
    expect(sec.querySelector('dl')!.hidden).toBe(true)
    fireEvent.click(more)
    expect(onHow).toHaveBeenCalledTimes(1)
  })

  it('AC-7920.2: 펼치면(howOpen) 네 줄이 보이고 [접기] — 누르면 onHow, 범위를 바꿔 다시 그려도 그대로', () => {
    const onHow = vi.fn()
    const view = rivals({ howOpen: true, onHow })
    const sec = section('sec-comp')
    expect(sec.querySelector('dl')!.hidden).toBe(false)
    expect(text(sec.querySelector('dl'))).toContain('경쟁 의원 과목은 [과목 고르기]에서 내가 정해요(지금: 정형외과·신경외과·마취통증·재활)')
    expect(text(sec.querySelector('dl'))).toContain('행정안전부 건강_의원 인허가(기준 2026년 11월 14일)')
    fireEvent.click(within(sec).getByRole('button', { name: '접기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
    view.rerender(
      <RivalsSection radiusM={1500} rivals={okRivals} history={okHistory} people={okPeople} deptRule={RULE} howCtx={{ ...CTX, radiusM: 1500 }} howOpen onHow={onHow} />,
    )
    expect(within(section('sec-comp')).getByRole('button', { name: '접기' })).toBeTruthy()
  })

  it('AC-7920.2: 진료비 — 심평원 비급여진료비정보(기준 날짜) 한 줄, [더 보기]의 {경쟁}', () => {
    price({ howOpen: true })
    const sec = section('sec-price')
    expect(text(howOf('sec-price'))).toContain('심평원 비급여진료비정보(기준 2026년 11월 15일) · 지금 의원 값(내가 적은 값)')
    expect(text(sec)).toContain('범위 안 경쟁 의원(정형외과·신경외과·마취통증·재활)이 올린 체외충격파 1회 값으로')
  })

  it('AC-7920.2: 진료 시간 빈틈 — 국립중앙의료원 전국 병·의원 찾기(기준 날짜) 한 줄', () => {
    hours()
    expect(text(howOf('sec-hours'))).toContain('국립중앙의료원 전국 병·의원 찾기(기준 2026년 11월 15일) · 범위 안 경쟁 의원의 요일별 여는 시간을 겹쳐, 아무도 안 여는 칸을 셌어요')
  })

  it('AC-7920.2: 기준 날짜가 없으면 그 조각과 빈 괄호를 뺀다', () => {
    hours({ howCtx: { ...CTX, asOf: () => null } })
    expect(text(howOf('sec-hours'))).toContain('이렇게 봤어요 국립중앙의료원 전국 병·의원 찾기 · 범위 안')
  })
})

describe('AC-7909.3: 글 만들기', () => {
  it('AC-7909.3: 진료 시간 글 — 평일 가장 흔한 시간 + 다른 요일(같은 글끼리 묶음) + 토·일, 정각이면 `시`', () => {
    expect(weekText(weekOf(span(900, 1830), span(900, 1300), null, { 2: span(900, 2000) }))).toBe('평일 9~18:30 · 수 ~20시 · 토 9~13시')
    expect(weekText(weekOf(span(1000, 1900), span(1000, 1400), span(1000, 1400)))).toBe('평일 10~19시 · 토·일 10~14시')
    expect(weekText(weekOf(span(900, 1800), null, null, { 2: null, 4: span(1000, 1800) }))).toBe('평일 9~18시 · 수 휴진 · 금 10~18시')
    expect(weekText(weekOf(null, span(900, 1300)))).toBe('토 9~13시')
    expect(weekText(null)).toBeNull()
  })

  it('AC-7909.3: 빈틈 한 줄은 평일 아침·점심·저녁 19~20·밤과 토요일 오후·일요일(오전)만 모은다', () => {
    const none = Array.from({ length: 7 }, () => [1, 1, 1, 1, 1, 1, 1])
    expect(gapSummary(none)).toEqual([])
    const lunch = none.map((r) => [...r])
    lunch[2] = [0, 1, 0, 1, 1, 1, 1]
    expect(gapSummary(lunch)).toEqual(['월·수요일 점심 13~14시'])
  })

  it('AC-7921.6: 같은 건물 견주기 열쇠 = 도로명 + 건물 번호(시·도 줄임말·괄호·쉼표 뒤·층·호를 뺌)', () => {
    expect(buildingKey('서울특별시 예시구 예시로 12, 2층 (가람동)')).toBe('예시로 12')
    expect(buildingKey('서울 예시구 예시로 12')).toBe('예시로 12')
    expect(buildingKey('경기도 예시시 예시구 예시대로12번길 3-1 4층 401호')).toBe('예시대로12번길 3-1')
    expect(buildingKey('서울 종로구 종로 1')).toBe('종로 1')
    expect(buildingKey('예시구 가람동 123-4')).toBeNull() // 지번 주소는 견주지 않는다
    expect(buildingKey('')).toBeNull()
  })
})

describe('AC-7909.3: 화면 규칙 — PC 모양 하나 · props·콜백만 · 토큰 색 · 화면 글에 영어 낱말 없음', () => {
  const DIR = 'src/components/location/detail/rivals'
  const FILES = readdirSync(join(process.cwd(), DIR))
    .filter((name) => /\.tsx?$/.test(name) && !/\.test\./.test(name))
    .map((name) => `${DIR}/${name}`)
  const withoutComments = (code: string) => code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/[^\n]*/g, '$1')
  const read = (file: string) => withoutComments(readFileSync(join(process.cwd(), file), 'utf8'))
  const all = (over: { radiusM?: number; homeEswt?: number | null } = {}) => (
    <>
      <RivalsSection radiusM={over.radiusM ?? 1000} rivals={okRivals} history={okHistory} people={okPeople} deptRule={RULE} kakaoRoad={ROAD} onPickDepts={() => {}} onRetry={() => {}} {...HOW} howOpen />
      <OthersSection radiusM={over.radiusM ?? 1000} rivals={okRivals} deptRule={RULE} kakaoRoad={ROAD} pharmacies={PHARMACIES} {...HOW} howOpen />
      <PriceSection radiusM={over.radiusM ?? 1000} rivals={okRivals} deptRule={RULE} homeEswt={over.homeEswt ?? null} onWriteHomeEswt={() => {}} onRetry={() => {}} {...HOW} howOpen />
      <HoursSection radiusM={over.radiusM ?? 1000} rivals={okRivals} deptRule={RULE} {...HOW} howOpen />
    </>
  )

  it('AC-7909.3: 살펴볼 소스가 있다', () => {
    expect(FILES).toEqual(
      expect.arrayContaining([`${DIR}/RivalsSection.tsx`, `${DIR}/OthersSection.tsx`, `${DIR}/PriceSection.tsx`, `${DIR}/HoursSection.tsx`, `${DIR}/text.ts`]),
    )
  })

  it('AC-7909.3: 소스에 화면 폭 앞말·ds.button·ds.input·ds.textButton이 없고, 그린 화면에도 폭 따라 바뀌는 클래스가 없다', () => {
    const widths = (code: string) => [...code.matchAll(/(?<![\w\-[])((?:max-|min-)?(?:sm|md|lg|\d*xl)):/g)].map((m) => m[1]!)
    expect(FILES.flatMap((f) => widths(read(f)).map((v) => `${f}: ${v}`))).toEqual([])
    expect(FILES.filter((f) => /ds\.(button|input|textButton)\b/.test(read(f)))).toEqual([])
    const { container } = render(all())
    const classes = Array.from(container.querySelectorAll('[class]')).flatMap((el) => el.getAttribute('class')!.split(/\s+/))
    expect(classes.filter((c) => /(^|:)(max-|min-)?(sm|md|lg|\d*xl):/.test(`${c}`))).toEqual([])
  })

  it('AC-7909.3: 바깥 부르기·저장·브라우저 저장소·supabase를 쓰지 않는다', () => {
    const banned = /\bfetch\s*\(|supabase|localStorage|sessionStorage|indexedDB|@\/lib\/storage|clients|XMLHttpRequest|process\.env/
    expect(FILES.filter((f) => banned.test(read(f)))).toEqual([])
  })

  it('AC-7909.3: 색은 토큰만 — 소스에 # 색·rgb()·기본 팔레트 색 이름이 없다', () => {
    const raw = /#[0-9a-fA-F]{3,8}\b|rgba?\(|\b(?:bg|text|border|fill|stroke|ring)-(?:red|blue|green|gray|slate|orange|amber|yellow|sky|indigo|violet|purple|white|black)\b/
    expect(FILES.filter((f) => raw.test(read(f)))).toEqual([])
  })

  it('AC-7909.3: 그린 글에 영어 낱말이 없다(MRI·CT·m·km 같은 이름·단위는 된다)', () => {
    const { container } = render(all({ radiusM: 1500, homeEswt: 70000 }))
    // 글 조각(text node)마다 본다 — 옆 칸 글이 붙어 보이지 않게
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT)
    const words: string[] = []
    for (let node = walker.nextNode(); node; node = walker.nextNode()) words.push(...(node.textContent!.match(/[A-Za-z]+/g) ?? []))
    expect(words.length).toBeGreaterThan(0) // MRI·CT·km가 그려졌다(빈 검사가 아니다)
    expect(words.filter((w) => !['MRI', 'CT', 'm', 'km'].includes(w))).toEqual([])
  })

  it('AC-7909.3: 닻 id는 묶음마다 기본값 하나씩(sec-comp·sec-others·sec-price·sec-hours)', () => {
    const { container } = render(all())
    expect(Array.from(container.querySelectorAll('section[id]')).map((s) => s.id)).toEqual(['sec-comp', 'sec-others', 'sec-price', 'sec-hours'])
  })
})

// 지어낸 값이 시험과 맞는지(대표 과목 셈이 바뀌면 여기서 먼저 알 수 있게)
describe('AC-7909.3: 견본 확인', () => {
  it('AC-7909.3: 견본 그날 값은 design.md 6절 Rival 새 모양(kind 없음)', () => {
    const r: Rival = CLINICS[0]!
    expect(Object.keys(r).sort()).toEqual(['address', 'at', 'depts', 'detail', 'distM', 'doctors', 'name', 'openedYear', 'sameBuilding'])
    const failed: Got<Rival[]> = { ok: false, why: 'failed', src: 'hosp-list' }
    expect(failed.ok).toBe(false)
  })
})
