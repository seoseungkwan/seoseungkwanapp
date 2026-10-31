// npm run e2e의 마지막 단계(시작 전 검사·next build 뒤). 설정 값은 모두 e2e/config.ts에 있다
import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from '@playwright/test'
import { e2eConfig } from './e2e/config'

// 시험 일꾼이 E2E 값을 물려받게 .env.local을 읽는다. 없으면 조용히 넘어간다:
// 그때는 각 시험이 e2e/support의 readE2eEnv 검사로 실패한다(건너뛰어 통과처럼 끝나지 않는다). 값은 출력하지 않는다
const envFile = resolve(__dirname, '.env.local')
if (existsSync(envFile)) process.loadEnvFile(envFile)

export default defineConfig(e2eConfig)
