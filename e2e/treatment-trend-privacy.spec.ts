// 처방별 추세 개인정보 E2E(treatment-trend REQ-1213, AC-1213.4): 실제 Supabase 시험 계정 + 가짜 비트 파일.
// 본 시험은 사용자가 20261105000100_stats_rx_groups.sql을 운영 Supabase에 붙이고 시험 계정(.env.local)이 있어야 돈다.
// 돌리는 법: `npm run e2e -- e2e/treatment-trend-privacy.spec.ts` (next build가 먼저 돈다: 다른 일이 없을 때).
// 시험 계정 값이 없으면 `npm run e2e`의 시작 전 검사(e2e/preflight.ts)가 빌드·시험 전에 멈춘다. `npm test`(Vitest)는 *.spec.ts를 잡지 않는다.
// 처음 돌릴 때는 기대값 하나를 일부러 틀려 실패를 본 뒤 되돌린다(시험이 헛돌지 않는지, tasks.md TASK-16)
// CRITICAL: 요청 머리(authorization·apikey·cookie)와 응답 내용은 읽지도 찍지도 않는다. 실패 글에는 걸린 종류와 가린 경로만 싣는다. 값은 모으지 않는다
import type { BrowserContext, Locator, Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { BIT_HEADER, buildFakeBitTable, toCsvBytes } from '../fixtures/make-fake-fixtures'
import { groupKey } from '../src/components/stats/treatmentView'
import { validateDayPayload, validateRxPick } from '../src/lib/payload/validate'
import { expect, test } from './support'

// 화면·시험 산출물에 개인정보가 남지 않게 한다
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const SLOW = { timeout: 30_000 }
const TABLE = 'stats_rx_groups'
const GROUPS_PATH = `/rest/v1/${TABLE}`
const SAVE_RPC = 'save_stats_rx_groups'
const SAVE_PATH = `/rest/v1/rpc/${SAVE_RPC}`
const DAYS_PATH = '/rest/v1/stats_days'
const COVERAGE_PATH = '/rest/v1/stats_coverage'
// 가짜 파일 이름. 이 글자도 나가면 안 된다
const FILE_NAME = 'fake-treatment-trend-privacy.csv'
// 시험이 새로 만드는 묶음 이름(숫자 6개 이상 없음, 30자 안)
const TEST_GROUP = '시험 묶음'
// AC-1213.4 글자 그대로: 저장된 일 줄 groups의 id 모양. 앱 상수(GROUP_KEY)를 쓰지 않고 따로 적는다
const STORED_KEY = /^t[0-9a-f]{16}$/
const GROUP_BODY_KEYS = ['codes', 'id', 'name', 'sort_order']
const DAY_GROUP_KEYS = ['id', 'newPatients', 'patients', 'returning']
// 머리 검사에서 뺀다(AC-1213.4): 세션 값이라 읽지도 찍지도 않는다
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

// groups: 묶음 저장 RPC 본문, days: 일 숫자 저장 본문(보낸 날을 고르려고만 쓴다)
type Watch = { hits: Hit[]; unread: string[]; groups: string[]; days: string[]; seen: string[] }

// context 단위라 Web Worker가 보낸 요청도 잡힌다. authorization·apikey·cookie 머리만 빼고 머리도 훑는다
function watchOutgoing(context: BrowserContext, values: ReturnType<typeof personalValues>): Watch {
  const watch: Watch = { hits: [], unread: [], groups: [], days: [], seen: [] }
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
    if (method === 'POST' && path === SAVE_PATH && body !== '') watch.groups.push(body)
    if (method === 'POST' && path === DAYS_PATH && body !== '') watch.days.push(body)
  })
  return watch
}

const count = (watch: Watch, method: string, path: string) => watch.seen.filter((entry) => entry === `${method} ${path}`).length

const keysOf = (value: unknown): string[] => Object.keys(value as Record<string, unknown>).sort()

