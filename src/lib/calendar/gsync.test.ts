import { describe, expect, it } from 'vitest'
import { colorChangeTargets, decideEvent } from './gsync'
import type { GAppt, GColor, GEvent, GKind, GLook, GStaff, OffPerson, PaintCtx, SyncCtx, TargetAppt } from './gshapes'

// 구글 → 웹앱 받기 판단(spec google-link design.md 12-1·REQ-8523)과 색 바꿈 대상(AC-8521.3).
// 시각: 구글 updated·DB g_wait_at은 UTC 글자, 덮인 줄의 {HH:mm}은 한국 시각(UTC + 9). 이름·차트번호는 지어낸 값이다

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
const PEOPLE: OffPerson[] = STAFF.map((s) => ({ id: s.id, name: s.name }))
const CTX: SyncCtx = { staff: STAFF, kinds: KINDS, look: LOOK, people: PEOPLE, arrival: 'off', linkedOn: '2026-11-23', onGoogleDelete: 'cancel', fix: null }

const EVENT_ID = 'ssk0123456789abcdef0123456789abcdef'
const TITLE = '1234 홍길동 도수 30분 (호)'
const T = (hhmm: string, frac = '000') => `2026-11-26T${hhmm}:00.${frac}Z` // UTC. 05:00Z = 한국 14:00

const mapped = (over: Partial<GAppt> = {}): GAppt => ({
  id: 'a1',
  day: '2026-11-26',
  start: 600,
  len: 30,
  name: '홍길동',
  chart: '1234',
  staffId: 'ho',
  staffName: '정호연',
  staffMark: '호',
  kindId: 'dosu',
  kindName: '도수',
  memo: '',
  status: 'auto',
  auto: null,
  origDay: null,
  origStart: null,
  gEventId: EVENT_ID,
  gUpdated: T('05:00'),
  gTitle: TITLE,
  gColor: 'lavender',
  colorFrom: 'app',
  gKeepTitle: false,
  gMoved: false,
  gGone: false,
  gWait: null,
  gWaitAt: null,
  gNote: null,
  gFrom: 'web',
  gHow: null,
  ...over,
})
const ev = (over: Partial<GEvent> = {}): GEvent => ({
  id: EVENT_ID,
  status: 'confirmed',
  summary: TITLE,
  description: '',
  allDay: false,
  start: '2026-11-26T10:00',
  end: '2026-11-26T10:30',
  colorId: ID.lavender,
  updated: T('05:10'),
  recurring: false,
  ...over,
})
const patchOf = (d: ReturnType<typeof decideEvent>) => (d.do === 'update' ? d.patch : null)

describe('AC-8523.1 decideEvent — 웹앱이 쓴 것을 다시 받지 않는다', () => {
  it('AC-8523.1: 구글 updated가 예약 g_updated보다 늦지 않으면 건너뛴다', () => {
    expect(decideEvent(ev({ updated: T('05:00') }), mapped(), CTX)).toEqual({ do: 'none', why: 'not-newer' })
    expect(decideEvent(ev({ updated: T('04:59') }), mapped(), CTX)).toEqual({ do: 'none', why: 'not-newer' })
    expect(decideEvent(ev({ updated: T('05:01') }), mapped(), CTX).do).toBe('update')
  })

  it('AC-8523.1: DB 시각 글자(마이크로초·+00:00)와 구글 글자(밀리초·Z)를 같은 시각으로 견준다', () => {
    const row = mapped({ gUpdated: '2026-11-26T05:00:00.123456+00:00' })
    expect(decideEvent(ev({ updated: T('05:00', '123') }), row, CTX)).toEqual({ do: 'none', why: 'not-newer' })
    expect(decideEvent(ev({ updated: T('05:00', '124') }), row, CTX).do).toBe('update')
  })

  it('AC-8523.1: g_updated가 없으면 받는다', () => {
    expect(decideEvent(ev(), mapped({ gUpdated: null }), CTX).do).toBe('update')
  })
})

