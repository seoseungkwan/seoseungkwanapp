// 개인정보 E2E의 금지 글 한 곳(AC-615.1·AC-615.2, 규칙 C11). 가짜 값은 fixtures/patients/fake/에서만 모은다.
// 밖으로 내는 것은 종류 이름과 가린 경로뿐이다: 맞은 값·몸통·토큰은 어떤 모양으로도 돌려주지 않는다.
// Playwright를 불러오지 않는다: 자기 점검(SELF_CHECKS)은 서버·계정·브라우저 없이 돈다
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative, resolve } from 'node:path'
import { DEFAULT_TEMPLATE_NOTE, DEFAULT_TEMPLATES } from '../../src/lib/patientMessages/defaults'

// 'symptom'은 AC-615.1의 다섯 종류보다 하나 더 많다: requirements.md는 증상 글도 PC 밖으로 못 나가게 하고, 이 탭이 실제로 받는다(contact.targets의 증상 칸)
export type ForbiddenKind = 'chart' | 'name' | 'phone' | 'rrn' | 'filename' | 'symptom'
export type RequestHit = { kind: ForbiddenKind; path: string /* 쿼리 뺀 경로. 값이 실릴 수 있는 칸은 가린다 */ }
/** 요청 몸통. Buffer도 Uint8Array다. null은 읽을 몸통이 없는 것 */
export type RequestBody = string | Uint8Array | null

const FAKE_DIR = resolve(__dirname, '../../fixtures/patients/fake')

// 가짜 자료 규칙(CLAUDE.md): 이름 '가상환자NN', 차트번호 9로 시작하는 6자리, 전화 010-0000-NNNN, 내원번호 V+숫자.
// 숫자는 앞뒤에 숫자가 붙으면 다른 수다. 내원번호는 영문·숫자가 붙으면 다른 글이다(주소의 /rest/v1/은 소문자라 맞지 않는다)
const NAME_SHAPE = /가상환자\d*/g
const CHART_SHAPE = /(?<!\d)9\d{5}(?!\d)/g
const VISIT_SHAPE = /(?<![0-9A-Za-z])V\d+(?![0-9A-Za-z])/g
// 전화 사이 글자: 붙임표·빈칸·점, 폼 인코딩의 +
const PHONE_GAP = '[-\\s.+]{0,3}'
const PHONE_HEAD = `(?<!\\d)(?:\\+?82${PHONE_GAP}|0)10${PHONE_GAP}0000${PHONE_GAP}`
const PHONE_SHAPE = new RegExp(`${PHONE_HEAD}(\\d{4})(?!\\d)`, 'g')

// 칸 이름까지 훑는다(store-marked의 표시 열쇠에 차트번호·내원번호가 든다)
function fixtureTexts(value: unknown): string[] {
  if (typeof value === 'string' || typeof value === 'number') return [String(value)]
  if (Array.isArray(value)) return value.flatMap((item) => fixtureTexts(item))
  if (typeof value === 'object' && value !== null) return Object.entries(value).flatMap(([key, item]) => [key, ...fixtureTexts(item)])
  return []
}

// 표(머리 줄이 첫 줄인 배열)의 '증상' 칸 글자들
function symptomCells(value: unknown): string[] {
  if (Array.isArray(value)) {
    const column = Array.isArray(value[0]) ? value[0].indexOf('증상') : -1
    if (column < 0) return value.flatMap((item) => symptomCells(item))
    return value.slice(1).flatMap((row: unknown) => {
      const cell = Array.isArray(row) ? (row[column] as unknown) : null
      return typeof cell === 'string' ? [cell] : []
    })
  }
  return typeof value === 'object' && value !== null ? Object.values(value).flatMap((item) => symptomCells(item)) : []
}

// 보통 글에도 나오는 증상 글은 맞추지 않는다. 5글자 아래는 '주사'·'무릎'·'f/u'·'비타민D'처럼 문구·시안에 흔하다.
// '아프면 오세요'는 5글자가 넘지만 화면·시안의 안내 글에 그대로 쓰는 예시다
const SYMPTOM_MIN_CHARS = 5
const SYMPTOM_ORDINARY = new Set(['아프면 오세요'])
const isSymptomValue = (value: string) => [...value].length >= SYMPTOM_MIN_CHARS && !SYMPTOM_ORDINARY.has(value)

