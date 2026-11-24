import { describe, expect, it } from 'vitest'
import { SIDO_LIST } from '@/lib/admin/region'
import type { AdminMark, Application } from '@/lib/auth/admin'
import type { ViewHospital, ViewLogRow } from '@/lib/auth/adminView'
import {
  adminBadgeOf,
  adminDoneMessage,
  adminRoleOf,
  appliedOn,
  countByTab,
  doneMessage,
  EMPTY,
  isMine,
  newestFirst,
  phoneText,
  REGION_CHOICES,
  regionDoneMessage,
  regionOfRow,
  rowsOf,
  TABS,
  viewedAt,
  viewTitle,
  withAdmin,
  withRegion,
  withStatus,
} from './applications'

// 관리자 화면의 순수 계산 (REQ-007, design.md '인터페이스' components/admin/applications.ts).
// 문구는 ui-90 시안 말투(~요, REQ-417 AC-417.1). 탭·칸·순서는 목업 docs/mockups/auth/Admin.dc.html

const row = (id: string, name: string, status: Application['status'], createdAt: string): Application => ({
  id,
  name,
  applicantName: '홍길동',
  phone: null,
  email: `${id}@example.com`,
  status,
  createdAt,
  emr: 'bit',
})
// DB가 신청일 내림차순으로 준 순서
const ROWS: Application[] = [
  row('r1', '가나 정형외과의원', 'pending', '2026-10-28T01:00:00+00:00'),
  row('r2', '다라 통증의학과의원', 'pending', '2026-10-26T16:30:00+00:00'),
  row('r4', '사아 의원', 'rejected', '2026-10-22T03:00:00+00:00'),
  row('r3', '마바 정형외과의원', 'approved', '2026-10-20T03:00:00+00:00'),
]

describe('화면 안 탭', () => {
  it('AC-007.1: 탭은 대기·승인·거절 순서이고 처음 탭(맨 앞)은 대기다', () => {
    expect(TABS.map((t) => [t.key, t.label])).toEqual([
      ['pending', '대기'],
      ['approved', '승인'],
      ['rejected', '거절'],
    ])
  })

  it('AC-007.1: countByTab — 탭마다 줄 수', () => {
    expect(countByTab(ROWS)).toEqual({ pending: 2, approved: 1, rejected: 1 })
    expect(countByTab([])).toEqual({ pending: 0, approved: 0, rejected: 0 })
  })

  it('AC-007.1: rowsOf — 그 탭 상태의 줄만, 받은 순서(신청일 내림차순) 그대로', () => {
    expect(rowsOf(ROWS, 'pending').map((r) => r.id)).toEqual(['r1', 'r2'])
    expect(rowsOf(ROWS, 'approved').map((r) => r.id)).toEqual(['r3'])
    expect(rowsOf(ROWS, 'rejected').map((r) => r.id)).toEqual(['r4'])
  })
})

describe('표 칸 글자', () => {
  it('AC-007.1: 신청일은 한국 날짜 YYYY-MM-DD(DB 시각은 UTC)', () => {
    expect(appliedOn('2026-10-28T01:00:00+00:00')).toBe('2026-10-28')
    expect(appliedOn('2026-10-26T16:30:00+00:00')).toBe('2026-10-27') // 한국 10월 27일 01:30
    expect(appliedOn('2026-10-26T14:59:59Z')).toBe('2026-10-26')
  })

  it('AC-007.1: 연락처는 목업처럼 끊어 보이고(02는 서울 번호), 비었으면 "—"', () => {
    expect(phoneText('01000001234')).toBe('010-0000-1234')
    expect(phoneText('0311234567')).toBe('031-123-4567')
    expect(phoneText('0212345678')).toBe('02-1234-5678')
    expect(phoneText('021234567')).toBe('02-123-4567')
    expect(phoneText(null)).toBe('—')
    expect(phoneText('')).toBe('—')
  })
})

