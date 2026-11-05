// 같은 처방 재방문 개인정보 E2E(fu-rate REQ-1309, AC-1309.1·AC-1309.2): 실제 Supabase 시험 계정 + 가짜 비트 파일.
// 이 기능의 새 SQL은 없다. 시험 계정(.env.local)만 있으면 돈다(고른 처방 표 stats_rx_picks는 rx-picker 때 붙인 것)
// 돌리는 법: `npm run e2e -- e2e/fu-rate-privacy.spec.ts` (next build가 먼저 돈다: 다른 일이 없을 때)
// CRITICAL: 요청 머리(authorization·apikey·cookie)와 응답 내용은 읽지도 찍지도 않는다. 실패 글에는 걸린 종류와 자리(가린 경로·줄 번호)만 싣는다. 값은 모으지 않는다
// e2e/rx-picker-privacy.spec.ts와 같은 방법이다. 그 파일을 불러오면 그 시험까지 함께 등록되므로 필요한 도우미를 여기에 따로 둔다
import type { BrowserContext, Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BIT_HEADER, buildFakeBitTable, toCsvBytes } from '../fixtures/make-fake-fixtures'
import { validateDayPayload } from '../src/lib/payload/validate'
import type { DayPayload } from '../src/types/payload'
import { expect, test } from './support'

// 화면·시험 산출물에 개인정보가 남지 않게 한다
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const SLOW = { timeout: 30_000 }
const PICKS_TABLE = 'stats_rx_picks'
const DAYS_TABLE = 'stats_days'
const PICKS_PATH = `/rest/v1/${PICKS_TABLE}`
const DAYS_PATH = `/rest/v1/${DAYS_TABLE}`
const COVERAGE_PATH = '/rest/v1/stats_coverage'
// 가짜 파일 이름. 이 글자도 나가면 안 된다
const FILE_NAME = 'fake-fu-rate-privacy.csv'
// 머리 검사에서 뺀다(AC-1309.1): 세션 값이라 읽지도 찍지도 않는다
const SKIPPED_HEADERS = new Set(['authorization', 'apikey', 'cookie'])
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])
// 이 시간 동안 새 요청이 없으면 조용해졌다고 본다. 단추가 읽기를 부르면 누른 바로 뒤에 나간다
const QUIET_MS = 1_500

const col = (name: string) => BIT_HEADER.indexOf(name)
type Kind = 'chart' | 'name' | 'phone' | 'national-id' | 'file-name'
type Hit = { kind: Kind; path: string }

// 본문 줄만 고른다: 머리줄·기간 줄·반복 머리줄·소계·합계는 빼고 차트번호가 숫자인 줄. 칸 이름(차트번호 등)이 개인 값으로 세어지지 않게 한다
function bodyRows(table: string[][]): string[][] {
  const header = table.findIndex((row) => row[col('처방코드')] === '처방코드' && row[col('차트번호')] === '차트번호')
  if (header < 0) throw new Error('가짜 표에서 머리줄을 못 찾았어요')
  return table.slice(header + 1).filter((row) => /^\d+$/.test(row[col('차트번호')] ?? ''))
}

// 개인 값: 본문 줄의 차트번호·이름 칸·전화 칸 값(세 글자 이상만: 짧은 글자는 화면 문구와 겹친다)
function personalValues(rows: string[][]): Array<{ kind: Kind; value: string }> {
  const pick = (kind: Kind, names: string[]) => names.flatMap((n) => rows.map((row) => ({ kind, value: (row[col(n)] ?? '').trim() })))
  const all = [...pick('chart', ['차트번호']), ...pick('name', ['성명']), ...pick('phone', ['전화번호', '휴대폰'])]
  const seen = new Set<string>()
  return all.filter(({ kind, value }) => value.length >= 3 && !seen.has(`${kind}:${value}`) && seen.add(`${kind}:${value}`))
}

const NATIONAL_ID = /\d{6}-?[1-8]\d{6}/
const PHONE_SHAPE = /01[016789]-?\d{3,4}-?\d{4}/

// 요청 주소·본문·머리를 훑어 걸린 종류만 낸다. 주소는 쿼리를 뺀 길만 남긴다
function scan(url: string, text: string, values: ReturnType<typeof personalValues>): Hit[] {
  const path = safePath(url)
  const all = `${decodeSafe(url)}\n${text}`
  const hits: Hit[] = []
  for (const { kind, value } of values) if (all.includes(value)) hits.push({ kind, path })
  if (NATIONAL_ID.test(all)) hits.push({ kind: 'national-id', path })
  if (PHONE_SHAPE.test(all)) hits.push({ kind: 'phone', path })
  if (all.includes(FILE_NAME)) hits.push({ kind: 'file-name', path })
  return hits
}