describe('AC-8523.2 decideEvent — 양쪽이 고치면 나중 쪽(g_wait_at으로 견줌)', () => {
  const changed = '1234 홍길동 자보도수 30분 (원)'

  it("AC-8523.2: 웹앱이 나중에 고쳤으면 웹앱 이김 — '구글에서 {HH:mm}에 고친 내용을 웹앱 내용으로 덮었어요', 보내기는 그대로", () => {
    const row = mapped({ gWait: 'edit', gWaitAt: '2026-11-26T05:20:00.123456+00:00' })
    expect(decideEvent(ev({ summary: changed, updated: T('05:10') }), row, CTX)).toEqual({
      do: 'update',
      wins: 'web',
      patch: { gNote: '구글에서 14:10에 고친 내용을 웹앱 내용으로 덮었어요', gUpdated: T('05:10') },
    })
  })

  it("AC-8523.2: 구글이 나중에 고쳤으면 구글 이김 — g_wait 비움 + '웹앱에서 {HH:mm}에 고친 내용을 구글 내용으로 덮었어요'", () => {
    const row = mapped({ gWait: 'edit', gWaitAt: '2026-11-26T05:20:00.123456+00:00' })
    const d = decideEvent(ev({ summary: changed, updated: T('05:30'), colorId: ID.banana }), row, CTX)
    expect(d).toMatchObject({ do: 'update', wins: 'google' })
    expect(patchOf(d)).toMatchObject({
      kindId: 'jabo',
      kindName: '자보도수',
      staffId: 'won',
      staffName: '박지원',
      staffMark: '원',
      gWait: null,
      gNote: '웹앱에서 14:20에 고친 내용을 구글 내용으로 덮었어요',
      gTitle: changed,
      gKeepTitle: true,
      gUpdated: T('05:30'),
    })
  })

  it('AC-8523.2: 웹앱 고침 → 도착이 바뀜 → 그 사이 구글 고침이 웹앱 고침보다 늦으면 구글이 이긴다(updated_at이 아니라 g_wait_at)', () => {
    // 웹앱 고침 05:20(g_wait_at) → 구글 고침 05:30 → 비트 PC가 도착 적음 05:40(updated_at만 바뀜)
    const row = { ...mapped({ gWait: 'edit', gWaitAt: '2026-11-26T05:20:00.000000+00:00' }), updatedAt: '2026-11-26T05:40:00.000000+00:00' }
    expect(decideEvent(ev({ summary: changed, updated: T('05:30') }), row, CTX)).toMatchObject({ do: 'update', wins: 'google' })
    expect(decideEvent(ev({ summary: changed, updated: T('05:15') }), row, CTX)).toMatchObject({ do: 'update', wins: 'web' })
  })

  it('AC-8523.2: 보낼 것이 없으면 덮인 줄 없이 구글을 따른다', () => {
    const d = decideEvent(ev({ summary: changed, colorId: ID.banana }), mapped(), CTX)
    expect(d).toMatchObject({ do: 'update', wins: 'google' })
    expect(patchOf(d)).not.toHaveProperty('gNote')
    expect(patchOf(d)).not.toHaveProperty('gWait')
  })
})

describe('AC-8523.3 decideEvent — 구글 색이 취소 색·변경 색이 되거나 돌아옴', () => {
  it("AC-8523.3: 취소 색 → 웹앱 '취소'", () => {
    expect(patchOf(decideEvent(ev({ colorId: ID.tomato }), mapped(), CTX))).toEqual({ status: 'cancel', gUpdated: T('05:10') })
  })

  it("AC-8523.3: 취소 색에서 다른 색으로 돌아오면 취소가 풀리고 도착 상태는 'auto'", () => {
    expect(patchOf(decideEvent(ev({ colorId: ID.lavender }), mapped({ status: 'cancel' }), CTX))).toEqual({ status: 'auto', gUpdated: T('05:10') })
  })

  it("AC-8523.3: 변경 색 → g_moved, 다른 색으로 돌아오면 풀림", () => {
    expect(patchOf(decideEvent(ev({ colorId: ID.graphite }), mapped(), CTX))).toEqual({ gMoved: true, gUpdated: T('05:10') })
    expect(patchOf(decideEvent(ev({ colorId: ID.lavender }), mapped({ gMoved: true }), CTX))).toEqual({ gMoved: false, gUpdated: T('05:10') })
  })

  it("AC-8523.3: 그 밖 색은 g_color로 받고, 설정 색과 다르면 구글 색으로 칠한다(color_from 'google')", () => {
    expect(patchOf(decideEvent(ev({ colorId: ID.tangerine }), mapped(), CTX))).toEqual({ gColor: 'tangerine', colorFrom: 'google', gUpdated: T('05:10') })
    expect(patchOf(decideEvent(ev({ colorId: null }), mapped(), CTX))).toEqual({ gColor: null, colorFrom: 'google', gUpdated: T('05:10') })
    expect(patchOf(decideEvent(ev({ colorId: ID.lavender }), mapped({ colorFrom: 'google', gColor: 'tangerine' }), CTX))).toEqual({
      gColor: 'lavender',
      gUpdated: T('05:10'),
    })
  })

  it('AC-8523.3: 구글에서 지웠다 되살린 일정은 g_gone·취소가 풀린다', () => {
    expect(patchOf(decideEvent(ev(), mapped({ status: 'cancel', gGone: true }), CTX))).toEqual({ status: 'auto', gGone: false, gUpdated: T('05:10') })
  })
})

