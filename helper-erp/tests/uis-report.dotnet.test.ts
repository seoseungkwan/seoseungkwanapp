// spec erp-uisarang TASK-3(REQ-4204): 의사랑 보고서 알아보기·라벨·칸 찾기 UisReport의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Uisarang/Report/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Report — design.md 12-3)을 감싼다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const REPORT = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang', 'UisReport.cs')
const FILTER = 'Erp.Core.Tests.Uisarang.Report'
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

describe('REQ-4204 UisReport (C# Erp.Core.Tests.Uisarang.Report)', () => {
  it('AC-4204.1 위에서 30줄 안 머리글 줄을 design.md 5-1 표(있어야·없어야 하는 칸, 빈칸 뺀 글자)로 찾아 여섯 종류 가운데 하나, 맞는 종류가 없거나 둘이면 종류 모름 · 5-4 파일 이름 짐작', () => {
    expectAc('AC-4204.1')
  })

  it('AC-4204.2 머리글 줄 위 […] 라벨: 조회일 from·to(물결 범위·구분 -./), 합계 엑셀은 마감 일자 하루가 아니면 otherDate, 날짜 꼴도 전체도 아닌 라벨 값은 notAll, 라벨 없으면 조건 안 봄', () => {
    expectAc('AC-4204.2')
  })

  it('AC-4204.3 보고서마다 5-3 칸을 이름으로 찾고 없거나 둘이면 그 칸만 MissingColumns, 되풀이 머리글·빈 줄 건너뜀, 숫자 칸 값(쉼표 글자·빈 칸 = 없음)', () => {
    expectAc('AC-4204.3')
  })

  it('AC-4204.4 같은 종류 여럿 가운데 고르기: 조회일이 마감 일자 하루인 시트인가(IsOnDay)', () => {
    expectAc('AC-4204.4')
  })

  it('design.md 4-1: UisReport는 이름 공간 Erp.Core.Uisarang의 static class이고 파일·네트워크·콘솔에 닿지 않는다(줄만 받아 알아본다)', () => {
    const text = code(REPORT)
    expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(text).toMatch(/public static class UisReport\b/)
    expect(text).toMatch(/public static UisSheet Read\(IReadOnlyList<IReadOnlyList<XlsCell>> rows\)/)
    expect(text).toMatch(/public static UisKind\? GuessByName\(string fileName\)/)
    for (const banned of ['System.IO', 'System.Net', 'Console.', 'File.', 'Directory.']) {
      expect(text, banned).not.toContain(banned)
    }
  })
})
