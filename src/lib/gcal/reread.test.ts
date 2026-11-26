import { describe, expect, it, vi } from 'vitest'
import { DEFAULT_CAL_SETTINGS, type CalAppt } from '@/types/calendar'
import { DEFAULT_GCAL_LOOK, DEFAULT_GCAL_RULES, type GcalLink } from '@/types/gcal'
import { createMemoryStore, type GcalCaller, type GcalDeps, type GcalParts, type GcalStore, type MemoryStore } from './deps'
import { planReread, runReread } from './reread'

// 이미 들어온 예약 다시 알아보기(spec google-link REQ-8544, design.md 21-2). 저장은 메모리 저장(deps.ts createMemoryStore — DB 조건 흉내).
// 구글은 부르지 않는다. 종류는 지금 기본 종류(도수·자보도수·충격파·주사·진료)만 써서 TASK-25(종류 고르기)와 상관없이 결과가 정해진다.
// 환자 이름·차트번호는 지어낸 값이다

const NOW_MS = Date.parse('2026-11-26T10:00:00+09:00')
const LINKED = '2026-11-23'
const SCRIPT = 'https://script.google.com/macros/s/AKfycbFake0123456789abc/exec'
const DB_UPDATED = '2026-11-25T01:00:00.123456+00:00' // DB가 준 g_updated 글자(마이크로초) — 그대로 견준다
const TITLE = '9567 장연습 자보 30분 (원)'
const PARTS: GcalParts = {
  staff: [
    { id: 's-ho', name: '정호연', mark: '호', color: 'lavender' },
    { id: 's-won', name: '박지원', mark: '원', color: 'banana' },
    { id: 's-hyun', name: '이수현', mark: '현', color: 'flamingo' },
  ],
  kinds: DEFAULT_CAL_SETTINGS.kinds,
  people: [
    { id: 's-ho', name: '정호연' },
    { id: 's-won', name: '박지원' },
    { id: 's-hyun', name: '이수현' },
  ],
}
const HOW = { staff: 'title', kind: 'setting', memo: false, gStart: '10:00', gEnd: '10:30' } as const
const WON = { staffId: 's-won', staffName: '박지원', staffMark: '원' }
const JABO = { kindId: 'jabo', kindName: '자보도수' }

function linkOf(over: Partial<GcalLink> = {}): GcalLink {
  return {
    scriptUrl: SCRIPT,
    secret: 'FakeKey_0123456789-abcdefABCDEF-xyz',
    calendarId: 'fake-calendar@group.calendar.google.com',
    calendarName: '예약',
    defaultHex: '#4285F4',
    linkedOn: LINKED,
    rules: { ...DEFAULT_GCAL_RULES },
    look: { ...DEFAULT_GCAL_LOOK, noStaffKinds: ['shock'] },
    ...over,
  }
}

function rig(link: Partial<GcalLink> = {}) {
  const now = () => new Date(NOW_MS)
  const mem = createMemoryStore({ now, link: linkOf(link), parts: PARTS })
  const call = vi.fn<GcalCaller>(async () => {
    throw new Error('다시 알아보기는 구글을 부르지 않는다')
  })
  const deps: GcalDeps = { hospitalId: '0123456789abcdef0123456789abcdef', call, store: mem.store, now }
  let n = 0
  // 받기로 들어온 구글 예약(웹앱이 구글 제목을 다시 적지 않음, 보낼 것 없음). 지금 저장 종류는 도수·시행자 정호연
  const seed = (over: Partial<CalAppt> = {}) =>
    mem.seedAppt({
      day: '2026-11-27',
      start: 600,
      len: 30,
      name: '장연습',
      chart: '9567',
      staffId: 's-ho',
      staffName: '정호연',
      staffMark: '호',
      kindId: 'dosu',
      kindName: '도수',
      memo: '',
      gEventId: `evreread${String(++n).padStart(4, '0')}`,
      gTitle: TITLE,
      gUpdated: DB_UPDATED,
      gColor: null,
      colorFrom: 'google',
      gKeepTitle: true,
      gFrom: 'pull',
      gHow: { ...HOW },
      ...over,
    })
  return { mem, deps, call, seed }
}

const rowOf = (mem: MemoryStore, id: string) => {
  const row = mem.db.appts.find((a) => a.id === id)
  if (!row) throw new Error(`줄 없음 ${id}`)
  return row
}
const rereads = (mem: MemoryStore) => mem.calls.filter((c) => c.fn === 'rereadAppt')

