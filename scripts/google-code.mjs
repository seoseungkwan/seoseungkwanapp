// 예약 구글 코드(google-code/calendar/Code.gs)를 웹에 싣는 코드(src/lib/gcal/calendarCode.ts)로 만든다(design.md 8-2).
// 쓰는 법: npm run google-code          — Code.gs를 고친 뒤 꼭 다시 돌린다(scripts/googleCode.test.ts가 같은지 본다)
//         node scripts/google-code.mjs --out <파일>   — 다른 곳에 만든다(시험이 견줄 때)
// 만든 파일은 Code.gs 글을 줄마다 그대로 싣는다. 비밀 글자는 이 스크립트가 다루지 않는다(웹앱이 복사할 때 넣는다).

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const CODE_FILE = path.join(ROOT, 'google-code', 'calendar', 'Code.gs')
const OUT_FILE = path.join(ROOT, 'src', 'lib', 'gcal', 'calendarCode.ts')
const SLOT = '__' + 'KEY' + '__'

function render(code) {
  const slots = code.split(SLOT).length - 1
  if (slots !== 1) throw new Error(`Code.gs에 비밀 글자 자리 ${SLOT}가 한 번만 있어야 한다(지금 ${slots}번)`)
  const version = /^const CAL_VERSION = '(\d+)';$/m.exec(code)
  if (!version) throw new Error("Code.gs에서 const CAL_VERSION = '…'; 줄을 찾지 못했다")
  return [
    '// 이 파일은 `npm run google-code`(scripts/google-code.mjs)가 google-code/calendar/Code.gs에서 만든다. 손으로 고치지 않는다.',
    '// 예약 구글 코드(design.md 8-2). [구글 코드 복사]는 buildCalendarCode(비밀 글자)로 비밀 글자 자리 한 곳만 바꿔 복사한다.',
    '',
    `export const CALENDAR_CODE_VERSION = '${version[1]}'`,
    '',
    'export const CALENDAR_CODE: string = [',
    ...code.split('\n').map((line) => '  ' + JSON.stringify(line) + ','),
    "].join('\\n')",
    '',
    "const KEY_SLOT = '__' + 'KEY' + '__'",
    '// base64url 글자만(웹앱이 만드는 비밀 글자는 32바이트 → 43자). 따옴표·$·줄바꿈이 끼어 코드 글이 깨지지 않게',
    'const SECRET_RE = /^[A-Za-z0-9_-]{16,256}$/',
    '',
    '/** 예약 구글 코드의 비밀 글자 자리 한 곳만 secret으로 바꾼 코드 글. secret이 base64url 16자 이상이 아니면 던진다. */',
    'export function buildCalendarCode(secret: string): string {',
    "  if (!SECRET_RE.test(secret)) throw new Error('비밀 글자 꼴이 아니다(base64url 16자 이상)')",
    '  const at = CALENDAR_CODE.indexOf(KEY_SLOT)',
    '  return CALENDAR_CODE.slice(0, at) + secret + CALENDAR_CODE.slice(at + KEY_SLOT.length)',
    '}',
    '',
  ].join('\n')
}

const args = process.argv.slice(2)
let out = OUT_FILE
if (args.length > 0) {
  if (args.length !== 2 || args[0] !== '--out') {
    console.error('쓰는 법: node scripts/google-code.mjs [--out <파일>]')
    process.exit(2)
  }
  out = path.resolve(args[1])
}
fs.mkdirSync(path.dirname(out), { recursive: true })
fs.writeFileSync(out, render(fs.readFileSync(CODE_FILE, 'utf8')))
console.log('만듦: ' + path.relative(ROOT, out))