describe('상태 바꾼 뒤', () => {
  it('AC-007.2: withStatus — 그 줄만 새 상태로 바꾼 새 목록(받은 목록은 그대로), 순서는 그대로', () => {
    const before = structuredClone(ROWS)
    const after = withStatus(ROWS, 'r1', 'approved')
    expect(ROWS).toEqual(before)
    expect(after).not.toBe(ROWS)
    expect(after.map((r) => [r.id, r.status])).toEqual([
      ['r1', 'approved'],
      ['r2', 'pending'],
      ['r4', 'rejected'],
      ['r3', 'approved'],
    ])
    expect(countByTab(after)).toEqual({ pending: 1, approved: 2, rejected: 1 })
    expect(after[1]).toBe(ROWS[1]) // 다른 줄은 같은 값
  })

  it('AC-007.3·AC-007.4: withStatus — 거절·되돌리기도 같은 방법, 없는 id면 아무 줄도 바뀌지 않는다', () => {
    expect(rowsOf(withStatus(ROWS, 'r2', 'rejected'), 'rejected').map((r) => r.id)).toEqual(['r2', 'r4'])
    expect(rowsOf(withStatus(ROWS, 'r4', 'pending'), 'pending').map((r) => r.id)).toEqual(['r1', 'r2', 'r4'])
    expect(withStatus(ROWS, 'nope', 'approved')).toEqual(ROWS)
  })

  it('AC-007.2·AC-417.1: doneMessage(승인) — "○○ 신청을 승인했어요."', () => {
    expect(doneMessage('가나 정형외과의원', 'approved')).toBe('가나 정형외과의원 신청을 승인했어요.')
  })

  it('AC-007.3·AC-417.1: doneMessage(거절) — "○○ 신청을 거절했어요."', () => {
    expect(doneMessage('다라 통증의학과의원', 'rejected')).toBe('다라 통증의학과의원 신청을 거절했어요.')
  })

  it('AC-007.4·AC-417.1: doneMessage(되돌리기) — "○○ 신청을 대기로 되돌렸어요."', () => {
    expect(doneMessage('사아 의원', 'pending')).toBe('사아 의원 신청을 대기로 되돌렸어요.')
  })
})

describe('빈 탭 안내', () => {
  it('AC-007.5·AC-417.1: 탭마다 빈 탭 안내(제목·한 줄), 말끝은 "~요"', () => {
    expect(EMPTY).toEqual({
      pending: { title: '대기 중인 신청이 없어요', body: '새 가입 신청이 오면 여기에 보여요.' },
      approved: { title: '승인한 신청이 없어요', body: '승인한 계정이 여기에 모여요.' },
      rejected: { title: '거절한 신청이 없어요', body: '거절한 신청은 여기에서 되돌릴 수 있어요.' },
    })
  })

  it('AC-417.1: 빈 탭 안내·완료 알림 글에 "니다."·"병원 이름" 글자가 없다', () => {
    const texts = [
      ...Object.values(EMPTY).flatMap((e) => [e.title, e.body]),
      ...TABS.map((t) => doneMessage('가나 정형외과의원', t.key)),
    ]
    expect(texts).toHaveLength(9)
    for (const text of texts) expect(text).not.toMatch(/니다|병원 이름/)
  })
})

// multi-admin: '승인' 탭 관리자 표시(design.md ''승인' 탭 화면'). 표시는 admin_hospitals()의 is_me·is_owner(DB)로만 안다
describe('관리자 표시 (multi-admin)', () => {
  // 주 관리자(h5, 내 병원)가 볼 때: 다른 관리자 h3
  const OWNER_VIEW: AdminMark[] = [
    { hospitalId: 'h5', mine: true, owner: true },
    { hospitalId: 'h3', mine: false, owner: false },
  ]
  // 다른 관리자(h3, 내 병원)가 볼 때: 주 관리자 h5
  const OTHER_VIEW: AdminMark[] = [
    { hospitalId: 'h5', mine: false, owner: true },
    { hospitalId: 'h3', mine: true, owner: false },
  ]

  it("AC-7703.3: adminRoleOf — 내 병원 'mine'(주 관리자 자신 포함), 그 밖의 주 관리자 병원 'owner', 다른 관리자 'admin', 아니면 'none'", () => {
    expect(adminRoleOf(OWNER_VIEW, 'h5')).toBe('mine')
    expect(adminRoleOf(OWNER_VIEW, 'h3')).toBe('admin')
    expect(adminRoleOf(OWNER_VIEW, 'h1')).toBe('none')
    expect(adminRoleOf(OTHER_VIEW, 'h5')).toBe('owner')
    expect(adminRoleOf(OTHER_VIEW, 'h3')).toBe('mine')
    expect(adminRoleOf([], 'h1')).toBe('none')
  })

  it("AC-7703.3: adminBadgeOf — 주 관리자 병원 '주 관리자', 그 밖의 관리자 병원(내 줄 포함) '관리자', 아니면 null", () => {
    expect(adminBadgeOf(OWNER_VIEW, 'h5')).toBe('주 관리자')
    expect(adminBadgeOf(OWNER_VIEW, 'h3')).toBe('관리자')
    expect(adminBadgeOf(OTHER_VIEW, 'h5')).toBe('주 관리자')
    expect(adminBadgeOf(OTHER_VIEW, 'h3')).toBe('관리자')
    expect(adminBadgeOf(OWNER_VIEW, 'h1')).toBeNull()
    expect(adminBadgeOf([], 'h1')).toBeNull()
  })

  it('AC-7704.3: withAdmin(정함) — 없으면 { hospitalId, mine: false, owner: false }를 끝에 더한 새 목록, 받은 목록은 그대로', () => {
    const before = structuredClone(OWNER_VIEW)
    const after = withAdmin(OWNER_VIEW, 'h1', true)
    expect(OWNER_VIEW).toEqual(before)
    expect(after).not.toBe(OWNER_VIEW)
    expect(after).toEqual([...OWNER_VIEW, { hospitalId: 'h1', mine: false, owner: false }])
    expect(adminRoleOf(after, 'h1')).toBe('admin')
    expect(adminBadgeOf(after, 'h1')).toBe('관리자')
  })

  it('AC-7704.3: withAdmin(정함) — 이미 관리자면 같은 줄들의 새 목록(둘이 되지 않는다)', () => {
    const after = withAdmin(OWNER_VIEW, 'h3', true)
    expect(after).not.toBe(OWNER_VIEW)
    expect(after).toEqual(OWNER_VIEW)
  })

  it('AC-7704.3: withAdmin(뺌) — 그 병원 줄만 뺀 새 목록, 받은 목록은 그대로. 없는 병원이면 같은 줄들', () => {
    const before = structuredClone(OWNER_VIEW)
    const after = withAdmin(OWNER_VIEW, 'h3', false)
    expect(OWNER_VIEW).toEqual(before)
    expect(after).not.toBe(OWNER_VIEW)
    expect(after).toEqual([{ hospitalId: 'h5', mine: true, owner: true }])
    expect(adminRoleOf(after, 'h3')).toBe('none')
    expect(adminBadgeOf(after, 'h3')).toBeNull()
    const same = withAdmin(OWNER_VIEW, 'h1', false)
    expect(same).not.toBe(OWNER_VIEW)
    expect(same).toEqual(OWNER_VIEW)
  })

  it("AC-7704.3: adminDoneMessage — '{의원 이름} 계정을 관리자로 정했어요.' / '{의원 이름} 계정을 관리자에서 뺐어요.'", () => {
    expect(adminDoneMessage('바른정형외과의원', true)).toBe('바른정형외과의원 계정을 관리자로 정했어요.')
    expect(adminDoneMessage('새봄재활의학과의원', false)).toBe('새봄재활의학과의원 계정을 관리자에서 뺐어요.')
    for (const admin of [true, false]) expect(adminDoneMessage('가나 정형외과의원', admin)).not.toMatch(/니다|병원 이름/)
  })
})

