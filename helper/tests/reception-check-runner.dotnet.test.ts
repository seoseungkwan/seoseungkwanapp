// 의원 PC 확인 명령의 확인 차례(TASK-5, REQ-1401)의 C# 시험(helper/tests/Precheck.Core.Tests/Reception/Check/CheckRunner.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// CheckRunner*Tests만(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Check.CheckRunner'
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

describe('REQ-1401 확인 차례 (C# Precheck.Core.Tests.Reception.Check.CheckRunner*)', () => {
  it('AC-1401.2 상태 짝: 짝마다 건수·접수 시각은 콘솔에만, 1~6 번호를 받아 보고서에는 짝·건수·답만', () => {
    expectAc('AC-1401.2')
  })

  it('AC-1401.4 증상 찾기: 어제~7일 전 줄이 있는 첫날의 화면 83, 내원에 붙은 글자 칸마다 견준 수·칸 제목, 로그인 취소는 건너뜀', () => {
    expectAc('AC-1401.4')
  })

  it('AC-1401.5 이름 찾기: PbsInf·OcmInf 글자 칸마다 같은 차트번호의 화면 환자명과 똑같은 수', () => {
    expectAc('AC-1401.5')
  })

  it('AC-1401.6 접수 메모: 친 글(두 글자 이상)을 품은 줄 수, 엔터만은 건너뜀, 친 글은 어디에도 남지 않고 견주기 뒤 버림', () => {
    expectAc('AC-1401.6')
  })

  it('AC-1401.8 빠르기: ReceptionSql 문장마다 ms·줄 수, 등록 확인 한 번, 상태별 처방 있는 접수 수, 옛 자료 따로 있음', () => {
    expectAc('AC-1401.8')
  })

  it('AC-1401.10 센티널: 모든 칸이 센티널인 가짜 DB·화면 83과 센티널 메모 글로 끝까지 돌려도 보고서·콘솔 기록에 없음, 오류는 번호만', () => {
    expectAc('AC-1401.10')
  })

  it('AC-1401.11 시간 제한·순서: 문장 30초·전체 15분(주입한 시계), 실패(번호) 뒤 다음 단계, 줄마다 디스크, 끝나면 경로를 콘솔에', () => {
    expectAc('AC-1401.11')
  })
})
