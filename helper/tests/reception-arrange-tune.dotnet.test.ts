// 돌아옴 표시(VisitMark back·backStop·away on/off/clear·칸 쓰기가 센 것을 멈춤·판 back·backWait, reception-arrange-tune TASK-1, REQ-3601)와
// 고르기 목록 넓히기·칸 글 모양·몸 한도(PickLists 새 무리·ReceptionLists 옛 파일·ArrangeChoices.AddOf/IsDetail·MaxBody 8192, TASK-2, REQ-3603)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeBack.test.cs·ArrangeTuneLists.test.cs)을 감싼다.
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

describe('REQ-3603 고르기 목록 넓히기 (C# Precheck.Core.Tests.Reception.ArrangeTune)', () => {
  it('AC-3603.1 기본값에 PT·도수·충격파(타수·부위 수)·견인(차례 고정), 넷이 모두 없는 옛 목록 파일은 그 넷만 기본값, 일부만 있으면 깨진 파일', () => {
    expectAc('AC-3603.1')
  })

  it('AC-3603.2 새 무리 이름 규칙·개수(PT 1~8·도수 1~8·타수 0~8·부위 수 1~8·견인 1~8), 판 picks·POST /api/lists 몸은 여섯 무리 모두(빠지면 400)', () => {
    expectAc('AC-3603.2')
  })

  it('AC-3603.3 add PT·도수·견인 = 지금 목록 이름 하나, 충격파 = 부위 수 또는 "{타수} {부위 수}", 어긋나면 400', () => {
    expectAc('AC-3603.3')
  })

  it('AC-3603.4 칸 글(det)은 모양만 본다(직접 칸 1~21글자·"|"·제어 글자 없음, 다른 칸 ""), 목록 밖 칸 글도 읽히고 바뀐다', () => {
    expectAc('AC-3603.4')
  })

  it('AC-3603.5 읽기 한도 8192바이트(넘으면 413), /api/lists 8192·/api/xray 256·/api/arrange 1024', () => {
    expectAc('AC-3603.5')
  })
})