describe('AC-8523.4 decideEvent — 구글에서 날짜·시작을 옮김', () => {
  it("AC-8523.4·AC-8545.2: 웹앱에서 옮긴 것처럼 날짜·시작을 고치고 g_moved 참, 구글 색을 변경 색으로 다시 칠하라고 낸다(g_wait = 'color')", () => {
    expect(patchOf(decideEvent(ev({ start: '2026-11-27T11:00', end: '2026-11-27T11:30' }), mapped(), CTX))).toEqual({
      day: '2026-11-27',
      start: 660,
      gMoved: true, // google-link AC-8545.2: 구글에서 날짜·시작을 옮기면 g_moved 참
      gWait: 'color',
      gUpdated: T('05:10'),
    })
  })

  it("AC-8545.2: 구글에서 원래 자리(orig_day·orig_start)로 되돌리면 g_moved 거짓, 다시 칠하기(g_wait 'color')는 그대로 낸다", () => {
    const row = mapped({ day: '2026-11-27', start: 660, origDay: '2026-11-26', origStart: 600, gMoved: true })
    expect(patchOf(decideEvent(ev(), row, CTX))).toEqual({ day: '2026-11-26', start: 600, gMoved: false, gWait: 'color', gUpdated: T('05:10') })
  })

  it('AC-8545.2: 원래 자리가 아닌 곳으로 또 옮기면 g_moved 참 그대로(바뀐 칸이 아니라 patch에 없음), 다시 칠하기를 낸다', () => {
    const row = mapped({ day: '2026-11-27', start: 660, origDay: '2026-11-26', origStart: 600, gMoved: true })
    expect(patchOf(decideEvent(ev({ start: '2026-11-28T09:00', end: '2026-11-28T09:30' }), row, CTX))).toEqual({
      day: '2026-11-28',
      start: 540,
      gWait: 'color',
      gUpdated: T('05:10'),
    })
  })

  it('AC-8545.1: 처음 자리가 있는 예약도 구글에서 변경 색을 다른 색으로 바꾸면 g_moved 거짓', () => {
    const row = mapped({ origDay: '2026-11-25', origStart: 600, gMoved: true })
    expect(patchOf(decideEvent(ev({ colorId: ID.lavender }), row, CTX))).toEqual({ gMoved: false, gUpdated: T('05:10') })
  })

  it('AC-8523.4: 이미 변경 색이면 다시 칠할 것이 없다', () => {
    expect(patchOf(decideEvent(ev({ start: '2026-11-26T11:15', end: '2026-11-26T11:45', colorId: ID.graphite }), mapped(), CTX))).toEqual({
      start: 675,
      gMoved: true,
      gUpdated: T('05:10'),
    })
  })

  it('AC-8523.4: 길이만 바뀌면 변경이 아니다', () => {
    expect(patchOf(decideEvent(ev({ end: '2026-11-26T10:50' }), mapped(), CTX))).toEqual({ len: 50, gUpdated: T('05:10') })
  })

  it('AC-8523.4: 구글에서 온 예약은 알아본 출처의 구글 시각도 새로 적는다', () => {
    const how = { staff: 'title' as const, kind: 'title' as const, memo: false, gStart: '10:00', gEnd: '10:30' }
    const p = patchOf(decideEvent(ev({ start: '2026-11-26T10:30', end: '2026-11-26T11:00' }), mapped({ gHow: how, colorFrom: 'google' }), CTX))
    expect(p).toMatchObject({ start: 630, gWait: 'color', gHow: { ...how, gStart: '10:30', gEnd: '11:00' } })
  })
})

