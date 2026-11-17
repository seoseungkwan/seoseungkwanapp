// 다른 병원용 설정·코드 목록·로고 길 부품과 길별 몸 한도(SettingsRoutes·CodesReader·BodyLimits·ReceptionSql.RecentCodes·CodeName,
// reception-other-clinic TASK-3, REQ-5704·REQ-5705·REQ-5706·AC-5714.2)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/CodesReader.test.cs·Http/SettingsRoutes.test.cs·Http/BodyLimits.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.SettingsRoutes.'
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

describe('REQ-5704 설정 읽기·저장 길 (C# Precheck.Core.Tests.Reception.SettingsRoutes)', () => {
  it('AC-5704.1 GET /api/settings는 200 + 설정 문서 전체이고 쓰기 검사는 읽기 길과 같다', () => {
    expectAc('AC-5704.1')
  })

  it('AC-5704.2 POST /api/settings는 쓰기 검사 403·32768바이트 넘음 413·모양 틀림이나 바꿀 수 없는 것 400·rev 다름 409·아니면 rev +1 저장 204', () => {
    expectAc('AC-5704.2')
  })
})

describe('REQ-5705 처방 코드 목록·이름 길 (C# Precheck.Core.Tests.Reception.SettingsRoutes)', () => {
  it('AC-5705.1 GET /api/codes는 등록 확인 뒤 지난 30일 코드마다 { c, n, v }를 내원 수 많은 순 200개까지(AA로 시작하는 코드 뺌) 준다', () => {
    expectAc('AC-5705.1')
  })

  it('AC-5705.2 GET /api/code/{c}는 퍼센트 풀기 뒤 ^[0-9A-Za-z가-힣_]{1,16}$면 200 { c, n }, 아니면 비트를 읽지 않고 404', () => {
    expectAc('AC-5705.2')
  })

  it('AC-5705.3 이름은 40글자에서 자르고 제어 글자를 빼며, 답·기록에 환자 자료가 없고 읽기 실패·8초 넘음은 503(오류 번호만 기록)', () => {
    expectAc('AC-5705.3')
  })

  it('AC-5705.4 새 문장 RecentCodes·CodeName은 Sql.IsAllowed가 받고 고친 글은 받지 않는다', () => {
    expectAc('AC-5705.4')
  })
})

describe('REQ-5706 병원 로고 길 (C# Precheck.Core.Tests.Reception.SettingsRoutes)', () => {
  it('AC-5706.1 POST /api/logo는 쓰기 검사 403·2097152바이트 넘음 413·형식·첫 바이트·크기 틀림 400·아니면 로고 파일에 쓰고 mode pic·ver +1·setup.logo 참·rev +1로 204', () => {
    expectAc('AC-5706.1')
  })

  it('AC-5706.2 GET /api/logo는 200 + image/png|image/jpeg와 그림, 없으면 404이고 보안 머리 다섯 개는 같다', () => {
    expectAc('AC-5706.2')
  })

  it('AC-5706.3 화면 파일은 .jpg·.jpeg를 내주지 않고 CSP는 그대로다', () => {
    expectAc('AC-5706.3')
  })
})

describe('REQ-5714 기록 (C# Precheck.Core.Tests.Reception.SettingsRoutes)', () => {
  it('AC-5714.2 설정·코드·로고 길 실패 기록에는 오류 번호·건수만 있다', () => {
    expectAc('AC-5714.2')
  })
})
