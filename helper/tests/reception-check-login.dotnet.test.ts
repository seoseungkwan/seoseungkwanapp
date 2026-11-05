// 의원 PC 확인 명령의 로그인 창 고침(TASK-32, REQ-1401)의 C# 시험을 감싼다:
// CheckLoginWait(LoginWait.test.cs) · CheckLoginRunner(CheckRunner.test.cs) · CheckLoginStart(CheckStart.test.cs).
// 윈도우 부분(CheckLoginWindow·ReceptionCheckEntry)은 글자로 보고, 여기서 buildDotnet으로 도우미가 net48로 컴파일되는지 본다.
// 실제로 창이 가운데·맨 앞에 뜨는지(AC-1401.13)는 의원 PC에서만 증명된다.
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

// CheckLogin*Tests만(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckLogin'
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

describe('REQ-1401 확인 로그인 창 고침 (C# Precheck.Core.Tests.Reception.Check.CheckLogin*)', () => {
  it('AC-1401.14 로그인 창을 띄우기 전에 묻고(엔터 = 띄우기, 0 = 건너뛰기), 0·입력 끝이면 로그인·증상·이름 찾기를 건너뜀, 묻는 시간은 사람 시간', () => {
    expectAc('AC-1401.14')
  })

  it('AC-1401.15 창 없음 60초·전체 5분이면 콘솔에 알리고 실패(번호) 뒤 다음 단계, 새 창마다 가운데·맨 위, 도우미 로그인 길은 그대로', () => {
    expectAc('AC-1401.15')
  })

  it('AC-1401.16 확인 모드는 시작 때 표준 오류를 버려 비트 DLL의 log4net 글이 콘솔에 나오지 않는다', () => {
    expectAc('AC-1401.16')
  })

  it('AC-1401.15 [의원 PC] 확인 로그인 창 코드까지 넣은 도우미가 x86 net48로 컴파일된다(실행은 의원 PC)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