describe('AC-8523.5 decideEvent — 구글에서 지운 일정', () => {
  it("AC-8523.5: 맞춤 방법이 기본이면 '취소' + g_gone", () => {
    expect(decideEvent(ev({ status: 'cancelled' }), mapped(), CTX)).toEqual({
      do: 'update',
      wins: 'google',
      patch: { status: 'cancel', gGone: true, gUpdated: T('05:10') },
    })
  })

  it("AC-8523.5: 지운 일정 답에 시각이 없어도 예약 날짜로 본다", () => {
    expect(decideEvent(ev({ status: 'cancelled', start: '', end: '' }), mapped(), CTX)).toMatchObject({ do: 'update' })
    expect(decideEvent(ev({ status: 'cancelled', start: '', end: '' }), mapped({ day: '2026-11-20' }), CTX)).toEqual({ do: 'none', why: 'before-link' })
  })

  it("AC-8523.5: '웹앱에서도 지워요'면 지우기", () => {
    expect(decideEvent(ev({ status: 'cancelled' }), mapped(), { ...CTX, onGoogleDelete: 'delete' })).toEqual({ do: 'delete' })
  })
})

describe('AC-8523.6 decideEvent — 짝 없는 새 일정', () => {
  const fresh = (summary: string, colorId: string | null = null) => ev({ id: 'googleevt01', summary, colorId })

  it("AC-8523.6: 알아보면 넣기(g_from 'pull', color_from 'google', g_keep_title)", () => {
    expect(decideEvent(fresh('6230 정샘플', ID.flamingo), null, CTX)).toMatchObject({
      do: 'insert',
      dropFix: false,
      row: {
        day: '2026-11-26',
        start: 600,
        len: 30,
        chart: '6230',
        name: '정샘플',
        kindId: 'dosu',
        staffId: 'hyun',
        status: 'auto',
        gMoved: false,
        gEventId: 'googleevt01',
        gTitle: '6230 정샘플',
        gUpdated: T('05:10'),
        gColor: 'flamingo',
        colorFrom: 'google',
        gKeepTitle: true,
        gFrom: 'pull',
        gHow: { staff: 'color', kind: 'setting' },
      },
    })
  })

  it('AC-8523.6: 못 알아보면 고쳐야 할 것', () => {
    expect(decideEvent(fresh('1185 곽모의 체외충격 (현)'), null, CTX)).toMatchObject({ do: 'fix', fix: { reason: 'bad-kind', day: '2026-11-26' } })
  })

  it("AC-8523.6: '가져오지 않기'로 둔 일정은 구글 제목이 바뀔 때만 다시 알아본다", () => {
    const skip = { ...CTX, fix: { state: 'skip' as const, gTitle: '1185 곽모의 체외충격 (현)' } }
    expect(decideEvent(fresh('1185 곽모의 체외충격 (현)'), null, skip)).toEqual({ do: 'none', why: 'skip-kept' })
    expect(decideEvent(fresh('1185 곽모의 충격파 (현)'), null, skip)).toMatchObject({ do: 'insert', dropFix: true })
    expect(decideEvent(fresh('1185 곽모의 체외 (현)'), null, skip)).toMatchObject({ do: 'fix', fix: { reason: 'bad-kind' } })
  })

  it('AC-8523.6: 열린 고쳐야 할 것이 이제 알아보이면 넣고 그 줄을 지운다', () => {
    const open = { ...CTX, fix: { state: 'open' as const, gTitle: '1185 곽모의 체외충격 (현)' } }
    expect(decideEvent(fresh('1185 곽모의 체외충격 (현)'), null, { ...open, kinds: [...KINDS, { id: 'x', name: '체외충격', len: 30, color: null, words: ['체외충격'] }] })).toMatchObject({
      do: 'insert',
      dropFix: true,
    })
  })

  it('AC-8523.6: 짝 없이 지워진 일정은 고쳐야 할 것만 지운다', () => {
    expect(decideEvent(ev({ id: 'googleevt01', status: 'cancelled' }), null, { ...CTX, fix: { state: 'open', gTitle: 'x' } })).toEqual({ do: 'drop-fix' })
    expect(decideEvent(ev({ id: 'googleevt01', status: 'cancelled' }), null, CTX)).toEqual({ do: 'none', why: 'not-ours' })
  })

  it('AC-8523.6: 취소 색 새 일정은 취소로, 변경 색은 변경 표시로 넣는다(취소·변경 전 색은 몰라 g_color 없음)', () => {
    // g_color = 취소·변경 전 일정 색. 취소 색을 g_color로 두면 [취소 되돌리기] 때 다시 취소 색으로 칠해 다음 받기에서 또 취소가 된다
    expect(decideEvent(fresh('6603 권샘플 도수 30분 (호)', ID.tomato), null, CTX)).toMatchObject({ do: 'insert', row: { status: 'cancel', gColor: null } })
    expect(decideEvent(fresh('7781 노예시 자보도수 30분 (원)', ID.graphite), null, CTX)).toMatchObject({ do: 'insert', row: { gMoved: true, gColor: null } })
  })

  it('AC-8523.6: 하루 종일 일정은 이은 날부터의 날마다 off 줄·종일 메모로 낸다', () => {
    const allDay = (summary: string, start: string, end: string) => ev({ id: 'googleevt02', summary, allDay: true, start, end, colorId: ID.grape })
    expect(decideEvent(allDay('정호연 off', '2026-11-22', '2026-11-25'), null, CTX)).toMatchObject({
      do: 'allday',
      days: ['2026-11-23', '2026-11-24'],
      parsed: { type: 'off', people: [{ id: 'ho', name: '정호연' }] },
    })
    expect(decideEvent(allDay('원장님 학회', '2026-11-25', '2026-11-26'), null, CTX)).toMatchObject({ do: 'allday', days: ['2026-11-25'], parsed: { type: 'memo' } })
    expect(decideEvent({ ...allDay('원장님 학회', '2026-11-25', '2026-11-26'), status: 'cancelled' }, null, CTX)).toEqual({ do: 'allday-gone' })
    expect(decideEvent(allDay('원장님 학회', '2026-11-25', '2026-11-26'), null, { ...CTX, allDaySeen: T('05:10') })).toEqual({ do: 'none', why: 'not-newer' })
  })
})

