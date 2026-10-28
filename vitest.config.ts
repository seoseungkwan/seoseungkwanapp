// 시험 일꾼들이 이 값을 물려받는다(설정 파일이 일꾼보다 먼저 돈다).
// 한국 시간에서 날짜가 하루 밀리는 버그를 시험이 잡게 한다.
process.env.TZ = 'Asia/Seoul'

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 찾는 시험: src/**/*.test.ts, fixtures/**/*.test.ts
export default defineConfig({
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  test: {
    include: ['src/**/*.test.ts', 'fixtures/**/*.test.ts'],
    exclude: ['node_modules/**'],
    environment: 'node',
  },
})