// 묶음 저장 본문: 맨 위 열쇠는 groups 하나, 묶음마다 열쇠 넷(AC-1213.4)
function saveBodyKeys(body: string): { top: string[]; items: string[][] } {
  const parsed: unknown = JSON.parse(body)
  const groups = (parsed as { groups?: unknown }).groups
  return { top: keysOf(parsed), items: Array.isArray(groups) ? groups.map(keysOf) : [] }
}

// 일 숫자 저장 본문(줄 목록)에서 보낸 날만 꺼낸다
function sentDays(bodies: readonly string[]): string[] {
  const days = bodies.flatMap((body) => {
    const parsed: unknown = JSON.parse(body)
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    return rows.map((row) => String((row as { day?: unknown }).day))
  })
  return [...new Set(days)].sort()
}

// 오류 문구에는 값이 들어갈 수 있어 코드만 싣는다
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/
function failIf(error: { code?: unknown } | null, doing: string): void {
  if (error === null) return
  const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  throw new Error(`${doing} 못했어요(${code}) — 운영 SQL(stats_rx_groups)을 붙였는지 확인해 주세요`)
}

type GroupRow = { name: string; codes: string[]; sort_order: number }
async function readGroupRows(sb: SupabaseClient): Promise<GroupRow[]> {
  const { data, error } = await sb.from(TABLE).select('name, codes, sort_order').order('sort_order')
  failIf(error, '통계 묶음을 읽지')
  return (data ?? []) as GroupRow[]
}

// 시험 계정의 묶음을 모두 지운다(RLS라 이 계정 병원의 줄만). AC-1213.4: 끝나면 save_stats_rx_groups([])
async function clearGroups(sb: SupabaseClient): Promise<void> {
  failIf((await sb.rpc(SAVE_RPC, { groups: [] })).error, '시험 계정의 통계 묶음을 지우지')
}