describe('AC-8523.7 decideEvent — 이은 날 0시 전 일정은 아무것도 하지 않는다', () => {
  it('AC-8523.7: 짝이 있든 없든 이은 날 전이면 none', () => {
    const old = ev({ start: '2026-11-22T10:00', end: '2026-11-22T10:30', summary: '9999 홍길동 도수 30분 (호)' })
    expect(decideEvent(old, null, CTX)).toEqual({ do: 'none', why: 'before-link' })
    expect(decideEvent(old, mapped({ day: '2026-11-22' }), CTX)).toEqual({ do: 'none', why: 'before-link' })
    expect(decideEvent({ ...old, allDay: true, start: '2026-11-21', end: '2026-11-23', summary: '정호연 off' }, null, CTX)).toEqual({ do: 'none', why: 'before-link' })
  })
})

describe('AC-8523.8 decideEvent — 제목이 그대로면 시간·색·지움만, 바뀌었는데 못 알아보면 칸은 그대로', () => {
  it('AC-8523.8: 제목이 그대로인 고친 일정은 시간·색만 반영한다(이름·종류·시행자·메모는 건드리지 않음)', () => {
    const p = patchOf(decideEvent(ev({ start: '2026-11-26T10:05', end: '2026-11-26T10:35', colorId: ID.tangerine }), mapped({ memo: '설명 칸 메모' }), CTX))
    // google-link AC-8545.2: 시작을 옮겼으니 g_moved 참
    expect(p).toEqual({ start: 605, gMoved: true, gWait: 'color', gColor: 'tangerine', colorFrom: 'google', gUpdated: T('05:10') })
  })

  it("AC-8523.8: 제목이 바뀌었는데 알아보지 못하면 이름·종류·시행자는 그대로 두고 g_note '구글 제목을 알아보지 못해 이름·종류·시행자는 그대로 뒀어요'", () => {
    expect(patchOf(decideEvent(ev({ summary: '원장님 회의' }), mapped(), CTX))).toEqual({
      gTitle: '원장님 회의',
      gNote: '구글 제목을 알아보지 못해 이름·종류·시행자는 그대로 뒀어요',
      gUpdated: T('05:10'),
    })
  })

  it('AC-8523.8: 양쪽 덮임과 못 알아봄이 함께면 한 줄로 잇는다', () => {
    const row = mapped({ gWait: 'edit', gWaitAt: '2026-11-26T05:05:00.000000+00:00' })
    expect(patchOf(decideEvent(ev({ summary: '원장님 회의' }), row, CTX))?.gNote).toBe(
      '웹앱에서 14:05에 고친 내용을 구글 내용으로 덮었어요 · 구글 제목을 알아보지 못해 이름·종류·시행자는 그대로 뒀어요',
    )
  })

  it('AC-8523.8: 제목이 바뀌어 알아보면 칸을 고치고 그 제목을 지킨다(g_keep_title)', () => {
    const p = patchOf(decideEvent(ev({ summary: '1234 홍길동 도수 30분 (호) 왼쪽만' }), mapped(), CTX))
    expect(p).toEqual({ memo: '왼쪽만', gTitle: '1234 홍길동 도수 30분 (호) 왼쪽만', gKeepTitle: true, gHow: { staff: 'title', kind: 'title', memo: true, gStart: '10:00', gEnd: '10:30' }, gUpdated: T('05:10') })
  })

  it('AC-8523.8: 메모를 제목에 붙이지 않는 설정이면 다시 알아봐도 메모를 지우지 않는다', () => {
    const ctx = { ...CTX, look: { ...LOOK, titleMemo: false } }
    const p = patchOf(decideEvent(ev({ summary: '1234 홍길동 자보도수 30분 (호)' }), mapped({ memo: '1부위만 해 주세요' }), ctx))
    expect(p).toMatchObject({ kindId: 'jabo' })
    expect(p).not.toHaveProperty('memo')
  })
})