function collectFake() {
  const fixtures: unknown[] = readdirSync(FAKE_DIR)
    .filter((file) => file.endsWith('.json'))
    .map((file) => JSON.parse(readFileSync(join(FAKE_DIR, file), 'utf8')))
  const texts = fixtures.flatMap((fixture) => fixtureTexts(fixture))
  // 목록이 비면 무엇을 맞춰도 통과한다. 그렇게 끝나지 않게 멈춘다(값은 싣지 않는다)
  const filled = (values: string[]) => {
    if (values.length === 0) throw new Error('fixtures/patients/fake에서 금지 글을 모으지 못했어요')
    return [...new Set(values)]
  }
  const found = (shape: RegExp, group: number) => filled(texts.flatMap((text) => [...text.matchAll(shape)].map((match) => match[group])))
  return {
    name: found(NAME_SHAPE, 0),
    chart: found(CHART_SHAPE, 0),
    visit: found(VISIT_SHAPE, 0),
    phoneTail: found(PHONE_SHAPE, 1),
    symptom: filled(
      fixtures
        .flatMap((fixture) => symptomCells(fixture))
        .map((cell) => cell.trim().normalize('NFC'))
        .filter(isSymptomValue),
    ),
  }
}

const FAKE = collectFake()

// 주민번호 모양. 앞 6자리는 달·날을 본다: 13자리 밀리초 시각(1793…)이 맞지 않게
const RRN_SHAPE = /(?<!\d)\d{2}(?:0[1-9]|1[0-2])(?:0[1-9]|[12]\d|3[01])[-\s.+]{0,3}[1-8]\d{6}(?!\d)/
// 비트 파일 이름 모양
const FILENAME_SHAPE = /\.(?:xlsx|xls|csv|ghp|car)(?![0-9A-Za-z])/i

// 증상 글은 칸 전체를 한 덩이로 맞춘다. 사이 빈칸은 폼 인코딩의 +일 수 있다
const symptomPattern = (value: string) =>
  value
    .split(/\s+/)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&'))
    .join('[\\s+]+')

// 금지 목록 하나. 내원번호는 종류를 따로 두지 않고 차트번호 쪽으로 센다
const PATTERNS: readonly (readonly [ForbiddenKind, RegExp])[] = [
  ['chart', new RegExp(`(?<!\\d)(?:${FAKE.chart.join('|')})(?!\\d)|(?<![0-9A-Za-z])(?:${FAKE.visit.join('|')})(?![0-9A-Za-z])`)],
  ['name', new RegExp(FAKE.name.join('|'))],
  ['phone', new RegExp(`${PHONE_HEAD}(?:${FAKE.phoneTail.join('|')})(?!\\d)`)],
  ['rrn', RRN_SHAPE],
  ['filename', FILENAME_SHAPE],
  ['symptom', new RegExp(FAKE.symptom.map(symptomPattern).join('|'))],
]

const UTF8 = new TextDecoder()

// decodeURIComponent와 같은 값을 내되 던지지 않는다. 그 함수는 깨진 % 하나에 글 전체를 거절해서, 깨진 칸 옆의 인코딩된 이름까지 못 풀게 된다(그때 날 글자만 보면 놓친다).
// 날 글자도 늘 함께 본다(readableForms)
const decodePercent = (text: string) =>
  text.replace(/(?:%[0-9A-Fa-f]{2})+/g, (run) => UTF8.decode(Uint8Array.from(run.slice(1).split('%'), (hex) => Number.parseInt(hex, 16))))

