// 접수 현황 설치·내보내기·안내(TASK-27, REQ-1412·REQ-1411·REQ-1413, design.md 9·11절, 사용자 단계)를 글자로 읽어 검사한다.
// - 윈도우에서 실제로 도는지(시작 항목·바로 가기·방화벽 창·휴대폰 열기)는 의원 PC에서 본다. 이 시험은 파일끼리의 약속(이름·자리·순서·안내 글)만 본다
// - 지금 도우미 설치의 약속(크롬 등록·data\·install.cmd·SmartScreen 안내)은 build.test.ts가 그대로 본다
// - "바뀌지 않음"은 이 브랜치와 origin/main의 갈림점(git merge-base)과 비교한다. 도우미 릴리스 줄(origin/release-helper-*)을 합쳤으면
//   그 줄과의 갈림점이 더 새것이라 그것과 비교한다. git은 읽기만 한다(fetch·push 없음)
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const WORKFLOW = '.github/workflows/helper.yml'
const INSTALL_PS1 = 'helper/install/install.ps1'
const UNINSTALL_PS1 = 'helper/install/uninstall.ps1'
const README = 'helper/install/README.md'
const RECEPTION_CSPROJ = 'helper/src/Precheck.Reception/Precheck.Reception.csproj'
const HELPER_CSPROJ = 'helper/src/Precheck.Helper/Precheck.Helper.csproj'
const RECEPTION_START = 'helper/src/Precheck.Core/Reception/ReceptionStart.cs'
const CHECK_FILES = ['helper/install/reception-check.cmd', 'helper/install/reception-check.ps1']

const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const SHORTCUT_NAME = '접수 현황 주소'
const DATA_QUESTION = '고치던 메모·완료 표시가 지워집니다. 지울까요?'

/** 이 기능이 바꾸면 안 되는 곳(AC-1412.3: 도우미 버전·크롬 통로 / AC-1413.3: 크롬 통로·웹사이트 CSP·서버 경로) */
const VERSION_PATHS = ['helper/Directory.Build.props', 'src/lib/bridge']
const SITE_PATHS = ['src/lib/bridge', 'next.config.ts', 'src/app/api']

function readBytes(rel: string): Buffer {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file)
}

function read(rel: string): string {
  return readBytes(rel).toString('utf8').replace(/^﻿/, '')
}

/** 읽기만 하는 git. 다른 작업이 index.lock을 잡고 있어도 기다리지 않게 선택 잠금을 쓰지 않는다 */
function git(...args: string[]): string {
  return execFileSync('git', ['--no-optional-locks', ...args], { cwd: ROOT, encoding: 'utf8' })
}

/** a가 b의 조상(또는 같은 커밋)인가 */
function isAncestor(a: string, b: string): boolean {
  try {
    git('merge-base', '--is-ancestor', a, b)
    return true
  } catch {
    return false
  }
}

/**
 * 갈림점: origin/main과의 갈림점. 이 브랜치에 도우미 릴리스 줄(origin/release-helper-*)을 합쳤으면
 * 그 줄과의 갈림점이 더 새것이라 그것을 쓴다(릴리스 줄이 올린 도우미 판·크롬 통로를 이 기능이 바꾼 것으로 보지 않게)
 */
function mergeBase(): string {
  let bases: string[]
  try {
    bases = [git('merge-base', 'HEAD', 'origin/main').trim()]
  } catch {
    throw new Error('git merge-base HEAD origin/main을 구하지 못했다(origin/main이 없다)')
  }
  const releases = git('for-each-ref', '--format=%(refname:short)', 'refs/remotes/origin/release-helper-*')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l !== '')
  for (const ref of releases) {
    try {
      bases.push(git('merge-base', 'HEAD', ref).trim())
    } catch {
      // 이 브랜치와 이어지지 않은 릴리스 줄은 건너뛴다
    }
  }
  const base = bases.find((b) => bases.every((o) => isAncestor(o, b)))
  if (base === undefined) throw new Error(`갈림점 가운데 가장 새것을 고르지 못했다: ${bases.join(', ')}`)
  expect(base).toMatch(/^[0-9a-f]{40}$/)
  return base
}