describe('AC-8521.3 colorChangeTargets — 옛 색으로 칠해진 앞으로의 예약만', () => {
  const BEFORE: PaintCtx = { look: LOOK, kinds: KINDS, staff: STAFF }
  const recolor = (id: string, color: GColor): PaintCtx => ({ ...BEFORE, staff: STAFF.map((s) => (s.id === id ? { ...s, color } : s)) })
  const a = (id: string, over: Partial<TargetAppt> = {}): TargetAppt => ({
    id,
    day: '2026-11-27',
    status: 'auto',
    origDay: null,
    origStart: null,
    gMoved: false,
    colorFrom: 'app',
    gColor: null,
    kindId: 'dosu',
    staffId: 'ho',
    ...over,
  })
  const APPTS: TargetAppt[] = [
    a('future'),
    a('today', { day: '2026-11-26' }),
    a('google', { colorFrom: 'google', gColor: 'tangerine' }),
    a('past', { day: '2026-11-25' }),
    a('cancel', { status: 'cancel' }),
    a('moved', { origDay: '2026-11-24', origStart: 600, gMoved: true }), // google-link AC-8545.1: 이은 병원의 '변경'은 g_moved
    a('shock', { kindId: 'shock' }),
    a('won', { staffId: 'won' }),
  ]
  const opts = { today: '2026-11-26', linkedOn: '2026-11-23' }

  it('AC-8521.3: 시행자 색을 바꾸면 그 색이던 앞으로의 예약만(구글에서 따로 고른 색·취소·변경·종류 고정 색·지난 예약 빼고)', () => {
    expect(colorChangeTargets(APPTS, BEFORE, recolor('ho', 'peacock'), opts)).toEqual(['future', 'today'])
  })

  it('AC-8521.3: 취소 색을 바꾸면 앞으로의 취소한 예약도, 변경 색을 바꾸면 변경한 예약도', () => {
    expect(colorChangeTargets(APPTS, BEFORE, { ...BEFORE, look: { ...LOOK, cancel: 'basil' } }, opts)).toEqual(['cancel'])
    expect(colorChangeTargets(APPTS, BEFORE, { ...BEFORE, look: { ...LOOK, change: 'peacock' } }, opts)).toEqual(['moved'])
  })

  it('AC-8521.3: 종류 색을 바꾸면 그 종류 예약만', () => {
    const kinds = KINDS.map((k) => (k.id === 'shock' ? { ...k, color: 'basil' as const } : k))
    expect(colorChangeTargets(APPTS, BEFORE, { ...BEFORE, kinds }, opts)).toEqual(['shock'])
  })

  it('AC-8521.3: 이은 날 전 예약은 고르지 않고, 잇지 않은 병원은 아무것도 고르지 않는다', () => {
    expect(colorChangeTargets(APPTS, BEFORE, recolor('ho', 'peacock'), { today: '2026-11-26', linkedOn: '2026-11-27' })).toEqual(['future'])
    expect(colorChangeTargets(APPTS, BEFORE, recolor('ho', 'peacock'), { today: '2026-11-26', linkedOn: null })).toEqual([])
  })
})
