import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { addMonths } from '../src/lib/analytics/dates'
import type { ReportMonths } from '../src/app/api/ai/store'

// 리포트 뽑아 보기 명령의 시험할 논리(TASK-15). 가짜 숫자는 fixtures/fake-ai/에서만 읽는다

function readMonth(dir: string, month: string): unknown | null {
  try {
    return JSON.parse(readFileSync(join(dir, 'months', `${month}.json`), 'utf8'))
  } catch {
    return null // 파일이 없으면 그 달 자료 없음
  }
}

export function fakeMonthsLoader(dir: string): (month: string) => Promise<ReportMonths> {
  return async (month) => ({
    selected: readMonth(dir, month),
    prev: readMonth(dir, addMonths(month, -1)),
    lastYear: readMonth(dir, addMonths(month, -12)),
    groupNames: JSON.parse(readFileSync(join(dir, 'groups.json'), 'utf8')) as Record<string, string>,
  })
}

// '<달>-<YYYYMMDD-HHmmss>.md' (한국 시각)
export function resultFileName(month: string, now: Date): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now)
  const p = (type: string) => parts.find((x) => x.type === type)?.value ?? ''
  return `${month}-${p('year')}${p('month')}${p('day')}-${p('hour')}${p('minute')}${p('second')}.md`
}

// 열쇠가 없으면 안내 글자, 있으면 null. 열쇠 값은 담지 않는다
export function missingKeyMessage(env: Record<string, string | undefined>): string | null {
  const key = env.ANTHROPIC_API_KEY
  if (typeof key === 'string' && key.trim() !== '') return null
  return '열쇠가 없어요. 따로 연 터미널에서 `npm run ai:key`로 넣어 주세요. 넣은 뒤 `npm run ai:try`를 다시 치세요.'
}
