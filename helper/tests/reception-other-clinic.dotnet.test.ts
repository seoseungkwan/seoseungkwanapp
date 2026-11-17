// 다른 병원용 접수 현황 잇기(spec reception-other-clinic TASK-8, REQ-5704·REQ-5705·REQ-5706·REQ-5707)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/Http/OtherClinic.test.cs, OtherClinic 이름 공간)을 감싼다.
// - 끝까지 시험: 가짜 비트·임시 data 폴더로 ReceptionServices와 같은 차례·같은 부품을 이어, 새 병원 처음 켜기 → 판 cfg → 설정 저장 → 다음 판 →
//   로고 올리기(진짜 소켓 포함) → GET /api/logo, 우리 의원 data 폴더면 지금 판과 같은 판, POST /api/lists 404를 본다
// - [의원 PC] AC(AC-5705.5·AC-5706.4·AC-5707.6·AC-5707.7)는 진짜 비트·폰 사진·설치를 의원 PC에서 사람이 본다. 여기서는 그 길이 이어졌는지만 본다
// - AC-5707.8 확인 창 제목은 net48 창(Precheck.Windows)이라 이 서버에서 띄우지 못해 글자로 보고, 컴파일은 reception-host.dotnet.test.ts의 buildDotnet이 본다
// AC마다 그 AC ID가 붙은 C# 시험이 실제로 돌았고 하나도 실패하지 않았는지 본다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.OtherClinic.'
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

describe('REQ-5704 설정 길 잇기 (C# Precheck.Core.Tests.Reception.OtherClinic)', () => {
  it('AC-5704.3 설정 저장 뒤 어느 기기든 다음 GET /api/board부터 새 cfg·picks·칸이 나오고(비트 읽기 캐시와 따로), 어레인지 쓰기도 새 칸을 보며, 새 길은 Host 검사 뒤에 있다', () => {
    expectAc('AC-5704.3')
  })

  it('AC-5704.4 접수 현황 프로그램의 라우터에는 POST /api/lists가 없고(404) reception-lists.dat를 쓰지도 지우지도 않는다', () => {
    expectAc('AC-5704.4')
  })
})

describe('REQ-5705 처방 목록 잇기 (C# Precheck.Core.Tests.Reception.OtherClinic)', () => {
  it('AC-5705.5 [의원 PC] 라우터의 GET /api/codes·/api/code/{c}가 등록 확인을 지나 비트를 읽는다(진짜 코드·이름·내원 수는 의원 PC)', () => {
    expectAc('AC-5705.5')
  })
})

describe('REQ-5706 병원 로고 잇기 (C# Precheck.Core.Tests.Reception.OtherClinic)', () => {
  it('AC-5706.2 라우터·진짜 소켓의 GET /api/logo: 없으면 404, 올리면 200 + 그 형식과 그림, 보안 머리 다섯 개는 다른 답과 같다', () => {
    expectAc('AC-5706.2')
  })

  it('AC-5706.4 [의원 PC] 줄여 보낸 그림(JPEG 1200×300·146KB PNG)이 올라가 모든 기기의 다음 판 cfg.logo가 pic·ver +1이고 GET /api/logo가 그 그림이다(진짜 폰 사진은 의원 PC)', () => {
    expectAc('AC-5706.4')
  })
})

describe('REQ-5707 혼자 설치·등록 잇기 (C# Precheck.Core.Tests.Reception.OtherClinic)', () => {
  it('AC-5707.6 [의원 PC] 새 병원 처음 켜기: 설정 파일을 표시 파일보다 먼저 새 병원 처음 값으로 만들고 다시 켜도 그대로, RegisterEntry는 ReceptionServices.CreateBit 한 곳의 부품을 쓴다(진짜 설치·로그인은 의원 PC)', () => {
    expectAc('AC-5707.6')
  })

  it('AC-5707.7 [의원 PC] 옛 표시·목록 파일이 있는 data 폴더(우리 의원)면 판 JSON이 지금 판과 같고, 고친 목록·품은 로고가 옮겨지며 옛 목록 파일은 그대로다(진짜 PC는 의원 PC)', () => {
    expectAc('AC-5707.7')
  })

  it('AC-5707.8 접수 현황 프로그램의 비트 등록 확인 창 제목은 "접수 현황", 도우미의 확인·진행 창은 "청구메모 도우미" 그대로다(글자 살피기)', () => {
    expectAc('AC-5707.8')
  })
})