// JSON 안의 \uXXXX(두 번 이스케이프한 \\uXXXX 포함)와 \/
const unescapeJson = (text: string) =>
  text.replace(/\\+u([0-9a-fA-F]{4})/g, (_, hex: string) => String.fromCharCode(Number.parseInt(hex, 16))).replace(/\\+\//g, '/')

// 이중 인코딩까지 풀어 본다. 날 글자 + 푼 모양들. base64·압축은 풀지 않는다(이 앱의 요청은 쿼리와 JSON 글자뿐이다)
const DECODE_ROUNDS = 4
function readableForms(text: string): string[] {
  const forms = [text]
  for (let round = 0; round < DECODE_ROUNDS; round++) {
    const last = forms[forms.length - 1]
    const next = unescapeJson(decodePercent(last)).normalize('NFC')
    if (next === last) break
    forms.push(next)
  }
  return forms
}

/** 맞은 종류 이름만 돌려준다. 맞은 값은 돌려주지 않는다 */
export function findForbidden(text: string): ForbiddenKind[] {
  const forms = readableForms(text)
  return PATTERNS.filter(([, pattern]) => forms.some((form) => pattern.test(form))).map(([kind]) => kind)
}

// 값을 맞추지 않는 키. 키 이름 자체는 맞춘다
const VALUE_SKIPPED = new Set(['apikey', 'access_token'])
// 몸통(refresh_token)을 보지 않는 경로. 경로·쿼리는 그래도 본다
const AUTH_PREFIX = '/auth/v1/'
const PATH_UNREADABLE = '(주소를 읽지 못함)'
const MASK = '***'
// 경로 한 칸을 그대로 보고해도 되는 모양. 그 밖(한글·%·긴 토큰·숫자 6자리 이상)은 맞은 것이 없어도 가린다
const PLAIN_SEGMENT = /^[A-Za-z0-9_.()[\]-]{1,64}$/
const LONG_DIGITS = /\d{6}/

// 경로가 있는 주소만 나눈다. data:·blob:·about:은 '경로'가 곧 내용이라 통째로 맞추고 보고하지 않는다. 못 읽는 주소도 같다
function parseAddress(url: string): URL | null {
  try {
    const parsed = new URL(url)
    return /^(?:https?|wss?):$/.test(parsed.protocol) ? parsed : null
  } catch {
    return null
  }
}

function reportedPath(pathname: string): string {
  return pathname
    .split('/')
    .map((segment) => (segment === '' || (PLAIN_SEGMENT.test(segment) && !LONG_DIGITS.test(segment) && findForbidden(segment).length === 0) ? segment : MASK))
    .join('/')
}

/** 보고해도 되는 경로: 쿼리를 빼고 값이 실릴 수 있는 칸을 가린다 */
export function safePath(url: string): string {
  const address = parseAddress(url)
  return address === null ? PATH_UNREADABLE : reportedPath(address.pathname)
}

// URLSearchParams는 깨진 %에도 던지지 않는다
function queryKinds(query: string): ForbiddenKind[] {
  return [...new URLSearchParams(query)].flatMap(([key, value]) => [...findForbidden(key), ...(VALUE_SKIPPED.has(key) ? [] : findForbidden(value))])
}

// 바이너리 몸통: 비트 내보내기가 CP949라 UTF-8 말고도 읽어 본다. 고칠 수 없는 바이트는 대체 글자가 되고 던지지 않는다
const BODY_DECODERS = [new TextDecoder('utf-8'), new TextDecoder('euc-kr'), new TextDecoder('utf-16le')]

function bodyKinds(body: RequestBody): ForbiddenKind[] {
  if (body === null) return []
  const texts = typeof body === 'string' ? [body] : BODY_DECODERS.map((decoder) => decoder.decode(body))
  return texts.flatMap((text) => findForbidden(text))
}

/** 주소(경로·쿼리 키와 값·# 뒤)와 몸통을 맞춘다. 무엇이 와도 던지지 않고 건너뛰지 않는다. 결과는 {종류, 가린 경로}뿐 */
export function requestHits(url: string, body: RequestBody): RequestHit[] {
  const address = parseAddress(url)
  const kinds =
    address === null
      ? [...findForbidden(url), ...bodyKinds(body)]
      : [
          ...findForbidden(address.pathname),
          ...queryKinds(address.search),
          ...queryKinds(address.hash.slice(1)),
          ...(address.pathname.startsWith(AUTH_PREFIX) ? [] : bodyKinds(body)),
        ]
  const path = safePath(url)
  return [...new Set(kinds)].map((kind) => ({ kind, path }))
}

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH'])

/**
 * 몸통을 볼 수 없는 쓰기 요청이면 가린 경로, 아니면 null. postDataBuffer가 null이거나 비었을 때다(바이너리·Blob 몸통도 postDataBuffer로는 읽힌다).
 * 머리를 읽지 않으므로 빈 POST와 못 읽은 몸통을 가릴 수 없어 둘 다 실패로 친다: 못 본 것을 통과로 세지 않는다. /auth/v1/은 몸통을 보지 않는 곳이라 뺀다
 */
export function unreadBody(method: string, url: string, body: RequestBody): string | null {
  if (!BODY_METHODS.has(method) || (body !== null && body.length > 0)) return null
  if (parseAddress(url)?.pathname.startsWith(AUTH_PREFIX)) return null
  return safePath(url)
}

// 시험 산출물에 있으면 안 되는 글. 세션 쿠키 이름·토큰 칸 이름·JWT 모양.
// error-context.md는 실패한 줄 앞뒤 100줄의 소스를 베끼므로 시험 소스에 이 글자가 있으면 거짓으로 잡힌다. 그래서 이 글자들은 이 파일에만 두고 자기 점검이 다른 시험 소스를 본다.
// 이 파일 안에서 파일 오류가 던져지면(산출물 읽기, 자기 점검의 파일 읽고 쓰기) 이 파일의 글자가 베껴져 거짓으로 잡힐 수 있다. 이미 실패한 실행에서만 생기는 일이라 코드를 더하지 않는다
const SECRET_SHAPES = [/sb-[a-z0-9-]+-auth-token/i, /access_token/i, /refresh_token/i, /eyJ[\w-]{8,}\.[\w-]{8,}/]
// 화면·네트워크를 담는 파일. 설정이 모두 off라 생기면 안 된다(AC-615.3)
const CAPTURE_FILE = /\.(?:zip|png|jpe?g|webm|har)$/i

export const hasSecretShape = (text: string) => SECRET_SHAPES.some((shape) => shape.test(text))

/** 폴더 아래 전부(숨은 폴더 포함)에서 문제 있는 파일 이름만 돌려준다. 파일 내용은 내보내지 않는다 */
export function artifactLeaks(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile())
    .map((entry) => join(entry.parentPath, entry.name))
    .filter((file) => CAPTURE_FILE.test(file) || hasSecretShape(readFileSync(file).toString('latin1')))
    .map((file) => relative(dir, file))
}

