import { checkEnvValue, upsertEnvText } from '../e2e/lib/envFile'

// 열쇠 넣기 명령 npm run ai:key 의 시험할 논리(TASK-16). 진짜 입력·파일은 scripts/ai-key.ts가 이어 붙인다
// CRITICAL: 넣은 값은 질문·안내·오류 글자에 한 글자도 담지 않는다. 보이는 것은 "넣음"·"그대로"·글자 수 정도

export const KEY_NAME = 'ANTHROPIC_API_KEY'
export const KEY_PREFIX = 'sk-ant-'
const CANCELLED = 130

const REASON = {
  prefix: `${KEY_PREFIX}로 시작하지 않아요`,
  quote: "작은따옴표(')가 들어 있어요",
  newline: '줄바꿈이 들어 있어요',
  space: '앞이나 뒤에 빈칸이 있어요',
  inner: '가운데에 빈칸이 있어요',
} as const

export function applyApiKey(text: string, key: string): { ok: true; text: string } | { ok: false; reason: string } {
  const check = checkEnvValue(key)
  if (check !== 'ok') return { ok: false, reason: REASON[check] }
  if (!key.startsWith(KEY_PREFIX)) return { ok: false, reason: REASON.prefix }
  if (/\s/.test(key)) return { ok: false, reason: REASON.inner }
  return { ok: true, text: upsertEnvText(text, { [KEY_NAME]: key }) }
}

export type AiKeyDeps = {
  isTerminal: boolean
  ask(): Promise<string | null> // 숨김 입력 한 번. Ctrl+C면 null
  read(): string | null // 지금 .env.local 글자(없으면 null)
  write(text: string): void // writePrivateFile
  print(line: string): void
}

export async function runAiKey(deps: AiKeyDeps): Promise<number> {
  const { print } = deps
  if (!deps.isTerminal) {
    print('입력을 숨길 수 있는 터미널이 아니에요 — Claude 창이 아닌 따로 연 터미널에서 `npm run ai:key`를 실행해 주세요')
    return 1
  }
  let before: string
  try {
    before = deps.read() ?? ''
  } catch {
    print('.env.local을 읽지 못했어요(파일 권한 등) — Claude에게 알려 주세요')
    return 1
  }

  print(`.env.local에 ${KEY_NAME}를 넣어요.`)
  print('- 치거나 붙여 넣은 글자는 화면에 보이지 않아요. 넣은 뒤 Enter를 누르세요')
  print('- 그대로 두려면 아무것도 치지 말고 Enter, 멈추려면 Ctrl+C')

  for (;;) {
    const answer = await deps.ask()
    if (answer === null) {
      print('멈췄어요 — .env.local은 바꾸지 않았어요')
      return CANCELLED
    }
    if (answer === '') {
      print(`${KEY_NAME}: 그대로`)
      return 0
    }
    const result = applyApiKey(before, answer)
    if (!result.ok) {
      print(`  저장하지 않았어요: ${result.reason} — 다시 넣어 주세요(그대로 두려면 아무것도 치지 말고 Enter)`)
      continue
    }
    try {
      deps.write(result.text)
    } catch {
      print('.env.local에 저장하지 못했어요(파일 권한·저장 공간) — 다시 실행하거나 Claude에게 알려 주세요')
      return 1
    }
    print(`${KEY_NAME}: 넣음 (${Array.from(answer).length}자) — .env.local (권한 600)`)
    print('이제 `npm run ai:try`로 가짜 숫자 리포트를 뽑아 볼 수 있어요')
    return 0
  }
}
