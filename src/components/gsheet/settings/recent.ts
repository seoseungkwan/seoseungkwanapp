import { todayInKorea } from '@/lib/analytics/dates'
import { koreaClock } from '@/lib/gsheet/plan'
import type { GsheetRun } from '@/types/gsheet'
import { AUTO } from './labels'

// '저절로 넣기 › 최근 기록' 한 줄(spec google-link AC-8516.6, notes-sunap `settings` 최근 기록).
// 비트시트 SettingsForm.FillRecent 그대로: 오늘 기록만 새것부터 여섯, 성공 '{HH:mm} ✔ 새 줄 n'(새 줄이 없으면 채운 줄, 둘 다 없으면 ✔만),
// 바뀐 것 없음 '{HH:mm} 바뀐 것 없음', 실패 '{HH:mm} {구글 연결 안 됨|비트 못 읽음|넣지 못함}', 확인 필요는 ✔ 대신 ⚠.
// 시안 꼴 '11:10 구글 연결 안 됨 → 11:15 다시 넣음 ✔': 실패 바로 다음 기록이 성공(✔)이면 한 덩어리로 잇는다(확인 필요 ⚠는 따로 둔다).
// 기록에는 숫자·오류 번호만 있다(환자 값 없음)

export type RecentPart = { text: string; warn: boolean }
/** 한 덩어리 = 글 조각들(실패 종류만 주황) */
export type RecentItem = RecentPart[]

const SHOWN = 6
const BIT_CODE = /^E-(BIT|BRIDGE|HELPER)-/

const pad = (n: number) => String(n).padStart(2, '0')
function hhmm(at: string): string {
  const minute = Math.floor(koreaClock(new Date(Date.parse(at))).minute)
  return `${pad(Math.floor(minute / 60))}:${pad(minute % 60)}`
}

function failKind(code: string | null): string {
  if (code === 'E-GSHEET-NET') return AUTO.failNet
  if (code !== null && BIT_CODE.test(code)) return AUTO.failBit
  return AUTO.failOther
}

const count = (run: GsheetRun, key: string) => {
  const n = run.counts[key]
  return typeof n === 'number' && Number.isFinite(n) ? n : 0
}
const mark = (run: GsheetRun) => (run.outcome === 'warn' ? '⚠' : '✔')

function okText(run: GsheetRun): string {
  const added = count(run, 'added')
  const filled = count(run, 'filled')
  const what = added > 0 ? AUTO.recentAdded(added) : filled > 0 ? AUTO.recentFilled(filled) : ''
  return `${hhmm(run.at)} ${mark(run)}${what}`
}

function itemOf(run: GsheetRun): RecentItem {
  if (run.outcome === 'same') return [{ text: `${hhmm(run.at)} ${AUTO.recentSame}`, warn: false }]
  if (run.outcome === 'fail') return [{ text: `${hhmm(run.at)} `, warn: false }, { text: failKind(run.code), warn: true }]
  return [{ text: okText(run), warn: run.outcome === 'warn' }]
}

/** 오늘(한국) 기록 → 새것부터 여섯 덩어리. 없으면 빈 목록 */
export function recentItems(runs: readonly GsheetRun[], now: Date): RecentItem[] {
  const today = todayInKorea(now)
  const list = runs
    .filter((run) => Number.isFinite(Date.parse(run.at)) && todayInKorea(new Date(Date.parse(run.at))) === today)
    .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
  const items: RecentItem[] = []
  for (let i = 0; i < list.length; i++) {
    const run = list[i]!
    const next = list[i + 1]
    if (run.outcome === 'fail' && next?.outcome === 'ok') {
      items.push([...itemOf(run), { text: ` → ${hhmm(next.at)} ${AUTO.recentAgain} ✔`, warn: false }])
      i++
      continue
    }
    items.push(itemOf(run))
  }
  return items.reverse().slice(0, SHOWN)
}
