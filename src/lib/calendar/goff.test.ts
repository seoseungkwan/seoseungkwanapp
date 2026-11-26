import { describe, expect, it } from 'vitest'
import { composeOffTitle, offDayNames, offEventId, offScope, parseOffTitle } from './goff'
import { fixReasonText, parseGoogleEvent } from './gtitle'
import type { GEvent, GKind, GLook, GStaff, OffLine, OffPerson, ParseCtx } from './gshapes'

// 하루 종일 휴무 줄 'off'(spec google-link REQ-8522, notes-calendar staff·colors). 이름은 시안의 지어낸 원장님·직원이다.
// 'm-' id = 예약 시행자와 이어지지 않은 직원(calendar_off_names, design.md 7-3)

const KIM = 'm-0a0b0c0d0e0f40108a0b0c0d0e0f1011'
const JUNG = 'm-1a1b1c1d1e1f40208a1b1c1d1e1f2021'
const PEOPLE: OffPerson[] = [
  { id: 'jang', name: '원장님' },
  { id: 'ho', name: '정호연' },
  { id: 'won', name: '박지원' },
  { id: 'hyun', name: '이수현' },
  { id: 'hide', name: '한숨김' }, // 병원 정보에는 있지만 예약에 안 보이는 사람
  { id: KIM, name: '김예시' },
  { id: JUNG, name: '정예시' },
]
const VISIBLE = ['jang', 'ho', 'won', 'hyun']

describe('AC-8522.1 composeOffTitle — 새로 든 이름은 앞에, 남은 이름은 지금 차례', () => {
  it("AC-8522.1: 시안 — '정예시 off' + 정호연 → '정호연, 정예시 off'", () => {
    expect(composeOffTitle(['정예시', '정호연'], '정예시 off', 'off', PEOPLE)).toBe('정호연, 정예시 off')
    expect(composeOffTitle(['정호연', '정예시'], '정예시 off', 'off', PEOPLE)).toBe('정호연, 정예시 off')
  })

  it('AC-8522.1: 줄이 없으면 받은 차례대로 새 줄, 남은 이름은 지금 제목 차례 그대로', () => {
    expect(composeOffTitle(['김예시', '박지원'], null, 'off', PEOPLE)).toBe('김예시, 박지원 off')
    expect(composeOffTitle(['김예시', '박지원'], '박지원, 김예시 off', 'off', PEOPLE)).toBe('박지원, 김예시 off')
    expect(composeOffTitle(['이수현', '김예시', '박지원'], '박지원, 김예시 off', 'off', PEOPLE)).toBe('이수현, 박지원, 김예시 off')
  })

  it('AC-8522.1: 휴가를 지운 사람은 빼고, 아무도 없으면 빈 글(줄 지움)', () => {
    expect(composeOffTitle(['박지원'], '김예시, 박지원 off', 'off', PEOPLE)).toBe('박지원 off')
    expect(composeOffTitle([], '김예시, 박지원 off', 'off', PEOPLE)).toBe('')
    expect(composeOffTitle([], null, 'off', PEOPLE)).toBe('')
  })

  it('AC-8522.1: 끝 글은 설정 값을 쓰고, 끝 글이 다른 지금 제목은 off 줄로 보지 않는다', () => {
    expect(composeOffTitle(['정호연', '정예시'], '정예시 휴무', '휴무', PEOPLE)).toBe('정호연, 정예시 휴무')
    expect(composeOffTitle(['정호연'], '원장님 학회', 'off', PEOPLE)).toBe('정호연 off')
  })

  it('AC-8522.1: 같은 이름은 한 번만', () => {
    expect(composeOffTitle(['정호연', '정호연'], '정호연 off', 'off', PEOPLE)).toBe('정호연 off')
  })

  it("AC-8522.1: 그날 하루 종일 'off' 줄 이름만(반차·다른 날·종일 메모 빼고), '예약 시행자가 아닌 직원도'가 켜지면 모두", () => {
    const lines: OffLine[] = [
      { day: '2026-11-27', type: 'off', staffId: JUNG, staffName: '정예시', part: null },
      { day: '2026-11-27', type: 'off', staffId: 'ho', staffName: '정호연' },
      { day: '2026-11-27', type: 'off', staffId: 'hyun', staffName: '이수현', part: 'pm' },
      { day: '2026-11-27', type: 'off', staffId: 'hide', staffName: '한숨김', part: null },
      { day: '2026-11-27', type: 'memo', staffId: null, staffName: null },
      { day: '2026-11-28', type: 'off', staffId: 'won', staffName: '박지원' },
    ]
    const all = offScope(PEOPLE, true, VISIBLE)
    expect(offDayNames(lines, '2026-11-27', all)).toEqual(['정예시', '정호연', '한숨김'])
    expect(composeOffTitle(offDayNames(lines, '2026-11-27', all), '정예시 off', 'off', all)).toBe('정호연, 한숨김, 정예시 off')
  })

  it("AC-8522.1: '예약 시행자가 아닌 직원도'가 꺼지면 이어지지 않은 직원('m-')·예약에 안 보이는 사람을 뺀다", () => {
    const scope = offScope(PEOPLE, false, VISIBLE)
    expect(scope.map((p) => p.id)).toEqual(VISIBLE)
    const lines: OffLine[] = [
      { day: '2026-11-27', type: 'off', staffId: JUNG, staffName: '정예시', part: null },
      { day: '2026-11-27', type: 'off', staffId: 'ho', staffName: '정호연', part: null },
      { day: '2026-11-27', type: 'off', staffId: 'hide', staffName: '한숨김', part: null },
    ]
    expect(offDayNames(lines, '2026-11-27', scope)).toEqual(['정호연'])
    // 웹앱이 맡지 않는 사람이 구글 줄에 있으면 목록 밖 이름처럼 그 자리에 남긴다
    expect(composeOffTitle(offDayNames(lines, '2026-11-27', scope), '정예시 off', 'off', scope)).toBe('정호연, 정예시 off')
  })

  it('AC-8522.1: 이름은 목록(calendar_off_names) 이름을 쓰고, 목록 밖 사람의 줄은 넣지 않는다', () => {
    const lines: OffLine[] = [
      { day: '2026-11-27', type: 'off', staffId: 'ho', staffName: '정호' },
      { day: '2026-11-27', type: 'off', staffId: 'gone', staffName: '퇴사자' },
    ]
    expect(offDayNames(lines, '2026-11-27', offScope(PEOPLE, true, VISIBLE))).toEqual(['정호연'])
  })
})

