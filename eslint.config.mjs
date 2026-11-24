import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const PATIENT_ZONE_MESSAGE =
  '환자 자료 구역(lib/parsers·lib/analytics·lib/payload·lib/precheck·lib/patients·lib/bridge·workers)은 네트워크를 쓸 수 없다'
const CONSOLE_MESSAGE = '환자 자료 구역은 console을 쓸 수 없다(환자 자료가 로그에 남는다)'
const IMPORT_MESSAGE = '환자 자료 구역은 React·Next·services·supabase·lib/auth를 import할 수 없다'
// 저장은 lib/storage가 검사한 달 숫자(MonthPayload)만 한다. 환자 줄이 저장소로 새지 않게
const STORAGE_MESSAGE = '환자 자료 구역은 브라우저 저장소를 쓸 수 없다'
const NETWORK = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts']
const STORAGE = ['indexedDB', 'localStorage', 'sessionStorage']
// 동적 import()용. 아래 no-restricted-imports group과 같은 목록이다
const BLOCKED_IMPORT = /^(react|react-dom|next)(\/|$)|^@supabase\/|(^|\/)(services|supabase|auth)(\/|$)/
const STORAGE_IMPORT = /(^|\/)storage(\/|$)/
// 통로 코드(lib/bridge, ADR-020·AC-004.1): 창 사이 통신 금지, 확장에는 extensionId.ts의 EXTENSION_ID로만 말한다
const WINDOW_MESSAGE = '통로 코드는 창 사이 통신(postMessage·BroadcastChannel·parent·top·opener)을 쓸 수 없다'
const WINDOW_OBJECT_MESSAGE =
  '통로 코드는 창·문서 객체(window·self·globalThis·frames·document)와 eval·Function·Reflect를 쓸 수 없다(창 사이 통신·규칙 우회를 막는다)'
const EXTENSION_ID_MESSAGE = '통로 코드는 확장에 extensionId.ts의 EXTENSION_ID로만 말한다(chrome.runtime.connect(EXTENSION_ID))'
const WINDOW_OBJECTS = ['window', 'self', 'globalThis', 'frames', 'document']
// 전역 객체를 꺼내거나(Function('return this')) 이름을 글자로 받아 꺼내는(Reflect.get) 길
const ESCAPE_GLOBALS = ['eval', 'Function', 'Reflect']
const CROSS_WINDOW = ['postMessage', 'BroadcastChannel', 'parent', 'top', 'opener']
const CONNECT = '/^(connect|sendMessage)$/'
// client.ts는 lib/bridge 밖에서 import할 수 없다. 화면은 workerSink.ts만 쓴다(AC-004.11)
const CLIENT_MESSAGE = 'lib/bridge/client.ts는 lib/bridge 밖에서 import할 수 없다. 화면은 lib/bridge/workerSink.ts의 connectScreenBridge를 쓴다'
const CLIENT_IMPORT = { group: ['@/lib/bridge/client', '@/lib/bridge/client.*', '**/bridge/client', '**/bridge/client.*'], message: CLIENT_MESSAGE }
const CLIENT_IMPORT_SYNTAX = { selector: 'ImportExpression[source.value=/(^|\\/)bridge\\/client(\\.[a-z]+)?$/]', message: CLIENT_MESSAGE }
// 크롬 확장(AC-003.4): 도우미 답(환자 자료)이 확장 안에 남거나 로그·네트워크로 새지 않게
const EXTENSION_STORAGE_MESSAGE = '크롬 확장은 chrome.storage·브라우저 저장소를 쓸 수 없다(도우미 답이 확장 안에 남는다)'
const EXTENSION_NETWORK_MESSAGE = '크롬 확장은 네트워크를 쓸 수 없다(도우미 답은 그 웹 연결로만 간다)'
const EXTENSION_CONSOLE_MESSAGE = '크롬 확장은 console을 쓸 수 없다(도우미 답이 로그에 남는다)'
// ERP 마감일지 확장(AC-3601.5): 설정만 chrome.storage.local에 둔다. 도우미 답이 웹 저장소·로그·네트워크로 새지 않게
const ERP_EXTENSION_NETWORK_MESSAGE = 'ERP 확장은 네트워크를 쓸 수 없다(도우미 답은 ERP 화면 칸으로만 간다)'
const ERP_EXTENSION_STORAGE_MESSAGE = 'ERP 확장은 웹 저장소를 쓸 수 없다(설정은 chrome.storage.local에만, 도우미 답은 저장하지 않는다)'
const ERP_EXTENSION_CONSOLE_MESSAGE = 'ERP 확장은 console을 쓸 수 없다(도우미 답이 로그에 남는다)'
// 통계 저장(AC-507.3): 검사한 저장 모양만 다룬다. 환자 줄을 읽거나 만드는 코드를 부르지 못한다
const STATS_STORAGE_IMPORT_MESSAGE =
  '통계 저장(lib/storage/stats.ts)은 lib/parsers·lib/bridge·workers를 import할 수 없고, lib/analytics는 dates·coverage만 쓴다'