describe('AC-8544.1 다시 알아보기: 저장된 구글 제목·색·시각을 지금 설정으로', () => {
  it('AC-8544.1: 저장 종류 도수 + 구글 제목 `9567 장연습 자보 30분 (원)` → 자보도수(출처 title)·박지원(출처 title)만 바꾸고 구글 제목·색·g_wait·메모·날·시각은 그대로', async () => {
    const { mem, deps, call, seed } = rig()
    const before = seed()
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 1, kindChanged: 1, changed: 1, unread: 0, missed: 0 })
    expect(rowOf(mem, before.id)).toEqual({ ...before, ...JABO, ...WON, gHow: { ...HOW, kind: 'title', staff: 'title' } })
    expect(call).not.toHaveBeenCalled()
    expect(new Set(mem.calls.map((c) => c.fn))).toEqual(new Set(['loadLink', 'loadParts', 'listAppts', 'rereadAppt']))
  })

  it('AC-8544.1: 지난 1년부터 3년 뒤까지(한국 오늘 기준) 예약을 읽고, 처음 가져오기(import) 줄도 대상이다', async () => {
    const { mem, deps, seed } = rig()
    const imported = seed({ gFrom: 'import', day: '2026-01-05' })
    await runReread(deps)
    expect(mem.calls.find((c) => c.fn === 'listAppts')?.args).toEqual(['2025-11-26', '2029-11-26'])
    expect(rowOf(mem, imported.id)).toMatchObject({ ...JABO, ...WON })
  })

  it('AC-8544.1: 저장된 일정 색으로 시행자를 짐작한다(제목에 표시 없음 · 바나나 → 박지원, 출처 color)', async () => {
    const { mem, deps, seed } = rig()
    const row = seed({ gTitle: '1234 홍길동 자보도수', gColor: 'banana' })
    const done = await runReread(deps)
    expect(done).toMatchObject({ ok: true, read: 1, kindChanged: 1, changed: 1 })
    expect(rowOf(mem, row.id)).toMatchObject({ ...JABO, ...WON, gHow: { ...HOW, kind: 'title', staff: 'color' }, gColor: 'banana' })
  })

  it('AC-8544.1: g_how가 없는 줄은 g_how를 새로 만들지 않는다(종류·시행자 칸만 보냄)', async () => {
    const { mem, deps, seed } = rig()
    const row = seed({ gHow: null, staffId: 's-won', staffName: '박지원', staffMark: '원' })
    await runReread(deps)
    expect(rereads(mem).map((c) => c.args[1])).toEqual([JABO])
    expect(rowOf(mem, row.id).gHow).toBeNull()
  })
})

describe('AC-8544.2 고른 것·웹앱에서 고친 것은 그대로', () => {
  it('AC-8544.2: 종류가 picked면 종류는 그대로(시행자만), 시행자가 picked면 시행자는 그대로(종류만)', async () => {
    const { mem, deps, seed } = rig()
    const kindPicked = seed({ kindId: 'inj', kindName: '주사', gHow: { ...HOW, kind: 'picked' } })
    const staffPicked = seed({ staffId: 's-hyun', staffName: '이수현', staffMark: '현', gHow: { ...HOW, staff: 'picked' } })
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 2, kindChanged: 1, changed: 2, unread: 0, missed: 0 })
    expect(rowOf(mem, kindPicked.id)).toMatchObject({ kindId: 'inj', kindName: '주사', ...WON, gHow: { ...HOW, kind: 'picked', staff: 'title' } })
    expect(rowOf(mem, staffPicked.id)).toMatchObject({ ...JABO, staffId: 's-hyun', staffName: '이수현', staffMark: '현', gHow: { ...HOW, kind: 'title', staff: 'picked' } })
  })

  it('AC-8544.2: g_keep_title 거짓·g_from web·g_wait 있는 줄·구글 짝이 없는 줄은 대상이 아니다(세지도 적지도 않음)', async () => {
    const { mem, deps, seed } = rig()
    const kept = [
      seed({ gKeepTitle: false }),
      seed({ gFrom: 'web' }),
      seed({ gWait: 'edit' }),
      seed({ gFrom: null }),
      seed({ gEventId: null }),
      seed({ gTitle: null }),
    ]
    const before = kept.map((r) => rowOf(mem, r.id))
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 0, kindChanged: 0, changed: 0, unread: 0, missed: 0 })
    expect(kept.map((r) => rowOf(mem, r.id))).toEqual(before)
    expect(rereads(mem)).toEqual([])
  })
})

