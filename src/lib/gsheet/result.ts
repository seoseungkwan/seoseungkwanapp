import { compareYmd } from '@/lib/analytics/dates'
import { koreaClock } from './plan'
import type { FillMode, FillReply, FillVia } from './shapes'

// 넣기 결과 줄(spec google-link REQ-8512 AC-8512.2) — 글은 승인 시안 notes-sunap `done`·`done-warn` 그대로.
// 무엇을 어느 줄에 붙이는지는 비트시트 MainForm.ShowResult · RunNotes(Warnings·OneLine·RatioLine) · DayStats.UncountedText를 따른다:
//   1줄 head  = ✔/⚠ + '— M월 d일 시트 · 방식 · HH:mm' + 네 숫자
//   2줄 extra = 있는 것만 ' · '로 + '새 달 파일: …'(늘) + 공유 못 한 메일·비율 식 고침
//   확인 필요 warn = { line: 끝말 '— 시트에서 확인해 주세요'는 한 번, 지난 날이면 'M월 d일 시트: ', why: 풀이 }
//   3줄 notPut = '넣지 않음: …' + 비율 식을 그대로 둔 칸·고치지 못함(비트시트처럼 확인 필요는 아님)
// 숫자만 받고 글만 돌려준다.

export type ResultCtx = { day: string; mode: FillMode; via: FillVia; at: Date }
export type ResultCount = { label: string; n: number; unit: string }
export type ResultLines = {
  head: { tone: 'ok' | 'warn'; title: string; where: string; counts: ResultCount[]; countsText: string }
  extra: string
  notPut: string
  warn: { line: string; why: string } | null
}

const SEP = ' · '
const CHECK_TAIL = ' — 시트에서 확인해 주세요'
const WHY_CANCEL = '취소된 접수: 비고나 예약관리 칸에 직원 글이 있어서 그 줄을 지우지 않았어요.'
const WHY_SKIP = '건너뛴 줄: 늦게 낸 돈을 붙일 바로 아래 줄이 차 있고 맨 아래 줄도 차 있어서 넣지 못했어요.'
/** 비율 식을 그대로 둔 칸 주소를 몇 개까지 보이나(비트시트 RatioLine) */
const RATIO_CELLS_SHOWN = 4

const pad = (n: number) => String(n).padStart(2, '0')
/** '11월 26일' */
const dayText = (ymd: string) => `${Number(ymd.slice(5, 7))}월 ${Number(ymd.slice(8, 10))}일`
const clockText = (minute: number) => {
  const m = Math.floor(minute)
  return `${pad(Math.floor(m / 60))}:${pad(m % 60)}`
}
/** n이 0보다 클 때만 글 */
const some = (n: number, text: string) => (n > 0 ? [text] : [])

/** 넣기는 됐지만 사람이 시트를 봐야 하는 것(비트시트 RunNotes.Warnings). 하나라도 있으면 '확인 필요' */
export function fillWarnings(reply: FillReply): string[] {
  return [
    ...some(reply.cancelKept, `취소된 접수 ${reply.cancelKept}명${CHECK_TAIL}`),
    ...some(reply.skipped, `건너뛴 줄 ${reply.skipped}개${CHECK_TAIL}`),
    ...(reply.full ? ['빈 줄이 모자라 다 넣지 못했어요'] : []),
    ...(reply.oldCode ? ['구글 코드가 옛 판이에요 — [설정] › 구글 연결에서 코드를 새로 붙여 주세요'] : []),
  ]
}

/** 같은 끝말 '— 시트에서 확인해 주세요'는 한 번만(비트시트 RunNotes.OneLine) */
function oneLine(notes: readonly string[]): string {
  const check = notes.filter((n) => n.endsWith(CHECK_TAIL)).map((n) => n.slice(0, -CHECK_TAIL.length))
  const rest = notes.filter((n) => !n.endsWith(CHECK_TAIL))
  return [...(check.length > 0 ? [check.join(SEP) + CHECK_TAIL] : []), ...rest].join(SEP)
}