describe('AC-8522.2 parseOffTitle·parseGoogleEvent — 하루 종일 off 줄 읽기', () => {
  it("AC-8522.2: '김예시, 박지원 off' → 목록과 맞춘 사람들", () => {
    expect(parseOffTitle('김예시, 박지원 off', 'off', PEOPLE)).toEqual({
      people: [
        { id: KIM, name: '김예시' },
        { id: 'won', name: '박지원' },
      ],
      unknown: [],
    })
    expect(parseOffTitle('김예시,박지원 off', 'off', PEOPLE)?.people.map((p) => p.name)).toEqual(['김예시', '박지원'])
  })

  it('AC-8522.2: 못 찾은 이름은 unknown, 끝 글이 off가 아니면 off 줄이 아니다', () => {
    expect(parseOffTitle('최호 off', 'off', PEOPLE)).toEqual({ people: [], unknown: ['최호'] })
    expect(parseOffTitle('정예시, 최호 off', 'off', PEOPLE)).toEqual({ people: [{ id: JUNG, name: '정예시' }], unknown: ['최호'] })
    expect(parseOffTitle('원장님 학회', 'off', PEOPLE)).toBeNull()
    expect(parseOffTitle('김예시 offline', 'off', PEOPLE)).toBeNull()
  })

  const STAFF: GStaff[] = [{ id: 'ho', name: '정호연', mark: '호', color: 'lavender' }]
  const KINDS: GKind[] = [{ id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] }]
  const LOOK: GLook = {
    cancel: 'tomato',
    change: 'graphite',
    offWord: 'off',
    offColor: 'grape',
    noKind: 'dosu',
    staffByColor: true,
    noStaffKinds: [],
    titleLen: true,
    titleMemo: true,
  }
  const CTX: ParseCtx = { staff: STAFF, kinds: KINDS, look: LOOK, people: PEOPLE, arrival: 'off', linkedOn: '2026-11-23' }
  const allDay = (summary: string, start: string, end: string): GEvent => ({
    id: 'evtoff01',
    status: 'confirmed',
    summary,
    description: '',
    allDay: true,
    start,
    end,
    colorId: '3',
    updated: '2026-11-26T05:00:00.000Z',
    recurring: false,
  })

  it('AC-8522.2: 하루 종일 off 일정은 날마다(끝 날은 빼고) 그 사람들의 휴무다', () => {
    expect(parseGoogleEvent(allDay('김예시, 박지원 off', '2026-11-24', '2026-11-25'), CTX)).toEqual({
      type: 'off',
      past: false,
      days: ['2026-11-24'],
      people: [
        { id: KIM, name: '김예시' },
        { id: 'won', name: '박지원' },
      ],
    })
    const multi = parseGoogleEvent(allDay('정호연 off', '2026-11-30', '2026-12-03'), CTX)
    expect(multi.type === 'off' && multi.days).toEqual(['2026-11-30', '2026-12-01', '2026-12-02'])
  })

  it("AC-8522.2: 못 찾은 이름은 off-name 고쳐야 함('{최호}'를 원장님·직원 목록에서 찾지 못했어요)", () => {
    const p = parseGoogleEvent(allDay('최호 off', '2026-11-25', '2026-11-26'), CTX)
    expect(p).toMatchObject({ type: 'fix', fix: { reason: 'off-name', allDay: true, day: '2026-11-25', days: ['2026-11-25'], gColor: 'grape' } })
    expect(p.type === 'fix' && p.fix.guess.needs).toEqual(['person'])
    expect(p.type === 'fix' && fixReasonText(p.fix)).toBe("'최호'를 원장님·직원 목록에서 찾지 못했어요")
  })

  it('AC-8522.2: 끝 글이 off가 아닌 하루 종일 일정은 종일 메모(20자)다', () => {
    expect(parseGoogleEvent(allDay('원장님 학회', '2026-11-25', '2026-11-26'), CTX)).toEqual({ type: 'memo', past: false, days: ['2026-11-25'], memo: '원장님 학회' })
    const long = parseGoogleEvent(allDay('물리치료실 소독과 장비 점검 날이에요 오후', '2026-11-28', '2026-11-29'), CTX)
    expect(long.type === 'memo' && long.memo).toBe('물리치료실 소독과 장비 점검 날이에요')
    expect(long.type === 'memo' && [...long.memo].length).toBeLessThanOrEqual(20)
  })

  it('AC-8522.2: 이은 날 전 하루 종일 일정은 지난 것이다', () => {
    expect(parseGoogleEvent(allDay('정예시 off', '2026-11-21', '2026-11-22'), CTX)).toMatchObject({ type: 'off', past: true })
  })
})