const STATS_STORAGE_BROWSER_MESSAGE = '통계 저장(lib/storage/stats.ts)은 브라우저 저장소를 쓸 수 없다'
const STATS_STORAGE_CONSOLE_MESSAGE = '통계 저장(lib/storage/stats.ts)은 console을 쓸 수 없다'
// 빼는 경로를 glob으로 쓰면 lib/analytics 자체를 막을 때 dates·coverage까지 막혀 정규식으로 쓴다
const STATS_STORAGE_BLOCKED = /(^|\/)(parsers|bridge|workers)(\/|$)|(^|\/)analytics(\/(?!(dates|coverage)$)|$)/
// 환자 화면(REQ-601): 오류 보고 패키지는 화면 글·오류 내용을 밖으로 보낸다. 환자 줄이 실려 나가지 않게
const ERROR_REPORT_MESSAGE = '환자 화면(components/patients·app/(app)/patients)은 오류 보고 패키지(@sentry·@vercel/analytics·@vercel/speed-insights)를 쓸 수 없다'
const ERROR_REPORT_IMPORT = {
  group: ['@sentry/*', '@vercel/analytics', '@vercel/analytics/*', '@vercel/speed-insights', '@vercel/speed-insights/*'],
  message: ERROR_REPORT_MESSAGE,
}
const ERROR_REPORT_SYNTAX = {
  selector: 'ImportExpression[source.value=/^@sentry\\/|^@vercel\\/(analytics|speed-insights)(\\/|$)/]',
  message: ERROR_REPORT_MESSAGE,
}
// 환자 줄을 그리는 화면(components/patients/rows): JSX·React는 되고, 받은 줄을 밖·저장소·로그로 보내지 못한다
const PATIENT_ROWS_MESSAGE = '환자 줄 화면(components/patients/rows)은 네트워크를 쓸 수 없다(줄은 props로만 받는다)'
const PATIENT_ROWS_CONSOLE_MESSAGE = '환자 줄 화면은 console을 쓸 수 없다(환자 자료가 로그에 남는다)'
const PATIENT_ROWS_STORAGE_MESSAGE = '환자 줄 화면은 브라우저 저장소·lib/storage를 쓸 수 없다'
const PATIENT_ROWS_IMPORT_MESSAGE = '환자 줄 화면은 supabase·lib/auth를 import할 수 없다(줄은 props로만 받는다)'
// 동적 import()용. 아래 patientRowsRules의 no-restricted-imports group과 같은 목록이다(React·Next는 된다)
const PATIENT_ROWS_BLOCKED_IMPORT = /^@supabase\/|(^|\/)(supabase|auth)(\/|$)/

