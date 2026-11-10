// vitest 감싸개 공용(ERP 도우미): C# 시험(helper-erp/tests/Erp.Core.Tests)을 dotnet test로, ERP 도우미 csproj를 dotnet build로 부른다.
// helper/tests/runDotnet.ts를 옮겨 온 것이고(기존 것은 고치지 않는다) 부르는 프로젝트만 다르다(spec erp-closing-fill TASK-11).
// - dotnet은 PATH와 $HOME/.dotnet/dotnet에서 찾는다. 없으면 E-NO-DOTNET (실행 못 함은 RED가 아니다)
// - 잠금 폴더(os.tmpdir()/precheck-dotnet.lock)로 한 번에 하나만 돈다. 기존 도우미 감싸개와 같은 잠금이다:
//   ERP 시험도 기존 Precheck.Core를 빌드하므로 vitest가 두 쪽 감싸개를 나란히 돌려도 같은 obj/bin에서 부딪히지 않게
import { spawnSync } from 'node:child_process'
import { accessSync, constants, mkdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PROJECT = path.join('helper-erp', 'tests', 'Erp.Core.Tests')
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

/** pid 파일 없이(또는 빈 채로) 이보다 오래된 잠금 폴더는 잡다가 죽은 것으로 본다(mkdir 뒤 pid를 쓰기 전 아주 잠깐만 없다) */
const PID_GRACE_MS = 30_000

/**
 * 잠금 폴더를 버려도 되나: pid 파일의 프로세스가 없거나 pid가 틀렸으면 true.
 * pid 파일이 없거나 비어 있으면 막 잡은 참일 수 있어 폴더 시각이 graceMs보다 오래됐을 때만 true.
 */
export function lockIsStale(lockDir: string, graceMs: number = PID_GRACE_MS): boolean {
  let text = ''
  try {
    text = readFileSync(path.join(lockDir, 'pid'), 'utf8').trim()
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') return false
  }
  if (text === '') {
    try {
      return Date.now() - statSync(lockDir).mtimeMs > graceMs
    } catch {
      // 폴더가 그새 사라졌으면 버릴 것도 없다(다음 mkdir이 잡는다)
      return false
    }
  }
  const pid = Number(text)
  if (!Number.isInteger(pid) || pid <= 0) return true
  try {
    process.kill(pid, 0)
    return false
  } catch (error) {
    // EPERM = 살아 있지만 다른 사용자의 프로세스
    return (error as NodeJS.ErrnoException).code !== 'EPERM'
  }
}

/**
 * 버려진 잠금 폴더를 넘겨받는다(지웠으면 true). 넘겨받기 표시 폴더(`<lockDir>.takeover`)를 mkdir로 잡은
 * 한 쪽만 잠금을 다시 확인하고 지운다. 그래서 두 쪽이 같은 잠금을 버려졌다고 봐도, 늦은 쪽이 먼저 쪽의
 * 새 잠금을 지우지 않는다. 표시가 이미 있으면(다른 쪽이 넘겨받는 중) 아무것도 지우지 않는다.
 * 표시는 넘겨받는 동안(아주 잠깐)만 있다. 그사이 죽어 남은 표시는 지우지 않는다(acquireLock 시간 초과 글이 알려 준다)
 */
export function takeOverStaleLock(lockDir: string): boolean {
  const mark = `${lockDir}.takeover`
  try {
    mkdirSync(mark)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EEXIST') return false
    throw error
  }
  try {
    if (!lockIsStale(lockDir)) return false
    rmSync(lockDir, { recursive: true, force: true })
    return true
  } finally {
    rmSync(mark, { recursive: true, force: true })
  }
}

function acquireLock(timeoutMs: number): void {
  const deadline = Date.now() + timeoutMs
  for (;;) {
    try {
      mkdirSync(LOCK)
      // pid는 임시 파일에 다 쓴 뒤 이름을 바꿔 넣는다: 다른 쪽이 반쯤 쓴 pid를 읽지 않게
      writeFileSync(path.join(LOCK, 'pid.tmp'), String(process.pid))
      renameSync(path.join(LOCK, 'pid.tmp'), path.join(LOCK, 'pid'))
      return
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
    }
    if (takeOverStaleLock(LOCK)) continue
    if (Date.now() > deadline) {
      throw new Error(`잠금 폴더 ${LOCK}을 ${timeoutMs}ms 동안 잡지 못했다(${LOCK}.takeover가 오래 남아 있으면 지운다)`)
    }
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
 * helper-erp/ 안의 csproj 하나를 Release로 빌드한다. dotnet test와 같은 obj/를 쓰므로 같은 잠금 안에서 돈다.
 * 출력 자리는 csproj가 정한 그대로(bin/Release/<TargetFramework>/)다.
 */
export function buildDotnet(project: string, opts?: { timeoutMs?: number }): { code: number; output: string } {
  if (!/^helper-erp\/[A-Za-z0-9_./-]+\.csproj$/.test(project.split(path.sep).join('/')) || project.includes('..')) {
    throw new Error(`빌드할 프로젝트 경로가 틀렸다: ${project}`)
  }
  return spawnDotnet(['build', project, '-c', 'Release'], opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS)
}
