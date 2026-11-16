// 작은 웹 서버의 HTTP 읽기·답·문 지키기(TASK-10, REQ-1406)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/Http/HttpRequestReader.test.cs·ClientGuard.test.cs)을 감싼다.
// dotnet test를 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

// 이 TASK의 시험은 HttpGate 이름 공간에만 있다(같은 Http 폴더의 길 나누기·서버 시험은 돌리지 않는다)
const FILTER = 'Precheck.Core.Tests.Reception.HttpGate.'
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

describe('REQ-1406 의원 와이파이 문: HTTP 읽기·답·문 지키기 (C# Precheck.Core.Tests.Reception.HttpGate)', () => {
  it('AC-1406.1 사설 IPv4(10/8·172.16/12·192.168/16)와 이 PC 자신(127/8·::1)만 받고, IPv4가 섞인 IPv6는 풀어서 보며, 172.15·172.32·169.254·공인·IPv6는 받지 않는다', () => {
    expectAc('AC-1406.1')
  })

  it('AC-1406.2 Host는 이 PC의 지금 사설 IPv4 하나 + :47200(이 PC 자신이면 127.0.0.1:47200·localhost:47200)만 받고 다른 이름·모양·두 번 온 Host는 떨어진다', () => {
    expectAc('AC-1406.2')
  })

  it('AC-1406.3 쓰기는 POST에 Origin = http://{Host}, X-Reception: 1, Content-Type: application/json, 몸 8192바이트(AC-3603.5) 이하일 때만 받고(넘으면 413), OPTIONS도 읽으며 어떤 답에도 CORS 머리가 없다', () => {
    expectAc('AC-1406.3')
  })

  it('AC-1406.4 요청 줄 1KB·머리 8KB를 넘으면 431, 정한 시간 안에 다 오지 않으면 408, 아무것도 안 오거나 끊기면 답 없이 끊고, 모양이 틀리면 400이며 다음 연결은 그대로 읽는다', () => {
    expectAc('AC-1406.4')
  })

  it('AC-1406.6 모든 답에 CSP·X-Content-Type-Options: nosniff·Referrer-Policy: no-referrer·Cache-Control: no-store·Connection: close가 있다', () => {
    expectAc('AC-1406.6')
  })
})