// 환자 자료 구역 규칙(시험 파일도 같은 규칙 아래). node:*(시험이 가짜 파일 읽기)는 막지 않는다.
// 같은 규칙 이름은 뒤 설정이 앞 설정을 통째로 덮으므로, 구역마다 이 함수로 목록 전체를 만든다
function patientZoneRules({ bridge = false, declaresExtensionId = false } = {}) {
  return {
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
          // 통로 안에서만 client.ts를 쓴다
          ...(bridge ? [] : [CLIENT_IMPORT]),
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
      ...(bridge ? bridgeSyntax({ declaresExtensionId }) : [CLIENT_IMPORT_SYNTAX]),
    ],
    'no-restricted-globals': [
      'error',
      ...NETWORK.map((name) => ({ name, message: PATIENT_ZONE_MESSAGE })),
      ...STORAGE.map((name) => ({ name, message: STORAGE_MESSAGE })),
      // no-console은 console.x만 잡는다. const c = console 같은 우회를 막는다
      { name: 'console', message: CONSOLE_MESSAGE },
      ...(bridge
        ? [
            ...CROSS_WINDOW.map((name) => ({ name, message: WINDOW_MESSAGE })),
            ...[...WINDOW_OBJECTS, ...ESCAPE_GLOBALS].map((name) => ({ name, message: WINDOW_OBJECT_MESSAGE })),
          ]
        : []),
    ],
    // window·self·globalThis·navigator 등 어느 객체를 거쳐도 막는다
    'no-restricted-properties': [
      'error',
      ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: PATIENT_ZONE_MESSAGE })),
      ...STORAGE.map((property) => ({ property, message: STORAGE_MESSAGE })),
      { property: 'console', message: CONSOLE_MESSAGE },
      // worker.postMessage·MessagePort.postMessage는 된다. 막는 것은 창 객체의 것뿐이다
      ...(bridge
        ? [
            { property: 'BroadcastChannel', message: WINDOW_MESSAGE },
            // 문서에서 창으로 가는 길(document.defaultView·el.ownerDocument.defaultView)
            { property: 'defaultView', message: WINDOW_OBJECT_MESSAGE },
            ...WINDOW_OBJECTS.flatMap((object) =>
              ['postMessage', 'parent', 'top', 'opener'].map((property) => ({ object, property, message: WINDOW_MESSAGE })),
            ),
          ]
        : []),
    ],
    'no-console': 'error',
  }
}

// 청구 화면 폴더(AC-013.7, design.md 5절 '오류 수집 없음'): 오류 보고 패키지가 환자 글자를 밖으로 내보내지 못하게 한다. 오류 카드는 번호만 보인다
const REPORTER_MESSAGE = '청구 화면은 오류 보고 패키지(@sentry·@vercel/analytics·@vercel/speed-insights)를 import할 수 없다(환자 자료가 밖으로 나간다)'
const REPORTER_IMPORT = {
  group: ['@sentry/*', '@vercel/analytics', '@vercel/analytics/*', '@vercel/speed-insights', '@vercel/speed-insights/*'],
  message: REPORTER_MESSAGE,
}
const REPORTER_SYNTAX = { selector: 'ImportExpression[source.value=/^(@sentry\\/|@vercel\\/(analytics|speed-insights)(\\/|$))/]', message: REPORTER_MESSAGE }
const CLAIM_STORAGE_MESSAGE = '청구 화면은 브라우저 저장소를 쓸 수 없다(환자 글자가 남는다). 작업 저장은 도우미 store.save뿐이다'
const claimStorageGlobals = (message) => STORAGE.map((name) => ({ name, message }))
const claimStorageProperties = (message) => STORAGE.map((property) => ({ property, message }))

// 청구 화면 폴더 전체. 같은 규칙 이름은 뒤 설정이 덮으므로 아래 줄 화면 설정에도 같은 것을 넣었다
function claimScreenRules() {
  return {
    'no-restricted-imports': ['error', { patterns: [CLIENT_IMPORT, REPORTER_IMPORT] }],
    'no-restricted-syntax': ['error', CLIENT_IMPORT_SYNTAX, REPORTER_SYNTAX],
    'no-restricted-globals': ['error', ...claimStorageGlobals(CLAIM_STORAGE_MESSAGE)],
    'no-restricted-properties': ['error', ...claimStorageProperties(CLAIM_STORAGE_MESSAGE)],
  }
}

