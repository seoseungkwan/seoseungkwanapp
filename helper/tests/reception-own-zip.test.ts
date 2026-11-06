// 접수 현황 따로 설치 zip(TASK-35, design.md 11절 '따로 설치', REQ-1411·REQ-1412·REQ-1413)을 글자로 읽어 검사한다.
// - 의원은 공식 도우미 0.4.0을 그대로 쓰고, 접수 현황은 자기 폴더 %LOCALAPPDATA%\Seoseungkwan\PrecheckReception\에 따로 깐다
// - 윈도우에서 실제로 도는지(시작 항목·바로 가기·방화벽 창)는 의원 PC에서 본다. 이 시험은 파일끼리의 약속(이름·자리·순서·글)만 본다
// - 도우미와 함께 까는 install.ps1·uninstall.ps1·도우미 zip의 약속은 reception-install.test.ts·build.test.ts가 그대로 본다
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const WORKFLOW = '.github/workflows/helper.yml'
const INSTALL_CMD = 'helper/install/install-reception.cmd'
const INSTALL_PS1 = 'helper/install/install-reception.ps1'
const UNINSTALL_CMD = 'helper/install/uninstall-reception.cmd'
const UNINSTALL_PS1 = 'helper/install/uninstall-reception.ps1'
const OWN_FILES = [INSTALL_CMD, INSTALL_PS1, UNINSTALL_CMD, UNINSTALL_PS1]
const HELPER_INSTALL_PS1 = 'helper/install/install.ps1'
const RECEPTION_CSPROJ = 'helper/src/Precheck.Reception/Precheck.Reception.csproj'
const RECEPTION_SERVICES = 'helper/src/Precheck.Reception/ReceptionServices.cs'
const RECEPTION_START = 'helper/src/Precheck.Core/Reception/ReceptionStart.cs'
const REGISTRATION_STORE = 'helper/src/Precheck.Core/Registration/RegistrationStore.cs'
const HELPER_CSPROJ = 'helper/src/Precheck.Helper/Precheck.Helper.csproj'

const RUN_KEY = 'HKCU:\\Software\\Microsoft\\Windows\\CurrentVersion\\Run'
const SHORTCUT_NAME = '접수 현황 주소'
const OWN_DIR = 'Seoseungkwan\\PrecheckReception'
const HELPER_DIR = 'Seoseungkwan\\PrecheckHelper'

function readBytes(rel: string): Buffer {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file)
}

function read(rel: string): string {
  return readBytes(rel).toString('utf8').replace(/^﻿/, '')
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

function csConst(file: string, name: string): string {
  const m = new RegExp(`public const string ${name} = "([^"]+)";`).exec(read(file))
  if (!m) throw new Error(`${file}에 ${name}이 없다`)
  return m[1]
}

const receptionName = () => csprojValue(RECEPTION_CSPROJ, 'AssemblyName')
const linkFlag = () => csConst(RECEPTION_START, 'LinkFlag')

/** `$name = …` 줄 하나(앞뒤 공백 뺌). 없거나 둘 이상이면 실패 */
function assignment(code: string, name: string): string {
  const lines = code
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.startsWith(`$${name} = `))
  expect(lines, `$${name} = … 줄이 하나여야 한다`).toHaveLength(1)
  return lines[0]
}

function indexOrFail(code: string, needle: string | RegExp, what: string): number {
  const at = typeof needle === 'string' ? code.indexOf(needle) : code.search(needle)
  expect(at, `${what}가 없다`).toBeGreaterThanOrEqual(0)
  return at
}

