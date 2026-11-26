import { todayInKorea } from '@/lib/analytics/dates'
import { BridgeError, isErrorCode, isRecord } from '@/lib/bridge/protocol'
import { arrivalOf, visibleGhosts } from '@/lib/calendar/rules'
import type { ApptAuto } from '@/lib/calendar/shapes'
import { createAssembler, type AssembleResult } from '../patients/assemble'
import type { CalendarOp, CalendarWorkerMessage } from './messages'
import { BAD_REPLY, type DayReply, type DaysAsk, readDay, readDaysAsk, readFound, readStreamRef, REJECTED } from './read'

// 예약 Worker 메시지(spec clinic-calendar design.md 'Worker 메시지', REQ-5904) [환자 자료 구역]. calendar.worker.ts가 잇기만 하고 시험은 이 함수를 바로 부른다.
// 화면으로 가는 것은 찾은 사람(found)·도착 auto와 비트 예약 칸(days)·지난 예약 도착 auto(past)·오류 번호(error)뿐이다.
// 비트 접수 차트번호 목록(came)·생일은 여기서 셈에만 쓰고 버린다(AC-5904.3). 조각 글자는 통로 포트로만 온다

// 포트의 end는 화면이 find·days를 보내기 전에 이미 떠났다. 이만큼 안 오면 오지 않는 것으로 친다
const TAKE_WAIT_MS = 60_000
const NONE: ReadonlySet<string> = new Set()

type Rec = Record<string, unknown>

// 번호가 있는 오류는 그 번호, 나머지는 글(환자 값이 섞일 수 있다)을 버리고 기본 번호
const codeOf = (error: unknown) => (error instanceof BridgeError ? error.code : BAD_REPLY)

/** 상태 auto·오늘(한국 날짜) 이하·답 기간 안 예약 중 도착 자동 값이 서버 값과 다른 것만 */
function autoOf(reply: DayReply, ask: DaysAsk): [string, ApptAuto][] {
  const today = todayInKorea(ask.now)
  const auto: [string, ApptAuto][] = []
  for (const appt of ask.appts) {
    if (appt.status !== 'auto' || appt.day > today || appt.day < reply.from || appt.day > reply.to) continue
    const value = arrivalOf(appt, reply.came.get(appt.day) ?? NONE, ask.now)
    if (value !== appt.auto) auto.push([appt.id, value])
  }
  return auto
}

/** 도착 auto + 비트 예약 칸(visibleGhosts로 가림) */
function daysView(reply: DayReply, ask: DaysAsk): Extract<CalendarWorkerMessage, { type: 'days' }> {
  return { type: 'days', from: reply.from, to: reply.to, auto: autoOf(reply, ask), ghosts: visibleGhosts(reply.ghosts, ask.appts) }
}

/** 지난 예약 도착 채우기(google-link AC-8536.1): 같은 규칙의 도착 auto만(비트 예약 칸은 그리지 않는다) */
function pastView(reply: DayReply, ask: DaysAsk): Extract<CalendarWorkerMessage, { type: 'past' }> {
  return { type: 'past', from: reply.from, to: reply.to, auto: autoOf(reply, ask) }
}

export function createHandler(deps: { post(message: unknown): void }) {
  const post = (message: CalendarWorkerMessage) => deps.post(message)
  const postError = (op: CalendarOp, code: string) => post({ type: 'error', op, code })
  const assembler = createAssembler()
  // 일마다 늘린다. 같은 일의 앞 메시지 답은 보내지 않는다
  const epochs: Record<CalendarOp, number> = { find: 0, days: 0, past: 0 }

  function takeInTime(id: string): Promise<AssembleResult> {
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        // 모으던 글자를 지우고 늦은 조각·end를 받지 않는다
        assembler.abort(id, BAD_REPLY)
        resolve({ ok: false, code: BAD_REPLY })
      }, TAKE_WAIT_MS)
      void assembler.take(id).then((result) => {
        clearTimeout(timer)
        resolve(result)
      })
    })
  }

  // 스트림 답을 기다려 읽고 보낸다. 표가 맞으면 나머지가 틀려도 그 답을 가져가 메모리에서 지운다
  function run<A>(op: CalendarOp, targets: unknown, ask: A | null, view: (json: unknown, ask: A) => CalendarWorkerMessage) {
    const asked = ++epochs[op]
    const ref = readStreamRef(targets)
    const take = ref && 'id' in ref ? takeInTime(ref.id) : Promise.resolve<AssembleResult>({ ok: false, code: ref?.code ?? REJECTED })
    if (!ref || ask === null) return postError(op, REJECTED)
    void take.then((result) => {
      if (asked !== epochs[op]) return // 새 메시지가 앞섰다. 그쪽이 답한다
      if (!result.ok) return postError(op, result.code)
      let message: CalendarWorkerMessage
      try {
        message = view(result.json, ask)
      } catch (error) {
        return postError(op, codeOf(error))
      }
      post(message)
    })
  }

  function route(message: unknown) {
    if (!isRecord(message)) return
    if (message.type === 'find') return run('find', message.targets, {}, (json) => ({ type: 'found', ...readFound(json) }))
    if (message.type === 'days') return run('days', message.targets, readDaysAsk(message), (json, ask) => daysView(readDay(json), ask))
    if (message.type === 'past') return run('past', message.targets, readDaysAsk(message), (json, ask) => pastView(readDay(json), ask))
  }

  function routePort(message: unknown) {
    if (!isRecord(message)) return
    const { type, id } = message as Rec
    if (typeof id !== 'string') return
    if (type === 'chunk') {
      if (typeof message.seq === 'number' && typeof message.data === 'string') assembler.chunk(id, message.seq, message.data)
      else assembler.abort(id, BAD_REPLY)
    } else if (type === 'end') {
      if (typeof message.count === 'number' && typeof message.bytes === 'number' && typeof message.sha256 === 'string') {
        assembler.end(id, message.count, message.bytes, message.sha256)
      } else assembler.abort(id, BAD_REPLY)
    } else if (type === 'abort') {
      assembler.abort(id, isErrorCode(message.code) ? message.code : BAD_REPLY)
    }
  }

  return {
    onScreen(message: unknown): void {
      try {
        route(message)
      } catch {
        // 메시지 하나로 Worker가 멈추지 않는다. 오류 글에는 환자 값이 섞일 수 있어 어디에도 싣지 않는다
      }
    },

    onPort(message: unknown): void {
      try {
        routePort(message)
      } catch {
        // onScreen과 같다
      }
    },
  }
}
