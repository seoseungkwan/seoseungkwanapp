// npm run e2e 첫 단계: .env.local 읽기 → 값 검사 → Supabase 공개 설정 검사. 문제가 있으면 0이 아닌 코드로 멈춰
// 뒤의 next build·playwright test가 돌지 않는다(package.json의 &&). 검사는 e2e/lib/env.ts가 하고 여기는 이어 붙이기만 한다.
// CRITICAL: 값·응답·오류 내용은 출력하지 않는다(startProblemMessage는 이름과 무엇이 틀렸는지만 담는다)
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { checkSupabase, readE2eEnv, startProblemMessage } from './lib/env'

const ENV_FILE = resolve(__dirname, '..', '.env.local')

async function preflight(): Promise<string[]> {
  if (existsSync(ENV_FILE)) {
    try {
      process.loadEnvFile(ENV_FILE)
    } catch {
      return ['.env.local을 읽지 못했어요 — 따로 연 터미널에서 `npm run e2e:env`로 다시 넣어 주세요']
    }
  }
  const env = readE2eEnv(process.env)
  if (!env.ok) return env.problems
  return checkSupabase(env.value, fetch)
}

preflight()
  // 오류 내용에는 주소·값이 섞일 수 있어 담지 않는다
  .catch(() => ['시작 전 검사가 예상하지 못한 오류로 멈췄어요 — Claude에게 알려 주세요'])
  .then((problems) => {
    if (problems.length > 0) {
      console.error(startProblemMessage(problems))
      process.exitCode = 1
      return
    }
    console.log('E2E 시작 전 검사 통과 — 빌드와 시험을 시작해요')
  })
