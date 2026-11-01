// 원본 양지바른(seoseungkwan/shared@2a1069b, README 1.24.5)의 문자 문구(message_templates.html)를 node:vm으로 돌려
// 결과를 골든 파일(fixtures/patients/golden/messages-*.json)로 쓴다.
//
//   node scripts/patients/golden/messages.mjs "$YANGJI_SRC"     (YANGJI_SRC = …/YangjiBareun_사전점검)
//
// 원본은 저장소 밖에 둔다. 이 스크립트는 원본 파일을 읽기만 하고 저장소에는 결과만 쓴다.
// 돌리는 방식은 원본 시험 tests/test_revisit_import_html.py와 같다: <script>를 꺼내 가짜 document를 넣은 vm 문맥에서 돌린다.
// 원본 함수 몸통은 고치지 않는다. 화면 묶기는 가짜 document로 막고, 내일 기본값은 원본 init이 #d에 넣은 값을 시계를 고정해 읽는다.
// 사례는 모두 지어낸 글이다(환자 자료 없음). 입력을 골든 파일에 함께 적어 시험이 원본 없이 돈다.
process.env.TZ = 'Asia/Seoul'

import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import vm from 'node:vm'

const SOURCE = 'seoseungkwan/shared@2a1069b'
const FILE = 'YangjiBareun_사전점검/assets/message_templates.html'
const SOURCE_SHA256 = '889c755e63582dcdca082bd19d5ebff4ca436099fe917c120d8c306db277f04f'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const OUT = 'fixtures/patients/golden'

function fail(message) {
  console.error(message)
  process.exit(1)
}

const src = process.argv[2] || process.env.YANGJI_SRC
if (!src) fail('원본 폴더가 필요합니다: node scripts/patients/golden/messages.mjs "$YANGJI_SRC"')
const htmlBytes = readFileSync(join(src, 'assets', 'message_templates.html'))
const sourceSha = createHash('sha256').update(htmlBytes).digest('hex')
if (sourceSha !== SOURCE_SHA256) fail(`원본이 ${SOURCE}의 파일이 아닙니다(sha256 ${sourceSha}).`)
const html = htmlBytes.toString('utf8')

// ── 원본 돌리기 ─────────────────────────────────────────

const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]*?)<\/script>/g)].map((m) => m[2])
const screens = scripts.filter((code) => code.includes('var TPLS = '))
if (screens.length !== 1) fail(`원본에서 TPLS 스크립트를 하나로 찾지 못했습니다(${screens.length}개).`)
const screen = screens[0]

const RealDate = Date

// 시계를 now에 고정하고 화면 스크립트를 처음부터 돌린다(원본 init까지). 돌려준 문맥에서 원본 함수를 그대로 부른다
function boot(now) {
  const fixed = new RealDate(now).getTime()
  if (Number.isNaN(fixed)) fail(`시각을 읽지 못했습니다: ${now}`)
  class ClockDate extends RealDate {
    constructor(...args) {
      if (args.length === 0) super(fixed)
      else super(...args)
    }
    static now() {
      return fixed
    }
  }

  const elements = new Map()
  function element(key) {
    if (!elements.has(key)) {
      elements.set(key, {
        value: '',
        textContent: '',
        innerHTML: '',
        className: '',
        scrollHeight: 0,
        style: {},
        dataset: {},
        children: [],
        classList: { add() {}, remove() {}, toggle() {} },
        addEventListener() {},
        querySelector: (selector) => element(`${key} ${selector}`),
      })
    }
    return elements.get(key)
  }

  const ctx = {
    Date: ClockDate,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { querySelector: element, createElement: () => element('created'), body: element('body') },
    navigator: {},
    confirm: () => false,
    addEventListener() {},
    setTimeout() {},
    clearTimeout() {},
  }
  ctx.window = ctx
  vm.createContext(ctx)
  vm.runInContext(screen, ctx)
  return { ctx, sendDate: element('#d').value }
}

// 날짜 칸은 없는 날 사례도 원본 parse를 거쳐 찍는다. 시계에 기대는 사례('' 등)가 있어 시각을 고정한다
const { ctx: O } = boot('2026-11-01T09:30:00+09:00')
const TPLS = JSON.parse(JSON.stringify(O.TPLS))
if (TPLS.map((t) => t.id).join() !== 'jusa,jinryo') fail(`원본 TPLS가 예상과 다릅니다: ${TPLS.map((t) => t.id).join()}`)

const head = (entry, knownDiffs) => ({ source: SOURCE, file: FILE, entry, knownDiffs })

// ── 입력 ───────────────────────────────────────────────

const DATES = [
  // 평일·토·일
  '2026-11-02',
  '2026-11-03',
  '2026-11-04',
  '2026-11-05',
  '2026-11-06',
  '2026-11-07',
  '2026-11-08',
  // 월말·윤년
  '2026-01-31',
  '2026-02-28',
  '2024-02-29',
  '2028-02-29',
  '2026-11-30',
  // 연말·새해
  '2026-12-31',
  '2027-01-01',
  // 한 자리 달·날
  '2026-03-01',
  '2026-09-09',
  '2026-10-01',
]