// 환자 줄 화면 components/claim/rows(AC-013.7, ADR-020): JSX는 되지만 네트워크·console·브라우저 저장소·supabase·storage·auth는 안 된다. 줄은 props로만 받는다
const ROWS_NETWORK_MESSAGE = '환자 줄 화면은 네트워크를 쓸 수 없다'
const ROWS_CONSOLE_MESSAGE = '환자 줄 화면은 console을 쓸 수 없다(환자 자료가 로그에 남는다)'
const ROWS_STORAGE_MESSAGE = '환자 줄 화면은 브라우저 저장소를 쓸 수 없다'
const ROWS_IMPORT_MESSAGE = '환자 줄 화면은 supabase·services·lib/storage·lib/auth를 import할 수 없다. 줄은 props로만 받는다'
const ROWS_BLOCKED_IMPORT = /^@supabase\/|(^|\/)(services|supabase|auth|storage)(\/|$)/
function claimRowsRules() {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          CLIENT_IMPORT,
          REPORTER_IMPORT,
          {
            group: [
              '@/services/*',
              '@/lib/supabase/*',
              '@supabase/*',
              '@/lib/auth',
              '@/lib/auth/*',
              '@/lib/storage',
              '@/lib/storage/*',
              '**/services',
              '**/services/**',
              '**/supabase',
              '**/supabase/**',
              '**/auth',
              '**/auth/**',
              '**/storage',
              '**/storage/**',
            ],
            message: ROWS_IMPORT_MESSAGE,
          },
        ],
      },
    ],
    'no-restricted-syntax': [
      'error',
      CLIENT_IMPORT_SYNTAX,
      REPORTER_SYNTAX,
      { selector: `ImportExpression[source.value=${ROWS_BLOCKED_IMPORT}]`, message: ROWS_IMPORT_MESSAGE },
      { selector: "ImportExpression[source.type!='Literal']", message: '환자 줄 화면의 동적 import()는 글자로 고정한 경로만 쓴다' },
    ],
    'no-restricted-globals': [
      'error',
      ...NETWORK.map((name) => ({ name, message: ROWS_NETWORK_MESSAGE })),
      ...claimStorageGlobals(ROWS_STORAGE_MESSAGE),
      { name: 'console', message: ROWS_CONSOLE_MESSAGE },
    ],
    'no-restricted-properties': [
      'error',
      ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: ROWS_NETWORK_MESSAGE })),
      ...claimStorageProperties(ROWS_STORAGE_MESSAGE),
      { property: 'console', message: ROWS_CONSOLE_MESSAGE },
    ],
    'no-console': 'error',
  }
}