function decodeSafe(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return '(주소 읽기 실패)'
  }
}

type Watch = { hits: Hit[]; unread: string[]; days: string[]; picks: string[]; seen: string[] }

// context 단위라 Web Worker가 보낸 요청도 잡힌다. authorization·apikey·cookie 머리만 빼고 머리도 훑는다
function watchOutgoing(context: BrowserContext, values: ReturnType<typeof personalValues>): Watch {
  const watch: Watch = { hits: [], unread: [], days: [], picks: [], seen: [] }
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    const path = safePath(url)
    const buffer = request.postDataBuffer()
    const body = buffer === null ? '' : buffer.toString('utf8')
    const headers = Object.entries(request.headers())
      .filter(([name]) => !SKIPPED_HEADERS.has(name.toLowerCase()))
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n')
    watch.hits.push(...scan(url, `${body}\n${headers}`, values))
    watch.seen.push(`${method} ${path}`)
    // 못 읽은 몸통은 빈 몸통으로 치지 않고 실패로 센다(로그인 길은 몸통을 보지 않는다)
    if (BODY_METHODS.has(method) && body === '' && !path.startsWith('/auth/v1/')) watch.unread.push(path)
    if (method === 'POST' && path === DAYS_PATH && body !== '') watch.days.push(body)
    if (path === PICKS_PATH && body !== '') watch.picks.push(body)
  })
  return watch
}

const count = (watch: Watch, method: string, path: string) => watch.seen.filter((entry) => entry === `${method} ${path}`).length

