// npm run e2e:env: .env.local에 E2E 값 10개를 넣는다. 묻는 순서·검사·요약은 e2e/lib/envFile.ts가 하고, 여기는
// 진짜 입력(되울림 끔)·파일(권한 600)만 이어 붙인다. 사용자가 따로 연 터미널에서 직접 실행한다(Claude는 실행하지 않는다)
// CRITICAL: 친 글자는 화면에 내지 않는다(raw 모드로 직접 받는다). 입력을 숨길 수 없는 곳(터미널 아님)에서는 묻지 않고 멈춘다
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { hiddenKeys, runEnvSetup, writePrivateFile } from './lib/envFile'

const ENV_FILE = resolve(__dirname, '..', '.env.local')
const CANCELLED = 130

function readEnvFile(): string | null {
  try {
    return readFileSync(ENV_FILE, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null
    throw error
  }
}

function restoreTerminal() {
  if (process.stdin.isTTY && process.stdin.isRaw) process.stdin.setRawMode(false)
}

// raw 모드에서는 터미널이 친 글자를 되울리지 않고, Ctrl+C도 신호 대신 글자(\u0003)로 온다 → hiddenKeys가 멈춤으로 본다.
// raw 모드는 처음부터 끝까지 켜 둔다(질문 사이에 미리 친 글자도 화면에 나오지 않게)
// 앞 답이 덩어리 끝의 \r로 끝났는지 — 다음 덩어리 맨 앞 \n(나뉘어 온 \r\n의 나머지)을 hiddenKeys가 버린다
let afterCr = false

function askHidden(name: string): Promise<string> {
  const stdin = process.stdin
  process.stdout.write(`  ${name} 입력(보이지 않음) > `)
  return new Promise((done) => {
    let value = ''
    const onData = (chunk: string) => {
      const result = hiddenKeys(value, chunk, afterCr)
      value = result.value
      afterCr = result.afterCr
      if (result.end === null) return
      stdin.off('data', onData)
      stdin.pause()
      process.stdout.write('\n')
      if (result.end === 'cancel') {
        // 저장은 다 물은 뒤에만 하므로 여기서 멈추면 파일은 그대로다
        restoreTerminal()
        console.log('멈췄어요 — .env.local은 바꾸지 않았어요')
        process.exit(CANCELLED)
      }
      done(value)
    }
    stdin.on('data', onData)
    stdin.resume()
  })
}

if (!process.stdin.isTTY) {
  console.error('입력을 숨길 수 있는 터미널이 아니에요 — Claude 창이 아닌 따로 연 터미널에서 `npm run e2e:env`를 실행해 주세요')
  process.exitCode = 1
} else {
  // 예상하지 못한 오류로 끝나도 터미널을 raw 모드로 두지 않는다
  process.on('exit', restoreTerminal)
  process.stdin.setEncoding('utf8')
  process.stdin.setRawMode(true)
  runEnvSetup({
    ask: askHidden,
    read: readEnvFile,
    write: (text) => writePrivateFile(ENV_FILE, text),
    print: (line) => console.log(line),
  })
    // 오류 내용에는 경로·값이 섞일 수 있어 담지 않는다
    .catch(() => {
      console.error('도우미가 예상하지 못한 오류로 멈췄어요 — Claude에게 알려 주세요')
      return 1
    })
    .then((code) => {
      restoreTerminal()
      process.exitCode = code
    })
}
