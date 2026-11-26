import { describe, expect, it } from 'vitest'
import type { GKind, GLook, GStaff } from '@/lib/calendar/gshapes'
import { DEFAULT_CAL_SETTINGS } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK } from '@/types/gcal'
import { kindExamples } from './kindExamples'

// 시행자·종류 화면 종류 칸의 보기 상자(spec google-link REQ-8552 AC-8552.2, design.md 21-9 · 시안 calendar.html ?s=colors-reread).
// 그 병원 종류 이름으로 보기 제목을 만들고, 결과는 실제 알아보기(lib/calendar/gtitle parseGoogleEvent)가 고른 종류다.
// '이 병원 꼴'(design.md 21-1): 시행자 셋, 종류 아홉(알아볼 글 = 이름, 고정 색 없음), noKind 'fix' · noStaffKinds [] · 색 짐작 켬.
// 차트번호·이름은 시안의 지어낸 값이다

const TODAY = '2026-11-26'
const STAFF: GStaff[] = [
  { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
  { id: 'won', name: '박지원', mark: '원', color: 'banana' },
  { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
]
const kind = (id: string, name: string, len: number): GKind => ({ id, name, len, color: null, words: [name] })
const H_KINDS: GKind[] = [
  kind('d30ho', '도수 30분(호)', 30),
  kind('d30won', '도수 30분(원)', 30),
  kind('d30hyun', '도수 30분(현)', 30),
  kind('d50ho', '도수 50분(호)', 50),
  kind('d50won', '도수 50분(원)', 50),
  kind('d50hyun', '도수 50분(현)', 50),
  kind('s2000', '체외충격파 2000', 15),
  kind('s3000', '체외충격파 3000', 15),
  kind('s4000', '체외충격파 4000', 15),
]
const H_LOOK: GLook = { ...DEFAULT_GCAL_LOOK, noKind: 'fix', noStaffKinds: [], staffByColor: true }

describe('AC-8552.2 kindExamples — 그 병원 종류 이름으로 만든 보기(결과 = 실제 알아보기)', () => {
  it("AC-8552.2: '이 병원 꼴' → 세 줄(길이·표시 든 둘째 종류 · 길이가 다른 첫 종류는 제목에 길이 없이 구글 일정 길이 · 충격파 둘째 종류는 {천})", () => {
    expect(kindExamples(H_KINDS, STAFF, H_LOOK, TODAY)).toEqual([
      { title: '1234 홍길동 30분 도수 (원)', eventLen: null, kind: '도수 30분(원)' },
      { title: '1234 홍길동 도수 (호)', eventLen: 50, kind: '도수 50분(호)' },
      { title: '1234 홍길동(3천', eventLen: null, kind: '체외충격파 3000' },
    ])
  })

  it('AC-8552.2: 이름에 길이·표시·타수가 하나도 없는 병원(지금 기본 종류)은 빈 목록 — 상자가 없다', () => {
    expect(kindExamples(DEFAULT_CAL_SETTINGS.kinds, [...STAFF, { id: 'jang', name: '원장님', mark: '장', color: 'blueberry' }], DEFAULT_GCAL_LOOK, TODAY)).toEqual([])
  })

  it('AC-8552.2: 그 꼴 종류가 하나뿐이면 그것(길이가 다른 종류가 없으면 둘째 줄 없음)', () => {
    const kinds = [kind('d30ho', '도수 30분(호)', 30), kind('visit', '진료', 10), kind('s3000', '체외충격파 3000', 15)]
    expect(kindExamples(kinds, STAFF, H_LOOK, TODAY)).toEqual([
      { title: '1234 홍길동 30분 도수 (호)', eventLen: null, kind: '도수 30분(호)' },
      { title: '1234 홍길동(3천', eventLen: null, kind: '체외충격파 3000' },
    ])
  })

  it('AC-8552.2: 끝 괄호가 시행자 목록 표시가 아니면 그 꼴이 아니다 · 충격파 종류가 아닌 이름의 수는 타수 보기가 아니다', () => {
    const kinds = [kind('d30', '도수 30분(윤)', 30), kind('pack', '찜질 2000', 10), kind('visit', '진료', 10)]
    expect(kindExamples(kinds, STAFF, H_LOOK, TODAY)).toEqual([])
  })

  it('AC-8552.2: 결과는 알아보기가 고른 종류 이름이다(종류 글이 이름과 다르면 그 글로 찾은 종류)', () => {
    // 저장 전 고친 값: 기본 종류의 '도수' 이름만 '도수 30분(호)'로 바꿈(알아볼 글은 '도수' 그대로)
    const kinds = DEFAULT_CAL_SETTINGS.kinds.map((k) => (k.id === 'dosu' ? { ...k, name: '도수 30분(호)' } : k))
    expect(kindExamples(kinds, STAFF, DEFAULT_GCAL_LOOK, TODAY)).toEqual([{ title: '1234 홍길동 30분 도수 (호)', eventLen: null, kind: '도수 30분(호)' }])
  })
})