// 진짜 오늘(서버 값이라 화면 시계로 바꿀 수 없다)을 기준으로 파일 날짜를 만든다: 기본 30일 범위에 늘 겹친다
function isoDaysAgo(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const posted = (page: Page, path: string) => page.waitForResponse((r) => safePath(r.url()) === path && r.request().method() === 'POST')

test.describe('처방별 추세 개인정보(실제 Supabase)', () => {
  test.describe.configure({ timeout: 180_000 })

  let started = false

  test.beforeEach(async ({ accounts }) => {
    // accounts.client는 로그인 때 시험 계정(승인됨)인지 확인한다. 강제로 멈춘 앞 실행이 남긴 묶음은 여기서 이 계정의 줄만(RLS) 지우고
    // 비었는지 확인한 뒤 시작한다. 비어 있어야 화면이 제안 다섯으로 시작한다
    const sb = await accounts.client('approved')
    await clearGroups(sb)
    expect(await readGroupRows(sb), '시험 계정의 통계 묶음이 비어 있어야 시험이 시작한다').toEqual([])
    started = true
  })

  // 앞 검사가 실패해도 지운다. 페이지부터 닫아 앱이 다시 쓰지 못하게 한다.
  // 참고: 파일을 넣어 저장한 stats_days·stats_coverage 줄은 지우지 못한다(authenticated에 지우기 권한이 없다, 일부러 그렇다).
  // 시험 병원에 가짜 숫자가 남는 것이고 같은 날은 다음 실행이 덮어쓴다. 시험 계정은 실제 병원이 아니다
  test.afterEach(async ({ page, accounts }) => {
    await page.close().catch(() => {})
    if (!started) return
    started = false
    const sb = await accounts.client('approved')
    await clearGroups(sb)
    expect(await readGroupRows(sb), '시험 계정의 통계 묶음을 모두 지웠다').toEqual([])
  })

  test('AC-1213.4: 묶음을 고쳐 저장하고 파일을 넣어 저장해도 개인 값이 나가지 않고, 묶음 저장 본문은 열쇠 넷, 저장된 일 줄의 묶음 줄은 열쇠와 세 숫자뿐이다', async ({
    page,
    context,
    accounts,
  }) => {
    const sb = await accounts.client('approved')
    const table = buildFakeBitTable({ rows: 200, from: isoDaysAgo(20), to: isoDaysAgo(2) })
    const rows = bodyRows(table)
    const values = personalValues(rows)
    expect(values.length, '개인 값을 하나도 못 모으면 이 시험은 아무것도 보지 못한다').toBeGreaterThan(0)
    // 찾기 목록에 나오는(validateRxPick을 지나는) 서로 다른 처방 둘
    const listed = rows.filter((row) => validateRxPick({ code: row[col('처방코드')], name: row[col('처방명칭')] }) !== null)
    const A = listed[0]?.[col('처방코드')]
    const B = listed.find((row) => row[col('처방코드')] !== A)?.[col('처방코드')]
    if (A === undefined || B === undefined) throw new Error('가짜 표에 찾기 목록에 나올 처방이 둘 없어요')

    await accounts.signIn(context, 'approved')
    const watch = watchOutgoing(context, values)
    await page.goto('/stats')

    // 파일을 넣어 저장한다. 저장 요청(날 숫자·덮은 기간)을 실제로 기다려 본다: 화면 글은 읽기만 해도 뜨므로 증거가 아니다
    const upload = async () => {
      const bytes = toCsvBytes(table, 'utf8-bom')
      const [dayResponse, coverage] = await Promise.all([
        posted(page, DAYS_PATH),
        posted(page, COVERAGE_PATH),
        page.locator('input[type="file"]').setInputFiles({ name: FILE_NAME, mimeType: 'text/csv', buffer: Buffer.from(bytes) }),
      ])
      expect(dayResponse.ok(), '날 숫자 저장').toBe(true)
      expect(coverage.ok(), '덮은 기간 저장').toBe(true)
      await expect(page.getByText(/저장했어요/).first()).toBeVisible(SLOW)
    }

    // 1) 처음 넣기: 저장된 숫자가 생겨 [묶음 고치기]가 나오고, 찾기 목록에 파일의 처방이 든다
    await upload()

    // 2) 묶음 고치기: 첫 묶음에 처방 A를 넣고, 새 묶음(TEST_GROUP)을 만들어 처방 B를 넣고 저장한다
    const edit = page.getByRole('button', { name: '묶음 고치기', exact: true })
    await expect(edit).toBeVisible(SLOW)
    await expect(edit).not.toHaveAttribute('aria-disabled', 'true', SLOW)
    await edit.click()
    const editHeading = page.getByRole('heading', { name: '처방별 추세 · 묶음 고치기' })
    await expect(editHeading).toBeVisible(SLOW)

    const addCode = async (adder: Locator, code: string) => {
      await adder.click()
      const search = page.getByRole('textbox', { name: '넣을 처방 찾기' })
      await search.fill(code)
      const option = page.getByRole('list', { name: '찾은 처방' }).getByRole('button').filter({ hasText: code }).first()
      await expect(option).toBeVisible(SLOW)
      await option.click()
      // 이 묶음에 들어가면 그 줄은 '이 묶음에 있음'으로 막힌다
      await expect(option).toBeDisabled(SLOW)
      await search.press('Escape')
    }
    const adders = page.getByRole('button', { name: '+ 처방 넣기', exact: true })
    await addCode(adders.first(), A)
    await page.getByRole('button', { name: '+ 묶음 더하기', exact: true }).click()
    await page.getByRole('textbox', { name: '묶음 이름', exact: true }).last().fill(TEST_GROUP)
    await addCode(adders.last(), B)

    const [savedGroups] = await Promise.all([posted(page, SAVE_PATH), page.getByRole('button', { name: '저장', exact: true }).click()])
    expect(savedGroups.ok(), '통계 묶음 저장').toBe(true)
    await expect(editHeading).toHaveCount(0, SLOW)
    await expect(page.getByRole('status').filter({ hasText: /^저장했어요\./ })).toBeVisible(SLOW)

    // 저장된 묶음: 고친 그대로이고 개인 값이 없다. 이 묶음의 열쇠가 다음 불러오기에서 세어져야 한다
    const storedGroups = await readGroupRows(sb)
    expect(storedGroups.find((group) => group.name === TEST_GROUP)?.codes, '새 묶음에 처방 B만 있다').toEqual([B])
    expect(storedGroups.some((group) => group.codes.includes(A)), '처방 A가 든 묶음이 있다').toBe(true)
    for (const group of storedGroups) expect(scan('', `${group.name}\n${group.codes.join('\n')}`, values)).toEqual([])
    const expectedKeys = [...new Set(storedGroups.filter((group) => group.codes.length > 0).map((group) => groupKey(group.codes)))].sort()

    // 3) 다시 넣기: 저장한 묶음으로 세어 일 숫자에 묶음 줄이 함께 저장된다
    const daysBefore = watch.days.length
    await upload()
    const days = sentDays(watch.days.slice(daysBefore))
    expect(days.length, '두 번째 넣기에서 보낸 날이 있다').toBeGreaterThan(0)

    // 아무것도 안 보고 통과하지 않게: 저장·묶음 읽기·묶음 저장 요청을 이름 그대로 센다(OPTIONS 같은 사전 요청은 세지 않는다)
    expect(count(watch, 'POST', DAYS_PATH)).toBeGreaterThanOrEqual(2)
    expect(count(watch, 'POST', COVERAGE_PATH)).toBeGreaterThanOrEqual(2)
    expect(count(watch, 'GET', GROUPS_PATH)).toBeGreaterThan(0)
    expect(count(watch, 'POST', SAVE_PATH)).toBeGreaterThanOrEqual(1)
    expect(watch.groups.length).toBe(count(watch, 'POST', SAVE_PATH))
    // AC-1213.4: save_stats_rx_groups 본문의 묶음 열쇠는 id·name·codes·sort_order뿐(hospital_id 등 없음)
    for (const body of watch.groups) {
      const { top, items } = saveBodyKeys(body)
      expect(top).toEqual(['groups'])
      expect(items.length).toBeGreaterThan(0)
      for (const keys of items) expect(keys).toEqual(GROUP_BODY_KEYS)
    }

    // AC-1213.4·AC-1213.3: 두 번째 넣기로 저장된 일 줄의 groups 줄은 열쇠(t + 16진수 16자리)와 세 숫자뿐이고, 지금 묶음의 열쇠가 날마다 있다
    const { data, error } = await sb.from('stats_days').select('day, payload').in('day', days).order('day')
    failIf(error, '저장된 일 숫자를 읽지')
    const stored = (data ?? []) as Array<{ day: string; payload: unknown }>
    expect(stored.map((row) => row.day), '보낸 날이 모두 저장되어 있다').toEqual(days)
    let counted = 0
    for (const row of stored) {
      const payload = validateDayPayload(row.payload)
      expect(payload, '저장된 일 줄이 validateDayPayload를 지난다').not.toBeNull()
      const groups = payload?.groups ?? []
      for (const group of groups) {
        expect(keysOf(group)).toEqual(DAY_GROUP_KEYS)
        expect(STORED_KEY.test(group.id), '묶음 줄 id 모양').toBe(true)
        counted += group.patients
      }
      expect(groups.map((group) => group.id).sort(), '그날 줄에 지금 묶음의 열쇠가 모두 있다(빠진 날 = 옛 줄이 남음)').toEqual(expectedKeys)
      expect(scan('', JSON.stringify(groups), values)).toEqual([])
    }
    expect(counted, '파일에 있는 처방 A·B로 센 건수가 있다').toBeGreaterThan(0)

    // AC-1213.4: 두 번 넣기·묶음 고치기까지 나간 모든 요청에서 걸린 것이 없다(종류와 자리만 보인다)
    expect(watch.hits).toEqual([])
    expect(watch.unread).toEqual([])
  })
})
