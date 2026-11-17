// 다른 병원용 칸 일반화(열쇠 글 칸·여러 칸 맞춤·단계·판 cfg, ArrangeLayout·ArrangeBuilder·ArrangeWrite·ArrangeMarks·Board.ToJson,
// reception-other-clinic TASK-2, REQ-5702·REQ-5703)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/ArrangeColumns.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Columns.'
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

describe('REQ-5702 처방 맞춤 (C# Precheck.Core.Tests.Reception.Columns)', () => {
  it('AC-5702.1 처방 하나는 보이는 rx 칸 가운데 codes에 든 칸 모두(xray rule이면 G 촬영 코드도), mn·숨긴 칸은 아님', () => {
    expectAc('AC-5702.1')
  })

  it('AC-5702.2 우리 의원 처음 값은 지금 ArrangeMap과 같은 칸에 넣는다', () => {
    expectAc('AC-5702.2')
  })

  it('AC-5702.3 같은 칸에 든 처방 여럿은 칸마다 하나, 가장 이른 시각', () => {
    expectAc('AC-5702.3')
  })
})

describe('REQ-5703 칸·단계·판 cfg (C# Precheck.Core.Tests.Reception.Columns)', () => {
  it('AC-5703.1 판 맨 위 cfg { logo, tab, guide, cols }, tab이 거짓이면 arrange·picks 없음', () => {
    expectAc('AC-5703.1')
  })

  it('AC-5703.2 cells 열쇠 = cfg.cols의 k, 단계 2·3, ord는 단계 3 처방 칸마다', () => {
    expectAc('AC-5703.2')
  })

  it('AC-5703.3 보이는 칸이 아니면 400, 단계 2 칸의 ready는 400', () => {
    expectAc('AC-5703.3')
  })

  it('AC-5703.4 칸마다 add의 v·t 모양(목록 이름 "|", 충격파 타수|부위, C-ARM 여러 시술·약재)', () => {
    expectAc('AC-5703.4')
  })

  it('AC-5703.5 칸 표시 파일의 열쇠 모양·칸 글 조각·C-ARM 12줄', () => {
    expectAc('AC-5703.5')
  })

  it('AC-5703.6 판 picks는 지금 모양 + extra(보이는 더한 칸만)', () => {
    expectAc('AC-5703.6')
  })
})
