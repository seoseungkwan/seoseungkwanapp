// @vitest-environment jsdom
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { renderPay } from './payTestKit'

// 급여 화면 폰 모양 없음 (staff AC-7611.4, design.md 6절 '폰 모양 없음', tasks.md Phase 4).
// ① 이 폴더 소스(시험 파일 밖)에 폭 경계 접두와 앱 공통 단추 묶음 틀(폰에서 칸 나눔)이 없다
// ② 급여 화면 다섯 칸과 작은 창들을 그려 모든 요소 class에 '폭 경계 접두 + 모양 클래스'가 없다(ds 손가락 크기는 통과)

afterEach(cleanup)

const DIR = join(process.cwd(), 'src/components/staff/pay')
const SOURCES = readdirSync(DIR).filter((name) => /\.(ts|tsx)$/.test(name) && !/\.test\.(ts|tsx)$/.test(name) && name !== 'payTestKit.tsx')

const WIDTH_PREFIX = /(?<![\w-])(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|min-\[[^\]\s]*\]|max-\[[^\]\s]*\]):/
const WIDTH_VARIANT = /^(?:sm|md|lg|xl|2xl|max-sm|max-md|max-lg|max-xl|min-\[[^\]]*\]|max-\[[^\]]*\])$/
const LAYOUT = /^(?:grid|grid-cols-.+|flex|flex-col|flex-row|block|hidden|w-full|col-span-.+)$/
// ds 단추·칸의 손가락 크기(앱 공통, AC-7611.4가 괜찮다고 한 것)
const FINGER = /^max-md:(?:h-11|min-h-11|text-lead|p[xytb]-.+)$/

const classTokens = (root: ParentNode) =>
  [...root.querySelectorAll('*')].flatMap((el) => (el.getAttribute('class') ?? '').split(/\s+/).filter((token) => token !== ''))

/** 폭 경계 접두가 붙은 모양 클래스(칸 나눔·쌓임·폭) */
const phoneLayout = (token: string) => {
  const parts = token.split(':')
  const base = parts[parts.length - 1]
  return parts.slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)) && LAYOUT.test(base)
}
/** 폭 경계 접두가 붙은 클래스 가운데 ds 손가락 크기가 아닌 것 */
const otherWidthClass = (token: string) => token.split(':').slice(0, -1).some((variant) => WIDTH_VARIANT.test(variant)) && !FINGER.test(token)

function expectPcOnly(where: string) {
  const tokens = classTokens(document.body)
  expect(tokens.length, where).toBeGreaterThan(0)
  expect(tokens.filter(phoneLayout), where).toEqual([])
  expect(tokens.filter(otherWidthClass), where).toEqual([])
}

const menu = () => screen.getByRole('group', { name: '급여 안 메뉴' })

describe('AC-7611.4: 급여 화면은 폰에서도 PC 모양 그대로다', () => {
  it('AC-7611.4: 급여 폴더 소스(시험 밖)에 폭 경계 접두(sm: · md: · lg: · max-md: · min-[…]: …)와 ds 단추 묶음 틀이 없다', () => {
    expect(SOURCES.length).toBeGreaterThan(10)
    for (const name of SOURCES) {
      const text = readFileSync(join(DIR, name), 'utf8')
      const lines = text.split('\n').flatMap((line, i) => (WIDTH_PREFIX.test(line) ? [`${name}:${i + 1}: ${line.trim()}`] : []))
      expect(lines, name).toEqual([])
      expect(text.includes(['ds', 'segment', 'group'].join('.')), name).toBe(false)
    }
  })

  it('AC-7611.4: 이달 급여(항목 고치기·조정 창 포함)를 그리면 폭 경계 접두가 붙은 칸 나눔·쌓임·폭 클래스가 없다', async () => {
    renderPay()
    const table = await screen.findByRole('table', { name: '이달 급여 표' })
    // ds 단추의 손가락 크기는 앱 공통이라 그대로 있다(검사가 ds 클래스까지 보는지 확인)
    expect(classTokens(document.body)).toContain('max-md:h-11')
    expectPcOnly('이달 급여')
    fireEvent.click(screen.getByRole('button', { name: '항목 고치기' }))
    expect(screen.getByRole('dialog', { name: '지급 항목 고치기' })).toBeTruthy()
    expectPcOnly('항목 고치기')
    fireEvent.click(within(table).getByRole('button', { name: '한지우 조정(±)' }))
    expect(screen.getByRole('dialog', { name: '조정(±) · 한지우 · 11월' })).toBeTruthy()
    expectPcOnly('조정 창')
  })

  it('AC-7611.4: 인센티브(실적·규칙 고치기)·세무사 파일·인건비·명세서도 폭 경계 접두가 붙은 모양 클래스가 없다', async () => {
    renderPay()
    await screen.findByRole('table', { name: '이달 급여 표' })
    fireEvent.click(within(menu()).getByRole('button', { name: '인센티브' }))
    await screen.findByRole('table', { name: '인센티브 실적 표' })
    expectPcOnly('인센티브 실적')
    fireEvent.click(screen.getByRole('button', { name: '인센티브 규칙 고치기' }))
    expect(screen.getByRole('heading', { name: '인센티브 규칙' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: '+ 최민준' }))
    fireEvent.click(within(screen.getByRole('group', { name: '최민준 인센티브 규칙' })).getByRole('button', { name: '+ 항목 더하기' }))
    expectPcOnly('인센티브 규칙')
    await act(async () => {
      fireEvent.click(within(menu()).getByRole('button', { name: '세무사 파일' }))
    })
    expectPcOnly('세무사 파일')
    fireEvent.click(within(menu()).getByRole('button', { name: '인건비' }))
    await screen.findByRole('table', { name: '사람별 지급 합계 표' })
    expectPcOnly('인건비')
    fireEvent.click(within(menu()).getByRole('button', { name: '명세서' }))
    expect(await screen.findByRole('group', { name: '사람 고르기' })).toBeTruthy()
    expectPcOnly('명세서')
  })
})