// ── 자기 점검 ───────────────────────────────────────────
// spec 첫 시험이 돌고, 서버 없이도 이 파일만 불러 돌릴 수 있다. 실패해도 label과 종류·경로만 보인다

const NAME = '가상환자01'
const CHART = '900101'
const PHONE = '010-0000-0101'
const VISIT = 'V0401'
const SYMPTOM = '무릎 통증'
const SYMPTOM_LATIN = '1주 뒤 f/u'
const X = 'https://example.test'
const BROKEN = '%E0%A4%A'
// 체크 숫자가 틀린 모양뿐인 글(실제 번호가 아니다). fixtures에는 주민번호가 없어 모양 정규식만 본다
const RRN_LIKE = '000101-3000000'

const enc = encodeURIComponent
const at = (kind: ForbiddenKind, path = '/rest/v1/x'): RequestHit[] => [{ kind, path }]
const uEscaped = (text: string, slashes = '\\') => [...text].map((c) => `${slashes}u${c.charCodeAt(0).toString(16).padStart(4, '0')}`).join('')
// '가상환자01'의 EUC-KR 바이트
const NAME_EUC_KR = Uint8Array.from([0xb0, 0xa1, 0xbb, 0xf3, 0xc8, 0xaf, 0xc0, 0xda, 0x30, 0x31])

