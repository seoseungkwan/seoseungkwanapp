// 도우미 메시지 틀(TASK-1, REQ-001)의 C# 시험(helper/tests/Precheck.Core.Tests/Protocol/*.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeAll, describe, expect, it } from 'vitest'
import { lockIsStale, runDotnet, takeOverStaleLock } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Protocol'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', ac), tail(run.output)).toBe(0)
  expect(lines('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-001 도우미 메시지 틀 (C# Precheck.Core.Tests.Protocol)', () => {
  it('AC-001.1 4바이트 길이 + UTF-8 JSON을 봉투로 풀고, 길이 0·틀린 JSON은 E-HELPER-BAD-MESSAGE 뒤 다음 메시지, 64MiB 초과는 본문을 읽지 않고 끝남', () => {
    expectAc('AC-001.1')
  })

  it('AC-001.2 표에 없는 cmd는 E-HELPER-UNKNOWN-COMMAND, 틀린 칸·payload는 E-HELPER-BAD-MESSAGE, 도우미 표 = commands.json', () => {
    expectAc('AC-001.2')
  })

  it('AC-001.3 호출 origin이 chrome-extension://<EXTENSION_ID>/가 아니면 아무 메시지도 처리하지 않고 끝남', () => {
    expectAc('AC-001.3')
  })

  it('AC-001.4 hello → result {helperVersion(Directory.Build.props), protocol(commands.json)}', () => {
    expectAc('AC-001.4')
  })

  it('AC-001.5 환자 자료 답은 머리 포함 1,000,000바이트 이하 chunk(seq 0부터) … end {count, bytes, sha256}, 이으면 같음', () => {
    expectAc('AC-001.5')
  })

  it('AC-001.6 표준 출력은 메시지 틀만, 진단 기록은 시각·명령 이름·오류 번호만(가짜 환자 글자 없음)', () => {
    expectAc('AC-001.6')
  })

  // spec patients-bit-lists: 명령 이름은 그대로, contact.targets kind 값만 더한다
  it('AC-2801.5 contact.targets kind는 followup·injection·lapsed·reservation(1,100일 한도 그대로), 그 밖은 E-HELPER-BAD-MESSAGE', () => {
    expectAc('AC-2801.5')
  })
})

// 감싸개 공용 잠금 폴더(runDotnet.ts): 잡은 프로세스가 죽었거나, pid 파일 없이 오래 남은 폴더는 버린다.
// 버리기(넘겨받기)는 넘겨받기 표시(<잠금>.takeover)를 잡은 한 쪽만 한다. 시험은 임시 lockDir()만 쓴다(공용 잠금은 건드리지 않음)
describe('runDotnet 잠금 폴더', () => {
  const made: string[] = []

  function lockDir(): string {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'precheck-lock-test-'))
    made.push(dir)
    const lock = path.join(dir, 'lock')
    mkdirSync(lock)
    return lock
  }

  afterEach(() => {
    for (const dir of made.splice(0)) rmSync(dir, { recursive: true, force: true })
  })

  it('pid 파일이 없는 잠금 폴더는 막 잡은 참이면 살아 있고, 30초가 지나면 버린다', () => {
    const lock = lockDir()
    expect(lockIsStale(lock)).toBe(false)

    const old = (Date.now() - 60_000) / 1000
    utimesSync(lock, old, old)
    expect(lockIsStale(lock)).toBe(true)
  })

  it('pid 파일의 프로세스가 살아 있으면 두고, 없는 프로세스면 버린다', () => {
    const lock = lockDir()
    writeFileSync(path.join(lock, 'pid'), String(process.pid))
    expect(lockIsStale(lock)).toBe(false)

    writeFileSync(path.join(lock, 'pid'), '2147483646')
    expect(lockIsStale(lock)).toBe(true)

    writeFileSync(path.join(lock, 'pid'), 'not a pid')
    expect(lockIsStale(lock)).toBe(true)
  })

  it('pid 파일이 비어 있으면(쓰는 중) 없는 것처럼 막 잡은 참으로 보아 버리지도 넘겨받지도 않고, 30초가 지나면 버린다', () => {
    const lock = lockDir()
    writeFileSync(path.join(lock, 'pid'), '')
    expect(lockIsStale(lock)).toBe(false)
    expect(takeOverStaleLock(lock)).toBe(false)
    expect(readFileSync(path.join(lock, 'pid'), 'utf8')).toBe('')

    const old = (Date.now() - 60_000) / 1000
    utimesSync(lock, old, old)
    expect(lockIsStale(lock)).toBe(true)
  })

  it('다른 쪽이 넘겨받는 중(<잠금>.takeover가 있음)이면 죽은 pid 잠금도 지우지 않는다', () => {
    const lock = lockDir()
    writeFileSync(path.join(lock, 'pid'), '2147483646')
    mkdirSync(`${lock}.takeover`)

    expect(takeOverStaleLock(lock)).toBe(false)
    expect(readFileSync(path.join(lock, 'pid'), 'utf8')).toBe('2147483646')
    expect(existsSync(`${lock}.takeover`)).toBe(true)
  })

  it('넘겨받는 쪽이 없으면 죽은 pid 잠금을 지우고, 넘겨받기 표시도 남기지 않는다', () => {
    const lock = lockDir()
    writeFileSync(path.join(lock, 'pid'), '2147483646')

    expect(takeOverStaleLock(lock)).toBe(true)
    expect(existsSync(lock)).toBe(false)
    expect(existsSync(`${lock}.takeover`)).toBe(false)
  })

  it('살아 있는 잠금은 넘겨받지 않고, 넘겨받기 표시도 남기지 않는다', () => {
    const lock = lockDir()
    writeFileSync(path.join(lock, 'pid'), String(process.pid))

    expect(takeOverStaleLock(lock)).toBe(false)
    expect(readFileSync(path.join(lock, 'pid'), 'utf8')).toBe(String(process.pid))
    expect(existsSync(`${lock}.takeover`)).toBe(false)
  })
})
