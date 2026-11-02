// 도우미 작업 저장(TASK-15, REQ-015)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Store(가짜 암호화 IProtector로 WorkStore·store.save·store.load)
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 실제 DPAPI 왕복(Precheck.Windows.Tests/Store)은 Actions 윈도우에서 돈다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const WORK_STORE = path.join(ROOT, 'helper', 'src', 'Precheck.Core', 'Store', 'WorkStore.cs')
const HELPER_STORE = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Commands', 'HelperStore.cs')
const PROGRAM = path.join(ROOT, 'helper', 'src', 'Precheck.Helper', 'Program.cs')
const STORE_COMMANDS = path.join(ROOT, 'helper', 'src', 'Precheck.Core', 'Store', 'StoreCommands.cs')

let run: { code: number; output: string } = { code: -1, output: '' }

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(count('Failed', ac), tail(run.output)).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

describe('REQ-015 도우미 작업 저장 (C# Precheck.Core.Tests.Store)', () => {
  // 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
  beforeAll(() => {
    run = runDotnet('Precheck.Core.Tests.Store', { timeoutMs: 560_000 })
  }, 580_000)

  it('AC-015.1 store.save는 work-YYYY-MM.dat·contact.dat에 머리 + 암호화로 쓰고, 임시 파일 뒤 바꿔치기, .bak 하나, 보낸 칸만 합친다', () => {
    expectAc('AC-015.1')
  })

  it('AC-015.2 store.load는 그 달들의 저장 내용을 조각으로, 파일이 없으면 빈 내용', () => {
    expectAc('AC-015.2')
  })

  it('AC-015.3 깨진 파일이면 맞는 .bak을 쓰고, 아니면 E-STORE-BROKEN. 깨진 파일은 이름만 바꿔 둔다', () => {
    expectAc('AC-015.3')
  })

  it('AC-015.4 다른 병원의 저장 내용은 읽지도 덮어쓰지도 않고 E-BIT-HOSPITAL-MISMATCH', () => {
    expectAc('AC-015.4')
  })

  it('AC-015.5 store.save를 처리할 때 13개월보다 오래된 work-*.dat만 지운다', () => {
    expectAc('AC-015.5')
  })

  it('AC-015.6 가짜 암호화로 저장 뒤 다시 읽으면 같은 내용, 평문은 디스크에 남지 않는다', () => {
    expectAc('AC-015.6')
  })

  it('AC-015.7 store.save {settings}는 settings.dat에 두고 store.load {settings: true}로 돌려준다', () => {
    expectAc('AC-015.7')
  })

  it('AC-035.6 store.save와 .bak으로 되살리는 store.load는 잠금을 잡은 동안에만 파일을 쓴다', () => {
    expectAc('AC-035.6')
  })
})

// ── 글자 시험: 실행으로 드러나지 않는 것(윈도우 없이 글자로 증명, AC-005.11과 같은 방식) ──

/** 주석(//·///·블록 주석)을 뺀 C# 글자. 문자열 안의 //는 이 파일들에 없어 따로 다루지 않는다 */
function code(file: string): string {
  return readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
}

describe('REQ-015 WorkStore.cs 쓰는 길 (글자)', () => {
  const store = code(WORK_STORE) + code(path.join(path.dirname(WORK_STORE), 'WorkStoreRecords.cs'))

  it('AC-015.1 바꿔치기는 File.Replace(임시 파일, 본 파일, .bak)이고 본 파일에 바로 쓰는 길이 없다', () => {
    expect(store).toContain('File.Replace(temporary, path, kept)')
    expect(store).toContain('ReplaceFile(temporary, path, path + BackupSuffix)')
    expect(store).not.toMatch(/File\.(WriteAll\w*|AppendAll\w*|Create\w*|Open\w*)\s*\(/)
    expect(store).not.toMatch(/new\s+StreamWriter\b/)
    expect(store.match(/new\s+FileStream\s*\(/g)).toHaveLength(1)
    expect(store).toContain('new FileStream(temporary, FileMode.CreateNew,')
    expect(store.match(/File\.Copy\s*\([^)]*\)/g)).toEqual(['File.Copy(backup, temporary)'])
  })

  it('AC-015.6 임시 파일에는 머리와 암호문만 쓰고, 그 파일은 암호화가 끝난 뒤에야 만든다', () => {
    expect([...store.matchAll(/output\.Write\((\w+),/g)].map((m) => m[1])).toEqual(['HeaderBytes', 'cipher'])
    const protect = store.indexOf('protector.Protect(')
    expect(protect).toBeGreaterThan(-1)
    expect(protect).toBeLessThan(store.indexOf('new FileStream(temporary'))
  })
})

describe('REQ-015 도우미가 store.* 명령을 실제로 붙인다 (글자)', () => {
  it('AC-035.6 도우미의 store.* 처리기는 따로 정하지 않으면 진짜 작업 잠금을 5초까지 기다린다', () => {
    expect(code(STORE_COMMANDS)).toContain('WorkLock.TryAcquire(WorkLock.StoreSaveWait)')
  })

  it('AC-015.1 AC-015.2 Program.cs가 메시지 고리 전에 HelperStore.Register를 부른다(빠지면 웹은 E-HELPER-UNKNOWN-COMMAND를 사본 없음으로 본다, AC-013.9)', () => {
    const program = code(PROGRAM)
    expect(program.match(/HelperStore\.Register\(dispatcher\);/g)).toHaveLength(1)
    expect(program.indexOf('HelperStore.Register(dispatcher);')).toBeLessThan(program.indexOf('MessageLoop.Run('))
  })

  it('AC-015.1 HelperStore는 도우미 저장 폴더·DPAPI로 store.* 처리기를 붙인다', () => {
    const helper = code(HELPER_STORE)
    expect(helper).toContain('StoreCommands.Register(dispatcher, Open)')
    expect(helper).toContain('HelperServices.DataDirectory()')
    expect(helper).toContain('new DpapiProtector()')
  })
})
