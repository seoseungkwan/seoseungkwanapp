// 다른 병원용 설정 문서·저장·옮기기·로고 저장(ReceptionSettings·SettingsStore·LogoStore·LogoImage, PickLists.Extra,
// reception-other-clinic TASK-1, REQ-5701·AC-5706.1)와 처음 값 표지(reception-origin.dat, TASK-9, AC-5701.9)의 C# 시험
// (helper/tests/Precheck.Core.Tests/Reception/Settings/*.test.cs)을 감싼다.
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const FILTER = 'Precheck.Core.Tests.Reception.Settings.'
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

describe('REQ-5701 설정 파일 (C# Precheck.Core.Tests.Reception.Settings)', () => {
  it('AC-5701.1 문서는 { rev, logo: { mode, text, ver }, tab, setup: { logo, tab, done }, nextX, cols, picks }뿐이고, rev·ver·nextX는 0 이상 정수, mode는 pic·text·none, text는 null 또는 1~20글자(text면 null 아님)', () => {
    expectAc('AC-5701.1')
  })

  it('AC-5701.2 처음 일곱 칸이 한 번씩, 더한 칸 열쇠 x1~x99(nextX보다 작고 겹침 없음), 12칸까지·보이는 칸 1개 이상, 이름 1~10글자 겹침 없음, kind·steps·show·added·rule 규칙', () => {
    expectAc('AC-5701.2')
  })

  it('AC-5701.3 codes는 대문자로 바꿔 ^[0-9A-Z가-힣_]{1,16}$, 칸 안 겹침 없음, 40개까지, 여러 칸에 같은 코드는 된다', () => {
    expectAc('AC-5701.3')
  })

  it('AC-5701.4 picks는 지금 고르기 목록 + extra(더한 칸 열쇠와 정확히 같은 열쇠 → 이름 0~8개)이고, 옛 목록 읽기 규칙은 그대로다', () => {
    expectAc('AC-5701.4')
  })

  it('AC-5701.5 설정 파일이 없고 접수 현황을 쓴 흔적 파일이 있으면 우리 의원 처음 값(로고 그림 옮김·옛 목록)을 만들어 바로 저장한다', () => {
    expectAc('AC-5701.5')
  })

  it('AC-5701.6 설정 파일도 흔적 파일도 없으면 새 병원 처음 값(로고 없이·setup 거짓·SONO·C-ARM 코드 없음)을 만들어 바로 저장한다', () => {
    expectAc('AC-5701.6')
  })

  it('AC-5701.7 저장은 data\\reception-settings.dat(머리 + DPAPI, 64KB까지)에 임시 파일 → 바꾸기로 쓰고 rev +1, 깨진 파일은 이름을 바꿔 두고 표지대로 다시 만들며 E-STORE-BROKEN만 남긴다', () => {
    expectAc('AC-5701.7')
  })

  it('AC-5701.8 setup.done은 한 번 참이 되면 받은 문서가 거짓이어도 참으로 둔다', () => {
    expectAc('AC-5701.8')
  })

  it('AC-5701.9 처음 값을 만들면 reception-origin.dat(머리 + DPAPI)에 표지 ours·fresh를 쓰고, 다시 만들 때는 표지를 따르며, 설정 파일이 깨졌는데 표지가 없거나 깨졌으면 새 병원 처음 값 + 표지 fresh', () => {
    expectAc('AC-5701.9')
  })
})

describe('REQ-5706 병원 로고 — 그림 검사·로고 파일 (C# Precheck.Core.Tests.Reception.Settings)', () => {
  it('AC-5706.1 image/png·image/jpeg와 그 첫 바이트·그림 크기(가로 1~1200·세로 1~300)만 받고, data\\reception-logo.dat(머리 + DPAPI, 형식 한 바이트 + 그림)에 쓴다', () => {
    expectAc('AC-5706.1')
  })
})
