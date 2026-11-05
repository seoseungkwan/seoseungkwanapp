// 의원 PC 확인 명령의 입구(TASK-6, REQ-1401)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/Check/CheckStart.test.cs)과
// 윈도우 부분 컴파일을 감싼다. Precheck.Windows·Precheck.Helper는 이 서버에서 돌릴 수 없어 C# 시험은 글자로 보고,
// 여기서는 buildDotnet으로 도우미가 net48로 컴파일되는지 본다. 진짜 비트에서 도는지(AC-1401.13)는 의원 PC에서만 증명된다.
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

// CheckStart*Tests만(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckStart'
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

describe('REQ-1401 확인 명령 입구 (C# Precheck.Core.Tests.Reception.Check.CheckStart*)', () => {
  it('AC-1401.1 인자가 정확히 --reception-check 하나 + 콘솔 입력일 때만 확인 모드, Program.cs 분기는 Console.SetOut 앞 한 곳, 시작 파일은 설치 없이 exe를 켠다', () => {
    expectAc('AC-1401.1')
  })

  it('AC-1401.9 CheckBitDb는 실행 전에 확인 문장·찾기 틀·도우미 문장과 매개변수 표를 보고, 도우미 허용 목록은 틀을 받지 않는다', () => {
    expectAc('AC-1401.9')
  })

  it('AC-1401.11 문장 시간 제한을 세션이 지키고, 보고서는 푼 폴더(못 쓰면 임시 폴더)에 열어 끝나면 메모장으로 연다', () => {
    expectAc('AC-1401.11')
  })

  it('AC-1401.12 확인 세션은 ReadOnlyConnection + 되돌리는 트랜잭션, Commit 없음, 등록 확인을 지난다', () => {
    expectAc('AC-1401.12')
  })

  it('AC-1401.13 [의원 PC] 실제 실행은 의원 PC에서 본다. 여기서는 입구 배선과 새는 글이 없는지를 글자로만 본다', () => {
    expectAc('AC-1401.13')
  })

  it('AC-1401.13 [의원 PC] 확인 입구까지 넣은 도우미가 x86 net48로 컴파일된다(CheckBitDb·ReceptionCheckEntry·Program.cs는 이 빌드로만 컴파일된다, 실행은 의원 PC)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
