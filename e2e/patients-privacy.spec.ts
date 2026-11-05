// 환자 탭 개인정보 E2E(REQ-615, AC-615.1~AC-615.3, ADR-017): 실제 Supabase 시험 계정 + 가짜 확장·도우미(시험 코드가 chrome.runtime을 흉내 낸다).
// 본 시험은 사용자가 20261101000300_patients.sql을 붙인 뒤 `npm run e2e -- e2e/patients-privacy.spec.ts`로 돈다. 자기 점검 둘은 계정이 필요 없다. 맨 끝의 산출물 검사는 로그인하지 않지만 E2E 값이 있어야 돈다.
// CRITICAL(규칙 C11): 요청 머리·쿠키·토큰·응답 내용은 읽지도 찍지도 않는다. 우리 검사의 실패 글에는 종류·가린 경로·파일 이름만 싣는다.
// 다만 화면 조작·화면 검사가 실패하면 Playwright가 그 요소의 모양을 보고 글과 error-context.md에 그대로 싣는다: 연락함 상자의 aria-label="가상환자NN 연락함", 문구 칸의 시험 계정 글.
// fixtures의 가짜 자료와 시험 계정 글뿐이라 괜찮다(실제 환자 자료는 이 시험에 들어오지 않는다)
import { test as plainTest, type BrowserContext, type Page } from '@playwright/test'
import type { SupabaseClient } from '@supabase/supabase-js'
import { installFakeExtension, loadFakeFixtures } from './patients/fakeExtension'
import { artifactLeaks, findForbidden, requestHits, safePath, SELF_CHECKS, unreadBody, type RequestHit } from './patients/forbidden'
import { expect, test } from './support'

// 설정(e2e/config.ts)도 off지만 이 시험은 설정이 바뀌어도 화면 사진·trace·영상을 남기지 않는다(AC-615.3).
// 실패 때 error-context.md는 끌 수 없이 남는다. 담기는 것: 실패 글(위의 요소 모양 포함)과 실패한 줄 앞뒤 100줄의 소스 사본. 페이지 전체 글도 담길 수 있어 afterEach에서 페이지를 먼저 닫아 막는다.
// 소스가 베껴지므로 이 파일에는 쿠키·토큰 칸 이름을 글자로 쓰지 않는다(산출물 검사가 거짓으로 잡는다). 그런 글자는 forbidden.ts에만 둔다(자기 점검이 지킨다)
test.use({ trace: 'off', video: 'off', screenshot: 'off' })

type Watch = { hits: RequestHit[]; unread: string[]; seen: string[] }

/**
 * 나가는 요청을 본다. context 단위라 Web Worker가 보낸 요청도 잡힌다(비콘은 ping 요청으로 같이 잡힌다). 웹소켓은 context 이벤트가 없어 page에서 본다.
 * 바이너리·Blob 몸통도 읽히게 postData 대신 postDataBuffer를 쓴다. 그래도 못 읽은 쓰기 요청은 unread로 실패한다
 */
function watchOutgoing(context: BrowserContext, page: Page): Watch {
  const watch: Watch = { hits: [], unread: [], seen: [] }
  context.on('request', (request) => {
    const url = request.url()
    const body = request.postDataBuffer()
    watch.hits.push(...requestHits(url, body))
    const unread = unreadBody(request.method(), url, body)
    if (unread !== null) watch.unread.push(unread)
    watch.seen.push(`${request.method()} ${safePath(url)}`)
  })
  page.on('websocket', (socket) => {
    const url = socket.url()
    watch.hits.push(...requestHits(url, null))
    socket.on('framesent', ({ payload }) => watch.hits.push(...requestHits(url, payload)))
  })
  return watch
}

plainTest('AC-615.1 자기 점검: 금지 글 검사는 인코딩·깨진 주소·몸통에서 종류와 가린 경로만 낸다', () => {
  expect(requestHits('https://example.test/rest/v1/x?name=' + encodeURIComponent('가상환자01'), null)).toEqual([{ kind: 'name', path: '/rest/v1/x' }])
  expect(findForbidden(EDIT_MARK)).toEqual([])
  for (const check of SELF_CHECKS) expect(check.got(), check.label).toEqual(check.want)
})

