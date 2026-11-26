import { describe, expect, it } from 'vitest'
import { pastArrivalStep } from './pastArrival'

// 지난 예약 도착 채우기 계획(spec google-link AC-8536.1·AC-8536.2·AC-8541.2, design.md 12-4).
// 비트 PC가 이은 병원의 예약 탭을 열어 두면 60초마다 한 주(7일)씩, 어디까지 했는지(arrival_until = 다음에 할 마지막 날)부터 거꾸로 채운다.
// 도우미가 CAL_PAST_HELPER(0.14.0) 이상이면 한국 오늘 − 1년까지, 아래 판이면 calday 옛 한도(오늘 − 62일) 안만 한다(다 채움으로 적지 않음)

const TODAY = '2026-11-26'
const NEW = '0.14.0'
const OLD = '0.13.2'

describe('pastArrivalStep — 한 주씩 최근 날부터 (AC-8536.1)', () => {
  it('AC-8536.1: 처음(어디까지 없음)은 어제부터 7일 전까지 읽고, 다음은 그 앞날부터다', () => {
    expect(pastArrivalStep({ today: TODAY, until: null, done: false, helper: NEW })).toEqual({
      kind: 'read',
      from: '2026-11-19',
      to: '2026-11-25',
      next: '2026-11-18',
      done: false,
    })
  })

  it('AC-8536.1: 남겨 둔 곳(arrival_until)부터 이어 한다(다른 PC·다음에 연 탭)', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2026-11-18', done: false, helper: NEW })).toEqual({
      kind: 'read',
      from: '2026-11-12',
      to: '2026-11-18',
      next: '2026-11-11',
      done: false,
    })
  })

  it('AC-8536.1: 남겨 둔 곳이 어제보다 뒤면 어제부터다(오늘·앞날은 지금 도착 셈이 한다)', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2026-11-30', done: false, helper: NEW })).toMatchObject({ kind: 'read', from: '2026-11-19', to: '2026-11-25' })
  })

  it('AC-8536.2: 한국 오늘 − 1년에 닿는 마지막 주는 그날에서 자르고 다 채움(done)으로 적는다', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2025-11-29', done: false, helper: NEW })).toEqual({
      kind: 'read',
      from: '2025-11-26',
      to: '2025-11-29',
      next: '2025-11-25',
      done: true,
    })
  })

  it('AC-8536.2: 남겨 둔 곳이 이미 1년 앞이고 아직 다 채움이 아니면 읽지 않고 다 채움만 적는다', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2025-11-25', done: false, helper: NEW })).toEqual({ kind: 'finish' })
  })

  it('AC-8536.2: 다 채웠으면 아무것도 하지 않는다(알림도 한 번만)', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2025-11-25', done: true, helper: NEW })).toBeNull()
    expect(pastArrivalStep({ today: TODAY, until: null, done: true, helper: NEW })).toBeNull()
  })
})

describe('pastArrivalStep — 옛 도우미는 62일 안만 (AC-8541.2)', () => {
  it('AC-8541.2: 도우미 0.13.x는 오늘 − 62일 앞으로는 읽지 않는다(그 날에서 자르고 다 채움으로 적지 않는다)', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2026-09-27', done: false, helper: OLD })).toEqual({
      kind: 'read',
      from: '2026-09-25',
      to: '2026-09-27',
      next: '2026-09-24',
      done: false,
    })
  })

  it('AC-8541.2: 옛 도우미가 62일 끝에 닿으면 멈추고(null) 새 도우미가 이어 한다', () => {
    expect(pastArrivalStep({ today: TODAY, until: '2026-09-24', done: false, helper: OLD })).toBeNull()
    expect(pastArrivalStep({ today: TODAY, until: '2026-09-24', done: false, helper: NEW })).toMatchObject({ kind: 'read', from: '2026-09-18', to: '2026-09-24' })
  })

  it('AC-8541.2: 처음이면 옛 도우미도 어제부터 한 주를 읽는다', () => {
    expect(pastArrivalStep({ today: TODAY, until: null, done: false, helper: OLD })).toMatchObject({ kind: 'read', from: '2026-11-19', to: '2026-11-25', done: false })
  })
})
