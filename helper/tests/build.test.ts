// 도우미 윈도우 빌드·설치 파일(TASK-2, REQ-002)을 글자로 읽어 검사한다.
// - YAML 해석 패키지는 넣지 않는다(package.json은 이 TASK 범위 밖). 이 workflow가 쓰는 YAML 모양
//   (들여쓰기 맵·`- ` 목록·`[a, b]` 목록·블록 글자 `|`)만 읽는 작은 해석기를 둔다. 모르는 모양의 줄이 나오면 실패한다
// - 윈도우에서 실제로 도는지는 Actions 실행과 의원 PC에서 본다. 이 시험은 파일끼리의 약속(이름·경로·권한·순서)만 본다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const WORKFLOW = '.github/workflows/helper.yml'
const MANIFEST = 'helper/install/host-manifest.json'
const INSTALL_PS1 = 'helper/install/install.ps1'
const UNINSTALL_PS1 = 'helper/install/uninstall.ps1'
const INSTALL_CMD = 'helper/install/install.cmd'
const README = 'helper/install/README.md'
const PROPS = 'helper/Directory.Build.props'
const HELPER_CSPROJ = 'helper/src/Precheck.Helper/Precheck.Helper.csproj'
const COMMANDS = 'src/lib/bridge/commands.json'

// google-code/sheet/**: 도우미가 수납 구글 코드(Code.gs)를 안에 싣는다(google-link TASK-23 (다)) — 고치면 도우미를 다시 빌드한다
const TRIGGER_PATHS = ['helper/**', 'extension/**', 'src/lib/bridge/commands.json', 'google-code/sheet/**', '.github/workflows/helper.yml']
const REG_KEY = 'HKCU:\\Software\\Google\\Chrome\\NativeMessagingHosts\\com.seoseungkwan.precheck'
const DATA_QUESTION = '고치던 메모·완료 표시가 지워집니다. 지울까요?'

function readBytes(rel: string): Buffer {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file)
}

function read(rel: string): string {
  return readBytes(rel).toString('utf8').replace(/^﻿/, '')
}

// ── YAML(이 workflow가 쓰는 모양만) ────────────────────────────────────────────

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

