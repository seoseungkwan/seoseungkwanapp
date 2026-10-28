import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const PATIENT_ZONE_MESSAGE = '환자 자료 구역(lib/parsers·lib/analytics·lib/payload·workers)은 네트워크를 쓸 수 없다'
const CONSOLE_MESSAGE = '환자 자료 구역은 console을 쓸 수 없다(환자 자료가 로그에 남는다)'
const IMPORT_MESSAGE = '환자 자료 구역은 React·Next·services·supabase·lib/auth를 import할 수 없다'
// 저장은 lib/storage가 검사한 달 숫자(MonthPayload)만 한다. 환자 줄이 저장소로 새지 않게
const STORAGE_MESSAGE = '환자 자료 구역은 브라우저 저장소를 쓸 수 없다'
const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']
const STORAGE = ['indexedDB', 'localStorage', 'sessionStorage']
// 동적 import()용. 아래 no-restricted-imports group과 같은 목록이다
const BLOCKED_IMPORT = /^(react|react-dom|next)(\/|$)|^@supabase\/|(^|\/)(services|supabase|auth)(\/|$)/
const STORAGE_IMPORT = /(^|\/)storage(\/|$)/

const eslintConfig = [
  {
    ignores: ['.next/', 'node_modules/', '.claude/', 'scripts/', 'phases/', 'next-env.d.ts'],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 파일에서 온 글을 HTML로 넣지 않는다
      'react/no-danger': 'error',
    },
  },
  {
    // 환자 자료 구역: 시험 파일도 같은 규칙 아래. node:*(시험이 가짜 파일 읽기)는 막지 않는다
    files: ['src/lib/parsers/**', 'src/lib/analytics/**', 'src/lib/payload/**', 'src/workers/**'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'react',
                'react-dom',
                'react/*',
                'react-dom/*',
                'next',
                'next/*',
                '@/services/*',
                '@/lib/supabase/*',
                '@supabase/*',
                '@/lib/auth',
                '@/lib/auth/*',
                '**/services',
                '**/services/**',
                '**/supabase',
                '**/supabase/**',
                '**/auth',
                '**/auth/**',
              ],
              message: IMPORT_MESSAGE,
            },
            {
              group: ['@/lib/storage', '@/lib/storage/*', '**/storage', '**/storage/**'],
              message: STORAGE_MESSAGE,
            },
          ],
        },
      ],
      // no-restricted-imports는 동적 import()를 검사하지 않는다. .tsx의 JSX는 import 줄 없이 react/jsx-runtime을 불러온다
      'no-restricted-syntax': [
        'error',
        { selector: `ImportExpression[source.value=${BLOCKED_IMPORT}]`, message: IMPORT_MESSAGE },
        { selector: `ImportExpression[source.value=${STORAGE_IMPORT}]`, message: STORAGE_MESSAGE },
        {
          selector: "ImportExpression[source.type!='Literal']",
          message: '환자 자료 구역의 동적 import()는 글자로 고정한 경로만 쓴다',
        },
        { selector: 'JSXElement, JSXFragment', message: '환자 자료 구역은 JSX(React)를 쓸 수 없다' },
      ],
      'no-restricted-globals': [
        'error',
        ...NETWORK.map((name) => ({ name, message: PATIENT_ZONE_MESSAGE })),
        ...STORAGE.map((name) => ({ name, message: STORAGE_MESSAGE })),
        // no-console은 console.x만 잡는다. const c = console 같은 우회를 막는다
        { name: 'console', message: CONSOLE_MESSAGE },
      ],
      // window·self·globalThis·navigator 등 어느 객체를 거쳐도 막는다
      'no-restricted-properties': [
        'error',
        ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: PATIENT_ZONE_MESSAGE })),
        ...STORAGE.map((property) => ({ property, message: STORAGE_MESSAGE })),
        { property: 'console', message: CONSOLE_MESSAGE },
      ],
      'no-console': 'error',
    },
  },
]

export default eslintConfig