/** 비율 식을 그대로 둔 칸·고치지 못함(비트시트 RatioLine에서 고친 칸 수를 뺀 것 — 고친 칸 수는 2줄) */
function ratioTrouble(reply: FillReply): string[] {
  const parts: string[] = []
  if (reply.ratioSkippedCount > 0) {
    const shown = reply.ratioSkipped.slice(0, RATIO_CELLS_SHOWN)
    const cells = shown.length > 0 ? `: ${shown.join(', ')}${reply.ratioSkippedCount > shown.length ? ' 등' : ''}` : ''
    parts.push(`이 칸들은 식 모양이 달라 그대로 두었어요${cells} (${reply.ratioSkippedCount}칸) — 비율이 조금 낮게 나올 수 있어요. 필요하면 원장님께 알려 주세요`)
  }
  if (reply.ratioFailed) parts.push('비율 식을 고치지 못했어요(다음 넣기 때 다시 해요)')
  return parts
}

export function resultLines(reply: FillReply, ctx: ResultCtx): ResultLines {
  const notes = fillWarnings(reply)
  const at = koreaClock(ctx.at)
  const overwrite = ctx.mode === 'overwrite'
  const how = ctx.via !== 'hand' ? '저절로 넣기' : overwrite ? '덮어쓰기' : '빈 칸만 채우기'
  const counts: ResultCount[] = [
    { label: '오늘 환자', n: reply.patients, unit: '명' },
    { label: '새로 넣은 줄', n: reply.added, unit: '' },
    { label: overwrite ? '바꾼 줄' : '채운 줄', n: overwrite ? reply.overwritten : reply.filled, unit: '' },
    { label: '건너뛴 줄', n: reply.skipped, unit: '' },
  ]
  const extra = [
    ...some(reply.split, `나눠 낸 돈 ${reply.split}명(두 줄로)`),
    ...some(reply.free, `FREE ${reply.free}명`),
    ...some(reply.inserted, `늦게 낸 돈 끼워 넣은 줄 ${reply.inserted}`),
    ...some(reply.freeFixed, `FREE로 고침 ${reply.freeFixed}명`),
    ...some(reply.cancelCleared, `취소된 접수 지움 ${reply.cancelCleared}명`),
    ...some(reply.paidOnly, `미수만 낸 환자 ${reply.paidOnly}명(이름 줄)`),
    ...some(reply.notes, `비고 넣음 ${reply.notes}칸`),
    `새 달 파일: ${reply.created ? '새로 만듦' : '이번 달 파일 그대로 씀'}`,
    ...some(reply.shareFailed, `공유 못 한 메일 ${reply.shareFailed}`),
    ...some(reply.ratioFixed, `비율 식 고침 ${reply.ratioFixed}칸`),
  ]
  const { noName, unlinked, negative, noChart } = reply.notPut
  const missed = [
    ...some(noName, `이름을 모르는 미수만 낸 환자 ${noName}명`),
    ...some(unlinked, `내원에 안 붙은 수납 ${unlinked}줄`),
    ...some(negative, `0보다 작은 돈 ${negative}개`),
    ...some(noChart, `차트번호 없는 내원 ${noChart}건`),
  ]
  const notPut = [...(missed.length > 0 ? [`넣지 않음: ${missed.join(SEP)}`] : []), ...ratioTrouble(reply)]
  const pastDay = compareYmd(ctx.day, at.day) < 0
  const why = [...some(reply.cancelKept, WHY_CANCEL), ...some(reply.skipped, WHY_SKIP)]
  return {
    head: {
      tone: notes.length > 0 ? 'warn' : 'ok',
      title: notes.length > 0 ? '⚠ 넣었어요 · 확인 필요' : '✔ 넣었어요',
      where: `— ${dayText(ctx.day)} 시트 · ${how} · ${clockText(at.minute)}`,
      counts,
      countsText: counts.map((c) => `${c.label} ${c.n}${c.unit}`).join(SEP),
    },
    extra: extra.join(SEP),
    notPut: notPut.join(SEP),
    warn: notes.length === 0 ? null : { line: (pastDay ? `${dayText(ctx.day)} 시트: ` : '') + oneLine(notes), why: why.join(' ') },
  }
}
