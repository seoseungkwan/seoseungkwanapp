// 의원 PC 확인 명령의 확인 고침 2(TASK-33, REQ-1401)의 C# 시험을 감싼다: 로그인 기본 건너뛰기(CheckLoginRunner, AC-1401.14),
// 증상 글 세기 틀·단계(CheckSymptom.test.cs, AC-1401.17·AC-1401.9), 단계 순서(CheckRunnerLimit, AC-1401.11).
// 가짜 콘솔·가짜 DB를 바꿨으므로 확인 폴더(Precheck.Core.Tests.Reception.Check)의 시험을 모두 돌린다.
// 윈도우 세션(CheckBitDb)은 글자로 보고, 여기서 buildDotnet으로 도우미가 net48로 컴파일되는지 본다. 실제 칸은 의원 PC(AC-1401.13).
import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { buildDotnet, runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Check'
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

describe('REQ-1401 확인 고침 2: 로그인 기본 건너뛰기·증상 글 SQL 찾기 (C# Precheck.Core.Tests.Reception.Check.*)', () => {
  it('AC-1401.14 로그인은 1일 때만 띄우고 엔터(기본)·그 밖의 글·입력 끝이면 로그인·증상·이름 찾기를 건너뜀', () => {
    expectAc('AC-1401.14')
  })

  it('AC-1401.17 친 증상 글 조각으로 후보 칸마다 지난 14일 줄을 DB 안에서 세고(줄·빈 글 아님·품음·길이), 친 글은 @text로만, 단계 표시 1/8~8/8', () => {
    expectAc('AC-1401.17')
  })

  it('AC-1401.9 증상 글 세기 틀은 이름표의 이름만 [ ]로 넣고 IsTextCount로 확인 모드 세션만 받는다', () => {
    expectAc('AC-1401.9')
  })

  it('AC-1401.11 단계 순서에 증상 글 찾기(메모 다음, 모양 앞)가 들어간다', () => {
    expectAc('AC-1401.11')
  })

  it('AC-1401.17 [의원 PC] 증상 글 세기까지 넣은 도우미가 x86 net48로 컴파일된다(실행은 의원 PC)', () => {
    const built = buildDotnet(HELPER_CSPROJ, { timeoutMs: 560_000 })
    expect(built.code, tail(built.output)).toBe(0)
  }, 580_000)
})
