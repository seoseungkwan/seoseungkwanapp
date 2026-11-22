import { beforeEach, describe, expect, it, vi } from 'vitest'

// 입지 분석 서버 경로의 관리자 확인(specs/location REQ-7903 AC-7903.1, design.md 3절).
// readMe는 가짜다(실제 Supabase에 붙지 않는다). 로그인 안 함 401, 승인된 병원 + admins 줄 + 데스크 아님이 아니면 403. 둘 다 몸통 없음
const mocks = vi.hoisted(() => ({ readMe: vi.fn() }))
vi.mock('@/lib/auth/hospital.server', () => {
  class NotSignedInError extends Error {}
  class HospitalReadError extends Error {}
  return { readMe: mocks.readMe, NotSignedInError, HospitalReadError }
})

import { HospitalReadError, NotSignedInError } from '@/lib/auth/hospital.server'
import { emptyReply, guardAdmin, jsonReply } from './guard'

// 지어낸 병원
const hospital = (status: 'pending' | 'approved' | 'rejected') => ({
  id: 'hosp-7f3a',
  name: '가나정형외과의원',
  applicantName: '김원장',
  phone: null,
  email: 'clinic@ga.na',
  status,
  createdAt: '2026-10-01T00:00:00Z',
})
const ADMIN = { email: 'admin@ga.na', hospital: hospital('approved'), isAdmin: true }

beforeEach(() => {
  mocks.readMe.mockReset()
})

async function expectBare(res: Response | null, status: number) {
  expect(res).not.toBeNull()
  if (res === null) return
  expect(res.status).toBe(status)
  expect(await res.text()).toBe('')
  expect(res.headers.get('cache-control')).toBe('no-store')
}

describe('AC-7903.1 관리자 확인', () => {
  it('AC-7903.1: 승인된 병원의 관리자(admins 줄)면 통과한다(null)', async () => {
    mocks.readMe.mockResolvedValue(ADMIN)
    expect(await guardAdmin()).toBeNull()
    expect(mocks.readMe).toHaveBeenCalledTimes(1)
  })

  it('AC-7903.1: 로그인 안 함은 401, 몸통 없음', async () => {
    mocks.readMe.mockRejectedValue(new NotSignedInError('로그인하지 않았어요'))
    await expectBare(await guardAdmin(), 401)
  })

  it('AC-7903.1: 관리자 아님·승인 대기·거절·병원 없음·데스크는 403, 몸통 없음', async () => {
    const denied = [
      { email: 'owner@ga.na', hospital: hospital('approved'), isAdmin: false },
      { email: 'admin@ga.na', hospital: hospital('pending'), isAdmin: true },
      { email: 'admin@ga.na', hospital: hospital('rejected'), isAdmin: true },
      { email: 'admin@ga.na', hospital: null, isAdmin: true },
      { email: 'new@ga.na', hospital: null, isAdmin: false },
      { email: 'desk@ga.na', hospital: null, isAdmin: false, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } },
      // 어긋난 줄이라도 데스크 표시가 있으면 막는다
      { ...ADMIN, desk: { hospitalId: 'hosp-7f3a', hospitalName: '가나정형외과의원' } },
    ]
    for (const me of denied) {
      mocks.readMe.mockResolvedValueOnce(me)
      await expectBare(await guardAdmin(), 403)
    }
  })

  it('AC-7903.1: 병원·관리자 줄을 읽지 못하면 500, 몸통 없음(오류 글을 내보내지 않는다)', async () => {
    mocks.readMe.mockRejectedValue(new HospitalReadError('관리자 여부를 읽지 못했어요: permission denied for table admins'))
    const res = await guardAdmin()
    await expectBare(res, 500)
    mocks.readMe.mockRejectedValue(new Error('fetch failed'))
    await expectBare(await guardAdmin(), 500)
  })
})

describe('AC-7903.4 답 머리', () => {
  it('AC-7903.4: 몸통 없는 답과 JSON 답 모두 Cache-Control: no-store다', async () => {
    const bare = emptyReply(400)
    expect(bare.status).toBe(400)
    expect(await bare.text()).toBe('')
    expect(bare.headers.get('cache-control')).toBe('no-store')

    const json = jsonReply({ ok: false, code: 'failed' })
    expect(json.status).toBe(200)
    expect(json.headers.get('cache-control')).toBe('no-store')
    expect(json.headers.get('content-type')).toMatch(/^application\/json/)
    expect(await json.json()).toEqual({ ok: false, code: 'failed' })
  })
})
