// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { guardPage } from '@/lib/auth/guard.server'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import LocationPage, { dynamic, metadata } from './page'

// /location 입지 분석 페이지 (spec location TASK-44 · AC-7901.2·AC-7901.3, design.md 14절 page.tsx).
// 화면 자체는 components/location/LocationScreen 시험이 본다. 여기서는 그리기 전에 문지기를 '/location'으로 부르는지,
// 탭 이름이 '입지 분석'인지, 주소의 tab(일곱 가운데)·c(uuid)만 화면으로 넘기는지 본다
const { LocationScreen } = vi.hoisted(() => ({
  LocationScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/location/LocationScreen', () => ({ LocationScreen }))
vi.mock('@/lib/auth/guard.server', () => ({ guardPage: vi.fn() }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/location/page.tsx'), 'utf8')
const UUID = '11111111-1111-4111-8111-111111111111'
const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'admin@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}
const ME: Me = { email: 'admin@example.com', hospital: HOSPITAL, isAdmin: true }

type Query = { tab?: string | string[]; c?: string | string[] }
async function propsFor(query: Query) {
  render(await LocationPage({ searchParams: Promise.resolve(query) }))
  expect(LocationScreen).toHaveBeenCalledTimes(1)
  return LocationScreen.mock.calls[0]![0]
}

beforeEach(() => {
  LocationScreen.mockClear()
  vi.mocked(guardPage).mockReset()
  vi.mocked(guardPage).mockResolvedValue(ME)
})
afterEach(() => cleanup())

describe('/location 페이지 (AC-7901.2 · AC-7901.3)', () => {
  it('AC-7901.2: 탭 이름(metadata.title)은 입지 분석이고, 요청마다 그린다(force-dynamic)', () => {
    expect(metadata.title).toBe('입지 분석')
    expect(dynamic).toBe('force-dynamic')
  })

  it("AC-7901.2: 그리기 전에 guardPage('/location')을 부른다(관리자가 아니면 문지기가 다른 곳으로 보낸다)", async () => {
    await propsFor({})
    expect(guardPage).toHaveBeenCalledWith('/location')
    expect(guardPage).toHaveBeenCalledTimes(1)
    expect(SOURCE).toMatch(/await guardPage\('\/location'\)/)
  })

  it('AC-7901.2: 문지기가 던지면(다른 곳으로 보냄) 화면을 그리지 않는다', async () => {
    vi.mocked(guardPage).mockRejectedValueOnce(new Error('NEXT_REDIRECT /dashboard'))
    await expect(LocationPage({ searchParams: Promise.resolve({ tab: 'scan' }) })).rejects.toThrow('NEXT_REDIRECT')
    expect(LocationScreen).not.toHaveBeenCalled()
  })

  it.each(['scan', 'detail', 'listings', 'compare', 'prep', 'sources', 'report'])('AC-7901.3: tab=%s는 그대로 넘긴다', async (t) => {
    expect(await propsFor({ tab: t })).toEqual({ tab: t, hospitalName: '가나 정형외과의원' })
  })

  it('AC-7901.3: c는 uuid 모양일 때만 넘긴다(있는 후보인지는 화면이 본다)', async () => {
    expect(await propsFor({ tab: 'detail', c: UUID })).toEqual({ tab: 'detail', candidateId: UUID, hospitalName: '가나 정형외과의원' })
  })

  it.each<[string, Query]>([
    ['틀린 탭', { tab: 'plan' }],
    ['탭이 여럿', { tab: ['scan', 'detail'] }],
    ['빈 탭', { tab: '' }],
    ['uuid가 아닌 c', { c: 'abc' }],
    ['c가 여럿', { c: [UUID, UUID] }],
  ])('AC-7901.3: %s은 버린다(기본으로 연다)', async (_name, query) => {
    expect(await propsFor(query)).toEqual({ hospitalName: '가나 정형외과의원' })
  })

  it('AC-7901.3: 병원 정보가 없으면 병원 이름도 넘기지 않는다', async () => {
    vi.mocked(guardPage).mockResolvedValue({ ...ME, hospital: null })
    expect(await propsFor({})).toEqual({})
  })
})
