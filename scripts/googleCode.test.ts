// 예약 구글 코드를 웹에 싣는 코드(src/lib/gcal/calendarCode.ts) 시험(design.md 8-2 끝, AC-8507.7).
// `npm run google-code`(scripts/google-code.mjs)가 google-code/calendar/Code.gs를 글자 그대로 싣는지,
// buildCalendarCode가 비밀 글자 자리 한 곳만 바꾸는지 본다. 진짜 구글에 붙지 않는다. 비밀 글자는 지어낸 값이다.

import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { CAL_ID, load, TEST_KEY } from '../google-code/test/fakeCalendar'
import { buildCalendarCode, CALENDAR_CODE, CALENDAR_CODE_VERSION } from '../src/lib/gcal/calendarCode'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SCRIPT = path.join(ROOT, 'scripts', 'google-code.mjs')
const CODE_GS = path.join(ROOT, 'google-code', 'calendar', 'Code.gs')
const GENERATED = path.join(ROOT, 'src', 'lib', 'gcal', 'calendarCode.ts')
const SLOT = '__' + 'KEY' + '__'
const SECRET = 'FakeSecret_0123456789-abcdefghijklmnopqrstu' // 32바이트 base64url 꼴(43자), 지어낸 값

describe('AC-8507.7: npm run google-code가 Code.gs 글자 그대로 calendarCode.ts를 만든다', () => {
  it('AC-8507.7: package.json에 google-code 명령이 있다', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
    expect(pkg.scripts['google-code']).toBe('node scripts/google-code.mjs')
  })

  it('AC-8507.7: 저장소의 calendarCode.ts는 지금 Code.gs로 다시 만든 것과 같다(Code.gs를 고치고 다시 만들지 않으면 실패)', () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'google-code-'))
    try {
      const out = path.join(tmp, 'calendarCode.ts')
      execFileSync(process.execPath, [SCRIPT, '--out', out], { cwd: ROOT, stdio: 'pipe' })
      expect(fs.readFileSync(out, 'utf8')).toBe(fs.readFileSync(GENERATED, 'utf8'))
    } finally {
      fs.rmSync(tmp, { recursive: true, force: true })
    }
  })

  it('AC-8507.7: CALENDAR_CODE는 Code.gs 글자 그대로, CALENDAR_CODE_VERSION은 Code.gs의 판 1', () => {
    expect(CALENDAR_CODE).toBe(fs.readFileSync(CODE_GS, 'utf8'))
    expect(CALENDAR_CODE_VERSION).toBe('1')
    expect(CALENDAR_CODE).toMatch(/^const CAL_VERSION = '1';$/m)
    // 만든 파일에는 비밀 글자 자리가 실린 코드 안 한 번뿐이다
    expect(fs.readFileSync(GENERATED, 'utf8').split(SLOT).length - 1).toBe(1)
  })

  it('AC-8507.7: buildCalendarCode는 비밀 글자 자리(__KEY__) 한 곳만 비밀 글자로 바꾸고 나머지는 그대로 둔다', () => {
    const at = CALENDAR_CODE.indexOf(SLOT)
    expect(at).toBeGreaterThan(0)
    expect(CALENDAR_CODE.indexOf(SLOT, at + 1)).toBe(-1)
    const built = buildCalendarCode(SECRET)
    expect(built).toBe(CALENDAR_CODE.slice(0, at) + SECRET + CALENDAR_CODE.slice(at + SLOT.length))
    expect(built).not.toContain(SLOT)
    expect(built).toMatch(new RegExp("^const KEY = '" + SECRET + "';$", 'm'))
    expect(built.split(SECRET).length - 1).toBe(1)
    // 실린 코드는 바뀌지 않는다
    expect(CALENDAR_CODE).toBe(fs.readFileSync(CODE_GS, 'utf8'))
  })

  it('AC-8507.7: 비밀 글자 꼴(base64url 16자 이상)이 아니면 만들지 않는다 — 코드 글이 깨지지 않게', () => {
    for (const bad of ['', 'short', "abc'def0123456789xyz", 'abc$&def0123456789xyz', 'has space 0123456789', 'line\nbreak0123456789', '가나다라마바사아자차카타파하가나다', SLOT]) {
      expect(() => buildCalendarCode(bad), JSON.stringify(bad)).toThrow()
    }
  })

  it('AC-8507.7: 비밀 글자를 넣은 코드는 그 열쇠로만 열리고, 바꾸지 않은 코드는 token_not_set(가짜 캘린더)', () => {
    const app = load({ source: buildCalendarCode(TEST_KEY), replaceKey: false })
    expect(app.post({ key: TEST_KEY, action: 'ping' })).toMatchObject({ ok: true, version: '1' })
    expect(app.post({ key: TEST_KEY, action: 'list', calendarId: CAL_ID, from: '2026-11-26', to: '2026-12-01' })).toMatchObject({ ok: true, events: [] })
    expect(app.post({ key: 'Other' + TEST_KEY.slice(5), action: 'ping' })).toMatchObject({ ok: false, code: 'bad_token' })
    const raw = load({ source: CALENDAR_CODE, replaceKey: false })
    expect(raw.post({ key: TEST_KEY, action: 'ping' })).toMatchObject({ ok: false, code: 'token_not_set' })
  })
})
