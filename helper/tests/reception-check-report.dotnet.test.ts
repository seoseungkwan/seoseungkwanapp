// 의원 PC 확인 명령의 확인 보고서(TASK-4, REQ-1401)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/Check/CheckReport.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// CheckReportFieldTests·CheckReportWriteTests·CheckReportPathTests만(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckReport'
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

describe('REQ-1401 확인 보고서 (C# Precheck.Core.Tests.Reception.Check.CheckReport*)', () => {
  it('AC-1401.10 보고서 거르기: 이름 모양·숫자 형·상태 코드 모양·작은 값 목록·아는 화면 83 제목만 지나고 나머지는 ?, 오류는 형 이름·번호만, 센티널이 파일에 없음', () => {
    expectAc('AC-1401.10')
  })

  it('AC-1401.11 보고서 쓰기·자리: 줄마다 Flush(닫기 전에도 디스크에), 실패(번호)·건너뜀, reception-check-yyyyMMdd-HHmmss.txt, 푼 폴더 → 임시 폴더, 있는 파일은 덮지 않음', () => {
    expectAc('AC-1401.11')
  })

  // .NET Framework 4.8의 Path.GetDirectoryName은 빈 글자에 ArgumentException을 던진다(.NET 10은 null). 이 서버는 net10.0만 돌리므로
  // 글자로 본다. 윈도우 Actions net48에서 CheckReportPathTests.FoldersPreferTheUnzippedFolder("" 칸)가 이것으로 실패했다
  it('AC-1401.11 net48: Folders는 빈 app 폴더를 Path.GetDirectoryName에 넘기지 않는다(빈 글자면 임시 폴더만)', () => {
    const cs = readFileSync(path.join(ROOT, 'helper/src/Precheck.Core/Reception/Check/CheckReportPath.cs'), 'utf8')
    const m = /Folders\(string appDirectory, string tempDirectory\)\s*\{([\s\S]*?)\n {4}\}/.exec(cs)
    expect(m, 'CheckReportPath.Folders가 없다').not.toBeNull()
    const body = (m as RegExpExecArray)[1]
    const calls = [...body.matchAll(/Path\.GetDirectoryName\(([^)]*)\)/g)]
    expect(calls, 'Path.GetDirectoryName 부르기는 한 곳이다').toHaveLength(1)
    const arg = calls[0][1].trim()
    expect(arg, '넘기는 값은 이름 붙은 변수 하나다').toMatch(/^\w+$/)
    expect(body).toMatch(new RegExp(`\\b${arg}\\.Length == 0 \\? null : Path\\.GetDirectoryName\\(${arg}\\)`))
  })
})