// admin-view: '승인' 탭 이름 눌러 보기·지역 칸·본 기록의 순수 계산 (REQ-8012, design.md '관리자 화면'·'지역'·기본값 11~14).
// 자료는 지어낸 값이다(의원 이름·가짜 주소). 지역 값은 lib/admin/region.ts(regionOf·roParticle)를 부르기만 한다
const view = (hospitalId: string, over: Partial<ViewHospital> = {}): ViewHospital => ({
  hospitalId,
  name: `${hospitalId} 의원`,
  address: null,
  regionSet: false,
  region: null,
  mine: false,
  ...over,
})

describe('AC-8012.1 이름 눌러 보기', () => {
  it("AC-8012.1: viewTitle — 마우스 글 '{의원 이름} 화면 보기 (읽기만)'", () => {
    expect(viewTitle('다라 정형외과의원')).toBe('다라 정형외과의원 화면 보기 (읽기만)')
  })

  it('AC-8012.1: isMine — 보기 목록(admin_view_hospitals is_me)이나 관리자 표시(admin_hospitals is_me)가 내 줄이라 하면 내 줄', () => {
    const views = [view('h1'), view('h5', { mine: true })]
    expect(isMine(views, [], 'h5')).toBe(true)
    expect(isMine(views, [], 'h1')).toBe(false)
    expect(isMine([], [{ hospitalId: 'h3', mine: true, owner: false }], 'h3')).toBe(true)
    expect(isMine([], [{ hospitalId: 'h3', mine: false, owner: true }], 'h3')).toBe(false)
    expect(isMine([], [], 'h9')).toBe(false) // 두 목록에 없는 줄(이 화면에서 막 승인한 줄)은 내 줄이 아니다
  })
})