// 새 요청이 QUIET_MS 동안 하나도 없을 때까지 기다린다(시험 시간 제한이 끝없이 기다리지 않게 막는다)
async function settle(page: Page, watch: Watch): Promise<void> {
  let last = -1
  while (last !== watch.seen.length) {
    last = watch.seen.length
    await page.waitForTimeout(QUIET_MS)
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const keysOf = (value: Record<string, unknown>) => Object.keys(value).sort().join(',')
const isCount = (value: unknown): value is number => typeof value === 'number' && Number.isInteger(value) && value >= 0
const isCounts = (value: unknown) => Array.isArray(value) && value.length === 3 && value.every((item) => item === null || isCount(item))

// 본문(객체나 객체 목록)의 열쇠 모음
function bodyKeys(body: string): string[] {
  const parsed: unknown = JSON.parse(body)
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return [...new Set(items.flatMap((item) => Object.keys(item as Record<string, unknown>)))].sort()
}

// 저장 본문(객체나 객체 목록)을 줄 목록으로 편다
function bodyItems(bodies: readonly string[]): unknown[] {
  return bodies.flatMap((body) => {
    const parsed: unknown = JSON.parse(body)
    return Array.isArray(parsed) ? parsed : [parsed]
  })
}

// AC-1309.1: again 칸 모양. 열쇠는 ready·rx, 그 줄은 code·starts·back·more뿐이고 값은 참·거짓·0 이상 정수·null과 이 파일의 처방 코드뿐이다.
// 환자 번호·날짜 목록이 끼어들 자리가 없다. 걸린 종류만 낸다(값은 싣지 않는다)
type AgainKind = 'no-again' | 'again-keys' | 'ready' | 'rx-list' | 'rx-keys' | 'code' | 'starts' | 'counts'
function againKinds(again: unknown, codes: ReadonlySet<string>): AgainKind[] {
  if (again === undefined) return ['no-again']
  if (!isRecord(again) || keysOf(again) !== 'ready,rx') return ['again-keys']
  const kinds = new Set<AgainKind>()
  const { ready, rx } = again
  if (!Array.isArray(ready) || ready.length !== 3 || !ready.every((item) => typeof item === 'boolean')) kinds.add('ready')
  if (!Array.isArray(rx)) return [...kinds, 'rx-list']
  for (const line of rx) {
    if (!isRecord(line) || keysOf(line) !== 'back,code,more,starts') {
      kinds.add('rx-keys')
      continue
    }
    const { code, starts, back, more } = line
    if (typeof code !== 'string' || !codes.has(code)) kinds.add('code')
    if (!isCount(starts) || starts < 1) kinds.add('starts')
    if (!isCounts(back) || !isCounts(more)) kinds.add('counts')
  }
  return [...kinds]
}

type RowHit = { row: number; kind: string }
const SAVED_ROW_KEYS = 'day,partial,payload,source'

// 저장 본문의 날 줄마다: 열쇠는 day·partial·payload·source(hospital_id는 DB가 정한다), payload는 validateDayPayload를 지나고 again 모양이 맞다
function checkPostedDays(items: readonly unknown[], codes: ReadonlySet<string>): { hits: RowHit[]; days: DayPayload[] } {
  const hits: RowHit[] = []
  const days: DayPayload[] = []
  items.forEach((item, row) => {
    if (!isRecord(item) || keysOf(item) !== SAVED_ROW_KEYS) {
      hits.push({ row, kind: 'row-keys' })
      return
    }
    const payload = validateDayPayload(item.payload)
    if (payload === null) {
      hits.push({ row, kind: 'invalid-payload' })
      return
    }
    for (const kind of againKinds(isRecord(item.payload) ? item.payload.again : undefined, codes)) hits.push({ row, kind })
    days.push(payload)
  })
  return { hits, days }
}

// 아무것도 안 보고 통과하지 않게: 처방 줄 수, 숫자가 든 칸 수, 7일 창이 다 지난 날 수
function againSeen(days: readonly DayPayload[]): { lines: number; numbers: number; readyDays: number } {
  const lines = days.flatMap((day) => day.again?.rx ?? [])
  return {
    lines: lines.length,
    numbers: lines.flatMap((line) => [...line.back, ...line.more]).filter((value) => value !== null).length,
    readyDays: days.filter((day) => day.again?.ready[0] === true).length,
  }
}

// 오류 문구에는 값이 들어갈 수 있어 코드만 싣는다
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/
function failIf(error: { code?: unknown } | null, doing: string, hint: string): void {
  if (error === null) return
  const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  throw new Error(`${doing} 못했어요(${code}) — ${hint}`)
}
const PICKS_HINT = '운영 SQL(rx_picks)을 붙였는지 확인해 주세요'
const DAYS_HINT = '통계 표(stats_days)가 있는지 확인해 주세요'

type PickRow = { code: string; name: string; pick_order: number }
async function readPickRows(sb: SupabaseClient): Promise<PickRow[]> {
  const { data, error } = await sb.from(PICKS_TABLE).select('code, name, pick_order').order('pick_order')
  failIf(error, '고른 처방을 읽지', PICKS_HINT)
  return (data ?? []) as PickRow[]
}

// 시험이 더한 줄만 지운다(처음에 있던 줄은 그대로. 처음에는 비어 있어야 시험이 시작한다)
async function removeAdded(sb: SupabaseClient, before: readonly PickRow[]): Promise<void> {
  const kept = new Set(before.map((row) => row.code))
  const added = (await readPickRows(sb)).map((row) => row.code).filter((code) => !kept.has(code))
  if (added.length > 0) failIf((await sb.from(PICKS_TABLE).delete().in('code', added)).error, '시험이 고른 처방을 지우지', PICKS_HINT)
}

type StoredDay = { day: string; payload: unknown }
async function readDayRows(sb: SupabaseClient, from: string, to: string): Promise<StoredDay[]> {
  const { data, error } = await sb.from(DAYS_TABLE).select('day, payload').gte('day', from).lte('day', to).order('day')
  failIf(error, '저장된 날 숫자를 읽지', DAYS_HINT)
  return (data ?? []) as StoredDay[]
}

// 진짜 오늘(서버 값이라 화면 시계로 바꿀 수 없다)을 기준으로 파일 날짜를 만든다: 기본 30일 범위에 늘 겹치고,
// 앞쪽 날은 7·14·30일 창이 다 지나 again 숫자가 null이 아니다
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

// 가장 많이 나온 처방(여러 날에 걸쳐 시작·재방문이 생긴다). 같으면 먼저 나온 것
function mostCommon(rows: string[][]): { code: string; name: string } {
  const counts = new Map<string, { code: string; name: string; n: number }>()
  for (const row of rows) {
    const code = row[col('처방코드')]
    const seen = counts.get(code) ?? { code, name: row[col('처방명칭')], n: 0 }
    seen.n += 1
    counts.set(code, seen)
  }
  const top = [...counts.values()].reduce<{ code: string; name: string; n: number } | null>((best, item) => (best === null || item.n > best.n ? item : best), null)
  if (top === null) throw new Error('가짜 표에 처방이 없어요')
  return { code: top.code, name: top.name }
}

const posted = (page: Page, path: string) => page.waitForResponse((r) => safePath(r.url()) === path && r.request().method() === 'POST')
const winGroup = (page: Page) => page.getByRole('group', { name: '시작하고', exact: true })
const winButton = (page: Page, label: '7일 안' | '14일 안' | '30일 안') => winGroup(page).getByRole('button', { name: label, exact: true })

test.describe('같은 처방 재방문 개인정보(실제 Supabase)', () => {
  test.describe.configure({ timeout: 120_000 })

  let before: PickRow[] | null = null

  test.beforeEach(async ({ accounts }) => {
    // accounts.client는 로그인 때 시험 계정(승인됨)인지 확인한다. 로그인이 구글뿐이라 화면에서는 이 계정의 줄을 지울 수 없다.
    // 그래서 강제로 멈춘 앞 실행이 남긴 줄은 여기서 이 계정의 줄만(RLS) 지우고 비었는지 확인한 뒤 시작한다
    const sb = await accounts.client('approved')
    failIf((await sb.from(PICKS_TABLE).delete().gte('pick_order', 0)).error, '시험 계정의 남은 처방을 지우지', PICKS_HINT)
    const rows = await readPickRows(sb)
    expect(rows, '시험 계정의 고른 처방이 비어 있어야 시험이 시작한다').toEqual([])
    before = rows
  })

  // 앞 검사가 실패해도 고른 처방을 지운다. 페이지부터 닫아 앱이 다시 쓰지 못하게 한다.
  // 참고: 파일을 넣어 저장한 stats_days·stats_coverage 줄은 지우지 못한다(authenticated에 지우기 권한이 없다, 일부러 그렇다).
  // 시험 병원에 가짜 숫자가 남는 것이고 같은 날은 다음 실행이 덮어쓴다. 시험 계정은 실제 병원이 아니다
  test.afterEach(async ({ page, accounts }) => {
    await page.close().catch(() => {})
    if (before === null) return
    const sb = await accounts.client('approved')
    await removeAdded(sb, before)
    const same = JSON.stringify(await readPickRows(sb)) === JSON.stringify(before)
    before = null
    expect(same, '시험 계정의 고른 처방이 처음 값으로 돌아왔다').toBe(true)
  })

  test('AC-1309.1 AC-1309.2: 파일을 넣어 저장하고 처방을 골라 14일 안을 눌러도 개인 값이 나가지 않고, 날 줄의 again은 집계 숫자뿐이며 다시 열면 7일 안이다', async ({ page, context, accounts }) => {
    const sb = await accounts.client('approved')
    const table = buildFakeBitTable({ rows: 300, from: isoDaysAgo(40), to: isoDaysAgo(2) })
    const rows = bodyRows(table)
    const values = personalValues(rows)
    expect(values.length, '개인 값을 하나도 못 모으면 이 시험은 아무것도 보지 못한다').toBeGreaterThan(0)
    const codes = new Set(rows.map((row) => row[col('처방코드')]))
    const A = mostCommon(rows)

    await accounts.signIn(context, 'approved')
    const watch = watchOutgoing(context, values)
    await page.goto('/stats')

    // 파일을 넣는다. 저장 요청(날 숫자·덮은 기간)을 실제로 기다려 본다: 화면 글은 읽기만 해도 뜨므로 증거가 아니다
    const bytes = toCsvBytes(table, 'utf8-bom')
    const [days, coverage] = await Promise.all([
      posted(page, DAYS_PATH),
      posted(page, COVERAGE_PATH),
      page.locator('input[type="file"]').setInputFiles({ name: FILE_NAME, mimeType: 'text/csv', buffer: Buffer.from(bytes) }),
    ])
    expect(days.ok(), '날 숫자 저장').toBe(true)
    expect(coverage.ok(), '덮은 기간 저장').toBe(true)
    await expect(page.getByText(/저장했어요/).first()).toBeVisible(SLOW)
    await expect(page.getByText(/· 방금/).first()).toBeVisible(SLOW)

    // 처방 하나를 고른다. 고르기 전에는 날 수 단추가 없다(AC-1307.2)
    const search = page.getByRole('combobox', { name: '처방 찾기' })
    await search.fill(A.code)
    const option = page.getByRole('listbox', { name: '찾은 처방' }).getByRole('option').filter({ hasText: A.code }).first()
    await expect(option).toBeVisible(SLOW)
    const [saved] = await Promise.all([posted(page, PICKS_PATH), option.click()])
    expect(saved.ok(), '처방 고르기 저장').toBe(true)
    // 고른 뒤에도 목록이 열려 있고 떠 있는 층이 칩을 덮으므로 닫는다
    await search.press('Escape')
    await expect(page.getByRole('button', { name: `${A.name} 빼기`, exact: true })).toBeVisible(SLOW)

    // 같은 처방 재방문 묶음: 처음은 7일 안(AC-1308.3)
    await expect(winGroup(page)).toBeVisible(SLOW)
    await expect(winButton(page, '7일 안')).toHaveAttribute('aria-pressed', 'true')
    await expect(winButton(page, '14일 안')).toHaveAttribute('aria-pressed', 'false')

    // AC-1309.1: 14일 안을 눌러도 새 요청이 하나도 나가지 않는다(기본 기간 최근 30일이라 넓은 날 줄 읽기도 없다).
    // 고르기 뒤 따라 나간 요청이 섞이지 않게 먼저 조용해질 때까지 기다린다. 견주는 것은 '방법 경로'뿐이다(쿼리·값 없음)
    await settle(page, watch)
    const quietFrom = watch.seen.length
    await winButton(page, '14일 안').click()
    await expect(winButton(page, '14일 안')).toHaveAttribute('aria-pressed', 'true')
    await expect(winButton(page, '7일 안')).toHaveAttribute('aria-pressed', 'false')
    await settle(page, watch)
    expect(watch.seen.slice(quietFrom), '14일 안을 누른 뒤 나간 요청').toEqual([])

    // 아무것도 안 보고 통과하지 않게: 저장·고르기 요청을 이름 그대로 센다(OPTIONS 같은 사전 요청은 세지 않는다)
    expect(count(watch, 'POST', DAYS_PATH)).toBeGreaterThan(0)
    expect(count(watch, 'POST', COVERAGE_PATH)).toBeGreaterThan(0)
    expect(count(watch, 'POST', PICKS_PATH)).toBe(1)
    expect(watch.days.length).toBe(count(watch, 'POST', DAYS_PATH))
    expect(watch.picks.length).toBe(1)
    for (const body of watch.picks) expect(bodyKeys(body)).toEqual(['code', 'name'])

    // AC-1309.1: 저장 본문의 날 줄마다 again이 집계 숫자뿐이다(걸린 종류와 줄 번호만 보인다)
    const postedDays = checkPostedDays(bodyItems(watch.days), codes)
    expect(postedDays.hits, '저장 본문 날 줄의 모양').toEqual([])
    expect(postedDays.days.length, '저장한 날 줄이 있어야 한다').toBeGreaterThan(0)
    const seenAgain = againSeen(postedDays.days)
    expect(seenAgain.lines, 'again에 처방 줄이 하나도 없으면 이 시험은 아무것도 보지 못한다').toBeGreaterThan(0)
    expect(seenAgain.numbers, '숫자가 든 again 칸이 있어야 한다').toBeGreaterThan(0)
    expect(seenAgain.readyDays, '7일 창이 다 지난 날이 있어야 한다').toBeGreaterThan(0)

    // AC-1309.2: 시험 계정으로 읽은 날 줄이 validateDayPayload를 지나고 again이 있다.
    // 끝난 날만 본다: 일부인 날(partial)은 트리거(stats_keep_complete)가 앞에 있던 끝난 줄을 남길 수 있다
    const complete = postedDays.days.filter((day) => !day.partial).map((day) => day.day)
    expect(complete.length, '끝난 날 줄이 있어야 한다').toBeGreaterThan(0)
    const sorted = [...complete].sort()
    const stored = new Map((await readDayRows(sb, sorted[0], sorted[sorted.length - 1])).map((row) => [row.day, row.payload]))
    const storedHits: RowHit[] = []
    sorted.forEach((day, row) => {
      if (!stored.has(day)) {
        storedHits.push({ row, kind: 'missing' })
        return
      }
      const raw = stored.get(day)
      if (validateDayPayload(raw) === null) storedHits.push({ row, kind: 'invalid-payload' })
      for (const kind of againKinds(isRecord(raw) ? raw.again : undefined, codes)) storedHits.push({ row, kind })
      if (scan('', JSON.stringify(raw), values).length > 0) storedHits.push({ row, kind: 'personal-value' })
    })
    expect(storedHits, '저장된 날 줄').toEqual([])

    // 새 페이지로 다시 열면 고른 날 수가 남지 않고 7일 안이다(AC-1309.2)
    const again = await context.newPage()
    await again.goto('/stats')
    await expect(winGroup(again)).toBeVisible(SLOW)
    await expect(winButton(again, '7일 안')).toHaveAttribute('aria-pressed', 'true')
    await expect(winButton(again, '14일 안')).toHaveAttribute('aria-pressed', 'false')
    await again.close()

    // AC-1309.1: 다시 열기까지 나간 모든 요청에서 걸린 것이 없다(종류와 자리만 보인다)
    expect(watch.hits).toEqual([])
    expect(watch.unread).toEqual([])
  })
})