const urlCases: readonly (readonly [string, string, RequestHit[]])[] = [
  ['인코딩된 이름 쿼리 값', `${X}/rest/v1/x?name=${enc(NAME)}`, at('name')],
  ['건너뛰는 두 키의 값', `${X}/rest/v1/x?apikey=aaa&access_token=bbb`, []],
  ['건너뛰는 두 키의 값만 다른 주소', `${X}/rest/v1/x?apikey=ccc&access_token=ddd`, []],
  ['건너뛰는 두 키의 값이 가짜 값 모양이어도 건너뜀', `${X}/rest/v1/x?apikey=${enc(NAME)}&access_token=${CHART}`, []],
  ['다른 키의 값은 apikey가 있어도 맞춤', `${X}/rest/v1/x?apikey=aaa&q=${enc(NAME)}`, at('name')],
  ['대소문자가 다른 키는 건너뛰지 않음', `${X}/rest/v1/x?APIKEY=${enc(NAME)}`, at('name')],
  ['쿼리 키에 든 이름', `${X}/rest/v1/x?${enc(NAME)}=1`, at('name')],
  ['쿼리 키에 든 차트번호', `${X}/rest/v1/x?${CHART}=1`, at('chart')],
  ['값 없는 쿼리 키', `${X}/rest/v1/x?${enc(NAME)}`, at('name')],
  ['이중 인코딩 쿼리 값', `${X}/rest/v1/x?q=${enc(enc(NAME))}`, at('name')],
  ['쿼리 값의 전화(+는 빈칸)', `${X}/rest/v1/x?q=010+0000+0101`, at('phone')],
  ['# 뒤의 이름', `${X}/rest/v1/x#${enc(NAME)}`, at('name')],
  ['경로의 이름은 가림', `${X}/rest/v1/${enc(NAME)}`, at('name', '/rest/v1/***')],
  ['경로의 차트번호는 가림', `${X}/rest/v1/${CHART}/x`, at('chart', '/rest/v1/***/x')],
  ['경로의 내원번호는 가림', `${X}/rest/v1/${VISIT}`, at('chart', '/rest/v1/***')],
  ['쿼리가 맞아도 경로의 한글 칸은 가림', `${X}/rest/v1/${enc('다른 글')}/x?q=${enc(NAME)}`, at('name', '/rest/v1/***/x')],
  ['쿼리가 맞아도 경로의 숫자 6자리는 가림', `${X}/rest/v1/123456?q=${enc(NAME)}`, at('name', '/rest/v1/***')],
  ['깨진 경로에 맞는 값 없음', `${X}/${BROKEN}/x`, []],
  ['깨진 칸 옆의 인코딩된 이름', `${X}/${BROKEN}/${enc(NAME)}`, at('name', '/***/***')],
  ['깨진 칸 옆의 날 차트번호', `${X}/${BROKEN}/${CHART}`, at('chart', '/***/***')],
  ['깨진 쿼리 값에 맞는 값 없음', `${X}/rest/v1/x?a=${BROKEN}&b=%&c=%ZZ`, []],
  ['깨진 쿼리 키 옆의 이름', `${X}/rest/v1/x?${BROKEN}=1&q=${enc(NAME)}`, at('name')],
  ['깨진 쿼리 값 옆의 차트번호', `${X}/rest/v1/x?a=%ZZ&q=${CHART}`, at('chart')],
  ['읽지 못하는 주소도 통째로 맞춤', `http://[bad/${NAME}`, at('name', PATH_UNREADABLE)],
  ['data: 주소는 내용을 보고하지 않음', `data:text/plain,${enc(NAME)}`, at('name', PATH_UNREADABLE)],
  ['로그인 경로의 쿼리는 그래도 맞춤', `${X}/auth/v1/token?q=${enc(NAME)}`, at('name', '/auth/v1/token')],
  ['다른 수의 일부인 차트번호는 맞지 않음', `${X}/rest/v1/x?a=1${CHART}&b=${CHART}2`, []],
  ['쿼리 값의 증상 글', `${X}/rest/v1/x?e=${enc(SYMPTOM)}`, at('symptom')],
  ['쿼리 키의 증상 글', `${X}/rest/v1/x?${enc(SYMPTOM)}=1`, at('symptom')],
  ['경로의 증상 글은 가림', `${X}/rest/v1/${enc(SYMPTOM)}`, at('symptom', '/rest/v1/***')],
]