/** 주석(<# … #>, # 로 시작하는 줄)을 뺀 PowerShell 코드 */
function psCode(text: string): string {
  return text
    .replace(/<#[\s\S]*?#>/g, '')
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join('\n')
}

function csprojValue(file: string, name: string): string {
  const m = new RegExp(`<${name}>([^<]+)</${name}>`).exec(read(file))
  if (!m) throw new Error(`${file}에 ${name}이 없다`)
  return m[1].trim()
}

/** 바로 가기 인자: Core ReceptionStart.LinkFlag와 글자 그대로 같아야 한다 */
function linkFlag(): string {
  const m = /public const string LinkFlag = "([^"]+)";/.exec(read(RECEPTION_START))
  if (!m) throw new Error(`${RECEPTION_START}에 LinkFlag가 없다`)
  return m[1]
}

const receptionName = () => csprojValue(RECEPTION_CSPROJ, 'AssemblyName')

/** `$name = …` 줄 하나(앞뒤 공백 뺌). 없거나 둘 이상이면 실패 */
function assignment(code: string, name: string): string {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(`$${name} = `))
  expect(lines, `$${name} = … 줄이 하나여야 한다`).toHaveLength(1)
  return lines[0]
}

/** 돌던 프로그램을 찾는 줄: 두 이름을 모두 찾고, 이 윈도우 로그인(세션)의 것만 고른다 */
function expectStopsBoth(code: string, file: string): void {
  const lines = code.split('\n').filter((l) => /\bGet-Process\b/.test(l))
  expect(lines, `${file}: Get-Process 줄이 하나여야 한다`).toHaveLength(1)
  const line = lines[0]
  expect(line).toMatch(/-Name \$helperName, \$receptionName\b/)
  expect(line).toContain('Where-Object { $_.SessionId -eq $session }')
  expect(code).toContain('$session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId')
  expect(code).toMatch(/\$running \| Stop-Process -Force/)
  expect(code).toMatch(/\$running \| Wait-Process -Timeout \d+/)
  expect(code.search(/\bGet-Process\b/)).toBeLessThan(code.search(/\bStop-Process\b/))
}

function indexOrFail(code: string, needle: string | RegExp, what: string): number {
  const at = typeof needle === 'string' ? code.indexOf(needle) : code.search(needle)
  expect(at, `${what}가 없다`).toBeGreaterThanOrEqual(0)
  return at
}

// ── workflow zip 단계 ───────────────────────────────────────────────────────

