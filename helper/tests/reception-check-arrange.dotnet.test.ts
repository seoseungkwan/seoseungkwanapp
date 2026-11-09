// 의원 PC 확인 한 단계 더(reception-arrange TASK-2, REQ-3302)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/Check/CheckArrange.test.cs)을 감싼다:
// 어레인지 처방 코드 표(CheckSql.ArrangeCodes + 코드 사전)·부위 칸 찾기(ProbeSql.OrderTextCount)·10/11 단계·build=판+check5.
// 윈도우 세션(CheckBitDb)은 고치지 않는다(IsProbe가 새 틀을 받는다). 여기서 buildDotnet으로 도우미가 net48로 컴파일되는지 본다. 실제 값은 의원 PC(AC-3302.6).
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckArrange'
const HELPER_CSPROJ = path.join('helper', 'src', 'Precheck.Helper', 'Precheck.Helper.csproj')
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

describe('REQ-3302 의원 PC 확인 한 단계 더: 어레인지 처방 코드·부위 칸 (C# Precheck.Core.Tests.Reception.Check.CheckArrange*)', () => {
  it('AC-3302.1 빠르기 앞에 10/11 어레인지 처방 코드 단계가 있고 단계 표시는 1/11~11/11, 첫 줄 build=판+check5', () => {
    expectAc('AC-3302.1')
  })

  it('AC-3302.2 지난 30일 코드마다 코드·코드 사전 이름·내원 수·처방 줄 수·지금 지도의 칸을 내원 수 많은 순 200줄까지 적는다', () => {
    expectAc('AC-3302.2')
  })

  it('AC-3302.3 코드·이름은 정해 둔 모양일 때만 적고 아니면 ?, 숫자는 숫자 형만, 환자 자료는 적지 않는다', () => {
    expectAc('AC-3302.3')
  })

  it('AC-3302.4 SONO1·CARM1 처방 줄의 OdrInf 글자형 칸마다 빈 글 아닌 줄 수·서로 다른 값 수를 숫자로만 적고, 문장은 정해 둔 틀에서만 만든다', () => {
    expectAc('AC-3302.4')
  })

  it('AC-3302.5 이 단계가 실패하거나 30초를 넘으면 실패(번호)·실패(시간 초과)만 적고 빠르기로 간다', () => {
    expectAc('AC-3302.5')
  })

  it('AC-3302.6 [의원 PC] reception-check.cmd가 --reception-check를 부르고 보고서 줄 모양이 정해 둔 틀이다', () => {
    expectAc('AC-3302.6')
  })

  it('AC-3302.6 [의원 PC] 새 확인 단계를 넣은 도우미가 x86 net48로 컴파일된다(실행은 의원 PC)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
