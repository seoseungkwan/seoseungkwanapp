// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { OthersSection } from './OthersSection'
import { CLINICS, HOW, NO_RIVAL, PHARMACIES, ROAD, RULE, clinic, okRivals, rule, text } from './rivals.test.data'

// 후보 자세히 — 둘레 다른 과 의원(spec location REQ-7921 AC-7921.6·REQ-7920 AC-7920.2, design.md 18절, 시안 ?s=candidate sec-others,
// 글은 requirements '화면 글 기본값' 후보 자세히 새 묶음). 둘레 다른 과 의원 = 대표 과목이 둘레로 보기이고 한의원이 아닌 곳.
// 첫 줄(30m 안)은 모든 과(경쟁 포함, 안 보기 뺌)와 카카오 약국 — 같은 건물·옆 건물은 후보 카카오 도로명과 견줘 화면에서만 나눈다

afterEach(cleanup)

const section = () => document.getElementById('sec-others') as HTMLElement
const bodyRows = (table: HTMLElement) => within(table).getAllByRole('row').slice(1)
const cellsOf = (row: HTMLElement) => within(row).getAllByRole('cell').map((c) => text(c))

function others(over: Partial<Parameters<typeof OthersSection>[0]> = {}) {
  return render(<OthersSection radiusM={1000} rivals={okRivals} deptRule={RULE} kakaoRoad={ROAD} pharmacies={PHARMACIES} {...HOW} {...over} />)
}

describe('AC-7921.6: 둘레 다른 과 의원 — 제목·곁글', () => {
  it('AC-7921.6: 제목 `둘레 다른 과 의원 {n}`(한의원·경쟁·범위 밖 뺌) · 곁글 `범위 {범위} 안 · 둘레로 보기 과목 {k}개`', () => {
    others()
    const sec = section()
    expect(text(within(sec).getByRole('heading'))).toBe('둘레 다른 과 의원 5')
    expect(text(sec)).toContain('범위 1km 안 · 둘레로 보기 과목 16개')
  })

  it('AC-7921.6: 안 보기 과목은 어디에도 세지 않는다', () => {
    others({ deptRule: rule({ hide: ['derm'] }) })
    expect(text(within(section()).getByRole('heading'))).toBe('둘레 다른 과 의원 4')
    expect(text(section())).toContain('둘레로 보기 과목 15개')
    expect(within(section()).queryByText('피부과')).toBeNull()
  })

  it('AC-7921.6: 경쟁 과목이 0개면 처음 경쟁 과목도 둘레로 보기로 센다', () => {
    others({ deptRule: NO_RIVAL })
    expect(text(within(section()).getByRole('heading'))).toBe('둘레 다른 과 의원 12')
    expect(text(section())).toContain('둘레로 보기 과목 20개')
  })
})

describe('AC-7921.6: 첫 줄 — 같은 건물·옆 건물(30m 안) 모든 과와 약국', () => {
  it('AC-7921.6: `같은 건물: {과목} {n} · … · 약국 {n} / 옆 건물: …`(짧은 이름, 목록 차례, 경쟁 포함) + 셋 이상이면 칩 `병원이 모인 건물이에요`', () => {
    others()
    const line = screen.getByTestId('others-near')
    expect(text(line)).toBe('같은 건물: 정형외과 1 · 치과 1 · 약국 1 / 옆 건물: 내과 1 · 약국 1 병원이 모인 건물이에요')
    expect(within(line).getByText('병원이 모인 건물이에요').className).toContain('bg-accent-soft')
  })

  it('AC-7921.6: 30m 안 의원이 셋보다 적으면 칩이 없다', () => {
    others({ rivals: { ...okRivals, v: CLINICS.filter((r) => r.name !== '예시하내과의원') } })
    expect(text(screen.getByTestId('others-near'))).toBe('같은 건물: 정형외과 1 · 치과 1 · 약국 1 / 옆 건물: 약국 1')
    expect(screen.queryByText('병원이 모인 건물이에요')).toBeNull()
  })

  it('AC-7921.6: 카카오 도로명이 없으면 같은 건물·옆 건물을 합쳐 `30m 안: …` 한 줄', () => {
    others({ kakaoRoad: null })
    expect(text(screen.getByTestId('others-near'))).toBe('30m 안: 내과 1 · 정형외과 1 · 치과 1 · 약국 2 병원이 모인 건물이에요')
  })

  it('AC-7921.6: 약국을 아직 못 불렀으면(카카오, 볼 때만) 의원만 적는다', () => {
    others({ pharmacies: undefined })
    expect(text(screen.getByTestId('others-near'))).toBe('같은 건물: 정형외과 1 · 치과 1 / 옆 건물: 내과 1 병원이 모인 건물이에요')
  })

  it('AC-7921.6: 안 보기 과목은 첫 줄에도 없다', () => {
    others({ deptRule: rule({ hide: ['dental'] }) })
    expect(text(screen.getByTestId('others-near'))).toBe('같은 건물: 정형외과 1 · 약국 1 / 옆 건물: 내과 1 · 약국 1')
  })

  it('AC-7921.6: 하나도 없으면 `같은 건물·옆 건물에 다른 의원이나 약국이 없어요.`', () => {
    others({ rivals: { ...okRivals, v: CLINICS.filter((r) => r.distM > 30) }, pharmacies: [] })
    expect(text(screen.getByTestId('others-near'))).toBe('같은 건물·옆 건물에 다른 의원이나 약국이 없어요.')
  })
})

