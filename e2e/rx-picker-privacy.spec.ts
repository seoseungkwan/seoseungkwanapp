// 처방 골라 보기 개인정보 E2E(rx-picker REQ-814, AC-814.1·AC-814.2): 실제 Supabase 시험 계정 + 가짜 비트 파일.
// 본 시험은 사용자가 20261103000000_rx_picks.sql을 운영 Supabase에 붙이고 시험 계정(.env.local)이 있어야 돈다.
// 돌리는 법: `npm run e2e -- e2e/rx-picker-privacy.spec.ts` (next build가 먼저 돈다: 다른 일이 없을 때)
// CRITICAL: 요청 머리(authorization·apikey·cookie)와 응답 내용은 읽지도 찍지도 않는다. 실패 글에는 걸린 종류와 가린 경로만 싣는다. 값은 모으지 않는다
import type { BrowserContext, Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BIT_HEADER, buildFakeBitTable, toCsvBytes } from '../fixtures/make-fake-fixtures'
import { validateRxPick } from '../src/lib/payload/validate'
import { expect, test } from './support'

// 화면·시험 산출물에 개인정보가 남지 않게 한다
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const SLOW = { timeout: 30_000 }
const TABLE = 'stats_rx_picks'
const PICKS_PATH = `/rest/v1/${TABLE}`
const DAYS_PATH = '/rest/v1/stats_days'
const COVERAGE_PATH = '/rest/v1/stats_coverage'
// 가짜 파일 이름. 이 글자도 나가면 안 된다
const FILE_NAME = 'fake-rx-picker-privacy.csv'
// 머리 검사에서 뺀다(AC-814.1): 세션 값이라 읽지도 찍지도 않는다
const SKIPPED_HEADERS = new Set(['authorization', 'apikey', 'cookie'])
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

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

type Watch = { hits: Hit[]; unread: string[]; picks: string[]; seen: string[] }

// context 단위라 Web Worker가 보낸 요청도 잡힌다. authorization·apikey·cookie 머리만 빼고 머리도 훑는다
function watchOutgoing(context: BrowserContext, values: ReturnType<typeof personalValues>): Watch {
  const watch: Watch = { hits: [], unread: [], picks: [], seen: [] }
  context.on('request', (request) => {
    const url = request.url()
    const method = request.method()
    const buffer = request.postDataBuffer()
    const body = buffer === null ? '' : buffer.toString('utf8')
    const headers = Object.entries(request.headers())
      .filter(([name]) => !SKIPPED_HEADERS.has(name.toLowerCase()))
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n')
    watch.hits.push(...scan(url, `${body}\n${headers}`, values))
    watch.seen.push(`${method} ${safePath(url)}`)
    // 못 읽은 몸통은 빈 몸통으로 치지 않고 실패로 센다(로그인 길은 몸통을 보지 않는다)
    if (BODY_METHODS.has(method) && body === '' && !safePath(url).startsWith('/auth/v1/')) watch.unread.push(safePath(url))
    if (safePath(url) === PICKS_PATH && body !== '') watch.picks.push(body)
  })
  return watch
}

const count = (watch: Watch, method: string, path: string) => watch.seen.filter((entry) => entry === `${method} ${path}`).length

// 본문(객체나 객체 목록)의 열쇠 모음
function bodyKeys(body: string): string[] {
  const parsed: unknown = JSON.parse(body)
  const items = Array.isArray(parsed) ? parsed : [parsed]
  return [...new Set(items.flatMap((item) => Object.keys(item as Record<string, unknown>)))].sort()
}

// 오류 문구에는 값이 들어갈 수 있어 코드만 싣는다
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/
function failIf(error: { code?: unknown } | null, doing: string): void {
  if (error === null) return
  const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  throw new Error(`${doing} 못했어요(${code}) — 운영 SQL(rx_picks)을 붙였는지 확인해 주세요`)
}

type PickRow = { code: string; name: string; pick_order: number }
async function readPickRows(sb: SupabaseClient): Promise<PickRow[]> {
  const { data, error } = await sb.from(TABLE).select('code, name, pick_order').order('pick_order')
  failIf(error, '고른 처방을 읽지')
  return (data ?? []) as PickRow[]
}

// 시험이 더한 줄만 지운다(처음에 있던 줄은 그대로. 처음에는 비어 있어야 시험이 시작한다)
async function removeAdded(sb: SupabaseClient, before: readonly PickRow[]): Promise<void> {
  const kept = new Set(before.map((row) => row.code))
  const added = (await readPickRows(sb)).map((row) => row.code).filter((code) => !kept.has(code))
  if (added.length > 0) failIf((await sb.from(TABLE).delete().in('code', added)).error, '시험이 고른 처방을 지우지')
}

// 진짜 오늘(서버 값이라 화면 시계로 바꿀 수 없다)을 기준으로 파일 날짜를 만든다: 기본 30일 범위에 늘 겹친다
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const posted = (page: Page, path: string) => page.waitForResponse((r) => safePath(r.url()) === path && r.request().method() === 'POST')
const deleted = (page: Page, path: string) => page.waitForResponse((r) => safePath(r.url()) === path && r.request().method() === 'DELETE')