describe('AC-8012.2 지역 칸', () => {
  it('AC-8012.2: REGION_CHOICES — 고르기는 17개(SIDO_LIST 차례) + 지역 모름(null) 맨 끝', () => {
    expect(REGION_CHOICES).toEqual([...SIDO_LIST.map((sido) => ({ value: sido, label: sido })), { value: null, label: '지역 모름' }])
    expect(REGION_CHOICES).toHaveLength(18)
  })

  it('AC-8012.2: regionOfRow — 관리자가 정한 지역 → 주소에서 읽은 시·도 → 모름(null)', () => {
    const views = [
      view('set', { address: '서울특별시 가짜구 가짜로 1', regionSet: true, region: '부산' }), // 정한 값이 주소보다 먼저
      view('unknown', { address: '서울특별시 가짜구 가짜로 1', regionSet: true, region: null }), // '지역 모름'으로 정함
      view('address', { address: '경기도 예시시 예시로 45' }),
      view('blank', { address: null }),
      view('gwangju', { address: '광주시 예시로 1' }), // 경기 광주시와 헷갈림 → 모름
    ]
    expect(regionOfRow(views, 'set')).toBe('부산')
    expect(regionOfRow(views, 'unknown')).toBeNull()
    expect(regionOfRow(views, 'address')).toBe('경기')
    expect(regionOfRow(views, 'blank')).toBeNull()
    expect(regionOfRow(views, 'gwangju')).toBeNull()
    expect(regionOfRow(views, 'missing')).toBeNull() // 목록에 없는 줄
  })

  it('AC-8012.2: withRegion — 그 줄만 정한 값(regionSet 참)으로 바꾼 새 목록, 받은 목록은 그대로. 목록에 없던 줄은 끝에 더한다', () => {
    const views = [view('h1', { address: '서울 가짜구 가짜로 1' }), view('h2', { regionSet: true, region: '대전' })]
    const before = structuredClone(views)
    const after = withRegion(views, 'h1', '부산')
    expect(views).toEqual(before)
    expect(after).not.toBe(views)
    expect(after[0]).toEqual({ ...views[0], regionSet: true, region: '부산' })
    expect(after[1]).toBe(views[1])
    expect(regionOfRow(after, 'h1')).toBe('부산')
    expect(regionOfRow(withRegion(views, 'h2', null), 'h2')).toBeNull() // '지역 모름'으로 정함
    const added = withRegion(views, 'h9', '제주')
    expect(added).toHaveLength(3)
    expect(regionOfRow(added, 'h9')).toBe('제주')
    expect(isMine(added, [], 'h9')).toBe(false)
  })

  it("AC-8012.2: regionDoneMessage — '{의원 이름} 지역을 {지역}로/으로 바꿨어요.' 받침 없음·ㄹ 받침 → 로, 그 밖 받침·지역 모름 → 으로", () => {
    expect(regionDoneMessage('다라 정형외과의원', '부산')).toBe('다라 정형외과의원 지역을 부산으로 바꿨어요.')
    expect(regionDoneMessage('다라 정형외과의원', '경기')).toBe('다라 정형외과의원 지역을 경기로 바꿨어요.')
    expect(regionDoneMessage('다라 정형외과의원', '서울')).toBe('다라 정형외과의원 지역을 서울로 바꿨어요.') // ㄹ 받침
    expect(regionDoneMessage('다라 정형외과의원', '강원')).toBe('다라 정형외과의원 지역을 강원으로 바꿨어요.')
    expect(regionDoneMessage('다라 정형외과의원', null)).toBe('다라 정형외과의원 지역을 지역 모름으로 바꿨어요.')
  })
})

describe('AC-8012.3 본 기록 글', () => {
  it("AC-8012.3: viewedAt — DB 시각(UTC) → 한국 시각 'M월 D일 (요일) HH:mm'(달·날은 앞 0 없음, 시·분은 두 자리)", () => {
    expect(viewedAt('2026-11-24T00:12:00+00:00')).toBe('11월 24일 (화) 09:12')
    expect(viewedAt('2026-11-02T23:55:00Z')).toBe('11월 3일 (화) 08:55')
    expect(viewedAt('2026-11-20T15:00:00Z')).toBe('11월 21일 (토) 00:00')
    expect(viewedAt('2026-11-22T14:59:00Z')).toBe('11월 22일 (일) 23:59')
    expect(viewedAt('2027-01-01T03:04:05.678+09:00')).toBe('1월 1일 (금) 03:04')
  })

  it('AC-8012.3: viewedAt — 읽을 수 없는 시각은 —', () => {
    expect(viewedAt('어제')).toBe('—')
  })

  it('AC-8012.3: newestFirst — 새 것이 위(받은 목록은 그대로), 같은 때는 받은 차례', () => {
    const at = (startedAt: string, hospitalId: string): ViewLogRow => ({ startedAt, viewerName: null, viewerEmail: null, hospitalId, hospitalName: hospitalId })
    const rows = [at('2026-11-23T08:40:00Z', 'b'), at('2026-11-24T09:12:00+09:00', 'a'), at('2026-11-03T02:55:00Z', 'c'), at('2026-11-23T17:40:00+09:00', 'b2')]
    const before = structuredClone(rows)
    const sorted = newestFirst(rows)
    expect(rows).toEqual(before)
    expect(sorted.map((r) => r.hospitalId)).toEqual(['a', 'b', 'b2', 'c'])
  })
})
