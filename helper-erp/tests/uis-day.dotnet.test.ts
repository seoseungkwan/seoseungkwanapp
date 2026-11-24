// spec erp-uisarang TASK-13(REQ-4202·REQ-4206·REQ-4207·REQ-4209·REQ-4210): 의사랑 명령 — 한 번 읽기 차례(UisDay)·코드 목록(UisCodes)·
// 처리기(UisCommands)의 C# 시험(helper-erp/tests/Erp.Core.Tests/Uisarang/Day/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Day — design.md 12-3)을 감싸고,
// C#이 만든 답 봉투를 확장의 답 검사 readUisDay(extension-erp/src/uisCells.ts, TASK-5)에 넣어 본다(도우미 답 = 확장이 받는 모양).
// AC-4210.5는 Uisarang 폴더 코드 글자(네트워크·SQL·등록 관문·비트 부품 없음)로 본다.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readUisDay } from '../../extension-erp/src/uisCells'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UISARANG = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang')
const NEW_FILES = ['UisDay.cs', 'UisCodes.cs', 'UisCommands.cs', 'UisServices.cs'].map((name) => path.join(UISARANG, name))
const FILTER = 'Erp.Core.Tests.Uisarang.Day'
const REPLIES = mkdtempSync(path.join(os.tmpdir(), 'erp-uis-replies-'))
let run: { code: number; output: string } = { code: -1, output: '' }

