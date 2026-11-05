// 주소 보내기 화면 LinkPage(/link, TASK-25, REQ-1411·REQ-1406)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/LinkPage.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 Link 이름 공간에만 있다(같은 폴더의 다른 TASK 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.Link.'
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

describe('REQ-1411·REQ-1406 주소 보내기 화면 /link (C# Precheck.Core.Tests.Reception.Link)', () => {
  it('AC-1411.4 사설 IPv4 주소마다 큰 전체 주소 링크 + [주소 복사], 순서 넷, 와이파이 안내(8절 글 그대로), 사설 주소가 없으면 연결 안내, QR 없음, CSP에 맞는 HTML(이스케이프)', () => {
    expectAc('AC-1411.4')
  })

  it('AC-1406.8 라우터에 이으면 이 PC 자신의 GET /link만 이 화면이고, 이 PC 자신이 아닌 곳은 404, /qr은 없다', () => {
    expectAc('AC-1406.8')
  })
})
