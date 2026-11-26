import { addDays, addMonthsToDay, compareYmd } from '@/lib/analytics/dates'
import { compareVersions } from '@/lib/bridge/handshake'
import { CAL_PAST_HELPER } from '@/lib/bridge/versions'

// 지난 예약 도착 채우기 계획(spec google-link AC-8536.1·AC-8536.2·AC-8541.2, design.md 12-4). 순수 함수다.
// 비트 PC의 예약 탭이 60초마다 한 번 부른다: 어디까지 했는지(gcal_state.arrival_until = 다음에 읽을 마지막 날, 없으면 어제)부터 7일씩 거꾸로.
// 도우미가 CAL_PAST_HELPER 이상이면 한국 오늘 − 1년까지 하고 다 채움(done)으로 적는다.
// 아래 판(0.13.x)은 calday 옛 한도(오늘 − 62일) 안만 하고 다 채움으로 적지 않는다 — 새 도우미가 그 앞을 이어 한다

const WEEK = 7
const OLD_BACK_DAYS = 62

export type PastInput = { today: string; until: string | null; done: boolean; helper: string }
/** read = from~to를 읽어 채우고 arrival_until = next, done이면 다 채움 · finish = 읽지 않고 다 채움만 적는다 */
export type PastStep = { kind: 'read'; from: string; to: string; next: string; done: boolean } | { kind: 'finish' }

const later = (a: string, b: string) => (compareYmd(a, b) >= 0 ? a : b)
const earlier = (a: string, b: string) => (compareYmd(a, b) <= 0 ? a : b)

/** 이번에 할 일. null = 할 일 없음(다 채웠거나 옛 도우미가 한도 끝에 닿음) */
export function pastArrivalStep({ today, until, done, helper }: PastInput): PastStep | null {
  if (done) return null
  const full = compareVersions(helper, CAL_PAST_HELPER) >= 0
  const floor = full ? addMonthsToDay(today, -12) : addDays(today, -OLD_BACK_DAYS)
  const yesterday = addDays(today, -1)
  const to = until === null ? yesterday : earlier(until, yesterday)
  if (compareYmd(to, floor) < 0) return full ? { kind: 'finish' } : null
  const from = later(addDays(to, -(WEEK - 1)), floor)
  return { kind: 'read', from, to, next: addDays(from, -1), done: full && compareYmd(from, floor) <= 0 }
}