describe('AC-8544.3 못 알아본 줄은 전 값 그대로', () => {
  it('AC-8544.3: 예약 같지 않은 제목·종류를 못 고르는 제목은 시행자까지 그대로(적지 않음)이고 못 알아본 것으로 센다 — 예약표에서 빠지거나 고쳐야 할 것으로 가지 않는다', async () => {
    const { mem, deps, seed } = rig()
    const notAppt = seed({ gTitle: '원장님 회의' })
    const badKind = seed({ gTitle: '1234 홍길동 물리 (원)' }) // 모르는 글 '물리' → 종류 없음, 표시 (원)은 있지만 적지 않는다
    const before = [rowOf(mem, notAppt.id), rowOf(mem, badKind.id)]
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 2, kindChanged: 0, changed: 0, unread: 2, missed: 0 })
    expect([rowOf(mem, notAppt.id), rowOf(mem, badKind.id)]).toEqual(before)
    expect(rereads(mem)).toEqual([])
    expect(mem.db.appts).toHaveLength(2)
    expect(mem.db.fixes).toEqual([])
    expect(mem.calls.map((c) => c.fn)).not.toContain('upsertFixes')
  })

  it('AC-8544.3: 종류는 알아봤지만 시행자를 못 알아본 줄(앞으로 · 표시·색 없음)은 종류만 바꾸고 시행자를 비우지 않는다', async () => {
    const { mem, deps, seed } = rig()
    const row = seed({ gTitle: '1234 홍길동 자보' })
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 1, kindChanged: 1, changed: 1, unread: 0, missed: 0 })
    expect(rowOf(mem, row.id)).toMatchObject({ ...JABO, staffId: 's-ho', staffName: '정호연', staffMark: '호', gHow: { ...HOW, kind: 'title', staff: 'title' } })
    expect(rereads(mem).map((c) => c.args[1])).toEqual([{ ...JABO, gHow: { ...HOW, kind: 'title' } }])
  })
})

describe('AC-8544.4 결과', () => {
  it('AC-8544.4: 시행자만 바뀐 줄은 changed에만 들고, 바뀔 것이 없는 줄은 적지 않는다', async () => {
    const { mem, deps, seed } = rig()
    seed({ ...JABO }) // 종류는 이미 자보도수, 시행자만 바뀜
    seed({ ...JABO, ...WON, gHow: { ...HOW, kind: 'title' } }) // 같음
    const done = await runReread(deps)
    expect(done).toEqual({ ok: true, read: 2, kindChanged: 0, changed: 1, unread: 0, missed: 0 })
    expect(rereads(mem)).toHaveLength(1)
  })

  it("AC-8544.4: 잇지 않았으면(연결 없음·이은 날 없음) { ok: false, why: 'not-linked' }이고 예약을 읽지 않는다", async () => {
    const unlinked = rig({ linkedOn: null })
    unlinked.seed()
    expect(await runReread(unlinked.deps)).toEqual({ ok: false, why: 'not-linked' })
    expect(unlinked.mem.calls.map((c) => c.fn)).toEqual(['loadLink'])

    const none = rig()
    const store: GcalStore = { ...none.mem.store, loadLink: async () => null }
    expect(await runReread({ ...none.deps, store })).toEqual({ ok: false, why: 'not-linked' })
  })

  it.each(['loadLink', 'loadParts', 'listAppts'] as const)("AC-8544.4: 읽기(%s)가 던지면 { ok: false, why: 'failed' }이고 아무것도 적지 않는다", async (fn) => {
    const { mem, deps, seed } = rig()
    seed()
    const store: GcalStore = {
      ...mem.store,
      [fn]: async () => {
        throw new Error('읽기 실패')
      },
    }
    expect(await runReread({ ...deps, store })).toEqual({ ok: false, why: 'failed' })
    expect(rereads(mem)).toEqual([])
  })

  it('AC-8544.4: 쓰기는 10줄씩 동시에 보내고 모두 적는다', async () => {
    const { mem, deps, seed } = rig()
    for (let i = 0; i < 23; i++) seed()
    let flying = 0
    let most = 0
    const store: GcalStore = {
      ...mem.store,
      rereadAppt: async (...args) => {
        flying++
        most = Math.max(most, flying)
        await new Promise((resolve) => setTimeout(resolve, 1))
        flying--
        return mem.store.rereadAppt(...args)
      },
    }
    const done = await runReread({ ...deps, store })
    expect(done).toEqual({ ok: true, read: 23, kindChanged: 23, changed: 23, unread: 0, missed: 0 })
    expect(most).toBe(10)
  })
})

