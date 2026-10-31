import { dirname } from 'path'
import { fileURLToPath } from 'url'
import { FlatCompat } from '@eslint/eslintrc'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

const compat = new FlatCompat({
  baseDirectory: __dirname,
})

const PATIENT_ZONE_MESSAGE =
  '환자 자료 구역(lib/parsers·lib/analytics·lib/payload·lib/precheck·lib/bridge·workers)은 네트워크를 쓸 수 없다'
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
    ignores: ['.next/', 'node_modules/', '.claude/', 'scripts/', 'phases/', 'next-env.d.ts', 'extension/dist/'],
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
    files: ['src/lib/parsers/**', 'src/lib/analytics/**', 'src/lib/payload/**', 'src/lib/precheck/**', 'src/workers/**'],
    rules: patientZoneRules(),
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
]

export default eslintConfig
