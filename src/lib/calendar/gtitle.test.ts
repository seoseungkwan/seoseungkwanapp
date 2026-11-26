import { describe, expect, it } from 'vitest'
import { apptPaint } from './gpaint'
import { composeOffTitle } from './goff'
import { fixChoices, fixReasonText, formatGoogleTitle, parseGoogleEvent, stripArrival, withArrival } from './gtitle'
import type { GColor, GEvent, GKind, GLook, GParsed, GStaff, OffPerson, ParseCtx, TitleAppt } from './gshapes'

// 구글 제목 알아보기·웹앱 → 구글 제목 꼴(spec google-link design.md 13절·REQ-8520·REQ-8521).
// 시안 설정: 시행자 (호)정호연 라벤더·(원)박지원 바나나·(현)이수현 플라밍고·(장)원장님 블루베리, 충격파 세이지 고정,
// noStaffKinds ['shock'], noKind 도수. 환자 이름·차트번호는 시안의 지어낸 값이다

const ID: Record<GColor, string> = {
  lavender: '1',
  sage: '2',
  grape: '3',
  flamingo: '4',
  banana: '5',
  tangerine: '6',
  peacock: '7',
  graphite: '8',
  blueberry: '9',
  basil: '10',
  tomato: '11',
}
const STAFF: GStaff[] = [
  { id: 'ho', name: '정호연', mark: '호', color: 'lavender' },
  { id: 'won', name: '박지원', mark: '원', color: 'banana' },
  { id: 'hyun', name: '이수현', mark: '현', color: 'flamingo' },
  { id: 'jang', name: '원장님', mark: '장', color: 'blueberry' },
]
const KINDS: GKind[] = [
  { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
  { id: 'jabo', name: '자보도수', len: 30, color: null, words: ['자보도수', '자보'] },
  { id: 'shock', name: '충격파', len: 15, color: 'sage', words: ['충격파', '타'] },
  { id: 'inj', name: '주사', len: 10, color: null, words: ['주사'] },
  { id: 'visit', name: '진료', len: 10, color: null, words: ['진료'] },
]
const LOOK: GLook = {
  cancel: 'tomato',
  change: 'graphite',
  offWord: 'off',
  offColor: 'grape',
  noKind: 'dosu',
  staffByColor: true,
  noStaffKinds: ['shock'],
  titleLen: true,
  titleMemo: true,
}
const PEOPLE: OffPerson[] = [
  { id: 'jang', name: '원장님' },
  { id: 'ho', name: '정호연' },
  { id: 'won', name: '박지원' },
  { id: 'hyun', name: '이수현' },
  { id: 'm-0a0b0c0d0e0f40108a0b0c0d0e0f1011', name: '김예시' },
  { id: 'm-1a1b1c1d1e1f40208a1b1c1d1e1f2021', name: '정예시' },
]
const CTX: ParseCtx = { staff: STAFF, kinds: KINDS, look: LOOK, people: PEOPLE, arrival: 'off', linkedOn: '2026-11-23' }
const FUTURE = '2026-11-26'
const PAST = '2026-11-20'

type Opt = { color?: GColor | null; day?: string; from?: string; to?: string; endDay?: string }
function event(summary: string, o: Opt = {}): GEvent {
  const day = o.day ?? FUTURE
  return {
    id: 'ssk0123456789abcdef0123456789abcdef',
    status: 'confirmed',
    summary,
    description: '',
    allDay: false,
    start: `${day}T${o.from ?? '10:00'}`,
    end: `${o.endDay ?? day}T${o.to ?? '10:30'}`,
    colorId: o.color ? ID[o.color] : null,
    updated: '2026-11-26T05:00:00.000Z',
    recurring: false,
  }
}
const parse = (title: string, o: Opt = {}, ctx: ParseCtx = CTX) => parseGoogleEvent(event(title, o), ctx)

/** 표 칸으로 보기: 차트·이름·종류(어디서)·시행자(어디서)·메모·결과 */
function view(p: GParsed) {
  if (p.type === 'appt') {
    const a = p.appt
    return {
      chart: a.chart,
      name: a.name,
      kind: a.kindId,
      kindBy: a.gHow.kind,
      staff: a.staffId,
      staffBy: a.gHow.staff,
      memo: a.memo,
      result: a.status === 'cancel' ? 'appt+cancel' : a.gMoved ? 'appt+moved' : 'appt',
    }
  }
  if (p.type === 'fix') {
    const g = p.fix.guess
    return { chart: g.chart, name: g.name, kind: g.kindId, kindBy: g.kindBy, staff: g.staffId, staffBy: g.staffBy, memo: g.memo, result: p.fix.reason }
  }
  return { type: p.type }
}

describe('AC-8520.1 parseGoogleEvent — design.md 13절 알아보기 예 표', () => {
  it.each([
    // [제목, 색, 때, 차트, 이름, 종류, 어디서, 시행자, 어디서, 메모, 결과]
    ['1234 홍길동 도수 30분 (호)', null, FUTURE, '1234', '홍길동', 'dosu', 'title', 'ho', 'title', '', 'appt'],
    ['5521 최시안 (4000타)', 'sage', FUTURE, '5521', '최시안', 'shock', 'title', null, null, '4000타', 'no-staff'],
    ['5521 최시안 (4000타)', 'sage', PAST, '5521', '최시안', 'shock', 'title', null, 'none', '4000타', 'appt'],
    ['6230 정샘플', 'flamingo', FUTURE, '6230', '정샘플', 'dosu', 'setting', 'hyun', 'color', '', 'appt'],
    ['8456 윤모의 도수 30분', null, FUTURE, '8456', '윤모의', 'dosu', 'title', null, null, '', 'no-staff-color'],
    ['7345 한예제(1부위만 해 주세요', 'banana', FUTURE, '7345', '한예제', 'dosu', 'setting', 'won', 'color', '1부위만 해 주세요', 'appt'],
    ['1185 곽모의 체외충격 (현)', null, FUTURE, '1185', '곽모의', null, null, 'hyun', 'title', '', 'bad-kind'],
    ['홍길순 도수 30분 (현)', null, FUTURE, null, '홍길순', 'dosu', 'title', 'hyun', 'title', '', 'appt'],
    ['6603 권샘플 도수 30분 (호)', 'tomato', FUTURE, '6603', '권샘플', 'dosu', 'title', 'ho', 'title', '', 'appt+cancel'],
    ['7781 노예시 자보도수 30분 (원)', 'graphite', FUTURE, '7781', '노예시', 'jabo', 'title', 'won', 'title', '', 'appt+moved'],
    ['5521 최시안 충격파 15분 (현) 4000타', 'sage', FUTURE, '5521', '최시안', 'shock', 'title', 'hyun', 'title', '4000타', 'appt'],
    ['4411 서예제 도수 (윤)', null, PAST, '4411', '서예제', 'dosu', 'title', null, 'none', '(윤)', 'appt'],
    ['원장님 회의', null, FUTURE, null, null, null, null, null, null, '', 'not-appt'],
  ] as const)('AC-8520.1: %s (%s, %s)', (title, color, day, chart, name, kind, kindBy, staff, staffBy, memo, result) => {
    expect(view(parse(title, { color, day }))).toEqual({ chart, name, kind, kindBy, staff, staffBy, memo, result })
  })

  it('AC-8520.1: bad-kind는 모르는 글을 까닭 낱말로 남긴다(고르면 그 글은 메모)', () => {
    const p = parse('1185 곽모의 체외충격 (현)')
    expect(p.type === 'fix' && p.fix.guess.bad).toBe('체외충격')
    expect(p.type === 'fix' && p.fix.guess.needs).toEqual(['kind'])
  })

  it.each([
    // 시안 처음 가져오기 표의 다른 꼴: 차트번호와 이름이 붙음·길이 글이 종류 앞·종류와 길이가 붙음·짧은 알아볼 글·괄호가 붙음
    ['3150 박가상 30분 도수 (호)', '3150', '박가상', 'dosu', 'ho'],
    ['4012한예제 도수50분(호)', '4012', '한예제', 'dosu', 'ho'],
    ['3265 남샘플 도수30분 (현)', '3265', '남샘플', 'dosu', 'hyun'],
    ['9567 장연습 자보 30분 (원)', '9567', '장연습', 'jabo', 'won'],
    ['1102 오가짜 진료 (장)', '1102', '오가짜', 'visit', 'jang'],
    ['3348 문예시 충격파 (현)', '3348', '문예시', 'shock', 'hyun'],
    ['9962 서모의 도수30분(호)', '9962', '서모의', 'dosu', 'ho'],
  ])('AC-8520.1: 시안 꼴 %s → 차트 %s · 이름 %s · 종류 %s · 시행자 %s', (title, chart, name, kind, staff) => {
    const p = parse(title)
    expect(p.type).toBe('appt')
    if (p.type !== 'appt') return
    expect([p.appt.chart, p.appt.name, p.appt.kindId, p.appt.staffId]).toEqual([chart, name, kind, staff])
  })

  it('AC-8520.1: 이름 21자 이상·차트번호 11자리 이상은 예약 같지 않음(not-appt)이다', () => {
    const p1 = parse('12345678901 홍길동 도수 30분 (호)')
    expect(p1.type === 'fix' && p1.fix.reason).toBe('not-appt')
    const p2 = parse(`1234 ${'가'.repeat(21)} 도수 30분 (호)`)
    expect(p2.type === 'fix' && p2.fix.reason).toBe('not-appt')
    const p3 = parse(`1234 ${'가'.repeat(20)} 도수 30분 (호)`)
    expect(p3.type === 'appt' && p3.appt.name).toBe('가'.repeat(20))
  })

  it('AC-8520.1: 알아본 예약은 시안 칸(종류·시행자 이름과 표시)을 함께 채우고 구글 색을 g 칸으로 남긴다', () => {
    const p = parse('6230 정샘플', { color: 'flamingo' })
    expect(p).toMatchObject({
      type: 'appt',
      past: false,
      appt: { day: FUTURE, start: 600, len: 30, kindName: '도수', staffName: '이수현', staffMark: '현', status: 'auto', gMoved: false, gColor: 'flamingo' },
    })
  })
})

describe('AC-8520.2 parseGoogleEvent — 시행자 표시 뒤 글 = 메모 · 도착 글 떼기', () => {
  it('AC-8520.2: 시행자 표시 뒤의 글은 메모다', () => {
    const p = parse('2087 이보기 자보도수 30분 (원) 1부위만 해 주세요')
    expect(view(p)).toEqual({ chart: '2087', name: '이보기', kind: 'jabo', kindBy: 'title', staff: 'won', staffBy: 'title', memo: '1부위만 해 주세요', result: 'appt' })
  })

  it('AC-8520.2: 웹앱이 쓴 꼴을 다시 읽어도 같다', () => {
    const appts: TitleAppt[] = [
      { chart: '1234', name: '홍길동', kindId: 'dosu', kindName: '도수', len: 30, staffId: 'ho', staffMark: '호', memo: '' },
      { chart: '5521', name: '최시안', kindId: 'shock', kindName: '충격파', len: 15, staffId: 'hyun', staffMark: '현', memo: '4000타' },
      { chart: null, name: '홍길순', kindId: 'dosu', kindName: '도수', len: 30, staffId: 'hyun', staffMark: '현', memo: '' },
      { chart: '7345', name: '한예제', kindId: 'dosu', kindName: '도수', len: 30, staffId: 'won', staffMark: '원', memo: '1부위만 해 주세요' },
      { chart: '1102', name: '오가짜', kindId: 'visit', kindName: '진료', len: 10, staffId: 'jang', staffMark: '장', memo: '어깨 (좌) 재진' },
    ]
    for (const a of appts) {
      const p = parse(formatGoogleTitle(a, LOOK, KINDS, STAFF))
      expect(p.type).toBe('appt')
      if (p.type !== 'appt') continue
      expect([p.appt.chart, p.appt.name, p.appt.kindId, p.appt.staffId, p.appt.memo]).toEqual([a.chart, a.name, a.kindId, a.staffId, a.memo])
    }
  })

  it("AC-8520.2: 도착이 '제목 앞에 붙여요'면 앞의 '왔음 '·'안 옴 '을 떼고 읽는다", () => {
    const ctx: ParseCtx = { ...CTX, arrival: 'title' }
    for (const title of ['왔음 1234 홍길동 도수 30분 (호)', '안 옴 1234 홍길동 도수 30분 (호)']) {
      expect(view(parse(title, {}, ctx))).toEqual({
        chart: '1234',
        name: '홍길동',
        kind: 'dosu',
        kindBy: 'title',
        staff: 'ho',
        staffBy: 'title',
        memo: '',
        result: 'appt',
      })
    }
  })

  it("AC-8520.2: 도착 글 떼기·붙이기 — 앞의 '왔음 '·'안 옴 '만 바꾼다", () => {
    const t = '1234 홍길동 도수 30분 (호)'
    expect(stripArrival(`왔음 ${t}`)).toBe(t)
    expect(stripArrival(`안 옴 ${t}`)).toBe(t)
    expect(stripArrival(t)).toBe(t)
    expect(withArrival(t, 'came')).toBe(`왔음 ${t}`)
    expect(withArrival(`왔음 ${t}`, 'noshow')).toBe(`안 옴 ${t}`)
    expect(withArrival(`안 옴 ${t}`, null)).toBe(t)
  })
})

describe('AC-8520.3 parseGoogleEvent — 시행자 글이 없을 때', () => {
  it("AC-8520.3: 일정 색이 한 사람의 시행자 색이고 '색으로 알아보기'가 켜졌으면 그 사람이다", () => {
    expect(view(parse('6230 정샘플 도수', { color: 'flamingo' }))).toMatchObject({ staff: 'hyun', staffBy: 'color', result: 'appt' })
    const off: ParseCtx = { ...CTX, look: { ...LOOK, staffByColor: false } }
    expect(view(parse('6230 정샘플 도수', { color: 'flamingo' }, off))).toMatchObject({ staff: null, result: 'no-staff-color' })
  })

  it('AC-8520.3: 두 사람이 같은 색이면 색으로 짐작하지 않는다', () => {
    const twins: ParseCtx = { ...CTX, staff: STAFF.map((s) => (s.id === 'won' ? { ...s, color: 'flamingo' as const } : s)) }
    expect(view(parse('6230 정샘플 도수', { color: 'flamingo' }, twins))).toMatchObject({ staff: null, result: 'no-staff-color' })
  })

  it("AC-8520.3: '시행자 글이 없는 종류'는 색으로 짐작하지 않는다 — 앞으로는 no-staff, 지난 예약은 시행자 없이", () => {
    // 종류 글 없음 + 세이지 = 충격파 고정 색 → 충격파(색). 세이지를 시행자도 쓰더라도 짐작하지 않는다
    const sageStaff: ParseCtx = { ...CTX, staff: STAFF.map((s) => (s.id === 'hyun' ? { ...s, color: 'sage' as const } : s)) }
    const fut = parse('6402 윤모의', { color: 'sage' }, sageStaff)
    expect(view(fut)).toMatchObject({ kind: 'shock', kindBy: 'color', staff: null, result: 'no-staff' })
    expect(fut.type === 'fix' && fixReasonText(fut.fix)).toBe('시행자 글이 없어요. 충격파는 그때그때 하는 사람이 달라 색으로는 몰라요')
    expect(view(parse('6402 윤모의', { color: 'sage', day: PAST }, sageStaff))).toMatchObject({ kind: 'shock', staff: null, staffBy: 'none', result: 'appt' })
  })

  it('AC-8520.3: 모르는 한 글자 표시 — 지난 예약은 시행자 없이 그 글을 메모로, 앞으로는 bad-mark(색으로 짐작하지 않음)', () => {
    expect(view(parse('7740 한시안 도수 30분 (윤)', { day: PAST }))).toMatchObject({ staff: null, staffBy: 'none', memo: '(윤)', result: 'appt' })
    const fut = parse('2214 서보기 도수 30분 (민)', { color: 'lavender' })
    expect(view(fut)).toMatchObject({ staff: null, memo: '', result: 'bad-mark' })
    expect(fut.type === 'fix' && fut.fix.guess.bad).toBe('민')
  })

  it('AC-8520.3: 지난 예약은 이은 날 0시 전이다(이은 날은 앞으로)', () => {
    expect(parse('8456 윤모의 도수 30분', { day: '2026-11-22' }).past).toBe(true)
    expect(parse('8456 윤모의 도수 30분', { day: '2026-11-23', from: '00:00', to: '00:30' }).past).toBe(false)
  })
})

describe('AC-8520.4 parseGoogleEvent — 시작·길이는 구글 시각으로', () => {
  it.each([
    // [시작, 끝, 시작 분, 길이]
    ['09:13', '09:44', 555, 30],
    ['09:12', '09:15', 550, 5],
    ['10:00', '10:02', 600, 5],
    ['10:00', '10:30', 600, 30],
    ['13:00', '17:00', 780, 240],
    ['13:00', '17:01', 780, 240],
  ])('AC-8520.4: %s–%s → 시작 %i분 · 길이 %i분(가까운 5분, 5분 아래면 5분)', (from, to, start, len) => {
    const p = parse('1234 홍길동 도수 30분 (호)', { from, to })
    expect(p.type === 'appt' && [p.appt.start, p.appt.len]).toEqual([start, len])
    expect(p.type === 'appt' && [p.appt.gHow.gStart, p.appt.gHow.gEnd]).toEqual([from, to])
  })

  it("AC-8520.4: 제목의 '50분' 같은 글은 버린다(길이는 구글 시각)", () => {
    const p = parse('4012한예제 도수50분(호)', { from: '10:00', to: '10:30' })
    expect(p.type === 'appt' && p.appt.len).toBe(30)
  })

  it("AC-8520.4: 240분을 넘으면 까닭 '구글 시간이 {…}이에요. 예약 칸은 4시간까지예요'다", () => {
    const p = parse('8820 안모의 도수 (호)', { from: '09:00', to: '21:00' })
    expect(p.type === 'fix' && p.fix.reason).toBe('too-long')
    expect(p.type === 'fix' && fixReasonText(p.fix)).toBe('구글 시간이 09:00–21:00 (12시간)이에요. 예약 칸은 4시간까지예요')
    const q = parse('8820 안모의 도수 (호)', { from: '13:00', to: '17:30' })
    expect(q.type === 'fix' && fixReasonText(q.fix)).toBe('구글 시간이 13:00–17:30 (4시간 30분)이에요. 예약 칸은 4시간까지예요')
  })

  it('AC-8520.4: 다음 날로 넘어가는 시간 일정도 길이로 본다', () => {
    const p = parse('8820 안모의 도수 (호)', { from: '22:00', to: '03:00', endDay: '2026-11-27' })
    expect(p.type === 'fix' && p.fix.reason).toBe('too-long')
    const q = parse('8820 안모의 도수 (호)', { from: '23:30', to: '00:00', endDay: '2026-11-27' })
    expect(q.type === 'appt' && [q.appt.start, q.appt.len]).toEqual([1410, 30])
  })
})

describe('AC-8520.5 fixReasonText·fixChoices — notes-calendar 고쳐야 할 까닭 일곱 글과 고르기', () => {
  it.each([
    ['5521 최시안 (4000타)', { color: 'sage' as const }, '시행자 글이 없어요. 충격파는 그때그때 하는 사람이 달라 색으로는 몰라요'],
    ['8456 윤모의 도수 30분', {}, '시행자 글이 없고, 색도 캘린더 기본 색이에요'],
    ['2214 서보기 도수 30분 (민)', { color: 'lavender' as const }, "'민'은 시행자 표시에 없어요"],
    ['4471 배가상 체외 30분 (현)', { color: 'flamingo' as const }, "'체외'를 종류로 알아보지 못했어요 (고르면 '체외'는 메모로 남아요)"],
    ['직원 회의', {}, '차트번호·시행자·종류 글이 없어 예약 같지 않아요'],
    ['8820 안모의 도수 (호)', { from: '09:00', to: '21:00' }, '구글 시간이 09:00–21:00 (12시간)이에요. 예약 칸은 4시간까지예요'],
  ])('AC-8520.5: %s → %s', (title, o, text) => {
    const p = parse(title, o as Opt)
    expect(p.type).toBe('fix')
    if (p.type === 'fix') expect(fixReasonText(p.fix)).toBe(text)
  })

  it("AC-8520.5: off 줄의 모르는 이름 → '{최호}'를 원장님·직원 목록에서 찾지 못했어요", () => {
    const p = parseGoogleEvent({ ...event('최호 off'), allDay: true, start: '2026-11-25', end: '2026-11-26', colorId: ID.grape }, CTX)
    expect(p.type).toBe('fix')
    if (p.type === 'fix') expect(fixReasonText(p.fix)).toBe("'최호'를 원장님·직원 목록에서 찾지 못했어요")
  })

  it('AC-8520.5: 까닭 글의 { } 낱말 뒤 조사는 낱말 끝에 맞춘다', () => {
    const p = parse('1185 곽모의 체외충격 (현)')
    expect(p.type === 'fix' && fixReasonText(p.fix)).toBe("'체외충격'을 종류로 알아보지 못했어요 (고르면 '체외충격'은 메모로 남아요)")
    const q = parse('2214 서보기 도수 30분 (오)')
    expect(q.type === 'fix' && fixReasonText(q.fix)).toBe("'오'는 시행자 표시에 없어요")
    const kinds = KINDS.map((k) => (k.id === 'shock' ? { ...k, name: '체외충격', words: ['체외충격', '타'] } : k))
    const r = parse('5521 최시안 (4000타)', { color: 'sage' }, { ...CTX, kinds })
    expect(r.type === 'fix' && fixReasonText(r.fix)).toBe('시행자 글이 없어요. 체외충격은 그때그때 하는 사람이 달라 색으로는 몰라요')
  })

  const labels = (p: GParsed, ctx: ParseCtx = CTX) => (p.type === 'fix' ? fixChoices(p.fix, ctx, 'x').map((c) => c.label) : [])
  const SKIP = '가져오지 않기 (구글에만 둠)'

  it('AC-8520.5: 고르기 — 예약 같지 않음은 종일 메모로 넣기, 너무 김은 30분으로·50분으로, 모두 끝에 가져오지 않기', () => {
    expect(labels(parse('직원 회의'))).toEqual(['종일 메모로 넣기', SKIP])
    expect(labels(parse('8820 안모의 도수 (호)', { from: '09:00', to: '21:00' }))).toEqual(['30분으로', '50분으로', SKIP])
  })

  it('AC-8520.5: 고르기 — 시행자는 ({표시}) {이름}, 종류는 종류 이름', () => {
    expect(labels(parse('5521 최시안 (4000타)', { color: 'sage' }))).toEqual(['(호) 정호연', '(원) 박지원', '(현) 이수현', '(장) 원장님', SKIP])
    expect(labels(parse('1185 곽모의 체외충격 (현)'))).toEqual(['도수', '자보도수', '충격파', '주사', '진료', SKIP])
  })

  it("AC-8520.5: 고르기 — off 줄 모르는 이름은 사람 고르기 + 종일 메모로 ('{제목}')", () => {
    const ev = { ...event('최호 off'), allDay: true, start: '2026-11-25', end: '2026-11-26', colorId: ID.grape }
    const p = parseGoogleEvent(ev, CTX)
    expect(p.type === 'fix' ? fixChoices(p.fix, CTX, ev.summary).map((c) => c.label) : []).toEqual([
      '(장) 원장님',
      '(호) 정호연',
      '(원) 박지원',
      '(현) 이수현',
      '김예시 (직원)',
      '정예시 (직원)',
      "종일 메모로 ('최호 off')",
      SKIP,
    ])
  })

  it('AC-8520.5: 고르기 열쇠는 고른 것을 가리킨다', () => {
    const p = parse('8820 안모의 도수 (호)', { from: '09:00', to: '21:00' })
    expect(p.type === 'fix' ? fixChoices(p.fix, CTX, 'x').map((c) => c.key) : []).toEqual(['len:30', 'len:50', 'skip'])
    const q = parse('5521 최시안 (4000타)', { color: 'sage' })
    expect(q.type === 'fix' ? fixChoices(q.fix, CTX, 'x')[0].key : '').toBe('staff:ho')
  })
})

describe('AC-8520.6 parseGoogleEvent — 취소 색·변경 색은 표시이고 색으로 짐작하지 않는다', () => {
  it("AC-8520.6: 취소 색이면 '취소', 변경 색이면 '변경' 표시다", () => {
    expect(view(parse('6603 권샘플 도수 30분 (호)', { color: 'tomato' }))).toMatchObject({ result: 'appt+cancel' })
    expect(view(parse('7781 노예시 자보도수 30분 (원)', { color: 'graphite' }))).toMatchObject({ result: 'appt+moved' })
  })

  it('AC-8520.6: 취소 색에서는 시행자를 색으로 짐작하지 않는다', () => {
    const red: ParseCtx = { ...CTX, staff: STAFF.map((s) => (s.id === 'hyun' ? { ...s, color: 'tomato' as const } : s)) }
    const fut = parse('6230 정샘플 도수', { color: 'tomato' }, red)
    expect(view(fut)).toMatchObject({ staff: null, result: 'no-staff-color' })
    expect(fut.type === 'fix' && fut.fix.guess.cancel).toBe(true)
    expect(view(parse('6230 정샘플 도수', { color: 'tomato', day: PAST }, red))).toMatchObject({ staff: null, staffBy: 'none', result: 'appt+cancel' })
  })

  it('AC-8520.6: 변경 색에서는 종류를 색으로 짐작하지 않는다(설정 종류로 봄)', () => {
    const sageChange: ParseCtx = { ...CTX, look: { ...LOOK, change: 'sage' } }
    expect(view(parse('6402 윤모의 (호)', { color: 'sage' }, sageChange))).toMatchObject({ kind: 'dosu', kindBy: 'setting', staff: 'ho', result: 'appt+moved' })
  })

  it('AC-8520.6: 취소 색만으로는 예약이 되지 않는다(예약 같지 않음)', () => {
    expect(view(parse('원장님 회의', { color: 'tomato' }))).toMatchObject({ result: 'not-appt' })
  })
})

describe('AC-8521.1 formatGoogleTitle — 웹앱 → 구글 제목 꼴', () => {
  const a = (over: Partial<TitleAppt>): TitleAppt => ({
    chart: '1234',
    name: '홍길동',
    kindId: 'dosu',
    kindName: '도수',
    len: 30,
    staffId: 'ho',
    staffMark: '호',
    memo: '',
    ...over,
  })

  it('AC-8521.1: notes-calendar colors 미리 보기 여덟 줄이 그대로 나온다(제목·색)', () => {
    const paint = { look: LOOK, kinds: KINDS, staff: STAFF }
    const rows = [
      { ...a({}), status: 'auto' as const, orig: null },
      { ...a({ chart: '2087', name: '이보기', kindId: 'jabo', kindName: '자보도수', staffId: 'won', staffMark: '원' }), status: 'auto' as const, orig: null },
      { ...a({ chart: '5521', name: '최시안', kindId: 'shock', kindName: '충격파', len: 15, staffId: 'hyun', staffMark: '현', memo: '4000타' }), status: 'auto' as const, orig: null },
      { ...a({ chart: null, name: '홍길순', staffId: 'hyun', staffMark: '현' }), status: 'auto' as const, orig: null },
      { ...a({ chart: '1102', name: '오가짜', kindId: 'visit', kindName: '진료', len: 10, staffId: 'jang', staffMark: '장' }), status: 'auto' as const, orig: null },
      { ...a({ chart: '6603', name: '권샘플' }), status: 'cancel' as const, orig: null },
      { ...a({ chart: '7781', name: '노예시', kindId: 'jabo', kindName: '자보도수', staffId: 'won', staffMark: '원' }), status: 'auto' as const, orig: '2026-11-25' },
    ]
    const lines = [
      { title: composeOffTitle(['김예시', '박지원'], null, LOOK.offWord, PEOPLE), color: LOOK.offColor },
      ...rows.map((r) => ({
        title: formatGoogleTitle(r, LOOK, KINDS, STAFF),
        color: apptPaint(
          { status: r.status, origDay: r.orig, origStart: r.orig ? 600 : null, gMoved: false, colorFrom: 'app', gColor: null, kindId: r.kindId, staffId: r.staffId },
          paint,
        ).key,
      })),
    ]
    expect(lines).toEqual([
      { title: '김예시, 박지원 off', color: 'grape' },
      { title: '1234 홍길동 도수 30분 (호)', color: 'lavender' },
      { title: '2087 이보기 자보도수 30분 (원)', color: 'banana' },
      { title: '5521 최시안 충격파 15분 (현) 4000타', color: 'sage' },
      { title: '홍길순 도수 30분 (현)', color: 'flamingo' },
      { title: '1102 오가짜 진료 10분 (장)', color: 'blueberry' },
      { title: '6603 권샘플 도수 30분 (호)', color: 'tomato' },
      { title: '7781 노예시 자보도수 30분 (원)', color: 'graphite' },
    ])
  })

  it('AC-8521.1: 길이·메모 칸은 설정대로(끄면 길이 없음·메모는 제목에 안 붙음)', () => {
    const m = a({ memo: '1부위만 해 주세요' })
    expect(formatGoogleTitle(m, LOOK, KINDS, STAFF)).toBe('1234 홍길동 도수 30분 (호) 1부위만 해 주세요')
    expect(formatGoogleTitle(m, { ...LOOK, titleLen: false }, KINDS, STAFF)).toBe('1234 홍길동 도수 (호) 1부위만 해 주세요')
    expect(formatGoogleTitle(m, { ...LOOK, titleMemo: false }, KINDS, STAFF)).toBe('1234 홍길동 도수 30분 (호)')
  })

  it('AC-8521.1: 차트번호가 없으면 이름부터, 시행자가 없으면 괄호 없음', () => {
    expect(formatGoogleTitle(a({ chart: null }), LOOK, KINDS, STAFF)).toBe('홍길동 도수 30분 (호)')
    expect(formatGoogleTitle(a({ staffId: null, staffMark: null }), LOOK, KINDS, STAFF)).toBe('1234 홍길동 도수 30분')
  })

  it('AC-8521.1: 종류 이름·시행자 표시는 지금 목록 값을 쓰고, 목록에 없으면 예약에 남은 값을 쓴다', () => {
    const renamed = STAFF.map((s) => (s.id === 'ho' ? { ...s, mark: '연' } : s))
    expect(formatGoogleTitle(a({}), LOOK, KINDS, renamed)).toBe('1234 홍길동 도수 30분 (연)')
    expect(formatGoogleTitle(a({ kindId: 'gone', kindName: '견인' }), LOOK, KINDS, STAFF)).toBe('1234 홍길동 견인 30분 (호)')
  })

  it("AC-8521.1: 도착을 제목 앞에 붙이면 '왔음 '·'안 옴 '이 앞에 온다", () => {
    expect(formatGoogleTitle(a({}), LOOK, KINDS, STAFF, 'came')).toBe('왔음 1234 홍길동 도수 30분 (호)')
    expect(formatGoogleTitle(a({}), LOOK, KINDS, STAFF, 'noshow')).toBe('안 옴 1234 홍길동 도수 30분 (호)')
  })
})

// ── 2차 고침 (design.md 21-1·21-6, REQ-8543·REQ-8548) ─────────────
// '이 병원 꼴'(design.md 21-1): 시행자 셋, 종류 아홉(알아볼 글 = 이름, 고정 색 없음),
// noKind 'fix' · noStaffKinds [] · staffByColor 켬. 이름·차트번호는 지어낸 값이다
const H_STAFF: GStaff[] = STAFF.filter((s) => s.id !== 'jang')
const hKind = (id: string, name: string, len: number): GKind => ({ id, name, len, color: null, words: [name] })
const H_KINDS: GKind[] = [
  hKind('d30ho', '도수 30분(호)', 30),
  hKind('d30won', '도수 30분(원)', 30),
  hKind('d30hyun', '도수 30분(현)', 30),
  hKind('d50ho', '도수 50분(호)', 50),
  hKind('d50won', '도수 50분(원)', 50),
  hKind('d50hyun', '도수 50분(현)', 50),
  hKind('s2000', '체외충격파 2000', 15),
  hKind('s3000', '체외충격파 3000', 15),
  hKind('s4000', '체외충격파 4000', 15),
]
const H_LOOK: GLook = { ...LOOK, noKind: 'fix', noStaffKinds: [], staffByColor: true }
const H_CTX: ParseCtx = { ...CTX, staff: H_STAFF, kinds: H_KINDS, look: H_LOOK, people: PEOPLE.filter((p) => p.id !== 'jang') }
const hParse = (title: string, o: Opt = {}) => parseGoogleEvent(event(title, o), H_CTX)

/** 표 칸으로 보기(이름으로): 종류 이름·어디서·시행자 이름·어디서·메모·결과 */
function hView(p: GParsed) {
  if (p.type === 'appt') {
    const a = p.appt
    return { kind: a.kindName, kindBy: a.gHow.kind, staff: a.staffName, staffBy: a.gHow.staff, memo: a.memo, result: a.status === 'cancel' ? 'appt+cancel' : 'appt' }
  }
  if (p.type === 'fix') {
    const g = p.fix.guess
    return { kind: g.kindName, kindBy: g.kindBy, staff: g.staffName, staffBy: g.staffBy, memo: g.memo, result: p.fix.reason }
  }
  return { type: p.type }
}

describe("AC-8543.1 parseGoogleEvent — '이 병원 꼴' 종류 알아서 고르기 표 17줄", () => {
  it.each([
    // [#, 제목, 색, 때, 끝 시각, 종류, 시행자, 시행자 어디서, 메모]
    [1, '1234 홍길동 30분 도수 (원)', null, FUTURE, '10:30', '도수 30분(원)', '박지원', 'title', ''],
    [2, '5678 김가상 도수 50분 (현)', null, FUTURE, '10:30', '도수 50분(현)', '이수현', 'title', ''],
    [3, '2468 이모의 도수 (호)', null, FUTURE, '10:50', '도수 50분(호)', '정호연', 'title', ''],
    [4, '1234 홍길동 도수30분', 'banana', FUTURE, '10:30', '도수 30분(원)', '박지원', 'color', ''],
    [5, '1234 홍길동 도수30분', null, PAST, '10:30', '도수 30분(호)', null, 'none', ''],
    [6, '1234 홍길동 자보도수30분', 'banana', FUTURE, '10:30', '도수 30분(원)', '박지원', 'color', '자보'],
    [7, '1234 홍길동(3천', 'banana', FUTURE, '10:30', '체외충격파 3000', '박지원', 'color', ''],
    [8, '1234 홍길동 체외충격파', 'banana', FUTURE, '10:30', '체외충격파 2000', '박지원', 'color', ''],
    [9, '1234 홍길동 체외충격파 (현) 4000타', null, FUTURE, '10:30', '체외충격파 4000', '이수현', 'title', ''],
    [10, '1234 홍길동 (4000타)', null, PAST, '10:30', '체외충격파 4000', null, 'none', ''],
    [11, '1234 홍길동 3000', null, PAST, '10:30', '체외충격파 3000', null, 'none', ''],
    [12, '1234 홍길동 체외충격파(3천5백', null, PAST, '10:30', '체외충격파 2000', null, 'none', '3천5백'],
    [13, '1234 홍길동 도수 30분(호)', null, FUTURE, '10:30', '도수 30분(호)', '정호연', 'title', ''],
    [14, '1234 홍길동 도수 50분(원) 50분 (원) 허리', null, FUTURE, '10:30', '도수 50분(원)', '박지원', 'title', '허리'],
    [15, '1234 홍길동 도수 30분(호) 30분 (원)', null, FUTURE, '10:30', '도수 30분(호)', '박지원', 'title', ''],
    [16, '1234 홍길동 도수 50분(원) 허리', null, FUTURE, '10:30', '도수 50분(원)', '박지원', 'title', '허리'],
    [17, '1234 홍길동 도수 30분(호) (원)', null, FUTURE, '10:30', '도수 30분(호)', '박지원', 'title', ''],
  ] as const)('AC-8543.1 표 %i줄: %s (%s, %s)', (_n, title, color, day, to, kind, staff, staffBy, memo) => {
    expect(hView(hParse(title, { color, day, to }))).toEqual({ kind, kindBy: 'title', staff, staffBy, memo, result: 'appt' })
  })

  it('AC-8543.1: 알아본 예약의 차트번호·이름·종류 id도 채운다(표 1줄)', () => {
    const p = hParse('1234 홍길동 30분 도수 (원)')
    expect(p.type === 'appt' && [p.appt.chart, p.appt.name, p.appt.kindId, p.appt.staffId, p.appt.staffMark]).toEqual(['1234', '홍길동', 'd30won', 'won', '원'])
  })
})

describe('AC-8543.2 parseGoogleEvent — 기본 종류는 결과 그대로 · {숫자}천 = 충격파', () => {
  it('AC-8543.2: 8034 문보기(3천 (세이지, 앞으로) → 충격파(제목)·메모 3000타·시행자를 골라야 하는 고쳐야 할 것', () => {
    const p = parse('8034 문보기(3천', { color: 'sage' })
    expect(view(p)).toEqual({ chart: '8034', name: '문보기', kind: 'shock', kindBy: 'title', staff: null, staffBy: null, memo: '3000타', result: 'no-staff' })
    expect(p.type === 'fix' && p.fix.guess.needs).toEqual(['staff'])
  })

  it('AC-8543.2: 4618 표예시(3천5백 (세이지, 앞으로) → 충격파(색)·메모 3천5백', () => {
    expect(view(parse('4618 표예시(3천5백', { color: 'sage' }))).toEqual({
      chart: '4618',
      name: '표예시',
      kind: 'shock',
      kindBy: 'color',
      staff: null,
      staffBy: null,
      memo: '3천5백',
      result: 'no-staff',
    })
  })
})

describe('AC-8543.3 parseGoogleEvent — 타수 글', () => {
  it('AC-8543.3: {숫자}타는 그 수 — 고른 종류 이름에 그 수가 없으면 메모에 {수}타로 남는다', () => {
    expect(hView(hParse('1234 홍길동 체외충격파 (현) 5000타'))).toEqual({
      kind: '체외충격파 2000',
      kindBy: 'title',
      staff: '이수현',
      staffBy: 'title',
      memo: '5000타',
      result: 'appt',
    })
  })

  it('AC-8543.3: 기본 종류도 3천은 메모 3000타로 바꾸고 조각 안 다른 글은 그대로 둔다', () => {
    expect(view(parse('5521 최시안 충격파 (현) 3천 허리', { color: 'sage' }))).toMatchObject({ kind: 'shock', staff: 'hyun', memo: '3000타 허리', result: 'appt' })
  })

  it('AC-8543.3: 3천원·3천5백처럼 천 뒤에 글자·숫자가 붙으면 타수가 아니다', () => {
    expect(hView(hParse('1234 홍길동 체외충격파 (3천원)', { day: PAST }))).toEqual({
      kind: '체외충격파 2000',
      kindBy: 'title',
      staff: null,
      staffBy: 'none',
      memo: '3천원',
      result: 'appt',
    })
    expect(hView(hParse('1234 홍길동(3천원', { day: PAST }))).toMatchObject({ kind: null, result: 'bad-kind' })
  })

  it('AC-8543.3: 글자·숫자와 붙은 숫자, 충격파 종류 이름에 없는 맨 숫자는 타수가 아니다', () => {
    const glued = hParse('1234 홍길동 3000원', { day: PAST })
    expect(hView(glued)).toMatchObject({ kind: null, result: 'bad-kind' })
    expect(glued.type === 'fix' && glued.fix.guess.bad).toBe('3000원')
    expect(hView(hParse('1234 홍길동 A3000', { day: PAST }))).toMatchObject({ kind: null, result: 'bad-kind' })
    const other = hParse('1234 홍길동 2500', { day: PAST })
    expect(hView(other)).toMatchObject({ kind: null, result: 'bad-kind' })
    expect(other.type === 'fix' && other.fix.guess.bad).toBe('2500')
  })

  it("AC-8543.3: 알아볼 글에 '타'가 든 종류도 충격파 종류다(타수만 있으면 그 가운데서 고름)", () => {
    const kinds: GKind[] = [
      { id: 'dosu', name: '도수', len: 30, color: null, words: ['도수'] },
      { id: 'eswt', name: 'ESWT', len: 15, color: null, words: ['ESWT', '타'] },
    ]
    const p = parseGoogleEvent(event('1234 홍길동(3천 (현)'), { ...CTX, kinds, look: { ...LOOK, noKind: 'fix', noStaffKinds: [] } })
    expect(view(p)).toMatchObject({ kind: 'eswt', kindBy: 'title', staff: 'hyun', memo: '3000타', result: 'appt' })
  })

  it('AC-8543.3: 충격파 종류가 없으면 타수만 있는 제목은 지금 규칙(⑨ 색·설정) 그대로다', () => {
    const ctx: ParseCtx = { ...CTX, kinds: KINDS.filter((k) => k.id !== 'shock') }
    expect(view(parseGoogleEvent(event('8034 문보기(3천 (호)'), ctx))).toMatchObject({ kind: 'dosu', kindBy: 'setting', staff: 'ho', result: 'appt' })
    const fixCtx: ParseCtx = { ...ctx, look: { ...LOOK, noKind: 'fix' } }
    expect(view(parseGoogleEvent(event('8034 문보기(3천 (호)'), fixCtx))).toMatchObject({ kind: null, result: 'bad-kind' })
  })
})

describe('AC-8543.4 parseGoogleEvent — 같은 종류 낱말을 가진 종류가 여럿일 때', () => {
  it('AC-8543.4: 제목에 한 종류 이름이 그대로 들어 있으면 그 종류다(빈칸은 보지 않음)', () => {
    expect(hView(hParse('1234 홍길동 도수 50분 (현)'))).toMatchObject({ kind: '도수 50분(현)', staff: '이수현' })
    expect(hView(hParse('1234 홍길동 도수50분(호) (원)'))).toMatchObject({ kind: '도수 50분(호)', staff: '박지원' })
    expect(hView(hParse('1234 홍길동 체외충격파 3000 (현)'))).toMatchObject({ kind: '체외충격파 3000', staff: '이수현' })
  })

  it('AC-8543.4: 아니면 표시·길이·타수가 가장 많이 맞는 종류, 같으면 종류 차례가 앞인 것', () => {
    // 표시 (현) + 구글 일정 50분 → 도수 50분(현)
    expect(hView(hParse('1234 홍길동 도수 (현)', { to: '10:50' }))).toMatchObject({ kind: '도수 50분(현)' })
    // 표시 (원)만 맞는 종류 둘(30분·50분) → 차례가 앞인 30분(구글 일정 40분이라 길이는 아무것도 안 맞음)
    expect(hView(hParse('1234 홍길동 도수 (원)', { to: '10:40' }))).toMatchObject({ kind: '도수 30분(원)' })
    // 아무것도 안 맞으면 맨 앞
    expect(hView(hParse('1234 홍길동 도수', { to: '10:40', day: PAST }))).toMatchObject({ kind: '도수 30분(호)' })
    // 길이는 제목의 첫 'N분'이 구글 일정 길이보다 먼저
    expect(hView(hParse('1234 홍길동 도수 50분 허리 (원)', { to: '10:30' }))).toMatchObject({ kind: '도수 50분(원)', memo: '허리' })
  })

  it('AC-8543.4: 색으로 짐작한 표시는 점수에만 쓰고, 취소 색·변경 색이면 짐작하지 않는다', () => {
    expect(hView(hParse('1234 홍길동 도수', { color: 'flamingo', to: '10:50' }))).toMatchObject({ kind: '도수 50분(현)', staff: '이수현', staffBy: 'color' })
    expect(hView(hParse('1234 홍길동 도수', { color: 'tomato', to: '10:50', day: PAST }))).toMatchObject({ kind: '도수 50분(호)', staff: null, result: 'appt+cancel' })
  })

  it('AC-8543.4: 종류 목록·알아볼 글 저장 값은 바꾸지 않는다', () => {
    const before = JSON.parse(JSON.stringify(H_KINDS)) as GKind[]
    hParse('1234 홍길동 30분 도수 (원)')
    hParse('1234 홍길동(3천', { color: 'banana' })
    expect(H_KINDS).toEqual(before)
  })
})

describe('AC-8543.5 parseGoogleEvent — 끝 표시 앞의 아는 표시 한 글자 괄호는 메모가 아니다', () => {
  it('AC-8543.5: (호) (원) → 시행자는 끝 표시, 앞 (호)는 메모에 남지 않는다', () => {
    expect(hView(hParse('1234 홍길동 도수 30분(호) (원)'))).toMatchObject({ staff: '박지원', memo: '' })
    expect(hView(hParse('1234 홍길동 도수 30분(호) 30분 (원)'))).toMatchObject({ staff: '박지원', memo: '' })
  })

  it('AC-8543.5: 모르는 한 글자·두 글자 이상 괄호는 지금처럼 메모다', () => {
    expect(hView(hParse('1234 홍길동 도수 30분 (좌) (원)'))).toMatchObject({ kind: '도수 30분(원)', staff: '박지원', memo: '좌' })
    expect(hView(hParse('1234 홍길동 도수 30분 (호호) (원)'))).toMatchObject({ kind: '도수 30분(원)', staff: '박지원', memo: '호호' })
  })
})

describe('AC-8548.1 formatGoogleTitle — 종류 이름에 든 길이·시행자 표시는 겹쳐 적지 않는다', () => {
  const h = (over: Partial<TitleAppt>): TitleAppt => ({
    chart: '1234',
    name: '홍길동',
    kindId: 'd30won',
    kindName: '도수 30분(원)',
    len: 30,
    staffId: 'won',
    staffMark: '원',
    memo: '',
    ...over,
  })

  it.each([
    [1, '1234 홍길동 도수 30분 (원)', h({})],
    [2, '2087 이보기 도수 50분 (원)', h({ chart: '2087', name: '이보기', kindId: 'd50won', kindName: '도수 50분(원)', len: 50 })],
    [3, '1234 홍길동 도수 30분 (원)', h({ kindId: 'd30ho', kindName: '도수 30분(호)' })],
    [4, '1234 홍길동 도수 30분 40분 (원)', h({ len: 40 })],
    [5, '5521 최시안 체외충격파 3000 15분 (현)', h({ chart: '5521', name: '최시안', kindId: 's3000', kindName: '체외충격파 3000', len: 15, staffId: 'hyun', staffMark: '현' })],
    [6, '1234 홍길동 도수 30분(호)', h({ kindId: 'd30ho', kindName: '도수 30분(호)', staffId: null, staffMark: null })],
  ] as const)('AC-8548.1 %i줄: → %s', (_n, title, appt) => {
    expect(formatGoogleTitle(appt, H_LOOK, H_KINDS, H_STAFF)).toBe(title)
  })

  it('AC-8548.1: 메모·도착 글은 지금처럼 뒤·앞에 붙는다', () => {
    expect(formatGoogleTitle(h({ memo: '허리' }), H_LOOK, H_KINDS, H_STAFF, 'came')).toBe('왔음 1234 홍길동 도수 30분 (원) 허리')
  })

  it('AC-8548.1: 끝 괄호 글자가 시행자 목록의 표시가 아니면 떼지 않는다', () => {
    const kinds = [...H_KINDS, hKind('dx', '도수 30분(좌)', 30)]
    expect(formatGoogleTitle(h({ kindId: 'dx', kindName: '도수 30분(좌)' }), H_LOOK, kinds, H_STAFF)).toBe('1234 홍길동 도수 30분(좌) (원)')
  })

  it('AC-8548.1: 웹앱이 적은 제목을 다시 읽으면 제 종류·시행자로 돌아온다', () => {
    const appts = [
      h({}),
      h({ kindId: 'd50hyun', kindName: '도수 50분(현)', len: 50, staffId: 'hyun', staffMark: '현' }),
      h({ kindId: 's4000', kindName: '체외충격파 4000', len: 15, staffId: 'ho', staffMark: '호' }),
    ]
    for (const a of appts) {
      const p = hParse(formatGoogleTitle(a, H_LOOK, H_KINDS, H_STAFF), { to: a.len === 50 ? '10:50' : '10:30' })
      expect(p.type === 'appt' && [p.appt.kindId, p.appt.staffId, p.appt.memo]).toEqual([a.kindId, a.staffId, ''])
    }
  })
})

describe('AC-8548.3 formatGoogleTitle — 기본 종류는 지금과 한 글자도 같다', () => {
  it('AC-8548.3: 이름에 길이·표시가 없는 종류는 {차트번호} {이름} {종류} {길이}분 ({표시}) 그대로', () => {
    const a: TitleAppt = { chart: '1234', name: '홍길동', kindId: 'dosu', kindName: '도수', len: 30, staffId: 'ho', staffMark: '호', memo: '' }
    expect(formatGoogleTitle(a, LOOK, KINDS, STAFF)).toBe('1234 홍길동 도수 30분 (호)')
    expect(formatGoogleTitle({ ...a, kindId: 'shock', kindName: '충격파', len: 15, memo: '4000타' }, LOOK, KINDS, STAFF)).toBe('1234 홍길동 충격파 15분 (호) 4000타')
  })
})
