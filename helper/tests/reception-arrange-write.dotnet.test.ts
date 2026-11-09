// 쓰기 길(POST /api/arrange·ArrangeWrite·판의 arrange, reception-arrange TASK-7, REQ-3306)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeWrite.test.cs, Http/ArrangeRoute.test.cs)을 감싼다.
// 접수 현황 프로그램(Precheck.Reception, net48)이 새 연결로 컴파일되는지도 buildDotnet으로 본다.
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeWriting.'
const RECEPTION_CSPROJ = path.join('helper', 'src', 'Precheck.Reception', 'Precheck.Reception.csproj')
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 서버의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 560_000 })
}, 580_000)

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

describe('REQ-3306 어레인지 쓰기 길 (C# Precheck.Core.Tests.Reception.ArrangeWriting)', () => {
  it('AC-3305.1 어레인지 표시를 넘긴 라우터의 /api/board는 arrange를 더하고 넘기지 않으면 지금 답 그대로', () => {
    expectAc('AC-3305.1')
  })

  it('AC-3306.1 POST /api/arrange 몸 모양·쓰기 검사·403·400·404·204·503', () => {
    expectAc('AC-3306.1')
  })

  it('AC-3306.2 op마다 받는 칸·글(step·set·add·remove·part·away·ptf·end)', () => {
    expectAc('AC-3306.2')
  })

  it('AC-3306.3 시각은 서버 시계, 앞 단계로 돌아가면 뒤 단계 시각을 지움(ready는 readyAt 남김)', () => {
    expectAc('AC-3306.3')
  })

  it('AC-3306.4 X-RAY 완료·되돌리기는 XrayMarks', () => {
    expectAc('AC-3306.4')
  })

  it('AC-3306.5 처방도 표시도 없는 칸의 step·set·part는 404', () => {
    expectAc('AC-3306.5')
  })

  it('AC-3306.6 기록에는 오류 번호만', () => {
    expectAc('AC-3306.6')
  })

  it('AC-3306.1 [의원 PC] 접수 현황 프로그램이 새 쓰기 길을 넣어 x86 net48로 컴파일된다', () => {
    const built = buildDotnet(RECEPTION_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
