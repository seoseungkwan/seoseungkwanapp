// spec erp-uisarang TASK-9(REQ-4202·REQ-4210): 엑셀 폴더 다루기 UisDiskFolder와 모아 둔 값 UisCache의 C# 시험
// (helper-erp/tests/Erp.Core.Tests/Uisarang/Folder/*.test.cs, 이름 공간 Erp.Core.Tests.Uisarang.Folder — design.md 12-3)을 감싸고,
// 두 파일의 몇 가지(목록 거르기·보호 주입·파일 이름)를 파일 글자로 본다.
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'
import { runDotnet } from './runDotnet'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const UISARANG = path.join(ROOT, 'helper-erp', 'src', 'Erp.Core', 'Uisarang')
const FILTER = 'Erp.Core.Tests.Uisarang.Folder'
type Run = { code: number; output: string }
let run: Run = { code: -1, output: '' }

beforeAll(() => {
  run = runDotnet(FILTER, { timeoutMs: 280_000 })
}, 300_000)

function lines(prefix: 'Passed' | 'Failed', name: string): number {
  const escaped = name.replace(/[.()\\]/g, (c) => `\\${c}`)
  return (run.output.match(new RegExp(`^\\s*${prefix} ${escaped}`, 'gm')) ?? []).length
}

function tail(text: string): string {
  return text.split('\n').slice(-40).join('\n')
}

function expectAc(ac: string, atLeast: number) {
  expect(run.code, tail(run.output)).toBe(0)
  expect(lines('Failed', `${ac} `), tail(run.output)).toBe(0)
  expect(lines('Passed', `${ac} `), `${ac} 시험이 다 돌지 않았다\n${tail(run.output)}`).toBeGreaterThanOrEqual(atLeast)
}

function read(file: string): string {
  if (!existsSync(file)) throw new Error(`${path.relative(ROOT, file)} 파일이 없다`)
  return readFileSync(file, 'utf8').replace(/\r\n/g, '\n')
}

/** C# 글에서 // 주석을 지운다(코드 줄만 본다) */
function code(text: string): string {
  return text
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

describe('REQ-4202 엑셀 폴더 UisDiskFolder (C# Erp.Core.Tests.Uisarang.Folder)', () => {
  it('AC-4202.2 실제 임시 폴더: 없으면 만듦·.xls(대소문자 무시) 보통 파일만 이름 차례·하위 폴더/다른 확장자/연결 빼기·연결 폴더와 못 만듦은 E-UIS-FOLDER·IsOpen·Read·Delete 실패는 false', () => {
    expectAc('AC-4202.2', 13)
  })

  it('AC-4202.2: UisDiskFolder는 Erp.Core.Uisarang의 IUisFolder이고, 목록은 *.xls 무늬 찾기(짧은 이름 때문에 .xlsx도 잡힘)가 아니라 확장자 글자로 거르며 연결(ReparsePoint)을 본다', () => {
    const text = code(read(path.join(UISARANG, 'UisDiskFolder.cs')))
    expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(text).toMatch(/public sealed class UisDiskFolder : IUisFolder/)
    expect(text).toContain('"E-UIS-FOLDER"')
    expect(text).not.toContain('"*.xls"')
    expect(text).toContain('FileAttributes.ReparsePoint')
    expect(text).toContain('FileShare.None')
  })
})

describe('REQ-4210 모아 둔 값 UisCache (C# Erp.Core.Tests.Uisarang.Folder)', () => {
  it('AC-4210.4 저장소 부분: 저장·읽기·다른 날 버림·24시간 넘음·깨진 파일 null·보고서별 덮어쓰기·처방 코드별 합·숫자와 칸 이름뿐·IProtector 보호', () => {
    expectAc('AC-4210.4', 13)
  })

  it('AC-4210.4: 파일은 data\\uis-cache.bin 하나이고 IProtector로만 보호한다(DPAPI는 Erp.Helper가 넣는다 — Erp.Core는 윈도우 부품을 모른다)', () => {
    const text = code(read(path.join(UISARANG, 'UisCache.cs')))
    expect(text).toMatch(/^namespace Erp\.Core\.Uisarang;$/m)
    expect(text).toMatch(/public const string FileName = "uis-cache\.bin";/)
    expect(text).toMatch(/public UisCache\(string dataDir, IProtector protector, Func<DateTime> now\)/)
    expect(text).toContain('protector.Protect(')
    expect(text).toContain('protector.Unprotect(')
    for (const word of ['ProtectedData', 'Precheck.Windows', 'DpapiProtector', 'System.Net', 'HospitalGate']) {
      expect(text, word).not.toContain(word)
    }
  })
})