const bodyCases: readonly (readonly [string, RequestBody, ForbiddenKind[]])[] = [
  ['null 몸통', null, []],
  ['빈 몸통', '', []],
  ['빈 바이너리', new Uint8Array(0), []],
  ['읽을 수 없는 바이너리', Uint8Array.from([0, 255, 254, 128, 0, 192, 193, 245]), []],
  ['깨진 % 몸통', `{"a":"${BROKEN}%"}`, []],
  ['JSON 이름', JSON.stringify({ q: NAME }), ['name']],
  ['퍼센트 인코딩 이름', `q=${enc(NAME)}`, ['name']],
  ['이중 퍼센트 인코딩 이름', `q=${enc(enc(NAME))}`, ['name']],
  ['깨진 % 옆의 이름', `q=${enc('가상환자')}${BROKEN}${enc(NAME)}`, ['name']],
  ['\\uXXXX 이름', `{"q":"${uEscaped(NAME)}"}`, ['name']],
  ['\\\\uXXXX 이름', `{"q":"${uEscaped(NAME, '\\\\')}"}`, ['name']],
  ['퍼센트 인코딩한 \\uXXXX 이름', enc(uEscaped(NAME)), ['name']],
  ['자모로 나뉜 이름', NAME.normalize('NFD'), ['name']],
  ['UTF-8 바이너리 이름', Buffer.from(JSON.stringify({ q: NAME }), 'utf8'), ['name']],
  ['UTF-16 바이너리 이름', Buffer.from(NAME, 'utf16le'), ['name']],
  ['EUC-KR 바이너리 이름', NAME_EUC_KR, ['name']],
  ['숫자 칸 차트번호', `{"chart":${CHART}}`, ['chart']],
  ['내원번호', `{"v":"${VISIT}"}`, ['chart']],
  ['표시 열쇠의 차트번호·내원번호', `f|${VISIT}|${CHART}|2026-11-03`, ['chart']],
  ['붙임표 전화', PHONE, ['phone']],
  ['숫자만 전화', PHONE.replaceAll('-', ''), ['phone']],
  ['빈칸 전화', PHONE.replaceAll('-', ' '), ['phone']],
  ['국가 번호 전화', '+82-10-0000-0101', ['phone']],
  ['주민번호 모양', RRN_LIKE, ['rrn']],
  ['붙여 쓴 주민번호 모양', RRN_LIKE.replace('-', ''), ['rrn']],
  ['밀리초 시각은 주민번호가 아님', '{"t":1793500000000}', []],
  ['파일 이름 xlsx', '{"f":"fake.xlsx"}', ['filename']],
  ['파일 이름 XLS', 'fake.XLS', ['filename']],
  ['파일 이름 csv', 'fake.csv', ['filename']],
  ['파일 이름 GHP', 'fake.GHP', ['filename']],
  ['파일 이름 CAR', 'fake.CAR', ['filename']],
  ['다른 확장자', 'a.js b.css c.card d.woff2', []],
  ['날 증상 글', JSON.stringify({ e: SYMPTOM }), ['symptom']],
  ['퍼센트 인코딩 증상 글', `e=${enc(SYMPTOM)}`, ['symptom']],
  ['폼 인코딩 증상 글', `e=${enc('무릎')}+${enc('통증')}`, ['symptom']],
  ['\\uXXXX 증상 글', `{"e":"${uEscaped(SYMPTOM)}"}`, ['symptom']],
  ['\\/로 쓴 증상 글', `{"e":"${SYMPTOM_LATIN.replace('/', '\\/')}"}`, ['symptom']],
  ['바이너리 증상 글', Buffer.from(SYMPTOM, 'utf8'), ['symptom']],
  ['너무 짧아 뺀 증상 글', '무릎 주사 f/u MBB LBP TPI 새 글 비타민D 물리치료', []],
  ['안내 글이라 뺀 증상 글', '아프면 오세요', []],
]

// 보고에 값이 실리면 안 되는 주소들
const reportText = (url: string) => JSON.stringify(requestHits(url, null))
const carriesValue = (text: string) => [NAME, enc(NAME), enc(enc(NAME)), CHART, VISIT, PHONE, SYMPTOM, enc(SYMPTOM)].some((value) => text.includes(value))

// 실패하면 error-context.md가 베끼는 시험 소스(이 파일 뺀 것)
const COPIED_SOURCES = ['patients-privacy.spec.ts', 'patients/fakeExtension.ts', 'support.ts', 'config.ts', 'lib/env.ts', 'lib/session.ts']

