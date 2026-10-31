// Screenshots with Playwright (no trace, no HAR). Fake session cookies point at the local stub only.
import { chromium } from '/home/developer/seoseungkwan/harness_framework/node_modules/playwright/index.mjs'
const BASE = 'http://localhost:3100'
const OUT = '/tmp/claude-1000/-home-developer/310e8e3a-8667-4ba9-b937-f7cf7c479f65/scratchpad/redesign-b2b/current'
const b64u = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
function cookieFor(sub) {
  const exp = Math.floor(Date.now() / 1000) + 86400 * 30
  const access_token = b64u({ alg: 'HS256', typ: 'JWT' }) + '.' + b64u({ sub, exp, aud: 'authenticated', role: 'authenticated' }) + '.stub'
  const session = { access_token, token_type: 'bearer', expires_in: 86400 * 30, expires_at: exp, refresh_token: 'stub-refresh', user: { id: sub, aud: 'authenticated', email: sub + '@example.com' } }
  return [{ name: 'sb-127-auth-token', value: 'base64-' + b64u(session), domain: 'localhost', path: '/', httpOnly: false, sameSite: 'Lax' }]
}
const pages = [
  { name: 'landing', path: '/', sub: null },
  { name: 'login', path: '/login', sub: null },
  { name: 'login-error', path: '/login?error=1', sub: null },
  { name: 'signup', path: '/signup', sub: 'u-new' },
  { name: 'pending', path: '/pending', sub: 'u-pending' },
  { name: 'rejected', path: '/pending', sub: 'u-rejected' },
  { name: 'dashboard', path: '/dashboard', sub: 'u-admin' },
  { name: 'admin', path: '/admin', sub: 'u-admin' },
]
const only = process.argv[2] ? process.argv[2].split(',') : null
const browser = await chromium.launch()
try {
  for (const p of pages) {
    if (only && !only.includes(p.name)) continue
    for (const width of [1440, 390]) {
      const ctx = await browser.newContext({ viewport: { width, height: width === 390 ? 844 : 900 }, deviceScaleFactor: 1, reducedMotion: 'reduce', locale: 'ko-KR', timezoneId: 'Asia/Seoul' })
      if (p.sub) await ctx.addCookies(cookieFor(p.sub))
      const page = await ctx.newPage()
      const resp = await page.goto(BASE + p.path, { waitUntil: 'networkidle', timeout: 120000 })
      await page.waitForTimeout(800)
      const finalPath = new URL(page.url()).pathname + new URL(page.url()).search
      const file = `${OUT}/${p.name}-${width}.png`
      await page.screenshot({ path: file, fullPage: true })
      const sw = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.scrollHeight])
      console.log(p.name, width, resp && resp.status(), '->', finalPath, 'scroll', sw.join('x'))
      await ctx.close()
    }
  }
} finally { await browser.close() }