test.describe('처방 골라 보기 개인정보(실제 Supabase)', () => {
  test.describe.configure({ timeout: 120_000 })

  let before: PickRow[] | null = null

  test.beforeEach(async ({ accounts }) => {
    // accounts.client는 로그인 때 시험 계정(승인됨)인지 확인한다. 로그인이 구글뿐이라 화면에서는 이 계정의 줄을 지울 수 없다.
    // 그래서 강제로 멈춘 앞 실행이 남긴 줄은 여기서 이 계정의 줄만(RLS) 지우고 비었는지 확인한 뒤 시작한다
    const sb = await accounts.client('approved')
    failIf((await sb.from(TABLE).delete().gte('pick_order', 0)).error, '시험 계정의 남은 처방을 지우지')
    const rows = await readPickRows(sb)
    expect(rows, '시험 계정의 고른 처방이 비어 있어야 시험이 시작한다').toEqual([])
    before = rows
  })

  // 앞 검사가 실패해도 지운다. 페이지부터 닫아 앱이 다시 쓰지 못하게 한다.
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

  test('AC-814.1 AC-814.2: 파일을 넣어 저장하고 처방을 고르고 빼도 개인 값이 나가지 않고, 저장된 줄은 깨끗하고 다시 열어도 같은 차례다', async ({ page, context, accounts }) => {
    const sb = await accounts.client('approved')
    const table = buildFakeBitTable({ rows: 200, from: isoDaysAgo(20), to: isoDaysAgo(2) })
    const rows = bodyRows(table)
    const values = personalValues(rows)
    expect(values.length, '개인 값을 하나도 못 모으면 이 시험은 아무것도 보지 못한다').toBeGreaterThan(0)
    // 서로 다른 처방 둘
    const first = rows[0]
    const second = rows.find((row) => row[col('처방코드')] !== first[col('처방코드')])
    if (second === undefined) throw new Error('가짜 표에 처방이 하나뿐이에요')
    const A = { code: first[col('처방코드')], name: first[col('처방명칭')] }
    const B = { code: second[col('처방코드')], name: second[col('처방명칭')] }

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

    const search = page.getByRole('combobox', { name: '처방 찾기' })
    const pick = async (target: { code: string }) => {
      await search.fill(target.code)
      const option = page.getByRole('listbox', { name: '찾은 처방' }).getByRole('option').filter({ hasText: target.code }).first()
      await expect(option).toBeVisible(SLOW)
      const [saved] = await Promise.all([posted(page, PICKS_PATH), option.click()])
      expect(saved.ok(), '처방 고르기 저장').toBe(true)
      // 고른 뒤에도 목록이 열려 있고 떠 있는 층이 칩을 덮으므로 닫는다
      await search.press('Escape')
    }
    const chips = () => page.getByRole('button', { name: /빼기$/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label')))

    // 고르기 A, B → 빼기 A → 다시 고르기 A (차례는 B, A)
    await pick(A)
    await pick(B)
    const [removed] = await Promise.all([deleted(page, PICKS_PATH), page.getByRole('button', { name: `${A.name} 빼기`, exact: true }).click()])
    expect(removed.ok(), '처방 빼기').toBe(true)
    await expect(page.getByRole('button', { name: `${A.name} 빼기`, exact: true })).toHaveCount(0, SLOW)
    await pick(A)
    await expect.poll(chips, SLOW).toEqual([`${B.name} 빼기`, `${A.name} 빼기`])

    // 아무것도 안 보고 통과하지 않게: 저장·고르기·빼기 요청을 이름 그대로 센다(OPTIONS 같은 사전 요청은 세지 않는다)
    expect(count(watch, 'POST', DAYS_PATH)).toBeGreaterThan(0)
    expect(count(watch, 'POST', COVERAGE_PATH)).toBeGreaterThan(0)
    expect(count(watch, 'POST', PICKS_PATH)).toBe(3)
    expect(count(watch, 'DELETE', PICKS_PATH)).toBe(1)
    expect(watch.picks.length).toBe(3)
    for (const body of watch.picks) expect(bodyKeys(body)).toEqual(['code', 'name'])

    // AC-814.2: 저장된 내 줄이 검사를 지나고 개인 값이 없고, 저장 차례는 B, A다
    const stored = await readPickRows(sb)
    expect(stored.map((row) => row.code)).toEqual([B.code, A.code])
    for (const row of stored) {
      expect(validateRxPick({ code: row.code, name: row.name }), '저장된 줄이 validateRxPick을 지난다').not.toBeNull()
      expect(scan('', `${row.code}\n${row.name}`, values)).toEqual([])
    }

    // 새 페이지로 다시 열어도 같은 차례로 칩이 보인다(화면 쪽 읽기)
    const again = await context.newPage()
    await again.goto('/stats')
    await expect
      .poll(() => again.getByRole('button', { name: /빼기$/ }).evaluateAll((els) => els.map((el) => el.getAttribute('aria-label'))), SLOW)
      .toEqual([`${B.name} 빼기`, `${A.name} 빼기`])
    await again.close()

    // AC-814.1: 다시 열기까지 나간 모든 요청에서 걸린 것이 없다(종류와 자리만 보인다)
    expect(watch.hits).toEqual([])
    expect(watch.unread).toEqual([])
  })
})