plainTest('AC-615.1 자기 점검: 화면·Worker·비콘·웹소켓에서 나간 요청을 모두 본다', async ({ page, context }) => {
  // 서버·계정 없이 돈다: 모든 http(s) 요청을 여기서 끝내 실제 망으로 나가지 않는다. 웹소켓은 이 PC의 닫힌 포트로 열려다 실패한다(주소만 본다)
  await context.route('**/*', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>x</title>' }))
  const watch = watchOutgoing(context, page)
  await page.goto('https://example.test/start')
  const name = loadFakeFixtures().pieces.flatMap((piece) => piece.chart.slice(1)).map((row) => row[2])[0]
  await page.evaluate(
    async ({ query, value }) => {
      await fetch(`/page-query?${query}`)
      await fetch('/page-blob', { method: 'POST', body: new Blob([value]) })
      await fetch('/page-bytes', { method: 'POST', body: new TextEncoder().encode(value) })
      navigator.sendBeacon('/beacon', value)
      new WebSocket(`ws://127.0.0.1:9/page-socket?${query}`)
      const script = `
        (async () => {
          await fetch('https://example.test/worker-query?${query}');
          await fetch('https://example.test/worker-blob', { method: 'POST', body: new Blob([${JSON.stringify(value)}]) });
          new WebSocket('ws://127.0.0.1:9/worker-socket?${query}');
          postMessage('끝');
        })()
      `
      const worker = new Worker(URL.createObjectURL(new Blob([script], { type: 'text/javascript' })))
      await new Promise((resolve) => {
        worker.onmessage = resolve
      })
    },
    { query: `name=${encodeURIComponent(name)}`, value: name },
  )
  const paths = () => watch.hits.map((hit) => `${hit.kind} ${hit.path}`).sort()
  await expect
    .poll(paths)
    .toEqual(['/beacon', '/page-blob', '/page-bytes', '/page-query', '/page-socket', '/worker-blob', '/worker-query', '/worker-socket'].map((path) => `name ${path}`))
})

const TEMPLATES = 'message_templates'
const COUNTS = 'contact_counts'
const COUNTS_PATH = `/rest/v1/${COUNTS}`
const CONTACTED = / 연락함$/
// 도구 단추는 서버를 한 번 거친다. 기계를 함께 쓰는 곳에서는 기본 5초가 짧다
const SLOW = { timeout: 30_000 }
// 고친 문구에 덧붙이는 글. 환자 값이 아니다
const EDIT_MARK = '(개인정보 시험이 잠깐 고친 글)'

type TemplateRow = { id: string; kind: string; name: string; body: string; sort_order: number }

// 오류 문구에는 값이 들어갈 수 있어 코드만 싣는다(e2e/support.ts와 같은 뜻)
const SAFE_CODE = /^[A-Za-z0-9_]{1,16}$/
function failIf(error: { code?: unknown } | null, doing: string): void {
  if (error === null) return
  const code = typeof error.code === 'string' && SAFE_CODE.test(error.code) ? error.code : '오류 코드 없음'
  throw new Error(`${doing} 못했어요(${code}) — 시험 계정 문구가 처음과 다를 수 있어요`)
}

async function readTemplateRows(sb: SupabaseClient): Promise<TemplateRow[]> {
  const { data, error } = await sb.from(TEMPLATES).select('id, kind, name, body, sort_order').order('id')
  failIf(error, '문구를 읽지')
  return (data ?? []) as TemplateRow[]
}

// 시험이 더한 줄을 지우고(표에 원래 있는 지우기 권한) 처음 줄의 글로 되돌린다. contact_counts는 지우기 권한이 없어 건수 줄(가짜 자료의 정수 둘)은 남는다(AC-607.3)
async function restoreTemplates(sb: SupabaseClient, before: readonly TemplateRow[]): Promise<void> {
  const kept = new Set(before.map((row) => row.id))
  const added = (await readTemplateRows(sb)).map((row) => row.id).filter((id) => !kept.has(id))
  if (added.length > 0) failIf((await sb.from(TEMPLATES).delete().in('id', added)).error, '시험이 더한 문구를 지우지')
  for (const { id, kind, name, body, sort_order } of before) {
    failIf((await sb.from(TEMPLATES).update({ kind, name, body, sort_order }).eq('id', id)).error, '문구를 되돌리지')
  }
}

// 응답은 주소·상태만 본다(머리·몸통을 읽지 않는다)
const countsUploaded = (page: Page) =>
  page.waitForResponse((response) => safePath(response.url()) === COUNTS_PATH && response.request().method() === 'POST' && response.ok())

test.describe('환자 탭 개인정보(실제 Supabase)', () => {
  test.describe.configure({ timeout: 120_000 })

  let templatesBefore: TemplateRow[] | null = null

  test.beforeEach(async ({ accounts }) => {
    templatesBefore = await readTemplateRows(await accounts.client('approved'))
  })

  // 뒤의 검사가 실패해도 문구를 되돌린다. 페이지부터 닫는다: 되돌린 뒤 앱이 다시 쓰지 못하고, error-context.md에 페이지 전체 글이 들어가지 않는다
  test.afterEach(async ({ page, accounts }) => {
    await page.close().catch(() => {})
    if (templatesBefore === null) return
    const sb = await accounts.client('approved')
    await restoreTemplates(sb, templatesBefore)
    const same = JSON.stringify(await readTemplateRows(sb)) === JSON.stringify(templatesBefore)
    templatesBefore = null
    expect(same, '시험 계정 문구가 처음 값으로 돌아왔다').toBe(true)
  })

  test('AC-615.1 AC-615.2: 두 명단·연락함·문구 저장에서 환자 정보가 PC 밖으로 나가지 않는다', async ({ page, context, accounts }) => {
    const sb = await accounts.client('approved')
    const fake = loadFakeFixtures()
    await accounts.signIn(context, 'approved')
    // 가짜 조각은 그 날 기준이다: 화면의 오늘로 Worker의 읽기 계획이 정해지므로 화면 시계만 맞춘다(Worker는 날짜를 화면에서 받는다).
    // 그 날의 맨 앞으로 둔다: 시계가 실제보다 앞서면 세션이 끝난 것으로 보여 토큰을 새로 받게 된다
    await page.clock.setFixedTime(new Date(`${fake.today}T00:00:30+09:00`))
    await installFakeExtension(page, fake)
    const watch = watchOutgoing(context, page)

    // 두 명단은 들어올 때 한 흐름으로 읽고, 다 읽으면 남은 건수를 올린다
    await Promise.all([countsUploaded(page), page.goto('/patients')])
    const followupMark = page.locator('[data-tool-slot="followup"]').getByRole('checkbox', { name: CONTACTED }).first()
    await expect(followupMark).toBeVisible(SLOW)

    await page.getByRole('link', { name: '정기 주사 문자 명단', exact: true }).click()
    await expect(page.locator('[data-tool-slot="recall"]').getByRole('checkbox', { name: CONTACTED }).first()).toBeVisible(SLOW)

    // [연락함]: 답이 와야 체크되고, 내일 올 분이 하나 줄어 건수를 다시 올린다
    await page.getByRole('link', { name: 'F/U 명단', exact: true }).click()
    await expect(followupMark).toBeVisible(SLOW)
    await Promise.all([countsUploaded(page), followupMark.click()])
    await expect(followupMark).toBeChecked(SLOW)

    // [문자 문구]: 문구 하나를 고쳐 저장한다
    await page.getByRole('link', { name: '문자 문구', exact: true }).click()
    const body = page.getByLabel(/^내용/).first()
    await expect(body).toBeVisible(SLOW)
    await body.fill(`${await body.inputValue()}\n${EDIT_MARK}`)
    await page.getByRole('button', { name: '저장', exact: true }).click()
    await expect(page.getByText('저장했어요', { exact: true })).toBeVisible(SLOW)
    await expect(page.getByText(/건수를 올리지 못했어요/)).toHaveCount(0)

    // AC-615.1: 실패 글은 종류·가린 경로뿐
    expect(watch.hits).toEqual([])
    expect(watch.unread).toEqual([])
    // 아무것도 안 보고 통과하지 않게: 올리기·저장 요청을 실제로 봤다
    expect(watch.seen).toContain(`POST ${COUNTS_PATH}`)
    expect(watch.seen.some((entry) => entry === `POST /rest/v1/${TEMPLATES}` || entry === `PATCH /rest/v1/${TEMPLATES}`)).toBe(true)

    // AC-615.2: 저장된 내 줄을 다시 읽는다. 값은 찍지 않는다
    const templates = await readTemplateRows(sb)
    expect(templates.some((row) => row.body.includes(EDIT_MARK))).toBe(true)
    expect(templates.flatMap((row) => findForbidden(`${row.kind}\n${row.name}\n${row.body}`))).toEqual([])

    const counts = await sb.from(COUNTS).select('*')
    failIf(counts.error, '남은 건수를 읽지')
    const rows = (counts.data ?? []) as Record<string, unknown>[]
    expect(rows.length).toBe(1)
    const [row] = rows
    expect(Object.keys(row).sort()).toEqual(['followup_left', 'hospital_id', 'injection_left', 'updated_at'])
    expect([Number.isInteger(row.followup_left), Number.isInteger(row.injection_left)]).toEqual([true, true])
    expect(typeof row.updated_at === 'string' && !Number.isNaN(Date.parse(row.updated_at))).toBe(true)
    // hospital_id(uuid)·updated_at(마이크로초)는 글자 칸이 아니고 우연히 숫자 6자리가 맞을 수 있어 뺀다
    expect(findForbidden(`${String(row.followup_left)} ${String(row.injection_left)}`)).toEqual([])
  })
})

// AC-615.3은 본 시험 안에 둘 수 없다: 산출물은 시험 몸통이 끝난 뒤 써지고, 시험이 실패하면 몸통의 검사까지 오지 못한다. 그래서 따로 된 시험이다.
// 본 시험과 같은 test(./support)로 맨 끝에 적어야 적은 차례대로 본 시험 뒤에 돈다. plainTest는 worker fixture 묶음이 달라 맨 끝에 적어도 본 시험보다 먼저 돌 수 있다.
// 본 시험이 실패하면 남은 시험은 새 worker에서 돌아 이 시험은 그래도 돈다. 위 describe의 beforeEach·afterEach는 여기 닿지 않고, 로그인하지 않는다. E2E 값이 없으면 건너뛰지 않고 실패한다.
// retries를 켜면 다시 돈 시험의 산출물은 이 검사 뒤에 써진다(지금 설정은 retries: 0)
test('AC-615.3: 시험 산출물에 쿠키·토큰이 없고 화면·네트워크 기록 파일이 없다', ({ trace, video, screenshot }, testInfo) => {
  expect([trace, video, screenshot]).toEqual(['off', 'off', 'off'])
  // 시험 폴더는 무언가 써질 때만 이 폴더 아래 생긴다(본 시험이 통과하면 보통 없고, 그때 파일 0개가 정상이다). 생긴 폴더는 통과해도 지우지 않는다(preserveOutput 기본값 always).
  // 그래서 이 시험의 폴더(testInfo.outputDir)가 아니라 이 폴더 전체를 본다. 실행이 시작될 때 비워져 이번 실행의 것만 있다. 함께 돈 다른 spec의 실패 산출물도 보이므로, 잡히면 파일 이름의 폴더로 어느 시험인지 본다
  expect(artifactLeaks(testInfo.project.outputDir)).toEqual([])
})