/** helper 일의 zip 단계(Compress-Archive가 있는 단계) 줄 범위. 바로 위에 붙은 주석 줄도 그 단계에 넣는다 */
function packRange(lines: string[]): { start: number; end: number } {
  const at = lines.findIndex((l) => /Compress-Archive/.test(l))
  if (at < 0) throw new Error(`${WORKFLOW}에 Compress-Archive가 없다`)
  const stepStart = /^ {6}- /
  let start = at
  while (start > 0 && !stepStart.test(lines[start])) start--
  while (start > 0 && /^\s*#/.test(lines[start - 1])) start--
  let end = at + 1
  while (end < lines.length && !stepStart.test(lines[end]) && !/^ {0,4}\S/.test(lines[end]) && !/^\s*#/.test(lines[end])) {
    end++
  }
  return { start, end }
}

function packRun(): string {
  const lines = read(WORKFLOW).split(/\r?\n/)
  const { start, end } = packRange(lines)
  return lines.slice(start, end).join('\n')
}

/** needle이 든 단계 하나(`      - ` 줄부터 빈 줄·다음 단계·다음 일 전까지)와 그 바로 위 빈 줄을 뺀 줄들. 없으면 그대로 */
function withoutStep(lines: string[], needle: string): string[] {
  const at = lines.findIndex((l) => l.includes(needle))
  if (at < 0) return lines
  const stepStart = /^ {6}- /
  let start = at
  while (start > 0 && !stepStart.test(lines[start])) start--
  if (start > 0 && lines[start - 1].trim() === '') start--
  let end = at + 1
  while (end < lines.length && lines[end].trim() !== '' && !stepStart.test(lines[end]) && !/^ {0,4}\S/.test(lines[end])) end++
  return [...lines.slice(0, start), ...lines.slice(end)]
}

function isCodeLine(line: string): boolean {
  return line.trim() !== '' && !/^\s*#/.test(line)
}

// ── 시험 ──────────────────────────────────────────────────────────────────────

describe('REQ-1412 설치·지우기 (helper/install/install.ps1·uninstall.ps1)', () => {
  it('AC-1412.1 install.ps1·uninstall.ps1에는 관리자 권한 명령이 없다(HKLM·RunAs·방화벽 규칙·네트워크 바꾸기·작업 스케줄러·모든 사용자 바탕 화면 없음, 레지스트리는 HKCU만)', () => {
    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      const raw = read(file)
      expect(raw, file).not.toMatch(/#Requires\s+-RunAsAdministrator/i)
      expect(raw, file).not.toMatch(
        /HKLM|HKEY_LOCAL_MACHINE|RunAsAdministrator|-Verb\s+RunAs|\bnetsh\b|NetFirewall|NetConnectionProfile|schtasks|ScheduledTask|CommonDesktop|AllUsers|\$env:PUBLIC|\$env:ProgramData|ProgramFiles|New-Service|\bsc(\.exe)?\s+create\b/i,
      )
      const drives = [...psCode(raw).matchAll(/\b(HK[A-Z_]+):/g)].map((m) => m[1])
      expect(drives.length, file).toBeGreaterThan(0)
      expect(new Set(drives), file).toEqual(new Set(['HKCU']))
    }
  })

  it('AC-1412.1 install.ps1은 이 로그인에서 돌던 PrecheckHelper·PrecheckReception을 먼저 끄고 나서 프로그램 파일을 덮어쓴다', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(assignment(code, 'helperName')).toBe(`$helperName = '${csprojValue(HELPER_CSPROJ, 'AssemblyName')}'`)
    expect(assignment(code, 'receptionName')).toBe(`$receptionName = '${receptionName()}'`)
    expectStopsBoth(code, INSTALL_PS1)
    expect(indexOrFail(code, /\bCopy-Item\b/, 'Copy-Item')).toBeGreaterThan(code.search(/\bStop-Process\b/))
    // 푼 폴더 app\에 접수 현황 프로그램이 없으면 아무것도 바꾸기 전에 멈춘다
    const check = indexOrFail(code, 'Join-Path $appSource "$receptionName.exe"', 'app\\의 PrecheckReception.exe 확인')
    expect(check).toBeLessThan(code.search(/\bStop-Process\b/))
  })

  it('AC-1411.2 install.ps1은 사용자 레지스트리 시작 항목(HKCU …\\CurrentVersion\\Run)에 따옴표로 감싼 PrecheckReception.exe 경로만(인자 없음) 쓴다', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(assignment(code, 'runKey')).toBe(`$runKey = '${RUN_KEY}'`)
    expect(assignment(code, 'runName')).toMatch(/^\$runName = '[\w.-]+'$/)
    expect(assignment(code, 'receptionExe')).toBe('$receptionExe = Join-Path $installDir "$receptionName.exe"')

    const sets = code.split('\n').filter((l) => /-LiteralPath \$runKey\b/.test(l) && /\bSet-ItemProperty\b/.test(l))
    expect(sets, '시작 항목 쓰기는 한 줄이다').toHaveLength(1)
    const m = /Set-ItemProperty -LiteralPath \$runKey -Name \$runName -Value (.+)$/.exec(sets[0].trim())
    expect(m, '시작 항목은 Set-ItemProperty -LiteralPath $runKey -Name $runName -Value …로 쓴다').not.toBeNull()
    const value = (m as RegExpExecArray)[1].trim()
    // 경로에 빈칸이 있어도 되게 따옴표로 감싸고, 인자는 붙이지 않는다(인자 없이 켜면 47200에서 기다린다)
    expect(value).toMatch(/^\('"' \+ \$receptionExe \+ '"'\)$|^"""\$receptionExe"""$|^"`"\$receptionExe`""$/)
    expect(sets[0]).not.toContain(linkFlag())
  })

  it('AC-1411.3 install.ps1은 바탕 화면에 "접수 현황 주소" 바로 가기(WScript.Shell .lnk)를 만들고, 대상은 PrecheckReception.exe, 인자는 --link(ReceptionStart.LinkFlag)다', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(linkFlag()).toBe('--link')
    // 이 윈도우 사용자의 바탕 화면(모든 사용자 바탕 화면은 관리자 권한이 필요하다)
    expect(assignment(code, 'shortcutPath')).toBe(
      `$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '${SHORTCUT_NAME}.lnk'`,
    )
    expect(code).toMatch(/\$(\w+) = New-Object -ComObject WScript\.Shell\b/)
    const shell = (/\$(\w+) = New-Object -ComObject WScript\.Shell\b/.exec(code) as RegExpExecArray)[1]
    const lnk = new RegExp(`\\$(\\w+) = \\$${shell}\\.CreateShortcut\\(\\$shortcutPath\\)`).exec(code)
    expect(lnk, '바로 가기를 $shortcutPath에 만든다').not.toBeNull()
    const v = (lnk as RegExpExecArray)[1]
    expect(code).toContain(`$${v}.TargetPath = $receptionExe`)
    expect(code).toContain(`$${v}.Arguments = '${linkFlag()}'`)
    expect(code).toContain(`$${v}.WorkingDirectory = $installDir`)
    expect(code).toContain(`$${v}.Save()`)
  })

  it('AC-1412.1 install.ps1 차례: 끄기 → 덮어쓰기 → 크롬 등록(그대로) → 시작 항목 → 바로 가기 → PrecheckReception.exe 켜기(인자·관리자 권한 없이)', () => {
    const code = psCode(read(INSTALL_PS1))
    const stop = indexOrFail(code, /\bStop-Process\b/, '끄기')
    const copy = indexOrFail(code, /\bCopy-Item\b/, '덮어쓰기')
    const chrome = indexOrFail(code, "Set-ItemProperty -LiteralPath $regKey -Name '(default)' -Value $manifestPath", '크롬 등록')
    const run = indexOrFail(code, 'Set-ItemProperty -LiteralPath $runKey', '시작 항목')
    const save = indexOrFail(code, /\$\w+\.Save\(\)/, '바로 가기 저장')
    const starts = code.split('\n').filter((l) => /\bStart-Process\b/.test(l))
    expect(starts, 'Start-Process는 한 줄이다').toHaveLength(1)
    expect(starts[0].trim()).toMatch(/^Start-Process -FilePath \$receptionExe(\s+-WorkingDirectory \$installDir)?$/)
    const start = code.search(/\bStart-Process\b/)
    expect([stop < copy, copy < chrome, chrome < run, run < save, save < start]).toEqual([true, true, true, true, true])
  })

  it('AC-1412.1 uninstall.ps1은 두 프로그램을 먼저 끄고, 설치가 만든 시작 항목과 바탕 화면 바로 가기를 같은 이름·자리에서 지운다', () => {
    const install = psCode(read(INSTALL_PS1))
    const code = psCode(read(UNINSTALL_PS1))
    for (const name of ['helperName', 'receptionName', 'runKey', 'runName', 'shortcutPath']) {
      expect(assignment(code, name), `${name}이 install.ps1과 같다`).toBe(assignment(install, name))
    }
    expectStopsBoth(code, UNINSTALL_PS1)
    const stop = code.search(/\bStop-Process\b/)
    const run = indexOrFail(code, 'Remove-ItemProperty -LiteralPath $runKey -Name $runName', '시작 항목 지우기')
    const lnk = indexOrFail(code, /Remove-Item -LiteralPath \$shortcutPath\b/, '바로 가기 지우기')
    expect(stop).toBeLessThan(run)
    expect(stop).toBeLessThan(lnk)
    expect(stop).toBeLessThan(code.search(/\bRemove-Item\b/))
  })

  it('AC-1412.1 크롬 등록과 data\\는 지금처럼: install.ps1은 아무것도 지우지 않고, uninstall.ps1은 물어본 뒤 예일 때만 data\\를 지운다. 두 파일은 UTF-8 BOM(한글 바로 가기 이름)', () => {
    const install = psCode(read(INSTALL_PS1))
    expect(install).not.toMatch(/Remove-Item|Move-Item|Clear-Content|\]::Delete|\brmdir\b|\brd\s|\bdel\s|\/MIR\b/i)
    expect(install).toMatch(/Get-ChildItem -LiteralPath \$appSource -File \| Copy-Item -Destination \$installDir -Force/)

    const code = psCode(read(UNINSTALL_PS1))
    expect(code).toMatch(/Remove-Item -LiteralPath \$regKey\b/)
    expect(code).toMatch(/Where-Object \{ \$_\.Name -ne 'data' \} \| Remove-Item -Recurse -Force/)
    const ask = indexOrFail(code, DATA_QUESTION, 'data\\ 물음')
    const removals = [...code.matchAll(/Remove-Item\s+(-\w+\s+)*\$dataDir\b/g)].map((m) => m.index ?? -1)
    expect(removals).toHaveLength(1)
    expect(removals[0]).toBeGreaterThan(ask)

    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      expect([...readBytes(file).subarray(0, 3)], file).toEqual([0xef, 0xbb, 0xbf])
    }
  })
})

describe('REQ-1412 내보내기 (.github/workflows/helper.yml zip 단계)', () => {
  it('AC-1412.2 zip 단계는 PrecheckReception.exe·.exe.config(Precheck.Reception.csproj의 이름·net48 출력)를 app\\에 더 넣고, 없으면 멈춘다', () => {
    const run = packRun()
    const exe = `${receptionName()}.exe`
    const bin = `helper/src/Precheck.Reception/bin/Release/${csprojValue(RECEPTION_CSPROJ, 'TargetFramework')}`
    const m = new RegExp(`\\$(\\w+) = '${bin.replace(/[.]/g, '\\.')}'`).exec(run)
    expect(m, `zip 단계에 '${bin}' 자리가 없다`).not.toBeNull()
    const v = (m as RegExpExecArray)[1]

    // 도우미 zip의 app\로 가는 복사만 본다(따로 설치 zip의 $receptionApp 복사는 reception-own-zip.test.ts가 본다, TASK-35)
    const copies = run.split('\n').filter((l) => /\bCopy-Item\b/.test(l) && l.includes(`$${v}/`) && /-Destination \$app\s*$/.test(l))
    expect(copies, '접수 현황 파일 복사는 한 줄이다').toHaveLength(1)
    expect(copies[0]).toContain(`"$${v}/${exe}"`)
    expect(copies[0]).toContain(`"$${v}/${exe}.config"`)
    expect(copies[0]).toMatch(/-Destination \$app\s*$/)

    const checks = run.split('\n').filter((l) => /\bTest-Path\b/.test(l) && l.includes(`$${v}/`))
    expect(checks.length, '접수 현황 파일이 없으면 멈추는 줄이 없다').toBeGreaterThan(0)
    for (const line of checks) expect(line).toContain('throw')

    const helperCopy = indexOrFail(run, 'Copy-Item -Path "$bin/*.exe", "$bin/*.exe.config", "$bin/*.dll" -Destination $app', '도우미 복사')
    expect(run.indexOf(copies[0])).toBeGreaterThan(helperCopy)
    expect(run.indexOf(copies[0])).toBeLessThan(run.search(/Compress-Archive/))
  })

  it('AC-1412.2 helper/install/* 복사로 reception-check.cmd·reception-check.ps1이 푼 폴더에 든다', () => {
    const run = packRun()
    expect(run).toContain("Copy-Item -Path 'helper/install/*' -Destination $stage")
    for (const file of CHECK_FILES) expect(existsSync(path.join(ROOT, file)), file).toBe(true)
  })

  it('AC-1412.2 helper.yml은 zip 단계 말고는 갈림점(git merge-base HEAD origin/main)과 같다: 시험·빌드 단계·태그 규칙·권한 그대로, zip 단계는 줄을 더하기만 한다', () => {
    const before = git('show', `${mergeBase()}:${WORKFLOW}`).split(/\r?\n/)
    const after = read(WORKFLOW).split(/\r?\n/)
    const b = packRange(before)
    const a = packRange(after)
    expect(after.slice(0, a.start)).toEqual(before.slice(0, b.start))
    // zip 단계 뒤에는 따로 설치 zip을 올리는 단계(artifact precheck-reception, TASK-35) 하나만 더 있다
    expect(withoutStep(after.slice(a.end), 'name: precheck-reception')).toEqual(before.slice(b.end))

    const oldCode = before.slice(b.start, b.end).filter(isCodeLine)
    const newCode = after.slice(a.start, a.end).filter(isCodeLine)
    let i = 0
    for (const line of newCode) if (i < oldCode.length && line === oldCode[i]) i++
    expect(oldCode.slice(i), 'zip 단계의 옛 줄이 바뀌거나 빠졌다').toEqual([])
    expect(newCode.length).toBeGreaterThan(oldCode.length)
  })
})

describe('REQ-1412·REQ-1413 바뀌지 않음 (갈림점 git merge-base HEAD origin/main과 비교)', () => {
  function changed(paths: string[]): string[] {
    const base = mergeBase()
    const diff = git('diff', '--name-only', base, '--', ...paths)
    const untracked = git('ls-files', '--others', '--exclude-standard', '--', ...paths)
    return `${diff}\n${untracked}`.split('\n').filter((l) => l.trim() !== '')
  }

  it('AC-1412.3 도우미 버전(helper/Directory.Build.props)·src/lib/bridge/**(versions.ts·commands.json)가 바뀌지 않았다', () => {
    expect(changed(VERSION_PATHS)).toEqual([])
  })

  it('AC-1413.3 크롬 통로(src/lib/bridge/**)·웹사이트 CSP(next.config.ts)·서버 경로(src/app/api/**)가 바뀌지 않았다', () => {
    expect(changed(SITE_PATHS)).toEqual([])
  })
})

describe('REQ-1412·REQ-1411 쉬운 안내 (helper/install/README.md)', () => {
  /** "## 접수 현황" 큰 칸(다음 "## " 전까지) */
  function receptionSection(): string {
    const md = read(README)
    const start = md.search(/^## 접수 현황/m)
    expect(start, 'README에 "## 접수 현황" 칸이 없다').toBeGreaterThanOrEqual(0)
    const rest = md.slice(start + 3)
    const next = rest.search(/^## /m)
    return next < 0 ? md.slice(start) : md.slice(start, start + 3 + next)
  }

  function expectInOrder(text: string, words: string[]): void {
    let at = -1
    for (const word of words) {
      const next = text.indexOf(word, at + 1)
      expect(next, `"${word}"가 앞 단계 뒤에 없다`).toBeGreaterThan(at)
      at = next
    }
  }

  it('AC-1412.4 접수 현황 켜기·끄기: 로그인하면 저절로 켜지고, 바탕 화면 "접수 현황 주소"가 다시 켜며, 작업 관리자로 끄고, 지우기가 시작 항목·바로 가기도 지운다', () => {
    const s = receptionSection()
    expect(s).toMatch(/### 켜기·끄기/)
    expect(s).toMatch(/로그인하면[^\n]*저절로 켜/)
    expect(s).toContain(SHORTCUT_NAME)
    expect(s).toContain('작업 관리자')
    expect(s).toContain(`${receptionName()}.exe`)
    expect(s).toContain('작업 끝내기')
    expect(s).toMatch(/시작 프로그램/)
    const md = read(README)
    const remove = md.slice(md.search(/^## 지우기/m))
    expect(remove).toMatch(/시작 항목/)
    expect(remove).toContain(SHORTCUT_NAME)
  })

  it('AC-1411.6 방화벽 창: "Windows 보안 경고"에서 "개인 네트워크"에 체크하고 [허용], 네트워크가 "공용"이면 "개인"으로 바꾼다(설치 끝 글에도 안내)', () => {
    const s = receptionSection()
    expect(s).toContain('Windows 보안 경고')
    expect(s).toMatch(/개인 네트워크[^\n]*체크[^\n]*\[허용\]/)
    expect(s).toMatch(/공용[^\n]*개인/)
    const install = read(INSTALL_PS1)
    expect(install).toContain('Windows 보안 경고')
    expect(install).toMatch(/개인 네트워크[^\n]*\[허용\]/)
  })

  it('AC-1412.4 공유기에서 이 PC 주소를 고정한다(DHCP 예약)', () => {
    const s = receptionSection()
    expect(s).toContain('공유기')
    expect(s).toContain('DHCP 예약')
    expect(s).toMatch(/주소[^\n]*고정/)
  })

  it('AC-1412.4 휴대폰 첫 열기 차례: 바탕 화면 "접수 현황 주소" → [주소 복사] → 직원 단톡방 → 병원 와이파이에서 주소 누르기 → 카톡 안이면 \'다른 브라우저로 열기\' → 홈 화면에 추가 (QR 없음)', () => {
    const s = receptionSection()
    expectInOrder(s, [SHORTCUT_NAME, '[주소 복사]', '직원 단톡방', '병원 와이파이', '다른 브라우저로 열기', '홈 화면에 추가'])
    expect(s).toMatch(/오른쪽 위 메뉴/)
    expect(read(README)).not.toMatch(/QR/i)
  })

  it('AC-1412.4 아이폰은 처음 한 번 화면을 눌러야 소리가 난다', () => {
    const s = receptionSection()
    expect(s).toMatch(/아이폰[^\n]*처음 한 번[^\n]*눌러야[^\n]*소리/)
  })

  it('AC-1412.4 잠금이 없어 직원 와이파이 비밀번호를 손님에게 알리면 안 된다', () => {
    const s = receptionSection()
    expect(s).toMatch(/잠금/)
    expect(s).toMatch(/직원 와이파이 비밀번호[^\n]*손님[^\n]*안 됩니다/)
  })

  it('AC-1412.4 휴대폰은 5초마다 저절로 바뀌고, 의원 PC에서 5초 → 3초로 비트가 느려지지 않는지 본다', () => {
    const s = receptionSection()
    expect(s).toMatch(/5초마다/)
    expectInOrder(s, ['5초', '비트가 느려지지 않는지', '3초'])
  })
})