// 심은 파일을 찾는지 본다. 임시 폴더는 시험 산출물 폴더 밖이고 끝나면 지운다
function plantedLeaks(): string[] {
  const dir = mkdtempSync(join(tmpdir(), 'patients-privacy-'))
  try {
    const testDir = join(dir, '.hidden-test')
    mkdirSync(testDir)
    writeFileSync(join(testDir, 'error-context.md'), '보통 실패 글')
    writeFileSync(join(testDir, 'planted.txt'), 'x refresh_token y')
    writeFileSync(join(testDir, 'planted.bin'), Buffer.concat([Buffer.from([0, 255, 254]), Buffer.from('sb-fakefake-auth-token')]))
    writeFileSync(join(dir, 'planted.png'), '보통 글자')
    return artifactLeaks(dir).sort()
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

export const SELF_CHECKS: readonly { label: string; got(): unknown; want: unknown }[] = [
  {
    label: '표본 값이 fixtures/patients/fake에 있음',
    got: () => [FAKE.name.includes(NAME), FAKE.chart.includes(CHART), FAKE.phoneTail.includes(PHONE.slice(-4)), FAKE.visit.includes(VISIT), FAKE.symptom.includes(SYMPTOM), FAKE.symptom.includes(SYMPTOM_LATIN)],
    want: [true, true, true, true, true, true],
  },
  { label: '종류 이름만 돌려줌', got: () => findForbidden(`${NAME} ${CHART}`), want: ['chart', 'name'] },
  ...urlCases.map(([label, url, want]) => ({ label: `주소: ${label}`, got: () => requestHits(url, null), want })),
  ...bodyCases.map(([label, body, kinds]) => ({
    label: `몸통: ${label}`,
    got: () => requestHits(`${X}/rest/v1/x`, body),
    want: kinds.flatMap((kind) => at(kind)),
  })),
  {
    label: '기본 문구는 어떤 금지 글에도 맞지 않음',
    got: () => [DEFAULT_TEMPLATE_NOTE, ...DEFAULT_TEMPLATES.flatMap(({ name, body }) => [name, body])].flatMap((text) => findForbidden(text)),
    want: [],
  },
  { label: '로그인 경로 몸통은 건너뜀', got: () => requestHits(`${X}/auth/v1/token?grant_type=refresh_token`, JSON.stringify({ q: NAME })), want: [] },
  {
    label: '보고에 값이 실리지 않음',
    got: () => [`${X}/${enc(NAME)}`, `${X}/${enc(enc(NAME))}`, `${X}/${CHART}`, `${X}/${VISIT}`, `${X}/${PHONE}`, `${X}/${enc(SYMPTOM)}`, `${X}/x?q=${enc(NAME)}`, `http://[bad/${NAME}`].map((url) => carriesValue(reportText(url))),
    want: [false, false, false, false, false, false, false, false],
  },
  { label: '못 읽은 몸통: POST null', got: () => unreadBody('POST', `${X}/rest/v1/x?q=1`, null), want: '/rest/v1/x' },
  { label: '못 읽은 몸통: PATCH 빈 바이너리', got: () => unreadBody('PATCH', `${X}/rest/v1/x`, new Uint8Array(0)), want: '/rest/v1/x' },
  { label: '못 읽은 몸통: 경로의 값은 가림', got: () => unreadBody('POST', `${X}/${enc(NAME)}`, null), want: '/***' },
  { label: '못 읽은 몸통: 바이너리는 읽은 것', got: () => unreadBody('POST', `${X}/rest/v1/x`, Uint8Array.from([255])), want: null },
  { label: '못 읽은 몸통: GET은 몸통이 없음', got: () => unreadBody('GET', `${X}/rest/v1/x`, null), want: null },
  { label: '못 읽은 몸통: 로그인 경로는 뺌', got: () => unreadBody('POST', `${X}/auth/v1/token`, null), want: null },
  {
    label: '산출물의 비밀 모양',
    got: () => ['sb-abcdefgh-auth-token.0', 'x access_token y', 'x refresh_token y', 'eyJhbGciOiJ.eyJzdWIiOiJ.sig', '보통 글자'].map(hasSecretShape),
    want: [true, true, true, true, false],
  },
  { label: '산출물 검사: 숨은 폴더의 심은 토큰·화면 파일을 찾고 보통 파일은 넘어감', got: plantedLeaks, want: [join('.hidden-test', 'planted.bin'), join('.hidden-test', 'planted.txt'), 'planted.png'].sort() },
  { label: '산출물 검사: 폴더가 없으면 빈 목록', got: () => artifactLeaks(join(FAKE_DIR, '없는 폴더')), want: [] },
  {
    label: '베껴질 시험 소스에 비밀 모양 글자가 없음',
    got: () => COPIED_SOURCES.filter((file) => hasSecretShape(readFileSync(resolve(__dirname, '..', file), 'utf8'))),
    want: [],
  },
]
