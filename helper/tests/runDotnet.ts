// vitest 감싸개 공용: 도우미 C# 시험(helper/tests/Precheck.Core.Tests)을 dotnet test로, 도우미 csproj를 dotnet build로 부른다.
// - dotnet은 PATH와 $HOME/.dotnet/dotnet에서 찾는다. 없으면 E-NO-DOTNET (실행 못 함은 RED가 아니다)
// - 잠금 폴더(os.tmpdir()/precheck-dotnet.lock)로 한 번에 하나만 돈다. vitest가 감싸개 파일을 나란히 돌려도
//   dotnet build·test가 같은 obj/bin에서 부딪히지 않게
import { spawnSync } from 'node:child_process'
import { accessSync, constants, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT = path.join('helper', 'tests', 'Precheck.Core.Tests')
const LOCK = path.join(os.tmpdir(), 'precheck-dotnet.lock')
const DEFAULT_TIMEOUT_MS = 300_000

function isExecutable(file: string): boolean {
  try {
    accessSync(file, constants.X_OK)
    return true
  } catch {
    return false
  }
}

function findDotnet(): string {
  const name = process.platform === 'win32' ? 'dotnet.exe' : 'dotnet'
  const dirs = (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)
  dirs.push(path.join(os.homedir(), '.dotnet'))
  for (const dir of dirs) {
    const candidate = path.join(dir, name)
    if (isExecutable(candidate)) return candidate
  }
  throw new Error('E-NO-DOTNET: dotnet을 찾지 못했다. ~/.dotnet에 .NET 10 SDK를 설치한다(design.md 14절)')
}

function sleep(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/** pid 파일 없이 이보다 오래된 잠금 폴더는 잡다가 죽은 것으로 본다(mkdir 뒤 pid를 쓰기 전 아주 잠깐만 없다) */
const PID_GRACE_MS = 30_000

/**
 * 잠금 폴더를 버려도 되나: pid 파일의 프로세스가 없거나 pid가 틀렸으면 true.
 * pid 파일이 없으면 막 잡은 참일 수 있어 폴더 시각이 graceMs보다 오래됐을 때만 true.
 */
export function lockIsStale(lockDir: string, graceMs: number = PID_GRACE_MS): boolean {
  let text: string
  try {
    text = readFileSync(path.join(lockDir, 'pid'), 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
    try {
      return Date.now() - statSync(lockDir).mtimeMs > graceMs
    } catch {
      // 폴더가 그새 사라졌으면 버릴 것도 없다(다음 mkdir이 잡는다)
      return false
    }
  }
  const pid = Number(text.trim())
  if (!Number.isInteger(pid) || pid <= 0) return true
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    // EPERM = 살아 있지만 다른 사용자의 프로세스
    return (error as NodeJS.ErrnoException).code !== 'EPERM'
  }
}

function acquireLock(timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      mkdirSync(LOCK)
      writeFileSync(path.join(LOCK, 'pid'), String(process.pid))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    if (lockIsStale(LOCK)) {
      rmSync(LOCK, { recursive: true, force: true })
      continue
    }
    if (Date.now() > deadline) throw new Error(`잠금 폴더 ${LOCK}을 ${timeoutMs}ms 동안 잡지 못했다`)
    sleep(250)
  }
}

function releaseLock(): void {
  rmSync(LOCK, { recursive: true, force: true })
}

/** 잠금 안에서 dotnet을 한 번 부른다. 남은 시간은 잠금을 기다린 시간을 뺀 것 */
function spawnDotnet(args: string[], timeoutMs: number): { code: number; output: string } {
  const dotnet = findDotnet()
  const started = Date.now()

  acquireLock(timeoutMs)
  try {
    const result = spawnSync(dotnet, args, {
      cwd: ROOT,
      encoding: 'utf8',
      timeout: Math.max(1_000, timeoutMs - (Date.now() - started)),
      maxBuffer: 64 * 1024 * 1024,
      env: {
        ...process.env,
        DOTNET_ROOT: process.env.DOTNET_ROOT ?? path.dirname(dotnet),
        DOTNET_CLI_TELEMETRY_OPTOUT: '1',
        DOTNET_NOLOGO: '1',
        DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1',
        DOTNET_CLI_UI_LANGUAGE: 'en',
        VSLANG: '1033',
      },
    })
    const output = `${result.stdout ?? ''}${result.stderr ?? ''}`
    if (result.error) return { code: -1, output: `${output}\n${result.error.message}` }
    return { code: result.status ?? -1, output }
  } finally {
    releaseLock()
  }
}

export function runDotnet(filter: string, opts?: { timeoutMs?: number }): { code: number; output: string } {
  if (!/^[A-Za-z0-9_.]+$/.test(filter)) throw new Error(`시험 거르기 이름이 틀렸다: ${filter}`)
  const run = spawnDotnet(
    ['test', PROJECT, '-f', 'net10.0', '--filter', `FullyQualifiedName~${filter}`, '--logger', 'console;verbosity=normal'],
    opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  )
  // 거르기에 맞는 시험이 하나도 없으면 dotnet test는 0으로 끝난다. 아무것도 시험하지 않은 것은 통과가 아니다
  if (run.code === 0 && /No test matches the given testcase filter/.test(run.output)) return { ...run, code: 1 }
  return run
}

/**
 * helper/ 안의 csproj 하나를 Release로 빌드한다(AC-005.8). dotnet test와 같은 obj/를 쓰므로 같은 잠금 안에서 돈다.
 * 출력 자리는 csproj가 정한 그대로(bin/Release/<TargetFramework>/)다.
 */
export function buildDotnet(project: string, opts?: { timeoutMs?: number }): { code: number; output: string } {
  if (!/^helper\/[A-Za-z0-9_./-]+\.csproj$/.test(project.split(path.sep).join('/')) || project.includes('..')) {
    throw new Error(`빌드할 프로젝트 경로가 틀렸다: ${project}`)
  }
  return spawnDotnet(['build', project, '-c', 'Release'], opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
}
