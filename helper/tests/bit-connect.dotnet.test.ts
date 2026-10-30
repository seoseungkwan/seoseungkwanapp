// 비트 찾기·읽기 전용 접속·기관기호(TASK-5, REQ-005)의 C# 시험을 감싼다.
// - Precheck.Core.Tests.Bit(비트 찾기·서버 이름·SQL 허용 목록·범위·기관기호·bit.check)
// - Precheck.Core.Tests.Registration(등록 파일·확인 창 글·bit.register·등록 확인 관문)
// dotnet test를 이름공간마다 한 번 돌리고, AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
// 윈도우 전용 시험(Precheck.Windows.Tests/Connect: DPAPI 왕복·가짜 폴더로 설치 찾기)은 Actions 윈도우에서 돈다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTERS = ['Precheck.Core.Tests.Bit', 'Precheck.Core.Tests.Registration'] as const
let runs: { filter: string; code: number; output: string }[] = []

beforeAll(() => {
  runs = FILTERS.map((filter) => ({ filter, ...runDotnet(filter, { timeoutMs: 280_000 }) }))
}, 600_000)

function count(prefix: 'Passed' | 'Failed', ac: string): number {
  const escaped = ac.replace(/\./g, '\\.')
  const pattern = new RegExp(`^\\s*${prefix} ${escaped}\\b`, 'gm')
  return runs.reduce((sum, run) => sum + (run.output.match(pattern) ?? []).length, 0)
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string) {
  for (const run of runs) expect(run.code, `${run.filter}\n${tail(run.output)}`).toBe(0)
  const all = runs.map((run) => tail(run.output)).join('\n')
  expect(count('Failed', ac), all).toBe(0)
  expect(count('Passed', ac), `${ac} 시험이 돌지 않았다\n${all}`).toBeGreaterThan(0)
}

describe('REQ-005 비트 연결·기관기호 (C# Precheck.Core.Tests.Bit · Registration)', () => {
  it('AC-005.1 가짜 설치 후보·파일 모양으로 원본 InstallationLocator·NativeEnvironmentGuard 규칙대로 고르고, 못 찾으면 E-BIT-NOT-FOUND', () => {
    expectAc('AC-005.1')
  })

  it('AC-005.2 DB 서버는 .·(local)·localhost·이 PC 이름·사설 IPv4(tcp: 허용)만, 그 밖은 E-BIT-DB-FAILED, ConnectTimeout=10', () => {
    expectAc('AC-005.2')
  })

  it('AC-005.3 ReadOnlyGuard: Sql.cs 상수(원본 사본과 공백만 다름)만 정해 둔 매개변수로, 그 밖의 SQL은 돌리지 않음', () => {
    expectAc('AC-005.3')
  })

  it('AC-005.4 범위가 정확히 하나, 기관기호가 모두 8자리 숫자이고 등록한 것과 같을 때만 통과(원본 시험 사례)', () => {
    expectAc('AC-005.4')
  })

  it('AC-005.5 bit.register: 비트 로그인 → PC 확인 창 [확인]일 때만 registration.dat 저장·{registered: true}, 다시 등록은 전·새 값을 함께 보이고 같은 기관기호면 프로필 ID 유지', () => {
    expectAc('AC-005.5')
  })

  it('AC-005.6 읽기·입력 명령 전 오늘 날짜로 다시 확인: 등록 없음 E-BIT-NOT-REGISTERED, 다르면 E-BIT-HOSPITAL-MISMATCH', () => {
    expectAc('AC-005.6')
  })

  it('AC-005.7 bit.check: steps find·db·registration을 {name, ok, code?}로, 실패한 단계 뒤는 ok:false·그 번호, 등록됐으면 병원 이름·기관기호', () => {
    expectAc('AC-005.7')
  })
})
