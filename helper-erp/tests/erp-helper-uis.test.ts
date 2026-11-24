// ERP 도우미 입구 — 자료원 갈래·의사랑 등록·설치 글(spec erp-uisarang TASK-15, REQ-4201·REQ-4215, design.md 4-3·10-5)을 파일 글자로 본다.
// - 실행 프로그램(Erp.Helper, net48)은 윈도우에서만 돌고 실제 --register는 비트 로그인 창을 띄우므로 돌리지 않는다. 차례·이름·규칙을 글자로 본다(erp-helper.test.ts 꼴)
// - 비트 갈래는 이 기능 전(efe60061) Program 글자와 견준다: 더한 줄만 다르다(AC-4215.4)
// - install.ps1 등록 결과 글은 윈도우에서 그 부분만 떼어, 출력 줄을 주는 가짜 도우미(.cmd)로 실제로 돌려 본다(설치·레지스트리 쪽은 돌리지 않는다)
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const BEFORE = 'efe60061'
const ERP_HELPER = 'helper-erp/src/Erp.Helper'
const PROGRAM = `${ERP_HELPER}/Program.cs`
const UIS_SERVICES = `${ERP_HELPER}/UisHelperServices.cs`
const STAGE = `${ERP_HELPER}/ErpStage.cs`
const INSTALL_PS1 = 'helper-erp/install/install.ps1'

// design.md 10-5 글
const BEFORE_REGISTER = '이 PC를 등록합니다. 비트 PC면 비트 로그인 창이 뜨니 로그인하고, 병원을 확인한 뒤 [확인]을 누르세요. 의사랑 PC면 창 없이 끝나요.'
const OLD_BEFORE_REGISTER = '이 PC를 등록합니다. 비트 로그인 창이 뜨면 로그인하고, 병원을 확인한 뒤 [확인]을 누르세요.'
const UIS_DESKTOP = '의사랑 PC로 등록했어요. 의사랑 통계 엑셀은 바탕화면 › ERP마감 폴더에 저장해 주세요.'
const UIS_PROFILE_HEAD = '의사랑 PC로 등록했어요. 바탕화면이 OneDrive와 이어져 있어, 환자 엑셀이 인터넷으로 올라가지 않게 엑셀 폴더를 '
const UIS_PROFILE_TAIL = '에 만들었어요. 의사랑 통계 엑셀은 이 폴더에 저장해 주세요.'
const UIS_STEP = '의사랑 등록(엑셀 폴더·자료원 파일)'
const UIS_FOLDER_FAILED = 'ERP마감 엑셀 폴더를 만들지 못했어요. 같은 이름의 파일이 있거나 폴더 만들기가 막혔는지 확인하세요.'
const UIS_STORE_FAILED = '도우미 설정 파일(의사랑 표시)을 쓰거나 지우지 못했어요. 크롬을 모두 닫고, 백신이 막지 않는지 확인한 뒤 install.cmd를 다시 실행하세요.'
// 지금 글(erp-helper.test.ts가 보는 비트 글, 여기서는 의사랑 글과 섞이지 않는지만)
const SAVED = '이 PC를 등록했어요.'
const CANCELLED = '등록을 취소했어요. 다시 하려면 install.cmd를 다시 실행하세요.'
const FAILED = '등록하지 못했어요.'
const NOT_FOUND = '이 PC에서 비트를 찾지 못했어요. 이 PC에서 비트가 켜지는지 확인하세요. 다른 컴퓨터에 깔린 비트를 네트워크로 여는 PC는 안전 때문에 쓸 수 없어요.'
const OTHER = '비트를 확인하다가 문제가 생겼어요.'
const REFRESH = '열어 둔 ERP 마감일지 화면이 있으면 새로고침(F5)하세요.'
const PHOTO = '이 창을 사진으로 찍어 보내 주세요.'

