// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Hospital, Me } from '@/lib/auth/hospital.server'
import { currentMe } from '../currentMe.server'
import LibraryPage, { dynamic, metadata } from './page'

// /library 자료실 페이지 (spec library AC-8105.1·AC-8105.7·AC-8106.1, design.md '화면' page.tsx). 화면 자체는 components/library 시험이 본다.
// 여기서는 탭 이름이 '자료실'인지, 요청마다 그리는지, 앱 틀과 같은 요청 캐시(currentMe — 새 DB 읽기 없음)로 관리자인지만 화면에 넘기는지 본다.
// 관리자 = admins 줄이 있고 승인된 병원 줄이 있는 사람. 관리자가 아닌 원장·데스크(병원 줄 없음)는 거짓이다. 문지기와 앱 틀은 (app)/layout이 준다
const { LibraryScreen } = vi.hoisted(() => ({
  LibraryScreen: vi.fn<(props: Record<string, unknown>) => null>(() => null),
}))
vi.mock('@/components/library/LibraryScreen', () => ({ LibraryScreen }))
vi.mock('../currentMe.server', () => ({ currentMe: vi.fn() }))

const SOURCE = readFileSync(join(process.cwd(), 'src/app/(app)/library/page.tsx'), 'utf8')
const HOSPITAL: Hospital = {
  id: 'h1',
  name: '가나 정형외과의원',
  applicantName: '홍길동',
  phone: null,
  email: 'owner@example.com',
  status: 'approved',
  createdAt: '2026-10-28T01:23:45+00:00',
}

async function propsFor(me: Me) {
  vi.mocked(currentMe).mockResolvedValue(me)
  render(await LibraryPage())
  expect(LibraryScreen).toHaveBeenCalledTimes(1)
  return LibraryScreen.mock.calls[0]![0]
}

beforeEach(() => {
  LibraryScreen.mockClear()
  vi.mocked(currentMe).mockReset()
})
afterEach(() => cleanup())

describe('/library 페이지 (AC-8105.1)', () => {
  it('AC-8105.1: 탭 이름(metadata.title)은 자료실이고, 요청마다 그린다(force-dynamic)', () => {
    expect(metadata.title).toBe('자료실')
    expect(dynamic).toBe('force-dynamic')
  })

  it('AC-8105.1: 준비 중 화면이 아니라 자료실 화면(LibraryScreen)을 그린다', async () => {
    await propsFor({ email: 'owner@example.com', hospital: HOSPITAL, isAdmin: false })
    expect(SOURCE).not.toMatch(/NotReadyScreen|notReadyFeature/)
    expect(SOURCE).toMatch(/from '@\/components\/library\/LibraryScreen'/)
  })

  it('AC-8106.1: 승인된 병원 줄이 있는 관리자는 isAdmin 참이다', async () => {
    expect(await propsFor({ email: 'admin@example.com', hospital: HOSPITAL, isAdmin: true })).toEqual({ isAdmin: true })
  })

  it.each<[string, Me]>([
    ['관리자가 아닌 원장', { email: 'owner@example.com', hospital: HOSPITAL, isAdmin: false }],
    ['데스크(병원 줄 없음)', { email: 'desk@example.com', hospital: null, isAdmin: false, desk: { hospitalId: 'h1', hospitalName: '가나 정형외과의원' } }],
    ['승인 전 병원의 관리자 줄', { email: 'admin@example.com', hospital: { ...HOSPITAL, status: 'pending' }, isAdmin: true }],
  ])('AC-8105.7: %s는 isAdmin 거짓이다', async (_who, me) => {
    expect(await propsFor(me)).toEqual({ isAdmin: false })
  })

  it('AC-8105.1: 문지기 값은 앱 틀과 같은 요청 캐시(currentMe)로만 읽는다 — 병원 id·다른 값은 넘기지 않는다', async () => {
    await propsFor({ email: 'admin@example.com', hospital: HOSPITAL, isAdmin: true })
    expect(currentMe).toHaveBeenCalledTimes(1)
    expect(SOURCE).toMatch(/from '\.\.\/currentMe\.server'/)
    expect(SOURCE).not.toMatch(/guardPage|supabase|hospitalId/)
  })

  it('AC-8105.1: currentMe가 던지면(문지기가 다른 곳으로 보냄) 화면을 그리지 않는다', async () => {
    vi.mocked(currentMe).mockRejectedValueOnce(new Error('NEXT_REDIRECT /login'))
    await expect(LibraryPage()).rejects.toThrow('NEXT_REDIRECT')
    expect(LibraryScreen).not.toHaveBeenCalled()
  })
})