/** 돌던 접수 현황만 찾는 줄: 이름 하나, 이 윈도우 로그인(세션)의 것만 */
function expectStopsReceptionOnly(code: string, file: string): void {
  const lines = code.split('\n').filter((l) => /\bGet-Process\b/.test(l))
  expect(lines, `${file}: Get-Process 줄이 하나여야 한다`).toHaveLength(1)
  expect(lines[0]).toMatch(/-Name \$receptionName -ErrorAction SilentlyContinue/)
  expect(lines[0]).not.toMatch(/helper/i)
  expect(lines[0]).toContain('Where-Object { $_.SessionId -eq $session }')
  expect(code).toContain('$session = [System.Diagnostics.Process]::GetCurrentProcess().SessionId')
  expect(code).toMatch(/\$running \| Stop-Process -Force/)
  expect(code).toMatch(/\$running \| Wait-Process -Timeout \d+/)
}

/** helper 일 zip 단계(Compress-Archive가 있는 단계)의 run 글 */
function packRun(): string {
  const lines = read(WORKFLOW).split(/\r?\n/)
  const at = lines.findIndex((l) => /Compress-Archive/.test(l))
  if (at < 0) throw new Error(`${WORKFLOW}에 Compress-Archive가 없다`)
  const stepStart = /^ {6}- /
  let start = at
  while (start > 0 && !stepStart.test(lines[start])) start--
  let end = at + 1
  while (end < lines.length && !stepStart.test(lines[end]) && !/^ {0,4}\S/.test(lines[end])) end++
  return lines.slice(start, end).join('\n')
}

/** helper.yml의 단계 하나(`      - ` 줄부터 다음 단계·다음 일 전까지) 가운데 needle이 든 것 */
function stepWith(needle: string): string {
  const lines = read(WORKFLOW).split(/\r?\n/)
  const at = lines.findIndex((l) => l.includes(needle))
  if (at < 0) throw new Error(`${WORKFLOW}에 ${needle}이 없다`)
  const stepStart = /^ {6}- /
  let start = at
  while (start > 0 && !stepStart.test(lines[start])) start--
  let end = at + 1
  while (end < lines.length && !stepStart.test(lines[end]) && !/^ {0,4}\S/.test(lines[end])) end++
  return lines.slice(start, end).join('\n')
}

// ── 시험 ──────────────────────────────────────────────────────────────────────

