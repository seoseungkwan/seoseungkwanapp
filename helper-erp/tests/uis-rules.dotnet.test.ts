// spec erp-uisarang TASK-4(REQ-4201·REQ-4202·REQ-4207): 의사랑 작은 규칙 — 의사랑 찾기·엑셀 폴더 고르기·코드 꼴(UisRules)·
// 만 나이(UisAge)·자료원 파일(UisSource)의 C# 시험(helper-erp/tests/Erp.Core.Tests/Uisarang/Rules/*.test.cs,
// 이름 공간 Erp.Core.Tests.Uisarang.Rules — design.md 12-3)을 감싸고, 세 파일이 디스크·환경·보호를 어디까지 쓰는지 파일 글자로 본다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UISARANG = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang')
const FILTER = 'Erp.Core.Tests.Uisarang.Rules'
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', name: string): number {
  const escaped = name.replace(/[.()]/g, (c) => `\\${c}`)
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', `${ac} `), tail(run.output)).toBe(0)
  expect(lines('Passed', `${ac} `), `${ac} 시험이 돌지 않았다\n${tail(run.output)}`).toBeGreaterThan(0)
}

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석과 /// 문서 주석을 지운다(코드 줄만 본다) */
function code(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

const source = (name: string) => code(read(path.join(UISARANG, name)))

describe('REQ-4201 자료원 판별 (C# Erp.Core.Tests.Uisarang.Rules)', () => {
  it('AC-4201.1 UisRules.FindUisarang: <뿌리>\\ysr2000\\Exe\\FStat.exe가 있는 첫 뿌리의 <뿌리>\\ysr2000, 없으면 null, 넘겨받은 뿌리만 보고 대소문자를 가리지 않는다', () => {
    expectAc('AC-4201.1')
  })

  it('AC-4201.3 UisSource: data\\source.json 쓰기·읽기·모양 틀림/없음 = null·지우기(실제 임시 폴더)', () => {
    expectAc('AC-4201.3')
  })
})

describe('REQ-4202 엑셀 폴더 고르기', () => {
  it('AC-4202.1 UisRules.ChooseFolder: 바탕화면이 OneDrive 셋 가운데 하나의 안이거나 비었으면 Profile, 아니면 Desktop', () => {
    expectAc('AC-4202.1')
  })
})

describe('REQ-4207 만 나이', () => {
  it('AC-4207.2 UisAge.Age·Band: 앞 7글자 숫자만, 세기 숫자, 달력·마감 일자 뒤 검사, (마감 − 생년월일) / 10000, 10살 구간', () => {
    expectAc('AC-4207.2')
  })
})

describe('design.md 4-1 코드 꼴과 세 파일의 울타리', () => {
  it('4-1 UisRules.Code(AC-4206.1이 견주는 코드 꼴: 앞뒤 빈칸 뗌·가운데 빈칸 하나로·대문자) C# 시험이 돌고 통과한다', () => {
    expect(run.code, tail(run.output)).toBe(0)
    expect(lines('Failed', 'AC-4206.1 코드 꼴'), tail(run.output)).toBe(0)
    expect(lines('Passed', 'AC-4206.1 코드 꼴'), tail(run.output)).toBeGreaterThanOrEqual(7)
  })

  it('4-1: 세 파일은 namespace Erp.Core.Uisarang이고 네트워크·DB를 쓰지 않는다', () => {
    for (const name of ['UisRules.cs', 'UisAge.cs', 'UisSource.cs']) {
      const text = source(name)
      expect(text, name).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
      for (const banned of ['System.Net', 'SqlConnection', 'HospitalGate', 'HttpClient']) expect(text, `${name} ${banned}`).not.toContain(banned)
    }
  })

  it('AC-4201.1 AC-4202.1 AC-4207.2: UisRules·UisAge는 디스크·환경 값을 직접 보지 않는다(넘겨받은 값과 함수만, 도우미가 로컬 고정 드라이브·바탕화면·OneDrive 값을 넘긴다)', () => {
    for (const name of ['UisRules.cs', 'UisAge.cs']) {
      const text = source(name)
      for (const banned of ['File.', 'Directory.', 'DriveInfo', 'Environment.', 'DateTime.Now', 'DateTime.Today']) {
        expect(text, `${name} ${banned}`).not.toContain(banned)
      }
    }
  })

  it('AC-4201.3: 자료원 파일은 글자 그대로(보호 없음, 환자·병원 정보 없음) — UisSource는 IProtector를 쓰지 않고 세 칸 이름만 쓴다', () => {
    const text = source('UisSource.cs')
    expect(text).not.toMatch(/IProtector|Protect\(|Unprotect\(/)
    expect(text).toContain('"source.json"')
    for (const name of ['"v"', '"source"', '"folder"', '"uisarang"']) expect(text, name).toContain(name)
  })
})