function read(rel: string): string {
  const file = path.join(ROOT, rel)
  if (!existsSync(file)) throw new Error(`${rel} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/^\uFEFF/, '')
}

/** 이 기능 전(efe60061) 파일 글자 */
function before(rel: string): string {
  const run = spawnSync('git', ['show', `${BEFORE}:${rel}`], { cwd: ROOT, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
  if (run.status !== 0) throw new Error(`git show ${BEFORE}:${rel} 실패: ${run.stderr ?? ''}${run.error?.message ?? ''}`)
  return run.stdout.replace(/^\uFEFF/, '')
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

/** signature(또는 그 글자) 뒤 첫 { … } 몸통(짝 맞춤) */
function blockAfter(text: string, signature: RegExp | string): string {
  const start = typeof signature === 'string' ? text.indexOf(signature) : text.search(signature)
  expect(start, `${String(signature)}가 없다`).toBeGreaterThanOrEqual(0)
  const open = text.indexOf('{', start)
  let depth = 0
  for (let i = open; i < text.length; i++) {
    if (text[i] === '{') depth++
    if (text[i] === '}') depth--
    if (depth === 0) return text.slice(open, i + 1)
  }
  throw new Error(`${String(signature)} 몸통이 닫히지 않는다`)
}

const MAIN = /static int Main\(string\[\] args\)/
const REGISTER = /static int Register\(ErpLog log\)/
const REGISTER_UIS = /static int RegisterUisarang\(ErpLog log\)/
const WRITE_ERROR = /private static void WriteRegisterError\(string code\)/
const WRITE_SOURCE = /private static void WriteRegisterSource\(UisFolderKind folder\)/

// Main 비트 갈래: 지금 줄을 자료원 갈래로 감싼다(design.md 4-3)
const MAIN_BRANCH =
  'if (UisSource.Read(ErpServices.DataDirectory()) != null) { UisCommands.RegisterUisarang(dispatcher, UisHelperServices.Create(log.Write)); } ' +
  'else { ClosingCommands.Register(dispatcher, ErpServices.Create()); UisCommands.RegisterBitExtras(dispatcher); }'

describe('AC-4215.4 Program 비트 갈래는 이 기능 전 글자 그대로(더한 줄만 다름)', () => {
  const program = () => code(read(PROGRAM))
  const old = () => code(before(PROGRAM))

  it('AC-4215.4: 크롬이 켤 때 Main은 이 기능 전과 같고, 처리기 줄만 자료원 갈래가 된다: 자료원 파일이 맞으면 의사랑 처리기, 아니면 지금 줄 ClosingCommands.Register(dispatcher, ErpServices.Create()) 그대로 + RegisterBitExtras 한 줄', () => {
    const expected = csBody(blockAfter(old(), MAIN)).replace('ClosingCommands.Register(dispatcher, ErpServices.Create());', MAIN_BRANCH)
    expect(expected).toContain(MAIN_BRANCH)
    expect(csBody(blockAfter(program(), MAIN))).toBe(expected)
    // 자료원 파일은 켤 때 한 번만 읽는다(AC-4201.3)
    expect(program().match(/UisSource\.Read\(/g)).toHaveLength(1)
  })

  it('AC-4215.4: 등록 모드 Register는 이 기능 전과 같고, 비트 저장(true) 뒤 ForgetUisarang 한 줄과 E-BIT-NOT-FOUND일 때만 의사랑으로 가는 catch 하나만 더해진다', () => {
    const expected = csBody(blockAfter(old(), REGISTER))
      .replace('var saved = RegisterFlow.Run(ErpServices.Create());', 'var saved = RegisterFlow.Run(ErpServices.Create()); if (saved) UisHelperServices.ForgetUisarang();')
      .replace('catch (HelperException e) {', 'catch (HelperException e) when (e.Code == BitErrors.NotFound) { return RegisterUisarang(log); } catch (HelperException e) {')
    expect(expected).toContain('if (saved) UisHelperServices.ForgetUisarang();')
    expect(expected).toContain('when (e.Code == BitErrors.NotFound)')
    expect(csBody(blockAfter(program(), REGISTER))).toBe(expected)
  })

  it('AC-4215.4: 등록 오류 알림 WriteRegisterError·IsRegister·종료 번호는 이 기능 전 글자 그대로다', () => {
    expect(csBody(blockAfter(program(), WRITE_ERROR))).toBe(csBody(blockAfter(old(), WRITE_ERROR)))
    for (const line of [
      /static bool IsRegister\(string\[\] args\)[^\n]*/,
      /public const int RegisterSaved = 0;/,
      /public const int RegisterCancelled = 1;/,
      /public const int RegisterFailed = 2;/,
      /public const string RegisterArgument = "--register";/,
    ]) {
      expect(program().match(line)?.[0], String(line)).toBe(old().match(line)?.[0])
    }
  })
})

describe('AC-4201.2 의사랑 등록: 비트를 못 찾았을 때만, 창 없이 폴더·자료원 파일·출력 두 줄', () => {
  const program = () => code(read(PROGRAM))
  const services = () => code(read(UIS_SERVICES))

  it('AC-4201.2: 의사랑 등록은 E-BIT-NOT-FOUND catch 한 곳에서만 부르고, UisHelperServices.Register가 종류를 주면 기록(번호 없음) → 출력 두 줄 → 0', () => {
    const text = program()
    // 부르는 곳은 E-BIT-NOT-FOUND catch 하나(AC-4215.4 시험이 Register 몸통을 글자로 본다)
    expect(text.match(/(?<![.\w])RegisterUisarang\(/g)).toHaveLength(2) // 부르는 곳 하나 + 정의 하나(UisCommands.RegisterUisarang은 다른 것)
    expect(text.match(/return RegisterUisarang\(log\);/g)).toHaveLength(1)
    expect(text.match(/static int RegisterUisarang\(ErpLog log\)/g)).toHaveLength(1)
    expect(text.match(/UisHelperServices\.Register\(\)/g)).toHaveLength(1)
    const body = blockAfter(text, REGISTER_UIS)
    expectOrder(body, ['var folder = UisHelperServices.Register();', 'if (folder != null)', 'log.WriteRegister(null);', 'WriteRegisterSource(folder.Value);', 'return RegisterSaved;'], 'RegisterUisarang')
    expect(body.match(/return RegisterSaved;/g)).toHaveLength(1)
  })

  it('AC-4201.2: 의사랑이 없으면 지금처럼 E-BIT-NOT-FOUND(단계 FIND 그대로)로, 폴더·파일 실패는 그 번호로, 그 밖 예외는 E-BRIDGE-DISCONNECTED로 기록·알림 뒤 2', () => {
    const body = blockAfter(program(), REGISTER_UIS)
    expectOrder(
      body,
      [
        'return RegisterSaved;',
        'code = BitErrors.NotFound;',
        'catch (HelperException e)',
        'code = e.Code;',
        'catch (Exception)',
        'code = ErrorCodes.Disconnected;',
        'log.WriteRegister(code);',
        'WriteRegisterError(code);',
        'return RegisterFailed;',
      ],
      'RegisterUisarang',
    )
    expect(body.match(/return RegisterFailed;/g)).toHaveLength(1)
    // 비트 창(로그인·PC 확인)과 비트 등록 흐름에 닿지 않는다
    expect(body).not.toMatch(/RegisterFlow|ErpServices\.Create|VendorLogin|ConfirmWindow/)
  })

  it('AC-4201.2: 출력은 SOURCE-UISARANG과 FOLDER-DESKTOP 또는 FOLDER-PROFILE 한 줄씩, ASCII로 쓰고 쓰기 실패는 무시한다', () => {
    const text = program()
    expect(text).toMatch(/public const string SourceUisarangLine = "SOURCE-UISARANG";/)
    expect(text).toMatch(/public const string FolderDesktopLine = "FOLDER-DESKTOP";/)
    expect(text).toMatch(/public const string FolderProfileLine = "FOLDER-PROFILE";/)
    const write = blockAfter(text, WRITE_SOURCE)
    expectOrder(
      write,
      ['try', 'SourceUisarangLine + "\\r\\n"', 'folder == UisFolderKind.Profile ? FolderProfileLine : FolderDesktopLine', 'Encoding.ASCII.GetBytes(', 'Console.OpenStandardOutput()', 'catch (Exception)'],
      'WriteRegisterSource',
    )
    // 두 줄은 의사랑 등록 성공 길에서만 쓴다
    expect(text.match(/WriteRegisterSource\(/g)).toHaveLength(2)
  })

  it('AC-4201.2: UisHelperServices.Register 차례: 로컬 고정 드라이브 뿌리로 FindUisarang → 없으면 null → 단계 UIS → 폴더 고르기 → 폴더 만들기 → 자료원 파일 쓰기 → 종류', () => {
    const text = services()
    expect(text).toMatch(/^namespace Erp\.Helper;$/m)
    const body = blockAfter(text, /public static UisFolderKind\? Register\(\)/)
    expectOrder(
      body,
      [
        'if (UisRules.FindUisarang(FixedDriveRoots(), File.Exists) == null) return null;',
        'ErpStage.Set(ErpStage.Uis);',
        'var place = Place();',
        'OpenFolder(place.Path);',
        'ChangeSourceFile(() => UisSource.WriteUisarang(ErpServices.DataDirectory(), place.Kind));',
        'return place.Kind;',
      ],
      'UisHelperServices.Register',
    )
    const drives = blockAfter(text, /private static IEnumerable<string> FixedDriveRoots\(\)/)
    expectOrder(drives, ['DriveInfo.GetDrives()', 'DriveType.Fixed', 'RootDirectory.FullName'], 'FixedDriveRoots')
    expect(drives).not.toMatch(/DriveType\.(Network|Removable|CDRom|Ram|Unknown|NoRootDirectory)/)
  })

  it('AC-4201.2: 폴더 자리는 ChooseFolder(바탕화면, %USERPROFILE%, OneDrive 환경 값 셋)이고 그 아래 UisRules.FolderName, 못 만들면 UisDiskFolder.FolderFailed(E-UIS-FOLDER)', () => {
    const text = services()
    const place = blockAfter(text, /private static UisPlace Place\(\)/)
    expectOrder(
      place,
      [
        'Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory)',
        'Environment.GetEnvironmentVariable("USERPROFILE")',
        'UisRules.ChooseFolder(desktop, profile, CloudRoots.Select(Environment.GetEnvironmentVariable))',
        'Path.Combine(root, UisRules.FolderName)',
      ],
      'Place',
    )
    expect(text).toMatch(/CloudRoots = \{ "OneDrive", "OneDriveCommercial", "OneDriveConsumer" \};/)
    const open = blockAfter(text, /private static IUisFolder OpenFolder\(string\? path\)/)
    expectOrder(open, ['if (path == null) throw new HelperException(UisDiskFolder.FolderFailed);', 'return new UisDiskFolder(path);'], 'OpenFolder')
    // 번호 글자를 따로 두지 않는다
    expect(read(UIS_SERVICES)).not.toContain('"E-UIS-FOLDER"')
    expect(read(PROGRAM)).not.toContain('"E-UIS-FOLDER"')
  })

  it('AC-4201.2: 자료원 파일 쓰기·지우기의 IOException·UnauthorizedAccessException은 E-STORE-FAILED(예외로 끝나지 않음), 비트 저장 뒤 지우기도 단계 UIS', () => {
    const text = services()
    const change = blockAfter(text, /private static void ChangeSourceFile\(Action change\)/)
    expectOrder(
      change,
      ['try', 'change();', 'catch (IOException)', 'throw new HelperException(BitErrors.StoreFailed);', 'catch (UnauthorizedAccessException)', 'throw new HelperException(BitErrors.StoreFailed);'],
      'ChangeSourceFile',
    )
    const forget = blockAfter(text, /public static void ForgetUisarang\(\)/)
    expectOrder(forget, ['ErpStage.Set(ErpStage.Uis);', 'ChangeSourceFile(() => UisSource.Delete(ErpServices.DataDirectory()));'], 'ForgetUisarang')
    // 자료원 파일은 이 두 곳에서만 바꾼다(모두 ChangeSourceFile 안)
    expect(text.match(/UisSource\.(WriteUisarang|Delete)\(/g)).toHaveLength(2)
    expect(text.match(/ChangeSourceFile\(\(\) => UisSource\./g)).toHaveLength(2)
    expect(code(read(PROGRAM))).not.toMatch(/UisSource\.(WriteUisarang|Delete)\(/)
  })

  it('AC-4201.2: ErpStage.Uis = "UIS"이고 UisHelperServices에서만 적는다', () => {
    expect(code(read(STAGE))).toMatch(/public const string Uis = "UIS";/)
    expect(services().match(/ErpStage\.Set\(ErpStage\.Uis\)/g)).toHaveLength(2)
    expect(code(read(PROGRAM))).not.toMatch(/ErpStage\.Set\(/)
  })

  it('AC-4201.2: 크롬이 켤 때 의사랑 부품은 켤 때 고른 폴더(열기는 처리기가 부를 때)·모아 둔 값(DPAPI)·오늘·기록이고, 비트·등록 창·네트워크에 닿지 않는다', () => {
    const text = services()
    const create = blockAfter(text, /public static UisServices Create\(Action<string\?, string\?> log\)/)
    expectOrder(
      create,
      [
        'var place = Place();',
        'var cache = new UisCache(ErpServices.DataDirectory(), new DpapiProtector(), () => DateTime.Now);',
        'return new UisServices(() => OpenFolder(place.Path), place.Kind, cache, () => DateTime.Today, log);',
      ],
      'UisHelperServices.Create',
    )
    for (const banned of [/RegisterFlow/, /VendorLogin/, /ConfirmWindow/, /ErpServices\.Create/, /BitServices/, /System\.Net/, /SqlConnection/, /HospitalGate/, /\bConsole\./]) {
      expect(text, String(banned)).not.toMatch(banned)
    }
  })
})

// ── install.ps1 (design.md 10-5) ────────────────────────────────────────────────

describe('AC-4201.4 install.ps1 의사랑 등록 글', () => {
  const install = () => psCode(read(INSTALL_PS1))

  it('AC-4201.4: 등록 앞 글은 design.md 10-5 글이고 지금 글은 없다', () => {
    expect(install()).toContain(`Write-Host '${BEFORE_REGISTER}'`)
    expect(read(INSTALL_PS1)).not.toContain(OLD_BEFORE_REGISTER)
  })

  it('AC-4201.4: 출력 줄에서 SOURCE-UISARANG·FOLDER-PROFILE을 -ceq로 고르고, 끝 번호 0일 때만 의사랑 글(폴더 두 갈래), 그 밖은 지금 0 글 그대로', () => {
    const text = install()
    expectOrder(text, ["-cmatch '^STEP-[A-Z]+$'", "-ceq 'SOURCE-UISARANG'", "-ceq 'FOLDER-PROFILE'", 'switch ($registerCode)'], 'install.ps1')
    const register = text.slice(text.indexOf('switch ($registerCode)'))
    expectOrder(
      register,
      [
        '{ $_ -eq 0 -and $uisarang }',
        'if ($uisFolderProfile)',
        `'${UIS_PROFILE_HEAD}' + $uisFolder + '${UIS_PROFILE_TAIL}'`,
        `'${UIS_DESKTOP}'`,
        'break',
        `0 { Write-Host '${SAVED}'`,
      ],
      'install.ps1 0',
    )
    expect(text).toContain("$uisFolder = Join-Path $profileDir 'ERP마감'")
  })

  it('AC-4201.4: 멈춘 단계 UIS 이름, E-UIS-FOLDER·단계 UIS의 E-STORE-FAILED 실패 글은 비트 DB 글 뒤·그 밖 글 앞', () => {
    const text = install()
    const failed = text.slice(text.indexOf('default {', text.indexOf('switch ($registerCode)')))
    expectOrder(
      failed,
      [
        `'${FAILED}'`,
        "-ceq 'E-BIT-DB-FAILED'",
        "elseif ($errorNumber -ceq 'E-UIS-FOLDER')",
        `'${UIS_FOLDER_FAILED}'`,
        "elseif ($errorNumber -ceq 'E-STORE-FAILED' -and $stepLine -ceq 'STEP-UIS')",
        `'${UIS_STORE_FAILED}'`,
        `'${OTHER}'`,
      ],
      'install.ps1 default',
    )
    expect(failed).toContain(`'UIS' { '${UIS_STEP}' }`)
  })

  /** 등록 결과 부분(if ($installed) { … })만 떼어 가짜 도우미(.cmd)로 돌린다. 설치·레지스트리·Read-Host 쪽은 돌리지 않는다 */
  function runRegister(lines: string[], exitCode: number, profile: string): { code: number | null; text: string } {
    const block = blockAfter(install(), 'if ($installed) {')
    const dir = mkdtempSync(path.join(tmpdir(), 'erp-uis-install-'))
    try {
      const fake = path.join(dir, 'fake-helper.cmd')
      writeFileSync(fake, ['@echo off', ...lines.map((line) => `echo ${line}`), `exit /b ${exitCode}`, ''].join('\r\n'), 'ascii')
      const script = path.join(dir, 'register.ps1')
      const wrapper = [
        "$ErrorActionPreference = 'Stop'",
        'Set-StrictMode -Version 3.0',
        'try { [Console]::OutputEncoding = New-Object System.Text.UTF8Encoding($false) } catch { }',
        '$exitCode = 0',
        '$installed = $true',
        '$exePath = $env:ERP_FAKE_HELPER',
        `if ($installed) ${block}`,
        'exit $exitCode',
        '',
      ].join('\r\n')
      writeFileSync(script, `\uFEFF${wrapper}`, 'utf8')
      const powershell = path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
      const run = spawnSync(powershell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script], {
        env: { ...process.env, ERP_FAKE_HELPER: fake, USERPROFILE: profile },
        windowsHide: true,
        timeout: 60_000,
      })
      return { code: run.status, text: `${run.stdout?.toString('utf8') ?? ''}${run.stderr?.toString('utf8') ?? ''}` }
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  }

  /** 등록 앞 글(의사랑 낱말이 든다) 뒤의 결과 글. 앞 글이 없으면 실패 */
  function afterIntro(text: string): string {
    const at = text.indexOf(BEFORE_REGISTER)
    expect(at, text).toBeGreaterThanOrEqual(0)
    return text.slice(at + BEFORE_REGISTER.length)
  }

  const PROFILE = 'C:\\가짜 사용자 (1)'
  const win = it.runIf(process.platform === 'win32')

  win('AC-4201.4: (윈도우) 0 + SOURCE-UISARANG + FOLDER-DESKTOP → 바탕화면 의사랑 글, 지금 0 글은 없음, 새로고침 줄·끝 번호 0', () => {
    const run = runRegister(['SOURCE-UISARANG', 'FOLDER-DESKTOP'], 0, PROFILE)
    expect(run.code, run.text).toBe(0)
    expect(run.text).toContain(UIS_DESKTOP)
    expect(run.text).not.toContain(SAVED)
    expect(run.text).not.toContain(UIS_PROFILE_HEAD)
    expect(run.text).toContain(REFRESH)
  }, 90_000)

  win('AC-4201.4: (윈도우) 0 + SOURCE-UISARANG + FOLDER-PROFILE → 사용자 폴더 실제 경로(%USERPROFILE%\\ERP마감) 글', () => {
    const run = runRegister(['SOURCE-UISARANG', 'FOLDER-PROFILE'], 0, PROFILE)
    expect(run.code, run.text).toBe(0)
    expect(run.text).toContain(`${UIS_PROFILE_HEAD}${PROFILE}\\ERP마감${UIS_PROFILE_TAIL}`)
    expect(run.text).not.toContain(UIS_DESKTOP)
    expect(run.text).not.toContain(SAVED)
    expect(run.text).toContain(REFRESH)
  }, 90_000)

  win('AC-4201.4: (윈도우) 0이고 SOURCE-UISARANG이 없으면 지금 글 그대로(의사랑 글 없음)', () => {
    const run = runRegister([], 0, PROFILE)
    expect(run.code, run.text).toBe(0)
    expect(run.text).toContain(SAVED)
    expect(afterIntro(run.text)).not.toContain('의사랑')
    expect(run.text).toContain(REFRESH)
  }, 90_000)

  win('AC-4201.4: (윈도우) 1이면 SOURCE-UISARANG이 있어도 지금 취소 글 그대로·끝 번호 1', () => {
    const run = runRegister(['SOURCE-UISARANG', 'FOLDER-DESKTOP'], 1, PROFILE)
    expect(run.code, run.text).toBe(1)
    expect(run.text).toContain(CANCELLED)
    expect(run.text).not.toContain('의사랑 PC로 등록했어요.')
  }, 90_000)

  win('AC-4201.4: (윈도우) 2 + E-UIS-FOLDER + STEP-UIS → ★ 폴더 실패 글·멈춘 단계 의사랑 등록·오류 번호·사진, 끝 번호 2', () => {
    const run = runRegister(['E-UIS-FOLDER', 'STEP-UIS'], 2, PROFILE)
    expect(run.code, run.text).toBe(2)
    expectOrder(run.text, [FAILED, UIS_FOLDER_FAILED, `멈춘 단계: ${UIS_STEP} (UIS)`, '오류 번호: E-UIS-FOLDER', PHOTO], 'E-UIS-FOLDER')
    expect(run.text).not.toContain(OTHER)
  }, 90_000)

  win('AC-4201.4: (윈도우) 2 + E-STORE-FAILED + STEP-UIS → ★ 자료원 파일 실패 글', () => {
    const run = runRegister(['E-STORE-FAILED', 'STEP-UIS'], 2, PROFILE)
    expect(run.code, run.text).toBe(2)
    expectOrder(run.text, [FAILED, UIS_STORE_FAILED, `멈춘 단계: ${UIS_STEP} (UIS)`, '오류 번호: E-STORE-FAILED', PHOTO], 'E-STORE-FAILED')
    expect(run.text).not.toContain(OTHER)
  }, 90_000)

  win('AC-4201.4: (윈도우) 그 밖 번호는 지금 글 그대로: 비트 단계의 E-STORE-FAILED는 그 밖 글, E-BIT-NOT-FOUND는 비트 못 찾음 글', () => {
    const store = runRegister(['E-STORE-FAILED', 'STEP-LOGIN'], 2, PROFILE)
    expect(store.code, store.text).toBe(2)
    expectOrder(store.text, [FAILED, OTHER, '멈춘 단계: 비트 로그인·병원 확인 (LOGIN)', '오류 번호: E-STORE-FAILED', PHOTO], 'E-STORE-FAILED LOGIN')
    expect(store.text).not.toContain(UIS_STORE_FAILED)
    const missing = runRegister(['E-BIT-NOT-FOUND', 'STEP-FIND'], 2, PROFILE)
    expect(missing.code, missing.text).toBe(2)
    expectOrder(missing.text, [FAILED, NOT_FOUND, '멈춘 단계: 비트 찾기 (FIND)', '오류 번호: E-BIT-NOT-FOUND', PHOTO], 'E-BIT-NOT-FOUND')
    expect(afterIntro(missing.text)).not.toContain('의사랑')
  }, 90_000)
})
