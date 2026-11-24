// ERP 도우미 실행 프로그램·등록·설치·만들기(spec erp-closing-fill TASK-12, REQ-3611·REQ-3601·REQ-3606, design.md 3-4·3-5)를 파일 글자로 본다.
// - 실행 프로그램(Erp.Helper, net48)은 윈도우에서만 돈다. 그래서 차례·이름·경로·규칙을 글자로 보고, 만들어지는지는 erp-helper-build.dotnet.test.ts가 본다
// - 기존 도우미(helper/)와 그 workflow는 운영(1a721ef) 그대로여야 한다: 줄 끝을 맞춘 글자의 sha256을 1a721ef 값과 견준다
// - YAML 해석 패키지는 넣지 않는다. helper/tests/build.test.ts와 같은 작은 해석기(이 workflow가 쓰는 모양만)를 둔다
// - spec erp-bit-anywhere TASK-1(REQ-3801): 설치 찾기가 ERP 부품 ErpInstallationLocator(AC-3801.3)이고, 청구 도우미 쪽은
//   갈래 시작 커밋 6754571c 그대로다(AC-3801.4, git diff)
// - spec erp-bit-anywhere TASK-2(REQ-3802): install.cmd 여섯 줄(PowerShell 전체 경로, 끝 번호 그대로, 0·1·2 밖이면 pause)을
//   글자로 보고, 윈도우에서는 한글·괄호·&가 든 임시 폴더에서 PATH를 망가뜨린 채 실제로 돌려 본다(가짜 install.ps1만)
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const ERP_HELPER = 'helper-erp/src/Erp.Helper'
const PROGRAM = `${ERP_HELPER}/Program.cs`
const SERVICES = `${ERP_HELPER}/ErpServices.cs`
const LOCATOR = `${ERP_HELPER}/ErpInstallationLocator.cs`
const BIT_DB = `${ERP_HELPER}/ErpBitDb.cs`
const LOG = `${ERP_HELPER}/ErpLog.cs`
const CSPROJ = `${ERP_HELPER}/Erp.Helper.csproj`
const INSTALL = 'helper-erp/install'
const MANIFEST = `${INSTALL}/host-manifest.json`
const INSTALL_CMD = `${INSTALL}/install.cmd`
const INSTALL_PS1 = `${INSTALL}/install.ps1`
const UNINSTALL_PS1 = `${INSTALL}/uninstall.ps1`
/** install.cmd 여섯 줄(spec erp-bit-anywhere design.md, AC-3802.1·3802.2) */
const INSTALL_CMD_LINES = [
  '@echo off',
  'setlocal DisableDelayedExpansion',
  '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"',
  'set ERP_SETUP_CODE=%errorlevel%',
  'if not "%ERP_SETUP_CODE%"=="0" if not "%ERP_SETUP_CODE%"=="2" pause',
  'exit /b %ERP_SETUP_CODE%',
]
const WORKFLOW = '.github/workflows/helper-erp.yml'
const COMMANDS = 'helper-erp/commands.json'

const HOST_NAME = 'com.seoseungkwan.erp_helper'
const EXTENSION_ID = 'lkancaiekmoieooheifdimahhkejfmjc'
const EXE = 'SeoseungkwanErpHelper'
const REG_KEY = 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.seoseungkwan.erp_helper'
const REGISTER_MESSAGES = {
  saved: '이 PC를 등록했어요.',
  cancelled: '등록을 취소했어요. 다시 하려면 install.cmd를 다시 실행하세요.',
  failed: '등록하지 못했어요.',
}
// spec erp-bit-anywhere AC-3806.3: 등록 실패 때 까닭·단계·오류 번호 글
const REGISTER_REASONS = {
  notFound: '이 PC에서 비트를 찾지 못했어요. 이 PC에서 비트가 켜지는지 확인하세요. 다른 컴퓨터에 깔린 비트를 네트워크로 여는 PC는 안전 때문에 쓸 수 없어요.',
  dbFailed: '비트 자료(DB)에 연결하지 못했어요. 이 PC에서 비트가 켜지는지, 자료 서버 컴퓨터가 켜져 있는지 확인하세요. 병원 밖 인터넷 주소의 자료 서버는 안전 때문에 쓸 수 없어요.',
  other: '비트를 확인하다가 문제가 생겼어요.',
  launch: '도우미 프로그램을 켜지 못했어요. 백신이나 윈도우 보안(스마트 앱 컨트롤 등)이 막았을 수 있어요.',
  launchDetail: '윈도우가 알린 내용: ',
  noNumber: '도우미가 오류 번호 없이 끝났어요(끝 번호 ',
  noNumberTail: '). 백신이 도우미를 멈췄을 수 있어요.',
  step: '멈춘 단계: ',
  number: '오류 번호: ',
  photo: '이 창을 사진으로 찍어 보내 주세요.',
  cancelHint: '직접 취소하지 않았는데 이 글이 나왔다면 이 창을 사진으로 찍어 보내 주세요.',
}
const STEP_NAMES = { FIND: '비트 찾기', LOAD: '비트 파일 불러오기', SERVER: '자료 서버 주소 확인', CONNECT: '자료 서버 연결', LOGIN: '비트 로그인·병원 확인' }
const READ_ONLY = `${ERP_HELPER}/ErpReadOnlyConnection.cs`
const PRELOAD = `${ERP_HELPER}/ErpVendorPreload.cs`
const STAGE = `${ERP_HELPER}/ErpStage.cs`
// ErpBitConnector.Open 몸통(AC-3804.3·AC-3806.1), csBody 모양
const CONNECTOR_OPEN =
  'public IBitSession Open(string installPath) { var info = ErpReadOnlyConnection.Create(installPath); ErpStage.Set(ErpStage.Connect); var session = ErpBitDb.Open(info); ErpStage.Set(ErpStage.Login); return session; }'
// 기존 도우미 이름·폴더·크롬 등록(ERP 도우미는 읽지도 쓰지도 않는다)
const OLD_NAMES = ['PrecheckHelper', 'com.seoseungkwan.precheck', 'Precheck.Helper']

// 운영(1a721ef) 글자의 sha256(줄 끝 \r\n → \n). `git show 1a721ef:<파일> | sed 's/\r$//' | sha256sum`
const LIVE_SHA256: Record<string, string> = {
  '.github/workflows/helper.yml': 'fe2d7d12a8ef4f202608b7677cf65532c133628c98f3f77a35e317e4aeed4f76',
  'helper/install/host-manifest.json': 'fdafdbdf50caeccd9e23b3f6e33c1f4d9f2c858574a234e6eac285ef546d08ce',
  'helper/install/install.ps1': 'd20fa84854e79c5a59a586e280a3924a61f74690a9ecd7537299cdea3e02ea07',
  'helper/install/uninstall.ps1': '9a02d29aaf81c9d7f7364909093c22173e72452511a8bf18e9d7d0b3a9587f5e',
  'helper/install/install.cmd': '6f6615caed5c697f66b0b3d633c16eb0bb1efabc8e58aad142befa745a455eb2',
}

function readBytes(rel: string): Buffer {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file)
}

function read(rel: string): string {
  return readBytes(rel).toString('utf8').replace(/^﻿/, '')
}

/** install.cmd 줄들(줄 끝 LF·CRLF 상관없이, 끝 빈 줄 뺌) */
function cmdLines(): string[] {
  return read(INSTALL_CMD).replace(/(\r?\n)+$/, '').split(/\r?\n/)
}

/** 명령 창이 낸 글(영어 판·한국어 판 윈도우 둘 다 보려고 UTF-8과 EUC-KR로 함께 푼다) */
function consoleText(bytes: Buffer | null | undefined): string {
  if (!bytes || bytes.length === 0) return ''
  return `${bytes.toString('utf8')}\n${new TextDecoder('euc-kr').decode(bytes)}`
}

/**
 * install.cmd를 한글·괄호·띄어쓰기·&가 든 임시 폴더에 복사해, 탐색기에서 두 번 누를 때와 같은 따옴표(cmd /d /s /c ""경로"")로
 * PATH = C:\nowhere, 입력 없음으로 돌린다. ps1이 null이면 install.ps1을 두지 않는다(가짜만, 실제 install.ps1은 돌리지 않는다).
 */