describe('AC-7921.6: 둘레로 보기 과목 표', () => {
  it('AC-7921.6: 머리 과목·범위 안 수·같은 건물·가장 가까운 거리, 범위 안에 있는 과목만 많은 차례(같으면 가까운 차례)', () => {
    others()
    const table = within(section()).getByRole('table')
    expect(within(table).getAllByRole('columnheader').map((c) => text(c))).toEqual(['과목', '범위 안 수', '같은 건물', '가장 가까운 거리'])
    expect(bodyRows(table).map((r) => cellsOf(r))).toEqual([
      ['내과', '2곳', '–옆 건물 1곳', '옆 건물'],
      ['치과의원', '1곳', '1곳', '같은 건물'],
      ['피부과', '1곳', '–', '300m'],
      ['이비인후과', '1곳', '–', '650m'],
    ])
  })

  it('AC-7921.6: 카카오 도로명이 없으면 30m 안을 나누지 않고 `30m 안 {n}곳`·`30m 안`', () => {
    others({ kakaoRoad: undefined })
    const rows = bodyRows(within(section()).getByRole('table')).map((r) => cellsOf(r))
    expect(rows[0]).toEqual(['내과', '2곳', '–30m 안 1곳', '30m 안'])
    expect(rows[1]).toEqual(['치과의원', '1곳', '–30m 안 1곳', '30m 안'])
  })

  it('AC-7921.6: 범위 안에 둘레로 보기 과목 의원이 없으면 `둘레로 보기 과목 의원이 범위 안에 없어요.`', () => {
    others({ rivals: { ...okRivals, v: CLINICS.filter((r) => r.detail !== undefined) } })
    expect(within(section()).queryByRole('table')).toBeNull()
    expect(within(section()).getByText('둘레로 보기 과목 의원이 범위 안에 없어요.')).toBeTruthy()
  })

  it('AC-7921.6: 곁글과 출처 두 줄(심평원 병원정보 · 의원·과목 / 카카오 · 약국)', () => {
    const onOpenSource = vi.fn()
    others({ onOpenSource })
    const sec = section()
    expect(text(sec)).toContain(
      '의원마다 대표 과목 하나로 셌어요(이름에 든 과목 먼저). 범위 안에 있는 과목만 보여요. 둘레로 보기 과목은 경쟁 수에 넣지 않고, 같은 건물·옆 건물(30m 안) 의원 수만 자리 점수의 세부 항목이에요(처음 무게 0).',
    )
    const links = within(sec).getAllByRole('link').map((a) => text(a))
    expect(links).toEqual(['건강보험심사평가원 병원정보서비스 · 기준 2026년 11월 15일 · 의원·과목', '카카오 로컬(주소·장소 찾기) · 약국'])
    fireEvent.click(within(sec).getByRole('link', { name: /카카오/ }))
    expect(onOpenSource).toHaveBeenCalledWith('kakao-local')
  })

  it('AC-7921.6: 받은 의원 목록이 200곳이면 표 아래 `200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.`', () => {
    const list = Array.from({ length: 200 }, (_, i) => clinic({ name: `예시${i + 1}내과`, depts: ['im'], distM: 40 + i }))
    others({ rivals: { ...okRivals, v: list } })
    expect(within(section()).getByText('200곳 넘게 있을 수 있어요. 가까운 200곳만 셌어요.')).toBeTruthy()
  })

  it('AC-7921.6: 의원 목록을 못 받았으면 그 자리에 까닭 글과 [다시 받기]', () => {
    const onRetry = vi.fn()
    others({ rivals: { ok: false, why: 'failed', src: 'hosp-list' }, onRetry })
    expect(within(section()).getByText('지금 받지 못했어요.')).toBeTruthy()
    expect(within(section()).queryByRole('table')).toBeNull()
    fireEvent.click(within(section()).getByRole('button', { name: '다시 받기' }))
    expect(onRetry).toHaveBeenCalledTimes(1)
  })
})

describe("AC-7920.2: 둘레 다른 과 의원 '이렇게 봤어요'(others)", () => {
  it('AC-7920.2: 제목 바로 아래 한 줄 — 심평원 병원정보(기준 날짜) · 카카오맵(같은 건물 약국) + 흔히 보는 기준', () => {
    others()
    const sec = section()
    expect(sec.children[1]!.textContent).toContain('이렇게 봤어요')
    const line = text(within(sec).getByText('이렇게 봤어요').closest('p'))
    expect(line).toContain('심평원 병원정보(기준 2026년 11월 15일) · 카카오맵(같은 건물 약국)')
    expect(line).toContain('둘레로 보기로 고른 과목을 과목마다 세고, 같은 건물·옆 건물(30m 안)에 어떤 과가 있는지 적었어요')
    expect(line).toContain('흔히 보는 기준')
  })

  it('AC-7920.2: 펼침을 부르는 쪽이 쥐면 그대로 — 누르면 onHow', () => {
    const onHow = vi.fn()
    others({ howOpen: true, onHow })
    fireEvent.click(within(section()).getByRole('button', { name: '접기' }))
    expect(onHow).toHaveBeenCalledTimes(1)
  })
})
