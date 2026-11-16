// 돌아옴 표시(VisitMark back·backStop·away on/off/clear·칸 쓰기가 센 것을 멈춤·판 back·backWait, reception-arrange-tune TASK-1, REQ-3601)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeBack.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.ArrangeTune.'
let run: { code: number; output: string } = { code: -1, output: '' }

// 잠금 폴더는 이 PC의 모든 작업 폴더가 같이 쓴다. 다른 쪽 dotnet을 기다리는 시간까지 넉넉히 준다
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

describe('REQ-3601 돌아옴 표시 (C# Precheck.Core.Tests.Reception.ArrangeTune)', () => {
  it('AC-3601.1 표시 파일의 back·backStop은 값이 있을 때만 쓰고 옛 파일도 읽히며, "HH:MM"이 아니거나 back 없이 backStop만 있으면 깨진 파일', () => {
    expectAc('AC-3601.1')
  })

  it('AC-3601.2 away on은 back·backStop을 지우고, off는 back = 지금, clear는 away·back·backStop을 모두 지운다', () => {
    expectAc('AC-3601.2')
  })

  it('AC-3601.3 back이 있고 backStop이 없으면 받은 칸 쓰기(X-RAY 칸 포함)가 backStop = 지금, away·ptf·end·/api/xray는 멈추지 않는다', () => {
    expectAc('AC-3601.3')
  })

  it('AC-3601.4 판의 어레인지 줄마다 back·backWait("{시간}째", back이 있고 backStop이 없을 때만)', () => {
    expectAc('AC-3601.4')
  })
})