function runInstallCmd(
  ps1: string | null,
  options: { folderName?: string; delayedExpansion?: boolean } = {},
): { code: number | null; text: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'erp-cmd-'))
  try {
    const folder = path.join(dir, options.folderName ?? '한글 폴더 (1)&b')
    mkdirSync(folder)
    const target = path.join(folder, 'install.cmd')
    copyFileSync(path.join(ROOT, INSTALL_CMD), target)
    if (ps1 !== null) writeFileSync(path.join(folder, 'install.ps1'), `\uFEFF${ps1}\r\n`, 'utf8')
    const env: NodeJS.ProcessEnv = { ...process.env }
    for (const key of Object.keys(env)) if (key.toLowerCase() === 'path') delete env[key]
    env.Path = 'C:\\nowhere'
    const run = spawnSync(process.env.ComSpec ?? 'C:\\Windows\\System32\\cmd.exe', [...(options.delayedExpansion ? ['/v:on'] : []), '/d', '/s', '/c', `""${target}""`], {
      windowsVerbatimArguments: true,
      windowsHide: true,
      input: '',
      env,
      timeout: 60_000,
    })
    return { code: run.status, text: consoleText(run.stdout) + consoleText(run.stderr) }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const PAUSED = /Press any key|계속하려면/

function readJson(rel: string): Record<string, unknown> {
  return JSON.parse(read(rel)) as Record<string, unknown>
}

function sha256(rel: string): string {
  return createHash('sha256').update(readBytes(rel).toString('utf8').replace(/\r\n/g, '\n')).digest('hex')
}

/** C# 글에서 // 주석과 /// 문서 주석을 지운다(코드 줄만 본다) */
function code(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

/** C# 몸통 견주기: 주석·using·namespace 줄을 빼고 빈칸을 하나로 */
function csBody(text: string): string {
  return code(text)
    .split('\n')
    .filter((line) => !/^\s*(using\s+[\w.]+;|namespace\s+[\w.]+;)\s*$/.test(line))
    .join('\n')
    .replace(/\s+/g, ' ')
    .trim()
}

/** PowerShell 주석(<# … #>, # 로 시작하는 줄)을 뺀 코드 */
function psCode(text: string): string {
  return text
    .replace(/<#[\s\S]*?#>/g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

/** 글 안 차례: 앞의 것이 먼저 나와야 한다(모두 있어야 한다) */
function expectOrder(text: string, parts: string[], label: string) {
  let at = -1
  for (const part of parts) {
    const index = text.indexOf(part, at + 1)
    expect(index, `${label}: ${part}가 앞의 것 뒤에 없다`).toBeGreaterThan(at)
    at = index
  }
}

/** signature 뒤 첫 { … } 몸통(짝 맞춤) */
function methodBody(text: string, signature: RegExp): string {
  const start = text.search(signature)
  expect(start, `${signature} 메서드가 없다`).toBeGreaterThanOrEqual(0)
  const open = text.indexOf('{', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}') depth--
    if (depth === 0) return text.slice(open, i + 1)
  }
  throw new Error(`${signature} 몸통이 닫히지 않는다`)
}

function filesUnder(rel: string): string[] {
  const dir = path.join(ROOT, rel)
  if (!existsSync(dir)) return []
  return readdirSync(dir, { recursive: true, encoding: 'utf8' })
    .map((f) => f.split(path.sep).join('/'))
    .filter((f) => !f.split('/').some((part) => part === 'bin' || part === 'obj'))
    .filter((f) => statSync(path.join(dir, f)).isFile())
    .map((f) => `${rel}/${f}`)
}

// ── YAML(이 workflow가 쓰는 모양만: helper/tests/build.test.ts와 같은 해석기) ─────────────────────

interface YNode {
  /** null이면 목록 항목 */
  key: string | null
  value: string
  children: YNode[]
}

const KEY_LINE = /^([A-Za-z0-9_.-]+):(?:\s+(.*))?$/

function indentOf(line: string): number {
  return line.length - line.trimStart().length
}

function unquote(text: string): string {
  const t = text.trim()
  if (t.length >= 2 && ((t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"')))) {
    return t.slice(1, -1)
  }
  return t
}

function parseYaml(text: string): YNode {
  const root: YNode = { key: '', value: '', children: [] }
  const stack: { node: YNode; indent: number }[] = [{ node: root, indent: -1 }]
  const src = text.split(/\r?\n/)
  for (let i = 0; i < src.length; i++) {
    const raw = src[i]
    if (/^\s*(#.*)?$/.test(raw)) continue
    if (raw.includes('\t')) throw new Error(`${WORKFLOW} ${i + 1}째 줄: 탭은 쓰지 않는다`)
    let indent = indentOf(raw)
    let body = raw.trim()
    while (stack[stack.length - 1].indent >= indent) stack.pop()
    let parent = stack[stack.length - 1].node
    if (body === '-' || body.startsWith('- ')) {
      const item: YNode = { key: null, value: '', children: [] }
      parent.children.push(item)
      stack.push({ node: item, indent })
      const rest = body.slice(1).trimStart()
      if (!KEY_LINE.test(rest)) {
        item.value = unquote(rest)
        continue
      }
      indent += body.length - rest.length
      body = rest
      parent = item
    }
    const m = KEY_LINE.exec(body)
    if (!m) throw new Error(`${WORKFLOW} ${i + 1}째 줄을 읽지 못했다: ${raw}`)
    const node: YNode = { key: m[1], value: unquote(m[2] ?? ''), children: [] }
    parent.children.push(node)
    if (/^[|>][-+]?$/.test(node.value)) {
      const block: string[] = []
      while (i + 1 < src.length && (src[i + 1].trim() === '' || indentOf(src[i + 1]) > indent)) {
        block.push(src[++i].trim())
      }
      node.value = block.join('\n').trim()
      continue
    }
    stack.push({ node, indent })
  }
  return root
}

function find(node: YNode, key: string): YNode | undefined {
  return node.children.find((c) => c.key === key)
}

function get(node: YNode, ...keys: string[]): YNode {
  let at = node
  for (const key of keys) {
    const next = find(at, key)
    if (!next) throw new Error(`workflow에 ${keys.join('.')}가 없다`)
    at = next
  }
  return at
}

function keysOf(node: YNode): string[] {
  return node.children.map((c) => c.key ?? '-')
}

function list(node: YNode): string[] {
  if (node.value.startsWith('[')) {
    return node.value
      .slice(1, -1)
      .split(',')
      .map(unquote)
      .filter((v) => v !== '')
  }
  if (node.value !== '') return [node.value]
  return node.children.map((c) => {
    if (c.key !== null) throw new Error(`목록이어야 하는데 ${c.key}:가 있다`)
    return c.value
  })
}

function collect(node: YNode, key: string): string[] {
  const out: string[] = []
  for (const c of node.children) {
    if (c.key === key) out.push(c.value)
    out.push(...collect(c, key))
  }
  return out
}

function stepText(step: YNode): string {
  return [find(step, 'uses')?.value ?? '', find(step, 'run')?.value ?? ''].join('\n')
}

function workflow(): { text: string; root: YNode } {
  const text = read(WORKFLOW)
  return { text, root: parseYaml(text) }
}

function buildSteps(root: YNode): YNode[] {
  return get(root, 'jobs', 'helper-erp', 'steps').children
}

function packStep(root: YNode): YNode {
  const step = buildSteps(root).find((s) => /Compress-Archive/.test(stepText(s)))
  if (!step) throw new Error('helper-erp 일에 zip을 만드는 단계(Compress-Archive)가 없다')
  return step
}

// ── 시험 ──────────────────────────────────────────────────────────────────────

describe('AC-3611.3 Program: --register 하나일 때만 등록, 아니면 ERP 표·ClosingCommands·MessageLoop만', () => {
  const program = () => code(read(PROGRAM))

  it('AC-3611.3: namespace Erp.Helper이고 Main은 인자가 정확히 [--register] 하나일 때만 등록 모드로 간다(크롬은 첫 인자로 origin을 넘긴다)', () => {
    const text = program()
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    expect(text).toMatch(/const string RegisterArgument = "--register";/)
    expect(text).toMatch(
      /static bool IsRegister\(string\[\] args\)\s*=>\s*args != null && args\.Length == 1 && string\.Equals\(args\[0\], RegisterArgument, StringComparison\.Ordinal\);/,
    )
    // --register 글자는 상수 하나에만 있다(다른 곳에서 인자를 따로 보지 않는다)
    expect(text.match(/"--register"/g)).toHaveLength(1)
    const main = methodBody(text, /static int Main\(string\[\] args\)/)
    expect(main).toMatch(/if \(IsRegister\(args\)\) return Register\(log\);/)
    // 등록 모드는 명령 표·메시지 고리보다 먼저 갈라진다
    expectOrder(main, ['if (IsRegister(args)) return Register(log);', 'ErpCommandTable.Load()', 'MessageLoop.Run('], 'Main')
  })

  it('AC-3611.3: 등록 모드는 기존 RegisterFlow.Run(ErpServices.Create())이고 종료 번호는 저장 0 · 취소 1 · 예외 2', () => {
    const text = program()
    expect(text).toMatch(/const int RegisterSaved = 0;/)
    expect(text).toMatch(/const int RegisterCancelled = 1;/)
    expect(text).toMatch(/const int RegisterFailed = 2;/)
    const register = methodBody(text, /static int Register\(ErpLog log\)/)
    expect(register.match(/RegisterFlow\.Run\(/g)).toHaveLength(1)
    expect(register).toMatch(/var saved = RegisterFlow\.Run\(ErpServices\.Create\(\)\);/)
    expect(register).toMatch(/return saved \? RegisterSaved : RegisterCancelled;/)
    // 오류 번호가 있는 예외(HelperException)도, 그 밖 예외도 2
    expectOrder(register, ['catch (HelperException e)', 'return RegisterFailed;', 'catch (Exception)', 'return RegisterFailed;'], 'Register')
    expect(register.match(/return RegisterFailed;/g)).toHaveLength(2)
    // 등록 모드에서는 메시지 고리·명령 표·표준 입력을 쓰지 않는다
    expect(register).not.toMatch(/MessageLoop|ErpCommandTable|Dispatcher|OpenStandardInput/)
  })

  it('AC-3611.3: 등록 모드 기록은 register와 오류 번호만(성공·취소는 번호 없음, HelperException은 그 번호, 그 밖은 E-BRIDGE-DISCONNECTED)', () => {
    const register = methodBody(program(), /static int Register\(ErpLog log\)/)
    const writes = [...register.matchAll(/log\.(\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`)
    expect(writes).toEqual(['WriteRegister(null)', 'WriteRegister(e.Code)', 'WriteRegister(ErrorCodes.Disconnected)'])
  })

  it('AC-3611.3: 등록 모드가 아니면 기존 Program과 같은 차례: 표준 출력·오류 버림 → ErpCommandTable.Load → Dispatcher → ClosingCommands → 표준 입력 펌프 → MessageLoop.Run', () => {
    const main = methodBody(program(), /static int Main\(string\[\] args\)/)
    expectOrder(
      main,
      [
        'Console.SetOut(TextWriter.Null);',
        'Console.SetError(TextWriter.Null);',
        'var table = ErpCommandTable.Load();',
        'var dispatcher = new Dispatcher(table, log.Write);',
        'ClosingCommands.Register(dispatcher, ErpServices.Create());',
        'new StdinPump(stdin, signal)',
        'return MessageLoop.Run(args, input, output, table, dispatcher, log.Write);',
      ],
      'Main',
    )
    // 처리기를 붙이는 곳은 ClosingCommands 하나뿐
    expect(main.match(/\.Register\(dispatcher/g)).toHaveLength(1)
    expect(main).toMatch(/catch \(Exception\)\s*\{\s*log\.Write\(null, ErrorCodes\.Disconnected\);\s*return MessageLoop\.ExitCrashed;\s*\}/)
  })

  it('AC-3611.3: hello·기존 명령·기존 명령 표는 붙이지 않는다', () => {
    const text = program()
    for (const banned of [
      /\bHello\b/,
      /\bBitCommands\b/,
      /\bStatsCommands\b/,
      /\bRevenueCommands\b/,
      /\bContactCommands\b/,
      /\bClaimCommands\b/,
      /\bInputCommands\b/,
      /\bHelperStore\b/,
      /\bHelperServices\b/,
      /CommandTable\.LoadEmbedded/,
    ]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })
})

describe('AC-3611.2 저장 자리: %LOCALAPPDATA%\\Seoseungkwan\\ErpHelper\\ 의 app·data·logs', () => {
  it('AC-3611.2: ErpServices.DataDirectory()는 Seoseungkwan\\ErpHelper\\data다', () => {
    expect(code(read(SERVICES))).toMatch(
      /static string DataDirectory\(\)\s*=>\s*Path\.Combine\(Environment\.GetFolderPath\(Environment\.SpecialFolder\.LocalApplicationData\), "Seoseungkwan", "ErpHelper", "data"\);/,
    )
  })

  it('AC-3611.2: ErpLog는 Seoseungkwan\\ErpHelper\\logs에 쓴다', () => {
    expect(code(read(LOG))).toMatch(/Path\.Combine\(local, "Seoseungkwan", "ErpHelper", "logs"\)/)
  })

  it('AC-3611.2: install.ps1은 프로그램을 Seoseungkwan\\ErpHelper\\app에 둔다', () => {
    expect(psCode(read(INSTALL_PS1))).toContain("$installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\\ErpHelper\\app'")
  })

  it('AC-3611.2: Erp.Helper 코드·프로젝트에 기존 도우미 폴더·이름(PrecheckHelper·Precheck.Helper)이 없다', () => {
    const files = filesUnder(ERP_HELPER)
    // spec erp-bit-anywhere AC-3804.3·AC-3805.1·AC-3806.1로 ERP 접속 부품·DLL 미리 불러오기·등록 단계 파일이 더해짐
    // spec erp-uisarang design.md 4-3(TASK-15)으로 의사랑 부품 UisHelperServices.cs가 더해짐
    expect(files.sort()).toEqual([CSPROJ, BIT_DB, LOCATOR, LOG, SERVICES, PROGRAM, READ_ONLY, PRELOAD, STAGE, `${ERP_HELPER}/UisHelperServices.cs`].sort())
    for (const file of files) {
      const text = read(file)
      for (const old of OLD_NAMES) expect(text, `${file}: ${old}`).not.toContain(old)
    }
    // Seoseungkwan 아래 폴더 이름은 ErpHelper뿐
    for (const file of files.filter((f) => f.endsWith('.cs'))) {
      for (const m of code(read(file)).matchAll(/"Seoseungkwan",\s*"([^"]+)"/g)) expect(m[1], file).toBe('ErpHelper')
    }
  })
})

describe('AC-3611.3 ErpServices: 기존 BitServices에 ERP 부품', () => {
  it('AC-3611.3: 등록 파일(data)·등록한 설치 위치·ErpBitConnector·VendorLogin·ConfirmWindow 한 벌이고 기존 SqlBitConnector·통계 화면은 쓰지 않는다', () => {
    const text = code(read(SERVICES))
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    expectOrder(
      text,
      [
        'var store = new RegistrationStore(DataDirectory(), new DpapiProtector());',
        // spec erp-bit-anywhere AC-3801.3: 설치 찾기는 ERP 부품 ErpInstallationLocator(같은 인자)
        'var locator = new ErpInstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));',
        'return new BitServices(locator, new ErpBitConnector(), new VendorLogin(), new ConfirmWindow(), store);',
      ],
      'ErpServices.Create',
    )
    expect(text).not.toMatch(/\bSqlBitConnector\b|\bVendorGridExport\b|screens:/)
    // 등록을 읽지 못하면 없는 것으로 본다(기존 HelperServices와 같다)
    expect(text).toMatch(/return store\.Load\(\)\?\.InstallPath;/)
    expect(text).toMatch(/catch \(HelperException\)\s*\{\s*return null;\s*\}/)
  })
})

describe('AC-3801.3 ErpInstallationLocator: 기존 InstallationLocator 후보를 ErpInstallRules.Choose로 고른다', () => {
  const locator = () => code(read(LOCATOR))

  it('AC-3801.3: ErpServices.Create의 설치 찾기는 new ErpInstallationLocator(도우미 exe 폴더, 등록한 설치 위치)이고 나머지 부품은 그대로다', () => {
    const create = methodBody(code(read(SERVICES)), /public static BitServices Create\(\)/)
    expect(create).toContain('var locator = new ErpInstallationLocator(AppDomain.CurrentDomain.BaseDirectory, () => RegisteredInstall(store));')
    expect(create).not.toMatch(/new InstallationLocator\(/)
    expect(create).toContain('var store = new RegistrationStore(DataDirectory(), new DpapiProtector());')
    expect(create).toContain('return new BitServices(locator, new ErpBitConnector(), new VendorLogin(), new ConfirmWindow(), store);')
    expect(create.match(/\bnew \w+\(/g)).toEqual([
      'new RegistrationStore(',
      'new DpapiProtector(',
      'new ErpInstallationLocator(',
      'new BitServices(',
      'new ErpBitConnector(',
      'new VendorLogin(',
      'new ConfirmWindow(',
    ])
    expect(read(SERVICES)).toContain('spec erp-bit-anywhere AC-3801.3')
  })

  it('AC-3801.3: ErpInstallationLocator는 namespace Erp.Helper의 IBitLocator이고 파일 모양은 LocalFileProbe, 후보는 기존 InstallationLocator(같은 인자·같은 파일 모양)다', () => {
    const text = locator()
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    expect(text).toMatch(/\bpublic sealed class ErpInstallationLocator : IBitLocator\b/)
    expect(text).toMatch(/private readonly IFileProbe probe = new LocalFileProbe\(\);/)
    expect(text).toMatch(/private readonly InstallationLocator candidates;/)
    expect(text).toMatch(
      /public ErpInstallationLocator\(string appDirectory, Func<string\?> rememberedRoot\)\s*=>\s*candidates = new InstallationLocator\(appDirectory, rememberedRoot, probe\);/,
    )
    expect(text.match(/\bnew \w+\(/g)).toEqual(['new LocalFileProbe(', 'new InstallationLocator('])
  })

  it('AC-3801.3: Find는 ErpInstallRules.Choose(candidates.FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive())이고 후보 부품은 FindCandidates만 쓴다(첫 줄 단계 FIND는 AC-3806.1)', () => {
    const text = locator()
    expect(csBody(methodBody(text, /public string Find\(\)/))).toBe(
      '{ ErpStage.Set(ErpStage.Find); return ErpInstallRules.Choose(candidates.FindCandidates(), probe, NativeEnvironmentGuard.SystemDrive()); }',
    )
    expect([...text.matchAll(/\bcandidates\.(\w+)/g)].map((m) => m[1])).toEqual(['FindCandidates'])
    expect(text.match(/\bFind\(\)/g)).toHaveLength(1)
  })

  it('AC-3801.3: helper-erp/src 안에 기존 InstallationLocator(...).Find·BitInstallRules.Choose를 부르는 곳이 없고, InstallationLocator를 만드는 곳은 ErpInstallationLocator 하나다', () => {
    const sources = filesUnder('helper-erp/src').filter((f) => f.endsWith('.cs'))
    expect(sources).toContain(LOCATOR)
    expect(sources).toContain('helper-erp/src/Erp.Core/ErpInstallRules.cs')
    for (const file of sources) {
      const text = code(read(file))
      expect(text, file).not.toMatch(/\bBitInstallRules\.Choose\b/)
      expect(text, file).not.toMatch(/\bBitInstallRules\.MatchesEnvironment\b/)
      expect(text, file).not.toMatch(/\bnew InstallationLocator\([^;]*\)\s*\.\s*Find\(/)
      expect(text, file).not.toMatch(/\bIBitLocator\b[^;{]*=\s*new InstallationLocator\(/)
      if (file !== LOCATOR) expect(text, file).not.toMatch(/\bnew InstallationLocator\(/)
    }
  })
})

describe('AC-3803.1 ErpInstallRules.FindRoot 몸통은 기존 BitInstallRules.FindRoot와 같다(파일 목록만 ERP 것)', () => {
  const findRoot = (file: string) => csBody(methodBody(code(read(file)), /public static string\? FindRoot\(string\? candidate, IFileProbe probe\)/))

  it('AC-3803.1: 두 몸통이 글자로 같고(RequiredFiles·AncestorLimit은 각 형의 것), ERP 상수는 기존 AncestorLimit을 그대로 쓴다', () => {
    const erp = findRoot('helper-erp/src/Erp.Core/ErpInstallRules.cs')
    expect(erp).toBe(findRoot('helper/src/Precheck.Core/Bit/BitInstallRules.cs'))
    const text = code(read('helper-erp/src/Erp.Core/ErpInstallRules.cs'))
    expect(text).toMatch(/private const int AncestorLimit = BitInstallRules\.AncestorLimit;/)
    expect(text).toMatch(/public static readonly IReadOnlyList<string> RequiredFiles = new\[\]\s*\{\s*@"EXE\\BITDataBaseCommon\.dll", @"EXE\\BITUserLogIn\.dll",?\s*\};/)
  })

  it('AC-3803.2: helper-erp/src 안에 기존 BitInstallRules.FindRoot를 부르는 곳이 없다', () => {
    for (const file of filesUnder('helper-erp/src').filter((f) => f.endsWith('.cs'))) {
      expect(code(read(file)), file).not.toMatch(/\bBitInstallRules\.FindRoot\(/)
    }
  })
})

describe('AC-3801.4 청구 도우미 쪽은 갈래 시작(6754571c) 그대로', () => {
  const BASE = '6754571c'

  function gitDiffQuiet(paths: string[]): { status: number | null; output: string } {
    const result = spawnSync('git', ['diff', '--quiet', BASE, '--', ...paths], { cwd: ROOT, encoding: 'utf8' })
    return { status: result.status, output: `${result.stdout ?? ''}${result.stderr ?? ''}${result.error?.message ?? ''}` }
  }

  it('AC-3801.4: git diff --quiet 6754571c -- helper src extension 가 0으로 끝난다(Precheck.Core·Precheck.Windows·웹·기존 확장 한 글자도 안 바뀜)', () => {
    const run = gitDiffQuiet(['helper', 'src', 'extension'])
    expect(run.status, run.output).toBe(0)
  })

  // spec erp-uisarang design.md 12-4(TASK-15): 명령 표는 3-1에서 더한 것만 다르고(JSON으로 견줌), 확장은 AC-4215.1 목록(비트 파일)만 그대로다
  const UIS_SALES = {
    type: 'array',
    optional: true,
    min: 0,
    max: 10,
    items: {
      type: 'object',
      fields: {
        key: { type: 'enum', values: ['carm', 'sono', 'arthro', 'manual', 'eswt', 'pt', 'etc1', 'etc2', 'etc3', 'etc4'] },
        codes: { type: 'array', min: 1, max: 20, items: { type: 'string', min: 1, max: 20, pattern: '^\\S(?: ?\\S)*$' } },
      },
    },
  }
  const BIT_EXTENSION = ['cells.ts', 'fill.ts', 'settings.ts', 'range.ts', 'rangeView.ts', 'rangeTypes.ts', 'erpday.ts', '__tests__'].map((f) => `extension-erp/src/${f}`)

  it('AC-3801.4: ERP 명령 표(helper-erp/commands.json)는 6754571c와 견주어 spec erp-uisarang design.md 3-1에서 더한 것(closing.source·closing.uisCodes·closing.day sales)만 다르고, 확장(extension-erp/)은 비트 파일(AC-4215.1 목록)만 6754571c 그대로다', () => {
    const show = spawnSync('git', ['show', `${BASE}:${COMMANDS}`], { cwd: ROOT, encoding: 'utf8' })
    expect(show.status, `${show.stderr ?? ''}${show.error?.message ?? ''}`).toBe(0)
    const base = JSON.parse(show.stdout.replace(/^﻿/, '')) as Record<string, unknown>
    const now = readJson(COMMANDS)
    const commands = { ...(now.commands as Record<string, Record<string, unknown>>) }
    expect(commands['closing.source']).toEqual({ patient: false, args: {} })
    expect(commands['closing.uisCodes']).toEqual({ patient: false, args: {} })
    delete commands['closing.source']
    delete commands['closing.uisCodes']
    const day = structuredClone(commands['closing.day']) as { args: Record<string, unknown> }
    expect(day.args.sales).toEqual(UIS_SALES)
    delete day.args.sales
    expect({ ...now, commands: { ...commands, 'closing.day': day } }).toEqual(base)
    for (const file of BIT_EXTENSION) expect(existsSync(path.join(ROOT, file)), file).toBe(true)
    const run = gitDiffQuiet(BIT_EXTENSION)
    expect(run.status, run.output).toBe(0)
  })

  // spec erp-uisarang design.md 12-4(TASK-16) AC-4216.1: 의사랑판으로 0.3.0에서 0.4.0으로
  it('AC-3801.4 AC-4216.1: ERP 도우미 판은 0.4.0이다(helper-erp/Directory.Build.props)', () => {
    expect(/<Version>([^<]*)<\/Version>/.exec(read('helper-erp/Directory.Build.props'))?.[1]).toBe('0.4.0')
  })

  it('AC-3801.4: 기존 BitInstallRules.SupportedRoot는 그대로 C:\\DrBIT50이고 기존 MatchesEnvironment는 그 위치만 받는다(글자)', () => {
    const rules = code(read('helper/src/Precheck.Core/Bit/BitInstallRules.cs'))
    expect(rules).toContain('public const string SupportedRoot = @"C:\\DrBIT50";')
    expect(rules).toContain('return WinPath.Same(selected, SupportedRoot);')
  })
})

describe('AC-3611.4 ErpBitDb: 기존 SqlBitDb와 같은 규칙, 관문만 ErpReadGuard', () => {
  const erp = () => code(read(BIT_DB))
  const live = () => code(read('helper/src/Precheck.Windows/SqlBitDb.cs'))
  const SECONDS = /\s*private static int Seconds\(TimeSpan timeout\)\s*=>\s*([^;]+);/

  it('AC-3611.4: ErpBitConnector는 ERP 접속 부품 ErpReadOnlyConnection.Create(병원 안 서버 검사·접속 10초)로 연다(spec erp-bit-anywhere AC-3804.3로 바뀜)', () => {
    expect(erp()).toMatch(/^namespace Erp\.Helper;$/m)
    const connector = methodBody(erp(), /class ErpBitConnector : IBitConnector/)
    expect(csBody(connector)).toBe(`{ ${CONNECTOR_OPEN} }`)
    expect(erp()).toMatch(/class ErpBitDb : IBitSession/)
  })

  it('AC-3611.4: 문장마다 ErpReadGuard.Require를 SqlCommand보다 먼저 지나고, 매개변수는 ErpReadGuard.ParametersOf의 종류·길이로만 붙인다', () => {
    const text = erp()
    const query = methodBody(text, /public IReadOnlyList<IReadOnlyList<object\?>> Query\(/)
    expectOrder(query, ['ErpReadGuard.Require(sql, args);', 'new SqlCommand(sql, connection, transaction)', 'ErpReadGuard.ParametersOf(sql)', 'ExecuteReader()'], 'Query')
    expect(query).toMatch(/SqlDbType\.Int/)
    expect(query).toMatch(/parameter\.Kind == SqlParamKind\.VarChar \? SqlDbType\.VarChar : SqlDbType\.Char/)
    expect(query).toMatch(/command\.Parameters\.Add\(parameter\.Name, type, parameter\.Size\)/)
    const snapshot = methodBody(text, /private static bool SnapshotAvailable\(SqlConnection connection\)/)
    expectOrder(snapshot, ['ErpReadGuard.Require(Sql.SnapshotStateSql, NoArgs);', 'new SqlCommand(Sql.SnapshotStateSql, connection)'], 'SnapshotAvailable')
    // SqlCommand를 만드는 곳은 둘뿐이고 둘 다 관문 뒤
    expect(text.match(/new SqlCommand\(/g)).toHaveLength(2)
    expect(text.match(/ErpReadGuard\.Require\(/g)).toHaveLength(2)
    // 기존 관문은 부르지 않는다(마감일지 문장을 모른다)
    expect(text).not.toMatch(/\bReadOnlyGuard\b/)
    expect(text).not.toMatch(/\bSql\.(ParametersOf|IsAllowed)\b/)
  })

  it('AC-3611.4: 스냅숏을 쓸 수 있으면 스냅숏 트랜잭션, 닫으면 Rollback하고 Commit·쓰기 명령은 없다', () => {
    const text = erp()
    expect(text).toMatch(/connection\.BeginTransaction\(snapshot \? IsolationLevel\.Snapshot : IsolationLevel\.ReadCommitted\)/)
    expect(methodBody(text, /public void Dispose\(\)/)).toMatch(/transaction\.Rollback\(\);/)
    expect(text).not.toMatch(/\.Commit\s*\(/)
    expect(text).not.toMatch(/ExecuteNonQuery|SqlBulkCopy|BeginExecuteNonQuery/)
  })

  it('AC-3611.4: 몸통은 기존 SqlBitDb 그대로다(이름·관문·매개변수 표만 ERP 것, 시간 제한 초 계산은 ReadOnlyConnection.Seconds와 같은 식)', () => {
    const liveSeconds = /internal static int Seconds\(TimeSpan timeout\)\s*=>\s*([^;]+);/.exec(code(read('helper/src/Precheck.Windows/ReadOnlyConnection.cs')))?.[1]
    expect(liveSeconds, 'ReadOnlyConnection.Seconds 식을 찾지 못했다').toBeDefined()
    const erpSeconds = SECONDS.exec(erp())?.[1]
    expect(erpSeconds, 'ErpBitDb에 private static int Seconds(TimeSpan timeout) => … 가 없다').toBeDefined()
    expect(erpSeconds?.replace(/\s+/g, ' ').trim()).toBe(liveSeconds?.replace(/\s+/g, ' ').trim())

    const expected = csBody(live())
      .replace(/\bSqlBitConnector\b/g, 'ErpBitConnector')
      .replace(/\bSqlBitDb\b/g, 'ErpBitDb')
      .replace(/\bReadOnlyGuard\.Require\(/g, 'ErpReadGuard.Require(')
      .replace(/\bSql\.ParametersOf\(/g, 'ErpReadGuard.ParametersOf(')
      .replace(/\bReadOnlyConnection\.Seconds\(/g, 'Seconds(')
      // spec erp-bit-anywhere AC-3804.3·AC-3806.1: 여는 부품만 ERP 것(ErpReadOnlyConnection·단계)
      .replace('public IBitSession Open(string installPath) => ErpBitDb.Open(ReadOnlyConnection.Create(installPath));', CONNECTOR_OPEN)
    const actual = csBody(erp().replace(SECONDS, ''))
    expect(actual).toBe(expected)
  })
})

describe('AC-3606.3 ERP 도우미 진단 기록: 시각·명령 이름·오류 번호만', () => {
  it('AC-3606.3: ErpLog.Write(cmd, code)는 ErpLogLine.Format 한 줄을 쓰고 기존 LogLine은 쓰지 않는다', () => {
    const text = code(read(LOG))
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    expect(text).toMatch(/public void Write\(string\? cmd, string\? code\)/)
    expect(text).toMatch(/ErpLogLine\.Format\(now, cmd, code\)/)
    expect(text).not.toMatch(/(?<!Erp)LogLine\.Format/)
    // 요청·예외 글을 받는 자리가 없다: 공개 메서드는 Write·WriteRegister 둘뿐이고 받는 것은 이름·번호뿐
    const publics = [...text.matchAll(/public (?:void|string|static) (\w+)\(([^)]*)\)/g)].map((m) => `${m[1]}(${m[2]})`)
    expect(publics.sort()).toEqual(['Write(string? cmd, string? code)', 'WriteRegister(string? code)'])
  })

  it('AC-3606.3: 등록 모드 줄은 ErpLogLine.Format의 이름 칸만 고정 글자 register로 바꾼다(시각·오류 번호 칸은 그대로)', () => {
    const text = code(read(LOG))
    expect(text).toMatch(/public const string RegisterName = "register";/)
    const register = methodBody(text, /public void WriteRegister\(string\? code\)/)
    expectOrder(register, ['ErpLogLine.Format(now, null, code).Split(\' \')', 'parts[1] = RegisterName;', 'string.Join(" ", parts)'], 'WriteRegister')
  })

  it('AC-3606.3: 기록이 안 되면 조용히 넘어가고 표준 출력·오류에는 쓰지 않는다', () => {
    const text = code(read(LOG))
    expect(text).toMatch(/File\.AppendAllText\(/)
    expect(text).toMatch(/catch \(Exception\)/)
    expect(text).not.toMatch(/\bConsole\./)
  })

  it('AC-3606.3: 명령 기록은 Dispatcher·MessageLoop가 ErpLog.Write로만 남긴다(Program에 다른 기록 길 없음)', () => {
    const program = code(read(PROGRAM))
    expect(program).toMatch(/var log = new ErpLog\(\);/)
    for (const m of program.matchAll(/log\.(\w+)/g)) expect(['Write', 'WriteRegister']).toContain(m[1])
    expect(program).not.toMatch(/File\.|StreamWriter|Trace\.|Debug\./)
  })
})

describe('AC-3601.2 ERP 도우미 등록 틀 host-manifest.json', () => {
  it('AC-3601.2: name은 com.seoseungkwan.erp_helper(ERP 명령 표 hostName)이고 allowed_origins는 새 확장 하나뿐이다', () => {
    const manifest = readJson(MANIFEST)
    const table = readJson(COMMANDS)
    expect(table.hostName).toBe(HOST_NAME)
    expect(table.extensionId).toBe(EXTENSION_ID)
    expect(manifest).toEqual({
      name: HOST_NAME,
      description: 'ERP 마감일지 도우미',
      path: '__HELPER_EXE__',
      type: 'stdio',
      allowed_origins: [`chrome-extension://${EXTENSION_ID}/`],
    })
    expect(read(MANIFEST)).not.toContain('*')
  })

  it('AC-3601.2: 기존 helper/install/host-manifest.json은 운영(1a721ef) 그대로 기존 확장 하나뿐이다', () => {
    expect(sha256('helper/install/host-manifest.json')).toBe(LIVE_SHA256['helper/install/host-manifest.json'])
    const live = readJson('helper/install/host-manifest.json')
    expect(live.allowed_origins).toHaveLength(1)
    expect(live.allowed_origins).not.toContain(`chrome-extension://${EXTENSION_ID}/`)
  })
})

describe('AC-3802 install.cmd: PATH와 상관없이 PowerShell을 부르고 실패하면 창을 열어 둔다(spec erp-bit-anywhere REQ-3802)', () => {
  it('AC-3802.1: PowerShell을 PATH가 아닌 전체 경로로 부르고, 그 끝 번호를 담아 그대로 낸다', () => {
    const lines = cmdLines()
    expect(lines).toEqual(INSTALL_CMD_LINES)
    expect(lines[2]).toBe(
      '"%SystemRoot%\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"',
    )
    // PATH에서 찾는 맨 이름 powershell이 없다
    expect(read(INSTALL_CMD)).not.toMatch(/(^|[\s@&])powershell(\.exe)?\s/im)
    expect(lines.at(-1)).toBe('exit /b %ERP_SETUP_CODE%')
  })

  it('AC-3802.2: 끝 번호가 0·2면 더 기다리지 않고, 그 밖(1 포함)이면 pause로 창을 열어 둔다(글자)', () => {
    const lines = cmdLines()
    expect(lines[3]).toBe('set ERP_SETUP_CODE=%errorlevel%')
    expect(lines[4]).toBe('if not "%ERP_SETUP_CODE%"=="0" if not "%ERP_SETUP_CODE%"=="2" pause')
    expect(read(INSTALL_CMD)).not.toContain('=="1"')
    expect(read(INSTALL_CMD).match(/\bpause\b/gi)).toHaveLength(1)
  })

  it('AC-3802.3: 글자는 모두 ASCII이고 -EncodedCommand·goto·라벨이 없으며 경로는 따옴표 안에서만 쓴다', () => {
    const bytes = readBytes(INSTALL_CMD)
    expect([...bytes].every((b) => b < 0x80)).toBe(true)
    const text = read(INSTALL_CMD)
    expect(text).not.toMatch(/EncodedCommand|-enc\b/i)
    expect(text).not.toMatch(/\bgoto\b|\bcall\s+:|^\s*:/im)
    const dp0 = text.match(/%~dp0/g) ?? []
    expect(dp0).toHaveLength(1)
    expect(text.match(/"%~dp0[^"\r\n]*"/g)).toHaveLength(dp0.length)
    expect(text.match(/"%SystemRoot%[^"\r\n]*"/g)).toHaveLength(1)
    // 지연 확장을 꺼서 폴더 이름의 !가 바뀌지 않는다
    expect(cmdLines()[1]).toBe('setlocal DisableDelayedExpansion')
    // 설치 파일 목록과 uninstall.ps1은 그대로(갈래 시작 6754571c와 글자가 같다). install.ps1은 AC-3806.3으로 등록 결과 글만 바뀐다
    expect(filesUnder(INSTALL).sort()).toEqual([INSTALL_CMD, INSTALL_PS1, MANIFEST, UNINSTALL_PS1, `${INSTALL}/README.md`].sort())
    const diff = spawnSync('git', ['diff', '--quiet', '6754571c', '--', UNINSTALL_PS1], {
      cwd: ROOT,
      encoding: 'utf8',
    })
    expect(diff.status, `${diff.stdout ?? ''}${diff.stderr ?? ''}${diff.error?.message ?? ''}`).toBe(0)
    // spec erp-uisarang design.md 12-4(TASK-15·16) AC-4216.2: README.md는 '의사랑 의원' 절만 더해지고, 그 절 밖은
    // 판 번호(0.3.0·0.4.0)가 든 줄(AC-4216.1 짝 문장·zip 예시·판 번호 줄·새 판으로 바꾸기 글)만 빼면 6754571c 글자 그대로다
    const show = spawnSync('git', ['show', `6754571c:${INSTALL}/README.md`], { cwd: ROOT, encoding: 'utf8' })
    expect(show.status, `${show.stderr ?? ''}${show.error?.message ?? ''}`).toBe(0)
    const lines = read(`${INSTALL}/README.md`).replace(/\r\n/g, '\n').split('\n')
    const heads = lines.flatMap((line, i) => (line.startsWith('## 의사랑 의원') ? [i] : []))
    expect(heads).toHaveLength(1)
    const next = lines.slice(heads[0] + 1).findIndex((line) => line.startsWith('## '))
    const end = next === -1 ? lines.length : heads[0] + 1 + next
    const outside = [...lines.slice(0, heads[0]), ...lines.slice(end)]
    const noVersion = (text: string[]) => text.filter((line) => !/0\.[34]\.0/.test(line))
    expect(noVersion(outside)).toEqual(noVersion(show.stdout.replace(/\r\n/g, '\n').split('\n')))
  })

  it.runIf(process.platform === 'win32')('AC-3802.2: (윈도우) PATH가 망가져도 가짜 install.ps1 exit 2 → 끝 번호 2, 멈춤 없음', () => {
    const run = runInstallCmd('exit 2')
    expect(run.code, run.text).toBe(2)
    expect(run.text).not.toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.2: (윈도우) 가짜 install.ps1 exit 0 → 끝 번호 0, 멈춤 없음', () => {
    const run = runInstallCmd('exit 0')
    expect(run.code, run.text).toBe(0)
    expect(run.text).not.toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.3: (윈도우) 가짜 install.ps1 exit 5 → 끝 번호 5, 멈춤 글이 남는다', () => {
    const run = runInstallCmd('exit 5')
    expect(run.code, run.text).toBe(5)
    expect(run.text).toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.3: (윈도우) install.ps1이 없으면 끝 번호가 0·2가 아니고 멈춤 글이 남는다', () => {
    const run = runInstallCmd(null)
    expect([0, 2], run.text).not.toContain(run.code)
    expect(run.text).toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.2: (윈도우) 가짜 install.ps1 exit 1(취소·설치 실패) → 끝 번호 1, 멈춤 글이 남는다', () => {
    const run = runInstallCmd('exit 1')
    expect(run.code, run.text).toBe(1)
    expect(run.text).toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.2: (윈도우) 글이 틀린 install.ps1 → PowerShell 끝 번호 1, 멈춤 글이 남는다', () => {
    const run = runInstallCmd('if ( {')
    expect(run.code, run.text).toBe(1)
    expect(run.text).toMatch(PAUSED)
  }, 90_000)

  it.runIf(process.platform === 'win32')('AC-3802.3: (윈도우) 지연 확장을 켠 명령 창(/v:on)·이름에 !가 든 폴더에서도 가짜 exit 2 → 2, 멈춤 없음', () => {
    const run = runInstallCmd('exit 2', { folderName: 'x!y (1)&b', delayedExpansion: true })
    expect(run.code, run.text).toBe(2)
    expect(run.text).not.toMatch(PAUSED)
  }, 90_000)
})

describe('AC-3804.3·AC-3805·AC-3806 ERP 접속 부품·받은 파일 표시·등록 결과 알림(spec erp-bit-anywhere TASK-4)', () => {
  const readOnly = () => code(read(READ_ONLY))
  const liveConnection = () => code(read('helper/src/Precheck.Windows/ReadOnlyConnection.cs'))
  const HARDEN_LIVE = /public static ReadOnlyConnectionInfo Harden\(string sourceConnectionString, string installRoot, string machineName\)/
  const HARDEN_ERP =
    /public static ReadOnlyConnectionInfo Harden\(string sourceConnectionString, string installRoot, string machineName, Func<string, IReadOnlyList<IPAddress>> resolve, IReadOnlyList<ErpLocalNetwork> localNetworks\)/
  const sources = () => filesUnder('helper-erp/src').filter((f) => f.endsWith('.cs'))
  const install = () => psCode(read(INSTALL_PS1))

  it('AC-3804.3: ErpReadOnlyConnection.Harden 몸통은 기존 Harden과 같고 서버 검사 줄(ErpServerRules·단계 SERVER)과 예비 서버 거절만 다르다', () => {
    const expected = csBody(methodBody(liveConnection(), HARDEN_LIVE))
      .replace('options.ApplicationName = ApplicationName;', 'options.ApplicationName = ReadOnlyConnection.ApplicationName;')
      .replace(
        'PrivateServer.Require(options.DataSource, machineName);',
        'ErpStage.Set(ErpStage.Server); ErpServerRules.Require(options.DataSource, machineName, resolve, localNetworks); if (!string.IsNullOrEmpty(options.FailoverPartner)) throw new BitException(BitErrors.DbFailed);',
      )
    expect(expected).toContain('ErpServerRules.Require(')
    expect(csBody(methodBody(readOnly(), HARDEN_ERP))).toBe(expected)
    expect(readOnly()).toMatch(/^namespace Erp\.Helper;$/m)
    expect(readOnly()).toMatch(/public static class ErpReadOnlyConnection\b/)
  })

  it('AC-3804.3: Create는 단계 LOAD → 비트 DLL 미리 불러오기 → 접속 글자 읽기 → Harden(이 PC 이름·Dns.GetHostAddresses·켜진 카드 IPv6 목록)', () => {
    const create = methodBody(readOnly(), /public static ReadOnlyConnectionInfo Create\(string installRoot\)/)
    expectOrder(
      create,
      ['ErpStage.Set(ErpStage.Load);', 'ErpVendorPreload.Load(installRoot);', 'VendorConnectionString(installRoot)', 'Environment.MachineName', 'Dns.GetHostAddresses', 'LocalNetworks()'],
      'Create',
    )
    expect(create).toMatch(/return Harden\(/)
    const networks = methodBody(readOnly(), /private static IReadOnlyList<ErpLocalNetwork> LocalNetworks\(\)/)
    expectOrder(networks, ['NetworkInterface.GetAllNetworkInterfaces()', 'OperationalStatus.Up', 'UnicastAddresses', 'AddressFamily.InterNetworkV6', 'PrefixLength'], 'LocalNetworks')
  })

  it('AC-3804.3: 접속 글자 읽기는 기존 private VendorConnectionString과 같은 몸통(형 이름·상수만 ReadOnlyConnection.…)이다', () => {
    const signature = /private static string VendorConnectionString\(string installRoot\)/
    const expected = csBody(methodBody(liveConnection(), signature))
      .replace('VendorRuntime.Load(installRoot, VendorAssembly).GetType(VendorType, true)', 'VendorRuntime.Load(installRoot, ReadOnlyConnection.VendorAssembly).GetType(ReadOnlyConnection.VendorType, true)')
      .replace('return VendorConnectionString(type);', 'return ReadOnlyConnection.VendorConnectionString(type);')
    expect(expected).toContain('ReadOnlyConnection.VendorConnectionString(type)')
    expect(csBody(methodBody(readOnly(), signature))).toBe(expected)
  })

  it('AC-3804.3: helper-erp/src 안에 ReadOnlyConnection.Create·ReadOnlyConnection.Harden·PrivateServer.Require를 부르는 곳이 없다', () => {
    for (const file of sources()) {
      const text = code(read(file))
      expect(text, file).not.toMatch(/\bReadOnlyConnection\.(Create|Harden)\(/)
      expect(text, file).not.toMatch(/\bPrivateServer\.Require\(/)
    }
  })

  it('AC-3805.1: ErpVendorPreload.Load는 VendorRuntime.Prepare 뒤 ERP DLL 둘(RequiredFiles)만 UnsafeLoadFrom으로 불러 두고, 그 밖 예외는 E-BIT-DB-FAILED', () => {
    const text = code(read(PRELOAD))
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    const load = methodBody(text, /public static void Load\(string installRoot\)/)
    expectOrder(
      load,
      [
        'VendorRuntime.Prepare(installRoot);',
        'foreach (var file in ErpInstallRules.RequiredFiles)',
        'Assembly.UnsafeLoadFrom(Path.Combine(installRoot, file));',
        'catch (Exception e) when (!(e is BitException))',
        'throw new BitException(BitErrors.DbFailed);',
      ],
      'ErpVendorPreload.Load',
    )
    expect(load.match(/UnsafeLoadFrom\(/g)).toHaveLength(1)
    expect(load).not.toMatch(/\bLoadFrom\(|\bLoadFile\(|Load\(byte/)
  })

  it('AC-3805.2: UnsafeLoadFrom은 ErpVendorPreload.cs에만 있고 loadFromRemoteSources는 어디에도 없으며 실행 설정(csproj)은 그대로다', () => {
    for (const file of sources()) {
      const text = code(read(file))
      if (file === PRELOAD) continue
      expect(text, file).not.toMatch(/UnsafeLoadFrom/)
    }
    for (const file of filesUnder('helper-erp/src').filter((f) => /\.(cs|csproj|config|props)$/.test(f))) {
      expect(read(file), file).not.toMatch(/loadFromRemoteSources/i)
    }
    const diff = spawnSync('git', ['diff', '--quiet', '6754571c', '--', CSPROJ], { cwd: ROOT, encoding: 'utf8' })
    expect(diff.status, `${diff.stdout ?? ''}${diff.stderr ?? ''}${diff.error?.message ?? ''}`).toBe(0)
  })

  it('AC-3806.1: ErpStage는 ASCII 대문자 단계 다섯과 Set·Current이고, 단계는 정해 둔 다섯 자리에서만 적는다', () => {
    const text = code(read(STAGE))
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    const values = Object.fromEntries([...text.matchAll(/public const string (\w+) = "([^"]*)";/g)].map((m) => [m[1], m[2]]))
    // spec erp-uisarang design.md 4-3(TASK-15): 의사랑 등록 단계 UIS(엑셀 폴더·자료원 파일, 비트 저장 뒤 자료원 파일 지우기)가 더해짐
    expect(values).toEqual({ Find: 'FIND', Load: 'LOAD', Server: 'SERVER', Connect: 'CONNECT', Login: 'LOGIN', Uis: 'UIS' })
    expect(text).toMatch(/private static volatile string\? current;/)
    expect(text).toMatch(/public static string\? Current => current;/)
    expect(text).toMatch(/public static void Set\(string stage\) => current = stage;/)
    const sets = sources().flatMap((file) => [...code(read(file)).matchAll(/ErpStage\.Set\(ErpStage\.(\w+)\)/g)].map((m) => `${path.basename(file)}:${m[1]}`))
    expect(sets.sort()).toEqual(
      [
        'ErpInstallationLocator.cs:Find',
        'ErpReadOnlyConnection.cs:Load',
        'ErpReadOnlyConnection.cs:Server',
        'ErpBitDb.cs:Connect',
        'ErpBitDb.cs:Login',
        'UisHelperServices.cs:Uis',
        'UisHelperServices.cs:Uis',
      ].sort(),
    )
    // 단계는 기록 파일·크롬 응답에 넣지 않는다
    expect(code(read(LOG))).not.toMatch(/ErpStage/)
    for (const file of filesUnder('helper-erp/src/Erp.Core').filter((f) => f.endsWith('.cs'))) expect(read(file), file).not.toMatch(/ErpStage/)
  })

  it('AC-3806.2: 등록 오류면 기록 뒤 오류 번호·단계를 표준 출력에 ASCII로 쓰고(쓰기 실패는 무시) 2로 끝난다. 저장·취소 길에는 쓰지 않는다', () => {
    const text = code(read(PROGRAM))
    const register = methodBody(text, /static int Register\(ErpLog log\)/)
    expectOrder(
      register,
      [
        'return saved ? RegisterSaved : RegisterCancelled;',
        'catch (HelperException e)',
        'log.WriteRegister(e.Code);',
        'WriteRegisterError(e.Code);',
        'return RegisterFailed;',
        'catch (Exception)',
        'log.WriteRegister(ErrorCodes.Disconnected);',
        'WriteRegisterError(ErrorCodes.Disconnected);',
        'return RegisterFailed;',
      ],
      'Register',
    )
    expect(register.match(/WriteRegisterError\(/g)).toHaveLength(2)
    const before = register.slice(0, register.indexOf('return saved ? RegisterSaved : RegisterCancelled;'))
    expect(before).not.toMatch(/WriteRegisterError|OpenStandardOutput/)
    const write = methodBody(text, /private static void WriteRegisterError\(string code\)/)
    expectOrder(write, ['try', 'var stage = ErpStage.Current;', '"STEP-" + stage', 'Encoding.ASCII.GetBytes(', 'Console.OpenStandardOutput()', 'catch (Exception)'], 'WriteRegisterError')
    // 표준 출력을 여는 곳은 이것·의사랑 등록 끝 두 줄(spec erp-uisarang AC-4201.2, WriteRegisterSource)·크롬 메시지 고리 셋뿐이고, Main 첫 줄 버림은 그대로
    expect(text.match(/Console\.OpenStandardOutput\(\)/g)).toHaveLength(3)
    expect(methodBody(text, /private static void WriteRegisterSource\(UisFolderKind folder\)/)).toContain('Console.OpenStandardOutput()')
    expect(methodBody(text, /static int Main\(string\[\] args\)/)).toMatch(/^\{\s*Console\.SetOut\(TextWriter\.Null\);/)
  })

  it('AC-3806.3: install.ps1은 도우미 출력을 받아(2>&1 없음) 오류 번호·단계 줄을 -cmatch로 고르고, 실행 예외 글을 둔다', () => {
    const text = install()
    expectOrder(
      text,
      [
        '$registerOutput = @()',
        '$launchError = $null',
        "$registerOutput = @(& $exePath '--register')",
        '$registerCode = $LASTEXITCODE',
        '$registerCode = 2',
        '$launchError = $_.Exception.Message',
        "-cmatch '^E-[A-Z0-9-]+$'",
        "-cmatch '^STEP-[A-Z]+$'",
        'switch ($registerCode)',
      ],
      'install.ps1',
    )
    expect(text).not.toMatch(/2>&1/)
    expect(text).not.toMatch(/-match\s+'\^(E|STEP)-/)
  })

  it('AC-3806.3: 등록 실패 글: 까닭 네 가지·실행 예외·번호 없음·멈춘 단계(이름 다섯)·오류 번호·사진, 취소에 덧줄, 끝 번호 0·1·2는 그대로', () => {
    const text = install()
    const failed = text.slice(text.indexOf('default {', text.indexOf('switch ($registerCode)')))
    expectOrder(
      failed,
      [
        `'${REGISTER_MESSAGES.failed}'`,
        `'${REGISTER_REASONS.launch}'`,
        `'${REGISTER_REASONS.launchDetail}'`,
        `'${REGISTER_REASONS.noNumber}'`,
        `'${REGISTER_REASONS.noNumberTail}'`,
        "'E-BIT-NOT-FOUND'",
        `'${REGISTER_REASONS.notFound}'`,
        "'E-BIT-DB-FAILED'",
        `'${REGISTER_REASONS.dbFailed}'`,
        `'${REGISTER_REASONS.other}'`,
        `'${REGISTER_REASONS.step}'`,
        `'${REGISTER_REASONS.number}'`,
        `'${REGISTER_REASONS.photo}'`,
      ],
      'install.ps1 default',
    )
    for (const [step, name] of Object.entries(STEP_NAMES)) expect(failed, step).toContain(`'${step}' { '${name}' }`)
    expect(failed).toMatch(/-ceq 'E-BIT-NOT-FOUND'/)
    expect(failed).toMatch(/-ceq 'E-BIT-DB-FAILED'/)
    expectOrder(text, [`'${REGISTER_MESSAGES.cancelled}'`, `'${REGISTER_REASONS.cancelHint}'`, 'default {'], 'install.ps1 cancel')
    // 끝 번호 계산은 그대로
    expectOrder(text, ['if ($registerCode -eq 0) {', 'elseif ($registerCode -eq 1) {', '$exitCode = 1', 'else {', '$exitCode = 2', 'exit $exitCode'], 'install.ps1 exit')
  })

  it.runIf(process.platform === 'win32')('AC-3806.4: (윈도우) install.ps1은 PowerShell 5.1 글 검사에서 오류가 없다', () => {
    const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
    const script =
      '$t = $null; $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($env:ERP_PS1_PATH, [ref]$t, [ref]$e); [Console]::Out.Write($e.Count)'
    const run = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-Command', script], {
      env: { ...process.env, ERP_PS1_PATH: path.join(ROOT, INSTALL_PS1) },
      encoding: 'utf8',
      windowsHide: true,
      timeout: 60_000,
    })
    expect(`${run.stdout}`.trim(), `${run.stderr}${run.error?.message ?? ''}`).toBe('0')
  }, 90_000)
})

describe('AC-3611.5 설치·지우기(helper-erp/install)', () => {
  const install = () => psCode(read(INSTALL_PS1))
  const uninstall = () => psCode(read(UNINSTALL_PS1))

  it('AC-3611.5: install.cmd는 옆의 install.ps1을 PowerShell로 부른다(spec erp-bit-anywhere AC-3802.1로 여섯 줄이 됨)', () => {
    expect(cmdLines()).toEqual(INSTALL_CMD_LINES)
    expect(read(INSTALL_CMD)).toContain('-NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"')
  })

  it('AC-3611.5: install.ps1·uninstall.ps1은 한글이 깨지지 않게 UTF-8 BOM이고 StrictMode·Stop이다', () => {
    for (const rel of [INSTALL_PS1, UNINSTALL_PS1]) {
      expect([...readBytes(rel).subarray(0, 3)], rel).toEqual([0xef, 0xbb, 0xbf])
      expect(psCode(read(rel)), rel).toMatch(/^\$ErrorActionPreference = 'Stop'$/m)
      expect(psCode(read(rel)), rel).toMatch(/^Set-StrictMode -Version 3\.0$/m)
    }
  })

  it('AC-3611.5: install.ps1의 이름·열쇠는 ERP 것이다', () => {
    const text = install()
    expect(text).toContain(`$hostName = '${HOST_NAME}'`)
    expect(text).toContain(`$helperName = '${EXE}'`)
    expect(text).toContain(`$regKey = '${REG_KEY}'`)
  })

  it('AC-3611.5: install.ps1 차례: 돌던 ERP 도우미 끔 → app에 복사 → 틀의 path를 그 exe로 → HKCU 열쇠에 적음 → --register를 부르고 기다림', () => {
    const text = install()
    expectOrder(
      text,
      [
        "$installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\\ErpHelper\\app'",
        'Get-Process -Name $helperName',
        'Stop-Process -Force',
        'Copy-Item -Destination $installDir -Force',
        '$exePath = Join-Path $installDir "$helperName.exe"',
        '$manifestPath = Join-Path $installDir "$hostName.json"',
        `$json = $json.Replace('"__HELPER_EXE__"', '"' + $exePath.Replace('\\', '\\\\') + '"')`,
        '[System.IO.File]::WriteAllText($manifestPath, $json, (New-Object System.Text.UTF8Encoding($false)))',
        "Set-ItemProperty -LiteralPath $regKey -Name '(default)' -Value $manifestPath",
        "& $exePath '--register'",
        '$LASTEXITCODE',
      ],
      'install.ps1',
    )
    // 설치가 끝났을 때만 등록을 부른다
    expect(text).toMatch(/if \(\$installed\) \{/)
    expectOrder(text, ['$installed = $true', 'if ($installed) {', "& $exePath '--register'"], 'install.ps1')
  })

  it('AC-3611.5: 등록 종료 번호로 안내: 0 저장 · 1 취소 · 2(와 그 밖) 오류', () => {
    const text = install()
    // 가지마다 첫 Write-Host 글(spec erp-bit-anywhere AC-3806.3로 1·default 가지는 여러 줄이 됨)
    const arm = (label: string) => new RegExp(`^\\s*${label}\\s*\\{\\s*Write-Host '([^']+)'`, 'm').exec(text)?.[1]
    expect({ '0': arm('0'), '1': arm('1'), default: arm('default') }).toEqual({
      '0': REGISTER_MESSAGES.saved,
      '1': REGISTER_MESSAGES.cancelled,
      default: REGISTER_MESSAGES.failed,
    })
    expectOrder(text, ["& $exePath '--register'", '$LASTEXITCODE', 'switch ($registerCode)'], 'install.ps1')
  })

  it('AC-3611.5: uninstall.ps1은 ERP 열쇠와 ErpHelper 폴더만 지운다', () => {
    const text = uninstall()
    expect(text).toContain(`$helperName = '${EXE}'`)
    expect(text).toContain(`$regKey = '${REG_KEY}'`)
    expect(text).toContain("$helperDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\\ErpHelper'")
    const removed = [...text.matchAll(/Remove-Item\s+-LiteralPath\s+(\$\w+)/g)].map((m) => m[1])
    expect(removed.sort()).toEqual(['$helperDir', '$regKey'])
    expect(text.match(/Remove-Item/g)).toHaveLength(2)
    // 위 폴더(Seoseungkwan)나 다른 자리를 가리키는 길이 없다
    expect(text).not.toMatch(/Split-Path|Get-ChildItem/)
    expect(text.match(/Get-Process -Name (\$\w+)/)?.[1]).toBe('$helperName')
  })

  it('AC-3611.5: 설치 파일 어디에도 기존 도우미 열쇠·폴더·이름이 없다(주석 포함)', () => {
    for (const rel of [INSTALL_CMD, INSTALL_PS1, UNINSTALL_PS1, MANIFEST]) {
      const text = read(rel)
      for (const old of OLD_NAMES) expect(text, `${rel}: ${old}`).not.toContain(old)
    }
    // 설치 안내 README.md(TASK-8)는 사람이 읽는 글이라 기존 도우미와 따로라는 것을 이름으로 적는다 → 이름 검사에서 뺀다
    expect(filesUnder(INSTALL).sort()).toEqual(
      [INSTALL_CMD, INSTALL_PS1, MANIFEST, UNINSTALL_PS1, `${INSTALL}/README.md`].sort(),
    )
  })

  it('AC-3611.5: 기존 helper/install 파일은 운영(1a721ef) 그대로다', () => {
    for (const rel of ['helper/install/install.ps1', 'helper/install/uninstall.ps1', 'helper/install/install.cmd']) {
      expect(sha256(rel), rel).toBe(LIVE_SHA256[rel])
    }
  })
})

describe('AC-3611.6 ERP 도우미 만들기 (.github/workflows/helper-erp.yml)', () => {
  it('AC-3611.6: push(helper-erp/**·참조하는 helper/**·자기 파일, 모든 브랜치)·workflow_dispatch·태그 erp-helper-v*에 돈다', () => {
    const { root } = workflow()
    const on = get(root, 'on')
    expect(keysOf(on).sort()).toEqual(['push', 'workflow_dispatch'])
    const push = get(on, 'push')
    expect(keysOf(push).sort()).toEqual(['branches', 'paths', 'tags'])
    expect(list(get(push, 'branches'))).toEqual(['**'])
    expect(list(get(push, 'paths')).sort()).toEqual(['.github/workflows/helper-erp.yml', 'helper-erp/**', 'helper/**'].sort())
    expect(list(get(push, 'tags'))).toEqual(['erp-helper-v*'])
  })

  it('AC-3611.6: 기본 권한은 읽기, 일은 helper-erp(윈도우)와 release 둘', () => {
    const { root } = workflow()
    expect(get(root, 'permissions', 'contents').value).toBe('read')
    expect(keysOf(get(root, 'jobs'))).toEqual(['helper-erp', 'release'])
    expect(get(root, 'jobs', 'helper-erp', 'runs-on').value).toBe('windows-latest')
    expect(get(root, 'jobs', 'helper-erp', 'defaults', 'run', 'shell').value).toBe('pwsh')
  })

  it('AC-3611.6: 윈도우 일 차례: checkout → .NET 10 → ErpHelper.sln 시험 → Release 만들기 → zip → 올림', () => {
    const { root } = workflow()
    const steps = buildSteps(root).map(stepText)
    const at = (re: RegExp) => steps.findIndex((s) => re.test(s))
    const order = [
      at(/^actions\/checkout@v\d+/),
      at(/^actions\/setup-dotnet@v\d+/),
      at(/dotnet test helper-erp\/ErpHelper\.sln -c Release/),
      at(/dotnet build helper-erp\/ErpHelper\.sln -c Release/),
      at(/Compress-Archive/),
      at(/^actions\/upload-artifact@v\d+/),
    ]
    for (const index of order) expect(index).toBeGreaterThanOrEqual(0)
    expect([...order].sort((a, b) => a - b)).toEqual(order)
    const setup = buildSteps(root).find((s) => /setup-dotnet/.test(stepText(s)))
    expect(setup && get(setup, 'with', 'dotnet-version').value).toBe('10.x')
    const checkout = buildSteps(root).find((s) => /checkout/.test(stepText(s)))
    expect(checkout && get(checkout, 'with', 'persist-credentials').value).toBe('false')
  })

  it('AC-3611.6: zip 이름은 seoseungkwan-erp-helper-<판>이고 판은 helper-erp/Directory.Build.props, 태그는 erp-helper-v<판>과 같아야 한다', () => {
    const run = find(packStep(workflow().root), 'run')?.value ?? ''
    expect(run).toContain("Get-Content -Raw -LiteralPath 'helper-erp/Directory.Build.props'")
    expect(run).toContain('$zip = "seoseungkwan-erp-helper-$version.zip"')
    expect(run).toMatch(/\$env:GITHUB_REF_NAME -ne "erp-helper-v\$version"/)
    expect(run).toContain('Compress-Archive -Path "$stage/*" -DestinationPath "dist/$zip"')
  })

  it('AC-3611.6: zip에는 Erp.Helper Release 출력의 exe·설정·dll(app\\)과 helper-erp/install 파일이 들어간다', () => {
    const run = find(packStep(workflow().root), 'run')?.value ?? ''
    expect(run).toContain("$bin = 'helper-erp/src/Erp.Helper/bin/Release/net48'")
    expect(run).toContain(`Test-Path -LiteralPath "$bin/${EXE}.exe"`)
    expect(run).toContain('$app = Join-Path $stage \'app\'')
    expect(run).toContain('Copy-Item -Path "$bin/*.exe", "$bin/*.exe.config", "$bin/*.dll" -Destination $app')
    expect(run).toContain("Copy-Item -Path 'helper-erp/install/*' -Destination $stage")
    const upload = buildSteps(workflow().root).find((s) => /upload-artifact/.test(stepText(s)))
    expect(upload && get(upload, 'with', 'path').value).toBe('dist/seoseungkwan-erp-helper-*.zip')
    expect(upload && get(upload, 'with', 'if-no-files-found').value).toBe('error')
  })

  it('AC-3611.6: 판(GitHub 릴리스)은 erp-helper-v* 태그일 때만, 이 일만 쓰기 권한이고 zip 하나를 올린다', () => {
    const { root } = workflow()
    const release = get(root, 'jobs', 'release')
    expect(get(release, 'if').value).toBe("startsWith(github.ref, 'refs/tags/erp-helper-v')")
    expect(list(get(release, 'needs'))).toEqual(['helper-erp'])
    expect(get(release, 'permissions', 'contents').value).toBe('write')
    expect(collect(get(root, 'jobs', 'helper-erp'), 'permissions')).toEqual([])
    const steps = get(release, 'steps').children.map(stepText).join('\n')
    expect(steps).toMatch(/gh release create "\$TAG" dist\/\*\.zip --verify-tag/)
  })

  it('AC-3611.6: action은 판을 고정하고 비밀값을 쓰지 않으며 기존 도우미 것(Precheck.sln·helper-v·precheck-helper)을 만들지 않는다', () => {
    const { text, root } = workflow()
    for (const uses of collect(root, 'uses')) expect(uses).toMatch(/^actions\/[a-z-]+@v\d+$/)
    expect(text).not.toMatch(/secrets\./)
    for (const banned of ['Precheck.sln', "'helper-v", 'refs/tags/helper-v', 'precheck-helper', 'PrecheckHelper', 'extension/']) {
      expect(text, banned).not.toContain(banned)
    }
  })

  it('AC-3611.6: 기존 .github/workflows/helper.yml은 운영(1a721ef) 그대로다', () => {
    expect(sha256('.github/workflows/helper.yml')).toBe(LIVE_SHA256['.github/workflows/helper.yml'])
  })
})
