// 시험 일꾼들이 이 값을 물려받는다(설정 파일이 일꾼보다 먼저 돈다).
// 한국 시간에서 날짜가 하루 밀리는 버그를 시험이 잡게 한다.
process.env.TZ = 'Asia/Seoul'

import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'

// 찾는 시험: src/**/*.test.ts(x), fixtures/**/*.test.ts, supabase/**/*.test.ts(RLS, PGlite), e2e/**/*.test.ts(E2E 도우미 단위 시험),
// helper/tests/*.test.ts(도우미 C# 시험 감싸개), extension/**/*.test.ts(크롬 확장)
// e2e/**/*.spec.ts는 Playwright 시험이라 여기서 잡지 않는다
// tsconfig는 Next용 jsx: preserve라, 시험에서는 JSX를 automatic 런타임으로 바꾼다
// 화면 시험은 파일 맨 위 `// @vitest-environment jsdom`으로 브라우저 환경을 고른다
export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  resolve: {
    alias: [
      { find: '@', replacement: fileURLToPath(new URL('./src', import.meta.url)) },
      // server-only는 react-server 조건 밖에서 import하면 던진다. 시험에서는 빈 모듈로 바꾼다
      {
        find: /^server-only$/,
        replacement: fileURLToPath(new URL('./node_modules/server-only/empty.js', import.meta.url)),
      },
    ],
  },
  test: {
    include: [
      'src/**/*.test.{ts,tsx}',
      'fixtures/**/*.test.ts',
      'supabase/**/*.test.ts',
      'e2e/**/*.test.ts',
      'helper/tests/*.test.ts',
      'extension/**/*.test.ts',
    ],
    exclude: ['node_modules/**'],
    environment: 'node',
  },
})