describe('AC-8544.5 그사이 다른 PC가 고친 줄은 적지 않는다', () => {
  it('AC-8544.5: 읽은 뒤 구글 제목이 바뀌었거나 g_wait가 생긴 줄은 0줄이라 적지 않고 missed로 센다', async () => {
    const { mem, deps, seed } = rig()
    const retitled = seed()
    const waiting = seed()
    const fine = seed()
    const store: GcalStore = {
      ...mem.store,
      listAppts: async (from, to) => {
        const rows = await mem.store.listAppts(from, to)
        // 읽은 뒤 다른 PC가 고쳤다
        Object.assign(rowOf(mem, retitled.id), { gTitle: '9567 장연습 도수 30분 (현)', gUpdated: '2026-11-26T00:59:00.000001+00:00' })
        Object.assign(rowOf(mem, waiting.id), { gWait: 'edit', gWaitAt: mem.stamp() })
        return rows
      },
    }
    const done = await runReread({ ...deps, store })
    expect(done).toEqual({ ok: true, read: 3, kindChanged: 1, changed: 1, unread: 0, missed: 2 })
    expect(rowOf(mem, retitled.id)).toMatchObject({ kindId: 'dosu', staffId: 's-ho' })
    expect(rowOf(mem, waiting.id)).toMatchObject({ kindId: 'dosu', staffId: 's-ho' })
    expect(rowOf(mem, fine.id)).toMatchObject({ ...JABO, ...WON })
  })

  it('AC-8544.5: 쓰기가 던지면 그 줄만 missed이고 나머지는 적는다', async () => {
    const { mem, deps, seed } = rig()
    const bad = seed()
    const good = seed()
    const store: GcalStore = {
      ...mem.store,
      rereadAppt: async (id, patch, expect) => {
        if (id === bad.id) throw new Error('저장 실패')
        return mem.store.rereadAppt(id, patch, expect)
      },
    }
    expect(await runReread({ ...deps, store })).toEqual({ ok: true, read: 2, kindChanged: 1, changed: 1, unread: 0, missed: 1 })
    expect(rowOf(mem, good.id)).toMatchObject(JABO)
  })

  it('AC-8544.5: 쓰기 조건은 읽은 구글 제목과 g_updated(DB 글자 그대로, 없으면 null)다', async () => {
    const { mem, deps, seed } = rig()
    const withStamp = seed()
    const noStamp = seed({ gUpdated: null })
    await runReread(deps)
    expect(rereads(mem).map((c) => [c.args[0], c.args[2]])).toEqual([
      [withStamp.id, { gTitle: TITLE, gUpdated: DB_UPDATED }],
      [noStamp.id, { gTitle: TITLE, gUpdated: null }],
    ])
  })

  it('AC-8544.5: 메모리 저장의 rereadAppt도 g_wait·구글 제목·g_updated가 읽은 값과 다르면 거짓이다', async () => {
    const { mem, seed } = rig()
    const row = seed()
    const expectOf = { gTitle: TITLE, gUpdated: DB_UPDATED }
    await expect(mem.store.rereadAppt(row.id, JABO, { ...expectOf, gUpdated: '2026-11-25T01:00:00.123457+00:00' })).resolves.toBe(false)
    await expect(mem.store.rereadAppt(row.id, JABO, { ...expectOf, gTitle: '다른 제목' })).resolves.toBe(false)
    expect(rowOf(mem, row.id).kindId).toBe('dosu')
    await expect(mem.store.rereadAppt(row.id, JABO, expectOf)).resolves.toBe(true)
    expect(rowOf(mem, row.id)).toMatchObject({ ...JABO, gWait: null, gWaitAt: null })
  })
})

describe('AC-8544.1 planReread(순수 셈)', () => {
  it('AC-8544.1: 대상 수·못 알아본 수·줄마다 쓸 칸과 조건을 낸다', async () => {
    const { mem, seed } = rig()
    const changes = seed()
    seed({ gTitle: '원장님 회의' })
    seed({ gFrom: 'web' })
    const link = linkOf()
    const ctx = { staff: PARTS.staff, kinds: PARTS.kinds, people: PARTS.people, look: link.look, arrival: link.rules.arrival, linkedOn: LINKED }
    const plan = planReread(mem.db.appts, ctx)
    expect(plan).toEqual({
      read: 2,
      unread: 1,
      writes: [{ id: changes.id, expect: { gTitle: TITLE, gUpdated: DB_UPDATED }, patch: { ...JABO, ...WON, gHow: { ...HOW, kind: 'title' } }, kindChanged: true }],
    })
  })
})