describe('REQ-1412 따로 설치 파일 (helper/install/install-reception·uninstall-reception)', () => {
  it('AC-1412.1 네 파일이 있고, .cmd는 같은 이름 .ps1을 부르는 ASCII 한 줄, .ps1은 UTF-8 BOM이다', () => {
    for (const [cmd, ps1] of [
      [INSTALL_CMD, 'install-reception.ps1'],
      [UNINSTALL_CMD, 'uninstall-reception.ps1'],
    ]) {
      const bytes = readBytes(cmd)
      expect([...bytes].every((b) => b < 0x80), `${cmd}는 ASCII뿐이다(cmd는 한글·BOM을 못 읽는다)`).toBe(true)
      const lines = bytes
        .toString('ascii')
        .split(/\r?\n/)
        .filter((l) => l.trim() !== '')
      expect(lines).toEqual([`@powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0${ps1}"`])
    }
    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      expect([...readBytes(file).subarray(0, 3)], file).toEqual([0xef, 0xbb, 0xbf])
    }
  })

  it('AC-1412.1 두 .ps1에는 관리자 권한 명령이 없다(HKLM·RunAs·방화벽 규칙·네트워크 바꾸기·작업 스케줄러·모든 사용자 바탕 화면 없음, 레지스트리는 HKCU만)', () => {
    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      const raw = read(file)
      expect(raw, file).not.toMatch(/#Requires\s+-RunAsAdministrator/i)
      expect(raw, file).not.toMatch(
        /HKLM|HKEY_LOCAL_MACHINE|RunAsAdministrator|-Verb\s+RunAs|\bnetsh\b|NetFirewall|NetConnectionProfile|schtasks|ScheduledTask|CommonDesktop|AllUsers|\$env:PUBLIC|\$env:ProgramData|ProgramFiles|New-Service|\bsc(\.exe)?\s+create\b/i,
      )
      const drives = [...psCode(raw).matchAll(/\b(HK[A-Z_]+):/g)].map((m) => m[1])
      expect(new Set(drives), file).toEqual(new Set(['HKCU']))
    }
  })

  it('AC-1412.1 자기 폴더는 %LOCALAPPDATA%\\Seoseungkwan\\PrecheckReception\\이고, 도우미 폴더에는 쓰지도 지우지도 않는다', () => {
    for (const file of [INSTALL_PS1, UNINSTALL_PS1]) {
      const code = psCode(read(file))
      expect(assignment(code, 'installDir')).toBe(`$installDir = Join-Path $env:LOCALAPPDATA '${OWN_DIR}'`)
      for (const line of code.split('\n').filter((l) => /\b(Copy-Item|Remove-Item|New-Item|Set-Content|Out-File|Move-Item)\b/.test(l))) {
        expect(line, `${file}: 도우미 폴더를 바꾸는 줄`).not.toMatch(/\$helperDir|PrecheckHelper/)
      }
    }
  })

  it('AC-1412.1 install-reception.ps1은 도우미(PrecheckHelper.exe)와 이 PC 의원 등록(data\\registration.dat)이 없으면 쉬운 한 줄로 알리고 아무것도 바꾸기 전에 멈춘다', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(assignment(code, 'helperDir')).toBe(`$helperDir = Join-Path $env:LOCALAPPDATA '${HELPER_DIR}'`)
    const helperExe = `${csprojValue(HELPER_CSPROJ, 'AssemblyName')}.exe`
    const registration = csConst(REGISTRATION_STORE, 'FileName')
    const exeCheck = indexOrFail(code, `Test-Path -LiteralPath (Join-Path $helperDir '${helperExe}')`, '도우미 exe 확인')
    const regCheck = indexOrFail(code, `Test-Path -LiteralPath (Join-Path $helperDir 'data\\${registration}')`, '등록 파일 확인')
    const message = indexOrFail(code, '도우미를 먼저 설치하고', '도우미 먼저 안내')
    expect(code.slice(message - 200, message)).toContain('throw')
    const firstChange = Math.min(
      indexOrFail(code, /\bStop-Process\b/, '끄기'),
      indexOrFail(code, /\bCopy-Item\b/, '덮어쓰기'),
      indexOrFail(code, /\bSet-ItemProperty\b/, '시작 항목'),
    )
    expect(Math.max(exeCheck, regCheck, message)).toBeLessThan(firstChange)
  })

  it('AC-1412.1 PrecheckReception.exe는 등록 파일·엑스레이 표시를 exe 자리가 아닌 도우미 data\\ 고정 경로에서 찾는다(따로 깔아도 같은 파일)', () => {
    const cs = read(RECEPTION_SERVICES)
    const m = /public static string DataDirectory\(\) =>\s*([^;]+);/.exec(cs)
    expect(m, 'ReceptionServices.DataDirectory가 없다').not.toBeNull()
    const body = (m as RegExpExecArray)[1]
    expect(body).toContain('Environment.SpecialFolder.LocalApplicationData')
    expect(body).toContain('"Seoseungkwan", "PrecheckHelper", "data"')
    expect(body).not.toMatch(/BaseDirectory|Assembly|Location/)
  })

  it('AC-1412.1 install-reception.ps1은 이 로그인의 PrecheckReception만 끄고 자기 폴더에 덮어쓴다. 도우미를 끄거나 크롬 등록을 건드리지 않는다', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(assignment(code, 'receptionName')).toBe(`$receptionName = '${receptionName()}'`)
    expectStopsReceptionOnly(code, INSTALL_PS1)
    expect(code).not.toMatch(/\$helperName|NativeMessagingHosts|host-manifest|\$regKey|\$manifestPath/)
    expect(code).toMatch(/Get-ChildItem -LiteralPath \$appSource -File \| Copy-Item -Destination \$installDir -Force/)
    expect(code).not.toMatch(/Remove-Item|Move-Item|Clear-Content|\]::Delete|\brmdir\b|\brd\s|\bdel\s|\/MIR\b/i)
    const check = indexOrFail(code, 'Join-Path $appSource "$receptionName.exe"', 'app\\의 PrecheckReception.exe 확인')
    expect(check).toBeLessThan(code.search(/\bStop-Process\b/))
    expect(code.search(/\bStop-Process\b/)).toBeLessThan(code.search(/\bCopy-Item\b/))
  })

  it('AC-1411.2 시작 항목은 install.ps1과 같은 이름(HKCU …\\Run, $runName)에 따옴표로 감싼 자기 폴더 PrecheckReception.exe 경로만(인자 없음) 쓴다', () => {
    const code = psCode(read(INSTALL_PS1))
    const together = psCode(read(HELPER_INSTALL_PS1))
    expect(assignment(code, 'runKey')).toBe(`$runKey = '${RUN_KEY}'`)
    expect(assignment(code, 'runName')).toBe(assignment(together, 'runName'))
    expect(assignment(code, 'receptionExe')).toBe('$receptionExe = Join-Path $installDir "$receptionName.exe"')
    const sets = code.split('\n').filter((l) => /\bSet-ItemProperty\b/.test(l))
    expect(sets, 'Set-ItemProperty는 시작 항목 한 줄뿐이다').toHaveLength(1)
    expect(sets[0].trim()).toBe(`Set-ItemProperty -LiteralPath $runKey -Name $runName -Value ('"' + $receptionExe + '"')`)
  })

  it('AC-1411.3 바탕 화면 "접수 현황 주소" 바로 가기(WScript.Shell .lnk): 대상은 자기 폴더 PrecheckReception.exe, 인자는 --link(ReceptionStart.LinkFlag)', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(linkFlag()).toBe('--link')
    expect(assignment(code, 'shortcutPath')).toBe(
      `$shortcutPath = Join-Path ([Environment]::GetFolderPath('Desktop')) '${SHORTCUT_NAME}.lnk'`,
    )
    expect(code).toContain('$shell = New-Object -ComObject WScript.Shell')
    expect(code).toContain('$shortcut = $shell.CreateShortcut($shortcutPath)')
    expect(code).toContain('$shortcut.TargetPath = $receptionExe')
    expect(code).toContain(`$shortcut.Arguments = '${linkFlag()}'`)
    expect(code).toContain('$shortcut.WorkingDirectory = $installDir')
    expect(code).toContain('$shortcut.Save()')
  })

  it('AC-1412.1 install-reception.ps1 차례: 도우미 확인 → 끄기 → 덮어쓰기 → 시작 항목 → 바로 가기 → 켜기(인자·관리자 권한 없이)', () => {
    const code = psCode(read(INSTALL_PS1))
    const helper = indexOrFail(code, '$helperDir', '도우미 확인')
    const stop = indexOrFail(code, /\bStop-Process\b/, '끄기')
    const copy = indexOrFail(code, /\bCopy-Item\b/, '덮어쓰기')
    const run = indexOrFail(code, 'Set-ItemProperty -LiteralPath $runKey', '시작 항목')
    const save = indexOrFail(code, '$shortcut.Save()', '바로 가기 저장')
    const starts = code.split('\n').filter((l) => /\bStart-Process\b/.test(l))
    expect(starts, 'Start-Process는 한 줄이다').toHaveLength(1)
    expect(starts[0].trim()).toBe('Start-Process -FilePath $receptionExe -WorkingDirectory $installDir')
    const start = code.search(/\bStart-Process\b/)
    expect([helper < stop, stop < copy, copy < run, run < save, save < start]).toEqual([true, true, true, true, true])
  })

  it('AC-1411.6 설치 끝 글: "Windows 보안 경고" 창에서 "개인 네트워크"에 체크하고 [허용], 바탕 화면 "접수 현황 주소"로 주소 보내기', () => {
    const code = psCode(read(INSTALL_PS1))
    expect(code).toContain("'Windows 보안 경고'")
    expect(code).toContain("'개인 네트워크'")
    expect(code).toContain('[허용]')
    expect(code).toContain(`'${SHORTCUT_NAME}'`)
  })

  it('AC-1412.1 uninstall-reception.ps1: 이 로그인의 PrecheckReception만 끄고 → 시작 항목·바로 가기를 같은 이름·자리에서 지우고 → 자기 폴더만 지운다(도우미·data\\·크롬 등록은 그대로)', () => {
    const install = psCode(read(INSTALL_PS1))
    const code = psCode(read(UNINSTALL_PS1))
    for (const name of ['receptionName', 'runKey', 'runName', 'shortcutPath', 'installDir']) {
      expect(assignment(code, name), `${name}이 install-reception.ps1과 같다`).toBe(assignment(install, name))
    }
    expectStopsReceptionOnly(code, UNINSTALL_PS1)
    expect(code).not.toMatch(/\$helperName|NativeMessagingHosts|\$regKey|\$dataDir|\$helperDir/)
    const stop = code.search(/\bStop-Process\b/)
    const run = indexOrFail(code, 'Remove-ItemProperty -LiteralPath $runKey -Name $runName -Force', '시작 항목 지우기')
    const lnk = indexOrFail(code, 'Remove-Item -LiteralPath $shortcutPath -Force', '바로 가기 지우기')
    const dir = indexOrFail(code, 'Remove-Item -LiteralPath $installDir -Recurse -Force', '자기 폴더 지우기')
    expect([stop < run, run < lnk, lnk < dir]).toEqual([true, true, true])
    const removes = code.split('\n').filter((l) => /\bRemove-Item\b/.test(l))
    for (const line of removes) expect(line).toMatch(/Remove-Item -LiteralPath \$(shortcutPath|installDir)\b/)
    // 지우는 폴더 안에서 열린 창이어도 지울 수 있게 다른 곳으로 옮겨 간다
    expect(code.indexOf('Set-Location -LiteralPath $env:TEMP')).toBeLessThan(dir)
  })
})