// 환자 줄 화면(components/patients/rows, AC-601.2). 같은 규칙 이름은 뒤 설정이 앞 설정을 통째로 덮으므로
// 전역 블록의 client.ts 금지(CLIENT_IMPORT)와 환자 화면의 오류 보고 패키지 금지도 여기 다시 넣는다
function patientRowsRules() {
  return {
    'no-restricted-imports': [
      'error',
      {
        patterns: [
          {
            group: [
              '@supabase/*',
              '@/lib/supabase',
              '@/lib/supabase/*',
              '@/lib/auth',
              '@/lib/auth/*',
              '**/supabase',
              '**/supabase/**',
              '**/auth',
              '**/auth/**',
            ],
            message: PATIENT_ROWS_IMPORT_MESSAGE,
          },
          { group: ['@/lib/storage', '@/lib/storage/*', '**/storage', '**/storage/**'], message: PATIENT_ROWS_STORAGE_MESSAGE },
          ERROR_REPORT_IMPORT,
          CLIENT_IMPORT,
        ],
      },
    ],
    // no-restricted-imports는 동적 import()를 검사하지 않는다
    'no-restricted-syntax': [
      'error',
      { selector: `ImportExpression[source.value=${PATIENT_ROWS_BLOCKED_IMPORT}]`, message: PATIENT_ROWS_IMPORT_MESSAGE },
      { selector: `ImportExpression[source.value=${STORAGE_IMPORT}]`, message: PATIENT_ROWS_STORAGE_MESSAGE },
      {
        selector: "ImportExpression[source.type!='Literal']",
        message: '환자 줄 화면의 동적 import()는 글자로 고정한 경로만 쓴다',
      },
      ERROR_REPORT_SYNTAX,
      CLIENT_IMPORT_SYNTAX,
    ],
    'no-restricted-globals': [
      'error',
      ...NETWORK.map((name) => ({ name, message: PATIENT_ROWS_MESSAGE })),
      ...STORAGE.map((name) => ({ name, message: PATIENT_ROWS_STORAGE_MESSAGE })),
      { name: 'console', message: PATIENT_ROWS_CONSOLE_MESSAGE },
    ],
    // window·self·globalThis·navigator 등 어느 객체를 거쳐도 막는다
    'no-restricted-properties': [
      'error',
      ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: PATIENT_ROWS_MESSAGE })),
      ...STORAGE.map((property) => ({ property, message: PATIENT_ROWS_STORAGE_MESSAGE })),
      { property: 'console', message: PATIENT_ROWS_CONSOLE_MESSAGE },
    ],
    'no-console': 'error',
  }
}


// 통로 코드만: 확장에 말을 거는 곳(connect·sendMessage)은 첫 인자가 EXTENSION_ID일 때만. 주입받은 runtime도 같다
function bridgeSyntax({ declaresExtensionId }) {
  return [
    { selector: `CallExpression[callee.property.name=${CONNECT}]:not([arguments.0.name='EXTENSION_ID'])`, message: EXTENSION_ID_MESSAGE },
    { selector: `CallExpression[callee.name=${CONNECT}]:not([arguments.0.name='EXTENSION_ID'])`, message: EXTENSION_ID_MESSAGE },
    // connect·sendMessage는 그 자리에서 부르기만 한다. 값으로 꺼내(const c = runtime.connect·Reflect.apply(runtime.connect, …)·
    // runtime.connect.call(…)) 다른 이름으로 부르지 못한다. 확장이 있는지 보는 typeof만 된다
    {
      selector: `MemberExpression[property.name=${CONNECT}]:not(CallExpression > MemberExpression.callee):not(UnaryExpression[operator='typeof'] > MemberExpression)`,
      message: EXTENSION_ID_MESSAGE,
    },
    // 꺼내 쓰기: const { connect: c } = runtime · const { 'connect': c } · const { [k]: c }
    { selector: `ObjectPattern > Property[key.name=${CONNECT}]`, message: EXTENSION_ID_MESSAGE },
    { selector: 'ObjectPattern > Property[computed=true]', message: EXTENSION_ID_MESSAGE },
    // 이름을 글자로 쓰는 길(runtime['connect']·Reflect.get(runtime, 'connect')·`sendMessage`)
    { selector: `Literal[value=${CONNECT}]`, message: EXTENSION_ID_MESSAGE },
    { selector: `TemplateElement[value.cooked=${CONNECT}]`, message: EXTENSION_ID_MESSAGE },
    // runtime[k](…)처럼 글자로 고정하지 않은 이름으로 부르지 못한다
    { selector: "CallExpression[callee.computed=true][callee.property.type!='Literal']", message: EXTENSION_ID_MESSAGE },
    // EXTENSION_ID라는 이름에 다른 값을 담지 못한다: extensionId.ts에서 만들고, 그 파일에서 같은 이름으로만 가져온다
    ...(declaresExtensionId
      ? []
      : [{ selector: "VariableDeclarator[id.name='EXTENSION_ID']", message: EXTENSION_ID_MESSAGE }]),
    {
      selector: "ImportDeclaration[source.value!=/(^|\\/)extensionId$/] > ImportSpecifier[local.name='EXTENSION_ID']",
      message: EXTENSION_ID_MESSAGE,
    },
    { selector: "ImportSpecifier[local.name='EXTENSION_ID'][imported.name!='EXTENSION_ID']", message: EXTENSION_ID_MESSAGE },
    { selector: ":function > Identifier.params[name='EXTENSION_ID']", message: EXTENSION_ID_MESSAGE },
    { selector: ":function > AssignmentPattern.params > Identifier.left[name='EXTENSION_ID']", message: EXTENSION_ID_MESSAGE },
  ]
}

