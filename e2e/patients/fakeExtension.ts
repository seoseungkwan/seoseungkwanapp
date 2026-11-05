// 시험 코드의 가짜 확장·도우미(AC-615.1, TASK-15). page.addInitScript로 그 브라우저의 chrome.runtime만 흉내 낸다.
// 앱 코드·EXTENSION_ID·commands.json은 시험 때문에 바꾸지 않고, src 어디에서도 이 파일을 불러오지 않는다(CLAUDE.md: 앱에 시험 길 금지).
// 답하는 값은 fixtures/patients/fake/의 가짜 조각뿐이다. 받은 글을 어디에도 남기지 않는다(console·전역 변수 없음)
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import type { Page } from '@playwright/test'
import type { StoreFile, TargetsFile, TargetsReply } from '../../fixtures/patients/make-fake-patients'
import { EXTENSION_ID } from '../../src/lib/bridge/extensionId'
import { PROTOCOL } from '../../src/lib/bridge/protocol'
import { LATEST_HELPER, MIN_EXTENSION } from '../../src/lib/bridge/versions'
import type { ChromeRuntimeLike, PortLike } from '../../src/types/bridge'

const FAKE_DIR = resolve(__dirname, '../../fixtures/patients/fake')
// 도우미처럼 JSON 글자를 다 만든 뒤 자른다. 작게 잘라 여러 조각을 잇는 길까지 지나가게 한다
const CHUNK_CHARS = 128

export type FakeFixtures = {
  /** 조각이 맞춰 둔 날(YYYY-MM-DD). 이 날이어야 Worker의 읽기 계획이 조각의 기간과 같다 */
  today: string
  pieces: TargetsReply[]
  /** store.load 답의 contact(답은 {contact: 이 값}) */
  contact: unknown
}

const readFake = <T>(file: string) => JSON.parse(readFileSync(resolve(FAKE_DIR, file), 'utf8')) as T

/** 처음 읽는 PC: 연락 표시·정기 주사 기록이 비어 있다 */
export function loadFakeFixtures(): FakeFixtures {
  const followup = readFake<TargetsFile>('targets-followup.json')
  const injection = readFake<TargetsFile>('targets-injection.json')
  if (followup.today !== injection.today) throw new Error('가짜 조각 두 파일의 기준 날이 달라요')
  return { today: followup.today, pieces: [...followup.pieces, ...injection.pieces], contact: readFake<StoreFile>('store-first.json').contact }
}

type FakeStream = { chunks: string[]; end: { count: number; bytes: number; sha256: string } }
type FakeAnswers = {
  extensionId: string
  protocol: number
  hello: { helperVersion: string; protocol: number; extensionVersion: string; extensionProtocol: number }
  load: FakeStream
  /** `${kind}|${from}|${to}` → 답 */
  targets: Record<string, FakeStream>
}

// 실제 규칙: 조각(seq 0부터) … end {count, bytes(UTF-8), sha256(16진 소문자)}
function toStream(json: unknown): FakeStream {
  const text = JSON.stringify(json)
  const chunks: string[] = []
  for (let at = 0; at < text.length; at += CHUNK_CHARS) chunks.push(text.slice(at, at + CHUNK_CHARS))
  const bytes = Buffer.from(text, 'utf8')
  return { chunks, end: { count: chunks.length, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } }
}

// 브라우저 안에서 돈다: 이 함수 밖의 것을 쓰지 않는다(글자로 옮겨진다). 답은 진짜 포트처럼 다음 차례에 간다
function fakeChromeRuntime(answers: FakeAnswers): void {
  const connect: ChromeRuntimeLike['connect'] = (extensionId) => {
    if (extensionId !== answers.extensionId) throw new Error('모르는 확장')
    const listeners: ((message: unknown) => void)[] = []
    let open = true
    const send = (message: Record<string, unknown>) => {
      setTimeout(() => {
        if (open) for (const listener of [...listeners]) listener({ v: answers.protocol, ...message })
      }, 0)
    }
    const stream = (id: string, answer: FakeStream) => {
      answer.chunks.forEach((data, seq) => send({ id, type: 'chunk', seq, data }))
      send({ id, type: 'end', ...answer.end })
    }
    const port: PortLike = {
      postMessage(message) {
        const { id, cmd, args } = message as { id: string; cmd: string; args: Record<string, unknown> }
        const target = answers.targets[`${String(args.kind)}|${String(args.from)}|${String(args.to)}`]
        if (cmd === 'hello') send({ id, type: 'result', data: answers.hello })
        else if (cmd === 'store.load') stream(id, answers.load)
        else if (cmd === 'store.save') send({ id, type: 'result', data: { saved: true } })
        else if (cmd === 'contact.targets' && target) stream(id, target)
        else send({ id, type: 'error', code: 'E-BRIDGE-REJECTED' })
      },
      disconnect() {
        open = false
      },
      onMessage: { addListener: (listener) => void listeners.push(listener) },
      onDisconnect: { addListener() {} },
    }
    return port
  }
  const scope = window as unknown as { chrome?: Record<string, unknown> }
  scope.chrome = { ...scope.chrome, runtime: { connect } }
}

/** 페이지를 열기 전에 부른다. hello는 지금 versions.ts가 받는 판으로 답한다 */
export async function installFakeExtension(page: Page, fixtures: FakeFixtures): Promise<void> {
  const answers: FakeAnswers = {
    extensionId: EXTENSION_ID,
    protocol: PROTOCOL,
    hello: { helperVersion: LATEST_HELPER, protocol: PROTOCOL, extensionVersion: MIN_EXTENSION, extensionProtocol: PROTOCOL },
    // 도우미 0.3.0의 store.load {contact: true} 답 모양 {contact: {…}}
    load: toStream({ contact: fixtures.contact }),
    targets: Object.fromEntries(fixtures.pieces.map((piece) => [`${piece.kind}|${piece.from}|${piece.to}`, toStream(piece)])),
  }
  await page.addInitScript(fakeChromeRuntime, answers)
}