beforeAll(() => {
  // C# 시험이 답 봉투를 이 폴더에 '{날짜}__{이름}.json'으로 남긴다(DayKit.Dump)
  process.env.ERP_UIS_REPLY_DIR = REPLIES
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

afterAll(() => {
  delete process.env.ERP_UIS_REPLY_DIR
  rmSync(REPLIES, { recursive: true, force: true })
})

function lines(prefix: 'Passed' | 'Failed', name: string): number {
  const escaped = name.replace(/[.()]/g, (c) => `\\${c}`)
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string, atLeast = 1) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', `${ac} `), tail(run.output)).toBe(0)
  expect(lines('Passed', `${ac} `), `${ac} 시험이 다 돌지 않았다\n${tail(run.output)}`).toBeGreaterThanOrEqual(atLeast)
}

function source(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석을 지운다(코드 줄만 본다) */
function code(file: string): string {
  return source(file)
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('REQ-4202 엑셀 폴더 열림·지우기·남기기 (C# Erp.Core.Tests.Uisarang.Day)', () => {
  it('AC-4202.3 열린 엑셀이 하나라도 있으면 아무것도 읽거나 지우지 않고 uis.open(closing.uisCodes는 state open)', () => {
    expectAc('AC-4202.3', 2)
  })

  it('AC-4202.4 5-5 표대로: 환자별은 알아본 바로 뒤 · 합계는 다 읽은 뒤 지움, 날짜 다름·같은 날 둘은 남김, notAll·깨짐·종류 모름·20MB 넘음은 지움, 그날 것 하나 고르기', () => {
    expectAc('AC-4202.4', 12)
  })
})

describe('REQ-4206·REQ-4207 셈 (C#)', () => {
  it('AC-4206.3 물리치료내원 = ptVisit 총투여량 합, 재진 = 재진수 − 물리치료내원(음수·소수면 null)', () => {
    expectAc('AC-4206.3', 2)
  })

  it('AC-4206.5 closing.uisCodes: 처방통계 하나 → ok 코드 목록(지움), missing·notAll(지움)·twice(남김)·open, 다른 합계 엑셀은 그대로', () => {
    expectAc('AC-4206.5', 5)
  })

  it('AC-4207.4 진찰료 산정안함 = 환자 합계 − (초진수 + 재진수), 음수면 null + negative', () => {
    expectAc('AC-4207.4')
  })
})

describe('REQ-4209 환자별 엑셀 지키기 (C#)', () => {
  it('AC-4209.1 답·기록 줄·모아 둔 값·예외 글에 환자 표시 글자가 없다(성공·날짜 다름·종류 모름·깨짐·같은 종류 둘)', () => {
    expectAc('AC-4209.1', 2)
  })

  it('AC-4209.2 환자별 엑셀 Delete는 그 Read 바로 다음, 실제 임시 폴더로도 끝난 뒤 없다', () => {
    expectAc('AC-4209.2', 2)
  })

  it('AC-4209.4 의사랑 명령 진단 기록은 시각·명령 이름·오류 번호뿐', () => {
    expectAc('AC-4209.4')
  })
})

describe('REQ-4210 도우미 명령과 답 모양 (C#)', () => {
  it('AC-4210.2 자료원 두 갈래: 의사랑(source·day·uisCodes, codes·findCodes = WRONG-SOURCE) · 비트(지금 처리기 + source bit · uisCodes = WRONG-SOURCE)', () => {
    expectAc('AC-4210.2', 3)
  })

  it('AC-4210.3 답 모양·groups 차례·오늘 뒤 날짜·같은 key 둘·음수와 소수는 null', () => {
    expectAc('AC-4210.3', 10)
  })

  it('AC-4210.3 C#이 만든 의사랑 closing.day 답 봉투가 모두 확장 readUisDay를 지난다(= E-BRIDGE-BAD-REPLY가 아니다)', () => {
    expect(run.code, tail(run.output)).toBe(0)
    const files = readdirSync(REPLIES).filter((name) => name.endsWith('.json'))
    expect(files.length, files.join(', ')).toBeGreaterThanOrEqual(12)
    for (const file of files) {
      const date = file.split('__')[0]
      const envelope = JSON.parse(readFileSync(path.join(REPLIES, file), 'utf8')) as { type: string; data: unknown }
      expect(envelope.type, file).toBe('result')
      expect(readUisDay(envelope.data, date), file).not.toBeNull()
      // 다른 날짜로 물으면 받지 않는다(답 검사가 실제로 보고 있다는 확인)
      expect(readUisDay(envelope.data, '1999-01-01'), file).toBeNull()
    }
  })

  it('AC-4210.4 모아 둔 값 합치기: cached · 새 값이 바꿈 · 다른 날 버림 · 24시간 · 풀 수 없음 · 코드별 합으로 다시 셈 · 못 쓰면 번호만', () => {
    expectAc('AC-4210.4', 6)
  })

  it('AC-4210.5 코드 글자: Uisarang 폴더에 네트워크·SQL·HospitalGate·비트 부품 글자가 없다', () => {
    const files = readdirSync(UISARANG).filter((name) => name.endsWith('.cs'))
    expect(files).toEqual(expect.arrayContaining(['UisDay.cs', 'UisCodes.cs', 'UisCommands.cs', 'UisServices.cs']))
    for (const file of files) {
      const text = code(path.join(UISARANG, file))
      for (const banned of [
        'System.Net',
        'HttpClient',
        'WebClient',
        'Socket',
        'SqlConnection',
        'SqlCommand',
        'OleDb',
        'Odbc',
        'HospitalGate',
        'Precheck.Core.Bit',
        'Precheck.Core.Registration',
        'IBitDb',
        'BitServices',
        'Erp.Core.Closing',
        'ClosingCommands',
        'ClosingDay',
      ]) {
        expect(text, `${file}: ${banned}`).not.toContain(banned)
      }
    }
  })

  it('AC-4210.5 코드 글자: 새 네 파일은 디스크·환경에 직접 닿지 않는다(엑셀 폴더는 IUisFolder, 모아 둔 값은 UisCache로만)', () => {
    for (const file of NEW_FILES) {
      const text = code(file)
      expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
      for (const banned of ['System.IO', 'File.', 'Directory.', 'Environment.', 'Registry', 'Process.', 'Console.']) {
        expect(text, `${path.basename(file)}: ${banned}`).not.toContain(banned)
      }
    }
    const commands = code(path.join(UISARANG, 'UisCommands.cs'))
    expect(commands).toMatch(/public static void RegisterUisarang\(Dispatcher \w+, UisServices \w+\)/)
    expect(commands).toMatch(/public static void RegisterBitExtras\(Dispatcher \w+\)/)
    expect(code(path.join(UISARANG, 'UisDay.cs'))).toMatch(
      /public static UisDayResult Read\(IUisFolder \w+, UisCache \w+, DateTime \w+, UisArgs \w+, UisFolderKind \w+/,
    )
    expect(code(path.join(UISARANG, 'UisCodes.cs'))).toMatch(/public static UisCodesResult Read\(IUisFolder \w+\)/)
  })
})
