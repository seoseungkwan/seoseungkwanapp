// 서식 탭 휴진 안내 개인정보 E2E(spec forms TASK-15, AC-3502.1·AC-3502.3·AC-3507.1·AC-3507.4·AC-3507.7,
// 글자 색 accent는 spec forms-accent AC-4703.1, 글씨·로고 여섯 칸은 spec form-style AC-6806.2): 실제 Supabase 시험 계정.
// 본 시험은 사용자가 20261110000000_form_notices.sql과 글자 색 칸 20261115030000_form_notices_accent.sql,
// 글씨·로고 칸 20261119100000_form_notices_style.sql을 운영 Supabase에 먼저 붙이고 시험 계정(.env.local)이 있어야 돈다
// (글자 색·글씨·로고 칸이 없으면 저장·읽기가 실패한다).
// 돌리는 법: `npm run e2e -- e2e/forms-privacy.spec.ts` (next build가 먼저 돈다: 다른 일이 없을 때)
// /api/ai/forms는 이 시험이 가짜 답으로 막는다 — 실제 AI를 부르지 않고, 적은 글은 우리 서버에도 닿지 않는다.
// CRITICAL: 요청 머리(authorization·apikey·cookie)와 응답 내용은 읽지도 찍지도 않는다. 실패 글에는 걸린 종류와 가린 경로만 싣는다
import type { BrowserContext, Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { checkNotice } from '../src/lib/forms/notice'
import { expect, test } from './support'

// 화면·시험 산출물에 개인정보가 남지 않게 한다
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

const SLOW = { timeout: 30_000 }
const TABLE = 'form_notices'
const NOTICES_PATH = `/rest/v1/${TABLE}`
const AI_PATH = '/api/ai/forms'
const SKIPPED_HEADERS = new Set(['authorization', 'apikey', 'cookie'])
const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

// 대충 적은 글: 이 표시 글자가 AI 경로(가짜로 막음) 밖 어떤 요청에도 나가면 안 된다(메모는 저장하지 않는다, AC-3507.7)
const MEMO_MARK = '시험메모가나다'
const MEMO = `5/5 어린이날 휴진 ${MEMO_MARK}`
const PRIVATE_MEMO = '5/5 어린이날 휴진, 문의 010-1234-5678'
const PHONE_SHAPE = /01[016789]-?\d{3,4}-?\d{4}/
const CHILDREN = { start: '2027-05-05', end: null, name: '어린이날', status: '휴진' }
// 글씨·로고 여섯 칸(spec form-style AC-6806.2): 처음대로면 모두 null로 간다
const STYLE_COLUMNS = ['title_scale', 'body_scale', 'logo_scale', 'title_color', 'body_color', 'logo_color'] as const
const BODY_KEYS = ['accent', 'cards', 'month', 'theme', 'year', ...STYLE_COLUMNS].sort()

type Hit = { kind: 'memo' | 'phone'; path: string }
type Watch = { hits: Hit[]; unread: string[]; seen: string[]; saves: string[] }

function safePath(url: string): string {
  try {
    return new URL(url).pathname
  } catch {
    return '(주소 읽기 실패)'
  }
}

function decodeSafe(url: string): string {
  try {
    return decodeURIComponent(url)
  } catch {
    return url
  }
}

// context 단위로 나가는 모든 요청을 훑는다. AI 경로는 가짜로 막혀 서버에 닿지 않으므로 메모 표시 검사에서만 뺀다
function watchOutgoing(context: BrowserContext): Watch {
  const watch: Watch = { hits: [], unread: [], seen: [], saves: [] }
  context.on('request', (request) => {
    const url = request.url()
    const path = safePath(url)
    const method = request.method()
    const buffer = request.postDataBuffer()
    const body = buffer === null ? '' : buffer.toString('utf8')
    const headers = Object.entries(request.headers())
      .filter(([name]) => !SKIPPED_HEADERS.has(name.toLowerCase()))
      .map(([name, value]) => `${name}: ${value}`)
      .join('\n')
    const all = `${decodeSafe(url)}\n${body}\n${headers}`
    if (path !== AI_PATH && all.includes(MEMO_MARK)) watch.hits.push({ kind: 'memo', path })
    if (PHONE_SHAPE.test(all)) watch.hits.push({ kind: 'phone', path })
    watch.seen.push(`${method} ${path}`)
    if (BODY_METHODS.has(method) && body === '' && !path.startsWith('/auth/v1/')) watch.unread.push(path)
    if (path === NOTICES_PATH && BODY_METHODS.has(method) && body !== '') watch.saves.push(body)
  })
  return watch
}

const count = (watch: Watch, method: string, path: string) => watch.seen.filter((entry) => entry === `${method} ${path}`).length

// 본문(객체나 객체 목록)의 열쇠 모음과 카드 열쇠 모음
function bodyShape(body: string): { keys: string[]; cardKeys: string[] } {
  const parsed: unknown = JSON.parse(body)
  const items = (Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]
  const keys = [...new Set(items.flatMap((item) => Object.keys(item)))].sort()
  const cards = items.flatMap((item) => (Array.isArray(item.cards) ? (item.cards as Record<string, unknown>[]) : []))
  return { keys, cardKeys: [...new Set(cards.flatMap((card) => Object.keys(card)))].sort() }
}

// 본문(객체나 객체 목록)에 실린 글자 색 값들(열쇠가 없으면 undefined)
function sentAccents(body: string): unknown[] {
  const parsed: unknown = JSON.parse(body)
  return ((Array.isArray(parsed) ? parsed : [parsed]) as Record<string, unknown>[]).map((item) => item.accent)
}

// 오류 문구에는 값이 들어갈 수 있어 코드만 싣는다
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/
function failIf(error: { code?: unknown } | null, doing: string): void {
  if (error === null) return
  const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  throw new Error(`${doing} 못했어요(${code}) — 운영 SQL(form_notices)을 붙였는지 확인해 주세요`)
}

type Row = {
  id: string
  year: number
  month: number
  cards: unknown
  theme: string | null
  accent: string | null
  title_scale: number | null
  body_scale: number | null
  logo_scale: number | null
  title_color: string | null
  body_color: string | null
  logo_color: string | null
}
async function readRows(sb: SupabaseClient): Promise<Row[]> {
  const { data, error } = await sb
    .from(TABLE)
    .select('id, year, month, cards, theme, accent, title_scale, body_scale, logo_scale, title_color, body_color, logo_color')
    .order('updated_at', { ascending: false })
  failIf(error, '저장한 안내문을 읽지')
  return (data ?? []) as Row[]
}

// 시험이 더한 줄만 지운다(처음에 있던 줄은 그대로)
async function removeAdded(sb: SupabaseClient, before: ReadonlySet<string>): Promise<void> {
  const added = (await readRows(sb)).map((row) => row.id).filter((id) => !before.has(id))
  if (added.length > 0) failIf((await sb.from(TABLE).delete().in('id', added)).error, '시험이 저장한 안내문을 지우지')
}

const responded = (page: Page, method: string, path: string) => page.waitForResponse((r) => safePath(r.url()) === path && r.request().method() === method)

test.describe('서식 휴진 안내 개인정보(실제 Supabase)', () => {
  test.describe.configure({ timeout: 120_000 })

  let before: Set<string> | null = null

  test.beforeEach(async ({ accounts }) => {
    const sb = await accounts.client('approved')
    before = new Set((await readRows(sb)).map((row) => row.id))
  })

  // 앞 검사가 실패해도 지운다. 페이지부터 닫아 앱이 다시 쓰지 못하게 한다
  test.afterEach(async ({ page, accounts }) => {
    await page.close().catch(() => {})
    if (before === null) return
    const sb = await accounts.client('approved')
    await removeAdded(sb, before)
    const left = (await readRows(sb)).filter((row) => !before!.has(row.id))
    before = null
    expect(left, '시험이 저장한 안내문이 남지 않았다').toEqual([])
  })

  test('AC-3502.1 AC-3502.3 AC-3507.1 AC-3507.4 AC-3507.7 AC-4703.1 AC-6806.2: 정리·저장·지우기에서 적은 글과 전화번호가 나가지 않고, 저장 몸통은 열쇠 다섯과 글씨·로고 여섯 칸뿐이다(글자 색 자동·글씨·로고 처음대로는 null)', async ({ page, context, accounts }) => {
    const sb = await accounts.client('approved')
    await accounts.signIn(context, 'approved')
    const watch = watchOutgoing(context)

    // 실제 AI를 부르지 않는다: 가짜 답(카드 한 장)
    let aiCalls = 0
    await context.route(`**${AI_PATH}`, async (route) => {
      aiCalls += 1
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ cards: [CHILDREN], truncated: false }) })
    })

    await page.goto('/forms')
    await expect(page.getByRole('heading', { level: 1, name: '서식' })).toBeVisible(SLOW)
    const memo = page.getByRole('textbox', { name: '대충 적기' })

    // AC-3502.3: 전화번호 모양이 있으면 아무것도 보내지 않는다
    await memo.fill(PRIVATE_MEMO)
    await page.getByRole('button', { name: '정리하기' }).click()
    await expect(page.getByText(/E-FORMS-PRIVATE/)).toBeVisible(SLOW)
    expect(aiCalls, '전화번호가 든 글은 AI 경로로 보내지 않는다').toBe(0)

    // AC-3502.1: 정리한 답으로 카드가 채워진다(가짜 답)
    await memo.fill(MEMO)
    await page.getByRole('button', { name: '정리하기' }).click()
    await expect(page.getByRole('group', { name: '카드 1' }).getByLabel('이름')).toHaveValue('어린이날', SLOW)
    expect(aiCalls).toBe(1)

    // AC-3507.1·AC-3507.7: 저장 — 실제로 저장 요청을 기다려 본다
    const [saved] = await Promise.all([responded(page, 'POST', NOTICES_PATH), page.getByRole('button', { name: '저장', exact: true }).click()])
    expect(saved.ok(), '안내문 저장').toBe(true)
    await expect(page.getByText('저장됨')).toBeVisible(SLOW)
    await expect(page.getByRole('button', { name: /2027년 5월 · 어린이날/ })).toBeVisible(SLOW)
    expect(watch.saves.length).toBe(1)
    expect(bodyShape(watch.saves[0])).toEqual({ keys: BODY_KEYS, cardKeys: ['end', 'name', 'start', 'status'] })
    // AC-4703.1: 글자 색을 고르지 않았으니(자동) accent는 빠지지 않고 null로 간다
    expect(sentAccents(watch.saves[0]), '자동 글자 색은 null로 보낸다').toEqual([null])

    // 저장된 내 줄: 검사를 지나고 적은 글이 없다
    const added = (await readRows(sb)).filter((row) => !before!.has(row.id))
    expect(added.length).toBe(1)
    const stored = checkNotice({ year: added[0].year, month: added[0].month, cards: added[0].cards, theme: added[0].theme, accent: added[0].accent })
    expect(stored, '저장된 줄이 checkNotice를 지난다').toEqual({ year: 2027, month: 5, cards: [CHILDREN], theme: null })
    expect(STYLE_COLUMNS.map((column) => added[0][column]), '처음대로 글씨·로고 값은 여섯 칸 모두 null').toEqual([null, null, null, null, null, null])
    expect(JSON.stringify(added[0])).not.toContain(MEMO_MARK)

    // AC-3507.4: 새 페이지로 다시 열어 지운다
    const again = await context.newPage()
    await again.goto('/forms')
    await again.getByRole('button', { name: /2027년 5월 · 어린이날/ }).first().click()
    again.once('dialog', (dialog) => void dialog.accept())
    const [removed] = await Promise.all([responded(again, 'DELETE', NOTICES_PATH), again.getByRole('button', { name: '지우기' }).click()])
    expect(removed.ok(), '안내문 지우기').toBe(true)
    await again.close()
    expect((await readRows(sb)).filter((row) => !before!.has(row.id))).toEqual([])

    // 아무것도 안 보고 통과하지 않게 요청을 센다
    expect(count(watch, 'POST', NOTICES_PATH)).toBe(1)
    expect(count(watch, 'DELETE', NOTICES_PATH)).toBe(1)
    expect(count(watch, 'POST', AI_PATH)).toBe(1)

    // 나간 모든 요청에서 걸린 것이 없다(종류와 자리만 보인다)
    expect(watch.hits).toEqual([])
    expect(watch.unread).toEqual([])
  })
})