const BODIES = [
  ...TPLS.map(({ id, text }) => ({ id, body: text })),
  { id: 'date-mid-line', body: '앞 글 <<DATE>> 뒤 글\n둘째 줄' },
  { id: 'date-many', body: '<<DATE>>\n[*1*]\n<<DATE>> 그리고 <<DATE>>' },
  { id: 'refill', body: '[*1*]님\n* 3월 1일 월요일 *\n[*2*] 안내' },
  { id: 'refill-spacing', body: '  *  12월  31일  목요일  *  \n*3월1일일요일*\n　* 3월 1일 일요일 *　\n\t* 3월 1일 일요일 *\t' },
  { id: 'refill-odd-numbers', body: '* 13월 45일 일요일 *\n* 0월 0일 월요일 *' },
  {
    id: 'not-date-lines',
    body: '* 3월 1일 *\n3월 1일 일요일\n* 3월 1일 일요일 * 안내\n안내 * 3월 1일 일요일 *\n* 3월 1일 일 *\n* 3월 1일 휴요일 *\n<<date>>\n< <DATE> >',
  },
  { id: 'placeholders-only', body: '[*1*]\n[*2*]\n[*1*]님 [*2*]' },
  { id: 'empty', body: '' },
  { id: 'blank-lines', body: '\n\n' },
  { id: 'crlf', body: '<<DATE>>\r\n[*1*]\r\n* 3월 1일 일요일 *\r\n' },
]

// isYmd가 거짓이라 우리는 받지 않는데 원본 parse는 무언가를 찍는 값들. 사례마다 원본이 하는 일은 아래 reason에 적는다
const INVALID_DATES = ['2026-02-30', '2026-02-29', '2026-13-01', '0002-11-02', '2026-1-5', '2026-11-xx', '', '어제']

const SEND_TODAYS = ['2026-11-01', '2026-09-30', '2026-01-31', '2026-02-28', '2024-02-28', '2024-02-29', '2026-12-31']
const CLOCK_TIMES = ['00:00:00', '09:30:00', '23:59:59']

// ── messages-fill.json ─────────────────────────────────

const fill = {
  ...head(
    ['DATE_LINE', 'dateLine', 'withDate', 'parse', 'init'],
    [
      {
        entry: 'parse',
        field: 'date',
        reason:
          "원본 parse는 '-'로 나눠 세 조각이면 숫자로 바꿔 Date를 만든다: 없는 날·달(2026-02-30, 2026-02-29, 2026-13-01)은 다음 달·해로 넘기고, 0~99년(0002-11-02)은 1902년으로 바꾸고, 숫자가 아니면(2026-11-xx) NaN 줄을 찍는다. 세 조각이 아닐 때만(빈 값, 어제) 그 시각의 오늘을 찍는다. 앞자리 0이 없는 2026-1-5는 원본이 맞는 날을 찍으며 우리가 더 엄격할 뿐이다. 우리는 dates.ts의 isYmd가 참인 값만 받고 그 밖에는 RangeError로 멈춘다. 화면은 부르기 전에 isYmd(date)로 보고, 거짓이면 마지막으로 맞았던 날짜를 그대로 둔다",
        cases: Object.fromEntries(INVALID_DATES.map((date) => [date, 'RangeError'])),
      },
    ],
  ),
  dateLinePattern: { source: O.DATE_LINE.source, flags: O.DATE_LINE.flags },
  bodies: BODIES,
  dates: DATES,
  dateLines: DATES.map((date) => ({ date, line: O.dateLine(O.parse(date)) })),
  fills: BODIES.flatMap(({ id, body }) =>
    DATES.map((date) => ({ bodyId: id, date, result: O.withDate(body, O.parse(date)) })),
  ),
  invalidDates: INVALID_DATES.map((date) => ({ date, original: O.dateLine(O.parse(date)) })),
  defaultSendDates: SEND_TODAYS.flatMap((today) =>
    CLOCK_TIMES.map((time) => {
      const now = `${today}T${time}+09:00`
      const { ctx, sendDate } = boot(now)
      return { now, today: ctx.ymd(new ctx.Date()), result: sendDate }
    }),
  ),
}

// ── messages-defaults.json ─────────────────────────────

const notes = [...new Set(TPLS.map((t) => t.note))]
if (notes.length !== 1) fail(`원본 note가 하나가 아닙니다: ${notes.join(' / ')}`)

const defaults = {
  ...head(
    ['TPLS'],
    [
      {
        entry: 'TPLS',
        field: 'id',
        reason:
          "원본 id(jusa·jinryo)와 배열 순서 대신 표의 kind·sort_order를 쓴다(design.md '문자 문구 종류'). 이름과 글은 그대로다",
        cases: {
          jusa: { kind: 'injection', sort_order: 0 },
          jinryo: { kind: 'followup', sort_order: 1 },
        },
      },
      {
        entry: 'TPLS',
        field: 'note',
        reason: '표(message_templates)에 note 칸이 없다. 화면 안내 글로 쓰도록 DEFAULT_TEMPLATE_NOTE로 내보낸다',
        cases: { DEFAULT_TEMPLATE_NOTE: notes[0] },
      },
    ],
  ),
  TPLS,
}

// ── 쓰기 ───────────────────────────────────────────────

mkdirSync(join(ROOT, OUT), { recursive: true })
for (const [name, value] of [
  ['messages-fill.json', fill],
  ['messages-defaults.json', defaults],
]) {
  const path = join(ROOT, OUT, name)
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
  console.log(relative(ROOT, path))
}