const eslintConfig = [
  {
    ignores: [
      '.next/',
      'node_modules/',
      '.claude/',
      'scripts/',
      'phases/',
      'next-env.d.ts',
      'extension/dist/',
      'extension-erp/dist/',
      'extension-erp-list/dist/',
    ],
  },
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    rules: {
      // 파일에서 온 글을 HTML로 넣지 않는다
      'react/no-danger': 'error',
    },
  },
  {
    // client.ts는 lib/bridge 밖에서 import할 수 없다(AC-004.11). 아래 구역 설정은 이 규칙 이름을 덮으므로 거기에도 넣었다
    files: ['**/*.{js,jsx,mjs,cjs,ts,tsx,mts,cts}'],
    ignores: ['src/lib/bridge/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [CLIENT_IMPORT] }],
      'no-restricted-syntax': ['error', CLIENT_IMPORT_SYNTAX],
    },
  },
  {
    // 환자 자료 구역
    files: [
      'src/lib/parsers/**',
      'src/lib/analytics/**',
      'src/lib/payload/**',
      'src/lib/precheck/**',
      'src/lib/patients/**',
      'src/workers/**',
    ],
    rules: patientZoneRules(),
  },
  {
    // 청구 화면 폴더(AC-013.7): 오류 보고 패키지·브라우저 저장소 금지
    files: ['src/components/claim/**', 'src/app/\\(app\\)/claim/**'],
    rules: claimScreenRules(),
  },
  {
    // 환자 줄 화면(AC-013.7): 위 설정 + 네트워크·console·supabase·storage·auth 금지. JSX는 된다
    files: ['src/components/claim/rows/**'],
    rules: claimRowsRules(),
  },
  {
    // 통로 코드(lib/bridge): 환자 자료 구역 규칙 전부 + 창 사이 통신 금지 + 확장에는 EXTENSION_ID로만(AC-004.1)
    files: ['src/lib/bridge/**'],
    ignores: ['src/lib/bridge/extensionId.ts'],
    rules: patientZoneRules({ bridge: true }),
  },
  {
    // EXTENSION_ID를 만드는 한 곳
    files: ['src/lib/bridge/extensionId.ts'],
    rules: patientZoneRules({ bridge: true, declaresExtensionId: true }),
  },
  {
    // 통계 저장(AC-507.3). 이 파일만 — 다른 브랜치가 src/lib/storage/에 둘 파일에는 규칙을 씌우지 않는다.
    // 맨 위 client.ts 금지를 덮으므로 여기에도 넣었다
    files: ['src/lib/storage/stats.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: [CLIENT_IMPORT, { regex: STATS_STORAGE_BLOCKED.source, message: STATS_STORAGE_IMPORT_MESSAGE }] },
      ],
      'no-restricted-syntax': [
        'error',
        CLIENT_IMPORT_SYNTAX,
        { selector: `ImportExpression[source.value=${STATS_STORAGE_BLOCKED}]`, message: STATS_STORAGE_IMPORT_MESSAGE },
        { selector: "ImportExpression[source.type!='Literal']", message: '통계 저장의 동적 import()는 글자로 고정한 경로만 쓴다' },
      ],
      'no-restricted-globals': [
        'error',
        ...STORAGE.map((name) => ({ name, message: STATS_STORAGE_BROWSER_MESSAGE })),
        { name: 'console', message: STATS_STORAGE_CONSOLE_MESSAGE },
      ],
      'no-restricted-properties': [
        'error',
        ...STORAGE.map((property) => ({ property, message: STATS_STORAGE_BROWSER_MESSAGE })),
        { property: 'console', message: STATS_STORAGE_CONSOLE_MESSAGE },
      ],
      'no-console': 'error',
    },
  },
  {
    // 크롬 확장: 시험 파일도 같은 규칙 아래(src/guardrails.test.ts가 규칙마다 증명)
    files: ['extension/src/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK.map((name) => ({ name, message: EXTENSION_NETWORK_MESSAGE })),
        ...STORAGE.map((name) => ({ name, message: EXTENSION_STORAGE_MESSAGE })),
        { name: 'console', message: EXTENSION_CONSOLE_MESSAGE },
      ],
      // 어느 객체를 거쳐도 막는다. storage는 chrome.storage·const { storage } = chrome·c = chrome; c.storage 모두
      'no-restricted-properties': [
        'error',
        ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: EXTENSION_NETWORK_MESSAGE })),
        ...[...STORAGE, 'storage'].map((property) => ({ property, message: EXTENSION_STORAGE_MESSAGE })),
        { property: 'console', message: EXTENSION_CONSOLE_MESSAGE },
      ],
      // chrome[이름]처럼 글자로 고정하지 않은 멤버 접근은 무엇을 꺼내는지 알 수 없다
      'no-restricted-syntax': [
        'error',
        {
          selector: "MemberExpression[computed=true][object.name='chrome'][property.type!='Literal']",
          message: EXTENSION_STORAGE_MESSAGE,
        },
        CLIENT_IMPORT_SYNTAX,
      ],
      'no-console': 'error',
    },
  },
  {
    // ERP 마감일지 확장(AC-3601.5): 시험 파일·하위 폴더도 같은 규칙 아래. chrome.storage(설정)는 된다
    // ERP 마감일지 입력 목록 확장(spec erp-copy-list AC-3901.4)도 같은 규칙 아래(새 코드에 chrome.storage가 없는지는 그 시험이 글자로 본다)
    files: ['extension-erp/src/**', 'extension-erp-list/src/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK.map((name) => ({ name, message: ERP_EXTENSION_NETWORK_MESSAGE })),
        ...STORAGE.map((name) => ({ name, message: ERP_EXTENSION_STORAGE_MESSAGE })),
        { name: 'console', message: ERP_EXTENSION_CONSOLE_MESSAGE },
      ],
      // window·self·globalThis·navigator 등 어느 객체를 거쳐도 막는다
      'no-restricted-properties': [
        'error',
        ...[...NETWORK, 'sendBeacon'].map((property) => ({ property, message: ERP_EXTENSION_NETWORK_MESSAGE })),
        ...STORAGE.map((property) => ({ property, message: ERP_EXTENSION_STORAGE_MESSAGE })),
        { property: 'console', message: ERP_EXTENSION_CONSOLE_MESSAGE },
      ],
      'no-console': 'error',
    },
  },
  {
    // 환자 화면: 오류 보고 패키지 금지(AC-601.3). 전역 블록의 client.ts 금지를 덮으므로 다시 넣는다
    files: ['src/components/patients/**', 'src/app/(app)/patients/**'],
    rules: {
      'no-restricted-imports': ['error', { patterns: [ERROR_REPORT_IMPORT, CLIENT_IMPORT] }],
      'no-restricted-syntax': ['error', ERROR_REPORT_SYNTAX, CLIENT_IMPORT_SYNTAX],
    },
  },
  {
    // 환자 줄 화면(AC-601.2): 위 블록 다음에 두어 rows 파일은 이 블록이 이긴다
    files: ['src/components/patients/rows/**'],
    rules: patientRowsRules(),
  },
]

export default eslintConfig