function pairs(node: YNode): string[] {
  return node.children.map((c) => `${c.key}: ${c.value}`)
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

function helperSteps(root: YNode): YNode[] {
  return get(root, 'jobs', 'helper', 'steps').children
}

function packStep(root: YNode): YNode {
  const step = helperSteps(root).find((s) => /Compress-Archive/.test(stepText(s)))
  if (!step) throw new Error('helper 일에 zip을 만드는 단계(Compress-Archive)가 없다')
  return step
}

// ── PowerShell·프로젝트 파일 ──────────────────────────────────────────────────

/** 주석(<# … #>, # 로 시작하는 줄)을 뺀 코드 */
function psCode(text: string): string {
  return text
    .replace(/<#[\s\S]*?#>/g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

function csprojValue(name: string): string {
  const m = new RegExp(`<${name}>([^<]+)</${name}>`).exec(read(HELPER_CSPROJ))
  if (!m) throw new Error(`${HELPER_CSPROJ}에 ${name}이 없다`)
  return m[1].trim()
}

function indicesOf(text: string, re: RegExp): number[] {
  return [...text.matchAll(new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`))].map(
    (m) => m.index ?? -1,
  )
}

// ── 시험 ──────────────────────────────────────────────────────────────────────

describe('REQ-002 도우미 윈도우 빌드 (.github/workflows/helper.yml)', () => {
  it('AC-002.1 push(helper/**·extension/**·commands.json·자기 파일, 모든 브랜치)·workflow_dispatch·태그 helper-v*에 돈다', () => {
    const { root } = workflow()
    const on = get(root, 'on')
    expect(keysOf(on).sort()).toEqual(['push', 'workflow_dispatch'])
    const push = get(on, 'push')
    expect(keysOf(push).sort()).toEqual(['branches', 'paths', 'tags'])
    expect(list(get(push, 'paths')).sort()).toEqual([...TRIGGER_PATHS].sort())
    // tags만 적으면 브랜치 push에는 돌지 않는다(GitHub 규칙). 그래서 모든 브랜치를 함께 적는다.
    // 태그 push에는 paths 거르기가 걸리지 않는다(GitHub 규칙)
    expect(list(get(push, 'branches'))).toEqual(['**'])
    expect(list(get(push, 'tags'))).toEqual(['helper-v*'])
  })

  it('AC-002.1 helper 일은 windows-latest에서 dotnet test(풀이 전체, 거르기 없음)를 먼저 돌린 뒤에만 빌드·zip·artifact를 만든다', () => {
    const { text, root } = workflow()
    const helper = get(root, 'jobs', 'helper')
    expect(get(helper, 'runs-on').value).toBe('windows-latest')

    const steps = helperSteps(root)
    const at = (re: RegExp) => steps.findIndex((s) => re.test(stepText(s)))
    const checkout = at(/^actions\/checkout@/m)
    const setup = at(/^actions\/setup-dotnet@/m)
    const test = at(/^dotnet test helper\/Precheck\.sln\b/m)
    const build = at(/^dotnet build helper\/Precheck\.sln\b/m)
    const pack = at(/Compress-Archive/)
    const upload = at(/^actions\/upload-artifact@/m)

    expect(checkout).toBeGreaterThanOrEqual(0)
    expect(setup).toBeGreaterThan(checkout)
    expect(get(steps[setup], 'with', 'dotnet-version').value).toBe('10.x')
    expect(test).toBeGreaterThan(setup)
    expect(build).toBeGreaterThan(test)
    expect(pack).toBeGreaterThan(build)
    expect(upload).toBeGreaterThan(pack)

    // 시험보다 앞에서 빌드·묶기·올리기를 하지 않는다
    for (const step of steps.slice(0, test)) {
      expect(stepText(step)).not.toMatch(/dotnet (build|publish|pack|msbuild)|msbuild|Compress-Archive|upload-artifact/i)
    }
    // 시험 단계는 건너뛰거나 실패를 삼키지 않고, Core·Windows 시험을 모두 돈다(거르기·프레임워크 한정 없음)
    const testStep = steps[test]
    expect(keysOf(testStep)).not.toContain('if')
    expect(keysOf(testStep)).not.toContain('continue-on-error')
    expect(get(testStep, 'run').value).not.toMatch(/--filter|\s-f\s|--framework|--no-build/)
    expect(text).not.toMatch(/continue-on-error|always\(\)|failure\(\)/)
  })

  it('AC-002.2 최상위 권한은 contents: read 하나이고, contents: write는 태그 조건이 붙은 release 일에만 있다', () => {
    const { text, root } = workflow()
    expect(pairs(get(root, 'permissions'))).toEqual(['contents: read'])
    expect(text).not.toMatch(/write-all|read-all/)

    const jobs = get(root, 'jobs')
    const withPermissions = jobs.children.filter((job) => find(job, 'permissions')).map((job) => job.key)
    expect(withPermissions).toEqual(['release'])

    const release = get(jobs, 'release')
    expect(pairs(get(release, 'permissions'))).toEqual(['contents: write'])
    expect(get(release, 'if').value).toBe("startsWith(github.ref, 'refs/tags/helper-v')")
    expect(list(get(release, 'needs'))).toContain('helper')

    // 쓰기 권한 줄은 글 전체에서 그 한 줄뿐
    expect(text.match(/^\s*[\w-]+:\s*write\s*$/gm) ?? []).toHaveLength(1)
  })

  it('AC-002.2 secrets.를 쓰지 않고, 릴리스는 이 실행의 기본 토큰(github.token)으로만 만든다', () => {
    const { text, root } = workflow()
    expect(text).not.toMatch(/secrets\./)

    const steps = get(root, 'jobs', 'release', 'steps').children
    const create = steps.find((s) => /\bgh release create\b/.test(stepText(s)))
    expect(create, 'release 일에 gh release create 단계가 없다').toBeDefined()
    expect(get(create as YNode, 'env', 'GH_TOKEN').value).toBe('${{ github.token }}')
  })

  it('AC-002.2 모든 action은 판이 고정돼 있다(@v숫자 또는 40자 커밋, @main·@master 없음)', () => {
    const { text, root } = workflow()
    const uses = collect(root, 'uses')
    expect(uses.length).toBeGreaterThan(0)
    // 해석기가 uses: 줄을 하나도 빠뜨리지 않았는지
    expect(uses).toHaveLength((text.match(/^\s*(-\s+)?uses:/gm) ?? []).length)
    for (const ref of uses) {
      expect(ref).toMatch(/^[\w.-]+\/[\w.-]+(\/[\w./-]+)?@(v\d+(\.\d+){0,2}|[0-9a-f]{40})$/)
    }
    expect(text).not.toMatch(/@(main|master)\b/)
  })

  it('AC-002.5 zip 이름은 precheck-helper-<Version>.zip이고 Version은 Directory.Build.props 한 곳에서 읽는다', () => {
    const versions = [...read(PROPS).matchAll(/<Version>([^<]*)<\/Version>/g)].map((m) => m[1])
    expect(versions, 'Directory.Build.props의 Version은 하나여야 한다').toHaveLength(1)
    expect(versions[0]).toMatch(/^\d+\.\d+\.\d+$/)

    const { root } = workflow()
    const run = get(packStep(root), 'run').value
    const read$ = /\$(\w+)\s*=\s*\$(\w+)\.SelectSingleNode\('\/Project\/PropertyGroup\/Version'\)/.exec(run)
    expect(read$, 'zip 단계가 [xml]의 /Project/PropertyGroup/Version으로 버전을 읽지 않는다').not.toBeNull()
    const [, version, props] = read$ as RegExpExecArray
    expect(run).toContain(`$${props} = [xml](Get-Content -Raw -LiteralPath '${PROPS}')`)
    expect(run).toContain(`"precheck-helper-$${version}.zip"`)
    // 태그 helper-v<Version>과 Directory.Build.props가 다르면 멈춘다
    expect(run).toContain(`"helper-v$${version}"`)
  })

  it('AC-002.5 zip에는 도우미 exe(Precheck.Helper.csproj의 이름·net48 출력)·DLL·설정과 helper/install/*가 들어가고 artifact로 올라간다', () => {
    const { root } = workflow()
    const run = get(packStep(root), 'run').value
    const exe = `${csprojValue('AssemblyName')}.exe`
    expect(run).toContain(`helper/src/Precheck.Helper/bin/Release/${csprojValue('TargetFramework')}`)
    expect(run).toContain(exe)
    expect(run).toMatch(/\*\.exe\.config/)
    expect(run).toMatch(/\*\.dll/)
    expect(run).toContain("'helper/install/*'")

    const upload = helperSteps(root).find((s) => /^actions\/upload-artifact@/.test(stepText(s)))
    expect(get(upload as YNode, 'with', 'path').value).toBe('dist/precheck-helper-*.zip')
    expect(get(upload as YNode, 'with', 'if-no-files-found').value).toBe('error')
  })
})

describe('REQ-002 도우미 설치 파일 (helper/install/)', () => {
  it('AC-002.3 host-manifest.json 틀은 name·description·path·type·allowed_origins만 있고, allowed_origins는 우리 확장 하나다', () => {
    const manifest = JSON.parse(read(MANIFEST)) as Record<string, unknown>
    const commands = JSON.parse(read(COMMANDS)) as { hostName: string; extensionId: string }

    expect(Object.keys(manifest).sort()).toEqual(['allowed_origins', 'description', 'name', 'path', 'type'])
    expect(manifest.name).toBe('com.seoseungkwan.precheck')
    expect(manifest.name).toBe(commands.hostName)
    expect(manifest.type).toBe('stdio')
    expect(typeof manifest.description).toBe('string')
    expect(String(manifest.description).trim()).not.toBe('')
    // 설치 때 install.ps1이 실제 exe 경로로 채운다
    expect(manifest.path).toBe('__HELPER_EXE__')

    expect(commands.extensionId).toMatch(/^[a-p]{32}$/)
    expect(manifest.allowed_origins).toEqual([`chrome-extension://${commands.extensionId}/`])
    expect(JSON.stringify(manifest.allowed_origins)).not.toContain('*')
  })

  it('AC-002.4 install.ps1은 관리자 권한 없이 %LOCALAPPDATA%\\Seoseungkwan\\PrecheckHelper\\에 두고 HKCU 등록 키에 등록 파일 경로를 쓴다', () => {
    const raw = read(INSTALL_PS1)
    const code = psCode(raw)
    const commands = JSON.parse(read(COMMANDS)) as { hostName: string }

    expect(raw).not.toMatch(/#Requires\s+-RunAsAdministrator/i)
    for (const file of [INSTALL_PS1, UNINSTALL_PS1, INSTALL_CMD]) {
      expect(read(file), file).not.toMatch(/HKLM|HKEY_LOCAL_MACHINE|RunAsAdministrator|-Verb\s+RunAs/i)
    }

    expect(code).toContain("$installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\\PrecheckHelper'")
    expect(REG_KEY.endsWith(`\\${commands.hostName}`)).toBe(true)
    expect(code).toContain(`$regKey = '${REG_KEY}'`)
    expect(code).toContain(`$hostName = '${commands.hostName}'`)
    // 틀의 path를 채운 등록 파일을 프로그램 폴더에 두고, 그 경로를 키의 기본값에 쓴다
    expect(code).toContain('__HELPER_EXE__')
    expect(code).toMatch(/\$manifestPath = Join-Path \$installDir "\$hostName\.json"/)
    expect(code).toMatch(/Set-ItemProperty -LiteralPath \$regKey -Name '\(default\)' -Value \$manifestPath/)
    // 도우미 이름은 Precheck.Helper.csproj의 AssemblyName과 같다
    expect(code).toContain(`$helperName = '${csprojValue('AssemblyName')}'`)
  })

  it('AC-002.4 install.ps1은 돌던 도우미를 먼저 끝내고 프로그램 파일만 덮어쓰며 data\\는 지우지 않는다', () => {
    const code = psCode(read(INSTALL_PS1))
    const stop = code.search(/\bStop-Process\b/)
    const copy = code.search(/\bCopy-Item\b/)
    expect(code).toMatch(/Get-Process -Name \$helperName\b/)
    expect(stop).toBeGreaterThanOrEqual(0)
    expect(copy).toBeGreaterThan(stop)

    // 무엇이든 지우거나 옮기는 명령이 없다(data\·logs\는 그대로)
    expect(code).not.toMatch(/Remove-Item|Move-Item|Clear-Content|\]::Delete|\brmdir\b|\brd\s|\bdel\s|\/MIR\b/i)
    // 프로그램은 zip의 app\ 안 파일만 옮긴다(폴더째 옮기지 않아 data\를 덮어쓸 길이 없다)
    expect(code).toMatch(/Get-ChildItem -LiteralPath \$appSource -File \| Copy-Item -Destination \$installDir -Force/)
    for (const line of code.split('\n').filter((l) => /\bCopy-Item\b/.test(l))) {
      expect(line).not.toMatch(/-Recurse/)
    }
  })

  it('AC-002.4 uninstall.ps1은 등록 키와 프로그램 파일을 지우고, data\\는 물어본 뒤 예일 때만 지운다', () => {
    const code = psCode(read(UNINSTALL_PS1))
    expect(code).toContain(`$regKey = '${REG_KEY}'`)
    expect(code).toContain("$installDir = Join-Path $env:LOCALAPPDATA 'Seoseungkwan\\PrecheckHelper'")
    expect(code).toContain("$dataDir = Join-Path $installDir 'data'")
    expect(code).toMatch(/Remove-Item -LiteralPath \$regKey\b/)
    // exe를 지우려면 돌던 도우미를 먼저 끈다
    expect(code).toMatch(/Get-Process -Name \$helperName\b/)
    expect(code.search(/\bStop-Process\b/)).toBeLessThan(code.search(/\bRemove-Item\b/))

    // 프로그램 파일 지우기는 data를 뺀다. 설치 폴더를 통째로 지우는 줄은 없다
    expect(code).toMatch(/Where-Object \{ \$_\.Name -ne 'data' \} \| Remove-Item -Recurse -Force/)
    expect(code).not.toMatch(/Remove-Item\s+(-\w+\s+)*\$installDir\b/)

    // data\는 묻고 나서, 답이 '예'일 때만 지운다
    const ask = code.indexOf(DATA_QUESTION)
    expect(ask, `"${DATA_QUESTION}"를 묻지 않는다`).toBeGreaterThan(0)
    const removals = indicesOf(code, /Remove-Item\s+(-\w+\s+)*\$dataDir\b/)
    expect(removals).toHaveLength(1)
    expect(removals[0]).toBeGreaterThan(ask)
    const between = code.slice(ask, removals[0])
    expect(between).toMatch(/\$answer = Read-Host\b/)
    expect(between).toMatch(/if \(@\('Y', '예'\) -contains \$answer\.Trim\(\)\) \{/)
  })

  it('AC-002.4 install.cmd는 install.ps1을 부르는 한 줄이고 ASCII 글자뿐이다(cmd는 한글·BOM을 못 읽는다)', () => {
    const bytes = readBytes(INSTALL_CMD)
    expect([...bytes].every((b) => b < 0x80)).toBe(true)
    const lines = bytes
      .toString('utf8')
      .split(/\r?\n/)
      .filter((line) => line.trim() !== '')
    expect(lines).toEqual(['@powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1"'])
  })

  it('AC-002.4 install.ps1·uninstall.ps1은 UTF-8 BOM으로 저장한다(윈도우 PowerShell 5.1이 한글 문구를 깨뜨리지 않게)', () => {
    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      expect([...readBytes(file).subarray(0, 3)], file).toEqual([0xef, 0xbb, 0xbf])
    }
  })

  it('AC-002.4 README는 설치 순서·SmartScreen(추가 정보 → 실행)·크롬 다시 켜기·지우기를 적는다', () => {
    const md = read(README)
    expect(md).toContain('install.cmd')
    expect(md).toContain('SmartScreen')
    expect(md).toMatch(/추가 정보.*실행/)
    expect(md).toMatch(/크롬을 다시 켤/)
    expect(md).toContain('uninstall.ps1')
    expect(md).toContain('%LOCALAPPDATA%\\Seoseungkwan\\PrecheckHelper')
  })
})

// spec google-link TASK-10(REQ-8511): 도우미 0.14.0은 수납 구글 코드(google-code/sheet/Code.gs)를 실어 sheet.code가 클립보드에 넣는다
describe('REQ-8511 도우미 0.14.0 빌드 (Precheck.Core에 수납 구글 코드 싣기)', () => {
  const CORE_CSPROJ = 'helper/src/Precheck.Core/Precheck.Core.csproj'

  it('AC-8511.1 AC-005.16 Directory.Build.props 판은 0.14.1이다(수납 구글 코드는 0.14.0부터 실림)', () => {
    expect(read(PROPS).match(/<Version>([^<]+)<\/Version>/)?.[1]).toBe('0.14.1')
  })

  it('AC-8511.2 Precheck.Core.csproj가 google-code/sheet/Code.gs를 LogicalName SheetCode.gs로 싣는다(명령 표 commands.json 싣기는 그대로)', () => {
    const csproj = read(CORE_CSPROJ)
    expect(csproj).toContain('<EmbeddedResource Include="../../../google-code/sheet/Code.gs" LogicalName="SheetCode.gs" />')
    expect(csproj).toContain('<EmbeddedResource Include="../../../src/lib/bridge/commands.json" LogicalName="commands.json" />')
    expect(existsSync(path.join(ROOT, 'google-code', 'sheet', 'Code.gs'))).toBe(true)
  })

  it('AC-8511.2 Code.gs의 비밀 글자 자리 __TOKEN__은 꼭 한 번이다(도우미가 바꿔 넣는 자리)', () => {
    const code = read('google-code/sheet/Code.gs')
    expect(code.split('__TOKEN__')).toHaveLength(2)
  })
})
