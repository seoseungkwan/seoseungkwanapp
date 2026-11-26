import { fileURLToPath } from 'node:url'
import { ESLint } from 'eslint'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { readUisFile } from '@/lib/parsers/uisarang/readFile'
import { bookBytes, FAKE_TEXTS, incomeRows, patientRows, rsvPatientRows, rxRows, TODAY, visitsRows } from '@/lib/parsers/uisarang/testBooks'
import { readUisFiles } from './readUisFiles'

// Worker 안의 묶음 읽기(design.md §2·§5). 파일 이름은 받지 않는다 — 차례로만 가른다

const SLOW = { timeout: 60_000 }
const books = () => [
  bookBytes(incomeRows()),
  bookBytes(rxRows()),
  bookBytes(visitsRows()),
  bookBytes(patientRows()),
  bookBytes(rsvPatientRows()),
  new TextEncoder().encode('이름,금액\n가,1'),
]

afterEach(() => {
  vi.doUnmock('@/lib/parsers/uisarang/readFile')
  vi.resetModules()
})

describe('AC-8807.1 파일 차례 그대로 파일마다 결과', () => {
  it('AC-8807.1: 넷 + 예약 + 모르는 엑셀 → 같은 차례 · 하나씩 읽은 것과 같다', () => {
    const results = readUisFiles(books(), TODAY)
    expect(results.map((r) => (r.status === 'read' ? r.read.kind : r.status === 'skipped' ? `skipped:${r.kind}` : `refused:${r.code}`))).toEqual([
      'income',
      'rx',
      'visits',
      'visitPatients',
      'skipped:rsvPatients',
      'refused:E-UIS-KIND',
    ])
    expect(results).toStrictEqual(books().map((bytes) => readUisFile(bytes, TODAY)))
  })

  it('AC-8807.1: 화면이 바이트를 꺼내지 못한 자리는 그 번호로 받지 않음(차례 그대로)', () => {
    const results = readUisFiles(['E-UIS-TOO-BIG', bookBytes(incomeRows()), 'E-UIS-UNREADABLE'], TODAY)
    expect(results[0]).toStrictEqual({ status: 'refused', code: 'E-UIS-TOO-BIG', kind: null, span: null })
    expect(results[1].status).toBe('read')
    expect(results[2]).toStrictEqual({ status: 'refused', code: 'E-UIS-UNREADABLE', kind: null, span: null })
  })

  it('AC-8807.1: 빈 묶음 → 빈 목록', () => {
    expect(readUisFiles([], TODAY)).toEqual([])
  })

  it('AC-8807.1: 오늘 날짜가 날짜가 아니면 던진다(Worker가 번호만 보낸다)', () => {
    expect(() => readUisFiles([bookBytes(incomeRows())], '비밀-글자')).toThrow(RangeError)
  })
})

describe('AC-8807.2 묶음 — 같은 엑셀 두 번', () => {
  it('AC-8807.2: 같은 일일수입통계 둘 → 첫 파일 read, 둘째 건너뜀(같은 엑셀)', () => {
    const results = readUisFiles([bookBytes(incomeRows()), bookBytes(incomeRows(), 'xlsx')], TODAY)
    expect(results[0].status).toBe('read')
    expect(results[1]).toStrictEqual({ status: 'skipped', why: 'same', kind: 'income', span: { from: '2026-11-02', to: '2026-11-02', unit: 'day' } })
  })

  it('AC-8807.2: 같은 날 숫자가 다른 둘 → 모두 E-UIS-TWICE', () => {
    const results = readUisFiles([bookBytes(incomeRows()), bookBytes(incomeRows({ total: { 카드수납액: 400_001, 진료수납액: 551_661 } }))], TODAY)
    expect(results.map((r) => r.status === 'refused' && r.code)).toEqual(['E-UIS-TWICE', 'E-UIS-TWICE'])
  })
})

describe('AC-8807.4 파일 하나가 예외를 내도 그 파일만 E-UIS-UNREADABLE', () => {
  it('AC-8807.4: 나머지는 계속 읽고, 예외 글은 결과에 없다', async () => {
    vi.resetModules()
    vi.doMock('@/lib/parsers/uisarang/readFile', async (importOriginal) => {
      const original = await importOriginal<typeof import('@/lib/parsers/uisarang/readFile')>()
      return {
        ...original,
        readUisFile: (bytes: Uint8Array, today: string) => {
          if (bytes[0] === 0xee) throw new Error('터짐: 홍길동 900101-1234567')
          return original.readUisFile(bytes, today)
        },
      }
    })
    const { readUisFiles: readWithMock } = await import('./readUisFiles')
    const results = readWithMock([bookBytes(incomeRows()), new Uint8Array([0xee, 1, 2]), bookBytes(rxRows())], TODAY)
    expect(results[0].status).toBe('read')
    expect(results[1]).toStrictEqual({ status: 'refused', code: 'E-UIS-UNREADABLE', kind: null, span: null })
    expect(results[2].status).toBe('read')
    expect(JSON.stringify(results)).not.toContain('터짐')
  })
})

describe('AC-8807.5 답에 환자 글자가 없다(숫자·종류·기간·처방 코드·처방명칭뿐)', () => {
  it('AC-8807.5: 가짜 이름·차트번호·주민번호·전화·주소·보험구분·진료실 글자가 하나도 없다', () => {
    const json = JSON.stringify(readUisFiles(books(), TODAY))
    for (const text of FAKE_TEXTS) expect(json).not.toContain(text)
    expect(json).toContain('ESWT 1부위') // 처방 코드·처방명칭은 있다
  })
})

describe('AC-8815.1 새 파일이 환자 자료 구역 울타리 안', SLOW, () => {
  const root = fileURLToPath(new URL('../..', import.meta.url))
  const FILES = ['src/lib/parsers/uisarang/*.ts', 'src/workers/uisarang.worker.ts', 'src/workers/readUisFiles*.ts', 'src/workers/runUisarang*.ts']

  it('AC-8815.1: eslint 오류 없음 · 그 자리에 네트워크·console·저장소·React·supabase 울타리가 걸려 있다', async () => {
    const eslint = new ESLint({ cwd: root })
    const results = await eslint.lintFiles(FILES)
    expect(results.length).toBeGreaterThanOrEqual(15)
    expect(results.flatMap((r) => r.messages.filter((m) => m.severity === 2).map((m) => `${r.filePath}: ${m.ruleId}`))).toEqual([])
    const probes: Array<[string, string]> = [
      ["fetch('x')", 'no-restricted-globals'],
      ['console.log(1)', 'no-console'],
      ['localStorage.setItem("a", "b")', 'no-restricted-globals'],
      ["import React from 'react'", 'no-restricted-imports'],
      ["import x from '@/lib/supabase/browser'", 'no-restricted-imports'],
    ]
    for (const filePath of ['src/lib/parsers/uisarang/probe.ts', 'src/workers/uisarang.probe.ts', 'src/workers/runUisarang.probe.ts']) {
      for (const [code, rule] of probes) {
        const [result] = await eslint.lintText(code, { filePath })
        expect(result.messages.filter((m) => m.severity === 2).map((m) => m.ruleId)).toContain(rule)
      }
    }
  })
})