describe('AC-8522.3 composeOffTitle — 목록 밖 이름은 지우지 않는다', () => {
  it('AC-8522.3: 구글에서 직접 적은 목록 밖 이름은 지금 차례 그대로 남기고, 목록 사람만 더하거나 뺀다', () => {
    expect(composeOffTitle([], '최호, 정예시 off', 'off', PEOPLE)).toBe('최호 off')
    expect(composeOffTitle(['정호연'], '최호, 정예시 off', 'off', PEOPLE)).toBe('정호연, 최호 off')
    expect(composeOffTitle(['정예시', '박지원'], '최호, 정예시 off', 'off', PEOPLE)).toBe('박지원, 최호, 정예시 off')
    expect(composeOffTitle(['정예시'], '정예시, 최호 off', 'off', PEOPLE)).toBe('정예시, 최호 off')
  })
})

describe('AC-8522.1 offEventId — sskoff + 병원 id 32자 + YYYYMMDD', () => {
  it('AC-8522.1: 구글 일정 id 글자(base32hex: 0-9 a-v)만 쓴다', () => {
    const id = offEventId('0B1C2D3E-4F50-4a6b-8c7d-9e0f1a2b3c4d', '2026-11-27')
    expect(id).toBe('sskoff0b1c2d3e4f504a6b8c7d9e0f1a2b3c4d20261127')
    expect(id).toMatch(/^[0-9a-v]+$/)
    expect(id).toHaveLength(6 + 32 + 8)
  })

  it('AC-8522.1: 같은 병원·같은 날이면 늘 같은 id(두 PC가 함께 보내도 하나)', () => {
    const h = '0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d'
    expect(offEventId(h, '2026-11-27')).toBe(offEventId(h, '2026-11-27'))
    expect(offEventId(h, '2026-11-28')).not.toBe(offEventId(h, '2026-11-27'))
  })

  it('AC-8522.1: 병원 id·날짜 모양이 틀리면 던진다', () => {
    expect(() => offEventId('not-a-uuid', '2026-11-27')).toThrow()
    expect(() => offEventId('0b1c2d3e-4f50-4a6b-8c7d-9e0f1a2b3c4d', '2026-13-01')).toThrow()
  })
})
