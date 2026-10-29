// Playwright 설정 값만 둔다(playwright.config.ts가 defineConfig로 감싼다). e2e/config.test.ts(Vitest)가 이 값을 본다.
// @playwright/test는 type import만 한다: 런타임 import는 Vitest 안에서 Playwright를 돌리려 한다
import type { PlaywrightTestConfig } from '@playwright/test'

// 이 VPS 밖에서 닿지 않게 127.0.0.1에만 띄운다(0.0.0.0 금지). baseURL 호스트와 같아야 로그인 쿠키가 따라간다
export const APP_HOST = '127.0.0.1'
export const APP_PORT = 3100
export const APP_ORIGIN = 'http://127.0.0.1:3100'

export const e2eConfig: PlaywrightTestConfig = {
  testDir: 'e2e',
  // Playwright 기본값은 *.test.ts도 잡는다. 그것들은 Vitest 단위 시험이다
  testMatch: /\.spec\.ts$/,
  outputDir: 'test-results',
  // 글자 보고만. HTML·blob 보고서는 첨부를 모아 파일로 남긴다
  reporter: [['list']],
  workers: 1,
  fullyParallel: false,
  forbidOnly: true,
  retries: 0,
  use: {
    baseURL: APP_ORIGIN,
    // 시험 산출물에 쿠키·토큰·화면 내용(개인정보)을 남기지 않는다(CLAUDE.md 보안 규칙). 실패는 글자 메시지로 본다
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    viewport: { width: 1366, height: 768 },
  },
  // devices 값은 런타임 import라 쓰지 않는다
  projects: [{ name: 'chromium', use: { browserName: 'chromium' } }],
  webServer: {
    // 운영 빌드(npm run e2e가 먼저 next build)를 띄워 CSP까지 실제와 같게 본다
    command: 'npx next start -H 127.0.0.1 -p 3100',
    url: `${APP_ORIGIN}/login`,
    // 포트가 이미 쓰이고 있으면 다른 서버를 시험하지 않고 실패한다
    reuseExistingServer: false,
    timeout: 120_000,
  },
}
