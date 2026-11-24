// spec erp-uisarang TASK-7(REQ-4205·REQ-4206): 합계 엑셀 셈 — 일일수입통계 UisIncome·기간별처방통계 UisRx의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Uisarang/Sums/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Sums — design.md 12-3)을 감싼다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UIS = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang')
const INCOME = path.join(UIS, 'UisIncome.cs')
const RX = path.join(UIS, 'UisRx.cs')
const FILTER = 'Erp.Core.Tests.Uisarang.Sums'
type Run = { code: number; output: string }
let run: Run = { code: -1, output: '' }

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

/** C# 글에서 // 주석을 지운다(코드 줄만 본다) */
function code(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('REQ-4205 UisIncome (C# Erp.Core.Tests.Uisarang.Sums)', () => {
  it("AC-4205.1 일일수입통계는 보험구분 '합계' 줄 하나만 읽고(보험구분 줄을 더하지 않음, 원 미만 버림), '합계' 줄이 없거나 둘이면 모든 값 null + columns '합계'", () => {
    expectAc('AC-4205.1')
  })

  it("AC-4205.2 '합계' 줄 총진료비가 비면 바로 아래 줄 같은 칸(병합 칸), '합계' 줄 칸이 숫자면 그 값, 둘 다 아니면 null", () => {
    expectAc('AC-4205.2')
  })

  it('AC-4205.3 맞춰 보기 totalFee·received·headcount: 다르면 [왼쪽, 오른쪽], 하나라도 null이면 null, 다른 checks 칸은 건드리지 않음', () => {
    expectAc('AC-4205.3')
  })
})

describe('REQ-4206 UisRx (C# Erp.Core.Tests.Uisarang.Sums)', () => {
  it('AC-4206.1 처방통계 코드별 합: 코드 꼴 정리(UisRules.Code)·같은 코드 여러 줄 더함·쪽 머리 되풀이·합계 줄은 코드 아님·총액은 줄마다 원 미만 버림', () => {
    expectAc('AC-4206.1')
  })

  it('AC-4206.2 소수 총투여량은 그대로 두고(버림·반올림 없음) 줄끼리 더해도 소수 셈 오차가 없다', () => {
    expectAc('AC-4206.2')
  })

  it('AC-4206.4 합계 줄 총액 ≠ 코드 줄 총액 합이면 checks.rxTotal = [합계 줄, 코드 줄 합], 합계 줄이 없거나 둘·코드 칸 없음이면 null', () => {
    expectAc('AC-4206.4')
  })

  it('AC-4206.5 (UisRx.List 부분) 코드마다 한 줄·처음 나온 처방명칭·총액 큰 차례(같으면 코드 차례)·2,000개까지·21자 넘는 코드도 목록에', () => {
    expectAc('AC-4206.5')
  })
})

describe('design.md 4-1 UisIncome·UisRx 코드 모양', () => {
  it('이름 공간 Erp.Core.Uisarang의 static class이고 시트(UisSheet)만 받는다: 파일·네트워크·콘솔·SQL에 닿지 않는다', () => {
    const income = code(INCOME)
    const rx = code(RX)
    for (const text of [income, rx]) {
      expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
      for (const banned of ['System.IO', 'System.Net', 'Console.', 'File.', 'Directory.', 'SqlConnection', 'HospitalGate']) {
        expect(text, banned).not.toContain(banned)
      }
    }
    expect(income).toMatch(/public static class UisIncome\b/)
    expect(income).toMatch(/public static IncomeFacts Read\(UisSheet s(heet)?\)/)
    expect(rx).toMatch(/public static class UisRx\b/)
    expect(rx).toMatch(/public static RxFacts Read\(UisSheet s(heet)?\)/)
    expect(rx).toMatch(/public static IReadOnlyList<UisCodeRow> List\(UisSheet s(heet)?\)/)
  })
})