describe('REQ-1412 따로 설치 zip (.github/workflows/helper.yml)', () => {
  it('AC-1412.1 zip 단계가 precheck-reception-<Version>.zip을 더 만든다: app\\에 Precheck.Reception net48 출력의 exe·config·DLL, 맨 위에 네 파일', () => {
    const run = packRun()
    const bin = `helper/src/Precheck.Reception/bin/Release/${csprojValue(RECEPTION_CSPROJ, 'TargetFramework')}`
    expect(run).toContain(`$receptionBin = '${bin}'`)
    expect(run).toContain("$receptionStage = Join-Path $env:RUNNER_TEMP 'precheck-reception'")
    expect(run).toContain("$receptionApp = Join-Path $receptionStage 'app'")
    const exe = `${receptionName()}.exe`
    expect(run).toContain(
      `Copy-Item -Path "$receptionBin/${exe}", "$receptionBin/${exe}.config", "$receptionBin/*.dll" -Destination $receptionApp`,
    )
    expect(run).toContain(`Copy-Item -LiteralPath ${OWN_FILES.map((f) => `'${f}'`).join(', ')} -Destination $receptionStage`)
    expect(run).toContain('Compress-Archive -Path "$receptionStage/*" -DestinationPath "dist/precheck-reception-$version.zip"')
    // 도우미 zip을 만든 뒤에 만든다(도우미 zip 줄은 그대로)
    expect(run.indexOf('precheck-reception-$version.zip')).toBeGreaterThan(run.indexOf('Compress-Archive -Path "$stage/*"'))
  })

  it('AC-1412.1 따로 설치 zip은 artifact precheck-reception으로 올라간다(없으면 실패)', () => {
    const step = stepWith('name: precheck-reception')
    expect(step).toMatch(/- uses: actions\/upload-artifact@v4\b/)
    expect(step).toContain('path: dist/precheck-reception-*.zip')
    expect(step).toContain('if-no-files-found: error')
    // 도우미 artifact는 도우미 zip만 담는다(이름 겹침 없음)
    expect(stepWith('name: precheck-helper')).toContain('path: dist/precheck-helper-*.zip')
  })
})
