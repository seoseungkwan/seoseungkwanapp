// 작은 웹 서버의 길 나누기·서버·화면 파일·기록(TASK-14, REQ-1406·REQ-1403·REQ-1404·REQ-1405·REQ-1413)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/Http/ReceptionRouter.test.cs·ReceptionServer.test.cs, Reception/ReceptionText.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Serve 이름 공간에만 있다(같은 Http 폴더의 HttpGate 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Serve.'
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

describe('REQ-1406 의원 와이파이 문: 길 나누기·서버·화면 파일·기록 (C# Precheck.Core.Tests.Reception.Serve)', () => {
  it('AC-1406.4 요청 줄 1KB·머리 8KB를 넘으면 431, 시간 안에 다 오지 않으면 408, 아무것도 안 오면 답 없이 끊고, 32개를 넘는 연결만 끊으며 서버는 계속 돈다', () => {
    expectAc('AC-1406.4')
  })

  it('AC-1406.5 정해 둔 길(화면 파일·/api/board·?fresh=1·상세·찍음 표시·이 PC 자신의 /qr)만 받고 다른 길은 404, 다른 방법은 405, 화면 파일은 넣어 둔 것만 준다', () => {
    expectAc('AC-1406.5')
  })

  it('AC-1406.7 서버 기록에는 오류 번호와 건수만 남고 환자 글자·주소·경로·예외 글이 없다', () => {
    expectAc('AC-1406.7')
  })

  it('AC-1406.8 이 PC 자신이 아닌 곳의 GET /qr은 404다', () => {
    expectAc('AC-1406.8')
  })
})

describe('REQ-1403 새로 고침: 길 나누기는 /api/board?fresh=1만 fresh로 넘긴다', () => {
  it('AC-1403.8 /api/board?fresh=1은 8초 묶음을 건너뛰어 바로 읽고, 다른 질의 글은 404이며 비트를 읽지 않는다', () => {
    expectAc('AC-1403.8')
  })
})

describe('REQ-1404·REQ-1405 상세·찍음 표시 길', () => {
  it('AC-1404.5 그날 열쇠표에 없는·모양이 틀린 열쇠, 음수·숫자 아닌 시작 위치는 비트를 읽지 않고 404다', () => {
    expectAc('AC-1404.5')
  })

  it('AC-1405.5 진료보류가 아닌 줄·그날 없는 열쇠·모양이 틀린 요청은 표시를 바꾸지 않고 400·404다', () => {
    expectAc('AC-1405.5')
  })
})

describe('REQ-1413 환자 자료는 의원 안에서만', () => {
  it('AC-1413.1 접수 현황 프로그램 글자에 비트 DB 말고 바깥으로 나가는 연결 API가 없다', () => {
    expectAc('AC-1413.1')
  })
})
